// js/numerical-mode.js
// Standalone numerical calculator for quantum tunneling through a rectangular barrier.

const CONSTANTS = {
  HBAR: 1.054571817e-34, // J·s
  H: 6.62607015e-34, // J·s
  QE: 1.602176634e-19, // C (eV → J)
  MASS: {
    electron: 9.1093837e-31,
    proton: 1.67262192369e-27,
    neutron: 1.67492749804e-27,
    alpha: 6.644657e-27, // ~ mass of He-4 nucleus (2p + 2n)
  },
};

const PRESETS = {
  'alpha-decay': {
    label: 'Alpha decay (nuclear)',
    description:
      'Alpha particle of 3.5 MeV tunneling through a nuclear barrier of 18 MeV and width 2.5 fm.',
    particleType: 'alpha',
    energy: 3.5,
    energyUnit: 'MeV',
    barrierHeight: 18,
    barrierHeightUnit: 'MeV',
    barrierWidth: 2.5,
    barrierWidthUnit: 'fm',
  },
  stm: {
    label: 'STM-like tunneling',
    description:
      'Electron tunneling across a nanometre-scale vacuum gap, representative of an STM tip.',
    particleType: 'electron',
    energy: 1.0,
    energyUnit: 'eV',
    barrierHeight: 4.0,
    barrierHeightUnit: 'eV',
    barrierWidth: 0.8,
    barrierWidthUnit: 'nm',
  },
};

const EXPLAIN_ENDPOINT = '/api/explain';

let lastExplainPayload = null;
let explainRequestToken = 0;

function loadComponents() {
  const headerEl = document.getElementById('header-container');
  const footerEl = document.getElementById('footer-container');
  if (!headerEl || !footerEl) return;

  fetch('components/header.html')
    .then((res) => (res.ok ? res.text() : ''))
    .then((html) => {
      if (html) headerEl.innerHTML = html;
    })
    .catch((err) => console.error('Failed to load header', err));

  fetch('components/footer.html')
    .then((res) => (res.ok ? res.text() : ''))
    .then((html) => {
      if (html) footerEl.innerHTML = html;
    })
    .catch((err) => console.error('Failed to load footer', err));
}

function energyToJoules(value, unit) {
  const x = Number(value);
  if (!Number.isFinite(x)) return NaN;
  switch (unit) {
    case 'eV':
      return x * CONSTANTS.QE;
    case 'keV':
      return x * 1e3 * CONSTANTS.QE;
    case 'MeV':
      return x * 1e6 * CONSTANTS.QE;
    case 'J':
      return x;
    default:
      return NaN;
  }
}

function lengthToMeters(value, unit) {
  const x = Number(value);
  if (!Number.isFinite(x)) return NaN;
  switch (unit) {
    case 'fm':
      return x * 1e-15;
    case 'pm':
      return x * 1e-12;
    case 'nm':
      return x * 1e-9;
    case 'Angstrom':
      return x * 1e-10;
    case 'm':
      return x;
    default:
      return NaN;
  }
}

function formatSci(value, { precision = 3 } = {}) {
  if (!Number.isFinite(value)) return '–';
  if (value === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(value)));
  const mant = value / Math.pow(10, exp);
  const mantStr = mant.toFixed(precision).replace(/\.0+$/, '');
  return `${mantStr} × 10^${exp}`;
}

function formatFixed(value, digits = 4) {
  if (!Number.isFinite(value)) return '–';
  return value.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
}

function getFormSnapshot() {
  return {
    particleType: document.getElementById('particle-type')?.value || '',
    energyValue: document.getElementById('energy-value')?.value || '',
    energyUnit: document.getElementById('energy-unit')?.value || '',
    barrierHeightValue: document.getElementById('barrier-height-value')?.value || '',
    barrierHeightUnit: document.getElementById('barrier-height-unit')?.value || '',
    barrierWidthValue: document.getElementById('barrier-width-value')?.value || '',
    barrierWidthUnit: document.getElementById('barrier-width-unit')?.value || '',
  };
}

