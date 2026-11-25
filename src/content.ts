import { parseRepoUrl } from "./lib/github";
import { LEVEL_UI, renderAnalysis } from "./lib/render";
import type { AnalyzeResponse, RepoRef } from "./lib/types";

// Adds a floating Moddog badge on GitHub repository pages.
const ROOT_ID = "moddog-root";

let currentKey = "";

function send(message: unknown): Promise<AnalyzeResponse> {
  return chrome.runtime.sendMessage(message) as Promise<AnalyzeResponse>;
}

function mount(repo: RepoRef): void {
  document.getElementById(ROOT_ID)?.remove();

  const root = document.createElement("div");
  root.id = ROOT_ID;
  const badge = document.createElement("button");
  badge.className = "md-badge";
  badge.type = "button";
  badge.title = "Moddog: sniff this repo for malware";
  const panel = document.createElement("div");
  panel.className = "md-panel";
  panel.hidden = true;
  root.append(badge, panel);
  document.body.append(root);

  const setBadge = (emoji: string, text: string) => {
    badge.textContent = `🐕 ${emoji} ${text}`;
  };
  setBadge("", "Sniff");

  const run = async (force: boolean) => {
    setBadge("", "Sniffing…");
    badge.disabled = true;
    const res = await send({ type: "analyze", repo, force });
    badge.disabled = false;
    if (res.ok) {
      const ui = LEVEL_UI[res.analysis.level];
      setBadge(ui.emoji, ui.label);
      renderAnalysis(panel, res.analysis);
      const again = document.createElement("button");
      again.className = "md-link";
      again.textContent = "Re-sniff from scratch";
      again.onclick = () => void run(true);
      panel.append(again);
    } else {
      setBadge("⚠️", "Error");
      panel.textContent = res.error;
    }
    panel.hidden = false;
  };

  // Show a cached verdict right away, without spending API calls.
  void send({ type: "getCached", repo }).then((res) => {
    if (res.ok) {
      const ui = LEVEL_UI[res.analysis.level];
      setBadge(ui.emoji, ui.label);
      renderAnalysis(panel, res.analysis);
    }
  });

  badge.onclick = () => {
    if (!panel.hidden) {
      panel.hidden = true;
      return;
    }
    if (panel.childElementCount > 0) panel.hidden = false;
    else void run(false);
  };
}

function check(): void {
  const repo = parseRepoUrl(location.href);
  const key = repo ? `${repo.owner}/${repo.repo}`.toLowerCase() : "";
  if (key === currentKey) return;
  currentKey = key;
  if (repo) mount(repo);
  else document.getElementById(ROOT_ID)?.remove();
}

// GitHub navigates without full page loads (Turbo), so watch for URL changes.
check();
document.addEventListener("turbo:load", check);
window.addEventListener("popstate", check);
setInterval(check, 1500);
