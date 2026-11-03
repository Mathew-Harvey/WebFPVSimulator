# WebFPVSimulator

A browser FPV simulator whose only current goal is flight feel
indistinguishable from a real quad. Stage 1 is physics only: Betaflight
4.5.1 compiled to WASM flying a first principles plant model, verified by
a fixed harness. See CLAUDE.md and STAGE1.md for the rules and PROGRESS.md
for the state of play. [TRACK-FROM-GIF.md](TRACK-FROM-GIF.md) is how a
supplied RaceGOW track animation becomes a track in the game.

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

One tune ships on the Tune row of the title and pause menus: the Betaflight
default, which is what a freshly flashed quad flies. Every other feel is
yours to make, because a shipped opinion about how a quad should feel is the
one thing a simulator chasing real flight feel should not hand you. The PIDs
screen adjusts whichever tune is loaded with Betaflight's own tuning
sliders, or lets you set every PID by hand, and the Firmware bench edits any
field the firmware has. Save a dump on the bench and it joins the Tune row
as your own, with its own adjustment. Rates are yours and stay put across
all of them: the Rates screen draws the stick to rate curve with your sticks
on it.

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

Flying together is built, and stays behind `?mp=1` until the owner
switches it on for everybody: `ROOMS_LAUNCHED` in `src/main.js` is the
one switch, and with it on the links the page writes stop carrying
`?mp=1` (`node scripts/together-shots.js --launched=1` checks exactly
that). With `?mp=1` the map picker offers **Fly together** beside Fly
this, and a **Rooms** tab lists the rooms their hosts listed; a room's
link only ever asks "Join this room?" first, and nothing of it is even
fetched for a solo flight. The rooms are the board's (its README,
"Multiplayer rooms"). Locally the socket is the board's own address; in
production it goes straight to the board's Render address,
`PRODUCTION_ROOMS_ORIGIN` in `src/net/link.js`, because the Worker on
webfpv.org does not carry sockets. The Steam edition asks the pilot
before it goes online, and then reaches the rooms and nothing else
(`allowReach` in `src/steam/edition.js`, and the Steam repository's
`desktop/community.cjs`). `npm run net:selftest` and
`node scripts/together-shots.js` both need a checkout of the board
beside this one.

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
first: `npm run lint:shell`, `lint:input`, `lint:nouns`, `lint:memory`,
`lint:fc`, `lint:presets`, `lint:catalog`, `lint:responsive`, and
`npm run input:selftest`, `score:selftest`, `ghost:selftest`,
`contact:selftest`, `link:selftest`, `music:selftest`, `test:edge`.
`input:selftest` drives the calibration wizard and the stick modes in plain
Node against synthetic radios, one check per shipped defect; `lint:input`
is the same tickets' other half, the calibrate screen, the title's trouble
rows, the Settings room and the thumb sticks, through headless Chromium.

## Capture mode

Footage of the mini games that does not depend on how fast the machine is. A
headless Chromium renders this page at one to three frames a second of real
time, so a recording of it stutters and differs every run. With `?capture=1`
the page runs on a virtual clock: one external step is exactly one 1/60 s
frame, however long the frame takes to draw, and the same seed with the same
number of steps gives the same pictures.

It is off by default and changes nothing in normal play. `src/boot.js`
imports `src/capture.js` only when the URL says `capture=1`, so a normal visit
downloads none of it, `requestAnimationFrame`, `performance.now` and
`Date.now` stay the browser's own, and `window.__capture` does not exist.

With the flag on, before any game code runs: `requestAnimationFrame` is a queue
that runs only when stepped; `performance.now()`, `Date.now()` and `new Date()`
return virtual time from a fixed epoch; `setTimeout` and `setInterval` fire off
the virtual clock; `Math.random` is a seeded generator; CSS fades follow the
virtual clock; and audio is off (no `AudioContext`, no music). The display
loop is forced (never the timer loop) and no draw is skipped by the frame cap
or the GPU guard. Network and WebAssembly loading still finish in real time,
which is harmless because nothing is simulated between steps.

