# Customer Visit Tracker

A shop-floor visit tracker. Staff tap a customer's face when they walk in; the
owner sees who has fallen out of rhythm and who promised to come in and didn't.

Runs as a website in Chrome and installs to the home screen on Android and iOS
as a PWA — one codebase, no app stores.

---

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
```

Vite prints a second `Network:` URL — open that on your phone (same Wi-Fi) to
try it on a real device.

```bash
npm test         # 93 logic checks + the spreadsheet pipeline
npm run build    # generates icons, then builds to dist/
npm run preview  # serve dist/ locally
```

### On a Databricks machine

Public registries are blocked, so a plain `npm install` fails with
`ECONNREFUSED`. This repo ships a gitignored `.npmrc` pointing npm at the
internal proxy (`go/npm-registry-access`):

```
registry=https://npm-proxy.cloud.databricks.com/
```

Two things follow from that:

- **`.npmrc` is gitignored on purpose.** The proxy hostname is internal and
  must not land in a public repo.
- **`package-lock.json` must be cleaned before committing.** npm writes the
  registry it used into all ~400 `resolved` URLs, which would both leak the
  internal hostname and break CI runners that cannot reach the proxy. Run:

  ```bash
  npm run clean-lock   # rewrites proxy URLs back to registry.npmjs.org
  ```

  Integrity hashes are unaffected — same tarballs — so the lockfile stays
  valid and portable. Run it after any `npm install`; it is a no-op elsewhere.

Anywhere without the block (CI, a personal machine), delete `.npmrc` and
`npm install` works normally.

**Owner PIN** is `1234` by default. Change it in the app: Owner View →
**Settings** → *Change owner PIN* (asks for the current PIN, then the new one
twice). That PIN is stored on the device and overrides everything else.

Precedence: PIN set in the app > `VITE_OWNER_PIN` at build time (see
`.env.example`) > the default `1234`. *Settings → Reset PIN to default* clears
the device PIN.

The gate keeps shop staff out of the owner screens on a shared phone. It is not
a security boundary: the check runs in the browser, and clearing the browser's
site data resets the PIN.

---

## The data lives in a spreadsheet

Five tables, whether they arrive as CSV files or Google Sheet tabs:

| table | columns |
|---|---|
| `customers` | customer_id, name, phone, company, marketing_rep_id, marketing_rep, tier_id, tier, initials, visit_every_weeks, last_call_date, last_call_reason, last_call_note, snoozed_until |
| `actions` | action_id, customer_id, visit_date, is_logged, logged_at |
| `reminders` | reminder_id, customer_id, customer_name, due_date, note, is_done |
| `reps` | rep_id, name, is_active |
| `tiers` | tier_id, name, rank, is_active |

**`customer_id` is the join key.** A stable number the app assigns and never
reuses — not derived from the name, so renaming a shop no longer orphans its
visits and reminders.

**A visit is an action row, not a cell.** Undoing or deleting one flips
`is_logged` to 0 rather than removing the row, so the log keeps a record of
what was tapped and what was taken back.

**A reminder ticked off is marked, not deleted.** `is_done` goes to 1 and the
row stays, which is what makes the completed list on the Reminders screen
possible.

**`marketing_rep_id` is the join to `reps`, and `tier_id` to `tiers`;** the name
beside each is there so the sheet reads sensibly to a human, and is rewritten
from the list whenever an entry is renamed. A name typed straight onto a
customer row with no matching list entry is adopted into the list on the next
read rather than dropped, so editing the sheet by hand still works.

**`rank` on `tiers` is the order of importance**, 1 first. It is renumbered to
be contiguous on every read, so a sheet with duplicate or missing ranks still
produces one unambiguous order — and a tier list with no `rank` column at all
is taken in the order the rows appear, not alphabetically.

### Google Sheet as the database

Set up in five minutes — see [`google-apps-script/README.md`](google-apps-script/README.md).
An Apps Script web app deployed from the sheet gives the app a URL to call, so
there is no backend to host, no Google Cloud project, and **staff never sign
into anything**.

Once connected:

- every tap, call, reminder and new customer is written to the sheet
- the write is queued and sent in the background, so the screen never waits
- queued changes survive being offline and go up on the next sync
- the app re-reads the sheet on open, on returning to the foreground, when the
  connection returns, and on demand
- writes are per row, so a cell you edit by hand is not clobbered

Settings → Google Sheet shows the connection, how many changes are waiting, and
a Sync button.

### Without a sheet

The app still works entirely on the device. `public/data/*.csv` seed the first
run, everything persists to `localStorage`, and Settings → Backup writes the
whole book to one `.xlsx` (see [Backups](#backups)).

Header matching stays forgiving: case, spaces, underscores and synonyms all
resolve (`Customer Name`, `mobile`, `frequency`). Dates may be `2026-09-05` or
`05/09/2026`. A sheet with no `actions` tab falls back to packed `visit_dates`
cells, so older exports still open.

### Why dates, not "days ago"

The original prototype stored `visits: [2, 16, 29]` — days ago. That is fine
for a mock-up and wrong by morning. The CSVs hold real calendar dates and the
app converts to days-ago at render time, so the sample data is still correct
next week.

`npm run seed` regenerates the sample CSVs anchored to today, for when the
demo data has aged and everyone looks overdue. Real deployments never run it.

### Where logged visits go

Taps are written to `localStorage` immediately, so a reload or a dead spot in
the Wi-Fi never loses a visit. The seed CSVs are read **only on a genuinely
first run** — after that the device's own copy wins. *Data → Reset to the
shipped file* throws the local copy away and re-reads the CSVs.

Storage is per-device and per-browser by design — this build targets a single
phone or a single browser. Two devices would not see each other's taps; if that
ever changes, the Data screen's export/import is the manual hand-off and a
shared backend would be the real answer.

---

## Deploying free

`npm run build` produces a static `dist/` with relative asset URLs, so the same
output works at a domain root or under a sub-path with no rebuild.

### Vercel — simplest (recommended)

```bash
npx vercel login
npx vercel --prod
```

(`npx` inherits the npm registry setting, so it works behind the proxy too.)

Accept the defaults; `vercel.json` already sets the build command, output
directory and cache headers. You get `https://<project>.vercel.app` on the free
Hobby plan.

### Netlify

```bash
npx netlify-cli login
npx netlify deploy --prod
```

`netlify.toml` supplies the build settings. Or drag the `dist/` folder onto
<https://app.netlify.com/drop> for an instant no-account-needed URL.

### GitHub Pages

Push to GitHub, then **Settings → Pages → Source: GitHub Actions**. The
workflow in `.github/workflows/deploy.yml` builds and publishes on every push
to `main`, and copies `index.html` to `404.html` so deep links resolve.

All three are free for this size of app and all three serve HTTPS, which a PWA
requires.

---

## Fitting every screen

The app began as a phone screen and still is one on a phone. Three things make
it behave everywhere else.

**The hardware's own furniture.** An installed iOS app draws edge to edge —
`viewport-fit=cover` plus a translucent status bar — so without allowing for it
the header sits underneath the clock and the bottom tabs sit under the home
indicator. The frame reserves all four insets:

```css
--safe-top: env(safe-area-inset-top, 0px);   /* and right / bottom / left */
```

They are named as variables rather than used inline so the fallback lives in
one place, and so a test can stand in a notch that no desktop browser has.

**The viewport that moves.** iOS Safari's `100vh` is the height the page
*would* have with the address bar hidden, so a `vh`-sized app hangs off the
bottom until you scroll. The frame is `100vh` then `100dvh` — a cascade, which
is why that one rule is a CSS class and not an inline style: a browser without
`dvh` keeps the first line, and the body is `position: fixed` so the page
itself never scrolls, only the app's own panes.

**Growing into the space.** On an iPad or a desktop browser a 460px column
stranded in a 1440px window wastes most of the screen, so the shell opens out,
the gutters widen, and every list reflows into as many columns as fit:

| window | shell | gutter | lists |
|---|---|---|---|
| phone (<700px) | full width | 16px | one column |
| tablet (700–1099px) | 860px | 24px | two columns |
| desktop (≥1100px) | 1200px | 32px | three or more |

Breakpoints are on the *window*, not the device: a desktop browser dragged
narrow behaves like a phone, because at that width it is one. Grid columns use
`minmax(min(100%, 340px), 1fr)`, and the `min()` is what stops a 340px minimum
overflowing a 320px phone.

Forms and the customer detail stay a readable column however wide the window
gets — a form is read line by line, and stretching one to 1200px helps nobody.
The bottom sheets and the tab bar centre themselves for the same reason.

---

## Installing it on a phone

The deployed URL is the app. No store, no build per platform.

- **Android / Chrome** — open the URL, then the ⋮ menu → *Install app* (or
  *Add to Home screen*). It launches full-screen with its own icon.
- **iOS / Safari** — open the URL, tap **Share** → *Add to Home Screen*.
  Safari is the only iOS browser that can do this; Chrome on iOS cannot.
- **Desktop Chrome / Edge** — an install icon appears in the address bar.

Once installed it works offline: the app shell, the icons and the fonts are
service-worker cached, and the customer data is already on the device.

---

## Project layout

```
public/data/          customers.csv, actions.csv, reminders.csv, reps.csv,
                      tiers.csv — the starting data
