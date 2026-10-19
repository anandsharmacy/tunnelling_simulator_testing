# Quantum Tunneling Effect Simulator

An interactive web-based physics simulation of the Quantum Tunneling Effect, visualizing the time-dependent Schrödinger equation (TDSE) using the Crank-Nicolson method.

![Simulator Interface](https://img.shields.io/badge/Status-Active-brightgreen)
![Tech Stack](https://img.shields.io/badge/Tech-HTML5%20%7C%20CSS3%20%7C%20Vanilla%20JS-blue)

## Features

- **Real-Time Scattering Visualization:** Animates incident, reflected, and transmitted wave components with tunneling decay inside the barrier, along with the potential barrier ($V(x)$).
- **Dynamic Physics Engine:**
  - Implements the unconditionally stable **Crank-Nicolson implicitly numerical method**.
  - Accurate numerical integration ensuring unitary evolution ($||\psi||^2 = 1$). There is no renormalisation; probability only leaves through the absorbing edges.
  - Built-in Thomas algorithm for fast $O(N)$ tridiagonal matrix solving.
  - 1399-point grid with cell-averaged barrier edges. The default transmission is within 3% of the exact value.
- **Real electron units:** energies in eV, lengths in nm and time in fs (internally ħ = m = 1; 1 length unit = 0.27605 nm, 1 time unit = 0.65821 fs).
- **Interactive Controls:**
  - **Barrier Configuration:** Adjust the **Height**, **Width** (0.1–20 nm; default 0.8 nm) and **Type** (single rectangular barrier, double slit, potential step, delta-like barrier, free particle).
  - **Wavepacket Parameters:** Tune the energy (0.001–10 eV) and spatial spread σ (0.5–3 nm).
  - **Continuous source:** emits a train of identical packets from x = −33 nm (about every 33 fs) and reports the steady-state T/R.
  - **Playback & Speed:** Modulate simulation speed during execution and freeze playback on demand.
  - **Viewport Controls:** Zoom In, Zoom Out, and Recenter functionality for detailed physics analysis.
- **Real-Time Physics Readouts:** Live monitoring of Transmission ($T$), Reflection ($R$), Energy ($E$), and Wavepacket Norm ($||\psi||^2$). T and R are measured relative to the barrier, so the incoming packet never counts as reflected. They show "—" when undefined. See `SIMULATION_LOGIC.md` for the exact definitions.

## Project Structure

- `index.html`: The main user interface with mathematical info side-panels and viewport controls.
- `css/styles.css`: Core styling for layout, controls, modals, and simulator visuals.
- `css/components.css`: Shared component-level utility styles.
- `js/utils/simulation.js`: Core physics engine (TDSE integration, rendering, scattering components, and stats).
- `js/utils/ui.js`: UI/event wiring and modal/control bindings.
- `js/mode-toggle.js`: Header toggle logic for Simulator/Numerical page navigation.
- `quantum_tunneling-2.html`: Legacy entry kept as a redirect to `index.html` for backward compatibility.

## Usage & Installation

Since the simulator is built with vanilla web technologies, you can run the core UI locally in your browser without any build steps.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/anandsharmacy/Quantum-Tunneling-Effect-Simulator.git
   ```
2. **Navigate to the directory:**
   ```bash
   cd Quantum-Tunneling-Effect-Simulator
   ```
3. **Start a local HTTP server:** (e.g., using Python 3)
   ```bash
   python3 -m http.server 8000
   ```
4. **Open your web browser:**
   Navigate to `http://localhost:8000`.

## Gemini Numerical Analysis

Numerical Mode now supports an optional Gemini-backed explanation flow for interpreting the deterministic tunneling results.

- The numerical answers are still computed locally in the browser from the implemented formulas.
- Gemini is used only to explain the physical meaning of those results.
- Your Gemini API key must stay server-side and must not be embedded in frontend JavaScript.

### Environment Variables

Set these environment variables in your deployment platform:

- `GEMINI_API_KEY`: your Google Gemini API key.
- `GEMINI_MODEL`: optional, defaults to `gemini-2.0-flash`.

An example file is provided in `.env.example`.

### Local Development Note

The existing Python static server is enough to preview the UI, but it will not execute `/api/*` serverless routes. That means the new `Explain with AI` button on Numerical Mode needs a serverless-compatible dev/deploy environment to work, such as Vercel deployment or a matching local serverless workflow.

## Mathematical Foundation

- **Time-Dependent Schrödinger Equation (TDSE)**
- **WKB Approximation** for intuitive estimates of tunneling probability through rectangular barriers.
- **Numerical Matrices Compilation** ($A = I + i\alpha H$, $B = I - i\alpha H$).

## Developer

Developed for **NMIMS University** (School of Technology Management & Engineering, Hyderabad Campus).
Contact: anandsharmacy@gmail.com
