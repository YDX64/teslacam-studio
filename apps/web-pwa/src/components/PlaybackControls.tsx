/*  PlaybackControls — full transport bar with native parity.                  */
/*                                                                              */
/*  Layout strategy:                                                            */
/*    Row 1: play/pause + transport (prev clip / -5s / -frame / play /          */
/*           +frame / +5s / next clip) + seek slider + time + minute counter   */
/*    Row 2: rate · loop · in/out · range label · mute · scope · render ·       */
/*           layout · snapshot · export · report · reveal · inspector toggle   */
/*    Below `md` width, row 2 is horizontally scrollable so nothing wraps      */
/*    into multiple lines or overflows the panel.                              */

import { useEffect, useRef as useRefSync, useState } from "react";
import clsx from "clsx";
import {
  backendAvailable,
  selectedEvent,
  selectedSegment,
  useLibrary,
} from "../stores/libraryStore";
import { usePlayback } from "../stores/playbackStore";
import { useBookmarks } from "../stores/bookmarkStore";
import { api } from "../api";
import { formatTime, rateLabel } from "../utils/format";
import { enterFullscreen } from "../utils/fullscreen";
import type { AdvanceScope, LayoutMode, RenderMode } from "../types";
import {
  BookmarkIcon,
  BookmarkLineIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DocIcon,
  ExportIcon,
  FolderIcon,
  FullscreenIcon,
  InIcon,
  InspectorIcon,
  Layout3UpIcon,
  LayoutMosaicIcon,
  LayoutStudioIcon,
  LayoutTheaterIcon,
  LoopIcon,
  MuteIcon,
  OutIcon,
  PauseIcon,
  PlayIcon,
  ScopeIcon,
  SnapshotIcon,
  SpeedIcon,
  VolumeIcon,
} from "./Icons";

const RATES = [0.25, 0.5, 1, 1.25, 1.5, 2, 4];
const SCOPES: { id: AdvanceScope; label: string }[] = [
  { id: "event", label: "Event" },
  { id: "day",   label: "Day" },
  { id: "library", label: "All" },
];
const LAYOUTS: { id: LayoutMode; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "studio",   label: "Studio",  Icon: LayoutStudioIcon },
  { id: "triptych", label: "3-Up",    Icon: Layout3UpIcon },
  { id: "theater",  label: "Theater", Icon: LayoutTheaterIcon },
  { id: "mosaic",   label: "Mosaic",  Icon: LayoutMosaicIcon },
];
const RENDERS: { id: RenderMode; label: string }[] = [
  { id: "performance", label: "Fast" },
  { id: "all",         label: "All cams" },
];

interface Props {
  onToggleInspector: () => void;
  inspectorOpen: boolean;
}

