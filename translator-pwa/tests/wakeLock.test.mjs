import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createWakeLock } from "../src/lib/wakeLock.ts";

function fakeRequest() {
  const sentinels = [];
  const request = () => {
    const s = {
      released: false,
      release() {
        this.released = true;
        return Promise.resolve();
      },
    };
    sentinels.push(s);
    return Promise.resolve(s);
  };
  return { request, sentinels };
}

describe("createWakeLock", () => {
  it("enable adquiere una sola vez aunque se llame dos veces", async () => {
    const { request, sentinels } = fakeRequest();
    const wl = createWakeLock(request);
    await wl.enable();
    await wl.enable();
    assert.equal(sentinels.length, 1);
  });

  it("disable libera el lock", async () => {
    const { request, sentinels } = fakeRequest();
    const wl = createWakeLock(request);
    await wl.enable();
    wl.disable();
    assert.equal(sentinels[0].released, true);
  });

  it("onVisible readquiere (el sistema libera el lock al ocultar la página)", async () => {
    const { request, sentinels } = fakeRequest();
    const wl = createWakeLock(request);
    await wl.enable();
    await wl.onVisible();
    assert.equal(sentinels.length, 2);
    assert.equal(sentinels[0].released, true);
    assert.equal(sentinels[1].released, false);
  });

  it("onVisible no hace nada si el lock no está activo", async () => {
    const { request, sentinels } = fakeRequest();
    const wl = createWakeLock(request);
    await wl.onVisible();
    assert.equal(sentinels.length, 0);
  });

  it("disable con la petición aún pendiente libera el lock cuando llega tarde", async () => {
    let resolveRequest;
    const late = { released: false, release() { this.released = true; return Promise.resolve(); } };
    const wl = createWakeLock(() => new Promise((res) => { resolveRequest = res; }));
    const pending = wl.enable();
    wl.disable();
    resolveRequest(late);
    await pending;
    assert.equal(late.released, true);
  });

  it("sin soporte (request null) no lanza", async () => {
    const wl = createWakeLock(null);
    await assert.doesNotReject(wl.enable());
    assert.doesNotThrow(() => wl.disable());
  });

  it("si la petición falla no lanza", async () => {
    const wl = createWakeLock(() => Promise.reject(new Error("NotAllowedError")));
    await assert.doesNotReject(wl.enable());
  });
});
