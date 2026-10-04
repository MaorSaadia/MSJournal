import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
export function Help({
  text,
  label = "More information",
}: {
  text: string;
  label?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="help-button"
          aria-label={`${label}: ${text}`}
        >
          <Info size={14} />
        </button>
      </TooltipTrigger>
      <TooltipContent className="help-content">{text}</TooltipContent>
    </Tooltip>
  );
}
export function Panel({
  title,
  help,
  children,
  className = "",
  action,
}: {
  title: string;
  help?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-header">
        <h2>{title}</h2>
        {help && <Help text={help} label={title} />}
        <div className="panel-action">{action}</div>
      </header>
      {children}
    </section>
  );
}
export function Empty({
  text = "No closed trades match these filters.",
}: {
  text?: string;
}) {
  return (
    <div className="empty-state">
      <span>Nothing here yet</span>
      <p>{text}</p>
    </div>
  );
}
