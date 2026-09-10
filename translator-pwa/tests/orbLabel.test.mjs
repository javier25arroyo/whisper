import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getOrbAccessibleLabel } from "../src/lib/orbLabel.ts";

const BASE = { displayName: "日本語", role: "Otro" };

describe("getOrbAccessibleLabel", () => {
  it("este lado escuchando (activo): 'Detener grabación'", () => {
    const label = getOrbAccessibleLabel({
      side: "ja",
      stateValue: "listening",
      activeSide: "ja",
      ...BASE,
    });
    assert.equal(label, "Detener grabación");
  });

  it("este lado hablando: descripción informativa sin cambio de comportamiento", () => {
    const label = getOrbAccessibleLabel({
      side: "ja",
      stateValue: "speaking",
      activeSide: "ja",
      ...BASE,
    });
    assert.equal(label, "Orbe Otro (日本語) · toca para menú");
  });

  it("este lado procesando: misma descripción informativa que hablando", () => {
    const label = getOrbAccessibleLabel({
      side: "ja",
      stateValue: "processing",
      activeSide: "ja",
      ...BASE,
    });
    assert.equal(label, "Orbe Otro (日本語) · toca para menú");
  });

  it("inactivo y libre (activeSide null): 'Hablar en <idioma>'", () => {
    const esLabel = getOrbAccessibleLabel({
      side: "es",
      stateValue: "idle",
      activeSide: null,
      displayName: "Español",
      role: "Tú",
    });
    const jaLabel = getOrbAccessibleLabel({
      side: "ja",
      stateValue: "idle",
      activeSide: null,
      ...BASE,
    });
    assert.equal(esLabel, "Hablar en Español");
    assert.equal(jaLabel, "Hablar en Japonés");
  });

  it("inactivo y bloqueado por el otro lado: '<idioma>, en espera'", () => {
    const label = getOrbAccessibleLabel({
      side: "ja",
      stateValue: "idle",
      activeSide: "es",
      ...BASE,
    });
    assert.equal(label, "Japonés, en espera");
  });
});
