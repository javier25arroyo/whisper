"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ConversationState } from "#lib/conversationMachine";
import type { HistoryItemV2 } from "#lib/history";
import type { SupportedLanguage } from "#lib/translator";

interface ConversationViewProps {
  state: ConversationState;
  onLongPressOrb: (side: SupportedLanguage) => void;
  onDoubleTapOrb: (side: SupportedLanguage) => void;
  onOpenMic: (side: SupportedLanguage) => void;
  onExit: () => void;
  onPlayLastTranslation: () => void;
  history: HistoryItemV2[];
  turnDurationSeconds: number;
  softLimitSeconds: number;
  estimatedProcessingMs: number;
  showOnboarding: boolean;
  onDismissOnboarding: () => void;
}

interface SideMeta {
  flag: string;
  name: string;
  role: string;
  gradient: string;
  ring: string;
  bg: string;
  bgFaded: string;
}

const SIDE_META: Record<SupportedLanguage, SideMeta> = {
  es: {
    flag: "🇲🇽",
    name: "Español",
    role: "Tú",
    gradient: "from-emerald-500 to-teal-500",
    ring: "ring-emerald-400",
    bg: "bg-emerald-500",
    bgFaded: "bg-emerald-500/20",
  },
  ja: {
    flag: "🇯🇵",
    name: "日本語",
    role: "Otro",
    gradient: "from-violet-600 to-indigo-500",
    ring: "ring-violet-400",
    bg: "bg-violet-500",
    bgFaded: "bg-violet-500/20",
  },
};

function opposite(side: SupportedLanguage): SupportedLanguage {
  return side === "es" ? "ja" : "es";
}

function orbStateLabel(value: ConversationState["es" | "ja"]): string {
  if (value === "listening") return "Escuchando…";
  if (value === "speaking") return "Reproduciendo…";
  if (value === "processing") return "Analizando…";
  return "En espera";
}

function ProcessingDots() {
  return (
    <span className="inline-flex items-center gap-1 ml-1" aria-hidden="true">
      <span className="w-1 h-1 rounded-full bg-current animate-pulse" style={{ animationDelay: "0ms" }} />
      <span className="w-1 h-1 rounded-full bg-current animate-pulse" style={{ animationDelay: "150ms" }} />
      <span className="w-1 h-1 rounded-full bg-current animate-pulse" style={{ animationDelay: "300ms" }} />
    </span>
  );
}

