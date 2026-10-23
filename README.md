# MSJournal — Day 6, Trade View

One Next.js application with Better Auth, Neon PostgreSQL and Drizzle. Each authenticated user sees only their own accounts, settings, imports and journal. Day 5 adds a shared real/demo calendar to the dashboard and a dedicated Calendar page. Day 4 processing and fees remain the source of real results. The Day 1 design, themes, emerald/violet palette, responsive behavior and Motion animations remain intact; fictional Demo mode stays separate. Orders remains optional.

## Run locally

Use Node.js 20.9 or newer and npm with the tracked package lockfile. On PowerShell use `npm.cmd`; `npm` works on compatible shells.

```powershell
npm.cmd ci
Copy-Item .env.example .env.local   # Only if .env.local does not already exist
```

Configure these variables locally. Never share or commit credentials:

| Variable                          | Purpose                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                    | Intended Neon development database connection URL                                                                |
| `BETTER_AUTH_SECRET`              | Cryptographically random secret of at least 32 characters; keep the existing value to preserve existing sessions |
| `BETTER_AUTH_URL`                 | Exact browser origin, initially `http://localhost:3000`                                                          |
| `RESEND_API_KEY`                  | Server-only Resend key, optional for local signup/sign-in                                                        |
| `AUTH_EMAIL_FROM`                 | Resend sender, such as `MSJournal <auth@your-verified-domain>`                                                   |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | `false` initially; enable only after email delivery is verified                                                  |

Choose the intended development database in Neon’s **Connect** dialog. Both direct and Neon pooled PostgreSQL URLs support this app's node-postgres interactive transactions. Keep TLS enabled; `sslmode=verify-full` explicitly verifies the server certificate. No separate migration URL is required for the current SQL. No database is provisioned automatically.

Next.js and the CLI load `.env.local`; process variables take precedence. Restart the running app after changing environment variables. Use the exact configured host and port: `localhost` and `127.0.0.1` are different origins. HTTPS uses secure cookies; HTTP is limited to loopback for local development.

Review existing versioned SQL in `drizzle/` before applying migrations:

```powershell
npm.cmd run db:migrate -- --reviewed
npm.cmd run dev
```

Open `http://localhost:3000/signup`. Enter your name, email, password and confirmation. Successful local signup creates a Better Auth session and opens a welcome page with **Add your first trading account**. Choose **Prop Accounts → Add Account**. No terminal bootstrap is required for individual users. Sign in at `/login`, request recovery at `/forgot-password`, and sign out through Settings or the utility rail.

`OWNER_EMAIL`, owner allowlists, `owner:bootstrap`, `owner:recover` and the owner-password environment inputs have been removed. A leftover `OWNER_EMAIL` in a private local file is ignored and can be removed. Existing user IDs, supported password hashes, trading accounts and settings are preserved: former owners are ordinary users. The authentication revision preserved these tables. Day 3 adds migration `0001_bumpy_squadron_supreme.sql`; review and apply it before using imports.

## Email recovery and verification

In Resend, verify a sending domain using its DNS instructions, create a sending API key, then set `RESEND_API_KEY` and `AUTH_EMAIL_FROM`. Restart MSJournal. Do not use Resend's limited test sender as a general sender for independent users.

The forgot-password page uses Better Auth's supported token flow and a generic confirmation that does not reveal account existence. Reset emails contain a one-hour link. The reset page validates matching passwords, handles expired/invalid/used links, resets through Better Auth and returns to sign-in. Successful resets revoke previous database sessions; cached session cookies cannot restore access.

Missing email configuration disables recovery clearly without blocking local signup/sign-in. Failed Resend delivery returns an availability error instead of a fake success. Email sending is awaited to surface failures; before public release, review timing protection and durable email handling alongside the delivery/error policy. No plaintext passwords or reset tokens are stored in application logs. Auth request logging is disabled, links use `Referrer-Policy: no-referrer`, and the reset screen removes its token from browser history after reading it into memory. Configure any future proxy/hosting logs to redact authentication URL credentials too. Do not capture recovery URLs in analytics or tracing.

Email verification is prepared using Better Auth's `sendVerificationEmail` and `/verify-email` flow. With `AUTH_REQUIRE_EMAIL_VERIFICATION=false`, no verification gate or automatic verification email blocks local users. After configuring and testing Resend, set it to `true`. Signup then asks the user to verify; verification starts a supported session and opens onboarding. Existing unverified users must verify before signing in once the gate is enabled. Resend verification links from `/verify-email` if needed.

Before enabling public access: verify the sending domain and sender permissions, test actual recovery and verification delivery, set an HTTPS `BETTER_AUTH_URL`, retain a strong secret, and review rate limits and trusted proxy/IP handling. This project has not been publicly deployed.

## Private data and dashboard

Every business query and mutation derives the user ID from the server session. Reads, edits, archive/restore and settings are scoped to it. Client-supplied identity fields are rejected. The existing `owner_id` database column means record ownership, not an owner role; keeping it avoids rewriting data. Broker identifiers remain unique **per user/platform**, including archived accounts, and can be reused by another user. Sessions are database-backed, private API responses are uncached, and mutation origins are checked. No organizations, roles, teams or billing are added.

**My Accounts** shows only the signed-in user's unarchived accounts. URL selections are validated against that list, so IDs from another journal or archived accounts are removed. New users start with no real data; after creating accounts they see **No trades imported yet**. Ratios and current balances are unavailable. Nominal account size and optional dated opening balances are explicit metadata, never verified current balances.

**Demo** opens `/?mode=demo` behind login with a persistent **Demo data** indicator. The fixed fictional dataset covers January–March 2026, initially March. Fictional accounts and trades stay in `data/demo.ts` and are never inserted into Neon or attached to real accounts. Shared financial calculations, calendar, filters, heatmap, charts and read-only day details remain available. Daily grouping uses Asia/Jerusalem close dates; entry-time display can use other IANA timezones, including New York. CSV imports use an explicitly selected IANA source timezone, defaulting to Asia/Jerusalem. Account/settings display timezones do not silently reinterpret uploaded exports.

Settings persist display name, display timezone and USD currency per user. Email is read-only. Theme stays with next-themes in the browser for fast startup. Financial inputs use exact decimal strings and PostgreSQL numeric columns; identifiers remain text. Archive preserves account history; the application does not offer hard deletion.

## Import Tradovate reports (Day 3)

Sign in and open **Import Trades** (`/imports`). Choose an Active, unarchived Tradovate account and CSV source timezone, upload **Performance.csv** in the main uploader, review and confirm. Performance works independently: no Orders file, earlier Orders import, or reconciliation is required. Orders remains optional under the initially collapsed **Advanced: import Orders report** section. Drag/drop, file selection, removal and replacement are supported.

The parser was checked against the supplied real exports: 124 Orders rows (67 filled, 57 canceled) and 43 Performance rows. Original private exports are not repository fixtures and are not automatically imported. Only synthetic rows with fictional identifiers are committed.

The searchable **CSV source timezone** selector includes friendly labels and IANA identifiers for Israel, New York, Chicago, Los Angeles, London, Berlin, UTC, Dubai, Kolkata, Tokyo, Sydney and other supported zones. It remembers the latest successfully imported source timezone per user/account from private batch history; failed previews do not change that preference. Without successful history, the default is **Asia/Jerusalem**. Choose the timezone used by the timestamps in your CSV export. This may differ from your journal display timezone.

The verified export format is US **MM/DD/YYYY HH:mm:ss**, with Orders' additional **M/D/YY** date. An explicit `Z` or `±HH:mm` suffix (also ISO `YYYY-MM-DDTHH:mm:ssZ/±HH:mm`) defines the instant directly; the selected source zone is not applied twice. Offset-free timestamps use IANA rules for that date. Ambiguous repeated hours and nonexistent DST times block the batch instead of guessing. Original strings, selected source timezone and normalized UTC instants remain traceable.

**Journal display timezone** in Settings reuses the existing persisted per-user preference and defaults to Asia/Jerusalem. It controls previews, history, journal timestamps and realized-day boundaries on the real dashboard. Original source strings are available for comparison. Display changes never rewrite UTC data or affect import identity, and do not require reimporting reports.

Headers are inspected immediately on file selection and validated again on the server. Selecting Orders in the Performance uploader produces **“This is a Tradovate Orders report. Select your Performance CSV, or use Advanced Orders import.”** regardless of filename. Replace it with the actual Performance export or use Advanced. Unrecognized files explain the expected format; report-type errors do not produce a misleading date-range message.

