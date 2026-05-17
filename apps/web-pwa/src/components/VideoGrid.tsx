/*  VideoGrid — single flat tree of PlayerSurfaces arranged via CSS Grid       */
/*  named areas. Layout switches are pure CSS — the <video> elements never     */
/*  unmount, so decode state and currentTime survive layout changes.            */

import { useMemo, useRef } from "react";
import clsx from "clsx";
import { ALL_CAMERAS, type CameraKind, type LayoutMode, type Segment, camerasInSegment } from "../types";
import { PlayerSurface } from "./PlayerSurface";
import { usePlayback } from "../stores/playbackStore";
import { enterFullscreen } from "../utils/fullscreen";

interface Props {
  segment: Segment | null;
}

export function VideoGrid({ segment }: Props) {
  const layout = usePlayback(s => s.layout);
  const focused = usePlayback(s => s.focused);
  const containerRef = useRef<HTMLDivElement>(null);

  const camerasPresent = useMemo<CameraKind[]>(
    () => (segment ? camerasInSegment(segment) : []),
    [segment],
  );

  if (!segment || camerasPresent.length === 0) {
    return (
      <div className="relative grid h-full w-full place-items-center rounded-2xl border border-(--color-border) bg-black">
        <div className="text-center text-(--color-text-faint)">
          <div className="text-2xl">⏚</div>
          <div className="mt-2 text-sm">No videos in this segment</div>
        </div>
      </div>
    );
  }

  const primary = pickPrimary(camerasPresent, focused);
  const effectiveLayout: LayoutMode | "focus" =
    focused && camerasPresent.includes(focused) ? "focus" : layout;
  const focusedAttr = focused && camerasPresent.includes(focused) ? focused : "";

  function gridFullscreen() {
    const el = containerRef.current;
    if (el) void enterFullscreen(el);
  }

  return (
    <div className="video-grid-wrap flex h-full w-full items-center justify-center min-h-0">
      <div
        ref={containerRef}
        className={clsx(
          "video-grid relative overflow-hidden rounded-2xl border border-(--color-border) bg-black",
        )}
        data-layout={effectiveLayout}
        data-focused={focusedAttr}
        data-cameras={camerasPresent.join(" ")}
      >
        {ALL_CAMERAS.filter(cam => segment.cameras[cam]).map(cam => (
          <PlayerSurface
            key={cam}
            camera={cam}
            video={segment.cameras[cam]}
            isPrimary={cam === primary}
            isFocused={focused === cam}
            onTileFullscreen={() => {
              const videoEl = containerRef.current?.querySelector(
                `[data-cam-tile="${cam}"]`,
              ) as HTMLElement | null;
              if (videoEl) void enterFullscreen(videoEl);
            }}
          />
        ))}

        <span data-grid-fullscreen onClick={gridFullscreen} hidden />
      </div>
    </div>
  );
}

function pickPrimary(cameras: CameraKind[], focused: CameraKind | null): CameraKind {
  if (focused && cameras.includes(focused)) return focused;
  return cameras.find(c => c === "front")
      ?? cameras.find(c => c === "main")
      ?? cameras[0];
}

export const LAYOUT_OPTIONS: { id: LayoutMode; label: string }[] = [
  { id: "studio", label: "Studio" },
  { id: "triptych", label: "3-Up" },
  { id: "theater", label: "Theater" },
  { id: "mosaic", label: "Mosaic" },
];
