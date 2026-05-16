/*  PlayerSurface — one <video> per camera with quality-first defaults.        */
/*                                                                              */
/*  Why this file exists:                                                      */
/*    The legacy viewer showed green/yellow H.264 artifacts because it          */
/*    revealed the <video> at `loadeddata` (first frame decoded, but the        */
/*    sequence header / first I-frame may still be partial). We instead         */
/*    wait for `canplaythrough` (browser has buffered enough for smooth         */
/*    decode) before fading in the video element. Until then, a skeleton        */
/*    shimmer covers the cell.                                                  */
/*                                                                              */
/*  Sync model:                                                                 */
/*    The store owns `segmentRevision`, `seekRevision`, `seekTarget`. Each      */
/*    PlayerSurface subscribes and:                                             */
/*      - reloads the src whenever segmentRevision changes                      */
/*      - seeks to seekTarget whenever seekRevision changes                     */
/*      - obeys play/pause/rate/mute from the store                             */
/*    The "primary" surface (auto-picked by the parent) drives currentTime      */
/*    back into the store via rAF. Slaves correct drift > 0.18s.                */

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { CameraKind, VideoFile } from "../types";
import { CAMERA_LABEL } from "../types";
import { usePlayback } from "../stores/playbackStore";

interface Props {
  camera: CameraKind;
  video?: VideoFile;
  isPrimary?: boolean;
  className?: string;
  onClick?: () => void;
  focusOutline?: boolean;
}

export function PlayerSurface({
  camera,
  video,
  isPrimary,
  className,
  onClick,
  focusOutline,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [errored, setErrored] = useState(false);

  const isPlaying = usePlayback(s => s.isPlaying);
  const rate = usePlayback(s => s.rate);
  const muted = usePlayback(s => s.muted);
  const segmentRevision = usePlayback(s => s.segmentRevision);
  const seekRevision = usePlayback(s => s.seekRevision);
  const seekTarget = usePlayback(s => s.seekTarget);

  // -----------------------------------------------------------------
  // Load / unload src when video changes or segment revision bumps
  // -----------------------------------------------------------------
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
    // Bump load priority on the primary cell
    if (isPrimary) {
      el.setAttribute("fetchpriority", "high");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.url, segmentRevision, isPrimary]);

  // -----------------------------------------------------------------
  // Mirror playback state into the element
  // -----------------------------------------------------------------
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = muted;
  }, [muted]);

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

  // -----------------------------------------------------------------
  // External seek requests
  // -----------------------------------------------------------------
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !ready) return;
    const dur = el.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    const target = Math.min(Math.max(seekTarget, 0), dur);
    if (Math.abs(el.currentTime - target) > 0.12) {
      try { el.currentTime = target; } catch { /* may throw if not seekable yet */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRevision, ready]);

  // -----------------------------------------------------------------
  // Primary cell drives currentTime/duration up via rAF + sync check
  // -----------------------------------------------------------------
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

  // -----------------------------------------------------------------
  // Slave drift correction every ~500ms (cheap)
  // -----------------------------------------------------------------
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

  // -----------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------
  return (
    <div
      className={clsx(
        "relative overflow-hidden bg-black select-none",
        "transition-[opacity,box-shadow] duration-200",
        focusOutline && "ring-2 ring-(--color-accent) z-10",
        className,
      )}
      onClick={onClick}
    >
      {video ? (
        <>
          <video
            ref={videoRef}
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
            onCanPlayThrough={() => setReady(true)}
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
