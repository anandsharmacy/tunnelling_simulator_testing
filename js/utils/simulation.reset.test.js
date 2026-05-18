import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyMode,
  applyWidth,
  buildCN,
  buildGrid,
  buildV,
  getBarrierPotential,
  getBarrierWidthNm,
  getParticleEnergyEv,
  getScatteringVisibility,
  getSimulationSpeed,
  getStepCount,
  initPsi,
  isTimeDependentMode,
  pot_type,
  resetSim,
  setBarrierPotential,
  setWaveOrigin,
  sigma,
  stepSim,
  x0_,
} from './simulation.js';

function createElement(overrides = {}) {
  return {
    value: '',
    checked: false,
    textContent: '',
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

describe('resetSim', () => {
  const originalDocument = globalThis.document;

  beforeEach(() => {
    const elements = {
      'i-pot': createElement({ value: 'delta' }),
      'i-Vw': createElement({ value: '11.5' }),
      'i-Eev': createElement({ value: '0.1250' }),
      'i-sig': createElement({ value: '7.3' }),
      'i-spd': createElement({ value: '6' }),
      'i-spd-main': createElement({ value: '6' }),
      'spd-live': createElement({ textContent: '6' }),
      'spd-live-main': createElement({ textContent: '6' }),
      'i-mode': createElement({ value: 'ti' }),
      'i-show-incident': createElement({ checked: false }),
      'i-show-reflected': createElement({ checked: true }),
      'i-show-transmitted': createElement({ checked: false }),
      'i-show-probability': createElement({ checked: true }),
      'v0-live': createElement({ textContent: '2.75' }),
      modeBadge: createElement({ textContent: 'T-DEPENDENT' }),
    };

    installDom(elements);
    buildGrid();
    buildV();
    buildCN();
    initPsi();
  });

  afterEach(() => {
    globalThis.document = originalDocument;
  });

  it('preserves current control values and restarts from x = -160', () => {
    setBarrierPotential(2.75);
    applyWidth();
    applyMode();
    setWaveOrigin(-100);
    stepSim();

    expect(getStepCount()).toBe(1);
    expect(x0_).toBe(-100);

    resetSim();

    expect(getBarrierPotential()).toBeCloseTo(2.75, 6);
    expect(pot_type).toBe('delta');
    expect(getBarrierWidthNm()).toBeCloseTo(11.5, 6);
    expect(getParticleEnergyEv()).toBeCloseTo(0.125, 6);
    expect(sigma).toBeCloseTo(7.3, 6);
    expect(getSimulationSpeed()).toBe(6);
    expect(isTimeDependentMode()).toBe(false);
    expect(getScatteringVisibility()).toEqual({
      incident: false,
      reflected: true,
      transmitted: false,
      probability: true,
    });
    expect(x0_).toBe(-160);
    expect(getStepCount()).toBe(0);
    expect(globalThis.document.getElementById('modeBadge').textContent).toBe('T-INDEPENDENT');
    expect(globalThis.document.getElementById('v0-live').textContent).toBe('2.75');
  });
});