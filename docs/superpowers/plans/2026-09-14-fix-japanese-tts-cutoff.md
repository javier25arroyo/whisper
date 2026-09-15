# Corregir Corte de TTS en Japonés (Modo Conversación) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que las traducciones habladas en japonés (modo conversación) se reproduzcan completas, terminando el turno por el evento real de fin de síntesis de voz (`onend`/`onerror`) en vez de por un temporizador calibrado para español, y eliminando el `speechSynthesis.cancel()` que hoy corta el audio en código cada vez que se abre un nuevo micro.

**Architecture:** Dos funciones puras nuevas (techo de seguridad por idioma, filtro de errores de cancelación propia) extraídas a `src/lib/ttsTurn.ts` con tests — mismo patrón que `silenceDetection.ts`/`orbLabel.ts`. El resto es cableado en `page.tsx`: `speak()` gana una referencia viva a la utterance, un token de turno y un callback `onDone`; el turno de conversación avanza desde ese callback (con el techo solo como red de seguridad); se elimina el `cancel()` oculto en la limpieza ligada a `[convAudioStream]`; y se bloquea la repetición de la última traducción mientras un lado esté escuchando o procesando.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, `node --test` (sin frameworks), imports relativos con extensión `.ts` explícita.

**Spec:** No existe un documento de spec separado — este plan nace de un diagnóstico de causa raíz (tres investigadores independientes: rastreo de código con cuantificación, investigación web sobre iOS/Safari/SpeechSynthesis, y un escéptico que buscó causas alternativas; verificado por dos revisores adversariales independientes que intentaron refutarlo y no lo lograron). El resumen de causa raíz está más abajo, en este mismo documento.

## Resumen de Causa Raíz

Síntoma reportado: al hablar en español, las frases traducidas al japonés no se terminan de escuchar (el texto en pantalla sí está completo).

Mecanismo confirmado, dos defectos que actúan juntos:

