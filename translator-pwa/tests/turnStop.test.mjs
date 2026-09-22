import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { classifyRecorderStop } from "../src/lib/turnStop.ts";

describe("classifyRecorderStop", () => {
  it("turno cancelado: no se envía nada, aunque haya audio", () => {
    assert.equal(classifyRecorderStop({ cancelled: true, blobSize: 4096 }), "cancelled");
  });

  it("cancelado gana sobre vacío", () => {
    assert.equal(classifyRecorderStop({ cancelled: true, blobSize: 0 }), "cancelled");
  });

  it("grabación vacía: hay que devolver el lado a idle", () => {
    assert.equal(classifyRecorderStop({ cancelled: false, blobSize: 0 }), "empty");
  });

  it("grabación con audio: se envía", () => {
    assert.equal(classifyRecorderStop({ cancelled: false, blobSize: 4096 }), "send");
  });
});
