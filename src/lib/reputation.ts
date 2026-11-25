import type { OwnerInfo, Release, RepoInfo } from "./github";
import type { Finding } from "./types";

const DAY = 24 * 60 * 60 * 1000;

function ageInDays(iso: string, now: number): number {
  return (now - new Date(iso).getTime()) / DAY;
}

/** Cheap reputation signals from the GitHub API. They raise suspicion, never prove anything. */
export function reputationFindings(
  repo: RepoInfo,
  owner: OwnerInfo | null,
  release: Release | null,
  now = Date.now(),
): Finding[] {
  const findings: Finding[] = [];
  const repoAge = ageInDays(repo.createdAt, now);

  if (owner && ageInDays(owner.createdAt, now) < 30) {
    findings.push({
      source: "reputation",
      severity: "medium",
      title: "Brand-new GitHub account",
      detail: `The owner's account is ${Math.round(ageInDays(owner.createdAt, now))} days old.`,
    });
  }

  // Lots of stars on a very young repo is the classic "fake stars" pattern.
  if (repoAge < 60 && repo.stars > 200) {
    findings.push({
      source: "reputation",
      severity: "medium",
      title: "Many stars on a very young repository",
      detail: `${repo.stars} stars in ${Math.round(repoAge)} days. Stars can be bought.`,
    });
  }

  if (repo.stars > 100 && repo.forks === 0) {
    findings.push({
      source: "reputation",
      severity: "low",
      title: "Stars but no forks",
      detail: "Popular-looking repositories usually get forked. This can be a sign of fake stars.",
    });
  }

  if (release) {
    for (const asset of release.assets) {
      const lower = asset.name.toLowerCase();
      if (/\.(exe|scr|bat|cmd|vbs|msi|ps1)$/.test(lower)) {
        findings.push({
          source: "reputation",
          severity: "info",
          title: "Release ships a Windows executable",
          detail: "Executables can't be checked against the source code. Be extra careful.",
          location: asset.name,
        });
      }
      if (/\.(zip|rar|7z)$/.test(lower) && /(password|pass|pwd)/.test(lower)) {
        findings.push({
          source: "reputation",
          severity: "high",
          title: "Password-protected archive in release",
          detail: "Malware is often shipped in password-protected archives to dodge antivirus scans.",
          location: asset.name,
        });
      }
    }
  }

  return findings;
}
