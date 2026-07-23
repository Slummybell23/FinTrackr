# FinTrackr

A self-hosted budgeting and expense-tracking PWA for home labs. Transactions
are entered manually or imported from bank CSV exports — there are no bank
integrations by design. Runs as a single Docker container with all data in one
SQLite file.

- **Self-hosted, multi-user** — cookie-based auth, per-user data isolation,
  one container, one database file
- **Manual-first** — entries are written by hand or imported from CSV and
  reviewed before they land
- **Installable PWA** — works offline, queues entries written without a
  connection, installs to the home screen
- **Desktop and mobile layouts** — a sidebar with multi-column dashboards on
  wide screens, a single column with a tab bar on phones

## Features

### Tracking

- Expense and income entries with vendor, category, date, note, free-form
  **tags**, and an optional **receipt photo**
- **Vendor memory** — a vendor learns its default category from the first
  categorized entry and files future entries automatically; vendors support
  aliases (the statement string `AMZN MKTP US` files as *Amazon*), renames,
  and merging duplicates
- **Type-ahead vendor search** on the entry form (aliases included), amount
  prefill for steady vendors, and an outlier warning when an amount is far
  above a vendor's usual
- Activity view: the full ledger grouped by day with daily subtotals,
  searchable and filterable by kind, category, amount range, and tag
- Per-vendor history: monthly spend trend, this month vs. last, visit log

### Budgeting

- Monthly budget lines with optional **groups** (Needs / Wants / …) rolled up
  with subtotals; optional envelope-style **rollover** of unspent budget
- Per-line **pacing projections** ("pacing to $876 · $376 over") and a
  **daily allowance** ("≈ $9.46 a day holds it"), plus a safe-to-spend-today
  figure on Home
- **Re-line suggestions** — each line is compared with its actual average
  over recent months, with a one-tap adjustment
- **Recurring items** post themselves to the ledger when due; includes a
  due-soon view, a subscription cost audit (annualized), price-increase
  flags, and **variable items** (utility bills) that wait for the real
  amount to be recorded
- Pattern detection: steady same-vendor purchases are offered as recurring
- **Savings buckets** — targets (jars), plain categories, and **sinking
  funds** paced toward a date; pay-yourself-first monthly tracking
- **Debts** — balances paid down by hand or via debt-linked entries, with
  payoff forecasts based on recent pace
- Optional **spending challenges** (no-spend days, category caps) and a
  **worth-it review** of the week's biggest expenses — both off by default

### Insights

- Month pace chart with end-of-month projection, category bullet bars,
  weekday averages, month-over-month category deltas, vendor leaderboard,
  savings rate with an optional target, no-spend streaks and records
- Weekly review (this week vs. last, day by day) and a year view against the
  budget rule
- Print-ready monthly report (ink-on-white regardless of theme)

### Bank import

- Import the CSV your bank exports, or paste rows copied from online banking
- Columns are auto-detected and confirmed once; the mapping is saved as a
  **bank profile** for one-click reuse
- Handles signed amounts, debit/credit column pairs, and both date orders
- Rows are matched against existing vendors (names and aliases), descriptions
  are cleaned of processor noise, and rows matching an existing entry's date
  and amount are flagged as likely duplicates
- Everything is reviewed — re-file, rename, include, or skip per row — before
  anything is written; accepted renames store the raw statement string as the
  vendor's alias so the next import matches automatically

### Data & administration

- Per-user CSV export/import and a full-account JSON export
- Account reset ("fresh start") and self-service account deletion
- The first registered account administers the instance: manual backups,
  full-database download, and validated restore
- Nightly database snapshots (`VACUUM INTO`), keeping the newest seven

## Getting started

### Docker

```sh
docker run -d \
  --name fintrackr \
  -p 8080:8080 \
  -v /path/on/host/fintrackr:/data \
  --restart unless-stopped \
  slummybell/fintrackr
```

All data lives in `/data/fintrackr.db` (SQLite) — back it up by copying the
file. The image ships a healthcheck against `/api/health`.

### Docker Compose (build from source)

```sh
docker compose up --build
# → http://localhost:8080
```

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `ConnectionStrings__Default` | `Data Source=/data/fintrackr.db` | SQLite location |
| `ASPNETCORE_URLS` | `http://+:8080` | Listen address/port inside the container |
| `ReceiptsPath` | `/data/receipts` | Receipt photo storage |
| `BackupsPath` | `/data/backups` | Nightly + manual database snapshots |
| `TZ` | — | Container timezone |

### Reverse proxy

The app honors `X-Forwarded-For`/`X-Forwarded-Proto`, so behind a TLS proxy
(nginx, Traefik, Nginx Proxy Manager) the auth cookie is marked Secure and the
rate limiter sees real client IPs. Point the proxy at port 8080; no further
configuration is needed. TLS termination is the proxy's job — the container
itself serves plain HTTP.

