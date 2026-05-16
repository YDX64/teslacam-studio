/*  App — top-level layout, keyboard shortcuts, manifest bootstrap.            */

import { useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { EventWorkspace } from "./components/EventWorkspace";
import { useLibrary, selectedSegment } from "./stores/libraryStore";
import { usePlayback } from "./stores/playbackStore";
import { camerasInSegment } from "./types";

export default function App() {
  const load = useLibrary(s => s.load);

  // Initial scan
  useEffect(() => {
    load();
  }, [load]);

  // Global keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const playback = usePlayback.getState();
      const lib = useLibrary.getState();

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          playback.setIsPlaying(!playback.isPlaying);
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) {
            if (lib.prevSegment(playback.scope, playback.loop)) playback.bumpSegment();
          } else {
            playback.seek(Math.max(0, playback.currentTime - 5));
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) {
            if (lib.nextSegment(playback.scope, playback.loop)) playback.bumpSegment();
          } else {
            playback.seek(Math.min(playback.duration, playback.currentTime + 5));
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (lib.prevSegment(playback.scope, playback.loop)) playback.bumpSegment();
          break;
        case "ArrowDown":
          e.preventDefault();
          if (lib.nextSegment(playback.scope, playback.loop)) playback.bumpSegment();
          break;
        case "f":
        case "F":
          e.preventDefault();
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.().catch(() => {});
          } else {
            document.exitFullscreen?.().catch(() => {});
          }
          break;
        case "m":
        case "M":
          e.preventDefault();
          playback.toggleMute();
          break;
        case "l":
        case "L":
          e.preventDefault();
          playback.toggleLoop();
          break;
        case "i":
        case "I":
          e.preventDefault();
          playback.markIn();
          break;
        case "o":
        case "O":
          e.preventDefault();
          playback.markOut();
          break;
        case "1": case "2": case "3": case "4": {
          const idx = parseInt(e.key, 10) - 1;
          const seg = selectedSegment(lib);
          if (seg) {
            const cams = camerasInSegment(seg);
            const cam = cams[idx];
            if (cam) playback.toggleFocus(cam);
          }
          break;
        }
        case "Escape":
          if (document.fullscreenElement) document.exitFullscreen?.();
          if (playback.focused) playback.setFocus(null);
          break;
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="grid h-screen w-screen gap-3 p-3 lg:grid-cols-[340px_1fr]">
      <Sidebar />
      <main className="min-h-0 min-w-0">
        <EventWorkspace />
      </main>
    </div>
  );
}