function setExplainButtonState({ disabled = true, loading = false } = {}) {
  const button = document.getElementById('btn-explain');
  if (!button) return;

  button.disabled = disabled;
  button.textContent = loading ? 'Thinking…' : 'Explain with AI';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderExplanationState(state) {
  const panel = document.getElementById('ai-explanation');
  if (!panel) return;

  panel.classList.remove('is-empty', 'is-loading', 'is-error');

  if (state.type === 'loading') {
    panel.classList.add('is-loading');
    panel.innerHTML = `<div class="ai-explanation-status">${escapeHtml(state.message)}</div>`;
    return;
  }

  if (state.type === 'error') {
    panel.classList.add('is-error');
    panel.innerHTML = `<div class="ai-explanation-status">${escapeHtml(state.message)}</div>`;
    return;
  }

  if (state.type === 'ready') {
    panel.classList.add('is-empty');
    panel.innerHTML = `<div class="ai-explanation-status">${escapeHtml(state.message)}</div>`;
    return;
  }

  const sections = [
    ['Summary', state.summary],
    ['Regime', state.regime],
    ['Interpretation', state.interpretation],
    ['Practical note', state.practicalNote],
  ].filter(([, value]) => value);

  panel.innerHTML = sections
    .map(
      ([label, copy]) =>
        `<div class="ai-explanation-section"><div class="ai-explanation-label">${escapeHtml(label)}</div><div class="ai-explanation-copy">${escapeHtml(copy)}</div></div>`
    )
    .join('');
}

function buildExplainPayload(snapshot, result) {
  const energyLabel = `${snapshot.energyValue} ${snapshot.energyUnit}`.trim();
  const barrierHeightLabel = `${snapshot.barrierHeightValue} ${snapshot.barrierHeightUnit}`.trim();
  const barrierWidthLabel = `${snapshot.barrierWidthValue} ${snapshot.barrierWidthUnit}`.trim();

  return {
    particleType: snapshot.particleType,
    energyLabel,
    barrierHeightLabel,
    barrierWidthLabel,
    T: Number(formatFixed(result.T, 6)),
    R: Number(formatFixed(result.R, 6)),
    ratio: Number(formatFixed(result.ratio, 6)),
    gamma: Number(formatFixed(result.gamma, 6)),
    delta: result.delta,
    lambda: result.lambda,
    betaL: result.betaL,
    regime: result.usedApprox ? 'Approximate high/wide barrier regime' : 'Exact finite-barrier regime',
    messages: result.messages,
  };
}

async function requestExplanation() {
  if (!lastExplainPayload) {
    renderExplanationState({
      type: 'error',
      message: 'Calculate a valid tunneling case before requesting AI analysis.',
    });
    setExplainButtonState({ disabled: true, loading: false });
    return;
  }

  explainRequestToken += 1;
  const requestToken = explainRequestToken;

  renderExplanationState({ type: 'loading', message: 'Gemini is interpreting the tunneling result…' });
  setExplainButtonState({ disabled: true, loading: true });

  try {
    const response = await fetch(EXPLAIN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(lastExplainPayload),
    });

    const data = await response.json().catch(() => ({}));
    if (requestToken !== explainRequestToken) return;

    if (!response.ok) {
      throw new Error(data.error || 'Unable to fetch AI analysis.');
    }

    const explanation = data.explanation || {};
    renderExplanationState({
      type: 'success',
      summary: explanation.summary || '',
      regime: explanation.regime || '',
      interpretation: explanation.interpretation || '',
      practicalNote: explanation.practicalNote || '',
    });
  } catch (error) {
    if (requestToken !== explainRequestToken) return;
    renderExplanationState({
      type: 'error',
      message: error instanceof Error ? error.message : 'Unable to fetch AI analysis.',
    });
  } finally {
    if (requestToken === explainRequestToken) {
      setExplainButtonState({ disabled: !lastExplainPayload, loading: false });
    }
  }
}

