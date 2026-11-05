import { parseCsv, toCsv } from "./csv.js";
import { parseDate, toIso, todayIso } from "./dates.js";
import { mondayOfWeek, weekIndexOf } from "./weeks.js";
import { MAX_WEEKS, MIN_WEEKS, parseWeeks, weeksFromDays } from "./settings.js";
import { isReason } from "./followups.js";
import { initialsFor } from "./analytics.js";
import { applyReps, reconcileReps } from "./reps.js";
import { applyTiers, reRankTiers, reconcileTiers } from "./tiers.js";
import { listKey, sortList } from "./lookups.js";
import { TEMPLATE_COLUMNS } from "./importCustomers.js";
import { addValidations, templateRules } from "./xlsxValidation.js";

/**
 * Everything that turns a spreadsheet into app data, and back again.
 *
 * Five tables, whether they arrive as CSV files or Google Sheet tabs:
 *   customers — customer_id, name, phone, company, marketing_rep_id, tier_id, …
 *   actions   — customer_id, visit_date, is_logged   (one row per tap)
 *   reminders — customer_id, due_date, note, is_done
 *   reps      — rep_id, name, is_active  (the marketing representatives)
 *   tiers     — tier_id, name, rank, is_active  (how important a customer is)
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
  company: ["company", "companyname", "firm", "firmname", "business", "businessname", "organisation", "organization"],
  repId: ["marketingrepid", "repid", "representativeid", "salesrepid"],
  repName: [
    "marketingrep", "marketingrepresentative", "representative", "rep", "salesrep",
    "salesperson", "accountmanager", "assignedto", "repname", "marketingexec",
  ],
  tierId: ["tierid", "customertierid", "gradeid"],
  tierName: ["tier", "customertier", "grade", "category", "segment", "importance", "class", "tiername"],
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
  isDone: ["isdone", "done", "completed", "complete", "dismissed"],
};

const REP_FIELDS = {
  repId: ["repid", "marketingrepid", "id", "code"],
  name: ["name", "repname", "marketingrep", "representative", "rep", "fullname", "person"],
  isActive: ["isactive", "active", "enabled", "inuse"],
};

const TIER_FIELDS = {
  tierId: ["tierid", "id", "code"],
  name: ["name", "tier", "tiername", "grade", "label"],
  rank: ["rank", "order", "priority", "position", "level", "sort", "sortorder"],
  isActive: ["isactive", "active", "enabled", "inuse"],
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

/**
 * A yes/no cell. Anything but an explicit 0/false/no reads as true, so a blank
 * column in a hand-made sheet behaves the way a person reading it would expect.
 */
const isFalsey = (v) => /^(0|false|no|n)$/i.test(text(v));

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
      if (!existing.company && f.company) existing.company = text(f.company);
      if (!existing.repName && f.repName) existing.repName = text(f.repName);
      if (!existing.repId && f.repId) existing.repId = text(f.repId);
      if (!existing.tierName && f.tierName) existing.tierName = text(f.tierName);
      if (!existing.tierId && f.tierId) existing.tierId = text(f.tierId);
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
      company: text(f.company),
      // Resolved against the rep list by `applyReps`; until then this is just
      // whatever the sheet said.
      repId: text(f.repId) || null,
      repName: text(f.repName),
      // Same story for the tier: resolved against the list by `applyTiers`.
      tierId: text(f.tierId) || null,
      tierName: text(f.tierName),
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
        // A blank column reads as "yes, they came" — see `isFalsey`.
        isLogged: !isFalsey(f.isLogged),
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
        // Blank means "still outstanding" — the opposite default to is_logged,
        // because a reminder nobody has marked is one nobody has done.
        isDone: text(f.isDone) !== "" && !isFalsey(f.isDone),
      };
    })
    .filter(Boolean);
}

/**
 * The marketing-representative list. Names are the one thing that must be
 * unique — two rows called "Priya Shah" are one person typed twice, and
 * merging them is the only reading that keeps the report countable.
 */
