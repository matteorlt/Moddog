import { analyzeRepo } from "./lib/analyze";
import { getCached } from "./lib/cache";
import type { AnalyzeResponse, Message } from "./lib/types";

// One analysis per repo at a time, even if the popup and the page badge both ask.
const inFlight = new Map<string, Promise<AnalyzeResponse>>();

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type === "getCached") {
    getCached(message.repo).then((entry) =>
      sendResponse(entry ? { ok: true, analysis: { ...entry.analysis, fromCache: true } } : { ok: false, error: "not cached" }),
    );
    return true;
  }

  if (message.type === "analyze") {
    const key = `${message.repo.owner}/${message.repo.repo}`.toLowerCase();
    let job = inFlight.get(key);
    if (!job) {
      job = analyzeRepo(message.repo, message.force)
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
