import { afterEach, describe, expect, it } from 'vitest';
import {
  getAbsorbedProbability,
  getBarrierWidthNm,
  getPotentialArea,
  getScatteringTR,
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

describe('scattering readout', () => {
  it('reports no reflection before the packet reaches the barrier', () => {
    loadScenario();
    run(1000); // t = 50
    const { T, R } = getScatteringTR();
    expect(R).toBeLessThan(1e-4); // old readout: 1.0000
    expect(T).toBeLessThan(1e-6);
  });

  it('keeps T + R <= 1 throughout and reaches ~1 after scattering', () => {
    loadScenario();
    for (let k = 0; k < 30; k++) {
      run(200);
      const { T, R } = getScatteringTR();
      expect(T + R).toBeLessThanOrEqual(1.001);
    }
    const { T, R } = getScatteringTR();
    expect(T + R).toBeGreaterThan(0.998);
  });

  it('no barrier gives NaN', () => {
    loadScenario({ pot: 'none' });
    run(10);
    expect(getScatteringTR().T).toBeNaN();
  });

  it('step potential counts the step region as transmitted', () => {
    loadScenario({ pot: 'step', v0: 0.5 });
    run(6000);
    const { T } = getScatteringTR();
    // Step transmission 4·k1·k2/(k1+k2)² averaged over the packet = 0.872.
    // Counting only past the step's far end would give ~0 here.
    expect(T).toBeGreaterThan(0.83);
    expect(T).toBeLessThan(0.9);
  });
});

describe('accuracy', () => {
  it('discrete barrier has exactly the requested width', () => {
    loadScenario();
    expect(getPotentialArea()).toBeCloseTo(0.8 / NM_PER_UNIT, 9); // V0 = 1
  });

  it('default transmission is within 4% of the exact packet-averaged value 0.0536', () => {
    loadScenario();
    run(6000);
    const { T } = getScatteringTR();
    expect(T).toBeGreaterThan(0.0515);
    expect(T).toBeLessThan(0.0557);
  });

  it('over-barrier leak through a 5.52 nm barrier is resolved', () => {
    loadScenario({ widthNm: '5.521' });
    run(6000);
    // Exact 0.0059; old grid 0.0022; new grid ≈ 0.0042
    expect(getScatteringTR().T).toBeGreaterThan(0.0035);
  });
});
