import Link from "next/link";
import { listWorksheets } from "@/lib/book/service";
import { MyWorksheets } from "@/components/book/my-worksheets";
export const metadata={title:"My Worksheets"};
export default async function WorksheetsPage(){
  const entries=await listWorksheets();
  return <div className="worksheets-workspace"><header className="page-header"><div><div className="breadcrumb">Workspace / Book Companion</div><h1>My Worksheets</h1><p>Standing plans, session records and completed versions. Free, no subscription required.</p></div><Link className="book-new" href="/book">+ New worksheet</Link></header><MyWorksheets entries={entries.map(e=>({id:e.id,title:e.fields.title,template:e.template,status:e.status,createdAt:e.createdAt.toISOString(),updatedAt:e.updatedAt.toISOString(),linkKind:e.fields.link?.kind ?? null}))} /></div>;
}
