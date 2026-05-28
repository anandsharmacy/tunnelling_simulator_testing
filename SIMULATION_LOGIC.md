# Simulation Logic (Quantum Tunneling Effect Simulator)

This document explains the **runtime logic** behind the simulator as implemented in:

- `js/utils/simulation.js` (physics + rendering)
- `js/utils/ui.js` (UI wiring and user controls)
- `quantum_tunneling-2.html` / `index.html` (layout + canvas + controls)

It is written to match the current code behavior (not a “textbook idealization”).

## High-level flow

- **Startup** (`js/utils/ui.js`)
  - Loads header/footer HTML _when available_.
  - Calls `initSimulation()` to build the numerical model and canvas.
  - Starts the animation loop via `loop()` (runs every `requestAnimationFrame`).
- **Per animation frame** (`loop()` in `js/utils/simulation.js`)
  - If the simulator is _running_ and in _time-dependent mode_:
    - Advances the quantum state by `stepsPerFrame` discrete solver steps.
  - Calls `draw()` to render the current state on the canvas.

This separation is important:

- **Physics timing** depends on `dt` and the number of solver steps executed.
- **Visual refresh** depends on browser frame rate (typically 60 fps).

## Physics model

### Equation being simulated

The solver numerically evolves the 1D **time-dependent Schrödinger equation** (TDSE):

\[
i\hbar \frac{\partial \psi}{\partial t} =
\left(-\frac{\hbar^2}{2m}\frac{\partial^2}{\partial x^2} + V(x)\right)\psi
\]

In code:

- Constants: `hbar = 1`, `m_ = 1`
- Spatial domain: `x ∈ [x_min, x_max]` where `x_min = -160`, `x_max = 160`
- Grid points: `Nx = 700` (uniform grid)
- Time step: `dt = 0.05`

### Spatial discretization

- The grid spacing is:
  - `dx = (x_max - x_min) / (Nx - 1)`
- The spatial array:
  - `x_` is filled with `x_[i] = x_min + i*dx`
- The wavefunction is stored as two real arrays:
  - `psiR[i] = Re(ψ(x_i))`
  - `psiI[i] = Im(ψ(x_i))`

### Potential barrier \(V(x)\)

`buildV()` fills `V_` based on `pot_type`:

- **`single`**: rectangular barrier of width `Vw_` centered at 0, height `V0_`
- **`double`**: two rectangular barriers separated by a fixed gap (a “double-slit-like” profile)
- **`step`**: a potential step at `x = 0`
- **`delta`**: a narrow spike around `x = 0` (implemented as a thin rectangle)
- **`none`**: free particle (`V_` left as zeros)

When the user changes height/width/type, the code rebuilds `V_` and recomputes solver coefficients.

### Initial wavepacket

`initPsi()` constructs a normalized Gaussian wavepacket:

- Center: `x0_` is initialized a safe distance inside the domain for one-shot packets
- Spread: `sigma`
- Wavenumber: `k0` (sets momentum and energy)

Implemented as:

- Gaussian envelope \(\exp(-(x-x_0)^2/(4\sigma^2))\)
- Plane-wave carrier \(\cos(k_0x)\) and \(\sin(k_0x)\)
- Then explicitly normalized so that:
  - \(\int |\psi|^2 dx \approx 1\)

### Time integration (Crank–Nicolson)

The simulator uses the **Crank–Nicolson** (CN) method, which is stable and (for the exact math) unitary.

The CN update is written in matrix form:

- \(A\psi^{n+1} = B\psi^n\)
- Where \(A = I + i\alpha H\) and \(B = I - i\alpha H\)
- \(\alpha = \frac{\Delta t}{2\hbar}\)

In code (`buildCN()`):

- The kinetic second-derivative operator becomes a tridiagonal stencil.
- The Hamiltonian diagonal is `(-2*coef + V_[i])` where:
  - `coef = (-hbar*hbar)/(2*m_*dx*dx)`
- Arrays representing the tridiagonal system are precomputed:
  - Diagonal (real/imag): `A_dR`, `A_dI`, `B_dR`, `B_dI`
  - Off-diagonal (imag only in this split form): `A_oI`, `B_oI`

### One solver step

Each discrete time step (`stepSim()`):

- Computes `rhs = B * ψ^n` via `applyB(...)`
- Solves `A * ψ^{n+1} = rhs` using a fast **Thomas algorithm** (`thomas()`)
- Applies boundary conditions by setting endpoints to zero in `applyB()`
- Every 40 steps, performs a small renormalization to control numerical drift

The variable `step` is incremented each solver step, and displayed time is:

- `t = step * dt`

### “Speed” control