**Orders:** the report's `Account` must equal the selected account's configured broker identifier. If none is configured, inspect the source identifier in the preview and explicitly confirm its mapping. This never changes account settings. Multiple source accounts in one file are rejected. **Performance:** confirm its ownership explicitly; it contains no account identifier, and dates/symbols do not prove ownership.

Review counts, diagnostics, labeled timestamps and paginated source rows. Expand **Original source values** for the full row. Changing the file, account or source timezone invalidates the preview and requires a new review. Invalid records, account mismatches and conflicts block the whole batch, with a reason beside confirmation. **Confirm import** reparses the files and rechecks ownership and overlaps. Performance-only success says **Imported performance records**: matched portions with reported gross P&L, not automatically complete trades. After source commit, Day 4 automatically processes the account. Private history (`/imports/history`) retains source details; **Trade View** inspects derived records. **Demo** remains unchanged and explicit.

### Identity, overlap and retry policy

- Orders use the actual `orderId` string; `Order ID` must agree. Unchanged orders are duplicates. Any changed source values, including a different interpretation timezone, produce a review conflict. `Version ID`, `lastCommandId` and source timestamps are preserved, but the sample cannot establish reliable snapshot precedence. Day 3 never overwrites or silently appends conflicting snapshots. Obtain a consistent export or defer the conflict to a future reconciliation workflow.
- Performance uses the actual `(buyFillId, sellFillId)` pair and the complete multiset of source portions for that pair. Identical visible rows with different fill IDs are separate records. Repeated identical portions in one report are retained with occurrence numbers. An overlapping pair is deduplicated only when all its fingerprints and occurrence counts match; changed values or differing multiplicity block the entire batch. Reports must contain the complete set of portions for every overlapping fill-ID pair. Missing IDs are invalid. This conservative policy cannot distinguish unreported changes that reuse identical IDs and identical values; the format supplies no finer portion ID. Do not manufacture or alter source IDs to bypass conflicts.
- SHA-256 file hashes are kept as metadata; file hashes alone never decide overlaps. Fingerprints include all trimmed source field values and the source timezone; original untrimmed values remain in records/provenance. Even differences in export formatting can conservatively flag a conflict. No floating-point price/P&L arithmetic is used; values stay exact decimal strings and PostgreSQL `numeric(28,8)`.
- An identical file already imported into the same account cannot be imported again under a different source timezone. The server checks its hash/history and explains that an explicit correction workflow is required. Source-timezone correction is not implemented yet; changing journal display timezone is safe now.
- Preview issues a user-bound, payload-bound signed confirmation valid for 30 minutes. Changing files/settings requires another preview. Transaction-scoped account locks serialize confirmations; database uniqueness protects source identities, confirmation keys and provenance rows. Same-confirmation retries return the same batch. A fresh identical upload reports **Already imported**, creates a history receipt, and adds zero source records. New safe records in overlapping reports are added while existing records receive new provenance links.
- All files in a batch commit atomically. A validation conflict or database failure leaves no partial batch, file, record or provenance writes. Failed attempts are shown in the UI, rather than saved as successful history entries. Concurrent changes are rechecked at confirmation; a conflict requires a fresh preview.

### Limits and source semantics

Each file must be nonempty UTF-8, at most **5 MiB**, with at most **10,000 source rows**. At most one report per type is accepted, and the entire multipart request is capped at **11 MiB**, including streamed requests. All required headers from the inspected formats must be present, even when optional cells are blank. Extra columns are preserved with a warning. BOM, quoted commas, LF/CRLF and empty trailing rows are supported; internal empty/malformed rows are rejected. Row numbers refer to CSV records including the header, not physical lines inside quoted multiline fields. Numeric formats support US comma grouping, up to eight fractional digits and twenty integer digits; Performance supports `$123.45` and `$(123.45)`. Date support is limited to the verified formats and years 2000–2099. Other export formats may need a future parser version.

Canceled orders remain source snapshots; nonzero aggregate fills require fill quantity, average price and fill time. Orders do not prove individual executions. Performance rows are matched portions and may describe long or short chronology; reported P&L is **gross**, and missing fees remain unknown unless explicitly configured in Day 4. Import history lists the latest 100 batches, with 25 source rows per details page; preview shows 20 rows per page. Archived accounts keep historical imports and journal results but cannot accept new imports.

No new environment variables or storage provider are required. The existing database URL and auth configuration are reused. Migrations run only through the reviewed command, never during requests. The Day 3 migration is additive: five source-import tables, ownership foreign keys and indexes; existing users, passwords, account settings and selections are preserved.

The earlier Day 3 workflow/timezone fixes required no additional migration. **Day 4 requires additive migration `0002_glorious_bruce_banner.sql`**, reviewed and applied using the setup command above. No new environment variables are needed. Existing batches supply the last-used source timezone, existing preferences supply the journal display timezone, and original records/provenance remain intact.

Run focused disposable database verification only against the intended development database:

```powershell
$env:MSJOURNAL_TEST_DISPOSABLE = 'true'
npm.cmd test -- tests/import-db.integration.test.ts
```

It creates randomly named disposable users/accounts, injects a mid-transaction failure, verifies concurrency/retry/isolation, and removes only its guarded fixtures. Browser imports use synthetic exports and the same safeguards. Never use real records as disposable tests.

## Journal processing and real results (Day 4)

**Existing Day 3 imports:** open **Trade View → Process existing imports / retry**, then choose **Process / retry** beside your account. All its Performance sources are reconsidered, across months and exports. New successful imports trigger this automatically. An import and its processing are separate transactions: if processing fails, the import remains saved, the UI says so, and you can retry. No source reset or re-upload is needed. A failed processing publication rolls back all derived changes, leaving the last successful totals intact with an incomplete/failed status.

### What the source establishes

The actual supplied Performance format and stored sources were inspected: 43 portions, 16 with long chronology, 27 short, no equal-timestamp rows, and 15 shared fill identifiers. These are **not an expected complete-trade count**. The report has exact contracts, integer matched quantities, buy/sell prices, buy/sell fill identifiers, second-resolution timestamps, duration text, and reported P&L. It has no commission fields, full execution quantities, order IDs, open-position history, or guaranteed flat boundary. The reported gross amount remains authoritative; no contract multiplier is guessed. Private CSVs are not committed, seeded, or copied into fixtures.

Processing version `performance-1.0` builds connected components using shared fill IDs within **one user, account and exact contract**. A shared entry connects partial exits; a shared exit can connect separate entries/scale-in matches. For example, portions of 2 and 1 contracts sharing an entry contribute a closed matched quantity of 3, with quantity-weighted prices and the exact sum of their reported P&L. This does **not** establish maximum simultaneous position size. Different fill IDs, dates, prices, nearby timestamps and month boundaries never create connections.

Buy before sell supports long; sell before buy supports short. Equal timestamps, contradictory shared-fill metadata (side, price, timestamp or contract), or mixed chronology produce **Needs review**, without guessed entry ordering or direction. IDs stay strings and are never sorted numerically as execution evidence. Original timestamp strings and every contributing import/row are available in expandable diagnostics. Duration is the observed matched interval, not an asserted complete-position lifetime; source duration text is retained.

All supported components are labeled **Matched portions**, not complete flat-to-flat trades. A connected, apparently balanced matching graph can still omit an open portion of the position. The current Performance and aggregate Orders formats cannot verify that account history is complete or flat at an export boundary. Consequently complete-trade coverage is unverified, and complete-trade count, win rate, profit factor and average win/loss are unavailable. Orders does not add P&L or manufacture execution history. A future evidence source can support stricter flat-to-flat reconstruction; this milestone does not claim it from the current reports.

### Determinism, fees and realized dates

Each source portion is linked to exactly one current derived record. Reprocessing uses the whole account source set, deterministically groups/aggregates it, reuses an existing record ID when the component survives or merges, and retains superseded records internally. Source gross and derived gross must reconcile exactly before publication. Account locks serialize imports, processing and fee mutations; transactional publication and repeatable-read snapshots prevent half-updated totals. Duplicate uploads never add a second journal copy. Existing conservative Day 3 fill-pair/multiplicity conflict rules still apply: a changed matching pair requires review rather than unsafe merging.

**Prop Accounts → Fees** offers an optional all-in per-contract, per-side estimate, plus exact-contract overrides. The calculation for each portion is `closed quantity × 2 × per-side fee`, applied exactly once. Leave it unset for unknown; explicit zero is a known fee. Saving defaults to newly processed portions; choose **Apply these settings to existing portions** to replace historical nonmanual estimates/unknown values. Manual values are preserved. Estimate snapshots retain the rate and settings revision that supplied them.

