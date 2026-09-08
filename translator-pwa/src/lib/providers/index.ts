import { geminiProvider, GEMINI_DEFAULT_MODEL } from "./gemini.ts";
import { openaiCompatProvider } from "./openaiCompat.ts";
import type { AudioTranslator, ProviderPreset } from "./types.ts";

export const DEFAULT_PROVIDER_ID = "gemini";

export const PRESETS: Record<string, ProviderPreset> = {
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    transport: "gemini",
    defaultModel: GEMINI_DEFAULT_MODEL,
    requiresWav: false,
    keyUrl: "https://aistudio.google.com/apikey",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    transport: "openai-compat",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-audio-preview",
    requiresWav: true,
    keyUrl: "https://platform.openai.com/api-keys",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    transport: "openai-compat",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "google/gemini-2.0-flash-001",
    requiresWav: true,
    keyUrl: "https://openrouter.ai/keys",
  },
};

const ADAPTERS: Record<ProviderPreset["transport"], AudioTranslator> = {
  gemini: geminiProvider,
  "openai-compat": openaiCompatProvider,
};

export function getProvider(
  id: string
): { preset: ProviderPreset; adapter: AudioTranslator } | null {
  const preset = PRESETS[id];
  if (!preset) return null;
  return { preset, adapter: ADAPTERS[preset.transport] };
}
