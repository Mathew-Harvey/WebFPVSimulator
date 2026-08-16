# Gauntlet loop: a Betaflight Configurator inside the sim

You are running unattended on the repository at
github.com/Mathew-Harvey/WebFPVSimulator. Cut a branch
`loop/fc-configurator` from current HEAD and stay on it. Do not
fast-forward `main` until the definition of done is met.

There is no human to ask. The architecture below is decided. The
open questions a human already pinned are pinned. If something else
is ambiguous, measure it, pick the option that keeps the plant and
the CLI path honest, write the choice in PROGRESS.md, and continue.

Read first, in this order: `CLAUDE.md`, this file, the last two
entries of `PROGRESS.md`, `src/native/bf/bf_settings.c`,
`src/native/bf/bf_glue.c`, `src/native/bridge.c`, `configs/rates.js`,
`src/ui/ui.js` (the settings screen only), `src/main.js` (config
compose, `sim_init`, `adoptSimClock`).

Your job is one product: a drone settings surface that a Betaflight
pilot recognises as Configurator, with every Configurator option
present, with options this sim cannot honour greyed out and named
as such, and with every live control reaching compiled Betaflight
4.5.1 the same way a dropped dump already does.

That is how a real quad works. Configurator never flies the aircraft.
It writes settings into firmware. The firmware and the airframe fly.

---

## THE PRIME DIRECTIVE

**You may not change a threshold, tolerance, rubric item, reference
asset, or success criterion in order to make a check pass.**

This includes: widening a band, deleting a check, marking an item
"not applicable", renaming a failure to a "known limitation", moving
a hard requirement into "future work", or softening any wording below.

If a bar is hard, the answer is better code. Never a softer test.

If you become convinced a bar is genuinely wrong, write the
derivation into `.loop/threshold-disputes.md`, mark the item BLOCKED
WITH ARGUMENT, keep every other bar intact, and continue.

**Do not fabricate evidence.** Not a trace hash, not a catalog count,
not a screenshot description of a screen you did not render.

**Do not rewrite this document.**

**Do not edit anything under `tests/`.** New checks for this loop live
under `scripts/`, the same way `scripts/preset-lint.js` already does.
`tests/` is the Stage 1 harness. It is read-only to you.

**Do not edit `vendor/betaflight` in place.** Patches go in `patches/`
and are applied at build time. `git diff --stat vendor/betaflight`
must be empty after a build.

**Do not change the plant, the ABI version, the 1 kHz step, or any
`PlantParams` constant.** This loop configures the flight controller.
It does not become a different airframe. Additive `sim_bf_*` exports
in the style of `sim_bf_debug` are allowed. Changing `sim_abi.h`
entry points or `SIM_ABI_VERSION` is not.

---

## WHAT THIS IS NOT

These are automatic FAILs. Do not start them. If a reviewer finds
one, revert that round.

- Do not embed, iframe, vendor, or fork
  https://github.com/betaflight/betaflight-configurator. It is Vue,
  Vite, Nuxt UI, and MSP over serial. This project is plain
  JavaScript, no framework, no bundler beyond Emscripten. Current
  Configurator master also targets newer firmware than the 4.5.1
  tree under `vendor/betaflight`.
- Do not compile MSP so "the real app can talk to WASM."
- Do not reimplement PID, filters, rates curves, TPA, iterm relax,
  anti-gravity, airmode, feedforward, or simplified sliders in
  JavaScript. If a LIVE control is missing, compile more Betaflight
  or leave it grey. Never approximate it so a slider "does something."
- Do not dump PID fields into `src/ui/ui.js`. That file is the game
  shell. This feature lives in `src/fc/` and `src/ui/fc.js`.
- Do not keep a shadow PID object that is "mostly like" the firmware.
  Two sources of truth is how `d_min_roll` used to apply and change
  nothing.
- Do not silently map `motor_kv`, `vbat_*`, or `battery_capacity`
  onto `plant.c`. Those keys are inert or applied-inert today. Wiring
  them is a physics-shape change and is out of scope.
