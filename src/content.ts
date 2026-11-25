import { parseRepoUrl } from "./lib/github";
import { LEVEL_LABEL, noseIcon, type PanelState, renderPanel } from "./lib/render";
import { watchTheme } from "./lib/theme";
import type { AnalyzeResponse, PageHints, RepoRef, RiskLevel } from "./lib/types";
import css from "./ui.css";

/*
 * Floating Moddog badge on GitHub repository pages. It lives in a shadow root
 * so GitHub's styles can't reach it (and ours can't leak into GitHub).
 */
const HOST_ID = "moddog-host";

let currentKey = "";
let cleanup: (() => void) | null = null;

function send(message: unknown): Promise<AnalyzeResponse> {
  return chrome.runtime.sendMessage(message) as Promise<AnalyzeResponse>;
}

/** Reads a GitHub counter like <span id="repo-stars-counter-star" title="1,234">1.2k</span>. */
function readCounter(id: string): number | undefined {
  // The title holds the exact number; the visible text is rounded ("1.2k"), so only trust the title.
  const title = document.getElementById(id)?.getAttribute("title")?.replace(/[^\d]/g, "");
  return title ? Number(title) : undefined;
}

function sendPageHints(repo: RepoRef): void {
  const hints: PageHints = {
    stars: readCounter("repo-stars-counter-star"),
    forks: readCounter("repo-network-counter"),
  };
  void chrome.runtime.sendMessage({ type: "pageHints", repo, hints });
}

function mount(repo: RepoRef): () => void {
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "all: initial; position: fixed; right: 16px; bottom: 16px; z-index: 2147483000;";
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = css;
  const root = document.createElement("div");
  root.className = "md-root md-float";

  const panel = document.createElement("div");
  panel.className = "md-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Moddog analysis");

  const badge = document.createElement("button");
  badge.type = "button";
  badge.className = "md-badge";
  badge.setAttribute("aria-expanded", "false");
  const dot = document.createElement("span");
  dot.className = "md-dot";
  const label = document.createElement("span");
  badge.append(noseIcon(16), dot, label);

  root.append(panel, badge);
  shadow.append(style, root);
  document.body.append(host);
  // Follows the browser's light/dark mode (or the choice made in the settings).
  const stopTheme = watchTheme(root);

  let state: PanelState = { kind: "idle", repo };

  const setBadge = (level: RiskLevel, text: string, busy = false) => {
    badge.dataset.level = level;
    label.textContent = text;
    badge.title = `Moddog: ${text}`;
    if (busy) badge.dataset.busy = "";
    else delete badge.dataset.busy;
  };

  const open = (show: boolean) => {
    panel.hidden = !show;
    badge.setAttribute("aria-expanded", String(show));
  };

  const render = () =>
    renderPanel(panel, state, {
      onSniff: (force) => void run(force),
      onClose: () => open(false),
      onSettings: () => void chrome.runtime.sendMessage({ type: "openOptions" }),
    });

  const run = async (force: boolean) => {
    sendPageHints(repo);
    state = { kind: "loading", repo };
    setBadge("unknown", "Sniffing…", true);
    render();
    open(true);
    const res = await send({ type: "analyze", repo, force });
    if (res.ok) {
      state = { kind: "done", analysis: res.analysis };
      setBadge(res.analysis.level, LEVEL_LABEL[res.analysis.level]);
    } else {
      state = { kind: "error", repo, message: res.error };
      setBadge("unknown", "Error");
    }
    render();
  };

  setBadge("unknown", "Sniff");
  render();

  // Show a cached verdict right away, without spending any API call.
  void send({ type: "getCached", repo }).then((res) => {
    if (res.ok && state.kind === "idle") {
      state = { kind: "done", analysis: res.analysis };
      setBadge(res.analysis.level, LEVEL_LABEL[res.analysis.level]);
      render();
    }
  });

  badge.onclick = () => {
    if (!panel.hidden) return open(false);
    if (state.kind === "idle") void run(false);
    else open(true);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !panel.hidden) open(false);
  };
  document.addEventListener("keydown", onKey);

  return () => {
    stopTheme();
    document.removeEventListener("keydown", onKey);
    host.remove();
  };
}

function check(): void {
  const repo = parseRepoUrl(location.href);
  const key = repo ? `${repo.owner}/${repo.repo}`.toLowerCase() : "";
  if (key === currentKey) return;
  currentKey = key;
  cleanup?.();
  cleanup = repo ? mount(repo) : null;
}

// GitHub navigates without full page loads (Turbo), so watch for URL changes.
check();
document.addEventListener("turbo:load", check);
window.addEventListener("popstate", check);
setInterval(check, 1500);
