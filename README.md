# Payment Reconciliation Web App

A standalone web app over Zoho CRM "Closed Won" deals. Each dashboard is its
own page answering one question:

| Page | What it answers |
|---|---|
| **Reconciliation** (`/`) | Does CRM agree with Zoho Books? Pick a closing-date range, click **Run report**, get the per-deal MATCH / MISMATCH / PENDING table — the same logic as the original Deluge script. |
| **Collections** (`/collections.html`) | How much money is collected vs. still outstanding, month by month? A stacked column chart, KPI tiles, and a month breakdown table. |
| **By Deal Owner** (`/owner-collections.html`) | What has each deal owner collected, what is still pending, and which of their customers is carrying it? Two stacked bar charts — owners, then their customers — over a filterable customer table. Clicking any customer, in either chart or the table, opens that customer's full details and payment schedule. |

Six **insight dashboards** over the collections data also exist. They are
**not listed in the sidebar** — the menu carries Reconciliation, Collections
and By Deal Owner only — but the pages are still served and still work if
opened directly:

| Page | What it answers |
|---|---|
| **Batch Performance** (`/batches.html`) | Which batches are collecting, and which are carrying the shortfall. |
| **Owner Performance** (`/owners.html`) | The book each deal owner is carrying, and how much of it has landed. |
| **Ageing & Overdue** (`/ageing.html`) | How old the unpaid money is, and what has been late the longest. |
| **Payment Mix** (`/mix.html`) | Which payment shapes the money sits in — instalments, loan, full payment — and which of them land. |
| **Collection Trend** (`/trend.html`) | How the shortfall has built up, month by month. |
| **At-Risk Deals** (`/risk.html`) | Who to call first, with everything needed to make the call on the row. |

Every page shares a left sidebar that sits collapsed as an icon rail and
expands on hover (or on keyboard focus). It overlays the page rather than
pushing it, so nothing shifts as the pointer crosses it. The nav is rendered
from a single list (`NAV` in `shell.js`), so a dashboard is added to — or taken
off — the menu in exactly one place.

## How it's built

- **Backend:** Node.js + Express (`server.js`, `lib/`, `routes/`)
- **Frontend:** plain HTML/CSS/JS (`public/`) — no build step needed
- **Auth:** Zoho OAuth2, refresh-token grant (server-side only, nothing
  exposed to the browser)

### Shared frontend conventions

- **`public/viz.js`** is the shared toolkit: rupee formatting, the SVG chart
  primitives (`Viz.bars`, `Viz.lines`), the sortable `Viz.DataTable`, toasts,
  downloads, and a session cache. Every page loads it before its own script,
  so a rupee figure is printed the same way everywhere and every chart reads
  its series colours from the same CSS variables.
- **`public/shell.js`** is the dashboard shell the six insight pages are built
  on: the sidebar, the date range, the filter bar, the KPI row, the export
  button, and the data-shaping helpers (`aggregate`, `ageingRows`,
  `trendRows`, `riskRows`) they all read from. Two dashboards therefore cannot
  disagree about what "pending" or "past due" means. A page supplies only what
  makes it that page — its title, its KPIs, what it draws, what it exports —
  so each one is 40–200 lines.
- **`Shell.openDetail(deal)`** is the one customer detail panel, shared by
  every page. It takes a deal row in the shape `riskRows()` produces and shows
  the contact details, the money, and the full payment schedule — each payment
  with its due date, amount and status. Any record that opens a customer calls
  this, so "open the customer"
  looks and behaves the same everywhere. The frame is built once from literal
  markup and every CRM value is written with `textContent`, so a deal name
  containing markup stays text.
- **Typography is Calibri** — every word, and every table: cells, column
  headers and footer rows are all Calibri, with `font-variant-numeric:
  tabular-nums` on the table so a proportional face still holds a column of
  amounts in line. **Consolas** (a ClearType face drawn to sit with Calibri)
  is left with the chrome around the data — stat values, axis ticks, status
  lines, form fields. Calibri runs small next to a grotesque, so the base size
  is 15px, table cells are 13.5px, headings are 700 (Calibri ships
  Regular/Bold only), and headings and uppercase labels carry positive
  tracking — 0.09em on the uppercase column headers. `Carlito` is listed as
  the metric-compatible fallback for non-Windows machines.
