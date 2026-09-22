import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import { postTranslate } from "../src/lib/apiClient.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const input = () => ({
  blob: new Blob(["x"], { type: "audio/mp4" }),
  mimeType: "audio/mp4",
  direction: "auto",
});

/** fetch que nunca responde y solo termina cuando se aborta su signal. */
function hangingFetch(_url, init) {
  return new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () =>
      reject(new DOMException("aborted", "AbortError"))
    );
  });
}

describe("postTranslate", () => {
  it("rechaza con un mensaje claro si la petición supera timeoutMs", async () => {
    globalThis.fetch = hangingFetch;
    await assert.rejects(postTranslate({ ...input(), timeoutMs: 20 }), /tardó demasiado/);
  });

  it("propaga AbortError (sin mensaje de timeout) cuando el llamador aborta", async () => {
    globalThis.fetch = hangingFetch;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    await assert.rejects(
      postTranslate({ ...input(), signal: controller.signal }),
      (err) => err.name === "AbortError" && !/tardó/.test(err.message)
    );
  });

  it("una respuesta 401 que no es JSON (pantalla de contraseña) da un mensaje de acceso", async () => {
    globalThis.fetch = async () =>
      new Response("<html>login</html>", {
        status: 401,
        headers: { "content-type": "text/html" },
      });
    await assert.rejects(postTranslate(input()), /Acceso denegado/);
  });

  it("un error con JSON usa el mensaje del servidor", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "Cuota agotada" }), { status: 500 });
    await assert.rejects(postTranslate(input()), /Cuota agotada/);
  });

  it("una respuesta correcta devuelve el JSON", async () => {
    const body = { detected_language: "es", original_text: "hola", translation: "こんにちは" };
    globalThis.fetch = async () => new Response(JSON.stringify(body), { status: 200 });
    assert.deepEqual(await postTranslate(input()), body);
  });

  it("una respuesta 200 que no es JSON rechaza en vez de devolver null", async () => {
    globalThis.fetch = async () =>
      new Response("<html>portal</html>", { status: 200 });
    await assert.rejects(postTranslate(input()), /Respuesta inválida/);
  });

  it("abortar durante la lectura del cuerpo rechaza con AbortError", async () => {
    const controller = new AbortController();
    globalThis.fetch = async () => {
      controller.abort();
      return new Response("<html></html>", { status: 200 });
    };
    await assert.rejects(
      postTranslate({ ...input(), signal: controller.signal }),
      (err) => err.name === "AbortError"
    );
  });
});
