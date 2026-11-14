/**
 * Adding and removing a visit date on a customer.
 *
 * Pulled out of the component so the undo path is testable: the rule that
 * matters is that undo must never delete a visit the tap did not create.
 * Tapping a face twice in one day is a no-op, so that second tap has nothing
 * to undo — otherwise it would quietly erase the morning's genuine visit.
 */

const newestFirst = (a, b) => (a < b ? 1 : a > b ? -1 : 0);

export function hasVisit(customer, date) {
  return (customer.visits || []).includes(date);
}

/** Returns the customer unchanged when that date is already recorded. */
export function addVisit(customer, date) {
  if (hasVisit(customer, date)) return customer;
  return { ...customer, visits: [...(customer.visits || []), date].sort(newestFirst) };
}

export function removeVisit(customer, date) {
  if (!hasVisit(customer, date)) return customer;
  return { ...customer, visits: customer.visits.filter((v) => v !== date) };
}
