import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import { POST } from "../src/app/api/translate/route.ts";

const originalFetch = globalThis.fetch;
const originalKey = process.env.GEMINI_API_KEY;

function audioRequest(headers = {}, mimeType = "audio/wav") {
  const formData = new FormData();
  formData.append("audio", new Blob(["bytes-de-audio"], { type: mimeType }));
  formData.append("direction", "auto");
  return new Request("http://localhost:3000/api/translate", {
    method: "POST",
    body: formData,
    headers,
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey !== undefined) process.env.GEMINI_API_KEY = originalKey;
  else delete process.env.GEMINI_API_KEY;
});

describe("resolución de proveedor en /api/translate", () => {
  it("devuelve 400 cuando el id de proveedor no existe", async () => {
    const res = await POST(audioRequest({ "x-provider-id": "inventado", "x-provider-key": "k" }));
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /Proveedor no reconocido/i);
  });

  it("devuelve 400 cuando se indica proveedor sin clave", async () => {
    const res = await POST(audioRequest({ "x-provider-id": "openai" }));
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /clave/i);
  });

  it("devuelve 415 cuando el proveedor no admite el formato de audio", async () => {
    const res = await POST(
      audioRequest({ "x-provider-id": "openai", "x-provider-key": "sk-x" }, "audio/mp4")
    );
    assert.equal(res.status, 415);
    assert.match((await res.json()).error, /no admite/i);
  });

  it("usa el baseUrl del preset e ignora el que llegue por cabecera", async () => {
    let seenUrl = null;
    globalThis.fetch = async (url) => {
      seenUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '{"detected_language":"es","original_text":"Hola","translation":"こんにちは"}',
              },
            },
          ],
        }),
      };
    };
    const res = await POST(
      audioRequest({
        "x-provider-id": "openrouter",
        "x-provider-key": "sk-x",
        "x-provider-base-url": "http://169.254.169.254/latest/meta-data",
      })
    );
    assert.equal(res.status, 200);
    assert.equal(seenUrl, "https://openrouter.ai/api/v1/chat/completions");
  });

  it("no filtra la clave del usuario en el mensaje de error", async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: "Invalid key sk-super-secreta" }),
      text: async () => "Invalid key sk-super-secreta",
    });
    const res = await POST(
      audioRequest({ "x-provider-id": "openai", "x-provider-key": "sk-super-secreta" })
    );
    const body = JSON.stringify(await res.json());
    assert.ok(!body.includes("sk-super-secreta"), "la respuesta no debe contener la clave");
  });
});
