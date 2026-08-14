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

## Round 14: P10 passes for the first time, and a lake whose shoreline was the land's fault

Three of the owed findings closed, one partly, two not started. A session
limit killed five of six agents mid run, so what follows is split between
work that landed with its own measurements and work I had to verify myself
because every reviewer died.

### P10, the attribute byte budget, PASSES

    p10_attribute_MB   51.7 before, 42.8 after, against a 48 MB budget

The grass colour attribute was three 32 bit floats per vertex for values that
only ever span a byte's worth of range. Normalised unsigned bytes give the
same colours for a quarter of the bytes. This is the first time P10 has
passed.

And the point of doing it first was to buy room for the thing it gated:

### Grass ground cover

Raised, and P10 went DOWN while cover went UP, which is the whole reason the
attribute fix had to come first. The near field now reads as a grass field
rather than the scattered specks the scale reviewer measured at 14.5 percent.
Triangles 1,921,441 to 1,929,853, so the density cost 8,412 triangles, not a
new order of magnitude.

### The geometry prepass mask, with two refusals I am keeping

30 meshes now write sentinel depth into the prepass: 14 gate rings, 14 halos,
the lake and the flower field. Measured on the ring's inner edge with
pixels.js stair, which is the only measurement that can tell a resolve from a
blur:

    second difference RMS   0.383 px before, 0.192 / 0.217 / 0.189 after
    worst step              1.57 px before,  0.52 / 0.77 / 0.52 after

For scale, this project has previously measured 4x multisampling at 0.288 to
0.304, so the gate target now resolves better than 4x MSAA did. Cost is 8 draw
calls and 5,560 triangles; P3, P4 and P5 do not move.

Two parts of that finding were REFUSED on measurement, and both refusals are
better than the finding:

- **The sky stays OUT of the prepass.** The skyline already gets coverage, and
  it gets it BECAUSE the sky is absent: the prepass clears to depth 1.0, so a
  ridge at 0.3 sits against a 0.7 step and coverage saturates. Measured on 118
  consecutive rows of a ridge at 0.657 px of slope per row, the skyline is at
  0.215 RMS and 0.46 px worst. Forcing the dome in anyway, through a back
  sided sentinel because the override material is FrontSide and the dome is
  BackSide, took those same rows to 0.567 RMS and 1.45 px worst, a 2.6 times
  regression, and introduced a period two zigzag in the crossing. The dome's
  depth at 1500 m in a 0.2 to 2600 m range is 0.577, which SHRINKS the ridge
  step it was supposed to help.
- **The gate glow stays out too.** It is a 3.96 m square, DoubleSide,
  additive, depthWrite false, coplanar with the frame, and its shader is zero
  at its own border, so it has no silhouette for coverage to resolve. Forced
  in on all 14, the ring's inner edge went back to 0.311 RMS, undoing most of
  the fix it was meant to extend.

Ink on the skyline is still NOT fixed, and it is not a mask problem: the
prepass clears to rg (0,0), which is the exact code the grass sentinel writes,
so the ink pass's grass test suppresses ink for one texel around every
skyline. Fixing it means re-encoding the geo target and changing the grass
test, which is its own review.

### The lake: the shader was right and the LAND was the circle

`water()` is rewritten. Depth is now `LAKE.level - height(x, z)` sampled per
vertex on a 48 by 160 disc, so the shoreline is where the water column reaches
zero and the foam follows it; there is a sun term, a Blinn specular, and a
fresnel weighted sky reflection that calls the SAME `celSkyColor` the dome
calls, refactored into a shared `SKY_GLSL` so a reflection cannot be a
different sky from the one overhead. Trees and rocks inside the basin are
skipped by testing `height(x, z) < LAKE.level + 0.4` rather than by radius,
and without adding or removing a single `rng()` call.

Then I captured it, and it was still a perfect ellipse. Two of my own findings
on top of the agent's work:

**The basin was radially symmetric.** `makeHeightField` carved the bowl as a
pure function of distance from the lake centre, so its water line is a circle
BY CONSTRUCTION and no amount of correctness in the shader can produce a bay.
The bowl's depth profile is now perturbed by value noise at a 118 m feature
size, weighted by k(1-k)*4 so it vanishes at the rim (the basin still joins
the meadow smoothly) and at the centre (the deepest point stays put) and peaks
at k = 0.5, which is where the water line sits for a meadow at 0 and a level
of -7.5. From plan view the beach band now varies in width right round the
perimeter, which is the actual proof that the shore follows the land.

**The swell was too strong, and it was not aliasing.** The frame read as
corduroy from a high oblique. The `fwidth` attenuation is real and correctly
written, and that is exactly why it was doing nothing: from 150 m the three
trains run about 105 px per wave, so fwidth is 0.06 rad per pixel and k1 to k3
all sit at 1.0. The pattern was the swell at its true scale, with a 9 degree
surface tilt modulating the fresnel term hard. Slope multiplier 4.5 to 2.4,
about 5 degrees. Measured on the same 22 sample walk across the lake:

    swell contrast span   0.120 before, 0.062 after

### Not started

The plant findings, all of them, and they are the ones that matter most for
flight feel: propwash, the descent thrust that has the wrong sign, the absent
gyro disturbance that leaves the whole D term chain decorative, the 300 A
punch transient, and yaw-coupling, which is still the one red check at 0.00
deg. The agent that owned `src/native/plant.c` died at the session limit
before making a single edit; the file is untouched.

Worth recording because it cost me a wrong conclusion first: I tested whether
the WASM toolchain was even live by appending an unexported function to
plant.c and rebuilding, got a byte identical binary, and wrote down that the
compiler was dead. It is not. An uncalled, unexported function is exactly what
dead code elimination strips. Changing `.mass_kg` from 0.65 to 0.66 changed the
binary and changing it back restored the identical sha256, so emcc 3.1.61 is
live via /opt/emsdk/emsdk_env.sh and the build is bit reproducible. The plant
work is possible; it simply has not been done.

`npm run verify` 13 of 14. Determinism checks 2, 3 and 4 all still identical
at 000931016224, which matters because this round touched the height field and
nothing in the physics.

## Round 15: a second map, a scale check, an honest loading screen, and a plant that was handing out thrust in a dive

Four deliverables and the owed plant findings. Everything below is measured;
where a number came out different from the design that predicted it, the
measurement wins and the design is corrected in place.

### The city map, and what the survey got wrong

sakura-crossing is vendored at `src/maps/city/vendored/`, MIT, commit
de01898e89c7f6ab3fad93fa802f0f5ac66fbd81, provenance in `NOTICE`. The file
count is 59 and the design's two figures reconcile: 57 from
`src/world/index.js`, plus `core/post.js` and `core/sky.js` for the ink
pipeline and the sky.

**Two of the design's blockers are wrong, and one of them would have shaped
the whole contact model.**

- **"2,708 colliders are effectively infinitely tall walls with no ceiling
  data, so a quad can be stopped by a 0.2 m signpost at 40 m altitude."**
  Measured: 2,731 colliders, of which **2,708 have no `bottom` and ZERO have
  no `top`**. `top` IS the ceiling. The town's own walker skips any collider
  whose top is at or below its feet, which is how it steps over a kerb, so a
  rectangle with a top and no bottom is a solid box from the ground up to
  `top`. A quad at 40 m flies over a 0.2 m signpost for exactly the same
  reason a walker steps over it. Read the walker's `_resolve` before designing
  around its data.
- **"An unculled floor of about 900 k triangles from meshes whose bounding
  sphere is the planet."** That is a property of the BAKE, which bends every
  mesh onto a 160 m sphere. Skipping the bake, which we do anyway for the
  coordinate reason, gives every mesh a local bounding sphere and frustum
  culling works. The 900 k floor does not exist on the flat path.

The design's determinism findings, its licence reading and its "do not run
bakeToPlanet" graft all held up.

### What it cost, before and after, at 1280 by 720 with a parked camera

    view                          P1 draw calls      P2 triangles
    as built                          16,647           9,957,538
    after merge, chunk and cull        4,935           2,771,739   street
                                       4,080           2,678,471   crossing
                                       6,969           3,336,720   from 70 m up

**P1 still FAILS by 12.3x and P2 by 2.3x, and no threshold was moved.** The
reason P1 cannot be fixed by more of the same is measured: the town has
**3,545 distinct materials, 3,048 of which are used by exactly one mesh**,
because every sign, fascia and price strip carries its own Canvas2D texture.
Merging by material has already taken 18,466 meshes down to 2,180; the floor
under that is the material count, and getting past it means atlasing three
thousand generated textures, which is a rewrite of vendored texture generation
and its own round. Recorded rather than papered over.

What did work, each measured on its own:

- **Spatial material merge**, `src/maps/city/bake.js`. 18,466 static meshes to
  2,180 merged ones. The animated set is MEASURED, not listed by name: the
  town's own update is run across a whole 42.8 s crossing cycle and anything
  whose world matrix moved is excluded with its subtree, plus the town's
  `planetRigid` marker for rigs that only move on an interaction.
- **Do not convert to non indexed in order to merge.** The first version did,
  and P10 went from 69.0 to 103.3 MB, because `toNonIndexed` writes every
  shared vertex once per triangle: a box goes from 8 vertices to 36. Bucketing
  by indexedness instead brought it back to 72.2 MB.
- **Instanced chunking.** The triangle mass is the forest, not the buildings:
  `groveCanopy0/1/2` carry 15,616, 10,090 and 7,909 instances of an 80
  triangle blob, which is 2,689,200 triangles in three draw calls. One draw
  call is cheap and one bounding sphere over a whole grove is not: it passes
  every frustum test and submits all 15,616 instances to the colour pass and
  again to the shadow pass. Split per cell above 200 instances, triangles fell
  from 10.06 M to 2.42 M at the same camera.
- **Shadow camera 34 m half width to 22 m.** Measured split at the street
  view: 4,935 calls with shadows, 3,587 without, so the shadow pass is 27
  percent of the frame rather than the half it was.
- **Distance culling** at 145 m, with the fog shortened from the town's own 44
  to 205 m to 45 to 135 m so the cull edge sits inside full fog and nothing
  pops. The town's fog was set for a walker with a 23 m ground horizon.

**Do not quote the attract view for either map.** Its camera orbits on the
wall clock. The first cull radius sweep taken through it produced a curve that
was not monotonic, because every sample was a different azimuth. Park the
camera with `__setCam` and wait on the frame counter, not on a timer:
`__setCam` only takes effect on the next animation frame, and `__budget`
renders directly rather than through the frame loop.

### The shell now has a session and a map, and a gateless map boots

`buildScene` is split. `src/render/shell.js` owns the renderer, the camera and
the airframe for the whole session; a MapInstance owns its scene, post chain,
colliders and contact data and disposes all of it on a swap, so only one map's
render targets exist at a time. `src/render/craft.js` is the airframe, built
once and re-parented.

- `main.js` no longer dereferences `gates[0]`: the spawn and the attract
  framing are the MAP's, because a map knows where its start line is and a
  shell does not.
- `new Race([])` is a real state rather than a crash. One run object for both
  maps, with a `freestyle` flag and guards, rather than a race and a null
  object that have to be kept in step.
- **The shots.js sidecar opt out is a property of the PAGE, not a flag.**
  `__nextGate()` reports `gateless: true` only when the map's gate list is
  empty, and the sidecar accepts that and nothing else. A `--nogate` flag could
  have been passed on the race field by habit or by a copied command line;
  this cannot, so the gate stays exactly as strong there as it was.

### Freestyle HUD, and an altitude that was lying on both maps

No gates, no lap clock, no record, so the display shows what a freestyle pilot
reads: AIRTIME instead of a lap, because freestyle is flown in packs and how
long you have been up is the decision the pack bar is the other half of; and
**altitude above the surface UNDER the craft**, measured through the same
query the collision test uses. The old readout was `st[3] + SPAWN_ALT`, the
height above wherever the run started, which is identical on a flat corridor
and wrong by seven metres the moment you cross the overbridge. That was an
owed finding from round 12 and it is closed for both maps.

### Landing and crashing on roofs and the overbridge deck

Thresholds unchanged: 2.0 m/s descent, 3.0 m/s horizontal, 25 degrees of tilt,
4.0 m/s graze. Measured through `__surface` and `__hit`:

    overbridge deck   x 41.00   z -0.50     deck 7.200    ground 0.000
      surface asked from above   7.200      you land on the deck
      surface asked from below   0.000      you fly under it, on the road
      road up to the deck                   hits 'wall'
    roof              x 34.50   z -128.20   deck 17.307   ground 14.462
      same three, 17.307 / 14.462 / 'wall'

That last row is what `heightAt` cannot express on its own, so every platform
more than 0.6 m above the bare ground gets a thin slab collider whose top sits
2 cm under the deck. Two centimetres, not zero: a craft descending onto a deck
meets the landing judgement at deck + 0.1735 and the slab at deck + 0.1535, so
the judgement wins and the slab only ever catches something arriving from
below.

Colliders: 2,731 town boxes plus 240 platform slabs. **Boxes carry r = 0 and
contribute nothing to `maxR`**, which is load bearing: `hit()` pads every query
by `CRAFT_R + maxR`, and giving a box its half diagonal would have pushed maxR
to the length of the longest wall and made every frame's query scan tens of
metres for nothing. The swept sphere against a box is exact and closed form,
not sampled: the squared distance is piecewise quadratic in the travel
parameter with at most six breakpoints, so it is minimised piece by piece. The
obvious shortcut, testing against the box grown by CRAFT_R, is wrong at a
corner by up to `(sqrt(3) - 1) * 0.1735 = 0.127 m`, and is used only as a
rejection test, where overstating is safe.

### The crossing is a closed form now

The town's level crossing booms are colliders whose top toggles when an arm
sequence integrating raw `dt` crosses 0.55, driven by a train position that is
itself `x = wrap(x + speed * dt)`.

The design quoted a drift for that accumulation and warned that it contained
fabricated numbers, so it was re-measured. Ten seconds of simulated time on the
town's own rule:

    dt 1/50    234.999999999999488       dt 1/144   235.000000000007219
    dt 1/60    235.000000000003382       dt 1/240   234.999999999994401
    dt 1/120   234.999999999997897       exact      235.000000000000000

A spread of 1.3e-11 m, where the design reported 1.5e-10. **Neither number is
the argument, and it would be dishonest to pretend otherwise: a hundredth of a
nanometre never moved a boom.** The argument is that the quantity is frame rate
dependent at all, and that the arm threshold is a STEP function sitting on top
of it, so a difference invisible in the position is a binary difference in
whether a barrier is solid at the moment a quad reaches it. `src/maps/city/animation.js` replaces both
with pure functions of the integer fixed step count the shell already keeps:
the train's position, the arm ramp, the lamp blink and the boom collider
extents. During a run that count IS `simTimeMs`, so a collision with a boom is
reproducible from a recorded input stream at any frame rate. The town's own
`update(dt)` still runs, for the traffic, the vending machines, the cat and the
petals, none of which is solid, and everything it computes about the train and
the arms is then overwritten so that what is drawn and what is solid agree.

The two booms are found by assertion, not by index: they are the only two
colliders the town parks below ground AND the last two it pushes, and both
facts are checked, because a barrier a quad flies through is worse than one
that is never there. The boom box is given the ARM's real extent, 1.045 to
1.325 m, read off `railway.js` (pivot at 0.2 + 0.92 + 0.12, section 0.17 tall,
lamps hanging 0.195 below), rather than the walker's ground to 1.25
abstraction. So a quad can take the line under a lowered boom, which is one of
the things this town is worth flying for.

### Two patches to the vendored tree, both recorded

`PATCH-world-index.diff` makes the planet bake optional, with the upstream
behaviour as the default. `PATCH-core-toon.diff` removes `flatShading` from the
`MeshToonMaterial` constructor: measured, `MeshToonMaterial` has no such
property in r160, `Material.setValues` warns and skips, and the town produced
**643 console warnings per build** for a value that has never had any effect in
any version of three. Removing a dead parameter is behaviour preserving;
silencing the warning would not have been. Console is back to 0 errors and 0
warnings.

### Scale, as check 15, and it caught something on its first run

    craft body            0.1550 m
    craft sweep radius    0.1735 m
    collision radius      0.1735 m   against a swept disc of 0.1735 m
    gate opening          1.5240 by 1.5240 m
    grass blade           0.0300 to 0.0900 m
    city kerb             0.1350 m   real 0.10 to 0.20
    city doorway          2.0500 m   real 1.90 to 2.10
    city handrail         1.0600 m   real 0.85 to 1.20
    city crossing boom    1.2400 m   real 1.00 to 1.40

**CRAFT_R was wrong by 8.6 percent.** It was typed as 0.1885, derived in its
own comment from a 250 mm class quad with a motor 0.125 m from the centre. This
airframe is not 250 mm: `plant.c` puts the motors at 0.110 / sqrt(2) per axis,
which is 0.110 m out and a 220 mm machine, and the renderer draws them there.
So every gate on the course was scored against a quad 8.6 percent bigger than
the one on screen, and every collision fired about 15 mm early. It is derived
from the arm and the prop radius now, in one place, and the check asserts it
against the drawn geometry to half a millimetre.

The three city references are measured by three different routes on purpose,
so they cannot agree merely by sharing a constant: the kerb through the town's
own height query, which is the surface the craft lands on; the doorway from the
geometry, which is what is drawn; the handrail from the collider list, which is
what the craft hits.

**The trap the brief names is real and the bands are written around it.** The
town is authored for a 1.7 m eye, so a 1.05 m doorway is four times the craft's
width and that is correct. Every band is a real world size, not a comparison
against the quad.

### The loading screen, and two defects found by capturing it

Stages are named and weighted by measured duration. Field boot, 1280 by 720:

    run 1        three 56.6   sim 24.5   module 24.3    world 2885.8   frame 437.8
    run 2        three 89.4   sim 19.5   module 34.2    world 3042.4   frame 424.9
    city swap                            module 830.4   world 7554.0   frame 2358.7

Under a 1500 kbps throttle with 40 ms of latency, the same boot measured three
90.3, sim 362.3, module 895.3, world 2965.9, frame 391.5, and the city swap
measured module 14,642.3, world 7,646.2, frame 2,186.2. The two fetch stages
grow by an order of magnitude and the two main thread stages do not move, which
is the whole reason they are named separately. Captured on the throttled run,
the screen reads **"MAP, 11 of 61 modules, 1.0 s"**.

**Defect one, found by looking at a capture: the screen was never painted.**
The first screenshot two seconds into a city swap showed the race field with
the title menu over it and no loading screen at all. Building the town is about
eight seconds of synchronous main thread work, and one `requestAnimationFrame`
before it is not enough, because a rAF callback runs BEFORE the paint of the
frame it is scheduled in. Two frames and then a task is the shortest sequence
that gets pixels on screen, and it is `yieldToPaint`.

**Defect two, in the same capture: the screen hid itself.** `finish()` fades out
and then hides the element 320 ms later to match the CSS transition. Choosing a
map from the title screen starts a new load well inside that window, so `run()`
made the screen visible and the stale timeout hid it again. The timer is
cancelled in `run()` now.

**Byte progress on the three.js fetch was built and withdrawn.** Streaming the
module so the bar could report kilobytes assumed the dynamic import a moment
later would be a cache hit. Measured,
`performance.getEntriesByType('resource')` returned TWO entries for
three.module.js. After removing the prefetch it returns one. Paying up to
1.2 MB of a player's connection to animate a progress bar is the wrong trade,
so that stage keeps its name and its elapsed readout and does not pretend to
know how far through it is. `dist/sim.wasm` still streams its bytes because the
shell needs them anyway, and the map graph counts modules off resource timing.

### The city loads only when chosen, and it is measured, as check 16

    city modules requested with the race field selected      0
    city modules requested after choosing the city          63

And the race field's frame is untouched. Measured in a git worktree at c3c6e44
and in this tree, same camera, same resolution:

    c3c6e44   P1 214   P2 1,931,413   P5 69.8 MB   P10 42.8 MB   159 meshes
    now       P1 214   P2 1,931,413   P5 69.8 MB   P10 42.8 MB   159 meshes

Identical, not close. Both maps load through dynamic `import()`; the field is
imported at boot because the title screen has a world behind it.

### The plant. Two findings closed, one refused with its measurement

**Descent thrust had the wrong sign and now does not.** The old branch was
`axial = 1 - va / pitch_speed` clamped at 1.35 for every descent rate, so it
handed the craft more thrust the faster it fell. Measured at a fixed duty of
0.12, thrust to weight against descent rate, before and after:

    descent m/s    1.8     3.2     4.5     6.0     7.5     8.8    10.2
    before        0.468   0.526   0.535   0.534   0.534   0.529   0.525
    after         0.468   0.509   0.474   0.439   0.403   0.368   0.332

Before, thrust rises and then plateaus on the clamp. After, it falls
monotonically past a third of the pitch speed, which is where a real rotor
starts recirculating its own downwash. A deterministic per motor share of that
loss, summing to zero, means the four rotors no longer stall together: the
craft's levelness over the same 2.6 s run went from 0.9933 to 0.9890, so there
is a disturbance where there was none.

**yaw-coupling has a real mechanism for the first time, and it is still red at
-0.06 deg against a 2.0 deg floor. The threshold is not lowered.**

The reason it read exactly 0.00 for this project's whole life is structural,
and the algebra is three lines. In the QUADX mixer the roll column is
(-1, -1, +1, +1), each roll pair holds one clockwise and one counter clockwise
motor, and during a pure roll every quantity a motor experiences depends on m
only through its roll column membership. So the frame's yaw torque is

    sum over m of SPIN[m] * f(roll[m])
      = f(-1) * (SPIN_RR + SPIN_FR) + f(+1) * (SPIN_RL + SPIN_FL)
      = f(-1) * (-1 + 1)            + f(+1) * (1 - 1)             = 0

