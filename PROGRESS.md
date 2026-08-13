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

- CRITICAL, physics. The propeller model violates momentum theory: figure of merit is 2.013, and the physical maximum for any rotor is 1.0. Verified independently, not just asserted by the reviewer. With kt = 1.1257e-5 and kq = 1.0651e-7, hover shaft power is kq*w^3 = 5.67 W per motor while the ideal induced power for that thrust on a 5 inch disc is T^1.5/sqrt(2*rho*A) = 11.42 W. The prop puts twice as much energy into the air as the shaft delivers. The ratio is scale free because both terms are power laws in w, so it holds at every RPM. This is not a tuning error, it is a thermodynamic impossibility, and it is the root cause of a chain of compensating errors: prop torque is the only currency yaw is paid in, so yaw is starved by roughly 4x (780 ms to reach 90 percent of a 450 deg/s step, against 120 to 180 ms real), and r_motor had to be inflated to 1.37 ohm against a real 0.06 to 0.09 to soak up power the prop should have absorbed, which in turn crushed absolute RPM to 3641 at hover against a real 8700 to 9500 for 1900 kV on 6S.
  The correct relationship is kq = kt^1.5 / (FM * sqrt(2*rho*A)) with FM in 0.4 to 0.6 for a real 5 inch prop. It should be enforced in code with a build time assert, not tuned as two independent numbers, which is how this got in.
  The reason this is an OPEN QUESTION and not simply a fix: the correction collides with the thresholds. With a realistic r_motor of 0.08 ohm, hover at 20 to 30 percent throttle and thrust to weight 4.5 are mutually inconsistent, because the load term is far too small relative to back EMF. Solving both constraints with real motor parameters drives hover RPM to about 1325, which is absurd. The self consistent real world answer is thrust to weight near 7, which a 6S 5 inch genuinely has, and which lands hover at about 21 percent, inside the 0.20 to 0.30 band. But TWR 7 then pushes punch-out to roughly 86 m against a band of 55 to 85, and terminal velocity to about 45 m/s against a band of 30 to 40, unless cda_plan roughly doubles to about 0.066 m2. A quick solve says cda_plan 0.0666 puts terminal at 31 m/s and punch at 82 m, both inside band, so a consistent fix does appear to exist. It needs careful iteration against npm run verify, which is the next session's first job.
  A human should also note that STAGE1.md's stated 4.5 to 1 thrust to weight is itself low for the airframe it describes, and that the hover-throttle band and the TWR figure cannot both be satisfied with real motor constants. Loop B has not changed any threshold.
- Betaflight's own default tune misbehaves on the current plant, which is diagnostic rather than a tuning problem. configs/freestyle.diff halves I on all three axes relative to Betaflight 4.5.1 defaults, and its header records that the stock tune overshoots 17 percent and reverses 72 deg/s here. Stock Betaflight flies a real 5 inch well. A plant on which Betaflight's defaults misbehave is a wrong plant, not a plant that needs a custom tune, so the tune should be reverted to defaults after the prop fix and used as the test of whether the plant is right.
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
- Render side dependency, justified as CLAUDE.md requires: the import map gains `three/addons/` alongside `three`, both pinned to 0.160.0 on the same CDN. This is the same package, not a new dependency, and it supplies EffectComposer, RenderPass, ShaderPass, UnrealBloomPass and OutputPass. Writing a bloom downsample chain and a composer by hand would be a few hundred lines of render code carrying no project specific meaning. Nothing else is on the render side and the physics path is untouched by any of it.

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

### 2026-08-11 | Loop B | turn 3
Changed: the Stage 1 flyable shell. index.html with a pinned Three.js 0.160.0 CDN import map, src/render/frame.js as the single z up to y up conversion seam (position and quaternion permute x_three = -y_sim, y_three = z_sim, z_three = -x_sim), src/render/scene.js (grey ground plane, grid for motion cues, sky and fog horizon, minimal quad with red front props, 95 degree FPV camera), src/input/input.js (Gamepad API for radios in joystick mode with a five step calibration wizard stored in localStorage, plus WASD and arrows keyboard: W/S latched throttle, A/D yaw, arrows as the right stick with rate limited deflection), src/main.js (requestAnimationFrame drives a 1 ms accumulator, frame delta never reaches the integrator, input samples stamped with wall arrival offsets mapped onto the simulated clock and consumed by timestamp, render interpolates the two most recent physics states, FPV and chase cameras, 20 degree uptilt, drag and drop of a Betaflight diff re-inits the module, R reset, C camera, M calibrate, V cell voltage cycle), scripts/serve.js and npm run serve, README quickstart. The shell imports tests/lib/simmod.js read only for the wasm wrapper rather than duplicating it.
Decisions: ground contact stays out of the physics module because the harness trim procedure measures free air behaviour (the ABI reset pose is free air); the shell spawns at 1.5 m altitude and declares a crash at ground level with auto reset. WebHID raw report input is deferred one turn: a radio in joystick mode enumerates as a standard gamepad and takes the Gamepad API path today; WebHID buys sample rate, not functionality, and needs real hardware to validate.
Tested headlessly in Chrome over the DevTools protocol with the CDN intercepted to a local copy (container cannot reach jsdelivr from Chrome) and SwiftShader WebGL: page boots with zero console errors or warnings, renders at 40 plus fps software, spawns, falls to a crash with no throttle, auto resets, and with a synthetic held W key spools to throttle 1.00 and climbs through 6.5 m at 16.9 m/s with vbat sagging 25.2 to 21.5 V at 51 A. Stick hardware itself cannot be tested in this container; the calibration wizard is the guard against axis order surprises.
Verify: 12 of 13 passing, unchanged. yaw-coupling still red at 0.00 deg awaiting the human decision in OPEN QUESTIONS.
Wrong: first smoke test attempt failed twice for container reasons worth remembering: headless Chrome does not inherit the proxy environment so the CDN import needed DevTools Fetch interception, and --disable-gpu leaves no WebGL so the test uses --use-angle=swiftshader. Neither affects a normal desktop.

### 2026-08-11 | Loop B | turn 4
Changed: the renderer, rebuilt for a cel shaded look that holds up rather than merely being flat shaded.
`src/render/celmat.js`: the shading model. The thing that separates good cel shading from flat shading is that light and shadow are different hues, not one hue at two brightnesses, so the toon gradient map is an RGB ramp running cool blue in shadow to warm white in light. Three samples it by N dot L and multiplies into the base colour, which keeps its own shadow, fog and light machinery working. onBeforeCompile adds a quantised fresnel rim tinted toward the sky, which is what separates a silhouette from the background at distance, and a hard specular band for the craft.
`src/render/post.js`: depth and normal edge detection for ink lines, plus tight bloom for the gate rings and sun, plus OutputPass. Inverted hull outlines only give an object its own silhouette; an edge pass also finds creases and the contact line where something meets the ground.
`src/render/scene.js`: terrain from deterministic value noise fbm with a flattened corridor along the circuit, vertex coloured by altitude and slope; 46000 blade wind animated grass in one merged buffer with gusts keyed to world position so blades move as a mass; chunky stylised clouds; three mountain rings with aerial perspective; a figure of eight circuit of eight gates with emissive apertures, numbered pip plates and course flags; shadow map that follows the craft so a 58 m box at 2048 gives crisp contact shadows instead of mush over 1.7 km. Camera uptilt is now 30 degrees.
Five real rendering bugs found and fixed by screenshotting rather than by reading the code, which is the only way any of them would have surfaced:
1. In FPV the camera sits inside the airframe, so the quad was rendering the inside of its own inverted hull outline: a black rectangle filling the middle of the screen. The craft is now hidden in FPV.
2. The outline pass read the depth texture of the render target it was writing into, and the driver reported a feedback loop between framebuffer and active texture. Depth and normals now come from a prepass into a target the composer never writes to.
3. The normal prepass override material ignores the sky dome's depthWrite false, so the sky stamped depth at the far plane and every outline downstream was computed against the sky. Layer 1 is now a no ink layer holding sky, clouds and grass, excluded from the prepass.
4. The outline pass sampled one texel outside the frame, which wraps and pulls in the opposite edge, painting a bright green band along the top of the screen. Green because that is how MeshNormalMaterial encodes an up facing normal. UVs are clamped now.
5. The grass field is unlit while the terrain is lit by a 2.6 sun plus hemisphere fill, so the field read as a dark rash on top of bright ground. The sun's gain is baked into the grass shader.
Also: mountains were floating because a cone is centred on its origin and needs its base at y = h/2, and per blade outlines turned the grass into broken glass.
Verify: 12 of 13 passing, unchanged. Nothing here touches the physics path.
Wrong: the judging loop that was supposed to review this work failed completely. All six reviewer subagents hit a harness level failure where the permission handler stripped the arguments from every tool call, so none of them could read a single file, and they correctly refused to invent verdicts. Same failure mode as the Loop A review earlier in the project, which was worked around by calling agents directly instead of through a workflow. The visual judgement in this turn is therefore mine and the screenshots', not a reviewed verdict, and it is still awaiting the human gate.

### 2026-08-11 | Loop B unattended | gate loop iterations 0 and 1
Changed: bootstrapped the perfection loop on branch loop/perfection (gates.config.json authored once and hashed, npm run gates, .loop state) and rebuilt the propulsion physics. The prop pair is now derived, not tuned: kt 1.98e-6 from the real airframe, kq 3.16e-8 through momentum theory with an enforced figure of merit 0.50, exposed from the compiled module and asserted by gate P5. Motor resistance 0.09 ohm, rotor inertia 6e-6, pack 0.0065 ohm per cell, inertia tensor lightened to real values, battery voltage solved implicitly (the old one step lag oscillates at real resistances), and advance ratio added: thrust falls linearly to zero at pitch speed while shaft torque keeps its load, which is what limits climb, takes authority in a dive, and stops the RPM unloading upward. The compensator tune is reverted to stock Betaflight defaults, which now fly clean: hover 20.5 percent at 8595 RPM, bench TWR 9.2, motor t63 18 ms, punch 82.8 m, climb terminal 31.4 m/s, sag 10.1 percent, yaw rise90 133 ms, descent terminal 20.1 m/s. npm run verify holds 12 of 13 throughout on the same constants, which is the strongest statement here: the physically honest plant satisfies the Stage 1 harness without a single threshold touched.
Wrong, and recorded rather than hidden: two P4 TWR measurement methods were rejected as measuring the wrong quantity before the bench definition landed, and two gate document bands are provably inconsistent with their neighbours (t80 vs TWR vs terminal; 0 to 100 vs TWR). Derivations in .loop/threshold-disputes.md, conflicts in .loop/conflicts.md, nothing widened.

### 2026-08-12 | Loop B resumed by user | racing, propwash, grade, draw call merge
The user reopened the budget after the loop's context halt: keep it simple, return AAA gameplay and graphics under the standing constraints, do not stop. The halt file is superseded by .loop/REOPENED; the Prime Directive stands untouched.
Changed, gameplay: src/game/race.js, the race. Gate sequencing, a lap clock, best lap persisted in localStorage, and collision with gate frames. Detection is a swept plane crossing in each gate's local frame with the crossing point interpolated inside the aperture, so speed cannot tunnel a gate; posts are capsules and the top bar a box, and hitting either is a crash like a ground strike. The next gate's ring pulses; lap and best times sit on the HUD; a centre flash announces each lap and new bests.
Two real course bugs found by the test, not by eye. First, the craft spawns facing opposite the curve's parameter direction (spawn forward dot tangent = -1.000, measured), so the course as flown runs gate 0 then 7, 6, down to 1; the race follows the flown order and the number plates now count in flying order. Second, the figure eight's branches cross at the origin and gates 2 and 6 both sat exactly on the crossover, each one's posts standing in the other branch's racing line; a centre line sweep of the whole course crashed into a post at u 0.756. Both gates are shifted along their own branches (u 0.222 and 0.778) and the sweep now runs clean: nine crossings, one lap, wrong way rejected, over the top rejected, post strike detected.
Changed, rendering: static scenery (420 trees and rocks, six cliffs, 136 mountain cones, all outline hulls, all cloud puffs) is baked at load into one merged mesh per distinct material, keyed by the material options. Whole frame draw calls, including the normal prepass, the shadow map and the composer passes, fell from roughly four thousand to 231, measured through a renderer.info hook (window.__renderStats) that the frame budget gate can reuse. The rng stream is untouched so it is the same world. Canopy blobs got smooth normals: flat shaded icosahedra gave every facet its own toon band and crease line and read as crumpled paper up close; a smooth blob shades as one round mass, which is how this style draws a canopy. The outline pass normal bias rose 0.42 to 1.05 so low poly facet dihedrals stay clean while true corners still ink. post.js gained a grade pass between bloom and output: mild zoom compensated FPV barrel distortion, a highlight shoulder above 0.8, cool lift against warm gain, vibrance weighted toward unsaturated pixels, and a shallow vignette. The grass shader gained propwash: blades inside a few metres of the craft blast radially outward and flatten, scaled by mean rotor speed against hover, strongest directly below.
Tested: race logic under a node sweep of the exact course geometry (all eight assertions green), the shell headless in Chrome with zero console errors or warnings, and frames screenshotted at each step, which is what caught the wire mesh trees.
Verify: 12 of 13 passing this turn, unchanged. yaw-coupling remains the structurally zero check awaiting the human ruling in OPEN QUESTIONS. Gates were not re-run this turn; .loop/state.json still records the iteration 1 run honestly.
Wrong: the first renderer.info read returned 1 draw call because info resets inside every composer pass; the hook now accumulates across the whole frame with autoReset off. And the first aerial screenshot was taken before the climb finished, photographing grass from 0.8 m.

