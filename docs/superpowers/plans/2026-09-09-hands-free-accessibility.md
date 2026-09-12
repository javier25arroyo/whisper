# Grabación Sin Corte Prematuro y Accesibilidad Manos Libres — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir el corte prematuro de grabación (marca de tiempo obsoleta + umbral corto) y hacer que el modo conversación sea 100% operable con Control por voz de iOS, renombrando los controles existentes a órdenes que una persona diría en voz alta.

**Architecture:** Dos correcciones de lógica pura (detección de silencio, etiqueta accesible del orbe) extraídas a funciones testeables sin dependencias del DOM/Web Audio, más el cableado de esas funciones en los hooks/componentes existentes y tres correcciones puntuales de `aria-label` en controles ya funcionales. No se añaden dependencias, no se cambia la estructura de interacción (el menú del orbe ya es accesible).

**Tech Stack:** Next.js 15 / React 19 / TypeScript, `node --test` (sin frameworks), imports relativos con extensión `.ts` explícita (excepto imports `#lib/*` y type-only).

**Spec:** [docs/superpowers/specs/2026-09-09-hands-free-accessibility-design.md](../specs/2026-09-09-hands-free-accessibility-design.md)

## Global Constraints

- Imports relativos con extensión `.ts` explícita cuando importan al menos un valor en tiempo de ejecución (p. ej. `from "./silenceDetection.ts"`). Los imports `type`-only puros pueden omitirla. Los imports `#lib/*` nunca la necesitan (ya resuelto por `package.json#imports`).
- Sin dependencias nuevas. Tests con `node:test` + `node:assert/strict`, mismo estilo que `tests/wavEncoder.test.mjs` y `tests/conversationMachine.test.mjs` (`describe`/`it`, imports relativos `../src/lib/<archivo>.ts`).
- `SILENCE_MS` es una constante fija de `3000` en `CONVERSATION_CONSTANTS` — sin control deslizante, sin configuración de usuario (YAGNI, decisión explícita del spec §3.2).
- Los textos accesibles nuevos son exactamente los de las tablas del spec (§4.3 y §5) — no parafrasear.
- No tocar `HARD_LIMIT_SECONDS`, `SOFT_LIMIT_SECONDS`, `POST_TURN_PAUSE_MS`, ni la estructura del menú contextual del orbe (`OrbContextMenu`) — ya cumplen, fuera de alcance por spec §7.

---

### Task 1: Función pura de detección de silencio + tests

**Files:**
- Create: `translator-pwa/src/lib/silenceDetection.ts`
- Test: `translator-pwa/tests/silenceDetection.test.mjs`

**Interfaces:**
- Consumes: nada (función pura, sin dependencias del proyecto).
- Produces: `stepSilenceDetection(state, rms, now, params)`, `initialSilenceDetectionState`, tipos `SilenceDetectionState`, `SilenceDetectionParams`, `SilenceDetectionEvents`, `SilenceDetectionResult` — usados por Task 2 (`useSilenceDetector.ts`).

- [ ] **Step 1: Escribir el archivo de la función pura**

