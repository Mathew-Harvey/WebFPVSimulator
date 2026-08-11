# PROGRESS.md

State between loop runs. Append only. Newest entry at the bottom. Never rewrite history, including the parts where something went wrong, because that is the most useful part of this file.

---

## CURRENT STATE

Stage: 1
Loop: A complete, harness built. Loop B not started.
Last `npm run verify`: 2026-08-11, exit 1
Checks passing: 0 of 13, every check FAIL with reason NOT_IMPLEMENTED, which is the Loop A goal state.

---

## OPEN QUESTIONS

Anything the loop could not resolve on its own, or a threshold it believes is wrong. Write the argument, do not act on it. A human answers these between runs.

- Check 10, yaw-coupling, Loop B evidence and argument. Measured 0.00 degrees exactly, against a floor of 2.0. This is not a missing feature switch; it is structural. Every Stage 1 mechanism cancels pairwise on a symmetric quad X because each mixer group (left, right, front, rear) contains exactly one clockwise and one counter clockwise motor: RPM squared drag torque deltas cancel between the rising pair (RL counter clockwise, FL clockwise), stator reaction to spin up and spin down cancels the same way, net prop angular momentum stays zero under any left right differential, and with q = r = 0 the Euler coupling terms vanish. The measured 0.00 is exact because the floating point trajectories are bitwise symmetric. The real world coupling comes from inflow and advance ratio asymmetry across the rolling disc, which STAGE1.md explicitly defers to Stage 2, and Betaflight's yaw PID would suppress most of any small drift anyway. Faking an asymmetry to buy the sign would violate the project's own rule that yaw coupling falls out of the physics rather than being scripted. Options for the human: accept the check as a Stage 2 gate and re band it when inflow lands, or re specify it as a yaw damping check (prop drag torque computed against air relative rotation speed, spin plus body yaw rate, gives real damping and is Stage 1 sized). Loop B continues with the check honestly red.
- Check 10, yaw-coupling, expected sign. STAGE1.md asks for "non-zero, correct sign" but does not name the sign, so Loop A had to fix one in `tests/thresholds.json` (`expected_sign: -1`, meaning nose-right body yaw accumulation during a full right roll, with the sim_abi.h convention that positive r yaws nose left). Loop A could not derive this sign from first principles: for an ideal symmetric X quad, the roll mixer moves one CW and one CCW motor up and one of each down, so RPM squared drag torque deltas, prop spin-up inertia reactions, and net prop angular momentum all cancel pairwise, giving exactly zero roll-to-yaw coupling at this modelling order. The real-world coupling pilots feel comes from effects that may or may not emerge from the Stage 1 plant. The sign, and whether the 2.0 degree floor is reachable at all in Stage 1, are provisional Loop A choices. If Loop B's model robustly produces the opposite sign, or near zero, write the measured value here and let a human re-set `expected_sign` or the floor. Loop B must not edit thresholds.json.

---

## DECISIONS

Choices made during the build that are not already in CLAUDE.md. One line each, with the reason.

- Loop A scaffolded the repo root from `prompts/` (CLAUDE.md, STAGE1.md, PROGRESS.md, `.claude/skills/verify-flight-model/SKILL.md`), because the LOOP.md setup step had not been run and Loop B reads these at the root.
- The module ABI lives in `src/native/sim_abi.h`, version 1: nine entry points, a 20 double state block, world frame z up, body frame x forward y left z up, RC convention stick channels. The harness in tests/ is written against it, so changing it is an argument for PROGRESS.md, not a quiet edit. No advisor channel existed in this session; the ABI reasoning is recorded here instead.
- Zero npm dependencies. Checks 3 and 13 drive headless Chrome over the DevTools protocol using Node's built-in WebSocket (`tests/lib/browser.js`), a static file server from node:http (`tests/lib/server.js`), and the Chrome binary found via `SIM_CHROME_BIN` or common install paths. Reason: CLAUDE.md demands dependency justification, and none proved necessary.
- `dist/sim.wasm` is built with STANDALONE_WASM and no Emscripten JS glue, so the identical bytes load in Node and the browser through one tiny loader (`tests/lib/simmod.js`). `malloc`/`free` are exported for host-side buffers.
- Build flags `-fno-fast-math -ffp-contract=off`, no relaxed SIMD, in `scripts/build-wasm.sh`. These are determinism load-bearing, do not remove.
- `tests/inputs/baseline.rec` is generated from piecewise linear breakpoint tables using only IEEE basic arithmetic, so regeneration is byte-identical on any engine. sha256 `13bbb5bb2ffb84292ad338ab5712411eeb14bc9ed3f281c63114c379af40d2a9`, 7500 samples, 250 Hz, 30 s, covering hover, punch-out, right and left rolls, a back flip, and a low throttle descent into propwash. `npm run gen:baseline` refuses to overwrite without `--force`; regenerating is a Loop A action only.
- Canonical replay for the trace hash: sim_step batched as a 60 Hz render loop, state block hashed raw (SHA-256 over the little-endian bytes) every 10 ms. Check 4 varies only the batching rate; the input delivery rule (a sample is delivered before the 1 ms step containing its timestamp executes) is identical at every rate by construction.
- The stub returns NOT_IMPLEMENTED from every entry point except `sim_abi_version`, which reports 1 so a host can tell "stub loaded" from "wrong module". This is what makes every check fail with a reason instead of a crash.
- Check 1 treats "sim_init returns OK" as part of build-clean, so the build check fails NOT_IMPLEMENTED against the stub rather than passing vacuously while nothing works.
- Fixture configs are Betaflight 4.5 style diffs with ACTUAL rates. Check 9's configured max rate and check 12's expected ratio are parsed from the fixture files at run time, never hardcoded, so the fixtures stay the single source alongside thresholds.json.
- Emscripten is located via PATH, `$EMSDK`, `$HOME/emsdk`, or `/opt/emsdk` in that order by `scripts/build-wasm.sh`.

