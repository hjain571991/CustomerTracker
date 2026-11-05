import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Printer, UserCog } from "lucide-react";
import { T, tint } from "../theme.js";
import { daysSinceLastVisit, statusFor, targetFor } from "../lib/analytics.js";
import { STATUS_BARS, repBreakdown } from "../lib/reps.js";
import Avatar from "../components/Avatar.jsx";
import SearchField from "../components/SearchField.jsx";
import TierBadge from "../components/TierBadge.jsx";
import Segmented from "../components/Segmented.jsx";
import { cardGrid, screenPadding, useLayout } from "../lib/layout.js";
import PrintSheets from "../components/PrintSheets.jsx";

const ORDER = { missed: 0, dueThisWeek: 1, never: 2, onTrack: 3 };

const VIEWS = [
  { key: "all", label: "All customers" },
  { key: "reps", label: "By rep" },
];

export default function CustomersScreen({ customers, reps, tiers, reminders, settings, openCustomer }) {
  const layout = useLayout();
  const [view, setView] = useState("all");
  const [printing, setPrinting] = useState(false);

  return (
    <div style={screenPadding(layout)}>
      <div style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 20, color: T.text, marginBottom: 4 }}>Customers</div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.textDim, marginBottom: 12 }}>
        {view === "all"
          ? "Measured against each customer's target. Most overdue first."
          : "How many retailers each representative is looking after, and how those retailers are doing."}
      </div>

      <Segmented options={VIEWS} value={view} onChange={setView} style={{ marginBottom: 14 }} />

      {view === "all" ? (
        <AllCustomers customers={customers} settings={settings} openCustomer={openCustomer} layout={layout} />
      ) : (
        <ByRep
          customers={customers}
          reps={reps}
          settings={settings}
          openCustomer={openCustomer}
          layout={layout}
          onPrint={() => setPrinting(true)}
        />
      )}

      {printing && (
        <PrintSheets
          customers={customers}
          reminders={reminders}
          settings={settings}
          reps={reps}
          tiers={tiers}
          onClose={() => setPrinting(false)}
        />
      )}
    </div>
  );
}

/* ---------------- the whole book ---------------- */

function AllCustomers({ customers, settings, openCustomer, layout }) {
  const [query, setQuery] = useState("");

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          (c.phone || "").includes(q) ||
          (c.company || "").toLowerCase().includes(q) ||
          (c.repName || "").toLowerCase().includes(q)
      )
      .sort((a, b) => ORDER[statusFor(a, settings).key] - ORDER[statusFor(b, settings).key]);
  }, [customers, settings, query]);

  return (
    <>
      <SearchField value={query} onChange={setQuery} placeholder="Search name, company, phone or rep" style={{ marginBottom: 14 }} />

      <div style={cardGrid(layout)}>
      {sorted.map((c) => {
        const status = statusFor(c, settings);
        const target = targetFor(c, settings);
        const since = daysSinceLastVisit(c);
        return (
          <button
            key={c.id}
            onClick={() => openCustomer(c)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 14,
              padding: "10px 14px",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <Avatar customer={c} size={42} ring={status.color} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: T.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.name}
                </span>
                <TierBadge customer={c} />
              </div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.textDim }}>
                {target.weeks === 1 ? "weekly" : `every ${target.weeks} weeks`}{target.isDefault && " (default)"}
                {since !== null ? ` · last seen ${since === 0 ? "today" : `${since}d ago`}`  : " · never visited"}
              </div>
              {c.repName && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, marginTop: 2 }}>
                  <UserCog size={11} color={T.textDim} /> {c.repName}
                </div>
              )}
            </div>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 11,
                color: status.color,
                background: tint(status.color, 0.15),
                borderRadius: 999,
                padding: "3px 9px",
                flexShrink: 0,
              }}
            >
              {status.label}
            </span>
          </button>
        );
      })}
      </div>

      {sorted.length === 0 && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.textDim, textAlign: "center", marginTop: 30 }}>
          No customers match “{query}”.
        </div>
      )}
    </>
  );
}

/* ---------------- by representative ---------------- */

/**
 * The count is the question asked most often ("how many has Priya got?"), but
 * the split is the one worth answering: forty retailers with fifteen missed is
 * a different conversation to forty all on track. So every row carries both,
 * and opens to the names behind the numbers.
 */