## Unraid

A Community Applications-format template is provided at
[fintrackr.xml](fintrackr.xml) (port 8080, appdata at
`/mnt/user/appdata/fintrackr`).

To install before it is listed in CA:

1. Copy the template to the flash drive:

   ```sh
   cp fintrackr.xml /boot/config/plugins/dockerMan/templates-user/my-fintrackr.xml
   ```

2. **Docker → Add Container**, select `fintrackr` from the Template dropdown,
   adjust the port or appdata path if needed, and Apply.

**Troubleshooting "no connection":** the container listens on port 8080 over
plain HTTP. Verify the port mapping's *container* side is 8080, test with
`docker exec fintrackr curl -sf http://localhost:8080/api/health`, browse with
`http://` (not `https://`), and on a custom network (br0) use the container's
own IP.

To publish to the Community Applications store: push the image to a public
registry, host the template XML in a public GitHub repository with
[ca_profile.xml](ca_profile.xml) at the repo root (CA reads it as the
publisher profile for the whole account: icon, bio, links, and the maintainer
page lists every app published under it), and submit the repository in the
[CA template-repository thread](https://forums.unraid.net/topic/87144-ca-application-templates/).

## Security & multi-user

- Sessions are HTTP-only cookies via ASP.NET Core Identity (hashed passwords,
  login lockout); no tokens are exposed to JavaScript
- Every row carries a `UserId` and every query is scoped to the signed-in
  user; registering seeds that user's default budget lines
- Auth endpoints are rate limited per IP (10/minute)
- The service worker's API cache is dropped on sign-in/out so offline data
  never crosses accounts
- The schema is managed by EF Core migrations, applied automatically on
  startup

## API

All routes live under `/api` and require a signed-in user (except
`/api/auth/*` and `/api/health`). OpenAPI is served at `/openapi/v1.json` in
development.

| Area | Routes |
| --- | --- |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/change-password`, `/auth/fresh-start`, `/auth/delete-account`; `GET /auth/me`; `PUT /auth/settings` |
| Entries | CRUD on `/entries` with `?month=`, `?search=`, `?categoryId=`, `?tag=`, `?vendorId=`, `?kind=`, amount range, and paging; `POST /entries/{id}/worth`; receipt photos at `/entries/{id}/receipt` |
| Categories & vendors | CRUD on `/categories` and `/vendors`; `POST /vendors/{id}/merge/{targetId}` |
| Recurring | CRUD on `/recurring`; `POST /recurring/{id}/record` for variable items |
| Savings & debts | CRUD on `/goals` with `/goals/{id}/contribute` and `/goals/set-aside/{month}`; CRUD on `/debts` with `/debts/{id}/pay` |
| Challenges | CRUD on `/challenges` with live progress |
| Summaries | `/summary/month/{yyyy-MM}`, `/summary/year/{yyyy}`, `/summary/review`, `/summary/patterns` |
| Import & export | `GET /csv/entries.csv`, `POST /csv/entries`, `GET /export` (full account JSON), `POST /import/propose`, `/import/profiles` |
| Admin | `POST /admin/backup`, `GET /admin/backups`, `GET`/`POST /admin/database` |

## Development

Requires the .NET 10 SDK and Node 20+.

```sh
# API on http://localhost:5194
cd server && dotnet run --project FinTrackr.Api

# Client on http://localhost:5173 (proxies /api to 5194)
cd client && npm ci && npm run dev
```

`dotnet test server` runs the API integration suite (auth, per-user
isolation, vendor memory, summaries, imports, coaching features). CI lives in
`.gitea/workflows/ci.yml` (GitHub Actions-compatible): server build + test,
client build, and a gated image publish.

### Stack

| Piece | Tech |
| --- | --- |
| `server/` | ASP.NET Core 10 minimal API, EF Core + SQLite, ASP.NET Core Identity |
| `client/` | React 19, Vite, TypeScript, Tailwind CSS 4, `vite-plugin-pwa` |
| `Dockerfile` | Multi-stage: Node builds the PWA, .NET publishes the API, one runtime image serves both |
| `fintrackr.xml`, `ca_profile.xml` | Community Applications template and maintainer profile |

### Design

The UI follows the design document in
[design/finance-app-directions.html](design/finance-app-directions.html): an
editorial system of light and dark "papers" with configurable accent inks, set
in Newsreader. Theme tokens live in
[client/src/index.css](client/src/index.css) and are applied via `data-paper`
/ `data-ink` attributes; each user's choice syncs to their account.

## PWA notes

- Installable manifest with a "New entry" shortcut; text shared to the app
  prefills an entry note
- Workbox service worker: precached shell, network-first API caching for
  offline reading, and Background Sync replay for entries written offline
- New builds surface an update bar instead of refreshing silently
