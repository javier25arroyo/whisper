"use client";

import { useEffect, useState } from "react";
import {
  EMERGENCY_CONTEXT,
  EMERGENCY_NUMBERS,
  EMERGENCY_PHRASES,
  type EmergencyPhrase,
} from "#lib/emergencyPhrases";
import { useWakeLock } from "#lib/useWakeLock";

type View = "list" | "big";

/** Reproduce en ja-JP igual que page.tsx (mismo rate y selección de voz), pero
 * sin depender del resto del estado de la app: este sheet debe funcionar aunque
 * la conversación y el modo single ya se hayan suspendido al abrirlo. */
function speakJapanese(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = 0.92;
  const voices = window.speechSynthesis.getVoices();
  const jaVoice = voices.find((v) => v.lang.toLowerCase().startsWith("ja"));
  if (jaVoice) utterance.voice = jaVoice;
  window.speechSynthesis.speak(utterance);
}

export default function EmergencySheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>("list");
  const [selected, setSelected] = useState<EmergencyPhrase | null>(null);
  const [speaking, setSpeaking] = useState(false);

  // Reiniciar a la lista y leer el contexto cada vez que se abre.
  useEffect(() => {
    if (!open) return;
    setView("list");
    setSelected(null);
    speakJapanese(EMERGENCY_CONTEXT.ja);
    setSpeaking(true);
    const check = setInterval(() => {
      if (typeof window !== "undefined" && !window.speechSynthesis.speaking) {
        setSpeaking(false);
        clearInterval(check);
      }
    }, 200);
    return () => clearInterval(check);
  }, [open]);

  // Mantener la pantalla encendida mientras se enseña el japonés en grande.
  useWakeLock(open && view === "big");

  if (!open) return null;

  const speak = (phrase: EmergencyPhrase) => {
    speakJapanese(phrase.ja);
    setSpeaking(true);
    setTimeout(() => setSpeaking(false), Math.max(1200, phrase.ja.length * 150));
  };

  const stopVoice = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  };

  const openPhrase = (phrase: EmergencyPhrase) => {
    setSelected(phrase);
    setView("big");
    speak(phrase);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Emergencia"
      className="fixed inset-0 z-[60] flex flex-col bg-bg"
    >
      {view === "list" ? (
        <>
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-line shrink-0">
            <h2 className="text-fg font-bold text-lg">Emergencia</h2>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] px-4 rounded-lg bg-surface-muted text-fg text-sm font-semibold"
            >
              Cerrar emergencias
            </button>
          </div>

          <div className="px-5 py-3 border-b border-line shrink-0 grid grid-cols-2 gap-2">
            {EMERGENCY_NUMBERS.map((n) => (
              <div
                key={n.number}
                className="rounded-lg bg-danger-surface border border-danger/30 px-3 py-2"
              >
                <p className="text-fg font-black text-3xl leading-none">{n.number}</p>
                <p className="text-danger text-xs font-medium mt-1">{n.es}</p>
                <p className="text-danger text-xs mt-0.5">{n.ja}</p>
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
            {EMERGENCY_PHRASES.map((phrase) => (
              <button
                key={phrase.id}
                type="button"
                aria-label={phrase.name}
                onClick={() => openPhrase(phrase)}
                className="w-full min-h-[64px] text-left rounded-lg bg-surface border border-line px-4 py-3 active:bg-surface-muted"
              >
                <p className="text-fg font-bold text-base">{phrase.name}</p>
                <p className="text-fg-muted text-xs mt-0.5">{phrase.es}</p>
                <p className="text-fg-faint text-xs mt-0.5" aria-hidden="true">
                  {phrase.ja}
                </p>
              </button>
            ))}
          </div>

          <div className="shrink-0 border-t border-line px-5 py-3 flex items-center gap-3">
            <button
              type="button"
              onClick={stopVoice}
              className="min-h-[48px] px-4 rounded-lg bg-danger text-white text-sm font-semibold"
            >
              Detener voz
            </button>
            <p role="status" aria-live="polite" className="text-fg-muted text-xs">
              {speaking ? "Reproduciendo…" : ""}
            </p>
          </div>
        </>
      ) : (
        selected && (
          <div className="flex flex-col h-full bg-white">
            <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-6 py-8 text-center">
              <p className="text-stone-500 text-sm font-medium mb-4">{selected.es}</p>
              <p
                className="text-stone-950 font-bold leading-snug"
                style={{ fontSize: "clamp(2.2rem, 8vw, 3rem)" }}
              >
                {selected.ja}
              </p>
            </div>
            <div className="shrink-0 border-t border-stone-200 px-5 py-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => speak(selected)}
                className="min-h-[48px] flex-1 rounded-lg bg-stone-800 text-white text-sm font-semibold"
              >
                Repetir
              </button>
              <button
                type="button"
                onClick={stopVoice}
                className="min-h-[48px] flex-1 rounded-lg bg-danger text-white text-sm font-semibold"
              >
                Detener voz
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                className="min-h-[48px] flex-1 rounded-lg bg-stone-200 text-stone-900 text-sm font-semibold"
              >
                Volver
              </button>
            </div>
            <p role="status" aria-live="polite" className="sr-only">
              {speaking ? "Reproduciendo…" : ""}
            </p>
          </div>
        )
      )}
    </div>
  );
}
