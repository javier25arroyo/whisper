import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  getPromptForDirection,
  normalizeMimeType,
  parseTranslationJson,
} from "../translator.ts";
import type {
  AudioTranslator,
  ProviderConfig,
  SupportedLanguage,
  TranslateInput,
  TranslationResult,
} from "./types.ts";

export const GEMINI_DEFAULT_MODEL = "gemini-3.6-flash";

export const geminiProvider: AudioTranslator = {
  // normalizeMimeType convierte cualquier entrada a uno de los formatos que Gemini admite.
  acceptsMimeType(): boolean {
    return true;
  },

  async translate(cfg: ProviderConfig, input: TranslateInput): Promise<TranslationResult> {
    const genAI = new GoogleGenerativeAI(cfg.apiKey);
    const model = genAI.getGenerativeModel({ model: cfg.model || GEMINI_DEFAULT_MODEL });
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: normalizeMimeType(input.mimeType),
          data: input.audioBase64,
        },
      },
      { text: getPromptForDirection(input.direction) },
    ]);

    const defaultLang: SupportedLanguage = input.direction === "ja-es" ? "ja" : "es";
    return parseTranslationJson(result.response.text(), defaultLang);
  },
};
