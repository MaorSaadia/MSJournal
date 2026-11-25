import { PublicWebAnalytics } from "@/components/public-web-analytics";
import { indexableDeployment } from "@/lib/seo";
import { PublicPageLink } from "@/components/public-page-link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { templateFor, templates, legacyTemplates } from "@/lib/book/templates";
import { bookMetadata } from "@/lib/book/seo";
import { userSession } from "@/lib/session";
import { linkOptions } from "@/lib/book/service";
import { absoluteUrl } from "@/lib/seo";
import { BookHeader } from "@/components/book/public-header";
import { WorksheetEditor } from "@/components/book/editor";
export const dynamic="force-dynamic";
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const slug=(await params).slug;const t=templateFor(slug);return t ? bookMetadata(t):{title:legacyTemplates.some(t=>t.slug===slug) ? "Previous edition worksheet" : "Worksheet not found",robots:{index:false,follow:true}};}
export default async function WorksheetPage({params}:{params:Promise<{slug:string}>}){
  const slug=(await params).slug;
  const t=templateFor(slug);
  if(!t){const previous=legacyTemplates.find(t=>t.slug===slug);if(!previous)notFound();return <div className="book-public"><PublicWebAnalytics enabled={indexableDeployment} /><BookHeader /><main className="book-retired"><p className="book-eyebrow">PREVIOUS EDITION</p><h1>{previous.title}</h1><p>This worksheet belongs to the previous edition. Your saved entries, original questions and history remain available in My saved worksheets.</p><div className="book-links"><PublicPageLink href="/worksheets">My saved worksheets</PublicPageLink><PublicPageLink href="/book">Explore the four current worksheets →</PublicPageLink></div></main></div>;}
  const session=await userSession(await headers());
  const options=session && t.linkKind ? await linkOptions(session.user.id,t.linkKind):[];
  const PageLink = session ? Link : PublicPageLink;
  return <div className="book-public book-current">{!session && <PublicWebAnalytics enabled={indexableDeployment} />}<div className="book-screen"><BookHeader documentNavigation={!session} /></div><main><header className="book-worksheet-heading book-screen"><PageLink href="/book">← Back to worksheets</PageLink><p className="book-eyebrow">APPENDIX {t.letter}</p><h1>{t.title}</h1><p>{t.purpose}</p></header><WorksheetEditor template={t} user={session ? {id:session.user.id,name:session.user.name}:null} options={options} companionUrl={absoluteUrl("/book")} /><nav className="book-related book-screen" aria-label="Other worksheets">{templates.filter(x=>x.id!==t.id).map(x=><PageLink key={x.id} href={`/book/${x.slug}`}>{x.shortTitle} →</PageLink>)}</nav></main></div>;
}
