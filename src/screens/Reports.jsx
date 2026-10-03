import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { T, tint } from "../theme.js";
import { COUNT_PERIODS, customerVisitCounts, earliestVisit, periodByKey, reasonBreakdown } from "../lib/reports.js";
import { clampRange, resolveRange, todayOf } from "../lib/visitCounts.js";
import { formatDate } from "../lib/dates.js";
import Avatar from "../components/Avatar.jsx";
import DateSelect from "../components/DateSelect.jsx";
import VisitLog from "./VisitLog.jsx";

const VIEWS = [
  { key: "counts", label: "Visits" },
  { key: "reasons", label: "Why they stopped" },
  { key: "log", label: "Log" },
];

/**
 * The book-wide views. The per-customer screens answer "how is this one
 * doing"; this answers "who is coming in, who is not, and what did the ones
 * who stopped actually say".
 */
export default function Reports({ customers, deleteVisit, openCustomer }) {
  const [view, setView] = useState("counts");
  const [periodKey, setPeriodKey] = useState("3m");

  // A custom window cannot start before there is anything recorded, and cannot
  // end in the future — a range outside the data only yields a misleading zero.
  const today = todayOf();
  const floor = useMemo(() => earliestVisit(customers) || today, [customers, today]);
  const [custom, setCustom] = useState(() => ({ from: floor, to: today }));

  const setCustomPart = (part, value) =>
    setCustom((prev) => clampRange({ ...prev, [part]: value }, { min: floor, max: today }));

  const period = periodKey === "custom" ? { key: "custom", ...custom } : periodByKey(periodKey);
  const range = resolveRange(period);

  return (
    <div style={{ padding: "8px 16px 110px" }}>
      <div style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 20, color: T.text, marginBottom: 12 }}>
        Reports
      </div>

      <Segmented options={VIEWS} value={view} onChange={setView} />

      {view !== "log" && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", margin: "14px 0 16px" }}>
          {[...COUNT_PERIODS, { key: "custom", label: "Custom" }].map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriodKey(p.key)}
              style={{
                background: p.key === periodKey ? T.gold : T.surfaceAlt,
                color: p.key === periodKey ? T.onGold : T.text,
                border: `1px solid ${T.border}`,
                borderRadius: 999,
                padding: "7px 12px",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {p.label.replace("Last ", "")}
            </button>
          ))}
        </div>
      )}

      {view !== "log" && periodKey === "custom" && (
        <CustomRange range={custom} floor={floor} today={today} onChange={setCustomPart} />
      )}

      {view !== "log" && periodKey !== "custom" && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, margin: "-8px 0 14px 2px" }}>
          {formatDate(range.from)} — {formatDate(range.to)}
        </div>
      )}

      {view === "counts" && <VisitCountsReport customers={customers} period={period} openCustomer={openCustomer} />}
      {view === "reasons" && <ReasonsReport customers={customers} period={period} openCustomer={openCustomer} />}
      {view === "log" && (
        <div style={{ margin: "14px -16px 0" }}>
          <VisitLog customers={customers} deleteVisit={deleteVisit} openCustomer={openCustomer} embedded />
        </div>
      )}
    </div>
  );
}

/**
 * From and to, bounded by the data. Uses named months rather than a native
 * date input, whose MM/DD vs DD/MM rendering follows the browser locale and
 * cannot be overridden.
 */
function CustomRange({ range, floor, today, onChange }) {
  const row = { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 };
  const tag = {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 11,
    fontWeight: 700,
    color: T.textDim,
    width: 32,
    flexShrink: 0,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  };
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={row}>
        <span style={tag}>From</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <DateSelect
            label="From"
            value={range.from}
            min={floor}
            max={range.to || today}
            onChange={(v) => onChange("from", v)}
          />
        </span>
      </div>
      <div style={row}>
        <span style={tag}>To</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <DateSelect
            label="To"
            value={range.to}
            min={range.from || floor}
            max={today}
            onChange={(v) => onChange("to", v)}
          />
        </span>
      </div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, marginTop: 8, lineHeight: 1.5 }}>
        {formatDate(range.from)} — {formatDate(range.to)} · records start {formatDate(floor)}, nothing before that to count.
      </div>
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 12, padding: 3, gap: 3 }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            style={{
              flex: 1,
              background: active ? T.surface : "transparent",
              border: active ? `1px solid ${T.border}` : "1px solid transparent",
              borderRadius: 9,
              padding: "8px 4px",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: 11.5,
              color: active ? T.text : T.textDim,
              cursor: "pointer",
              lineHeight: 1.2,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- who is coming in ---------------- */

function VisitCountsReport({ customers, period, openCustomer }) {
  const [order, setOrder] = useState("most");
  const [query, setQuery] = useState("");
  const data = useMemo(
    () => customerVisitCounts(customers, period, { query, order }),
    [customers, period, query, order]
  );
  const busiest = data.rows.reduce((n, r) => Math.max(n, r.count), 0);

  return (
    <div>
      <div style={{ position: "relative", marginBottom: 10 }}>
        <Search size={15} color={T.textDim} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or phone"
          style={{
            width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12,
            padding: "11px 12px 11px 34px", color: T.text, fontFamily: "'DM Sans', sans-serif",
            fontSize: 13, boxSizing: "border-box",
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim }}>
          {data.totalVisits} visits · {data.withNone} came in not at all
        </span>
        <button
          onClick={() => setOrder((o) => (o === "most" ? "fewest" : "most"))}
          style={{
            background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 999,
            padding: "6px 12px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
            fontSize: 11, color: T.gold, cursor: "pointer", flexShrink: 0,
          }}
        >
          {order === "most" ? "Most first" : "Fewest first"}
        </button>
      </div>

      {data.rows.map(({ customer, count, coversPeriod }) => (
        <button
          key={customer.id}
          onClick={() => openCustomer(customer)}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 11,
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14,
            padding: "9px 12px", marginBottom: 8, cursor: "pointer", textAlign: "left",
          }}
        >
          <Avatar customer={customer} size={34} ring={count === 0 ? T.border : T.gold} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: T.text }}>
              {customer.name}
            </span>
            {/* A bar makes the spread readable without reading every number. */}
            <span style={{ display: "block", height: 3, borderRadius: 2, background: T.surfaceAlt, marginTop: 5, overflow: "hidden" }}>
              <span
                style={{
                  display: "block", height: "100%",
                  width: `${busiest ? (count / busiest) * 100 : 0}%`,
                  background: count === 0 ? "transparent" : tint(T.gold, 0.85),
                }}
              />
            </span>
          </span>
          <span style={{ textAlign: "right", flexShrink: 0 }}>
            <span style={{ display: "block", fontFamily: "'Roboto Mono', monospace", fontWeight: 700, fontSize: 16, color: count === 0 ? T.textDim : T.text }}>
              {count}
            </span>
            {!coversPeriod && (
              <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 9, color: T.textDim }}>partial</span>
            )}
          </span>
        </button>
      ))}

      {data.rows.length === 0 && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.textDim, textAlign: "center", marginTop: 40 }}>
          No customers match “{query}”.
        </div>
      )}
    </div>
  );
}

