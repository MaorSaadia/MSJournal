"use client";
import { useState } from "react";
import Link from "next/link";
import { recordTime } from "@/lib/book/model";
import type { Template } from "@/lib/book/templates";
type Item={id:string;title:string;template:Template;status:string;createdAt:string;updatedAt:string;linkKind:string|null};
export function MyWorksheets({ entries }: { entries:Item[] }){
  const [q,setQ]=useState(""),[type,setType]=useState(""),[status,setStatus]=useState("");
  const filtered=entries.filter(e=>(!type || e.template.letter===type) && (!status || e.status===status) && `${e.title} ${e.template.title}`.toLowerCase().includes(q.toLowerCase()));
  return <><div className="book-filters"><label>Search<input type="search" value={q} onChange={e=>setQ(e.target.value)} /></label><label>Worksheet<select value={type} onChange={e=>setType(e.target.value)}><option value="">All types</option>{[...new Map(entries.map(e=>[e.template.letter,e.template])).values()].map(t=><option key={t.id} value={t.letter}>{t.letter} — {t.title}</option>)}</select></label><label>Status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option><option value="draft">Draft</option><option value="reviewed">Completed by me</option></select></label></div><div className="my-worksheet-list">{filtered.map(e=><article key={e.id}><span className="book-letter">{e.template.letter}</span><div><h2><Link href={`/worksheets/${e.id}`}>{e.title || e.template.title}</Link></h2><p>{e.template.title} · v{e.template.version} · {e.status === "reviewed" ? "Completed by you":"Draft"}</p><small>Created {recordTime(e.createdAt)} · Updated {recordTime(e.updatedAt)}{e.linkKind ? ` · Linked ${e.linkKind}`:" · Standalone"}</small></div><Link href={`/worksheets/${e.id}`}>Open →</Link></article>)}</div>{!filtered.length && <section className="worksheet-banner"><h2>{entries.length ? "No matching worksheets":"Your next useful record starts here"}</h2><p>Choose a standing plan, a session record or a reset card. You can keep multiple entries and return to completed versions.</p><Link href="/book">Choose a worksheet →</Link></section>}</>;
}
