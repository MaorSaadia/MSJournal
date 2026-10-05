# MSJournal — Day 2

A private, single-owner futures journal. The existing Next.js/React dashboard now has Better Auth email/password authentication, Neon PostgreSQL through a reusable node-postgres pool, Drizzle, persisted trading accounts and settings. Use npm and the tracked lockfile. Geist fonts are bundled locally.

## Local setup

1. Install Node.js 20.9 or newer and run `npm.cmd ci`.
2. In Neon, select the intended **development branch** and database, or create a free development project/branch yourself. From **Connect**, choose the database role and the **direct/unpooled** PostgreSQL connection string. No services are provisioned by this project. Use an isolated branch for browser fixtures. Keep TLS enabled; `sslmode=verify-full` verifies the server certificate. The app uses its own small `pg.Pool` and interactive transactions. A direct connection also supports the owner command's session advisory lock.
3. Copy `.env.example` to `.env.local`. Configure these four variables locally; never send secrets through chat or commit them:

| Variable             | Value                                                       |
| -------------------- | ----------------------------------------------------------- |
| `DATABASE_URL`       | Your development branch's PostgreSQL URL                    |
| `BETTER_AUTH_SECRET` | Cryptographically random secret, at least 32 characters     |
| `BETTER_AUTH_URL`    | Exact application origin, initially `http://localhost:3000` |
| `OWNER_EMAIL`        | The single allowed owner's email                            |

Generate the auth secret with a password manager's random generator. No separate migration URL is needed. Next.js and the CLI load `.env.local`; process environment variables take precedence. HTTPS origins use secure cookies. Plain HTTP is accepted only on loopback for development. Open the same host and port as `BETTER_AUTH_URL`; `localhost` and `127.0.0.1` are different origins.

4. Review `drizzle/0000_faithful_gambit.sql`, then run:

```powershell
npm.cmd run db:migrate -- --reviewed
npm.cmd run owner:bootstrap
npm.cmd run dev
```

Bootstrap prompts twice for a 12–128 character password **without displaying it** and refuses duplicate owners. A securely injected `MSJOURNAL_OWNER_PASSWORD` process variable is supported for noninteractive terminals; never save the password in `.env.local`, scripts or shell history. The command uses an isolated local Better Auth API instance and library password hashing. It exposes no setup endpoint and never enables signup in the running application.

Open `http://localhost:3000/login`, sign in with your configured owner email and password, then choose **Prop Accounts → Add Account**. Create an Evaluation, Funded or Personal account. Personal accounts do not require a prop firm. Refresh after saving to reload from Neon. Archive preserves records, and restore makes them selectable again; hard deletion is unavailable.

Use `npm` instead of `npm.cmd` on compatible shells. Production preview: `npm.cmd run build`, then `npm.cmd run start`.

## Schema and maintenance

Only Better Auth's user, session, authentication-account, verification and rate-limit tables, `trading_accounts`, and user preferences exist. Authentication accounts are separate from trading accounts. Money uses PostgreSQL `numeric(18,2)` and exact validated decimal strings. Broker identifiers remain text. Owner foreign keys and server predicates protect records. A partial unique index reserves nonempty identifiers per owner/platform **including archived records**.

```powershell
npm.cmd run db:generate                  # Generate migrations after schema changes
npm.cmd run db:migrate -- --reviewed     # Apply reviewed, versioned SQL
npm.cmd run db:studio                    # Local database inspection
npm.cmd run auth:generate                # Installed Better Auth reference schema
```

`auth:generate` writes `drizzle/auth-reference.ts` for comparison; `db/schema.ts` is the application schema. Review generated SQL before applying it. Migrations never run during application requests. No reset/drop command is used. Studio can show private records; keep it local and close it when finished.

### Local owner password recovery

Stop the application, keep the same configured owner email, and run:

```powershell
npm.cmd run owner:recover
```

Enter and confirm a new hidden password, then restart the app. The local command uses Better Auth's supported request/reset APIs with a token retained only in its process. Password update and revocation of previous sessions run atomically. Database sessions and disabled cookie caching prevent old cookies from restoring access. No email provider, public reset endpoint or fake reset UI is included. Do not edit password hashes manually.

## Real accounts and explicit demo

**My Accounts** is the default dashboard. Only authorized, unarchived Neon accounts appear in its selector. Selected IDs persist in the URL and are validated; forged or archived IDs are removed. No accounts shows **Add your first account**; accounts without trades shows **No trades imported yet**. Results, ratios and current balances stay unavailable. Nominal size and an optional dated opening balance are entered metadata, never verified current balances.

