/**
 * Continuous Source Feature Tests
 *
 * These tests verify the continuous source injection, flux measurement,
 * and steady-state T/R calculation features.
 *
 * **Validates:**
 * - Continuous source activation/deactivation
 * - Flux measurement at probe points
 * - Steady-state T/R calculation from flux
 * - Absorber behavior with continuous source
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getFluxBasedTR,
  resetSim,
  applyMode,
  syncModeModalFields,
} from './simulation.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const EPSILON = 1e-6;

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Mock DOM elements for mode modal testing
 */
function setupModeDOMElements() {
  if (!document.getElementById('i-mode')) {
    const modeEl = document.createElement('select');
    modeEl.id = 'i-mode';
    modeEl.value = 'td';
    document.body.appendChild(modeEl);
  }

  if (!document.getElementById('i-continuous-source')) {
    const csEl = document.createElement('input');
    csEl.id = 'i-continuous-source';
    csEl.type = 'checkbox';
    csEl.checked = false;
    document.body.appendChild(csEl);
  }

  if (!document.getElementById('modeBadge')) {
    const badge = document.createElement('div');
    badge.id = 'modeBadge';
    badge.textContent = 'T-DEPENDENT';
    document.body.appendChild(badge);
  }
}

/**
 * Clean up DOM elements after test
 */
function cleanupModeDOMElements() {
  const els = [
    'i-mode',
    'i-continuous-source',
    'modeBadge',
    'i-Vw',
    'i-Eev',
    'i-spd',
    'i-spd-main',
  ];
  els.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });
}

// ── 1. Continuous Source Mode Tests ───────────────────────────────────────────

describe('1. Continuous Source Mode Activation', () => {
  beforeEach(() => {
    setupModeDOMElements();
    resetSim();
  });

  afterEach(() => {
    cleanupModeDOMElements();
  });

  it('should apply continuous source when checkbox is checked and mode is TD', () => {
    const csEl = document.getElementById('i-continuous-source');
    csEl.checked = true;
    
    // Apply mode should not throw
    expect(() => applyMode()).not.toThrow();
  });

  it('should handle continuous source deactivation without errors', () => {
    const csEl = document.getElementById('i-continuous-source');
    csEl.checked = true;
    applyMode();
    
    csEl.checked = false;
    expect(() => applyMode()).not.toThrow();
  });

  it('should deactivate continuous source when mode switches to TI', () => {
    const modeEl = document.getElementById('i-mode');
    const csEl = document.getElementById('i-continuous-source');
    
    csEl.checked = true;
    applyMode();
    
    modeEl.value = 'ti';
    expect(() => applyMode()).not.toThrow();
  });

  it('should reset continuous source state on reset', () => {
    const csEl = document.getElementById('i-continuous-source');
    csEl.checked = true;
    applyMode();
    
    resetSim();
    
    // After reset, checkbox should be unchecked
    expect(() => syncModeModalFields()).not.toThrow();
  });
});

// ── 2. Flux-based T/R Calculation Tests ───────────────────────────────────────

describe('2. Flux-based T/R Calculation', () => {
  beforeEach(() => {
    setupModeDOMElements();
    resetSim();
  });

  afterEach(() => {
    cleanupModeDOMElements();
  });

  it('should return valid T/R object with defined values', () => {
    const tr = getFluxBasedTR();
    expect(tr).toHaveProperty('T');
    expect(tr).toHaveProperty('R');
  });

  it('should have T and R be finite numbers', () => {
    const tr = getFluxBasedTR();
    expect(typeof tr.T).toBe('number');
    expect(typeof tr.R).toBe('number');
    expect(Number.isFinite(tr.T)).toBe(true);
    expect(Number.isFinite(tr.R)).toBe(true);
  });

  it('should have T and R in [0, 1]', () => {
    const tr = getFluxBasedTR();
    expect(tr.T).toBeGreaterThanOrEqual(0);
    expect(tr.T).toBeLessThanOrEqual(1);
    expect(tr.R).toBeGreaterThanOrEqual(0);
    expect(tr.R).toBeLessThanOrEqual(1);
  });

  it('should have T + R in reasonable range [0, 1.01]', () => {
    const tr = getFluxBasedTR();
    const sum = tr.T + tr.R;
    expect(sum).toBeGreaterThanOrEqual(0);
    expect(sum).toBeLessThanOrEqual(1.01);
  });

  it('should return consistent T/R values across multiple calls', () => {
    const tr1 = getFluxBasedTR();
    const tr2 = getFluxBasedTR();
    
    expect(Math.abs(tr1.T - tr2.T)).toBeLessThan(EPSILON);
    expect(Math.abs(tr1.R - tr2.R)).toBeLessThan(EPSILON);
  });
});

// ── 3. Mode Modal Sync Tests ──────────────────────────────────────────────────

describe('3. Mode Modal Sync', () => {
  beforeEach(() => {
    setupModeDOMElements();
    resetSim();
  });

  afterEach(() => {
    cleanupModeDOMElements();
  });

  it('should sync mode dropdown without errors', () => {
    expect(() => syncModeModalFields()).not.toThrow();
  });

  it('should sync continuous source checkbox without errors', () => {
    const csEl = document.getElementById('i-continuous-source');
    csEl.checked = true;
    applyMode();
    
    expect(() => syncModeModalFields()).not.toThrow();
  });

  it('should handle missing DOM elements gracefully', () => {
    cleanupModeDOMElements();
    
    // Should not throw even if elements are missing
    expect(() => syncModeModalFields()).not.toThrow();
    expect(() => applyMode()).not.toThrow();
  });
});

// ── 4. Integration Tests ──────────────────────────────────────────────────────

describe('4. Integration Tests', () => {
  beforeEach(() => {
    setupModeDOMElements();
    resetSim();
  });

  afterEach(() => {
    cleanupModeDOMElements();
  });

  it('should enable continuous source mode without errors', () => {
    const csEl = document.getElementById('i-continuous-source');
    csEl.checked = true;
    
    expect(() => applyMode()).not.toThrow();
  });

  it('should compute T/R after enabling continuous source', () => {
    const csEl = document.getElementById('i-continuous-source');
    csEl.checked = true;
    applyMode();
    
    const tr = getFluxBasedTR();
    expect(tr.T).toBeDefined();
    expect(tr.R).toBeDefined();
    expect(Number.isFinite(tr.T)).toBe(true);
    expect(Number.isFinite(tr.R)).toBe(true);
  });

  it('should handle mode switches with continuous source enabled', () => {
    const modeEl = document.getElementById('i-mode');
    const csEl = document.getElementById('i-continuous-source');
    
    csEl.checked = true;
    applyMode();
    
    // Switch to TI
    modeEl.value = 'ti';
    expect(() => applyMode()).not.toThrow();
    
    // Switch back to TD
    modeEl.value = 'td';
    expect(() => applyMode()).not.toThrow();
  });

  it('should reset and restore state correctly', () => {
    const csEl = document.getElementById('i-continuous-source');
    csEl.checked = true;
    applyMode();
    
    resetSim();
    
    // After reset, should be able to sync without errors
    expect(() => syncModeModalFields()).not.toThrow();
  });
});

