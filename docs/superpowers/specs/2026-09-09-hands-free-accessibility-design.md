# Especificación de Diseño: Grabación Sin Corte Prematuro y Accesibilidad Manos Libres (Control por Voz)

- **Fecha:** 2026-09-09
- **Estado:** Validado / Listo para Planificación
- **Autor:** javier25arroyo & Claude
- **Ubicación en el repositorio:** `translator-pwa/`
- **Rama:** `mis-cambios`

---

## 1. Resumen Ejecutivo

Dos problemas relacionados, motivados por el mismo caso de uso: el usuario no tiene movilidad en las manos y usa el iPhone únicamente con Control por voz (accesibilidad del sistema operativo iOS).

1. **La grabación se corta a los ~10 segundos**, incluso cuando el usuario sigue hablando. La causa raíz no es un límite de tiempo fijo, sino un detector de silencio demasiado agresivo (700 ms) que interpreta pausas naturales al hablar como el fin del turno.
2. **La app no es utilizable sin manos.** El modo conversación ya tiene, por diseño previo, una interacción táctil equivalente a lo que necesita Control por voz (un toque abre un menú con botones reales), pero los nombres accesibles de los controles son descripciones técnicas que nadie pronuncia en voz alta ("Orbe Tú (Español) · toca para menú"), no órdenes naturales.

El diseño corrige ambos con cambios acotados: subir el umbral de silencio, y renombrar los controles existentes para que su nombre accesible sea exactamente lo que una persona diría en voz alta.

---

## 2. Contexto de la Investigación

Antes de diseñar se verificaron dos supuestos que condicionaban todo el enfoque. Ambos se investigaron porque asumirlos sin comprobar habría llevado a construir algo inútil en el escenario real (Japón, PWA instalada, sin manos).

### 2.1 Reconocimiento de voz dentro de la app (descartado)

