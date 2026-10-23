import { parseCsv, toCsv } from "./csv.js";
import { parseDate, toIso, todayIso } from "./dates.js";
import { mondayOfWeek, weekIndexOf } from "./weeks.js";
import { parseWeeks, weeksFromDays } from "./settings.js";
import { isReason } from "./followups.js";
import { initialsFor } from "./analytics.js";

/**
 * Everything that turns a spreadsheet into app data, and back again.
 *
 * Three tables, whether they arrive as CSV files or Google Sheet tabs:
 *   customers — customer_id, name, phone, visit_every_weeks, …
 *   actions   — customer_id, visit_date, is_logged   (one row per tap)
 *   reminders — customer_id, due_date, note
 *
 * `customer_id` is the join key everywhere. It is a stable incremental number
 * written into the sheet, not derived from the name — renaming a shop used to
 * break the link to its reminders and visits.
 *
 * A visit is an *action row*, not a cell. Undoing or deleting one flips
 * `is_logged` to 0 rather than removing the row, so the sheet keeps the audit
 * trail of what was tapped and what was taken back.
 *
 * Header matching stays forgiving — case, spaces, underscores and common
 * synonyms all resolve — because these are maintained by hand.
 */

const CUSTOMER_FIELDS = {
  customerId: ["customerid", "custid", "id", "code"],
  name: ["name", "customername", "customer", "shop", "shopname", "party", "partyname"],
  phone: ["phone", "phonenumber", "mobile", "mobileno", "contact", "contactnumber", "number"],
  initials: ["initials", "shortcode"],
  visitEveryWeeks: [
    "visiteveryweeks", "everyweeks", "weeks", "frequencyweeks", "cycleweeks",
    "visitcycle", "frequency", "interval", "target", "cadence", "visitevery",
  ],
  // Sheets written against the earlier day-based build still load.
  legacyDays: [
    "visiteverydays", "everydays", "expecteddays", "targetdays",
    "intervaldays", "frequencydays", "days",
  ],
  visits: ["visitdates", "visits", "visitdate", "visithistory", "dates", "lastvisits"],
  calledOn: ["lastcalldate", "calldate", "calledon", "lastcalled", "callmadeon"],
  callReason: ["lastcallreason", "callreason", "reason", "outcome", "whattheysaid"],
  callNote: ["lastcallnote", "callnote", "notes", "note", "comment"],
  snoozedUntil: ["snoozeduntil", "snoozeuntil", "snoozed", "remindafter"],
};

const ACTION_FIELDS = {
  actionId: ["actionid", "id"],
  customerId: ["customerid", "custid", "customer"],
  customerName: ["customername", "name", "shop"],
  date: ["visitdate", "date", "actiondate", "loggedfor", "visitedon"],
  isLogged: ["islogged", "logged", "active", "valid"],
  loggedAt: ["loggedat", "recordedat", "createdat", "timestamp"],
};

const REMINDER_FIELDS = {
  reminderId: ["reminderid", "id"],
  customerId: ["customerid", "custid"],
  name: ["customername", "customer", "name", "shop", "shopname"],
  dueOn: ["duedate", "dueon", "calldate", "remindon", "reminderdate", "due"],
  note: ["note", "notes", "reason", "about", "comment"],
};

const normalizeHeader = (h) => String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Maps one spreadsheet row onto our field names using the alias tables. */
function pick(row, aliases) {
  const out = {};
  const byNormalized = {};
  for (const key of Object.keys(row)) byNormalized[normalizeHeader(key)] = row[key];

  for (const [field, names] of Object.entries(aliases)) {
    out[field] = null;
    for (const n of names) {
      const v = byNormalized[n];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        out[field] = v;
        break;
      }
    }
  }
  return out;
}

/** Visit dates live in one cell, separated by any of | ; , or a newline. */
function splitDates(cell) {
  if (cell == null) return [];
  if (cell instanceof Date || typeof cell === "number") {
    const one = parseDate(cell);
    return one ? [one] : [];
  }
  return String(cell)
    .split(/[|;,\n\r]+/)
    .map((s) => parseDate(s.trim()))
    .filter(Boolean);
}

const text = (v) => (v == null ? "" : String(v).trim());

