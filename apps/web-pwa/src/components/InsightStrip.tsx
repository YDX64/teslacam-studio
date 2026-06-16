/*  InsightStrip — coverage, missing views, bookmarks, mini heatmap.           */

import { useMemo } from "react";
import clsx from "clsx";
import { useBookmarks } from "../stores/bookmarkStore";
import {
  camerasInSegment,
  coveragePercent,
  expectedCoverage,
  missingCameraCount,
  type ClipEvent,
} from "../types";
import { BookmarkIcon, FilmIcon, ShieldIcon, StackIcon } from "./Icons";

export function InsightStrip({ event }: { event: ClipEvent }) {
  const bookmarks = useBookmarks();
  const segmentIds = useMemo(() => event.minutes.map(m => m.id), [event]);
  const bmCount = bookmarks.countIn(event.id, segmentIds);
  const coverage = useMemo(() => coveragePercent(event), [event]);
  const missing = useMemo(() => missingCameraCount(event), [event]);
  const expected = useMemo(() => expectedCoverage(event), [event]);

  const coverageTone =
    coverage >= 90 ? "text-(--color-success) bg-(--color-success)/10"
    : coverage >= 65 ? "text-(--color-warning) bg-(--color-warning)/10"
    : "text-(--color-danger) bg-(--color-danger)/10";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Card
        icon={<ShieldIcon className="h-4 w-4" />}
        label="Coverage"
        value={`${coverage}%`}
        toneClass={coverageTone}
      />
      <Card
        icon={<FilmIcon className="h-4 w-4" />}
        label="Missing"
        value={`${missing}`}
        toneClass={missing === 0
          ? "text-(--color-success) bg-(--color-success)/10"
          : "text-(--color-warning) bg-(--color-warning)/10"}
      />
      <Card
        icon={<BookmarkIcon className="h-4 w-4" />}
        label="Bookmarks"
        value={`${bmCount}`}
        toneClass="text-(--color-warning) bg-(--color-warning)/10"
      />
      <Card
        icon={<StackIcon className="h-4 w-4" />}
        label="Segments"
        value={`${event.minutes.length}`}
        toneClass="text-(--color-accent-2) bg-(--color-accent)/10"
      />
      <Heatmap event={event} expectedLen={expected.length} />
    </div>
  );
}

function Card({
  icon, label, value, toneClass,
}: { icon: React.ReactNode; label: string; value: string; toneClass: string }) {
  return (
    <div className="glass flex items-center gap-2 rounded-xl px-2.5 py-2">
      <div className={clsx("grid h-7 w-7 place-items-center rounded-lg", toneClass)}>
        {icon}
      </div>
      <div className="leading-tight">
        <div className="text-[13px] font-semibold tabular-nums text-(--color-text)">{value}</div>
        <div className="text-[10px] uppercase tracking-[1.5px] text-(--color-text-faint)">{label}</div>
      </div>
    </div>
  );
}

function Heatmap({ event, expectedLen }: { event: ClipEvent; expectedLen: number }) {
  return (
    <div className="glass ml-auto flex min-w-[180px] flex-1 items-center gap-2 rounded-xl px-3 py-2">
      <div className="text-[10px] uppercase tracking-[1.5px] text-(--color-text-faint)">
        Coverage map
      </div>
      <div className="flex flex-1 gap-[2px]">
        {event.minutes.slice(0, 60).map(seg => {
          const cams = camerasInSegment(seg).length;
          const ratio = expectedLen > 0 ? cams / expectedLen : 1;
          const color =
            ratio === 1 ? "bg-(--color-success)"
            : ratio >= 0.5 ? "bg-(--color-warning)"
            : ratio > 0 ? "bg-(--color-danger)"
            : "ov-10";
          return (
            <span
              key={seg.id}
              className={clsx("h-5 flex-1 rounded-[2px]", color)}
              title={`${seg.ts_key} · ${cams}/${expectedLen}`}
            />
          );
        })}
      </div>
    </div>
  );
}