function OrbContextMenu({
  side,
  onClose,
  onCancel,
  onInvert,
  position,
}: {
  side: SupportedLanguage;
  onClose: () => void;
  onCancel: () => void;
  onInvert: () => void;
  position: "below-es" | "below-ja";
}) {
  const meta = SIDE_META[side];
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={`absolute z-20 ${position === "below-es" ? "top-3" : "bottom-3"} left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/60 p-2 flex flex-col gap-1 min-w-[10rem] animate-in fade-in slide-in-from-top-2 duration-150`}
      onClick={(e) => e.stopPropagation()}
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onCancel();
          onClose();
        }}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-red-300 hover:bg-red-950/60 hover:text-red-200 transition-colors"
      >
        <span aria-hidden="true">⏹</span>
        <span>Cancelar este turno</span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onInvert();
          onClose();
        }}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${meta.bgFaded} text-white hover:bg-slate-800 transition-colors`}
      >
        <span aria-hidden="true">🔁</span>
        <span>Pasar al otro lado</span>
      </button>
    </div>
  );
}

function Orb({
  side,
  stateValue,
  turnDurationSeconds,
  softLimitSeconds,
  isNextSpeaker,
  onLongPress,
  onDoubleTap,
  onTapToStart,
  onCancelActive,
  onInvertActive,
}: {
  side: SupportedLanguage;
  stateValue: ConversationState["es" | "ja"];
  turnDurationSeconds: number;
  softLimitSeconds: number;
  isNextSpeaker: boolean;
  onLongPress: () => void;
  onDoubleTap: () => void;
  onTapToStart: () => void;
  onCancelActive: () => void;
  onInvertActive: () => void;
}) {
  const meta = SIDE_META[side];
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerDown = () => {
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      if (stateValue !== "idle") {
        setMenuOpen(true);
      } else {
        onLongPress();
      }
    }, 500);
  };

  const handlePointerUp = () => {
    if (longPressTimer.current) {
      clearLongPress();
      // Tap corto
      if (menuOpen) return;
      if (stateValue === "idle") {
        onTapToStart();
      } else {
        // Tap en orbe activo: también abre menú
        setMenuOpen(true);
      }
    }
  };

  const handlePointerLeave = () => clearLongPress();

  useEffect(
    () => () => {
      clearLongPress();
    },
    []
  );

  // Cierre de menú si el estado cambia (e.g. turno terminó)
  useEffect(() => {
    if (stateValue === "idle") setMenuOpen(false);
  }, [stateValue]);

  const isOverSoftLimit = turnDurationSeconds >= softLimitSeconds;
  const isActive = stateValue !== "idle";
  const isNext = isNextSpeaker && stateValue === "idle";

  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-3 px-5 py-3 select-none transition-opacity duration-300 ${
        isActive ? "opacity-100" : isNext ? "opacity-100" : "opacity-50"
      }`}
    >
      {menuOpen && (
        <OrbContextMenu
          side={side}
          onClose={() => setMenuOpen(false)}
          onCancel={onCancelActive}
          onInvert={onInvertActive}
          position={side === "es" ? "below-es" : "below-ja"}
        />
      )}

      <div className="text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
            {meta.role}
          </span>
        </div>
        <div className="flex items-center justify-center gap-2 mt-0.5">
          <span className="text-2xl" aria-hidden="true">
            {meta.flag}
          </span>
          <span className="text-white font-bold text-base tracking-tight">{meta.name}</span>
        </div>
        <div
          className={`text-[11px] mt-0.5 uppercase tracking-wider flex items-center justify-center gap-1 ${
            isActive
              ? stateValue === "listening"
                ? "text-emerald-400 font-semibold"
                : stateValue === "speaking"
                ? "text-violet-300 font-semibold"
                : "text-amber-400 font-semibold"
              : "text-slate-500"
          }`}
        >
          <span>{orbStateLabel(stateValue)}</span>
          {stateValue === "processing" && <ProcessingDots />}
        </div>
      </div>

      <button
        type="button"
        aria-label={`Orbe ${meta.role} (${meta.name})${
          stateValue === "idle" ? " · toca para iniciar turno" : " · toca para menú"
        }`}
        aria-pressed={isActive}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
        onDoubleClick={onDoubleTap}
        className={`relative w-32 h-32 rounded-full flex items-center justify-center text-3xl select-none touch-manipulation transition-all duration-200 ${
          stateValue === "listening"
            ? `bg-gradient-to-br ${meta.gradient} shadow-2xl scale-105 ring-4 ${meta.ring}`
            : stateValue === "speaking"
            ? `bg-gradient-to-br ${meta.gradient} shadow-2xl ring-4 ${meta.ring}`
            : stateValue === "processing"
            ? "bg-slate-800 ring-4 ring-amber-400/50"
            : isNext
            ? `bg-slate-800 ring-2 ${meta.ring} animate-pulse`
            : "bg-slate-900 ring-2 ring-slate-800"
        } ${isOverSoftLimit && stateValue === "listening" ? "animate-pulse" : ""}`}
      >
        {stateValue === "listening" && (
          <>
            <span
              className={`absolute w-32 h-32 rounded-full ${meta.bgFaded} recording-ring pointer-events-none`}
            />
            <span
              className={`absolute w-32 h-32 rounded-full ${meta.bg} opacity-10 recording-ring-2 pointer-events-none`}
            />
          </>
        )}
        {stateValue === "speaking" && (
          <>
            <span
              className={`absolute w-32 h-32 rounded-full ${meta.bgFaded} recording-ring pointer-events-none`}
            />
            <span
              className={`absolute w-32 h-32 rounded-full ${meta.bg} opacity-10 recording-ring-2 pointer-events-none`}
            />
          </>
        )}
        {stateValue === "processing" ? (
          <div className="w-8 h-8 border-[3px] border-white border-t-transparent rounded-full animate-spin" />
        ) : stateValue === "idle" ? (
          isNext ? (
            <span className="text-2xl" aria-hidden="true">
              {meta.flag}
            </span>
          ) : (
            <span aria-hidden="true">🎙️</span>
          )
        ) : (
          <span aria-hidden="true">🔊</span>
        )}
      </button>

      <p
        className={`text-[10px] text-center leading-tight max-w-[14rem] ${
          isActive ? "text-slate-300" : "text-slate-500"
        }`}
      >
        {stateValue === "listening" &&
          (isOverSoftLimit
            ? `Llevas ${turnDurationSeconds}s · cierra pronto`
            : `Escuchando · cierra al detectar silencio`)}
        {stateValue === "speaking" && "Reproduciendo traducción…"}
        {stateValue === "processing" && "Enviando audio a Gemini…"}
        {stateValue === "idle" &&
          (isNext
            ? "Toca para hablar ahora · long-press para invertir"
            : "Esperando · long-press el orbe activo para invertir")}
      </p>
    </div>
  );
}

