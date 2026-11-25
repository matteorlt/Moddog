import { aiVerdict } from "./ai";
import { assetToTexts, sha256Hex } from "./binary";
import { getCached, putCached } from "./cache";
import {
  downloadCapped,
  GitHubClient,
  gitRefs,
  type OwnerInfo,
  RateLimitError,
  type Release,
  type ReleaseAsset,
  type RepoInfo,
  rawFile,
  type SourceFile,
  scrapeLatestRelease,
  sourceFromZip,
} from "./github";
import { type HeuristicHit, isScannable, scanPriority, scanText } from "./heuristics";
import { reputationFindings } from "./reputation";
import { getSettings } from "./settings";
import type { Analysis, Finding, PageHints, RepoRef, RiskLevel, Settings } from "./types";
import { lookupHash, vtFinding } from "./virustotal";

const MAX_ZIP_BYTES = 40 * 1024 * 1024;
const MAX_SOURCE_FILE_BYTES = 300_000;
/** Only used in the fallback mode (archive too big), where each file is a separate download. */
const MAX_FALLBACK_FILES = 80;
const MAX_ASSETS = 5;
const MAX_ASSET_BYTES = 50 * 1024 * 1024;
const MAX_AI_EXCERPTS = 25;

const SEVERITY_RANK: Record<Finding["severity"], number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const LEVEL_RANK: Record<RiskLevel, number> = { unknown: -1, clean: 0, suspicious: 1, risky: 2, malware: 3 };

function assetSignature(release: Release | null): string {
  return (release?.assets ?? [])
    .map((a) => `${a.name}|${a.size}|${a.updatedAt}`)
    .sort()
    .join(";");
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++]!;
      results.push(await fn(item));
    }
  });
  await Promise.all(workers);
  return results;
}

function hitToFinding(hit: HeuristicHit): Finding {
  return { source: "heuristic", severity: hit.rule.severity, title: hit.rule.title, location: hit.location };
}

/** Level from local signals only (used when no AI ran). Heuristics alone never say "malware". */
function levelFromFindings(findings: Finding[]): RiskLevel {
  if (findings.some((f) => f.source === "antivirus" && f.severity === "critical")) return "malware";
  const max = Math.max(-1, ...findings.map((f) => SEVERITY_RANK[f.severity]));
  if (max >= SEVERITY_RANK.critical) return "risky";
  if (max >= SEVERITY_RANK.medium) return "suspicious";
  return "clean";
}

function summaryFor(level: RiskLevel, aiRan: boolean): string {
  switch (level) {
    case "clean":
      return aiRan ? "Nothing suspicious found." : "No red flags in the files that were checked.";
    case "suspicious":
      return "Something smells odd. Look at the signals before installing.";
    case "risky":
      return "Risky behavior detected. Don't install unless you trust the author.";
    case "malware":
      return "This looks like malware. Don't install it.";
    default:
      return "Couldn't sniff this one.";
  }
}

/** API first; on rate limit, read the release from github.com pages instead. */
async function getRelease(gh: GitHubClient, ref: RepoRef): Promise<{ release: Release | null; limited: boolean }> {
  try {
    return { release: await gh.latestRelease(ref), limited: false };
  } catch (e) {
    if (!(e instanceof RateLimitError)) throw e;
    return { release: await scrapeLatestRelease(ref).catch(() => null), limited: true };
  }
}

async function getReputation(
  gh: GitHubClient,
  ref: RepoRef,
): Promise<{ info: RepoInfo | null; owner: OwnerInfo | null }> {
  try {
    const info = await gh.repo(ref);
    const owner = await gh.owner(info.ownerLogin).catch(() => null);
    return { info, owner };
  } catch {
    return { info: null, owner: null };
  }
}

/**
 * Source files: the whole repo as one zip (no API call). If the archive is too
 * big, fall back to the API file list + the most important files one by one.
 */