`seed=<uint32>` (default 1) seeds `Math.random` and the two `Date.now()` seeds
the mini games used (balloons and the fight family). Same seed, same start
options, same camera script, same frames.

### `window.__capture`

| call | what it does |
| --- | --- |
| `ready()` | Steps until the shell and its map are up and a frame is drawn. |
| `start(mode, opts)` | Starts a mode solo with its bots, cars, riders or ball, past the door and the quad picker. `mode` is `ball`, `drift`, `dogfight`, `ribbon` or `moto`; `opts` has `seed`, `bots`, `skill` (and `round`, `hits`, `length`, `size` where the game has them). The page must be on that mode's map: `/index.html?capture=1&seed=N&map=ball, drift, city or moto&craft=5inch&fly=1`. |
| `step(n = 1)` | Advances n x 1000/60 ms: timers due, then the queued rAF callbacks once (physics advances one 1/60 s frame, with its own 1 kHz substeps), then resolves when the frame is drawn. |
| `now()` / `frame()` | The virtual time in ms, and the number of steps taken. |
| `cam({pos, look, fov})` | Places the camera each frame, through `window.__setCam` (one camera system). `cam(null)` gives it back. |
| `follow(target, {offset, lookAhead, smooth, fov, world})` | Keeps a subject in mid frame. Targets: `player`, `ball`, `bot`, `bot:N`, `car:N`, `rider:N`, `goal:0`, `goal:1`, or several joined with `+` for their midpoint. `offset` is `[side, up, back]` in metres in the subject's direction of travel (`world: true` makes it a fixed world offset), `lookAhead` is seconds of its velocity, `smooth` is 0 to 0.99. |
| `path(keys)` | Camera keys `[{t, pos, look, fov}]`, t in virtual ms. |
| `pilot(keys)` | A stick script `[[tMs, roll, pitch, yaw, throttle], ...]` through `window.__stick`. `cam(null)` plus this is the player's own FPV view. |
| `hide({tips, hints, leftTab, chips, hud})` | CSS visibility only, so it changes what is drawn and never the game: `tips` the first flight guidance, `hints` each mode's start line, `leftTab` the SCORE tab, left panel, film slate and AIR readout, `chips` the Report bug, Pause and music buttons, `hud` everything. |

Scoring is the game's own: a grade, a table or a score appears only when the
run earns it. Nothing here sets one.

### Recording

`node scripts/capture-minigame.mjs --mode=<m> --seconds=12 --seed=1 --out=out/capture/<m>`
(also `npm run capture:minigame -- ...`) writes `frame_000001.png` onward at
1080x1920, and `capture.json` with the seed, options, git commit, virtual clock
spacing and the sha256 of the first 120 frames. Other flags: `--cam=follow:<target>|pilot|path:<file.json>`,
`--hide=tips,hints,leftTab,chips`, `--width`, `--height`, `--warmup=60`, `--bots`,
`--skill`, `--offset=side,up,back`, `--lookahead`, `--smooth`, `--fov`, `--stick=<file.json>`.
It exits non-zero if a frame fails, `window.__frameFault` is set, or the frame
count or the 16.667 ms spacing is wrong. Each mode has a default camera and stick script in the script.

```
node scripts/capture-minigame.mjs --mode=ball     --seconds=12 --seed=1 --out=out/capture/ball
node scripts/capture-minigame.mjs --mode=drift    --seconds=12 --seed=1 --out=out/capture/drift
node scripts/capture-minigame.mjs --mode=dogfight --seconds=12 --seed=1 --out=out/capture/dogfight
node scripts/capture-minigame.mjs --mode=ribbon   --seconds=12 --seed=1 --out=out/capture/ribbon
node scripts/capture-minigame.mjs --mode=moto     --seconds=12 --seed=1 --out=out/capture/moto
```

Encode with:

```
ffmpeg -framerate 60 -i out/capture/<mode>/frame_%06d.png -c:v libx264 -crf 16 -pix_fmt yuv420p -r 60 <mode>-1080x1920-60.mp4
```

## Licence

GPLv3. Compiling Betaflight's control loop in makes this a derivative
work; see LICENSE.