for ANY f. Not approximately zero. No nonlinearity in thrust, prop drag, the
advance ratio or the battery can produce a yaw from a roll on a symmetric
QUADX, so propwash and inflow asymmetry would not have moved it by a
thousandth of a degree. Neither would the fix the handover proposed: a purely
OUTWARD cant produces a force along r, whose moment about z is identically
zero.

What makes a real quad yaw when you roll it is that it is not symmetric. Each
motor's thrust axis now carries a fixed misalignment: 1.0 deg outward on all
four, which is real arm splay and produces no yaw at all, plus tangential build
tolerance of -0.9, +1.4, +0.6, -1.2 deg. Their sum is -0.1 deg, so hover
carries a slight yaw bias the I term trims out exactly as a real machine does;
their sum against the roll column is -1.1 deg, which is the coupling, and its
sign makes a right roll yaw nose right, matching the check's expected sign.

Measured: -0.06 deg, against 0.00 before. **Reaching the 2.0 deg floor would
need about 44 degrees of column asymmetry**, by direct scaling from 1.1 deg
giving 0.06 deg, and no build tolerance model reaches that. The yaw PID is
doing its job: a well tuned quad does not yaw two degrees during a one second
roll. The floor is recorded in `thresholds.json` as a "Loop A harness choice,
floor that makes 'non-zero' in STAGE1.md check 10 measurable", so it is a
chosen number rather than a measured one, and the argument for revisiting it
belongs here rather than in a diff.

**The 300 A punch transient is REFUSED with a measurement, and the ESC ceiling
the handover prescribed is written into `plant.c` as a comment with its
numbers.** It works: peak pack current 409.8 A to 192.0 A, minimum pack voltage
9.22 V to 17.71 V, which is 2.95 V a cell instead of 1.54. It also takes check
8, the motor step response, from 18 ms to 51 ms, straight out of its 10 to
30 ms band. That is not a tuning problem. The unlimited model's mechanical time
constant is `j R / ke^2 = 6.0e-6 * 0.09 / 0.005026^2 = 21.4 ms`, which is how it
lands in band, and it gets there only by drawing 184 to 280 A per motor for the
whole of the rise. Holding 63 percent of 2736 rad/s inside 30 ms at 48 A would
need `j_rotor` near 2.4e-6 against a real 5 inch triblade plus 2207 bell of
about 9e-6. The band and the current limit cannot both be met by this set of
constants. The honest fix is to re-derive kt, kq, ke, r_motor and j_rotor
together against a real motor, and to re-specify check 8, which reads a small
signal time constant with a zero to full step from rest. That is its own round
with its own review. No threshold moved, and the limit is not quietly dropped.

**Gyro noise, the fourth plant item, is NOT DONE.** The D term chain is still
decorative. It was the fourth of four and the round ran out before it.

### What went wrong on the way

- **`git checkout src/native/plant.c`, to undo a two line measurement hack,
  reverted the whole file** and lost an hour of plant work. Every edit had to
  be re-applied from the scratch scripts that made them. Use a copy or a
  `#define`, and never `git checkout` a file carrying uncommitted work.
- **A one line `eval:` step with a `//` comment in it silently truncated
  everything after the comment**, because shots.js strips newlines. The error
  was "SyntaxError: Unexpected end of input" and it cost two runs.
- **Parsing an eval result by slicing at the first ` = `** cut lines in half
  whenever the expression contained its own assignment. Anchor the match at the
  end of the line.
- **The cull grid's first version walked only `root.children`**, and every one
  of the town's top level groups has a bounding sphere far bigger than a cell,
  so all 151 of them landed in the always drawn list and nothing was ever
  culled. The measurement said so immediately, which is the only reason it did
  not ship.
- **A shell heredoc used to append this section to PROGRESS.md was itself
  mangled**, and left a stray `build/` directory in the repository root. Caught
  by `git status`, which the sharp edges list already says to run after every
  review round; it applies to my own commands too.

### New page handles, all harness only

`__map()`, `__maps()`, `__setMap(id)`, `__mapScene()`, `__cityWorld()`,
`__surface(x, z, fromY)`, `__hit(px, py, pz, qx, qy, qz)`, `__cullRadius(r)`,
`__shadows(on)`, `__stick(roll, pitch, yaw, throttle)` and `__loading`.
`__stick` earns its place: holding W ramps the throttle while held, and a city
frame takes about half a second here, so five seconds of held key is ten frames
of ramp and the craft never reaches the 0.25 takeoff threshold. A capture that
cannot take off cannot assert anything about flight, which is how round 10's
`07-inflight` capture turned out to be a picture of the start line.

`scripts/shots.js` gains `throttle:KBPS`. It reaches everything the local
server answers, which is the map graph, `dist/sim.wasm` and the page, and it
does NOT reach three.js, because the harness fulfils the jsdelivr requests from
a local cache and a fulfilled request never touches the network stack.

### Verify

`npm run verify` 15 of 16, `yaw-coupling` the one red at -0.06 deg. Determinism
hash 5d51dbbe08eb, identical across Node and headless Chrome and across four
frame rates; it moved from 000931016224 because the plant changed, which is
expected and is what checks 2, 3 and 4 exist to police. Two new checks: 15
`world-scale` and 16 `map-isolation`. Console 0 errors and 0 warnings across
every capture in this round.

## Round 15b: what adversarial review found, including a claim of mine that was wrong

Four reviewers over separate dimensions produced 24 claims, each then put to two
independent verifiers asked to refute it. **The review harness itself was
defective and that has to be said first**: the verify stage passed promises to
`parallel()` where it wanted thunks, so every verdict pair threw and the run
reported `confirmed: []`. An empty finding list from a broken harness looks
exactly like a clean bill of health. The journal held the real verdicts and
they were read out of it by hand. Do not trust a review that reports nothing
without checking that it ran.

### The one that invalidated a published claim

**Round 15 said you can fly under the overbridge. You could not.**
`height(x, z, fromY)` offers a platform when its top is within a walker's step,
0.55 m, of `fromY`, and the ground sweep passed the craft's CENTRE. So the
7.20 m deck became eligible from a centre height of 6.65 m, which is a quad
under the bridge with its sphere top still 5 cm clear of the underside, and
`sy - CRAFT_R <= 7.20` is then trivially true. The pilot got a crash into
nothing, or a landing that teleported them onto the deck above.

Measured at x 41.0, z -0.5, deck top 7.20, underside slab 6.95 to 7.18:

    craft y   surface from centre   from bottom   ground contact   collider
      6.30           0.000             0.000          no             none
      6.65           7.200             0.000          no             none
      6.70           7.200             0.000          no             none
      6.78           7.200             0.000          no             wall
      6.83           7.200             7.200          yes            wall
      7.38           7.200             7.200          no             none

The middle column is the old behaviour and the third is the new one. Querying
from `sy - CRAFT_R`, the craft's lowest point, the road stays the surface all
the way up to 6.78 m, where the deck's own underside slab correctly calls it a
crash. Landing on top is unchanged: the ground test still fires at
deck + CRAFT_R, 2 cm before the slab, so the landing judgement wins.
`groundY` is now resolved at the height that TRIPPED contact rather than at the
end of the frame's travel, which at this container's frame rate is a metre
lower and would have resolved a deck landing onto the ballast below it.

### The rest, fixed

- **Every map swap leaked a 2048 by 2048 shadow map.** `disposeSceneGraph`
  walked geometry and materials; a light's `shadow.map` is reachable from
  neither. 33.5 MB per swap, invisible to `__budget` because it belongs to a
  scene nothing traverses any more.
- **And it disposed a texture the session still owns.** Every cel material
  shares one gradient ramp singleton, including the four on the airframe.
  `src/render/session-textures.js` names what a map must not free.
- **A failed map load left the shell frozen forever.** The old world is
  disposed before the new one is built, deliberately, so a rejection had
  nothing to fall back to and `mapReady` stayed false with no message. It now
  fails onto the loading screen with the reason.
- **A map change requested DURING a swap was dropped**, while ui.js had already
  saved it, so the title screen named a map that was not loaded. Honoured when
  the swap completes.
- **The boom colliders were identified after the crossing had been run
  forward.** `top` is runtime state, not a build marker, and `bake.js` runs the
  town for 48 simulated seconds before the identification. Measured, probe
  lengths 95 to 117 and 202 to 213 leave both booms down and the assertion
  throws; 120 happens to work. They are identified before anything runs now, so
  the ordering is irrelevant rather than lucky.
- **The barrier did not match the picture for 2.88 s of every 42.78 s cycle.**
  The town toggles its boom collider at armT 0.55, where the drawn arm is still
  36 degrees above horizontal and the road looks open. Our threshold is 0.90,
  where the arm is within 1.8 degrees of horizontal.
- **The craft drifted sideways in a level hover, 1.5 m/s.** The tangential cant
  table's scalar sum is nearly zero but its VECTOR sum is not, and the four
  tangential directions differ. It cannot be fixed inside the tangential set:
  requiring a zero vector sum forces eps = (p, q, q, p), whose sum against the
  roll column is identically zero, so the roll to yaw coupling would go with
  it. The radial set has the freedom instead, because radial cant cannot affect
  yaw at all. Solved to cancel it, and measured through the real controller
  with the sticks centred for 20 s:

      lateral speed 1.5041 m/s, offset 16.386 m   uniform 1.0 deg radial
      lateral speed 0.3468 m/s, offset  3.633 m   radial solved per motor

- **`window.__race` was a snapshot** taken at boot and never re-adopted, so
  after a swap it answered with the previous map's race. A function now.
- **Check 15 could not see a scale on the craft.** It read BufferGeometry
  constructor parameters and local positions, so `group.scale.setScalar(2)`
  would have left it reporting 0.1550 m for a 310 mm machine. It measures world
  bounding boxes now. The first attempt over-corrected and reported 0.1754 m,
  which is the outline hull at 1.13 times the body: it transforms the body's
  OWN geometry box by its world matrix, which keeps the scale and leaves the
  hull out. 0.1552 m.
- **Check 15's doorway selector matched timber fence frames**, which share the
  door material, so a 27 percent scale error on a door could be outvoted by
  fences. A door is taller than it is wide; a fence frame is not.
- **Check 15's boom reference measured the arm's hinge, not the collider it
  claimed to cross check.** It now reads the built collider with the arms DOWN,
  found by scanning for the first step where they are, and asserts the box
  brackets the hinge: 1.045 to 1.325 m around 1.240 m.
- **Check 16's field budget was taken before the city had ever loaded**, so it
  could not see a leak. It is taken again after a field to city to field round
  trip, which is the measurement that can:

      boot              P1 214   P2 1,931,413   P5 69.8 MB   P10 42.8 MB
      after round trip  P1 214   P2 1,931,413   P5 69.8 MB   P10 42.8 MB

### Recorded, not fixed

- **`hit()` returns the first collider in grid scan order, not the first along
  the travel.** Two solid things in one frame's travel, and the one that gets
  reported is whichever the broadphase happened to reach first, which decides
  graze against crash. Pre-existing, not introduced this round, and fixing it
  means tracking the earliest contact parameter through the whole query.
- **The field's dispose frees the composer's render targets but not its pass
  materials**, so a handful of shader programs leak per swap. Invisible to
  every budget, which counts targets and triangles.
- **`setBoxTop` has no lo <= hi guard** and `animation.js` writes `fay`
  directly, so the invariant the box solver depends on is maintained by
  convention across two files.

`npm run verify` 15 of 16, `yaw-coupling` the one red at -0.09 deg. Determinism
hash 3fdde8bd11da across Node and headless Chrome and four frame rates.

## Round 16: the owner's bug list, and a takeoff that was never flyable at 60 fps

The owner interrupted the polish loop with four bugs: takeoff climbs a little
and crashes unless you wiggle and punch, the scale feels like a 7 inch on both
maps, and input goes laggy after playing the freestyle map. All four trace to
two defects this round closes, plus a cluster of review debt that was already
in flight. Everything below is measured; the container hid the worst of it,
and why it hid it is part of the record.

### The takeoff bug, which was two bugs wearing one symptom

**The physics spawned 0.9 m above the parked render.** SPAWN_ALT was 0.9, a
leftover from when the craft spawned in mid air, while the landed render sat
the craft on the grass at REST_HEIGHT. Every takeoff unfroze 82 cm up with
motors at zero RPM: the craft popped up visually, fell 0.7 m while the motors
spooled, arrived at about 3.4 m/s against a 2.0 m/s landing gate, and was
judged a crash the pilot never flew. A throttle punch out-spooled the fall,
which is exactly the owner's "wiggle the roll axis and give throttle punch"
workaround.

**And the frozen landed state was a falling state.** The ABI could not write
a velocity, so freezing the craft stored its touchdown descent rate and every
freeze/unfreeze cycle of a slow takeoff resumed and grew it. Replicating the
shell's frame loop against the real sim.wasm at a simulated 60 fps: a gentle
human throttle ramp accumulated 2.13 m/s of phantom descent across 14 freeze
cycles and crashed 0.9 s after crossing the takeoff gate. A punch takeoff
peaked at 0.55 m/s and flew. At 144 fps it crashed too, in 37 cycles.

**Why no capture ever caught it: the container's frames are about 100 ms, and
the ground judgement runs on FRAME endpoints.** The whole spool dip fits
inside one frame whose endpoints both climb, so the sweep never sees it. The
judgement is frame rate dependent even though the trajectory is not, and that
seam is now written down here rather than waiting to be rediscovered.

The fix, in three parts, all measured:

- **sim_rest(), a new ABI entry point**: zero the velocity and body rates,
  keep position, attitude, motors and battery. Called once at each judged
  touchdown, because a craft resting on the ground is held by a normal force
  a free-air model does not have. Additive change, ABI version stays 1, no
  existing entry point moved. The determinism hash did not move either:
  3fdde8bd11da before and after, Node and Chrome, four frame rates.
- **The ground holds the craft while the motors spool.** A takeoff sets a
  takingOff hold. While held and still in contact, any frame that ends
  descending is rested where it stands, exactly as a pad holds a real quad
  through the spool; the first frame that ends ascending flies off. Without
  the hold the craft free-falls through its own takeoff: measured, a throttle
  crossing the gate at 0.26 spends about 150 ms spooling from rest and
  plunges 20 cm. The hold releases when the craft climbs 5 cm clear, or rests
  the craft where it is when the pilot chops below the gate.
- **SPAWN_ALT = REST_HEIGHT = 0.045.** The physics now spawns exactly where
  the parked render has always shown the craft.

Validated in the frame loop replica at 60, 144 and 241 Hz frames, gentle,
marginal, punch and abort ramps, 4.2 and 3.6 V: exactly one takeoff event per
takeoff, zero landed/flying chatter, zero crashes, worst spool dip 7.5 cm.
In page, both maps take off at a gentle 0.32 throttle from a parked clearance
of 0.045 m with a clean console.

### The scale bug: the craft was a ball and the camera was in its stomach

Check 15 proves every drawn dimension exact, so the "feels like a 7 inch"
complaint had to be in what the pilot cannot see: the collision volume and
the camera.

**The collision craft is now a disc, which is what a quad is.** The swept
sphere was CRAFT_R = 0.1735 m in every direction; the drawn airframe runs
from -0.017 m to +0.034 m about its origin. The queries now sweep an
ellipsoid: CRAFT_R across the props, CRAFT_V_HALF = 0.040 m through the body,
growing toward CRAFT_R with the sine of the tilt because a banked disc
presents its diameter to the vertical. Measured on a regulation gate with
1.315 inch tube: the usable vertical window goes from 1.142 m to 1.410 m of
the 1.524 m opening. The sphere was stealing 26.8 cm, a fifth of every gate.

- Boxes are EXACT: the piecewise slab walk divides each axis's contribution
  by its semi-axis, which is the ellipsoid contact condition with no extra
  cost. Fuzzed against a dense reference, worst contact parameter error
  4.9e-5.
- Capsules use one support refinement: sweep the conservative sphere, take
  the contact direction AT THE CLOSEST APPROACH between travel and axis,
  re-solve once with the ellipsoid's support radius along it. Boundary cases
  are exact (overhead tube flips at r + 0.040 within 4 mm, side post at
  r + 0.1735, sphere overhead at r + 0.040, diagonal within its documented
  conservatism, bounded under 15 mm).
- The ground judgement queries from the craft's real underside with the same
  tilt aware extent, so a low pass meets the ground where the airframe does,
  13 cm later than before.

**The walker's step rule nearly resurrected the overbridge bug.** The city's
height query offers a platform within a 0.55 m step of fromY. With the true
0.040 m extent, the deck at 7.20 m became an eligible floor for a craft at a
centre height of 6.69 m, under the deck's own underside, which is round 15b's
bug back again. SURFACE_BIAS = 0.40 shifts every contact query's fromY down,
turning the walker's step into a 0.15 m landable depth: a kerb still judges,
a deck can never be your floor from underneath. Re-derived: under-deck flight
is clean below 6.91 m, the bridge's own structure crashes 6.91 to 7.22 m, and
a deck landing wins at 7.24 m, 2 cm before the underside slab, same margin as
before.

**The camera now sits where a real FPV camera bolts on.** It sat at the
centre of mass, so every forward contact happened 17.35 cm in front of the
lens and the pilot watched gates they had visibly not reached take the lap.
It is now 0.0775 m forward, the body's front edge, leaving the prop arc
9.6 cm ahead of the lens, the same order as a real 5 inch. And field of view
is a setting (90 to 120 vertical, default 100 unchanged so every measured
budget stays comparable; real FPV cameras sit around 110).

### The lag bug: three accumulators and a poisoned freeze

"After playing the freestyle map the input becomes very laggy" is what the
landed-state chatter feels like from the sticks: freestyle means perching,
every landing stored a descent, and the craft then spent alternate frames
frozen. That is fixed above. Two real per-session accumulators are also
closed, found by the review that was already in flight when the owner wrote:

- **celmat.js registered every compiled cel material's clock uniform forever**
  in a push-only array that updateCelTime walked every frame, so every map
  swap left the walk longer and full of dead uniforms. It is a Map pruned on
  the material's own dispose event now, and check 16 asserts the walk does
  not grow across a field, city, field round trip.
- **The field's dispose freed the composer's targets but none of its pass
  materials**, and three.js releases a cached WebGLProgram only when its
  material is disposed: the copy, outline and grade passes plus the prepass
  normal and grass mask materials leaked compiled programs on every swap,
  invisible to budgets that count targets and triangles. buildComposer owns
  a dispose() now and field.js calls it.

### The rest of the review debt, closed

- **hit() returns the first contact ALONG THE TRAVEL.** It returned the first
  collider in grid scan order, so two solid things in one frame's travel
  reported whichever cell the broadphase reached first, and that decided
  graze against crash: a gate upright clipped at t 0.85 could swallow a tree
  at t 0.15. Every candidate is tested now and the smallest contact parameter
  wins; capsules by cap-sphere and cylinder roots, boxes by the ascending
  piece walk. Fuzzed: 3000 random cases against a dense reference, zero
  mismatches, worst error 4.3e-6; the two-collider scenario reports the tree
  at t 0.118.
- **setBoxExtentY.** The box solver's lo <= hi invariant was maintained by
  convention across two files, with animation.js writing fay directly; an
  inverted box rejects every query silently, which makes the crossing
  permeable rather than loud. One guarded call owns both ends now and throws
  on inversion.
- **MAP_MODULE_COUNT said 61; the truth is 63**, and check 16 now asserts the
  typed weight against what the browser fetched on the cold load, so it
  cannot silently drift again.

### The advisor ran, mostly

CLAUDE.md requires the advisor before changes to the model's shape. The gyro
noise and motor constant re-derivation designs went to a three lens
adversarial panel; two reviewers completed with 20 findings before the
session's subagent budget died and the verification stage returned an empty
confirmed list, WHICH IS NOT A CLEAN BILL: round 15b's lesson applied, the
journal held the findings and they are recorded raw. The load bearing ones,
for whoever lands those designs: the mixed sign 48 A clamp set is NOT
monotone and wants a fixed count bisection on pack voltage, not active set
refinement; the narrowband vibration line should scale nearer w than w^2 in
the rate domain; the 1x line crosses the 1 kHz seam's Nyquist in sustained
light-load states unless the current clamp lands FIRST, so the two changes
are order coupled; j_rotor's stated derivation does not reproduce its own
total (honest range 7.0 to 9.9e-6, in band either way); r_motor = 0.09 as a
DC equivalent buys the right full-throttle current at the cost of hover
response 1.7x slower than the physical motor, and should be recorded as that
trade; and the re-specified check 8 step of +0.1 duty stays clear of the
clamp (31.6 A peak) but reads 1 to 2 ms below the hover point formula because
the damping grows along the step. The gyro noise seam choice, magnitudes and
the parabolic sine survived attack. The plant work itself is deferred behind
the owner's bug list.

### What went wrong on the way

- **The first abort threshold measured sink from the collision sphere's
  bottom**, which reads 9.85 cm of sink in the parked pose, so every takeoff
  force-landed instantly: 56 to 231 takeoff events per run. The depth of the
  CENTRE below the surface is the meaningful quantity.
- **The first support refinement took the contact direction at the sphere's
  first contact**, which for a level pass under a tube is still mostly
  horizontal, so the reach never shrank and the boundary case failed by
  exactly the amount the refinement existed to remove. The direction at the
  closest approach is the one that predicts the contact.
- **The first cel walk assertion demanded equality across the round trip**
  and failed against 54 to 39: a material registers when it first COMPILES,
  so the rebuilt field legitimately reports fewer until every view has
  rendered. Growth is the leak signal, not difference.
- **Two harness runs printed console errors that were my own until timeouts**,
  not page errors: at 0.195 throttle the container descends too slowly for
  the step's patience. Read the ERR lines before blaming the page.
- **The advisor workflow reported confirmed: [] because its verify agents hit
  a session limit**, which looks exactly like a clean review. The journal had
  everything. Check that a review ran before believing it found nothing,
  again.

### Verify

