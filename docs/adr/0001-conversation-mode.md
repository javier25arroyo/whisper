# ADR-0001: Modo conversación bidireccional ES↔JA

- **Estado:** Aceptado
- **Fecha:** 2026-08-26
- **Contexto:** `translator-pwa/`

## Contexto y problema

La PWA actual opera exclusivamente en `mode = 'single'`: el usuario pulsa un botón, habla, recibe una traducción. Para mantener una conversación real con un interlocutor japonés, el usuario debe:

1. Cambiar manualmente `direction` después de cada traducción.
2. Pulsar el botón de grabación cada vez.
3. Sufrir un retardo perceptible entre "lo que dije" y "lo que el otro entendió".

Esto contradice el caso de uso principal del producto (intérprete de bolsillo durante un viaje o una reunión) y obliga al usuario a gestionar el "flujo" de la conversación él mismo. La fricción cognitiva acumulada hace que la app se sienta como una herramienta de traducción, no como un intérprete.

## Decisión

Introducir un segundo modo de operación, `mode = 'conversation'`, que automatiza los turnos. La elección entre modos vive en un `segmented control` en el header, junto al toggle de auto-speak.

### Modelo

- `mode: 'single' | 'conversation'`. Default `single`.
- En `conversation`, la `direction` se ignora (siempre `auto`). Gemini detecta el idioma del turno.
- Cada lado (`es`, `ja`) tiene un estado independiente: `idle | listening | speaking | processing`.
- Solo un lado puede estar en `listening` o `speaking` a la vez (mutex implícito por `activeSide`).
- `activeSide` indica el lado actualmente en `listening`/`speaking`.

### Flujo de un turno

1. `activeSide.listening = true`. Micro abierto, RMS analizador activo.
2. RMS > -45 dBFS → última marca de sonido se actualiza.
3. RMS < -45 dBFS durante >700ms → cerrar chunk → enviar a `/api/translate` → estado `processing`.
4. Backend responde con `{ detected_language, original_text, translation }`.
5. Si `autoSpeak` activo: lado opuesto → `speaking` → reproducir TTS → al terminar → setTimeout 800ms (pausa natural) → lado opuesto → `listening`. Vuelta al paso 1 con `activeSide` invertido.
6. Si `autoSpeak` desactivado: el lado opuesto queda en `idle` hasta que el usuario pulse reproducir manualmente.

### Reglas

- **Hard limit 45s**: si un turno alcanza 45s sin silencio detectado, se corta y envía.
- **Soft limit 30s**: a los 30s, el orbe del lado activo pulsa más rápido (warning visual, sin haptic — iOS no soporta vibración en Safari web sin PWA instalada).
- **Micro cerrado durante `speaking`**: para evitar que la app se grabe a sí misma.
- **Cancelación**: tap largo en orbe activo aborta TTS + cierra micro + vuelve a `idle`. Doble tap fuerza el lado como próximo hablante.

### Layout

- En `conversation`: split vertical. Mitad superior = ES, mitad inferior = JA. Cada mitad tiene:
  - Bandera + nombre del idioma.
  - Orbe grande con animación según estado (idle apagado, listening pulso verde, speaking onda violeta, processing spinner).
  - Última transcripción y traducción recibidas por ese lado (chip pequeño).
- Header conserva: segmented control `[Single | Conversation]`, toggle auto-speak, dirección (sólo visible en single).
- Footer PWA-tip se oculta en conversation (no hay espacio y no aporta durante una sesión activa).

### Persistencia

- `localStorage` con schema versionado (`v: 2`). Items del esquema v1 (sin `mode`) se migran en lectura.
- `HistoryItem` extendido con: `mode`, `session_id?`, `turn_index?`, `speaker?`.
- Límite: 50 items en `conversation`, 10 en `single` (lo más reciente primero siempre).
- Items con mismo `session_id` se agrupan en el historial con un separador visual de sesión.

### Tests

- Unit tests para `rmsSilenceDetector` (silence threshold, soft limit, hard limit).
- Integration test del flujo: mock Gemini + mock Web Audio API → verificar transiciones de estado.
- Test del endpoint `/api/translate` extendido con `mode` y `session_id` (opcional, el backend no los necesita pero el front puede mandarlos para logging futuro).

## Consecuencias

**Positivas:**
- La app pasa de "herramienta" a "intérprete". Reduce fricción cognitiva drásticamente.
- El caso de uso principal (conversación con japonés) deja de requerir manipulación constante.
- Reutiliza el 90% del backend actual; el cambio es principalmente de UI/estado en el cliente.

**Negativas:**
- La complejidad del cliente crece: pasamos de un `useState` simple a una máquina de estados explícita. Riesgo de bugs sutiles en transiciones.
- El RMS threshold necesita calibración empírica con iPhone en entornos reales (calle, restaurante). El número `-45 dBFS / 700ms` es un punto de partida, no un valor definitivo.
- Dos modos significa dos UIs que mantener. Riesgo de divergencia visual.

**Neutras:**
- El backend `/api/translate` no cambia (sigue recibiendo audio + `direction`). `direction` se manda siempre como `auto` en conversation pero el backend ya lo trata como cadena opcional.
- El historial existente sigue siendo compatible tras la migración v1→v2.

## Alternativas consideradas

1. **Sala abierta con dos micros simultáneos**: rechazada. Requiere echo cancellation agresivo, doble consumo de API (Gemini facturaría por cada chunk doble), y es físicamente imposible en un solo dispositivo: solo hay un micro.
2. **VAD con WASM (Silero)**: rechazada para v1. +2MB al bundle, calibración más compleja. Se puede añadir como upgrade futuro si el RMS no es suficiente.
3. **Sheet deslizante sobre single**: rechazada. Confunde el modelo mental (sigue siendo single "con algo encima"). Mejor UI dedicada.
4. **Historial separado por modo**: rechazada. Pierde la continuidad narrativa de la sesión.

## Notas de implementación

- Máquina de estados: usar `useReducer` con tipos discriminados en lugar de múltiples `useState`. Más fácil de testear y razonar.
- `rmsSilenceDetector` debe ser un hook reutilizable (`useSilenceDetector`) que tome un `MediaStream` y devuelva `{ start, stop, isSilent }`.
- El modo conversación **no debe** estar disponible si `GEMINI_API_KEY` no está configurado (mostrar fallback al usuario con mensaje claro).
- iOS Safari puede tardar >500ms en arrancar `getUserMedia` la primera vez. El primer turno debe mostrar un pre-loader explícito ("preparando micrófono...").