function ByRep({ customers, reps, settings, openCustomer, layout, onPrint }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState({});
  const data = useMemo(() => repBreakdown(customers, reps, settings, { query }), [customers, reps, settings, query]);

  const toggle = (key) => setOpen((o) => ({ ...o, [key]: !o[key] }));

  return (
    <>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <SearchField value={query} onChange={setQuery} placeholder="Search by representative" style={{ flex: 1 }} />
        <button
          onClick={onPrint}
          aria-label="Print follow-up sheets"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: T.surfaceAlt,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: "11px 13px",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 700,
            fontSize: 12.5,
            color: T.gold,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Printer size={15} color={T.gold} /> Print
        </button>
      </div>

      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, marginBottom: 12 }}>
        {data.rows.length} {data.rows.length === 1 ? "group" : "groups"} · {data.assigned} assigned
        {data.unassigned > 0 && ` · ${data.unassigned} with no rep`}
        {" · "}
        <b style={{ color: T.text, fontWeight: 400 }}>Print</b> gives each rep their own sheet
      </div>

      {data.rows.length === 0 && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.textDim, textAlign: "center", marginTop: 30, lineHeight: 1.6 }}>
          {query ? (
            <>No representative matches “{query}”.</>
          ) : (
            <>
              No representatives yet.
              <br />
              Add them under <b style={{ color: T.text }}>Settings → Marketing representatives</b>.
            </>
          )}
        </div>
      )}

      <div style={cardGrid(layout, { gap: 9 })}>
      {data.rows.map((row) => {
        const key = row.rep.id == null ? "__none__" : row.rep.id;
        const expanded = open[key];
        return (
          <div key={key} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
            <button
              onClick={() => row.total && toggle(key)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "none",
                border: "none",
                padding: "12px 13px",
                cursor: row.total ? "pointer" : "default",
                textAlign: "left",
              }}
            >
              {row.total ? (
                expanded ? <ChevronDown size={14} color={T.textDim} /> : <ChevronRight size={14} color={T.textDim} />
              ) : (
                <span style={{ width: 14 }} />
              )}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13.5, color: row.rep.id == null ? T.textDim : T.text }}>
                    {row.rep.name}
                    {row.rep.id != null && !row.rep.isActive && (
                      <span style={{ fontSize: 10, fontWeight: 400, color: T.textDim }}> · removed</span>
                    )}
                  </span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, flexShrink: 0 }}>
                    {row.counts.missed > 0 ? `${row.counts.missed} missed` : "none missed"}
                  </span>
                </span>
                <StatusBar counts={row.counts} total={row.total} />
              </span>
              <span style={{ textAlign: "right", flexShrink: 0 }}>
                <span style={{ display: "block", fontFamily: "'Roboto Mono', monospace", fontWeight: 700, fontSize: 16, color: row.total ? T.text : T.textDim }}>
                  {row.total}
                </span>
                <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 9, color: T.textDim }}>
                  {row.total === 1 ? "customer" : "customers"}
                </span>
              </span>
            </button>

            {expanded && (
              <>
                <Legend counts={row.counts} />
                {row.customers.map(({ customer, status }) => (
                  <button
                    key={customer.id}
                    onClick={() => openCustomer(customer)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: T.surfaceAlt,
                      border: "none",
                      borderTop: `1px solid ${T.border}`,
                      padding: "10px 13px",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <Avatar customer={customer} size={30} ring={status.color} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: T.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {customer.name}
                        </span>
                        <TierBadge customer={customer} />
                      </span>
                      {customer.company && (
                        <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, marginTop: 1 }}>
                          {customer.company}
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontWeight: 700,
                        fontSize: 10.5,
                        color: status.color,
                        background: tint(status.color, 0.15),
                        borderRadius: 999,
                        padding: "3px 8px",
                        flexShrink: 0,
                      }}
                    >
                      {status.label}
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        );
      })}
      </div>
    </>
  );
}

/** One bar split by status, in the same colours the rest of the app uses. */
function StatusBar({ counts, total }) {
  return (
    <span style={{ display: "flex", height: 5, borderRadius: 3, background: T.surfaceAlt, marginTop: 7, overflow: "hidden" }}>
      {total === 0
        ? null
        : STATUS_BARS.map((s) =>
            counts[s.key] ? (
              <span key={s.key} style={{ width: `${(counts[s.key] / total) * 100}%`, background: s.color }} />
            ) : null
          )}
    </span>
  );
}

function Legend({ counts }) {
  const shown = STATUS_BARS.filter((s) => counts[s.key] > 0);
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        borderTop: `1px solid ${T.border}`,
        background: T.surfaceAlt,
        padding: "8px 13px",
      }}
    >
      {shown.map((s) => (
        <span key={s.key} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, color: T.textDim }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
          {s.label} · <b style={{ color: T.text, fontWeight: 700 }}>{counts[s.key]}</b>
        </span>
      ))}
    </div>
  );
}
