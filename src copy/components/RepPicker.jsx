import React from "react";
import { UserCog } from "lucide-react";
import { T } from "../theme.js";
import { activeReps, repById } from "../lib/reps.js";

/**
 * Which rep looks after this retailer.
 *
 * A list the owner maintains rather than a free-text box: typed by hand,
 * "Priya Shah", "priya" and "P. Shah" become three people in the report, and
 * the report is the only reason the field exists.
 *
 * A rep who has been removed from the list but is still assigned here stays
 * selectable, so opening an old customer and saving an unrelated change cannot
 * silently unassign them.
 */
export default function RepPicker({ reps, value, onChange, allowNone = true }) {
  const assigned = repById(reps, value);
  const options = activeReps(reps);
  if (assigned && !options.some((r) => r.id === assigned.id)) options.unshift(assigned);

  const empty = options.length === 0;

  return (
    <div style={{ position: "relative" }}>
      <UserCog size={17} color={T.gold} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={empty}
        aria-label="Marketing representative"
        style={{
          width: "100%",
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 14,
          padding: "15px 14px 15px 40px",
          color: value ? T.text : T.textDim,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 15,
          boxSizing: "border-box",
          cursor: empty ? "not-allowed" : "pointer",
          appearance: "none",
          opacity: empty ? 0.6 : 1,
        }}
      >
        {allowNone && <option value="">{empty ? "No representatives added yet" : "Marketing rep (optional)"}</option>}
        {options.map((rep) => (
          <option key={rep.id} value={rep.id}>
            {rep.name}
            {rep.isActive ? "" : " (removed)"}
          </option>
        ))}
      </select>
      {empty && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, marginTop: 6, lineHeight: 1.5 }}>
          Add representatives under <b style={{ color: T.text }}>Settings → Marketing representatives</b> and they'll
          appear here.
        </div>
      )}
    </div>
  );
}
