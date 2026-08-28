import { useEffect, useRef, useCallback } from "react";

export interface SilenceDetectorOptions {
  /** Stream de audio a analizar. Típicamente un MediaStream del getUserMedia. */
  stream: MediaStream | null;
  /** Umbral RMS por debajo del cual se considera silencio. Default 0.01 (≈ -45 dBFS). */
  threshold?: number;
  /** Milisegundos continuos de silencio para emitir `onSilence`. Default 700ms. */
  silenceMs?: number;
  /** Milisegundos de sonido continuo para emitir `onSoundStart`. Default 100ms. */
  soundStartMs?: number;
  /** Si está activo o no. Default true. */
  enabled?: boolean;
  /** Callback cuando se detecta sonido tras silencio. */
  onSoundStart?: () => void;
  /** Callback cuando se confirma silencio sostenido. */
  onSilence?: () => void;
  /** Callback con el nivel RMS en tiempo real (0..1). Útil para visualizaciones. */
  onLevel?: (rms: number) => void;
}

export interface SilenceDetectorHandle {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
}

/**
 * Hook que analiza un MediaStream con Web Audio API y emite eventos cuando detecta
 * sonido o silencio sostenido. Usado por el modo conversación para cerrar turnos
 * automáticamente cuando el hablante deja de hablar.
 */
export function useSilenceDetector(options: SilenceDetectorOptions): SilenceDetectorHandle {
  const {
    stream,
    threshold = 0.01,
    silenceMs = 700,
    soundStartMs = 100,
    enabled = true,
    onSoundStart,
    onSilence,
    onLevel,
  } = options;

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const lastSoundTsRef = useRef<number>(0);
  const firstSoundTsRef = useRef<number | null>(null);
  const isRunningRef = useRef<boolean>(false);
  const hasSoundRef = useRef<boolean>(false);

  const callbacksRef = useRef({ onSoundStart, onSilence, onLevel });
  callbacksRef.current = { onSoundStart, onSilence, onLevel };

  const tick = useCallback(() => {
    if (!isRunningRef.current || !analyserRef.current || !bufferRef.current) return;
    analyserRef.current.getFloatTimeDomainData(bufferRef.current);
    let sumSquares = 0;
    for (let i = 0; i < bufferRef.current.length; i++) {
      const v = bufferRef.current[i];
      sumSquares += v * v;
    }
    const rms = Math.sqrt(sumSquares / bufferRef.current.length);
    callbacksRef.current.onLevel?.(rms);

    const now = performance.now();
    const isSound = rms >= threshold;

    if (isSound) {
      if (firstSoundTsRef.current === null) {
        firstSoundTsRef.current = now;
      } else if (
        now - firstSoundTsRef.current >= soundStartMs &&
        !hasSoundRef.current
      ) {
        hasSoundRef.current = true;
        lastSoundTsRef.current = now;
        callbacksRef.current.onSoundStart?.();
      }
    } else {
      firstSoundTsRef.current = null;
      hasSoundRef.current = false;
      if (lastSoundTsRef.current > 0 && now - lastSoundTsRef.current >= silenceMs) {
        lastSoundTsRef.current = 0;
        callbacksRef.current.onSilence?.();
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [threshold, silenceMs, soundStartMs]);

  const start = useCallback(() => {
    if (isRunningRef.current) return;
    if (!stream || typeof window === "undefined") return;

    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new Ctor();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.1;
      source.connect(analyser);
      const buffer = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;
      bufferRef.current = buffer;
      lastSoundTsRef.current = 0;
      firstSoundTsRef.current = null;
      hasSoundRef.current = false;
      isRunningRef.current = true;

      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.warn("useSilenceDetector: no se pudo iniciar AudioContext", err);
      isRunningRef.current = false;
    }
  }, [stream, tick]);

  const stop = useCallback(() => {
    isRunningRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        // No-op
      }
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        // No-op
      }
      analyserRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {
        // No-op
      });
    }
    audioContextRef.current = null;
    bufferRef.current = null;
    lastSoundTsRef.current = 0;
    firstSoundTsRef.current = null;
    hasSoundRef.current = false;
  }, []);

  useEffect(() => {
    if (enabled && stream) {
      start();
    }
    return () => {
      stop();
    };
  }, [enabled, stream, start, stop]);

  return {
    start,
    stop,
    isRunning: () => isRunningRef.current,
  };
}

export default useSilenceDetector;