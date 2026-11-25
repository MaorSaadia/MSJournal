"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

export function PublicWebAnalytics({ enabled }: { enabled: boolean }) {
  const [documentEntry, setDocumentEntry] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const entry = performance.getEntriesByType("navigation")[0];
    // A soft visit can share a document and history with an untracked page.
    if (entry && new URL(entry.name).pathname === window.location.pathname) {
      queueMicrotask(() => setDocumentEntry(true));
    }
  }, [enabled]);

  if (!enabled || !documentEntry) return null;

  return (
    <Script
      id="msjournal-public-web-analytics"
      type="module"
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token: "51b8b426443b44bdbf158624db180941", spa: false })}
    />
  );
}
