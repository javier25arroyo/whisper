# 🎙️ Whisper — Fork personal de `javier25arroyo`

> Fork de [openai/whisper](https://github.com/openai/whisper) con soporte Docker/GPU y una **PWA de traducción bidireccional Español ↔ Japonés** construida encima.

[[Blog original]](https://openai.com/blog/whisper)
[[Paper]](https://arxiv.org/abs/2212.04356)
[[Model card]](model-card.md)
[[Upstream repo]](https://github.com/openai/whisper)

---

## ¿Qué es este repositorio?

Este repo tiene **dos capas**:

| Capa | Qué es | Dónde vive |
|------|--------|-----------|
| **Whisper core** | Modelo de reconocimiento de voz de OpenAI (sin modificar) | `/whisper`, `/tests`, `pyproject.toml` |
| **Docker** | Imagen con CUDA 12.1 para usar Whisper con GPU sin instalar nada localmente | `Dockerfile`, `docker-compose.yml` |
| **Translator PWA** | App Web Progresiva de traducción por voz ES↔JA construida sobre Gemini | `/translator-pwa` |
| **Next.js app** | Template base con shadcn/ui para nuevas vistas | `/next-app` |

---

## Whisper — Motor de reconocimiento de voz

Whisper es un modelo de reconocimiento de voz de propósito general entrenado sobre un enorme dataset de audio diverso. Puede realizar:

- 🗣️ Reconocimiento de voz multilingüe
- 🌐 Traducción de voz a inglés
- 🔍 Identificación de idioma
- 📝 Detección de actividad de voz

### Arquitectura

![Approach](https://raw.githubusercontent.com/openai/whisper/main/approach.png)

Un modelo Transformer seq2seq entrenado conjuntamente en múltiples tareas. Los tokens especiales actúan como especificadores de tarea, permitiendo que un único modelo reemplace toda una pipeline de procesamiento de voz.

### Modelos disponibles

| Tamaño | Parámetros | Solo inglés | Multilingüe | VRAM requerida | Velocidad relativa |
|:------:|:----------:|:-----------:|:-----------:|:-------------:|:-----------------:|
| tiny | 39 M | `tiny.en` | `tiny` | ~1 GB | ~10x |
| base | 74 M | `base.en` | `base` | ~1 GB | ~7x |
| small | 244 M | `small.en` | `small` | ~2 GB | ~4x |
| medium | 769 M | `medium.en` | `medium` | ~5 GB | ~2x |
| large | 1550 M | — | `large` | ~10 GB | 1x |
| **turbo** | 809 M | — | `turbo` | ~6 GB | ~8x |

> [!TIP]
> **`turbo`** es la opción recomendada: velocidad cercana a `tiny` con calidad de `large-v3`.

### Instalación estándar (sin Docker)

```bash
pip install -U openai-whisper
```

Requiere `ffmpeg` en el sistema:

```bash
# Ubuntu / Debian
sudo apt update && sudo apt install ffmpeg

# macOS
brew install ffmpeg

# Windows (Chocolatey)
choco install ffmpeg
```

### Uso rápido por CLI

```bash
# Transcribir con modelo turbo (por defecto)
whisper audio.mp3 --model turbo

# Transcribir audio en otro idioma
whisper audio.wav --language Spanish

# Traducir al inglés
whisper audio.wav --model medium --language Japanese --task translate
```

> [!NOTE]
> El modelo `turbo` **no traduce**: si necesitas traducción, usa `medium` o `large`.

### Uso desde Python

```python
import whisper

model = whisper.load_model("turbo")
result = model.transcribe("audio.mp3")
print(result["text"])
```

---

## 🐳 Docker con soporte GPU

Este fork incluye un entorno Docker listo para usar Whisper con **CUDA 12.1 + cuDNN 8**, sin necesidad de instalar Python, PyTorch ni ffmpeg localmente.

### Requisitos

- Docker y Docker Compose
- [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)

### Construir la imagen

```bash
docker compose build
```

El modelo `turbo` se descarga durante el build y queda cacheado en un volumen Docker.

### Transcribir un archivo

Coloca tus archivos de audio en la carpeta `./data/` y ejecuta:

```bash
# Transcripción básica
docker compose run --rm whisper /data/audio.mp3 --model turbo

# Con idioma explícito
docker compose run --rm whisper /data/audio.wav --language Spanish

# Traducción al inglés
docker compose run --rm whisper /data/audio.mp3 --model medium --task translate
```

### Variables de build

| Argumento | Valor por defecto | Descripción |
|-----------|------------------|-------------|
| `PYTHON_VERSION` | `3.11` | Versión de Python dentro del contenedor |
| `WHISPER_MODEL` | `turbo` | Modelo pre-descargado en la imagen |

---

## 📱 Translator PWA — ES ↔ JA

Una **Progressive Web App** para traducción bidireccional por voz entre Español y Japonés, optimizada para iPhone/iOS Safari.

📂 Código en [`/translator-pwa`](translator-pwa/)

### Características

- 🎙️ **Grabación optimizada para iOS Safari** (`audio/mp4` / WebM)
- ⚡ **Baja latencia** — transcripción y traducción en una sola llamada a la API
- 🔊 **TTS automático** con voces nativas en `ja-JP` y `es-MX`
- 📲 **PWA instalable** — funciona como app nativa en pantalla de inicio
- 💬 **Modo conversación** — turnos bidireccionales gestionados automáticamente
- 📜 **Historial local** — almacenado en `localStorage`, reproducible

### Proveedores de IA soportados

| Proveedor | Modelo por defecto | Notas |
|-----------|-------------------|-------|
| **Google Gemini** ✅ | `gemini-3.6-flash` | Acepta `audio/mp4` directamente. Capa gratuita generosa. |
| OpenAI | `gpt-4o-audio-preview` | Solo WAV/MP3 (conversión en navegador). |
| OpenRouter | `google/gemini-3.8-flash` | Solo WAV/MP3 (conversión en navegador). |

### Instalación y desarrollo

```bash
cd translator-pwa
cp .env.local.example .env.local
# → Editar .env.local y añadir GEMINI_API_KEY=tu_clave

npm install
npm run dev        # http://localhost:3000
```

### Comandos disponibles

```bash
npm run dev      # Servidor de desarrollo
npm run build    # Build de producción
npm run start    # Servidor de producción
npm test         # Suite de tests
```

### Modos de la app

| Modo | Descripción |
|------|-------------|
| **Single** | Un botón → habla → recibe traducción. Una acción = una traducción. |
| **Conversación** | Sesión bidireccional con turnos automáticos ES ↔ JA. |

---

## 🗂️ Estructura del repositorio

```
whisper/
├── whisper/           # Paquete Python de OpenAI Whisper (sin modificar)
├── tests/             # Tests del core de Whisper
├── data/              # Carpeta de audio para Docker (montada como volumen)
├── notebooks/         # Jupyter notebooks de ejemplo
├── Dockerfile         # Imagen Docker con CUDA 12.1
├── docker-compose.yml # Configuración Docker Compose
├── translator-pwa/    # PWA de traducción ES↔JA (Next.js + Gemini)
├── next-app/          # Template Next.js + shadcn/ui
├── docs/              # Documentación del dominio y ADRs
└── pyproject.toml     # Configuración del paquete Python
```

---

## 🌿 Estructura de ramas

| Rama | Propósito |
|------|-----------|
| `main` | Sincronización con `openai/whisper` upstream. **Solo commits de upstream.** |
| `mis-cambios` | Todos los cambios propios (Docker, PWA, experimentos). |
| Ramas de feature | Derivadas de `mis-cambios`. Se integran via PR. |

> [!IMPORTANT]
> **Nunca** hagas commits de cambios propios en `main`. Esa rama es solo para sincronizar con upstream.

---

## 🧪 Tests

```bash
# Tests del core de Whisper
python -m pytest tests/

# Tests de la PWA
cd translator-pwa && npm test
```

---

## 📄 Licencia

El código y los pesos del modelo de Whisper se publican bajo la **Licencia MIT**. Ver [LICENSE](LICENSE) para más detalles.

Los añadidos de este fork (Docker, Translator PWA) son también MIT.
