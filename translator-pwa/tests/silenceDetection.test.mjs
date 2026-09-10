import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  stepSilenceDetection,
  initialSilenceDetectionState,
} from "../src/lib/silenceDetection.ts";

const PARAMS = { threshold: 0.01, silenceMs: 700, soundStartMs: 100 };

function run(frames, params = PARAMS) {
  let state = initialSilenceDetectionState;
  const log = [];
  for (const [t, rms] of frames) {
    const result = stepSilenceDetection(state, rms, t, params);
    state = result.state;
    log.push({ t, ...result.events });
  }
  return log;
}

describe("stepSilenceDetection - caso crítico: micro-hueco en mitad de habla continua", () => {
  it("no dispara `silence` por una sola muestra por debajo del umbral tras el primer segundo hablando", () => {
    const frames = [];
    for (let t = 0; t <= 2000; t += 10) {
      frames.push([t, t === 1000 ? 0 : 0.5]);
    }
    const log = run(frames);
    assert.equal(
      log.some((e) => e.silence),
      false,
      "un micro-hueco de 10ms no debe cerrar el turno"
    );
  });
});

describe("stepSilenceDetection - silencio real", () => {
  it("dispara `soundStart` una vez confirmado el habla, y `silence` exactamente silenceMs después del último sonido", () => {
    const frames = [];
    for (let t = 0; t <= 200; t += 10) frames.push([t, 0.5]); // habla continua 0..200ms
    for (let t = 210; t <= 900; t += 10) frames.push([t, 0]); // silencio real desde 210ms

    const log = run(frames);
    const soundStarts = log.filter((e) => e.soundStart);
    const silences = log.filter((e) => e.silence);

    assert.equal(soundStarts.length, 1);
    assert.equal(soundStarts[0].t, 100, "soundStart tras soundStartMs=100 de habla continua");
    assert.equal(silences.length, 1, "silence debe dispararse exactamente una vez");
    assert.equal(
      silences[0].t,
      900,
      "silence a los silenceMs=700 desde el último sonido confirmado (t=200), no desde el inicio del habla"
    );
  });
});

describe("stepSilenceDetection - ruido bajo el umbral de confirmación", () => {
  it("un pico de sonido más corto que soundStartMs no confirma sonido ni deja rastro para un `silence` posterior", () => {
    const frames = [];
    for (let t = 0; t <= 40; t += 10) frames.push([t, 0.5]); // 50ms de "sonido", nunca llega a soundStartMs=100
    for (let t = 50; t <= 800; t += 10) frames.push([t, 0]); // silencio largo después

    const log = run(frames);
    assert.equal(log.some((e) => e.soundStart), false, "50ms no confirma inicio de sonido");
    assert.equal(
      log.some((e) => e.silence),
      false,
      "sin sonido confirmado no hay `último sonido` desde el que medir silencio"
    );
  });
});