function OnboardingToast({
  side,
  onDismiss,
}: {
  side: SupportedLanguage;
  onDismiss: () => void;
}) {
  const meta = SIDE_META[side];
  const otherMeta = SIDE_META[opposite(side)];

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-5 mb-3 bg-violet-950/80 border border-violet-700/40 rounded-2xl p-3 shadow-lg flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-200"
    >
      <span className="text-2xl shrink-0" aria-hidden="true">
        🗣️
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-bold leading-snug">
          Habla ahora en {meta.name}
        </p>
        <p className="text-violet-200 text-[11px] leading-snug mt-0.5">
          {meta.flag} Te escucho. {otherMeta.flag} {otherMeta.role} habla cuando aparezca el orbe{" "}
          {otherMeta.name}.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar ayuda"
        className="text-violet-300 hover:text-white text-xs px-2 py-1 rounded-lg bg-violet-900/40"
      >
        ✕
      </button>
    </div>
  );
}

function LastTranslation({
  text,
  detected,
  onPlay,
}: {
  text: string;
  detected: SupportedLanguage | null;
  onPlay: () => void;
}) {
  if (!text) return null;
  const targetLang = detected ? opposite(detected) : "es";
  const meta = SIDE_META[targetLang];

  return (
    <div className="mx-5 mb-4 bg-slate-900/90 border border-violet-700/40 rounded-2xl p-3 shadow-lg animate-in fade-in duration-200">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-violet-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
          <span>{meta.flag}</span>
          <span>Última traducción → {meta.role}</span>
        </span>
        <button
          type="button"
          aria-label="Reproducir última traducción"
          onClick={onPlay}
          className="w-7 h-7 rounded-lg bg-violet-900/60 hover:bg-violet-800 text-violet-200 hover:text-white flex items-center justify-center text-xs transition-colors"
        >
          🔊
        </button>
      </div>
      <p className="text-white text-sm leading-relaxed break-words font-semibold">{text}</p>
    </div>
  );
}

