/*  Sidebar — search, filters, day picker, event list, stats footer.           */

import { useMemo } from "react";
import clsx from "clsx";
import {
  availableDays,
  dayFilteredEvents,
  selectedEvent,
  useLibrary,
} from "../stores/libraryStore";
import { useBookmarks } from "../stores/bookmarkStore";
import {
  BookmarkIcon,
  CarIcon,
  FolderIcon,
  HonkIcon,
  RecentIcon,
  RefreshIcon,
  SavedIcon,
  SearchIcon,
  ShieldIcon,
} from "./Icons";
import { DatePicker } from "./DatePicker";
import { formatBytes, formatSidebarTime } from "../utils/format";
import type { ClipCategory, ClipEvent } from "../types";
import { eventTotalBytes } from "../types";

const CATEGORIES: { id: ClipCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "RecentClips", label: "Recent" },
  { id: "SavedClips", label: "Saved" },
  { id: "SentryClips", label: "Sentry" },
];

export function Sidebar() {
  const state = useLibrary();
  const events = dayFilteredEvents(state);
  const days = availableDays(state);
  const sel = selectedEvent(state);

  return (
    <aside className="glass relative flex h-full flex-col overflow-hidden rounded-2xl">
      {/* Brand header */}
      <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-(--color-accent)/15 text-(--color-accent)">
            <CarIcon className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold text-(--color-text)">TeslaCam Studio</div>
            <div className="text-[10px] uppercase tracking-[2px] text-(--color-text-faint)">PWA · v1.0</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => state.openPicker()}
            title="Change folder"
            className="grid h-9 w-9 place-items-center rounded-xl text-(--color-text-dim) transition hover:bg-white/5 hover:text-(--color-text)"
          >
            <FolderIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => state.reload()}
            title="Re-scan folder"
            className="grid h-9 w-9 place-items-center rounded-xl text-(--color-text-dim) transition hover:bg-white/5 hover:text-(--color-text)"
          >
            <RefreshIcon className={clsx("h-4 w-4", state.isLoading && "animate-spin")} />
          </button>
        </div>
      </header>

      {/* Search */}
      <div className="relative px-4 pb-2 pt-1">
        <SearchIcon className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-text-faint)" />
        <input
          type="search"
          autoComplete="off"
          placeholder="Search city, reason, date…"
          value={state.search}
          onChange={e => state.setSearch(e.target.value)}
          className="w-full rounded-xl border border-(--color-border) bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-(--color-text) outline-none transition placeholder:text-(--color-text-faint) focus:border-(--color-accent) focus:bg-(--color-accent)/10"
        />
      </div>

      {/* Category chips */}
      <div className="scrollbar-thin flex gap-1.5 overflow-x-auto px-4 pb-2">
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => state.setCategory(c.id)}
            className={clsx(
              "shrink-0 rounded-full border px-3 py-1 text-[12px] font-medium transition",
              state.category === c.id
                ? "border-transparent bg-gradient-to-br from-(--color-accent) to-(--color-accent-2) text-white shadow-[0_4px_12px_rgba(91,141,239,0.35)]"
                : "border-(--color-border) bg-white/[0.04] text-(--color-text-dim) hover:border-(--color-border-strong) hover:text-(--color-text)",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Day filter — custom calendar popover */}
      <div className="px-4 pb-2">
        <DatePicker
          value={state.selectedDay}
          onChange={d => state.setDay(d)}
          availableDays={days}
        />
      </div>

      {/* Stats badges */}
      <Stats />

      {/* Event list */}
      <ul className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-2">
        {events.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-(--color-text-faint)">
            {state.isLoading ? "Scanning…" : "No matching events."}
          </li>
        )}
        {events.map(ev => (
          <EventRow
            key={ev.id}
            event={ev}
            isActive={sel?.id === ev.id}
            onClick={() => state.selectEvent(ev.id)}
          />
        ))}
      </ul>

      {/* Footer */}
      <footer className="flex items-center justify-between border-t border-(--color-border) px-4 py-2.5 text-[11px] text-(--color-text-faint)">
        <span>{events.length} events</span>
        <span>·</span>
        <span>{state.manifest?.stats.total_minutes ?? 0} minutes</span>
      </footer>
    </aside>
  );
}

