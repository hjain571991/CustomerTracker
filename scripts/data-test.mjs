/**
 * Exercises the real spreadsheet pipeline with SheetJS: the shipped CSVs, a
 * deliberately messy sheet, and an xlsx export/import round trip.
 * Run with `npm test`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { parseWorkbook, parseCustomersCsv, normalizeCustomers, normalizeActions, normalizeReminders, normalizeReps, normalizeTiers, applyActions, nextCustomerId, repAoA, reminderAoA, customerAoA, tierAoA, metaAoA, actionAoA } from "../src/lib/dataSource.js";
import { applyReps, reconcileReps, repBreakdown } from "../src/lib/reps.js";
import { applyTiers, reconcileTiers, tierRank } from "../src/lib/tiers.js";
import { buildReminderList } from "../src/lib/reminders.js";
import { buildCustomerTemplate } from "../src/lib/dataSource.js";
import { readZip } from "../src/lib/xlsxZip.js";
import { planCustomerImport } from "../src/lib/importCustomers.js";
import { parseCsv } from "../src/lib/csv.js";
import { statusFor, avgGap, targetFor } from "../src/lib/analytics.js";
import { buildFollowUps } from "../src/lib/followups.js";
import { DEFAULT_SETTINGS } from "../src/lib/settings.js";

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const read = (f) => readFileSync(resolve(dataDir, f), "utf8");

/* ---- the CSVs the app actually ships ---- */

const S = { ...DEFAULT_SETTINGS };
const { customers: rawCustomers } = parseCustomersCsv(read("customers.csv"));
const seedActions = normalizeActions(parseCsv(read("actions.csv")), rawCustomers);
const customers = applyActions(rawCustomers, seedActions);

assert.ok(seedActions.length > 300, `expected a real action log, got ${seedActions.length}`);
assert.ok(
  customers.every((c) => /^[0-9]+$/.test(c.id)),
  "every customer carries a numeric id from the sheet"
);
assert.equal(new Set(customers.map((c) => c.id)).size, customers.length, "ids are unique");
assert.ok(
  seedActions.every((a) => customers.some((c) => c.id === a.customerId)),
  "every action joins a customer by id"
);
console.log(`  actions: ${seedActions.length} rows, all joined by customer_id`);
assert.ok(customers.length >= 50, `expected a realistic book, got ${customers.length}`);
console.log(`Shipped customers.csv -> ${customers.length} customers`);
const tally = {};
for (const c of customers) {
  assert.ok(c.id && c.name, `record missing id/name: ${JSON.stringify(c)}`);
  assert.ok(c.initials.length <= 2, `initials too long: ${c.initials}`);
  for (const v of c.visits) assert.match(v, /^\d{4}-\d{2}-\d{2}$/, `bad visit date ${v}`);
  const key = statusFor(c, S).key;
  tally[key] = (tally[key] || 0) + 1;
}
console.log(`  statuses: ${Object.entries(tally).map(([k, n]) => `${k} ${n}`).join(", ")}`);
assert.ok(tally.missed > 0 && tally.onTrack > 0, "the sample should exercise both healthy and lapsed customers");

for (const name of ["Rajesh Traders", "Patel & Sons", "Ganesh Ornaments"]) {
  const c = customers.find((x) => x.name === name);
  const t = targetFor(c, S);
  console.log(
    `  ${c.initials}  ${c.name.padEnd(21)} every ${String(t.weeks).padStart(2)}w${t.isDefault ? "*" : " "}  ` +
      `avg ${String(avgGap(c) ?? "-").padStart(3)}d  ${statusFor(c, S).label}`
  );
}

assert.equal(customers.find((c) => c.name === "Rajesh Traders").initials, "RT", "initials derive from the name");


assert.equal(customers.find((c) => c.name === "Shree Ambika Jewels").visitEveryWeeks, 1, "cadences come across from the sheet");
assert.equal(customers.find((c) => c.name === "Vraj Jewellers").visitEveryWeeks, null, "a blank cadence falls back to the default");
assert.equal(targetFor(customers.find((c) => c.name === "Vraj Jewellers"), S).isDefault, true);
const rajesh = customers.find((c) => c.name === "Rajesh Traders");
assert.deepEqual([...rajesh.visits].sort((a, b) => (a < b ? 1 : -1)), rajesh.visits, "visits sort most-recent first");

