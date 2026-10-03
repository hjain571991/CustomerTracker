/**
 * Every recorded visit, flattened across the book and grouped by day.
 *
 * Visits are stored per customer as plain dates, so the "log" is a view over
 * them rather than a second source of truth — delete an entry here and it is
 * gone from that customer's history, with nothing left to reconcile.
 *
 * There is no record of *when* a visit was keyed in, only which day it is for.
 * That is enough for the job: a mis-tap is logged for today, so it surfaces at
 * the top of the list.
 */
import { DISPLAY_LOCALE, daysAgo, parseIsoToDate } from "./dates.js";

export const DEFAULT_WINDOW_DAYS = 30;

function dayLabel(iso, now) {
  const n = daysAgo(iso, now);
  if (n === 0) return "Today";
  if (n === 1) return "Yesterday";
  const d = parseIsoToDate(iso);
  if (!d) return iso;
  return d.toLocaleDateString(DISPLAY_LOCALE, { weekday: "short", day: "numeric", month: "short" });
}

/**
 * @param windowDays  how far back to include; null for everything
 * @param query       matches customer name or phone
 */
export function buildVisitLog(customers, { windowDays = DEFAULT_WINDOW_DAYS, query = "" } = {}, now = new Date()) {
  const q = query.trim().toLowerCase();

  const all = [];
  for (const customer of customers) {
    for (const date of customer.visits || []) {
      all.push({ customer, date, age: daysAgo(date, now) });
    }
  }

  const matching = q
    ? all.filter((e) => e.customer.name.toLowerCase().includes(q) || (e.customer.phone || "").includes(q))
    : all;

  const within = windowDays === null ? matching : matching.filter((e) => e.age !== null && e.age <= windowDays);

  // Newest day first; within a day, alphabetical so the order is stable.
  within.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.customer.name.localeCompare(b.customer.name)));

  const groups = [];
  for (const entry of within) {
    const head = groups[groups.length - 1];
    if (head && head.date === entry.date) head.entries.push(entry);
    else groups.push({ date: entry.date, label: dayLabel(entry.date, now), entries: [entry] });
  }

  return {
    groups,
    shown: within.length,
    matching: matching.length,
    olderHidden: matching.length - within.length,
    total: all.length,
  };
}
