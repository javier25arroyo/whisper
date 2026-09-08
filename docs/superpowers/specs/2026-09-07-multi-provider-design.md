# Especificación de Diseño: Soporte de Múltiples Proveedores de IA vía API Key

- **Fecha:** 2026-09-07
- **Estado:** Validado / Listo para Planificación
- **Autor:** javier25arroyo & Claude
- **Ubicación en el repositorio:** `translator-pwa/`
- **Rama:** `mis-cambios`
- **Diseño previo relacionado:** `docs/superpowers/specs/2026-08-24-iphone-translator-pwa-design.md`

---

## 1. Resumen Ejecutivo

La PWA de traducción está acoplada a un único proveedor: el SDK `@google/generative-ai` con el modelo `gemini-2.0-flash` codificado directamente en `src/lib/translator.ts`. La clave se lee de una sola variable de entorno, `GEMINI_API_KEY`.

Este diseño introduce un registro de proveedores que permite usar la aplicación con distintos servicios de IA aportando únicamente una API key, priorizando los que ofrecen capa gratuita. El objetivo declarado por el usuario es no depender de suscripciones costosas y que el proyecto quede abierto a cualquier endpoint compatible.

El caso de uso motivador es un viaje a Japón: la aplicación se usará desde un iPhone 15, instalada como PWA, para conversar con personas en japonés.

---

## 2. Decisiones de Diseño

Decisiones tomadas durante la sesión de brainstorming, con su justificación:

| Decisión | Elección | Motivo |
|---|---|---|
| Estrategia de coste | Capas gratuitas de proveedores cloud + conector genérico plugable | El usuario descarta mantener infraestructura propia, pero quiere libertad de backend |
| Ubicación de las claves | Híbrida: configuración por entorno en el servidor + override opcional en la aplicación | Funciona sin configurar nada, pero permite que cualquiera use su propia clave |
| Flujo de audio | Una sola llamada (audio directo), con la interfaz preparada para un pipeline de dos pasos futuro | Menor latencia en conversación real; sin trabajo especulativo |
| Arquitectura | Registro de adaptadores por proveedor | Evita poner en riesgo el camino de Gemini, que es el único que acepta el audio nativo del iPhone |

Se evaluaron y descartaron dos alternativas:

- **Unificar todo bajo la capa OpenAI-compatible de Gemini**, eliminando el SDK de Google. Descartada tras la investigación de la sección 3: esa capa no acepta el formato de audio que graba el iPhone.
- **Recetas declarativas por proveedor** (un JSON que describe cómo construir la petición y parsear la respuesta, con un intérprete genérico). Descartada por sobreingeniería: es un mini-DSL para dos familias de API.

---

## 3. Hallazgos de Investigación

Tres hallazgos condicionan el diseño. Los dos primeros salieron de consultar la documentación oficial; el tercero, de revisar el estado del repositorio.

### 3.1 La capa OpenAI-compatible acepta menos formatos que la API nativa

La API nativa de Gemini acepta como entrada en línea: `audio/wav`, `audio/mp3`, `audio/aiff`, `audio/aac`, `audio/ogg`, `audio/flac`, `audio/mpeg`, `audio/m4a`, `audio/l16`, `audio/opus`, `audio/alaw`, `audio/mulaw` y `audio/webm`.

Su capa OpenAI-compatible, en cambio, restringe `input_audio` a **wav y mp3**. Hay reportes de error `Invalid audio format` al enviar m4a por esa vía. La documentación de OpenAI tampoco muestra otros formatos en sus ejemplos.

### 3.2 `MediaRecorder` nunca produce wav ni mp3

Safari en iOS graba mp4/AAC; Chrome y Android graban webm/Opus. Ningún navegador entrega wav o mp3 de forma nativa.

Combinado con el hallazgo anterior, esto significa que OpenAI y OpenRouter serían inutilizables desde cualquier navegador si se enviara el audio tal cual. El conector genérico quedaría siendo un cascarón con un único proveedor funcional, lo que no cumple el objetivo. La solución adoptada es la conversión a WAV en el cliente descrita en la sección 6.

### 3.3 La aplicación nunca se ha ejecutado contra la API real

No existe ni ha existido un archivo `.env.local` en el proyecto, únicamente `.env.local.example`. Los 54 tests que pasan lo hacen contra mocks. En particular, `normalizeMimeType` devuelve `audio/mp4` para las grabaciones de iOS, mientras que la lista oficial de MIME types admitidos menciona `audio/m4a` y `audio/aac`, pero no `audio/mp4`.

