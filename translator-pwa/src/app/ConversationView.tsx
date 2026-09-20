"use client";

import { useEffect, useMemo, useState } from "react";
import type { ConversationState } from "#lib/conversationMachine";
import type { HistoryItemV2 } from "#lib/history";
import type { SupportedLanguage } from "#lib/translator";
import { getOrbAccessibleLabel } from "#lib/orbLabel";
import { SIDE_FLAVOR } from "#lib/uiCopy";
import { SunWarmIcon, SunDawnIcon } from "../components/icons";
import { Square, Mic, Volume2, X, AlertTriangle } from "lucide-react";

interface ConversationViewProps {
  state: ConversationState;
  onOpenMic: (side: SupportedLanguage) => void;
  onStopTurn: (side: SupportedLanguage) => void;
  /** Cancela el turno activo (descarta audio, aborta petición y voz). */
  onCancelTurn: () => void;
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
  name: string;
  role: string;
  accent: "es" | "ja";
}

const SIDE_META: Record<SupportedLanguage, SideMeta> = {
  es: { name: "Español", role: "Tú", accent: "es" },
  ja: { name: "日本語", role: "Otro", accent: "ja" },
};

const ACCENT_CLASSES: Record<
  "es" | "ja",
  { gradient: string; ring: string; bg: string; bgFaded: string; text: string; surface: string; border: string }
> = {
  es: {
    gradient: "from-es-500 to-es-700",
    ring: "ring-es-500",
    bg: "bg-es-500",
    bgFaded: "bg-es-500/20",
    text: "text-es-700",
    surface: "bg-es-surface",
    border: "border-es-500/30",
  },
  ja: {
    gradient: "from-ja-500 to-ja-700",
    ring: "ring-ja-500",
    bg: "bg-ja-500",
    bgFaded: "bg-ja-500/20",
    text: "text-ja-700",
    surface: "bg-ja-surface",
    border: "border-ja-500/30",
  },
};

function SideIcon({ side, className }: { side: SupportedLanguage; className?: string }) {
  return side === "es" ? <SunWarmIcon className={className} /> : <SunDawnIcon className={className} />;
}

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

