"use client";
import { useRef, useState, type KeyboardEvent } from "react";
import { Expand, ArrowUpRight, LayoutDashboard, CalendarDays, NotebookPen, WalletCards } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { previews } from "./previews";
import { useEnhanced } from "./use-enhanced";
import {useTheme} from "next-themes";
import {ThemedScreenshot} from "./themed-screenshot";

const icons=[LayoutDashboard,CalendarDays,NotebookPen,WalletCards];
export function ProductShowcase(){
  const enhanced=useEnhanced();
  const {resolvedTheme}=useTheme();
  const [selected,setSelected]=useState(0),[open,setOpen]=useState(false),[loaded,setLoaded]=useState(true);
  const tabs=useRef<(HTMLButtonElement|null)[]>([]),image=previews[selected];
  const opener=useRef<HTMLButtonElement>(null);
  function select(index:number){if(index!==selected){setLoaded(false);setSelected(index);}}
  function keys(event:KeyboardEvent,index:number){const next=event.key === "ArrowRight" ? (index+1)%previews.length:event.key === "ArrowLeft" ? (index+previews.length-1)%previews.length:event.key === "Home" ? 0:event.key === "End" ? previews.length-1:null;if(next!==null){event.preventDefault();select(next);tabs.current[next]?.focus();}}
  function warm(index:number){if(index===selected)return;const img=new window.Image(),p=previews[index],light=resolvedTheme === "light";img.src=window.matchMedia("(max-width: 640px)").matches ? light ? p.lightMobileSrc:p.mobileSrc:light ? p.lightSrc:p.src;}

  return <section id="workspace" className="marketing-showcase" aria-label="Explore the MSJournal workspace">
    <div className="marketing-preview-depth">
      <div className="marketing-preview-toolbar"><div className="marketing-window-dots" aria-hidden="true"><i/><i/><i/></div><span>MSJournal / Your workspace</span><span className="marketing-preview-private">Private by design <span aria-hidden="true">↗</span></span></div>
      <div className="marketing-preview-tabs" role="tablist" aria-label="Product previews">{previews.map((p,i)=>{const Icon=icons[i];return <button key={p.id} ref={el=>{tabs.current[i]=el;}} id={`preview-tab-${p.id}`} disabled={!enhanced} role="tab" aria-selected={i===selected} aria-controls={`preview-panel-${p.id}`} tabIndex={i===selected ? 0:-1} onKeyDown={e=>keys(e,i)} onClick={()=>select(i)} onPointerEnter={()=>warm(i)} onFocus={()=>warm(i)}><Icon size={16} aria-hidden="true" />{p.label}</button>;})}</div>
      <div id={`preview-panel-${image.id}`} aria-labelledby={`preview-tab-${image.id}`} role="tabpanel" tabIndex={0} className="marketing-preview-panel">
        <button disabled={!enhanced} ref={opener} className="marketing-preview-image" onClick={()=>setOpen(true)} aria-label={`Enlarge ${image.label} screenshot`}>
          <ThemedScreenshot key={image.id} preview={image} mobile className={loaded ? "preview-loaded":""} priority={selected===0 ? "high":"auto"} loading="eager" onLoad={()=>setLoaded(true)}/>
          <span className="marketing-enlarge"><Expand size={15} aria-hidden="true" /> Take a closer look</span>
        </button>
      </div>
      {previews.filter(p=>p.id!==image.id).map(p=><div key={p.id} id={`preview-panel-${p.id}`} role="tabpanel" aria-labelledby={`preview-tab-${p.id}`} hidden/>)}
      <div className="marketing-preview-caption"><p><span aria-hidden="true"/>Illustrative demo data</p><span>One connected trading journal <ArrowUpRight size={14} aria-hidden="true" /></span></div>
    </div>
    <div className="marketing-preview-description" aria-live="polite"><p className="marketing-kicker">{image.eyebrow}</p><h2>{image.title}</h2><p>{image.description}</p></div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="marketing-lightbox" onCloseAutoFocus={e=>{e.preventDefault();opener.current?.focus();}}><DialogTitle>{image.label}</DialogTitle><DialogDescription>Current MSJournal workspace · Illustrative demo data</DialogDescription><div className="marketing-lightbox-scroll"><ThemedScreenshot preview={image} loading="eager"/></div></DialogContent></Dialog>
  </section>;
}