1. **El único mecanismo que cierra un turno de TTS en modo conversación es un temporizador**, no el fin real del habla: `Math.max(1500, translation.length * 80)` ms ([page.tsx:541](../../../translator-pwa/src/app/page.tsx#L541)). `utterance.onend`/`onerror` solo limpian `speakingKey` ([page.tsx:241-246](../../../translator-pwa/src/app/page.tsx#L241-L246)), que la UI de conversación nunca lee. 80ms/carácter es razonable para español (≈2.5-3 caracteres por sílaba) pero cubre solo un 36-50% de la duración real de una voz TTS en japonés a `rate 0.92` (kanji/kana necesitan ≈165-220ms/carácter, lectura NHK ≈300-400 caracteres/min). Por eso solo se corta el japonés, nunca el español.
2. **La app cancela su propio TTS en código.** Cuando el temporizador dispara, llama a `openConvMic(targetLang)`, que hace `setConvAudioStream(stream)` ([page.tsx:420](../../../translator-pwa/src/app/page.tsx#L420)). Ese estado es dependencia de un `useEffect` cuya función de limpieza llama incondicionalmente a `window.speechSynthesis.cancel()` ([page.tsx:163-201](../../../translator-pwa/src/app/page.tsx#L163-L201), `cancel()` en la línea 166/197). Al cambiar `convAudioStream`, React ejecuta esa limpieza antes de re-ejecutar el efecto, así que la voz japonesa se corta de forma determinista — en cualquier navegador, no solo por el "ducking" de audio que iOS aplica al activar `getUserMedia` (efecto real mencionado en la investigación, pero secundario a este).

Ambos revisores adversariales, releyendo el código ellos mismos, confirmaron el mecanismo exacto y no encontraron causa alternativa que explique el patrón (afecta solo al japonés, solo en modo conversación, con el texto en pantalla íntegro). Se descartó explícitamente: truncamiento del LLM (produciría un error 422 visible, nunca una traducción más corta — verificado ejecutando `parseTranslationJson` contra respuestas truncadas), recorte visual en CSS (`truncate` solo existe en filas de historial colapsado, no en la tarjeta principal), y corte de la grabación de entrada (afectaría a ambos idiomas por igual).

## Global Constraints

- Imports relativos con extensión `.ts` explícita cuando importan al menos un valor en tiempo de ejecución. Los imports `#lib/*` y los `type`-only puros no la necesitan.
- Sin dependencias nuevas. Tests con `node:test` + `node:assert/strict`, mismo estilo que `tests/silenceDetection.test.mjs` (`describe`/`it`, imports relativos `../src/lib/<archivo>.ts`).
- No modificar `SILENCE_MS`, `HARD_LIMIT_SECONDS`, `SOFT_LIMIT_SECONDS`, `POST_TURN_PAUSE_MS` — ya correctos, fuera de alcance de este bug.
- El técho de seguridad (`estimateSpeechCeilingMs`) es una **red de seguridad**, no el mecanismo principal: el turno debe cerrar por `onend`/`onerror` real siempre que el navegador lo dispare. El techo solo cubre el caso en que ese evento nunca llega.
- Aplicar el arreglo de forma simétrica a `es` y `ja` (el defecto es arquitectónico — temporizador desacoplado del fin real + `cancel()` oculto —, no una constante mal calibrada solo para japonés).

## Fuera de Alcance

Hallazgos colaterales de la investigación, reales pero no parte de este bug — no tocar en este plan:

- **Primer turno de una sesión de conversación nunca crea `MediaRecorder`**: `ENTER_CONVERSATION` pone `es` en `listening` antes de que exista el stream, y el efecto que crea el grabador no depende de `convAudioStream`. Confirmado por lectura de código, no en dispositivo. Bug real, plan aparte.
- **Fuga de stream para usuarios cuyo modo guardado es `single`**: el efecto de auto-arranque puede iniciar `getUserMedia` para conversación antes de aplicar el modo persistido. Bug real, plan aparte.
- **Corte de entrada por `SILENCE_MS`**: el detector de silencio tiene un techo conocido y ya documentado (`silenceDetection.ts:71-73`) que no se toca aquí.
- **`navigator.audioSession` (Safari 16.4+)** para forzar categoría `playback` antes de hablar: mejora opcional sin fuente que confirme que sea necesaria una vez que el micro solo se abre tras `onend`. No se añade.
- **Retraso artificial entre `cancel()` y `speak()`** para el bug de Safari pre-27 (una utterance nueva encolada justo tras un `cancel()` puede perderse en algunas versiones de iOS): no se añade un hack de temporización. La red de seguridad (Task 1/3) ya cubre ese caso — si la utterance se pierde, el techo cierra el turno igual, solo que por el camino de seguridad en vez del ideal.
- **Fragmentar el TTS por frases** (mitigación documentada para el corte a los ~15s de las voces "Google" de Chrome/Android): no hay evidencia de que las traducciones de esta app lleguen a esa duración: siguiente paso si se confirma en dispositivo Android.

---

### Task 1: Funciones puras de temporización y decisión del turno TTS + tests

**Files:**
- Create: `translator-pwa/src/lib/ttsTurn.ts`
- Test: `translator-pwa/tests/ttsTurn.test.mjs`

**Interfaces:**
- Consumes: `SupportedLanguage` de `./translator.ts` (type-only).
- Produces: `estimateSpeechCeilingMs(text, lang)`, `shouldAdvanceOnSpeechError(errorCode)` — usadas por Task 2 y Task 3 en `page.tsx`.

- [ ] **Step 1: Escribir los tests (deben fallar: el archivo fuente aún no existe)**

```js
// translator-pwa/tests/ttsTurn.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { estimateSpeechCeilingMs, shouldAdvanceOnSpeechError } from "../src/lib/ttsTurn.ts";

describe("estimateSpeechCeilingMs", () => {
  it("da más tiempo por carácter al japonés que al español", () => {
    const text = "こんにちは、元気ですか？";
    assert.ok(estimateSpeechCeilingMs(text, "ja") > estimateSpeechCeilingMs(text, "es"));
  });

  it("cubre el caso que causaba el corte: una frase japonesa de emergencia de 40 caracteres necesita más de 8000ms", () => {
    const text = "すみません、胸がとても痛くて、息が苦しいです。すぐに救急車を呼んでください。".slice(0, 40);
    assert.equal(text.length, 40);
    assert.ok(estimateSpeechCeilingMs(text, "ja") >= 8000);
  });

  it("respeta el piso mínimo para textos cortos", () => {
    assert.equal(estimateSpeechCeilingMs("Sí", "es"), 1200);
    assert.equal(estimateSpeechCeilingMs("はい", "ja"), 1500);
  });

  it("crece con la longitud del texto", () => {
    const short = estimateSpeechCeilingMs("こんにちは", "ja");
    const long = estimateSpeechCeilingMs("こんにちは".repeat(10), "ja");
    assert.ok(long > short);
  });
});

describe("shouldAdvanceOnSpeechError", () => {
  it("ignora 'canceled' e 'interrupted': son cancelaciones de la propia app, no fallos reales", () => {
    assert.equal(shouldAdvanceOnSpeechError("canceled"), false);
    assert.equal(shouldAdvanceOnSpeechError("interrupted"), false);
  });

  it("avanza el turno ante cualquier otro error real", () => {
    assert.equal(shouldAdvanceOnSpeechError("synthesis-failed"), true);
    assert.equal(shouldAdvanceOnSpeechError("audio-busy"), true);
    assert.equal(shouldAdvanceOnSpeechError("network"), true);
    assert.equal(shouldAdvanceOnSpeechError(""), true);
  });
});
```

- [ ] **Step 2: Ejecutar los tests y confirmar que fallan (módulo inexistente)**

Run: `cd translator-pwa && node --test tests/ttsTurn.test.mjs`
Expected: FAIL — no se puede resolver `../src/lib/ttsTurn.ts`.

- [ ] **Step 3: Escribir la implementación**

```ts
// translator-pwa/src/lib/ttsTurn.ts
import type { SupportedLanguage } from "./translator.ts";

/**
 * Techo de seguridad (ms) para el fin de una alocución TTS en modo conversación,
 * usado SOLO si `onend`/`onerror` de SpeechSynthesisUtterance nunca disparan (bug
 * conocido de iOS/Safari: la utterance puede perderse si el motor la recolecta, o
 * el dispositivo simplemente no emite el evento). NUNCA es el mecanismo principal:
 * el turno real termina en `onend`; este valor solo evita que la conversación se
 * quede colgada en 'speaking' para siempre.
 *
 * Calibrado por idioma porque el japonés (kanji/kana) necesita bastante más tiempo
 * por carácter que el español en voz TTS (lectura NHK ≈300-400 caracteres/min ≈
 * 150-200ms/carácter a velocidad 1.0; a rate 0.92 sube a ≈165-220ms/carácter). Se
 * deja margen generoso a propósito: es un techo de seguridad, no una estimación
 * ajustada — el bug original era precisamente un techo demasiado corto (80ms/carácter,
 * calibrado para español) que cerraba el turno japonés a mitad de frase.
 */
export function estimateSpeechCeilingMs(text: string, lang: SupportedLanguage): number {
  const perCharMs = lang === "ja" ? 250 : 120;
  const floorMs = lang === "ja" ? 1500 : 1200;
  return Math.max(floorMs, text.length * perCharMs);
}

/**
 * Decide si un evento `onerror` de SpeechSynthesisUtterance debe hacer avanzar el
 * turno de conversación (cerrar 'speaking', reabrir el micro opuesto) o ignorarse.
 *
 * Se ignora cuando el error es 'canceled' o 'interrupted': significa que la propia
 * app canceló el habla (salir de la conversación, abortar turno, una nueva síntesis
 * reemplazando la anterior) — no que la síntesis fallara de verdad. Desde iOS 14,
 * Safari dispara `onerror` (no `onend`) cuando `speechSynthesis.cancel()` corta una
 * utterance en curso, así que sin este filtro cualquier cancelación de la propia app
 * reabriría el micro que el usuario acaba de cerrar.
 */
export function shouldAdvanceOnSpeechError(errorCode: string): boolean {
  return errorCode !== "canceled" && errorCode !== "interrupted";
}
```

- [ ] **Step 4: Ejecutar los tests y confirmar que pasan**

Run: `cd translator-pwa && node --test tests/ttsTurn.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add translator-pwa/src/lib/ttsTurn.ts translator-pwa/tests/ttsTurn.test.mjs
git commit -m "feat: funciones puras de techo de seguridad TTS y filtro de errores de cancelacion"
```

---

### Task 2: `speak()` retiene la utterance viva y expone un callback `onDone` real

**Files:**
- Modify: `translator-pwa/src/app/page.tsx:125-129` (refs), `translator-pwa/src/app/page.tsx:216-250` (`speak`)

**Interfaces:**
- Consumes: `shouldAdvanceOnSpeechError` de `#lib/ttsTurn` (Task 1).
- Produces: `speak(text, lang, keyId?, onDone?)` donde `onDone?: (info: { finished: boolean }) => void` — `finished: true` en `onend` real, `finished: false` en un error real (no cancelación propia). Usado por Task 3 (turno de conversación) y Task 5 (bloqueo de repetición, sin cambios en su firma).

- [ ] **Step 1: Añadir el import y las refs nuevas**

Modificar el bloque de imports (línea 1-12) para incluir `shouldAdvanceOnSpeechError`:

```ts
import {
  initialConversationState,
  conversationReducer,
  oppositeOfActive,
  CONVERSATION_CONSTANTS,
} from "#lib/conversationMachine";
import { shouldAdvanceOnSpeechError } from "#lib/ttsTurn";
```

Añadir, junto a las demás refs de conversación (tras la línea `const mediaRecorderRef = useRef<MediaRecorder | null>(null);` tal como existe hoy en la línea 125), dos refs nuevas:

```ts
  // Utterance TTS en curso: mantenerla referenciada evita que Safari/Chrome la
  // recolecten antes de que dispare onend (bug documentado de ambos motores).
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  // Token de turno: si llega un onend/onerror tardío de una utterance ya
  // reemplazada por una más nueva, se ignora.
  const speechTurnTokenRef = useRef(0);
```

- [ ] **Step 2: Reemplazar el cuerpo de `speak()` (líneas 216-250) por**

```ts
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
```

- [ ] **Step 3: Ejecutar la suite completa (regresión — page.tsx no tiene tests propios, pero no debe romper nada existente)**

Run: `cd translator-pwa && npm test`
Expected: PASS, 101+ tests (los mismos que antes, ninguno toca `page.tsx` directamente).

- [ ] **Step 4: Commit**

```bash
git add translator-pwa/src/app/page.tsx
git commit -m "feat: speak() retiene la utterance viva y expone onDone real via onend/onerror"
```

---

### Task 3: El turno de conversación avanza por `onend` real; el temporizador pasa a ser red de seguridad

**Files:**
- Modify: `translator-pwa/src/app/page.tsx:530-550`

**Interfaces:**
- Consumes: `speak(..., onDone)` (Task 2), `estimateSpeechCeilingMs` de `#lib/ttsTurn` (Task 1).
- Produces: nada nuevo expuesto — cierra el ciclo del turno de conversación.

- [ ] **Step 1: Añadir el import que falta**

Ampliar el import de Task 2 (ya en el archivo) para incluir también `estimateSpeechCeilingMs`:

```ts
import { estimateSpeechCeilingMs, shouldAdvanceOnSpeechError } from "#lib/ttsTurn";
```

- [ ] **Step 2: Reemplazar el bloque `if (autoSpeak) { ... }` (líneas 530-550) por**

```ts
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

          speak(translation, targetLang, `conv-${targetLang}`, () => finishTurn());

          // Red de seguridad: solo actúa si onend/onerror nunca dispararon.
          convSpeakingDoneTimerRef.current = setTimeout(
            finishTurn,
            estimateSpeechCeilingMs(translation, targetLang)
          );
        }
```

- [ ] **Step 3: Ejecutar la suite completa**

Run: `cd translator-pwa && npm test`
Expected: PASS, mismos tests que Task 2.

- [ ] **Step 4: Commit**

```bash
git add translator-pwa/src/app/page.tsx
git commit -m "fix: el turno de conversacion cierra por fin real de TTS, no por temporizador de 80ms/caracter"
```

---

### Task 4: Quitar el `cancel()` oculto de la limpieza ligada a `[convAudioStream]`

**Files:**
- Modify: `translator-pwa/src/app/page.tsx:162-201`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada nuevo expuesto — separa una limpieza de solo-montaje de un efecto de sincronización de ref.

- [ ] **Step 1: Reemplazar el efecto de las líneas 162-201 por dos efectos**

```ts
  // Ref con el stream de conversación actual, para que la limpieza de solo-montaje
  // de abajo pueda parar sus pistas al desmontar/cerrar pestaña sin depender de
  // convAudioStream (y sin re-ejecutarse — y sin cancelar TTS — en cada cambio).
  const convAudioStreamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    convAudioStreamRef.current = convAudioStream;
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
```

- [ ] **Step 2: Ejecutar la suite completa**

Run: `cd translator-pwa && npm test`
Expected: PASS, mismos tests que Task 3.

- [ ] **Step 3: Commit**

```bash
git add translator-pwa/src/app/page.tsx
git commit -m "fix: no cancelar TTS en cada cambio de convAudioStream, solo al desmontar/salir"
```

---

### Task 5: Bloquear "Reproducir última traducción" mientras un lado esté escuchando o procesando

**Files:**
- Modify: `translator-pwa/src/app/page.tsx:701-706` (`handlePlayLastConv`)
- Modify: `translator-pwa/src/app/ConversationView.tsx:392-425` (`LastTranslation`), `translator-pwa/src/app/ConversationView.tsx:546-551` (uso en `ConversationView`)

**Interfaces:**
- Consumes: `ConversationState` (ya existente).
- Produces: nada nuevo expuesto — evita que la repetición reproduzca TTS sobre un micro abierto (turno fantasma: la voz reproducida es captada por el micro del otro lado, se envía a Gemini y crea una traducción falsa — regla "Micro cerrado durante speaking" de [docs/CONTEXT.md](../../CONTEXT.md)).

- [ ] **Step 1: Guardar la reproducción en `handlePlayLastConv` (líneas 701-706)**

```ts
  const handlePlayLastConv = useCallback(() => {
    if (!convState.lastTranslation || !convState.lastDetectedLanguage) return;
    // No reproducir sobre un micro abierto: la voz sería captada por el otro
    // lado y crearía un turno traducido fantasma (docs/CONTEXT.md: "Micro
    // cerrado durante speaking").
    const aSideIsBusy =
      convState.es === "listening" ||
      convState.es === "processing" ||
      convState.ja === "listening" ||
      convState.ja === "processing";
    if (aSideIsBusy) return;
    const targetLang: SupportedLanguage =
      convState.lastDetectedLanguage === "es" ? "ja" : "es";
    speak(convState.lastTranslation, targetLang, "conv-last");
  }, [convState.lastTranslation, convState.lastDetectedLanguage, convState.es, convState.ja, speak]);
```

- [ ] **Step 2: Calcular el mismo guard donde se renderiza `ConversationView` y pasarlo a `LastTranslation`**

En `translator-pwa/src/app/ConversationView.tsx`, modificar la firma de `LastTranslation` (línea 392-399) para aceptar `disabled`:

```tsx
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
```

Y su botón (línea 413-420):

```tsx
        <button
          type="button"
          aria-label="Reproducir última traducción"
          onClick={onPlay}
          disabled={disabled}
          className={`w-7 h-7 rounded-md ${accent.bgFaded} hover:opacity-80 ${accent.text} flex items-center justify-center transition-colors duration-base disabled:opacity-40 disabled:cursor-not-allowed`}
        >
```

Y su uso dentro de `ConversationView` (línea 546-551):

```tsx
      {/* Última traducción */}
      <LastTranslation
        text={state.lastTranslation}
        detected={state.lastDetectedLanguage}
        onPlay={onPlayLastTranslation}
        disabled={
          state.es === "listening" ||
          state.es === "processing" ||
          state.ja === "listening" ||
          state.ja === "processing"
        }
      />
```

- [ ] **Step 3: Ejecutar la suite completa**

Run: `cd translator-pwa && npm test`
Expected: PASS, mismos tests que Task 4.

- [ ] **Step 4: Commit**

```bash
git add translator-pwa/src/app/page.tsx translator-pwa/src/app/ConversationView.tsx
git commit -m "fix: bloquear repetir ultima traduccion mientras un lado escucha o procesa"
```

---

### Task 6: Verificación final — regresión completa + comprobación manual en navegador + guía de validación en iPhone real

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Suite completa**

Run: `cd translator-pwa && npm test`
Expected: PASS, todos los tests (los 101 preexistentes + los 8 de Task 1).

- [ ] **Step 2: Comprobación en navegador (DOM real, sin depender de Control por voz)**

Usar `preview_start` con el dev server, entrar en modo Conversación, forzar (via ajustes) una respuesta con traducción japonesa larga (≥35 caracteres — por ejemplo pedir "Disculpe, me duele mucho el pecho y me cuesta respirar, llame a una ambulancia por favor" en español) y confirmar con `read_console_messages`/observación:
- La voz japonesa se reproduce completa (no se corta a mitad de frase).
- El orbe JA pasa de "Reproduciendo…" a "En espera" solo después de que el audio termina, no ~1-3s antes.
- El micro del lado opuesto no se abre (no aparece el indicador de grabación del navegador) hasta que el audio termina.
- Botón "Reproducir última traducción" aparece deshabilitado mientras un lado está escuchando/procesando, y funciona con normalidad cuando ambos lados están `idle`.

- [ ] **Step 3: Validación real en iPhone (no delegable — ver spec previa [2026-09-09-hands-free-accessibility-design.md §6.3](../specs/2026-09-09-hands-free-accessibility-design.md))**

- Una conversación completa hablando en español con una frase que genere una traducción japonesa larga (2 oraciones): confirmar que se escucha entera antes de que el orbe JA cambie a "Escuchando…".
- Repetir con Control por voz activo, sin tocar la pantalla.
- Confirmar que no aparece ningún turno traducido "fantasma" (una traducción JA→ES que nadie dijo) tras una respuesta larga — señal de que el micro se abrió mientras el TTS aún sonaba y lo capturó.
- Probar "Reproducir última traducción" justo después de un turno, y confirmar que si el otro lado ya está escuchando, el botón no hace nada (no crea un turno fantasma).

- [ ] **Step 4: Commit final si Step 2/3 revelan ajustes menores**

Si la validación en dispositivo exige tocar `estimateSpeechCeilingMs` (por ejemplo, la voz japonesa real resulta más lenta o más rápida de lo estimado por la investigación), ajustar `perCharMs`/`floorMs` en `translator-pwa/src/lib/ttsTurn.ts`, re-ejecutar `npm test`, y:

```bash
git add translator-pwa/src/lib/ttsTurn.ts
git commit -m "fix: recalibrar techo de seguridad TTS japones segun medicion en dispositivo real"
```

---

## Self-Review

**Cobertura de la causa raíz:** Task 1 corrige el techo de seguridad mal calibrado (defecto 1). Task 2+3 mueven el cierre del turno al evento real (`onend`/`onerror`), eliminando la dependencia del temporizador como mecanismo principal. Task 4 elimina el `cancel()` oculto (defecto 2, la causa determinista). Task 5 cierra el riesgo de turno fantasma que Task 2-4 habilitan (antes, el `cancel()` cortaba la repetición también, enmascarando el problema). Task 6 verifica en los tres niveles que la spec previa del proyecto ya establece como necesarios para esta clase de bug (automatizado, DOM real, dispositivo real).

**Placeholders:** ninguno — cada step tiene código completo, sin "TBD" ni "similar a Task N".

**Consistencia de tipos:** `onDone?: (info: { finished: boolean }) => void` se define en Task 2 y se usa igual en Task 3 (`() => finishTurn()`, ignora `finished` porque tanto fin normal como error real deben avanzar el turno — silenciar un error real dejaría la conversación colgada). `estimateSpeechCeilingMs(text, lang)` y `shouldAdvanceOnSpeechError(errorCode)` se definen en Task 1 con las firmas exactas que Task 2/3 importan y llaman.
