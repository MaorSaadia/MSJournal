"use client";
import { useState } from "react";
import { usePrivateRequest } from "@/components/calendar/cache-provider";
import { confirmations, confirmationName } from "@/lib/reviews/confirmations";
import type { DiscoveryOptions } from "@/lib/journal/discovery";
export function TradeConfirmations({ selected, change, disabled }: { selected: string[]; change: (values: string[]) => void; disabled: boolean }) {
  const options = usePrivateRequest<DiscoveryOptions>("", "/api/reviews/filter-options");
  const [custom, setCustom] = useState("");
  const [error, setError] = useState("");
  const choices = [...new Set([...(options.data?.confirmations ?? confirmations), ...selected])];
  function add() {
    const parsed = confirmationName.safeParse(custom);
    if (!parsed.success) { setError("Enter a single-line confirmation, up to 60 characters."); return; }
    const known = choices.find((v) => v.toLowerCase() === parsed.data.toLowerCase()) ?? parsed.data;
    if (!selected.includes(known)) change([...selected, known]);
    setCustom(""); setError("");
  }
  return <section className="trade-confirmations"><h3>Trade confirmations</h3>
    <p className="small muted">What supported this entry? Select all that applied.</p>
    <div className="review-chips">{choices.map((v) => <button type="button" key={v} aria-pressed={selected.includes(v)} disabled={disabled || (!selected.includes(v) && selected.length >= 30)} onClick={() => change(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v])}>{v}</button>)}</div>
    <label className="field-label">Custom confirmation<input value={custom} maxLength={60} disabled={disabled} placeholder="e.g. Higher-timeframe alignment" onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if(e.key === "Enter") { e.preventDefault(); if (custom.trim() && selected.length < 30) add(); } }} /></label>
    <button type="button" disabled={disabled || !custom.trim() || selected.length >= 30} onClick={add}>Add confirmation</button>
    {error && <p role="alert">{error}</p>}
  </section>;
}
