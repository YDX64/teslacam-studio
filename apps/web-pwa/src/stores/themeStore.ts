/*  Theme store — system | light | dark, persisted, with live system sync.     */
import { create } from "zustand";

export type ThemeMode = "system" | "light" | "dark";
type Resolved = "light" | "dark";

const STORAGE_KEY = "tcs-theme";

function systemDark(): boolean {
  return typeof window !== "undefined"
    && !!window.matchMedia
    && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(mode: ThemeMode): Resolved {
  return mode === "system" ? (systemDark() ? "dark" : "light") : mode;
}

function apply(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  const mc = document.querySelector('meta[name="theme-color"]');
  if (mc) mc.setAttribute("content", resolved === "dark" ? "#0a0d14" : "#e9edf4");
}

function load(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch { /* ignore */ }
  return "system";
}

interface ThemeState {
  mode: ThemeMode;
  resolved: Resolved;
  setMode(mode: ThemeMode): void;
}

const initial = load();
apply(initial);

export const useTheme = create<ThemeState>(set => ({
  mode: initial,
  resolved: resolveTheme(initial),
  setMode(mode) {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
    apply(mode);
    set({ mode, resolved: resolveTheme(mode) });
  },
}));

// Live-update when the OS theme changes while we're following "system".
if (typeof window !== "undefined" && window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (useTheme.getState().mode === "system") {
      apply("system");
      useTheme.setState({ resolved: resolveTheme("system") });
    }
  });
}
