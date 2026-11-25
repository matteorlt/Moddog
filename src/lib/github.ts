import type { RepoRef } from "./types";

const API = "https://api.github.com";

/** GitHub paths that look like /owner/repo but are not repositories. */
const RESERVED_OWNERS = new Set([
  "about", "account", "apps", "codespaces", "collections", "contact", "customer-stories",
  "enterprise", "events", "explore", "features", "issues", "login", "marketplace",
  "new", "notifications", "orgs", "organizations", "pricing", "pulls", "search",
  "security", "settings", "sponsors", "topics", "trending", "users",
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

export interface RepoInfo {
  fullName: string;
  defaultBranch: string;
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

export interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

export interface ReleaseAsset {
  name: string;
  size: number;
  downloadUrl: string;
  downloadCount: number;
  updatedAt: string;
}

export interface Release {
  tagName: string;
  publishedAt: string;
  assets: ReleaseAsset[];
}

export class GitHubClient {
  constructor(private readonly token: string) {}

  private async get<T>(path: string): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(`${API}${path}`, { headers });
    if (res.status === 403 || res.status === 429) {
      throw new Error(
        "GitHub API rate limit reached. Add a read-only GitHub token in Moddog's options to raise the limit.",
      );
    }
    if (!res.ok) throw new Error(`GitHub API ${res.status} on ${path}`);
    return (await res.json()) as T;
  }

  async repo({ owner, repo }: RepoRef): Promise<RepoInfo> {
    const r = await this.get<{
      full_name: string; default_branch: string; stargazers_count: number; forks_count: number;
      created_at: string; pushed_at: string; archived: boolean;
      owner: { login: string; type: string };
    }>(`/repos/${owner}/${repo}`);
    return {
      fullName: r.full_name,
      defaultBranch: r.default_branch,
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
    const u = await this.get<{ created_at: string; public_repos: number; followers: number }>(
      `/users/${login}`,
    );
    return { createdAt: u.created_at, publicRepos: u.public_repos, followers: u.followers };
  }

  async headSha({ owner, repo }: RepoRef, branch: string): Promise<string> {
    const c = await this.get<{ sha: string }>(
      `/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`,
    );
    return c.sha;
  }

  async tree({ owner, repo }: RepoRef, sha: string): Promise<TreeEntry[]> {
    const t = await this.get<{ tree: TreeEntry[]; truncated: boolean }>(
      `/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`,
    );
    return t.tree;
  }

  /** Paths changed between two commits (used for incremental re-analysis). */
  async changedFiles({ owner, repo }: RepoRef, base: string, head: string): Promise<string[] | null> {
    try {
      const cmp = await this.get<{ status: string; files?: { filename: string; status: string }[] }>(
        `/repos/${owner}/${repo}/compare/${base}...${head}`,
      );
      // "diverged"/"behind" means history was rewritten: the old analysis can't be trusted.
      if (cmp.status !== "ahead" && cmp.status !== "identical") return null;
      return (cmp.files ?? []).filter((f) => f.status !== "removed").map((f) => f.filename);
    } catch {
      return null;
    }
  }

  async latestRelease({ owner, repo }: RepoRef): Promise<Release | null> {
    try {
      const r = await this.get<{
        tag_name: string; published_at: string;
        assets: { name: string; size: number; browser_download_url: string; download_count: number; updated_at: string }[];
      }>(`/repos/${owner}/${repo}/releases/latest`);
      return {
        tagName: r.tag_name,
        publishedAt: r.published_at,
        assets: r.assets.map((a) => ({
          name: a.name,
          size: a.size,
          downloadUrl: a.browser_download_url,
          downloadCount: a.download_count,
          updatedAt: a.updated_at,
        })),
      };
    } catch {
      return null; // no release
    }
  }

  async rawFile({ owner, repo }: RepoRef, sha: string, path: string): Promise<string> {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`raw ${res.status} on ${path}`);
    return res.text();
  }
}
