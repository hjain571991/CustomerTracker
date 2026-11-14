import React from "react";
import { T } from "../theme.js";
import { clampRange } from "../lib/visitCounts.js";
import { formatDate } from "../lib/dates.js";
import DateSelect from "./DateSelect.jsx";

/**
 * From and to, held inside the dates that actually exist.
 *
 * Uses the named-month selects rather than `<input type="date">` for the same
 * reason `DateSelect` does: a native picker renders MM/DD or DD/MM according
 * to the browser's locale, which is exactly the ambiguity a date filter cannot
 * afford.
 */
export default function DateRange({ range, min, max, onChange, caption }) {
  const setPart = (part, value) => onChange(clampRange({ ...range, [part]: value }, { min, max }));

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
    <div>
      <div style={row}>
        <span style={tag}>From</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <DateSelect label="From" value={range.from} min={min} max={range.to || max} onChange={(v) => setPart("from", v)} />
        </span>
      </div>
      <div style={row}>
        <span style={tag}>To</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <DateSelect label="To" value={range.to} min={range.from || min} max={max} onChange={(v) => setPart("to", v)} />
        </span>
      </div>
      {caption !== false && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, marginTop: 6, lineHeight: 1.5 }}>
          {caption || `${formatDate(range.from)} — ${formatDate(range.to)}`}
        </div>
      )}
    </div>
  );
}
