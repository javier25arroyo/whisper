# Traductor PWA Español ↔ Japonés con Gemini Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir y dejar lista para despliegue en Vercel una aplicación PWA en Next.js 15 optimizada para iPhone (Safari) que traduce voz bidireccionalmente entre Español y Japonés usando Google Gemini 2.0 Flash y Web Speech API.

**Architecture:** Frontend en Next.js 15 (React 19, Tailwind CSS) optimizado para Safari iOS con MediaRecorder y síntesis de voz Web Speech API; backend serverless en Route Handler (`/api/translate`) que procesa audio Base64 y realiza transcripción + traducción estructurada JSON en una sola llamada a `gemini-2.0-flash`.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, `@google/generative-ai` SDK, Web Audio API / MediaRecorder, Web Speech API (`SpeechSynthesis`), Vercel Serverless Functions.

**Spec:** `docs/superpowers/specs/2026-08-24-iphone-translator-pwa-design.md`

## Global Constraints

- Root Directory de la app: `translator-pwa/`
- Rama de trabajo en Git: `mis-cambios`
- No guardar secretos en el código; `GEMINI_API_KEY` se lee exclusivamente de variables de entorno en el servidor.
- Compatibilidad con iOS Safari: Soporte para formato `audio/mp4` además de `audio/webm`, y respeto a `safe-area-inset` para iPhone con Dynamic Island.
- Cero advertencias ni errores de compilación en `npm run build`.

---

### Task 1: Configuración del Proyecto y Generación de Assets PWA

**Files:**
- Create: `translator-pwa/public/icons/icon-192.png`
- Create: `translator-pwa/public/icons/icon-512.png`
- Modify: `translator-pwa/public/manifest.json`
- Modify: `translator-pwa/package.json`

**Interfaces:**
- Consumes: N/A
- Produces: Íconos PNG válidos en `public/icons/` y manifiesto PWA verificado.

- [ ] **Step 1: Generar script para crear los íconos PNG de la PWA**

Crear un script rápido en Node.js o PowerShell que genere íconos PNG válidos de 192x192 y 512x512 con fondo morado `#6d28d9` y emoji de micrófono/traducción o canvas para que Safari y navegadores puedan instalarlos correctamente como PWA.

- [ ] **Step 2: Ejecutar script de generación de íconos**

Ejecutar el script y comprobar que los archivos existen en `translator-pwa/public/icons/icon-192.png` y `translator-pwa/public/icons/icon-512.png`.

- [ ] **Step 3: Validar `manifest.json` y `package.json`**

Verificar que `public/manifest.json` hace referencia a `/icons/icon-192.png` y `/icons/icon-512.png` y que `package.json` tiene los scripts `dev`, `build` y `start`.

- [ ] **Step 4: Commit**

```bash
git add translator-pwa/public/ translator-pwa/package.json
git commit -m "feat: configurar assets e iconos PWA para translator-pwa"
```

---

### Task 2: Implementación y Validación del Route Handler `/api/translate`

**Files:**
- Modify: `translator-pwa/src/app/api/translate/route.ts`
- Create: `translator-pwa/tests/api-mock.test.mjs`

**Interfaces:**
- Consumes: `multipart/form-data` con campo `audio` (Blob) y campo opcional `direction` ("auto" | "es-ja" | "ja-es").
- Produces: JSON response `{ detected_language: "es" | "ja", original_text: string, translation: string }` con status 200, o `{ error: string }` con status 4xx/5xx.

- [ ] **Step 1: Escribir test de validación para la lógica de la API**

Crear `translator-pwa/tests/api-mock.test.mjs` que verifique que el endpoint rechaza peticiones sin audio (400) y valida el schema de salida JSON.

- [ ] **Step 2: Ejecutar test para verificar fallos esperados**

Ejecutar: `node translator-pwa/tests/api-mock.test.mjs`
Expected: Verificar validaciones de entrada.

- [ ] **Step 3: Implementar/Refinar `src/app/api/translate/route.ts`**

Asegurar que el endpoint maneja correctamente `gemini-2.0-flash`, normaliza los MIME types (`audio/mp4`, `audio/webm`, `audio/m4a`, `audio/ogg`), extrae el bloque JSON de la respuesta y devuelve `{ detected_language, original_text, translation }`.

- [ ] **Step 4: Ejecutar test y verificar que pasa**

