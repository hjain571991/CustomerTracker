/**
 * Fast checks on the pure logic — date parsing and the visit-rhythm maths.
 * No bundler, no browser: `node scripts/smoke-test.mjs`.
 */
import assert from "node:assert/strict";
import { daysAgo, daysUntil, isoDaysAgo, isoDaysFromNow, parseDate, todayIso } from "../src/lib/dates.js";
import { avgGap, initialsFor, regularity, statusFor, targetFor, visitDays, weeksSinceLastVisit } from "../src/lib/analytics.js";
import { buildFollowUps, cameBackAfterCall, isEstablished } from "../src/lib/followups.js";
import { addVisit, hasVisit, removeVisit } from "../src/lib/visits.js";
import { buildVisitLog } from "../src/lib/visitLog.js";
import { applyActions, actionsFromCustomers, nextCustomerId, normalizeActions, normalizeCustomers, normalizeReminders } from "../src/lib/dataSource.js";
import { enqueue } from "../src/lib/sync.js";
import { changeFor, isConfigured } from "../src/lib/sheets.js";
import { actionAoA, customerAoA } from "../src/lib/dataSource.js";
import { clampRange, countVisitsBetween, countVisitsSince, earliestVisit, historyDays, periodStart, resolveRange, visitCounts } from "../src/lib/visitCounts.js";
import { customerVisitCounts, periodByKey, reasonBreakdown } from "../src/lib/reports.js";
import { currentWeekIndex } from "../src/lib/weeks.js";
import { DEFAULT_SETTINGS, parseWeeks, weeksFromDays } from "../src/lib/settings.js";
import { tradingDaysLeft, weekIndexOf, weeksSince } from "../src/lib/weeks.js";
import { STATUS } from "../src/theme.js";
import { DEFAULT_PIN, clearPin, hasCustomPin, isValidPin, loadPin, savePin } from "../src/lib/pin.js";
import { buildBoundedDate, daysInMonth, formatDate, toIso } from "../src/lib/dates.js";
import { normalizeReps } from "../src/lib/dataSource.js";
import { activeReps, applyReps, nextRepId, reconcileReps, repBreakdown, repByName, repKey } from "../src/lib/reps.js";
import { buildReminderList, dueLabel, earliestDue, groupOf, latestDue } from "../src/lib/reminders.js";
import { normalizeTiers, metaAoA, readMeta, BACKUP_FORMAT, backupFilename, tierAoA } from "../src/lib/dataSource.js";
import { applyTiers, byTier, moveTier, reconcileTiers, tierLabel, tierRank, UNGRADED_RANK } from "../src/lib/tiers.js";
import { layoutFor, cardGrid, screenPadding, BREAKPOINTS } from "../src/lib/layout.js";
import { moveRanked, reRank, sortList } from "../src/lib/lookups.js";
import { DEFAULT_COUNTRY_CODE, canWhatsApp, whatsappLink, whatsappNumber } from "../src/lib/whatsapp.js";
import { DEFAULT_OPEN, isOpen, loadCollapsed, saveCollapsed } from "../src/lib/collapsed.js";
import { TEMPLATE_COLUMNS, describePlan, planCustomerImport } from "../src/lib/importCustomers.js";
import { crc32, patchZipEntry, readZip, writeZip } from "../src/lib/xlsxZip.js";
import { columnLetter, insertValidations, templateRules, validationsXml } from "../src/lib/xlsxValidation.js";
import { buildSheets, cadenceText, hasContent, lastSeenText, sheetTargets } from "../src/lib/printReports.js";
import { normalizeTiers as _tiersFor } from "../src/lib/dataSource.js";

let passed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
};

/* ---- dates ---- */

check("parses ISO dates", () => {
  assert.equal(parseDate("2026-09-05"), "2026-09-05");
  assert.equal(parseDate("2026-9-5"), "2026-09-05");
});

check("parses day-first dates the way an Indian spreadsheet writes them", () => {
  assert.equal(parseDate("05/09/2026"), "2026-09-05");
  assert.equal(parseDate("5-9-26"), "2026-09-05");
});

check("parses Excel serial numbers and Date objects", () => {
  assert.equal(parseDate(46270), "2026-09-05"); // Excel serial for 5 Sep 2026
  assert.equal(parseDate(new Date(2026, 8, 5)), "2026-09-05");
});

