import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { estimateSpeechCeilingMs, shouldAdvanceOnSpeechError } from "../src/lib/ttsTurn.ts";

describe("estimateSpeechCeilingMs", () => {
  it("da más tiempo por carácter al japonés que al español", () => {
    const text = "こんにちは、元気ですか？";
    assert.ok(estimateSpeechCeilingMs(text, "ja") > estimateSpeechCeilingMs(text, "es"));
  });

  it("cubre el caso que causaba el corte: una frase japonesa de emergencia de 40 caracteres necesita más de 8000ms", () => {
    const text = "すみません、胸がとても痛くて、息が苦しいです。すぐに救急車を呼んでください。早急に".slice(0, 40);
    assert.equal(text.length, 40);
    assert.ok(estimateSpeechCeilingMs(text, "ja") >= 8000);
  });

  it("respeta el piso mínimo para textos cortos", () => {
    assert.equal(estimateSpeechCeilingMs("Sí", "es"), 1200);
    assert.equal(estimateSpeechCeilingMs("はい", "ja"), 1500);
  });

  it("crece con la longitud del texto", () => {
    const short = estimateSpeechCeilingMs("こんにちは", "ja");
    const long = estimateSpeechCeilingMs("こんにちは".repeat(10), "ja");
    assert.ok(long > short);
  });
});

describe("shouldAdvanceOnSpeechError", () => {
  it("ignora 'canceled' e 'interrupted': son cancelaciones de la propia app, no fallos reales", () => {
    assert.equal(shouldAdvanceOnSpeechError("canceled"), false);
    assert.equal(shouldAdvanceOnSpeechError("interrupted"), false);
  });

  it("avanza el turno ante cualquier otro error real", () => {
    assert.equal(shouldAdvanceOnSpeechError("synthesis-failed"), true);
    assert.equal(shouldAdvanceOnSpeechError("audio-busy"), true);
    assert.equal(shouldAdvanceOnSpeechError("network"), true);
    assert.equal(shouldAdvanceOnSpeechError(""), true);
  });
});