### 2026-08-12 | Loop B resumed | judged round: pilot and art director
Ran the judging panel the user set up, as direct agents since workflow subagents remain broken in this session. Both judges said no, with ranked findings; all six were implemented the same turn.
Art director (frames): 1. Grass and terrain were two disjoint systems, blades a brighter yellower green than the ground they grew from, reading as confetti on felt. The terrain albedo is now one shared function (groundAlbedo) sampled by both the terrain mesh and every blade root, tips lifted about 13 percent and nudged warm, jitter reduced, plus a mid scale macro variation band (period about 33 m). 2. The mountain rings were being washed to one beige wall by the linear scene fog even though their baked ring colours already encode stepped aerial perspective; celMaterial grew a fog option and the ridge cones opt out, restoring three readable planes, and the grade's cool lift was halved so the ink returns to near black. 3. The gate frame was a near black mass the ramp could not band (now 0x2a3352 navy), the emissive ring carried a ghost ellipse from the depth edge pass (ring and halo moved to the no ink layer), and the flowers floated half a metre up reading as z fighting debris (they hug the ground now, half size, white petal replaced with warm amber).
FPV pilot (race wiring): 1. A gate tap was a death sentence, full reset plus lockout, on a course whose 6 by 5 frame never demanded precision; and the frame collision was a point test that a fast quad could phase through between frames. Now the scoring aperture is the glowing ring itself (3.3 m effective diameter, a real line to hit), a frame tap voids the lap and resets the gate sequence instead of destroying the craft, the collision test is swept along the frame's travel at 0.2 m samples, and the crash lockout fell 2.5 s to 1.2 s. 2. Lap timing ran on the wall clock, quantised to display frames, on a project whose religion is deterministic physics; the scoreboard now runs on the simulation clock with the crossing interpolated inside the frame, so lap times are hardware independent and honest to the hundredth. 3. The spawn was a falling quad parked exactly on the timing plane; it now spawns 7 m behind the start line and the physics holds until the pilot first raises throttle, with a THROTTLE TO LAUNCH prompt, so a run starts when the pilot says so and the AFK crash loop is gone. Best laps are also keyed by config hash and cell voltage now, so a record set on a dropped 1000 deg per second diff cannot shadow the stock tune's record.
Race unit tests: eleven assertions green, including a tunnelling segment caught by the sweep, a frame corner crossing outside the ring correctly not counting, and the interpolated lap time (63984 ms where the frame quantised clock said 64000).
Verify: 12 of 13 passing this turn, unchanged. Browser smoke: zero console errors, launch hold confirmed live.
Wrong: the record key helper initially sat above the cellIdx declaration it reads, a temporal dead zone error that would have thrown at boot; caught by re-reading the diff before the smoke run, moved below the declarations.

## Polish loop round 1: the product shell

Rubric item attempted: A1, with A2 to A5 in its wake, because a title
screen with no way to learn the sticks and a debug dump still on screen
is not a product. Priority order in the loop prompt is A first, and A was
the whole of what a stranger meets in the first ninety seconds.

### Container repair before any of it

The container started with `vendor/betaflight` unchecked out and no
`emcc`, so `npm run verify` reported 11 of 13 with check 1 failing for
want of a compiler rather than for a code reason. Fixed by cloning the
submodule at the pinned commit and installing emsdk 3.1.61 to
/opt/emsdk. Recorded in .loop/blocked.md so the next container does the
same two steps first.

Worth writing down: the module rebuilt under emsdk 3.1.61 produces the
same replay hash, 000931016224, as the module built by whatever
Emscripten the previous container had. Determinism was asserted across
hosts and render rates; it now also holds across toolchain versions,
which is a stronger claim than the harness makes.

### What was built

- src/ui/ui.js, new. Title, How to fly, Settings, pause, results, the
  flight display, and the centre banner. Every screen is navigable from
  the keyboard alone and from sticks alone: pitch moves the cursor, roll
  right selects, roll left goes back, and any gamepad button selects.
  Radios in joystick mode have no dependable menu buttons, so the sticks
  had to be the primary path rather than the fallback.
- index.html, rewritten. All interface styling, on the same colour rule
  the renderer follows: warm cream and amber for lit type, slate blue for
  recessed type, mint for a record. Nothing in the interface is a grey
  copy of itself.
- src/main.js. A four state machine, title, flight, paused, results.
  Physics steps only in flight, so a pause or a results screen costs the
  trajectory nothing. The title runs an attract camera circling the start
  gate at 19 m and 7 m up.
- Settings that matter and nothing else: camera angle, pack charge, laps
  per run, sound, volume, performance readout, calibrate sticks. The
  camera angle and voltage keys that used to be undocumented single
  letters are now settings with an explanation each.
- The monospace developer HUD is gone. What replaces it is a flight
  display: lap clock, gate count, record, pack volts and amps with a
  charge bar, speed, altitude, throttle bar. Frame rate and draw counts
  moved behind the performance readout setting, off by default, F3 to
  toggle.
- src/game/race.js records each clean lap and counts voided ones, so a
  run ends on a results screen with lap times, a total, and the record,
  instead of a two second flash over the flight view.
- scripts/shots.js, new. Drives the real page in headless Chromium over
  the DevTools protocol, presses keys, and writes PNGs. Chromium here
  does not inherit the outbound proxy, so requests to the Three.js CDN
  are paused with the Fetch domain and fulfilled from Node, cached on
  disk. Console errors and warnings are collected in the same run, so the
  screenshots and the console gate come from one command.

### What went wrong on the way

- The first attract camera sat 4 m above the gate base and 13 m out. The
  frame was two thirds near grass. Looking at the screenshot is the only
  reason that was caught; it reads fine in the source.
- The first title scrim was a radial gradient at up to 0.93 alpha, which
  turned a warm afternoon valley into night. Replaced with a vertical
  gradient that leaves the sky and mountains lit and darkens only the
  band the menu sits in.
- The flight display first showed a row of dashes for the lap clock
  before the first gate, which reads as a broken glyph, not as prose.
  Now it reads 0.00, dimmed, and the banner says the mint ring starts
  the lap.
- The pack readout wrapped onto two lines at 1600 by 900 because volts
  and amps were on one line in a 190 px block. Split.
- Escape from the pause screen quit to the title, because back() fell
  through to its default. Escape now closes the pause screen it opened.

### Defects found by looking at frames, not yet fixed

Recorded here and in .loop/state.json so a later round picks them up
rather than rediscovering them.

1. The sky dome posterises its gradient into five bands. The band edge
   is a large pale arc that crosses the sky in every single frame and
   reads as an artefact rather than a style. src/render/scene.js
   skyDome.
2. The sand shore around the lake is roughly seventy metres wide. The
   shore test is |y minus lake level| < 3.5 m, and the lake bowl slope is
   about 0.1, so 3.5 m of height buys 35 m of beach on each side. A low
   pass fills two thirds of the frame with one flat cream value and no
   detail at all. src/render/scene.js groundAlbedo and makeHeightField.
3. 46000 grass blades spread over 900 by 900 m means the near field at
   eye height is a handful of very large isolated blades over bare
   ground. It reads as scattered shards, not a meadow.
   src/render/scene.js grassField.
4. A crash resets the run silently after 1.2 s behind a Crashed banner.
   No sound, no camera response, no consequence.
5. Nothing collides except gate frames and the ground height field.
   Trees, rocks, cliffs and water are all passable.

### Evidence

npm run verify, run in the same turn as this entry: 12 of 13, the single
red being yaw-coupling, which is structurally 0.00 for a symmetric X
quad and whose threshold has never been touched. Table pasted in the
commit message. Screenshots in .loop/evidence/r1. Console errors 0 and
warnings 0 on every capture run.

One honesty note about the results screenshot: those three lap times
were injected through window.__ui.showResults from the screenshot
harness, not flown. Flying three clean laps of a figure eight by
scripted key presses at the five frames per second this software
rasteriser manages is not something I can do. The screenshot is
evidence for the layout and the wording of the results screen and for
nothing else.

## Polish loop round 2: what two hostile reviewers found, fixed

Two reviewers, a cold player judging the first ninety seconds and a QA
tester hunting defects. Both returned REJECT. Their verdicts are binding,
so this round is their list, not mine.

Reviewer one: A1, A2, A3 PASS. A4 FAIL, A5 FAIL, plus fifteen defects.
Reviewer two: B1, B2, B4, B5, B6 all FAIL, with measured pixel evidence
and a named mechanism for each. Round 3 onward is that list.

### The finding that matters most: my evidence was wrong

Two of the seven round 1 screenshots did not show what their filenames
claimed. 05-flight.png was the How to fly screen and 06-paused.png was
the title. Cause: on this software rasteriser a frame takes about 120 ms,
so a keypress followed by wait:400 can capture the state the player was
in BEFORE the key. Both reviewers caught it independently. I did not,
because I looked at the images and read what I expected to read.

scripts/shots.js now has until:EXPR, which polls the page for up to 20 s,
and expect:EXPR, which fails on the spot. A failed assertion counts as a
console error, so the run exits non zero and a mislabelled pack cannot be
published quietly. Every capture of a named state now asserts that state,
and the round 2 run shows five such assertions passing.

That is a lesson about method, not about CSS: a screenshot is only
evidence of what you can prove was on screen.

### A4, developer output

The performance readout printed the config file name, the input source
string, and the four rotor speeds straight out of the state vector. The
setting promises frame rate and draw counts. It now prints exactly that
and nothing else.

### A5, prose

- The calibration wizard shouted identifiers at the player, CALIBRATE
  3/5: hold ROLL full RIGHT, and it is the first thing every radio owner
  meets. Now five sentences.
- gamepad (uncalibrated, press M) named a key bound to nothing since the
  settings screen replaced it.
- A rejected tune printed the module's error name, CONFIG_PARSE. It now
  says whether to blame the file.
- The flight display's amps line went. A charge bar and a voltage are
  what a pilot reads; the current draw was a number for its own sake.

### Defects from the player review, fixed

- Nothing in the interface was clickable. #ui and every .screen set
  pointer-events: none, so a player who reached for the mouse got a live
  cursor over a dead menu. Rows now hover and click.
- A crash erased the run. race.reset() clears the lap list, so three clean
  laps vanished behind a 1.2 s Crashed banner with no result screen.
  A crash now voids the lap it happened on and puts the craft back on the
  line, and the run continues.
- The results screen renumbered laps after filtering voided ones, so a run
  whose second lap was voided reported the third as lap two. Race keeps a
  log of every attempt with its real number, and voided laps appear as
  rows reading void, with the reason.
- Changing pack charge from the pause menu swapped the record key mid run,
  so a lap flown on a full pack could be compared against a tired pack's
  record. The charge a run flies on is now fixed when the run starts.
- The crash test sampled terrain height at the previous frame's position.
  At eight frames per second that is metres away, on possibly another
  hillside. It now samples at the position just integrated to.
- The flight display vanished when paused. It stays, dimmed.
- Menu rows shifted vertically as the cursor moved, because the
  explanation row only existed for the selected item. One note element
  with a reserved height now.
- The How to fly text never said the quad does not self level, the single
  fact that kills every newcomer. It says it first now.
- The selected row was a 520 px amber slab behind a three letter word. It
  is a bar and a colour change now.
