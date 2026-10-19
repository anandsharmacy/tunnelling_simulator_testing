// utils/ui.js
// UI event handling and wiring for the Quantum Tunneling Simulator.
// This module imports core simulation functions and attaches DOM event listeners.

import {
  initSimulation,
  loop,
  stopSim,
  zoomIn,
  zoomOut,
  recenter,
  applyWidth,
  applyMode,
  resetSim,
  getBarrierWidthNm,
  getParticleEnergyEv,
  getBarrierPotential,
  setBarrierWidthNm,
  setParticleEnergyEv,
  setBarrierPotential,
  getSimulationSpeed,
  setSimulationSpeed,
  syncModeModalFields,
  k0,
  V0_,
  setRunning,
} from "./simulation.js?v=20260517";

// Helper to display the height change toast (moved from original main.js)
function showHeightToast(delta) {
  const toast = document.getElementById("height-toast");
  const titleEl = document.getElementById("toast-title");
  const titleTxt = document.getElementById("toast-title-text");
  const body = document.getElementById("toast-body");
  const E = ((k0 * k0) / 2).toFixed(2);
  if (delta > 0) {
    titleEl.className = "toast-title inc";
    titleTxt.textContent = "Effect of increasing barrier height";
    body.innerHTML = `
      <div class="toast-section">
        <div class="toast-section-title">Step-by-step effect</div>
        <ul class="toast-list">
          <li><span class="num">1.</span> V₀ − E increases (now V₀ − E = ${(V0_ - E).toFixed(2)})</li>
          <li><span class="num">2.</span> κ = √(2m(V₀−E))/ℏ increases</li>
          <li><span class="num">3.</span> Wave decays faster inside barrier</li>
          <li><span class="num">4.</span> Less wave reaches other side</li>
          <li><span class="num">5.</span> <span class="toast-bold">Tunneling probability decreases exponentially</span></li>
        </ul>
        <div class="toast-bullet"><span class="icon">👉</span>Even small increases can strongly reduce probability.</div>
      </div>
      <div class="toast-section">
        <div class="toast-section-title">Physical intuition</div>
        <div class="toast-bullet"><span class="icon">🧱</span>Higher barrier = stronger "forbidden region"</div>
        <div class="toast-bullet"><span class="icon">📉</span>Wave cannot penetrate much → less transmission.</div>
      </div>`;
  } else {
    titleEl.className = "toast-title dec";
    titleTxt.textContent = "Effect of decreasing barrier height";
    body.innerHTML = `
      <div class="toast-section">
        <div class="toast-section-title">If V₀ decreases:</div>
        <ul class="toast-list">
          <li><span class="num">1.</span> V₀ − E decreases (now V₀ − E = ${(V0_ - E).toFixed(2)})</li>
          <li><span class="num">2.</span> κ decreases</li>
          <li><span class="num">3.</span> Wave decays slowly</li>
          <li><span class="num">4.</span> More amplitude reaches other side</li>
          <li><span class="num">5.</span> <span class="toast-bold">Tunneling probability increases</span></li>
        </ul>
      </div>
      <div class="toast-cond">If V₀ → E:</div>
      <div class="toast-bullet"><span class="icon">👉</span>Decay almost disappears</div>
      <div class="toast-bullet"><span class="icon">👉</span>Tunneling becomes high</div>
      <div class="toast-cond">If V₀ < E:</div>
      <div class="toast-bullet"><span class="icon">👉</span>Not tunneling anymore → normal transmission</div>`;
  }
  toast.classList.add("show");
  if (window.toastTimer) clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toast.classList.remove("show"), 5000);
}

