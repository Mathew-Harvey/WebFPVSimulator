/*
 * cat.js: what the yard cat wants. Pure arithmetic: no three.js, no page.
 * ./catlawn.js is where it may be, ./catrig.js is its body, ./catmodel.js
 * its shape and ./catdraw.js the drawing; this is the cat itself, which
 * looks at where the craft is and decides what to do about it.
 *
 * THE OWNER'S ASK, 2026-11-21: "add a cat that hunts and stalks you to
 * this track everywhere the track is, make sure the cat can't acutally
 * touch you, but it should have all the cat characteristics, and signature
 * moves (stalk, wiggle butt and big eyes, jumping and swatting) its should
 * be a black cat, research extensively for all the moves a cat can do to
 * hunt a whoop".
 *
 * WHAT THE READING SAID A CAT DOES, and so what this one does. A hunt is a
 * chain, each link setting off the next: it sees, it stares, it stalks low
 * with its head level, it stops dead when the prey looks its way (often
 * with a paw in the air), it settles into a crouch and treads its hind
 * feet and wiggles its rump to test its footing, its pupils open wide, and
 * it springs with both hind legs and lands on its fore paws (Live Science,
 * PetMD, Cats Protection and Hill's on the wiggle and the pounce; the cat
 * play page of Wikipedia on the chain). Prey in the air gets a leap
 * straight up with both paws overhead, or the cat stands on its hind legs
 * and bats with one paw and then the other. Prey it cannot reach gets the
 * chatter: the jaw going fast, the tail tip twitching (Discover Wildlife,
 * Purina). A miss is followed by a wash, as if nothing had happened, which
 * the books call displacement grooming. Something coming at it fast gets
 * the fright: flat ears, a jump sideways with the back arched and the tail
 * bristled, then crab steps side on to look bigger. Something that lands
 * and sits still gets curiosity: the neck stretched out, a sniff, one paw
 * put out to tap it and snatched back. And a cat that is not hunting sits,
 * washes, loafs, sleeps, stretches and blinks slowly at what it likes
 * (Catster and the videos of cats and drones in PROGRESS.md's entry).
 *
 * NEVER TOUCHING THE CRAFT is three things, each behind the one before.
 * Every move is PLANNED to miss: a pounce lands short or crosses behind, a
 * bat stops short, a leap tops out under the craft, and the numbers that
 * say how short are in the craft's own size, because a five inch in Heads'
 * yard is three times the whoop across. A craft COMING AT the cat is seen
 * coming: it ducks flat if the craft will pass over it and hops aside if
 * it will not. And after the body has been posed for the frame, whatever
 * else happened, settle() measures the craft against every ball of the
 * body (./catrig.js probes, which wrap every corner of the drawn cat) and,
 * if one is nearer than the craft's sweep and KEEP of air, slides the
 * whole cat along the ground the shortest way that clears them all, in
 * that same frame, before anything is drawn. That last step is the
 * promise; the first two are why it is hardly ever needed.
 * scripts/yardcat-check.js flies craft at the cat every way it can think
 * of and measures the gap to every drawn corner.
 *
 * FOR THE LATENCY RULE. One think() is a state's handful of comparisons,
 * the craft's speed by difference, and at most one look at the lawn's
 * grid; nothing is made in a frame. The cat is not in the plant, times
 * nothing and collides with nothing, so nothing here is on the physics
 * path and JS's own sines are fair.
 *
 * Lengths that are the cat's are in a cat's metres and multiplied by the
 * scale, the world metres to one of the cat's; the craft and the lawn are
 * in the world's. Heights are over the lawn.
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

import { WAY, WAIT, UNDER } from './catlawn.js';
import { POSTURE, wrapAngle } from './catrig.js';
import { MARK, SWIPE, PUFF } from './catmodel.js';

/* What the cat is doing. */
export const DO = {
  sit: 0, groom: 1, loaf: 2, stretch: 3, wander: 4,
  notice: 5, watch: 6, stalk: 7, crouch: 8, pounce: 9, leap: 10, swat: 11, chase: 12, recover: 13,
  startle: 14, duck: 15, backoff: 16, sniff: 17, lost: 18, adore: 19, escape: 20, flee: 21,
};
export const DOING = Object.keys(DO);

/*
 * THE AIR KEPT BETWEEN THE CAT AND THE CRAFT, in a cat's metres: fifteen
 * centimetres to a real cat, half a metre in a yard built at three and a
 * half. It is measured from the craft's own sweep (its arms and its props
 * or ducts, src/game/collide.js CRAFT_WORLD_R) to the nearest ball of the
 * cat's body, so it is the same air round a whoop and round a five inch.
 */
export const KEEP = 0.15;

/* The cat's own sizes, in its metres, measured off the rig: how high each
 * posture reaches, and how far ahead of its spot its nose is. */
const FLAT_TOP = 0.2;
const AIR_TOP = 0.52;
const UP_TOP = 0.6;
const NOSE = 0.35;
/* How fast it goes, its metres a second: the creep of a stalk, a walk, the
 * low trot between two stops, and flat out. */
const CREEP = 0.3;
const WALK = 0.8;
const SLINK = 2.0;
const RUN = 5.6;
/* How hard it can push off and pull up, and gravity, which is the world's:
 * a cat a metre up comes down in the time a real one does. */
const PUSH = 11;
const BRAKE = 13;
const G = 9.81;

/* The plans a stalk can end in, and the three ways an ambush can. */
const PL = { none: 0, ambush: 1, low: 2, swat: 3, leap: 4, ground: 5, sniff: 6 };
const AM = { leap: 0, swat: 1, under: 2 };
/* The ground the cat covers, in its own frame and its own metres, while it
 * is in the air: nose, tail and half its width, with a little over. */
const AIR_FRONT = 0.38;
const AIR_BACK = 0.6;
const AIR_SIDE = 0.16;
/* How far over its keep a craft has to be before a cat on its feet can be
 * under it: lower than that it is in the way, and is walked round. */
const UNDERPASS = 0.66;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};
const ease = (dt, half) => (half <= 0 ? 1 : 1 - Math.pow(0.5, dt / half));

/* What the drawing shows of the face and the marks: plain records the cat
 * writes and ./catdraw.js reads. */
export function makeFace() {
  return {
    pupil: 0.35, lid: 0, squint: 0, brow: 0, gazeX: 0, gazeY: 0, sparkle: 0, clawL: 0, clawR: 0, hackle: 0,
  };
}
export function makeMarks() {
  return {
    mark: MARK.none, markT: 0, markDur: 1,
    swipe: SWIPE.none, swipeT: 0, swipeDur: 0.2, swipeX: 0, swipeY: 0, swipeZ: 0, swipeRoll: 0,
    puff: PUFF.none, puffT: 0, puffDur: 0.4, puffX: 0, puffY: 0, puffZ: 0,
  };
}

/*
 * THE CAT. `lawn` is ./catlawn.js's, `rig` and `controls` ./catrig.js's,
 * `face` and `marks` the records above; `seed` makes one cat's whims
 * another's; `light` is how bright the day is, 0 to 1, for its pupils.
 *
 *   think(dt, craft, craftR, eye)   decide, and write what is asked of the
 *       body. `craft` is the drawn craft's middle in the world or null,
 *       `craftR` its sweep in world metres, `eye` the camera as
 *       { x, y, z, fx, fy, fz } or null
 *   settle()    after the body has been posed: keep it off the craft
 *   stats()     for the check and the harness
 */
