import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BarChart3, Plus, PhoneCall, Settings, Users } from "lucide-react";
import { T, tint } from "./theme.js";
import { initialsFor } from "./lib/analytics.js";
import { isoDaysFromNow, todayIso } from "./lib/dates.js";
import * as storage from "./lib/storage.js";
import { clearPin, loadPin, savePin } from "./lib/pin.js";
import { clampWeeks, loadSettings, saveSettings } from "./lib/settings.js";
import { currentWeekIndex } from "./lib/weeks.js";
import { useLayout } from "./lib/layout.js";
import { actionAoA, applyActions, customerAoA, loadSeedData, nextCustomerId, reminderAoA, repAoA, tierAoA } from "./lib/dataSource.js";
import { applyReps, repById } from "./lib/reps.js";
import { applyTiers, moveTier, reRankTiers, tierById } from "./lib/tiers.js";
// The generic names, because `useListActions` serves both lists — calling a
// rep comparison `tierKey` would read as a bug to the next person.
import { listKey, nextListId } from "./lib/lookups.js";
import { hasVisit } from "./lib/visits.js";
import { changeFor, isConfigured, isSeeded, loadSheetConfig, markSeeded, readAll, replaceTab, saveSheetConfig } from "./lib/sheets.js";
import { enqueue, flush, fromSheet, loadOutbox, saveOutbox, syncNow } from "./lib/sync.js";

import StaffHome from "./screens/StaffHome.jsx";
import PinGate from "./screens/PinGate.jsx";
import FollowUps from "./screens/FollowUps.jsx";
import CustomersScreen from "./screens/CustomersScreen.jsx";
import CustomerDetail from "./screens/CustomerDetail.jsx";
import AddCustomer from "./screens/AddCustomer.jsx";
import EditCustomer from "./screens/EditCustomer.jsx";
import DataScreen from "./screens/DataScreen.jsx";
import Reports from "./screens/Reports.jsx";
import { AddReminderSheet, EditReminderSheet, LogVisitSheet } from "./components/sheets.jsx";
import { CalledSheet, SnoozeSheet } from "./components/followUpSheets.jsx";
import ChangePinSheet from "./components/ChangePinSheet.jsx";
import UndoToast from "./components/UndoToast.jsx";

