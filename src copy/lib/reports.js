/**
 * Book-wide views over the data the app already holds.
 *
 * Two questions the per-customer screens cannot answer: who is coming in and
 * who is not, side by side; and why the ones who stopped said they stopped.
 */
import { REASONS, cameBackAfterCall, reasonLabel } from "./followups.js";
import { COUNT_PERIODS, countVisitsBetween, earliestVisit, firstVisit, resolveRange } from "./visitCounts.js";

export { COUNT_PERIODS, earliestVisit };

export const periodByKey = (key) => COUNT_PERIODS.find((p) => p.key === key) || COUNT_PERIODS[1];

/**
 * Every customer with their visit count for the period.
 *
 * Customers with zero visits are kept, not filtered out — on the "fewest"
 * sort they are the entire point of the report.
 */
export function customerVisitCounts(customers, period, { query = "", order = "most" } = {}, now = new Date()) {
  const { from, to } = resolveRange(period, now);
  const q = query.trim().toLowerCase();

  const rows = customers
    .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.phone || "").includes(q))
    .map((customer) => {
      const first = firstVisit(customer);
      return {
        customer,
        count: countVisitsBetween(customer, from, to, now),
        // Same honesty as the detail screen: a window that reaches back
        // further than the records is not a full period.
        coversPeriod: Boolean(first) && first <= from,
      };
    });

  // Name breaks ties so the order never shuffles between renders.
  rows.sort((a, b) =>
    order === "fewest" ? a.count - b.count || a.customer.name.localeCompare(b.customer.name)
                       : b.count - a.count || a.customer.name.localeCompare(b.customer.name)
  );

  return {
    rows,
    from,
    to,
    totalVisits: rows.reduce((n, r) => n + r.count, 0),
    withNone: rows.filter((r) => r.count === 0).length,
  };
}

/**
 * What customers said when they were last rung, split by whether the call
 * worked.
 *
 * Counting reasons alone conflates opposite outcomes: a customer lost on price
 * and one who was matched on price and came back would file identically. The
 * split is the useful part — it says which objections a phone call can still
 * recover and which it cannot.
 *
 * Only the most recent call per customer is on record, so this counts people,
 * not calls: a customer rung twice contributes their latest reason once.
 */
export function reasonBreakdown(customers, period, now = new Date()) {
  const { from, to } = resolveRange(period, now);

  const called = customers.filter((c) => c.contact?.on && c.contact.on >= from && c.contact.on <= to);
  const withReason = called.filter((c) => c.contact.reason);

  const rows = REASONS.map(({ key, label }) => {
    const mine = withReason.filter((c) => c.contact.reason === key);
    // "Came back" is a visit dated after the call — the only hard evidence
    // that ringing them changed anything.
    const cameBack = mine.filter((c) => cameBackAfterCall(c, now));
    const notBack = mine.filter((c) => !cameBackAfterCall(c, now));
    return {
      key,
      label,
      customers: mine,
      cameBack,
      notBack,
      count: mine.length,
      backCount: cameBack.length,
      recovery: mine.length ? cameBack.length / mine.length : null,
    };
  }).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const total = withReason.length;
  const totalCameBack = rows.reduce((n, r) => n + r.backCount, 0);

  return {
    rows: rows.map((r) => ({ ...r, share: total ? r.count / total : 0 })),
    total,
    totalCameBack,
    recovery: total ? totalCameBack / total : null,
    calledWithoutReason: called.length - total,
    from,
    to,
  };
}

export { reasonLabel };
