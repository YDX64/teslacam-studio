/*  EventInspector — metadata panel, GPS map, per-camera coverage bars,         */
/*  current segment file list, range markers, raw event.json.                  */

import { useEffect, useMemo, useRef } from "react";
import clsx from "clsx";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  selectedEvent,
  selectedSegment,
  useLibrary,
} from "../stores/libraryStore";
import { useBookmarks } from "../stores/bookmarkStore";
import { usePlayback } from "../stores/playbackStore";
import {
  CAMERA_LABEL,
  cameraCoverage,
  camerasInSegment,
  eventDurationSeconds,
  eventTotalBytes,
  expectedCoverage,
  type CameraKind,
  type ClipEvent,
  type Segment,
} from "../types";
import { formatBytes, formatDuration, formatTime } from "../utils/format";
import { BookmarkIcon, BookmarkLineIcon, MapIcon } from "./Icons";

export function EventInspector() {
  const ev = useLibrary(selectedEvent);
  const seg = useLibrary(selectedSegment);

  if (!ev) return null;

  return (
    <aside className="scrollbar-thin flex h-full flex-col gap-3 overflow-y-auto rounded-2xl">
      <SectionTitle title="Metadata" />
      <MetadataCard event={ev} />

      <SectionTitle title="Camera coverage" />
      <CoverageCard event={ev} />

      {seg && (
        <>
          <SectionTitle title="Current segment" />
          <SegmentCard event={ev} segment={seg} />
        </>
      )}

      <RangePanel />

      {ev.lat != null && ev.lon != null && (
        <>
          <SectionTitle title="Location" />
          <MapCard event={ev} />
        </>
      )}

      <SectionTitle title="Raw event.json" />
      <RawJsonCard event={ev} />
    </aside>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h3 className="px-1 text-[10px] font-bold uppercase tracking-[1.7px] text-(--color-text-faint)">
      {title}
    </h3>
  );
}

function MetadataCard({ event }: { event: ClipEvent }) {
  const rows: { k: string; v: React.ReactNode }[] = [
    { k: "Category", v: event.category },
    { k: "Folder",   v: <span className="font-mono text-[11px]">{event.folder}</span> },
    { k: "First clip", v: <span className="font-mono text-[11px]">{event.first_clip}</span> },
    { k: "Duration", v: formatDuration(eventDurationSeconds(event)) },
    { k: "Total size", v: formatBytes(eventTotalBytes(event)) },
    { k: "Segments", v: `${event.minutes.length} minutes` },
  ];
  if (event.city) rows.push({ k: "City", v: event.city });
  if (event.reason_label) rows.push({ k: "Reason", v: event.reason_label });
  if (event.trigger_camera) rows.push({ k: "Trigger cam", v: event.trigger_camera });
  if (event.lat != null && event.lon != null) {
    rows.push({ k: "Coords", v: <span className="font-mono text-[11px]">{event.lat.toFixed(4)}, {event.lon.toFixed(4)}</span> });
  }

  return (
    <div className="glass rounded-xl px-3.5 py-3">
      <dl className="grid grid-cols-[88px_1fr] gap-y-1.5 text-[12px]">
        {rows.map(r => (
          <Row key={r.k} k={r.k}>{r.v}</Row>
        ))}
      </dl>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-(--color-text-faint)">{k}</dt>
      <dd className="select-text text-(--color-text) break-words">{children}</dd>
    </>
  );
}

