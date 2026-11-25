import css from "./ui.css";
import { parseRepoUrl } from "./lib/github";
import { applyTheme, LEVEL_LABEL, noseIcon, renderPanel, type PanelState } from "./lib/render";
import type { AnalyzeResponse, RepoRef, RiskLevel } from "./lib/types";

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

/** Follows GitHub's own theme setting (html[data-color-mode]). */
function syncTheme(root: HTMLElement): () => void {
  const html = document.documentElement;
  const apply = () => {
    const mode = html.getAttribute("data-color-mode");
    applyTheme(root, mode === "light" || mode === "dark" ? mode : "auto");
  };
  apply();
  const obs = new MutationObserver(apply);
  obs.observe(html, { attributes: true, attributeFilter: ["data-color-mode"] });
  return () => obs.disconnect();
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
  const stopTheme = syncTheme(root);

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
