import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  loadProviderSettings,
  saveProviderSettings,
  clearProviderSettings,
  needsWavConversion,
} from "../src/lib/providerSettings.ts";

function stubBrowser() {
  const store = new Map();
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  return store;
}

afterEach(() => {
  delete globalThis.window;
  delete globalThis.localStorage;
});

describe("providerSettings", () => {
  it("devuelve null sin window (renderizado en servidor)", () => {
    assert.equal(loadProviderSettings(), null);
  });

  it("no lanza al guardar o limpiar sin window", () => {
    assert.doesNotThrow(() => saveProviderSettings({ id: "openai", apiKey: "k" }));
    assert.doesNotThrow(() => clearProviderSettings());
  });

  it("guarda y recupera los ajustes", () => {
    stubBrowser();
    saveProviderSettings({ id: "openrouter", apiKey: "sk-x", model: "modelo-y" });
    assert.deepEqual(loadProviderSettings(), {
      id: "openrouter",
      apiKey: "sk-x",
      model: "modelo-y",
    });
  });

  it("devuelve null cuando lo almacenado está corrupto o el id no existe", () => {
    const store = stubBrowser();
    store.set("whisper_pwa_provider", "{no es json");
    assert.equal(loadProviderSettings(), null);
    store.set("whisper_pwa_provider", JSON.stringify({ id: "inventado", apiKey: "k" }));
    assert.equal(loadProviderSettings(), null);
    store.set("whisper_pwa_provider", JSON.stringify({ id: "openai" }));
    assert.equal(loadProviderSettings(), null, "sin clave no hay ajustes válidos");
  });

  it("borra los ajustes guardados", () => {
    stubBrowser();
    saveProviderSettings({ id: "openai", apiKey: "sk-x" });
    clearProviderSettings();
    assert.equal(loadProviderSettings(), null);
  });
});

describe("needsWavConversion", () => {
  it("no convierte cuando no hay proveedor propio (se usa el del servidor)", () => {
    assert.equal(needsWavConversion(null, "audio/mp4"), false);
  });

  it("no convierte con gemini", () => {
    assert.equal(needsWavConversion("gemini", "audio/mp4"), false);
  });

  it("convierte para proveedores compatibles cuando el formato no es wav", () => {
    assert.equal(needsWavConversion("openai", "audio/mp4"), true);
    assert.equal(needsWavConversion("openrouter", "audio/webm;codecs=opus"), true);
  });

  it("no convierte si el audio ya es wav", () => {
    assert.equal(needsWavConversion("openai", "audio/wav"), false);
  });
});