- **Colour is validated, not eyeballed.** Collected/pending (`--series-paid` /
  `--series-pending`) clear the categorical checks against the white panel;
  the ageing buckets use a single-hue rust ramp (`--age-1`…`--age-4`) that is
  monotone in lightness, so the severity ordering survives colour-vision
  deficiency. Don't hand-tweak either set without re-validating.
- **Every chart ships with the table that restates it**, and every table
  sorts — colour and bar length are never the only way to read a number.
- **Rendering is `textContent`, never `innerHTML`**, so CRM free-text fields
  can't inject markup.

### Tables and filters

Sortable columns (click or press Enter on a heading), a live search box (`/`
focuses it anywhere on the page), and filter chips that each clear
individually. The reconciliation table adds a **Key columns / All columns**
switch — the CSV always contains every column regardless.

## The Collections dashboard

Each Closed Won deal is exploded into its scheduled payments, and each one is
placed in the month it was **expected**:

| Component | Expected date | Paid flag (the report's column) |
|---|---|---|
| Instalment 1 / 2 / 3 | its CRM due date | `Instalment{N} Paid (CRM)` |
| Loan | Loan Due Date | `Loan Amount Paid (CRM)` |
| Full Payment | **none** — a full payment has no due date | `Full Amount Paid (CRM)` |

A full payment carries no due date anywhere: not derived, not inferred from
another field, and never printed in a Due Date cell — the cell reads `—`. It
still appears in every payment table so the money stays chaseable, scoped to
the date range by the deal's **Closing Date** (shown under its own name, never
as a due date). What it cannot do is appear in anything that needs a deadline:
it is never bucketed into a month, never counted as past due, and never given a
days-late figure. Ageing lists it in its own **No due date** bucket rather than
under "Not yet due", which would claim a deadline it doesn't have.

The month figures stay strictly date-driven — the `totals` are the sum of the
months, so the month table's footer always adds up — which is why the pending
drill-down can list more than the Pending tile shows. The drill says so in its
subtitle whenever it does.

**A payment is PENDING only when its paid checkbox is false.** Anything
already ticked counts as collected and never appears in the pending figures,
the pending count, or "pending & past due".

**Registration amounts are not tracked on this page** — only the five
components above.

### Where the flags come from

`lib/payments.js` is the single source of truth. The reconciliation report
renders its flags as the "… Paid (CRM)" columns, and this dashboard buckets
the same components using the same flags, so the two pages cannot report
different paid/pending states for a deal. A test asserts, for every payment
type, that each bucketed component's flag equals the matching column on the
generated report row.

Books is deliberately not consulted: it records one paid total per customer,
which can't be attributed to a specific instalment, so it can't drive a
month-wise split. The upside is that this page makes a single CRM call and no
Books calls, so it loads far faster than the reconciliation report.

### How due dates decide the month

The month and year a payment lands in come from its CRM due date, parsed
strictly: `lib/payments.js` accepts `yyyy-MM-dd` (and the ISO datetime form
Zoho returns for datetime fields), then validates it as a real calendar date —
`2026-02-29` and `2026-04-31` are rejected, not rolled over.

Anything else is **reported, never guessed at**. This matters: slicing a value
like `10/03/2026` would produce the month key `10/03/2`, which then falls
outside every date range and disappears from the dashboard with no warning.
Non-ISO formats are not reinterpreted either, because `dd/MM` and `MM/dd`
can't be told apart for the first twelve days of a month and guessing wrong
would move money into the wrong month.

### Batch Start Date

`Batch_Start_Date` is read from the CRM deal and carried on every scheduled
payment, but it is **display only**. It appears as a column on the
reconciliation report and the By Deal Owner customer table, in that page's
Excel export, and as a field in the customer detail panel — and nowhere else.
Nothing filters, buckets, dates or compares against it: which month a payment
lands in, and whether it is pending or past due, are decided entirely by its
own due date as described above.

### When the dashboard can't see money

Four cases are reported in the status line under the filters rather than
being dropped silently. If any note appears, the months are under-counting:

- **Unparseable due date.** Reported with a sample of the offending values, so
  the CRM record can be found and fixed.