public/icons/         generated PWA icons (do not edit; see scripts/)
src/theme.js          colour tokens and status definitions
src/lib/dates.js      ISO dates <-> days-ago; forgiving spreadsheet date parsing
src/lib/analytics.js  visit rhythm: status, average gap, regularity, promises
src/lib/csv.js        small RFC-4180 CSV reader/writer (keeps SheetJS off boot)
src/lib/dataSource.js CSV/XLSX in and out
src/lib/storage.js    localStorage persistence
src/lib/pin.js        owner PIN: precedence, storage, validation
src/lib/settings.js   default restock cadence
src/lib/weeks.js      Mon-Sat trading weeks; the unit everything is measured in
src/lib/followups.js  who to ring, in the order worth ringing them
src/lib/visits.js     adding and removing a visit; the undo rules
src/lib/visitLog.js   every visit flattened and grouped by day
src/lib/visitCounts.js how many visits in the last 4 weeks / 3 / 6 / 12 months
src/lib/reports.js    book-wide: visit counts per customer, churn reasons
src/lib/lookups.js    the shared machinery behind the owner's short lists
src/lib/reps.js       the marketing-rep list, and customers-per-rep with status
src/lib/tiers.js      customer tiers: the order, and the call-list tie-break
src/lib/reminders.js  every reminder grouped into overdue/today/upcoming/done
src/lib/layout.js     breakpoints, gutters and the reflowing card grid
src/lib/printReports.js  the per-rep call sheets and round sheets
src/lib/whatsapp.js   turning a shop's phone number into a wa.me link
src/lib/importCustomers.js  planning a bulk add: what it would change, before it does
src/lib/xlsxZip.js    just enough ZIP to reopen an .xlsx and edit one part
src/lib/xlsxValidation.js  the template's dropdowns, which SheetJS cannot write
src/lib/collapsed.js  which call-list sections are folded away
src/lib/sheets.js     the Apps Script client and row builders
src/lib/sync.js       outbox queue, flush-then-read
google-apps-script/   the sheet backend and its setup guide
src/components/       Avatar, Sheet, DayStepper, PinPad, SearchField, DateRange,
                      Segmented, ManagedList, RepPicker, TierPicker, TierBadge,
                      Calendar, PrintSheets, ImportPreviewSheet, the bottom sheets
