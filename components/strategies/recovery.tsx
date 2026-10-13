"use client";
import { confirmAction } from "@/components/ui/confirm-action";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePrivateRequest } from "@/components/calendar/cache-provider";
import { requestJson } from "@/lib/client-api";
import { SnapshotInstructions } from "./assignment";
import type { Playbook } from "@/lib/strategies/model";
import type { TradeViewData } from "@/lib/journal/view-model";
type Recovery = {
  fields: Playbook;
  answers: Record<string, string>;
  playbookRevision: number;
  id: string;
  accountId: string;
  revision: number;
  strategyId: string;
  name: string;
  symbol: string;
  sourceIds: string[];
};
export function StrategyRecovery() {
  const state = usePrivateRequest<{
    userId: string;
    timezone: string;
    rows: Recovery[];
  }>("recovery=1", "/api/strategies/assignment");
  return (
    <section className="strategy-record">
      <h2>Strategy assignments needing recovery</h2>
      <p className="muted">
        Original snapshots and answers are preserved. Unresolved classifications
        are excluded from strategy totals.
      </p>
      {state.error ? (
        <p role="alert">{state.error}</p>
      ) : state.data?.rows.length ? (
        state.data.rows.map((row) => (
          <RecoveryCard key={row.id} row={row} refresh={state.refresh} />
        ))
      ) : (
        <p>No strategy assignments need attention.</p>
      )}
    </section>
  );
}
function RecoveryCard({
  row,
  refresh,
}: {
  row: Recovery;
  refresh: () => void;
}) {
  const [page, setPage] = useState(1),
    [records, setRecords] = useState<TradeViewData | null>(null),
    [target, setTarget] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void requestJson<TradeViewData>(
      `/api/journal?accounts=${row.accountId}&archived=1&page=${page}&size=25`,
    )
      .then((v) => {
        if (active) setRecords(v);
      })
      .catch(() => {
        if (active) setError("Could not load current records.");
      });
    return () => {
      active = false;
    };
  }, [row.accountId, page]);
  return (
    <article className="review-recovery-card">
      <h3>
        {row.name} · {row.symbol}
      </h3>
      <p>
        {row.sourceIds.length} original portions · snapshot and responses kept
      </p>
      <details>
        <summary>
          Preserved revision {row.playbookRevision} and checklist answers
        </summary>
        <SnapshotInstructions fields={row.fields} />
        {row.fields.checklist.map((item) => (
          <p key={item.id}>
            {item.text}: {row.answers[item.id] ?? "Not assessed"}
          </p>
        ))}
      </details>
      <p className="muted">
        For conflicting merges, keep one classification and explicitly discard
        the others before counting strategy results.
      </p>
      <label>
        Choose one current record
        <select
          aria-label={`Recovery target for ${row.name}`}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="">Select a record</option>
          {records?.rows.map((r) => (
            <option value={r.id} key={r.id}>
              {r.symbol} · {r.exit} · {r.type}
            </option>
          ))}
        </select>
      </label>
      <div className="playbook-actions">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous records
        </button>
        <span>Page {page}</span>
        <button
          disabled={!records || page >= records.pages}
          onClick={() => setPage(page + 1)}
        >
          Next records
        </button>
        <button
          disabled={!target}
          onClick={async () => {
            if (
              !(await confirmAction(
                "Attach this preserved strategy and answers to exactly this record? Other unresolved assignments are kept.",
              ))
            )
              return;
            try {
              await requestJson("/api/strategies/assignment", {
                method: "POST",
                body: JSON.stringify({
                  recordId: target,
                  revision: row.revision,
                  strategyId: row.strategyId,
                  recoverId: row.id,
                  confirmReset: true,
                }),
              });
              refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Recovery failed.");
            }
          }}
        >
          Recover assignment
        </button>
        <button
          onClick={async () => {
            if (
              !(await confirmAction(
                "Discard this unresolved strategy classification and its checklist responses? Trade notes, images and financial records are kept.",
              ))
            )
              return;
            try {
              await requestJson("/api/strategies/assignment", {
                method: "DELETE",
                body: JSON.stringify({
                  id: row.id,
                  revision: row.revision,
                  confirmed: true,
                }),
              });
              refresh();
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Could not discard classification.",
              );
            }
          }}
        >
          Discard unresolved classification
        </button>
        <Link href={`/strategies/${row.strategyId}`}>Open playbook</Link>
      </div>
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
