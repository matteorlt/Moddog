import type { AiProvider, Settings } from "./types";

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  none: "",
  anthropic: "claude-opus-5-5",
  openai: "gpt-5",
  gemini: "gemini-2.5-flash",
  openrouter: "anthropic/claude-opus-5-5",
  ollama: "qwen2.5-coder:7b",
};

export const DEFAULT_SETTINGS: Settings = {
  aiProvider: "none",
  aiApiKey: "",
  aiModel: "",
  ollamaUrl: "http://localhost:11434",
  virusTotalKey: "",
  githubToken: "",
  theme: "auto",
};

/**
 * Settings (including API keys) live in chrome.storage.local only:
 * never synced, never sent anywhere except the provider the user picked.
 */
export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(stored.settings as Partial<Settings> | undefined) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings });
}

export function effectiveModel(settings: Settings): string {
  return settings.aiModel.trim() || DEFAULT_MODELS[settings.aiProvider];
}
