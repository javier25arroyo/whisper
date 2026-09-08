import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseTranslationJson } from "../src/lib/translator.ts";

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