check("rejects rubbish rather than inventing a date", () => {
  for (const bad of ["", null, undefined, "not a date", "2026-02-31", "  "]) {
    assert.equal(parseDate(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

check("days-ago and days-until are inverses around today", () => {
  assert.equal(daysAgo(todayIso()), 0);
  assert.equal(daysAgo(isoDaysAgo(7)), 7);
  assert.equal(daysUntil(isoDaysFromNow(3)), 3);
  assert.equal(daysUntil(isoDaysAgo(3)), -3);
});

check("day arithmetic crosses a month boundary correctly", () => {
  assert.equal(daysAgo("2026-08-31", new Date(2026, 8, 5)), 5);
  assert.equal(daysAgo("2026-12-31", new Date(2027, 0, 1)), 1);
});

/* ---- rhythm ---- */

const S = { ...DEFAULT_SETTINGS }; // weekly default

// The shop trades Mon-Sat. Anchor the week tests to a known Saturday so the
// arithmetic is checkable by eye: Mon 31 Aug 2026 opens the week Sat 5 Sep closes.
const SAT = new Date(2026, 8, 5);
const MON = new Date(2026, 8, 7);

const on = (...isoDates) => ({ visits: isoDates, call: null });
const every = (weeks, ...isoDates) => ({ ...on(...isoDates), visitEveryWeeks: weeks });

/* ---- trading weeks ---- */

check("a week runs Monday to Sunday, so Saturday and Sunday close it", () => {
  const w = weekIndexOf("2026-08-31"); // Monday
  assert.equal(weekIndexOf("2026-09-02"), w, "midweek");
  assert.equal(weekIndexOf("2026-09-05"), w, "Saturday, last trading day");
  assert.equal(weekIndexOf("2026-09-06"), w, "Sunday closes the week");
  assert.equal(weekIndexOf("2026-09-07"), w + 1, "Monday opens the next one");
});

check("a visit any day of the week counts for that week", () => {
  for (const day of ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]) {
    assert.equal(weeksSince(day, SAT), 0, `${day} should be this week`);
  }
});

check("trading days left counts down to Saturday and is zero on Sunday", () => {
  assert.equal(tradingDaysLeft(MON), 6);
  assert.equal(tradingDaysLeft(SAT), 1);
  assert.equal(tradingDaysLeft(new Date(2026, 8, 6)), 0, "Sunday, shop shut");
});

check("only whole weeks are a cadence; legacy day counts convert", () => {
  assert.equal(parseWeeks(2), 2);
  assert.equal(parseWeeks("3"), 3);
  for (const bad of [0, -1, null, undefined, "", "weekly", NaN]) assert.equal(parseWeeks(bad), null, JSON.stringify(bad));
  assert.equal(weeksFromDays(7), 1);
  assert.equal(weeksFromDays(14), 2);
  assert.equal(weeksFromDays(10), 1, "10 days rounds to the nearest week");
  assert.equal(weeksFromDays(0), null);
});

/* ---- cadence and status ---- */

check("a customer's own cadence wins; otherwise the app default applies", () => {
  assert.deepEqual(targetFor(every(2, "2026-09-01"), S), { weeks: 2, isDefault: false });
  assert.deepEqual(targetFor(on("2026-09-01"), S), { weeks: 1, isDefault: true });
  assert.deepEqual(targetFor({ visits: [], visitEveryWeeks: "fortnightly" }, S), { weeks: 1, isDefault: true });
});

check("weeks-since uses the most recent visit", () => {
  assert.equal(weeksSinceLastVisit(on("2026-08-17", "2026-09-02"), SAT), 0);
  assert.equal(weeksSinceLastVisit(on("2026-08-24"), SAT), 1);
});

check("a weekly retailer who came this week is on track, whatever day it is", () => {
  assert.equal(statusFor(every(1, "2026-08-31"), S, SAT).key, "onTrack", "came Monday");
  assert.equal(statusFor(every(1, "2026-09-05"), S, SAT).key, "onTrack", "came Saturday");
});

check("came last week and not yet this week means due, not late", () => {
  const due = statusFor(every(1, "2026-08-24"), S, SAT);
  assert.equal(due.key, "dueThisWeek");
  assert.equal(due.weeksMissed, 0);
});

check("the week closing without them is what makes it a call", () => {
  // Same customer, same last visit — Saturday it is merely due, Monday it is missed.
  const c = every(1, "2026-08-24");
  assert.equal(statusFor(c, S, SAT).key, "dueThisWeek");
  assert.equal(statusFor(c, S, MON).key, "missed");
  assert.equal(statusFor(c, S, MON).label, "Missed 1 week");
});

check("a fortnightly retailer is not chased in their off week", () => {
  assert.equal(statusFor(every(2, "2026-08-24"), S, SAT).key, "onTrack", "came last week");
  assert.equal(statusFor(every(2, "2026-08-17"), S, SAT).key, "dueThisWeek", "came two weeks ago");
  assert.equal(statusFor(every(2, "2026-08-10"), S, SAT).label, "Missed 1 week");
});

check("missed weeks accumulate and read in plain words", () => {
  // Three weeks since their last visit, weekly cadence: two whole weeks have
  // closed without them. The week still running is not counted as missed.
  assert.equal(statusFor(every(1, "2026-08-10"), S, SAT).label, "Missed 2 weeks");
  assert.equal(statusFor(every(1, "2026-08-10"), S, SAT).weeksMissed, 2);
  assert.equal(statusFor(every(4, "2026-06-01"), S, SAT).weeksMissed, 9);
  assert.equal(statusFor(every(1, "2026-08-17"), S, SAT).label, "Missed 1 week", "singular");
});

check("the same absence means different things at different cadences", () => {
  const lastVisit = "2026-08-17"; // two weeks before the anchor Saturday
  assert.equal(statusFor(every(1, lastVisit), S, SAT).key, "missed");
  assert.equal(statusFor(every(2, lastVisit), S, SAT).key, "dueThisWeek");
  assert.equal(statusFor(every(4, lastVisit), S, SAT).key, "onTrack");
});

check("a single visit is still tracked — the old model ignored these forever", () => {
  const oneVisit = every(1, "2026-07-06");
  assert.equal(statusFor(oneVisit, S, SAT).key, "missed");
  assert.equal(statusFor(oneVisit, S, SAT).weeksMissed, 7);
});

check("no visits at all is 'never', not a false 'on track'", () => {
  assert.equal(statusFor({ visits: [], call: null }, S, SAT).key, "never");
});

check("average gap survives as an observation, not as the status", () => {
  const fortnightly = { visits: [isoDaysAgo(2), isoDaysAgo(16), isoDaysAgo(30), isoDaysAgo(44)], call: null };
  assert.equal(avgGap(fortnightly), 14);
  assert.equal(regularity(fortnightly), "very regular");
  assert.equal(avgGap({ visits: [isoDaysAgo(4)], call: null }), null);
});

check("visit dates still resolve to days-ago, most recent first", () => {
  assert.deepEqual(visitDays({ visits: [isoDaysAgo(30), isoDaysAgo(2), isoDaysAgo(16)] }), [2, 16, 30]);
});

/* ---- the follow-up list ---- */

const book = (...entries) => entries.map((e, i) => ({ id: `c${i}`, name: `Shop ${i}`, initials: "S", visits: [], ...e }));
const build = (customers, now = SAT) => buildFollowUps(customers, [], S, { now });

check("three visits is a pattern; fewer is not", () => {
  assert.equal(isEstablished({ visits: ["a", "b", "c"] }), true);
  assert.equal(isEstablished({ visits: ["a", "b"] }), false);
  assert.equal(isEstablished({ visits: [] }), false);
});

check("only customers who missed a closed week are chased", () => {
  const f = build(
    book(
      { visits: ["2026-09-02"], visitEveryWeeks: 1 },                                        // in this week
      { visits: ["2026-08-24"], visitEveryWeeks: 1 },                                        // due, week still open
      { visits: ["2026-08-17", "2026-08-10", "2026-08-03"], visitEveryWeeks: 1 }             // missed
    )
  );
  assert.equal(f.toCallCount, 1, "on-track and due-this-week are not calls");
  assert.equal(f.missedLastWeek.length, 1);
});

check("the freshly missed are ranked by how much is at risk", () => {
  const many = { visits: ["2026-08-17", "2026-08-10", "2026-08-03", "2026-07-27", "2026-07-20"], visitEveryWeeks: 1 };
  const few = { visits: ["2026-08-17", "2026-08-10", "2026-08-03"], visitEveryWeeks: 1 };
  const f = build(book(few, many));
  assert.equal(f.missedLastWeek[0].visits, 5, "the more established customer comes first");
});

check("still-away runs most recoverable first, not worst first", () => {
  const gone = { visits: ["2026-05-04", "2026-04-27", "2026-04-20"], visitEveryWeeks: 1 };
  const recent = { visits: ["2026-08-10", "2026-08-03", "2026-07-27"], visitEveryWeeks: 1 };
  const f = build(book(gone, recent));
  assert.equal(f.stillAway.length, 2);
  assert.ok(
    f.stillAway[0].weeksMissed < f.stillAway[1].weeksMissed,
    "a customer gone one week outranks one gone four months"
  );
});

check("one or two visits is a lead that never converted, not a lapsed regular", () => {
  const f = build(book({ visits: ["2026-06-01"], visitEveryWeeks: 1 }));
  assert.equal(f.neverReturned.length, 1);
  assert.equal(f.missedLastWeek.length + f.stillAway.length, 0);
});

check("calling takes them off this week's list but not next week's", () => {
  const visits = ["2026-08-10", "2026-08-03", "2026-07-27"];
  const called = { visits, visitEveryWeeks: 1, contact: { on: "2026-09-02", reason: "notNow", note: "" } };
  assert.equal(build(book(called)).called.length, 1, "off the list this week");
  assert.equal(build(book(called)).toCallCount, 0);
  // The following Monday they are due a chase again.
  const nextMonday = new Date(2026, 8, 7);
  assert.equal(build(book(called), nextMonday).toCallCount, 1, "back next week if still away");
});

check("snoozing hides them until the weeks run out", () => {
  const visits = ["2026-08-10", "2026-08-03", "2026-07-27"];
  const week = currentWeekIndex(SAT);
  const snoozed = { visits, visitEveryWeeks: 1, snoozedUntilWeek: week + 2 };
  assert.equal(build(book(snoozed)).snoozed.length, 1);
  assert.equal(build(book(snoozed)).toCallCount, 0);
  const expired = { visits, visitEveryWeeks: 1, snoozedUntilWeek: week };
  assert.equal(build(book(expired)).toCallCount, 1, "a lapsed snooze returns them to the list");
});

check("a visit after your call counts as won back", () => {
  const won = { visits: ["2026-09-02", "2026-08-03", "2026-07-27"], contact: { on: "2026-08-31", reason: "price", note: "" } };
  assert.equal(cameBackAfterCall(won), true);
  const notYet = { visits: ["2026-08-03", "2026-07-27"], contact: { on: "2026-08-31", reason: "price", note: "" } };
  assert.equal(cameBackAfterCall(notYet), false);
  assert.equal(cameBackAfterCall({ visits: ["2026-09-02"], contact: null }), false);
  assert.equal(build(book(won)).cameBack.length, 1);
});

check("nobody appears in two sections at once", () => {
  const f = build(
    book(
      { visits: ["2026-08-24", "2026-08-17", "2026-08-10"], visitEveryWeeks: 1 },
      { visits: ["2026-06-01", "2026-05-25", "2026-05-18"], visitEveryWeeks: 1 },
      { visits: ["2026-06-01"], visitEveryWeeks: 1 },
      { visits: ["2026-09-02"], visitEveryWeeks: 1 }
    )
  );
  const ids = [...f.missedLastWeek, ...f.stillAway, ...f.neverReturned, ...f.snoozed, ...f.called, ...f.cameBack].map(
    (e) => e.customer.id
  );
  assert.equal(new Set(ids).size, ids.length, "a customer must not be chased twice");
});

/* ---- logging a visit, and taking it back ---- */

check("a logged visit lands at the front of the list", () => {
  const c = { visits: ["2026-08-24", "2026-08-17"] };
  assert.deepEqual(addVisit(c, "2026-09-02").visits, ["2026-09-02", "2026-08-24", "2026-08-17"]);
});

check("a backdated visit sorts into place", () => {
  const c = { visits: ["2026-09-02", "2026-08-17"] };
  assert.deepEqual(addVisit(c, "2026-08-24").visits, ["2026-09-02", "2026-08-24", "2026-08-17"]);
});

check("tapping the same face twice in a day changes nothing", () => {
  const c = { visits: ["2026-09-02"] };
  const again = addVisit(c, "2026-09-02");
  assert.equal(again, c, "the same object comes back, so nothing was recorded twice");
  assert.deepEqual(again.visits, ["2026-09-02"]);
});

check("undo removes exactly the visit it added", () => {
  const before = { visits: ["2026-08-24", "2026-08-17"] };
  const after = addVisit(before, "2026-09-02");
  assert.deepEqual(removeVisit(after, "2026-09-02").visits, before.visits);
});

check("undo cannot delete a visit it did not create", () => {
  // The guard that matters: a second tap is a no-op, so the app offers no undo
  // for it. If it ever did, this is the visit that would be destroyed.
  const c = { visits: ["2026-09-02", "2026-08-24"] };
  assert.equal(hasVisit(c, "2026-09-02"), true);
  assert.equal(addVisit(c, "2026-09-02"), c, "no-op, therefore nothing undoable");
  assert.deepEqual(removeVisit(c, "2026-07-01").visits, c.visits, "removing an absent date is a no-op");
});

check("add and remove leave the original untouched", () => {
  const c = Object.freeze({ visits: Object.freeze(["2026-08-24"]) });
  addVisit(c, "2026-09-02");
  removeVisit(c, "2026-08-24");
  assert.deepEqual(c.visits, ["2026-08-24"]);
});

check("a burst of mis-taps unwinds completely, newest first", () => {
  // Three faces tapped by mistake in quick succession, then Undo three times.
  const before = {
    a: { id: "a", name: "A", visits: ["2026-08-24"] },
    b: { id: "b", name: "B", visits: [] },
    c: { id: "c", name: "C", visits: ["2026-09-01", "2026-08-20"] },
  };
  const today = "2026-10-03";

  let book = { a: addVisit(before.a, today), b: addVisit(before.b, today), c: addVisit(before.c, today) };
  const stack = ["a", "b", "c"]; // oldest first, as the app records them
  assert.deepEqual(Object.keys(book).map((k) => book[k].visits.length), [2, 1, 3]);

  while (stack.length) {
    const id = stack.pop(); // newest first
    book = { ...book, [id]: removeVisit(book[id], today) };
  }
  assert.deepEqual(book.a.visits, before.a.visits);
  assert.deepEqual(book.b.visits, before.b.visits);
  assert.deepEqual(book.c.visits, before.c.visits);
});

check("undoing part of a burst leaves the rest of it recorded", () => {
  const today = "2026-10-03";
  const a = addVisit({ id: "a", visits: [] }, today);
  const b = addVisit({ id: "b", visits: [] }, today);
  // Only the most recent is taken back.
  assert.deepEqual(removeVisit(b, today).visits, [], "the undone one is gone");
  assert.deepEqual(a.visits, [today], "the earlier one stays");
});

/* ---- the visit log ---- */

const logBook = [
  { id: "a", name: "Alpha Jewellers", phone: "9800000001", visits: ["2026-10-03", "2026-09-26", "2026-07-01"] },
  { id: "b", name: "Beta Gold", phone: "9800000002", visits: ["2026-10-03", "2026-10-02"] },
  { id: "c", name: "Gamma Traders", phone: "9800000003", visits: ["2026-06-15"] },
];
const TODAY = new Date(2026, 9, 3); // 3 Oct 2026

check("the log flattens every visit across the book, newest day first", () => {
  const log = buildVisitLog(logBook, { windowDays: null }, TODAY);
  assert.equal(log.total, 6);
  assert.equal(log.groups[0].date, "2026-10-03");
  assert.equal(log.groups[0].entries.length, 2, "two customers came in today");
  assert.deepEqual(log.groups.map((g) => g.date), ["2026-10-03", "2026-10-02", "2026-09-26", "2026-07-01", "2026-06-15"]);
});

check("today and yesterday are named, older days are dated", () => {
  const log = buildVisitLog(logBook, { windowDays: null }, TODAY);
  assert.equal(log.groups[0].label, "Today");
  assert.equal(log.groups[1].label, "Yesterday");
  assert.match(log.groups[2].label, /Sep/);
});

check("within a day the order is stable, not whatever the book happened to be", () => {
  const log = buildVisitLog(logBook, { windowDays: null }, TODAY);
  assert.deepEqual(log.groups[0].entries.map((e) => e.customer.name), ["Alpha Jewellers", "Beta Gold"]);
});

check("the window hides older visits but still counts them", () => {
  const log = buildVisitLog(logBook, { windowDays: 30 }, TODAY);
  assert.equal(log.shown, 4, "the July and June visits fall outside 30 days");
  assert.equal(log.olderHidden, 2);
  assert.equal(buildVisitLog(logBook, { windowDays: null }, TODAY).olderHidden, 0);
});

check("search narrows by name or phone", () => {
  assert.equal(buildVisitLog(logBook, { windowDays: null, query: "beta" }, TODAY).shown, 2);
  assert.equal(buildVisitLog(logBook, { windowDays: null, query: "9800000003" }, TODAY).shown, 1);
  assert.equal(buildVisitLog(logBook, { windowDays: null, query: "nobody" }, TODAY).shown, 0);
});

check("deleting from the log is the same removal the undo path uses", () => {
  const before = buildVisitLog(logBook, { windowDays: null }, TODAY).total;
  const edited = logBook.map((c) => (c.id === "b" ? removeVisit(c, "2026-10-03") : c));
  const after = buildVisitLog(edited, { windowDays: null }, TODAY);
  assert.equal(after.total, before - 1);
  assert.equal(after.groups[0].entries.length, 1, "only Alpha is left for today");
});

check("a customer with no visits contributes nothing and does not crash", () => {
  const log = buildVisitLog([...logBook, { id: "d", name: "Empty Co", visits: [] }], { windowDays: null }, TODAY);
  assert.equal(log.total, 6);
});

/* ---- visit counts ---- */

const NOW = new Date(2026, 9, 3); // Sat 3 Oct 2026

check("period starts count back from today", () => {
  assert.equal(periodStart({ days: 28 }, NOW), "2026-09-05");
  assert.equal(periodStart({ months: 3 }, NOW), "2026-07-03");
  assert.equal(periodStart({ months: 12 }, NOW), "2025-10-03");
});

check("stepping back a month never lands in the month it started in", () => {
  // 31 March minus one month has no 31st to land on.
  assert.equal(periodStart({ months: 1 }, new Date(2026, 2, 31)), "2026-02-28");
  assert.equal(periodStart({ months: 1 }, new Date(2024, 2, 31)), "2024-02-29", "leap year");
  assert.equal(periodStart({ months: 1 }, new Date(2026, 4, 31)), "2026-04-30");
});

check("a visit exactly on the boundary is inside the window", () => {
  const c = { visits: ["2026-09-05"] };
  assert.equal(countVisitsSince(c, "2026-09-05", NOW), 1);
  assert.equal(countVisitsSince(c, "2026-09-06", NOW), 0);
});

check("today counts, and a date in the future does not", () => {
  const c = { visits: ["2026-10-03", "2026-11-01"] };
  assert.equal(countVisitsSince(c, "2026-01-01", NOW), 1, "the November date is not a visit yet");
});

check("counts narrow as the window narrows", () => {
  const c = {
    visits: ["2026-10-01", "2026-09-20", "2026-08-15", "2026-05-02", "2025-12-01", "2025-06-01"],
  };
  const byKey = Object.fromEntries(visitCounts(c, NOW).map((r) => [r.key, r.count]));
  assert.equal(byKey["4w"], 2, "Oct 1 and Sep 20");
  assert.equal(byKey["3m"], 3, "plus Aug 15");
  assert.equal(byKey["6m"], 4, "plus May 2");
  assert.equal(byKey["12m"], 5, "plus Dec 1; the 2025-06 visit is outside a year");
});

check("a window reaching past the records is flagged, not silently wrong", () => {
  // First visit 1 Aug: the 4-week window sits inside that, the longer ones do not.
  const c = { visits: ["2026-09-28", "2026-09-14", "2026-08-01"] };
  const rows = Object.fromEntries(visitCounts(c, NOW).map((r) => [r.key, r]));
  assert.equal(rows["4w"].coversPeriod, true, "records reach back past 5 Sep");
  assert.equal(rows["3m"].coversPeriod, false, "but not back to 3 Jul");
  assert.equal(rows["12m"].coversPeriod, false);
  // The count itself stays truthful, just over less time than the label implies.
  assert.equal(rows["12m"].count, 3);
});

check("a customer new to the book is partial on every window", () => {
  // We cannot tell "did not visit" from "was not on the books yet", so a short
  // history is never reported as a full period.
  const recent = { visits: ["2026-09-28", "2026-09-14"] };
  assert.equal(visitCounts(recent, NOW).every((r) => r.coversPeriod === false), true);
});

check("a customer with one visit today reports a day of history, not a crash", () => {
  const c = { visits: ["2026-10-03"] };
  assert.equal(historyDays(c, NOW), 0);
  assert.equal(visitCounts(c, NOW).every((r) => r.count === 1), true);
  assert.equal(visitCounts(c, NOW).every((r) => r.coversPeriod === false), true);
});

check("no visits gives zeroes rather than blowing up", () => {
  const c = { visits: [] };
  assert.equal(historyDays(c, NOW), 0);
  assert.deepEqual(visitCounts(c, NOW).map((r) => r.count), [0, 0, 0, 0]);
});

/* ---- reports ---- */

const P3M = periodByKey("3m");
const reportBook = [
  { id: "a", name: "Alpha Jewellers", phone: "9800000001", visits: ["2026-10-01", "2026-09-20", "2026-08-15"] },
  { id: "b", name: "Beta Gold", phone: "9800000002", visits: ["2026-09-30"] },
  { id: "c", name: "Gamma Traders", phone: "9800000003", visits: ["2025-01-01"] }, // nothing recent
  { id: "d", name: "Delta Co", phone: "9800000004", visits: [] },
];

check("the count report keeps customers who came in not at all", () => {
  const r = customerVisitCounts(reportBook, P3M, { order: "fewest" }, NOW);
  assert.equal(r.rows.length, 4, "nobody is filtered out");
  assert.equal(r.withNone, 2, "Gamma and Delta");
  assert.equal(r.totalVisits, 4);
  assert.deepEqual(r.rows.slice(0, 2).map((x) => x.count), [0, 0], "the quiet ones lead the fewest sort");
});

check("most-first and fewest-first are exact mirrors", () => {
  const most = customerVisitCounts(reportBook, P3M, { order: "most" }, NOW).rows.map((r) => r.count);
  const fewest = customerVisitCounts(reportBook, P3M, { order: "fewest" }, NOW).rows.map((r) => r.count);
  assert.deepEqual(most, [...fewest].reverse());
  assert.equal(most[0], 3, "Alpha is busiest");
});

check("equal counts are ordered by name, so the list never shuffles", () => {
  const tied = [
    { id: "z", name: "Zeta", visits: ["2026-09-01"] },
    { id: "m", name: "Mu", visits: ["2026-09-01"] },
  ];
  assert.deepEqual(
    customerVisitCounts(tied, P3M, { order: "most" }, NOW).rows.map((r) => r.customer.name),
    ["Mu", "Zeta"]
  );
});

check("the count report searches like the other screens", () => {
  assert.equal(customerVisitCounts(reportBook, P3M, { query: "beta" }, NOW).rows.length, 1);
  assert.equal(customerVisitCounts(reportBook, P3M, { query: "9800000003" }, NOW).rows.length, 1);
});

check("reasons are counted only for calls inside the period", () => {
  const book = [
    { id: "1", name: "One", visits: [], contact: { on: "2026-09-20", reason: "price", note: "" } },
    { id: "2", name: "Two", visits: [], contact: { on: "2026-09-21", reason: "price", note: "" } },
    { id: "3", name: "Three", visits: [], contact: { on: "2026-09-22", reason: "unhappy", note: "" } },
    { id: "4", name: "Four", visits: [], contact: { on: "2025-01-05", reason: "price", note: "" } }, // too old
    { id: "5", name: "Five", visits: [], contact: null },
  ];
  const r = reasonBreakdown(book, P3M, NOW);
  assert.equal(r.total, 3, "the 2025 call is outside three months, and Five was never rung");
  assert.equal(r.rows.find((x) => x.key === "price").count, 2);
  assert.equal(r.rows.find((x) => x.key === "unhappy").count, 1);
  assert.equal(r.rows.find((x) => x.key === "service").count, 0, "unused reasons still appear, at zero");
});

check("each reason splits by whether the call actually brought them back", () => {
  // Same objection, opposite outcomes — the thing a flat count would hide.
  const book = [
    { id: "won", name: "Won", visits: ["2026-09-25"], contact: { on: "2026-09-20", reason: "price", note: "" } },
    { id: "lost", name: "Lost", visits: ["2026-08-01"], contact: { on: "2026-09-20", reason: "price", note: "" } },
  ];
  const price = reasonBreakdown(book, P3M, NOW).rows.find((r) => r.key === "price");
  assert.equal(price.count, 2);
  assert.deepEqual(price.cameBack.map((c) => c.id), ["won"]);
  assert.deepEqual(price.notBack.map((c) => c.id), ["lost"]);
  assert.equal(price.recovery, 0.5);
});

check("a customer on track who has not returned since the call is not counted as back", () => {
  // Visited before the call, nothing since: the call has not worked yet.
  const book = [{ id: "x", name: "X", visits: ["2026-09-18"], contact: { on: "2026-09-20", reason: "noAnswer", note: "" } }];
  const row = reasonBreakdown(book, P3M, NOW).rows.find((r) => r.key === "noAnswer");
  assert.equal(row.backCount, 0);
  assert.equal(row.notBack.length, 1);
});

check("the headline recovery rate totals the per-reason splits", () => {
  const book = [
    { id: "a", name: "A", visits: ["2026-09-25"], contact: { on: "2026-09-20", reason: "price", note: "" } },
    { id: "b", name: "B", visits: ["2026-09-26"], contact: { on: "2026-09-20", reason: "notNow", note: "" } },
    { id: "c", name: "C", visits: [], contact: { on: "2026-09-20", reason: "unhappy", note: "" } },
  ];
  const r = reasonBreakdown(book, P3M, NOW);
  assert.equal(r.total, 3);
  assert.equal(r.totalCameBack, 2);
  assert.equal(r.recovery, 2 / 3);
  assert.equal(r.rows.reduce((n, x) => n + x.backCount, 0), r.totalCameBack);
});

check("a reason nobody gave has no recovery rate rather than a fake zero", () => {
  const book = [{ id: "a", name: "A", visits: [], contact: { on: "2026-09-20", reason: "price", note: "" } }];
  const service = reasonBreakdown(book, P3M, NOW).rows.find((r) => r.key === "service");
  assert.equal(service.count, 0);
  assert.equal(service.recovery, null, "0/0 is not 0%");
});

check("a call with no reason recorded is counted apart, not dropped silently", () => {
  const book = [{ id: "1", name: "One", visits: [], contact: { on: "2026-09-20", reason: null, note: "" } }];
  const r = reasonBreakdown(book, P3M, NOW);
  assert.equal(r.total, 0);
  assert.equal(r.calledWithoutReason, 1);
});

/* ---- custom ranges ---- */

check("a preset resolves to a range ending today", () => {
  const r = resolveRange({ days: 28 }, NOW);
  assert.equal(r.from, "2026-09-05");
  assert.equal(r.to, "2026-10-03");
});

check("a custom period carries its own dates", () => {
  const r = resolveRange({ from: "2026-01-01", to: "2026-02-01" }, NOW);
  assert.deepEqual(r, { from: "2026-01-01", to: "2026-02-01" });
  assert.equal(resolveRange({ from: "2026-01-01" }, NOW).to, "2026-10-03", "an open end means today");
});

check("counting respects both ends of the range", () => {
  const c = { visits: ["2026-10-01", "2026-08-15", "2026-06-01"] };
  assert.equal(countVisitsBetween(c, "2026-07-01", "2026-09-01", NOW), 1, "only the August visit");
  assert.equal(countVisitsBetween(c, "2026-06-01", "2026-10-01", NOW), 3, "both ends inclusive");
});

check("a range cannot reach past today, however it is asked for", () => {
  const c = { visits: ["2026-10-03"] };
  assert.equal(countVisitsBetween(c, "2026-01-01", "2027-12-31", NOW), 1);
});

check("the floor is the oldest visit anywhere in the book", () => {
  assert.equal(
    earliestVisit([
      { visits: ["2026-05-01", "2026-03-02"] },
      { visits: ["2026-01-09"] },
      { visits: [] },
    ]),
    "2026-01-09"
  );
  assert.equal(earliestVisit([{ visits: [] }]), null, "no records, no floor");
});

check("a from-date before the records is pulled forward to them", () => {
  const bounds = { min: "2026-03-01", max: "2026-10-03" };
  assert.deepEqual(
    clampRange({ from: "2020-01-01", to: "2026-09-01" }, bounds),
    { from: "2026-03-01", to: "2026-09-01" }
  );
});

check("a to-date in the future is pulled back to today", () => {
  const bounds = { min: "2026-03-01", max: "2026-10-03" };
  assert.deepEqual(
    clampRange({ from: "2026-04-01", to: "2027-01-01" }, bounds),
    { from: "2026-04-01", to: "2026-10-03" }
  );
});

check("a back-to-front range is corrected rather than counted as empty", () => {
  const bounds = { min: "2026-03-01", max: "2026-10-03" };
  const r = clampRange({ from: "2026-09-01", to: "2026-04-01" }, bounds);
  assert.ok(r.from <= r.to, `expected from <= to, got ${r.from}..${r.to}`);
});

check("both ends outside the data collapse onto it, not past it", () => {
  const bounds = { min: "2026-03-01", max: "2026-10-03" };
  assert.deepEqual(clampRange({ from: "2020-01-01", to: "2021-01-01" }, bounds).from, "2026-03-01");
  assert.ok(clampRange({ from: "2030-01-01", to: "2030-06-01" }, bounds).from <= "2026-10-03");
});

check("dates read day-first regardless of how the phone is set", () => {
  // A shop handset on a US default must not show "Oct 3" beside another
  // showing "3 Oct" — the format is pinned, not inherited.
  assert.equal(formatDate("2026-10-03"), "3 Oct 2026");
  assert.equal(formatDate("2026-01-09"), "9 Jan 2026");
  assert.equal(formatDate(null), "—");
  assert.equal(formatDate("not a date"), "—");
});

check("a day that does not exist in the chosen month is pulled back", () => {
  // Pick 31 January, then switch the month to February.
  assert.equal(buildBoundedDate(2026, 1, 31, null, null), "2026-02-28");
  assert.equal(buildBoundedDate(2024, 1, 31, null, null), "2024-02-29", "leap year keeps the 29th");
  assert.equal(buildBoundedDate(2026, 3, 31, null, null), "2026-04-30", "April has 30");
  assert.equal(buildBoundedDate(2026, 0, 31, null, null), "2026-01-31", "January really does");
});

check("the picker cannot produce a date outside the bounds", () => {
  const min = "2026-03-15";
  const max = "2026-10-03";
  assert.equal(buildBoundedDate(2025, 0, 1, min, max), min, "before the first record");
  assert.equal(buildBoundedDate(2027, 11, 31, min, max), max, "after today");
  assert.equal(buildBoundedDate(2026, 2, 1, min, max), min, "same month as the floor, earlier day");
  assert.equal(buildBoundedDate(2026, 9, 31, min, max), max, "same month as the ceiling, later day");
  assert.equal(buildBoundedDate(2026, 5, 10, min, max), "2026-06-10", "inside the window, untouched");
});

/* ---- customer ids and the action log ---- */

check("ids in the sheet are kept; missing or duplicated ones are reissued", () => {
  const cs = normalizeCustomers([
    { customer_id: 3, name: "Gamma" },
    { name: "Alpha" },
    { customer_id: 3, name: "Delta" }, // a clash, not a merge: different name
  ]);
  assert.deepEqual(cs.map((c) => `${c.id}:${c.name}`), ["3:Gamma", "1:Alpha", "2:Delta"]);
  assert.equal(nextCustomerId(cs), "4");
});

check("an id survives a rename, which a name-based key could not", () => {
  const cs = normalizeCustomers([{ customer_id: 7, name: "Old Name" }]);
  const reminders = normalizeReminders([{ customer_id: 7, due_date: "2026-10-01", note: "x" }], [
    { ...cs[0], name: "Brand New Name" },
  ]);
  assert.equal(reminders.length, 1, "the reminder still finds its customer");
});

check("visits come from logged actions only", () => {
  const cs = normalizeCustomers([{ customer_id: 1, name: "A" }]);
  const actions = normalizeActions(
    [
      { customer_id: 1, visit_date: "2026-10-01", is_logged: 1 },
      { customer_id: 1, visit_date: "2026-10-02", is_logged: 0 }, // undone
      { customer_id: 1, visit_date: "2026-10-03" }, // blank counts as logged
    ],
    cs
  );
  assert.deepEqual(applyActions(cs, actions)[0].visits, ["2026-10-03", "2026-10-01"]);
});

check("an undone action stays in the log rather than vanishing", () => {
  const cs = normalizeCustomers([{ customer_id: 1, name: "A" }]);
  const actions = normalizeActions([{ action_id: "a1", customer_id: 1, visit_date: "2026-10-01", is_logged: 0 }], cs);
  assert.equal(actions.length, 1, "the row is still there");
  assert.equal(actions[0].isLogged, false);
  assert.deepEqual(applyActions(cs, actions)[0].visits, [], "but it is not a visit");
});

check("an older sheet with packed visit_dates converts to action rows", () => {
  const cs = normalizeCustomers([{ customer_id: 1, name: "A", visit_dates: "2026-10-01 | 2026-09-01" }]);
  const actions = actionsFromCustomers(cs);
  assert.equal(actions.length, 2);
  assert.ok(actions.every((a) => a.customerId === "1" && a.isLogged));
});

/* ---- the outbox ---- */

check("only a deployed web app URL counts as configured", () => {
  assert.equal(isConfigured({ url: "https://script.google.com/macros/s/AKfy123/exec" }), true);
  for (const bad of ["", "not a url", "https://docs.google.com/spreadsheets/d/abc", undefined]) {
    assert.equal(isConfigured({ url: bad }), false, JSON.stringify(bad));
  }
});

check("re-tapping a row replaces its queued change instead of stacking them", () => {
  const a1 = changeFor.action({ actionId: "a1", customerId: "1", date: "2026-10-01", isLogged: true });
  const a1Undone = changeFor.action({ actionId: "a1", customerId: "1", date: "2026-10-01", isLogged: false });
  const a2 = changeFor.action({ actionId: "a2", customerId: "2", date: "2026-10-01", isLogged: true });

  let q = enqueue([], [a1]);
  q = enqueue(q, [a2]);
  q = enqueue(q, [a1Undone]);
  assert.equal(q.length, 2, "log-then-undo is one row, not two");
  assert.equal(q.find((c) => c.row.action_id === "a1").row.is_logged, 0, "and it is the final state that goes up");
});

check("changes to different tables queue side by side", () => {
  const q = enqueue(
    [],
    [
      changeFor.customer({ id: "1", name: "A" }),
      changeFor.action({ actionId: "a1", customerId: "1", date: "2026-10-01", isLogged: true }),
      changeFor.reminder({ id: "r1", customerId: "1", dueOn: "2026-10-05", note: "" }, "A"),
    ]
  );
  assert.deepEqual(q.map((c) => c.tab), ["customers", "actions", "reminders"]);
  assert.equal(q[0].key, "customer_id");
});

check("a URL that is not a deployed web app is rejected before any request", () => {
  const cases = {
    "https://script.google.com/macros/s/AKfy123/exec": true,
    "https://script.google.com/macros/s/AKfy123/dev": false,      // test URL, needs a login
    "https://docs.google.com/spreadsheets/d/abc/edit": false,     // the sheet, not the script
    "https://script.google.com/macros/s/AKfy123": false,          // missing /exec
    "": false,
  };
  for (const [url, expected] of Object.entries(cases)) {
    assert.equal(isConfigured({ url }), expected, url || "(empty)");
  }
});

check("a full upload is chunked small enough for a URL to carry", () => {
  // The transport that works here is GET, so every chunk has to fit in a URL.
  const many = Array.from({ length: 500 }, (_, i) => ({
    actionId: `a${i}`,
    customerId: String((i % 60) + 1),
    date: "2026-10-01",
    isLogged: true,
    loggedAt: "2026-10-01T09:00:00.000Z",
  }));
  const [, ...rows] = actionAoA(many);

  // Mirrors the packing in replaceTab.
  const chunks = [];
  let current = [];
  let size = 0;
  for (const row of rows) {
    const rowSize = JSON.stringify(row).length;
    if (current.length && size + rowSize > 3500) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(row);
    size += rowSize;
  }
  if (current.length) chunks.push(current);

  assert.ok(chunks.length > 1, "500 actions must not go up in one request");
  for (const chunk of chunks) {
    const url = `https://script.google.com/macros/s/x/exec?payload=${encodeURIComponent(
      JSON.stringify({ op: "replace", tab: "actions", rows: chunk, mode: "append" })
    )}`;
    assert.ok(url.length <= 7000, `a chunk produced a ${url.length}-character URL`);
  }
  assert.equal(chunks.flat().length, rows.length, "no rows lost in the chunking");
});

check("the header row is not uploaded — the script writes its own", () => {
  const aoa = customerAoA([{ id: "1", name: "A", visits: [] }]);
  assert.equal(aoa[0][0], "customer_id", "row 0 is the header");
  assert.equal(aoa.length, 2, "header plus one customer");
});

/* ---- names ---- */

check("initials come from the first two words", () => {
  assert.equal(initialsFor("Rajesh Traders"), "RT");
  assert.equal(initialsFor("Patel & Sons"), "P&");
  assert.equal(initialsFor("Ambika"), "AM");
  assert.equal(initialsFor("  "), "?");
});

/* ---- owner PIN ---- */

// pin.js talks to localStorage; give it one.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

check("only four digits count as a PIN", () => {
  for (const good of ["0000", "1234", "9999"]) assert.equal(isValidPin(good), true, good);
  for (const bad of ["", null, undefined, "123", "12345", "12a4", " 1234", "abcd"]) {
    assert.equal(isValidPin(bad), false, JSON.stringify(bad));
  }
});

check("with nothing stored, the build PIN wins, else the default", () => {
  store.clear();
  assert.equal(loadPin(undefined), DEFAULT_PIN);
  assert.equal(loadPin("4321"), "4321");
  assert.equal(loadPin("nope"), DEFAULT_PIN, "a malformed build PIN is ignored");
});

check("a PIN set on the device beats the build PIN", () => {
  store.clear();
  assert.equal(hasCustomPin(), false);
  savePin("8080");
  assert.equal(hasCustomPin(), true);
  assert.equal(loadPin("4321"), "8080");
});

check("resetting falls back to the build PIN, then the default", () => {
  store.clear();
  savePin("8080");
  clearPin();
  assert.equal(hasCustomPin(), false);
  assert.equal(loadPin("4321"), "4321");
  assert.equal(loadPin(undefined), DEFAULT_PIN);
});

check("a malformed PIN is refused rather than stored", () => {
  store.clear();
  assert.throws(() => savePin("12"), /4 digits/);
  assert.equal(hasCustomPin(), false);
});

check("storage that throws degrades instead of crashing", () => {
  const good = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  assert.equal(loadPin("4321"), "4321", "falls back when reads throw");
  assert.equal(savePin("8080"), false, "reports that it could not save");
  assert.equal(hasCustomPin(), false);
  clearPin(); // must not throw
  globalThis.localStorage = good;
});

/* ---- the change-PIN flow, as a state machine ---- */

check("current -> new -> confirm changes the PIN", () => {
  store.clear();
  let pin = loadPin(undefined);
  assert.equal(pin, DEFAULT_PIN);
  assert.equal(DEFAULT_PIN === "1234", true);
  savePin("5678");
  pin = loadPin(undefined);
  assert.equal(pin, "5678");
  // The old PIN must stop working and the new one must start.
  assert.notEqual(pin, DEFAULT_PIN);
});


/* ---- marketing representatives ---- */

const REP_ROWS = [
  { rep_id: "1", name: "Priya Shah", is_active: "1" },
  { rep_id: "2", name: "Anil Kumar", is_active: "1" },
  { rep_id: "3", name: "Vikram Rao", is_active: "0" },
];

check("rep rows normalise, with is_active read as a flag", () => {
  const reps = normalizeReps(REP_ROWS);
  assert.equal(reps.length, 3);
  assert.equal(reps[0].name, "Priya Shah");
  assert.equal(reps[0].isActive, true);
  assert.equal(reps[2].isActive, false, "0 means removed");
  assert.deepEqual(activeReps(reps).map((r) => r.name), ["Anil Kumar", "Priya Shah"], "active only, alphabetical");
});

check("a blank is_active column means the rep is working", () => {
  const [rep] = normalizeReps([{ name: "Sunita Rao" }]);
  assert.equal(rep.isActive, true, "a hand-made sheet with no flag column still lists them");
  assert.equal(rep.id, "1", "an id is issued when the sheet has none");
});

check("the same rep typed twice is one person", () => {
  const reps = normalizeReps([
    { rep_id: "1", name: "Priya Shah", is_active: "0" },
    { rep_id: "2", name: "  priya   shah  ", is_active: "1" },
  ]);
  assert.equal(reps.length, 1, "case and spacing do not make a second rep");
  assert.equal(reps[0].isActive, true, "active anywhere wins — they are still working");
});

check("rep ids never collide, however the sheet was filled in", () => {
  const reps = normalizeReps([
    { rep_id: "2", name: "Anil Kumar" },
    { name: "Farah Qureshi" },
    { rep_id: "2", name: "Meena Rao" },
  ]);
  assert.equal(new Set(reps.map((r) => r.id)).size, 3, "ids are unique");
  assert.equal(nextRepId(reps), String(Math.max(...reps.map((r) => +r.id)) + 1));
});

check("a rep typed onto a customer row is adopted into the list", () => {
  const customers = normalizeCustomers([
    { name: "Meena Silver", marketing_rep: "Kiran Patel" },
    { name: "Anil & Co", marketing_rep: "kiran patel" },
  ]);
  const reps = reconcileReps(normalizeReps(REP_ROWS), customers);
  assert.equal(reps.length, 4, "one new rep, not two — the names are the same person");
  assert.ok(repByName(reps, "Kiran Patel"), "the typed name is now a rep");

  const resolved = applyReps(customers, reps);
  assert.equal(resolved[0].repId, resolved[1].repId, "both customers point at the same rep");
  assert.equal(resolved[1].repName, "Kiran Patel", "the stored name follows the list's spelling");
});

check("the rep id is the join, not the name", () => {
  const customers = [{ id: "1", name: "A", repId: "2", repName: "Stale Name" }];
  const [resolved] = applyReps(customers, normalizeReps(REP_ROWS));
  assert.equal(resolved.repName, "Anil Kumar", "a renamed rep renames everywhere");
});

check("a rep pointing at nobody clears rather than inventing one", () => {
  const [resolved] = applyReps([{ id: "1", name: "A", repId: "99", repName: "" }], normalizeReps(REP_ROWS));
  assert.equal(resolved.repId, null);
  assert.equal(resolved.repName, "");
});

check("customer company and rep survive the sheet round trip", () => {
  const rows = customerAoA([
    { id: "1", name: "Meena Silver", phone: "9800000001", company: "Meena Retail", repId: "2", repName: "Anil Kumar", visits: [] },
  ]);
  const header = rows[0];
  const back = normalizeCustomers([Object.fromEntries(rows[1].map((v, i) => [header[i], v]))]);
  assert.equal(back[0].company, "Meena Retail");
  assert.equal(back[0].repId, "2");
  assert.equal(back[0].repName, "Anil Kumar");
});

check("the rep report counts customers and their states", () => {
  const reps = normalizeReps(REP_ROWS);
  const customers = applyReps(
    [
      { id: "1", name: "On Track", repId: "1", repName: "", visits: [isoDaysAgo(1)], visitEveryWeeks: 2 },
      { id: "2", name: "Missed", repId: "1", repName: "", visits: [isoDaysAgo(60)], visitEveryWeeks: 1 },
      { id: "3", name: "Never", repId: "1", repName: "", visits: [] },
      { id: "4", name: "Anil's", repId: "2", repName: "", visits: [isoDaysAgo(1)], visitEveryWeeks: 2 },
      { id: "5", name: "Nobody's", repId: null, repName: "", visits: [isoDaysAgo(1)], visitEveryWeeks: 2 },
    ],
    reps
  );
  const data = repBreakdown(customers, reps, DEFAULT_SETTINGS);

  const priya = data.rows.find((r) => r.rep.name === "Priya Shah");
  assert.equal(priya.total, 3, "every customer assigned to them is counted");
  assert.equal(priya.counts.missed, 1);
  assert.equal(priya.counts.never, 1);
  assert.equal(priya.counts.onTrack, 1);
  assert.equal(priya.customers[0].customer.name, "Missed", "the ones needing attention sort first");

  assert.equal(data.assigned, 4);
  assert.equal(data.unassigned, 1);
  assert.equal(data.rows[data.rows.length - 1].rep.id, null, "unassigned always sits last");
  assert.equal(data.rows[0].rep.name, "Priya Shah", "busiest rep first");
});

check("searching the rep report narrows to that rep", () => {
  const reps = normalizeReps(REP_ROWS);
  const customers = applyReps([{ id: "1", name: "A", repId: "2", repName: "", visits: [] }], reps);
  const data = repBreakdown(customers, reps, DEFAULT_SETTINGS, { query: "anil" });
  assert.equal(data.rows.length, 1);
  assert.equal(data.rows[0].rep.name, "Anil Kumar");
  assert.equal(repBreakdown(customers, reps, DEFAULT_SETTINGS, { query: "zzz" }).rows.length, 0);
});

check("an active rep with nobody on them still gets a row", () => {
  const reps = normalizeReps(REP_ROWS);
  const rows = repBreakdown([], reps, DEFAULT_SETTINGS).rows;
  assert.deepEqual(rows.map((r) => r.rep.name).sort(), ["Anil Kumar", "Priya Shah"], '"none yet" is an answer worth showing');
  assert.ok(rows.every((r) => r.total === 0));
});

check("a removed rep shows only while customers are still on them", () => {
  const reps = normalizeReps(REP_ROWS);
  assert.ok(!repBreakdown([], reps, DEFAULT_SETTINGS).rows.some((r) => r.rep.name === "Vikram Rao"));
  const held = applyReps([{ id: "1", name: "A", repId: "3", repName: "", visits: [] }], reps);
  const row = repBreakdown(held, reps, DEFAULT_SETTINGS).rows.find((r) => r.rep.name === "Vikram Rao");
  assert.equal(row.total, 1, "their customers still have to be accounted for");
});

/* ---- reminders: upcoming, past and done ---- */

const REMINDER_CUSTOMERS = [
  { id: "1", name: "Rajesh Traders", phone: "9820011223", visits: [] },
  { id: "2", name: "Patel & Sons", phone: "9811122334", visits: [] },
];
const REMINDER_ROWS = [
  { reminder_id: "r1", customer_id: "1", due_date: isoDaysAgo(4), note: "Overdue one", is_done: "0" },
  { reminder_id: "r2", customer_id: "1", due_date: todayIso(), note: "Today", is_done: "" },
  { reminder_id: "r3", customer_id: "2", due_date: isoDaysFromNow(6), note: "Coming up", is_done: "0" },
  { reminder_id: "r4", customer_id: "2", due_date: isoDaysAgo(30), note: "Dealt with", is_done: "1" },
];

check("is_done comes across from the sheet, blank meaning outstanding", () => {
  const rs = normalizeReminders(REMINDER_ROWS, REMINDER_CUSTOMERS);
  assert.equal(rs.length, 4);
  assert.equal(rs.find((r) => r.id === "r4").isDone, true);
  assert.equal(rs.find((r) => r.id === "r2").isDone, false, "a blank cell is work still to do");
  assert.equal(rs.find((r) => r.id === "r1").isDone, false);
});

check("reminders group into overdue, today, upcoming and completed", () => {
  const rs = normalizeReminders(REMINDER_ROWS, REMINDER_CUSTOMERS);
  assert.equal(groupOf(rs.find((r) => r.id === "r1")), "overdue");
  assert.equal(groupOf(rs.find((r) => r.id === "r2")), "today");
  assert.equal(groupOf(rs.find((r) => r.id === "r3")), "upcoming");
  assert.equal(groupOf(rs.find((r) => r.id === "r4")), "done", "done beats its date");

  const list = buildReminderList(REMINDER_CUSTOMERS, rs);
  assert.deepEqual(list.groups.map((g) => g.key), ["overdue", "today", "upcoming", "done"]);
  assert.equal(list.shown, 4);
  assert.equal(dueLabel(rs.find((r) => r.id === "r1")), "4 days overdue");
  assert.equal(dueLabel(rs.find((r) => r.id === "r2")), "Due today");
  assert.equal(dueLabel(rs.find((r) => r.id === "r3")), "In 6 days");
});

check("completed reminders can be hidden, searched and date-bounded", () => {
  const rs = normalizeReminders(REMINDER_ROWS, REMINDER_CUSTOMERS);
  assert.equal(buildReminderList(REMINDER_CUSTOMERS, rs, { showDone: false }).shown, 3);
  assert.equal(buildReminderList(REMINDER_CUSTOMERS, rs, { query: "patel" }).shown, 2, "matches the customer");
  assert.equal(buildReminderList(REMINDER_CUSTOMERS, rs, { query: "dealt" }).shown, 1, "matches the note");
  assert.equal(
    buildReminderList(REMINDER_CUSTOMERS, rs, { from: todayIso(), to: isoDaysFromNow(30) }).shown,
    2,
    "only what is due from today onwards"
  );
  assert.equal(earliestDue(rs), isoDaysAgo(30));
  assert.equal(latestDue(rs), isoDaysFromNow(6), "the span runs into the future, unlike the visit log");
});

check("a reminder for a customer who was removed is dropped, not crashed on", () => {
  const rs = [{ id: "r9", customerId: "404", dueOn: todayIso(), note: "", isDone: false }];
  assert.equal(buildReminderList(REMINDER_CUSTOMERS, rs).shown, 0);
});

check("the call list ignores reminders already ticked off", () => {
  const customers = [{ id: "1", name: "Rajesh Traders", visits: [isoDaysAgo(2)], visitEveryWeeks: 1 }];
  const due = { id: "r1", customerId: "1", dueOn: isoDaysAgo(1), note: "", isDone: false };
  assert.equal(buildFollowUps(customers, [due], DEFAULT_SETTINGS).reminders.length, 1);
  assert.equal(
    buildFollowUps(customers, [{ ...due, isDone: true }], DEFAULT_SETTINGS).reminders.length,
    0,
    "done means off the list, but still on record"
  );
});

/* ---- searching the visit log by date ---- */

check("a date range on the visit log replaces the rolling window", () => {
  const customers = [
    { id: "1", name: "Rajesh Traders", phone: "9820011223", visits: [isoDaysAgo(2), isoDaysAgo(45), isoDaysAgo(200)] },
  ];
  // Without a range, the default window hides anything older than 30 days.
  assert.equal(buildVisitLog(customers).shown, 1);

  // A range is an explicit choice of period, so it must reach past that window.
  assert.equal(buildVisitLog(customers, { from: isoDaysAgo(60), to: isoDaysAgo(40) }).shown, 1);
  assert.equal(buildVisitLog(customers, { from: isoDaysAgo(250), to: todayIso() }).shown, 3);

  // Both ends on the same day is how a single date is searched.
  assert.equal(buildVisitLog(customers, { from: isoDaysAgo(45), to: isoDaysAgo(45) }).shown, 1);
  assert.equal(buildVisitLog(customers, { from: isoDaysAgo(44), to: isoDaysAgo(44) }).shown, 0);

  // And it still composes with the text search.
  assert.equal(buildVisitLog(customers, { from: isoDaysAgo(250), to: todayIso(), query: "rajesh" }).shown, 3);
  assert.equal(buildVisitLog(customers, { from: isoDaysAgo(250), to: todayIso(), query: "patel" }).shown, 0);
});

check("the staff search matches name, company and phone", () => {
  // The screen filters inline, so this pins the fields it has to cover.
  const customers = normalizeCustomers([
    { name: "Meena Silver", phone: "9800000001", company: "Meena Retail Pvt Ltd" },
  ]);
  const matches = (q) =>
    customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.company || "").toLowerCase().includes(q) ||
        (c.phone || "").includes(q)
    ).length;
  assert.equal(matches("meena"), 1);
  assert.equal(matches("retail"), 1, "the company name is searchable");
  assert.equal(matches("98000"), 1);
  assert.equal(matches("zzz"), 0);
});

check("the reminder sheet row carries completion", () => {
  const change = changeFor.reminder({ id: "r1", customerId: "1", dueOn: "2026-10-01", note: "x", isDone: true }, "Rajesh");
  assert.equal(change.tab, "reminders");
  assert.equal(change.row.is_done, 1, "ticking one off must actually reach the sheet");
  assert.equal(changeFor.rep({ id: "1", name: "Priya Shah", isActive: false }).row.is_active, 0);
  assert.equal(changeFor.rep({ id: "1", name: "Priya Shah", isActive: true }).tab, "reps");
});

check("repKey folds case and spacing so one person stays one person", () => {
  assert.equal(repKey("  Priya   Shah "), repKey("priya shah"));
  assert.notEqual(repKey("Priya Shah"), repKey("Priya Shar"));
  assert.equal(repKey(null), "");
});


/* ---- customer tiers ---- */

const TIER_ROWS = [
  { tier_id: "1", name: "Key account", rank: "1", is_active: "1" },
  { tier_id: "2", name: "Regular", rank: "2", is_active: "1" },
  { tier_id: "3", name: "Occasional", rank: "3", is_active: "1" },
  { tier_id: "4", name: "Trial", rank: "", is_active: "0" },
];

check("tier rows normalise, with rank renumbered 1..n", () => {
  const tiers = normalizeTiers(TIER_ROWS);
  assert.equal(tiers.length, 4);
  assert.deepEqual(
    tiers.filter((t) => t.isActive).map((t) => [t.name, t.rank]),
    [["Key account", 1], ["Regular", 2], ["Occasional", 3]]
  );
  assert.equal(tiers.find((t) => t.name === "Trial").rank, null, "a removed tier holds no place in the order");
});

check("a sheet with no ranks still gets an order", () => {
  const tiers = normalizeTiers([{ name: "Gold" }, { name: "Silver" }, { name: "Bronze" }]);
  assert.deepEqual(tiers.map((t) => t.rank), [1, 2, 3], "the order the rows arrived in becomes the order");
  assert.deepEqual(tiers.map((t) => t.id), ["1", "2", "3"]);
});

check("duplicate or colliding ranks are renumbered, not left to clash", () => {
  const tiers = normalizeTiers([
    { tier_id: "1", name: "A", rank: "5" },
    { tier_id: "2", name: "B", rank: "5" },
    { tier_id: "3", name: "C", rank: "1" },
  ]);
  const ranks = tiers.map((t) => t.rank);
  assert.deepEqual([...ranks].sort(), [1, 2, 3], "contiguous and unique");
  assert.equal(tiers.find((t) => t.name === "C").rank, 1, "the lowest stated rank still leads");
});

check("tierRank sorts ungraded customers last, not first", () => {
  const tiers = normalizeTiers(TIER_ROWS);
  assert.equal(tierRank({ tierId: "1" }, tiers), 1);
  assert.equal(tierRank({ tierId: "3" }, tiers), 3);
  assert.equal(tierRank({ tierId: null }, tiers), UNGRADED_RANK);
  assert.equal(tierRank({ tierId: "404" }, tiers), UNGRADED_RANK, "a tier that no longer exists is ungraded");
  // Not graded is not the same as graded lowest.
  assert.ok(tierRank({ tierId: "3" }, tiers) < tierRank({ tierId: null }, tiers));

  const sorted = [{ tierId: null }, { tierId: "2" }, { tierId: "1" }].sort(byTier(tiers));
  assert.deepEqual(sorted.map((c) => c.tierId), ["1", "2", null]);
});

check("a removed tier keeps its customers readable", () => {
  const tiers = normalizeTiers(TIER_ROWS);
  const [c] = applyTiers([{ id: "1", name: "X", tierId: "4", tierName: "" }], tiers);
  assert.equal(c.tierName, "Trial", "the name still resolves");
  assert.equal(tierRank(c, tiers), UNGRADED_RANK, "but it no longer has a place in the order");
});

check("a tier typed onto a customer row is adopted and ranked last", () => {
  const customers = normalizeCustomers([
    { name: "Meena Silver", tier: "Platinum" },
    { name: "Anil & Co", tier: "  platinum " },
  ]);
  const tiers = reconcileTiers(normalizeTiers(TIER_ROWS), customers);
  assert.equal(tiers.length, 5, "one new tier, not two");
  const added = tiers.find((t) => t.name === "Platinum");
  assert.equal(added.rank, 4, "adopted tiers go on the end of the order, never the front");
  const [a, b] = applyTiers(customers, tiers);
  assert.equal(a.tierId, b.tierId, "both spellings resolve to one tier");
});

check("moving a tier reorders and renumbers", () => {
  const tiers = normalizeTiers(TIER_ROWS);
  const moved = moveTier(tiers, "3", "up");
  assert.deepEqual(
    moved.filter((t) => t.isActive).map((t) => [t.name, t.rank]),
    [["Key account", 1], ["Occasional", 2], ["Regular", 3]]
  );
  // The ends are walls, not wraps.
  assert.deepEqual(moveTier(tiers, "1", "up"), tiers, "the top cannot move up");
  const bottom = moveTier(tiers, "3", "down");
  assert.deepEqual(
    bottom.filter((t) => t.isActive).map((t) => t.rank),
    [1, 2, 3],
    "the bottom cannot move down"
  );
});

check("removing a tier closes the gap in the order", () => {
  const tiers = normalizeTiers(TIER_ROWS).map((t) => (t.id === "2" ? { ...t, isActive: false } : t));
  const settled = reRank(tiers);
  assert.deepEqual(
    settled.filter((t) => t.isActive).map((t) => [t.name, t.rank]),
    [["Key account", 1], ["Occasional", 2]],
    "no hole left where Regular was"
  );
});

check("tiers break ties on the call list, and only ties", () => {
  const tiers = normalizeTiers(TIER_ROWS);
  // Same cadence, same number of visits, same weeks missed: a genuine tie.
  const tie = (id, tierId) => ({
    id, name: "Shop " + id, visitEveryWeeks: 1, tierId, tierName: "",
    visits: [isoDaysAgo(30), isoDaysAgo(37), isoDaysAgo(44)],
  });
  const tied = applyTiers([tie("1", "3"), tie("2", null), tie("3", "1")], tiers);
  const order = buildFollowUps(tied, [], DEFAULT_SETTINGS, { tiers }).stillAway.map((e) => e.customer.id);
  assert.deepEqual(order, ["3", "1", "2"], "top tier first, ungraded last");

  // But a customer further gone still outranks an important one barely late,
  // because recoverability decides before importance does.
  const nearlyDue = { id: "a", name: "A", visitEveryWeeks: 1, tierId: "1", tierName: "", visits: [isoDaysAgo(14)] };
  const longGone = { id: "b", name: "B", visitEveryWeeks: 1, tierId: "3", tierName: "", visits: [isoDaysAgo(70)] };
  const mixed = buildFollowUps(applyTiers([longGone, nearlyDue], tiers), [], DEFAULT_SETTINGS, { tiers });
  const ids = [...mixed.missedLastWeek, ...mixed.stillAway, ...mixed.neverReturned].map((e) => e.customer.id);
  assert.equal(ids[0], "a", "the more recoverable one still leads, whatever its tier");
});

check("no tiers at all changes nothing about the call list", () => {
  const customers = [
    { id: "1", name: "A", visitEveryWeeks: 1, visits: [isoDaysAgo(30)] },
    { id: "2", name: "B", visitEveryWeeks: 1, visits: [isoDaysAgo(60)] },
  ];
  const withNone = buildFollowUps(customers, [], DEFAULT_SETTINGS).stillAway.map((e) => e.customer.id);
  const withEmpty = buildFollowUps(customers, [], DEFAULT_SETTINGS, { tiers: [] }).stillAway.map((e) => e.customer.id);
  assert.deepEqual(withNone, withEmpty);
});

check("tierLabel names the ends of the scale", () => {
  const tiers = normalizeTiers(TIER_ROWS);
  assert.equal(tierLabel(tiers[0], tiers), "Key account · most important");
  assert.equal(tierLabel(tiers.find((t) => t.name === "Occasional"), tiers), "Occasional · least important");
  assert.equal(tierLabel(tiers.find((t) => t.name === "Regular"), tiers), "Regular", "the middle needs no caption");
  assert.equal(tierLabel(null, tiers), "");
});

check("the tier sheet row carries its rank", () => {
  const change = changeFor.tier({ id: "1", name: "Key account", rank: 1, isActive: true });
  assert.equal(change.tab, "tiers");
  assert.equal(change.row.rank, 1);
  assert.equal(change.row.is_active, 1);
  assert.equal(changeFor.tier({ id: "4", name: "Trial", rank: null, isActive: false }).row.rank, "");
});

check("customer tier survives the sheet round trip", () => {
  const rows = customerAoA([
    { id: "1", name: "Meena Silver", tierId: "2", tierName: "Regular", repId: "1", repName: "Priya Shah", visits: [] },
  ]);
  const header = rows[0];
  const [back] = normalizeCustomers([Object.fromEntries(rows[1].map((v, i) => [header[i], v]))]);
  assert.equal(back.tierId, "2");
  assert.equal(back.tierName, "Regular");
});

/* ---- the backup file ---- */

check("a backup carries its settings and can be read back", () => {
  const rows = metaAoA({ defaultIntervalWeeks: 3 }, { takenAt: new Date("2026-10-29T10:00:00Z") });
  const header = rows[0];
  const parsed = readMeta(rows.slice(1).map((r) => Object.fromEntries(r.map((v, i) => [header[i], v]))));
  assert.equal(parsed.format, BACKUP_FORMAT);
  assert.equal(parsed.settings.defaultIntervalWeeks, 3);
  assert.match(parsed.takenAt, /^2026-10-29T/);
});

check("an ordinary spreadsheet has no settings to restore", () => {
  assert.equal(readMeta([]).settings, null, "nothing to apply, so nothing is applied");
  assert.equal(readMeta(null).settings, null);
  assert.equal(readMeta([{ key: "default_interval_weeks", value: "not a number" }]).settings, null);
});

check("a backup is named by the day it was taken", () => {
  assert.equal(backupFilename("xlsx", new Date(2026, 9, 29)), "visit-tracker-backup-2026-10-29.xlsx");
});

check("the tier table exports every column", () => {
  const rows = tierAoA([{ id: "1", name: "Key account", rank: 1, isActive: true }]);
  assert.deepEqual(rows[0], ["tier_id", "name", "rank", "is_active"]);
  assert.deepEqual(rows[1], ["1", "Key account", 1, 1]);
});

/* ---- layout across screen sizes ---- */

check("the shell grows with the window but a phone fills it", () => {
  const phone = layoutFor(390);
  const tablet = layoutFor(820);
  const desktop = layoutFor(1440);
  assert.equal(phone.bp, "phone");
  assert.equal(tablet.bp, "tablet");
  assert.equal(desktop.bp, "desktop");
  assert.ok(phone.maxWidth < tablet.maxWidth && tablet.maxWidth < desktop.maxWidth, "wider windows get a wider app");
  assert.ok(phone.gutter < desktop.gutter, "and roomier margins");
  // A phone must never be capped below its own screen.
  assert.ok(layoutFor(430).maxWidth >= 430, "a large phone is not letterboxed");
});

check("the breakpoints are on the window, with no gap between them", () => {
  assert.equal(layoutFor(BREAKPOINTS.tablet - 1).bp, "phone");
  assert.equal(layoutFor(BREAKPOINTS.tablet).bp, "tablet");
  assert.equal(layoutFor(BREAKPOINTS.desktop - 1).bp, "tablet");
  assert.equal(layoutFor(BREAKPOINTS.desktop).bp, "desktop");
});

check("a list grid can never force a column wider than the screen", () => {
  for (const width of [320, 375, 393, 430, 744, 1024, 1440]) {
    const layout = layoutFor(width);
    const grid = cardGrid(layout);
    // `min(100%, …)` is what stops a 340px minimum overflowing a 320px phone.
    assert.match(grid.gridTemplateColumns, /minmax\(min\(100%, \d+px\), 1fr\)/, `at ${width}px`);
    assert.ok(screenPadding(layout).padding.includes(`${layout.gutter}px`), `gutter applied at ${width}px`);
  }
});

check("a screen leaves room for the bottom nav, plus the home indicator", () => {
  const pad = screenPadding(layoutFor(390));
  // The nav grows by the inset, so the space left for it has to as well —
  // otherwise the last row sits half under the home bar on a notched phone.
  assert.match(pad.padding, /calc\(110px \+ var\(--safe-bottom\)\)$/, "the nav would otherwise cover the last row");
  assert.match(screenPadding(layoutFor(390), { bottom: 0 }).padding, /0px$/, "a screen with no nav under it needs none");
});

check("sortList puts removed entries last and keeps ranked order", () => {
  const list = [
    { id: "1", name: "Zed", isActive: true, rank: 2 },
    { id: "2", name: "Alpha", isActive: false, rank: null },
    { id: "3", name: "Mid", isActive: true, rank: 1 },
  ];
  assert.deepEqual(sortList(list).map((e) => e.name), ["Mid", "Zed", "Alpha"], "rank beats alphabet; removed sinks");
});

check("moveRanked leaves an unknown id alone", () => {
  const list = reRank([{ id: "1", name: "A", isActive: true }, { id: "2", name: "B", isActive: true }]);
  assert.deepEqual(moveRanked(list, "404", "up"), list);
});


/* ---- WhatsApp links ---- */

check("a ten-digit number gets the country code", () => {
  assert.equal(whatsappNumber("9820011223"), "919820011223");
  assert.equal(whatsappLink("9820011223"), "https://wa.me/919820011223");
  assert.equal(DEFAULT_COUNTRY_CODE, "91");
});

check("however the number was typed, the link is the same", () => {
  for (const written of ["9820011223", "98200 11223", "98200-11223", "(98200) 11223", "+91 98200 11223", "+919820011223", " 00 91 98200 11223 "]) {
    const n = whatsappNumber(written);
    assert.ok(n && n.startsWith("91"), `${written} -> ${n}`);
  }
  assert.equal(whatsappNumber("98200 11223"), "919820011223");
  assert.equal(whatsappNumber("+91 98200 11223"), "919820011223");
  assert.equal(whatsappNumber("919820011223"), "919820011223", "a number already carrying 91 is not given a second one");
  assert.equal(whatsappNumber("00919820011223"), "919820011223", "the written-out international prefix is dropped");
});

check("the trunk zero is dropped, because it is never dialled internationally", () => {
  assert.equal(whatsappNumber("09820011223"), "919820011223");
  assert.equal(whatsappNumber("0 9820011223"), "919820011223");
});

check("a number that already has another country's code keeps it", () => {
  // Prefixing 91 onto a Dubai number would link to a stranger.
  assert.equal(whatsappNumber("00971501234567"), "971501234567");
  assert.equal(whatsappNumber("+971 50 123 4567"), "971501234567");
  assert.ok(!whatsappNumber("00971501234567").startsWith("91971"));
});

check("there is no link when there is no usable number", () => {
  for (const bad of ["", null, undefined, "   ", "n/a", "12345", "0", "+", "9999999999999999999"]) {
    assert.equal(whatsappNumber(bad), null, `${JSON.stringify(bad)} should not produce a link`);
    assert.equal(whatsappLink(bad), null);
  }
  assert.equal(canWhatsApp({ phone: "9820011223" }), true);
  assert.equal(canWhatsApp({ phone: "" }), false);
  assert.equal(canWhatsApp(null), false);
});

/* ---- the printed call sheets ---- */

const PRINT_REPS = normalizeReps([
  { rep_id: "1", name: "Priya Shah", is_active: "1" },
  { rep_id: "2", name: "Anil Kumar", is_active: "1" },
  { rep_id: "3", name: "Vikram Rao", is_active: "0" },
]);
const PRINT_TIERS = _tiersFor([
  { tier_id: "1", name: "Key account", rank: "1", is_active: "1" },
  { tier_id: "2", name: "Regular", rank: "2", is_active: "1" },
]);
const printCustomer = (id, repId, opts = {}) => ({
  id, name: opts.name || `Shop ${id}`, phone: "982001122" + (id % 10),
  repId, repName: "", tierId: opts.tierId ?? null, tierName: "",
  visitEveryWeeks: 1, visits: opts.visits ?? [isoDaysAgo(40), isoDaysAgo(47), isoDaysAgo(54)],
  contact: null, snoozedUntilWeek: null,
});

check("every representative gets a sheet, and so does nobody", () => {
  const customers = [printCustomer("1", "1"), printCustomer("2", "2"), printCustomer("3", null)];
  const targets = sheetTargets(customers, PRINT_REPS);
  assert.deepEqual(targets.map((t) => t.rep.name), ["Anil Kumar", "Priya Shah", "Unassigned"]);
  assert.equal(targets.at(-1).customers.length, 1, "customers with no rep still need ringing");
  // A retired rep only appears while customers are still on them.
  assert.ok(!targets.some((t) => t.rep.name === "Vikram Rao"));
  const withRetired = sheetTargets([...customers, printCustomer("4", "3")], PRINT_REPS);
  assert.ok(withRetired.some((t) => t.rep.name === "Vikram Rao"));
});

check("a call sheet holds only that rep's customers", () => {
  const customers = [printCustomer("1", "1"), printCustomer("2", "1"), printCustomer("3", "2")];
  const sheets = buildSheets(customers, [], DEFAULT_SETTINGS, { kind: "followups", reps: PRINT_REPS, tiers: PRINT_TIERS });
  const priya = sheets.find((s) => s.rep.name === "Priya Shah");
  const anil = sheets.find((s) => s.rep.name === "Anil Kumar");
  assert.equal(priya.toCall, 2);
  assert.equal(anil.toCall, 1);
  const names = priya.groups.flatMap((g) => g.entries.map((e) => e.name));
  assert.deepEqual(names.sort(), ["Shop 1", "Shop 2"], "nobody else's customer appears on the sheet");
});

check("a call sheet leaves off everyone who should not be rung", () => {
  const onTrack = printCustomer("1", "1", { visits: [isoDaysAgo(1)] });
  const snoozed = { ...printCustomer("2", "1"), snoozedUntilWeek: currentWeekIndex() + 3 };
  const chase = printCustomer("3", "1");
  const sheets = buildSheets([onTrack, snoozed, chase], [], DEFAULT_SETTINGS, { kind: "followups", reps: PRINT_REPS });
  const priya = sheets.find((s) => s.rep.name === "Priya Shah");
  const names = priya.groups.flatMap((g) => g.entries.map((e) => e.name));
  assert.deepEqual(names, ["Shop 3"], "on-track and deliberately snoozed customers stay off the round");
  assert.equal(priya.total, 3, "but the header still counts the whole book");
});

check("a reminder lands on the sheet with the note that explains it", () => {
  const customers = [printCustomer("1", "1", { visits: [isoDaysAgo(1)] })];
  const reminders = [{ id: "r1", customerId: "1", dueOn: isoDaysAgo(2), note: "Quoted for the bangle set", isDone: false }];
  const [sheet] = buildSheets(customers, reminders, DEFAULT_SETTINGS, { kind: "followups", reps: PRINT_REPS, repIds: ["1"] });
  const entry = sheet.groups.find((g) => g.key === "reminders").entries[0];
  assert.equal(entry.reminderNote, "Quoted for the bangle set");
  // A reminder already ticked off is not work.
  const done = buildSheets(customers, [{ ...reminders[0], isDone: true }], DEFAULT_SETTINGS, { kind: "followups", reps: PRINT_REPS, repIds: ["1"] });
  assert.equal(done[0]?.groups.length ?? 0, 0);
});

check("the list sheet holds the whole book, worst first", () => {
  // A fixed Wednesday, so "yesterday" is reliably inside the same trading
  // week. Left to the real clock this passes six days out of seven.
  const NOW = new Date(2026, 9, 14);
  const customers = [
    printCustomer("1", "1", { name: "Zed Jewels", visits: [isoDaysAgo(1, NOW)] }),
    printCustomer("2", "1", { name: "Alpha Gold", visits: [isoDaysAgo(40, NOW), isoDaysAgo(47, NOW)] }),
    printCustomer("3", "1", { name: "Beta Chains", visits: [] }),
  ];
  const [sheet] = buildSheets(customers, [], DEFAULT_SETTINGS, { kind: "list", reps: PRINT_REPS, repIds: ["1"], now: NOW });
  assert.deepEqual(
    sheet.rows.map((r) => r.status.key),
    ["missed", "never", "onTrack"],
    "most overdue first, on track last"
  );
  assert.equal(sheet.total, 3);
  assert.equal(sheet.rows.length, 3, "the list sheet shows everyone, not just the ones due");
  assert.equal(sheet.rows[0].name, "Alpha Gold", "missed first");
  assert.equal(sheet.rows.at(-1).name, "Zed Jewels", "on track last");
  assert.ok(sheet.rows.every((r) => r.phone && r.cadence && r.lastSeen), "every line carries what a round needs");
});

check("printing can be narrowed to one representative", () => {
  const customers = [printCustomer("1", "1"), printCustomer("2", "2"), printCustomer("3", null)];
  const all = buildSheets(customers, [], DEFAULT_SETTINGS, { kind: "followups", reps: PRINT_REPS });
  assert.equal(all.length, 3);
  const one = buildSheets(customers, [], DEFAULT_SETTINGS, { kind: "followups", reps: PRINT_REPS, repIds: ["2"] });
  assert.deepEqual(one.map((s) => s.rep.name), ["Anil Kumar"]);
  const orphans = buildSheets(customers, [], DEFAULT_SETTINGS, { kind: "followups", reps: PRINT_REPS, repIds: [null] });
  assert.deepEqual(orphans.map((s) => s.rep.name), ["Unassigned"]);
});

check("an empty sheet is not worth the paper", () => {
  const onTrack = [printCustomer("1", "1", { visits: [isoDaysAgo(1)] })];
  const [sheet] = buildSheets(onTrack, [], DEFAULT_SETTINGS, { kind: "followups", reps: PRINT_REPS, repIds: ["1"] });
  assert.equal(hasContent(sheet), false, "nobody to call means nothing to print");
  const [list] = buildSheets(onTrack, [], DEFAULT_SETTINGS, { kind: "list", reps: PRINT_REPS, repIds: ["1"] });
  assert.equal(hasContent(list), true, "but their list still has a customer on it");
});

check("the sheet reads in plain words", () => {
  const c = printCustomer("1", "1", { visits: [isoDaysAgo(38)] });
  assert.equal(cadenceText(c, DEFAULT_SETTINGS), "weekly");
  assert.equal(cadenceText({ ...c, visitEveryWeeks: 3 }, DEFAULT_SETTINGS), "every 3 weeks");
  assert.equal(cadenceText({ ...c, visitEveryWeeks: null }, DEFAULT_SETTINGS), "weekly (default)");
  assert.equal(lastSeenText(c), "last in 38 days ago");
  assert.equal(lastSeenText({ ...c, visits: [todayIso()] }), "in today");
  assert.equal(lastSeenText({ ...c, visits: [] }), "never been in");
  assert.equal(lastSeenText({ ...c, visits: [isoDaysAgo(1)] }), "last in 1 day ago");
});

/* ---- the staff wall's order ---- */

check("the staff wall is A-Z, with today's visits sunk to the bottom", () => {
  // The screen sorts inline, so this pins the rule it has to follow.
  const today = todayIso();
  const customers = [
    { id: "1", name: "Zed Jewels", visits: [] },
    { id: "2", name: "Alpha Gold", visits: [today] },
    { id: "3", name: "Mid Traders", visits: [] },
    { id: "4", name: "Beta Chains", visits: [today, isoDaysAgo(9)] },
  ];
  const byName = [...customers].sort((a, b) => a.name.localeCompare(b.name));
  const pending = byName.filter((c) => !hasVisit(c, today));
  const done = byName.filter((c) => hasVisit(c, today));

  assert.deepEqual(pending.map((c) => c.name), ["Mid Traders", "Zed Jewels"], "not in yet, alphabetical");
  assert.deepEqual(done.map((c) => c.name), ["Alpha Gold", "Beta Chains"], "in today, alphabetical, below");
  assert.equal(pending.length + done.length, customers.length, "everyone appears exactly once");
  // Yesterday's visit is not today's: it belongs back at the top.
  const yesterday = [{ id: "5", name: "Old Visit", visits: [isoDaysAgo(1)] }];
  assert.equal(yesterday.filter((c) => hasVisit(c, today)).length, 0, "the wall resets overnight");
});


/* ---- folding the call list ---- */

check("the work sections open by default, the dealt-with ones do not", () => {
  // Opening the screen must still land on today's work with no taps.
  assert.equal(isOpen({}, "reminders"), true);
  assert.equal(isOpen({}, "missedLastWeek"), true);
  assert.equal(isOpen({}, "stillAway"), true);
  assert.equal(isOpen({}, "cameBack"), false);
  assert.equal(isOpen({}, "called"), false);
  assert.equal(isOpen({}, "snoozed"), false);
  assert.equal(isOpen({}, "neverReturned"), false);
  // Every section the screen renders has a default of its own.
  assert.equal(Object.keys(DEFAULT_OPEN).length, 7);
});

check("a section the owner folded stays folded, and one they opened stays open", () => {
  store.clear();
  assert.equal(isOpen(loadCollapsed(), "stillAway"), true, "starts at its default");

  saveCollapsed({ stillAway: false, snoozed: true });
  const back = loadCollapsed();
  assert.equal(isOpen(back, "stillAway"), false, "a closed work section stays closed");
  assert.equal(isOpen(back, "snoozed"), true, "an opened quiet section stays open");
  // Untouched sections are not dragged along with them.
  assert.equal(isOpen(back, "missedLastWeek"), true);
  assert.equal(isOpen(back, "called"), false);
});

check("junk in storage falls back to the defaults rather than breaking the screen", () => {
  store.clear();
  store.set("cvt.collapsed.v1", "not json");
  assert.deepEqual(loadCollapsed(), {});

  store.set("cvt.collapsed.v1", JSON.stringify({ stillAway: "yes", madeUpSection: false, called: true }));
  const cleaned = loadCollapsed();
  assert.equal("stillAway" in cleaned, false, "a non-boolean is ignored, so the default wins");
  assert.equal("madeUpSection" in cleaned, false, "a section this build does not have is dropped");
  assert.equal(cleaned.called, true, "the valid entry survives");
  assert.equal(isOpen(cleaned, "stillAway"), true);
});

check("storage that throws degrades to a session-only fold", () => {
  const good = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  assert.deepEqual(loadCollapsed(), {}, "reading falls back");
  assert.equal(saveCollapsed({ stillAway: false }), false, "and reports it could not save");
  globalThis.localStorage = good;
});

check("an unknown section is treated as open, never silently emptied", () => {
  // Defensive: a section with no default must still show its contents.
  assert.equal(isOpen({}, "somethingNew"), true);
  assert.equal(isOpen(null, "stillAway"), true);
});


/* ---- logging a visit by date, not by countdown ---- */

check("the quick options are yesterday and the day before, as real dates", () => {
  // The sheet offers these two; both must be actual days, not offsets.
  const yesterday = isoDaysAgo(1);
  const dayBefore = isoDaysAgo(2);
  assert.match(yesterday, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(dayBefore, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(daysAgo(yesterday), 1);
  assert.equal(daysAgo(dayBefore), 2);
  assert.ok(dayBefore < yesterday, "the day before yesterday is the earlier of the two");
});

check("a visit logs on the day it is given, whatever the month boundary", () => {
  // Backfilling across the turn of a month is where off-by-one errors live.
  const firstOfMarch = new Date(2026, 2, 1);
  assert.equal(isoDaysAgo(1, firstOfMarch), "2026-02-28");
  assert.equal(isoDaysAgo(2, firstOfMarch), "2026-02-27");
  // And across a leap year's end of February.
  assert.equal(isoDaysAgo(1, new Date(2028, 2, 1)), "2028-02-29");
  // And across new year.
  assert.equal(isoDaysAgo(1, new Date(2027, 0, 1)), "2026-12-31");
});

check("the calendar's floor is a year back, and its ceiling is today", () => {
  // A visit cannot be in the future, and twelve months is as far back as
  // anyone is reconstructing.
  const now = new Date(2026, 10, 2);
  const floor = new Date(2026, 10, 2);
  floor.setMonth(floor.getMonth() - 12);
  assert.equal(toIso(floor), "2025-11-02");
  assert.equal(todayIso(now), "2026-11-02");
  assert.ok(toIso(floor) < todayIso(now));
});

check("a day already logged is recognised, so it is marked rather than doubled", () => {
  const customer = { id: "1", name: "A", visits: [isoDaysAgo(1), isoDaysAgo(9)] };
  assert.equal(hasVisit(customer, isoDaysAgo(1)), true, "yesterday is already down");
  assert.equal(hasVisit(customer, isoDaysAgo(2)), false, "the day before is not");
  // Logging it again changes nothing — which is why marking beats disabling.
  assert.deepEqual(addVisit(customer, isoDaysAgo(1)).visits, customer.visits);
});

check("Monday is the first column, matching the trading week", () => {
  // The calendar lays weeks out Monday-first; Sunday closes the row because
  // that is the day the shop is shut.
  const mondayIndex = (d) => (d.getDay() + 6) % 7;
  assert.equal(mondayIndex(new Date(2026, 10, 2)), 0, "2 Nov 2026 is a Monday");
  assert.equal(mondayIndex(new Date(2026, 10, 7)), 5, "Saturday is the sixth column");
  assert.equal(mondayIndex(new Date(2026, 10, 8)), 6, "Sunday closes the row");
});

check("a month grid starts on the right weekday and runs the right length", () => {
  const cells = (year, month) => ({
    blanks: (new Date(year, month, 1).getDay() + 6) % 7,
    days: daysInMonth(year, month),
  });
  assert.deepEqual(cells(2026, 5), { blanks: 0, days: 30 }, "Jun 2026 opens on a Monday — no leading blanks");
  assert.deepEqual(cells(2026, 10), { blanks: 6, days: 30 }, "Nov 2026 opens on a Sunday — six blanks before it");
  assert.deepEqual(cells(2026, 1), { blanks: 6, days: 28 }, "Feb 2026 also opens on a Sunday");
  assert.deepEqual(cells(2028, 1), { blanks: 1, days: 29 }, "Feb 2028 is a leap February, opening Tuesday");
});


/* ---- adding customers in bulk ---- */

const BOOK = [
  { id: "1", name: "Patel & Sons", phone: "9811122334", company: "Patel Enterprises", repId: "1", repName: "Priya Shah", tierId: "1", tierName: "Key account", visitEveryWeeks: 1, visits: [isoDaysAgo(3)], contact: { on: isoDaysAgo(9), reason: "price", note: "keep" } },
  { id: "2", name: "Laxmi Gold House", phone: "", company: "", repId: null, repName: "", tierId: null, tierName: "", visitEveryWeeks: null, visits: [isoDaysAgo(5)] },
];
const LISTS = {
  reps: [{ id: "1", name: "Priya Shah", isActive: true }, { id: "2", name: "Anil Kumar", isActive: true }],
  tiers: [{ id: "1", name: "Key account", rank: 1, isActive: true }, { id: "2", name: "Regular", rank: 2, isActive: true }],
};

check("the template has the columns the importer reads, name first", () => {
  const headers = TEMPLATE_COLUMNS.map((c) => c.header);
  assert.deepEqual(headers, ["name", "phone", "company", "marketing_rep", "tier", "visit_every_weeks"]);
  assert.ok(TEMPLATE_COLUMNS.every((c) => c.note), "every column explains itself in the template");
  // The headings must be ones the existing parser already understands.
  const parsed = normalizeCustomers([
    { name: "A", phone: "9820011223", company: "A Ltd", marketing_rep: "Anil Kumar", tier: "Regular", visit_every_weeks: "2" },
  ]);
  assert.equal(parsed[0].phone, "9820011223");
  assert.equal(parsed[0].company, "A Ltd");
  assert.equal(parsed[0].repName, "Anil Kumar");
  assert.equal(parsed[0].tierName, "Regular");
  assert.equal(parsed[0].visitEveryWeeks, 2);
});

check("a name not on the list is added, one that is gets filled in", () => {
  const incoming = normalizeCustomers([
    { name: "New Shop", phone: "9800000001", tier: "Regular" },
    { name: "Laxmi Gold House", phone: "9822233445", marketing_rep: "Anil Kumar" },
  ]);
  const plan = planCustomerImport(BOOK, incoming, LISTS);
  assert.equal(plan.adds.length, 1);
  assert.equal(plan.adds[0].name, "New Shop");
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].name, "Laxmi Gold House");
  assert.deepEqual(plan.updates[0].fields.sort(), ["phone", "rep"]);
  assert.equal(plan.updates[0].patch.phone, "9822233445");
  assert.equal(describePlan(plan), "Add 1, update 1");
});

check("matching a name ignores case and spacing", () => {
  const incoming = normalizeCustomers([{ name: "  patel   &   sons ", phone: "9000000000" }]);
  const plan = planCustomerImport(BOOK, incoming, LISTS);
  assert.equal(plan.adds.length, 0, "it is the same shop, not a second one");
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].id, "1");
});

