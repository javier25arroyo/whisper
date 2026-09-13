/** Frases de identidad cultural para cada lado (ver MASTER.md — "Dos Soles"). Cada
 * frase vive en el idioma de su propio lado: no se traduce, porque el objetivo no es
 * comunicar sino que quien mira esa mitad de la pantalla reconozca algo de su cultura. */
import type { SupportedLanguage } from "./translator";

export const SIDE_FLAVOR: Record<SupportedLanguage, string> = {
  es: "Con la calidez del sol de la tarde.",
  ja: "朝日のように、静かに始まる。",
};

export const APP_TAGLINE = "Dos soles, un mismo cielo";