---

## HARNESS REFERENCE, Loop A

The 13 checks, their thresholds, and where each number came from. Every numeric lives in `tests/thresholds.json`, each with its own `source` field; this table is the summary. "Loop A" in the source column means STAGE1.md left the number unspecified and Loop A fixed it, with reasoning in DECISIONS or OPEN QUESTIONS.

| # | check | threshold | source |
|---|-------|-----------|--------|
| 1 | build-clean | `npm run build:wasm` exit 0, `git diff --stat vendor/betaflight` empty, abi version 1, `sim_init` returns OK | STAGE1.md check 1; init OK requirement is Loop A |
| 2 | determinism-repeat | two in-process replays of baseline.rec, SHA-256 of state trace identical | STAGE1.md check 2 |
| 3 | determinism-cross-host | Node and headless Chrome replay hashes identical | STAGE1.md check 3 |
| 4 | frame-independence | traces at simulated render rates 30, 60, 144, 240 Hz all identical | STAGE1.md check 4 |
| 5 | hover-throttle | trimmed hover throttle at 4.0 V per cell in 0.20 to 0.30 | STAGE1.md check 5; trim method (bisection on vz after 2 s, 0.05 m/s tolerance) is Loop A |
| 6 | punch-out | altitude gained over 3.0 s full throttle from hover in 55 to 85 m | STAGE1.md check 6; 4.20 V per cell and 2 s hover settle are Loop A |
| 7 | terminal-velocity | mean speed over the final 2 s of a 20 s full throttle run in 30 to 40 m/s | STAGE1.md check 7; 4.20 V and 2 s window are Loop A |
| 8 | motor-step-response | time from motor 0 step 0 to 100 percent duty until 63 percent of final RPM, 10 to 30 ms | STAGE1.md check 8; 0.2 s pre hold and 1.0 s settle are Loop A |
| 9 | rate-tracking | steady mean roll rate under full roll stick within 3 percent of configured max rate, 670 deg/s parsed from fixture srate 67 | STAGE1.md check 9; throttle 0.35, 1.5 s hold, 0.3 s window are Loop A |
| 10 | yaw-coupling | integrated body yaw over a 1.0 s full right roll at throttle 0.5: magnitude at least 2.0 deg and sign negative | STAGE1.md check 10 is qualitative; floor and sign are Loop A, see OPEN QUESTIONS |
| 11 | battery-sag | identical punch-out at 4.20 V and 3.60 V per cell, peak RPM lower by 4 to 15 percent | STAGE1.md check 11 |
| 12 | diff-passthrough | steady max roll rate ratio between the two fixture configs within 2 percent of their srate ratio 84/67 | STAGE1.md check 12; fixture srate values are Loop A |
| 13 | console-clean | browser harness replay completes with zero console errors and zero warnings | STAGE1.md check 13 |

Harness layout: `tests/verify.js` is the runner. `tests/lib/` holds the shared, environment-neutral modules (recfile, simmod, replay) used identically by Node and the browser page `tests/browser/harness.html`, plus Node-only drivers (checks, table, server, browser). The ABI contract is `src/native/sim_abi.h`; the Loop A stub is `src/native/sim.c`. tests/ and tests/thresholds.json are read-only to Loop B.

---

## RUN LOG

Format per turn that changed code:

```
### <date time> | Loop <A or B> | turn <n>
Changed: <what>
Verify: <n> of 13 passing. Failing: <names with measured value vs band>
Wrong: <anything attempted and undone, and why it did not work>
```

