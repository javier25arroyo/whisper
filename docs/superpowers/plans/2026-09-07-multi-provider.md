# Soporte Multi-Proveedor de IA — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que la PWA de traducción funcione con distintos proveedores de IA aportando solo una API key, sin romper el camino actual de Gemini.

**Architecture:** Un registro de adaptadores (`src/lib/providers/`) detrás de una interfaz común. El route handler resuelve qué proveedor usar (cabeceras del cliente o variables de entorno) y delega. Los proveedores que solo aceptan wav reciben el audio convertido en el navegador con Web Audio API.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, `@google/generative-ai`, `node --test` (sin frameworks), Web Audio API.

**Spec:** `docs/superpowers/specs/2026-09-07-multi-provider-design.md`

## Global Constraints

- **Sin dependencias nuevas.** Ni de producción ni de desarrollo. La conversión de audio usa Web Audio API del navegador.
- **Node.js 22.23.1** en el entorno actual; los tests `.mjs` importan archivos `.ts` directamente gracias al type stripping nativo. No añadir compilación previa.
- **Tests con `node --test`**, sin frameworks, siguiendo el estilo de `tests/api-mock.test.mjs`. Cada archivo de test nuevo debe registrarse en el script `test` de `package.json`.
- **Textos de UI y mensajes de error en español.** Identificadores de código en inglés, como el código existente.
- **Nunca hacer `git push`.** Commits locales únicamente.
- **La API key nunca aparece en logs, mensajes de error ni URLs.**
- **`baseUrl` procede siempre del preset del servidor**, jamás de una cabecera del cliente (prevención de SSRF).
- Directorio de trabajo de todos los comandos: `translator-pwa/`.

---

### Task 1: Tipos compartidos y helpers agnósticos de proveedor

Mueve los tipos a un módulo propio y renombra el parser para que deje de ser específico de Gemini. Sin cambios de comportamiento.

**Files:**
- Create: `translator-pwa/src/lib/providers/types.ts`
- Modify: `translator-pwa/src/lib/translator.ts`
- Modify: `translator-pwa/tests/api-mock.test.mjs`
- Modify: `translator-pwa/package.json`
- Test: `translator-pwa/tests/providers.test.mjs`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces: `ProviderConfig`, `TranslateInput`, `AudioTranslator`, `ProviderPreset`, `TranslationResult`, `SupportedLanguage` desde `src/lib/providers/types.ts`; `parseTranslationJson(responseText: string, defaultLang?: SupportedLanguage): TranslationResult` desde `src/lib/translator.ts`.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/providers.test.mjs`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseTranslationJson } from "../src/lib/translator.ts";

describe("parseTranslationJson", () => {
  it("parsea JSON limpio sin depender del proveedor", () => {
    const raw = '{"detected_language":"es","original_text":"Hola","translation":"こんにちは"}';
    assert.deepEqual(parseTranslationJson(raw), {
      detected_language: "es",
      original_text: "Hola",
      translation: "こんにちは",
    });
  });

  it("lanza error cuando la respuesta está vacía", () => {
    assert.throws(() => parseTranslationJson(""), /Respuesta vacía/);
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `node --test tests/providers.test.mjs`
Expected: FAIL — `parseTranslationJson is not a function` (el módulo aún exporta `extractAndParseGeminiJson`).

- [ ] **Step 3: Crear el módulo de tipos**

Crear `src/lib/providers/types.ts`:

```ts
export type SupportedLanguage = "es" | "ja";

export interface TranslationResult {
  detected_language: SupportedLanguage;
  original_text: string;
  translation: string;
}

/** Configuración resuelta para una llamada concreta. `baseUrl` procede del preset, nunca del cliente. */
export interface ProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export interface TranslateInput {
  audioBase64: string;
  mimeType: string;
  direction?: string;
}

export interface AudioTranslator {
  translate(cfg: ProviderConfig, input: TranslateInput): Promise<TranslationResult>;
  /** Si devuelve false, el audio debe convertirse antes de enviarse a este proveedor. */
  acceptsMimeType(mimeType: string): boolean;
}

export interface ProviderPreset {
  id: string;
  label: string;
  transport: "gemini" | "openai-compat";
  /** Solo para transport "openai-compat". Definido en el servidor, nunca recibido del navegador. */
  baseUrl?: string;
  defaultModel: string;
  /** true cuando el proveedor exige wav/mp3 y hay que convertir en el cliente. */
  requiresWav: boolean;
  /** Página donde el usuario obtiene una clave. Se muestra en los ajustes. */
  keyUrl: string;
}
```

- [ ] **Step 4: Actualizar `translator.ts`**

En `src/lib/translator.ts`, sustituir las definiciones locales de tipos de las líneas 3-9 por una reexportación, y renombrar la función:

```ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SupportedLanguage, TranslationResult } from "./providers/types";

export type { SupportedLanguage, TranslationResult };
```

Renombrar `extractAndParseGeminiJson` a `parseTranslationJson` (declaración y las dos referencias internas dentro de `translateAudioWithGemini`). Cambiar también los mensajes de error para que no nombren a Gemini:

- `"Respuesta vacía de Gemini"` → `"Respuesta vacía del proveedor"`
- `` `Error al parsear JSON de Gemini: ...` `` → `` `Error al parsear JSON del proveedor: ...` ``

- [ ] **Step 5: Actualizar el test existente**

En `tests/api-mock.test.mjs`: cambiar el import `extractAndParseGeminiJson` por `parseTranslationJson` (línea 9) y las 10 llamadas dentro del bloque `describe("API Translate - Gemini JSON Extraction and Parsing")`. Actualizar también las dos aserciones que esperan el texto antiguo:

```js
assert.throws(() => parseTranslationJson(""), /Respuesta vacía del proveedor/);
assert.throws(() => parseTranslationJson(null), /Respuesta vacía del proveedor/);
```

- [ ] **Step 6: Registrar el nuevo archivo de test**

En `package.json`, ampliar el script `test`:

```json
"test": "node --test tests/api-mock.test.mjs tests/conversationMachine.test.mjs tests/history.test.mjs tests/providers.test.mjs"
```

- [ ] **Step 7: Ejecutar toda la suite**

Run: `npm test`
Expected: PASS — 56 tests, 0 fallos.

- [ ] **Step 8: Commit**

```bash
git add src/lib/providers/types.ts src/lib/translator.ts tests/api-mock.test.mjs tests/providers.test.mjs package.json
git commit -m "refactor: extraer tipos de proveedor y renombrar el parser de respuesta"
```

---

### Task 2: Adaptador de Gemini

Mueve la llamada al SDK a un adaptador que cumple la interfaz común.

**Files:**
- Create: `translator-pwa/src/lib/providers/gemini.ts`
- Modify: `translator-pwa/src/lib/translator.ts`
- Test: `translator-pwa/tests/providers.test.mjs`

**Interfaces:**
- Consumes: `AudioTranslator`, `ProviderConfig`, `TranslateInput` de Task 1; `getPromptForDirection`, `normalizeMimeType`, `parseTranslationJson` de `src/lib/translator.ts`.
- Produces: `geminiProvider: AudioTranslator` y `GEMINI_DEFAULT_MODEL = "gemini-2.0-flash"` desde `src/lib/providers/gemini.ts`.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `tests/providers.test.mjs`:

```js
import { GoogleGenerativeAI } from "@google/generative-ai";
import { geminiProvider, GEMINI_DEFAULT_MODEL } from "../src/lib/providers/gemini.ts";

