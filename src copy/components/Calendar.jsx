import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { T, tint } from "../theme.js";
import { daysInMonth, parseIsoToDate, toIso, todayIso } from "../lib/dates.js";

/**
 * A month of real dates to pick from.
 *
 * The old picker counted backwards — "17 days ago" — which is the wrong
 * question to put to someone who remembers *when* a customer came in, not how
 * many sleeps have passed since. Nobody holds the date of a fortnight ago as a
 * number, so every use of it was a small arithmetic puzzle.
 *
 * Weeks start on Monday because the shop does: the trading week is Mon–Sat,
 * and Sunday closing the row keeps the shut day at the end where it belongs.
 *
 * Days already recorded are marked rather than disabled. Tapping one is a
 * harmless no-op, and showing which days are already down is the thing that
 * stops somebody logging the same visit twice.
 */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// Monday-first, to match the trading week.
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** Monday-start weekday index: 0 = Monday … 6 = Sunday. */
const mondayIndex = (date) => (date.getDay() + 6) % 7;

export default function Calendar({ value, min, max = todayIso(), onPick, marked = [], label = "visit" }) {
  const lo = parseIsoToDate(min);
  const hi = parseIsoToDate(max);
  const selected = parseIsoToDate(value);
  const today = todayIso();

  // Open on the month holding the selection, else the most recent month on offer.
  const [cursor, setCursor] = useState(() => {
    const start = selected || hi || new Date();
    return { year: start.getFullYear(), month: start.getMonth() };
  });

  const markedSet = useMemo(() => new Set(marked), [marked]);

  const firstOfMonth = new Date(cursor.year, cursor.month, 1);
  const blanks = mondayIndex(firstOfMonth);
  const total = daysInMonth(cursor.year, cursor.month);

  // The key explains the green dots; it only earns its place in a month that
  // actually has one. Showing it over a month with none describes nothing.
  const monthPrefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-`;
  const markedThisMonth = useMemo(
    () => [...markedSet].some((iso) => iso.startsWith(monthPrefix)),
    [markedSet, monthPrefix]
  );

  const stepMonth = (delta) => {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  };

  // A month is reachable only if any day in it falls inside the bounds.
  const canStep = (delta) => {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    const lastOfNext = new Date(next.getFullYear(), next.getMonth(), daysInMonth(next.getFullYear(), next.getMonth()));
    if (hi && next > hi) return false;
    if (lo && lastOfNext < lo) return false;
    return true;
  };

  const arrow = (enabled) => ({
    width: 34,
    height: 34,
    borderRadius: "50%",
    background: T.surfaceAlt,
    border: `1px solid ${T.border}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.35,
    flexShrink: 0,
    padding: 0,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <button type="button" onClick={() => canStep(-1) && stepMonth(-1)} disabled={!canStep(-1)} aria-label="Previous month" style={arrow(canStep(-1))}>
          <ChevronLeft size={17} color={T.text} />
        </button>
        <div
          aria-live="polite"
          style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14.5, color: T.text, textAlign: "center" }}
        >
          {MONTHS[cursor.month]} {cursor.year}
        </div>
        <button type="button" onClick={() => canStep(1) && stepMonth(1)} disabled={!canStep(1)} aria-label="Next month" style={arrow(canStep(1))}>
          <ChevronRight size={17} color={T.text} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5, marginBottom: 5 }}>
        {WEEKDAYS.map((d, i) => (
          <div
            key={i}
            aria-hidden="true"
            style={{
              textAlign: "center",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: 10.5,
              // Sunday is the closed day; dim it so the trading week reads clearly.
              color: i === 6 ? tint(T.textDim, 0.6) : T.textDim,
            }}
          >
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5 }}>
        {Array.from({ length: blanks }, (_, i) => <span key={`b${i}`} />)}

        {Array.from({ length: total }, (_, i) => i + 1).map((day) => {
          const date = new Date(cursor.year, cursor.month, day);
          const iso = toIso(date);
          const outOfRange = (lo && date < lo) || (hi && date > hi);
          const isSelected = iso === value;
          const isToday = iso === today;
          const alreadyLogged = markedSet.has(iso);

          const background = isSelected ? T.gold : alreadyLogged ? tint(T.green, 0.18) : T.surfaceAlt;
          const colour = isSelected ? T.onGold : alreadyLogged ? T.green : T.text;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => !outOfRange && onPick(iso)}
              disabled={outOfRange}
              aria-label={`${day} ${MONTHS[cursor.month]} ${cursor.year}${alreadyLogged ? ` — ${label} already logged` : ""}`}
              aria-pressed={isSelected}
              style={{
                position: "relative",
                aspectRatio: "1",
                minHeight: 38,
                background: outOfRange ? "transparent" : background,
                border: isToday && !isSelected ? `1px solid ${T.gold}` : `1px solid ${outOfRange ? "transparent" : T.border}`,
                borderRadius: 10,
                fontFamily: "'Roboto Mono', monospace",
                fontWeight: 700,
                fontSize: 13,
                color: outOfRange ? tint(T.textDim, 0.45) : colour,
                cursor: outOfRange ? "default" : "pointer",
                padding: 0,
              }}
            >
              {day}
              {alreadyLogged && !isSelected && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    bottom: 5,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: T.green,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {markedThisMonth && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, flexShrink: 0 }} />
          already logged
        </div>
      )}
    </div>
  );
}
