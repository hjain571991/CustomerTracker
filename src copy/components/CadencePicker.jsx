import React from "react";
import { Minus, Plus } from "lucide-react";
import { T } from "../theme.js";
import { MAX_WEEKS, MIN_WEEKS, WEEK_PRESETS, clampWeeks } from "../lib/settings.js";

/**
 * "This retailer restocks every N weeks." Weeks rather than days because the
 * shop trades Mon–Sat: a visit anywhere in the week counts, so the cadence is
 * naturally a number of weeks, not a rolling day count.
 *
 * `value` of null means "use the app default", which the caller renders as such.
 */
export default function CadencePicker({ value, onChange, accent = T.gold, accentText = T.onGold }) {
  const current = value === null || value === undefined ? null : clampWeeks(value);
  const nudge = (delta) => onChange(clampWeeks((current ?? 1) + delta));

  const round = {
    width: 42,
    height: 42,
    borderRadius: "50%",
    background: T.surfaceAlt,
    border: `1px solid ${T.border}`,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {WEEK_PRESETS.map((p) => {
          const active = current === p.weeks;
          return (
            <button
              key={p.weeks}
              type="button"
              onClick={() => onChange(p.weeks)}
              style={{
                background: active ? accent : T.surfaceAlt,
                color: active ? accentText : T.text,
                border: `1px solid ${T.border}`,
                borderRadius: 999,
                padding: "9px 14px",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
        <button
          type="button"
          aria-label="Come in more often"
          onClick={() => nudge(-1)}
          disabled={current !== null && current <= MIN_WEEKS}
          style={{ ...round, opacity: current !== null && current <= MIN_WEEKS ? 0.4 : 1 }}
        >
          <Minus size={17} color={T.text} />
        </button>
        <div style={{ textAlign: "center", minWidth: 128 }}>
          <div style={{ fontFamily: "'Roboto Mono', monospace", fontWeight: 700, fontSize: 22, color: current === null ? T.textDim : T.text }}>
            {current === null ? "default" : `${current} ${current === 1 ? "week" : "weeks"}`}
          </div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: T.textDim, marginTop: 2 }}>between visits</div>
        </div>
        <button
          type="button"
          aria-label="Come in less often"
          onClick={() => nudge(1)}
          disabled={current !== null && current >= MAX_WEEKS}
          style={{ ...round, opacity: current !== null && current >= MAX_WEEKS ? 0.4 : 1 }}
        >
          <Plus size={17} color={T.text} />
        </button>
      </div>
    </div>
  );
}
