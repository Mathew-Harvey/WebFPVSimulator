/*
 * trickfilm.js: a moving picture of a trick, drawn from the trick's own
 * definition.
 *
 * THE RULE THIS FILE EXISTS TO KEEP: A FILM COMPUTES, IT DOES NOT ILLUSTRATE.
 *
 * Every frame here is derived from the PATTERN the recogniser actually
 * matches. Nothing is drawn from memory and nothing is hand animated, so a
 * film cannot show a pilot one thing while the scorer wants another. Change a
 * pattern and its picture changes with it. If a film looks wrong, the pattern
 * is wrong, and that is the point: this is a second pair of eyes on the
 * catalogue as much as it is a teaching aid.
 *
 * WHICH WAY THE CAMERA FACES is decided by the trick, not by taste. A
 * rotation is only legible from the one direction its axis points AT you:
 *
 *   roll  turns about the nose, so it reads from BEHIND
 *   pitch turns about the wing, so it reads from the SIDE
 *   yaw   turns about the up axis, so it reads from ABOVE
 *
 * A lap around a rail is flown in the plane across the rail, which is the
 * side view; a lap around a post is flown in the horizontal plane, which is
 * the view from above. When a trick has both, the lap wins, because the lap
 * is the bigger shape and the rotation inside it still reads.
 *
 * CEL SHADED, like the town it teaches. Flat colour, hard two pixel ink, no
 * blur and no soft glow. The sky is two flat bands rather than a wash,
 * because a gradient is the one thing a cel shaded frame does not have.
 *
 * PERFORMANCE. One canvas, one requestAnimationFrame, and it only runs while
 * the screen showing it is up: stop() cancels the frame and nothing here
 * holds a timer that outlives the screen. Nothing is allocated in the draw
 * loop. Under prefers-reduced-motion the film does not animate at all and
 * draws its key frames side by side instead, so the shape of the trick is
 * still there to be read.
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

const TURN = Math.PI * 2;

/* The town's palette, and the only colours this file knows. */
const INK = '#0b1116';
const CREAM = '#f3ead4';
const SAKURA = '#e8a8b8';
const AMBER = '#ffd45c';
const MINT = '#7dffb4';
const SLATE = '#9db3c8';
const SKY_HIGH = '#8fb6d8';
const SKY_LOW = '#e9c3ac';
const GRASS = '#6f8f63';
const CONCRETE = '#b9b3a8';

/* How long one pass of a film lasts, and the beat it holds on afterwards so
 * the eye can land before it starts again. */
const SEG_MS = 1500;
const HOLD_MS = 700;

export const VIEW_LABEL = {
  side: 'seen from the side',
  above: 'seen from above',
  behind: 'seen from behind',
};

/* ------------------------------------------------------------------ *
 * Reading a pattern
 * ------------------------------------------------------------------ */

function lapStep(steps) {
  return steps.find((s) => s.path !== undefined) || null;
}

/*
 * The camera. The lap decides it when there is one, because the lap is the
 * biggest thing in the picture and a rotation inside it still reads from any
 * angle; otherwise the rotation's own axis decides, because a roll seen from
 * the side is a craft that does not appear to move at all.
 */
export function viewFor(steps) {
  const lap = lapStep(steps);
  if (lap) {
    return lap.path === 'pole' ? 'above' : 'side';
  }
  const axes = steps.map((s) => s.axis).filter(Boolean);
  if (axes.includes('yaw') && !axes.includes('pitch')) {
    return 'above';
  }
  if (axes.includes('roll') && !axes.includes('pitch')) {
    return 'behind';
  }
  return 'side';
}

/* Turns as the workbook says them: a count, not an angle. */
function turnWords(n) {
  const t = Math.abs(n);
  if (t === 0.25) { return 'a quarter turn'; }
  if (t === 0.5) { return 'a half turn'; }
  if (t === 0.75) { return 'three quarters of a turn'; }
  if (t === 1) { return 'a whole turn'; }
  if (t === 2) { return 'two whole turns'; }
  return `${t} turns`;
}

const AXIS_WORD = { roll: 'roll', pitch: 'flip', yaw: 'yaw spin' };

/*
 * WHAT TO DO, in a sentence, and built from the same steps the film is. A
 * pilot reading this and a pilot watching the film are being told the same
 * thing by the same data, which is the only way they cannot disagree.
 */
