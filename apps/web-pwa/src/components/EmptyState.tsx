/*  Empty state shown when no event is selected (cold start, empty manifest).  */

import { useLibrary } from "../stores/libraryStore";
import { CarIcon, RefreshIcon } from "./Icons";

export function EmptyState() {
  const isLoading = useLibrary(s => s.isLoading);
  const error = useLibrary(s => s.error);

  return (
    <div className="glass flex h-full flex-col items-center justify-center gap-4 rounded-2xl p-12 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-(--color-accent)/15 text-(--color-accent)">
        <CarIcon className="h-9 w-9" />
      </div>
      <h2 className="text-lg font-semibold text-(--color-text)">
        {isLoading ? "Scanning your TeslaCam folder…" : "Pick an event on the left"}
      </h2>
      <p className="max-w-md text-sm text-(--color-text-dim)">
        Tesla saves three folders to USB: RecentClips, SavedClips, SentryClips.
        We scan them, sync the cameras, and let you scrub, snapshot, and export.
      </p>

      {error && (
        <div className="rounded-lg border border-(--color-danger)/40 bg-(--color-danger)/10 px-3 py-2 text-xs text-(--color-danger)">
          {error}
        </div>
      )}

      <button
        onClick={() => useLibrary.getState().load()}
        className="inline-flex items-center gap-2 rounded-full border border-(--color-border) bg-white/[0.04] px-4 py-2 text-[13px] text-(--color-text-dim) transition hover:border-(--color-border-strong) hover:text-(--color-text)"
      >
        <RefreshIcon className="h-4 w-4" /> Re-scan
      </button>

      <ShortcutsTable />
    </div>
  );
}

function ShortcutsTable() {
  const rows: [string, string][] = [
    ["Space",        "Play / Pause"],
    ["← / →",        "Seek 5s"],
    ["⇧← / ⇧→",      "Prev / Next clip"],
    ["1 – 4",        "Focus camera"],
    ["I / O",        "Mark in / out"],
    ["F",            "Fullscreen"],
    ["M",            "Mute"],
    ["L",            "Loop scope"],
  ];
  return (
    <div className="mt-4 grid w-full max-w-md grid-cols-2 gap-x-6 gap-y-1 text-[12px] text-(--color-text-faint)">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between">
          <kbd className="rounded-md border border-(--color-border-strong) bg-(--color-bg-2) px-1.5 py-0.5 font-mono text-[11px] text-(--color-text)">
            {k}
          </kbd>
          <span>{v}</span>
        </div>
      ))}
    </div>
  );
}
