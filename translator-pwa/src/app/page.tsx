"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type Direction = "auto" | "es-ja" | "ja-es";

interface TranslationResult {
  detected_language: "es" | "ja";
  original_text: string;
  translation: string;
}

interface HistoryItem extends TranslationResult {
  id: number;
  timestamp: Date;
}

const LANG_LABELS: Record<string, { flag: string; name: string }> = {
  es: { flag: "🇲🇽", name: "Español" },
  ja: { flag: "🇯🇵", name: "日本語" },
};

const DIRECTION_OPTIONS: { value: Direction; label: string }[] = [
  { value: "auto", label: "🤖 Auto" },
  { value: "es-ja", label: "🇲🇽 → 🇯🇵" },
  { value: "ja-es", label: "🇯🇵 → 🇲🇽" },
];

export default function Home() {
  const [direction, setDirection] = useState<Direction>("auto");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [copied, setCopied] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const historyIdRef = useRef(0);

  // Limpiar timer al desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const processAudio = useCallback(
    async (blob: Blob) => {
      setIsProcessing(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append("audio", blob, "recording");
        formData.append("direction", direction);

        const res = await fetch("/api/translate", { method: "POST", body: formData });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Error al procesar el audio");
        }

        setResult(data);
        setHistory((prev) => [
          { ...data, id: ++historyIdRef.current, timestamp: new Date() },
          ...prev,
        ].slice(0, 8));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setIsProcessing(false);
      }
    },
    [direction]
  );

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setResult(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "audio/webm";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          processAudio(blob);
        }
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => {
          if (s >= 29) {
            stopRecording();
            return s;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      setError("No se pudo acceder al micrófono. Revisa los permisos en Safari.");
    }
  }, [processAudio]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordingSeconds(0);
  }, []);

  const handleRecordToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const speak = (text: string, lang: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === "ja" ? "ja-JP" : "es-MX";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <main className="min-h-screen bg-slate-950 flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <header className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-violet-600 flex items-center justify-center text-xl shadow-lg shadow-violet-900/50">
            🎙
          </div>
          <div>
            <h1 className="text-white font-bold text-xl leading-tight">
              Traductor de Voz
            </h1>
            <p className="text-slate-400 text-xs">Español ↔ 日本語 · Gemini AI</p>
          </div>
        </div>
      </header>

      {/* Direction Selector */}
      <div className="px-5 mb-5">
        <div className="flex bg-slate-900 rounded-2xl p-1 gap-1">
          {DIRECTION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDirection(opt.value)}
              className={`flex-1 py-2.5 px-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                direction === opt.value
                  ? "bg-violet-600 text-white shadow-lg shadow-violet-900/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Record Button Area */}
      <div className="flex flex-col items-center justify-center py-8 px-5">
        {/* Anillos de grabación */}
        <div className="relative flex items-center justify-center mb-6">
          {isRecording && (
            <>
              <span className="absolute w-32 h-32 rounded-full bg-red-500/20 recording-ring" />
              <span className="absolute w-32 h-32 rounded-full bg-red-500/10 recording-ring-2" />
            </>
          )}

          <button
            onClick={handleRecordToggle}
            disabled={isProcessing}
            className={`relative w-28 h-28 rounded-full flex flex-col items-center justify-center gap-1 shadow-2xl transition-all duration-200 active:scale-95 select-none touch-none ${
              isProcessing
                ? "bg-slate-700 cursor-not-allowed"
                : isRecording
                ? "bg-red-600 shadow-red-900/50 scale-110"
                : "bg-violet-600 shadow-violet-900/50 hover:bg-violet-500"
            }`}
          >
            {isProcessing ? (
              <>
                <div className="w-7 h-7 border-3 border-white border-t-transparent rounded-full animate-spin border-[3px]" />
                <span className="text-white text-xs font-medium">Procesando</span>
              </>
            ) : isRecording ? (
              <>
                <span className="text-3xl">⏹</span>
                <span className="text-white text-xs font-bold">{recordingSeconds}s</span>
              </>
            ) : (
              <>
                <span className="text-3xl">🎙</span>
                <span className="text-white text-xs font-bold">Grabar</span>
              </>
            )}
          </button>
        </div>

        <p className="text-slate-400 text-sm text-center">
          {isProcessing
            ? "Gemini está procesando tu voz..."
            : isRecording
            ? "Habla ahora · Toca para detener"
            : "Toca el botón y habla"}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mb-4 bg-red-950/60 border border-red-800/50 rounded-2xl p-4 flex gap-3 items-start">
          <span className="text-xl">⚠️</span>
          <p className="text-red-300 text-sm leading-relaxed">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && !isProcessing && (
        <div className="mx-5 mb-5 space-y-3">
          {/* Original */}
          <div className="bg-slate-900 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{LANG_LABELS[result.detected_language]?.flag}</span>
                <span className="text-slate-400 text-xs font-semibold uppercase tracking-wide">
                  {LANG_LABELS[result.detected_language]?.name} · Original
                </span>
              </div>
              <button
                onClick={() => speak(result.original_text, result.detected_language)}
                className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              >
                🔊
              </button>
            </div>
            <p className="text-white text-base leading-relaxed">{result.original_text}</p>
          </div>

          {/* Translation */}
          <div className="bg-gradient-to-br from-violet-950/80 to-indigo-950/80 border border-violet-800/30 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {LANG_LABELS[result.detected_language === "es" ? "ja" : "es"]?.flag}
                </span>
                <span className="text-violet-300 text-xs font-semibold uppercase tracking-wide">
                  {LANG_LABELS[result.detected_language === "es" ? "ja" : "es"]?.name} · Traducción
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    speak(result.translation, result.detected_language === "es" ? "ja" : "es")
                  }
                  className="w-8 h-8 rounded-xl bg-violet-900/50 flex items-center justify-center text-violet-300 hover:text-white hover:bg-violet-800 transition-colors"
                >
                  🔊
                </button>
                <button
                  onClick={() => copyToClipboard(result.translation)}
                  className="w-8 h-8 rounded-xl bg-violet-900/50 flex items-center justify-center text-violet-300 hover:text-white hover:bg-violet-800 transition-colors"
                >
                  {copied ? "✅" : "📋"}
                </button>
              </div>
            </div>
            <p className="text-white text-base leading-relaxed font-medium">{result.translation}</p>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="mx-5 mb-6">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-3">
            Historial reciente
          </p>
          <div className="space-y-2">
            {history.map((item) => (
              <div
                key={item.id}
                className="bg-slate-900/60 rounded-xl px-4 py-3 flex items-start gap-3"
                onClick={() => setResult(item)}
              >
                <div className="flex gap-1 mt-0.5 shrink-0">
                  <span className="text-xs">{LANG_LABELS[item.detected_language]?.flag}</span>
                  <span className="text-slate-600 text-xs">→</span>
                  <span className="text-xs">
                    {LANG_LABELS[item.detected_language === "es" ? "ja" : "es"]?.flag}
                  </span>
                </div>
                <div className="overflow-hidden flex-1">
                  <p className="text-slate-300 text-xs leading-snug truncate">{item.original_text}</p>
                  <p className="text-slate-500 text-xs leading-snug truncate">{item.translation}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!result && !error && !isProcessing && history.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center px-10 pb-10 text-center">
          <p className="text-4xl mb-4">🗾</p>
          <p className="text-slate-300 font-semibold mb-2">¿Listo para traducir?</p>
          <p className="text-slate-500 text-sm leading-relaxed">
            Toca el botón morado, habla en Español o Japonés, y Gemini AI hará la traducción automáticamente.
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto px-5 py-4 text-center">
        <p className="text-slate-700 text-xs">Powered by Google Gemini · Agrega esta página a tu inicio de iPhone</p>
      </div>
    </main>
  );
}
