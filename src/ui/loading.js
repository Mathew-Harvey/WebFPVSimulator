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
  /* The board's own round trip on a warm local service. A sleeping Render
   * instance takes about a minute, which is exactly why this stage has a
   * name: the weight is what a healthy load costs, and the elapsed readout
   * beside the name is what carries an unhealthy one. */
  board: 60,
  sim: 22,
  module: 29,
  world: 2964,
  frame: 431,
};

const STAGE_NAMES = {
  three: 'Renderer',
  board: 'Board',
  sim: 'Flight controller',
  module: 'Map',
  world: 'World',
  frame: 'First frame',
};

/*
 * WHAT IS HAPPENING, IN WORDS, AND IT IS ON SCREEN THE WHOLE TIME NOW.
 *
 * This screen used to say "loading" and nothing else until a stage had
 * outstayed STALL_MS, on the argument that a parade of stage names is noise
 * on a load where every stage is over in under a second. That argument was
 * right about a healthy load and wrong about the one the owner reported: the
 * world stage is most of the bar and most of the wall clock, and through all
 * of it the screen said one unchanging word.
 *
 * A line that CHANGES five times is the cheapest proof a page can offer that
 * it is getting somewhere, and the change lands at the moment the previous
 * thing finished, which is precisely the information a waiting visitor
 * wants. The stall behaviour is unchanged and sits on top: once a stage
 * outstays its welcome the line says so, and adds the detail the caller
 * passed, which is what separates a slow network from a slow machine.
 *
 * Present participles, because they name work in progress rather than a
 * component: "Building the world" is a thing happening to you, "World" is a
 * label on a box.
 */
const STAGE_DOING = {
  three: 'Loading the renderer',
  board: 'Asking the leaderboard',
  sim: 'Starting the flight controller',
  module: 'Loading the map',
  world: 'Building the world',
  frame: 'Drawing the first frame',
};

/*
 * How much of a stage's slot the bar may cover before the stage actually
 * reports anything.
 *
 * The bar is aimed at this fraction of the slot over the stage's MEASURED
 * duration, with an easing that covers most of the distance early and then
 * creeps. Two properties matter and both are deliberate. It never reaches
 * the end of a slot on the estimate alone, so a stage that overruns leaves a
 * bar still moving inside its own territory rather than a bar sitting on the
 * next stage's doorstep. And a real event always wins: progress() and done()
 * re-aim it forward the moment they arrive.
 *
 * 0.86 rather than something nearer 1 because the last tenth of a slot is
 * where a long stage lives, and a bar with nowhere left to go is the thing
 * this whole file exists to avoid.
 */
const CREEP_TO = 0.86;

/*
 * And how long the creep takes, as a multiple of the measured duration.
 *
 * MUCH longer than the measurement, and the asymmetry is the point. A creep
 * that is too slow costs a jump at the end, at the moment the screen is
 * about to fade out anyway. A creep that is too fast costs a bar parked
 * against the top of its slot with the load still running, which is the
 * exact complaint this file is answering, moved higher up the track.
 *
 * At 3.5 the bar is about three fifths of the way through a stage's slot
 * when that stage was expected to finish, and still moving at three times
 * its estimate. Measured against the town on this container's software
 * rasteriser, which takes about twice its recorded build time: the bar
 * moves for the whole of it.
 */
const CREEP_FACTOR = 3.5;

/*
 * The easing. Fast out of the gate, then progressively slower, so the bar
 * spends its time where the stage does. A linear creep to the same place
 * looks confident for a second and then wrong for five.
 */
const CREEP_EASE = 'cubic-bezier(0.2, 0.4, 0.3, 1)';

/*
 * THE FLOOR UNDER A STAGE'S SHARE OF THE BAR.
 *
 * The weights are measured durations and the town's build is nine seconds of
 * the ten, so on that map the world stage owns 94 percent of the bar and the
 * four stages before it share the first six. Honest, and useless: four
 * things really did happen in the first second and the bar could not show
 * any of them, so the load began with a bar that appeared not to move.
 *
 * Every stage gets at least this much of the track, and the rest is shared
 * out by measurement as before. It is a floor on the DRAWING, not a guess
 * about the timing: the bar stops being linear in seconds and starts being
 * legible in stages, which is the trade this screen wants. Six stages at
 * five percent is thirty, so the world still owns most of what is left.
 */
const MIN_SHARE = 0.05;

export const JOKE_MS = 4800;

