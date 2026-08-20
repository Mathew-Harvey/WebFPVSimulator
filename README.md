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

On Windows, PowerShell may refuse to run npm with "running scripts is
disabled on this system". Either start the server directly with
`node scripts/serve.js`, or allow local scripts once with
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

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
battery cell voltage between 4.20, 3.80 and 3.50 V.

Two tunes, Betaflight default and a 6S karate race tune, on the Tune row of
the title and pause menus. Rates are yours and stay put across both: the
Rates screen draws the stick to rate curve with your sticks on it.

Tracks you build stay in this browser. Clearing it, or another device,
starts you from nothing. Publish a course from the track builder to put
it on the public board, logo and all. The board is a separate site,
[WebFPVSimulator-LeaderBoard](https://github.com/Mathew-Harvey/WebFPVSimulator-LeaderBoard).
Locally it serves at `http://127.0.0.1:3100/`. Fly this course from the
board opens this simulator in another tab with `?share=` and the course
document, including the sponsor print on the gates and flags.

## Host it

Three Render resources: this repo as a static site, the board as a Node
web service, and a Postgres instance behind the board. `render.yaml` here
is the blueprint for the first. See [DEPLOY.md](DEPLOY.md) for the whole
walkthrough, including the order to create them in and the one constant in
`src/share/board.js` that has to name your board.

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