describe("geminiProvider", () => {
  it("acepta cualquier mime type porque normaliza antes de enviar", () => {
    assert.equal(geminiProvider.acceptsMimeType("audio/mp4"), true);
    assert.equal(geminiProvider.acceptsMimeType("audio/webm;codecs=opus"), true);
    assert.equal(geminiProvider.acceptsMimeType("application/octet-stream"), true);
  });

  it("envía el audio normalizado y devuelve el resultado parseado", async () => {
    const original = GoogleGenerativeAI.prototype.getGenerativeModel;
    let seenModel = null;
    let seenMime = null;
    GoogleGenerativeAI.prototype.getGenerativeModel = function (opts) {
      seenModel = opts.model;
      return {
        generateContent: async (contents) => {
          seenMime = contents[0].inlineData.mimeType;
          return {
            response: {
              text: () =>
                '{"detected_language":"ja","original_text":"ありがとう","translation":"Gracias"}',
            },
          };
        },
      };
    };
    try {
      const result = await geminiProvider.translate(
        { apiKey: "k-test" },
        { audioBase64: "AAAA", mimeType: "audio/m4a", direction: "auto" }
      );
      assert.equal(seenModel, GEMINI_DEFAULT_MODEL);
      assert.equal(seenMime, "audio/mp4");
      assert.equal(result.translation, "Gracias");
    } finally {
      GoogleGenerativeAI.prototype.getGenerativeModel = original;
    }
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `node --test tests/providers.test.mjs`
Expected: FAIL — no se encuentra el módulo `../src/lib/providers/gemini.ts`.

- [ ] **Step 3: Crear el adaptador**

Crear `src/lib/providers/gemini.ts`:

```ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  getPromptForDirection,
  normalizeMimeType,
  parseTranslationJson,
} from "../translator";
import type {
  AudioTranslator,
  ProviderConfig,
  SupportedLanguage,
  TranslateInput,
  TranslationResult,
} from "./types";

export const GEMINI_DEFAULT_MODEL = "gemini-2.0-flash";

export const geminiProvider: AudioTranslator = {
  // normalizeMimeType convierte cualquier entrada a uno de los formatos que Gemini admite.
  acceptsMimeType(): boolean {
    return true;
  },

  async translate(cfg: ProviderConfig, input: TranslateInput): Promise<TranslationResult> {
    const genAI = new GoogleGenerativeAI(cfg.apiKey);
    const model = genAI.getGenerativeModel({ model: cfg.model || GEMINI_DEFAULT_MODEL });
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: normalizeMimeType(input.mimeType),
          data: input.audioBase64,
        },
      },
      { text: getPromptForDirection(input.direction) },
    ]);

    const defaultLang: SupportedLanguage = input.direction === "ja-es" ? "ja" : "es";
    return parseTranslationJson(result.response.text(), defaultLang);
  },
};
```

- [ ] **Step 4: Eliminar la función duplicada de `translator.ts`**

Borrar `translateAudioWithGemini` (líneas 163-195) y el import de `GoogleGenerativeAI` de la línea 1 de `src/lib/translator.ts`. El archivo queda solo con helpers agnósticos: `PROMPTS`, `getPromptForDirection`, `normalizeMimeType`, `normalizeLanguage`, `parseTranslationJson`.

Esto rompe temporalmente el import de `route.ts`; se arregla en el mismo paso:

En `src/app/api/translate/route.ts`, cambiar el import de las líneas 2-5 y la llamada de la línea 46:

```ts
import { geminiProvider } from "#lib/providers/gemini";
import type { TranslationResult } from "#lib/providers/types";
```

```ts
translationResult = await geminiProvider.translate(
  { apiKey },
  { audioBase64: base64Audio, mimeType: audioFile.type, direction }
);
```

Nota: el alias `#lib/*` apunta a `./src/lib/*.ts`, así que `#lib/providers/gemini` resuelve correctamente.

- [ ] **Step 5: Ejecutar toda la suite**

Run: `npm test`
Expected: PASS — los tests existentes de la ruta siguen pasando porque el mock intercepta el mismo SDK.

- [ ] **Step 6: Verificar que compila**

Run: `npm run build`
Expected: compilación exitosa, sin errores de tipos.

- [ ] **Step 7: Commit**

```bash
git add src/lib/providers/gemini.ts src/lib/translator.ts src/app/api/translate/route.ts tests/providers.test.mjs
git commit -m "refactor: mover la llamada a Gemini a un adaptador con interfaz comun"
```

---

### Task 3: Adaptador OpenAI-compatible

Cubre OpenAI, OpenRouter y cualquier endpoint con el mismo contrato.

**Files:**
- Create: `translator-pwa/src/lib/providers/openaiCompat.ts`
- Test: `translator-pwa/tests/providers.test.mjs`

**Interfaces:**
- Consumes: `AudioTranslator`, `ProviderConfig`, `TranslateInput` de Task 1; `getPromptForDirection`, `parseTranslationJson` de `src/lib/translator.ts`.
- Produces: `openaiCompatProvider: AudioTranslator` desde `src/lib/providers/openaiCompat.ts`.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `tests/providers.test.mjs`:

```js
import { openaiCompatProvider } from "../src/lib/providers/openaiCompat.ts";

describe("openaiCompatProvider", () => {
  it("solo acepta wav y mp3", () => {
    assert.equal(openaiCompatProvider.acceptsMimeType("audio/wav"), true);
    assert.equal(openaiCompatProvider.acceptsMimeType("audio/mpeg"), true);
    assert.equal(openaiCompatProvider.acceptsMimeType("audio/mp4"), false);
    assert.equal(openaiCompatProvider.acceptsMimeType("audio/webm"), false);
  });

  it("construye la petición con input_audio y devuelve el resultado parseado", async () => {
    const originalFetch = globalThis.fetch;
    let seenUrl = null;
    let seenBody = null;
    let seenAuth = null;
    globalThis.fetch = async (url, init) => {
      seenUrl = url;
      seenAuth = init.headers.authorization;
      seenBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '{"detected_language":"es","original_text":"Buenos días","translation":"おはよう"}',
              },
            },
          ],
        }),
      };
    };
    try {
      const result = await openaiCompatProvider.translate(
        { apiKey: "sk-secreta", model: "modelo-x", baseUrl: "https://api.ejemplo.com/v1" },
        { audioBase64: "QUJD", mimeType: "audio/wav", direction: "es-ja" }
      );
      assert.equal(seenUrl, "https://api.ejemplo.com/v1/chat/completions");
      assert.equal(seenAuth, "Bearer sk-secreta");
      assert.equal(seenBody.model, "modelo-x");
      const parts = seenBody.messages[0].content;
      assert.equal(parts[1].type, "input_audio");
      assert.equal(parts[1].input_audio.format, "wav");
      assert.equal(parts[1].input_audio.data, "QUJD");
      assert.equal(result.translation, "おはよう");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("lanza un error saneado que no contiene la API key", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "Invalid key sk-secreta" } }),
      text: async () => "Invalid key sk-secreta",
    });
    try {
      await assert.rejects(
        () =>
          openaiCompatProvider.translate(
            { apiKey: "sk-secreta", model: "m", baseUrl: "https://api.ejemplo.com/v1" },
            { audioBase64: "QUJD", mimeType: "audio/wav" }
          ),
        (err) => {
          assert.ok(!err.message.includes("sk-secreta"), "el error no debe filtrar la key");
          assert.match(err.message, /401/);
          return true;
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `node --test tests/providers.test.mjs`
Expected: FAIL — no se encuentra el módulo `openaiCompat.ts`.

- [ ] **Step 3: Crear el adaptador**

Crear `src/lib/providers/openaiCompat.ts`:

```ts
import { getPromptForDirection, parseTranslationJson } from "../translator";
import type {
  AudioTranslator,
  ProviderConfig,
  SupportedLanguage,
  TranslateInput,
  TranslationResult,
} from "./types";

/** La capa OpenAI-compatible solo admite estos formatos en input_audio. */
const ACCEPTED_MIME_TYPES = ["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3"];

function baseMimeType(mimeType: string): string {
  return (mimeType || "").toLowerCase().split(";")[0].trim();
}

function audioFormatFor(mimeType: string): "wav" | "mp3" {
  const base = baseMimeType(mimeType);
  return base === "audio/mpeg" || base === "audio/mp3" ? "mp3" : "wav";
}

export const openaiCompatProvider: AudioTranslator = {
  acceptsMimeType(mimeType: string): boolean {
    return ACCEPTED_MIME_TYPES.includes(baseMimeType(mimeType));
  },

  async translate(cfg: ProviderConfig, input: TranslateInput): Promise<TranslationResult> {
    let response: Response;
    try {
      response = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: getPromptForDirection(input.direction) },
                {
                  type: "input_audio",
                  input_audio: {
                    data: input.audioBase64,
                    format: audioFormatFor(input.mimeType),
                  },
                },
              ],
            },
          ],
        }),
      });
    } catch {
      // El mensaje original puede contener la URL con credenciales: se descarta.
      throw new Error("No se pudo contactar con el proveedor. Revisa tu conexión.");
    }

    if (!response.ok) {
      // Nunca se reenvía el cuerpo de la respuesta: puede hacer eco de la API key.
      throw new Error(`El proveedor rechazó la petición (HTTP ${response.status}).`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("Respuesta vacía del proveedor");
    }

    const defaultLang: SupportedLanguage = input.direction === "ja-es" ? "ja" : "es";
    return parseTranslationJson(content, defaultLang);
  },
};
```

- [ ] **Step 4: Ejecutar los tests**

Run: `node --test tests/providers.test.mjs`
Expected: PASS — los tres tests del bloque `openaiCompatProvider`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers/openaiCompat.ts tests/providers.test.mjs
git commit -m "feat: adaptador OpenAI-compatible con errores saneados"
```

