"use client";
import { useLayoutEffect, useRef } from "react";
import { blankCell, type Cell, type Answer } from "@/lib/book/model";
import type { Input, Table } from "@/lib/book/templates";
function TextArea({ value, onChange, label, id }: { value: string; onChange: (value: string)=>void; label: string; id: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(()=>{const el=ref.current;if(el){el.style.height="auto";el.style.height=`${Math.max(76,el.scrollHeight)}px`;}},[value]);
  return <textarea id={id} ref={ref} aria-label={label} value={value} maxLength={5000} rows={2} dir="auto" onChange={(e)=>onChange(e.target.value)} />;
}
export function CellControl({ field, cell = blankCell(), onChange, prefix = "" }: { field: Input; cell?: Cell; onChange:(cell:Cell)=>void; prefix?:string }) {
  const id = `${prefix}-${field.id}`;
  const value = cell.state === "value" ? cell.value : "";
  function change(value:string){onChange(value ? {state:"value",value} : blankCell());}
  const singleCheck=field.kind === "multichoice" && field.choices?.length === 1 && field.choices[0] === field.label;
  return <div className="worksheet-control">{!singleCheck && <label id={`${id}-label`} htmlFor={id}>{field.label}</label>}<div className="worksheet-value">
    {cell.state === "unknown" || cell.state === "not-applicable" ? <div className="worksheet-state-value"><p>{cell.state === "unknown" ? "Unknown — identify what needs verification." : "Not applicable — record the reason where relevant."}</p><textarea id={id} aria-label={`${field.label} reason`} value={cell.note ?? ""} maxLength={1000} rows={2} placeholder="Reason, verification needed or reference" onChange={e=>onChange({...cell,note:e.target.value})} /></div> : field.kind === "multichoice" || field.kind === "choice" ? <div id={id} className="worksheet-choices" role={field.kind === "choice" ? "radiogroup" : "group"} aria-labelledby={singleCheck ? undefined : `${id}-label`} aria-label={singleCheck ? field.label : undefined}>{field.choices?.map((c)=>{const selected=value.split("\n").includes(c);return <label key={c}><input type={field.kind === "choice" ? "radio" : "checkbox"} name={field.kind === "choice" ? id : undefined} checked={selected} onChange={()=>change(field.kind === "choice" ? selected ? "" : c : (selected ? value.split("\n").filter(x=>x!==c) : [...(value ? value.split("\n") : []),c]).join("\n"))} />{c}</label>;})}</div> : field.kind === "textarea" ? <TextArea id={id} label={field.label} value={value} onChange={change} /> : <input id={id} aria-label={field.label} type={field.kind === "number" ? "text" : field.kind} value={value} readOnly={field.readOnly} aria-readonly={field.readOnly || undefined} inputMode={field.kind === "number" ? field.count ? "numeric" : "decimal" : undefined} maxLength={5000} onChange={e=>change(e.target.value)} />}
    {(cell.state === "unknown" || cell.state === "not-applicable") && <button type="button" className="worksheet-replace-status" onClick={()=>onChange(blankCell())}>Write an answer instead</button>}

  </div>{field.hint && <small className="worksheet-field-hint">{field.hint}</small>}{field.count && cell.state === "value" && value && !/^\d{1,16}$/.test(value) && <small className="worksheet-count-warning">Use a nonnegative whole number. This draft can still be saved.</small>}</div>;
}
export function TableControl({ field, answer, onChange }: { field: Table; answer?: Answer; onChange:(answer:Answer)=>void }) {
  const rows = answer && "rows" in answer ? answer.rows : [];
  return <details className="worksheet-table"><summary>{field.label} <small>({rows.length} records)</small></summary><p className="muted">Expand the records you need. All questions remain in blank and completed print copies.</p>{rows.map((r,i)=><div className="worksheet-row" key={r.id}><header><strong>{field.rows?.[i]?.label ?? `Record ${i+1}`}</strong>{!field.rows && <button type="button" onClick={()=>onChange({rows:rows.filter(row=>row.id!==r.id)})} aria-label={`Remove record ${i+1}`}>Remove</button>}</header><div className="worksheet-row-fields">{field.columns.map((c,n)=>field.rows && n===0 && !field.rows[i].firstEditable ? null : <CellControl key={c.id} prefix={`${field.id}-${r.id}`} field={c} cell={r.cells[c.id]} onChange={cell=>onChange({rows:rows.map(row=>row.id===r.id ? {...row,cells:{...row.cells,[c.id]:cell}} : row)})} />)}</div></div>)}{!field.rows && <button className="worksheet-add-row" type="button" disabled={rows.length>=150} onClick={()=>onChange({rows:[...rows,{id:crypto.randomUUID(),cells:Object.fromEntries(field.columns.map(c=>[c.id,blankCell()]))}]})}>+ Add record</button>}{!rows.length && <p className="muted">No records yet. Add only relevant events; an empty table is a valid draft.</p>}</details>;
}
