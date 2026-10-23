import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BarChart3, Plus, PhoneCall, Settings, Users } from "lucide-react";
import { T, tint } from "./theme.js";
import { initialsFor } from "./lib/analytics.js";
import { isoDaysAgo, isoDaysFromNow, todayIso } from "./lib/dates.js";
import * as storage from "./lib/storage.js";
import { clearPin, loadPin, savePin } from "./lib/pin.js";
import { clampWeeks, loadSettings, saveSettings } from "./lib/settings.js";
import { currentWeekIndex } from "./lib/weeks.js";
import { actionAoA, applyActions, customerAoA, loadSeedData, nextCustomerId, reminderAoA } from "./lib/dataSource.js";
import { hasVisit } from "./lib/visits.js";
import { changeFor, isConfigured, isSeeded, loadSheetConfig, markSeeded, readAll, replaceTab, saveSheetConfig } from "./lib/sheets.js";
import { enqueue, flush, fromSheet, loadOutbox, saveOutbox, syncNow } from "./lib/sync.js";

import StaffHome from "./screens/StaffHome.jsx";
import PinGate from "./screens/PinGate.jsx";
import FollowUps from "./screens/FollowUps.jsx";
import CustomersScreen from "./screens/CustomersScreen.jsx";
import CustomerDetail from "./screens/CustomerDetail.jsx";
import AddCustomer from "./screens/AddCustomer.jsx";
import DataScreen from "./screens/DataScreen.jsx";
import Reports from "./screens/Reports.jsx";
import { AddReminderSheet, LogVisitSheet } from "./components/sheets.jsx";
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
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [loadError, setLoadError] = useState(null);
  // `people` holds everything about a customer except their visits; `actions`
  // is the log those visits are derived from. Keeping them apart means a tap
  // appends one row rather than rewriting a customer record.
  const [people, setPeople] = useState([]);
  const [actions, setActions] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [source, setSource] = useState(null);
  const customers = useMemo(() => applyActions(people, actions), [people, actions]);
  // Read inside callbacks that must not re-create on every edit.
  const peopleRef = useRef(people);
  peopleRef.current = people;

  // Google Sheet connection, plus the queue of changes it has not been told about.
  const [sheetConfig, setSheetConfig] = useState(loadSheetConfig);
  const [outbox, setOutbox] = useState(loadOutbox);
  const [sync, setSync] = useState({ state: "idle", at: null, error: null });
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
  }, []);

  const applySeed = useCallback(async () => {
    const data = await loadSeedData();
    adopt(data);
    setSource({ kind: "seed", label: "customers.csv", at: todayIso() });
    storage.save(data.customers, data.actions, data.reminders);
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
          storage.save(data.customers, data.actions, data.reminders);
          setSync({ state: "idle", at: new Date().toISOString(), error: null });
          return;
        }

        const data = await syncNow(sheetConfig, outboxRef.current);
        adopt(data);
        setOutbox(data.outbox);
        saveOutbox(data.outbox);
        setSource({ kind: "sheet", label: "Google Sheet", at: todayIso() });
        storage.save(data.customers, data.actions, data.reminders);
        setSync({ state: "idle", at: new Date().toISOString(), error: null });
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
      if (!cancelled) refresh({ quiet: true });
    })();
    return () => {
      cancelled = true;
    };
    // Deliberately once on mount; later refreshes are driven by focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (status === "ready") storage.save(customers, actions, reminders);
  }, [customers, actions, reminders, status]);

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

  const logVisit = (id, daysAgo) => {
    const date = isoDaysAgo(daysAgo);
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

  const addReminder = (customerId, dueInDays, note) => {
    const reminder = { id: uid("rem"), customerId, dueOn: isoDaysFromNow(dueInDays), note, isDone: false };
    setReminders((rs) => [...rs, reminder]);
    queue([changeFor.reminder(reminder, customers.find((c) => c.id === customerId)?.name)]);
  };

  const dismissReminder = (id) => {
    const reminder = reminders.find((r) => r.id === id);
    setReminders((rs) => rs.filter((r) => r.id !== id));
    // Marked done in the sheet rather than deleted, so the row survives.
    if (reminder) {
      queue([
        changeFor.reminder({ ...reminder, isDone: true }, customers.find((c) => c.id === reminder.customerId)?.name),
      ]);
    }
  };

  const addCustomer = ({ name, phone, visitEveryWeeks, visitedToday }) => {
    const person = {
      id: nextCustomerId(people),
      name,
      phone,
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

  const updateCustomer = (id, patch) => patchPerson(id, patch);

  const deleteCustomer = (id) => {
    setPeople((ps) => ps.filter((c) => c.id !== id));
    setReminders((rs) => rs.filter((r) => r.customerId !== id));
    // The sheet keeps the row; blanking the name is what marks it gone.
    const person = people.find((c) => c.id === id);
    if (person) queue([changeFor.customer({ ...person, name: "" })]);
  };

  const replaceData = (data, src) => {
    const stamped = { ...src, at: todayIso() };
    adopt({ customers: data.customers, actions: data.actions || [], reminders: data.reminders });
    setSource(stamped);
    storage.saveSource(stamped);
    setDetailOpen(false);
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
      // Everything is now up there, so anything queued is redundant.
      setOutbox([]);
      saveOutbox([]);
      markSeeded(sheetConfig); // the sheet is now authoritative
      setSync({ state: "idle", at: new Date().toISOString(), error: null });
      setSource({ kind: "sheet", label: "Google Sheet", at: todayIso() });
    },
    [sheetConfig, customers, actions, reminders]
  );

  const openCustomer = (c) => {
    setActiveCustomerId(c.id);
    setDetailOpen(true);
  };

  const activeCustomer = customers.find((c) => c.id === activeCustomerId);

  /* ---- render ---- */

  if (status !== "ready") {
    return (
      <Shell>
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
    <Shell>
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

        {mode === "owner" && detailOpen && activeCustomer && (
          <CustomerDetail
            customer={activeCustomer}
            settings={settings}
            back={() => setDetailOpen(false)}
            openCalled={setCalledSheetFor}
            deleteCustomer={deleteCustomer}
            updateCustomer={updateCustomer}
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
                openCustomer={openCustomer}
                dismissReminder={dismissReminder}
                openAddReminder={() => setReminderSheetOpen(true)}
                openCalled={setCalledSheetFor}
                openSnooze={setSnoozeSheetFor}
                unsnooze={unsnooze}
              />
            )}
            {ownerTab === "customers" && <CustomersScreen customers={customers} settings={settings} openCustomer={openCustomer} />}
            {ownerTab === "add" && (
              <AddCustomer
                addCustomer={addCustomer}
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
                counts={{ customers: customers.length, actions: actions.length, reminders: reminders.length }}
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
 * Fills the phone screen on a device; on a desktop browser it settles into a
 * centred phone-sized column so the layout stays honest at any window size.
 */
function Shell({ children }) {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 460,
        margin: "0 auto",
        height: "100dvh",
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
        justifyContent: "space-around",
        padding: "8px 0 calc(8px + env(safe-area-inset-bottom))",
      }}
    >
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
    </nav>
  );
}
