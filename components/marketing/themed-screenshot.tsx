"use client";
// Native picture selects one already-optimized theme/viewport asset.
import {useTheme} from "next-themes";
import {useEnhanced} from "./use-enhanced";
import type {ProductPreview} from "./previews";

export function ThemedScreenshot({preview,feature=false,mobile=false,className="",priority="auto",loading="lazy",onLoad}:{preview:ProductPreview;feature?:boolean;mobile?:boolean;className?:string;priority?:"high"|"auto";loading?:"lazy"|"eager";onLoad?:()=>void}){
  const {resolvedTheme}=useTheme(),enhanced=useEnhanced();
  const dark=enhanced && resolvedTheme ? resolvedTheme === "dark":null;
  // SSR/no-JS follows the OS. After hydration, the saved/manual app theme wins.
  const darkMedia=(base?:string)=>dark === null ? `${base ? `${base} and `:""}(prefers-color-scheme: dark)`:dark ? base || "all":"not all";
  return <picture className={`marketing-screenshot ${className}`} data-theme={dark === null ? "system":dark ? "dark":"light"}>
    {mobile && <><source media={darkMedia("(max-width: 640px)")} srcSet={preview.mobileSrc}/><source media="(max-width: 640px)" srcSet={preview.lightMobileSrc}/></>}
    <source media={darkMedia()} srcSet={feature ? preview.featureSrc:preview.src}/>
    <img src={feature ? preview.lightFeatureSrc:preview.lightSrc} alt={preview.alt} width={feature ? 1200:preview.width} height={feature ? 788:preview.height} loading={loading} fetchPriority={priority} decoding="async" onLoad={onLoad} onError={onLoad}/>
  </picture>;
}