const reminders = normalizeReminders(parseCsv(read("reminders.csv")), customers);
assert.ok(
  reminders.every((r) => customers.some((c) => c.id === r.customerId)),
  "reminders join on customer_id, not name"
);
assert.ok(reminders.length >= 2);
assert.ok(reminders.every((r) => customers.some((c) => c.id === r.customerId)), "every reminder joins a customer");
console.log(`Shipped reminders.csv -> ${reminders.length} reminders, all joined to a customer`);

/* ---- the shipped rep list ---- */

const reps = reconcileReps(normalizeReps(parseCsv(read("reps.csv"))), rawCustomers);
assert.ok(reps.length >= 3, `expected a rep list, got ${reps.length}`);
assert.ok(reps.some((r) => !r.isActive), "the sample should include a removed rep");
const assigned = applyReps(customers, reps);
assert.ok(
  assigned.every((c) => c.repId === null || reps.some((r) => r.id === c.repId)),
  "every assigned customer points at a rep that exists"
);
assert.ok(
  assigned.some((c) => c.repId && c.repName),
  "assigned customers carry the rep's name as well as the id"
);

const repReport = repBreakdown(assigned, reps, S);
assert.equal(
  repReport.rows.reduce((n, r) => n + r.total, 0),
  customers.length,
  "every customer lands in exactly one rep bucket"
);
assert.ok(repReport.assigned > 0 && repReport.unassigned > 0, "the sample exercises both assigned and unassigned");
console.log(
  `Shipped reps.csv -> ${reps.length} reps · ` +
    repReport.rows
      .filter((r) => r.rep.id != null)
      .map((r) => `${r.rep.name.split(" ")[0]} ${r.total}`)
      .join(", ") +
    `, ${repReport.unassigned} unassigned`
);

assert.ok(
  assigned.some((c) => c.company),
  "some customers trade under a company name"
);

/* ---- reminders, including the completed ones ---- */

assert.ok(reminders.some((r) => r.isDone), "the sample should include reminders already ticked off");
const reminderList = buildReminderList(assigned, reminders);
assert.ok(
  reminderList.groups.some((g) => g.key === "done") && reminderList.groups.some((g) => g.key === "upcoming"),
  "the sample fills both the upcoming and the completed groups"
);
assert.equal(reminderList.shown, reminders.length, "nothing is orphaned — every reminder joins a customer");
console.log(
  `  reminders: ${reminderList.groups.map((g) => `${g.key} ${g.entries.length}`).join(", ")}`
);

/* ---- the shipped tier list ---- */

const tiers = reconcileTiers(normalizeTiers(parseCsv(read("tiers.csv"))), rawCustomers);
assert.ok(tiers.length >= 3, `expected a tier list, got ${tiers.length}`);
assert.ok(tiers.some((t) => !t.isActive), "the sample should include a removed tier");
assert.deepEqual(
  tiers.filter((t) => t.isActive).map((t) => t.rank),
  tiers.filter((t) => t.isActive).map((_, i) => i + 1),
  "ranks are contiguous from 1"
);

const graded = applyTiers(assigned, tiers);
const withTier = graded.filter((c) => c.tierName);
assert.ok(withTier.length > 0 && withTier.length < graded.length, "the sample exercises both graded and ungraded");
assert.ok(
  graded.every((c) => c.tierId === null || tiers.some((t) => t.id === c.tierId)),
  "every graded customer points at a tier that exists"
);
console.log(
  `Shipped tiers.csv -> ` +
    tiers.map((t) => `${t.name} ${graded.filter((c) => c.tierId === t.id).length}`).join(", ") +
    `, ${graded.length - withTier.length} ungraded`
);

const followUps = buildFollowUps(graded, reminders, S, { tiers });
assert.ok(
  followUps.reminders.every((r) => !r.reminder.isDone),
  "the call list never shows a reminder already done"
);

