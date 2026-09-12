import { loadProviderSettings, needsWavConversion } from "./providerSettings.ts";
import { blobToWav } from "./wavEncoder.ts";
import type { TranslationResult } from "./providers/types.ts";

export interface PostTranslateInput {
  blob: Blob;
  mimeType: string;
  direction: string;
}

/**
 * Punto único de llamada a /api/translate. Aplica los ajustes del usuario,
 * convierte el audio si el proveedor lo exige y añade las cabeceras.
 */
export async function postTranslate({
  blob,
  mimeType,
  direction,
}: PostTranslateInput): Promise<TranslationResult> {
  const settings = loadProviderSettings();

  let payload = blob;
  let payloadMime = mimeType;
  if (needsWavConversion(settings?.id ?? null, mimeType)) {
    payload = await blobToWav(blob);
    payloadMime = "audio/wav";
  }

  const extension = payloadMime.includes("wav")
    ? "wav"
    : payloadMime.includes("mp4")
    ? "m4a"
    : "webm";

  const formData = new FormData();
  formData.append("audio", payload, `voice-input.${extension}`);
  formData.append("direction", direction);

  const headers: Record<string, string> = {};
  if (settings) {
    headers["x-provider-id"] = settings.id;
    headers["x-provider-key"] = settings.apiKey;
    if (settings.model) headers["x-provider-model"] = settings.model;
  }

  const res = await fetch("/api/translate", { method: "POST", body: formData, headers });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Error al procesar la traducción.");
  }
  return data as TranslationResult;
}