Record details allow an explicit manual total, including zero. That total is allocated by closed quantity to immutable portions once, to eight decimal places with a final residual so allocations sum exactly to the entered total. These allocations survive regrouping and rate changes. Clearing the override restores the current configured estimate or unknown. Mixed manual/estimated fees are labeled; any missing coverage leaves aggregate net **unavailable**. Gross and fees use decimal arithmetic and PostgreSQL numerics; chart coordinates alone use JS numbers. Weighted prices are stored to 16 fractional digits and are never used to replace source gross P&L.

Daily realized gross uses each portion's actual closing instant (later of buy/sell), converted to **Journal display timezone** through IANA rules. Earlier partial-exit profits stay on their own dates, even if a later portion closes next month. Dashboard and list share the same selection/calculation layer. Date ranges include local exit dates, including DST boundaries. The basic paginated list includes groups with at least one selected portion, orders them by their final matched exit, and shows **selected** gross, fees and closed quantity. Details show the complete group for reconciliation. Group final-exit ordering is distinct from daily realized allocation.

**Real dashboard:** gross P&L, daily realized gross, cumulative realized gross (opening zero), gross profitable-day percentage, recent records, imported realized range and processing/fee coverage use private real sources. Account/date/exact-contract/direction filters apply together. Breakeven realized days remain in the day-win denominator. Trade-level ratios, performance scoring, balance without complete baseline/cash history, complete-trade activity, trade-time performance and drawdown remain honest empty states. The existing layout and separate Demo mode are preserved. The shared interactive calendar is now implemented in Day 5.

**Scope/limitations:** no broker API, notes, screenshots, strategy tags, MFE/MAE, risk multiples, fee schedules, prop rules or public deployment. The Day 4 list and non-calendar dashboard charts still load the user's normalized projection. The Day 5 calendar uses bounded month/day server queries; optimizing the other views remains future work.

Focused Day 4 checks:

```powershell
npm.cmd run db:check:journal
npm.cmd test -- tests/journal.test.ts
$env:MSJOURNAL_TEST_DISPOSABLE = 'true'
npm.cmd test -- tests/journal-db.integration.test.ts
```

The database check is read-only. It verifies normalized timestamps, quantities, prices, fill IDs and gross P&L against preserved raw sources, and prints only structural counts and pass/fail messages. The opt-in integration tests cover monthly grouping, repeated/duplicate processing, exact reconciliation, unknown/estimated/manual-zero fees, preserving overrides, atomic rollback and user isolation; cleanup verifies randomly generated fixture IDs and email addresses. Browser verification requires the loopback preview on `127.0.0.1:3100` with `BETTER_AUTH_URL` matching, and runs `npm.cmd run test:browser -- browser-tests/day-four.spec.ts`.

## Diagnose authentication

```powershell
npm.cmd run auth:diagnose
```

This read-only command loads the same environment, reports the nonsecret auth origin/cookie/email flags, checks Neon reachability, schema columns, migration history and counts of credential hashes compatible with the library's format. It does not print emails, passwords, tokens, connection strings or record IDs. Hash format alone does not establish how a password was originally created or prove password correctness.

During the earlier authentication revision the configured Neon database was reachable, all schema columns matched and migration history existed, but it contained **zero registered users and zero password records**. This explains invalid credentials before signup. There was no historical runtime trace establishing the earlier service failure; stale environment settings or transient connectivity cannot be claimed as its proven cause. Current credential failures return 401, service failures return a sanitized 503, origin failures and throttling have separate messages. No password was overwritten or table reset to fix login.

## Verification and maintenance

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run db:generate        # Detect/generate intentional schema changes
npm.cmd run db:studio          # Local inspection only
npm.cmd run db:check           # Transaction-only, rolled-back account fixtures
npm.cmd run auth:generate      # Installed Better Auth reference schema
```

The schema includes authentication, accounts, preferences, immutable import sources, and Day 4 derived journal/source links, processing state, fee settings and per-portion fee provenance. No rule-engine schema is added. Generated reference auth schema is for comparison; `db/schema.ts` is the application schema. Review SQL before applying it. Migrations never run during page requests. No reset/drop command is used.

For browser verification, start a preview on the test origin in a separate terminal:

```powershell
npm.cmd run build
$env:BETTER_AUTH_URL = 'http://127.0.0.1:3100'
npm.cmd run start -- --hostname 127.0.0.1 --port 3100
```

In the test terminal, use the same test origin and an intended disposable development database:

```powershell
$env:BETTER_AUTH_URL = 'http://127.0.0.1:3100'
$env:MSJOURNAL_TEST_DISPOSABLE = 'true'
npm.cmd run test:browser
```

Chrome must be installed. Authenticated suites require verification disabled for local disposable emails. They create random users through supported APIs/UI and clean up only their own marked fixtures, never existing user records. Tests cover signup/onboarding, sign-out/sign-in, existing supported credential records, refresh sessions, two-user account/settings isolation, scoped broker-ID uniqueness, archive/restore, real/demo separation, and responsive auth screens. A captured in-process email callback tests the library's reset-token/session flow without sending email; it is not a replacement provider in the app. Real Resend recovery/verification delivery remains unverified until credentials and a sender are configured.

The unchanged dependency audit reports nine advisory entries in development tooling: the Next lint chain and Drizzle Kit's legacy esbuild loader. Forced fixes propose incompatible downgrades and were not applied.

Day 3 verification originally passed all seven existing browser checks. The workflow/timezone revision passed the production build, strict type-check, ESLint and all **39 automated checks**, including live Neon rollback/concurrency/retry/isolation checks and source-timezone correction conflicts. All **three focused import browser checks** passed across the run and corrected-selector rerun: Performance-only save without Orders, immediate wrong-report errors, searchable zones, remembered source choice, display preference changes after preview, identical re-upload, private history/details, cross-user denial, both themes and mobile. Updated screenshots in `artifacts/day-three-performance-*.png` contain only synthetic fixtures. Disposable fixtures were cleaned up; existing imported data was preserved. The supplied private files previously validated as 124 Orders and 43 Performance rows without importing or committing their contents. Actual Resend email delivery remains unverified and outside Day 3.

Day 4 verification passed the production build, strict type-check, ESLint, all **47 automated checks** (including disposable Neon transactions), and the focused end-to-end browser scenario. The final fee-clearing regression rerun also passed: clearing a manual allocation preserves other portions' historical estimates. Browser coverage includes Performance-only import and automatic processing, refresh persistence, manual zero, configured estimates, real dashboard totals, processing retry, cross-user 404/unauthenticated 401, explicit Demo separation, both themes, mobile containment, and absence of console/page errors. Screenshots `artifacts/day-four-dashboard-*.png`, `day-four-fees-mobile.png` and `day-four-record-mobile.png` contain only synthetic fixtures. The additive migration was reviewed/applied to the configured development database. A read-only check confirmed all existing 43 Performance records remain intact and their normalized values match preserved raw sources. Existing private imports were not reprocessed on your behalf; use Trade View's processing control. Full flat-to-flat positions, actual broker fees, large-history performance, and actual Resend delivery remain unverified; the UI does not claim these are available.

## References and scope

Configuration follows installed Next.js guides, [Better Auth email/password authentication](https://better-auth.com/docs/authentication/email-password), [email verification](https://better-auth.com/docs/concepts/email), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle) and [Resend Node.js delivery](https://resend.com/docs/send-with-nodejs). Source/derived processing follows [Papa Parse](https://www.papaparse.com/docs), [date-fns timezone utilities](https://github.com/date-fns/tz), [decimal.js](https://mikemcl.github.io/decimal.js/), [Drizzle transactions](https://orm.drizzle.team/docs/transactions) and [PostgreSQL upserts](https://orm.drizzle.team/docs/guides/upsert). Work stops at Day 5; no broker connections or public deployment.

## Full trading calendar (Day 5)

Open **Calendar** (`/calendar`) for the full month view, or use the compact calendar in the dashboard's existing lower section. Both use the same component and Day 4 realized calculation layer. The compact calendar inherits dashboard account/date/contract/direction filters; its month and basis are independent URL parameters. The full page persists month, accounts, archived scope, gross/net basis, Grid/Agenda view and selected day in its URL. Browser back/forward and refresh preserve those choices; the sidebar remembers the last calendar destination during the private session. Calendar navigation uses Next.js's supported native history integration, so month/day changes do not reload the dashboard's entire trading history.

**Setup:** no additional environment variables or dependencies. Review additive migration `drizzle/0003_red_lady_deathstrike.sql`, then apply it:

```powershell
npm.cmd run db:migrate -- --reviewed
npm.cmd run dev
```

This migration adds a default-Sunday `week_starts_on` preference with a Sunday/Monday constraint, plus an owner/account/actual-exit index. It does not delete or rewrite imported data. Choose Sunday or Monday and any valid IANA **Journal display timezone** in Settings; both are persisted in Neon. Source timezone and UTC timestamps remain unchanged.

**Daily allocation and counts:** each Performance matched portion contributes its gross amount on the local date of its actual exit (`max(bought_at, sold_at)`). Calendar cells and day summaries count each published grouped journal record once per active day and label it a trade. Related partial exits on the same day are combined for the count and gross/net win percentage. Exits on different days stay on their actual dates, so the same trade can count on multiple active days. Daily P&L, fee coverage and unknown fees remain unchanged. Day drawers show the corresponding grouped records, daily closed quantity, last exit time and full-record links. These groups use existing shared-fill relationships; Performance history still does not verify complete flat-to-flat positions. Demo counts its existing complete closed trades.

**Fees:** gross is the default. A complete net selection requires known fees for every included portion; unknown amounts remain unavailable. Any estimates make the label **Estimated net P&L**. If coverage becomes incomplete, an explicitly requested net view falls back to gross with an explanation. Manual group totals reuse Day 4's stored allocation: proportional to closed quantity, truncated to eight decimal places, with the exact remainder assigned to the last source ID in sorted order. Fees are subtracted once on each source portion's exit day, never repeatedly as a full group total.

**Presentation and summaries:** compact monthly P&L and activity-day badges sit in the month header. Day numbers sit at the upper right; empty cells remain date-only. Weekly cards show Week X, P&L and activity days. Each displayed row includes only dates in that month and active filters; exact decimal weekly totals reconcile to the monthly total. Expand **Month details** for profitable/losing/breakeven days and best/worst active days. Empty months have no fabricated best/worst days or success percentage. Empty days mean no published realized records in scope, not proof that no trading occurred or that CSV coverage is complete. Use **This month**, previous/next, or the English month/year picker. **Calendar settings** contains account/archived selection, basis, and links to saved timezone/week settings; the compact calendar uses the dashboard's global account filters. The basis tooltip explains unknown/estimated fees. Mobile defaults to an agenda with full readable results and offers a compact grid; desktop has weekly columns. Day details use an accessible, keyboard-trapped drawer with Escape and previous/next day controls.

**Account scope and server performance:** all selectors contain only the signed-in user's own accounts. All accounts means unarchived unless **Include archived accounts** is explicitly enabled. Archived historical accounts remain available without being eligible for new imports. USD is the only supported currency; there is no FX conversion. Month and lazy day queries validate scope on the server, apply owner conditions to sources/links/fees, use IANA civil-midnight UTC boundaries (including 23/25-hour DST days), and return `private, no-store` responses. No per-day query loop or whole-history calendar query is used. Repeatable-read snapshots keep fees and published sources consistent. Pending/failed processing, request failures, and empty results are distinct.

**Return-navigation loading fix:** the original request state lived inside the calendar component, so a route remount lost results; manual refresh also hid the current data. A small memory-only cache now lives in the persistent authenticated layout. Keys include the authenticated user ID, display timezone, USD, week preference, month/day, real/demo mode, accounts, archived scope, basis and active filters. API response identity is checked before reuse. At most 24 queries are retained for ten minutes, with a 30-second freshness window. Fresh same-selection returns reuse results immediately; stale returns, focus/visibility, successful private mutations and manual refresh revalidate in the background. Processing, fee, account and preference mutations invalidate entries; preference updates refresh the server layout. Logout, session/user changes and cross-tab logout notifications clear the cache. The cache does not persist journal data to browser storage or bypass server ownership checks. Older responses cannot replace a new selection. Uncached selections show a calendar-shaped skeleton without the previous month's totals. A background failure keeps saved results visible with a stale notice and Retry; an initial failure shows a distinct error. Refreshing the browser starts a new memory cache.

**Demo:** open `/calendar?mode=demo&month=2026-03` or the existing dashboard Demo switch. Both use the original fictional January–March dataset without writing demo records to Neon. Calendar grouping follows the saved journal timezone; legacy Day 1 demo charts retain their documented Asia/Jerusalem grouping. Select net to compare those existing net charts with the calendar. Single-account/filter selections also expose the fixture's breakeven closed trades.

Focused verification commands:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
$env:MSJOURNAL_TEST_DISPOSABLE='true'
npm.cmd test
# With a loopback preview running on 127.0.0.1:3100 and matching BETTER_AUTH_URL:
npm.cmd run test:browser -- browser-tests/day-five.spec.ts
npm.cmd run db:check:journal
```

