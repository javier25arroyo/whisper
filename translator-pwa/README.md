# Traductor Español-Japonés PWA (Voice-to-Voice)

Aplicación Web Progresiva (PWA) optimizada para dispositivos móviles (especialmente iPhone / iOS Safari) que permite traducción bidireccional por voz entre Español y Japonés utilizando el modelo multimodal Gemini de Google (u otro proveedor compatible, ver [Proveedores de IA](#proveedores-de-ia)).

## Características

- 🎙️ **Grabación optimizada para iOS Safari**: Grabación de audio directa con soporte `audio/mp4` / WebM.
- ⚡ **Gemini Flash**: Transcripción y traducción de baja latencia en una sola llamada API (`/api/translate`).
- 🔊 **Auto-Speak y TTS de alta calidad**: Reproducción automática y manual con selección de voces en japonés (`ja-JP`) y español (`es-ES` / `es-MX`).
- 📲 **PWA Completa**: Soporte offline para shell de la aplicación, instalable en pantalla de inicio con standalone mode, splash icons y theme color personalizado (#090D16).
- 📜 **Historial Local**: Almacenamiento local de traducciones recientes con reproducción de audio.

## Requisitos Previos

- Node.js >= 18
- Clave de API de Gemini (`GEMINI_API_KEY`)

## Instalación

```bash
cd translator-pwa
npm install
```

## Configuración

Crea un archivo `.env.local` basado en `.env.local.example`:

```bash
cp .env.local.example .env.local
```

Configura tu clave de API:
```env
GEMINI_API_KEY=tu_api_key_aqui
```

## Proveedores de IA

La aplicación funciona con el proveedor configurado en el servidor (por defecto Gemini) y permite
que cada usuario aporte su propia clave desde el panel de ajustes (⚙️ en la cabecera).

| Proveedor | Modelo por defecto | Notas |
|---|---|---|
| Google Gemini | `gemini-3.6-flash` | Acepta el audio del iPhone sin conversión. Capa gratuita generosa. |
| OpenAI | `gpt-4o-audio-preview` | Solo admite wav/mp3: el audio se convierte en el navegador. |
| OpenRouter | `google/gemini-3.8-flash` | Solo admite wav/mp3: el audio se convierte en el navegador. |

La clave introducida en los ajustes se guarda únicamente en el navegador del dispositivo y viaja al
backend en la cabecera `x-provider-key` de cada petición. El `baseUrl` de cada proveedor está fijado
en el servidor y no puede alterarse desde el cliente.

## Scripts Disponibles

- `npm run dev`: Inicia el servidor de desarrollo en `http://localhost:3000`.
- `npm run build`: Compila la aplicación para producción con optimizaciones de Next.js.
- `npm run start`: Inicia el servidor de producción.
- `npm test`: Ejecuta la suite completa de pruebas unitarias y de integración mock (todos los archivos `tests/*.test.mjs`).

## Verificación de Compilación y Tests

```bash
npm run build
npm test
```

## Estado de Validación contra la API Real

- **2026-09-09**: validado con una clave real de Gemini contra `gemini-3.6-flash` desde este entorno de desarrollo: la ruta `/api/translate` autentica, enruta al modelo y parsea la respuesta correctamente (`POST /api/translate → 200`). Google devolvió ocasionalmente `503 Service Unavailable` ("alta demanda") de forma transitoria; no es un fallo de la aplicación, simplemente requiere reintentar. La app no reintenta automáticamente: si ves un error, vuelve a tocar el micrófono.
- **Pendiente**: esta prueba usó un clip de audio sintético (WAV en silencio), no habla real, y se ejecutó desde este entorno, no desde un iPhone. Quedan por confirmar en un iPhone real: que `audio/mp4` (formato que graba Safari en iOS) es aceptado por la API tal cual lo normaliza `normalizeMimeType` en [`src/lib/translator.ts`](src/lib/translator.ts), y una traducción de voz real en ambos sentidos (Español→Japonés y Japonés→Español) en modo "Una frase" y en modo "Conversación". Sigue los pasos de la sección [Configuración](#configuración) y prueba antes del viaje. Tampoco se ha probado aún nada de esto en un iPhone real con Control por voz: activar "Mostrar nombres" y confirmar que cada control lee su nombre corto; completar una conversación entera usando sólo la voz ("hablar en español" → hablar → esperar los 3 s o decir "detener grabación" → confirmar que traduce); y probar "cancelar este turno" a mitad de una grabación.
