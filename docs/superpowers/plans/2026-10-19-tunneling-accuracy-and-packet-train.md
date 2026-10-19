# Tunneling Simulator Accuracy + Packet-Train Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the simulator's T/R numbers trustworthy and physically labelled, and make "Enable continuous source" emit a steady train of the default Gaussian packet (σ = 5, k₀ = 1.2, starting at x = −120 and moving right at 1.2).

**Architecture:** All physics stays in `js/utils/simulation.js` in internal units (ħ = m = 1). Real electron units (eV, nm, fs) are converted only at that module's exported getters/setters and in axis/readout labels. The FFT-based absorber and flux probes are replaced with a plain damping band on ψ plus a region-based tally (`getScatteringTR`). The continuous source is reimplemented as repeated `addPacket()` calls on a fixed schedule.

**Tech Stack:** Vanilla ES modules, HTML5 canvas, Vitest 4, ESLint. No new dependencies.

**Spec:** The 2026-10-19 analysis in this session. Its findings, with the measurements behind them, are restated in "Background" below so this plan stands alone.

## Background (findings this plan fixes)

Measured by running the real engine headlessly against a reference Crank–Nicolson solve (big box, no absorber) and the exact rectangular-barrier formula averaged over the packet's momentum spread:

| # | Problem | Evidence |
|---|---|---|
| 1 | T/R readout wrong before and during impact | R shows **1.0000** at t = 0–40 (the incoming packet is counted as "reflected" because it sits left of x = −50), then falls to 0.0006 at t = 90 |
| 2 | Absorber creates probability | It FFT-splits ψ into right/left-moving parts and damps one. Their cancelling tails make norm reach **1.0007**, 5×10⁻⁴ is "absorbed" at both edges while the packet is still at the barrier, and final T reads 0.0044 against 0.0022 for the same grid without the absorber |
| 3 | Grid too coarse; barrier edges snap to cells | Nx = 700 (dx = 0.458) underestimates over-barrier T by 2.7×. With cell snapping, refining the grid alone does not converge (0.8 nm barrier: 0.0551 → 0.0617 against an exact value of 0.0536). Cell-averaged edges plus Nx = 1399 give **0.0526** (−1.8%) |
| 4 | "eV"/"nm" labels are wrong | The engine uses ħ = m = 1. For an electron with energies in eV, one length unit is **0.27605 nm** and one time unit is **0.65821 fs** |
| 5 | Display issues | The incident curve stops short of the barrier edge (separate path for the transmitted curve). V(x) shares the ψ amplitude axis, which forces ymax ≥ V₀ and squashes the wave |
| 6 | Continuous source broken | It injects at x = −160 (the hard wall), never puts more than 0.005 probability into the box, and its 35-unit "protected region" switches off the entire 24-unit left absorber. It also reports T ≈ 0.12 at t = 50, before any wave reaches the barrier |
| 7 | Default shows almost no tunneling | At width 20, the textbook T at the packet's central energy is 3×10⁻¹³. All visible T is the packet's high-energy tail passing over the barrier |

User decisions (2026-10-19): **packet train** source; **real electron units**; **narrow default barrier** (width 3 sim units → **0.8 nm**).

## Global Constraints