Tests use randomly identified disposable users and synthetic CSV data, with guarded cleanup. No private CSV files or credentials are committed. Day 6 trade-list expansion, notes, screenshots, advanced analytics and prop firm rules remain outside this milestone.

The Day 5 calendar refinement passed **56 automated checks**, the production build, strict type-check and ESLint. Focused Chrome checks covered cached return from Settings with preserved Agenda/basis/month, a held older-month response, an uncached-selection skeleton without old totals, fee-update invalidation, background failure retaining results and Retry, unchanged daily/weekly/monthly allocation, both themes, mobile containment, day drawers, demo separation and server-side isolation. The read-only integrity check confirmed all existing **43** Performance sources remain intact. No migration or new environment variable is needed for the refinement. Large-history benchmarking remains unverified.

Before/after captures use synthetic accounts only: original `artifacts/day-five-calendar-*.png` captures are retained; refined captures are `artifacts/day-five-refined-calendar-*.png` and `artifacts/day-five-refined-dashboard-*.png`, including mobile and drawer views. The supplied TradeZella reference was readable; the two current-state screenshots mentioned in the refinement document were not attached, so the original Day 5 captures were used as the baseline.

Follow-up: active calendar cells show three compact lines matching the requested reference: P&L, “1 trade” / “N trades”, and the numeric win percentage. Demo uses complete trades; real counts still use closed report portions, with this limitation explained in the count tooltip and day details. The percentage follows the selected gross/net basis and includes breakeven results in its denominator; unknown fees never count as zero. The client cache key was versioned to discard older responses without daily win counts. Only a type-check was run for this small follow-up, as requested; the captures above predate these additional lines.

Day 5 verification passed **53 automated checks**, including disposable Neon reconciliation/isolation tests, plus the production build, strict type-check and ESLint. The focused browser scenario passed partial exits across months, zero versus empty days, unknown/estimated fees, saved Sunday/Monday and timezone regrouping, URL refresh/back navigation, drawer keyboard behavior, account selection and archived inclusion, a simulated availability failure/retry, compact dashboard data, explicit demo separation, cross-user 404 and unauthenticated 401, both themes and mobile containment, with no unexpected console/page errors. Synthetic-only screenshots are in `artifacts/day-five-calendar-*.png`. The additive migration was reviewed and applied to the configured development database; a read-only integrity check confirmed the existing 43 Performance sources remain unchanged. Existing private imports were not processed or modified for these checks. Real complete-trade reconstruction, actual broker fee reconciliation, large-history load benchmarking, and email delivery remain unverified; the calendar does not claim verified complete-trade coverage.

## Trade View (Day 6)

Open **Trade View** (`/trade-view`) from the existing sidebar. The existing journal list and detail route are extended; there is no duplicate journal system. Desktop uses a compact sortable table, mobile uses readable record links, and both themes share the original MSJournal shell. Click a row or its **Open** link to inspect a record. Detail URLs work directly; previous/next navigation follows the entire filtered order across page boundaries. Back to Trade View restores the query, page, cached results and remembered scroll position. The sidebar remembers the last Trade View selection during the authenticated session.

**Filters:** multiple accounts, explicit archived inclusion, start/end dates, exact contract, reliably parsed futures product/root, long/short/unknown direction, profitable/losing/breakeven outcome, record type, grouping/review status, gross/net basis and optional minimum/maximum P&L. Search is debounced and only searches contracts and account display names. Active chips are removable; **Clear all** resets the selection. Supported sorts include close/entry timestamps, duration, closed quantity, gross/fees/net, account and contract. Sorts have an ID tie-breaker and unknown values sort last. Pages are bounded to 10/25/50/100 records. Columns and density persist in browser storage under the authenticated user ID; **Reset to defaults** restores the standard table. Preferences are specific to that browser, not synchronized across devices.

**Date behavior:** the default **Closed in range** selects by final close and includes the selected record's full result. **Realized activity in range** selects portions by their actual exit and shows only their selected-period gross/fee/net contributions. Its amount is labeled **P&L in range**. Day boundaries use the saved IANA journal timezone, including DST; UTC sources are unchanged. Open a calendar day drawer and choose **Open this day in Trade View** to preserve the day, accounts and displayed P&L basis in realized-activity mode. The drawer's full-record link also carries this scope and returns to its original month/day. Detail summaries distinguish the full record result from the selected-period amount, show daily realized contributions and expand source import references.