export function describeSteps(steps) {
  const parts = [];
  for (const s of steps) {
    if (s.path !== undefined) {
      const thing = s.path === 'pole' ? 'a post' : 'a rail';
      let lap;
      if (s.turnsAtLeast !== undefined) {
        lap = `${turnWords(s.turnsAtLeast)} or more around ${thing}`;
      } else if (s.turns === 0.5) {
        lap = `half a lap around ${thing}`;
      } else if (s.turns === 1) {
        lap = `a whole lap around ${thing}`;
      } else {
        lap = `${turnWords(s.turns)} around ${thing}`;
      }
      if (s.from === 'under') { lap += ', entered from underneath'; }
      if (s.from === 'over') { lap += ', entered from over the top'; }
      if (s.inverted === true) { lap += ', flown belly up'; }
      if (s.track === true) { lap += ', with the post held on the screen'; }
      const rot = [];
      if (s.rot) {
        for (const key of Object.keys(s.rot)) {
          if (s.rot[key] === 0) { continue; }
          rot.push(`${turnWords(s.rot[key])} of ${AXIS_WORD[key]}`);
        }
      }
      if (rot.length) { lap += `, carrying ${rot.join(' and ')}`; }
      parts.push(lap);
      continue;
    }
    let r = `${turnWords(s.turns)} of ${AXIS_WORD[s.axis] || s.axis || 'rotation'}`;
    if (s.oppTo !== undefined) { r += ' back the other way'; }
    if (s.sameAs !== undefined) { r += ' the same way again'; }
    if (s.stallMs) { r += ', after a pause'; }
    if (s.tap) { r += ', touching the object as you go'; }
    if (s.inverted === true) { r += ', upside down'; }
    parts.push(r);
  }
  if (!parts.length) { return ''; }
  const line = parts.join(', then ');
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
}

/*
 * A film: a list of segments, each of which knows where the craft is and
 * which way up it is at any point through itself.
 *
 * Position is in film space, a box roughly 2.6 wide by 2 tall with the
 * obstacle at the origin. `spin` is the craft's angle IN THE PICTURE, so a
 * rotation whose axis points out of the screen turns the glyph and one whose
 * axis lies in the screen does not, which is exactly why the camera is
 * chosen the way it is.
 */