The UI “speed” does **not change** `dt`. Instead it changes:

- `stepsPerFrame`

So the simulation advances more (or fewer) solver steps per rendered frame while preserving the underlying discretization.

### Time-dependent vs time-independent mode

- `timeDependent = true`: the solver advances each frame.
- `timeDependent = false`: the solver is paused (state is still drawn).

This is toggled by `applyMode()` reading `#i-mode`.

## Rendering pipeline (Canvas)

### Coordinate system

The plot is a “matplotlib-style” chart drawn into a padded plot region:

- Canvas size: `W × H`
- Plot area:
  - Left padding: 58 px
  - Top padding: 18 px
  - Right padding: 20 px
  - Bottom padding: 38 px
- Plot width/height:
  - `PW = W - 58 - 20`
  - `PH = H - 18 - 38`

Mapping functions used by `draw()`:

- `toX(x)`: maps physical \(x\) into plot pixel x
- `toY(y)`: maps physical amplitude/potential into plot pixel y

### Viewport (zoom/recenter)

Zoom is implemented by changing the visible x-range:

- Full range: `view_x_min = x_min`, `view_x_max = x_max`
- Zoom in/out adjust `view_x_min/view_x_max` while clamping to the full domain.

No resampling occurs; the same underlying grid arrays are mapped to screen coordinates.

### What is drawn each frame

In order:

- Background and plot background
- Gridlines + axis ticks/labels
- Potential \(V(x)\) (filled region + outline)
- Scattering curves:
  - incident wave in red
  - reflected wave in blue
  - transmitted wave in teal
  - optional probability density `|ψ|^2` overlay
- Zero baseline
- Legend
- Footer statistics (if the footer elements exist)

### High-DPI / Retina sharpness

Browsers often make a canvas appear blurry if:

- CSS sets a large `width/height`, but
- The canvas backing store (`canvas.width` / `canvas.height`) remains small.

The simulator now avoids that by matching the internal canvas resolution to **device pixel ratio (DPR)**:

- Measure the canvas’ CSS pixel size from its parent element.
- Set:
  - `canvas.width = cssWidth * dpr`
  - `canvas.height = cssHeight * dpr`
- Then draw in CSS pixel coordinates by setting:
  - `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`

This keeps lines, axes, and text crisp on high-DPI displays while keeping the coordinate system in familiar CSS pixels.

Resizing is triggered via:

- `ResizeObserver` when available
- `window.resize` fallback otherwise

## Live statistics (T, R, norm, energy)

In `draw()`, the code computes:

- Probability density:
  - `prob[i] = psiR[i]^2 + psiI[i]^2`
- Integrals (approximate, via sums times `dx`) over:
  - Left region: `R` estimate
  - Right region: `T` estimate
  - Total: norm estimate

The displayed energy uses the free-particle relation:

- \(E = k_0^2/2\)

Important note:

- These readouts are **UI-only diagnostics** and do not affect the physics.

Also:

- When running offline without the footer HTML, these DOM nodes may not exist.
  - The code is written to **skip updates** when elements are missing, so rendering continues.

## UI wiring (what buttons/sliders do)

All UI handlers live in `js/utils/ui.js` and call exported functions from `js/utils/simulation.js`.

- **▶ Simulator**: `setRunning(true)` (starts advancing again)
- **■ Stop**: `stopSim()` (sets `running = false`)
- **Height +/-**: `changeHeight(±0.25)` → rebuilds `V_` and CN matrices
- **Speed +/- or speed slider**: `changeSpeed(...)` → changes `stepsPerFrame`
- **Zoom in/out/recenter**: updates the view range only (no physics changes)
- **Width modal “Apply”**: `applyWidth()` updates `pot_type`, `Vw_`, `k0`, `sigma`, `stepsPerFrame`, then rebuilds potential/solver and reinitializes ψ
- **Mode modal “Apply”**: `applyMode()` toggles `timeDependent`
- **RESET**: `resetSim()` restores defaults and rebuilds everything

## Common failure mode (offline blank screen)

If the footer or header components fail to load (e.g., fully offline), the footer stats elements might not exist.

If code tries to do:

- `document.getElementById('sT').textContent = ...`

and `getElementById('sT')` returns `null`, it throws and can prevent `draw()` from completing.

The current implementation guards these updates, so the simulation continues rendering even without the footer.

## Where to look in code

- **Physics setup**: `buildGrid()`, `buildV()`, `buildCN()`, `initPsi()`
- **Single time step**: `stepSim()` → `applyB()` + `thomas()`
- **Per-frame loop**: `loop()`
- **Rendering**: `draw()`
- **Canvas sizing**: `resize()` + `initCanvas()` resize observers
