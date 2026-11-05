/**
 * The machinery behind the owner's short lists — marketing representatives and
 * customer tiers.
 *
 * Both are the same shape of thing: a handful of named entries the owner
 * maintains, each referenced from customer rows by id. Both need the same
 * awkward behaviours, which is why this is shared rather than written twice:
 *
 *   - names are the identity a human types, so they fold case and spacing and
 *     a name entered twice is one entry, not two;
 *   - ids are the join, so renaming an entry renames it everywhere;
 *   - an entry named on a customer row but missing from the list is adopted
 *     into it rather than dropped, because people edit the sheet by hand;
 *   - removing an entry deactivates it instead of deleting it, so the
 *     customers still pointing at it keep a readable name.
 *
 * A list entry is `{ id, name, isActive }`, plus `rank` where order carries
 * meaning (tiers), which reps do not have.
 */

const text = (v) => (v == null ? "" : String(v).trim());

// Above any rank in use, so an adopted entry lands after the existing ones.
const ADOPTED_BASE = 1000000;

/** Names compare case- and space-insensitively, like sheet headers do. */
export const listKey = (name) => text(name).toLowerCase().replace(/\s+/g, " ");

/** The next free id, so hand-added sheet rows never collide with app-added ones. */
export function nextListId(entries) {
  let max = 0;
  for (const e of entries || []) {
    const n = Number(e.id);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}

export const byId = (entries, id) =>
  id == null ? null : (entries || []).find((e) => e.id === String(id)) || null;

export const byName = (entries, name) => {
  const key = listKey(name);
  return key ? (entries || []).find((e) => listKey(e.name) === key) || null : null;
};

/**
 * Active entries first, then by `rank` where the list has one, then by name.
 * Ranked lists are ordered by the owner, so name is only ever a tie-break.
 */
export function sortList(entries) {
  return [...(entries || [])].sort(
    (a, b) =>
      Number(b.isActive) - Number(a.isActive) ||
      (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
      a.name.localeCompare(b.name)
  );
}

export const activeOf = (entries) => sortList(entries).filter((e) => e.isActive);

/** Renumbers `rank` to 1..n in the list's current order, closing any gaps. */
export function reRank(entries) {
  let n = 0;
  return sortList(entries).map((e) => (e.isActive ? { ...e, rank: ++n } : { ...e, rank: null }));
}

/**
 * Moves an entry one place up or down the ranked order and renumbers.
 * Only active entries take part — an inactive one has no place in the order.
 */
export function moveRanked(entries, id, direction) {
  const ranked = reRank(entries);
  const active = ranked.filter((e) => e.isActive);
  const at = active.findIndex((e) => e.id === id);
  const to = at + (direction === "up" ? -1 : 1);
  if (at < 0 || to < 0 || to >= active.length) return entries; // already at the end

  const reordered = [...active];
  [reordered[at], reordered[to]] = [reordered[to], reordered[at]];
  const renumbered = reordered.map((e, i) => ({ ...e, rank: i + 1 }));
  return [...renumbered, ...ranked.filter((e) => !e.isActive)];
}

/**
 * The list, with anything named on a customer row but missing from it added.
 *
 * Someone will type a value straight into the customers tab — adopting it
 * keeps the assignment rather than quietly dropping it on the next read.
 *
 * @param keys  which customer fields hold the id and the name
 */
export function reconcileList(entries, customers, { idKey, nameKey, ranked = false } = {}) {
  const out = [...(entries || [])];
  const taken = new Set(out.map((e) => e.id));
  const seen = new Map(out.map((e) => [listKey(e.name), e]));
  let next = 1;

  for (const customer of customers || []) {
    const name = text(customer[nameKey]);
    const id = text(customer[idKey]);
    if (!name && !id) continue;
    if (id && taken.has(id)) continue; // already a known entry
    if (name && seen.has(listKey(name))) continue;
    if (!name) continue; // an id pointing at nothing, with no name to rescue it

    let adoptedId = id;
    if (!adoptedId || taken.has(adoptedId)) {
      while (taken.has(String(next))) next += 1;
      adoptedId = String(next);
    }
    // Adopted entries go on the end of a ranked order, in the order they were
    // met — never ahead of something the owner deliberately placed.
    const entry = { id: adoptedId, name, isActive: true, ...(ranked ? { rank: ADOPTED_BASE + out.length } : {}) };
    taken.add(entry.id);
    seen.set(listKey(name), entry);
    out.push(entry);
  }

  // An adopted entry has no rank of its own; it goes on the end of the order.
  return ranked ? reRank(out) : out;
}

/**
 * Resolves every customer against the list, so the id is the truth and the
 * stored name can never drift away from it.
 */
export function applyList(customers, entries, { idKey, nameKey } = {}) {
  return (customers || []).map((customer) => {
    const entry = byId(entries, customer[idKey]) || byName(entries, customer[nameKey]);
    return { ...customer, [idKey]: entry ? entry.id : null, [nameKey]: entry ? entry.name : "" };
  });
}
