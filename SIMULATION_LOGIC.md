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
- Grid points: `Nx = 1399` (uniform grid, `dx ≈ 0.229`, about 23 points per wavelength at the default `k0 = 1.2`)
- Time step: `dt = 0.05`

### Units shown in the UI

The engine works in units where ħ = m = 1. The UI treats the particle as an **electron** with energies in **eV**, which fixes the other units:

| Quantity | Engine unit | Real value | Constant |
|---|---|---|---|
| Energy | 1 | 1 eV | (none needed) |
| Length | 1 | ħ/√(mₑ·eV) = 0.27605 nm | `NM_PER_UNIT` |
| Time | 1 | ħ/eV = 0.65821 fs | `FS_PER_UNIT` |

Conversion happens only at the boundary: `setBarrierWidthNm`/`getBarrierWidthNm`, the σ input in `applyWidth`, the nm x-axis, and the fs time readout. Defaults: V₀ = 1.00 eV, E = 0.72 eV (`k0 = 1.2`), barrier width 0.8 nm, σ = 1.38 nm (5 engine units), packet starting at x = −120 (−33.1 nm). Inputs are limited to width 0.1–20 nm, σ 0.5–3 nm and energy 0.001–10 eV. Above about 10 eV, k·dx > 1 and the grid can no longer resolve the wave.

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

Barrier edges are **cell-averaged** (`cellOverlap`): each grid point gets V₀ times the fraction of its cell `[x − dx/2, x + dx/2]` that lies inside the barrier. The discrete barrier therefore has exactly the requested width (`getPotentialArea() = V₀·width`), and thin barriers no longer snap to whole cells.

When the user changes height/width/type, the code rebuilds `V_` and recomputes solver coefficients.

### Initial wavepacket

`initPsi()` clears ψ and adds one normalized Gaussian wavepacket (`addPacket(x0_)`):

- Center: `x0_ = getDefaultPacketCenter()`, which is −120 for the default σ (at least 40 units, and at least 6σ, from the left wall)
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

- In continuous-source mode, adds the next train packet if one is due (see below)
- Computes `rhs = B * ψ^n` via `applyB(...)`
- Solves `A * ψ^{n+1} = rhs` using a fast **Thomas algorithm** (`thomas()`)
- Applies the edge absorber (`applyOutgoingAbsorption()`)

There is **no renormalisation**. Crank–Nicolson is unitary, and the absorber only removes probability, so the norm can only stay the same or fall.

The variable `step` is incremented each solver step, and displayed time is:

- `t = step * dt * FS_PER_UNIT` (in fs)

### Absorbing edges

The outermost 24 units at each end are damping bands. `buildGrid()` precomputes `absorberMask[i] = exp(−γ·dt·s²)`, where `s` runs from 0 at the inner edge of the band to 1 at the wall, and γ = 1.5 (`ABSORBER_GAMMA`). The wall points themselves are 0 (Dirichlet). Each step multiplies ψ by the mask and books the removed |ψ|²·dx to `absorbedLeftProb` or `absorbedRightProb`. A free packet run through the right band loses more than 99.8% there and sends back less than 10⁻⁴.

The band damps ψ itself, not separately split right- and left-moving parts. An earlier version split ψ with an FFT and damped one part. The two parts have long cancelling tails, so damping one created probability (norm reached 1.0016) and "absorbed" probability at the edges before any wave got there.

### Continuous source (packet train)

With "Enable continuous source" ticked, `stepSim()` adds a fresh copy of the default packet at `x0_` (−120) every `getEmitIntervalSteps()` steps:

- `getEmitIntervalSteps() = ceil(12σ / (max(k0, 0.05)·dt))`. That is 1000 steps (≈ 33 fs) at the defaults, so packets are about 16.6 nm apart.
- Each packet has norm 1, so the probability in the box (shown as Norm) counts the packets currently in flight.
- Turning the mode on or off, RESET, or changing energy, width or height restarts it with an empty box (`emittedPackets = 0`). The first packet goes out on the next step.

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
- Gridlines + axis ticks/labels (x in nm: 10 nm ticks, or 5/2/1 nm when zoomed in far enough that 10 nm would give fewer than 4)
- Potential \(V(x)\) (filled region + outline) on its **own scale**: its peak sits at 80% of the wave axis and is labelled `V₀ = … eV`. The y-axis is set by the wave amplitudes only, so a tall barrier no longer squashes the wave
- Scattering curves (the right-moving curve is drawn red left of the barrier and teal from the barrier's first point onward, so the two join):
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

`draw()` shows the norm ∫|ψ|²dx and the result of `getScatteringTR()`. That function measures everything relative to the barrier (`getBarrierSpan()`), never from fixed windows:

- `t` = |ψ|² past the barrier's right edge, plus `absorbedRightProb`. For a step potential (the barrier reaches the right wall), it is everything from the step onward.
- `r` = |ψ₋|² left of the barrier, plus `absorbedLeftProb`. ψ₋ is the left-moving part of ψ, from an FFT split. The incoming packet is right-moving, so it never counts as reflected.
- **Single packet:** T = t and R = r, i.e. "so far". Both read 0 until the packet reaches the barrier, then grow to their final values. At the defaults the final values are T ≈ 0.052 and R ≈ 0.948, against an exact value of 0.0536 averaged over the packet's momentum spread.
- **Packet train:** the steady-state split T = t/(t+r) and R = r/(t+r). It shows "—" until at least half a packet has resolved.
- No barrier (`pot_type = 'none'`): T and R are undefined and show "—".
- Low energy: when k₀σ is small, a Gaussian really contains k < 0 parts that move away from the barrier from t = 0. `addPacket()` measures that share once (`emittedLeftShare`) and `getScatteringTR()` takes it out of r and out of the total. T and R are therefore fractions of the probability that actually headed for the barrier. At the defaults the share is about 0.

The auto-zoom applied on parameter changes never narrows the view below 2·(|x₀| + 3σ), so the start point of the packet, and of every train packet, stays visible.

Numerical Mode, for the same electron (0.72 eV, 1 eV, 0.8 nm), gives the plane-wave value T = 0.0415 at exactly E = 0.72 eV. The simulator's packet value is higher because the packet carries a spread of energies, and its higher-energy part tunnels more easily.

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
- **Mode modal “Apply”**: `applyMode()` toggles `timeDependent` and the continuous source (packet train). The source is only available in time-dependent mode, and changing it restarts the run
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
