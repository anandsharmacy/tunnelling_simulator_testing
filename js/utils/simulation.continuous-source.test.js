/**
 * Continuous source = a train of default Gaussian packets.
 *
 * Every getEmitIntervalSteps() steps a fresh copy of the single default packet
 * (σ, k0, centre x = -120) is added at the left, so a steady stream of
 * identical packets marches right at the group velocity k0.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  applyMode,
  getContinuousSourceActive,
  getEmitIntervalSteps,
  getEmittedPackets,
  getScatteringTR,
  getStepCount,
  getWaveNorm,
  resetSim,
  setContinuousSourceActive,
  setParticleEnergyEv,
  stepSim,
  syncModeModalFields,
  x0_,
} from './simulation.js';
import { centroid, installDom, loadScenario, run } from './test-helpers.js';

const originalDocument = globalThis.document;

afterEach(() => {
  globalThis.document = originalDocument;
});

describe('Continuous source mode', () => {
  it('enables and disables with the mode selector', () => {
    loadScenario();
    document.getElementById('i-continuous-source').checked = true;
    applyMode();
    expect(getContinuousSourceActive()).toBe(true);

    document.getElementById('i-mode').value = 'ti';
    applyMode();
    expect(getContinuousSourceActive()).toBe(false);
  });

  it('preserves the selected checkbox on reset', () => {
    loadScenario({ continuous: true });
    expect(getContinuousSourceActive()).toBe(true);

    resetSim();

    expect(getContinuousSourceActive()).toBe(true);
    expect(document.getElementById('i-continuous-source').checked).toBe(true);
    expect(getStepCount()).toBe(0);
    expect(() => syncModeModalFields()).not.toThrow();
  });
});

describe('Packet train', () => {
  it('emits the default packet at x = -120 on the first step', () => {
    loadScenario({ continuous: true });
    stepSim();
    expect(getEmittedPackets()).toBe(1);
    expect(getWaveNorm()).toBeCloseTo(1, 4);
    expect(centroid()).toBeCloseTo(-120, 0);
  });

  it('moves right at the group velocity k0 = 1.2', () => {
    loadScenario({ continuous: true });
    run(500); // t = 25, before the 2nd packet
    // -120 + 1.2 * 25 = -90
    expect(centroid()).toBeGreaterThan(-91);
    expect(centroid()).toBeLessThan(-89);
  });

  it('emits a new packet every getEmitIntervalSteps() steps', () => {
    loadScenario({ continuous: true });
    expect(getEmitIntervalSteps()).toBe(1000);
    run(2001);
    expect(getEmittedPackets()).toBe(3);
  });

  it('shows no T/R until half a packet has resolved', () => {
    loadScenario({ continuous: true });
    run(1500);
    expect(getScatteringTR().R).toBeNaN();
  });

  it('steady-state T matches the single-packet value', () => {
    loadScenario({ continuous: true });
    run(8000);
    const { T, R } = getScatteringTR();
    expect(T).toBeGreaterThan(0.048);
    expect(T).toBeLessThan(0.058);
    expect(T + R).toBeCloseTo(1, 9);
  });

  it('restarts the train when energy changes', () => {
    loadScenario({ continuous: true });
    run(3000);
    setParticleEnergyEv(0.5);
    expect(getEmittedPackets()).toBe(0);
    expect(getWaveNorm()).toBe(0);
    stepSim();
    expect(getEmittedPackets()).toBe(1);
  });

  it('RESET restarts the train with a packet on the next step', () => {
    loadScenario({ continuous: true });
    run(3000);
    resetSim();
    stepSim();
    expect(getEmittedPackets()).toBe(1);
  });

  it('low-energy emission interval is finite', () => {
    loadScenario({ continuous: true, energyEv: '0.001' });
    expect(getEmitIntervalSteps()).toBeLessThanOrEqual(24000);
  });

  it('disabling restores a single packet at -120', () => {
    loadScenario({ continuous: true });
    run(100);
    setContinuousSourceActive(false);
    expect(getWaveNorm()).toBeCloseTo(1, 6);
    expect(x0_).toBe(-120);
  });
});

describe('Mode modal sync', () => {
  it('syncs the mode fields without throwing', () => {
    loadScenario();
    document.getElementById('i-mode').value = 'ti';
    document.getElementById('i-continuous-source').checked = true;
    applyMode();

    expect(() => syncModeModalFields()).not.toThrow();
    expect(document.getElementById('i-mode').value).toBe('ti');
    expect(document.getElementById('i-continuous-source').checked).toBe(false);
  });

  it('handles missing DOM elements gracefully', () => {
    installDom({});
    expect(() => syncModeModalFields()).not.toThrow();
  });
});
