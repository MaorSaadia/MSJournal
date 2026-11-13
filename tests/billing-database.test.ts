import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { readFile } from "node:fs/promises";
import { randomUUID, createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
const fixture = vi.hoisted(() => ({
  db: null as unknown as NodePgDatabase<typeof import("@/db/schema")>,
  owner: "new",
  checkoutMetadata: {} as Record<string, string>,
  status: "active",
  hasAccess: true,
  cancel: false,
  updated: new Date().toISOString(),
  user: "user_fixture",
}));
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ getDb: () => fixture.db }));
vi.mock("@/lib/session", () => ({
  requireUser: async () => ({
    id: fixture.owner,
    name: "Fixture",
    email: "fixture@example.invalid",
  }),
}));
import {
  saveTradingAccount,
  archiveTradingAccount,
} from "@/lib/accounts/service";
import {
  getEntitlement,
  chooseFreeAccount,
  assertAccountActivity,
  billingLock,
} from "@/lib/billing/entitlements";
import {
  startCheckout,
  reconcileMembership,
  completeRecovery,
  refreshOwner,
} from "@/lib/billing/provider";
import { acceptWebhook, processBillingEvent } from "@/lib/billing/webhooks";
import { WHOP_API_VERSION } from "@/lib/billing/policy";
const enabled = process.env.MSJOURNAL_TEST_DISPOSABLE === "true";
const namespace = `msjournal_billing_test_${randomUUID().replaceAll("-", "")}`;
let admin: Pool,
  pool: Pool,
  created = false;
const input = (name: string) => ({
  displayName: name,
  firmChoice: "Apex Trader Funding",
  customFirm: "",
  platform: "Tradovate",
  brokerIdentifier: "",
  stage: "Evaluation",
  status: "Active",
  nominalSize: "50000",
  openingBalance: "",
  openingBalanceDate: "",
  currency: "USD",
  reportingTimezone: "Asia/Jerusalem",
  notes: "",
});
const legacy1 = randomUUID(),
  legacy2 = randomUUID();
