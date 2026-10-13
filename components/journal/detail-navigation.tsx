"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { usePrivateRequest } from "@/components/calendar/cache-provider";
import { viewSchema, type TradeViewData } from "@/lib/journal/view-model";
export function DetailNavigation({ id }: { id: string }) {
  const search = useSearchParams(),
    from = search.get("from");
  const safeFrom =
    (from && /^\/(trade-view|calendar)(\?|$)/.test(from)) ||
    (from &&
      /^\/strategies\/[0-9a-f-]{36}(\?|$)/i.test(from) &&
      !from.includes("\\")) ||
    (from && /^\/\?/.test(from))
      ? from
      : "/trade-view";
  const params = new URLSearchParams(search);
  params.delete("from");
  params.delete("tab");
  params.set("record", id);
  const valid = viewSchema.safeParse(Object.fromEntries(params)).success;
  const tableOrigin = safeFrom.startsWith("/trade-view");
  const state = usePrivateRequest<TradeViewData>(
    tableOrigin && valid ? params.toString() : null,
    "/api/journal",
  );
  const nav = state.data?.navigation;
  const href = (target: string, position: number) => {
    const next = new URLSearchParams(params);
    next.delete("record");
    const size = Number(next.get("size") ?? 25);
    next.set("page", String(Math.ceil(position / size)));
    next.set(
      "from",
      `/trade-view?${new URLSearchParams([...next].filter(([key]) => key !== "from"))}`,
    );
    return `/trade-view/${target}?${next}`;
  };
  return (
    <nav className="tv-detail-nav" aria-label="Record navigation">
      <Link href={safeFrom} scroll={false}>
        {safeFrom.startsWith("/strategies/")
          ? "Back to playbook"
          : safeFrom.startsWith("/calendar")
            ? "Back to Calendar"
            : safeFrom.startsWith("/?")
              ? "Back to dashboard"
              : "Back to Trade View"}
      </Link>
      {nav && (
        <>
          <span>
            Record {nav.position} of {state.data!.summary.count}
          </span>
          {nav.previous ? (
            <Link href={href(nav.previous, nav.position - 1)}>
              ← Previous record
            </Link>
          ) : (
            <span className="muted">← Previous record</span>
          )}
          {nav.next ? (
            <Link href={href(nav.next, nav.position + 1)}>Next record →</Link>
          ) : (
            <span className="muted">Next record →</span>
          )}
        </>
      )}
      {state.error && <button onClick={state.refresh}>Retry navigation</button>}
    </nav>
  );
}