- **Full Payments.** They carry no due date at all, so they can't be placed on
  a month axis. Reported with their total and how much of it is still pending —
  nothing to fix in CRM, it is simply money the month split can't show. They
  are still listed in the payment tables. A full payment with no closing date
  either can't be scoped to the range at all, and is reported separately.
- **No due date.** A component that should have a due date (instalment or loan)
  has none; the CRM record is incomplete.
- **Unrecognised Payment Type.** A deal whose `Payment_Type` isn't one of
  `Instalments` / `Full Payment` / `NACL(Northern Arc Capital Ltd)` produces
  no scheduled payments at all, and is reported as a count.

"Pending & past due" is pending money whose expected date is already in the
past.

### Pending drill-down and Excel export

Click any pending figure to see the deals behind it:

- the **Pending** stat tile → every pending payment in the loaded range
- a **column in the chart** → that month (columns with pending money are
  clickable and keyboard-focusable)
- a **pending amount in the month table** → that month

The panel lists one row per unpaid payment — deal name, payment component,
due date, days overdue, amount, **email, phone**, owner, batch, payment type —
plus that deal's collected and pending totals across the range, sorted
most-overdue first.

**Download Excel** exports it as a real `.xlsx` with two sheets: *Pending
detail* (the chase list) and *By deal* (one row per deal, with total
scheduled / collected / pending / past due and the earliest due date).
Amounts are written as numbers with a currency format and dates as Excel date
serials, so both sheets sort, filter and sum natively — a CSV can't do that,
since everything arrives as text.

The workbook is generated by `public/xlsx.js`, a small OOXML writer, so this
adds no dependency and keeps the app build-free. The page-level **Download
CSV** button is unchanged and still exports every payment, paid and pending.

The drill panel also has its own search box, and every column in it sorts —
so the chase list can be worked oldest-first, biggest-first, or by owner.

## The insight dashboards

The six insight pages all read the **same** `/api/collections` payload the
Collections page uses — no extra Zoho calls. A range already loaded this
session is served from a 10-minute session cache rather than refetched, so
moving between dashboards is instant. **Reload** always goes back to CRM.

### They share a question, not just a stylesheet

The date range and the filters (batch, owner, payment type, status, free-text
search) live in `sessionStorage`, so **clicking through the sidebar keeps the
question you were asking and changes only the answer**. Filter to one batch on
Batch Performance, open Ageing & Overdue, and you are looking at that batch's
ageing. The chips above the KPI row always show what is currently applied, and
each one clears on its own.

A filter carried in from another dashboard that names something the current
range doesn't contain is dropped, rather than left showing a chip that
silently matches nothing.

Clicking a bar filters to it; clicking the bar you are already filtered to
clears the filter again — the chart doubles as the way back out.

### What each one adds

Each dashboard has its own KPI row rather than a generic one. Ageing leads
with share-past-due and worst-days-late; At-Risk leads with the largest single
exposure and the average per owing deal; Trend leads with the shortfall to
date and its best and weakest months.

Several carry a second view of the same numbers beyond the headline chart:

- **Ageing & Overdue** adds the chase list — the longest-overdue unpaid
  payments, with contact details on the row.
- **Payment Mix** puts type and component side by side, with a detail table
  for each.
- **Collection Trend** pairs the cumulative lines with a per-month chart: a
  month that collected badly is invisible in a running total that only ever
  goes up.
- **At-Risk Deals** ranks deals by pending amount, and each row expands to
  that deal's individual payments.

### Export

**Export to Excel** writes the current dashboard — with the current filters
applied — as a real `.xlsx`. The Ageing and At-Risk exports carry two sheets:
the summary and the underlying payment-level detail.

### Nothing is capped silently

A chart showing only the largest 20 rows says so, above the table that lists
them all. The same "no due date" / "unparseable due date" / "unrecognised
payment type" warnings the Collections page prints appear on every insight
dashboard too.

## 1. Get Zoho API credentials

You need a **Self Client** in the Zoho API Console so the backend can
call CRM and Books directly (not tied to a logged-in browser session).

1. Go to the [Zoho API Console](https://api-console.zoho.in) (use
   `.in` since your org is on the India data center) → **Add Client** →
   **Self Client**.
2. Note the **Client ID** and **Client Secret** shown — put these in
   `.env` as `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET`.
