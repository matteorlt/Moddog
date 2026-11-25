import { unzipSync } from "fflate";
import type { RepoRef } from "./types";

/*
 * GitHub access, cheapest source first:
 * - git smart HTTP (info/refs) for the default branch and head commit: no API, no rate limit
 * - codeload zip archives for the source code: no API, no rate limit
 * - the REST API only for reputation and releases, with ETags so unchanged answers are free
 * - scraping github.com pages as a last resort when the API limit is reached
 */

const API = "https://api.github.com";

/** GitHub paths that look like /owner/repo but are not repositories. */
const RESERVED_OWNERS = new Set([
  "about",
  "account",
  "apps",
  "codespaces",
  "collections",
  "contact",
  "customer-stories",
  "enterprise",
  "events",
  "explore",
  "features",
  "issues",
  "login",
  "marketplace",
  "new",
  "notifications",
  "orgs",
  "organizations",
  "pricing",
  "pulls",
  "search",
  "security",
  "settings",
  "sponsors",
  "topics",
  "trending",
  "users",
]);

export function parseRepoUrl(url: string): RepoRef | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.hostname !== "github.com") return null;
  const [owner, repo] = u.pathname.split("/").filter(Boolean);
  if (!owner || !repo || RESERVED_OWNERS.has(owner.toLowerCase())) return null;
  return { owner, repo: repo.replace(/\.git$/, "") };
}

export class RateLimitError extends Error {
  constructor() {
    super("GitHub API rate limit reached.");
  }
}

export interface RepoInfo {
  fullName: string;
  stars: number;
  forks: number;
  createdAt: string;
  pushedAt: string;
  ownerLogin: string;
  ownerType: string;
  archived: boolean;
}

export interface OwnerInfo {
  createdAt: string;
  publicRepos: number;
  followers: number;
}

export interface ReleaseAsset {
  name: string;
  /** 0 when unknown (scraped release). */
  size: number;
  downloadUrl: string;
  /** Empty when unknown (scraped release). */
  updatedAt: string;
}

export interface Release {
  tagName: string;
  assets: ReleaseAsset[];
}

export interface GitRefs {
  defaultBranch: string;
  headSha: string;
}

export interface SourceFile {
  path: string;
  text: string;
}

// ---------- Git smart HTTP ----------

/**
 * Default branch and its head commit, read like `git clone` does.
 * Works for any public repository and doesn't touch the API rate limit.
 */
export async function gitRefs({ owner, repo }: RepoRef): Promise<GitRefs> {
  const res = await fetch(`https://github.com/${owner}/${repo}.git/info/refs?service=git-upload-pack`);
  if (res.status === 401 || res.status === 404) throw new Error("Repository not found, or it's private.");
  if (!res.ok) throw new Error(`GitHub returned ${res.status} while reading the repository.`);
  const text = await res.text();
  const head = /([0-9a-f]{40}) HEAD\0/.exec(text)?.[1];
  const branch = /symref=HEAD:refs\/heads\/(\S+)/.exec(text)?.[1];
  if (!head || !branch) throw new Error("This repository looks empty.");
  return { defaultBranch: branch, headSha: head };
}

// ---------- downloads ----------

/** Downloads a file, giving up (null) as soon as it grows past `maxBytes`. */
export async function downloadCapped(url: string, maxBytes: number): Promise<Uint8Array | null> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    await res.body?.cancel();
    return null;
  }
  if (!res.body) return new Uint8Array(await res.arrayBuffer());

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * The whole repository at `sha` as one zip from codeload (no API call), keeping
 * only the files `keep` accepts. Returns null if the archive is too big.
 */
export async function sourceFromZip(
  { owner, repo }: RepoRef,
  sha: string,
  maxZipBytes: number,
  keep: (path: string, size: number) => boolean,
): Promise<SourceFile[] | null> {
  const zip = await downloadCapped(`https://codeload.github.com/${owner}/${repo}/zip/${sha}`, maxZipBytes);
  if (!zip) return null;
  const decoder = new TextDecoder();
  // Entries are prefixed with a "<repo>-<ref>/" folder: strip it.
  const strip = (name: string) => name.slice(name.indexOf("/") + 1);
  const entries = unzipSync(zip, { filter: (f) => !f.name.endsWith("/") && keep(strip(f.name), f.originalSize) });
  return Object.entries(entries).map(([name, data]) => ({ path: strip(name), text: decoder.decode(data) }));
}

