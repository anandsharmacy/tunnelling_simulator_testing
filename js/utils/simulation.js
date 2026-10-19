// utils/simulation.js
// Core simulation engine functions extracted from main.js
// Exported functions and state for UI module to use.

let canvas, ctx;
let dpr = 1;
let cssW = 0,
  cssH = 0;
let resizeObserver = null;
// Internal simulation units:
// hbar = 1 and m = 1 simplify TDSE updates and keep arithmetic stable.
// For an electron with energies in eV, one length unit is hbar/sqrt(m_e·eV)
// and one time unit is hbar/eV. Convert only at the UI boundary.
export const NM_PER_UNIT = 0.27605,
  FS_PER_UNIT = 0.65821;
const hbar = 1,
  m_ = 1,
  x_min = -160,
  x_max = 160;
let view_x_min = x_min,
  view_x_max = x_max;
// dx = 320/1398 ≈ 0.229 (≈ 23 points per wavelength at the default k0 = 1.2).
const Nx = 1399,
  dt = 0.05;
let step = 0,
  running = true,
  stepsPerFrame = 4,
  timeDependent = true;
export let k0 = 1.2,
  sigma = 5.0,
  x0_ = -120,
  pot_type = 'single',
  V0_ = 1.0,
  Vw_ = 0.8 / NM_PER_UNIT;
let dx, x_, psiR, psiI, V_;
let A_dR, A_dI, B_dR, B_dI, A_oI, B_oI, cpR, cpI, rhsR, rhsI;
let fftWorkspace = null;

// Continuous source: a train of copies of the default packet, one every
// getEmitIntervalSteps() steps, all launched from the same centre x0_.
let continuousSourceActive = false;
let emittedPackets = 0; // probability put into the box (each packet has norm 1)
let nextEmitStep = 0;

const WAVE_COLORS = {
  potential: '#7c9ec5',
  incident: '#d62728',
  reflected: '#1a3fbf',
  transmitted: '#16a085',
  probability: '#a263ea',
};

// Edge bands that damp ψ itself: probability only ever leaves the box, and
// the lost amount is booked to the side it left from.
const ABSORBER_WIDTH = 24;
const ABSORBER_GAMMA = 1.5; // damping rate at the outer wall, per time unit
let absorberMask;

let absorbedLeftProb = 0;
let absorbedRightProb = 0;

