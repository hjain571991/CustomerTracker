/**
 * The app stores real calendar dates (ISO `YYYY-MM-DD`) so that data loaded
 * from a spreadsheet stays correct tomorrow. All the visit-rhythm maths still
 * works in whole days-ago, so these helpers are the bridge between the two.
 */

const MS_PER_DAY = 86400000;

/** Local midnight for a date, so day arithmetic ignores clock time and DST. */
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function todayIso() {
  return toIso(new Date());
}

export function toIso(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Parses the date shapes a spreadsheet realistically produces:
 * ISO `2026-09-05`, `05/09/2026` and `05-09-2026` (day-first, the Indian
 * convention), and the Excel serial numbers SheetJS hands back for real date
 * cells. Returns an ISO string, or null when the value isn't a date.
 */
export function parseDate(value) {
  if (value == null) return null;
  if (value instanceof Date && !isNaN(value)) return toIso(value);

  if (typeof value === "number" && isFinite(value)) return fromExcelSerial(value);

  const s = String(value).trim();
  if (!s) return null;

  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return buildIso(+y, +m, +d);
  }

  // Day-first: 05/09/2026 or 5-9-26
  const dayFirst = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (dayFirst) {
    const [, d, m, rawY] = dayFirst;
    const y = rawY.length === 2 ? 2000 + +rawY : +rawY;
    return buildIso(y, +m, +d);
  }

  if (/^\d+(\.\d+)?$/.test(s)) return fromExcelSerial(parseFloat(s));

  const parsed = new Date(s);
  return isNaN(parsed) ? null : toIso(parsed);
}

function buildIso(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  // Rejects impossible dates that JS would silently roll over (e.g. 31 Feb).
  return date.getMonth() === m - 1 && date.getDate() === d ? toIso(date) : null;
}

/** Excel day 1 is 1900-01-01, offset by its non-existent 1900-02-29. */
function fromExcelSerial(serial) {
  if (serial < 1 || serial > 2958465) return null;
  const days = Math.floor(serial);
  const epoch = Date.UTC(1899, 11, 30);
  const d = new Date(epoch + days * MS_PER_DAY);
  return buildIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Whole days between an ISO date and today. Past dates are positive. */
export function daysAgo(isoDate, from = new Date()) {
  const d = parseIsoToDate(isoDate);
  if (!d) return null;
  return Math.round((startOfDay(from) - d) / MS_PER_DAY);
}

/** Whole days from today until an ISO date. Future dates are positive. */
export function daysUntil(isoDate, from = new Date()) {
  const n = daysAgo(isoDate, from);
  return n === null ? null : -n;
}

export function parseIsoToDate(isoDate) {
  if (!isoDate) return null;
  const m = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

/** The ISO date `n` days before today — how a "3 days ago" tap becomes data. */
export function isoDaysAgo(n, from = new Date()) {
  const d = startOfDay(from);
  d.setDate(d.getDate() - n);
  return toIso(d);
}

/** The ISO date `n` days after today. */
export function isoDaysFromNow(n, from = new Date()) {
  return isoDaysAgo(-n, from);
}

/**
 * Dates are rendered day-first and pinned to en-IN rather than following the
 * device. A shop phone left on a US default would show "Oct 3" next to another
 * handset showing "3 Oct", and in a list of dates that is a real misreading
 * risk — consistency across the staff's phones matters more here than
 * honouring a setting nobody deliberately chose.
 */
export const DISPLAY_LOCALE = "en-IN";

export function formatDate(isoDate) {
  const d = parseIsoToDate(isoDate);
  if (!d) return "—";
  return d.toLocaleDateString(DISPLAY_LOCALE, { day: "numeric", month: "short", year: "numeric" });
}

export const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

/**
 * Builds an ISO date from loose year/month/day parts, held inside optional
 * bounds. Keeping it out of the picker makes the awkward cases testable: a
 * day that does not exist in the chosen month (31 Jan then switch to Feb),
 * and a date that falls outside the allowed window.
 */
export function buildBoundedDate(year, month, day, minIso, maxIso) {
  const lo = parseIsoToDate(minIso);
  const hi = parseIsoToDate(maxIso);
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  const y = clamp(year, lo ? lo.getFullYear() : year, hi ? hi.getFullYear() : year);
  const m = clamp(
    month,
    lo && y === lo.getFullYear() ? lo.getMonth() : 0,
    hi && y === hi.getFullYear() ? hi.getMonth() : 11
  );

  let d = clamp(day, 1, daysInMonth(y, m));
  if (lo && y === lo.getFullYear() && m === lo.getMonth()) d = Math.max(d, lo.getDate());
  if (hi && y === hi.getFullYear() && m === hi.getMonth()) d = Math.min(d, hi.getDate());

  return toIso(new Date(y, m, d));
}
