// Shared stubs for driving simulation.js in Node (no real DOM or canvas).
import {
  applyMode,
  applyWidth,
  buildGrid,
  setBarrierPotential,
  setContinuousSourceActive,
  stepSim,
} from './simulation.js';

export function el(overrides = {}) {
  return { value: '', checked: false, textContent: '', ...overrides };
}

export function installDom(elements) {
  globalThis.document = {
    getElementById(id) {
      return elements[id] ?? null;
    },
  };
}

// Load a full scenario through the same entry points the modal uses.
// Width and sigma are in nm, energy in eV.
export function loadScenario({
  pot = 'single',
  widthNm = '0.8',
  energyEv = '0.72',
  sigmaNm = '1.38',
  v0 = 1,
  continuous = false,
} = {}) {
  installDom({
    'i-pot': el({ value: pot }),
    'i-Vw': el({ value: widthNm }),
    'i-Eev': el({ value: energyEv }),
    'i-sig': el({ value: sigmaNm }),
    'i-spd': el({ value: '4' }),
    'i-mode': el({ value: 'td' }),
    'i-continuous-source': el({ checked: continuous }),
    modeBadge: el(),
  });
  buildGrid();
  setBarrierPotential(v0);
  setContinuousSourceActive(false);
  applyWidth();
  applyMode();
}

export function run(n) {
  for (let i = 0; i < n; i++) stepSim();
}
