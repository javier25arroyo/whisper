export type SupportedLanguage = "es" | "ja";

export interface TranslationResult {
  detected_language: SupportedLanguage;
  original_text: string;
  translation: string;
}

/** Configuración resuelta para una llamada concreta. `baseUrl` procede del preset, nunca del cliente. */
export interface ProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export interface TranslateInput {
  audioBase64: string;
  mimeType: string;
  direction?: string;
}

export interface AudioTranslator {
  translate(cfg: ProviderConfig, input: TranslateInput): Promise<TranslationResult>;
  /** Si devuelve false, el audio debe convertirse antes de enviarse a este proveedor. */
  acceptsMimeType(mimeType: string): boolean;
}

export interface ProviderPreset {
  id: string;
  label: string;
  transport: "gemini" | "openai-compat";
  /** Solo para transport "openai-compat". Definido en el servidor, nunca recibido del navegador. */
  baseUrl?: string;
  defaultModel: string;
  /** true cuando el proveedor exige wav/mp3 y hay que convertir en el cliente. */
  requiresWav: boolean;
  /** Página donde el usuario obtiene una clave. Se muestra en los ajustes. */
  keyUrl: string;
}