// Tiers must not change who is on the list, only the order within a group.
const ungraded = buildFollowUps(graded.map((c) => ({ ...c, tierId: null })), reminders, S, { tiers });
assert.equal(followUps.toCallCount, ungraded.toCallCount, "grading nobody calls nobody extra");
assert.deepEqual(
  followUps.stillAway.map((e) => e.customer.id).sort(),
  ungraded.stillAway.map((e) => e.customer.id).sort(),
  "the same customers are chased either way"
);
assert.ok(
  followUps.stillAway.every((e, i, xs) => i === 0 || xs[i - 1].weeksMissed <= e.weeksMissed),
  "and still-away stays sorted most-recoverable-first"
);
// Within one weeksMissed band the tier decides.
for (let i = 1; i < followUps.stillAway.length; i++) {
  const prev = followUps.stillAway[i - 1];
  const cur = followUps.stillAway[i];
  if (prev.weeksMissed === cur.weeksMissed && prev.visits === cur.visits) {
    assert.ok(
      tierRank(prev.customer, tiers) <= tierRank(cur.customer, tiers),
      `tier order broken between ${prev.customer.name} and ${cur.customer.name}`
    );
  }
}
console.log("  tiers break ties within each group without changing who is in it");
console.log(
  `  follow-ups: ${followUps.toCallCount} to call ` +
    `(${followUps.missedLastWeek.length} missed last week, ${followUps.stillAway.length} still away), ` +
    `${followUps.neverReturned.length} never came back, ${followUps.cameBack.length} won back`
);
assert.ok(followUps.toCallCount > 0 && followUps.toCallCount < customers.length, "the call list is a subset, not the whole book");
assert.ok(
  followUps.stillAway.every((e, i, xs) => i === 0 || xs[i - 1].weeksMissed <= e.weeksMissed),
  "still-away must stay sorted most-recoverable-first"
);

/* ---- a sheet as a human would actually keep it ---- */

const messy = normalizeCustomers([
  { "Customer Name": "Meena Silver", "Mobile No": "9800000001", "Visit Dates": "05/09/2026 | 22/08/2026" },
  { "Customer Name": "Meena Silver", "Mobile No": "", "Visit Dates": "01/08/2026" },
  { "Customer Name": "  ", "Mobile No": "9800000002", "Visit Dates": "" },
  { "Customer Name": "Anil & Co", "Mobile No": "9800000003", "Visit Dates": "not a date | 2026-09-01", Frequency: "3" },
]);
assert.equal(messy.length, 2, "blank row dropped, duplicate name merged");
const meena = messy.find((c) => c.name === "Meena Silver");
assert.equal(meena.visits.length, 3, "duplicate rows merge their visits");
assert.equal(meena.visits[0], "2026-09-05", "day-first dates parse");
assert.equal(meena.phone, "9800000001", "phone survives the merge");
assert.deepEqual(messy.find((c) => c.name === "Anil & Co").visits, ["2026-09-01"], "unparseable dates dropped, not guessed");
assert.equal(messy.find((c) => c.name === "Anil & Co").visitEveryWeeks, 3, "'Frequency' resolves to the cadence");
console.log("Messy sheet (odd headers, day-first dates, duplicate + blank rows) handled");

const legacy = normalizeCustomers([
  { name: "Old Sheet Co", visit_every_days: "14", visit_dates: "2026-09-01" },
  { name: "Ten Day Co", visit_every_days: "10", visit_dates: "2026-09-01" },
]);
assert.equal(legacy[0].visitEveryWeeks, 2, "a 14-day column becomes a fortnightly cadence");
assert.equal(legacy[1].visitEveryWeeks, 1, "10 days rounds to the nearest week");
console.log("Legacy visit_every_days sheets still import, converted to weeks");

/* ---- export then re-import must be lossless ---- */

// Exactly what the app's own "Export as Excel" writes, so the round trip
// tests the real shape rather than a hand-made approximation of it.
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(customerAoA(assigned)), "customers");
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([
    ["action_id", "customer_id", "visit_date", "is_logged"],
    ...seedActions.map((a) => [a.actionId, a.customerId, a.date, a.isLogged ? 1 : 0]),
  ]),
  "actions"
);
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reminderAoA(reminders, assigned)), "reminders");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(repAoA(reps)), "reps");

const round = await parseWorkbook(new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })), "roundtrip.xlsx");
assert.equal(round.customers.length, customers.length);
for (const c of assigned) {
  const back = round.customers.find((x) => x.id === c.id);
  assert.ok(back, `customer ${c.id} (${c.name}) did not survive the round trip`);
  assert.equal(back.name, c.name, `name changed for ${c.id}`);
  assert.deepEqual(back.visits, c.visits, `visits changed for ${c.name}`);
  assert.deepEqual(back.contact, c.contact, `call changed for ${c.name}`);
  assert.equal(back.visitEveryWeeks, c.visitEveryWeeks, `cadence changed for ${c.name}`);
  assert.equal(back.company, c.company, `company changed for ${c.name}`);
  assert.equal(back.repId, c.repId, `rep changed for ${c.name}`);
  assert.equal(back.repName, c.repName, `rep name changed for ${c.name}`);
}
assert.equal(round.reps.length, reps.length, "the rep list survives the round trip");
assert.deepEqual(
  round.reps.map((r) => [r.name, r.isActive]).sort(),
  reps.map((r) => [r.name, r.isActive]).sort(),
  "including which of them are still working"
);
assert.equal(
  round.reminders.filter((r) => r.isDone).length,
  reminders.filter((r) => r.isDone).length,
  "completed reminders stay completed"
);
console.log("xlsx export -> import round trip is lossless (customers, actions, reminders, reps)");