npm run verify after the final change set: see the table in the session log,
15 of 16 expected with yaw-coupling the one red at -0.09 deg unchanged.
Determinism hash 3fdde8bd11da, identical to the round 15b baseline, across
Node, headless Chrome and four frame rates: the takeoff fix, the ellipsoid
and the ABI addition cost the trace nothing. Checks 5 through 12 byte
identical to the baseline table. Check 16 carries two new assertions: the
cel clock walk must not grow across a round trip, and the module weight must
match the fetched count.

### Owed next, in the order the evidence suggests

1. The World stage sub-progress needs the vendored builder chunked with
   yields, a recorded patch that makes it async with an optional pause hook;
   a progress callback alone cannot paint during a synchronous 7 second call.
2. City P6, P7, P8 at 1920 by 1080, and the P6 argument that the budget as
   written is a field budget.
3. The judge loop over the city's authored choices: fog, spawn, shadow half
   width, HUD set.
4. Gyro noise and the motor constant re-derivation, advisor findings above,
   clamp before noise.
5. The landing gates: the owner's descent crash at 3.83 m/s was judged
   correctly under the 2.0 m/s rule, but round 12's argument that 2.0 is 30
   to 50 percent strict for grass now has a user report behind it.

## Round 16b: every second spent parked became a second of stick lag

The owner's next report, straight after the takeoff fix shipped: one to two
seconds of lag on ALL stick input, unflyable. It is a clock skew, it was
sitting under the takeoff bug the whole time, and the takeoff fix is what
made it reachable.

**The mechanism.** simTimeMs is the LAP clock and deliberately keeps running
while the craft sits landed with the integrator frozen; the sim's own
step_index does not. The RC resample grid stamped every stick sample with
the lap clock, and sim_step consumes a sample only when step_index reaches
its timestamp, so samples queued after any parked period sat that far in the
sim's future. The lag equals the total time between entering flight and
pushing the throttle up, plus every later perch. Nobody could feel it before
this round because at 60 fps every takeoff crashed and the crash reset
re-zeroed both clocks; the moment takeoffs worked, the skew became the
flight experience.

**Measured, frame loop replica against the real sim.wasm at 60 fps.** Park
3.0 s then ramp the throttle: the controller sees the throttle 3,150 ms of
sim time after the stick moved. Park 6.0 s: 6,150 ms. The lag IS the parked
time. Two proxy mistakes on the way are part of the record: a motor
response threshold of 300, and then 1200, both fired at 17 ms in BOTH
wirings, because the state block publishes RPM, not rad/s, and airmode
idles the motors at about 2,435 RPM the moment the integrator runs. The
threshold that separates idle from a throttle response is 6,000 RPM.

**The fix.** A new simStepMs counter mirrors step_index: it advances only
when the integrator steps, and it is the only timebase the RC grid touches:
the fill loop, the takeoff re-pin and the landed-branch pin all ride it.
simTimeMs keeps every other job it had: the lap clock, airtime, and the
city's crossing, which must keep moving while the craft sits parked.

**Verified.** Replica: throttle seen 17 ms after the stick at both parked
durations. In page: 15 parked frames, then the craft responds within 4
frames of the stick and climbs to 0.65 m, console clean. npm run verify
after the change: 15 of 16, yaw-coupling the one red, determinism hash
3fdde8bd11da unchanged; the harness drives the sim directly and never
touches the shell's clocks, which is why no check could ever have caught
this. A check that could is worth designing: drive the real page, park,
then measure stick-to-response in sim time.

## Round 16c: the world was the right size, the aircraft was the wrong size against it

The owner's report, two complaints in one message: "the gates and the town are
too small compared to the drone, the scale doesn't feel right, the gates need
to be bigger", and "in the freestyle map the collisions need to HUG the
graphics, i want to hit gaps but in many places they are actually invisible
walls". Then, when asked which build the gates had felt right in: "just make
everything 1/4 larger relative to the drone camera".

### There was nothing in either world to correct, which is why the fix is not in either world

Both maps measure right and the harness already proves it. A MultiGP standard
gate is 1.524 m because MultiGP publishes 5 ft, src/render/scene.js throws at
load on a 10 mm drift, and check 15 bands it independently. The town's kerbs
are 0.135 m, its doorways 2.05 m and its handrails 1.06 m, each measured by a
different route through the built world in src/maps/city/references.js. So
"the gates need to be bigger" could not be answered by making a gate bigger
without deleting the one citation this project has, and round 12 already
settled the same argument once: the dressing was wrong, not the gate.

What is adjustable is how big the AIRCRAFT is against all of it, and that is
the thing nobody had ever written down. **WORLD_SCALE = 1.25** in
src/render/frame.js: the world is modelled at 1.25 times the aircraft's own
scale, applied in the file that is already the one and only conversion between
the physics frame and the world frame.

    world metres = sim metres / WORLD_SCALE

Downstream of that line the aircraft is 1/1.25 of its true size and travels
1/1.25 as far per second. Upstream of it nothing changed at all: the physics
module, the ABI, the determinism trace and every published dimension in both
maps are untouched, which is the property that made this the right seam.

Measured in the page after the change: collision radius 0.1735 to 0.1388 m,
drawn craft AABB 0.2255 by 0.088 by 0.2265 m, parked camera height above the
grass 0.045 to 0.036 m, gate opening still exactly 1.5240 m. Gate width
against craft width goes 4.39 to 5.49.

**Why a bigger gate would not have worked anyway, and this does.** Angular
size is scale invariant: a gate 1.25 times larger, approached from 1.25 times
the distance, subtends exactly the same angle and looks identical. What the
eye actually reads as scale is the size and speed of the aircraft moving
through the thing, and both of those are what this changes. The camera flies a
quarter lower over the same ground and the world goes past a quarter slower
for its size.

Five call sites carry it and no others: the sim to world position conversion,
the drawn model's group scale in craft.js, the collision ellipsoid in
collide.js, the FPV camera mount, and the resting height.

**Two mistakes on the way, both caught by grep rather than by flying.**
`startY` was being folded into the sim z before the conversion, so the first
version divided the terrain height by 1.25 and sank the whole course; it is
added after the conversion now, with the reason written at both call sites.
And src/game/race.js was still folding the airframe's own 0.1735 m into a gate
aperture measured in world metres, which would have scored every gate against
a quad a quarter larger than the one flying through it. That is the same class
of error as the 0.1885 collision radius round 15 found.

**What check 15 had to become, and why it is stronger and not weaker.** The
check measures the craft off its world bounding box, and its own comment says
it was written so that `group.scale.setScalar(2)` could not hide: "A world
Box3 sees the scale". It sees this one too, by design. So it now divides the
DECLARED scale back out before banding, which keeps the band asserting exactly
what it always asserted, that the airframe is a real 5 inch machine, and it
adds two assertions that did not exist: the page's declared scale against
tests/thresholds.json, and the drawn craft against the airframe's true sweep
radius at that scale. An undeclared group scale still fails the band, and a
declared scale that never reached the model now fails the ratio.

### The invisible walls: the measurement said something different from what I expected

The first three hypotheses were all wrong and the record is worth keeping.
Colliders with no `top` become 400 m tall via BOX_CEIL: there are zero of them
in this town. The call sites looked damning, `plotCollide` padding every
building plot by 0.1 m a side and district.js padding one frontage by 1.0 m
and one flank by 1.8 m: measured against the drawn triangles, the mean
overhang of a town rectangle above the geometry standing in it is 0.04 m. And
a scan that found 20 percent of the town's solid volume with nothing drawn in
it was measuring building interiors, which are correctly solid; a flood fill
from the sky brought it down but leaked through the shells, so that metric
never became trustworthy.

What is real is the TAIL, and the tail is what gets flown into: **54 boxes
reach more than 0.5 m above anything drawn, the worst by 9.07 m, and 106
overhang the drawn footprint by more than 0.35 m, the worst by 2.91 m.**

So src/maps/city/index.js now fits each rectangle onto the geometry it stands
for, before the bake, in 325 ms over 119,160 drawn boxes. It only ever
shrinks. A mesh votes on a collider's sides only if two thirds of its own
footprint lies inside it, so a shared wall or the terrain running underneath
cannot vote, and a collider with nothing that qualifies is left exactly as
authored, because a barrier with no geometry in it is usually load bearing.

**The first version opened holes and the numbers said so immediately.**
Trimming on the mere presence of owned geometry destroyed every long thin
barrier in the town: a 78.9 m lineside railing 0.24 m thick, drawn as a run of
separate balusters, kept whichever single post qualified and collapsed to
0.18 m. 675 side trims, worst 74.99 m, worst top trim 16.80 m. The
distinction it was missing is that padding leaves the object filling its own
rectangle while a sparse barrier fills nothing, so the drawn geometry now has
to COVER 60 percent of the rectangle, by both the union of the owned boxes and
the sum of their clipped footprints, before any trim is believed. And no face
moves further than FIT_MAX_PAD, 2.0 m, which is the town's largest authored
standoff with margin.

**The second version opened twelve more, and they were all trees.** A tree is
collided as its trunk, a 1.1 m square box, and the canopy on top is metres
across, so ownership rejected the canopy and the owned union topped out at the
trunk: nine tree colliders lost 2 m each and a safety scan found the box no
longer reaching into a canopy that is drawn, dense and on screen. The top and
the sides turned out to be different questions. The sides ask where the object
stands and need ownership; the top only asks whether anything at all is drawn
up there, and is now capped by the tallest drawn thing anywhere over the
footprint, owned or not.

**Final fit: 613 of 2731 rectangles trimmed, 275 side trims to a worst of
1.12 m, 15 top trims averaging 0.227 m to a worst of 0.67 m.** Verified by a
scan that takes the tallest drawn point inside every rectangle with a real
footprint, 1087 of them, and drives a segment through it half a metre below
that point: **zero holes**, against 12 for the previous version. The caps are
asserted in check 15 now, because the failure mode is a 78.9 m railing turning
into a post and that should show up as a number rather than as a report from
the pilot.

### Owed, and honest about it

- **The 54 over tall boxes are still over tall.** Coverage declines them
  because they are long thin barriers with sparse geometry, and the 2.0 m cap
  would decline them anyway. The worst is 9.07 m of invisible wall above a
  30.8 m by 0.8 m barrier at x = 123, well outside the town core. Fixing them
  needs the fit to be able to split one rectangle into several boxes, which is
  a bigger change than this round should carry.
- **The HUD's two numbers are now in different frames.** Altitude reads world
  metres, which is the world's own truth and what a pilot wants over a roof;
  speed reads the airframe's true metres per second, because the quad really
  does do 130 km/h. They differ by WORLD_SCALE and neither is wrong, but if
  the owner reads them together they will not agree.
- **Lap times on the race field get about 25 percent longer** for the same
  flying, because the craft covers 1/1.25 of the world per second. Stored
  records are keyed on config and pack voltage, not on the scale, so an old
  record is no longer comparable with a new one.

### Verify

npm run verify in this container: **14 of 16**.

Check 10 yaw-coupling is the one known red, unchanged at -0.09 deg. Check 1
build-clean fails for an environment reason and not a code one: this container
has no Emscripten, `emcc not found` and `EMSDK` unset, and nothing in this
round touches sim.c, patches/, vendor/betaflight or the build. `git diff
--stat vendor/betaflight` is empty.

The evidence that the physics is untouched is the determinism hash:
**3fdde8bd11da**, identical to the round 15b baseline, across Node, headless
Chrome and all four frame rates. Checks 5 through 12 are byte identical to the
previous table. Check 13 console-clean is green on both maps, and check 16
reports the field's budget unchanged at P1 214, P2 1931413, P5 69.8 MB, P10
42.8 MB after a city round trip.

Check 15 now reads: world scale 1.2500, craft body 0.1552 m, craft sweep
radius 0.1736 m against a true 0.1735 m, collision radius 0.1388 m against a
swept 0.1389 m, gate opening 1.5240 m square, city kerb 0.1350 m, doorway
2.0500 m, handrail 1.0600 m, crossing boom 1.2400 m, collider fit 613 fitted
of 2731 with 275 side trims to 1.12 m and 15 top trims to 0.67 m.

## Round 16d: 15 percent on the gates, and the things in the town that were pictures

The owner, after flying round 16c: "the town feels much better, although the
train and lamp posts and many other graphic elements have no collision, can
you fix?" and "the gates need to be 15 percent larger in the track".

### The gates, without deleting the rulebook

GATE_SCALE = 1.15 in src/game/track.js. The published figures do not move: a
5x5 gate is still 1.524 m in the file because MultiGP publishes 5 ft, and the
departure is a separate named constant that every consumer reads the library
through. `builtObstacle(kind)` returns the published spec with every length
scaled, `BUILT_FRAME_TUBE_OD` is the tube as built, and src/render/scene.js
now draws and asserts against those instead of reading OBSTACLES directly.
Reading OBSTACLES is reading the rulebook; reading builtObstacle is reading
the course, and the two are deliberately different now.

Every length scales together, so an obstacle grows as one object: the opening,
a tower's sill, the hurdle bar, the flag offset and the frame tube. A gate
with a 15 percent bigger hole on the same pipe would read as a different
product.

Measured: gate opening 1.5240 to 1.7526 m. Against a craft that is 0.2776 m
across after round 16c, that is 6.31 gate widths to the quad, where MultiGP
against a real 5 inch is 4.39.

`courseGates`, `racingLine`, `UTT3` and `aperture` turn out to have no
consumers outside track.js; the live path is OBSTACLES into scene.js. They are
routed through builtObstacle anyway so they cannot become a second opinion.

### The town's pictures

Two separate defects, and the survey is worth keeping because the second one
was much larger than the report suggested.

**The train had no collision of any kind.** 59.6 m of solid crossing the town
at 23.5 m/s, and a quad flew straight through it. It cannot be a static box:
the broadphase grid is indexed on x and z, which is exactly why a level
crossing boom is only allowed to move in y. So src/game/collide.js gains a
MOVING box path, outside the grid entirely, tested after the scan and folded
into the same earliest contact comparison. Three boxes, one per car, because
the gap between cars is a real gap and one 59.6 m box would be a wall across
the coupling.

The query is solved in each box's own frame: the box's previous centre comes
off the start of the craft's travel and its current centre off the end, which
turns "a box moving past a moving craft" into "a static box at the origin and
a craft on the relative path". That is not a nicety. At 60 fps the train
covers 0.39 m a frame and on this container twelve metres a frame, so a test
against the box at rest would let the train pass clean through a hovering quad
between two frames. `train` is its own hard kind, because there is no speed at
which meeting it is a graze.

Verified by driving the town's clock to the step where the train is at the
crossing, step 18100 with the offset at 0.35 m, and probing across the rail:
`train` at all three heights through it, clear six metres above it.

**403 objects standing on the ground had no collider, measured at the
granularity the town adds things at.** A 2.4 m lamp post 0.1 m square is the
typical one. The town collides what a walker can walk into, and a walker does
not walk into a lamp post in the middle of a footway, so a great deal of
street furniture was scenery.

Filling that in is the inverse of round 16c's trim and it is the more
dangerous direction, because a box added where nothing should be solid is a
wall the pilot cannot see. Two rules keep it honest.

  1. **Compact and standing on the ground only.** Nothing wider than 6 m,
     nothing with a footprint over 12 m squared, nothing whose base floats
     more than 1 m above the surface under it. That excludes buildings,
     tunnels, hills, roads and the lake by construction, and it excludes them
     for a reason rather than by luck: probing the objects showed a tunnel
     bore reading as uncovered at its own centre, which is correct, it is a
     hole, and a bounding box would have plugged the route.
  2. **Solid, not see through.** The sum of an object's own mesh boxes over
     its union box has to reach 0.25. Without this the pass turns a torii into
     a block: two posts and a lintel inside a 3 by 3 m box that is 90 percent
     air. 205 objects failed this and were left exactly as they were, which is
     the right outcome: no collision is better than a wall across a gap the
     pilot can see through.

Foliage is excluded by name and that is a judgement, not a measurement. 46000
canopy blobs are drawn and none of them is solid, the town deliberately
collides a tree as its trunk, and real canopies are porous. **If the owner
wants to crash into cherry blossom, it is one regexp.**

Result: 1077 objects gained a collider, 205 declined as see through, the city
goes from 2731 authored rectangles to 4048 static boxes plus 3 moving ones,
and the whole contact build costs 285 ms.

### Owed

- The see through rejects are still fly through. A torii, an archway and a
  bike rack are drawn and not solid. Doing them properly means a box per mesh
  rather than per object, which is a different pass.
- Furniture is added as kind `obstacle`, which the shell treats as grazeable
  below 4 m/s, while the town's own rectangles are all `wall` and crash at any
  speed. Brushing a bin at walking pace should not end a run, but the town is
  now inconsistent with itself about that and it should be settled deliberately.
- `window.__animTo` is new, harness only. It exists because the train circles
  in about 43 s of simulated time and this container renders two frames a
  second, so waiting for it is ninety seconds of wall clock no check can
  afford.

### Verify

npm run verify: **14 of 16**, the same two reds as round 16c and for the same
reasons. Check 10 yaw-coupling at -0.09 deg is the known one. Check 1
build-clean fails because this container has no Emscripten, `emcc not found`
and `EMSDK` unset; nothing in this round touches sim.c, patches/,
vendor/betaflight or the build, and `git diff --stat vendor/betaflight` is
empty.

Determinism hash **3fdde8bd11da**, unchanged again across Node, headless
Chrome and four frame rates. Check 13 console clean on both maps. Check 16
reports the field's budget identical after a city round trip at P1 214, P2
1931413, P5 69.8 MB, P10 42.8 MB, so a 15 percent gate costs the frame
nothing.

Check 15 now reads: world scale 1.2500, craft body 0.1552 m, craft sweep
radius 0.1736 m against a true 0.1735 m, collision radius 0.1388 m against a
swept 0.1389 m, gate scale 1.1500, gate opening 1.7526 m square, grass 0.0300
to 0.0900 m, city kerb 0.1350 m, doorway 2.0500 m, handrail 1.0600 m, crossing
boom 1.2400 m, collider fit 613 fitted of 2731 with 275 side trims to 1.12 m
and 15 top trims to 0.67 m.

## Round 17: the flight controller was three quarters wired, and nobody could tell

The owner's ask: a full review and tightening of the flying model, every
Betaflight element present and operating correctly against the physics, then
a default Betaflight tune and a Karate race tune for a 5 inch. Mid round:
"it does feel pretty good now, be sure not to destroy that inadvertently."
That second sentence set the acceptance test for everything below. The
determinism hash moved, because the gyro filter chain is new; **every single
flight number in checks 5 through 12 is byte identical to the round 16d
table**, and the feel rig agrees.

### The finding: a 25 key whitelist that reported success for everything else

`bf_config_apply_setting` was a chain of 25 `strcmp`s ending in
`return SIM_OK`. Every other `set` line in every diff was accepted and
discarded. `configs/freestyle.diff` has been shipping
`set gyro_lpf1_static_hz = 250`, `set dyn_notch_count = 0` and
`set motor_kv = 1900` for the whole life of this project and none of them
reached anything. Check 12 is the check that exists to catch a bad port, and
it only ever varies `roll_srate`, so it passed throughout.

This is not a small gap. It means **no tune preset could ever have worked**.
`d_min_roll`, `d_max_gain`, `tpa_rate`, `tpa_breakpoint`, `iterm_relax_cutoff`,
`iterm_limit`, `pidsum_limit_yaw`, `throttle_boost`, `thrust_linear`,
`feedforward_*`, `anti_gravity_*`, every `dterm_lpf*`, every `gyro_lpf*`,
`motor_output_limit`, `dshot_idle_value` and the whole `simplified_*` slider
family were all silently inert.

`src/native/bf/bf_settings.c` replaces it with a table of 163 keys built
against the live parameter group structs. Every key is named by Betaflight's
own `fc/parameter_names.h` macro where one exists, so an upstream rename is a
compile error rather than a silent miss, and each key writes the field
`cli/settings.c` writes for it. Three outcomes, and the difference is the
point: APPLIED, INERT (real Betaflight, addresses a subsystem this build does
not compile, listed by prefix with its reason) and UNKNOWN, which is counted
and reported through `sim_bf_debug` rather than swallowed. Unknown is not a
runtime error, because a pilot may drop a dump from a flight controller this
simulator has never heard of and it must still fly.

`npm run lint:presets` (`scripts/preset-lint.js`) drives every shipped diff
through the real module and fails on any unrecognised key, on a preset that
applies nothing, or on a count that does not add up to the file's own `set`
lines. Today: freestyle 27 applied 6 inert 0 unknown, betaflight-default 99/9/0,
karate-race 119/13/0.

### Betaflight elements that were missing, now compiled in

- **The entire gyro filter chain.** `gyro.gyroADCf` was written directly by
  the glue, so lpf1, lpf2, the static notches and the dynamic lowpass did not
  exist. `sensors/gyro.c`, `sensors/gyro_init.c` and
  `sensors/boardalignment.c` are compiled now and the seam moved down to
  where it belongs: a `readFn` that hands the firmware int16 counts at
  `GYRO_SCALE_2000DPS`, which is exactly what Betaflight's own SITL target
  does in `virtualGyroSet`. Everything above that, alignment, the downsample
  into `sampleSum`, `filterGyro` and `dynLpfGyroUpdate`, is Betaflight's
  compiled code. Five stubs (`gyroYawSpinDetected`, `gyroOverflowDetected`,
  `initYawSpinRecovery`, `dynThrottle`, `dynLpfGyroUpdate`) were deleted
  because the real functions now link.
- **`config/simplified_tuning.c`**, and with it the `simplified_tuning apply`
  CLI line. The published Karate presets are written entirely in sliders, so
  without this they are a file of stored numbers that change nothing. The
  diff parser now tokenises non-`set` lines and hands the first two words to
  the glue, which is how the command reaches Betaflight's own code at the
  point in the file where it appears, so lines below it still override.

### Betaflight elements that were wired wrong

