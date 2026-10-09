"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { CalendarQueryCache } from "@/lib/calendar/client-cache";
import { requestJson } from "@/lib/client-api";
const Context = createContext<{
  cache: CalendarQueryCache;
  identity: string;
  userId: string;
  timezone: string;
  weekStartsOn: 0 | 1;
  returnHref: string;
  remember: (href: string) => void;
  tradesHref: string;
  rememberTrades: (href: string) => void;
  scrollPositions: Map<string, number>;
} | null>(null);
export function CalendarCacheProvider({
  userId,
  timezone,
  weekStartsOn,
  children,
}: {
  userId: string;
  timezone: string;
  weekStartsOn: 0 | 1;
  children: React.ReactNode;
}) {
  const router = useRouter(),
    identity = JSON.stringify([userId, timezone, "USD", weekStartsOn]);
  const { cache } = useMemo(
    () => ({ identity, cache: new CalendarQueryCache() }),
    [identity],
  );
  const [returnHref, remember] = useState("/calendar");
  const [tradesHref, rememberTrades] = useState("/trade-view");
  const scrollPositions = useMemo(() => {
    void identity;
    return new Map<string, number>();
  }, [identity]);
  useEffect(() => {
    const mutate = (event: Event) => {
      const reviews = (
        event as CustomEvent<{ url?: string }>
      ).detail?.url?.startsWith("/api/reviews");
      cache.invalidate(
        reviews
          ? (key) =>
              key.includes("|/api/journal|") || key.includes("|/api/reviews/")
          : undefined,
      );
      window.dispatchEvent(
        new CustomEvent("msjournal:calendar-refresh", { detail: { reviews } }),
      );
      if (
        (event as CustomEvent<{ url?: string }>).detail?.url ===
        "/api/preferences"
      )
        router.refresh();
    };
    const clear = () => {
      cache.clear();
      scrollPositions.clear();
    };
    const authChanged = (event: StorageEvent) => {
      if (event.key === "msjournal:auth-change") {
        clear();
        router.refresh();
      }
    };
    window.addEventListener("msjournal:data-updated", mutate);
    window.addEventListener("msjournal:clear-private-cache", clear);
    window.addEventListener("storage", authChanged);
    return () => {
      window.removeEventListener("storage", authChanged);
      window.removeEventListener("msjournal:data-updated", mutate);
      window.removeEventListener("msjournal:clear-private-cache", clear);
      cache.clear();
      scrollPositions.clear();
    };
  }, [cache, router, scrollPositions]);
  return (
    <Context.Provider
      value={{
        cache,
        identity,
        userId,
        timezone,
        weekStartsOn,
        returnHref,
        remember,
        tradesHref,
        rememberTrades,
        scrollPositions,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useCalendarCache() {
  const value = useContext(Context);
  if (!value) throw new Error("Calendar requires a private workspace.");
  return value;
}
export function useCalendarRequest<
  T extends { timezone: string; userId: string },
>(query: string | null) {
  return usePrivateRequest<T>(query, "/api/calendar");
}
export function usePrivateRequest<
  T extends { timezone: string; userId: string },
>(query: string | null, endpoint: string) {
  const { cache, identity, timezone, userId } = useCalendarCache(),
    router = useRouter();
  const key =
    query !== null
      ? identity + "|daily-stats-v1|" + endpoint + "|" + query
      : null;
  const state = useSyncExternalStore(
    cache.subscribe,
    () => cache.read(key),
    () => cache.read(null),
  );
  const missing = state.data === undefined;
  useEffect(() => {
    if (!key || query === null) return;
    const load = async (signal: AbortSignal) => {
      const value = await requestJson<T>(`${endpoint}?${query}`, { signal });
      if (value.userId !== userId) {
        cache.clear();
        router.refresh();
        throw new Error("Session changed. Refreshing workspace.");
      }
      if (value.timezone !== timezone) {
        router.refresh();
        throw new Error(
          "Display preferences changed. Refreshing calendar settings.",
        );
      }
      return value;
    };
    void cache.fetch(key, load);
    const focus = () => void cache.fetch(key, load);
    const visible = () => {
      if (document.visibilityState === "visible") focus();
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [key, query, cache, router, timezone, userId, missing, endpoint]);
  const refresh = () => {
    cache.invalidate();
    window.dispatchEvent(new Event("msjournal:calendar-refresh"));
  };
  useEffect(() => {
    if (!key || query === null) return;
    const handler = (event: Event) => {
      if (
        endpoint === "/api/calendar" &&
        (event as CustomEvent<{ reviews?: boolean }>).detail?.reviews
      )
        return;
      void cache.fetch(
        key,
        async (signal) => {
          const value = await requestJson<T>(`${endpoint}?${query}`, {
            signal,
          });
          if (value.userId !== userId) {
            cache.clear();
            router.refresh();
            throw new Error("Session changed. Refreshing workspace.");
          }
          if (value.timezone !== timezone) {
            router.refresh();
            throw new Error(
              "Display preferences changed. Refreshing calendar settings.",
            );
          }
          return value;
        },
        true,
      );
    };
    window.addEventListener("msjournal:calendar-refresh", handler);
    return () =>
      window.removeEventListener("msjournal:calendar-refresh", handler);
  }, [key, query, cache, timezone, router, userId, endpoint]);
  return { ...state, data: state.data as T | undefined, refresh };
}
