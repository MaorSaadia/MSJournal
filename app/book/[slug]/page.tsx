import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { templateFor, templates, book } from "@/lib/book/templates";
import { bookMetadata } from "@/lib/book/seo";
import { userSession } from "@/lib/session";
import { linkOptions } from "@/lib/book/service";
import { absoluteUrl } from "@/lib/seo";
import { BookHeader } from "@/components/book/public-header";
import { WorksheetEditor } from "@/components/book/editor";
export const dynamic="force-dynamic";
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const t=templateFor((await params).slug);return t ? bookMetadata(t):{title:"Worksheet not found"};}
export default async function WorksheetPage({params}:{params:Promise<{slug:string}>}){
  const t=templateFor((await params).slug);if(!t)notFound();
  const session=await userSession(await headers());
  const options=session && t.linkKind ? await linkOptions(session.user.id,t.linkKind):[];
  return <div className="book-public"><div className="book-screen"><BookHeader /></div><main><header className="book-worksheet-heading book-screen"><Link href="/book">← All companion worksheets</Link><p className="book-eyebrow">APPENDIX {t.letter} · CHAPTERS {t.chapters} · TEMPLATE v{t.version}</p><h1>{t.title}</h1><p>{t.purpose}</p><small>{book.title} · {book.author} · Free, no subscription required</small></header><WorksheetEditor template={t} user={session ? {id:session.user.id,name:session.user.name}:null} options={options} companionUrl={absoluteUrl("/book")} /><nav className="book-related book-screen" aria-label="Related worksheets"><h2>Other pages you may find useful</h2>{templates.filter(x=>x.category===t.category && x.id!==t.id).map(x=><Link key={x.id} href={`/book/${x.slug}`}>{x.letter} — {x.title} →</Link>)}<Link href="/book">View all 12 worksheets →</Link></nav></main></div>;
}
