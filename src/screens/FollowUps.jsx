import React, { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Clock, Plus, RotateCcw } from "lucide-react";
import { T, tint } from "../theme.js";
import { buildFollowUps, reasonLabel } from "../lib/followups.js";
import { formatDate } from "../lib/dates.js";
import { tradingDaysLeft } from "../lib/weeks.js";
import Avatar from "../components/Avatar.jsx";

/**
 * Who to ring, in the order worth ringing them.
 *
 * Grouped by facts rather than invented thresholds: the week that just closed,
 * and customers who never established a pattern at all. Everything that needs
 * no action today is collapsed, so the screen opens on the work.
 */
export default function FollowUps({
  customers,
  reminders,
  settings,
  openCustomer,
  dismissReminder,
  openAddReminder,
  openCalled,
  openSnooze,
  unsnooze,
}) {
  const data = useMemo(() => buildFollowUps(customers, reminders, settings), [customers, reminders, settings]);
  const [open, setOpen] = useState({});
  const toggle = (key) => setOpen((o) => ({ ...o, [key]: !o[key] }));

  const daysLeft = tradingDaysLeft();

  return (
    <div style={{ padding: "8px 16px 110px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 20, color: T.text }}>Follow-ups</div>
        <button
          onClick={openAddReminder}
          aria-label="Add reminder"
          style={{ width: 40, height: 40, borderRadius: "50%", background: T.gold, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
        >
          <Plus size={20} color={T.onGold} />
        </button>
      </div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.textDim, marginBottom: 16 }}>
        {data.toCallCount === 0
          ? "Nobody to chase. Everyone is coming in as expected."
          : `${data.toCallCount} to call${daysLeft > 0 ? ` · ${daysLeft} trading ${daysLeft === 1 ? "day" : "days"} left this week` : " · shop is shut today"}`}
      </div>

      {data.reminders.length > 0 && (
        <Group title="Reminders you set" count={data.reminders.length} accent={T.gold} alwaysOpen>
          {data.reminders.map(({ customer, reminder, status }) => (
            <Row key={reminder.id} customer={customer} accent={status.color} onOpen={() => openCustomer(customer)}>
              <Line color={status.color}>{status.label}</Line>
              {reminder.note && <Line>{reminder.note}</Line>}
              <Actions>
                <Action label="Done" icon={Check} onClick={() => dismissReminder(reminder.id)} />
              </Actions>
            </Row>
          ))}
        </Group>
      )}

      {data.missedLastWeek.length > 0 && (
        <Group title="Missed last week" count={data.missedLastWeek.length} accent={T.red} alwaysOpen
               hint="Most recoverable — they have probably just been busy.">
          {data.missedLastWeek.map((e) => (
            <CallRow key={e.customer.id} entry={e} openCustomer={openCustomer} openCalled={openCalled} openSnooze={openSnooze} />
          ))}
        </Group>
      )}

      {data.stillAway.length > 0 && (
        <Group title="Still away" count={data.stillAway.length} accent={T.red} alwaysOpen
               hint="Least time away first — those are the ones a call can still save.">
          {data.stillAway.map((e) => (
            <CallRow key={e.customer.id} entry={e} openCustomer={openCustomer} openCalled={openCalled} openSnooze={openSnooze} />
          ))}
        </Group>
      )}

      {data.cameBack.length > 0 && (
        <Group title="Came back after your call" count={data.cameBack.length} accent={T.green}
               open={open.cameBack} onToggle={() => toggle("cameBack")}>
          {data.cameBack.map((e) => (
            <Row key={e.customer.id} customer={e.customer} accent={T.green} onOpen={() => openCustomer(e.customer)}>
              <Line color={T.green}>Came in after you rang on {formatDate(e.customer.contact.on)}</Line>
            </Row>
          ))}
        </Group>
      )}

      {data.called.length > 0 && (
        <Group title="Called this week" count={data.called.length} accent={T.blue}
               open={open.called} onToggle={() => toggle("called")}>
          {data.called.map((e) => (
            <Row key={e.customer.id} customer={e.customer} accent={T.blue} onOpen={() => openCustomer(e.customer)}>
              <Line color={T.blue}>
                {reasonLabel(e.customer.contact?.reason) || "Called"} · {formatDate(e.customer.contact.on)}
              </Line>
              {e.customer.contact?.note && <Line>{e.customer.contact.note}</Line>}
            </Row>
          ))}
        </Group>
      )}

      {data.snoozed.length > 0 && (
        <Group title="Snoozed" count={data.snoozed.length} accent={T.textDim}
               open={open.snoozed} onToggle={() => toggle("snoozed")}>
          {data.snoozed.map((e) => (
            <Row key={e.customer.id} customer={e.customer} accent={T.border} onOpen={() => openCustomer(e.customer)}>
              <Line>{e.status.label}</Line>
              <Actions>
                <Action label="Bring back" icon={RotateCcw} onClick={() => unsnooze(e.customer.id)} />
              </Actions>
            </Row>
          ))}
        </Group>
      )}

      {data.neverReturned.length > 0 && (
        <Group title="Never came back" count={data.neverReturned.length} accent={T.grey}
               open={open.never} onToggle={() => toggle("never")}
               hint="One or two visits and gone. A different conversation to a lapsed regular.">
          {data.neverReturned.map((e) => (
            <CallRow key={e.customer.id} entry={e} openCustomer={openCustomer} openCalled={openCalled} openSnooze={openSnooze} />
          ))}
        </Group>
      )}

      {data.toCallCount === 0 && data.cameBack.length === 0 && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.textDim, textAlign: "center", marginTop: 50, lineHeight: 1.6 }}>
          Nothing to follow up on.
          <br />
          Come back on Monday.
        </div>
      )}
    </div>
  );
}

