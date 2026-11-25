import type { Finding } from "./types";

export interface VtResult {
  known: boolean;
  malicious: number;
  suspicious: number;
  total: number;
  /** A few engine verdict names, e.g. "Trojan.GenericKD…". */
  names: string[];
}

/**
 * Hash lookup only: the file itself is never uploaded, so nothing private
 * leaves the browser. Uses the user's own (free, personal-use) VirusTotal key.
 */
export async function lookupHash(sha256: string, apiKey: string): Promise<VtResult> {
  const res = await fetch(`https://www.virustotal.com/api/v3/files/${sha256}`, {
    headers: { "x-apikey": apiKey },
  });
  if (res.status === 404) return { known: false, malicious: 0, suspicious: 0, total: 0, names: [] };
  if (res.status === 429) throw new Error("VirusTotal quota reached (free keys allow 4 lookups/minute).");
  if (!res.ok) throw new Error(`VirusTotal ${res.status}`);
  const body = (await res.json()) as {
    data: {
      attributes: {
        last_analysis_stats: Record<string, number>;
        last_analysis_results: Record<string, { category: string; result: string | null }>;
      };
    };
  };
  const stats = body.data.attributes.last_analysis_stats;
  const names = Object.values(body.data.attributes.last_analysis_results)
    .filter((r) => r.category === "malicious" && r.result)
    .map((r) => r.result as string)
    .slice(0, 5);
  return {
    known: true,
    malicious: stats.malicious ?? 0,
    suspicious: stats.suspicious ?? 0,
    total: Object.values(stats).reduce((a, b) => a + b, 0),
    names,
  };
}

export function vtFinding(assetName: string, r: VtResult): Finding | null {
  if (!r.known || (r.malicious === 0 && r.suspicious === 0)) return null;
  return {
    source: "antivirus",
    severity: r.malicious >= 5 ? "critical" : r.malicious > 0 ? "high" : "medium",
    title: `${r.malicious}/${r.total} antivirus engines flag this file`,
    detail: r.names.length
      ? `Detections: ${r.names.join(", ")}. Mods and game tools sometimes get generic false positives, so check the AI explanation.`
      : undefined,
    location: assetName,
  };
}
