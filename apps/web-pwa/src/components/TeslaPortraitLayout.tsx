/*  TeslaPortraitLayout — hand-tuned UI for the pre-2021 Model S/X 1200x1920    */
/*  portrait touchscreen. Optimised for:                                       */
/*    - in-car readability (larger type, thicker borders, higher contrast)     */
/*    - touch (≥56px tap targets, no hover-only affordances)                   */
/*    - older Chromium (no fancy CSS that the car browser can't run)           */
/*    - 5:8 portrait canvas (front camera as the hero, side cams below)        */

import { useState } from "react";
import clsx from "clsx";
import {
  selectedEvent,
  selectedSegment,
  useLibrary,
} from "../stores/libraryStore";
import { usePlayback } from "../stores/playbackStore";
import { useBookmarks } from "../stores/bookmarkStore";
import {
  type CameraKind,
  type Segment,
  camerasInSegment,
} from "../types";
import { formatTime, rateLabel } from "../utils/format";
import { api } from "../api";
import { PlayerSurface } from "./PlayerSurface";
import { Sidebar } from "./Sidebar";
import { EventInspector } from "./EventInspector";
import { InsightStrip } from "./InsightStrip";
import { DayTimeline } from "./Timelines";
import {
  BookmarkIcon,
  BookmarkLineIcon,
  CarIcon,
  CloseIcon,
  DocIcon,
  ExportIcon,
  FolderIcon,
  FullscreenIcon,
  InspectorIcon,
  MuteIcon,
  PauseIcon,
  PlayIcon,
  SnapshotIcon,
  SpeedIcon,
  VolumeIcon,
} from "./Icons";
import { backendAvailable } from "../stores/libraryStore";
import { enterFullscreen } from "../utils/fullscreen";
import { ThemeToggle } from "./ThemeToggle";

type Overlay = null | "library" | "inspector" | "menu" | "events";

