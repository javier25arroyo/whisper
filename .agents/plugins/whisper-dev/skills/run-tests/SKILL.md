---
name: run-tests
description: >-
  Ejecuta los tests del proyecto Whisper. Usa este skill cuando el usuario pida
  correr tests, verificar que el codigo funciona, hacer un check antes de un commit,
  o diagnosticar errores en los tests.
---

# Skill: Ejecutar Tests de Whisper

## Requisitos previos
Asegurate de que el entorno virtual esta activo o de que las dependencias estan instaladas:
```bash
pip install -e ".[dev]"
```

## Ejecutar todos los tests
```bash
python -m pytest tests/ -v
```

## Ejecutar un test especifico
```bash
python -m pytest tests/<archivo>.py -v
```

## Ejecutar con coverage
```bash
python -m pytest tests/ --cov=whisper --cov-report=term-missing
```

## Verificar formato y linting (pre-commit)
```bash
pre-commit run --all-files
```

## Verificacion
- Exit code 0 = todos los tests pasaron.
- Exit code 1 = hay fallos; leer el output para identificarlos.
- Nunca hacer push si los tests fallan.
