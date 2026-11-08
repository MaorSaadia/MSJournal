import { describe, it, expect } from "vitest";
import { discoverySchema, matchesDiscovery } from "@/lib/journal/discovery";
import { emptyFields, meaningful, reviewFieldsSchema } from "@/lib/reviews/model";
import { viewSchema, filterDemo, type ViewRecord } from "@/lib/journal/view-model";
import { dashboardSchema } from "@/lib/dashboard/model";

describe("trade discovery", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const fields = { ...emptyFields(), confirmations: ["FVG", "Patient retest"], emotions: { before: ["Patient"], during: [], after: ["Calm"] } };
  const record = { entry: "2026-11-08T14:00:00Z", exit: "2026-11-08T14:03:00Z", fields, strategyId: id };
  it("keeps old reviews valid and bounds custom confirmations", () => {
    const old = { ...emptyFields() }; delete old.confirmations;
    expect(reviewFieldsSchema.safeParse(old).success).toBe(true);
    expect(reviewFieldsSchema.parse({ ...fields, confirmations: [" fvg ", "FVG", "Retest"] }).confirmations).toEqual(["FVG", "Retest"]);
    expect(meaningful({ ...emptyFields(), confirmations: ["FVG"] })).toBe(true);
    for (const invalid of [[""], ["x".repeat(61)], ["a\nb"], Array.from({length:31}, (_,i) => `Tag ${i}`)])
      expect(reviewFieldsSchema.safeParse({ ...fields, confirmations: invalid }).success).toBe(false);
  });
  it("combines assessments and local time, excluding missing classifications", () => {
    const q = discoverySchema.parse({ strategy: id, confirmation: "FVG", emotion: "Patient", hour: 16, weekday: 0, holding: "1-5" });
    expect(matchesDiscovery(q, record, "Asia/Jerusalem")).toBe(true);
    expect(matchesDiscovery(q, { ...record, fields: undefined }, "Asia/Jerusalem")).toBe(false);
    expect(matchesDiscovery({ ...q, emotionStage: "after" }, record, "Asia/Jerusalem")).toBe(false);
    expect(matchesDiscovery({ ...q, hour: 15 }, record, "Asia/Jerusalem")).toBe(false);
    expect(matchesDiscovery({ ...q, strategy: "unassigned" }, record, "Asia/Jerusalem")).toBe(false);
    expect(matchesDiscovery(discoverySchema.parse({hour:16}), {...record,entry:null}, "Asia/Jerusalem")).toBe(false);
  });
  it("validates equivalent Dashboard and Trade View queries", () => {
    const input = { start: "2026-11-01", end: "2026-11-08", confirmation: "FVG", emotion: "Patient", hour: "16", weekday:"0", holding:"1-5", strategy:id };
    expect(dashboardSchema.parse(input)).toMatchObject(discoverySchema.parse(input));
    expect(viewSchema.parse(input)).toMatchObject(discoverySchema.parse(input));
    expect(dashboardSchema.safeParse({...input,hour:24}).success).toBe(false);
    const r = { ...record, reviewFields: fields, id, exit:record.exit, gross:"10", net:"9", sourceValues:["9"], type:"portion", direction:"long", account:"Fixture", symbol:"MNQ", duration:"180", status:"Matched portions" } as unknown as ViewRecord;
    expect(filterDemo([r],viewSchema.parse({confirmation:"FVG",outcomeBasis:"portions"}),"UTC")).toHaveLength(1);
    expect(filterDemo([r],viewSchema.parse({confirmation:"OB",outcomeBasis:"portions"}),"UTC")).toHaveLength(0);
  });
});
