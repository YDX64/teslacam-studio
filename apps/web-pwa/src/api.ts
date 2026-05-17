/*  Backend client — calls into the local Python server.                       */

import type {
  ExportEventPayload,
  ExportReportPayload,
  ExportSegmentPayload,
  ExportSnapshotPayload,
  Manifest,
} from "./types";

const BASE = "";  // Vite proxies /api and /media to the Python backend

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { cache: "no-store", ...init });
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

export interface HealthResponse {
  ok: boolean;
  root: string | null;
}

export const api = {
  /** Returns true iff the backend is reachable, false otherwise. Never throws. */
  async ping(timeoutMs = 1200): Promise<boolean> {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      const res = await fetch(BASE + "/api/health", { cache: "no-store", signal: ctl.signal });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  },

  health(): Promise<HealthResponse> {
    return getJson<HealthResponse>("/api/health");
  },

  suggestions(): Promise<{ paths: string[] }> {
    return getJson("/api/suggestions");
  },

  scan(root: string): Promise<{ ok: boolean; root: string }> {
    return postJson("/api/scan", { root });
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
