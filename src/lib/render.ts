import type { Analysis, Finding, RepoRef, RiskLevel } from "./types";

/*
 * Renders the Moddog panel. Shared by the GitHub badge and the popup.
 * All repo-controlled text goes through textContent: it never becomes HTML.
 */

export const LEVEL_LABEL: Record<RiskLevel, string> = {
  clean: "Good boy",
  suspicious: "Odd smell",
  risky: "Growling",
  malware: "Barking!",
  unknown: "Not sniffed",
};

const LEVEL_FALLBACK_TEXT: Record<RiskLevel, string> = {
  clean: "Nothing suspicious in the files that were checked.",
  suspicious: "Something smells odd. Look at the signals before installing.",
  risky: "Risky behavior detected. Don't install unless you trust the author.",
  malware: "This looks like malware. Don't install it.",
  unknown: "",
};

const METER: RiskLevel[] = ["clean", "suspicious", "risky", "malware"];
const SEV_ORDER: Finding["severity"][] = ["critical", "high", "medium", "low", "info"];
const SEV_TAG: Record<Finding["severity"], string> = {
  critical: "CRIT",
  high: "HIGH",
  medium: "MED",
  low: "LOW",
  info: "INFO",
};
const SIGNALS_SHOWN = 6;

export type PanelState =
  | { kind: "idle"; repo: RepoRef }
  | { kind: "loading"; repo: RepoRef }
  | { kind: "done"; analysis: Analysis }
  | { kind: "error"; repo: RepoRef; message: string }
  | { kind: "offsite" };

export interface PanelHandlers {
  onSniff?: (force: boolean) => void;
  onClose?: () => void;
  onSettings?: () => void;
}

// ---------- tiny DOM helpers ----------

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

function svg(viewBox: string, paths: string[], size = 16): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", viewBox);
  s.setAttribute("width", String(size));
  s.setAttribute("height", String(size));
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "1.6");
  s.setAttribute("stroke-linecap", "round");
  s.setAttribute("stroke-linejoin", "round");
  for (const d of paths) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    s.append(p);
  }
  return s;
}

/** The Moddog mark: a dog's nose. */
export function noseIcon(size = 16): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("width", String(size));
  s.setAttribute("height", String(size));
  s.setAttribute("aria-hidden", "true");
  const nose = document.createElementNS(NS, "path");
  nose.setAttribute(
    "d",
    "M12 5c-4.6 0-8.5 1.6-8.5 4.9 0 3.6 4.3 6.6 7.2 8.6.8.5 1.8.5 2.6 0 2.9-2 7.2-5 7.2-8.6C20.5 6.6 16.6 5 12 5Z",
  );
  nose.setAttribute("fill", "currentColor");
  s.append(nose);
  for (const cx of [8.6, 15.4]) {
    const n = document.createElementNS(NS, "ellipse");
    n.setAttribute("cx", String(cx));
    n.setAttribute("cy", "10.2");
    n.setAttribute("rx", "1.9");
    n.setAttribute("ry", "1.25");
    n.setAttribute("transform", `rotate(${cx < 12 ? 18 : -18} ${cx} 10.2)`);
    n.setAttribute("fill", "var(--paper)");
    s.append(n);
  }
  return s;
}

const closeIcon = () => svg("0 0 16 16", ["M4 4l8 8M12 4l-8 8"]);
const gearIcon = () =>
  svg("0 0 16 16", [
    "M8 10.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z",
    "M13 8c0-.4 0-.7-.1-1l1.4-1.1-1.4-2.4-1.7.6a5 5 0 0 0-1.7-1L9.2 1.3H6.8l-.3 1.8a5 5 0 0 0-1.7 1l-1.7-.6-1.4 2.4L3.1 7a5 5 0 0 0 0 2l-1.4 1.1 1.4 2.4 1.7-.6a5 5 0 0 0 1.7 1l.3 1.8h2.4l.3-1.8a5 5 0 0 0 1.7-1l1.7.6 1.4-2.4L12.9 9c.1-.3.1-.6.1-1Z",
  ]);

