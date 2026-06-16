/*  Segment timeline (clip strip) + Day timeline (24h heatmap with hover).     */

import { useMemo, useRef, useEffect, useState } from "react";
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
  expectedCoverage,
} from "../types";
import { formatHourMin } from "../utils/format";
import { BookmarkIcon } from "./Icons";

/* -------------------------------- segment timeline -------------------- */

export function SegmentTimeline({ embedded = false }: { embedded?: boolean }) {
  const lib = useLibrary();
  const ev = selectedEvent(lib);
  const sel = selectedSegment(lib);
  const bookmarks = useBookmarks();
  const ref = useRef<HTMLDivElement>(null);

  const expected = useMemo(() => (ev ? expectedCoverage(ev) : []), [ev]);

  useEffect(() => {
    if (!ref.current) return;
    const active = ref.current.querySelector<HTMLElement>("[data-active='true']");
    if (!active) return;
    // First segment: scroll to start. Others: center.
    const isFirst = ev?.minutes[0]?.id === sel?.id;
    active.scrollIntoView({
      behavior: "smooth",
      inline: isFirst ? "start" : "center",
      block: "nearest",
    });
  }, [sel?.id, ev?.minutes]);

  if (!ev) return null;

  const inner = (
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
                "segment-chip group flex min-w-[72px] flex-col items-center gap-0.5 rounded-xl border px-2 py-1.5 text-[11px] transition",
                isActive
                  ? "border-transparent bg-gradient-to-br from-(--color-accent) to-(--color-accent-2) text-white shadow-(--shadow-soft)"
                  : "border-(--color-border) ov-04 text-(--color-text-dim) hover:border-(--color-border-strong) hover:text-(--color-text)",
              )}
            >
              <span className="font-mono tabular-nums">
                {formatHourMin(seg.timestamp)}
              </span>
              <span className={clsx(
                "text-[9px] uppercase tracking-wide",
                isActive ? "text-white/80" : "text-(--color-text-faint)",
              )}>
                {cams.length}/{Math.max(expected.length, cams.length)} cams
              </span>
              <div className="mt-0.5 flex h-1 w-full overflow-hidden rounded-full bg-black/30">
                <div
                  className={clsx(
                    "h-full transition-all",
                    isActive
                      ? "bg-(--color-text)"
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
  );

  if (embedded) return inner;
  return <div className="glass rounded-2xl p-2">{inner}</div>;
}

/* -------------------------------- day timeline ------------------------ */

const CAT_COLORS: Record<ClipCategory, { from: string; to: string }> = {
  SentryClips: { from: "var(--color-sentry)", to: "color-mix(in oklab, var(--color-sentry), transparent 60%)" },
  SavedClips:  { from: "var(--color-saved)",  to: "color-mix(in oklab, var(--color-saved), transparent 60%)" },
  RecentClips: { from: "var(--color-recent)", to: "color-mix(in oklab, var(--color-recent), transparent 60%)" },
};

export function DayTimeline({ embedded = false }: { embedded?: boolean }) {
  const lib = useLibrary();
  const sel = lib.selectedEventId;
  const day = lib.selectedDay;
  const bookmarks = useBookmarks();
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const eventsOfDay = useMemo(() => {
    if (!lib.manifest || !day) return [];
    return lib.manifest.events.filter(e => e.timestamp.slice(0, 10) === day);
  }, [lib.manifest, day]);

  if (!day || eventsOfDay.length === 0) return null;

  const totalMinutes = eventsOfDay.reduce((s, e) => s + e.minute_count, 0);

  const inner = (
    <>
      {/* Title + legend */}
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-[2px] text-(--color-text-faint)">
          Day timeline · {day}
        </h3>
        <span className="text-[11px] text-(--color-text-faint)">
          {eventsOfDay.length} events · {totalMinutes}m
        </span>
        <div className="ml-auto flex items-center gap-3 text-[10px] uppercase tracking-[1px] text-(--color-text-faint)">
          <Legend color="var(--color-recent)" label="Recent" />
          <Legend color="var(--color-saved)"  label="Saved" />
          <Legend color="var(--color-sentry)" label="Sentry" />
          <Legend
            color="white"
            label="Marked"
            kind="dot"
          />
        </div>
      </div>

      {/* Hour ticks — every 4 hours to avoid overlap */}
      <div className="relative h-[68px] rounded-xl bg-black/30">
        {/* Hour grid + labels */}
        {Array.from({ length: 25 }, (_, i) => i).map(h => (
          <span
            key={h}
            className="absolute top-0 h-full w-px ov-04"
            style={{ left: `${(h / 24) * 100}%` }}
          />
        ))}
        <div className="absolute inset-x-0 top-0 h-4">
          {Array.from({ length: 25 }, (_, i) => i).filter(h => h % 4 === 0).map(h => (
            <span
              key={h}
              className="absolute -translate-x-1/2 text-[9px] tabular-nums text-(--color-text-faint)"
              style={{ left: `${(h / 24) * 100}%`, top: 2 }}
            >
              {h.toString().padStart(2, "0")}
            </span>
          ))}
        </div>

        {/* Event blocks */}
        <div
          className="absolute inset-x-0 top-5 bottom-2"
          onMouseLeave={() => setHover(null)}
        >
          {eventsOfDay.map(ev => (
            <EventBlock
              key={ev.id}
              event={ev}
              isActive={sel === ev.id}
              isBookmarked={bookmarks.countIn(ev.id, ev.minutes.map(m => m.id)) > 0}
              onHover={setHover}
            />
          ))}
        </div>

        {/* Hover tooltip */}
        {hover && (
          <div
            className="glass-strong pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg px-2 py-1 text-[10px] text-(--color-text) shadow-(--shadow-pop)"
            style={{ left: `${hover.leftPct}%`, top: -2 }}
          >
            <div className="font-medium">{hover.title}</div>
            <div className="text-(--color-text-faint)">
              {hover.timeLabel} · {hover.minutes}m
            </div>
          </div>
        )}
      </div>
    </>
  );

  if (embedded) return inner;
  return <div className="glass relative rounded-2xl p-3">{inner}</div>;
}

