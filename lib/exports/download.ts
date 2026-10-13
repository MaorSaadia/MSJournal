"use client";
export class DownloadError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
/** Bound browser memory as well as server work; never persist private URLs. */
export async function downloadFile(
  url: string,
  init: RequestInit,
  progress: (message: string) => void,
) {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 401)
      window.dispatchEvent(new Event("msjournal:clear-private-cache"));
    const body = await response.json().catch(() => ({}));
    throw new DownloadError(
      body.message ?? "Download failed. Retry shortly.",
      body.code,
    );
  }
  if (!response.body) throw new DownloadError("No download received.");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  const total = Number(response.headers.get("content-length"));
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 64 * 1024 * 1024) {
        await reader.cancel();
        throw new DownloadError(
          "Download exceeds 64 MiB. Narrow the export or omit images.",
        );
      }
      chunks.push(value);
      progress(
        total
          ? `Downloading ${Math.min(100, Math.round((size / total) * 100))}%`
          : `Downloading ${(size / 1024 / 1024).toFixed(1)} MiB`,
      );
    }
  } finally {
    reader.releaseLock();
  }
  if (init.signal?.aborted)
    throw new DOMException("Download canceled", "AbortError");
  const filename =
    response.headers
      .get("content-disposition")
      ?.match(/filename="([A-Za-z0-9_.-]+)"/)?.[1] ?? "msjournal-export";
  const blob = new Blob(chunks as BlobPart[], {
    type: response.headers.get("content-type") ?? "application/octet-stream",
  });
  const href = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
  progress("Download ready.");
}