function relativeTime(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `${hr} h ago`;
  return new Date(iso).toLocaleDateString();
}

// ---------- pieces ----------

function header(repo: RepoRef | null, handlers: PanelHandlers): HTMLElement {
  const head = h(
    "header",
    { class: "md-head" },
    h("span", { class: "md-brand" }, noseIcon(16), "Moddog"),
    repo ? h("span", { class: "md-repo md-mono" }, `${repo.owner}/${repo.repo}`) : null,
    h("span", { class: "md-spacer" }),
  );
  if (handlers.onSettings) {
    const b = h(
      "button",
      { class: "md-icon-btn", type: "button", title: "Settings", "aria-label": "Settings" },
      gearIcon(),
    );
    b.onclick = handlers.onSettings;
    head.append(b);
  }
  if (handlers.onClose) {
    const b = h("button", { class: "md-icon-btn", type: "button", title: "Close", "aria-label": "Close" }, closeIcon());
    b.onclick = handlers.onClose;
    head.append(b);
  }
  return head;
}

function verdict(a: Analysis): HTMLElement {
  const rank = METER.indexOf(a.level);
  const meter = h("div", { class: "md-meter", "aria-hidden": "true" });
  for (let i = 0; i < METER.length; i++) meter.append(h("span", { class: i <= rank ? "on" : "" }));
  return h(
    "section",
    { class: "md-section md-verdict", "data-level": a.level },
    meter,
    h("h2", { class: "md-verdict-title" }, LEVEL_LABEL[a.level]),
    h("p", { class: "md-verdict-text" }, a.summary || LEVEL_FALLBACK_TEXT[a.level]),
  );
}

function explanation(a: Analysis): HTMLElement | null {
  const text = a.ai?.explanation?.trim();
  if (!text) return null;
  const prose = h("div", { class: "md-prose" });
  for (const para of text.split(/\n{2,}/)) prose.append(h("p", {}, para.trim()));
  return h("section", { class: "md-section" }, h("h3", { class: "md-label" }, "Why"), prose);
}

function signals(a: Analysis): HTMLElement | null {
  const list = a.findings
    .filter((f) => !(f.severity === "info" && f.source === "heuristic"))
    .sort((x, y) => SEV_ORDER.indexOf(x.severity) - SEV_ORDER.indexOf(y.severity));
  if (!list.length) return null;

  const ul = h("ul", { class: "md-signals" });
  const row = (f: Finding) =>
    h(
      "li",
      {},
      h("span", { class: `md-sev md-sev-${f.severity}` }, SEV_TAG[f.severity]),
      h("span", { class: "md-signal-title" }, f.title),
      f.location ? h("code", { class: "md-signal-loc" }, f.location) : null,
      f.detail ? h("span", { class: "md-signal-detail" }, f.detail) : null,
    );
  for (const f of list.slice(0, SIGNALS_SHOWN)) ul.append(row(f));

  const section = h("section", { class: "md-section" }, h("h3", { class: "md-label" }, `Signals · ${list.length}`), ul);
  if (list.length > SIGNALS_SHOWN) {
    const more = h("button", { class: "md-more", type: "button" }, `Show ${list.length - SIGNALS_SHOWN} more`);
    more.onclick = () => {
      for (const f of list.slice(SIGNALS_SHOWN)) ul.append(row(f));
      more.remove();
    };
    section.append(more);
  }
  return section;
}

function checks(a: Analysis): HTMLElement {
  const c = a.coverage;
  const item = (on: boolean, label: string, note: string) =>
    h(
      "li",
      { class: on ? "on" : "off" },
      h("span", { class: "md-check-mark" }, on ? "✓" : "–"),
      h("span", {}, label, " ", h("span", { class: "md-check-note" }, note)),
    );
  return h(
    "section",
    { class: "md-section" },
    h("h3", { class: "md-label" }, "Checked"),
    h(
      "ul",
      { class: "md-checks" },
      item(c.reputation, "Reputation", ""),
      item(c.heuristics, "Code", `${c.filesScanned} files`),
      item(c.assetsScanned > 0, "Releases", `${c.assetsScanned} files`),
      item(c.antivirus, "Antivirus", c.antivirus ? "" : "off"),
      item(c.ai, "AI review", c.ai ? "" : "skipped"),
    ),
  );
}

