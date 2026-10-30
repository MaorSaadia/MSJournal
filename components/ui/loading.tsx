import type { CSSProperties } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function LoadingSpinner({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <LoaderCircle
      size={size}
      aria-hidden="true"
      className={cn("app-loading-spinner", className)}
    />
  );
}
export function LoadingIndicator({
  label = "Updating",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("app-loading-indicator", className)}
    >
      <LoadingSpinner size={14} />
      <span>{label}</span>
    </span>
  );
}
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("app-skeleton", className)}
      style={style}
    />
  );
}
export type LoadingVariant =
  | "dashboard"
  | "report"
  | "progress"
  | "account"
  | "cards"
  | "form"
  | "list"
  | "table"
  | "metrics"
  | "options"
  | "calendar";
function MetricSkeletons({ count }: { count: number }) {
  return (
    <div
      className="app-skeleton-metrics"
      style={{ "--loading-columns": count } as CSSProperties}
    >
      {Array.from({ length: count }, (_, i) => (
        <div className="app-skeleton-card" key={i}>
          <Skeleton className="app-skeleton-label" />
          <Skeleton className="app-skeleton-value" />
          <Skeleton className="app-skeleton-caption" />
        </div>
      ))}
    </div>
  );
}
function ChartSkeleton() {
  return (
    <div className="app-skeleton-card app-skeleton-chart">
      <Skeleton className="app-skeleton-label" />
      <div className="app-skeleton-plot">
        <Skeleton />
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
      <div className="app-skeleton-axis">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    </div>
  );
}
function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="app-skeleton-card app-skeleton-list">
      {Array.from({ length: count }, (_, i) => (
        <div className="app-skeleton-row" key={i}>
          <Skeleton className="app-skeleton-avatar" />
          <div>
            <Skeleton className="app-skeleton-label" />
            <Skeleton className="app-skeleton-caption" />
          </div>
          <Skeleton className="app-skeleton-caption" />
        </div>
      ))}
    </div>
  );
}
export function LoadingState({
  variant = "list",
  label = "Loading content",
  className,
}: {
  variant?: LoadingVariant;
  label?: string;
  className?: string;
}) {
  const metrics = [
    "dashboard",
    "report",
    "progress",
    "account",
    "metrics",
  ].includes(variant);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn("app-loading-state", `app-loading-${variant}`, className)}
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="app-skeleton-layout">
        {metrics && (
          <MetricSkeletons
            count={variant === "dashboard" ? 5 : variant === "account" ? 6 : 4}
          />
        )}
        {["dashboard", "report", "progress"].includes(variant) && (
          <div className="app-skeleton-panels">
            <ChartSkeleton />
            <ChartSkeleton />
            {variant === "dashboard" ? <ChartSkeleton /> : <ListSkeleton />}
          </div>
        )}
        {variant === "dashboard" && (
          <div className="app-skeleton-panels">
            <ChartSkeleton />
            <ListSkeleton />
            <ChartSkeleton />
          </div>
        )}
        {variant === "account" && (
          <>
            <ChartSkeleton />
            <div className="app-skeleton-panels">
              <ListSkeleton />
              <ListSkeleton />
            </div>
          </>
        )}
        {variant === "cards" && (
          <div className="app-skeleton-cards">
            {[0, 1].map((i) => (
              <div key={i} className="app-skeleton-card">
                <Skeleton className="app-skeleton-label" />
                <Skeleton className="app-skeleton-caption" />
                <MetricSkeletons count={3} />
                <Skeleton className="app-skeleton-field" />
              </div>
            ))}
          </div>
        )}
        {variant === "form" && (
          <div className="app-skeleton-card app-skeleton-form">
            <Skeleton className="app-skeleton-label" />
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <Skeleton className="app-skeleton-caption" />
                <Skeleton className="app-skeleton-field" />
              </div>
            ))}
            <Skeleton className="app-skeleton-button" />
          </div>
        )}
        {variant === "options" && (
          <div className="app-skeleton-cards">
            {[0, 1, 2, 3].map((i) => (
              <div className="app-skeleton-card" key={i}>
                <Skeleton className="app-skeleton-value" />
                <Skeleton className="app-skeleton-label" />
                <Skeleton className="app-skeleton-caption" />
              </div>
            ))}
          </div>
        )}
        {variant === "calendar" && (
          <div className="app-skeleton-calendar">
            {Array.from({ length: 35 }, (_, i) => (
              <div className="app-skeleton-card" key={i}>
                <Skeleton className="app-skeleton-caption" />
                <Skeleton className="app-skeleton-label" />
              </div>
            ))}
          </div>
        )}
        {variant === "list" && <ListSkeleton />}
        {variant === "table" && (
          <div className="app-skeleton-card app-skeleton-table">
            {Array.from({ length: 7 }, (_, i) => (
              <div className="app-skeleton-table-row" key={i}>
                {[0, 1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
export function PageLoading({
  title,
  variant = "list",
}: {
  title: string;
  variant?: LoadingVariant;
}) {
  return (
    <div className={`app-route-loading app-route-loading-${variant}`}>
      <header className="page-header">
        <h1>{title}</h1>
      </header>
      <LoadingState
        variant={variant}
        label={`Loading ${title.toLowerCase()}`}
      />
    </div>
  );
}