/* ---- the backup file: everything out, everything back ---- */

const SETTINGS = { defaultIntervalWeeks: 3 };
const backup = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(backup, XLSX.utils.aoa_to_sheet(customerAoA(graded)), "customers");
XLSX.utils.book_append_sheet(backup, XLSX.utils.aoa_to_sheet(actionAoA(seedActions)), "actions");
XLSX.utils.book_append_sheet(backup, XLSX.utils.aoa_to_sheet(reminderAoA(reminders, graded)), "reminders");
XLSX.utils.book_append_sheet(backup, XLSX.utils.aoa_to_sheet(repAoA(reps)), "reps");
XLSX.utils.book_append_sheet(backup, XLSX.utils.aoa_to_sheet(tierAoA(tiers)), "tiers");
XLSX.utils.book_append_sheet(backup, XLSX.utils.aoa_to_sheet(metaAoA(SETTINGS)), "meta");

const restored = await parseWorkbook(
  new Uint8Array(XLSX.write(backup, { type: "array", bookType: "xlsx" })),
  "visit-tracker-backup.xlsx"
);

assert.equal(restored.customers.length, graded.length, "every customer comes back");
assert.equal(restored.actions.length, seedActions.length, "every visit comes back");
assert.equal(restored.reminders.length, reminders.length, "every reminder comes back");
assert.equal(restored.reps.length, reps.length, "the rep list comes back");
assert.equal(restored.tiers.length, tiers.length, "the tier list comes back");
assert.equal(restored.meta.settings.defaultIntervalWeeks, 3, "and so do the settings");

for (const c of graded) {
  const back = restored.customers.find((x) => x.id === c.id);
  assert.ok(back, `customer ${c.id} (${c.name}) did not survive the backup`);
  for (const field of ["name", "phone", "company", "repId", "repName", "tierId", "tierName", "visitEveryWeeks", "initials"]) {
    assert.deepEqual(back[field], c[field], `${field} changed for ${c.name}`);
  }
  assert.deepEqual(back.visits, c.visits, `visits changed for ${c.name}`);
  assert.deepEqual(back.contact, c.contact, `call changed for ${c.name}`);
}
assert.deepEqual(
  restored.tiers.map((t) => [t.name, t.rank, t.isActive]),
  tiers.map((t) => [t.name, t.rank, t.isActive]),
  "the tier order survives, which is the only part of a tier the app reads"
);
assert.equal(
  restored.reminders.filter((r) => r.isDone).length,
  reminders.filter((r) => r.isDone).length,
  "completed reminders stay completed"
);
console.log("Backup -> restore is lossless (customers, actions, reminders, reps, tiers, settings)");

/* ---- the bulk-add template, dropdowns and all ---- */

const templateBytes = await buildCustomerTemplate(reps, tiers);
const templateWb = XLSX.read(templateBytes, { type: "array" });
assert.deepEqual(
  templateWb.SheetNames,
  ["customers", "how to fill this in", "lists"],
  "the template ships the sheet to fill in, the instructions, and the allowed values"
);

const templateHeaders = XLSX.utils.sheet_to_json(templateWb.Sheets.customers, { header: 1 })[0];
assert.deepEqual(templateHeaders, ["name", "phone", "company", "marketing_rep", "tier", "visit_every_weeks"]);

