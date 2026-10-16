# Deployment and release guide — preparation only

The repository has no selected hosting-provider configuration. Use an existing host that runs a persistent Node.js Next.js server with HTTPS and outbound access to Neon, Resend when enabled, and private S3 storage when enabled. `next start` supports the server routes this application requires; a static-only export does not. This follows the official [Next.js Node deployment guide](https://nextjs.org/docs/app/getting-started/deploying) and the installed version's self-hosting documentation. No account, infrastructure, paid service or deployment was created for Day 12.

## Environment and runtime

Use a supported Node runtime satisfying the installed Next.js package's engine requirement; match the runtime used to build and smoke-test the release. Install exactly from `package-lock.json`. Sharp must support the target operating system; install dependencies on that platform rather than copying Windows `node_modules` to Linux.

Required server secrets are `DATABASE_URL`, `BETTER_AUTH_SECRET` (random, at least 32 characters), and `BETTER_AUTH_URL` (the final exact HTTPS origin). Copy placeholders from `.env.example` for local development. In production, inject values through the host's secret environment; do not ship `.env.local`. Production localhost auth URLs are rejected. `BETTER_AUTH_URL` supplies Better Auth's trusted origin and the mutation origin check; there is no separate allowed-origins variable. The application does not introduce new signup restrictions or change email-verification policy.

Use the connection string for the intended Neon project/branch/database, with verified TLS. The pool currently permits five connections per application process; account for instance count when sizing the deployment. Verify the destination in the Neon console before release. In that intended environment, a read-only `select current_database(), current_user` in the provider's SQL console can help confirm database/role without exposing a connection URL in logs. Existing database-check scripts exercise rollback fixtures or read-only journal consistency; do not point disposable browser fixtures at production.

Optional email uses `RESEND_API_KEY` and `AUTH_EMAIL_FROM`; the sender must be verified in Resend. Set `AUTH_REQUIRE_EMAIL_VERIFICATION` to the existing desired policy only after delivery is verified. With verification false, signup/sign-in remain available without email, while recovery honestly reports unavailable delivery. Requiring verification without email configuration fails configuration validation. Actual delivery must be checked by the release operator; this milestone did not send email.

Optional private images use `SCREENSHOT_S3_BUCKET`, `SCREENSHOT_S3_REGION`, `SCREENSHOT_S3_ACCESS_KEY_ID`, `SCREENSHOT_S3_SECRET_ACCESS_KEY`, optional `SCREENSHOT_S3_ENDPOINT`, and `SCREENSHOT_S3_FORCE_PATH_STYLE`. Use the actual AWS bucket region; leave endpoint blank for AWS, or supply the S3-compatible endpoint (R2 uses `auto` region). Scope object credentials to the private bucket/app objects and required get/put/delete operations. None of these values may use `NEXT_PUBLIC_`. Without them, writing and structured-data backups work and image upload shows a setup state. Existing image endpoints serve authenticated bytes, with no public image cache or persistent local uploads.

`MSJOURNAL_TEST_DISPOSABLE` is development/test-only and must be false or unset for release. `NODE_ENV` is controlled by the standard Next.js commands. `PORT` may be supplied by a Node host or use Next's `--port` flag; neither is an application secret. No new environment variables or application runtime dependencies were introduced for exports. The focused ZIP integrity tests use Python 3's independent standard-library ZIP reader; Python is not required by the application.

Use a reverse proxy/host configuration that preserves cookies and disables shared caching of authenticated pages, `/api/*` private responses, and downloads. Honor their `private, no-store` headers; never cache ZIP/CSV files at a CDN. Disable request URL/body logging for recovery tokens and user writing, as the repository already disables Next request logging. Allow the image-upload payload size and export response sizes (up to 64 MiB), and allow long export requests (database query limits plus a 120-second image-fetch deadline). Hosts with smaller response/duration limits need an operator-approved alternate deployment configuration before release. This archive implementation uses bounded memory, not local disk persistence; budget memory for two simultaneous export preparations per process.

## Repository commands

On PowerShell use `npm.cmd` if local execution policy prevents `npm`; elsewhere use `npm`.

```sh
npm ci
# Development: copy .env.example to .env.local and replace placeholders.
npm run dev
```

Before releasing, inspect committed SQL under `drizzle/` and confirm the intended database/branch and recovery configuration. Run migrations using the repository's guarded workflow:

```sh
npm run db:migrate -- --reviewed
```

This applies pending version-controlled migrations; never use destructive resets or `drizzle-kit push` as the production workflow. Day 12 adds no database migration. Day 13 adds `0010_windy_luminals.sql` for private process goals and habit check-ins. Fee reconciliation adds `0011_illegal_korg.sql` for fee totals and allocation history; Day 14 adds `0012_unusual_random.sql` for extended prop snapshots, payouts and payout audit revisions; an older environment must apply all reviewed pending migrations before running this release. No production migrations were applied in these milestones.

Build and start with the required server environment configured:

```sh
npm run build
npm run start
# Optional explicit port for a Node host:
npm run start -- --port 3000
```

`npm run typecheck` and `npm run lint -- <changed files>` are available when needed; the production build already checks TypeScript. Keep source/runtime secrets out of build artifacts and documentation. Provision/migrate/build/start are separate operator steps; this guide does not execute production release actions.

## Release smoke check and rollback

Before release, verify the final origin, intended Neon destination and reviewed migrations, current recovery coverage, optional feature settings, HTTPS/cookie behavior and download limits. In the deployed environment, perform one legitimate signup/sign-in, save a daily entry, reload it, and confirm it remains private to that account. Check logout, protected-page redirects and unauthenticated export denial. Use synthetic trading data on a staging environment to compare a filtered CSV with Trade View, open an archive and inspect its manifest. If enabled, manually test actual recovery email delivery and a private screenshot upload/view/removal using operator-owned content. Do not report those integrations verified merely because environment variables exist.

Keep the previous known-good application artifact and its compatible configuration. To revert an application release, stop routing traffic to the new artifact and restore the prior artifact using the host's release controls, then run the same sign-in/saved-entry checks. **Reverting code does not undo database migrations.** Check schema compatibility first; do not run automatic down/reset commands. A required database recovery is a separate operator action using verified provider recovery procedures and a deliberate recovery point, potentially affecting other data. Keep database and object-store recovery plans coordinated.

## Milestone verification

The production build including TypeScript passed once on Node 22.20.0 / npm 11.21.0, and scoped ESLint passed. Fourteen focused tests passed (export safety plus existing Trade View/auth regressions). The guarded disposable route/browser scenario verified all filtered CSV rows beyond the visible page, exact decimal/unknown amounts, selected-range versus full-record totals, strategy/type filters, authenticated download headers, ZIP CRCs/manifests/hashes/category counts, stored date/relationship preservation, cross-user and anonymous rejection, and missing-image retry/explicit partial-export behavior. Independent ZIP checks used Python's standard library, not the archive writer itself.

The main pages were inspected at 390px; Dashboard, Calendar, Trade View/details, Day View/Notebook, Strategies/playbooks, Reports, Prop Accounts and Settings contained their layout without page-wide horizontal overflow. Desktop Dashboard/Trade View/Settings captures and final fully hydrated Settings captures covered both themes. Concrete fixes include short-screen drawer scrolling, 44px touch targets on writing/filter/navigation controls, 16px writing text, visual-viewport-aware mobile save bars for daily entries/trade reviews/playbooks, full-width Trade View statistics notes on mobile, dynamic-height filter scrolling and a contained short-screen image viewer. A separate focused scenario passed 390×430 save-bar/drawer/viewer checks, keyboard slider zoom and both themes. Fixture image transport was mocked for the viewer; no real private captures or exports were committed.

The first combined browser run reached the mobile phase after passing export/backup assertions but exceeded its initial timeout during slow local Next compilation. Turbopack's filesystem-cache compaction also temporarily delayed requests. The scoped scenario passed after increasing the first-use allowance; the final control check used a Webpack preview and waited for client hydration before interacting. No full unrelated suite was run and the production build was not repeatedly restarted. Disposable fixtures were cleaned up. A read-only audit preserved the original 75 source portions, 41 published groups, no pending processing and exact normalization against stored raw sources.

Physical iOS/Android keyboards, sustained large-history/export-limit load, a live archive containing real S3 objects, and actual Resend delivery remain unverified. Image inclusion/deduplication was checked with controlled byte transport; missing-image behavior was checked with owned nonexistent object metadata. Release still requires the final HTTPS origin and host secrets, confirmation of the intended Neon database/migrations/recovery coverage, a host meeting response/time/memory limits, and deployed sign-in/saved-entry/integration smoke checks. No deployment, production migration, provider plan/retention change or live email delivery occurred.