- The wordmark sat 8 px left of centre because its trailing letter space
  was not trimmed. The record line sat directly on the mint gate ring
  behind it, so it has a chip now.
- The reading screens were still on the up to 0.93 radial scrim. Only the
  title had been lightened in round 1, which is not what round 1's entry
  implied, and a reviewer called that out. All screens are lighter now.
- Calibration prompts drew over the settings rows they were launched from
  with no panel behind them. They have one.

### Input hazards from the player review, fixed

- Any pressed gamepad button counted as select, so a radio with a latched
  arming switch fired the first menu item before the player saw the title.
  Buttons 1 goes back, 0, 2 and 3 select, and nothing counts until the pad
  has been seen with all of them released.
- Menu navigation read the mapped pitch axis, so a radio whose axis order
  does not match the AETR guess could not move the cursor, and the way to
  fix that is a menu item five rows into Settings. While uncalibrated, any
  axis pushed away from its rest position moves the cursor.

### What went wrong during the round

Hover on menu rows was wired to mouseenter. The menu is rebuilt on every
cursor change, and Chromium fires enter when a fresh element appears under
a stationary pointer, so the cursor snapped back to wherever the mouse was
resting and the arrow keys looked broken. The capture run caught it,
because the assertion that the cursor was on Settings failed and the shot
labelled settings was a flight frame. mousemove instead of mouseenter.

Then the launch banner drew across the results table, because the banner
was suppressed on mode rather than on whether a screen was up. Caught in a
screenshot, again, not in the code.

### Evidence

npm run verify in the same turn as this entry: 12 of 13, yaw-coupling the
only red, threshold untouched, git diff of tests/ empty. Capture run: five
state assertions passing, console errors 0, warnings 0. Frames in
.loop/evidence/r2.

## Polish loop round 3: the frame

Rubric items attempted: B5 focal hierarchy and B1 value bands, plus the
two artefacts whose mechanism was already named. All of it came from
reviewer two's list, and all of it is measured rather than judged, using a
new tool.

### A new instrument: scripts/pixels.js

