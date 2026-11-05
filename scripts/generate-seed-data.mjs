/**
 * Regenerates public/data/*.csv — the list the app starts with.
 *
 * The first six are the original hand-tuned examples, kept so their states stay
 * recognisable. The rest are generated from archetypes to give the follow-up
 * screens something realistic to work against: loyal regulars, customers part
 * way through slipping, ones long gone, and a few too new to judge.
 *
 * Deterministic (fixed seed), so re-running produces the same file rather than
 * a noisy diff. Dates are anchored to the day you run it — `npm run seed`
 * refreshes them when the sample data has aged.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const today = new Date();

const iso = (daysAgo) => {
  const d = new Date(today);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};

/** mulberry32 — small deterministic PRNG so the sample data is stable. */
function makeRng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = makeRng(20260905);
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const jitter = (n, pct) => Math.max(1, Math.round(n * (1 + (rnd() * 2 - 1) * pct)));

/* ---- marketing representatives ---- */

// A small team, so the "by rep" report has groups worth comparing rather than
// one customer each. The last one is retired, to exercise an inactive rep who
// still has customers against their name.
const REPS = [
  { id: 1, name: "Priya Shah", active: true },
  { id: 2, name: "Anil Kumar", active: true },
  { id: 3, name: "Farah Qureshi", active: true },
  { id: 4, name: "Vikram Rao", active: false },
];
const activeRepIds = REPS.filter((r) => r.active).map((r) => r.id);

/** Roughly one in eight is left unassigned, so the report has a gap to show. */
const assignRep = () => (rnd() < 0.12 ? "" : pick(activeRepIds));

const COMPANY_SUFFIX = ["Retail Pvt Ltd", "Enterprises", "& Co Pvt Ltd", "Trading Co", "Retail LLP"];

/* ---- customer tiers ---- */

// Rank 1 is the most important. Deliberately a short list: tiers only ever
// break ties on the call list, so a long one would split hairs it cannot act
// on. The retired one exercises a tier that still has customers against it.
const TIERS = [
  { id: 1, name: "Key account", rank: 1, active: true },
  { id: 2, name: "Regular", rank: 2, active: true },
  { id: 3, name: "Occasional", rank: 3, active: true },
  { id: 4, name: "Trial", rank: null, active: false },
];
const activeTierIds = TIERS.filter((t) => t.active).map((t) => t.id);

/**
 * Weighted so most retailers sit in the middle and a fifth are left ungraded —
 * a book where everyone has a tier is not what the screens will actually meet.
 */
const assignTier = () => {
  const r = rnd();
  if (r < 0.2) return "";
  if (r < 0.38) return activeTierIds[0];
  if (r < 0.78) return activeTierIds[1];
  return activeTierIds[2];
};

/* ---- the original six, unchanged ---- */

const seeded = [
  { name: "Rajesh Traders", phone: "9820011223", every: 2, visits: [2, 16, 29, 44, 58], call: { calledDaysAgo: 5, reason: "notNow", note: "Festival stock not moving yet" }, company: "Rajesh Retail Pvt Ltd", rep: 1, tier: 1 },
  { name: "Shree Ambika Jewels", phone: "9833344556", every: 1, visits: [1, 8, 15, 23, 30], call: null, company: "", rep: 1, tier: 2 },
  { name: "Patel & Sons", phone: "9811122334", every: 1, visits: [38, 40, 70, 72], call: { calledDaysAgo: 6, reason: "price", note: "Says a Zaveri Bazaar supplier is cheaper" }, company: "Patel Enterprises", rep: 2, tier: 1 },
  { name: "Ganesh Ornaments", phone: "9845567788", every: 4, visits: [4], call: { calledDaysAgo: 2, reason: "noAnswer", note: "" }, company: "", rep: 2, tier: 3 },
  { name: "Laxmi Gold House", phone: "9822233445", every: 2, visits: [11, 13, 40, 41, 68], call: null, company: "Laxmi Trading Co", rep: 3, tier: 2 },
  // Left with the retired rep, so the report has to account for one.
  { name: "Vraj Jewellers", phone: "9877766554", every: "", visits: [9, 22, 34, 47, 61], call: { calledDaysAgo: 10, reason: "unhappy", note: "Two pieces came in underweight last time" }, company: "", rep: 4, tier: 4 },
];

