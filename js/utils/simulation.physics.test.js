import { afterEach, describe, expect, it } from 'vitest';
import {
  getBarrierWidthNm,
  getViewportBounds,
  NM_PER_UNIT,
  setBarrierWidthNm,
  setParticleEnergyEv,
  sigma,
  x0_,
} from './simulation.js';
import { loadScenario } from './test-helpers.js';

const originalDocument = globalThis.document;

afterEach(() => {
  globalThis.document = originalDocument;
});

describe('electron units', () => {
  it('round-trips barrier width in nm and stores sim units', () => {
    loadScenario();
    expect(getBarrierWidthNm()).toBeCloseTo(0.8, 9);
    expect(setBarrierWidthNm(1)).toBeCloseTo(1, 9);
    // autoZoom works in sim units
    expect(getViewportBounds().range).toBeCloseTo((1 / NM_PER_UNIT) * 80, 6);
  });

  it('clamps energy to the resolvable range', () => {
    loadScenario();
    expect(setParticleEnergyEv(50)).toBeCloseTo(10, 9);
  });

  it('defaults to the 0.8 nm barrier and the x = -120 packet', () => {
    loadScenario();
    expect(x0_).toBe(-120);
    expect(sigma).toBeCloseTo(1.38 / NM_PER_UNIT, 6);
  });

  it('widest packet never starts inside the widest barrier', () => {
    loadScenario({ widthNm: '20', sigmaNm: '3' });
    expect(x0_ + 4 * sigma).toBeLessThan(-(20 / NM_PER_UNIT) / 2);
  });
});
