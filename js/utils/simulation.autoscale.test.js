import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  autoZoomBarrier,
  buildCN,
  buildGrid,
  buildV,
  getViewportBounds,
  initPsi,
  recenter,
  setBarrierPotential,
  setBarrierWidthNm,
  setParticleEnergyEv,
  zoomIn,
  zoomOut,
} from "./simulation.js";

function createElement(overrides = {}) {
  return {
    value: "",
    checked: false,
    textContent: "",
    ...overrides,
  };
}

function installDom(elements) {
  globalThis.document = {
    getElementById(id) {
      return elements[id] ?? null;
    },
  };
}

describe("smart barrier auto-scaling", () => {
  const originalDocument = globalThis.document;

  beforeEach(() => {
    installDom({
      "i-Vw": createElement({ value: "20.0" }),
      "i-Eev": createElement({ value: "0.0549" }),
      "i-sig": createElement({ value: "5.0" }),
      "i-spd": createElement({ value: "4" }),
      "i-spd-main": createElement({ value: "4" }),
      "spd-live": createElement({ textContent: "4" }),
      "spd-live-main": createElement({ textContent: "4" }),
      "v0-live": createElement({ textContent: "1.00" }),
    });

    buildGrid();
    buildV();
    buildCN();
    initPsi();
    recenter();
  });

  afterEach(() => {
    globalThis.document = originalDocument;
  });

  it("auto-fits the viewport for extremely narrow barriers", () => {
    setBarrierWidthNm(0.3);

    const viewport = getViewportBounds();
    expect(viewport.range).toBeCloseTo(24, 6);
    expect(viewport.center).toBeCloseTo(0, 1);
  });

  it("reapplies the smart fit after energy or potential updates", () => {
    setBarrierWidthNm(0.3);
    recenter();
    setParticleEnergyEv(-0.4);

    let viewport = getViewportBounds();
    expect(viewport.range).toBeCloseTo(24, 6);
    expect(viewport.center).toBeCloseTo(0, 1);

    recenter();
    setBarrierPotential(1.0);

    viewport = getViewportBounds();
    expect(viewport.range).toBeCloseTo(24, 6);
    expect(viewport.center).toBeCloseTo(0, 1);
  });

  it("keeps manual zoom centered on the barrier and clamped to the domain", () => {
    setBarrierWidthNm(0.3);
    recenter();
    zoomIn();

    let viewport = getViewportBounds();
    expect(viewport.range).toBeCloseTo(240, 6);
    expect(viewport.center).toBeCloseTo(0, 1);

    autoZoomBarrier();
    zoomOut();
    zoomOut();
    zoomOut();
    zoomOut();

    viewport = getViewportBounds();
    expect(viewport.center).toBeCloseTo(0, 1);
    expect(viewport.min).toBeGreaterThanOrEqual(-160);
    expect(viewport.max).toBeLessThanOrEqual(160);
    expect(viewport.range).toBeLessThanOrEqual(320);
  });
});
