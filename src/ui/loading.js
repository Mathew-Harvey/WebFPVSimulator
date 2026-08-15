/*
 * loading.js: a loading screen that reports work, not time.
 *
 * WHY THIS IS NOT A SPINNER. The page fetches a 1.2 MB renderer from a CDN,
 * a WebAssembly module, a map module graph of up to sixty one files, and then
 * builds a world that generates a few hundred Canvas2D textures on the main
 * thread. On a slow link the first of those dominates; on a slow machine the
 * last does. A bar on a timer is wrong in both cases and, worse, it is wrong
 * in a way that hides which one is the problem. So every stage here is named
 * and every stage's progress comes from something that actually happened. The
 * player just sees "loading" and a joke. The bar still tracks real work, so a
 * stall is a bar that stopped rather than a spinner that lied.
 *
 * WHERE THE PROGRESS COMES FROM, per stage:
 *
 *   Renderer   name and elapsed time only. Streaming the three.js module for
 *              byte progress was built and then withdrawn: measured, the
 *              browser made TWO resource requests for three.module.js, so the
 *              prefetch is not reliably free. See the note in src/boot.js.
 *              This stage does not pretend to know how far through it is.
 *   Simulator  bytes, from the same streamed fetch of dist/sim.wasm, which
 *              the shell needs anyway.
 *   Map        module count, from a PerformanceObserver on resource timing.
 *              The browser walks the import graph itself, so counting the
 *              entries under the map's path is a free and honest measure of
 *              how much of the graph has arrived.
 *   World      the map builder's own onProgress, which reports after each
 *              phase of construction.
 *   First frame  binary, and it is the last thing that happens.
 *
 * WEIGHTS ARE MEASURED, NOT GUESSED. A stage's share of the bar is its
 * measured duration over the total. The defaults below were measured in this
 * container; `planStages` scales the world stage by the map's own recorded
 * build time, so the city's world does not sit inside a slot sized for the
 * field's.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * Measured on this container at 1280 by 720, race field, in the run recorded
 * in PROGRESS.md:
 *
 *     run 1   three 56.6   sim 24.5   module 24.3   world 2885.8   frame 437.8
 *     run 2   three 89.4   sim 19.5   module 34.2   world 3042.4   frame 424.9
 *
 * and the values below are the mean of the two. Under a 1500 kbps throttle the
 * same boot measured three 90.3, sim 362.3, module 895.3, world 2965.9, frame
 * 391.5: the two fetch stages grow by an order of magnitude and the two main
 * thread stages do not move, which is the whole reason the stages are named
 * separately.
 *
 * ONE CAVEAT, and it is the reason the elapsed readout exists. The capture
 * harness serves the three.js CDN from a local cache, so 56.6 ms is a warm
 * fetch and a cold one over a real link is hundreds of milliseconds for
 * 1.2 MB. The weight below is the measured one; on a slow first visit the bar
 * will sit in that stage longer than its share, and the stage name and the
 * seconds beside it are what make that legible rather than mysterious.
 * Replace these with a re-measurement, never with a guess.
 */
export const MEASURED_MS = {
  three: 73,
  sim: 22,
  module: 29,
  world: 2964,
  frame: 431,
};

const STAGE_NAMES = {
  three: 'Renderer',
  sim: 'Flight controller',
  module: 'Map',
  world: 'World',
  frame: 'First frame',
};

export const JOKE_MS = 4800;

