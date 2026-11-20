import "server-only";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { getEntitlement, PlanLimitError } from "@/lib/billing/entitlements";
import { calendarData, requestSchema } from "@/lib/calendar/service";
import { daySchema, type CalendarMonth, type CalendarDetails } from "@/lib/calendar/model";
import { ReviewError } from "@/lib/reviews/model";
import { generateWeeklyReview, type WeeklyFacts } from "./generator";

export async function weeklyReview(input: unknown, headers?: Headers) {
  const owner = await requireUser(headers);
  const { week, ...raw } = z.object({ week: daySchema }).passthrough().parse(input);
  const params = requestSchema.parse(raw);
  if (params.mode !== "real" || params.day) throw new ReviewError("Weekly Review uses your real calendar selection.",400);
  const access = await getEntitlement(owner.id);
  const permitted = access.accounts.filter(a => a.writable && (params.archived === "1" || !a.archived)).map(a => a.id);
  const ids = params.accounts === undefined ? permitted : [...new Set(params.accounts.split(",").filter(Boolean))];
  if (ids.some(id => !permitted.includes(id))) throw new PlanLimitError("Choose accounts available on your current plan to review this week.");
  const scope = { ...params, accounts: ids.join(",") };
  const month = await calendarData(scope,headers) as CalendarMonth;
  const selected = month.weeks.find(w => w.dates[0] === week);
  if (!selected) throw new ReviewError("Choose a week shown in this calendar month.",400);
  const days = month.days.filter(d => selected.dates.includes(d.date));
  const facts: WeeklyFacts = { summary: selected.summary, basis: month.basis === "net" ? "net" : "gross", estimated: month.estimated,
    days: days.map(d => ({ date:d.date, amount:(month.basis === "net" ? d.net : d.gross)!,count:d.count })) };
  const wording = generateWeeklyReview(facts);
  const details = wording.evidenceDate ? await calendarData({ ...scope, day:wording.evidenceDate },headers) as CalendarDetails : null;
  // Never return stale evidence if an import or fee edit changed the day mid-request.
  if (details && (details.day?.count !== days.find(d => d.date === wording.evidenceDate)?.count ||
    (month.basis === "net" ? details.day?.net : details.day?.gross) !== facts.days.find(d => d.date === wording.evidenceDate)?.amount))
    throw new ReviewError("Your trades changed while reviewing. Please retry.",409);
  const latest = await getEntitlement(owner.id);
  if (ids.some(id => !latest.accounts.some(a => a.id === id && a.writable))) throw new PlanLimitError();
  return { userId:owner.id, timezone:month.timezone, title:"Weekly Review", source:"local" as const, week:selected.dates,
    month:month.month, facts, wording, evidence:details?.records ?? [], processing:month.processing };
}
export type WeeklyReview = Awaited<ReturnType<typeof weeklyReview>>;
