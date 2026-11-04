/**
 * Which sections of the follow-up screen are folded away.
 *
 * Persisted, because the screen does not survive a round trip: tapping a
 * customer unmounts it, and coming back would otherwise re-expand everything
 * you had just tidied out of the way. A fold that forgets itself that quickly
 * is not really a fold.
 *
 * Only sections the owner has actually touched are stored. Anything absent
 * falls back to its default, so a section added in a later version arrives
 * open or closed as it was designed to, rather than inheriting whatever
 * happened to be in storage.
 */

const KEY = "cvt.collapsed.v1";

/**
 * Open by default where there is work to do, closed where there is not.
 * The three call groups are the reason to open the screen at all; the rest are
 * a record of what has already been dealt with.
 */
export const DEFAULT_OPEN = {
  reminders: true,
  missedLastWeek: true,
  stillAway: true,
  cameBack: false,
  called: false,
  snoozed: false,
  neverReturned: false,
};

export function loadCollapsed() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || typeof raw !== "object") return {};
    // Only booleans, and only for sections this build knows about.
    const out = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key in DEFAULT_OPEN && typeof value === "boolean") out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveCollapsed(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    // Private mode or a full quota: folding still works for this session.
    return false;
  }
}

/** Whether a section is open: the owner's choice if they made one, else the default. */
export const isOpen = (state, key) => (key in (state || {}) ? state[key] : DEFAULT_OPEN[key] ?? true);
