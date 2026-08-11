---
name: verify-flight-model
description: Verify any change to the FPV simulator's physics, control loop, WASM build, or input path before reporting it as complete. Use this skill whenever work touches src/native/, patches/, vendor/betaflight, src/input/, the Emscripten build, or anything affecting the simulation trace. Trigger it even for a change that looks trivial, such as a constant, a coefficient, a build flag or a header, because those are exactly the changes that silently break determinism. Always use this before saying a check passes, before closing a goal, and before committing.
---

# Verifying a flight model change

A successful edit is not evidence of anything. A successful build is not evidence of anything. This project has one honest signal, which is the harness. Use it.

## The procedure

1. Run `npm run build:wasm`. It must exit 0.
2. Run `git diff --stat vendor/betaflight`. It must be empty. If it is not, your change belongs in `patches/`, so move it and go back to step 1.
3. Run `npm run verify`. Capture the full table.
4. Read every row, including the ones that passed. A check that was passing and is now passing with a materially different measured value is a regression, even though it is green. Note it.
5. If any check fails, fix it and return to step 1. Do not proceed with a failing check on the grounds that it is unrelated to what you changed. In a coupled physics model, nothing is unrelated.
6. Append the result to PROGRESS.md using the RUN LOG format, including anything you tried that did not work.

## Things that count as cheating

Doing any of these means the run is invalid, regardless of what the table says:

- Editing anything under `tests/`, including `tests/thresholds.json`.
- Editing `tests/inputs/baseline.rec` or regenerating it.
- Widening a band, adding a tolerance, or introducing an epsilon to make a comparison pass.
- Special-casing the test input, or branching on whether the run is headless.
- Marking a check as skipped, expected-fail, or not-applicable.
- Reporting a measured value you did not observe in the output of `npm run verify` in this turn.

If you believe a threshold is genuinely wrong, that is a real possibility and worth raising. Write the argument under OPEN QUESTIONS in PROGRESS.md, with the measured value, the band, and why you think the band is mis-set. Then carry on with the other checks. A human decides.

## The determinism checks deserve extra suspicion

Checks 2, 3 and 4 are the ones most likely to pass by accident and fail later on a different machine. When any of them is green, confirm the trace hash actually changed since the last run if you changed physics, and actually did not change if you only changed rendering. A determinism check that returns the same hash no matter what you do is broken, not passing.

Common causes when they fail:

- A call to JS `Math.sin`, `Math.cos`, `Math.pow`, `Math.exp` or `Math.atan2` reached the physics path. These are not specified to bit precision and differ between V8 and SpiderMonkey. Route it through the compiled libm.
- `relaxed_simd` is enabled in the build. It is non-deterministic by design. Turn it off.
- Frame delta leaked into the integrator. Search for `deltaTime`, `dt`, `performance.now` and `elapsed` in anything under `src/native/` or reaching it.
- Input consumed by arrival time rather than the sample's own timestamp.
- Uninitialised memory in the WASM heap being read before it is written.

## Before closing a goal

State plainly: which checks pass, the measured value for each numeric check, and what remains unverified. Flight feel itself is not verifiable here and must never be claimed as verified. The correct closing statement is that the harness is green and the feel is awaiting human judgement.
