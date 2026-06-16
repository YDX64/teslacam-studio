/*  SourcePicker — modal for choosing a TeslaCam folder.                       */
/*                                                                              */
/*  Three input methods + suggestions + recents. No hardcoded paths anywhere   */
/*  in this component — suggestions arrive from the backend (which is platform-*/
/*  aware), and recents come from localStorage.                                 */

import { useEffect, useState } from "react";
import clsx from "clsx";
import { api } from "../api";
import { useLibrary } from "../stores/libraryStore";
import { caps } from "../utils/capabilities";
import {
  readHistory,
  removeFromHistory,
  loadHandle,
  randomId,
  type SourceRef,
} from "../utils/sourceHistory";
import {
  CarIcon,
  CloseIcon,
  FolderIcon,
  RefreshIcon,
} from "./Icons";

interface Props {
  onClose?: () => void;
  /** When true, the picker can't be closed without selecting a source. */
  required?: boolean;
}

interface BackendStatus {
  available: boolean;
  currentRoot: string | null;
}

export function SourcePicker({ onClose, required = false }: Props) {
  const setSource = useLibrary(s => s.setSource);
  const closePicker = useLibrary(s => s.closePicker);
  const isLoading = useLibrary(s => s.isLoading);

  const [backend, setBackend] = useState<BackendStatus>({ available: false, currentRoot: null });
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [history, setHistory] = useState<SourceRef[]>([]);
  const [pathInput, setPathInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const health = await api.health();
        setBackend({ available: health.ok, currentRoot: health.root });
        if (health.ok) {
          try {
            const s = await api.suggestions();
            setSuggestions(s.paths);
          } catch { /* ignore */ }
        }
      } catch {
        setBackend({ available: false, currentRoot: null });
      }
    })();
    setHistory(readHistory());
  }, []);

  function close() {
    if (required) return;
    onClose?.();
    closePicker();
  }

  async function applyBackend(root: string) {
    setBusy(`backend:${root}`);
    setError(null);
    try {
      await setSource({ kind: "backend", root });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function chooseFolder() {
    setBusy("choose");
    setError(null);
    try {
      if (caps.fileSystemAccess && window.showDirectoryPicker) {
        const handle = await window.showDirectoryPicker({ id: "teslacam", mode: "read" });
        const handleId = randomId();
        await setSource({ kind: "browser-fsa", handle, label: handle.name, handleId });
      } else {
        await pickViaInput();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("abort")) {
        setError(null);
      } else {
        setError(msg);
      }
    } finally {
      setBusy(null);
    }
  }

  function pickViaInput(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      // Non-standard but widely supported (Safari, Chromium, even Tesla S/X).
      (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
      input.multiple = true;
      input.style.display = "none";
      input.addEventListener("change", async () => {
        const files = input.files;
        if (!files || files.length === 0) {
          resolve();
          return;
        }
        try {
          const label = (files[0] as File & { webkitRelativePath?: string })
            .webkitRelativePath?.split("/")[0] ?? "Local folder";
          await setSource({ kind: "browser-files", files, label });
          resolve();
        } catch (e) {
          reject(e);
        }
      }, { once: true });
      input.addEventListener("cancel", () => resolve(), { once: true });
      document.body.appendChild(input);
      input.click();
      // Clean up the dangling input element after a microtask
      setTimeout(() => input.remove(), 0);
    });
  }

  async function applyRecent(entry: SourceRef) {
    setBusy(entry.id);
    setError(null);
    try {
      if (entry.kind === "backend") {
        await setSource({ kind: "backend", root: entry.root });
      } else {
        const handle = await loadHandle(entry.id.replace(/^fsa:/, ""));
        if (!handle) {
          removeFromHistory(entry.id);
          setHistory(readHistory());
          setError("That folder isn't available anymore. Please pick it again.");
          return;
        }
        const anyHandle = handle as unknown as {
          requestPermission?: (o: { mode: "read" }) => Promise<PermissionState>;
        };
        const granted = (await anyHandle.requestPermission?.({ mode: "read" })) ?? "granted";
        if (granted !== "granted") {
          setError("Permission denied. Please pick the folder again.");
          return;
        }
        await setSource({
          kind: "browser-fsa",
          handle,
          label: entry.label,
          handleId: entry.id.replace(/^fsa:/, ""),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function submitPath() {
    const root = pathInput.trim();
    if (!root) return;
    await applyBackend(root);
  }

  const canChooseFolder = caps.fileSystemAccess || caps.webkitDirectory;
  const canEnterPath = backend.available;
  const showSuggestions = backend.available && suggestions.length > 0;
  const showHistory = history.length > 0;
  const noOptions = !canChooseFolder && !canEnterPath && !showHistory;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 backdrop-blur-md p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="source-picker-title"
      onClick={close}
    >
      <div
        className="glass-strong relative w-full max-w-[560px] max-h-[92vh] overflow-y-auto rounded-3xl border border-(--color-border) p-5 sm:p-7 shadow-(--shadow-pop)"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 pb-5">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-(--color-accent)/15 text-(--color-accent)">
              <CarIcon className="h-6 w-6" />
            </div>
            <div>
              <h2 id="source-picker-title" className="text-[18px] font-semibold leading-tight text-(--color-text)">
                Open your dashcam folder
              </h2>
              <p className="mt-1 text-[12px] leading-relaxed text-(--color-text-dim)">
                Point TeslaCam Studio at a folder containing
                {" "}<code className="rounded ov-06 px-1 py-0.5 text-[11px]">RecentClips</code>,
                {" "}<code className="rounded ov-06 px-1 py-0.5 text-[11px]">SavedClips</code>,
                {" or "}<code className="rounded ov-06 px-1 py-0.5 text-[11px]">SentryClips</code>.
              </p>
            </div>
          </div>
          {!required && (
            <button
              type="button"
              onClick={close}
              className="grid h-9 w-9 place-items-center rounded-xl text-(--color-text-dim) transition hover:ov-05 hover:text-(--color-text)"
              aria-label="Close"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          )}
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-(--color-danger)/40 bg-(--color-danger)/10 px-3 py-2 text-[12px] text-(--color-danger)">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4">
          {canChooseFolder && (
            <Section
              title="Choose Folder"
              hint={caps.fileSystemAccess
                ? "Pick a folder from this device. Works with USB drives and local folders."
                : "Pick a folder from this device. Reads the files into the browser."}
              icon={<FolderIcon className="h-4 w-4" />}
            >
              <button
                type="button"
                onClick={chooseFolder}
                disabled={busy != null || isLoading}
                className="w-full rounded-xl border border-(--color-accent)/40 bg-gradient-to-br from-(--color-accent) to-(--color-accent-2) px-4 py-3 text-[14px] font-semibold text-white shadow-[0_6px_18px_var(--color-accent-glow)] transition active:scale-[0.99] disabled:opacity-60"
              >
                {busy === "choose" ? "Opening…" : "Choose Folder"}
              </button>
            </Section>
          )}

          {canEnterPath && (
            <Section
              title="Enter a path"
              hint="Type a folder path on the machine that's running the backend."
              icon={<KeyboardGlyph className="h-4 w-4" />}
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={pathInput}
                  onChange={e => setPathInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") void submitPath(); }}
                  placeholder="/path/to/TeslaCam"
                  spellCheck={false}
                  className="w-full rounded-xl border border-(--color-border) ov-04 px-3 py-2.5 text-[13px] font-mono text-(--color-text) outline-none transition placeholder:text-(--color-text-faint) focus:border-(--color-accent) focus:bg-(--color-accent)/10"
                />
                <button
                  type="button"
                  onClick={() => void submitPath()}
                  disabled={!pathInput.trim() || busy != null}
                  className="rounded-xl border border-(--color-border) ov-06 px-4 py-2.5 text-[13px] font-medium text-(--color-text) transition hover:border-(--color-border-strong) hover:ov-10 disabled:opacity-50"
                >
                  {busy === `backend:${pathInput.trim()}` ? "Scanning…" : "Scan"}
                </button>
              </div>
            </Section>
          )}

          {showSuggestions && (
            <Section
              title="Suggestions"
              hint="Found on this machine. Tap to use."
              icon={<SparkleGlyph className="h-4 w-4" />}
            >
              <ul className="flex flex-col gap-1.5">
                {suggestions.map(s => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => void applyBackend(s)}
                      disabled={busy != null}
                      className={clsx(
                        "flex w-full items-center justify-between gap-2 rounded-xl border border-(--color-border) ov-03 px-3 py-2 text-left text-[12px] font-mono text-(--color-text-dim) transition hover:border-(--color-border-strong) hover:ov-06 hover:text-(--color-text)",
                        busy === `backend:${s}` && "opacity-60",
                      )}
                    >
                      <span className="truncate">{s}</span>
                      <span className="shrink-0 text-(--color-text-faint)">↵</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {showHistory && (
            <Section
              title="Recent"
              hint="Folders you've opened before on this browser."
              icon={<HistoryGlyph className="h-4 w-4" />}
            >
              <ul className="flex flex-col gap-1.5">
                {history.map(entry => (
                  <li key={entry.id} className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void applyRecent(entry)}
                      disabled={busy != null}
                      className={clsx(
                        "flex flex-1 items-center justify-between gap-2 rounded-xl border border-(--color-border) ov-03 px-3 py-2 text-left text-[12px] text-(--color-text-dim) transition hover:border-(--color-border-strong) hover:ov-06 hover:text-(--color-text)",
                        busy === entry.id && "opacity-60",
                      )}
                    >
                      <span className="truncate">
                        <span className="font-mono">{entry.label}</span>
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-(--color-text-faint)">
                          {entry.kind === "backend" ? "backend" : "browser"}
                        </span>
                      </span>
                      <span className="shrink-0 text-(--color-text-faint)">↵</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        removeFromHistory(entry.id);
                        setHistory(readHistory());
                      }}
                      className="grid h-8 w-8 place-items-center rounded-lg text-(--color-text-faint) transition hover:ov-05 hover:text-(--color-text)"
                      aria-label="Forget this folder"
                      title="Forget"
                    >
                      <CloseIcon className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {noOptions && (
            <div className="rounded-xl border border-(--color-border) ov-03 p-4 text-center text-[12px] text-(--color-text-dim)">
              This browser can't open files directly and no backend is reachable.
              Run the included Python server on a machine on your network.
            </div>
          )}

          {backend.available && backend.currentRoot && (
            <p className="text-center text-[11px] text-(--color-text-faint)">
              Backend currently scanning <span className="font-mono">{backend.currentRoot}</span>
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={async () => {
                // Re-check backend + suggestions
                setBusy("refresh");
                try {
                  const health = await api.health();
                  setBackend({ available: health.ok, currentRoot: health.root });
                  if (health.ok) {
                    const s = await api.suggestions();
                    setSuggestions(s.paths);
                  } else {
                    setSuggestions([]);
                  }
                } catch {
                  setBackend({ available: false, currentRoot: null });
                  setSuggestions([]);
                } finally {
                  setBusy(null);
                }
              }}
              disabled={busy != null}
              className="inline-flex items-center gap-1.5 rounded-full border border-(--color-border) ov-04 px-3 py-1.5 text-[11px] font-medium text-(--color-text-dim) transition hover:border-(--color-border-strong) hover:text-(--color-text) disabled:opacity-50"
            >
              <RefreshIcon className={clsx("h-3.5 w-3.5", busy === "refresh" && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------- small helpers ------------------------------- */

function Section({
  title, hint, icon, children,
}: {
  title: string;
  hint?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-(--color-border) ov-02 p-3 sm:p-4">
      <header className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg ov-06 text-(--color-text-dim)">
          {icon}
        </span>
        <div className="flex-1">
          <h3 className="text-[13px] font-semibold text-(--color-text)">{title}</h3>
          {hint && <p className="text-[11px] text-(--color-text-faint)">{hint}</p>}
        </div>
      </header>
      <div>{children}</div>
    </section>
  );
}

function KeyboardGlyph(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12" />
    </svg>
  );
}

function SparkleGlyph(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" />
    </svg>
  );
}

function HistoryGlyph(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