---

### Task 4: Registro de proveedores y presets

**Files:**
- Create: `translator-pwa/src/lib/providers/index.ts`
- Test: `translator-pwa/tests/providers.test.mjs`

**Interfaces:**
- Consumes: `geminiProvider` (Task 2), `openaiCompatProvider` (Task 3), `ProviderPreset` (Task 1).
- Produces: `PRESETS: Record<string, ProviderPreset>`, `DEFAULT_PROVIDER_ID = "gemini"`, `getProvider(id: string): { preset: ProviderPreset; adapter: AudioTranslator } | null` desde `src/lib/providers/index.ts`.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `tests/providers.test.mjs`:

```js
import { PRESETS, DEFAULT_PROVIDER_ID, getProvider } from "../src/lib/providers/index.ts";

describe("registro de proveedores", () => {
  it("devuelve preset y adaptador para un id conocido", () => {
    const entry = getProvider("gemini");
    assert.equal(entry.preset.transport, "gemini");
    assert.equal(typeof entry.adapter.translate, "function");
  });

  it("devuelve null para un id desconocido", () => {
    assert.equal(getProvider("proveedor-inventado"), null);
    assert.equal(getProvider(""), null);
  });

  it("marca requiresWav solo en los proveedores OpenAI-compatible", () => {
    assert.equal(PRESETS.gemini.requiresWav, false);
    assert.equal(PRESETS.openai.requiresWav, true);
    assert.equal(PRESETS.openrouter.requiresWav, true);
  });

  it("define baseUrl https para los compatibles y ninguno para gemini", () => {
    assert.equal(PRESETS.gemini.baseUrl, undefined);
    for (const id of ["openai", "openrouter"]) {
      assert.match(PRESETS[id].baseUrl, /^https:\/\//);
    }
  });

  it("todos los presets declaran modelo por defecto y página de claves", () => {
    for (const preset of Object.values(PRESETS)) {
      assert.ok(preset.defaultModel.length > 0);
      assert.match(preset.keyUrl, /^https:\/\//);
    }
    assert.ok(PRESETS[DEFAULT_PROVIDER_ID]);
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `node --test tests/providers.test.mjs`
Expected: FAIL — no se encuentra el módulo `index.ts`.

- [ ] **Step 3: Crear el registro**

Crear `src/lib/providers/index.ts`:

```ts
import { geminiProvider, GEMINI_DEFAULT_MODEL } from "./gemini";
import { openaiCompatProvider } from "./openaiCompat";
import type { AudioTranslator, ProviderPreset } from "./types";

export const DEFAULT_PROVIDER_ID = "gemini";

export const PRESETS: Record<string, ProviderPreset> = {
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    transport: "gemini",
    defaultModel: GEMINI_DEFAULT_MODEL,
    requiresWav: false,
    keyUrl: "https://aistudio.google.com/apikey",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    transport: "openai-compat",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-audio-preview",
    requiresWav: true,
    keyUrl: "https://platform.openai.com/api-keys",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    transport: "openai-compat",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "google/gemini-2.0-flash-001",
    requiresWav: true,
    keyUrl: "https://openrouter.ai/keys",
  },
};