3. Go to the **Generate Code** tab on that Self Client. Enter these
   scopes (space-separated):
   ```
   ZohoCRM.modules.deals.READ ZohoBooks.contacts.READ ZohoBooks.invoices.READ
   ```
4. Set the time duration (e.g. 10 minutes) and generate the code. Zoho
   gives you a short-lived **grant token**.
5. Exchange that grant token for a **refresh token** (one-time). With
   `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` / `ZOHO_ACCOUNTS_URL` already
   in `.env`, run:
   ```bash
   npm run get-refresh-token -- <GRANT_CODE_FROM_STEP_4> --write
   ```
   That prints the refresh token and writes it to `.env` as
   `ZOHO_REFRESH_TOKEN` (drop `--write` to just print it). The refresh
   token is long-lived — it doesn't expire unless revoked.

   > **The grant token is not the refresh token.** They look identical
   > (`1000.<32 hex>.<32 hex>`), but the grant token is single-use and
   > dies after ~10 minutes. Pasting it straight into
   > `ZOHO_REFRESH_TOKEN` is the #1 cause of `{"error":"invalid_code"}`
   > at runtime. Run step 5 immediately after step 4.
   >
   > Note also that a **Self Client has no redirect URI** — sending a
   > `redirect_uri` in this exchange makes Zoho reject it.

6. Confirm your Zoho Books **Organization ID** (Books → Settings →
   Organization Profile) and put it in `.env` as `ZOHO_BOOKS_ORG_ID`.

## 2. Configure the app

```bash
cp .env.example .env
# then fill in ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_BOOKS_ORG_ID
```

## 3. Run it locally

```bash
npm install
npm start
```

Open `http://localhost:3000`, pick a date range, click **Run report**. Use
the **Collections** tab in the header for the month-wise view.

## 4. Deploy it

This is a single Node process with no database — it'll run anywhere that
runs Node 18+: Render, Railway, a small VPS, an internal server, etc.
Just set the same environment variables from `.env` in whatever
platform's config/secrets panel, and run `npm start` (or let the
platform run it via `npm install && npm start`).

## Troubleshooting auth

Zoho's token endpoint returns a different error string per cause, so the
error tells you exactly which value is wrong:

| Zoho error | What's actually wrong |
|---|---|
| `invalid_code` | `ZOHO_REFRESH_TOKEN` — expired grant token pasted in, revoked, or bumped by Zoho's 20-refresh-tokens-per-client limit. Redo steps 4–5. |
| `invalid_client` | `ZOHO_CLIENT_ID` isn't on this DC — check `ZOHO_ACCOUNTS_URL` (`.in` vs `.com`). |
| `invalid_client_secret` | `ZOHO_CLIENT_SECRET` doesn't match the client ID. |

Zoho keeps at most **20 refresh tokens per client**; generating a 21st
silently revokes the oldest. If the app worked and then started failing
with `invalid_code`, that's the likely reason — just redo steps 4–5.

## Notes / things worth knowing

- **CRM field API names**: this app assumes the same CRM field API
  names as the original script (`Registration_Amount_Paid`,
  `Instalment_1_Amount`, `Instalment_1Due_Date`, etc.). If your CRM
  module uses different API names, update `lib/payments.js` — both pages
  read their paid checkboxes and payment schedule from there.
- **Chart colors**: the two series colors in `public/style.css`
  (`--series-paid`, `--series-pending`) were checked for colorblind
  separation and contrast against the white panel. If you restyle them,
  re-check the pair rather than picking by eye — the two series carry the
  whole meaning of the chart.
- **Checkbox parsing**: `lib/reconcile.js` has a `toBool()` helper that
  correctly reads CRM checkbox fields whether they come back as a real
  boolean or as a string `"true"`/`"false"` — this was the bug in the
  original script.
- **Rate limits**: the report runs deal-vs-Books matching 5 at a time
  (`CONCURRENCY` in `routes/report.js`). Increase/decrease if you hit
  Zoho API rate limits or want it faster.
- **Pagination cap**: CRM deal fetch pages up to 50 pages × 200 = 10,000
  deals, matching the original script's cap.
- **Access control**: this app currently has no login of its own — if
  you deploy it somewhere reachable outside your network, put it behind
  your company SSO / a reverse proxy with auth, since it holds a Zoho
  refresh token with read access to CRM and Books.
