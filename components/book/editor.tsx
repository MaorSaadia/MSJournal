"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading";
import { confirmAction } from "@/components/ui/confirm-action";
import { useWritingGuard } from "@/components/daily/writing-guard";
import { SaveController } from "@/lib/reviews/save-controller";
import { requestJson } from "@/lib/client-api";
import { emptyFields, answerCell, recordTime, type WorksheetData, type WorksheetFields, type Answer } from "@/lib/book/model";
import { guestKey, recoveryKey, parseDraft, draftForUser, readDraft, writeDraft, subscribeDraft } from "@/lib/book/drafts";
import { type Template } from "@/lib/book/templates";
import { CellControl, TableControl } from "./fields";
import { CalculationHelpers } from "./calculation-helpers";
import { PrintDocument } from "./print-document";

type Option = { id:string; label:string; href:string };
export function WorksheetEditor({ template, initial, user, options = [], companionUrl }: { template:Template; initial?:WorksheetData; user:{id:string;name:string}|null; options?:Option[]; companionUrl:string }) {
  const router=useRouter();
  const pendingKey=user ? recoveryKey(user.id,initial?.id ?? `new-${template.id}`):"";
  const [controller]=useState(()=>{
    let id=initial?.id;
    const previous=pendingKey ? draftForUser(parseDraft(readDraft(pendingKey),template.id),user?.id ?? null):null;
    const clientId=previous?.clientId ?? crypto.randomUUID();
    const data:WorksheetData=initial ?? {id:"",ownerId:user?.id ?? "",templateId:template.id,template,fields:emptyFields(template),status:"draft",revision:0,createdAt:"",updatedAt:"",completedAt:null,clientId};
    return new SaveController<WorksheetFields,WorksheetData>(data,async(draft,revision)=>{
      const saved=await requestJson<WorksheetData>(id ? `/api/worksheets/${id}` : "/api/worksheets",{method:id ? "PATCH" : "POST",body:JSON.stringify(id ? {...draft,revision} : {...draft,templateId:template.id,clientId})});
      id=saved.id; return saved;
    });
  });
  const state=useSyncExternalStore(controller.subscribe,controller.read,controller.read);
  const gkey=guestKey(template.slug), rkey=pendingKey;
  const rawGuest=useSyncExternalStore(subscribeDraft,()=>readDraft(gkey),()=>"");
  const rawRecovery=useSyncExternalStore(subscribeDraft,()=>rkey ? readDraft(rkey) : "",()=>"");
  const guest=useMemo(()=>parseDraft(rawGuest,template.id),[rawGuest,template.id]);
  const transferable=draftForUser(guest,user?.id ?? null);
  const recovery=useMemo(()=>parseDraft(rawRecovery,template.id),[rawRecovery,template.id]);
  const restored=useRef(false), transfer=useRef(false);
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [printBlank,setPrintBlank]=useState(false);
  useEffect(()=>{
    if (!user && guest && !guest.offeredTo && !restored.current) {
      restored.current=true; controller.useLatest({...controller.read().data,fields:guest.fields,status:guest.status});
    }
    if (user && guest && !guest.offeredTo) writeDraft(gkey,{...guest,offeredTo:user.id});
  },[user,guest,gkey,controller]);
  useEffect(()=>{
    if (!user || !state.dirty || ["saving","error","conflict"].includes(state.state)) return;
    const timer=setTimeout(()=>void controller.save(),900); return ()=>clearTimeout(timer);
  },[user,state.dirty,state.draft,state.state,controller]);
  useEffect(()=>{
    if (user && state.dirty && rkey) writeDraft(rkey,{...state.draft,templateId:template.id,offeredTo:user.id,createdAt:new Date().toISOString(),revision:state.data.revision,clientId:state.data.clientId,transfer:transfer.current});
    if (user && !state.dirty && state.state === "saved") {
      if(rkey)writeDraft(rkey,null);
      if(transfer.current){writeDraft(gkey,null);transfer.current=false;}
      if(!initial && state.data.id)router.replace(`/worksheets/${state.data.id}`);
    }
  },[user,state.dirty,state.draft,state.state,state.data.revision,state.data.id,state.data.clientId,rkey,gkey,template.id,initial,router]);
  useWritingGuard(()=>!!user && controller.read().dirty);
  const fields=state.draft.fields;
  function edit(next:WorksheetFields){
    if(!user && guest?.offeredTo){setNotice("A draft from a previous sign-in is protected in this tab. Clear it explicitly before starting a new guest draft.");return;}
    controller.edit({fields:next,status:"draft"});
    if(!user){const saved=writeDraft(gkey,{fields:next,status:"draft",templateId:template.id,offeredTo:null,createdAt:guest?.createdAt ?? new Date().toISOString(),revision:0});if(!saved)setNotice("Temporary browser storage is unavailable. Keep this tab open and print your work before leaving.");}
  }
  function answer(id:string,value:Answer){edit({...fields,answers:{...fields.answers,[id]:value}});}
  async function transferGuest(){
    if(!user || !transferable)return;
    if(!await confirmAction(`Save the temporary draft from ${recordTime(transferable.createdAt)} into ${user.name}'s account as a new entry? Existing entries will not be overwritten.`,{title:"Save browser draft",confirmLabel:"Save new entry"}))return;
    transfer.current=true;controller.edit({fields:{...transferable.fields,title:transferable.fields.title || template.title},status:transferable.status});await controller.save();
  }
  async function completed(){
    if(!user){setPrintBlank(false);requestAnimationFrame(()=>window.print());return;}
    await controller.save();const current=controller.read();
    if(current.dirty || !current.data.id){setNotice("Save successfully before printing the account copy. Your edits remain here.");return;}
    router.push(`/worksheets/${current.data.id}/print?revision=${current.data.revision}`);
  }
  async function duplicate(mine=false){
    if(!user)return;setBusy(true);setNotice("");
    try{
      const saved=mine ? await requestJson<WorksheetData>("/api/worksheets",{method:"POST",body:JSON.stringify({templateId:template.id,clientId:crypto.randomUUID(),fields,status:"draft"})}) : await requestJson<WorksheetData>(`/api/worksheets/${initial!.id}`,{method:"POST",body:"{}"});
      controller.useLatest({...saved});if(rkey)writeDraft(rkey,null);router.push(`/worksheets/${saved.id}`);
    }catch(e){setNotice(e instanceof Error ? e.message : "Could not duplicate. Your original is kept.");}finally{setBusy(false);}
  }
  async function remove(){
    if(!initial || !await confirmAction("Delete this worksheet and its saved revisions permanently? This does not delete any linked MSJournal record.",{title:"Delete worksheet",confirmLabel:"Delete permanently",destructive:true}))return;
    setBusy(true);try{await requestJson(`/api/worksheets/${initial.id}`,{method:"DELETE",body:JSON.stringify({revision:state.data.revision})});controller.useLatest(state.data);if(rkey)writeDraft(rkey,null);router.push("/worksheets");}catch(e){setNotice(e instanceof Error ? e.message : "Could not delete.");}finally{setBusy(false);}
  }
  const selectedLink=options.find(o=>o.id===fields.link?.id);
  return <div className="worksheet-editor">
    <div className="book-screen">
      {!user && <aside className="worksheet-banner"><strong>Your work is not saved to an account.</strong><p>Temporary drafts stay in this browser tab for navigation and sign-in. Closing the tab can remove them. <Link href={`/login?next=${encodeURIComponent(`/book/${template.slug}`)}`}>Sign in</Link> or <Link href={`/signup?next=${encodeURIComponent(`/book/${template.slug}`)}`}>create a free account</Link> to save and resume.</p></aside>}
      {user && !initial && transferable && <aside className="worksheet-banner"><strong>A temporary draft is ready</strong><p>From {recordTime(transferable.createdAt)}. Save it explicitly into {user.name}’s account as a separate entry.</p><Button onClick={transferGuest}>Save browser draft to my account</Button></aside>}
      {user && !initial && guest && !transferable && <p className="worksheet-banner">A temporary draft belongs to a different sign-in. It will not be attached to this account.</p>}
      {user && recovery && state.state !== "saved" && !state.dirty && <aside className="worksheet-banner"><strong>Unsaved edits are available in this tab.</strong><p>They are tied to this account and entry. A newer server revision will require conflict resolution.</p><Button onClick={()=>{transfer.current=!!recovery.transfer;controller.useLatest({...state.data,revision:recovery.revision});controller.edit({fields:recovery.fields,status:recovery.status});}}>Restore unsaved edits</Button><Button variant="outline" onClick={()=>writeDraft(rkey,null)}>Discard local recovery copy</Button></aside>}
      <div className="worksheet-toolbar"><div role="status" aria-live="polite">{state.state === "saving" ? <><LoadingSpinner /> Saving worksheet</> : state.state === "error" || state.state === "conflict" ? "Your edits are kept" : user ? state.state === "saved" ? "Saved" : state.dirty ? "Unsaved changes" : "Ready to write" : "Temporary browser draft"}{state.data.updatedAt && <small>Last saved {recordTime(state.data.updatedAt)}</small>}</div><div className="worksheet-actions">
        {user && <Button disabled={busy || state.state === "saving" || state.state === "conflict"} onClick={async()=>{if(!state.data.id && !state.dirty)controller.edit({fields:{...fields,title:fields.title || template.title},status:state.draft.status});await controller.save();}}>Save now</Button>}
        {user && <Button variant="outline" disabled={busy || state.state === "saving" || state.state === "conflict"} onClick={async()=>{controller.edit({fields,status:"reviewed"});await controller.save();}}>Mark complete</Button>}
        <Button variant="outline" onClick={()=>{setPrintBlank(true);requestAnimationFrame(()=>window.print());}}>Print blank</Button><Button variant="outline" onClick={completed}>Print completed</Button>
        <a href={`/book/downloads/${template.slug}.pdf`}>Download blank PDF</a>
        {initial && <><Button variant="outline" disabled={busy || state.dirty} onClick={()=>duplicate()}>Duplicate</Button><Button variant="outline" disabled={busy || state.state === "saving"} onClick={remove}>Delete</Button></>}
        {!initial && <Button variant="ghost" onClick={async()=>{if(await confirmAction("Clear the temporary draft in this tab? Saved account entries are unaffected.",{confirmLabel:"Clear draft",title:"Clear browser draft"})){writeDraft(gkey,null);if(!user)controller.useLatest({...state.data,fields:emptyFields(template),status:"draft"});}}}>Clear browser draft</Button>}
      </div></div>
      {(notice || state.error) && <div role="alert" className="worksheet-error"><p>{notice || state.error}</p>{state.state === "error" && <Button onClick={()=>controller.save()}>Retry save</Button>}{state.state === "conflict" && <><Button onClick={()=>duplicate(true)}>Save my edits as a new entry</Button>{(initial?.id || state.data.id) && <Button variant="outline" onClick={async()=>{if(await confirmAction("Replace local edits with the latest saved version?",{title:"Reload saved worksheet",confirmLabel:"Reload"})){const latest=await requestJson<WorksheetData>(`/api/worksheets/${initial?.id || state.data.id}`);controller.useLatest(latest);if(rkey)writeDraft(rkey,null);}}}>Reload saved version</Button>}<Link href="/worksheets">Review My Worksheets</Link></>}</div>}
      <section className="worksheet-identity"><label>Entry title<input aria-label="Entry title" value={fields.title} maxLength={160} placeholder="For example, Monday review or Operating plan v2" onChange={e=>edit({...fields,title:e.target.value})} /></label><p><strong>{state.draft.status === "reviewed" ? "Completed by you" : "Draft"}</strong> · Completion records your choice; it does not certify readiness or compliance. Editing a completed entry creates a revised draft and preserves its completed history.</p>
        {template.blocks.some(b=>b.kind==="datetime-local") && <label>Timezone for local event timestamps<input value={fields.recordTimezone ?? ""} placeholder="For example, Asia/Jerusalem or America/New_York" maxLength={80} onChange={e=>edit({...fields,recordTimezone:e.target.value})} /><small>Enter the actual IANA timezone. Blank means not recorded; your account’s display timezone is not assumed.</small></label>}
        <label className="worksheet-check"><input type="checkbox" checked={fields.retrospective} onChange={e=>edit({...fields,retrospective:e.target.checked})} />This entry includes retrospective additions or corrections.</label>{fields.retrospective && <label>What was reconstructed or corrected?<textarea value={fields.retrospectiveNote} maxLength={1000} onChange={e=>edit({...fields,retrospectiveNote:e.target.value})} /></label>}
        {user && template.linkKind && <details><summary>Optional link to an existing {template.linkKind}</summary><p>This is a reference only. No values are prefilled and no source record is changed.</p><select aria-label="Linked MSJournal record" value={fields.link?.id ?? ""} onChange={e=>edit({...fields,link:e.target.value ? {kind:template.linkKind!,id:e.target.value} : null})}><option value="">Standalone — no link</option>{fields.link && !selectedLink && <option value={fields.link.id}>Previous reference unavailable — detach to save changes</option>}{options.map(o=><option value={o.id} key={o.id}>{o.label} · {o.id.slice(0,8)}</option>)}</select>{selectedLink && <Link href={selectedLink.href}>Open linked record →</Link>}{!options.length && <p className="muted">No eligible records yet. You can use the worksheet on its own.</p>}</details>}
      </section>
      <form onSubmit={e=>e.preventDefault()} className={`worksheet-form ${template.letter === "G" ? "worksheet-reset" : ""}`}>
        {template.blocks.map(b=>b.kind === "heading" ? <h2 key={b.id}>{b.text}</h2> : b.kind === "instruction" ? <p className="worksheet-instruction" key={b.id}>{b.text}</p> : b.kind === "table" ? <TableControl key={b.id} field={b} answer={fields.answers[b.id]} onChange={v=>answer(b.id,v)} /> : <CellControl key={b.id} field={b} cell={answerCell(fields.answers[b.id])} onChange={v=>answer(b.id,v)} />)}
      </form>
      <CalculationHelpers letter={template.letter} fields={fields} />
    </div>
    <div className="book-local-print"><PrintDocument template={template} fields={printBlank ? undefined : fields} companionUrl={companionUrl} revision={initial?.revision} /></div>
  </div>;
}
