import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isMicDead } from "../src/lib/micHealth.ts";

const streamWith = (...states) => ({
  getAudioTracks: () => states.map((readyState) => ({ readyState })),
});

describe("isMicDead", () => {
  it("sin stream: muerto", () => {
    assert.equal(isMicDead(null), true);
  });

  it("sin pistas de audio: muerto", () => {
    assert.equal(isMicDead(streamWith()), true);
  });

  it("todas las pistas terminadas: muerto", () => {
    assert.equal(isMicDead(streamWith("ended", "ended")), true);
  });

  it("al menos una pista viva: vivo", () => {
    assert.equal(isMicDead(streamWith("ended", "live")), false);
  });
});