export function initCanvas() {
  // Attach to the main canvas and prepare a low-latency 2D context.
  canvas = document.getElementById('simCanvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!ctx) return;

  // Keep canvas backing store matched to device pixel ratio for crisp rendering.
  const parent = canvas.parentElement;
  const onResize = () => resize();
  if (parent && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(parent);
  } else {
    window.addEventListener('resize', onResize);
  }
}

export function buildGrid() {
  // Uniform spatial grid x[i] over [x_min, x_max].
  dx = (x_max - x_min) / (Nx - 1);
  x_ = new Float64Array(Nx);
  absorberMask = new Float64Array(Nx);
  for (let i = 0; i < Nx; i++) {
    x_[i] = x_min + i * dx;
    // Depth fraction into the nearest edge band: 0 at its inner edge, 1 at the wall.
    const depth = Math.max(
      0,
      (x_min + ABSORBER_WIDTH - x_[i]) / ABSORBER_WIDTH,
      (x_[i] - (x_max - ABSORBER_WIDTH)) / ABSORBER_WIDTH
    );
    absorberMask[i] = Math.exp(-ABSORBER_GAMMA * dt * depth * depth);
  }
  absorberMask[0] = absorberMask[Nx - 1] = 0; // Dirichlet walls
}

function cellOverlap(xi, a, b) {
  // Fraction of the grid cell [xi - dx/2, xi + dx/2] that lies inside [a, b].
  // Averaging V over each cell keeps the barrier's width exact instead of
  // snapping its edges to whole cells.
  return (
    Math.max(0, Math.min(xi + dx / 2, b) - Math.max(xi - dx / 2, a)) / dx
  );
}

export function buildV() {
  // Build potential profile V(x) for the selected barrier type.
  V_ = new Float64Array(Nx);
  if (pot_type === 'none') return;
  if (pot_type === 'single') {
    for (let i = 0; i < Nx; i++)
      V_[i] = V0_ * cellOverlap(x_[i], -Vw_ / 2, Vw_ / 2);
  } else if (pot_type === 'double') {
    const g = 30,
      w = Math.min(Vw_, 14);
    for (let i = 0; i < Nx; i++)
      V_[i] =
        V0_ *
        (cellOverlap(x_[i], -g / 2 - w / 2, -g / 2 + w / 2) +
          cellOverlap(x_[i], g / 2 - w / 2, g / 2 + w / 2));
  } else if (pot_type === 'step') {
    for (let i = 0; i < Nx; i++) V_[i] = V0_ * cellOverlap(x_[i], 0, Infinity);
  } else if (pot_type === 'delta') {
    const w = Math.max(0.3, dx * 2);
    for (let i = 0; i < Nx; i++) if (Math.abs(x_[i]) < w / 2) V_[i] = V0_ * 5;
  }
}

export function buildCN() {
  // Crank–Nicolson setup:
  // (I + i dt H / 2hbar) ψ^{n+1} = (I - i dt H / 2hbar) ψ^n
  // We store tridiagonal terms in split real/imag form.
  const coef = (-hbar * hbar) / (2 * m_ * dx * dx),
    bt = dt / (2 * hbar);
  A_dR = new Float64Array(Nx);
  A_dI = new Float64Array(Nx);
  B_dR = new Float64Array(Nx);
  B_dI = new Float64Array(Nx);
  for (let i = 0; i < Nx; i++) {
    const Hd = -2 * coef + V_[i];
    A_dR[i] = 1;
    A_dI[i] = bt * Hd;
    B_dR[i] = 1;
    B_dI[i] = -bt * Hd;
  }
  A_oI = bt * coef;
  B_oI = -bt * coef;
  cpR = new Float64Array(Nx - 1);
  cpI = new Float64Array(Nx - 1);
  const br = A_dR[0],
    bi = A_dI[0];
  let mg = br * br + bi * bi;
  cpR[0] = (A_oI * bi) / mg;
  cpI[0] = (A_oI * br) / mg;
  for (let i = 1; i < Nx - 1; i++) {
    const dr = A_dR[i] - -A_oI * cpI[i - 1],
      di = A_dI[i] - A_oI * cpR[i - 1];
    mg = dr * dr + di * di;
    cpR[i] = (A_oI * di) / mg;
    cpI[i] = (A_oI * dr) / mg;
  }
  // RHS scratch buffers reused each timestep.
  rhsR = new Float64Array(Nx);
  rhsI = new Float64Array(Nx);
}

export function initPsi() {
  // Initial state: one Gaussian wavepacket centered at x0_ with carrier k0.
  clearPsi();
  addPacket(x0_);
}

function addPacket(center) {
  // Add a unit-norm Gaussian packet (width sigma, carrier k0) to ψ.
  // Phase is measured relative to the packet center.
  let sum = 0;
  for (let i = 0; i < Nx; i++) {
    const d = x_[i] - center;
    sum += Math.exp((-d * d) / (2 * sigma * sigma));
  }
  const amp = 1 / Math.sqrt(sum * dx);
  for (let i = 0; i < Nx; i++) {
    const d = x_[i] - center;
    const e = amp * Math.exp((-d * d) / (4 * sigma * sigma));
    psiR[i] += e * Math.cos(k0 * d);
    psiI[i] += e * Math.sin(k0 * d);
  }
}

export function applyB(pR, pI, oR, oI) {
  // Apply matrix B to current state: o = B * ψ^n.
  // This builds the complex RHS for the CN linear solve.
  for (let i = 0; i < Nx; i++) {
    oR[i] = B_dR[i] * pR[i] - B_dI[i] * pI[i];
    oI[i] = B_dR[i] * pI[i] + B_dI[i] * pR[i];
    if (i > 0) {
      oR[i] += -B_oI * pI[i - 1];
      oI[i] += B_oI * pR[i - 1];
    }
    if (i < Nx - 1) {
      oR[i] += -B_oI * pI[i + 1];
      oI[i] += B_oI * pR[i + 1];
    }
  }
  oR[0] = oI[0] = oR[Nx - 1] = oI[Nx - 1] = 0;
}

export function thomas() {
  // Solve A * ψ^{n+1} = RHS using complex Thomas algorithm (O(N)).
  const dpR = new Float64Array(Nx),
    dpI = new Float64Array(Nx);
  const br = A_dR[0],
    bi = A_dI[0];
  let mg = br * br + bi * bi;
  dpR[0] = (rhsR[0] * br + rhsI[0] * bi) / mg;
  dpI[0] = (rhsI[0] * br - rhsR[0] * bi) / mg;
  for (let i = 1; i < Nx; i++) {
    const dr = A_dR[i] - -A_oI * cpI[i - 1],
      di = A_dI[i] - A_oI * cpR[i - 1];
    mg = dr * dr + di * di;
    const nr = rhsR[i] - -A_oI * dpI[i - 1],
      ni = rhsI[i] - A_oI * dpR[i - 1];
    dpR[i] = (nr * dr + ni * di) / mg;
    dpI[i] = (ni * dr - nr * di) / mg;
  }
  psiR[Nx - 1] = dpR[Nx - 1];
  psiI[Nx - 1] = dpI[Nx - 1];
  for (let i = Nx - 2; i >= 0; i--) {
    psiR[i] = dpR[i] - (cpR[i] * psiR[i + 1] - cpI[i] * psiI[i + 1]);
    psiI[i] = dpI[i] - (cpR[i] * psiI[i + 1] + cpI[i] * psiR[i + 1]);
  }
}

export function stepSim() {
  // One full time step:
  // 0) emit the next train packet if due, 1) build RHS with B, 2) solve with A,
  // 3) absorb outgoing edge waves.
  // No renormalisation: Crank–Nicolson is unitary and the absorber only removes.
  if (continuousSourceActive && step >= nextEmitStep) {
    addPacket(x0_);
    emittedPackets += 1;
    nextEmitStep += getEmitIntervalSteps();
  }
  applyB(psiR, psiI, rhsR, rhsI);
  thomas();
  applyOutgoingAbsorption();
  step++;
}

function nextPowerOfTwo(value) {
  let size = 1;
  while (size < value) size <<= 1;
  return size;
}

function ensureFftWorkspace(size) {
  if (fftWorkspace?.size === size) return fftWorkspace;
  fftWorkspace = {
    size,
    freqR: new Float64Array(size),
    freqI: new Float64Array(size),
    posR: new Float64Array(size),
    posI: new Float64Array(size),
    negR: new Float64Array(size),
    negI: new Float64Array(size),
  };
  return fftWorkspace;
}

function fftInPlace(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      const ti = im[i];
      re[i] = re[j];
      im[i] = im[j];
      re[j] = tr;
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wLenR = Math.cos(ang);
    const wLenI = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wR = 1;
      let wI = 0;
      for (let j = 0; j < len / 2; j++) {
        const uR = re[i + j];
        const uI = im[i + j];
        const vR = re[i + j + len / 2] * wR - im[i + j + len / 2] * wI;
        const vI = re[i + j + len / 2] * wI + im[i + j + len / 2] * wR;

        re[i + j] = uR + vR;
        im[i + j] = uI + vI;
        re[i + j + len / 2] = uR - vR;
        im[i + j + len / 2] = uI - vI;

        const nextWR = wR * wLenR - wI * wLenI;
        wI = wR * wLenI + wI * wLenR;
        wR = nextWR;
      }
    }
  }

  if (!inverse) return;
  for (let i = 0; i < n; i++) {
    re[i] /= n;
    im[i] /= n;
  }
}

