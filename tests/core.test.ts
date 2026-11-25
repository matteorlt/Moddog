import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseVerdict } from "../src/lib/ai";
import { assetToTexts, extractStrings, sha256Hex } from "../src/lib/binary";
import { parseRepoUrl } from "../src/lib/github";
import { isScannable, scanPriority, scanText } from "../src/lib/heuristics";
import { reputationFindings } from "../src/lib/reputation";

describe("parseRepoUrl", () => {
  it("reads owner and repo from any repo page", () => {
    expect(parseRepoUrl("https://github.com/foo/bar")).toEqual({ owner: "foo", repo: "bar" });
    expect(parseRepoUrl("https://github.com/foo/bar/tree/main/src")).toEqual({ owner: "foo", repo: "bar" });
    expect(parseRepoUrl("https://github.com/foo/bar.git")).toEqual({ owner: "foo", repo: "bar" });
  });

  it("ignores GitHub pages that aren't repositories", () => {
    expect(parseRepoUrl("https://github.com/settings/profile")).toBeNull();
    expect(parseRepoUrl("https://github.com/foo")).toBeNull();
    expect(parseRepoUrl("https://gitlab.com/foo/bar")).toBeNull();
    expect(parseRepoUrl("not a url")).toBeNull();
  });
});

describe("file selection", () => {
  it("scans source files and skips vendored or binary ones", () => {
    expect(isScannable("src/Main.java")).toBe(true);
    expect(isScannable("install.ps1")).toBe(true);
    expect(isScannable("node_modules/x/index.js")).toBe(false);
    expect(isScannable("assets/logo.png")).toBe(false);
    expect(isScannable("dist/app.min.js")).toBe(false);
  });

  it("scans build and install scripts first", () => {
    expect(scanPriority("build.gradle.kts")).toBeLessThan(scanPriority("src/Main.java"));
    expect(scanPriority(".github/workflows/ci.yml")).toBeLessThan(scanPriority("src/Main.java"));
  });

  it("finds nothing in an ordinary file", () => {
    expect(scanText("public class Foo { void bar() { System.out.println(1); } }", "Foo.java")).toEqual([]);
  });
});

describe("parseVerdict", () => {
  it("accepts JSON wrapped in extra text and sanitizes fields", () => {
    const v = parseVerdict(
      'Here: {"level":"risky","summary":"s","explanation":"e","findings":[{"file":"a","issue":"b","severity":"weird"}]}',
    );
    expect(v.level).toBe("risky");
    expect(v.findings[0]?.severity).toBe("medium");
  });

  it("rejects unknown levels, e.g. a prompt-injected 'totally-safe'", () => {
    expect(() => parseVerdict('{"level":"totally-safe"}')).toThrow();
    expect(() => parseVerdict("no json at all")).toThrow();
  });
});

describe("binary helpers", () => {
  it("extracts printable strings", () => {
    expect(extractStrings(new Uint8Array([0, 104, 101, 108, 108, 111, 119, 111, 0, 1])).trim()).toBe("hellowo");
  });

  it("hashes with sha256", async () => {
    expect(await sha256Hex(strToU8("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("looks inside .jar files", () => {
    const jar = zipSync({
      "a/B.class": strToU8("\u0000\u0001api.telegram.org/bot123:abc\u0000"),
      "fabric.mod.json": strToU8('{"id":"x"}'),
    });
    const files = assetToTexts("mod.jar", jar);
    expect(files.map((f) => f.path).sort()).toEqual(["mod.jar!/a/B.class", "mod.jar!/fabric.mod.json"]);
    expect(files.flatMap((f) => scanText(f.text, f.path)).map((h) => h.rule.id)).toContain("telegram-bot");
  });
});

describe("reputation", () => {
  const now = Date.parse("2026-11-25T00:00:00Z");

  it("flags brand-new accounts and suspicious star counts", () => {
    const findings = reputationFindings(
      {
        fullName: "a/b",
        stars: 900,
        forks: 0,
        createdAt: "2026-11-15T00:00:00Z",
        pushedAt: "",
        ownerLogin: "a",
        ownerType: "User",
        archived: false,
      },
      { createdAt: "2026-11-20T00:00:00Z", publicRepos: 1, followers: 0 },
      null,
      {},
      now,
    );
    const titles = findings.map((f) => f.title);
    expect(titles).toContain("Brand-new GitHub account");
    expect(titles).toContain("Many stars on a very young repository");
    expect(titles).toContain("Stars but no forks");
  });

  it("uses page counters when the API is unavailable", () => {
    const findings = reputationFindings(null, null, null, { stars: 500, forks: 0 }, now);
    expect(findings.map((f) => f.title)).toEqual(["Stars but no forks"]);
  });

  it("warns about password-protected archives in releases", () => {
    const release = {
      tagName: "v1",
      assets: [{ name: "mod-password-123.zip", size: 1, downloadUrl: "", updatedAt: "" }],
    };
    expect(reputationFindings(null, null, release, {}, now)[0]?.severity).toBe("high");
  });
});