src/screens/          StaffHome, PinGate, FollowUps, Reminders, Customers, Detail,
                      Add, EditCustomer, Reports, VisitLog, Settings
src/App.jsx           data loading, state, navigation shell
scripts/              icon generator, seed-data generator, smoke tests
```

## Searching

Every list screen searches, and they all match more than the name:

| screen | matches |
|---|---|
| Staff home | name, company, phone |
| Customers | name, company, phone, rep |
| Customers → By rep | representative |
| Reminders | customer name, phone, note — plus a due-date range |
| Reports → Visits | name, phone |
| Reports → Log | name, phone — plus a visit-date range |

The staff screen's wall is **A–Z**, in two groups: everyone who has not been in
today, then — dimmed, below a heading — everyone already logged today. It is
alphabetical because the screen is used with a customer standing at the
counter, so you are looking for one known name rather than browsing; and
today's taps sink because once somebody is logged they are dealt with, leaving
the work still outstanding at the top. The heading only appears once the first
customer has been tapped in, and the whole thing resets itself overnight with
no state to manage. A dimmed card is still fully tappable — a second tap the
same day changes nothing.

The staff screen's box clears with a button rather than only the backspace key:
it is used one-handed with a customer standing at the counter, and a dead end
there is worse than a dead end anywhere else in the app — so an empty result
offers *Show everyone* rather than leaving you stuck.

---

## How a customer's status is worked out

**You set the cadence; the app measures against trading weeks.** Nothing is inferred.

The shop trades **Monday to Saturday**, shut Sunday. Each customer restocks
every N weeks — `visit_every_weeks` in the sheet, or the picker on their detail
screen. A visit any day inside the window counts.

- **On track** — their week has not come round yet
- **Due this week** — it is their week; they have until Saturday
- **Missed N weeks** — the week closed without them
- **Never visited** — nothing on record to measure from

The week still running is never counted as missed, so the same customer reads
"Due this week" on Saturday and "Missed 1 week" on Monday. **Monday morning is
when the call list appears.**

### Why not infer the cadence from visit history?

An earlier version averaged the gaps between visits and flagged people at 1.6x
their own average. Two things were wrong with it:

- **It normalised the decline it was meant to catch.** A customer drifting from
  weekly to fortnightly drags their own average up with them, and after a few
  months looks "on track".
- **Single-visit customers were invisible.** With fewer than two visits there
  was no average, so they were labelled "New" permanently.

Moving from rolling days to trading weeks also removed a lot of false alarms —
on the sample book it turned 35 "overdue" customers into 26 genuinely missed
plus 11 who simply have the rest of the week to show up.

The observed average is still shown on the detail screen — as a *reality check*
against the cadence ("they actually average 11 days"), not as the thing that
decides the status.

---

## India specifics

- **Trading week is Mon–Sat, Sunday closed** — the unit the whole cadence model
  is built on.
- **Dates display day-first**, pinned to `en-IN` rather than following the
  device. A handset left on a US default would otherwise show "Oct 3" beside
  another showing "3 Oct".
- **Date entry accepts day-first** — `05/09/2026` is 5 September, as are ISO
  dates and real Excel date cells.
- **The custom date range uses named months**, not `<input type="date">`,
  whose MM/DD vs DD/MM rendering follows the *browser* locale and cannot be
  overridden. `3 Aug 2025` cannot be misread on any device.
- **All date arithmetic uses local calendar parts**, never UTC, so IST is safe.
  The suite is run under `TZ=Asia/Kolkata` as well as UTC+14 and UTC−11.
- **Devanagari and Gujarati names** work through import, storage, export and
  initials (राजेश ट्रेडर्स → रट). The bundled fonts are Latin-only, so those
  names fall back to the device font — legible on Android, just a different
  typeface. Add a Noto subset if that matters.
- **Offline-first** — the app shell and the customer list are cached, so a
  patchy connection in the shop does not stop anyone logging a visit.

---

## Reports

Book-wide views, where the per-customer screens only answer one customer at a
time. A period applies across them: 4 weeks / 3 / 6 / 12 months, or **Custom** with
your own from/to dates.

The custom from-date is floored at the oldest visit anywhere in the book, and
the to-date at today. Both native pickers get `min`/`max` so out-of-range days
are greyed out, and every change is clamped again in case one is typed —
including a back-to-front range. A window that starts before there was
anything to record can only produce a misleading zero.

**Visits** — every customer with their count for the period, sortable most or
fewest first. Customers with **zero** visits are kept, not filtered out: on the
fewest-first sort they are the whole point. Counts are marked *partial* where
the window reaches back further than that customer's records.

**Why they stopped** — the call reasons, each **split by whether the call
worked**. A customer lost on price and one who was matched on price and came
back would otherwise file identically, which is the opposite of useful. The
split says which objections a phone call can still recover:

```
Not now          2 back · 3 not     5
No answer        1 back · 1 not     2
Price            1 back · 1 not     2
Unhappy          1 back · 0 not     1
```

"Came back" means a visit dated after the call — the only hard evidence that
ringing them changed anything. Expanding a reason lists both groups with the
notes you took. A reason nobody gave has **no** recovery rate rather than a
fake 0%.

Only the **most recent call per customer** is stored, so this counts people,
not calls. A customer rung twice contributes their latest reason once. Storing
every call would need a third sheet.

**Log** — the full visit history, grouped by day, with delete. **Search by
date** opens a from/to pair bounded by the records; setting both ends to the
same day searches that one date. A range is an explicit choice of period, so it
replaces the rolling 30-day window rather than narrowing it — asking for last
March and getting nothing because it falls outside the last month would be a
bug, not a filter.

---

## Editing a customer

**Customers → a customer → Edit** opens the whole record: name, phone, company,
marketing rep, tier, the initials on the badge, and the restock cadence. It is a form
with a Save button rather than a screen of live controls — correcting a misspelt
name usually means changing two or three things and confirming, and leaving by
the back arrow discards.

The initials follow the name automatically, but stop doing so the moment you
type your own. The last recorded call can be cleared here, which is the only
place it can be: *Record a call* can overwrite the last one but never remove a
call logged against the wrong shop.

**Visits are not editable here.** They are an append-only log of what was
tapped, corrected by deleting the specific entry in **Reports → Log** — which
keeps the audit trail honest in a way a free-text field would not.

---

## Customer tiers

Some retailers matter more than others. **Settings → Customer tiers** is a list
you maintain — call them A/B/C, Key/Regular/Occasional, whatever you already
say out loud — and the arrows set the order, which is the only part of a tier
the app actually reads. Grading a customer is optional, on both the Add and
Edit forms.

**A tier breaks ties on the call list, and only ties.** It does not change
whether a customer is overdue, which group they land in, or how often they are
expected — those come from their own visit rhythm. Where two customers are
equally worth ringing, the higher tier goes first:

```
STILL AWAY
  Patel & Sons      [Key account]   missed 2 weeks · 9 visits
  Verma Brothers    [Regular]       missed 2 weeks · 9 visits   ← same facts,
  Gold Ornaments                    missed 2 weeks · 9 visits     tier decides
  Sri Jewellers     [Key account]   missed 6 weeks · 4 visits   ← further gone,
                                                                  still below
