import { getPromptForDirection, parseTranslationJson } from "../translator.ts";
import type {
  AudioTranslator,
  ProviderConfig,
  SupportedLanguage,
  TranslateInput,
  TranslationResult,
} from "./types.ts";

/** La capa OpenAI-compatible solo admite estos formatos en input_audio. */
const ACCEPTED_MIME_TYPES = ["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3"];

function baseMimeType(mimeType: string): string {
  return (mimeType || "").toLowerCase().split(";")[0].trim();
}

function audioFormatFor(mimeType: string): "wav" | "mp3" {
  const base = baseMimeType(mimeType);
  return base === "audio/mpeg" || base === "audio/mp3" ? "mp3" : "wav";
}

export const openaiCompatProvider: AudioTranslator = {
  acceptsMimeType(mimeType: string): boolean {
    return ACCEPTED_MIME_TYPES.includes(baseMimeType(mimeType));
  },

  async translate(cfg: ProviderConfig, input: TranslateInput): Promise<TranslationResult> {
    let response: Response;
    try {
      response = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: getPromptForDirection(input.direction) },
                {
                  type: "input_audio",
                  input_audio: {
                    data: input.audioBase64,
                    format: audioFormatFor(input.mimeType),
                  },
                },
              ],
            },
          ],
        }),
      });
    } catch {
      // El mensaje original puede contener la URL con credenciales: se descarta.
      throw new Error("No se pudo contactar con el proveedor. Revisa tu conexión.");
    }

    if (!response.ok) {
      // Nunca se reenvía el cuerpo de la respuesta: puede hacer echo de la API key.
      throw new Error(`El proveedor rechazó la petición (HTTP ${response.status}).`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("Respuesta vacía del proveedor");
    }

    const defaultLang: SupportedLanguage = input.direction === "ja-es" ? "ja" : "es";
    return parseTranslationJson(content, defaultLang);
  },
};