export function filmFor(steps) {
  const view = viewFor(steps);
  const lap = lapStep(steps);
  const segs = [];
  /* Where the craft is when the trick starts, so the run in and the run out
   * are drawn from and to somewhere rather than appearing. */
  let carry = { x: -1.15, y: lap ? 0.62 : 0 };

  for (const s of steps) {
    if (s.path !== undefined) {
      const turns = s.turnsAtLeast !== undefined ? s.turnsAtLeast : (s.turns ?? 1);
      const R = 0.62;
      /* Under the rail is the bottom of the circle, over it is the top. A
       * post has no over and under, so an orbit starts at the near side. */
      const ph0 = s.path === 'pole'
        ? Math.PI * 0.5
        : (s.from === 'over' ? -Math.PI / 2 : Math.PI / 2);
      /* A lap is flown one way round, and which way is the way that leaves
       * the craft travelling on afterwards. */
      const dir = -1;
      /*
       * WHERE THE NOSE POINTS IS THE TRICK, on a lap.
       *
       * An Orbit is a circle flown with the object HELD ON THE SCREEN, and
       * an ordinary coordinated turn that happens to go round twice is not
       * one; the recogniser tells them apart with TRACK_DOT and the film has
       * to show the difference or it is teaching the wrong thing. So a lap
       * the pattern marks `track` points the nose at the middle, and every
       * other lap points it along the path.
       *
       * Beyond that, `extra` is the rotation the PILOT added on top of the
       * loop's own turn, which is exactly what a lap's rot means: holding a
       * circle already turns the craft once per lap, so a Powerloop asking
       * for one flip is asking for the loop and nothing more.
       */
      const track = s.track === true;
      const bodyTurns = s.rot && s.rot.pitch !== undefined && view === 'side'
        ? s.rot.pitch
        : turns;
      const extra = (bodyTurns - turns) * dir;
      segs.push({
        kind: 'lap',
        ms: SEG_MS * Math.max(0.85, turns),
        at(u) {
          const ph = ph0 + dir * TURN * turns * u;
          const tangent = Math.atan2(-Math.cos(ph) * dir, -Math.sin(ph) * dir);
          return {
            x: Math.cos(ph) * R,
            y: Math.sin(ph) * R,
            spin: track ? Math.PI - ph : tangent + TURN * extra * u,
            /* Belly up wherever the craft's top points away from the middle
             * of the loop, which across a powerloop is its far half. */
            inv: !track && Math.cos(ph) * Math.cos(ph0) + Math.sin(ph) * Math.sin(ph0) < 0,
          };
        },
      });
      carry = null;
      continue;
    }
    /* A rotation is flown going somewhere: a craft that rotates on the spot
     * is a stall trick and the pattern says so with stallMs. */
    /*
     * FROM BEHIND, the craft is flying AWAY, so it barely crosses the frame:
     * a roll drawn scudding sideways contradicts the caption saying you are
     * stood behind it. From the side and from above it travels, because
     * from those angles it does.
     */
    const still = Boolean(s.stallMs);
    const from = carry || { x: view === 'behind' ? -0.32 : -0.95, y: 0.15 };
    const travel = still ? 0 : (view === 'behind' ? 0.62 : 1.9);
    const to = { x: from.x + travel, y: from.y };
    const inPlane = (view === 'behind' && s.axis === 'roll')
      || (view === 'side' && s.axis === 'pitch')
      || (view === 'above' && s.axis === 'yaw');
    const dir = s.oppTo !== undefined ? -1 : 1;
    segs.push({
      kind: 'rot',
      ms: SEG_MS * Math.max(0.7, Math.abs(s.turns ?? 1)),
      tap: Boolean(s.tap),
      at(u) {
        return {
          x: from.x + (to.x - from.x) * u,
          y: from.y + (to.y - from.y) * u,
          spin: inPlane ? dir * TURN * (s.turns ?? 1) * u : 0,
          /* Out of plane it cannot be drawn as a turn, so it is drawn as the
           * craft narrowing and widening, which is what a roll looks like
           * from the side and is honest about being a foreshortening. */
          squash: inPlane ? 1 : Math.cos(TURN * (s.turns ?? 1) * u),
          inv: inPlane
            ? Math.abs(((dir * TURN * (s.turns ?? 1) * u) % TURN) - Math.PI) < Math.PI * 0.5
            : Math.cos(TURN * (s.turns ?? 1) * u) < 0,
        };
      },
    });
    carry = to;
  }

  const totalMs = segs.reduce((a, b) => a + b.ms, 0) + HOLD_MS;
  return {
    view,
    steps,
    segs,
    totalMs: totalMs || 1,
    obstacle: lap ? lap.path : (steps.some((s) => s.tap) ? 'wall' : null),
    caption: describeSteps(steps),
  };
}

/* Where the craft is at t milliseconds into the film. */
function sample(film, t) {
  let acc = 0;
  for (const seg of film.segs) {
    if (t < acc + seg.ms) {
      const u = (t - acc) / seg.ms;
      /* Eased, because a pilot does not step through a trick linearly and a
       * linear film reads as a machine rather than as flying. */
      const e = u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2;
      return { ...seg.at(e), seg, u: e };
    }
    acc += seg.ms;
  }
  const last = film.segs[film.segs.length - 1];
  return last ? { ...last.at(1), seg: last, u: 1 } : { x: 0, y: 0, spin: 0 };
}

/* ------------------------------------------------------------------ *
 * Drawing
 * ------------------------------------------------------------------ */

function ink(ctx, w) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = w;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

/* The world behind the trick: two flat sky bands and a ground, or, seen from
 * above, the ground alone. No gradient: this is a cel shaded town. */
function horizonOf(view, H) {
  return view === 'above' ? H : Math.round(H * 0.78);
}

function drawWorld(ctx, film, W, H) {
  if (film.view === 'above') {
    ctx.fillStyle = GRASS;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(11,17,22,0.16)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    return;
  }
  const hz = horizonOf(film.view, H);
  ctx.fillStyle = SKY_HIGH;
  ctx.fillRect(0, 0, W, Math.round(hz * 0.62));
  ctx.fillStyle = SKY_LOW;
  ctx.fillRect(0, Math.round(hz * 0.62), W, hz - Math.round(hz * 0.62));
  ctx.fillStyle = GRASS;
  ctx.fillRect(0, hz, W, H - hz);
  ink(ctx, 2);
  ctx.beginPath();
  ctx.moveTo(0, hz + 1);
  ctx.lineTo(W, hz + 1);
  ctx.stroke();
}