```

That restraint is the point. Letting importance outrank recoverability would
push a top customer up the list on reputation while burying one who is
genuinely further gone — and a key account quietly drifting away is exactly
what this app exists to catch, so it must never be flattered by its own grade.

**Ungraded is not the same as lowest.** A customer nobody has got round to
classifying sorts *after* everyone with a tier, including the bottom one —
sorting them as least important would be inventing a judgement nobody made.

Removing a tier deactivates it; customers stay on it and keep a readable name,
and **reassign** moves them in one go. The order renumbers itself to stay
contiguous, so there is never a hole where a tier used to be.

---

## Adding customers in bulk

**Settings → Add customers in bulk** is the one to use for a batch of new
shops. Two steps:

1. **Download the template** — a blank `.xlsx` with the right columns, an
   instructions tab, and **dropdowns** on the three columns that have a right
   answer:

   | column | accepts |
   |---|---|
   | `marketing_rep` | only your reps, from a list |
   | `tier` | only your tiers, from a list |
   | `visit_every_weeks` | a whole number of weeks, 1–52 |

   All three still accept blank, because all three are optional. Typed
   free-hand, "Priya", "priya shah" and "P. Shah" are three people by the time
   the file comes back; a dropdown makes that impossible as it is typed rather
   than explaining it afterwards. To use a rep or tier you do not have yet, add
   it in the app and download the template again.
2. **Add customers from a file** — fill in one row per customer and feed it
   back.

| column | |
|---|---|
| `name` | required |
| `phone` `company` `marketing_rep` `tier` `visit_every_weeks` | all optional |

It **merges**; it does not replace. Three rules:

- Rows match existing customers **by name**, folded for case and spacing, so
  `  patel   &   sons ` finds *Patel & Sons*. There is no id column — asking
  somebody to look up internal ids to add a customer is how spreadsheets go
  wrong.
- A **blank cell says nothing**. It never clears what you already have; only a
  value actually present can change anything.
- **Visits, reminders, calls and snoozes are never touched.** The file is a
  list of customers, not a record of what happened to them.

A rep or tier the file introduces is still created automatically — the
template's dropdowns mean that will not happen from a template, but any other
spreadsheet can still bring one in. A new tier goes last in the order, because
you rank your tiers deliberately and a spreadsheet does not get a say.

Nothing is written until you have seen the plan:

```
From new-customers.xlsx — 10 rows read

 8 new customers
   Bulk Shop 1 · Bulk 1 Ltd · 9800000010 · Wholesale · Kiran Patel
   …
 1 already on your list is updated
   Laxmi Gold House · rep
 Added to your lists
   Kiran Patel · new marketing rep
   Wholesale · new tier, placed last in the order

 1 row matches what you already have and is left alone.

        [ Cancel ]        [ Add 8, update 1 ]
