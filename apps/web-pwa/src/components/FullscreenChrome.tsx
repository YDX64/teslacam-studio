/*  FullscreenChrome — floating transport rendered into a portal while any     */
/*  element is fullscreen. Ensures the user always has an on-screen "Exit"     */
/*  button (Tesla in-car has no keyboard).                                     */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { usePlayback } from "../stores/playbackStore";
import { selectedEvent, selectedSegment, useLibrary } from "../stores/libraryStore";
import { useFullscreen } from "../utils/fullscreen";
import { formatTime } from "../utils/format";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  PauseIcon,
  PlayIcon,
} from "./Icons";

export function FullscreenChrome() {
  const { active, element, exit } = useFullscreen();
  const playback = usePlayback();
  const lib = useLibrary();
  const event = selectedEvent(lib);
  const segment = selectedSegment(lib);

  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) { setHost(null); return; }
    // Render the chrome as a child of the fullscreen element so the browser
    // keeps it visible. Falling back to <body> if `element` is not an HTMLElement.
    if (element instanceof HTMLElement) {
      setHost(element);
    } else {
      setHost(document.body);
    }
  }, [active, element]);

  if (!active || !host) return null;
  if (!event || !segment) {
    return createPortal(
      <ChromeShell>
        <button
          type="button"
          onClick={() => void exit()}
          className="ml-auto inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[13px] font-semibold text-white hover:bg-white/20"
          aria-label="Exit fullscreen"
        >
          <CloseIcon className="h-4 w-4" /> Exit fullscreen
        </button>
      </ChromeShell>,
      host,
    );
  }

  const total = playback.duration;
  const progress = total > 0 ? Math.min(playback.currentTime / total, 1) : 0;

  return createPortal(
    <ChromeShell>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { if (lib.prevSegment(playback.scope, playback.loop)) playback.bumpSegment(); }}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
          aria-label="Previous clip"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => playback.setIsPlaying(!playback.isPlaying)}
          className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-(--color-accent) to-(--color-accent-2) text-white shadow-lg"
          aria-label={playback.isPlaying ? "Pause" : "Play"}
        >
          {playback.isPlaying ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
        </button>
        <button
          type="button"
          onClick={() => { if (lib.nextSegment(playback.scope, playback.loop)) playback.bumpSegment(); }}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
          aria-label="Next clip"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex flex-1 items-center gap-3">
        <span className="font-mono text-[12px] tabular-nums text-white/85 whitespace-nowrap">
          {formatTime(playback.currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(total, 1)}
          step={0.05}
          value={Math.min(playback.currentTime, total)}
          onChange={e => playback.seek(parseFloat(e.target.value))}
          className="seek-slider flex-1"
          style={{ "--progress": `${progress * 100}%` } as React.CSSProperties}
          aria-label="Seek"
        />
        <span className="font-mono text-[12px] tabular-nums text-white/70 whitespace-nowrap">
          {formatTime(total)}
        </span>
      </div>

      <button
        type="button"
        onClick={() => void exit()}
        className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[13px] font-semibold text-white hover:bg-white/20"
        aria-label="Exit fullscreen"
      >
        <CloseIcon className="h-4 w-4" /> Exit
      </button>
    </ChromeShell>,
    host,
  );
}

function ChromeShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={clsx(
        "fixed inset-x-0 bottom-0 z-[100] flex flex-wrap items-center gap-3 px-4 py-3",
        "bg-gradient-to-t from-black/85 via-black/55 to-transparent",
        "pointer-events-auto",
      )}
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      {children}
    </div>
  );
}
