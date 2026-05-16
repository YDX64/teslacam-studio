/*  App — responsive shell. Sidebar + inspector become slide-over drawers      */
/*  below `lg`. Keyboard shortcuts are global.                                 */

import { useEffect } from "react";
import clsx from "clsx";
import { Sidebar } from "./components/Sidebar";
import { EventWorkspace } from "./components/EventWorkspace";
import { useLibrary, selectedSegment } from "./stores/libraryStore";
import { usePlayback } from "./stores/playbackStore";
import { camerasInSegment } from "./types";
import { useViewport } from "./hooks/useViewport";
import { CarIcon, CloseIcon, InspectorIcon } from "./components/Icons";

export default function App() {
  const load = useLibrary(s => s.load);
  const vp = useViewport();
  const sidebarOpen = useUiStore(s => s.sidebarOpen);
  const inspectorOpen = useUiStore(s => s.inspectorOpen);
  const setSidebarOpen = useUiStore(s => s.setSidebarOpen);
  const setInspectorOpen = useUiStore(s => s.setInspectorOpen);

  useEffect(() => { load(); }, [load]);

  // Adapt drawer state to viewport
  useEffect(() => {
    if (vp.isDesktop) {
      setSidebarOpen(true);
      setInspectorOpen(vp.isWide ? true : useUiStore.getState().inspectorOpen);
    } else {
      // Close drawers when shrinking below lg
      setSidebarOpen(false);
      setInspectorOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp.isDesktop, vp.isWide]);

  // Close drawer after selecting an event on small screens
  useEffect(() => {
    if (vp.isDesktop) return;
    const unsub = useLibrary.subscribe((state, prev) => {
      if (state.selectedEventId !== prev.selectedEventId) {
        setSidebarOpen(false);
      }
    });
    return unsub;
  }, [vp.isDesktop, setSidebarOpen]);

  // Global keyboard shortcuts (skip on touch)
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
          if (e.shiftKey) { if (lib.prevSegment(playback.scope, playback.loop)) playback.bumpSegment(); }
          else playback.seek(Math.max(0, playback.currentTime - 5));
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) { if (lib.nextSegment(playback.scope, playback.loop)) playback.bumpSegment(); }
          else playback.seek(Math.min(playback.duration, playback.currentTime + 5));
          break;
        case "ArrowUp":
          e.preventDefault();
          if (lib.prevSegment(playback.scope, playback.loop)) playback.bumpSegment();
          break;
        case "ArrowDown":
          e.preventDefault();
          if (lib.nextSegment(playback.scope, playback.loop)) playback.bumpSegment();
          break;
        case ",":
          e.preventDefault();
          playback.seek(Math.max(0, playback.currentTime - 1 / 30));
          break;
        case ".":
          e.preventDefault();
          playback.seek(Math.min(playback.duration, playback.currentTime + 1 / 30));
          break;
        case "f":
        case "F":
          e.preventDefault();
          if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
          else document.exitFullscreen?.().catch(() => {});
          break;
        case "m":
        case "M":
          e.preventDefault(); playback.toggleMute(); break;
        case "l":
        case "L":
          e.preventDefault(); playback.toggleLoop(); break;
        case "i":
        case "I":
          e.preventDefault(); playback.markIn(); break;
        case "o":
        case "O":
          e.preventDefault(); playback.markOut(); break;
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
          setSidebarOpen(false);
          setInspectorOpen(false);
          break;
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [setSidebarOpen, setInspectorOpen]);

  return (
    <div className="grid h-screen w-screen overflow-hidden bg-(--color-bg-0) text-(--color-text)">
      {vp.isDesktop ? (
        <DesktopLayout />
      ) : (
        <MobileLayout
          sidebarOpen={sidebarOpen}
          inspectorOpen={inspectorOpen}
          onOpenSidebar={() => setSidebarOpen(true)}
          onCloseSidebar={() => setSidebarOpen(false)}
          onToggleInspector={() => setInspectorOpen(!inspectorOpen)}
          onCloseInspector={() => setInspectorOpen(false)}
        />
      )}
    </div>
  );
}

/* -------------------------------- desktop -------------------------------- */