// Date.now() alone repeats when two records are created in the same tick.
let uidCounter = 0;
const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${uidCounter++}`;

// How far back a burst of mis-taps can be unwound, and how long the offer lasts.
const UNDO_DEPTH = 12;
const UNDO_WINDOW_MS = 8000;

const OWNER_TABS = [
  { key: "followups", icon: PhoneCall, label: "Follow-ups" },
  { key: "customers", icon: Users, label: "Customers" },
  { key: "add", icon: Plus, label: "Add" },
  { key: "reports", icon: BarChart3, label: "Reports" },
  { key: "data", icon: Settings, label: "Settings" },
];

export default function App() {
  const layout = useLayout();
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [loadError, setLoadError] = useState(null);
  // `people` holds everything about a customer except their visits; `actions`
  // is the log those visits are derived from. Keeping them apart means a tap
  // appends one row rather than rewriting a customer record.
  const [people, setPeople] = useState([]);
  const [actions, setActions] = useState([]);
  const [reminders, setReminders] = useState([]);
  // The marketing representatives the owner maintains. A customer stores the
  // rep's id; the name is resolved from here so renaming one renames it
  // everywhere rather than leaving stale copies on sixty customer rows.
  const [reps, setReps] = useState([]);
  // How important each customer is. Ordered by the owner; the app only reads
  // the order, and only ever to break a tie on the call list.
  const [tiers, setTiers] = useState([]);
  const [source, setSource] = useState(null);
  const customers = useMemo(
    () => applyTiers(applyReps(applyActions(people, actions), reps), tiers),
    [people, actions, reps, tiers]
  );
  // Read inside callbacks that must not re-create on every edit.
  const peopleRef = useRef(people);
  peopleRef.current = people;

  // Google Sheet connection, plus the queue of changes it has not been told about.
  const [sheetConfig, setSheetConfig] = useState(loadSheetConfig);
  const [outbox, setOutbox] = useState(loadOutbox);
  const [sync, setSync] = useState({ state: "idle", at: null, error: null, seeded: false });
  const outboxRef = useRef(outbox);
  outboxRef.current = outbox;

  const [mode, setMode] = useState("staff"); // staff | pin | owner
  const [ownerTab, setOwnerTab] = useState("followups");
  const [activeCustomerId, setActiveCustomerId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [justLogged, setJustLogged] = useState(null);
  // A stack, not a single slot: mis-taps on a wall of faces come in bursts,
  // and undoing only the last one would strand the rest.
  const [pending, setPending] = useState([]);
  const [notice, setNotice] = useState(null);
  const [visitSheetFor, setVisitSheetFor] = useState(null);
  const [calledSheetFor, setCalledSheetFor] = useState(null);
  const [snoozeSheetFor, setSnoozeSheetFor] = useState(null);
  const [reminderSheetOpen, setReminderSheetOpen] = useState(false);
  const [editReminderFor, setEditReminderFor] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [changePinOpen, setChangePinOpen] = useState(false);

  // The PIN in force on this device: one set in the app wins over the build's.
  const [ownerPin, setOwnerPin] = useState(() => loadPin(import.meta.env.VITE_OWNER_PIN));

  // Restock policy: the cadence used for anyone without one of their own.
  const [settings, setSettings] = useState(loadSettings);

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => {
      const next = {
        defaultIntervalWeeks: clampWeeks(patch.defaultIntervalWeeks ?? prev.defaultIntervalWeeks),
      };
      saveSettings(next);
      return next;
    });
  }, []);

  const changePin = useCallback((next) => {
    const stored = savePin(next);
    setOwnerPin(next);
    return stored;
  }, []);

  const resetPin = useCallback(() => {
    clearPin();
    setOwnerPin(loadPin(import.meta.env.VITE_OWNER_PIN));
  }, []);

  /* ---- loading, and keeping in step with the sheet ---- */

  const queue = useCallback((changes) => {
    setOutbox((prev) => {
      const next = enqueue(prev, changes);
      saveOutbox(next);
      return next;
    });
  }, []);

  const adopt = useCallback((data) => {
    setPeople(data.customers.map(({ visits, ...rest }) => rest));
    setActions(data.actions);
    setReminders(data.reminders);
    setReps(data.reps || []);
    setTiers(data.tiers || []);
  }, []);

  const applySeed = useCallback(async () => {
    const data = await loadSeedData();
    adopt(data);
    setSource({ kind: "seed", label: "customers.csv", at: todayIso() });
    storage.save(data.customers, data.actions, data.reminders, data.reps, data.tiers);
    return data;
  }, [adopt]);

  /**
   * Push anything pending, then pull the sheet. Runs on open and whenever the
   * app comes back to the foreground, so what is on screen is what the sheet
   * says. Failing is not fatal — the device copy carries on and the outbox
   * keeps the unsent work for the next attempt.
   */
  const refresh = useCallback(
    async ({ quiet = false } = {}) => {
      if (!isConfigured(sheetConfig)) return;
      if (!quiet) setSync((s0) => ({ ...s0, state: "syncing", error: null }));
      try {
        const seeded = isSeeded(sheetConfig);

        // Before the first upload the sheet is not authoritative. Read it, but
        // do not push to it and do not let it replace what is on the device —
        // one change trickling up would leave the sheet holding a single
        // customer, which the next read would then adopt over the whole book.
        if (!seeded) {
          const data = fromSheet(await readAll(sheetConfig));
          if (!data.customers.length) {
            setSync({
              state: "empty",
              at: new Date().toISOString(),
              error: "The sheet is empty. Upload this device's list to fill it.",
            });
            return;
          }
          // It already has data, so this device is joining an existing book.
          adopt(data);
          markSeeded(sheetConfig);
          setSource({ kind: "sheet", label: "Google Sheet", at: todayIso() });
          storage.save(data.customers, data.actions, data.reminders, data.reps, data.tiers);
          setSync({
            state: "idle",
            at: new Date().toISOString(),
            error: null,
            seeded: true,
            scriptOutdated: !data.hasRepsTab || !data.hasTiersTab,
          });
          return;
        }

        const data = await syncNow(sheetConfig, outboxRef.current);
        adopt(data);
        setOutbox(data.outbox);
        saveOutbox(data.outbox);
        setSource({ kind: "sheet", label: "Google Sheet", at: todayIso() });
        storage.save(data.customers, data.actions, data.reminders, data.reps, data.tiers);
        setSync({
          state: "idle",
          at: new Date().toISOString(),
          error: null,
          seeded: true,
          scriptOutdated: !data.hasRepsTab || !data.hasTiersTab,
        });
      } catch (err) {
        setSync((s0) => ({ ...s0, state: "error", error: err.message }));
      }
    },
    [sheetConfig, adopt]
  );

  /**
   * Sends queued changes shortly after they are made. A tap must not wait for
   * the network, but it must not sit in the queue until the app happens to
   * lose focus either — which is what it did before this existed.
   */
  useEffect(() => {
    if (!outbox.length || !isConfigured(sheetConfig) || !isSeeded(sheetConfig)) return undefined;
    const timer = setTimeout(async () => {
      try {
        const remaining = await flush(sheetConfig, outboxRef.current);
        setOutbox(remaining);
        saveOutbox(remaining);
        setSync({ state: "idle", at: new Date().toISOString(), error: null });
      } catch (err) {
        // Stays queued; the next change, focus or Sync will try again.
        setSync((s0) => ({ ...s0, state: "error", error: err.message }));
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [outbox, sheetConfig]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Show something immediately: the device copy, else the shipped CSVs.
      const saved = storage.loadSaved();
      if (saved) {
        if (cancelled) return;
        adopt(saved);
        setSource(storage.loadSource());
        setStatus("ready");
      } else {
        try {
          await applySeed();
          if (!cancelled) setStatus("ready");
        } catch (err) {
          if (!cancelled) {
            setLoadError(err.message);
            setStatus("error");
          }
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Deliberately once on mount; later refreshes are driven by focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Sync whenever the connected sheet changes — including the moment one is
   * first saved. Without this, connecting a sheet did nothing until the app
   * happened to lose focus: no read, so it never became the source of truth,
   * so the outbox stayed gated and writes never left the device.
   */
  useEffect(() => {
    if (!isConfigured(sheetConfig)) return;
    refresh({ quiet: true });
  }, [sheetConfig.url, sheetConfig.secret, refresh]);

  // "Latest data every time the user views the UI" — re-read on return.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh({ quiet: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [refresh]);

  // The offer expires together; each new tap or undo restarts the window.
  useEffect(() => {
    if (!pending.length && !notice) return undefined;
    const timer = setTimeout(() => {
      setPending([]);
      setNotice(null);
    }, UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [pending, notice]);

  // Every change is written straight through, so a reload never loses a visit
  // even before the sheet has been told about it.
  useEffect(() => {
    if (status === "ready") storage.save(customers, actions, reminders, reps, tiers);
  }, [customers, actions, reminders, reps, tiers, status]);

  /* ---- mutations: apply locally, queue for the sheet ---- */

  /** Edits a customer record and sends the whole row up. */
  const patchPerson = useCallback(
    (id, patch) => {
      setPeople((ps) =>
        ps.map((person) => {
          if (person.id !== id) return person;
          const next = { ...person, ...patch };
          queue([changeFor.customer(next)]);
          return next;
        })
      );
    },
    [queue]
  );

  /**
   * Records a visit on a given day. Takes the date itself rather than a count
   * of days ago: the staff screen asks "when did they come in?", and nobody
   * holds the answer to that as a number.
   */
  const logVisit = (id, date = todayIso()) => {
    const customer = customers.find((c) => c.id === id);
    if (!customer) return;

    // A second tap on the same day changes nothing, so there is nothing to
    // undo — offering undo there would delete the first, genuine visit.
    if (hasVisit(customer, date)) {
      setNotice({ key: uid("n"), name: customer.name });
    } else {
      const action = { actionId: uid("act"), customerId: id, date, isLogged: true, loggedAt: new Date().toISOString() };
      setActions((as) => [...as, action]);
      queue([changeFor.action(action)]);
      setNotice(null);
      setPending((p) => [...p, { key: uid("u"), actionId: action.actionId, name: customer.name }].slice(-UNDO_DEPTH));
    }

    setJustLogged(id);
    setTimeout(() => setJustLogged(null), 900);
  };

  /**
   * Undo and delete both flip `is_logged` rather than dropping the row, so the
   * sheet keeps a record that the tap happened and was taken back.
   */
  const retractAction = useCallback(
    (actionId) => {
      setActions((as) =>
        as.map((a) => {
          if (a.actionId !== actionId || !a.isLogged) return a;
          const next = { ...a, isLogged: false };
          queue([changeFor.action(next)]);
          return next;
        })
      );
    },
    [queue]
  );

  /** Steps back one tap at a time, newest first, so a burst unwinds in order. */
  const undoVisit = () => {
    const last = pending[pending.length - 1];
    if (!last) return;
    retractAction(last.actionId);
    setPending((p) => p.slice(0, -1));
    setNotice(null);
  };

  /** Owner-only: remove a visit that should never have been recorded. */
  const deleteVisit = (customerId, date) => {
    const match = actions.find((a) => a.customerId === customerId && a.date === date && a.isLogged);
    if (!match) return;
    retractAction(match.actionId);
    setPending((p) => p.filter((e) => e.actionId !== match.actionId));
  };

  /** "I rang them, and this is what they said." Clears any snooze. */
  const markCalled = (id, reason, note) =>
    patchPerson(id, { contact: { on: todayIso(), reason, note }, snoozedUntil: null, snoozedUntilWeek: null });

  /** Out of sight for a set number of trading weeks. */
  const snooze = (id, weeks) => {
    const until = currentWeekIndex() + weeks;
    patchPerson(id, { snoozedUntilWeek: until, snoozedUntil: isoDaysFromNow(weeks * 7) });
  };

  const unsnooze = (id) => patchPerson(id, { snoozedUntilWeek: null, snoozedUntil: null });

  const nameOfCustomer = useCallback(
    (customerId) => peopleRef.current.find((c) => c.id === customerId)?.name || "",
    []
  );

  const addReminder = (customerId, dueInDays, note) => {
    const reminder = { id: uid("rem"), customerId, dueOn: isoDaysFromNow(dueInDays), note, isDone: false };
    setReminders((rs) => [...rs, reminder]);
    queue([changeFor.reminder(reminder, nameOfCustomer(customerId))]);
  };

  /** Edits a reminder and sends the whole row up, the way `patchPerson` does. */
  const patchReminder = useCallback(
    (id, patch) => {
      setReminders((rs) =>
        rs.map((reminder) => {
          if (reminder.id !== id) return reminder;
          const next = { ...reminder, ...patch };
          queue([changeFor.reminder(next, nameOfCustomer(next.customerId))]);
          return next;
        })
      );
    },
    [queue, nameOfCustomer]
  );

  const updateReminder = (id, { dueOn, note }) => patchReminder(id, { dueOn, note });

  /**
   * Ticking one off marks it done rather than removing it — the Reminders
   * screen keeps the history of what was followed up and when, and it can be
   * put back if it was ticked by mistake.
   */
  const dismissReminder = (id) => patchReminder(id, { isDone: true });
  const restoreReminder = (id) => patchReminder(id, { isDone: false });

  /**
   * For a reminder that should never have been set. The sheet keeps the row;
   * blanking the due date is what marks it gone, since a reminder with no date
   * is dropped on the next read.
   */
  const deleteReminder = (id) => {
    const reminder = reminders.find((r) => r.id === id);
    setReminders((rs) => rs.filter((r) => r.id !== id));
    if (reminder) queue([changeFor.reminder({ ...reminder, dueOn: "" }, nameOfCustomer(reminder.customerId))]);
  };

  const addCustomer = ({ name, phone, company, repId, tierId, visitEveryWeeks, visitedToday }) => {
    const person = {
      id: nextCustomerId(people),
      name,
      phone,
      company: company || "",
      repId: repId || null,
      repName: repById(reps, repId)?.name || "",
      tierId: tierId || null,
      tierName: tierById(tiers, tierId)?.name || "",
      initials: initialsFor(name),
      visitEveryWeeks: visitEveryWeeks ?? null,
      contact: null,
      snoozedUntilWeek: null,
    };
    setPeople((ps) => [...ps, person]);
    const changes = [changeFor.customer(person)];

    if (visitedToday) {
      const action = { actionId: uid("act"), customerId: person.id, date: todayIso(), isLogged: true, loggedAt: new Date().toISOString() };
      setActions((as) => [...as, action]);
      changes.push(changeFor.action(action));
    }
    queue(changes);
  };

  /**
   * Owner-side profile edit. A changed name re-derives the initials unless the
   * owner has set their own, and a changed rep carries the name along so the
   * sheet row stays readable to a human.
   */
  const updateCustomer = (id, patch) => {
    const next = { ...patch };
    if (next.repId !== undefined) next.repName = repById(reps, next.repId)?.name || "";
    if (next.tierId !== undefined) next.tierName = tierById(tiers, next.tierId)?.name || "";
    if (next.name !== undefined && next.initials === undefined) {
      const person = peopleRef.current.find((c) => c.id === id);
      // Only follow the name if the initials were never set by hand.
      if (person && person.initials === initialsFor(person.name)) next.initials = initialsFor(next.name);
    }
    patchPerson(id, next);
  };

  /**
   * Applies a bulk import that the owner has already seen and confirmed.
   *
   * Order matters: any rep or tier the file introduces has to exist before a
   * customer can point at it, so the lists are built first and everything else
   * is resolved against the result. All of it lands in one pass so the screen
   * updates once rather than flickering through sixty intermediate states.
   */
  const applyCustomerImport = useCallback(
    (plan) => {
      const changes = [];

      // 1. New reps and tiers, appended to the lists as they stand.
      let nextReps = [...reps];
      for (const name of plan.newReps) {
        const rep = { id: nextListId(nextReps), name, isActive: true };
        nextReps.push(rep);
        changes.push(changeFor.rep(rep));
      }
      let nextTiers = [...tiers];
      for (const name of plan.newTiers) {
        // A tier the file invented goes last in the order: the owner ranks
        // their tiers deliberately, and a spreadsheet does not get a say.
        const tier = { id: nextListId(nextTiers), name, isActive: true, rank: nextTiers.length + 1 };
        nextTiers.push(tier);
        changes.push(changeFor.tier(tier));
      }
      nextTiers = reRankTiers(nextTiers);

      const repIdFor = (name) => nextReps.find((r) => listKey(r.name) === listKey(name)) || null;
      const tierIdFor = (name) => nextTiers.find((t) => listKey(t.name) === listKey(name)) || null;

      // 2. The customers themselves, added and patched in one pass.
      setPeople((prev) => {
        const updates = new Map(plan.updates.map((u) => [u.id, u]));
        let next = prev.map((person) => {
          const update = updates.get(person.id);
          if (!update) return person;
          const patch = { ...update.patch };
          if ("repName" in patch) {
            const rep = repIdFor(patch.repName);
            patch.repId = rep ? rep.id : null;
            patch.repName = rep ? rep.name : "";
          }
          if ("tierName" in patch) {
            const tier = tierIdFor(patch.tierName);
            patch.tierId = tier ? tier.id : null;
            patch.tierName = tier ? tier.name : "";
          }
          const merged = { ...person, ...patch };
          changes.push(changeFor.customer(merged));
          return merged;
        });

        for (const row of plan.adds) {
          const rep = repIdFor(row.repName);
          const tier = tierIdFor(row.tierName);
          const person = {
            // Ids come off the growing list, so a batch cannot collide inside itself.
            id: nextCustomerId(next),
            name: row.name,
            phone: row.phone || "",
            company: row.company || "",
            repId: rep ? rep.id : null,
            repName: rep ? rep.name : "",
            tierId: tier ? tier.id : null,
            tierName: tier ? tier.name : "",
            initials: initialsFor(row.name),
            visitEveryWeeks: row.visitEveryWeeks ?? null,
            contact: null,
            snoozedUntilWeek: null,
          };
          next = [...next, person];
          changes.push(changeFor.customer(person));
        }
        return next;
      });

      setReps(nextReps);
      setTiers(nextTiers);
      queue(changes);
      return { added: plan.adds.length, updated: plan.updates.length };
    },
    [reps, tiers, queue]
  );

  /* ---- the owner's short lists: representatives and tiers ---- */

  const repActions = useListActions({
    entries: reps,
    setEntries: setReps,
    keys: { idKey: "repId", nameKey: "repName" },
    changeOf: changeFor.rep,
    noun: "representative",
    queue,
    setPeople,
    peopleRef,
  });

  const tierActions = useListActions({
    entries: tiers,
    setEntries: setTiers,
    keys: { idKey: "tierId", nameKey: "tierName" },
    changeOf: changeFor.tier,
    noun: "tier",
    ranked: true,
    queue,
    setPeople,
    peopleRef,
  });

  const deleteCustomer = (id) => {
    setPeople((ps) => ps.filter((c) => c.id !== id));
    setReminders((rs) => rs.filter((r) => r.customerId !== id));
    // The sheet keeps the row; blanking the name is what marks it gone.
    const person = people.find((c) => c.id === id);
    if (person) queue([changeFor.customer({ ...person, name: "" })]);
  };

  /**
   * Swaps the whole book for one read out of a file. Also the restore path:
   * a backup carries its settings in a `meta` tab, and putting those back is
   * what makes it a restore rather than an import.
   */
  const replaceData = (data, src) => {
    const stamped = { ...src, at: todayIso() };
    adopt({
      customers: data.customers,
      actions: data.actions || [],
      reminders: data.reminders,
      reps: data.reps || [],
      tiers: data.tiers || [],
    });
    if (data.meta?.settings) updateSettings(data.meta.settings);
    setSource(stamped);
    storage.saveSource(stamped);
    setDetailOpen(false);
    setEditingCustomer(false);
    setActiveCustomerId(null);
  };

  const reloadSeed = async () => {
    storage.clearSaved();
    setDetailOpen(false);
    setActiveCustomerId(null);
    await applySeed();
  };

  /**
   * Sends the whole device book up, replacing whatever the sheet holds. Used
   * once when first connecting an empty sheet; it is destructive on the sheet
   * side, so the caller confirms first.
   */
  const uploadEverything = useCallback(
    async (onProgress) => {
      await replaceTab(sheetConfig, "customers", customerAoA(customers), onProgress);
      await replaceTab(sheetConfig, "actions", actionAoA(actions), onProgress);
      await replaceTab(sheetConfig, "reminders", reminderAoA(reminders, customers), onProgress);
      await replaceTab(sheetConfig, "reps", repAoA(reps), onProgress);
      await replaceTab(sheetConfig, "tiers", tierAoA(tiers), onProgress);
      // Everything is now up there, so anything queued is redundant.
      setOutbox([]);
      saveOutbox([]);
      markSeeded(sheetConfig); // the sheet is now authoritative
      setSync({ state: "idle", at: new Date().toISOString(), error: null, seeded: true });
      setSource({ kind: "sheet", label: "Google Sheet", at: todayIso() });
    },
    [sheetConfig, customers, actions, reminders, reps, tiers]
  );

  const openCustomer = (c) => {
    setActiveCustomerId(c.id);
    setDetailOpen(true);
    setEditingCustomer(false); // never open straight into the edit form
  };

  const activeCustomer = customers.find((c) => c.id === activeCustomerId);

  /* ---- render ---- */

  if (status !== "ready") {
    return (
      <Shell layout={layout}>
        <div style={{ padding: "80px 24px", textAlign: "center", fontFamily: "'DM Sans', sans-serif", color: T.textDim, fontSize: 14, lineHeight: 1.6 }}>
          {status === "loading" ? (
            "Loading customer list…"
          ) : (
            <>
              <div style={{ color: T.red, fontWeight: 700, marginBottom: 8 }}>Couldn't load the customer list</div>
              {loadError}
              <div style={{ marginTop: 16, fontSize: 12 }}>
                Check that <code style={{ color: T.gold }}>public/data/customers.csv</code> exists and is reachable.
              </div>
            </>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell layout={layout}>
      <div style={{ height: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {mode === "staff" && (
          <StaffHome
            customers={customers}
            settings={settings}
            logVisit={logVisit}
            justLogged={justLogged}
            openSheet={setVisitSheetFor}
            requestOwnerMode={() => setMode("pin")}
          />
        )}

        {mode === "pin" && (
          <PinGate
            back={() => setMode("staff")}
            unlock={() => {
              setMode("owner");
              setDetailOpen(false);
            }}
            expectedPin={ownerPin}
          />
        )}

        {mode === "owner" && detailOpen && activeCustomer && !editingCustomer && (
          <CustomerDetail
            customer={activeCustomer}
            settings={settings}
            back={() => setDetailOpen(false)}
            openCalled={setCalledSheetFor}
            deleteCustomer={deleteCustomer}
            updateCustomer={updateCustomer}
            openEdit={() => setEditingCustomer(true)}
          />
        )}

        {mode === "owner" && detailOpen && activeCustomer && editingCustomer && (
          <EditCustomer
            customer={activeCustomer}
            reps={reps}
            tiers={tiers}
            settings={settings}
            existingNames={customers.filter((c) => c.id !== activeCustomer.id).map((c) => c.name)}
            back={() => setEditingCustomer(false)}
            save={(patch) => {
              updateCustomer(activeCustomer.id, patch);
              setEditingCustomer(false);
            }}
          />
        )}

        {mode === "owner" && !detailOpen && (
          <>
            <OwnerHeader onExit={() => setMode("staff")} />
            {ownerTab === "followups" && (
              <FollowUps
                customers={customers}
                reminders={reminders}
                settings={settings}
                tiers={tiers}
                openCustomer={openCustomer}
                dismissReminder={dismissReminder}
                restoreReminder={restoreReminder}
                deleteReminder={deleteReminder}
                openEditReminder={setEditReminderFor}
                openAddReminder={() => setReminderSheetOpen(true)}
                openCalled={setCalledSheetFor}
                openSnooze={setSnoozeSheetFor}
                unsnooze={unsnooze}
              />
            )}
            {ownerTab === "customers" && (
              <CustomersScreen
                customers={customers}
                reps={reps}
                tiers={tiers}
                reminders={reminders}
                settings={settings}
                openCustomer={openCustomer}
              />
            )}
            {ownerTab === "add" && (
              <AddCustomer
                addCustomer={addCustomer}
                reps={reps}
                tiers={tiers}
                existingNames={customers.map((c) => c.name)}
                defaultCadence={settings.defaultIntervalWeeks}
              />
            )}
            {ownerTab === "reports" && (
              <Reports customers={customers} deleteVisit={deleteVisit} openCustomer={openCustomer} />
            )}
            {ownerTab === "data" && (
              <DataScreen
                customers={customers}
                actions={actions}
                reminders={reminders}
                reps={reps}
                repActions={repActions}
                tiers={tiers}
                tierActions={tierActions}
                customersForImport={people}
                applyCustomerImport={applyCustomerImport}
                replaceData={replaceData}
                reloadSeed={reloadSeed}
                source={source}
                ownerPin={ownerPin}
                openChangePin={() => setChangePinOpen(true)}
                resetPin={resetPin}
                settings={settings}
                updateSettings={updateSettings}
                sheetConfig={sheetConfig}
                saveSheet={(next) => {
                  saveSheetConfig(next);
                  setSheetConfig(next);
                }}
                sync={sync}
                outboxCount={outbox.length}
                onRefresh={() => refresh()}
                onUpload={uploadEverything}
                counts={{
                  customers: customers.length,
                  actions: actions.length,
                  reminders: reminders.length,
                  reps: reps.length,
                  tiers: tiers.length,
                }}
              />
            )}
          </>
        )}
      </div>

      {visitSheetFor && <LogVisitSheet customer={visitSheetFor} close={() => setVisitSheetFor(null)} logVisit={logVisit} />}
      {calledSheetFor && (
        <CalledSheet customer={calledSheetFor} close={() => setCalledSheetFor(null)} markCalled={markCalled} />
      )}
      {snoozeSheetFor && (
        <SnoozeSheet customer={snoozeSheetFor} close={() => setSnoozeSheetFor(null)} snooze={snooze} />
      )}
      {reminderSheetOpen && (
        <AddReminderSheet customers={customers} close={() => setReminderSheetOpen(false)} addReminder={addReminder} />
      )}
      {editReminderFor && (
        <EditReminderSheet
          reminder={editReminderFor}
          customer={customers.find((c) => c.id === editReminderFor.customerId)}
          close={() => setEditReminderFor(null)}
          save={(patch) => updateReminder(editReminderFor.id, patch)}
        />
      )}
      {changePinOpen && (
        <ChangePinSheet close={() => setChangePinOpen(false)} currentPin={ownerPin} changePin={changePin} />
      )}

      <UndoToast
        pending={pending}
        notice={notice}
        onUndo={undoVisit}
        bottomOffset={mode === "owner" && !detailOpen ? 92 : 20}
      />

      {mode === "owner" && !detailOpen && <OwnerNav tab={ownerTab} setTab={setOwnerTab} />}
    </Shell>
  );
}


/**
 * Add / rename / remove / reassign for one of the owner's short lists.
 *
 * Representatives and tiers are the same kind of thing — a handful of named
 * entries that customers point at by id — so they get the same behaviours from
 * one place rather than two near-identical copies that drift apart. Tiers add
 * ordering on top; `ranked` is the only difference between the two callers.
 */
function useListActions({ entries, setEntries, keys, changeOf, noun, ranked = false, queue, setPeople, peopleRef }) {
  const { idKey, nameKey } = keys;
  const countOf = (id) => peopleRef.current.filter((c) => c[idKey] === id).length;

  /** Renumbers after any change that alters which entries are active. */
  const settle = (next) => (ranked ? reRankTiers(next) : next);

  /** Everything whose rank moved has to go up as well, not just the one edited. */
  const queueAll = (before, after) => {
    const was = new Map(before.map((e) => [e.id, e]));
    const changed = after.filter((e) => {
      const old = was.get(e.id);
      return !old || old.name !== e.name || old.isActive !== e.isActive || old.rank !== e.rank;
    });
    if (changed.length) queue(changed.map(changeOf));
  };

  /** Returns an error message, or null when it worked. */
  const add = (name) => {
    const trimmed = String(name || "").trim();
    if (!trimmed) return `Give the ${noun} a name.`;
    if (entries.some((e) => listKey(e.name) === listKey(trimmed) && e.isActive)) {
      return `${trimmed} is already on the list.`;
    }
    // Re-adding something removed brings its old row back rather than making a
    // second one, so the customers it had stay attached.
    const retired = entries.find((e) => listKey(e.name) === listKey(trimmed));
    const entry = retired
      ? { ...retired, isActive: true }
      : { id: nextListId(entries), name: trimmed, isActive: true };
    const next = settle(retired ? entries.map((e) => (e.id === entry.id ? entry : e)) : [...entries, entry]);
    setEntries(next);
    queueAll(entries, next);
    return null;
  };

  /**
   * Renaming rewrites the name denormalised onto every customer pointing at
   * it. The id is the join, so nothing would break without this — but the
   * sheet would read as the old name, which is the point of keeping it there.
   */
  const rename = (id, name) => {
    const trimmed = String(name || "").trim();
    if (!trimmed) return `Give the ${noun} a name.`;
    if (entries.some((e) => e.id !== id && listKey(e.name) === listKey(trimmed) && e.isActive)) {
      return `${trimmed} is already on the list.`;
    }
    const entry = entries.find((e) => e.id === id);
    if (!entry || entry.name === trimmed) return null;

    const next = entries.map((e) => (e.id === id ? { ...e, name: trimmed } : e));
    setEntries(next);

    const touched = peopleRef.current.filter((c) => c[idKey] === id);
    setPeople((ps) => ps.map((c) => (c[idKey] === id ? { ...c, [nameKey]: trimmed } : c)));
    queue([
      changeOf({ ...entry, name: trimmed }),
      ...touched.map((c) => changeFor.customer({ ...c, [nameKey]: trimmed })),
    ]);
    return null;
  };

  /**
   * Taking something off the list marks it inactive rather than deleting it:
   * the customers on it keep a readable name, and the reports can still
   * account for them.
   */
  const remove = (id) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    const next = settle(entries.map((e) => (e.id === id ? { ...e, isActive: false } : e)));
    setEntries(next);
    queueAll(entries, next);
  };

  /** Moves every customer from one entry to another (or to nobody). */
  const reassign = (fromId, toId) => {
    const name = (entries.find((e) => e.id === toId) || {}).name || "";
    const touched = peopleRef.current.filter((c) => c[idKey] === fromId);
    if (!touched.length) return 0;
    const patch = { [idKey]: toId || null, [nameKey]: name };
    setPeople((ps) => ps.map((c) => (c[idKey] === fromId ? { ...c, ...patch } : c)));
    queue(touched.map((c) => changeFor.customer({ ...c, ...patch })));
    return touched.length;
  };

  /** Ranked lists only: one place up or down the order of importance. */
  const move = (id, direction) => {
    if (!ranked) return;
    const next = moveTier(entries, id, direction);
    setEntries(next);
    queueAll(entries, next);
  };

  return { add, rename, remove, reassign, move, countOf };
}

/**
 * The frame everything else sits in.
 *
 * Two jobs. It keeps out of the hardware's way: an installed iOS app draws
 * edge to edge, so without the top inset the header sits underneath the clock
 * — which is exactly what "doesn't fit right on the home screen" looks like.
 * The bottom and sides matter too, for the home indicator and, in landscape,
 * the notch.
 *
 * And it grows. On a phone it is the screen; on an iPad or a desktop browser
 * it opens out to `maxWidth` rather than stranding a phone-sized column in the
 * middle of the window.
 */
function Shell({ layout, children }) {
  return (
    <div
      // The height is a class, not a style: `100vh` then `100dvh` is a cascade
      // fallback, and an inline style has only one slot per property.
      className="app-shell"
      style={{
        width: "100%",
        maxWidth: layout.maxWidth,
        margin: "0 auto",
        paddingTop: "var(--safe-top)",
        paddingLeft: "var(--safe-left)",
        paddingRight: "var(--safe-right)",
        boxSizing: "border-box",
        background: T.bg,
        position: "relative",
        overflow: "hidden",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {children}
    </div>
  );
}

/**
 * The way back to the staff screen. Sticky rather than absolutely positioned:
 * floating it over the content put it straight on top of each screen's title.
 */
function OwnerHeader({ onExit }) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 5,
        background: T.bg,
        padding: "12px 16px 8px",
        display: "flex",
      }}
    >
      <button
        onClick={onExit}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 999,
          padding: "6px 12px",
          cursor: "pointer",
        }}
      >
        <ArrowLeft size={14} color={T.textDim} />
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, fontWeight: 700 }}>Staff view</span>
      </button>
    </div>
  );
}

function OwnerNav({ tab, setTab }) {
  return (
    <nav
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        background: T.surface,
        borderTop: `1px solid ${T.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Clears the iOS home indicator, which otherwise sits on top of the
        // tabs. The background stays full-bleed to the screen edges — it is
        // meant to — but the tabs themselves keep out of the side insets, which
        // in landscape are where the notch and the rounded corners are.
        padding: "8px var(--safe-right) calc(8px + var(--safe-bottom)) var(--safe-left)",
      }}
    >
      {/* The row is capped rather than spread: five tabs flung to the corners
          of a 1200px window are further apart than they are usable. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", width: "100%", maxWidth: 460 }}>
      {OWNER_TABS.map(({ key, icon: Icon, label }) => {
        const active = tab === key;
        return (
          <button
            key={key}
            onClick={() => setTab(key)}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            style={{
              background: active ? tint(T.gold, 0.16) : "transparent",
              border: "none",
              borderRadius: 16,
              width: 62,
              height: 54,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              cursor: "pointer",
            }}
          >
            <Icon size={22} color={active ? T.gold : T.textDim} strokeWidth={2.2} />
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 700, color: active ? T.gold : T.textDim }}>
              {label}
            </span>
          </button>
        );
      })}
      </div>
    </nav>
  );
}
