import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePageUser } from "@/lib/session";
import { noIndex } from "@/lib/seo";
import { readWorksheet, linkOptions } from "@/lib/book/service";
import { NotFoundError } from "@/lib/accounts/service";
import { absoluteUrl } from "@/lib/seo";
import { PrintDocument } from "@/components/book/print-document";
import { PrintButton } from "@/components/book/print-button";
export const dynamic="force-dynamic";
export const metadata={title:"Private worksheet print",robots:noIndex};
export default async function PrintPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{revision?:string}>}){
  await requirePageUser();
  const id=(await params).id, revision=(await searchParams).revision;
  if(!z.uuid().safeParse(id).success || (revision!==undefined && !/^\d{1,9}$/.test(revision)))notFound();
  const load=async()=>{
    try{
    const entry=await readWorksheet(id,undefined,revision ? Number(revision):undefined);
    const link=entry.fields.link;
    const option=link ? (await linkOptions(entry.ownerId,link.kind)).find(o=>o.id===link.id):null;
    return {entry,link,option};
  }catch(e){if(e instanceof NotFoundError)notFound();throw e;}
  };
  const {entry,link,option}=await load();
    return <main className="worksheet-print-view"><div className="worksheet-print-controls"><Link href={`/worksheets/${id}`}>← Return to saved worksheet</Link>{link && <p>Linked reference: {option ? option.label:"Unavailable; no source-record data is included."}</p>}</div><PrintButton /><PrintDocument template={entry.template} fields={entry.fields} companionUrl={absoluteUrl("/book")} revision={entry.revision} recordedAt={entry.updatedAt} /></main>;
}
