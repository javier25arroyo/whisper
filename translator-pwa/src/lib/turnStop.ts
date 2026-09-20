export type StopOutcome = "cancelled" | "empty" | "send";

/**
 * Decide qué hace `recorder.onstop` en un turno de conversación.
 *
 * - "cancelled": el turno se canceló (Cancelar turno, Salir, micro perdido). El audio
 *   se descarta: sin esta salida, `recorder.stop()` disparaba `onstop` igualmente y la
 *   app traducía y reproducía un turno que el usuario acababa de cancelar.
 * - "empty": no hay audio. Hay que devolver el lado a idle o se queda en "listening".
 * - "send": flujo normal.
 */
export function classifyRecorderStop(params: {
  cancelled: boolean;
  blobSize: number;
}): StopOutcome {
  if (params.cancelled) return "cancelled";
  if (params.blobSize === 0) return "empty";
  return "send";
}
