import { PRESETS } from "./providers/index.ts";

const STORAGE_KEY = "whisper_pwa_provider";

export interface ProviderSettings {
  id: string;
  apiKey: string;
  model?: string;
}

export function loadProviderSettings(): ProviderSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.id !== "string" || typeof parsed.apiKey !== "string") return null;
    if (!parsed.apiKey || !PRESETS[parsed.id]) return null;
    return {
      id: parsed.id,
      apiKey: parsed.apiKey,
      model: typeof parsed.model === "string" && parsed.model ? parsed.model : undefined,
    };
  } catch {
    return null;
  }
}

export function saveProviderSettings(settings: ProviderSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Almacenamiento no disponible (modo privado): se ignora.
  }
}

export function clearProviderSettings(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // No-op
  }
}

/** Decide si hay que reescribir el audio a WAV antes de enviarlo al proveedor elegido. */
export function needsWavConversion(id: string | null, mimeType: string): boolean {
  if (!id) return false;
  const preset = PRESETS[id];
  if (!preset || !preset.requiresWav) return false;
  const base = (mimeType || "").toLowerCase().split(";")[0].trim();
  return base !== "audio/wav" && base !== "audio/x-wav";
}
