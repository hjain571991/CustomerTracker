/**
 * Talks to the Google Sheet through its Apps Script Web App.
 *
 * Deliberately not the Sheets REST API: that needs a Google Cloud project, an
 * OAuth client and a sign-in from whoever is holding the phone. An Apps Script
 * web app is a plain URL the shop pastes in once, so staff never see a Google
 * login and the app stays a static site with no backend of its own.
 *
 * Requests are sent as `text/plain` on purpose — it keeps them "simple" by CORS
 * rules, so the browser skips the preflight that Apps Script cannot answer.
 */

const CONFIG_KEY = "cvt.sheet.v1";
const SEEDED_KEY = "cvt.sheet.seeded.v1";
const TIMEOUT_MS = 20000;

export class SheetError extends Error {}

export function loadSheetConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null");
    if (!raw || typeof raw !== "object") return { url: "", secret: "" };
    return { url: String(raw.url || ""), secret: String(raw.secret || "") };
  } catch {
    return { url: "", secret: "" };
  }
}

export function saveSheetConfig(config) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ url: config.url || "", secret: config.secret || "" }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Has this sheet been filled yet?
 *
 * Until it has, the sheet is not the source of truth and must not be allowed
 * to overwrite the device — nor may single changes trickle up, or the sheet
 * ends up holding one customer and the app adopts that over the other sixty.
 * Keyed by URL so pointing at a different sheet starts over.
 */
export function isSeeded(config) {
  try {
    return localStorage.getItem(SEEDED_KEY) === (config?.url || "");
  } catch {
    return false;
  }
}

export function markSeeded(config) {
  try {
    localStorage.setItem(SEEDED_KEY, config?.url || "");
  } catch {
    /* best effort */
  }
}

export const isConfigured = (config) => /^https:\/\/script\.google\.com\/.+\/exec/.test(config?.url || "");

/** Reads the reply, turning Apps Script's failure pages into plain messages. */
async function readReply(res) {
  // 401/403 means Google wanted a login: the deployment is not public. The app
  // cannot sign in — a cross-origin fetch sends no Google cookies — so this is
  // always a deployment setting, never something the app can work around.
  if (res.status === 401 || res.status === 403) {
    throw new SheetError(
      'The script is not shared with "Anyone". Deploy → Manage deployments → ✏ → Who has access → Anyone → Deploy.'
    );
  }
  // Following the redirect to a Google sign-in page lands here as a 200 of HTML.
  if (res.url && /accounts\.google\.com/.test(res.url)) {
    throw new SheetError('The script asked for a Google login, so it is not shared with "Anyone" yet.');
  }
  if (!res.ok) throw new SheetError(`The sheet replied ${res.status}.`);
  const body = await res.text();
  try {
    const parsed = JSON.parse(body);
    if (!parsed.ok) throw new SheetError(parsed.error || "The sheet rejected the request.");
    return parsed.data;
  } catch (err) {
    if (err instanceof SheetError) throw err;
    // Apps Script serves an HTML sign-in page when the deployment is not public.
    throw new SheetError(
      /sign in|accounts\.google|authoriz/i.test(body)
        ? 'The script is not published to "Anyone". Redeploy: Deploy → Manage deployments → ✏ → Who has access → Anyone.'
        : "The sheet sent something that was not JSON — check the URL ends in /exec, not /dev."
    );
  }
}

function withTimeout() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

// A URL this long is still comfortably inside what browsers and Apps Script
// accept; past it we have to use POST.
const MAX_URL = 7000;