- Do not raise the loop rate to un-grey the dynamic notch.
- Do not live-patch PID mid-lap. Save means `sim_init` of the draft
  dump, then `adoptSimClock`. A race in progress prompts save-and-
  restart or wait until the result screen.
- Do not hide unavailable tabs. Grey them, with a one-line reason.

---

## ARCHITECTURE (binding)

Three layers, one arrow:

```
Configurator-shaped UI  ->  CLI dump text  ->  existing WASM path
     src/ui/fc.js            src/fc/dump.js     sim_init / bf_settings.c
              ^                      ^
        src/fc/catalog.js      firmware PGs are the source of truth
```

The UI never writes a PID. It edits a dump. Save concatenates draft
CLI, applies the rates policy, and calls `sim.init(text)`, the same
call a dropped file already uses. Readback means the module dumps
the live parameter groups back to CLI, so the screen cannot lie.

### Files you may add

| Place | Job |
|---|---|
| `src/fc/catalog.js` | Every Configurator field: tab, CLI key, type, units, min/max/lut, **status**, reason string |
| `src/fc/dump.js` | Parse/serialize CLI. `composeConfig(tuneText, rates, policy)` is the only place tune and rates are joined |
| `src/ui/fc.js` | The FC screen: tabs, fields, grey-out, Save / Discard / Export |
| `scripts/fc-catalog-lint.js` | Fail if a 4.5.1 `valueTable` key is missing from the catalog, or a LIVE catalog key is missing from `bf_settings.c` |
| `scripts/fc-trace.js` | Round-trip, LIVE-moves-trace, INERT-does-not, GATED-dyn-notch, rates-policy |

### Files you may change, narrowly

- `src/native/bf/bf_settings.c` / `.h`: dump export and per-key status.
  Keep the write table. Do not silently swallow new LIVE keys.
- `src/native/bf/bf_glue.c`: export dump/status next to `sim_bf_debug`.
- `src/main.js`: call `composeConfig`. After every FC `sim_init`, call
  the existing `adoptSimClock` path. A Save that leaves `lastTs` ahead
  of `step_index` reintroduces seconds of stick lag. That bug is in
  PROGRESS.md dated 2026-08-16. Do not regress it.
- `src/ui/ui.js`: one new row "Flight controller" that opens the FC
  screen. Move the five rate rows out of Settings into the FC rates
  page. Leave a one-line rates summary in Settings. Game settings
  (camera, FOV, graphics, sound, pack charge, laps, name) stay here.
- `index.html`: CSS for the FC screen in the existing overlay language
  (cream, sakura, amber, slate). Not a Vue/Nuxt skin.
- `package.json`: add `lint:catalog` and `lint:fc` scripts. Zero new
  npm dependencies.
- `configs/rates.js`: stays the rates policy module. Do not put rates
  back into tune files.

`src/ui/ui.js` should shrink on this feature, not grow.

### Status values, one renderer, no per-tab special cases

| Status | Control | Meaning | Example |
|---|---|---|---|
| LIVE | Enabled | Writes a PG this build compiles, and that code runs every 1 ms | `p_roll`, `dterm_lpf1_static_hz`, `rpm_filter_q` |
| GATED | Enabled, firmware note | Writes the PG. **This firmware** then ignores it under our loop rate. A real 1 kHz quad does the same | `dyn_notch_*` (SDFT will not arm below 2 kHz). `pid_process_denom` stored then forced to 1 |
| APPLIED_INERT | Grey | Writes a PG this build compiles. Nothing that flies reads it | `motor_kv` (plant `ke` is independent), `gyro_hardware_lpf` |
| INERT | Grey | Real 4.5 CLI key, subsystem not compiled | `osd_*`, `vtx_*`, `gps_*`, `blackbox_*`, `serial*`, `failsafe_*` |
| ABSENT | Grey | Configurator chrome that is not a CLI key here | Firmware flasher, Ports UART grid, cloud backups |
| SHELL | Not on this screen | Game / radio convenience | Camera angle, graphics, volume, pack charge |
| PLANT | Not in this loop | Physics constants | Mass, `kt`/`kq`, CdA, motor R |

