/*  EventHeader — title + reason/city/category badges.                          */
/*                                                                              */
/*  All action buttons live in PlaybackControls (single source of truth so they */
/*  reflow nicely on small screens). Keep this header focused on identity.     */

import { selectedEvent, useLibrary } from "../stores/libraryStore";
import { formatEventTime } from "../utils/format";
import type { ClipCategory } from "../types";
import clsx from "clsx";

export function EventHeader() {
  const ev = useLibrary(selectedEvent);
  if (!ev) return null;

  const tone: Record<ClipCategory, string> = {
    SentryClips: "from-(--color-sentry)/40 to-(--color-sentry)/10 text-(--color-sentry)",
    SavedClips:  "from-(--color-saved)/40 to-(--color-saved)/10 text-(--color-saved)",
    RecentClips: "from-(--color-recent)/40 to-(--color-recent)/10 text-(--color-recent)",
  };

  return (
    <header className="glass flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3">
      <span className={clsx(
        "shrink-0 rounded-full bg-gradient-to-r px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[1.5px]",
        tone[ev.category],
      )}>
        {ev.category.replace("Clips", "")}
      </span>

      <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-tight text-(--color-text) sm:text-base">
        {ev.title}
      </h2>

      <div className="flex items-center gap-1.5 text-[11px]">
        <Badge>{formatEventTime(ev.timestamp)}</Badge>
        {ev.reason_label && (
          <BadgeAccent className="hidden sm:inline-flex">{ev.reason_label}</BadgeAccent>
        )}
        {ev.city && <Badge className="hidden md:inline-flex">📍 {ev.city}</Badge>}
      </div>
    </header>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={clsx(
      "rounded-full border border-(--color-border) ov-04 px-2 py-0.5 text-(--color-text-dim) whitespace-nowrap",
      className,
    )}>
      {children}
    </span>
  );
}

function BadgeAccent({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={clsx(
      "rounded-full border border-(--color-accent)/40 bg-(--color-accent)/10 px-2 py-0.5 text-(--color-accent-2) whitespace-nowrap",
      className,
    )}>
      {children}
    </span>
  );
}
