# STAGE1.md: flight feel

## Deliverable

A grey ground plane, a horizon reference, a quad, and a stick input. You can hover, punch out, roll, flip, powerloop, descend into your own propwash, and crash. No gates, no lap timer, no menus, no textures, no sound.

## Reference airframe

One preset only in Stage 1. A 5 inch freestyle quad:

- All-up mass 0.65 kg
- Battery 6S, 1300 mAh, nominal 22.2 V, 4.20 V per cell charged, 3.50 V per cell empty
- Four motors, 1900 kV, at the corners of a 220 mm diagonal
- 5 x 4.3 x 3 propellers
- Thrust-to-weight approximately 4.5 to 1 at full charge
- Inertia tensor diagonal, roll 0.0055, pitch 0.0060, yaw 0.0110 kg m squared

## Architecture

```
src/native/          C, compiled to WASM by Emscripten
  sim.c              entry points, fixed-step integrator
  plant.c            motors, props, aero, battery
  bridge.c           Betaflight gyro in, motor out, config shim
  libm/              fixed-precision maths, no libc libm
patches/             patches applied to vendor/betaflight at build
src/render/          Three.js, main thread, read-only view of state
src/input/           WebHID first, Gamepad API fallback
tests/               owned by Loop A, read-only to Loop B
```

The physics module is one deterministic unit: Betaflight's control loop and the plant model in the same compiled module, stepped together at 1000 Hz. Rendering reads a snapshot and interpolates.

## Control loop

Compile from `vendor/betaflight`: `pid.c`, the rates curves (Betaflight, Actual and KISS), the filter chain, the mixer, and rc command handling. Stub the hardware abstraction layer with the simulated gyro and motor outputs. Config comes in as a Betaflight diff, parsed and applied at init.

## Plant model

In order of contribution to feel. Implement in this order.

1. **Motor first-order lag.** Time constant 10 to 30 ms, configurable. Without it everything feels unnaturally crisp and nothing else you do will fix that.
2. **Thrust and torque as functions of RPM, not throttle.** Thrust proportional to RPM squared, torque proportional to RPM squared with a separate coefficient. Motor RPM comes from a first-order response to commanded voltage, loaded by prop drag torque.
3. **Battery sag.** Internal resistance per cell, voltage drops under current draw, available RPM drops with it. This is why a quad feels different at 3.5 V per cell and it is a large part of what pilots read as "authentic".
4. **Prop drag torque.** Yaw coupling falls out of this for free rather than being faked.
5. **Airframe drag.** Roughly quadratic, with separate frontal and plan-area coefficients so it decelerates properly when you flare.

Deferred to Stage 2, do not build now: propwash turbulence, inflow and advance ratio effects, ground effect, wind.

## Input

WebHID first: open the radio as a raw HID device, take `inputreport` events at the endpoint's declared rate, typically 125 Hz to 1000 Hz. Write timestamped samples into a ring buffer. The integrator consumes each sample using the sample's own timestamp, never arrival time, because irregular intervals feeding a fixed-step integrator is what people perceive as floaty, not low sample rate.

Gamepad API is the fallback, wired but not tuned. Keyboard is not required.

The same code path must accept a recorded input file, which is how every check below runs headless.

## Verification checks

Every check is a numeric band in `tests/thresholds.json`. `npm run verify` runs all of them and exits non-zero if any fails.

| # | Check | Method | Pass band |
|---|---|---|---|
| 1 | build-clean | `npm run build:wasm` exits 0, `git diff --stat vendor/betaflight` empty | exact |
| 2 | determinism-repeat | Replay `baseline.rec` twice in one process, SHA-256 the state trace | identical |
| 3 | determinism-cross-host | Replay in Node and headless Chrome, compare hashes | identical |
| 4 | frame-independence | Same input at simulated render rates 30, 60, 144, 240 Hz | all four traces identical |
| 5 | hover-throttle | Trim to steady hover at 4.0 V per cell | 0.20 to 0.30 |
| 6 | punch-out | From hover, full throttle 3.0 s, altitude gained | 55 to 85 m |
| 7 | terminal-velocity | Level, full throttle, 20 s, speed plateau | 30 to 40 m/s |
| 8 | motor-step-response | Step one motor 0 to 100 percent, time to 63 percent of final RPM | 10 to 30 ms |
| 9 | rate-tracking | Full roll stick, steady-state roll rate vs configured max rate | within 3 percent |
| 10 | yaw-coupling | Hard roll at constant throttle, yaw drift | non-zero, correct sign |
| 11 | battery-sag | Identical punch-out at 4.20 V and 3.60 V per cell, peak RPM | 3.60 V run lower by 4 to 15 percent |
| 12 | diff-passthrough | Parse two Betaflight diffs differing only in rates, run identical input | resulting max roll rates differ by the ratio in the diffs, within 2 percent |
| 13 | console-clean | Browser harness run | zero errors, zero warnings |

Check 12 is the one that catches a bad port. If your own diff does not change the sim in the direction you expect, the Betaflight integration is wrong no matter what the other checks say.

## Not in Stage 1

Tracks, gates, lap timing, collision beyond a ground plane, other aircraft, networking, UI, settings persistence, Web Workers, SharedArrayBuffer, multiple airframe presets, visual polish of any kind.
