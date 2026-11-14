import React from "react";
import { Layers } from "lucide-react";
import { T } from "../theme.js";
import { activeTiers, tierById, tierLabel } from "../lib/tiers.js";

/**
 * How important this retailer is.
 *
 * Optional, like the rep: a customer nobody has graded yet is not the same as
 * one graded least important, and the call list treats them differently — so
 * the blank option has to stay reachable.
 *
 * A tier that has been removed from the list but is still set here stays
 * selectable, so saving an unrelated change cannot silently downgrade someone.
 */
export default function TierPicker({ tiers, value, onChange }) {
  const assigned = tierById(tiers, value);
  const options = activeTiers(tiers);
  if (assigned && !options.some((t) => t.id === assigned.id)) options.unshift(assigned);

  const empty = options.length === 0;

  return (
    <div style={{ position: "relative" }}>
      <Layers size={17} color={T.gold} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={empty}
        aria-label="Customer tier"
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
        <option value="">{empty ? "No tiers set up yet" : "Tier (optional)"}</option>
        {options.map((tier) => (
          <option key={tier.id} value={tier.id}>
            {tierLabel(tier, tiers)}
            {tier.isActive ? "" : " (removed)"}
          </option>
        ))}
      </select>
      {empty && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, marginTop: 6, lineHeight: 1.5 }}>
          Set your tiers up under <b style={{ color: T.text }}>Settings → Customer tiers</b> and they'll appear here.
        </div>
      )}
    </div>
  );
}
