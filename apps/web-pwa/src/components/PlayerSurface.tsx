/*  PlayerSurface — one <video> per camera. Stable across layout switches.     */
/*                                                                              */
/*  Key invariants:                                                             */
/*    - src is loaded by url + segmentRevision only. isPrimary changes do NOT  */
/*      reload the video — that was the cause of the layout-switch flicker.    */
/*    - The "primary" surface drives currentTime via rAF. Switching primary    */
/*      is a separate effect that doesn't touch el.src.                        */
/*    - Per-cell mute is controlled by audioCamera + global muted from store.  */

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { CameraKind, VideoFile } from "../types";
import { CAMERA_LABEL } from "../types";
import { usePlayback } from "../stores/playbackStore";
import { CellControls } from "./CellControls";
import { caps } from "../utils/capabilities";

interface Props {
  camera: CameraKind;
  video?: VideoFile;
  isPrimary?: boolean;
  isFocused?: boolean;
  onTileFullscreen?: () => void;
}

export function PlayerSurface({
  camera,
  video,
  isPrimary,
  isFocused,
  onTileFullscreen,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [errored, setErrored] = useState(false);

  const isPlaying = usePlayback(s => s.isPlaying);
  const rate = usePlayback(s => s.rate);
  const globalMuted = usePlayback(s => s.muted);
  const audioCamera = usePlayback(s => s.audioCamera);
  const segmentRevision = usePlayback(s => s.segmentRevision);
  const seekRevision = usePlayback(s => s.seekRevision);
  const seekTarget = usePlayback(s => s.seekTarget);

  const isAudio = !globalMuted && audioCamera === camera;

  /* ------------------------------------------------------------
   * Load / unload src — runs when the video URL or segment changes.
   * Crucially does NOT depend on isPrimary anymore.
   * ------------------------------------------------------------ */
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    setReady(false);
    setErrored(false);
    if (!video) {
      el.removeAttribute("src");
      el.load();
      return;
    }
    el.preload = "auto";
    el.src = video.url;
    el.load();

    let cancelled = false;
    const node = el;

    (async function bootstrap() {
      try {
        if (node.readyState < 2) {
          await new Promise<void>((resolve, reject) => {
            const ok = () => { cleanup(); resolve(); };
            const bad = () => { cleanup(); reject(new Error("metadata")); };
            const cleanup = () => {
              node.removeEventListener("loadedmetadata", ok);
              node.removeEventListener("error", bad);
            };
            node.addEventListener("loadedmetadata", ok, { once: true });
            node.addEventListener("error", bad, { once: true });
          });
        }
        if (cancelled) return;

        const dur = Number.isFinite(node.duration) ? node.duration : 60;
        const safeTime = Math.min(2.0, Math.max(0, dur - 0.5));

        await new Promise<void>((resolve) => {
          const done = () => { node.removeEventListener("seeked", done); resolve(); };
          node.addEventListener("seeked", done, { once: true });
          try { node.currentTime = safeTime; } catch { resolve(); }
        });
        if (cancelled) return;

        const anyEl = node as unknown as {
          requestVideoFrameCallback?: (cb: () => void) => number;
        };
        await Promise.race([
          new Promise<void>(resolve => {
            if (caps.videoFrameCallback && typeof anyEl.requestVideoFrameCallback === "function") {
              anyEl.requestVideoFrameCallback(() => resolve());
            } else {
              setTimeout(resolve, 100);
            }
          }),
          new Promise<void>(resolve => setTimeout(resolve, 400)),
        ]);
        if (cancelled) return;
        setReady(true);
      } catch {
        if (!cancelled) setErrored(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.url, segmentRevision]);

  /* ------------------------------------------------------------
   * Mirror per-cell audio. Only one cell at a time is unmuted.
   * ------------------------------------------------------------ */
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !isAudio;
  }, [isAudio]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !ready) return;
    if (isPlaying) {
      const p = el.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {/* user gesture required — surfaced by primary */});
      }
    } else {
      el.pause();
    }
  }, [isPlaying, ready]);

  /* ------------------------------------------------------------
   * External seek requests.
   * ------------------------------------------------------------ */
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const dur = el.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    const target = Math.min(Math.max(seekTarget, 0), dur);
    if (Math.abs(el.currentTime - target) > 0.12) {
      try { el.currentTime = target; } catch { /* may throw if not seekable yet */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRevision]);

  /* ------------------------------------------------------------
   * Primary cell drives currentTime/duration into the store via rAF.
   * Promoting/demoting between primary <-> slave is handled by this
   * effect alone — never touches el.src.
   * ------------------------------------------------------------ */
  useEffect(() => {
    if (!isPrimary) return;
    const el = videoRef.current;
    if (!el) return;
    let cancelled = false;
    const setCurrentTime = usePlayback.getState().setCurrentTime;
    const setDuration = usePlayback.getState().setDuration;

    function tick() {
      if (cancelled || !el) return;
      const t = el.currentTime;
      const d = el.duration;
      if (Number.isFinite(t)) setCurrentTime(t);
      if (Number.isFinite(d) && d > 0) setDuration(d);
      requestAnimationFrame(tick);
    }
    const handle = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
    };
  }, [isPrimary, segmentRevision]);

  /* ------------------------------------------------------------
   * Slave drift correction every ~500ms (cheap).
   * ------------------------------------------------------------ */
  useEffect(() => {
    if (isPrimary) return;
    const el = videoRef.current;
    if (!el) return;
    const id = setInterval(() => {
      if (!ready) return;
      const masterTime = usePlayback.getState().currentTime;
      if (Math.abs(el.currentTime - masterTime) > 0.18) {
        try { el.currentTime = masterTime; } catch { /* ignore */ }
      }
    }, 500);
    return () => clearInterval(id);
  }, [isPrimary, ready]);

  function handleTileClick() {
    // Single click = play/pause (the focus toggle now lives in CellControls).
    usePlayback.getState().setIsPlaying(!usePlayback.getState().isPlaying);
  }

  return (
    <div
      data-cam-tile={camera}
      className={clsx(
        "video-tile relative overflow-hidden bg-black select-none",
        "transition-[opacity,box-shadow] duration-200",
        isFocused && "ring-2 ring-(--color-accent) z-[1]",
      )}
      onClick={handleTileClick}
    >
      {video ? (
        <>
          <video
            ref={videoRef}
            data-cam={camera}
            playsInline
            disablePictureInPicture
            disableRemotePlayback
            muted
            preload="auto"
            crossOrigin="anonymous"
            className={clsx(
              "h-full w-full object-cover transition-opacity duration-200",
              ready ? "opacity-100" : "opacity-0",
            )}
            onError={() => setErrored(true)}
          />

          {!ready && !errored && (
            <div className="absolute inset-0 shimmer-bg" aria-hidden />
          )}

          {errored && (
            <div className="absolute inset-0 grid place-items-center text-(--color-text-faint)">
              <div className="text-xs">Stream error</div>
            </div>
          )}

          <CellControls
            camera={camera}
            isFocused={!!isFocused}
            hasAudio={isAudio}
            onFullscreen={() => onTileFullscreen?.()}
            onToggleAudio={() => usePlayback.getState().toggleAudioCamera(camera)}
            onToggleFocus={() => usePlayback.getState().toggleFocus(camera)}
          />
        </>
      ) : (
        <div className="absolute inset-0 grid place-items-center text-(--color-text-faint)">
          <div className="flex flex-col items-center gap-1 text-xs">
            <span className="text-lg opacity-40">○</span>
            <span>no {CAMERA_LABEL[camera].toLowerCase()} feed</span>
          </div>
        </div>
      )}

      {/* Camera label badge */}
      <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-black/55 backdrop-blur-md px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-white">
        <span
          className={clsx(
            "h-1.5 w-1.5 rounded-full",
            ready
              ? "bg-(--color-success) shadow-[0_0_6px_currentColor]"
              : errored
              ? "bg-(--color-danger)"
              : "bg-(--color-warning)",
          )}
        />
        {CAMERA_LABEL[camera]}
      </div>
    </div>
  );
}
