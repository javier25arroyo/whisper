import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { EMERGENCY_PHRASES, EMERGENCY_NUMBERS, EMERGENCY_CONTEXT } from "../src/lib/emergencyPhrases.ts";

const NAME_MAX_LENGTH = 24;
const EMOJI_OR_DIGIT = /[\p{Emoji_Presentation}\p{Extended_Pictographic}0-9]/u;

describe("EMERGENCY_PHRASES", () => {
  it("tiene al menos 10 frases", () => {
    assert.ok(EMERGENCY_PHRASES.length >= 10);
  });

  it("ids únicos", () => {
    const ids = EMERGENCY_PHRASES.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("nombres accesibles únicos", () => {
    const names = EMERGENCY_PHRASES.map((p) => p.name);
    assert.equal(new Set(names).size, names.length);
  });

  it("nombres de máximo 24 caracteres, sin emojis ni dígitos", () => {
    for (const phrase of EMERGENCY_PHRASES) {
      assert.ok(
        phrase.name.length <= NAME_MAX_LENGTH,
        `"${phrase.name}" supera ${NAME_MAX_LENGTH} caracteres`
      );
      assert.ok(!EMOJI_OR_DIGIT.test(phrase.name), `"${phrase.name}" lleva emoji o dígito`);
    }
  });

  it("es y ja no vacíos en todas", () => {
    for (const phrase of EMERGENCY_PHRASES) {
      assert.ok(phrase.es.trim().length > 0, `${phrase.id}: falta es`);
      assert.ok(phrase.ja.trim().length > 0, `${phrase.id}: falta ja`);
    }
  });
});

describe("EMERGENCY_NUMBERS", () => {
  it("incluye 119 y 110 con nombre en español y japonés", () => {
    const numbers = EMERGENCY_NUMBERS.map((n) => n.number);
    assert.ok(numbers.includes("119"));
    assert.ok(numbers.includes("110"));
    for (const entry of EMERGENCY_NUMBERS) {
      assert.ok(entry.es.trim().length > 0);
      assert.ok(entry.ja.trim().length > 0);
    }
  });
});

describe("EMERGENCY_CONTEXT", () => {
  it("tiene es y ja no vacíos", () => {
    assert.ok(EMERGENCY_CONTEXT.es.trim().length > 0);
    assert.ok(EMERGENCY_CONTEXT.ja.trim().length > 0);
  });
});