```

> **Not to be confused with *Import spreadsheet*** under Files, which replaces
> the entire book — right for moving a whole book in, catastrophic for "here
> are ten new shops".

### If you keep a Google Sheet

You can also just type the rows into the sheet's `customers` tab. Leave
`customer_id` blank and the app assigns one on the next sync; a rep or tier
name typed straight into those columns is adopted the same way.

---

## Backups

**Settings → Back up everything now** writes one dated `.xlsx` —
`visit-tracker-backup-2026-10-29.xlsx` — holding every table *and* your
settings:

| tab | what it holds |
|---|---|
| `customers` `actions` `reminders` `reps` `tiers` | the whole book |
| `meta` | the backup format, when it was taken, and your saved settings |

**Restore from a backup** reads it straight back and puts the app exactly as it
was — including the default cadence, the rep list and the tier order. The round
trip is lossless, and tested as such: `npm test` writes a backup of the sample
book, reads it back, and compares every field on every customer.

Open it in Excel or upload it to Google Sheets to read, since it is an ordinary
spreadsheet. **Import spreadsheet** still takes any sheet; the difference is
only that a backup also carries the `meta` tab, so restoring from one puts the
settings back too and importing an ordinary sheet leaves them alone.

Take one before anything risky — *Reset to the shipped file* says as much — and
keep it somewhere that isn't the phone.

---

## Printing a round

**Customers → By rep → Print** produces one sheet per representative, to hand
over. Two documents, because they answer two different questions:

| sheet | what it is |
|---|---|
| **Follow-ups** | Who to call, grouped the way the call list groups them, with a tick box and ruled space to write down what each customer said. The sheet that comes back marked up. |
| **Their list** | That rep's whole book, one line each — a round sheet, not a call sheet. |

Print everyone at once and each rep starts on a fresh sheet of paper, so the
stack tears apart; or pick one rep. Customers with **no** rep get their own
sheet too — they still need ringing, and leaving them off paper is how they get
forgotten. A rep with nobody to call prints nothing rather than a blank page.

A call sheet carries what the conversation needs: the name, tier and number,
the company, how overdue they are against their own cadence, how many visits
they have made, how regular they are, and what they said last time they were
rung.

```
Priya Shah                                        31 Oct 2026
Follow-ups · 12 to call of 20 customers
═════════════════════════════════════════════════════════════
MISSED LAST WEEK · 1
☐  Patel & Sons  [Key account]  9811122334        WHAT THEY SAID
   Patel Enterprises · Missed 4 weeks · weekly    ______________
   · last in 40 days ago · 4 visits · irregular   ______________
   Last call 23 Oct — Price: "Zaveri Bazaar is cheaper"
