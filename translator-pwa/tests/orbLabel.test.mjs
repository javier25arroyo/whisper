import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getOrbAccessibleLabel } from "../src/lib/orbLabel.ts";

describe("getOrbAccessibleLabel", () => {
  it("este lado escuchando (activo): 'Detener grabación'", () => {
    const label = getOrbAccessibleLabel({ side: "ja", stateValue: "listening", activeSide: "ja" });
    assert.equal(label, "Detener grabación");
  });

  it("este lado hablando: estado informativo, no una descripción técnica", () => {
    const label = getOrbAccessibleLabel({ side: "ja", stateValue: "speaking", activeSide: "ja" });
    assert.equal(label, "Reproduciendo traducción");
  });

  it("este lado procesando: estado informativo", () => {
    const label = getOrbAccessibleLabel({ side: "ja", stateValue: "processing", activeSide: "ja" });
    assert.equal(label, "Traduciendo, espera");
  });

  it("procesando/hablando no ofrecen 'menú' ni nombres de orbe: la cancelación es un botón aparte", () => {
    for (const stateValue of ["processing", "speaking"]) {
      const label = getOrbAccessibleLabel({ side: "es", stateValue, activeSide: "es" });
      assert.doesNotMatch(label, /orbe|menú/i);
    }
  });

  it("inactivo y libre (activeSide null): 'Hablar en <idioma>'", () => {
    const es = getOrbAccessibleLabel({ side: "es", stateValue: "idle", activeSide: null });
    const ja = getOrbAccessibleLabel({ side: "ja", stateValue: "idle", activeSide: null });
    assert.equal(es, "Hablar en Español");
    assert.equal(ja, "Hablar en Japonés");
  });

  it("inactivo y bloqueado por el otro lado: '<idioma>, en espera'", () => {
    const label = getOrbAccessibleLabel({ side: "ja", stateValue: "idle", activeSide: "es" });
    assert.equal(label, "Japonés, en espera");
  });
});
