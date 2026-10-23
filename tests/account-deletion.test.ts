import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ db: vi.fn(), cleanup: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: state.db }));
vi.mock("@/lib/session", () => ({ requireUser: async () => ({ id: "synthetic-owner" }) }));
vi.mock("@/lib/reviews/service", () => ({ cleanupScreenshots: state.cleanup }));
import { accountDeletionPreview, deleteArchivedAccount } from "@/lib/accounts/deletion";

describe("archived account screenshot cleanup safety", () => {
  beforeEach(() => vi.clearAllMocks());
  it("keeps all account records when private image removal fails, using scoped retry metadata", async () => {
    const id = "1c65c09d-d570-4926-abd5-10b42fa9ba6c";
    const account = { id, ownerId: "synthetic-owner", displayName: "Synthetic archived", archivedAt: new Date(), updatedAt: new Date() };
    const summary = { imports: 1, sourceRecords: 1, journalRecords: 1, reviews: 1, screenshots: 1, phases: 0, payouts: 0, version: "1", filesVersion: "1:1" };
    const deletion = vi.fn(); const marked = vi.fn(async () => []);
    const select = () => { const query = { from: () => query, where: () => query, for: async () => [account], limit: async () => [] }; return query; };
    const tx = { select, execute: async () => ({ rows: [summary] }), update: () => ({ set: () => ({ where: marked }) }), delete: deletion };
    state.db.mockReturnValue({ transaction: async (fn: (value: typeof tx) => unknown) => fn(tx) });
    state.cleanup.mockRejectedValue(new Error("Synthetic storage failure"));
    const plan = await accountDeletionPreview(id, new Headers());
    await expect(deleteArchivedAccount(id, { accountName: plan.accountName, fingerprint: plan.fingerprint, filesVersion: plan.filesVersion, confirmed: true }, new Headers())).rejects.toThrow("The account remains archived");
    expect(state.cleanup).toHaveBeenCalledWith("synthetic-owner", id);
    expect(marked).toHaveBeenCalledOnce();
    expect(deletion).not.toHaveBeenCalled();
  });
});