**Financial integrity:** each published parent appears once; its constituent sources never appear as extra top-level rows. Current real processing verifies matched portions and shared-fill groups, not complete flat-to-flat trades. These remain closed-portion records with local explanations; complete-trade count is zero and trade win rate is omitted for real records. Complete fictional Demo trades use the same deterministic dashboard/calendar fixture and have stable detail URLs (`?mode=demo`); unknown demo quantities/prices remain unavailable. No candles, risk ratios or execution feed are invented. Duration is a supported reported interval, not verified full-position duration. Quantity means total closed quantity, never maximum position size.

Unknown fees keep net unavailable; explicit zero is retained. Any estimated allocation marks the net summary as estimated. Incomplete fee coverage is shown alongside the available gross total. Existing manual-fee controls and quantity allocation are reused. USD is the only supported currency; no currency conversion is performed.

**Query/cache behavior:** filtering, numeric sorting, pagination, full-selection summaries and neighbor selection run on the server in one repeatable-read snapshot. The browser receives only a bounded page and aggregate metadata; details load only their own contributing sources. List/account/detail access uses the server session and ownership conditions. The persistent layout reuses the calendar's bounded memory cache with endpoint/user/timezone/scope keys, identity checks, immediate cached returns, quiet background refresh and protection against out-of-order responses. New uncached selections show table skeletons, never the previous selection's totals. Import/processing/fee/account/preference changes invalidate results; logout/user changes clear private data and scroll memory. Empty imports, no matches, pending processing and fetch failures have distinct actions. No private journal results persist in browser storage.

**Setup:** no dependency, schema migration, environment-variable change, regrouping or source-data edit is required. Existing Day 4/5 migrations still apply. No public deployment, notes, screenshots, tags, strategies or Day 7 features are included.

Focused verification commands:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
$env:MSJOURNAL_TEST_DISPOSABLE='true'
npm.cmd test -- tests/trade-view.test.ts tests/journal-db.integration.test.ts tests/calendar.test.ts tests/calendar-cache.test.ts tests/journal.test.ts
# Match the loopback preview's origin:
$env:MSJOURNAL_BROWSER_ORIGIN='http://127.0.0.1:3100'
npm.cmd run test:browser -- browser-tests/day-six.spec.ts
```

The browser scenario and database regression use disposable synthetic users with guarded cleanup. Existing private imports are not reprocessed for verification. Large-history load benchmarking and real complete-trade reconstruction remain outside the verified coverage. Work stops after Day 6.

Day 6 verification passed 23 focused regressions plus the synthetic Chrome scenario, strict type checking, ESLint and the production build. Coverage includes combined server filters and numeric sorting across pages, full-result summaries, parent/portion reconciliation, closed-date versus selected-day activity, DST boundaries, unknown/zero/estimated fees, cross-user denial, record navigation across page boundaries, cached return while the API is unavailable, saved columns/density, explicit Demo separation, and desktop/mobile containment in both themes. Reviewed synthetic-only captures are `artifacts/day-six-1440-{light,dark}.png` and `artifacts/day-six-390-{light,dark}.png`. The read-only integrity check confirmed the existing 43 Performance sources still match their preserved raw values. No migration was applied and no private import was reprocessed.


## Trade reviews (Day 7)

Open a record from **Trade View**, or choose **Review** in a calendar day drawer. **Overview** retains the existing financial details; **Review** provides five optional plain-text notes, before/during/after emotion chips, built-in and private custom mistake tags, and optional plan adherence. **Screenshots** holds private chart references. The compact financial summary stays visible while writing. The review belongs to the whole parent record; calendar pencil indicators mean that at least one contributing record on that day has review content or was explicitly reviewed. They follow the saved timezone and visible account/filter scope, including records spanning days. Calendar return preserves its month and selected day.

Notes preserve paragraphs, are safely rendered as text, and have a 5,000-character limit per field. Saves are debounced by 900 ms and serialized. **Save now** and retry are available; “Saved” appears only after a server acknowledgement. Edits made while a request is in flight remain current. Revision conflicts keep local input and offer comparison, explicit replacement with the saved version, or an explicitly confirmed save of your version. Failed saves keep input and warn before leaving. Private notes are not copied to localStorage. Opening an empty review does not create a database row.

**Unreviewed** means no meaningful content and no explicit completion; **Draft** means notes, emotion/tag selections, plan assessment or ready images exist; **Reviewed** requires **Mark reviewed**. All fields remain optional. Later edits stay reviewed until **Return to draft**. Plan adherence is independent of profit; empty mistake selections mean unspecified. Custom tags support rename, archive and restore, case-insensitive uniqueness within the user's collection, and preserved historical archived assignments. Archived tags are hidden from new-selection defaults. Trade View has note/image indicators, an optional Review status column, review/content filters and advanced mistake, emotion stage/value and adherence filters across the full server-side selection. Review edits invalidate list/indicator metadata without recalculating calendar financial history. Demo reviews are deterministic and read-only.

**Preservation:** reviews have stable IDs, account/owner-scoped foreign keys, an original immutable source-ID snapshot, and active source links. Unchanged source sets survive reprocessing and identical report uploads. A changed/split/merged group is conservatively detached and flagged; its notes, tags, state and images are kept, even if processing reused a derived record ID. The recovery link in Trade View/details opens `/trade-view/review-recovery`. Inspect the preserved source IDs and a current record, then explicitly attach the review to a record in its original account. A target with an existing review is rejected; no automatic copying or note merging occurs. Reassignment replaces active links while keeping the original snapshot. No manual financial regrouping is added.

### Private screenshots

The additive migration is `drizzle/0004_trade_reviews.sql`. It creates review, tag, source-association and attachment-metadata tables; it does not rewrite imports, fees, preferences or financial sources. After reviewing it, run `npm.cmd run db:migrate -- --reviewed` against the intended database. It was applied to the configured development database for this milestone.

No object storage existed, so Day 7 adds one S3-compatible implementation using the [official AWS JavaScript SDK](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html) and [Sharp](https://sharp.pixelplumbing.com/api-constructor/) for decoded image validation, metadata stripping and thumbnails. No bucket or paid service is provisioned. Missing credentials show a clear setup state; written reviews and tags still work.

Set these **server-only** values in `.env.local` or your server's secret environment, then restart the application:

| Variable | Value |
| --- | --- |
| `SCREENSHOT_S3_BUCKET` | Existing private bucket name |
| `SCREENSHOT_S3_REGION` | Bucket region for AWS; `auto` for R2 |
| `SCREENSHOT_S3_ACCESS_KEY_ID` | Dedicated access key scoped to this bucket |
| `SCREENSHOT_S3_SECRET_ACCESS_KEY` | Its secret; never a `NEXT_PUBLIC_` variable |
| `SCREENSHOT_S3_ENDPOINT` | Empty for AWS S3; `https://ACCOUNT_ID.r2.cloudflarestorage.com` for R2; HTTPS endpoint for other compatible storage |
| `SCREENSHOT_S3_FORCE_PATH_STYLE` | `true` only if the endpoint requires path-style addressing; otherwise `false` |

Keep the bucket private, disable public access/public URLs, and give the application's credential `s3:GetObject`, `s3:PutObject`, and `s3:DeleteObject` on `arn:aws:s3:::BUCKET/reviews/*` (or equivalent R2 object read/write permissions restricted to that bucket). Bucket listing is not required. The browser never contacts storage directly, so bucket CORS is not needed. Check encryption and retention settings appropriate to your chosen provider. Do not commit credentials or original chart files.

File selection, drag/drop and focused image paste accept static PNG/JPEG/WebP only. The server validates actual bytes and decoded images, with **10 MiB per file, 10 attachments per record, 16,000 pixels per side and 40 megapixels total**. Original filenames are not used as keys. Images are decoded, rotated and re-encoded at high quality without metadata; 1,200 × 900 inside-fit WebP thumbnails preserve an appropriately detailed full-size view. The viewer supports 50–300% zoom, captions (500 characters), stage, ordering and confirmed removal. Limits are checked before upload and again during finalization; attachments appear only after both object writes and ready metadata succeed.

Every image read/mutation verifies session, owner and parent scope. Authenticated image endpoints use `private, no-store`, vary on cookies, and bypass shared Next image optimization. URLs contain attachment IDs, never storage keys or credentials. Pending uploads and deletion markers form a durable cleanup ledger. **Retry pending removal / clean abandoned uploads** deletes pending uploads older than one hour and retries failed deletions (up to 50 per run), checks that ready attachments do not reference the object, and retries idempotently after partial storage failures. A pending deletion is hidden from the review even if object removal must be retried. Save review edits before changing images to avoid revision collisions.

