import React from "react";
import { Minus, Plus } from "lucide-react";
import { T } from "../theme.js";

const PRESETS = [
  { label: "Tomorrow", days: 1 },
  { label: "2 days", days: 2 },
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
];

/** "In how many days?" — presets plus a −/+ nudge, shared by calls and reminders. */
export default function DayStepper({ days, setDays, accent = T.gold, accentText = T.onGold }) {
  const round = {
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: T.surfaceAlt,
    border: `1px solid ${T.border}`,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {PRESETS.map((p) => (
          <button
            key={p.days}
            onClick={() => setDays(p.days)}
            style={{
              background: days === p.days ? accent : T.surfaceAlt,
              color: days === p.days ? accentText : T.text,
              border: `1px solid ${T.border}`,
              borderRadius: 999,
              padding: "10px 16px",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, marginBottom: 20 }}>
        <button aria-label="One day sooner" onClick={() => setDays(Math.max(1, days - 1))} style={round}>
          <Minus size={18} color={T.text} />
        </button>
        <div style={{ fontFamily: "'Roboto Mono', monospace", fontWeight: 700, fontSize: 26, color: T.text, minWidth: 90, textAlign: "center" }}>
          {days} {days === 1 ? "day" : "days"}
        </div>
        <button aria-label="One day later" onClick={() => setDays(Math.min(60, days + 1))} style={round}>
          <Plus size={18} color={T.text} />
        </button>
      </div>
    </>
  );
}
