/*  Playback store — playback state + helper actions. Actual <video> elements   */
/*  are owned by React components; this store tracks state, registers refs,    */
/*  and broadcasts seek/play/pause commands.                                   */

import { create } from "zustand";
import type { AdvanceScope, CameraKind, LayoutMode, RenderMode } from "../types";

interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  rate: number;
  muted: boolean;
  /** When set, the named camera is the only one that plays audio (others muted). */
  audioCamera: CameraKind | null;
  layout: LayoutMode;
  render: RenderMode;
  focused: CameraKind | null;
  scope: AdvanceScope;
  loop: boolean;
  rangeStart: number | null;
  rangeEnd: number | null;
  status: string | null;
  /** Bumped whenever the loaded segment changes — components watch this to reset videos. */
  segmentRevision: number;
  /** Bumped whenever a programmatic seek happens, to nudge slaves into sync. */
  seekRevision: number;
  /** Target seconds requested by the last seek action. */
  seekTarget: number;

  setIsPlaying(b: boolean): void;
  setCurrentTime(t: number): void;
  setDuration(d: number): void;
  setRate(r: number): void;
  toggleMute(): void;
  setAudioCamera(cam: CameraKind | null): void;
  toggleAudioCamera(cam: CameraKind): void;
  setLayout(l: LayoutMode): void;
  setRender(r: RenderMode): void;
  setFocus(cam: CameraKind | null): void;
  toggleFocus(cam: CameraKind): void;
  setScope(s: AdvanceScope): void;
  toggleLoop(): void;
  markIn(): void;
  markOut(): void;
  clearRange(): void;
  setStatus(s: string | null): void;
  bumpSegment(): void;
  seek(seconds: number): void;
}

export const usePlayback = create<PlaybackState>((set, get) => ({
  isPlaying: false,
  currentTime: 0,
  duration: 60,
  rate: 1,
  muted: true,
  audioCamera: null,
  layout: "studio",
  render: "performance",
  focused: null,
  scope: "day",
  loop: false,
  rangeStart: null,
  rangeEnd: null,
  status: null,
  segmentRevision: 0,
  seekRevision: 0,
  seekTarget: 0,

  setIsPlaying(b) { set({ isPlaying: b }); },
  setCurrentTime(t) { set({ currentTime: t }); },
  setDuration(d) { set({ duration: Math.max(1, d) }); },
  setRate(r) { set({ rate: r }); },
  toggleMute() {
    const muted = !get().muted;
    set({ muted, audioCamera: muted ? null : get().audioCamera });
  },
  setAudioCamera(cam) {
    set({ audioCamera: cam, muted: cam == null });
  },
  toggleAudioCamera(cam) {
    const current = get().audioCamera;
    if (current === cam) {
      set({ audioCamera: null, muted: true });
    } else {
      set({ audioCamera: cam, muted: false });
    }
  },
  setLayout(l) { set({ layout: l }); },
  setRender(r) { set({ render: r }); },
  setFocus(cam) { set({ focused: cam }); },
  toggleFocus(cam) { set({ focused: get().focused === cam ? null : cam }); },
  setScope(s) { set({ scope: s }); },
  toggleLoop() { set({ loop: !get().loop }); },
  markIn() { set({ rangeStart: get().currentTime }); },
  markOut() { set({ rangeEnd: get().currentTime }); },
  clearRange() { set({ rangeStart: null, rangeEnd: null }); },
  setStatus(s) { set({ status: s }); },
  bumpSegment() {
    set({
      segmentRevision: get().segmentRevision + 1,
      currentTime: 0,
      seekTarget: 0,
      seekRevision: get().seekRevision + 1,
      isPlaying: get().isPlaying, // preserve play state
    });
  },
  seek(seconds) {
    set({
      seekTarget: seconds,
      seekRevision: get().seekRevision + 1,
      currentTime: seconds,
    });
  },
}));
