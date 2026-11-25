export type RiskLevel = "clean" | "suspicious" | "risky" | "malware" | "unknown";

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface Finding {
  /** Where the finding comes from. */
  source: "reputation" | "heuristic" | "antivirus" | "ai";
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  detail?: string;
  /** File path or release asset name, when relevant. */
  location?: string;
}

export interface AiVerdict {
  level: Exclude<RiskLevel, "unknown">;
  summary: string;
  explanation: string;
  findings: { file: string; issue: string; severity: Finding["severity"] }[];
}

export interface Analysis {
  repo: RepoRef;
  /** Commit SHA of the default branch that was analyzed. */
  commitSha: string;
  /** sha256 of each release asset that was analyzed, keyed by asset name. */
  assetHashes: Record<string, string>;
  level: RiskLevel;
  summary: string;
  findings: Finding[];
  ai?: AiVerdict;
  /** Which steps actually ran, so the UI can be honest about coverage. */
  coverage: {
    reputation: boolean;
    heuristics: boolean;
    antivirus: boolean;
    ai: boolean;
    filesScanned: number;
    assetsScanned: number;
  };
  analyzedAt: string;
  /** True when this result was served from the local cache. */
  fromCache?: boolean;
}

export type AiProvider = "none" | "anthropic" | "openai" | "gemini" | "openrouter" | "ollama";

export interface Settings {
  aiProvider: AiProvider;
  aiApiKey: string;
  aiModel: string;
  /** Base URL for Ollama (local). */
  ollamaUrl: string;
  virusTotalKey: string;
  githubToken: string;
}

/** Numbers read from the GitHub page by the content script, used when the API is unavailable. */
export interface PageHints {
  stars?: number;
  forks?: number;
}

export type Message =
  | { type: "analyze"; repo: RepoRef; force?: boolean }
  | { type: "getCached"; repo: RepoRef }
  | { type: "openOptions" }
  | { type: "pageHints"; repo: RepoRef; hints: PageHints };

export type AnalyzeResponse =
  | { ok: true; analysis: Analysis }
  | { ok: false; error: string };
