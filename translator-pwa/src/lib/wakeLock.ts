export interface WakeLockSentinelLike {
  release(): Promise<void>;
}

export interface WakeLockController {
  enable(): Promise<void>;
  disable(): void;
  /** Llamar cuando la página vuelve a ser visible: el sistema libera el lock al ocultarla. */
  onVisible(): Promise<void>;
}

/**
 * Controlador puro de Screen Wake Lock. `request` es `() => navigator.wakeLock.request("screen")`
 * o `null` si el navegador no lo soporta. Sin él, una persona que no puede tocar la pantalla
 * ve cómo el auto-bloqueo del iPhone mata la sesión a mitad de conversación.
 */
export function createWakeLock(
  request: (() => Promise<WakeLockSentinelLike>) | null
): WakeLockController {
  let lock: WakeLockSentinelLike | null = null;
  let wanted = false;
  // Cada adquisición lleva un número: si `disable` o una petición más nueva ocurren
  // mientras la anterior está pendiente, el sentinel tardío se libera en vez de filtrarse.
  let ticket = 0;

  const dropLock = () => {
    const old = lock;
    lock = null;
    old?.release().catch(() => {});
  };

  const acquire = async () => {
    if (!request || !wanted) return;
    const mine = ++ticket;
    try {
      const sentinel = await request();
      if (!wanted || mine !== ticket) {
        sentinel.release().catch(() => {});
        return;
      }
      lock = sentinel;
    } catch {
      // Sin wake lock no pasa nada grave: la pantalla puede apagarse, nada más.
    }
  };

  return {
    enable() {
      wanted = true;
      if (lock) return Promise.resolve();
      return acquire();
    },
    disable() {
      wanted = false;
      ticket++;
      dropLock();
    },
    onVisible() {
      if (!wanted) return Promise.resolve();
      dropLock();
      return acquire();
    },
  };
}
