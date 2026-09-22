import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { PROMPTS } from "../src/lib/translator.ts";

describe("PROMPTS", () => {
  for (const [direction, prompt] of Object.entries(PROMPTS)) {
    it(`"${direction}" manda ignorar la orden final de detener grabación`, () => {
      assert.match(prompt, /detener grabación/);
    });

    it(`"${direction}" sigue exigiendo respuesta en JSON`, () => {
      assert.match(prompt, /JSON/);
    });
  }
});