/** Only the fixed reason set is stored, so the churn report stays countable. */
function normalizeReason(value) {
  const key = text(value).toLowerCase().replace(/[^a-z]/g, "");
  if (!key) return null;
  const direct = ["price", "notnow", "unhappy", "service", "noanswer"].find((k) => k.replace(/[^a-z]/g, "") === key);
  if (direct) return direct === "notnow" ? "notNow" : direct === "noanswer" ? "noAnswer" : direct;
  if (key.includes("price")) return "price";
  if (key.includes("answer")) return "noAnswer";
  if (key.includes("service")) return "service";
  if (key.includes("unhappy")) return "unhappy";
  if (key.includes("not")) return "notNow";
  return null;
}

const sortDatesDesc = (dates) => [...new Set(dates)].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

export class DataError extends Error {}

const asId = (v) => {
  const n = Math.trunc(Number(text(v)));
  return Number.isFinite(n) && n > 0 ? String(n) : null;
};

/** The next free id, so hand-added sheet rows never collide with app-added ones. */
export function nextCustomerId(customers) {
  let max = 0;
  for (const c of customers) {
    const n = Number(c.id);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}

export function normalizeCustomers(rows) {
  const out = [];
  const byName = new Map();
  const taken = new Set();
  const needsId = [];

  rows.forEach((row) => {
    const f = pick(row, CUSTOMER_FIELDS);
    const name = f.name == null ? "" : String(f.name).trim();
    if (!name) return; // blank spacer rows are common in hand-kept sheets

    // A name appearing twice merges rather than overwrites, so a sheet kept as
    // one row per visit works just as well as one row per customer.
    const existing = byName.get(name.toLowerCase());
    const visits = splitDates(f.visits);
    const calledOn = parseDate(f.calledOn);
    const contact = calledOn ? { on: calledOn, reason: normalizeReason(f.callReason), note: text(f.callNote) } : null;
    const snoozedUntilWeek = weekIndexOf(parseDate(f.snoozedUntil));

    if (existing) {
      existing.visits = sortDatesDesc([...existing.visits, ...visits]);
      if (contact && (!existing.contact || contact.on > existing.contact.on)) existing.contact = contact;
      if (!existing.phone && f.phone) existing.phone = String(f.phone).trim();
      if (existing.visitEveryWeeks == null) {
        existing.visitEveryWeeks = parseWeeks(f.visitEveryWeeks) ?? weeksFromDays(f.legacyDays);
      }
      return;
    }

    // An id already in the sheet is kept; a duplicate or missing one is reissued
    // afterwards, once we know which numbers are spoken for.
    let id = asId(f.customerId);
    if (id && taken.has(id)) id = null;
    if (id) taken.add(id);

    const customer = {
      id,
      name,
      phone: f.phone == null ? "" : String(f.phone).trim(),
      initials: f.initials ? String(f.initials).trim().slice(0, 2).toUpperCase() : initialsFor(name),
      visitEveryWeeks: parseWeeks(f.visitEveryWeeks) ?? weeksFromDays(f.legacyDays),
      visits: sortDatesDesc(visits),
      contact,
      snoozedUntilWeek,
    };
    if (!id) needsId.push(customer);
    byName.set(name.toLowerCase(), customer);
    out.push(customer);
  });

  let next = 1;
  for (const customer of needsId) {
    while (taken.has(String(next))) next += 1;
    customer.id = String(next);
    taken.add(customer.id);
  }

  return out;
}

/**
 * One row per tap. `is_logged` 0 means it was undone or deleted — the row stays
 * so the sheet records that it happened and was taken back.
 */
export function normalizeActions(rows, customers) {
  const byId = new Map(customers.map((c) => [c.id, c]));
  const byName = new Map(customers.map((c) => [c.name.toLowerCase(), c]));
  let seq = 0;

  return rows
    .map((row) => {
      const f = pick(row, ACTION_FIELDS);
      const customer = byId.get(asId(f.customerId)) || byName.get(text(f.customerName).toLowerCase());
      const date = parseDate(f.date);
      if (!customer || !date) return null; // an action for nobody, or with no date
      seq += 1;
      return {
        actionId: text(f.actionId) || `a${seq}`,
        customerId: customer.id,
        date,
        // Anything but an explicit 0/false/no counts as logged, so a blank
        // column in a hand-made sheet behaves as "yes, they came".
        isLogged: !/^(0|false|no|n)$/i.test(text(f.isLogged)),
        loggedAt: text(f.loggedAt) || null,
      };
    })
    .filter(Boolean);
}

/** Rebuilds every customer's visit list from the action log. */
export function applyActions(customers, actions) {
  const dates = new Map();
  for (const a of actions) {
    if (!a.isLogged) continue;
    if (!dates.has(a.customerId)) dates.set(a.customerId, []);
    dates.get(a.customerId).push(a.date);
  }
  return customers.map((c) => ({ ...c, visits: sortDatesDesc(dates.get(c.id) || []) }));
}

/** Turns packed `visit_dates` cells into action rows, for the first migration. */
export function actionsFromCustomers(customers) {
  const actions = [];
  let seq = 0;
  for (const c of customers) {
    for (const date of c.visits || []) {
      seq += 1;
      actions.push({ actionId: `a${seq}`, customerId: c.id, date, isLogged: true, loggedAt: null });
    }
  }
  return actions;
}

export function normalizeReminders(rows, customers) {
  const byId = new Map(customers.map((c) => [c.id, c]));
  const byName = new Map(customers.map((c) => [c.name.toLowerCase(), c]));
  let seq = 0;

  return rows
    .map((row) => {
      const f = pick(row, REMINDER_FIELDS);
      // Prefer the id; fall back to the name so older sheets still load.
      const customer = byId.get(asId(f.customerId)) || byName.get(text(f.name).toLowerCase());
      const dueOn = parseDate(f.dueOn);
      if (!customer || !dueOn) return null; // a reminder for nobody, or with no date, is noise
      seq += 1;
      return {
        id: text(f.reminderId) || `r${seq}`,
        customerId: customer.id,
        dueOn,
        note: f.note == null ? "" : String(f.note).trim(),
      };
    })
    .filter(Boolean);
}

function sheetRows(workbook, aliases) {
  const wanted = aliases.map(normalizeHeader);
  const match = workbook.SheetNames.find((n) => wanted.includes(normalizeHeader(n)));
  const sheetName = match || workbook.SheetNames[0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
}

/** SheetJS is ~500 kB, so it is fetched only when a real workbook turns up. */
async function loadXlsx() {
  return import("xlsx");
}

const isCsvName = (filename) => /\.csv$/i.test(filename || "");

function sheetNameFor(names, wanted) {
  const want = wanted.map(normalizeHeader);
  return names.find((n) => want.includes(normalizeHeader(n))) || names[0];
}

/** Row objects -> `{ customers, actions, reminders }`, joined on customer_id. */
function buildData(customerRows, actionRows, reminderRows) {
  const customers = normalizeCustomers(customerRows);
  if (!customers.length) {
    throw new DataError(
      "No customers found. The sheet needs at least a 'name' column, plus an actions tab or visit_dates for the rhythm to work."
    );
  }
  // An actions table wins; without one, any packed visit_dates cells become actions.
  const actions = actionRows ? normalizeActions(actionRows, customers) : actionsFromCustomers(customers);
  const reminders = reminderRows ? normalizeReminders(reminderRows, customers) : [];
  return { customers: applyActions(customers, actions), actions, reminders };
}

/** Parses a customers CSV. Synchronous — no spreadsheet library involved. */
export function parseCustomersCsv(text) {
  return buildData(parseCsv(text), null, null);
}

/** Parses a real workbook, loading SheetJS on demand. */
export async function parseWorkbook(data, filename = "") {
  const XLSX = await loadXlsx();
  let workbook;
  try {
    workbook = XLSX.read(data, {
      type: typeof data === "string" ? "string" : "array",
      cellDates: true,
      raw: true,
    });
  } catch (err) {
    throw new DataError(`Could not read ${filename || "that file"}: ${err.message}`);
  }
  if (!workbook.SheetNames.length) throw new DataError("That file has no sheets in it.");

  const rowsOf = (name) => XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: "" });
  const customerSheet = sheetNameFor(workbook.SheetNames, ["customers", "customer", "sheet1"]);
  const actionSheet = workbook.SheetNames.find((n) => normalizeHeader(n).startsWith("action"));
  const reminderSheet = workbook.SheetNames.find((n) => normalizeHeader(n).startsWith("reminder"));

  return buildData(
    rowsOf(customerSheet),
    actionSheet ? rowsOf(actionSheet) : null,
    reminderSheet ? rowsOf(reminderSheet) : null
  );
}

