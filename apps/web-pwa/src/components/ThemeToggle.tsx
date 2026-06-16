/*  ThemeToggle — cycles System -> Light -> Dark. Reusable in every layout.     */
import clsx from "clsx";
import { useTheme, type ThemeMode } from "../stores/themeStore";

const NEXT: Record<ThemeMode, ThemeMode> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<ThemeMode, string> = { system: "System", light: "Light", dark: "Dark" };

export function ThemeToggle({ className = "" }: { className?: string }) {
  const mode = useTheme(s => s.mode);
  const setMode = useTheme(s => s.setMode);
  return (
    <button
      type="button"
      onClick={() => setMode(NEXT[mode])}
      title={`Theme: ${LABEL[mode]} — tap to change`}
      aria-label={`Theme: ${LABEL[mode]}. Tap to change theme.`}
      className={clsx(
        "icon-btn grid place-items-center text-(--color-text-dim) transition hover:ov-05 hover:text-(--color-text)",
        className,
      )}
    >
      {mode === "system" ? <MonitorIcon /> : mode === "light" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function MonitorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
