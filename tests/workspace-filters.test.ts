import { describe, expect, it } from "vitest";
import {
  workspaceHref,
  workspaceSearch,
  rememberWorkspacePage,
  type WorkspaceFilterState,
} from "@/lib/accounts/workspace-filters";
import {
  viewSchema,
  summaryOf,
  type ViewRecord,
} from "@/lib/journal/view-model";
import { reportSchema } from "@/lib/reports/model";

describe("shared private financial scope", () => {
  it("keeps page overrides separate from the Dashboard default", () => {
    let state: WorkspaceFilterState = {
      defaults: { accounts: "a", basis: "net" },
      pages: {},
    };
    state = rememberWorkspacePage(state, "/trade-view", { accounts: "a,b" });
    expect(workspaceHref("/", state.defaults, state.pages)).toContain(
      "accounts=a&",
    );
    expect(workspaceHref("/trade-view", state.defaults, state.pages)).toContain(
      "accounts=a%2Cb",
    );
    expect(workspaceHref("/calendar", state.defaults, state.pages)).toContain(
      "accounts=a&",
    );
    state = rememberWorkspacePage(state, "/reports", { accounts: "" });
    expect(state.pages["/trade-view"].accounts).toBe("a,b");
    expect(state.defaults.accounts).toBe("a");
    expect(workspaceHref("/reports", state.defaults, state.pages)).toContain(
      "accounts=&",
    );
    state = rememberWorkspacePage(state, "/", { accounts: "b" });
    expect(state.pages).toEqual({});
    expect(
      workspaceHref("/trade-view?accounts=a", state.defaults, state.pages),
    ).toContain("accounts=b&");
  });
  it("inherits accounts, keeps none distinct from all, and respects explicit links", () => {
    expect(
      workspaceSearch("", { accounts: "a", archived: "1" }).get("accounts"),
    ).toBe("a");
    expect(
      workspaceSearch("accounts=", { accounts: "a" }).get("accounts"),
    ).toBe("");
    expect(
      workspaceSearch("accounts=b&basis=gross", {
        accounts: "a",
        basis: "net",
      }).get("basis"),
    ).toBe("gross");
  });
  it("replaces stale navigation scope while preserving page filters and isolating demo", () => {
    const href = workspaceHref(
      "/trade-view?accounts=old&basis=gross&search=MNQ&page=2",
      { accounts: "new", basis: "net" },
    );
    expect(href).toContain("accounts=new");
    expect(href).toContain("basis=net");
    expect(href).toContain("search=MNQ");
    expect(
      workspaceHref("/calendar?mode=demo&accounts=fixture", {
        accounts: "private",
      }),
    ).toContain("accounts=fixture");
    expect(workspaceHref("/notebook", { accounts: "a" })).toBe("/notebook");
    expect(workspaceHref("/reports?accounts=old", {})).not.toContain(
      "accounts=",
    );
  });
  it("defaults financial views to net and preserves explicit gross", () => {
    expect(viewSchema.parse({}).basis).toBe("net");
    expect(viewSchema.parse({ basis: "gross" }).basis).toBe("gross");
    expect(
      reportSchema.parse({ start: "2026-10-01", end: "2026-10-15" }).basis,
    ).toBe("net");
  });
  it("uses exact net amounts and leaves a partially unknown total unknown", () => {
    const rows = [
      {
        accountId: "known-account",
        gross: "261.5",
        net: "249.02",
        type: "portion",
        status: "matched",
        estimated: false,
      },
    ] as ViewRecord[];
    expect(summaryOf(rows, viewSchema.parse({})).net).toBe("249.02");
    expect(
      summaryOf([...rows, { ...rows[0], net: null }], viewSchema.parse({})).net,
    ).toBeNull();
    expect(
      summaryOf(
        [
          ...rows,
          {
            ...rows[0],
            accountId: "missing-account",
            gross: "95.5",
            net: null,
          },
        ],
        viewSchema.parse({}),
      ),
    ).toMatchObject({
      net: null,
      knownNet: "249.02",
      missingFeeGross: "95.5",
      missingFeeAccountIds: ["missing-account"],
      covered: 1,
      count: 2,
      gross: "357",
    });
    expect(
      summaryOf([{ ...rows[0], net: null }], viewSchema.parse({})),
    ).toMatchObject({
      net: null,
      knownNet: null,
      missingFeeGross: "261.5",
      covered: 0,
    });
  });
});
