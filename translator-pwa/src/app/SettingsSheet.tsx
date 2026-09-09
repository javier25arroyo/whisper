"use client";

import { useEffect, useState } from "react";
import { PRESETS, DEFAULT_PROVIDER_ID } from "#lib/providers/index";
import {
  loadProviderSettings,
  saveProviderSettings,
  clearProviderSettings,
} from "#lib/providerSettings";
import { postTranslate } from "#lib/apiClient";
import { encodeWav, TARGET_SAMPLE_RATE } from "#lib/wavEncoder";

type TestState = { status: "idle" | "testing" | "ok" | "error"; message?: string };

/** Genera un clip WAV de un segundo de silencio para comprobar credenciales. */
function silentWavBlob(): Blob {
  return new Blob([encodeWav(new Float32Array(TARGET_SAMPLE_RATE), TARGET_SAMPLE_RATE)], {
    type: "audio/wav",
  });
}

export default function SettingsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [providerId, setProviderId] = useState<string>(DEFAULT_PROVIDER_ID);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [usingServer, setUsingServer] = useState(true);
  const [test, setTest] = useState<TestState>({ status: "idle" });

  useEffect(() => {
    if (!open) return;
    const saved = loadProviderSettings();
    if (saved) {
      setProviderId(saved.id);
      setApiKey(saved.apiKey);
      setModel(saved.model || "");
      setUsingServer(false);
    } else {
      setUsingServer(true);
    }
    setTest({ status: "idle" });
  }, [open]);

  if (!open) return null;

  const preset = PRESETS[providerId];

  const handleSave = () => {
    if (!apiKey.trim()) return;
    saveProviderSettings({
      id: providerId,
      apiKey: apiKey.trim(),
      model: model.trim() || undefined,
    });
    setUsingServer(false);
    onClose();
  };

  const handleClear = () => {
    clearProviderSettings();
    setApiKey("");
    setModel("");
    setUsingServer(true);
    setTest({ status: "idle" });
  };

  const handleTest = async () => {
    setTest({ status: "testing" });
    // Se guarda antes de probar para que postTranslate use estos ajustes.
    if (apiKey.trim()) {
      saveProviderSettings({
        id: providerId,
        apiKey: apiKey.trim(),
        model: model.trim() || undefined,
      });
    }
    try {
      await postTranslate({ blob: silentWavBlob(), mimeType: "audio/wav", direction: "auto" });
      setTest({ status: "ok", message: "Conexión correcta." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      // Un clip en silencio no contiene voz: que el modelo no devuelva JSON
      // significa que la clave funcionó y la petición llegó al proveedor.
      const reachedProvider = /JSON|vacía|incompleta/i.test(message);
      setTest(
        reachedProvider
          ? { status: "ok", message: "Clave válida (el clip de prueba no contiene voz)." }
          : { status: "error", message }
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-lg rounded-t-3xl border border-slate-800 bg-slate-950 p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Proveedor de IA</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ajustes"
            className="rounded-lg bg-slate-900 px-3 py-1 text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {usingServer && (
          <p className="mb-4 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
            Usando la configuración del servidor. Añade tu propia clave solo si quieres usar otro
            proveedor o tu propia cuota.
          </p>
        )}

        <fieldset className="mb-4">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            Proveedor
          </legend>
          <div className="space-y-2">
            {Object.values(PRESETS).map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${
                  providerId === p.id
                    ? "border-violet-600 bg-violet-950/40 text-white"
                    : "border-slate-800 bg-slate-900/60 text-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="provider"
                  value={p.id}
                  checked={providerId === p.id}
                  onChange={() => {
                    setProviderId(p.id);
                    setTest({ status: "idle" });
                  }}
                  className="accent-violet-600"
                />
                <span className="flex-1">{p.label}</span>
                {p.requiresWav && (
                  <span className="text-[10px] text-slate-500">convierte el audio</span>
                )}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">
          API key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Pega aquí tu clave"
          autoComplete="off"
          className="mb-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white"
        />
        <a
          href={preset.keyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 inline-block text-xs text-violet-400 underline"
        >
          Obtener una clave de {preset.label}
        </a>

        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">
          Modelo (opcional)
        </label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={preset.defaultModel}
          className="mb-4 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white"
        />

        {test.status !== "idle" && (
          <p
            className={`mb-3 rounded-xl p-3 text-xs ${
              test.status === "ok"
                ? "bg-emerald-950/60 text-emerald-200"
                : test.status === "error"
                ? "bg-red-950/60 text-red-200"
                : "bg-slate-900 text-slate-300"
            }`}
          >
            {test.status === "testing" ? "Probando conexión…" : test.message}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={!apiKey.trim() || test.status === "testing"}
            className="flex-1 rounded-xl bg-slate-800 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Probar conexión
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!apiKey.trim()}
            className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Guardar
          </button>
        </div>

        <button
          type="button"
          onClick={handleClear}
          className="mt-3 w-full text-xs text-slate-500 hover:text-slate-300"
        >
          Borrar clave y volver a la configuración del servidor
        </button>

        <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
          La clave se guarda solo en este dispositivo, en el almacenamiento del navegador. Quien
          tenga acceso al teléfono desbloqueado puede leerla. Puedes revocarla en cualquier momento
          desde el panel de tu proveedor.
        </p>
      </div>
    </div>
  );
}
