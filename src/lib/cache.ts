import type { Analysis, RepoRef } from "./types";

/**
 * Local cache of past analyses, keyed by repository. An entry is reused as-is
 * when the default branch head and the release assets haven't changed; when
 * only new commits landed, the analysis restarts from the diff.
 */
export interface CacheEntry {
  analysis: Analysis;
  /** name|size|updatedAt of each release asset: detects silently replaced files. */
  assetSignature: string;
}

const key = ({ owner, repo }: RepoRef) => `analysis:${owner.toLowerCase()}/${repo.toLowerCase()}`;

export async function getCached(repo: RepoRef): Promise<CacheEntry | null> {
  const k = key(repo);
  const stored = await chrome.storage.local.get(k);
  return (stored[k] as CacheEntry | undefined) ?? null;
}

export async function putCached(repo: RepoRef, entry: CacheEntry): Promise<void> {
  await chrome.storage.local.set({ [key(repo)]: entry });
}