GATED vs INERT is the honesty line. Grey means "this simulator does not
have that machine." A noted GATED control means "Betaflight has it, and
at 1 kHz it does what 1 kHz Betaflight does." Greying the dynamic notch
teaches the wrong lesson.

Each grey field shows a one-line reason in the help slot.

Promoting INERT to LIVE means compiling more Betaflight, adding the key
to `bf_settings.c`, changing the catalog, and adding a trace test.
Never promote by writing a JS approximation.

Pin field names, units, and groups to **Betaflight 4.5.1**:
`vendor/betaflight/src/main/cli/settings.c` and
https://betaflight.com/docs/wiki/app/pid-tuning-tab
Not to Configurator `master`.

---

## HUMAN-PINNED DECISIONS (do not reopen)

1. **Show every Configurator tab.** Unavailable tabs and fields are
   grey, not hidden.
2. **Rates belong to the pilot.** Switching a registry tune does not
   overwrite the menu rates. Importing a full dump asks "use dump
   rates or keep mine," default **keep mine**. `composeConfig` appends
   the chosen rateprofile last, the way `ratesDiff` already does.
3. **`motor_kv` stays APPLIED_INERT.** Do not derive plant `ke` from it.
4. **Loop rate stays 1 kHz.** `pid_process_denom` remains forced to 1.
5. **No Airframe page in this loop.** Plant stays the Stage 1 5 inch.
6. **Simplified sliders** emit `simplified_tuning apply` in the dump,
   in the same place a Karate preset does, then allow lines below it
   to override. Call Betaflight's `applySimplifiedTuning`. Do not
   reimplement the slider math.
7. **One PID profile, one rate profile**, both profile 0. Profile
   switching is grey until three `pidProfile_t`s actually exist.
8. **Angle mode** stays `sim_set_angle_mode` from Settings. The Modes
   tab may drive that same ABI as on/off. Do not invent a JS mode
   matrix. AUX ranges stay grey until aux channels exist.
9. **Visual language is this game's overlay**, not Configurator's Vue
   chrome. Information architecture (tabs, field names, units, groups)
   is Configurator. A later classic-dark skin is out of scope.

---

## TAB MAP

### Fully live (this is the product)

**PID Tuning:** simplified sliders, expert P/I/D/F, D max, iterm
relax, anti-gravity, TPA, feedforward, throttle boost, crash recovery,
angle/horizon gains. Filter page: gyro LPF1/2, dyn LPF, static notches,
D-term LPF, yaw LPF, RPM filter. Rates page: all three axes, all
`rates_type` values, throttle limit, thr mid/expo.

**Presets:** existing registry tunes plus drag-and-drop. Optional
fetch from `betaflight/firmware-presets` **4.5 branch only**. Master
presets are a version lie.

**CLI:** a textarea over the same tokenizer as `bridge.c`. `dump` /
`get` need the WASM export.

### Mixed LIVE / grey

**Receiver:** LIVE rc smoothing, mid/min/max check, airmode start
throttle. Stick preview may bind to the existing Gamepad path. GREY
serial protocol, telemetry, RSSI, SPI RX, MSP RX. Calibration stays
in Settings.

**Configuration / Features:** LIVE AIRMODE, ANTI_GRAVITY, mixer type,
yaw reversed, dshot idle, motor poles. GREY GPS, OSD, LED, telemetry
hardware, 3D, acc/baro/mag hardware. GATED loop frequency.

**Motors:** LIVE idle, mixer type, motor output limit, yaw reversed.
Motor test on the title craft may use `sim_motor_override` (already
in the ABI). Never mid-race. GREY DShot bitbang, output reordering,
ESC passthrough, 3D.

**Modes:** ARM grey (always armed). ANGLE as on/off through the
existing ABI. Everything else grey.

**Power:** GREY voltage/current meters. Pack charge stays in Settings.

**Setup / Sensors:** attitude from `sim_state` is live and useful.
Calibration, mag, baro, GPS plots grey.

### Entire tabs grey, still shown, one reason each

