import { aiVerdict } from "./ai";
import { assetToTexts, sha256Hex } from "./binary";
import { getCached, putCached } from "./cache";
import { GitHubClient, type Release, type ReleaseAsset } from "./github";
import { isScannable, scanPriority, scanText, type HeuristicHit } from "./heuristics";
import { reputationFindings } from "./reputation";
import { getSettings } from "./settings";
import type { Analysis, Finding, RepoRef, RiskLevel, Settings } from "./types";
import { lookupHash, vtFinding } from "./virustotal";

const MAX_SOURCE_FILES = 80;
const MAX_SOURCE_FILE_BYTES = 300_000;
const MAX_ASSETS = 5;
const MAX_ASSET_BYTES = 50 * 1024 * 1024;
const MAX_AI_EXCERPTS = 25;

const SEVERITY_RANK: Record<Finding["severity"], number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const LEVEL_RANK: Record<RiskLevel, number> = { unknown: -1, clean: 0, suspicious: 1, risky: 2, malware: 3 };

function assetSignature(release: Release | null): string {
  return (release?.assets ?? []).map((a) => `${a.name}|${a.size}|${a.updatedAt}`).sort().join(";");
}

async function hasOrigin(origin: string): Promise<boolean> {
  return chrome.permissions.contains({ origins: [origin] });
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

async function scanAsset(asset: ReleaseAsset, settings: Settings, vtAllowed: boolean) {
  const findings: Finding[] = [];
  const res = await fetch(asset.downloadUrl);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const hash = await sha256Hex(bytes);

  let vtScanned = false;
  if (settings.virusTotalKey && vtAllowed) {
    try {
      const vt = await lookupHash(hash, settings.virusTotalKey);
      vtScanned = true;
      const f = vtFinding(asset.name, vt);
      if (f) findings.push(f);
    } catch (e) {
      findings.push({ source: "antivirus", severity: "info", title: "VirusTotal lookup failed", detail: String(e), location: asset.name });
    }
  }

  const hits = assetToTexts(asset.name, bytes).flatMap((f) => scanText(f.text, f.path));
  return { hash, findings, hits, vtScanned };
}

export async function analyzeRepo(ref: RepoRef, force = false): Promise<Analysis> {
  const settings = await getSettings();
  const gh = new GitHubClient(settings.githubToken);

  const info = await gh.repo(ref);
  const [headSha, release, owner] = await Promise.all([
    gh.headSha(ref, info.defaultBranch),
    gh.latestRelease(ref),
    gh.owner(info.ownerLogin).catch(() => null),
  ]);
  const signature = assetSignature(release);

  const cached = await getCached(ref);
  if (!force && cached && cached.analysis.commitSha === headSha && cached.assetSignature === signature) {
    return { ...cached.analysis, fromCache: true };
  }

  // Incremental mode: only re-scan files changed since the cached commit.
  // Falls back to a full scan if history was rewritten (force-push) or the diff is unavailable.
  let changed: Set<string> | null = null;
  if (!force && cached && cached.analysis.commitSha !== headSha) {
    const files = await gh.changedFiles(ref, cached.analysis.commitSha, headSha);
    if (files) changed = new Set(files);
  }

  const findings: Finding[] = reputationFindings(info, owner, release);
  const hits: HeuristicHit[] = [];

  // --- Source files ---
  const tree = await gh.tree(ref, headSha);
  const candidates = tree
    .filter((e) => e.type === "blob" && isScannable(e.path) && (e.size ?? 0) <= MAX_SOURCE_FILE_BYTES)
    .filter((e) => !changed || changed.has(e.path))
    .sort((a, b) => scanPriority(a.path) - scanPriority(b.path))
    .slice(0, MAX_SOURCE_FILES);

  await mapLimit(candidates, 6, async (entry) => {
    try {
      const text = await gh.rawFile(ref, headSha, entry.path);
      hits.push(...scanText(text, entry.path));
    } catch {
      /* unreadable file: skip */
    }
  });

  // Keep previous heuristic findings for files that weren't touched.
  if (changed && cached) {
    findings.push(
      ...cached.analysis.findings.filter(
        (f) => f.source === "heuristic" && f.location && !f.location.includes("!/") && !changed!.has(f.location),
      ),
    );
  }

  // --- Release assets ---
  const assetHashes: Record<string, string> = {};
  let antivirus = false;
  const vtAllowed = await hasOrigin("https://www.virustotal.com/*");
  const assets = (release?.assets ?? []).filter((a) => a.size <= MAX_ASSET_BYTES).slice(0, MAX_ASSETS);
  for (const asset of assets) {
    try {
      const r = await scanAsset(asset, settings, vtAllowed);
      assetHashes[asset.name] = r.hash;
      findings.push(...r.findings);
      hits.push(...r.hits);
      antivirus ||= r.vtScanned;
    } catch (e) {
      findings.push({ source: "heuristic", severity: "info", title: "Couldn't download release file", detail: String(e), location: asset.name });
    }
  }

  findings.push(...hits.map(hitToFinding));

  // --- AI: only when there is something to explain, to save the user's credits ---
  let ai: Analysis["ai"];
  const worthAsking = findings.some((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK.medium);
  if (settings.aiProvider !== "none" && worthAsking) {
    try {
      ai = await aiVerdict(settings, {
        repoName: info.fullName,
        context: `Stars: ${info.stars}, forks: ${info.forks}, created: ${info.createdAt}, last push: ${info.pushedAt}. Latest release: ${release ? `${release.tagName} with assets ${release.assets.map((a) => a.name).join(", ") || "(none)"}` : "none"}.`,
        excerpts: hits
          .sort((a, b) => SEVERITY_RANK[b.rule.severity] - SEVERITY_RANK[a.rule.severity])
          .slice(0, MAX_AI_EXCERPTS)
          .map((h) => ({ location: h.location, rule: h.rule.title, excerpt: h.excerpt })),
        priorFindings: findings.filter((f) => f.source !== "heuristic"),
      });
    } catch (e) {
      findings.push({ source: "ai", severity: "info", title: "AI analysis failed", detail: String(e) });
    }
  }

  let level = ai ? ai.level : levelFromFindings(findings);
  // Strong antivirus consensus is never fully overruled by the AI.
  if (ai && findings.some((f) => f.source === "antivirus" && f.severity === "critical") && LEVEL_RANK[level] < LEVEL_RANK.suspicious) {
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
      reputation: true,
      heuristics: true,
      antivirus,
      ai: Boolean(ai),
      filesScanned: candidates.length,
      assetsScanned: Object.keys(assetHashes).length,
    },
    analyzedAt: new Date().toISOString(),
  };

  await putCached(ref, { analysis, assetSignature: signature });
  return analysis;
}
