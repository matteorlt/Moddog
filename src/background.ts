import { analyzeRepo } from "./lib/analyze";
import { getCached } from "./lib/cache";
import type { AnalyzeResponse, Message, PageHints } from "./lib/types";

// Stars/forks read from the GitHub page, used if the API limit is reached.
const pageHints = new Map<string, PageHints>();

// One analysis per repo at a time, even if the popup and the page badge both ask.
const inFlight = new Map<string, Promise<AnalyzeResponse>>();

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type === "openOptions") {
    void chrome.runtime.openOptionsPage();
    return false;
  }

  if (message.type === "pageHints") {
    pageHints.set(`${message.repo.owner}/${message.repo.repo}`.toLowerCase(), message.hints);
    return false;
  }

  if (message.type === "getCached") {
    getCached(message.repo).then((entry) =>
      sendResponse(
        entry ? { ok: true, analysis: { ...entry.analysis, fromCache: true } } : { ok: false, error: "not cached" },
      ),
    );
    return true;
  }

  if (message.type === "analyze") {
    const key = `${message.repo.owner}/${message.repo.repo}`.toLowerCase();
    let job = inFlight.get(key);
    if (!job) {
      job = analyzeRepo(message.repo, message.force, pageHints.get(key))
        .then((analysis): AnalyzeResponse => ({ ok: true, analysis }))
        .catch((e: unknown): AnalyzeResponse => ({ ok: false, error: e instanceof Error ? e.message : String(e) }))
        .finally(() => inFlight.delete(key));
      inFlight.set(key, job);
    }
    job.then(sendResponse);
    return true; // async response
  }

  return false;
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") chrome.runtime.openOptionsPage();
});
