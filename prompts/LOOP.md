# LOOP.md

How to run the Stage 1 build as a loop. Read this, then paste the prompts below.

---

## Why two loops, not one

The loop can verify almost everything about this project except the one thing that matters, which is whether it feels like a real quad. So the design is: build a ruler that measures everything measurable, then judge the feel yourself against a ruler you trust.

That only works if the agent that writes the ruler is not the agent that writes the code. Otherwise it will quietly move the marks. So:

- **Loop A** builds the verification harness and nothing else. It finishes when the harness runs and every check fails honestly, with a clear "not implemented" reason rather than a crash.
- **Loop B** builds the simulator until every check passes. It is forbidden from editing the harness or the thresholds.

Run them in separate sessions. Loop B should not have Loop A's reasoning in context.

---

## Setup, once

```bash
git init fpv-sim && cd fpv-sim
# drop CLAUDE.md, STAGE1.md, PROGRESS.md and .claude/ into the root
git submodule add https://github.com/betaflight/betaflight vendor/betaflight
git -C vendor/betaflight checkout <a tagged release, pin it>
git add -A && git commit -m "scaffold"
```

Set the advisor so Sonnet does the typing and Fable does the thinking:

```
/advisor fable
```

Or persist it in `.claude/settings.json`:

```json
{ "advisorModel": "claude-fable-5" }
```

One gotcha worth knowing: Fable runs safety classifiers, and a session can get silently rerouted to Opus if something in your workspace trips one. If the loop's judgement seems to shift partway through a run, check `/model` before assuming the setup broke.

---

## Loop A: build the ruler

Paste this into a fresh session:

```
Read CLAUDE.md and STAGE1.md in full before doing anything.

You are building the verification harness for this project and nothing else.
Do not implement the simulator. Do not write flight physics. If you find
yourself writing a PID controller, stop.

Build:

1. A headless test runner, `npm run verify`, that executes every check in
   STAGE1.md section "Verification checks" and prints a table of
   check name, measured value, threshold, pass or fail.
2. `tests/thresholds.json` holding every numeric band, sourced from
   STAGE1.md. One place, no magic numbers scattered through the tests.
3. `tests/inputs/baseline.rec`, a recorded stick-input stream of about
   30 seconds covering hover, punch-out, roll, flip, and descent. Generate
   it procedurally and commit it. It must be byte-stable.
4. A stub `src/native/sim.c` exposing the ABI the harness calls, returning
   NOT_IMPLEMENTED for every entry point.
5. The Emscripten build in `npm run build:wasm`, producing `dist/sim.wasm`
   from the stub.

/goal `npm run verify` runs to completion, exits non-zero, and reports every
check in STAGE1.md as FAIL with reason NOT_IMPLEMENTED. Zero checks may
error, crash, or be skipped. `npm run build:wasm` exits 0. Stop after 15 turns.

When done, write to PROGRESS.md: the check list, each threshold, and where
each threshold came from. Do not start the simulator.
```

---

## Loop B: build the thing

Fresh session, after Loop A has been committed and you have read the harness yourself.

```
Read CLAUDE.md, STAGE1.md and PROGRESS.md in full before doing anything.

You are implementing Stage 1 of the simulator against the existing
verification harness.

Hard constraints, these are not negotiable:
- Do not edit anything under tests/. Do not edit tests/thresholds.json.
- Do not edit files under vendor/betaflight. Changes to Betaflight go in
  patches/*.patch and are applied at build time. `git diff --stat
  vendor/betaflight` must be empty after a build.
- If you believe a threshold is wrong, do not change it. Stop, and write
  the argument under OPEN QUESTIONS in PROGRESS.md, then continue on the
  other checks.
- Never report a check as passing without having run `npm run verify` in
  that same turn.

After every turn that changes code, append to PROGRESS.md: what you changed,
the verify output table, and anything you got wrong and had to undo.

/goal `npm run verify` exits 0 with every check passing, and
`git diff --stat vendor/betaflight` is empty. Stop after 40 turns.
```

---

## What the loop cannot tell you

When Loop B goes green, you have a simulator that is deterministic, frame-rate independent, and physically plausible within the bands you set. You do not yet have one that feels right. That gate is human:

1. Fly it yourself with your own radio and your own Betaflight diff. Does changing your rates change it in the direction you expect?
2. Blind A and B against VelociDrone with two or three club pilots, no labels, same track shape, same rates. If they cannot reliably pick which is which on feel alone, Stage 1 is done.

If it fails that test, the useful move is not to tune by hand. It is to work out which measurable thing is wrong, add it to STAGE1.md as a new check with a band, re-run Loop A to build the check, then Loop B to make it pass. Every time your judgement catches something the harness missed, encode it. The harness is the asset. The sim is downstream of it.
