/**
 * Customer tiers — some retailers matter more than others.
 *
 * The owner maintains the list, so the names mean whatever this shop needs
 * them to mean: A/B/C, Key/Regular, Platinum/Gold, however they already talk
 * about their customers. What the app supplies is the *order*: tier 1 is the
 * most important, and that is the only thing it reads.
 *
 * Deliberately narrow in what it affects. A tier does **not** change whether a
 * customer is overdue, which group they land in, or how often they are
 * expected — those come from their own visit rhythm, and letting importance
 * override them would hide a top customer quietly drifting away, which is the
 * exact failure this app exists to catch.
 *
 * It breaks ties, and only ties. Where two customers are equally worth ringing,
 * the more important one goes first.
 */
import { activeOf, applyList, byId, byName, listKey, moveRanked, nextListId, reRank, reconcileList, sortList } from "./lookups.js";

/** Which customer fields hold a tier reference. */
export const TIER_KEYS = { idKey: "tierId", nameKey: "tierName", ranked: true };

export const tierKey = listKey;
export const nextTierId = nextListId;
export const sortTiers = sortList;
export const activeTiers = activeOf;
export const tierById = byId;
export const tierByName = byName;
export const moveTier = moveRanked;
export const reRankTiers = reRank;

export const reconcileTiers = (tiers, customers) => reconcileList(tiers, customers, TIER_KEYS);
export const applyTiers = (customers, tiers) => applyList(customers, tiers, TIER_KEYS);

/**
 * How important a customer is, as a sortable number — lower is more important.
 *
 * Anyone without a tier sorts *after* everyone who has one. Not graded is not
 * the same as graded lowest: a customer nobody has got round to classifying
 * should not outrank one deliberately marked least important.
 */
export const UNGRADED_RANK = Number.MAX_SAFE_INTEGER;

export function tierRank(customer, tiers) {
  const tier = byId(tiers, customer?.tierId);
  return tier && Number.isFinite(tier.rank) ? tier.rank : UNGRADED_RANK;
}

/**
 * The comparator the call list uses as its last tie-break. Returns 0 for two
 * customers of the same tier, so whatever ordering ran before it still decides.
 */
export const byTier = (tiers) => (a, b) => tierRank(a, tiers) - tierRank(b, tiers);

/** "A · most important" — the caption a picker shows beside each option. */
export function tierLabel(tier, tiers) {
  if (!tier) return "";
  const active = activeOf(tiers);
  if (tier.rank === 1) return `${tier.name} · most important`;
  if (active.length > 1 && tier.rank === active.length) return `${tier.name} · least important`;
  return tier.name;
}
