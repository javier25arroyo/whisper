# MASTER — Sistema de diseño "Dos Soles" (Whisper ES↔JA)

Fuente única de verdad para el rediseño de la PWA de traducción de voz español↔japonés.
Todo token de color, tipografía, espaciado, radio, sombra y movimiento usado en el código
sale de aquí. Nada de valores mágicos sueltos en los componentes.

## Tesis visual

Shell neutro cálido (papel/carbón, no azul-gris frío) en sans redondeada geométrica que
cambia limpio entre claro/oscuro. Lado ES vibrante en terracota/naranja atardecer con
superficies de acento en degradado. Lado JA sereno en rojo-amanecer minimalista sobre
espacio en blanco generoso. Espaciado airy en toda la app. Radios suaves, profundidad por
sombra cálida sutil en superficies de acento, chrome neutral plano.

**Motivo cultural**: "Dos Soles" — el sol cálido del atardecer (ES) y el amanecer sereno
(JA, 朝日 asahi). Se evita deliberadamente el patrón de rayos del Kyokujitsu-ki (bandera
militar imperial, sensible en Asia); el sol japonés aquí es un disco/curva minimalista sin
rayos, más cercano al Hinomaru estilizado que a simbología militar.

## Tesis de interacción

Transiciones rápidas 150–250ms, easing `cubic-bezier(0.22, 1, 0.36, 1)` (expo-out, sin
rebote). Hover/press con cambio de opacidad/brillo, nunca scale elástico. Aparición de
resultados/historial: fade + slide corto (8px), sin parallax ni scroll-reveal. Prohibido:
bounce/spring, animar `width`/`height` (usar `transform`/`opacity`), cualquier motion que
distraiga en contexto de emergencia. Siempre respeta `prefers-reduced-motion`.

**Excepción crítica**: `EmergencySheet` NO usa la paleta serena JA. Una emergencia necesita
alto contraste y rojo de alarma (`--danger`) sin matizar — la calma estética del lado JA
sería contraproducente ahí.

## Color — tokens (`globals.css`, vía CSS custom properties)

### Neutrales (claro por defecto)
| Token | Claro | Oscuro |
|---|---|---|
| `--bg` | `#FFFBF5` | `#171310` |
| `--bg-elevated` | `#FFFFFF` | `#211C17` |
| `--surface` | `#FFF8EF` | `#241F19` |
| `--surface-muted` | `#F5EDE4` | `#2C2620` |
| `--line` | `#E7DCCF` | `#3A322A` |
| `--text` | `#241C15` | `#F5EFE7` |
| `--text-muted` | `#6B5D4F` | `#C9BCAC` |
| `--text-faint` | `#9C8C7A` | `#8B7E6E` |

### Acento ES — terracota/atardecer (vibrante)
`--es-500: #EA580C` · `--es-600: #C2410C` · `--es-700: #9A3412`
`--es-surface` claro `#FFF1E6` / oscuro `rgba(234,88,12,0.16)`
`--es-gradient: linear-gradient(135deg, #FB923C, #DC2626)`

### Acento JA — rojo-amanecer (sereno, minimal)
`--ja-500: #C1443A` · `--ja-600: #A6362D` · `--ja-700: #7F281F`
`--ja-surface` claro `#FDF0EE` / oscuro `rgba(166,54,45,0.14)`
`--ja-gradient: linear-gradient(180deg, #FFE3DC 0%, #FFF8F3 65%)` (uso sutil, no protagonista)

### Semánticos
`--danger: #DC2626` (fijo, no cambia con tema — emergencias) · `--success: #16A34A`
`--focus-ring: #2563EB` (fijo en ambos temas y ambos acentos, para previsibilidad)

## Tipografía

Familia única para toda la app (headings, body, botones): **M PLUS Rounded 1c** — redondeada,
geométrica, cobertura nativa de japonés y latino (evita mezclar dos fuentes con distinto
ritmo). Fallback: `'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'Inter', system-ui, sans-serif`.

| Rol | Tamaño/interlineado | Peso |
|---|---|---|
| Display (empty state) | 26px/32px | 700 |
| H1 (header app) | 18px/24px | 700 |
| H2 (títulos sección) | 15px/22px | 700 |
| Body / traducción principal | 16px/24px | 500–600 |
| Label/badge (uppercase) | 11px/16px | 700 |
| Caption (timestamps, fine print) | 11px/14px | 500 |

## Espaciado, radios, sombra

- Base 4px: `1=4 2=8 3=12 4=16 5=20 6=24 8=32 10=40 14=56`
- Radios: `sm=10px md=16px lg=22px full=999px`
- Sombra cálida (nunca negro puro): `sm 0 1px 2px rgba(36,28,21,.06)` · `md 0 4px 12px rgba(36,28,21,.10)` · `lg 0 12px 32px rgba(36,28,21,.16)`
- Glow de acento: ES `0 8px 24px rgba(234,88,12,.35)` · JA `0 8px 24px rgba(166,54,45,.22)` (más sutil, "sereno")

## Movimiento

`--dur-fast: 150ms` `--dur-base: 200ms` `--dur-slow: 250ms` `--ease-out: cubic-bezier(.22,1,.36,1)`

## Iconografía

Dos capas, ambas SVG, ninguna emoji:

- **Identidad cultural** (`components/icons.tsx`): glifos de sol propios — relleno
  degradado para ES, línea minimalista para JA — reemplazan las banderas 🇲🇽/🇯🇵 (ya no
  aplicaban: la app es simétrica ES↔JA, no México-específica).
- **Iconografía funcional** (`lucide-react`): micrófono, volumen, copiar, ajustes,
  cerrar, historial, etc. Reemplazan todos los emojis funcionales que quedaban
  (🎙️ 🔊 📋 ⚙️ 💬 ✕ 🎯 📜 ⏹ 🔁 ⚠️ ✅ 📱 ➔). Tamaño vía `className` (`w-4 h-4`, etc.),
  color vía `currentColor` vía `text-*`.

## Tema claro/oscuro

Un solo toggle global (no auto-detección de sistema). Persistido en `localStorage`.
Por defecto oscuro (mantiene la primera impresión actual de la app). Los acentos ES/JA
mantienen su identidad de hue en ambos modos; solo cambian los neutrales de fondo/texto.
