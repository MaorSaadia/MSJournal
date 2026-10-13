"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { AlertTriangle, ArrowRight, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./dialog";
import { Button } from "./button";

type Options = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};
type Request = Options & {
  message: string;
  resolve: (answer: boolean) => void;
};
const listeners = new Set<() => void>();
const empty: Request[] = [];
let requests: Request[] = empty;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const emit = () => listeners.forEach((listener) => listener());

/** Resolves only after an explicit choice; cancellation never runs the action. */
export function confirmAction(
  message: string,
  options: Options = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    requests = [...requests, { message, ...options, resolve }];
    emit();
  });
}

function presentation(message: string): Required<Options> {
  if (/unsaved|not saved|discard those changes/i.test(message))
    return {
      title: "You have unsaved changes",
      confirmLabel: "Discard changes",
      cancelLabel: "Keep editing",
      destructive: true,
    };
  if (/^Remove|^Delete/i.test(message))
    return {
      title: "Remove this item?",
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
      destructive: true,
    };
  if (/^Discard/i.test(message))
    return {
      title: "Discard this classification?",
      confirmLabel: "Discard",
      cancelLabel: "Keep it",
      destructive: true,
    };
  if (/^Archive/i.test(message))
    return {
      title: "Archive this strategy?",
      confirmLabel: "Archive strategy",
      cancelLabel: "Cancel",
      destructive: false,
    };
  if (/^Replace/i.test(message))
    return {
      title: "Replace the saved version?",
      confirmLabel: "Replace version",
      cancelLabel: "Cancel",
      destructive: true,
    };
  if (/^Adopt/i.test(message))
    return {
      title: "Use the latest instructions?",
      confirmLabel: "Adopt latest version",
      cancelLabel: "Cancel",
      destructive: false,
    };
  return {
    title: "Confirm your action",
    confirmLabel: "Continue",
    cancelLabel: "Cancel",
    destructive: false,
  };
}

export function ConfirmationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = useSyncExternalStore(
    subscribe,
    () => requests,
    () => empty,
  )[0];
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(
    () => () => {
      const pending = requests;
      requests = empty;
      pending.forEach((request) => request.resolve(false));
      emit();
    },
    [],
  );
  function answer(accepted: boolean) {
    if (!current || requests[0] !== current) return;
    requests = requests.slice(1);
    emit();
    current.resolve(accepted);
  }
  const labels = current
    ? { ...presentation(current.message), ...current }
    : null;
  return (
    <>
      {children}
      <Dialog
        open={!!current}
        onOpenChange={(open) => {
          if (!open) answer(false);
        }}
      >
        {current && labels && (
          <DialogContent
            className="ms-confirm-dialog"
            showCloseButton={false}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              cancelRef.current?.focus();
            }}
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <div
              className={`ms-confirm-icon ${labels.destructive ? "is-destructive" : ""}`}
            >
              {labels.destructive ? (
                <AlertTriangle size={22} />
              ) : (
                <ShieldCheck size={22} />
              )}
            </div>
            <div className="ms-confirm-copy">
              <span className="ms-confirm-eyebrow">MSJOURNAL</span>
              <DialogTitle>{labels.title}</DialogTitle>
              <DialogDescription>{current.message}</DialogDescription>
            </div>
            <div className="ms-confirm-actions">
              <Button
                ref={cancelRef}
                variant="outline"
                onClick={() => answer(false)}
              >
                {labels.cancelLabel}
              </Button>
              <Button
                className={
                  labels.destructive ? "ms-confirm-danger" : "ms-confirm-accept"
                }
                onClick={() => answer(true)}
              >
                {labels.confirmLabel}
                <ArrowRight size={14} />
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
