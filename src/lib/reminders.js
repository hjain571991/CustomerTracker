/**
 * Every reminder ever set, not just the ones due.
 *
 * The follow-ups screen deliberately shows only what needs doing today, which
 * means a reminder set for next month is invisible until it lands, and one
 * ticked off is gone for good. This is the other view: the whole list, so the
 * owner can see what is coming, what was missed, and what was already dealt
 * with — and change any of it.
 *
 * Completed reminders are kept rather than deleted. "I called them about the
 * Diwali order three weeks ago" is a fact worth holding on to, and the sheet
 * has always kept the row anyway.
 */
import { daysUntil, todayIso } from "./dates.js";
import { T } from "../theme.js";

/** Newest work first within a group; the group order carries the urgency. */
export const REMINDER_GROUPS = [
  {
    key: "overdue",
    label: "Overdue",
    hint: "The day came and went without this being ticked off.",
    color: T.red,
  },
  { key: "today", label: "Due today", hint: null, color: T.amber },
  { key: "upcoming", label: "Upcoming", hint: null, color: T.blue },
  {
    key: "done",
    label: "Completed",
    hint: "Kept so there is a record of what was followed up and when.",
    color: T.green,
  },
];

/** Which group a reminder belongs in. Done wins over its date. */
export function groupOf(reminder, now = new Date()) {
  if (reminder.isDone) return "done";
  const until = daysUntil(reminder.dueOn, now);
  if (until === null) return "upcoming"; // no readable date — treat as not yet due
  if (until < 0) return "overdue";
  if (until === 0) return "today";
  return "upcoming";
}

/** "in 3 days" / "today" / "4 days overdue" — the line under the customer name. */
export function dueLabel(reminder, now = new Date()) {
  if (reminder.isDone) return "Done";
  const until = daysUntil(reminder.dueOn, now);
  if (until === null) return "No date";
  if (until === 0) return "Due today";
  if (until > 0) return `In ${until} ${until === 1 ? "day" : "days"}`;
  return `${-until} ${-until === 1 ? "day" : "days"} overdue`;
}

/**
 * The whole book of reminders, grouped and filtered.
 *
 * @param query     matches the customer's name, phone or the reminder note
 * @param from/to   inclusive ISO bounds on the due date; either may be omitted
 * @param showDone  include completed reminders
 */
export function buildReminderList(
  customers,
  reminders,
  { query = "", from = null, to = null, showDone = true } = {},
  now = new Date()
) {
  const q = query.trim().toLowerCase();
  const byId = new Map((customers || []).map((c) => [c.id, c]));

  const entries = (reminders || [])
    .map((reminder) => {
      const customer = byId.get(reminder.customerId);
      if (!customer) return null; // the customer was removed; the row is orphaned
      return { reminder, customer, group: groupOf(reminder, now), label: dueLabel(reminder, now) };
    })
    .filter(Boolean)
    .filter((e) => showDone || !e.reminder.isDone)
    .filter(
      (e) =>
        !q ||
        e.customer.name.toLowerCase().includes(q) ||
        (e.customer.phone || "").includes(q) ||
        (e.reminder.note || "").toLowerCase().includes(q)
    )
    .filter((e) => (!from || e.reminder.dueOn >= from) && (!to || e.reminder.dueOn <= to));

  const groups = REMINDER_GROUPS.map((group) => ({
    ...group,
    entries: entries
      .filter((e) => e.group === group.key)
      // Soonest first while it still matters; most recent first once it doesn't.
      .sort((a, b) =>
        group.key === "upcoming" || group.key === "today"
          ? a.reminder.dueOn.localeCompare(b.reminder.dueOn)
          : b.reminder.dueOn.localeCompare(a.reminder.dueOn)
      ),
  })).filter((g) => g.entries.length > 0);

  return {
    groups,
    shown: entries.length,
    total: (reminders || []).length,
    counts: REMINDER_GROUPS.reduce((acc, g) => {
      acc[g.key] = entries.filter((e) => e.group === g.key).length;
      return acc;
    }, {}),
  };
}

/** The earliest due date on record — the floor for a date filter. */
export function earliestDue(reminders) {
  let oldest = null;
  for (const r of reminders || []) {
    if (r.dueOn && (!oldest || r.dueOn < oldest)) oldest = r.dueOn;
  }
  return oldest;
}

/** The latest due date on record. Reminders run into the future, so this is not today. */
export function latestDue(reminders, now = new Date()) {
  let newest = todayIso(now);
  for (const r of reminders || []) {
    if (r.dueOn && r.dueOn > newest) newest = r.dueOn;
  }
  return newest;
}
