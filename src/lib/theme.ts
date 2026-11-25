import { applyTheme } from "./render";
import { getSettings } from "./settings";
import type { Settings, ThemePreference } from "./types";

/**
 * Applies the user's theme choice to a `.md-root` element and keeps it in sync
 * when the setting changes. "auto" lets the CSS follow the browser's own
 * light/dark mode (prefers-color-scheme), which also updates live.
 */
export function watchTheme(root: HTMLElement): () => void {
  let stopped = false;
  void getSettings().then((s) => {
    if (!stopped) applyTheme(root, s.theme);
  });
  const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "local" || !changes.settings) return;
    const next = (changes.settings.newValue as Partial<Settings> | undefined)?.theme;
    applyTheme(root, (next as ThemePreference | undefined) ?? "auto");
  };
  chrome.storage.onChanged.addListener(onChange);
  return () => {
    stopped = true;
    chrome.storage.onChanged.removeListener(onChange);
  };
}