```ts
// translator-pwa/src/lib/silenceDetection.ts

/**
 * Estado interno del detector de silencio, independiente de Web Audio API.
 * Separado de useSilenceDetector para poder testear la lógica sin AudioContext
 * ni requestAnimationFrame.
 */
export interface SilenceDetectionState {
  /** Marca de tiempo del primer frame de sonido consecutivo, o null si no hay racha en curso. */
  firstSoundTs: number | null;
  /** Marca de tiempo del último frame de sonido confirmado (tras soundStartMs). 0 si no hay sonido confirmado. */
  lastSoundTs: number;
  /** true si la racha de sonido actual ya superó soundStartMs (sonido "confirmado"). */
  hasSound: boolean;
}

export interface SilenceDetectionParams {
  /** Umbral RMS por debajo del cual se considera silencio. */
  threshold: number;
  /** Milisegundos continuos de silencio real (desde el último sonido confirmado) para disparar `silence`. */
  silenceMs: number;
  /** Milisegundos de sonido continuo para confirmar el inicio de sonido y disparar `soundStart`. */
  soundStartMs: number;
}

export interface SilenceDetectionEvents {
  soundStart: boolean;
  silence: boolean;
}

export interface SilenceDetectionResult {
  state: SilenceDetectionState;
  events: SilenceDetectionEvents;
}

export const initialSilenceDetectionState: SilenceDetectionState = {
  firstSoundTs: null,
  lastSoundTs: 0,
  hasSound: false,
};

/**
 * Avanza la máquina de detección de silencio un frame (una muestra RMS).
 * Función pura: sin efectos secundarios, sin acceso al reloj real (recibe `now`
 * como parámetro) para poder testearla con secuencias de muestras sintéticas.
 */
export function stepSilenceDetection(
  state: SilenceDetectionState,
  rms: number,
  now: number,
  params: SilenceDetectionParams
): SilenceDetectionResult {
  const isSound = rms >= params.threshold;
  let { firstSoundTs, lastSoundTs, hasSound } = state;
  let soundStart = false;
  let silence = false;

  if (isSound) {
    if (firstSoundTs === null) {
      firstSoundTs = now;
    } else if (now - firstSoundTs >= params.soundStartMs && !hasSound) {
      hasSound = true;
      soundStart = true;
    }
    // Refrescar la marca de "último sonido" en cada frame de sonido confirmado,
    // no sólo al confirmarlo por primera vez — de lo contrario cualquier micro-hueco
    // tras el primer segundo de habla dispara `silence` de inmediato (spec §3.1).
    if (hasSound) {
      lastSoundTs = now;
    }
  } else {
    firstSoundTs = null;
    hasSound = false;
    if (lastSoundTs > 0 && now - lastSoundTs >= params.silenceMs) {
      lastSoundTs = 0;
      silence = true;
    }
  }

  return { state: { firstSoundTs, lastSoundTs, hasSound }, events: { soundStart, silence } };
}
```

- [ ] **Step 2: Escribir los tests (deben fallar primero: el archivo aún no existe salvo por el Step 1 ya escrito — ejecutar igualmente para confirmar que el runner los recoge y que todos los `assert` son correctos)**

```js
// translator-pwa/tests/silenceDetection.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  stepSilenceDetection,
  initialSilenceDetectionState,
} from "../src/lib/silenceDetection.ts";

const PARAMS = { threshold: 0.01, silenceMs: 700, soundStartMs: 100 };

function run(frames, params = PARAMS) {
  let state = initialSilenceDetectionState;
  const log = [];
  for (const [t, rms] of frames) {
    const result = stepSilenceDetection(state, rms, t, params);
    state = result.state;
    log.push({ t, ...result.events });
  }
  return log;
}

describe("stepSilenceDetection - caso crítico: micro-hueco en mitad de habla continua", () => {
  it("no dispara `silence` por una sola muestra por debajo del umbral tras el primer segundo hablando", () => {
    const frames = [];
    for (let t = 0; t <= 2000; t += 10) {
      frames.push([t, t === 1000 ? 0 : 0.5]);
    }
    const log = run(frames);
    assert.equal(
      log.some((e) => e.silence),
      false,
      "un micro-hueco de 10ms no debe cerrar el turno"
    );
  });
});

describe("stepSilenceDetection - silencio real", () => {
  it("dispara `soundStart` una vez confirmado el habla, y `silence` exactamente silenceMs después del último sonido", () => {
    const frames = [];
    for (let t = 0; t <= 200; t += 10) frames.push([t, 0.5]); // habla continua 0..200ms
    for (let t = 210; t <= 900; t += 10) frames.push([t, 0]); // silencio real desde 210ms

    const log = run(frames);
    const soundStarts = log.filter((e) => e.soundStart);
    const silences = log.filter((e) => e.silence);

    assert.equal(soundStarts.length, 1);
    assert.equal(soundStarts[0].t, 100, "soundStart tras soundStartMs=100 de habla continua");
    assert.equal(silences.length, 1, "silence debe dispararse exactamente una vez");
    assert.equal(
      silences[0].t,
      900,
      "silence a los silenceMs=700 desde el último sonido confirmado (t=200), no desde el inicio del habla"
    );
  });
});

describe("stepSilenceDetection - ruido bajo el umbral de confirmación", () => {
  it("un pico de sonido más corto que soundStartMs no confirma sonido ni deja rastro para un `silence` posterior", () => {
    const frames = [];
    for (let t = 0; t <= 40; t += 10) frames.push([t, 0.5]); // 50ms de "sonido", nunca llega a soundStartMs=100
    for (let t = 50; t <= 800; t += 10) frames.push([t, 0]); // silencio largo después

    const log = run(frames);
    assert.equal(log.some((e) => e.soundStart), false, "50ms no confirma inicio de sonido");
    assert.equal(
      log.some((e) => e.silence),
      false,
      "sin sonido confirmado no hay `último sonido` desde el que medir silencio"
    );
  });
});
```

