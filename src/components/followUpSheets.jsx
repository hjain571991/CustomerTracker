import React, { useState } from "react";
import { Check, Clock } from "lucide-react";
import { T, tint } from "../theme.js";
import { REASONS } from "../lib/followups.js";
import Sheet from "./Sheet.jsx";
import Avatar from "./Avatar.jsx";

/**
 * What they said when you rang. The reason set is fixed on purpose — free text
 * cannot be counted, and counting is the point: "four left on price this
 * quarter" is a pricing decision, "they were a bit off with me" is not.
 */
export function CalledSheet({ customer, close, markCalled }) {
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState("");

  return (
    <Sheet
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar customer={customer} size={30} ring={T.gold} /> What did they say?
        </span>
      }
      onClose={close}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        {REASONS.map((r) => {
          const active = reason === r.key;
          return (
            <button
              key={r.key}
              onClick={() => setReason(r.key)}
              style={{
                background: active ? T.gold : T.surfaceAlt,
                color: active ? T.onGold : T.text,
                border: `1px solid ${active ? T.gold : T.border}`,
                borderRadius: 12,
                padding: "13px 10px",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                lineHeight: 1.3,
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Anything worth remembering (optional)"
        style={{
          width: "100%",
          background: T.surfaceAlt,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 12,
          color: T.text,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 13,
          minHeight: 58,
          marginBottom: 14,
          resize: "none",
          boxSizing: "border-box",
        }}
      />

      <button
        onClick={() => {
          markCalled(customer.id, reason, note.trim());
          close();
        }}
        disabled={!reason}
        style={{
          width: "100%",
          background: reason ? T.gold : T.surfaceAlt,
          border: "none",
          borderRadius: 14,
          padding: "15px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          cursor: reason ? "pointer" : "not-allowed",
        }}
      >
        <Check size={19} color={reason ? T.onGold : T.textDim} />
        <span style={{ color: reason ? T.onGold : T.textDim, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15 }}>
          Save
        </span>
      </button>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
        They'll come off this week's list. If they don't come in, they're back next week.
      </div>
    </Sheet>
  );
}

const SNOOZE_OPTIONS = [
  { weeks: 1, label: "1 week" },
  { weeks: 2, label: "2 weeks" },
  { weeks: 4, label: "4 weeks" },
];

/** Not today. Puts them out of sight for a set number of trading weeks. */
export function SnoozeSheet({ customer, close, snooze }) {
  return (
    <Sheet
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar customer={customer} size={30} ring={T.blue} /> Remind me again in…
        </span>
      }
      onClose={close}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {SNOOZE_OPTIONS.map((o) => (
          <button
            key={o.weeks}
            onClick={() => {
              snooze(customer.id, o.weeks);
              close();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: T.surfaceAlt,
              border: `1px solid ${T.border}`,
              borderRadius: 14,
              padding: "15px 16px",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: 15,
              color: T.text,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span style={{ width: 32, height: 32, borderRadius: "50%", background: tint(T.blue, 0.16), display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Clock size={16} color={T.blue} />
            </span>
            {o.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
