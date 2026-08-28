"use client";

import { useState, useRef, useCallback, useEffect, useReducer } from "react";
import ConversationView from "./ConversationView";
import {
  initialConversationState,
  conversationReducer,
  oppositeOfActive,
  CONVERSATION_CONSTANTS,
} from "#lib/conversationMachine";

function oppositeLang(side: SupportedLanguage): SupportedLanguage {
  return side === "es" ? "ja" : "es";
}
import { useSilenceDetector } from "#lib/useSilenceDetector";
import {
  loadHistory,
  saveHistory,
  clearHistory as clearStoredHistory,
  type HistoryItemV2,
} from "#lib/history";

type Mode = "single" | "conversation";
type Direction = "auto" | "es-ja" | "ja-es";
type SupportedLanguage = "es" | "ja";

interface TranslationResult {
  detected_language: SupportedLanguage;
  original_text: string;
  translation: string;
}

const LANG_CONFIG: Record<SupportedLanguage, { flag: string; name: string; ttsCode: string; label: string }> = {
  es: { flag: "🇲🇽", name: "Español", ttsCode: "es-MX", label: "Español (México)" },
  ja: { flag: "🇯🇵", name: "日本語", ttsCode: "ja-JP", label: "Japonés" },
};

const DIRECTION_OPTIONS: { value: Direction; label: string; subLabel: string }[] = [
  { value: "auto", label: "🤖 Auto", subLabel: "Detección automática" },
  { value: "es-ja", label: "🇲🇽 → 🇯🇵", subLabel: "Español a Japonés" },
  { value: "ja-es", label: "🇯🇵 → 🇲🇽", subLabel: "Japonés a Español" },
];

const SAMPLE_PHRASES: { text: string; lang: SupportedLanguage; dir: Direction }[] = [
  { text: "Hola, ¿cómo estás? Mucho gusto.", lang: "es", dir: "es-ja" },
  { text: "¿Dónde está la estación de tren más cercana?", lang: "es", dir: "es-ja" },
  { text: "こんにちは、はじめまして。", lang: "ja", dir: "ja-es" },
  { text: "すみません、これはいくらですか？", lang: "ja", dir: "ja-es" },
];

const SOFT_LIMIT_SECONDS = CONVERSATION_CONSTANTS.SOFT_LIMIT_SECONDS;
const HARD_LIMIT_SECONDS = CONVERSATION_CONSTANTS.HARD_LIMIT_SECONDS;
const POST_TURN_PAUSE_MS = CONVERSATION_CONSTANTS.POST_TURN_PAUSE_MS;
const ESTIMATED_PROCESSING_MS = 5000;
const STORAGE_MODE_KEY = "whisper_pwa_mode";