### 2026-08-11 | Loop A | turn 1
Changed: everything from an empty repo. Root scaffolding from prompts/, LICENSE (GPLv3), package.json with verify, build:wasm and gen:baseline scripts, `src/native/sim_abi.h` and stub `src/native/sim.c`, `scripts/build-wasm.sh`, the full harness under tests/ (runner, 13 checks, thresholds.json, shared replay modules, browser harness, DevTools driver, static server, baseline generator), fixtures, and `tests/inputs/baseline.rec`.
Verify: 0 of 13 passing. All 13 FAIL with reason NOT_IMPLEMENTED, exit 1, no check errored, crashed or skipped. This is the Loop A goal state: the ruler exists and reports honestly against the stub. `npm run build:wasm` exits 0. Stable across three consecutive runs.
Wrong: two things surfaced and were fixed. First, the browser page's implicit favicon request 404ed against the static server and Chrome logged a console error, which would have kept check 13 red forever; fixed by a `data:` favicon link in harness.html. Second, the DevTools driver evaluated `window.__simHarnessResult` immediately after requesting navigation and could race the commit, seeing the old about:blank context and reading undefined; fixed by polling for the promise to exist before awaiting it.

### 2026-08-11 | Loop A | turn 2
Changed: fixes from an adversarial review of the harness by four independent read-only reviewers. The one high severity find: `runScript` restarted its input timestamp clock at zero on every call, so the second phase of the punch-out procedure (checks 6 and 11) and of the motor step procedure (check 8) delivered samples timestamped in the sim's past, violating the non-decreasing timestamp contract in sim_abi.h; a conforming Loop B sim could have failed those checks unfairly. `runScript` now takes and returns the absolute sim time and the call sites thread it through; sim_abi.h clarifies that the input stream restarts at t = 0 only after sim_init or sim_reset. Hardened tests/lib/browser.js: Chrome spawn and DevTools wait moved inside the cleanup try block (no zombie Chrome or leaked profile when the endpoint never appears), an error listener on the child process (a failed spawn no longer crashes the runner), CDP pending commands now reject when the connection dies (no indefinite hang if Chrome is killed mid-run), the readiness probe tolerates transient context-swap rejections, and the final timeout timer is cleared. recfile.js rejects implausible sample rates so a corrupt header cannot loop the replay forever. Wired the previously dead thresholds entries: check 10 derives its integration step from physics.step_hz and gen-baseline.js reads input_sample_hz instead of hardcoding 250; dropped the unused cells entry. Declared the Node 22 floor in package.json engines (global WebSocket and crypto.subtle). Corrected this file's ABI entry point count from ten to nine and a stale comment pointer in gen-baseline.js.
Verify: 0 of 13 passing. All 13 FAIL with reason NOT_IMPLEMENTED, exit 1, no check errored, crashed or was skipped. Still the Loop A goal state. baseline.rec regenerated under the reworked generator and confirmed byte-identical, sha256 unchanged.
Wrong: the timestamp restart bug above was Loop A's own, written in turn 1 and caught only by review; the lesson recorded here is that the harness's procedures must obey the same ABI contract they impose on the sim.

### 2026-08-11 | Loop B | turn 1
Changed: vendored Betaflight as a submodule pinned to tag 4.5.1. Implemented the physics module: `src/native/plant.c` (DC motor electrical model with prop drag load, kT omega squared thrust, battery sag through pack internal resistance, per axis quadratic airframe drag, stator reaction yaw torque, gyroscopic term, quaternion attitude integration), `src/native/libm/sim_math.c` (deterministic small angle trig and wasm sqrt, no libc libm), full ABI in `src/native/sim.c` (timestamped input queue consumed by sample timestamp, 1 kHz fixed step, motor override, state export), and `src/native/bridge.c` holding the config shim plus an interim throttle passthrough. The passthrough is scaffolding, clearly marked: no PID exists in this repo and none will be written here; attitude control arrives only by compiling Betaflight from vendor/. Build script now compiles the four module sources. Advisor note: no advisor channel in this session; the build and plant shape decisions are recorded here.
Plant constants derivation: with a linear average voltage ESC model, hover duty 0.25 at 4.0 V per cell plus thrust to weight 4.5 at full charge force the load dominated motor regime. Solving both constraints with Ke fixed by 1900 kV gives Ke omega_hover 1.891 V and load term 4.109 V, so omega_hover 376 rad/s. Hover current chosen 3 A per motor giving R 1.370 ohm, kQ 1.065e-7, kT 1.126e-5 from hover thrust 1.594 N. J 2.6e-6 tuned for the 10 to 30 ms step band. Pack resistance 0.012 ohm per cell for sag mid band. Plan drag area 0.0319 m2 sets terminal velocity near 32.5 m/s and punch near 75 m. Consequence, recorded as a trade: absolute RPM runs a factor of about 3.5 low versus a real 5 inch quad because the two throttle bands pin the regime; every check measures ratios or SI kinematics, so nothing in the ruler sees absolute RPM. Revisit for feel later if needed.
Verify: 9 of 13 passing. PASS: determinism-repeat, determinism-cross-host, frame-independence, hover-throttle 0.2578 in 0.20 to 0.30, punch-out 74.6 m in 55 to 85, terminal-velocity 32.7 m/s in 30 to 40, motor-step-response 19 ms in 10 to 30, battery-sag 8.04 percent in 4 to 15, console-clean. FAIL: build-clean (uncommitted submodule pointer showed as a vendor diff, resolved by this commit), rate-tracking 0.0 deg/s (no controller yet), yaw-coupling 0.00 deg (no controller yet), diff-passthrough (no rotation yet).
Wrong: nothing undone this turn. The three controller checks fail by design until the Betaflight port lands.

