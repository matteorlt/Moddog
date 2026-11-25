import { parseRepoUrl } from "../lib/github";
import { renderPanel, type PanelHandlers, type PanelState } from "../lib/render";
import type { AnalyzeResponse, RepoRef } from "../lib/types";

const panel = document.getElementById("panel")!;

function show(state: PanelState, repo: RepoRef | null): void {
  const handlers: PanelHandlers = {
    onSettings: () => chrome.runtime.openOptionsPage(),
    onSniff: repo ? (force) => void analyze(repo, force) : undefined,
  };
  renderPanel(panel, state, handlers);
}

async function analyze(repo: RepoRef, force: boolean): Promise<void> {
  show({ kind: "loading", repo }, repo);
  const res = (await chrome.runtime.sendMessage({ type: "analyze", repo, force })) as AnalyzeResponse;
  show(res.ok ? { kind: "done", analysis: res.analysis } : { kind: "error", repo, message: res.error }, repo);
}

async function init(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const repo = tab?.url ? parseRepoUrl(tab.url) : null;
  if (!repo) return show({ kind: "offsite" }, null);

  const cached = (await chrome.runtime.sendMessage({ type: "getCached", repo })) as AnalyzeResponse;
  show(cached.ok ? { kind: "done", analysis: cached.analysis } : { kind: "idle", repo }, repo);
}

void init();
