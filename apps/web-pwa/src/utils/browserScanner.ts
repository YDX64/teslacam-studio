/*  browserScanner — produce a Manifest in the browser, no backend.            */
/*                                                                              */
/*  Two input modes:                                                            */
/*    - fsa:   FileSystemDirectoryHandle (modern Chromium / showDirectoryPicker)*/
/*    - files: FileList from <input type="file" webkitdirectory> (legacy)      */
/*                                                                              */
/*  The output Manifest shape is identical to what server.py returns, so       */
/*  consumers (libraryStore, components) don't need to know the source.         */

import type {
  CameraKind,
  ClipCategory,
  ClipEvent,
  Manifest,
  Segment,
  VideoFile,
} from "../types";

const CLIP_NAME_RE = /^(\d{4}-\d{2}-\d{2}[_ -]\d{2}[-:]\d{2}[-:]\d{2})[-_ ](front|left_repeater|right_repeater|back|rear|cabin|main|wide|narrow|fisheye)\.(?:mp4|mov|m4v)$/i;

const CAMERA_ALIAS: Record<string, CameraKind> = {
  front: "front",
  rear: "back",
  back: "back",
  left_repeater: "left_repeater",
  right_repeater: "right_repeater",
  cabin: "cabin",
  main: "main",
  wide: "wide",
  narrow: "narrow",
  fisheye: "fisheye",
};

const REASON_LABELS: Record<string, string> = {
  sentry_aware_object_detection: "Sentry · object detection",
  sentry_aware_accel_primary: "Sentry · impact",
  user_interaction_honk: "Honk save",
  user_interaction_dashcam_panel_save: "Manual save",
  user_interaction_dashcam_icon_tapped: "Manual save (icon)",
};

const CATEGORIES: ClipCategory[] = ["RecentClips", "SavedClips", "SentryClips"];

interface RawClip {
  category: ClipCategory;
  eventFolderName: string | null;
  file: File;
  camera: CameraKind;
  timestamp: string;
  tsKey: string;
}

interface RawEventJson {
  timestamp?: string;
  city?: string;
  est_city?: string;
  reason?: string;
  est_lat?: string | number;
  est_lon?: string | number;
  latitude?: string | number;
  longitude?: string | number;
  lat?: string | number;
  lon?: string | number;
  camera?: string | number;
}

export type ScannerInput =
  | { kind: "fsa"; handle: FileSystemDirectoryHandle }
  | { kind: "files"; files: FileList };

export interface ScanResult {
  manifest: Manifest;
  dispose(): void;
}

export async function scanBrowserSource(input: ScannerInput): Promise<ScanResult> {
  const blobUrls = new Set<string>();
  const objectUrlFor = (file: File): string => {
    const url = URL.createObjectURL(file);
    blobUrls.add(url);
    return url;
  };

  const clips: RawClip[] = [];
  const eventJson = new Map<string, RawEventJson>();

  if (input.kind === "fsa") {
    await walkFsa(input.handle, clips, eventJson);
  } else {
    await walkFileList(input.files, clips, eventJson);
  }

  const events: ClipEvent[] = [];

  for (const category of CATEGORIES) {
    if (category === "RecentClips") continue;
    const byFolder = new Map<string, RawClip[]>();
    for (const c of clips) {
      if (c.category !== category || !c.eventFolderName) continue;
      const k = c.eventFolderName;
      const arr = byFolder.get(k) ?? [];
      arr.push(c);
      byFolder.set(k, arr);
    }
    const folderNames = Array.from(byFolder.keys()).sort();
    for (const folder of folderNames) {
      const arr = byFolder.get(folder)!;
      const minutes = collectMinutes(arr, objectUrlFor);
      if (minutes.length === 0) continue;
      const metaKey = `${category}/${folder}`;
      const meta = eventJson.get(metaKey) ?? {};
      events.push(makeEventFromFolder(category, folder, meta, minutes));
    }
  }

  const recent = clips.filter(c => c.category === "RecentClips");
  if (recent.length > 0) {
    const minutes = collectMinutes(recent, objectUrlFor);
    const groups = groupByGap(minutes, 125);
    groups.forEach((g, i) => {
      events.push(makeRecentEvent(i, g));
    });
  }

  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const stats = {
    saved_count: events.filter(e => e.category === "SavedClips").length,
    sentry_count: events.filter(e => e.category === "SentryClips").length,
    recent_count: events.filter(e => e.category === "RecentClips").length,
    total_minutes: events.reduce((s, e) => s + e.minute_count, 0),
  };

  const label =
    input.kind === "fsa" ? input.handle.name :
    deriveFileListLabel(input.files);

  const manifest: Manifest = {
    root: label,
    events,
    stats,
    generated_at: new Date().toISOString(),
  };

  return {
    manifest,
    dispose() {
      for (const url of blobUrls) URL.revokeObjectURL(url);
      blobUrls.clear();
    },
  };
}

