import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { encodeWav, TARGET_SAMPLE_RATE } from "../src/lib/wavEncoder.ts";

function readAscii(view, offset, length) {
  let out = "";
  for (let i = 0; i < length; i++) out += String.fromCharCode(view.getUint8(offset + i));
  return out;
}

describe("encodeWav", () => {
  it("escribe una cabecera RIFF/WAVE mono de 16 bits al sample rate indicado", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const view = new DataView(encodeWav(samples, TARGET_SAMPLE_RATE));

    assert.equal(readAscii(view, 0, 4), "RIFF");
    assert.equal(readAscii(view, 8, 4), "WAVE");
    assert.equal(readAscii(view, 12, 4), "fmt ");
    assert.equal(view.getUint16(20, true), 1, "formato PCM");
    assert.equal(view.getUint16(22, true), 1, "un canal");
    assert.equal(view.getUint32(24, true), TARGET_SAMPLE_RATE);
    assert.equal(view.getUint16(34, true), 16, "16 bits por muestra");
    assert.equal(readAscii(view, 36, 4), "data");
    assert.equal(view.getUint32(40, true), samples.length * 2);
  });

  it("produce un buffer de 44 bytes de cabecera más 2 bytes por muestra", () => {
    const samples = new Float32Array(100);
    assert.equal(encodeWav(samples, TARGET_SAMPLE_RATE).byteLength, 44 + 200);
  });

  it("convierte las muestras a PCM16 y satura fuera del rango [-1, 1]", () => {
    const view = new DataView(encodeWav(new Float32Array([0, 1, -1, 2, -2]), TARGET_SAMPLE_RATE));
    assert.equal(view.getInt16(44, true), 0);
    assert.equal(view.getInt16(46, true), 32767);
    assert.equal(view.getInt16(48, true), -32768);
    assert.equal(view.getInt16(50, true), 32767, "satura por arriba");
    assert.equal(view.getInt16(52, true), -32768, "satura por abajo");
  });
});
