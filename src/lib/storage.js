/**
 * Local persistence. Visits logged on the shop floor must survive a reload and
 * an offline stretch, so state is mirrored to localStorage on every change and
 * the seed CSVs are only consulted on a genuinely first run.
 */

const KEY = "cvt.data.v1";
const SOURCE_KEY = "cvt.source.v1";

export function loadSaved() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.customers) || !parsed.customers.length) return null;
    return { customers: parsed.customers, reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [] };
  } catch {
    return null; // corrupt or unavailable storage falls back to the seed file
  }
}

export function save(customers, reminders) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ customers, reminders }));
  } catch {
    // Private mode or a full quota — the session still works, it just won't persist.
  }
}

export function clearSaved() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(SOURCE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** A human-readable note of where the current data came from, for the Data screen. */
export function loadSource() {
  try {
    return JSON.parse(localStorage.getItem(SOURCE_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveSource(source) {
  try {
    localStorage.setItem(SOURCE_KEY, JSON.stringify(source));
  } catch {
    /* best effort */
  }
}