function CoverageCard({ event }: { event: ClipEvent }) {
  const coverage = useMemo(() => cameraCoverage(event), [event]);
  const expected = useMemo(() => expectedCoverage(event), [event]);

  return (
    <div className="glass space-y-1.5 rounded-xl px-3.5 py-3 text-[12px]">
      {expected.map(cam => {
        const count = coverage[cam] ?? 0;
        const pct = event.minutes.length > 0 ? (count / event.minutes.length) * 100 : 0;
        return (
          <div key={cam} className="grid grid-cols-[70px_1fr_50px] items-center gap-2">
            <span className="text-(--color-text-dim)">{CAMERA_LABEL[cam]}</span>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full bg-gradient-to-r from-(--color-accent) to-(--color-accent-2) transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-right font-mono tabular-nums text-(--color-text-faint)">
              {count}/{event.minutes.length}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SegmentCard({ event, segment }: { event: ClipEvent; segment: Segment }) {
  const cams = camerasInSegment(segment);
  const totalBytes = cams.reduce((s, c) => s + (segment.cameras[c]?.size ?? 0), 0);
  const bookmarks = useBookmarks();
  const isBookmarked = bookmarks.has(event.id, segment.id);

  return (
    <div className="glass space-y-2 rounded-xl px-3.5 py-3 text-[12px]">
      <Row k="Time">{new Date(segment.timestamp).toLocaleTimeString()}</Row>
      <Row k="Cameras">{cams.length} present</Row>
      <Row k="Size">{formatBytes(totalBytes)}</Row>

      <ul className="mt-1.5 space-y-1">
        {cams.map(cam => {
          const file = segment.cameras[cam];
          if (!file) return null;
          return (
            <li
              key={cam}
              className="flex items-center justify-between rounded-md bg-white/[0.03] px-2 py-1 text-[11px]"
              data-camera={cam}
            >
              <span className="text-(--color-text-dim)">{CAMERA_LABEL[cam]}</span>
              <span className="font-mono tabular-nums text-(--color-text-faint)">
                {formatBytes(file.size)}
              </span>
            </li>
          );
        })}
      </ul>

      <button
        onClick={() => bookmarks.toggle(event.id, segment.id)}
        className={clsx(
          "mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] transition",
          isBookmarked
            ? "border-(--color-warning)/40 bg-(--color-warning)/12 text-(--color-warning)"
            : "border-(--color-border) text-(--color-text-dim) hover:border-(--color-border-strong) hover:text-(--color-text)",
        )}
      >
        {isBookmarked ? <BookmarkIcon className="h-3.5 w-3.5" /> : <BookmarkLineIcon className="h-3.5 w-3.5" />}
        {isBookmarked ? "Bookmarked" : "Bookmark segment"}
      </button>
    </div>
  );
}

function RangePanel() {
  const rangeStart = usePlayback(s => s.rangeStart);
  const rangeEnd = usePlayback(s => s.rangeEnd);
  if (rangeStart == null && rangeEnd == null) return null;
  return (
    <>
      <SectionTitle title="Range markers" />
      <div className="glass space-y-1.5 rounded-xl px-3.5 py-3 text-[12px]">
        <Row k="In point">{rangeStart != null ? formatTime(rangeStart) : "—"}</Row>
        <Row k="Out point">{rangeEnd != null ? formatTime(rangeEnd) : "—"}</Row>
        {rangeStart != null && rangeEnd != null && (
          <Row k="Length">{formatTime(Math.max(0, rangeEnd - rangeStart))}</Row>
        )}
      </div>
    </>
  );
}

function MapCard({ event }: { event: ClipEvent }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!mapRef.current) {
      mapRef.current = L.map(ref.current, {
        zoomControl: false,
        attributionControl: true,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(mapRef.current);
      L.control.zoom({ position: "topright" }).addTo(mapRef.current);
    }

    if (event.lat != null && event.lon != null) {
      mapRef.current.setView([event.lat, event.lon], 15, { animate: true });
      if (markerRef.current) markerRef.current.remove();
      const div = document.createElement("div");
      div.style.cssText =
        "width:18px;height:18px;border-radius:50%;background:#5b8def;border:3px solid #fff;box-shadow:0 0 0 6px rgba(91,141,239,0.3),0 0 18px rgba(91,141,239,0.8);";
      const icon = L.divIcon({
        className: "",
        html: div.outerHTML,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      markerRef.current = L.marker([event.lat, event.lon], { icon }).addTo(mapRef.current);
      markerRef.current.bindPopup(
        `<strong>${escapeHtml(event.city || "Event")}</strong><br>${escapeHtml(event.reason_label || "")}`,
      );
    }

    // Defer resize after the container has its real size
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 150);
    return () => clearTimeout(t);
  }, [event.id, event.lat, event.lon]);

  return (
    <div className="glass relative overflow-hidden rounded-xl">
      <div ref={ref} className="h-44 w-full" />
      <a
        href={`https://maps.apple.com/?ll=${event.lat},${event.lon}`}
        target="_blank"
        rel="noopener"
        className="absolute right-2 bottom-2 z-[400] inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] text-white backdrop-blur"
      >
        <MapIcon className="h-3 w-3" /> Open in Maps
      </a>
    </div>
  );
}

function RawJsonCard({ event }: { event: ClipEvent }) {
  if (!event.raw_metadata || Object.keys(event.raw_metadata).length === 0) {
    return (
      <div className="glass rounded-xl px-3.5 py-3 text-[11px] text-(--color-text-faint)">
        No event.json for this event.
      </div>
    );
  }
  return (
    <details className="glass group rounded-xl">
      <summary className="cursor-pointer list-none px-3.5 py-2 text-[11px] text-(--color-text-dim) hover:text-(--color-text)">
        Show JSON ▾
      </summary>
      <pre className="scrollbar-thin max-h-44 overflow-auto border-t border-(--color-border) px-3.5 py-2 font-mono text-[10px] leading-snug text-(--color-text-dim)">
        {JSON.stringify(event.raw_metadata, null, 2)}
      </pre>
    </details>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);
}

/* Re-exported for convenient access from elsewhere if needed */
export { selectedEvent, selectedSegment };

/* eslint-disable @typescript-eslint/no-unused-vars */
function _kCheck(_c: CameraKind) { /* compile-time check */ }
