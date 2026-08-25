"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type Direction = "auto" | "es-ja" | "ja-es";

interface TranslationResult {
  detected_language: "es" | "ja";
  original_text: string;
  translation: string;
}

interface HistoryItem extends TranslationResult {
  id: string;
  timestamp: number;
  direction: Direction;
}

const LANG_CONFIG: Record<"es" | "ja", { flag: string; name: string; ttsCode: string; label: string }> = {
  es: { flag: "🇲🇽", name: "Español", ttsCode: "es-MX", label: "Español (México)" },
  ja: { flag: "🇯🇵", name: "日本語", ttsCode: "ja-JP", label: "Japonés" },
};

const DIRECTION_OPTIONS: { value: Direction; label: string; subLabel: string }[] = [
  { value: "auto", label: "🤖 Auto", subLabel: "Detección automática" },
  { value: "es-ja", label: "🇲🇽 → 🇯🇵", subLabel: "Español a Japonés" },
  { value: "ja-es", label: "🇯🇵 → 🇲🇽", subLabel: "Japonés a Español" },
];

const SAMPLE_PHRASES = [
  { text: "Hola, ¿cómo estás? Mucho gusto.", lang: "es" as const, dir: "es-ja" as Direction },
  { text: "¿Dónde está la estación de tren más cercana?", lang: "es" as const, dir: "es-ja" as Direction },
  { text: "こんにちは、はじめまして。", lang: "ja" as const, dir: "ja-es" as Direction },
  { text: "すみません、これはいくらですか？", lang: "ja" as const, dir: "ja-es" as Direction },
];

