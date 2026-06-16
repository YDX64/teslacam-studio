/*  DatePicker — calendar popover with month nav, jump-to-day, "All days"     */
/*  + range visualization. Built from scratch so it looks identical on every  */
/*  platform (Tesla browser, iOS, Android, desktop).                          */

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronLeftIcon, ChevronRightIcon } from "./Icons";
import { formatDayLabel } from "../utils/format";

interface Props {
  value: string | null;            // "YYYY-MM-DD"
  onChange: (v: string | null) => void;
  availableDays: string[];         // sorted DESC, "YYYY-MM-DD"
}

export function DatePicker({ value, onChange, availableDays }: Props) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const anchor = value ?? availableDays[0];
    if (!anchor) return monthKey(new Date());
    return anchor.slice(0, 7);
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Jump view to selected month when it changes externally
  useEffect(() => {
    if (value) setViewMonth(value.slice(0, 7));
  }, [value]);

  const availableSet = useMemo(() => new Set(availableDays), [availableDays]);
  const cells = useMemo(() => buildMonthCells(viewMonth), [viewMonth]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of availableDays) {
      const m = d.slice(0, 7);
      map[m] = (map[m] ?? 0) + 1;
    }
    return map;
  }, [availableDays]);

  const monthLabel = useMemo(() => {
    const [y, m] = viewMonth.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  }, [viewMonth]);

  const buttonLabel = value ? formatDayLabel(value) : "All days";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={clsx(
          "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[12px] transition",
          open
            ? "border-(--color-accent) bg-(--color-accent)/10 text-(--color-text)"
            : "border-(--color-border) ov-04 text-(--color-text-dim) hover:border-(--color-border-strong) hover:text-(--color-text)",
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <CalendarGlyph className="h-3.5 w-3.5 text-(--color-text-faint)" />
          {buttonLabel}
        </span>
        <ChevronDownGlyph className={clsx("h-3 w-3 transition", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Pick a day"
          className="glass-strong absolute z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl p-3 shadow-(--shadow-pop)"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-1 pb-2">
            <button
              onClick={() => setViewMonth(addMonths(viewMonth, -1))}
              className="grid h-7 w-7 place-items-center rounded-lg text-(--color-text-dim) hover:ov-10 hover:text-(--color-text)"
              aria-label="Previous month"
            >
              <ChevronLeftIcon className="h-3.5 w-3.5" />
            </button>
            <div className="text-center text-[13px] font-semibold text-(--color-text)">
              {monthLabel}
              {counts[viewMonth] != null && (
                <span className="ml-1.5 rounded-md bg-(--color-accent)/15 px-1.5 py-0.5 text-[10px] font-medium text-(--color-accent-2)">
                  {counts[viewMonth]} day{counts[viewMonth] > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <button
              onClick={() => setViewMonth(addMonths(viewMonth, 1))}
              className="grid h-7 w-7 place-items-center rounded-lg text-(--color-text-dim) hover:ov-10 hover:text-(--color-text)"
              aria-label="Next month"
            >
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-0.5 text-[10px] uppercase tracking-[1px] text-(--color-text-faint)">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(d => (
              <span key={d} className="grid h-6 place-items-center">{d}</span>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map(c => {
              if (!c) return <span key={Math.random()} className="h-9" />;
              const dayStr = c.iso;
              const isAvailable = availableSet.has(dayStr);
              const isSelected = value === dayStr;
              const isToday = c.iso === todayIso();
              return (
                <button
                  key={dayStr}
                  type="button"
                  onClick={() => {
                    if (!isAvailable) return;
                    onChange(dayStr);
                    setOpen(false);
                  }}
                  disabled={!isAvailable}
                  className={clsx(
                    "grid h-9 place-items-center rounded-lg text-[12px] font-medium transition relative",
                    isSelected
                      ? "bg-gradient-to-br from-(--color-accent) to-(--color-accent-2) text-white shadow-[0_4px_12px_rgba(91,141,239,0.45)]"
                      : isAvailable
                      ? "text-(--color-text) hover:ov-10"
                      : "text-(--color-text-faint)/40 cursor-not-allowed",
                  )}
                >
                  <span className="tabular-nums">{c.day}</span>
                  {isAvailable && !isSelected && (
                    <span className="absolute bottom-1 h-1 w-1 rounded-full bg-(--color-accent)" />
                  )}
                  {isToday && !isSelected && (
                    <span className="absolute inset-0 rounded-lg ring-1 ring-(--color-text-faint)/40" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 border-t border-(--color-border) pt-2 mt-2">
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              className="rounded-lg px-2 py-1 text-[11px] text-(--color-text-dim) hover:ov-05 hover:text-(--color-text)"
            >
              All days
            </button>
            <button
              type="button"
              onClick={() => {
                const first = availableDays[0];
                if (first) onChange(first);
                setOpen(false);
              }}
              className="rounded-lg bg-(--color-accent)/15 px-2 py-1 text-[11px] font-medium text-(--color-accent-2) hover:bg-(--color-accent)/22"
            >
              Latest
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface CalendarCell {
  iso: string;
  day: number;
}

function buildMonthCells(monthKey: string): (CalendarCell | null)[] {
  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  // Monday-first column: getDay() => 0=Sun..6=Sat. We want 0=Mon..6=Sun
  const offset = (first.getDay() + 6) % 7;
  const cells: (CalendarCell | null)[] = Array.from({ length: offset }, () => null);
  for (let d = 1; d <= last.getDate(); d++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ iso, day: d });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CalendarGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M19 4h-1V2h-2v2H8V2H6v2H5C3.9 4 3 4.9 3 6v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5z" />
    </svg>
  );
}
function ChevronDownGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="m7 10 5 5 5-5z" />
    </svg>
  );
}
