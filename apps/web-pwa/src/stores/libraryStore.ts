/*  Library store — manages event list, filters, current selection.            */

import { create } from "zustand";
import type { ClipCategory, ClipEvent, Manifest, Segment } from "../types";
import { api } from "../api";

interface LibraryState {
  manifest: Manifest | null;
  isLoading: boolean;
  error: string | null;

  search: string;
  category: ClipCategory | "all";
  selectedDay: string | null;        // "YYYY-MM-DD"
  selectedEventId: string | null;
  selectedSegmentId: string | null;

  // Actions
  load(): Promise<void>;
  setSearch(q: string): void;
  setCategory(c: ClipCategory | "all"): void;
  setDay(day: string | null): void;
  selectEvent(id: string | null): void;
  selectSegment(eventId: string, segmentId: string): void;
  nextSegment(scope: "event" | "day" | "library", wrap: boolean): boolean;
  prevSegment(scope: "event" | "day" | "library", wrap: boolean): boolean;
}

export const useLibrary = create<LibraryState>((set, get) => ({
  manifest: null,
  isLoading: false,
  error: null,
  search: "",
  category: "all",
  selectedDay: null,
  selectedEventId: null,
  selectedSegmentId: null,

  async load() {
    set({ isLoading: true, error: null });
    try {
      const manifest = await api.manifest();
      set({ manifest, isLoading: false });
      const { selectedEventId, selectedDay } = get();
      const filtered = filteredEvents(get());
      if (!selectedEventId && filtered[0]) {
        const ev = filtered[0];
        set({
          selectedEventId: ev.id,
          selectedSegmentId: ev.minutes[0]?.id ?? null,
          selectedDay: selectedDay ?? dayKey(ev.timestamp),
        });
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      set({ error, isLoading: false });
    }
  },

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

  nextSegment(scope, wrap) {
    return moveSegment(get, set, +1, scope, wrap);
  },
  prevSegment(scope, wrap) {
    return moveSegment(get, set, -1, scope, wrap);
  },
}));

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
  // day
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
    if (state.selectedDay && dayKey(ev.timestamp) !== state.selectedDay) {
      // Day filter only applies on the sidebar list — keep the gate but
      // allow viewing by event selection. We expose two helpers below.
    }
    if (!q) return true;
    const hay = [
      ev.title,
      ev.city,
      ev.reason_label,
      ev.reason,
      ev.folder,
      ev.timestamp,
    ]
      .join(" ")
      .toLowerCase();
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