### Verification

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd test -- tests/reviews.test.ts tests/trade-view.test.ts tests/calendar-cache.test.ts
$env:MSJOURNAL_TEST_DISPOSABLE='true'
npm.cmd test -- tests/journal-db.integration.test.ts
$env:MSJOURNAL_BROWSER_ORIGIN='http://127.0.0.1:3100'
npm.cmd run test:browser -- browser-tests/day-seven.spec.ts browser-tests/day-six.spec.ts
npm.cmd run db:check:journal
```

Database and browser checks use guarded disposable synthetic users. Image service tests use real encoded PNG/JPEG/WebP bytes and mocked object transport; they do not claim a live S3/R2 upload. No storage credentials are configured for end-to-end storage verification. Real provider permissions, network failure behavior and live uploads remain unverified until configured. Work stops after Day 7; analytics are not included.

Day 7 verification passed **33 automated checks** (28 focused unit/regression checks and 5 disposable database cases), both Day 6/7 Chrome scenarios, strict type checking, ESLint and the production build. Coverage includes paragraph reload, serialized rapid saves, delayed-read protection, failure retention, two-tab conflicts, reviewed/draft semantics, private/archived tags, real decoded-image validation, mocked storage publication/failure/cleanup and cross-user denial, source-set preservation and explicit recovery, selective cache invalidation, calendar return state, read-only demo reviews, desktop/mobile containment and both themes. Synthetic-only captures are `artifacts/day-seven-{1440,390}-{light,dark}.png`. The configured development database received the reviewed additive migration. Live S3/R2 uploads remain unverified because storage credentials are absent.

The final read-only integrity check confirmed all **43 existing Performance sources** still match their preserved raw timestamps, quantities, prices, fill IDs and gross P&L. Verification did not reprocess private imports. The earlier uncommitted Day 5 calendar refinements remain preserved separately in the working tree.

## Day 8 — Reports

`/reports` provides Overview, Breakdowns and Trading behavior within the existing private shell. Shared URL filters include inclusive local date ranges and presets, one/multiple/all owned accounts, archived-account inclusion, product/root and exact contract, gross/net P&L and explicit fictional Demo mode. Dates use the saved journal display timezone; change it in Settings. Reports require a single USD currency and never convert or combine currencies. Custom ranges are limited to 3,660 days.

Overview defaults to **realized activity**: exit portions realized within the selected local dates, with only their gross P&L and allocated fees. Daily results reconcile with the calendar on equivalent filters. Active days are days with imported realized activity, including zero-result days. The average divides total P&L by those days; best/worst use every active day, including all-positive or all-negative ranges. Missing dates indicate no imported activity, not confirmed absence of trading.

Cumulative realized P&L begins at zero at the selected range's start. End-of-day drawdown is cumulative daily P&L minus its running peak, including that initial zero. Maximum drawdown is the absolute monetary magnitude of the lowest drawdown. It resets with the range and describes end-of-day realized results, without intraday, unrealized-equity or prop-firm-rule calculations.

**Complete trades** use full results for verified complete trades whose final close falls within the range. Win rate divides winning trades by all included trades, including breakevens. Profit factor divides positive P&L by the absolute negative P&L; absent losses or empty selections have descriptive results instead of Infinity/NaN. Averages use their stated trade denominator. Unknown fees keep eligible net totals, averages, classifications and curves unavailable rather than treating fees as zero or dropping records. Estimated net is labeled.

The current real-import processor publishes closed portions and shared-fill groups, **not verified complete trades**. Realized reports remain usable; complete-trade charts show a coverage panel. Demo uses the existing deterministic complete-trade fixture. Reporting does not change grouping rules, source data, fees or saved reviews.

Breakdowns compare accounts, product/root (keeping micro and standard instruments separate), exact contracts, local exit/final-close weekdays and supported direction, including unknown direction. Entry hour and holding duration require complete trades. Holding buckets are **[0, 60), [60, 300), [300, 900), [900, 3600), [3600, ∞) seconds**. Unknown entry/duration values are excluded from those groups with explicit counts. Tables show USD totals, sample sizes and the average's active-day or complete-trade denominator.

Trading behavior defaults to reviewed complete trades and offers a separate **closed-portion record** comparison without complete-trade win-rate claims. Plan adherence, mistakes and Before/During/After emotions keep unset values in “Not recorded.” Multi-tag filters use OR; each record contributes once within each group. Overlapping groups are not additive. Reviewed/draft/unreviewed coverage is measured before review-specific filters. Unresolved associations across the selected accounts/instruments are counted separately and excluded from outcomes. Archived tags retain their historical names. Results describe associations, with a small-sample note; no causal or coaching claims are generated.

Daily bars and group/table links open Trade View with the same account/instrument, date basis, monetary basis and review filters. Narrow weekday, entry-hour, holding-duration, multi-mistake and missing-review-choice filters extend the existing server contract. Realized activity drills show the selected portions' contribution inside their published parent records; parent close dates can fall outside the selected activity range. **Back to Reports** restores tab, filters, comparison selection and scroll position.

One private report request supplies the server-calculated charts and tables for a selection. The response contains aggregates and owned metadata, never note bodies, screenshot URLs or the complete record history. Structured review projections load only for Trading behavior. The existing memory-only cache is scoped by session, timezone, USD and URL selection: 24 entries, 30-second freshness and 10-minute retention, with request abort/stale-response protection. Financial/account/timezone mutations invalidate reports; review/tag mutations invalidate behavior reports while preserving financial reports. Returning uses cached data and quietly revalidates when appropriate.

No new dependencies, environment variables or database migrations are required beyond the existing Day 7 setup. Day 8 does not require screenshot storage credentials.

Focused verification commands:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd test -- tests/reports.test.ts tests/trade-view.test.ts tests/calendar-cache.test.ts tests/imports.test.ts
$env:MSJOURNAL_TEST_DISPOSABLE='true'
npm.cmd test -- tests/reports-db.integration.test.ts
$env:MSJOURNAL_BROWSER_ORIGIN='http://127.0.0.1:3100'
npm.cmd run test:browser -- browser-tests/day-eight.spec.ts
npm.cmd run db:check:journal
```

Day 8 verification passed 27 focused unit/regression checks, one disposable database scenario, strict type checking, ESLint and the production build. Checks cover local partial exits, calendar and Trade View reconciliation, missing/estimated fees, breakevens and zero denominators, initial-zero drawdown, all-positive/all-negative active days, exact duration boundaries, overlapping tags, missing review fields, archived tags, unresolved associations and cross-user account/tag denial. Chrome verified real/demo selections, daily-bar and duration drills, private behavior payloads, selective review cache invalidation, cached return with requests blocked, tab/filter/scroll restoration, reduced motion and desktop/mobile containment in both themes. Synthetic captures are in `test-results/day-eight-Reports-real-dem-1af05-r-privacy-themes-and-mobile/reports-{1440,390}-{light,dark}.png` (ignored by Git). The read-only integrity check confirmed all 75 existing Performance sources match preserved raw timestamps, quantities, prices, fill IDs and gross P&L; private imports were not reprocessed. Production-sized history performance and real verified-complete-trade reporting remain unverified. Work stops after Day 8.


## Finish Day 8 — connected real dashboard

The calendar/dashboard contradiction was a calendar label error: daily activity counted **Performance exit portions**, while the top metrics correctly refused to call shared-fill groups complete positions. A read-only audit found 75 portions linked to 41 current groups, zero unprocessed portions and zero pending accounts. The source has matched quantities, fill IDs, buy/sell timestamps and prices, but lacks executed inventory/unclosed remainder evidence. Shared fills prove association, not flat-to-flat account coverage. Grouping and stored sources were preserved; no Orders import is required and no private import was reprocessed.

The dashboard defaults to **Closed portions**. Its statistics selector affects winning outcomes, profit factor, winning/losing averages and entry-time points; daily realized P&L, activity and EOD drawdown retain local exit-date aggregation. Each portion contributes once; breakevens remain in the win-percentage denominator. A compact tooltip explains repeated portions in one position. **Complete trades** remains an explicit alternative with a precise coverage state and a button back to supported portion statistics. Real publication type and the complete-trade predicate live in `lib/journal/statistics.ts`, along with decimal outcome calculations used by Dashboard, Calendar, Trade View, Reports and the existing demo metric adapter.

