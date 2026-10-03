/**
 * A small RFC 4180 CSV reader/writer.
 *
 * The app's own data files are CSV, and SheetJS is ~500 kB — far too much to
 * load on a shop phone just to boot. This covers the CSV path; the xlsx
 * library is imported lazily, only when someone actually picks a .xlsx file.
 */

/** Splits CSV text into rows of raw string cells. Handles quotes and CRLF. */
export function parseCsvRows(text) {
  const src = text.replace(/^﻿/, ""); // strip a BOM Excel may have written
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // A trailing newline shouldn't produce a phantom empty row.
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const c = src[i];

    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'; // an escaped quote
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"' && field === "") {
      quoted = true;
      i++;
    } else if (c === ",") {
      endField();
      i++;
    } else if (c === "\r" && src[i + 1] === "\n") {
      endRow();
      i += 2;
    } else if (c === "\n" || c === "\r") {
      endRow();
      i++;
    } else {
      field += c;
      i++;
    }
  }
  if (field !== "" || row.length) endRow();

  return rows;
}

/** CSV text to row objects keyed by the header row, like SheetJS's sheet_to_json. */
export function parseCsv(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = cells[i] === undefined ? "" : cells[i].trim();
    });
    return obj;
  });
}

/** Quotes a cell only when it has to be. */
function cell(value) {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows (arrays of values) to CSV text. */
export function toCsv(rows) {
  return rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";
}
