import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseTranslationJson } from "../src/lib/translator.ts";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { geminiProvider, GEMINI_DEFAULT_MODEL } from "../src/lib/providers/gemini.ts";

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
