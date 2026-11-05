import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { T } from "../theme.js";
import { SHEET_KINDS, buildSheets, hasContent, sheetTargets } from "../lib/printReports.js";
import { formatDate, todayIso } from "../lib/dates.js";

/**
 * The printable call sheets, and the preview you choose them from.
 *
 * Mounted through a portal straight onto `<body>` rather than inside the app
 * frame. That frame is a fixed-height, overflow-hidden phone screen — exactly
 * the wrong shape for something that has to flow down several sheets of paper
 * — and from the body the print stylesheet only has to hide `#root`.
 *
 * Deliberately the same markup on screen and on paper. A preview built from
 * different markup is a preview that lies.
 */

/* Paper is white. These are the only colours in this file. */
const INK = "#111";
const FAINT = "#666";
const RULE = "#c9c9c9";
const BOX = "#888";

export default function PrintSheets({ customers, reminders, settings, reps, tiers, onClose }) {
  const [kind, setKind] = useState("followups");
  const [repId, setRepId] = useState("__all__");

  const targets = useMemo(() => sheetTargets(customers, reps), [customers, reps]);

  const sheets = useMemo(
    () =>
      buildSheets(customers, reminders, settings, {
        kind,
        reps,
        tiers,
        repIds: repId === "__all__" ? null : [repId === "__none__" ? null : repId],
      }).filter(hasContent),
    [customers, reminders, settings, reps, tiers, kind, repId]
  );

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const control = {
    background: "#fff",
    border: `1px solid ${RULE}`,
    borderRadius: 10,
    padding: "9px 11px",
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 13,
    color: INK,
    cursor: "pointer",
  };

  return createPortal(
    <div
      className="print-root"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "#e9e9ea",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        padding: "0 0 40px",
      }}
    >
      <div
        className="print-chrome"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          background: "#fff",
          borderBottom: `1px solid ${RULE}`,
          padding: `calc(10px + var(--safe-top)) 14px 10px`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close print preview"
          style={{ ...control, display: "flex", alignItems: "center", gap: 6, padding: "9px 12px" }}
        >
          <X size={15} color={INK} /> Close
        </button>

        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Which sheet" style={control}>
          {SHEET_KINDS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label} — {k.blurb}
            </option>
          ))}
        </select>

        <select value={repId} onChange={(e) => setRepId(e.target.value)} aria-label="Which representative" style={control}>
          {/* Reps, not sheets: a rep with nobody to call prints nothing, so
              naming these "sheets" would contradict the Print button. */}
          <option value="__all__">
            Everyone ({targets.length} {targets.length === 1 ? "rep" : "reps"})
          </option>
          {targets.map(({ rep, customers: mine }) => (
            <option key={rep.id ?? "__none__"} value={rep.id ?? "__none__"}>
              {rep.name} ({mine.length})
            </option>
          ))}
        </select>

        <span style={{ flex: 1 }} />

        <button
          onClick={() => window.print()}
          disabled={sheets.length === 0}
          style={{
            ...control,
            background: sheets.length ? T.gold : "#eee",
            borderColor: sheets.length ? T.gold : RULE,
            color: sheets.length ? T.onGold : FAINT,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "10px 16px",
            cursor: sheets.length ? "pointer" : "not-allowed",
          }}
        >
          <Printer size={16} color={sheets.length ? T.onGold : FAINT} />
          Print {sheets.length > 0 && `(${sheets.length} ${sheets.length === 1 ? "sheet" : "sheets"})`}
        </button>
      </div>

      {sheets.length === 0 ? (
        <div
          className="print-chrome"
          style={{
            margin: "40px auto",
            maxWidth: 520,
            textAlign: "center",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            color: FAINT,
            lineHeight: 1.6,
          }}
        >
          {kind === "followups"
            ? "Nothing to chase — nobody on this selection needs a call today."
            : "No customers on this selection."}
        </div>
      ) : (
        <div
          className="print-paper"
          style={{
            width: "min(794px, calc(100% - 24px))",
            margin: "18px auto 0",
            background: "#fff",
            border: `1px solid ${RULE}`,
            boxShadow: "0 2px 14px rgba(0,0,0,0.12)",
            padding: "26px 30px",
            boxSizing: "border-box",
            color: INK,
          }}
        >
          {sheets.map((sheet, i) => (
            <Sheet key={sheet.rep.id ?? "__none__"} sheet={sheet} last={i === sheets.length - 1} />
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}

function Sheet({ sheet, last }) {
  const title = sheet.kind === "followups" ? "Follow-ups" : "Customer list";
  return (
    <section className="print-sheet" style={{ marginBottom: last ? 0 : 44 }}>
      <header style={{ borderBottom: `2px solid ${INK}`, paddingBottom: 8, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14 }}>
          <h1 style={{ margin: 0, fontFamily: "'Roboto Slab', serif", fontSize: 19, fontWeight: 700 }}>
            {sheet.rep.name}
          </h1>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: FAINT }}>
            {formatDate(todayIso())}
          </span>
        </div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: FAINT, marginTop: 3 }}>
          {title}
          {sheet.kind === "followups"
            ? ` · ${sheet.toCall} to call of ${sheet.total} customers`
            : ` · ${sheet.total} ${sheet.total === 1 ? "customer" : "customers"}`}
        </div>
      </header>

      {sheet.kind === "followups"
        ? sheet.groups.map((group) => (
            <div key={group.key} style={{ marginBottom: 16 }}>
              <div
                className="print-group-head"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 700,
                  fontSize: 10.5,
                  letterSpacing: 0.7,
                  textTransform: "uppercase",
                  color: FAINT,
                  borderBottom: `1px solid ${RULE}`,
                  paddingBottom: 4,
                  marginBottom: 8,
                }}
              >
                {group.title} · {group.entries.length}
              </div>
              {group.entries.map((e) => (
                <CallEntry key={e.customer.id} entry={e} />
              ))}
            </div>
          ))
        : <ListTable rows={sheet.rows} />}
    </section>
  );
}

