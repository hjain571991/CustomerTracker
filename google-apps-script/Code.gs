/**
 * Visit Tracker — Google Sheet backend.
 *
 * Paste this into Extensions → Apps Script on the spreadsheet you want to use,
 * then Deploy → New deployment → Web app, "Execute as: Me", "Who has access:
 * Anyone". Copy the /exec URL into the app under Settings → Google Sheet.
 *
 * The sheet is the database. Three tabs, created on first run:
 *   customers  customer_id, name, phone, initials, visit_every_weeks,
 *              last_call_date, last_call_reason, last_call_note, snoozed_until
 *   actions    action_id, customer_id, visit_date, is_logged, logged_at
 *   reminders  reminder_id, customer_id, customer_name, due_date, note
 *
 * Writes are append-or-update by id, never a wholesale rewrite, so a row you
 * edit by hand in the sheet is not clobbered by the app and vice versa.
 */

var SHARED_SECRET = ""; // optional: set the same string in the app's settings

// Bumped whenever this file changes. `ping` returns it, so you can tell at a
// glance whether the deployment is actually serving the code you just pasted —
// saving the editor does NOT republish the web app.
var SCRIPT_VERSION = 3;

var TABS = {
  customers: ["customer_id", "name", "phone", "initials", "visit_every_weeks",
              "last_call_date", "last_call_reason", "last_call_note", "snoozed_until"],
  actions: ["action_id", "customer_id", "visit_date", "is_logged", "logged_at"],
  reminders: ["reminder_id", "customer_id", "customer_name", "due_date", "note"]
};

/**
 * GET is the fallback the app uses when a browser blocks its POST. The whole
 * request arrives JSON-encoded in `?payload=`, so the two paths behave the same.
 */
function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.payload) {
    try {
      return handle(e, JSON.parse(params.payload));
    } catch (err) {
      return json({ ok: false, error: "payload was not JSON" });
    }
  }
  return handle(e, params);
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return json({ ok: false, error: "Body was not JSON" });
  }
  return handle(e, body);
}

function handle(e, payload) {
  try {
    if (SHARED_SECRET && payload.secret !== SHARED_SECRET) {
      return json({ ok: false, error: "Bad or missing secret" });
    }
    switch (payload.op) {
      case "read":    return json({ ok: true, data: readAll() });
      case "write":   return json({ ok: true, data: writeBatch(payload.changes || []) });
      case "replace": return json({ ok: true, data: replaceChunk(payload) });
      case "ping":    return json({ ok: true, data: { version: SCRIPT_VERSION, tabs: Object.keys(TABS) } });
      default:        return json({ ok: false, error: "Unknown op: " + payload.op });
    }
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- sheet helpers ---------------- */

function tab(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(TABS[name]);
    sheet.setFrozenRows(1);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(TABS[name]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Values as plain strings — dates must not come back as Date objects. */
function readTab(name) {
  var sheet = tab(name);
  var range = sheet.getDataRange();
  var values = range.getDisplayValues();
  if (values.length < 2) return [];
  var head = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = {};
    var blank = true;
    for (var j = 0; j < head.length; j++) {
      if (!head[j]) continue;
      row[head[j]] = values[i][j];
      if (String(values[i][j]).trim() !== "") blank = false;
    }
    if (!blank) rows.push(row);
  }
  return rows;
}

function readAll() {
  return {
    customers: readTab("customers"),
    actions: readTab("actions"),
    reminders: readTab("reminders"),
    readAt: new Date().toISOString()
  };
}

/**
 * Applies a list of {tab, key, row} changes. A row whose key already exists is
 * updated in place; anything else is appended. One lock around the whole batch
 * so two phones cannot interleave.
 */
function writeBatch(changes) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var applied = 0;
    for (var i = 0; i < changes.length; i++) {
      var change = changes[i];
      if (!TABS[change.tab]) continue;
      upsert(change.tab, change.key, change.row);
      applied++;
    }
    SpreadsheetApp.flush();
    return { applied: applied, readAt: new Date().toISOString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Bulk upload, one chunk at a time.
 *
 * A whole book is far too big for a single request, and upserting row by row
 * would take minutes. `start` clears the tab and lays down the header; every
 * chunk after that appends in one write.
 */
function replaceChunk(payload) {
  var name = payload.tab;
  if (!TABS[name]) throw new Error("Unknown tab: " + name);
  var rows = payload.rows || [];

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = tab(name);
    if (payload.mode === "start") {
      sheet.clear();
      sheet.appendRow(TABS[name]);
      sheet.setFrozenRows(1);
    }
    if (rows.length) {
      // One setValues beats appendRow per line by a wide margin.
      var width = TABS[name].length;
      var padded = rows.map(function (r) {
        var out = [];
        for (var i = 0; i < width; i++) out.push(r[i] === undefined || r[i] === null ? "" : r[i]);
        return out;
      });
      sheet.getRange(sheet.getLastRow() + 1, 1, padded.length, width).setValues(padded);
    }
    SpreadsheetApp.flush();
    return { tab: name, written: rows.length, total: sheet.getLastRow() - 1 };
  } finally {
    lock.releaseLock();
  }
}

function upsert(tabName, keyField, row) {
  var sheet = tab(tabName);
  var head = TABS[tabName];
  var keyIndex = head.indexOf(keyField);
  var ordered = head.map(function (col) {
    return row[col] === undefined || row[col] === null ? "" : row[col];
  });

  if (keyIndex >= 0 && String(row[keyField] || "") !== "") {
    var last = sheet.getLastRow();
    if (last > 1) {
      var keys = sheet.getRange(2, keyIndex + 1, last - 1, 1).getDisplayValues();
      for (var i = 0; i < keys.length; i++) {
        if (String(keys[i][0]).trim() === String(row[keyField]).trim()) {
          sheet.getRange(i + 2, 1, 1, head.length).setValues([ordered]);
          return;
        }
      }
    }
  }
  sheet.appendRow(ordered);
}