- [ ] **Step 3: Ejecutar los tests**

Run: `cd translator-pwa && npm test -- --test-name-pattern="stepSilenceDetection"`
Expected: PASS (3/3). Si el runner del proyecto no soporta ese flag, usar `npm test` completo y confirmar que las 3 nuevas pruebas aparecen en verde.

- [ ] **Step 4: Commit**

```bash
git add translator-pwa/src/lib/silenceDetection.ts translator-pwa/tests/silenceDetection.test.mjs
git commit -m "feat: extraer deteccion de silencio a funcion pura testeable"
```

---

### Task 2: `useSilenceDetector` como envoltura fina sobre la función pura

**Files:**
- Modify: `translator-pwa/src/lib/useSilenceDetector.ts` (reemplazo completo del cuerpo interno, misma API pública)

**Interfaces:**
- Consumes: `stepSilenceDetection`, `initialSilenceDetectionState`, `SilenceDetectionState` de Task 1 (`./silenceDetection.ts`).
- Produces: mismo `useSilenceDetector(options): SilenceDetectorHandle` público que ya consumen `page.tsx` (sin cambios de firma en este task — Task 3 añade el parámetro `silenceMs` en el *caller*, no aquí).

- [ ] **Step 1: Reemplazar el contenido de `useSilenceDetector.ts`**