/* -------------------------------- walkers ------------------------------- */

async function walkFsa(
  root: FileSystemDirectoryHandle,
  out: RawClip[],
  eventJson: Map<string, RawEventJson>,
): Promise<void> {
  const directChildren = new Map<string, FileSystemDirectoryHandle>();
  for await (const [name, handle] of iterateDir(root)) {
    if (handle.kind === "directory") directChildren.set(name, handle as FileSystemDirectoryHandle);
  }

  let teslaRoot: FileSystemDirectoryHandle = root;
  if (
    !directChildren.has("RecentClips") &&
    !directChildren.has("SavedClips") &&
    !directChildren.has("SentryClips")
  ) {
    const sub = directChildren.get("TeslaCam");
    if (sub) {
      teslaRoot = sub;
      directChildren.clear();
      for await (const [name, handle] of iterateDir(teslaRoot)) {
        if (handle.kind === "directory") directChildren.set(name, handle as FileSystemDirectoryHandle);
      }
    }
  }

  for (const category of CATEGORIES) {
    const dir = directChildren.get(category);
    if (!dir) continue;
    if (category === "RecentClips") {
      for await (const [name, child] of iterateDir(dir)) {
        if (child.kind !== "file") continue;
        const parsed = parseClipName(name);
        if (!parsed) continue;
        const file = await (child as FileSystemFileHandle).getFile();
        out.push({ category, eventFolderName: null, file, ...parsed });
      }
    } else {
      for await (const [eventName, eventDir] of iterateDir(dir)) {
        if (eventDir.kind !== "directory") continue;
        for await (const [fileName, fh] of iterateDir(eventDir as FileSystemDirectoryHandle)) {
          if (fh.kind !== "file") continue;
          if (fileName === "event.json") {
            try {
              const text = await (await (fh as FileSystemFileHandle).getFile()).text();
              const json = JSON.parse(text) as RawEventJson;
              eventJson.set(`${category}/${eventName}`, json);
            } catch { /* ignore */ }
            continue;
          }
          const parsed = parseClipName(fileName);
          if (!parsed) continue;
          const file = await (fh as FileSystemFileHandle).getFile();
          out.push({ category, eventFolderName: eventName, file, ...parsed });
        }
      }
    }
  }
}

async function* iterateDir(
  dir: FileSystemDirectoryHandle,
): AsyncGenerator<[string, FileSystemHandle], void, void> {
  const anyDir = dir as unknown as {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  };
  for await (const entry of anyDir.entries()) {
    yield entry;
  }
}

async function walkFileList(
  files: FileList,
  out: RawClip[],
  eventJson: Map<string, RawEventJson>,
): Promise<void> {
  const eventJsonFiles: Array<[string, File]> = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || "";
    const parts = rel.split("/");
    if (parts.length < 2) continue;

    let categoryIdx = -1;
    let category: ClipCategory | null = null;
    for (let p = 0; p < parts.length; p++) {
      if ((CATEGORIES as readonly string[]).includes(parts[p])) {
        category = parts[p] as ClipCategory;
        categoryIdx = p;
        break;
      }
    }
    if (!category || categoryIdx === -1) continue;

    if (category === "RecentClips") {
      const fileName = parts[parts.length - 1];
      const parsed = parseClipName(fileName);
      if (!parsed) continue;
      out.push({ category, eventFolderName: null, file: f, ...parsed });
    } else {
      const eventName = parts[categoryIdx + 1];
      const fileName = parts[parts.length - 1];
      if (!eventName || !fileName) continue;
      if (fileName === "event.json") {
        eventJsonFiles.push([`${category}/${eventName}`, f]);
        continue;
      }
      const parsed = parseClipName(fileName);
      if (!parsed) continue;
      out.push({ category, eventFolderName: eventName, file: f, ...parsed });
    }
  }

  await Promise.all(eventJsonFiles.map(async ([key, file]) => {
    try {
      const text = await file.text();
      eventJson.set(key, JSON.parse(text));
    } catch { /* ignore */ }
  }));
}

/* -------------------------------- builders ----------------------------- */

