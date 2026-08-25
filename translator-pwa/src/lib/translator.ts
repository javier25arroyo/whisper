import { GoogleGenerativeAI } from "@google/generative-ai";

export type SupportedLanguage = "es" | "ja";

export interface TranslationResult {
  detected_language: SupportedLanguage;
  original_text: string;
  translation: string;
}

export const PROMPTS: Record<string, string> = {
  auto: `Escucha este audio con atención.
1. Transcribe exactamente lo que se dijo.
2. Detecta si el idioma es Español o Japonés.
3. Traduce al idioma contrario (Español→Japonés o Japonés→Español).

Responde ÚNICAMENTE con un objeto JSON válido con este formato exacto, sin markdown, sin explicaciones:
{"detected_language":"es","original_text":"...","translation":"..."}

Si el idioma detectado es japonés, usa "ja" en detected_language. Si es español, usa "es".`,

  "es-ja": `Escucha este audio en Español.
1. Transcribe exactamente lo que se dijo en español.
2. Tradúcelo al Japonés de forma natural.

Responde ÚNICAMENTE con un objeto JSON válido con este formato exacto, sin markdown, sin explicaciones:
{"detected_language":"es","original_text":"...","translation":"..."}`,

  "ja-es": `このオーディオを日本語で聞いてください。
1. 話された内容を正確に文字起こしをしてください。
2. スペイン語に自然に翻訳してください。

次の形式の有効なJSONオブジェクトのみで返答してください。マークダウンや説明は含めないでください:
{"detected_language":"ja","original_text":"...","translation":"..."}`,
};

/**
 * Retorna el prompt correspondiente a la dirección solicitada ("auto", "es-ja", "ja-es").
 */
export function getPromptForDirection(direction?: string | null): string {
  if (direction && PROMPTS[direction]) {
    return PROMPTS[direction];
  }
  return PROMPTS.auto;
}

/**
 * Normaliza el tipo MIME del audio para la API de Gemini.
 * Safari / iOS a menudo envía application/octet-stream o audio/mp4 / audio/m4a.
 */
export function normalizeMimeType(
  mimeType?: string | null
): "audio/mp4" | "audio/webm" | "audio/ogg" | "audio/wav" {
  if (!mimeType || typeof mimeType !== "string") {
    return "audio/mp4";
  }
  const lower = mimeType.toLowerCase().trim();
  if (lower === "application/octet-stream" || lower === "") {
    return "audio/mp4";
  }
  if (lower.includes("webm")) {
    return "audio/webm";
  }
  if (lower.includes("mp4") || lower.includes("m4a") || lower.includes("aac")) {
    return "audio/mp4";
  }
  if (lower.includes("ogg") || lower.includes("opus")) {
    return "audio/ogg";
  }
  if (lower.includes("wav")) {
    return "audio/wav";
  }
  return "audio/mp4";
}

/**
 * Normaliza el código de idioma a "es" o "ja".
 */
export function normalizeLanguage(
  lang?: string | null,
  defaultLang: SupportedLanguage = "es"
): SupportedLanguage {
  if (!lang || typeof lang !== "string") {
    return defaultLang;
  }
  const lower = lang.toLowerCase().trim();
  if (
    lower === "ja" ||
    lower.startsWith("jp") ||
    lower.includes("japan") ||
    lower.includes("japon") ||
    lower.includes("日本語")
  ) {
    return "ja";
  }
  if (
    lower === "es" ||
    lower.includes("span") ||
    lower.includes("españ") ||
    lower.includes("espan") ||
    lower.includes("スペイン")
  ) {
    return "es";
  }
  return defaultLang;
}

/**
 * Extrae y parsea el JSON retornado por Gemini.
 * Maneja bloques de código Markdown (```json ... ``` o ``` ... ```), texto adicional,
 * y valida que los campos requeridos existan y no estén vacíos.
 */
export function extractAndParseGeminiJson(
  responseText: string,
  defaultLang: SupportedLanguage = "es"
): TranslationResult {
  if (!responseText || typeof responseText !== "string") {
    throw new Error("Respuesta vacía de Gemini");
  }

  // 1. Quitar cercas de código Markdown si están presentes
  let cleaned = responseText.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // 2. Localizar el objeto JSON más externo {...}
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error(`No se encontró un bloque JSON válido en la respuesta: "${responseText.slice(0, 100)}..."`);
  }

  const jsonSubstring = cleaned.substring(firstBrace, lastBrace + 1);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonSubstring);
  } catch (err) {
    throw new Error(`Error al parsear JSON de Gemini: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("El JSON parseado no es un objeto válido");
  }

  const original_text = typeof parsed.original_text === "string" ? parsed.original_text.trim() : "";
  const translation = typeof parsed.translation === "string" ? parsed.translation.trim() : "";

  if (!original_text || !translation) {
    throw new Error("Respuesta incompleta: 'original_text' o 'translation' están vacíos");
  }

  const rawLang = typeof parsed.detected_language === "string" ? parsed.detected_language : undefined;
  const detected_language = normalizeLanguage(rawLang, defaultLang);

  return {
    detected_language,
    original_text,
    translation,
  };
}

/**
 * Invoca el modelo Gemini 2.0 Flash con audio y prompt para obtener traducción.
 */
export async function translateAudioWithGemini({
  apiKey,
  audioBase64,
  mimeType,
  direction,
}: {
  apiKey: string;
  audioBase64: string;
  mimeType: string;
  direction?: string;
}): Promise<TranslationResult> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const prompt = getPromptForDirection(direction);

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: normalizeMimeType(mimeType),
        data: audioBase64,
      },
    },
    { text: prompt },
  ]);

  const responseText = result.response.text();
  const defaultLang: SupportedLanguage = direction === "ja-es" ? "ja" : "es";

  return extractAndParseGeminiJson(responseText, defaultLang);
}
