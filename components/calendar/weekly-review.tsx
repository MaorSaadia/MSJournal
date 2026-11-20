"use client";
import { useState } from "react";
import Link from "next/link";
import { usePrivateRequest } from "./cache-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { journalTimestamp } from "@/lib/timezones";
import { journalMoney } from "@/lib/journal/calculations";
import type { WeeklyReview } from "@/lib/weekly-review/service";
export function WeeklyReviewButton({ query, week }: { query:string; week:string }) {
  const [open,setOpen] = useState(false), [copied,setCopied] = useState(false);
  const state = usePrivateRequest<WeeklyReview>(open ? `${query}&week=${week}` : null,"/api/weekly-review");
  const data = state.error ? undefined : state.data;
  return <><Button variant="ghost" onClick={() => {setOpen(true);setCopied(false);}}>Review my week<span className="sr-only"> starting {week}</span></Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="weekly-review-dialog">
      <DialogTitle>Weekly Review</DialogTitle><DialogDescription>{week} · Calendar display timezone and filters apply. Month-edge weeks include only dates visible in this month and selected range.</DialogDescription>
      {!data ? <p role="status">{state.error ? "Review could not load. Close and reopen to retry, or check your account selection." : "Preparing your week…"}</p> : <div aria-busy={false}>
        <section><h3>Your week</h3><p>{data.facts.summary.count} closed trades · {data.facts.summary.activeDays} trading days</p><strong>{journalMoney(data.facts.summary.total,true)} {data.facts.estimated && data.facts.basis === "net" ? "estimated net" : data.facts.basis} P&amp;L</strong><p className="small muted">{data.timezone}. Counts and totals match the calendar’s weekly summary. Partial exits keep the calendar’s trade-count convention.</p></section>
        {(data.processing.failed || data.processing.unpublished || data.processing.outdated) && <p role="status">Some activity needs processing. Review covers currently published calendar results only.</p>}
        <section><h3>One pattern worth reviewing</h3><p>{data.wording.observation ?? data.wording.reason}</p>{data.wording.observation && <><p className="small muted">Descriptive results from this selection; this does not establish a cause or predict future results. Evidence: strongest day’s closed trades.</p><ul>{data.evidence.map(r => <li key={r.id}>{r.href && <Link href={r.href}>{r.account} · {r.symbol} · {journalTimestamp(r.exitAt, data.timezone)} · {journalMoney(data.facts.basis === "net" ? r.net : r.gross,true)}</Link>}</li>)}</ul></>}</section>
        <section><h3>One thing to practice</h3><p>{data.wording.practice ?? "Choose another week or record one decision you want to review when more evidence is available."}</p>{data.wording.practice && <><Button onClick={async () => {try {await navigator.clipboard.writeText(data.wording.practice!);setCopied(true);}catch {setCopied(false);}}}>Copy practice question</Button><span role="status">{copied ? "Copied—paste into your journal." : ""}</span> <Link href="/notebook">Open journal</Link></>}</section>
      </div>}
    </DialogContent></Dialog></>;
}