export default function Home() {
  const [direction, setDirection] = useState<Direction>("auto");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cargar preferencias e historial desde localStorage al montar
  useEffect(() => {
    try {
      const savedAutoSpeak = localStorage.getItem("whisper_pwa_autospeak");
      if (savedAutoSpeak !== null) {
        setAutoSpeak(savedAutoSpeak === "true");
      }
      const savedHistory = localStorage.getItem("whisper_pwa_history");
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed)) {
          setHistory(parsed.slice(0, 10));
        }
      }
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
    try {
      if (history.length > 0) {
        localStorage.setItem("whisper_pwa_history", JSON.stringify(history));
      }
    } catch {
      // No-op
    }
  }, [history]);

  // Limpiar timer y grabador al desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Desbloquear audio en iOS Safari (SpeechSynthesis requiere gesto del usuario previo)
  const primeAudioContext = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      // Breve utterance mudo para desbloquear el motor TTS en Safari móvil
      try {
        const dummy = new SpeechSynthesisUtterance("");
        dummy.volume = 0;
        window.speechSynthesis.speak(dummy);
      } catch {
        // No-op
      }
    }
  }, []);

  // Función para reproducir síntesis de voz (TTS)
  const speak = useCallback(
    (text: string, lang: "es" | "ja", keyId?: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        return;
      }

      window.speechSynthesis.cancel();

      const config = LANG_CONFIG[lang] || LANG_CONFIG.ja;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = config.ttsCode;
      utterance.rate = lang === "ja" ? 0.92 : 0.98;
      utterance.pitch = 1.0;

      // Buscar voz óptima si el navegador la tiene disponible
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const langPrefix = lang === "ja" ? "ja" : "es";
        const matchedVoice = voices.find(
          (v) => v.lang.toLowerCase().startsWith(langPrefix) && !v.name.includes("Google")
        ) || voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix));
        if (matchedVoice) {
          utterance.voice = matchedVoice;
        }
      }

      if (keyId) {
        setSpeakingKey(keyId);
      }

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
      // Fallback para navegadores antiguos
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

  // Enviar audio grabado al backend /api/translate
  const processAudio = useCallback(
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

        // Agregar al historial de la sesión
        const newHistoryItem: HistoryItem = {
          ...newResult,
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp: Date.now(),
          direction,
        };

        setHistory((prev) => [newHistoryItem, ...prev.filter((i) => i.original_text !== newResult.original_text)].slice(0, 10));

        // Auto-reproducir traducción por voz si está activado
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

  // Iniciar grabación de audio con soporte para iOS Safari
  const startRecording = useCallback(async () => {
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
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      audioStreamRef.current = stream;

      // Detección de formato MIME compatible con iOS Safari y Chromium
      let chosenMimeType = "";
      const preferredTypes = [
        "audio/mp4",
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/aac",
        "audio/ogg",
      ];

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
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Liberar hardware de micrófono inmediatamente
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach((track) => track.stop());
          audioStreamRef.current = null;
        }

        if (chunksRef.current.length > 0) {
          const finalMimeType = chosenMimeType || "audio/mp4";
          const audioBlob = new Blob(chunksRef.current, { type: finalMimeType });
          if (audioBlob.size > 0) {
            processAudio(audioBlob, finalMimeType);
          } else {
            setError("No se detectó audio grabado. Intenta hablar nuevamente.");
          }
        }
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingSeconds(0);

      // Contador de segundos con límite de 30 segundos
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 29) {
            stopRecording();
            return 30;
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
  }, [primeAudioContext, processAudio]);

  // Detener grabación de audio
  const stopRecording = useCallback(() => {
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

  const handleRecordToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleClearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem("whisper_pwa_history");
    } catch {
      // No-op
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col max-w-lg mx-auto pb-6">
      {/* Header */}
      <header className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-slate-900/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center text-xl shadow-lg shadow-violet-950/60 ring-1 ring-white/10">
            🎙️
          </div>
          <div>
            <h1 className="text-white font-bold text-lg tracking-tight leading-tight">
              Traductor de Voz
            </h1>
            <p className="text-slate-400 text-xs font-medium">
              Español ↔ 日本語 · Gemini AI
            </p>
          </div>
        </div>

        {/* Toggle Auto-speak */}
        <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-full px-2.5 py-1 shadow-sm">
          <span className="text-xs text-slate-300 font-medium flex items-center gap-1">
            <span className="text-xs">{autoSpeak ? "🔊" : "🔇"}</span>
            <span className="text-[11px] font-semibold text-slate-300">Auto-voz</span>
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
      </header>

      {/* Selector de Dirección */}
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

      {/* Zona Central de Grabación */}
      <section className="flex flex-col items-center justify-center py-6 px-5" aria-label="Control de grabación">
        <div className="relative flex items-center justify-center mb-5">
          {/* Anillos de pulsación visual */}
          {isRecording && (
            <>
              <span className="absolute w-36 h-36 rounded-full bg-red-500/25 recording-ring pointer-events-none" />
              <span className="absolute w-36 h-36 rounded-full bg-red-500/15 recording-ring-2 pointer-events-none" />
            </>
          )}

          <button
            onClick={handleRecordToggle}
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
                <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin border-[3px]" />
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

        {/* Indicador de estado */}
        <div className="text-center px-4">
          <p className="text-sm font-medium transition-colors">
            {isProcessing ? (
              <span className="text-violet-400 font-semibold animate-pulse">
                Gemini 2.0 está procesando tu voz...
              </span>
            ) : isRecording ? (
              <span className="text-red-400 font-semibold">
                Grabando audio ({30 - recordingSeconds}s restantes) · Toca para traducir
              </span>
            ) : (
              <span className="text-slate-400">
                Toca el micrófono, habla en Español o Japonés y suéltalo
              </span>
            )}
          </p>
        </div>
      </section>

      {/* Alerta de Error */}
      {error && (
        <div className="mx-5 mb-4 bg-red-950/70 border border-red-800/60 rounded-2xl p-4 flex items-start gap-3 shadow-lg animate-in fade-in duration-200">
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

      {/* Tarjetas de Traducción Activa */}
      {result && !isProcessing && (
        <section className="mx-5 mb-5 space-y-3" aria-label="Resultado de traducción">
          {/* Texto Original */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-md transition-all">
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
                      ? "bg-violet-600 text-white shadow-md shadow-violet-700/50 scale-105"
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

          {/* Texto Traducido */}
          {(() => {
            const targetLang = result.detected_language === "es" ? "ja" : "es";
            const targetConfig = LANG_CONFIG[targetLang];
            return (
              <div className="bg-gradient-to-br from-violet-950/90 via-indigo-950/80 to-slate-900 border border-violet-700/40 rounded-2xl p-4 shadow-xl shadow-violet-950/40 transition-all">
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
                          ? "bg-violet-500 text-white shadow-lg shadow-violet-500/50 scale-105 ring-2 ring-violet-300"
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

      {/* Historial de la Sesión */}
      {history.length > 0 && (
        <section className="mx-5 mb-5" aria-label="Historial de traducciones">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">
              Historial de sesión ({history.length})
            </span>
            <button
              onClick={handleClearHistory}
              className="text-slate-500 hover:text-slate-300 text-[11px] font-medium transition-colors"
            >
              Borrar historial
            </button>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {history.map((item) => {
              const targetLang = item.detected_language === "es" ? "ja" : "es";
              const isItemSpeaking = speakingKey === `hist-${item.id}`;
              const isItemCopied = copiedId === `hist-${item.id}`;

              return (
                <div
                  key={item.id}
                  className="bg-slate-900/70 hover:bg-slate-900 border border-slate-800/80 rounded-xl p-3 flex items-start gap-3 transition-colors cursor-pointer group"
                  onClick={() => setResult(item)}
                >
                  <div className="flex flex-col items-center gap-0.5 mt-0.5 shrink-0">
                    <span className="text-sm">{LANG_CONFIG[item.detected_language]?.flag}</span>
                    <span className="text-[10px] text-slate-500">↓</span>
                    <span className="text-sm">{LANG_CONFIG[targetLang]?.flag}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-slate-300 text-xs font-medium truncate">
                      {item.original_text}
                    </p>
                    <p className="text-violet-300 text-xs font-semibold truncate mt-0.5">
                      {item.translation}
                    </p>
                  </div>

                  <div
                    className="flex items-center gap-1 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      aria-label="Reproducir traducción"
                      onClick={() => speak(item.translation, targetLang, `hist-${item.id}`)}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-colors ${
                        isItemSpeaking
                          ? "bg-violet-600 text-white shadow-sm shadow-violet-600"
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
              );
            })}
          </div>
        </section>
      )}

      {/* Estado Vacío con Frases de Ejemplo */}
      {!result && !error && !isProcessing && history.length === 0 && (
        <section className="flex-1 flex flex-col items-center justify-center px-6 py-6 text-center">
          <div className="w-14 h-14 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-3xl mb-3 shadow-inner">
            🗾
          </div>
          <h2 className="text-white font-bold text-base mb-1">
            Traductor Instantáneo Español ↔ Japonés
          </h2>
          <p className="text-slate-400 text-xs leading-relaxed max-w-xs mb-5">
            Presiona el micrófono y habla naturalmente. Gemini AI detectará tu idioma y lo traducirá con voz automáticamente.
          </p>

          <div className="w-full max-w-sm">
            <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider mb-2">
              Frases sugeridas
            </p>
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
                  <span className="text-[10px] text-violet-400 font-medium shrink-0 group-hover:underline">
                    🔊 Escuchar
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Footer & PWA Tip */}
      <footer className="mt-auto px-5 pt-4 text-center">
        <p className="text-slate-500 text-[11px] leading-relaxed">
          📱 Para modo pantalla completa en iPhone: pulsa{" "}
          <strong className="text-slate-400 font-semibold">Compartir</strong> ➔{" "}
          <strong className="text-slate-400 font-semibold">Añadir a inicio</strong>
        </p>
        <p className="text-slate-600 text-[10px] mt-1">
          Desarrollado con Google Gemini 2.0 Flash
        </p>
      </footer>
    </main>
  );
}