function collectMinutes(
  clips: RawClip[],
  objectUrlFor: (f: File) => string,
): Segment[] {
  const minutes = new Map<string, Segment>();
  for (const c of clips) {
    let seg = minutes.get(c.tsKey);
    if (!seg) {
      seg = {
        id: c.tsKey,
        timestamp: c.timestamp,
        ts_key: c.tsKey,
        cameras: {},
      };
      minutes.set(c.tsKey, seg);
    }
    const video: VideoFile = {
      url: objectUrlFor(c.file),
      size: c.file.size,
      name: c.file.name,
    };
    seg.cameras[c.camera] = video;
  }
  return Array.from(minutes.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function makeEventFromFolder(
  category: ClipCategory,
  folder: string,
  meta: RawEventJson,
  minutes: Segment[],
): ClipEvent {
  const reason = (meta.reason as string) || "";
  return {
    id: `${category}/${folder}`,
    category,
    folder,
    title: makeTitle(category, meta, minutes),
    timestamp: meta.timestamp || minutes[0].timestamp,
    first_clip: minutes[0].ts_key,
    city: (meta.city || meta.est_city || "") as string,
    lat: toFloat(meta.est_lat ?? meta.latitude ?? meta.lat),
    lon: toFloat(meta.est_lon ?? meta.longitude ?? meta.lon),
    reason,
    reason_label: REASON_LABELS[reason] || (reason ? reason.replace(/_/g, " ") : ""),
    trigger_camera: String(meta.camera ?? ""),
    minute_count: minutes.length,
    minutes,
    raw_metadata: meta as unknown as Record<string, unknown>,
  };
}

function makeRecentEvent(index: number, group: Segment[]): ClipEvent {
  return {
    id: `RecentClips/auto-${index}`,
    category: "RecentClips",
    folder: "RecentClips",
    title: makeTitle("Recent" as ClipCategory, {}, group),
    timestamp: group[0].timestamp,
    first_clip: group[0].ts_key,
    city: "",
    lat: null,
    lon: null,
    reason: "recent",
    reason_label: "Continuous recording",
    trigger_camera: "",
    minute_count: group.length,
    minutes: group,
    raw_metadata: {},
  };
}

function makeTitle(category: ClipCategory | "Recent", meta: RawEventJson, minutes: Segment[]): string {
  const first = new Date(minutes[0].timestamp);
  const last = new Date(minutes[minutes.length - 1].timestamp);
  const city = ((meta.city as string) || (meta.est_city as string) || "").trim();
  const when = formatDate(first);
  const endTime = formatTime(last);
  const base = minutes.length > 1 ? `${when}–${endTime}` : when;
  if (city) return `${city} · ${base}`;
  return `${category} · ${base}`;
}

function formatDate(d: Date): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const day = String(d.getDate()).padStart(2, "0");
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year} · ${hh}:${mm}`;
}

function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function groupByGap(minutes: Segment[], maxGapSeconds: number): Segment[][] {
  if (minutes.length === 0) return [];
  const out: Segment[][] = [];
  let current: Segment[] = [minutes[0]];
  for (let i = 1; i < minutes.length; i++) {
    const prev = new Date(current[current.length - 1].timestamp).getTime();
    const cur = new Date(minutes[i].timestamp).getTime();
    if ((cur - prev) / 1000 > maxGapSeconds) {
      out.push(current);
      current = [];
    }
    current.push(minutes[i]);
  }
  if (current.length) out.push(current);
  return out;
}

/* -------------------------------- parsing ----------------------------- */

function parseClipName(name: string): { camera: CameraKind; timestamp: string; tsKey: string } | null {
  const m = name.match(CLIP_NAME_RE);
  if (!m) return null;
  const tsRaw = m[1];
  const camRaw = m[2].toLowerCase();
  const norm = tsRaw.replace(/[_: ]/g, "-");
  const parts = norm.split("-");
  if (parts.length !== 6) return null;
  const iso = `${parts[0]}-${parts[1]}-${parts[2]}T${parts[3]}:${parts[4]}:${parts[5]}`;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  const tsKey = `${parts[0]}-${parts[1]}-${parts[2]}_${parts[3]}-${parts[4]}-${parts[5]}`;
  const camera = CAMERA_ALIAS[camRaw];
  if (!camera) return null;
  return { camera, timestamp: iso, tsKey };
}

function toFloat(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function deriveFileListLabel(files: FileList): string {
  if (files.length === 0) return "Local folder";
  const rel = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath || "";
  const first = rel.split("/")[0];
  return first || "Local folder";
}