function computeResults({
  particleType,
  energyValue,
  energyUnit,
  barrierHeightValue,
  barrierHeightUnit,
  barrierWidthValue,
  barrierWidthUnit,
}) {
  const messages = [];

  if (!particleType || !(particleType in CONSTANTS.MASS)) {
    messages.push('Please choose a valid particle type.');
    return { ok: false, messages };
  }

  const E_input = Number(energyValue);
  const U0_input = Number(barrierHeightValue);
  const L_input = Number(barrierWidthValue);

  if (!Number.isFinite(E_input) || E_input <= 0) {
    messages.push('Enter a positive particle energy E.');
  }
  if (!Number.isFinite(U0_input) || U0_input <= 0) {
    messages.push('Enter a positive barrier height U₀.');
  }
  if (!Number.isFinite(L_input) || L_input <= 0) {
    messages.push('Enter a positive barrier width L.');
  }

  const E_J = energyToJoules(E_input, energyUnit);
  const U0_J = energyToJoules(U0_input, barrierHeightUnit);
  const L_m = lengthToMeters(L_input, barrierWidthUnit);

  if (!Number.isFinite(E_J) || !Number.isFinite(U0_J)) {
    messages.push('Energy units not recognised.');
  }
  if (!Number.isFinite(L_m)) {
    messages.push('Length units not recognised.');
  }

  if (messages.length) {
    return { ok: false, messages };
  }

  const mass = CONSTANTS.MASS[particleType];
  const ratio = E_J / U0_J;

  if (ratio <= 0) {
    messages.push('Energy must be less than barrier height for tunneling (E &lt; U₀).');
    return { ok: false, messages };
  }

  if (ratio >= 1) {
    messages.push(
      'This calculator is configured for tunneling (E &lt; U₀). For E ≥ U₀, use over-barrier scattering formulas instead.'
    );
    return {
      ok: true,
      messages,
      T: NaN,
      R: NaN,
      ratio,
      beta: NaN,
      betaL: NaN,
      gamma: NaN,
      delta: NaN,
      lambda: NaN,
      usedApprox: false,
    };
  }

  // β
  const betaSquared = (2 * mass * (U0_J - E_J)) / (CONSTANTS.HBAR * CONSTANTS.HBAR);
  const beta = Math.sqrt(Math.max(betaSquared, 0));

  // γ from ratio E/U0
  const r = ratio;
  const denom1 = r;
  const denom2 = 1 - r;
  const gammaOver2Sq = 0.25 * ((1 - r) / denom1 + r / denom2 - 2);
  const gamma = 2 * Math.sqrt(Math.max(gammaOver2Sq, 0));

  const betaL = beta * L_m;
  let T_exact;
  if (betaL === 0) {
    T_exact = 1;
  } else {
    const c = Math.cosh(betaL);
    const s = Math.sinh(betaL);
    const gammaOver2 = gamma / 2;
    const denom = c * c + gammaOver2 * gammaOver2 * s * s;
    T_exact = denom === 0 ? 0 : 1 / denom;
  }

  let T = T_exact;
  let usedApprox = false;

  if (betaL >= 3) {
    const T_approx = 16 * r * (1 - r) * Math.exp(-2 * betaL);
    T = T_approx;
    usedApprox = true;
    messages.push(
      `High/wide barrier regime detected (βL ≈ ${betaL.toFixed(2)}). Using approximate transmission formula.`
    );
  } else {
    messages.push(
      `Exact transmission formula used (βL ≈ ${betaL.toFixed(2)}; approximation typically valid for βL ≳ 3).`
    );
  }

  const R = 1 - T;

  // Penetration depth δ = 1/β
  const delta = beta > 0 ? 1 / beta : NaN;

  // de Broglie wavelength λ = h / sqrt(2mE)
  const lambda = CONSTANTS.H / Math.sqrt(2 * mass * E_J);

  return {
    ok: true,
    messages,
    T,
    R,
    ratio,
    beta,
    betaL,
    gamma,
    delta,
    lambda,
    usedApprox,
  };
}

