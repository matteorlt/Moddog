import type { Analysis, RiskLevel } from "./types";

export const LEVEL_UI: Record<RiskLevel, { emoji: string; label: string }> = {
  clean: { emoji: "🟢", label: "Good boy" },
  suspicious: { emoji: "🟡", label: "Sniffing…" },
  risky: { emoji: "🟠", label: "Growling" },
  malware: { emoji: "🔴", label: "Barking!" },
  unknown: { emoji: "⚪", label: "Not sniffed yet" },
};

/** Builds DOM nodes with textContent only: repo-controlled text never becomes HTML. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderAnalysis(container: HTMLElement, a: Analysis): void {
  container.replaceChildren();
  const ui = LEVEL_UI[a.level];

  const head = el("div", `md-verdict md-${a.level}`);
  head.append(el("span", "md-verdict-emoji", ui.emoji), el("strong", undefined, ui.label));
  container.append(head, el("p", "md-summary", a.summary));

  if (a.ai?.explanation) {
    const details = el("details", "md-block");
    details.open = a.level !== "clean";
    details.append(el("summary", undefined, "Why?"));
    for (const para of a.ai.explanation.split(/\n{2,}/)) details.append(el("p", undefined, para));
    container.append(details);
  }

  const relevant = a.findings.filter((f) => f.severity !== "info" || f.source !== "heuristic");
  if (relevant.length) {
    const details = el("details", "md-block");
    details.append(el("summary", undefined, `Signals (${relevant.length})`));
    const list = el("ul", "md-findings");
    for (const f of relevant) {
      const li = el("li", `md-sev-${f.severity}`);
      li.append(el("strong", undefined, f.title));
      if (f.location) li.append(el("code", undefined, f.location));
      if (f.detail) li.append(el("span", "md-detail", f.detail));
      list.append(li);
    }
    details.append(list);
    container.append(details);
  }

  const c = a.coverage;
  const parts = [
    `${c.filesScanned} source files`,
    `${c.assetsScanned} release files`,
    c.antivirus ? "VirusTotal ✓" : "VirusTotal ✗",
    c.ai ? "AI ✓" : "AI ✗",
  ];
  container.append(
    el("p", "md-meta", `${parts.join(" · ")} · ${a.fromCache ? "cached, " : ""}${new Date(a.analyzedAt).toLocaleString()} · commit ${a.commitSha.slice(0, 7)}`),
    el("p", "md-disclaimer", "Moddog gives a risk assessment, not a guarantee."),
  );
}