const ADAPTERS: Record<ProviderPreset["transport"], AudioTranslator> = {
  gemini: geminiProvider,
  "openai-compat": openaiCompatProvider,
};

export function getProvider(
  id: string
): { preset: ProviderPreset; adapter: AudioTranslator } | null {
  const preset = PRESETS[id];
  if (!preset) return null;
  return { preset, adapter: ADAPTERS[preset.transport] };
}
```

- [ ] **Step 4: Ejecutar los tests**

Run: `node --test tests/providers.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers/index.ts tests/providers.test.mjs
git commit -m "feat: registro de proveedores con presets declarativos"
```

---

### Task 5: Resolución de proveedor en el route handler

**Files:**
- Modify: `translator-pwa/src/app/api/translate/route.ts`
- Modify: `translator-pwa/.env.local.example`
- Modify: `translator-pwa/package.json`
- Test: `translator-pwa/tests/route-provider.test.mjs`

**Interfaces:**
- Consumes: `getProvider`, `PRESETS`, `DEFAULT_PROVIDER_ID` (Task 4).
- Produces: cabeceras aceptadas por la ruta (`x-provider-id`, `x-provider-key`, `x-provider-model`) y los códigos de estado 400 (proveedor inválido o sin clave) y 415 (formato de audio no admitido por el proveedor).

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/route-provider.test.mjs`:

```js
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import { POST } from "../src/app/api/translate/route.ts";

const originalFetch = globalThis.fetch;
const originalKey = process.env.GEMINI_API_KEY;

function audioRequest(headers = {}, mimeType = "audio/wav") {
  const formData = new FormData();
  formData.append("audio", new Blob(["bytes-de-audio"], { type: mimeType }));
  formData.append("direction", "auto");
  return new Request("http://localhost:3000/api/translate", {
    method: "POST",
    body: formData,
    headers,
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey !== undefined) process.env.GEMINI_API_KEY = originalKey;
  else delete process.env.GEMINI_API_KEY;
});

describe("resolución de proveedor en /api/translate", () => {
  it("devuelve 400 cuando el id de proveedor no existe", async () => {
    const res = await POST(audioRequest({ "x-provider-id": "inventado", "x-provider-key": "k" }));
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /Proveedor no reconocido/i);
  });

  it("devuelve 400 cuando se indica proveedor sin clave", async () => {
    const res = await POST(audioRequest({ "x-provider-id": "openai" }));
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /clave/i);
  });

  it("devuelve 415 cuando el proveedor no admite el formato de audio", async () => {
    const res = await POST(
      audioRequest({ "x-provider-id": "openai", "x-provider-key": "sk-x" }, "audio/mp4")
    );
    assert.equal(res.status, 415);
    assert.match((await res.json()).error, /no admite/i);
  });

  it("usa el baseUrl del preset e ignora el que llegue por cabecera", async () => {
    let seenUrl = null;
    globalThis.fetch = async (url) => {
      seenUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '{"detected_language":"es","original_text":"Hola","translation":"こんにちは"}',
              },
            },
          ],
        }),
      };
    };
    const res = await POST(
      audioRequest({
        "x-provider-id": "openrouter",
        "x-provider-key": "sk-x",
        "x-provider-base-url": "http://169.254.169.254/latest/meta-data",
      })
    );
    assert.equal(res.status, 200);
    assert.equal(seenUrl, "https://openrouter.ai/api/v1/chat/completions");
  });

  it("no filtra la clave del usuario en el mensaje de error", async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: "Invalid key sk-super-secreta" }),
      text: async () => "Invalid key sk-super-secreta",
    });
    const res = await POST(
      audioRequest({ "x-provider-id": "openai", "x-provider-key": "sk-super-secreta" })
    );
    const body = JSON.stringify(await res.json());
    assert.ok(!body.includes("sk-super-secreta"), "la respuesta no debe contener la clave");
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `node --test tests/route-provider.test.mjs`
Expected: FAIL — la ruta ignora las cabeceras y responde 500 por falta de `GEMINI_API_KEY`, o 200 usando Gemini.

- [ ] **Step 3: Implementar la resolución**

Reescribir `src/app/api/translate/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server.js";
import { getProvider, DEFAULT_PROVIDER_ID } from "#lib/providers/index";
import type { AudioTranslator, ProviderConfig, TranslationResult } from "#lib/providers/types";

export const maxDuration = 30;

type Resolution =
  | { ok: true; adapter: AudioTranslator; cfg: ProviderConfig }
  | { ok: false; error: string; status: number };

/**
 * Resuelve el proveedor a usar. Prioridad: cabeceras del cliente, luego entorno.
 * baseUrl procede siempre del preset del servidor, nunca del cliente (prevención de SSRF).
 */
function resolveProvider(req: NextRequest): Resolution {
  const headerId = req.headers.get("x-provider-id");
  const headerKey = req.headers.get("x-provider-key");

  if (headerId) {
    const entry = getProvider(headerId);
    if (!entry) {
      return { ok: false, error: "Proveedor no reconocido.", status: 400 };
    }
    if (!headerKey) {
      return { ok: false, error: "Falta la clave del proveedor seleccionado.", status: 400 };
    }
    return {
      ok: true,
      adapter: entry.adapter,
      cfg: {
        apiKey: headerKey,
        model: req.headers.get("x-provider-model") || entry.preset.defaultModel,
        baseUrl: entry.preset.baseUrl,
      },
    };
  }

  const envId = process.env.PROVIDER_ID || DEFAULT_PROVIDER_ID;
  const entry = getProvider(envId);
  if (!entry) {
    return { ok: false, error: "Proveedor del servidor mal configurado.", status: 500 };
  }
  const envKey = process.env.PROVIDER_API_KEY || process.env.GEMINI_API_KEY;
  if (!envKey) {
    return { ok: false, error: "API key no configurada", status: 500 };
  }
  return {
    ok: true,
    adapter: entry.adapter,
    cfg: {
      apiKey: envKey,
      model: process.env.PROVIDER_MODEL || entry.preset.defaultModel,
      baseUrl: entry.preset.baseUrl,
    },
  };
}

