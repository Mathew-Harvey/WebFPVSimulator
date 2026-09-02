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

Sticks: put your radio in joystick mode before loading the page (it
enumerates as a gamepad), then run **Calibrate sticks** in Settings; the
mapping is remembered. Or fly on keyboard: W/S throttle, A/D yaw, arrows
are the right stick (up arrow pushes the stick forward, nose down). On a
phone or tablet, turn it sideways: thumb sticks appear in flight, left
thumb yaw and throttle (throttle stays where you leave it), right thumb
roll and pitch, and they fly whichever Flight mode Settings says, Acro
included.

Keys in flight: R resets to the start line, X cuts the motors, L arms
launch control on the start line when Settings has it on, F8 opens the bug
report, Escape pauses. Everything else is a row in a menu: the pack
voltage, the camera, the tune, the rates and the PIDs are all in Settings,
where they can say what they do. **How to fly** on the title and pause
menus is the list this paragraph is a summary of, and it is the copy that
is generated from the bindings rather than typed twice.

Three tunes on the Tune row of the title and pause menus: the Betaflight
default, a 6S karate race tune, and Crapshack, the stiff one cut for this
simulator's clean gyro. The PIDs screen adjusts whichever tune is loaded
with Betaflight's own tuning sliders, or lets you set every PID by hand,
and each tune keeps its own adjustment. Rates are yours and stay put
across all of them: the Rates screen draws the stick to rate curve with
your sticks on it.

Tracks you build stay in this browser. Clearing it, or another device,
starts you from nothing. Publish a course from the track builder to put
it on the public board, marks and all. The board is a separate site,
[WebFPVSimulator-LeaderBoard](https://github.com/Mathew-Harvey/WebFPVSimulator-LeaderBoard).
Locally it serves at `http://127.0.0.1:3100/`. Fly this course from the
board opens this simulator in another tab with `?share=` and the course
document, including the sponsor print on the gates, the flags and the
grass.

A course carries up to five sponsors' marks. They are dealt out round the
gates in flying order, so fifteen gates and five marks is three gates each,
spread down the lap rather than bunched at the start, and each mark also
takes its share of the upright banners and the teardrop flags. Any of them
can be painted on the grass as well: the track builder has a **Ground logo**
in its palette, which is a footprint on the field wearing whichever mark you
pick. Paint is not layout, so adding a sponsor to a course people have
already flown does not clear its times.

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

Runs the Stage 1 checks from STAGE1.md headlessly, including bit exact
determinism between Node and headless Chrome, and prints a table. Fifteen
checks, all passing, with one SKIP.

The SKIP is check 1, the build. It compiles Betaflight through emcc and
asserts the vendored tree came out unmodified, so on a machine with no
Emscripten and no submodule there is nothing to compile and nothing to
diff. It prints why, and the summary counts skips on their own line, so a
green run cannot quietly mean an unbuilt one. An emsdk with no sources, or
sources with no emsdk, is still a failure: that is a machine that was set
up to build and did not.

Cheaper checks that do not need a toolchain, and are the ones to reach for
first: `npm run lint:shell`, `lint:nouns`, `lint:memory`, `lint:fc`,
`lint:presets`, `lint:catalog`, `lint:responsive`, and
`npm run score:selftest`, `ghost:selftest`, `contact:selftest`,
`link:selftest`, `music:selftest`, `test:edge`.

## Licence

GPLv3. Compiling Betaflight's control loop in makes this a derivative
work; see LICENSE.
