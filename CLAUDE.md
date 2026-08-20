# CLAUDE.md

Project conventions. Read fully before any turn. These are decisions already made, not options.

## What this is

A browser FPV racing simulator whose only current goal is flight feel indistinguishable from a real quad. Stage 1 is physics only. There is no game here yet.

## Decisions already made

**Controller is ported, not written.** Betaflight is vendored under `vendor/betaflight` and compiled to WASM. Do not reimplement rates curves, the PID controller, the D-term filter chain, feedforward, TPA, iterm relax, airmode or anti-gravity in JavaScript. If a Betaflight behaviour is missing, the fix is to compile more of Betaflight, not to approximate it.

**Betaflight sources are read-only.** Every change is a patch file in `patches/`, applied at build time. `git diff --stat vendor/betaflight` must be empty after a build. This keeps upstream merges possible and keeps the port honest.

**Licence is GPLv3.** Compiling Betaflight's control loop in makes this a derivative work. Every file gets a GPLv3 header. Do not add a dependency with an incompatible licence.

**Coordinate convention.** Physics is right-handed, Z-up, body frame, matching Betaflight and the flight dynamics literature. Three.js is Y-up. Convert exactly once, at the render boundary, in `src/render/frame.js`. Nowhere else. Sign errors in yaw two months from now all trace back to breaking this.

**Units are SI throughout.** Metres, kilograms, seconds, radians, newtons, volts, amps. Degrees appear only in user-facing display strings and in Betaflight config values, converted at the boundary.

**Physics never reads frame time.** Fixed timestep, 1000 Hz, driven by an accumulator. `requestAnimationFrame` may drive the accumulator but its delta never reaches the integrator. Render interpolates between the two most recent physics states. A dropped frame must change nothing about the trajectory.

**Stage 1 runs on the main thread.** No Web Worker, no SharedArrayBuffer yet. They arrive in Stage 2 when there is geometry to compete with. Fewer parts now.

**Determinism is a requirement, not a nice-to-have.** No `relaxed_simd`. No JS `Math.sin`, `Math.cos` or `Math.pow` anywhere in the physics path, because they are not specified to bit precision and vary between engines. Compile a fixed libm into the WASM module and use it. The same input stream must produce a bit-identical state trace in Node and in the browser, on any machine.

## Style

- Plain JavaScript for the shell. No framework, no bundler beyond what Emscripten needs, no TypeScript, no state library. If a dependency is being added, justify it in PROGRESS.md first.
- Three.js from a CDN import map for rendering. Nothing else on the render side.
- No physics engine. Cannon, Ammo and Rapier are all wrong for a quad.
- Prefer one file doing an obvious thing over three files doing a clever thing.
- No em dashes or en dashes in prose, comments, commit messages or documentation. Use a comma, colon or full stop.

## Working rules

- **Do not run `npm run verify` unless asked.** It is expensive: it drives headless Chromium through the whole shell and takes minutes of wall clock. Run it when the change is to physics, the plant, the module ABI or the build, or when the request says to.
- Never report a check as passing without having run it in the same turn. That rule is unchanged by the one above: if verify was not run, say so, say why, and say what was done instead. A check that was not run is not evidence, and neither is a green check that cannot see the thing that changed. Check 13 loads only `tests/browser/harness.html`, so it says nothing about any other page.
- Prefer the cheap targeted check to the full suite: `npm run lint:fc`, `npm run lint:presets`, `npm run lint:catalog`, `node scripts/shots.js` for anything visual, and a direct fetch for anything about a served file.
- Never change a threshold to make a check pass. Argue in PROGRESS.md instead.
- Every turn that changes code appends to PROGRESS.md, including what went wrong.
- Consult the advisor before any change that alters the physics model's shape, the module ABI, or the build. Not for filling in the next line.

## Review

- **Do not run adversarial review, multi agent review or a review workflow unless directed.** Read your own diff, run the cheap checks, and hand the work over. Fan out only when the request asks for it.
- When a review does run, its findings go in PROGRESS.md whether or not they were acted on, and a finding that was declined is written down with the reason.