export async function POST(req: NextRequest) {
  const resolution = resolveProvider(req);
  if (!resolution.ok) {
    return NextResponse.json({ error: resolution.error }, { status: resolution.status });
  }

  try {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { error: "Formato de petición inválido (se esperaba multipart/form-data)" },
        { status: 400 }
      );
    }

    const audioFile = formData.get("audio") as File | null;
    const direction = (formData.get("direction") as string) || "auto";

    if (!audioFile || typeof audioFile.size !== "number" || audioFile.size === 0) {
      return NextResponse.json({ error: "No se recibió audio" }, { status: 400 });
    }

    // Limitar a 15MB
    if (audioFile.size > 15 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Audio demasiado largo. Graba menos de 30 segundos." },
        { status: 400 }
      );
    }

    if (!resolution.adapter.acceptsMimeType(audioFile.type)) {
      return NextResponse.json(
        { error: "El proveedor seleccionado no admite este formato de audio." },
        { status: 415 }
      );
    }

    const bytes = await audioFile.arrayBuffer();
    const base64Audio = Buffer.from(bytes).toString("base64");

    let translationResult: TranslationResult;
    try {
      translationResult = await resolution.adapter.translate(resolution.cfg, {
        audioBase64: base64Audio,
        mimeType: audioFile.type,
        direction,
      });
    } catch (translateErr) {
      const msg =
        translateErr instanceof Error ? translateErr.message : "Error al procesar el audio";
      // No se registra la configuración: contiene la API key.
      console.error("Error en la llamada al proveedor:", msg);

      if (
        msg.includes("JSON") ||
        msg.includes("incompleta") ||
        msg.includes("bloque JSON") ||
        msg.includes("vacía")
      ) {
        return NextResponse.json({ error: msg }, { status: 422 });
      }

      return NextResponse.json({ error: `Error al procesar: ${msg}` }, { status: 500 });
    }

    return NextResponse.json(translationResult, { status: 200 });
  } catch (err) {
    console.error("Error inesperado en /api/translate:", err);
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: `Error al procesar: ${message}` }, { status: 500 });
  }
}
```

- [ ] **Step 4: Registrar el nuevo archivo de test**

En `package.json`, añadir `tests/route-provider.test.mjs` al script `test`:

```json
"test": "node --test tests/api-mock.test.mjs tests/conversationMachine.test.mjs tests/history.test.mjs tests/providers.test.mjs tests/route-provider.test.mjs"
```

- [ ] **Step 5: Documentar las variables de entorno**

Reemplazar el contenido de `.env.local.example`:

```env
# Obtén tu API Key gratis en: https://aistudio.google.com/apikey
GEMINI_API_KEY=tu_api_key_aqui

# Opcional: cambiar el proveedor por defecto del servidor.
# Valores admitidos: gemini, openai, openrouter
# PROVIDER_ID=gemini
# PROVIDER_API_KEY=clave_del_proveedor_elegido
# PROVIDER_MODEL=modelo_concreto
```

- [ ] **Step 6: Ejecutar toda la suite**

Run: `npm test`
Expected: PASS — los tests antiguos de la ruta (clave ausente, audio vacío, límite de 15 MB, mocks de Gemini) siguen pasando junto a los cinco nuevos.

- [ ] **Step 7: Verificar que compila**

Run: `npm run build`
Expected: compilación exitosa.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/translate/route.ts tests/route-provider.test.mjs package.json .env.local.example
git commit -m "feat: resolver proveedor desde cabeceras o entorno con baseUrl del servidor"
```

---

### Task 6: Codificador WAV

La pieza con mayor riesgo de fallo silencioso: un WAV mal formado se envía sin error pero suena a ruido. La función pura se testea en Node; el envoltorio de navegador queda aislado.

**Files:**
- Create: `translator-pwa/src/lib/wavEncoder.ts`
- Modify: `translator-pwa/package.json`
- Test: `translator-pwa/tests/wavEncoder.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: `encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer` y `blobToWav(blob: Blob): Promise<Blob>` desde `src/lib/wavEncoder.ts`; constante `TARGET_SAMPLE_RATE = 16000`.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/wavEncoder.test.mjs`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { encodeWav, TARGET_SAMPLE_RATE } from "../src/lib/wavEncoder.ts";

function readAscii(view, offset, length) {
  let out = "";
  for (let i = 0; i < length; i++) out += String.fromCharCode(view.getUint8(offset + i));
  return out;
}

