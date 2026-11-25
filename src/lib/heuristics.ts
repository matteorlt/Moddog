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
    pattern: /(Login Data|Cookies|Local State)["'`]?\s*[),;]|User Data[\\/]+Default[\\/]+(Login Data|Network[\\/]+Cookies)/i,
  },
  {
    id: "minecraft-session",
    title: "Accesses Minecraft/launcher session tokens",
    severity: "high",
    // Not a bare "accessToken =": build scripts use it to publish to Modrinth/CurseForge.
    pattern: /(launcher_accounts(_microsoft_store)?\.json|launcher_profiles\.json|getSession\(\)\.(getToken|getAccessToken)|\bfunc_148254_d\b|session\.getAccessToken\(\))/i,
  },
  {
    id: "crypto-wallets",
    title: "Looks for crypto wallet files",
    severity: "high",
    pattern: /(wallet\.dat|Exodus[\\/]+exodus\.wallet|Electrum[\\/]+wallets|MetaMask|nkbihfbeogaeaoehlefnkodbefgpgknn)/i,
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
    pattern: /(Invoke-WebRequest|DownloadFile|DownloadString|urlretrieve|curl\s+-[sSLo]+|wget\s).{0,200}(Start-Process|Runtime\.getRuntime\(\)\.exec|ProcessBuilder|os\.system|subprocess|\.exe)/is,
  },
  {
    id: "runtime-exec",
    title: "Spawns system processes",
    severity: "medium",
    pattern: /(Runtime\.getRuntime\(\)\.exec|new ProcessBuilder|child_process|subprocess\.(Popen|call|run)|os\.system\(|Process\.Start\()/,
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

export interface HeuristicHit {
  rule: Rule;
  location: string;
  /** A short excerpt around the match, sent to the AI for context. */
  excerpt: string;
}

const EXCERPT_RADIUS = 300;

export function scanText(text: string, location: string): HeuristicHit[] {
  const hits: HeuristicHit[] = [];
  for (const rule of RULES) {
    const m = rule.pattern.exec(text);
    if (!m) continue;
    const start = Math.max(0, m.index - EXCERPT_RADIUS);
    const end = Math.min(text.length, m.index + m[0].length + EXCERPT_RADIUS);
    let excerpt = text.slice(start, end);
    if (rule.id === "large-base64") excerpt = `${m[0].slice(0, 120)}… (${m[0].length} chars)`;
    hits.push({ rule, location, excerpt });
  }
  return hits;
}

/** Source files worth scanning, by extension. */
export const SCANNABLE_EXTENSIONS = [
  ".java", ".kt", ".kts", ".groovy", ".gradle", ".js", ".mjs", ".cjs", ".ts", ".py",
  ".cs", ".lua", ".ps1", ".bat", ".cmd", ".sh", ".vbs", ".json", ".toml", ".yml", ".yaml",
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
  if (/(^|\/)(build\.gradle(\.kts)?|settings\.gradle(\.kts)?|package\.json|setup\.py|install\.(ps1|bat|sh))$/.test(lower)) return 0;
  if (lower.startsWith(".github/workflows/")) return 1;
  if (/\.(ps1|bat|cmd|vbs|sh)$/.test(lower)) return 1;
  return 2;
}