export function TeslaPortraitLayout() {
  const lib = useLibrary();
  const playback = usePlayback();
  const bookmarks = useBookmarks();
  const ev = selectedEvent(lib);
  const seg = selectedSegment(lib);
  const canExport = backendAvailable(lib);
  const [overlay, setOverlay] = useState<Overlay>(null);

  if (!ev || !seg) {
    return (
      <TeslaShell
        onLibrary={() => setOverlay("library")}
        onChangeFolder={() => lib.openPicker()}
      >
        <div className="flex h-full items-center justify-center text-(--color-text-faint)">
          <p className="text-xl text-center px-6">
            {lib.source
              ? "Tap “Library” to pick a clip."
              : "Tap the folder icon to open a TeslaCam folder."}
          </p>
        </div>
        {overlay && <SideDrawer side="left" onClose={() => setOverlay(null)}>{renderOverlay(overlay)}</SideDrawer>}
      </TeslaShell>
    );
  }

  const cams = camerasInSegment(seg);
  const front = cams.find(c => c === "front") ?? cams[0];
  const sides = cams.filter(c => c !== front);
  const isBookmarked = bookmarks.has(ev.id, seg.id);
  const minuteIdx = ev.minutes.findIndex(m => m.id === seg.id);

  return (
    <TeslaShell
      onLibrary={() => setOverlay("library")}
      onInspector={() => setOverlay("inspector")}
      onChangeFolder={() => lib.openPicker()}
    >
      {/* Title strip */}
      <div className="glass-strong shrink-0 rounded-3xl px-5 py-4">
        <div className="flex items-baseline gap-3">
          <span className="rounded-full bg-gradient-to-br from-(--color-accent) to-(--color-accent-2) px-3 py-1 text-xs font-bold uppercase tracking-[2px] text-white">
            {ev.category.replace("Clips", "")}
          </span>
          <h2 className="flex-1 truncate text-[22px] font-semibold leading-tight text-(--color-text)">
            {ev.title}
          </h2>
          <span className="text-base text-(--color-text-faint) tabular-nums">
            {minuteIdx + 1}/{ev.minutes.length}
          </span>
        </div>
        {ev.reason_label && (
          <div className="mt-1 text-base text-(--color-text-dim)">
            {ev.reason_label}{ev.city ? ` · ${ev.city}` : ""}
          </div>
        )}
      </div>

      {/* Hero front camera */}
      <div className="relative flex-1 min-h-[560px] overflow-hidden rounded-3xl border border-(--color-border) bg-black">
        <PlayerSurface
          camera={front}
          video={seg.cameras[front]}
          isPrimary
        />
      </div>

      {/* Side cameras row */}
      {sides.length > 0 && (
        <div className="grid shrink-0 h-[280px] grid-cols-2 gap-2.5 overflow-hidden">
          {sides.slice(0, 2).map(cam => (
            <div key={cam} className="overflow-hidden rounded-3xl border border-(--color-border) bg-black">
              <PlayerSurface camera={cam} video={seg.cameras[cam]} />
            </div>
          ))}
        </div>
      )}

      {/* Transport bar */}
      <div className="glass-strong shrink-0 flex flex-col gap-3 rounded-3xl p-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-base tabular-nums text-(--color-text)">
            {formatTime(playback.currentTime)}
          </span>
          <div className="relative flex-1">
            <input
              type="range"
              min={0}
              max={Math.max(playback.duration, 1)}
              step={0.05}
              value={Math.min(playback.currentTime, playback.duration)}
              onChange={e => playback.seek(parseFloat(e.target.value))}
              className="tesla-seek w-full"
              style={{
                "--progress": `${(playback.currentTime / Math.max(playback.duration, 1)) * 100}%`,
              } as React.CSSProperties}
            />
          </div>
          <span className="font-mono text-base tabular-nums text-(--color-text-faint)">
            {formatTime(playback.duration)}
          </span>
        </div>

        <div className="flex items-center justify-center gap-2">
          <TeslaTransportButton
            onClick={() => { if (lib.prevSegment(playback.scope, playback.loop)) playback.bumpSegment(); }}
            ariaLabel="Previous clip"
          >
            <PrevClipGlyph className="h-6 w-6" />
          </TeslaTransportButton>
          <TeslaTransportButton
            onClick={() => playback.seek(Math.max(0, playback.currentTime - 5))}
            ariaLabel="Back 5 seconds"
          >
            <Back5Glyph className="h-6 w-6" />
          </TeslaTransportButton>

          <button
            type="button"
            onClick={() => playback.setIsPlaying(!playback.isPlaying)}
            aria-label={playback.isPlaying ? "Pause" : "Play"}
            className="mx-1 grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-(--color-accent) to-(--color-accent-2) text-white shadow-[0_8px_24px_var(--color-accent-glow)] transition active:scale-95"
          >
            {playback.isPlaying
              ? <PauseIcon className="h-7 w-7" />
              : <PlayIcon className="h-7 w-7" />}
          </button>

          <TeslaTransportButton
            onClick={() => playback.seek(Math.min(playback.duration, playback.currentTime + 5))}
            ariaLabel="Forward 5 seconds"
          >
            <Forward5Glyph className="h-6 w-6" />
          </TeslaTransportButton>
          <TeslaTransportButton
            onClick={() => { if (lib.nextSegment(playback.scope, playback.loop)) playback.bumpSegment(); }}
            ariaLabel="Next clip"
          >
            <NextClipGlyph className="h-6 w-6" />
          </TeslaTransportButton>
        </div>

        {/* Secondary action row */}
        <div className="scrollbar-thin flex gap-2 overflow-x-auto">
          <TeslaChip
            active={!!isBookmarked}
            onClick={() => bookmarks.toggle(ev.id, seg.id)}
            icon={isBookmarked ? <BookmarkIcon className="h-5 w-5" /> : <BookmarkLineIcon className="h-5 w-5" />}
            label="Bookmark"
          />
          <TeslaChip
            onClick={async () => {
              try { await captureAll(ev.title); usePlayback.getState().setStatus("Snapshots saved"); }
              catch (e) { usePlayback.getState().setStatus(e instanceof Error ? e.message : "Failed"); }
            }}
            disabled={!canExport}
            icon={<SnapshotIcon className="h-5 w-5" />}
            label="Snapshot"
          />
          <TeslaChip
            onClick={async () => {
              try {
                const res = await api.exportEvent({
                  event_id: ev.id,
                  event_title: ev.title,
                  minutes: ev.category === "RecentClips" ? ev.minutes : undefined,
                });
                usePlayback.getState().setStatus(`Event saved → ${res.path}`);
              } catch (e) { usePlayback.getState().setStatus(e instanceof Error ? e.message : "Failed"); }
            }}
            disabled={!canExport}
            icon={<ExportIcon className="h-5 w-5" />}
            label="Export"
          />
          <TeslaChip
            onClick={async () => {
              try {
                const res = await api.exportReport({ event: ev, range: { start: playback.rangeStart, end: playback.rangeEnd } });
                usePlayback.getState().setStatus(`Report → ${res.path}`);
              } catch (e) { usePlayback.getState().setStatus(e instanceof Error ? e.message : "Failed"); }
            }}
            disabled={!canExport}
            icon={<DocIcon className="h-5 w-5" />}
            label="Report"
          />
          <TeslaChip
            onClick={() => {
              const url = Object.values(seg.cameras)[0]?.url;
              if (url) api.reveal(decodeURIComponent(url.replace("/media/", ""))).catch(() => {});
            }}
            disabled={!canExport}
            icon={<FolderIcon className="h-5 w-5" />}
            label="Reveal"
          />
          <TeslaChip
            active={!playback.muted}
            onClick={() => playback.toggleMute()}
            icon={playback.muted ? <MuteIcon className="h-5 w-5" /> : <VolumeIcon className="h-5 w-5" />}
            label={playback.muted ? "Muted" : "Audio"}
          />
          <TeslaSpeedChip />
          <TeslaChip
            onClick={() => {
              const grid = document.querySelector(".video-grid") as HTMLElement | null;
              if (grid) void enterFullscreen(grid);
            }}
            icon={<FullscreenIcon className="h-5 w-5" />}
            label="Full"
          />
        </div>
      </div>

      {/* Segment timeline — chunky chips, horizontally scrollable */}
      <TeslaSegmentTimeline />

      {/* Compact day timeline */}
      <div className="shrink-0">
        <DayTimeline />
      </div>

      {playback.status && (
        <div className="glass-strong fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full px-5 py-3 text-base text-(--color-text) shadow-(--shadow-pop)">
          {playback.status}
        </div>
      )}

      {/* Side drawer — leaves the live video visible on the edge */}
      {overlay && (
        <SideDrawer
          side={overlay === "inspector" ? "right" : "left"}
          onClose={() => setOverlay(null)}
        >
          {renderOverlay(overlay)}
        </SideDrawer>
      )}
    </TeslaShell>
  );

  function renderOverlay(o: Overlay) {
    if (o === "library") return <Sidebar />;
    if (o === "inspector") return (
      <div className="p-4">
        <InsightStrip event={ev!} />
        <div className="mt-4">
          <EventInspector />
        </div>
      </div>
    );
    return null;
  }
}

