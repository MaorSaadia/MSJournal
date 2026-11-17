# Whop verification — 15 November 2026

Release flags remain false. No checkout configuration, charge, provider subscription, provider app or webhook registration was created/changed. Whop requests were GET-only. The authenticated application reconciliation probe was rejected with 401 and did not run a sweep.

## Verified provider configuration

The supplied API key is a **live** key: configured-business membership reads succeed on `api.whop.com` and fail authentication on the sandbox host. The business-scoped variant list also succeeds. Direct account-detail retrieval is forbidden because the key lacks the optional `company:basic:read` permission; that permission is not needed by the integration's actual subscription calls.

Verified Monthly plan:

| Field | Verified value |
| --- | --- |
| Product | MSJournal Monthly Pro |
| Product ID | `prod_0w2SnaVhCoFng` |
| Monthly variant ID | `plan_jVQqSw8qzYDWB` |
| Business association | Matches the configured business |
| Currency | USD |
| Renewal | $9.99 every 30 days |
| Initial setup charge | $0 |
| First payment before tax/promos | $9.99 |
| Trial | None |

The local environment previously had `WHOP_ENVIRONMENT=sandbox`, no product ID and malformed Monthly/annual IDs. Its environment/product/Monthly fields were corrected from the read-only provider results. The unused annual ID was cleared, and an explicit `WHOP_ANNUAL_CHECKOUT_ENABLED=false` gate now prevents annual checkout even if an annual membership reference is retained. Both release flags remain false. The existing scheduler secret was mirrored to local `CRON_SECRET` without displaying it. These local changes do **not** update Vercel.

The existing $89.99/365-day annual variant belongs to a **different product**. Before any later annual launch, configure an annual variant under the same Pro product (or separately review multi-product support). Annual purchase is disabled now. Provider products/prices were not modified.

## Public deployment and webhook

The current configured origin is `https://www.msjournal.app`, replacing the old fallback-domain examples for this deployment.

- Public homepage: 200.
- Unauthenticated `/api/billing`: 401.
- Webhook OPTIONS: 204 with `Allow: OPTIONS, POST`; the route is deployed.
- No accepted webhook events are recorded in the locally configured database. This is not proof that Vercel points to the same database.
- The key cannot list webhook registrations (403, missing `developer:manage_webhook`). Registration, version pin, matching signing secret and actual Whop delivery therefore remain **unverified**. That extra permission is only needed for automated registration inspection; runtime signature verification does not require it.

In Whop Developer → Webhooks, inspect/create this endpoint:

```text
https://www.msjournal.app/api/webhooks/whop
```

Use API `v1`, date `2026-11-12`, with:

```text
membership.activated
membership.updated
payment.succeeded
payment.failed
payment.requires_action
refund.created
refund.updated
dispute.created
dispute.updated
```

Copy the complete signing secret into Vercel `WHOP_WEBHOOK_SECRET`. Never include that secret in screenshots, logs or chat. Check delivery history in Whop; an endpoint OPTIONS response is not a successful webhook delivery. A real signed delivery must be accepted and appear in the correct database inbox.

## OAuth blocker and code safeguard

The configured Whop app belongs to the correct business, but is **confidential** and has **zero redirect URIs**. The existing integration uses public-client S256 PKCE and does not send a client secret. The updated `startRecovery` now verifies the app's business, public client type and exact callback before persisting OAuth state. This prevents an unusable linking attempt from proceeding with mismatched app settings.

Configure the Whop app as **Public / PKCE**, or create a public OAuth app if the existing type cannot be changed. Enable `openid` and register exactly:

```text
https://www.msjournal.app/api/billing/whop/callback
```

Use that app ID as `WHOP_OAUTH_CLIENT_ID`. This supported public flow needs no OAuth client secret. Keeping the current confidential app would require separately documented/implemented confidential token authentication; no guessed secret exchange was added. Better Auth remains the application login.

## Scheduler: source configuration ready; production blocked