describe("encodeWav", () => {
  it("escribe una cabecera RIFF/WAVE mono de 16 bits al sample rate indicado", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const view = new DataView(encodeWav(samples, TARGET_SAMPLE_RATE));

    assert.equal(readAscii(view, 0, 4), "RIFF");
    assert.equal(readAscii(view, 8, 4), "WAVE");
    assert.equal(readAscii(view, 12, 4), "fmt ");
    assert.equal(view.getUint16(20, true), 1, "formato PCM");
    assert.equal(view.getUint16(22, true), 1, "un canal");
    assert.equal(view.getUint32(24, true), TARGET_SAMPLE_RATE);
    assert.equal(view.getUint16(34, true), 16, "16 bits por muestra");
    assert.equal(readAscii(view, 36, 4), "data");
    assert.equal(view.getUint32(40, true), samples.length * 2);
  });

  it("produce un buffer de 44 bytes de cabecera más 2 bytes por muestra", () => {
    const samples = new Float32Array(100);
    assert.equal(encodeWav(samples, TARGET_SAMPLE_RATE).byteLength, 44 + 200);
  });

  it("convierte las muestras a PCM16 y satura fuera del rango [-1, 1]", () => {
    const view = new DataView(encodeWav(new Float32Array([0, 1, -1, 2, -2]), TARGET_SAMPLE_RATE));
    assert.equal(view.getInt16(44, true), 0);
    assert.equal(view.getInt16(46, true), 32767);
    assert.equal(view.getInt16(48, true), -32768);
    assert.equal(view.getInt16(50, true), 32767, "satura por arriba");
    assert.equal(view.getInt16(52, true), -32768, "satura por abajo");
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `node --test tests/wavEncoder.test.mjs`
Expected: FAIL — no se encuentra el módulo `wavEncoder.ts`.

- [ ] **Step 3: Implementar el codificador**

Crear `src/lib/wavEncoder.ts`:

```ts
export const TARGET_SAMPLE_RATE = 16000;

/** Escribe una cadena ASCII byte a byte en la posición indicada. */
function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

/** Convierte muestras Float32 mono a un WAV PCM de 16 bits. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // tamaño del bloque fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits por muestra
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  for (let i = 0; i < samples.length; i++) {
    // El rango de Int16 es asimétrico: -1 mapea a -32768 y 1 a 32767.
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const pcm = clamped < 0 ? clamped * 32768 : clamped * 32767;
    view.setInt16(44 + i * bytesPerSample, Math.round(pcm), true);
  }

  return buffer;
}

/**
 * Decodifica el audio grabado por MediaRecorder y lo reescribe como WAV mono a 16 kHz.
 * Solo se usa con proveedores que no admiten el formato nativo del navegador.
 */
export async function blobToWav(blob: Blob): Promise<Blob> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const frameCount = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, frameCount, TARGET_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return new Blob([encodeWav(rendered.getChannelData(0), TARGET_SAMPLE_RATE)], {
      type: "audio/wav",
    });
  } finally {
    await context.close();
  }
}
```

- [ ] **Step 4: Registrar el nuevo archivo de test**

En `package.json`, añadir `tests/wavEncoder.test.mjs` al script `test`.

- [ ] **Step 5: Ejecutar los tests**

Run: `npm test`
Expected: PASS — los tres tests del codificador incluidos.

- [ ] **Step 6: Commit**

```bash
git add src/lib/wavEncoder.ts tests/wavEncoder.test.mjs package.json
git commit -m "feat: codificador WAV mono 16 kHz con Web Audio API"
```

---

### Task 7: Ajustes de proveedor persistidos en el dispositivo

**Files:**
- Create: `translator-pwa/src/lib/providerSettings.ts`
- Modify: `translator-pwa/package.json`
- Test: `translator-pwa/tests/providerSettings.test.mjs`

**Interfaces:**
- Consumes: `PRESETS` (Task 4).
- Produces: `ProviderSettings = { id: string; apiKey: string; model?: string }`, `loadProviderSettings(): ProviderSettings | null`, `saveProviderSettings(s: ProviderSettings): void`, `clearProviderSettings(): void`, `needsWavConversion(id: string | null, mimeType: string): boolean` desde `src/lib/providerSettings.ts`.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/providerSettings.test.mjs`:

```js
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  loadProviderSettings,
  saveProviderSettings,
  clearProviderSettings,
  needsWavConversion,
} from "../src/lib/providerSettings.ts";

function stubBrowser() {
  const store = new Map();
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  return store;
}

afterEach(() => {
  delete globalThis.window;
  delete globalThis.localStorage;
});

describe("providerSettings", () => {
  it("devuelve null sin window (renderizado en servidor)", () => {
    assert.equal(loadProviderSettings(), null);
  });

  it("no lanza al guardar o limpiar sin window", () => {
    assert.doesNotThrow(() => saveProviderSettings({ id: "openai", apiKey: "k" }));
    assert.doesNotThrow(() => clearProviderSettings());
  });

  it("guarda y recupera los ajustes", () => {
    stubBrowser();
    saveProviderSettings({ id: "openrouter", apiKey: "sk-x", model: "modelo-y" });
    assert.deepEqual(loadProviderSettings(), {
      id: "openrouter",
      apiKey: "sk-x",
      model: "modelo-y",
    });
  });

  it("devuelve null cuando lo almacenado está corrupto o el id no existe", () => {
    const store = stubBrowser();
    store.set("whisper_pwa_provider", "{no es json");
    assert.equal(loadProviderSettings(), null);
    store.set("whisper_pwa_provider", JSON.stringify({ id: "inventado", apiKey: "k" }));
    assert.equal(loadProviderSettings(), null);
    store.set("whisper_pwa_provider", JSON.stringify({ id: "openai" }));
    assert.equal(loadProviderSettings(), null, "sin clave no hay ajustes válidos");
  });

  it("borra los ajustes guardados", () => {
    stubBrowser();
    saveProviderSettings({ id: "openai", apiKey: "sk-x" });
    clearProviderSettings();
    assert.equal(loadProviderSettings(), null);
  });
});

describe("needsWavConversion", () => {
  it("no convierte cuando no hay proveedor propio (se usa el del servidor)", () => {
    assert.equal(needsWavConversion(null, "audio/mp4"), false);
  });

  it("no convierte con gemini", () => {
    assert.equal(needsWavConversion("gemini", "audio/mp4"), false);
  });

  it("convierte para proveedores compatibles cuando el formato no es wav", () => {
    assert.equal(needsWavConversion("openai", "audio/mp4"), true);
    assert.equal(needsWavConversion("openrouter", "audio/webm;codecs=opus"), true);
  });

  it("no convierte si el audio ya es wav", () => {
    assert.equal(needsWavConversion("openai", "audio/wav"), false);
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `node --test tests/providerSettings.test.mjs`
Expected: FAIL — no se encuentra el módulo `providerSettings.ts`.

- [ ] **Step 3: Implementar el módulo**

Crear `src/lib/providerSettings.ts`:

```ts
import { PRESETS } from "./providers/index";

const STORAGE_KEY = "whisper_pwa_provider";

export interface ProviderSettings {
  id: string;
  apiKey: string;
  model?: string;
}

export function loadProviderSettings(): ProviderSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.id !== "string" || typeof parsed.apiKey !== "string") return null;
    if (!parsed.apiKey || !PRESETS[parsed.id]) return null;
    return {
      id: parsed.id,
      apiKey: parsed.apiKey,
      model: typeof parsed.model === "string" && parsed.model ? parsed.model : undefined,
    };
  } catch {
    return null;
  }
}

export function saveProviderSettings(settings: ProviderSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Almacenamiento no disponible (modo privado): se ignora.
  }
}

export function clearProviderSettings(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // No-op
  }
}

/** Decide si hay que reescribir el audio a WAV antes de enviarlo al proveedor elegido. */
export function needsWavConversion(id: string | null, mimeType: string): boolean {
  if (!id) return false;
  const preset = PRESETS[id];
  if (!preset || !preset.requiresWav) return false;
  const base = (mimeType || "").toLowerCase().split(";")[0].trim();
  return base !== "audio/wav" && base !== "audio/x-wav";
}
```

- [ ] **Step 4: Registrar el nuevo archivo de test**

En `package.json`, añadir `tests/providerSettings.test.mjs` al script `test`.

- [ ] **Step 5: Ejecutar los tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/providerSettings.ts tests/providerSettings.test.mjs package.json
git commit -m "feat: ajustes de proveedor persistidos en el dispositivo"
```

---

### Task 8: Cliente único de llamada a la API

Unifica las dos llamadas duplicadas de `page.tsx` en un punto donde se aplican ajustes, conversión y cabeceras.

**Files:**
- Create: `translator-pwa/src/lib/apiClient.ts`
- Modify: `translator-pwa/src/app/page.tsx:245-295` (modo single) y `translator-pwa/src/app/page.tsx:465-477` (modo conversación)

**Interfaces:**
- Consumes: `loadProviderSettings`, `needsWavConversion` (Task 7); `blobToWav` (Task 6); `TranslationResult` (Task 1).
- Produces: `postTranslate({ blob, mimeType, direction }): Promise<TranslationResult>` desde `src/lib/apiClient.ts`.

- [ ] **Step 1: Crear el cliente**

Crear `src/lib/apiClient.ts`:

```ts
import { loadProviderSettings, needsWavConversion } from "./providerSettings";
import { blobToWav } from "./wavEncoder";
import type { TranslationResult } from "./providers/types";

export interface PostTranslateInput {
  blob: Blob;
  mimeType: string;
  direction: string;
}

/**
 * Punto único de llamada a /api/translate. Aplica los ajustes del usuario,
 * convierte el audio si el proveedor lo exige y añade las cabeceras.
 */
export async function postTranslate({
  blob,
  mimeType,
  direction,
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

  const res = await fetch("/api/translate", { method: "POST", body: formData, headers });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Error al procesar la traducción.");
  }
  return data as TranslationResult;
}
```

- [ ] **Step 2: Sustituir la llamada del modo single**

En `src/app/page.tsx`, dentro de `processAudioSingle`, reemplazar el bloque que construye el `FormData` y llama a `fetch` (líneas 250-261) por:

```ts
        const data = await postTranslate({ blob, mimeType, direction });
```

Añadir el import junto a los demás de `#lib/*`:

```ts
import { postTranslate } from "#lib/apiClient";
```

El resto de la función no cambia: `data.detected_language`, `data.original_text` y `data.translation` siguen existiendo con los mismos nombres.

- [ ] **Step 3: Sustituir la llamada del modo conversación**

En el mismo archivo, dentro de `recorder.onstop`, reemplazar las líneas 466-477 (construcción del `FormData`, `fetch` y comprobación de `res.ok`) por:

```ts
      try {
        const data = await postTranslate({
          blob,
          mimeType: finalMimeType,
          direction: "auto",
        });
```

El `catch` existente ya convierte el error en `SET_ERROR`, de modo que el mensaje del servidor sigue llegando a la interfaz. Eliminar el bloque `if (!res.ok) { ... return; }` porque `postTranslate` ya lanza en ese caso.

- [ ] **Step 4: Verificar tipos y compilación**

Run: `npm run build`
Expected: compilación exitosa. Si aparece un error de tipos en `data.detected_language`, comprobar que la variable local `detected` sigue tipada como `SupportedLanguage`.

- [ ] **Step 5: Ejecutar la suite completa**

Run: `npm test`
Expected: PASS, sin regresiones.

- [ ] **Step 6: Commit**

```bash
git add src/lib/apiClient.ts src/app/page.tsx
git commit -m "refactor: unificar las llamadas a la API en un cliente unico"
```

---

### Task 9: Interfaz de ajustes

**Files:**
- Create: `translator-pwa/src/app/SettingsSheet.tsx`
- Modify: `translator-pwa/src/app/page.tsx` (cabecera, líneas 773-799)

**Interfaces:**
- Consumes: `PRESETS`, `DEFAULT_PROVIDER_ID` (Task 4); `loadProviderSettings`, `saveProviderSettings`, `clearProviderSettings` (Task 7); `postTranslate` (Task 8); `encodeWav`, `TARGET_SAMPLE_RATE` (Task 6).
- Produces: componente `SettingsSheet({ open, onClose })`.

- [ ] **Step 1: Crear el componente**

Crear `src/app/SettingsSheet.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { PRESETS, DEFAULT_PROVIDER_ID } from "#lib/providers/index";
import {
  loadProviderSettings,
  saveProviderSettings,
  clearProviderSettings,
} from "#lib/providerSettings";
import { postTranslate } from "#lib/apiClient";
import { encodeWav, TARGET_SAMPLE_RATE } from "#lib/wavEncoder";

type TestState = { status: "idle" | "testing" | "ok" | "error"; message?: string };

/** Genera un clip WAV de un segundo de silencio para comprobar credenciales. */
function silentWavBlob(): Blob {
  return new Blob([encodeWav(new Float32Array(TARGET_SAMPLE_RATE), TARGET_SAMPLE_RATE)], {
    type: "audio/wav",
  });
}

export default function SettingsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [providerId, setProviderId] = useState<string>(DEFAULT_PROVIDER_ID);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [usingServer, setUsingServer] = useState(true);
  const [test, setTest] = useState<TestState>({ status: "idle" });

  useEffect(() => {
    if (!open) return;
    const saved = loadProviderSettings();
    if (saved) {
      setProviderId(saved.id);
      setApiKey(saved.apiKey);
      setModel(saved.model || "");
      setUsingServer(false);
    } else {
      setUsingServer(true);
    }
    setTest({ status: "idle" });
  }, [open]);

  if (!open) return null;

  const preset = PRESETS[providerId];

  const handleSave = () => {
    if (!apiKey.trim()) return;
    saveProviderSettings({
      id: providerId,
      apiKey: apiKey.trim(),
      model: model.trim() || undefined,
    });
    setUsingServer(false);
    onClose();
  };

  const handleClear = () => {
    clearProviderSettings();
    setApiKey("");
    setModel("");
    setUsingServer(true);
    setTest({ status: "idle" });
  };

  const handleTest = async () => {
    setTest({ status: "testing" });
    // Se guarda antes de probar para que postTranslate use estos ajustes.
    if (apiKey.trim()) {
      saveProviderSettings({
        id: providerId,
        apiKey: apiKey.trim(),
        model: model.trim() || undefined,
      });
    }
    try {
      await postTranslate({ blob: silentWavBlob(), mimeType: "audio/wav", direction: "auto" });
      setTest({ status: "ok", message: "Conexión correcta." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      // Un clip en silencio no contiene voz: que el modelo no devuelva JSON
      // significa que la clave funcionó y la petición llegó al proveedor.
      const reachedProvider = /JSON|vacía|incompleta/i.test(message);
      setTest(
        reachedProvider
          ? { status: "ok", message: "Clave válida (el clip de prueba no contiene voz)." }
          : { status: "error", message }
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-lg rounded-t-3xl border border-slate-800 bg-slate-950 p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Proveedor de IA</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ajustes"
            className="rounded-lg bg-slate-900 px-3 py-1 text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {usingServer && (
          <p className="mb-4 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
            Usando la configuración del servidor. Añade tu propia clave solo si quieres usar otro
            proveedor o tu propia cuota.
          </p>
        )}

        <fieldset className="mb-4">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            Proveedor
          </legend>
          <div className="space-y-2">
            {Object.values(PRESETS).map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${
                  providerId === p.id
                    ? "border-violet-600 bg-violet-950/40 text-white"
                    : "border-slate-800 bg-slate-900/60 text-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="provider"
                  value={p.id}
                  checked={providerId === p.id}
                  onChange={() => {
                    setProviderId(p.id);
                    setTest({ status: "idle" });
                  }}
                  className="accent-violet-600"
                />
                <span className="flex-1">{p.label}</span>
                {p.requiresWav && (
                  <span className="text-[10px] text-slate-500">convierte el audio</span>
                )}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">
          API key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Pega aquí tu clave"
          autoComplete="off"
          className="mb-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white"
        />
        <a
          href={preset.keyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 inline-block text-xs text-violet-400 underline"
        >
          Obtener una clave de {preset.label}
        </a>

        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">
          Modelo (opcional)
        </label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={preset.defaultModel}
          className="mb-4 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white"
        />

        {test.status !== "idle" && (
          <p
            className={`mb-3 rounded-xl p-3 text-xs ${
              test.status === "ok"
                ? "bg-emerald-950/60 text-emerald-200"
                : test.status === "error"
                ? "bg-red-950/60 text-red-200"
                : "bg-slate-900 text-slate-300"
            }`}
          >
            {test.status === "testing" ? "Probando conexión…" : test.message}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={!apiKey.trim() || test.status === "testing"}
            className="flex-1 rounded-xl bg-slate-800 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Probar conexión
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!apiKey.trim()}
            className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Guardar
          </button>
        </div>

        <button
          type="button"
          onClick={handleClear}
          className="mt-3 w-full text-xs text-slate-500 hover:text-slate-300"
        >
          Borrar clave y volver a la configuración del servidor
        </button>

        <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
          La clave se guarda solo en este dispositivo, en el almacenamiento del navegador. Quien
          tenga acceso al teléfono desbloqueado puede leerla. Puedes revocarla en cualquier momento
          desde el panel de tu proveedor.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Añadir el botón en la cabecera**

En `src/app/page.tsx`, importar el componente y añadir el estado:

```tsx
import SettingsSheet from "./SettingsSheet";
```

```tsx
  const [showSettings, setShowSettings] = useState(false);
```

Dentro del `<div className="flex items-center gap-2 shrink-0">` de la cabecera (línea 773), añadir antes del bloque del conmutador de voz:

```tsx
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            aria-label="Ajustes del proveedor de IA"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-800 bg-slate-900/90 text-slate-300 hover:text-white"
          >
            ⚙️
          </button>
```

Y justo antes del cierre de `</main>` (línea 1200), montar el panel:

```tsx
      <SettingsSheet open={showSettings} onClose={() => setShowSettings(false)} />
```

- [ ] **Step 3: Verificar compilación y tests**

Run: `npm run build && npm test`
Expected: compilación exitosa y suite en verde.

- [ ] **Step 4: Comprobación manual en el navegador**

Run: `npm run dev`
Abrir `http://localhost:3000`, pulsar el engranaje y verificar: el panel abre y cierra, el selector cambia el enlace de "Obtener una clave", el placeholder del modelo cambia con el proveedor, y "Guardar" queda deshabilitado con el campo de clave vacío.

- [ ] **Step 5: Commit**

```bash
git add src/app/SettingsSheet.tsx src/app/page.tsx
git commit -m "feat: panel de ajustes para elegir proveedor y clave propia"
```

---

### Task 10: Documentación y validación real

Cierra el riesgo abierto en la sección 3.3 del spec: la aplicación nunca se ha ejecutado contra una API real.

**Files:**
- Modify: `translator-pwa/README.md`
- Modify: `docs/CONTEXT.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: documentación de uso y resultado de la verificación manual.

- [ ] **Step 1: Documentar el soporte multi-proveedor en el README**

Añadir tras la sección "Configuración" de `translator-pwa/README.md`:

```markdown
## Proveedores de IA

La aplicación funciona con el proveedor configurado en el servidor (por defecto Gemini) y permite
que cada usuario aporte su propia clave desde el panel de ajustes (⚙️ en la cabecera).

| Proveedor | Modelo por defecto | Notas |
|---|---|---|
| Google Gemini | `gemini-2.0-flash` | Acepta el audio del iPhone sin conversión. Capa gratuita generosa. |
| OpenAI | `gpt-4o-audio-preview` | Solo admite wav/mp3: el audio se convierte en el navegador. |
| OpenRouter | `google/gemini-2.0-flash-001` | Solo admite wav/mp3: el audio se convierte en el navegador. |

La clave introducida en los ajustes se guarda únicamente en el navegador del dispositivo y viaja al
backend en la cabecera `x-provider-key` de cada petición. El `baseUrl` de cada proveedor está fijado
en el servidor y no puede alterarse desde el cliente.
```

- [ ] **Step 2: Añadir los términos nuevos al glosario**

En `docs/CONTEXT.md`, añadir una sección tras "Conceptos de producto":

```markdown
## Proveedores

- **Proveedor (`provider`)**: servicio de IA que transcribe y traduce el audio. Identificado por `id` (`gemini`, `openai`, `openrouter`).
- **Preset (`ProviderPreset`)**: descripción declarativa de un proveedor en el servidor: `baseUrl`, modelo por defecto, si exige conversión a WAV y dónde obtener una clave.
- **Adaptador (`AudioTranslator`)**: implementación que traduce audio para una familia de API. Hay dos: nativo de Gemini y OpenAI-compatible.
- **Ajustes de proveedor (`ProviderSettings`)**: elección del usuario guardada en el dispositivo (`id`, `apiKey`, `model` opcional). Su ausencia significa "usar la configuración del servidor".
```

- [ ] **Step 3: Configurar una clave real**

```bash
cp .env.local.example .env.local
```

Editar `.env.local` y poner una clave real de https://aistudio.google.com/apikey en `GEMINI_API_KEY`.

Verificar que `.env.local` está ignorado por git:

```bash
git check-ignore -v .env.local
```

Expected: la ruta aparece listada como ignorada. Si no lo está, **detenerse** y añadirla a `.gitignore` antes de continuar.

- [ ] **Step 4: Validación real desde el iPhone**

Run: `npm run dev -- --hostname 0.0.0.0`

Desde el iPhone, en la misma red wifi, abrir `http://<ip-del-equipo>:3000`. Nota: Safari exige HTTPS para el micrófono salvo en `localhost`, así que si el micrófono no arranca, desplegar en Vercel y probar sobre la URL pública.

Comprobar, en este orden:

1. Modo "Una frase": grabar «Buenos días, ¿dónde está la estación?» y confirmar que devuelve japonés y lo reproduce.
2. Que el MIME enviado (`audio/mp4`) es aceptado por la API real. Si devuelve error de formato, cambiar en `src/lib/translator.ts` el valor de retorno de `normalizeMimeType` para las ramas de mp4/m4a/aac de `"audio/mp4"` a `"audio/m4a"`, actualizar las aserciones correspondientes en `tests/api-mock.test.mjs` y repetir la prueba.
3. Modo "Conversación": un turno en español y otro en japonés.

- [ ] **Step 5: Registrar el resultado**

Añadir al final del README una línea con la fecha de la verificación y el formato que resultó aceptado, para que quede constancia de que la aplicación se probó contra la API real.

- [ ] **Step 6: Commit**

```bash
git add README.md ../docs/CONTEXT.md
git commit -m "docs: documentar proveedores y registrar la validacion real"
```

---

## Fuera de alcance

No se implementa (recogido en la sección 10 del spec): pipeline de dos pasos, Groq, modelos auto-alojados, caché de traducciones ni streaming. La interfaz `AudioTranslator` admite añadirlos después sin reescribir lo existente.