function renderResults(result) {
  const msgEl = document.getElementById('message-area');
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  if (!result.ok) {
    if (msgEl) {
      msgEl.classList.add('error');
      msgEl.classList.remove('info');
      msgEl.innerHTML = result.messages.map((m) => `<div>${m}</div>`).join('');
    }
    setText('result-T', '–');
    setText('result-R', '–');
    setText('result-EU0', '–');
    setText('result-transmission-coefficient', '–');
    setText('result-gamma', '–');
    setText('result-delta', '–');
    setText('result-lambda', '–');
    return;
  }

  if (msgEl) {
    msgEl.classList.remove('error');
    msgEl.classList.add('info');
    msgEl.innerHTML = result.messages.map((m) => `<div>${m}</div>`).join('');
  }

  const { T, R, ratio, gamma, delta, lambda } = result;

  setText('result-T', Number.isFinite(T) ? formatSci(T, { precision: 3 }) : '–');
  setText('result-R', Number.isFinite(R) ? formatSci(R, { precision: 3 }) : '–');
  setText(
    'result-EU0',
    Number.isFinite(ratio) ? ratio.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : '–'
  );
  setText(
    'result-transmission-coefficient',
    Number.isFinite(T) ? formatSci(T, { precision: 3 }) : '–'
  );
  setText('result-gamma', Number.isFinite(gamma) ? gamma.toFixed(4) : '–');
  setText('result-delta', Number.isFinite(delta) ? formatSci(delta, { precision: 3 }) : '–');
  setText('result-lambda', Number.isFinite(lambda) ? formatSci(lambda, { precision: 3 }) : '–');
}

function applyPreset(key) {
  const preset = PRESETS[key];
  if (!preset) return;

  const particleSelect = document.getElementById('particle-type');
  const energyInput = document.getElementById('energy-value');
  const energyUnitSelect = document.getElementById('energy-unit');
  const bhInput = document.getElementById('barrier-height-value');
  const bhUnitSelect = document.getElementById('barrier-height-unit');
  const bwInput = document.getElementById('barrier-width-value');
  const bwUnitSelect = document.getElementById('barrier-width-unit');
  const descEl = document.getElementById('preset-description');

  if (particleSelect) particleSelect.value = preset.particleType;
  if (energyInput) energyInput.value = String(preset.energy);
  if (energyUnitSelect) energyUnitSelect.value = preset.energyUnit;
  if (bhInput) bhInput.value = String(preset.barrierHeight);
  if (bhUnitSelect) bhUnitSelect.value = preset.barrierHeightUnit;
  if (bwInput) bwInput.value = String(preset.barrierWidth);
  if (bwUnitSelect) bwUnitSelect.value = preset.barrierWidthUnit;
  if (descEl) descEl.textContent = preset.description;
}

function resetForm() {
  const formElements = [
    'energy-value',
    'barrier-height-value',
    'barrier-width-value',
  ];
  formElements.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const msgEl = document.getElementById('message-area');
  if (msgEl) {
    msgEl.classList.remove('error', 'info');
    msgEl.textContent = '';
  }

  lastExplainPayload = null;
  explainRequestToken += 1;
  setExplainButtonState({ disabled: true, loading: false });
  renderExplanationState({
    type: 'ready',
    message: 'Calculate first, then use Explain with AI.',
  });

  [
    'result-T',
    'result-R',
    'result-EU0',
    'result-transmission-coefficient',
    'result-gamma',
    'result-delta',
    'result-lambda',
  ].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = '–';
    }
  );

  const descEl = document.getElementById('preset-description');
  if (descEl) descEl.textContent = '';
}

function initDefaults() {
  const particleSelect = document.getElementById('particle-type');
  if (particleSelect) particleSelect.value = 'alpha';

  applyPreset('alpha-decay');
}

function initEvents() {
  const calcBtn = document.getElementById('btn-calc');
  const explainBtn = document.getElementById('btn-explain');
  const resetBtn = document.getElementById('btn-reset');

  if (calcBtn) {
    calcBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const snapshot = getFormSnapshot();
      const result = computeResults(snapshot);

      renderResults(result);

      if (result.ok && Number.isFinite(result.T) && Number.isFinite(result.R)) {
        lastExplainPayload = buildExplainPayload(snapshot, result);
        setExplainButtonState({ disabled: false, loading: false });
        renderExplanationState({
          type: 'ready',
          message: 'Deterministic results are ready. Use Explain with AI for a Gemini interpretation.',
        });
      } else {
        lastExplainPayload = null;
        setExplainButtonState({ disabled: true, loading: false });
        renderExplanationState({
          type: 'ready',
          message: 'AI analysis is available only for valid tunneling results with E < U₀.',
        });
      }
    });
  }

  if (explainBtn) {
    explainBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await requestExplanation();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', (e) => {
      e.preventDefault();
      resetForm();
      initDefaults();
    });
  }

  document.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const key = btn.getAttribute('data-preset');
      if (key) applyPreset(key);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadComponents();
  resetForm();
  initDefaults();
  initEvents();
});