export const LOADING_JOKES = [
  'I complimented my quad on its propellers. It said thanks for the props.',
  'My flight controller only eats Greek food. It loves a good gyro.',
  'My LiPo went to prison. It\'s doing time in six cells.',
  'My quad is a helicopter parent. It never stops hovering.',
  'My tiny whoop just won the race. Big whoop.',
  'Someone snapped my carbon. I\'ve been framed.',
  'My quad broke an arm, and now it won\'t arm. Poetic.',
  'Race directors are so exclusive. Pure gatekeeping.',
  'My racing record is chequered. That\'s the whole point.',
  'My VTX and I just click. Same wavelength.',
  'My battery reads the news every morning. It likes to stay current.',
  'The packs went on strike. It was revolting.',
  'My old LiPo refuses to change. Too much internal resistance.',
  'My battery left the army. Honourable discharge.',
  'Why did the pilot bring soap to the track? Prop wash.',
  'What does a baby battery call its mum? mAh.',
  'My quad went low carb. Kept the fibre.',
  'My quad was on a roll. Then a pitch. Then a yaw.',
  'My quad asked for a raise, so I upped its rates.',
  'The start gates are in mint condition. Never been hit. Yet.',
];

export function quotedJoke(index, offset) {
  const n = LOADING_JOKES.length;
  const i = (((index || 0) + (offset || 0)) % n + n) % n;
  return `"${LOADING_JOKES[i]}"`;
}

/*
 * Stage plan for one load. `worldMs` is the map's own measured build time, so
 * the world stage takes the share it actually needs.
 */
export function planStages(ids, worldMs) {
  const stages = ids.map((id) => ({
    id,
    name: STAGE_NAMES[id] ?? id,
    ms: id === 'world' ? (worldMs ?? MEASURED_MS.world) : MEASURED_MS[id],
  }));
  const total = stages.reduce((a, s) => a + s.ms, 0);
  for (const s of stages) {
    s.weight = s.ms / total;
  }
  return stages;
}

/*
 * Fetch with byte progress. Returns the bytes. Falls back to a plain fetch on
 * a response with no body reader or no content-length, in which case progress
 * stays at zero for the stage and the elapsed readout is what carries it,
 * which is honest: we do not know, and pretending would be worse.
 */
