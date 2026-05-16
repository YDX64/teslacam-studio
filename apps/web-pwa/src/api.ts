/*  Backend client — calls into the local Python server.                       */

import type {
  ExportEventPayload,
  ExportReportPayload,
  ExportSegmentPayload,
  ExportSnapshotPayload,
  Manifest,
} from "./types";

const BASE = "";  // Vite proxies /api and /media to the Python backend

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `${path} → HTTP ${res.status}`);
  return data;
}

export const api = {
  health(): Promise<{ ok: boolean; root: string }> {
    return getJson("/api/health");
  },

  manifest(): Promise<Manifest> {
    return getJson("/api/manifest");
  },

  exportSnapshot(payload: ExportSnapshotPayload) {
    return postJson<{ ok: boolean; path: string }>("/api/export/snapshot", payload);
  },

  exportEvent(payload: ExportEventPayload) {
    return postJson<{ ok: boolean; path: string }>("/api/export/event", payload);
  },

  exportSegment(payload: ExportSegmentPayload) {
    return postJson<{ ok: boolean; path: string }>("/api/export/segment", payload);
  },

  exportReport(payload: ExportReportPayload) {
    return postJson<{ ok: boolean; path: string }>("/api/export/report", payload);
  },

  reveal(rel_path: string) {
    return postJson<{ ok: boolean }>("/api/reveal", { rel_path });
  },
};
