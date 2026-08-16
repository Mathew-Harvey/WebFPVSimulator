# Prompt for the next session

Paste everything below the line into a fresh Grok session.

---

Read `CLAUDE.md`, then `prompts/fc-configurator-loop.md`, in full
before doing anything.

You are running the Configurator gauntlet. That file is the
constitution for this loop. Do not rewrite it. Do not reopen the
human-pinned decisions in it.

Cut branch `loop/fc-configurator` from current HEAD if you are not
already on it.

The job is a drone settings surface that a Betaflight pilot
recognises as Configurator: every Configurator option present,
unavailable options greyed out with a reason, every live control
reaching compiled Betaflight 4.5.1 through the existing CLI dump
path (`sim_init` -> `bridge.c` -> `bf_settings.c`). No Vue, no MSP,
no JS PID, no plant retune, no 1 kHz raise, no live PID mid-lap.

Round 1 is not a screen. Round 1 is the catalog, the WASM dump
export, and `scripts/fc-trace.js` so LIVE / INERT / GATED are
measured rather than asserted.

Round 2 built PID Tuning plus Filters plus Rates, Save through
`composeConfig`, `adoptSimClock` after every `sim_init`. Both
reviewers REJECT. Highest remaining product items: CLI plus
export plus the import dialog (default keep my rates), then mixed
tabs, then the grey museum. Do not steal the title stick pose
to satisfy F9; pause is the radio path.

Hard constraints:

- Do not edit anything under `tests/`.
- Do not edit `vendor/betaflight` in place.
- Do not change the plant, the ABI version, or the 1 kHz step.
- Never report a check as passing without running `npm run verify`
  in that same turn.
- After every turn that changes code, append to `PROGRESS.md`.
- Use the verify-flight-model skill before claiming a native or
  WASM change is done.

Three phases per round, in order: BUILD one item, EVIDENCE
(hashes, lint output, verify table, screenshots), BREAK
(two hostile reviewers, verdicts binding).

/goal two consecutive adversarial rounds with every F and D item
PASS, `lint:catalog` `lint:fc` `lint:presets` exit 0, and no
physics regression.
