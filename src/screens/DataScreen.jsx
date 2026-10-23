import React, { useRef, useState } from "react";
import { AlertCircle, Download, FileSpreadsheet, KeyRound, RefreshCw, RotateCcw, Upload } from "lucide-react";
import { T, tint } from "../theme.js";
import { DataError, downloadCsvs, downloadWorkbook, parseFile } from "../lib/dataSource.js";
import { formatDate } from "../lib/dates.js";
import { DEFAULT_PIN } from "../lib/pin.js";
import CadencePicker from "../components/CadencePicker.jsx";
import SheetConnection from "../components/SheetConnection.jsx";

/**
 * Owner-only housekeeping: the spreadsheet (import a sheet, take a backup out,
 * go back to the shipped CSVs) and the PIN that guards these screens.
 */
export default function DataScreen({
  customers,
  actions,
  reminders,
  replaceData,
  reloadSeed,
  source,
  ownerPin,
  openChangePin,
  resetPin,
  settings,
  updateSettings,
  sheetConfig,
  saveSheet,
  sync,
  outboxCount,
  onRefresh,
}) {
  const fileRef = useRef(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const usingDefaultPin = ownerPin === DEFAULT_PIN;

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // let the same file be picked twice in a row
    if (!file) return;

    setError(null);
    setBusy(true);
    try {
      const parsed = await parseFile(file);
      replaceData(parsed, { kind: "file", label: file.name });
    } catch (err) {
      setError(err instanceof DataError ? err.message : `Couldn't read that file: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const onReload = async () => {
    setError(null);
    setBusy(true);
    try {
      await reloadSeed();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: "8px 16px 110px" }}>
      <div style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 20, color: T.text, marginBottom: 4 }}>Settings</div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.textDim, marginBottom: 18 }}>
        Your customer list, restock cadences, and the PIN that guards these screens.
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16, marginBottom: 14 }}>
        <Stat label="Customers" value={customers.length} />
        <Stat label="Reminders" value={reminders.length} />
        <Stat label="Actions logged" value={actions.length} />
        <Stat label="Visits logged" value={customers.reduce((n, c) => n + c.visits.length, 0)} />
        <Stat
          label="Loaded from"
          value={source?.label || "customers.csv"}
          sub={source?.at ? `on ${formatDate(source.at)}` : null}
          last
        />
      </div>

      {error && (
        <div style={{ background: tint(T.red, 0.12), border: `1px solid ${tint(T.red, 0.35)}`, borderRadius: 14, padding: 14, marginBottom: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <AlertCircle size={18} color={T.red} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.text, lineHeight: 1.5 }}>{error}</div>
        </div>
      )}

      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={onFile} style={{ display: "none" }} />

      <SectionLabel>GOOGLE SHEET</SectionLabel>

      <SheetConnection
        config={sheetConfig}
        onSave={saveSheet}
        sync={sync}
        outboxCount={outboxCount}
        onRefresh={onRefresh}
      />

      <SectionLabel style={{ marginTop: 22 }}>FILES</SectionLabel>

      <Action
        icon={Upload}
        color={T.gold}
        title={busy ? "Reading…" : "Import spreadsheet"}
        subtitle="Replaces the list from a .csv or .xlsx file"
        onClick={() => !busy && fileRef.current?.click()}
      />
      <Action
        icon={FileSpreadsheet}
        color={T.green}
        title="Export as Excel"
        subtitle="Three sheets — customers, actions and reminders"
        onClick={async () => {
          setError(null);
          setBusy(true);
          try {
            await downloadWorkbook(customers, actions, reminders);
          } catch (err) {
            setError(`Couldn't build the Excel file: ${err.message}`);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Action
        icon={Download}
        color={T.blue}
        title="Export the three CSVs"
        subtitle="customers, actions and reminders — the same shape as the sheet tabs"
        onClick={() => downloadCsvs(customers, actions, reminders)}
      />
      <Action
        icon={RefreshCw}
        color={T.red}
        title="Reset to the shipped file"
        subtitle="Discards everything logged on this device"
        onClick={() => {
          if (window.confirm("Discard all visits and reminders logged on this device, and reload the shipped customers.csv?")) onReload();
        }}
      />

      <SectionLabel style={{ marginTop: 22 }}>RESTOCK CADENCE</SectionLabel>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16, marginBottom: 10 }}>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: T.text, marginBottom: 4 }}>
          Default for new customers
        </div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, marginBottom: 14, lineHeight: 1.5 }}>
          Used for anyone without a cadence of their own — including rows imported from a sheet with no{" "}
          <code style={{ color: T.gold }}>visit_every_weeks</code> column.
        </div>
        <CadencePicker
          value={settings.defaultIntervalWeeks}
          onChange={(weeks) => updateSettings({ defaultIntervalWeeks: weeks })}
        />
      </div>

      <SectionLabel style={{ marginTop: 22 }}>SECURITY</SectionLabel>

      <Action
        icon={KeyRound}
        color={T.gold}
        title="Change owner PIN"
        subtitle={usingDefaultPin ? `Still the default (${DEFAULT_PIN}) — worth changing` : "Set a new 4-digit PIN for this phone"}
        onClick={openChangePin}
      />
      {!usingDefaultPin && (
        <Action
          icon={RotateCcw}
          color={T.blue}
          title="Reset PIN to default"
          subtitle={`Puts it back to ${DEFAULT_PIN}`}
          onClick={() => {
            if (window.confirm(`Reset the owner PIN back to ${DEFAULT_PIN}?`)) resetPin();
          }}
        />
      )}

      <div style={{ marginTop: 18, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16 }}>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: T.textDim, marginBottom: 10 }}>
          SHEET FORMAT
        </div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: T.textDim, lineHeight: 1.7 }}>
          <b style={{ color: T.text }}>customers</b> — name, phone, initials, visit_every_weeks, visit_dates, last_call_date, promised_date
          <br />
          <b style={{ color: T.text }}>reminders</b> — customer_name, due_date, note
          <br />
          <br />
          Put several visit dates in one cell separated by <code style={{ color: T.gold }}>|</code>. Dates can be{" "}
          <code style={{ color: T.gold }}>2026-09-05</code> or <code style={{ color: T.gold }}>05/09/2026</code>.
          <br />
          <br />
          <b style={{ color: T.text }}>visit_every_weeks</b> is how often that retailer restocks — 1 for weekly, 2 for
          fortnightly. Leave it blank and they use the default above. <code style={{ color: T.gold }}>frequency</code>{" "}
          and <code style={{ color: T.gold }}>interval</code> work as column names too, and an older{" "}
          <code style={{ color: T.gold }}>visit_every_days</code> column still imports.
          <br />
          <br />
          Only <b style={{ color: T.text }}>name</b> is required; everything else can be blank.
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children, style }) {
  return (
    <div
      style={{
        fontFamily: "'DM Sans', sans-serif",
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: 0.6,
        color: T.textDim,
        margin: "0 0 8px 2px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Stat({ label, value, sub, last }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 12,
        padding: "7px 0",
        borderBottom: last ? "none" : `1px solid ${T.border}`,
      }}
    >
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.textDim }}>{label}</span>
      <span style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 13, color: T.text, textAlign: "right", wordBreak: "break-all" }}>
        {value}
        {sub && <span style={{ display: "block", fontSize: 10, color: T.textDim }}>{sub}</span>}
      </span>
    </div>
  );
}

function Action({ icon: Icon, color, title, subtitle, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        padding: "13px 14px",
        marginBottom: 10,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span style={{ width: 38, height: 38, borderRadius: "50%", background: tint(color, 0.16), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={18} color={color} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: T.text }}>{title}</span>
        <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.textDim, marginTop: 2 }}>{subtitle}</span>
      </span>
    </button>
  );
}
