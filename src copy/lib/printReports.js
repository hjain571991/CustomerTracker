/**
 * The paper version: one sheet per marketing representative, to hand over.
 *
 * Two different documents, because they answer two different questions.
 *
 *   follow-ups — "who do I ring today?" Only the customers needing a chase,
 *                in the order worth chasing them, with room to write down what
 *                each one said. This is the sheet that comes back marked up.
 *   list       — "who do I look after?" The rep's whole book at a glance, one
 *                line each. A round sheet, not a call sheet.
 *
 * Both are built from the same functions the screens use, so paper can never
 * disagree with what the owner is looking at.
 */
import { buildFollowUps } from "./followups.js";
import { statusFor, targetFor, daysSinceLastVisit, regularity } from "./analytics.js";
import { reasonLabel } from "./followups.js";
import { activeReps, UNASSIGNED } from "./reps.js";
import { sortList } from "./lookups.js";

export const SHEET_KINDS = [
  { key: "followups", label: "Follow-ups", blurb: "Who to call, with room to write" },
  { key: "list", label: "Their list", blurb: "Every customer they look after" },
];

/** How a customer's cadence reads on paper: "weekly", "every 3 weeks". */
export const cadenceText = (customer, settings) => {
  const target = targetFor(customer, settings);
  return (target.weeks === 1 ? "weekly" : `every ${target.weeks} weeks`) + (target.isDefault ? " (default)" : "");
};

/** "last in 38 days ago" / "never been in" — the fact the call opens with. */
export const lastSeenText = (customer, now = new Date()) => {
  const days = daysSinceLastVisit(customer, now);
  if (days === null) return "never been in";
  if (days === 0) return "in today";
  return `last in ${days} ${days === 1 ? "day" : "days"} ago`;
};

/**
 * The groups a call sheet prints, and what each is for. Deliberately not every
 * section of the Follow-ups screen: a rep should not be handed the people who
 * were deliberately snoozed, already rung this week, or who have come back.
 */
const CALL_GROUPS = [
  { key: "reminders", title: "Reminders you set", from: (d) => d.reminders.map((r) => ({ ...r, note: r.reminder.note })) },
  { key: "missedLastWeek", title: "Missed last week", from: (d) => d.missedLastWeek },
  { key: "stillAway", title: "Still away", from: (d) => d.stillAway },
  { key: "neverReturned", title: "Never came back", from: (d) => d.neverReturned },
];

/** One printable line about a customer, whichever sheet it lands on. */
function lineFor(customer, settings, now) {
  return {
    customer,
    name: customer.name,
    phone: customer.phone || "",
    company: customer.company || "",
    tier: customer.tierName || "",
    status: statusFor(customer, settings, now),
    cadence: cadenceText(customer, settings),
    lastSeen: lastSeenText(customer, now),
    visits: (customer.visits || []).length,
    rhythm: regularity(customer, now),
    lastCall: customer.contact?.on
      ? { on: customer.contact.on, reason: reasonLabel(customer.contact.reason), note: customer.contact.note || "" }
      : null,
  };
}

const STATUS_ORDER = { missed: 0, dueThisWeek: 1, never: 2, onTrack: 3 };

/**
 * Who each sheet is for. Active reps always, plus anyone inactive who still
 * holds customers, plus an Unassigned sheet when there are ungraded ones —
 * those still need ringing, and leaving them off paper is how they get
 * forgotten.
 */
export function sheetTargets(customers, reps) {
  const held = (id) => (customers || []).filter((c) => (c.repId ?? null) === id);
  const targets = activeReps(reps).map((rep) => ({ rep, customers: held(rep.id) }));

  for (const rep of sortList(reps).filter((r) => !r.isActive)) {
    const mine = held(rep.id);
    if (mine.length) targets.push({ rep, customers: mine });
  }

  const orphans = held(null);
  if (orphans.length) targets.push({ rep: UNASSIGNED, customers: orphans });
  return targets;
}

/**
 * Builds the sheets to print.
 *
 * @param kind    "followups" or "list"
 * @param repIds  which reps to include; null for everyone. `null` inside the
 *                array means the Unassigned sheet.
 */
export function buildSheets(
  customers,
  reminders,
  settings,
  { kind = "followups", reps = [], tiers = [], repIds = null, now = new Date() } = {}
) {
  const wanted = repIds === null ? null : new Set(repIds.map((id) => id ?? "__none__"));

  return sheetTargets(customers, reps)
    .filter(({ rep }) => !wanted || wanted.has(rep.id ?? "__none__"))
    .map(({ rep, customers: mine }) => {
      if (kind === "list") {
        const rows = mine
          .map((c) => lineFor(c, settings, now))
          .sort(
            (a, b) =>
              STATUS_ORDER[a.status.key] - STATUS_ORDER[b.status.key] || a.name.localeCompare(b.name)
          );
        return { rep, kind, total: mine.length, rows, groups: [], toCall: 0 };
      }

      // Running the real follow-up logic over just this rep's customers means
      // the paper and the screen can never drift apart.
      const data = buildFollowUps(mine, reminders, settings, { tiers, now });
      const groups = CALL_GROUPS.map((g) => ({
        key: g.key,
        title: g.title,
        entries: g.from(data).map((entry) => ({
          ...lineFor(entry.customer, settings, now),
          // A reminder's own note is the reason it exists; keep it on the line.
          reminderNote: entry.note || null,
          due: entry.reminder?.dueOn || null,
        })),
      })).filter((g) => g.entries.length > 0);

      return {
        rep,
        kind,
        total: mine.length,
        groups,
        rows: [],
        toCall: groups.reduce((n, g) => n + g.entries.length, 0),
      };
    });
}

/** Sheets with nothing on them are not worth the paper. */
export const hasContent = (sheet) => (sheet.kind === "list" ? sheet.total > 0 : sheet.toCall > 0);
