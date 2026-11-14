/**
 * Dropdowns in the bulk-add template.
 *
 * The point is that a spreadsheet filled in away from the app cannot invent a
 * rep or a tier. Typed free-hand, "Priya", "priya shah" and "P. Shah" are
 * three people by the time the file comes back; a dropdown makes that
 * impossible at the moment of typing rather than explaining it afterwards.
 *
 * Valid values live in their own sheet and the rules point at that range,
 * rather than being listed inline — an inline list is capped at 255 characters
 * in total, which a dozen rep names can exceed, and a range is also something
 * the person filling the sheet in can read.
 */
import { patchZipEntry } from "./xlsxZip.js";

const escapeXml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** 0 -> A, 25 -> Z, 26 -> AA. */
export function columnLetter(index) {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * One rule. `list` points at a range of allowed values; `whole` takes a
 * numeric span. Blanks are always allowed — every validated column here is
 * optional, and a rule that forbids empty would make the template unfillable.
 */
function ruleXml({ type, sqref, formula1, formula2, errorTitle, error, promptTitle, prompt }) {
  const attrs = [
    `type="${type}"`,
    'allowBlank="1"',
    'showInputMessage="1"',
    'showErrorMessage="1"',
    'errorStyle="stop"',
    type === "whole" ? 'operator="between"' : null,
    `errorTitle="${escapeXml(errorTitle)}"`,
    `error="${escapeXml(error)}"`,
    `promptTitle="${escapeXml(promptTitle)}"`,
    `prompt="${escapeXml(prompt)}"`,
    `sqref="${sqref}"`,
  ]
    .filter(Boolean)
    .join(" ");

  // NOTE: `showDropDown` is not set on purpose. The attribute is inverted in
  // the file format — setting it to 1 *hides* the arrow — so the dropdown
  // appears precisely by leaving it out.
  return (
    `<dataValidation ${attrs}>` +
    `<formula1>${escapeXml(formula1)}</formula1>` +
    (formula2 == null ? "" : `<formula2>${escapeXml(formula2)}</formula2>`) +
    `</dataValidation>`
  );
}

export function validationsXml(rules) {
  if (!rules.length) return "";
  return `<dataValidations count="${rules.length}">${rules.map(ruleXml).join("")}</dataValidations>`;
}

/**
 * Inserts the rules into a worksheet part.
 *
 * `dataValidations` has a fixed place in the worksheet schema — after the cell
 * data, before hyperlinks and page setup — so it goes straight after
 * `</sheetData>`. The template has no merged cells or conditional formatting,
 * which are the only things that would need to sit between the two.
 */
export function insertValidations(sheetXml, xml) {
  if (!xml) return sheetXml;
  const close = "</sheetData>";
  const at = sheetXml.indexOf(close);
  if (at < 0) throw new Error("Worksheet XML has no sheetData to anchor validation to");
  return sheetXml.slice(0, at + close.length) + xml + sheetXml.slice(at + close.length);
}

/** Applies rules to one worksheet inside a written `.xlsx`. */
export function addValidations(xlsxBytes, { sheetPath = "xl/worksheets/sheet1.xml", rules = [] } = {}) {
  const xml = validationsXml(rules);
  if (!xml) return xlsxBytes;
  return patchZipEntry(xlsxBytes, sheetPath, (sheetXml) => insertValidations(sheetXml, xml));
}

/**
 * The rules for the bulk-add template.
 *
 * A list with nothing in it gets no rule at all. A validation pointing at an
 * empty range rejects everything, which would leave a shop that has not set up
 * any reps yet unable to type one — exactly backwards.
 *
 * @param columns  the template's columns in order, so the letters follow the
 *                 sheet rather than being written down twice
 */
export function templateRules({ columns, reps = [], tiers = [], listSheet = "lists", rows = 1000, minWeeks = 1, maxWeeks = 52 }) {
  const letterOf = (key) => {
    const index = columns.findIndex((c) => c.key === key);
    return index < 0 ? null : columnLetter(index);
  };
  const span = (key) => {
    const letter = letterOf(key);
    return letter ? `${letter}2:${letter}${rows}` : null;
  };

  const rules = [];

  const repColumn = span("repName");
  if (repColumn && reps.length) {
    rules.push({
      type: "list",
      sqref: repColumn,
      formula1: `${listSheet}!$A$2:$A$${reps.length + 1}`,
      promptTitle: "Marketing rep",
      prompt: "Pick one of your reps, or leave blank.",
      errorTitle: "Not one of your reps",
      error: "Pick a name from the list, or leave the cell blank. Add new reps in the app first.",
    });
  }

  const tierColumn = span("tierName");
  if (tierColumn && tiers.length) {
    rules.push({
      type: "list",
      sqref: tierColumn,
      formula1: `${listSheet}!$B$2:$B$${tiers.length + 1}`,
      promptTitle: "Tier",
      prompt: "Pick one of your tiers, or leave blank.",
      errorTitle: "Not one of your tiers",
      error: "Pick a tier from the list, or leave the cell blank. Add new tiers in the app first.",
    });
  }

  const weeksColumn = span("visitEveryWeeks");
  if (weeksColumn) {
    rules.push({
      type: "whole",
      sqref: weeksColumn,
      formula1: String(minWeeks),
      formula2: String(maxWeeks),
      promptTitle: "How often they restock",
      prompt: `A whole number of weeks, ${minWeeks} to ${maxWeeks}. Blank uses the app default.`,
      errorTitle: "Not a number of weeks",
      error: `Enter a whole number between ${minWeeks} and ${maxWeeks}, or leave the cell blank.`,
    });
  }

  return rules;
}