- **TPA was driven twice, from the wrong throttle, at the wrong time.** The
  glue called `pidUpdateTpaFactor(raw_stick)` immediately before
  `pidController`. `mixTable` calls it too, from Betaflight's own scaled
  throttle. On hardware `fc/core.c` runs rc, then PID, then mixer, so the TPA
  factor the PID uses is one loop old and comes from the throttle AFTER
  mid/expo and the throttle limit. The glue's call removed that lag and used
  a different definition of throttle. Deleted; `mixTable` owns it, as
  upstream does.
- **`motorInitEndpoints` hardcoded a 5.5 percent idle** and ignored both
  `dshot_idle_value` and `motor_output_limit`. It mirrors `drivers/dshot.c`
  `dshotInitEndpoints` and `drivers/motor.c` `getDigitalIdleOffset` now, and
  the duty handed to the plant is the DShot throttle fraction. Modelling
  DShot rather than analogue PWM is deliberate: it is what a 5 inch race quad
  runs and it is the only way the idle setting can mean anything.
- **`vbat_sag_compensation` read a frozen 4.20 V.** `sim_bf_sag_cell_cv` was
  declared and never written, so the compensation was a no-op whatever the
  pack was doing. The glue feeds it the plant's pack voltage under load each
  step now.
- **`mixerConfig` and `pidConfig` were never reset to Betaflight defaults**,
  they sat at their C zero initialisers. `mixer_type` came out LEGACY and
  `yaw_motors_reversed` false by luck; `pid_process_denom` came out 0.
  Both are reset properly now, and `bf_config_finish` forces
  `pid_process_denom` back to 1 with the reason written down, because
  CLAUDE.md fixes the loop at 1 kHz.

### Betaflight elements that are absent, and why, stated rather than implied

- **RPM filtering and dynamic idle.** `USE_RPM_FILTER` is not defined for any
  target that does not set it, and `common_post.h` takes `USE_DYN_IDLE` with
  it. Both would need real motor RPM fed back, which the plant has. They are
  worth building the day gyro noise exists; today there is no resonance to
  notch, so they would be ceremony.
- **Dynamic notches.** Betaflight itself does `#undef USE_DYN_NOTCH_FILTER`
  on any `SIMULATOR_BUILD` because the FFT wants CMSIS `arm_math.h`. Not our
  choice and not fixable without vendoring an FFT.
- **Gyro noise.** This is the real gap behind the two above, and it is the
  honest limit on what a filter tune can mean here: the simulated gyro is
  perfectly smooth, so the difference between the stock filter tune and the
  Karate array is phase lag alone. Measured cost of adding the whole chain to
  the default tune: roll rise to 63 percent 34 ms to 33, overshoot 3.1 percent
  unchanged, settle 158 ms to 157. That is because the D term lowpass at 75 to
  150 Hz owns the phase budget and a 250/500 Hz gyro pair adds little on top.

### The two presets

`configs/betaflight-default.diff` and `configs/karate-race.diff`, selectable
from a Tune item on the title screen next to Map (`configs/registry.js`,
mirroring `src/maps/registry.js`). `configs/freestyle.diff` stays the default
so nothing the owner already likes changed by choosing not to choose.

Karate Race 6S 5 inch is sugarK's, flattened in the order Betaflight's own
preset system flattens it, from `betaflight/firmware-presets` at 4.5:
`tune/defaults.txt`, `filters/defaults.txt`, `tune/karate/karate_race.txt`
with only its CHECKED option taken, `rates/SugarK.txt` because a race tune on
670 deg/s default rates is not a race setup, and
`rc_link/generic/250hz_race.txt` because 250 Hz is the rate the shell samples
sticks at. The sliders land through Betaflight's own code as roll P38 I81 D35
Dmax21 F125 and pitch P41 I89 D40 Dmax23 F137, then the lines below the apply
override TPA to 70/1250, iterm relax to 45, iterm limit to 500 and yaw pidsum
to 1000. Read back live from the page after switching tunes through the menu.

What the tune buys, measured on the same rig, against the Betaflight default:

| | default | karate race |
|---|---|---|
| roll rise to 90 pct | 57 ms | **44 ms** |
| roll stop to zero rate | 80 ms | **51 ms** |
| yaw rise to 63 pct | 89 ms | **41 ms** |
| roll overshoot | 3.1 pct | 14.1 pct |
| max roll rate | 670 deg/s | 420 deg/s |

That is a race tune doing what a race tune does, and it is the right lever for
"locked in": real Betaflight tuning, not a fudged plant. The 14 percent
overshoot is on an instantaneous full stick step, which no radio can produce,
against a tune with feedforward boost 18 and D dropped from 30 to 21.

### The plant: what the review measured, and the one thing NOT changed

Every headline number lands where a real 6S 5 inch does. Static thrust to
weight 9.24 to 1 computed from the compiled kt at full throttle RPM (the rig's
6.19 reads lower because by then it is climbing at 13.6 m/s and paying the
advance ratio). Punch 7.10 g peak, 82.1 m in 3 s, 31.3 m/s peak climb. Hover
19.5 percent at 4.20 V rising to 23.6 at 3.50. Top speed 140 to 157 km/h.
Hard brake from 30 m/s at a 45 degree flare: 1.07 s and 15.3 m. Motor tau 18
to 27 ms depending on the step size.

**The one soft spot is coasting.** Levelled at 30 m/s on hover throttle, speed
halves in 2.24 s; from 20 m/s, 3.23 s. All of the model's drag is quadratic
(`cda_front` 0.016 m squared), which is calibrated at the top end and
therefore too slippery in the middle, where racing actually happens. The
missing term is rotor drag, the H force a spinning disc produces moving
edgewise, which is linear in speed and proportional to rotor speed and is the
term the quadrotor literature adds to get accurate tracking.

It is NOT added this round, deliberately. The coefficient cannot be closed
honestly yet: the identified value from the literature (d approximately 0.30
per second at hover RPM for a 0.6 kg quad) extrapolates to 23 N at 39 m/s,
more than the entire quadratic term, and blade element theory says the induced
part FALLS with speed rather than growing, so a pure linear term is wrong at
race speed and any fade between them is a free knob. Adding it would also
change every speed in the table, against an owner who has just said the feel
is good. It is the top owed item with a derivation round of its own, and
CLAUDE.md wants the advisor on it.

**Propwash does not exist.** Descending at 12.7 m/s on 10 percent throttle the
gyro reads 0.04 deg/s RMS. The vortex ring model takes thrust away correctly
but `PLANT_INFLOW_ASYM` is a FIXED per motor offset, so the I term trims it
out in under a second and there is no disturbance left. Real propwash is
unsteady. STAGE1.md defers it to Stage 2 and it stays deferred, but it should
be recorded as absent rather than as modelled.

### Smaller things the review turned up

- Two comments in `plant_step` contradicted each other about whether the
  common mode axial inflow is used. It is, and has been since the advance
  ratio model landed. The stale claim is corrected in place with a note
  saying so, because a reader who believed it would misread the block.
- `PlantParams.k_inflow` was still documented as a thrust loss coefficient in
  `sim_internal.h`. It is the prop pitch radius, metres per radian.

### Verify

`npm run verify`: **15 of 16**, and check 10 yaw-coupling at -0.08 deg is the
same known red as round 16d, unchanged in kind. Checks 5, 6, 7, 8, 9, 11 and
12 read 0.2051, 82.1 m, 31.3 m/s, 18 ms, 669.4 deg/s, 10.15 percent and ratio
1.2551, every one identical to the round 16d table. Determinism hash
**92db7a6f2b15**, identical across Node, headless Chrome and all four render
rates; it moved from 3fdde8bd11da because the gyro filter chain is genuinely
in the loop now. Console clean. `npm run lint:presets`: 3 of 3.

Tune switching driven through the real page: boot on freestyle (P45, Dmax30,
TPA 65, srate 70), to Karate (P38, Dmax21, TPA 70, srate 42), to Betaflight
default (P45, Dmax30, TPA 65, srate 67), zero console errors.

### What went wrong on the way

- The first link of `sensors/gyro.c` failed on six duplicate symbols, which
  was the good news: every one was a stub this project had written for a
  function Betaflight was willing to compile all along.
- `GYRO_FILTER_DEBUG_SET` expands to `UNUSED(gyro.rawSensorDev->...)`, which
  formally evaluates a dereference. `gyro.rawSensorDev` is set to
  `&gyro.gyroSensor1.gyroDev` rather than left null, because relying on the
  optimiser to drop a load through a null pointer is not a plan.
- Fourteen `PARAM_NAME_*` macros do not exist upstream (`p_roll` and friends
  are literal strings in `settings.c`). Caught at compile time, which is the
  argument for using the macros where they do exist.
- The first tune swap fired on any settings change, because it compared the
  menu against what was loaded, and a dropped diff is not a registry tune: a
  pilot who dropped their own file and then changed the volume would have had
  it replaced. It compares against the last value the menu asked for now.

### Owed next

1. Rotor drag, with the derivation closed and the advisor run. Coasting is
   the one measurement that does not read like a real quad.
2. Gyro noise, which is what would make the filter half of a race preset mean
   anything, and which unlocks RPM filtering and dynamic idle behind it.
3. Unsteady propwash, once gyro noise exists to carry it.
4. Check 10 yaw coupling, still below its floor at -0.08 deg.

## Round 17b: rotor drag, and the measurement that nearly sent it the wrong way

The owner, after reading round 17's owed list: "would the thing you didn't
fix make it feel a bit floating and blow out corners?" Then, once it was
measured: "ignore the advisor requirement, we can always roll back, lets go,
fix it so this works and it feels right." So it is built, and the advisor
step is explicitly waived by the owner rather than skipped.

### What was missing

Every drag term in the plant was quadratic in speed and fitted so the top
speed came out right, which made it far too slippery everywhere below the
top. The missing physics is the H force: a spinning rotor moving edgewise
pulls backwards on the airframe, and for a multirotor it is the dominant
translational damping at the speeds a race is flown at.

### The form is derived, not fitted

    H = k rho A v_i v_perp        per rotor

with v_i the rotor's induced velocity from Glauert's edgewise relation
v_i = v_h^2 / sqrt(v_perp^2 + v_i^2), v_h = sqrt(T / 2 rho A). In the
ratios y = v_i/v_h and x = v_perp/v_h that is the quartic
y^4 + x^2 y^2 - 1 = 0, which has the closed form

    y^2 = 2 / (sqrt(x^4 + 4) + x^2)

written that way and not as (sqrt(x^4+4) - x^2)/2, which loses every
significant figure to cancellation once x is large, and x IS large in a
dive. Only sim_sqrt is used, there is no iteration, and determinism is
intact: hash ff32caab7fbd, identical in Node, headless Chrome and all four
render rates.

The behaviour that falls out is the point. At low speed y goes to 1 and H is
linear in v_perp, which is the damping term the quadrotor literature
identifies. At high speed y goes to 1/x and H saturates at k T / 2 instead
of growing without limit.

k = 0.4386 is anchored, not tuned: the literature identifies a linear drag
near 0.30 per second at hover for a 0.6 kg five inch machine, and at this
airframe's hover thrust four rotors give 4 rho A v_h = 0.4446 kg/s, so
k = 0.65 * 0.30 / 0.4446. Recorded honestly: that published figure is a
TOTAL linear fit and already contains some parasitic drag, so k is an upper
bound rather than an exact split. cda_front and cda_side went 0.016 to
0.013, which is what the airframe actually projects (about 0.010 m squared
at a bluff body Cd near 1.2), because they had been absorbing this force all
along and must not charge for it twice.

### Two wrong measurements on the way, and they nearly decided it

**The corner rig was over throttled.** It held throttle at hover/cos(bank).
Thrust goes as duty squared, so a 50 degree turn got 2.4 times hover thrust
and the craft climbed 21 m through the corner: most of the disc was holding
a balloon up rather than turning, and every radius it reported was fiction.
Rebuilt as a vertical speed loop, which is what a pilot's thumb is.

**And then the rebuilt rig showed the craft turning 4 degrees in 1.8 s,
which is correct and was the most useful thing measured all round.** A quad
banked with its nose level does not fly a circle, it translates sideways.
Cornering is bank PLUS yaw, and what "blowing out" actually is, is sideslip:
the outward slide that rotor drag damps. So the discriminating measurement is
slip washout, not turn radius, and that is what was tuned against.

**The first calibration was wrong and the improvised top speed test hid it.**
Holding a 30 degree nose down attitude at full throttle, top speed went 113
to 84 km/h, which read as unaffordable and produced an argument that rotor
drag could not buy mid speed damping without wrecking the top end. It is the
wrong test. The P5 gate sweeps pitch stick 0.25 to 0.55 at full power and
takes the best run that does not lose 20 m, which is how a speed run is
actually flown, and by that measure the cost is 139 to 128 km/h, comfortably
inside the 120 to 165 band. Tuning against a non canonical rig nearly
cancelled a correct change.

### Measured, before against after

Unchanged, and this is the acceptance test the owner set:

| | before | after |
|---|---|---|
| hover throttle at 4.20 V | 0.1953 | 0.1953 |
| punch peak / 3 s gain | 7.10 g / 82.1 m | 7.10 g / 82.1 m |
| roll rise to 90 pct | 58 ms | 58 ms |
| roll overshoot | 3.1 pct | 3.1 pct |
| roll stop to zero / bounce | 81 ms / -16.1 deg/s | 81 ms / -16.1 deg/s |
| props level descent terminal | 20.7 m/s | 20.7 m/s |

Changed, deliberately:

| | before | after |
|---|---|---|
| coast from 20 m/s, half speed | 3.23 s | **2.61 s** |
| left after 5 s of that coast | 8.0 m/s | **4.8 m/s** |
| brake from 20 m/s at 45 deg | 0.91 s, 9.5 m, +23.6 m | **0.78 s, 8.3 m, +19.4 m** |
| sideways slip washout over 2 s | 12.9 to 9.7 m/s | **12.0 to 7.5 m/s** |
| P5 max level speed | 139 km/h | 128 km/h |
| yaw rise to 63 pct | 84 ms | 87 ms |

Vertical and rotational are untouched by construction: the force acts only
in the rotor plane, so a climb or dive through the disc never sees it, and
roll and pitch rates move a rotor vertically rather than sideways so they
produce no H force. A yaw rate does move the rotors in plane, which is where
the 3 ms of extra yaw rise comes from, and that damping is real.

### Verify

npm run verify: **15 of 16**, check 10 yaw-coupling the same known red at
-0.08 deg. Checks 5, 6, 7, 8, 11 identical to round 17; check 9 rate
tracking 669.4 to 669.6 deg/s and check 12 ratio 1.2551 to 1.2546, both
marginally closer to target. Determinism hash **ff32caab7fbd** across Node,
headless Chrome and four render rates. npm run lint:presets 3 of 3.

npm run gates: P5 max level 128 km/h in band, prop FM 0.50 in band, descent
terminal 20.7 m/s in band; P5 still fails on 0 to 100 in 0.75 s against a
1.3 to 1.9 band, and P4 still fails on 80 percent climb in 572 ms against
150 to 400. Both were failing before this change and neither is touched by
it: both are vertical axis measurements and the vertical axis is bit
identical. They stay on the owed list.

### Owed

- **Lap records are no longer comparable across this change.** Times on the
  race field get slower for the same flying, and the record key hashes the
  config and the pack voltage, not the plant. Same class of break as round
  16c's WORLD_SCALE.
- P4's 80 percent climb and P5's 0 to 100 are both far faster than their
  bands and always have been. They are the same finding twice: this airframe
  accelerates vertically harder than the gate document expects, which is a
  thrust to weight and motor constant argument, not a drag one.
- Gyro noise, and behind it RPM filtering and dynamic idle, unchanged from
  round 17.
- Unsteady propwash, unchanged from round 17.

## Round 17c: the tune was carrying the rates, so the tune could not be judged

The owner, after flying round 17b: "feels better, the default tune feels
better, the karate tune does not, the tune should not change the rates, the
rates should be changeable in the menu and be actual rates, they should start
at betaflight default". And: do the last thing that is failing.

### The Karate preset was two changes wearing one label

It shipped with sugarK's own racing rates, because the published preset offers
them and a race tune on 670 deg/s defaults is not a race setup. That reasoning
was right about racing and wrong about this shell: selecting Karate changed
the tune AND took the sticks from 670 deg/s with no expo to 420 with 0.54, in
one keypress. Nobody can judge a tune through that. The owner flew it and
reported exactly what the arrangement guarantees: the default felt better and
Karate did not.

**No file in configs/ carries a rateprofile any more.** `configs/rates.js`
owns the rate profile and the shell appends it to whichever tune is loaded,
including a diff the pilot drops on the page. A flown config is now
`tuneText + ratesText`, composed in one place in `src/main.js`, and the rate
lines go last so a tune that still carried rates would be overridden rather
than silently winning.

Measured at IDENTICAL rates, which is the comparison that was impossible
before:

| | Betaflight default | Karate race |
|---|---|---|
| roll rise to 90 pct | 57 ms | **48 ms** |
| roll stop to zero rate | 80 ms | **55 ms** |
| yaw rise to 63 pct | 92 ms | **70 ms** |
| roll overshoot | 3.1 pct | 14.5 pct |
| roll stop reverse bounce | -14.6 deg/s | -76.9 deg/s |
| roll settle to 2 pct | 156 ms | 184 ms |
| max forward speed | 147 km/h | 147 km/h |

That is the real character of an aggressive race tune: quicker to start,
quicker to stop, and less damped, because D max drops 30 to 21 and the 250 Hz
race link's feedforward boost of 18 sharpens the leading edge. The overshoot
and the bounce are measured against an INSTANT full stick step, which no
radio can produce, so they read worse here than a thumb would ever make them.
Whether that trade is wanted is now a question the owner can answer by
flying, which it was not before.

### Rates, in the menu, and ACTUAL

Four items at the top of Settings, starting at Betaflight 4.5.1's own
defaults from `pgResetFn_controlRateProfiles`: 70 deg/s at centre, 670 at
full stick, no expo.

- **Rate, roll and pitch** and **Rate, yaw**, deg/s at full stick.
- **Centre sensitivity**, deg/s at half stick.
- **Expo**.

ACTUAL only, and that is a decision rather than a shortcut: it is the one
Betaflight curve whose numbers mean what they say, so the menu can show deg/s
instead of a slider with invented units. Every offered value is a multiple of
10 because the firmware stores rc_rate and srate in tens of deg/s in a uint8,
and a stored value from an older build is snapped onto the offered list so it
cannot put an out of range number into that field. 420 is in the list so
sugarK's own rates remain one keypress away.

Changing a rate re-inits the module and resets the craft, exactly as changing
a tune does, and the comparison that decides it is the rate TEXT rather than
the fields, so there is one definition of "the rates changed" and it is the
one the firmware sees.

`configs/freestyle.diff` is deleted. Once its rates moved out it was byte for
byte the same tune as `betaflight-default.diff`, and two menu entries for one
tune is a worse answer than one. `scripts/gates.js`, `scripts/flight-report.js`
and the judge loop now read `betaflight-default.diff`.

Verified in the live page: boot on Betaflight default at 70/670/0 with
p_roll 45 and D max 30; switch to Karate and p_roll goes 38, D max 21, TPA 70,
**and roll srate stays 67**; then set 1000 deg/s and 0.30 expo in the menu and
srate goes 100 with the tune untouched. Zero console errors.

### The last failing check cannot be fixed honestly, and is not faked

Check 10 yaw-coupling wants |body yaw drift| >= 2.0 deg over a 1 s full stick
roll. It measures -0.079 deg: right sign, 25 times short. It is filed as
dispute 6 in `.loop/threshold-disputes.md` with the full argument, and no
threshold was touched. The short version:

- STAGE1.md's own wording is "non-zero, correct sign", which passes today.
  The 2.0 deg floor is annotated in `tests/thresholds.json` as a Loop A
  harness choice to make "non-zero" measurable.
- A symmetric QUADX yaws EXACTLY zero in a roll, for any nonlinearity,
  because each roll pair holds one clockwise and one counter clockwise motor
  and the spin weighted sum cancels term by term. So the coupling can only be
  build asymmetry.
- The modelled asymmetry is tangential motor cant. Rebuilt and measured with
  the whole set scaled: x1 gives -0.079 deg, x5 gives -0.600, x25 gives
  -1609 because the craft has tumbled. Reaching -2.0 deg needs about x13,
  which is 12 to 18 degrees of thrust axis cant per motor. That is visible to
  the naked eye and costs 3.4 percent of a motor's vertical thrust.
- A realistic 2 percent motor constant spread contributes about 0.003 N m
  against the cant term's 0.008, so it moves the answer by tens of percent,
  not by a factor of 25.
- The quantity a pilot calls "the nose moved in that roll" is HEADING change,
  not the body frame integral of r. Measuring that would test the thing the
  check is named after, and it is a `tests/` change, which is not this side's
  to make.

### Verify

npm run verify: **15 of 16**, check 10 the one red, at -0.08 deg and disputed
rather than dressed up. Every other check identical to round 17b including the
determinism hash **ff32caab7fbd** across Node, headless Chrome and four render
rates. npm run lint:presets: 2 of 2, betaflight-default 87 applied 9 inert 0
unrecognised, karate-race 107 applied 13 inert 0 unrecognised.

### Owed

- Lap records from before round 17b are not comparable, and now neither are
  records from before this round, because the record key hashes the config
  text and the rate lines are part of it. That is correct behaviour: a lap on
  1200 deg/s rates is not a lap on 670.
- Gyro noise, RPM filtering, dynamic idle, unsteady propwash: unchanged from
  round 17.
- P4's 80 percent climb and P5's 0 to 100, both already disputed as entries 1
  and 2, both untouched by this round.
## Round 18: a track builder, in its own directory, sharing one JSON schema and nothing else

A self contained course authoring tool: drop elements on a scaled grid, set
which way each one is flown, switch between a top down authoring view and a 3D
preview, and press Create Path to derive the racing line. It does not fly,
score or simulate. It produces a track document as JSON.