// The dropdowns live in XML the spreadsheet library cannot write, so they are
// checked in the part itself.
const parts = new Map(readZip(templateBytes).map((e) => [e.name, new TextDecoder().decode(e.bytes)]));
const sheetXml = parts.get("xl/worksheets/sheet1.xml");
assert.ok(sheetXml, "the customers sheet is where the rules were written");
const ruleCount = (sheetXml.match(/<dataValidation /g) || []).length;
assert.equal(ruleCount, 3, `expected three rules, found ${ruleCount}`);
assert.match(sheetXml, /sqref="D2:D1000"[^>]*>\s*<formula1>lists!\$A\$2/, "marketing_rep points at the reps list");
assert.match(sheetXml, /sqref="E2:E1000"[^>]*>\s*<formula1>lists!\$B\$2/, "tier points at the tiers list");
assert.match(sheetXml, /type="whole"[^>]*sqref="F2:F1000"/, "visit_every_weeks is a whole number");
assert.ok(sheetXml.indexOf("</sheetData>") < sheetXml.indexOf("<dataValidations"), "and they sit where the schema wants");

// Only values the app can resolve are offered.
const listRows = XLSX.utils.sheet_to_json(templateWb.Sheets.lists, { header: 1 }).slice(1);
const offeredReps = listRows.map((r) => r[0]).filter(Boolean);
const offeredTiers = listRows.map((r) => r[1]).filter(Boolean);
assert.deepEqual(
  offeredReps.slice().sort(),
  reps.filter((r) => r.isActive).map((r) => r.name).sort(),
  "every active rep is offered"
);
assert.deepEqual(
  offeredTiers,
  tiers.filter((t) => t.isActive).map((t) => t.name),
  "and every active tier, in the owner's order"
);
for (const removed of [...reps, ...tiers].filter((x) => !x.isActive)) {
  assert.ok(!offeredReps.includes(removed.name) && !offeredTiers.includes(removed.name),
    `"${removed.name}" was removed, so it must not be offered`);
}
console.log(
  `Template -> ${templateWb.SheetNames.length} sheets, ${ruleCount} dropdowns, ` +
    `${offeredReps.length} reps and ${offeredTiers.length} tiers offered`
);

// The whole point: a filled-in template must import cleanly.
const filled = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  filled,
  XLSX.utils.aoa_to_sheet([
    templateHeaders,
    ["Template Test Shop", "9800000099", "Template Ltd", offeredReps[0], offeredTiers[0], 2],
    [graded[0].name, "", "", "", "", ""],
  ]),
  "customers"
);
const readBack = await parseWorkbook(new Uint8Array(XLSX.write(filled, { type: "array", bookType: "xlsx" })), "filled.xlsx");
const plan = planCustomerImport(graded, readBack.customers, { reps, tiers });
assert.equal(plan.adds.length, 1, "the new row is an addition");
assert.equal(plan.adds[0].name, "Template Test Shop");
assert.equal(plan.adds[0].repName, offeredReps[0], "the rep chosen from the dropdown comes through");
assert.equal(plan.adds[0].tierName, offeredTiers[0], "and the tier");
assert.equal(plan.adds[0].visitEveryWeeks, 2);
assert.deepEqual(plan.newReps, [], "nothing picked from the dropdowns is a new rep");
assert.deepEqual(plan.newTiers, [], "or a new tier");
assert.deepEqual(plan.unchanged, [graded[0].name], "a row of blanks against an existing customer changes nothing");
console.log("A filled-in template imports cleanly, inventing no reps or tiers");

/* ---- a sheet from before the reps tab existed still opens ---- */

const legacyWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  legacyWb,
  XLSX.utils.aoa_to_sheet([
    ["customer_id", "name", "phone", "visit_every_weeks", "marketing_rep"],
    ["1", "Old Sheet Co", "9800000009", "2", "Kiran Patel"],
    ["2", "Second Shop", "9800000010", "1", "kiran  patel"],
    ["3", "No Rep Co", "9800000011", "1", ""],
  ]),
  "customers"
);
const legacyRound = await parseWorkbook(new Uint8Array(XLSX.write(legacyWb, { type: "array", bookType: "xlsx" })), "legacy.xlsx");
assert.equal(legacyRound.reps.length, 1, "the rep typed on the customer rows is adopted, once");
assert.equal(legacyRound.customers[0].repId, legacyRound.customers[1].repId, "both spellings resolve to one rep");
assert.equal(legacyRound.customers[2].repId, null);
console.log("A sheet with no reps tab still imports, adopting any rep named on a customer row");

/* ---- a file with nothing usable must say so ---- */

assert.throws(() => parseCustomersCsv("foo,bar\n1,2\n"), /No customers found/);
console.log("A sheet with no name column is rejected with a clear message");

console.log("\nData-pipeline checks passed.");