export async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url}: ${res.status}`);
  }
  const totalHeader = Number(res.headers.get('content-length'));
  const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : 0;
  if (!res.body || !total) {
    const buf = await res.arrayBuffer();
    if (onProgress) {
      onProgress(1, buf.byteLength, buf.byteLength);
    }
    return new Uint8Array(buf);
  }
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    got += value.length;
    if (onProgress) {
      onProgress(Math.min(1, got / total), got, total);
    }
  }
  const out = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/*
 * Count modules arriving under a path prefix, using the browser's own
 * resource timing. Costs nothing and needs no cooperation from the modules.
 */
export function moduleCounter(prefix, expected, onProgress) {
  const seen = new Set();
  const note = (name) => {
    if (!name.includes(prefix) || seen.has(name)) {
      return;
    }
    seen.add(name);
    onProgress(Math.min(1, seen.size / expected), seen.size, expected);
  };
  for (const e of performance.getEntriesByType('resource')) {
    note(e.name);
  }
  let observer = null;
  if (typeof PerformanceObserver === 'function') {
    observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        note(e.name);
      }
    });
    try {
      observer.observe({ type: 'resource', buffered: true });
    } catch (e) {
      observer = null;
    }
  }
  return {
    stop() {
      if (observer) {
        observer.disconnect();
      }
      return seen.size;
    },
  };
}

/*
 * Give the browser a chance to actually PAINT before the caller blocks the
 * main thread.
 *
 * This is not a nicety, it is the difference between a loading screen and no
 * loading screen. Building the city is about nine seconds of synchronous work
 * on the main thread, and a screenshot taken during it showed the previous
 * frame with no loading screen on it at all: the DOM had been updated, and
 * nothing had been composited. One requestAnimationFrame is not enough
 * either, because a rAF callback runs BEFORE the paint of the frame it is
 * scheduled in, so resolving there and blocking immediately skips that paint
 * as well. Two frames and then a task is the shortest sequence that
 * guarantees the pixels are on screen.
 */
export function yieldToPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 0);
      });
    });
  });
}

export class Loading {
  constructor(root) {
    this.root = root;
    this.bar = root.querySelector('.loading-fill');
    this.stageEl = root.querySelector('.loading-stage');
    this.jokeEl = root.querySelector('.loading-joke');
    this.stages = [];
    this.index = -1;
    this.frac = 0;
    this.failed = false;
    this.jokeSeed = 0;
    this.startedAt = 0;
    this.stageStartedAt = 0;
    /* Every stage's real duration, for the harness and for re-measuring the
     * weights above. Read through window.__loading. */
    this.timings = {};
    this.ticker = null;
    this.visible = !root.hidden;
    /*
     * The pending hide from the last finish().
     *
     * Without this the screen races itself. finish() fades out and then hides
     * the element 320 ms later to match the CSS transition. Choosing a map
     * from the title screen starts a new load well inside that window, so
     * run() would make the screen visible and the stale timeout would then
     * hide it again, leaving an eight second city build behind a frozen
     * picture of the map that was just disposed. Measured exactly that way:
     * the capture at two seconds into a swap showed the race field with the
     * title menu over it and no loading screen at all.
     */
    this.hideTimer = null;
  }

  run(stages) {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.stages = stages;
    this.index = -1;
    this.frac = 0;
    this.failed = false;
    this.jokeSeed = Math.floor(Math.random() * LOADING_JOKES.length);
    this.startedAt = performance.now();
    this.timings = {};
    this.root.hidden = false;
    this.root.style.opacity = '1';
    this.bar.style.background = '';
    this.jokeEl.classList.remove('is-error');
    this.visible = true;
    this.stageEl.textContent = 'loading';
    this.paint();
    if (!this.ticker) {
      this.ticker = setInterval(() => this.paintJoke(), 250);
    }
  }

  start(id) {
    const i = this.stages.findIndex((s) => s.id === id);
    if (i < 0) {
      return;
    }
    this.index = i;
    this.frac = 0;
    this.stageStartedAt = performance.now();
    this.paint();
  }

  progress(id, frac, detail) {
    if (this.index < 0 || this.stages[this.index].id !== id) {
      this.start(id);
    }
    this.frac = Math.max(0, Math.min(1, frac));
    if (detail !== undefined) {
      this.detail = detail;
    }
    this.paint();
  }

  done(id) {
    const i = this.stages.findIndex((s) => s.id === id);
    if (i < 0) {
      return;
    }
    this.timings[id] = performance.now() - this.stageStartedAt;
    this.index = i;
    this.frac = 1;
    this.paint();
  }

  /* Fraction of the whole bar: every completed stage's weight, plus this
   * stage's weight times how far into it we are. */
  value() {
    let v = 0;
    for (let i = 0; i < this.stages.length; i += 1) {
      if (i < this.index) {
        v += this.stages[i].weight;
      } else if (i === this.index) {
        v += this.stages[i].weight * this.frac;
      }
    }
    return v;
  }

  paint() {
    if (!this.visible) {
      return;
    }
    const pct = (this.value() * 100).toFixed(1);
    this.bar.style.width = `${pct}%`;
    this.paintJoke();
  }

  paintJoke() {
    if (!this.visible || this.failed) {
      return;
    }
    const at = this.jokeSeed + Math.floor((performance.now() - this.startedAt) / JOKE_MS);
    const text = quotedJoke(at);
    if (this.jokeEl.textContent !== text) {
      this.jokeEl.textContent = text;
    }
  }

  fail(message) {
    this.failed = true;
    this.stageEl.textContent = 'Could not start';
    this.jokeEl.textContent = message;
    this.jokeEl.classList.add('is-error');
    this.bar.style.width = '100%';
    this.bar.style.background = '#e8503a';
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  finish() {
    this.frac = 1;
    this.index = this.stages.length - 1;
    this.paint();
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    this.visible = false;
    this.root.style.opacity = '0';
    /* Matches the CSS transition. Hidden as well as transparent, because a
     * transparent overlay still eats pointer events on some browsers even at
     * pointer-events none if a child sets it back. */
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.root.hidden = true;
    }, 320);
    this.timings.total = performance.now() - this.startedAt;
  }
}