### The isolation rule, and what it cost

The brief was blunt: the flight sim is under development in parallel and this
must not touch it. Everything new is under `src/trackbuilder/`. The only edit
to existing code is fourteen lines in `src/ui/ui.js`: a **Track builder** entry
on the title menu and the `act()` branch that routes to it.

The builder is a **separate page**, not a screen inside the shell, and that is
what made the fourteen lines enough. Navigating to it tears the simulator down
completely: no shared canvas, no shared module, no shared state, no chance of a
half torn down physics loop still holding a WebGL context. `git diff --stat`
outside `src/trackbuilder/` is one file and fourteen insertions.

Nothing under `src/trackbuilder/` imports anything above it. `grep "from '\.\./"`
over the directory returns nothing, which is the mechanical form of the rule.

### Three bugs the tool found in itself

**The tangent scale was a factor of three short.** The racing line is a cubic
Hermite with tangents scaled by the distance to the next knot. The number
everyone knows for fitting a circle with a cubic is `(4/3)tan(theta/4)R`, which
is `0.5523R` for a quarter circle, and it went straight into the constant. It
is wrong: that figure is the offset of a **Bezier control point**, and a
Hermite tangent is three times a Bezier control point offset. A cubic whose
tangents are too short does not gently straighten, it puts a **near cusp at
every knot** whose tangent is not already along the chord. Measured on a 120 m
demo lap it gave a radius of curvature of **0.2 m at almost every gate**.

The correct ratio is `2 tan(theta/4) / sin(theta/2)`: 1.000 for a straight,
1.072 at 60 degrees, 1.172 at 90, 1.333 at 120. No single constant is right
everywhere, so 1.1 is the middle of the range a racing line turns through.
`selftest.js` now lays five gates on a 12 m circle and asserts the line comes
back with a 12 m radius, within 3 percent. That is the check that catches it,
and it is the one the first version did not have.

**It was the curvature warning that found it.** The warning the brief asked for
as a nicety turned out to be the only instrument in the tool, and it was
reading 0.2 m on a track that looked fine drawn small.

**A tilted dive gate came out a launch gate.** The obvious auto face rule is:
point the element along the course, then take the entry sign from the dot
product with the normal. For a **vertical** gate that is right. For a **tilted**
one it is exactly backwards: the heading lines up with the travel, the dot
product comes out positive because of it, and the quad is sent UP through a gate
that leans down the hill. The tilt fixes the vertical part of the normal and
nothing can change it, so the sign has to be decided FIRST, from whether the
line is descending here, and the heading SECOND, to make the horizontal part
agree. The fix rotates the structure a half turn instead.

The vertical sense is read from the **departure**, not from the chord across
the element. A dive gate sits 3 m above the gate before it and 3 m above the
gate after it, so that chord is level and says nothing, while the obvious truth
is that you leave the thing going down. Reading the chord left a 1.8 m radius
hook immediately after every dive gate.

**A gate turned to face due west flipped sign on every save.** The document
rounds every number to six decimal places, and pi rounded to six places is
3.141593, which is 3.5e-7 LARGER than pi. `wrapAngle` sent it to -3.141593,
which rounds to itself, which is smaller than -pi, which wrapped back. Export,
import, export was not idempotent for exactly one heading. `wrapAngle` now
carries a microradian of slack at both ends.

### What the warnings decided, deliberately

**The reversal test is horizontal.** A flat dive gate is flown straight down,
its tangent has no horizontal part, and the previous element is almost always
lower than it: the quad climbs past the gate and drops back through it, which
is what the obstacle is for. Testing that in three dimensions fired on every
correctly built dive gate on every track, and a warning that is always wrong is
a warning nobody reads. What catches a vertical approach nothing could fly is
the curvature check.

**Markers are exempt from it.** A flag has no aperture and no plane, so its
tangent is not a property of the marker at all, it is the chord between its
neighbours. Testing that against one of those same chords tests the shape of
the course rather than anything the author set, and it fires whenever a marker
sits at a turn apex, which is the one place a turn marker is ever put. Telling
somebody to flip the face of a cone, which has no face, is worse than silence.

### The demo track, and what laying it out taught

The worked example in `schema.md` is emitted by `selftest.js --emit` and the
same file asserts it round trips byte for byte, so the document and the
implementation cannot drift. Getting it to derive itself cleanly took longer
than writing the deriver, and the reason is worth recording:

**The auto face rule takes an element's heading from the straight line between
its neighbours, so an element at a hairpin apex, with both neighbours off to
one side, is the one case it cannot get right.** Every layout with a hairpin
put a gate at the apex and produced either a reversal or a cusp. The answer is
that a hairpin apex is a place for a MARKER or for a manual override, never for
a gate, and that a course laid on a smooth closed curve derives itself.

So the demo is a **figure of eight** read off a lemniscate centred on the
ladder, which is also the only closed curve that flies one structure twice in
opposite directions without a hairpin. Ten entries, a ladder at positions 4 and
9 on two levels with opposite faces, an angled dive gate, a flag turn, a
barrier the line misses, and a lap that closes: 138.9 m, tightest radius
2.73 m, no warnings. Exactly one manual override in the whole document, on the
ladder's heading, because the rule refuses to rotate a structure flown twice
and the heading it inherited from the first pass left the second 67 degrees off
square.

### Two things measured in a browser, not assumed

**Three.js was on the critical path of the whole tool.** A static
`import * as THREE from 'three'` in `view3d.js` means the browser fetches the
entire static module graph before a line of `app.js` runs. On a network that
could not reach jsdelivr, that is a blank page: no palette, no canvas, no 2D
view, for a preview the author had not asked for. It is a dynamic import now,
taken on the first press of the 3D button, and a failure falls back to 2D with
a message. Same reasoning as `src/boot.js`, same fix.

**The dev server has no MIME type for `.css`**, so it served the stylesheet as
`application/octet-stream` and Chrome refused to apply it. `scripts/serve.js` is
not this module's to edit, so the styles are inline in the page, which is what
the repository's own `index.html` does anyway.

**1 inch PVC is sub-pixel.** MultiGP gates are built from 1 inch schedule 40
pipe, 33 mm, and at any camera distance that shows a whole 60 m course that is
under a pixel: the 3D preview was a field of floating translucent panes with no
gates in them. Each aperture now carries a line loop around its **true clear
opening**, because a line is one pixel wide however far away it is. No
dimension was fattened to make the picture work.

### Owed

- **The MultiGP dimensions in `elements.js` are approximations, not citations.**
  They were transcribed from memory of the obstacles page rather than read off
  it, and every one carries a VERIFY comment naming what has to be checked. The
  existing `src/game/track.js` has properly sourced figures for the same
  obstacles; the two libraries are deliberately not shared, because the builder
  may not import from the game, and they should be reconciled when the game
  learns to read a track document.
- The auto rule will not rotate a structure flown more than once, so a ladder
  crossed at an angle inherits the first pass's heading and the second pass can
  be well off square. Bisecting the two would be better and is a change to the
  rule the brief specifies, so it was left alone and the demo overrides by hand.
- The 3D view is read only apart from the height drag, as specified. Rotation,
  move and delete are 2D only.
- Nothing consumes the track document yet. `schema.md` is the contract and the
  game has not been taught to read it; that integration was explicitly not part
  of this task.

### Verify

`node src/trackbuilder/selftest.js`: **74 of 74**, covering the round trip,
the repair path against hostile input, the face and pass side rules, the
racing line including the circle check that pins the tangent scale, every
warning code, undo and redo, and `schema.md`'s worked example.

A headless Chrome harness in the scratch directory drove the real page: build a
ten element track from the palette keys and the mouse in **0.7 s** of wall
clock, ladder at two levels, Create Path, box select, drag, rotate, flip,
reorder, save, autosave across a refresh, export and import round trip, the
3D scene with the height drag, and the games menu entry navigating to the
builder. 30 of 30, plus 9 of 10 on the 3D suite, the one failure being the
harness reading back a WebGL canvas without `preserveDrawingBuffer`, which the
screenshots disprove.

`npm run verify`: **14 of 16**, and the two reds are the ones this container
has always had. Measured both ways on the SAME base rather than argued:
checking out `origin/main` with the track builder absent gives the identical
table, check 1 build-clean failing on `emcc not found` with `EMSDK` unset, and
check 10 yaw-coupling at -0.08 deg against a 2 deg floor. Nothing in this round
touches `src/native/`, `patches/`, `vendor/betaflight`, `src/input/` or the
build. Determinism hash **ff32caab7fbd**, matching the base exactly.

This round was rebased onto rounds 17, 17b and 17c after they landed. Round 17c
put a **Tune** entry on the same title menu this one adds to, and the two edits
merged without a conflict; the menu now reads Fly, Map, Tune, How to fly,
Settings, Track builder, and the harness above drives the real title screen
down to the last of those and through to the builder.

An earlier run of check 16 map-isolation, against the pre-rebase base, failed
on a clean tree and passed with the change applied, which was recorded here as
something that moves between runs. On the rebased base it passes both with and
without, so that reading was a flake and is now accounted for rather than left
hanging.

## Round 19: the sticks were sampled at the frame rate and told the controller they were a 250 Hz link

The owner, asked what to work on next: "all i care about is feel, not a
simulated version of betaflight necessarily, we don't need wind nor accurate
hover, just feel on the sticks when ripping". That reframing sent the review
somewhere it had never looked, because every round so far had treated this as
a physics problem and the worst defect in the project was in the shell.

### What was wrong

`src/main.js` called `input.poll(nowWall)` once per rendered frame, took
`samples[samples.length - 1]`, and used that one value for every RC frame in
the block:

```
const latest = samples.length ? samples[samples.length - 1] : input.channels;
while (rcNextMs < simStepMs + steps) {
  sim.input(ts, latest.roll, latest.pitch, latest.yaw, latest.throttle);
```

So the stick information rate WAS the display frame rate. At 60 fps the
flight controller saw the same value four times and then a jump, while
`updateRcRefreshRate` was being handed 4 ms intervals and told it the link
ran at 250 Hz. Two consequences, and the second is the one a pilot feels.

Betaflight auto-tunes its rc smoothing cutoffs from the interval it measures,
so it filtered for a 250 Hz link and the 60 Hz staircase walked straight
through it. And **feedforward is the derivative of the setpoint between rc
frames**, so it saw zero, zero, zero, spike: an impulse train at frame rate
instead of a signal. Feedforward is most of what makes a quad feel connected
to a thumb.

It also explains a number this project had already measured and explained
away. Round 17c recorded the Karate tune overshooting 14.5 percent with a
-77 deg/s bounce on "an INSTANT full stick step, which no radio can produce".
The shell was producing one every frame.

Gate P7 has said "gamepad sampled per frame in src/main.js, not on an
independent 250 Hz path" since it was written. It was filed as a latency
gate. Nobody had connected it to feedforward.

### What it is now

**The pad is polled on its own timer**, `input.startPolling(2)`, independent
of requestAnimationFrame, and every sample carries the wall clock time it was
taken at.

**Samples are placed on the RC grid by timestamp**, not collapsed to the
newest. The wall to sim mapping is re-derived every frame rather than
carried: a sample taken `nowWall - wallT` ms ago belongs that many ms before
the end of the block this frame is about to step. The two clocks advance
together while flying and the mapping self corrects across the freezes where
they do not, which is the lesson round 16b paid for.

**The achieved rate is measured, not claimed.** Whether polling faster than
the frame rate actually yields fresher data is a property of the browser and
the device and this code cannot assert it, so `input.stats()` counts how
often the Gamepad object's own `timestamp` changes (`padHz`) and how often a
changed value reaches the queue (`sampleHz`), and the performance readout
shows both next to the link rate. If padHz tracks the frame rate then the
browser is rAF-locked on gamepad input and only WebHID will move it.

### Measured, against a perfect stick path

The shell's frame loop replicated against the real sim.wasm, both consumers
driven with the same pilot, a 1.5 Hz full travel roll sweep. The reference is
every RC slot getting the pilot's true value at that slot's own moment, which
nothing real can beat. Deviation is RMS setpoint error against it, in deg/s.

| | setpoint roughness | deviation from perfect |
|---|---|---|
| perfect stick path | 0.0033 | 0.0 |
| 30 fps, old | 0.0131 | 83.1 deg/s |
| 30 fps, new | 0.0033 | **0.0 deg/s** |
| 60 fps, old | 0.0093 | 43.4 deg/s |
| 60 fps, new | 0.0033 | **0.0 deg/s** |
| 144 fps, old | 0.0055 | 20.4 deg/s |
| 144 fps, new | 0.0033 | **0.0 deg/s** |
| 240 fps, old | 0.0034 | 14.1 deg/s |
| 240 fps, new | 0.0033 | **0.0 deg/s** |

The new consumer is indistinguishable from a perfect stick path at every
frame rate tested, and it is FRAME RATE INDEPENDENT. The old one's stick feel
was a function of the graphics card: 83 deg/s of setpoint error at 30 fps,
14 at 240.

The caveat that matters: the replica's poll produces a genuinely new pilot
value every 2 ms. In a browser the consumer side is now perfect, and the
achieved sample rate is whatever the Gamepad API gives, which is why it is on
screen.

### What was measured on the way and rejected

Two candidates for "the standard tune feels mushy" were tested and killed,
which is worth as much as the fix:

- **Motor lag.** Rebuilt with `r_motor` 0.09 to 0.045 and `j_rotor` 6e-6 to
  8e-6: roll rise to 90 percent moved 57 ms to 56, overshoot 3.1 to 2.8,
  stop 80 to 81. The closed loop is not motor limited, so the coupled motor
  and ESC re-derivation buys nothing a pilot would feel and stays deferred.
- **Gyro filter phase lag.** Stock tune with the Karate gyro filters bolted
  on and nothing else: 58 ms against 57, overshoot identical. The D term
  filter owns the phase budget; the gyro pair is not in it.

What DOES separate the two tunes, isolated the same way: `iterm_relax_cutoff`
15 to 45 and `pidsum_limit_yaw` 400 to 1000 together give 49 ms rise, 57 ms
stop and 70 ms yaw, against Karate's own 48, 55 and 70. The whole difference
is two limits. The simulator is reproducing real tuning correctly and stock
Betaflight is simply conservative.

**The gyro noise recommendation from the round 17 review is withdrawn.** It
was argued on the grounds that filters are otherwise pure lag, which is true
and is an argument about Betaflight fidelity rather than about stick feel.
Gyro noise is felt as motor heat and seen as jello, not felt through the
sticks.

### A defect this round introduced and caught

`rcPending` grew for as long as the page was open. Samples taken while the
integrator is not running, the title screen, a crash lockout, every second
parked on the ground, have no slot to land in, and nothing was dropping them:
measured 29 pending after six frames and 160 after twenty, at the 100 ms
heartbeat alone. The newest is kept so the first flying frame starts from
where the sticks really are, the rest are dropped, and there is a hard bound
underneath. Now steady at 1.

`window.__stick` was also already taken, by a harness stick INJECTOR at line
1848, so the new readback silently shadowed it and returned `{}`. Renamed to
`window.__stickPath`; the injector is untouched.

### Verify

npm run verify: **15 of 16**, check 10 the same disputed red. Determinism
hash **ff32caab7fbd** unchanged across Node, headless Chrome and four render
rates, which is the expected result: the harness drives the module directly
and never touches the shell's input path, so no check in tests/ could have
caught any of this. Console clean on both maps. npm run lint:presets 2 of 2.

### Owed

- **WebHID**, which STAGE1.md names as the primary input path and which has
  never been built. If the readout shows padHz tracking the frame rate on
  real hardware, this is the only remaining fix and the consumer side is
  already ready for it.
- Propwash, still exactly zero, and now the top physics item.
- Rotor drag applied at the rotor plane rather than at CG height, for the
  nose up push as speed builds. Cheap.
- Everything else from the round 17 review, unchanged.

## Round 20: propwash, and a dead performance readout that had never worked

The owner: "the performance read out isn't working, whats the next thing we
can do to make it feel more real".

### The readout had never worked, and the bug is one word

`index.html` styles `.readout` with `display: none`. `setReadout` did

    this.readout.style.display = this.settings.readout ? '' : 'none';

and `''` REMOVES the inline declaration, which hands the element back to the
stylesheet rule, which is `display: none`. So the setting toggled, the text
was computed and written into the element every frame, and nothing was ever
visible. `'block'` instead of `''`. Confirmed in the page: display block, and
the frame rate, draw calls, triangle count and the new stick rate line all
render.

This is why the stick rate measurement from round 19 could not be read. It
can now.

### Propwash

The plant had a vortex ring model that removed thrust correctly and a per
motor asymmetry, `PLANT_INFLOW_ASYM`, that was FIXED. A constant disturbance
is exactly what an I term is for, so it was trimmed out inside a second:
measured in a 12.7 m/s descent at 0.04 deg/s of gyro. Recirculating flow is
unsteady and none of that was modelled.

There is a turbulence field now: one band limited channel per rotor, 3 to
30 Hz, which is where a five inch quad's propwash lives. Below that band an I
term simply trims it and above it the D term filter eats it, so neither end
is what a pilot feels. It runs every step whether the craft is in the wash or
not, so flying into it does not restart it, and it is applied scaled by how
deep each rotor is in its own wake. The four channels are independent, so the
disturbance is a torque as well as a thrust wobble, which is why it reads as
shake rather than as sink.

Deterministic by construction: xorshift32 on a seed carried in `SimState` and
reset with everything else. Integer operations only, no host RNG, no float
hashing. The hash moved to **da9f48460f62** and is identical in Node, headless
Chrome and all four render rates.

### The gate was wrong first, and the fix is the textbook criterion

The first version keyed the wash on the same `mu` the thrust loss uses, the
axial speed over the PITCH speed. Pitch speed is 15 to 47 m/s depending on
throttle, so at race throttle the wash needed 14 m/s of sink before it
started, and a dive pull out or a hard descending turn produced nothing.

The right ratio is the descent rate against the rotor's own INDUCED velocity,
`v_h = sqrt(T / 2 rho A)`: recirculation begins near a quarter of it, is worst
where the descent rate matches it, and is gone past about twice it, where the
windmill brake state is established. That ratio scales with thrust, which is
why it finds the cases a pilot meets.

The thrust LOSS still keys on mu. The two criteria disagree, which is a known
seam recorded at the code: the loss model is what checks 5 through 12 were
measured against and it is not being disturbed to improve the shake.

### Measured, and the shape is the point

Settled descents, tracking error being gyro against what the sticks asked
for, so a commanded rate is not counted as a disturbance:

| descent | ratio to induced velocity | wash depth | tracking error, before -> after |
|---|---|---|---|
| -0.9 m/s | 0.13 | 0.13 | 0.0 -> 4.5 deg/s |
| -3.8 m/s | 0.63 | 0.63 | 0.0 -> **20.7 deg/s** |
| -11.6 m/s | 2.50 | 0.04 | 0.1 -> 2.2 deg/s |
| -15.6 m/s | 4.83 | 0.00 | 0.0 -> 0.0 deg/s |

That bell is the whole point and it is what pilots report: the shake is worst
in a moderate descent and a fast vertical drop is smooth again, because by
then the rotor is in a clean windmill brake rather than eating its own wake.
A throttle chop from cruise touches depth 1.00 transiently.

Hover, climb and punch cannot see it by construction, because the gate needs
a descent: hover throttle 0.2051, punch 82.1 m, terminal 31.3 m/s and motor
step 18 ms are all unchanged to the digit.

### Three wrong measurements before a right one, and the fix for that

- The first dive pull out probe measured total gyro, which is 193 deg/s of
  COMMANDED pitch rate, and read identical on a build with no propwash at
  all. Measuring the manoeuvre, not the disturbance.
- The second measured tracking error but averaged over a window that began
  with its own setup's climb out, so the mean axial velocity came out
  POSITIVE, meaning climbing, in every case labelled a descent.
- The third assumed a 60 degree banked turn descends through its own wake. It
  does not: a banked craft translating fast has its disc tilted into clean
  air, which is translational lift, and the model was right to stay quiet.

Having guessed three times, `PLANT_DBG_WASH_DEPTH`, `_RATIO` and `_VA` were
added and exported through `sim_bf_debug` 46 to 48. The table above came from
those taps and the gate bug was visible in one run. They stay.

### Verify

npm run verify: **15 of 16**, check 10 the same disputed red at -0.09 deg.
Checks 5, 6, 7, 8, 11 identical. Check 9 rate tracking 669.6 to 670.5 deg/s
and check 12 ratio 1.2546 to 1.2534, both moved by the wash a rolling craft
now picks up, both well inside tolerance and check 12 closer to target than
before. Determinism hash **da9f48460f62**, identical across Node, headless
Chrome and four render rates. Console clean.

### Owed

- The two wash criteria, mu for the thrust loss and v_h for the shake, should
  become one. That means re-deriving the loss model on v_h and re-measuring
  checks 5 through 12 against it.
- `k_propwash` 0.60 is a thrust fraction at full depth, set so the worst case
  lands at 20.7 deg/s of tracking error, which is inside the 10 to 40 deg/s a
  well tuned race quad shows. It is the one number here chosen by outcome
  rather than derived.
- WebHID, unchanged from round 19, and now readable: the stick rate is on
  screen.

## Round 21: the audit the owner asked for, and five constants that were wrong

The owner: "prop wash is way too much, check all your maths also, it does
feel good, but you've made a lot of errors". Both halves are correct. The
propwash gain was set by outcome rather than derived and it was four to five
times too large, and re-deriving every constant this session added found four
more errors, one of which is in text the pilot reads.

### The errors, each re-derived rather than re-asserted

