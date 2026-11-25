import type { ComponentProps } from "react";

// The analytics beacon is document-scoped. Keep page navigation from sharing it
// with auth or workspace routes, and measure public destinations on their load.
export function PublicPageLink(props: ComponentProps<"a">) {
  return <a {...props} />;
}
