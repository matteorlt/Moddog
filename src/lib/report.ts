import type { Analysis, Finding, RiskLevel } from "./types";

/*
 * One-click reports: builds a link to Moddog's GitHub issue forms with the
 * analysis already filled in. Nothing is sent by Moddog itself: the user lands
 * on github.com, reads the prefilled issue, and submits it (or not).
 */

const ISSUES_NEW = "https://github.com/matteorlt/Moddog/issues/new";
/** Browsers and GitHub cope with long URLs, but stay well under the usual ~8 KB limits. */
const MAX_URL_LENGTH = 7000;

export const LEVEL_LABEL: Record<RiskLevel, string> = {
  clean: "Good boy",
  suspicious: "Odd smell",
  risky: "Growling",
  malware: "Barking!",
  unknown: "Not sniffed",
};

export const SEV_TAG: Record<Finding["severity"], string> = {
  critical: "CRIT",
  high: "HIGH",
  medium: "MED",
  low: "LOW",
  info: "INFO",
};
const SEV_ORDER: Finding["severity"][] = ["critical", "high", "medium", "low", "info"];

export type ReportKind = "false-positive" | "false-negative";

/** Which reports make sense for a verdict: "safe but flagged", "malware but missed", or both in between. */
export function reportKinds(level: RiskLevel): ReportKind[] {
  if (level === "clean") return ["false-negative"];
  if (level === "malware") return ["false-positive"];
  if (level === "unknown") return [];
  return ["false-positive", "false-negative"];
}

export function repoUrl(a: Analysis): string {
  const base = `https://github.com/${a.repo.owner}/${a.repo.repo}`;
  return a.repo.tag ? `${base}/releases/tag/${encodeURIComponent(a.repo.tag)}` : base;
}

function signalLines(a: Analysis): string[] {
  return [...a.findings]
    .sort((x, y) => SEV_ORDER.indexOf(x.severity) - SEV_ORDER.indexOf(y.severity))
    .map((f) => `- [${SEV_TAG[f.severity]}] ${f.title}${f.location ? ` · ${f.location}` : ""}`);
}

/** Plain-text summary of an analysis, as pasted in a report. */
export function reportText(a: Analysis, version: string): string {
  const c = a.coverage;
  const where = `${a.repo.owner}/${a.repo.repo}${a.repo.tag ? ` (release ${a.repo.tag})` : ""}`;
  const lines = [
    `Moddog ${version}: ${where} @ ${a.commitSha.slice(0, 7)}`,
    `Verdict: ${LEVEL_LABEL[a.level]}`,
    ...signalLines(a),
    `Checked: reputation ${c.reputation ? "✓" : "–"}, code ${c.filesScanned} files, releases ${c.assetsScanned} files, antivirus ${c.antivirus ? "✓" : "–"}, AI ${c.ai ? "✓" : "–"}`,
  ];
  return lines.join("\n");
}

/** Fits a text field into the URL budget, cutting whole lines and saying so. */
function fitLines(text: string, budget: number): string {
  if (encodeURIComponent(text).length <= budget) return text;
  const lines = text.split("\n");
  while (lines.length > 1) {
    lines.pop();
    const cut = `${lines.join("\n")}\n… (cut to fit the link; more signals in the panel)`;
    if (encodeURIComponent(cut).length <= budget) return cut;
  }
  return "";
}

/** Link to the right issue form, prefilled with this analysis. */
export function reportIssueUrl(a: Analysis, kind: ReportKind, version: string): string {
  const name = `${a.repo.owner}/${a.repo.repo}`;
  const params = new URLSearchParams();
  const setup = `${version}, AI ${a.coverage.ai ? "used" : "not used"}`;
  if (kind === "false-positive") {
    params.set("template", "1-false-positive.yml");
    params.set("title", `[False positive] ${name}`);
    params.set("repo", repoUrl(a));
    // The form's dropdown only has the "flagged" verdicts.
    if (a.level !== "clean" && a.level !== "unknown") params.set("verdict", LEVEL_LABEL[a.level]);
    params.set("setup", setup);
  } else {
    params.set("template", "2-false-negative.yml");
    params.set("title", `[False negative] ${name}`);
    params.set("repo", repoUrl(a));
    params.set("verdict", `${LEVEL_LABEL[a.level]} (Moddog ${setup})`);
  }
  const field = kind === "false-positive" ? "signals" : "report";
  const used = `${ISSUES_NEW}?${params.toString()}&${field}=`.length;
  params.set(field, fitLines(reportText(a, version), MAX_URL_LENGTH - used));
  return `${ISSUES_NEW}?${params.toString()}`;
}
