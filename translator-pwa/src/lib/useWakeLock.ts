import { useEffect } from "react";
import { createWakeLock } from "./wakeLock.ts";

/**
 * Mantiene la pantalla encendida mientras `active` es true y readquiere el lock cada
 * vez que la página vuelve a ser visible. Requiere iOS ≥ 16.4; en PWA instalada hubo
 * fallos hasta iOS 18.4, así que se degrada en silencio.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    const controller = createWakeLock(() => navigator.wakeLock.request("screen"));
    void controller.enable();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void controller.onVisible();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      controller.disable();
    };
  }, [active]);
}

export default useWakeLock;
