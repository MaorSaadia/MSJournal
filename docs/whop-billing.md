# Whop billing and account allowances

Implemented 13 November 2026. Better Auth remains MSJournal's only application login. Whop collects payments and manages subscriptions; card data never enters MSJournal. CSV imports remain CSV imports.

## Account policy

- **Free:** one real trading account total, belonging to one firm. Archived accounts count. There are no new import quotas or restrictions on the selected account's existing features.
- **Pro:** multiple accounts across firms, with existing features across those accounts. Both billing schedules grant the same entitlement. Owner-confirmed pricing is **$9.99 USD monthly** or **$89.99 USD annually**; launch with Monthly only, with no automatic trial.
- Existing users receive no automatic paid access. A Free user with multiple accounts must select one in **Settings → Billing**. Until selection, all accounts remain readable/exportable and account activity is blocked. After selection, only that account permits new imports, reviews, screenshots, rule/balance/fee changes and account activity.
- The Free selection persists across upgrades, downgrades, archiving and restoration. There is no switch/clear endpoint. Deleting that account through the existing archive/delete flow clears the selection via its foreign key; choose a retained replacement if several remain, or the sole remaining account is selected automatically. Deletion retains the existing data-loss confirmations.
- Excess accounts, imports, notes and images are never deleted on expiry. Account/data-management actions, including archive, confirmed deletion and image removal, remain available. Renewed Pro restores activity without reimporting.
- Public books, all four worksheets (including saving/printing), general writing, authentication/recovery, billing and retained-data exports remain free. Demo data is not stored as additional real accounts.
- A firm cannot be changed on an account with imports or phases. Historical trades are not silently relabeled.

Account creation, restoration and activity use a central server service plus transaction-scoped per-owner PostgreSQL locks. Migration triggers also protect direct/alternative account and source-import writes. Read-time journal rebuilding is maintenance and does not count as new activity. The selected account and every mutation remain owner-scoped.

## Required configuration

All values are **server-only**; never use `NEXT_PUBLIC_` for them. See [.env.example](../.env.example).

| Variable | Value / source |
| --- | --- |
| `WHOP_ENVIRONMENT` | `sandbox` during local development; `live` only for separately verified live credentials. Sandbox is disabled when `NODE_ENV=production`. |
| `WHOP_API_KEY` | API key from the relevant Whop business's Developer/API keys page. |
| `WHOP_BUSINESS_ID` | That business/account's `biz_…` ID. |
| `WHOP_PRO_PRODUCT_ID` | The MSJournal Pro product's `prod_…` ID. |
| `WHOP_PRO_MONTHLY_PLAN_ID` | Launch plan: the `plan_…` variant for **$9.99 USD every 30 days**. No setup charge or trial. |
| `WHOP_PRO_ANNUAL_PLAN_ID` | Optional later: `plan_…` variant for **$89.99 USD every 365 days**. Leave blank for launch. Its purchase option stays hidden until verified. |
| `WHOP_PRO_PLAN_IDS` | Optional legacy membership allowlist; its IDs remain eligible for existing subscription reconciliation. A single legacy ID can serve as Monthly only after matching all Monthly checks. When several legacy IDs exist, set the explicit Monthly/Annual variables; their intervals are never guessed. |
| `WHOP_WEBHOOK_SECRET` | Complete signing secret from the webhook's dashboard configuration, including `ws_`. |
| `WHOP_OAUTH_CLIENT_ID` | The Whop developer app ID (`app_…`) used for existing-subscription recovery. Uses PKCE, not an email match. |
| `WHOP_CHECKOUT_ENABLED` | Default `false`. Set `true` for a configured sandbox checkout after review. |
| `WHOP_LIVE_VERIFIED` | Default `false`. Live checkout also requires this independent gate to be `true`; leave off until the release checklist is complete. |
| `BILLING_RECONCILE_SECRET` | Independent long random value for the protected reconciliation endpoint. Never put it in a URL. |
| `SITE_URL` | Existing canonical production HTTPS origin. Repository default is `https://ms-journal.vercel.app`; this does not assert another custom domain is connected. |
| `BETTER_AUTH_URL` | Existing authentication/mutation origin. Local callbacks use this origin; production billing redirects use `SITE_URL`. Keep both aligned in production. |

Missing credentials, disabled checkout or unverified pricing produces “Pro checkout isn’t available yet.” Free resources remain available. The owner's confirmed Monthly price can be shown beside this unavailable state, but it does not activate a purchase option. Purchase options require a fresh Whop variant check: matching business/product/ID, recurring model, exact USD price, 30-day Monthly or 365-day annual period, zero initial setup charge, matching first-payment amount and no trial. Decimal-safe comparisons are used; provider display strings are not price evidence. Checkout repeats these checks. Options have stable identities (0 Monthly, 1 annual), so an unavailable Monthly option can never silently redirect a stale Monthly click to annual.

