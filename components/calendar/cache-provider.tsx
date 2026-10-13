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
  reportsHref: string;
  rememberReports: (href: string) => void;
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
  const [reportsHref, rememberReports] = useState("/reports");
  const scrollPositions = useMemo(() => {
    void identity;
    return new Map<string, number>();
  }, [identity]);
  useEffect(() => {
    const mutate = (event: Event) => {
      const reviews = (
        event as CustomEvent<{ url?: string }>
      ).detail?.url?.startsWith("/api/reviews");
      const propsOnly =
        (event as CustomEvent<{ url?: string }>).detail?.url?.startsWith(
          "/api/prop-progress",
        ) ?? false;
      const dailyOnly =
        (event as CustomEvent<{ url?: string }>).detail?.url?.startsWith(
          "/api/daily",
        ) ?? false;
      const strategiesOnly =
        (event as CustomEvent<{ url?: string }>).detail?.url?.startsWith(
          "/api/strategies",
        ) ?? false;
      cache.invalidate(
        strategiesOnly
          ? (key) =>
              key.includes("|/api/strategies") ||
              key.includes("|/api/journal|") ||
              key.includes("|/api/reports|")
          : dailyOnly
            ? (key) =>
                key.includes("|/api/daily|") ||
                key.includes("|/api/daily/indicators|")
            : propsOnly
              ? (key) => key.includes("|/api/prop-progress|")
              : reviews
                ? (key) =>
                    key.includes("|/api/journal|") ||
                    key.includes("|/api/dashboard|") ||
                    key.includes("|/api/reviews/") ||
                    (key.includes("|/api/reports|") &&
                      new URLSearchParams(key.split("|/api/reports|")[1]).get(
                        "tab",
                      ) === "behavior")
                : undefined,
      );
      window.dispatchEvent(
        new CustomEvent("msjournal:calendar-refresh", {
          detail: { reviews, propsOnly, dailyOnly, strategiesOnly },
        }),
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
        reportsHref,
        rememberReports,
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
      ? identity + "|daily-stats-v2|" + endpoint + "|" + query
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
    const propsOnly = endpoint === "/api/prop-progress";
    const dailyEndpoint = endpoint.startsWith("/api/daily");
    const strategiesEndpoint = endpoint.startsWith("/api/strategies");
    cache.invalidate(
      strategiesEndpoint
        ? (key) =>
            key.includes("|/api/strategies") ||
            key.includes("|/api/journal|") ||
            key.includes("|/api/reports|")
        : dailyEndpoint
          ? (key) => key.includes(`|${endpoint}|`)
          : propsOnly
            ? (key) => key.includes("|/api/prop-progress|")
            : undefined,
    );
    window.dispatchEvent(
      new CustomEvent("msjournal:calendar-refresh", {
        detail: {
          propsOnly,
          strategiesOnly: strategiesEndpoint,
          dailyOnly: dailyEndpoint,
          dailyResultsOnly: endpoint === "/api/daily/results",
        },
      }),
    );
  };
  useEffect(() => {
    if (!key || query === null) return;
    const handler = (event: Event) => {
      if (
        (event as CustomEvent<{ strategiesOnly?: boolean }>).detail
          ?.strategiesOnly &&
        !endpoint.startsWith("/api/strategies") &&
        endpoint !== "/api/journal" &&
        endpoint !== "/api/reports"
      )
        return;
      const detail = (
        event as CustomEvent<{
          dailyOnly?: boolean;
          dailyResultsOnly?: boolean;
        }>
      ).detail;
      if (detail?.dailyResultsOnly && endpoint !== "/api/daily/results") return;
      if (
        detail?.dailyOnly &&
        !detail.dailyResultsOnly &&
        endpoint !== "/api/daily" &&
        endpoint !== "/api/daily/indicators"
      )
        return;
      if (
        (event as CustomEvent<{ propsOnly?: boolean }>).detail?.propsOnly &&
        endpoint !== "/api/prop-progress"
      )
        return;
      if (
        (endpoint === "/api/calendar" ||
          endpoint === "/api/prop-progress" ||
          (endpoint === "/api/reports" &&
            new URLSearchParams(query).get("tab") !== "behavior")) &&
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
