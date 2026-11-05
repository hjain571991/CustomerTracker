import React, { useState } from "react";
import { BellPlus, Save } from "lucide-react";
import { T } from "../theme.js";
import { formatDate, isoDaysAgo, isoDaysFromNow, todayIso } from "../lib/dates.js";
import Sheet from "./Sheet.jsx";
import Avatar from "./Avatar.jsx";
import DayStepper from "./DayStepper.jsx";
import DateSelect from "./DateSelect.jsx";
import Calendar from "./Calendar.jsx";

/**
 * How far back the calendar will go. Long enough to fix anything anyone
 * actually remembers, short enough that a stray tap cannot land a visit in a
 * year nobody is thinking about.
 */
const BACKFILL_MONTHS = 12;

/**
 * Backfilling a visit someone forgot to tap at the time.
 *
 * Yesterday and the day before cover almost every case in one tap — those are
 * the two days a shopkeeper is actually reconstructing. Anything older is a
 * date, not a countdown, so it gets a calendar.
 */
export function LogVisitSheet({ customer, close, logVisit }) {
  const today = todayIso();
  const pick = (iso) => {
    logVisit(customer.id, iso);
    close();
  };

  const quick = [
    { label: "Yesterday", iso: isoDaysAgo(1) },
    { label: "Day before yesterday", iso: isoDaysAgo(2) },
  ];

  const floor = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - BACKFILL_MONTHS);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const row = {
    background: T.surfaceAlt,
    border: `1px solid ${T.border}`,
    borderRadius: 14,
    padding: "14px 16px",
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 700,
    fontSize: 15,
    color: T.text,
    textAlign: "left",
    cursor: "pointer",
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
  };

  return (
    <Sheet
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar customer={customer} size={34} ring={T.gold} /> When did they come in?
        </span>
      }
      onClose={close}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 18 }}>
        {quick.map((q) => {
          const already = (customer.visits || []).includes(q.iso);
          return (
            <button key={q.iso} onClick={() => pick(q.iso)} style={row}>
              <span>{q.label}</span>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: 12, color: already ? T.green : T.textDim }}>
                {formatDate(q.iso)}
                {already && " · already logged"}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: T.textDim, marginBottom: 12 }}>
        Or pick the day
      </div>

      <Calendar
        min={floor}
        max={today}
        onPick={pick}
        marked={customer.visits || []}
        label="visit"
      />
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

/**
 * Changing a reminder that is already set.
 *
 * Setting one is "remind me in three days", so a day stepper is the right
 * control. Changing one is almost always "not Tuesday, make it the 14th" —
 * an absolute date — so this picks the day itself rather than counting from
 * today, which for an overdue reminder would mean counting backwards.
 *
 * The customer is fixed: a reminder for the wrong shop is a new reminder, not
 * an edited one, and moving it would quietly detach the note from its context.
 */
export function EditReminderSheet({ reminder, customer, close, save }) {
  const [dueOn, setDueOn] = useState(reminder.dueOn);
  const [note, setNote] = useState(reminder.note || "");

  // Wide enough to move a reminder anywhere it sensibly belongs, including
  // back into the past to correct one that was set for the wrong week.
  const min = isoDaysFromNow(-730);
  const max = isoDaysFromNow(730);
  const changed = dueOn !== reminder.dueOn || note.trim() !== (reminder.note || "");

  return (
    <Sheet
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {customer && <Avatar customer={customer} size={30} ring={T.gold} />} Edit reminder
        </span>
      }
      onClose={close}
    >
      {customer && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 14 }}>
          {customer.name}
        </div>
      )}

      <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: 0.5, color: T.textDim, textTransform: "uppercase", marginBottom: 8 }}>
        Due on
      </div>
      <DateSelect label="Due" value={dueOn} min={min} max={max} onChange={setDueOn} />
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, margin: "8px 0 14px" }}>
        {formatDate(dueOn)}
        {dueOn === todayIso() && " · today"}
      </div>

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
          save({ dueOn, note: note.trim() });
          close();
        }}
        disabled={!changed}
        style={{ ...primaryButton(changed ? T.gold : T.surfaceAlt), cursor: changed ? "pointer" : "not-allowed" }}
      >
        <Save size={19} color={changed ? T.onGold : T.textDim} />
        <span style={primaryLabel(changed ? T.onGold : T.textDim)}>{changed ? "Save changes" : "Nothing changed"}</span>
      </button>
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
