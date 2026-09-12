---
name: sync-upstream
description: >-
  Sincroniza la rama main del fork con la ultima version de openai/whisper (upstream).
  Usa este skill cuando el usuario pida actualizar desde el proyecto original, sincronizar
  con upstream, traer cambios de OpenAI, o actualizar el fork. Tambien actualiza la rama
  mis-cambios con rebase sobre main una vez sincronizada.
---

# Skill: Sincronizar con upstream (openai/whisper)

## Pasos

1. **Verificar rama actual y estado limpio**
   ```
   git status
   git branch
   ```
   Si hay cambios sin commitear en `mis-cambios`, hacerles commit o stash primero.

2. **Cambiar a `main` y obtener cambios del upstream**
   ```
   git checkout main
   git fetch upstream
   ```

3. **Ver cuántos commits nuevos hay**
   ```
   git log HEAD..upstream/main --oneline
   ```
   Reportar al usuario cuántos commits nuevos trae upstream.

4. **Fusionar upstream en main**
   ```
   git merge upstream/main
   ```

5. **Subir main actualizado a tu fork en GitHub**
   ```
   git push origin main
   ```

6. **Actualizar `mis-cambios` con rebase sobre el nuevo main**
   ```
   git checkout mis-cambios
   git rebase main
   ```
   Si hay conflictos, resolverlos y continuar con `git rebase --continue`.

7. **Subir `mis-cambios` actualizada**
   ```
   git push origin mis-cambios --force-with-lease
   ```

## Verificación
- `git log --oneline -5` para confirmar el historial actualizado.
- `git status` debe mostrar "nothing to commit".
