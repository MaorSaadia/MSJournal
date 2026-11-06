import Link from "next/link";
import { Compass, NotebookPen, Leaf, ScanLine, ArrowUpRight } from "lucide-react";
import type { Template } from "@/lib/book/templates";
const icons=[Compass,NotebookPen,Leaf,ScanLine];
const descriptions=["Define your setup, limits, and response under pressure.","Prepare, check your next decision, and close the session.","Return to your rules after a missed trade or a loss.","Review one recurring situation and practice one change."];
export function BookDirectory({templates}:{templates:Template[]}){
 return <section className="book-directory" aria-labelledby="worksheet-directory"><div className="book-directory-heading"><p className="book-eyebrow">FOUR TOOLS, YOUR OWN ROUTINE</p><h2 id="worksheet-directory">A little structure. More room to think.</h2></div><div className="book-card-grid">{templates.map((t,i)=>{const Icon=icons[i];return <article className={`book-card book-current-card book-tool-${i}`} key={t.id}><div className="book-card-top"><span className="book-letter">{t.letter}</span><Icon size={24} strokeWidth={1.5} aria-hidden="true" /></div><h3>{t.shortTitle}</h3><p>{descriptions[i]}</p><small>{t.title}</small><Link className="book-card-action" href={`/book/${t.slug}`}>Open worksheet <ArrowUpRight size={16} aria-hidden="true" /></Link></article>})}</div></section>;
}