**1. The propwash gain.** `k_propwash` 0.60 means 60 percent RMS thrust
modulation per rotor at full recirculation depth. The band passed signal's
tail reaches 4.0 sigma, so single rotor excursions hit 240 percent. Published
measurements of rotors in the vortex ring state put thrust unsteadiness
nearer 5 to 20 percent. It is 0.12 now, and the applied wash is bounded at
3 sigma so the tail cannot slam a rotor. Round 20 recorded this constant as
"the one number here chosen by outcome rather than derived", which was honest
about the method and wrong about the value.

**2. `PLANT_WASH_RMS` was 0.173 and carried a comment saying "measured off the
filter pair, not guessed".** It had been estimated, not measured. Run over
four million samples of the actual filter pair it is **0.16730**. The comment
was the worse error of the two: a number being wrong is ordinary, a comment
asserting provenance it does not have is how a wrong number survives review.

**3 and 4. Both filter coefficients were wrong.** `1 - exp(-2 pi f dt)` at the
1 kHz step is 0.171796 at 30 Hz and 0.018673 at 3 Hz. The file said 0.171876
and 0.018665: digits transposed in the first, a rounding error in the second.

**5. `k_rotor_drag` was 0.4386 against a derivation of 0.43842.** 0.04 percent,
which changes nothing measurable, but the derivation is written out three
lines above the constant and the two should agree.

**6. The wash onset contradicted its own comment.** The comment said
recirculation "begins around a quarter" of the induced velocity; the code was
`d = 1 - |rw - 1|`, which ramps from rw = 0, so the gentlest sink already
carried wash. It is zero below 0.25, peaks at 1.0 and is gone by 2.0 now, and
a 0.9 m/s descent that used to shake reads exactly zero.

**7. "Centre sensitivity is the deg/s you get at half stick" is wrong, and it
was wrong in the menu note as well as in the code.** From fc/rc.c
applyActualRates, `angleRate = stick * rc_rate * 10 + stickMovement * expof`.
At full stick expof is 1 and the rate is exactly `srate * 10`, so max rate
does mean what it says. Centre sensitivity is the SLOPE at centre, the
coefficient on the linear term. With the Betaflight defaults, 70 and 670 and
no expo, the curve is 13 deg/s at a tenth of stick, 55 at a quarter, **185 at
half**, 390 at three quarters, 670 at the stop. Both the module comment and
the text in Settings said 70. Corrected in both.

### What was re-derived and found correct

- The Glauert closed form `y^2 = 2 / (sqrt(x^4 + 4) + x^2)`, checked against
  an iterative solve of `v_i = v_h^2 / sqrt(v_perp^2 + v_i^2)` over x in
  0 to 40: max error 4.5e-5. The cancellation argument also holds, the
  algebraically equal `(sqrt(x^4+4) - x^2)/2` returns 8.63e-5 at x = 1e4
  against a true 1e-4, which is 14 percent out.
- Disc area, hover induced velocity 7.1656 m/s, the rotor drag hover
  calibration, the xorshift32 output mapping to -1..1, the omega cross r
  in plane velocity and the yaw moment of the rotor drag force.
- `getDigitalIdleOffset` against Betaflight's own: 550 gives 0.055.
- The stick path's wall to sim mapping, already proven by the round 19
  replica returning 0.0 deviation from a perfect stick path.

### Propwash after the correction

Same probe, same manoeuvres, tracking error being gyro against what the
sticks asked for:

| descent | ratio to induced velocity | before | after |
|---|---|---|---|
| -0.9 m/s | 0.13 | 4.5 deg/s | **0.0** (below onset) |
| -3.7 m/s | 0.62 | 20.7 deg/s | **3.4 deg/s** |
| -11.6 m/s | 2.50 | 2.2 deg/s | 0.5 deg/s |

The shape is unchanged and still the textbook one. The amplitude is six times
smaller and now follows from a stated thrust fluctuation rather than from a
gyro number someone liked. It may well be too subtle at 0.12; that is one
constant in plant.c and the honest place to be after "way too much".

### Verify

npm run verify: **15 of 16**, check 10 the same disputed red. Hover 0.2051,
punch 82.1 m, terminal 31.3 m/s, motor step 18 ms and sag 10.15 percent all
unchanged. Check 9 669.8 deg/s and check 12 ratio 1.2542, both closer to
target than last round now that the wash a rolling craft picks up is smaller.
Determinism hash **ce9826fc2ce5** across Node, headless Chrome and four
render rates. npm run lint:presets 2 of 2.

### The process lesson, since it is the one that keeps recurring

Every error above is the same shape: a number written from a calculation that
was reasoned rather than run, then given a comment that sounded derived.
Round 20's own "three wrong measurements before a right one" was the same
failure in the measurement rig. The rule that would have caught all of them
is cheap: any constant that is not copied from a source file gets computed in
a scratch script whose output goes in the commit, and no comment claims a
number was measured unless the measurement is in the record.

## Round 22: the track builder's output, flown, on a pitch that is mown for it

Round 18 produced a track document and nothing that could read one. This round
makes the race field build itself around a designed course, so a track goes
from the drawing board into the air in one press.

### The seam, and only one seam

`src/game/trackdoc.js` reads a document and returns a **course**: obstacle
placements in scene coordinates, a spawn, and the racing line. It is pure. It
converts frames, applies the game's obstacle scale, and touches no Three.js.

`buildFieldScene(shell, onProgress, course)` gains one optional argument.
Without it the built in figure eight is built exactly as it always was, same
curve, same fourteen stations, same rng stream, and `npm run verify` checks 15
and 16 say so. With it, the same valley is built around the designed course:
same sky, same ridges, same lake, same grass, same light, same post chain.

`src/maps/custom.js` is a third map, **Your track**, that fetches the document
the builder is working on and hands it over. That is the whole of the wiring.

**The direction of the dependency is one way and it is deliberate.**
`trackdoc.js` imports the builder's `model.js`, `elements.js`, `geometry.js`
and `path.js`, which are pure data and pure functions. The alternative, a
second implementation of `normalize()` and of the aperture maths living in the
game, is exactly the drift `schema.md` exists to prevent: two readers of one
format disagreeing about what a tilted gate means is a bug nobody would find
until a course flew wrong. The builder still imports nothing from the game.

### Three assumptions the integration turned into data

Each of these was correct for the built in circuit and correct for nothing
else, and each is now read off something the code already had.

**Flying order.** `Race` derived it as `[0, n-1, n-2, ... 1]`. That is right
for the figure eight for one reason: its stations are laid along a curve and
flown in reverse, so array order IS reverse flying order there. The scene has
always stamped `flyOrder` on every gate; sorting by it produces the identical
sequence for the field, asserted over the real fourteen, and the right one for
a designed course.

**The glow corridor.** `setNextGate` lit `i - step` through the array, for the
same reason and with the same blind spot: on a course whose gates are in
flying order it lit the three gates BEHIND the pilot. It walks `flyOrder` now.

**`obstacle()` took a library key** and looked the dimensions up itself, so it
could only ever build one of MultiGP's fifteen. It takes a spec. The race field
passes `builtObstacle('standardGate')`; a course passes what its document
carries. The T1 assertion still fires, against the source of truth each one
actually has.

### The tilt, and why it is not obstacle() with an angle

A dive gate's aperture is horizontal. `obstacle()` builds a structure that
stands on the ground: two uprights from the grass to the top rail, feet, mesh
panels. Rotating all of that about the opening lays the uprights over and puts
the feet in the air, and a gate whose legs point sideways is not a gate
somebody built, it is a gate somebody knocked over. A real dive gate is a frame
on a mast, so `tiltedGate()` makes that, sharing the lit target and the number
plate with `obstacle()` through two extractions rather than a hand copy.

`Race`'s crossing test generalised with it, from a yaw only frame to the
opening's full basis, with the origin moved from the gate's base to the
opening's own centre because a tilted plane pivots about the hole rather than
about the ground under it. **At pitch zero the new arithmetic is the old
arithmetic**: measured over twenty thousand random gates and points, the worst
disagreement is 3.6e-15, which is double precision noise. That was worth
measuring rather than arguing, because it is the scoring path for a track
somebody already has a record on.

### The spawn faced the wrong way, and the harness caught it

A gate's document yaw points its plane NORMAL, so its scene yaw is that angle
plus a quarter turn. The start pads' document yaw points **the way the quad
sets off**. Reusing the gate formula for the pads sent the craft out backwards
with the first gate behind its right shoulder. It was not visible in a
screenshot, because a quad parked on grass looks the same either way; it came
out of `__nextGate`, which reports whether the next gate is in front of the
camera, and said `inFront: false`.

The fix runs the pads' heading through `headingForTravel`, which is the one
place the game's travel convention is written down and the reason that
function exists.

### The football pitch

The first build put the course in the meadow and it was wrong in a way that
took a screenshot to see: **trees standing between the gates**. The scenery
keeps 15 m off the racing line, which on a 210 by 236 m circuit is a clearing
and on a 60 by 40 m field is a tree beside a gate. Pushing the scenery further
out would have fixed the collisions and left the course sitting in an arbitrary
bald patch.

So a designed course gets a real arena, which is the owner's call and a better
one: a rectangle the size of the field its author drew plus 8 m of run off,
**levelled flat**, mown, striped the way a groundsman stripes a pitch, and
marked with a white line on the author's own boundary. The rule that keeps the
scenery off the course is now the same rectangle the player can see.

Levelling is not cosmetic. An author draws a plan on flat paper and sets base
heights against it, so a rolling metre under a gate puts their dive gate
through the ground.

**The markings are a texture, not terrain vertex colours**, and that was the
second thing a screenshot decided. The terrain is a 1700 m plane at 230
segments, so its vertices are 7.4 m apart: a 0.3 m touchline painted into a
vertex colour is a line 25 times finer than the mesh carrying it. It vanished
completely and the stripes came out as one smear. The pitch has its own plane
and its own painted texture, transparent at its edge so the mown rectangle
fades into the meadow rather than ending on a cut line.

### Two smaller things the same work exposed

**A map named in the URL left the Map row stale.** `main.js` wrote the setting
after the `Ui` had already built its rows, so `?map=custom` landed in the
settings and the menu still read the map it was not showing. Only reachable
once the builder started linking to `?map=custom`; before that the two could
never disagree at that line.

**The module counter's path was a ternary**, `field or else city`, so a third
map counted its modules under the city's prefix and the loading bar sat at
zero. It is a table now.

### Owed

- **Flags and cones are placed and solid but not scored.** The builder gives a
  marker a pass side and the racing line honours it; the race times apertures
  and ignores which side of a cone you went. Scoring a pass side is a different
  test from a plane crossing and it is not written.
- A structure flown twice shares one lit target and one number plate. There is
  one ladder standing on the field and lighting it twice is what a marshal
  does, but the pilot is told which level by the flight display rather than by
  the gate.
- The pitch is levelled but the terrain outside it is not aware of it beyond
  the fade, so a course laid over the lake would be a course laid over the
  lake. The builder warns about its own field boundary and knows nothing about
  the valley.
- `MAP_BUILD_MS.custom` is the field's figure rather than a measured one.

### Verify

`node src/trackbuilder/selftest.js`: **74 of 74**, unchanged, which is the
point: the builder was not touched except for one button.

A headless Chrome harness built the demo track in the builder, let it
autosave, opened `?map=custom` and checked the world that came out: **13 of
13**. The map is the custom one, named after the track, with one gate per
sequenced aperture, in flying order, the flight display counting them, the
start pads setting the spawn, the first gate in front of the quad, and the
glow corridor lighting the course ahead. The builder's own 30 check smoke suite
still passes.

`npm run verify`: **14 of 16**, the same two reds this container always has,
check 1 build-clean on `emcc not found` and check 10 yaw-coupling at
-0.08 deg. Checks 2, 3 and 4 pass: nothing in this round touches `src/native/`,
`patches/`, `vendor/betaflight`, `src/input/` or the build. **Check 15
world-scale and check 16 map-isolation both pass**, which is what says the
built in race field is the world it was: same reference gate opening, same
module count, same budget after a city round trip.

## Round 23: the default tune's yaw, and an upstream bug we reproduce faithfully

The owner flew both tunes and reported that the Betaflight default "has way
too much yaw" next to Karate, and that this "must be an error". It is an
error. It is not ours.

### What the complaint is not

Every measurement of yaw authority says the opposite of "too much". Both
tunes on the same menu rates, 70 centre and 670 max, full yaw stick:

| | default | karate |
|---|---|---|
| rise to 63 percent | 71 ms | 57 ms |
| overshoot of commanded rate | 10.1 percent | 8.4 percent |
| bounce back after release | 75 deg/s | 60 deg/s |
| heading achieved for 335 deg commanded | 329 deg | 331 deg |

Karate yaws harder and faster on every one. Uncommanded yaw is not it either:
rolls, flips, banked turns and weaves at 0.5 and 0.75 throttle all drift under
0.6 deg over three seconds, identical between the tunes to the tenth of a
degree. And the rates are not it: rates.js appends the same rateprofile to
whichever tune loads, and Betaflight's own default rateprofile really is
7/67/0 on all three axes including yaw, from pgResetFn_controlRateProfiles.

### What the complaint is

Yaw is the default tune's loosest axis by an order of magnitude, and it is the
only tune where the axes disagree. Same step, all three axes:

| stick | axis | default overshoot | karate overshoot |
|---|---|---|---|
| 0.3 | roll | 3.5 percent | 11.9 percent |
| 0.3 | pitch | 1.0 percent | 12.3 percent |
| 0.3 | yaw | **11.3 percent** | 12.1 percent |
| 1.0 | roll | 1.1 percent | 9.1 percent |
| 1.0 | pitch | 1.5 percent | 10.1 percent |
| 1.0 | yaw | **10.1 percent** | 8.4 percent |

On Karate all three axes sit near 10 and nothing stands out. On the default,
roll and pitch are pinned at 1 to 3 percent and yaw is at 10, so yaw is the
one axis that does not go where it is put. That is what reads in the goggles
as too much yaw: not more yaw, less control of it.

### The mechanism, and it is a known open Betaflight bug

Sweeping pidsum_limit_yaw on the default tune, everything else untouched:

| pidsum_limit_yaw | overshoot | peak abs I | ms with I at its cap | bounce |
|---|---|---|---|---|
| 400 (default) | 10.07 percent | 400 | 225 | 75 deg/s |
| 450 | 9.75 percent | 400 | 177 | 72 deg/s |
| 480 | 9.00 percent | 374 | 0 | 62 deg/s |
| 500 | 8.37 percent | 349 | 0 | 60 deg/s |
| 600, 800, 1000 | 8.37 percent | 349 | 0 | 60 deg/s |

There is a discontinuity between 450 and 480 and then nothing changes at all,
because past that point the limit stops binding. That is precisely
betaflight/betaflight issue 13486, filed 29 March 2024 and still open:
Betaflight's anti windup is driven only by getMotorMixRange against
itermWindupPointPercent, so an axis clipped below 50 percent of the mixer
range can never on its own reach the 85 percent windup point. The I term
integrates for the entire time the axis is saturated. Default yaw is clipped
at 40 percent, which is on the wrong side. Karate's 1000 is on the right side,
and its I peaks at 349 and never caps.

The rest is Betaflight doing what it says it does. d_yaw is 0 by default
because, in Betaflight's own words, yaw D is mostly a noise amplifier on an
axis with high rotational inertia and little authority. Our airframe agrees:
Izz 0.0068 against Ixx 0.0035, and sustained yaw torque 0.464 N m against
roughly 2.8 N m of roll torque at full thrust differential. Sweeping d_yaw
from 0 to 250 moves the full stick overshoot from 10.07 to 9.92 percent, which
is nothing; at small stick, where the axis never clips, adding D makes it
worse (11.2 percent at 0, 14.8 at 30, 20.7 at 80) because D slows the rise and
the I term then integrates a larger error for longer. The same sweep on roll
behaves the way a damping term is supposed to: 22.7 percent at d_roll 0, 3.3
at 20, 1.0 at 40. Yaw is I dominated and roll is not, which is the whole
difference between the two axes and is why real quads have loose yaw.

### What was changed

Nothing in the physics, nothing in the tunes. betaflight-default.diff exists
to be what a freshly flashed quad flies, and that includes flying an upstream
bug; patching it would make the file a lie and would remove the reference
point Karate is measured against. Both presets got a comment at their
pidsum_limit_yaw line recording the measurement and pointing at issue 13486,
so the next person to wonder about yaw finds the answer where they are
looking rather than here.

The pilot's lever, if the default's yaw is not wanted, is the yaw rate item
in Settings, which is where a real pilot would reach too. Most race pilots run
yaw below roll and pitch for exactly this reason.

### Verify

npm run verify: **15 of 16**, check 10 the same disputed red, unchanged from
round 21 because no code that runs changed. Determinism hash **ce9826fc2ce5**
across Node, headless Chrome and four render rates. npm run lint:presets 2 of
2 with the new comments in place.

### Rigs

tests/ is the harness's. The scratch rigs behind the tables above were
yawtrace.js (term by term through a stop), yawheading.js (commanded against
achieved heading), yawcouple.js (uncommanded yaw over four manoeuvres at two
throttles), axiscompare.js (the three axis table), dyaw.js and dyaw2.js and
dyaw3.js (the d_yaw sweeps and the term traces that explained them) and
bf13486.js (the pidsum_limit_yaw sweep). Two of them were wrong first: the
first axis comparison read state[10..12] for the body rates when the ABI puts
them at [11..13], which reported every axis as 100 percent tracking error, and
the first yaw report divided by a sign it had not taken, which reported every
stop as instant. Both were caught by the numbers being absurd rather than by
the rig, which is the same lesson round 21 ended on.

## Round 24: the town was 30 Hz on a fast machine, and one constant was doing three jobs

The owner's report was that the town drops to 30 Hz on a powerful PC, and asked
for it to run on modest hardware. That a fast machine does not help is the
diagnosis: a frame that is short of GPU gets better with a better GPU, and a
frame that is short of draw call submission does not.

### What the frame actually was

Traced by wrapping the renderer for one frame, the town's frame is ONE scene
render plus three fullscreen quads. There is no depth prepass here: that is
`src/render/post.js`, which the field and the custom map use. The city runs the
vendored `Pipeline`, which renders the scene once into a target and inks it in
screen space from depth. So the scene render's draw calls ARE the frame's draw
calls, and there is no multiplier to remove.

At three fixed viewpoints, before anything in this round:

| view    | draw calls | triangles |
|---------|-----------:|----------:|
| spawn   |       3826 | 2,405,050 |
| street  |       5981 | 3,107,836 |
| rooftop |       6417 | 2,977,428 |

Against budgets of 400 and 1,200,000. One draw call per object, and about 5400
objects in frustum, so the object count IS the draw call count.

### The mistake that hid the fix for two rounds

`CULL_CELL = 40` was passed to three different things: the static merge, the
instanced chunking and the cull grid. Round 21 swept it, found that 120 bought
30 percent of the calls for 50 percent more triangles, called it a weak trade
and stopped. 300 was tried and broke the town outright.

That conclusion was an artefact of the sweep. The three consumers want opposite
things, because the town's draw calls and the town's triangles live in
different objects:

    static, merged      7229 meshes    1,338,381 triangles
    instanced foliage   1565 meshes    4,540,348 triangles

The static half is almost all draw call and almost no triangle. At the street
viewpoint 1,229,557 of its 1,338,381 triangles were being drawn anyway, so
culling it at 40 m was buying 8 percent of its triangles in exchange for
thousands of separate objects. The instanced half is the mirror image: 4.5 M
triangles already sitting in one draw call each, where a bounding sphere
spanning a grove submits every tree in it whether or not one is in frame.
Moving one constant moved both, so the instanced half's triangle blow up
always swamped the static half's draw call win, and every value looked bad.

Separated, `MERGE_CELL` is now Infinity and `CULL_CELL` stays 40. `buildCullGrid`
needed no change: it already routes anything whose bounding sphere exceeds a
cell into `always`, so a town wide merge is frustum culled and never distance
culled, which is the correct handling of it and not a special case.

### Two kinds of geometry may not be merged that coarsely, and both were found by being wrong

**Shadow casters are culled by a second camera.** The shadow camera is a 44 m
box that follows the craft. A 40 m mesh is outside it almost always and a town
wide one never is, so merging casters town wide put every static triangle into
the shadow pass every frame: +0.57 M triangles, on a change whose whole purpose
was a cheaper frame. Swept at the street viewpoint:

| shadowCell | draw calls | triangles |
|------------|-----------:|----------:|
| 40         |       4686 |     3.20 M |
| 80         |       4041 |     3.41 M |
| 120        |       3986 |     3.47 M |
| inf        |       3476 |     3.76 M |

80 is the knee. 40 to 80 buys 645 calls for 0.21 M triangles; 80 to 120 buys 55
for another 0.06 M, the same trade four times worse. It is also about twice the
shadow box, which is the relationship that makes it the right shape of number
rather than a lucky one. `MERGE_SHADOW_CELL = 80`.

**Geometry that ignores fog is hidden by the distance cull and by nothing
else.** Everything else in the town fades into `FOG_FAR` at 135 m, well inside
the 145 m cull radius, so whether it is culled is invisible. The ink shells do
not: `hullOutline` builds them with `fog: false`. Merged town wide they stopped
being distance culled and the far side of the town came back as solid unfogged
black silhouettes hanging above the fog. Caught by a screenshot, not by a
number. They merge at `cullCell`, small enough that `buildCullGrid` still takes
them into a cell.

### Material sharing, and the half of it that was reverted

The vendored toon factory caches on its parameter signature but sets that
signature to null whenever a texture is present, so every textured material is
a fresh object. The static set holds 20,876 material references resolving to
1,108 distinct appearances, and 1,497 of them were duplicates. Since the merge
buckets by material identity, every duplicate is a bucket that could not form.
Sharing them took the street viewpoint from 5981 to 5504 draw calls on its own.

Two things had to be got right and one was got wrong first.