Reports adds **Closed portions** under Analyze. Trade View adds Statistics basis and source-portion outcome filtering, so a winning portion inside a losing shared-fill parent drills correctly. Trade View rows still represent parent groups and show selected contributions; its portion summary counts source portions separately. Dashboard and calendar also share the explicit Unknown direction filter, without falling back to All. Dashboard links preserve effective monetary basis, account/date/symbol/direction scope, and a Back to dashboard return URL. Complete results are attributed to final close; realized results are attributed to each portion's exit. These counts are deliberately distinguished.

Unknown fees make the dashboard use **gross** results for the full selection; covered net and estimated net retain explicit labels. The profile uses raw winning-day/outcome percentages, profit factor, average win/loss ratio and explicit review completion with sample counts. No proprietary or arbitrary score is generated; absent meaningful review data is Not recorded. The heatmap reuses daily realized aggregation, includes focus/hover exact values and linked dates, and outlines zero-result activity. EOD drawdown includes the initial zero and resets with the selected range. Entry-time points use the earlier buy for longs and earlier sell for shorts, exclude ambiguous parent chronology and disclose exclusions. The chart displays the latest 500 supported points (other statistics use the full selection). Existing data has 72 supported entry portions and three excluded portions.

**Balance setup** reuses account opening balance and opening date. The baseline is immediately before 00:00 on that date in the account's saved reporting timezone, displayed with its UTC instant. It is not nominal account size. Each account independently adds realized P&L minus recorded fees and dated cash adjustments at or after its baseline. Earlier activity is included in the balance entering the displayed range; cash before the baseline is not added again. Balances include all instruments/directions regardless of performance filters. Combined balances include only USD accounts with baselines covering the whole displayed range and show covered/selected counts. Missing fees are labeled **Balance before unrecorded fees**; estimated fees are disclosed separately. These are journal estimates, not authoritative broker balances.

The inline adjustment form supports deposits, withdrawals and signed other adjustments with required explanations. Local times use the account timezone and reject ambiguous/nonexistent DST times. Adjustments are owner/account scoped, idempotent by request ID, and remain separate from trading P&L. Confirmed removal affects only the adjustment. The additive migration `drizzle/0005_account_balance_adjustments.sql` creates only the adjustment ledger, index and ownership foreign key; it was reviewed and applied to the configured development database with `npm.cmd run db:migrate -- --reviewed`. It does not alter imports, fees, reviews, screenshots or existing account settings.

Dashboard aggregate requests use the existing memory cache, session/timezone/USD scope, stale-response protection and scroll restoration. Review mutations invalidate review coverage without rebuilding calendar financial history. Balance/account/fee/import mutations invalidate dependent widgets. New payloads use cache schema v2 to avoid old calendar shapes. No real-account data is replaced with demo values. Large-history load benchmarking remains unverified; this milestone stops at Day 8.

Focused commands:

```powershell
npm.cmd test -- tests/dashboard.test.ts tests/reports.test.ts tests/calendar.test.ts tests/calendar-cache.test.ts tests/calculations.test.ts tests/trade-view.test.ts
$env:MSJOURNAL_TEST_DISPOSABLE='true'
npm.cmd test -- tests/reports-db.integration.test.ts
npm.cmd run test:browser -- browser-tests/finish-day-eight.spec.ts
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run db:check:journal
```

Finish Day 8 verification passed **35 focused calculation/cache regressions**, the disposable database reconciliation/privacy scenario, the final production build (including TypeScript), and ESLint. Chrome passed baseline setup, deposit/withdrawal saves, all/short/unknown filter scopes, balance independence, completed-trade coverage fallback, exact source-portion statistics, heatmap zero activity, cached return with dashboard requests blocked, point-to-details navigation, Reports reconciliation, reduced motion, and 1440/390 containment in both themes. Settled synthetic-only captures were visually inspected at `test-results/finish-day-eight-Finish-Da-83ea2-avigation-themes-and-mobile/dashboard-{light,dark}.png` and `dashboard-mobile-{light,dark}.png`; they remain ignored by Git. The final read-only audit, after guarded fixture cleanup, again found the original 75 sources, 41 published groups, no pending processing and 72 reliable entry portions, with all original source values intact. No private import was reprocessed and no existing review/image/manual fee was rewritten. Day 9 was not started.


### Dashboard reference redesign

The dashboard now uses compact split metric cards, a supported-measure radar, a 13-week violet activity heatmap, aligned chart rows, and a two-thirds-width calendar. Financial calculation services and existing stored data are unchanged. Radar ratio axes have a disclosed display cap of 3; no overall skill score is calculated. Secondary coverage, balance setup and cash adjustments expand on demand.

Visual comparison and the disposable-fixture screenshots are documented in [artifacts/dashboard-redesign](artifacts/dashboard-redesign/README.md). The existing focused dashboard browser check covers navigation, cached returns, balances, themes/mobile, and the reference-size card heights.


### Day 9 — Prop accounts, custom rules and progress

Open **Prop Accounts → Overview** to establish an explicit phase cutoff and observed baseline, then configure custom dated rules in **Rules**. Firm names apply no automatic policy. Completed prop days use independently confirmed IANA/reset settings; targets retain phase-to-date P&L across rule edits. Deposits/withdrawals stay out of trading profit, missing net fees remain incomplete, and manual dashboard snapshots remain dated observations rather than cash or P&L corrections.

Static and end-of-day trailing estimates, optional daily realized loss and the documented best-day consistency formula are supported. Intraday equity trailing uses manual snapshots; maximum contracts are a reference rule. Status/phase/reset actions preserve history and require explicit user decisions. Currency remains USD. The dashboard's compact redesign is preserved, and prop-only updates retain cached financial navigation.

Reviewed additive migration `drizzle/0006_steep_thing.sql` was applied to the configured database. For another environment, review it and run `npm.cmd run db:migrate -- --reviewed`. See the [Day 9 setup, calculation conventions, limitations and verification guide](docs/day-nine.md). No database reset, official firm templates, reset expenses or Day 10 features are included.

### Day 10 — Daily preparation and trading-day journal

Use **Start my day** on the dashboard or **Day View** to prepare, write session notes and observations, and explicitly review/reopen your day. **Notebook** searches the same saved personal entries and edits future checklist defaults. Entries retain their calendar date, timezone and historical checklist; account filters only change current imported daily results. Autosave preserves newer/failed input and uses revision conflicts with explicit comparison. Daily review completion remains separate from trade reviews and profitability.

Reviewed additive migration `drizzle/0007_melted_talos.sql` creates private daily entries and checklist templates and was applied to the configured database. Other environments should review it and run `npm.cmd run db:migrate -- --reviewed`. See [Day 10 setup, save/date conventions and verification](docs/day-ten.md). Day 11 is not included.

### Day 11 — Strategies and playbooks

In-app confirmations use themed MSJournal dialogs with clear cancel/confirm actions, safe initial focus and Escape to cancel. Unsaved-writing prompts protect app links and browser history, including pages with several editors. Refreshing or closing the tab retains the browser's required native warning. TypeScript, scoped ESLint and one focused disposable browser scenario checked canceled navigation/history, retained writing, nested builder dialogs, confirmed removal and both themes at desktop/mobile sizes. The full suite and production build were not rerun for this visual update.

Open **Strategies → New strategy**, choose one of 13 editable ready templates or **Create your own**, and customize its name, rules and confirmations. Save reusable private structures through **My templates → New template** or **Save as template** in a playbook. Reusing a template creates an independent strategy; changing or deleting the template preserves existing strategies. Add private examples, then assign the strategy from an existing record's **Primary strategy** control. Assignments and daily preparation retain immutable playbook revision references. Editing a playbook preserves historical instructions/answers; adopting the latest snapshot explicitly resets checklist responses. Ordinary reprocessing retains unchanged classifications, while ambiguous regrouping uses the existing recovery destination.

Playbook Results and Reports compare user-assigned strategies and Unassigned using the existing decimal calculation layer, with separate complete-trade/closed-portion denominators, fee coverage and revision filters. Trade View adds optional strategy display/filtering, and Day View selects intended strategies without automatically classifying trades. Images reuse the existing private Day 7 storage configuration; text remains usable without it. Duplication copies text/checklist, not image files.

Reviewed additive migrations `drizzle/0008_overconfident_wild_pack.sql` (strategies) and `drizzle/0009_handy_wallow.sql` (private reusable templates) were applied to the configured database. Other environments should review them and run `npm.cmd run db:migrate -- --reviewed`. See [Day 11 setup, historical attribution, recovery and verification](docs/day-eleven.md).

### Day 12 — Exports, portable backups and release preparation