check("a blank cell never clears what is already recorded", () => {
  // Only `phone` is stated; everything else must be left exactly as it was.
  const incoming = normalizeCustomers([{ name: "Patel & Sons", phone: "9000000000" }]);
  const plan = planCustomerImport(BOOK, incoming, LISTS);
  assert.deepEqual(plan.updates[0].fields, ["phone"]);
  assert.deepEqual(Object.keys(plan.updates[0].patch), ["phone"]);
  assert.ok(!("company" in plan.updates[0].patch), "a blank company does not wipe the company");
  assert.ok(!("repName" in plan.updates[0].patch), "nor the rep");
  assert.ok(!("tierName" in plan.updates[0].patch), "nor the tier");
});

check("a row that says nothing new is reported as unchanged, not as an update", () => {
  const incoming = normalizeCustomers([
    { name: "Patel & Sons", phone: "9811122334", company: "Patel Enterprises", tier: "Key account" },
  ]);
  const plan = planCustomerImport(BOOK, incoming, LISTS);
  assert.equal(plan.updates.length, 0);
  assert.deepEqual(plan.unchanged, ["Patel & Sons"]);
  assert.equal(plan.changes, 0);
  assert.equal(describePlan(plan), "Nothing to change");
});

check("a rep or tier the file introduces is listed before it is created", () => {
  const incoming = normalizeCustomers([
    { name: "New Shop", marketing_rep: "Kiran Patel", tier: "Wholesale" },
    { name: "Another Shop", marketing_rep: "kiran  patel", tier: "wholesale" },
  ]);
  const plan = planCustomerImport(BOOK, incoming, LISTS);
  assert.deepEqual(plan.newReps, ["Kiran Patel"], "named once, however many rows use it");
  assert.deepEqual(plan.newTiers, ["Wholesale"]);
  // One already on the list is not announced as new.
  const known = planCustomerImport(BOOK, normalizeCustomers([{ name: "X", marketing_rep: "Anil Kumar" }]), LISTS);
  assert.deepEqual(known.newReps, []);
});

