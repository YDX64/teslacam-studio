/*  VideoGrid — chooses a multi-camera layout and renders PlayerSurfaces.       */
/*                                                                              */
/*  Layouts:                                                                    */
/*   - studio   :  big front + tower of repeaters on the right                  */
/*   - triptych :  three equal columns                                          */
/*   - theater  :  front fills, others tucked under as a small strip            */
/*   - mosaic   :  evenly tiled grid                                            */
/*                                                                              */
/*  Focus mode: when the user clicks a cell, that camera fills, others tuck.   */

import { useMemo } from "react";
import clsx from "clsx";
import type { CameraKind, LayoutMode, Segment } from "../types";
import { camerasInSegment } from "../types";
import { PlayerSurface } from "./PlayerSurface";
import { usePlayback } from "../stores/playbackStore";

interface Props {
  segment: Segment | null;
}

export function VideoGrid({ segment }: Props) {
  const layout = usePlayback(s => s.layout);
  const focused = usePlayback(s => s.focused);
  const toggleFocus = usePlayback(s => s.toggleFocus);

  const cameras = useMemo(
    () => (segment ? camerasInSegment(segment) : []),
    [segment],
  );

  if (!segment || cameras.length === 0) {
    return (
      <div className="relative grid h-full w-full place-items-center rounded-2xl border border-(--color-border) bg-black">
        <div className="text-center text-(--color-text-faint)">
          <div className="text-2xl">⏚</div>
          <div className="mt-2 text-sm">No videos in this segment</div>
        </div>
      </div>
    );
  }

  const primary = pickPrimary(cameras, focused);

  if (focused && cameras.includes(focused)) {
    return (
      <FocusLayout
        segment={segment}
        cameras={cameras}
        focused={focused}
        primary={primary}
        onToggleFocus={toggleFocus}
      />
    );
  }

  switch (layout) {
    case "triptych": return <TriptychLayout {...{ segment, cameras, primary, onToggleFocus: toggleFocus }} />;
    case "theater":  return <TheaterLayout  {...{ segment, cameras, primary, onToggleFocus: toggleFocus }} />;
    case "mosaic":   return <MosaicLayout   {...{ segment, cameras, primary, onToggleFocus: toggleFocus }} />;
    case "studio":
    default:         return <StudioLayout   {...{ segment, cameras, primary, onToggleFocus: toggleFocus }} />;
  }
}

interface LayoutProps {
  segment: Segment;
  cameras: CameraKind[];
  primary: CameraKind;
  onToggleFocus: (c: CameraKind) => void;
}

function pickPrimary(cameras: CameraKind[], focused: CameraKind | null): CameraKind {
  if (focused && cameras.includes(focused)) return focused;
  return cameras.find(c => c === "front")
    ?? cameras.find(c => c === "main")
    ?? cameras[0];
}

function StudioLayout({ segment, cameras, primary, onToggleFocus }: LayoutProps) {
  const front = cameras.find(c => c === "front") ?? primary;
  const sides = cameras.filter(c => c !== front);

  return (
    <div className="grid h-full w-full grid-cols-[2fr_1fr] gap-1 overflow-hidden rounded-2xl border border-(--color-border) bg-black">
      <PlayerSurface
        camera={front}
        video={segment.cameras[front]}
        isPrimary={front === primary}
        onClick={() => onToggleFocus(front)}
      />
      <div className={clsx("grid gap-1", sides.length === 1 && "grid-rows-1", sides.length === 2 && "grid-rows-2", sides.length >= 3 && "grid-rows-3")}>
        {sides.slice(0, 3).map(cam => (
          <PlayerSurface
            key={cam}
            camera={cam}
            video={segment.cameras[cam]}
            isPrimary={cam === primary}
            onClick={() => onToggleFocus(cam)}
          />
        ))}
      </div>
    </div>
  );
}

