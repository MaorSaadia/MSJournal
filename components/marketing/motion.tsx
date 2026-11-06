"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { animate, scroll, useReducedMotion } from "motion/react";

export function LandingMotion({children}:{children:ReactNode}){
  const root=useRef<HTMLDivElement>(null),reduced=useReducedMotion();
  useEffect(()=>{
    const node=root.current;if(!node || reduced || window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
    const stops:(()=>void)[]=[];
    node.querySelectorAll<HTMLElement>("[data-enter]").forEach((el,i)=>{const control=animate(el,{opacity:[.5,1],y:[12,0]},{duration:.6,delay:i*.07,ease:[.22,1,.36,1]});stops.push(()=>control.stop());});
    const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){const control=animate(entry.target as HTMLElement,{opacity:[.5,1],y:[14,0]},{duration:.45,ease:[.22,1,.36,1]});stops.push(()=>control.stop());observer.unobserve(entry.target);}},{threshold:.1});
    node.querySelectorAll("[data-reveal]").forEach(el=>observer.observe(el));
    const media=window.matchMedia("(min-width: 900px) and (pointer: fine)"),frame=node.querySelector<HTMLElement>(".marketing-preview-depth");
    let stopScroll:(()=>void)|undefined;
    const configure=()=>{stopScroll?.();if(frame){frame.style.transform="";if(media.matches)stopScroll=scroll(progress=>{frame.style.transform=`translate3d(0,${progress*24}px,0) rotateX(${2-progress*2}deg)`;},{target:frame,offset:["start end","end start"]});}};
    configure();media.addEventListener("change",configure);
    return()=>{observer.disconnect();stops.forEach(stop=>stop());stopScroll?.();media.removeEventListener("change",configure);node.querySelectorAll<HTMLElement>("[data-enter],[data-reveal]").forEach(el=>{el.style.removeProperty("opacity");el.style.removeProperty("transform");});if(frame)frame.style.transform="";};
  },[reduced]);
  return <div ref={root} className="marketing-motion">{children}</div>;
}
