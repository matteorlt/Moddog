import { DEFAULT_MODELS, getSettings, saveSettings } from "../lib/settings";
import type { AiProvider, Settings } from "../lib/types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const form = $<HTMLFormElement>("form");
const provider = $<HTMLSelectElement>("aiProvider");
const apiKey = $<HTMLInputElement>("aiApiKey");
const model = $<HTMLInputElement>("aiModel");
const ollamaUrl = $<HTMLInputElement>("ollamaUrl");
const vtKey = $<HTMLInputElement>("virusTotalKey");
const ghToken = $<HTMLInputElement>("githubToken");
const status = $<HTMLSpanElement>("status");

const MODEL_SUGGESTIONS: Partial<Record<AiProvider, string[]>> = {
  anthropic: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
};

const PROVIDER_ORIGINS: Partial<Record<AiProvider, string>> = {
  anthropic: "https://api.anthropic.com/*",
  openai: "https://api.openai.com/*",
  gemini: "https://generativelanguage.googleapis.com/*",
  openrouter: "https://openrouter.ai/*",
};

function refresh(): void {
  const p = provider.value as AiProvider;
  $("keyRow").hidden = p === "none" || p === "ollama";
  $("ollamaRow").hidden = p !== "ollama";
  model.disabled = p === "none";
  model.placeholder = DEFAULT_MODELS[p] || "";
  $("modelHint").textContent =
    p === "none" ? "" : `Leave empty to use ${DEFAULT_MODELS[p]}. Check your provider's model list for other names.`;
  const list = $<HTMLDataListElement>("modelSuggestions");
  list.replaceChildren(
    ...(MODEL_SUGGESTIONS[p] ?? []).map((m) => Object.assign(document.createElement("option"), { value: m })),
  );
}

function ollamaOrigin(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}

async function init(): Promise<void> {
  const s = await getSettings();
  provider.value = s.aiProvider;
  apiKey.value = s.aiApiKey;
  model.value = s.aiModel;
  ollamaUrl.value = s.ollamaUrl;
  vtKey.value = s.virusTotalKey;
  ghToken.value = s.githubToken;
  refresh();
}

provider.addEventListener("change", refresh);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const settings: Settings = {
    aiProvider: provider.value as AiProvider,
    aiApiKey: apiKey.value.trim(),
    aiModel: model.value.trim(),
    ollamaUrl: ollamaUrl.value.trim() || "http://localhost:11434",
    virusTotalKey: vtKey.value.trim(),
    githubToken: ghToken.value.trim(),
  };

  // Ask only for the hosts the user actually enabled (must happen in this click handler).
  const origins: string[] = [];
  const providerOrigin =
    settings.aiProvider === "ollama" ? ollamaOrigin(settings.ollamaUrl) : PROVIDER_ORIGINS[settings.aiProvider];
  if (providerOrigin) origins.push(providerOrigin);
  if (settings.virusTotalKey) origins.push("https://www.virustotal.com/*");

  const granted = origins.length === 0 || (await chrome.permissions.request({ origins }));
  await saveSettings(settings);
  status.textContent = granted
    ? " Saved ✓"
    : " Saved, but permission was refused: Moddog can't reach that provider until you allow it.";
});

void init();