function TriptychLayout({ segment, cameras, primary, onToggleFocus }: LayoutProps) {
  const order = pickThreeWideOrder(cameras);
  return (
    <div className={clsx(
      "grid h-full w-full gap-1 overflow-hidden rounded-2xl border border-(--color-border) bg-black",
      order.length === 1 && "grid-cols-1",
      order.length === 2 && "grid-cols-2",
      order.length >= 3 && "grid-cols-3",
    )}>
      {order.map(cam => (
        <PlayerSurface
          key={cam}
          camera={cam}
          video={segment.cameras[cam]}
          isPrimary={cam === primary}
          onClick={() => onToggleFocus(cam)}
        />
      ))}
    </div>
  );
}

function TheaterLayout({ segment, cameras, primary, onToggleFocus }: LayoutProps) {
  const front = primary;
  const others = cameras.filter(c => c !== front);
  return (
    <div className="grid h-full w-full grid-rows-[3fr_1fr] gap-1 overflow-hidden rounded-2xl border border-(--color-border) bg-black">
      <PlayerSurface
        camera={front}
        video={segment.cameras[front]}
        isPrimary
        onClick={() => onToggleFocus(front)}
      />
      <div className={clsx(
        "grid gap-1",
        others.length === 0 && "hidden",
        others.length === 1 && "grid-cols-1",
        others.length === 2 && "grid-cols-2",
        others.length >= 3 && "grid-cols-3",
      )}>
        {others.map(cam => (
          <PlayerSurface
            key={cam}
            camera={cam}
            video={segment.cameras[cam]}
            onClick={() => onToggleFocus(cam)}
          />
        ))}
      </div>
    </div>
  );
}

function MosaicLayout({ segment, cameras, primary, onToggleFocus }: LayoutProps) {
  const cols = cameras.length <= 2 ? 2 : cameras.length <= 4 ? 2 : 3;
  return (
    <div
      className={clsx(
        "grid h-full w-full gap-1 overflow-hidden rounded-2xl border border-(--color-border) bg-black",
        cols === 2 ? "grid-cols-2" : "grid-cols-3",
      )}
      style={{
        gridAutoRows: "1fr",
      }}
    >
      {cameras.map(cam => (
        <PlayerSurface
          key={cam}
          camera={cam}
          video={segment.cameras[cam]}
          isPrimary={cam === primary}
          onClick={() => onToggleFocus(cam)}
        />
      ))}
    </div>
  );
}

function FocusLayout({ segment, cameras, focused, primary, onToggleFocus }: LayoutProps & { focused: CameraKind }) {
  const others = cameras.filter(c => c !== focused);
  return (
    <div className="grid h-full w-full grid-rows-[3fr_1fr] gap-1 overflow-hidden rounded-2xl border border-(--color-border) bg-black">
      <PlayerSurface
        camera={focused}
        video={segment.cameras[focused]}
        isPrimary={focused === primary}
        focusOutline
        onClick={() => onToggleFocus(focused)}
      />
      <div className={clsx(
        "grid gap-1",
        others.length === 0 && "hidden",
        others.length === 1 && "grid-cols-1",
        others.length === 2 && "grid-cols-2",
        others.length >= 3 && "grid-cols-3",
      )}>
        {others.map(cam => (
          <PlayerSurface
            key={cam}
            camera={cam}
            video={segment.cameras[cam]}
            isPrimary={cam === primary}
            onClick={() => onToggleFocus(cam)}
          />
        ))}
      </div>
    </div>
  );
}

function pickThreeWideOrder(cameras: CameraKind[]): CameraKind[] {
  // Left → Front → Right is the natural "looking forward" arrangement
  const ordered: CameraKind[] = [];
  for (const c of ["left_repeater", "front", "right_repeater"] as CameraKind[]) {
    if (cameras.includes(c)) ordered.push(c);
  }
  for (const c of cameras) {
    if (!ordered.includes(c)) ordered.push(c);
  }
  return ordered.slice(0, 4);
}

export const LAYOUT_OPTIONS: { id: LayoutMode; label: string }[] = [
  { id: "studio", label: "Studio" },
  { id: "triptych", label: "3-Up" },
  { id: "theater", label: "Theater" },
  { id: "mosaic", label: "Mosaic" },
];
