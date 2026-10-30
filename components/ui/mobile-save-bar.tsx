"use client";
import { LoadingSpinner } from "@/components/ui/loading";
import { useEffect, useRef } from "react";
import { Save } from "lucide-react";
import { Button } from "./button";
export function MobileSaveBar({
  status,
  label,
  disabled,
  save,
  pending = false,
}: {
  status: string;
  label: string;
  disabled: boolean;
  save: () => void;
  pending?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const place = () =>
      ref.current?.style.setProperty(
        "--keyboard-offset",
        `${viewport ? Math.max(0, innerHeight - viewport.height - viewport.offsetTop) : 0}px`,
      );
    place();
    viewport?.addEventListener("resize", place);
    viewport?.addEventListener("scroll", place);
    return () => {
      viewport?.removeEventListener("resize", place);
      viewport?.removeEventListener("scroll", place);
    };
  }, []);
  return (
    <div
      className="mobile-save-bar"
      ref={ref}
      aria-label="Mobile save controls"
    >
      <span>{status}</span>
      <Button disabled={disabled} aria-busy={pending} onClick={save}>
        {pending ? <LoadingSpinner size={15} /> : <Save size={15} />}
        {label}
      </Button>
    </div>
  );
}