const key = "ws_fixture_signature_key_only";
function signedEvent(
  id: string,
  type = "membership.updated",
  extra: Record<string, unknown> = {},
) {
  const body = JSON.stringify({
      id,
      type,
      api_version: "v1",
      api_version_date: WHOP_API_VERSION,
      account_id: "biz_fixture",
      data: { id: "mem_fixture", status: "active", ...extra },
    }),
    timestamp = Math.floor(Date.now() / 1000);
  return {
    body,
    headers: new Headers({
      "webhook-id": id,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`,
    }),
  };
}
function remoteMembership() {
  return {
    id: "mem_fixture",
    account: { id: "biz_fixture" },
    product_id: "prod_fixture",
    variant_id: "plan_fixture",
    user_id: fixture.user,
    status: fixture.status,
    updated_at: fixture.updated,
    current_period_end: new Date(Date.now() + 86400000).toISOString(),
    expires_at: null,
    cancel_at_period_end: fixture.cancel,
    manage_url: "https://sandbox.whop.com/billing/manage/mber_fixture",
    metadata: fixture.checkoutMetadata,
  };
}
describe.skipIf(!enabled)(
  "billing database and provider boundary (isolated schema only)",
  () => {
    beforeAll(async () => {
      const previous = process.env.NODE_ENV;
      Object.assign(process.env, { NODE_ENV: "development" });
      loadEnvConfig(process.cwd(), true, undefined, true);
      Object.assign(process.env, { NODE_ENV: previous });
      if (!process.env.DATABASE_URL)
        throw Error(
          "Configure the intended development database before opting into billing fixtures",
        );
      vi.stubEnv("WHOP_ENVIRONMENT", "sandbox");
      vi.stubEnv("WHOP_API_KEY", "fixture_no_real_key");
      vi.stubEnv("WHOP_BUSINESS_ID", "biz_fixture");
      vi.stubEnv("WHOP_PRO_PRODUCT_ID", "prod_fixture");
      vi.stubEnv("WHOP_PRO_PLAN_IDS", "plan_fixture");
      vi.stubEnv("WHOP_PRO_MONTHLY_PLAN_ID", "plan_fixture");
      vi.stubEnv("WHOP_PRO_ANNUAL_PLAN_ID", "");
      vi.stubEnv("WHOP_WEBHOOK_SECRET", key);
      vi.stubEnv("WHOP_CHECKOUT_ENABLED", "true");
      vi.stubEnv("WHOP_OAUTH_CLIENT_ID", "app_fixture");
      admin = new Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 10000,
        query_timeout: 20000,
      });
      admin.on("error", () => {});
      if (!/^msjournal_billing_test_[a-f0-9]{32}$/.test(namespace))
        throw Error("Fixture schema guard failed");
      await admin.query(`create schema "${namespace}"`);
      created = true;
      // Neon transaction pooling rejects startup search_path; use the same
      // project's direct endpoint so every fixture connection stays isolated.
      const direct = new URL(process.env.DATABASE_URL!);
      direct.hostname = direct.hostname.replace("-pooler.", ".");
      pool = new Pool({
        connectionString: direct.toString(),
        options: `-c search_path=${namespace},public`,
        max: 8,
        connectionTimeoutMillis: 10000,
        query_timeout: 20000,
      });
      pool.on("error", () => {});
      fixture.db = drizzle({ client: pool, schema });
      await pool.query(`create table auth_users(id text primary key);
      create table trading_accounts(id uuid primary key default gen_random_uuid(),owner_id text not null references auth_users(id),display_name text not null,program_name text,start_date date,firm text,platform text not null default 'Tradovate',broker_identifier text,stage text not null default 'Evaluation',status text not null default 'Active',nominal_size numeric not null default 50000,opening_balance numeric,opening_balance_date date,currency text not null default 'USD',reporting_timezone text not null default 'Asia/Jerusalem',notes text,archived_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
      create table import_batches(id uuid primary key default gen_random_uuid(),owner_id text,trading_account_id uuid);
      create table prop_phases(id uuid primary key default gen_random_uuid(),owner_id text,trading_account_id uuid);
      create table tradovate_performance_records(id uuid primary key default gen_random_uuid(),owner_id text,trading_account_id uuid);
      create table tradovate_order_records(id uuid primary key default gen_random_uuid(),owner_id text,trading_account_id uuid);
      create table journal_reviews(id uuid primary key default gen_random_uuid(),owner_id text,trading_account_id uuid,fields jsonb default '{}',status text default 'draft');
      create table strategy_assignments(id uuid primary key default gen_random_uuid(),owner_id text,trading_account_id uuid,answers jsonb default '{}',strategy_id text,playbook_revision int default 1);
      insert into auth_users(id) values('new'),('legacy'),('foreign'),('race');`);
      await pool.query(
        "insert into trading_accounts(id,owner_id,display_name,firm) values($1,'legacy','Legacy one','Apex Trader Funding'),($2,'legacy','Legacy two','Apex Trader Funding')",
        [legacy1, legacy2],
      );
      // Only schema qualification changes for this fixture; application/public data
      // and the real migration ledger are never written.
      const migration = (
        await readFile("drizzle/0015_whop_billing.sql", "utf8")
      ).replaceAll('"public".', `"${namespace}".`);
      await pool.query(migration);
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: unknown, options?: RequestInit) => {
          const path = String(url);
          if (!path.startsWith("https://sandbox-api.whop.com/"))
            throw Error("Live provider calls forbidden in fixtures");
          if (path.includes("/variants/"))
            return Response.json({
              id: "plan_fixture",
              account: { id: "biz_fixture" },
              product: { id: "prod_fixture" },
              title: "Fixture Pro",
              formatted_price: "Fixture price",
              currency: "usd",
              billing_period: 30,
              initial_price: 0,
              renewal_price: 9.99,
              initial_price_due: { amount: "9.99", currency: "usd" },
              billing_type: "renewal",
              trial_period_days: 0,
            });
          if (path.endsWith("/checkout_configurations")) {
            fixture.checkoutMetadata = JSON.parse(
              String(options?.body),
            ).metadata;
            return Response.json({
              id: "ch_fixture",
              account_id: "biz_fixture",
              variant: { id: "plan_fixture" },
              mode: "payment",
              purchase_url: "https://sandbox.whop.com/checkout/ch_fixture",
            });
          }
          if (path.includes("/checkout_configurations/ch_fixture"))
            return Response.json({
              id: "ch_fixture",
              account_id: "biz_fixture",
              variant: { id: "plan_fixture" },
              metadata: fixture.checkoutMetadata,
            });
          if (path.includes("/memberships/mem_fixture"))
            return Response.json(remoteMembership());
          if (path.includes("/access/"))
            return Response.json({
              has_access: fixture.hasAccess,
              access_level: fixture.hasAccess ? "customer" : "no_access",
            });
          throw Error("Unexpected provider request in fixture");
        }),
      );
    }, 60000);
    afterAll(async () => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      if (pool) await pool.end();
      if (admin) {
        if (created && /^msjournal_billing_test_[a-f0-9]{32}$/.test(namespace))
          await admin.query(`drop schema if exists "${namespace}" cascade`);
        await admin.end();
      }
    }, 30000);
    afterEach(() => {
      fixture.owner = "new";
    });
    it("allows a first account, blocks a second across firms, counts archives and gates restoration", async () => {
      const first = await saveTradingAccount(input("First"));
      expect((await getEntitlement("new")).freeAccountId).toBe(first.id);
      await expect(
        saveTradingAccount({ ...input("Second"), firmChoice: "Lucid Trading" }),
      ).rejects.toMatchObject({ code: "PLAN_LIMIT" });
      await archiveTradingAccount(first.id, true);
      await expect(saveTradingAccount(input("Rotated"))).rejects.toMatchObject({
        code: "PLAN_LIMIT",
      });
      await archiveTradingAccount(first.id, false);
      expect((await getEntitlement("new")).usage).toBe(1);
    }, 30000);
    it("serializes concurrent creation and directly protects import-created accounts", async () => {
      fixture.owner = "race";
      const results = await Promise.allSettled([
        saveTradingAccount(input("A")),
        saveTradingAccount(input("B")),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await getEntitlement("race")).usage).toBe(1);
      await expect(
        pool.query(
          "insert into trading_accounts(owner_id,display_name,firm) values('race','Import-created','Lucid Trading')",
        ),
      ).rejects.toMatchObject({ hint: "MSJOURNAL_PLAN_LIMIT" });
    }, 30000);
    it("preserves legacy accounts, enforces a sticky owned selection and blocks excess activity", async () => {
      fixture.owner = "legacy";
      expect(await getEntitlement("legacy")).toMatchObject({
        usage: 2,
        needsSelection: true,
      });
      await expect(
        fixture.db.transaction((tx) =>
          assertAccountActivity(tx, "legacy", legacy1),
        ),
      ).rejects.toMatchObject({ code: "PLAN_LIMIT" });
      await expect(chooseFreeAccount("foreign", legacy1)).rejects.toMatchObject(
        { status: 404 },
      );
      await chooseFreeAccount("legacy", legacy1);
      await expect(chooseFreeAccount("legacy", legacy2)).rejects.toMatchObject({
        status: 409,
      });
      await fixture.db.transaction((tx) =>
        assertAccountActivity(tx, "legacy", legacy1),
      );
      await expect(
        pool.query(
          "insert into import_batches(owner_id,trading_account_id) values('legacy',$1)",
          [legacy2],
        ),
      ).rejects.toMatchObject({ hint: "MSJOURNAL_PLAN_LIMIT" });
      await archiveTradingAccount(legacy2, true);
      await expect(archiveTradingAccount(legacy2, false)).rejects.toMatchObject(
        { code: "PLAN_LIMIT" },
      );
      await pool.query(
        "insert into import_batches(owner_id,trading_account_id) values('legacy',$1)",
        [legacy1],
      );
      await expect(
        saveTradingAccount(
          { ...input("Legacy one"), firmChoice: "Lucid Trading" },
          legacy1,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect((await getEntitlement("legacy")).accounts).toHaveLength(2);
    }, 30000);
    it("requires a real checkout proof, handles duplicate/out-of-order notices, and preserves paid cancellation time", async () => {
      expect(await reconcileMembership("mem_fixture")).toEqual({
        linked: false,
      });
      const checkout = await startCheckout("legacy", 0);
      expect(checkout.url).toContain("sandbox.whop.com");
      const event = signedEvent("msg_activate", "membership.activated");
      await Promise.all([
        acceptWebhook(event.body, event.headers),
        acceptWebhook(event.body, event.headers),
      ]);
      await Promise.all([
        processBillingEvent("sandbox", "msg_activate"),
        processBillingEvent("sandbox", "msg_activate"),
      ]);
      expect((await getEntitlement("legacy")).plan).toBe("Pro");
      expect(
        (
          await pool.query(
            "select attempts from billing_webhook_events where event_id='msg_activate'",
          )
        ).rows[0].attempts,
      ).toBe(1);
      fixture.cancel = true;
      const cancellation = signedEvent("msg_cancel");
      await acceptWebhook(cancellation.body, cancellation.headers);
      await processBillingEvent("sandbox", "msg_cancel");
      expect((await getEntitlement("legacy")).plan).toBe("Pro");
      fixture.status = "expired";
      fixture.hasAccess = false;
      fixture.updated = new Date(Date.now() + 1000).toISOString();
      const old = signedEvent("msg_old", "membership.activated", {
        status: "active",
      });
      await acceptWebhook(old.body, old.headers);
      await processBillingEvent("sandbox", "msg_old");
      expect(await getEntitlement("legacy")).toMatchObject({
        plan: "Free",
        usage: 2,
        freeAccountId: legacy1,
      });
      fixture.status = "active";
      fixture.hasAccess = true;
      fixture.cancel = false;
      fixture.updated = new Date(Date.now() + 2000).toISOString();
      await reconcileMembership("mem_fixture", "legacy");
      expect(
        (await getEntitlement("legacy")).accounts.every((a) => a.writable),
      ).toBe(true);
      fixture.owner = "legacy";
      await archiveTradingAccount(legacy2, false);
      const additional = await saveTradingAccount({
        ...input("Pro additional"),
        firmChoice: "Lucid Trading",
      });
      expect((await getEntitlement("legacy")).usage).toBe(3);
      await pool.query("delete from trading_accounts where id=$1", [
        additional.id,
      ]);
    }, 30000);
    it("blocks forged membership ownership/OAuth state and membership reuse by another user", async () => {
      await expect(
        reconcileMembership("mem_fixture", "foreign", "user_fixture"),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        completeRecovery("foreign", "a".repeat(64), "forged-code"),
      ).rejects.toMatchObject({ status: 400 });
      expect((await getEntitlement("foreign")).plan).toBe("Free");
    }, 30000);
    it("keeps last verified access on outages, bounds it, rate-limits refresh and permits replacement only after deletion", async () => {
      const mock = vi.mocked(fetch);
      mock.mockRejectedValueOnce(new Error("Fixture outage"));
      await expect(
        reconcileMembership("mem_fixture", "legacy"),
      ).rejects.toThrow("refresh");
      expect((await getEntitlement("legacy")).plan).toBe("Pro");
      await fixture.db.transaction(async (tx) => {
        await billingLock(tx, "legacy");
        await tx.execute(
          sql`update billing_memberships set eligible_until=now()-interval '1 second' where owner_id='legacy'`,
        );
      });
      expect((await getEntitlement("legacy")).plan).toBe("Free");
      await pool.query(
        "update billing_profiles set refreshed_at=now() where owner_id='legacy'",
      );
      await expect(refreshOwner("legacy", true)).rejects.toMatchObject({
        status: 429,
      });
      await pool.query("delete from trading_accounts where id=$1", [legacy1]);
      const entitlement = await getEntitlement("legacy");
      expect(entitlement.freeAccountId).toBe(legacy2);
      expect(entitlement.usage).toBe(1);
    }, 30000);
  },
);
