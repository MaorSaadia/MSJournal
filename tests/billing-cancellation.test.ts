import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const mocks = vi.hoisted(() => ({
  configured: true,
  rows: [] as Record<string, unknown>[],
  conditions: [] as unknown[],
  request: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing/config", () => ({ whopConfig: () => mocks.configured ? {
  environment: "sandbox", businessId: "biz_fixture", productId: "prod_fixture", planIds: ["plan_fixture"],
} : null }));
vi.mock("@/lib/billing/provider", () => ({
  whopRequest: mocks.request,
  reconcileMembership: mocks.reconcile,
  digest: (s: string) => s,
}));
vi.mock("@/db/client", () => ({ getDb: () => ({
  select: () => ({ from: () => ({ where: (condition: unknown) => {
    mocks.conditions.push(condition);
    const query = { orderBy: () => query, limit: async () => mocks.rows };
    return query;
  } }) }),
}) }));
import { cancelRenewal } from "@/lib/billing/cancellation";
const remote = () => ({
  id: "mem_fixture", account: { id: "biz_fixture" }, product_id: "prod_fixture", variant_id: "plan_fixture",
  user_id: "user_fixture", status: "active", updated_at: new Date().toISOString(),
  current_period_end: new Date(Date.now() + 86400000).toISOString(), expires_at: null,
  cancel_at_period_end: false, manage_url: null, metadata: {},
});
beforeEach(() => {
  vi.clearAllMocks(); mocks.configured = true; mocks.conditions = [];
  mocks.rows = [{ ownerId: "owner", environment: "sandbox", membershipId: "mem_fixture", whopUserId: "user_fixture", status: "active", cancelAtPeriodEnd: false }];
  mocks.request.mockImplementation(async (_path, options) => options?.method === "POST" ? {} : remote());
  mocks.reconcile.mockImplementation(async () => { mocks.rows[0].cancelAtPeriodEnd = true; });
});
describe("owner-scoped period-end cancellation", () => {
  it("always requests period-end cancellation, then verifies access using the existing reconciler", async () => {
    await cancelRenewal("owner");
    const post = mocks.request.mock.calls.find(([, options]) => options?.method === "POST")!;
    expect(post[0]).toBe("/memberships/mem_fixture/cancel");
    expect(JSON.parse(post[1].body)).toEqual({ cancel_at_period_end: true });
    expect(post[1].headers["Idempotency-Key"]).toContain("sandbox:mem_fixture:");
    expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith("mem_fixture", "owner");
    const dialect = new PgDialect();
    for (const condition of mocks.conditions)
      expect(dialect.sqlToQuery(condition as Parameters<typeof dialect.sqlToQuery>[0]).params).toEqual(expect.arrayContaining(["owner", "sandbox"]));
  });
  it("never calls the provider without an owned, environment-scoped saved link", async () => {
    for (const rows of [[], [{ ...mocks.rows[0], ownerId: "other" }], [{ ...mocks.rows[0], environment: "live" }]]) {
      mocks.rows = rows;
      await expect(cancelRenewal("owner")).rejects.toMatchObject({ status: 404 });
    }
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("rejects changed provider ownership, business, product, plan or membership ID before cancellation", async () => {
    for (const patch of [{ user_id: "user_other" }, { account: { id: "biz_other" } }, { product_id: "prod_other" }, { variant_id: "plan_other" }, { id: "mem_other" }]) {
      mocks.request.mockResolvedValue({ ...remote(), ...patch });
      await expect(cancelRenewal("owner")).rejects.toMatchObject({ status: 403 });
    }
    expect(mocks.request.mock.calls.every(([, options]) => options?.method !== "POST")).toBe(true);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("treats an already scheduled cancellation as idempotent and still refreshes authoritative access", async () => {
    mocks.request.mockResolvedValue({ ...remote(), cancel_at_period_end: true });
    await cancelRenewal("owner");
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.reconcile).toHaveBeenCalledOnce();
  });
  it("does not guess period-end timing or cancel expired periods immediately", async () => {
    for (const current_period_end of [null, "2020-01-01T00:00:00Z"]) {
      mocks.request.mockResolvedValue({ ...remote(), current_period_end });
      await expect(cancelRenewal("owner")).rejects.toMatchObject({ status: 409 });
    }
    expect(mocks.request.mock.calls.every(([, options]) => options?.method !== "POST")).toBe(true);
  });
  it("never claims cancellation succeeded when Whop rejects it or confirmation is pending", async () => {
    mocks.request.mockImplementation(async (_path, options) => { if (options?.method === "POST") throw Error("provider failure"); return remote(); });
    await expect(cancelRenewal("owner")).rejects.toMatchObject({ status: 503 });
    expect(mocks.reconcile).not.toHaveBeenCalled();
    mocks.request.mockImplementation(async (_path, options) => options?.method === "POST" ? {} : remote());
    mocks.reconcile.mockResolvedValue(undefined);
    await expect(cancelRenewal("owner")).rejects.toMatchObject({ status: 503 });
  });
});
