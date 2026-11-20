import { describe,it,expect,vi,beforeEach } from "vitest";
vi.mock("server-only",()=>({}));
const mocks=vi.hoisted(()=>({ access:vi.fn(), calendar:vi.fn() }));
vi.mock("@/lib/session",()=>({requireUser:async()=>({id:"owner"})}));
vi.mock("@/lib/billing/entitlements",()=>({getEntitlement:mocks.access,PlanLimitError:class extends Error {}}));
vi.mock("@/lib/calendar/service",async()=>{const {z}=await import("zod");return {calendarData:mocks.calendar,requestSchema:z.object({month:z.string(),mode:z.enum(["real","demo"]).default("real"),accounts:z.string().optional(),archived:z.string().default("0"),basis:z.string().default("net"),day:z.string().optional()})};});
import { weeklyReview } from "@/lib/weekly-review/service";
import { generateWeeklyReview, type WeeklyFacts } from "@/lib/weekly-review/generator";
const summary={total:"40",count:8,activeDays:4,positive:3,negative:1,zero:0,best:null,worst:null};
const facts:WeeklyFacts={summary,basis:"gross",estimated:false,days:[{date:"2026-11-16",amount:"50",count:2},{date:"2026-11-17",amount:"-20",count:2},{date:"2026-11-18",amount:"5",count:2},{date:"2026-11-19",amount:"5",count:2}]};
beforeEach(()=>{vi.clearAllMocks();mocks.access.mockResolvedValue({accounts:[{id:"permitted",writable:true,archived:false}]});mocks.calendar.mockImplementation(async(p)=>p.day?{day:{count:2,gross:"50"},records:[{id:"trade",href:"/trade-view/trade"}]}:{month:"2026-11",basis:"gross",timezone:"Asia/Jerusalem",weeks:[{dates:["2026-11-15","2026-11-16","2026-11-17","2026-11-18","2026-11-19","2026-11-20","2026-11-21"],summary}],days:facts.days.map(d=>({...d,gross:d.amount})),processing:{failed:false,unpublished:0,outdated:false}});});
describe("real weekly review",()=>{
 it("uses the exact calendar summary and gross fallback without an external provider",async()=>{const fetch=vi.spyOn(globalThis,"fetch").mockRejectedValue(Error("No external calls"));try{const r=await weeklyReview({month:"2026-11",week:"2026-11-15",accounts:"permitted"});expect(r.facts.summary).toEqual(summary);expect(r.facts.basis).toBe("gross");expect(r.wording.observation).toContain("gross P&L");expect(r.evidence[0].href).toBe("/trade-view/trade");expect(fetch).not.toHaveBeenCalled();expect(mocks.calendar.mock.calls.every(([p])=>p.accounts==="permitted")).toBe(true);}finally{fetch.mockRestore();}});
 it("denies foreign and plan-restricted accounts before reading trades",async()=>{for(const id of ["foreign","locked"]){await expect(weeklyReview({month:"2026-11",week:"2026-11-15",accounts:id})).rejects.toThrow();}expect(mocks.calendar).not.toHaveBeenCalled();});
 it("does not substitute demo data",async()=>{await expect(weeklyReview({month:"2026-11",week:"2026-11-15",mode:"demo"})).rejects.toThrow();expect(mocks.calendar).not.toHaveBeenCalled();});
 it("does not return evidence after plan access is withdrawn mid-request",async()=>{mocks.access.mockResolvedValueOnce({accounts:[{id:"permitted",writable:true,archived:false}]}).mockResolvedValueOnce({accounts:[{id:"permitted",writable:false,archived:false}]});await expect(weeklyReview({month:"2026-11",week:"2026-11-15",accounts:"permitted"})).rejects.toThrow();});
 it("does not manufacture observations for empty or small samples",()=>{expect(generateWeeklyReview({...facts,summary:{...summary,count:0}}).observation).toBeNull();expect(generateWeeklyReview({...facts,days:facts.days.slice(0,2)}).practice).toBeNull();expect(generateWeeklyReview(facts).observation).toContain("+$50.00");});
});
