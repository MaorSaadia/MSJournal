"use client";
import { LoadingState } from "@/components/ui/loading";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePrivateRequest } from "@/components/calendar/cache-provider";
import { requestJson } from "@/lib/client-api";
import type { StrategyPlan, StrategyData } from "@/lib/strategies/model";
import type { StrategyList } from "./index";
import { SnapshotInstructions } from "./assignment";
export function PlannedStrategies({
  plans,
  onChange,
}: {
  plans: StrategyPlan[];
  onChange: (plans: StrategyPlan[]) => void;
}) {
  const state = usePrivateRequest<StrategyList>(
    "archived=active",
    "/api/strategies",
  );
  return (
    <section className="planned-strategies">
      <h2>Strategies I intend to use</h2>
      <p className="muted">
        Personal preparation only. This does not classify imported trades.
      </p>
      {state.error ? (
        <p role="alert">
          {state.error}
          <button onClick={state.refresh}>Retry strategies</button>
        </p>
      ) : (
        <label>
          Add a planned strategy
          <select
            aria-label="Add planned strategy"
            value=""
            onChange={(e) => {
              const strategy = state.data?.strategies.find(
                (s) => s.id === e.target.value,
              );
              if (strategy)
                onChange([
                  ...plans,
                  { strategyId: strategy.id, revision: strategy.revision },
                ]);
            }}
          >
            <option value="">Choose an active strategy</option>
            {state.data?.strategies
              .filter((s) => !plans.some((p) => p.strategyId === s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {plans.map((p) => (
        <PlanSnapshot
          key={`${p.strategyId}:${p.revision}`}
          plan={p}
          remove={() =>
            onChange(plans.filter((i) => i.strategyId !== p.strategyId))
          }
        />
      ))}
    </section>
  );
}
function PlanSnapshot({
  plan,
  remove,
}: {
  plan: StrategyPlan;
  remove: () => void;
}) {
  const [data, setData] = useState<StrategyData | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void requestJson<StrategyData>(
      `/api/strategies?id=${plan.strategyId}&revision=${plan.revision}`,
    )
      .then((v) => {
        if (active) setData(v);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [plan.strategyId, plan.revision]);
  return (
    <article className="planned-strategy">
      <div className="playbook-actions">
        <strong>
          {data?.fields.name ?? "Saved strategy"} · revision {plan.revision}
        </strong>
        <Link href={`/strategies/${plan.strategyId}`}>Open playbook</Link>
        <button onClick={remove}>Remove from plan</button>
      </div>
      {error ? (
        <p role="alert">
          Could not load saved instructions. The revision reference is kept.
        </p>
      ) : data ? (
        <details>
          <summary>
            Planned instructions and checklist
            {data.archived ? " · archived" : ""}
          </summary>
          <SnapshotInstructions fields={data.fields} />
        </details>
      ) : (
        <LoadingState variant="list" label="Loading saved instructions" />
      )}
    </article>
  );
}
