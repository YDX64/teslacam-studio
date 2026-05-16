/*  EventWorkspace — the right-hand main pane assembled from header, insight   */
/*  strip, video grid, controls, and bottom timelines + inspector.             */

import clsx from "clsx";
import {
  selectedEvent,
  selectedSegment,
  useLibrary,
} from "../stores/libraryStore";
import { usePlayback } from "../stores/playbackStore";
import { EventHeader } from "./EventHeader";
import { InsightStrip } from "./InsightStrip";
import { VideoGrid } from "./VideoGrid";
import { PlaybackControls } from "./PlaybackControls";
import { DayTimeline, SegmentTimeline } from "./Timelines";
import { EventInspector } from "./EventInspector";
import { EmptyState } from "./EmptyState";
import { useEffect, useState } from "react";

export function EventWorkspace() {
  const ev = useLibrary(selectedEvent);
  const seg = useLibrary(selectedSegment);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const segmentRevision = usePlayback(s => s.segmentRevision);
  const status = usePlayback(s => s.status);

  // Bump segment revision whenever the segment id changes (selectSegment, prev/next, etc.)
  useEffect(() => {
    usePlayback.getState().bumpSegment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seg?.id]);

  // Auto-clear status after 4s
  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => usePlayback.getState().setStatus(null), 4000);
    return () => clearTimeout(t);
  }, [status]);

  if (!ev) return <EmptyState />;

  return (
    <section className="flex h-full min-h-0 flex-col gap-3">
      <EventHeader />
      <InsightStrip event={ev} />

      <div className={clsx(
        "grid min-h-0 flex-1 gap-3",
        inspectorOpen ? "grid-cols-[1fr_320px]" : "grid-cols-1",
      )}>
        <div className="flex min-h-0 flex-col gap-3">
          <div className="min-h-[240px] flex-1">
            <VideoGrid key={segmentRevision} segment={seg} />
          </div>
          <PlaybackControls
            onToggleInspector={() => setInspectorOpen(v => !v)}
            inspectorOpen={inspectorOpen}
          />
          <SegmentTimeline />
          <DayTimeline />
        </div>

        {inspectorOpen && <EventInspector />}
      </div>

      {/* Toast */}
      {status && (
        <div
          role="status"
          className="glass-strong fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-[13px] text-(--color-text) shadow-(--shadow-pop)"
        >
          {status}
        </div>
      )}
    </section>
  );
}
