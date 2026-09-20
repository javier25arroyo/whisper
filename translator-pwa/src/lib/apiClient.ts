import { loadProviderSettings, needsWavConversion } from "./providerSettings.ts";
import { blobToWav } from "./wavEncoder.ts";
import type { TranslationResult } from "./providers/types.ts";

/** Espera máxima por /api/translate. Sin techo, una red colgada dejaba el orbe en
 * "procesando" indefinidamente y el usuario, sin manos, sin salida cómoda. */
export const TRANSLATE_TIMEOUT_MS = 25_000;

export interface PostTranslateInput {
  blob: Blob;
  mimeType: string;
  direction: string;
  /** Aborta la petición desde fuera (p. ej. "Cancelar turno"). Rechaza con AbortError. */
  signal?: AbortSignal;
  /** Espera máxima antes de rendirse. Por defecto TRANSLATE_TIMEOUT_MS. */
  timeoutMs?: number;
}

/**
 * Punto único de llamada a /api/translate. Aplica los ajustes del usuario,
 * convierte el audio si el proveedor lo exige y añade las cabeceras.
 */
export async function postTranslate({
  blob,
  mimeType,
  direction,
  signal,
  timeoutMs = TRANSLATE_TIMEOUT_MS,
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

  // Un solo AbortController une la señal externa y el timeout; `timedOut` distingue
  // "nos rendimos" de "el usuario canceló" para dar el mensaje correcto.
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onExternalAbort, { once: true });
  }
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      body: formData,
      headers,
      signal: controller.signal,
    });
    // La pantalla de contraseña (middleware) responde HTML con 401: no es JSON.
    const data = await res.json().catch(() => null);
    // Un aborto o timeout durante la lectura del cuerpo debe seguir el camino de abortos
    // (AbortError / mensaje de timeout), no convertirse en un resultado nulo.
    controller.signal.throwIfAborted();
    if (!res.ok) {
      throw new Error(
        data?.error ||
          (res.status === 401
            ? "Acceso denegado. Vuelve a abrir la app e introduce la contraseña."
            : "Error al procesar la traducción.")
      );
    }
    if (data == null) throw new Error("Respuesta inválida del servidor.");
    return data as TranslationResult;
  } catch (err) {
    if (timedOut) throw new Error("La traducción tardó demasiado. Inténtalo de nuevo.");
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}
