/*
 * raceline.js (render): the breadcrumb trail of a whoop room, drawn.
 *
 * The owner's ask of 2026-10-08, from beginners: a trail of dots showing a
 * good way through the next gates, on the RaceGOW tracks first, that can be
 * switched on and off. The line itself is src/game/raceline.js, pure
 * arithmetic that reads the course and the room's solids and answers with a
 * lap of crumbs. This file is everything the browser adds to it:
 *
 *   WHEN. Nothing is built, loaded or solved until the setting is turned on
 *   in a whoop room: the solver is a dynamic import, and the first solve is
 *   sliced into a few milliseconds a frame so the picture does not stop for
 *   it. Off, the trail costs nothing at all: no object in the scene, no
 *   draw call, no uniform written. On, it is one draw call of a few dozen
 *   points.
 *
 *   WHAT. The room's solids are read off the colliders the plant was given,
 *   so a table, a barrier or a banner is avoided because it is there and
 *   not because a list of pieces remembered it. The answer is held to its
 *   own standard before anyone sees it: no crossing of an opening it was not
 *   sent through, none the wrong way, the aircraft's clearance kept
 *   everywhere, three laps scored by the very Race the shell scores with. A
 *   course that fails that gets no trail and a plain sentence saying so, not
 *   a trail that is nearly right.
 *
 *   WHERE. Only the stretch the pilot needs: from the gate just flown
 *   through the one the race wants, and on through the one after it, which is
 *   the lookahead the pilot has for the exit. setNextGate moves it, and
 *   nothing moves in a frame.
 *
 *   HOW IT LOOKS. Cream dots with a dark rim so they read on the pale and
 *   the dark of a room alike, drawn on layer 1 so the ink pass leaves them
 *   alone, and unlit, so they do not wear the room's bulb. Close together
 *   is slow: the crumbs are dropped at equal intervals of lap time, so the
 *   gap is the speed the line asks for, and a slow stretch is tinted amber
 *   as well. Not green, which is the target's colour, and not red, which is
 *   the wrong way through it.
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

import * as THREE from 'three';

/* Milliseconds of solving a frame may be asked for. A knot takes a few, so
 * this is one or two knots a frame: a long solve (about two seconds of CPU on
 * the biggest shipped room) is a few seconds of a slightly heavier frame and
 * never one long one. */
const SLICE_MS = 5;

/* A dot's width in metres, and the pixels it is held between however near or
 * far, so a far one is still there and a near one is not a plate. */
const DOT_M = 0.13;
const DOT_MIN_PX = 3;
const DOT_MAX_PX = 22;

/* What the colours of the dots are, as sRGB: a crumb of bread at speed and
 * an amber at a crawl. */
const FAST = 0xfff1c9;
const SLOW = 0xffa63a;
const RIM = 0x241608;

/* Answers kept, by course, so turning the trail off and on, or flying the same
 * room again, does not solve it twice. Small: a result is a few hundred
 * crumbs, but a pilot who flies forty rooms in a sitting should not hold
 * forty. */
const KEPT = 4;
const kept = new Map();

const VERT = `
  uniform float uDot;
  uniform float uViewH;
  uniform float uMinPx;
  uniform float uMaxPx;
  attribute float aSpeed;
  varying float vSpeed;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float px = uDot * projectionMatrix[1][1] * 0.5 * uViewH / max(gl_Position.w, 0.01);
    gl_PointSize = clamp(px, uMinPx, uMaxPx);
    vSpeed = aSpeed;
  }
`;

const FRAG = `
  uniform vec3 uFast;
  uniform vec3 uSlow;
  uniform vec3 uRim;
  varying float vSpeed;
  void main() {
    float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (r > 1.0) {
      discard;
    }
    vec3 c = mix(uSlow, uFast, vSpeed);
    c = mix(c, uRim, smoothstep(0.62, 0.86, r));
    gl_FragColor = vec4(c, 1.0 - smoothstep(0.9, 1.0, r));
  }
`;

/* The size of the surface the next draw lands on, in pixels, read without
 * allocating: the scene may be drawn into a smaller target than the canvas. */
const viewSize = new THREE.Vector2();

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function later(fn) {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(fn);
  } else {
    setTimeout(fn, 4);
  }
}

