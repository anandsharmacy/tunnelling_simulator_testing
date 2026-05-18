/**
 * Preservation-Checking Tests — Y-Axis Label Stacking (Property 2)
 *
 * These tests verify that the FIXED computeYTickStep(ymax) satisfies Property 2:
 * For any ymax <= 0.15, the function returns exactly 0.05 (identical to original
 * behavior), and the X-axis tick step xTS = 40 is unaffected.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeYTickStep } from './simulation.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ── 5.1 [PBT] Property 2 — Small ymax preserves yTS = 0.05 ───────────────────

describe('5.1 [PBT] Fixed code — Property 2: yTS === 0.05 for all ymax in (0, 0.15]', () => {
  it('property: for all ymax in (0, 0.15], computeYTickStep returns exactly 0.05', () => {
    // **Validates: Requirements 3.1, 3.2**
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.001), max: Math.fround(0.15), noNaN: true }),
        (ymax) => {
          return computeYTickStep(ymax) === 0.05;
        }
      ),
      { numRuns: 1000 }
    );
  });
});

// ── 5.2 Unit Tests — specific small ymax values ───────────────────────────────

describe('5.2 Unit tests — small ymax values preserve yTS = 0.05', () => {
  it('ymax = 0.05 → yTS = 0.05', () => {
    expect(computeYTickStep(0.05)).toBe(0.05);
  });

  it('ymax = 0.10 → yTS = 0.05', () => {
    expect(computeYTickStep(0.10)).toBe(0.05);
  });

  it('ymax = 0.12 → yTS = 0.05', () => {
    expect(computeYTickStep(0.12)).toBe(0.05);
  });

  it('ymax = 0.15 → yTS = 0.05', () => {
    expect(computeYTickStep(0.15)).toBe(0.05);
  });
});

// ── 5.3 Unit test — xTS = 40 is present and unmodified in source ──────────────

describe('5.3 X-axis tick step xTS = 40 is not affected by the yTS change', () => {
  it('simulation.js source contains "const xTS = 40" (X-axis hardcoded step unchanged)', () => {
    // **Validates: Requirements 3.3**
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const source = readFileSync(join(__dirname, 'simulation.js'), 'utf8');
    expect(source).toContain('const xTS = 40');
  });
});