/**
 * Reads whatever the user picked in the Data screen: `.csv` goes through the
 * local parser, anything else pulls in SheetJS.
 */
export async function parseFile(file) {
  if (isCsvName(file.name)) return parseCustomersCsv(await file.text());
  return parseWorkbook(new Uint8Array(await file.arrayBuffer()), file.name);
}

/** Loads the CSVs shipped in `public/data/` — the app's first-run contents. */
export async function loadSeedData(baseUrl = import.meta.env.BASE_URL) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  const fetchText = async (path, required) => {
    const res = await fetch(`${base}${path}`, { cache: "no-store" });
    if (!res.ok) {
      if (required) throw new DataError(`Could not load ${path} (HTTP ${res.status}).`);
      return null;
    }
    return res.text();
  };

  const { customers } = parseCustomersCsv(await fetchText("data/customers.csv", true));

  // An actions file wins over any packed visit_dates cells; without one the
  // packed cells are converted, so an older sheet still opens.
  const actionsCsv = await fetchText("data/actions.csv", false);
  const actions = actionsCsv ? normalizeActions(parseCsv(actionsCsv), customers) : actionsFromCustomers(customers);

  const remindersCsv = await fetchText("data/reminders.csv", false);
  const reminders = remindersCsv ? normalizeReminders(parseCsv(remindersCsv), customers) : [];

  return { customers: applyActions(customers, actions), actions, reminders };
}