/**
 * The trail for one whoop room.
 *
 * `colliders` is the built Colliders the plant was given; `gates` the scene's
 * own gate records, each carrying the flying order of the station it is.
 * `listen(fn)` is how the shell is told whenever the trail's state changes:
 * see `state`.
 *
 * state.phase   'idle' (never asked for), 'solving', 'ready', 'refused'
 * state.reason  why not, for a refusal, in a sentence a pilot can read
 * state.shown   whether dots are in the picture now
 */
export function createRaceLine({
  scene, course, colliders, gates,
}) {
  let listener = null;
  const state = {
    phase: 'idle',
    reason: '',
    shown: false,
    wanted: false,
    /* The whole lap at once, for a harness looking at the line from above:
     * not a setting and never set by the shell. */
    all: false,
    lapS: 0,
    baselineS: 0,
    crumbs: 0,
    /* Wall time from the first slice to the answer, and the part of it the
     * solver actually ran for: the difference is the picture's own frames. */
    solveMs: 0,
    cpuMs: 0,
    cached: false,
  };
  let points = null;
  let material = null;
  let result = null;
  let job = null;
  let disposed = false;
  const target = { i: -1, follow: -1 };

  const emit = () => {
    if (listener) {
      listener(state);
    }
  };

  /* Which dots are in the picture: from the crumb of the gate before the
   * target to the crumb of the one after it, round the lap. */
  function place() {
    let start = 0;
    let n = 0;
    if (points && result && state.wanted && state.all) {
      n = result.count;
    } else if (points && result && state.wanted && target.i >= 0 && target.i < gates.length) {
      const count = result.count;
      const S = result.stationCrumb.length;
      const st = gates[target.i].flyOrder;
      const prev = (st - 1 + S) % S;
      const after = target.follow >= 0 && target.follow < gates.length
        ? gates[target.follow].flyOrder
        : (st + 1) % S;
      const a = result.stationCrumb[prev];
      const b = result.stationCrumb[after];
      if (a >= 0 && b >= 0) {
        start = a;
        n = a === b ? count : ((b - a + count) % count) + 1;
      }
    }
    if (points) {
      points.geometry.setDrawRange(start, n);
      points.visible = n > 0;
    }
    const shown = n > 0;
    if (shown !== state.shown) {
      state.shown = shown;
      emit();
    }
  }

  function build(got) {
    const count = got.count;
    /* Twice over, so a stretch that runs past the end of the lap into its
     * start is one range and not two. */
    const pos = new Float32Array(count * 2 * 3);
    const speed = new Float32Array(count * 2);
    /* Coloured by the lap's own range and not by a fixed speed: a whoop room's
     * line runs from a crawl to about five metres a second with most of it
     * under three, so a scale up to the cap would leave nearly every dot the
     * same amber. The slowest tenth of the lap is full amber, the fastest
     * tenth full cream. */
    const sorted = Float32Array.from(got.crumbV).sort();
    const lo = sorted[Math.floor(count * 0.1)];
    const hi = sorted[Math.min(count - 1, Math.floor(count * 0.9))];
    const span = Math.max(hi - lo, 1e-3);
    for (let rep = 0; rep < 2; rep += 1) {
      pos.set(got.crumbs, rep * count * 3);
      for (let c = 0; c < count; c += 1) {
        speed[rep * count + c] = Math.min(1, Math.max(0, (got.crumbV[c] - lo) / span));
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    geometry.setDrawRange(0, 0);
    material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      uniforms: {
        uDot: { value: DOT_M },
        uViewH: { value: 1080 },
        uMinPx: { value: DOT_MIN_PX },
        uMaxPx: { value: DOT_MAX_PX },
        uFast: { value: new THREE.Color(FAST) },
        uSlow: { value: new THREE.Color(SLOW) },
        uRim: { value: new THREE.Color(RIM) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    points = new THREE.Points(geometry, material);
    points.name = 'race-line';
    /* The no ink layer: this is drawn in the colour pass only. */
    points.layers.set(1);
    points.frustumCulled = false;
    points.renderOrder = 4;
    points.onBeforeRender = (renderer) => {
      const rt = renderer.getRenderTarget();
      if (rt) {
        viewSize.set(rt.height, rt.height);
      } else {
        renderer.getDrawingBufferSize(viewSize);
      }
      material.uniforms.uViewH.value = viewSize.y;
    };
    scene.add(points);
  }

  function settle(got, note) {
    result = got;
    state.phase = 'ready';
    state.reason = '';
    state.lapS = got.lapS;
    state.baselineS = got.baselineS;
    state.crumbs = got.count;
    state.cached = Boolean(note && note.cached);
    if (!disposed) {
      build(got);
      place();
    }
    emit();
  }

  function refuse(reason) {
    state.phase = 'refused';
    state.reason = reason;
    emit();
  }

  async function solve(thisJob) {
    state.phase = 'solving';
    state.reason = '';
    state.cpuMs = 0;
    emit();
    let mod;
    try {
      mod = await import('../game/raceline.js');
    } catch (e) {
      console.warn(`raceline: the solver did not load: ${e && e.message}`);
      refuse('The race line could not be loaded.');
      return;
    }
    if (thisJob.cancelled || disposed) {
      return;
    }
    const key = mod.courseKey(course);
    if (kept.has(key)) {
      const hit = kept.get(key);
      kept.delete(key);
      kept.set(key, hit);
      if (hit.refusal) {
        refuse(hit.refusal);
      } else {
        settle(hit.result, { cached: true });
      }
      return;
    }
    const began = now();
    let it;
    try {
      it = mod.solveRaceLine(course, { solids: mod.solidsFromColliders(colliders) });
    } catch (e) {
      console.warn(`raceline: ${e && e.message}`);
      refuse('The race line could not be worked out for this track.');
      return;
    }
    const remember = (entry) => {
      kept.set(key, entry);
      while (kept.size > KEPT) {
        kept.delete(kept.keys().next().value);
      }
    };
    const step = () => {
      if (thisJob.cancelled || disposed) {
        return;
      }
      /* Latency first: a knot can take 10 to 20 ms in one go, which a time
       * budget cannot split, so the shell says when the pilot is not flying
       * (a menu, the pause, the loading hold) and the solve waits for that
       * and never costs a flying frame. */
      if (api.canSolve && !api.canSolve()) {
        later(step);
        return;
      }
      const t0 = now();
      const end = t0 + SLICE_MS;
      let r;
      try {
        do {
          r = it.next();
        } while (!r.done && now() < end);
      } catch (e) {
        console.warn(`raceline: ${e && e.message}`);
        refuse('The race line could not be worked out for this track.');
        return;
      }
      state.cpuMs += now() - t0;
      if (!r.done) {
        later(step);
        return;
      }
      state.solveMs = now() - began;
      const got = r.value;
      if (!got || !got.ok) {
        const why = got && got.reason ? got.reason : 'no line';
        const refusal = `No race line for this track yet: ${why}.`;
        remember({ refusal });
        refuse(refusal);
        return;
      }
      if (!got.clean) {
        const refusal = 'No race line for this track yet: a clean way through the whole lap was not found.';
        remember({ refusal });
        refuse(refusal);
        return;
      }
      const verdict = mod.verifyRaceLine(course, got);
      if (!verdict.ok) {
        const refusal = 'No race line for this track yet: the line did not score a lap.';
        remember({ refusal });
        refuse(refusal);
        return;
      }
      remember({ result: got });
      settle(got, null);
    };
    later(step);
  }

  const api = {
    state,
    /* Set by the shell: true when a slice may run now (the pilot is not in a
     * flight). Absent means always, which is what a harness wants. */
    canSolve: null,
    /* One listener, the shell's. */
    listen(fn) {
      listener = fn;
    },
    /* The shell turns it on and off here; a no op when nothing changes. */
    setEnabled(on) {
      const want = Boolean(on);
      if (want === state.wanted || disposed) {
        return;
      }
      state.wanted = want;
      if (!want) {
        if (job) {
          job.cancelled = true;
          job = null;
          if (state.phase === 'solving') {
            state.phase = 'idle';
          }
        }
        place();
        emit();
        return;
      }
      if (state.phase === 'ready') {
        place();
        emit();
      } else if (state.phase === 'refused') {
        emit();
      } else if (state.phase !== 'solving') {
        job = { cancelled: false };
        solve(job);
      }
    },
    /* For a harness: draw the whole lap. */
    setAll(on) {
      state.all = Boolean(on);
      place();
    },
    /* Called from the scene's setNextGate with the scene indices of the gate
     * the race wants and the one after it. */
    setTarget(i, follow) {
      target.i = i;
      target.follow = follow;
      place();
    },
    dispose() {
      disposed = true;
      if (job) {
        job.cancelled = true;
      }
      if (points) {
        scene.remove(points);
        points.geometry.dispose();
        material.dispose();
        points = null;
      }
    },
  };
  return api;
}
