import React, { useMemo, useState } from "react";
import { CalendarRange, Trash2 } from "lucide-react";
import { T, tint } from "../theme.js";
import { buildVisitLog, DEFAULT_WINDOW_DAYS } from "../lib/visitLog.js";
import { formatDate } from "../lib/dates.js";
import { clampRange, earliestVisit, todayOf } from "../lib/visitCounts.js";
import Avatar from "../components/Avatar.jsx";
import SearchField from "../components/SearchField.jsx";
import DateRange from "../components/DateRange.jsx";
import { cardGrid, screenPadding, useLayout } from "../lib/layout.js";

/**
 * Owner-only history of every visit recorded, so a mis-tap nobody caught on
 * the day can still be found and removed. Reaching this screen already
 * required the PIN — the staff view has no route to it.
 */
export default function VisitLog({ customers, deleteVisit, openCustomer, embedded = false }) {
  const layout = useLayout();
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  // A window outside the records can only produce a misleading empty screen,
  // so the picker is bounded by the first visit on record and today.
  const today = todayOf();
  const floor = useMemo(() => earliestVisit(customers) || today, [customers, today]);
  const [range, setRange] = useState(() => ({ from: floor, to: today }));

  const active = dateOpen ? range : { from: null, to: null };
  const log = useMemo(
    () =>
      buildVisitLog(customers, {
        windowDays: showAll ? null : DEFAULT_WINDOW_DAYS,
        query,
        from: active.from,
        to: active.to,
      }),
    [customers, showAll, query, active.from, active.to]
  );

  const openDates = () => {
    // Opening the filter should never hide anything before it is touched, so
    // it starts at the full span of the records.
    setRange(clampRange({ from: floor, to: today }, { min: floor, max: today }));
    setDateOpen(true);
  };

  const confirmDelete = (customer, date) => {
    if (window.confirm(`Remove the visit for ${customer.name} on ${formatDate(date)}?\n\nThis cannot be undone.`)) {
      deleteVisit(customer.id, date);
    }
  };

  return (
    <div style={embedded ? { padding: `0 ${layout.gutter}px` } : screenPadding(layout)}>
      {!embedded && (
        <div style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 20, color: T.text, marginBottom: 4 }}>
          Visit log
        </div>
      )}
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.textDim, marginBottom: 12 }}>
        Every visit recorded, newest first. Deleting one removes it from that customer's history.
      </div>

      <SearchField value={query} onChange={setQuery} placeholder="Search name or phone" style={{ marginBottom: 10 }} />

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
        <button
          onClick={() => (dateOpen ? setDateOpen(false) : openDates())}
          style={{
            background: dateOpen ? T.gold : T.surfaceAlt,
            color: dateOpen ? T.onGold : T.text,
            border: `1px solid ${T.border}`,
            borderRadius: 999,
            padding: "7px 12px",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          <CalendarRange size={12} style={{ marginRight: 5, verticalAlign: -2 }} />
          {dateOpen ? "Clear dates" : "Search by date"}
        </button>
      </div>

      {dateOpen && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 14, marginBottom: 12 }}>
          <DateRange
            range={range}
            min={floor}
            max={today}
            onChange={setRange}
            caption={
              range.from === range.to
                ? `${formatDate(range.from)} only`
                : `${formatDate(range.from)} — ${formatDate(range.to)} · set both to the same day for one date`
            }
          />
        </div>
      )}

      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, marginBottom: 14 }}>
        {log.shown} {log.shown === 1 ? "visit" : "visits"}
        {dateOpen
          ? ` · ${formatDate(range.from)} — ${formatDate(range.to)}`
          : showAll
            ? " · all time"
            : ` · last ${DEFAULT_WINDOW_DAYS} days`}
        {log.total !== log.matching && ` · filtered from ${log.total}`}
      </div>

      {log.groups.length === 0 && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.textDim, textAlign: "center", marginTop: 40, lineHeight: 1.6 }}>
          {query
            ? `No visits match “${query}”${dateOpen ? " in those dates" : ""}.`
            : dateOpen
              ? `No visits between ${formatDate(range.from)} and ${formatDate(range.to)}.`
              : "No visits recorded in this period."}
        </div>
      )}

      {log.groups.map((group) => (
        <div key={group.date} style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              margin: "0 0 8px 2px",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: 0.6,
              color: T.textDim,
              textTransform: "uppercase",
            }}
          >
            {group.label}
            <span style={{ fontFamily: "'Roboto Mono', monospace", fontWeight: 700, fontSize: 11, color: T.gold, background: tint(T.gold, 0.16), borderRadius: 999, padding: "1px 8px" }}>
              {group.entries.length}
            </span>
          </div>

          <div style={cardGrid(layout, { gap: 8 })}>
          {group.entries.map(({ customer, date }) => (
            <div
              key={`${customer.id}-${date}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 14,
                padding: "9px 11px",
              }}
            >
              <button
                onClick={() => openCustomer(customer)}
                style={{ display: "flex", alignItems: "center", gap: 11, background: "none", border: "none", padding: 0, flex: 1, minWidth: 0, cursor: "pointer", textAlign: "left" }}
              >
                <Avatar customer={customer} size={34} ring={T.border} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: T.text }}>
                    {customer.name}
                  </span>
                  <span style={{ display: "block", fontFamily: "'Roboto Mono', monospace", fontSize: 11, color: T.textDim, marginTop: 1 }}>
                    {formatDate(date)}
                  </span>
                </span>
              </button>
              <button
                onClick={() => confirmDelete(customer, date)}
                aria-label={`Delete the visit for ${customer.name} on ${formatDate(date)}`}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: tint(T.red, 0.12),
                  border: `1px solid ${tint(T.red, 0.25)}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <Trash2 size={15} color={T.red} />
              </button>
            </div>
          ))}
          </div>
        </div>
      ))}

      {!dateOpen && !showAll && log.olderHidden > 0 && (
        <button
          onClick={() => setShowAll(true)}
          style={{
            width: "100%",
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 14,
            padding: "13px 0",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 700,
            fontSize: 13,
            color: T.gold,
            cursor: "pointer",
          }}
        >
          Show {log.olderHidden} older {log.olderHidden === 1 ? "visit" : "visits"}
        </button>
      )}
    </div>
  );
}