function DesktopLayout() {
  const vp = useViewport();
  return (
    <div className={clsx(
      "grid h-full w-full gap-3 p-3",
      vp.isWide ? "grid-cols-[340px_1fr]" : "grid-cols-[300px_1fr]",
    )}>
      <Sidebar />
      <main className="min-h-0 min-w-0 overflow-hidden">
        <EventWorkspace />
      </main>
    </div>
  );
}

/* -------------------------------- mobile / tablet ----------------------- */

interface MobileLayoutProps {
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  onOpenSidebar: () => void;
  onCloseSidebar: () => void;
  onToggleInspector: () => void;
  onCloseInspector: () => void;
}

function MobileLayout({
  sidebarOpen,
  onOpenSidebar, onCloseSidebar, onToggleInspector,
}: MobileLayoutProps) {
  return (
    <div className="relative flex h-full w-full flex-col">
      <MobileTopBar onMenuClick={onOpenSidebar} onInspectorClick={onToggleInspector} />
      <main className="min-h-0 flex-1 overflow-hidden px-2 pb-2">
        <EventWorkspace />
      </main>

      {/* Sidebar drawer — inspector is rendered by EventWorkspace as an overlay */}
      <Drawer side="left" open={sidebarOpen} onClose={onCloseSidebar}>
        <Sidebar />
      </Drawer>
    </div>
  );
}

function MobileTopBar({ onMenuClick, onInspectorClick }: { onMenuClick: () => void; onInspectorClick: () => void }) {
  return (
    <div className="glass flex items-center justify-between gap-2 px-3 py-2.5 m-2 rounded-2xl">
      <button
        onClick={onMenuClick}
        className="flex items-center gap-2 rounded-xl border border-(--color-border) bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-(--color-text-dim) hover:text-(--color-text)"
        aria-label="Open library"
      >
        <MenuGlyph className="h-4 w-4" />
        Library
      </button>
      <div className="flex items-center gap-2">
        <CarIcon className="h-5 w-5 text-(--color-accent)" />
        <span className="text-[13px] font-semibold">TeslaCam Studio</span>
      </div>
      <button
        onClick={onInspectorClick}
        className="flex items-center gap-2 rounded-xl border border-(--color-border) bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-(--color-text-dim) hover:text-(--color-text)"
        aria-label="Toggle inspector"
      >
        <InspectorIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

function MenuGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
    </svg>
  );
}

/* -------------------------------- Drawer -------------------------------- */

function Drawer({
  open, onClose, side, title, children,
}: {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  title?: string;
  children?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={clsx(
          "fixed top-0 z-50 flex h-full flex-col bg-(--color-bg-1) shadow-(--shadow-pop) animate-in",
          side === "left"
            ? "left-0 max-w-[88vw] w-[340px] border-r border-(--color-border)"
            : "right-0 max-w-[88vw] w-[320px] border-l border-(--color-border)",
        )}
        role="dialog"
      >
        <div className="flex items-center justify-between border-b border-(--color-border) px-3 py-2.5">
          <span className="text-[13px] font-semibold text-(--color-text)">
            {title ?? "Library"}
          </span>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-(--color-text-dim) hover:bg-white/5 hover:text-(--color-text)"
            aria-label="Close"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {children}
        </div>
      </aside>
    </>
  );
}

/* -------------------------------- UI store ------------------------------ */
/*  Tiny UI-only store kept beside App to avoid a separate file.            */

import { create } from "zustand";

interface UiState {
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  setSidebarOpen(v: boolean): void;
  toggleSidebar(): void;
  setInspectorOpen(v: boolean): void;
  toggleInspector(): void;
}

export const useUiStore = create<UiState>(set => ({
  sidebarOpen: true,
  inspectorOpen: true,
  setSidebarOpen(v) { set({ sidebarOpen: v }); },
  toggleSidebar()   { set(s => ({ sidebarOpen: !s.sidebarOpen })); },
  setInspectorOpen(v) { set({ inspectorOpen: v }); },
  toggleInspector()   { set(s => ({ inspectorOpen: !s.inspectorOpen })); },
}));
