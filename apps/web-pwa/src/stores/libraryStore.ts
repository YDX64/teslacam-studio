/*  Library store — manages event list, filters, current selection.            */
/*                                                                              */
/*  Source-agnostic: the manifest can come from the Python backend or from     */
/*  the in-browser scanner. Downstream code never branches on source.           */

import { create } from "zustand";
import type { ClipCategory, ClipEvent, Manifest, Segment } from "../types";
import { api } from "../api";
import { scanBrowserSource, type ScanResult } from "../utils/browserScanner";
import {
  loadHandle,
  pushHistory,
  randomId,
  readStoredSource,
  saveHandle,
  writeStoredSource,
  type StoredSource,
} from "../utils/sourceHistory";

export type LibrarySource =
  | { kind: "backend"; root: string }
  | { kind: "browser-fsa"; handle: FileSystemDirectoryHandle; label: string; handleId: string }
  | { kind: "browser-files"; files: FileList; label: string };

interface LibraryState {
  manifest: Manifest | null;
  source: LibrarySource | null;
  isLoading: boolean;
  error: string | null;
  pickerOpen: boolean;

  search: string;
  category: ClipCategory | "all";
  selectedDay: string | null;
  selectedEventId: string | null;
  selectedSegmentId: string | null;

  init(): Promise<void>;
  setSource(source: LibrarySource): Promise<void>;
  clearSource(): void;
  reload(): Promise<void>;
  openPicker(): void;
  closePicker(): void;

  setSearch(q: string): void;
  setCategory(c: ClipCategory | "all"): void;
  setDay(day: string | null): void;
  selectEvent(id: string | null): void;
  selectSegment(eventId: string, segmentId: string): void;
  nextSegment(scope: "event" | "day" | "library", wrap: boolean): boolean;
  prevSegment(scope: "event" | "day" | "library", wrap: boolean): boolean;
}

let currentScan: ScanResult | null = null;

