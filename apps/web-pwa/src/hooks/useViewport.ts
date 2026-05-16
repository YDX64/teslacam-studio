/*  Viewport hook — reactive breakpoint + orientation + Tesla detection.       */

import { useEffect, useState } from "react";

type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl";

function pickBreakpoint(width: number): Breakpoint {
  if (width < 640) return "xs";
  if (width < 768) return "sm";
  if (width < 1024) return "md";
  if (width < 1440) return "lg";
  return "xl";
}

/**
 * Detect Tesla in-car browsers and screen formats:
 *
 *  - Pre-2021 Model S/X  →  1200 × 1920 (portrait, 17")
 *  - Model 3 / Y         →  1920 × 1200 (landscape, 15")
 *  - Refreshed Model S/X →  2200 × 1300 (landscape, 17")
 *  - Cybertruck          →  2200 × 1300 (landscape, 18.5")
 *
 * Tesla's older WebKit/Chromium puts "Tesla" in the user-agent on some
 * firmware versions. When we can't trust UA we fall back to aspect-ratio
 * heuristics; the user can also force the mode with `?tesla=portrait`
 * or `?tesla=landscape` for testing on a normal browser.
 */
function detectTesla(width: number, height: number, ua: string, query: URLSearchParams) {
  const forced = query.get("tesla");
  if (forced === "portrait") return { teslaPortrait: true, teslaLandscape: false };
  if (forced === "landscape") return { teslaPortrait: false, teslaLandscape: true };
  if (forced === "off") return { teslaPortrait: false, teslaLandscape: false };

  const uaTesla = /Tesla/i.test(ua) || /QtCarBrowser/i.test(ua);
  const portrait = height > width;
  const aspect = portrait ? height / width : width / height;

  // 1200×1920 → aspect 1.6; allow ±5% wiggle for browser chrome
  const matchesSXPortrait = portrait
    && width >= 1100 && width <= 1300
    && aspect >= 1.5 && aspect <= 1.7;

  // 1920×1200 (Model 3/Y) or 2200×1300 (refresh) — aspect 1.55–1.7 landscape
  const matchesLandscape = !portrait
    && width >= 1800 && width <= 2400
    && aspect >= 1.5 && aspect <= 1.75;

  return {
    teslaPortrait: matchesSXPortrait || (uaTesla && portrait),
    teslaLandscape: matchesLandscape || (uaTesla && !portrait),
  };
}

export function useViewport() {
  const [size, setSize] = useState(() => ({
    width:  typeof window !== "undefined" ? window.innerWidth  : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  }));

  useEffect(() => {
    function onResize() {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    }
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const query = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();

  const bp = pickBreakpoint(size.width);
  const portrait = size.height > size.width;
  const { teslaPortrait, teslaLandscape } = detectTesla(size.width, size.height, ua, query);

  return {
    ...size,
    bp,
    portrait,
    isMobile:  bp === "xs" || bp === "sm",
    isTablet:  bp === "md",
    isDesktop: bp === "lg" || bp === "xl",
    isWide:    bp === "xl",
    isTouch:   typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches,
    isTesla:   teslaPortrait || teslaLandscape,
    teslaPortrait,
    teslaLandscape,
  };
}