/*
 * How long a single stage may run before the screen names it.
 *
 * The calm version of this screen is the right default: "loading" and a joke,
 * because on a normal load every stage is over in well under a second and a
 * parade of technical stage names would be noise. But a stall in the CDN
 * fetch and a stall in the world build look identical when the only word on
 * screen is "loading", and they have completely different answers. So the
 * stage name arrives only when a stage has outstayed its welcome, which is
 * exactly when a player has started to wonder.
 *
 * Six seconds because the slowest stage on this container, the city's world
 * build, measures about three, so a healthy load never reaches this.
 */
export const STALL_MS = 6000;

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
  /* The floor first, then the measurement over what is left. See MIN_SHARE. */
  const floor = Math.min(MIN_SHARE, 1 / (stages.length || 1));
  const room = 1 - floor * stages.length;
  for (const s of stages) {
    s.weight = floor + (total > 0 ? (s.ms / total) * room : room / stages.length);
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

/*
 * WHAT THIS BROWSER CAN ACTUALLY DO, asked at the moment of failure.
 *
 * A boot can die for a handful of reasons and they have completely different
 * answers. No WebGL2 is a graphics driver or a hardware acceleration switch.
 * No WebAssembly is a locked down browser or an ancient one. A CDN that never
 * answered is a network, a blocker or a corporate proxy. Telling a stranded
 * visitor to "try Chrome" when their Chrome has hardware acceleration turned
 * off is advice that wastes their time, so every line below is a thing the
 * page checked rather than a thing it assumed.
 *
 * Each probe is wrapped, because a browser hostile enough to break the boot
 * is hostile enough to throw from feature detection.
 */
export function probeBrowser() {
  const out = {
    webgl2: false, webgl1: false, wasm: false, storage: false,
    online: true, softwareRenderer: false, renderer: '', engine: '', version: '',
  };
  try {
    const c = document.createElement('canvas');
    const gl2 = c.getContext('webgl2');
    out.webgl2 = Boolean(gl2);
    out.webgl1 = Boolean(gl2 || c.getContext('webgl'));
    const gl = gl2 || c.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        out.renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
        /* SwiftShader, llvmpipe and ANGLE's software backend all mean the
         * GPU is not being used, which on this workload is the difference
         * between flying and a slideshow. */
        out.softwareRenderer = /swiftshader|llvmpipe|software|basic render/i.test(out.renderer);
      }
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) {
        lose.loseContext();
      }
    }
  } catch (e) { /* Canvas or WebGL refused outright. The flags stay false. */ }
  try {
    out.wasm = typeof WebAssembly === 'object'
      && typeof WebAssembly.instantiate === 'function';
  } catch (e) { /* Same. */ }
  try {
    const k = 'webfpv.probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    out.storage = true;
  } catch (e) { /* Private window, or site data blocked. */ }
  try {
    out.online = navigator.onLine !== false;
  } catch (e) { /* No navigator worth reading. Assume online. */ }
  try {
    const ua = navigator.userAgent || '';
    /* Order matters: Edge and Opera both carry "Chrome", and every iOS
     * browser carries "Safari" while actually being Safari's engine. */
    const m = ua.match(/(Edg|OPR|Firefox|Chrome|Version)\/([0-9]+)/);
    if (m) {
      out.engine = { Edg: 'Edge', OPR: 'Opera', Version: 'Safari' }[m[1]] || m[1];
      out.version = m[2];
    }
  } catch (e) { /* No user agent. The advice below still works. */ }
  return out;
}

/*
 * The advice, ordered by what the probe found rather than by a fixed script.
 * Returns { why, steps }: one sentence naming the likely cause when there is
 * one, and the things to try, most likely to fix it first.
 */