check("visits, calls and reminders are never part of the plan", () => {
  const incoming = normalizeCustomers([
    { name: "Patel & Sons", phone: "9000000000", visit_dates: "2020-01-01", last_call_date: "2020-01-02" },
  ]);
  const plan = planCustomerImport(BOOK, incoming, LISTS);
  const patch = plan.updates[0].patch;
  for (const forbidden of ["visits", "contact", "snoozedUntilWeek", "id", "name"]) {
    assert.ok(!(forbidden in patch), `a bulk add must not touch ${forbidden}`);
  }
});

check("the same name twice in one file is one customer", () => {
  // normalizeCustomers merges them before the plan ever sees them.
  const incoming = normalizeCustomers([
    { name: "Twice Over", phone: "9800000001" },
    { name: "Twice Over", company: "Twice Ltd" },
  ]);
  const plan = planCustomerImport(BOOK, incoming, LISTS);
  assert.equal(plan.adds.length, 1);
  assert.equal(plan.adds[0].phone, "9800000001");
  assert.equal(plan.adds[0].company, "Twice Ltd", "the two rows combine rather than one winning");
});

check("an empty file plans nothing rather than throwing", () => {
  const plan = planCustomerImport(BOOK, [], LISTS);
  assert.equal(plan.changes, 0);
  assert.equal(plan.rows, 0);
  assert.deepEqual(planCustomerImport(BOOK, null, LISTS).adds, []);
  assert.deepEqual(planCustomerImport([], [], {}).adds, []);
});

