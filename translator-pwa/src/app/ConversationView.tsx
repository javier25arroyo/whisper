"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
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
}

const SIDE_META: Record<SupportedLanguage, { flag: string; name: string; color: string; ring: string }> = {
  es: {
    flag: "🇲🇽",
    name: "Español",
    color: "from-emerald-500 to-teal-500",
    ring: "ring-emerald-400",
  },
  ja: {
    flag: "🇯🇵",
    name: "日本語",
    color: "from-violet-600 to-indigo-500",
    ring: "ring-violet-400",
  },
};

function opposite(side: SupportedLanguage): SupportedLanguage {
  return side === "es" ? "ja" : "es";
}

function Orb({
  side,
  stateValue,
  turnDurationSeconds,
  softLimitSeconds,
  onLongPress,
  onDoubleTap,
  onTapToStart,
}: {
  side: SupportedLanguage;
  stateValue: ConversationState["es" | "ja"];
  turnDurationSeconds: number;
  softLimitSeconds: number;
  onLongPress: () => void;
  onDoubleTap: () => void;
  onTapToStart: () => void;
}) {
  const meta = SIDE_META[side];
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapTs = useRef<number>(0);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      onLongPress();
    }, 600);
  };

  const handlePointerUp = () => {
    if (longPressTimer.current) {
      // Fue un tap corto, no long-press
      clearLongPress();
      const now = Date.now();
      if (now - lastTapTs.current < 300) {
        onDoubleTap();
        lastTapTs.current = 0;
        if (tapTimeoutRef.current) {
          clearTimeout(tapTimeoutRef.current);
          tapTimeoutRef.current = null;
        }
      } else {
        lastTapTs.current = now;
        tapTimeoutRef.current = setTimeout(() => {
          lastTapTs.current = 0;
          onTapToStart();
        }, 300);
      }
    }
  };

  const handlePointerLeave = () => {
    clearLongPress();
  };

  useEffect(() => () => {
    clearLongPress();
    if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
  }, []);

  const visualState = useMemo(() => {
    if (stateValue === "listening") return "listening";
    if (stateValue === "speaking") return "speaking";
    if (stateValue === "processing") return "processing";
    return "idle";
  }, [stateValue]);

  const isOverSoftLimit = turnDurationSeconds >= softLimitSeconds;

  return (
    <div className="flex flex-col items-center justify-center gap-3 px-5 py-3 select-none">
      <div className="text-center">
        <div className="text-3xl">{meta.flag}</div>
        <div className="text-white font-bold text-base tracking-tight">{meta.name}</div>
        <div className="text-[11px] text-slate-400 uppercase tracking-wider">
          {visualState === "listening" && "Escuchando…"}
          {visualState === "speaking" && "Hablando…"}
          {visualState === "processing" && "Procesando…"}
          {visualState === "idle" && "En espera"}
        </div>
      </div>

      <button
        type="button"
        aria-label={`Orbe ${meta.name}`}
        aria-pressed={visualState !== "idle"}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
        className={`relative w-32 h-32 rounded-full flex items-center justify-center text-3xl select-none touch-manipulation transition-all duration-200 ${
          visualState === "listening"
            ? `bg-gradient-to-br ${meta.color} shadow-2xl scale-105 ring-4 ${meta.ring}`
            : visualState === "speaking"
            ? `bg-gradient-to-br ${meta.color} shadow-2xl ring-4 ${meta.ring}`
            : visualState === "processing"
            ? "bg-slate-800 ring-4 ring-slate-600"
            : "bg-slate-900 ring-2 ring-slate-800 opacity-70"
        } ${isOverSoftLimit && visualState === "listening" ? "animate-pulse" : ""}`}
      >
        {visualState === "listening" && (
          <>
            <span className="absolute w-32 h-32 rounded-full bg-emerald-500/20 recording-ring pointer-events-none" />
            <span className="absolute w-32 h-32 rounded-full bg-emerald-500/10 recording-ring-2 pointer-events-none" />
          </>
        )}
        {visualState === "speaking" && (
          <>
            <span className="absolute w-32 h-32 rounded-full bg-violet-500/20 recording-ring pointer-events-none" />
            <span className="absolute w-32 h-32 rounded-full bg-violet-500/10 recording-ring-2 pointer-events-none" />
          </>
        )}
        {visualState === "processing" ? (
          <div className="w-8 h-8 border-[3px] border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <span aria-hidden="true">{visualState === "idle" ? "🎙️" : "🔊"}</span>
        )}
      </button>

      <p className="text-[10px] text-slate-500 text-center leading-tight max-w-[14rem]">
        {visualState === "listening" && (
          isOverSoftLimit
            ? `Llevas ${turnDurationSeconds}s · se cerrará pronto`
            : `Habla. Se cierra al detectar silencio (${turnDurationSeconds}s).`
        )}
        {visualState === "speaking" && "Reproduciendo traducción…"}
        {visualState === "processing" && "Enviando a Gemini…"}
        {visualState === "idle" && "Toca para forzar turno · Doble tap para invertir · Mantén para abortar"}
      </p>
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
          <span>Última traducción</span>
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
}: ConversationViewProps) {
  const sessionTurnCount = useMemo(
    () => history.filter((h) => h.session_id === state.sessionId).length,
    [history, state.sessionId]
  );

  const handleExit = useCallback(() => {
    onExit();
  }, [onExit]);

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
          </span>
        </div>
        <button
          type="button"
          onClick={handleExit}
          aria-label="Salir del modo conversación"
          className="text-slate-400 hover:text-white text-xs px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 transition-colors"
        >
          ✕ Salir
        </button>
      </div>

      {/* Split vertical: ES arriba, JA abajo */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center border-b border-slate-900/60">
          <Orb
            side="es"
            stateValue={state.es}
            turnDurationSeconds={turnDurationSeconds}
            softLimitSeconds={softLimitSeconds}
            onLongPress={() => onLongPressOrb("es")}
            onDoubleTap={() => onDoubleTapOrb("es")}
            onTapToStart={() => onOpenMic("es")}
          />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Orb
            side="ja"
            stateValue={state.ja}
            turnDurationSeconds={turnDurationSeconds}
            softLimitSeconds={softLimitSeconds}
            onLongPress={() => onLongPressOrb("ja")}
            onDoubleTap={() => onDoubleTapOrb("ja")}
            onTapToStart={() => onOpenMic("ja")}
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