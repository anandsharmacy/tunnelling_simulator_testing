/**
 * Fix-Checking Tests — Y-Axis Label Stacking (Property 1)
 *
 * These tests verify that the FIXED computeYTickStep(ymax) satisfies Property 1:
 * For any ymax > 0.15, the function returns a value in NICE_STEPS and the
 * resulting tickCount is in [4, 12].
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeYTickStep } from './simulation.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const NICE_STEPS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10];

/**
 * tickCount(ymax, yTS) = Math.ceil((2 * ymax) / yTS)
 * Matches the formal spec in design.md.
 */
function tickCount(ymax, yTS) {
  return Math.ceil((2 * ymax) / yTS);
}

// ── 4.1 [PBT] Property 1 — Fixed code satisfies tick count and nice step ──────

describe('4.1 [PBT] Fixed code — Property 1: yTS in NICE_STEPS and tickCount in [4, 12]', () => {
  it('property: for all ymax in (0.15, 10.5], computeYTickStep returns a NICE_STEP and tickCount is in [4, 12]', () => {
    // **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.16), max: Math.fround(10.5), noNaN: true }),
        (ymax) => {
          const yTS = computeYTickStep(ymax);
          const count = tickCount(ymax, yTS);
          return (
            NICE_STEPS.includes(yTS) &&
            count >= 4 &&
            count <= 12
          );
        }
      ),
      { numRuns: 1000 }
    );
  });
});

// ── 4.2 Unit Tests — boundary and representative values ───────────────────────

describe('4.2 Unit tests — boundary and representative ymax values', () => {
  it('ymax = 0.16 → yTS in NICE_STEPS and tickCount in [4, 12]', () => {
    const yTS = computeYTickStep(0.16);
    expect(NICE_STEPS).toContain(yTS);
    expect(tickCount(0.16, yTS)).toBeGreaterThanOrEqual(4);
    expect(tickCount(0.16, yTS)).toBeLessThanOrEqual(12);
  });

  it('ymax = 0.20 → yTS = 0.05, tickCount = 8', () => {
    const yTS = computeYTickStep(0.20);
    expect(yTS).toBe(0.05);
    expect(tickCount(0.20, yTS)).toBe(8);
  });

  it('ymax = 0.5 → yTS = 0.2, tickCount = 5', () => {
    const yTS = computeYTickStep(0.5);
    expect(yTS).toBe(0.2);
    expect(tickCount(0.5, yTS)).toBe(5);
  });

  it('ymax = 1.0 → yTS = 0.5, tickCount = 4', () => {
    const yTS = computeYTickStep(1.0);
    expect(yTS).toBe(0.5);
    expect(tickCount(1.0, yTS)).toBe(4);
  });

  it('ymax = 2.0 → yTS = 0.5, tickCount = 8', () => {
    const yTS = computeYTickStep(2.0);
    expect(yTS).toBe(0.5);
    expect(tickCount(2.0, yTS)).toBe(8);
  });

  it('ymax = 5.0 → yTS = 2, tickCount = 5', () => {
    const yTS = computeYTickStep(5.0);
    expect(yTS).toBe(2);
    expect(tickCount(5.0, yTS)).toBe(5);
  });

  it('ymax = 10.0 → yTS = 5, tickCount = 4', () => {
    const yTS = computeYTickStep(10.0);
    expect(yTS).toBe(5);
    expect(tickCount(10.0, yTS)).toBe(4);
  });

  it('ymax = 10.5 → yTS = 5, tickCount = 5', () => {
    const yTS = computeYTickStep(10.5);
    expect(yTS).toBe(5);
    expect(tickCount(10.5, yTS)).toBe(5);
  });
});