Firmware flasher, Ports, OSD, VTX, LED strip, GPS, Failsafe, Servos,
Onboard logging, Blackbox viewer, Adjustments, Autotune, Flight plan,
cloud profile, cloud backups.

OSD settings stay grey until pixels move in the FPV view. Do not
store `osd_rssi_pos` and pretend.

---

## F. THE FC RUBRIC

Every item is a falsifiable observation. An item passes only when a
hostile reviewer says it passes, against artefacts, not against your
summary.

### Honesty (the 1:1 contract)

- **F1.** A catalog exists covering every `valueTable` key in
  `vendor/betaflight/src/main/cli/settings.c` for this target, plus
  every Configurator tab listed above. `npm run lint:catalog` fails
  on a missing key or a LIVE key not in `bf_settings.c`.
- **F2.** Every catalog row has a status from the table above and a
  reason string when not LIVE.
- **F3.** Loading default diff, dumping from WASM, loading that dump
  again, produces a bit-identical short hover trace. Publish both
  hashes.
- **F4.** LIVE-moves-trace. Two inits that differ by one of
  `p_roll`, `gyro_lpf1_static_hz`, `roll_srate`,
  `rpm_filter_harmonics`, `feature -AIRMODE` produce different traces.
  Publish the hashes.
- **F5.** INERT-does-not. Adding `set osd_rssi_pos = 123` does not
  change the hash.
- **F6.** GATED dyn notch. `dyn_notch_count` 0 vs 3 at 1 kHz: hashes
  **equal**. The test comment names Betaflight's 2 kHz floor so nobody
  "fixes" it.
- **F7.** Switching the Karate registry tune does not change
  `roll_srate` unless the user opted into dump rates. This is the
  original Karate-felt-worse bug. Prove it by reading the module
  back, not the menu.
- **F8.** A dropped `.diff` still loads through `sim_init`. Rates
  still append last under the keep-mine policy. Changing Volume does
  not reload the FC and does not undo a dropped dump.

### Product (what a pilot sees)

- **F9.** A "Flight controller" entry exists from title and pause.
  Keyboard alone and gamepad alone can open it, change a LIVE field,
  Save, and return. Capture the screens.
- **F10.** PID Tuning, Filters, and Rates pages show the 4.5.1 field
  names and units. Simplified mode ON runs `simplified_tuning apply`
  through the dump, not through JS math. Prove Karate sliders still
  land by reading `sim_bf_debug` P/D/F after Save, the way
  `preset-lint.js` already does.
- **F11.** Every Configurator tab listed in the tab map is present.
  Grey tabs cannot be edited. The help line states why. Capture one
  LIVE tab and one grey tab.
- **F12.** Export downloads a CLI dump a real 4.5 Configurator would
  accept: `set key = value` lines, `feature` lines,
  `simplified_tuning apply` where used. Inert keys may be present.
  LIVE keys in the dump match module readback.
- **F13.** Settings still holds camera, FOV, graphics, sound, pack,
  laps, name, calibrate. Rate rows have moved. The rates summary
  still matches `ratesSummary`.
- **F14.** Save during a run does not leave stick lag. After Save,
  `window.__stickPath()` (or the equivalent you publish) shows
  `simStepMs` equal to module `t` in milliseconds, and `lastTs` not
  ahead of it. Cite the 2026-08-16 clock-skew fix. A Save that only
  calls `sim_init` without adopting the module clock is a FAIL.

### Engineering integrity (non negotiable, every round)

- **D1.** `npm run verify` in the same turn as any claim. The floor
  is: every physics check that was passing at loop start stays
  passing, with no material move of hover, punch, terminal, t63,
  sag, or rate-tracking. `yaw-coupling` stays red. Do not touch
  `tests/thresholds.json`. Paste the table.
- **D2.** `git diff --stat vendor/betaflight` is empty.
- **D3.** Zero console errors and zero console warnings on load, on
  opening the FC screen, on Save, and after a short flight.
- **D4.** Physics path still has no JS `Math.sin` / `Math.cos` /
  `Math.pow` and reads no frame time.
