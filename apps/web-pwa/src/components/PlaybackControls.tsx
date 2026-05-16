/*  PlaybackControls — play/pause, seek, time, rate, range, scope, layout.     */

import clsx from "clsx";
import { useEffect } from "react";
import {
  selectedEvent,
  selectedSegment,
  useLibrary,
} from "../stores/libraryStore";
import { usePlayback } from "../stores/playbackStore";
import { formatTime, rateLabel } from "../utils/format";
import type { AdvanceScope, LayoutMode, RenderMode } from "../types";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  InIcon,
  InspectorIcon,
  LayoutMosaicIcon,
  LayoutStudioIcon,
  LayoutTheaterIcon,
  Layout3UpIcon,
  LoopIcon,
  MuteIcon,
  OutIcon,
  PauseIcon,
  PlayIcon,
  ScopeIcon,
  SpeedIcon,
  VolumeIcon,
} from "./Icons";

const RATES = [0.25, 0.5, 1, 1.25, 1.5, 2, 4];
const SCOPES: { id: AdvanceScope; label: string }[] = [
  { id: "event", label: "Event" },
  { id: "day", label: "Day" },
  { id: "library", label: "All" },
];
const LAYOUTS: { id: LayoutMode; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "studio", label: "Studio", Icon: LayoutStudioIcon },
  { id: "triptych", label: "3-Up", Icon: Layout3UpIcon },
  { id: "theater", label: "Theater", Icon: LayoutTheaterIcon },
  { id: "mosaic", label: "Mosaic", Icon: LayoutMosaicIcon },
];
const RENDERS: { id: RenderMode; label: string }[] = [
  { id: "performance", label: "Fast" },
  { id: "all", label: "All cams" },
];

interface Props {
  onToggleInspector: () => void;
  inspectorOpen: boolean;
}

