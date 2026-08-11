# The judging loop

The verification harness measures everything measurable about this
simulator. It cannot tell you whether the thing feels like a quad or
whether the world looks good. LOOP.md says that gate is human. This is the
step before the human: two adversarial review panels that catch the
obvious misses cheaply, so a real pilot's time is spent on the subtle ones.

## What it is

`.claude/workflows/fpv-judge-loop.js`, run with the Workflow tool.

Two panels, three reviewers each, all read only:

**FPV pilot of ten years**, judging realism of physics and control.
- `control`: rate step responses, rates and expo, tune plausibility, yaw
  authority, how it would feel on a freestyle line.
- `flightmodel`: hover throttle and RPM, thrust to weight, punch, top
  speed, drag, sag, spool time, credibility of the absolute numbers.
- `authenticity`: the subconscious cues. Chopping throttle, carrying
  momentum, heavy versus floaty. Names the single biggest miss.

**Designer**, judging the visuals.
- `colour`: palette harmony, value structure, the banded cel shading,
  aerial perspective.
- `readability`: orientation, altitude, speed and next gate at speed.
- `composition`: silhouettes, scale, scenery density, horizon, the craft.

Every non minor finding is then handed to a challenger that tries to kill
it: misreads the code, restates a documented deferral, would break a band
in `tests/thresholds.json`, or trades more than it buys. Only survivors
reach the synthesis step, which returns one prioritised change list
ordered by feel per unit effort.

## The evidence it reads

Regenerate before running, or the panels judge a stale build:

```bash
npm run build:wasm
node scripts/flight-report.js > <scratch>/flight-report.txt
```

Screenshots come from a headless Chrome pass over the shell, one FPV and
one chase. In a container Chrome needs `--use-angle=swiftshader` for WebGL
and the Three.js CDN import has to be intercepted, because headless Chrome
does not inherit the proxy environment.

## Rules the panels work under

- `tests/` and `tests/thresholds.json` are read only, and `npm run verify`
  must not regress. A finding whose fix moves a measured value toward a
  band edge gets flagged, not silently applied.
- Deliberate Stage 2 deferrals are not findings: propwash turbulence,
  inflow in axial flight, ground effect, wind, and the zero roll to yaw
  coupling of a symmetric quad at this modelling order.
- A reviewer that cannot point at a number or an image detail is not
  reporting evidence.

## Why it is built this way

A single reviewer with a broad brief writes a broad review. Six narrow
lenses find things a general pass misses, and the challenge step is what
stops the panel inventing work: the first run of any judging loop produces
a pile of plausible sounding changes, and most of them are wrong. Scoring
and prioritising after the challenge, not before, is the difference
between a change list and a wish list.