- **D5.** Every new source file carries a GPLv3 header. No new npm
  dependency.
- **D6.** No em dashes or en dashes in prose, comments, commit
  messages, or documentation.
- **D7.** `git diff HEAD -- tests/` is empty at the end of every
  round.
- **D8.** No number in a comment, in PROGRESS.md, or in a commit
  message that is not backed by a measurement. Grep your own diff
  for digits before committing.
- **D9.** `npm run lint:presets` still exits 0.
- **D10.** `src/ui/ui.js` does not contain PID field names (`p_roll`,
  `d_min`, `tpa_rate`, `gyro_lpf`). Those belong in `src/fc/` and
  `src/ui/fc.js`.
- **D11.** There is one compose function. `main.js` does not
  concatenate tune text and rates text itself once `dump.js` exists.
- **D12.** Use the verify-flight-model skill before claiming any
  native or WASM change is done.

---

## THE LOOP

Three phases per round. Do not merge them.

### Phase 1: BUILD, one item

Priority is binding:

1. A D regression.
2. Round 1 if the catalog, dump export, and `scripts/fc-trace.js` do
   not yet exist. **Round 1 is not a screen.** An unmeasurable catalog
   is where fake LIVE/INERT claims come from.
3. Then F9 to F11: PID Tuning plus Filters plus Rates, Save path,
   rates policy, clock adopt.
4. Then CLI plus export plus import dialog (keep mine / use dump).
5. Then mixed tabs: Receiver, Features, Motors.
6. Then the grey museum: remaining tabs visible and disabled.
7. Then whatever FAIL a reviewer ranked highest.

Keep it simple: plain JavaScript, one file doing an obvious thing.

### Phase 2: EVIDENCE

Before you may say anything works:

- Run `npm run lint:catalog` and `npm run lint:fc` (or
  `scripts/fc-trace.js`) and paste the output.
- Run `npm run lint:presets` and paste the output.
- Run `npm run verify` and paste the table. Use the
  verify-flight-model skill when native or WASM moved.
- Capture the actual FC screens in headless Chromium. The harness
  pattern is `tests/lib/browser.js` and `scripts/shots.js`. Chromium
  needs `--use-angle=swiftshader`. Look at the frames.
- For F3 to F7, publish hashes and the exact diffs used. "It should
  be different" is not evidence.
- For F14, publish the clock readout after Save.

### Phase 3: BREAK, adversarial review, binding

Spawn fresh reviewers with the Agent tool, in their own context.
Give them the artefacts and the file paths. Do **not** give them
your summary of what you did. Tell them **not to edit any file**.
Run `git status` after every review round.

Brief them roughly like this:

> You are reviewing a browser FPV simulator's new flight-controller
> settings against a fixed rubric in prompts/fc-configurator-loop.md.
> You are hostile. Your default verdict is REJECT. The author's
> description of their own work is not evidence; only screenshots,
> printed hashes, script output, and the code are evidence. For each
> F and D item you are given, return PASS, FAIL, or CANNOT VERIFY,
> and for every FAIL give the single most specific fix you can name,
> in one sentence, pointing at a file. Rank FAILs by how much each
> one costs a pilot who thinks this dump is their real tune. Do not
> edit any file.

Run at least two per round. Pick the two that fit what you changed:

- A Betaflight Configurator user who flashes dumps for a living,
  judging whether the tabs, names, units, and Save behaviour match
  4.5.1, and whether grey fields are honest.
- An FPV racing pilot judging the rates policy: changing Karate
  must not steal their stick authority.
- A QA tester paid per defect, hunting a LIVE slider that writes
  nothing, a grey slider that still writes, Volume reloading the
  FC, Save leaving stick lag, or `ui.js` growing PID fields.
- An engineer judging spaghetti: second write paths, shadow state,
  Vue, MSP, JS PID, plant keys quietly wired.

**Verdicts are binding.** You may only fix it, show with a new
artefact that the reviewer was factually wrong, or record it in
`.loop/blocked.md` with the reason it cannot be done in this
container.

