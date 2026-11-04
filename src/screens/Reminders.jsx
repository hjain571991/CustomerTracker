import React, { useMemo, useState } from "react";
import { CalendarRange, Check, MessageCircle, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { T, tint } from "../theme.js";
import { buildReminderList, earliestDue, latestDue } from "../lib/reminders.js";
import { formatDate, todayIso } from "../lib/dates.js";
import { clampRange } from "../lib/visitCounts.js";
import Avatar from "../components/Avatar.jsx";
import SearchField from "../components/SearchField.jsx";
import DateRange from "../components/DateRange.jsx";
import { cardGrid, screenPadding, useLayout } from "../lib/layout.js";
import { whatsappLink } from "../lib/whatsapp.js";

/**
 * Every reminder, not just the ones due.
 *
 * The follow-ups list is deliberately only today's work, which leaves two
 * questions it cannot answer: what is coming up, and what was already dealt
 * with. Both live here, and anything on the screen can be changed — a date
 * picked in haste is the most common thing to want back.
 */
export default function Reminders({
  customers,
  reminders,
  openCustomer,
  openAddReminder,
  openEditReminder,
  dismissReminder,
  restoreReminder,
  deleteReminder,
}) {
  const layout = useLayout();
  const [query, setQuery] = useState("");
  const [showDone, setShowDone] = useState(true);
  const [dateOpen, setDateOpen] = useState(false);

  // Reminders run into the future, so the window is not bounded by today at
  // either end the way the visit log is.
  const floor = useMemo(() => earliestDue(reminders) || todayIso(), [reminders]);
  const ceiling = useMemo(() => latestDue(reminders), [reminders]);
  const [range, setRange] = useState(() => ({ from: floor, to: ceiling }));

  const active = dateOpen ? range : { from: null, to: null };
  const data = useMemo(
    () => buildReminderList(customers, reminders, { query, showDone, from: active.from, to: active.to }),
    [customers, reminders, query, showDone, active.from, active.to]
  );

  const openDates = () => {
    // Start from the full span rather than whatever was last picked, so turning
    // the filter on never hides rows before it has been touched.
    setRange(clampRange({ from: floor, to: ceiling }, { min: floor, max: ceiling }));
    setDateOpen(true);
  };

  return (
    <div style={screenPadding(layout)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 20, color: T.text }}>Reminders</div>
        <button
          onClick={openAddReminder}
          aria-label="Add reminder"
          style={{ width: 40, height: 40, borderRadius: "50%", background: T.gold, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
        >
          <Plus size={20} color={T.onGold} />
        </button>
      </div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.textDim, marginBottom: 14 }}>
        Everything you've set — still to do, and already done.
      </div>

      <SearchField value={query} onChange={setQuery} placeholder="Search name, phone or note" style={{ marginBottom: 10 }} />

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
        <Chip active={showDone} onClick={() => setShowDone((v) => !v)}>
          {showDone ? "Showing completed" : "Hiding completed"}
        </Chip>
        <Chip active={dateOpen} onClick={() => (dateOpen ? setDateOpen(false) : openDates())}>
          <CalendarRange size={12} style={{ marginRight: 5, verticalAlign: -2 }} />
          {dateOpen ? "Clear dates" : "Filter by date"}
        </Chip>
      </div>

      {dateOpen && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 14, marginBottom: 14 }}>
          <DateRange
            range={range}
            min={floor}
            max={ceiling}
            onChange={setRange}
            caption={`Due ${formatDate(range.from)} — ${formatDate(range.to)}`}
          />
        </div>
      )}

      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, marginBottom: 14 }}>
        {data.shown} {data.shown === 1 ? "reminder" : "reminders"}
        {data.shown !== data.total && ` · filtered from ${data.total}`}
      </div>

      {data.groups.length === 0 && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.textDim, textAlign: "center", marginTop: 40, lineHeight: 1.6 }}>
          {data.total === 0 ? (
            <>
              No reminders yet.
              <br />
              Tap + to set one.
            </>
          ) : (
            "Nothing matches those filters."
          )}
        </div>
      )}

      {data.groups.map((group) => (
        <div key={group.key} style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 8px 2px" }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: 0.6, color: T.textDim, textTransform: "uppercase" }}>
              {group.label}
            </span>
            <span style={{ fontFamily: "'Roboto Mono', monospace", fontWeight: 700, fontSize: 11, color: group.color, background: tint(group.color, 0.16), borderRadius: 999, padding: "1px 8px" }}>
              {group.entries.length}
            </span>
          </div>
          {group.hint && (
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, margin: "-2px 0 10px 2px", lineHeight: 1.5 }}>
              {group.hint}
            </div>
          )}

          <div style={cardGrid(layout, { gap: 9 })}>
          {group.entries.map(({ reminder, customer, label }) => (
            <div
              key={reminder.id}
              style={{
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderLeft: `3px solid ${group.color}`,
                borderRadius: 14,
                padding: "11px 13px",
                opacity: reminder.isDone ? 0.75 : 1,
              }}
            >
              <button
                onClick={() => openCustomer(customer)}
                style={{ display: "flex", alignItems: "center", gap: 11, background: "none", border: "none", padding: 0, width: "100%", cursor: "pointer", textAlign: "left" }}
              >
                <Avatar customer={customer} size={38} ring={group.color} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: T.text }}>
                    {customer.name}
                  </span>
                  <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: group.color, fontWeight: 700, marginTop: 2 }}>
                    {label} · {formatDate(reminder.dueOn)}
                  </span>
                  {reminder.note && (
                    <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.textDim, marginTop: 3, lineHeight: 1.4 }}>
                      {reminder.note}
                    </span>
                  )}
                </span>
              </button>

              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <WhatsAppAction customer={customer} />
                <RowAction label="Edit" icon={Pencil} onClick={() => openEditReminder(reminder)} />
                {reminder.isDone ? (
                  <RowAction label="Not done" icon={RotateCcw} onClick={() => restoreReminder(reminder.id)} />
                ) : (
                  <RowAction label="Done" icon={Check} accent={T.green} onClick={() => dismissReminder(reminder.id)} />
                )}
                <RowAction
                  label="Delete"
                  icon={Trash2}
                  accent={T.red}
                  onClick={() => {
                    if (window.confirm(`Delete the reminder for ${customer.name} on ${formatDate(reminder.dueOn)}?`)) {
                      deleteReminder(reminder.id);
                    }
                  }}
                />
              </div>
            </div>
          ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? T.gold : T.surfaceAlt,
        color: active ? T.onGold : T.text,
        border: `1px solid ${T.border}`,
        borderRadius: 999,
        padding: "7px 12px",
        fontFamily: "'DM Sans', sans-serif",
        fontWeight: 700,
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

/**
 * Opens the WhatsApp chat with this customer. A link rather than a button, so
 * the phone hands it to the WhatsApp app instead of opening a tab; hidden
 * entirely when the stored number cannot be made into a WhatsApp one.
 */
function WhatsAppAction({ customer }) {
  const href = whatsappLink(customer.phone);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Message ${customer.name} on WhatsApp`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: tint(T.green, 0.14),
        border: `1px solid ${tint(T.green, 0.3)}`,
        borderRadius: 999,
        padding: "6px 12px",
        fontFamily: "'DM Sans', sans-serif",
        fontWeight: 700,
        fontSize: 12,
        color: T.green,
        textDecoration: "none",
      }}
    >
      <MessageCircle size={13} color={T.green} />
      WhatsApp
    </a>
  );
}

function RowAction({ label, icon: Icon, onClick, accent = T.textDim }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: T.surfaceAlt,
        border: `1px solid ${T.border}`,
        borderRadius: 999,
        padding: "6px 12px",
        fontFamily: "'DM Sans', sans-serif",
        fontWeight: 700,
        fontSize: 12,
        color: accent,
        cursor: "pointer",
      }}
    >
      <Icon size={13} color={accent} />
      {label}
    </button>
  );
}