```ts
// translator-pwa/src/lib/useSilenceDetector.ts
import { useEffect, useRef, useCallback } from "react";
import {
  stepSilenceDetection,
  initialSilenceDetectionState,
  type SilenceDetectionState,
} from "./silenceDetection.ts";

export interface SilenceDetectorOptions {
  /** Stream de audio a analizar. Típicamente un MediaStream del getUserMedia. */
  stream: MediaStream | null;
  /** Umbral RMS por debajo del cual se considera silencio. Default 0.01 (≈ -45 dBFS). */
  threshold?: number;
  /** Milisegundos continuos de silencio para emitir `onSilence`. Default 700ms. */
  silenceMs?: number;
  /** Milisegundos de sonido continuo para emitir `onSoundStart`. Default 100ms. */
  soundStartMs?: number;
  /** Si está activo o no. Default true. */
  enabled?: boolean;
  /** Callback cuando se detecta sonido tras silencio. */
  onSoundStart?: () => void;
  /** Callback cuando se confirma silencio sostenido. */
  onSilence?: () => void;
  /** Callback con el nivel RMS en tiempo real (0..1). Útil para visualizaciones. */
  onLevel?: (rms: number) => void;
}

export interface SilenceDetectorHandle {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
}

/**
 * Hook que analiza un MediaStream con Web Audio API y emite eventos cuando detecta
 * sonido o silencio sostenido. Usado por el modo conversación para cerrar turnos
 * automáticamente cuando el hablante deja de hablar.
 */
export function useSilenceDetector(options: SilenceDetectorOptions): SilenceDetectorHandle {
  const {
    stream,
    threshold = 0.01,
    silenceMs = 700,
    soundStartMs = 100,
    enabled = true,
    onSoundStart,
    onSilence,
    onLevel,
  } = options;

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const detectionStateRef = useRef<SilenceDetectionState>(initialSilenceDetectionState);
  const isRunningRef = useRef<boolean>(false);

  const callbacksRef = useRef({ onSoundStart, onSilence, onLevel });
  callbacksRef.current = { onSoundStart, onSilence, onLevel };

  const tick = useCallback(() => {
    if (!isRunningRef.current || !analyserRef.current || !bufferRef.current) return;
    analyserRef.current.getFloatTimeDomainData(bufferRef.current);
    let sumSquares = 0;
    for (let i = 0; i < bufferRef.current.length; i++) {
      const v = bufferRef.current[i];
      sumSquares += v * v;
    }
    const rms = Math.sqrt(sumSquares / bufferRef.current.length);
    callbacksRef.current.onLevel?.(rms);

    const now = performance.now();
    const { state, events } = stepSilenceDetection(detectionStateRef.current, rms, now, {
      threshold,
      silenceMs,
      soundStartMs,
    });
    detectionStateRef.current = state;
    if (events.soundStart) callbacksRef.current.onSoundStart?.();
    if (events.silence) callbacksRef.current.onSilence?.();

    rafRef.current = requestAnimationFrame(tick);
  }, [threshold, silenceMs, soundStartMs]);

  const start = useCallback(() => {
    if (isRunningRef.current) return;
    if (!stream || typeof window === "undefined") return;

    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new Ctor();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.1;
      source.connect(analyser);
      const buffer = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;
      bufferRef.current = buffer;
      detectionStateRef.current = initialSilenceDetectionState;
      isRunningRef.current = true;

      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.warn("useSilenceDetector: no se pudo iniciar AudioContext", err);
      isRunningRef.current = false;
    }
  }, [stream, tick]);

  const stop = useCallback(() => {
    isRunningRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        // No-op
      }
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        // No-op
      }
      analyserRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {
        // No-op
      });
    }
    audioContextRef.current = null;
    bufferRef.current = null;
    detectionStateRef.current = initialSilenceDetectionState;
  }, []);

  useEffect(() => {
    if (enabled && stream) {
      start();
    }
    return () => {
      stop();
    };
  }, [enabled, stream, start, stop]);

  return {
    start,
    stop,
    isRunning: () => isRunningRef.current,
  };
}

export default useSilenceDetector;
```

- [ ] **Step 2: Verificar tipos y build**

Run: `cd translator-pwa && npm run build`
Expected: compila sin errores (no cambia la API pública del hook, sólo su interior).

- [ ] **Step 3: Ejecutar la suite completa**

Run: `cd translator-pwa && npm test`
Expected: todos los tests existentes siguen en verde (85+3 de Task 1), sin regresiones.

- [ ] **Step 4: Commit**

```bash
git add translator-pwa/src/lib/useSilenceDetector.ts
git commit -m "refactor: useSilenceDetector delega la logica de silencio a la funcion pura"
```

---

### Task 3: Subir el umbral a 3000ms vía `CONVERSATION_CONSTANTS.SILENCE_MS`

**Files:**
- Modify: `translator-pwa/src/lib/conversationMachine.ts:172-176`
- Modify: `translator-pwa/src/app/page.tsx` (línea 53-55 y llamada a `useSilenceDetector` en línea 409-418)
- Test: `translator-pwa/tests/conversationMachine.test.mjs`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `CONVERSATION_CONSTANTS.SILENCE_MS` (valor `3000`), consumido por `page.tsx`.

- [ ] **Step 1: Añadir la constante**

En `translator-pwa/src/lib/conversationMachine.ts`, reemplazar:

