import type { SupportedLanguage } from "./translator";

/** Modo en el que se generó el item. */
export type HistoryMode = "single" | "conversation";

/** Item v2 con soporte para conversación. */
export interface HistoryItemV2 {
  id: string;
  timestamp: number;
  mode: HistoryMode;
  /** En single = config explícita del usuario. En conversation siempre "auto". */
  direction: "auto" | "es-ja" | "ja-es";
  detected_language: SupportedLanguage;
  original_text: string;
  translation: string;
  /** Nuevo en v2: agrupa items de una misma sesión de conversación. */
  session_id?: string;
  /** Nuevo en v2: índice del turno dentro de la sesión de conversación. */
  turn_index?: number;
  /** Nuevo en v2: quién habló en este turno (en conversation). */
  speaker?: SupportedLanguage;
}

/** Item legacy v1 (sin mode ni campos de conversación). */
export interface HistoryItemV1 {
  id: string;
  timestamp: number;
  direction: "auto" | "es-ja" | "ja-es";
  detected_language: SupportedLanguage;
  original_text: string;
  translation: string;
}

const STORAGE_KEY = "whisper_pwa_history";
const SCHEMA_VERSION = 2;
const SINGLE_LIMIT = 10;
const CONVERSATION_LIMIT = 50;

interface StoredHistory {
  v: number;
  items: Array<HistoryItemV1 | HistoryItemV2>;
}

function isV2(item: HistoryItemV1 | HistoryItemV2): item is HistoryItemV2 {
  return "mode" in item;
}

/** Migra un item v1 a v2. Items en conversation no existían en v1, así que todos pasan a 'single'. */
function migrateItem(item: HistoryItemV1 | HistoryItemV2): HistoryItemV2 {
  if (isV2(item)) return item;
  return {
    id: item.id,
    timestamp: item.timestamp,
    mode: "single",
    direction: item.direction,
    detected_language: item.detected_language,
    original_text: item.original_text,
    translation: item.translation,
  };
}

/** Lee el historial de localStorage con migración v1→v2. Si hay error, devuelve []. */
export function loadHistory(): HistoryItemV2[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StoredHistory> | HistoryItemV1[] | HistoryItemV2[];

    let items: Array<HistoryItemV1 | HistoryItemV2>;
    if (Array.isArray(parsed)) {
      items = parsed as Array<HistoryItemV1 | HistoryItemV2>;
    } else if (parsed && Array.isArray(parsed.items)) {
      items = parsed.items;
    } else {
      return [];
    }

    return items.map(migrateItem);
  } catch {
    return [];
  }
}

/** Persiste el historial respetando los límites por modo. */
export function saveHistory(items: HistoryItemV2[]): void {
  if (typeof window === "undefined") return;
  try {
    const limited = applyLimits(items);
    const payload: StoredHistory = { v: SCHEMA_VERSION, items: limited };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // No-op (entornos restringidos)
  }
}

/** Aplica los límites por modo (10 single, 50 conversation). */
export function applyLimits(items: HistoryItemV2[]): HistoryItemV2[] {
  const conversation = items.filter((i) => i.mode === "conversation").slice(0, CONVERSATION_LIMIT);
  const single = items.filter((i) => i.mode === "single").slice(0, SINGLE_LIMIT);
  return [...conversation, ...single];
}

/** Borra el historial persistido. */
export function clearHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // No-op
  }
}