Ejecutar: `node translator-pwa/tests/api-mock.test.mjs`
Expected: Validaciones pasando.

- [ ] **Step 5: Commit**

```bash
git add translator-pwa/src/app/api/translate/route.ts translator-pwa/tests/
git commit -m "feat: implementar backend route handler /api/translate con Gemini 2.0 Flash"
```

---

### Task 3: Implementación del Frontend Completo y Experiencia iOS en `page.tsx`

**Files:**
- Modify: `translator-pwa/src/app/page.tsx`
- Modify: `translator-pwa/src/app/globals.css`
- Modify: `translator-pwa/src/app/layout.tsx`

**Interfaces:**
- Consumes: `/api/translate` POST endpoint, Web Audio `MediaRecorder`, Web Speech `SpeechSynthesis`.
- Produces: Interfaz de usuario interactiva completa con Auto-speak toggle, Selector de dirección, Botón de grabación animado, Tarjetas de resultados con TTS y copiado, e Historial.

- [ ] **Step 1: Integrar estilos globales y soporte de Safe Area Insets**

Verificar en `src/app/globals.css` y `src/app/layout.tsx` que se configuran las variables `env(safe-area-inset-top)` y `env(safe-area-inset-bottom)`, las metaetiquetas `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` y `viewport` con `userScalable: false`.

- [ ] **Step 2: Implementar funcionalidad completa en `src/app/page.tsx`**

Asegurar que `src/app/page.tsx` incluye:
1. Estado `autoSpeak` con botón toggle en el header.
2. Detección automática de tipo MIME soportado por el navegador (`audio/webm;codecs=opus` vs `audio/mp4`).
3. Manejo del ciclo de grabación con `MediaRecorder` y cronómetro visual.
4. Envío a `/api/translate` y actualización de estado `result` e `history`.
5. Ejecución automática de `speak()` si `autoSpeak` está activo tras recibir respuesta.
6. Manejo de errores con mensajes comprensibles para el usuario.

- [ ] **Step 3: Commit**

```bash
git add translator-pwa/src/app/page.tsx translator-pwa/src/app/globals.css translator-pwa/src/app/layout.tsx
git commit -m "feat: completar interfaz de usuario PWA con soporte iOS, auto-speak e historial"
```

---

### Task 4: Instalación de Dependencias y Verificación de Compilación (Build Check)

**Files:**
- Inspect: `translator-pwa/node_modules/`
- Output: `translator-pwa/.next/`

**Interfaces:**
- Consumes: Todo el código fuente de `translator-pwa/`.
- Produces: Bundle compilado listo para producción de Next.js sin errores de TypeScript.

- [ ] **Step 1: Instalar dependencias con npm**

Ejecutar `npm install` en el directorio `translator-pwa`.

- [ ] **Step 2: Ejecutar compilación de producción**

Ejecutar `npm run build` en el directorio `translator-pwa`.
Expected: `✓ Compiled successfully` y generación de rutas estáticas y dinámicas.

- [ ] **Step 3: Commit**

```bash
git add translator-pwa/package.json translator-pwa/package-lock.json
git commit -m "chore: verificar compilacion exitosa de Next.js para translator-pwa"
```

---

### Task 5: Documentación de Despliegue en Vercel y Configuración en iPhone

**Files:**
- Create: `translator-pwa/README.md`

**Interfaces:**
- Consumes: Proyecto compilado y probado.
- Produces: Guía paso a paso ilustrada para que el usuario despliegue en Vercel y use la app en su iPhone 15.

- [ ] **Step 1: Escribir guía detallada de despliegue en `translator-pwa/README.md`**

Incluir:
1. Cómo obtener la API Key gratis en Google AI Studio (`https://aistudio.google.com/apikey`).
2. Pasos exactos para importar el repositorio en Vercel con **Root Directory** = `translator-pwa`.
3. Configuración de la variable de entorno `GEMINI_API_KEY`.
4. Instrucciones para abrir en Safari en el iPhone 15 y pulsar **Compartir > Agregar a pantalla de inicio**.
5. Instrucciones de uso y resolución de problemas comunes (micrófono en Safari).

- [ ] **Step 2: Commit y Push a GitHub**

```bash
git add translator-pwa/README.md
git commit -m "docs: agregar guia de despliegue en Vercel e instalacion en iPhone"
git push origin mis-cambios
```