Esto no es un defecto introducido por este diseño, pero es un riesgo abierto para el viaje y se incorpora al plan de verificación de la sección 9.

---

## 4. Arquitectura

### 4.1 Estructura de archivos

```
translator-pwa/src/lib/
  providers/
    types.ts          Interfaz común y tipos de preset
    gemini.ts         Adaptador del SDK nativo (código actual movido aquí)
    openaiCompat.ts   Adaptador fetch a /chat/completions con input_audio
    index.ts          Registro { id → adaptador } y presets
  translator.ts       Helpers agnósticos de proveedor (se conserva)
  apiClient.ts        Punto único de llamada del cliente a /api/translate
  wavEncoder.ts       Conversión a WAV con Web Audio API
```

### 4.2 Interfaz común

```ts
type ProviderConfig = { apiKey: string; model?: string; baseUrl?: string };
type TranslateInput = { audioBase64: string; mimeType: string; direction?: string };

interface AudioTranslator {
  translate(cfg: ProviderConfig, input: TranslateInput): Promise<TranslationResult>;
  acceptsMimeType(mimeType: string): boolean;
}
```

`acceptsMimeType` es la pieza que permite avisar al usuario antes de grabar, en lugar de fallar con un error críptico después. Es también lo que decide si hay que convertir el audio a WAV.

### 4.3 Qué se conserva de `translator.ts`

Las funciones que no dependen del proveedor se quedan donde están y mantienen su comportamiento: `getPromptForDirection`, `normalizeMimeType`, `normalizeLanguage` y `extractAndParseGeminiJson`, esta última renombrada a `parseTranslationJson` por dejar de ser específica de Gemini. Los tests existentes siguen siendo válidos.

`route.ts` deja de invocar directamente al SDK: resuelve qué proveedor usar y delega en su adaptador.

---

## 5. Resolución de Configuración

### 5.1 Cliente

Existen hoy dos puntos de llamada a la API: el modo single (`src/app/page.tsx:254`) y el modo conversación (`src/app/page.tsx:471`). Ambos pasan a usar un helper único, `postTranslate(formData)` en `src/lib/apiClient.ts`, que lee los ajustes guardados y añade las cabeceras correspondientes.

Centralizar la llamada evita que un modo quede desincronizado del otro cuando cambie la configuración.

Cabeceras enviadas (nunca parámetros de URL ni query string):

```
x-provider-id:    gemini | openai | openrouter
x-provider-key:   clave del usuario
x-provider-model: opcional, modelo concreto
```

### 5.2 Servidor

`route.ts` resuelve la configuración en este orden:

1. Si llegan cabeceras válidas y el `id` existe en el registro, se usa la configuración del usuario.
2. En caso contrario, se usa la del entorno (`GEMINI_API_KEY` y opcionalmente `PROVIDER_ID`, `PROVIDER_MODEL`).

Sin configurar nada, el comportamiento es idéntico al actual. La compatibilidad hacia atrás es total.

### 5.3 Presets

Los presets son datos, no código, y viven en `providers/index.ts`:

| id | Transporte | Audio nativo del iPhone (m4a) | Coste |
|---|---|---|---|
| `gemini` | SDK nativo | Aceptado directamente | Capa gratuita generosa |
| `openai` | OpenAI-compatible | Requiere conversión a WAV | De pago |
| `openrouter` | OpenAI-compatible | Requiere conversión a WAV | Algunos modelos gratuitos |

Cada preset define: identificador, etiqueta visible, `baseUrl`, modelo por defecto, formatos de audio aceptados y URL donde obtener una clave.

---

## 6. Conversión de Audio a WAV en el Cliente

Necesaria para los proveedores que solo aceptan wav/mp3. Se implementa con Web Audio API, sin dependencias externas:

```
Blob grabado
  → AudioContext.decodeAudioData()      Safari decodifica AAC/m4a correctamente
  → OfflineAudioContext a 16 kHz mono   remuestreo
  → cabecera PCM + samples con DataView escritura del WAV
```

Aproximadamente 40 líneas. Se descarta `ffmpeg.wasm` de forma explícita: son varios megabytes de descarga, penalización inaceptable con datos móviles en el extranjero.

**La conversión solo se ejecuta cuando el proveedor seleccionado la exige.** Con Gemini el audio se envía tal cual, sin latencia añadida ni cambios en el camino que ya funciona.

Dimensionamiento: 30 segundos a 16 kHz mono 16-bit ocupan unos 960 KB, holgadamente por debajo del límite de 15 MB que ya valida la ruta API.

---

## 7. Interfaz de Ajustes

