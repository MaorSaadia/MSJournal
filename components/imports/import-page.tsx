"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  Upload,
  FileSpreadsheet,
  X,
  LoaderCircle,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TradingAccount } from "@/lib/accounts/types";
import { TimezoneSelector } from "@/components/ui/timezone-selector";
import { journalTimestamp } from "@/lib/timezones";
import { inspectReportType } from "@/lib/imports/reports";
import {
  MAX_FILE_BYTES,
  type Preview,
  type ReportType,
} from "@/lib/imports/types";
export function ImportPage({
  accounts,
  displayTimezone,
  lastTimezones,
}: {
  accounts: TradingAccount[];
  displayTimezone: string;
  lastTimezones: Record<string, string>;
}) {
  const router = useRouter();
  const guard = useRef(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [timezone, setTimezone] = useState(
    lastTimezones[accounts[0]?.id] ?? "Asia/Jerusalem",
  );
  const [fileIssues, setFileIssues] = useState<
    Partial<Record<ReportType, string>>
  >({});
  const [checking, setChecking] = useState<
    Partial<Record<ReportType, boolean>>
  >({});
  const fileRevision = useRef({ orders: 0, performance: 0 });
  const [files, setFiles] = useState<Partial<Record<ReportType, File>>>({});
  const [ordersMapped, setOrdersMapped] = useState(false),
    [performanceMapped, setPerformanceMapped] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState<"preview" | "confirm" | null>(null),
    [error, setError] = useState("");
  const account = accounts.find((a) => a.id === accountId);
  function invalidate() {
    setPreview(null);
    setError("");
  }
  async function choose(type: ReportType, file?: File) {
    const revision = ++fileRevision.current[type];
    invalidate();
    setFiles((old) => ({ ...old, [type]: file }));
    setFileIssues((old) => ({ ...old, [type]: undefined }));
    setChecking((old) => ({ ...old, [type]: false }));
    if (type === "orders") setOrdersMapped(false);
    else setPerformanceMapped(false);
    if (!file) return;
    if (file && (!file.size || file.size > MAX_FILE_BYTES)) {
      setFileIssues((old) => ({
        ...old,
        [type]: "Choose a nonempty CSV of at most 5 MiB.",
      }));
      return;
    }
    setChecking((old) => ({ ...old, [type]: true }));
    let issue: string | null;
    try {
      issue = inspectReportType(await file.text(), type);
    } catch {
      issue = "Could not read this file. Choose a UTF-8 Tradovate CSV.";
    }
    if (fileRevision.current[type] !== revision) return;
    setChecking((old) => ({ ...old, [type]: false }));
    setFileIssues((old) => ({ ...old, [type]: issue ?? undefined }));
  }
  const checkingFile = Object.values(checking).some(Boolean);
  const fileBlocked = Object.values(fileIssues).some(Boolean);
  async function send(action: "preview" | "confirm") {
    if (checkingFile || fileBlocked) return;
    if (guard.current) return;
    guard.current = true;
    setBusy(action);
    setError("");
    try {
      const body = new FormData();
      body.set("accountId", accountId);
      body.set("timezone", timezone);
      body.set("confirmOrders", String(ordersMapped));
      body.set("confirmPerformance", String(performanceMapped));
      for (const type of ["orders", "performance"] as ReportType[])
        if (files[type]) body.set(type, files[type]!);
      if (action === "confirm") body.set("token", preview?.token ?? "");
      const response = await fetch(`/api/imports/${action}`, {
        method: "POST",
        body,
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          window.dispatchEvent(new Event("msjournal:clear-private-cache"));
          router.replace("/login");
        }
        throw new Error(data.message ?? "Import could not be completed.");
      }
      if (action === "preview") setPreview(data);
      else {
        window.dispatchEvent(
          new CustomEvent("msjournal:data-updated", {
            detail: { url: "/api/imports/confirm" },
          }),
        );
        router.push(
          `/imports/${data.id}?saved=1&processing=${data.processing?.status === "Failed" ? "failed" : "ready"}`,
        );
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Import could not be completed. Please try again.",
      );
      if (action === "confirm") setPreview(null);
    } finally {
      guard.current = false;
      setBusy(null);
    }
  }
  return (
    <motion.div
      className="accounts-page imports-page"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <header className="page-header">
        <div>
          <div className="breadcrumb">Workspace / Tradovate</div>
          <h1>
            Import Trades<span className="title-dot">.</span>
          </h1>
          <p className="muted">
            Import matched portions and reported gross P&L into your journal.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/imports/history">
            Import history <ArrowRight size={15} />
          </Link>
        </Button>
      </header>
      <div className="import-notice">
        <ShieldCheck size={17} />
        <span>
          Private imports · Source records stay traceable. Fictional demo data
          stays separate.
        </span>
      </div>
      {!accounts.length ? (
        <section className="import-card import-empty">
          <FileSpreadsheet size={30} />
          <h2>Add your first account</h2>
          <p>
            Create an active Tradovate account before importing its reports.
          </p>
          <Button asChild>
            <Link href="/prop-accounts">Manage accounts</Link>
          </Button>
        </section>
      ) : (
        <>
          <section className="import-card">
            <div className="import-step">01 · Choose the destination</div>
            <fieldset className="import-fields" disabled={!!busy}>
              <label>
                Trading account
                <select
                  value={accountId}
                  onChange={(e) => {
                    setAccountId(e.target.value);
                    setTimezone(
                      lastTimezones[e.target.value] ?? "Asia/Jerusalem",
                    );
                    setOrdersMapped(false);
                    setPerformanceMapped(false);
                    invalidate();
                  }}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="import-timezone-field">
                <span>CSV source timezone</span>
                <TimezoneSelector
                  label="CSV source timezone"
                  disabled={!!busy}
                  value={timezone}
                  onChange={(value) => {
                    setTimezone(value);
                    invalidate();
                  }}
                />
                <small>
                  Choose the timezone used by the timestamps in your CSV export.
                  This may differ from your journal display timezone.
                </small>
              </div>
            </fieldset>
            <p className="small muted">
              Source: Tradovate · One account per batch · Maximum 5 MiB and
              10,000 rows per file.
            </p>
          </section>
          <section className="import-card">
            <div className="import-step">
              02 · Upload your Performance report
            </div>
            <UploadArea
              type="performance"
              file={files.performance}
              disabled={!!busy}
              issue={fileIssues.performance}
              checking={checking.performance}
              choose={(f) => void choose("performance", f)}
            />
            <details className="import-advanced">
              <summary>
                Advanced: import Orders report
                {files.orders ? ` · ${files.orders.name}` : ""}
              </summary>
              <p className="small muted">
                Optional source detail for future reconciliation. Performance
                imports work independently.
              </p>
              <UploadArea
                type="orders"
                file={files.orders}
                disabled={!!busy}
                issue={fileIssues.orders}
                checking={checking.orders}
                choose={(f) => void choose("orders", f)}
              />
            </details>
            <fieldset className="import-confirmations" disabled={!!busy}>
              {files.orders &&
                !fileIssues.orders &&
                !checking.orders &&
                !account?.brokerIdentifier && (
                  <label>
                    <input
                      type="checkbox"
                      checked={ordersMapped}
                      onChange={(e) => {
                        setOrdersMapped(e.target.checked);
                        invalidate();
                      }}
                    />
                    <span>
                      I confirm the Orders source account belongs to{" "}
                      <strong>{account?.displayName}</strong>. This is an import
                      mapping only; account settings remain unchanged.
                    </span>
                  </label>
                )}
              {files.performance &&
                !fileIssues.performance &&
                !checking.performance && (
                  <label>
                    <input
                      type="checkbox"
                      checked={performanceMapped}
                      onChange={(e) => {
                        setPerformanceMapped(e.target.checked);
                        invalidate();
                      }}
                    />
                    <span>
                      I confirm this Performance report belongs to{" "}
                      <strong>{account?.displayName}</strong>. This report has
                      no account identifier.
                    </span>
                  </label>
                )}
            </fieldset>
            {error && (
              <div role="alert" className="import-error">
                {error}
              </div>
            )}
            <Button
              onClick={() => send("preview")}
              disabled={
                !!busy ||
                checkingFile ||
                fileBlocked ||
                !Object.values(files).some(Boolean) ||
                !timezone.trim()
              }
            >
              {busy === "preview" ? (
                <LoaderCircle size={16} className="pending-spinner" />
              ) : (
                <FileSpreadsheet size={16} />
              )}{" "}
              {busy === "preview"
                ? "Validating…"
                : preview
                  ? "Review again"
                  : "Review import"}
            </Button>
            {fileBlocked && (
              <p role="status" className="import-error">
                Replace or remove the file with the report-type error before
                reviewing.
              </p>
            )}
          </section>
          {preview && (
            <section className="import-card">
              <div className="import-step">03 · Review before saving</div>
              <h2>{account?.displayName}</h2>
              <p className="small muted">
                CSV source timezone: <strong>{timezone}</strong> · Journal
                display timezone: <strong>{displayTimezone}</strong> · No source
                records have been saved yet.
              </p>
              <div className="import-counts">
                {Object.entries(preview.counts).map(([key, value]) => (
                  <div key={key}>
                    <span>{key}</span>
                    <strong>{value.toLocaleString()}</strong>
                  </div>
                ))}
              </div>
              {preview.files.map((file) => (
                <PreviewTable
                  key={file.type}
                  file={file}
                  timezone={displayTimezone}
                />
              ))}
              <p className="small muted">
                Confirmation reparses your files and rechecks the database.
                Duplicates are skipped; any invalid or conflicting records block
                the entire batch.
              </p>
              <Button
                onClick={() => send("confirm")}
                disabled={
                  !!busy || checkingFile || fileBlocked || !preview.canConfirm
                }
              >
                {busy === "confirm" ? (
                  <LoaderCircle size={16} className="pending-spinner" />
                ) : (
                  <Upload size={16} />
                )}{" "}
                {busy === "confirm"
                  ? "Saving source records…"
                  : !preview.canConfirm || preview.counts.new
                    ? "Confirm import"
                    : "Confirm · Already imported"}
              </Button>
              {!preview.canConfirm && (
                <p role="status" className="import-error">
                  {preview.files.flatMap((f) => f.errors).at(0)?.message}{" "}
                  Resolve the errors above, then review again. Nothing will be
                  partially imported.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </motion.div>
  );
}
function UploadArea({
  type,
  file,
  disabled,
  choose,
  issue,
  checking,
}: {
  type: ReportType;
  file?: File;
  disabled: boolean;
  choose: (file?: File) => void;
  issue?: string;
  checking?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`import-drop ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (disabled) return;
        if (e.dataTransfer.files.length === 1) choose(e.dataTransfer.files[0]);
      }}
    >
      <FileSpreadsheet size={24} />
      <h3>
        {type === "orders" ? "Orders" : "Upload Tradovate Performance CSV"}
      </h3>
      <p>
        {type === "orders"
          ? "Order snapshots, including canceled orders and aggregate fills."
          : "Import your matched entry/exit records and reported gross P&L."}
      </p>
      <input
        ref={input}
        aria-label={`${type === "orders" ? "Orders" : "Performance"} CSV`}
        type="file"
        accept=".csv,text/csv"
        disabled={disabled}
        onChange={(e) => {
          choose(e.target.files?.[0]);
          e.target.value = "";
        }}
        className="sr-only"
        tabIndex={-1}
      />
      {file ? (
        <div className="import-file">
          <span title={file.name}>
            {file.name}
            <small>{(file.size / 1024).toFixed(1)} KiB</small>
          </span>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label={`Remove ${type} file`}
            onClick={() => choose()}
          >
            <X size={16} />
          </Button>
        </div>
      ) : (
        <small className="muted">Drop one CSV here, or choose a file.</small>
      )}
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        {file ? "Replace file" : "Choose file"}
      </Button>
      {checking && (
        <span role="status" className="small muted">
          Checking CSV headers…
        </span>
      )}
      {issue && (
        <p role="alert" className="import-error">
          {issue}
        </p>
      )}
    </div>
  );
}
export function PreviewTable({
  file,
  timezone,
}: {
  file: Preview["files"][number];
  timezone: string;
}) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(file.rows.length / 20));
  const current = Math.min(page, pages);
  const local = (value: string) => journalTimestamp(value, timezone);
  const accountIds =
    file.type === "orders"
      ? [
          ...new Set(
            file.rows.map((r) =>
              "brokerAccount" in r.values ? r.values.brokerAccount : "",
            ),
          ),
        ]
      : [];
  return (
    <div className="import-preview">
      <h3>
        {file.type === "orders" ? "Orders" : "Performance"}{" "}
        <span className="muted">· {file.name}</span>
      </h3>
      {(file.start || accountIds.length > 0) && (
        <p className="small muted">
          {file.start &&
            `${local(file.start)} — ${local(file.end!)} · Journal display timezone: ${timezone}`}
          {accountIds.length > 0 && (
            <>
              {" "}
              · Source account: <strong>{accountIds.join(", ")}</strong>
            </>
          )}
        </p>
      )}
      {(file.errors.length > 0 || file.warnings.length > 0) && (
        <details open={file.errors.length > 0} className="import-diagnostics">
          <summary>
            {file.errors.length} errors · {file.warnings.length} warnings
          </summary>
          <ul>
            {file.errors.map((d, i) => (
              <li key={`e${i}`} className="import-error">
                <strong>
                  {d.row ? `Row ${d.row}` : "File"} · {d.column}:{" "}
                </strong>
                {d.message}
              </li>
            ))}
            {file.warnings.map((d, i) => (
              <li key={`w${i}`}>
                <strong>
                  {d.row ? `Row ${d.row}` : "File"} · {d.column}:{" "}
                </strong>
                {d.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="import-table-scroll">
        <table className="import-table">
          <thead>
            <tr>
              <th>Source row</th>
              <th>Contract</th>
              <th>{file.type === "orders" ? "Order status" : "Gross P&L"}</th>
              <th>Quantity</th>
              <th>
                {file.type === "orders" ? "Order timestamp" : "Sold timestamp"}{" "}
                ({timezone})
              </th>
              <th>Import result</th>
            </tr>
          </thead>
          <tbody>
            {file.rows.slice((current - 1) * 20, current * 20).map((r) => (
              <tr key={r.row}>
                <td>{r.row}</td>
                <td>{r.values.symbol}</td>
                <td>
                  {"status" in r.values
                    ? r.values.status
                    : r.values.grossPnl + " USD"}
                </td>
                <td>{r.values.quantity}</td>
                <td>
                  {"timestamp" in r.values
                    ? local(r.values.timestamp)
                    : local(r.values.soldAt)}
                  <div className="small muted">
                    Original source: {r.raw.Timestamp ?? r.raw.soldTimestamp}
                  </div>
                  <details>
                    <summary>Original source values</summary>
                    <dl>
                      {Object.entries(r.raw).map(([key, value]) => (
                        <div key={key}>
                          <dt>{key}</dt>
                          <dd>{value || "(blank)"}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                </td>
                <td>
                  <span className={`import-disposition ${r.disposition}`}>
                    {r.disposition}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="import-pagination">
        <Button
          variant="outline"
          size="sm"
          disabled={current <= 1}
          onClick={() => setPage(current - 1)}
        >
          Previous
        </Button>
        <span>
          Page {current} of {pages} · {file.rows.length} valid rows
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={current >= pages}
          onClick={() => setPage(current + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
