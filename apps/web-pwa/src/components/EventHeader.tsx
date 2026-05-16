/*  EventHeader — title, badges, snapshot / export / report buttons.            */

import { useState } from "react";
import clsx from "clsx";
import {
  selectedEvent,
  selectedSegment,
  useLibrary,
} from "../stores/libraryStore";
import { useBookmarks } from "../stores/bookmarkStore";
import { usePlayback } from "../stores/playbackStore";
import {
  BookmarkIcon,
  BookmarkLineIcon,
  DocIcon,
  ExportIcon,
  FolderIcon,
  FullscreenIcon,
  SnapshotIcon,
} from "./Icons";
import { formatEventTime } from "../utils/format";
import { api } from "../api";

export function EventHeader() {
  const ev = useLibrary(selectedEvent);
  const seg = useLibrary(selectedSegment);
  const bookmarks = useBookmarks();
  const [busy, setBusy] = useState<string | null>(null);

  if (!ev) return null;

  const isBookmarked = seg ? bookmarks.has(ev.id, seg.id) : false;

  async function withBusy(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      usePlayback.getState().setStatus(
        e instanceof Error ? e.message : "Action failed",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <header className="glass flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-semibold leading-tight text-(--color-text)">
          {ev.title}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
          <Badge>{ev.category.replace("Clips", "")}</Badge>
          <Badge>{formatEventTime(ev.timestamp)}</Badge>
          {ev.reason_label && <BadgeAccent>{ev.reason_label}</BadgeAccent>}
          {ev.city && <Badge>📍 {ev.city}</Badge>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <ActionButton
          icon={isBookmarked ? <BookmarkIcon className="h-4 w-4" /> : <BookmarkLineIcon className="h-4 w-4" />}
          label={isBookmarked ? "Bookmarked" : "Bookmark"}
          onClick={() => seg && bookmarks.toggle(ev.id, seg.id)}
          active={isBookmarked}
        />

        <ActionButton
          icon={<SnapshotIcon className="h-4 w-4" />}
          label="Snapshot"
          loading={busy === "snap"}
          onClick={() => withBusy("snap", async () => {
            const result = await captureSnapshots(ev.title);
            usePlayback.getState().setStatus(`${result.length} frames saved`);
          })}
        />

        <ActionButton
          icon={<ExportIcon className="h-4 w-4" />}
          label="Export event"
          loading={busy === "exp"}
          onClick={() => withBusy("exp", async () => {
            const res = await api.exportEvent({
              event_id: ev.id,
              event_title: ev.title,
              minutes: ev.category === "RecentClips" ? ev.minutes : undefined,
            });
            usePlayback.getState().setStatus(`Exported → ${res.path}`);
          })}
        />

        <ActionButton
          icon={<DocIcon className="h-4 w-4" />}
          label="Report"
          loading={busy === "rep"}
          onClick={() => withBusy("rep", async () => {
            const playback = usePlayback.getState();
            const res = await api.exportReport({
              event: ev,
              range: { start: playback.rangeStart, end: playback.rangeEnd },
            });
            usePlayback.getState().setStatus(`Report → ${res.path}`);
          })}
        />

        <ActionButton
          icon={<FolderIcon className="h-4 w-4" />}
          label="Reveal"
          loading={busy === "rev"}
          onClick={() => withBusy("rev", async () => {
            const first = seg?.cameras
              ? Object.values(seg.cameras)[0]?.url
              : undefined;
            if (!first) return;
            const rel = decodeURIComponent(first.replace("/media/", ""));
            await api.reveal(rel);
          })}
        />

        <ActionButton
          icon={<FullscreenIcon className="h-4 w-4" />}
          label="Fullscreen"
          onClick={() => toggleFullscreen()}
        />
      </div>
    </header>
  );
}

function ActionButton({
  icon, label, onClick, active, loading,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={label}
      className={clsx(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition",
        active
          ? "border-(--color-accent)/40 bg-(--color-accent)/15 text-(--color-accent-2)"
          : "border-(--color-border) bg-white/[0.04] text-(--color-text-dim) hover:border-(--color-border-strong) hover:text-(--color-text)",
        loading && "opacity-60",
      )}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-(--color-border) bg-white/[0.04] px-2 py-0.5 text-(--color-text-dim)">
      {children}
    </span>
  );
}

function BadgeAccent({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-(--color-accent)/40 bg-(--color-accent)/10 px-2 py-0.5 text-(--color-accent-2)">
      {children}
    </span>
  );
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

/* ------------------------------------------------------------------- */
/*  Snapshot capture — uses canvas to extract current frame per camera, */
/*  then POST data URLs to the backend which writes to ~/Desktop.       */
/* ------------------------------------------------------------------- */
async function captureSnapshots(eventTitle: string): Promise<string[]> {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>("video"));
  const results: string[] = [];
  for (const v of videos) {
    if (!v.videoWidth || !v.videoHeight) continue;
    const cameraAttr = v.closest("[data-camera]")?.getAttribute("data-camera");
    const labelEl = v.parentElement?.querySelector(".pointer-events-none span:nth-child(2)");
    const camera = (cameraAttr ?? labelEl?.textContent?.toLowerCase() ?? "frame") as never;

    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    try {
      ctx.drawImage(v, 0, 0);
    } catch {
      // CORS-tainted (rare for same-origin)
      continue;
    }
    const dataUrl = canvas.toDataURL("image/png");
    const result = await api.exportSnapshot({
      event_title: eventTitle,
      timestamp: new Date().toISOString(),
      camera,
      data_url: dataUrl,
    });
    results.push(result.path);
  }
  return results;
}
