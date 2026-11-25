import type { Finding } from "./types";

/**
 * Static rules run locally on source files and on strings extracted from
 * release binaries. They are cheap and free: their job is to flag snippets
 * worth sending to the AI, not to give a final verdict on their own.
 *
 * Contributions welcome: keep rules specific enough to avoid false positives
 * on ordinary mods (networking libraries, update checkers, etc.).
 */
export interface Rule {
  id: string;
  title: string;
  severity: Finding["severity"];
  pattern: RegExp;
}

export const RULES: Rule[] = [
  {
    id: "discord-webhook",
    title: "Hard-coded Discord webhook (common exfiltration channel)",
    severity: "high",
    pattern: /discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/i,
  },
  {
    id: "telegram-bot",
    title: "Hard-coded Telegram bot API call (common exfiltration channel)",
    severity: "high",
    pattern: /api\.telegram\.org\/bot\d+:[\w-]+/i,
  },
  {
    id: "discord-token-paths",
    title: "Reads Discord local storage (token stealing)",
    severity: "critical",
    pattern: /discord(?:canary|ptb)?[\\/]+Local Storage[\\/]+leveldb/i,
  },
  {
    id: "browser-credentials",
    title: "Reads browser saved passwords or cookies",
    severity: "critical",
    // Chrome's exact file names as quoted strings (case-sensitive), or the profile path.
    // Not a bare "cookies": UI text like "Accept cookies" is everywhere.
    pattern:
      /["'`](Login Data|Local State|Web Data)["'`]|User Data[\\/]+(Default|Profile \d+)[\\/]+(Login Data|Network[\\/]+Cookies|Local State)/,
  },
  {
    id: "minecraft-session",
    title: "Accesses Minecraft/launcher session tokens",
    severity: "high",
    // Not a bare "accessToken =": build scripts use it to publish to Modrinth/CurseForge.
    pattern:
      /(launcher_accounts(_microsoft_store)?\.json|launcher_profiles\.json|getSession\(\)\.(getToken|getAccessToken)|\bfunc_148254_d\b|session\.getAccessToken\(\))/i,
  },
  {
    id: "crypto-wallets",
    title: "Looks for crypto wallet files",
    severity: "high",
    pattern:
      /(wallet\.dat|Exodus[\\/]+exodus\.wallet|Electrum[\\/]+wallets|MetaMask|nkbihfbeogaeaoehlefnkodbefgpgknn)/i,
  },
  {
    id: "powershell-encoded",
    title: "Runs encoded or hidden PowerShell",
    severity: "high",
    pattern: /powershell(\.exe)?["'\s,]+.*(-enc(odedcommand)?|-w(indowstyle)?\s+hidden|-nop)/i,
  },
  {
    id: "download-and-execute",
    title: "Downloads then executes a file",
    severity: "high",
    pattern:
      /(Invoke-WebRequest|DownloadFile|DownloadString|urlretrieve|curl\s+-[sSLo]+|wget\s).{0,200}(Start-Process|Runtime\.getRuntime\(\)\.exec|ProcessBuilder|os\.system|subprocess|\.exe)/is,
  },
  {
    id: "runtime-exec",
    title: "Spawns system processes",
    severity: "medium",
    pattern:
      /(Runtime\.getRuntime\(\)\.exec|new ProcessBuilder|child_process|subprocess\.(Popen|call|run)|os\.system\(|Process\.Start\()/,
  },
  {
    id: "dynamic-code",
    title: "Loads or evaluates code at runtime",
    severity: "medium",
    pattern: /(\beval\s*\(|new Function\s*\(|URLClassLoader|defineClass\s*\(|Assembly\.Load\s*\(|exec\s*\(\s*base64)/,
  },
  {
    id: "persistence",
    title: "Sets up persistence (startup folder, registry Run key, scheduled task)",
    severity: "high",
    pattern: /(CurrentVersion\\+Run\b|Start Menu\\+Programs\\+Startup|schtasks(\.exe)?\s+\/create|crontab\s+-)/i,
  },
  {
    id: "defender-tamper",
    title: "Tries to disable or bypass antivirus",
    severity: "critical",
    pattern: /(Set-MpPreference|Add-MpPreference\s+-ExclusionPath|DisableRealtimeMonitoring)/i,
  },
  {
    id: "paste-site-payload",
    title: "Fetches content from a paste site or raw file host",
    severity: "medium",
    pattern: /(pastebin\.com\/raw|paste\.ee\/r|hastebin\.com\/raw|rentry\.co\/[\w-]+\/raw|transfer\.sh\/)/i,
  },
  {
    id: "ip-grabber",
    title: "Looks up the user's public IP (often part of stealer reports)",
    severity: "low",
    pattern: /(api\.ipify\.org|ipinfo\.io\/json|ip-api\.com\/json|checkip\.amazonaws\.com)/i,
  },
  {
    id: "large-base64",
    title: "Large base64 blob (possible hidden payload)",
    severity: "medium",
    pattern: /["'`][A-Za-z0-9+/]{600,}={0,2}["'`]/,
  },
];

/**
 * Where a match was found. Security tools, rule lists, tests and docs are full
 * of these strings as *data*; flagging them like real code would make every
 * scanner (including Moddog itself) look like malware.
 */
export type HitContext = "code" | "test" | "pattern";

export interface HeuristicHit {
  rule: Rule;
  location: string;
  /** A short excerpt around the match, sent to the AI for context. */
  excerpt: string;
  /** The rule's severity, lowered when the context makes it unlikely to run. */
  severity: Finding["severity"];
  context: HitContext;
  /** Why the severity was lowered, shown to the user and the AI. */
  note?: string;
}

const EXCERPT_RADIUS = 300;
const MAX_MATCHES_PER_RULE = 50;

/** Tests, fixtures, examples and docs: not part of what a user installs or runs. */
const TEST_PATH =
  /(^|\/)(tests?|__tests__|spec|specs|fixtures?|examples?|samples?|docs?|testdata)\/|\.(test|spec)\.[a-z]+$|_test\.(go|py)$|(^|\/)test_[^/]+\.py$/i;

/**
 * A line that *defines* a pattern rather than doing the thing: regex syntax
 * (`(?:`, `[\\/]`, `\s*`, `\d+`…) or an explicit regex/pattern API.
 * Plain Windows paths like "\\discord\\Local Storage" don't count.
 */
const PATTERN_LINE =
  /\(\?[:=!<]|\[\\\\\/\]|\[\\\/\\\\\]|\\[dswbDSWB][*+?{]|\bpattern\s*[:=]|\bnew RegExp\(|\bPattern\.compile\(|\bre\.(compile|search|match)\(|\byara\b|^\s*\$\w+\s*=\s*["{/]|^\s*(pattern\s*:\s*)?\/.+\/[dgimsuyv]*[,;)]?\s*$/i;

function lineAround(text: string, index: number): string {
  const start = text.lastIndexOf("\n", index) + 1;
  const end = text.indexOf("\n", index);
  return text.slice(start, end === -1 ? text.length : end);
}

const LOWER: Record<Finding["severity"], Finding["severity"]> = {
  critical: "low",
  high: "low",
  medium: "low",
  low: "info",
  info: "info",
};

export function scanText(text: string, location: string): HeuristicHit[] {
  const hits: HeuristicHit[] = [];
  const inTests = TEST_PATH.test(location.replace(/^.*!\//, ""));

  for (const rule of RULES) {
    // Look at every match: a file can define a pattern on one line and use the
    // behavior for real further down. The first "real" match wins.
    const global = new RegExp(
      rule.pattern.source,
      rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`,
    );
    let chosen: RegExpExecArray | null = null;
    let firstPatternMatch: RegExpExecArray | null = null;
    let count = 0;
    for (let m = global.exec(text); m && count < MAX_MATCHES_PER_RULE; m = global.exec(text), count++) {
      if (m[0].length === 0) global.lastIndex++;
      if (PATTERN_LINE.test(lineAround(text, m.index))) {
        firstPatternMatch ??= m;
      } else {
        chosen = m;
        break;
      }
    }
    const m = chosen ?? firstPatternMatch;
    if (!m) continue;

    const start = Math.max(0, m.index - EXCERPT_RADIUS);
    const end = Math.min(text.length, m.index + m[0].length + EXCERPT_RADIUS);
    let excerpt = text.slice(start, end);
    if (rule.id === "large-base64") excerpt = `${m[0].slice(0, 120)}… (${m[0].length} chars)`;

    let context: HitContext = "code";
    let note: string | undefined;
    if (!chosen) {
      context = "pattern";
      note = "Looks like a detection pattern (e.g. in a security tool), not code that does this.";
    } else if (inTests) {
      context = "test";
      note = "Found in a test, example or docs file: usually not part of what gets installed.";
    }
    const severity = context === "code" ? rule.severity : LOWER[rule.severity];
    hits.push({ rule, location, excerpt, severity, context, note });
  }
  return hits;
}

/** Source files worth scanning, by extension. */
export const SCANNABLE_EXTENSIONS = [
  ".java",
  ".kt",
  ".kts",
  ".groovy",
  ".gradle",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".py",
  ".cs",
  ".lua",
  ".ps1",
  ".bat",
  ".cmd",
  ".sh",
  ".vbs",
  ".json",
  ".toml",
  ".yml",
  ".yaml",
];

export function isScannable(path: string): boolean {
  const lower = path.toLowerCase();
  if (/(^|\/)(node_modules|vendor|dist|build|\.git)\//.test(lower)) return false;
  if (lower.endsWith(".min.js") || lower.endsWith("package-lock.json")) return false;
  return SCANNABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Files that run automatically at build/install time get scanned first. */
export function scanPriority(path: string): number {
  const lower = path.toLowerCase();
  if (
    /(^|\/)(build\.gradle(\.kts)?|settings\.gradle(\.kts)?|package\.json|setup\.py|install\.(ps1|bat|sh))$/.test(lower)
  )
    return 0;
  if (lower.startsWith(".github/workflows/")) return 1;
  if (/\.(ps1|bat|cmd|vbs|sh)$/.test(lower)) return 1;
  return 2;
}
