/**
 * Estado interno del detector de silencio, independiente de Web Audio API.
 * Separado de useSilenceDetector para poder testear la lógica sin AudioContext
 * ni requestAnimationFrame.
 */
export interface SilenceDetectionState {
  /** Marca de tiempo del primer frame de sonido consecutivo, o null si no hay racha en curso. */
  firstSoundTs: number | null;
  /** Marca de tiempo del último frame de sonido confirmado (tras soundStartMs). 0 si no hay sonido confirmado. */
  lastSoundTs: number;
  /** true si la racha de sonido actual ya superó soundStartMs (sonido "confirmado"). */
  hasSound: boolean;
}

export interface SilenceDetectionParams {
  /** Umbral RMS por debajo del cual se considera silencio. */
  threshold: number;
  /** Milisegundos continuos de silencio real (desde el último sonido confirmado) para disparar `silence`. */
  silenceMs: number;
  /** Milisegundos de sonido continuo para confirmar el inicio de sonido y disparar `soundStart`. */
  soundStartMs: number;
}

export interface SilenceDetectionEvents {
  soundStart: boolean;
  silence: boolean;
}

export interface SilenceDetectionResult {
  state: SilenceDetectionState;
  events: SilenceDetectionEvents;
}

export const initialSilenceDetectionState: SilenceDetectionState = {
  firstSoundTs: null,
  lastSoundTs: 0,
  hasSound: false,
};

/**
 * Avanza la máquina de detección de silencio un frame (una muestra RMS).
 * Función pura: sin efectos secundarios, sin acceso al reloj real (recibe `now`
 * como parámetro) para poder testearla con secuencias de muestras sintéticas.
 */
export function stepSilenceDetection(
  state: SilenceDetectionState,
  rms: number,
  now: number,
  params: SilenceDetectionParams
): SilenceDetectionResult {
  const isSound = rms >= params.threshold;
  let { firstSoundTs, lastSoundTs, hasSound } = state;
  let soundStart = false;
  let silence = false;

  if (isSound) {
    if (firstSoundTs === null) {
      firstSoundTs = now;
    } else if (now - firstSoundTs >= params.soundStartMs && !hasSound) {
      hasSound = true;
      soundStart = true;
    }
    // Refrescar la marca de "último sonido" en cada frame de sonido confirmado,
    // no sólo al confirmarlo por primera vez — de lo contrario cualquier micro-hueco
    // tras el primer segundo de habla dispara `silence` de inmediato (spec §3.1).
    if (hasSound) {
      lastSoundTs = now;
    }
  } else {
    firstSoundTs = null;
    // ceiling: un hablante cuyo RMS oscile justo alrededor de threshold puede no
    // volver a confirmar sonido tras un micro-hueco, congelando lastSoundTs. Aceptado
    // por ahora; no se corrige en este cambio.
    hasSound = false;
    if (lastSoundTs > 0 && now - lastSoundTs >= params.silenceMs) {
      lastSoundTs = 0;
      silence = true;
    }
  }

  return { state: { firstSoundTs, lastSoundTs, hasSound }, events: { soundStart, silence } };
}