function updateQuickParameterDisplays() {
  const width = getBarrierWidthNm();
  const energy = getParticleEnergyEv();
  const widthValue = document.getElementById("bw-live");
  const energyValue = document.getElementById("pe-live");
  const potentialValue = document.getElementById("v0-live");
  if (widthValue) widthValue.textContent = width.toFixed(2);
  if (energyValue) energyValue.textContent = energy.toFixed(4);
  if (potentialValue)
    potentialValue.textContent = getBarrierPotential().toFixed(2);

  const widthInput = document.getElementById("i-bw-main");
  if (widthInput) widthInput.value = width.toFixed(2);
  const widthRange = document.getElementById("r-bw-main");
  if (widthRange) {
    widthRange.value = width.toFixed(2);
    paintSliderTrack(
      widthRange,
      ((width - Number(widthRange.min)) /
        (Number(widthRange.max) - Number(widthRange.min))) *
        100,
    );
  }

  const energyInput = document.getElementById("i-pe-main");
  if (energyInput) energyInput.value = energy.toFixed(4);
  const energyRange = document.getElementById("r-pe-main");
  if (energyRange) {
    energyRange.value = String(energyToSliderPosition(energy));
    paintSliderTrack(
      energyRange,
      (Number(energyRange.value) / Number(energyRange.max || 1000)) * 100,
    );
  }

  const widthModal = document.getElementById("i-Vw");
  if (widthModal) widthModal.value = width.toFixed(2);
  const energyModal = document.getElementById("i-Eev");
  if (energyModal) energyModal.value = energy.toFixed(4);
}

const ENERGY_MIN = 0.001;
const ENERGY_MAX = 10.0;
const ENERGY_SLIDER_MAX = 1000;
const DRAWER_STORAGE_KEY = "qt-info-drawer-open";