/* The thing being flown around, in the training park's own materials: a
 * concrete rail banded yellow and black, a concrete post, a slab of wall. */
function drawObstacle(ctx, film, cx, cy, s, ground) {
  if (!film.obstacle) { return; }
  if (film.obstacle === 'bar') {
    /* End on, because the side view looks along the rail. */
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.1, 0, TURN);
    ctx.fill();
    ink(ctx, 2.5);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.036, 0, TURN);
    ctx.fill();
    return;
  }
  if (film.obstacle === 'pole') {
    ctx.fillStyle = CONCRETE;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.11, 0, TURN);
    ctx.fill();
    ink(ctx, 2.5);
    ctx.stroke();
    return;
  }
  /*
   * A wall STANDS ON THE GROUND. Drawn from a fixed height either side of
   * the middle it floated: its top was off the frame and its base ran down
   * through the horizon into the grass, which is a slab hanging in the air
   * rather than the training park's wall.
   */
  const x = cx + s * 1.02;
  const w = s * 0.26;
  const base = ground;
  const top = Math.max(4, cy - s * 0.85);
  ctx.fillStyle = CONCRETE;
  ctx.fillRect(x, top, w, base - top);
  ink(ctx, 2.5);
  ctx.strokeRect(x, top, w, base - top);
  /* The target band, at the height the park paints one. */
  ctx.fillStyle = SAKURA;
  ctx.fillRect(x, cy - s * 0.06, w, s * 0.12);
  ink(ctx, 2);
  ctx.strokeRect(x, cy - s * 0.06, w, s * 0.12);
}

/* The craft's own colours, beside the town's: carbon for the frame, a
 * lighter plate for the stack, steel bells, the pack in two cel bands, and
 * the camera's black. */
const CARBON = '#27313b';
const PLATE = '#3b4a57';
const BELL = '#c9d3dc';
const PACK = '#5d6b7a';
const PACK_SHADE = '#48545f';
const CAMERA = '#161d24';

/*
 * The aircraft, drawn as a manga draws one (polish item 19): a stretched X
 * of carbon arms, a bell and a hub on each, the stack and the pack strapped
 * on top, a camera pod at the nose in sakura with its lens, the antenna off
 * the back, and the props as blurred discs with speed arcs in them, all
 * under a hard ink line. It was four circles and a box.
 *
 * It still does its first job: small enough to read at a glance and
 * asymmetric enough that its ROTATION is unambiguous. The pod at the nose
 * is in the one colour nothing else on the craft uses, so which way it
 * points is never in doubt, and the antenna marks the tail.
 *
 * `spin` turns it in the picture, `squash` narrows it across (a roll seen
 * from behind, or the tilt of a panel's view), `inv` is its underside. The
 * points are placed by hand rather than under a squashed transform, so the
 * ink stays one width all the way round however narrow the craft is. Under
 * about fourteen pixels a side the fine work (hubs, strap, glint, arcs) is
 * left out: at the trick film's ghost size it would only be noise.
 *
 * Exported for the results page's panels (src/ui/mangapage.js), so the
 * craft in a gap or on a car's tail is the one the films teach with.
 */