No se añade una ruta nueva. Se accede mediante un icono de engranaje en la cabecera, junto al conmutador de voz automática (`src/app/page.tsx:773`), que abre un panel (`SettingsSheet`).

Contenido:

- Selector de proveedor entre los presets disponibles.
- Estado por defecto visible: *«Usando la configuración del servidor (Gemini)»*. Cero configuración para el caso habitual.
- Campo de clave con `type="password"` y enlace a la página donde obtener una clave gratuita del proveedor elegido.
- Campo de modelo opcional, con el valor por defecto del preset como placeholder.
- Botón **Probar conexión**: envía un clip corto real y muestra el resultado. Descubrir que una clave no funciona debe ocurrir antes de salir de viaje, no durante una conversación en Tokio.
- Botón para borrar la clave guardada, junto al aviso de dónde se almacena.

---

## 8. Seguridad

### 8.1 Prevención de SSRF

Permitir que el cliente envíe un `baseUrl` arbitrario convertiría el backend en un proxy capaz de emitir peticiones a cualquier destino, incluidas direcciones internas de la infraestructura de despliegue.

Por ello, **`baseUrl` no viaja en las cabeceras**. Procede siempre del preset, que actúa como lista blanca en el servidor. Un endpoint propio queda fuera del alcance de esta versión; si se añadiera, se habilitaría exclusivamente mediante variable de entorno, es decir, por decisión del operador y nunca del navegador.

### 8.2 Las claves no se registran en logs

El `console.error` actual imprime el error devuelto por Gemini. Los adaptadores devolverán errores saneados, sin eco de credenciales ni de cabeceras de autenticación. Existe un test dedicado a esta garantía.

### 8.3 Almacenamiento en el dispositivo

La clave del usuario se guarda en `localStorage`. Es razonable para una clave propia en un dispositivo propio, pero es legible por cualquier script de la página y por quien acceda al teléfono desbloqueado. Se advierte de ello en la interfaz de ajustes, y las claves son revocables desde el panel del proveedor correspondiente.

---

## 9. Plan de Verificación

### 9.1 Tests existentes

Los 54 tests actuales deben seguir pasando sin modificación de comportamiento. Las funciones agnósticas cambian de archivo, no de semántica.

### 9.2 Tests nuevos

Con `node --test`, siguiendo la convención del repositorio (sin frameworks adicionales):

- Resolución de proveedor: override del cliente, caída al entorno, e identificador inválido.
- Rechazo de cualquier `baseUrl` que no proceda de la lista blanca.
- `acceptsMimeType` por preset.
- Saneamiento de errores: el mensaje devuelto no contiene la clave.
- Codificador WAV: sobre un buffer sintético, verificar cabecera correcta, 16 kHz y canal mono. Es la pieza con mayor riesgo de fallo silencioso —audio que se envía pero suena a ruido—, por lo que lleva su propia comprobación.

### 9.3 Validación manual imprescindible

Una llamada real a Gemini con un archivo m4a grabado desde el iPhone, para confirmar que `audio/mp4` es aceptado (hallazgo 3.3). Sin esta prueba no hay garantía de funcionamiento en destino, con independencia de la calidad del código.

---

## 10. Fuera de Alcance

Se excluyen deliberadamente, por aplicación de YAGNI. La interfaz definida admite añadirlos después sin reescritura:

- Pipeline de dos pasos (transcripción y traducción separadas).
- Groq como proveedor. Su Whisper solo transcribe y su endpoint de traducción solo produce inglés, por lo que no encaja en el modelo de una sola llamada.
- Modelos auto-alojados u Ollama local.
- Caché de traducciones y respuestas en streaming.

---

## 11. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| `audio/mp4` no aceptado por la API nativa | La aplicación no funciona en el viaje | Validación manual de la sección 9.3 antes de partir |
| Bug silencioso en el codificador WAV | Audio enviado pero ininteligible | Test dedicado del codificador |
| Clave del usuario expuesta en el dispositivo | Uso indebido de su cuota | Aviso explícito en la interfaz; claves revocables |
| Sin cobertura de datos en destino | La aplicación no traduce | Fuera del alcance del software: requiere eSIM o wifi |

---

## 12. Referencias

- [Compatibilidad OpenAI de Gemini](https://ai.google.dev/gemini-api/docs/openai)
- [Comprensión de audio en Gemini](https://ai.google.dev/gemini-api/docs/audio)
- [Foro Google AI: formatos de audio en la API compatible](https://discuss.ai.google.dev/t/more-audio-file-type-support-in-openai-compatible-api/77438)