```ts
export const CONVERSATION_CONSTANTS = {
  SOFT_LIMIT_SECONDS: 30,
  HARD_LIMIT_SECONDS: 45,
  POST_TURN_PAUSE_MS: 800,
} as const;
```

por:

```ts
export const CONVERSATION_CONSTANTS = {
  SOFT_LIMIT_SECONDS: 30,
  HARD_LIMIT_SECONDS: 45,
  POST_TURN_PAUSE_MS: 800,
  SILENCE_MS: 3000,
} as const;
```

- [ ] **Step 2: Escribir el test**

Añadir a `translator-pwa/tests/conversationMachine.test.mjs` (junto a las demás `describe` del archivo):

```js
describe("Conversation Machine - CONVERSATION_CONSTANTS", () => {
  it("fija el umbral de silencio en 3000ms", () => {
    assert.equal(CONVERSATION_CONSTANTS.SILENCE_MS, 3000);
  });
});
```

Y añadir `CONVERSATION_CONSTANTS` al import existente al inicio del archivo:

```js
import {
  conversationReducer,
  initialConversationState,
  oppositeOfActive,
  CONVERSATION_CONSTANTS,
} from "../src/lib/conversationMachine.ts";
```

- [ ] **Step 3: Ejecutar el test**

Run: `cd translator-pwa && npm test`
Expected: PASS, incluida la nueva prueba de `SILENCE_MS`.

- [ ] **Step 4: Cablear el valor en `page.tsx`**

En `translator-pwa/src/app/page.tsx`, junto a las constantes ya destructuradas (línea 53-55):

```ts
const SOFT_LIMIT_SECONDS = CONVERSATION_CONSTANTS.SOFT_LIMIT_SECONDS;
const HARD_LIMIT_SECONDS = CONVERSATION_CONSTANTS.HARD_LIMIT_SECONDS;
const POST_TURN_PAUSE_MS = CONVERSATION_CONSTANTS.POST_TURN_PAUSE_MS;
const SILENCE_MS = CONVERSATION_CONSTANTS.SILENCE_MS;
```

Y en la llamada a `useSilenceDetector` (línea 409-418), añadir `silenceMs`:

```ts
const convSilence = useSilenceDetector({
  stream: convAudioStream,
  enabled: convState.es === "listening" || convState.ja === "listening",
  silenceMs: SILENCE_MS,
  onSilence: () => {
    // Cuando se detecta silencio, detener el recorder activo y enviar a Gemini
    if (convRecorderRef.current && convRecorderRef.current.state === "recording") {
      convRecorderRef.current.stop();
    }
  },
});
```

- [ ] **Step 5: Build**

Run: `cd translator-pwa && npm run build`
Expected: compila sin errores.

- [ ] **Step 6: Commit**

```bash
git add translator-pwa/src/lib/conversationMachine.ts translator-pwa/tests/conversationMachine.test.mjs translator-pwa/src/app/page.tsx
git commit -m "fix: subir umbral de silencio a 3000ms en modo conversacion"
```

---

### Task 4: Función pura de etiqueta accesible del orbe + tests

**Files:**
- Create: `translator-pwa/src/lib/orbLabel.ts`
- Test: `translator-pwa/tests/orbLabel.test.mjs`

**Interfaces:**
- Consumes: tipo `SideState` de `translator-pwa/src/lib/conversationMachine.ts` (type-only), tipo `SupportedLanguage` de `translator-pwa/src/lib/translator.ts` (type-only).
- Produces: `getOrbAccessibleLabel(params): string`, consumido por Task 5 (`ConversationView.tsx`).

- [ ] **Step 1: Escribir el archivo de la función pura**