/* -------------------------------- shell -------------------------------- */

function TeslaShell({
  children, onLibrary, onInspector, onChangeFolder,
}: {
  children: React.ReactNode;
  onLibrary: () => void;
  onInspector?: () => void;
  onChangeFolder?: () => void;
}) {
  return (
    <div className="grid h-full w-full grid-rows-[64px_1fr] gap-3 bg-(--color-bg-0) p-3 text-(--color-text)">
      <header className="glass-strong flex items-center justify-between gap-3 rounded-3xl px-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onLibrary}
            className="flex items-center gap-3 rounded-2xl border border-(--color-border) ov-04 px-4 py-2.5 text-[15px] font-medium text-(--color-text) transition active:scale-95"
          >
            <MenuGlyph className="h-5 w-5" />
            Library
          </button>
          {onChangeFolder && (
            <button
              type="button"
              onClick={onChangeFolder}
              aria-label="Change folder"
              title="Change folder"
              className="grid h-11 w-11 place-items-center rounded-2xl border border-(--color-border) ov-04 text-(--color-text-dim) transition active:scale-95"
            >
              <FolderIcon className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <CarIcon className="h-6 w-6 text-(--color-accent)" />
          <span className="text-[16px] font-semibold tracking-wide">TeslaCam Studio</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle className="h-11 w-11 rounded-2xl border border-(--color-border) ov-04" />
          {onInspector ? (
            <button
              type="button"
              onClick={onInspector}
              className="flex items-center gap-2 rounded-2xl border border-(--color-border) ov-04 px-4 py-2.5 text-[15px] font-medium text-(--color-text) transition active:scale-95"
            >
              <InspectorIcon className="h-5 w-5" />
            </button>
          ) : <span className="w-[60px]" />}
        </div>
      </header>
      <div className="grid min-h-0 grid-rows-[auto_1fr_auto_auto_auto_auto] gap-3 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

/** Drawer that slides from the left or right, leaving the underlying view
 *  partially visible on the opposite edge — Tesla in-car users keep seeing
 *  the live video while browsing. */
function SideDrawer({
  side, children, onClose,
}: {
  side: "left" | "right";
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <>
      {/* Tap-to-close strip on the opposite edge. Backdrop is intentionally
          very faint so the underlying video stays vivid. */}
      <div
        className={clsx(
          "fixed inset-y-0 z-40 bg-black/30",
          side === "left" ? "right-0 left-[80vw]" : "left-0 right-[80vw]",
        )}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={clsx(
          "fixed inset-y-0 z-50 flex w-[80vw] flex-col bg-(--color-bg-1)/98 backdrop-blur-xl shadow-(--shadow-pop)",
          side === "left" ? "left-0 border-r" : "right-0 border-l",
          "border-(--color-border)",
        )}
        role="dialog"
        aria-modal="false"
      >
        <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-3">
          <span className="text-base font-semibold text-(--color-text)">
            {side === "left" ? "Library" : "Details"}
          </span>
          <button
            onClick={onClose}
            className="grid h-12 w-12 place-items-center rounded-2xl border border-(--color-border) ov-04 text-(--color-text-dim) transition active:scale-95"
            aria-label="Close"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-3">
          {children}
        </div>
      </aside>
    </>
  );
}

/* -------------------------------- transport pieces -------------------- */

function TeslaTransportButton({
  onClick, ariaLabel, children,
}: {
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="grid h-12 w-12 place-items-center rounded-2xl border border-(--color-border) ov-04 text-(--color-text-dim) transition active:scale-95 active:ov-10"
    >
      {children}
    </button>
  );
}

function TeslaChip({
  active, onClick, icon, label, disabled,
}: {
  active?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "flex h-12 shrink-0 items-center gap-2 rounded-2xl border px-4 text-[14px] font-medium transition active:scale-95 whitespace-nowrap",
        active
          ? "border-(--color-accent)/45 bg-(--color-accent)/18 text-(--color-accent-2)"
          : "border-(--color-border) ov-04 text-(--color-text) active:ov-10",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function TeslaSpeedChip() {
  const rate = usePlayback(s => s.rate);
  const set = usePlayback(s => s.setRate);
  const next = () => {
    const rates = [0.5, 1, 1.5, 2, 4];
    const i = rates.indexOf(rate);
    set(rates[(i + 1) % rates.length] ?? 1);
  };
  return (
    <TeslaChip
      onClick={next}
      icon={<SpeedIcon className="h-5 w-5" />}
      label={rateLabel(rate)}
    />
  );
}

function TeslaSegmentTimeline() {
  const lib = useLibrary();
  const ev = selectedEvent(lib);
  const sel = selectedSegment(lib);
  const bookmarks = useBookmarks();
  if (!ev) return null;
  return (
    <div className="glass-strong shrink-0 rounded-3xl p-3">
      <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
        {ev.minutes.map(seg => {
          const isActive = sel?.id === seg.id;
          const cams = camerasInSegment(seg);
          const bookmarked = bookmarks.has(ev.id, seg.id);
          return (
            <button
              key={seg.id}
              onClick={() => { lib.selectSegment(ev.id, seg.id); usePlayback.getState().bumpSegment(); }}
              className={clsx(
                "flex h-16 min-w-[88px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border text-sm transition active:scale-95",
                isActive
                  ? "border-transparent bg-gradient-to-br from-(--color-accent) to-(--color-accent-2) text-white"
                  : "border-(--color-border) ov-04 text-(--color-text-dim)",
              )}
            >
              <span className="font-mono tabular-nums">
                {timeOfDay(seg.timestamp)}
              </span>
              <span className={clsx("text-[11px]", isActive ? "text-white/85" : "text-(--color-text-faint)")}>
                {cams.length} cams {bookmarked ? "★" : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function timeOfDay(iso: string): string {
  return iso.slice(11, 16);
}

/* -------------------------------- glyphs ------------------------------ */

function MenuGlyph(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
    </svg>
  );
}
function PrevClipGlyph(p: React.SVGProps<SVGSVGElement>) {
  return (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M6 6h2v12H6zm12 0L9 12l9 6z" /></svg>);
}
function NextClipGlyph(p: React.SVGProps<SVGSVGElement>) {
  return (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M16 6h2v12h-2zM6 18l9-6-9-6z" /></svg>);
}
function Back5Glyph(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M11.5 8V5l-5 4 5 4V10c2.21 0 4 1.79 4 4 0 1.84-1.24 3.39-2.92 3.86l.59 1.86C15.69 19.04 17.5 16.74 17.5 14c0-3.31-2.69-6-6-6z" />
    </svg>
  );
}
function Forward5Glyph(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M12.5 8V5l5 4-5 4V10c-2.21 0-4 1.79-4 4 0 1.84 1.24 3.39 2.92 3.86l-.59 1.86C8.31 19.04 6.5 16.74 6.5 14c0-3.31 2.69-6 6-6z" />
    </svg>
  );
}

/* -------------------------------- snapshot util ----------------------- */

async function captureAll(eventTitle: string): Promise<string[]> {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>("video[data-cam]"));
  const results: string[] = [];
  for (const v of videos) {
    if (!v.videoWidth || !v.videoHeight) continue;
    const camera = (v.dataset.cam ?? "frame") as CameraKind;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    try { ctx.drawImage(v, 0, 0); } catch { continue; }
    const dataUrl = canvas.toDataURL("image/png");
    const r = await api.exportSnapshot({
      event_title: eventTitle,
      timestamp: new Date().toISOString(),
      camera,
      data_url: dataUrl,
    });
    results.push(r.path);
  }
  return results;
}

/* Defensive: don't fail if Segment lacks types */
export type _SegmentTypeAlias = Segment;