**Only the static set.** The first version walked the whole scene. `onsen.js`
drives `p.material.opacity` per frame on both steam vents, so a material there
is not a look, it is a channel, and pointing a second mesh at it hands that
mesh someone else's animation. Now it runs over the meshes the merge is about
to touch and no others, and any material an animated object holds is
untouchable, neither adopted as a canonical nor replaced. Same measured
animated set the merge uses, which is why `findAnimated` had to move above it.

**Shader materials are refused, and that is a decision.** A shader material's
appearance is its source and its uniforms, both readable, and keying on them
collapses the town's 1039 of them to 7: they are the ink shells, one material
per inked mesh. It was implemented and measured and then taken back out. It
bought 1.5 percent of the frame's draw calls. What it cost was correctness: a
shell is an inverted hull that reads as an outline only while the mesh it inks
is drawn on top of it, and being unique per mesh is exactly what keeps every
shell a bucket of one, so that it stays a child of that mesh and shares its
fate. Shared, the shells merge with each other instead, into an object with its
own bounds and no relationship to the geometry it belongs to. The tunnel portal
came back as a solid black hull standing where the mesh it inks had been culled
away. Reverted, and written down in `bake.js` so it is not rediscovered.

The first version also disposed the materials it orphaned. That is removed:
they have never been rendered so there is no GPU resource to release, and the
vendored factory keeps a module level cache that outlives the scene, so
disposing something it still hands out would break the next build for no gain.

### Where it landed

| view    | calls before | calls after | change | triangles before | triangles after |
|---------|-------------:|------------:|-------:|-----------------:|----------------:|
| spawn   |         3826 |        2854 |  -25.4% |        2,405,050 |       2,784,294 |
| street  |         5981 |        4041 |  -32.4% |        3,107,836 |       3,412,140 |
| rooftop |         6417 |        3924 |  -38.8% |        2,977,428 |       3,206,226 |

The bake now takes 18,466 static meshes to 2,924 buckets and 1,150 merged
meshes. Triangles are up 8 to 16 percent, which is the deliberate trade: the
frame was short of draw calls, not of triangles, and a modest GPU minds 3.4 M
triangles far less than a modest CPU minds 5981 submissions.

Pixel diffed against the same five viewpoints, worst case 0.32 percent of
pixels differing by more than 24 of 255, and that is the tunnel portal at the
far edge of the fog on the rooftop view. Street, spawn and onsen are 0.02
percent or below. 451 meshes still move over 6 seconds, so the train, the
booms, the petals and the steam are all still driven.

### Not done, and why

**1,466 meshes are excluded from the merge for a marker that means something
else.** `findAnimated` treats `userData.planetRigid` as "this is a runtime rig".
Measured, 1,934 meshes are in the animated set, only 468 of them actually moved
in a 48 s probe, and 1,466 are there on the marker alone. Upstream uses that
marker to mean "do not bend me onto the planet sphere" during `bakeToPlanet`,
which this port declines entirely, so for us it carries no information about
motion. Merging them is worth roughly another 1000 draw calls.

It is not taken because the marker's second reading is also true: `bake.js`
already records that some rigs only move on an interaction and would not move
during the probe. Distinguishing the two needs the town's whole interaction
surface established, and the failure mode of getting it wrong is a frozen cat
or a boom that never lifts, which is the kind of thing that survives a review.
Measured and written down, not shipped on a guess.

**The town is still far over budget.** 4041 draw calls against 400. This round
is a third off, not an order of magnitude, and the remaining calls are roughly
1,774 unmerged singleton buckets, 1,565 instanced foliage chunks and 1,892
meshes held out as animated. Nothing here makes the town meet G2 and this entry
should not be read as saying it does.

### Verify

`npm run verify`: **14 of 16**, the same two reds this container always has,
check 1 build-clean on `emcc not found` and check 10 yaw-coupling at -0.08 deg.
**Check 13 console-clean passes with zero errors and zero warnings**, which is
what says the coarser merge never handed `mergeGeometries` a set it refused.
**Check 15 world-scale passes**, including every city reference: kerb, doorway,
handrail and crossing boom unchanged, because `cityReferences` runs before the
bake and reads the town as authored. **Check 16 map-isolation passes**: no city
module is fetched with the field selected, and the field's cost is identical
after a city round trip.
## Round 25: the sound, built out: a record crate, an outdoors, and a click worth flying through

The owner asked for the full audio build: many tracks of drum and bass and
lofi, motors that stay low, softened, quiet and unobtrusive the way the
shipping simulators mix them, an ambience, a satisfying click through a gate,
and clicks on the menu. All of it lands inside a constraint that shaped every
decision here: verify check 14 caps the live graph at 64 AudioNodes and the
graph already built 59.

**Twelve tracks for four nodes.** More tracks cannot mean more voices, so the
music was split into material and performance. `src/render/tracks.js` is new:
twelve tracks as pattern strings and numbers, six drum and bass at 170 to 176
BPM and six lofi at 72 to 88, each with its own patterns, key, bass phrase,
chords, shelf, wow and swing, validated at import so a wrong pattern length
throws in the stack trace that names the track. `src/render/music.js` is now
the one instrument set that performs whichever track is selected: the same
pooled kick, snare, hat, sub and pad, plus one new baked vinyl crackle loop
for the lofi tracks. The whole crate cost two nodes (crackle source and gain).
The scheduler's `step` stays monotonic for check 14; a track anchors
`stepBase` and `startTime` instead, and the rotation advances at the exact
loop boundary so the grid never tears. Track one is the shipped 174 BPM bed
verbatim: measured after the rewrite at 173.67 BPM (r=0.4300 against a
shuffled null p95 of about 0.04) with the seam delta at the 64.85th
percentile, both indistinguishable from before. The new tracks measure what
they claim: Porch Light authored at 80 BPM reads 79.97 (r=0.4916), Skyline
authored at 176 reads 175.75 (r=0.5026). Lofi hits are hotter per hit than
the dnb numbers on purpose: at half the tempo there are half the onsets, and
equal peaks measured the lofi bed 7 dB under the dnb bed, which read as the
music leaving the room at every genre change. Raised, Porch Light sits at
-33.4 dBFS and Amber Dusk at -29.5 against the dnb bed's -28.1. The settings
gained a Music track row: Rotation walks the crate in genre alternating
order, or pin any record.

**The motors, softer still, measured.** The lowpass cap came down from 1150
to 1000 Hz and the default motor stem from 6 to 5, taking edge off the timbre
without touching the pitch the pilot flies on. The flight render moved from
-16.92 to -18.27 dBFS, inside A3's -20 to -14 band, true peak -6.9 dBTP, no
sample at full scale, and the A1 scream margin held at 20.5 dB on the flight
trace and 23.1 at full throttle against the 12 dB bar. This matches how the
shipping sims and the community that complains about them settle it: motors
just audible under the wind, never the loudest thing in the mix.

**An outdoors, two nodes.** A new ambience stem: one looped stereo buffer
baked at attach from the deterministic LCG, low air through two one pole
lowpasses baked in, a breathing envelope that completes whole cycles over the
loop, and fourteen bird calls written directly into the samples at LCG times.
The air is rendered with a crossfade tail blended over the head, so the loop
seam measured at the 0.21st percentile of the internal delta distribution:
no click, by construction and then by measurement. Parked it reads -35.7
dBFS, the loudest quiet thing in the render; it fades with airspeed in
update() because six metres a second of wash is already louder than a meadow.
Its own settings row, default 4.

**The clicks.** A gate pass is no longer a synth blip. It is a click: a
resonant knuckle of filtered noise a few tens of milliseconds long over a
falling tick, on the two pooled cue voices that already existed, zero new
nodes. Its energy sits between 2 and 5 kHz where the capped motors and the
900 Hz lowpassed wind have nothing, which is why it measured 11.2 dB of band
advantage at the moment it plays (A7 wants 6) with a LIGHTER duck than the
blip needed. The frame graze that voids a lap used to play the same sound as
the reward; it is now 'clip', the same gesture an octave and a half down
through a dull filter, so the ear cannot learn the wrong lesson. The menu
makes small taps of the same family through a new ui() entry: move, adjust,
select and back each sound, made in the one place each gesture funnels
through so keyboard, sticks, pointer hover and click all sound the same, and
they never duck anything because a menu is not a race.

**The count and the checks.** The graph builds 63 nodes of the 64 budget:
59 before, plus ambience source and bus, plus crackle source and gain.
`npm run verify` in this turn: 14 of 16, against 13 of 16 measured on the
same container before any change. The two reds are the container's missing
emsdk (check 1 cannot build the wasm here) and the standing yaw-coupling red,
both untouched by this round. Check 14 passes: context running, music gain
0.200, 46 steps in 4 s, 63 nodes. The probe gained `--track` and
`--ambience` so every claim above is reproducible per track and per stem.

What went wrong along the way: the first ambience bake had two seam defects
of exactly the class this project measures for, a one pole filter state step
at the loop point and bird syllables truncated by the buffer edge, caught by
reading the bake as a reviewer before rendering it. The crossfade and an
edge clamp fixed both, and the seam measurement above is from after the fix.

## Round 26: cutting the render distance, and the clutter cull that measured negative

The owner asked to cut the clutter and the render distance to make the town
work. Both were built and measured. One of them paid, one of them did not, and
the thing that paid most was neither.

Five viewpoints now, not three. Round 24 measured spawn, street and rooftop,
and spawn and street are both close in views that were never the problem. A
pilot spends the flight above the roofs, so `flying` at 25 m and `high` at 70 m
were added, and the numbers below are all five.

### The render distance, and why it did less than expected

`CULL_RADIUS` 145 to 100, and the fog with it: 45 to 135 became 30 to 95.

THE FOG IS WHAT MAKES THE CULL INVISIBLE, so it is set from the radius rather
than chosen for itself. Anything switched off at the radius has to already be
the fog's colour when it goes. Cutting the radius to 100 and leaving the fog at
135 would have left a 35 m band where the town winks out in clear air.

It bought less than it looks like it should, and the reason is round 24's own
change: with the merge given the whole town, every static mesh has a town sized
bounding sphere, so `buildCullGrid` routes it into `always` and the distance
cull never sees it. The radius now only reaches the instanced foliage and the
meshes held out as animated. Street went 4041 to 3831 draw calls, triangles
3.41 M to 3.05 M. Real, and mostly in triangles.

While in there, a correctness fix. The cull tested the distance to a cell's
CENTRE, which makes the radius a lie by up to a cell half diagonal, 28 m: a
cell at the radius holds things from 28 m nearer to 28 m further, and switching
it off takes the near ones. At 145 m against a fog ending at 135 that error
could only reach things already fog coloured. At 100 m against a fog ending at
95 it reaches 72 m, where the fog is two thirds in and a building winking out
is something you would see. It now clamps to the cell's bounds first, so
nothing inside the radius is ever switched off.

### The clutter cull, built and measured and taken back out

Props are decided by size rather than by a name list: `CLUTTER_SIZE` as a
bounding sphere radius, 1.6 m, which takes bollards, pots, bins, signs, meters
and fence panels and leaves houses, roofs, roads and the platform. They were
merged and culled separately at 45 m instead of 100 m.

It cost draw calls at four viewpoints of five.

| view    | clutter off | clutter on |
|---------|------------:|-----------:|
| spawn   |        2854 |       3250 |
| street  |        3831 |       4163 |
| rooftop |        3909 |       3151 |
| flying  |        3486 |       3628 |
| high    |        2299 |       2339 |

The reason is structural and it is worth writing down, because the idea will
come back. To cull something you have to keep it separable, and separability is
exactly what the town wide merge gave up to get its draw calls down. Splitting
clutter back out of that merge costs a mesh per cell per material, everywhere,
including the near cells that are all switched on anyway. It only wins where
enough of the town is far away and not yet frustum culled, which turns out to
be one band around the rooftop view. Triangles did fall 10 to 15 percent
everywhere, but the frame is short of draw calls, not triangles, and the worst
case across the five views is better without it: 3909 against 4163.

Removed rather than left switched off. The measurement is here instead.

A second thing it taught, before it went: the rule was applied to the instanced
sets too, on the size of one instance, and a size test cannot see that
something is a PART. A tree here is a static trunk plus a few dozen instanced
canopy blobs, none of them 1.6 m across, so the canopies culled at the clutter
radius and left the trunks, and the hills behind the town came out as bare
sticks. Listed by measured instance radius, every instanced set under the
threshold is a part of something: groveCanopy, sakuraCanopy and cedarCanopy on
their trunks, hillTuft and hillMoss and hillRock on the hills, lakeReed and
lakePetals in the water. There is no instanced prop in this town that clutter
culling would have helped.

Two other configurations were swept and both lost. `MERGE_CELL` at 80, 120, 160
and 240, to buy back the frustum culling the town wide merge gives up: street
4145 to 4162 against 3831, worse at every value, because the town is 280 m
across and the fog and the cull already handle distance. And `CULL_CELL` at 60
and 80, to make clutter merge into fewer meshes: 4286 and 4135 against 4163,
with triangles up 23 percent from coarser foliage chunks.

### What actually paid: merging each still rig into itself

Round 24 measured 1,934 meshes held out of the merge as animated, of which only
468 ever move. 1,466 are there because they carry `userData.planetRigid` and
did not stir once in a 48 s probe. That round wrote the lever down and declined
to pull it, because upstream's note in planet.js reads "used for animated rigs"
and the eleven call sites bear it out: the shutter, the booms, the cat, the
vending machines, the train, the lake and onsen rigs, a banner cloth on a
pivot. Some move only on an interaction, which no probe would catch. Merging
them into the town would bake their world matrices into anonymous floats and
freeze whichever of them the probe was too short to see. That reasoning was
right and it still is.

What it missed is that there is a safe merge here, and it is a different one. A
rig is a group with an animated TRANSFORM, and the meshes inside it are rigid
with respect to it. So merge a rig into ITSELF: every mesh in it becomes one
mesh per material, expressed in the RIG'S OWN local space, parented to the rig.
The rig keeps its transform, whatever drives it goes on driving it, and a
banner that swings still swings, because the swing is the group's rotation and
the group is untouched. Nothing is baked into world space and nothing is
reparented to the root.

The one thing that cannot survive is a rig that articulates internally, one
part moving against another, since those parts become one mesh. So a rig
qualifies only if NOTHING anywhere in it, root included, moved by a single
matrix element across the whole probe. A rig whose cloth swings on an inner
pivot moves during the probe and is never offered.

26 rigs qualified, 936 meshes became 154. Triangles are unchanged to within a
rounding error, because nothing moved and nothing was added.

### Where it landed

Against round 24, and against the town as it was before round 24:

| view    | before r24 | after r24 | now  | change |
|---------|-----------:|----------:|-----:|-------:|
| spawn   |       3826 |      2854 | 2363 | -38.2% |
| street  |       5981 |      4041 | 3031 | -49.3% |
| rooftop |       6417 |      3924 | 3252 | -49.3% |
| flying  |          - |         - | 2795 |      - |
| high    |          - |         - | 2127 |      - |

Triangles at street 3,107,836 before round 24, 3,412,140 after it, 3,049,668
now: round 24 traded triangles for draw calls and this round has given the
triangles back through the shorter radius while taking more draw calls off.

### The check that mattered most

`alive.mjs` samples every mesh's world matrix, runs the sim 6 s and counts what
changed. 451 meshes move, which is the SAME COUNT as before the rig merge.
Nothing froze. That is the one number this round turned on, and it is a
measurement rather than a look at a screenshot, because a boom that stopped
lifting would not show in a still.

Pixel diffed against five viewpoints: street 0.005 percent of pixels differing
by more than 24 of 255, spawn 0.13, crossing 0.83, onsen 0.89, rooftop 15.3.
The rooftop figure is the fog, which is the change that was asked for, and the
other four say the town at flying distance is the town it was.

### Still not done

The town is 3031 draw calls at street against a budget of 400. This round and
the last together are half off, not the order of magnitude the budget wants.
What is left is roughly 1,774 unmerged singleton buckets, each a material no
other mesh in the town shares, 1,565 instanced foliage chunks that are already
one call each, and 1,087 meshes still held out as animated. The singletons are
the biggest block and nothing short of a texture atlas touches them, since two
different materials cannot merge whatever the geometry does.

### Verify

`npm run verify`: **14 of 16**, the same two reds this container always has,
check 1 build-clean on `emcc not found` and check 10 yaw-coupling at -0.08 deg.
**Check 13 console-clean passes with zero errors and zero warnings**, which is
what says mergeRigs never handed `mergeGeometries` a set it refused. **Check 15
world-scale passes with every city reference unchanged**: kerb 0.1350, doorway
2.0500, handrail 1.0600, crossing boom 1.2400, collider fit 613 of 2731,
crossing boom collider 1.045 to 1.325 m. The boom figure is the one to watch,
because it is measured after the animation has seated the arms, and it would
move if the rig merge had disturbed them. **Check 16 map-isolation passes.**

## Round 27: the thing splitting the merge was colour, and it did not need to be on the material

The owner asked to thin the trees and the other clutter and to hit the budget.
Three things were built. One is the largest single draw call win the town has
had and it removes nothing at all; one thins the planting and is worth having;
one removes the wrong objects and was reverted. The budget is still not met and
the last section says by how much and why.

### Colour was 1,103 draw calls, and colour does not belong on a material

Round 24 left 1,774 merge buckets holding exactly one mesh. A bucket of one is
a mesh whose material nothing else in the town shares, and no amount of merging
removes it. That was written down as the wall: "nothing short of a texture
atlas touches them, since two different materials cannot merge whatever the
geometry does".

That was half right. Counted, 1,103 of those 1,774 materials carry NO TEXTURE
OF ANY KIND, and stripped of their colour they collapse to 24 distinct looks.
They are the same handful of materials painted 1,103 different colours.

Colour is the one property that does not have to live on the material. Three.js
multiplies the material colour by a per vertex colour attribute, so a WHITE
material with the colour written into the vertices draws the same pixels. The
attribute is filled from `m.color.r/g/b` as floats, which are already in the
renderer's working colour space, against a material colour of exactly white:
white times the original is the original, to the bit, with no quantisation and
no conversion.

TWO THINGS HAD TO BE GOT RIGHT AND BOTH WERE GOT WRONG FIRST.

The first version refused any material with a `gradientMap` along with `map`
and `alphaMap`, on the reasoning that a texture is the part of a look this
cannot fold up. That is true of `map`, which multiplies the diffuse. It is not
true of a gradientMap, which in a toon material is the LIGHTING RAMP, nor of an
emissiveMap, which is added rather than multiplied. Both can ride along on the
shared material with their uuid in its key. Refusing them painted 1,711 meshes
where about 15,000 were available, because this town's `cel()` puts a toon ramp
on nearly everything it makes, and the whole change bought 50 draw calls.

The second is subtler and only a pixel diff found it. `Material.copy` does not
carry `onBeforeCompile`, `customProgramCacheKey`, or a live `userData`
reference, and this town's entire look lives in them: `./vendored/core/toon.js`
injects the cool shadow tint through `onBeforeCompile` and keys the shader
program on the tint's hex. Relying on `clone()` gave every painted surface an
UNTINTED SHADOW SIDE. It did not look broken, it looked slightly off, and the
number that caught it was a mean absolute difference of 1.4 of 255 across the
whole frame with almost nothing over the visible threshold. Re-attaching the
three by hand took the same diff to 0.001 at the street viewpoint, 0.06 at the
worst of five. Sharing the closure is correct rather than convenient: the cache
key IS the tint and the group key includes the cache key, so every material in
a group already has the same tint uniform.

Street went from 3031 draw calls to 2245. Nothing was removed to get it.

### Thinning the planting

The town draws 4.54 M triangles of instanced plants. An instanced grove is
already one draw call, so no merge or cull touches that mass: the only lever is
fewer of them.

`thinFoliage` keeps a fraction of the instances in every plant and rock set.
WHICH ONES GO IS A HASH OF THE INDEX, NOT A STRIDE, because keeping every other
index thins whatever order the town generated them in, which for the groves is
tree by tree: one bald, the next untouched. Hashing scatters the removal evenly
through every canopy instead, so a tree gets airier rather than balder, and
every trunk is untouched. The hash is Knuth's multiplicative constant on a 32
bit index, integer arithmetic throughout, because this has to be the same town
in Node and in the browser.

The sets are chosen BY NAME and that is deliberate. Every measured proxy for
"the things there are thousands of that nobody counts" is wrong in a way that
deletes structure: per instance size, instance count and triangle share all say
that a fence post is a grass tuft. Round 26 already made this mistake once in
the other direction and turned the hills into bare sticks. The named sets carry
4.31 M of the 4.54 M, so the list being narrow costs almost nothing, and the
cost of it going stale is a missed optimisation rather than a hole in the world.

Swept, and the value chosen is NOT the cheapest one:

| keep | street triangles | look                                   |
|------|-----------------:|----------------------------------------|
| 1.00 |          3.13 M | as authored                             |
| 0.65 |          2.83 M | full canopies, slightly airier          |
| 0.50 |          2.70 M | thinning visible                        |
| 0.35 |          2.57 M | gaps through the blossom, too far       |

0.65. Below it the return flattens hard while the damage does not: 0.35 buys
0.26 M more triangles and costs the cherry trees, which are the reason anyone
looks at this town. Since the triangle budget is out of reach either way (see
below), spending 0.26 M on the trees is the easy call.

### Dropping small props: built, measured, reverted

The idea was to remove props under a size rather than cull them, since round 26
established that culling them costs more than it saves. Two things killed it.

IT REMOVES PARTS, NOT PROPS. At a 0.9 m bounding sphere it dropped 12,915 of
the town's 18,466 static meshes, because a building in this town is dozens of
small meshes: window frames, sills, awnings, door furniture, fence slats. The
screenshots show the crossing losing its shop signage, its planters and its
awnings while the walls stay. This is the third time the same lesson has landed
this week: a size test cannot see that something is a PART, and it does not
matter whether the parts are canopy blobs, ink shells or window frames.

