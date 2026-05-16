/*  Domain types shared across UI and stores.                                  */
/*  Kept identical to the Python backend's manifest schema and the Swift core. */

export type ClipCategory = "RecentClips" | "SavedClips" | "SentryClips";

export type CameraKind =
  | "front"
  | "left_repeater"
  | "right_repeater"
  | "back"
  | "cabin"
  | "main"
  | "wide"
  | "narrow"
  | "fisheye";

export const ALL_CAMERAS: CameraKind[] = [
  "front",
  "left_repeater",
  "right_repeater",
  "back",
  "cabin",
  "main",
  "wide",
  "narrow",
  "fisheye",
];

export const CAMERA_LABEL: Record<CameraKind, string> = {
  front: "Front",
  left_repeater: "Left",
  right_repeater: "Right",
  back: "Back",
  cabin: "Cabin",
  main: "Main",
  wide: "Wide",
  narrow: "Narrow",
  fisheye: "Fisheye",
};

export const CAMERA_SORT: Record<CameraKind, number> = {
  front: 0,
  main: 1,
  left_repeater: 2,
  right_repeater: 3,
  back: 4,
  cabin: 5,
  wide: 6,
  narrow: 7,
  fisheye: 8,
};

export interface VideoFile {
  url: string;       // absolute path under /media/...
  size: number;
  name: string;
}

export interface Segment {
  id: string;
  ts_key: string;          // "YYYY-MM-DD_HH-MM-SS"
  timestamp: string;       // ISO 8601
  cameras: Partial<Record<CameraKind, VideoFile>>;
}

export interface ClipEvent {
  id: string;
  category: ClipCategory;
  folder: string;
  title: string;
  timestamp: string;       // ISO 8601
  first_clip: string;
  city: string;
  lat: number | null;
  lon: number | null;
  reason: string;
  reason_label: string;
  trigger_camera: string;
  minute_count: number;
  minutes: Segment[];
  raw_metadata: Record<string, unknown>;
}

export interface ManifestStats {
  saved_count: number;
  sentry_count: number;
  recent_count: number;
  total_minutes: number;
}

export interface Manifest {
  root: string;
  events: ClipEvent[];
  stats: ManifestStats;
  generated_at: string;
}

export type AdvanceScope = "event" | "day" | "library";
export type LayoutMode = "studio" | "triptych" | "theater" | "mosaic";
export type RenderMode = "performance" | "all";

export interface RangeMarkers {
  start: number | null;
  end: number | null;
}

export interface ExportSnapshotPayload {
  event_title: string;
  timestamp: string;
  camera: CameraKind;
  data_url: string;
}

export interface ExportEventPayload {
  event_id: string;
  event_title: string;
  minutes?: Segment[];
}

export interface ExportSegmentPayload {
  event_title: string;
  minute: Segment;
}

export interface ExportReportPayload {
  event: ClipEvent;
  range?: RangeMarkers;
}

/* --------------------------- helpers ----------------------------------- */

export function camerasInSegment(seg: Segment): CameraKind[] {
  return (Object.keys(seg.cameras) as CameraKind[]).sort(
    (a, b) => (CAMERA_SORT[a] ?? 99) - (CAMERA_SORT[b] ?? 99),
  );
}

export function expectedCoverage(event: ClipEvent): CameraKind[] {
  const present = new Set<CameraKind>();
  for (const seg of event.minutes) {
    for (const cam of Object.keys(seg.cameras) as CameraKind[]) {
      present.add(cam);
    }
  }
  if (present.has("front") || present.has("left_repeater") || present.has("right_repeater")) {
    return (["front", "left_repeater", "right_repeater", "back"] as CameraKind[])
      .filter(c => present.has(c));
  }
  return Array.from(present).sort(
    (a, b) => (CAMERA_SORT[a] ?? 99) - (CAMERA_SORT[b] ?? 99),
  );
}

export function cameraCoverage(event: ClipEvent): Record<CameraKind, number> {
  const counts: Partial<Record<CameraKind, number>> = {};
  for (const seg of event.minutes) {
    for (const cam of Object.keys(seg.cameras) as CameraKind[]) {
      counts[cam] = (counts[cam] ?? 0) + 1;
    }
  }
  return counts as Record<CameraKind, number>;
}

export function missingCameraCount(event: ClipEvent): number {
  const expected = expectedCoverage(event);
  if (expected.length === 0) return 0;
  let missing = 0;
  for (const seg of event.minutes) {
    for (const cam of expected) {
      if (!seg.cameras[cam]) missing++;
    }
  }
  return missing;
}

export function coveragePercent(event: ClipEvent): number {
  const expected = expectedCoverage(event);
  if (expected.length === 0 || event.minutes.length === 0) return 100;
  const possible = expected.length * event.minutes.length;
  const present = expected.reduce(
    (sum, cam) => sum + (cameraCoverage(event)[cam] ?? 0),
    0,
  );
  return Math.min(100, Math.round((present / possible) * 100));
}

export function eventTotalBytes(event: ClipEvent): number {
  let total = 0;
  for (const seg of event.minutes) {
    for (const cam of Object.keys(seg.cameras) as CameraKind[]) {
      total += seg.cameras[cam]?.size ?? 0;
    }
  }
  return total;
}

export function eventStart(event: ClipEvent): Date {
  return new Date(event.timestamp);
}

export function eventEnd(event: ClipEvent): Date {
  const last = event.minutes[event.minutes.length - 1];
  if (!last) return new Date(event.timestamp);
  return new Date(new Date(last.timestamp).getTime() + 60_000);
}

export function eventDurationSeconds(event: ClipEvent): number {
  return Math.max(60, (eventEnd(event).getTime() - eventStart(event).getTime()) / 1000);
}