```

The sheet is its own white, black-on-paper document, not a screenshot of the
dark app — printing that would empty a cartridge and still be hard to read. It
is the same markup on screen and on paper, so the preview is honest about what
comes out of the printer. Customers are never split across a page break.

---

## Marketing representatives

Who looks after each retailer. Maintained as a list under **Settings →
Marketing representatives** and offered as a dropdown when adding or editing a
customer, rather than typed free-hand: left as free text, "Priya Shah", "priya"
and "P. Shah" become three people, and counting customers per rep is the only
reason the field exists.

**Customers → By rep** answers the question the field was added for. Each rep is
one row: how many retailers are on them, and how those retailers are doing —

```
Priya Shah        2 missed       24 customers
  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇░░░░
Anil Kumar        5 missed       16 customers
Unassigned        1 missed       10 customers
```

The count is what gets asked for; the split is what is worth knowing. Forty
retailers with fifteen missed is a different conversation to forty on track.
Searching narrows to one rep, and expanding a row lists the retailers behind
the number with their status.

Removing a rep marks them inactive rather than deleting them. Their customers
stay assigned — those retailers still belong to somebody until the owner says
otherwise, and silently emptying the field on forty rows because someone left
is the kind of data loss nobody notices until the report is wrong. The rep's
row keeps showing in the report for as long as anyone is on it, and **reassign**
moves them in one go.

---

## Reminders

**Follow-ups → All reminders** is every reminder ever set, grouped into
**overdue**, **due today**, **upcoming** and **completed**. The call list beside
it stays what it always was — only today's work — because that is what makes it
usable on a Monday morning.

Anything on the screen can be edited: the due date, the note, whether it is
done. Editing picks an absolute date rather than "in N days", because changing
a reminder is almost always "not Tuesday, the 14th" — and counting forward from
today for something already overdue would mean counting backwards.

**Ticking one off marks it done; it does not delete it.** The sheet always kept
the row, and "I rang them about the Diwali order three weeks ago" is worth
holding on to. Completed reminders can be hidden, searched and date-filtered,
and put back if one was ticked by mistake. Deleting is still there for a
reminder that should never have existed — like a removed customer, the sheet
keeps the row and a blanked due date is what marks it gone.

---

## Logging a visit for an earlier day

The clock icon on a staff card opens **When did they come in?** — yesterday and
the day before as one tap each, with their real dates shown, then a calendar
for anything older.

It asks for a *date*, not a countdown. The old picker offered "17 days ago",
which is the wrong question to put to somebody who remembers when a customer
came in rather than how many sleeps have passed since — every use of it was a
small arithmetic puzzle. `logVisit` now takes the day itself for the same
reason.

Weeks run Monday-first, matching the trading week, with Sunday dimmed at the
end of the row because that is the day the shop is shut. Days already recorded
are marked with a green dot rather than disabled — tapping one is a harmless
no-op, and seeing which days are already down is what stops the same visit
being logged twice. Nothing after today can be picked, and the calendar reaches
twelve months back: far enough to fix anything anyone actually remembers, short
enough that a stray tap cannot land a visit in a year nobody is thinking about.

---

## Undoing a mis-tap

Two routes, because they catch different mistakes:

**Undo bar (staff, immediate).** Logging a visit raises a bar at the bottom for
8 seconds — *"Rajesh Traders logged · Undo"*. Mis-taps on a wall of faces come
in bursts, so it is a stack: three wrong taps read *"3 visits logged"* and each
press steps back one, newest first. Never "undo all" — some of a burst is
usually deliberate. Staff have no PIN, so without this they could not fix their
own slip at all.

A second tap on the same face the same day records nothing (visit dates are
unique), so it offers no undo — pressing one would delete the morning's genuine
visit. It says *"already logged for that day"* instead.

**Visit log (owner, later).** **Reports → Log** lists every visit recorded,
grouped by day, newest first, with search and a 30-day window. Delete any entry
with confirmation. This is the one that catches a mistake nobody noticed on the
day, which undo can never reach. It sits behind the PIN like the rest of owner
view; the staff screen has no route to it.

---

## The follow-up screen

Answers one question: **who am I losing, and what did I learn when I rang them?**

Sections are facts rather than invented thresholds — "missed last week" is the
week that just closed, and "never came back" is a customer who never
established a pattern at all:

| section | what it holds |
|---|---|
| **Reminders you set** | notes-to-self that are due |
| **Missed last week** | one closed week missed — most recoverable |
| **Still away** | two or more, **least time away first** |
| **Came back after your call** | they returned after you rang — the win |
| **Called this week** | already actioned, with what they said |
| **Snoozed** | out of sight until the weeks run out |
| **Never came back** | one or two visits, then gone — a different conversation |

**Every section folds.** The first three open by default, so the screen still
lands on today's work with no taps; the rest start folded. On a long Monday
"Still away" can run to forty cards, which buries the two people who only
missed last week — being able to put it away is the difference between a list
you work through and one you scroll past. Folded, the screen becomes a summary:

```
 › REMINDERS YOU SET  6
 › MISSED LAST WEEK   4
 › STILL AWAY        25
 › CAME BACK          5
 › SNOOZED            2
 › NEVER CAME BACK    7
