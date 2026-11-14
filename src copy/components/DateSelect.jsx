import React from "react";
import { T } from "../theme.js";
import { buildBoundedDate, daysInMonth, parseIsoToDate } from "../lib/dates.js";

/**
 * Day / month / year selects instead of `<input type="date">`.
 *
 * A native date input renders in the *browser's* locale, which there is no way
 * to override — on an en-US browser it shows MM/DD/YYYY however the app is
 * configured. Naming the month sidesteps the argument entirely: "3 Oct 2026"
 * cannot be misread as 10 March on any device.
 *
 * Out-of-range options are not offered at all, so the bounds hold without
 * needing to correct the user after the fact.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function DateSelect({ value, min, max, onChange, label }) {
  const current = parseIsoToDate(value) || parseIsoToDate(min) || new Date();
  const lo = parseIsoToDate(min);
  const hi = parseIsoToDate(max);

  const year = current.getFullYear();
  const month = current.getMonth();
  const day = current.getDate();

  const years = [];
  for (let y = lo ? lo.getFullYear() : year; y <= (hi ? hi.getFullYear() : year); y++) years.push(y);

  // Only the months that actually fall inside the bounds for the chosen year.
  const firstMonth = lo && year === lo.getFullYear() ? lo.getMonth() : 0;
  const lastMonth = hi && year === hi.getFullYear() ? hi.getMonth() : 11;
  const months = [];
  for (let m = firstMonth; m <= lastMonth; m++) months.push(m);

  const firstDay = lo && year === lo.getFullYear() && month === lo.getMonth() ? lo.getDate() : 1;
  const lastDay =
    hi && year === hi.getFullYear() && month === hi.getMonth() ? hi.getDate() : daysInMonth(year, month);
  const days = [];
  for (let d = firstDay; d <= lastDay; d++) days.push(d);

  /** Rebuild the date from a changed part, keeping it inside the bounds. */
  const emit = (nextYear, nextMonth, nextDay) => onChange(buildBoundedDate(nextYear, nextMonth, nextDay, min, max));

  const select = {
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 10,
    padding: "9px 8px",
    color: T.text,
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    minWidth: 0,
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <select aria-label={`${label} day`} value={day} onChange={(e) => emit(year, month, +e.target.value)} style={{ ...select, flex: "0 0 62px" }}>
        {days.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      <select aria-label={`${label} month`} value={month} onChange={(e) => emit(year, +e.target.value, day)} style={{ ...select, flex: "1 1 auto" }}>
        {months.map((m) => (
          <option key={m} value={m}>{MONTHS[m]}</option>
        ))}
      </select>
      <select aria-label={`${label} year`} value={year} onChange={(e) => emit(+e.target.value, month, day)} style={{ ...select, flex: "0 0 82px" }}>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}
