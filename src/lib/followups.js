/**
 * Turns the customer book into the follow-up screen's sections.
 *
 * The ordering principle is *recoverability*, not severity. A retailer who
 * missed one week has probably just been busy and a call will bring them back;
 * one who has been gone six months is a write-off. Sorting worst-first would
 * bury the calls actually worth making, so the working list runs fewest weeks
 * missed first, and among equals the most established customer goes above.
 *
 * The two groupings are facts, not thresholds: "missed last week" is the week
 * that just closed, and "never came back" is a customer who never established
 * a pattern at all.
 */
import { regularity, statusFor, targetFor, weeksSinceLastVisit } from "./analytics.js";
import { reminderStatus } from "./analytics.js";
import { currentWeekIndex, weekIndexOf } from "./weeks.js";
import { tierRank } from "./tiers.js";

/** What a retailer said when you rang. Fixed set — it becomes the churn report. */
export const REASONS = [
  { key: "price", label: "Price" },
  { key: "notNow", label: "Not now" },
  { key: "unhappy", label: "Unhappy" },
  { key: "service", label: "Bad customer service" },
  { key: "noAnswer", label: "No answer" },
];

export const reasonLabel = (key) => REASONS.find((r) => r.key === key)?.label || null;
export const isReason = (key) => REASONS.some((r) => r.key === key);

/** Fewer than three visits is not a pattern, so lateness means little. */
const ESTABLISHED_VISITS = 3;
export const isEstablished = (customer) => (customer.visits || []).length >= ESTABLISHED_VISITS;

/** Did they come in after you last called? The only win worth showing. */
export function cameBackAfterCall(customer) {
  const contact = customer.contact;
  if (!contact?.on) return false;
  const calledWeek = weekIndexOf(contact.on);
  if (calledWeek === null) return false;
  return (customer.visits || []).some((v) => {
    const w = weekIndexOf(v);
    return w !== null && w >= calledWeek && v >= contact.on;
  });
}

const snoozedNow = (customer, week) =>
  Number.isFinite(customer.snoozedUntilWeek) && customer.snoozedUntilWeek > week;

const calledThisWeek = (customer, week) => {
  const w = customer.contact?.on ? weekIndexOf(customer.contact.on) : null;
  return w !== null && w >= week;
};

/**
 * One pass over the book, sorted into the sections the screen renders.
 * Every customer lands in at most one place, so nothing is chased twice.
 */
export function buildFollowUps(customers, reminders, settings, { tiers = [], now = new Date() } = {}) {
  const week = currentWeekIndex(now);
  // Importance is the *last* word, never the first. It separates customers the
  // ordering above has already judged equally worth ringing — letting it do
  // more would push a drifting top customer up the list on reputation while
  // burying one who is genuinely further gone.
  const tier = (a, b) => tierRank(a.customer, tiers) - tierRank(b.customer, tiers);

  const dueReminders = (reminders || [])
    .map((r) => {
      // Completed reminders are kept for the Reminders screen's history, but
      // this list is only ever the work still outstanding.
      if (r.isDone) return null;
      const customer = customers.find((c) => c.id === r.customerId);
      if (!customer) return null;
      const status = reminderStatus(r, now);
      return status.key === "upcoming" ? null : { customer, reminder: r, status };
    })
    .filter(Boolean)
    .sort((a, b) => a.reminder.dueOn.localeCompare(b.reminder.dueOn) || tier(a, b));

  const remindedIds = new Set(dueReminders.map((r) => r.customer.id));

  const sections = { missedLastWeek: [], stillAway: [], neverReturned: [], snoozed: [], called: [], cameBack: [] };

  for (const customer of customers) {
    const status = statusFor(customer, settings, now);
    const entry = {
      customer,
      status,
      weeksMissed: status.weeksMissed ?? 0,
      weeksAway: weeksSinceLastVisit(customer, now),
      target: targetFor(customer, settings),
      visits: (customer.visits || []).length,
      regularity: regularity(customer, now),
    };

    if (cameBackAfterCall(customer)) {
      sections.cameBack.push(entry);
      continue;
    }
    if (status.key !== "missed") continue; // on track, due this week, or never seen
    if (remindedIds.has(customer.id)) continue; // already surfaced above

    if (snoozedNow(customer, week)) sections.snoozed.push(entry);
    else if (calledThisWeek(customer, week)) sections.called.push(entry);
    else if (!isEstablished(customer)) sections.neverReturned.push(entry);
    else if (entry.weeksMissed === 1) sections.missedLastWeek.push(entry);
    else sections.stillAway.push(entry);
  }

  // Most established first among the freshly missed — the biggest thing at risk.
  sections.missedLastWeek.sort((a, b) => b.visits - a.visits || tier(a, b));
  // Then by recoverability: least time away first, biggest customer to break ties.
  sections.stillAway.sort((a, b) => a.weeksMissed - b.weeksMissed || b.visits - a.visits || tier(a, b));
  sections.neverReturned.sort((a, b) => a.weeksMissed - b.weeksMissed || tier(a, b));
  sections.snoozed.sort((a, b) => (a.customer.snoozedUntilWeek || 0) - (b.customer.snoozedUntilWeek || 0));
  sections.called.sort((a, b) => b.visits - a.visits || tier(a, b));
  sections.cameBack.sort((a, b) => (b.customer.contact?.on || "").localeCompare(a.customer.contact?.on || ""));

  return {
    ...sections,
    reminders: dueReminders,
    toCallCount: dueReminders.length + sections.missedLastWeek.length + sections.stillAway.length,
  };
}