function footer(a: Analysis, handlers: PanelHandlers): DocumentFragment {
  const frag = document.createDocumentFragment();
  const meta = h(
    "div",
    { class: "md-meta" },
    h("span", { class: "md-mono" }, a.commitSha.slice(0, 7)),
    ` · ${a.fromCache ? "cached, " : ""}${relativeTime(a.analyzedAt)}`,
    h("br"),
    "A risk assessment, not a guarantee.",
  );
  const foot = h("footer", { class: "md-foot" }, meta);
  if (handlers.onSniff) {
    const b = h("button", { class: "md-btn md-btn-ghost", type: "button" }, "Re-sniff");
    b.title = "Analyze again from scratch";
    b.onclick = () => handlers.onSniff?.(true);
    foot.append(b);
  }
  frag.append(foot);
  return frag;
}

// ---------- states ----------

const LOADING_STEPS = ["Reputation", "Source code", "Release files", "Antivirus & AI review"];

export function renderPanel(container: HTMLElement, state: PanelState, handlers: PanelHandlers = {}): void {
  container.replaceChildren();

  if (state.kind === "offsite") {
    container.append(
      header(null, handlers),
      h(
        "div",
        { class: "md-state" },
        h("h2", {}, "Open a GitHub repository"),
        h("p", {}, "Go to a repository page on github.com, then click Moddog to sniff it before you install anything."),
      ),
    );
    return;
  }

  if (state.kind === "done") {
    const a = state.analysis;
    container.append(
      header(a.repo, handlers),
      h("div", { class: "md-body" }, verdict(a), explanation(a), signals(a), checks(a)),
      footer(a, handlers),
    );
    return;
  }

  container.append(header(state.repo, handlers));

  if (state.kind === "idle") {
    const go = h("button", { class: "md-btn", type: "button" }, "Sniff this repo");
    go.onclick = () => handlers.onSniff?.(false);
    container.append(
      h(
        "div",
        { class: "md-state" },
        h("h2", {}, "Not sniffed yet"),
        h("p", {}, "Moddog checks the code and the release files for malware. Nothing is installed or run."),
        h("div", { class: "md-actions" }, go),
      ),
    );
    return;
  }

  if (state.kind === "loading") {
    // The background job doesn't report progress yet, so the steps advance on a timer
    // purely as a hint of what's happening.
    const steps = h("ol", { class: "md-steps" });
    const items = LOADING_STEPS.map((s) => h("li", {}, s));
    steps.append(...items);
    let i = 0;
    const tick = () => {
      if (!steps.isConnected && i > 0) return;
      items.forEach((li, j) => {
        li.className = j < i ? "done" : j === i ? "now" : "";
      });
      if (i < items.length - 1) {
        i++;
        setTimeout(tick, 1400);
      }
    };
    tick();
    container.append(
      h(
        "div",
        { class: "md-state" },
        h("h2", {}, "Sniffing…"),
        h("p", {}, "Big repositories can take a little while."),
        steps,
        h("div", { class: "md-track" }, h("span")),
      ),
    );
    return;
  }

  // error
  const actions = h("div", { class: "md-actions" });
  const retry = h("button", { class: "md-btn", type: "button" }, "Try again");
  retry.onclick = () => handlers.onSniff?.(false);
  actions.append(retry);
  if (handlers.onSettings && /token|key|permission|provider/i.test(state.message)) {
    const s = h("button", { class: "md-btn md-btn-ghost", type: "button" }, "Open settings");
    s.onclick = handlers.onSettings;
    actions.append(s);
  }
  container.append(
    h(
      "div",
      { class: "md-state md-error" },
      h("h2", {}, "Couldn't sniff this one"),
      h("p", {}, state.message),
      actions,
    ),
  );
}

/** Applies the right light/dark theme to a .md-root element. */
export function applyTheme(root: HTMLElement, mode: "light" | "dark" | "auto"): void {
  if (mode === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
}
