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
import { clampRange, countVisitsBetween, countVisitsSince, earliestVisit, historyDays, periodStart, resolveRange, visitCounts } from "../src/lib/visitCounts.js";
import { customerVisitCounts, periodByKey, reasonBreakdown } from "../src/lib/reports.js";
import { currentWeekIndex } from "../src/lib/weeks.js";
import { DEFAULT_SETTINGS, parseWeeks, weeksFromDays } from "../src/lib/settings.js";
import { tradingDaysLeft, weekIndexOf, weeksSince } from "../src/lib/weeks.js";
import { STATUS } from "../src/theme.js";
import { DEFAULT_PIN, clearPin, hasCustomPin, isValidPin, loadPin, savePin } from "../src/lib/pin.js";
import { buildBoundedDate, formatDate } from "../src/lib/dates.js";

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
const build = (customers, now = SAT) => buildFollowUps(customers, [], S, now);

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

console.log(`${passed} checks passed${process.exitCode ? " (with failures above)" : ""}`);
