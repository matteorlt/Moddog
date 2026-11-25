import { noseIcon } from "../lib/render";
import { DEFAULT_MODELS, getSettings, saveSettings } from "../lib/settings";
import type { AiProvider, Settings } from "../lib/types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const form = $<HTMLFormElement>("form");
const apiKey = $<HTMLInputElement>("aiApiKey");
const model = $<HTMLInputElement>("aiModel");
const ollamaUrl = $<HTMLInputElement>("ollamaUrl");
const vtKey = $<HTMLInputElement>("virusTotalKey");
const ghToken = $<HTMLInputElement>("githubToken");
const status = $<HTMLSpanElement>("status");

$("mark").append(noseIcon(24));

const MODEL_SUGGESTIONS: Partial<Record<AiProvider, string[]>> = {
  anthropic: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
};

const PROVIDER_ORIGINS: Partial<Record<AiProvider, string>> = {
  anthropic: "https://api.anthropic.com/*",
  openai: "https://api.openai.com/*",
  gemini: "https://generativelanguage.googleapis.com/*",
  openrouter: "https://openrouter.ai/*",
};

function provider(): AiProvider {
  const checked = form.querySelector<HTMLInputElement>('input[name="aiProvider"]:checked');
  return (checked?.value as AiProvider) ?? "none";
}

function refresh(): void {
  const p = provider();
  $("keyField").hidden = p === "none" || p === "ollama";
  $("ollamaField").hidden = p !== "ollama";
  $("modelField").hidden = p === "none";
  model.placeholder = DEFAULT_MODELS[p] || "";
  $("modelHint").textContent = p === "none" ? "" : `Leave empty to use ${DEFAULT_MODELS[p]}.`;
  $<HTMLDataListElement>("modelSuggestions").replaceChildren(
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

function setStatus(text: string, warn = false): void {
  status.textContent = text;
  status.classList.toggle("warn", warn);
}

async function init(): Promise<void> {
  const s = await getSettings();
  const radio = form.querySelector<HTMLInputElement>(`input[name="aiProvider"][value="${s.aiProvider}"]`);
  if (radio) radio.checked = true;
  apiKey.value = s.aiApiKey;
  model.value = s.aiModel;
  ollamaUrl.value = s.ollamaUrl;
  vtKey.value = s.virusTotalKey;
  ghToken.value = s.githubToken;
  refresh();
}

form.addEventListener("change", (e) => {
  if ((e.target as HTMLInputElement).name === "aiProvider") refresh();
  setStatus("Unsaved changes");
});
form.addEventListener("input", () => setStatus("Unsaved changes"));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const settings: Settings = {
    aiProvider: provider(),
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
  if (granted) setStatus("Saved");
  else setStatus("Saved, but access was refused: Moddog can't reach that service until you allow it.", true);
});

void init();
