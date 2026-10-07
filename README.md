# MSJournal — Day 3, Tradovate source imports

One Next.js application with Better Auth, Neon PostgreSQL and Drizzle. Anyone using the local website can create an account through signup; each authenticated user sees only their own trading accounts and preferences. The Day 1 dashboard, light/dark themes, emerald/violet palette, responsive layout and Motion animations remain intact. Day 3 adds private, validated Tradovate Orders/Performance source imports. Trade reconstruction and real dashboard analytics remain outside this milestone.

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

After the reviewed migration is applied, sign in and open **Import Trades** in the sidebar (`/imports`). Create an **Active**, unarchived Tradovate account in **Prop Accounts** first. Choose that account, then upload an Orders report, a Performance report, or both. Drag/drop and the **Choose file** buttons work; remove or replace files before confirmation.

The parser was checked against the supplied real exports: 124 Orders rows (67 filled, 57 canceled) and 43 Performance rows. Original private exports are not repository fixtures and are not automatically imported. Only synthetic rows with fictional identifiers are committed.

Keep **Asia/Jerusalem** if your CSV uses Israel time; choose another IANA zone, such as **America/New_York**, only if the export uses it. The export date format is US **MM/DD/YYYY HH:mm:ss**, with Orders' additional **M/D/YY** date. Timestamps are converted to UTC using timezone rules. Ambiguous repeated hours and nonexistent DST times block the batch instead of guessing an offset. Original local strings and the chosen timezone remain traceable.

**Orders:** the report's `Account` must equal the selected account's configured broker identifier. If none is configured, inspect the source identifier in the preview and explicitly confirm its mapping. This never changes account settings. Multiple source accounts in one file are rejected. **Performance:** confirm its ownership explicitly; it contains no account identifier, and dates/symbols do not prove ownership.

Review counts, file-specific diagnostics, date ranges and paginated source rows. Expand **Original source values** for the full row. Any malformed row, account mismatch, or conflict blocks the whole batch. Check the confirmations and review again if needed. **Confirm import** resends the actual files; the server reparses them and checks ownership, duplicates and conflicts again. Success says **Source records imported**, with a link to private history (`/imports/history`) and saved file/row details. Imported rows do not populate net P&L, win rates, trade counts, balances or calendar statistics yet. **Demo** remains unchanged and explicit.

### Identity, overlap and retry policy

- Orders use the actual `orderId` string; `Order ID` must agree. Unchanged orders are duplicates. Any changed source values, including a different interpretation timezone, produce a review conflict. `Version ID`, `lastCommandId` and source timestamps are preserved, but the sample cannot establish reliable snapshot precedence. Day 3 never overwrites or silently appends conflicting snapshots. Obtain a consistent export or defer the conflict to a future reconciliation workflow.
- Performance uses the actual `(buyFillId, sellFillId)` pair and the complete multiset of source portions for that pair. Identical visible rows with different fill IDs are separate records. Repeated identical portions in one report are retained with occurrence numbers. An overlapping pair is deduplicated only when all its fingerprints and occurrence counts match; changed values or differing multiplicity block the entire batch. Reports must contain the complete set of portions for every overlapping fill-ID pair. Missing IDs are invalid. This conservative policy cannot distinguish unreported changes that reuse identical IDs and identical values; the format supplies no finer portion ID. Do not manufacture or alter source IDs to bypass conflicts.
- SHA-256 file hashes are kept as metadata; file hashes alone never decide overlaps. Fingerprints include all trimmed source field values and the source timezone; original untrimmed values remain in records/provenance. Even differences in export formatting can conservatively flag a conflict. No floating-point price/P&L arithmetic is used; values stay exact decimal strings and PostgreSQL `numeric(28,8)`.
- Preview issues a user-bound, payload-bound signed confirmation valid for 30 minutes. Changing files/settings requires another preview. Transaction-scoped account locks serialize confirmations; database uniqueness protects source identities, confirmation keys and provenance rows. Same-confirmation retries return the same batch. A fresh identical upload reports **Already imported**, creates a history receipt, and adds zero source records. New safe records in overlapping reports are added while existing records receive new provenance links.
- All files in a batch commit atomically. A validation conflict or database failure leaves no partial batch, file, record or provenance writes. Failed attempts are shown in the UI, rather than saved as successful history entries. Concurrent changes are rechecked at confirmation; a conflict requires a fresh preview.

### Limits and source semantics