function clampValue(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function parseControlValue(value) {
  if (value === null || value === undefined) return NaN;
  const text = String(value).trim();
  if (!text) return NaN;
  return Number(text);
}

function paintSliderTrack(rangeEl, percent) {
  const track = rangeEl?.closest(".speed-range");
  if (!track) return;
  const clampedPercent = Math.max(0, Math.min(100, percent));
  track.style.background = `linear-gradient(to right, var(--quick-slider-fill) 0%, var(--quick-slider-fill) ${clampedPercent}%, var(--quick-slider-track) ${clampedPercent}%, var(--quick-slider-track) 100%)`;
}

function energyToSliderPosition(energy) {
  const clamped = clampValue(
    Number(energy),
    ENERGY_MIN,
    ENERGY_MAX,
    ENERGY_MIN,
  );
  const logMin = Math.log10(ENERGY_MIN);
  const logMax = Math.log10(ENERGY_MAX);
  const ratio = (Math.log10(clamped) - logMin) / (logMax - logMin);
  return Math.round(ratio * ENERGY_SLIDER_MAX);
}

function sliderPositionToEnergy(position) {
  const clamped = clampValue(Number(position), 0, ENERGY_SLIDER_MAX, 0);
  const ratio = clamped / ENERGY_SLIDER_MAX;
  const logMin = Math.log10(ENERGY_MIN);
  const logMax = Math.log10(ENERGY_MAX);
  return Number(Math.pow(10, logMin + ratio * (logMax - logMin)).toFixed(4));
}

function initSpeedSlider() {
  const controls = Array.from(
    document.querySelectorAll(".speed-slider-control"),
  );
  if (!controls.length) return;

  const renderControl = (control, currentSpeed) => {
    const range = control.querySelector('input[type="range"]');
    const rangeWrap = control.querySelector(".speed-range");
    const labels = Array.from(
      control.querySelectorAll(".speed-range-labels li"),
    );
    if (!range || !rangeWrap) return;

    const min = Number(range.min);
    const max = Number(range.max);
    range.value = String(currentSpeed);
    const percent = ((currentSpeed - min) / (max - min)) * 100;
    rangeWrap.style.background = `linear-gradient(to right, var(--blue) 0%, var(--blue) ${percent}%, #d3d9e2 ${percent}%, #d3d9e2 100%)`;

    labels.forEach((labelEl) => {
      const labelSpeed = Number(labelEl.dataset.speed);
      labelEl.classList.remove("active", "selected");
      if (labelSpeed <= currentSpeed) labelEl.classList.add("selected");
      if (labelSpeed === currentSpeed) labelEl.classList.add("active");
    });
  };

  const renderAll = () => {
    const currentSpeed = getSimulationSpeed();
    controls.forEach((control) => renderControl(control, currentSpeed));
  };

  controls.forEach((control) => {
    const range = control.querySelector('input[type="range"]');
    const labels = Array.from(
      control.querySelectorAll(".speed-range-labels li"),
    );
    if (!range) return;

    range.addEventListener("input", () => {
      setSimulationSpeed(Number(range.value));
      renderAll();
    });

    labels.forEach((labelEl) => {
      labelEl.addEventListener("click", () => {
        const speed = Number(labelEl.dataset.speed);
        setSimulationSpeed(speed);
        renderAll();
      });
    });
  });

  renderAll();
}

function initQuickParameterControls() {
  const widthInput = document.getElementById("i-bw-main");
  const widthRange = document.getElementById("r-bw-main");
  const energyInput = document.getElementById("i-pe-main");
  const energyRange = document.getElementById("r-pe-main");

  const applyWidthValue = (value) => {
    const nextWidth = setBarrierWidthNm(
      clampValue(parseControlValue(value), 0.1, 20, getBarrierWidthNm()),
    );
    if (widthInput) widthInput.value = nextWidth.toFixed(2);
    updateQuickParameterDisplays();
  };

  const applyEnergyValue = (value) => {
    const nextEnergy = setParticleEnergyEv(
      clampValue(
        parseControlValue(value),
        ENERGY_MIN,
        ENERGY_MAX,
        getParticleEnergyEv(),
      ),
    );
    if (energyInput) energyInput.value = nextEnergy.toFixed(4);
    updateQuickParameterDisplays();
  };

  if (widthRange) {
    widthRange.addEventListener("input", () =>
      applyWidthValue(widthRange.value),
    );
  }
  if (widthInput) {
    widthInput.addEventListener("change", () =>
      applyWidthValue(widthInput.value),
    );
    widthInput.addEventListener("blur", () =>
      applyWidthValue(widthInput.value),
    );
  }

  if (energyRange) {
    energyRange.addEventListener("input", () =>
      applyEnergyValue(sliderPositionToEnergy(energyRange.value)),
    );
  }
  if (energyInput) {
    energyInput.addEventListener("change", () =>
      applyEnergyValue(energyInput.value),
    );
    energyInput.addEventListener("blur", () =>
      applyEnergyValue(energyInput.value),
    );
  }
}

function setDrawerOpen(isOpen) {
  const drawer = document.getElementById("info-drawer");
  const toggle = document.getElementById("btn-drawer-toggle");
  if (!drawer || !toggle) return;
  drawer.classList.toggle("open", isOpen);
  toggle.setAttribute("aria-expanded", String(isOpen));
  toggle.querySelector(".drawer-toggle-icon").textContent = isOpen ? "‹" : "›";
  try {
    window.localStorage.setItem(DRAWER_STORAGE_KEY, isOpen ? "1" : "0");
  } catch {
    // Ignore storage failures; the drawer still works without persistence.
  }
}

function initDrawerToggle() {
  const drawer = document.getElementById("info-drawer");
  const toggle = document.getElementById("btn-drawer-toggle");
  if (!drawer || !toggle) return;

  let isOpen = false;
  try {
    isOpen = window.localStorage.getItem(DRAWER_STORAGE_KEY) === "1";
  } catch {
    // Ignore storage failures and keep default closed state.
  }

  setDrawerOpen(isOpen);
  toggle.addEventListener("click", () => {
    const nextState = !drawer.classList.contains("open");
    setDrawerOpen(nextState);
  });
}

// Initialize UI immediately since script is loaded with defer
(async function initUI() {
  // Load components first
  try {
    const headerRes = await fetch("components/header.html");
    if (headerRes.ok)
      document.getElementById("header-container").innerHTML =
        await headerRes.text();
    const footerRes = await fetch("components/footer.html");
    if (footerRes.ok)
      document.getElementById("footer-container").innerHTML =
        await footerRes.text();
  } catch (err) {
    console.error("Failed to load components", err);
  }

  // Initialise simulation core
  initDrawerToggle();
  initSimulation();
  initSpeedSlider();
  initQuickParameterControls();
  updateQuickParameterDisplays();
  syncModeModalFields();
  loop();

  // Navigation buttons
  document
    .getElementById("btn-info")
    .addEventListener("click", () => showPanel("info"));
  document
    .getElementById("btn-equation")
    .addEventListener("click", () => showPanel("equation"));
  document
    .getElementById("btn-working")
    .addEventListener("click", () => showPanel("working"));

  // Simulator control
  document.getElementById("btn-simulator").addEventListener("click", () => {
    setRunning(true);
    showSim();
  });
  document.getElementById("btn-stop").addEventListener("click", stopSim);

  // Height control (direct update)
  document.getElementById("btn-open-height").addEventListener("click", () => {
    const currentPotential = getBarrierPotential();
    const entry = window.prompt(
      "Enter barrier potential V₀ in eV (0.10 to 10.00):",
      currentPotential.toFixed(2),
    );
    if (entry === null) return;
    const nextPotential = setBarrierPotential(entry);
    const delta = nextPotential - currentPotential;
    if (Math.abs(delta) > 1e-9) showHeightToast(delta);
    updateQuickParameterDisplays();
  });

  // Viewport controls
  const btnZoomIn = document.getElementById("btn-zoom-in");
  if (btnZoomIn) btnZoomIn.addEventListener("click", zoomIn);
  const btnZoomOut = document.getElementById("btn-zoom-out");
  if (btnZoomOut) btnZoomOut.addEventListener("click", zoomOut);
  const btnZoomReset = document.getElementById("btn-zoom-reset");
  if (btnZoomReset) btnZoomReset.addEventListener("click", recenter);

  // Width modal
  document
    .getElementById("btn-open-width")
    .addEventListener("click", () => openM("width"));
  document
    .getElementById("btn-close-width")
    .addEventListener("click", () => closeM("width"));
  document
    .getElementById("btn-cancel-width")
    .addEventListener("click", () => closeM("width"));
  document.getElementById("btn-apply-width").addEventListener("click", () => {
    applyWidth();
    updateQuickParameterDisplays();
    closeM("width");
  });

  // Mode modal
  document.getElementById("btn-open-mode").addEventListener("click", () => {
    syncModeModalFields();
    openM("mode");
  });
  document
    .getElementById("btn-close-mode")
    .addEventListener("click", () => closeM("mode"));
  document
    .getElementById("btn-cancel-mode")
    .addEventListener("click", () => closeM("mode"));
  document.getElementById("btn-apply-mode").addEventListener("click", () => {
    applyMode();
    closeM("mode");
  });

  // Reset button
  document.getElementById("btn-reset").addEventListener("click", () => {
    resetSim();
    updateQuickParameterDisplays();
    syncModeModalFields();
  });

  // Toast close
  document.getElementById("btn-close-toast").addEventListener("click", () => {
    const toast = document.getElementById("height-toast");
    toast.classList.remove("show");
    if (window.toastTimer) {
      clearTimeout(window.toastTimer);
      window.toastTimer = null;
    }
  });
})();

export function showPanel(id) {
  document
    .querySelectorAll(".panel")
    .forEach((e) => e.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((e) => e.classList.remove("active"));
  document.getElementById("panel-" + id).classList.add("active");
  const items = document.querySelectorAll(".nav-item");
  const idx = { info: 0, equation: 1, working: 2 }[id];
  if (items[idx]) items[idx].classList.add("active");
}
export function showSim() {
  document
    .querySelectorAll(".panel")
    .forEach((e) => e.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((e) => e.classList.remove("active"));
}
export function openM(id) {
  document.getElementById("m-" + id).classList.add("open");
}
export function closeM(id) {
  document.getElementById("m-" + id).classList.remove("open");
}

function sanitizeNumberInput(
  id,
  min,
  max,
  fallback,
  decimals = null,
  integer = false,
) {
  const el = document.getElementById(id);
  if (!el) return;
  const raw = Number(el.value);
  let nextValue = Number.isFinite(raw) ? raw : fallback;
  nextValue = Math.max(min, Math.min(max, nextValue));
  if (integer) nextValue = Math.round(nextValue);
  el.value =
    decimals === null ? String(nextValue) : nextValue.toFixed(decimals);
}

document.addEventListener("DOMContentLoaded", () => {
  const numberConfig = [
    { id: "i-Vw", min: 0.1, max: 20, fallback: 0.8, decimals: 2 },
    { id: "i-Eev", min: 0.001, max: 10.0, fallback: 0.72, decimals: 4 },
    { id: "i-sig", min: 0.5, max: 3, fallback: 1.38, decimals: 2 },
  ];

  numberConfig.forEach((cfg) => {
    const el = document.getElementById(cfg.id);
    if (!el) return;
    el.addEventListener("blur", () =>
      sanitizeNumberInput(
        cfg.id,
        cfg.min,
        cfg.max,
        cfg.fallback,
        cfg.decimals ?? null,
        cfg.integer ?? false,
      ),
    );
  });
});
