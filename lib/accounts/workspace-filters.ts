export type WorkspaceFilters = {
  accounts?: string;
  archived?: string;
  basis?: string;
};

export const workspaceFilterKeys = ["accounts", "archived", "basis"] as const;

export type WorkspaceFilterState = {
  defaults: WorkspaceFilters;
  pages: Record<string, WorkspaceFilters>;
};

export function rememberWorkspacePage(
  state: WorkspaceFilterState,
  path: string,
  changes: WorkspaceFilters,
): WorkspaceFilterState {
  const previous =
    path === "/" ? state.defaults : (state.pages[path] ?? state.defaults);
  const next = { ...previous, ...changes };
  if (workspaceFilterKeys.every((key) => next[key] === previous[key]))
    return state;
  // Dashboard changes establish a fresh default. Other pages only override
  // themselves, until the user makes a new selection on the Dashboard.
  return path === "/"
    ? { defaults: next, pages: {} }
    : { ...state, pages: { ...state.pages, [path]: next } };
}

// An empty account list means no accounts; an absent list means all available.
export function workspaceSearch(
  input: string,
  filters: WorkspaceFilters,
  override = false,
) {
  const result = new URLSearchParams(input);
  if (result.get("mode") === "demo") return result;
  for (const key of workspaceFilterKeys) {
    if (override && filters[key] === undefined) result.delete(key);
    if (filters[key] !== undefined && (override || !result.has(key)))
      result.set(key, filters[key]);
  }
  if (!result.has("basis")) result.set("basis", "net");
  return result;
}

export function workspaceHref(
  href: string,
  filters: WorkspaceFilters,
  pages: Record<string, WorkspaceFilters> = {},
) {
  const url = new URL(href, "https://workspace.invalid");
  if (
    !["/", "/calendar", "/trade-view", "/reports", "/day-view"].includes(
      url.pathname,
    )
  )
    return href;
  return `${url.pathname}?${workspaceSearch(url.search, url.pathname === "/" ? filters : (pages[url.pathname] ?? filters), true)}${url.hash}`;
}
