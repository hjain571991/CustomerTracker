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
import { parseWorkbook, parseCustomersCsv, normalizeCustomers, normalizeReminders } from "../src/lib/dataSource.js";
import { parseCsv } from "../src/lib/csv.js";
import { statusFor, avgGap, targetFor } from "../src/lib/analytics.js";
import { buildFollowUps } from "../src/lib/followups.js";
import { DEFAULT_SETTINGS } from "../src/lib/settings.js";

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const read = (f) => readFileSync(resolve(dataDir, f), "utf8");

/* ---- the CSVs the app actually ships ---- */

const S = { ...DEFAULT_SETTINGS };
const { customers } = parseCustomersCsv(read("customers.csv"));
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
    `  ${c.initials}  ${c.name.padEnd(21)} every ${String(t.days).padStart(2)}d${t.isDefault ? "*" : " "}  ` +
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
assert.ok(reminders.length >= 2);
assert.ok(reminders.every((r) => customers.some((c) => c.id === r.customerId)), "every reminder joins a customer");
console.log(`Shipped reminders.csv -> ${reminders.length} reminders, all joined to a customer`);

const followUps = buildFollowUps(customers, reminders, S);
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

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([
    ["name", "phone", "initials", "visit_every_weeks", "visit_dates", "last_call_date", "promised_date"],
    ...customers.map((c) => [c.name, c.phone, c.initials, c.visitEveryWeeks || "", c.visits.join(" | "), c.call?.calledOn || "", c.call?.promisedOn || ""]),
  ]),
  "customers"
);
const round = await parseWorkbook(new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })), "roundtrip.xlsx");
assert.equal(round.customers.length, customers.length);
for (const c of customers) {
  const back = round.customers.find((x) => x.name === c.name);
  assert.deepEqual(back.visits, c.visits, `visits changed for ${c.name}`);
  assert.deepEqual(back.call, c.call, `call changed for ${c.name}`);
  assert.equal(back.visitEveryWeeks, c.visitEveryWeeks, `cadence changed for ${c.name}`);
}
console.log("xlsx export -> import round trip is lossless");

/* ---- a file with nothing usable must say so ---- */

assert.throws(() => parseCustomersCsv("foo,bar\n1,2\n"), /No customers found/);
console.log("A sheet with no name column is rejected with a clear message");

console.log("\nData-pipeline checks passed.");