export function PlaybackControls({ onToggleInspector, inspectorOpen }: Props) {
  const lib = useLibrary();
  const playback = usePlayback();
  const bookmarks = useBookmarks();
  const event = selectedEvent(lib);
  const segment = selectedSegment(lib);
  const canExport = backendAvailable(lib);

  const total = playback.duration;
  const progress = total > 0 ? Math.min(playback.currentTime / total, 1) : 0;
  const minuteIdx = event?.minutes.findIndex(m => m.id === segment?.id) ?? -1;
  const minuteTotal = event?.minutes.length ?? 0;
  const isBookmarked = event && segment ? bookmarks.has(event.id, segment.id) : false;

  const [busy, setBusy] = useState<string | null>(null);

  function fullscreenGrid() {
    const grid = document.querySelector(".video-grid") as HTMLElement | null;
    if (grid) void enterFullscreen(grid);
  }

  // Auto-advance when current minute reaches its end
  useEffect(() => {
    if (!playback.isPlaying || !event || !segment) return;
    if (playback.duration > 0 && playback.duration - playback.currentTime < 0.18) {
      const advanced = lib.nextSegment(playback.scope, playback.loop);
      if (advanced) usePlayback.getState().bumpSegment();
      else usePlayback.getState().setIsPlaying(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.currentTime]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try { await fn(); }
    catch (e) { usePlayback.getState().setStatus(e instanceof Error ? e.message : "Action failed"); }
    finally   { setBusy(null); }
  }

  return (
    /* relative + z-10 hoists the panel above sibling stacking contexts
       (CombinedTimeline) so dropdown menus opening downward aren't
       covered by the timeline panel's backdrop-filter layer. */
    <div className="glass relative z-10 flex flex-col gap-2.5 rounded-2xl p-2.5">
      {/* Row 1 — transport + seek */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <IconBtn
            title="Previous clip (⇧←)"
            onClick={() => { if (lib.prevSegment(playback.scope, playback.loop)) playback.bumpSegment(); }}
          ><PrevClipGlyph className="h-4 w-4" /></IconBtn>
          <IconBtn
            title="Back 5s (←)"
            onClick={() => playback.seek(Math.max(0, playback.currentTime - 5))}
            className="hidden sm:inline-grid"
          ><Back5Glyph className="h-4 w-4" /></IconBtn>
          <IconBtn
            title="Previous frame (,)"
            onClick={() => playback.seek(Math.max(0, playback.currentTime - 1/30))}
            className="hidden md:inline-grid"
          ><ChevronLeftIcon className="h-4 w-4" /></IconBtn>

          <button
            onClick={() => playback.setIsPlaying(!playback.isPlaying)}
            className="primary-btn mx-0.5 grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-(--color-accent) to-(--color-accent-2) text-white shadow-[0_6px_18px_var(--color-accent-glow)] transition active:scale-95"
            aria-label={playback.isPlaying ? "Pause" : "Play"}
          >
            {playback.isPlaying ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
          </button>

          <IconBtn
            title="Next frame (.)"
            onClick={() => playback.seek(Math.min(playback.duration, playback.currentTime + 1/30))}
            className="hidden md:inline-grid"
          ><ChevronRightIcon className="h-4 w-4" /></IconBtn>
          <IconBtn
            title="Forward 5s (→)"
            onClick={() => playback.seek(Math.min(playback.duration, playback.currentTime + 5))}
            className="hidden sm:inline-grid"
          ><Forward5Glyph className="h-4 w-4" /></IconBtn>
          <IconBtn
            title="Next clip (⇧→)"
            onClick={() => { if (lib.nextSegment(playback.scope, playback.loop)) playback.bumpSegment(); }}
          ><NextClipGlyph className="h-4 w-4" /></IconBtn>
        </div>

        <span className="hidden sm:inline-block font-mono text-xs tabular-nums text-(--color-text-dim)">
          {formatTime(playback.currentTime)}
        </span>

        <div className="relative flex-1 min-w-0">
          <input
            type="range"
            min={0}
            max={Math.max(total, 1)}
            step={0.05}
            value={Math.min(playback.currentTime, total)}
            onChange={e => playback.seek(parseFloat(e.target.value))}
            className="seek-slider w-full"
            style={{ "--progress": `${progress * 100}%` } as React.CSSProperties}
            aria-label="Seek"
          />
          {(playback.rangeStart != null || playback.rangeEnd != null) && (
            <RangeOverlay total={total} start={playback.rangeStart} end={playback.rangeEnd} />
          )}
        </div>

        <span className="hidden sm:inline-block font-mono text-xs tabular-nums text-(--color-text-faint)">
          {formatTime(total)}
        </span>

        <span className="rounded-md bg-white/[0.05] px-1.5 py-1 font-mono text-[11px] tabular-nums text-(--color-text-dim) whitespace-nowrap">
          {minuteIdx >= 0 ? minuteIdx + 1 : "—"}/{minuteTotal}
        </span>
      </div>

      {/* Row 2 — secondary actions. Wraps on touch / narrow screens
          so users don't have to drag to find a button. */}
      <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
        {/* Group 1: speed / loop */}
        <Menu
          icon={<SpeedIcon className="h-3.5 w-3.5" />}
          label={rateLabel(playback.rate)}
          options={RATES.map(r => ({
            id: String(r), label: rateLabel(r),
            active: playback.rate === r, onClick: () => playback.setRate(r),
          }))}
        />
        <ChipBtn
          active={playback.loop}
          onClick={() => playback.toggleLoop()}
          title="Loop at scope end (L)"
        >
          <LoopIcon className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Loop</span>
        </ChipBtn>

        <Divider />

        {/* Group 2: range */}
        <ChipBtn onClick={() => playback.markIn()} title="Mark in (I)">
          <InIcon className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">In</span>
        </ChipBtn>
        <ChipBtn onClick={() => playback.markOut()} title="Mark out (O)">
          <OutIcon className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Out</span>
        </ChipBtn>
        {(playback.rangeStart != null || playback.rangeEnd != null) && (
          <>
            <button
              onClick={playback.clearRange}
              className="grid h-7 w-7 place-items-center rounded-full text-(--color-text-faint) hover:bg-white/5 hover:text-(--color-text)"
              title="Clear range"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
            <span className="hidden xl:inline-block font-mono text-[11px] tabular-nums text-(--color-text-faint) whitespace-nowrap">
              {playback.rangeStart != null ? formatTime(playback.rangeStart) : "—"} → {playback.rangeEnd != null ? formatTime(playback.rangeEnd) : "—"}
            </span>
          </>
        )}

        <Divider />

        {/* Group 3: bookmark / snapshot / export / report / reveal */}
        <ChipBtn
          active={!!isBookmarked}
          onClick={() => event && segment && bookmarks.toggle(event.id, segment.id)}
          title="Bookmark segment"
        >
          {isBookmarked ? <BookmarkIcon className="h-3.5 w-3.5" /> : <BookmarkLineIcon className="h-3.5 w-3.5" />}
          <span className="hidden lg:inline">Bookmark</span>
        </ChipBtn>

        <ChipBtn
          onClick={() => run("snap", async () => {
            const result = await captureSnapshots(event?.title ?? "frame");
            usePlayback.getState().setStatus(`${result.length} frames saved to Desktop`);
          })}
          loading={busy === "snap"}
          disabled={!canExport}
          title={canExport ? "Snapshot (all cameras)" : "Snapshot requires the Python backend"}
        >
          <SnapshotIcon className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Snapshot</span>
        </ChipBtn>

        <ChipBtn
          onClick={() => run("exp-seg", async () => {
            if (!event || !segment) return;
            const res = await api.exportSegment({ event_title: event.title, minute: segment });
            usePlayback.getState().setStatus(`Segment exported → ${res.path}`);
          })}
          loading={busy === "exp-seg"}
          disabled={!canExport}
          title={canExport ? "Export this minute" : "Export requires the Python backend"}
        >
          <ExportIcon className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Segment</span>
        </ChipBtn>

        <ChipBtn
          onClick={() => run("exp-ev", async () => {
            if (!event) return;
            const res = await api.exportEvent({
              event_id: event.id,
              event_title: event.title,
              minutes: event.category === "RecentClips" ? event.minutes : undefined,
            });
            usePlayback.getState().setStatus(`Event exported → ${res.path}`);
          })}
          loading={busy === "exp-ev"}
          disabled={!canExport}
          title={canExport ? "Export entire event" : "Export requires the Python backend"}
        >
          <ExportIcon className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Event</span>
        </ChipBtn>

        <ChipBtn
          onClick={() => run("rep", async () => {
            if (!event) return;
            const res = await api.exportReport({
              event,
              range: { start: playback.rangeStart, end: playback.rangeEnd },
            });
            usePlayback.getState().setStatus(`Report → ${res.path}`);
          })}
          loading={busy === "rep"}
          disabled={!canExport}
          title={canExport ? "Markdown report" : "Reports require the Python backend"}
        >
          <DocIcon className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Report</span>
        </ChipBtn>

        <ChipBtn
          onClick={() => run("rev", async () => {
            if (!segment) return;
            const first = Object.values(segment.cameras)[0]?.url;
            if (!first) return;
            await api.reveal(decodeURIComponent(first.replace("/media/", "")));
          })}
          loading={busy === "rev"}
          disabled={!canExport}
          title={canExport ? "Reveal in Finder" : "Reveal requires the Python backend"}
        >
          <FolderIcon className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Reveal</span>
        </ChipBtn>

        <div className="ml-auto flex items-center gap-1.5">
          <ChipBtn
            active={!playback.muted}
            onClick={() => playback.toggleMute()}
            title="Mute / unmute (M)"
          >
            {playback.muted ? <MuteIcon className="h-3.5 w-3.5" /> : <VolumeIcon className="h-3.5 w-3.5" />}
          </ChipBtn>

          <Menu
            icon={<ScopeIcon className="h-3.5 w-3.5" />}
            label={SCOPES.find(s => s.id === playback.scope)!.label}
            options={SCOPES.map(s => ({
              id: s.id, label: s.label,
              active: playback.scope === s.id,
              onClick: () => playback.setScope(s.id),
            }))}
          />

          <Menu
            icon={<LayoutStudioIcon className="h-3.5 w-3.5" />}
            label={LAYOUTS.find(l => l.id === playback.layout)!.label}
            options={LAYOUTS.map(l => ({
              id: l.id, label: l.label,
              active: playback.layout === l.id,
              onClick: () => playback.setLayout(l.id),
              icon: <l.Icon className="h-3.5 w-3.5" />,
            }))}
          />

          <Menu
            icon={<LayoutMosaicIcon className="h-3.5 w-3.5" />}
            label={RENDERS.find(r => r.id === playback.render)!.label}
            options={RENDERS.map(r => ({
              id: r.id, label: r.label,
              active: playback.render === r.id,
              onClick: () => playback.setRender(r.id),
            }))}
          />

          <ChipBtn
            onClick={fullscreenGrid}
            title="Fullscreen grid"
          >
            <FullscreenIcon className="h-3.5 w-3.5" />
          </ChipBtn>

          <ChipBtn
            active={inspectorOpen}
            onClick={onToggleInspector}
            title="Toggle inspector"
          >
            <InspectorIcon className="h-3.5 w-3.5" />
          </ChipBtn>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- chips / glyphs ----------------------- */

function ChipBtn({
  children, onClick, active, title, loading, disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title?: string;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={loading || disabled}
      className={clsx(
        "chip-btn inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition whitespace-nowrap",
        active
          ? "border-(--color-accent)/40 bg-(--color-accent)/16 text-(--color-accent-2)"
          : "border-(--color-border) bg-white/[0.04] text-(--color-text-dim) hover:border-(--color-border-strong) hover:text-(--color-text)",
        loading && "opacity-60 cursor-wait",
        disabled && !loading && "opacity-40 cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}

function IconBtn({
  children, onClick, title, className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={clsx(
        "icon-btn inline-grid h-8 w-8 place-items-center rounded-lg text-(--color-text-dim) hover:bg-white/5 hover:text-(--color-text) transition",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="h-4 w-px shrink-0 bg-(--color-border)" />;
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
      <path d="M11.5 8V5l-5 4 5 4V10c2.21 0 4 1.79 4 4 0 1.84-1.24 3.39-2.92 3.86l.59 1.86C15.69 19.04 17.5 16.74 17.5 14c0-3.31-2.69-6-6-6zM7 14c0 .57.07 1.12.21 1.65l1.84-.74C9.02 14.6 9 14.3 9 14H7zm3.5 6c.34.07.69.13 1.06.16l.16-1.86c-.27-.04-.53-.08-.78-.16L10.5 20z" />
    </svg>
  );
}
function Forward5Glyph(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M12.5 8V5l5 4-5 4V10c-2.21 0-4 1.79-4 4 0 1.84 1.24 3.39 2.92 3.86l-.59 1.86C8.31 19.04 6.5 16.74 6.5 14c0-3.31 2.69-6 6-6zM17 14c0 .57-.07 1.12-.21 1.65l-1.84-.74c.03-.31.05-.61.05-.91h2zm-3.5 6c-.34.07-.69.13-1.06.16l-.16-1.86c.27-.04.53-.08.78-.16L13.5 20z" />
    </svg>
  );
}

/* -------------------------------- range overlay ------------------------ */

function RangeOverlay({ total, start, end }: { total: number; start: number | null; end: number | null }) {
  const left = start != null ? (start / total) * 100 : 0;
  const right = end != null ? 100 - (end / total) * 100 : 0;
  return (
    <div
      className="pointer-events-none absolute inset-y-1.5 rounded-full bg-(--color-accent)/30"
      style={{ left: `${left}%`, right: `${right}%` }}
    />
  );
}

/* -------------------------------- menu --------------------------------- */

interface MenuOption {
  id: string;
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}

function Menu({
  icon, label, options,
}: { icon: React.ReactNode; label: string; options: MenuOption[] }) {
  const [open, setOpen] = useState(false);
  const [flipUp, setFlipUp] = useState(false);
  const ref = useRefClickAway(() => setOpen(false));
  const btnRef = useRefSync<HTMLButtonElement | null>(null);

  // When opening, decide whether to flip the menu upward if there's
  // not enough space below. Roughly: each option ~44px + paddings.
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const btn = btnRef.current;
    const rect = btn.getBoundingClientRect();
    const estimatedMenuHeight = options.length * 44 + 16;
    const spaceBelow = window.innerHeight - rect.bottom;
    setFlipUp(spaceBelow < estimatedMenuHeight && rect.top > estimatedMenuHeight);
  }, [open, options.length]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        className={clsx(
          "menu-btn inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition whitespace-nowrap",
          open
            ? "border-(--color-accent)/40 bg-(--color-accent)/16 text-(--color-accent-2)"
            : "border-(--color-border) bg-white/[0.04] text-(--color-text-dim) hover:border-(--color-border-strong) hover:text-(--color-text)",
        )}
      >
        {icon}
        <span>{label}</span>
        <span className="text-[8px] opacity-60">{flipUp ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div
          className={clsx(
            "glass-strong absolute right-0 z-[60] min-w-[160px] rounded-xl p-1 shadow-(--shadow-pop)",
            flipUp ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          {options.map(o => (
            <button
              key={o.id}
              onClick={() => { o.onClick(); setOpen(false); }}
              className={clsx(
                "menu-option flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition",
                o.active
                  ? "bg-(--color-accent)/16 text-(--color-accent-2)"
                  : "text-(--color-text-dim) hover:bg-white/[0.06] hover:text-(--color-text)",
              )}
            >
              {o.icon}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function useRefClickAway(handler: () => void) {
  const ref = useRefSync<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) handler();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [handler]);
  return ref;
}

/* -------------------------------- snapshots ---------------------------- */

async function captureSnapshots(eventTitle: string): Promise<string[]> {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>("video[data-cam]"));
  const results: string[] = [];
  for (const v of videos) {
    if (!v.videoWidth || !v.videoHeight) continue;
    const camera = (v.dataset.cam ?? "frame") as never;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    try {
      ctx.drawImage(v, 0, 0);
    } catch {
      continue;
    }
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
