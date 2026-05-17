/*  fullscreen — cross-browser wrapper.                                         */
/*                                                                              */
/*  Older Chromium (including the Tesla Model S/X build) exposes the           */
/*  webkit-prefixed API; we transparently fall back to it.                     */

import { useEffect, useState } from "react";

type AnyEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
type AnyDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
};

export function enterFullscreen(el: HTMLElement): Promise<void> {
  const anyEl = el as AnyEl;
  const fn = anyEl.requestFullscreen || anyEl.webkitRequestFullscreen;
  if (!fn) return Promise.resolve();
  try {
    const result = fn.call(anyEl) as Promise<void> | undefined;
    return result?.catch(() => {}) ?? Promise.resolve();
  } catch {
    return Promise.resolve();
  }
}

export function exitFullscreen(): Promise<void> {
  const anyDoc = document as AnyDoc;
  const fn = anyDoc.exitFullscreen || anyDoc.webkitExitFullscreen;
  if (!fn) return Promise.resolve();
  try {
    const result = fn.call(anyDoc) as Promise<void> | undefined;
    return result?.catch(() => {}) ?? Promise.resolve();
  } catch {
    return Promise.resolve();
  }
}

export function fullscreenElement(): Element | null {
  const anyDoc = document as AnyDoc;
  return anyDoc.fullscreenElement ?? anyDoc.webkitFullscreenElement ?? null;
}

export function isFullscreen(): boolean {
  return fullscreenElement() != null;
}

export function onFullscreenChange(cb: () => void): () => void {
  document.addEventListener("fullscreenchange", cb);
  document.addEventListener("webkitfullscreenchange", cb as EventListener);
  return () => {
    document.removeEventListener("fullscreenchange", cb);
    document.removeEventListener("webkitfullscreenchange", cb as EventListener);
  };
}

export function useFullscreen() {
  const [active, setActive] = useState<boolean>(() => isFullscreen());
  const [element, setElement] = useState<Element | null>(() => fullscreenElement());

  useEffect(() => {
    function update() {
      const el = fullscreenElement();
      setElement(el);
      setActive(el != null);
    }
    const off = onFullscreenChange(update);
    update();
    return off;
  }, []);

  return { active, element, enter: enterFullscreen, exit: exitFullscreen };
}