```ts
// translator-pwa/src/lib/orbLabel.ts
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
  /** Nombre visual del lado tal como aparece en la UI (p. ej. "日本語" para ja). */
  displayName: string;
  /** Rol visual del lado ("Tú" / "Otro"). */
  role: string;
}

/**
 * Nombre accesible del orbe según la tabla de la spec §4.3: debe ser exactamente
 * lo que una persona diría en voz alta con Control por voz de iOS para activarlo,
 * nunca una descripción técnica de su función interna.
 */
export function getOrbAccessibleLabel(params: OrbLabelParams): string {
  const { side, stateValue, activeSide, displayName, role } = params;

  if (stateValue === "listening") {
    return "Detener grabación";
  }

  if (stateValue === "speaking" || stateValue === "processing") {
    // Estado informativo, no accionable — sin cambio respecto al comportamiento previo.
    return `Orbe ${role} (${displayName}) · toca para menú`;
  }

  // idle
  if (activeSide === null) {
    return `Hablar en ${SPOKEN_LANGUAGE_NAME[side]}`;
  }
  return `${SPOKEN_LANGUAGE_NAME[side]}, en espera`;
}
```

- [ ] **Step 2: Escribir los tests**

```js
// translator-pwa/tests/orbLabel.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getOrbAccessibleLabel } from "../src/lib/orbLabel.ts";

const BASE = { displayName: "日本語", role: "Otro" };

describe("getOrbAccessibleLabel", () => {
  it("este lado escuchando (activo): 'Detener grabación'", () => {
    const label = getOrbAccessibleLabel({
      side: "ja",
      stateValue: "listening",
      activeSide: "ja",
      ...BASE,
    });
    assert.equal(label, "Detener grabación");
  });

  it("este lado hablando: descripción informativa sin cambio de comportamiento", () => {
    const label = getOrbAccessibleLabel({
      side: "ja",
      stateValue: "speaking",
      activeSide: "ja",
      ...BASE,
    });
    assert.equal(label, "Orbe Otro (日本語) · toca para menú");
  });

  it("este lado procesando: misma descripción informativa que hablando", () => {
    const label = getOrbAccessibleLabel({
      side: "ja",
      stateValue: "processing",
      activeSide: "ja",
      ...BASE,
    });
    assert.equal(label, "Orbe Otro (日本語) · toca para menú");
  });

  it("inactivo y libre (activeSide null): 'Hablar en <idioma>'", () => {
    const esLabel = getOrbAccessibleLabel({
      side: "es",
      stateValue: "idle",
      activeSide: null,
      displayName: "Español",
      role: "Tú",
    });
    const jaLabel = getOrbAccessibleLabel({
      side: "ja",
      stateValue: "idle",
      activeSide: null,
      ...BASE,
    });
    assert.equal(esLabel, "Hablar en Español");
    assert.equal(jaLabel, "Hablar en Japonés");
  });

  it("inactivo y bloqueado por el otro lado: '<idioma>, en espera'", () => {
    const label = getOrbAccessibleLabel({
      side: "ja",
      stateValue: "idle",
      activeSide: "es",
      ...BASE,
    });
    assert.equal(label, "Japonés, en espera");
  });
});
```

- [ ] **Step 3: Ejecutar los tests**

Run: `cd translator-pwa && npm test`
Expected: PASS, todas las pruebas de `getOrbAccessibleLabel` en verde.

- [ ] **Step 4: Commit**

```bash
git add translator-pwa/src/lib/orbLabel.ts translator-pwa/tests/orbLabel.test.mjs
git commit -m "feat: funcion pura de etiqueta accesible del orbe para control por voz"
```

---

### Task 5: Cablear la etiqueta accesible en `ConversationView.tsx`

**Files:**
- Modify: `translator-pwa/src/app/ConversationView.tsx`

**Interfaces:**
- Consumes: `getOrbAccessibleLabel` de Task 4 (`#lib/orbLabel`).
- Produces: nada nuevo (cambio de comportamiento visible, no de API).

- [ ] **Step 1: Importar la función**

Añadir junto a los imports existentes (línea 1-6):

```ts
import { getOrbAccessibleLabel } from "#lib/orbLabel";
```

- [ ] **Step 2: Añadir `activeSide` a las props de `Orb`**

