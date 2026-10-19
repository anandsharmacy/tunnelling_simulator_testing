import { afterEach, describe, expect, it } from 'vitest';
import {
  getAbsorbedProbability,
  getBarrierWidthNm,
  getViewportBounds,
  getWaveNorm,
  NM_PER_UNIT,
  setBarrierWidthNm,
  setParticleEnergyEv,
  sigma,
  stepSim,
  x0_,
} from './simulation.js';
import { loadScenario, run } from './test-helpers.js';

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

describe('absorbing boundaries', () => {
  it('absorbs a free packet without reflecting it and never gains norm', () => {
    loadScenario({ pot: 'none' });
    let prev = getWaveNorm();
    for (let i = 0; i < 6000; i++) {
      stepSim();
      const n = getWaveNorm();
      expect(n).toBeLessThanOrEqual(prev + 1e-12);
      prev = n;
    }
    const a = getAbsorbedProbability();
    expect(a.right).toBeGreaterThan(0.998);
    expect(a.left).toBeLessThan(1e-4);
  });

  it('absorbs essentially nothing while the packet is at the barrier', () => {
    loadScenario();
    run(2000); // t = 100
    const a = getAbsorbedProbability();
    // Old code: 1e-4 from the FFT split's cancelling tails.
    expect(a.right).toBeLessThan(1e-9);
    // Only the initial Gaussian tail inside the band (~1e-5).
    expect(a.left).toBeLessThan(1e-4);
  });

  it('never gains norm while scattering off the barrier', () => {
    loadScenario();
    let prev = getWaveNorm();
    for (let i = 0; i < 6000; i++) {
      stepSim();
      const n = getWaveNorm();
      expect(n).toBeLessThanOrEqual(prev + 1e-12); // old code: rose to 1.0016
      prev = n;
    }
  });
});