export function makeMind({ lawn, rig, controls, face, marks, seed = 7, light = 0.6 }) {
  const S = lawn.scale;
  const g = lawn.ground;
  const c = controls;
  const f = face;
  const m = marks;
  const L = lawn.line;

  /* Its whims: a small generator, so the same seed and the same flight are
   * the same cat. */
  let rs = (seed >>> 0) || 1;
  const rnd = () => {
    rs = (rs + 0x6d2b79f5) | 0;
    let t = Math.imul(rs ^ (rs >>> 15), 1 | rs);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const between = (a, b) => a + (b - a) * rnd();

  /* THE CRAFT, as the cat knows it. */
  const cr = {
    on: false, seen: false, R: 0.2, keep: 0.2 + KEEP * S,
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, sp: 0, hs: 0,
    dx: 0, dz: 0, dh: 9e9,
    yard: false, down: false, landT: 0, hoverT: 0, awayT: 0, li: -1, lineT: 0, lineLook: 0,
    jumped: false, tookOff: false, eyeOn: false, eye: false, efx: 0, efz: 0, closing: 0,
  };
  /* Where the cat stands when nothing has put it anywhere: a place to rest
   * near the middle of its lawn. */
  {
    let best = -1;
    let bd = 1e18;
    for (let r = 0; r < lawn.rests; r += 1) {
      const d = Math.abs(Math.hypot(lawn.restX[r] - lawn.centre.x, lawn.restZ[r] - lawn.centre.z) - lawn.reach * 0.55) + 2 * rnd();
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    if (best >= 0) {
      c.x = lawn.restX[best];
      c.z = lawn.restZ[best];
    } else {
      c.x = lawn.centre.x;
      c.z = lawn.centre.z;
    }
    c.yaw = Math.atan2(c.z - lawn.centre.z, lawn.centre.x - c.x);
    c.posture = POSTURE.sit;
  }

  let now = 0;
  let st = DO.sit;
  let stT = 0;
  let ph = 0;
  let phT = 0;
  let dur = between(3, 6);
  const did = new Uint32Array(DOING.length);
  const moves = {
    stalk: 0, freeze: 0, wiggle: 0, bigEyes: 0, pounce: 0, leap: 0, swat: 0, bat: 0, chatter: 0, startle: 0, duck: 0,
    backoff: 0, sniff: 0, tap: 0, groom: 0, slowBlink: 0, sleep: 0, stretch: 0, yawn: 0, chase: 0, ambush: 0, tilt: 0,
    flee: 0, lieInWait: 0, hiss: 0,
  };
  let pushes = 0;
  let pushedNow = false;
  let pushX = 0;
  let pushZ = 0;
  let lastDir = -1;

  /* Its humour. */
  let weary = 0;
  let resting = false;
  let fear = 0;
  let misses = 0;
  let landVisit = 0;
  let sniffed = false;
  let idleNext = 0;
  let bangAt = -99;
  let reflexAt = -99;
  let perch = false;
  let bored = false;
  let batted = false;
  let letCome = false;
  let hissed = false;
  let hissT = 0;
  let washDry = false;
  let asleep = false;

  /* The plan a stalk is working to: where to get to (x, z), where a leap
   * from there comes down (lx, lz), and what it is at: the craft's place
   * when the plan was made, or the point of the line watched (cx, cz, and
   * for the line its index and its height). */
  const plan = {
    kind: PL.none, sub: 0, x: 0, z: 0, lx: 0, lz: 0, at: -1, cx: 0, cz: 0, h: 0, made: 0, hurry: false, wait: false,
  };
  const lineStep = L.n > 0 ? L.length / L.n : 1;
  /* A leap: from, to, how high, how long, how far through. */
  const hop = {
    on: false, ax: 0, az: 0, bx: 0, bz: 0, H: 0, T: 0.4, t: 0, up: 0,
  };
  let topOff = AIR_TOP;
  /* Going somewhere. */
  const go = {
    on: false, x: 0, z: 0, speed: 0, has: false, wx: 0, wz: 0, wT: 0, arrived: false, failed: false, held: 0,
  };
  let vel = 0;
  let sidling = false;
  let cornered = 0;
  let kerb = false;
  let kerbT = 0;
  let swatRun = 0;
  let sameRun = 0;
  let lastKind = PL.none;
  let freezes = 0;
  let lastIdle = -1;
  let faceOn = false;
  let faceYaw = 0;
  let turnRate = 0;
  const out2 = new Float64Array(2);
  const at3 = [0, 0, 0];
  /* What the face is eased toward. */
  let pupilT = 0.35;
  let lidT = 0;
  let squintT = 0;
  let browT = 0;
  let sparkT = 0;
  let clawLT = 0;
  let clawRT = 0;
  let lidE = 0;
  let blinkAt = between(2, 5);
  let blinkT = 9;
  let unblinking = false;
  /* The ears: 0 by themselves, 1 forward, 2 back and flat, 3 out sideways. */
  let ears = 0;
  let earLT = 0.2;
  let earRT = 0.2;
  let earAt = 0;
  /* Where it looks when it looks at nothing. */
  let gazeYaw = 0;
  let gazeAt = 0;
  /* Marks that need a place on the body, put up after the body is posed. */
  let wantSwipe = 0;
  let wantSwipePaw = 0;
  let wantPuff = 0;
  let freezeT = 0;
  let freezeGap = 0;
  let frozen = false;
  let tiltT = 0;
  let tiltSide = 1;
  let chatterT = 0;
  let batPaw = 0;
  let bats = 0;
  let crouchFor = 1;
  let wiggled = false;
  let spotTry = 0;

  const basePupil = clamp(0.62 - 0.38 * light, 0.2, 0.7);

  function enter(s) {
    st = s;
    stT = 0;
    ph = 0;
    phT = 0;
    did[s] += 1;
    go.on = false;
    go.arrived = false;
    go.failed = false;
    faceOn = false;
    frozen = false;
    return s;
  }
  function phase(p) {
    ph = p;
    phT = 0;
  }
  function mark(id, seconds) {
    m.mark = id;
    m.markT = 0;
    m.markDur = seconds;
  }
  function unmark(id) {
    if (m.mark === id && m.markT < m.markDur) {
      m.markT = m.markDur;
    }
  }
  const yawTo = (x, z) => Math.atan2(c.z - z, x - c.x);
  /* Go there. Asked every frame by a state that is going somewhere: that
   * it has arrived, or that there is no way, stands until it is asked for
   * somewhere else, so the state can see it. */
  function goTo(x, z, speed) {
    const moved = Math.hypot(go.x - x, go.z - z);
    if (moved > 0.5 * S) {
      go.failed = false;
      go.arrived = false;
      go.wT = 0;
      go.has = false;
      go.held = 0;
    } else if (moved > 0.02) {
      go.arrived = false;
    }
    go.x = x;
    go.z = z;
    if (!go.on && !go.arrived && !go.failed) {
      go.wT = 0;
      go.has = false;
      go.held = 0;
      go.on = true;
    }
    go.speed = speed;
    faceOn = false;
  }
  function turnTo(yaw) {
    faceOn = true;
    faceYaw = yaw;
  }
  const aimed = (yaw, tol) => Math.abs(wrapAngle(yaw - c.yaw)) < tol;
  function pose(p, quick) {
    c.posture = p;
    c.quick = quick;
  }
  /* Look at the craft, or at a place. */
  function eyes(w) {
    c.lookX = cr.x;
    c.lookY = cr.y;
    c.lookZ = cr.z;
    c.look = w;
  }
  function lookAt(x, y, z, w) {
    c.lookX = x;
    c.lookY = y;
    c.lookZ = z;
    c.look = w;
  }
  /* Looking about at nothing much: a new way every few seconds. */
  function gazeAbout(dt) {
    gazeAt -= dt;
    if (gazeAt <= 0) {
      gazeAt = between(1.4, 4.2);
      gazeYaw = between(-1.3, 1.3);
    }
    const a = c.yaw + gazeYaw;
    lookAt(c.x + Math.cos(a) * 3 * S, 0.3 * S, c.z - Math.sin(a) * 3 * S, 0.8);
  }

  /* THE CRAFT THIS FRAME: where it is, how fast by difference, whether it
   * is down, hanging in the air or going somewhere, and where on the
   * racing line it is if it is flying the line. */
  function sense(dt, craft, craftR, eye) {
    cr.jumped = false;
    cr.tookOff = false;
    if (!craft) {
      cr.on = false;
      cr.seen = false;
      cr.yard = false;
      cr.landT = 0;
      cr.hoverT = 0;
      cr.li = -1;
      cr.lineT = 0;
      cr.dh = 9e9;
      cr.eyeOn = false;
      cr.eye = false;
      return;
    }
    const y = craft.y - g;
    if (!cr.seen) {
      cr.vx = 0;
      cr.vy = 0;
      cr.vz = 0;
      cr.jumped = true;
    } else if (dt > 1e-5) {
      const jx = craft.x - cr.x;
      const jy = y - cr.y;
      const jz = craft.z - cr.z;
      /* Further in a frame than anything flies: it was put there (a reset,
       * a new run), and that is not a speed. */
      if (Math.hypot(jx, jy, jz) > Math.max(0.9 * S, 110 * dt)) {
        cr.vx = 0;
        cr.vy = 0;
        cr.vz = 0;
        cr.jumped = true;
        cr.li = -1;
        cr.lineT = 0;
      } else {
        const k = ease(dt, 0.045);
        cr.vx += (jx / dt - cr.vx) * k;
        cr.vy += (jy / dt - cr.vy) * k;
        cr.vz += (jz / dt - cr.vz) * k;
      }
    }
    cr.x = craft.x;
    cr.y = y;
    cr.z = craft.z;
    cr.seen = true;
    cr.on = true;
    cr.R = craftR;
    cr.keep = craftR + KEEP * S;
    cr.sp = Math.hypot(cr.vx, cr.vy, cr.vz);
    cr.hs = Math.hypot(cr.vx, cr.vz);
    cr.dx = cr.x - c.x;
    cr.dz = cr.z - c.z;
    cr.dh = Math.hypot(cr.dx, cr.dz);
    const far = Math.hypot(cr.x - lawn.centre.x, cr.z - lawn.centre.z);
    cr.yard = far < lawn.reach + 0.5 * S && cr.y < lawn.top + S;
    cr.awayT = cr.yard ? 0 : cr.awayT + dt;
    const wasDown = cr.down;
    cr.down = cr.y < craftR * 0.6 + 0.1 * S && cr.sp < 0.3 * S;
    if (wasDown && !cr.down && cr.landT > 0.4) {
      cr.tookOff = true;
    }
    cr.landT = cr.down ? cr.landT + dt : 0;
    /* Hanging about: still, or drifting no faster than a cat trots. */
    cr.hoverT = !cr.down && cr.sp < 0.8 * S ? cr.hoverT + dt : 0;
    cr.closing = cr.dh > 1e-3 ? -(cr.vx * cr.dx + cr.vz * cr.dz) / cr.dh : 0;
    if (!cr.down && landVisit > 0 && cr.y > 0.3 * S) {
      landVisit = 0;
      sniffed = false;
    }
    /* The line: only looked for while it is going somewhere, near where it
     * was first and the whole line a few times a second when it is lost. */
    if (cr.yard && cr.sp > 0.5 * S && L.n > 0) {
      cr.lineLook -= dt;
      if (cr.li >= 0 || cr.lineLook <= 0) {
        cr.lineLook = 0.2;
        cr.li = lawn.onLine(cr.x, cr.y, cr.z, cr.li, 0.8 * S);
      }
      if (cr.li >= 0) {
        const k2 = (cr.li + 3) % L.n;
        const along = (L.x[k2] - L.x[cr.li]) * cr.vx + (L.y[k2] - L.y[cr.li]) * cr.vy + (L.z[k2] - L.z[cr.li]) * cr.vz;
        cr.lineT = along > 0 ? cr.lineT + dt : 0;
      } else {
        cr.lineT = 0;
      }
    } else {
      cr.lineT = 0;
    }
    /* Is the pilot looking this way: the cat within a hand of the middle
     * of the picture, and near. */
    cr.eyeOn = false;
    cr.eye = false;
    if (eye) {
      const ex = c.x - eye.x;
      const ey = g + 0.2 * S - eye.y;
      const ez = c.z - eye.z;
      const d = Math.hypot(ex, ey, ez);
      cr.eyeOn = d < 5 * S && d > 1e-3 && (ex * eye.fx + ey * eye.fy + ez * eye.fz) > d * 0.86;
      /* And which way it looks over the ground, for choosing where to be
       * seen from. */
      const fh = Math.hypot(eye.fx, eye.fz);
      if (fh > 0.2) {
        cr.eye = true;
        cr.efx = eye.fx / fh;
        cr.efz = eye.fz / fh;
      }
    }
  }

  /* Where the craft will be `t` seconds on, into `pr`: along the racing
   * line if it is flying the line, which bends, else straight on. */
  const pr = { x: 0, y: 0, z: 0 };
  function predict(t) {
    if (cr.li >= 0 && cr.lineT > 0.25) {
      const j = (cr.li + Math.round((cr.sp * t) / lineStep)) % L.n;
      pr.x = cr.x + L.x[j] - L.x[cr.li];
      pr.y = cr.y + L.y[j] - L.y[cr.li];
      pr.z = cr.z + L.z[j] - L.z[cr.li];
    } else {
      pr.x = cr.x + cr.vx * t;
      pr.y = cr.y + cr.vy * t;
      pr.z = cr.z + cr.vz * t;
    }
  }
  /* Is the craft about to come through a place, low, in the next `within`
   * seconds. Asked before the cat steps out where a run is flown. */
  function coming(x, z, within) {
    if (!cr.on || cr.sp < 0.5 * S) {
      return false;
    }
    const lim = cr.keep + 0.6 * S;
    for (let k = 0; k <= 6; k += 1) {
      predict((within * k) / 6);
      if (pr.y < 1.4 * S && Math.hypot(pr.x - x, pr.z - z) < lim) {
        return true;
      }
    }
    return false;
  }

  /*
   * ROUND THE CRAFT AND NOT THROUGH IT. A craft low enough to be in the way
   * and slow enough to be walked round is walked round: if the way the cat
   * is headed passes inside the craft's air and the cat's own width, it is
   * turned to pass along the edge of that, on the side it was already
   * going. Where it is going may itself be near the craft (a place to bat
   * from): then it is left alone, for that was planned by its own rule.
   */
  let roundSide = 0;
  let roundT = 0;
  function round(to, dt) {
    roundT -= dt;
    if (!cr.on || cr.sp > 1.6 * S || cr.y > cr.keep + UNDERPASS * S) {
      return to;
    }
    const ring = cr.keep + 0.36 * S;
    const rx = cr.x + cr.vx * 0.2 - c.x;
    const rz = cr.z + cr.vz * 0.2 - c.z;
    const rd = Math.hypot(rx, rz);
    if (Math.hypot(go.x - cr.x, go.z - cr.z) < ring + 0.02 * S) {
      /* Where it was going is in the craft's lap, which nothing plans: as
       * far as the edge of it and no further. */
      if (rd < ring + 0.1 * S) {
        go.on = false;
        go.failed = true;
      }
      return to;
    }
    if (rd > ring + 1.6 * S || rd < 1e-3) {
      return to;
    }
    const bearing = Math.atan2(-rz, rx);
    const da = wrapAngle(to - bearing);
    /* The half angle the ring takes up, seen from here; inside it, out
     * along it and a little away. */
    const half = rd > ring ? Math.asin(ring / rd) : Math.PI / 2 + 0.7 * (1 - rd / ring);
    if (Math.abs(da) >= half) {
      return to;
    }
    /* And only if the way there goes into the ring before it gets there. */
    if (rd > ring) {
      const along = rd * Math.cos(da);
      const perp = rd * Math.sin(da);
      if (Math.hypot(go.wx - c.x, go.wz - c.z) < along - Math.sqrt(Math.max(0, ring * ring - perp * perp))) {
        return to;
      }
    }
    if (roundT <= 0 || roundSide === 0) {
      roundSide = da >= 0 ? 1 : -1;
      /* Not the side that is a wall. */
      const a = bearing + roundSide * half;
      if (!lawn.free(c.x + Math.cos(a) * 0.5 * S, c.z - Math.sin(a) * 0.5 * S)) {
        roundSide = -roundSide;
      }
    }
    roundT = 0.6;
    return wrapAngle(bearing + roundSide * half);
  }
  /* GOING. Toward where it was told, round what is in the way, turning no
   * faster than a cat can at that speed and stopping where it meant to. */
  function travel(dt) {
    let want = 0;
    let to = NaN;
    kerb = false;
    if (go.on) {
      const gd = Math.hypot(go.x - c.x, go.z - c.z);
      if (gd <= 0.05 * S) {
        go.on = false;
        go.arrived = true;
      } else {
        go.wT -= dt;
        if (go.wT <= 0) {
          const r = lawn.way(c.x, c.z, go.x, go.z, out2);
          if (r === WAY) {
            go.wx = out2[0];
            go.wz = out2[1];
            go.wT = 0.07;
            go.has = true;
            go.held = 0;
          } else if (r === WAIT) {
            go.held += dt;
          } else {
            go.on = false;
            go.failed = true;
          }
        }
        if (go.on && go.has) {
          to = round(yawTo(go.wx, go.wz), dt);
          const off = Math.abs(wrapAngle(to - c.yaw));
          want = go.speed * S;
          if (off > 1.3) {
            want *= 0.1;
          } else if (off > 0.45) {
            want *= lerp(1, 0.35, (off - 0.45) / 0.85);
          }
          want = Math.min(want, Math.sqrt(2 * BRAKE * S * 0.7 * Math.max(0, gd - 0.04 * S)) + 0.06 * S);
          /* It looks both ways. Where a run is flown low is ahead, the cat
           * is not yet on it, and the craft is coming through: it pulls up
           * short of the kerb, by its own nose and its stopping, and waits
           * for it to go by. Once on, it keeps going. */
          if (cr.on && cr.sp >= 0.5 * S && st !== DO.flee && !lawn.lane(c.x, c.z)) {
            const tx = Math.cos(to);
            const tz = -Math.sin(to);
            const look = (NOSE + 0.3) * S + (vel * vel) / (2 * BRAKE * S);
            let into = -1;
            for (let k = 1; k <= 6 && into < 0; k += 1) {
              if (lawn.lane(c.x + (tx * look * k) / 6, c.z + (tz * look * k) / 6)) {
                into = (look * k) / 6;
              }
            }
            if (into >= 0) {
              /* How far it is to the far kerb, the way it is going: as far
               * as the place it is making for, at most. */
              const most = Math.min(Math.hypot(go.wx - c.x, go.wz - c.z), 9 * S);
              let off = into;
              while (off < most && lawn.lane(c.x + tx * off, c.z + tz * off)) {
                off += 0.2 * S;
              }
              /* Clear for as long as the crossing will take at this pace,
               * all the way across. */
              const within = clamp((off + 0.5 * S) / Math.max(go.speed * S, 0.3 * S) + 0.3, 0.5, 2.4);
              for (let d = into; d <= off + 0.01 && !kerb; d += 0.8 * S) {
                kerb = coming(c.x + tx * d, c.z + tz * d, within);
              }
              kerb = kerb || coming(c.x + tx * off, c.z + tz * off, within);
              /* Unless it is coming through where the cat stands as well:
               * then standing there is no better. */
              kerb = kerb && !coming(c.x, c.z, within);
            }
            if (kerb) {
              want = 0;
            }
          }
        }
      }
    } else if (faceOn) {
      to = faceYaw;
    }
    kerbT = kerb ? kerbT + dt : 0;
    if (kerbT > 4) {
      /* It never does go by: something else, then. */
      kerbT = 0;
      go.on = false;
      go.failed = true;
    }
    turnRate = 0;
    if (to === to && dt > 0) {
      const off = wrapAngle(to - c.yaw);
      const most = (vel < 0.6 * S ? 7.5 : vel < 2.6 * S ? 5.2 : 3.6) * dt;
      const turn = clamp(off * ease(dt, 0.045), -most, most);
      c.yaw = wrapAngle(c.yaw + turn);
      turnRate = turn / dt;
    }
    vel += clamp(want - vel, -BRAKE * S * dt, PUSH * S * dt);
    if (want === 0 && vel < 0.01 * S) {
      vel = 0;
    }
    const fx = Math.cos(c.yaw);
    const fz = -Math.sin(c.yaw);
    const ox = c.x;
    const oz = c.z;
    if (vel > 0) {
      const nx = c.x + fx * vel * dt;
      const nz = c.z + fz * vel * dt;
      if (lawn.free(nx, nz) || !lawn.free(c.x, c.z)) {
        c.x = nx;
        c.z = nz;
      } else if (lawn.free(nx, c.z)) {
        /* Not into a wall: along it, as a cat goes round a corner. */
        c.x = nx;
      } else if (lawn.free(c.x, nz)) {
        c.z = nz;
      } else {
        /* Nor into a corner: stop, and ask the way again. */
        vel = 0;
        go.wT = 0;
        go.held += dt;
      }
    }
    c.vx = dt > 0 ? (c.x - ox) / dt : 0;
    c.vz = dt > 0 ? (c.z - oz) / dt : 0;
    c.lean = clamp(-turnRate * (vel / S) * 0.035, -0.3, 0.3);
    if (go.on && go.held > 2.5) {
      go.on = false;
      go.failed = true;
    }
  }
  /* Sidling: moved at a speed of its own choosing while it faces another
   * way (backing off a craft, the crab steps of a fright). */
  function sidle(dt, wx, wz, yaw) {
    const k = ease(dt, 0.06);
    let vx = c.vx + (wx - c.vx) * k;
    let vz = c.vz + (wz - c.vz) * k;
    const nx = c.x + vx * dt;
    const nz = c.z + vz * dt;
    let moved = true;
    if (lawn.free(nx, nz) || !lawn.free(c.x, c.z)) {
      c.x = nx;
      c.z = nz;
    } else {
      vx = 0;
      vz = 0;
      moved = false;
    }
    c.vx = vx;
    c.vz = vz;
    vel = 0;
    sidling = true;
    const off = wrapAngle(yaw - c.yaw);
    c.yaw = wrapAngle(c.yaw + clamp(off * ease(dt, 0.05), -7 * dt, 7 * dt));
    return moved;
  }

  /* A LEAP. Thrown, not walked: over the ground at one speed and up and
   * down as a thing thrown goes, so it takes as long as it is high. */
  function hopTo(bx, bz, H, up) {
    hop.on = true;
    hop.ax = c.x;
    hop.az = c.z;
    hop.bx = bx;
    hop.bz = bz;
    hop.H = H;
    hop.T = Math.max(0.16, Math.sqrt(8 * H / G));
    hop.t = 0;
    hop.up = up;
    vel = 0;
    go.on = false;
    wantPuff = 1;
  }
  /* How high it may be this frame, given how high it would like to be:
   * under what is over it, and under the craft if any of the ground the cat
   * covers is under the craft and its air. That is eased in over a hand's
   * width round, less than any leap is planned to come, so that a leap as
   * planned is never pressed and a craft drifting in over one presses it
   * down and does not snap it down. */
  function liftCap(wish) {
    let lift = Math.min(wish, (lawn.roofAt(c.x, c.z) - 0.08 * S) / S - topOff);
    if (cr.on) {
      const fx = Math.cos(c.yaw);
      const fz = -Math.sin(c.yaw);
      const along = (cr.x - c.x) * fx + (cr.z - c.z) * fz;
      const side = Math.abs(-(cr.x - c.x) * fz + (cr.z - c.z) * fx);
      /* How far the craft's air is from the cat's ground, 0 if over it. */
      const out = Math.max(along - AIR_FRONT * S, -AIR_BACK * S - along, side - AIR_SIDE * S, 0) - cr.keep;
      if (out < 0.06 * S) {
        const under = Math.max(0, (cr.y - cr.keep - 0.05 * S) / S - topOff);
        if (under < lift) {
          lift = lerp(under, lift, clamp(out / (0.06 * S), 0, 1));
        }
      }
    }
    return Math.max(0, lift);
  }
  /* One frame of it. True while it is in the air. */
  function hopStep(dt) {
    hop.t += dt;
    const s = clamp(hop.t / hop.T, 0, 1);
    c.x = lerp(hop.ax, hop.bx, s);
    c.z = lerp(hop.az, hop.bz, s);
    c.vx = (hop.bx - hop.ax) / hop.T;
    c.vz = (hop.bz - hop.az) / hop.T;
    c.lift = liftCap(4 * hop.H * s * (1 - s));
    c.air = s;
    c.up = hop.up;
    pose(POSTURE.air, 0.05);
    const rise = (4 * hop.H * (1 - 2 * s)) / hop.T;
    const run = Math.hypot(c.vx, c.vz) / S;
    c.pitch = hop.up ? lerp(1.15, 0.5, smooth((s - 0.55) / 0.4)) : clamp(Math.atan2(rise, Math.max(0.6, run)) * 0.55, -0.5, 0.6);
    if (s >= 1) {
      hop.on = false;
      c.lift = 0;
      c.vx = 0;
      c.vz = 0;
      /* Set down where it may be. */
      if (!lawn.free(c.x, c.z)) {
        const k = lawn.nearestFree(c.x, c.z);
        if (k >= 0) {
          hop.bx = lawn.cellX(k);
          hop.bz = lawn.cellZ(k);
        }
      }
      wantPuff = 1;
      return false;
    }
    return true;
  }
  /* May a leap from here come down there. */
  const canLand = (x, z, room) => lawn.free(x, z) && lawn.roomAt(x, z) >= room && lawn.sight(c.x, c.z, x, z);

  /* THE FACE, eased to what was asked, and the blink. */
  function visage(dt) {
    f.pupil += (pupilT - f.pupil) * ease(dt, 0.09);
    lidE += (lidT - lidE) * ease(dt, 0.1);
    f.squint += (squintT - f.squint) * ease(dt, 0.1);
    f.brow += (browT - f.brow) * ease(dt, 0.1);
    f.sparkle += (sparkT - f.sparkle) * ease(dt, 0.08);
    f.clawL += (clawLT - f.clawL) * ease(dt, 0.02);
    f.clawR += (clawRT - f.clawR) * ease(dt, 0.02);
    f.hackle += (fear - f.hackle) * ease(dt, 0.08);
    blinkAt -= dt;
    if (blinkAt <= 0) {
      blinkAt = between(2.2, 6.5);
      if (!unblinking) {
        blinkT = 0;
      }
    }
    blinkT += dt;
    const blink = blinkT < 0.17 ? Math.sin((Math.PI * blinkT) / 0.17) : 0;
    f.lid = Math.max(lidE, blink);
    /* The eyes go first and the head follows: where the head has yet to
     * turn, the pupils are. The cat's left is the eye's minus. */
    f.gazeX += (clamp(-rig.lead[0] * 1.6, -1, 1) - f.gazeX) * ease(dt, 0.04);
    f.gazeY += (clamp(rig.lead[1] * 1.6, -1, 1) - f.gazeY) * ease(dt, 0.04);
  }
  /* The ears, which turn by themselves when nothing has their attention,
   * one to the craft if it is behind. */
  function hark(dt) {
    if (ears === 1) {
      earLT = 0;
      earRT = 0;
    } else if (ears === 2) {
      earLT = 1.3;
      earRT = 1.3;
    } else if (ears === 3) {
      earLT = 0.95;
      earRT = 0.95;
    } else {
      earAt -= dt;
      if (earAt <= 0) {
        earAt = between(0.5, 2.4);
        earLT = rnd() < 0.25 ? between(0.9, 1.4) : between(0, 0.5);
        earRT = rnd() < 0.25 ? between(0.9, 1.4) : between(0, 0.5);
        if (cr.on && cr.dh < 6 * S) {
          /* Which side of it the craft is on: that ear goes to it. */
          const side = Math.sin(c.yaw) * cr.dx + Math.cos(c.yaw) * cr.dz;
          const front = Math.cos(c.yaw) * cr.dx - Math.sin(c.yaw) * cr.dz;
          if (front < 0) {
            if (side < 0) {
              earLT = 1.4;
            } else {
              earRT = 1.4;
            }
          }
        }
      }
    }
    c.earL = earLT;
    c.earR = earRT;
    const flat = ears === 2 ? 1 : ears === 3 ? 0.35 : 0;
    c.flatL = Math.max(flat, fear * 0.9);
    c.flatR = Math.max(flat, fear * 0.9);
  }

  /* Is there something to hunt: a craft in the yard that it has not given
   * up on as part of the furniture. */
  const prey = () => cr.on && cr.yard && !bored;

  /* WHAT NEXT, with nothing to hunt: the round of a cat with time. */
  function idle() {
    perch = false;
    resting = false;
    if (!lawn.stay(c.x, c.z, 0.25 * S)) {
      return enter(DO.wander);
    }
    /* Never the thing it has just done. */
    idleNext = Math.floor(rnd() * 5);
    if (idleNext === lastIdle) {
      idleNext = (idleNext + 1 + Math.floor(rnd() * 3)) % 5;
    }
    lastIdle = idleNext;
    if (idleNext === 0) {
      dur = between(3.5, 7);
      return enter(DO.sit);
    }
    if (idleNext === 1) {
      washDry = false;
      dur = between(3.5, 6);
      return enter(DO.groom);
    }
    if (idleNext === 2) {
      dur = between(9, 18);
      return enter(DO.loaf);
    }
    if (idleNext === 3) {
      return enter(DO.stretch);
    }
    return enter(DO.wander);
  }
  /* Is a place in the lap of a craft that is low enough to be in the way. */
  const lap = (x, z) => cr.on && cr.y < cr.keep + UNDERPASS * S && Math.hypot(x - cr.x, z - cr.z) < cr.keep + 0.7 * S;
  /* The nearest place it may stop that is not in the craft's lap: a cell
   * of the lawn, or -1. */
  function clearSpot(room) {
    let k = lawn.nearestFree(c.x, c.z, room);
    if (k >= 0 && lap(lawn.cellX(k), lawn.cellZ(k))) {
      /* From further out from it, then. */
      const d = Math.max(1e-3, cr.dh);
      const out = cr.keep + 1.3 * S;
      k = lawn.nearestFree(cr.x - (cr.dx / d) * out, cr.z - (cr.dz / d) * out, room);
      if (k >= 0 && lap(lawn.cellX(k), lawn.cellZ(k))) {
        k = -1;
      }
    }
    return k;
  }
  /* Sat watching it, between two tries: but never sat where it is flown. */
  function sitOut(seconds) {
    dur = seconds;
    if (!lawn.stay(c.x, c.z, 0.2 * S)) {
      return enter(DO.watch);
    }
    perch = true;
    return enter(DO.sit);
  }
  /* A wash for show, as if nothing had happened: only where it may stop. */
  function washOff(seconds, sign) {
    if (!lawn.stay(c.x, c.z, 0.2 * S)) {
      dur = between(0.8, 1.6);
      return enter(DO.watch);
    }
    washDry = true;
    dur = seconds;
    mark(sign, 1.3);
    return enter(DO.groom);
  }

  /* A place on a ring round the craft's spot on the lawn to work from: the
   * nearest that has room, and by choice one the pilot can see. */
  function ringSpot(radius, room, land) {
    let best = -1;
    let bs = 1e18;
    const a0 = Math.atan2(c.z - cr.z, c.x - cr.x);
    for (let k = 0; k < 12; k += 1) {
      const a = a0 + (k * Math.PI) / 6;
      const x = cr.x + Math.cos(a) * radius;
      const z = cr.z + Math.sin(a) * radius;
      if (!lawn.free(x, z) || lawn.roomAt(x, z) < room) {
        continue;
      }
      if (land > 0) {
        /* A run up is no use if the pounce from it has nowhere to land. */
        const lx = cr.x + Math.cos(a) * land;
        const lz = cr.z + Math.sin(a) * land;
        if (!lawn.free(lx, lz) || lawn.roomAt(lx, lz) < 0.1 * S || !lawn.sight(x, z, lx, lz)) {
          continue;
        }
      }
      let s = Math.hypot(x - c.x, z - c.z);
      if (!lawn.sight(c.x, c.z, x, z)) {
        s *= 1.6;
      }
      /* In front of the pilot's eye is where it is seen: a cat that does
       * its best work behind the camera is no use to anybody. */
      if (cr.eye) {
        s -= 1.1 * S * (Math.cos(a) * cr.efx + Math.sin(a) * cr.efz);
      } else if (cr.hs > 0.1 * S) {
        s -= 0.25 * S * ((Math.cos(a) * cr.vx + Math.sin(a) * cr.vz) / cr.hs);
      }
      if (s < bs) {
        bs = s;
        best = k;
      }
    }
    if (best < 0) {
      return false;
    }
    const a = a0 + (best * Math.PI) / 6;
    plan.x = cr.x + Math.cos(a) * radius;
    plan.z = cr.z + Math.sin(a) * radius;
    plan.cx = cr.x;
    plan.cz = cr.z;
    plan.made = now;
    return true;
  }
  /* How far from the craft's spot each plan works. A leap straight up is
   * made in front of the craft and clear of it, not under it: that way it
   * may go as high as the craft is, in the pilot's face. */
  function ringOf(kind) {
    if (kind === PL.swat) {
      /* Under a craft that is over its head it can stand close; one at the
       * height of its head is kept at the length of its nose. */
      return cr.y < cr.keep + UNDERPASS * S ? cr.keep + (NOSE + 0.07) * S : cr.keep + 0.25 * S;
    }
    if (kind === PL.leap) {
      return cr.keep + (AIR_FRONT + 0.14) * S;
    }
    if (kind === PL.sniff) {
      return cr.keep + (NOSE + 0.07) * S;
    }
    /* A pounce's run up: where it lands, and a leap back from there. */
    return cr.keep + (NOSE + 0.1) * S + 1.15 * S;
  }
  function planFor(kind) {
    plan.kind = kind;
    plan.hurry = false;
    plan.wait = false;
    const land = kind === PL.low || kind === PL.ground ? cr.keep + (NOSE + 0.1) * S : 0;
    return ringSpot(ringOf(kind), kind === PL.leap ? 0.2 * S : 0.3 * S, land);
  }
  /*
   * A place to lie in wait for a craft flying the line, far enough on that
   * the cat is there and set before the craft is. BESIDE the line it comes
   * down no nearer than leaves the craft its air past the cat's nose, and by
   * choice it springs to there from further back and further on, so that
   * the spring is in at the craft as it comes and the pilot sees all of it;
   * with no room for that it stands up on its hind legs there and bats as
   * the craft goes by. UNDER the line it leaps straight up beneath it.
   */
  function pickWait() {
    if (cr.li < 0 || lawn.waits === 0) {
      return false;
    }
    const speed = Math.max(cr.sp, 0.4 * S);
    let best = -1;
    let bs = 1e18;
    for (let w = 0; w < lawn.waits; w += 1) {
      const eta = lawn.ahead(cr.li, lawn.waitAt[w]) / speed;
      if (eta > 12) {
        continue;
      }
      const d = Math.hypot(lawn.waitX[w] - c.x, lawn.waitZ[w] - c.z);
      if (eta < (d * 1.3) / (RUN * 0.8 * S) + 1.6) {
        continue;
      }
      /* The soonest it can make, not the one it has just used, and a leap
       * from below for a change when there is one. */
      const s = eta + (lawn.waitAt[w] === plan.at ? 6 : 0) + 1.5 * rnd() - (lawn.waitKind[w] === UNDER ? 1.5 : 0);
      if (s < bs) {
        bs = s;
        best = w;
      }
    }
    if (best < 0) {
      return false;
    }
    const at = lawn.waitAt[best];
    const wx = lawn.waitX[best];
    const wz = lawn.waitZ[best];
    plan.kind = PL.ambush;
    plan.wait = false;
    plan.at = at;
    plan.cx = L.x[at];
    plan.cz = L.z[at];
    plan.h = L.y[at];
    plan.made = now;
    plan.hurry = true;
    if (lawn.waitKind[best] === UNDER) {
      plan.sub = AM.under;
      plan.x = wx;
      plan.z = wz;
      plan.lx = wx;
      plan.lz = wz;
      moves.ambush += 1;
      return true;
    }
    /* Out from the line to the place, and the way the line runs there. */
    let nx = wx - plan.cx;
    let nz = wz - plan.cz;
    const nd = Math.max(1e-3, Math.hypot(nx, nz));
    nx /= nd;
    nz /= nd;
    const a = (at - 2 + L.n) % L.n;
    const b = (at + 2) % L.n;
    let tx = L.x[b] - L.x[a];
    let tz = L.z[b] - L.z[a];
    const tl = Math.max(1e-3, Math.hypot(tx, tz));
    tx /= tl;
    tz /= tl;
    const off = Math.max(nd, cr.keep + (NOSE + 0.1) * S);
    const lx = plan.cx + nx * off;
    const lz = plan.cz + nz * off;
    if (!lawn.free(lx, lz) || lawn.lane(lx, lz)) {
      /* No room there for this craft's air: not this one. */
      return false;
    }
    plan.lx = lx;
    plan.lz = lz;
    plan.x = lx;
    plan.z = lz;
    plan.sub = AM.swat;
    if (rnd() < 0.75) {
      for (let k = 0; k < 3; k += 1) {
        const back = k === 0 ? 0.8 : k === 1 ? 1.0 : 0.65;
        const on = k === 0 ? 0.55 : k === 1 ? 0 : 0.3;
        const qx = lx + (nx * back + tx * on) * S;
        const qz = lz + (nz * back + tz * on) * S;
        if (lawn.stay(qx, qz, 0.2 * S) && lawn.sight(qx, qz, lx, lz)) {
          plan.sub = AM.leap;
          plan.x = qx;
          plan.z = qz;
          break;
        }
      }
    }
    moves.ambush += 1;
    return true;
  }
  /* How long until the craft is at the place the plan watches: by the line
   * if it is flying the line, else by where it is headed. Less than nothing
   * once it has gone by, and 99 if it is not coming at all. */
  function etaTo() {
    if (cr.li >= 0 && cr.lineT > 0) {
      const a = lawn.ahead(cr.li, plan.at);
      const sp = Math.max(cr.sp, 0.3 * S);
      return a > L.length * 0.75 ? (a - L.length) / sp : a / sp;
    }
    if (cr.hs > 0.4 * S) {
      const rx = plan.cx - cr.x;
      const rz = plan.cz - cr.z;
      const t = (rx * cr.vx + rz * cr.vz) / (cr.hs * cr.hs);
      if (Math.hypot(rx - cr.vx * t, rz - cr.vz * t) < 0.9 * S) {
        return t;
      }
    }
    return 99;
  }

  /* WHAT NEXT, with a craft in the yard. */
  function hunt() {
    perch = false;
    if (!prey()) {
      return idle();
    }
    if (weary >= 1) {
      resting = true;
    }
    if (resting) {
      if (weary > 0.35) {
        return sitOut(between(2.5, 4.5));
      }
      resting = false;
    }
    if (cr.landT > 0.4) {
      /* Down and still. A pounce at it, a sniff of it, and then it is
       * furniture: sat by, washed beside, blinked at. */
      landVisit += 1;
      if (landVisit === 1) {
        return planFor(rnd() < 0.6 ? PL.ground : PL.sniff) ? enter(DO.stalk) : sitOut(2);
      }
      if (!sniffed) {
        return planFor(PL.sniff) ? enter(DO.stalk) : sitOut(2);
      }
      if (landVisit > 7) {
        /* It has been there for ever. The cat has a life of its own. */
        bored = true;
        return idle();
      }
      const r = rnd();
      if (r < 0.28) {
        return enter(DO.adore);
      }
      if (r < 0.42 && lawn.stay(c.x, c.z, 0.2 * S)) {
        washDry = false;
        dur = between(2.5, 4.5);
        return enter(DO.groom);
      }
      if (r < 0.58) {
        return planFor(PL.ground) ? enter(DO.stalk) : sitOut(2);
      }
      if (r < 0.76) {
        /* A paw put out to it, to see if it is dead. */
        return planFor(PL.swat) ? enter(DO.stalk) : sitOut(2);
      }
      return sitOut(between(3, 6));
    }
    if (cr.lineT > 0.4 && cr.sp >= 0.45 * S && pickWait()) {
      return enter(DO.stalk);
    }
    if (cr.hoverT > 0.35) {
      /* Hanging in the air: by how high. Low is pounced at or batted from
       * all fours, higher is stood up to and batted, higher still is leapt
       * at, and out of reach is only looked at. */
      if (cr.y > 2.0 * S) {
        return enter(DO.watch);
      }
      /* Coming this way, low and slow, and still a pounce or two off: the
       * cat lets it come. Down where it stands, the wiggle building as it
       * nears, and out at it when it is in reach. Once a visit: after that
       * it goes and gets it. */
      if (!letCome && cr.closing > 0.15 * S && cr.y < 0.95 * S && cr.dh > cr.keep + 1.2 * S && cr.dh < cr.keep + 4.6 * S
        && lawn.stay(c.x, c.z, 0.2 * S)) {
        letCome = true;
        plan.kind = PL.low;
        plan.hurry = false;
        plan.wait = true;
        plan.x = c.x;
        plan.z = c.z;
        plan.cx = cr.x;
        plan.cz = cr.z;
        plan.made = now;
        lastKind = PL.none;
        sameRun = 0;
        swatRun = 0;
        wiggled = false;
        moves.lieInWait += 1;
        return enter(DO.crouch);
      }
      let kind = PL.leap;
      if (cr.y < 0.42 * S) {
        /* From a way off it is pounced at; from where a pounce comes down
         * it is batted, twice or so, before the cat goes back for another
         * run at it. */
        const near = cr.dh < cr.keep + 1.0 * S;
        kind = near ? (swatRun < 2 ? PL.swat : PL.low) : rnd() < 0.7 ? PL.low : PL.swat;
      } else if (cr.y < 0.95 * S) {
        kind = swatRun < 3 && rnd() < 0.8 ? PL.swat : PL.leap;
      }
      swatRun = kind === PL.swat ? swatRun + 1 : 0;
      /* The same thing three times running is a machine and not a cat: it
       * sits back and looks at the craft for a bit first. */
      sameRun = kind === lastKind ? sameRun + 1 : 0;
      lastKind = kind;
      if (sameRun >= 2) {
        sameRun = 0;
        lastKind = PL.none;
        swatRun = 0;
        return sitOut(between(2.2, 4.2));
      }
      if (planFor(kind) || (kind === PL.low && planFor(PL.swat))) {
        return enter(DO.stalk);
      }
      return enter(DO.watch);
    }
    /* Going somewhere, and not round the line: run down if it is low and
     * slow and near enough to be worth it, else watched. */
    if (cr.sp > 0.7 * S && cr.sp < 2.4 * S && cr.y < 1.2 * S && cr.dh < 3.2 * S && weary < 0.7 && lawn.free(cr.x, cr.z)) {
      return enter(DO.chase);
    }
    return enter(DO.watch);
  }

  /*
   * SOMETHING COMING. How near the craft will come to the cat in the next
   * moments, going as it goes (round the line if it is flying the line),
   * measured against the balls of the body as it was last posed: 0 nothing,
   * 1 it will pass over (duck), 2 it will not (get out of the way), 3 it is
   * crowding in slowly (give ground). A cat that is set to spring, or
   * springing, has made its own arrangements about how near the craft
   * comes, and only minds one that is going to hit it.
   */
  const thr = { nx: 0, nz: 0, late: 0 };
  function threat() {
    if (!cr.on || cr.dh > 6 * S) {
      return 0;
    }
    const P = rig.probes;
    const n = P.length / 4;
    const far = (1.2 * S + cr.keep) * (1.2 * S + cr.keep);
    let best = 1e9;
    let bt = 0;
    let bx = 0;
    let bz = 0;
    let by = cr.y;
    const m = cr.sp > 0.2 * S ? 7 : 1;
    for (let k = 0; k < m; k += 1) {
      const t = k * 0.07;
      predict(t);
      /* Where it will be against where the cat will be, going as it goes. */
      const px = pr.x - c.vx * t;
      const pz = pr.z - c.vz * t;
      if ((px - c.x) * (px - c.x) + (pz - c.z) * (pz - c.z) > far) {
        continue;
      }
      for (let i = 0; i < n; i += 1) {
        const dx = P[i * 4] - px;
        const dy = P[i * 4 + 1] - pr.y;
        const dz = P[i * 4 + 2] - pz;
        const gap = Math.sqrt(dx * dx + dy * dy + dz * dz) - P[i * 4 + 3] - cr.keep;
        if (gap < best) {
          best = gap;
          bt = t;
          bx = dx;
          bz = dz;
          by = pr.y;
        }
      }
    }
    if (best > 0.5 * S) {
      return 0;
    }
    thr.late = bt;
    if (cr.hs > 0.5 * S) {
      /* Going somewhere: what matters is which side of its way the cat is
       * on, not how far along it. */
      const al = (bx * cr.vx + bz * cr.vz) / (cr.hs * cr.hs);
      bx -= cr.vx * al;
      bz -= cr.vz * al;
    }
    const oh = Math.hypot(bx, bz);
    if (oh > 0.02 * S) {
      thr.nx = bx / oh;
      thr.nz = bz / oh;
    } else if (cr.hs > 1e-3) {
      /* Dead under it or dead ahead of it: aside from the way it goes. */
      thr.nx = -cr.vz / cr.hs;
      thr.nz = cr.vx / cr.hs;
    } else {
      thr.nx = Math.sin(c.yaw);
      thr.nz = Math.cos(c.yaw);
    }
    const set = st === DO.crouch || st === DO.pounce || st === DO.leap || st === DO.swat || st === DO.sniff;
    if (cr.sp >= 1.0 * S) {
      if (bt > 0.03 && best < (set ? 0 : 0.12 * S)) {
        return by >= cr.keep + (FLAT_TOP + 0.07) * S ? 1 : 2;
      }
      return 0;
    }
    /* Slow, near, and coming on: the pilot is pushing in. One that hangs
     * still beside the cat is the cat's own business. */
    const d = Math.max(1e-3, cr.dh);
    const closing = bt > 0.03 || -(cr.vx * cr.dx + cr.vz * cr.dz) / d > 0.1 * S;
    return closing && best < (set ? 0.03 * S : 0.16 * S) ? 3 : 0;
  }
  /* The jump out of the way: to somewhere it may land, the best of a few
   * ways round from straight away and of a short jump and a long one, by
   * how far the craft will pass from there in the next moments and by
   * choice off where runs are flown. */
  function dodge() {
    let best = -1;
    let bs = -1e18;
    for (let k = 0; k < 18; k += 1) {
      const h = k >> 1;
      const a = h === 0 ? 0 : (h % 2 === 1 ? 1 : -1) * Math.ceil(h / 2) * 0.6;
      const reach = (k & 1 ? 1.0 : 0.62) * S;
      const x = c.x + (thr.nx * Math.cos(a) - thr.nz * Math.sin(a)) * reach;
      const z = c.z + (thr.nx * Math.sin(a) + thr.nz * Math.cos(a)) * reach;
      if (!canLand(x, z, 0.14 * S)) {
        continue;
      }
      let near = 3 * S;
      if (cr.hs > 0.5 * S && !(cr.li >= 0 && cr.lineT > 0.25)) {
        /* Going straight: how far to the side of its way, all the way on. */
        const rx = x - cr.x;
        const rz = z - cr.z;
        const al = (rx * cr.vx + rz * cr.vz) / cr.hs;
        near = Math.min(near, al > -0.3 * S ? Math.abs(rx * cr.vz - rz * cr.vx) / cr.hs : Math.hypot(rx, rz));
      } else {
        for (let i = 0; i <= 8; i += 1) {
          predict(i * 0.14);
          if (pr.y < 1.6 * S) {
            near = Math.min(near, Math.hypot(pr.x - x, pr.z - z));
          }
        }
      }
      /* And how near it comes to the cat on the way there: a jump across
       * its bows is no jump out of its way. */
      const T = k & 1 ? 0.404 : 0.326;
      for (let i = 1; i <= 4; i += 1) {
        predict((T * i) / 4);
        if (pr.y < 1.6 * S) {
          near = Math.min(near, Math.hypot(pr.x - lerp(c.x, x, i / 4), pr.z - lerp(c.z, z, i / 4)) + 0.2 * S);
        }
      }
      /* How far the craft will pass is what counts, up to plenty; then the
       * shorter jump, straighter away, off the lanes. */
      const sc = Math.min(near, cr.keep + 0.9 * S) - Math.abs(a) * 0.05 * S - (lawn.lane(x, z) ? 0.2 * S : 0) - (k & 1 ? 0.12 * S : 0);
      if (sc > bs) {
        bs = sc;
        best = k;
      }
    }
    if (best < 0) {
      return false;
    }
    const h = best >> 1;
    const a = h === 0 ? 0 : (h % 2 === 1 ? 1 : -1) * Math.ceil(h / 2) * 0.6;
    const reach = (best & 1 ? 1.0 : 0.62) * S;
    hopTo(c.x + (thr.nx * Math.cos(a) - thr.nz * Math.sin(a)) * reach, c.z + (thr.nx * Math.sin(a) + thr.nz * Math.cos(a)) * reach, best & 1 ? 0.2 : 0.13, 0);
    return true;
  }
  function startle() {
    enter(DO.startle);
    reflexAt = now;
    moves.startle += 1;
    fear = 1;
    weary += 0.04;
    if (now - bangAt > 2.5 && cr.dh > 1.4 * S) {
      mark(MARK.bang, 0.8);
      bangAt = now;
    }
    if (!dodge()) {
      /* Nowhere to jump: down flat, and settle() does the rest. */
      phase(3);
    }
    return DO.startle;
  }
  /* True if it dropped what it was doing for the craft. */
  function reflex() {
    if (hop.on || st === DO.escape) {
      return false;
    }
    if (st === DO.startle) {
      /* Frightened already, and it is still coming: down, or off again. */
      if (ph === 0 || now - reflexAt < 0.3) {
        return false;
      }
      pushedNow = false;
      const again = threat();
      if (again === 1) {
        moves.duck += 1;
        enter(DO.duck);
        return true;
      }
      if (again === 2) {
        startle();
        return true;
      }
      return false;
    }
    if (pushedNow) {
      /* It was moved off the craft: carry on that way of its own accord,
       * with a jump if the craft came fast and on its feet if it crept. */
      pushedNow = false;
      if (cr.sp > 0.8 * S) {
        thr.nx = pushX;
        thr.nz = pushZ;
        thr.late = 0;
        startle();
        return true;
      }
      if (st !== DO.backoff && st !== DO.duck && st !== DO.flee) {
        moves.backoff += 1;
        enter(DO.backoff);
        return true;
      }
      return false;
    }
    if (cr.tookOff && cr.dh < cr.keep + 1.1 * S) {
      thr.nx = -cr.dx / Math.max(1e-3, cr.dh);
      thr.nz = -cr.dz / Math.max(1e-3, cr.dh);
      thr.late = 0;
      startle();
      return true;
    }
    const th = threat();
    if (th === 0) {
      return false;
    }
    if (th === 1) {
      if (st !== DO.duck) {
        moves.duck += 1;
        const back = st;
        enter(DO.duck);
        /* An ambush is taken up again once it has gone over. */
        ph = back === DO.crouch || back === DO.stalk ? 1 : 0;
      }
      phT = 0;
      return true;
    }
    if (th === 2) {
      if (st === DO.swat && ph === 2) {
        /* Mid bat and it has come on: the bat is the answer, and settle()
         * the rest. */
        return false;
      }
      startle();
      return true;
    }
    /* Crowded: back away from it. */
    if (st === DO.backoff || st === DO.flee || st === DO.duck || now - reflexAt < 0.4) {
      return false;
    }
    moves.backoff += 1;
    enter(DO.backoff);
    return true;
  }

  /* THE STATES. Each asks for a posture, a look and a tail, and says when
   * it is done. */
  function doSit(dt) {
    pose(POSTURE.sit, 0.15);
    if (prey()) {
      eyes(1);
      /* Round to it if it has got behind: a neck only goes so far. */
      if (perch && !aimed(yawTo(cr.x, cr.z), 1.3)) {
        turnTo(yawTo(cr.x, cr.z));
      }
      c.twitch = perch ? 0.9 : 0.4;
      ears = perch ? 1 : 0;
      pupilT = basePupil + 0.15;
      if (perch && weary > 0.5) {
        /* Annoyed at having been outflown: the tail thumps. */
        c.wag = 0.5;
        c.wagHz = 1.1;
      }
      if (!perch) {
        return enter(DO.notice);
      }
    } else {
      gazeAbout(dt);
      lidT = 0.12;
    }
    if (stT > dur) {
      return prey() ? hunt() : idle();
    }
    return st;
  }
  function doGroom(dt) {
    pose(POSTURE.sit, 0.15);
    lidT = 0.55;
    ears = 0;
    if (ph === 0) {
      if (stT === 0 || phT === dt) {
        moves.groom += 1;
      }
      /* A fore paw up to the mouth, licked, the head nodding at it. */
      rig.at('mouth', at3);
      c.freeL = 1;
      c.reachL = 1;
      c.pawLX = at3[0] + Math.cos(c.yaw) * 0.012 * S;
      c.pawLY = at3[1] - 0.012 * S;
      c.pawLZ = at3[2] - Math.sin(c.yaw) * 0.012 * S;
      c.toeL = 0.9;
      const nod = Math.sin(phT * 7.5);
      lookAt(c.x + Math.cos(c.yaw) * 0.3 * S, (0.2 + 0.035 * nod) * S, c.z - Math.sin(c.yaw) * 0.3 * S, 1);
      c.jaw = 0.07 + 0.05 * Math.max(0, nod);
      if (phT > dur * 0.55) {
        phase(1);
      }
    } else {
      /* And the shoulder: head round and down, nodding. */
      const side = 1;
      const nod = Math.sin(phT * 7.5);
      const a = c.yaw - side * 2.1;
      lookAt(c.x + Math.cos(a) * 0.2 * S, (0.16 + 0.03 * nod) * S, c.z - Math.sin(a) * 0.2 * S, 1);
      c.jaw = 0.06 + 0.04 * Math.max(0, nod);
      if (phT > dur * 0.45) {
        return prey() ? hunt() : idle();
      }
    }
    /* A wash is dropped for a craft only if it was a real one. */
    if (!washDry && prey() && !cr.down && stT > 0.6) {
      return enter(DO.notice);
    }
    return st;
  }
  function doLoaf(dt) {
    pose(POSTURE.loaf, 0.2);
    ears = 0;
    lidT = stT > 2.5 ? 1 : 0.7;
    if (stT > 3.5) {
      if (!asleep) {
        asleep = true;
        moves.sleep += 1;
      }
      if (m.mark !== MARK.zzz || m.markT > m.markDur - 0.3) {
        mark(MARK.zzz, 4);
      }
    }
    if (prey() && !(cr.down && landVisit > 1)) {
      /* Woken: an ear first, then the eyes. */
      if (ph === 0) {
        phase(1);
      }
      ears = 1;
      lidT = phT > 0.25 ? 0 : 0.6;
      if (phT > 0.45) {
        asleep = false;
        unmark(MARK.zzz);
        return enter(DO.notice);
      }
      return st;
    }
    if (ph === 1) {
      phase(0);
    }
    if (stT > dur) {
      asleep = false;
      unmark(MARK.zzz);
      return prey() ? hunt() : enter(DO.stretch);
    }
    return st;
  }
  function doStretch() {
    ears = 0;
    if (ph === 0) {
      /* The bow: fore legs out, rump up, toes spread. */
      if (phT === 0) {
        moves.stretch += 1;
      }
      pose(POSTURE.bow, 0.22);
      clawLT = 1;
      clawRT = 1;
      lidT = 0.6;
      c.tailUp = 0.2;
      if (phT > 1.7) {
        phase(1);
        moves.yawn += 1;
      }
    } else {
      /* Up, and a yawn that shuts its eyes. */
      pose(POSTURE.stand, 0.2);
      const y = Math.sin(Math.PI * clamp(phT / 1.3, 0, 1));
      c.jaw = 0.8 * y;
      lidT = y > 0.3 ? 1 : 0.2;
      ears = y > 0.3 ? 3 : 0;
      lookAt(c.x + Math.cos(c.yaw) * 2 * S, (0.3 + 0.25 * y) * S, c.z - Math.sin(c.yaw) * 2 * S, 0.8);
      if (phT > 1.45) {
        return prey() ? hunt() : idle();
      }
    }
    if (prey() && !cr.down && ph === 0 && phT > 0.3) {
      return enter(DO.notice);
    }
    return st;
  }
  function doWander() {
    pose(POSTURE.stand, 0.12);
    c.tailUp = 1.05;
    ears = 0;
    if (!go.on && !go.arrived) {
      /* Somewhere to rest that is not here, by choice not far. */
      let best = -1;
      let bs = 1e18;
      for (let k = 0; k < 6 && lawn.rests > 0; k += 1) {
        const r = Math.floor(rnd() * lawn.rests);
        const d = Math.hypot(lawn.restX[r] - c.x, lawn.restZ[r] - c.z);
        const s = Math.abs(d - 1.4 * S);
        if (s < bs && d > 0.5 * S && !lap(lawn.restX[r], lawn.restZ[r])) {
          bs = s;
          best = r;
        }
      }
      if (best < 0 || go.failed) {
        spotTry += 1;
        if (best < 0 || spotTry > 3) {
          spotTry = 0;
          dur = between(3, 6);
          return enter(DO.sit);
        }
      }
      goTo(lawn.restX[best], lawn.restZ[best], WALK);
    }
    lookAt(go.wx, 0.25 * S, go.wz, 0.4);
    if (go.arrived) {
      spotTry = 0;
      dur = between(3, 6);
      return prey() ? hunt() : enter(DO.sit);
    }
    if (prey() && !cr.down && stT > 0.4) {
      return enter(DO.notice);
    }
    return st;
  }
  function doNotice() {
    /* The head snaps to it, the ears come forward, and it is up. */
    pose(POSTURE.stand, 0.07);
    eyes(1);
    ears = 1;
    pupilT = 0.8;
    c.whisk = 0.6;
    unblinking = true;
    if (stT === 0 && now - bangAt > 5) {
      mark(MARK.bang, 0.9);
      bangAt = now;
    }
    if (stT > 0.5) {
      return hunt();
    }
    return st;
  }
  function doWatch(dt) {
    if (!cr.on || !cr.yard) {
      return cr.on || cr.awayT > 1.5 ? idle() : enter(DO.lost);
    }
    /* Off the lane first: nobody watches from where it is flown. */
    if (!lawn.stay(c.x, c.z, 0.2 * S) && !go.failed) {
      if (!go.on && !go.arrived) {
        const k = clearSpot(0.3 * S);
        if (k >= 0) {
          goTo(lawn.cellX(k), lawn.cellZ(k), SLINK);
        }
      }
      pose(POSTURE.stand, 0.1);
    } else {
      pose(stT > 0.6 && cr.dh > 1.6 * S ? POSTURE.sit : POSTURE.stand, 0.14);
      turnTo(yawTo(cr.x, cr.z));
    }
    eyes(1);
    ears = 1;
    pupilT = basePupil + 0.25;
    c.twitch = 0.9;
    c.whisk = 0.4;
    /* The head on one side now and then: what IS that. */
    tiltT -= dt;
    if (tiltT < -between(2.5, 5)) {
      tiltT = 0.9;
      tiltSide = rnd() < 0.5 ? -1 : 1;
      moves.tilt += 1;
    }
    if (tiltT > 0) {
      c.tilt = 0.38 * tiltSide * Math.min(1, tiltT / 0.2, (0.9 - tiltT) / 0.2 + 0.2);
    }
    /* Out of reach: the chatter. */
    const high = cr.y > 2.0 * S || (cr.hs < 0.7 * S && !lawn.free(cr.x, cr.z));
    if (high && stT > 0.8) {
      chatterT -= dt;
      if (chatterT < -between(0.6, 1.6)) {
        chatterT = between(1.0, 1.8);
        moves.chatter += 1;
      }
      if (chatterT > 0) {
        c.jaw = 0.05 + 0.045 * Math.sin(now * 58);
        c.whisk = 1;
        c.twitch = 1;
        pupilT = 0.9;
      }
    }
    if (stT > dur && !high) {
      dur = between(0.7, 1.8);
      return hunt();
    }
    if (stT > 9 && high) {
      /* It will not come down: lose interest for a while. */
      return sitOut(between(3, 6));
    }
    return st;
  }
  /* Getting to where the plan works from. */
  function doStalk(dt) {
    if (!cr.on || !cr.yard) {
      return cr.jumped || !cr.on ? enter(DO.lost) : hunt();
    }
    const k = plan.kind;
    eyes(1);
    ears = 1;
    unblinking = true;
    c.whisk = 0.7;
    c.twitch = 1;
    pupilT = 0.75;
    if (stT === 0) {
      moves.stalk += 1;
      freezes = 0;
    }
    if (k === PL.ambush) {
      /* It has stopped, gone by, or left the line: think again. */
      if (cr.sp < 0.4 * S) {
        return hunt();
      }
      const eta = etaTo();
      if (now - plan.made > 0.6 && (eta < -0.1 || eta > 20)) {
        return eta < 0 ? hunt() : enter(DO.watch);
      }
    } else {
      /* The craft has moved from where the plan was made for. */
      const moved = Math.hypot(cr.x - plan.cx, cr.z - plan.cz);
      const landed = cr.landT > 0.4;
      if ((k === PL.ground || k === PL.sniff) !== landed || (k !== PL.ground && k !== PL.sniff && cr.sp > 1.3 * S)) {
        return hunt();
      }
      if (moved > 0.3 * S && now - plan.made > 0.35) {
        if (!planFor(k)) {
          return enter(DO.watch);
        }
        go.on = false;
      }
    }
    const gd = Math.hypot(plan.x - c.x, plan.z - c.z);
    /* Flat out if there is a way to go or no time, a low trot from one
     * stop to the next, and the last of it on its belly: but only toward
     * the craft. Going back from it for another run it trots. */
    const toward = Math.hypot(plan.x - cr.x, plan.z - cr.z) < cr.dh + 0.2 * S;
    let speed = SLINK;
    if (plan.hurry ? gd > 0.8 * S : gd > 3.2 * S) {
      speed = RUN;
      pose(POSTURE.stand, 0.1);
      weary += 0.05 * dt;
    } else if (gd > 1.3 * S || plan.hurry || !toward) {
      pose(POSTURE.creep, 0.1);
    } else {
      speed = CREEP;
      pose(POSTURE.creep, 0.12);
      c.low = 0.6;
    }
    /* Stopped dead while the pilot looks at it, a paw in the air if one
     * was: then on again, and it has to go a way before it stops again. */
    if (frozen) {
      freezeT -= dt;
      c.still = true;
      speed = 0;
      pupilT = 0.95;
      if (freezeT <= 0 || !cr.eyeOn) {
        frozen = false;
        freezeGap = between(1.0, 1.8);
      }
    } else {
      freezeGap -= dt;
      if (!plan.hurry && speed === CREEP && cr.eyeOn && freezes < 3 && freezeGap <= 0 && cr.sp < 0.6 * S && (rig.poised() || stT > 0.5)) {
        frozen = true;
        freezes += 1;
        freezeT = between(0.9, 2.1);
        moves.freeze += 1;
      }
    }
    if (speed > 0) {
      goTo(plan.x, plan.z, speed);
    } else {
      go.on = false;
    }
    if (go.failed) {
      return enter(DO.watch);
    }
    if (go.arrived || gd <= 0.06 * S) {
      if (k === PL.swat) {
        return enter(DO.swat);
      }
      if (k === PL.sniff) {
        return enter(DO.sniff);
      }
      crouchFor = k === PL.ambush ? 99 : between(1.0, 1.7);
      wiggled = false;
      return enter(DO.crouch);
    }
    return st;
  }
  /* Set to spring: the wiggle, the treading feet, the eyes. */
  function doCrouch() {
    if (!cr.on || !cr.yard) {
      return cr.jumped || !cr.on ? enter(DO.lost) : hunt();
    }
    const k = plan.kind;
    pose(POSTURE.crouch, 0.1);
    c.low = 0.3;
    eyes(1);
    ears = 1;
    unblinking = true;
    c.whisk = 1;
    let build = 0;
    if (k === PL.ambush) {
      const eta = etaTo();
      build = smooth((2.2 - eta) / 1.4);
      if (eta < -0.3 || stT > 14 || (eta > 20 && stT > 2) || (cr.sp < 0.4 * S && stT > 1.5)) {
        /* Gone by, never coming, or stopped: another plan. */
        return hunt();
      }
      if (plan.sub === AM.leap) {
        /* In at it as it comes, to land short of where it will pass and a
         * moment before it does. */
        const yaw = yawTo(plan.lx, plan.lz);
        turnTo(yaw);
        const d = Math.hypot(plan.lx - c.x, plan.lz - c.z);
        const H = clamp(0.1 + 0.16 * (d / S), 0.14, 0.36);
        const T = Math.max(0.16, Math.sqrt((8 * H) / G));
        if (eta <= T + 0.1 && stT > 0.3 && aimed(yaw, 0.4)) {
          /* Only if the craft is keeping to its line: where it will pass
           * must leave the landing its air. */
          predict(Math.max(0, eta));
          if (Math.hypot(pr.x - plan.lx, pr.z - plan.lz) >= cr.keep + (NOSE + 0.03) * S && canLand(plan.lx, plan.lz, 0.1 * S)) {
            hopTo(plan.lx, plan.lz, H, 0);
            moves.pounce += 1;
            weary += 0.25;
            return enter(DO.pounce);
          }
          /* It is wide of its line, and on the cat's side: let it go by. */
          plan.sub = AM.swat;
        }
      } else if (plan.sub === AM.swat) {
        /* Up on its hind legs as it comes, and a bat at it as it passes. */
        turnTo(yawTo(plan.cx, plan.cz));
        if (eta <= 0.5 && stT > 0.3) {
          bats = 2;
          return enter(DO.swat);
        }
      } else {
        /* Under the line: straight up at it, the top of the leap as it goes
         * over, as high as leaves the craft its air. */
        turnTo(yawTo(cr.x, cr.z));
        const H = clamp((plan.h - cr.keep - 0.06 * S) / S - UP_TOP, 0, 1.2);
        const T = Math.sqrt((8 * Math.max(H, 0.05)) / G);
        if (eta <= T / 2 + 0.03 && stT > 0.3) {
          if (H < 0.1) {
            bats = 2;
            return enter(DO.swat);
          }
          hopTo(c.x, c.z, H, 1);
          moves.leap += 1;
          weary += 0.3;
          return enter(DO.leap);
        }
      }
    } else {
      turnTo(yawTo(cr.x, cr.z));
      const landed = cr.landT > 0.4;
      /* How far off a pounce can start from and still come down by it. */
      const reach = cr.keep + (NOSE + 0.1) * S + 1.5 * S;
      let ready = stT > crouchFor;
      if (plan.wait) {
        /* Letting it come: set as it nears, and off when it is in reach. If
         * it stops coming, or turns away, the cat goes to it instead. */
        build = smooth((reach + 1.6 * S - cr.dh) / (1.4 * S)) * smooth(stT / 0.5);
        ready = cr.dh < reach && stT > 0.7;
        if (!ready && (stT > 7 || (cr.closing < 0.05 * S && stT > 1.2))) {
          return hunt();
        }
      } else {
        build = smooth((stT - 0.2) / 0.6);
      }
      if ((k === PL.ground) !== landed || cr.sp > 1.3 * S || cr.dh > cr.keep + (plan.wait ? 5.2 : 3.2) * S) {
        return hunt();
      }
      if (ready && aimed(yawTo(cr.x, cr.z), 0.35)) {
        if (k === PL.leap) {
          /* Straight up in front of it, as high as it is: paws in the
           * pilot's face, and a cat's length short of touching. */
          const H = clamp(cr.y / S - UP_TOP + 0.04, 0, 1.2);
          if (H < 0.12) {
            return enter(DO.swat);
          }
          hopTo(c.x, c.z, H, 1);
          moves.leap += 1;
          weary += 0.3;
          return enter(DO.leap);
        }
        /* At it along the ground, to come down short of where it will be by
         * its air and the cat's own nose. */
        const px = cr.x + cr.vx * 0.42;
        const pz = cr.z + cr.vz * 0.42;
        const dx = px - c.x;
        const dz = pz - c.z;
        const d = Math.max(1e-3, Math.hypot(dx, dz));
        const far = clamp(d - cr.keep - (NOSE + 0.1) * S, 0, 1.7 * S);
        if (far < 0.3 * S) {
          return enter(DO.swat);
        }
        const bx = c.x + (dx / d) * far;
        const bz = c.z + (dz / d) * far;
        if (!canLand(bx, bz, 0.1 * S)) {
          return enter(DO.swat);
        }
        hopTo(bx, bz, clamp(0.14 + 0.12 * (far / (1.7 * S)), 0.12, 0.3), 0);
        moves.pounce += 1;
        weary += 0.25;
        return enter(DO.pounce);
      }
    }
    /* The wiggle builds, the hind feet tread, the tail lashes and the
     * pupils open all the way: the owner's "wiggle butt and big eyes". */
    c.wiggle = build;
    c.tread = build;
    c.twitch = 1;
    c.wag = 0.3 * build;
    c.wagHz = 2.3;
    pupilT = lerp(0.8, 1, build);
    sparkT = build;
    if (build > 0.9 && !wiggled) {
      wiggled = true;
      moves.wiggle += 1;
      moves.bigEyes += 1;
      mark(MARK.spark, 0.7);
    }
    return st;
  }
  /* In the air, paws out. */
  function doPounce(dt) {
    eyes(1);
    ears = 1;
    unblinking = true;
    pupilT = 1;
    sparkT = 1;
    if (ph === 0) {
      const flying = hopStep(dt);
      const s = hop.t / hop.T;
      c.jaw = 0.14 * smooth(s / 0.3);
      clawLT = s > 0.2 && s < 0.8 ? 1 : 0;
      clawRT = clawLT;
      c.whisk = 1;
      /* A grab at it through the top of the leap, if it is near enough to
       * grab at: stopped short as a bat is. */
      if (cr.on && s > 0.25 && s < 0.7) {
        reachAt(0, true);
        reachAt(1, true);
      }
      if (!flying) {
        c.x = hop.bx;
        c.z = hop.bz;
        phase(1);
        wantSwipe = SWIPE.star;
        wantSwipePaw = 2;
      }
    } else {
      /* Down: the legs give, and a paw goes out after it as it passes, if
       * it passes in reach. */
      pose(POSTURE.crouch, 0.06);
      c.give = 1 - smooth(phT / 0.2);
      if (cr.on && phT > 0.04 && phT < 0.45) {
        const paw = Math.sin(c.yaw) * cr.dx + Math.cos(c.yaw) * cr.dz < 0 ? 0 : 1;
        if (reachAt(paw, true)) {
          if (paw === 0) {
            clawLT = 1;
          } else {
            clawRT = 1;
          }
        }
      }
      if (phT > 0.5) {
        misses += 1;
        return enter(DO.recover);
      }
    }
    return st;
  }
  /* Straight up, both paws over its head. */
  function doLeap(dt) {
    eyes(1);
    ears = 1;
    unblinking = true;
    pupilT = 1;
    sparkT = 1;
    if (ph === 0) {
      const flying = hopStep(dt);
      const s = hop.t / hop.T;
      clawLT = s > 0.3 && s < 0.75 ? 1 : 0;
      clawRT = clawLT;
      c.jaw = 0.12;
      if (s >= 0.5 && s - dt / hop.T < 0.5) {
        /* The clap, on nothing. */
        wantSwipe = SWIPE.star;
        wantSwipePaw = 2;
      }
      if (!flying) {
        c.x = hop.bx;
        c.z = hop.bz;
        phase(1);
      }
    } else {
      pose(POSTURE.crouch, 0.07);
      c.give = 1 - smooth(phT / 0.25);
      if (phT > 0.4) {
        misses += 1;
        return enter(DO.recover);
      }
    }
    return st;
  }
  /*
   * A paw sent at the craft and stopped short of it: the place on the line
   * from the craft to the shoulder that leaves the craft its air and the
   * paw its own size, however the craft moves. `soft` is a reach that is
   * only made if the craft is within an arm of it.
   */
  function reachAt(paw, soft) {
    rig.at(paw === 0 ? 'shoulderL' : 'shoulderR', at3);
    let ux = at3[0] - cr.x;
    let uy = at3[1] - cr.y;
    let uz = at3[2] - cr.z;
    const d = Math.hypot(ux, uy, uz);
    if (d < 1e-3) {
      return false;
    }
    const stand = cr.keep + 0.075 * S;
    if (soft && d > stand + 0.3 * S) {
      return false;
    }
    ux /= d;
    uy /= d;
    uz /= d;
    const x = cr.x + ux * stand;
    const y = Math.max(0.03 * S, cr.y + uy * stand);
    const z = cr.z + uz * stand;
    if (paw === 0) {
      c.freeL = 1;
      c.reachL = 1;
      c.pawLX = x;
      c.pawLY = y;
      c.pawLZ = z;
      c.toeL = 0.5;
    } else {
      c.freeR = 1;
      c.reachR = 1;
      c.pawRX = x;
      c.pawRY = y;
      c.pawRZ = z;
      c.toeR = 0.5;
    }
    return true;
  }
  /* Up on its hind legs, batting: one paw, then the other. */
  function doSwat(dt) {
    if (!cr.on) {
      return enter(DO.lost);
    }
    const near = cr.dh < cr.keep + 1.3 * S && cr.y < 1.6 * S;
    const up = cr.y > 0.3 * S;
    eyes(1);
    ears = 3;
    unblinking = true;
    pupilT = 0.95;
    c.whisk = 1;
    c.wag = 0.55;
    c.wagHz = 3;
    turnTo(yawTo(cr.x, cr.z));
    pose(up ? POSTURE.rear : POSTURE.stand, 0.08);
    if (up) {
      c.freeL = 1;
      c.freeR = 1;
    }
    if (ph === 0) {
      /* Up. */
      if (phT === 0) {
        moves.swat += 1;
        weary += 0.12;
        if (bats <= 0) {
          bats = 2 + Math.floor(rnd() * 4);
        }
        /* The paw on the craft's side first. */
        batPaw = Math.sin(c.yaw) * cr.dx + Math.cos(c.yaw) * cr.dz < 0 ? 0 : 1;
      }
      if (phT > (up ? 0.3 : 0.12)) {
        phase(1);
      }
    } else if (ph === 1) {
      /* Drawn back. */
      if (batPaw === 0) {
        c.freeL = 1;
      } else {
        c.freeR = 1;
      }
      if (!near) {
        phase(4);
      } else if (phT > 0.12) {
        phase(2);
        moves.bat += 1;
      }
    } else if (ph === 2) {
      /* Out at it, claws and all, and held there a moment as it would be
       * in the thing it hit: it follows the craft, so the craft moving is
       * the swipe. */
      reachAt(batPaw, false);
      if (batPaw === 0) {
        clawLT = 1;
      } else {
        clawRT = 1;
      }
      c.jaw = 0.1;
      if (phT > 0.07 && phT - dt <= 0.07) {
        wantSwipe = SWIPE.arcs;
        wantSwipePaw = batPaw;
      }
      if (phT > 0.16) {
        phase(3);
      }
    } else if (ph === 3) {
      /* Back, and the other paw. */
      if (phT > between(0.1, 0.22)) {
        bats -= 1;
        batPaw = 1 - batPaw;
        phase(bats > 0 && near ? 1 : 4);
      }
    } else {
      /* Down again. */
      pose(POSTURE.stand, 0.1);
      c.freeL = 0;
      c.freeR = 0;
      if (phT > 0.25) {
        bats = 0;
        misses += 1;
        return enter(DO.recover);
      }
    }
    return st;
  }
  /* After it, flat out, for as long as there is any hope. */
  function doChase(dt) {
    if (!cr.on || !cr.yard) {
      return cr.jumped || !cr.on ? enter(DO.lost) : enter(DO.watch);
    }
    if (stT === 0) {
      moves.chase += 1;
    }
    pose(POSTURE.stand, 0.1);
    eyes(1);
    ears = 1;
    unblinking = true;
    pupilT = 0.9;
    weary += 0.1 * dt;
    /* A place behind it, short of it by its air and the cat's length. */
    const hs = Math.max(0.2 * S, cr.hs);
    const back = cr.keep + (NOSE + 0.35) * S;
    const tx = cr.x - (cr.vx / hs) * back;
    const tz = cr.z - (cr.vz / hs) * back;
    if (lawn.free(tx, tz)) {
      goTo(tx, tz, RUN);
    } else {
      go.on = false;
    }
    if (stT > 2.6 || cr.dh > 3.6 * S || cr.y > 1.6 * S || go.failed || !lawn.free(tx, tz) || cr.sp > 3.2 * S) {
      /* Given up: pulled up short in its own dust. */
      wantPuff = 1;
      return enter(DO.watch);
    }
    if (cr.sp < 0.8 * S && cr.dh < cr.keep + 1.6 * S) {
      return hunt();
    }
    return st;
  }
  /* After a miss. */
  function doRecover() {
    pose(POSTURE.stand, 0.12);
    ears = 1;
    if (cr.on) {
      eyes(1);
    }
    pupilT = 0.7;
    c.twitch = 1;
    if (stT < 0.35) {
      return st;
    }
    if (!cr.on || !cr.yard) {
      return cr.on ? enter(DO.watch) : enter(DO.lost);
    }
    /* It is getting away low and slow enough to run down. */
    if (!cr.down && cr.sp > 0.9 * S && cr.sp < 2.6 * S && cr.y < 1.2 * S && cr.dh < 2.6 * S && weary < 0.8 && rnd() < 0.7) {
      return enter(DO.chase);
    }
    if (misses >= 3 && rnd() < 0.5) {
      /* Three times now. A wash, as if it had meant to do that. */
      misses = 0;
      return washOff(between(1.8, 2.8), rnd() < 0.5 ? MARK.sweat : MARK.vein);
    }
    return hunt();
  }
  /* The fright. */
  function doStartle(dt) {
    ears = 2;
    unblinking = true;
    pupilT = 1;
    fear = Math.max(fear, 0.85);
    if (cr.on) {
      eyes(1);
    }
    if (ph === 0) {
      /* The jump, turning side on to it as it goes. */
      const flying = hopStep(dt);
      c.jaw = 0.25;
      c.roll = 0;
      if (cr.on) {
        const side = yawTo(cr.x, cr.z) + (wrapAngle(yawTo(cr.x, cr.z) - c.yaw) > 0 ? -1.2 : 1.2);
        c.yaw = wrapAngle(c.yaw + clamp(wrapAngle(side - c.yaw), -9 * dt, 9 * dt));
      }
      if (!flying) {
        c.x = hop.bx;
        c.z = hop.bz;
        phase(1);
      }
    } else if (ph === 1) {
      /* Arched, bristled, and going sideways from it on stiff legs. */
      pose(POSTURE.arch, 0.07);
      c.jaw = phT < 0.4 ? 0.22 : 0;
      c.give = 1 - smooth(phT / 0.15);
      if (cr.on) {
        const d = Math.max(1e-3, cr.dh);
        const away = cr.dh < cr.keep + 1.4 * S ? 0.5 * S : 0.15 * S;
        const side = yawTo(cr.x, cr.z) + (wrapAngle(yawTo(cr.x, cr.z) - c.yaw) > 0 ? -1.2 : 1.2);
        /* From the craft, or if it is going somewhere, from its way. */
        let ux = -cr.dx / d;
        let uz = -cr.dz / d;
        if (cr.hs > 0.5 * S) {
          const al = (ux * cr.vx + uz * cr.vz) / (cr.hs * cr.hs);
          const lx = ux - cr.vx * al;
          const lz = uz - cr.vz * al;
          const ll = Math.hypot(lx, lz);
          if (ll > 0.05) {
            ux = lx / ll;
            uz = lz / ll;
          }
        }
        sidle(dt, ux * away, uz * away, side);
      }
      if (phT > 0.9) {
        phase(2);
      }
    } else if (ph === 2) {
      /* And down off it, still watching. */
      pose(POSTURE.stand, 0.2);
      ears = 3;
      c.vx = 0;
      c.vz = 0;
      if (phT > 0.6) {
        if (rnd() < 0.3 && cr.on && cr.yard) {
          return washOff(between(1.6, 2.4), MARK.sweat);
        }
        dur = between(0.8, 1.6);
        return cr.on && cr.yard ? enter(DO.watch) : idle();
      }
    } else {
      /* Nowhere to jump to: flat, until it has gone. */
      pose(POSTURE.flat, 0.045);
      c.vx = 0;
      c.vz = 0;
      if (phT > 0.5 && threat() === 0) {
        phase(2);
      }
    }
    return st;
  }
  /* Is the craft over the cat, or about to be, low enough that a cat on
   * its feet would have its head in the craft's air. */
  function overhead() {
    if (!cr.on) {
      return false;
    }
    const lim = cr.keep + 0.75 * S;
    const m = cr.sp > 0.2 * S ? 6 : 0;
    for (let k = 0; k <= m; k += 1) {
      predict(k * 0.08);
      if (pr.y < cr.keep + 0.8 * S && Math.hypot(pr.x - c.x, pr.z - c.z) < lim) {
        return true;
      }
    }
    return false;
  }
  /* Flat to the ground while it goes over, and not up again into it: the
   * cat stays down for as long as the craft is over it or about to be. One
   * that stops there and hangs over it is crawled out from under, belly to
   * the grass. */
  function doDuck(dt) {
    pose(POSTURE.flat, 0.045);
    ears = 2;
    unblinking = true;
    pupilT = 0.95;
    vel = 0;
    if (cr.on) {
      eyes(1);
    }
    let crawl = false;
    if (overhead()) {
      phT = 0;
      crawl = cr.sp < 1.0 * S && stT > 0.9;
    }
    if (crawl) {
      const d = cr.dh;
      const ux = d > 0.05 * S ? -cr.dx / d : -Math.cos(c.yaw);
      const uz = d > 0.05 * S ? -cr.dz / d : Math.sin(c.yaw);
      sidle(dt, ux * 0.7 * S, uz * 0.7 * S, c.yaw);
    } else {
      c.vx = 0;
      c.vz = 0;
    }
    /* phT is put back to nothing every frame the craft is still coming. */
    if (phT > 0.22) {
      if (ph === 1 && plan.kind === PL.ambush && cr.on && cr.yard) {
        return enter(DO.crouch);
      }
      dur = between(0.5, 1.1);
      return cr.on && cr.yard ? enter(DO.watch) : idle();
    }
    return st;
  }
  /* Giving ground to a craft that is crowding it, face to it. Followed too
   * long or backed into a corner, it turns and bats once, and after that
   * it has had enough and is off. */
  function doBackoff(dt) {
    if (!cr.on) {
      return idle();
    }
    pose(POSTURE.stand, 0.1);
    c.low = 0.35;
    eyes(1);
    ears = 3;
    pupilT = 0.85;
    c.wag = 0.4;
    c.wagHz = 1.6;
    const d = Math.max(1e-3, cr.dh);
    const room = cr.keep + 1.0 * S;
    /* Away from it, or round it if away is a wall. */
    let ux = -cr.dx / d;
    let uz = -cr.dz / d;
    if (stT === 0) {
      cornered = 0;
    }
    if (!lawn.free(c.x + ux * 0.4 * S, c.z + uz * 0.4 * S)) {
      /* Its back is to something. Along it for a moment, and no more. */
      cornered += dt;
      const tx = -uz;
      const tz = ux;
      const left = lawn.roomAt(c.x + tx * 0.5 * S, c.z + tz * 0.5 * S);
      const right = lawn.roomAt(c.x - tx * 0.5 * S, c.z - tz * 0.5 * S);
      ux = left >= right ? tx : -tx;
      uz = left >= right ? tz : -tz;
    }
    const sp = (cr.dh < room ? 1.3 : 0) * S;
    const moved = sidle(dt, ux * sp, uz * sp, yawTo(cr.x, cr.z));
    /* Pressed for long enough, it says so: mouth wide, ears flat, once. */
    if (stT > 0.5 && cr.dh < room && !hissed) {
      hissed = true;
      hissT = 0.7;
      moves.hiss += 1;
      mark(MARK.vein, 0.9);
    }
    if (hissT > 0) {
      hissT -= dt;
      c.jaw = 0.55 * Math.min(1, hissT / 0.12, (0.7 - hissT) / 0.08 + 0.2);
      ears = 2;
      squintT = 0.5;
      fear = Math.max(fear, 0.6);
    }
    if (cr.dh >= room && phT > 0.3) {
      dur = between(0.6, 1.2);
      return cr.yard ? enter(DO.watch) : idle();
    }
    if (cr.dh < room) {
      phT = 0;
    }
    if (stT > 1.8 || cornered > 0.15 || (!moved && stT > 0.25)) {
      if (!batted && cr.sp < 0.7 * S && cr.y < 0.95 * S && cr.dh < cr.keep + 0.7 * S) {
        batted = true;
        bats = 2;
        return enter(DO.swat);
      }
      return enter(DO.flee);
    }
    return st;
  }
  /* Enough: away, flat out, to somewhere a long way from it, and a look
   * back from there. It sulks for a while after. */
  function doFlee(dt) {
    pose(POSTURE.stand, 0.1);
    ears = 2;
    fear = Math.max(fear, 0.5);
    pupilT = 1;
    if (stT === 0) {
      moves.flee += 1;
      batted = false;
      hissed = false;
      hissT = 0;
      /* The best of a handful of places to rest: far from the craft, not
       * past it, and not the other end of the world. */
      let best = -1;
      let bs = -1e18;
      for (let k = 0; k < 10 && lawn.rests > 0; k += 1) {
        const r = Math.floor(rnd() * lawn.rests);
        const fromCraft = cr.on ? Math.hypot(lawn.restX[r] - cr.x, lawn.restZ[r] - cr.z) : 9 * S;
        const fromCat = Math.hypot(lawn.restX[r] - c.x, lawn.restZ[r] - c.z);
        /* Not a place the way to which is through the craft, or past it. */
        const cos = cr.on && fromCat > 1e-3 && cr.dh > 1e-3
          ? ((lawn.restX[r] - c.x) * cr.dx + (lawn.restZ[r] - c.z) * cr.dz) / (fromCat * cr.dh) : -1;
        const sc = Math.min(fromCraft, 6 * S) - 0.25 * fromCat - Math.max(0, cos + 0.25) * 8 * S;
        if (sc > bs) {
          bs = sc;
          best = r;
        }
      }
      if (best < 0) {
        return enter(DO.watch);
      }
      plan.kind = PL.none;
      plan.x = lawn.restX[best];
      plan.z = lawn.restZ[best];
    }
    if (ph === 0) {
      /* Round on the spot and away from it at once: its feet go where the
       * craft is not while its nose comes round to where it is going. */
      const yaw = yawTo(plan.x, plan.z);
      if (cr.on && cr.dh < cr.keep + 2 * S && phT < 0.4 && !aimed(yaw, 0.7)) {
        const d = Math.max(1e-3, cr.dh);
        let ux = -cr.dx / d;
        let uz = -cr.dz / d;
        if (!lawn.free(c.x + ux * 0.3 * S, c.z + uz * 0.3 * S)) {
          /* Away is a wall: the way it is going, then. */
          const gd = Math.max(1e-3, Math.hypot(plan.x - c.x, plan.z - c.z));
          ux = (plan.x - c.x) / gd;
          uz = (plan.z - c.z) / gd;
        }
        sidle(dt, ux * 1.6 * S, uz * 1.6 * S, yaw);
        return st;
      }
      phase(1);
      vel = Math.hypot(c.vx, c.vz);
    }
    goTo(plan.x, plan.z, RUN);
    lookAt(go.wx, 0.25 * S, go.wz, 0.4);
    if (go.arrived || go.failed || stT > 3.5 || Math.hypot(plan.x - c.x, plan.z - c.z) < 0.1 * S) {
      weary = Math.max(weary, 1);
      resting = true;
      wantPuff = 1;
      dur = between(1.5, 3);
      return cr.on && cr.yard ? enter(DO.watch) : idle();
    }
    return st;
  }
  /* It has landed. The neck out, a sniff, a paw put out and taken back. */
  function doSniff() {
    if (!cr.on || !cr.down) {
      return cr.on ? hunt() : enter(DO.lost);
    }
    pose(POSTURE.stand, 0.14);
    c.low = 0.25;
    ears = 1;
    c.whisk = 1;
    pupilT = basePupil + 0.2;
    turnTo(yawTo(cr.x, cr.z));
    if (ph === 0) {
      /* The sniff: the nose working at it. */
      if (phT === 0) {
        moves.sniff += 1;
      }
      lookAt(cr.x, cr.y + 0.02 * S * Math.sin(phT * 19), cr.z, 1);
      if (phT > 1.5) {
        phase(1);
      }
    } else if (ph === 1) {
      /* One paw up, held, unsure. */
      eyes(1);
      c.freeR = 1;
      c.tilt = 0.2;
      if (phT > 0.45) {
        phase(2);
        moves.tap += 1;
      }
    } else if (ph === 2) {
      /* The tap, short of it, twice. */
      eyes(1);
      const beat = (phT % 0.36) / 0.36;
      c.freeR = 1;
      if (beat < 0.45) {
        reachAt(1, false);
        c.toeR = -0.2;
      }
      if (phT > 0.72) {
        phase(3);
      }
    } else {
      /* Sat down to think about it. */
      pose(POSTURE.sit, 0.16);
      eyes(1);
      c.tilt = phT < 1.2 ? -0.3 : 0;
      if (phT > 2.2) {
        sniffed = true;
        return hunt();
      }
    }
    return st;
  }
  /* It was there and now it is not. */
  function doLost(dt) {
    pose(POSTURE.stand, 0.12);
    ears = 0;
    pupilT = 0.7;
    if (stT === 0) {
      mark(MARK.what, 1.3);
      gazeAt = 0;
    }
    gazeAt -= dt;
    if (gazeAt <= 0) {
      gazeAt = 0.38;
      gazeYaw = gazeYaw > 0 ? -between(0.7, 1.6) : between(0.7, 1.6);
    }
    const a = c.yaw + gazeYaw;
    lookAt(c.x + Math.cos(a) * 3 * S, 0.5 * S, c.z - Math.sin(a) * 3 * S, 1);
    if (cr.on && cr.yard && stT > 0.5) {
      return enter(DO.notice);
    }
    if (stT > 1.6) {
      return cr.on && cr.yard ? hunt() : idle();
    }
    return st;
  }
  /* Sat by the thing that landed, eyes closing slowly at it: the blink a
   * cat gives what it has decided to like. */
  function doAdore() {
    if (!cr.on || !cr.down) {
      return cr.on ? hunt() : idle();
    }
    pose(POSTURE.sit, 0.16);
    turnTo(yawTo(cr.x, cr.z));
    eyes(1);
    ears = 0;
    c.twitch = 0.3;
    const t = stT - 1.0;
    if (t > 0 && t < 1.7) {
      lidT = t < 0.55 ? t / 0.55 : t < 1.0 ? 1 : 1 - (t - 1.0) / 0.7;
      if (t > 0.55 && ph === 0) {
        ph = 1;
        mark(MARK.heart, 1.6);
        moves.slowBlink += 1;
      }
    }
    if (stT > 4.5) {
      return sitOut(between(2, 4));
    }
    return st;
  }
  /* Somewhere it may not be (it was moved there off the craft): out. */
  function doEscape() {
    pose(POSTURE.stand, 0.1);
    ears = 3;
    if (cr.on) {
      eyes(1);
    }
    if (lawn.free(c.x, c.z)) {
      dur = between(0.5, 1);
      return cr.on && cr.yard ? enter(DO.watch) : idle();
    }
    if (!go.on) {
      const k = lawn.nearestFree(c.x, c.z);
      if (k < 0 || stT > 6) {
        return st;
      }
      goTo(lawn.cellX(k), lawn.cellZ(k), SLINK);
    }
    return st;
  }

  const acts = [
    doSit, doGroom, doLoaf, doStretch, doWander, doNotice, doWatch, doStalk, doCrouch, doPounce, doLeap, doSwat,
    doChase, doRecover, doStartle, doDuck, doBackoff, doSniff, doLost, doAdore, doEscape, doFlee,
  ];

  function think(dt, craft, craftR, eye) {
    now += dt;
    sense(dt, craft, craftR || 0.2, eye);
    /* What is asked of the body starts from nothing every frame, and the
     * state says what it wants: nothing is left on from a state before. */
    c.low = 0;
    c.wiggle = 0;
    c.tread = 0;
    c.still = false;
    c.tilt = 0;
    c.jaw = 0;
    c.whisk = 0;
    c.wag = 0;
    c.wagHz = 1;
    c.twitch = 0;
    c.tailUp = 0;
    c.freeL = 0;
    c.freeR = 0;
    c.reachL = 0;
    c.reachR = 0;
    c.freeHind = 0;
    c.give = 0;
    c.lean = 0;
    c.pitch = 0;
    c.roll = 0;
    c.lift = 0;
    c.air = 0;
    c.up = 0;
    c.look = 0;
    pupilT = basePupil;
    lidT = 0;
    squintT = 0;
    browT = 0;
    sparkT = 0;
    clawLT = 0;
    clawRT = 0;
    ears = 0;
    unblinking = false;
    if (bored && (!cr.on || !cr.down)) {
      /* It moved. */
      bored = false;
    }
    if (letCome && (!cr.on || cr.dh > cr.keep + 6 * S || cr.sp > 1.6 * S)) {
      letCome = false;
    }
    fear = Math.max(0, fear - dt * 0.55);
    weary = Math.max(0, weary - dt * 0.045);
    if (cr.jumped && st !== DO.sit && st !== DO.groom && st !== DO.loaf && st !== DO.stretch && st !== DO.wander && !hop.on) {
      /* The craft was put somewhere else. */
      enter(cr.on && cr.yard && cr.dh < 3 * S ? DO.notice : DO.lost);
    }
    if (!hop.on && st !== DO.escape && st !== DO.startle && !lawn.free(c.x, c.z)) {
      enter(DO.escape);
    }
    reflex();
    const was = st;
    sidling = false;
    acts[st](dt);
    if (st === was) {
      stT += dt;
      phT += dt;
    }
    if (!hop.on && !sidling) {
      travel(dt);
    }
    if (weary > 0.5) {
      browT = 0.5;
    }
    c.bristle = fear;
    hark(dt);
    visage(dt);
    m.markT += dt;
    m.swipeT += dt;
    m.puffT += dt;
    /* A mark over its head is not held up in the craft's face. */
    if (cr.on && cr.dh < cr.keep + 0.8 * S && m.mark !== MARK.none && m.markT < m.markDur) {
      m.markT = m.markDur;
    }
  }

  /*
   * AFTER THE BODY IS POSED. The promise: no ball of the body nearer the
   * craft than its sweep and KEEP of air. If one is, the whole cat is slid
   * over the ground the shortest of seventeen ways that clears every ball
   * at once, by choice to somewhere it may be and by a straight way there.
   * Sliding along a way u by s moves a ball at h (from the craft, over the
   * ground) to h + s u, which is clear of the craft's circle at that
   * ball's height once s is past the far root of |h + s u| = need; the
   * most of those over every ball clears them all, because past its own
   * far root a ball only gets further away.
   */
  const ways = 16;
  const wayX = new Float64Array(ways + 1);
  const wayZ = new Float64Array(ways + 1);
  for (let k = 0; k < ways; k += 1) {
    wayX[k] = Math.cos((k * 2 * Math.PI) / ways);
    wayZ[k] = Math.sin((k * 2 * Math.PI) / ways);
  }
  function settle() {
    /* How tall it stands above its feet in the air, for the next frame's
     * ceiling. */
    if (hop.on) {
      const t = rig.top() / S - c.lift;
      topOff = Math.max(t, topOff - 0.02);
    } else {
      topOff = st === DO.leap || st === DO.crouch ? UP_TOP : AIR_TOP;
    }
    /* The marks that are put at a place on the body. */
    if (wantSwipe) {
      if (wantSwipePaw === 2) {
        rig.at('pawL', at3);
        const lx = at3[0];
        const ly = at3[1];
        const lz = at3[2];
        rig.at('pawR', at3);
        m.swipeX = (lx + at3[0]) / 2;
        m.swipeY = g + (ly + at3[1]) / 2 + 0.03 * S;
        m.swipeZ = (lz + at3[2]) / 2;
      } else {
        rig.at(wantSwipePaw === 0 ? 'pawL' : 'pawR', at3);
        m.swipeX = at3[0];
        m.swipeY = g + at3[1];
        m.swipeZ = at3[2];
      }
      m.swipe = wantSwipe;
      m.swipeT = 0;
      m.swipeDur = wantSwipe === SWIPE.star ? 0.3 : 0.2;
      m.swipeRoll = rnd() * 1.2 - 0.6;
      wantSwipe = 0;
    }
    if (wantPuff) {
      rig.at('hindL', at3);
      const lx = at3[0];
      const lz = at3[2];
      rig.at('hindR', at3);
      m.puff = PUFF.dust;
      m.puffT = 0;
      m.puffDur = 0.42;
      m.puffX = (lx + at3[0]) / 2;
      m.puffY = g + 0.04 * S;
      m.puffZ = (lz + at3[2]) / 2;
      wantPuff = 0;
    }
    if (!cr.on) {
      return false;
    }
    const P = rig.probes;
    const n = P.length / 4;
    const need = cr.keep;
    const qx = cr.x - c.x;
    const qz = cr.z - c.z;
    const far = 1.1 * S + need;
    if (qx * qx + qz * qz > far * far) {
      return false;
    }
    let hit = false;
    for (let i = 0; i < n; i += 1) {
      const dx = P[i * 4] - cr.x;
      const dy = P[i * 4 + 1] - cr.y;
      const dz = P[i * 4 + 2] - cr.z;
      const rr = need + P[i * 4 + 3];
      if (dx * dx + dy * dy + dz * dz < rr * rr) {
        hit = true;
        break;
      }
    }
    if (!hit) {
      return false;
    }
    /* The seventeenth way: straight away from the craft. */
    const qd = Math.hypot(qx, qz);
    wayX[ways] = qd > 1e-3 ? -qx / qd : Math.cos(c.yaw + Math.PI);
    wayZ[ways] = qd > 1e-3 ? -qz / qd : -Math.sin(c.yaw + Math.PI);
    let best = -1;
    let bestCost = 1e18;
    let bestS = 0;
    for (let k = 0; k <= ways; k += 1) {
      const ux = wayX[k];
      const uz = wayZ[k];
      let s = 0;
      for (let i = 0; i < n; i += 1) {
        const hx = P[i * 4] - cr.x;
        const hz = P[i * 4 + 2] - cr.z;
        const dy = P[i * 4 + 1] - cr.y;
        const rr = need + P[i * 4 + 3] + 0.004;
        const n2 = rr * rr - dy * dy;
        if (n2 <= 0) {
          continue;
        }
        const b = hx * ux + hz * uz;
        const disc = b * b - (hx * hx + hz * hz) + n2;
        if (disc <= 0) {
          continue;
        }
        const si = -b + Math.sqrt(disc);
        if (si > s) {
          s = si;
        }
      }
      const tx = c.x + ux * s;
      const tz = c.z + uz * s;
      let cost = s;
      if (!lawn.free(tx, tz)) {
        cost += 1000;
      } else if (!lawn.sight(c.x, c.z, tx, tz)) {
        cost += 500;
      }
      /* Out of its way and not along it: a cat moved the way the craft is
       * going is in its way again a frame later. */
      if (cr.sp > 0.5 * S) {
        cost += 0.5 * S * Math.max(0, (ux * cr.vx + uz * cr.vz) / cr.sp);
      }
      if (k === lastDir) {
        cost -= 0.05 * S;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = k;
        bestS = s;
      }
    }
    if (best < 0 || bestS <= 0) {
      return false;
    }
    const dx = wayX[best] * bestS;
    const dz = wayZ[best] * bestS;
    c.x += dx;
    c.z += dz;
    rig.shift(dx, dz);
    if (hop.on) {
      /* A leap goes on from where it was put. */
      hop.ax += dx;
      hop.az += dz;
      hop.bx += dx;
      hop.bz += dz;
    }
    lastDir = best;
    pushes += 1;
    pushedNow = true;
    pushX = wayX[best];
    pushZ = wayZ[best];
    return true;
  }

  return {
    think,
    settle,
    craft: cr,
    plan,
    /* For the check and the harness: an object a call, never in a frame. */
    stats() {
      const done = {};
      DOING.forEach((name, i) => {
        done[name] = did[i];
      });
      return {
        doing: DOING[st], phase: ph, pushes, weary, fear, misses, moves: { ...moves }, done, x: c.x, z: c.z, yaw: c.yaw,
      };
    },
    doing: () => st,
    pushes: () => pushes,
    air: () => hop.on,
    /* For the bench: put it somewhere, doing something. */
    put(x, z, yaw) {
      c.x = x;
      c.z = z;
      c.yaw = yaw;
      vel = 0;
      go.on = false;
      hop.on = false;
    },
    force(s) {
      enter(s);
    },
  };
}
