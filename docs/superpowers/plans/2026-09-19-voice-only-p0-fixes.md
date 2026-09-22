# Uso 100 % por voz: correcciones P0 de la auditoría de accesibilidad — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una persona sin movilidad en las manos, usando solo Control por voz de iOS, pueda recuperarse de cualquier fallo, cancelar de verdad, cerrar un turno sin contaminar la traducción y mantener la sesión viva sin tocar la pantalla.

**Architecture:** Cinco correcciones sobre `translator-pwa/`. La lógica nueva se extrae a funciones puras testeables con `node --test` (reducer `FAIL_TURN`, `classifyRecorderStop`, `createWakeLock`, `isMicDead`, timeout/abort en `postTranslate`). El cableado en `page.tsx` y `ConversationView.tsx` es fino y se verifica con `tsc` más una lista de comprobación en dispositivo real. Se elimina el menú contextual y los gestos largos del orbe: cancelar pasa a ser un botón visible con nombre natural.

**Tech Stack:** Next.js / React 19 / TypeScript, `node --test` (Node 22, type-stripping), sin dependencias nuevas.

**Spec:** No hay spec nueva. Este plan implementa los hallazgos P0 de la auditoría de accesibilidad del 2026-09-19 (resumidos abajo) y continúa [docs/superpowers/specs/2026-09-09-hands-free-accessibility-design.md](../specs/2026-09-09-hands-free-accessibility-design.md), que ya cubrió los nombres accesibles y el umbral de silencio.

## Hallazgos que cubre

| # | Hallazgo (auditoría) | Tasks |
|---|---|---|
| P0-1 | Un error de red/API deja el lado en `processing` para siempre; la única salida era un orbe con nombre no pronunciable; no hay timeout | 1, 2, 3, 4 |
| P0-2 | "Cancelar" no cancela (el audio se envía igual) y "Pasar al otro lado" era un botón inerte | 3, 4 |
| P0-3 | La orden "detener grabación" acaba transcrita y traducida; el modo "Una frase" no cierra por silencio | 5 |
| P0-4 | Sin Wake Lock la pantalla se bloquea a mitad de sesión; un micro interrumpido deja el turno colgado en `listening` | 6, 7 |
| P0-5 | Cancelar dependía de un gesto de pulsación larga | 4 |

**Fuera de alcance (P1/P2 de la auditoría):** pitidos y voz para errores, umbral de silencio adaptativo, nombres que chocan con el habla (`"Salir"`), etiquetas únicas en el historial, autorrelleno de contraseña, semántica de diálogo en Ajustes, `tel:` y frases nuevas en Emergencia, objetivos de 44 px, zoom, contraste y `aria-live`. Cada uno merece su propio plan.

## Global Constraints

- Node 22 con type-stripping: solo sintaxis borrable (sin `enum`, sin parameter properties). Los tests importan `.ts` directamente.
- Import relativo con extensión `.ts` explícita cuando el módulo aporta al menos un valor en tiempo de ejecución (`from "./wakeLock.ts"`). Los imports `type`-only pueden omitirla. Los `#lib/*` (solo en componentes de `src/app/`) nunca llevan extensión.
- Sin dependencias nuevas. Tests con `node:test` + `node:assert/strict`, mismo estilo que `tests/orbLabel.test.mjs` (`describe`/`it`, import relativo `../src/lib/<archivo>.ts`).
- Comprobar tipos con `npx tsc --noEmit --incremental false`. Sin `--incremental false`, `tsc` reescribe `translator-pwa/tsconfig.tsbuildinfo`, que está versionado.
- Todos los comandos se ejecutan desde `translator-pwa/` salvo los de `git`, que se ejecutan desde la raíz del repo.
- Textos de interfaz en español, exactamente como aparecen en este plan (son lo que una persona dice en voz alta).
- No tocar `CONVERSATION_CONSTANTS` (`SILENCE_MS` 3000, `SOFT_LIMIT_SECONDS`, `HARD_LIMIT_SECONDS`, `POST_TURN_PAUSE_MS`).
- **Nunca `git push`** (regla del usuario). Los commits son locales y solo se hacen al ejecutar el plan. Convención del repo: prefijo `fix:`/`feat:`/`docs:`, mensaje en español, trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Línea base verificada el 2026-09-19 en la rama `new/feuture/19-09-2026`: `npm test` → 107 pass, 0 fail.

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lib/conversationMachine.ts` | Modificar | Acción `FAIL_TURN`; `OPEN_MIC` limpia el error previo |
| `src/lib/apiClient.ts` | Modificar | Timeout, `signal` externo y errores legibles en `postTranslate` |
| `src/lib/turnStop.ts` | Crear | `classifyRecorderStop`: qué hacer cuando `MediaRecorder` dispara `onstop` |
| `src/lib/orbLabel.ts` | Modificar | Etiquetas sin descripciones técnicas |
| `src/lib/translator.ts` | Modificar | Los prompts ignoran la orden final de cierre |
| `src/lib/wakeLock.ts` | Crear | `createWakeLock`: controlador puro del Wake Lock |
| `src/lib/useWakeLock.ts` | Crear | Hook React sobre `createWakeLock` |
| `src/lib/micHealth.ts` | Crear | `isMicDead`: detecta un stream de micro muerto |
| `src/app/ConversationView.tsx` | Modificar | Sin menú ni gestos largos; botón "Cancelar turno" |
| `src/app/page.tsx` | Modificar | Cancelación real, `FAIL_TURN`, silencio en modo single, Wake Lock, vigilante de micro |
| `src/app/EmergencySheet.tsx` | Modificar | Reutiliza `useWakeLock` |
| `tests/*.test.mjs` | Crear/Modificar | Un archivo por módulo puro nuevo |
| `docs/CONTEXT.md` | Modificar | Sustituir "Gestos" por "Controles"; reglas duras vigentes |

---

### Task 1: Acción `FAIL_TURN` en la máquina de conversación

**Files:**
- Modify: `translator-pwa/src/lib/conversationMachine.ts:32-42` (unión `ConversationAction`), `:80-90` (`OPEN_MIC`), `:154-156` (`SET_ERROR`)
- Test: `translator-pwa/tests/conversationMachine.test.mjs` (añadir al final)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: acción `{ type: "FAIL_TURN"; error: string }`. Devuelve el lado activo a `idle`, `activeSide = null`, conserva `turnIndex`/`lastTranslation` y fija `error`. La usan Task 3 y Task 7.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `translator-pwa/tests/conversationMachine.test.mjs`:

```js
describe("Conversation Machine - FAIL_TURN", () => {
  const processing = {
    ...initialConversationState,
    sessionId: "sess-1",
    es: "processing",
    activeSide: "es",
    turnIndex: 2,
    lastTranslation: "こんにちは",
  };

  it("devuelve el lado activo a idle, libera activeSide y fija el error", () => {
    const next = conversationReducer(processing, { type: "FAIL_TURN", error: "Sin red" });
    assert.equal(next.es, "idle");
    assert.equal(next.activeSide, null);
    assert.equal(next.error, "Sin red");
  });

  it("no consume el turno ni borra la última traducción", () => {
    const next = conversationReducer(processing, { type: "FAIL_TURN", error: "Sin red" });
    assert.equal(next.turnIndex, 2);
    assert.equal(next.lastTranslation, "こんにちは");
  });

  it("sin lado activo solo fija el error", () => {
    const idle = { ...initialConversationState, sessionId: "sess-1" };
    const next = conversationReducer(idle, { type: "FAIL_TURN", error: "Sin red" });
    assert.equal(next.activeSide, null);
    assert.equal(next.es, "idle");
    assert.equal(next.error, "Sin red");
  });
});

describe("Conversation Machine - OPEN_MIC tras un error", () => {
  it("limpia el error previo al abrir un turno nuevo", () => {
    const failed = { ...initialConversationState, sessionId: "sess-1", error: "Sin red" };
    const next = conversationReducer(failed, { type: "OPEN_MIC", side: "es" });
    assert.equal(next.es, "listening");
    assert.equal(next.error, null);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `node --test tests/conversationMachine.test.mjs`
Expected: los 4 tests nuevos FALLAN (`FAIL_TURN` cae en `default` y devuelve el estado sin cambios; `OPEN_MIC` no limpia `error`).

- [ ] **Step 3: Implementar**

En `translator-pwa/src/lib/conversationMachine.ts`:

1. En la unión `ConversationAction`, añadir antes de `| { type: "ABORT_ACTIVE" }`:

```ts
  | { type: "FAIL_TURN"; error: string }
```

2. En `case "OPEN_MIC"`, añadir `error: null` al objeto devuelto:

```ts
      return {
        ...state,
        [action.side]: "listening",
        activeSide: action.side,
        error: null,
      };
```

3. Añadir este `case` justo antes de `case "SET_ERROR"`:

```ts
    case "FAIL_TURN": {
      // Un turno que falla (red, cuota, micro perdido) debe devolver la máquina a un
      // estado accionable: sin esto el lado quedaba en "processing" y el usuario, sin
      // manos, no tenía forma de decir "Hablar en Español" otra vez.
      if (state.activeSide === null) return { ...state, error: action.error };
      return {
        ...state,
        [state.activeSide]: "idle",
        activeSide: null,
        error: action.error,
      };
    }

```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `node --test tests/conversationMachine.test.mjs`
Expected: PASS (todos, incluidos los preexistentes).

- [ ] **Step 5: Commit**

```bash
git add translator-pwa/src/lib/conversationMachine.ts translator-pwa/tests/conversationMachine.test.mjs
git commit -m "fix: FAIL_TURN devuelve el lado a idle tras un error de turno" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Timeout, cancelación y errores legibles en `postTranslate`

**Files:**
- Modify: `translator-pwa/src/lib/apiClient.ts` (reemplazo completo)
- Test: `translator-pwa/tests/apiClient.test.mjs` (crear)

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces: `postTranslate({ blob, mimeType, direction, signal?, timeoutMs? })`. `TRANSLATE_TIMEOUT_MS = 25_000`. Rechaza con `Error("La traducción tardó demasiado. Inténtalo de nuevo.")` en timeout y con el `AbortError` original (`err.name === "AbortError"`) si aborta el llamador. Task 3 pasa `signal`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `translator-pwa/tests/apiClient.test.mjs`:

```js
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import { postTranslate } from "../src/lib/apiClient.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const input = () => ({
  blob: new Blob(["x"], { type: "audio/mp4" }),
  mimeType: "audio/mp4",
  direction: "auto",
});

/** fetch que nunca responde y solo termina cuando se aborta su signal. */
function hangingFetch(_url, init) {
  return new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () =>
      reject(new DOMException("aborted", "AbortError"))
    );
  });
}