export function drawQuad(ctx, x, y, spin, scale, squash, alpha, inv) {
  const r = scale;
  const sq = Math.max(0.22, Math.abs(squash == null ? 1 : squash));
  const c = Math.cos(spin);
  const s = Math.sin(spin);
  /* Craft space, u forward and v to the right, in units of `scale`. */
  const X = (u, v) => x + (u * c - v * sq * s) * r;
  const Y = (u, v) => y + (u * s + v * sq * c) * r;
  const poly = (pts) => {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) {
      if (i === 0) {
        ctx.moveTo(X(pts[i], pts[i + 1]), Y(pts[i], pts[i + 1]));
      } else {
        ctx.lineTo(X(pts[i], pts[i + 1]), Y(pts[i], pts[i + 1]));
      }
    }
    ctx.closePath();
  };
  const disc = (u, v, R, a0 = 0, a1 = TURN) => {
    ctx.beginPath();
    ctx.ellipse(X(u, v), Y(u, v), R * r, R * r * sq, spin, a0, a1);
  };
  /* Two weights, as an inker uses them: the heavy line round the craft's
   * outside, a lighter one for what is drawn inside it. */
  const line = Math.max(1.5, r * 0.07);
  const inner = Math.max(1, line * 0.55);
  const fine = r >= 14;
  const paint = (fill, w = line) => {
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ink(ctx, w);
    ctx.stroke();
  };
  ctx.save();
  ctx.globalAlpha = alpha;
  const M = 0.62;
  const motors = [[M, -M], [M, M], [-M, -M], [-M, M]];
  /* The arms, tapering from the stack to the motor. */
  for (const [mu, mv] of motors) {
    const len = Math.hypot(mu, mv);
    const nu = -mv / len;
    const nv = mu / len;
    poly([
      nu * 0.12, nv * 0.12, mu + nu * 0.08, mv + nv * 0.08,
      mu - nu * 0.08, mv - nv * 0.08, -nu * 0.12, -nv * 0.12,
    ]);
    paint(inv ? PACK : CARBON);
  }
  /* The stack's plate. */
  poly([-0.5, -0.21, 0.34, -0.21, 0.42, -0.13, 0.42, 0.13, 0.34, 0.21, -0.5, 0.21]);
  paint(inv ? PACK : PLATE);
  /* The bells, each with its shaft. */
  for (const [mu, mv] of motors) {
    disc(mu, mv, 0.16);
    paint(inv ? SLATE : BELL, inner);
    if (fine) {
      disc(mu, mv, 0.05);
      ctx.fillStyle = INK;
      ctx.fill();
    }
  }
  if (!inv) {
    /* The pack, in two cel bands with a hard stop, and its strap. */
    poly([-0.54, 0.05, 0.16, 0.05, 0.16, 0.16, -0.54, 0.16]);
    ctx.fillStyle = PACK_SHADE;
    ctx.fill();
    poly([-0.54, -0.16, 0.16, -0.16, 0.16, 0.05, -0.54, 0.05]);
    ctx.fillStyle = PACK;
    ctx.fill();
    poly([-0.54, -0.16, 0.16, -0.16, 0.16, 0.16, -0.54, 0.16]);
    paint(null, inner);
    if (fine) {
      poly([-0.24, -0.2, -0.13, -0.2, -0.13, 0.2, -0.24, 0.2]);
      paint(INK, inner);
    }
  }
  /* The camera pod: the mount's side plates in sakura, the camera, and the
   * lens barrel out in front with a glint on its glass. */
  poly([0.2, -0.26, 0.62, -0.26, 0.68, -0.19, 0.68, 0.19, 0.62, 0.26, 0.2, 0.26]);
  paint(SAKURA);
  poly([0.32, -0.09, 0.62, -0.09, 0.62, 0.09, 0.32, 0.09]);
  paint(CAMERA, inner);
  poly([0.62, -0.065, 0.78, -0.065, 0.78, 0.065, 0.62, 0.065]);
  paint(INK, inner);
  if (fine) {
    disc(0.75, -0.025, 0.024);
    ctx.fillStyle = CREAM;
    ctx.fill();
  }
  /* The antenna off the back, capped in the frame's black, so the only
   * sakura on the craft is at its nose. */
  ctx.beginPath();
  ctx.moveTo(X(-0.5, 0.06), Y(-0.5, 0.06));
  ctx.lineTo(X(-0.8, 0.14), Y(-0.8, 0.14));
  ink(ctx, Math.max(1.5, line * 0.8));
  ctx.stroke();
  disc(-0.8, 0.14, 0.055);
  paint(CARBON, Math.max(1, line * 0.6));
  /* The props last, over everything: a disc of blur, and in it two speed
   * arcs, the way a manga draws a thing turning too fast to see. */
  const arcW = Math.max(1, line * 0.5);
  const P = 0.41;
  motors.forEach(([mu, mv], k) => {
    ctx.save();
    ctx.globalAlpha = alpha * 0.4;
    disc(mu, mv, P);
    ctx.fillStyle = inv ? SLATE : CREAM;
    ctx.fill();
    ctx.restore();
    disc(mu, mv, P);
    ink(ctx, arcW);
    ctx.stroke();
    if (fine) {
      const a = k * 1.7 + 0.4;
      disc(mu, mv, P * 0.78, a, a + 1.6);
      ink(ctx, arcW);
      ctx.stroke();
      disc(mu, mv, P * 0.57, a + Math.PI, a + Math.PI + 1.2);
      ctx.stroke();
    }
  });
  ctx.restore();
}

/* The line already flown, and a few ghosts along it holding the attitude the
 * craft had there. The ghosts are what make a still frame readable, which
 * matters for a screenshot and for a reader who has motion turned off. */
