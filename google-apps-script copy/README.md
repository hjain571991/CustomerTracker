# Connect the app to a Google Sheet

About ten minutes, done once. **It is free** — see the bottom of this page.

You do **not** need: a credit card, a Google Cloud account, an API key, or a
Google login on the shop phones.

---

## Step 1 — Make a new Google Sheet

1. Go to **sheets.google.com**
2. Click the **+ Blank spreadsheet**
3. Name it something like `Visit Tracker Data` (top-left corner)

Leave it empty. The app creates the tabs and headings for you later.

## Step 2 — Open the script editor

In that sheet, click **Extensions** → **Apps Script**.

A new tab opens with a code editor. It already has a few lines that say
`function myFunction() { }`.

## Step 3 — Paste in the code

1. **Select all** the code that is already there and **delete it**
2. Open the file `google-apps-script/Code.gs` from this project
3. Copy **everything** in it
4. Paste it into the empty editor
5. Press **Ctrl + S** (Windows) or **Cmd + S** (Mac) to save

## Step 4 — Publish it

1. Click the blue **Deploy** button (top right) → **New deployment**
2. Click the **gear icon ⚙** next to "Select type" → choose **Web app**
3. Fill the form:
   - **Description** — anything, e.g. `v1`
   - **Execute as** — **Me**
   - **Who has access** — **Anyone**  ← this one matters
4. Click **Deploy**

> **"Who has access: Anyone"** sounds alarming. It means anyone who *knows the
> secret URL* can reach it. It does not list your sheet publicly or put it in
> search results. More on this at the bottom.

## Step 5 — Give it permission

Google now asks you to approve the script. This part looks scary and is normal.

1. Click **Authorize access**
2. Choose your Google account
3. You will see **"Google hasn't verified this app"**
4. Click **Advanced** (small link, bottom left)
5. Click **Go to (your project name) (unsafe)**
6. Click **Allow**

That warning appears because *you* wrote this script and it was never submitted
to Google for review. It is your own code running on your own sheet.

## Step 6 — Copy the link

After deploying you get a **Web app URL**. It looks like:

```
https://script.google.com/macros/s/AKfycbx...../exec
```

Click **Copy**. Make sure it ends in **`/exec`** and not `/dev`.

## Step 7 — Paste it into the app

1. Open the app, go to **Owner view** (lock icon → your PIN)
2. **Settings** tab → the **GOOGLE SHEET** box at the top
3. Paste the URL
4. Tap **Test & save**

You should see **"Connected. The sheet answered."**

Go back to your Google Sheet and you will now see three tabs:
**customers**, **actions**, **reminders**.

## Step 8 — Put your existing data in

If you already have customers in the app:

1. **Settings** → **Export as Excel**
2. Open the downloaded file
3. Copy each sheet into the matching tab in your Google Sheet

Keep the heading row exactly as it is. The app matches on those names.

---

## Is it free?

**Yes. There is no bill and no card to enter.**

| | cost |
|---|---|
| Google Sheet | Free. Counts towards the 15 GB free Google Drive space, and this sheet is a few hundred kilobytes. |
| Apps Script | Free. There is no paid tier to accidentally fall into. |
| Vercel hosting for the app | Free on the Hobby plan. |

**Limits rather than costs.** A free Google account has daily caps on how much
a script may run. They are generous — a shop logging a few hundred taps a day
is nowhere near them. Google publishes the current figures at
*developers.google.com/apps-script/guides/services/quotas*; worth a glance, but
you are very unlikely to notice them.

**How big can the sheet get?** A Google Sheet holds up to 10 million cells. The
`actions` tab uses 5 cells per visit. At 60 customers visiting weekly that is
about 15,000 cells a year — so roughly a lifetime of trading before it matters.

---

## How it behaves once connected

- Every tap, call, reminder and new customer is written to the sheet
- The write happens **in the background**, so the screen never waits
- **Offline is fine** — changes queue on the phone and go up on the next sync.
  Settings shows how many are waiting.
- The app **re-reads the sheet** when you open it, when you switch back to it,
  when the internet returns, and when you tap **Sync**
- Writes update **one row at a time**, so a cell you edit by hand in the sheet
  is not wiped by the app
- **Nothing is deleted.** Undoing a visit sets `is_logged` to 0; ticking off a
  reminder sets `is_done`; removing a representative or a tier sets
  `is_active` to 0. The history stays.
- **The sheet is not your backup.** It is the live copy, so a mistake syncs to
  it like anything else. Take a real backup from Settings → *Back up
  everything now* as well.

