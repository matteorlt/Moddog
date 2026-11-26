import { analyzeRepo } from "./lib/analyze";
import { getCached } from "./lib/cache";
import { repoKey } from "./lib/github";
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
    pageHints.set(repoKey({ ...message.repo, tag: undefined }), message.hints);
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
    // Hints are per repository; analyses are per repository + release tag.
    const key = repoKey(message.repo);
    let job = inFlight.get(key);
    if (!job) {
      job = analyzeRepo(message.repo, message.force, pageHints.get(repoKey({ ...message.repo, tag: undefined })))
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
