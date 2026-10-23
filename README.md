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

Three tables, whether they arrive as CSV files or Google Sheet tabs:

| table | columns |
|---|---|
| `customers` | customer_id, name, phone, initials, visit_every_weeks, last_call_date, last_call_reason, last_call_note, snoozed_until |
| `actions` | action_id, customer_id, visit_date, is_logged, logged_at |
| `reminders` | reminder_id, customer_id, customer_name, due_date, note |

**`customer_id` is the join key.** A stable number the app assigns and never
reuses — not derived from the name, so renaming a shop no longer orphans its
visits and reminders.

**A visit is an action row, not a cell.** Undoing or deleting one flips
`is_logged` to 0 rather than removing the row, so the log keeps a record of
what was tapped and what was taken back.

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
run, everything persists to `localStorage`, and Settings → Files exports the
three CSVs or a three-tab `.xlsx`.

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
public/data/          customers.csv, reminders.csv — the starting data
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
src/lib/sheets.js     the Apps Script client and row builders
src/lib/sync.js       outbox queue, flush-then-read
google-apps-script/   the sheet backend and its setup guide
src/components/       Avatar, Sheet, DayStepper, PinPad, the bottom sheets
src/screens/          StaffHome, PinGate, FollowUps, Customers, Detail, Add, Reports, VisitLog, Settings
src/App.jsx           data loading, state, navigation shell
scripts/              icon generator, seed-data generator, smoke tests
```

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

**Log** — the full visit history, grouped by day, with delete.

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

Only the first three are open by default; the rest collapse so the screen opens
on the work.

### Ordering: recoverable first, not worst first

Sorting by severity puts the write-offs on top. A retailer gone six months is
lost; one who missed a single week has probably just been busy, and a call will
bring them back. So the working list runs **fewest weeks missed first**, and
among equals the **most established customer** goes above — the biggest thing
still at risk.

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