/* ---------------- Export ---------------- */

export function customerAoA(customers) {
  return [
    ["customer_id", "name", "phone", "initials", "visit_every_weeks", "last_call_date", "last_call_reason", "last_call_note", "snoozed_until"],
    ...customers.map((c) => [
      c.id,
      c.name,
      c.phone || "",
      c.initials || "",
      c.visitEveryWeeks || "",
      c.contact?.on || "",
      c.contact?.reason || "",
      c.contact?.note || "",
      c.snoozedUntilWeek == null ? "" : toIso(mondayOfWeek(c.snoozedUntilWeek)),
    ]),
  ];
}

export function actionAoA(actions) {
  return [
    ["action_id", "customer_id", "visit_date", "is_logged", "logged_at"],
    ...actions.map((a) => [a.actionId, a.customerId, a.date, a.isLogged ? 1 : 0, a.loggedAt || ""]),
  ];
}

export function reminderAoA(reminders, customers) {
  // The name rides along for a human reading the sheet; the id is the join.
  const nameOf = (id) => customers.find((c) => c.id === id)?.name || "";
  return [
    ["reminder_id", "customer_id", "customer_name", "due_date", "note"],
    ...reminders.map((r) => [r.id, r.customerId, nameOf(r.customerId), r.dueOn, r.note || ""]),
  ];
}

/** Downloads the current data as a three-sheet .xlsx — the backup / hand-off file. */
export async function downloadWorkbook(customers, actions, reminders, filename) {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(customerAoA(customers)), "customers");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(actionAoA(actions)), "actions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reminderAoA(reminders, customers)), "reminders");
  XLSX.writeFile(wb, filename || `visit-tracker-${todayIso()}.xlsx`);
}

/** Downloads the three tables as separate CSVs, matching the sheet tabs. */
export function downloadCsvs(customers, actions, reminders) {
  const stamp = todayIso();
  triggerDownload(toCsv(customerAoA(customers)), `customers-${stamp}.csv`, "text/csv;charset=utf-8");
  triggerDownload(toCsv(actionAoA(actions)), `actions-${stamp}.csv`, "text/csv;charset=utf-8");
  triggerDownload(toCsv(reminderAoA(reminders, customers)), `reminders-${stamp}.csv`, "text/csv;charset=utf-8");
}

function triggerDownload(text, filename, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