Monthly is the only launch option. An absent, invalid or unreachable annual variant stays hidden without blocking valid Monthly checkout. When annual is configured and verified, display **“$89.99/year”**, **“Save 25% compared with monthly billing.”** and **“About $7.50/month, billed annually at $89.99.”** The savings is the owner-approved rounded comparison against twelve $9.99 payments. Annual is a billing schedule, not a feature tier. Existing paid memberships are not retroactively revoked merely because a price changes; normal provider-verified access rules still apply.

## Database setup

Review [0015_whop_billing.sql](../drizzle/0015_whop_billing.sql), then apply it to the **intended development branch first** using the existing reviewed migration command:

```powershell
npm.cmd run db:migrate -- --reviewed
```

This additive migration creates six billing tables, constraints/indexes and account/activity guard functions/triggers. It does not delete data, backfill paid access, move imports or select arbitrarily among legacy accounts. The application requires this migration before running the new private workspace. Do not reset the database or use `drizzle push` to bypass review. Production migration/release remains an operator action; none was performed for this milestone.

Portable backups now use **format 7** and include the owner's billing profile/Free selection, provider identity and membership state alongside retained accounts. Checkout binding proofs, transient OAuth verifiers, webhook inboxes, API keys, card data and authentication tokens are excluded. Restoring an archive must never restore paid entitlement without provider verification. There is no restore UI.

## Whop dashboard setup