```

The count stays on the header, so a folded section still says how much is
behind it and nothing vanishes quietly. Folds are **remembered** — the screen
unmounts whenever you tap into a customer, and re-expanding everything on the
way back would make folding pointless. Only sections you have actually touched
are stored, so one added in a later version arrives as it was designed to
rather than inheriting whatever was in storage.

### Ordering: recoverable first, not worst first

Sorting by severity puts the write-offs on top. A retailer gone six months is
lost; one who missed a single week has probably just been busy, and a call will
bring them back. So the working list runs **fewest weeks missed first**, and
among equals the **most established customer** goes above — the biggest thing
still at risk.

### WhatsApp

Every row on the call list and on the reminders list carries a **WhatsApp**
button, and so does the customer detail screen — beside *Record a call*. It
opens the chat with that customer.

It opens the chat rather than placing a call because that is the only thing a
link can do: WhatsApp publishes no URL that starts a voice call, so the button
says WhatsApp rather than Call and the call is one tap away once the chat is
open.

Numbers are stored the way a shop writes them — ten digits, no country code —
and `wa.me` needs the full international number, so **+91** is added. A number
that already carries a country code keeps the one it has: prefixing 91 onto a
Dubai number would link to a stranger. A trunk zero is dropped, and a number
that cannot be made into a usable one shows no button at all rather than a dead
one.

```
9820011223        →  wa.me/919820011223
+971 50 123 4567  →  wa.me/971501234567
00 91 98200 11223 →  wa.me/919820011223
12345             →  no button
```

---

### Two actions

- **Called** → pick what they said: *Price · Not now · Unhappy · Bad customer
  service · No answer*, plus an optional note. They drop off this week's list
  and return next week if they still have not come in.
- **Snooze** → 1, 2 or 4 weeks out of sight.

The reason set is fixed on purpose. Free text cannot be counted, and counting
is the point: "four left on price this quarter" is a pricing decision. Reasons
round-trip through the spreadsheet in `last_call_reason` / `last_call_note`.

There is deliberately **no dialling** — the app does not place calls or link to
the phone. You ring them however you like and mark what happened.