async function getSource(
  gh: GitHubClient,
  ref: RepoRef,
  sha: string,
): Promise<{ files: SourceFile[]; partial: boolean }> {
  const keep = (path: string, size: number) => isScannable(path) && size <= MAX_SOURCE_FILE_BYTES;
  const fromZip = await sourceFromZip(ref, sha, MAX_ZIP_BYTES, keep);
  if (fromZip) return { files: fromZip, partial: false };

  const tree = await gh.tree(ref, sha);
  const paths = tree
    .filter((e) => e.type === "blob" && keep(e.path, e.size ?? 0))
    .sort((a, b) => scanPriority(a.path) - scanPriority(b.path))
    .slice(0, MAX_FALLBACK_FILES)
    .map((e) => e.path);
  const files: SourceFile[] = [];
  await mapLimit(paths, 6, async (path) => {
    try {
      files.push({ path, text: await rawFile(ref, sha, path) });
    } catch {
      /* unreadable file: skip */
    }
  });
  return { files, partial: true };
}

async function scanAsset(asset: ReleaseAsset, settings: Settings, vtAllowed: boolean) {
  const bytes = await downloadCapped(asset.downloadUrl, MAX_ASSET_BYTES);
  if (!bytes) return null;
  const findings: Finding[] = [];
  const hash = await sha256Hex(bytes);

  let vtScanned = false;
  if (settings.virusTotalKey && vtAllowed) {
    try {
      const vt = await lookupHash(hash, settings.virusTotalKey);
      vtScanned = true;
      const f = vtFinding(asset.name, vt);
      if (f) findings.push(f);
    } catch (e) {
      findings.push({
        source: "antivirus",
        severity: "info",
        title: "VirusTotal lookup failed",
        detail: String(e),
        location: asset.name,
      });
    }
  }

  const hits = assetToTexts(asset.name, bytes).flatMap((f) => scanText(f.text, f.path));
  return { hash, findings, hits, vtScanned };
}