describe("postTranslate", () => {
  it("rechaza con un mensaje claro si la petición supera timeoutMs", async () => {
    globalThis.fetch = hangingFetch;
    await assert.rejects(postTranslate({ ...input(), timeoutMs: 20 }), /tardó demasiado/);
  });

  it("propaga AbortError (sin mensaje de timeout) cuando el llamador aborta", async () => {
    globalThis.fetch = hangingFetch;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    await assert.rejects(
      postTranslate({ ...input(), signal: controller.signal }),
      (err) => err.name === "AbortError" && !/tardó/.test(err.message)
    );
  });

  it("una respuesta 401 que no es JSON (pantalla de contraseña) da un mensaje de acceso", async () => {
    globalThis.fetch = async () =>
      new Response("<html>login</html>", {
        status: 401,
        headers: { "content-type": "text/html" },
      });
    await assert.rejects(postTranslate(input()), /Acceso denegado/);
  });

  it("un error con JSON usa el mensaje del servidor", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "Cuota agotada" }), { status: 500 });
    await assert.rejects(postTranslate(input()), /Cuota agotada/);
  });

  it("una respuesta correcta devuelve el JSON", async () => {
    const body = { detected_language: "es", original_text: "hola", translation: "こんにちは" };
    globalThis.fetch = async () => new Response(JSON.stringify(body), { status: 200 });
    assert.deepEqual(await postTranslate(input()), body);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `node --test tests/apiClient.test.mjs`
Expected: FAIL — el test del timeout se cuelga o falla (no existe `timeoutMs`), el del 401 falla con `SyntaxError` al parsear el HTML, el de abort no encuentra `signal`.

- [ ] **Step 3: Implementar**

Reemplazar todo `translator-pwa/src/lib/apiClient.ts` por:

```ts
import { loadProviderSettings, needsWavConversion } from "./providerSettings.ts";
import { blobToWav } from "./wavEncoder.ts";
import type { TranslationResult } from "./providers/types.ts";

/** Espera máxima por /api/translate. Sin techo, una red colgada dejaba el orbe en
 * "procesando" indefinidamente y el usuario, sin manos, sin salida cómoda. */
export const TRANSLATE_TIMEOUT_MS = 25_000;

export interface PostTranslateInput {
  blob: Blob;
  mimeType: string;
  direction: string;
  /** Aborta la petición desde fuera (p. ej. "Cancelar turno"). Rechaza con AbortError. */
  signal?: AbortSignal;
  /** Espera máxima antes de rendirse. Por defecto TRANSLATE_TIMEOUT_MS. */
  timeoutMs?: number;
}

/**
 * Punto único de llamada a /api/translate. Aplica los ajustes del usuario,
 * convierte el audio si el proveedor lo exige y añade las cabeceras.
 */
export async function postTranslate({
  blob,
  mimeType,
  direction,
  signal,
  timeoutMs = TRANSLATE_TIMEOUT_MS,
}: PostTranslateInput): Promise<TranslationResult> {
  const settings = loadProviderSettings();

  let payload = blob;
  let payloadMime = mimeType;
  if (needsWavConversion(settings?.id ?? null, mimeType)) {
    payload = await blobToWav(blob);
    payloadMime = "audio/wav";
  }

  const extension = payloadMime.includes("wav")
    ? "wav"
    : payloadMime.includes("mp4")
    ? "m4a"
    : "webm";

  const formData = new FormData();
  formData.append("audio", payload, `voice-input.${extension}`);
  formData.append("direction", direction);

  const headers: Record<string, string> = {};
  if (settings) {
    headers["x-provider-id"] = settings.id;
    headers["x-provider-key"] = settings.apiKey;
    if (settings.model) headers["x-provider-model"] = settings.model;
  }

  // Un solo AbortController une la señal externa y el timeout; `timedOut` distingue
  // "nos rendimos" de "el usuario canceló" para dar el mensaje correcto.
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onExternalAbort, { once: true });
  }
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      body: formData,
      headers,
      signal: controller.signal,
    });
    // La pantalla de contraseña (middleware) responde HTML con 401: no es JSON.
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        data?.error ||
          (res.status === 401
            ? "Acceso denegado. Vuelve a abrir la app e introduce la contraseña."
            : "Error al procesar la traducción.")
      );
    }
    return data as TranslationResult;
  } catch (err) {
    if (timedOut) throw new Error("La traducción tardó demasiado. Inténtalo de nuevo.");
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `node --test tests/apiClient.test.mjs`
Expected: PASS (5 tests). Si el test de timeout falla porque `needsWavConversion(null, "audio/mp4")` intenta convertir, ejecutar `grep -n "needsWavConversion" src/lib/providerSettings.ts` y confirmar que devuelve `false` para proveedor `null`; en producción ya se llama así.

- [ ] **Step 5: Comprobar que nada más se rompe y commit**

Run: `npm test && npx tsc --noEmit --incremental false`
Expected: todo pasa, `tsc` sin salida. Los llamadores existentes (`SettingsSheet.tsx`, `page.tsx`) no pasan `signal`/`timeoutMs`, así que compilan sin cambios.

```bash
git add translator-pwa/src/lib/apiClient.ts translator-pwa/tests/apiClient.test.mjs
git commit -m "fix: postTranslate con timeout, cancelación y errores legibles" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Cancelar de verdad y recuperarse de los fallos de turno

**Files:**
- Create: `translator-pwa/src/lib/turnStop.ts`
- Test: `translator-pwa/tests/turnStop.test.mjs`
- Modify: `translator-pwa/src/app/page.tsx` (varios puntos; ver los pasos)

**Interfaces:**
- Consumes: `FAIL_TURN` (Task 1); `postTranslate({ signal })` (Task 2).
- Produces:
  - `classifyRecorderStop({ cancelled: boolean; blobSize: number }): "cancelled" | "empty" | "send"`.
  - En `page.tsx`: `cancelTurnIO(): void` (estable, `useCallback` con `[]`) y `handleConvCancelTurn(): void`. Task 4 y Task 7 los usan.

- [ ] **Step 1: Escribir el test que falla**

Crear `translator-pwa/tests/turnStop.test.mjs`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { classifyRecorderStop } from "../src/lib/turnStop.ts";

describe("classifyRecorderStop", () => {
  it("turno cancelado: no se envía nada, aunque haya audio", () => {
    assert.equal(classifyRecorderStop({ cancelled: true, blobSize: 4096 }), "cancelled");
  });

  it("cancelado gana sobre vacío", () => {
    assert.equal(classifyRecorderStop({ cancelled: true, blobSize: 0 }), "cancelled");
  });

  it("grabación vacía: hay que devolver el lado a idle", () => {
    assert.equal(classifyRecorderStop({ cancelled: false, blobSize: 0 }), "empty");
  });

  it("grabación con audio: se envía", () => {
    assert.equal(classifyRecorderStop({ cancelled: false, blobSize: 4096 }), "send");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `node --test tests/turnStop.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/turnStop.ts'`.

- [ ] **Step 3: Crear `turnStop.ts`**

```ts
export type StopOutcome = "cancelled" | "empty" | "send";

/**
 * Decide qué hace `recorder.onstop` en un turno de conversación.
 *
 * - "cancelled": el turno se canceló (Cancelar turno, Salir, micro perdido). El audio
 *   se descarta: sin esta salida, `recorder.stop()` disparaba `onstop` igualmente y la
 *   app traducía y reproducía un turno que el usuario acababa de cancelar.
 * - "empty": no hay audio. Hay que devolver el lado a idle o se queda en "listening".
 * - "send": flujo normal.
 */
export function classifyRecorderStop(params: {
  cancelled: boolean;
  blobSize: number;
}): StopOutcome {
  if (params.cancelled) return "cancelled";
  if (params.blobSize === 0) return "empty";
  return "send";
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `node --test tests/turnStop.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Cablear `page.tsx` — import y refs**

En `translator-pwa/src/app/page.tsx`:

1. Después de `import { useSilenceDetector } from "#lib/useSilenceDetector";` añadir:

```ts
import { classifyRecorderStop } from "#lib/turnStop";
```

2. Después de la línea `const convSpeakingDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);` añadir:

```ts
  // Grabadores cuyo turno se canceló: su onstop no debe enviar audio ni hablar.
  // WeakSet por grabador (no un booleano global): un onstop tardío de un turno viejo
  // nunca puede afectar a un grabador nuevo.
  const convCancelledRecordersRef = useRef(new WeakSet<MediaRecorder>());
  // Petición /api/translate en vuelo del turno actual, para poder abortarla.
  const convFetchAbortRef = useRef<AbortController | null>(null);
```

- [ ] **Step 6: Cablear `page.tsx` — `cancelTurnIO`**

Insertar justo antes del comentario `// Inicializar MediaRecorder cuando se abre un mic de conversación`:

```ts
  // Cancela el turno a nivel de E/S: aborta la petición en vuelo y marca el grabador
  // para que su onstop descarte el audio. No toca el estado de la máquina.
  const cancelTurnIO = useCallback(() => {
    convFetchAbortRef.current?.abort();
    convFetchAbortRef.current = null;
    const recorder = convRecorderRef.current;
    if (!recorder) return;
    convCancelledRecordersRef.current.add(recorder);
    if (recorder.state === "recording") {
      try {
        recorder.stop();
      } catch {
        // No-op
      }
    }
  }, []);

```

- [ ] **Step 7: Cablear `page.tsx` — `recorder.onstop`**

Dentro del efecto de inicialización del `MediaRecorder`, reemplazar este bloque:

```ts
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
```

por:

```ts
      const finalMimeType = chosenMimeType || "audio/mp4";
      const blob = new Blob(convChunksRef.current, { type: finalMimeType });
      const outcome = classifyRecorderStop({
        cancelled: convCancelledRecordersRef.current.has(recorder),
        blobSize: blob.size,
      });
      // Turno cancelado: handleConvCancelTurn ya devolvió la máquina a idle.
      if (outcome === "cancelled") return;
      // Grabación vacía: sin esto el lado se quedaba en "listening" para siempre.
      if (outcome === "empty") {
        dispatchConv({ type: "ABORT_ACTIVE" });
        return;
      }

      dispatchConv({ type: "SEND_AUDIO", side: activeSide });

      const abort = new AbortController();
      convFetchAbortRef.current = abort;

      try {
        const data = await postTranslate({
          blob,
          mimeType: finalMimeType,
          direction: "auto",
          signal: abort.signal,
        });
        // Cancelado mientras llegaba la respuesta: ni traducir ni hablar.
        if (abort.signal.aborted) return;
```

Y reemplazar el `catch` del final del mismo `onstop`:

```ts
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error inesperado";
        dispatchConv({ type: "SET_ERROR", error: message });
      }
    };
```

por:

```ts
      } catch (err) {
        // Cancelación propia (handleConvCancelTurn): la máquina ya está en idle, sin error.
        if (abort.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Error inesperado";
        // FAIL_TURN (no SET_ERROR): devuelve el lado a idle para que el usuario pueda
        // volver a decir "Hablar en Español" en vez de quedar atascado en "processing".
        dispatchConv({ type: "FAIL_TURN", error: message });
      } finally {
        if (convFetchAbortRef.current === abort) convFetchAbortRef.current = null;
      }
    };
```

- [ ] **Step 8: Cablear `page.tsx` — limpieza al desmontar, `exitConversation`, cancelar**

1. Reemplazar el efecto `// Cleanup explícito del MediaRecorder cuando el componente se desmonta` completo por:

```ts
  // Cleanup explícito del MediaRecorder cuando el componente se desmonta
  useEffect(() => {
    return () => {
      cancelTurnIO();
    };
  }, [cancelTurnIO]);
```

2. En `exitConversation`, reemplazar el bloque

```ts
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
```

por:

```ts
    cancelTurnIO();
    if (convAudioStream) {
      convAudioStream.getTracks().forEach((t) => t.stop());
      setConvAudioStream(null);
    }
    setConvTurnSeconds(0);
    dispatchConv({ type: "EXIT_CONVERSATION" });
  }, [convAudioStream, cancelTurnIO]);
```

(Antes, "Salir" con el micro abierto disparaba `onstop` y se traducía y hablaba igualmente.)

3. Reemplazar la función `handleConvLongPressOrb` completa (desde `const handleConvLongPressOrb = useCallback(` hasta su cierre `[convState.activeSide, convAudioStream]\n  );`) por:

```ts
  const handleConvCancelTurn = useCallback(() => {
    if (convState.activeSide === null) return;
    // Abortar TTS, petición en vuelo y micro
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    cancelTurnIO();
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
  }, [convState.activeSide, convAudioStream, cancelTurnIO]);
```

4. En el JSX de `<ConversationView`, cambiar `onLongPressOrb={handleConvLongPressOrb}` por `onLongPressOrb={handleConvCancelTurn}`. Compila porque `() => void` es asignable a `(side) => void`; Task 4 sustituye esta prop.

- [ ] **Step 9: Verificar y commit**

Run: `npm test && npx tsc --noEmit --incremental false`
Expected: todo pasa, `tsc` sin salida.

Comprobación manual (dev server, `npm run dev`, DevTools con red en "Offline"): abrir conversación, hablar, callar 3 s → aparece el error y ambos orbes vuelven a ser accionables ("Hablar en Español"). Antes quedaba un orbe girando.

```bash
git add translator-pwa/src/lib/turnStop.ts translator-pwa/tests/turnStop.test.mjs translator-pwa/src/app/page.tsx
git commit -m "fix: cancelar un turno descarta el audio y un error ya no atasca el orbe" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Sin gestos largos: orbes de un toque y botón "Cancelar turno"

**Files:**
- Modify: `translator-pwa/src/lib/orbLabel.ts` (reemplazo completo)
- Modify: `translator-pwa/tests/orbLabel.test.mjs` (reemplazo completo)
- Modify: `translator-pwa/src/app/ConversationView.tsx` (varios puntos)
- Modify: `translator-pwa/src/app/page.tsx` (props de `ConversationView`, borrar `handleConvDoubleTapOrb`)

**Interfaces:**
- Consumes: `handleConvCancelTurn(): void` (Task 3).
- Produces: `getOrbAccessibleLabel({ side, stateValue, activeSide })` (sin `displayName` ni `role`). `ConversationView` pierde `onLongPressOrb`/`onDoubleTapOrb` y gana `onCancelTurn: () => void`.

**Decisión:** el menú contextual (`OrbContextMenu`) solo servía para "Cancelar este turno" y "Pasar al otro lado". El segundo llamaba a `handleConvDoubleTapOrb(side)` con el lado ya activo y salía por `if (state[side] !== "idle") return`: nunca funcionó. Se elimina el menú entero. El doble clic sobre un orbe ocioso también se elimina: tras un toque simple que ya abre el micro, duplicaba `openConvMic` (dos `getUserMedia`).

- [ ] **Step 1: Reescribir el test de etiquetas (fallará)**

Reemplazar todo `translator-pwa/tests/orbLabel.test.mjs` por:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getOrbAccessibleLabel } from "../src/lib/orbLabel.ts";

describe("getOrbAccessibleLabel", () => {
  it("este lado escuchando (activo): 'Detener grabación'", () => {
    const label = getOrbAccessibleLabel({ side: "ja", stateValue: "listening", activeSide: "ja" });
    assert.equal(label, "Detener grabación");
  });

  it("este lado hablando: estado informativo, no una descripción técnica", () => {
    const label = getOrbAccessibleLabel({ side: "ja", stateValue: "speaking", activeSide: "ja" });
    assert.equal(label, "Reproduciendo traducción");
  });

  it("este lado procesando: estado informativo", () => {
    const label = getOrbAccessibleLabel({ side: "ja", stateValue: "processing", activeSide: "ja" });
    assert.equal(label, "Traduciendo, espera");
  });

  it("procesando/hablando no ofrecen 'menú' ni nombres de orbe: la cancelación es un botón aparte", () => {
    for (const stateValue of ["processing", "speaking"]) {
      const label = getOrbAccessibleLabel({ side: "es", stateValue, activeSide: "es" });
      assert.doesNotMatch(label, /orbe|menú/i);
    }
  });

  it("inactivo y libre (activeSide null): 'Hablar en <idioma>'", () => {
    const es = getOrbAccessibleLabel({ side: "es", stateValue: "idle", activeSide: null });
    const ja = getOrbAccessibleLabel({ side: "ja", stateValue: "idle", activeSide: null });
    assert.equal(es, "Hablar en Español");
    assert.equal(ja, "Hablar en Japonés");
  });

  it("inactivo y bloqueado por el otro lado: '<idioma>, en espera'", () => {
    const label = getOrbAccessibleLabel({ side: "ja", stateValue: "idle", activeSide: "es" });
    assert.equal(label, "Japonés, en espera");
  });
});
```

Run: `node --test tests/orbLabel.test.mjs`
Expected: FAIL en los tests de `speaking` y `processing` (siguen devolviendo `"Orbe Otro (…) · toca para menú"`).

- [ ] **Step 2: Implementar `orbLabel.ts`**

Reemplazar todo `translator-pwa/src/lib/orbLabel.ts` por:

```ts
import type { SideState } from "./conversationMachine";
import type { SupportedLanguage } from "./translator";

/** Nombre del idioma tal como se diría en voz alta en español — distinto del nombre
 * visual (p. ej. "日本語" se muestra en pantalla, pero se dice "Japonés"). */
const SPOKEN_LANGUAGE_NAME: Record<SupportedLanguage, string> = {
  es: "Español",
  ja: "Japonés",
};

export interface OrbLabelParams {
  /** Lado (es|ja) al que pertenece este orbe. */
  side: SupportedLanguage;
  /** Estado de este lado. */
  stateValue: SideState;
  /** Lado activo en la conversación, o null si ninguno. */
  activeSide: SupportedLanguage | null;
}

/**
 * Nombre accesible del orbe: debe ser exactamente lo que una persona diría en voz
 * alta con Control por voz de iOS para activarlo, nunca una descripción técnica de
 * su función interna (spec 2026-09-09 §4.3).
 */
export function getOrbAccessibleLabel(params: OrbLabelParams): string {
  const { side, stateValue, activeSide } = params;

  if (stateValue === "listening") return "Detener grabación";

  // Informativos y no accionables: cancelar vive en el botón "Cancelar turno", que
  // tiene su propio nombre y no depende de un menú ni de un gesto largo.
  if (stateValue === "processing") return "Traduciendo, espera";
  if (stateValue === "speaking") return "Reproduciendo traducción";

  // idle
  if (activeSide === null) return `Hablar en ${SPOKEN_LANGUAGE_NAME[side]}`;
  return `${SPOKEN_LANGUAGE_NAME[side]}, en espera`;
}
```

Run: `node --test tests/orbLabel.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 3: `ConversationView.tsx` — imports y props**

1. Cambiar la primera línea de imports de React:

```ts
import { useEffect, useMemo, useRef, useState } from "react";
```

por:

```ts
import { useEffect, useMemo, useState } from "react";
```

2. Cambiar el import de lucide:

```ts
import { Square, ArrowLeftRight, Mic, Volume2, X, AlertTriangle } from "lucide-react";
```

por:

```ts
import { Square, Mic, Volume2, X, AlertTriangle } from "lucide-react";
```

3. En `interface ConversationViewProps`, eliminar las líneas `onLongPressOrb: (side: SupportedLanguage) => void;` y `onDoubleTapOrb: (side: SupportedLanguage) => void;` y añadir tras `onStopTurn`:

```ts
  /** Cancela el turno activo (descarta audio, aborta petición y voz). */
  onCancelTurn: () => void;
```

4. En la firma de `export default function ConversationView({ ... })`, quitar `onLongPressOrb,` y `onDoubleTapOrb,` y añadir `onCancelTurn,` después de `onStopTurn,`.

- [ ] **Step 4: `ConversationView.tsx` — eliminar el menú y reescribir `Orb`**

1. Borrar la función `OrbContextMenu` completa (desde `function OrbContextMenu({` hasta el `}` que la cierra, justo antes de `function Orb({`).

2. Reemplazar la función `Orb` completa (desde `function Orb({` hasta su `}` de cierre, justo antes de `function OnboardingToast({`) por:

```tsx
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
```

- [ ] **Step 5: `ConversationView.tsx` — usos de `Orb` y botón "Cancelar turno"**

1. En el JSX de `ConversationView`, reemplazar el bloque

```tsx
          <Orb
            side="es"
            ...
            onCancelActive={() => onLongPressOrb("es")}
            onInvertActive={() => onDoubleTapOrb("es")}
          />
```

por (y lo mismo con `"ja"`, cambiando `side`, `stateValue`, `isNextSpeaker`, `onOpenMic`, `onStopTurn`):

```tsx
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
```

```tsx
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
```

2. Justo antes del comentario `{/* Última traducción */}`, insertar:

```tsx
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

```

- [ ] **Step 6: `page.tsx` — props y limpieza**

1. En `<ConversationView`, eliminar las líneas `onLongPressOrb={handleConvCancelTurn}` y `onDoubleTapOrb={handleConvDoubleTapOrb}` y añadir `onCancelTurn={handleConvCancelTurn}` (por ejemplo, después de `onStopTurn={handleConvStopTurn}`).

2. Borrar la función `handleConvDoubleTapOrb` completa (el `useCallback` que hace `if (convState[side] !== "idle") return; openConvMic(side);` con dependencias `[convState, openConvMic]`). No borrar `handleConvTapOrb`, que sigue siendo `onOpenMic`.

- [ ] **Step 7: Verificar y commit**

Run: `npm test && npx tsc --noEmit --incremental false`
Expected: todo pasa. Si `tsc` reporta `SupportedLanguage`/`useRef` sin usar en `ConversationView.tsx`, comprobar que `SupportedLanguage` sigue usado (lo está: `SideMeta`, `opposite`, `Orb`) y que no queda ninguna referencia a `OrbContextMenu`, `menuOpen`, `onLongPress` ni `onInvertActive` (`grep -n "OrbContextMenu\|menuOpen\|onLongPress\|onInvertActive\|onDoubleTap" src/app/*.tsx` debe salir vacío).

```bash
git add translator-pwa/src/lib/orbLabel.ts translator-pwa/tests/orbLabel.test.mjs translator-pwa/src/app/ConversationView.tsx translator-pwa/src/app/page.tsx
git commit -m "fix: orbes de un solo toque y botón Cancelar turno en lugar de gestos largos" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: La orden de cierre no se traduce, y "Una frase" cierra por silencio

**Files:**
- Modify: `translator-pwa/src/lib/translator.ts:5-29` (constante `PROMPTS`)
- Test: `translator-pwa/tests/prompts.test.mjs` (crear)
- Modify: `translator-pwa/src/app/page.tsx` (modo single)

**Interfaces:**
- Consumes: `useSilenceDetector` y `CONVERSATION_CONSTANTS.SILENCE_MS` (ya existentes; `page.tsx` ya define `SILENCE_MS`).
- Produces: los tres prompts de `PROMPTS` incluyen la regla de ignorar la orden final.

- [ ] **Step 1: Escribir el test que falla**

Crear `translator-pwa/tests/prompts.test.mjs`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { PROMPTS } from "../src/lib/translator.ts";

describe("PROMPTS", () => {
  for (const [direction, prompt] of Object.entries(PROMPTS)) {
    it(`"${direction}" manda ignorar la orden final de detener grabación`, () => {
      assert.match(prompt, /detener grabación/);
    });

    it(`"${direction}" sigue exigiendo respuesta en JSON`, () => {
      assert.match(prompt, /JSON/);
    });
  }
});
```

Run: `node --test tests/prompts.test.mjs`
Expected: FAIL en los tres tests de `detener grabación`.

- [ ] **Step 2: Implementar los prompts**

En `translator-pwa/src/lib/translator.ts`, reemplazar el bloque `export const PROMPTS ... };` por:

```ts
/** Órdenes que el usuario dice a Control por voz para cerrar la grabación. Quedan al
 * final del audio: sin esta regla el modelo las transcribe y las traduce ("Transcribe
 * exactamente"), y el interlocutor oye "…detener grabación" en japonés. */
const IGNORE_CONTROL_PHRASES =
  "Ignora cualquier orden dirigida al teléfono que aparezca al final del audio (por ejemplo «detener grabación», «listo», «parar» o 「録音を止めて」): no la transcribas ni la traduzcas.";

export const PROMPTS: Record<string, string> = {
  auto: `Escucha este audio con atención.
1. Transcribe exactamente lo que se dijo.
2. Detecta si el idioma es Español o Japonés.
3. Traduce al idioma contrario (Español→Japonés o Japonés→Español).

${IGNORE_CONTROL_PHRASES}

Responde ÚNICAMENTE con un objeto JSON válido con este formato exacto, sin markdown, sin explicaciones:
{"detected_language":"es","original_text":"...","translation":"..."}

Si el idioma detectado es japonés, usa "ja" en detected_language. Si es español, usa "es".`,

  "es-ja": `Escucha este audio en Español.
1. Transcribe exactamente lo que se dijo en español.
2. Tradúcelo al Japonés de forma natural.

${IGNORE_CONTROL_PHRASES}

Responde ÚNICAMENTE con un objeto JSON válido con este formato exacto, sin markdown, sin explicaciones:
{"detected_language":"es","original_text":"...","translation":"..."}`,

  "ja-es": `このオーディオを日本語で聞いてください。
1. 話された内容を正確に文字起こしをしてください。
2. スペイン語に自然に翻訳してください。

${IGNORE_CONTROL_PHRASES}

次の形式の有効なJSONオブジェクトのみで返答してください。マークダウンや説明は含めないでください:
{"detected_language":"ja","original_text":"...","translation":"..."}`,
};
```

Run: `node --test tests/prompts.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 3: Modo single — cierre por silencio (`page.tsx`)**

1. Después de `const [showEmergency, setShowEmergency] = useState(false);` añadir:

```ts
  // Stream del modo single como estado (no solo ref) para que useSilenceDetector se entere.
  const [singleStream, setSingleStream] = useState<MediaStream | null>(null);
```

2. En `startRecordingSingle`, tras `audioStreamRef.current = stream;` añadir:

```ts
      setSingleStream(stream);
```

3. En `mediaRecorder.onstop` de `startRecordingSingle`, reemplazar

```ts
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach((track) => track.stop());
          audioStreamRef.current = null;
        }
```

por:

```ts
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach((track) => track.stop());
          audioStreamRef.current = null;
        }
        setSingleStream(null);
```

4. Justo antes de `const handleRecordToggleSingle = () => {` insertar:

```ts
  // Cierre por silencio también en "Una frase": antes la única forma de parar por voz
  // era decir "Detener grabación", que quedaba grabado al final del audio.
  useSilenceDetector({
    stream: singleStream,
    enabled: isRecording,
    silenceMs: SILENCE_MS,
    onSilence: stopRecordingSingle,
  });

```

5. Cambiar el texto de ayuda del modo single:

```tsx
                  <span className="text-fg-muted">Toca el micrófono, habla en Español o Japonés y suéltalo</span>
```

por:

```tsx
                  <span className="text-fg-muted">
                    Toca el micrófono y habla en Español o Japonés. Se envía solo al detectar silencio, o di «Detener grabación»
                  </span>
```

- [ ] **Step 4: Verificar y commit**

Run: `npm test && npx tsc --noEmit --incremental false`
Expected: todo pasa.

Comprobación manual (dev server, Chrome): en "Una frase", pulsar el micro, decir una frase y callar 3 s → el audio se envía solo. La eficacia real del prompt con la orden hablada se comprueba en dispositivo (lista de Task 8): un mock no puede demostrar qué hace el modelo con audio real.

```bash
git add translator-pwa/src/lib/translator.ts translator-pwa/tests/prompts.test.mjs translator-pwa/src/app/page.tsx
git commit -m "fix: ignorar la orden de cierre en el prompt y cerrar por silencio en modo Una frase" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Wake Lock durante la sesión de conversación

**Files:**
- Create: `translator-pwa/src/lib/wakeLock.ts`
- Create: `translator-pwa/src/lib/useWakeLock.ts`
- Test: `translator-pwa/tests/wakeLock.test.mjs`
- Modify: `translator-pwa/src/app/page.tsx`, `translator-pwa/src/app/EmergencySheet.tsx`

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces: `createWakeLock(request): { enable(): Promise<void>; disable(): void; onVisible(): Promise<void> }` y `useWakeLock(active: boolean): void`.

**Por qué dos archivos:** `wakeLock.ts` no importa React para poder testearse en Node; los módulos CJS de React no siempre exponen exports con nombre bajo ESM de Node.

- [ ] **Step 1: Escribir el test que falla**

Crear `translator-pwa/tests/wakeLock.test.mjs`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createWakeLock } from "../src/lib/wakeLock.ts";

function fakeRequest() {
  const sentinels = [];
  const request = () => {
    const s = {
      released: false,
      release() {
        this.released = true;
        return Promise.resolve();
      },
    };
    sentinels.push(s);
    return Promise.resolve(s);
  };
  return { request, sentinels };
}

describe("createWakeLock", () => {
  it("enable adquiere una sola vez aunque se llame dos veces", async () => {
    const { request, sentinels } = fakeRequest();
    const wl = createWakeLock(request);
    await wl.enable();
    await wl.enable();
    assert.equal(sentinels.length, 1);
  });

  it("disable libera el lock", async () => {
    const { request, sentinels } = fakeRequest();
    const wl = createWakeLock(request);
    await wl.enable();
    wl.disable();
    assert.equal(sentinels[0].released, true);
  });

  it("onVisible readquiere (el sistema libera el lock al ocultar la página)", async () => {
    const { request, sentinels } = fakeRequest();
    const wl = createWakeLock(request);
    await wl.enable();
    await wl.onVisible();
    assert.equal(sentinels.length, 2);
    assert.equal(sentinels[0].released, true);
    assert.equal(sentinels[1].released, false);
  });

  it("onVisible no hace nada si el lock no está activo", async () => {
    const { request, sentinels } = fakeRequest();
    const wl = createWakeLock(request);
    await wl.onVisible();
    assert.equal(sentinels.length, 0);
  });

  it("disable con la petición aún pendiente libera el lock cuando llega tarde", async () => {
    let resolveRequest;
    const late = { released: false, release() { this.released = true; return Promise.resolve(); } };
    const wl = createWakeLock(() => new Promise((res) => { resolveRequest = res; }));
    const pending = wl.enable();
    wl.disable();
    resolveRequest(late);
    await pending;
    assert.equal(late.released, true);
  });

  it("sin soporte (request null) no lanza", async () => {
    const wl = createWakeLock(null);
    await wl.enable();
    wl.disable();
  });

  it("si la petición falla no lanza", async () => {
    const wl = createWakeLock(() => Promise.reject(new Error("NotAllowedError")));
    await wl.enable();
  });
});
```

Run: `node --test tests/wakeLock.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/wakeLock.ts'`.

- [ ] **Step 2: Implementar `wakeLock.ts`**

```ts
export interface WakeLockSentinelLike {
  release(): Promise<void>;
}

export interface WakeLockController {
  enable(): Promise<void>;
  disable(): void;
  /** Llamar cuando la página vuelve a ser visible: el sistema libera el lock al ocultarla. */
  onVisible(): Promise<void>;
}

/**
 * Controlador puro de Screen Wake Lock. `request` es `() => navigator.wakeLock.request("screen")`
 * o `null` si el navegador no lo soporta. Sin él, una persona que no puede tocar la pantalla
 * ve cómo el auto-bloqueo del iPhone mata la sesión a mitad de conversación.
 */
export function createWakeLock(
  request: (() => Promise<WakeLockSentinelLike>) | null
): WakeLockController {
  let lock: WakeLockSentinelLike | null = null;
  let wanted = false;
  // Cada adquisición lleva un número: si `disable` o una petición más nueva ocurren
  // mientras la anterior está pendiente, el sentinel tardío se libera en vez de filtrarse.
  let ticket = 0;

  const dropLock = () => {
    const old = lock;
    lock = null;
    old?.release().catch(() => {});
  };

  const acquire = async () => {
    if (!request || !wanted) return;
    const mine = ++ticket;
    try {
      const sentinel = await request();
      if (!wanted || mine !== ticket) {
        sentinel.release().catch(() => {});
        return;
      }
      lock = sentinel;
    } catch {
      // Sin wake lock no pasa nada grave: la pantalla puede apagarse, nada más.
    }
  };

  return {
    enable() {
      wanted = true;
      if (lock) return Promise.resolve();
      return acquire();
    },
    disable() {
      wanted = false;
      ticket++;
      dropLock();
    },
    onVisible() {
      if (!wanted) return Promise.resolve();
      dropLock();
      return acquire();
    },
  };
}
```

Run: `node --test tests/wakeLock.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 3: Crear el hook `useWakeLock.ts`**

```ts
import { useEffect } from "react";
import { createWakeLock } from "./wakeLock.ts";

/**
 * Mantiene la pantalla encendida mientras `active` es true y readquiere el lock cada
 * vez que la página vuelve a ser visible. Requiere iOS ≥ 16.4; en PWA instalada hubo
 * fallos hasta iOS 18.4, así que se degrada en silencio.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    const controller = createWakeLock(() => navigator.wakeLock.request("screen"));
    void controller.enable();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void controller.onVisible();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      controller.disable();
    };
  }, [active]);
}

export default useWakeLock;
```

- [ ] **Step 4: Cablear en `page.tsx`**

1. Después de `import { useSilenceDetector } from "#lib/useSilenceDetector";` añadir:

```ts
import { useWakeLock } from "#lib/useWakeLock";
```

2. Justo después de la línea `const [convState, dispatchConv] = useReducer(conversationReducer, initialConversationState);` añadir:

```ts
  // La pantalla no se apaga mientras haya una sesión de conversación abierta.
  useWakeLock(convState.sessionId !== null);
```

- [ ] **Step 5: `EmergencySheet.tsx` reutiliza el hook**

En `translator-pwa/src/app/EmergencySheet.tsx`:

1. Cambiar `import { useEffect, useRef, useState } from "react";` por:

```ts
import { useEffect, useState } from "react";
```

y añadir bajo los imports de `#lib/emergencyPhrases`:

```ts
import { useWakeLock } from "#lib/useWakeLock";
```

2. Borrar `const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);`.

3. Reemplazar el efecto completo `// Mantener la pantalla encendida mientras se enseña el japonés en grande.` (desde `useEffect(() => {\n    if (!open || view !== "big" || !("wakeLock" in navigator)) return;` hasta su `}, [open, view]);`) por:

```ts
  // Mantener la pantalla encendida mientras se enseña el japonés en grande.
  useWakeLock(open && view === "big");
```

(El hook queda antes de `if (!open) return null;`, respetando el orden de hooks.)

- [ ] **Step 6: Verificar y commit**

Run: `npm test && npx tsc --noEmit --incremental false`
Expected: todo pasa.

```bash
git add translator-pwa/src/lib/wakeLock.ts translator-pwa/src/lib/useWakeLock.ts translator-pwa/tests/wakeLock.test.mjs translator-pwa/src/app/page.tsx translator-pwa/src/app/EmergencySheet.tsx
git commit -m "feat: Wake Lock durante la conversación para que la pantalla no se apague" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Vigilante de micro: un stream muerto no deja el turno colgado

**Files:**
- Create: `translator-pwa/src/lib/micHealth.ts`
- Test: `translator-pwa/tests/micHealth.test.mjs`
- Modify: `translator-pwa/src/app/page.tsx`

**Interfaces:**
- Consumes: `cancelTurnIO` (Task 3), `FAIL_TURN` (Task 1).
- Produces: `isMicDead(stream: { getAudioTracks(): { readyState: string }[] } | null): boolean`.

**Límite conocido:** iOS suele emitir `mute` (no `ended`) en algunas interrupciones y la pista sigue en `readyState: "live"`. Este plan cubre `ended` y el regreso a primer plano; **no** añade `mute` sin evidencia. Si la prueba en dispositivo (Task 8) muestra que el turno sigue colgado tras una llamada o Siri, añadir un listener de `mute` con un pequeño retardo.

- [ ] **Step 1: Escribir el test que falla**

Crear `translator-pwa/tests/micHealth.test.mjs`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isMicDead } from "../src/lib/micHealth.ts";

const streamWith = (...states) => ({
  getAudioTracks: () => states.map((readyState) => ({ readyState })),
});

describe("isMicDead", () => {
  it("sin stream: muerto", () => {
    assert.equal(isMicDead(null), true);
  });

  it("sin pistas de audio: muerto", () => {
    assert.equal(isMicDead(streamWith()), true);
  });

  it("todas las pistas terminadas: muerto", () => {
    assert.equal(isMicDead(streamWith("ended", "ended")), true);
  });

  it("al menos una pista viva: vivo", () => {
    assert.equal(isMicDead(streamWith("ended", "live")), false);
  });
});
```

Run: `node --test tests/micHealth.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/micHealth.ts'`.

- [ ] **Step 2: Implementar `micHealth.ts`**

```ts
export interface AudioTrackLike {
  readyState: string;
}

export interface AudioStreamLike {
  getAudioTracks(): AudioTrackLike[];
}

/** true si no hay stream o todas sus pistas de audio terminaron (llamada, Siri, permiso
 * revocado). Un turno "listening" con un stream muerto no puede cerrarse solo: "Detener
 * grabación" no hace nada porque no hay grabador activo. */
export function isMicDead(stream: AudioStreamLike | null): boolean {
  if (!stream) return true;
  const tracks = stream.getAudioTracks();
  return tracks.length === 0 || tracks.every((t) => t.readyState === "ended");
}
```

Run: `node --test tests/micHealth.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 3: Cablear en `page.tsx`**

1. Después de `import { useWakeLock } from "#lib/useWakeLock";` añadir:

```ts
import { isMicDead } from "#lib/micHealth";
```

2. Junto a las demás constantes de módulo (después de `const STORAGE_MODE_KEY = "whisper_pwa_mode";`) añadir:

```ts
const MIC_LOST_MESSAGE = "Se interrumpió el micrófono. Di «Hablar en Español» para continuar.";
```

3. Después de `useWakeLock(convState.sessionId !== null);` añadir:

```ts
  // Espejo del estado para handlers de eventos del documento (sin re-suscribirlos).
  const convStateRef = useRef(convState);
  convStateRef.current = convState;
```

4. Justo después de la definición de `cancelTurnIO` (Task 3) añadir:

```ts
  // Un turno con el micro perdido se descarta y la máquina vuelve a un estado accionable.
  const failMic = useCallback(() => {
    cancelTurnIO();
    setConvAudioStream(null);
    setConvTurnSeconds(0);
    dispatchConv({ type: "FAIL_TURN", error: MIC_LOST_MESSAGE });
  }, [cancelTurnIO]);

  // Vigilante 1: la pista de audio termina sola (llamada, Siri, permiso revocado).
  useEffect(() => {
    if (!convAudioStream) return;
    const tracks = convAudioStream.getAudioTracks();
    tracks.forEach((t) => t.addEventListener("ended", failMic));
    return () => tracks.forEach((t) => t.removeEventListener("ended", failMic));
  }, [convAudioStream, failMic]);

  // Vigilante 2: al volver a primer plano con un turno "listening" y el micro muerto.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const s = convStateRef.current;
      const listening = s.es === "listening" || s.ja === "listening";
      if (listening && isMicDead(convAudioStreamRef.current)) failMic();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [failMic]);

```

- [ ] **Step 4: Verificar y commit**

Run: `npm test && npx tsc --noEmit --incremental false`
Expected: todo pasa. `convAudioStreamRef` ya existe en `page.tsx` (se declara antes que estos efectos); si `tsc` protesta por uso antes de declaración, mover estos bloques debajo de esa declaración.

```bash
git add translator-pwa/src/lib/micHealth.ts translator-pwa/tests/micHealth.test.mjs translator-pwa/src/app/page.tsx
git commit -m "fix: vigilar el micro para no dejar el turno colgado en listening" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Documentación y verificación final

**Files:**
- Modify: `docs/CONTEXT.md` (sección "Gestos" y "Reglas duras")

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: glosario coherente con el comportamiento nuevo.

- [ ] **Step 1: Buscar referencias obsoletas**

Run (desde la raíz del repo): `grep -rniE "long-press|tap largo|doble tap|pasar al otro lado|cancelar este turno|menú del orbe|OrbContextMenu" docs translator-pwa/README.md translator-pwa/MASTER.md README.md`
Expected: aparecen `docs/CONTEXT.md` y posiblemente `docs/adr/0001-conversation-mode.md`, planes y specs históricos. **No** editar specs/planes anteriores (son registro histórico). Sí corregir `docs/CONTEXT.md` y, si contradice, el ADR vigente añadiendo una nota fechada al final en vez de reescribirlo.

- [ ] **Step 2: Actualizar `docs/CONTEXT.md`**

Reemplazar la sección `## Gestos (modo conversación)` completa por:

```markdown
## Controles (modo conversación)

Todo es un toque simple, sin pulsaciones largas ni dobles toques, para que Control por voz de iOS ("toca …") pueda activar cualquier acción.

- **Tap en orbe inactivo** (con `activeSide = null`): abre el micro de ese lado. Nombre accesible: "Hablar en Español" / "Hablar en Japonés".
- **Tap en orbe escuchando**: cierra el turno y envía el audio. Nombre accesible: "Detener grabación".
- **Botón "Cancelar turno"**: visible mientras hay un lado activo. Descarta el audio (no se envía ni se reproduce), aborta la petición en vuelo y la voz, y devuelve el lado a `idle`.
- **Orbe procesando o hablando**: solo informativo ("Traduciendo, espera" / "Reproduciendo traducción").
- **Cambio de modo** (segmented control): sale de la sesión. Cancela TTS, cierra micro, limpia timers. Historial se preserva.
```

Y en `## Reglas duras`, reemplazar la línea de RMS y añadir dos:

```markdown
- **RMS threshold**: -45 dBFS para considerar "hay voz". Por debajo durante >3000ms (`CONVERSATION_CONSTANTS.SILENCE_MS`) → cerrar turno. Aplica en conversación y en modo single.
- **Fallo de turno** (`FAIL_TURN`): un error de red/API, un timeout (25 s) o un micro perdido devuelven el lado activo a `idle` con un mensaje de error. Nunca se deja un lado en `processing` o `listening` sin salida.
- **Wake Lock**: la pantalla se mantiene encendida mientras `sessionId !== null`.
```

- [ ] **Step 3: Verificación completa**

Run: `npm test && npx tsc --noEmit --incremental false && npm run build`
Expected: todos los tests pasan (107 previos + los nuevos), `tsc` sin salida, `next build` termina sin errores. Si `build` falla por variables de entorno ausentes (`GEMINI_API_KEY`, `ACCESS_PASSWORD`) y no por el código, anotarlo en el resumen final sin ocultarlo.

- [ ] **Step 4: Commit**

```bash
git add docs/CONTEXT.md
git commit -m "docs: glosario de controles sin gestos largos y reglas de fallo de turno" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Lista de comprobación en iPhone real (no delegable)**

Activar "Mostrar nombres" de Control por voz y comprobar, con la PWA instalada:

1. Estado inicial: orbe libre → "Hablar en Español"; tras abrirlo, "Detener grabación". Decir "toca detener grabación" cierra el turno.
2. **P0-3:** decir una frase y terminar con "toca detener grabación". La traducción **no** debe contener la orden. Repetir en modo "Una frase" sin decir nada: debe cerrar solo a los 3 s de silencio.
3. **P0-1:** activar modo avión, hablar y callar. Debe aparecer el error y, sin tocar nada más, "toca hablar en español" debe funcionar. Repetir con la red bloqueada a mitad (debe caer en 25 s).
4. **P0-2:** empezar a hablar y decir "toca cancelar turno": no debe traducirse ni oírse nada. Repetir durante "Traduciendo, espera" y durante "Reproduciendo traducción".
5. **P0-2:** decir "toca salir" con el micro abierto: no debe traducirse ni reproducirse nada.
6. **P0-4:** dejar el iPhone quieto durante la conversación más tiempo que el auto-bloqueo configurado: la pantalla no debe apagarse.
7. **P0-4:** con el micro abierto, provocar una interrupción (Siri o una llamada) y volver: debe aparecer "Se interrumpió el micrófono…" y poder retomarse por voz. Si el turno sigue colgado, aplicar la nota de `mute` de Task 7.
8. Emergencia: abrir la hoja, entrar en una frase en grande y comprobar que la pantalla sigue encendida (ahora vía `useWakeLock`).

Lo que no se pruebe aquí queda documentado como pendiente, no como hecho.

---

## Self-Review

**Cobertura de la auditoría (P0):**
- P0-1 → Task 1 (`FAIL_TURN`), Task 2 (timeout, 401 legible), Task 3 (cableado del `catch` y vacío), Task 4 (etiquetas naturales).
- P0-2 → Task 3 (cancelación real vía WeakSet + `AbortController`, también en Salir y desmontaje), Task 4 (menú y botón inerte eliminados).
- P0-3 → Task 5 (prompt + silencio en single).
- P0-4 → Task 6 (Wake Lock), Task 7 (vigilante de micro).
- P0-5 → Task 4 (botón "Cancelar turno", sin gestos largos).

**Escaneo de placeholders:** sin "TBD", "similar a Task N" ni pasos sin código. Los reemplazos de `page.tsx` citan el texto viejo exacto o un ancla única.

**Consistencia de tipos y nombres:** `FAIL_TURN` (T1) se usa en T3 y T7. `postTranslate({ signal })` (T2) se usa en T3. `cancelTurnIO`/`handleConvCancelTurn` (T3) se usan en T4 y T7. `classifyRecorderStop({ cancelled, blobSize })` coincide en T3 (test, módulo y uso). `getOrbAccessibleLabel({ side, stateValue, activeSide })` coincide en T4 (test, módulo y `Orb`). `createWakeLock` → `{ enable, disable, onVisible }` coincide en test, módulo y hook. `isMicDead` coincide en test, módulo y `page.tsx`. `MIC_LOST_MESSAGE` se define y usa en T7.

**Riesgos conocidos, no ocultos:**
- El prompt (T5) no puede demostrarse sin audio real; queda en la lista de iPhone.
- Wake Lock en PWA instalada de iOS tuvo fallos hasta iOS 18.4; degrada en silencio.
- El vigilante no cubre `mute` (ver nota de T7).
- Los cambios de `page.tsx` no tienen test unitario: la lógica decisoria está extraída y testeada, el cableado se cubre con `tsc` y la lista manual.
