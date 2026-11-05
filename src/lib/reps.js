/**
 * Marketing representatives — who is looking after each retailer.
 *
 * The list is maintained by the owner rather than typed free-hand on the Add
 * Customer form, so "Priya Shah" and "priya shah" cannot end up as two people
 * in the report. It lives in its own sheet tab, like customers and reminders.
 *
 * A customer carries both `repId` (the join) and `repName` (so the sheet reads
 * sensibly to a human). The id wins: renaming a rep in the list renames them
 * everywhere, which is the whole reason for keeping a list.
 *
 * The list mechanics are shared with customer tiers — see `lookups.js`. What
 * is specific to reps is the report below: how many customers each one is
 * looking after, and how those customers are doing.
 */
import { STATUS } from "../theme.js";
import { statusFor } from "./analytics.js";
import { activeOf, applyList, byId, byName, listKey, nextListId, reconcileList, sortList } from "./lookups.js";

/** Which customer fields hold a rep reference. */
export const REP_KEYS = { idKey: "repId", nameKey: "repName" };

/** The bucket customers with no rep fall into. Not a real rep — it has no id. */
export const UNASSIGNED = { id: null, name: "Unassigned", isActive: true };

export const repKey = listKey;
export const nextRepId = nextListId;
export const sortReps = sortList;
export const activeReps = activeOf;
export const repById = byId;
export const repByName = byName;

export const reconcileReps = (reps, customers) => reconcileList(reps, customers, REP_KEYS);
export const applyReps = (customers, reps) => applyList(customers, reps, REP_KEYS);

const STATUS_ORDER = ["missed", "dueThisWeek", "never", "onTrack"];

/** An empty tally, so every row reports all four states even at zero. */
const emptyCounts = () => ({ missed: 0, dueThisWeek: 0, never: 0, onTrack: 0 });

/**
 * How many customers each rep is looking after, and how those customers are
 * doing. The point of the report is the second half: a rep with forty retailers
 * and fifteen of them missed is a different conversation to one with four.
 *
 * @param query  matches the rep's name, so searching narrows to one rep
 */
export function repBreakdown(customers, reps, settings, { query = "" } = {}, now = new Date()) {
  const q = listKey(query);
  const buckets = new Map();

  const bucketFor = (rep) => {
    const key = rep.id == null ? "__none__" : rep.id;
    if (!buckets.has(key)) buckets.set(key, { rep, customers: [], counts: emptyCounts(), total: 0 });
    return buckets.get(key);
  };

  // Every active rep gets a row even with nobody on it — "Anil has none" is an
  // answer the owner is asking this screen for.
  for (const rep of activeReps(reps)) bucketFor(rep);

  for (const customer of customers || []) {
    const rep = byId(reps, customer.repId) || UNASSIGNED;
    const bucket = bucketFor(rep);
    const status = statusFor(customer, settings, now);
    bucket.customers.push({ customer, status });
    bucket.counts[status.key] += 1;
    bucket.total += 1;
  }

  const rows = [...buckets.values()]
    .filter((row) => !q || listKey(row.rep.name).includes(q))
    // An inactive rep with nobody left is history; drop it rather than pad the list.
    .filter((row) => row.total > 0 || (row.rep.id != null && row.rep.isActive))
    .map((row) => ({
      ...row,
      customers: row.customers.sort(
        (a, b) =>
          STATUS_ORDER.indexOf(a.status.key) - STATUS_ORDER.indexOf(b.status.key) ||
          a.customer.name.localeCompare(b.customer.name)
      ),
    }));

  // Busiest first; unassigned always last, however many are in it.
  rows.sort((a, b) => {
    if ((a.rep.id == null) !== (b.rep.id == null)) return a.rep.id == null ? 1 : -1;
    return b.total - a.total || a.rep.name.localeCompare(b.rep.name);
  });

  return {
    rows,
    totalCustomers: rows.reduce((n, r) => n + r.total, 0),
    assigned: rows.filter((r) => r.rep.id != null).reduce((n, r) => n + r.total, 0),
    unassigned: buckets.get("__none__")?.total || 0,
  };
}

/** The status colours and labels the report renders, in the order it shows them. */
export const STATUS_BARS = STATUS_ORDER.map((key) => ({ key, ...STATUS[key] }));
