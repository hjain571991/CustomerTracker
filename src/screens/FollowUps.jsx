import React, { useId, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Clock, MessageCircle, Pencil, Plus, RotateCcw } from "lucide-react";
import { T, tint } from "../theme.js";
import { buildFollowUps, reasonLabel } from "../lib/followups.js";
import { formatDate } from "../lib/dates.js";
import { tradingDaysLeft } from "../lib/weeks.js";
import Avatar from "../components/Avatar.jsx";
import Segmented from "../components/Segmented.jsx";
import Reminders from "./Reminders.jsx";
import { cardGrid, screenPadding, useLayout } from "../lib/layout.js";
import { whatsappLink } from "../lib/whatsapp.js";
import { isOpen, loadCollapsed, saveCollapsed } from "../lib/collapsed.js";

const viewsFor = (reminders) => [
  { key: "call", label: "To call" },
  // The badge is what is still outstanding, completed ones excluded — a count
  // that only ever grows would stop meaning anything.
  { key: "reminders", label: "All reminders", count: (reminders || []).filter((r) => !r.isDone).length || null },
];

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
  tiers,
  openCustomer,
  dismissReminder,
  restoreReminder,
  deleteReminder,
  openEditReminder,
  openAddReminder,
  openCalled,
  openSnooze,
  unsnooze,
}) {
  const layout = useLayout();
  const [view, setView] = useState("call");
  const views = useMemo(() => viewsFor(reminders), [reminders]);
  const data = useMemo(
    () => buildFollowUps(customers, reminders, settings, { tiers }),
    [customers, reminders, settings, tiers]
  );

  // Folded sections are remembered across visits — see `collapsed.js`.
  const [folds, setFolds] = useState(loadCollapsed);
  const toggle = (key) =>
    setFolds((prev) => {
      const next = { ...prev, [key]: !isOpen(prev, key) };
      saveCollapsed(next);
      return next;
    });
  /** Everything a Group needs to open, close and remember itself. */
  const fold = (key) => ({ open: isOpen(folds, key), onToggle: () => toggle(key) });

  const daysLeft = tradingDaysLeft();

  // The whole list of reminders is its own screen — the call list is only what
  // needs doing today, and mixing the two would bury that.
  if (view === "reminders") {
    return (
      <div style={{ ...screenPadding(layout, { bottom: 0 }) }}>
        <Segmented options={views} value={view} onChange={setView} />
        <div style={{ margin: `14px ${-layout.gutter}px 0` }}>
          <Reminders
            customers={customers}
            reminders={reminders}
            openCustomer={openCustomer}
            openAddReminder={openAddReminder}
            openEditReminder={openEditReminder}
            dismissReminder={dismissReminder}
            restoreReminder={restoreReminder}
            deleteReminder={deleteReminder}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={screenPadding(layout)}>
      <Segmented options={views} value={view} onChange={setView} style={{ marginBottom: 14 }} />

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
        <Group title="Reminders you set" count={data.reminders.length} accent={T.gold} {...fold("reminders")}>
          {data.reminders.map(({ customer, reminder, status }) => (
            <Row key={reminder.id} customer={customer} accent={status.color} onOpen={() => openCustomer(customer)}>
              <Line color={status.color}>{status.label}</Line>
              {reminder.note && <Line>{reminder.note}</Line>}
              <Actions>
                <WhatsAppAction customer={customer} />
                <Action label="Done" icon={Check} onClick={() => dismissReminder(reminder.id)} />
                <Action label="Edit" icon={Pencil} onClick={() => openEditReminder(reminder)} />
              </Actions>
            </Row>
          ))}
        </Group>
      )}

      {data.missedLastWeek.length > 0 && (
        <Group title="Missed last week" count={data.missedLastWeek.length} accent={T.red} {...fold("missedLastWeek")}
               hint="Most recoverable — they have probably just been busy.">
          {data.missedLastWeek.map((e) => (
            <CallRow key={e.customer.id} entry={e} openCustomer={openCustomer} openCalled={openCalled} openSnooze={openSnooze} />
          ))}
        </Group>
      )}

      {data.stillAway.length > 0 && (
        <Group title="Still away" count={data.stillAway.length} accent={T.red} {...fold("stillAway")}
               hint="Least time away first — those are the ones a call can still save.">
          {data.stillAway.map((e) => (
            <CallRow key={e.customer.id} entry={e} openCustomer={openCustomer} openCalled={openCalled} openSnooze={openSnooze} />
          ))}
        </Group>
      )}

      {data.cameBack.length > 0 && (
        <Group title="Came back after your call" count={data.cameBack.length} accent={T.green} {...fold("cameBack")}>
          {data.cameBack.map((e) => (
            <Row key={e.customer.id} customer={e.customer} accent={T.green} onOpen={() => openCustomer(e.customer)}>
              <Line color={T.green}>Came in after you rang on {formatDate(e.customer.contact.on)}</Line>
            </Row>
          ))}
        </Group>
      )}

      {data.called.length > 0 && (
        <Group title="Called this week" count={data.called.length} accent={T.blue} {...fold("called")}>
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
        <Group title="Snoozed" count={data.snoozed.length} accent={T.textDim} {...fold("snoozed")}>
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
        <Group title="Never came back" count={data.neverReturned.length} accent={T.grey} {...fold("neverReturned")}
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

/**
 * One foldable section of the call list.
 *
 * Every section folds, including the three that carry today's work. On a long
 * Monday "Still away" can run to forty cards, which buries the two people who
 * only missed last week — being able to put it away is the difference between
 * a list you work through and one you scroll past.
 *
 * The count stays on the header when folded, so a closed section still says
 * how much is behind it and nothing disappears silently.
 */
function Group({ title, count, accent, hint, children, open, onToggle }) {
  const layout = useLayout();
  // Ties the header to the panel it controls, for screen readers.
  const bodyId = useId();

  return (
    <div style={{ marginBottom: open ? 18 : 10 }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "none",
          border: "none",
          padding: "6px 2px 8px",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {open ? <ChevronDown size={15} color={T.textDim} /> : <ChevronRight size={15} color={T.textDim} />}
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: 0.6, color: T.textDim, textTransform: "uppercase" }}>
          {title}
        </span>
        <span style={{ fontFamily: "'Roboto Mono', monospace", fontWeight: 700, fontSize: 11, color: accent, background: tint(accent, 0.16), borderRadius: 999, padding: "1px 8px" }}>
          {count}
        </span>
      </button>
      {/*
        The panel stays in the document even when folded, so `aria-controls`
        always points at something real; its rows do not, so a closed section
        costs nothing to render.
      */}
      <div id={bodyId} hidden={!open}>
        {open && (
          <>
            {hint && (
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, margin: "-2px 0 10px 2px", lineHeight: 1.5 }}>
                {hint}
              </div>
            )}
            <div style={cardGrid(layout, { gap: 9 })}>{children}</div>
          </>
        )}
      </div>
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
      }}
    >
      {/*
        A div with a role rather than a <button>: the actions nested inside it
        include a real <a> for WhatsApp, and an anchor inside a button is
        invalid HTML that browsers quietly drop.
      */}
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", cursor: "pointer", textAlign: "left" }}
      >
        <Avatar customer={customer} size={38} ring={accent} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: T.text }}>
            {customer.name}
          </span>
          {children}
        </span>
      </div>
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

/**
 * WhatsApp for one customer.
 *
 * A real link, not a button with a handler: it has to be a link for the phone
 * to hand it to the WhatsApp app rather than opening a tab. It opens the chat
 * — WhatsApp publishes no URL that starts a voice call — so it is labelled for
 * what it does, with the call a tap away once the chat is open.
 *
 * Nothing is shown at all when the number cannot be made into a WhatsApp one;
 * a dead button is worse than no button on a shop floor.
 */
function WhatsAppAction({ customer }) {
  const href = whatsappLink(customer.phone);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
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
        cursor: "pointer",
      }}
    >
      <MessageCircle size={13} color={T.green} />
      WhatsApp
    </a>
  );
}

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
        <WhatsAppAction customer={customer} />
        <Action label="Called" icon={Check} onClick={() => openCalled(customer)} accent={T.gold} />
        <Action label="Snooze" icon={Clock} onClick={() => openSnooze(customer)} />
      </Actions>
    </Row>
  );
}
