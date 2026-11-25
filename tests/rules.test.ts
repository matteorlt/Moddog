import { describe, expect, it } from "vitest";
import { RULES, scanText } from "../src/lib/heuristics";
import { RULE_CASES } from "./rules.cases";

const idsIn = (sample: string) => scanText(sample, "sample").map((h) => h.rule.id);

describe("detection rules", () => {
  it("every rule has a test case", () => {
    const missing = RULES.map((r) => r.id).filter((id) => !RULE_CASES[id]);
    expect(missing, "add a case to tests/rules.cases.ts for these rules").toEqual([]);
  });

  it("every test case points to an existing rule", () => {
    const ids = new Set(RULES.map((r) => r.id));
    expect(Object.keys(RULE_CASES).filter((id) => !ids.has(id))).toEqual([]);
  });

  it("keeps rule ids unique", () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const rule of RULES) {
    const cases = RULE_CASES[rule.id];
    if (!cases) continue;
    describe(rule.id, () => {
      it.each(cases.match)("catches %s", (sample) => {
        expect(idsIn(sample)).toContain(rule.id);
      });
      it.each(cases.noMatch)("ignores %s", (sample) => {
        expect(idsIn(sample)).not.toContain(rule.id);
      });
    });
  }
});
