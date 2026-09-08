import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseTranslationJson } from "../src/lib/translator.ts";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { geminiProvider, GEMINI_DEFAULT_MODEL } from "../src/lib/providers/gemini.ts";
import { openaiCompatProvider } from "../src/lib/providers/openaiCompat.ts";

describe("parseTranslationJson", () => {
  it("parsea JSON limpio sin depender del proveedor", () => {
    const raw = '{"detected_language":"es","original_text":"Hola","translation":"こんにちは"}';
    assert.deepEqual(parseTranslationJson(raw), {
      detected_language: "es",
      original_text: "Hola",
      translation: "こんにちは",
    });
  });

  it("lanza error cuando la respuesta está vacía", () => {
    assert.throws(() => parseTranslationJson(""), /Respuesta vacía/);
  });
});

describe("geminiProvider", () => {
  it("acepta cualquier mime type porque normaliza antes de enviar", () => {
    assert.equal(geminiProvider.acceptsMimeType("audio/mp4"), true);
    assert.equal(geminiProvider.acceptsMimeType("audio/webm;codecs=opus"), true);
    assert.equal(geminiProvider.acceptsMimeType("application/octet-stream"), true);
  });

  it("envía el audio normalizado y devuelve el resultado parseado", async () => {
    const original = GoogleGenerativeAI.prototype.getGenerativeModel;
    let seenModel = null;
    let seenMime = null;
    GoogleGenerativeAI.prototype.getGenerativeModel = function (opts) {
      seenModel = opts.model;
      return {
        generateContent: async (contents) => {
          seenMime = contents[0].inlineData.mimeType;
          return {
            response: {
              text: () =>
                '{"detected_language":"ja","original_text":"ありがとう","translation":"Gracias"}',
            },
          };
        },
      };
    };
    try {
      const result = await geminiProvider.translate(
        { apiKey: "k-test" },
        { audioBase64: "AAAA", mimeType: "audio/m4a", direction: "auto" }
      );
      assert.equal(seenModel, GEMINI_DEFAULT_MODEL);
      assert.equal(seenMime, "audio/mp4");
      assert.equal(result.translation, "Gracias");
    } finally {
      GoogleGenerativeAI.prototype.getGenerativeModel = original;
    }
  });
});

describe("openaiCompatProvider", () => {
  it("solo acepta wav y mp3", () => {
    assert.equal(openaiCompatProvider.acceptsMimeType("audio/wav"), true);
    assert.equal(openaiCompatProvider.acceptsMimeType("audio/mpeg"), true);
    assert.equal(openaiCompatProvider.acceptsMimeType("audio/mp4"), false);
    assert.equal(openaiCompatProvider.acceptsMimeType("audio/webm"), false);
  });

  it("construye la petición con input_audio y devuelve el resultado parseado", async () => {
    const originalFetch = globalThis.fetch;
    let seenUrl = null;
    let seenBody = null;
    let seenAuth = null;
    globalThis.fetch = async (url, init) => {
      seenUrl = url;
      seenAuth = init.headers.authorization;
      seenBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '{"detected_language":"es","original_text":"Buenos días","translation":"おはよう"}',
              },
            },
          ],
        }),
      };
    };
    try {
      const result = await openaiCompatProvider.translate(
        { apiKey: "sk-secreta", model: "modelo-x", baseUrl: "https://api.ejemplo.com/v1" },
        { audioBase64: "QUJD", mimeType: "audio/wav", direction: "es-ja" }
      );
      assert.equal(seenUrl, "https://api.ejemplo.com/v1/chat/completions");
      assert.equal(seenAuth, "Bearer sk-secreta");
      assert.equal(seenBody.model, "modelo-x");
      const parts = seenBody.messages[0].content;
      assert.equal(parts[1].type, "input_audio");
      assert.equal(parts[1].input_audio.format, "wav");
      assert.equal(parts[1].input_audio.data, "QUJD");
      assert.equal(result.translation, "おはよう");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("lanza un error saneado que no contiene la API key", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "Invalid key sk-secreta" } }),
      text: async () => "Invalid key sk-secreta",
    });
    try {
      await assert.rejects(
        () =>
          openaiCompatProvider.translate(
            { apiKey: "sk-secreta", model: "m", baseUrl: "https://api.ejemplo.com/v1" },
            { audioBase64: "QUJD", mimeType: "audio/wav" }
          ),
        (err) => {
          assert.ok(!err.message.includes("sk-secreta"), "el error no debe filtrar la key");
          assert.match(err.message, /401/);
          return true;
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
