"use client";
import { useEffect } from "react";
/** Keep ordinary links, browser history and unload from silently discarding writing. */
export function useWritingGuard(dirty: () => boolean) {
  useEffect(() => {
    const href = window.location.href;
    const confirm = () =>
      !dirty() ||
      window.confirm(
        "Your latest writing is not saved. Leave and discard those changes?",
      );
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const leave = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (
        link &&
        link.target !== "_blank" &&
        link.href !== window.location.href &&
        !confirm()
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const back = (event: PopStateEvent) => {
      if (window.location.href !== href && !confirm()) {
        event.stopImmediatePropagation();
        window.history.pushState(null, "", href);
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", leave, true);
    window.addEventListener("popstate", back, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", leave, true);
      window.removeEventListener("popstate", back, true);
    };
  }, [dirty]);
}