### 2026-08-11 | Loop B | turn 2
Changed: compiled Betaflight's control loop into the module. Sources from vendor/betaflight built with the SITL target configuration (its platform_mcu.h and target.h) plus SIMULATOR_BUILD: fc/rc.c, rc_controls.c, rc_modes.c, controlrate_profile.c, runtime_config.c, flight/pid.c, pid_init.c, mixer.c, mixer_init.c, common/maths.c, filter.c, bitarray.c, pg/rx.c, pg/motor.c, config/feature.c, build/debug.c. Zero patches needed so far; patches/ hook exists in the build script. New src/native/bf/bf_glue.c feeds the simulated gyro in, writes rcData, applies diff settings onto the real parameter group structs (reset via the pg reset functions called directly), runs updateRcRefreshRate, updateRcCommands, processRcCommand, pidUpdateTpaFactor, pidController and mixTable each 1 ms step, and reads motor[] back as duties. src/native/bf/bf_stubs.c provides the driver and subsystem externs (motor endpoints, imu attitude, failsafe, battery monitor, rx frame delta, simulated millis). bridge.c is now a pure tokenizer delegating every set line to the glue. The interim throttle passthrough is gone.
Three sign chain battles, all diagnosed empirically and now documented in the code: first, pidStabilisationState(PID_STABILISATION_ON) must be called or pid.c zeroes its output (core.c normally does this on arm). Second, Betaflight's internal pitch polarity is nose down positive, fixed by the quad X mixer table (rear motors carry pitch +1), so the pitch stick channel inverts at the glue seam and the gyro pitch feed is +q; mapping it nose up positive turns the pitch loop into positive feedback that diverges in about three seconds. Third, the yaw chain has two deliberate inversions that cancel: updateRcCommands negates the yaw channel and mixer.c negates the yaw pid sum when yaw_motors_reversed is off, so the gyro yaw feed is +r with the props-in spin table (RR and FL clockwise); an experiment that flipped the spin table and the gyro feed together just reversed the runaway direction, which is what isolated the mixer negation.
Also fixed: NaN poisoning of the whole state after the first moving stick sample, traced to feedforward dividing by a zero rx interval because updateRcRefreshRate was never called; the glue now calls it every step on the simulated clock and a rxGetFrameDelta stub makes it fall back to the call interval. The NaN also explained a determinism failure worth remembering: wasm NaN payload bits differ between V8's baseline and optimizing tiers, so the first replay in a process hashed differently from later ones. If determinism-repeat ever fails again while frame-independence passes, suspect NaN in the trace first.
A sim_bf_debug export (not part of the ABI) reads Betaflight's setpoint, gyro, pid terms and motor outputs from scratch scripts; it is what isolated both sign chains. Kept for future debugging.
Verify: 12 of 13 passing. PASS: build-clean, determinism-repeat, determinism-cross-host, frame-independence, hover-throttle 0.2549, punch-out 74.7 m, terminal-velocity 32.7 m/s, motor-step-response 19 ms, rate-tracking 670.0 deg/s at 0.00 percent error, battery-sag 8.04 percent, diff-passthrough ratio 1.2537 at 0.00 percent error, console-clean. FAIL: yaw-coupling 0.00 deg vs floor 2.0 deg; argument written under OPEN QUESTIONS, threshold untouched, a human decides.
Wrong: the two axis polarity guesses described above, both undone the same turn; and the first attempt at fixing yaw flipped the spin table together with the gyro sign, which reversed the runaway instead of curing it and had to be half reverted.
