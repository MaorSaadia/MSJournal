"use client";
import { useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChartNoAxesCombined, ArrowUpRight } from "lucide-react";
import {
  useCalendarCache,
  usePrivateRequest,
} from "@/components/calendar/cache-provider";
import { reportSchema, type ReportData, type Group } from "@/lib/reports/model";
import { localDay, journalMoney } from "@/lib/journal/calculations";
import { shiftDay } from "@/lib/calendar/model";
import { DEMO_PERIOD } from "@/data/demo";
import { emotions, stages } from "@/lib/reviews/model";
import { StrategyComparison } from "@/components/strategies/results";
import { ReportChart } from "./charts";
const labels: Record<string, string> = {
  account: "Account",
  instrument: "Instrument",
  weekday: "Local close weekday",
  direction: "Direction",
  hour: "Local entry hour",
  duration: "Holding duration",
  plan: "Plan adherence",
  mistake: "Mistake tags",
  emotion: "Recorded emotions",
};
function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="report-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
function Table({
  rows,
  denominator,
  save,
  curves = false,
  complete = false,
  portions = false,
}: {
  rows: (Group & { cumulative?: string | null; drawdown?: string | null })[];
  denominator: string;
  save: () => void;
  curves?: boolean;
  complete?: boolean;
  portions?: boolean;
}) {
  return (
    <div className="report-table-wrap">
      <table className="report-table">
        <caption className="sr-only">
          Exact USD results; averages per {denominator}
        </caption>
        <thead>
          <tr>
            <th>Group / date</th>
            <th>{denominator}</th>
            <th>P&L · USD</th>
            <th>Avg / {denominator}</th>
            {complete && <th>{portions ? "Winning portions" : "Win rate"}</th>}
            {curves && (
              <>
                <th>Cumulative P&L</th>
                <th>EOD drawdown</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">
                <Link href={r.href} prefetch={false} onClick={save}>
                  {r.label} <ArrowUpRight size={12} />
                </Link>
              </th>
              <td>{r.count}</td>
              <td>{journalMoney(r.total, true)}</td>
              <td>{journalMoney(r.average, true)}</td>
              {complete && (
                <td>{r.winRate === null ? "—" : r.winRate + "%"}</td>
              )}
              {curves && (
                <>
                  <td>{journalMoney(r.cumulative ?? null, true)}</td>
                  <td>{journalMoney(r.drawdown ?? null, true)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Reports() {
  const search = useSearchParams(),
    router = useRouter(),
    { timezone, userId, rememberReports, scrollPositions } = useCalendarCache();
  const demo = search.get("mode") === "demo",
    today = localDay(new Date().toISOString(), timezone);
  const parsed = reportSchema.safeParse({
    start: demo ? DEMO_PERIOD.start : today.slice(0, 7) + "-01",
    end: demo ? DEMO_PERIOD.end : today,
    ...Object.fromEntries(search),
  });
  const q = parsed.success
    ? parsed.data
    : reportSchema.parse({ start: today, end: today });
  const query = new URLSearchParams(
    Object.entries(q)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
  const state = usePrivateRequest<ReportData>(
      parsed.success ? query : null,
      "/api/reports",
    ),
    data = state.data;
  const href = `/reports?${query}`,
    scrollKey = `${userId}:${timezone}:${href}`,
    restored = useRef<string | null>(null);
  useEffect(() => {
    rememberReports(href);
  }, [href, rememberReports]);
  useEffect(() => {
    if (!data || restored.current === scrollKey) return;
    restored.current = scrollKey;
    const position = scrollPositions.get(scrollKey);
    if (position !== undefined) {
      const frame = requestAnimationFrame(() => window.scrollTo(0, position));
      return () => cancelAnimationFrame(frame);
    }
  }, [data, scrollKey, scrollPositions]);
  function save() {
    if (scrollPositions.size >= 24)
      scrollPositions.delete(scrollPositions.keys().next().value!);
    scrollPositions.set(scrollKey, window.scrollY);
  }
  function update(values: Record<string, string | undefined>) {
    const next = new URLSearchParams(query);
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || (value === "" && key !== "accounts"))
        next.delete(key);
      else next.set(key, value);
    }
    if (values.mode !== undefined) {
      next.delete("accounts");
      next.delete("mistakes");
      if (values.mode === "demo") {
        next.set("start", DEMO_PERIOD.start);
        next.set("end", DEMO_PERIOD.end);
      }
    }
    if (values.archived !== undefined) next.delete("accounts");
    window.history.pushState(null, "", `/reports?${next}`);
  }
  const portions = q.analysis === "portions" && q.tab !== "behavior";
  const select = (
    key: keyof typeof q,
    label: string,
    options: [string, string][],
  ) => (
    <label className="field-label">
      {label}
      <select
        aria-label={label}
        value={String(q[key] ?? "")}
        onChange={(e) => update({ [key]: e.target.value })}
      >
        {options.map(([value, name]) => (
          <option value={value} key={value}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
  const complete =
      q.tab === "behavior"
        ? q.behaviorBasis === "complete"
        : q.analysis === "complete",
    outcomeMode = complete || portions,
    denominator = outcomeMode
      ? complete
        ? "trades"
        : "portions"
      : q.tab === "behavior"
        ? "records"
        : "active days",
    basis = `${q.basis} · ${complete ? "complete trades" : portions ? "closed portions" : q.tab === "behavior" ? "closed records" : "realized activity"}`,
    s = data?.summary;
  const inspect = (target: string) => {
    save();
    router.push(target);
  };
  const allowedGroups =
    q.tab === "behavior"
      ? ["plan", "mistake", "emotion"]
      : complete
        ? ["account", "instrument", "weekday", "direction", "hour", "duration"]
        : ["account", "instrument", "weekday", "direction"];
  const selectedGroup =
      q.group && allowedGroups.includes(q.group) ? q.group : allowedGroups[0],
    groups = data?.groups[selectedGroup] ?? [];
  const unsupported = complete && data?.supportedComplete === 0;
  return (
    <div className="accounts-page reports-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">YOUR RESULTS, IN PERSPECTIVE</span>
          <h1>
            <ChartNoAxesCombined size={24} /> Reports
          </h1>
          <p className="muted">
            Explore performance and the reflections behind it.
          </p>
        </div>
        <label className="field-label">
          Data
          <select
            aria-label="Report data"
            value={q.mode}
            onChange={(e) => update({ mode: e.target.value })}
          >
            <option value="real">My imports</option>
            <option value="demo">Demo · fictional</option>
          </select>
        </label>
      </header>
      {demo && (
        <p className="report-notice">
          Demo uses the same fictional trades and reviews as the rest of your
          workspace.
        </p>
      )}
      <nav className="report-tabs" aria-label="Report tabs">
        {(["overview", "breakdowns", "behavior"] as const).map((tab) => (
          <button
            key={tab}
            aria-current={q.tab === tab ? "page" : undefined}
            className={q.tab === tab ? "active" : ""}
            onClick={() => update({ tab })}
          >
            {tab === "behavior"
              ? "Trading behavior"
              : tab === "overview"
                ? "Overview"
                : "Breakdowns"}
          </button>
        ))}
      </nav>
      <section className="report-toolbar" aria-label="Shared report filters">
        <label className="field-label">
          Date range
          <select
            aria-label="Date preset"
            value="custom"
            onChange={(e) => {
              const preset = e.target.value;
              if (preset === "demo") update(DEMO_PERIOD);
              else if (preset === "month")
                update({ start: today.slice(0, 7) + "-01", end: today });
              else if (preset === "year")
                update({ start: today.slice(0, 4) + "-01-01", end: today });
              else if (preset !== "custom")
                update({
                  start: shiftDay(today, -Number(preset) + 1),
                  end: today,
                });
            }}
          >
            <option value="custom">Custom dates</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="month">This month</option>
            <option value="year">This year</option>
            {demo && <option value="demo">Demo period</option>}
          </select>
        </label>
        <label className="field-label">
          From
          <input
            type="date"
            aria-label="Report start"
            value={search.get("start") ?? q.start}
            onChange={(e) => update({ start: e.target.value })}
          />
        </label>
        <label className="field-label">
          Through
          <input
            type="date"
            aria-label="Report end"
            value={search.get("end") ?? q.end}
            onChange={(e) => update({ end: e.target.value })}
          />
        </label>
        <details className="report-accounts">
          <summary>
            Accounts ·{" "}
            {q.accounts === undefined
              ? "All"
              : q.accounts.split(",").filter(Boolean).length}
          </summary>
          <div>
            <label>
              <input
                type="checkbox"
                checked={q.accounts === undefined}
                onChange={() => update({ accounts: undefined })}
              />{" "}
              All available accounts
            </label>
            {data?.accounts
              .filter((a) => q.archived === "1" || !a.archived)
              .map((a) => (
                <label key={a.id}>
                  <input
                    type="checkbox"
                    checked={
                      q.accounts === undefined ||
                      q.accounts.split(",").includes(a.id)
                    }
                    onChange={(e) => {
                      const ids =
                        q.accounts === undefined
                          ? data.accounts
                              .filter((x) => q.archived === "1" || !x.archived)
                              .map((x) => x.id)
                          : q.accounts.split(",").filter(Boolean);
                      update({
                        accounts: (e.target.checked
                          ? [...ids, a.id]
                          : ids.filter((id) => id !== a.id)
                        ).join(","),
                      });
                    }}
                  />
                  {a.name}
                  {a.archived ? " · Archived" : ""}
                </label>
              ))}
            <label>
              <input
                type="checkbox"
                checked={q.archived === "1"}
                onChange={(e) =>
                  update({ archived: e.target.checked ? "1" : "0" })
                }
              />{" "}
              Include archived accounts
            </label>
          </div>
        </details>
        {select("basis", "P&L", [
          ["gross", "Gross"],
          ["net", "Net"],
        ])}
        {q.tab !== "behavior" &&
          select("analysis", "Analyze", [
            ["activity", "Realized activity"],
            ["complete", "Complete trades"],
            ["portions", "Closed portions"],
          ])}
        <details className="report-extra">
          <summary>Instrument filters</summary>
          <div>
            <label className="field-label">
              Product / root
              <input
                aria-label="Report product"
                placeholder="e.g. MNQ"
                defaultValue={q.root ?? ""}
                key={q.root ?? "root"}
                maxLength={20}
                onBlur={(e) =>
                  update({ root: e.target.value.trim().toUpperCase() })
                }
              />
            </label>
            <label className="field-label">
              Exact contract
              <input
                aria-label="Report contract"
                placeholder="e.g. MNQZ6"
                defaultValue={q.symbol ?? ""}
                key={q.symbol ?? "symbol"}
                maxLength={80}
                onBlur={(e) =>
                  update({ symbol: e.target.value.trim().toUpperCase() })
                }
              />
            </label>
          </div>
        </details>
      </section>
      <div className="report-context">
        <span>USD · {timezone} · inclusive local dates</span>
        <Link href="/settings">Timezone settings</Link>
        {q.root && (
          <button onClick={() => update({ root: undefined })}>
            Product: {q.root} ×
          </button>
        )}
        {q.symbol && (
          <button onClick={() => update({ symbol: undefined })}>
            Contract: {q.symbol} ×
          </button>
        )}
      </div>
      {q.tab === "behavior" && (
        <section className="report-toolbar" aria-label="Behavior filters">
          {select("behaviorBasis", "Compare", [
            ["complete", "Complete trades"],
            ["records", "Closed-portion records"],
          ])}
          {select("review", "Review coverage", [
            ["reviewed", "Reviewed only"],
            ["all", "All review states"],
          ])}
          {select(
            "emotionStage",
            "Emotion stage",
            stages.map((v) => [v, v.charAt(0).toUpperCase() + v.slice(1)]),
          )}
          <details className="report-extra">
            <summary>Review filters</summary>
            <div>
              {select("emotion", "Emotion", [
                ["", "All recorded choices"],
                ...emotions.map((v) => [v, v] as [string, string]),
              ])}
              {select("adherence", "Plan adherence", [
                ["", "All choices"],
                ["followed", "Followed"],
                ["partly", "Partly followed"],
                ["not-followed", "Not followed"],
              ])}
              <fieldset>
                <legend>Any selected mistake (OR)</legend>
                {data?.tags.map((tag) => (
                  <label key={tag.id}>
                    <input
                      type="checkbox"
                      checked={q.mistakes?.split(",").includes(tag.id) ?? false}
                      onChange={(e) => {
                        const ids = q.mistakes?.split(",") ?? [];
                        update({
                          mistakes: (e.target.checked
                            ? [...ids, tag.id]
                            : ids.filter((id) => id !== tag.id)
                          ).join(","),
                        });
                      }}
                    />
                    {tag.name}
                    {tag.archived ? " · Archived" : ""}
                  </label>
                ))}
              </fieldset>
            </div>
          </details>
        </section>
      )}
      {!parsed.success ? (
        <p role="alert" className="report-notice">
          Choose valid report filters and an ordered date range of at most 10
          years.
        </p>
      ) : state.error ? (
        <div role="alert" className="report-notice">
          Reports could not load. {state.error}
          <button onClick={state.refresh}>Try again</button>
        </div>
      ) : !data ? (
        <div className="report-loading" role="status">
          Loading report…
        </div>
      ) : (
        <>
          {data.pending && (
            <p className="report-notice">
              Some imported records await processing.{" "}
              <Link href="/trade-view">Open Trade View</Link> to process them.
            </p>
          )}
          {q.tab === "behavior" && (
            <div className="report-coverage">
              <span>
                <strong>{data.coverage.reviewed}</strong> reviewed
              </span>
              <span>{data.coverage.draft} drafts</span>
              <span>{data.coverage.unreviewed} unreviewed</span>
              {!!data.coverage.unresolved && (
                <span>
                  {data.coverage.unresolved} unresolved across selected
                  accounts; excluded from outcomes
                </span>
              )}
            </div>
          )}
          {unsupported ? (
            <section className="report-card report-empty">
              <h2>Complete trades aren’t available for this selection</h2>
              <p>
                Performance imports contain closed portions and shared-fill
                groups. Their results remain available as realized activity and
                closed-record behavior comparisons.
              </p>
              <button
                onClick={() =>
                  update(
                    q.tab === "behavior"
                      ? { behaviorBasis: "records" }
                      : { analysis: "activity" },
                  )
                }
              >
                View{" "}
                {q.tab === "behavior" ? "closed records" : "realized activity"}
              </button>
            </section>
          ) : !s?.count ? (
            <section className="report-card report-empty">
              <h2>No matching {denominator}</h2>
              <p>
                Try a wider date range or fewer filters.
                {q.tab === "behavior"
                  ? " Reviews must match the selected review state."
                  : ""}
              </p>
              <Link href="/imports">Import a Performance report →</Link>
            </section>
          ) : (
            <>
              <div className="report-basis">
                {basis}
                {q.basis === "net" && s.estimated
                  ? " · Estimated fees included"
                  : ""}
              </div>
              {s.total === null && (
                <p className="report-notice">
                  Net results are unavailable because some included{" "}
                  {denominator} have unknown fees. The full selection remains
                  included.{" "}
                  <button onClick={() => update({ basis: "gross" })}>
                    View gross results
                  </button>
                </p>
              )}
              <div className="report-metrics">
                <Metric
                  label={q.tab === "behavior" ? "Associated P&L" : "Total P&L"}
                  value={journalMoney(s.total, true)}
                />
                <Metric
                  label={
                    complete
                      ? "Complete trades"
                      : q.tab === "behavior"
                        ? "Included records"
                        : portions
                          ? "Closed portions"
                          : "Active days"
                  }
                  value={String(s.count)}
                  detail={
                    q.tab === "behavior" ? "Selected review filters" : undefined
                  }
                />
                <Metric
                  label={`Average / ${complete ? "trade" : portions ? "portion" : q.tab === "behavior" ? "record" : "active day"}`}
                  value={journalMoney(s.average, true)}
                />
                {outcomeMode ? (
                  <>
                    <Metric
                      label={complete ? "Win rate" : "Winning portions"}
                      value={s.winRate === null ? "—" : s.winRate + "%"}
                      detail="Breakevens included"
                    />
                    <Metric
                      label={
                        complete ? "Profit factor" : "Profit factor · portions"
                      }
                      value={
                        s.profitFactor ??
                        (portions
                          ? s.profitFactorNote.replaceAll("trades", "portions")
                          : s.profitFactorNote)
                      }
                    />
                  </>
                ) : q.tab === "overview" ? (
                  <Metric
                    label="Max EOD drawdown"
                    value={journalMoney(s.maxDrawdown)}
                    detail="Magnitude · resets at range start"
                  />
                ) : null}
              </div>
              {q.mode === "real" && q.tab !== "behavior" && (
                <StrategyComparison
                  data={data}
                  complete={q.analysis === "complete"}
                  query={new URLSearchParams({
                    mode: "real",
                    accounts: q.accounts ?? "",
                    archived: q.archived,
                    start: q.start,
                    end: q.end,
                    basis: q.basis,
                    outcomeBasis:
                      q.analysis === "complete" ? "complete" : "portions",
                    dateBasis:
                      q.analysis === "complete" ? "closed" : "activity",
                  }).toString()}
                />
              )}
              {q.tab === "overview" ? (
                <>
                  <section className="report-card">
                    <div className="report-card-heading">
                      <h2>
                        {outcomeMode
                          ? complete
                            ? "Trade outcomes"
                            : "Portion outcomes"
                          : "Daily realized P&L"}
                      </h2>
                      <span>{basis} · USD</span>
                    </div>
                    <ReportChart
                      rows={outcomeMode ? data.distribution : data.days}
                      basis={basis}
                      onInspect={inspect}
                    />
                    {outcomeMode ? (
                      <Table
                        rows={data.distribution}
                        denominator={denominator}
                        complete
                        portions={portions}
                        save={save}
                      />
                    ) : (
                      <p className="muted">
                        Bars show days with imported realized activity. A gap
                        does not confirm that no trading occurred.
                      </p>
                    )}
                  </section>
                  {outcomeMode ? (
                    <section className="report-card">
                      <h2>
                        {complete
                          ? "Trade statistics"
                          : "Closed-portion statistics"}
                      </h2>
                      <div className="report-secondary">
                        <Metric
                          label={`Average winning ${complete ? "trade" : "portion"}`}
                          value={journalMoney(s.averageWin, true)}
                        />
                        <Metric
                          label={`Average losing ${complete ? "trade" : "portion"}`}
                          value={journalMoney(s.averageLoss, true)}
                        />
                        <Metric
                          label={`Largest winning ${complete ? "trade" : "portion"}`}
                          value={journalMoney(s.best, true)}
                        />
                        <Metric
                          label={`Largest losing ${complete ? "trade" : "portion"}`}
                          value={journalMoney(s.worst, true)}
                        />
                        <Metric
                          label="Winning / losing / breakeven"
                          value={
                            s.wins === null
                              ? "—"
                              : `${s.wins} / ${s.losses} / ${s.zeros}`
                          }
                        />
                      </div>
                    </section>
                  ) : (
                    <>
                      <div className="report-chart-pair">
                        <section className="report-card">
                          <h2>Cumulative realized P&L</h2>
                          <p className="muted">
                            Starts at zero; shows results within this range.
                          </p>
                          <ReportChart
                            line
                            rows={[
                              {
                                key: "opening",
                                label: `${q.start} · Start`,
                                count: 0,
                                total: "0",
                                average: null,
                                winRate: null,
                                href: "",
                                cumulative: "0",
                              },
                              ...data.days,
                            ]}
                            field="cumulative"
                            basis={basis}
                            onInspect={inspect}
                          />
                        </section>
                        <section className="report-card">
                          <h2>End-of-day P&L drawdown</h2>
                          <p className="muted">
                            Daily cumulative P&L below its running peak,
                            including the initial zero.
                          </p>
                          <ReportChart
                            line
                            rows={[
                              {
                                key: "opening",
                                label: `${q.start} · Start`,
                                count: 0,
                                total: "0",
                                average: null,
                                winRate: null,
                                href: "",
                                drawdown: "0",
                              },
                              ...data.days,
                            ]}
                            field="drawdown"
                            basis={basis}
                            onInspect={inspect}
                          />
                        </section>
                      </div>
                      <section className="report-card">
                        <h2>Active-day details</h2>
                        <div className="report-secondary">
                          <Metric
                            label="Best active day"
                            value={journalMoney(s.best, true)}
                          />
                          <Metric
                            label="Worst active day"
                            value={journalMoney(s.worst, true)}
                          />
                          <Metric
                            label="Profitable / losing / breakeven days"
                            value={
                              s.wins === null
                                ? "—"
                                : `${s.wins} / ${s.losses} / ${s.zeros}`
                            }
                          />
                        </div>
                        <p className="muted">
                          Drawdown resets at the range start and uses end-of-day
                          realized results.
                        </p>
                        <details>
                          <summary>Exact daily values and records</summary>
                          <Table
                            rows={data.days}
                            denominator="active days"
                            curves
                            save={save}
                          />
                        </details>
                      </section>
                    </>
                  )}
                </>
              ) : (
                <section className="report-card">
                  <div className="report-card-heading">
                    <h2>Results by {labels[selectedGroup].toLowerCase()}</h2>
                    <label className="field-label">
                      <span className="sr-only">Comparison</span>
                      <select
                        aria-label="Comparison"
                        value={selectedGroup}
                        onChange={(e) => update({ group: e.target.value })}
                      >
                        {(q.tab === "behavior"
                          ? ["plan", "mistake", "emotion"]
                          : complete
                            ? [
                                "account",
                                "instrument",
                                "weekday",
                                "direction",
                                "hour",
                                "duration",
                              ]
                            : ["account", "instrument", "weekday", "direction"]
                        ).map((v) => (
                          <option value={v} key={v}>
                            {labels[v]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {q.tab === "breakdowns" &&
                    selectedGroup === "instrument" &&
                    select("instrument", "Group instruments", [
                      ["root", "Product / root"],
                      ["contract", "Exact contract"],
                    ])}
                  <p className="muted">
                    {basis} · average per {denominator} · USD
                    {selectedGroup === "emotion" ? ` · ${q.emotionStage}` : ""}
                  </p>
                  <ReportChart
                    rows={groups}
                    basis={basis}
                    onInspect={inspect}
                  />
                  <Table
                    rows={groups}
                    denominator={denominator}
                    complete={outcomeMode}
                    portions={portions}
                    save={save}
                  />
                  {selectedGroup === "hour" && (
                    <p className="muted">
                      {data.excludedEntry} trades excluded because entry time is
                      unknown.
                    </p>
                  )}
                  {selectedGroup === "duration" && (
                    <p className="muted">
                      {data.excludedDuration} trades excluded because duration
                      is unknown. Boundaries: [0, 60), [60, 300), [300, 900),
                      [900, 3600), [3600, ∞) seconds.
                    </p>
                  )}
                  {q.tab === "behavior" && (
                    <p className="muted">
                      Tags and emotions can overlap; each record appears once in
                      each group. Group totals are not additive. “Not recorded”
                      is an unset choice. These are associations, and small
                      samples may not represent a pattern.
                    </p>
                  )}
                </section>
              )}
            </>
          )}
          <div className="report-footnote">
            <span>
              {data.closedRecords} closed records · {data.supportedComplete}{" "}
              supported complete trades in the closing range
            </span>
            <button onClick={state.refresh}>Refresh report</button>
          </div>
        </>
      )}
    </div>
  );
}