**Demo** opens `/?mode=demo` behind the same private login. The Day 1 dashboard keeps its compact layout, emerald/violet palette, both themes, responsive navigation, charts, filters, calendar, heatmap and reduced-motion behavior. Its persistent **Demo data** indicator identifies the fictional content. Demo accounts/trades stay in `data/demo.ts`; they are never inserted into Neon or attached to real accounts.

The demo covers **January 1–March 31, 2026**, initially March. Four fictional accounts start at USD 50,000 on January 1. Explicit fictional cash movements: Evergreen +$250 on February 2; Northstar −$1,200 on February 12; Harbor −$850 on March 18. These are not firm-policy claims. Shared integer-cent calculations derive net P&L, rates, ratios, cumulative results, drawdown and balances. Undefined ratios show an em dash. Balance scope includes account/date filters and preceding results/cash movements; symbol/direction filters affect performance only. The radar is illustrative without an implemented scoring methodology.

Settings persist display name, default display timezone and USD currency in Neon. Owner email is read-only. Theme remains a browser preference through next-themes for fast startup. IANA reporting/display timezones support DST, including Jerusalem and New York. Demo close-day grouping remains **Asia/Jerusalem**, while entry-time display can change. Real account reporting timezone is retained for future imports; no CSV interpretation exists yet.

Public signup is rejected by the API and disabled in Better Auth. Private routes and every data service/mutation authorize the configured owner. Client-supplied owner IDs are rejected. Private API responses are uncached, mutations check the configured origin, and Better Auth provides cookie/origin protections and database-backed login rate limiting. Sign out revokes the session.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

Focused tests cover financial/date behavior, exact account inputs, duplicate-index scope, ownership predicates, forged input rejection, session policy and server signup rejection. Mocked service/session tests verify authorization logic, **not live Neon persistence**.

Day 2 verification passed: production build, TypeScript, ESLint, 19 focused tests, transaction-only live database checks, and the unauthenticated browser suite. The two authenticated browser suites were skipped because no owner/test password was configured. Light, dark and mobile login screenshots were captured and inspected.

For browser checks, configure `BETTER_AUTH_URL=http://127.0.0.1:3100`, then start the preview in a separate terminal:

```powershell
npm.cmd run start -- --hostname 127.0.0.1 --port 3100
npm.cmd run test:browser
```

The suite uses installed Google Chrome. Unauthenticated checks run without credentials: private-route redirects, private API denial, signup rejection, login appearance, theme persistence and mobile overflow. Screenshots save to `artifacts/day-two-login-{light,dark,mobile}.png`.

Authenticated checks are opt-in. On a **disposable Neon development branch**, migrate/bootstrap its owner and securely inject `MSJOURNAL_TEST_DISPOSABLE=true` and `MSJOURNAL_TEST_OWNER_PASSWORD` into the test process. Tests cover create/edit persistence after refresh, duplicates, archive/restore, validated selection, real/demo separation, mobile forms, logout and the original demo. Fixture accounts are archived instead of deleted. Never run fixtures against personal records. These suites skip without the required inputs.

A Neon connection became available during implementation and the reviewed migration was applied successfully. `npm.cmd run db:check` checks exact numeric/text storage, editing, owner predicates, duplicate protection for archived identifiers, archive and restore using temporary records inside a rolled-back transaction. It never commits fixture records. These database checks do not replace authenticated browser verification.

The configured owner email still contains the example address, and no owner was created. Replace `OWNER_EMAIL` locally and run `owner:bootstrap`. Authenticated refresh persistence, login rate limiting, recovery/session revocation and account-management browser workflows remain unverified until an owner is configured. Builds also work without credentials; missing configuration is explained on the login screen without fabricated authentication or storage.

## Scope and references

The dependency audit reports nine advisory entries in development tooling: the inherited Next lint chain (`braces`) and Drizzle Kit's legacy esbuild loader. npm's suggested fixes downgrade Next's lint configuration and Drizzle Kit incompatibly, so no forced downgrade was applied. These tools are not exposed as application endpoints.

CSV importing is the next milestone. No importing, reconstruction, live broker connections, prop-rule engines, payouts, file storage, billing or public deployment is implemented. Work stops at Day 2 for review.

Configuration follows installed Next.js guides in `node_modules/next/dist/docs/`, [Better Auth's Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [Next.js integration](https://better-auth.com/docs/integrations/next), [email/password](https://better-auth.com/docs/authentication/email-password), [rate limiting](https://better-auth.com/docs/concepts/rate-limit), [Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql), [migrations](https://orm.drizzle.team/docs/migrations) and [transactions](https://orm.drizzle.team/docs/transactions).
