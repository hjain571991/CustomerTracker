/**
 * App-wide policy the owner sets once, rather than the app inferring it.
 *
 * `defaultIntervalWeeks` covers any customer with no cadence of their own —
 * new ones, and rows imported from a sheet without the column — so the app
 * never has to guess from visit history.
 *
 * There is deliberately no "grace" setting: the trading week is the grace.
 * A customer due this week has until Saturday, and only lands on the call list
 * when the week closes without them.
 */

const KEY = "cvt.settings.v1";

export const MIN_WEEKS = 1;
export const MAX_WEEKS = 52;

export const DEFAULT_SETTINGS = {
  defaultIntervalWeeks: 1,
};

export const WEEK_PRESETS = [
  { label: "Every week", weeks: 1 },
  { label: "Every 2 weeks", weeks: 2 },
  { label: "Every 3 weeks", weeks: 3 },
  { label: "Every 4 weeks", weeks: 4 },
];

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** A positive whole number of weeks, or null if the value isn't one. */
export function parseWeeks(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < MIN_WEEKS) return null;
  return clamp(n, MIN_WEEKS, MAX_WEEKS);
}

/** Legacy sheets carried a day count; a fortnight is two weeks either way. */
export function weeksFromDays(value) {
  const days = Number(value);
  if (!Number.isFinite(days) || days < 1) return null;
  return clamp(Math.max(1, Math.round(days / 7)), MIN_WEEKS, MAX_WEEKS);
}

export const clampWeeks = (n) => clamp(Math.round(Number(n) || 0) || MIN_WEEKS, MIN_WEEKS, MAX_WEEKS);

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
    // A stored day-based default from an earlier build converts rather than breaking.
    const weeks =
      raw.defaultIntervalWeeks ??
      weeksFromDays(raw.defaultIntervalDays) ??
      DEFAULT_SETTINGS.defaultIntervalWeeks;
    return { defaultIntervalWeeks: clampWeeks(weeks) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ defaultIntervalWeeks: clampWeeks(settings.defaultIntervalWeeks) }));
    return true;
  } catch {
    return false;
  }
}
