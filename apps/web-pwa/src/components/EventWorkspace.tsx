/*  EventWorkspace — main pane. Fully responsive: side-by-side on desktop,     */
/*  stacked + drawer on mobile/tablet.                                         */

import { useEffect } from "react";
import clsx from "clsx";
import {
  selectedEvent,
  selectedSegment,
  useLibrary,
} from "../stores/libraryStore";
import { usePlayback } from "../stores/playbackStore";
import { useUiStore } from "../App";
import { useViewport } from "../hooks/useViewport";
import { EventHeader } from "./EventHeader";
import { InsightStrip } from "./InsightStrip";
import { VideoGrid } from "./VideoGrid";
import { PlaybackControls } from "./PlaybackControls";
import { CombinedTimeline } from "./Timelines";
import { EventInspector } from "./EventInspector";
import { EmptyState } from "./EmptyState";
import { CloseIcon } from "./Icons";

export function EventWorkspace() {
  const ev = useLibrary(selectedEvent);
  const seg = useLibrary(selectedSegment);
  const segmentRevision = usePlayback(s => s.segmentRevision);
  const status = usePlayback(s => s.status);
  const inspectorOpen = useUiStore(s => s.inspectorOpen);
  const toggleInspector = useUiStore(s => s.toggleInspector);
  const vp = useViewport();

  // Bump segment revision when segment id changes
  useEffect(() => {
    usePlayback.getState().bumpSegment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seg?.id]);

  // Auto-clear status
  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => usePlayback.getState().setStatus(null), 4000);
    return () => clearTimeout(t);
  }, [status]);

  if (!ev) return <EmptyState />;

  // Inspector inline only on truly wide displays (xl, ≥1440px) so a 1024px
  // laptop doesn't squeeze the video area down to ~380px wide.
  const showInspectorInline = vp.isWide && inspectorOpen;

  return (
    <section className="flex h-full min-h-0 flex-col gap-2 sm:gap-3">
      <EventHeader />

      {/* Insight strip — only on tablet+ to save vertical space on phones */}
      <div className="hidden md:block">
        <InsightStrip event={ev} />
      </div>

      <div className={clsx(
        "grid min-h-0 flex-1 gap-2 sm:gap-3",
        showInspectorInline
          ? "xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]"
          : "grid-cols-1",
      )}>
        <div className="flex min-w-0 min-h-0 flex-col gap-2 sm:gap-3">
          {/* Video grid fills the remaining vertical space. min-h guarantees
              a usable size even on very short viewports; main's
              overflow-y-auto provides scroll when that mandatory height
              plus the controls/timelines exceeds the viewport. */}
          <div className="min-h-[260px] flex-1 lg:min-h-[360px] min-w-0">
            <VideoGrid key={segmentRevision} segment={seg} />
          </div>

          {/* Controls */}
          <PlaybackControls
            onToggleInspector={toggleInspector}
            inspectorOpen={inspectorOpen}
          />

          {/* Combined segment + day timeline — single panel for compactness */}
          <CombinedTimeline />
        </div>

        {/* Inline inspector for desktop+ */}
        {showInspectorInline && (
          <aside className="scrollbar-thin flex max-h-full min-h-0 flex-col overflow-y-auto">
            <EventInspector />
          </aside>
        )}
      </div>

      {/* Inspector overlay for tablet/mobile */}
      {!vp.isDesktop && inspectorOpen && (
        <InspectorOverlay onClose={toggleInspector}>
          <EventInspector />
        </InspectorOverlay>
      )}

      {/* Toast */}
      {status && (
        <div
          role="status"
          className="glass-strong fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 max-w-[90vw] rounded-full px-4 py-2 text-center text-[13px] text-(--color-text) shadow-(--shadow-pop)"
        >
          {status}
        </div>
      )}
    </section>
  );
}

function InspectorOverlay({
  children, onClose,
}: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-[min(380px,88vw)] flex-col border-l border-(--color-border) bg-(--color-bg-1) shadow-(--shadow-pop)">
        <div className="flex items-center justify-between border-b border-(--color-border) px-3 py-2.5">
          <span className="text-[13px] font-semibold">Details</span>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-(--color-text-dim) hover:ov-05 hover:text-(--color-text)"
            aria-label="Close"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-3">
          {children}
        </div>
      </aside>
    </>
  );
}
