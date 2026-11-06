"use client";
import {useSyncExternalStore} from "react";
const subscribe=()=>()=>{};
export function useEnhanced(){return useSyncExternalStore(subscribe,()=>true,()=>false);}
