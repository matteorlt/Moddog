import type { Analysis, RepoRef } from "./types";

/**
 * Local cache of past analyses, keyed by repository. An entry is reused as-is
 * when the head commit and the release files haven't changed. Otherwise the
 * per-file hashes let the next analysis re-scan only the files that changed,
 * without asking GitHub for a diff.
 */
export interface CacheEntry {
  analysis: Analysis;
  /** name|size|updatedAt of each release asset: detects silently replaced files. */
  assetSignature: string;
  /** sha256 of each scanned source file, by path. */
  fileHashes: Record<string, string>;
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