export const useLibrary = create<LibraryState>((set, get) => ({
  manifest: null,
  source: null,
  isLoading: false,
  error: null,
  pickerOpen: false,
  search: "",
  category: "all",
  selectedDay: null,
  selectedEventId: null,
  selectedSegmentId: null,

  async init() {
    const stored = readStoredSource();
    if (!stored) {
      set({ pickerOpen: true });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const restored = await restoreSource(stored);
      if (restored) {
        await applySource(set, get, restored);
        set({ pickerOpen: false });
      } else {
        set({ isLoading: false, pickerOpen: true });
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      set({ error, isLoading: false, pickerOpen: true });
    }
  },

  async setSource(source) {
    set({ isLoading: true, error: null });
    try {
      await applySource(set, get, source);
      set({ pickerOpen: false });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      set({ error, isLoading: false });
      throw e;
    }
  },

  clearSource() {
    disposeCurrentScan();
    set({
      source: null,
      manifest: null,
      selectedEventId: null,
      selectedSegmentId: null,
      selectedDay: null,
      pickerOpen: true,
    });
    writeStoredSource(null);
  },

  async reload() {
    const s = get().source;
    if (!s) return;
    await applySource(set, get, s);
  },

  openPicker() { set({ pickerOpen: true }); },
  closePicker() { set({ pickerOpen: false }); },

  setSearch(q) { set({ search: q }); },
  setCategory(c) { set({ category: c }); },
  setDay(day) { set({ selectedDay: day }); },

  selectEvent(id) {
    if (!id) {
      set({ selectedEventId: null, selectedSegmentId: null });
      return;
    }
    const event = get().manifest?.events.find(e => e.id === id);
    if (!event) return;
    set({
      selectedEventId: id,
      selectedSegmentId: event.minutes[0]?.id ?? null,
      selectedDay: dayKey(event.timestamp),
    });
  },

  selectSegment(eventId, segmentId) {
    set({ selectedEventId: eventId, selectedSegmentId: segmentId });
  },

  nextSegment(scope, wrap) { return moveSegment(get, set, +1, scope, wrap); },
  prevSegment(scope, wrap) { return moveSegment(get, set, -1, scope, wrap); },
}));

/* -------------------------- source application -------------------------- */

async function applySource(
  set: (partial: Partial<LibraryState>) => void,
  get: () => LibraryState,
  source: LibrarySource,
): Promise<void> {
  disposeCurrentScan();
  set({ isLoading: true, error: null, source });

  let manifest: Manifest;
  if (source.kind === "backend") {
    try {
      await api.scan(source.root);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(msg);
    }
    manifest = await api.manifest();
    writeStoredSource({ kind: "backend", root: source.root });
    pushHistory({
      id: `backend:${source.root}`,
      kind: "backend",
      root: source.root,
      label: source.root,
      lastUsed: new Date().toISOString(),
    });
  } else if (source.kind === "browser-fsa") {
    currentScan = await scanBrowserSource({ kind: "fsa", handle: source.handle });
    manifest = currentScan.manifest;
    await saveHandle(source.handleId, source.handle);
    writeStoredSource({ kind: "browser-fsa", handleId: source.handleId, label: source.label });
    pushHistory({
      id: `fsa:${source.handleId}`,
      kind: "browser-fsa",
      label: source.label,
      lastUsed: new Date().toISOString(),
    });
  } else {
    currentScan = await scanBrowserSource({ kind: "files", files: source.files });
    manifest = currentScan.manifest;
    // browser-files sources can't be restored on reload, so don't persist
    writeStoredSource(null);
  }

  const firstEvent = manifest.events[0];
  set({
    manifest,
    isLoading: false,
    error: null,
    selectedEventId: firstEvent?.id ?? null,
    selectedSegmentId: firstEvent?.minutes[0]?.id ?? null,
    selectedDay: firstEvent ? dayKey(firstEvent.timestamp) : null,
  });
  void get;  // unused but reserved
}

async function restoreSource(stored: StoredSource): Promise<LibrarySource | null> {
  if (stored.kind === "backend") {
    if (!(await api.ping())) return null;
    return { kind: "backend", root: stored.root };
  }
  // browser-fsa
  const handle = await loadHandle(stored.handleId);
  if (!handle) return null;
  // Re-request read permission. If denied, fall back to picker.
  const anyHandle = handle as unknown as {
    requestPermission?: (opts: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
    queryPermission?: (opts: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  };
  try {
    const current = (await anyHandle.queryPermission?.({ mode: "read" })) ?? "granted";
    if (current !== "granted") {
      const next = await anyHandle.requestPermission?.({ mode: "read" });
      if (next !== "granted") return null;
    }
  } catch {
    return null;
  }
  return { kind: "browser-fsa", handle, label: stored.label, handleId: stored.handleId };
}

function disposeCurrentScan() {
  if (currentScan) {
    try { currentScan.dispose(); } catch { /* ignore */ }
    currentScan = null;
  }
}

/* -------------------------- helpers ------------------------------------ */

export function pickerHelpers() {
  return {
    newHandleId: randomId,
  };
}

/* ----------------------- selectors (computed) -------------------------- */

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function moveSegment(
  get: () => LibraryState,
  set: (partial: Partial<LibraryState>) => void,
  delta: number,
  scope: "event" | "day" | "library",
  wrap: boolean,
): boolean {
  const state = get();
  const events = scopedEvents(state, scope);
  const sequence = events.flatMap(ev =>
    ev.minutes.map(seg => ({ event: ev, segment: seg })),
  );
  if (sequence.length === 0) return false;

  const currentIdx = sequence.findIndex(
    s => s.event.id === state.selectedEventId && s.segment.id === state.selectedSegmentId,
  );
  let nextIdx = currentIdx + delta;
  if (nextIdx < 0 || nextIdx >= sequence.length) {
    if (!wrap) return false;
    nextIdx = (nextIdx + sequence.length) % sequence.length;
  }
  const next = sequence[nextIdx];
  set({
    selectedEventId: next.event.id,
    selectedSegmentId: next.segment.id,
    selectedDay: dayKey(next.event.timestamp),
  });
  return currentIdx !== nextIdx;
}

function scopedEvents(state: LibraryState, scope: "event" | "day" | "library"): ClipEvent[] {
  const events = state.manifest?.events ?? [];
  if (scope === "library") return [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (scope === "event") {
    const ev = events.find(e => e.id === state.selectedEventId);
    return ev ? [ev] : [];
  }
  const day = state.selectedDay;
  if (!day) return [];
  return events
    .filter(e => dayKey(e.timestamp) === day)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function filteredEvents(state: LibraryState): ClipEvent[] {
  const events = state.manifest?.events ?? [];
  const q = state.search.trim().toLowerCase();
  return events.filter(ev => {
    if (state.category !== "all" && ev.category !== state.category) return false;
    if (!q) return true;
    const hay = [
      ev.title, ev.city, ev.reason_label, ev.reason, ev.folder, ev.timestamp,
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

export function dayFilteredEvents(state: LibraryState): ClipEvent[] {
  return filteredEvents(state).filter(
    ev => !state.selectedDay || dayKey(ev.timestamp) === state.selectedDay,
  );
}

export function selectedEvent(state: LibraryState): ClipEvent | null {
  if (!state.selectedEventId || !state.manifest) return null;
  return state.manifest.events.find(e => e.id === state.selectedEventId) ?? null;
}

export function selectedSegment(state: LibraryState): Segment | null {
  const ev = selectedEvent(state);
  if (!ev) return null;
  return ev.minutes.find(s => s.id === state.selectedSegmentId) ?? ev.minutes[0] ?? null;
}

export function availableDays(state: LibraryState): string[] {
  const set = new Set<string>();
  for (const ev of state.manifest?.events ?? []) {
    set.add(dayKey(ev.timestamp));
  }
  return Array.from(set).sort().reverse();
}

/** True iff exports/snapshots can be sent to a backend. */
export function backendAvailable(state: LibraryState): boolean {
  return state.source?.kind === "backend";
}
