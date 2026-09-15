"use client";

import { useState, useRef, useCallback, useEffect, useReducer } from "react";
import ConversationView from "./ConversationView";
import SettingsSheet from "./SettingsSheet";
import EmergencySheet from "./EmergencySheet";
import {
  initialConversationState,
  conversationReducer,
  oppositeOfActive,
  CONVERSATION_CONSTANTS,
} from "#lib/conversationMachine";
import { estimateSpeechCeilingMs, shouldAdvanceOnSpeechError } from "#lib/ttsTurn";

function oppositeLang(side: SupportedLanguage): SupportedLanguage {
  return side === "es" ? "ja" : "es";
}
import { useSilenceDetector } from "#lib/useSilenceDetector";
import { postTranslate } from "#lib/apiClient";
import {
  loadHistory,
  saveHistory,
  clearHistory as clearStoredHistory,
  type HistoryItemV2,
} from "#lib/history";
import { useTheme } from "#lib/theme";
import { APP_TAGLINE } from "#lib/uiCopy";
import { SunWarmIcon, SunDawnIcon, SunToggleIcon, MoonToggleIcon } from "../components/icons";
import {
  Mic,
  Settings,
  X,
  MessageCircle,
  Target,
  History,
  Check,
  Copy,
  Volume2,
  Volume1,
  VolumeX,
  AlertTriangle,
  Smartphone,
  ArrowRight,
  Square,
} from "lucide-react";

type Mode = "single" | "conversation";
type Direction = "auto" | "es-ja" | "ja-es";
type SupportedLanguage = "es" | "ja";

interface TranslationResult {
  detected_language: SupportedLanguage;
  original_text: string;
  translation: string;
}

function LangIcon({ lang, className }: { lang: SupportedLanguage; className?: string }) {
  return lang === "es" ? <SunWarmIcon className={className} /> : <SunDawnIcon className={className} />;
}

const LANG_CONFIG: Record<SupportedLanguage, { name: string; ttsCode: string; label: string }> = {
  es: { name: "Español", ttsCode: "es-MX", label: "Español" },
  ja: { name: "日本語", ttsCode: "ja-JP", label: "Japonés" },
};

