"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { animate, useReducedMotion } from "motion/react";

export function BooksMotion({ children, selection = "" }: {children:ReactNode; selection?:string}) {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const node = root.current;
    if (!node || reduced || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const elements = [...node.querySelectorAll<HTMLElement>("[data-book-enter]")];
    const controls = elements.map((element, index) => animate(element, {opacity:[.65,1],y:[10,0]}, {duration:.4,delay:Math.min(index*.035,.18),ease:[.22,1,.36,1]}));
    return () => { controls.forEach((c) => c.stop()); elements.forEach((el) => {el.style.removeProperty("opacity");el.style.removeProperty("transform");}); };
  },[selection,reduced]);
  return <div ref={root}>{children}</div>;
}