export function recoveryAdvice(probe, message) {
  const steps = [];
  let why = '';
  const text = String(message || '');
  const looksNetwork = /fetch|network|load|import|CDN|cdn|jsdelivr|timeout|Failed to/i.test(text);

  if (!probe.wasm) {
    why = 'This browser cannot run WebAssembly, which is what the flight controller is compiled to.';
    steps.push('Open the simulator in a <b>current Chrome, Edge or Firefox</b>. Every browser released since about 2017 supports WebAssembly, so a browser that does not is either very old or has it switched off by policy.');
  } else if (!probe.webgl2) {
    why = probe.webgl1
      ? 'This browser has WebGL 1 but not WebGL 2, and the renderer needs WebGL 2.'
      : 'This browser is not giving the page a WebGL context at all, so nothing can be drawn.';
    steps.push('Turn <b>hardware acceleration</b> back on. In Chrome and Edge it is Settings, System, "Use graphics acceleration when available". In Firefox it is Settings, General, Performance.');
    steps.push('Update your <b>graphics driver</b>, then restart the browser. A blocked driver is the most common reason a working machine has no WebGL 2.');
    steps.push('Try a different browser: <b>Chrome, Edge or Firefox</b>, all current.');
  } else if (looksNetwork || !probe.online) {
    why = probe.online
      ? 'Something the page needed did not arrive. The renderer comes from a CDN, so a blocker or a work network can stop it.'
      : 'This device looks offline.';
    steps.push('Check the connection, then <b>reload</b>.');
    steps.push('Turn off <b>ad blockers and script blockers</b> for this site, or allow <b>cdn.jsdelivr.net</b>. That is where the renderer is served from.');
    steps.push('If you are on a work or school network, a proxy may be blocking the CDN. Try a <b>home network or a phone hotspot</b>.');
  } else {
    why = 'The page got far enough to start, then stopped. That usually means a resource went missing or an extension interfered.';
    steps.push('<b>Reload without the cache</b>: Ctrl and Shift and R, or Cmd and Shift and R on a Mac.');
    steps.push('Try a <b>private window</b>. If it works there, an extension is the cause.');
    steps.push('Try <b>Chrome, Edge or Firefox</b>, current version.');
  }

  /* Conditions that do not stop the boot on their own but make it fragile,
   * so they are worth saying once the real cause is named. */
  if (probe.softwareRenderer) {
    steps.push(`Your browser is drawing with the <b>CPU</b> rather than the GPU${probe.renderer ? ` (${probe.renderer})` : ''}. It may load and then run very slowly. Turning hardware acceleration on fixes this too.`);
  }
  if (!probe.storage) {
    steps.push('This browser is <b>blocking site data</b>, so settings and your times cannot be saved. A private window does this. Allow site data for this page if you want anything kept.');
  }
  steps.push('If none of that works, the <b>Report a bug</b> link on the title screen sends the details, or open the browser console with F12 and copy what is in red.');
  return { why, steps };
}

