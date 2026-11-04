/**
 * Adding a batch of customers from a spreadsheet, without losing the book.
 *
 * The existing *Import spreadsheet* replaces everything — right for moving a
 * whole book in, catastrophic for "here are ten new shops". This is the other
 * operation: a merge that only ever adds and fills in.
 *
 * Three rules, and the whole thing follows from them:
 *
 *   1. Rows are matched to existing customers **by name**, folded for case and
 *      spacing. The template carries no id column, because asking somebody to
 *      look up internal ids to add a customer is how spreadsheets get wrong.
 *   2. A blank cell means "I am not saying anything about this", never "make
 *      it blank". Only values actually present can change anything.
 *   3. Visits, reminders, calls and snoozes are never touched. The file is a
 *      list of customers, not a record of what happened to them.
 *
 * Nothing is applied until the owner has seen the plan — `planCustomerImport`
 * works out what *would* happen, and the screen shows it before anything is
 * written.
 */
import { listKey } from "./lookups.js";
import { parseWeeks } from "./settings.js";

/**
 * The template's columns, in order. The same spellings the sheet tabs use, so
 * a file exported from the app can be fed straight back in.
 */
export const TEMPLATE_COLUMNS = [
  { key: "name", header: "name", note: "Required. The shop or customer name, exactly as you want it shown." },
  { key: "phone", header: "phone", note: "Optional. Ten digits is fine — the WhatsApp link adds +91." },
  { key: "company", header: "company", note: "Optional. The company they trade as, if it differs from the shop name." },
  { key: "repName", header: "marketing_rep", note: "Optional. A name not already on your list is added to it." },
  { key: "tierName", header: "tier", note: "Optional. A tier not already on your list is added at the bottom of the order." },
  {
    key: "visitEveryWeeks",
    header: "visit_every_weeks",
    note: "Optional. How often they restock: 1 for weekly, 2 for fortnightly. Blank uses the app default.",
  },
];

/** The fields a spreadsheet row is allowed to change on an existing customer. */
const MERGEABLE = [
  { key: "phone", label: "phone" },
  { key: "company", label: "company" },
  { key: "repName", label: "rep" },
  { key: "tierName", label: "tier" },
  { key: "visitEveryWeeks", label: "cadence" },
];

const text = (v) => (v == null ? "" : String(v).trim());

/** Has the incoming row actually said anything about this field? */
function stated(row, key) {
  if (key === "visitEveryWeeks") return parseWeeks(row.visitEveryWeeks) !== null;
  return text(row[key]) !== "";
}

/** Would this value change what is already recorded? */
function differs(row, existing, key) {
  if (key === "visitEveryWeeks") return parseWeeks(row.visitEveryWeeks) !== (existing.visitEveryWeeks ?? null);
  if (key === "repName" || key === "tierName") return listKey(row[key]) !== listKey(existing[key]);
  return text(row[key]) !== text(existing[key]);
}

const valueOf = (row, key) => (key === "visitEveryWeeks" ? parseWeeks(row.visitEveryWeeks) : text(row[key]));

/**
 * Works out what importing these rows would do, without doing any of it.
 *
 * @param existing  the customers already in the book
 * @param incoming  customers parsed out of the file
 * @returns a plan the screen can show and the app can apply verbatim
 */
export function planCustomerImport(existing, incoming, { reps = [], tiers = [] } = {}) {
  const byName = new Map((existing || []).map((c) => [listKey(c.name), c]));
  const knownReps = new Set((reps || []).map((r) => listKey(r.name)));
  const knownTiers = new Set((tiers || []).map((t) => listKey(t.name)));

  const adds = [];
  const updates = [];
  const unchanged = [];
  const newReps = new Map();
  const newTiers = new Map();

  /** Names the file introduces have to be created before they can be assigned. */
  const noteList = (row) => {
    const rep = text(row.repName);
    if (rep && !knownReps.has(listKey(rep)) && !newReps.has(listKey(rep))) newReps.set(listKey(rep), rep);
    const tier = text(row.tierName);
    if (tier && !knownTiers.has(listKey(tier)) && !newTiers.has(listKey(tier))) newTiers.set(listKey(tier), tier);
  };

  for (const row of incoming || []) {
    const name = text(row.name);
    if (!name) continue; // a row with no name is not a customer

    const match = byName.get(listKey(name));
    if (!match) {
      noteList(row);
      adds.push({
        name,
        phone: text(row.phone),
        company: text(row.company),
        repName: text(row.repName),
        tierName: text(row.tierName),
        visitEveryWeeks: parseWeeks(row.visitEveryWeeks),
      });
      continue;
    }

    // A blank cell says nothing; only stated values can change anything.
    const patch = {};
    const fields = [];
    for (const { key, label } of MERGEABLE) {
      if (!stated(row, key) || !differs(row, match, key)) continue;
      patch[key] = valueOf(row, key);
      fields.push(label);
    }

    if (fields.length) {
      noteList(row);
      updates.push({ id: match.id, name: match.name, patch, fields });
    } else {
      unchanged.push(match.name);
    }
  }

  return {
    adds,
    updates,
    unchanged,
    newReps: [...newReps.values()],
    newTiers: [...newTiers.values()],
    // What the file held at all — so "nothing to do" can be told apart from
    // "the file was empty".
    rows: (incoming || []).filter((r) => text(r.name)).length,
    get changes() {
      return adds.length + updates.length;
    },
  };
}

/** A one-line summary for the confirm button and the result message. */
export function describePlan(plan) {
  const bits = [];
  if (plan.adds.length) bits.push(`add ${plan.adds.length}`);
  if (plan.updates.length) bits.push(`update ${plan.updates.length}`);
  if (!bits.length) return "Nothing to change";
  return bits.join(", ").replace(/^./, (c) => c.toUpperCase());
}