function splitDirectionalComponents(realPart, imagPart) {
  const size = nextPowerOfTwo(realPart.length);
  const workspace = ensureFftWorkspace(size);
  const { freqR, freqI, posR, posI, negR, negI } = workspace;

  freqR.fill(0);
  freqI.fill(0);
  freqR.set(realPart);
  freqI.set(imagPart);
  fftInPlace(freqR, freqI, false);

  posR.fill(0);
  posI.fill(0);
  negR.fill(0);
  negI.fill(0);

  posR[0] = freqR[0];
  posI[0] = freqI[0];
  if (size > 1) {
    const nyquist = size / 2;
    posR[nyquist] = freqR[nyquist];
    posI[nyquist] = freqI[nyquist];
  }

  for (let i = 1; i < size / 2; i++) {
    posR[i] = freqR[i];
    posI[i] = freqI[i];
  }
  for (let i = size / 2 + 1; i < size; i++) {
    negR[i] = freqR[i];
    negI[i] = freqI[i];
  }

  fftInPlace(posR, posI, true);
  fftInPlace(negR, negI, true);

  return workspace;
}

function getBarrierSpan() {
  let leftIndex = -1;
  let rightIndex = -1;

  for (let i = 0; i < Nx; i++) {
    if (V_[i] <= 1e-9) continue;
    if (leftIndex === -1) leftIndex = i;
    rightIndex = i;
  }

  return {
    hasBarrier: leftIndex !== -1,
    leftIndex: leftIndex === -1 ? Nx : leftIndex,
    rightIndex,
  };
}

function drawCurve(values, toX, toY, color, isVisible, { lineWidth = 2, alpha = 1 } = {}) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.globalAlpha = alpha;
  ctx.beginPath();

  let segmentOpen = false;
  for (let i = 0; i < Nx; i++) {
    if (!isVisible(i)) {
      segmentOpen = false;
      continue;
    }

    const px = toX(x_[i]);
    const py = toY(values[i]);
    if (!segmentOpen) {
      ctx.moveTo(px, py);
      segmentOpen = true;
    } else {
      ctx.lineTo(px, py);
    }
  }

  ctx.stroke();
  ctx.restore();
}

function applyOutgoingAbsorption() {
  // Damp ψ in the edge bands (mask is 1 elsewhere and 0 at the walls) and book
  // the removed |ψ|²·dx to the side it left from.
  let leftLoss = 0;
  let rightLoss = 0;
  for (let i = 0; i < Nx; i++) {
    const m = absorberMask[i];
    if (m === 1) continue;
    const before = psiR[i] * psiR[i] + psiI[i] * psiI[i];
    psiR[i] *= m;
    psiI[i] *= m;
    const lost = before * (1 - m * m);
    if (x_[i] < 0) leftLoss += lost;
    else rightLoss += lost;
  }
  absorbedLeftProb += leftLoss * dx;
  absorbedRightProb += rightLoss * dx;
}

