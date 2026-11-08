"use client";
import { usePrivateRequest } from "@/components/calendar/cache-provider";
import { confirmations } from "@/lib/reviews/confirmations";
import { emotions } from "@/lib/reviews/model";
import { durationLabels } from "@/lib/journal/analysis-filters";
import type { DiscoveryOptions } from "@/lib/journal/discovery";

export function DiscoveryFilters({ values, change, strategy = true }: { values: URLSearchParams; change: (key: string, value: string) => void; strategy?: boolean }) {
  const options = usePrivateRequest<DiscoveryOptions>("", "/api/reviews/filter-options");
  function select(key: string, label: string, choices: [string, string][], fallback = "") {
    const selected = values.get(key) ?? fallback;
    return <label className="field-label" key={key}>{label}<select aria-label={label} value={selected} onChange={(e) => change(key, e.target.value)}>
      {key !== "emotionStage" && <option value="">Any {label.toLowerCase()}</option>}
      {selected && !choices.some(([v]) => v === selected) && <option value={selected}>{selected}</option>}
      {choices.map(([v, text]) => <option value={v} key={v}>{text}</option>)}
    </select></label>;
  }
  return <div className="discovery-filters">
    {options.error && <p role="alert" className="small">Could not load saved filter choices. <button onClick={options.refresh}>Retry</button></p>}
    {strategy && select("strategy", "Strategy", [["unassigned", "Unassigned"], ...(options.data?.strategies ?? []).map((s): [string,string] => [s.id, s.name])])}
    {select("confirmation", "Confirmation", (options.data?.confirmations ?? confirmations).map((v) => [v,v]))}
    {select("emotionStage", "Emotion stage", [["before","Before the trade"],["during","During the trade"],["after","After the trade"]], "before")}
    {select("emotion", "Emotion", (options.data?.emotions ?? emotions).map((v) => [v,v]))}
    {select("hour", "Entry hour", Array.from({ length:24 }, (_,i) => [String(i), `${String(i).padStart(2,"0")}:00–${String(i).padStart(2,"0")}:59`]))}
    {select("weekday", "Exit weekday", ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((v,i) => [String(i),v]))}
    {select("holding", "Holding duration", Object.entries(durationLabels))}
    {select("adherence", "Plan adherence", [["followed","Followed my plan"],["partly","Partly followed my plan"],["not-followed","Did not follow my plan"]])}
    <p className="small muted">Times use your journal timezone. Filters combine; only trades matching every selection are included. Unrecorded assessments do not match a selected tag.</p>
  </div>;
}
