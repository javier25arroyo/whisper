# Especificación de Diseño: Traductor PWA Español ↔ Japonés con Gemini para iPhone

- **Fecha:** 2026-08-24
- **Estado:** Validado / Listo para Planificación
- **Autor:** Antigravity & javier25arroyo
- **Ubicación en el repositorio:** `translator-pwa/`
- **Rama:** `mis-cambios`

---

## 1. Resumen Ejecutivo
Creación de una Progressive Web Application (PWA) móvil desarrollada en Next.js 15 (App Router), optimizada para iOS (Safari en iPhone 15), que permite traducir voz bidireccionalmente entre Español y Japonés en tiempo real. 

La aplicación utiliza la API de Google Gemini (`gemini-2.0-flash`) para transcribir y traducir en un solo paso, síntesis de voz en el dispositivo con la Web Speech API, y se despliega como servicio serverless en Vercel con coste cero.

---

## 2. Arquitectura del Sistema

```
+-------------------------------------------------------------------+
|                        iPhone 15 (Safari PWA)                     |
|                                                                   |
|   +-------------------+                     +-----------------+   |
|   |  Micrófono (16kHz)| ---- MediaRecorder -> |  Cliente Web    |   |
|   |  audio/mp4 (AAC)  |                     |  (React/Next.js)|   |
|   +-------------------+                     +--------+--------+   |
|                                                      |            |
|   +-------------------+                              | POST Form  |
|   | Web Speech API    | <--- Audio Síntesis ---------+            |
|   | (es-MX / ja-JP)   |                                           |
+---+-------------------+------------------------------+------------+
                                                       |
                                            HTTPS /api/translate
                                                       |
+------------------------------------------------------v------------+
|                   Vercel Serverless Function                      |
|                                                                   |
|   +-----------------------------------------------------------+   |
|   | Node.js Runtime (/api/translate)                          |   |
|   | - Extracción de audio en memoria (Buffer)                 |   |
|   | - Detección/Normalización de MIME type                    |   |
|   | - Inyección de GEMINI_API_KEY desde process.env           |   |
|   +-----------------------------+-----------------------------+   |
+---------------------------------|---------------------------------+
                                  |
                   Google Gemini API (gemini-2.0-flash)
                                  |
                                  v
           Transcripción + Detección Idioma + Traducción JSON
```

---

## 3. Especificación de Componentes

### 3.1 Frontend (`src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`)
1. **Header & Controles Globales**:
   - Título de la app e icono.
   - Switch de **Auto-speak** (Activado por defecto): Reproduce la traducción inmediatamente tras recibir respuesta.
2. **Selector de Dirección (`DirectionSelector`)**:
   - `auto`: Detección automática de si el hablante usa Español o Japonés.
   - `es-ja`: Fuerza transcripción en español y traducción a japonés.
   - `ja-es`: Fuerza transcripción en japonés y traducción a español.
3. **Control de Grabación (`RecordButton`)**:
   - Botón ergonómico de 112px centrado.
   - Animación de anillos pulsantes (`pulse-ring`) durante la grabación activa.
   - Contador de segundos en vivo (límite automático a 30 segundos).
   - Indicador de estado "Procesando" con spinner al enviar a Gemini.
4. **Tarjetas de Resultado (`TranslationCard`)**:
   - Tarjeta Original: Bandera del idioma detectado, transcripción exacta, botón de reproducción de audio 🔊.
   - Tarjeta Traducida: Bandera del idioma de destino, traducción natural, botón de reproducción de audio 🔊 y botón de copiar al portapapeles 📋.
5. **Historial de Sesión (`HistoryList`)**:
   - Muestra las últimas 8 traducciones de la sesión actual.
   - Permite tocar cualquier elemento histórico para recargarlo y volver a escucharlo.

### 3.2 Backend Route Handler (`src/app/api/translate/route.ts`)
- **Método**: `POST`
- **Content-Type**: `multipart/form-data`
- **Campos esperados**:
  - `audio`: Archivo binario grabado (`Blob`/`File`).
  - `direction`: Cadena `"auto" | "es-ja" | "ja-es"`.
- **Lógica de Procesamiento**:
  1. Validación de tamaño (< 15 MB) y presencia de archivo.
  2. Conversión a Base64 sin escribir a disco.
  3. LLamada a `@google/generative-ai` usando el modelo `gemini-2.0-flash`.
  4. Formato de salida estructurado en JSON:
     ```json
     {
       "detected_language": "es",
       "original_text": "Hola, mucho gusto en conocerte.",
       "translation": "こんにちは、はじめまして。"
     }
     ```
  5. Manejo de excepciones y códigos de estado HTTP adecuados (400, 422, 500).

---

## 4. Requisitos Específicos para iOS y PWA
1. **Web App Manifest (`public/manifest.json`)**:
   - `display`: `standalone`
   - `theme_color`: `#020617`
   - `background_color`: `#020617`
   - `icons`: 192x192 y 512x512 para pantalla de inicio.
2. **Metadatos de Apple (`src/app/layout.tsx`)**:
   - `<meta name="apple-mobile-web-app-capable" content="yes" />`
   - `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />`
   - `<link rel="apple-touch-icon" href="/icons/icon-192.png" />`
3. **Manejo de Audio en Safari**:
   - Detección de soporte `audio/mp4` vs `audio/webm`.
   - Inicialización del contexto de síntesis de voz en el primer gesto de usuario para evitar bloqueos de autoplay en iOS.
   - Adaptación del viewport para respetar áreas seguras (`safe-area-inset-top` y `safe-area-inset-bottom`) en pantallas con Dynamic Island.

---

## 5. Seguridad y Variables de Entorno
- La clave `GEMINI_API_KEY` se almacena exclusivamente como variable de entorno secreta en Vercel.
- Ninguna clave sensible se expone en el bundle del cliente (`NEXT_PUBLIC_*`).
- Se provee archivo `.env.local.example` para pruebas locales.

---

## 6. Despliegue en Vercel
- **Repositorio**: `javier25arroyo/whisper` (rama `mis-cambios`)
- **Framework Preset**: Next.js
- **Root Directory**: `translator-pwa`
- **Environment Variables**:
  - `GEMINI_API_KEY`: Clave obtenida de Google AI Studio.

---

## 7. Plan de Verificación y Pruebas
1. **Verificación de Compilación**:
   - Ejecución de `npm install` y `npm run build` en el directorio `translator-pwa`.
   - Cero errores de tipado en TypeScript y bundle generado con éxito.
2. **Verificación de PWA e Íconos**:
   - Comprobación de que `manifest.json` e íconos son servidos con código 200.
3. **Prueba End-to-End en iOS**:
   - Abrir en Safari en iPhone.
   - Añadir a la pantalla de inicio.
   - Probar grabación en español → verificar traducción en japonés y pronunciación.
   - Probar grabación en japonés → verificar traducción en español y pronunciación.