1. Start at [Whop sandbox](https://sandbox.whop.com), with a separate sandbox business/key. Create the MSJournal Pro product and **Pro Monthly**, USD 9.99 recurring every 30 days, with zero initial charge and no trial. Set `WHOP_PRO_MONTHLY_PLAN_ID` and leave `WHOP_PRO_ANNUAL_PLAN_ID` blank for launch. Later, create **Pro Yearly** on the same product, USD 89.99 recurring every 365 days, also with zero initial charge and no trial. Set its optional annual ID only when ready for verification. Copy exact business/product/variant IDs; do not enter 9.99/89.99 as an additional setup fee, because Whop adds the setup fee to the first recurring charge.
2. Create a business-scoped API key with `checkout_configuration:create`, `checkout_configuration:basic:read`, `plan:basic:read`, `member:basic:read`, `member:manage`, and `payment:basic:read`. The manage scope lets membership retrieval return the buyer's supported `manage_url`. The user/product access check also uses this key. No membership-cancellation or card-charging API is called by MSJournal.
3. In Developer → Webhooks, configure a publicly reachable HTTPS endpoint ending in `/api/webhooks/whop`, scoped to the same business. For local testing, supply an operator-managed HTTPS forwarding URL for the local server; this repository adds no tunnel service. Pin the webhook's API version date to **2026-11-12**, matching the application request header. Copy its full signing secret.
4. Subscribe to `membership.activated`, `membership.updated`, `payment.succeeded`, `payment.failed`, `payment.requires_action`, `refund.created`, `refund.updated`, `dispute.created`, and `dispute.updated`. These are the current dated API events, not older `membership.went_valid` examples. Event processing fetches authoritative state; it does not grant access from notification fields.
5. Create/select a Whop developer OAuth app. Register the exact redirect URI `http://localhost:3000/api/billing/whop/callback` for local development and the final production `SITE_URL` plus `/api/billing/whop/callback` when preparing a release. Enable `openid` for this app and copy its app/client ID. This implementation uses the documented PKCE public-client exchange, not a client secret or a new Better Auth provider.
6. Configure a protected scheduled request to `GET /api/billing/reconcile`, preferably once per minute, with `Authorization: Bearer <BILLING_RECONCILE_SECRET>`. Use the host's existing scheduler/secure job facility; no new infrastructure is included. Do not place the bearer secret in query parameters or public cron metadata.

Whop's sandbox guide documents the frontend/API hosts, but does not explicitly document the sandbox OAuth host. The recovery adapter uses the corresponding `sandbox-api.whop.com/oauth` host; confirm its availability with Whop in sandbox before treating recovery as verified. No sandbox credentials were supplied, so real hosted checkout, OAuth, management URLs and delivered webhooks still need that operator test. If Whop does not provide sandbox OAuth for the app, test recovery in a separately approved provider test environment before enabling live checkout; never send sandbox tokens to the live host.

## Secure ownership and lifecycle

An authenticated checkout request accepts only a numbered option from the server's verified allowlist. The server persists an attempt plus a random 256-bit binding proof's hash, and passes the proof/attempt in hosted checkout metadata. After activation it reads both the current membership and its checkout configuration, verifies their business/product/variant and matching metadata, and binds the Whop user to the local session owner. Unique environment-qualified references prevent membership/Whop-identity reuse across local users. A second authoritative membership read inside the owner lock prevents a stale in-flight response from overwriting newer state.

Existing subscribers connect from Billing using a single-use, owner-bound, ten-minute OAuth state and S256 PKCE. The server checks `userinfo.sub`, looks up matching configured memberships, and verifies their ownership/access. Email, browser-return URLs, arbitrary membership IDs and client-supplied local user/plan IDs do not confer Pro. OAuth tokens are not stored or sent to the browser; refresh tokens are revoked on a best-effort basis after use.

Access requires both an allowed scoped membership state and Whop's current customer product-access confirmation. Canceling renewal retains access until its confirmed boundary. Failed payments, refunds and disputes trigger verification, not one universal revoke/grant rule. Actual expiration/revocation returns the account to Free without deleting anything. Known membership revisions cannot be overwritten by older provider timestamps. The UI shows relevant dates in the user's journal timezone.

Temporary failures retain **only previously confirmed** access, for at most six hours after verification, capped by the known period end/fixed expiry. Explicitly confirmed `past_due` access receives at most fifteen minutes, still capped by fixed expiry. Failed requests never extend that lease or grant a new user Pro. Unknown/unresolved/drafted/expired/canceled states do not grant access. This is a bounded local safety policy, not a claim about Whop's universal grace period.

Webhooks use the SDK's Standard Webhooks verifier on the bounded raw body before database work. The durable minimal inbox deduplicates `(environment,event_id)`, records attempts/results, and retries genuine failures; events arriving before checkout binding is stored remain retryable. No full payment/event payload is persisted. The endpoint acknowledges after durable acceptance and schedules processing with Next `after`. A scheduled reconciliation processes one retry plus at least one stale membership (three when no retry exists), so failed events cannot starve missed-webhook recovery. Billing page visits also recheck known memberships, at most two per ten minutes per owner. Manual refresh is limited to once per minute. Each provider request has a 3.5-second timeout; refresh batches are bounded.

## Test before accepting payments

Automated fixture checks use no Whop credentials or real charges:

```powershell
npx.cmd vitest run tests/billing.test.ts tests/billing-pricing.test.ts tests/billing-routes.test.ts tests/exports.test.ts tests/book.test.ts tests/book-current.test.ts
$env:MSJOURNAL_TEST_DISPOSABLE='true'
npx.cmd vitest run tests/billing-database.test.ts
```

The opt-in database suite creates a uniquely named, guarded temporary schema on the configured development database, applies migration 0015 within that schema, mocks every Whop request, and removes the schema afterward. It never changes the public migration ledger or application records. It covers concurrency, archive/restore, ownership, persistent selection/deletion replacement, secure checkout proof, duplicate/old events, cancellation, expiry, reactivation, outages and refresh limits. Other older disposable integration suites may seed multiple Free accounts and must deliberately arrange paid/legacy fixtures when run with this new account policy; do not add a production bypass for tests.

Before enabling live checkout, use Whop's [sandbox test cards and scenarios](https://docs.whop.com/developer/guides/sandbox) to verify hosted payment → signed webhook → Pro, canceled/failed checkout, renewal, paid-period cancellation, revocation, payment issues, refunds/disputes, OAuth recovery, management link, retry/reconciliation, and multi-user denial. Confirm that pending checkout alone never grants Pro. Use only the sandbox's documented test cards; no real charges were made here. Verify dark/light/mobile Billing and that the upgrade dialog preserves the original account form.

Tax-registration classification is awaiting Whop support clarification. No declarations were submitted and seller onboarding is **not** asserted complete. After sandbox validation, resolve onboarding/tax questions with Whop, configure separate live values and final URLs, and have the owner approve the release/payment-to-access checks. Until then, retain both checkout release flags as `false`. No public live checkout or deployment is enabled by this milestone.

## Verification recorded for this implementation

- **34 focused tests passed** across billing policy, request authorization, isolated database/provider boundaries, portable backup safety and existing worksheet behavior. No full suite or production build was run.
- Pricing confirmation extension: **22 focused billing checks passed** (including seven new pricing cases and the isolated database suite). They cover exact Monthly/annual USD amounts, billing periods, first-charge/setup/trial checks, optional annual failures, stable checkout choices and unchanged Pro/account policy. No additional migration is required for these pricing changes.
- Next route-type generation, `tsc --noEmit` and scoped ESLint passed.
- `node scripts/check-billing-ui.mjs` checked the actual Billing components with fictional responses in desktop/mobile and both themes, including Free selection, pending checkout, refresh failure, paid-period cancellation, keyboard focus/Escape and retained form input. Public `/book` and `/books` remained accessible; the unauthenticated billing API returned 401. Local screenshots are under ignored `artifacts/billing/ui/`.
- The visual harness removes its temporary development route and leaves an existing dev server running. It creates no users, accounts, payments or public fixtures. The database fixture schemas were removed. Migration 0015 has **not** been applied to the application's database.
- Whop hosted checkout/OAuth/webhook delivery and live seller configuration remain unverified because credentials were not provided. Both checkout release flags remain off. Resolve the sandbox OAuth host question and complete the setup/release checklist above before accepting payments.

## Official references

Verified against the current dated API on 13 November 2026: [API stability](https://docs.whop.com/api-reference/stability), [current OpenAPI](https://api.whop.com/api/v1/openapi.json), [memberships](https://docs.whop.com/api-reference/memberships/retrieve-membership), [webhooks](https://docs.whop.com/developer/guides/webhooks), [OAuth](https://docs.whop.com/developer/guides/oauth), and [sandbox](https://docs.whop.com/developer/guides/sandbox). Current fields use `variant_id`/`account_id`; legacy plan/company examples must not be substituted without checking the pinned schema.