async function call(config, payload) {
  if (!isConfigured(config)) {
    throw new SheetError("That does not look like an Apps Script web app URL. It should end in /exec.");
  }
  const body = JSON.stringify({ ...payload, secret: config.secret || undefined });
  const getUrl = `${config.url}?payload=${encodeURIComponent(body)}`;

  // GET first, deliberately. Apps Script answers a POST with a 302 to
  // googleusercontent, and following that drops the body — so POST is the
  // unreliable path here, not the other way round.
  if (getUrl.length <= MAX_URL) {
    const t = withTimeout();
    try {
      return await readReply(await fetch(getUrl, { method: "GET", redirect: "follow", signal: t.signal }));
    } catch (err) {
      if (err instanceof SheetError) throw err;
      if (err.name === "AbortError") throw new SheetError("The sheet did not answer within 20 seconds.");
      // Network-level refusal: fall through and try POST.
    } finally {
      t.done();
    }
  }

  const t = withTimeout();
  try {
    const res = await fetch(config.url, {
      method: "POST",
      // text/plain keeps this a CORS-simple request, so no preflight.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body,
      redirect: "follow",
      signal: t.signal,
    });
    return await readReply(res);
  } catch (err) {
    if (err instanceof SheetError) throw err;
    if (err.name === "AbortError") throw new SheetError("The sheet did not answer within 20 seconds.");
    throw new SheetError(
      "Could not reach the sheet. Check the URL ends in /exec, the deployment's " +
        'access is "Anyone", and this device is online.'
    );
  } finally {
    t.done();
  }
}

export const ping = (config) => call(config, { op: "ping" });

/** The whole book, as raw row objects for dataSource to normalise. */
export const readAll = (config) => call(config, { op: "read" });

/** Applies a batch of upserts. Each change is { tab, key, row }. */
export const writeChanges = (config, changes) =>
  changes.length ? call(config, { op: "write", changes }) : Promise.resolve({ applied: 0 });

/* ---------------- row builders ---------------- */

export const customerRow = (c) => ({
  customer_id: c.id,
  name: c.name,
  phone: c.phone || "",
  initials: c.initials || "",
  visit_every_weeks: c.visitEveryWeeks || "",
  last_call_date: c.contact?.on || "",
  last_call_reason: c.contact?.reason || "",
  last_call_note: c.contact?.note || "",
  snoozed_until: c.snoozedUntil || "",
});

export const actionRow = (a) => ({
  action_id: a.actionId,
  customer_id: a.customerId,
  visit_date: a.date,
  is_logged: a.isLogged ? 1 : 0,
  logged_at: a.loggedAt || new Date().toISOString(),
});

export const reminderRow = (r, customerName) => ({
  reminder_id: r.id,
  customer_id: r.customerId,
  customer_name: customerName || "",
  due_date: r.dueOn,
  note: r.note || "",
});

/**
 * Replaces a whole tab, in chunks.
 *
 * The full book is ~19 KB of JSON, well past what a URL can carry, so it goes
 * up a slice at a time: the first call clears the tab, the rest append.
 * `onProgress` lets the UI say how far along it is.
 */
export async function replaceTab(config, tab, aoa, onProgress) {
  const [, ...rows] = aoa; // the header is written by the script itself
  const chunks = [];
  let current = [];
  let size = 0;

  for (const row of rows) {
    const rowSize = JSON.stringify(row).length;
    // Leave room for the URL, the op and the encoding overhead.
    if (current.length && size + rowSize > 3500) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(row);
    size += rowSize;
  }
  if (current.length) chunks.push(current);
  if (!chunks.length) chunks.push([]); // still clear the tab

  let done = 0;
  for (let i = 0; i < chunks.length; i++) {
    await call(config, { op: "replace", tab, rows: chunks[i], mode: i === 0 ? "start" : "append" });
    done += chunks[i].length;
    if (onProgress) onProgress({ tab, done, total: rows.length });
  }
  return { tab, written: rows.length };
}

export const changeFor = {
  customer: (c) => ({ tab: "customers", key: "customer_id", row: customerRow(c) }),
  action: (a) => ({ tab: "actions", key: "action_id", row: actionRow(a) }),
  reminder: (r, name) => ({ tab: "reminders", key: "reminder_id", row: reminderRow(r, name) }),
};