AND THE COLLIDERS DID NOT GO WITH THEM. The town's 2,731 rectangles are
authored beside the geometry rather than derived from it, and 898 have a
footprint under 0.6 m, so the props ARE solid. The matching pass, which was
meant to drop a collider whose centre fell inside a removed prop and inside no
surviving mesh, matched exactly ZERO of them. Whatever the reason, shipping a
version that removes 12,915 drawn objects and no collision is shipping the
invisible walls the owner has already reported once, so it went out rather than
getting a second attempt.

### Where it landed

| view    | before r24 | after r26 | now  | triangles now |
|---------|-----------:|----------:|-----:|--------------:|
| spawn   |       3826 |      2363 | 1673 |       2.51 M |
| street  |       5981 |      3031 | 2245 |       2.83 M |
| rooftop |       6417 |      3252 | 2378 |       2.86 M |
| flying  |          - |      2795 | 2058 |       2.81 M |
| high    |          - |      2127 | 1515 |       2.84 M |

62 percent off the draw calls at street since round 24 began, 9 percent off the
triangles, and the colour bake accounts for most of the first with no geometry
removed at all.

### The budget is not met, and this is what stands between

G2 asks for 400 draw calls and 1,200,000 triangles. The town is at 2245 and
2.83 M. Being straight about the distance:

DRAW CALLS. 671 of the surviving one mesh buckets have a TEXTURE, and a
texture is the part of a material that cannot be folded into a vertex
attribute. They are the town's signs, posters, shop fronts and hoardings, each
with its own small canvas. Collapsing them needs a texture atlas: pack the
canvases into one sheet, rewrite every uv, and they become one material and one
bucket. That is the single remaining structural win and it is a real piece of
work, not a constant.

TRIANGLES. The floor is not the planting. The town's static geometry alone is
1.34 M triangles and, since round 24 merges it town wide, all of it is drawn
every frame; the shadow pass adds roughly 0.6 M more. So about 1.9 M is spent
before a single leaf, which is already over the 1.2 M budget with the planting
at zero. Getting under it needs level of detail on the buildings, which means
authoring or generating simplified meshes, not tuning.

Neither is a reason to stop, and neither is reachable by thinning. Written down
here so the next round starts from the right end.

### Verify

`npm run verify`: **14 of 16**, the same two reds this container always has,
check 1 build-clean on `emcc not found` and check 10 yaw-coupling at -0.08 deg.
**Check 13 console-clean passes with zero errors and zero warnings**, which
matters here because adding a `color` attribute to some geometry and not other
geometry is exactly how `mergeGeometries` is made to refuse a set and warn.
**Check 15 world-scale passes with every city reference unchanged**: kerb
0.1350, doorway 2.0500, handrail 1.0600, crossing boom 1.2400, 2,731 colliders,
613 fitted, crossing boom collider 1.045 to 1.325 m. The doorway is the one to
watch, because `references.js` finds front doors BY THEIR MATERIAL COLOUR and
the colour bake paints those materials white: it still reads 2.0500 because
`cityReferences` runs before the bake, and it would have read nothing if that
order were ever swapped. **Check 16 map-isolation passes.**

451 meshes still move over 6 s, the same count as the last three rounds.

## Round 28: measuring the city against the budget before changing anything else

The owner asked for a strategy to bring the city inside the performance budget,
and suggested closing the fog and cutting the clutter. Both were swept live
before anything was written down. This round changed no source file. The output
is `/CITY-PERF-PLAN.md`, and what follows is what the measurement found that
the previous rounds did not.

### Two budgets nobody had measured on this map

**P5 is passing and the instrument says it is failing.** `src/render/budget.js`
derives a 1080p figure by scaling every non shadow target by pixel area. The
city's composer targets are capped by `pixelBudget: 2.6e6` and come out at 2149
by 1209 whatever the canvas is, so scaling them is wrong. Measured at a real
1920 by 1080 canvas: **104.2 MB against a 120 MB ceiling**. From a 1280 by 720
capture the same code derives 153.8 MB from a true 87.0 MB, which is 47 percent
high. The derivation needs the same fixed/scales split the shadow map already
gets.

**P10 has never been read on this map and it is 2.05x over.** 2,333,270
resident vertices: position 28.0 MB, normal 28.0 MB, colour 26.3 MB, uv 16.0
MB, plus 8.8 MB of indices, against a 48 MB ceiling. The colour attribute is
round 27's bake, and it is written on every geometry the bake touched rather
than only on the buckets that actually mix colours.

### The shadow pass is 35 percent of the draw calls and it fragments the merge

Measured two independent ways that agree exactly, `renderer.shadowMap.enabled`
false and `castShadow` cleared on every mesh: street goes 1715 to **1107**
calls, 2,765,233 to **1,675,689** triangles.

It costs twice, and the second cost is the one that was not visible before.
`bakeCity` buckets a caster on an 80 m grid and everything else town wide.
2,511 of the town's 3,736 meshes cast, only 12 of them town wide merges, so the
static town is drawn as 331 pieces where it could be about 70. The shadow pass
therefore costs 608 calls of its own and forces roughly 265 more in the colour
pass.

Swept by source mesh size, the knee is between 0.6 and 1.2 m: casters 2511 to
566 takes street 1715 to 1345 and 2.77 M to 2.44 M. This is a size test and
PROGRESS records two rounds where a size test went wrong, and the objection
does not transfer. A size test used for REMOVAL cannot see that a window frame
is part of a building. A size test used for CASTING decides only whether a
bollard puts a shadow on the pavement inside a 44 m box at 100 km/h. A wrong
answer here is invisible rather than structural.

The obvious alternative was checked and refused: a shadow only proxy on a
hidden layer does not work in three 0.160, because
`WebGLShadowMap.renderObject` tests `object.layers.test( camera.layers )`
against the VIEW camera rather than the shadow camera, so anything the main
camera cannot see casts nothing.

### The fog cannot reach the buildings, which is why closing it underperforms

Swept through `window.__cullRadius`, at street: 100 gives 1715 calls and 2.77
M, 70 gives 1541 and 2.46 M, 50 gives 1498 and 2.44 M, 35 gives 1164 and 2.11
M. Round 26 already found this and the reason is round 24's own change: the
town wide merge gives every static mesh a 249 m bounding sphere,
`buildCullGrid` routes it into `always`, and 609,410 triangles in 66 calls are
submitted from every camera position at any radius.

35 m is where the lever finally bites and the fog would then have to end at
about 33 m, which is 1.2 s of sight at 100 km/h. 70 m with the fog at 65 gives
2.4 s and is the recommendation. The rest has to come from making the static
merge cullable, which is step 3 of the plan.

### Where the frame goes, at street, 1715 calls

66 town wide merged static at 609,410 triangles and never culled by anything,
331 caster merges on the 80 m grid at 375,600, 343 instanced foliage chunks at
about 661,000, 92 vending machine rig meshes and 88 railway furniture meshes
for 6,070 triangles between them at about 35 triangles a call, and 608 shadow
submissions at 1,089,544. The build's own counters: 18,466 static meshes merged
to 625 across 2015 buckets, of which **1,390 hold exactly one mesh** and 671 of
those carry a texture, 1,087 meshes held out as animated, and 39 plant sets
chunked into 1,200 InstancedMeshes.

### Verify

No source file changed this round, so no check was re run and none is claimed.
The measurements above were taken through the real page in headless Chromium
with zero console errors and zero warnings on every run.

## Round 29: step 1 of the city plan, who casts a shadow

`restrictCasters` in `src/maps/city/bake.js`, run after `mergeRigs` and before
the bucketing, clears `castShadow` on anything too small for its shadow to be
read. Two thresholds, both in `src/maps/city/index.js`.

### What it bought

| view | calls before | calls after | triangles before | triangles after |
|---------|------:|------:|-----------:|-----------:|
| spawn   | 2049 | **1501** | 2,759,143 | 2,500,849 |
| street  | 1715 | **1267** | 2,765,233 | 2,576,604 |
| rooftop | 1726 | **1288** | 2,914,891 | 2,645,920 |
| flying  | 1996 | **1484** | 2,977,665 | 2,709,107 |
| high    | 1853 | **1638** | 2,691,893 | 2,508,660 |

The worst view is what P1 is written against: 2049 to 1638, 20 percent off.
Triangles 2,977,665 to 2,709,107, 9 percent off. The shadow pass at street went
from about 737 draw calls to about 351, and the colour pass from 974 objects to
912 as caster geometry rejoined the town wide merge: 66 town wide meshes became
95, and the 331 pieces on the 80 m caster grid became 237.

6,888 of the town's 8,971 meshes stopped casting, measured before the merge.

### Two thresholds, not one, and the canopy is why

Swept by rebuilding the town at each value, street and then the worst of five:

| static | instanced | street | flying | high |
|-------|-----------|-------:|-------:|-----:|
| off   | off       |   1715 |   1996 | 1853 |
| 0.8   | 0.8       |   1363 |   1610 | 1716 |
| 1.4   | 1.4       |   1173 |   1386 | 1588 |
| 2.0   | 2.0       |   1149 |   1363 | 1565 |
| 1.4   | 0.8       |   1267 |   1484 | 1638 |

A SINGLE THRESHOLD ANYWHERE ABOVE 1.0 TURNS OFF EVERY TREE SHADOW IN THE TOWN,
because this town's canopy blob has a geometry radius of exactly 1.0 and the
cedar's is 1.16. That is what the 190 calls between 0.8 and 1.4 are mostly
buying, and round 27 already decided this question in the other direction when
it spent 0.26 M triangles keeping the cherry trees.

So the bar for a mesh that stands on its own is 1.4 m, and the bar for one
member of an instanced crowd is 0.8 m. That is a real distinction and not a way
of keeping a favourite: a lone 1.0 m bin casts a shadow nobody reads, and a
hundred and thirty 1.0 m blobs in one chunk cast a TREE. Hill tufts and lake
reeds are 0.5 and stop casting either way. The chosen pair costs 94 draw calls
at the worst view against 1.4 for everything, and keeps every tree shadow.

### And this is a size test, which has gone wrong twice

Round 26 and round 27 both removed props by size and both removed parts of
buildings instead. The objection does not transfer and the difference is the
whole reason this is allowed to exist. A size test used for REMOVAL cannot see
that a window frame is PART of a building, so it deletes the shop's awnings. A
size test used for CASTING decides only whether a bollard puts a shadow on the
pavement inside a 44 m box at 100 km/h. A wrong answer here is invisible rather
than structural, and moving one number puts it back.

Pixel diffed against the unchanged town at all five viewpoints: street is the
worst at 1.35 percent of pixels differing by more than 8 of 255 and 0.78
percent by more than 24, mean 0.43. Then spawn 0.57 and 0.39, rooftop 0.22 and
0.12, flying 0.20 and 0.10, high 0.05 and 0.02. The screenshots show the
buildings, the trees, the poles and the crossing arms all still casting, and
the bollards and the small furniture no longer doing so.

### What was tried and is not here

**Shrinking the shadow box does not reach the cost.** Swept live on the new
build at street: half extent 22 gives 1363 calls, 16 gives 1288, 12 gives 1246,
8 gives 1207, against 1073 with the pass off entirely. The reason is that a
caster is merged on an 80 m grid and the shadow camera culls whole objects, so
a 16 m box still pulls in an entire 80 m mesh.

**Shrinking the caster grid costs more than it saves, still.** At
`MERGE_SHADOW_CELL` 40 the worst view is 1745 against 1610, and at 24 it is
2056. Round 24's choice of 80 survives its own assumptions being replaced.

**The clean fix is a shadow only proxy set and it needs a trick.** Coarse box
proxies merged at about 24 m and visible only inside the shadow box would take
the pass to a handful of calls. A hidden layer does NOT work: three 0.160's
`WebGLShadowMap.renderObject` tests `object.layers.test( camera.layers )`
against the VIEW camera. What does work is that the renderer builds its render
list before running the shadow pass, and both skip `visible === false`, so
proxies gated on the shadow box in `updateShadowFocus` are submitted to the
shadow pass and cost only a handful of colour calls with `colorWrite` off.
Written down rather than built, because it is a bigger piece of work than the
rest of step 1 and the plan's step 2 is worth more per hour.

### Verify

`npm run verify`: **14 of 16**, the same two reds this container always has,
check 1 build-clean on `emcc not found` and check 10 yaw-coupling at -0.08 deg.
**Check 13 console-clean passes with zero errors and zero warnings**, which is
the one that matters here: `castShadow` is part of the merge bucket key, so
moving it is exactly how `mergeGeometries` is handed a set it refuses and warns
about. **Check 15 world-scale passes with every city reference unchanged**:
kerb 0.1350, doorway 2.0500, handrail 1.0600, crossing boom 1.2400, collider
fit 613 of 2731, crossing boom collider 1.045 to 1.325 m. **Check 16
map-isolation passes** with the field's cost unchanged across a city round
trip. P10 is untouched at 98.4 MB, as expected: this step moves no attribute.

## Round 30: the render distance is worth four times what it was, and textures stop splitting the merge

Two changes and one measurement that corrects a number published last round.

### The radius, now that the shadow pass is not paying for the same work twice

`CULL_RADIUS` 100 to 70, `FOG_FAR` 95 to 65, `FOG_NEAR` 30 to 22.

Round 26 cut the radius and concluded it was a weak lever, 174 draw calls at
street. With round 29's casters restricted it is worth 402 at the worst view,
1638 to 1236, because the work the radius removes is no longer being paid for a
second time in a shadow pass the radius cannot reach. The same lever, four
times the value, from a change somewhere else entirely.

65 m of fog is 2.3 s of sight at 100 km/h. The sweep kept paying below it, 1153
draw calls at a radius of 50 against 1236 at 70, and 45 m of fog is 1.6 s,
which is asking a pilot to commit to a line before it exists. It stops at the
last value a pilot can use rather than the last one the ledger likes.

`CULL_CELL` was swept alongside and stays at 40. Coarser cells make fewer
instanced chunks, 1200 at 40 m against 458 at 80 m, and hand every draw call
back in triangles: at 80 m and a 100 m radius the worst view is 3.43 M
triangles against 2.51 M at 40 m, because a cell is only dropped once ALL of it
is out of range.

### The texture atlas

`atlasTextures` in bake.js packs the town's small canvases onto sheets,
rewrites each mesh's uvs into its tile, and hands the merge one material where
it had one per sign. 153 textures packed onto 5 sheets across 5 material
groups, 780 meshes moved onto them, 24.5 megapixels of sheet.

Round 27 wrote that "a texture is the part of a material that cannot be folded
into a vertex attribute" and that is still true. It does not have to be folded,
it has to be MOVED, and then the meshes share a material, which is the only
thing the merge ever needed.

What it refuses, and each refusal is a measurement rather than a guess. 106 of
the town's 311 textures REPEAT, and wrapping is a property of a whole texture:
a tile inside a sheet has no edge of its own to wrap at, so uv 1.3 would land
in its neighbour instead of back at 0.3. 6 more meshes have uvs outside the
unit square, which is the same problem wearing different clothes, so the
geometry is checked rather than the texture trusted.

MIPMAPS ARE OFF ON THE SHEETS AND THAT IS A COST, not an oversight. A mip level
averages across tile boundaries whatever the gutter is, because level n reaches
2^n pixels, so a distant sign would pick up its neighbour. Without mips it
aliases instead, which the fog at 65 m keeps short and which looks like the
town rather than like a bug. The gutter stays at two pixels of replicated edge
for the bilinear filter at level zero.

The first version allocated a full 4096 square canvas per sheet whatever went
on it: five sheets and 335 MB of texture, most of it blank. Sizing each sheet
to its packed extent took that to 24.5 megapixels and 98 MB for identical draw
calls. Nothing here needs a power of two, since the sheets clamp and carry no
mipmaps.

Colour is folded here rather than left to `bakeColourToVertices`, which refuses
anything carrying a `map` and is right to. Once the meshes share a sheet they
can share a material, so this pass does round 27's trick on its own way out and
sets `vertexColors`, which is what makes the colour pass skip them. The
onBeforeCompile, customProgramCacheKey and userData are carried by hand, for
the reason round 27 recorded in blood.

### Where it lands

| view | round 29 | now | triangles now |
|---------|-----:|-----:|-----------:|
| spawn   | 1501 | **1597** | 2,343,158 |
| street  | 1267 | **1198** | 2,121,196 |
| rooftop | 1288 | **1254** | 2,266,364 |
| flying  | 1484 | **1470** | 2,367,100 |
| high    | 1638 | **1387** | 2,090,342 |

Spawn goes UP and the reason is not either change above: `MERGE_CELL` is 120
in this tree where round 29 measured it at Infinity. Isolated, the atlas is
worth 92 draw calls at spawn and 83 at high, and the radius is worth 402 at
high.

### MERGE_CELL, swept twice, and the answer did not change

Splitting the static merge spatially makes it distance cullable, which is the
plan's step 3. It costs draw calls and buys triangles, monotonically, and it
was swept again after the atlas on the theory that a smaller material count
would make it affordable. Worst of four viewpoints at a 70 m radius:

| MERGE_CELL | calls | triangles |
|------------|------:|----------:|
| Infinity   | **1372** | 2,426,187 |
| 120        | 1597 | 2,367,100 |
| 80         | 1611 | 2,329,544 |
| 60 (before the atlas) | 1807 | 2,069,086 |

225 draw calls for 59,000 triangles at 120. Draw calls are 3.4x over budget and
triangles 2.0x, so the binding budget says Infinity and the plan's own protocol
said to publish the measurement and revert if it did not pay. The tree ships
120 because that value was set deliberately by the owner and reverting it is
theirs to call, not this round's. The lever is worth having when triangles
become the binding budget, and not before.

### Verify

`npm run verify`: **14 of 16**, the same two reds this container always has.
**Check 13 console-clean passes with zero errors and zero warnings**, which for
a pass that rewrites uv buffers and swaps materials underneath the merge is the
one that would have caught a refused `mergeGeometries` set. **Check 15
world-scale passes with every city reference unchanged**, and the doorway at
2.0500 is the one to watch for the same reason it was in round 27:
`references.js` finds front doors BY THEIR MATERIAL COLOUR and this pass paints
atlased materials white, so it reads 2.0500 only because `cityReferences` runs
before the bake. **Check 16 map-isolation passes.**

Pixel diffed against the same tree without the atlas at five viewpoints: spawn
is the worst at 0.18 percent of pixels differing by more than 8 of 255 and 0.10
percent by more than 24, then street 0.12 and 0.04, rooftop 0.04 and 0.01,
flying 0.01 and 0.00, high 0.00 and 0.00. The shop signs, the road signs and
the bus number plate all read correctly, which is what says the uv rewrite put
each mesh on its own tile.

## Round 31: the rigs were held out for a walker this shell does not have

`mergeRigs` took the town's 26 marked rigs from 936 meshes to 154 and stopped
there, because a rig merged into ITSELF can only share materials with its own
parts. The vending machines were still 92 draw calls at street and the lineside
furniture 88, for 6,070 triangles between them, about 35 triangles a call.

WHY THEY WERE HELD OUT AT ALL. Upstream marks a rig `planetRigid` because ITS
OWN WALKER can walk up to a vending machine and press a button. That walker
does not exist here. Nothing in this shell reaches the town's interaction list:
`animation.js`, the city's index.js and src/main.js mention no dispense, no
action and no hitbox, and the only thing driving the town is `world.update` on
the physics clock, which is exactly what `findAnimated`'s probe runs. A rig
that neither moves nor changes across a whole 48 s crossing cycle cannot be
moved by anything at all here.

So `releaseStillRigs` drops the still ones out of the animated set entirely and
lets the town merge take them in world space.

### The probe could not see the thing that would have broken

A transform is not the only thing a town animates. `onsen.js` drives
`p.material.opacity` on both steam vents every frame and never moves them by a
matrix element, so a probe watching only matrices calls them still. That was
survivable while a still rig was merged into itself, keeping its own materials.
It stops being survivable the moment one is merged into the town: the vent's
per frame opacity would be written to a material shared with every other
surface in its bucket, and half the town would breathe.

`materialPulse` snapshots opacity, transparency, visibility, colour, emissive,
emissive intensity and the map's uuid and version before and after the probe,
and anything that changed joins the animated set. Deliberately wider than the
one case known to move, because what this cannot see is what it cannot hold
out.

### The measurement that says nothing froze

Sampled every mesh's world matrix and material, ran the sim 12 s, counted what
changed. Committed tree: 3,834 meshes sampled, **496 moved and 19 changed their
look**. This tree: 3,442 meshes sampled, **496 moved and 19 changed their
look**, from lakeRipple, lakeWindLane, train and the world root, the same four
names. 392 fewer meshes in the scene and not one fewer moving part. The 19 are
the onsen vents the material probe caught, which is the pass proving itself.

### Where it lands

| view | before | after |
|---------|-----:|-----:|
| spawn   | 1597 | **1383** |
| street  | 1198 | **1141** |
| rooftop | 1254 | **1194** |
| flying  | 1470 | **1315** |
| high    | 1387 | **1198** |

The worst view is 1597 to 1383. Pixel diffed at five viewpoints, worst 0.13
percent of pixels differing by more than 24 of 255 at street.

THE COST OF BEING WRONG is a rig frozen at its start position, so the three
conditions are narrow and all have to hold: the subtree moved no matrix
element, changed no material property, and this shell has no way to call the
rig's action. The first two are measured every build. The third is a fact about
this repository rather than a measurement, and it is the one that will go
stale, so it is written at the option and again here: IF AN INTERACTION IS EVER
WIRED UP, TURN `releaseStillRigs` OFF.

### Verify

`npm run verify`: **14 of 16**, the same two reds. Check 13 console-clean passes
with zero errors and zero warnings. Check 15 world-scale passes with every city
reference unchanged, doorway 2.0500, crossing boom 1.2400, collider fit 613 of
2731, crossing boom collider 1.045 to 1.325 m, and that last one is the one to
watch this round because it is measured AFTER the animation has seated the
booms: a rig wrongly released would have moved it. Check 16 map-isolation
passes.