export function normalizeReps(rows) {
  const out = [];
  const taken = new Set();
  const byName = new Map();
  const needsId = [];

  (rows || []).forEach((row) => {
    const f = pick(row, REP_FIELDS);
    const name = text(f.name);
    if (!name) return; // blank spacer rows are common in hand-kept sheets

    const existing = byName.get(listKey(name));
    if (existing) {
      // Active anywhere wins: a rep listed twice, once retired, is still working.
      existing.isActive = existing.isActive || !isFalsey(f.isActive);
      return;
    }

    let id = asId(f.repId);
    if (id && taken.has(id)) id = null;
    if (id) taken.add(id);

    const rep = { id, name, isActive: text(f.isActive) === "" || !isFalsey(f.isActive) };
    if (!id) needsId.push(rep);
    byName.set(listKey(name), rep);
    out.push(rep);
  });

  let next = 1;
  for (const rep of needsId) {
    while (taken.has(String(next))) next += 1;
    rep.id = String(next);
    taken.add(rep.id);
  }

  return out;
}

// Far above any rank a person would type, so unranked rows sort after ranked
// ones while still holding the order they appeared in.
const UNRANKED_BASE = 100000;

/**
 * The customer-tier list. Order is the whole point — tier 1 outranks tier 2 —
 * so a missing or duplicated `rank` is renumbered from the order the rows
 * arrive in rather than left to collide.
 */