### Bookkeeping, every round

Update `.loop/state.json` with: `loop` set to `fc-configurator`,
round number, item attempted, reviewer verdicts, and the running
pass/fail of every F and D item. Do not delete the old G/A/T
history; add a sibling object `rubric_F`.

Append what did not work **and why** to `.loop/tried-and-rejected.md`.
Append the round to `PROGRESS.md`, including what went wrong. Commit
with a message that says what changed and what the evidence was.
Keep `.loop/HANDOVER.md` current at the end of every round.

If two consecutive rounds oscillate, write the conflict into
`.loop/conflicts.md` with both mechanisms, then design a third
approach that satisfies both.

---

## KNOWN BLOCKERS, DO NOT FAKE THEM

- Absolute flight feel. The harness cannot tell you the tune "feels
  like a real quad." F4 to F7 prove the dump reached Betaflight.
  A human still has to fly it.
- Real radio hardware. Gamepad path only.
- Configurator master UI parity pixel for pixel. Information
  architecture is the bar, not Nuxt components.
- Dynamic notch actually filtering at 1 kHz. Firmware refuses. F6
  asserts the refusal. Do not stub a notch in JS.
- Plant response to `motor_kv` / pack CLI keys. Out of scope.
- `yaw-coupling` still red. Do not touch the threshold.
- `map-isolation` may be red against an old draw-call baseline.
  Do not widen it. It is not this loop's item.

---

## THE STATE THIS LOOP INHERITS

The FC path already exists and is the thing you must reuse:

- Betaflight 4.5.1 compiled to WASM. Rates, PID, filters,
  feedforward, TPA, iterm relax, airmode, anti-gravity, mixer,
  simplified sliders, gyro chain, RPM filter, dynamic idle.
- `sim_init(diff_utf8)` parses CLI via `bridge.c` onto real
  parameter groups via `bf_settings.c` (~100 LIVE keys, inert
  prefixes, unknown counted).
- `scripts/preset-lint.js` fails a shipped preset that drifted
  into UNKNOWN.
- Tunes in `configs/`. Rates in `configs/rates.js`, appended last,
  owned by the pilot.
- Drop a `.diff` on the page: same `sim_init` path.
- `sim_set_angle_mode` for Angle. Pack charge via
  `sim_set_cell_voltage`, not `vbat_*`.
- `recordKey()` hashes `configText`, so custom dumps get their own
  best-lap bucket if you keep composing into that string.
- Stick-clock rule: after `sim_init` / `sim_reset`, JS time follows
  the module (`adoptSimClock`). Never raise sample timestamps to a
  leftover `lastTs`.

`npm run verify` at loop start: physics checks passing, yaw-coupling
red, map-isolation possibly red. Read the last PROGRESS.md verify
table and treat those passing measured values as the floor.

---

## DEFINITION OF DONE

**Two consecutive rounds in which every F item and every D item is
PASS by adversarial review, no reviewer raises a new FAIL, `npm run
verify` has not regressed any previously passing physics check,
`npm run lint:catalog` and `npm run lint:fc` and `npm run lint:presets`
exit 0, and the browser console is clean on the FC path.**

Blocked items with a written argument do not prevent done, but they
must be listed at the top of `.loop/FINAL.md`.

When done: fast-forward `main` only if the human's usual rule for
this repo allows it (a previous loop was merged on explicit human
instruction). If unsure, do not fast-forward `main`. Push the branch
and write `.loop/FINAL.md` with what is built, what is blocked, what
was tried and rejected, the catalog counts (LIVE / GATED /
APPLIED_INERT / INERT / ABSENT), the trace hashes for F3 to F7, and
where the sharp edges are.

## IF YOU RUN OUT OF ROOM

Context exhaustion is not failure. Update `.loop/HANDOVER.md` with
the round state, the exact next item, the catalog counts, and
anything you learned that is not yet written down. Commit and push
the branch. The next instance continues from there.

Do not stop because the task is large. Stop when the rubric is
green, or when every remaining item is blocked for a reason you
have written down and a human has to break the tie.
