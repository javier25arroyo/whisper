import type { SideState } from "./conversationMachine";
import type { SupportedLanguage } from "./translator";

/** Nombre del idioma tal como se diría en voz alta en español — distinto del nombre
 * visual (p. ej. "日本語" se muestra en pantalla, pero se dice "Japonés"). */
const SPOKEN_LANGUAGE_NAME: Record<SupportedLanguage, string> = {
  es: "Español",
  ja: "Japonés",
};

export interface OrbLabelParams {
  /** Lado (es|ja) al que pertenece este orbe. */
  side: SupportedLanguage;
  /** Estado de este lado. */
  stateValue: SideState;
  /** Lado activo en la conversación, o null si ninguno. */
  activeSide: SupportedLanguage | null;
}

/**
 * Nombre accesible del orbe: debe ser exactamente lo que una persona diría en voz
 * alta con Control por voz de iOS para activarlo, nunca una descripción técnica de
 * su función interna (spec 2026-09-09 §4.3).
 */
export function getOrbAccessibleLabel(params: OrbLabelParams): string {
  const { side, stateValue, activeSide } = params;

  if (stateValue === "listening") return "Detener grabación";

  // Informativos y no accionables: cancelar vive en el botón "Cancelar turno", que
  // tiene su propio nombre y no depende de un menú ni de un gesto largo.
  if (stateValue === "processing") return "Traduciendo, espera";
  if (stateValue === "speaking") return "Reproduciendo traducción";

  // idle
  if (activeSide === null) return `Hablar en ${SPOKEN_LANGUAGE_NAME[side]}`;
  return `${SPOKEN_LANGUAGE_NAME[side]}, en espera`;
}
