// Memory only, owned by one authenticated private-layout provider.
export type QuerySnapshot = {
  data?: unknown;
  error?: string;
  pending?: boolean;
  updatedAt?: number;
  invalid?: boolean;
};
const empty: QuerySnapshot = Object.freeze({});
export class CalendarQueryCache {
  private entries = new Map<string, QuerySnapshot>();
  private requests = new Map<
    string,
    { controller: AbortController; promise: Promise<void> }
  >();
  private listeners = new Set<() => void>();
  constructor(
    private now = () => Date.now(),
    readonly freshFor = 30_000,
    readonly retainFor = 10 * 60_000,
    readonly limit = 24,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  read = (key: string | null) => {
    const entry = key ? this.entries.get(key) : undefined;
    return entry?.data !== undefined &&
      this.now() - (entry.updatedAt ?? 0) > this.retainFor
      ? empty
      : (entry ?? empty);
  };
  private emit() {
    this.listeners.forEach((fn) => fn());
  }
  async fetch(
    key: string,
    load: (signal: AbortSignal) => Promise<unknown>,
    force = false,
  ) {
    const active = this.requests.get(key);
    if (active) return active.promise;
    const current = this.read(key);
    if (
      !force &&
      !current.invalid &&
      current.data !== undefined &&
      this.now() - (current.updatedAt ?? 0) < this.freshFor
    )
      return;
    for (const [k, e] of this.entries)
      if (
        !this.requests.has(k) &&
        this.now() - (e.updatedAt ?? 0) > this.retainFor
      )
        this.entries.delete(k);
    while (this.entries.size >= this.limit) {
      const candidate = [...this.entries.keys()].find((k) => k !== key);
      if (!candidate) break;
      this.requests.get(candidate)?.controller.abort();
      this.requests.delete(candidate);
      this.entries.delete(candidate);
    }
    const controller = new AbortController();
    this.entries.set(key, { ...current, pending: true, error: undefined });
    const promise = Promise.resolve()
      .then(() => load(controller.signal))
      .then((data) => {
        if (!controller.signal.aborted)
          this.entries.set(key, {
            data,
            updatedAt: this.now(),
            invalid: false,
          });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          this.entries.set(key, {
            ...current,
            pending: false,
            invalid: true,
            error:
              error instanceof Error ? error.message : "Calendar unavailable.",
          });
      })
      .finally(() => {
        if (this.requests.get(key)?.controller === controller)
          this.requests.delete(key);
        this.emit();
      });
    this.requests.set(key, { controller, promise });
    this.emit();
    return promise;
  }
  invalidate(matches: (key: string) => boolean = () => true) {
    for (const [key, r] of this.requests)
      if (matches(key)) {
        r.controller.abort();
        this.requests.delete(key);
      }
    for (const [key, value] of this.entries)
      if (matches(key))
        this.entries.set(key, { ...value, pending: false, invalid: true });
    this.emit();
  }
  clear() {
    for (const r of this.requests.values()) r.controller.abort();
    this.requests.clear();
    this.entries.clear();
    this.emit();
  }
}