/* -------------------------------- combined ---------------------------- */

/** Single panel: segment chips on top, day timeline below. Saves the
 *  vertical space of two separate glass panels and visually groups the
 *  scrubber + overview. */
export function CombinedTimeline() {
  const lib = useLibrary();
  const ev = selectedEvent(lib);
  const day = lib.selectedDay;
  const eventsOfDay = useMemo(() => {
    if (!lib.manifest || !day) return [];
    return lib.manifest.events.filter(e => e.timestamp.slice(0, 10) === day);
  }, [lib.manifest, day]);

  const showDay = eventsOfDay.length > 0;
  if (!ev && !showDay) return null;

  return (
    <div className="glass rounded-2xl p-2 flex flex-col gap-2">
      {ev && (
        <div>
          <SegmentTimeline embedded />
        </div>
      )}
      {ev && showDay && <div className="h-px bg-(--color-border)" />}
      {showDay && (
        <div className="px-1 pb-1">
          <DayTimeline embedded />
        </div>
      )}
    </div>
  );
}

interface HoverInfo {
  leftPct: number;
  title: string;
  timeLabel: string;
  minutes: number;
}

function EventBlock({
  event, isActive, isBookmarked, onHover,
}: {
  event: ClipEvent;
  isActive: boolean;
  isBookmarked: boolean;
  onHover: (h: HoverInfo | null) => void;
}) {
  const select = useLibrary(s => s.selectEvent);
  const startDate = new Date(event.timestamp);
  const startHour = startDate.getHours() + startDate.getMinutes() / 60;
  const widthHours = Math.max(0.1, event.minute_count / 60);
  const left = (startHour / 24) * 100;
  const width = (widthHours / 24) * 100;
  const colors = CAT_COLORS[event.category];

  return (
    <button
      type="button"
      onMouseEnter={() => onHover({
        leftPct: left + width / 2,
        title: event.title,
        timeLabel: new Date(event.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
        minutes: event.minute_count,
      })}
      onClick={() => { select(event.id); usePlayback.getState().bumpSegment(); }}
      className={clsx(
        "absolute top-1 bottom-1 rounded-md transition-all hover:brightness-125",
        isActive
          ? "z-10 ring-2 ring-(--color-accent) shadow-[0_0_12px_var(--color-accent-glow)]"
          : "opacity-85 hover:opacity-100",
      )}
      style={{
        left: `${left}%`,
        width: `${width}%`,
        minWidth: "5px",
        backgroundImage: `linear-gradient(to right, ${colors.from}, ${colors.to})`,
      }}
      title={`${event.title} (${event.minute_count}m)`}
    >
      {isBookmarked && (
        <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 grid h-3 w-3 place-items-center rounded-full bg-(--color-saved) text-[8px] text-white shadow-sm">
          ★
        </span>
      )}
    </button>
  );
}

function Legend({ color, label, kind = "bar" }: { color: string; label: string; kind?: "bar" | "dot" }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className={clsx(
          kind === "bar" ? "h-2.5 w-3 rounded-sm" : "h-2 w-2 rounded-full",
        )}
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
