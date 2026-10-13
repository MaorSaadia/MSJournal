"use client";
import { useEffect, useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import { confirmAction } from "@/components/ui/confirm-action";

// One prompt protects all editors on the page.
type Guard = { dirty: () => boolean; href: string; historyState: unknown };
const guards = new Set<Guard>();
let prompting = false;
const activeGuard = () => [...guards].find((guard) => guard.dirty());
const hasWriting = () => !!activeGuard();

/** Guard app links/history; browsers retain their own refresh/close warning. */
export function useWritingGuard(dirty: () => boolean) {
  useEffect(() => {
    const guard = {
      dirty,
      href: window.location.href,
      historyState: window.history.state,
    };
    guards.add(guard);
    return () => {
      guards.delete(guard);
    };
  }, [dirty]);
}

// Register before Next's passive popstate listener so no route restoration can
// start until the user answers. Child hooks only register their dirty state.
export function WritingGuardProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  useLayoutEffect(() => {
    const ask = async (target: string) => {
      if (prompting) return;
      prompting = true;
      try {
        if (
          await confirmAction(
            "Your latest writing is not saved. Leaving will discard your unsaved changes.",
            {
              title: "Leave without saving?",
              confirmLabel: "Discard changes",
              cancelLabel: "Keep editing",
              destructive: true,
            },
          )
        ) {
          const url = new URL(target);
          router.push(`${url.pathname}${url.search}${url.hash}`);
        }
      } finally {
        prompting = false;
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (hasWriting()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const leave = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        !link ||
        link.target === "_blank" ||
        link.hasAttribute("download") ||
        link.origin !== window.location.origin ||
        link.href === window.location.href ||
        !hasWriting()
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      void ask(link.href);
    };
    const back = (event: PopStateEvent) => {
      const guard = activeGuard();
      if (!guard || window.location.href === guard.href) return;
      const target = window.location.href;
      event.stopImmediatePropagation();
      // Restore the address without Next's patched pushState dispatching a
      // route restoration and replacing the still-unsaved editor snapshot.
      History.prototype.pushState.call(
        window.history,
        guard.historyState,
        "",
        guard.href,
      );
      void ask(target);
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", leave, true);
    window.addEventListener("popstate", back, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", leave, true);
      window.removeEventListener("popstate", back, true);
    };
  }, [router]);
  return children;
}
