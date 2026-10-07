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
import {
  MAX_FILE_BYTES,
  type Preview,
  type ReportType,
} from "@/lib/imports/types";
export function ImportPage({ accounts }: { accounts: TradingAccount[] }) {
  const router = useRouter();
  const guard = useRef(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [timezone, setTimezone] = useState("Asia/Jerusalem");
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
  function choose(type: ReportType, file?: File) {
    invalidate();
    if (file && (!file.size || file.size > MAX_FILE_BYTES)) {
      setError("Choose a nonempty CSV of at most 5 MiB.");
      return;
    }
    setFiles((old) => ({ ...old, [type]: file }));
    if (type === "orders") setOrdersMapped(false);
    else setPerformanceMapped(false);
  }
  async function send(action: "preview" | "confirm") {
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
        if (response.status === 401) router.replace("/login");
        throw new Error(data.message ?? "Import could not be completed.");
      }
      if (action === "preview") setPreview(data);
      else router.push(`/imports/${data.id}?saved=1`);
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
            Bring in your source records. Trade reconstruction follows in Day 4.
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
          Private imports · Orders and Performance stay separate from dashboard
          trades and fictional demo data.
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
              <label>
                CSV source timezone
                <input
                  list="import-timezones"
                  value={timezone}
                  onChange={(e) => {
                    setTimezone(e.target.value);
                    invalidate();
                  }}
                />
                <datalist id="import-timezones">
                  {[
                    "Asia/Jerusalem",
                    "America/New_York",
                    "Europe/London",
                    "UTC",
                  ].map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
                <small>
                  Use the timezone of the export, including its daylight-saving
                  rules.
                </small>
              </label>
            </fieldset>
            <p className="small muted">
              Source: Tradovate · One account per batch · Maximum 5 MiB and
              10,000 rows per file.
            </p>
          </section>
          <section className="import-card">
            <div className="import-step">02 · Choose your reports</div>
            <p className="muted small">
              Upload either report or both. Both provide more source detail for
              later reconciliation. Headers determine the report type.
            </p>
            <div className="import-upload-grid">
              {(["orders", "performance"] as ReportType[]).map((type) => (
                <UploadArea
                  key={type}
                  type={type}
                  file={files[type]}
                  disabled={!!busy}
                  choose={(f) => choose(type, f)}
                />
              ))}
            </div>
            <fieldset className="import-confirmations" disabled={!!busy}>
              {files.orders && !account?.brokerIdentifier && (
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
              {files.performance && (
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
                    <strong>{account?.displayName}</strong>. This report has no
                    account identifier.
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
          </section>
          {preview && (
            <section className="import-card">
              <div className="import-step">03 · Review before saving</div>
              <h2>{account?.displayName}</h2>
              <p className="small muted">
                Source timezone: <strong>{timezone}</strong> · No source records
                have been saved yet.
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
                <PreviewTable key={file.type} file={file} timezone={timezone} />
              ))}
              <p className="small muted">
                Confirmation reparses your files and rechecks the database.
                Duplicates are skipped; any invalid or conflicting records block
                the entire batch.
              </p>
              <Button
                onClick={() => send("confirm")}
                disabled={!!busy || !preview.canConfirm}
              >
                {busy === "confirm" ? (
                  <LoaderCircle size={16} className="pending-spinner" />
                ) : (
                  <Upload size={16} />
                )}{" "}
                {busy === "confirm"
                  ? "Saving source records…"
                  : preview.counts.new
                    ? "Confirm import"
                    : "Confirm · Already imported"}
              </Button>
              {!preview.canConfirm && (
                <p role="status" className="import-error">
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
}: {
  type: ReportType;
  file?: File;
  disabled: boolean;
  choose: (file?: File) => void;
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
      <h3>{type === "orders" ? "Orders" : "Performance"}</h3>
      <p>
        {type === "orders"
          ? "Order snapshots, including canceled orders and aggregate fills."
          : "Matched buy/sell portions and reported gross P&L. No fees."}
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
  const local = (value: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date(value));
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
      <p className="small muted">
        {file.start
          ? `${local(file.start)} — ${local(file.end!)} (${timezone})`
          : "No valid date range"}
        {accountIds.length > 0 && (
          <>
            {" "}
            · Source account: <strong>{accountIds.join(", ")}</strong>
          </>
        )}
      </p>
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
                {file.type === "orders" ? "Order timestamp" : "Sold timestamp"}
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