export async function rawFile({ owner, repo }: RepoRef, sha: string, path: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`raw ${res.status} on ${path}`);
  return res.text();
}

// ---------- scraping fallbacks (used only when the API limit is reached) ----------

/** Latest release read from github.com pages instead of the API. */
export async function scrapeLatestRelease({ owner, repo }: RepoRef): Promise<Release | null> {
  const res = await fetch(`https://github.com/${owner}/${repo}/releases/latest`);
  if (!res.ok) return null;
  const tagMatch = /\/releases\/tag\/([^/?#]+)/.exec(res.url);
  await res.body?.cancel();
  if (!tagMatch?.[1]) return null; // no release: GitHub stays on /releases
  const tag = decodeURIComponent(tagMatch[1]);

  const html = await (
    await fetch(`https://github.com/${owner}/${repo}/releases/expanded_assets/${tagMatch[1]}`)
  ).text();
  const prefix = `/${owner}/${repo}/releases/download/`;
  const seen = new Set<string>();
  const assets: ReleaseAsset[] = [];
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const href = m[1]!;
    if (!href.toLowerCase().startsWith(prefix.toLowerCase()) || seen.has(href)) continue;
    seen.add(href);
    const name = decodeURIComponent(href.slice(href.lastIndexOf("/") + 1));
    assets.push({ name, size: 0, downloadUrl: `https://github.com${href}`, updatedAt: "" });
  }
  return { tagName: tag, assets };
}

// ---------- REST API ----------

interface EtagEntry {
  etag: string;
  body: unknown;
}

export class GitHubClient {
  constructor(private readonly token: string) {}

  /**
   * GET with ETag caching: when GitHub answers 304 Not Modified we reuse the
   * stored body, and per GitHub's docs that request doesn't count toward the limit.
   */
  private async get<T>(path: string, useEtag = true): Promise<T> {
    const key = `gh:${path}`;
    const stored = useEtag ? ((await chrome.storage.local.get(key))[key] as EtagEntry | undefined) : undefined;
    const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (stored) headers["If-None-Match"] = stored.etag;

    const res = await fetch(`${API}${path}`, { headers });
    if (res.status === 304 && stored) return stored.body as T;
    if (res.status === 429 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0")) {
      throw new RateLimitError();
    }
    if (!res.ok) throw new Error(`GitHub API ${res.status} on ${path}`);
    const body = (await res.json()) as T;
    const etag = res.headers.get("etag");
    if (etag && useEtag) await chrome.storage.local.set({ [key]: { etag, body } satisfies EtagEntry });
    return body;
  }

  async repo({ owner, repo }: RepoRef): Promise<RepoInfo> {
    const r = await this.get<{
      full_name: string;
      stargazers_count: number;
      forks_count: number;
      created_at: string;
      pushed_at: string;
      archived: boolean;
      owner: { login: string; type: string };
    }>(`/repos/${owner}/${repo}`);
    return {
      fullName: r.full_name,
      stars: r.stargazers_count,
      forks: r.forks_count,
      createdAt: r.created_at,
      pushedAt: r.pushed_at,
      ownerLogin: r.owner.login,
      ownerType: r.owner.type,
      archived: r.archived,
    };
  }

  async owner(login: string): Promise<OwnerInfo> {
    const u = await this.get<{ created_at: string; public_repos: number; followers: number }>(`/users/${login}`);
    return { createdAt: u.created_at, publicRepos: u.public_repos, followers: u.followers };
  }

  /** Latest release, or null if the repository has none. Throws RateLimitError when limited. */
  async latestRelease({ owner, repo }: RepoRef): Promise<Release | null> {
    try {
      const r = await this.get<{
        tag_name: string;
        assets: { name: string; size: number; browser_download_url: string; updated_at: string }[];
      }>(`/repos/${owner}/${repo}/releases/latest`);
      return {
        tagName: r.tag_name,
        assets: r.assets.map((a) => ({
          name: a.name,
          size: a.size,
          downloadUrl: a.browser_download_url,
          updatedAt: a.updated_at,
        })),
      };
    } catch (e) {
      if (e instanceof RateLimitError) throw e;
      return null; // 404: no release
    }
  }

  /** File list at `sha`: only used when the zip archive is too big. */
  async tree({ owner, repo }: RepoRef, sha: string): Promise<{ path: string; type: string; size?: number }[]> {
    const t = await this.get<{ tree: { path: string; type: string; size?: number }[] }>(
      `/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`,
      false, // trees can be huge: don't store them
    );
    return t.tree;
  }
}
