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
  // Load / unload src when video changes or segment revision bumps.
  // We additionally wait for a real `requestVideoFrameCallback` (or
  // `seeked` fallback) to fade in — otherwise the first paint can be
  // a partially-decoded H.264 P-frame which shows as green/yellow.
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
    if (isPrimary) {
      el.setAttribute("fetchpriority", "high");
    }

    // Wait for the first *clean* rendered frame. Tesla's H.264 clips
    // routinely paint chroma-only (green-tinted) pixels in the first
    // ~1.5 seconds — likely because the encoder hadn't stabilised yet.
    // The fix: force a seek to 2.0s on load and only reveal after the
    // seeked frame has been painted (rVFC where available).
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

        // Seek and wait for the seeked event
        await new Promise<void>((resolve) => {
          const done = () => { node.removeEventListener("seeked", done); resolve(); };
          node.addEventListener("seeked", done, { once: true });
          try { node.currentTime = safeTime; } catch { resolve(); }
        });
        if (cancelled) return;

        // Wait for a real frame paint — but race against a timeout so a
        // hidden tab or headless renderer can't deadlock us.
        const anyEl = node as unknown as { requestVideoFrameCallback?: (cb: () => void) => number };
        await Promise.race([
          new Promise<void>(resolve => {
            if (typeof anyEl.requestVideoFrameCallback === "function") {
              anyEl.requestVideoFrameCallback(() => resolve());
            } else {
              setTimeout(resolve, 100);
            }
          }),
          new Promise<void>(resolve => setTimeout(resolve, 400)),
        ]);
        if (cancelled) return;

        // Mirror this position into the shared store so all surfaces stay aligned
        const store = usePlayback.getState();
        if (isPrimary) {
          store.setCurrentTime(safeTime);
        }
        setReady(true);
      } catch {
        if (!cancelled) setErrored(true);
      }
    })();
    return () => { cancelled = true; };
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
  // External seek requests. Only listens to seekRevision so the
  // bootstrap-time clean-frame seek isn't undone after `ready` flips.
  // -----------------------------------------------------------------
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
