import React, { useState } from "react";
import { BellPlus } from "lucide-react";
import { T } from "../theme.js";
import Sheet from "./Sheet.jsx";
import Avatar from "./Avatar.jsx";
import DayStepper from "./DayStepper.jsx";

const QUICK_VISITS = [
  { label: "Yesterday", days: 1 },
  { label: "2 days ago", days: 2 },
  { label: "3 days ago", days: 3 },
];

/** Backfilling a visit someone forgot to tap at the time. */
export function LogVisitSheet({ customer, close, logVisit }) {
  const [gridOpen, setGridOpen] = useState(false);
  const pick = (days) => {
    logVisit(customer.id, days);
    close();
  };

  const row = {
    background: T.surfaceAlt,
    border: `1px solid ${T.border}`,
    borderRadius: 14,
    padding: "16px 18px",
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 700,
    fontSize: 16,
    color: T.text,
    textAlign: "left",
    cursor: "pointer",
  };

  return (
    <Sheet
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar customer={customer} size={34} ring={T.gold} /> Log an earlier visit
        </span>
      }
      onClose={close}
    >
      {!gridOpen ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {QUICK_VISITS.map((q) => (
            <button key={q.days} onClick={() => pick(q.days)} style={row}>
              {q.label}
            </button>
          ))}
          <button onClick={() => setGridOpen(true)} style={{ ...row, color: T.gold }}>
            Earlier than that…
          </button>
        </div>
      ) : (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 8 }}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <button
                key={d}
                onClick={() => pick(d)}
                style={{
                  aspectRatio: "1",
                  background: T.surfaceAlt,
                  border: `1px solid ${T.border}`,
                  borderRadius: 10,
                  fontFamily: "'Roboto Mono', monospace",
                  fontWeight: 700,
                  fontSize: 13,
                  color: T.text,
                  cursor: "pointer",
                }}
              >
                {d}
              </button>
            ))}
          </div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, textAlign: "center" }}>days ago</div>
        </div>
      )}
    </Sheet>
  );
}

/** A note-to-self to ring someone in N days. */
export function AddReminderSheet({ customers, close, addReminder }) {
  const [customerId, setCustomerId] = useState(null);
  const [days, setDays] = useState(3);
  const [note, setNote] = useState("");
  const customer = customers.find((c) => c.id === customerId);

  return (
    <Sheet title={customer ? "When & why" : "Remind me to call…"} onClose={close}>
      {!customer ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {customers.map((c) => (
            <button
              key={c.id}
              onClick={() => setCustomerId(c.id)}
              style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}
            >
              <Avatar customer={c} size={56} ring={T.border} />
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.text, textAlign: "center" }}>
                {c.name.split(" ")[0]}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <Avatar customer={customer} size={40} ring={T.gold} />
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: T.text }}>{customer.name}</span>
          </div>
          <DayStepper days={days} setDays={setDays} />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional) — e.g. what to talk to them about"
            style={{
              width: "100%",
              background: T.surfaceAlt,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              padding: 12,
              color: T.text,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              minHeight: 60,
              marginBottom: 16,
              resize: "none",
              boxSizing: "border-box",
            }}
          />
          <button
            onClick={() => {
              addReminder(customer.id, days, note.trim());
              close();
            }}
            style={primaryButton(T.gold)}
          >
            <BellPlus size={20} color={T.onGold} />
            <span style={primaryLabel(T.onGold)}>Set Reminder</span>
          </button>
        </div>
      )}
    </Sheet>
  );
}

function primaryButton(bg) {
  return {
    width: "100%",
    background: bg,
    border: "none",
    borderRadius: 14,
    padding: "15px 0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    cursor: "pointer",
  };
}

function primaryLabel(color) {
  return { color, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15 };
}
