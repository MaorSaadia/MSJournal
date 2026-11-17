# Try Pro through a no-charge Whop checkout

This uses the actual MSJournal frontend and provider webhook handling. It does not grant simulated Pro or change the production release flags. Use credentials created on sandbox.whop.com; the configured sandbox Monthly plan was verified at $9.99 USD per 30 days.

1. Sign in to **https://sandbox.whop.com**. Create/select a sandbox business, an MSJournal Pro product and a Monthly recurring variant: USD 9.99 / 30 days, zero setup charge, no trial. Create its sandbox API key with the permissions in `docs/whop-billing.md`. Live IDs/keys do not work in sandbox.
2. Copy `docs/whop-sandbox.env.example` to `.env.whop-sandbox.local` and fill its values locally. Do not paste API keys, database passwords or webhook secrets into chat. A separate test database is the default. To use the existing database explicitly, set WHOP_SANDBOX_ALLOW_SHARED_DATABASE=true in this sandbox file and supply its DATABASE_URL. In that mode, use only a disposable test login and skip --migrate; the launcher blocks migrations. Sandbox billing records remain in the shared database until explicitly cleaned up.
3. Use a temporary HTTPS forwarding URL to `http://localhost:3101` so Whop can reach `/api/webhooks/whop`. Register that forwarding URL plus `/api/webhooks/whop` in the **sandbox** webhook dashboard, with API date `2026-11-12` and the nine events in `docs/whop-billing.md`. Put its signing secret in the sandbox file. Set WHOP_SANDBOX_PUBLIC_URL to the HTTPS forwarding origin (without a path). Use that HTTPS address for the frontend too: Whop rejects an HTTP localhost checkout return URL. No forwarding service or account has been provisioned by this change.
4. Check the isolated configuration:

   ```powershell
   node scripts/whop-sandbox.mjs --check
   ```

   This contacts only `sandbox-api.whop.com`, verifies authenticated business access and exact Monthly pricing, and refuses to launch on failed authentication. It never retries a live host and prints no credential values.
5. Initialize the separate test database, then start the frontend:

   ```powershell
   node scripts/whop-sandbox.mjs --migrate
   node scripts/whop-sandbox.mjs
   ```

   Migrations require an explicit command and run only after the separate-database and sandbox-API checks. The normal `.env.local` is not rewritten. The sandbox server uses its own build directory, port 3101, a fresh auth secret and no production email/image-storage credentials. Use an incognito window and sign up a disposable MSJournal test user (for example `whop-test@example.invalid`). Existing local sessions should not be reused. A restart generates a fresh auth secret, so sign in again if required.
6. Open **your HTTPS forwarding URL + /settings/billing**, click Monthly Upgrade and verify the checkout host is **sandbox.whop.com**. Use Whop's documented sandbox card `4242 4242 4242 4242`, a future expiry, a three-digit CVC and a fictional billing address. Never use a real card for this test.
7. Complete checkout. The browser return alone must leave access pending. Confirm Whop's signed webhook is accepted, Billing changes to Pro, and a second trading account can be created. No webhook delivery means the test is incomplete; don't manually mark the user paid. Check the forwarding service and sandbox webhook delivery log.

Only the isolated child process gets `WHOP_CHECKOUT_ENABLED=true`; it forces sandbox mode and keeps live verification and annual checkout false. Production checkout remains disabled. Public Vercel builds intentionally refuse sandbox mode, so this test does not run on the production website. OAuth recovery is a separate test; it is disabled in this checkout-only sandbox runner until a separately verified sandbox public PKCE app is configured.

Setup status on 16 November 2026: sandbox credentials and Monthly pricing are verified. The user explicitly chose the existing database with a disposable test login. Webhook secret and HTTPS forwarding still need configuration. The end-to-end payment/webhook test has **not** run.

## Sandbox payment verification - 17 November 2026

The sandbox Monthly purchase completed. Genuine signed payment.succeeded and membership.activated deliveries used envelope date 2026-11-14-1 and were initially rejected by the older envelope allowlist. The receiver now explicitly accepts that observed compatible version as well as 2026-11-12; provider reads stay pinned to 2026-11-12. Both original signed events were retried with their signatures intact, accepted with HTTP 200 and processed successfully. The provider-confirmed sandbox membership is active with current verified access. No redirect-based or manual Pro grant was used. Seven focused policy/signature tests passed, including tampering, unknown-version and event-ID rejection. Live checkout and annual checkout remain disabled. Full renewal/cancellation/downgrade testing remains outstanding.