Reviewer two settled arguments with numbers ("the gate aperture has the
same luminance as the grass behind it", "the white flag is brighter than
the sky") and this project had no way to answer in kind. scripts/pixels.js
decodes a captured PNG with zlib and prints the mean colour and Rec. 709
linear luminance of named rectangles. Luminance is the same quantity a
bloom high pass thresholds on, so a claim about the frame and a number in
post.js are now directly comparable.

### B5, the gate could not glow

Measured: UnrealBloomPass ran with threshold 0.92 on linear luminance.
The two ring colours, 0x7dffb4 and 0xffd45c, sit at about 0.70 and 0.70.
The high pass rejected both, so the only part of a gate that ever bloomed
was the 16 cm white pip marks, and the comment in post.js claiming bloom
existed to make the rings glow was false.

Raising the ring past 1.0 was the obvious fix and it is wrong here: the
renderer runs with NoToneMapping, so anything over 1.0 clamps to white and
the ring loses the hue that identifies it. Instead:

- Each gate carries an additive glow annulus in the plane of its opening,
  which is where a pilot on the racing line sees it. Unlit, unfogged, and
  with almost no fill, because the aperture is the thing you have to see
  THROUGH: the first version filled the gate with green haze and hid the
  exit line.
- The glow is driven per frame. The next gate sits at 0.52 to 0.78 and
  pulses; every other gate sits at 0.12. A gate that is not next is track,
  not target.
- The pulse drives the glow, not the ring's hue. The old pulse lerped the
  ring toward white, which took away the one colour that says which gate
  is next.
- The bloom threshold came down to 0.78, which catches the ring and the
  warm horizon and leaves the mid greens alone.

Measured after: gate ring core 0.912 linear, the brightest object in the
frame, against grass at 0.236 and sky at 0.379.

### B1, sky and ground were one value band

Measured before, at the same three points: sky 0.248, grass 0.257, bare
ground 0.255. Sky and ground were the same value and separated by hue
alone, which is exactly what the bar forbids.

Blue carries little luminance, so a bluer sky cannot fix this; a paler one
can. SKY_HIGH went from 0x2e6bb8 to 0x6ea3d8. Measured after:

  objects   trees 0.079, gate posts 0.097, flag cloth 0.080
  ground    grass 0.236 to 0.277 depending on cloud shadow
  sky       zenith 0.379
  above     far mountains 0.506, clouds 0.713, gate ring 0.912

Four separated bands with the target at the top.

The white course flags went too. A white cloth measured brighter than the
sky, so seventy two pieces of dressing outranked the gate. The palette is
now four muted colours and the cloth is cel shaded rather than unlit, so a
flag in shadow is in shadow.

### B4 in part: the grass had no light model at all

The grass fragment shader was one line, vec3 col = vColor, under a comment
claiming the terrain's sun gain was baked in. It was not. Reviewer two
measured the meadow 27 percent darker than the terrain it grows out of.

The blades now receive the same light the ground does, derived from the
scene's own lights rather than guessed: a toon surface facing up receives
sun colour times intensity times the ramp's lit band, plus the hemisphere
light, and in shadow it receives the ramp's cool band instead. Those two
products are uLit and uShade. The blades also read the real shadow map
through Three's shadow chunks, so a gate post's shadow crosses the meadow
instead of stopping at it, and they sample the same cloud shadow function
the terrain uses, from one exported snippet in celmat.js.

Measured after: grass 0.257 against bare ground 0.255 in the same frame.

Two things went wrong getting there. The first: a python replace hit the
same vertex shader tail in the WATER shader as well as the grass one, so
the lake started declaring a varying it did not have; the shader compile
error showed up as ten WebGL warnings and two console errors in the very
next capture. The second: getShadowMask lives in shadowmask_pars_fragment,
not shadowmap_pars_fragment, and it reads a bool named receiveShadow that
the renderer declares for its own materials and not for a raw
ShaderMaterial. Defined it rather than plumbing a uniform nothing would
ever set to false.

### The meadow itself

46000 blades over 900 by 900 m is one blade per two square metres, and
each was 7.5 to 13 cm wide. At eye height that reads as scattered debris,
and a blade as wide as a hand is the wrong plant. Now 184000 blades of 2.6
to 5.6 cm, with 84 percent of them inside 23 m of the circuit rather than
43 m.

### Artefacts with a named mechanism, fixed

- Clouds were on the no ink layer, and the outline prepass skips that
  layer wholesale, so clouds wrote no depth and the ink pass drew the
  silhouettes of mountains standing BEHIND them straight across the cloud.
  Reviewer two measured the cloud fill either side of one such line as
  identical within 1/255. Clouds are on layer 0 now: they occlude, and
  their own silhouette inks, which suits the painted shapes.
- The sky posterised into five bands with a hard step, and the band edge
  was a single enormous pale arc sweeping across every frame. Nine bands,
  a wider soft edge, and a half mix back toward the smooth gradient.
- A flag cloth measured rgb 151 93 113, a dusty pink that appears nowhere
  in the palette. Cause: the rim term is one minus dot(normal, view), and a
  flat plane is edge on across its whole surface at almost any angle, so
  the cool rim colour covered the entire cloth rather than its edge. Rim
  off for cloth: it now measures 137 50 48.

### Cost

Draw calls 255 to 310, triangles 1.01M to 1.47M, measured through
window.__renderStats on the same rasteriser. The triangles are the denser
meadow. Of the 55 extra calls, 72 are the flag cloths now casting shadows
so the flags stop floating, offset by merging the 72 static poles into one
mesh, plus 8 gate glows and the clouds entering the prepass; about 40 of
the 55 are unaccounted for and worth a look in a later round.

No absolute frame rate is claimed. This container has software
rasterisation only, and .loop/blocked.md says why that number would be
meaningless.

### Evidence

npm run verify in the same turn: 12 of 13, yaw-coupling the only red,
threshold untouched, git diff of tests/ empty. Capture run with two state
assertions passing, console errors 0, warnings 0. Frames in
.loop/evidence/r3, luminance table above reproducible with
  node scripts/pixels.js .loop/evidence/r3/02-gate.png sky=200,60,40,40

## Polish loop round 4: the reviewers' frame list, and a NaN with no error

Two round 3 reviewers, an art director and a performance engineer, both
REJECT. B1, B2, B4, B5 and B6 all FAIL with measured evidence. This round
is the top of that list.

### The performance reviewer corrected my own numbers

Two corrections worth more than the fixes:

- "310 draw calls" is one camera azimuth, the spawn frame. The attract
  camera, which is a shipped view, measures 642. A draw call figure without
  the view stated is not a measurement.
- The 40 calls round 3 could not account for were fully accounted for: the
  shadow map is rendered TWICE per frame, because renderNormals calls
  renderer.render and shadowMap.autoUpdate defaults true, so every new
  shadow caster costs two draws. The prepass overrides every material with
  one that samples no shadow map, so the first render is pure waste.

Fixed: the prepass brackets itself with shadowMap.autoUpdate false. Flight
view 310 to 237 draw calls, a 24 percent cut, output bit identical.

### What else changed

- Ridge rings. Measured, all four rings, the far valley floor and the trees
  on them came out at 0.079 linear luminance, 34.6 percent of the whole
  mountain band at ONE value, because a cel shaded cone's facets mostly
  face away from the sun and land in the ramp's shadow band. Aerial
  perspective was inverted: a 560 m ridge read four times darker than
  fogged ground at 400 m in front of it. The rings are unlit flat colours
  now, authored at 0.10, 0.14, 0.29 and 0.50 against a 0.38 sky, and jitter
  went from 2.9 to 9.2 degrees because 34 evenly spaced cones read as a
  picket fence.
- The gate ladder. With every gate but the target at 0.12 glow, the gate
  after next measured 0.064 against grass at 0.077: darker than the ground
  it stands in. The pilot had one target and no forward line. The next
  three gates now step 0.52, 0.34, 0.20 with everything else at 0.08.
- Clouds. Measured 255 255 253, luminance 0.999, clipped white, and one
  cloud carried 78 percent of the frame's bright area against the gate's
  24155 pixels. Their sun side term is down from 0.28 to 0.12.
- Flowers. Unlit MeshBasicMaterial, so byte identical in sun and shadow,
  and the palette held pink and violet in a meadow the code comment calls
  warm. Cel shaded now, warm petals only.
- The meadow ended on a ruler straight line across the frame, because 84
  percent of blades sat inside a hard 22 m radius of the circuit. Radius is
  now a cubed uniform out to 42 m, dense at the track and thinning.
- Ink. Two artefacts with named mechanisms. The meadow carried a three
  pixel ink line across the full width of the frame with the same colour on
  both sides: a surface seen edge on has a huge depth gradient of its own
  and a flat threshold inks it, so the threshold is now divided by how
  square on the surface is, using the view space normal the prepass already
  writes. And rectangles of ink floated in the grass with nothing inside
  them, because grass was excluded from the prepass so the ink pass drew
  the silhouettes of gate legs the grass stood in front of: grass is on its
  own layer now and is stamped into the prepass depth as pure black, a
  value no encoded normal can take, so the outline pass recognises a grass
  pixel and refuses to ink it or anything within one texel of it.
- Camera near 0.04 to 0.2 and the prepass depth texture from 16 to 24 bit.
  The camera sits inside a 150 mm airframe so 4 cm bought nothing, and at
  16 bits over a 0.04 to 2600 m range the mid ground quantised to metres,
  which is why the ink had to be faded out by 50 m.
- The best lap write to localStorage moved off the flight frame.

### What went wrong: a NaN with a clean console

Putting a lit material on the flowers turned the entire world into flat fog
cream. Every cel surface, the terrain included, came out at 0.811 linear
luminance. Zero console errors, zero warnings, no shader compile failure,
draw calls and triangles all normal.

It took five bisection steps to find, and the intermediate hypotheses were
all wrong: the layer mask bookkeeping in the prepass, the shadow map
autoUpdate change, the 24 bit depth texture, a program cache collision
between two cel materials. The layer mask rewrite survives anyway because
saving and restoring the raw mask is simply better than rebuilding it with
enable and disable calls.

The cause: the flower geometry has no normal attribute. That was harmless
while the material was unlit. A lit material reads the missing attribute as
(0,0,0), normalize of that is NaN, and on this software rasteriser the NaN
spread out of 2600 quads across the whole frame. Fixed by giving the
petals real normals, all straight up, which is what a horizontal quad has.

The lesson is about the harness, not the shader: a clean console proves
nothing about a frame. Only the frame does. The bisection only worked
because scripts/pixels.js could put a number on "the ground is the wrong
colour", and because scripts/shots.js could hide one object at a time and
re-measure.

### Cost, with the view stated

    flight, parked on the start line   237 calls   1.90M triangles
    title, attract camera              701 calls   1.92M triangles

Round 3 was 310 and 642 respectively. The flight view is down 24 percent
from the shadow map fix. The attract view is up 9 percent and I have not
accounted for it, which by this round's own standard means it is not
finished. The triangles are up because the grass now also draws in the
prepass, 552000 of them, and it is not frustum culled.

One mistake worth recording: the ridge cones were first given a
MeshBasicMaterial per cone, and the scenery merger buckets by material, so
136 cones became 136 draw calls instead of four. Caught by measuring the
count, not by reading the diff. Four shared materials now.

### Evidence

npm run verify in the same turn as this entry: 12 of 13, yaw-coupling the
only red, threshold untouched, git diff of tests/ empty. Console clean on
every capture. Frames in .loop/evidence/r4. Measured in 03-flight.png:
sky 0.379, grass 0.277, near ridge 0.108, second ridge where visible 0.192,
trees 0.102, gate posts 0.086, cloud 0.787.

## Polish loop round 5: the thing both reviewers found, and three numbers I got wrong

The round 4 review returned REJECT with all five B items still failing.
Its most valuable findings were the ones two independent reviewers reached
separately, and the ones that disproved numbers I had written down.

### There was no antialiasing anywhere in the frame

The renderer is constructed with antialias true, and it was inert:
EffectComposer allocates its own render targets, so the scene was rendered
aliased into those and the multisampled default framebuffer was written
only by the final fullscreen quad, where multisampling does nothing. The
performance reviewer found it by reading the pinned EffectComposer source;
the art reviewer found it by walking a gate crossbar edge and measuring
0.509, 0.108, 0.028 in three pixels, with the single transition pixel being
bloom bleed rather than coverage.

Fixed by giving the composer a target with samples 4 and turning the
renderer's own flag off. Measured on the same edge after: 0.505, 0.307,
0.075. There is now a real coverage pixel where there was none. On a frame
containing 184000 sub pixel grass blades this was the single worst thing in
the renderer, and it had been there since the composer was added.

### Three numbers of mine were wrong, and the code said so

- The comment in the mountain ring loop claimed the four rings landed at
  measured luminances of 0.15, 0.25, 0.35 and 0.45. Nobody had measured
  them. Ring 0 was at 0.108 and ring 1 at 0.162, which put ring 0 INSIDE
  the tree canopy band of 0.094 to 0.107: a canopy in front of a mountain
  was a 2.8 percent luminance step, which is no step at all. The comment
  has been corrected to say the numbers are measured, and the colours were
  re-picked and then measured: ring 0 is 0.198 against canopies at 0.129.
- Round 4 claimed the cloud sun term reduction had stopped clouds clipping.
  It had not: a cloud top still measured rgb 255 255 255, luminance 1.000,
  and clouds carried 63 percent of the frame's bright area against the gate
  ring's 32 percent. Two attempts at this were both too small. The cloud
  colour is now scaled to 0.68 and the peak measures 0.697 against a gate
  ring at 0.826.
- The title scrim was crushing the lower two thirds of the frame to
  luminance 0.010 to 0.013, a fourteen times crush that turned the start
  gate's mint ring olive. Halved.

### The value ladder, measured in .loop/evidence/r5/02-flight.png

    gate ring        0.826
    cloud, peak      0.697
    cloud, body      0.525
    sky              0.375
    grass, ground    0.277
    mountain ring 0  0.198
    tree canopy      0.129
    gate posts       0.086

Seven separated bands with the pilot's target at the top and the objects a
pilot can hit at the bottom, and the two bands that were colliding, ring 0
against canopies, now sit 53 percent apart.

### Evidence

npm run verify in the same turn as this entry: 12 of 13, yaw-coupling the
only red, threshold untouched, git diff of tests/ empty. Console clean on
the capture run. Draw calls unchanged at 237 in the flight view.

### What the round 4 review left open, unfixed

Recorded in .loop/state.json and .loop/HANDOVER.md rather than fixed,
because this session is out of room. The ranked remainder: mountain
silhouettes carry no ink at all because the outline pass fades edges out
from 320 m; the grass ink suppression eats the gate plinth's ground contact
line into dashes, exactly where a pilot judges clearance; a flag cloth
still passes through a tree canopy; rings 2 and 3 never appear in any frame
because the near rings occlude them, so half the aerial perspective palette
is dead code; the mountains are unlit flat colour, which is what makes
their values reliable and also means the largest mass in the frame has no
warm light and no cool shadow; and the gate frame's navy does not band, so
the structure reads as a cutout.

## Low spec loop, round 1 (round 6 overall): measure the hardware contract

The new loop's ten proxy budgets were all unmeasured except draw calls and
triangles, and one of those two was being quoted for the wrong view. This
round built the instrument and published the ledger. No renderer behaviour
was changed.

New: `src/render/budget.js`, reachable as `window.__budget()`. It
instruments one real frame by patching `renderer.setRenderTarget` and
`renderer.render` for its duration, so the pass list, the resolution each
pass ran at, the fragment shader that was bound, and every render target
the frame touched all come from the frame that ran rather than from a
reading of the source. `window.__boot()` reports first frame time and the
worst synchronous frame block; `window.__setCam` parks the camera for a
named view, because the ledger has to be published for a mid course view
and flying there at four frames per second is not a capture.

The full ledger is in `.loop/evidence/r6/ledger.md`. Headline, 1920 by
1080: P1 693 in the worst view against 400, P2 1.92M against 1.20M, P3 4
against 4, P4 14 against 14, P5 291.0 MB against 120 MB, P6 4977 ms
against 1800, P7 21.6 ms against 50, P8 at least three allocations per
frame against zero, P9 one 2048 map, P10 48.8 MB against 48 MB. Six of ten
fail.

### What went wrong, twice, in my own instrument

**The render target walker reported 116 MB when the real figure was 291
MB.** It deduplicated targets on `rt.uuid`, and `WebGLRenderTarget` has no
`uuid`, so every target after the first was skipped as a duplicate of
`undefined`. Rewritten to collect the targets from the binds themselves,
which also catches targets this file has never heard of: the shadow map and
the eleven bloom mips were both being missed by the hand written list.

**The tap counter reported 7 for the outline pass where the true cost is
11.** It counted `texture2D` in the source. Five of the outline's eleven
fetches are one line inside `readDepth`, which `main` calls five times. P4
is a bandwidth budget and bandwidth is paid per fetch, so the counter now
resolves helper functions before counting.

**The twelve azimuth title sweep first reported an identical 306 draw calls
at every azimuth**, which would have been a spectacular finding about
culling if it had been true. `__setCam` is applied by the frame loop, and
the sweep read the budget synchronously without letting a frame run, so all
twelve reads used one camera. With two animation frames between each move
and its read, the true range is 237 to 693. The real no culling finding is
in P2 instead, where the triangle count moves 0.6 percent across the same
orbit that moves draw calls by 2.9x.

All three were caught by the numbers disagreeing with something already
known, which is the argument for publishing the ledger before changing
anything.

`npm run verify`: 12 of 13, `yaw-coupling` the known red, run in the same
turn. `git diff --stat vendor/betaflight` empty. `git diff HEAD -- tests/`
empty.

## Low spec loop, round 2 (round 7 overall): P5, 291.0 MB to 109.8 MB

P5 was the furthest over of the ten budgets, 2.43x, so it went first. The
fix is not one line, because 232.2 MB of the 291.0 MB was `samples: 4` on
the composer target and taking that away leaves the frame with no
antialiasing at all, which is the defect round 5 of the previous loop
existed to fix. So the pass architecture changed with it.

**The prepass now packs normals and depth into one RGBA8 target.** rg is
the view space normal's xy, ba is a linear view depth packed to 16 bits. It
replaces a 32 bit `DepthTexture` plus an RGB normal buffer. Same bytes,
completely different tap count: the edge pass used to make 11 texture
fetches per output pixel, 5 of them through a `readDepth` helper, and it
now makes 6. z is reconstructed as positive from xy, which is what a front
facing surface has in view space, and the two places the shader reads it
both want a magnitude.

That 16 bit linear depth is worth stating on its own terms. It is 4 cm per
code over the whole 0.2 to 2600 m range, uniformly. A 24 bit perspective
buffer has far more precision than that near the camera and far less past a
few hundred metres, which is the wrong way round for the open finding about
mountain silhouettes carrying no ink. Not fixed this round, but the depth
precision that blocked it is gone.

**Antialiasing now comes out of the edge pass, from fetches it already
made.** The depth gradient across a silhouette gives the direction; two
colour taps along it and a 1 2 1 tent resolve it. The ink threshold is
deliberately high, so the coverage threshold is its own and about a
twentieth of it: a silhouette too subtle to ink still gets resolved. Both
ink terms also went from `step` to `smoothstep`, because a binary edge test
draws a binary line and an aliased ink line on an antialiased silhouette is
worse than neither.

**The grade pass absorbed the OutputPass.** It applies the sRGB transfer
itself. The renderer runs with `NoToneMapping`, so the tone mapping half of
an OutputPass was a no operation, and the pass was costing a fourth full
resolution pass and a fourteenth texture tap to apply one curve.

**Bloom's thirteen render targets no longer carry depth buffers.** Every
one is written by a fullscreen quad and none is depth tested; three.js
gives a render target a depth renderbuffer by default. 7.6 MB.

### Measured, 1920 by 1080, four views

    budget                 before      after     ceiling
    P3 full res passes          4          3           4
    P4 taps per pixel          14         10          14
    P5 render target bytes  291.0 MB  109.8 MB     120 MB

P1, P2, P6, P9 and P10 are unchanged, which is expected: nothing about the
scene changed. P1 moved by one call in three views, from removing a pass.

At 1600 by 900 the same build measures 86.0 MB.

### Evidence that the colour did not move

The sRGB transfer being folded into the grade pass is the kind of change
that silently regrades a whole game. Measured on the same patches of the
same view before and after, `.loop/evidence/r6` against `.loop/evidence/r7`,
`1080p/04-midcourse.png`:

    patch      before rgb        after rgb
    sky        183 193 207       183 193 207
    mountain    93 130 114        93 130 114
    cloud      192 196 207       191 196 207

Identical on flat areas to within one code on one channel of one patch.
The grass patches move by one code, which is the antialiasing doing its job
on the noisiest content in the frame.

### Evidence that the antialiasing is real

`scripts/pixels.js` gained a `walk:` mode, which prints single pixel
luminances along a line, because G4 is settled by walking an edge and the
old rectangle mode averages exactly the thing being asked about.

Walking down through the gate crossbar's top edge at x = 1100 in
`1080p/03-startline.png`, sky 0.519 against gate frame 0.024:

    4x multisampling, round 6   0.519  0.422  0.106  0.024
    edge pass resolve, round 7  0.519  0.422  0.202  0.056  0.024

Three intermediate values instead of two. The resolve is slightly softer
than 4x multisampling and it costs 181.2 MB less.

### What went wrong

`renderNormals` has to save and restore the clear colour now, because the
prepass clears to rgba(0, 0, 1, 0), which unpacks to a normal of zero and a
depth of exactly 1. The first version wrote
`renderer.getClearColor(scratch).clone()`, which allocates a `Color` every
frame and is a P8 violation in the same round that P8 was recorded as
failing. Caught by reading the diff before committing rather than by any
check, which is not a system that will keep working.

`npm run verify`: 12 of 13, `yaw-coupling` the known red, run in the same
turn. Console clean, 0 errors and 0 warnings, at both resolutions.

## Low spec loop, round 3 (round 8 overall): the reviewers' list

Two hostile reviewers, a graphics engineer on integrated GPUs and an art
director, both returned REJECT on round 7. Both were right about things
this round fixes, and one was wrong about one thing, recorded below with
the evidence.

### D8, five numbers written down that no measurement supported

The graphics reviewer was asked to look for these and found five. All were
in comments, which is where they do the most damage, because the next
person reads them as fact:

- `post.js` said bloom keeps **thirteen** targets. It keeps **eleven**:
  three at 960x540 and a pair each at 480x270, 240x135, 120x68 and 60x34.
  The 7.6 MB saving quoted beside it was right, because that was measured.
- `scene.js` said the shadow box is **58 m**. `shadowExtent` is 72 and it
  is a half width, so the box is **144 m**, and the texel is 7.0 cm rather
  than the 2.8 cm the comment implied.
- `scene.js` said **46000** blades. There are **184000**; 46000 was the
  count before round 3 of the previous loop quadrupled it.
- `scene.js` said the OutputPass does the colour space conversion. Round 7
  deleted the OutputPass.
- `budget.js` documented itself against a `readDepth` helper and an 11 tap
  outline pass, neither of which survived round 7. The measuring
  instrument's own specification no longer described the thing it measured.

The reviewer also found a sixth thing, which is not a stale comment but a
real defect, so it is now written down where it is: `grass.receiveShadow`
is a no operation. The grass is a `ShaderMaterial` computing its own sun
term, so three.js sets the flag and nothing reads it. Measured: blades
inside a tree's cast shadow are 0.125 against 0.132 outside it, while the
ground under the same shadow is 0.012.

### P5 was not passing. The instrument could not see 16.6 MB of it.

`budget.js` collected render targets from `setRenderTarget` binds, and the
canvas is bound by passing `null`, so **the default framebuffer was never
counted**. Read from the live context rather than assumed, because a
browser hands out buffers nobody asked for: this one was
`{alpha, depth, stencil}` all true, which is 4 bytes of colour plus 4 of
D24S8 over 2,073,600 pixels, **16.6 MB**. Round 7's real P5 was 131.7 MB
against a 120 MB ceiling, not the 109.8 MB it published.

Two more accounting defects in the same file:

- It computed mebibytes and printed them under a megabyte heading, which
  is 4.9 percent lenient at this scale. It now reports bytes and both
  units, so neither reading can be the flattering one by accident.
- `p5_target_bytes_at_1080p` scaled the whole total by pixel area, but the
  shadow map's size is authored and does not scale. A 900p capture
  therefore over reported its 1080p equivalent by 12.8 percent, in the one
  field documented as the way to answer P5 from a 900p capture.

Two structural savings put it back under, and neither removes anything
from the frame:

- The default framebuffer gets `depth: false, stencil: false`. The only
  thing ever drawn into it is the grade pass's fullscreen quad, which is
  neither depth tested nor stencilled. 8.3 MB.
- The composer keeps two full size targets and swaps them, but only one
  ever holds the scene: `RenderPass` draws into the read buffer, and the
  other only ever receives fullscreen quads, which need no depth. 8.3 MB.
  Which target is which depends on the parity of the passes that swap, so
  the parity is counted at build time and the saving is only taken when it
  is even. Getting it wrong would render the world with no depth test every
  other frame.

Measured, 1920 by 1080, all four views: **115.1 MB** decimal, 109.8 MiB,
against 120 MB. The 1600 by 900 capture measures 90.2 MB and derives
115.1 MB for 1080p, which is exactly the direct 1080p figure: the scaling
fix validates itself.

### The antialiasing added in round 7 was a blur. The reviewer was right.

It sampled two colour taps **across** the silhouette, on the reasoning that
mixing the two sides of an edge softens the step. Softening the step is not
removing the staircase. The reviewer measured the sub pixel position at
which a near vertical edge crosses a luminance level, row by row, and
showed round 7 holding still for three rows and then jumping a pixel and a
half, a period four staircase that 4x multisampling did not have.

That measurement is now an instrument rather than a claim:
`scripts/pixels.js` gained a `stair:` mode which reports the sub pixel
crossing per row and the RMS of its second difference. The first difference
is the edge's slope, which is whatever the geometry is; the second
difference is the staircase.

Left gate post silhouette, `1080p/03-startline.png`, 48 rows from y=600,
crossing level 0.35:

    build                              secondDiffRMS   worst
    round 6, 4x multisampling                  0.289   1.17 px
    round 7, two taps across the edge          0.478   1.87 px
    round 8, two taps along the edge           0.288   0.83 px

The taps now go along the silhouette, `vec2(-dir.y, dir.x)`, because a
staircase is a discontinuity along the edge and that is where it has to be
filtered. Round 8 matches multisampling on RMS and beats it on the worst
single step, for 181 MB less. A one sample depth buffer carries no sub
pixel coverage to recover, so this is not equivalent to multisampling in
general; on this metric, on this content, it measures the same.

**The grass half of that finding is only partly fixed, and it is reported
as partly fixed.** Grass writes a sentinel normal, so its reconstructed z
is zero, `facing` clamps to its 0.12 floor and the coverage threshold was
inflated about eightfold on exactly the 184000 sub pixel blades that need
resolving most. The ink term still wants the grazing angle division; the
coverage term no longer gets it. Mean adjacent pixel luminance gradient
over three 400 pixel runs through the near meadow:

    round 6, 4x multisampling   0.04149
    round 7                     0.04608   (+11.1 percent)
    round 8                     0.04519   (+8.9 percent)

Better than round 7, still measurably worse than multisampling. Sub pixel
blades against other sub pixel blades produce depth deltas below any
threshold that does not also blur the whole meadow. This is open, not
closed, and it is the strongest argument still standing for spending bytes
on multisampling instead.

### Where a reviewer was wrong

The graphics reviewer said `setSize` in `post.js` desyncs on a HiDPI
machine, because it passes CSS pixels to `composer.setSize` and device
pixels to `normalTarget.setSize`, and predicted every P5 figure multiplies
by four after the first resize. Read from the Three.js r160 source in the
container's CDN cache: `EffectComposer.setSize(width, height)` stores its
arguments and then multiplies by `this._pixelRatio`, captured from the
renderer at construction, before sizing its targets. It takes CSS pixels by
contract. Both calls are correct and consistent. No change made.

### What did not move, and is next

P1 705 worst view against 400, P2 1,916,515 against 1,200,000, P6 5122 ms
against 1800, P8 unchanged, P10 51.2 MB against 48, P11 still nothing. The
graphics reviewer nailed P2 to the wall with a measurement worth repeating:
pointing the camera at empty sky still submits **1,902,533 triangles**,
99.3 percent of the worst case, for a frame containing sky and two clouds.
Its per draw histogram: grass 552,000 twice, baked scenery 108,916 twice,
terrain 105,800 twice, and 636 of the 698 draws carrying 0.5 percent of the
triangles between them.

All ten G items came back FAIL or CANNOT VERIFY from the art director. The
value ladder analysis for the next round, including a tension between G2
and G3 that may turn out to be a threshold dispute, is in
`.loop/HANDOVER.md`.

### P7 is downgraded from PASS to CANNOT VERIFY

Not because the number moved, but because the reviewer pointed out that
every P7 figure published so far, including round 7's 29.4 ms, was sampled
over about ten frames, and ten frames is not a worst case statistic on any
hardware. This round's captures run 37 and 38 frames and report a shell
side worst of 4 ms and 2 ms. That is still not a worst case statistic, and
the render side remains unmeasurable on a software rasteriser. Recorded as
CANNOT VERIFY rather than carried as a PASS.

`npm run verify`: 12 of 13, `yaw-coupling` the known red, run in the same
turn. `git diff --stat vendor/betaflight` empty, `git diff HEAD -- tests/`
empty, console clean at both resolutions.

## Low spec loop, round 4 (round 9 overall): the value ladder

G1, G2 and G3 are one mechanism and they constrain each other, so they went
together. The art director's measurements were the starting point and were
not re-derived: ridge ring 0 at 560 m measuring 0.195 against fogged ground
at 400 m measuring 0.352, so the further layer was 0.157 DARKER; 21.4
percent of sampled columns with the ridge base within 0.06 of the ground in
front of it and no ink in the gap; one exact colour, rgb(93,130,114), over
14.8 percent of the frame with no light model at all; and the next gate at
0.711 against a cloud at 0.745.

### The arithmetic, which is what decided the design

The constraint chain, all Rec. 709 linear:

- `HORIZON` is 0.781 and it is both the fog colour and the sky's horizon
  band, so any fully fogged terrain reads 0.781.
- `FOG_FAR` was 780, and the terrain is 1700 m across, so every piece of
  ground past 780 m rendered as exactly 0.781. There was no room above it
  for a mountain ladder that also has to stay below the sky.
- The amber gate ring's own colour is 0.691 and the renderer runs with
  `NoToneMapping`.

`FOG_FAR` is now 2200, which puts the terrain's far edge at 850 m at 0.428
and leaves 0.353 of luminance between it and the sky for four ridge rings.

**The first attempt at the light model did not fit, and the failure is
worth recording.** Splitting each ring's value by even 0.03 for a sun side
and a shadow side makes the sun side of one ring and the shadow side of the
next land within 0.035 of each other, and then a reviewer sampling those
two patches measures a ladder that does not climb. There is not enough
luminance range for four lit layers.

So the light model is carried entirely in **hue at equal luminance**: warm
pale green grey facing the sun, cool blue away from it, the same pair
measuring within 0.003 of each other. Value carries distance, hue carries
light, and neither borrows from the other. That is also exactly what this
project's own colour rule already said.

    layer                 target   measured in 04-midcourse
    far ground             0.428   0.272 at the visible strip
    ridge ring 0            0.49   0.492 to 0.502
    ridge ring 1            0.56
    ridge ring 2            0.63   0.548 at the sampled patch
    ridge ring 3            0.70
    sky                    0.781   0.529 at the sampled patch
    cloud peak                     0.642

### The first hue choice was wrong and a frame said so

The first set solved for the target luminances with a sun side at hue 0.13,
which is orange. Rendered, the whole horizon read as **sand dunes**: the
ladder was measurably correct and the world had become a desert. Re-solved
at hue 0.19 to 0.22, a pale green grey, against a blue shadow side, for the
same luminances. Nothing about the numbers changed and everything about the
frame did. Both frames are in `.loop/evidence/r9`.

### The gate glow

`GLOW_LADDER` goes from [0.52, 0.34, 0.20] to [0.95, 0.42, 0.24] and the
next gate's pulse from 0.52 + 0.26 to 0.95 + 0.30. The glow is unfogged,
which is what makes it work at distance: it is the one thing in the frame
whose value does not fall off. It is a tight annulus at the torus radius,
so the band can push into clipping while the ring keeps the hue that says
which gate this is. Round 3 of the previous loop rejected scaling the ring
COLOUR past 1.0 for exactly that reason; this is not that.

Measured, `03-startline.png`, walking down through the mint start ring at
x = 960, which is the next gate in that view and is unambiguous:

    round 7   0.833 0.883 0.834 0.790 ... 0.782 0.757 0.592 0.570 0.552
    round 9   0.893 0.911 0.856 0.811 ... 0.799 0.821 0.904 0.903 0.903

Peak 0.883 to 0.911, and the glow annulus below the ring goes from 0.59 to
0.90. Brightest non gate in that frame: cloud 0.489, sky 0.443. Headroom
0.422 against the required 0.08.

### What I could NOT verify, and am not claiming

**G3 in the mid course view is not settled.** I measured a gate ring there
at 0.696 against a cloud at 0.642, which is 0.054 of headroom against a
required 0.08, and then realised I could not prove the gate I measured was
the NEXT gate. The camera is parked at u = 0.30 while the race's next gate
is still gate 1, so the amber ring in frame is some later gate glowing at
0.42 or 0.24 of the ladder, not the target. The art director's 0.711 may
have made the same conflation. Settling G3 properly needs the harness to
report `window.__race.next` and its screen position with the capture, which
is a harness change and not this round's item. Recorded as still FAIL.

My first patch for the gate ring in that frame measured 0.505 and was
sitting on a mountain, which is the frame specific coordinate trap the
handover warns about. Caught by the rgb triple not being amber.

### What did not move

P1 705, P2 1,916,515, P6, P8, P10 51.2 MB, P11. P3 3, P4 10, P5 115.1 MB,
P9 all still pass. The ridge cones now carry a colour attribute, which adds
to P10, and the measured figure did not change to one decimal place because
136 cones of 10 triangles is small against 184,000 blades.

`npm run verify`: 12 of 13, `yaw-coupling` the known red, run in the same
turn. Console clean at both resolutions, 0 errors and 0 warnings.

## Round 10 (low spec loop round 5): the two missing instruments

The loop that starts here wants three things at once: a world that reads as
a commercial product on an integrated GPU, a mix somebody would choose to
wear headphones for, and a real MultiGP course at real MultiGP dimensions.
Two of those three had no instrument at all, so round one is not a feature.

### What was built

`scripts/audio-probe.js` and `scripts/audio-probe.html`. The probe launches
headless Chromium, imports `src/render/audio.js` into a blank same origin
page, builds that exact graph on an `OfflineAudioContext`, drives it through
the real `update()` from a scripted RPM and airspeed trace, renders it to
samples, pulls them back into Node in 1 MiB chunks, and reports peak sample,
count of samples at or over full scale, RMS in dBFS, true peak in dBTP at
four times oversampling, one third octave band energies, arbitrary band
energies, spectral centroid, per channel peak frequencies to sub bin
precision, amplitude modulation depth at a named frequency in each channel
and in the mono sum, tempo by autocorrelation of spectral flux, and the
sample delta at a named loop seam against the distribution inside the loop.

`src/render/audio.js` grew the seam that makes that possible: `attach(ctx)`
builds the graph on any `BaseAudioContext`, `update(rpm, speed, atTime)`
takes the time to schedule at, and every node created is pushed onto a list
so `nodeCount()` is counted where the nodes are made rather than derived by
reading the file later, which is what P12 asks for.

`scripts/shots.js` now writes a JSON sidecar beside every PNG recording
which gate the race actually wants, its scene index and number plate, its
distance, its screen position in CSS pixels, how many pixels its aperture
subtends, and whether it is on screen at all. `main.js` gained
`window.__nextGate()`, `window.__quadScreen()`, `window.__setRaceNext()` and
`window.__audio`, and `__boot()` gained `worstAudioMs` for P13.

`gate()` in `scene.js` now returns its aperture read back out of the torus
geometry's own parameters instead of restating it as a constant, so T1's
assertion later will be an assertion about geometry rather than about a
number somebody typed twice.

### What the instruments found

The full ledger, the audio spectra and the calibration of both instruments
are in `.loop/evidence/r10/ledger.md`. The three findings that change what
the next rounds do:

**The G3 harness gap was real and it was worse than suspected.** The mid
course capture pointed the camera along `+tangent`, which is the opposite of
the direction the craft flies, so the race's next gate was 126.3 m BEHIND
the camera and off screen. Every G3 measurement ever taken in that view was
measuring some other gate that the glow ladder happened to light. The run
now has a `mid course forward` view that looks the way the pilot flies and
sets the race's next gate to the gate genuinely ahead.

**The mix is 34.0 dB the wrong way on A1.** Over a 20 second full throttle
render the 2 kHz to 8 kHz band measures -30.75 dB and the band containing
the blade pass fundamental, 355 to 447 Hz, measures -52.76 dB. A1 wants the
scream band at least 12 dB BELOW the fundamental's. The peak of the whole
spectrum is the 1259 Hz third octave band at -24.99 dB, which is exactly
where `RPM_TO_HZ_SCALE = 2.9` puts the oscillator: 8589 / 60 x 3 x 2.9 =
1245 Hz. A2 asks for the fundamental to be the blade pass frequency, and it
is 2.9 times it by construction. The defect statement of record, "loud
screaming", is confirmed with a spectrum.

**The UTT layout is not blocked.** The previous loop expected the diagram
PDFs to be unreadable here and expected T4 to be satisfied by labelling the
course an original layout. `curl` downloads the guide, and the layout page is
a raster image inside the PDF's own image XObjects, which this repository's
own PNG decoder can measure. UTT 3 Bessel Run's complete layout, its five
gate positions in metres, its gate orientations, its field size, its
traversal sequence and its "no flags allowed" rule are in
`.loop/evidence/r10/utt3-layout.md` with every figure's provenance. The PDF
is deliberately not vendored: it is MultiGP artwork under an unstated
licence and D5 forbids adding an external asset without a justification, and
the build needs the dimensions rather than the file.

### What went wrong

Three things, all worth writing down.

The first version of the ledger run measured P13 at 0.40 ms with the audio
context still null, because nothing in a headless run supplies the user
gesture browsers require before audio starts. `update()` returns immediately
on a null context, so the instrument was reporting the cost of an early
return as though it were the cost of scheduling. The run now clicks the page
and asserts `__audio.ctx.state === 'running'` before any capture, and the
number happens to be the same, which is luck and not vindication.

The `07-inflight` capture is mislabelled and has been left in the evidence
with an explanation rather than deleted. `down:KeyW wait:900 up:KeyW` raises
the throttle only while the key is held, and at 1.9 frames per second about
two frames of key handling happen in 900 ms, so the craft never launched and
the frame is the start line again. Deleting a capture that did not do what
its name says is how a capture set starts lying.

`window.__quadScreen()` returns a null 250 mm span and a 1541 px box in
flight, and both are correct: the camera sits inside the airframe at 0 m,
in front of the 0.2 m near plane. T6 has to be measured from a parked
external camera. What the handle did establish is the first measured figure
this project has for the size of its own quad: the model's world bounding
box is 0.309 by 0.110 by 0.308 m.

### npm run verify, this turn

| #  | check                  | measured                                           | result |
|----|------------------------|----------------------------------------------------|--------|
| 1  | build-clean            | build exit 0, vendor diff empty, abi 1, init OK    | PASS   |
| 2  | determinism-repeat     | a=000931016224 b=000931016224                      | PASS   |
| 3  | determinism-cross-host | node=000931016224 chrome=000931016224              | PASS   |
| 4  | frame-independence     | 1 distinct hash across 4 rates                     | PASS   |
| 5  | hover-throttle         | 0.2051                                             | PASS   |
| 6  | punch-out              | 82.3 m                                             | PASS   |
| 7  | terminal-velocity      | 31.4 m/s                                           | PASS   |
| 8  | motor-step-response    | 18 ms                                              | PASS   |
| 9  | rate-tracking          | 669.7 deg/s vs 670 configured                      | PASS   |
| 10 | yaw-coupling           | 0.00 deg                                           | FAIL   |
| 11 | battery-sag            | 10.13 percent lower                                | PASS   |
| 12 | diff-passthrough       | ratio 1.2544 vs 1.2537 expected                    | PASS   |
| 13 | console-clean          | errors=0 warnings=0 run=ok                         | PASS   |

12 of 13. yaw-coupling is the known red and its threshold has not been
touched.

### Round 10, phase 3: two reviewers, both REJECT, and what they found

A mastering engineer judging the mix from the rendered spectra and a QA
tester paid per defect judging the instruments. Neither was given any
description of what was built, both were told not to edit anything, and
`git status` after both confirms neither did. Both returned REJECT.

They found **two numbers in the round 10 ledger that no artefact backs**, and
both are D8 breaches by this round's own author:

- `glow 0.99` for the mid course forward view came from the terminal output of
  a discarded first run, while the committed sidecar says 1.0657. Withdrawn,
  and the field is renamed `glowGainSampled` because a quantity that pulses on
  the wall clock is not a property of a gate.
- `53.6 ms over 50 frames` for P7 was really measured, in that same discarded
  run, so there is no log or JSON behind it anywhere. Withdrawn. P7's verdict
  does not depend on it and does not change.

They also found that **A3 was published from the wrong trace at the wrong
level**, twice flattering. A3 names a normal flight render; the figure came
from the full throttle trace. And the probe defaulted to a mix level of 0.5
while the shell runs at 0.6, so every loudness figure was 1.58 dB below what a
player hears. Re-measured at the shell's own level on the trace A3 names: RMS
**-30.38 dBFS**, which is 10.38 dB below the band, not the 3.9 dB claimed.

And they found that **the ledger asserted something physically false**: "a
monaural beat shows in the mono sum, a binaural one does not". Two carriers a
few Hz apart summed to mono ARE an amplitude modulation at their difference
frequency. A reviewer proved it on a synthesised 200 and 206 Hz pair: each
channel alone reads -63.7 dB at 6 Hz, the mono sum reads -3.63 dB at a depth
of 0.659. A4's own last clause carries the same error, so A4 is recorded as
BLOCKED WITH ARGUMENT in `.loop/threshold-disputes.md` entry 5 with the
derivation, and every other clause of A4 stands.

Eleven instrument defects were found and fixed this round, all of them live in
the numbers first published. The full list with the measurements behind each
one is in `.loop/evidence/r10/ledger.md` under Corrections. The three that
would have done the most damage:

- **True peak skipped the first and last 16 samples**, so a 0.99 sample near a
  buffer edge reported -19.740 dBTP against a -0.087 dBFS sample peak, a true
  peak below the sample peak, which is impossible. The round 10 renders
  escaped only because the master gain ramps up from silence.
- **The tempo function had no null hypothesis**, returning r = 0.984 on a
  single steady sine and r = 0.823 on white noise while a real 173 BPM
  breakbeat scored 0.349. It also could not tell a true 177 BPM from 175.78,
  which is inside A5's window, so a bed that fails A5 would have passed. It
  now band limits the flux, refines the lag parabolically, and publishes a
  measured shuffled flux null: r = 0.0385 at the 95th percentile over 24
  trials.
- **`aperturePx` had no validity gate** and published 17,988 px for gates
  behind a zenith pointing camera, while a gate 126 m behind read 14.900 px
  against 14.910 for the same gate in front. It refuses now, and the sidecar
  carries camera space depth, `inFront` and `mirrored`.

Two things that were never fixable here and are now written down as blockers:
**A9's byte for byte offline render** does not hold in Chromium, and it is not
this project's code. Two renders of the identical graph inside one page differ
in 293,580 of 576,000 samples by one float32 ULP. Nobody noticed for a whole
round because the probe printed no digest; it prints one now. And **the title
attract view is not reproducible**, because its camera orbits on the wall
clock: 705, 700 and 701 draw calls across three runs. The headline for P1 and
P2 moves to `title worst azimuth`, which is parked and returns 692 and
1,916,379 for every party in every run.

Five files were deleted from the repository that should never have been in it:
four scratch screenshots and a bisect frame under `tmp/`, committed by an
earlier session because both harness scripts pasted an absolute output path
onto the repository root. Fixed with `isAbsolute` in both.

The reviewer ranked the gate opening first by cost to the player: `scene.js`
builds a 3.500 m clear span, `race.js` scores on an effective 3.30 m computed
from the centreline radius while ignoring the tube, so a craft can be credited
with a clean pass while its body overlaps the ring, and `src/game/track.js`
says the MultiGP standard gate is 1.524 m. That is next round's first item and
it was already first in the handover.

## Round 11: a solid world, regulation obstacles, and a mix that stopped screaming

Driven by a direct request from the owner: fix the collisions on gates, ground
and trees, make a safe landing possible while a crash stays a crash, mute the
motor noise, add the missing lofi drum and bass bed, and add triple stack gate
towers and dive towers. Full evidence in `.loop/evidence/r11/ledger.md`.

### What was built

`src/game/collide.js`, new. One primitive, a capsule, and an EXACT swept test:
a sphere swept along the frame's travel intersects a capsule exactly when the
two segments' closest distance is at most the sum of the radii, which is closed
form. The first design sampled the travel at 0.1 m steps and needed a cap on
the sample count; that cap would have been a tunnelling bug on any machine
slower than the cap assumed, and this container moves the craft metres per
frame, so it would have been wrong here first. A uniform 8 m grid broadphases
it and the query allocates nothing.

1777 colliders, recorded where the geometry is built because the baker merges
every instance into one anonymous buffer: 30 gate frame members, 40 obstacle
panels and feet, 305 tree trunks, 1220 canopy blobs, 95 rocks, 15 cliff tiers,
72 flag poles. Nothing in the scenery loop consumes an extra `rng()` value,
because one extra draw would have regenerated the whole valley.

`gate()` is gone and `obstacle()` replaces it, importing `OBSTACLES` and
`FRAME_TUBE_OD` from `src/game/track.js` so no dimension is typed twice. Square
regulation opening, PVC tube frame, mesh side panels, a top panel carrying the
gate number as a 3 by 5 dot matrix numeral. Five obstacle types on the course:
the timing gate, standard gates, a 5x5 tower, two LADDERS which are the triple
stacks the owner asked for, a DIVE GATE at a 4.572 m sill which is the dive
tower, and a championship 7x6.

The aperture is measured out of the built geometry at runtime and a load time
assertion throws if any opening differs from its published figure by more than
10 mm. It measures 1.524 by 1.524 m, which is the MultiGP standard gate exactly.

`src/render/music.js`, new: a generated lofi drum and bass bed at 174 BPM,
pooled voices, a lookahead scheduler ticked from `update()` so the probe
exercises it, and a pattern, wow period and noise buffer all cut to exactly
one four bar loop so the bed is sample periodic.

`src/render/audio.js` rebuilt around the TRUE blade pass frequency.
`RPM_TO_HZ_SCALE = 2.9` is deleted, the square partial is gone, and two
cascaded lowpasses cap the motor at 1150 Hz.

### The numbers that matter

    A1 scream margin      -22.01 dB  ->  +21.09 dB     bar is +12
    spectral centroid       1909 Hz  ->     606 Hz
    A3 flight RMS         -30.38 dBFS -> -18.48 dBFS   band is -20 to -14
    A3 true peak                        -5.84 dBTP     needs below -1
    A5 tempo                            173.73 BPM     band is 170 to 176
                                        r 0.3641 against a null p95 of 0.0241
    A6 seam delta                       5.537e-7 at the 5.03rd percentile
                                        of the interior deltas, median 1.355e-5
    A7 duck                             6.65 dB gate, 6.78 dB crash
    A4 carriers                         220.000 and 226.000 Hz, difference 6.000
    A11 motor stem 0.2 vs 1.0           10.88 dB measured difference
    P1 draw calls              692  ->  321            ceiling 400, PASS
    P12 audio nodes                     52             ceiling 64
    meshes                     317  ->  141

Landing and crashing, both verified in the real page by reading
`window.__craftState()`:

    1.2730 m/s arrival, 0 deg tilt   ->  landed, resting at 0.075 m
    13.9154 m/s arrival              ->  crashed, then reset to the line

### What went wrong

**The regulation gate exposed a scale error nothing else had.** The first
capture after the rebuild showed the gates had vanished: the grass was 0.26 to
0.68 m tall, chosen when a gate was 5 m with its aperture centre 2.5 m up, and
against a 1.524 m opening that is knee deep. Grass is now 0.09 to 0.24 m, the
attract camera came in from 19 m to 9 m, and the lit aperture bar went from
0.045 m to 0.075 m because 0.045 m is 2.4 percent of a regulation opening,
which at 20 m on a 900 px frame is under a pixel. Only a frame said any of
this; every number in the ledger was already correct.

**The bed failed its own tempo bar twice before it passed.** With hats only on
the offbeats and beat three of the bar empty, the onset autocorrelation put its
strongest peak at 117.61 BPM, two thirds of 174, because it had locked onto the
kick's own six and ten step intervals. The 9 ms timing wow also smeared onsets
over three and a half flux frames. A ghost kick on beat three, hat accents on
every beat and 5 ms of wow put a real beat grid in the signal.

**A player on volume ten clipped.** With the soft clip saturating, the render's
true peak in dBTP comes out equal to the master gain in dB, so a master of 1.0
measured +0.01 dBTP. Found by measuring the worst case the interface allows
rather than only the default. `MASTER_CEILING` is 0.85 and the stems carry
1.5 dB more, which puts the worst case at -1.39 dBTP and keeps a normal flight
render inside the band.

**The probe could not see a short window.** The first A7 attempt used a 0.16 s
window, which is 7680 samples, and the fixed 8192 point analysis frame fits
zero frames inside it, so every band came back as -Infinity and the centroid as
0. That looks like silence and is really an instrument that could not see. The
frame is the largest power of two that fits now.

**The three implementation subagents did nothing.** Every tool call they made
was rejected by the harness permission layer with the required parameter
stripped, so `echo hi` failed for them. They reported the blocker and refused
to fabricate results, which is the correct behaviour, and the work was done
inline instead.

### npm run verify, this turn

12 of 13. yaw-coupling is the known red, threshold untouched, and
`git diff HEAD -- tests/` and `git diff --stat vendor/betaflight` are both
empty.

### What is owed

The A2 three throttle sweep against the new graph, and the A7 cue level
advantage in its own band with the adaptive frame. P2, P6, P8, P10 and P11 are
untouched by this round and still fail; P2 is the next item and its cause is
unchanged, one unculled 552,000 triangle grass mesh. And a human still has to
listen: the probe can prove the mix does not scream, does not clip, sits at the
right loudness, runs at 173.73 BPM and is genuinely binaural. It cannot prove
it is pleasant.

## Round 12: the polish round, and a game breaking defect the review found

Four hostile reviewers on the four axes the owner named: flight feel, graphics
and scene furniture, world scale, and sound for concentrating to. Two have
reported so far, the pilot and the audio pair, and both were devastating and
correct. Full findings in `.loop/evidence/r12/`.

### The one that mattered most: YOU COULD NOT TAKE OFF

Introduced by me in round 11 and missed by every measurement I took. The craft
spawned at `SPAWN_ALT` 0.9 m with its motors at zero rpm and physics frozen
until the throttle passed 0.05. The instant a pilot touched the throttle the
integrator unfroze in free air with dead motors, the quad fell 0.71 m and
arrived at **3.415 m/s**, past the 2.0 m/s landing gate, and crashed. Then
`resetCraft` put it back at 0.9 m in mid air and it happened again, forever.
A reviewer measured the whole loop and every throttle setting between the
launch threshold and hover.

The craft now starts landed, on the ground, and the on ground branch that
already existed holds it and already gates liftoff on `TAKEOFF_THROTTLE`.
Verified: `launched true, landed true, descentRate 0` at the line, then
airborne with 0.196 m of clearance under throttle.

Every ledger figure in round 11 was correct and the game was unplayable. That
is the second time this loop that only a human sized test found the thing that
mattered.

### Acted on this round

- **Takeoff trap**, above, plus both reset paths.
- **Stale judgement state.** `__craftState()` reported a 2.8 m/s arrival on a
  craft sitting calmly on the line, because `lastDescent` survived a reset.
  Cleared with the rest of the run state.
- **A graze is no longer a crash.** Every contact at any speed was a full crash
  with a 1.4 s lockout and a void lap, which is harsher than the physics and
  harsher than the MultiGP rulebook. `Colliders.hit` now reports the contact
  normal, the shell multiplies it by the craft's speed, and below
  `GRAZE_SPEED_MAX` of 4.0 m/s a touch on a gate frame, its furniture or a flag
  pole costs the lap and nothing else. Trees, rocks and cliffs stay solid at
  any speed.
- **The gate was invisible at commit range.** A pilot measured the lit aperture
  bar at 1.4 px at 20 m and 0.9 px at 30 m, and the target reading as a 23 px
  tick dimmer than the flags and trees beside it. The bar went 0.075 to 0.16 m,
  which is 3 px at 20 m. Stated cost: at 7 m it covers 10 percent of the
  opening instead of 5.
- **The keyboard was bang bang below 10 frames per second.** The stick rates
  are per second and a frame is clamped to 100 ms, so the smallest possible
  keypress moved the stick 0.9 of full deflection, worth more than a metre of
  cross track against a 0.572 m budget. A per frame step cap of 0.18 changes
  nothing at 60 fps and makes a slow machine merely coarse.
- **The out of sequence rule is enforced.** `track.js` quoted MultiGP verbatim,
  "If any obstacle is entered out of sequence or direction at any time the run
  is invalid", and `race.js` did not implement it. It does now, sharing one
  crossing test with the scoring path so the two cannot disagree.
- **The launch banner was drawn over the target.** Moved from 38 to 22 percent
  of frame height, and its wording no longer says "mint ring" for a square gate
  or "launch" for a craft already on the ground.

### The audio, rebuilt against measurement

- **The bed was not music.** 97.5 percent of its energy was below 120 Hz, the
  snare and hats measured 31 to 43 dB under the bass so there was no groove to
  hear, there was no harmonic instrument at all, and the loop was 5.5172 s with
  consecutive loops correlating at r = 0.958 to 0.989. Now: **16 bars, 22.069 s**,
  four varied groups, an eight bar bass phrase of two to three notes a bar
  instead of a one note pedal, **a pad** (three triangles through a lowpass,
  placed 880 Hz to 2 kHz where the flight noise leaves 11 dB of room), the
  break raised and its attacks slowed from 2 to 4 ms to 8 to 12 ms, and the
  snare and hats panned because every bed only render came back mono.
- **A cue was inaudible exactly when it mattered.** A gate cue had 0.13 dB of
  level DISADVANTAGE against its own masking at maximum stems, and a crash
  17.29 dB. The duck was pulling down the music, which was 26 dB below the
  motors and never masked anything. A cue now ducks the **motors and wind**,
  which are what mask it. Measured: gate advantage **+7.61 dB**, from -0.13.
- **The motor was a synth buzz.** A sawtooth through two lowpasses gave
  harmonics at exact integer multiples with the first three within 7.5 dB. Now
  a `createPeriodicWave` with chosen amplitudes and scrambled phases, one
  lowpass instead of two, and slow noise driven detune so the blade pass tone
  wanders.
- **A stationary quad was not quiet.** The oscillator floored at 20 Hz plus an
  idle gain put -21.5 dBFS of subsonic drone under the title screen, louder
  than the whole bed and directly on the bass line. The motor stem now mutes
  below 600 rpm and the bus is highpassed at 60 Hz.
- **The loudness law was squared**, swinging the stem 11.6 dB and delivering
  the flight instrument as volume rather than pitch. Linear now, inside 6.0 dB.
- **The soft clip was hard clipping at shipped defaults**, taking 0.934 dB and
  putting 3.06 dB of distortion into the 2 to 2.5 kHz bands. The flattened
  loudness law took the drive off the clamp: peak sample 0.4842 against a 0.51
  ceiling, where it used to sit exactly on it.
- **The focus tone injected the artefact it exists to avoid.** At a 220 Hz
  carrier it sat inside the blade pass range, and switching it on raised the
  left ear's own monaural modulation at 8.3 Hz by 17.66 dB while being 14.6 dB
  below audibility as a tone. Carrier moved to 1000 Hz. Its UI label went from
  "Focus tone", which names a cognitive effect and is a performance claim by
  implication, to "Binaural tone".

Re-measured after all of it: flight RMS **-16.81 dBFS** in band, true peak
**-6.30 dBTP**, A1 margin **+20.19 dB**, worst case the interface allows
**-1.39 dBTP with zero samples at or over full scale**, **59 audio nodes** of 64.

### Not done, and owed

The plant findings are real and none are addressed: no propwash and a descent
branch that gives **+35 percent thrust** where vortex ring should cost you it,
zero disturbance of any kind so the whole D term filter chain is decorative, a
300 A and 13.5 V punch transient, and yaw-coupling unpassable because the
mixer cancels exactly. Also: **a dropped Betaflight diff is 96 percent silently
discarded**, twenty five keys mapped and everything else returning OK, which
contradicts this project's own premise. All in the handover with file and line.
The art director and scale reviews had not reported when this was written.

## Round 13: the rim halo, and what a quantised rim does to a thin object

The art director review ranked a pale blue band bracketing every ink line
as the single loudest amateur signal in the build, and traced it to
`celmat.js` RIM_CHUNK: `celRim = step(0.5, celRim)` followed by a fixed
`uRimColor 0x9ec8ff` added at strength 0.3 to 0.42.

Measuring it turned out worse than the review said. Camera 1.2 m from
gate 0's near upright, walking across the tube at y=556, before and after
with nothing else changed:

    screen x        794    796..802 (tube face)    803
    before         0.050   0.209 flat over 7 px   0.112
    after          0.037   0.140 flat over 7 px   0.076

The upright is 7 px wide at that range. `step(0.5, celRim)` was true
across its whole visible width, so the rim was not edging the tube, it was
flooding it: every PVC tube in the course rendered as one flat pale value
at 0.209 instead of its own material at 0.140, 49 percent overbright, with
no shading information left in it at all. The mesh panel immediately to
the left reads 0.223 in both frames, which is the control: the change only
reaches fragments near a silhouette.

Two changes, both in RIM_CHUNK:

1. `celRim = celRim * celRim * celRim` instead of `step(0.5, celRim)`. The
   original comment argued that a quantised rim matches the quantised
   diffuse ramp. It does not. The diffuse ramp is quantised across a whole
   surface, where the bands read as light. A rim is a few pixels wide, so
   quantising it produces a flat slab of constant colour with the ink
   outline on one side and the surface on the other, and on anything
   thinner than twice the band there is no surface left.
2. Scale the rim by the luminance of the fragment under it,
   `mix(0.30, 1.0, clamp(lum * 1.7, 0, 1))`. A fixed pale colour at a
   fixed strength is the same absolute lift on a near black craft body as
   on a white gate panel, which is exactly why the craft read worst.

Craft rim strengths also came down, since they were the highest in the
scene and on the darkest materials: body 0.42 to 0.28, canopy 0.4 to 0.28,
arms 0.35 to 0.26, motor bells 0.4 to 0.28.

`npm run verify` 12 of 13, yaw-coupling still the known red (0.00 deg
drift, needs the 1 to 2 degree motor thrust axis tilt in plant.c, not a
lowered threshold). Console errors 0, warnings 0 across every capture in
this round.

## Round 13b: the sun was not a disc, and my own measuring script was wrong

The art director reported the sun disc clipping over about 1.9 percent of
a frame. Aiming a camera straight at it from gate 0 in flight and counting
pixels where all three channels sit at 254 or higher: 10,393 px, 0.72
percent of a 1600 by 900 frame, a flat plateau of pure 1.000 across 130 px
of a horizontal walk.

Two causes, and the second was not the one I expected.

**Both sun terms were added on top of a sky already at 0.59, 0.72, 0.83 at
the sun's altitude.** `pow(sd, 22) * 0.5` reaches 1.0 in every channel by
7.8 degrees off axis on its own, before the disc term adds a further 1.0.
Replaced with a tighter `pow(sd, 40) * 0.30` in a colour that lifts red
and green without pushing the already high blue, and a disc composed by
`mix()` to a 0.985 ceiling with a soft outer ramp. Sky plus glow now stays
under 1.0 everywhere the glow is visible.

**The disc was not a circle.** `vDir` is set to `normalize(position)` in
the vertex shader and never re-normalised in the fragment shader. A
varying interpolates linearly, so inside a triangle of a 40 by 24 dome the
vector is short by up to half a percent, which caps `dot(vDir, sun)` below
the old `step(0.9975, sd)` threshold except where the interpolated length
happens to survive. The disc was a patchwork following the tessellation,
which is why its edge read as an artefact. One `normalize()` in the
fragment shader fixes it, and it is why the first fix attempt produced no
disc at all: the new tighter threshold could never be reached.

Measured, same camera, nothing else changed:

    all channels >= 254      before 10393 px (0.7217 pct)   after 0 px
    horizontal walk peak     before 1.000 flat over 130 px  after 0.889
    disc profile             before plateau                 after symmetric peak

**And a defect in my own instrument.** The first version of the clip
counting script hardcoded a 4 byte stride. These captures are PNG colour
type 2, three bytes per pixel, and `decodePng` in `scripts/pixels.js`
returns `channels` for exactly this reason. The wrong stride shears each
row across 1.33 rows of source, which showed up as a bright region
repeated four times across the frame at a suspiciously clean 400 px pitch.
It reported 7774 clipped px where the truth was 10393. I had already
quoted the wrong number once before catching it. Reading `img.channels`
instead of assuming, as the real tool does, fixes it.

The 3.36 percent of the frame remaining above 250 in any single channel is
the HUD, rgb 120, 250, 174, which is DOM and meant to be legible, plus
cloud tops at about 200. Not the sun.

`npm run verify` 12 of 13, yaw-coupling the known red. Console errors 0,
warnings 0.

## Round 13c: fourteen stations, and a number plate that told the truth

The scale reviewer's finding was 71.2 m per gate against a readable limit
of about 40 m. Two ways to close it, and the obvious one is wrong.

Measured first. The circuit is 569.6 m of arc, walked with `__trackPoint`
at 4000 samples. Its tightest radius of curvature is 11.16 m, at u=0 where
the timing gate stands, which already costs 3.7 g of lateral acceleration
at 20 m/s. Shrinking the curve to put eight gates 40 m apart means scaling
that radius to 4.7 m, or 8.7 g at the same speed, and the course stops
being flyable at racing pace. The user's first polish axis is flight feel,
so a fix that makes the track unflyable is not a fix. More gates on the
same geometry changes the spacing and touches nothing else.

Eight to fourteen. Measured from the spawn frame with `__nextGate` at 1600
by 900, before and after, nothing else changed:

    next gate     before  67.7 m  15.4 px  screen x=364    (436 px off centre)
                  after   46.3 m  17.8 px  screen x=605    (195 px off centre)
    gate after    before  96.1 m           screen x=-1356  OFF FRAME
                  after   74.0 m  16.6 px  screen x=243    in frame

The aperture gain is modest. The real gain is the second row: at eight
stations exactly one gate was ever on screen, near the edge, so the pilot
could not see which way the course turned until committed. At fourteen,
two are readable at once.

Even spacing is now correct without hand tuning. At eight, stations 2 and 6
landed exactly on the figure eight's crossover at the origin, where each
one's posts stood in the other branch's racing line, so `gateU` carried two
shifted values. Fourteen divides so the nearest stations to the crossover
sit at u=0.2143 and u=0.2857, 20.3 m of clear air either side, so `gateU`
is now just `i / gateCount`.

Station kinds re-authored to fourteen: one timing gate, six standard, two
championship, two triple stack ladders, two 5 ft towers, one dive gate.
Flown, that is a ground level opening between each elevated one, and never
two tall obstacles back to back except the dive into the championship gate,
where the drop is the point.

**A lie on the number plate, found by raising the count.** The numeral was
`DIGITS[index % 10]`, which is right for one digit and paints fiction for
two: gate 13 came out as a 3 and gate 10 as a 0, so two different gates
would carry the same plate and a pilot counting down would be reading
nonsense. The plate now renders as many glyphs as the number needs, three
columns each with a one column gap, centred. Verified in frame: station 1
reads 13.

Costs: colliders 1777 to 1826, triangles 1,915,103 to 1,921,441, draw calls
unchanged in the P1 view. P2 was already failing and is not materially
worse.

`npm run verify` 12 of 13, yaw-coupling the known red. Console errors 0,
warnings 0 across all six captures in this round.

## Round 13d: the mountain ladder was measured against anchors that do not exist

The art director asked for RIDGE_SUN and RIDGE_SHADE re-authored upward
and FOG_FAR shortened. Measuring the frame first turned the first half of
that on its head and killed the second half outright.

Sampled off a capture at gate station 1, 1600 by 900:

    sky behind the ridge band     0.487   (comment claimed 0.781)
    ridge ring 0, sun side        0.488
    ridge ring 0, shade side      0.500
    two other ridge samples       0.500, 0.533
    terrain far edge              0.192   (comment claimed 0.428)

The authored ladder was 0.483, 0.561, 0.628, 0.698, and those numbers are
correct as authored: an unlit MeshBasicMaterial round trips its hex, and
ring 0 authored at 0.483 sampled at 0.488. The problem is both ANCHORS the
ladder was built against were derived rather than measured. The sky's
0.781 comes from the authored HORIZON colour and the ground's 0.428 from
the fog equation, and neither value reaches the screen: measured they are
0.487 and 0.192. So the ladder climbed straight past its own ceiling.
Rings 1, 2 and 3 rendered BRIGHTER than the sky behind them, which is why
a range 1330 m out stood out harder than one at 560 m, and ring 0 matched
the sky to one thousandth, which is why the nearest range was invisible.
Re-authoring UPWARD would have made it worse.

Solved against the anchors as measured, with a small search over 8 bit
triples for an exact luminance at a given tint:

    terrain far edge  0.192  measured
    ring 0 at  560 m  0.250  0x878d63 sun  0x788aa6 shade
    ring 1 at  830 m  0.310  0x959a76 sun  0x8998b0 shade
    ring 2 at 1080 m  0.370  0xa2a689 sun  0x99a5b8 shade
    ring 3 at 1330 m  0.430  0xaeb19a sun  0xa6b0bf shade
    sky at the band   0.554 to 0.627  measured

Steps of 0.058, 0.060, 0.060, 0.060, then 0.124 of headroom to the sky.
Sun and shade stay within 0.004 of each other inside a ring, so the light
model still lives entirely in hue and the value still carries only
distance. Tints narrow as the rungs climb because haze desaturates what it
covers, so the far range is nearly neutral while the near one still reads
sand against slate.

Re-measured after: every ridge sample now falls between 0.255 and 0.348,
below the sky at 0.554 and above the terrain at 0.188. The range recedes
INTO the sky instead of out of it.

**And FOG_FAR stays at 2200, against the review, on the ladder's own
arithmetic.** Shortening it raises the terrain's far edge, and the ladder
now pins the ceiling on that: with ring 0 at 0.250 the terrain has to stay
below about 0.22 or the nearest range loses its separation from the ground
in front of it. The terrain currently runs 0.115 near to 0.188 far, which
is a 1.63 times ratio across 850 m, so there IS aerial perspective on the
ground, just less than the reviewer wanted. Buying more of it costs the
mountain ladder, and the mountain ladder was the louder defect. No
threshold moved either way; this is a design constraint, recorded so the
next round does not spend the same argument twice.

`npm run verify` 12 of 13, yaw-coupling the known red. Console errors 0,
warnings 0.

## Round 13e: the first audio assertion in tests/

The audio reviewer's standing finding was that `tests/` contains zero audio
assertions. Chasing it produced a scare and then a real gap.

**The scare.** Driving the shell into flight with
`__ui.onAction('fly', ...)` and reading the live graph reported
`ctx: "none"`, the music graph unattached, and the scheduler at step 0.
Read literally that is the user's complaint exactly, no audio at all. It is
not: the shell wakes audio from `input.onKey` and from a window
`pointerdown` listener, and a programmatic call goes through neither. Tapped
with a real key over the DevTools protocol instead: context running, music
attached, gain 0.200, scheduler at step 38 by t=3.57 s. The bed works, and
`window.addEventListener('pointerdown', wakeAudio)` at main.js:418 means a
player who clicks FLY with a mouse gets it too.

**The real gap.** Everything above was found by hand, and so was every
spectral claim in this project: `scripts/audio-probe.js` calls
`MotorAudio.attach` on its OWN OfflineAudioContext. That is what makes the
numbers reproducible, and it also means the shell could stop building a
graph entirely and all thirteen checks would still pass. So check 14,
`audio-bed`, drives the real page with a real gesture and asserts the
context is running, the four motor voices and the music graph are attached,
the music bus is above zero at DEFAULT settings, the scheduler advances, and
the node count is inside the 64 budget. Measured: ctx running, music gain
0.200, 49 steps in 4.01 s, 59 nodes.

**Two false readings caught on the way, both mine.** First window: 23 steps
in 1500 ms, which I nearly wrote down as a tempo. It implies 230 BPM on a
174 BPM bed, because the scheduler runs a lookahead and the first window
counts the lookahead filling as well as playback. Settled, a 4 s window gave
46 steps, 11.49 per second, 172.4 BPM implied. So the check now settles
1.5 s before taking its baseline. Second: even settled, consecutive 4 s
windows gave 46 and 49 steps, 172 and 183 BPM implied, because the scheduler
advances in chunks. The row therefore publishes steps per second and NOT a
BPM figure. This counter cannot resolve tempo, and the threshold note says
so; tempo stays with the probe.

**Re-measured against the current graph**, which was the reviewer's other
owed item, since the earlier numbers predate the 16 bar loop:

    flight bed, level 0.6      RMS -17.01 dBFS   true peak -6.33 dBTP
    peak sample 0.4827, samples at or over full scale: 0
    A1 fundamental 178-224 Hz  -28.06 dB
    A1 scream 2000-8000 Hz     -49.69 dB
    A1 margin                  21.62 dB   (needs at least 12)
    equal bandwidth margin     31.23 dB
    music alone, level 5       RMS -22.56 dBFS
    music tempo                173.64 BPM  r=0.4480  null p95 r=0.0378
    metre alias at 2/3         116.26 BPM  r=0.3823
    loop seam at 22.06897 s    delta 9.145e-4, percentile 14.36 of the
                               signal's own frame to frame deltas

The metre ambiguity the reviewer flagged has widened in the right
direction: 174 now beats its 2/3 alias by r=0.066 where it previously beat
it by 0.010. The seam sits at the 14th percentile of ordinary frame to frame
change, so the loop point is quieter than 86 percent of the music around it.

The music stem is 5.55 dB below the flight bed, which is what a bed under an
instrument should be, and the full mix with music in is bit identical to the
mix without it at every aggregate the probe prints to four decimals. That is
worth stating plainly rather than hiding: at the default levels the music is
present and measurable on its own, and it does not move the mix's RMS, peak
or third octave profile. Whether that is subordinate enough or too
subordinate is a judgement the next round should make with ears, not with
this table.

`npm run verify` 13 of 14, yaw-coupling the known red.
