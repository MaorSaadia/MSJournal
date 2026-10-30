"use client";
import { confirmAction } from "@/components/ui/confirm-action";
import { useState, useEffect } from "react";
import Link from "next/link";
import { noteFields, mistakes, type ReviewData } from "@/lib/reviews/model";
import { requestJson } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import type { TradeViewData } from "@/lib/journal/view-model";
type Recovery = ReviewData & {
  symbol: string;
  accountId: string;
  originalSourceIds: string[];
};
export function ReviewRecovery({ initial }: { initial: Recovery[] }) {
  const [rows, setRows] = useState(initial);
  return (
    <>
      <Link className="back-link" href="/trade-view">
        ← Trade View
      </Link>
      <header className="page-header">
        <div>
          <h1>
            Reviews awaiting reassignment<span className="title-dot">.</span>
          </h1>
          <p>
            Processing changed the source grouping. Your original review and
            images are kept. Choose a current record from the same account.
          </p>
        </div>
      </header>
      {!rows.length && (
        <p className="review-setup">
          All reviews are associated with their records.
        </p>
      )}
      {rows.map((r) => (
        <RecoveryCard
          key={r.id}
          review={r}
          done={() => setRows(rows.filter((row) => row.id !== r.id))}
        />
      ))}
    </>
  );
}
function RecoveryCard({
  review,
  done,
}: {
  review: Recovery;
  done: () => void;
}) {
  const [page, setPage] = useState(1),
    [data, setData] = useState<TradeViewData | null>(null),
    [target, setTarget] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void requestJson<TradeViewData>(
      `/api/journal?accounts=${review.accountId}&archived=1&size=25&page=${page}`,
    )
      .then((v) => {
        if (active) setData(v);
      })
      .catch(() => {
        if (active) setError("Could not load current records.");
      });
    return () => {
      active = false;
    };
  }, [review.accountId, page]);
  async function assign() {
    if (
      !target ||
      !(await confirmAction(
        "Attach this original review and its images to the selected current record?",
      ))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/reviews/reassign", {
        method: "POST",
        body: JSON.stringify({
          reviewId: review.id,
          recordId: target,
          revision: review.revision,
        }),
      });
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reassign review.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="review-recovery-card">
      <h2>
        {review.symbol} · {review.status}
      </h2>
      <p className="small muted">
        Original source records: {review.originalSourceIds.join(", ")}
      </p>
      {noteFields
        .filter(([key]) => review.fields[key])
        .map(([key, label]) => (
          <div key={key}>
            <strong>{label}</strong>
            <p className="review-plain">{review.fields[key]}</p>
          </div>
        ))}
      <p className="small">
        Emotions:{" "}
        {Object.entries(review.fields.emotions)
          .map(([s, v]) => `${s}: ${v.join(", ") || "unset"}`)
          .join(" / ")}{" "}
        · Plan: {review.fields.adherence ?? "Unset"} · Mistakes:{" "}
        {review.fields.mistakes
          .map(
            (id) =>
              mistakes.find(([key]) => key === id)?.[1] ??
              review.tags.find((tag) => tag.id === id)?.name ??
              "Archived tag",
          )
          .join(", ") || "Unset"}
      </p>
      {review.images.map((image, i) => (
        <p key={image.id}>
          <a
            href={`/api/reviews/screenshots/${image.id}`}
            target="_blank"
            rel="noreferrer"
          >
            View original screenshot {i + 1}
          </a>{" "}
          · {image.caption}
        </p>
      ))}
      <label>
        Current record{" "}
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Choose a record after inspecting its sources</option>
          {data?.rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.symbol} · {r.exit} · {r.account} · {r.id}
            </option>
          ))}
        </select>
      </label>
      {target && (
        <p>
          <Link
            href={`/trade-view/${target}?archived=1&accounts=${review.accountId}`}
            target="_blank"
          >
            Inspect selected record and source records ↗
          </Link>
        </p>
      )}
      <p className="small">
        Page {page} of {data?.pages ?? 1}{" "}
        <button
          disabled={page === 1}
          onClick={() => {
            setPage(page - 1);
            setTarget("");
          }}
        >
          Previous
        </button>{" "}
        ·{" "}
        <button
          disabled={!data || page >= data.pages}
          onClick={() => {
            setPage(page + 1);
            setTarget("");
          }}
        >
          Next
        </button>
      </p>
      <Button disabled={busy || !target} onClick={() => void assign()}>
        Attach review
      </Button>
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