/* ---- generated ---- */

const FIRST = [
  "Shree", "Shri", "New", "Royal", "Gold", "Star", "Sri", "Krishna", "Om", "Sai",
  "Amba", "Ratna", "Swarna", "Hira", "Moti", "Kanchan", "Padma", "Surya", "Chandra", "Deep",
];
const MIDDLE = [
  "Jewellers", "Ornaments", "Gold House", "Traders", "Bullion", "Jewels", "Alankar",
  "Gold Palace", "Silver House", "Zaveri", "Chains", "Creations",
];
const FAMILY = [
  "Mehta", "Shah", "Desai", "Joshi", "Patel", "Verma", "Chauhan", "Rathod", "Gupta",
  "Agarwal", "Bhatt", "Kothari", "Soni", "Thakkar", "Parekh", "Modi", "Nair", "Iyer",
  "Reddy", "Bhandari", "Jain", "Malhotra", "Sethi", "Kapadia", "Trivedi", "Vora",
];
const SUFFIX = ["& Sons", "& Co", "Brothers", "Emporium", "Jewellers", "Gold", "Bullion"];

const usedNames = new Set(seeded.map((c) => c.name));
function makeName() {
  for (let attempt = 0; attempt < 60; attempt++) {
    const name = rnd() < 0.55 ? `${pick(FIRST)} ${pick(MIDDLE)}` : `${pick(FAMILY)} ${pick(SUFFIX)}`;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
  return `Customer ${usedNames.size + 1}`;
}

let phoneSeq = 0;
const makePhone = () => `9${String(800000000 + (phoneSeq += between(137, 9811))).slice(0, 9)}`;

/**
 * Builds a visit history backwards from `sinceLast` days ago, with `count`
 * visits spaced roughly `every` days apart. `spread` is how erratic the gaps
 * are — 0.1 is clockwork, 0.8 is unpredictable.
 */
function history(sinceLast, count, every, spread) {
  const visits = [sinceLast];
  let cursor = sinceLast;
  for (let i = 1; i < count; i++) {
    cursor += jitter(every, spread);
    visits.push(cursor);
  }
  return visits;
}

const ARCHETYPES = [
  // Reliable and still coming — the healthy majority.
  { key: "loyal", n: 17, build: (every) => ({ visits: history(between(0, Math.max(1, Math.round(every * 0.7))), between(6, 14), every, 0.15) }) },
  // Was regular, has just started to drift. The ones worth catching early.
  { key: "slipping", n: 10, build: (every) => ({ visits: history(between(every + 2, every * 2), between(5, 12), every, 0.2) }) },
  // Well past their pattern — the calls that matter most.
  { key: "fading", n: 8, build: (every) => ({ visits: history(between(every * 2 + 1, every * 4), between(5, 12), every, 0.2) }) },
  // Long gone. Some of these are genuinely lost.
  { key: "lost", n: 6, build: (every) => ({ visits: history(between(every * 5, every * 9), between(4, 10), every, 0.25) }) },
  // Never had a pattern — late means less here.
  { key: "irregular", n: 5, build: (every) => ({ visits: history(between(1, every * 3), between(3, 7), every, 0.85) }) },
  // Too new to judge.
  { key: "new", n: 5, build: () => ({ visits: history(between(0, 12), between(1, 2), 10, 0.4) }) },
  // Came once, never returned.
  { key: "onceOnly", n: 4, build: (every) => ({ visits: [between(every * 3, every * 8)] }) },
];

const TARGETS = [1, 1, 1, 2, 2, 3, 4]; // weeks
const generated = [];

for (const arch of ARCHETYPES) {
  for (let i = 0; i < arch.n; i++) {
    const weeks = pick(TARGETS);
    const every = weeks * 7; // archetypes lay out visits in days
    const { visits } = arch.build(every);
    // A few customers are left without a target, to exercise the app default.
    const hasTarget = rnd() > 0.12;
    const sinceLast = visits[0];

    // Some of the drifting ones have already been rung, with mixed results.
    let call = null;
    if ((arch.key === "fading" || arch.key === "lost" || arch.key === "slipping") && rnd() < 0.35) {
      const calledDaysAgo = between(1, Math.min(20, Math.max(2, Math.round(sinceLast / 2))));
      call = { calledDaysAgo, daysUntilPromised: between(-8, 6) };
    }

    const name = makeName();
    generated.push({
      name,
      phone: makePhone(),
      // Only some retailers trade under a separate company name — it is an
      // optional field, and the sample should show it as one.
      company: rnd() < 0.4 ? `${name.split(" ")[0]} ${pick(COMPANY_SUFFIX)}` : "",
      rep: assignRep(),
      tier: assignTier(),
      every: hasTarget ? weeks : "",
      visits,
      call,
    });
  }
}

/**
 * Called, and then they turned up. Built explicitly rather than left to chance,
 * because "came back after your call" is the payoff the whole screen argues for
 * and the sample data should demonstrate it.
 */
const wonBack = [
  { name: "Bhandari & Sons", weeks: 1, calledDaysAgo: 12, cameBackDaysAgo: 4, priorGap: 7, reason: "notNow", note: "Said he'd come once the new lot landed" },
  { name: "Surya Jewels", weeks: 2, calledDaysAgo: 19, cameBackDaysAgo: 9, priorGap: 14, reason: "price", note: "Matched him on making charges" },
  { name: "Kothari Brothers", weeks: 1, calledDaysAgo: 9, cameBackDaysAgo: 2, priorGap: 7, reason: "noAnswer", note: "" },
].map((w) => {
  usedNames.add(w.name);
  // A long absence, the call, then the return visit.
  const before = [w.calledDaysAgo + 5, w.calledDaysAgo + 5 + w.priorGap, w.calledDaysAgo + 5 + w.priorGap * 2];
  return {
    name: w.name,
    phone: makePhone(),
    company: "",
    rep: assignRep(),
    tier: assignTier(),
    every: w.weeks,
    visits: [w.cameBackDaysAgo, ...before],
    call: { calledDaysAgo: w.calledDaysAgo, reason: w.reason, note: w.note },
    snoozeInDays: null,
  };
});

/**
 * Rung, told "not now", and parked. Built explicitly so the Snoozed section has
 * something in it — snoozes survive across weeks, unlike "called this week".
 */
const snoozedExamples = [
  { name: "Jain Emporium", weeks: 1, awayWeeks: 5, calledDaysAgo: 6, snoozeInDays: 15, note: "Overstocked, said to try mid-month" },
  { name: "Vora Gold", weeks: 2, awayWeeks: 7, calledDaysAgo: 11, snoozeInDays: 22, note: "Shop being repainted, shut for a fortnight" },
  { name: "Trivedi & Co", weeks: 1, awayWeeks: 4, calledDaysAgo: 3, snoozeInDays: 9, note: "" },
].map((x) => {
  usedNames.add(x.name);
  const first = x.awayWeeks * 7;
  return {
    name: x.name,
    phone: makePhone(),
    company: "",
    rep: assignRep(),
    tier: assignTier(),
    every: x.weeks,
    visits: [first, first + x.weeks * 7, first + x.weeks * 14, first + x.weeks * 21],
    call: { calledDaysAgo: x.calledDaysAgo, reason: "notNow", note: x.note },
    snoozeInDays: x.snoozeInDays,
  };
});

const customers = [...seeded, ...generated, ...wonBack, ...snoozedExamples];

/* ---- reminders ---- */

const CALL_REASONS = ["price", "notNow", "unhappy", "service", "noAnswer"];
const CALL_NOTES = {
  price: ["Mehta's quoting 4% under us", "Wants better rate on 22k", "Says our making charges went up", ""],
  notNow: ["Stock still sitting, will call after Navratri", "Slow month, said maybe next fortnight", ""],
  unhappy: ["Unhappy with the last chain lot", "Says two pieces came underweight", ""],
  service: ["Nobody picked up when he rang twice", "Delivery was three days late", ""],
  noAnswer: ["", "", "Tried twice, no answer"],
};

const NOTES = [
  "Ask about their Diwali order", "Referral follow-up she mentioned", "Wanted a bangle set quote",
  "Promised to show the new chain designs", "Check if the repair was collected",
  "Asked about an exchange on old gold", "Wedding season enquiry", "Said to call after the festival",
  "Wanted to see lightweight sets", "Follow up on the silver order",
];
const reminderTargets = [customers[4], customers[1], ...Array.from({ length: 7 }, () => pick(generated))];
const seenReminder = new Set();
const reminders = reminderTargets
  .filter((c) => c && !seenReminder.has(c.name) && seenReminder.add(c.name))
  .map((c) => ({ customer: c.name, dueInDays: between(-9, 10), note: pick(NOTES), done: false }));

/**
 * Reminders already ticked off, and a couple set well ahead. The Reminders
 * screen groups into overdue / today / upcoming / completed, and a sample with
 * only the first two would leave half of it empty.
 */
const extraReminders = [
  { customer: customers[0].name, dueInDays: -21, note: "Rang about the Diwali order", done: true },
  { customer: customers[2].name, dueInDays: -14, note: "Sent the new rate card", done: true },
  { customer: customers[4].name, dueInDays: -5, note: "Quoted for the bangle set", done: true },
  { customer: customers[1].name, dueInDays: 21, note: "Check in before the wedding season", done: false },
  { customer: customers[5].name, dueInDays: 34, note: "Quarterly catch-up", done: false },
];
reminders.push(...extraReminders);

/* ---- write ---- */

const cell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (header, rows) => [header, ...rows].map((r) => r.map(cell).join(",")).join("\n") + "\n";

// Ids are assigned here so they match what the app and the sheet will use.
customers.forEach((c, i) => {
  c.id = i + 1;
});

const repNameById = new Map(REPS.map((r) => [r.id, r.name]));
const tierNameById = new Map(TIERS.map((t) => [t.id, t.name]));

const customersCsv = toCsv(
  ["customer_id", "name", "phone", "company", "marketing_rep_id", "marketing_rep", "tier_id", "tier", "initials", "visit_every_weeks", "last_call_date", "last_call_reason", "last_call_note", "snoozed_until"],
  customers.map((c) => [
    c.id,
    c.name,
    c.phone,
    c.company || "",
    c.rep || "",
    c.rep ? repNameById.get(c.rep) : "",
    c.tier || "",
    c.tier ? tierNameById.get(c.tier) : "",
    "", // blank => derived from the name
    c.every, // weeks; blank => falls back to the app-wide default
    c.call ? iso(c.call.calledDaysAgo) : "",
    c.call?.reason || "",
    c.call?.note || "",
    c.snoozeInDays ? iso(-c.snoozeInDays) : "",
  ])
);

// One row per visit — the shape the Google Sheet's `actions` tab uses.
let actionSeq = 0;
const actionsCsv = toCsv(
  ["action_id", "customer_id", "visit_date", "is_logged", "logged_at"],
  customers.flatMap((c) =>
    [...c.visits].sort((a, b) => b - a).map((d) => {
      actionSeq += 1;
      return [`a${actionSeq}`, c.id, iso(d), 1, ""];
    })
  )
);

const idByName = new Map(customers.map((c) => [c.name, c.id]));
const remindersCsv = toCsv(
  ["reminder_id", "customer_id", "customer_name", "due_date", "note", "is_done"],
  reminders.map((r, i) => [
    `r${i + 1}`,
    idByName.get(r.customer) || "",
    r.customer,
    iso(-r.dueInDays),
    r.note,
    r.done ? 1 : 0,
  ])
);

const repsCsv = toCsv(
  ["rep_id", "name", "is_active"],
  REPS.map((r) => [r.id, r.name, r.active ? 1 : 0])
);

const tiersCsv = toCsv(
  ["tier_id", "name", "rank", "is_active"],
  TIERS.map((t) => [t.id, t.name, t.rank ?? "", t.active ? 1 : 0])
);

mkdirSync(dataDir, { recursive: true });
writeFileSync(resolve(dataDir, "customers.csv"), customersCsv);
writeFileSync(resolve(dataDir, "actions.csv"), actionsCsv);
writeFileSync(resolve(dataDir, "reminders.csv"), remindersCsv);
writeFileSync(resolve(dataDir, "reps.csv"), repsCsv);
writeFileSync(resolve(dataDir, "tiers.csv"), tiersCsv);
console.log(
  `Seeded ${customers.length} customers, ${actionSeq} actions, ${reminders.length} reminders, ` +
    `${REPS.length} representatives and ${TIERS.length} tiers (anchored to ${iso(0)})`
);