/** One customer to ring, with the facts for the call and space for the answer. */
function CallEntry({ entry }) {
  return (
    <div className="print-entry" style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: `1px solid ${RULE}` }}>
      {/* Ticked off on the round, so the sheet comes back saying what was done. */}
      <span
        style={{
          width: 13,
          height: 13,
          border: `1.5px solid ${BOX}`,
          borderRadius: 2,
          flexShrink: 0,
          marginTop: 3,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13.5 }}>{entry.name}</span>
          {entry.tier && (
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9.5, fontWeight: 700, border: `1px solid ${BOX}`, borderRadius: 3, padding: "0 4px", color: FAINT }}>
              {entry.tier}
            </span>
          )}
          <span style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 12.5 }}>{entry.phone || "no number"}</span>
        </div>

        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: FAINT, marginTop: 2 }}>
          {entry.company && `${entry.company} · `}
          {entry.status.label} · {entry.cadence} · {entry.lastSeen} · {entry.visits}{" "}
          {entry.visits === 1 ? "visit" : "visits"}
          {entry.rhythm ? ` · ${entry.rhythm}` : ""}
        </div>

        {entry.reminderNote && (
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginTop: 2 }}>
            Reminder: {entry.reminderNote}
          </div>
        )}
        {entry.lastCall && (
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: FAINT, marginTop: 2 }}>
            Last call {formatDate(entry.lastCall.on)}
            {entry.lastCall.reason ? ` — ${entry.lastCall.reason}` : ""}
            {entry.lastCall.note ? `: “${entry.lastCall.note}”` : ""}
          </div>
        )}
      </div>

      {/* The point of paper: somewhere to write the answer down. */}
      <div style={{ width: "34%", flexShrink: 0, paddingTop: 2 }}>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 8.5, color: FAINT, letterSpacing: 0.4, textTransform: "uppercase" }}>
          What they said
        </div>
        <div style={{ borderBottom: `1px solid ${RULE}`, height: 15 }} />
        <div style={{ borderBottom: `1px solid ${RULE}`, height: 15 }} />
      </div>
    </div>
  );
}

/** The whole book for one rep, one line each. */
function ListTable({ rows }) {
  const th = {
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 700,
    fontSize: 9.5,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: FAINT,
    textAlign: "left",
    borderBottom: `1px solid ${RULE}`,
    padding: "0 6px 5px 0",
  };
  const td = {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 11.5,
    padding: "5px 6px 5px 0",
    borderBottom: `1px solid ${RULE}`,
    verticalAlign: "top",
  };

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={th}>Customer</th>
          <th style={th}>Phone</th>
          <th style={th}>Tier</th>
          <th style={th}>Comes in</th>
          <th style={th}>Last seen</th>
          <th style={{ ...th, paddingRight: 0 }}>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.customer.id} className="print-row">
            <td style={{ ...td, fontWeight: 700 }}>
              {r.name}
              {r.company && (
                <span style={{ display: "block", fontWeight: 400, fontSize: 10, color: FAINT }}>{r.company}</span>
              )}
            </td>
            <td style={{ ...td, fontFamily: "'Roboto Mono', monospace", fontSize: 11, whiteSpace: "nowrap" }}>
              {r.phone || "—"}
            </td>
            <td style={{ ...td, fontSize: 10.5, color: FAINT }}>{r.tier || "—"}</td>
            <td style={{ ...td, fontSize: 10.5, color: FAINT }}>{r.cadence}</td>
            <td style={{ ...td, fontSize: 10.5, color: FAINT, whiteSpace: "nowrap" }}>{r.lastSeen}</td>
            <td style={{ ...td, paddingRight: 0, fontWeight: 700, fontSize: 10.5 }}>{r.status.label}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
