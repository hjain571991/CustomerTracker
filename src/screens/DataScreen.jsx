import React, { useRef, useState } from "react";
import { AlertCircle, Check, Download, FileDown, History, KeyRound, Layers, RefreshCw, RotateCcw, Save, Upload, UserCog, UserPlus } from "lucide-react";
import { T, tint } from "../theme.js";
import { DataError, downloadCsvs, downloadCustomerTemplate, downloadWorkbook, parseFile } from "../lib/dataSource.js";
import { planCustomerImport } from "../lib/importCustomers.js";
import ImportPreviewSheet from "../components/ImportPreviewSheet.jsx";
import { formatDate as fmt } from "../lib/dates.js";
import { formatDate } from "../lib/dates.js";
import { DEFAULT_PIN } from "../lib/pin.js";
import CadencePicker from "../components/CadencePicker.jsx";
import ManagedList from "../components/ManagedList.jsx";
import SheetConnection from "../components/SheetConnection.jsx";
import { screenPadding, useLayout } from "../lib/layout.js";

/**
 * Owner-only housekeeping: the spreadsheet (import a sheet, take a backup out,
 * go back to the shipped CSVs) and the PIN that guards these screens.
 */
export default function DataScreen({
  customers,
  actions,
  reminders,
  reps,
  repActions,
  tiers,
  tierActions,
  customersForImport,
  applyCustomerImport,
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
  const layout = useLayout();
  const fileRef = useRef(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);
  // One picker, three jobs. A restore replaces the settings as well as the
  // data and an add merges into it, so which button opened it has to be
  // remembered.
  const [intent, setIntent] = useState("import");
  // A bulk add is shown before it is applied; this holds the pending plan.
  const [preview, setPreview] = useState(null);
  const usingDefaultPin = ownerPin === DEFAULT_PIN;

  const pick = (which) => {
    setIntent(which);
    setError(null);
    setNote(null);
    fileRef.current?.click();
  };

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // let the same file be picked twice in a row
    if (!file) return;

    setError(null);
    setNote(null);
    setBusy(true);
    try {
      const parsed = await parseFile(file);

      // Adding is a merge, not a replacement, so it never goes near the
      // confirm below — it gets its own preview and its own wording.
      if (intent === "add") {
        setPreview({
          filename: file.name,
          plan: planCustomerImport(customersForImport, parsed.customers, { reps, tiers }),
        });
        return;
      }

      const restoring = intent === "restore";
      const taken = parsed.meta?.takenAt ? new Date(parsed.meta.takenAt) : null;

      const summary =
        `${parsed.customers.length} customers, ${(parsed.actions || []).length} visits, ` +
        `${parsed.reminders.length} reminders, ${parsed.reps.length} reps, ${parsed.tiers.length} tiers`;

      if (
        !window.confirm(
          (restoring
            ? `Restore from ${file.name}?` + (taken ? `\n\nBacked up ${fmt(taken.toISOString().slice(0, 10))}.` : "")
            : `Import ${file.name}?`) +
            `\n\nIt holds ${summary}.` +
            "\n\nEverything currently on this device is replaced." +
            (restoring && parsed.meta?.settings ? " Your saved settings are restored too." : "")
        )
      ) {
        return;
      }

      replaceData(parsed, { kind: restoring ? "backup" : "file", label: file.name });
      setNote(
        restoring
          ? `Restored from ${file.name}. ${summary}.`
          : `Imported ${file.name}. ${summary}.`
      );
    } catch (err) {
      setError(err instanceof DataError ? err.message : `Couldn't read that file: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const backUpNow = async () => {
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      await downloadWorkbook(customers, actions, reminders, reps, tiers, settings);
      setNote("Backup saved to your downloads. Keep it somewhere that isn't this phone.");
    } catch (err) {
      setError(`Couldn't build the backup: ${err.message}`);
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
    <div style={{ ...screenPadding(layout), maxWidth: layout.readable + layout.gutter * 2, margin: "0 auto" }}>
      <div style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 20, color: T.text, marginBottom: 4 }}>Settings</div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.textDim, marginBottom: 18 }}>
        Your customer list, restock cadences, and the PIN that guards these screens.
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16, marginBottom: 14 }}>
        <Stat label="Customers" value={customers.length} />
        <Stat label="Representatives" value={reps.filter((r) => r.isActive).length} />
        <Stat label="Tiers" value={tiers.filter((t) => t.isActive).length} />
        <Stat label="Reminders" value={reminders.filter((r) => !r.isDone).length} sub={`${reminders.length} including completed`} />
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

      {note && (
        <div style={{ background: tint(T.green, 0.12), border: `1px solid ${tint(T.green, 0.3)}`, borderRadius: 14, padding: 14, marginBottom: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Check size={18} color={T.green} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.text, lineHeight: 1.5 }}>{note}</div>
        </div>
      )}

      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={onFile} style={{ display: "none" }} />

      <SectionLabel>BACKUP</SectionLabel>

      <Action
        icon={Save}
        color={T.green}
        title={busy ? "Working…" : "Back up everything now"}
        subtitle="One dated Excel file with every customer, visit, reminder, rep, tier and setting"
        onClick={() => !busy && backUpNow()}
      />
      <Action
        icon={History}
        color={T.gold}
        title="Restore from a backup"
        subtitle="Puts the app back exactly as it was when the backup was taken"
        onClick={() => !busy && pick("restore")}
      />

      <div style={{ background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 14, padding: 13, marginBottom: 10 }}>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, color: T.textDim, lineHeight: 1.6 }}>
          A backup is a single <code style={{ color: T.gold }}>.xlsx</code> you can open in Excel or upload to Google
          Sheets to read. Restoring reads it straight back — nothing is lost in the round trip. Take one before anything
          risky, and keep it somewhere that isn't this phone.
        </div>
      </div>

      <SectionLabel style={{ marginTop: 22 }}>ADD CUSTOMERS IN BULK</SectionLabel>

      <Action
        icon={FileDown}
        color={T.blue}
        title="Download the template"
        subtitle="A blank sheet with the right columns, and your reps and tiers listed in it"
        onClick={async () => {
          setError(null);
          setNote(null);
          setBusy(true);
          try {
            await downloadCustomerTemplate(reps, tiers);
            setNote("Template saved. Fill in one row per customer, then add it back with the button below.");
          } catch (err) {
            setError(`Couldn't build the template: ${err.message}`);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Action
        icon={UserPlus}
        color={T.green}
        title={busy ? "Reading…" : "Add customers from a file"}
        subtitle="Adds new ones and fills in existing ones — nothing is replaced"
        onClick={() => !busy && pick("add")}
      />

      <div style={{ background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 14, padding: 13, marginBottom: 10 }}>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, color: T.textDim, lineHeight: 1.6 }}>
          This is the one to use for a batch of new shops. Customers are matched{" "}
          <b style={{ color: T.text }}>by name</b>: a name you do not have is added, one you do has its details filled
          in, and a blank cell never clears what you already have. You see exactly what will happen before anything is
          written. <b style={{ color: T.text }}>Import spreadsheet</b> below is the different, destructive one — it
          replaces the whole book.
        </div>
      </div>

      <SectionLabel style={{ marginTop: 22 }}>FILES</SectionLabel>

      <Action
        icon={Upload}
        color={T.gold}
        title={busy ? "Reading…" : "Import spreadsheet"}
        subtitle="Replaces the whole book from a .csv or .xlsx file — use Add above for a batch of new customers"
        onClick={() => !busy && pick("import")}
      />
      <Action
        icon={Download}
        color={T.blue}
        title="Export the CSVs"
        subtitle="customers, actions, reminders, reps and tiers — the same shape as the sheet tabs"
        onClick={() => downloadCsvs(customers, actions, reminders, reps, tiers)}
      />
      <Action
        icon={RefreshCw}
        color={T.red}
        title="Reset to the shipped file"
        subtitle="Discards everything logged on this device"
        onClick={() => {
          if (window.confirm("Discard all visits and reminders logged on this device, and reload the shipped customers.csv?\n\nBack up first if you want to keep it.")) onReload();
        }}
      />

      <SectionLabel style={{ marginTop: 22 }}>MARKETING REPRESENTATIVES</SectionLabel>

      <ManagedList
        entries={reps}
        actions={repActions}
        icon={UserCog}
        noun="representative"
        intro={
          <>
            The people who look after your retailers. Whoever is on this list is offered when adding or editing a
            customer, and each one gets a row in <b style={{ color: T.text }}>Customers → By rep</b>.
          </>
        }
        emptyText="Nobody on the list yet."
      />

      <SectionLabel style={{ marginTop: 22 }}>CUSTOMER TIERS</SectionLabel>

      <ManagedList
        entries={tiers}
        actions={tierActions}
        icon={Layers}
        noun="tier"
        addLabel="Add a tier"
        ranked
        intro={
          <>
            How important a customer is — call them whatever you already call them. <b style={{ color: T.text }}>The
            order is what counts:</b> the top of this list is the most important, and where two customers are equally
            worth ringing, the higher tier is called first. A tier never makes somebody overdue who isn't, so a top
            customer quietly drifting away still shows up as drifting.
          </>
        }
        emptyText="No tiers yet — add one to start grading customers."
      />

      <SectionLabel style={{ marginTop: 22 }}>GOOGLE SHEET</SectionLabel>

      <SheetConnection
        config={sheetConfig}
        onSave={saveSheet}
        sync={sync}
        outboxCount={outboxCount}
        onRefresh={onRefresh}
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

      {preview && (
        <ImportPreviewSheet
          plan={preview.plan}
          filename={preview.filename}
          onCancel={() => setPreview(null)}
          onConfirm={() => {
            const done = applyCustomerImport(preview.plan);
            setPreview(null);
            setNote(
              `Added ${done.added} ${done.added === 1 ? "customer" : "customers"}` +
                (done.updated ? ` and updated ${done.updated}` : "") +
                ` from ${preview.filename}.`
            );
          }}
        />
      )}

      <div style={{ marginTop: 18, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16 }}>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: T.textDim, marginBottom: 10 }}>
          SHEET FORMAT
        </div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: T.textDim, lineHeight: 1.7 }}>
          <b style={{ color: T.text }}>customers</b> — customer_id, name, phone, company, marketing_rep_id, marketing_rep,
          initials, visit_every_weeks, visit_dates, last_call_date
          <br />
          <b style={{ color: T.text }}>actions</b> — action_id, customer_id, visit_date, is_logged
          <br />
          <b style={{ color: T.text }}>reminders</b> — reminder_id, customer_id, customer_name, due_date, note, is_done
          <br />
          <b style={{ color: T.text }}>reps</b> — rep_id, name, is_active
          <br />
          <b style={{ color: T.text }}>tiers</b> — tier_id, name, rank, is_active
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
          <b style={{ color: T.text }}>marketing_rep</b> can be typed straight onto a customer row — a name that isn't
          on the reps tab yet is added to it on the next read, so nothing is lost. <code style={{ color: T.gold }}>rep</code>,{" "}
          <code style={{ color: T.gold }}>representative</code> and <code style={{ color: T.gold }}>assigned_to</code> work
          as column names too.
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
