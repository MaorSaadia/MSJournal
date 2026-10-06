# MSJournal — Day 2, independent user journals

One Next.js application with Better Auth, Neon PostgreSQL and Drizzle. Anyone using the local website can create an account through signup; each authenticated user sees only their own trading accounts and preferences. The Day 1 dashboard, light/dark themes, emerald/violet palette, responsive layout and Motion animations remain intact. No CSV importing or Day 3 work is included.

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

`OWNER_EMAIL`, owner allowlists, `owner:bootstrap`, `owner:recover` and the owner-password environment inputs have been removed. A leftover `OWNER_EMAIL` in a private local file is ignored and can be removed. Existing user IDs, supported password hashes, trading accounts and settings are preserved: former owners are ordinary users. This revision changes no tables and requires no new schema migration.

## Email recovery and verification

In Resend, verify a sending domain using its DNS instructions, create a sending API key, then set `RESEND_API_KEY` and `AUTH_EMAIL_FROM`. Restart MSJournal. Do not use Resend's limited test sender as a general sender for independent users.

The forgot-password page uses Better Auth's supported token flow and a generic confirmation that does not reveal account existence. Reset emails contain a one-hour link. The reset page validates matching passwords, handles expired/invalid/used links, resets through Better Auth and returns to sign-in. Successful resets revoke previous database sessions; cached session cookies cannot restore access.

Missing email configuration disables recovery clearly without blocking local signup/sign-in. Failed Resend delivery returns an availability error instead of a fake success. Email sending is awaited to surface failures; before public release, review timing protection and durable email handling alongside the delivery/error policy. No plaintext passwords or reset tokens are stored in application logs. Auth request logging is disabled, links use `Referrer-Policy: no-referrer`, and the reset screen removes its token from browser history after reading it into memory. Configure any future proxy/hosting logs to redact authentication URL credentials too. Do not capture recovery URLs in analytics or tracing.

Email verification is prepared using Better Auth's `sendVerificationEmail` and `/verify-email` flow. With `AUTH_REQUIRE_EMAIL_VERIFICATION=false`, no verification gate or automatic verification email blocks local users. After configuring and testing Resend, set it to `true`. Signup then asks the user to verify; verification starts a supported session and opens onboarding. Existing unverified users must verify before signing in once the gate is enabled. Resend verification links from `/verify-email` if needed.

Before enabling public access: verify the sending domain and sender permissions, test actual recovery and verification delivery, set an HTTPS `BETTER_AUTH_URL`, retain a strong secret, and review rate limits and trusted proxy/IP handling. This project has not been publicly deployed.

## Private data and dashboard

Every business query and mutation derives the user ID from the server session. Reads, edits, archive/restore and settings are scoped to it. Client-supplied identity fields are rejected. The existing `owner_id` database column means record ownership, not an owner role; keeping it avoids rewriting data. Broker identifiers remain unique **per user/platform**, including archived accounts, and can be reused by another user. Sessions are database-backed, private API responses are uncached, and mutation origins are checked. No organizations, roles, teams or billing are added.

**My Accounts** shows only the signed-in user's unarchived accounts. URL selections are validated against that list, so IDs from another journal or archived accounts are removed. New users start with no real data; after creating accounts they see **No trades imported yet**. Ratios and current balances are unavailable. Nominal account size and optional dated opening balances are explicit metadata, never verified current balances.

**Demo** opens `/?mode=demo` behind login with a persistent **Demo data** indicator. The fixed fictional dataset covers January–March 2026, initially March. Fictional accounts and trades stay in `data/demo.ts` and are never inserted into Neon or attached to real accounts. Shared financial calculations, calendar, filters, heatmap, charts and read-only day details remain available. Daily grouping uses Asia/Jerusalem close dates; entry-time display can use other IANA timezones, including New York. Reporting timezones are stored for future imports, with no CSV interpretation yet.

Settings persist display name, display timezone and USD currency per user. Email is read-only. Theme stays with next-themes in the browser for fast startup. Financial inputs use exact decimal strings and PostgreSQL numeric columns; identifiers remain text. Archive preserves account history; the application does not offer hard deletion.

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

The schema includes only authentication tables, trading accounts and preferences. Generated reference auth schema is for comparison; `db/schema.ts` is the application schema. Review SQL before applying it. Migrations never run during page requests. No reset/drop command is used.

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

Revision verification: production build, strict type-check, ESLint and 25 focused tests passed. All five browser checks passed across the complete run and the rerun of the two corrected test selectors. Live checks covered separate journals, unchanged supported password records, refresh persistence, archive/restore, demo layout, reset/session revocation, themes and mobile screens. A separate loopback preview with an intentionally unreachable database returned the expected sanitized 503. Fixture cleanup returned the database to its original zero-user state. No real pre-existing user existed to test; compatibility was verified with a disposable pre-existing Better Auth credential. Actual Resend email delivery remains unverified.

## References and scope

Configuration follows installed Next.js guides, [Better Auth email/password authentication](https://better-auth.com/docs/authentication/email-password), [email verification](https://better-auth.com/docs/concepts/email), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle) and [Resend Node.js delivery](https://resend.com/docs/send-with-nodejs). Work stops at the revised Day 2 authentication milestone. No CSV importing, broker connections, trade reconstruction or public deployment.