export class Loading {
  constructor(root) {
    this.root = root;
    this.bar = root.querySelector('.loading-fill');
    this.sweepEl = root.querySelector('.loading-sweep');
    this.stageEl = root.querySelector('.loading-stage');
    this.jokeEl = root.querySelector('.loading-joke');
    this.stepEl = root.querySelector('.loading-step');
    this.elapsedEl = root.querySelector('.loading-elapsed');
    /* Where the bar has been TOLD to go, which is not where it is: the
     * transition between the two is the whole point, and it runs on the
     * compositor. Kept so the bar can never be aimed backwards, which is
     * the one thing a progress bar must never do. */
    this.aimed = 0;
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
    /* Back to nothing, with no transition, or the new load's first aim is a
     * five second slide back from wherever the last one finished. */
    this.aimed = 0;
    this.bar.style.transition = 'none';
    this.bar.style.transform = 'scaleX(0)';
    /* Read it back, which forces the style to be applied before the next
     * line makes it transitionable again. Without this the browser coalesces
     * the two and the reset never happens. */
    void this.bar.offsetWidth;
    if (this.sweepEl) {
      this.sweepEl.style.display = '';
    }
    this.paint();
    if (!this.ticker) {
      this.ticker = setInterval(() => {
        /* All of them, because a stalled stage is by definition one that has
         * stopped calling progress(), so the tick is the only thing still
         * running. */
        this.paintStage();
        this.paintJoke();
        this.paintMeta();
        this.creepOn();
      }, 250);
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
    /*
     * And set the bar creeping across the slot this stage has just been
     * given, over the time the stage is expected to take.
     *
     * This is the half of the bar the main thread cannot draw. Every stage
     * that reports from inside itself, the two fetches and the module count,
     * will overtake this within a frame or two and the creep is invisible.
     * The world stage does not: it is one call into a synchronous builder
     * and it reports once, at the end. That is the stage a visitor sits
     * through, and it is the stage this is for.
     */
    const stage = this.stages[i];
    this.aim(this.base(i) + stage.weight * CREEP_TO, stage.ms * CREEP_FACTOR, CREEP_EASE);
  }

  progress(id, frac, detail) {
    if (this.index < 0 || this.stages[this.index].id !== id) {
      this.start(id);
    }
    this.frac = Math.max(0, Math.min(1, frac));
    if (detail !== undefined) {
      /* Shown only once the stage has stalled, by paintStage. Five callers
       * were already setting this and getting nothing; on a healthy load
       * they still get nothing, which is correct, and on a slow one the
       * value they were passing all along is what tells a player which
       * part is slow. */
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

  /*
   * KEEP GOING WHEN THE ESTIMATE RUNS OUT.
   *
   * A transition arrives. That is the one thing a transition does that an
   * asymptote does not, and a stage that outlives its estimate would
   * otherwise leave the bar parked at the top of its own slot with the load
   * still running, which is the failure this whole file is about, just later
   * and higher up the track.
   *
   * So once the aim has had its time, aim again at HALF the distance left to
   * the end of the slot, over three seconds. Each chain halves the remainder,
   * so the bar always moves and never reaches the next stage's territory.
   *
   * This runs on the ticker, so it only fires when the main thread is free.
   * Inside one long synchronous block nothing here runs and the transition
   * already in flight is what is moving: that is why its duration is a
   * multiple of the measurement rather than the measurement itself.
   */
  creepOn() {
    if (this.failed || this.index < 0 || !this.stages.length) {
      return;
    }
    const stage = this.stages[this.index];
    const running = this.stageStartedAt ? performance.now() - this.stageStartedAt : 0;
    const creepEnd = this.base(this.index) + stage.weight * CREEP_TO;
    /*
     * RE-ARM. A real report that overtook the creep also ended it, because a
     * transition has one target and that report is now it. Without this the
     * bar stops dead after the last thing a stage had to say, which on a
     * world build is four fifths of the way through the longest wait on the
     * screen.
     */
    if (this.aimed < creepEnd - 0.001) {
      const left = Math.max(600, stage.ms * CREEP_FACTOR - running);
      this.aim(creepEnd, left, CREEP_EASE);
      return;
    }
    if (running < stage.ms * CREEP_FACTOR) {
      return;
    }
    /* Past the estimate altogether: halve what is left of the slot, every
     * time, so the bar always moves and never reaches the next stage. */
    const end = this.base(this.index) + stage.weight;
    const left = end - this.aimed;
    /* Under a thousandth of the track is a pixel on a 420 px bar, and
     * re-aiming at it every quarter second is a transition that restarts
     * more often than it moves. */
    if (left < 0.001) {
      return;
    }
    this.aim(this.aimed + left * 0.5, 3000, 'cubic-bezier(0.2, 0.6, 0.3, 1)');
  }

  /* Where this stage's slot starts: every earlier stage's weight. */
  base(i) {
    let v = 0;
    for (let k = 0; k < i && k < this.stages.length; k += 1) {
      v += this.stages[k].weight;
    }
    return v;
  }

  /* Fraction of the whole bar: every completed stage's weight, plus this
   * stage's weight times how far into it we are. */
  value() {
    if (this.index < 0) {
      return 0;
    }
    const stage = this.stages[this.index];
    return this.base(this.index) + (stage ? stage.weight * this.frac : 0);
  }

  /*
   * What the bar is SHOWING right now, which is not what it was last aimed
   * at: the whole point of this screen is the distance between the two.
   *
   * Stale while the main thread is blocked, because this is the main
   * thread's copy of a composited animation, and that is fine: nothing calls
   * it during a block, because nothing runs during a block.
   */
  current() {
    try {
      const m = new DOMMatrix(getComputedStyle(this.bar).transform);
      return Math.max(0, Math.min(1, m.a));
    } catch (e) {
      /* No DOMMatrix, or a transform this cannot parse. The last aim is the
       * best answer available and it is never behind the truth by much. */
      return this.aimed;
    }
  }

  /*
   * Point the bar at a value and give it a time to get there. Returns
   * whether it took.
   *
   * FORWARD ONLY, AND AGAINST WHAT IS DRAWN rather than against the last
   * aim. That distinction is the bug this comment is here to stop coming
   * back: the creep is aimed at the far end of a stage's slot, so comparing
   * against the aim meant every real report for the rest of that stage was
   * dropped as "behind", and a screen that had measured four honest phases
   * of a world build drew none of them. Compared against the position, a
   * report that is ahead of the creep overtakes it and a report that is
   * behind is correctly ignored.
   *
   * The value is a scale, not a width. See the stylesheet: the transition
   * has to be composited or it stops with the main thread, and the main
   * thread is what this screen is waiting for.
   */
  aim(to, ms, ease = 'linear') {
    const want = Math.max(0, Math.min(1, to));
    if (want <= this.current()) {
      return false;
    }
    this.aimed = want;
    this.bar.style.transition = `transform ${Math.max(0, Math.round(ms))}ms ${ease}`;
    this.bar.style.transform = `scaleX(${want.toFixed(4)})`;
    /*
     * AND START IT NOW, IN THIS TASK.
     *
     * A transition does not begin when the style is set, it begins at the
     * next style recalc, and the next style recalc is a rendering step the
     * main thread has to run. Set an aim and then block for four seconds
     * building a world and the transition has still not started when the
     * block begins, so there is nothing for the compositor to carry through
     * it: measured, and it is exactly the window this screen exists for.
     *
     * Reading a computed style forces the recalc here instead, so the
     * animation is handed to the compositor before the caller gets the
     * thread back. One forced recalc per aim, a handful per load.
     */
    void getComputedStyle(this.bar).transform;
    return true;
  }

  paint() {
    if (!this.visible) {
      return;
    }
    /*
     * A REAL EVENT ALWAYS WINS, and it wins by being ahead.
     *
     * Everything the loader actually knows arrives here: bytes read, modules
     * counted, a stage finished. If that is further along than the estimate
     * has crept to, the bar is re-aimed at it over a fifth of a second, and
     * a fast stage simply overtakes its own creep. If it is behind, aim()
     * drops it and the creep carries on, because a stage reporting 0.3 while
     * the estimate has reached 0.5 has not told us anything new.
     */
    this.aim(this.value(), 200, 'linear');
    this.paintStage();
    this.paintJoke();
    this.paintMeta();
  }

  /*
   * Which stage of how many, and how long the load has taken.
   *
   * The step count is what gives the wait a shape: a stage that outstays its
   * slot is still one of six with more to come, which a bar alone cannot
   * say. The seconds stop while the main thread is blocked and catch up when
   * it returns; that window is what the bar's creep and the sweep are for,
   * and a frozen clock next to a moving bar is the honest picture of a
   * thread that is busy rather than gone.
   */
  paintMeta() {
    if (!this.stepEl || !this.elapsedEl) {
      return;
    }
    const step = this.index >= 0 && this.stages.length
      ? `Step ${this.index + 1} of ${this.stages.length}`
      : '';
    if (this.stepEl.textContent !== step) {
      this.stepEl.textContent = step;
    }
    const secs = this.startedAt ? Math.floor((performance.now() - this.startedAt) / 1000) : 0;
    /* Nothing at all for the first couple of seconds. A healthy load is over
     * in about three, and a stopwatch on a screen that is about to vanish
     * reads as a warning about a wait that never happened. */
    const text = secs >= 2 ? `${secs}s` : '';
    if (this.elapsedEl.textContent !== text) {
      this.elapsedEl.textContent = text;
    }
  }

  /*
   * What is being done, named, for the whole of the load. See STAGE_DOING.
   *
   * Once a stage outstays STALL_MS the line says so and adds the detail the
   * caller passed, which is the one thing that separates a slow network from
   * a slow machine: "still loading the map, 31 of 72 modules" is a
   * diagnosis, and a bar cannot make one.
   */
  paintStage() {
    if (this.failed) {
      return;
    }
    const stage = this.index >= 0 ? this.stages[this.index] : null;
    const running = this.stageStartedAt ? performance.now() - this.stageStartedAt : 0;
    let text = 'loading';
    if (stage && running > STALL_MS) {
      const name = (STAGE_NAMES[stage.id] || stage.id).toLowerCase();
      text = `still loading the ${name}`;
      if (this.detail) {
        text += `, ${this.detail}`;
      }
    } else if (stage) {
      text = STAGE_DOING[stage.id] || `Loading the ${(STAGE_NAMES[stage.id] || stage.id).toLowerCase()}`;
    }
    if (this.stageEl.textContent !== text) {
      this.stageEl.textContent = text;
    }
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

  /*
   * The dead end, made an exit.
   *
   * This used to be a red bar, one sentence and nothing to press. A visitor
   * whose boot died had no way to tell a blocked CDN from a missing driver,
   * no way to retry without knowing to reload, and no idea which browser
   * would have worked. Everything below is either something the page just
   * measured or an action the visitor can take.
   */
  fail(message) {
    this.failed = true;
    this.stageEl.textContent = 'Could not start';
    this.jokeEl.textContent = message;
    this.jokeEl.classList.add('is-error');
    /* Full, red, and STILL: a sweep under a dead end is a page pretending to
     * work on something. transition none as well as the aim, because the
     * creep it interrupts would otherwise take five seconds to arrive. */
    this.aimed = 0;
    this.bar.style.transition = 'none';
    this.bar.style.transform = 'scaleX(1)';
    this.bar.style.background = '#e8503a';
    if (this.sweepEl) {
      this.sweepEl.style.display = 'none';
    }
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    /* The screen may have been faded out by a previous finish(). A failure
     * has to be visible whatever the last load did. */
    this.root.hidden = false;
    this.root.style.opacity = '1';
    this.visible = true;
    this.paintHelp(message);
  }

  paintHelp(message) {
    const help = this.root.querySelector('.loading-help');
    if (!help) {
      return;
    }
    let probe;
    let advice;
    try {
      probe = probeBrowser();
      advice = recoveryAdvice(probe, message);
    } catch (e) {
      /* The advice must never be the thing that fails. A visitor who got
       * here is already having a bad time. */
      probe = {};
      advice = {
        why: '',
        steps: ['Reload the page. If it keeps failing, try a current <b>Chrome, Edge or Firefox</b>.'],
      };
    }

    help.textContent = '';
    const h = document.createElement('h3');
    h.textContent = 'What to try';
    help.append(h);

    if (advice.why) {
      const why = document.createElement('p');
      why.className = 'loading-why';
      why.textContent = advice.why;
      help.append(why);
    }

    const ol = document.createElement('ol');
    for (const step of advice.steps) {
      const li = document.createElement('li');
      /* The steps are authored above in this file, not user input, and the
       * only markup in them is <b>. Built as elements rather than assigned
       * as HTML so nothing here is an injection point if a step ever grows
       * a value from somewhere else. */
      for (const part of String(step).split(/(<b>.*?<\/b>)/)) {
        if (!part) {
          continue;
        }
        const bold = part.startsWith('<b>');
        const node = bold ? document.createElement('b') : document.createTextNode(part);
        if (bold) {
          node.textContent = part.slice(3, -4);
        }
        li.append(node);
      }
      ol.append(li);
    }
    help.append(ol);

    const actions = document.createElement('div');
    actions.className = 'loading-actions';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Try again';
    retry.addEventListener('click', () => {
      /* A plain reload. The cache-bypassing one needs a keystroke the page
       * cannot send, which is why it is step one in the list above. */
      window.location.reload();
    });
    actions.append(retry);

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'quiet';
    copy.textContent = 'Copy the details';
    copy.addEventListener('click', async () => {
      const report = [
        `WebFPV failed to start: ${message}`,
        `browser: ${probe.engine || 'unknown'} ${probe.version || ''}`.trim(),
        `webgl2: ${probe.webgl2} webgl1: ${probe.webgl1} wasm: ${probe.wasm}`,
        `storage: ${probe.storage} online: ${probe.online}`,
        probe.renderer ? `renderer: ${probe.renderer}` : '',
        `url: ${window.location.href}`,
        `agent: ${navigator.userAgent}`,
      ].filter(Boolean).join('\n');
      try {
        await navigator.clipboard.writeText(report);
        copy.textContent = 'Copied';
      } catch (e) {
        /* Clipboard refused, which is common without a secure context. Show
         * the text instead so it can still be selected by hand. */
        copy.textContent = 'Select and copy';
        const pre = document.createElement('div');
        pre.className = 'loading-detail';
        pre.textContent = report;
        help.append(pre);
      }
    });
    actions.append(copy);
    help.append(actions);

    const detail = document.createElement('div');
    detail.className = 'loading-detail';
    detail.textContent = [
      probe.engine ? `${probe.engine} ${probe.version}` : '',
      `WebGL2 ${probe.webgl2 ? 'yes' : 'no'}`,
      `WebAssembly ${probe.wasm ? 'yes' : 'no'}`,
      `site data ${probe.storage ? 'yes' : 'blocked'}`,
    ].filter(Boolean).join('  .  ');
    help.append(detail);

    help.hidden = false;
    /* Focus the way out, so a keyboard visitor is not left hunting for it
     * and a screen reader lands on something actionable. */
    try {
      retry.focus();
    } catch (e) { /* Not focusable yet. The button is still clickable. */ }
  }

  finish() {
    this.frac = 1;
    this.index = this.stages.length - 1;
    this.paint();
    /* All the way, quickly. paint() aims at value(), which is 1 here, but
     * only if the last stage was planned; a load that finished early leaves
     * the creep somewhere short and the screen fades out over a bar that
     * never arrived. */
    this.aim(1, 180, 'linear');
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