export async function analyzeRepo(ref: RepoRef, force = false, hints: PageHints = {}): Promise<Analysis> {
  const settings = await getSettings();
  const gh = new GitHubClient(settings.githubToken);

  // Head commit without the API, release with API + ETag (scraped if limited).
  const [{ headSha }, { release, limited: releaseLimited }] = await Promise.all([gitRefs(ref), getRelease(gh, ref)]);
  const signature = assetSignature(release);

  const cached = await getCached(ref);
  if (!force && cached && cached.analysis.commitSha === headSha && cached.assetSignature === signature) {
    return { ...cached.analysis, fromCache: true };
  }

  const { info, owner } = await getReputation(gh, ref);
  const findings: Finding[] = reputationFindings(info, owner, release, hints);
  if (!info || releaseLimited) {
    findings.push({
      source: "reputation",
      severity: "info",
      title: "Reputation partly checked",
      detail:
        "GitHub's hourly API limit was reached, so account age and star history were skipped. A GitHub token in the settings avoids this.",
    });
  }

  // --- Source files, re-scanning only what changed since the cached analysis ---
  const hits: HeuristicHit[] = [];
  const kept: Finding[] = [];
  const fileHashes: Record<string, string> = {};
  let files: SourceFile[] = [];
  let partial = false;
  try {
    ({ files, partial } = await getSource(gh, ref, headSha));
  } catch (e) {
    findings.push({
      source: "heuristic",
      severity: "info",
      title: "Source code not checked",
      detail:
        e instanceof RateLimitError
          ? "This repository is too big to download at once and GitHub's API limit was reached."
          : String(e),
    });
  }
  const previous = force ? undefined : cached?.fileHashes;
  const unchanged = new Set<string>();
  for (const file of files) {
    const hash = await sha256Hex(new TextEncoder().encode(file.text));
    fileHashes[file.path] = hash;
    if (previous?.[file.path] === hash) unchanged.add(file.path);
    else hits.push(...scanText(file.text, file.path));
  }
  if (cached && unchanged.size) {
    kept.push(
      ...cached.analysis.findings.filter((f) => f.source === "heuristic" && f.location && unchanged.has(f.location)),
    );
  }
  if (partial) {
    findings.push({
      source: "heuristic",
      severity: "info",
      title: "Large repository: only the most important files were checked",
      detail: `${files.length} files, starting with build scripts and installers.`,
    });
  }

  // --- Release assets ---
  const assetHashes: Record<string, string> = {};
  let antivirus = false;
  const vtAllowed = await chrome.permissions.contains({ origins: ["https://www.virustotal.com/*"] });
  const assets = (release?.assets ?? []).filter((a) => a.size <= MAX_ASSET_BYTES).slice(0, MAX_ASSETS);
  // Same release files as last time (checked through the API, not scraped): reuse their results.
  const reuseAssets = !force && cached && cached.assetSignature === signature && !releaseLimited;
  if (reuseAssets) {
    const names = Object.keys(cached.analysis.assetHashes);
    Object.assign(assetHashes, cached.analysis.assetHashes);
    antivirus = cached.analysis.coverage.antivirus;
    kept.push(
      ...cached.analysis.findings.filter(
        (f) =>
          f.source !== "reputation" &&
          f.source !== "ai" &&
          f.location &&
          names.some((n) => f.location === n || f.location!.startsWith(`${n}!/`)),
      ),
    );
  }
  for (const asset of reuseAssets ? [] : assets) {
    try {
      const r = await scanAsset(asset, settings, vtAllowed);
      if (!r) {
        findings.push({
          source: "heuristic",
          severity: "info",
          title: "Release file too big to check",
          location: asset.name,
        });
        continue;
      }
      assetHashes[asset.name] = r.hash;
      findings.push(...r.findings);
      hits.push(...r.hits);
      antivirus ||= r.vtScanned;
    } catch (e) {
      findings.push({
        source: "heuristic",
        severity: "info",
        title: "Couldn't download release file",
        detail: String(e),
        location: asset.name,
      });
    }
  }

  const priorFindings = [...findings, ...kept];
  findings.push(...kept, ...hits.map(hitToFinding));

  // --- AI: only when there is something to explain, to save the user's credits ---
  let ai: Analysis["ai"];
  const worthAsking = findings.some((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK.medium);
  if (settings.aiProvider !== "none" && worthAsking) {
    try {
      const repoLine = info
        ? `Stars: ${info.stars}, forks: ${info.forks}, created: ${info.createdAt}, last push: ${info.pushedAt}.`
        : `Stars: ${hints.stars ?? "unknown"}, forks: ${hints.forks ?? "unknown"}.`;
      ai = await aiVerdict(settings, {
        repoName: `${ref.owner}/${ref.repo}`,
        context: `${repoLine} Latest release: ${release ? `${release.tagName} with assets ${release.assets.map((a) => a.name).join(", ") || "(none)"}` : "none"}.`,
        excerpts: hits
          .sort((a, b) => SEVERITY_RANK[b.rule.severity] - SEVERITY_RANK[a.rule.severity])
          .slice(0, MAX_AI_EXCERPTS)
          .map((h) => ({ location: h.location, rule: h.rule.title, excerpt: h.excerpt })),
        priorFindings,
      });
    } catch (e) {
      findings.push({ source: "ai", severity: "info", title: "AI analysis failed", detail: String(e) });
    }
  }

  let level = ai ? ai.level : levelFromFindings(findings);
  // Strong antivirus consensus is never fully overruled by the AI.
  if (
    ai &&
    findings.some((f) => f.source === "antivirus" && f.severity === "critical") &&
    LEVEL_RANK[level] < LEVEL_RANK.suspicious
  ) {
    level = "suspicious";
  }

  const analysis: Analysis = {
    repo: ref,
    commitSha: headSha,
    assetHashes,
    level,
    summary: ai?.summary || summaryFor(level, Boolean(ai)),
    findings,
    ai,
    coverage: {
      reputation: Boolean(info),
      heuristics: files.length > 0,
      antivirus,
      ai: Boolean(ai),
      filesScanned: files.length,
      assetsScanned: Object.keys(assetHashes).length,
    },
    analyzedAt: new Date().toISOString(),
  };

  await putCached(ref, { analysis, assetSignature: signature, fileHashes });
  return analysis;
}
