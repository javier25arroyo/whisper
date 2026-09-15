import type { SupportedLanguage } from "./translator.ts";

/**
 * Techo de seguridad (ms) para el fin de una alocución TTS en modo conversación,
 * usado SOLO si `onend`/`onerror` de SpeechSynthesisUtterance nunca disparan (bug
 * conocido de iOS/Safari: la utterance puede perderse si el motor la recolecta, o
 * el dispositivo simplemente no emite el evento). NUNCA es el mecanismo principal:
 * el turno real termina en `onend`; este valor solo evita que la conversación se
 * quede colgada en 'speaking' para siempre.
 *
 * Calibrado por idioma porque el japonés (kanji/kana) necesita bastante más tiempo
 * por carácter que el español en voz TTS (lectura NHK ≈300-400 caracteres/min ≈
 * 150-200ms/carácter a velocidad 1.0; a rate 0.92 sube a ≈165-220ms/carácter). Se
 * deja margen generoso a propósito: es un techo de seguridad, no una estimación
 * ajustada — el bug original era precisamente un techo demasiado corto (80ms/carácter,
 * calibrado para español) que cerraba el turno japonés a mitad de frase.
 */
export function estimateSpeechCeilingMs(text: string, lang: SupportedLanguage): number {
  const perCharMs = lang === "ja" ? 250 : 120;
  const floorMs = lang === "ja" ? 1500 : 1200;
  return Math.max(floorMs, text.length * perCharMs);
}

/**
 * Decide si un evento `onerror` de SpeechSynthesisUtterance debe hacer avanzar el
 * turno de conversación (cerrar 'speaking', reabrir el micro opuesto) o ignorarse.
 *
 * Se ignora cuando el error es 'canceled' o 'interrupted': significa que la propia
 * app canceló el habla (salir de la conversación, abortar turno, una nueva síntesis
 * reemplazando la anterior) — no que la síntesis fallara de verdad. Desde iOS 14,
 * Safari dispara `onerror` (no `onend`) cuando `speechSynthesis.cancel()` corta una
 * utterance en curso, así que sin este filtro cualquier cancelación de la propia app
 * reabriría el micro que el usuario acaba de cerrar.
 */
export function shouldAdvanceOnSpeechError(errorCode: string): boolean {
  return errorCode !== "canceled" && errorCode !== "interrupted";
}