## The five tabs

| tab | what each row is |
|---|---|
| `customers` | one shop |
| `actions` | one visit — this is your action log |
| `reminders` | one note-to-self to call someone |
| `reps` | one marketing representative |
| `tiers` | one customer tier, in order of importance |

`customer_id` links the first three. It is a number the app assigns and never
reuses, so renaming a shop does not break its visits or reminders.
`marketing_rep_id` and `tier_id` link a shop to its representative and its tier
in the same way — rename either in the app and every one of their rows is
updated.

You can type a name straight into the `marketing_rep` or `tier` column without
touching the `reps` or `tiers` tab. The app adds anything it finds there to the
list on the next read, so editing by hand never loses the assignment.

On `tiers`, **`rank` is the order of importance** — 1 is the most important.
The app renumbers it to run 1, 2, 3… on every read, so you can leave gaps or
duplicates and it will still produce one clear order. A `tiers` tab with no
`rank` column is read top to bottom.

---

## Updating the script later

The sheet's script does **not** update when this project does. If the app says
the script is out of date, or a new field never appears in the sheet:

1. Open the sheet → **Extensions** → **Apps Script**
2. Select all, delete, and paste in the latest `Code.gs` again
3. **Save**, then — this is the step everyone misses — **Deploy** → **Manage
   deployments** → the **✏ pencil** → **Version: New version** → **Deploy**

Saving the editor does *not* republish the web app. Settings → Google Sheet →
**Test** shows the version actually being served, so you can tell at a glance
whether the redeploy took.

**Nothing is lost by updating.** New columns are appended to the tabs that need
them, and rows are written against whatever headings your sheet actually has —
so existing data, and any extra columns of your own, stay exactly where they
are.

| script version | added |
|---|---|
| 5 | the `tiers` tab, and `tier_id` / `tier` on customers |
| 4 | the `reps` tab, `company` / `marketing_rep_id` / `marketing_rep` on customers, `is_done` on reminders |
| 3 | bulk upload in chunks |

---

## About "Anyone" access

Anyone who **has the URL** can read and change your sheet. The URL is long and
unguessable, but treat it like a password: do not post it anywhere public.

For a little more: open `Code.gs`, set `SHARED_SECRET = "somethingOnlyYouKnow"`
near the top, redeploy, and enter the same text in the app's Settings box. Both
values still live on the phone, so this is a deterrent rather than real
security — about the same strength as the owner PIN.

Don't keep anything sensitive in this sheet.

**To shut it off:** Deploy → Manage deployments → **Archive**.

---

## If something goes wrong

The app shows the actual reason under the Test & save button. Match it here:

| message | what it means |
|---|---|
| *"That does not look like an Apps Script web app URL"* | The URL must end in **`/exec`**. The `/dev` one needs a Google login and will never work. |
| *'The script is not published to "Anyone"'* | Deploy → Manage deployments → ✏ → **Who has access: Anyone** → Deploy. |
| *"not JSON — check the URL ends in /exec"* | Usually the `/dev` URL, or the deployment was never authorised. |
| *"Bad or missing secret"* | `SHARED_SECRET` in `Code.gs` and the box in the app do not match. |
| *"Could not reach the sheet"* | The browser could not talk to Google at all: no internet, or the URL is wrong. |
| *"did not answer within 20 seconds"* | Slow connection; try Sync again. |

### The one that catches almost everyone

**Saving the code does not publish it.** The Apps Script editor and the live
web app are separate things. After pasting or editing `Code.gs` you must:

> **Deploy** → **Manage deployments** → **✏ pencil** →
> **Version: `New version`** ← *this dropdown is the whole trick* →
> **Deploy**

If you click the pencil and press Deploy without changing **Version** from the
existing number to **New version**, nothing is republished and the old code
keeps running. The URL does not change when you do this correctly.

Do **not** use *New deployment* for an update — that makes a second web app
with a different URL.

### Checking which code is live

Paste your `/exec` URL into a browser with this on the end:

```
?payload={"op":"ping"}
```

| reply | meaning |
|---|---|
| `{"ok":true,"data":{"version":2,...}}` | Correct — current code is live. |
| `{"ok":false,"error":"Unknown op: undefined"}` | **Old code still deployed.** Republish as a New version. |
| A Google sign-in page | Access is not **Anyone**. |

Do this in an **incognito window**. A normal window uses your Google session,
so it can succeed even when the app cannot — which hides a sharing problem.