- Internal engine units stay ħ = m = 1. Convert only at the boundary with `NM_PER_UNIT = 0.27605` and `FS_PER_UNIT = 0.65821` (electron, eV energy unit, so energies need **no** conversion).
- Defaults: V₀ = 1.00 eV, E = 0.72 eV (k₀ = 1.2), barrier width 0.8 nm, σ = 5 sim units (1.38 nm), packet centre x = −120 sim units (−33.1 nm), speed 4.
- UI ranges: width 0.1–20 nm, energy 0.001–10 eV (above ~10 eV, k·dx > 1 and the grid can't resolve the wave), σ 0.5–3 nm.
- The continuous-source train emits packets **identical** to the single default packet (same `sigma`, `k0`, centre `getDefaultPacketCenter()`).
- No new npm dependencies. Every task ends with `npx vitest --run` and `npx eslint js` green.

## Review Focus

1. **Parameter change while the train runs.** Energy, width or height changes mid-train must restart the train (clear ψ, zero the tallies). Otherwise T mixes two experiments. Test: Task 6 `restarts the train when energy changes`.
2. **Wide σ + wide barrier.** σ = 3 nm with width = 20 nm must start the packet fully left of the barrier. Test: Task 2 `widest packet never starts inside the widest barrier`.
3. **No barrier / step potential.** Free particle → T/R show "—", not numbers. Step → the step region counts as transmitted. Tests: Task 4 `no barrier gives NaN`, `step potential counts the step region as transmitted`.
4. **Very low energy train** (0.001 eV, k₀ ≈ 0.045). The emission interval must stay finite (floor k₀ at 0.05) and the readout must show "—" until half a packet has resolved. Test: Task 6 `low-energy emission interval is finite`.
5. **Energy at the resolution limit.** `setParticleEnergyEv(50)` clamps to 10 eV. Test: Task 2 `clamps energy to the resolvable range`.

## File Map

| File | Change |
|---|---|
| `js/utils/simulation.js` | All engine changes (units, absorber, readout, grid, packet train, drawing) |
| `js/utils/ui.js` | Width/energy/σ clamp ranges and fallbacks (lines 231–232, 475–477) |
| `index.html` | Slider/input ranges and defaults (lines 225–245, 340–372), continuous-source label (line 438) |
| `components/footer.html` | `t = … fs` label (line 27) |
| `js/utils/test-helpers.js` | **New.** `installDom`, `el`, `loadScenario`, `run`, `centroid` shared by test files |
| `js/utils/simulation.physics.test.js` | **New.** Units, absorber, readout and accuracy tests |
| `js/utils/simulation.continuous-source.test.js` | Rewritten for the packet train |
| `js/utils/simulation.autoscale.test.js`, `simulation.reset.test.js`, `simulation.preservation.test.js` | Expectations updated for nm units |
| `js/utils/simulation.exploratory.test.js` | **Deleted** (tests a copy of an old unfixed function defined inside the test file; can never pass) |
| `README.md`, `SIMULATION_LOGIC.md` | Units, continuous mode, readout definitions |

---

### Task 1: Green baseline

**Files:**
- Delete: `js/utils/simulation.exploratory.test.js`
- Modify: `js/utils/simulation.autoscale.test.js:84`

- [ ] **Step 1: Delete the exploratory suite.** It asserts that a function defined inside the test file is buggy, so it fails by design (4 of the 5 current failures).
- [ ] **Step 2: Fix the stale zoom expectation.** After `recenter()` the range is 320, and `zoomIn()` shrinks it by 12.5% per side, so change `toBeCloseTo(128, 6)` to `toBeCloseTo(240, 6)`.
- [ ] **Step 3: Run** `npx vitest --run`. Expected: 0 failed.
- [ ] **Step 4: Commit** `test: drop stale exploratory suite, fix zoom expectation`

---

### Task 2: Real electron units and new defaults

**Files:**
- Modify: `js/utils/simulation.js`:
  - constants (10–30)
  - `setBarrierWidthNm`/`getBarrierWidthNm` (897–912)
  - `setParticleEnergyEv` (918–929)
  - `applyWidth` (1078–1089)
  - `resetSim` (1105–1145)
  - `syncModeModalFields` (1022–1035)
  - footer time write in `draw()` (836)
- Modify: `js/utils/ui.js`:
  - width clamp at 231–232 → `0.1, 20`
  - numberConfig at 475–477:
    - `i-Vw {min 0.1, max 20, fallback 0.8, decimals 2}`
    - `i-Eev {max 10, fallback 0.72}`
    - `i-sig {min 0.5, max 3, fallback 1.38, decimals 2}`
  - `ENERGY_MAX = 10.0`
  - width display `toFixed(2)`
- Modify: `index.html`:
  - `i-bw-main`/`r-bw-main`: max 20, value 0.8, step 0.05
  - `i-Vw`: max 20, value 0.8, step 0.05
  - `i-Eev`: max 10, value 0.72
  - `i-sig`: label "Wavepacket spread σ (nm)", min 0.5, max 3, step 0.01, value 1.38
- Modify: `components/footer.html:27` → `t = <span id="tDisp">0.0</span> fs`
- Create: `js/utils/test-helpers.js`, `js/utils/simulation.physics.test.js`
- Test: `js/utils/simulation.autoscale.test.js`, `js/utils/simulation.reset.test.js`

**Interfaces:**
- Produces: `export const NM_PER_UNIT = 0.27605`, `export const FS_PER_UNIT = 0.65821`
- Produces: `setBarrierWidthNm(nm: number): number` stores `Vw_ = clamp(nm, 0.1, 20) / NM_PER_UNIT` and returns nm. `getBarrierWidthNm(): number` returns `Vw_ * NM_PER_UNIT`.
- Produces: `setParticleEnergyEv(eV)` clamps to `[-50, 10]` (the lower bound is unchanged).
- `applyWidth()` routes width through `setBarrierWidthNm` and sets `sigma = clamp(i-sig, 0.5, 3) / NM_PER_UNIT`. `resetSim`/`syncModeModalFields` write width and σ back in nm (`toFixed(2)`).
- Produces (`js/utils/test-helpers.js`, used by every later task):

```js
export function loadScenario({ pot = 'single', widthNm = '0.8', energyEv = '0.72', sigmaNm = '1.38', v0 = 1, continuous = false } = {}) {
  installDom({ 'i-pot': el({ value: pot }), 'i-Vw': el({ value: widthNm }), 'i-Eev': el({ value: energyEv }),
    'i-sig': el({ value: sigmaNm }), 'i-spd': el({ value: '4' }), 'i-mode': el({ value: 'td' }),
    'i-continuous-source': el({ checked: continuous }) });
  buildGrid(); setBarrierPotential(v0); setContinuousSourceActive(false); applyWidth(); applyMode();
}
export const run = (n) => { for (let i = 0; i < n; i++) stepSim(); };
```

`el`/`installDom` move here from the existing test files unchanged. `centroid()` is added in Task 6.

- [ ] **Step 1: Write failing tests** (`physics.test.js`, `describe('electron units')`)

```js
it('round-trips barrier width in nm and stores sim units', () => {
  loadScenario();
  expect(getBarrierWidthNm()).toBeCloseTo(0.8, 9);
  expect(setBarrierWidthNm(1)).toBeCloseTo(1, 9);
  expect(getViewportBounds().range).toBeCloseTo((1 / NM_PER_UNIT) * 80, 6); // autoZoom works in sim units
});
it('clamps energy to the resolvable range', () => { expect(setParticleEnergyEv(50)).toBeCloseTo(10, 9); });
it('defaults to the 0.8 nm barrier and the x = -120 packet', () => {
  loadScenario();
  expect(x0_).toBe(-120);
  expect(sigma).toBeCloseTo(1.38 / NM_PER_UNIT, 6);
});
it('widest packet never starts inside the widest barrier', () => {
  loadScenario({ widthNm: '20', sigmaNm: '3' });
  expect(x0_ + 4 * sigma).toBeLessThan(-(20 / NM_PER_UNIT) / 2);
});
```

Update the existing suites:
- `autoscale.test.js` (both narrow-barrier tests): change `setBarrierWidthNm(0.3)` to `setBarrierWidthNm(0.1)` and the expected range to `toBeCloseTo(0.1 / 0.27605 * 80, 6)` (≈ 28.98).
- `reset.test.js`: set the `i-sig` fixture to `"2.0"` and change the σ assertion to `expect(sigma * NM_PER_UNIT).toBeCloseTo(2.0, 6)`. `11.5` nm stays valid.

- [ ] **Step 2: Run** `npx vitest --run`. Expected: FAIL (`NM_PER_UNIT` not exported; width round-trip and energy clamp wrong).
- [ ] **Step 3: Implement** per Interfaces. Set the default `Vw_ = 0.8 / NM_PER_UNIT`. Keep `k0 = 1.2` and `sigma = 5`. Footer: `tDisp.textContent = (step * dt * FS_PER_UNIT).toFixed(1)`.
- [ ] **Step 4: Run** `npx vitest --run && npx eslint js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(units): real electron units (nm, eV, fs) with 0.8 nm default barrier`

---

### Task 3: Absorber that only removes probability

**Files:**
- Modify: `js/utils/simulation.js` — `applyOutgoingAbsorption` (423–469), `stepSim` (208–231), `buildGrid` (76–81), absorber constants (51–52)
- Test: `js/utils/simulation.physics.test.js`

**Interfaces:**
- Produces: `export function getAbsorbedProbability(): { left: number, right: number }`
- Uses the existing `getWaveNorm(): number`

- [ ] **Step 1: Write failing tests** (`describe('absorbing boundaries')`)

```js
it('absorbs a free packet without reflecting it and never gains norm', () => {
  loadScenario({ pot: 'none' });
  let prev = getWaveNorm();
  for (let i = 0; i < 6000; i++) { stepSim(); const n = getWaveNorm(); expect(n).toBeLessThanOrEqual(prev + 1e-12); prev = n; }
  const a = getAbsorbedProbability();
  expect(a.right).toBeGreaterThan(0.998);
  expect(a.left).toBeLessThan(1e-4);
});
it('absorbs essentially nothing while the packet is at the barrier', () => {
  loadScenario(); run(2000); // t = 100
  const a = getAbsorbedProbability();
  expect(a.left).toBeLessThan(1e-4);  // only the initial Gaussian tail inside the band (~1e-5); old code: 6e-4
  expect(a.right).toBeLessThan(1e-9); // old code: 5e-4
});
```

- [ ] **Step 2: Run** `npx vitest --run js/utils/simulation.physics.test.js`. Expected: FAIL (`getAbsorbedProbability` not exported; once stubbed, norm rises above its previous value).
- [ ] **Step 3: Implement.**
  - In `buildGrid`, precompute `absorberMask[i] = Math.exp(-ABSORBER_GAMMA * dt * s * s)`. `s` is the depth fraction (0 → 1) into the 24-unit band at either edge, 0 outside the bands. `ABSORBER_GAMMA = 1.5` replaces `ABSORBER_STRENGTH`.
  - Rewrite `applyOutgoingAbsorption()` to multiply `psiR/psiI` by the mask. Add the lost `|ψ|²·dx` to `absorbedLeftProb` for x < 0 and to `absorbedRightProb` otherwise. Remove the FFT split and the "protected source region".
  - Delete the `step % 40` renormalisation block in `stepSim`. Crank–Nicolson is unitary, and the clamp would destroy a multi-packet train.
  - Export `getAbsorbedProbability`.
- [ ] **Step 4: Run** `npx vitest --run`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(sim): replace FFT-split absorber with norm-safe damping band`

---

### Task 4: Honest T/R readout

**Files:**
- Modify: `js/utils/simulation.js` — new `getScatteringTR`; `draw()` lines 778–833 call it
- Test: `js/utils/simulation.physics.test.js`

**Interfaces:**
- Consumes: `getAbsorbedProbability()` (Task 3), `splitDirectionalComponents`, `getBarrierSpan` (existing)
- Produces: `export function getScatteringTR(): { T: number, R: number }`. Values are NaN when undefined.
  - No barrier → `{ T: NaN, R: NaN }`.
  - Transmitted region starts at `rightIndex + 1`, or at `leftIndex` when `rightIndex === Nx - 1` (step potential).
  - `t = Σ_transmitted |ψ|² dx + absorbedRight`; `r = Σ_{i < leftIndex} |ψ₋|² dx + absorbedLeft` (ψ₋ = left-moving part from the FFT split, readout/display only).
  - Single packet: `T = t`, `R = r` ("so far" — R starts at 0 and grows).
  - Packet train (wired in Task 6): `T = t/(t+r)`, `R = r/(t+r)`, NaN while `t + r < 0.5`.
- `draw()` shows `—` for NaN and skips the T/R bar update. `Norm` stays `getWaveNorm()`.

- [ ] **Step 1: Write failing tests** (`describe('scattering readout')`)

```js
it('reports no reflection before the packet reaches the barrier', () => {
  loadScenario(); run(1000); // t = 50
  const { T, R } = getScatteringTR();
  expect(R).toBeLessThan(1e-4); // old code: 1.0000
  expect(T).toBeLessThan(1e-6);
});
it('keeps T + R <= 1 throughout and reaches ~1 after scattering', () => {
  loadScenario();
  for (let k = 0; k < 30; k++) { run(200); const { T, R } = getScatteringTR(); expect(T + R).toBeLessThanOrEqual(1.001); }
  const { T, R } = getScatteringTR(); expect(T + R).toBeGreaterThan(0.998);
});
it('no barrier gives NaN', () => { loadScenario({ pot: 'none' }); run(10); expect(getScatteringTR().T).toBeNaN(); });
it('step potential counts the step region as transmitted', () => {
  loadScenario({ pot: 'step', v0: 0.5 }); run(6000);
  const { T } = getScatteringTR(); expect(T).toBeGreaterThan(0.88); expect(T).toBeLessThan(0.95); // analytic step T = 0.917
});
```

- [ ] **Step 2: Run** `npx vitest --run js/utils/simulation.physics.test.js`. Expected: FAIL (`getScatteringTR` not exported).
- [ ] **Step 3: Implement** `getScatteringTR` per Interfaces. Replace the `iL/iR` window, `pL/pRr`, and the `continuousSourceActive` branch in `draw()` with one call to it.
- [ ] **Step 4: Run** `npx vitest --run`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(readout): T/R measured relative to the barrier, no false reflection`

---

### Task 5: Finer grid and cell-averaged barrier edges

**Files:**
- Modify: `js/utils/simulation.js` — `Nx` (18), `buildV` (83–101)
- Test: `js/utils/simulation.physics.test.js`

**Interfaces:**
- `Nx = 1399` (dx = 320/1398 ≈ 0.2289, exactly half the old spacing). The FFT workspace becomes 2048 automatically.
- `function cellOverlap(xi: number, a: number, b: number): number` — fraction of the cell `[xi − dx/2, xi + dx/2]` inside `[a, b]`, in 0..1.
- `buildV`:
  - `single` → `V0_ * cellOverlap(x, −Vw_/2, Vw_/2)`
  - `double` → sum of both barriers' overlaps
  - `step` → `V0_ * cellOverlap(x, 0, Infinity)`
  - `delta` unchanged
- Produces: `export function getPotentialArea(): number` (Σ `V_[i]·dx`; `V_` is module-private).

- [ ] **Step 1: Write failing tests** (`describe('accuracy')`)

```js
it('discrete barrier has exactly the requested width', () => {
  loadScenario();
  expect(getPotentialArea()).toBeCloseTo(0.8 / NM_PER_UNIT, 9); // V0 = 1
});
it('default transmission is within 4% of the exact packet-averaged value 0.0536', () => {
  loadScenario(); run(6000);
  const { T } = getScatteringTR(); expect(T).toBeGreaterThan(0.0515); expect(T).toBeLessThan(0.0557);
});
it('over-barrier leak through a 5.52 nm barrier is resolved', () => {
  loadScenario({ widthNm: '5.521' }); run(6000);
  expect(getScatteringTR().T).toBeGreaterThan(0.0035); // exact 0.0059; old grid 0.0022; new grid ≈ 0.0042
});
```

- [ ] **Step 2: Run** the tests. Expected: the area and 5.52 nm tests FAIL. The 4% test may already pass on the old grid by luck: snapping and dispersion cancel at 0.0551. That's fine; it guards against regressions.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run** `npx vitest --run`. Expected: PASS (the reference solve gives 0.0526 and 0.0042).
- [ ] **Step 5: Commit** `fix(accuracy): halve dx and cell-average barrier edges`

---

### Task 6: Continuous source = train of default packets

**Files:**
- Modify: `js/utils/simulation.js`:
  - Delete: `SOURCE_ORIGIN` (define `x_min = -160` directly), `sourceAmplitude`, `sourceRamp*`, the flux accumulators, `injectSourceWave`, `measureAndAccumulateFlux`, `getFluxBasedTR`, `get/setSourceAmplitude`.
  - Rework: `initPsi` (141–162), `clearPsi`, `initWaveState` (491–499), `stepSim`, `setContinuousSourceActive` (994–1002), and the energy/width/height setters.
- Modify: `index.html:438` → `Enable continuous source (repeating packets, steady-state T/R)`
- Modify: `js/utils/test-helpers.js` — add `centroid()` = Σ x·p / Σ p from `getDensity()`
- Rewrite: `js/utils/simulation.continuous-source.test.js`

**Interfaces:**
- `function addPacket(center: number): void` — adds a normalised Gaussian (`sigma`, `k0`, phase relative to `center`) to ψ. `initPsi()` becomes `clearPsi(); addPacket(x0_)`.
- `export function getEmitIntervalSteps(): number` = `Math.ceil(12 * sigma / (Math.max(k0, 0.05) * dt))`. Default: 1000 steps (50 time units ≈ 32.9 fs, packets about 16.6 nm apart).
- `export function getEmittedPackets(): number`
- `export function getDensity(): { x: Float64Array, p: Float64Array }` — read-only x and |ψ|².
- `initWaveState()`:
  - Always: zeroes the absorbed tallies and emitted count, and sets `x0_ = getDefaultPacketCenter()`.
  - Single mode: `initPsi()` and emitted = 1.
  - Train mode: `clearPsi()`, emitted = 0, and `nextEmitStep = step` (first packet goes out on the next `stepSim()`).
- `stepSim()`: in train mode, if `step >= nextEmitStep`, call `addPacket(x0_)`, increment emitted, and add `getEmitIntervalSteps()` to `nextEmitStep` — all before the CN solve.
- `setContinuousSourceActive(v)`: sets the flag, then calls `initWaveState()` in **both** directions (disabling restores a single packet at −120).
- `setParticleEnergyEv` / `setBarrierWidthNm` / `setBarrierPotential`: when `continuousSourceActive`, call `initWaveState()` after rebuilding.
- `getScatteringTR()` takes its train branch (Task 4) when `continuousSourceActive`.

- [ ] **Step 1: Rewrite `simulation.continuous-source.test.js`.**
  - Keep: the "Mode modal sync" tests, "enables and disables with the mode selector" and "preserves the selected checkbox on reset".
  - Delete: every test using `-160`, `getFluxBasedTR` or `setWaveOrigin(-160)`.
  - Add:

```js
it('emits the default packet at x = -120 on the first step', () => {
  loadScenario({ continuous: true }); stepSim();
  expect(getEmittedPackets()).toBe(1);
  expect(getWaveNorm()).toBeCloseTo(1, 4);
  expect(centroid()).toBeCloseTo(-120, 0);
});
it('moves right at the group velocity k0 = 1.2', () => {
  loadScenario({ continuous: true }); run(500); // t = 25, before the 2nd packet
  expect(centroid()).toBeGreaterThan(-91); expect(centroid()).toBeLessThan(-89); // -120 + 1.2*25 = -90
});
it('emits a new packet every getEmitIntervalSteps() steps', () => {
  loadScenario({ continuous: true });
  expect(getEmitIntervalSteps()).toBe(1000);
  run(2001); expect(getEmittedPackets()).toBe(3);
});
it('shows no T/R until half a packet has resolved', () => {
  loadScenario({ continuous: true }); run(1500);
  expect(getScatteringTR().R).toBeNaN();
});
it('steady-state T matches the single-packet value', () => {
  loadScenario({ continuous: true }); run(8000);
  const { T, R } = getScatteringTR();
  expect(T).toBeGreaterThan(0.048); expect(T).toBeLessThan(0.058); expect(T + R).toBeCloseTo(1, 9);
});
it('restarts the train when energy changes', () => {
  loadScenario({ continuous: true }); run(3000); setParticleEnergyEv(0.5);
  expect(getEmittedPackets()).toBe(0); expect(getWaveNorm()).toBe(0);
  stepSim(); expect(getEmittedPackets()).toBe(1);
});
it('low-energy emission interval is finite', () => {
  loadScenario({ continuous: true, energyEv: '0.001' });
  expect(getEmitIntervalSteps()).toBeLessThanOrEqual(24000);
});
it('disabling restores a single packet at -120', () => {
  loadScenario({ continuous: true }); run(100); setContinuousSourceActive(false);
  expect(getWaveNorm()).toBeCloseTo(1, 6); expect(x0_).toBe(-120);
});
```

- [ ] **Step 2: Run** `npx vitest --run js/utils/simulation.continuous-source.test.js`. Expected: FAIL (new exports missing; old source sits at −160).
- [ ] **Step 3: Implement** per Interfaces and delete the old source/flux code listed under Files.
- [ ] **Step 4: Run** `npx vitest --run && npx eslint js`, then `grep -rn "SOURCE_ORIGIN\|getFluxBasedTR\|injectSourceWave" js`. Expected: tests PASS, grep prints nothing.
- [ ] **Step 5: Commit** `feat(source): continuous source emits a train of default Gaussian packets`

---

### Task 7: Display fixes

**Files:**
- Modify: `js/utils/simulation.js` — `draw()` (572–776)
- Modify: `js/utils/simulation.preservation.test.js:62-67`

**Interfaces:**
- `transmittedVisibleAt(i)` uses `i >= barrierSpan.leftIndex - 1`, so the green curve starts at the last red point (no gap).
- y-scale from the waves only: drop `maxV` from `ymax`. Draw V(x) scaled so V₀ maps to `0.8 * ymax` (`toY(V_[i] / maxV * 0.8 * ymax)`), and label the barrier top `V₀ = ${V0_.toFixed(2)} eV` in `WAVE_COLORS.potential`.
- x-axis in nm: `const X_TICK_NM = 10`. Ticks are drawn at sim x = `n * X_TICK_NM / NM_PER_UNIT` and labelled `n * X_TICK_NM`. Add the axis caption `x (nm)`.

- [ ] **Step 1: Update the preservation test.** Change `toContain("const xTS = 40")` to `toContain("const X_TICK_NM = 10")`, and rename the test to "x-axis ticks are in nm".
- [ ] **Step 2: Run** `npx vitest --run`. Expected: FAIL on that test only.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run** `npx vitest --run`. Expected: PASS.
- [ ] **Step 5: Visual check.** `python3 -m http.server 8000`, then with agent-browser open `http://localhost:8000` at a 1600×1000 viewport, click RESET, and take screenshots at t ≈ 0, at impact (≈ 60 fs) and after scattering (≈ 200 fs). Expected:
  - x-axis labelled −40…40 nm; barrier labelled "V₀ = 1.00 eV".
  - Packet amplitude fills most of the plot height.
  - No gap between the red and green curves at the barrier.
  - R never shows 1.0000 before impact; after scattering T ≈ 0.053 and R ≈ 0.947.
- [ ] **Step 6: Commit** `fix(display): nm axis, separate V scale, continuous incident/transmitted curve`

---

### Task 8: Docs and end-to-end check

**Files:**
- Modify: `README.md` (Features, Usage), `SIMULATION_LOGIC.md` (Physics model, Live statistics, Continuous source)

- [ ] **Step 1: Update docs.** Cover: electron units (`NM_PER_UNIT`, `FS_PER_UNIT`), Nx = 1399 with cell-averaged edges, the damping-band absorber (γ = 1.5, 24 units), the `getScatteringTR` definitions (single vs train), and the packet-train schedule. Delete the "every 40 steps renormalisation" text.
- [ ] **Step 2: Train in the browser.** With agent-browser: open Menu → Time Dependent modal, tick "Enable continuous source", Apply. Screenshot at about 5, 15 and 30 s. Expected:
  - A stream of identical packets leaving x ≈ −33 nm about 16.6 nm apart, moving right.
  - Reflected packets passing back through them.
  - T/R show "—" at first, then settle near T ≈ 0.05.
- [ ] **Step 3: Cross-check against Numerical Mode.** Set electron, E = 0.72 eV, V₀ = 1 eV, width = 0.8 nm. Expected: the exact T ≈ 0.0415 (plane wave at k₀). This is lower than the simulator's packet-averaged ≈ 0.053 because of the packet's energy spread; add one sentence on this to SIMULATION_LOGIC.md.
- [ ] **Step 4: Run** `npx vitest --run && npx eslint js`. Expected: PASS.
- [ ] **Step 5: Commit** `docs: document units, readout and packet-train source`