function clearPsi() {
  if (!psiR || psiR.length !== Nx) psiR = new Float64Array(Nx);
  else psiR.fill(0);
  if (!psiI || psiI.length !== Nx) psiI = new Float64Array(Nx);
  else psiI.fill(0);
  absorbedLeftProb = 0;
  absorbedRightProb = 0;
}

function getDefaultPacketCenter() {
  // Keep the packet well inside the domain so the hard boundary
  // does not clip the Gaussian and generate spurious ripples.
  const boundaryMargin = Math.max(40, 6 * sigma);
  return Math.min(-80, x_min + boundaryMargin);
}

function initWaveState() {
  // Both modes start from the same packet centre; the train simply keeps
  // adding copies of it, starting on the next stepSim().
  x0_ = getDefaultPacketCenter();
  if (continuousSourceActive) {
    clearPsi();
    emittedPackets = 0;
    nextEmitStep = step;
  } else {
    initPsi();
    emittedPackets = 1;
  }
}

export function getEmitIntervalSteps() {
  // Space packets ~12σ apart at the group velocity k0 (floored so a near-zero
  // energy still gets a finite interval).
  return Math.ceil((12 * sigma) / (Math.max(k0, 0.05) * dt));
}

export function getEmittedPackets() {
  return emittedPackets;
}

export function getDensity() {
  const p = new Float64Array(Nx);
  for (let i = 0; i < Nx; i++) p[i] = psiR[i] * psiR[i] + psiI[i] * psiI[i];
  return { x: x_, p };
}

export function computeYTickStep(ymax) {
  if (!(ymax > 0)) return 0.05;
  if (ymax <= 0.15) return 0.05;

  const niceSteps = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10];
  const targetTickCount = 6;
  let bestStep = niceSteps[niceSteps.length - 1];
  let bestDistance = Infinity;

  for (const stepSize of niceSteps) {
    const tickCount = Math.ceil((2 * ymax) / stepSize);
    if (tickCount < 4 || tickCount > 12) continue;

    const distance = Math.abs(tickCount - targetTickCount);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestStep = stepSize;
    }
  }

  return bestStep;
}

export function getScatteringTR() {
  // Measured relative to the barrier, never from fixed windows:
  //   t = |ψ|² past the barrier's right edge (or inside a step) + right-edge absorption
  //   r = left-moving |ψ₋|² left of the barrier + left-edge absorption
  // so the incoming packet never counts as reflected.
  // Single packet: T = t, R = r ("so far"). Packet train: the steady-state
  // split t/(t+r), r/(t+r), once at least half a packet has resolved.
  const span = getBarrierSpan();
  if (!span.hasBarrier) return { T: NaN, R: NaN };
  const tStart =
    span.rightIndex === Nx - 1 ? span.leftIndex : span.rightIndex + 1;
  const { negR, negI } = splitDirectionalComponents(psiR, psiI);
  let t = 0,
    r = 0;
  for (let i = tStart; i < Nx; i++) t += psiR[i] * psiR[i] + psiI[i] * psiI[i];
  for (let i = 0; i < span.leftIndex; i++)
    r += negR[i] * negR[i] + negI[i] * negI[i];
  t = t * dx + absorbedRightProb;
  r = r * dx + absorbedLeftProb;
  if (!continuousSourceActive) return { T: t, R: r };
  if (t + r < 0.5) return { T: NaN, R: NaN };
  return { T: t / (t + r), R: r / (t + r) };
}

