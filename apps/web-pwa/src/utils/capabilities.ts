/*  capabilities — runtime feature detection.                                  */
/*                                                                              */
/*  Pre-2021 Tesla Model S/X ships an older Chromium (around 79) that lacks    */
/*  modern APIs. Every code path that has a fallback consults this object.     */

declare global {
  interface Document {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void>;
  }
  interface HTMLElement {
    webkitRequestFullscreen?: () => Promise<void>;
  }
  interface Window {
    showDirectoryPicker?: (opts?: { id?: string; mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  }
}

function hasContainerQueries(): boolean {
  try {
    return typeof CSS !== "undefined" && CSS.supports?.("container-type: inline-size") === true;
  } catch {
    return false;
  }
}

function hasFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

function hasWebkitDirectory(): boolean {
  if (typeof document === "undefined") return false;
  const input = document.createElement("input");
  return "webkitdirectory" in input;
}

function hasVideoFrameCallback(): boolean {
  if (typeof HTMLVideoElement === "undefined") return false;
  return "requestVideoFrameCallback" in HTMLVideoElement.prototype;
}

function hasPictureInPicture(): boolean {
  if (typeof document === "undefined") return false;
  return "pictureInPictureEnabled" in document;
}

function hasFileSystemAccess(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(hover: none) and (pointer: coarse)").matches ?? false;
}

function isTeslaBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // Tesla in-car browser includes "Tesla" in UA. Older Model S/X (pre-MCU3) uses
  // a much older Chromium build than newer cars.
  return /Tesla|QtCarBrowser/i.test(ua);
}

export const caps = {
  fileSystemAccess: hasFileSystemAccess(),
  webkitDirectory: hasWebkitDirectory(),
  fullscreen: hasFullscreen(),
  videoFrameCallback: hasVideoFrameCallback(),
  pictureInPicture: hasPictureInPicture(),
  containerQueries: hasContainerQueries(),
  touch: isTouchDevice(),
  tesla: isTeslaBrowser(),
} as const;

export type Capabilities = typeof caps;
