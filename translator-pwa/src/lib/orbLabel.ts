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
  /** Nombre visual del lado tal como aparece en la UI (p. ej. "日本語" para ja). */
  displayName: string;
  /** Rol visual del lado ("Tú" / "Otro"). */
  role: string;
}

/**
 * Nombre accesible del orbe según la tabla de la spec §4.3: debe ser exactamente
 * lo que una persona diría en voz alta con Control por voz de iOS para activarlo,
 * nunca una descripción técnica de su función interna.
 */
export function getOrbAccessibleLabel(params: OrbLabelParams): string {
  const { side, stateValue, activeSide, displayName, role } = params;

  if (stateValue === "listening") {
    return "Detener grabación";
  }

  if (stateValue === "speaking" || stateValue === "processing") {
    // Estado informativo, no accionable — sin cambio respecto al comportamiento previo.
    return `Orbe ${role} (${displayName}) · toca para menú`;
  }

  // idle
  if (activeSide === null) {
    return `Hablar en ${SPOKEN_LANGUAGE_NAME[side]}`;
  }
  return `${SPOKEN_LANGUAGE_NAME[side]}, en espera`;
}
