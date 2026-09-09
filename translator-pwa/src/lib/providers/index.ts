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
    defaultModel: "google/gemini-3.8-flash",
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
  if (!Object.hasOwn(PRESETS, id)) return null;
  const preset = PRESETS[id];
  return { preset, adapter: ADAPTERS[preset.transport] };
}
