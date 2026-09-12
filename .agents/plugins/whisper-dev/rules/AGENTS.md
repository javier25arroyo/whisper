# Reglas del proyecto Whisper (Fork personal)

## Estructura de ramas
- `main`: Rama de sincronización con `openai/whisper`. NUNCA hagas commits de cambios propios aquí.
- `mis-cambios`: Rama donde viven todos los cambios personales (Docker, experimentos, etc.).

## Flujo de trabajo obligatorio
- Todo cambio personal va en `mis-cambios` o en una rama derivada de ella.
- Antes de cualquier cambio, verifica en qué rama estás con `git branch`.
- Para sincronizar con upstream, usa el skill `sync-upstream`.

## Docker
- Los archivos `Dockerfile`, `docker-compose.yml` y `.dockerignore` son propios del fork.
- No elimines ni sobreescribas estos archivos al sincronizar.

## Convenciones de commit
- Usa prefijos: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.
- Mensajes en español cuando son cambios propios.
- Mensajes en inglés si el commit viene de upstream.

## Tests
- Antes de hacer push, ejecuta los tests con `python -m pytest tests/`.
- No hagas push si los tests fallan.
