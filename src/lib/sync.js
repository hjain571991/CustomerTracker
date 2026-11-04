/**
 * Keeps the Google Sheet and the device in step.
 *
 * Two rules shape this:
 *
 * 1. A tap must never wait on the network. Shop wifi is unreliable and the
 *    staff screen has to feel instant, so every change is applied locally,
 *    queued in an outbox, and sent in the background. The queue is persisted,
 *    so closing the app with unsent work does not lose it.
 *
 * 2. Reading replaces local state wholesale, so it must not run while the
 *    outbox still holds work — the sheet would not know about those changes
 *    yet and would hand back stale rows. Sync is therefore always flush, then
 *    read.
 */
import { applyActions, normalizeActions, normalizeCustomers, normalizeReminders, normalizeReps, normalizeTiers } from "./dataSource.js";
import { applyReps, reconcileReps } from "./reps.js";
import { applyTiers, reconcileTiers } from "./tiers.js";
import { readAll, writeChanges } from "./sheets.js";

const OUTBOX_KEY = "cvt.outbox.v1";

export function loadOutbox() {
  try {
    const raw = JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveOutbox(items) {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  } catch {
    // Out of quota: the changes still apply locally this session.
  }
}

/**
 * Queues changes, collapsing any earlier entry for the same row. Tapping the
 * same customer repeatedly should send one final row, not a pile of them.
 */
export function enqueue(outbox, changes) {
  const next = [...outbox];
  for (const change of changes) {
    const existing = next.findIndex(
      (c) => c.tab === change.tab && c.key === change.key && String(c.row[c.key]) === String(change.row[change.key])
    );
    if (existing >= 0) next[existing] = change;
    else next.push(change);
  }
  return next;
}

/** Sends everything queued. Returns the outbox that remains (empty on success). */
export async function flush(config, outbox) {
  if (!outbox.length) return [];
  await writeChanges(config, outbox);
  return [];
}

/** Turns raw sheet rows into the app's shape. */
export function fromSheet(raw) {
  const customers = normalizeCustomers(raw.customers || []);
  const actions = normalizeActions(raw.actions || [], customers);
  const reminders = normalizeReminders(raw.reminders || [], customers);
  // A sheet from before the reps tab existed reads as an empty list; any rep
  // typed straight onto a customer row is adopted into it.
  const reps = reconcileReps(normalizeReps(raw.reps || []), customers);
  const tiers = reconcileTiers(normalizeTiers(raw.tiers || []), customers);
  return {
    customers: applyTiers(applyReps(applyActions(customers, actions), reps), tiers),
    actions,
    reminders,
    reps,
    tiers,
    // A missing tab means the deployment predates it. Worth knowing: such a
    // script also drops the columns added alongside, so changes appear to save
    // and quietly do not.
    hasRepsTab: Array.isArray(raw.reps),
    hasTiersTab: Array.isArray(raw.tiers),
    readAt: raw.readAt || null,
  };
}

/**
 * Push anything pending, then pull the sheet. Always in that order, so the
 * read cannot overwrite work the sheet has not been told about.
 */
export async function syncNow(config, outbox) {
  const remaining = await flush(config, outbox);
  const raw = await readAll(config);
  return { ...fromSheet(raw), outbox: remaining };
}