En la interfaz de props de `Orb` (línea 149-159), añadir el campo:

```ts
function Orb({
  side,
  stateValue,
  turnDurationSeconds,
  softLimitSeconds,
  isNextSpeaker,
  activeSide,
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
  activeSide: SupportedLanguage | null;
  onLongPress: () => void;
  onDoubleTap: () => void;
  onTapToStart: () => void;
  onCancelActive: () => void;
  onInvertActive: () => void;
}) {
```

- [ ] **Step 3: Reemplazar el `aria-label` del botón del orbe**

Reemplazar (línea 260-264):

```tsx
        aria-label={`Orbe ${meta.role} (${meta.name})${
          stateValue === "idle" ? " · toca para iniciar turno" : " · toca para menú"
        }`}
```

por:

```tsx
        aria-label={getOrbAccessibleLabel({
          side,
          stateValue,
          activeSide,
          displayName: meta.name,
          role: meta.role,
        })}
```

- [ ] **Step 4: Pasar `activeSide` desde el componente padre**

En `ConversationView` (líneas 496-521), añadir la prop a las dos invocaciones de `<Orb>`:

```tsx
          <Orb
            side="es"
            stateValue={state.es}
            turnDurationSeconds={turnDurationSeconds}
            softLimitSeconds={softLimitSeconds}
            isNextSpeaker={nextSpeaker === "es"}
            activeSide={state.activeSide}
            onLongPress={() => onLongPressOrb("es")}
            onDoubleTap={() => onDoubleTapOrb("es")}
            onTapToStart={() => onOpenMic("es")}
            onCancelActive={() => onLongPressOrb("es")}
            onInvertActive={() => onDoubleTapOrb("es")}
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
            onLongPress={() => onLongPressOrb("ja")}
            onDoubleTap={() => onDoubleTapOrb("ja")}
            onTapToStart={() => onOpenMic("ja")}
            onCancelActive={() => onLongPressOrb("ja")}
            onInvertActive={() => onDoubleTapOrb("ja")}
          />
```

- [ ] **Step 5: Build y suite completa**

Run: `cd translator-pwa && npm run build && npm test`
Expected: build limpio, todos los tests en verde.

- [ ] **Step 6: Commit**

```bash
git add translator-pwa/src/app/ConversationView.tsx
git commit -m "feat: usar etiqueta accesible del orbe basada en activeSide"
```

---

### Task 6: Tres correcciones de nombre accesible (spec §5)

**Files:**
- Modify: `translator-pwa/src/app/page.tsx` (botones de modo, selector de dirección)
- Modify: `translator-pwa/src/app/ConversationView.tsx` (botón "Salir")

**Interfaces:**
- Consumes: `DIRECTION_OPTIONS` ya existente en `page.tsx` (campo `subLabel` ya definido, sin cambios de tipo).
- Produces: nada nuevo.

- [ ] **Step 1: Botones de modo en `page.tsx`**

Añadir `aria-label="Una frase"` al botón de la línea 798-813:

```tsx
          <button
            type="button"
            role="tab"
            aria-selected={mode === "single"}
            aria-label="Una frase"
            onClick={() => {
              primeAudioContext();
              setMode("single");
            }}
```

Añadir `aria-label="Conversación"` al botón de la línea 814-833:

```tsx
          <button
            type="button"
            role="tab"
            aria-selected={mode === "conversation"}
            aria-label="Conversación"
            onClick={() => {
```

- [ ] **Step 2: Selector de dirección en `page.tsx`**

En el `.map` de `DIRECTION_OPTIONS` (línea 841-858), añadir `aria-label={opt.subLabel}`:

```tsx
              return (
                <button
                  key={opt.value}
                  aria-label={opt.subLabel}
                  onClick={() => {
                    primeAudioContext();
                    setDirection(opt.value);
                  }}
```

- [ ] **Step 3: Botón "Salir" en `ConversationView.tsx`**

Cambiar (línea 478-485):

