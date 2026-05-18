/**
 * Exploratory Bug Condition Tests — Y-Axis Label Stacking
 *
 * These tests are EXPECTED TO FAIL on the unfixed code.
 * Failure confirms the bug exists: the hardcoded yTS = 0.1 produces
 * far too many ticks when ymax is large.
 *
 * The unfixed logic in draw() is:
 *   const yTS = ymax > 0.15 ? 0.1 : 0.05;
 *
 * We mirror that here as computeYTickStep_unfixed() so we can test it
 * in isolation without importing the fixed computeYTickStep from simulation.js.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Mirrors the OLD hardcoded logic still present in draw():
 *   const yTS = ymax > 0.15 ? 0.1 : 0.05;
 */
function computeYTickStep_unfixed(ymax) {
  return ymax > 0.15 ? 0.1 : 0.05;
}

/**
 * Number of Y-axis ticks the draw() loop produces.
 * Matches the formal spec in design.md:
 *   tickCount(ymax, yTS) = Math.ceil((2 * ymax) / yTS)
 */
function tickCount(ymax, yTS) {
  return Math.ceil((2 * ymax) / yTS);
}

// ── 2.1  Property-Based Test (EXPECTED TO FAIL) ───────────────────────────────
// Validates: Requirements 1.1, 1.2, 1.3

describe('2.1 [PBT] Unfixed code — tickCount <= 12 for all ymax > 0.15', () => {
  it('property: tickCount(ymax, computeYTickStep_unfixed(ymax)) <= 12 for ymax in (0.15, 10.5]', () => {
    // **Validates: Requirements 1.1, 1.2, 1.3**
    fc.assert(
      fc.property(
        // Generate ymax values in the bug-condition range (0.15, 10.5]
        fc.float({ min: Math.fround(0.16), max: Math.fround(10.5), noNaN: true }),
        (ymax) => {
          const yTS = computeYTickStep_unfixed(ymax);
          const count = tickCount(ymax, yTS);
          return count <= 12;
        }
      ),
      { numRuns: 1000 }
    );
  });
});

// ── 2.2  Unit Tests for specific values (EXPECTED TO FAIL) ───────────────────

describe('2.2 Unfixed code — specific ymax values produce tick count <= 12', () => {
  it('ymax = 1.0 → tickCount should be <= 12 (unfixed gives 20)', () => {
    const yTS = computeYTickStep_unfixed(1.0);
    const count = tickCount(1.0, yTS);
    // unfixed: yTS = 0.1, count = ceil(2/0.1) = 20  → FAILS
    expect(count).toBeLessThanOrEqual(12);
  });

  it('ymax = 5.0 → tickCount should be <= 12 (unfixed gives 100)', () => {
    const yTS = computeYTickStep_unfixed(5.0);
    const count = tickCount(5.0, yTS);
    // unfixed: yTS = 0.1, count = ceil(10/0.1) = 100  → FAILS
    expect(count).toBeLessThanOrEqual(12);
  });

  it('ymax = 10.0 → tickCount should be <= 12 (unfixed gives 200)', () => {
    const yTS = computeYTickStep_unfixed(10.0);
    const count = tickCount(10.0, yTS);
    // unfixed: yTS = 0.1, count = ceil(20/0.1) = 200  → FAILS
    expect(count).toBeLessThanOrEqual(12);
  });

  // Sanity check: small ymax is unaffected by the bug (should PASS)
  it('ymax = 0.12 → yTS = 0.05 (preserved, no bug here)', () => {
    const yTS = computeYTickStep_unfixed(0.12);
    expect(yTS).toBe(0.05);
    expect(tickCount(0.12, yTS)).toBeLessThanOrEqual(12);
  });
});
