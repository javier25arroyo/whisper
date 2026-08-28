import type { SupportedLanguage } from "./translator";

/**
 * Estados posibles de un lado (es|ja) en el modo conversación.
 * Cada lado tiene exactamente uno de estos en cada momento.
 */
export type SideState = "idle" | "listening" | "speaking" | "processing";

/** Estado global del modo conversación. */
export interface ConversationState {
  /** Estado del lado ES. */
  es: SideState;
  /** Estado del lado JA. */
  ja: SideState;
  /** Lado activo (null si ambos idle). Coincide con quien está listening/speaking. */
  activeSide: SupportedLanguage | null;
  /** Turno actual dentro de la sesión. Empieza en 0. */
  turnIndex: number;
  /** ID de la sesión actual. Cambia cuando se sale del modo conversación. */
  sessionId: string | null;
  /** Última transcripción original recibida. */
  lastOriginalText: string;
  /** Idioma detectado de la última transcripción. */
  lastDetectedLanguage: SupportedLanguage | null;
  /** Última traducción reproducida (lo que se dice al lado opuesto). */
  lastTranslation: string;
  /** Mensaje de error actual (null si no hay). */
  error: string | null;
}

/** Acciones que pueden disparar transiciones en la máquina. */
export type ConversationAction =
  | { type: "ENTER_CONVERSATION"; sessionId: string; startSide: SupportedLanguage }
  | { type: "EXIT_CONVERSATION" }
  | { type: "OPEN_MIC"; side: SupportedLanguage }
  | { type: "SEND_AUDIO"; side: SupportedLanguage }
  | { type: "RECEIVE_RESULT"; side: SupportedLanguage; translation: string; detected: SupportedLanguage; originalText: string }
  | { type: "START_SPEAKING"; side: SupportedLanguage }
  | { type: "FINISH_SPEAKING" }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "FORCE_TURN"; side: SupportedLanguage }
  | { type: "ABORT_ACTIVE" };

const opposite = (side: SupportedLanguage): SupportedLanguage =>
  side === "es" ? "ja" : "es";

export const initialConversationState: ConversationState = {
  es: "idle",
  ja: "idle",
  activeSide: null,
  turnIndex: 0,
  sessionId: null,
  lastOriginalText: "",
  lastDetectedLanguage: null,
  lastTranslation: "",
  error: null,
};

export function conversationReducer(
  state: ConversationState,
  action: ConversationAction
): ConversationState {
  switch (action.type) {
    case "ENTER_CONVERSATION": {
      return {
        ...state,
        sessionId: action.sessionId,
        turnIndex: 0,
        es: action.startSide === "es" ? "listening" : "idle",
        ja: action.startSide === "ja" ? "listening" : "idle",
        activeSide: action.startSide,
        error: null,
      };
    }

    case "EXIT_CONVERSATION": {
      return { ...initialConversationState };
    }

    case "OPEN_MIC": {
      if (state.sessionId === null) return state;
      if (state[action.side] !== "idle") return state;
      // Si el otro lado está activo, no abrimos (mutex implícito)
      if (state.activeSide !== null && state.activeSide !== action.side) return state;
      return {
        ...state,
        [action.side]: "listening",
        activeSide: action.side,
      };
    }

    case "SEND_AUDIO": {
      if (state[action.side] !== "listening") return state;
      return {
        ...state,
        [action.side]: "processing",
      };
    }

    case "RECEIVE_RESULT": {
      const detected = action.detected;
      const translation = action.translation;
      const originalText = action.originalText;
      return {
        ...state,
        [action.side]: "idle",
        activeSide: null,
        lastDetectedLanguage: detected,
        lastOriginalText: originalText,
        lastTranslation: translation,
        turnIndex: state.turnIndex + 1,
      };
    }

    case "START_SPEAKING": {
      if (state.activeSide !== null) return state;
      return {
        ...state,
        [action.side]: "speaking",
        activeSide: action.side,
      };
    }

    case "FINISH_SPEAKING": {
      if (state.activeSide === null) return state;
      return {
        ...state,
        [state.activeSide]: "idle",
        activeSide: null,
      };
    }

    case "FORCE_TURN": {
      // Sólo válido si el lado solicitado está idle y el otro lado también
      if (state[action.side] !== "idle") return state;
      return {
        ...state,
        [action.side]: "listening",
        activeSide: action.side,
      };
    }

    case "ABORT_ACTIVE": {
      if (state.activeSide === null) return state;
      const active = state.activeSide;
      return {
        ...state,
        [active]: "idle",
        activeSide: null,
        error: null,
      };
    }

    case "SET_ERROR": {
      return { ...state, error: action.error };
    }

    default: {
      return state;
    }
  }
}

/** Helper: lado opuesto al que está activo (o null si nadie está activo). */
export function oppositeOfActive(state: ConversationState): SupportedLanguage | null {
  if (state.activeSide === null) return null;
  return opposite(state.activeSide);
}

/** Constantes de tiempo del modo conversación. Exportadas por separado para evitar
 * que Next.js las confunda con exports de página al escanear page.tsx. */
export const CONVERSATION_CONSTANTS = {
  SOFT_LIMIT_SECONDS: 30,
  HARD_LIMIT_SECONDS: 45,
  POST_TURN_PAUSE_MS: 800,
} as const;