Use **Trade View → Export CSV** to download every record matching the current filters, up to 20,000 records; pagination does not restrict the export. The file preserves decimal financial values and unknown amounts, safely escapes spreadsheet text, and labels selected-filter amounts separately from full-record totals. It retains account/date/strategy/review/outcome/type and gross/net selections and includes UTC/local timestamps.

Use **Settings → Data & backups → Download my data** for a version 5 ZIP containing structured JSON and readable/structured manifests. It includes owned journal preferences/accounts/imports/sources/fees/balances/prop progress/reviews/daily entries/strategies/private templates/revisions/assignments and attachment metadata. Authentication credentials, sessions/tokens, environment secrets and other users' records are excluded. Structured records use one consistent read-only snapshot and are checked for ownership and relationship completeness.

**Include screenshots and playbook images** adds private originals and thumbnails as actual ZIP files. If retrieval fails, retry or explicitly confirm **Download partial archive**; missing files are recorded in the manifest. Structured export works without configured storage. Limits are 100,000 records, 16 MiB structured JSON, 200 image object files and 64 MiB per ZIP. No private archive is hosted at a public URL or persisted on local disk.

**Keep this archive for your records. In-app restoration is not available yet.** Portable archives do not replace database-provider backups. See the [archive format, safety and backup limitations](docs/day-twelve.md) and [deployment/release guide](docs/deployment.md) for required environment setup, official Neon recovery checks, reviewed migration commands, smoke checks and rollback guidance. Production auth URLs must use the final HTTPS origin; localhost configurations are rejected in production.

Mobile polish adds a scrollable short-screen navigation drawer, reachable journal/review/playbook save controls that track the visual viewport, larger writing text and touch targets, contained filter panels and an image viewer that fits short viewports. Existing desktop layouts, themes and private cached navigation remain in place.

This milestone does not deploy or provision anything, apply production migrations, modify provider plans/retention, or add prop firm expenses, reset costs or payout tracking. Verification and remaining release checks are recorded in the deployment guide.


## Progress Tracker (Day 13)

Open **Progress Tracker** for preparation checklist completion, explicit trade-review coverage, assessed plan adherence, daily review coverage, a daily heatmap, weighted weekly trends and recorded mistakes. The overview spans all owned accounts; saved personal journal dates remain unchanged. Closed-portion parent records are counted once, with their record basis explained. Missing assessments stay missing.

Create automatic preparation/review goals or a custom daily habit with dated Done / Not done / Not assessed check-ins. Goals use their own windows, can be edited or archived, and protect stale edits. Settings backups now use format version 5 and include goals and check-ins. Keep this archive for your records. In-app restoration is not available yet.

See [Day 13 details](docs/day-thirteen.md) for metric denominators, limits, privacy, migration `0010_windy_luminals.sql`, and verification. Apply reviewed migrations in other environments with `npm run db:migrate -- --reviewed`; no deployment is performed by this milestone.


## Broker fee totals and net P&L

Use **Trade View ? Fees & net P&L** (also available in Settings and account fee settings) to add or edit actual broker-reported trading fee totals. During a Performance import, expand **Trading fees & commissions (optional)** and enter the total for every Performance row in that file, including duplicates. Preview gross, fees and net, then confirm. Select **Net** on the dashboard to display after-fee results.

The account-specific **Fees & net P&L** workspace combines actual broker totals, saved fee history and an expandable **Automatic fee estimates** section. Account fee links open this same page. Estimates are optional, stay labeled as estimates, and preserve entered broker totals and manual fees. Unsaved changes are protected when switching accounts.

Totals reconcile once against immutable source records. Identical re-uploads do not add fees again; cumulative reports replace complete earlier totals only after confirmation, and partial overlaps are rejected. Per-record fees are labeled **Allocated**, because a report total does not establish individual broker charges. Estimates remain a fallback and preserve entered totals.

[Fee totals guide](docs/fees.md) explains scope, allocation, limits, privacy and checks. Apply reviewed migration `0011_illegal_korg.sql` in other environments with `npm run db:migrate -- --reviewed`; it is already applied to the configured development database. Archive format v5 includes fee-total history, source allocations and prop payout history. No new environment variables are required.


## Prop account rules and progress (Day 14)

Use **Prop Accounts > account > Configure progress tracking / Rules** to select an exact product/version or Custom, review editable drawdown/daily/position/consistency/payout rules, and start from a complete phase baseline or dated firm-dashboard snapshot. Overview shows targets, loss buffer, requirements and supported session results. **Payouts** logs requests, approvals, actual deductions and receipts separately; only an explicit deduction affects balance. Resets and funded transitions preserve old phases and require their own balance.

Official preset research covers selected exact combinations for Apex, MyFundedFutures, Lucid and Take Profit Trader; it is not universal coverage. [Preset coverage and specific gaps](docs/prop-preset-coverage.md) documents unsupported versions and rules needing manual confirmation. Performance.csv does not establish intraday equity highs or complete compliance; missing fees and opening history remain explicit.

Review/apply migration `0012_unusual_random.sql` in other environments with `npm.cmd run db:migrate -- --reviewed`. It is applied to the configured development database only. Settings data archives now use **v5**, including payout audit events and extended rule/snapshot/phase relationships. No new environment configuration or deployment was performed. See [Day 14 operation, calculations, migration and checks](docs/day-fourteen.md).


### Simplified prop setup (Day 14 refinement)

Prop Accounts groups compact progress cards by firm. **Add Account** and **Finish setup** open the same three-section guide: select exact product/stage/size, review or customize rules, and choose an actual starting balance or dated dashboard snapshot. Account, phase, rules and opening data save together. Existing imports are reused after an explicit cutoff preview; saved historical rules remain unchanged.

Topstep and FundedNext **Futures** presets join the existing firms, plus additional Apex EOD and Lucid Flex evaluation sizes. Unsupported combinations remain Custom. See [preset coverage](docs/prop-preset-coverage.md) and [setup, limitations and verification](docs/prop-setup-refinement.md).

No new migration or environment variables are needed for this refinement; original Day 14 migrations still apply. Backup format **v5** includes the added rule/snapshot metadata. In-app restoration remains unavailable. No deployment was performed.


### Firm-first account organization

Use **Prop Accounts ? Add Firm** to save a firm group, then **Add account** inside that group. The account setup starts with its firm already selected. Existing accounts are grouped automatically; empty saved firm groups persist across visits. Summary tiles show firms, active accounts, passed accounts and failed accounts. This does not add subscriptions or alter account history.

Reviewed additive migration `0013_orange_madripoor.sql` adds a firm-name preference with an empty default; apply it in other environments using `npm.cmd run db:migrate -- --reviewed`. It was applied to the configured development database. Firm names are private per user and included in the existing v5 data archive under `user_preferences.prop_firm_names`. No deployment was performed.


In **Add account**, choose **Custom account** to enter an unlisted size, product, stage and rules under any selected firm. TPT Test and PRO presets now include 25K, 50K, 75K, 100K and 150K with stage-specific verified parameters; agreement-specific gaps remain explicit. See [preset coverage](docs/prop-preset-coverage.md). No additional migration or deployment is needed for this size/custom-entry update.


### Visual prop account overview

Open an account name from **Prop Accounts** for a compact account/phase switcher, five summary metrics, a balance-versus-loss-threshold chart, proportional account-position markers, expandable requirements and an account-specific session calendar. Chart ranges include the full phase, 30 days and custom dates. Calendar months, selected dates, chart ranges and detail tabs remain in the URL and are remembered per user/account for the browser session.

Balances and buffers use the same calculation results as the account cards. The chart uses linear balance segments, stepped supported thresholds and isolated dashboard observations; it does not reconstruct intraday equity highs. Payout requests, approvals, deductions and receipts keep their own timestamps. Calendar amounts use saved firm-session rules, preserve gross/net/estimated labels, and link to the owned source journal records. Opening aggregate/daily facts remain in the progress requirements; the calendar's activity rows show imported source records.

See [overview behavior and checks](docs/prop-account-overview.md). No schema migration, new configuration, backup-format change or deployment is required for this presentation update.

Empty saved firm groups can be removed with the trash button in their header after confirmation. Firms with active or archived accounts cannot be deleted; accounts, imports and history are preserved. Prop-account card percentages use at most two decimal places for display, while rule calculations keep full precision.

When imports appear on the Dashboard but precede an initial evaluation phase, the account Overview shows **Review phase dates**. Preview the existing sources, confirm the actual balance before the corrected start and the original rules, then explicitly correct the start. Only the first open evaluation without snapshots or payouts is eligible. Original rule versions and imports remain intact, an audit event records old/new dates and balances, and the journal recalculates without a CSV re-upload. No migration is required.
