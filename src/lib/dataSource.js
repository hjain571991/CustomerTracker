import { parseCsv, toCsv } from "./csv.js";
import { parseDate, toIso, todayIso } from "./dates.js";
import { mondayOfWeek, weekIndexOf } from "./weeks.js";
import { parseWeeks, weeksFromDays } from "./settings.js";
import { isReason } from "./followups.js";
import { initialsFor } from "./analytics.js";

/**
 * Everything that turns a spreadsheet into app data, and back again.
 *
 * Two sheets/files are understood:
 *   customers — name, phone, initials, visit_dates, last_call_date, promised_date
 *   reminders — customer_name, due_date, note
 *
 * Header matching is deliberately forgiving: case, spaces, underscores and
 * common synonyms all resolve to the same field, because the file is going to
 * be maintained by hand in Excel.
 */

const CUSTOMER_FIELDS = {
  name: ["name", "customername", "customer", "shop", "shopname", "party", "partyname"],
  phone: ["phone", "phonenumber", "mobile", "mobileno", "contact", "contactnumber", "number"],
  initials: ["initials", "shortcode", "code"],
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

const REMINDER_FIELDS = {
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

export function normalizeCustomers(rows) {
  const byName = new Map();

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

    byName.set(name.toLowerCase(), {
      id: makeId(name),
      name,
      phone: f.phone == null ? "" : String(f.phone).trim(),
      initials: f.initials ? String(f.initials).trim().slice(0, 2).toUpperCase() : initialsFor(name),
      visitEveryWeeks: parseWeeks(f.visitEveryWeeks) ?? weeksFromDays(f.legacyDays),
      visits: sortDatesDesc(visits),
      contact,
      snoozedUntilWeek,
    });
  });

  return [...byName.values()];
}

export function normalizeReminders(rows, customers) {
  const byName = new Map(customers.map((c) => [c.name.toLowerCase(), c]));

  return rows
    .map((row) => {
      const f = pick(row, REMINDER_FIELDS);
      const name = f.name == null ? "" : String(f.name).trim();
      const customer = byName.get(name.toLowerCase());
      const dueOn = parseDate(f.dueOn);
      if (!customer || !dueOn) return null; // a reminder for nobody, or with no date, is noise
      return {
        id: makeId(`${name}-${dueOn}`),
        customerId: customer.id,
        dueOn,
        note: f.note == null ? "" : String(f.note).trim(),
      };
    })
    .filter(Boolean);
}

let idCounter = 0;
function makeId(seed) {
  idCounter += 1;
  return `${String(seed).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${idCounter}`;
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

/** Row objects -> `{ customers, reminders }`, with the reminders joined by name. */
function buildData(customerRows, reminderRows) {
  const customers = normalizeCustomers(customerRows);
  if (!customers.length) {
    throw new DataError(
      "No customers found. The sheet needs at least a 'name' column, plus 'visit_dates' for the rhythm to work."
    );
  }
  return { customers, reminders: reminderRows ? normalizeReminders(reminderRows, customers) : [] };
}

/** Parses a customers CSV. Synchronous — no spreadsheet library involved. */
export function parseCustomersCsv(text) {
  return buildData(parseCsv(text), null);
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
  const reminderSheet = workbook.SheetNames.find((n) => normalizeHeader(n).startsWith("reminder"));

  return buildData(rowsOf(customerSheet), reminderSheet ? rowsOf(reminderSheet) : null);
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
  const remindersCsv = await fetchText("data/reminders.csv", false);
  const reminders = remindersCsv ? normalizeReminders(parseCsv(remindersCsv), customers) : [];

  return { customers, reminders };
}

/* ---------------- Export ---------------- */

function customerAoA(customers) {
  return [
    ["name", "phone", "initials", "visit_every_weeks", "visit_dates", "last_call_date", "last_call_reason", "last_call_note", "snoozed_until"],
    ...customers.map((c) => [
      c.name,
      c.phone || "",
      c.initials || "",
      c.visitEveryWeeks || "",
      (c.visits || []).join(" | "),
      c.contact?.on || "",
      c.contact?.reason || "",
      c.contact?.note || "",
      c.snoozedUntilWeek == null ? "" : toIso(mondayOfWeek(c.snoozedUntilWeek)),
    ]),
  ];
}

function reminderAoA(reminders, customers) {
  const nameOf = (id) => customers.find((c) => c.id === id)?.name || "";
  return [
    ["customer_name", "due_date", "note"],
    ...reminders.map((r) => [nameOf(r.customerId), r.dueOn, r.note || ""]),
  ];
}

/** Downloads the current data as a two-sheet .xlsx — the backup / hand-off file. */
export async function downloadWorkbook(customers, reminders, filename) {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(customerAoA(customers)), "customers");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reminderAoA(reminders, customers)), "reminders");
  XLSX.writeFile(wb, filename || `customers-${todayIso()}.xlsx`);
}

/** Downloads just the customers sheet as CSV, ready to drop into public/data/. */
export function downloadCustomersCsv(customers, filename) {
  triggerDownload(toCsv(customerAoA(customers)), filename || `customers-${todayIso()}.csv`, "text/csv;charset=utf-8");
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
