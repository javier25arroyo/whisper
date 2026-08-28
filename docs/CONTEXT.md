# CONTEXT — Translator PWA

> Glosario canónico del dominio de la PWA de traducción ES↔JA. Sin detalles de implementación.
> Fuente única de verdad para nombres de conceptos. Si un término no está aquí, todavía no es canónico.

## Idiomas

- **Español (`es`)**: idioma de entrada/salida en el lado del usuario hispanohablante. Locale TTS por defecto `es-MX`.
- **Japonés (`ja`)**: idioma del interlocutor. Locale TTS `ja-JP`. Texto en kanji+hiragana+katakana (no transliterar).
- **Idioma detectado (`detected_language`)**: idioma que Gemini infiere del audio de entrada. Siempre `es` o `ja`.

## Conceptos de producto

- **Modo (`mode`)**: estado global de la UI. Valores: `single`, `conversation`. Determina el layout y la lógica de turnos.
- **Modo single (`mode = 'single'`)**: el usuario pulsa el botón, habla, recibe una traducción. Una acción = una traducción.
- **Modo conversación (`mode = 'conversation'`)**: sesión bidireccional alternada donde la app gestiona los turnos automáticamente. Múltiples acciones encadenadas = una sesión.
- **Lado (`side`)**: hemisferio lingüístico en conversación. Valores: `es`, `ja`. En single no aplica.
- **Lado activo (`activeSide`)**: el lado que actualmente está hablando/escuchando en conversation. `null` cuando ambos están idle.
- **Turno (`turn`)**: unidad atómica de una conversación. Empieza cuando el micro del lado activo se abre y termina cuando se cierra (por silencio, hard-limit o gesto de cancelación).
- **Sesión de conversación (`session_id`)**: agrupación de turnos consecutivos dentro del mismo `mode = 'conversation'`. Cambia cuando el usuario sale del modo o cierra la app.

## Estado del lado (en conversación)

- **`idle`**: el lado no está escuchando ni reproduciendo. Apagado visual.
- **`listening`**: micro abierto del lado, capturando audio del interlocutor.
- **`speaking`**: TTS reproduciendo la traducción dirigida al lado.
- **`processing`**: audio enviado a Gemini, esperando respuesta. Visualmente similar a `speaking` pero con spinner.

## Direcciones

- **`direction`**: configuración explícita del usuario sobre cómo traducir. Valores: `auto`, `es-ja`, `ja-es`.
- **`direction = 'auto'`**: Gemini detecta el idioma del audio y traduce al opuesto. Es el único válido en `mode = 'conversation'`.
- **`direction = 'es-ja'` / `'ja-es'`**: fuerzan el idioma detectado y la dirección de traducción. Sólo en `mode = 'single'`.

## Historial

- **Item de historial (`HistoryItem`)**: unidad persistida en `localStorage`. Representa un turno o una traducción single.
- **Modo del item (`mode`)**: refleja en qué modo se generó. Permite separar visualmente o no (decisión: unificar en una sola lista).
- **Speaker (`speaker`)**: en conversation, qué lado habló. En single, igual a `detected_language`.

## Gestos (modo conversación)

- **Tap largo en orbe activo**: cancela TTS, cierra micro, lado vuelve a `idle`.
- **Doble tap en un orbe**: fuerza ese lado como hablante siguiente (invierte `activeSide`).
- **Cambio de modo** (segmented control): sale de la sesión. Cancela TTS, cierra micro, limpia timers. Historial se preserva.

## Reglas duras

- **RMS threshold**: -45 dBFS para considerar "hay voz". Por debajo durante >700ms → cerrar turno.
- **Soft limit**: 30s. Pasado eso, animación de aviso en el orbe activo.
- **Hard limit**: 45s. Corta el audio automáticamente y envía el chunk a Gemini.
- **Micro cerrado durante speaking**: cuando un lado está en `speaking`, el otro lado (si estuviera `listening`) cierra su micro para evitar feedback loop.