export function normalizeTiers(rows) {
  const out = [];
  const taken = new Set();
  const byName = new Map();
  const needsId = [];

  (rows || []).forEach((row) => {
    const f = pick(row, TIER_FIELDS);
    const name = text(f.name);
    if (!name) return; // blank spacer rows are common in hand-kept sheets

    const existing = byName.get(listKey(name));
    if (existing) {
      existing.isActive = existing.isActive || !isFalsey(f.isActive);
      return;
    }

    let id = asId(f.tierId);
    if (id && taken.has(id)) id = null;
    if (id) taken.add(id);

    const stated = Math.trunc(Number(text(f.rank)));
    const tier = {
      id,
      name,
      // A row with no rank takes its place from where it sits in the sheet,
      // pushed below every row that does state one. Falling back to
      // alphabetical instead would quietly make "Bronze" outrank "Gold".
      rank: Number.isFinite(stated) && stated > 0 ? stated : UNRANKED_BASE + out.length,
      isActive: text(f.isActive) === "" || !isFalsey(f.isActive),
    };
    if (!id) needsId.push(tier);
    byName.set(listKey(name), tier);
    out.push(tier);
  });

  let next = 1;
  for (const tier of needsId) {
    while (taken.has(String(next))) next += 1;
    tier.id = String(next);
    taken.add(tier.id);
  }

  // Renumbered 1..n so the order is always contiguous and unique, whatever
  // the sheet said — the provisional ranks above only settle the sequence.
  return reRankTiers(out);
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

/** Row objects -> `{ customers, actions, reminders, reps, tiers }`, joined on customer_id. */
function buildData(customerRows, actionRows, reminderRows, repRows, tierRows) {
  const customers = normalizeCustomers(customerRows);
  if (!customers.length) {
    throw new DataError(
      "No customers found. The sheet needs at least a 'name' column, plus an actions tab or visit_dates for the rhythm to work."
    );
  }
  // An actions table wins; without one, any packed visit_dates cells become actions.
  const actions = actionRows ? normalizeActions(actionRows, customers) : actionsFromCustomers(customers);
  const reminders = reminderRows ? normalizeReminders(reminderRows, customers) : [];
  // A rep named on a customer row but missing from the list is adopted into it,
  // so a sheet edited by hand keeps the assignment.
  const reps = reconcileReps(normalizeReps(repRows), customers);
  const tiers = reconcileTiers(normalizeTiers(tierRows), customers);
  return {
    customers: applyTiers(applyReps(applyActions(customers, actions), reps), tiers),
    actions,
    reminders,
    reps,
    tiers,
  };
}

/** Parses a customers CSV. Synchronous — no spreadsheet library involved. */
export function parseCustomersCsv(text) {
  return buildData(parseCsv(text), null, null, null, null);
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
  const repSheet = workbook.SheetNames.find((n) => /^(reps|representatives|marketingreps)/.test(normalizeHeader(n)));
  const tierSheet = workbook.SheetNames.find((n) => /^(tiers|customertiers|grades)/.test(normalizeHeader(n)));
  const metaSheet = workbook.SheetNames.find((n) => /^(meta|settings)/.test(normalizeHeader(n)));

  const book = buildData(
    rowsOf(customerSheet),
    actionSheet ? rowsOf(actionSheet) : null,
    reminderSheet ? rowsOf(reminderSheet) : null,
    repSheet ? rowsOf(repSheet) : null,
    tierSheet ? rowsOf(tierSheet) : null
  );
  // Only a file the app wrote carries meta; an ordinary spreadsheet has none,
  // and restoring from one simply leaves the settings alone.
  return { ...book, meta: metaSheet ? readMeta(rowsOf(metaSheet)) : null };
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

  const repsCsv = await fetchText("data/reps.csv", false);
  const reps = reconcileReps(repsCsv ? normalizeReps(parseCsv(repsCsv)) : [], customers);

  const tiersCsv = await fetchText("data/tiers.csv", false);
  const tiers = reconcileTiers(tiersCsv ? normalizeTiers(parseCsv(tiersCsv)) : [], customers);

  return {
    customers: applyTiers(applyReps(applyActions(customers, actions), reps), tiers),
    actions,
    reminders,
    reps,
    tiers,
  };
}

/* ---------------- Export ---------------- */

export function customerAoA(customers) {
  return [
    ["customer_id", "name", "phone", "company", "marketing_rep_id", "marketing_rep", "tier_id", "tier", "initials", "visit_every_weeks", "last_call_date", "last_call_reason", "last_call_note", "snoozed_until"],
    ...customers.map((c) => [
      c.id,
      c.name,
      c.phone || "",
      c.company || "",
      c.repId || "",
      // The name rides along for a human reading the sheet; the id is the join.
      c.repName || "",
      c.tierId || "",
      c.tierName || "",
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
    ["reminder_id", "customer_id", "customer_name", "due_date", "note", "is_done"],
    ...reminders.map((r) => [r.id, r.customerId, nameOf(r.customerId), r.dueOn, r.note || "", r.isDone ? 1 : 0]),
  ];
}

export function repAoA(reps) {
  return [
    ["rep_id", "name", "is_active"],
    ...(reps || []).map((r) => [r.id, r.name, r.isActive ? 1 : 0]),
  ];
}

export function tierAoA(tiers) {
  return [
    ["tier_id", "name", "rank", "is_active"],
    ...(tiers || []).map((t) => [t.id, t.name, t.rank ?? "", t.isActive ? 1 : 0]),
  ];
}

/**
 * Everything the app holds, as one `.xlsx` — the backup file.
 *
 * Settings ride along in their own tab so a restore puts the app back exactly
 * as it was, not merely with the same customers in it. The tab is key/value
 * rather than columns per setting, so adding a setting later does not change
 * the shape of a file already taken.
 */
/** Bumped only if the shape changes in a way a restore has to know about. */
export const BACKUP_FORMAT = "visit-tracker-backup-1";

export function metaAoA(settings, { takenAt = new Date() } = {}) {
  return [
    ["key", "value"],
    ["format", BACKUP_FORMAT],
    ["taken_at", takenAt.toISOString()],
    ["default_interval_weeks", settings?.defaultIntervalWeeks ?? ""],
  ];
}

const META_FIELDS = { key: ["key", "setting", "name"], value: ["value", "val"] };

/** Reads the meta tab back. Unknown keys are ignored, missing ones left alone. */
export function readMeta(rows) {
  const out = {};
  for (const row of rows || []) {
    const f = pick(row, META_FIELDS);
    const key = text(f.key).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!key) continue;
    out[key] = text(f.value);
  }
  const weeks = parseWeeks(out.defaultintervalweeks);
  return {
    format: out.format || null,
    takenAt: out.takenat || null,
    settings: weeks === null ? null : { defaultIntervalWeeks: weeks },
  };
}

/** Downloads the current data as a five-sheet .xlsx plus settings — the backup file. */
export async function downloadWorkbook(customers, actions, reminders, reps, tiers, settings, filename) {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(customerAoA(customers)), "customers");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(actionAoA(actions)), "actions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reminderAoA(reminders, customers)), "reminders");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(repAoA(reps)), "reps");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tierAoA(tiers)), "tiers");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metaAoA(settings)), "meta");
  XLSX.writeFile(wb, filename || backupFilename());
}

/**
 * The blank sheet for adding customers in bulk.
 *
 * Carries a second tab explaining each column and listing the rep and tier
 * names already in use — typed from memory those drift ("Priya"/"Priya Shah"),
 * and a name that nearly matches creates a second rep rather than finding the
 * first.
 */
export async function downloadCustomerTemplate(reps = [], tiers = [], filename) {
  triggerDownload(
    await buildCustomerTemplate(reps, tiers),
    filename || `customer-template-${todayIso()}.xlsx`,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

/** The template as bytes — split out from the download so it can be tested. */
export async function buildCustomerTemplate(reps = [], tiers = []) {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();

  // Only values the app can actually resolve are offered. A removed rep is not
  // a choice, and offering one would invite assignments the app then drops.
  const repNames = (reps || []).filter((r) => r.isActive).map((r) => r.name);
  const tierNames = sortList((tiers || []).filter((t) => t.isActive)).map((t) => t.name);

  const sheet = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS.map((c) => c.header)]);
  // Wide enough to read the headings without dragging every column out.
  sheet["!cols"] = TEMPLATE_COLUMNS.map((c) => ({ wch: Math.max(16, c.header.length + 4) }));
  XLSX.utils.book_append_sheet(wb, sheet, "customers");

  const notes = [
    ["Adding customers in bulk"],
    [""],
    ["Fill in one row per customer on the 'customers' tab, then import it with"],
    ["Settings → Add customers from a file."],
    [""],
    ["A customer already on your list is matched by name and has these fields"],
    ["updated. A blank cell leaves what you already have alone — it never"],
    ["clears it. Visits, reminders and calls are never touched."],
    [""],
    ["marketing_rep, tier and visit_every_weeks are dropdowns, limited to what"],
    ["already exists in the app. To use a new rep or tier, add it in the app"],
    ["first and download the template again."],
    [""],
    ["Column", "What it is"],
    ...TEMPLATE_COLUMNS.map((c) => [c.header, c.note]),
  ];
  const notesSheet = XLSX.utils.aoa_to_sheet(notes);
  notesSheet["!cols"] = [{ wch: 22 }, { wch: 78 }];
  XLSX.utils.book_append_sheet(wb, notesSheet, "how to fill this in");

  // The values the dropdowns point at. A sheet rather than an inline list:
  // inline lists are capped at 255 characters, which a dozen names can pass.
  const depth = Math.max(repNames.length, tierNames.length);
  const listRows = [["marketing_rep", "tier"]];
  for (let i = 0; i < depth; i++) listRows.push([repNames[i] || "", tierNames[i] || ""]);
  const listSheet = XLSX.utils.aoa_to_sheet(listRows);
  listSheet["!cols"] = [{ wch: 28 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, listSheet, "lists");

  // Written uncompressed so the worksheet part can be reopened and the
  // dropdowns added — the library cannot write them itself.
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx", compression: false });
  return addValidations(new Uint8Array(bytes), {
    rules: templateRules({
      columns: TEMPLATE_COLUMNS,
      reps: repNames,
      tiers: tierNames,
      minWeeks: MIN_WEEKS,
      maxWeeks: MAX_WEEKS,
    }),
  });
}

/** `visit-tracker-backup-2026-10-29.xlsx` — sorts by date in a folder listing. */
export const backupFilename = (ext = "xlsx", now = new Date()) =>
  `visit-tracker-backup-${todayIso(now)}.${ext}`;

/** Downloads the five tables as separate CSVs, matching the sheet tabs. */
export function downloadCsvs(customers, actions, reminders, reps, tiers) {
  const stamp = todayIso();
  triggerDownload(toCsv(customerAoA(customers)), `customers-${stamp}.csv`, "text/csv;charset=utf-8");
  triggerDownload(toCsv(actionAoA(actions)), `actions-${stamp}.csv`, "text/csv;charset=utf-8");
  triggerDownload(toCsv(reminderAoA(reminders, customers)), `reminders-${stamp}.csv`, "text/csv;charset=utf-8");
  triggerDownload(toCsv(repAoA(reps)), `reps-${stamp}.csv`, "text/csv;charset=utf-8");
  triggerDownload(toCsv(tierAoA(tiers)), `tiers-${stamp}.csv`, "text/csv;charset=utf-8");
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