export function draw() {
  if (!canvas || !ctx) return;

  const visibility = getScatteringVisibility();
  const { posR, negR } = splitDirectionalComponents(psiR, psiI);
  const barrierSpan = getBarrierSpan();
  const incidentVisibleAt = (i) =>
    visibility.incident && (!barrierSpan.hasBarrier || i < barrierSpan.leftIndex);
  const reflectedVisibleAt = (i) =>
    visibility.reflected && barrierSpan.hasBarrier && i < barrierSpan.leftIndex;
  // Starts one point early so the transmitted curve joins the incident one.
  const transmittedVisibleAt = (i) =>
    visibility.transmitted &&
    barrierSpan.hasBarrier &&
    i >= barrierSpan.leftIndex - 1;

  // Draw in CSS pixel coordinates; backing store is scaled by DPR in resize().
  const W = cssW,
    H = cssH;
  ctx.clearRect(0, 0, W, H);
  const PW = W - 58 - 20,
    PH = H - 18 - 38;
  ctx.fillStyle = '#f0f4f8';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e8eef5';
  ctx.fillRect(58, 18, PW, PH);

  // y-axis scale comes from the waves only; V(x) gets its own scale below.
  let maxAmp = 0,
    maxV = 0;
  for (let i = 0; i < Nx; i++) {
    if (incidentVisibleAt(i)) maxAmp = Math.max(maxAmp, Math.abs(posR[i]));
    if (reflectedVisibleAt(i)) maxAmp = Math.max(maxAmp, Math.abs(negR[i]));
    if (transmittedVisibleAt(i)) maxAmp = Math.max(maxAmp, Math.abs(posR[i]));
    if (visibility.probability) {
      maxAmp = Math.max(maxAmp, psiR[i] * psiR[i] + psiI[i] * psiI[i]);
    }
    if (V_[i] > maxV) maxV = V_[i];
  }
  if (maxAmp < 0.001) maxAmp = 0.25;
  let ymax = Math.ceil(maxAmp * 10) / 10 + 0.02;
  ymax = Math.max(ymax, 0.1);
  const ymin = -ymax;
  const toX = (xi) => 58 + ((xi - view_x_min) / (view_x_max - view_x_min)) * PW;
  const toY = (v) => 18 + PH - ((v - ymin) / (ymax - ymin)) * PH;
  // V(x) is drawn so its peak sits at 80% of the wave axis, labelled in eV.
  const toYV = (v) => toY(maxV > 0 ? (v / maxV) * 0.8 * ymax : 0);

  // x-axis ticks in nm: 10 nm, or the largest of 5/2/1 nm that still gives
  // at least 4 ticks when zoomed in.
  const X_TICK_NM = 10;
  const viewNm = (view_x_max - view_x_min) * NM_PER_UNIT;
  const xTickNm =
    [X_TICK_NM, 5, 2, 1].find((s) => viewNm / s >= 4) ?? 1;
  const xTS = xTickNm / NM_PER_UNIT; // in sim units
  const nFirst = Math.ceil(view_x_min / xTS);
  const nLast = Math.floor(view_x_max / xTS);

  // Grid lines and frame.
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1;
  for (let n = nFirst; n <= nLast; n++) {
    const px = toX(n * xTS);
    ctx.beginPath();
    ctx.moveTo(px, 18);
    ctx.lineTo(px, 18 + PH);
    ctx.stroke();
  }
  const yTS = computeYTickStep(ymax);
  for (let yv = Math.ceil(ymin / yTS) * yTS; yv <= ymax + 0.001; yv += yTS) {
    const py = toY(yv);
    ctx.beginPath();
    ctx.moveTo(58, py);
    ctx.lineTo(58 + PW, py);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(100,120,150,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(58, 18, PW, PH);

  // Axis labels.
  ctx.fillStyle = '#333';
  ctx.font = '11px Inter,sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let yv = Math.ceil(ymin / yTS) * yTS; yv <= ymax + 0.001; yv += yTS) {
    const py = toY(yv);
    const lbl = Math.abs(yv) < 0.001 ? '0.0' : yv.toFixed(1);
    ctx.fillText(lbl, 58 - 6, py);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let n = nFirst; n <= nLast; n++) {
    ctx.fillText(String(n * xTickNm), toX(n * xTS), 18 + PH + 6);
  }
  ctx.textAlign = 'right';
  ctx.fillText('x (nm)', 58 + PW, 18 + PH + 20);

  // Potential V(x) overlay (filled + outline) on its own scale.
  if (maxV > 0) {
    ctx.save();
    ctx.fillStyle = 'rgba(124,158,197,0.18)';
    ctx.beginPath();
    const y0 = toY(0);
    for (let i = 0; i < Nx; i++) {
      const px = toX(x_[i]),
        py = toYV(V_[i]);
      if (i === 0) ctx.moveTo(px, y0);
      ctx.lineTo(px, py);
    }
    ctx.lineTo(toX(x_[Nx - 1]), y0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = WAVE_COLORS.potential;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < Nx; i++) {
      const px = toX(x_[i]),
        py = toYV(V_[i]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    // Label the barrier height above its centre (kept inside the view).
    const labelX = Math.min(
      Math.max((x_[barrierSpan.leftIndex] + x_[barrierSpan.rightIndex]) / 2, view_x_min),
      view_x_max
    );
    ctx.fillStyle = WAVE_COLORS.potential;
    ctx.font = '600 12px Inter,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`V₀ = ${V0_.toFixed(2)} eV`, toX(labelX), toYV(maxV) - 4);
    ctx.restore();
  }

  // Scattering view: right-moving content is shown as the incident wave
  // before the barrier and as the transmitted wave inside/after the barrier.
  if (visibility.incident) {
    drawCurve(posR, toX, toY, WAVE_COLORS.incident, incidentVisibleAt);
  }
  if (visibility.reflected && barrierSpan.hasBarrier) {
    drawCurve(negR, toX, toY, WAVE_COLORS.reflected, reflectedVisibleAt);
  }
  if (visibility.transmitted && barrierSpan.hasBarrier) {
    drawCurve(posR, toX, toY, WAVE_COLORS.transmitted, transmittedVisibleAt);
  }

  // Optional total probability-density overlay.
  const prob = new Float64Array(Nx);
  for (let i = 0; i < Nx; i++) prob[i] = psiR[i] * psiR[i] + psiI[i] * psiI[i];
  if (visibility.probability) {
    drawCurve(prob, toX, toY, WAVE_COLORS.probability, () => true, {
      lineWidth: 1.5,
      alpha: 0.65,
    });
  }

  // Zero line
  ctx.save();
  ctx.strokeStyle = 'rgba(60,80,110,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(58, toY(0));
  ctx.lineTo(58 + PW, toY(0));
  ctx.stroke();
  ctx.restore();

  // Compact legend box in top-right of plot area.
  const legItems = [{ color: WAVE_COLORS.potential, label: 'V(x)' }];
  if (visibility.incident) {
    legItems.push({ color: WAVE_COLORS.incident, label: 'Incident' });
  }
  if (visibility.reflected && barrierSpan.hasBarrier) {
    legItems.push({ color: WAVE_COLORS.reflected, label: 'Reflected' });
  }
  if (visibility.transmitted && barrierSpan.hasBarrier) {
    legItems.push({ color: WAVE_COLORS.transmitted, label: 'Transmitted' });
  }
  if (visibility.probability) {
    legItems.push({ color: WAVE_COLORS.probability, label: '|ψ|²' });
  }
  ctx.font = '12px Inter,sans-serif';
  let maxLW = 0;
  legItems.forEach((it) => {
    const lw = ctx.measureText(it.label).width;
    if (lw > maxLW) maxLW = lw;
  });
  const legW = maxLW + 36,
    legH = legItems.length * 20 + 12,
    bx = 58 + PW - legW - 8,
    by = 18 + 8;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.strokeStyle = 'rgba(160,180,210,0.5)';
  ctx.lineWidth = 1;
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(bx, by, legW, legH, 5);
    ctx.fill();
    ctx.stroke();
  } else {
    // Fallback for older browsers.
    ctx.fillRect(bx, by, legW, legH);
    ctx.strokeRect(bx, by, legW, legH);
  }
  legItems.forEach((it, idx) => {
    const iy = by + 10 + idx * 20;
    ctx.strokeStyle = it.color;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(bx + 8, iy + 5);
    ctx.lineTo(bx + 26, iy + 5);
    ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.font = 'italic 12px Crimson Pro,Georgia,serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(it.label, bx + 30, iy + 5);
  });
  ctx.restore();

  let pT = 0;
  for (let i = 0; i < Nx; i++) pT += prob[i];
  pT *= dx;

  // NaN (shown as "—") when T/R is undefined, e.g. no barrier.
  const { T: displayT, R: displayR } = getScatteringTR();
  const fmtTR = (v) => (Number.isFinite(v) ? v.toFixed(4) : '—');

  const sT = document.getElementById('sT');
  const sR = document.getElementById('sR');
  const sN = document.getElementById('sN');
  const sE = document.getElementById('sE');
  if (sT) sT.textContent = fmtTR(displayT);
  if (sR) sR.textContent = fmtTR(displayR);
  if (sN) sN.textContent = pT.toFixed(4);
  if (sE) sE.textContent = ((k0 * k0) / 2).toFixed(3);
  const tr = displayR + displayT;
  if (tr > 0.01) {
    const bT = document.getElementById('bT');
    const bR = document.getElementById('bR');
    if (bT) bT.style.width = ((displayT / tr) * 100).toFixed(1) + '%';
    if (bR) bR.style.width = ((displayR / tr) * 100).toFixed(1) + '%';
  }
  const tDisp = document.getElementById('tDisp');
  const stDisp = document.getElementById('stDisp');
  if (tDisp) tDisp.textContent = (step * dt * FS_PER_UNIT).toFixed(1);
  if (stDisp) stDisp.textContent = step;
}

export function resize() {
  if (!canvas || !ctx || !canvas.parentElement) return;
  // Keep drawing coordinates in CSS pixels while backing buffer uses DPR.
  const r = canvas.parentElement.getBoundingClientRect();
  cssW = Math.max(1, Math.floor(r.width));
  cssH = Math.max(1, Math.floor(r.height));
  dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const nextW = Math.floor(cssW * dpr);
  const nextH = Math.floor(cssH * dpr);
  if (canvas.width !== nextW) canvas.width = nextW;
  if (canvas.height !== nextH) canvas.height = nextH;

  // Map drawing units to CSS pixels.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function loop() {
  // Animation loop: advance simulation (if running) then redraw.
  if (running && timeDependent)
    for (let s = 0; s < stepsPerFrame; s++) stepSim();
  draw();
  requestAnimationFrame(loop);
}

export function stopSim() {
  running = false;
}

export function setRunning(val) {
  running = val;
}

export function changeHeight(delta) {
  V0_ = Math.round(Math.max(0.1, Math.min(10.0, V0_ + delta)) * 100) / 100;
  document.getElementById('v0-live').textContent = V0_.toFixed(2);
  buildV();
  buildCN();
  // showHeightToast is defined in ui module; we will call it via UI after import.
}

export function getBarrierPotential() {
  return V0_;
}

export function setBarrierPotential(value) {
  const next = Number(value);
  if (Number.isFinite(next)) {
    V0_ = Math.round(Math.max(0.1, Math.min(10.0, next)) * 100) / 100;
    const live = document.getElementById('v0-live');
    if (live) live.textContent = V0_.toFixed(2);
    buildV();
    buildCN();
    autoZoomBarrier();
    restartTrainIfActive();
  }
  return V0_;
}

function restartTrainIfActive() {
  // A physics change mid-train would mix two experiments in one T/R tally.
  if (continuousSourceActive) initWaveState();
}

export function getBarrierWidthNm() {
  return Vw_ * NM_PER_UNIT;
}

export function setBarrierWidthNm(value) {
  const next = Number(value);
  if (Number.isFinite(next)) {
    Vw_ = Math.max(0.1, Math.min(20.0, next)) / NM_PER_UNIT;
    const live = document.getElementById('bw-live');
    if (live) live.textContent = getBarrierWidthNm().toFixed(2);
    buildV();
    buildCN();
    autoZoomBarrier();
    restartTrainIfActive();
  }
  return getBarrierWidthNm();
}

export function getParticleEnergyEv() {
  return (k0 * k0) / 2;
}

export function setParticleEnergyEv(value) {
  const next = Number(value);
  if (Number.isFinite(next)) {
    // Above ~10 eV, k·dx > 1 and the grid can no longer resolve the wave.
    const energy = Math.max(-50.0, Math.min(10.0, next));
    k0 = Math.sqrt(Math.max(0, 2 * energy));
    const live = document.getElementById('pe-live');
    if (live) live.textContent = energy.toFixed(4);
    buildCN();
    autoZoomBarrier();
    restartTrainIfActive();
  }
  return getParticleEnergyEv();
}

export function getSimulationSpeed() {
  return stepsPerFrame;
}

export function setSimulationSpeed(value) {
  const next = Number(value);
  if (Number.isFinite(next)) {
    stepsPerFrame = Math.max(1, Math.min(7, Math.round(next)));
    const live = document.getElementById('spd-live');
    if (live) live.textContent = String(stepsPerFrame);
    const liveMain = document.getElementById('spd-live-main');
    if (liveMain) liveMain.textContent = String(stepsPerFrame);
    const slider = document.getElementById('i-spd');
    if (slider) slider.value = String(stepsPerFrame);
    const sliderMain = document.getElementById('i-spd-main');
    if (sliderMain) sliderMain.value = String(stepsPerFrame);
  }
  return stepsPerFrame;
}

export function isTimeDependentMode() {
  return timeDependent;
}

export function getStepCount() {
  return step;
}

export function getWaveNorm() {
  if (!psiR || !psiI) return 0;
  let normSq = 0;
  for (let i = 0; i < Nx; i++) normSq += psiR[i] * psiR[i] + psiI[i] * psiI[i];
  return normSq * dx;
}

export function getPotentialArea() {
  let area = 0;
  for (let i = 0; i < Nx; i++) area += V_[i];
  return area * dx;
}

export function getAbsorbedProbability() {
  return { left: absorbedLeftProb, right: absorbedRightProb };
}

export function setWaveOrigin(value) {
  const next = Number(value);
  if (Number.isFinite(next)) x0_ = next;
  return x0_;
}

export function getScatteringVisibility() {
  return {
    incident: document.getElementById('i-show-incident')?.checked ?? true,
    reflected: document.getElementById('i-show-reflected')?.checked ?? true,
    transmitted: document.getElementById('i-show-transmitted')?.checked ?? true,
    probability: document.getElementById('i-show-probability')?.checked ?? true,
  };
}

export function getViewportBounds() {
  return {
    min: view_x_min,
    max: view_x_max,
    range: view_x_max - view_x_min,
    center: (view_x_min + view_x_max) / 2,
  };
}

export function getContinuousSourceActive() {
  return continuousSourceActive;
}

export function setContinuousSourceActive(value) {
  const next = Boolean(value);
  if (next === continuousSourceActive) return continuousSourceActive;
  continuousSourceActive = next;
  // Switching modes starts over: an empty box for the train (first packet on
  // the next step), or a single fresh packet.
  initWaveState();
  return continuousSourceActive;
}

export function autoZoomBarrier() {
  const range = Math.max(24, Math.min(320, Vw_ * 80));
  view_x_min = -range / 2;
  view_x_max = range / 2;
}

export function syncModeModalFields() {
  const modeEl = document.getElementById('i-mode');
  if (modeEl) modeEl.value = timeDependent ? 'td' : 'ti';
  const widthEl = document.getElementById('i-Vw');
  if (widthEl) widthEl.value = getBarrierWidthNm().toFixed(2);
  const energyEl = document.getElementById('i-Eev');
  if (energyEl) energyEl.value = getParticleEnergyEv().toFixed(4);
  const speedEl = document.getElementById('i-spd');
  if (speedEl) speedEl.value = String(stepsPerFrame);
  const speedMainEl = document.getElementById('i-spd-main');
  if (speedMainEl) speedMainEl.value = String(stepsPerFrame);
  const continuousEl = document.getElementById('i-continuous-source');
  if (continuousEl) continuousEl.checked = continuousSourceActive;
}

export function zoomIn() {
  const range = view_x_max - view_x_min;
  const shrink = range * 0.125;
  if (range - shrink * 2 > 20) {
    view_x_min += shrink;
    view_x_max -= shrink;
  }
}

export function zoomOut() {
  const range = view_x_max - view_x_min;
  const grow = range * 0.166;
  view_x_min = Math.max(x_min, view_x_min - grow);
  view_x_max = Math.min(x_max, view_x_max + grow);
}

export function recenter() {
  view_x_min = x_min;
  view_x_max = x_max;
}

// Initialization entry point for UI to call after setting up event listeners
export function initSimulation() {
  // Main initialization order: canvas -> grid -> potential -> CN -> wave.
  initCanvas();
  buildGrid();
  buildV();
  buildCN();
  step = 0; // before initWaveState: the train's first emission is scheduled at `step`
  initWaveState();
  running = true;
  resize();
}

export function changeSpeed(delta) {
  stepsPerFrame = Math.max(1, Math.min(16, stepsPerFrame + delta));
  document.getElementById('spd-live').textContent = stepsPerFrame;
  document.getElementById('i-spd').value = stepsPerFrame;
  document.getElementById('v-spd').textContent = stepsPerFrame;
}

export function applyWidth() {
  // Apply all modal controls that impact the PDE state.
  pot_type = document.getElementById('i-pot').value;
  setBarrierWidthNm(document.getElementById('i-Vw').value);
  setParticleEnergyEv(document.getElementById('i-Eev').value);
  const sigmaNm = parseFloat(document.getElementById('i-sig').value);
  if (Number.isFinite(sigmaNm))
    sigma = Math.max(0.5, Math.min(3.0, sigmaNm)) / NM_PER_UNIT;
  setSimulationSpeed(document.getElementById('i-spd').value);
  buildV();
  buildCN();
  step = 0; // before initWaveState: the train's first emission is scheduled at `step`
  initWaveState();
}

export function applyMode() {
  // Time-independent mode freezes stepping; draw still runs for inspection.
  timeDependent = document.getElementById('i-mode').value === 'td';
  document.getElementById('modeBadge').textContent = timeDependent
    ? 'T-DEPENDENT'
    : 'T-INDEPENDENT';
  
  // Read continuous source toggle
  const continuousSourceCheckbox = document.getElementById('i-continuous-source');
  if (continuousSourceCheckbox) {
    setContinuousSourceActive(continuousSourceCheckbox.checked && timeDependent);
  }
}

export function resetSim() {
  // Restart from the current configuration while clearing runtime state.
  recenter();

  buildV();
  buildCN();
  step = 0; // before initWaveState: the train's first emission is scheduled at `step`
  initWaveState();

  const v0Live = document.getElementById('v0-live');
  if (v0Live) v0Live.textContent = V0_.toFixed(2);
  const spdLive = document.getElementById('spd-live');
  if (spdLive) spdLive.textContent = String(stepsPerFrame);

  const potEl = document.getElementById('i-pot');
  if (potEl) potEl.value = pot_type;
  const widthEl = document.getElementById('i-Vw');
  if (widthEl) widthEl.value = getBarrierWidthNm().toFixed(2);
  const energyEl = document.getElementById('i-Eev');
  if (energyEl) energyEl.value = getParticleEnergyEv().toFixed(4);
  const sigEl = document.getElementById('i-sig');
  if (sigEl) sigEl.value = (sigma * NM_PER_UNIT).toFixed(2);
  const spdEl = document.getElementById('i-spd');
  if (spdEl) spdEl.value = stepsPerFrame;
  const spdMainEl = document.getElementById('i-spd-main');
  if (spdMainEl) spdMainEl.value = stepsPerFrame;
  const spdMainLive = document.getElementById('spd-live-main');
  if (spdMainLive) spdMainLive.textContent = String(stepsPerFrame);
  const modeBadge = document.getElementById('modeBadge');
  if (modeBadge) modeBadge.textContent = timeDependent
    ? 'T-DEPENDENT'
    : 'T-INDEPENDENT';
  const continuousEl = document.getElementById('i-continuous-source');
  if (continuousEl) continuousEl.checked = continuousSourceActive;
}
