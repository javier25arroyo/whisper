# Traductor Español-Japonés PWA (Voice-to-Voice)

Aplicación Web Progresiva (PWA) optimizada para dispositivos móviles (especialmente iPhone / iOS Safari) que permite traducción bidireccional por voz entre Español y Japonés utilizando el modelo multimodal Gemini 2.0 Flash de Google.

## Características

- 🎙️ **Grabación optimizada para iOS Safari**: Grabación de audio directa con soporte `audio/mp4` / WebM.
- ⚡ **Gemini 2.0 Flash**: Transcripción y traducción de baja latencia en una sola llamada API (`/api/translate`).
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

## Scripts Disponibles

- `npm run dev`: Inicia el servidor de desarrollo en `http://localhost:3000`.
- `npm run build`: Compila la aplicación para producción con optimizaciones de Next.js.
- `npm run start`: Inicia el servidor de producción.
- `npm test`: Ejecuta la suite de pruebas unitarias y de integración mock (`node tests/api-mock.test.mjs`).

## Verificación de Compilación y Tests

```bash
npm run build
npm test
```