La primera idea — que la propia app escuche una palabra clave ("listo", "traduce") para cerrar el turno — se descartó tras comprobar que el Web Speech API **no funciona en PWAs instaladas en la pantalla de inicio de iOS**, solo en pestañas de Safari. Fuentes: [What PWA Can Do Today](https://whatpwacando.today/speech-recognition/) ("This feature works in Safari on iOS but not (yet) for installed web apps"), [PWA iOS Limitations 2026](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide). Como esta PWA se instala en la pantalla de inicio para el viaje, construir sobre esa API habría producido una función que falla exactamente donde se necesita.

### 2.2 Control por voz del sistema durante una grabación activa (confirmado)

La alternativa —Control por voz de iOS, una función de accesibilidad del sistema operativo, no del navegador— sí funciona en apps instaladas. Quedaba una duda de bajo nivel sin documentar públicamente: si Control por voz sigue escuchando "toca detener" mientras la propia página ya tiene el micrófono ocupado grabando (`getUserMedia`). Los criterios oficiales de evaluación de Apple para Control por voz ([enlace](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/voice-control-evaluation-criteria/)) sugerían que sí ("si tu app tiene una opción de grabación... asegúrate de que el usuario pueda iniciar y detener la grabación usando solo su voz"), pero es una pista, no una confirmación técnica.

**Verificado empíricamente por el usuario en su iPhone real**: con Control por voz activo y una grabación en curso, decir "toca detener" sí interrumpe la grabación. Este hecho es la base de todo el diseño de la sección 4.

---

## 3. Causa Raíz del Corte Prematuro

`useSilenceDetector` ([useSilenceDetector.ts:9](../../../translator-pwa/src/lib/useSilenceDetector.ts)) usa un umbral de 700 ms de silencio continuo para cerrar el turno. Cualquier pausa natural al pensar o respirar más larga que eso termina la grabación. Para una frase de varias cláusulas, esa pausa suele caer alrededor de los 8-12 segundos de haber empezado a hablar — de ahí la percepción de "se corta a los diez segundos".

**Decisión:** subir el umbral a **3000 ms** (constante, no configurable — YAGNI, nadie pidió un control deslizante). El límite duro de seguridad (`HARD_LIMIT_SECONDS = 45`, en [conversationMachine.ts:174](../../../translator-pwa/src/lib/conversationMachine.ts)) no cambia; sigue siendo la red de seguridad si alguien queda en silencio sin querer cerrar el turno.

El valor pasa a vivir en `CONVERSATION_CONSTANTS` junto a `SOFT_LIMIT_SECONDS`/`HARD_LIMIT_SECONDS`/`POST_TURN_PAUSE_MS` (mismo objeto, mismo archivo), en vez de quedar como el valor por defecto implícito del hook `useSilenceDetector`. Es el único lugar donde hoy se centralizan los tiempos de la conversación; dejarlo fuera de ahí sería inconsistente con el patrón ya establecido.

---

## 4. Modelo de Interacción Manos Libres

### 4.1 Hallazgo: el modo conversación ya es accesible por estructura, no por nombres

Al leer [ConversationView.tsx](../../../translator-pwa/src/app/ConversationView.tsx) se confirmó que el menú contextual del orbe (`OrbContextMenu`) ya es un `role="menu"` con `<button role="menuitem">` reales — "Cancelar este turno", "Pasar al otro lado". Un toque corto sobre un orbe activo lo abre (`Orb`, función `handlePointerUp`). Esto ya cumple, sin cambios, el criterio de Apple sobre alternativas accesibles a gestos: no hace falta aplanar el menú a un solo paso, dos toques con nombre claro son válidos.

El problema real es que el **punto de entrada** — el propio orbe — tiene un nombre accesible ilegible en voz alta: `"Orbe Tú (Español) · toca para menú"`.

### 4.2 Regla de diseño

El nombre accesible de un control debe ser corto y ser literalmente lo que una persona diría en voz alta para activarlo — nunca una descripción técnica de su función interna.

### 4.3 Etiquetas del orbe, por estado

El toque/orden para abrir un lado del orbe funciona exactamente cuando **nadie más está activo** (`state.activeSide === null`), verificado contra el guard real de `handleConvTapOrb` en `page.tsx` — no depende de a quién le "tocaría" hablar a continuación (esa noción, `isNextSpeaker`, solo controla el estilo visual y el auto-reinicio del micrófono tras la síntesis de voz).

| Condición | Nombre accesible |
|---|---|
| Este lado escuchando (activo) | **"Detener grabación"** — decirlo o tocarlo cierra el turno y envía, igual que ya hace el botón del modo "Una frase" |
| Este lado hablando/procesando | Estado informativo, no accionable (sin cambio de comportamiento) |
| Inactivo, `activeSide === null` | **"Hablar en Español"** / **"Hablar en Japonés"** — accionable |
| Inactivo, el otro lado activo | **"Español, en espera"** / **"Japonés, en espera"** — no accionable, y lo dice explícitamente para no confundir |

Esta tabla corrige una versión anterior del diseño que ataba la etiqueta a `isNextSpeaker`: tras cancelar un turno (`ABORT_ACTIVE`), ambos lados quedan inactivos con `activeSide = null` y `isNextSpeaker` no marca a ninguno como "siguiente" — con la regla vieja, ambos orbes habrían dicho "en espera" estando en realidad los dos accionables.

---

## 5. Auditoría de Nombres en el Resto de la App

Revisado cada control interactivo contra el criterio de Apple "el nombre debe coincidir con lo que se ve/dice". La mayoría ya cumple sin cambios (botón de grabar en modo single, toggle de voz automática, botón de ajustes ⚙️, todo el panel de ajustes, historial, menú del orbe). Tres puntos de fricción real, los tres en [page.tsx](../../../translator-pwa/src/app/page.tsx):

| Control | Problema | Nombre nuevo |
|---|---|---|
| "🎯 Una frase" / "💬 Conversación" | Sin `aria-label`; el nombre por defecto incluye el emoji | `"Una frase"` / `"Conversación"` |
| Selector de dirección (3 botones) | Sin `aria-label`; el nombre por defecto es `"🤖 Auto"` / `"🇲🇽 → 🇯🇵"` | Reutilizar el campo `subLabel` que `DIRECTION_OPTIONS` ya define: `"Detección automática"`, `"Español a Japonés"`, `"Japonés a Español"` — sin texto nuevo |
| "✕ Salir" (modo conversación) | `aria-label` actual: *"Salir del modo conversación"*, más largo de lo que se diría | `"Salir"` |

Fuera de alcance deliberadamente: los botones de frases de muestra en el estado vacío (onboarding, no forman parte del flujo diario de traducción) y cualquier reestructuración de la navegación. No hay gestos sin alternativa accesible ni elementos con auto-ocultado por temporizador (el aviso de onboarding se cierra solo manualmente, sin plazo) — ambos ya cumplen.

---

## 6. Plan de Verificación

Tres niveles, porque Control por voz es una función del sistema operativo que no se puede simular fuera de un iPhone real.

### 6.1 Automatizado (`node --test`, sin dependencias nuevas)

- Test de que `CONVERSATION_CONSTANTS.SILENCE_MS === 3000`.
- La función que decide la etiqueta del orbe (estado + quién está activo → texto) se extrae como función pura, testeable de forma aislada — mismo patrón que el resto del proyecto (lógica en una función, la UI solo la invoca). Casos a cubrir: este lado escuchando, este lado hablando/procesando, inactivo y libre, inactivo y bloqueado por el otro lado.

### 6.2 Verificación en navegador por el controlador (antes de pedir la prueba real)

Confirmar en el DOM real que cada `aria-label` sale exactamente como se diseñó, para detectar errores de cableado (condición invertida, nombre mal puesto) sin necesitar Control por voz real — mismo método ya usado para validar el panel de ajustes del proyecto anterior.

### 6.3 Validación real del usuario en su iPhone (no delegable)

- Activar "Mostrar nombres" de Control por voz y confirmar que cada control lee el nombre corto esperado.
- Una conversación completa usando solo la voz: "hablar en español" → hablar → esperar los 3 s o decir "detener grabación" → confirmar que traduce.
- Probar "cancelar este turno" a mitad de una grabación.

Sin este último paso no hay manera honesta de afirmar que la app funciona manos libres — es la misma limitación, y la misma disciplina, que la validación real contra la API de Gemini del proyecto anterior: lo que no se prueba en el dispositivo real queda documentado como pendiente, no como hecho.

---

## 7. Fuera de Alcance

- Reconocimiento de voz dentro de la app (Web Speech API) — no funciona instalada, descartado en la sección 2.1.
- Umbral de silencio configurable por el usuario — YAGNI, un valor fijo razonable basta.
- Aplanar el menú del orbe a un solo paso — ya es accesible en dos toques con nombre.
- Etiquetas de las frases de muestra del estado vacío.
- Cualquier soporte de dictado de texto personalizado — los únicos campos de texto (clave de API, modelo) son `<input>` estándar de HTML, que Control por voz ya soporta automáticamente sin trabajo adicional.

---

## 8. Referencias

- [Voice Control evaluation criteria — Apple Developer](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/voice-control-evaluation-criteria/)
- [Speech Recognition — What PWA Can Do Today](https://whatpwacando.today/speech-recognition/)
- [PWA iOS Limitations and Safari Support 2026](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
