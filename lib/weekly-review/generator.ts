import { D } from "@/lib/journal/processing";
import { journalMoney } from "@/lib/journal/calculations";
import type { CalendarMonth } from "@/lib/calendar/model";

export type WeeklyFacts = {
  summary: CalendarMonth["weeks"][number]["summary"];
  basis: "gross" | "net";
  estimated: boolean;
  days: { date: string; amount: string; count: number }[];
};
// Local provider boundary: deterministic wording from supported facts only.
export function generateWeeklyReview(facts: WeeklyFacts) {
  const label = facts.estimated && facts.basis === "net" ? "estimated net" : facts.basis;
  const best = [...facts.days].sort((a,b) => new D(b.amount).cmp(a.amount))[0];
  if (!facts.summary.count) return { observation: null, practice: null, evidenceDate: null, reason: "No closed trades in this selection. Import trades or choose another week." };
  if (facts.days.length < 4 || facts.summary.count < 8 || !best || !new D(best.amount).gt(0))
    return { observation: null, practice: null, evidenceDate: null, reason: "There isn’t enough evidence for a pattern. Review more comparable trading days; no behavior is inferred from this sample." };
  const rest = facts.days.filter(d => d.date !== best.date).reduce((n,d) => n.plus(d.amount),new D(0));
  return {
    observation: `Across ${facts.days.length} trading days and ${facts.summary.count} closed trades, ${best.date} was your strongest day: ${journalMoney(best.amount,true)} ${label} P&L from ${best.count} trades. The other ${facts.days.length-1} days combined returned ${journalMoney(rest.toFixed(),true)} ${label} P&L.`,
    practice: "What decision from your strongest day is worth testing again, and what specific action would show you followed it?",
    evidenceDate: best.date,
    reason: null,
  };
}
