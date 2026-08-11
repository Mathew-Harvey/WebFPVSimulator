# WebFPVSimulator

A browser FPV simulator whose only current goal is flight feel
indistinguishable from a real quad. Stage 1 is physics only: Betaflight
4.5.1 compiled to WASM flying a first principles plant model, verified by
a fixed harness. See CLAUDE.md and STAGE1.md for the rules and PROGRESS.md
for the state of play.

## Requirements

To fly it: Node 22 or newer, nothing else. `dist/sim.wasm` is committed so
the toolchain is optional, and there are no npm dependencies to install.

To rebuild the physics module or run the full verification: Emscripten
(emsdk on PATH, or in `$EMSDK`, `~/emsdk` or `/opt/emsdk`), a shell that
can run `scripts/build-wasm.sh` (Git Bash or WSL on Windows), and a Chrome
or Chromium install for the browser checks (`SIM_CHROME_BIN` overrides the
location).

## Fly

```bash
git clone --recurse-submodules <this repo>
npm run serve        # then open http://127.0.0.1:8000/
```

Rebuild the module after changing anything under `src/native` or
`patches/`:

```bash
npm run build:wasm
```

Sticks: plug in your radio in joystick mode (it enumerates as a gamepad)
and press M once to run the calibration wizard; the mapping is remembered.
Or fly on keyboard: W/S throttle, A/D yaw, arrows are the right stick
(up arrow pushes the stick forward, nose down).

Keys: R reset, C camera (FPV or chase), M stick calibration, V cycles the
battery cell voltage between 4.20, 3.80 and 3.50 V. Drop a Betaflight CLI
diff file anywhere on the page to fly your own rates and PIDs.

## Verify

```bash
npm run verify
```

Runs the 13 Stage 1 checks from STAGE1.md headlessly, including bit exact
determinism between Node and headless Chrome, and prints a table.
Currently 12 of 13 pass; yaw-coupling is red pending a human decision
recorded in PROGRESS.md OPEN QUESTIONS.

## Licence

GPLv3. Compiling Betaflight's control loop in makes this a derivative
work; see LICENSE.