check("a cadence only counts when it is a real number of weeks", () => {
  const incoming = normalizeCustomers([
    { name: "Laxmi Gold House", visit_every_weeks: "3" },
    { name: "Patel & Sons", visit_every_weeks: "nonsense" },
  ]);
  const plan = planCustomerImport(BOOK, incoming, LISTS);
  const laxmi = plan.updates.find((u) => u.name === "Laxmi Gold House");
  assert.equal(laxmi.patch.visitEveryWeeks, 3);
  assert.ok(!plan.updates.some((u) => u.name === "Patel & Sons"), "an unreadable cadence changes nothing");
});


/* ---- the zip surgery behind the template's dropdowns ---- */

const bytesOf = (s) => new TextEncoder().encode(s);
const textOf = (b) => new TextDecoder().decode(b);

check("crc32 matches the known answer", () => {
  // The standard check value for "123456789".
  assert.equal(crc32(bytesOf("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

check("a zip survives being read and written back", () => {
  const entries = [
    { name: "a.txt", bytes: bytesOf("hello") },
    { name: "nested/b.xml", bytes: bytesOf("<x>\u00e9\u00e8</x>") },
    { name: "empty.bin", bytes: new Uint8Array(0) },
  ];
  const round = readZip(writeZip(entries));
  assert.deepEqual(round.map((e) => e.name), entries.map((e) => e.name), "names and order are kept");
  assert.equal(textOf(round[0].bytes), "hello");
  assert.equal(textOf(round[1].bytes), "<x>\u00e9\u00e8</x>", "multi-byte text is not mangled");
  assert.equal(round[2].bytes.length, 0);
});

check("patching one part leaves every other byte alone", () => {
  const zip = writeZip([
    { name: "keep.txt", bytes: bytesOf("untouched") },
    { name: "edit.xml", bytes: bytesOf("<a></a>") },
    { name: "after.txt", bytes: bytesOf("also untouched") },
  ]);
  const patched = readZip(patchZipEntry(zip, "edit.xml", (xml) => xml.replace("</a>", "<b/></a>")));
  assert.equal(textOf(patched[0].bytes), "untouched");
  assert.equal(textOf(patched[1].bytes), "<a><b/></a>");
  assert.equal(textOf(patched[2].bytes), "also untouched", "entries after the edited one still read back");
});

check("a part that is not there is an error, not a silent no-op", () => {
  const zip = writeZip([{ name: "a.txt", bytes: bytesOf("x") }]);
  assert.throws(() => patchZipEntry(zip, "missing.xml", (x) => x), /not in the archive/);
  assert.throws(() => readZip(bytesOf("not a zip at all")), /no end-of-central-directory/);
});

/* ---- the validation rules themselves ---- */

check("column letters follow the template's own order", () => {
  assert.equal(columnLetter(0), "A");
  assert.equal(columnLetter(3), "D");
  assert.equal(columnLetter(25), "Z");
  assert.equal(columnLetter(26), "AA");
});

check("reps and tiers become dropdowns, cadence a number", () => {
  const rules = templateRules({ columns: TEMPLATE_COLUMNS, reps: ["Priya Shah", "Anil Kumar"], tiers: ["Key account"] });
  const by = Object.fromEntries(rules.map((r) => [r.sqref, r]));
  // name A, phone B, company C, marketing_rep D, tier E, visit_every_weeks F
  assert.equal(by["D2:D1000"].type, "list");
  assert.equal(by["D2:D1000"].formula1, "lists!$A$2:$A$3", "the range covers exactly the reps on offer");
  assert.equal(by["E2:E1000"].formula1, "lists!$B$2:$B$2", "and exactly the tiers");
  assert.equal(by["F2:F1000"].type, "whole");
  assert.equal(by["F2:F1000"].formula1, "1");
  assert.equal(by["F2:F1000"].formula2, "52");
});

check("an empty list gets no rule, so the column stays usable", () => {
  // A validation pointing at an empty range rejects everything — a shop with
  // no reps set up yet must not be locked out of the column.
  const none = templateRules({ columns: TEMPLATE_COLUMNS, reps: [], tiers: [] });
  assert.deepEqual(none.map((r) => r.sqref), ["F2:F1000"], "only the numeric rule survives");
  const repsOnly = templateRules({ columns: TEMPLATE_COLUMNS, reps: ["A"], tiers: [] });
  assert.deepEqual(repsOnly.map((r) => r.sqref).sort(), ["D2:D1000", "F2:F1000"]);
});

check("the rules allow blank, reject rather than warn, and keep the arrow", () => {
  const xml = validationsXml(templateRules({ columns: TEMPLATE_COLUMNS, reps: ["A"], tiers: ["B"] }));
  assert.equal((xml.match(/allowBlank="1"/g) || []).length, 3, "every column is optional");
  assert.equal((xml.match(/errorStyle="stop"/g) || []).length, 3, "a wrong value is refused, not merely flagged");
  // The attribute is inverted in the format: setting it hides the arrow.
  assert.ok(!xml.includes("showDropDown"), "showDropDown is left unset so the dropdown shows");
  assert.match(xml, /count="3"/);
});

check("names with punctuation survive into the XML intact", () => {
  const xml = validationsXml([
    { type: "list", sqref: "D2:D5", formula1: "lists!$A$2:$A$3", errorTitle: 'He said "no"', error: "a & b < c", promptTitle: "P", prompt: "q" },
  ]);
  assert.ok(!/[^&]&[^a]/.test(xml.replace(/&amp;|&quot;|&lt;|&gt;|&apos;/g, "")), "every bare ampersand is escaped");
  assert.ok(xml.includes("&quot;no&quot;"), "quotes are escaped so the attribute does not end early");
  assert.ok(xml.includes("a &amp; b &lt; c"));
});

check("validations are spliced in where the schema expects them", () => {
  const sheet = '<worksheet><sheetData><row/></sheetData><pageMargins/></worksheet>';
  const out = insertValidations(sheet, "<dataValidations count=\"1\"/>");
  assert.ok(out.indexOf("</sheetData>") < out.indexOf("<dataValidations"), "after the cells");
  assert.ok(out.indexOf("<dataValidations") < out.indexOf("<pageMargins"), "and before the page setup");
  assert.equal(insertValidations(sheet, ""), sheet, "no rules means no change at all");
  assert.throws(() => insertValidations("<worksheet/>", "<dataValidations/>"), /no sheetData/);
});

console.log(`${passed} checks passed${process.exitCode ? " (with failures above)" : ""}`);
