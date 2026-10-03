import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, BarChart3, Plus, PhoneCall, Settings, Users } from "lucide-react";
import { T, tint } from "./theme.js";
import { initialsFor } from "./lib/analytics.js";
import { isoDaysAgo, isoDaysFromNow, todayIso } from "./lib/dates.js";
import { loadSeedData } from "./lib/dataSource.js";
import * as storage from "./lib/storage.js";
import { clearPin, loadPin, savePin } from "./lib/pin.js";
import { clampWeeks, loadSettings, saveSettings } from "./lib/settings.js";
import { currentWeekIndex } from "./lib/weeks.js";
import { addVisit, hasVisit, removeVisit } from "./lib/visits.js";

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
  const [customers, setCustomers] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [source, setSource] = useState(null);

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

  /* ---- load: whatever this device already has, else the shipped CSVs ---- */

  const applySeed = useCallback(async () => {
    const data = await loadSeedData();
    const src = { kind: "seed", label: "customers.csv", at: todayIso() };
    setCustomers(data.customers);
    setReminders(data.reminders);
    setSource(src);
    storage.save(data.customers, data.reminders);
    storage.saveSource(src);
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = storage.loadSaved();
      if (saved) {
        if (cancelled) return;
        setCustomers(saved.customers);
        setReminders(saved.reminders);
        setSource(storage.loadSource());
        setStatus("ready");
        return;
      }
      try {
        await applySeed();
        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.message);
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySeed]);

  // The offer expires together; each new tap or undo restarts the window.
  useEffect(() => {
    if (!pending.length && !notice) return undefined;
    const timer = setTimeout(() => {
      setPending([]);
      setNotice(null);
    }, UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [pending, notice]);

  // Every change is written straight through, so a reload never loses a visit.
  useEffect(() => {
    if (status === "ready") storage.save(customers, reminders);
  }, [customers, reminders, status]);

  /* ---- mutations ---- */

  const logVisit = (id, daysAgo) => {
    const date = isoDaysAgo(daysAgo);
    const customer = customers.find((c) => c.id === id);
    if (!customer) return;

    // A second tap on the same day changes nothing, so there is nothing to
    // undo — offering undo there would delete the first, genuine visit.
    const alreadyLogged = hasVisit(customer, date);
    if (alreadyLogged) {
      setNotice({ key: uid("n"), name: customer.name });
    } else {
      setCustomers((cs) => cs.map((c) => (c.id === id ? addVisit(c, date) : c)));
      setNotice(null);
      setPending((p) => [...p, { key: uid("u"), customerId: id, name: customer.name, date }].slice(-UNDO_DEPTH));
    }

    setJustLogged(id);
    setTimeout(() => setJustLogged(null), 900);
  };

  /** Steps back one tap at a time, newest first, so a burst unwinds in order. */
  const undoVisit = () => {
    const last = pending[pending.length - 1];
    if (!last) return;
    // Kept out of the state updater: React may call an updater twice, and a
    // removal is not something to run as a side effect of one.
    setCustomers((cs) => cs.map((c) => (c.id === last.customerId ? removeVisit(c, last.date) : c)));
    setPending((p) => p.slice(0, -1));
    setNotice(null);
  };

  /** "I rang them, and this is what they said." Clears any snooze. */
  const markCalled = (id, reason, note) => {
    setCustomers((cs) =>
      cs.map((c) =>
        c.id === id ? { ...c, contact: { on: todayIso(), reason, note }, snoozedUntilWeek: null } : c
      )
    );
  };

  /** Out of sight for a set number of trading weeks. */
  const snooze = (id, weeks) => {
    const until = currentWeekIndex() + weeks;
    setCustomers((cs) => cs.map((c) => (c.id === id ? { ...c, snoozedUntilWeek: until } : c)));
  };

  const unsnooze = (id) => {
    setCustomers((cs) => cs.map((c) => (c.id === id ? { ...c, snoozedUntilWeek: null } : c)));
  };

  const addReminder = (customerId, dueInDays, note) => {
    setReminders((rs) => [...rs, { id: uid("r"), customerId, dueOn: isoDaysFromNow(dueInDays), note }]);
  };

  const dismissReminder = (id) => setReminders((rs) => rs.filter((r) => r.id !== id));

  const addCustomer = ({ name, phone, visitEveryWeeks, visitedToday }) => {
    const customer = {
      id: uid("c"),
      name,
      phone,
      initials: initialsFor(name),
      visitEveryWeeks: visitEveryWeeks ?? null,
      visits: visitedToday ? [todayIso()] : [],
      contact: null,
      snoozedUntilWeek: null,
    };
    setCustomers((cs) => [...cs, customer]);
  };

  const updateCustomer = (id, patch) => {
    setCustomers((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  /** Owner-only: remove a visit that should never have been recorded. */
  const deleteVisit = (customerId, date) => {
    setCustomers((cs) => cs.map((c) => (c.id === customerId ? removeVisit(c, date) : c)));
    // Anything still offered as undo for that visit would now be a dead button.
    setPending((p) => p.filter((e) => !(e.customerId === customerId && e.date === date)));
  };

  const deleteCustomer = (id) => {
    setCustomers((cs) => cs.filter((c) => c.id !== id));
    setReminders((rs) => rs.filter((r) => r.customerId !== id));
  };

  const replaceData = (data, src) => {
    const stamped = { ...src, at: todayIso() };
    setCustomers(data.customers);
    setReminders(data.reminders);
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
                reminders={reminders}
                replaceData={replaceData}
                reloadSeed={reloadSeed}
                source={source}
                ownerPin={ownerPin}
                openChangePin={() => setChangePinOpen(true)}
                resetPin={resetPin}
                settings={settings}
                updateSettings={updateSettings}
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
