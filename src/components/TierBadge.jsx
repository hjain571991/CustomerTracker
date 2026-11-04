import React from "react";
import { T, tint } from "../theme.js";

/**
 * The tier, where a customer is listed. Small and quiet on purpose — a tier
 * does not change whether somebody needs ringing, so it must not compete with
 * the status pill that does.
 */
export default function TierBadge({ customer, style }) {
  if (!customer?.tierName) return null;
  return (
    <span
      style={{
        fontFamily: "'DM Sans', sans-serif",
        fontWeight: 700,
        fontSize: 10,
        letterSpacing: 0.4,
        color: T.gold,
        background: tint(T.gold, 0.14),
        border: `1px solid ${tint(T.gold, 0.28)}`,
        borderRadius: 999,
        padding: "2px 7px",
        flexShrink: 0,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {customer.tierName}
    </span>
  );
}
