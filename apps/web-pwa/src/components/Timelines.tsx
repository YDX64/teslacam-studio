/*  Segment timeline (clip strip) + Day timeline (24h heatmap).                */

import { useMemo, useRef, useEffect } from "react";
import clsx from "clsx";
import {
  selectedEvent,
  selectedSegment,
  useLibrary,
} from "../stores/libraryStore";
import { useBookmarks } from "../stores/bookmarkStore";
import { usePlayback } from "../stores/playbackStore";
import {
  camerasInSegment,
  type ClipCategory,
  type ClipEvent,
  type Segment,
  expectedCoverage,
} from "../types";
import { formatHourMin } from "../utils/format";
import { BookmarkIcon } from "./Icons";

export function SegmentTimeline() {
  const lib = useLibrary();
  const ev = selectedEvent(lib);
  const sel = selectedSegment(lib);
  const bookmarks = useBookmarks();
  const ref = useRef<HTMLDivElement>(null);

  const expected = useMemo(() => (ev ? expectedCoverage(ev) : []), [ev]);

  // Auto-scroll active chip into view
  useEffect(() => {
    if (!ref.current) return;
    const active = ref.current.querySelector<HTMLElement>("[data-active='true']");
    if (active) {
      active.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [sel?.id]);

  if (!ev) return null;

  return (
    <div className="glass rounded-2xl p-2">
      <div ref={ref} className="scrollbar-thin flex gap-1.5 overflow-x-auto pb-1">
        {ev.minutes.map(seg => {
          const isActive = sel?.id === seg.id;
          const cams = camerasInSegment(seg);
          const bookmarked = bookmarks.has(ev.id, seg.id);
          const coverage = expected.length === 0 ? 1 : cams.length / expected.length;
          return (
            <button
              key={seg.id}
              data-active={isActive}
              onClick={() => {
                lib.selectSegment(ev.id, seg.id);
                usePlayback.getState().bumpSegment();
              }}
              className={clsx(
                "group flex min-w-[78px] flex-col items-center gap-0.5 rounded-xl border px-2 py-1.5 text-[11px] transition",
                isActive
                  ? "border-transparent bg-gradient-to-br from-(--color-accent) to-(--color-accent-2) text-white shadow-(--shadow-soft)"
                  : "border-(--color-border) bg-white/[0.04] text-(--color-text-dim) hover:border-(--color-border-strong) hover:text-(--color-text)",
              )}
            >
              <span className="font-mono tabular-nums">
                {formatHourMin(seg.timestamp)}
              </span>
              <span
                className={clsx(
                  "text-[9px] uppercase tracking-wide",
                  isActive ? "text-white/80" : "text-(--color-text-faint)",
                )}
              >
                {cams.length}/{Math.max(expected.length, cams.length)} cams
              </span>
              <div className="mt-0.5 flex h-1 w-full overflow-hidden rounded-full bg-black/30">
                <div
                  className={clsx(
                    "h-full transition-all",
                    isActive
                      ? "bg-white/80"
                      : coverage === 1
                      ? "bg-(--color-success)"
                      : coverage >= 0.5
                      ? "bg-(--color-warning)"
                      : "bg-(--color-danger)",
                  )}
                  style={{ width: `${coverage * 100}%` }}
                />
              </div>
              {bookmarked && (
                <BookmarkIcon
                  className={clsx(
                    "h-2.5 w-2.5",
                    isActive ? "text-white" : "text-(--color-warning)",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day Timeline — events spread across 24 hours
// ---------------------------------------------------------------------------

export function DayTimeline() {
  const lib = useLibrary();
  const day = lib.selectedDay;
  const eventsOfDay = useMemo(() => {
    if (!lib.manifest || !day) return [];
    return lib.manifest.events.filter(e => e.timestamp.slice(0, 10) === day);
  }, [lib.manifest, day]);

  if (!day || eventsOfDay.length === 0) return null;

  return (
    <div className="glass relative rounded-2xl px-4 pb-2 pt-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[2px] text-(--color-text-faint)">
          Day timeline · {day}
        </h3>
        <span className="text-[11px] text-(--color-text-faint)">
          {eventsOfDay.length} events
        </span>
      </div>

      <div className="relative mt-2 h-12">
        {/* Hour ticks */}
        <div className="absolute inset-x-0 top-0 flex justify-between text-[9px] tabular-nums text-(--color-text-faint)">
          {Array.from({ length: 25 }, (_, i) => i).filter(i => i % 3 === 0).map(h => (
            <span key={h} className="-translate-x-1/2" style={{ marginLeft: i => `${(h / 24) * 100}%` } as never}>
              {h.toString().padStart(2, "0")}
            </span>
          ))}
        </div>
        <div className="absolute inset-x-0 top-3 h-9 rounded-lg bg-black/30">
          {/* Hour grid */}
          {Array.from({ length: 24 }, (_, i) => (
            <span
              key={i}
              className="absolute top-0 h-full w-px bg-white/[0.03]"
              style={{ left: `${(i / 24) * 100}%` }}
            />
          ))}

          {/* Event blocks */}
          {eventsOfDay.map(ev => (
            <EventBlock key={ev.id} event={ev} />
          ))}
        </div>
      </div>
    </div>
  );
}

function EventBlock({ event }: { event: ClipEvent }) {
  const sel = useLibrary(s => s.selectedEventId);
  const select = useLibrary(s => s.selectEvent);
  const startDate = new Date(event.timestamp);
  const startHour = startDate.getHours() + startDate.getMinutes() / 60;
  const widthHours = Math.max(0.6, event.minute_count / 60);

  const left = (startHour / 24) * 100;
  const width = (widthHours / 24) * 100;
  const isActive = sel === event.id;

  const colors: Record<ClipCategory, string> = {
    SentryClips: "from-(--color-sentry) to-(--color-sentry)/40",
    SavedClips: "from-(--color-saved) to-(--color-saved)/40",
    RecentClips: "from-(--color-recent) to-(--color-recent)/40",
  };

  return (
    <button
      type="button"
      onClick={() => { select(event.id); usePlayback.getState().bumpSegment(); }}
      className={clsx(
        "absolute top-1 h-7 rounded-md bg-gradient-to-r transition-all",
        colors[event.category],
        isActive
          ? "ring-2 ring-white shadow-[0_0_10px_rgba(255,255,255,0.45)] z-10"
          : "opacity-80 hover:opacity-100",
      )}
      style={{ left: `${left}%`, width: `${width}%`, minWidth: "4px" }}
      title={`${event.title} (${event.minute_count}m)`}
    />
  );
}

// ---------------------------------------------------------------------------
// Selected segment helper for VideoGrid
// ---------------------------------------------------------------------------

export function currentSegment(): Segment | null {
  return selectedSegment(useLibrary.getState());
}
