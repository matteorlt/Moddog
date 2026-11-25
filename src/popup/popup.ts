import { parseRepoUrl } from "../lib/github";
import { renderAnalysis } from "../lib/render";
import type { AnalyzeResponse, RepoRef } from "../lib/types";

const content = document.getElementById("content")!;
const sniff = document.getElementById("sniff") as HTMLButtonElement;

document.getElementById("options")!.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

function message(text: string): void {
  const p = document.createElement("p");
  p.className = "md-hint";
  p.textContent = text;
  content.replaceChildren(p);
}

async function analyze(repo: RepoRef, force: boolean): Promise<void> {
  message(`Sniffing ${repo.owner}/${repo.repo}… This can take a little while for big repos.`);
  sniff.disabled = true;
  const res = (await chrome.runtime.sendMessage({ type: "analyze", repo, force })) as AnalyzeResponse;
  sniff.disabled = false;
  if (res.ok) {
    renderAnalysis(content, res.analysis);
    sniff.textContent = "Re-sniff from scratch";
    sniff.onclick = () => void analyze(repo, true);
  } else {
    message(`⚠️ ${res.error}`);
  }
}

async function init(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const repo = tab?.url ? parseRepoUrl(tab.url) : null;
  if (!repo) {
    message("Open a GitHub repository page and click Moddog again.");
    return;
  }
  sniff.hidden = false;
  sniff.onclick = () => void analyze(repo, false);

  const cached = (await chrome.runtime.sendMessage({ type: "getCached", repo })) as AnalyzeResponse;
  if (cached.ok) renderAnalysis(content, cached.analysis);
  else message(`${repo.owner}/${repo.repo} hasn't been sniffed yet.`);
}

void init();
