"use client";
import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePrivateRequest } from "@/components/calendar/cache-provider";
import { requestJson } from "@/lib/client-api";
import { SaveController } from "@/lib/reviews/save-controller";
import { useWritingGuard } from "@/components/daily/writing-guard";
import {
  playbookNotes,
  type AssignmentData,
  type Playbook,
} from "@/lib/strategies/model";
export function SnapshotInstructions({ fields }: { fields: Playbook }) {
  return (
    <div className="playbook-snapshot">
      <p>{fields.description}</p>
      {playbookNotes.map(([key, label]) =>
        fields[key] ? (
          <div key={key}>
            <strong>{label}</strong>
            <p>{fields[key]}</p>
          </div>
        ) : null,
      )}
      <ul>
        {fields.checklist.map((i) => (
          <li key={i.id}>{i.text}</li>
        ))}
      </ul>
    </div>
  );
}
export function RecordStrategy({ recordId }: { recordId: string }) {
  const state = usePrivateRequest<AssignmentData>(
    `recordId=${recordId}`,
    "/api/strategies/assignment",
  );
  return (
    <section className="strategy-record">
      <h2>Primary strategy</h2>
      {state.error ? (
        <p role="alert">
          {state.error}
          <button onClick={state.refresh}>Retry strategy</button>
        </p>
      ) : state.data ? (
        <AssignmentEditor key={recordId} initial={state.data} />
      ) : (
        <p role="status">Loading classification…</p>
      )}
    </section>
  );
}
type AssignmentFields = {
  previousStrategyId: string | null;
  strategyId: string | null;
  answers: Record<string, "Met" | "Not met" | "Not assessed">;
};
type SavedAssignment = AssignmentData & {
  fields: AssignmentFields;
  revision: number;
  status: "draft";
};
const shape = (data: AssignmentData): SavedAssignment => ({
  ...data,
  fields: {
    previousStrategyId: data.assignment?.strategyId ?? null,
    strategyId: data.assignment?.strategyId ?? null,
    answers: data.assignment?.answers ?? {},
  },
  revision: data.assignment?.revision ?? 0,
  status: "draft",
});
function AssignmentEditor({ initial }: { initial: AssignmentData }) {
  const [controller] = useState<
    SaveController<AssignmentFields, SavedAssignment>
  >(
    () =>
      new SaveController<AssignmentFields, SavedAssignment>(
        shape(initial),
        async (draft, revision) => {
          const changing =
            draft.fields.previousStrategyId !== null &&
            draft.fields.previousStrategyId !== draft.fields.strategyId;
          if (
            changing &&
            !window.confirm(
              "Replace or remove this strategy snapshot? Its checklist responses will be discarded. Trade notes and screenshots are kept.",
            )
          )
            throw new Error(
              "Assignment change cancelled. Your selection is kept.",
            );
          return shape(
            await requestJson<AssignmentData>("/api/strategies/assignment", {
              method: "POST",
              body: JSON.stringify({
                recordId: initial.recordId,
                revision,
                strategyId: draft.fields.strategyId,
                answers: changing ? {} : draft.fields.answers,
                confirmReset: !!changing,
              }),
            }),
          );
        },
      ),
  );
  const state = useSyncExternalStore(
      controller.subscribe,
      controller.read,
      controller.read,
    ),
    [search, setSearch] = useState(""),
    [message, setMessage] = useState("");
  const dirty = useCallback(() => controller.read().dirty, [controller]);
  useWritingGuard(dirty);
  useEffect(() => {
    let active = true;
    void requestJson<AssignmentData>(
      `/api/strategies/assignment?recordId=${initial.recordId}`,
    )
      .then((v) => {
        if (
          active &&
          !controller.read().dirty &&
          controller.read().state !== "saving"
        )
          controller.accept(shape(v));
      })
      .catch(() => {
        if (active)
          setMessage("Could not refresh the strategy. Your input is kept.");
      });
    return () => {
      active = false;
    };
  }, [controller, initial.recordId]);
  const assignment = state.data.assignment,
    choices = state.data.strategies.filter(
      (s) =>
        (!s.archived || s.id === assignment?.strategyId) &&
        (s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.id === state.draft.fields.strategyId),
    );
  async function adopt() {
    if (
      !assignment ||
      !window.confirm(
        "Adopt the latest instructions? This replaces the checklist snapshot and resets all answers to Not assessed.",
      )
    )
      return;
    try {
      controller.accept(
        shape(
          await requestJson<AssignmentData>("/api/strategies/assignment", {
            method: "POST",
            body: JSON.stringify({
              recordId: initial.recordId,
              revision: state.data.revision,
              strategyId: assignment.strategyId,
              adoptLatest: true,
              confirmReset: true,
            }),
          }),
        ),
      );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Could not adopt latest instructions. Save any unsaved answers first.",
      );
    }
  }
  return (
    <div>
      <div className="playbook-form-row">
        <label>
          Find a strategy
          <input
            aria-label="Search strategy options"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name"
          />
        </label>
        <label>
          Primary strategy
          <select
            aria-label="Primary strategy"
            value={state.draft.fields.strategyId ?? ""}
            onChange={(e) =>
              controller.edit({
                status: "draft",
                fields: {
                  previousStrategyId: state.data.assignment?.strategyId ?? null,
                  strategyId: e.target.value || null,
                  answers: {},
                },
              })
            }
          >
            <option value="">Unassigned</option>
            {choices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.archived ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="playbook-actions">
        <button
          disabled={
            !state.dirty ||
            state.state === "saving" ||
            state.state === "conflict"
          }
          onClick={() => void controller.save()}
        >
          Save strategy assignment
        </button>
        <span role="status">
          {state.state === "saving"
            ? "Saving…"
            : state.state === "error"
              ? "Save error"
              : state.state === "conflict"
                ? "Conflicting assignment"
                : state.dirty
                  ? "Unsaved selection / answers"
                  : "Saved"}
        </span>
        {state.draft.fields.strategyId && (
          <Link href={`/strategies/${state.draft.fields.strategyId}`}>
            Open playbook
          </Link>
        )}
      </div>
      {(state.error || message) && <p role="alert">{state.error ?? message}</p>}
      {state.state === "conflict" && (
        <button
          onClick={async () => {
            try {
              const latest = await requestJson<AssignmentData>(
                `/api/strategies/assignment?recordId=${initial.recordId}`,
              );
              if (
                window.confirm(
                  "Load the current assignment and discard your unsaved selection/answers?",
                )
              )
                controller.useLatest(shape(latest));
            } catch {
              setMessage("Could not reload assignment.");
            }
          }}
        >
          Load current assignment
        </button>
      )}
      {assignment && (
        <>
          <p className="muted">
            {assignment.fields.name} · snapshotted revision{" "}
            {assignment.playbookRevision}
            {assignment.archived ? " · archived strategy" : ""}. User
            assessment, not automatic compliance.
          </p>
          {assignment.latestRevision !== assignment.playbookRevision && (
            <div className="playbook-actions">
              <span>
                Earlier revision · latest is {assignment.latestRevision}
              </span>
              <button
                disabled={
                  state.dirty || assignment.archived || state.state === "saving"
                }
                onClick={() => void adopt()}
              >
                Adopt latest version
              </button>
            </div>
          )}
          <details>
            <summary>Saved strategy instructions</summary>
            <SnapshotInstructions fields={assignment.fields} />
          </details>
          {assignment.fields.checklist.map((item) => (
            <label className="strategy-answer" key={item.id}>
              <span>{item.text}</span>
              <select
                aria-label={`Checklist: ${item.text}`}
                disabled={
                  state.draft.fields.strategyId !== assignment.strategyId
                }
                value={state.draft.fields.answers[item.id] ?? "Not assessed"}
                onChange={(e) =>
                  controller.edit({
                    status: "draft",
                    fields: {
                      ...state.draft.fields,
                      previousStrategyId:
                        state.data.assignment?.strategyId ?? null,
                      answers: {
                        ...state.draft.fields.answers,
                        [item.id]: e.target.value as
                          "Met" | "Not met" | "Not assessed",
                      },
                    },
                  })
                }
              >
                {["Not assessed", "Met", "Not met"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          ))}
        </>
      )}
    </div>
  );
}