```tsx
        <button
          type="button"
          onClick={onExit}
          aria-label="Salir del modo conversación"
          className="text-slate-400 hover:text-white text-xs px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 transition-colors"
        >
          ✕ Salir
        </button>
```

por:

```tsx
        <button
          type="button"
          onClick={onExit}
          aria-label="Salir"
          className="text-slate-400 hover:text-white text-xs px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 transition-colors"
        >
          ✕ Salir
        </button>
```

- [ ] **Step 4: Build**

Run: `cd translator-pwa && npm run build`
Expected: compila sin errores.

- [ ] **Step 5: Commit**

```bash
git add translator-pwa/src/app/page.tsx translator-pwa/src/app/ConversationView.tsx
git commit -m "fix: nombres accesibles pronunciables en toggle de modo, direccion y salir"
```

---

### Task 7: Verificación en navegador de todos los `aria-label` (controlador)

**Files:** ninguno (verificación, no código).

**Interfaces:** ninguna.

- [ ] **Step 1: Levantar el servidor de desarrollo**

Usar la configuración ya existente en `.claude/launch.json` para `translator-pwa` (creada en el proyecto anterior) para abrir la app en el panel de navegador.

- [ ] **Step 2: Verificar los botones de modo y dirección (modo "Una frase")**

Leer el árbol de accesibilidad de la página y confirmar:
- El botón de modo "🎯 Una frase" expone el nombre accesible `"Una frase"`.
- El botón de modo "💬 Conversación" expone el nombre accesible `"Conversación"`.
- Los tres botones del selector de dirección exponen `"Detección automática"`, `"Español a Japonés"`, `"Japonés a Español"` respectivamente.

- [ ] **Step 3: Entrar en modo Conversación y verificar las etiquetas del orbe**

Confirmar contra la tabla de la spec §4.3:
- Con ambos lados inactivos (tras cancelar un turno, o al entrar por primera vez si aplica): el orbe ES expone `"Hablar en Español"` y el orbe JA expone `"Hablar en Japonés"`.
- Al abrir el lado ES (estado `listening`): el orbe ES expone `"Detener grabación"` y el orbe JA expone `"Japonés, en espera"`.
- Durante `speaking`/`processing` del lado que respondió: el orbe expone el texto informativo `"Orbe <rol> (<nombre>) · toca para menú"` (sin cambios respecto al comportamiento anterior).

- [ ] **Step 4: Verificar el botón "Salir"**

Confirmar que expone el nombre accesible `"Salir"` (no `"Salir del modo conversación"`).

- [ ] **Step 5: Documentar el resultado**

Si todo coincide, no se requiere ninguna acción adicional — esta verificación reemplaza la necesidad de Control por voz real para detectar errores de cableado (condición invertida, prop no pasada, etc.). La validación con Control por voz real en un iPhone (spec §6.3) sigue pendiente y **no es delegable**: la debe hacer el usuario en su dispositivo antes del viaje.

---

## Self-Review (completado durante la redacción del plan)

- **Cobertura del spec:** §3.1 y §3.2 → Tasks 1-3. §4.3 → Tasks 4-5. §5 → Task 6. §6.1 (tests automatizados) → Tasks 1, 3, 4. §6.2 (verificación en navegador) → Task 7. §6.3 (validación real del usuario) → fuera de este plan, pendiente explícito tras Task 7. §7 (fuera de alcance) → no se tocó nada de esa lista.
- **Sin placeholders:** cada step tiene código completo, sin "TODO" ni "similar a la tarea anterior".
- **Consistencia de tipos:** `SilenceDetectionState`/`SilenceDetectionParams`/`SilenceDetectionEvents` (Task 1) se usan con los mismos nombres en Task 2. `getOrbAccessibleLabel` (Task 4) se importa y llama con los mismos nombres de parámetro en Task 5. `CONVERSATION_CONSTANTS.SILENCE_MS` (Task 3) es el único lugar que define el valor 3000; `page.tsx` sólo lo lee.