export function PlaybackControls({ onToggleInspector, inspectorOpen }: Props) {
  const lib = useLibrary();
  const playback = usePlayback();
  const event = selectedEvent(lib);
  const segment = selectedSegment(lib);

  const total = playback.duration;
  const progress = total > 0 ? Math.min(playback.currentTime / total, 1) : 0;
  const minuteIdx = event?.minutes.findIndex(m => m.id === segment?.id) ?? -1;
  const minuteTotal = event?.minutes.length ?? 0;

  // Auto-advance: when current minute approaches its end, hop to the next
  useEffect(() => {
    if (!playback.isPlaying) return;
    if (!event || !segment) return;
    if (playback.duration > 0 && playback.duration - playback.currentTime < 0.18) {
      const advanced = lib.nextSegment(playback.scope, playback.loop);
      if (advanced) {
        usePlayback.getState().bumpSegment();
      } else {
        usePlayback.getState().setIsPlaying(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.currentTime]);

  return (
    <div className="glass flex flex-col gap-2 rounded-2xl px-3 py-2.5">
      {/* Row 1: main transport */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => playback.setIsPlaying(!playback.isPlaying)}
          className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-(--color-accent) to-(--color-accent-2) text-white shadow-[0_6px_20px_var(--color-accent-glow)] transition active:scale-95"
          aria-label={playback.isPlaying ? "Pause" : "Play"}
        >
          {playback.isPlaying ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
        </button>

        <button
          onClick={() => { lib.prevSegment(playback.scope, playback.loop); usePlayback.getState().bumpSegment(); }}
          className="grid h-9 w-9 place-items-center rounded-xl text-(--color-text-dim) transition hover:bg-white/5 hover:text-(--color-text)"
          title="Previous clip"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <button
          onClick={() => { lib.nextSegment(playback.scope, playback.loop); usePlayback.getState().bumpSegment(); }}
          className="grid h-9 w-9 place-items-center rounded-xl text-(--color-text-dim) transition hover:bg-white/5 hover:text-(--color-text)"
          title="Next clip"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>

        <span className="font-mono text-xs tabular-nums text-(--color-text-dim)">
          {formatTime(playback.currentTime)}
        </span>

        <div className="relative flex-1">
          <input
            type="range"
            min={0}
            max={Math.max(total, 1)}
            step={0.05}
            value={Math.min(playback.currentTime, total)}
            onChange={e => playback.seek(parseFloat(e.target.value))}
            className="seek-slider w-full"
            style={{ "--progress": `${progress * 100}%` } as React.CSSProperties}
          />
          {/* Range overlay */}
          {(playback.rangeStart != null || playback.rangeEnd != null) && (
            <RangeOverlay total={total} start={playback.rangeStart} end={playback.rangeEnd} />
          )}
        </div>

        <span className="font-mono text-xs tabular-nums text-(--color-text-faint)">
          {formatTime(total)}
        </span>

        <span className="rounded-md bg-white/[0.05] px-2 py-1 font-mono text-[11px] text-(--color-text-dim)">
          {minuteIdx >= 0 ? minuteIdx + 1 : "—"} / {minuteTotal}
        </span>
      </div>

      {/* Row 2: secondary */}
      <div className="flex flex-wrap items-center gap-2">
        <Menu
          icon={<SpeedIcon className="h-3.5 w-3.5" />}
          label={rateLabel(playback.rate)}
          options={RATES.map(r => ({
            id: String(r),
            label: rateLabel(r),
            active: playback.rate === r,
            onClick: () => playback.setRate(r),
          }))}
        />
        <button
          onClick={playback.toggleLoop}
          className={chipClass(playback.loop)}
          title="Loop at scope end"
        >
          <LoopIcon className="h-3.5 w-3.5" />
          Loop
        </button>

        <Divider />

        <button onClick={playback.markIn} className={chipClass(false)} title="Mark in">
          <InIcon className="h-3.5 w-3.5" /> In
        </button>
        <button onClick={playback.markOut} className={chipClass(false)} title="Mark out">
          <OutIcon className="h-3.5 w-3.5" /> Out
        </button>
        {(playback.rangeStart != null || playback.rangeEnd != null) && (
          <button
            onClick={playback.clearRange}
            className="grid h-7 w-7 place-items-center rounded-full text-(--color-text-faint) hover:bg-white/5 hover:text-(--color-text)"
            title="Clear range"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        )}
        {(playback.rangeStart != null || playback.rangeEnd != null) && (
          <span className="font-mono text-[11px] text-(--color-text-faint)">
            {playback.rangeStart != null ? formatTime(playback.rangeStart) : "—"} → {playback.rangeEnd != null ? formatTime(playback.rangeEnd) : "—"}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => usePlayback.getState().toggleMute()}
            className={chipClass(!playback.muted)}
            title="Mute / unmute"
          >
            {playback.muted ? <MuteIcon className="h-3.5 w-3.5" /> : <VolumeIcon className="h-3.5 w-3.5" />}
            {playback.muted ? "Muted" : "Audio"}
          </button>

          <Menu
            icon={<ScopeIcon className="h-3.5 w-3.5" />}
            label={SCOPES.find(s => s.id === playback.scope)!.label}
            options={SCOPES.map(s => ({
              id: s.id,
              label: s.label,
              active: playback.scope === s.id,
              onClick: () => playback.setScope(s.id),
            }))}
          />

          <Menu
            icon={<LayoutStudioIcon className="h-3.5 w-3.5" />}
            label={LAYOUTS.find(l => l.id === playback.layout)!.label}
            options={LAYOUTS.map(l => ({
              id: l.id,
              label: l.label,
              active: playback.layout === l.id,
              onClick: () => playback.setLayout(l.id),
              icon: <l.Icon className="h-3.5 w-3.5" />,
            }))}
          />

          <Menu
            icon={<LayoutMosaicIcon className="h-3.5 w-3.5" />}
            label={RENDERS.find(r => r.id === playback.render)!.label}
            options={RENDERS.map(r => ({
              id: r.id,
              label: r.label,
              active: playback.render === r.id,
              onClick: () => playback.setRender(r.id),
            }))}
          />

          <button
            onClick={onToggleInspector}
            className={chipClass(inspectorOpen)}
            title="Toggle inspector"
          >
            <InspectorIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function chipClass(active: boolean) {
  return clsx(
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition",
    active
      ? "border-(--color-accent)/40 bg-(--color-accent)/16 text-(--color-accent-2)"
      : "border-(--color-border) bg-white/[0.04] text-(--color-text-dim) hover:border-(--color-border-strong) hover:text-(--color-text)",
  );
}

function Divider() {
  return <span className="h-4 w-px bg-(--color-border)" />;
}

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
  return (
    <details className="group relative">
      <summary className={clsx(chipClass(false), "list-none cursor-pointer")}>
        {icon}
        {label}
      </summary>
      <div className="glass-strong absolute right-0 z-30 mt-1.5 min-w-[140px] rounded-xl p-1 shadow-(--shadow-pop)">
        {options.map(o => (
          <button
            key={o.id}
            onClick={() => { o.onClick(); (o as unknown as { closest: (s: string) => HTMLDetailsElement | null }).closest("details")?.removeAttribute("open"); }}
            className={clsx(
              "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition",
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
    </details>
  );
}

function RangeOverlay({ total, start, end }: { total: number; start: number | null; end: number | null }) {
  const left = start != null ? (start / total) * 100 : 0;
  const right = end != null ? 100 - (end / total) * 100 : 0;
  return (
    <div
      className="pointer-events-none absolute inset-y-0 rounded-full bg-(--color-accent)/25"
      style={{
        left: `${left}%`,
        right: `${right}%`,
        top: "10px",
        bottom: "10px",
      }}
    />
  );
}