The user confirmed **Vercel Hobby**. Added `vercel.json` with the supported daily cron (`0 2 * * *`, UTC). Hobby does not support a one-minute Vercel cron. Daily recovery is less frequent than the six-hour verified lease; webhooks remain primary, and signed-in Billing visits also recheck provider access. More frequent unattended recovery needs a separately chosen supported scheduler/hosting arrangement; no paid service was provisioned.

Production authentication checks:

| Request | Result |
| --- | --- |
| No bearer token | 401 |
| Wrong bearer token | 401 |
| Locally configured bearer token | **401** |

Therefore the deployed scheduler authentication is **not working with the supplied configuration**, and scheduled execution cannot be certified. No Vercel connection is confirmed, so deployed secret values, cron activation and execution logs could not be inspected. A Vercel connection was offered for that remaining read-only verification.

In Vercel project settings, set Production `BILLING_RECONCILE_SECRET` and `CRON_SECRET` to the same existing secret. Vercel Cron sends `CRON_SECRET`; the route checks `BILLING_RECONCILE_SECRET`. Deploy the new cron configuration with both release flags false, then use the Cron Jobs/Schedules dashboard's run/log controls to confirm a 2xx invocation. Changing local `.env.local` alone does not fix deployment authentication.

The route now returns 503 rather than a misleading successful empty sweep when billing provider configuration is invalid/disabled. A configured and authenticated invocation must perform the existing bounded inbox/membership reconciliation, not merely pass a secret check.

## Targeted validation

The focused suites cover Free capacity across firms, concurrent creation, archived usage/restoration, sticky Free selection, firm-history protection, actual Pro additional-account creation, secure checkout metadata binding, membership reuse/forgery prevention, no entitlement from a checkout/return URL alone, SDK signature/replay validation, duplicate/out-of-order events, paid-period cancellation, expiry, retained data and reactivation.

The isolated database fixture additionally creates, saves and reads all **four worksheets as a Free user**. Its temporary schema is removed afterward; application records and live subscriptions are untouched. The public/client worksheet checks also exercise valid printable PDFs and existing revision behavior.

Commands used are limited to the billing, worksheet and associated type/lint checks. No full test suite or production build/deployment is required for this verification pass. Provider delivery and a real sandbox payment-to-access flow are separate from these mocked-provider fixtures.

Recorded results: 39 focused tests passed (30 billing/pricing/request/print checks, two OAuth setup checks, seven isolated database checks), plus TypeScript and scoped ESLint. No real checkout-creation permission or provider-side payment flow was exercised by the read-only API audit.

## Remaining end-to-end test before release

1. Update/redeploy Vercel's corrected live identifiers and matching scheduler secrets with `WHOP_CHECKOUT_ENABLED=false`, `WHOP_LIVE_VERIFIED=false`, `WHOP_ANNUAL_CHECKOUT_ENABLED=false`. Keep the annual plan unset. Confirm the cron actually executes successfully.
2. Fix the Whop public OAuth app/callback and confirm the webhook registration/version/events/signing secret.
3. Create **separate sandbox credentials, business/product and matching $9.99 Monthly variant**. The supplied live key cannot authenticate to sandbox. This code deliberately disables sandbox in `NODE_ENV=production`; use a development server and properly configured HTTPS forwarding origin/callback for sandbox testing.
4. With disposable MSJournal identities/data, perform sandbox hosted checkout → actual Whop signed webhook → membership/checkout ownership and product-access verification → Pro. A browser return alone must leave Free unchanged. Verify OAuth recovery and cross-user denial.
5. Verify sandbox renewal, end-of-period cancellation (access retained until the verified boundary), actual expiry/revocation and restored Pro access. Retained trades/notes/screenshots must remain available throughout; excess Free accounts become read/export-only. Use Whop's documented lifecycle tools or a scheduled sandbox renewal, not a fabricated production success event.

Keep public checkout disabled until these checks and outstanding seller onboarding/support questions are resolved. No real charge is authorized by this verification.
