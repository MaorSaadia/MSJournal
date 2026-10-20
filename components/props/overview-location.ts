"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useCalendarCache } from "@/components/calendar/cache-provider";
const keys = [
  "phase",
  "tab",
  "month",
  "day",
  "range",
  "from",
  "through",
  "snapshot",
  "calendarView",
];
export function useOverviewLocation(accountId: string) {
  const search = useSearchParams();
  const { userId } = useCalendarCache();
  const key = (id: string) => `msjournal:prop-overview:${userId}:${id}`;
  useEffect(() => {
    if (window.location.search) return;
    try {
      const stored = sessionStorage.getItem(
        `msjournal:prop-overview:${userId}:${accountId}`,
      );
      if (!stored) return;
      const safe = new URLSearchParams();
      const values = new URLSearchParams(stored);
      for (const name of keys)
        if (values.has(name)) safe.set(name, values.get(name)!);
      if (safe.size)
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}?${safe}`,
        );
    } catch {
      /* Browsers may disable session storage; the URL still preserves state. */
    }
  }, [userId, accountId]);
  function patch(values: Record<string, string | null>) {
    const next = new URLSearchParams(window.location.search);
    for (const [name, value] of Object.entries(values)) {
      if (value === null || value === "") next.delete(name);
      else next.set(name, value);
    }
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${next.size ? `?${next}` : ""}`,
    );
    try {
      sessionStorage.setItem(key(accountId), next.toString());
    } catch {}
  }
  function accountHref(id: string) {
    let query = "";
    try {
      const values = new URLSearchParams(sessionStorage.getItem(key(id)) ?? "");
      const safe = new URLSearchParams();
      for (const name of keys)
        if (values.has(name)) safe.set(name, values.get(name)!);
      if (safe.size) query = `?${safe}`;
    } catch {}
    return `/prop-accounts/${id}${query}`;
  }
  return { search, patch, accountHref };
}
