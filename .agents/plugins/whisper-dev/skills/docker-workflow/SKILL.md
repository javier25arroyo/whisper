---
name: docker-workflow
description: >-
  Gestiona el entorno Docker del fork de Whisper. Usa este skill cuando el usuario
  pida construir la imagen Docker, levantar el contenedor, transcribir con Docker,
  ver logs, o reiniciar el servicio. Los archivos Docker son propios del fork y viven
  en la rama mis-cambios.
---

# Skill: Workflow Docker para Whisper

Los archivos Docker del proyecto son:
- `Dockerfile`: Imagen con Whisper instalado
- `docker-compose.yml`: Orquestacion del servicio
- `.dockerignore`: Archivos excluidos del contexto

## Comandos principales

### Construir la imagen
```bash
docker compose build
```

### Levantar el servicio
```bash
docker compose up -d
```

### Transcribir un archivo de audio
```bash
docker compose run --rm whisper whisper audio.mp3 --model medium --language Spanish
```

### Ver logs en tiempo real
```bash
docker compose logs -f
```

### Detener el servicio
```bash
docker compose down
```

### Reconstruir tras cambios en el Dockerfile
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

## Verificacion
- `docker compose ps` para ver el estado de los contenedores.
- `docker images | grep whisper` para verificar que la imagen existe.

## Notas
- Asegurate de estar en la rama `mis-cambios` antes de modificar archivos Docker.
- Los modelos se descargan automaticamente la primera vez; pueden pesar varios GB.
