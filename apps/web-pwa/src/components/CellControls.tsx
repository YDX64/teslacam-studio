/*  CellControls — per-tile control overlay (fullscreen / mute / focus).       */

import clsx from "clsx";
import type { CameraKind } from "../types";
import { FullscreenIcon, MuteIcon, VolumeIcon } from "./Icons";

interface Props {
  camera: CameraKind;
  isFocused: boolean;
  hasAudio: boolean;
  onFullscreen: () => void;
  onToggleAudio: () => void;
  onToggleFocus: () => void;
}

export function CellControls({
  isFocused,
  hasAudio,
  onFullscreen,
  onToggleAudio,
  onToggleFocus,
}: Props) {
  return (
    <div className="cell-controls pointer-events-auto absolute right-1.5 top-1.5 z-10 flex items-center gap-1 rounded-full bg-black/55 px-1 py-1 backdrop-blur-md">
      <Btn
        title="Fullscreen this camera"
        onClick={onFullscreen}
        ariaLabel="Fullscreen"
      >
        <FullscreenIcon className="h-3.5 w-3.5" />
      </Btn>
      <Btn
        title={hasAudio ? "Mute audio" : "Play audio from this camera"}
        onClick={onToggleAudio}
        ariaLabel="Toggle audio"
        active={hasAudio}
      >
        {hasAudio ? <VolumeIcon className="h-3.5 w-3.5" /> : <MuteIcon className="h-3.5 w-3.5" />}
      </Btn>
      <Btn
        title={isFocused ? "Exit focus" : "Focus this camera"}
        onClick={onToggleFocus}
        ariaLabel={isFocused ? "Exit focus" : "Focus camera"}
        active={isFocused}
      >
        {isFocused
          ? <ExitFocusGlyph className="h-3.5 w-3.5" />
          : <FocusGlyph className="h-3.5 w-3.5" />
        }
        {isFocused && <span className="ml-1 text-[10px] font-semibold tracking-wide">Exit</span>}
      </Btn>
    </div>
  );
}

function Btn({
  children, title, onClick, active, ariaLabel,
}: {
  children: React.ReactNode;
  title?: string;
  onClick: () => void;
  active?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={clsx(
        "inline-flex items-center justify-center rounded-full px-2 py-1 text-white transition active:scale-95",
        active
          ? "bg-(--color-accent)/80 text-white"
          : "text-white/80 hover:bg-white/15 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function FocusGlyph(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ExitFocusGlyph(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M9 5H5v4M15 5h4v4M9 19H5v-4M15 19h4v-4" />
      <path d="M10 10l4 4M14 10l-4 4" />
    </svg>
  );
}