export default function Home() {
  const [mode, setModeState] = useState<Mode>("conversation");
  const [direction, setDirection] = useState<Direction>("auto");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItemV2[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [historyDismissed, setHistoryDismissed] = useState(false);

  const setMode = useCallback((next: Mode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_MODE_KEY, next);
    } catch {
      // No-op
    }
  }, []);

  // Estado del modo conversación
  const [convState, dispatchConv] = useReducer(conversationReducer, initialConversationState);
  const [convAudioStream, setConvAudioStream] = useState<MediaStream | null>(null);
  const [convTurnSeconds, setConvTurnSeconds] = useState(0);
  const convRecorderRef = useRef<MediaRecorder | null>(null);
  const convChunksRef = useRef<Blob[]>([]);
  const convTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const convNextTurnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const convSpeakingDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Buffer para reabrir mic si el interlocutor habla durante procesando
  const pendingReopenRef = useRef<{ side: SupportedLanguage; timer: ReturnType<typeof setTimeout> | null } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cargar preferencias e historial al montar
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem(STORAGE_MODE_KEY);
      if (savedMode === "single" || savedMode === "conversation") {
        setModeState(savedMode);
      }
      const savedAutoSpeak = localStorage.getItem("whisper_pwa_autospeak");
      if (savedAutoSpeak !== null) {
        setAutoSpeak(savedAutoSpeak === "true");
      }
      setHistory(loadHistory());
    } catch {
      // Ignorar errores de localStorage en entornos restringidos
    }
  }, []);

  // Guardar autoSpeak en localStorage
  useEffect(() => {
    try {
      localStorage.setItem("whisper_pwa_autospeak", String(autoSpeak));
    } catch {
      // No-op
    }
  }, [autoSpeak]);

  // Guardar historial en localStorage
  useEffect(() => {
    saveHistory(history);
  }, [history]);

  // Limpiar timers al desmontar + TTS/micro cleanup en beforeunload y visibilitychange
  useEffect(() => {
    const cleanup = () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
    const handleBeforeUnload = () => {
      cleanup();
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (convAudioStream) {
        convAudioStream.getTracks().forEach((t) => t.stop());
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        cleanup();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (convTimerRef.current) clearInterval(convTimerRef.current);
      if (convNextTurnTimerRef.current) clearTimeout(convNextTurnTimerRef.current);
      if (convSpeakingDoneTimerRef.current) clearTimeout(convSpeakingDoneTimerRef.current);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (convAudioStream) {
        convAudioStream.getTracks().forEach((t) => t.stop());
      }
      cleanup();
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [convAudioStream]);

  // Desbloquear audio en iOS Safari (SpeechSynthesis requiere gesto del usuario previo)
  const primeAudioContext = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        const dummy = new SpeechSynthesisUtterance("");
        dummy.volume = 0;
        window.speechSynthesis.speak(dummy);
      } catch {
        // No-op
      }
    }
  }, []);

  // Reproducir síntesis de voz (TTS)
  const speak = useCallback(
    (text: string, lang: SupportedLanguage, keyId?: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        return;
      }
      window.speechSynthesis.cancel();
      const config = LANG_CONFIG[lang] || LANG_CONFIG.ja;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = config.ttsCode;
      utterance.rate = lang === "ja" ? 0.92 : 0.98;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const langPrefix = lang === "ja" ? "ja" : "es";
        const matchedVoice =
          voices.find(
            (v) => v.lang.toLowerCase().startsWith(langPrefix) && !v.name.includes("Google")
          ) || voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix));
        if (matchedVoice) {
          utterance.voice = matchedVoice;
        }
      }
      if (keyId) setSpeakingKey(keyId);
      utterance.onend = () => {
        setSpeakingKey((prev) => (prev === keyId ? null : prev));
      };
      utterance.onerror = () => {
        setSpeakingKey((prev) => (prev === keyId ? null : prev));
      };
      window.speechSynthesis.speak(utterance);
    },
    []
  );

  // Copiar al portapapeles con feedback visual
  const copyToClipboard = useCallback(async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedId(id);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 2000);
    }
  }, []);

  // =========================
  // MODO SINGLE
  // =========================

  const processAudioSingle = useCallback(
    async (blob: Blob, mimeType: string) => {
      setIsProcessing(true);
      setError(null);
      try {
        const formData = new FormData();
        const extension = mimeType.includes("mp4") ? "m4a" : "webm";
        formData.append("audio", blob, `voice-input.${extension}`);
        formData.append("direction", direction);
        const res = await fetch("/api/translate", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Error al procesar la traducción.");
        }
        const newResult: TranslationResult = {
          detected_language: data.detected_language,
          original_text: data.original_text,
          translation: data.translation,
        };
        setResult(newResult);
        const newItem: HistoryItemV2 = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
          mode: "single",
          direction,
          detected_language: newResult.detected_language,
          original_text: newResult.original_text,
          translation: newResult.translation,
        };
        setHistory((prev) => [
          newItem,
          ...prev.filter(
            (i) => i.mode !== "single" || i.original_text !== newResult.original_text
          ),
        ]);
        if (autoSpeak) {
          const targetLang = data.detected_language === "es" ? "ja" : "es";
          speak(data.translation, targetLang, "main-translation");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error inesperado al traducir.";
        setError(message);
      } finally {
        setIsProcessing(false);
      }
    },
    [direction, autoSpeak, speak]
  );

  const startRecordingSingle = useCallback(async () => {
    primeAudioContext();
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Tu navegador no soporta grabación de audio. Usa Safari en iOS o Chrome.");
      return;
    }
    try {
      setError(null);
      if (typeof window !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(35);
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      audioStreamRef.current = stream;
      let chosenMimeType = "";
      const preferredTypes = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/aac", "audio/ogg"];
      for (const type of preferredTypes) {
        if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
          chosenMimeType = type;
          break;
        }
      }
      const options = chosenMimeType ? { mimeType: chosenMimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      mediaRecorder.onstop = () => {
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach((track) => track.stop());
          audioStreamRef.current = null;
        }
        if (chunksRef.current.length > 0) {
          const finalMimeType = chosenMimeType || "audio/mp4";
          const audioBlob = new Blob(chunksRef.current, { type: finalMimeType });
          if (audioBlob.size > 0) processAudioSingle(audioBlob, finalMimeType);
          else setError("No se detectó audio grabado. Intenta hablar nuevamente.");
        }
      };
      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingSeconds(0);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= HARD_LIMIT_SECONDS - 1) {
            mediaRecorder.stop();
            setIsRecording(false);
            return HARD_LIMIT_SECONDS;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: unknown) {
      if (err instanceof Error && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
        setError("Permiso de micrófono denegado. En iOS: ve a Ajustes > Safari > Micrófono y selecciona 'Permitir'.");
      } else {
        setError("No se pudo iniciar la grabación de audio. Verifica que el micrófono esté disponible.");
      }
      setIsRecording(false);
      setRecordingSeconds(0);
    }
  }, [primeAudioContext, processAudioSingle]);

  const stopRecordingSingle = useCallback(() => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(35);
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const handleRecordToggleSingle = () => {
    if (isRecording) stopRecordingSingle();
    else startRecordingSingle();
  };

  // =========================
  // MODO CONVERSACIÓN
  // =========================

  const openConvMic = useCallback(
    async (side: SupportedLanguage) => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        dispatchConv({ type: "SET_ERROR", error: "Tu navegador no soporta grabación de audio." });
        return;
      }
      try {
        if (typeof window !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate?.(20);
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        setConvAudioStream(stream);
        // Esperar a que el efecto con el stream abra el detector de silencio
        // (se monta cuando convAudioStream cambia)
        // Pequeño delay para que AnalyserNode esté listo
        setTimeout(() => dispatchConv({ type: "OPEN_MIC", side }), 50);
      } catch (err: unknown) {
        const message =
          err instanceof Error && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
            ? "Permiso de micrófono denegado. Actívalo en ajustes del navegador."
            : "No se pudo abrir el micrófono para este turno.";
        dispatchConv({ type: "SET_ERROR", error: message });
      }
    },
    []
  );

  // Hook de silencio conectado al stream de conversación
  const convSilence = useSilenceDetector({
    stream: convAudioStream,
    enabled: convState.es === "listening" || convState.ja === "listening",
    onSilence: () => {
      // Cuando se detecta silencio, detener el recorder activo y enviar a Gemini
      if (convRecorderRef.current && convRecorderRef.current.state === "recording") {
        convRecorderRef.current.stop();
      }
    },
  });

  // Inicializar MediaRecorder cuando se abre un mic de conversación
  useEffect(() => {
    if (!convAudioStream) return;
    if (convState.es !== "listening" && convState.ja !== "listening") return;

    const activeSide: SupportedLanguage = convState.es === "listening" ? "es" : "ja";
    let chosenMimeType = "";
    const preferredTypes = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/aac", "audio/ogg"];
    for (const type of preferredTypes) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
        chosenMimeType = type;
        break;
      }
    }
    const options = chosenMimeType ? { mimeType: chosenMimeType } : undefined;
    const recorder = new MediaRecorder(convAudioStream, options);
    convRecorderRef.current = recorder;
    convChunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) convChunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      convSilence.stop();
      // Liberar micro
      if (convAudioStream) {
        convAudioStream.getTracks().forEach((t) => t.stop());
        setConvAudioStream(null);
      }
      if (convChunksRef.current.length === 0) return;

      const finalMimeType = chosenMimeType || "audio/mp4";
      const blob = new Blob(convChunksRef.current, { type: finalMimeType });
      if (blob.size === 0) return;

      dispatchConv({ type: "SEND_AUDIO", side: activeSide });

      try {
        const formData = new FormData();
        const extension = finalMimeType.includes("mp4") ? "m4a" : "webm";
        formData.append("audio", blob, `conv-${activeSide}.${extension}`);
        formData.append("direction", "auto");

        const res = await fetch("/api/translate", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) {
          dispatchConv({ type: "SET_ERROR", error: data.error || "Error en traducción" });
          // Tras error, limpiar estado activo y dejar conversation idle
          return;
        }

        const detected: SupportedLanguage = data.detected_language;
        const translation = data.translation as string;
        const originalText = data.original_text as string;

        dispatchConv({
          type: "RECEIVE_RESULT",
          side: activeSide,
          translation,
          detected,
          originalText,
        });

        // Añadir al historial
        setHistory((prev) => {
          const sessionId = convState.sessionId || "unknown";
          const newItem: HistoryItemV2 = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: Date.now(),
            mode: "conversation",
            direction: "auto",
            detected_language: detected,
            original_text: originalText,
            translation,
            session_id: sessionId,
            turn_index: convState.turnIndex,
            speaker: activeSide,
          };
          return [newItem, ...prev];
        });

        // Resetear timer de turno
        setConvTurnSeconds(0);
        if (convTimerRef.current) {
          clearInterval(convTimerRef.current);
          convTimerRef.current = null;
        }

        // Si autoSpeak, reproducir traducción dirigida al lado opuesto
        if (autoSpeak) {
          const targetLang: SupportedLanguage = activeSide === "es" ? "ja" : "es";
          dispatchConv({ type: "START_SPEAKING", side: targetLang });

          // Reproducir TTS. Al terminar, abrir el otro lado.
          speak(translation, targetLang, `conv-${targetLang}`);

          // Fallback por si utterance.onend no se dispara en Safari
          if (convSpeakingDoneTimerRef.current) clearTimeout(convSpeakingDoneTimerRef.current);
          // Estimar duración: 80ms por carácter como heurística segura
          const estimatedMs = Math.max(1500, translation.length * 80);
          convSpeakingDoneTimerRef.current = setTimeout(() => {
            dispatchConv({ type: "FINISH_SPEAKING" });
            // Programar apertura del lado opuesto tras pausa natural
            if (convNextTurnTimerRef.current) clearTimeout(convNextTurnTimerRef.current);
            convNextTurnTimerRef.current = setTimeout(() => {
              openConvMic(targetLang);
            }, POST_TURN_PAUSE_MS);
          }, estimatedMs);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error inesperado";
        dispatchConv({ type: "SET_ERROR", error: message });
      }
    };

    try {
      recorder.start(200);
    } catch (err) {
      dispatchConv({ type: "SET_ERROR", error: "No se pudo iniciar la grabación" });
      return;
    }

    // Cronómetro de turno y hard limit
    setConvTurnSeconds(0);
    if (convTimerRef.current) clearInterval(convTimerRef.current);
    convTimerRef.current = setInterval(() => {
      setConvTurnSeconds((prev) => {
        if (prev >= HARD_LIMIT_SECONDS - 1) {
          // Hard limit: cortar
          if (convRecorderRef.current && convRecorderRef.current.state === "recording") {
            convRecorderRef.current.stop();
          }
          return HARD_LIMIT_SECONDS;
        }
        return prev + 1;
      });
    }, 1000);

    return () => {
      if (convTimerRef.current) {
        clearInterval(convTimerRef.current);
        convTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convState.es, convState.ja]);

  // Cleanup explícito del MediaRecorder cuando el componente se desmonta
  useEffect(() => {
    return () => {
      if (convRecorderRef.current && convRecorderRef.current.state === "recording") {
        try {
          convRecorderRef.current.stop();
        } catch {
          // No-op
        }
      }
    };
  }, []);

  // Helpers UI conversación
  const enterConversation = useCallback(() => {
    primeAudioContext();
    const newSessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    dispatchConv({ type: "ENTER_CONVERSATION", sessionId: newSessionId, startSide: "es" });
    openConvMic("es");
  }, [primeAudioContext, openConvMic]);

  const exitConversation = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (convNextTurnTimerRef.current) {
      clearTimeout(convNextTurnTimerRef.current);
      convNextTurnTimerRef.current = null;
    }
    if (convSpeakingDoneTimerRef.current) {
      clearTimeout(convSpeakingDoneTimerRef.current);
      convSpeakingDoneTimerRef.current = null;
    }
    if (convTimerRef.current) {
      clearInterval(convTimerRef.current);
      convTimerRef.current = null;
    }
    if (convRecorderRef.current && convRecorderRef.current.state === "recording") {
      try {
        convRecorderRef.current.stop();
      } catch {
        // No-op
      }
    }
    if (convAudioStream) {
      convAudioStream.getTracks().forEach((t) => t.stop());
      setConvAudioStream(null);
    }
    setConvTurnSeconds(0);
    dispatchConv({ type: "EXIT_CONVERSATION" });
  }, [convAudioStream]);

  const handleConvLongPressOrb = useCallback(
    (side: SupportedLanguage) => {
      if (convState.activeSide !== side) return;
      // Abortar TTS y cerrar micro
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (convRecorderRef.current && convRecorderRef.current.state === "recording") {
        try {
          convRecorderRef.current.stop();
        } catch {
          // No-op
        }
      }
      if (convAudioStream) {
        convAudioStream.getTracks().forEach((t) => t.stop());
        setConvAudioStream(null);
      }
      if (convNextTurnTimerRef.current) {
        clearTimeout(convNextTurnTimerRef.current);
        convNextTurnTimerRef.current = null;
      }
      if (convSpeakingDoneTimerRef.current) {
        clearTimeout(convSpeakingDoneTimerRef.current);
        convSpeakingDoneTimerRef.current = null;
      }
      setConvTurnSeconds(0);
      dispatchConv({ type: "ABORT_ACTIVE" });
    },
    [convState.activeSide, convAudioStream]
  );

  const handleConvDoubleTapOrb = useCallback(
    (side: SupportedLanguage) => {
      if (convState[side] !== "idle") return;
      openConvMic(side);
    },
    [convState, openConvMic]
  );

  const handleConvTapOrb = useCallback(
    (side: SupportedLanguage) => {
      // Tap simple: sólo si está idle y nadie está activo, abrir este lado
      if (convState[side] !== "idle") return;
      if (convState.activeSide !== null) return;
      openConvMic(side);
    },
    [convState, openConvMic]
  );

  const handlePlayLastConv = useCallback(() => {
    if (!convState.lastTranslation || !convState.lastDetectedLanguage) return;
    const targetLang: SupportedLanguage =
      convState.lastDetectedLanguage === "es" ? "ja" : "es";
    speak(convState.lastTranslation, targetLang, "conv-last");
  }, [convState.lastTranslation, convState.lastDetectedLanguage, speak]);

  // Manejo del cambio de modo: si salimos de conversation, limpiar todo
  useEffect(() => {
    if (mode === "single" && convState.sessionId !== null) {
      exitConversation();
    }
  }, [mode, convState.sessionId, exitConversation]);

  // Auto-arranque: si el modo persistido es conversation, entrar al montar
  // (sólo cuando convState.sessionId es null, para no reiniciar la sesión cada render)
  const autoStartAttemptedRef = useRef(false);
  useEffect(() => {
    if (autoStartAttemptedRef.current) return;
    autoStartAttemptedRef.current = true;
    const hasGetUserMedia =
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function";
    if (
      mode === "conversation" &&
      convState.sessionId === null &&
      hasGetUserMedia
    ) {
      const newSessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      dispatchConv({ type: "ENTER_CONVERSATION", sessionId: newSessionId, startSide: "es" });
      setShowOnboarding(true);
      openConvMic("es");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detección de sonido durante 'procesando': reabrir el lado opuesto si se detecta voz
  const lastSideDuringProcessingRef = useRef<SupportedLanguage | null>(null);
  useEffect(() => {
    if (convState.es !== "processing" && convState.ja !== "processing") {
      lastSideDuringProcessingRef.current = null;
      return;
    }
    // Mientras estamos procesando, el interlocutor puede hablar. Si se detecta
    // sonido antes de que termine, marcamos que el próximo turno debe ser el otro lado
    // y forzamos la cancelación de la respuesta pendiente (no implementado en esta versión,
    // sólo preparamos el estado para reabrir el mic en cuanto termine la respuesta).
    const processingSide: SupportedLanguage = convState.es === "processing" ? "es" : "ja";
    lastSideDuringProcessingRef.current = oppositeLang(processingSide);
  }, [convState.es, convState.ja]);

  // Cuando termina el procesamiento, si hay un lado pendiente (interlocutor habló durante),
  // reabrimos su micro tras un pequeño delay.
  useEffect(() => {
    if (convState.activeSide !== null) return; // alguien activo, no intervenir
    if (lastSideDuringProcessingRef.current === null) return;
    if (!autoSpeak) return; // usuario quiere control manual
    const sideToReopen = lastSideDuringProcessingRef.current;
    lastSideDuringProcessingRef.current = null;
    const t = setTimeout(() => {
      // Sólo si sigue idle (no se canceló manualmente en el ínterin)
      if (convState[sideToReopen] === "idle" && convState.activeSide === null) {
        openConvMic(sideToReopen);
      }
    }, POST_TURN_PAUSE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convState.es, convState.ja, convState.activeSide]);

  const handleClearHistory = () => {
    setHistory([]);
    clearStoredHistory();
  };

  // =========================
  // RENDER
  // =========================

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col max-w-lg mx-auto pb-6">
      {/* Header */}
      <header className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-slate-900/80 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center text-xl shadow-lg shadow-violet-950/60 ring-1 ring-white/10 shrink-0">
            🎙️
          </div>
          <div className="min-w-0">
            <h1 className="text-white font-bold text-lg tracking-tight leading-tight truncate">
              Traductor de Voz
            </h1>
            <p className="text-slate-400 text-xs font-medium truncate">
              Español ↔ 日本語 · Gemini AI
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Toggle Auto-speak */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-full px-2 py-1 shadow-sm">
            <span className="text-xs text-slate-300 font-medium">
              <span className="text-xs">{autoSpeak ? "🔊" : "🔇"}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={autoSpeak}
              aria-label="Voz automática al traducir"
              onClick={() => {
                primeAudioContext();
                setAutoSpeak((prev) => !prev);
              }}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                autoSpeak ? "bg-violet-600 shadow-sm shadow-violet-600/50" : "bg-slate-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  autoSpeak ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* Segmented control de modo (debajo del header, fila propia) */}
      <div className="px-5 pt-3 pb-3 border-b border-slate-900/60">
        <div className="flex bg-slate-900/90 border border-slate-800/80 rounded-2xl p-1 gap-1 shadow-inner" role="tablist" aria-label="Modo de uso">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "single"}
            onClick={() => {
              primeAudioContext();
              setMode("single");
            }}
            className={`flex-1 py-2.5 px-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
              mode === "single"
                ? "bg-violet-600 text-white shadow-lg shadow-violet-900/50"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            🎯 Una frase
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "conversation"}
            onClick={() => {
              primeAudioContext();
              if (mode === "single") {
                enterConversation();
                setShowOnboarding(true);
              }
              setMode("conversation");
            }}
            className={`flex-1 py-2.5 px-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
              mode === "conversation"
                ? "bg-violet-600 text-white shadow-lg shadow-violet-900/50"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            💬 Conversación
          </button>
        </div>
      </div>

      {/* Selector de Dirección (sólo single) */}
      {mode === "single" && (
        <section className="px-5 pt-4 pb-2" aria-label="Dirección de traducción">
          <div className="flex bg-slate-900/90 border border-slate-800/80 rounded-2xl p-1 gap-1 shadow-inner">
            {DIRECTION_OPTIONS.map((opt) => {
              const isSelected = direction === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => {
                    primeAudioContext();
                    setDirection(opt.value);
                  }}
                  className={`flex-1 py-2.5 px-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 flex flex-col items-center justify-center gap-0.5 ${
                    isSelected
                      ? "bg-violet-600 text-white shadow-lg shadow-violet-900/50 font-bold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Contenido principal según modo */}
      {mode === "single" ? (
        <>
          {/* Zona Central de Grabación */}
          <section className="flex flex-col items-center justify-center py-6 px-5" aria-label="Control de grabación">
            <div className="relative flex items-center justify-center mb-5">
              {isRecording && (
                <>
                  <span className="absolute w-36 h-36 rounded-full bg-red-500/25 recording-ring pointer-events-none" />
                  <span className="absolute w-36 h-36 rounded-full bg-red-500/15 recording-ring-2 pointer-events-none" />
                </>
              )}
              <button
                onClick={handleRecordToggleSingle}
                disabled={isProcessing}
                aria-label={isRecording ? "Detener grabación" : "Iniciar grabación"}
                className={`relative w-28 h-28 rounded-full flex flex-col items-center justify-center gap-1 shadow-2xl transition-all duration-200 active:scale-95 select-none touch-manipulation focus:outline-none ${
                  isProcessing
                    ? "bg-slate-800 border-2 border-slate-700 cursor-not-allowed opacity-90"
                    : isRecording
                    ? "bg-red-600 shadow-red-900/60 scale-105 ring-4 ring-red-500/30"
                    : "bg-gradient-to-tr from-violet-600 to-indigo-500 shadow-violet-900/50 hover:brightness-110 ring-4 ring-violet-500/20"
                }`}
              >
                {isProcessing ? (
                  <>
                    <div className="w-8 h-8 border-[3px] border-white border-t-transparent rounded-full animate-spin" />
                    <span className="text-white text-[11px] font-semibold tracking-tight">Traduciendo</span>
                  </>
                ) : isRecording ? (
                  <>
                    <span className="text-3xl text-white">⏹</span>
                    <span className="text-white text-xs font-black tracking-wider">
                      {recordingSeconds < 10 ? `0:0${recordingSeconds}` : `0:${recordingSeconds}`}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-3xl">🎙️</span>
                    <span className="text-white text-xs font-bold tracking-tight">Toca y habla</span>
                  </>
                )}
              </button>
            </div>
            <div className="text-center px-4">
              <p className="text-sm font-medium transition-colors">
                {isProcessing ? (
                  <span className="text-violet-400 font-semibold animate-pulse">Gemini 2.0 está procesando tu voz…</span>
                ) : isRecording ? (
                  <span className="text-red-400 font-semibold">
                    Grabando ({HARD_LIMIT_SECONDS - recordingSeconds}s restantes) · Toca para traducir
                  </span>
                ) : (
                  <span className="text-slate-400">Toca el micrófono, habla en Español o Japonés y suéltalo</span>
                )}
              </p>
            </div>
          </section>

          {error && (
            <div className="mx-5 mb-4 bg-red-950/70 border border-red-800/60 rounded-2xl p-4 flex items-start gap-3 shadow-lg">
              <span className="text-xl shrink-0">⚠️</span>
              <div className="flex-1">
                <p className="text-red-200 text-xs sm:text-sm leading-relaxed font-medium">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-white text-xs px-2 py-1 rounded-lg bg-red-900/40"
              >
                ✕
              </button>
            </div>
          )}

          {result && !isProcessing && (
            <section className="mx-5 mb-5 space-y-3" aria-label="Resultado de traducción">
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-md">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{LANG_CONFIG[result.detected_language]?.flag}</span>
                    <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                      {LANG_CONFIG[result.detected_language]?.name} · Original
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="Escuchar texto original"
                      onClick={() => speak(result.original_text, result.detected_language, "main-original")}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                        speakingKey === "main-original"
                          ? "bg-violet-600 text-white shadow-md scale-105"
                          : "bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700"
                      }`}
                    >
                      {speakingKey === "main-original" ? "🔊" : "🔉"}
                    </button>
                    <button
                      type="button"
                      aria-label="Copiar texto original"
                      onClick={() => copyToClipboard(result.original_text, "main-orig")}
                      className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 transition-colors text-xs"
                    >
                      {copiedId === "main-orig" ? "✅" : "📋"}
                    </button>
                  </div>
                </div>
                <p className="text-slate-100 text-base leading-relaxed break-words font-medium">
                  {result.original_text}
                </p>
              </div>

              {(() => {
                const targetLang = result.detected_language === "es" ? "ja" : "es";
                const targetConfig = LANG_CONFIG[targetLang];
                return (
                  <div className="bg-gradient-to-br from-violet-950/90 via-indigo-950/80 to-slate-900 border border-violet-700/40 rounded-2xl p-4 shadow-xl">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{targetConfig?.flag}</span>
                        <span className="text-violet-300 text-xs font-bold uppercase tracking-wider">
                          {targetConfig?.name} · Traducción
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label="Escuchar traducción"
                          onClick={() => speak(result.translation, targetLang, "main-translation")}
                          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                            speakingKey === "main-translation"
                              ? "bg-violet-500 text-white shadow-lg scale-105 ring-2 ring-violet-300"
                              : "bg-violet-900/60 text-violet-200 hover:text-white hover:bg-violet-800"
                          }`}
                        >
                          {speakingKey === "main-translation" ? "🔊" : "🔉"}
                        </button>
                        <button
                          type="button"
                          aria-label="Copiar traducción"
                          onClick={() => copyToClipboard(result.translation, "main-trans")}
                          className="w-9 h-9 rounded-xl bg-violet-900/60 flex items-center justify-center text-violet-200 hover:text-white hover:bg-violet-800 transition-colors text-xs"
                        >
                          {copiedId === "main-trans" ? "✅" : "📋"}
                        </button>
                      </div>
                    </div>
                    <p className="text-white text-lg sm:text-xl leading-relaxed break-words font-semibold">
                      {result.translation}
                    </p>
                  </div>
                );
              })()}
            </section>
          )}
        </>
      ) : (
        <ConversationView
          state={convState}
          onLongPressOrb={handleConvLongPressOrb}
          onDoubleTapOrb={handleConvDoubleTapOrb}
          onOpenMic={handleConvTapOrb}
          onExit={() => {
            exitConversation();
            setShowOnboarding(false);
          }}
          onPlayLastTranslation={handlePlayLastConv}
          history={history}
          turnDurationSeconds={convTurnSeconds}
          softLimitSeconds={SOFT_LIMIT_SECONDS}
          estimatedProcessingMs={ESTIMATED_PROCESSING_MS}
          showOnboarding={showOnboarding}
          onDismissOnboarding={() => setShowOnboarding(false)}
        />
      )}

      {/* Historial unificado — siempre visible en single, colapsado en conversation */}
      {history.length > 0 && (
        <section className="mx-5 mb-5" aria-label="Historial de traducciones">
          {mode === "conversation" && !showFullHistory ? (
            <button
              type="button"
              onClick={() => setShowFullHistory(true)}
              className="w-full bg-slate-900/50 hover:bg-slate-900 border border-slate-800/80 rounded-xl px-3 py-2 flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <span className="flex items-center gap-2">
                <span>📜</span>
                <span>Ver historial ({history.length})</span>
              </span>
              <span aria-hidden="true">↓</span>
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                  <span>Historial ({history.length})</span>
                  {mode === "conversation" && (
                    <button
                      type="button"
                      onClick={() => setShowFullHistory(false)}
                      aria-label="Ocultar historial"
                      className="text-slate-500 hover:text-slate-300 text-[11px] font-normal normal-case tracking-normal"
                    >
                      Ocultar ↑
                    </button>
                  )}
                </span>
                <button
                  onClick={handleClearHistory}
                  className="text-slate-500 hover:text-slate-300 text-[11px] font-medium transition-colors"
                >
                  Borrar historial
                </button>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {history.map((item, idx) => {
                  const targetLang: SupportedLanguage = item.detected_language === "es" ? "ja" : "es";
                  const isItemSpeaking = speakingKey === `hist-${item.id}`;
                  const isItemCopied = copiedId === `hist-${item.id}`;
                  const showSessionHeader =
                    item.mode === "conversation" &&
                    (idx === 0 || history[idx - 1]?.session_id !== item.session_id);

                  return (
                    <div key={item.id}>
                      {showSessionHeader && (
                        <div className="text-[10px] text-violet-400 uppercase font-bold tracking-wider mt-2 mb-1 pl-1">
                          💬 Sesión conversación
                        </div>
                      )}
                      <div
                        className="bg-slate-900/70 hover:bg-slate-900 border border-slate-800/80 rounded-xl p-3 flex items-start gap-3 transition-colors cursor-pointer group"
                        onClick={() => {
                          if (mode === "single") {
                            setResult({
                              detected_language: item.detected_language,
                              original_text: item.original_text,
                              translation: item.translation,
                            });
                          }
                        }}
                      >
                        <div className="flex flex-col items-center gap-0.5 mt-0.5 shrink-0">
                          <span className="text-sm">{LANG_CONFIG[item.detected_language]?.flag}</span>
                          <span className="text-[10px] text-slate-500">↓</span>
                          <span className="text-sm">{LANG_CONFIG[targetLang]?.flag}</span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-slate-300 text-xs font-medium truncate">{item.original_text}</p>
                          <p className="text-violet-300 text-xs font-semibold truncate mt-0.5">{item.translation}</p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            aria-label="Reproducir traducción"
                            onClick={() => speak(item.translation, targetLang, `hist-${item.id}`)}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-colors ${
                              isItemSpeaking
                                ? "bg-violet-600 text-white shadow-sm"
                                : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                            }`}
                          >
                            {isItemSpeaking ? "🔊" : "🔉"}
                          </button>
                          <button
                            type="button"
                            aria-label="Copiar traducción"
                            onClick={() => copyToClipboard(item.translation, `hist-${item.id}`)}
                            className="w-7 h-7 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center text-xs transition-colors"
                          >
                            {isItemCopied ? "✅" : "📋"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {/* Estado vacío single con muestras */}
      {mode === "single" && !result && !error && !isProcessing && history.length === 0 && (
        <section className="flex-1 flex flex-col items-center justify-center px-6 py-6 text-center">
          <div className="w-14 h-14 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-3xl mb-3 shadow-inner">
            🗾
          </div>
          <h2 className="text-white font-bold text-base mb-1">Traductor Instantáneo Español ↔ Japonés</h2>
          <p className="text-slate-400 text-xs leading-relaxed max-w-xs mb-5">
            Presiona el micrófono y habla naturalmente. Gemini AI detectará tu idioma y lo traducirá con voz automáticamente.
          </p>
          <div className="w-full max-w-sm">
            <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider mb-2">Frases sugeridas</p>
            <div className="grid grid-cols-1 gap-2">
              {SAMPLE_PHRASES.map((phrase, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    primeAudioContext();
                    setDirection(phrase.dir);
                    speak(phrase.text, phrase.lang, `sample-${idx}`);
                  }}
                  className="bg-slate-900/80 hover:bg-slate-800 border border-slate-800 rounded-xl px-3 py-2 text-left text-xs text-slate-300 hover:text-white transition-colors flex items-center justify-between group"
                >
                  <span className="truncate mr-2">
                    {LANG_CONFIG[phrase.lang].flag} {phrase.text}
                  </span>
                  <span className="text-[10px] text-violet-400 font-medium shrink-0 group-hover:underline">🔊 Escuchar</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {mode === "single" && (
        <footer className="mt-auto px-5 pt-4 text-center">
          <p className="text-slate-500 text-[11px] leading-relaxed">
            📱 Para modo pantalla completa en iPhone: pulsa{" "}
            <strong className="text-slate-400 font-semibold">Compartir</strong> ➔{" "}
            <strong className="text-slate-400 font-semibold">Añadir a inicio</strong>
          </p>
        </footer>
      )}
    </main>
  );
}