import {requirePageUser} from "@/lib/session";
import {getStrategy} from "@/lib/strategies/service";
import {NotFoundError} from "@/lib/accounts/service";
import {notFound} from "next/navigation";
import {PlaybookEditor} from "@/components/strategies/editor";
export const metadata={title:"Playbook"};
export default async function Page({params}:{params:Promise<{id:string}>}){await requirePageUser();const {id}=await params;let initial;try{initial=await getStrategy(id);}catch(e){if(e instanceof NotFoundError)notFound();throw e;}return <PlaybookEditor key={id} initial={initial}/>;}
