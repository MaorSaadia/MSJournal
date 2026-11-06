"use client";
import { useState } from "react";
import Link from "next/link";
import { categories, type Template } from "@/lib/book/templates";
export function BookDirectory({ templates }: { templates:Template[] }) {
  const [search,setSearch]=useState(""),[category,setCategory]=useState("");
  const visible=templates.filter(t=>(!category || t.category===category) && `${t.letter} ${t.title} ${t.when} ${t.chapters}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="book-directory" aria-labelledby="worksheet-directory"><h2 id="worksheet-directory">Choose the worksheet you need</h2><div className="book-filters"><label>Find a worksheet<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by title or chapter" /></label><label>Category<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">All worksheets</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label></div><div className="book-card-grid">{visible.map(t=><article className={`book-card ${t.letter === "G" ? "book-reset-card" : ""}`} key={t.id}><span className="book-letter">{t.letter}</span><span className="book-category">{t.category}</span><h3><Link href={`/book/${t.slug}`}>{t.title}</Link></h3><p>{t.purpose}</p><p><strong>When:</strong> {t.when}</p><small>Related chapters {t.chapters} · Template v{t.version}</small><Link className="book-card-action" href={`/book/${t.slug}`}>Open worksheet →</Link></article>)}</div>{!visible.length && <p>No matching worksheets. Try another word or category.</p>}</section>;
}
