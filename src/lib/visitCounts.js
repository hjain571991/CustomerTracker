/**
 * "How many times has this customer been in over the last N?"
 *
 * A plain count, not a rate — no denominator, so none of the divide-by-a-short
 * history problems that make averages lie. The one honesty requirement left is
 * saying when the window reaches further back than the records do: eight
 * visits "in the last year" means something different if the sheet only holds
 * three months.
 */
import { parseIsoToDate, toIso, todayIso } from "./dates.js";

export const COUNT_PERIODS = [
  { key: "4w", label: "Last 4 weeks", days: 28 },
  { key: "3m", label: "Last 3 months", months: 3 },
  { key: "6m", label: "Last 6 months", months: 6 },
  { key: "12m", label: "Last 12 months", months: 12 },
];

/** Start of a period, counting back from today. Month arithmetic is calendar. */
export function periodStart(period, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period.days) {
    d.setDate(d.getDate() - period.days);
  } else {
    const day = d.getDate();
    d.setDate(1); // step months without rolling 31 Mar back into March
    d.setMonth(d.getMonth() - period.months);
    const lastOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastOfMonth));
  }
  return toIso(d);
}

export const todayOf = (now = new Date()) => toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate()));

/** Visits inside an inclusive range. Nothing dated after today ever counts. */
export function countVisitsBetween(customer, fromIso, toIso_, now = new Date()) {
  const end = toIso_ && toIso_ < todayOf(now) ? toIso_ : todayOf(now);
  return (customer.visits || []).filter((v) => v >= fromIso && v <= end).length;
}

/** Back-compat shorthand for an open-ended range ending today. */
export const countVisitsSince = (customer, fromIso, now = new Date()) =>
  countVisitsBetween(customer, fromIso, null, now);

/**
 * A period becomes a concrete `{ from, to }`. Presets count back from today;
 * a custom period carries its own dates.
 */
export function resolveRange(period, now = new Date()) {
  if (period.from) return { from: period.from, to: period.to || todayOf(now) };
  return { from: periodStart(period, now), to: todayOf(now) };
}

/** The oldest visit anywhere in the book — the floor for a custom from-date. */
export function earliestVisit(customers) {
  let oldest = null;
  for (const customer of customers) {
    const first = firstVisit(customer);
    if (first && (!oldest || first < oldest)) oldest = first;
  }
  return oldest;
}

/**
 * Holds a custom range inside the data that exists: no earlier than the first
 * record, no later than today, and never back-to-front. Picking a window from
 * before there was anything to measure can only produce a misleading zero.
 */
export function clampRange({ from, to }, { min, max }) {
  let start = from && min && from < min ? min : from;
  let end = to && max && to > max ? max : to;
  if (start && max && start > max) start = max;
  if (end && min && end < min) end = min;
  if (start && end && start > end) end = start;
  return { from: start, to: end };
}

export function firstVisit(customer) {
  const visits = customer.visits || [];
  return visits.length ? visits[visits.length - 1] : null;
}

/**
 * One row per period, plus whether the records actually reach that far back.
 * `coversPeriod` is false when the first visit on record is more recent than
 * the window, which is the case the caller needs to caption.
 */
export function visitCounts(customer, now = new Date(), periods = COUNT_PERIODS) {
  const first = firstVisit(customer);
  return periods.map((period) => {
    const from = periodStart(period, now);
    return {
      ...period,
      from,
      count: countVisitsSince(customer, from, now),
      coversPeriod: Boolean(first) && first <= from,
    };
  });
}

/** Days of history actually on record, for the caption. */
export function historyDays(customer, now = new Date()) {
  const first = firstVisit(customer);
  const d = parseIsoToDate(first);
  if (!d) return 0;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((today - d) / 86400000));
}

export { todayIso };
