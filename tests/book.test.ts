import { describe,it,expect } from "vitest";
import { templates } from "@/lib/book/templates";
import source from "@/lib/book/manuscript.json";
import { emptyFields, validateFields, blankCell, type Cell } from "@/lib/book/model";
import { adherence,cashLedger,linearSizing } from "@/lib/book/calculations";
import { draftForUser,parseDraft } from "@/lib/book/drafts";
import { SaveController } from "@/lib/reviews/save-controller";
import { blankPdf } from "@/lib/book/pdf";
import { PDFDocument } from "pdf-lib";
const value=(value:string):Cell=>({state:"value",value});
describe("book companion",()=>{
  it("covers all manuscript blocks, twelve stable templates and substantive table columns",()=>{
    expect(templates.map(t=>t.letter).join("")).toBe("ABCDEFGHIJKL");
    const ids=templates.flatMap(t=>t.blocks.map(b=>b.id));expect(new Set(ids).size).toBe(ids.length);
    for(const original of source.blocks){
      if("text" in original && original.text?.startsWith("Appendix "))continue;
      expect(ids.some(id=>id.endsWith(`-${original.sourceId}`)||id.includes(`-${original.sourceId}-`)),original.sourceId).toBe(true);
      if("rows" in original && original.rows){const table=templates.flatMap(t=>t.blocks).find(b=>b.id.endsWith(`-${original.sourceId}`));expect(table?.kind).toBe("table");if(table?.kind==="table")expect(table.columns.map(c=>c.label)).toEqual(original.rows[0]);}
    }
    for(const t of templates)expect(validateFields(t,emptyFields(t))).toBeTruthy();
  });
  it("keeps zero, blank, unknown and not applicable distinct and rejects foreign fields/columns",()=>{
    const t=templates[11],f=emptyFields(t);
    f.answers["l-2128-0"]=value("0");expect(validateFields(t,f).answers["l-2128-0"]).toEqual(value("0"));
    f.answers["l-2128-0"]={state:"unknown",value:"secret stale value"};expect(()=>validateFields(t,f)).toThrow();
    f.answers["l-2128-0"]=blankCell();f.answers.injected=value("x");expect(()=>validateFields(t,f)).toThrow();
  });
  it("assists only the supplied linear case and never returns permission with missing constraints",()=>{
    const v={entry:"100",stop:"99",tickSize:"0.25",tickValue:"1.25",costs:"1",execution:"0.5",available:"20",increment:"1",maximum:"5",linear:true,constraints:true,exposureReconciled:true};
    expect(linearSizing(v)).toMatchObject({ticks:"4",perUnit:"6.5",quantity:"3",total:"19.5"});
    expect(linearSizing({...v,available:"0"})).toMatchObject({quantity:"0"});
    for(const patch of [{costs:""},{maximum:""},{constraints:false},{exposureReconciled:false},{linear:false},{tickSize:"0"},{execution:"-1"}])expect(linearSizing({...v,...patch})).not.toHaveProperty("quantity");
  });
  it("counts classified relevant events and reports missing evidence without 100% defaults",()=>{
    const row=(trigger:string,response:string)=>({cells:{c1:value(trigger),c2:value(response)}});
    expect(adherence([]).percentage).toBeNull();
    expect(adherence([row("No","Followed"),row("Unknown","Followed")]).percentage).toBeNull();
    expect(adherence([row("Yes","Followed"),row("Yes","Breached"),row("Yes","Unclear"),row("Yes","Not applicable")])).toMatchObject({relevant:4,followed:1,breached:1,unclear:1,notApplicable:1,percentage:"50.00"});
  });
  it("separates currencies and incomplete cash records; zero is explicit",()=>{
    const row=(currency:string,r:string,e:string)=>({cells:{c2:value(r),c3:value(e),c4:value(currency)}});
    const r=cashLedger([row("USD","100","0"),row("EUR","0","20"),row("USD","","3"),row("USD converted at 3.7","4","0")]);
    expect(r.unresolvedCurrency).toBe(1);expect(r.groups).toContainEqual({currency:"USD",received:"100",expenses:"3",difference:null,incomplete:1,rows:2});
    expect(r.groups.find(g=>g.currency==="EUR")?.difference).toBe("-20");
  });
  it("does not transfer an offered draft into a different user",()=>{
    const d={templateId:"A-1",fields:emptyFields(templates[0]),offeredTo:"owner-a",createdAt:new Date().toISOString(),revision:0,status:"draft"};
    const parsed=parseDraft(JSON.stringify(d),"A-1");expect(draftForUser(parsed,"owner-b")).toBeNull();expect(draftForUser(parsed,"owner-a")).toEqual(parsed);expect(parseDraft("broken","A-1")).toBeNull();
  });
  it("retains failed-save edits and retries through the existing controller",async()=>{
    const initial={fields:emptyFields(templates[0]),revision:1,status:"draft" as const};let fail=true;
    const controller=new SaveController<typeof initial.fields,{fields:typeof initial.fields;status:"draft"|"reviewed";revision:number}>(initial,async draft=>{if(fail)throw new Error("Temporarily offline");return {...draft,revision:2};});
    controller.edit({fields:{...initial.fields,title:"Retained draft"},status:"draft"});await controller.save();expect(controller.read().dirty).toBe(true);expect(controller.read().draft.fields.title).toBe("Retained draft");fail=false;await controller.save();expect(controller.read().dirty).toBe(false);
  });
  it("generates valid multipage blank PDFs for every worksheet and the complete workbook",async()=>{
    const pages:number[]=[];
    for(const t of templates){const bytes=await blankPdf([t]);const doc=await PDFDocument.load(bytes);expect(doc.getPageCount()).toBeGreaterThan(0);pages.push(doc.getPageCount());expect(doc.getPages().every(p=>p.getWidth()>500 && p.getHeight()>700)).toBe(true);}
    const combined=await PDFDocument.load(await blankPdf(templates));expect(combined.getPageCount()).toBe(pages.reduce((a,b)=>a+b,0));
    expect((await PDFDocument.load(await blankPdf([templates[6]],"letter"))).getPage(0).getSize()).toEqual({width:612,height:792});
  });
});
