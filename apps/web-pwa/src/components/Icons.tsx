/*  Minimal inline-SVG icon set — keeps the bundle tiny, no icon-font fetch.   */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = "currentColor";

export const PlayIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M8 5v14l11-7z" /></svg>
);

export const PauseIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
);

export const PrevIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M6 6h2v12H6zm3.5 6L20 6v12z" /></svg>
);

export const NextIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M16 6h2v12h-2zM4 18l10.5-6L4 6z" /></svg>
);

export const SearchIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={base} strokeWidth={2} strokeLinecap="round" {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const RefreshIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M17.65 6.35A8 8 0 0 0 12 4a8 8 0 1 0 7.74 10h-2.06A6 6 0 1 1 12 6a5.93 5.93 0 0 1 4.22 1.78L13 11h7V4z" /></svg>
);

export const FolderIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" /></svg>
);

export const InfoIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2zm0-8h-2V7h2z" /></svg>
);

export const FullscreenIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M5 5h5V3H3v7h2V5zm9-2v2h5v5h2V3h-7zm5 16h-5v2h7v-7h-2v5zM5 14H3v7h7v-2H5v-5z" /></svg>
);

export const MuteIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M3 9v6h4l5 5V4L7 9H3zm13.59 3L19 9.41 17.59 8 15 10.59 12.41 8 11 9.41 13.59 12 11 14.59 12.41 16 15 13.41 17.59 16 19 14.59 16.59 12z" /></svg>
);

export const VolumeIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
);

export const CameraIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M14.12 4 16 6H4v12h16V6h-4.88L13.4 4zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" /></svg>
);

export const SnapshotIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M9 2 7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" /></svg>
);

export const ExportIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="m16 5-1.42 1.42L17.16 9H10V11h7.16l-2.58 2.58L16 15l5-5-5-5zM4 4h6v2H6v12h12v-4h2v6H4V4z" /></svg>
);

export const DocIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z" /></svg>
);

export const BookmarkIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" /></svg>
);

export const BookmarkLineIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={base} strokeWidth={2} {...p}><path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" /></svg>
);

export const ShieldIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M12 2 4 5v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V5l-8-3z" /></svg>
);

export const RecentIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M11 7v6l5 3 .75-1.25-4.25-2.5V7zM12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" /></svg>
);

export const SavedIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="m12 17.27 6.18 3.73-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
);

export const HonkIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" /></svg>
);

export const LayoutStudioIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M3 4h10v16H3V4zm12 0h6v7h-6V4zm0 9h6v7h-6v-7z" /></svg>
);

export const Layout3UpIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M3 4h6v16H3zm8 0h6v16h-6zm8 0h2v16h-2z" /></svg>
);

export const LayoutTheaterIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M3 4h18v12H3V4zm0 14h5v2H3zm7 0h4v2h-4zm6 0h5v2h-5z" /></svg>
);

export const LayoutMosaicIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M3 4h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z" /></svg>
);

export const SpeedIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M19.46 10A9.96 9.96 0 0 0 12 4a9.96 9.96 0 0 0-7.46 6 9.93 9.93 0 0 0 .54 9h13.84a9.93 9.93 0 0 0 .54-9zM12 16l-1.41-1.41L13.17 12H8v-2h5.17l-2.58-2.59L12 6l5 5z" /></svg>
);

export const LoopIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" /></svg>
);

export const ScopeIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm0-14a6 6 0 1 0 6 6 6 6 0 0 0-6-6zm0 10a4 4 0 1 1 4-4 4 4 0 0 1-4 4z" /></svg>
);

export const InIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M9 19V5l-7 7zm11-14v14h2V5z" /></svg>
);

export const OutIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M15 5v14l7-7zM2 5v14h2V5z" /></svg>
);

export const CloseIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" /></svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
);

export const CarIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8zM6.5 16a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm11 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM5 11l1.5-4.5h11L19 11z" /></svg>
);

export const MapIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M20.5 3 20 3.07 15 5 9 3 3 5.16v15.79L3.5 21 9 19l6 2 6-2.16V3.34zM15 17l-6-2.11V7l6 2.11z" /></svg>
);

export const InspectorIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M3 4h18v16H3zm12 14V6h-4v12zm6 0V6h-4v12zM4 6v12h6V6z" /></svg>
);

export const FilmIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="M18 4v1h-2V4c0-.55-.45-1-1-1H9c-.55 0-1 .45-1 1v1H6V4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v16c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h2v1c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-1h2v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1h-1c-.55 0-1 .45-1 1zM8 17H6v-2h2zm0-4H6v-2h2zm0-4H6V7h2zm10 8h-2v-2h2zm0-4h-2v-2h2zm0-4h-2V7h2z" /></svg>
);

export const StackIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill={base} {...p}><path d="m12 7.83 6 6V8h-2v3.17l-4-4-4 4V8H6v5.83l6-6zM12 2 4 8v12h16V8z" /></svg>
);
