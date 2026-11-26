import { describe, expect, it } from "vitest";
import { reportIssueUrl, reportKinds, reportText, repoUrl } from "../src/lib/report";
import type { Analysis, Finding } from "../src/lib/types";

function analysis(over: Partial<Analysis> = {}, findings: Finding[] = []): Analysis {
  return {
    repo: { owner: "foo", repo: "bar" },
    commitSha: "a3f9c1e0000000000000000000000000000000000",
    assetHashes: {},
    level: "suspicious",
    summary: "",
    findings,
    coverage: { reputation: true, heuristics: true, antivirus: false, ai: false, filesScanned: 42, assetsScanned: 2 },
    analyzedAt: "2026-11-26T00:00:00Z",
    ...over,
  };
}

const finding = (title: string, severity: Finding["severity"], location?: string): Finding => ({
  source: "heuristic",
  severity,
  title,
  location,
});

describe("one-click reports", () => {
  it("offers the reports that fit the verdict", () => {
    expect(reportKinds("clean")).toEqual(["false-negative"]);
    expect(reportKinds("malware")).toEqual(["false-positive"]);
    expect(reportKinds("risky")).toEqual(["false-positive", "false-negative"]);
    expect(reportKinds("unknown")).toEqual([]);
  });

  it("writes a plain-text summary, most severe first", () => {
    const text = reportText(
      analysis({}, [
        finding("Release ships a Windows executable", "info", "Tool.exe"),
        finding("Large base64 blob", "medium", "patch.py"),
      ]),
      "0.1.0",
    );
    expect(text.split("\n")).toEqual([
      "Moddog 0.1.0: foo/bar @ a3f9c1e",
      "Verdict: Odd smell",
      "- [MED] Large base64 blob · patch.py",
      "- [INFO] Release ships a Windows executable · Tool.exe",
      "Checked: reputation ✓, code 42 files, releases 2 files, antivirus –, AI –",
    ]);
  });

  it("links to the release that was checked", () => {
    expect(repoUrl(analysis({ repo: { owner: "foo", repo: "bar", tag: "mod/v2" } }))).toBe(
      "https://github.com/foo/bar/releases/tag/mod%2Fv2",
    );
  });

  it("prefills the false-positive form", () => {
    const u = new URL(
      reportIssueUrl(analysis({ level: "risky" }, [finding("Hidden PowerShell", "high")]), "false-positive", "0.1.0"),
    );
    expect(u.origin + u.pathname).toBe("https://github.com/matteorlt/Moddog/issues/new");
    expect(u.searchParams.get("template")).toBe("1-false-positive.yml");
    expect(u.searchParams.get("title")).toBe("[False positive] foo/bar");
    expect(u.searchParams.get("repo")).toBe("https://github.com/foo/bar");
    expect(u.searchParams.get("verdict")).toBe("Growling");
    expect(u.searchParams.get("signals")).toContain("- [HIGH] Hidden PowerShell");
  });

  it("prefills the false-negative form", () => {
    const u = new URL(reportIssueUrl(analysis({ level: "clean" }), "false-negative", "0.1.0"));
    expect(u.searchParams.get("template")).toBe("2-false-negative.yml");
    expect(u.searchParams.get("verdict")).toBe("Good boy (Moddog 0.1.0, AI not used)");
    expect(u.searchParams.get("report")).toContain("Verdict: Good boy");
  });

  it("keeps the link short when there are many signals", () => {
    const many = Array.from({ length: 400 }, (_, i) =>
      finding(`Signal number ${i} with a long title`, "medium", `src/file${i}.js`),
    );
    const url = reportIssueUrl(analysis({}, many), "false-positive", "0.1.0");
    expect(url.length).toBeLessThanOrEqual(7000);
    expect(new URL(url).searchParams.get("signals")).toContain("cut to fit the link");
  });
});
