"use client";
import Link from "next/link";
import type { Block, Template } from "@/lib/book/templates";
import { answerCell, type Answer, type WorksheetFields } from "@/lib/book/model";
import { countWarnings, valueOf } from "@/lib/book/current-calculations";
import { CellControl } from "./fields";

export function CurrentForm({template,fields,answer,reading}:{template:Template;fields:WorksheetFields;answer:(id:string,value:Answer)=>void;reading:boolean}){
  function control(block: Block) {
    if(block.kind === "heading")return null;
    if(block.kind === "instruction"){
      if(block.id === `${template.id}-intro`)return null;
      if(block.id === "reset-link")return <p className="worksheet-risk-warning" key={block.id}>The actual loss can exceed my estimate. If I feel the urge to chase or win money back, I use the <Link href="/book/after-a-missed-trade-or-loss">reset card in Appendix C →</Link>.</p>;
      return <p key={block.id} className={block.id.startsWith("step-") ? "reset-instruction" : "worksheet-inline-instruction"}>{block.text}</p>;
    }
    if(block.kind === "table")return null;
    if(reading)return <div className="reset-personal-rule" key={block.id}><h3>{block.label}</h3><p dir="auto">{valueOf(fields,block.id) || "Not written yet — choose Edit to add your response."}</p></div>;
    return <CellControl key={block.id} field={block} cell={answerCell(fields.answers[block.id])} onChange={v=>answer(block.id,v)} />;
  }
  const sections:{id:string;title?:string;blocks:Block[]}[]=[{id:"opening",blocks:[]}];
  for(const b of template.blocks){if(b.kind === "heading")sections.push({id:b.id,title:b.text,blocks:[]});else sections.at(-1)!.blocks.push(b);}
  function blocks(items:Block[]){
    const rows=[];
    for(let i=0;i<items.length;i++){
      const b=items[i];
      if("group" in b && b.group){const group=b.group;const grouped:Block[]=[b];while(i+1<items.length && "group" in items[i+1] && (items[i+1] as {group?:string}).group===group)grouped.push(items[++i]);rows.push(grouped.length === 1 ? control(b) : <div className={`worksheet-field-row worksheet-group-${group}`} key={b.id}>{grouped.map(control)}</div>);}
      else rows.push(control(b));
    }
    return rows;
  }
  const warnings=template.id === "pattern-2" ? countWarnings(fields):[];
  return <form onSubmit={e=>e.preventDefault()} className={`worksheet-form current-worksheet-form ${template.id === "reset-2" ? "current-reset-form" : ""}`}>
    {template.id === "session-2" && <nav className="worksheet-section-nav" aria-label="Session sections">{sections.filter(s=>s.title).map(s=><a key={s.id} href={`#worksheet-${s.id}`}>{s.title}</a>)}</nav>}
    {sections.filter(s=>s.title || s.blocks.some(b=>b.id !== `${template.id}-intro`)).map(s=><section key={s.id} id={`worksheet-${s.id}`} className={`worksheet-section worksheet-section-${s.id}`}>{s.title && <h2>{s.title}</h2>}{blocks(s.blocks)}{s.id === "responses" && warnings.length>0 && <div className="worksheet-validation" role="status">{warnings.map(w=><p key={w}>{w}</p>)}</div>}</section>)}
  </form>;
}
