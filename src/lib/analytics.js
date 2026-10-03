import { STATUS, T } from "../theme.js";
import { daysAgo, daysUntil } from "./dates.js";
import { clampWeeks, parseWeeks } from "./settings.js";
import { currentWeekIndex, weekCount, weekIndexOf, weeksSince } from "./weeks.js";

/**
 * Visit dates as whole days-ago, most recent first — the shape every rhythm
 * calculation below expects. Undated or future entries are dropped.
 */
export function visitDays(customer, now = new Date()) {
  return (customer.visits || [])
    .map((iso) => daysAgo(iso, now))
    .filter((n) => n !== null && n >= 0)
    .sort((a, b) => a - b);
}

function gapsOf(days) {
  const g = [];
  for (let i = 0; i < days.length - 1; i++) g.push(days[i + 1] - days[i]);
  return g;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * The cadence in force for a customer: the one the owner set on them, else the
 * app-wide default. Nothing is inferred from history — an inferred cadence
 * drifts to match a customer who is drifting away, hiding the very decline
 * this app exists to catch.
 */
export function targetFor(customer, settings) {
  const own = parseWeeks(customer.visitEveryWeeks);
  if (own !== null) return { weeks: own, isDefault: false };
  return { weeks: clampWeeks(settings.defaultIntervalWeeks), isDefault: true };
}

/** Trading weeks since their last visit. 0 means they have been in this week. */
export function weeksSinceLastVisit(customer, now = new Date()) {
  const weeks = (customer.visits || [])
    .map((iso) => weeksSince(iso, now))
    .filter((n) => n !== null && n >= 0);
  return weeks.length ? Math.min(...weeks) : null;
}

/**
 * Where a customer stands against their cadence, measured in trading weeks.
 *
 *   onTrack      their week has not come round yet
 *   dueThisWeek  this is their week and they have until Saturday
 *   missed       the week closed without them — this is the call
 *   never        nothing on record to measure from
 */
export function statusFor(customer, settings, now = new Date()) {
  const since = weeksSinceLastVisit(customer, now);
  if (since === null) return { ...STATUS.never, weeksMissed: null };

  const target = targetFor(customer, settings).weeks;

  if (since < target) return { ...STATUS.onTrack, weeksMissed: 0 };
  if (since === target) return { ...STATUS.dueThisWeek, weeksMissed: 0 };

  const missed = since - target;
  return { ...STATUS.missed, label: `Missed ${weekCount(missed)}`, weeksMissed: missed };
}

/** How many visits they were expected to make and did not. Drives the ordering. */
export function weeksMissed(customer, settings, now = new Date()) {
  return statusFor(customer, settings, now).weeksMissed ?? 0;
}

/** Observed average gap — a reality check against the target, not the status. */
export function avgGap(customer, now = new Date()) {
  const days = visitDays(customer, now);
  if (days.length < 2) return null;
  return Math.round(mean(gapsOf(days)));
}

export function regularity(customer, now = new Date()) {
  const days = visitDays(customer, now);
  if (days.length < 3) return null;
  const g = gapsOf(days);
  const avg = mean(g);
  if (avg === 0) return "very regular";
  const ratio = Math.sqrt(mean(g.map((x) => (x - avg) ** 2))) / avg;
  if (ratio < 0.25) return "very regular";
  if (ratio < 0.6) return "fairly regular";
  return "irregular";
}

export function daysSinceLastVisit(customer, now = new Date()) {
  const days = visitDays(customer, now);
  return days.length ? days[0] : null;
}

export function reminderStatus(reminder, now = new Date()) {
  const until = daysUntil(reminder.dueOn, now);
  if (until === null) return { key: "upcoming", label: "Call them", color: T.blue };
  if (until > 0) return { key: "upcoming", label: `Call in ${until}d`, color: T.blue };
  if (until === 0) return { key: "today", label: "Call today", color: T.amber };
  return { key: "overdue", label: `${-until}d overdue`, color: T.red };
}

export function initialsFor(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
