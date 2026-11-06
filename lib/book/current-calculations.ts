import { D } from "@/lib/journal/processing";
import { answerCell, type WorksheetFields } from "./model";

export function valueOf(fields: WorksheetFields, id: string) {
  const cell = answerCell(fields.answers[id]);
  return cell?.state === "value" ? cell.value : "";
}
export function riskProduct(perUnit: string, units: string): string | null {
  const valid = (v: string) => /^\d{1,16}(\.\d{1,8})?$/.test(v);
  if (!valid(perUnit) || !valid(units)) return null;
  return new D(perUnit).mul(units).toFixed();
}
export function countWarnings(fields: WorksheetFields): string[] {
  const ids = ["observed", "opportunities", "review-count", "trigger-count", "followed", "broke", "unsure"];
  const warnings: string[] = [];
  const count = (id: string) => {
    const value = valueOf(fields, id);
    return /^\d{1,16}$/.test(value) ? new D(value) : null;
  };
  if (ids.some(id => valueOf(fields,id) !== "" && !count(id))) warnings.push("Use nonnegative whole numbers for opportunity and response counts. You can still save this draft.");
  const observed=count("observed"), opportunities=count("opportunities");
  if(observed && opportunities && observed.gt(opportunities))warnings.push("The observed response count exceeds the relevant opportunities. Check these counts.");
  const trigger=count("trigger-count"), responses=[count("followed"),count("broke"),count("unsure")];
  const responseTotal=responses.reduce<InstanceType<typeof D>>((sum,v)=>sum.plus(v ?? 0),new D(0));
  if(trigger && (responseTotal.gt(trigger) || responses.every(v=>v!==null) && !responseTotal.eq(trigger)))warnings.push("Followed, broke and unsure counts should add up to the times the trigger occurred. Check the totals when you’re ready.");
  if(trigger?.eq(0))warnings.push("No opportunity to practice.");
  return warnings;
}