/* ---------------- pieces ---------------- */

function Group({ title, count, accent, hint, children, alwaysOpen, open, onToggle }) {
  const expanded = alwaysOpen || open;
  return (
    <div style={{ marginBottom: 18 }}>
      <button
        onClick={alwaysOpen ? undefined : onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "none",
          border: "none",
          padding: "0 0 8px 2px",
          cursor: alwaysOpen ? "default" : "pointer",
          textAlign: "left",
        }}
      >
        {!alwaysOpen &&
          (expanded ? <ChevronDown size={15} color={T.textDim} /> : <ChevronRight size={15} color={T.textDim} />)}
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: 0.6, color: T.textDim, textTransform: "uppercase" }}>
          {title}
        </span>
        <span style={{ fontFamily: "'Roboto Mono', monospace", fontWeight: 700, fontSize: 11, color: accent, background: tint(accent, 0.16), borderRadius: 999, padding: "1px 8px" }}>
          {count}
        </span>
      </button>
      {expanded && hint && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, margin: "-2px 0 10px 2px", lineHeight: 1.5 }}>
          {hint}
        </div>
      )}
      {expanded && children}
    </div>
  );
}

function Row({ customer, accent, onOpen, children }) {
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 14,
        padding: "11px 13px",
        marginBottom: 9,
      }}
    >
      <button
        onClick={onOpen}
        style={{ display: "flex", alignItems: "center", gap: 11, background: "none", border: "none", padding: 0, width: "100%", cursor: "pointer", textAlign: "left" }}
      >
        <Avatar customer={customer} size={38} ring={accent} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: T.text }}>
            {customer.name}
          </span>
          {children}
        </span>
      </button>
    </div>
  );
}

const Line = ({ color, children }) => (
  <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: color || T.textDim, fontWeight: color ? 700 : 400, marginTop: 2, lineHeight: 1.4 }}>
    {children}
  </span>
);

const Actions = ({ children }) => (
  <span style={{ display: "flex", gap: 8, marginTop: 9 }}>{children}</span>
);

function Action({ label, icon: Icon, onClick, accent = T.textDim }) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }
      }}
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
    </span>
  );
}

/** A row you can act on: the facts that justify the call, then the two actions. */
function CallRow({ entry, openCustomer, openCalled, openSnooze }) {
  const { customer, status, visits, regularity: reg, weeksAway, target } = entry;
  const cadence =
    `${target.weeks === 1 ? "weekly" : `every ${target.weeks} weeks`}` + (target.isDefault ? " (default)" : "");

  return (
    <Row customer={customer} accent={status.color} onOpen={() => openCustomer(customer)}>
      <Line color={status.color}>{status.label}</Line>
      {/* The absolute fact first — "I haven't seen them in 3 weeks" is what the
          owner actually feels; the cadence is what makes it a problem. */}
      <Line>
        {weeksAway != null && `Last in ${weeksAway} ${weeksAway === 1 ? "week" : "weeks"} ago · `}
        comes {cadence}
      </Line>
      <Line>
        {visits} {visits === 1 ? "visit" : "visits"}
        {reg ? ` · ${reg}` : ""}
      </Line>
      {customer.contact?.reason && (
        <Line>Last time: {reasonLabel(customer.contact.reason)} ({formatDate(customer.contact.on)})</Line>
      )}
      <Actions>
        <Action label="Called" icon={Check} onClick={() => openCalled(customer)} accent={T.gold} />
        <Action label="Snooze" icon={Clock} onClick={() => openSnooze(customer)} />
      </Actions>
    </Row>
  );
}
