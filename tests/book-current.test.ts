import { describe, it, expect } from "vitest";
import { templates, legacyTemplates, isPreviousEdition } from "@/lib/book/templates";
import { emptyFields, validateFields } from "@/lib/book/model";
import { countWarnings, riskProduct } from "@/lib/book/current-calculations";
import { blankPdf } from "@/lib/book/pdf";
import { PDFDocument } from "pdf-lib";
import { printRows, printSections } from "@/lib/book/print-layout";

describe("simplified companion edition",()=>{
  it("keeps every question and qualification in organized print groups, including estimate instructions",()=>{
    for(const t of templates){
      const printed=printSections(t).flatMap(s=>printRows(s.blocks).flat());
      expect(printed.map(b=>b.id)).toEqual(t.blocks.filter(b=>b.kind !== "heading" && b.id !== `${t.id}-intro`).map(b=>b.id));
    }
    expect(printSections(templates[1]).flatMap(s=>s.blocks).find(b=>b.id === "estimate-intro")).toMatchObject({text:expect.stringContaining("costs and slippage")});
  });
  it("uses four separate stable IDs and preserves the previous definitions",()=>{
    expect(templates.map(t=>t.id)).toEqual(["plan-2","session-2","reset-2","pattern-2"]);
    expect(legacyTemplates).toHaveLength(12);
    expect(legacyTemplates.map(t=>t.id)).toContain("B-1");
    expect(legacyTemplates[1].title).toBe("Account and Prop-Firm Fact Sheet");
    for(const t of templates){expect(isPreviousEdition(t)).toBe(false);expect(validateFields(t,emptyFields(t))).toBeTruthy();expect(legacyTemplates.some(old=>old.id===t.id)).toBe(false);}
    expect(isPreviousEdition(legacyTemplates[1])).toBe(true);
    const old=emptyFields(legacyTemplates[0]);
    old.answers["a-1860-0"]={state:"unknown",value:"",note:"Original meaning"};
    expect(()=>validateFields(templates[0],old)).toThrow();
  });
  it("keeps qualifications and corrects the reset reference without adding an adherence score",()=>{
    const session=templates[1].blocks;
    expect(session.find(b=>b.id === "reset-link")).toMatchObject({text:expect.stringContaining("Appendix C")});
    expect(session.find(b=>b.id === "reset-link")).toMatchObject({text:expect.stringContaining("actual loss can exceed")});
    expect(templates[2].blocks.filter(b=>b.id.startsWith("step-"))).toHaveLength(4);
    expect(templates[2].purpose).toBe("The next trade owes me nothing.");
    expect(templates[3].blocks.find(b=>b.id === "revisions")).toMatchObject({text:expect.stringContaining("rule I had at the time")});
    expect(templates.flatMap(t=>t.blocks).some(b=>b.kind === "table")).toBe(false);
  });
  it("multiplies explicit valid values only with precision-safe arithmetic",()=>{
    expect(riskProduct("0.1","3")).toBe("0.3");
    expect(riskProduct("0","3")).toBe("0");
    for(const pair of [["","3"],["2",""],["-1","3"],["NaN","1"]])expect(riskProduct(...pair as [string,string])).toBeNull();
  });
  it("flags count totals without preventing draft saves and handles no opportunities",()=>{
    const fields=emptyFields(templates[3]);
    fields.answers["trigger-count"]={state:"value",value:"0"};
    expect(countWarnings(fields)).toContain("No opportunity to practice.");
    fields.answers.followed={state:"value",value:"2"};fields.answers.broke={state:"value",value:"0"};fields.answers.unsure={state:"value",value:"0"};
    expect(countWarnings(fields).join(" ")).toContain("add up");
    fields.answers.followed={state:"value",value:"-1.5"};
    expect(countWarnings(fields).join(" ")).toContain("nonnegative whole");
    expect(validateFields(templates[3],fields)).toBeTruthy();
  });
  it("generates all four blank PDFs and both workbook paper sizes",async()=>{
    for(const paper of ["a4","letter"] as const){
      for(const t of templates)expect((await PDFDocument.load(await blankPdf([t],paper))).getPageCount()).toBeGreaterThan(0);
      expect((await PDFDocument.load(await blankPdf(templates,paper))).getPageCount()).toBeGreaterThanOrEqual(4);
    }
  });
});
