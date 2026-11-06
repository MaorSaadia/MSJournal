import Link from "next/link";
import { z } from "zod";
import { notFound } from "next/navigation";
import { readWorksheet, historyFor, linkOptions } from "@/lib/book/service";
import { requirePageUser } from "@/lib/session";
import { NotFoundError } from "@/lib/accounts/service";
import { WorksheetEditor } from "@/components/book/editor";
import { absoluteUrl } from "@/lib/seo";
export const metadata={title:"Saved worksheet"};
export default async function EntryPage({params}:{params:Promise<{id:string}>}){
  const owner=await requirePageUser(), id=(await params).id;if(!z.uuid().safeParse(id).success)notFound();
  const load=async()=>{
    try{
    const entry=await readWorksheet(id), history=await historyFor(id), options=await linkOptions(owner.id,entry.template.linkKind);
    return {entry,history,options};
  }catch(e){if(e instanceof NotFoundError)notFound();throw e;}
  };
  const {entry,history,options}=await load();
    return <div className="worksheets-workspace"><header className="page-header"><div><Link href="/worksheets">← My Worksheets</Link><h1>{entry.template.title}</h1><p>Appendix {entry.template.letter} · Chapters {entry.template.chapters} · Template v{entry.template.version} · Revision {entry.revision}</p></div></header><WorksheetEditor key={entry.id} template={entry.template} initial={entry} user={{id:owner.id,name:owner.name}} options={options} companionUrl={absoluteUrl("/book")} /><details className="worksheet-history"><summary>Saved history · {history.length} versions</summary><p>Completed versions stay available when later answers change. These are records, not proof of readiness.</p>{history.map(h=><p key={h.revision}><Link href={`/worksheets/${id}/print?revision=${h.revision}`}>Revision {h.revision} · {h.status === "reviewed" ? "Completed by you":"Draft"} · {h.recordedAt.toISOString()} →</Link></p>)}</details></div>;
}