function Orb({
  side,
  stateValue,
  turnDurationSeconds,
  softLimitSeconds,
  isNextSpeaker,
  activeSide,
  onTapToStart,
  onStopTurn,
}: {
  side: SupportedLanguage;
  stateValue: ConversationState["es" | "ja"];
  turnDurationSeconds: number;
  softLimitSeconds: number;
  isNextSpeaker: boolean;
  activeSide: SupportedLanguage | null;
  onTapToStart: () => void;
  onStopTurn: () => void;
}) {
  const meta = SIDE_META[side];
  const accent = ACCENT_CLASSES[meta.accent];

  // Todo es un toque (y "toca <nombre>" de Control por voz también lo es): sin
  // pulsaciones largas ni dobles toques. Cancelar es el botón "Cancelar turno".
  const handleClick = () => {
    if (stateValue === "idle") onTapToStart();
    else if (stateValue === "listening") onStopTurn();
  };

  const isOverSoftLimit = turnDurationSeconds >= softLimitSeconds;
  const isActive = stateValue !== "idle";
  const isNext = isNextSpeaker && stateValue === "idle";

  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-3 px-5 py-3 select-none transition-opacity duration-slow ${
        isActive ? "opacity-100" : isNext ? "opacity-100" : "opacity-50"
      }`}
    >
      <div className="text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="text-[10px] text-fg-faint uppercase font-bold tracking-wider">
            {meta.role}
          </span>
        </div>
        <div className="flex items-center justify-center gap-2 mt-0.5">
          <SideIcon side={side} className={`w-5 h-5 ${accent.text}`} />
          <span className="text-fg font-bold text-base tracking-tight">{meta.name}</span>
        </div>
        <p className={`text-[11px] mt-0.5 leading-snug ${accent.text} opacity-80`}>{SIDE_FLAVOR[side]}</p>
        <div
          className={`text-[11px] mt-1 uppercase tracking-wider flex items-center justify-center gap-1 ${
            isActive
              ? stateValue === "listening"
                ? "text-success font-semibold"
                : stateValue === "speaking"
                ? `${accent.text} font-semibold`
                : "text-amber-500 font-semibold"
              : "text-fg-faint"
          }`}
        >
          <span>{orbStateLabel(stateValue)}</span>
          {stateValue === "processing" && <ProcessingDots />}
        </div>
      </div>

      <button
        type="button"
        aria-label={getOrbAccessibleLabel({ side, stateValue, activeSide })}
        aria-pressed={isActive}
        aria-disabled={stateValue === "processing" || stateValue === "speaking"}
        onClick={handleClick}
        className={`relative w-32 h-32 rounded-full flex items-center justify-center text-3xl select-none touch-manipulation transition-all duration-base ease-out ${
          stateValue === "listening"
            ? `bg-gradient-to-br ${accent.gradient} shadow-lg scale-105 ring-4 ${accent.ring}`
            : stateValue === "speaking"
            ? `bg-gradient-to-br ${accent.gradient} shadow-lg ring-4 ${accent.ring}`
            : stateValue === "processing"
            ? "bg-surface-muted ring-4 ring-amber-400/50"
            : isNext
            ? `bg-surface-muted ring-2 ${accent.ring} animate-pulse`
            : "bg-surface ring-2 ring-line"
        } ${isOverSoftLimit && stateValue === "listening" ? "animate-pulse" : ""}`}
      >
        {stateValue === "listening" && (
          <>
            <span className={`absolute w-32 h-32 rounded-full ${accent.bgFaded} recording-ring pointer-events-none`} />
            <span className={`absolute w-32 h-32 rounded-full ${accent.bg} opacity-10 recording-ring-2 pointer-events-none`} />
          </>
        )}
        {stateValue === "speaking" && (
          <>
            <span className={`absolute w-32 h-32 rounded-full ${accent.bgFaded} recording-ring pointer-events-none`} />
            <span className={`absolute w-32 h-32 rounded-full ${accent.bg} opacity-10 recording-ring-2 pointer-events-none`} />
          </>
        )}
        {stateValue === "processing" ? (
          <div className="w-8 h-8 border-[3px] border-white border-t-transparent rounded-full animate-spin" />
        ) : stateValue === "idle" ? (
          isNext ? (
            <SideIcon side={side} className="w-8 h-8 text-white icon-swap" />
          ) : (
            <Mic className="w-8 h-8 text-fg-faint icon-swap" />
          )
        ) : stateValue === "speaking" ? (
          <Volume2 className="w-8 h-8 text-white icon-speaking" />
        ) : (
          <Mic className="w-8 h-8 text-white icon-swap" />
        )}
      </button>

      <p
        className={`text-[10px] text-center leading-tight max-w-[14rem] ${
          isActive ? "text-fg-muted" : "text-fg-faint"
        }`}
      >
        {stateValue === "listening" &&
          (isOverSoftLimit
            ? `Llevas ${turnDurationSeconds}s · cierra pronto`
            : `Escuchando · cierra al detectar silencio`)}
        {stateValue === "speaking" && "Reproduciendo traducción…"}
        {stateValue === "processing" && "Enviando audio a Gemini…"}
        {stateValue === "idle" && (activeSide === null ? "Toca para hablar" : "Esperando")}
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
  const accent = ACCENT_CLASSES[meta.accent];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mx-5 mb-3 ${accent.surface} border ${accent.border} rounded-lg p-3 shadow-md flex items-start gap-3 panel-in`}
    >
      <SideIcon side={side} className={`w-6 h-6 shrink-0 mt-0.5 ${accent.text}`} />
      <div className="flex-1 min-w-0">
        <p className="text-fg text-sm font-bold leading-snug">
          Habla ahora en {meta.name}
        </p>
        <p className={`text-[11px] leading-snug mt-0.5 ${accent.text} opacity-90`}>{SIDE_FLAVOR[side]}</p>
        <p className="text-fg-muted text-[11px] leading-snug mt-1">
          Te escucho. {otherMeta.role} habla cuando aparezca el orbe {otherMeta.name}.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar ayuda"
        className="text-fg-muted hover:text-fg p-1 rounded-md bg-surface-muted"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function LastTranslation({
  text,
  detected,
  onPlay,
  disabled,
}: {
  text: string;
  detected: SupportedLanguage | null;
  onPlay: () => void;
  disabled: boolean;
}) {
  if (!text) return null;
  const targetLang = detected ? opposite(detected) : "es";
  const meta = SIDE_META[targetLang];
  const accent = ACCENT_CLASSES[meta.accent];

  return (
    <div className={`mx-5 mb-4 bg-surface border ${accent.border} rounded-lg p-3 shadow-md fade-in-simple`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${accent.text}`}>
          <SideIcon side={targetLang} className="w-3.5 h-3.5" />
          <span>Última traducción → {meta.role}</span>
        </span>
        <button
          type="button"
          aria-label="Reproducir última traducción"
          onClick={onPlay}
          disabled={disabled}
          className={`w-7 h-7 rounded-md ${accent.bgFaded} hover:opacity-80 ${accent.text} flex items-center justify-center transition-colors duration-base disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <Volume2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-fg text-sm leading-relaxed break-words font-semibold">{text}</p>
    </div>
  );
}

export default function ConversationView({
  state,
  onOpenMic,
  onStopTurn,
  onCancelTurn,
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
      <div className="px-5 pt-3 pb-2 flex items-center justify-between border-b border-line">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-fg opacity-40 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-fg" />
          </span>
          <span className="text-fg-muted text-xs font-medium">
            Sesión activa · turno {state.turnIndex + 1}
            {sessionTurnCount > 0 && ` · ${sessionTurnCount} traducidos`}
            {isProcessing && ` · ~${remainingSeconds}s`}
          </span>
        </div>
        <button
          type="button"
          onClick={onExit}
          aria-label="Salir"
          className="text-fg-muted hover:text-fg text-xs px-3 py-1.5 rounded-md bg-surface border border-line transition-colors duration-base inline-flex items-center gap-1"
        >
          <X className="w-3.5 h-3.5" />
          Salir
        </button>
      </div>

      {/* Onboarding toast */}
      {showOnboarding && state.activeSide === "es" && state.es === "listening" && state.turnIndex === 0 && (
        <OnboardingToast side="es" onDismiss={onDismissOnboarding} />
      )}

      {/* Split vertical: ES arriba (Tú), JA abajo (Otro) */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center border-b border-line">
          <Orb
            side="es"
            stateValue={state.es}
            turnDurationSeconds={turnDurationSeconds}
            softLimitSeconds={softLimitSeconds}
            isNextSpeaker={nextSpeaker === "es"}
            activeSide={state.activeSide}
            onTapToStart={() => onOpenMic("es")}
            onStopTurn={() => onStopTurn("es")}
          />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Orb
            side="ja"
            stateValue={state.ja}
            turnDurationSeconds={turnDurationSeconds}
            softLimitSeconds={softLimitSeconds}
            isNextSpeaker={nextSpeaker === "ja"}
            activeSide={state.activeSide}
            onTapToStart={() => onOpenMic("ja")}
            onStopTurn={() => onStopTurn("ja")}
          />
        </div>
      </div>

      {/* Cancelar: visible mientras haya un lado activo. Un solo botón grande con un
          nombre que se puede decir ("Cancelar turno"); sustituye al gesto de
          pulsación larga y al menú contextual. */}
      {state.activeSide !== null && (
        <div className="mx-5 mb-3">
          <button
            type="button"
            onClick={onCancelTurn}
            className="w-full min-h-[56px] rounded-lg border border-danger/40 bg-danger-surface text-danger text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors duration-base"
          >
            <Square className="w-4 h-4" fill="currentColor" />
            Cancelar turno
          </button>
        </div>
      )}

      {/* Última traducción */}
      <LastTranslation
        text={state.lastTranslation}
        detected={state.lastDetectedLanguage}
        onPlay={onPlayLastTranslation}
        disabled={
          state.es === "listening" ||
          state.es === "processing" ||
          state.es === "speaking" ||
          state.ja === "listening" ||
          state.ja === "processing" ||
          state.ja === "speaking"
        }
      />

      {state.error && (
        <div className="mx-5 mb-4 bg-danger-surface border border-danger/30 rounded-lg p-3 flex items-start gap-2 shadow-md">
          <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
          <p className="text-danger text-xs leading-relaxed flex-1">{state.error}</p>
        </div>
      )}
    </div>
  );
}
