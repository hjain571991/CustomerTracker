/**
 * Trading weeks.
 *
 * The shop runs Monday to Saturday and is shut on Sunday, so a customer's
 * cadence is "once a week" or "once a fortnight" — not a rolling day count.
 * A visit anywhere inside the Mon–Sat window counts for that week.
 *
 * Weeks are numbered from a fixed Monday, which makes "how many weeks between
 * these two dates" a subtraction. Sunday falls at the *end* of its week, so
 * nothing changes on the closed day and the list turns over on Monday morning.
 */
import { parseIsoToDate } from "./dates.js";

const MS_PER_WEEK = 604800000;
// 1 January 2024 was a Monday.
const EPOCH_MONDAY_UTC = Date.UTC(2024, 0, 1);

const utcMidnight = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());

/** Week number for a Date, counting Monday-start weeks from the epoch. */
export function weekIndexOfDate(date) {
  return Math.floor((utcMidnight(date) - EPOCH_MONDAY_UTC) / MS_PER_WEEK);
}

/** Week number for an ISO date string, or null if it isn't one. */
export function weekIndexOf(isoDate) {
  const d = parseIsoToDate(isoDate);
  return d ? weekIndexOfDate(d) : null;
}

export const currentWeekIndex = (now = new Date()) => weekIndexOfDate(now);

/** Whole trading weeks between an ISO date and today. 0 means "this week". */
export function weeksSince(isoDate, now = new Date()) {
  const week = weekIndexOf(isoDate);
  return week === null ? null : currentWeekIndex(now) - week;
}

/** True on the one day a week the shop is shut. */
export const isClosedToday = (now = new Date()) => now.getDay() === 0;

/**
 * Trading days left in this week, today included: 6 on Monday down to 1 on
 * Saturday, and 0 on Sunday when the week is already over.
 */
export function tradingDaysLeft(now = new Date()) {
  const day = now.getDay(); // 0 = Sunday
  return day === 0 ? 0 : 7 - day;
}

/** The Monday that opens a given week number. */
export function mondayOfWeek(weekIndex) {
  const ms = EPOCH_MONDAY_UTC + weekIndex * MS_PER_WEEK;
  const d = new Date(ms);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** "3 weeks" / "1 week", for labels. */
export const weekCount = (n) => `${n} ${Math.abs(n) === 1 ? "week" : "weeks"}`;