function Stats() {
  const stats = useLibrary(s => s.manifest?.stats);
  if (!stats) return null;
  return (
    <div className="flex gap-1.5 px-4 pb-2">
      <Pill icon={<SavedIcon className="h-3 w-3" />} label={`${stats.saved_count}`} hint="Saved" tone="saved" />
      <Pill icon={<ShieldIcon className="h-3 w-3" />} label={`${stats.sentry_count}`} hint="Sentry" tone="sentry" />
      <Pill icon={<RecentIcon className="h-3 w-3" />} label={`${stats.recent_count}`} hint="Recent" tone="recent" />
    </div>
  );
}

function Pill({
  icon, label, hint, tone,
}: {
  icon: React.ReactNode; label: string; hint: string;
  tone: "saved" | "sentry" | "recent";
}) {
  const tones: Record<typeof tone, string> = {
    saved: "text-(--color-saved) bg-(--color-saved)/10 border-(--color-saved)/30",
    sentry: "text-(--color-sentry) bg-(--color-sentry)/10 border-(--color-sentry)/30",
    recent: "text-(--color-recent) bg-(--color-recent)/10 border-(--color-recent)/30",
  };
  return (
    <span
      title={hint}
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums",
        tones[tone],
      )}
    >
      {icon}
      {label}
    </span>
  );
}

function EventRow({
  event, isActive, onClick,
}: {
  event: ClipEvent; isActive: boolean; onClick: () => void;
}) {
  const bookmarks = useBookmarks();
  const segmentIds = useMemo(() => event.minutes.map(m => m.id), [event]);
  const bmCount = bookmarks.countIn(event.id, segmentIds);
  const bytes = useMemo(() => eventTotalBytes(event), [event]);

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={clsx(
          "group grid w-full grid-cols-[36px_1fr_auto] items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition",
          isActive
            ? "border-(--color-accent)/40 bg-gradient-to-br from-(--color-accent)/20 to-(--color-accent-2)/10 shadow-(--shadow-soft)"
            : "border-transparent hover:border-(--color-border) hover:bg-white/[0.04]",
        )}
      >
        <CategoryBadge event={event} />
        <div className="min-w-0 self-center">
          <div className="truncate text-[13px] font-medium text-(--color-text)">
            {event.city || event.folder}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-(--color-text-faint)">
            {event.reason_label || event.category}
          </div>
          <div className="mt-0.5 text-[10px] tabular-nums text-(--color-text-faint)">
            {formatSidebarTime(event.timestamp)}
          </div>
        </div>
        <div className="flex flex-col items-end justify-center gap-0.5 text-[10px] tabular-nums text-(--color-text-faint)">
          <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-(--color-text-dim)">
            {event.minute_count}m
          </span>
          <span>{formatBytes(bytes)}</span>
          {bmCount > 0 && (
            <span className="flex items-center gap-0.5 text-(--color-warning)">
              <BookmarkIcon className="h-2.5 w-2.5" />
              {bmCount}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

function CategoryBadge({ event }: { event: ClipEvent }) {
  const colors: Record<ClipCategory, string> = {
    SentryClips: "bg-(--color-sentry)/15 text-(--color-sentry)",
    SavedClips: "bg-(--color-saved)/15 text-(--color-saved)",
    RecentClips: "bg-(--color-recent)/15 text-(--color-recent)",
  };
  const icon: Record<ClipCategory, React.ReactNode> = {
    SentryClips: <ShieldIcon className="h-4 w-4" />,
    SavedClips: event.reason === "user_interaction_honk"
      ? <HonkIcon className="h-4 w-4" />
      : <SavedIcon className="h-4 w-4" />,
    RecentClips: <RecentIcon className="h-4 w-4" />,
  };
  return (
    <div className={clsx("grid h-9 w-9 place-items-center rounded-xl", colors[event.category])}>
      {icon[event.category]}
    </div>
  );
}
