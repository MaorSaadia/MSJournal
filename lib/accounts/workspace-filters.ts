export type WorkspaceFilters = {
  accounts?: string;
  archived?: string;
  basis?: string;
};

export const workspaceFilterKeys = ["accounts", "archived", "basis"] as const;

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

export function workspaceHref(href: string, filters: WorkspaceFilters) {
  const url = new URL(href, "https://workspace.invalid");
  if (
    !["/", "/calendar", "/trade-view", "/reports", "/day-view"].includes(
      url.pathname,
    )
  )
    return href;
  return `${url.pathname}?${workspaceSearch(url.search, filters, true)}${url.hash}`;
}