const DIRECTION_OPTIONS: { value: Direction; label: string; subLabel: string }[] = [
  { value: "auto", label: "Auto", subLabel: "Detección automática" },
  { value: "es-ja", label: "ES → JA", subLabel: "Español a Japonés" },
  { value: "ja-es", label: "JA → ES", subLabel: "Japonés a Español" },
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
const SILENCE_MS = CONVERSATION_CONSTANTS.SILENCE_MS;
const ESTIMATED_PROCESSING_MS = 5000;
const STORAGE_MODE_KEY = "whisper_pwa_mode";

export default function Home() {
  const { theme, toggleTheme } = useTheme();
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
  const [showSettings, setShowSettings] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);

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
  // Utterance TTS en curso: mantenerla referenciada evita que Safari/Chrome la
  // recolecten antes de que dispare onend (bug documentado de ambos motores).
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  // Token de turno: si llega un onend/onerror tardío de una utterance ya
  // reemplazada por una más nueva, se ignora.
  const speechTurnTokenRef = useRef(0);
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

  // Ref con el stream de conversación actual, para que la limpieza de solo-montaje
  // de abajo pueda parar sus pistas al desmontar/cerrar pestaña sin depender de
  // convAudioStream (y sin re-ejecutarse — y sin cancelar TTS — en cada cambio).
  const convAudioStreamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    const prev = convAudioStreamRef.current;
    convAudioStreamRef.current = convAudioStream;
    if (prev && prev !== convAudioStream) {
      prev.getTracks().forEach((t) => t.stop());
    }
  }, [convAudioStream]);

  // Limpieza de solo-montaje: timers, streams y TTS al desmontar, en beforeunload
  // y cuando la pestaña pasa a oculta. Deliberadamente SIN convAudioStream en las
  // deps: antes este efecto se re-ejecutaba en cada cambio de stream (cada vez que
  // se abría un turno nuevo) y su limpieza cancelaba speechSynthesis en el camino —
  // eso era lo que cortaba el TTS en japonés a mitad de frase.
  useEffect(() => {
    const cleanup = () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
    const stopStreams = () => {
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (convAudioStreamRef.current) {
        convAudioStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
    const handleBeforeUnload = () => {
      cleanup();
      stopStreams();
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
      stopStreams();
      cleanup();
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

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

  // Reproducir síntesis de voz (TTS). `onDone` se llama cuando la voz termina de
  // verdad (onend) o falla de verdad (onerror con un error que no es una
  // cancelación propia) — nunca por una estimación de duración.
  const speak = useCallback(
    (
      text: string,
      lang: SupportedLanguage,
      keyId?: string,
      onDone?: (info: { finished: boolean }) => void
    ) => {
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

      currentUtteranceRef.current = utterance;
      const turnToken = ++speechTurnTokenRef.current;

      const isCurrentTurn = () =>
        currentUtteranceRef.current === utterance && speechTurnTokenRef.current === turnToken;

      utterance.onend = () => {
        setSpeakingKey((prev) => (prev === keyId ? null : prev));
        const wasCurrent = isCurrentTurn();
        if (currentUtteranceRef.current === utterance) currentUtteranceRef.current = null;
        if (wasCurrent) onDone?.({ finished: true });
      };
      utterance.onerror = (event) => {
        setSpeakingKey((prev) => (prev === keyId ? null : prev));
        const wasCurrent = isCurrentTurn();
        if (currentUtteranceRef.current === utterance) currentUtteranceRef.current = null;
        if (wasCurrent && shouldAdvanceOnSpeechError(event.error)) {
          onDone?.({ finished: false });
        }
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
        const data = await postTranslate({ blob, mimeType, direction });
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
    silenceMs: SILENCE_MS,
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
        const data = await postTranslate({
          blob,
          mimeType: finalMimeType,
          direction: "auto",
        });

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

        // Si autoSpeak, reproducir traducción dirigida al lado opuesto.
        // El turno avanza cuando la voz termina de verdad (onDone, via onend/
        // onerror real) — el temporizador de abajo es solo la red de seguridad
        // por si ese evento nunca llega.
        if (autoSpeak) {
          const targetLang: SupportedLanguage = activeSide === "es" ? "ja" : "es";
          dispatchConv({ type: "START_SPEAKING", side: targetLang });

          let turnFinished = false;
          const finishTurn = () => {
            if (turnFinished) return;
            turnFinished = true;
            if (convSpeakingDoneTimerRef.current) {
              clearTimeout(convSpeakingDoneTimerRef.current);
              convSpeakingDoneTimerRef.current = null;
            }
            dispatchConv({ type: "FINISH_SPEAKING" });
            // Programar apertura del lado opuesto tras pausa natural
            if (convNextTurnTimerRef.current) clearTimeout(convNextTurnTimerRef.current);
            convNextTurnTimerRef.current = setTimeout(() => {
              openConvMic(targetLang);
            }, POST_TURN_PAUSE_MS);
          };

          // Red de seguridad: solo actúa si onend/onerror nunca dispararon. Si al
          // disparar el techo la voz sigue sonando de verdad (window.speechSynthesis.speaking),
          // NO cerramos el turno — eso abriría el micro sobre TTS todavía audible
          // (turno fantasma). Reintentamos cada segundo hasta que de verdad haya terminado.
          const ceilingFired = () => {
            if (typeof window !== "undefined" && window.speechSynthesis.speaking) {
              convSpeakingDoneTimerRef.current = setTimeout(ceilingFired, 1000);
              return;
            }
            finishTurn();
          };

          speak(translation, targetLang, `conv-${targetLang}`, () => finishTurn());

          convSpeakingDoneTimerRef.current = setTimeout(
            ceilingFired,
            estimateSpeechCeilingMs(translation, targetLang)
          );
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

  const handleConvStopTurn = useCallback(
    (side: SupportedLanguage) => {
      if (convState[side] !== "listening") return;
      if (convRecorderRef.current && convRecorderRef.current.state === "recording") {
        convRecorderRef.current.stop();
      }
    },
    [convState]
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
    // No reproducir sobre un micro abierto: la voz sería captada por el otro
    // lado y crearía un turno traducido fantasma (docs/CONTEXT.md: "Micro
    // cerrado durante speaking").
    const aSideIsBusy =
      convState.es === "listening" ||
      convState.es === "processing" ||
      convState.es === "speaking" ||
      convState.ja === "listening" ||
      convState.ja === "processing" ||
      convState.ja === "speaking";
    if (aSideIsBusy) return;
    const targetLang: SupportedLanguage =
      convState.lastDetectedLanguage === "es" ? "ja" : "es";
    speak(convState.lastTranslation, targetLang, "conv-last");
  }, [convState.lastTranslation, convState.lastDetectedLanguage, convState.es, convState.ja, speak]);

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
    <>
    <main
      className="min-h-screen bg-bg text-fg flex flex-col max-w-lg mx-auto pb-6"
      {...(showEmergency ? { inert: true } : {})}
    >
      {/* Header */}
      <header className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-line gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-es-500 to-ja-600 flex items-center justify-center shadow-md ring-1 ring-line shrink-0">
            <Mic className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-fg font-bold text-lg tracking-tight leading-tight truncate">
              Traductor de Voz
            </h1>
            <p className="text-fg-muted text-xs font-medium truncate">
              Español ↔ 日本語 · Gemini AI
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (isRecording) stopRecordingSingle();
              exitConversation();
              setShowEmergency(true);
            }}
            aria-label="SOS Emergencia"
            className="flex h-9 min-w-[3.25rem] items-center justify-center rounded-full bg-danger px-3 font-black text-white text-sm ring-1 ring-white/20 shadow-md transition-transform duration-fast ease-out active:scale-95"
          >
            SOS
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-fg-muted hover:text-fg transition-colors duration-base"
          >
            {theme === "dark" ? (
              <SunToggleIcon className="w-4 h-4 icon-theme" />
            ) : (
              <MoonToggleIcon className="w-4 h-4 icon-theme" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            aria-label="Ajustes del proveedor de IA"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-fg-muted hover:text-fg transition-colors duration-base"
          >
            <Settings className="w-4 h-4" />
          </button>
          {/* Toggle Auto-speak */}
          <div className="flex items-center gap-1.5 bg-surface border border-line rounded-full px-2 py-1 shadow-sm">
            <span className="text-fg-muted">
              {autoSpeak ? <Volume2 className="w-3.5 h-3.5 icon-swap" /> : <VolumeX className="w-3.5 h-3.5 icon-swap" />}
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
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-base ease-out focus:outline-none ${
                autoSpeak ? "bg-fg" : "bg-surface-muted"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-bg shadow-md ring-0 transition duration-base ease-out ${
                  autoSpeak ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* Segmented control de modo (debajo del header, fila propia) */}
      <div className="px-5 pt-3 pb-3 border-b border-line">
        <div className="flex bg-surface border border-line rounded-lg p-1 gap-1 shadow-sm" role="tablist" aria-label="Modo de uso">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "single"}
            aria-label="Una frase"
            onClick={() => {
              primeAudioContext();
              setMode("single");
            }}
            className={`flex-1 py-2.5 px-2 rounded-md text-xs font-semibold transition-all duration-base ease-out ${
              mode === "single"
                ? "bg-fg text-bg shadow-md"
                : "text-fg-muted hover:text-fg hover:bg-surface-muted"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Target className="w-4 h-4" />
              Una frase
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "conversation"}
            aria-label="Conversación"
            onClick={() => {
              primeAudioContext();
              if (mode === "single") {
                enterConversation();
                setShowOnboarding(true);
              }
              setMode("conversation");
            }}
            className={`flex-1 py-2.5 px-2 rounded-md text-xs font-semibold transition-all duration-base ease-out ${
              mode === "conversation"
                ? "bg-fg text-bg shadow-md"
                : "text-fg-muted hover:text-fg hover:bg-surface-muted"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="w-4 h-4" />
              Conversación
            </span>
          </button>
        </div>
      </div>

      {/* Selector de Dirección (sólo single) */}
      {mode === "single" && (
        <section className="px-5 pt-4 pb-2" aria-label="Dirección de traducción">
          <div className="flex bg-surface border border-line rounded-lg p-1 gap-1 shadow-sm">
            {DIRECTION_OPTIONS.map((opt) => {
              const isSelected = direction === opt.value;
              const selectedClass =
                opt.value === "es-ja"
                  ? "bg-es-500 text-white shadow-es-glow"
                  : opt.value === "ja-es"
                  ? "bg-ja-600 text-white shadow-ja-glow"
                  : "bg-fg text-bg shadow-md";
              return (
                <button
                  key={opt.value}
                  aria-label={opt.value === "auto" ? "Auto, detección automática" : opt.subLabel}
                  onClick={() => {
                    primeAudioContext();
                    setDirection(opt.value);
                  }}
                  className={`flex-1 py-2.5 px-2 rounded-md text-xs sm:text-sm font-semibold transition-all duration-base ease-out flex flex-col items-center justify-center gap-1 ${
                    isSelected ? selectedClass : "text-fg-muted hover:text-fg hover:bg-surface-muted"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {opt.value === "es-ja" && <SunWarmIcon className="w-3.5 h-3.5" />}
                    {opt.value === "ja-es" && <SunDawnIcon className="w-3.5 h-3.5" />}
                    {opt.label}
                    {opt.value === "es-ja" && <SunDawnIcon className="w-3.5 h-3.5" />}
                    {opt.value === "ja-es" && <SunWarmIcon className="w-3.5 h-3.5" />}
                  </span>
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
                  <span className="absolute w-36 h-36 rounded-full bg-danger/25 recording-ring pointer-events-none" />
                  <span className="absolute w-36 h-36 rounded-full bg-danger/15 recording-ring-2 pointer-events-none" />
                </>
              )}
              <button
                onClick={handleRecordToggleSingle}
                disabled={isProcessing}
                aria-label={isRecording ? "Detener grabación" : "Iniciar grabación"}
                className={`relative w-28 h-28 rounded-full flex flex-col items-center justify-center gap-1 shadow-lg transition-all duration-base ease-out active:scale-95 select-none touch-manipulation focus:outline-none ${
                  isProcessing
                    ? "bg-surface-muted border-2 border-line cursor-not-allowed opacity-90"
                    : isRecording
                    ? "bg-danger scale-105 ring-4 ring-danger/30"
                    : "bg-gradient-to-br from-es-500 to-ja-600 hover:brightness-110 ring-4 ring-line"
                }`}
              >
                {isProcessing ? (
                  <>
                    <div className="w-8 h-8 border-[3px] border-white border-t-transparent rounded-full animate-spin" />
                    <span className="text-white text-[11px] font-semibold tracking-tight">Traduciendo</span>
                  </>
                ) : isRecording ? (
                  <>
                    <Square className="w-7 h-7 text-white icon-swap" fill="currentColor" />
                    <span className="text-white text-xs font-black tracking-wider">
                      {recordingSeconds < 10 ? `0:0${recordingSeconds}` : `0:${recordingSeconds}`}
                    </span>
                  </>
                ) : (
                  <>
                    <Mic className="w-7 h-7 text-white icon-swap" />
                    <span className="text-white text-xs font-bold tracking-tight">Toca y habla</span>
                  </>
                )}
              </button>
            </div>
            <div className="text-center px-4">
              <p className="text-sm font-medium transition-colors">
                {isProcessing ? (
                  <span className="text-es-600 font-semibold animate-pulse">Gemini 2.0 está procesando tu voz…</span>
                ) : isRecording ? (
                  <span className="text-danger font-semibold">
                    Grabando ({HARD_LIMIT_SECONDS - recordingSeconds}s restantes) · Toca para traducir
                  </span>
                ) : (
                  <span className="text-fg-muted">Toca el micrófono, habla en Español o Japonés y suéltalo</span>
                )}
              </p>
            </div>
          </section>

          {error && (
            <div className="mx-5 mb-4 bg-danger-surface border border-danger/30 rounded-lg p-4 flex items-start gap-3 shadow-md">
              <AlertTriangle className="w-5 h-5 text-danger shrink-0" />
              <div className="flex-1">
                <p className="text-danger text-xs sm:text-sm leading-relaxed font-medium">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                aria-label="Cerrar error"
                className="text-danger hover:opacity-70 p-1 rounded-md bg-danger/10"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {result && !isProcessing && (
            <section className="mx-5 mb-5 space-y-3" aria-label="Resultado de traducción">
              <div className="bg-surface border border-line rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <LangIcon lang={result.detected_language} className={`w-5 h-5 ${result.detected_language === "es" ? "text-es-500" : "text-ja-500"}`} />
                    <span className="text-fg-muted text-xs font-bold uppercase tracking-wider">
                      {LANG_CONFIG[result.detected_language]?.name} · Original
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="Escuchar texto original"
                      onClick={() => speak(result.original_text, result.detected_language, "main-original")}
                      className={`w-8 h-8 rounded-md flex items-center justify-center transition-all duration-base ${
                        speakingKey === "main-original"
                          ? "bg-fg text-bg shadow-sm scale-105"
                          : "bg-surface-muted text-fg-muted hover:text-fg"
                      }`}
                    >
                      {speakingKey === "main-original" ? (
                        <Volume2 className="w-4 h-4 icon-speaking" />
                      ) : (
                        <Volume1 className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label="Copiar texto original"
                      onClick={() => copyToClipboard(result.original_text, "main-orig")}
                      className="w-8 h-8 rounded-md bg-surface-muted flex items-center justify-center text-fg-muted hover:text-fg transition-colors duration-base"
                    >
                      {copiedId === "main-orig" ? <Check className="w-4 h-4 icon-pop" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <p className="text-fg text-base leading-relaxed break-words font-medium">
                  {result.original_text}
                </p>
              </div>

              {(() => {
                const targetLang = result.detected_language === "es" ? "ja" : "es";
                const targetConfig = LANG_CONFIG[targetLang];
                const isJa = targetLang === "ja";
                return (
                  <div
                    className={`border rounded-lg p-4 shadow-md ${
                      isJa ? "bg-ja-surface border-ja-500/30" : "bg-es-surface border-es-500/30"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <LangIcon lang={targetLang} className={`w-5 h-5 ${isJa ? "text-ja-600" : "text-es-600"}`} />
                        <span className={`text-xs font-bold uppercase tracking-wider ${isJa ? "text-ja-700" : "text-es-700"}`}>
                          {targetConfig?.name} · Traducción
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label="Escuchar traducción"
                          onClick={() => speak(result.translation, targetLang, "main-translation")}
                          className={`w-9 h-9 rounded-md flex items-center justify-center transition-all duration-base ${
                            speakingKey === "main-translation"
                              ? `${isJa ? "bg-ja-600" : "bg-es-600"} text-white shadow-md scale-105`
                              : `${isJa ? "bg-ja-500/15 text-ja-700" : "bg-es-500/15 text-es-700"} hover:opacity-80`
                          }`}
                        >
                          {speakingKey === "main-translation" ? (
                            <Volume2 className="w-4 h-4 icon-speaking" />
                          ) : (
                            <Volume1 className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label="Copiar traducción"
                          onClick={() => copyToClipboard(result.translation, "main-trans")}
                          className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors duration-base ${
                            isJa ? "bg-ja-500/15 text-ja-700" : "bg-es-500/15 text-es-700"
                          } hover:opacity-80`}
                        >
                          {copiedId === "main-trans" ? <Check className="w-4 h-4 icon-pop" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <p className="text-fg text-lg sm:text-xl leading-relaxed break-words font-semibold">
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
          onStopTurn={handleConvStopTurn}
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
              className="w-full bg-surface hover:bg-surface-muted border border-line rounded-md px-3 py-2 flex items-center justify-between text-xs text-fg-muted hover:text-fg transition-colors duration-base"
            >
              <span className="flex items-center gap-2">
                <History className="w-3.5 h-3.5" />
                <span>Ver historial ({history.length})</span>
              </span>
              <span aria-hidden="true">↓</span>
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-fg-muted text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                  <span>Historial ({history.length})</span>
                  {mode === "conversation" && (
                    <button
                      type="button"
                      onClick={() => setShowFullHistory(false)}
                      aria-label="Ocultar historial"
                      className="text-fg-faint hover:text-fg-muted text-[11px] font-normal normal-case tracking-normal"
                    >
                      Ocultar ↑
                    </button>
                  )}
                </span>
                <button
                  onClick={handleClearHistory}
                  className="text-fg-faint hover:text-fg-muted text-[11px] font-medium transition-colors duration-base"
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
                  const isJa = targetLang === "ja";

                  return (
                    <div key={item.id}>
                      {showSessionHeader && (
                        <div className="text-[10px] text-fg-faint uppercase font-bold tracking-wider mt-2 mb-1 pl-1 inline-flex items-center gap-1">
                          <MessageCircle className="w-3 h-3" />
                          Sesión conversación
                        </div>
                      )}
                      <div
                        className="bg-surface hover:bg-surface-muted border border-line rounded-md p-3 flex items-start gap-3 transition-colors duration-base cursor-pointer group"
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
                          <LangIcon lang={item.detected_language} className={`w-4 h-4 ${item.detected_language === "es" ? "text-es-500" : "text-ja-500"}`} />
                          <span className="text-[10px] text-fg-faint">↓</span>
                          <LangIcon lang={targetLang} className={`w-4 h-4 ${isJa ? "text-ja-500" : "text-es-500"}`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-fg-muted text-xs font-medium truncate">{item.original_text}</p>
                          <p className={`text-xs font-semibold truncate mt-0.5 ${isJa ? "text-ja-700" : "text-es-700"}`}>{item.translation}</p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            aria-label="Reproducir traducción"
                            onClick={() => speak(item.translation, targetLang, `hist-${item.id}`)}
                            className={`w-7 h-7 rounded-md flex items-center justify-center text-xs transition-colors duration-base ${
                              isItemSpeaking ? "bg-fg text-bg shadow-sm" : "bg-surface-muted text-fg-muted hover:text-fg"
                            }`}
                          >
                            {isItemSpeaking ? (
                              <Volume2 className="w-3.5 h-3.5 icon-speaking" />
                            ) : (
                              <Volume1 className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            aria-label="Copiar traducción"
                            onClick={() => copyToClipboard(item.translation, `hist-${item.id}`)}
                            className="w-7 h-7 rounded-md bg-surface-muted text-fg-muted hover:text-fg flex items-center justify-center transition-colors duration-base"
                          >
                            {isItemCopied ? <Check className="w-3.5 h-3.5 icon-pop" /> : <Copy className="w-3.5 h-3.5" />}
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
          <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-es-500 to-ja-600 flex items-center justify-center mb-3 shadow-md">
            <Mic className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-fg font-bold text-base mb-1">Traductor Instantáneo Español ↔ Japonés</h2>
          <p className="text-fg-faint text-[11px] font-medium tracking-wide mb-2">{APP_TAGLINE}</p>
          <p className="text-fg-muted text-xs leading-relaxed max-w-xs mb-5">
            Presiona el micrófono y habla naturalmente. Gemini AI detectará tu idioma y lo traducirá con voz automáticamente.
          </p>
          <div className="w-full max-w-sm">
            <p className="text-fg-faint text-[11px] font-semibold uppercase tracking-wider mb-2">Frases sugeridas</p>
            <div className="grid grid-cols-1 gap-2">
              {SAMPLE_PHRASES.map((phrase, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    primeAudioContext();
                    setDirection(phrase.dir);
                    speak(phrase.text, phrase.lang, `sample-${idx}`);
                  }}
                  className="bg-surface hover:bg-surface-muted border border-line rounded-md px-3 py-2 text-left text-xs text-fg-muted hover:text-fg transition-colors duration-base flex items-center justify-between group"
                >
                  <span className="flex items-center gap-2 truncate mr-2">
                    <LangIcon lang={phrase.lang} className={`w-3.5 h-3.5 shrink-0 ${phrase.lang === "es" ? "text-es-500" : "text-ja-500"}`} />
                    <span className="truncate">{phrase.text}</span>
                  </span>
                  <span className={`text-[10px] font-medium shrink-0 group-hover:underline inline-flex items-center gap-1 ${phrase.lang === "es" ? "text-es-600" : "text-ja-600"}`}>
                    <Volume2 className="w-3 h-3" />
                    Escuchar
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {mode === "single" && (
        <footer className="mt-auto px-5 pt-4 text-center">
          <p className="text-fg-faint text-[11px] leading-relaxed inline-flex flex-wrap items-center justify-center gap-1">
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            Para modo pantalla completa en iPhone: pulsa{" "}
            <strong className="text-fg-muted font-semibold">Compartir</strong>
            <ArrowRight className="w-3 h-3 shrink-0" />
            <strong className="text-fg-muted font-semibold">Añadir a inicio</strong>
          </p>
        </footer>
      )}

      <SettingsSheet open={showSettings} onClose={() => setShowSettings(false)} />
    </main>
    <EmergencySheet open={showEmergency} onClose={() => setShowEmergency(false)} />
    </>
  );
}