export default function ConversationView({
  state,
  onLongPressOrb,
  onDoubleTapOrb,
  onOpenMic,
  onExit,
  onPlayLastTranslation,
  history,
  turnDurationSeconds,
  softLimitSeconds,
  estimatedProcessingMs,
  showOnboarding,
  onDismissOnboarding,
}: ConversationViewProps) {
  const sessionTurnCount = useMemo(
    () => history.filter((h) => h.session_id === state.sessionId).length,
    [history, state.sessionId]
  );

  // ETA: mostramos cuenta atrás en procesando
  const [elapsedProcessingMs, setElapsedProcessingMs] = useState(0);
  useEffect(() => {
    if (state.activeSide === null) {
      setElapsedProcessingMs(0);
      return;
    }
    if (state.es === "processing" || state.ja === "processing") {
      const startedAt = performance.now();
      const tick = () => {
        setElapsedProcessingMs(performance.now() - startedAt);
        if (state.es === "processing" || state.ja === "processing") {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    }
  }, [state.es, state.ja, state.activeSide]);

  const isProcessing = state.es === "processing" || state.ja === "processing";
  const remainingSeconds = isProcessing
    ? Math.max(0, Math.ceil((estimatedProcessingMs - elapsedProcessingMs) / 1000))
    : 0;

  // Quién es el próximo hablante
  const nextSpeaker: SupportedLanguage | null = (() => {
    if (state.activeSide === null) return null;
    if (state[state.activeSide] === "speaking") return opposite(state.activeSide);
    if (state[state.activeSide] === "processing") return opposite(state.activeSide);
    return null;
  })();

  return (
    <div className="flex flex-col flex-1" data-testid="conversation-view">
      {/* Barra superior de sesión */}
      <div className="px-5 pt-3 pb-2 flex items-center justify-between border-b border-slate-900/80">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
          </span>
          <span className="text-slate-300 text-xs font-medium">
            Sesión activa · turno {state.turnIndex + 1}
            {sessionTurnCount > 0 && ` · ${sessionTurnCount} traducidos`}
            {isProcessing && ` · ~${remainingSeconds}s`}
          </span>
        </div>
        <button
          type="button"
          onClick={onExit}
          aria-label="Salir del modo conversación"
          className="text-slate-400 hover:text-white text-xs px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 transition-colors"
        >
          ✕ Salir
        </button>
      </div>

      {/* Onboarding toast */}
      {showOnboarding && state.activeSide === "es" && state.es === "listening" && state.turnIndex === 0 && (
        <OnboardingToast side="es" onDismiss={onDismissOnboarding} />
      )}

      {/* Split vertical: ES arriba (Tú), JA abajo (Otro) */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center border-b border-slate-900/60">
          <Orb
            side="es"
            stateValue={state.es}
            turnDurationSeconds={turnDurationSeconds}
            softLimitSeconds={softLimitSeconds}
            isNextSpeaker={nextSpeaker === "es"}
            onLongPress={() => onLongPressOrb("es")}
            onDoubleTap={() => onDoubleTapOrb("es")}
            onTapToStart={() => onOpenMic("es")}
            onCancelActive={() => onLongPressOrb("es")}
            onInvertActive={() => onDoubleTapOrb("es")}
          />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Orb
            side="ja"
            stateValue={state.ja}
            turnDurationSeconds={turnDurationSeconds}
            softLimitSeconds={softLimitSeconds}
            isNextSpeaker={nextSpeaker === "ja"}
            onLongPress={() => onLongPressOrb("ja")}
            onDoubleTap={() => onDoubleTapOrb("ja")}
            onTapToStart={() => onOpenMic("ja")}
            onCancelActive={() => onLongPressOrb("ja")}
            onInvertActive={() => onDoubleTapOrb("ja")}
          />
        </div>
      </div>

      {/* Última traducción */}
      <LastTranslation
        text={state.lastTranslation}
        detected={state.lastDetectedLanguage}
        onPlay={onPlayLastTranslation}
      />

      {state.error && (
        <div className="mx-5 mb-4 bg-red-950/70 border border-red-800/60 rounded-2xl p-3 flex items-start gap-2 shadow-lg">
          <span className="text-base">⚠️</span>
          <p className="text-red-200 text-xs leading-relaxed flex-1">{state.error}</p>
        </div>
      )}
    </div>
  );
}