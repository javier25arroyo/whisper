"use client";

import { useCallback, useEffect, useState } from "react";

export type ThemeName = "light" | "dark";

const STORAGE_KEY = "whisper_pwa_theme";

function applyTheme(theme: ThemeName) {
  document.documentElement.setAttribute("data-theme", theme);
}

/** Tema global claro/oscuro, persistido en localStorage. Sin sincronización
 * automática con el sistema: el usuario elige explícitamente (ver MASTER.md). */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeName>("dark");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") {
        setThemeState(saved);
      }
    } catch {
      // No-op
    }
  }, []);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // No-op
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