function drawTrail(ctx, film, tNow, toPx, scale) {
  const N = 46;
  ctx.save();
  ctx.strokeStyle = SAKURA;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  for (let i = 0; i <= N; i += 1) {
    const t = (tNow * i) / N;
    const p = sample(film, t);
    const q = toPx(p.x, p.y);
    if (i === 0) { ctx.moveTo(q.x, q.y); } else { ctx.lineTo(q.x, q.y); }
  }
  ctx.stroke();
  ctx.restore();
  for (let i = 1; i <= 3; i += 1) {
    const t = (tNow * i) / 4.4;
    const p = sample(film, t);
    const q = toPx(p.x, p.y);
    drawQuad(ctx, q.x, q.y, p.spin, scale * 0.72, p.squash, 0.2, p.inv);
  }
}

/*
 * The whole frame. `t` is milliseconds into the film; pass a fixed set of
 * times instead and you get the key frame strip the reduced motion path
 * draws.
 */
export function drawFilm(ctx, film, t, W, H) {
  ctx.clearRect(0, 0, W, H);
  drawWorld(ctx, film, W, H);
  /* The shape is the point, so it fills the frame: a lap of radius 0.62 in
   * film space leaves a comfortable margin at this scale and no more. */
  const s = Math.min(W / 2.5, H / 2.05);
  const cx = W * 0.5;
  const cy = film.view === 'above' ? H * 0.5 : H * 0.44;
  const hz = horizonOf(film.view, H);
  const toPx = (x, y) => ({ x: cx + x * s, y: cy - y * s });
  drawObstacle(ctx, film, cx, cy, s, hz);
  drawTrail(ctx, film, t, toPx, s * 0.15);
  const p = sample(film, t);
  const q = toPx(p.x, p.y);
  /* A tap flashes the wall where the craft meets it. */
  if (p.seg && p.seg.tap && p.u > 0.45 && p.u < 0.62) {
    ctx.fillStyle = MINT;
    ctx.beginPath();
    ctx.arc(q.x, q.y, s * 0.16, 0, TURN);
    ctx.fill();
  }
  drawQuad(ctx, q.x, q.y, p.spin, s * 0.15, p.squash, 1, p.inv);
}

/* ------------------------------------------------------------------ *
 * The player
 * ------------------------------------------------------------------ */

export class TrickFilmPlayer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.film = null;
    this.raf = 0;
    this.t0 = 0;
    this.reduced = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  }

  /* Match the backing store to the box, capped at 2x: a teaching picture
   * does not need a retina buffer and this runs beside a simulator. */
  size() {
    const box = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const w = Math.max(160, Math.round(box.width));
    const h = Math.max(110, Math.round(box.height));
    if (this.canvas.width !== Math.round(w * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  show(film) {
    this.film = film;
    this.t0 = 0;
    this.draw(0);
    this.start();
  }

  start() {
    if (this.raf || !this.film || this.reduced) {
      /* Reduced motion gets one still frame per segment, drawn once. */
      if (this.reduced && this.film) { this.drawStrip(); }
      return;
    }
    const tick = (now) => {
      if (!this.film) { this.raf = 0; return; }
      if (!this.t0) { this.t0 = now; }
      this.draw((now - this.t0) % this.film.totalMs);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.t0 = 0;
  }

  draw(t) {
    if (!this.film) { return; }
    const { w, h } = this.size();
    drawFilm(this.ctx, this.film, t, w, h);
  }

  /*
   * The trick as a row of stills, one per segment plus the finish. Used when
   * the reader has asked for no motion: NOTHING THAT CARRIES MEANING IS
   * HIDDEN, which is the contract the rest of this shell keeps, so the shape
   * of the trick is still on the screen, just not moving.
   */
  drawStrip() {
    const { w, h } = this.size();
    const n = Math.min(4, this.film.segs.length + 1);
    const cw = w / n;
    this.ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < n; i += 1) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(i * cw, 0, cw, h);
      this.ctx.clip();
      this.ctx.translate(i * cw, 0);
      drawFilm(this.ctx, this.film, (this.film.totalMs - HOLD_MS) * (i / (n - 1 || 1)), cw, h);
      this.ctx.restore();
      if (i > 0) {
        this.ctx.strokeStyle = INK;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(i * cw, 0);
        this.ctx.lineTo(i * cw, h);
        this.ctx.stroke();
      }
    }
  }
}
