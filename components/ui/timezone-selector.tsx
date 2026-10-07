"use client";
import { useMemo, useState } from "react";
import { ChevronsUpDown, Check } from "lucide-react";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { timezoneChoices } from "@/lib/timezones";
// Radix owns focus, Escape and dismissal; native buttons remain keyboard operable.
export function TimezoneSelector({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const choices = useMemo(() => timezoneChoices(), []);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const visible = choices.filter((t) =>
    `${t.label} ${t.id}`.toLowerCase().includes(query.toLowerCase()),
  );
  const selected = choices.find((t) => t.id === value);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={`${label}: ${value}`}
          className="timezone-trigger"
        >
          <span>
            {selected?.label ?? value}
            <small>{value}</small>
          </span>
          <ChevronsUpDown size={15} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="timezone-menu" align="start">
        <input
          autoComplete="off"
          aria-label="Search timezones"
          placeholder="Search city or timezone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="timezone-options" aria-label="Supported timezones">
          {visible.map((t) => (
            <button
              type="button"
              key={t.id}
              aria-pressed={value === t.id}
              onClick={() => {
                onChange(t.id);
                setOpen(false);
                setQuery("");
              }}
            >
              <span>
                {t.label}
                <small>{t.id}</small>
              </span>
              {value === t.id && <Check size={15} />}
            </button>
          ))}
          {!visible.length && <p role="status">No matching timezones.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