Each file must be nonempty UTF-8, at most **5 MiB**, with at most **10,000 source rows**. At most one report per type is accepted, and the entire multipart request is capped at **11 MiB**, including streamed requests. All required headers from the inspected formats must be present, even when optional cells are blank. Extra columns are preserved with a warning. BOM, quoted commas, LF/CRLF and empty trailing rows are supported; internal empty/malformed rows are rejected. Row numbers refer to CSV records including the header, not physical lines inside quoted multiline fields. Numeric formats support US comma grouping, up to eight fractional digits and twenty integer digits; Performance supports `$123.45` and `$(123.45)`. Date support is limited to the verified formats and years 2000–2099. Other export formats may need a future parser version.

Canceled orders remain source snapshots; nonzero aggregate fills require fill quantity, average price and fill time. Orders do not prove individual executions. Performance rows are matched portions and may describe either long or short chronology; reported P&L is stored as **gross**, and missing fees remain unknown. No fee estimates or net trade results are calculated. Import history retains the latest 100 batches in its listing, with 25 source rows per details page; preview shows 20 rows per page. Archived accounts keep historical imports but cannot accept new ones.

No new environment variables or storage provider are required. The existing database URL and auth configuration are reused. Migrations run only through the reviewed command, never during requests. The Day 3 migration is additive: five source-import tables, ownership foreign keys and indexes; existing users, passwords, account settings and selections are preserved.

Run focused disposable database verification only against the intended development database:

```powershell
$env:MSJOURNAL_TEST_DISPOSABLE = 'true'
npm.cmd test -- tests/import-db.integration.test.ts
```

It creates only randomly named disposable users/accounts, injects a mid-transaction failure to verify rollback, verifies concurrency/retry/isolation, and removes only its own guarded fixtures. Browser imports use synthetic exports and the same fixture safeguards. Never use real records as disposable tests. Day 4 will reconstruct journal trades and reconcile source portions/fills; it will not reinterpret raw row counts as trade counts.

## Diagnose authentication

```powershell
npm.cmd run auth:diagnose
```

This read-only command loads the same environment, reports the nonsecret auth origin/cookie/email flags, checks Neon reachability, schema columns, migration history and counts of credential hashes compatible with the library's format. It does not print emails, passwords, tokens, connection strings or record IDs. Hash format alone does not establish how a password was originally created or prove password correctness.

During this revision the configured Neon database was reachable, all schema columns matched and migration history existed, but it contained **zero registered users and zero password records**. This explains invalid credentials before signup. There was no historical runtime trace establishing the earlier service failure; stale environment settings or transient connectivity cannot be claimed as its proven cause. Current credential failures return 401, service failures return a sanitized 503, origin failures and throttling have separate messages. No password was overwritten or table reset to fix login.

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

The schema includes authentication, trading accounts, preferences, and Day 3 source-import tables. No reconstructed-trade or rule-engine schema is added. Generated reference auth schema is for comparison; `db/schema.ts` is the application schema. Review SQL before applying it. Migrations never run during page requests. No reset/drop command is used.

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

Day 3 verification: production build, strict type-check, ESLint and all **38 automated checks** passed, including live Neon rollback, concurrent confirmations, retries, stale-preview conflicts and cross-user isolation. All **7 browser checks** passed: private CSV preview/confirm/history, explicit account mappings, repeated matched portions, identical re-upload, changed-order and ambiguous-overlap rejection, independent users, refresh persistence, signup/sign-in/logout, account lifecycle, the Day 1 demo dashboard, both themes and mobile layouts. The supplied private files validated as 124 Orders and 43 Performance rows; they were inspected without importing them or committing their contents. Screenshots in `artifacts/day-three-import-*.png` contain only synthetic fixtures. Disposable database fixtures were cleaned up; existing users and records were preserved. Actual Resend email delivery remains unverified and outside Day 3.

## References and scope

Configuration follows installed Next.js guides, [Better Auth email/password authentication](https://better-auth.com/docs/authentication/email-password), [email verification](https://better-auth.com/docs/concepts/email), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle) and [Resend Node.js delivery](https://resend.com/docs/send-with-nodejs). Day 3 parser configuration also follows [Papa Parse](https://www.papaparse.com/docs), [date-fns timezone utilities](https://github.com/date-fns/tz), [decimal.js](https://mikemcl.github.io/decimal.js/) and [Drizzle transactions](https://orm.drizzle.team/docs/transactions). Work stops at Day 3: no broker connections, trade reconstruction or public deployment.
