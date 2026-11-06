"use client";
import { Expand } from "lucide-react";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { previews } from "./previews";
import { useEnhanced } from "./use-enhanced";
import {ThemedScreenshot} from "./themed-screenshot";

export function FeaturePreview({id,title}:{id:string;title:string}){
  const enhanced=useEnhanced();
  const preview=previews.find(p=>p.id===id)!;
  return <Dialog><DialogTrigger asChild><button disabled={!enhanced} className="marketing-feature-preview" aria-label={`Inspect ${title} preview`}>
    <span className="marketing-feature-window"><span className="marketing-window-dots" aria-hidden="true"><i/><i/><i/></span><span>{title}</span><Expand size={14} aria-hidden="true"/></span>
    <ThemedScreenshot preview={preview} feature/>
    <span className="marketing-feature-inspect"><Expand size={13} aria-hidden="true"/> View full screen</span>
  </button></DialogTrigger><DialogContent className="marketing-lightbox"><DialogTitle>{title}</DialogTitle><DialogDescription>Current MSJournal workspace · Illustrative demo data</DialogDescription><div className="marketing-lightbox-scroll"><ThemedScreenshot preview={preview} loading="eager"/></div></DialogContent></Dialog>;
}
