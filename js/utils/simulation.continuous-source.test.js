/**
 * Continuous Source Feature Tests
 *
 * These tests verify the continuous source injection, flux measurement,
 * and reset behavior using a lightweight document stub.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyMode,
  buildCN,
  buildGrid,
  buildV,
  getContinuousSourceActive,
  getFluxBasedTR,
  getStepCount,
  getWaveNorm,
  initSimulation,
  initPsi,
  resetSim,
  setContinuousSourceActive,
  setWaveOrigin,
  stepSim,
  syncModeModalFields,
  x0_,
} from './simulation.js';

const originalDocument = globalThis.document;
let elements = {};

function createElement(overrides = {}) {
  return {
    value: '',
    checked: false,
    textContent: '',
    ...overrides,
  };
}

function installDom(nextElements) {
  elements = nextElements;
  globalThis.document = {
    getElementById(id) {
      return elements[id] ?? null;
    },
  };
}

function setupDom() {
  installDom({
    'i-mode': createElement({ value: 'td' }),
    'i-continuous-source': createElement({ checked: false }),
    modeBadge: createElement({ textContent: 'T-DEPENDENT' }),
    'i-pot': createElement({ value: 'single' }),
    'i-Vw': createElement({ value: '20' }),
    'i-Eev': createElement({ value: '0.7200' }),
    'i-sig': createElement({ value: '5' }),
    'i-spd': createElement({ value: '4' }),
    'i-spd-main': createElement({ value: '4' }),
    'v0-live': createElement({ textContent: '1.00' }),
    'spd-live': createElement({ textContent: '4' }),
    'spd-live-main': createElement({ textContent: '4' }),
  });
}

function initSimulationState() {
  buildGrid();
  buildV();
  buildCN();
  initPsi();
}

beforeEach(() => {
  setupDom();
  setContinuousSourceActive(false);
  setWaveOrigin(-160);
  initSimulationState();
});

afterEach(() => {
  globalThis.document = originalDocument;
});

describe('Continuous source mode', () => {
  it('enables and disables with the mode selector', () => {
    document.getElementById('i-continuous-source').checked = true;
    applyMode();
    expect(getContinuousSourceActive()).toBe(true);

    document.getElementById('i-mode').value = 'ti';
    applyMode();
    expect(getContinuousSourceActive()).toBe(false);
  });

  it('preserves the selected checkbox on reset', () => {
    document.getElementById('i-continuous-source').checked = true;
    applyMode();
    expect(getContinuousSourceActive()).toBe(true);

    resetSim();

    expect(getContinuousSourceActive()).toBe(true);
    expect(document.getElementById('i-continuous-source').checked).toBe(true);
    expect(getStepCount()).toBe(0);
    expect(() => syncModeModalFields()).not.toThrow();
  });

  it('starts continuous mode from a zeroed field during init', () => {
    setContinuousSourceActive(true);

    expect(() => initSimulation()).not.toThrow();
    expect(x0_).toBe(-160);
    expect(getWaveNorm()).toBe(0);
    expect(() => stepSim()).not.toThrow();
  });

  it('clears the existing packet when continuous mode is enabled mid-run', () => {
    setWaveOrigin(-100);
    initPsi();
    expect(getWaveNorm()).toBeCloseTo(1, 6);

    setContinuousSourceActive(true);

    expect(getContinuousSourceActive()).toBe(true);
    expect(x0_).toBe(-160);
    expect(getWaveNorm()).toBe(0);
    expect(getFluxBasedTR()).toEqual({ T: NaN, R: NaN });
  });
});

describe('Flux-based readout', () => {
  it('returns bounded T/R after accumulating measurements', () => {
    document.getElementById('i-continuous-source').checked = true;
    applyMode();

    for (let i = 0; i < 24; i += 1) {
      stepSim();
    }

    const tr = getFluxBasedTR();
    expect(Number.isFinite(tr.T)).toBe(true);
    expect(Number.isFinite(tr.R)).toBe(true);
    expect(tr.T).toBeGreaterThanOrEqual(0);
    expect(tr.T).toBeLessThanOrEqual(1);
    expect(tr.R).toBeGreaterThanOrEqual(0);
    expect(tr.R).toBeLessThanOrEqual(1);
    expect(tr.T + tr.R).toBeLessThanOrEqual(1.01);
  });

  it('is stable across repeated reads', () => {
    document.getElementById('i-continuous-source').checked = true;
    applyMode();

    for (let i = 0; i < 24; i += 1) {
      stepSim();
    }

    const first = getFluxBasedTR();
    const second = getFluxBasedTR();
    expect(first.T).toBeCloseTo(second.T, 10);
    expect(first.R).toBeCloseTo(second.R, 10);
  });
});

describe('Mode modal sync', () => {
  it('syncs the mode fields without throwing', () => {
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
