"use client";
import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, Archive, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadFile, DownloadError } from "@/lib/exports/download";
import { confirmAction } from "@/components/ui/confirm-action";

function useDownload() {
  const [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [partial, setPartial] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const cancel = () => {
      controller.current?.abort();
      setStatus("");
      setError("");
      setPartial(false);
    };
    window.addEventListener("msjournal:clear-private-cache", cancel);
    return () => {
      controller.current?.abort();
      window.removeEventListener("msjournal:clear-private-cache", cancel);
    };
  }, []);
  async function start(url: string, init: RequestInit) {
    if (controller.current) return;
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError("");
    setPartial(false);
    setStatus("Preparing your private download...");
    try {
      await downloadFile(url, { ...init, signal: current.signal }, setStatus);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError")
        setStatus("Download canceled.");
      else {
        setStatus("");
        setError(e instanceof Error ? e.message : "Download failed.");
        setPartial(e instanceof DownloadError && e.code === "MISSING_IMAGES");
      }
    } finally {
      controller.current = null;
      setBusy(false);
    }
  }
  return {
    status,
    error,
    busy,
    partial,
    start,
    cancel: () => controller.current?.abort(),
  };
}
export function TradeCsvExport({
  query,
  disabled,
}: {
  query: string;
  disabled?: boolean;
}) {
  const state = useDownload();
  return (
    <div className="export-control">
      <div className="export-actions">
        <Button
          variant="outline"
          disabled={disabled || state.busy}
          onClick={() => void state.start(`/api/exports/trades?${query}`, {})}
        >
          {state.busy ? (
            <LoaderCircle className="pending-spinner" size={15} />
          ) : (
            <Download size={15} />
          )}{" "}
          {state.busy ? "Exporting..." : "Export CSV"}
        </Button>
        {state.busy && (
          <Button variant="ghost" onClick={state.cancel}>
            Cancel
          </Button>
        )}
      </div>
      {state.status && <small role="status">{state.status}</small>}
      {state.error && (
        <small role="alert" className="form-error">
          {state.error}
        </small>
      )}
    </div>
  );
}
export function DataBackups() {
  const state = useDownload(),
    [images, setImages] = useState(false);
  const run = (allowPartial = false) =>
    state.start("/api/exports/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includeImages: images, allowPartial }),
    });
  return (
    <section className="panel backups-panel" id="data-backups">
      <header className="panel-header">
        <h2>
          <Archive size={18} /> Data & backups
        </h2>
        <ShieldCheck size={18} />
      </header>
      <div className="backups-body">
        <p>
          Download your accounts, stored imports, trading records, reviews,
          daily writing, strategies and settings in a versioned ZIP archive.
        </p>
        <label className="backup-images-choice">
          <input
            type="checkbox"
            checked={images}
            disabled={state.busy}
            onChange={(e) => setImages(e.target.checked)}
          />{" "}
          Include screenshots and playbook images
        </label>
        <p className="muted">
          Image files are included only when selected. If retrieval fails, you
          can retry or explicitly accept a partial archive; missing files are
          listed in its manifest.
        </p>
        <div className="export-actions">
          <Button disabled={state.busy} onClick={() => void run()}>
            {state.busy ? (
              <LoaderCircle className="pending-spinner" size={15} />
            ) : (
              <Download size={15} />
            )}{" "}
            {state.busy ? "Preparing archive..." : "Download my data"}
          </Button>
          {state.busy && (
            <Button variant="outline" onClick={state.cancel}>
              Cancel download
            </Button>
          )}
          {state.partial && !state.busy && (
            <Button
              variant="outline"
              onClick={async () => {
                if (
                  await confirmAction(
                    "Download an archive with missing image files? Available structured data is included and missing files are listed in the manifest.",
                    {
                      title: "Download a partial archive?",
                      confirmLabel: "Download partial archive",
                      cancelLabel: "Keep complete backup",
                      destructive: false,
                    },
                  )
                )
                  await run(true);
              }}
            >
              Download partial archive
            </Button>
          )}
        </div>
        {state.status && <p role="status">{state.status}</p>}
        {state.error && (
          <p role="alert" className="form-error">
            {state.error}
          </p>
        )}
        <p className="backup-limit-note">
          Keep this archive for your records. In-app restoration is not
          available yet.
        </p>
        <small className="muted">
          This does not replace database-provider backups. Limits: 100,000 rows,
          16 MiB structured JSON, 200 image object files and 64 MiB per archive.
          Archives are unencrypted; keep them securely.
        </small>
      </div>
    </section>
  );
}