/* ---------------- why they stopped ---------------- */

function ReasonsReport({ customers, period, openCustomer }) {
  const data = useMemo(() => reasonBreakdown(customers, period), [customers, period]);
  const [open, setOpen] = useState({});

  if (data.total === 0) {
    return (
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.textDim, textAlign: "center", marginTop: 40, lineHeight: 1.6 }}>
        Nobody was rung in this period.
        <br />
        Mark a call on the Follow-ups screen and the reason shows up here.
      </div>
    );
  }

  return (
    <div>
      {/* The headline: did ringing them work at all? */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 14, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: "'Roboto Mono', monospace", fontWeight: 700, fontSize: 24, color: T.green }}>
            {data.totalCameBack}
          </span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.text }}>
            of {data.total} came back after you rang
          </span>
        </div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, marginTop: 6, lineHeight: 1.5 }}>
          {data.calledWithoutReason > 0 && `${data.calledWithoutReason} more rung with no reason recorded. `}
          Counts the most recent call for each customer.
        </div>
      </div>

      {data.rows.map((row) => {
        const expanded = open[row.key];
        const backPct = row.count ? (row.backCount / row.count) * 100 : 0;
        return (
          <div key={row.key} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, marginBottom: 8, overflow: "hidden" }}>
            <button
              onClick={() => row.count && setOpen((o) => ({ ...o, [row.key]: !o[row.key] }))}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10, background: "none",
                border: "none", padding: "12px 13px", cursor: row.count ? "pointer" : "default", textAlign: "left",
              }}
            >
              {row.count ? (
                expanded ? <ChevronDown size={14} color={T.textDim} /> : <ChevronRight size={14} color={T.textDim} />
              ) : (
                <span style={{ width: 14 }} />
              )}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13.5, color: row.count ? T.text : T.textDim }}>
                    {row.label}
                  </span>
                  {row.count > 0 && (
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, flexShrink: 0 }}>
                      {row.backCount} back · {row.notBack.length} not
                    </span>
                  )}
                </span>
                {/* Green is the share a call brought back; the rest is still out. */}
                <span style={{ display: "flex", height: 5, borderRadius: 3, background: T.surfaceAlt, marginTop: 7, overflow: "hidden" }}>
                  <span style={{ width: `${backPct}%`, background: T.green }} />
                  <span style={{ width: `${100 - backPct}%`, background: row.count ? tint(T.red, 0.55) : "transparent" }} />
                </span>
              </span>
              <span style={{ fontFamily: "'Roboto Mono', monospace", fontWeight: 700, fontSize: 15, color: row.count ? T.text : T.textDim, flexShrink: 0 }}>
                {row.count}
              </span>
            </button>

            {expanded && (
              <>
                <OutcomeGroup title="Came back" colour={T.green} people={row.cameBack} openCustomer={openCustomer} />
                <OutcomeGroup title="Not back yet" colour={T.red} people={row.notBack} openCustomer={openCustomer} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OutcomeGroup({ title, colour, people, openCustomer }) {
  if (!people.length) return null;
  return (
    <>
      <div
        style={{
          borderTop: `1px solid ${T.border}`,
          background: T.surfaceAlt,
          padding: "7px 13px",
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 700,
          fontSize: 10,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: colour,
        }}
      >
        {title} · {people.length}
      </div>
      {people.map((c) => (
        <button
          key={c.id}
          onClick={() => openCustomer(c)}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10, background: T.surfaceAlt,
            border: "none", borderTop: `1px solid ${T.border}`, padding: "10px 13px", cursor: "pointer", textAlign: "left",
          }}
        >
          <Avatar customer={c} size={28} ring={colour} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: T.text }}>
              {c.name}
            </span>
            {c.contact?.note && (
              <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, color: T.textDim, marginTop: 2, lineHeight: 1.4 }}>
                “{c.contact.note}”
              </span>
            )}
          </span>
        </button>
      ))}
    </>
  );
}
