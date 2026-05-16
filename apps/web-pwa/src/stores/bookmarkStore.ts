/*  Bookmark persistence — keyed by `${eventId}#${segmentId}` in localStorage. */

import { create } from "zustand";

const STORAGE_KEY = "teslacam.bookmarks.v1";

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function write(keys: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(keys).sort()));
  } catch {
    // localStorage may be unavailable in private mode — fall through silently
  }
}

interface BookmarkState {
  keys: Set<string>;
  has(eventId: string, segmentId: string): boolean;
  toggle(eventId: string, segmentId: string): void;
  countIn(eventId: string, segmentIds: string[]): number;
}

export const useBookmarks = create<BookmarkState>((set, get) => ({
  keys: read(),

  has(eventId, segmentId) {
    return get().keys.has(`${eventId}#${segmentId}`);
  },

  toggle(eventId, segmentId) {
    const next = new Set(get().keys);
    const k = `${eventId}#${segmentId}`;
    if (next.has(k)) next.delete(k);
    else next.add(k);
    write(next);
    set({ keys: next });
  },

  countIn(eventId, segmentIds) {
    const keys = get().keys;
    let count = 0;
    for (const sid of segmentIds) {
      if (keys.has(`${eventId}#${sid}`)) count++;
    }
    return count;
  },
}));
