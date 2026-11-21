/*
 * catrig.js: the yard cat's body, as a skeleton and the rules that move it.
 * Pure arithmetic: no three.js, no page, nothing drawn. ./cat.js decides what
 * the cat wants; this turns that into thirty eight bones a frame;
 * ./catmodel.js is the cat's shape hung on those bones; ./catdraw.js hands
 * both to the graphics card.
 *
 * WHY A SKELETON AND NOT A SET OF DRAWN POSES. The owner asked for "all the
 * cat characteristics, and signature moves (stalk, wiggle butt and big eyes,
 * jumping and swatting)". A cat is the way it moves: the belly low creep with
 * one paw held in the air, the shoulder blades working above a dropped spine,
 * the hind feet treading before a pounce, the paws reaching and the spine
 * unfolding in the air. None of that survives being a handful of stills
 * faded into each other. So the body is built the way the animal is: a spine
 * of four bones, a neck and a head, two ears that turn by themselves, a jaw,
 * a tail of six, two shoulder blades, and four legs of three long bones and
 * a paw each, on its toes as a cat stands. Feet that are down stay where
 * they were put in the WORLD while the body travels over them, and each leg
 * is solved back from its paw to its hip, so nothing slides.
 *
 * WHAT THE READING SAID, for the numbers below. A walk is four beats, hind
 * paw then the fore paw of the same side, each hind paw landing almost in
 * the print of the fore paw ahead of it, two or three feet down at a time; a
 * trot is the diagonal pairs together; a run has a moment with every paw off
 * the ground, the hind legs driving with the spine at full stretch and then
 * the spine folding to bring the hindquarters under (Fear Free Happy Homes
 * on feline gaits). The forelegs carry about six tenths of the weight and
 * catch a landing; the hind legs are the longer and stronger and both push
 * at once in a pounce (PetMD, Cats Protection). There is no fixed
 * collarbone, so the chest hangs in a sling between the shoulder blades:
 * lower the chest and the blades stand above the back, which is the look of
 * a stalk. A cat holds its head level while it stalks and chases.
 *
 * FOR THE LATENCY RULE. One step is a few hundred multiplications and about
 * eighty sines, on arrays made once: no object is made in a frame, so the
 * collector has nothing to do. ./catdraw.js does not step it at all while
 * the cat is out of the picture.
 *
 * NOT THE PHYSICS. Nothing here is read by the plant or by anything that
 * times a lap, so JS's own sine and cosine are fair (the determinism rule is
 * about the physics path). The cat is a picture.
 *
 * Frames. The cat's own: x forward, y up, z to its right, in the metres of a
 * real cat. The world: three.js's, y up. `yaw` is a turn about +y as three.js
 * counts one, so forward is (cos yaw, 0, -sin yaw). A bone is written as the
 * three rows of a 3 by 4 matrix that takes a corner of the modelled cat (its
 * rest pose) to where it is now, relative to the cat's spot on the ground,
 * in world metres and world axes.
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

/* The bones, by number. Left is -z. A leg is its upper bone (humerus or
 * femur), its lower (forearm or shin), its long foot bone (a cat stands on
 * its toes, so this one is off the ground) and its paw. Three carry no
 * body: they are the marks drawn over the cat (./catdraw.js places them). */
export const BONE = {
  hips: 0, spine1: 1, spine2: 2, chest: 3, neck: 4, head: 5, jaw: 6, earL: 7, earR: 8, whiskL: 9, whiskR: 10,
  tail1: 11, tail2: 12, tail3: 13, tail4: 14, tail5: 15, tail6: 16,
  flU: 17, flL: 18, flM: 19, flP: 20,
  frU: 21, frL: 22, frM: 23, frP: 24,
  hlU: 25, hlL: 26, hlM: 27, hlP: 28,
  hrU: 29, hrL: 30, hrM: 31, hrP: 32,
  mark: 33, swipe: 34, puff: 35,
  bladeL: 36, bladeR: 37,
};
export const BONES = 38;
/* Lengths, written out, because Math.hypot makes garbage in V8: see
 * ./cat.js. */
const hyp2 = (a, b) => Math.sqrt(a * a + b * b);
const hyp3 = (a, b, c) => Math.sqrt(a * a + b * b + c * c);
export const TAIL = 6;

/* The legs, in the order everything here lists them. */
export const FL = 0;
export const FR = 1;
export const HL = 2;
export const HR = 3;

/*
 * THE CAT AT REST, standing square: where each bone turns, in metres. A
 * house cat of about four and a half kilograms: 46 cm from breast to rump,
 * 26 cm at the shoulder, a 30 cm tail (A-Z Animals gives 18 inches of body).
 * The head is a little large and the legs a little long for a real cat,
 * which is the manga's cat and not the vet's.
 */
const HALF_F = 0.038;
const HALF_H = 0.044;
/* The head is modelled at a real cat's size and drawn this much bigger,
 * about the bone it turns on (./catmodel.js grows the corners; this grows
 * where the things on the head turn). */
export const HEAD_SCALE = 1.14;
const HEAD = [0.2, 0.292, 0];
const onHead = (x, y, z) => [HEAD[0] + (x - HEAD[0]) * HEAD_SCALE, HEAD[1] + (y - HEAD[1]) * HEAD_SCALE, z * HEAD_SCALE];
export const REST = {
  hips: [-0.135, 0.235, 0],
  spine1: [-0.06, 0.245, 0],
  spine2: [0.02, 0.25, 0],
  chest: [0.095, 0.245, 0],
  neck: [0.15, 0.25, 0],
  head: HEAD,
  jaw: onHead(0.212, 0.272, 0),
  earL: onHead(0.203, 0.336, -0.031),
  earR: onHead(0.203, 0.336, 0.031),
  whiskL: onHead(0.266, 0.279, -0.016),
  whiskR: onHead(0.266, 0.279, 0.016),
  tail: [-0.2, 0.238, 0],
  tailStep: 0.05,
  /* A fore leg's joints: shoulder, elbow, wrist and the knuckles the paw
   * turns on; a hind leg's: hip, knee, hock and knuckles. x and y; z is the
   * leg's side. */
  shoulder: [0.125, 0.18],
  elbow: [0.09, 0.118],
  wrist: [0.108, 0.04],
  forePaw: [0.118, 0.012],
  hip: [-0.135, 0.2],
  knee: [-0.085, 0.13],
  hock: [-0.165, 0.072],
  hindPaw: [-0.15, 0.012],
  halfF: HALF_F,
  halfH: HALF_H,
  /* How high a paw's knuckles are when the paw is flat on the ground. */
  pawY: 0.012,
  /* Where the marks hang, over the head. */
  mark: [0.215, 0.44, 0],
};

/* A bone's own pivot at rest, by number. */
const PIVOT = new Float64Array(BONES * 3);
{
  const put = (b, p, z) => {
    PIVOT[b * 3] = p[0];
    PIVOT[b * 3 + 1] = p[1];
    PIVOT[b * 3 + 2] = z === undefined ? p[2] : z;
  };
  put(BONE.hips, REST.hips);
  put(BONE.spine1, REST.spine1);
  put(BONE.spine2, REST.spine2);
  put(BONE.chest, REST.chest);
  put(BONE.neck, REST.neck);
  put(BONE.head, REST.head);
  put(BONE.jaw, REST.jaw);
  put(BONE.earL, REST.earL);
  put(BONE.earR, REST.earR);
  put(BONE.whiskL, REST.whiskL);
  put(BONE.whiskR, REST.whiskR);
  for (let j = 0; j < TAIL; j += 1) {
    put(BONE.tail1 + j, [REST.tail[0] - j * REST.tailStep, REST.tail[1], 0]);
  }
  for (const [leg, side] of [[FL, -1], [FR, 1]]) {
    const b = BONE.flU + leg * 4;
    put(b, REST.shoulder, side * HALF_F);
    put(b + 1, REST.elbow, side * HALF_F);
    put(b + 2, REST.wrist, side * HALF_F);
    put(b + 3, REST.forePaw, side * HALF_F);
    put(leg === FL ? BONE.bladeL : BONE.bladeR, REST.shoulder, side * HALF_F);
  }
  for (const [leg, side] of [[HL, -1], [HR, 1]]) {
    const b = BONE.flU + leg * 4;
    put(b, REST.hip, side * HALF_H);
    put(b + 1, REST.knee, side * HALF_H);
    put(b + 2, REST.hock, side * HALF_H);
    put(b + 3, REST.hindPaw, side * HALF_H);
  }
  put(BONE.mark, REST.mark);
  put(BONE.swipe, REST.mark);
  put(BONE.puff, REST.mark);
}
export function restPivot(b) {
  return [PIVOT[b * 3], PIVOT[b * 3 + 1], PIVOT[b * 3 + 2]];
}

const dist2 = (a, b) => hyp2(a[0] - b[0], a[1] - b[1]);
/* The lengths of a leg's three long bones, fore and hind. */
const LEN = [
  [dist2(REST.shoulder, REST.elbow), dist2(REST.elbow, REST.wrist), dist2(REST.wrist, REST.forePaw)],
  [dist2(REST.hip, REST.knee), dist2(REST.knee, REST.hock), dist2(REST.hock, REST.hindPaw)],
];
/* How far a leg reaches from its top joint to its knuckles, at full stretch. */
export const REACH = [LEN[0][0] + LEN[0][1] + LEN[0][2], LEN[1][0] + LEN[1][1] + LEN[1][2]];
/* How far the long foot bone leans back from upright when the cat stands. */
const FOOT_REST = [
  Math.atan2(REST.forePaw[0] - REST.wrist[0], REST.wrist[1] - REST.forePaw[1]),
  Math.atan2(REST.hindPaw[0] - REST.hock[0], REST.hock[1] - REST.hindPaw[1]),
];
/* The spine from hips to chest, laid straight. */
const SPINE_LEN = dist2(REST.hips, REST.chest);
const SPINE_RISE = REST.chest[1] - REST.hips[1];

/*
 * THE POSTURES. A posture is a row of numbers the body eases toward: where
 * the hips and chest are held, how the spine is curved, where each pair of
 * feet wants to stand, how far the elbows and knees turn out, how far the
 * shoulder blades stand above the back, and how the tail is carried.
 *
 *   hipX     the hips moved forward of where they stand at rest
 *   hipY     the height of the hips' bone
 *   chestY   the height of the chest's bone
 *   arch     the spine's curve, radians, up in the middle when positive
 *   neck     the neck turned up from how it is modelled, radians, against
 *            the ground and not the chest, so a sitting cat's is upright
 *   foreX, foreZ   where a fore paw wants to stand, forward and out
 *   hindX, hindZ   the same for a hind paw
 *   splayF, splayH how far elbows and knees turn out, radians
 *   blade    how far a shoulder blade stands above where it is modelled
 *   tailP    the tail's root turned up, radians, against the ground
 *   tailC    each tail bone turned up from the last (a curl)
 *   tailY    each tail bone turned to the right from the last (a wrap)
 *   footF, footH   how far the long foot bones are laid down: 0 as the cat
 *            stands, 1 flat along the ground
 */
const Q = {
  hipX: 0, hipY: 1, chestY: 2, arch: 3, neck: 4, foreX: 5, foreZ: 6, hindX: 7, hindZ: 8,
  splayF: 9, splayH: 10, blade: 11, tailP: 12, tailC: 13, tailY: 14, footF: 15, footH: 16, N: 17,
};
const pose = (o) => {
  const a = new Float64Array(Q.N);
  for (const k of Object.keys(o)) {
    a[Q[k]] = o[k];
  }
  return a;
};
export const POSTURE = {
  /* Standing square, head up. */
  stand: 0,
  /* The stalk: belly low, elbows and knees out, blades up, tail level. */
  creep: 1,
  /* Set to spring: the chest on the ground, the hind feet gathered under
   * the body, the rump the highest thing. The wiggle happens here. */
  crouch: 2,
  /* Sat on its haunches, fore legs straight. */
  sit: 3,
  /* Up on its hind legs, fore paws free to bat. */
  rear: 4,
  /* Pressed to the ground, as when something comes over low. */
  flat: 5,
  /* The fright: legs stiff, back arched, tail up. */
  arch: 6,
  /* The bow: fore legs out along the ground, rump in the air. */
  bow: 7,
  /* In the air. The legs are free and the leap says where (controls.air). */
  air: 8,
  /* The loaf: down on its belly, paws tucked under. */
  loaf: 9,
};
const POSES = [
  pose({ hipX: 0, hipY: 0.242, chestY: 0.245, arch: 0, neck: 0, foreX: 0.118, foreZ: 0.038, hindX: -0.15, hindZ: 0.044, splayF: 0.04, splayH: 0.06, blade: 0, tailP: -0.5, tailC: 0.14, tailY: 0, footF: 0, footH: 0 }),
  pose({ hipX: 0, hipY: 0.172, chestY: 0.152, arch: -0.05, neck: -0.6, foreX: 0.125, foreZ: 0.05, hindX: -0.15, hindZ: 0.058, splayF: 0.45, splayH: 0.5, blade: 0.024, tailP: -0.1, tailC: 0.012, tailY: 0, footF: 0.2, footH: 0.42 }),
  pose({ hipX: -0.012, hipY: 0.15, chestY: 0.105, arch: 0.1, neck: -0.35, foreX: 0.155, foreZ: 0.046, hindX: -0.105, hindZ: 0.062, splayF: 0.6, splayH: 0.7, blade: 0.028, tailP: -0.25, tailC: 0.05, tailY: 0, footF: 0.85, footH: 0.9 }),
  pose({ hipX: -0.02, hipY: 0.086, chestY: 0.232, arch: 0.46, neck: 0.45, foreX: 0.085, foreZ: 0.03, hindX: -0.03, hindZ: 0.052, splayF: 0.02, splayH: 0.32, blade: 0, tailP: -0.12, tailC: 0, tailY: 0.46, footF: 0, footH: 1 }),
  pose({ hipX: -0.04, hipY: 0.12, chestY: 0.315, arch: 0.2, neck: 0.5, foreX: 0.085, foreZ: 0.04, hindX: -0.06, hindZ: 0.062, splayF: 0.2, splayH: 0.6, blade: 0, tailP: -0.2, tailC: 0.02, tailY: 0.08, footF: 0, footH: 1 }),
  pose({ hipX: 0, hipY: 0.092, chestY: 0.08, arch: -0.04, neck: -0.72, foreX: 0.16, foreZ: 0.07, hindX: -0.13, hindZ: 0.085, splayF: 1, splayH: 1.05, blade: 0.02, tailP: -0.06, tailC: 0, tailY: 0.12, footF: 1, footH: 1 }),
  pose({ hipX: -0.01, hipY: 0.262, chestY: 0.262, arch: 1.35, neck: -0.3, foreX: 0.075, foreZ: 0.036, hindX: -0.1, hindZ: 0.04, splayF: 0, splayH: 0, blade: 0.008, tailP: 1.3, tailC: -0.12, tailY: 0, footF: -0.1, footH: -0.1 }),
  pose({ hipX: -0.01, hipY: 0.245, chestY: 0.105, arch: -0.4, neck: -0.1, foreX: 0.15, foreZ: 0.034, hindX: -0.15, hindZ: 0.046, splayF: 0.1, splayH: 0.1, blade: 0.02, tailP: 0.9, tailC: 0.18, tailY: 0, footF: 1, footH: 0 }),
  pose({ hipX: 0, hipY: 0.235, chestY: 0.245, arch: 0, neck: -0.1, foreX: 0.118, foreZ: 0.038, hindX: -0.15, hindZ: 0.044, splayF: 0.1, splayH: 0.1, blade: 0, tailP: 0.1, tailC: 0.05, tailY: 0, footF: 0, footH: 0 }),
  pose({ hipX: 0, hipY: 0.098, chestY: 0.108, arch: 0.12, neck: 0.3, foreX: 0.112, foreZ: 0.03, hindX: -0.1, hindZ: 0.06, splayF: 0.35, splayH: 0.6, blade: 0.012, tailP: -0.1, tailC: 0, tailY: 0.45, footF: 1, footH: 1 }),
];

/*
 * THE GAITS, at a real cat's size, by its speed in metres a second: how far
 * one whole stride carries it (a length and a share of its speed), what
 * share of a stride a paw is down (its duty), how high a paw is carried, and
 * when in the stride each paw comes down (fore left, fore right, hind left,
 * hind right, as shares of one).
 *
 * The creep and the walk are the same four beats: hind left, fore left,
 * hind right, fore right. The trot is the diagonals. The run is the hind
 * pair close together and then the fore pair, with the air between.
 */
const GAITS = [
  { to: 0.34, stride: [0.19, 0.3], duty: 0.8, lift: 0.044, at: [0.25, 0.75, 0, 0.5] },
  { to: 1.05, stride: [0.27, 0.22], duty: 0.64, lift: 0.03, at: [0.25, 0.75, 0, 0.5] },
  { to: 2.5, stride: [0.36, 0.2], duty: 0.46, lift: 0.04, at: [0.5, 0, 0, 0.5] },
  { to: 99, stride: [0.56, 0.21], duty: 0.26, lift: 0.066, at: [0.62, 0.5, 0, 0.11] },
];
/* A paw is never asked to stay down over more ground than a leg can cover. */
const STANCE_MOST = 0.24;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};
const frac = (v) => v - Math.floor(v);
/* An angle brought back to between minus and plus a half turn. */
export function wrapAngle(a) {
  let x = a % (2 * Math.PI);
  if (x > Math.PI) {
    x -= 2 * Math.PI;
  } else if (x < -Math.PI) {
    x += 2 * Math.PI;
  }
  return x;
}
/* How far to go toward a target this step so that the gap halves every
 * `half` seconds, whatever the step: the same motion at 60 and at 240 Hz. */
const ease = (dt, half) => (half <= 0 ? 1 : 1 - Math.pow(0.5, dt / half));

/*
 * What ./cat.js asks of the body, written into one object it owns and
 * changes in place. Lengths and speeds that are the WORLD's are in world
 * metres; everything about the cat's own shape is in a cat's.
 */
export function makeControls() {
  return {
    /* Where the cat is on the ground (world), which way it faces, and how
     * fast it is going over the ground (world metres a second). */
    x: 0, z: 0, yaw: 0, vx: 0, vz: 0,
    /* How high the whole cat is off the ground in a leap (a cat's metres),
     * and how its body is turned in the air: nose up, and rolled. */
    lift: 0, pitch: 0, roll: 0,
    /* The posture to ease into (POSTURE), and how quickly, as the seconds
     * in which the gap halves. */
    posture: POSTURE.stand, quick: 0.09,
    /* Lower than the posture asks, 0 to 1 (a creep that hugs the ground). */
    low: 0,
    /* The wiggle: 0 to 1, how hard the hindquarters are working. */
    wiggle: 0,
    /* Hind feet treading in place, 0 to 1. */
    tread: 0,
    /* Stopped dead in the middle of a step: the stride stands still and a
     * fore paw that was in the air stays there. */
    still: false,
    /* What the head looks at (world), how hard (0 leaves the head with the
     * body), and a tilt of the head to one side, radians. */
    lookX: 0, lookY: 0, lookZ: 0, look: 0, tilt: 0,
    /* Each ear: turned out from forward (radians, 0 forward to about 1.6
     * sideways and back) and laid flat (0 up to 1 flat). */
    earL: 0, earR: 0, flatL: 0, flatR: 0,
    /* The jaw open, radians. */
    jaw: 0,
    /* The whiskers swung forward (1) or back along the cheeks (-1). */
    whisk: 0,
    /* The tail: swept side to side (radians at the root, and beats a
     * second), its tip alone twitching (0 to 1), raised (radians added at
     * the root), and bristled (0 to 1). */
    wag: 0, wagHz: 1, twitch: 0, tailUp: 0, bristle: 0,
    /* The fore paws let go of the ground (0 or 1 each) and where each is
     * wanted: with `reach` 1 a point in the world, and how the paw is
     * turned, toes up positive. A free paw with `reach` 0 hangs by the
     * chest, wrist dropped. */
    freeL: 0, freeR: 0,
    pawLX: 0, pawLY: 0, pawLZ: 0, reachL: 0, toeL: 0,
    pawRX: 0, pawRY: 0, pawRZ: 0, reachR: 0, toeR: 0,
    /* The hind paws let go (a leap). In the air posture they let go by
     * themselves when the legs can reach the ground no longer. */
    freeHind: 0,
    /* In the air: 0 as the hind feet leave, 1 as the fore feet land. The
     * legs follow it (reach, trail, tuck, reach down). `up` is 1 for a
     * leap straight up, where the fore paws go overhead instead. */
    air: 0, up: 0,
    /* Landing: the legs give, 0 to 1. */
    give: 0,
    /* A lean to one side, radians of roll (into a turn, away from a fright). */
    lean: 0,
  };
}

/*
 * The body. `scale` is world metres to one of the cat's. Returns:
 *
 *   step(dt, c)  move the body on `dt` seconds toward what `c` asks
 *   bones        BONES rows of twelve numbers, for the graphics card
 *   at(name, out)  a place on the cat, in the world
 *   probes       the body as balls, [x, y, z, r] each in the world (y over
 *                the lawn), for keeping it off the craft (./cat.js)
 *   shift(dx, dz)  the whole cat moved over the ground after a step
 *   top()        the highest any part of it reaches
 *   lead         where the eyes are ahead of the head, [left, up] radians
 *   reset()      forget the feet and the tail's swing
 */
export function makeRig(scale) {
  const S = scale;
  const bones = new Float32Array(BONES * 12);
  /* Each bone's turn (nine numbers, by rows) and pivot, in the cat's frame. */
  const ROT = new Float64Array(BONES * 9);
  const PIV = new Float64Array(BONES * 3);
  for (let b = 0; b < BONES; b += 1) {
    ROT[b * 9] = 1;
    ROT[b * 9 + 4] = 1;
    ROT[b * 9 + 8] = 1;
  }
  const q = new Float64Array(POSES[POSTURE.stand]);
  const want = new Float64Array(Q.N);
  const tmp = new Float64Array(9);

  /* The feet: where each paw's knuckles are in the world, whether it is
   * down (0), swinging to a new place (1) or let go (2), and its swing. */
  const foot = [];
  for (let i = 0; i < 4; i += 1) {
    foot.push({
      x: 0, y: 0, z: 0, mode: 0, fromX: 0, fromY: 0, fromZ: 0, t: 0, dur: 0.2, lift: 0.03, stance: 0,
      toe: 0, load: 1, ox: 0, oy: 0, oz: 0, fresh: false,
    });
  }
  let phase = 0;
  const gaitAt = new Float64Array([0.25, 0.75, 0, 0.5]);
  let duty = 0.64;
  let liftH = 0.03;
  let stepCool = 0;
  let clock = 0;
  let seeded = false;
  /* Eased things. */
  let headYaw = 0;
  let headPitch = 0;
  let headTilt = 0;
  let lookW = 0;
  let earL = 0;
  let earR = 0;
  let flatL = 0;
  let flatR = 0;
  let jaw = 0;
  let whisk = 0;
  let bristle = 0;
  let lowE = 0;
  let wiggleE = 0;
  let giveE = 0;
  let airArch = 0;
  let leanE = 0;
  let pitchE = 0;
  let rollE = 0;
  let turnE = 0;
  let lastYaw = 0;
  let speedE = 0;
  let bob = 0;
  let wagPhase = 0;
  /* The tail's own swing: each bone's turn to the side lags the one before. */
  const tailSide = new Float64Array(TAIL);
  /* How far what is looked at is from where the head points, to the left
   * and up, radians: where the eyes go before the head does. */
  const lead = new Float64Array(2);

  /* The probes: a ball on a bone, [bone, x, y, z from its pivot, radius],
   * in the cat's metres. Together they wrap the drawn cat (the check in
   * scripts/yardcat-check.js holds every drawn corner inside one). */
  const PROBE = [
    [BONE.hips, -0.04, -0.03, 0, 0.082], [BONE.hips, 0.03, -0.035, 0, 0.08],
    [BONE.spine1, 0.03, -0.05, 0, 0.08], [BONE.spine2, 0.03, -0.055, 0, 0.084],
    [BONE.chest, 0, -0.05, 0, 0.086], [BONE.chest, 0.05, -0.03, 0, 0.066],
    [BONE.neck, 0.025, 0.015, 0, 0.056],
    [BONE.head, 0.03, 0.012, 0, 0.078], [BONE.head, 0.07, -0.012, 0, 0.05],
    [BONE.earL, -0.004, 0.034, -0.008, 0.044], [BONE.earR, -0.004, 0.034, 0.008, 0.044],
    [BONE.whiskL, 0, 0, -0.045, 0.058], [BONE.whiskR, 0, 0, 0.045, 0.058],
  ].map((p) => (p[0] >= BONE.head && p[0] <= BONE.whiskR ? [p[0], p[1] * HEAD_SCALE, p[2] * HEAD_SCALE, p[3] * HEAD_SCALE, p[4] * HEAD_SCALE] : p));
  PROBE.push(
    [BONE.bladeL, -0.012, 0.035, 0.004, 0.04], [BONE.bladeR, -0.012, 0.035, -0.004, 0.04],
  );
  for (let j = 0; j < TAIL; j += 1) {
    PROBE.push([BONE.tail1 + j, -0.025, 0, 0, 0.042]);
  }
  PROBE.push([BONE.tail6, -0.055, 0, 0, 0.038]);
  for (let leg = 0; leg < 4; leg += 1) {
    const b = BONE.flU + leg * 4;
    const hind = leg >= 2;
    PROBE.push([b, hind ? 0.018 : -0.012, hind ? -0.03 : -0.026, 0, hind ? 0.066 : 0.05]);
    PROBE.push([b + 1, hind ? -0.026 : 0.006, hind ? -0.018 : -0.026, 0, 0.042]);
    PROBE.push([b + 1, hind ? -0.064 : 0.014, hind ? -0.046 : -0.06, 0, 0.034]);
    PROBE.push([b + 2, hind ? 0.006 : 0.004, hind ? -0.03 : -0.014, 0, 0.034]);
    PROBE.push([b + 3, 0.014, 0.002, 0, 0.044]);
  }
  const probes = new Float32Array(PROBE.length * 4);

  /* A turn from three angles: about the up axis, then nose up, then rolled
   * (right side down positive), written at `o` in `m`. */
  function euler(m, o, yaw, pitch, roll) {
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cz = Math.cos(pitch);
    const sz = Math.sin(pitch);
    const cx = Math.cos(roll);
    const sx = Math.sin(roll);
    m[o] = cy * cz;
    m[o + 1] = -cy * sz * cx + sy * sx;
    m[o + 2] = cy * sz * sx + sy * cx;
    m[o + 3] = sz;
    m[o + 4] = cz * cx;
    m[o + 5] = -cz * sx;
    m[o + 6] = -sy * cz;
    m[o + 7] = sy * sz * cx + cy * sx;
    m[o + 8] = -sy * sz * sx + cy * cx;
  }
  /* Bone `b` turned as bone `p` and then by three angles of its own. */
  function turnFrom(b, p, yaw, pitch, roll) {
    euler(tmp, 0, yaw, pitch, roll);
    const bo = b * 9;
    const po = p * 9;
    for (let r = 0; r < 3; r += 1) {
      const a0 = ROT[po + r * 3];
      const a1 = ROT[po + r * 3 + 1];
      const a2 = ROT[po + r * 3 + 2];
      ROT[bo + r * 3] = a0 * tmp[0] + a1 * tmp[3] + a2 * tmp[6];
      ROT[bo + r * 3 + 1] = a0 * tmp[1] + a1 * tmp[4] + a2 * tmp[7];
      ROT[bo + r * 3 + 2] = a0 * tmp[2] + a1 * tmp[5] + a2 * tmp[8];
    }
  }
  /* Bone `b`'s pivot, carried by bone `p`. */
  function carry(b, p) {
    const dx = PIVOT[b * 3] - PIVOT[p * 3];
    const dy = PIVOT[b * 3 + 1] - PIVOT[p * 3 + 1];
    const dz = PIVOT[b * 3 + 2] - PIVOT[p * 3 + 2];
    const o = p * 9;
    PIV[b * 3] = PIV[p * 3] + ROT[o] * dx + ROT[o + 1] * dy + ROT[o + 2] * dz;
    PIV[b * 3 + 1] = PIV[p * 3 + 1] + ROT[o + 3] * dx + ROT[o + 4] * dy + ROT[o + 5] * dz;
    PIV[b * 3 + 2] = PIV[p * 3 + 2] + ROT[o + 6] * dx + ROT[o + 7] * dy + ROT[o + 8] * dz;
  }
  /* A bone turned so that its length lies along (x, y, z) and its side
   * along (nx, ny, nz), both unit and square to each other, from a rest in
   * which it lay along (rx, ry, 0) with its side along +z. */
  function aim(b, x, y, z, nx, ny, nz, rx, ry) {
    /* The bone's third axis: its side crossed with its length. */
    const ux = ny * z - nz * y;
    const uy = nz * x - nx * z;
    const uz = nx * y - ny * x;
    const o = b * 9;
    ROT[o] = x * rx - ux * ry;
    ROT[o + 1] = x * ry + ux * rx;
    ROT[o + 2] = nx;
    ROT[o + 3] = y * rx - uy * ry;
    ROT[o + 4] = y * ry + uy * rx;
    ROT[o + 5] = ny;
    ROT[o + 6] = z * rx - uz * ry;
    ROT[o + 7] = z * ry + uz * rx;
    ROT[o + 8] = nz;
  }

  /* The cat's spot and heading this step, and the way back from the world. */
  let rootX = 0;
  let rootZ = 0;
  let cosY = 1;
  let sinY = 0;
  const loc = new Float64Array(3);
  function toCat(wx, wy, wz) {
    const dx = (wx - rootX) / S;
    const dz = (wz - rootZ) / S;
    loc[0] = cosY * dx - sinY * dz;
    loc[1] = wy / S;
    loc[2] = sinY * dx + cosY * dz;
  }
  const wld = new Float64Array(3);
  function toWorld(x, y, z) {
    wld[0] = rootX + S * (cosY * x + sinY * z);
    wld[1] = S * y;
    wld[2] = rootZ + S * (-sinY * x + cosY * z);
  }

  /* Where leg `i`'s paw wants to stand, in the cat's frame. */
  const homeX = (i) => (i < 2 ? q[Q.foreX] : q[Q.hindX]);
  const homeZ = (i) => (i % 2 === 0 ? -1 : 1) * (i < 2 ? q[Q.foreZ] : q[Q.hindZ]);
  /* And where that will be in the world `lead` seconds on, going and
   * turning as the cat is now: into `wld`. */
  function homeWorld(i, c, lead) {
    const a = c.yaw + turnE * lead;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const hx = homeX(i);
    const hz = homeZ(i);
    wld[0] = c.x + c.vx * lead + S * (ca * hx + sa * hz);
    wld[2] = c.z + c.vz * lead + S * (-sa * hx + ca * hz);
  }

  /*
   * ONE LEG, solved from its paw back to its top joint. The leg lies in a
   * plane through the joint and the paw, turned out by `splay`. The long
   * foot bone is laid first, up and back from the knuckles; then the two
   * bones above it meet at the elbow or knee, which is the one place two
   * lengths can meet (the elbow behind the line, the knee ahead of it). A
   * paw too far away is not reached: the leg is drawn straight at it and
   * `over` says by how much, which is how a foot knows to let go.
   *
   * `footLie` is how the long foot bone lies. On the ground it is counted
   * against the ground (0 as the cat stands, 1 flat), so a sitting cat's
   * hock is down behind its paw; let go, against the leg's own line.
   */
  const legOut = { over: 0 };
  function seg(bone, x0, y0, z0, x1, y1, z1, nx, ny, nz, r0, r1) {
    let dx = x1 - x0;
    let dy = y1 - y0;
    let dz = z1 - z0;
    const dl = hyp3(dx, dy, dz) || 1;
    dx /= dl;
    dy /= dl;
    dz /= dl;
    const rl = hyp2(r1[0] - r0[0], r1[1] - r0[1]);
    /* The side kept square to this bone. */
    const dn = dx * nx + dy * ny + dz * nz;
    let sx = nx - dx * dn;
    let sy = ny - dy * dn;
    let sz = nz - dz * dn;
    const sl = hyp3(sx, sy, sz) || 1;
    sx /= sl;
    sy /= sl;
    sz /= sl;
    aim(bone, dx, dy, dz, sx, sy, sz, (r1[0] - r0[0]) / rl, (r1[1] - r0[1]) / rl);
    PIV[bone * 3] = x0;
    PIV[bone * 3 + 1] = y0;
    PIV[bone * 3 + 2] = z0;
  }
  function solveLeg(i, jx, jy, jz, px, py, pz, splay, footLie, toe, grounded) {
    const hind = i >= 2;
    const side = i % 2 === 0 ? -1 : 1;
    const b = BONE.flU + i * 4;
    const L = LEN[hind ? 1 : 0];
    let ex = px - jx;
    let ey = py - jy;
    let ez = pz - jz;
    let d = hyp3(ex, ey, ez);
    if (d < 1e-5) {
      ex = 0;
      ey = -1;
      ez = 0;
      d = 1;
    }
    ex /= d;
    ey /= d;
    ez /= d;
    /* Forward, turned out: a knee goes out as it goes forward, an elbow out
     * as it goes back, so the plane turns the other way for a fore leg. */
    const turn = (hind ? 1 : -1) * side * splay;
    const fx0 = Math.cos(turn);
    const fz0 = Math.sin(turn);
    /* The plane's side: the leg's line crossed with forward. */
    let nx = ey * fz0;
    let ny = ez * fx0 - ex * fz0;
    let nz = -ey * fx0;
    const nl = hyp3(nx, ny, nz);
    if (nl < 1e-3) {
      /* The leg points straight forward or back: level will do. */
      nx = -fz0;
      ny = 0;
      nz = fx0;
    } else {
      nx /= nl;
      ny /= nl;
      nz /= nl;
    }
    const lm = L[2];
    let ax;
    let ay;
    let az;
    if (grounded) {
      /* Up and forward as nearly as the plane allows. */
      let ux = -nx * ny;
      let uy = 1 - ny * ny;
      let uz = -nz * ny;
      const ul = hyp3(ux, uy, uz) || 1;
      ux /= ul;
      uy /= ul;
      uz /= ul;
      const gx = uy * nz - uz * ny;
      const gy = uz * nx - ux * nz;
      const gz = ux * ny - uy * nx;
      const rest = FOOT_REST[hind ? 1 : 0];
      let beta = rest + footLie * (Math.PI / 2 - rest);
      /* The hock and the wrist stay off the ground. */
      const most = Math.acos(clamp((0.0135 - py) / lm, -1, 1));
      if (beta > most) {
        beta = most;
      }
      const cb = Math.cos(beta);
      const sb = Math.sin(beta);
      ax = px + lm * (ux * cb - gx * sb);
      ay = py + lm * (uy * cb - gy * sb);
      az = pz + lm * (uz * cb - gz * sb);
    } else {
      /* In the plane, square to the leg's line, toward the front. */
      const fx = ny * ez - nz * ey;
      const fy = nz * ex - nx * ez;
      const fz = nx * ey - ny * ex;
      const cl = Math.cos(footLie);
      const sl = Math.sin(footLie);
      ax = px + lm * (-ex * cl - fx * sl);
      ay = py + lm * (-ey * cl - fy * sl);
      az = pz + lm * (-ez * cl - fz * sl);
    }
    let ux = ax - jx;
    let uy = ay - jy;
    let uz = az - jz;
    let ud = hyp3(ux, uy, uz);
    const most = L[0] + L[1] - 0.0012;
    const least = Math.abs(L[0] - L[1]) + 0.006;
    legOut.over = 0;
    let qx = px;
    let qy = py;
    let qz = pz;
    if (ud > most) {
      /* Out of reach: straighten at it, and the paw comes with the leg. */
      legOut.over = ud - most;
      const k = most / ud;
      const nax = jx + ux * k;
      const nay = jy + uy * k;
      const naz = jz + uz * k;
      qx += nax - ax;
      qy += nay - ay;
      qz += naz - az;
      ax = nax;
      ay = nay;
      az = naz;
      ud = most;
    } else if (ud < least) {
      if (ud < 1e-5) {
        ux = 0;
        uy = -1;
        uz = 0;
        ud = 1;
      }
      const k = least / ud;
      ax = jx + ux * k;
      ay = jy + uy * k;
      az = jz + uz * k;
      ud = least;
    }
    ux = (ax - jx) / ud;
    uy = (ay - jy) / ud;
    uz = (az - jz) / ud;
    /* Square to that line in the plane, toward the front. */
    const vx = ny * uz - nz * uy;
    const vy = nz * ux - nx * uz;
    const vz = nx * uy - ny * ux;
    const along = (L[0] * L[0] - L[1] * L[1] + ud * ud) / (2 * ud);
    const off = Math.sqrt(Math.max(0, L[0] * L[0] - along * along)) * (hind ? 1 : -1);
    const kx = jx + ux * along + vx * off;
    const ky = jy + uy * along + vy * off;
    const kz = jz + uz * along + vz * off;
    if (hind) {
      seg(b, jx, jy, jz, kx, ky, kz, nx, ny, nz, REST.hip, REST.knee);
      seg(b + 1, kx, ky, kz, ax, ay, az, nx, ny, nz, REST.knee, REST.hock);
      seg(b + 2, ax, ay, az, qx, qy, qz, nx, ny, nz, REST.hock, REST.hindPaw);
    } else {
      seg(b, jx, jy, jz, kx, ky, kz, nx, ny, nz, REST.shoulder, REST.elbow);
      seg(b + 1, kx, ky, kz, ax, ay, az, nx, ny, nz, REST.elbow, REST.wrist);
      seg(b + 2, ax, ay, az, qx, qy, qz, nx, ny, nz, REST.wrist, REST.forePaw);
    }
    /* The paw: along the ground ahead of the leg, toes turned up by `toe`. */
    let hx = nz;
    let hz = -nx;
    const hl = hyp2(hx, hz);
    if (hl < 1e-4) {
      hx = 1;
      hz = 0;
    } else {
      hx /= hl;
      hz /= hl;
    }
    const ct = Math.cos(toe);
    const st = Math.sin(toe);
    aim(b + 3, hx * ct, st, hz * ct, -hz, 0, hx, 1, 0);
    PIV[(b + 3) * 3] = qx;
    PIV[(b + 3) * 3 + 1] = qy;
    PIV[(b + 3) * 3 + 2] = qz;
  }

  function reset() {
    seeded = false;
    phase = 0;
    clock = 0;
    stepCool = 0;
    wagPhase = 0;
    tailSide.fill(0);
    q.set(POSES[POSTURE.stand]);
    headYaw = 0;
    headPitch = 0;
    headTilt = 0;
    lookW = 0;
    earL = 0;
    earR = 0;
    flatL = 0;
    flatR = 0;
    jaw = 0;
    whisk = 0;
    bristle = 0;
    lowE = 0;
    wiggleE = 0;
    giveE = 0;
    airArch = 0;
    leanE = 0;
    pitchE = 0;
    rollE = 0;
    turnE = 0;
    speedE = 0;
    bob = 0;
  }

  /* Start foot `i` swinging to where it will be wanted. */
  function swing(i, dur, lift, stance) {
    const f = foot[i];
    f.fromX = f.x;
    f.fromY = f.y;
    f.fromZ = f.z;
    f.t = 0;
    f.dur = dur;
    f.lift = lift;
    f.stance = stance;
    f.mode = 1;
  }

  function step(dt, c) {
    clock += dt;
    rootX = c.x;
    rootZ = c.z;
    cosY = Math.cos(c.yaw);
    sinY = Math.sin(c.yaw);
    if (!seeded) {
      lastYaw = c.yaw;
      q.set(POSES[c.posture] || POSES[0]);
      for (let i = 0; i < 4; i += 1) {
        const f = foot[i];
        toWorld(homeX(i), REST.pawY, homeZ(i));
        f.x = wld[0];
        f.y = wld[1];
        f.z = wld[2];
        f.mode = 0;
        f.toe = 0;
        f.load = 1;
      }
      seeded = true;
    }
    /* How fast it is going over the ground, as a cat feels it, and how
     * fast it is turning. */
    const speed = hyp2(c.vx, c.vz) / S;
    speedE += (speed - speedE) * ease(dt, 0.04);
    const turnRate = dt > 0 ? wrapAngle(c.yaw - lastYaw) / dt : turnE;
    lastYaw = c.yaw;
    turnE += (clamp(turnRate, -9, 9) - turnE) * ease(dt, 0.06);

    /* The posture, eased. */
    want.set(POSES[c.posture] || POSES[0]);
    lowE += (c.low - lowE) * ease(dt, 0.12);
    if (lowE > 0.001) {
      want[Q.hipY] -= 0.026 * lowE;
      want[Q.chestY] -= 0.03 * lowE;
      want[Q.splayF] += 0.25 * lowE;
      want[Q.splayH] += 0.25 * lowE;
      want[Q.footH] += 0.25 * lowE;
    }
    const k = ease(dt, c.quick);
    for (let i = 0; i < Q.N; i += 1) {
      q[i] += (want[i] - q[i]) * k;
    }
    wiggleE += (c.wiggle - wiggleE) * ease(dt, 0.08);
    giveE += (c.give - giveE) * ease(dt, 0.03);
    leanE += (c.lean - leanE) * ease(dt, 0.1);
    pitchE += (c.pitch - pitchE) * ease(dt, 0.035);
    rollE += (c.roll - rollE) * ease(dt, 0.035);
    const inAir = c.posture === POSTURE.air;
    const frozen = c.still === true;

    /* THE GAIT. Which one by speed, eased between, and the stride run on. */
    let g = 0;
    while (g < GAITS.length - 1 && speedE > GAITS[g].to) {
      g += 1;
    }
    const G = GAITS[g];
    const strideLen = G.stride[0] + G.stride[1] * speedE;
    const mixK = ease(dt, 0.1);
    for (let i = 0; i < 4; i += 1) {
      /* The nearer way round the stride. */
      let d = G.at[i] - gaitAt[i];
      d -= Math.round(d);
      gaitAt[i] += d * mixK;
    }
    const dutyWant = Math.min(G.duty, STANCE_MOST / strideLen);
    duty += (dutyWant - duty) * mixK;
    liftH += (G.lift - liftH) * mixK;
    const moving = speedE > 0.03 && !inAir && !frozen;
    const hz = moving ? speedE / strideLen : 0;
    const before = phase;
    phase += hz * dt;
    const swingDur = hz > 0 ? clamp((1 - duty) / hz, 0.07, 0.6) : 0.2;
    const stanceDur = hz > 0 ? duty / hz : 0;

    /* THE FEET: which lift now. */
    let swinging = 0;
    for (let i = 0; i < 4; i += 1) {
      if (foot[i].mode === 1) {
        swinging += 1;
      }
    }
    for (let i = 0; i < 4; i += 1) {
      const f = foot[i];
      const letGo = i >= 2
        ? c.freeHind > 0.5 || (inAir && f.mode === 2)
        : inAir || (i === FL ? c.freeL : c.freeR) > 0.5;
      if (letGo) {
        if (f.mode !== 2) {
          f.mode = 2;
          f.fresh = true;
        }
        continue;
      }
      if (f.mode === 2) {
        /* Coming back to the ground: a quick reach to where it is wanted. */
        swing(i, 0.085, 0.006, 0);
        swinging += 1;
        continue;
      }
      if (moving && f.mode === 0) {
        const was = frac(before - gaitAt[i]);
        const now = frac(phase - gaitAt[i]);
        /* It lifts as its share of the stride passes its duty. */
        if (was < duty && now >= duty) {
          swing(i, swingDur, liftH, stanceDur);
          swinging += 1;
        }
      }
    }
    if (!moving && !inAir && !frozen) {
      /* Standing: a foot left too far from where it is wanted is picked up
       * and put right, the worst first, one at a time unless the cat is
       * turning fast, when the opposite corner may go with it. */
      stepCool -= dt;
      if (stepCool <= 0) {
        let worst = -1;
        let far = 0.026 * 0.026;
        for (let j = 0; j < 4; j += 1) {
          const f = foot[j];
          if (f.mode !== 0) {
            continue;
          }
          homeWorld(j, c, 0.1);
          const ex = (f.x - wld[0]) / S;
          const ez = (f.z - wld[2]) / S;
          const e2 = ex * ex + ez * ez;
          if (e2 > far) {
            far = e2;
            worst = j;
          }
        }
        if (worst >= 0) {
          const urgent = far > 0.06 * 0.06;
          const pair = foot[3 - worst].mode === 1;
          if (swinging === 0 || (urgent && swinging === 1 && pair) || (far > 0.1 * 0.1 && swinging < 3)) {
            swing(worst, urgent ? 0.1 : 0.15, urgent ? 0.016 : 0.022, 0);
            stepCool = urgent ? 0.025 : 0.08;
          }
        }
      }
    }
    /* The swings. */
    for (let i = 0; i < 4; i += 1) {
      const f = foot[i];
      if (f.mode !== 1) {
        continue;
      }
      /* Stopped dead, a fore paw that was coming up stays up. */
      if (!(frozen && i < 2 && f.t >= f.dur * 0.42)) {
        f.t += dt;
      }
      const s = clamp(f.t / f.dur, 0, 1);
      homeWorld(i, c, frozen ? 0 : (1 - s) * f.dur + f.stance * 0.5);
      const e = smooth(s);
      f.x = lerp(f.fromX, wld[0], e);
      f.z = lerp(f.fromZ, wld[2], e);
      /* Up quickly, carried, and set down: a cat places a paw. */
      const arc = Math.sin(Math.PI * Math.pow(s, 0.85));
      f.y = lerp(f.fromY, S * REST.pawY, e) + S * f.lift * arc;
      f.toe = -0.85 * arc;
      if (s >= 1) {
        f.mode = 0;
        f.y = S * REST.pawY;
        f.toe = 0;
      }
    }

    /* THE BODY. The hips, then the spine forward to the chest. */
    const stride2 = phase * 2 * Math.PI;
    const run = moving ? smooth((speedE - 2.2) / 0.8) : 0;
    const trot = moving ? smooth((speedE - 0.9) / 0.4) * (1 - run) : 0;
    const walk = moving ? smooth(speedE / 0.25) * (1 - smooth((speedE - 0.9) / 0.4)) : 0;
    /* The body rides up and down twice a stride at a walk and a trot, once
     * at a run, where it also rocks and the spine folds and opens: folded
     * as the hind feet come down under it, at full stretch over the fore. */
    const bobWant = (walk * 0.003 + trot * 0.007) * Math.sin(stride2 * 2 + 0.6) + run * 0.016 * Math.sin(stride2 + 2.4);
    bob += (bobWant - bob) * ease(dt, 0.03);
    const rock = run * 0.15 * Math.sin(stride2 + 0.6);
    const fold = run * 0.42 * Math.cos(stride2 + 0.3);
    const sway = (walk * 0.1 + trot * 0.05) * Math.sin(stride2 + 1.2);
    const breath = 0.0016 * Math.sin(clock * 2.4);
    /* The wiggle: the hindquarters side to side four or five times a second,
     * faster as it builds, the rump rolling and swinging with it. */
    const wigRate = 26 + 10 * wiggleE;
    const wigA = wiggleE > 0.005 ? wiggleE * Math.sin(clock * wigRate) : 0;
    const wigB = wiggleE > 0.005 ? wiggleE * Math.sin(clock * wigRate + 1.3) : 0;
    const hipSide = 0.014 * wigA + 0.005 * walk * Math.sin(stride2 + 1.2);
    const hipRoll = 0.17 * wigA + leanE * 0.6 + rollE;
    const hipYaw = 0.13 * wigB + sway * 0.5;
    const hipY = q[Q.hipY] - giveE * 0.07 + bob + c.lift - run * 0.01 + 0.006 * Math.abs(wigA);
    const chestY = q[Q.chestY] - giveE * 0.085 + bob * 0.8 + c.lift - run * 0.012 + breath;
    /* A leap straight up is made at full stretch, the back hollow, and the
     * body folds as it comes down, the way a cat brings its feet under it. */
    const airWant = inAir && c.up > 0.5 ? lerp(-0.34, 0.3, smooth((c.air - 0.5) / 0.3)) * (1 - smooth((c.air - 0.86) / 0.14)) : 0;
    airArch += (airWant - airArch) * ease(dt, 0.05);
    const arch = q[Q.arch] + fold + giveE * 0.3 + airArch;
    /* The line from hips to chest climbs by this much. A rock, or a leap's
     * own pitch, turns the body about its middle and not its hips. */
    const base = Math.asin(clamp((chestY - hipY - SPINE_RISE) / SPINE_LEN, -0.98, 0.98));
    const climb = base + rock + pitchE;
    const mid = SPINE_LEN * 0.5;
    const bend = clamp(turnE * 0.06, -0.45, 0.45);
    PIV[BONE.hips * 3] = REST.hips[0] + q[Q.hipX] + mid * (Math.cos(base) - Math.cos(climb));
    PIV[BONE.hips * 3 + 1] = hipY + mid * (Math.sin(base) - Math.sin(climb));
    PIV[BONE.hips * 3 + 2] = hipSide;
    euler(ROT, BONE.hips * 9, hipYaw - bend * 0.5, climb + arch / 3, hipRoll);
    carry(BONE.spine1, BONE.hips);
    turnFrom(BONE.spine1, BONE.hips, bend * 0.4 - hipYaw * 0.5, -arch / 3, -hipRoll * 0.35 + rollE * 0.35);
    carry(BONE.spine2, BONE.spine1);
    turnFrom(BONE.spine2, BONE.spine1, bend * 0.4 - hipYaw * 0.4, -arch / 3, -hipRoll * 0.35 + rollE * 0.35);
    carry(BONE.chest, BONE.spine2);
    turnFrom(BONE.chest, BONE.spine2, bend * 0.3 - sway * 0.3, -arch / 3, -hipRoll * 0.3 + rollE * 0.3 + leanE * 0.2);

    /* THE NECK AND HEAD. The head looks where it is told, against the
     * world and not the body, so it stays level through a stride. */
    carry(BONE.neck, BONE.chest);
    lookW += (c.look - lookW) * ease(dt, 0.07);
    toCat(c.lookX, c.lookY, c.lookZ);
    {
      const hx = loc[0] - PIV[BONE.neck * 3] - 0.05;
      const hy = loc[1] - PIV[BONE.neck * 3 + 1] - 0.045;
      const hzz = loc[2] - PIV[BONE.neck * 3 + 2];
      const toYaw = Math.atan2(-hzz, hx);
      const toPitch = Math.atan2(hy, hyp2(hx, hzz));
      const wantYaw = clamp(toYaw, -2.1, 2.1) * lookW;
      const wantPitch = clamp(toPitch, -1.0, 1.4) * lookW;
      /* Fast, as a cat's head is, but it is carried there. */
      const hk = ease(dt, 0.035);
      headYaw += clamp((wantYaw - headYaw) * hk, -13 * dt, 13 * dt);
      headPitch += clamp((wantPitch - headPitch) * hk, -11 * dt, 11 * dt);
      /* What the head has yet to turn: the eyes are there already. */
      lead[0] = lookW * wrapAngle(toYaw - bend * 0.6 - headYaw);
      lead[1] = lookW * (toPitch - headPitch);
    }
    headTilt += (c.tilt - headTilt) * ease(dt, 0.08);
    const bodyYaw = bend * 0.6;
    euler(ROT, BONE.neck * 9, bodyYaw + headYaw * 0.42, q[Q.neck] + headPitch * 0.5 + pitchE * 0.4, headTilt * 0.3);
    carry(BONE.head, BONE.neck);
    euler(ROT, BONE.head * 9, bodyYaw + headYaw, headPitch + (1 - lookW) * q[Q.neck] * 0.3, headTilt);
    jaw += (c.jaw - jaw) * ease(dt, 0.025);
    carry(BONE.jaw, BONE.head);
    turnFrom(BONE.jaw, BONE.head, 0, -jaw, 0);
    earL += (c.earL - earL) * ease(dt, 0.05);
    earR += (c.earR - earR) * ease(dt, 0.05);
    flatL += (c.flatL - flatL) * ease(dt, 0.045);
    flatR += (c.flatR - flatR) * ease(dt, 0.045);
    carry(BONE.earL, BONE.head);
    carry(BONE.earR, BONE.head);
    /* An ear turns out about its own height, and lies back and out. */
    turnFrom(BONE.earL, BONE.head, earL, 0.9 * flatL, -0.8 * flatL);
    turnFrom(BONE.earR, BONE.head, -earR, 0.9 * flatR, 0.8 * flatR);
    whisk += (c.whisk - whisk) * ease(dt, 0.06);
    carry(BONE.whiskL, BONE.head);
    carry(BONE.whiskR, BONE.head);
    turnFrom(BONE.whiskL, BONE.head, -0.5 * whisk, 0, 0.12 * whisk);
    turnFrom(BONE.whiskR, BONE.head, 0.5 * whisk, 0, -0.12 * whisk);

    /* THE TAIL. Its root is carried against the ground; each bone after
     * turns a little from the last, and a sweep runs down it late, so the
     * tip arrives after the root and the whole thing whips. The tail is
     * modelled lying straight back, so a turn up at the root is a turn the
     * other way about the cat's side. */
    bristle += (c.bristle - bristle) * ease(dt, 0.07);
    carry(BONE.tail1, BONE.hips);
    {
      wagPhase += dt * 2 * Math.PI * c.wagHz;
      if (wagPhase > 1e4) {
        wagPhase -= 1e4;
      }
      const tk = ease(dt, 0.045);
      let prev = c.wag * Math.sin(wagPhase) - turnE * 0.04 + rollE * 0.4 + sway * 0.6;
      for (let j = 0; j < TAIL; j += 1) {
        tailSide[j] += (prev - tailSide[j]) * (j === 0 ? ease(dt, 0.02) : tk);
        prev = tailSide[j];
      }
      const up = q[Q.tailP] + c.tailUp + (inAir ? 0.35 + 0.5 * pitchE : 0) + run * 0.45 - giveE * 0.3;
      const tw = c.twitch * Math.sin(clock * 19) * (0.55 + 0.45 * Math.sin(clock * 2.7));
      euler(ROT, BONE.tail1 * 9, -bodyYaw * 0.4 + tailSide[0] + q[Q.tailY] * 0.5, -up, 0);
      const curl = q[Q.tailC] + (inAir ? (c.up > 0.5 ? 0.09 : -0.06) : 0) - run * 0.05;
      for (let j = 1; j < TAIL; j += 1) {
        const b = BONE.tail1 + j;
        carry(b, b - 1);
        const tip = (j / (TAIL - 1)) * (j / (TAIL - 1));
        turnFrom(b, b - 1, tailSide[j] - tailSide[j - 1] + q[Q.tailY] + tw * tip, -curl - 0.3 * tw * tip, 0);
      }
    }

    /* THE LEGS. A fore leg hangs from its shoulder blade, which rides the
     * chest and stands up above it when the chest is let down between the
     * two; a hind leg from the hips. */
    for (let i = 0; i < 4; i += 1) {
      const f = foot[i];
      const hind = i >= 2;
      const side = i % 2 === 0 ? -1 : 1;
      const top = hind ? BONE.hips : BONE.chest;
      const b = BONE.flU + i * 4;
      const o = top * 9;
      const dx = PIVOT[b * 3] - PIVOT[top * 3];
      const dy = PIVOT[b * 3 + 1] - PIVOT[top * 3 + 1];
      const dz = PIVOT[b * 3 + 2] - PIVOT[top * 3 + 2];
      let jx = PIV[top * 3] + ROT[o] * dx + ROT[o + 1] * dy + ROT[o + 2] * dz;
      let jy = PIV[top * 3 + 1] + ROT[o + 3] * dx + ROT[o + 4] * dy + ROT[o + 5] * dz;
      const jz = PIV[top * 3 + 2] + ROT[o + 6] * dx + ROT[o + 7] * dy + ROT[o + 8] * dz;
      let px;
      let py;
      let pz;
      let toe = f.toe;
      let lie = hind ? q[Q.footH] : q[Q.footF];
      let splay = hind ? q[Q.splayH] : q[Q.splayF];
      let grounded = true;
      f.load += ((f.mode === 0 ? 1 : 0) - f.load) * ease(dt, 0.06);
      if (!hind) {
        /* The blade: up as the chest drops, and up a little more over a paw
         * that is down and bearing, so the two work in turn as it walks. */
        jy += q[Q.blade] * (0.5 + 0.5 * f.load) + (walk + trot) * 0.007 * f.load;
      }
      if (f.mode === 2) {
        /* Let go. The paw is told where to be against its own joint, or
         * reaches for a point in the world, and is carried there, not put. */
        if (f.fresh) {
          toCat(f.x, f.y, f.z);
          f.ox = loc[0] - jx;
          f.oy = loc[1] - jy;
          f.oz = loc[2] - jz;
          f.fresh = false;
        }
        let tx;
        let ty;
        let tz;
        let quick = 0.03;
        const a = c.air;
        grounded = false;
        if (!hind) {
          const reach = i === FL ? c.reachL : c.reachR;
          if (reach > 0.5) {
            toCat(i === FL ? c.pawLX : c.pawRX, i === FL ? c.pawLY : c.pawRY, i === FL ? c.pawLZ : c.pawRZ);
            tx = loc[0] - jx;
            ty = loc[1] - jy;
            tz = loc[2] - jz;
            toe = i === FL ? c.toeL : c.toeR;
            lie = 0.12;
            splay = 0.3;
            quick = 0.014;
          } else {
            let lx;
            let ly;
            let lz;
            if (inAir && c.up > 0.5) {
              /* Straight up: the paws thrown high and wide as it leaves the
               * ground, clapped together on what is there at the top, held
               * a moment, thrown wide again and brought down for the
               * ground. They go up in front of the face, the chest's own
               * under side, and never through the head. */
              const rise = smooth(a / 0.26);
              const close = smooth((a - 0.4) / 0.1) * (1 - smooth((a - 0.62) / 0.12));
              const down = smooth((a - 0.74) / 0.24);
              lx = lerp(lerp(0.07, 0.205 + 0.012 * close, rise), 0.11, down);
              ly = lerp(lerp(-0.085, -0.02 - 0.03 * close, rise), -0.155, down);
              lz = side * lerp(lerp(0.035, lerp(0.125, 0.013, close), rise), 0.04, down) - side * HALF_F;
              toe = lerp(0.7, 0.1, down);
              lie = 0.05;
              splay = lerp(0.3, 0.1, close);
              if (close > 0.2) {
                quick = 0.012;
              }
            } else if (inAir) {
              /* A pounce: gathered as it leaves, thrown forward through the
               * middle of the leap, and reaching down for the ground. */
              const out = smooth(a / 0.3);
              const down = smooth((a - 0.6) / 0.34);
              lx = lerp(lerp(0.03, 0.158, out), 0.115, down);
              ly = lerp(lerp(-0.125, -0.03, out), -0.155, down);
              lz = side * lerp(0.03, 0.038, out) - side * HALF_F;
              toe = lerp(lerp(-0.6, 0.45, out), 0.1, down);
              lie = 0.1;
              splay = 0.15;
            } else {
              /* Held by the chest, wrist dropped. */
              lx = 0.07;
              ly = -0.085;
              lz = side * 0.032 - side * HALF_F;
              toe = -1.1;
              lie = 0.5;
              splay = 0.35;
            }
            /* Against the chest, however the chest is turned. */
            tx = ROT[o] * lx + ROT[o + 1] * ly + ROT[o + 2] * lz;
            ty = ROT[o + 3] * lx + ROT[o + 4] * ly + ROT[o + 5] * lz;
            tz = ROT[o + 6] * lx + ROT[o + 7] * ly + ROT[o + 8] * lz;
          }
        } else {
          /* The hind legs trail straight out behind as they leave, then
           * come forward under the belly to land. */
          let lx;
          let ly;
          if (c.up > 0.5) {
            /* Straight up: at full length behind it as they leave, toes
             * pointed, then drawn up under the belly, then down. */
            const push = 1 - smooth(a / 0.34);
            const down = smooth((a - 0.68) / 0.3);
            lx = lerp(lerp(-0.02, -0.195, push), 0.0, down);
            ly = lerp(lerp(-0.165, -0.09, push), -0.18, down);
            toe = lerp(lerp(-0.5, -1.25, push), -0.1, down);
            lie = lerp(lerp(0.7, 0.15, push), 0.25, down);
          } else {
            const trail = 1 - smooth((a - 0.28) / 0.34);
            const down = smooth((a - 0.7) / 0.28);
            lx = lerp(lerp(0.06, -0.2, trail), 0.02, down);
            ly = lerp(lerp(-0.105, -0.095, trail), -0.19, down);
            toe = lerp(lerp(-0.3, -1.25, trail), -0.1, down);
            lie = lerp(0.9, 0.15, trail);
          }
          const lz = side * 0.05 - side * HALF_H;
          tx = ROT[o] * lx + ROT[o + 1] * ly + ROT[o + 2] * lz;
          ty = ROT[o + 3] * lx + ROT[o + 4] * ly + ROT[o + 5] * lz;
          tz = ROT[o + 6] * lx + ROT[o + 7] * ly + ROT[o + 8] * lz;
          splay = 0.3;
        }
        const fk = ease(dt, quick);
        f.ox += (tx - f.ox) * fk;
        f.oy += (ty - f.oy) * fk;
        f.oz += (tz - f.oz) * fk;
        px = jx + f.ox;
        py = jy + f.oy;
        pz = jz + f.oz;
        if (py < REST.pawY) {
          py = REST.pawY;
        }
        f.toe += (toe - f.toe) * ease(dt, 0.03);
        toe = f.toe;
        toWorld(px, py, pz);
        f.x = wld[0];
        f.y = wld[1];
        f.z = wld[2];
      } else {
        toCat(f.x, f.y, f.z);
        px = loc[0];
        py = loc[1];
        pz = loc[2];
        if (hind && c.tread > 0 && f.mode === 0) {
          /* Treading: each hind foot off the ground in turn. */
          const tr = Math.max(0, Math.sin(clock * wigRate * 0.5 + (i === HL ? 0 : Math.PI)));
          py += 0.011 * c.tread * tr;
          toe = -0.3 * c.tread * tr;
        }
        if (f.mode === 1) {
          /* A swinging leg folds its foot under. */
          lie += 0.3 * Math.sin(Math.PI * clamp(f.t / f.dur, 0, 1));
        }
      }
      /* The joint slides with the paw: a shoulder blade over the ribs, the
       * hips rocking. It is where a cat finds its reach. */
      jx += hind ? clamp((px - jx) * 0.1, -0.016, 0.016) : clamp((px - jx) * 0.34, -0.05, 0.05);
      if (!hind) {
        const sb = i === FL ? BONE.bladeL : BONE.bladeR;
        for (let n = 0; n < 9; n += 1) {
          ROT[sb * 9 + n] = ROT[o + n];
        }
        PIV[sb * 3] = jx;
        PIV[sb * 3 + 1] = jy;
        PIV[sb * 3 + 2] = jz;
      }
      solveLeg(i, jx, jy, jz, px, py, pz, splay, lie, toe, grounded);
      if (f.mode === 0 && legOut.over > 0.006) {
        if (inAir && hind) {
          /* The push is spent: the hind feet leave the ground. */
          f.mode = 2;
          f.fresh = true;
        } else if (!inAir && !frozen) {
          /* It cannot reach its foot any more: the foot comes up early. */
          swing(i, moving ? Math.max(0.07, swingDur * 0.8) : 0.11, moving ? liftH : 0.02, moving ? stanceDur : 0);
        }
      }
    }

    /* The marks' bones are the drawing's to place (./catdraw.js): here they
     * are only left over the head, turned as the cat. */
    for (let b = BONE.mark; b <= BONE.puff; b += 1) {
      const o = b * 9;
      ROT[o] = 1;
      ROT[o + 1] = 0;
      ROT[o + 2] = 0;
      ROT[o + 3] = 0;
      ROT[o + 4] = 1;
      ROT[o + 5] = 0;
      ROT[o + 6] = 0;
      ROT[o + 7] = 0;
      ROT[o + 8] = 1;
      PIV[b * 3] = PIV[BONE.head * 3] + 0.015;
      PIV[b * 3 + 1] = PIV[BONE.head * 3 + 1] + 0.148;
      PIV[b * 3 + 2] = PIV[BONE.head * 3 + 2];
    }

    write();
  }

  /* The bones as the graphics card wants them: turned to the world, sized,
   * and each taking a corner from where it was modelled. A bristled tail is
   * wider and not longer: its bones grow across their length, about their
   * own line. */
  function write() {
    for (let b = 0; b < BONES; b += 1) {
      const o = b * 9;
      const fat = b >= BONE.tail1 && b <= BONE.tail6 ? 1 + 1.3 * bristle : 1;
      const r0 = ROT[o];
      const r1 = ROT[o + 1] * fat;
      const r2 = ROT[o + 2] * fat;
      const r3 = ROT[o + 3];
      const r4 = ROT[o + 4] * fat;
      const r5 = ROT[o + 5] * fat;
      const r6 = ROT[o + 6];
      const r7 = ROT[o + 7] * fat;
      const r8 = ROT[o + 8] * fat;
      const px = PIVOT[b * 3];
      const py = PIVOT[b * 3 + 1];
      const pz = PIVOT[b * 3 + 2];
      /* The pivot now, less the turned rest pivot. */
      const tx = PIV[b * 3] - (r0 * px + r1 * py + r2 * pz);
      const ty = PIV[b * 3 + 1] - (r3 * px + r4 * py + r5 * pz);
      const tz = PIV[b * 3 + 2] - (r6 * px + r7 * py + r8 * pz);
      const w = b * 12;
      bones[w] = S * (cosY * r0 + sinY * r6);
      bones[w + 1] = S * (cosY * r1 + sinY * r7);
      bones[w + 2] = S * (cosY * r2 + sinY * r8);
      bones[w + 3] = S * (cosY * tx + sinY * tz);
      bones[w + 4] = S * r3;
      bones[w + 5] = S * r4;
      bones[w + 6] = S * r5;
      bones[w + 7] = S * ty;
      bones[w + 8] = S * (-sinY * r0 + cosY * r6);
      bones[w + 9] = S * (-sinY * r1 + cosY * r7);
      bones[w + 10] = S * (-sinY * r2 + cosY * r8);
      bones[w + 11] = S * (-sinY * tx + cosY * tz);
    }
    for (let i = 0; i < PROBE.length; i += 1) {
      const p = PROBE[i];
      const b = p[0];
      const o = b * 9;
      toWorld(
        PIV[b * 3] + ROT[o] * p[1] + ROT[o + 1] * p[2] + ROT[o + 2] * p[3],
        PIV[b * 3 + 1] + ROT[o + 3] * p[1] + ROT[o + 4] * p[2] + ROT[o + 5] * p[3],
        PIV[b * 3 + 2] + ROT[o + 6] * p[1] + ROT[o + 7] * p[2] + ROT[o + 8] * p[3],
      );
      probes[i * 4] = wld[0];
      probes[i * 4 + 1] = wld[1];
      probes[i * 4 + 2] = wld[2];
      probes[i * 4 + 3] = S * p[4] * (b >= BONE.tail1 && b <= BONE.tail6 ? 1 + 1.3 * bristle : 1);
    }
  }

  /* A place on the cat, in the world, into `out` [x, y, z]. */
  const H = HEAD_SCALE;
  const PLACES = {
    head: [BONE.head, 0.03 * H, 0.012 * H, 0],
    eyes: [BONE.head, 0.07 * H, 0.016 * H, 0],
    nose: [BONE.head, 0.088 * H, -0.006 * H, 0],
    mouth: [BONE.head, 0.07 * H, -0.03 * H, 0],
    crown: [BONE.head, 0.015 * H, 0.06 * H, 0],
    chest: [BONE.chest, 0.03, -0.04, 0],
    hips: [BONE.hips, 0, -0.03, 0],
    pawL: [BONE.flP, 0.016, 0, 0],
    pawR: [BONE.frP, 0.016, 0, 0],
    shoulderL: [BONE.flU, 0, 0, 0],
    shoulderR: [BONE.frU, 0, 0, 0],
    hindL: [BONE.hlP, 0.01, 0, 0],
    hindR: [BONE.hrP, 0.01, 0, 0],
    tail: [BONE.tail6, -0.05, 0, 0],
  };
  function at(name, out) {
    const p = PLACES[name];
    const b = p[0];
    const o = b * 9;
    toWorld(
      PIV[b * 3] + ROT[o] * p[1] + ROT[o + 1] * p[2] + ROT[o + 2] * p[3],
      PIV[b * 3 + 1] + ROT[o + 3] * p[1] + ROT[o + 4] * p[2] + ROT[o + 5] * p[3],
      PIV[b * 3 + 2] + ROT[o + 6] * p[1] + ROT[o + 7] * p[2] + ROT[o + 8] * p[3],
    );
    out[0] = wld[0];
    out[1] = wld[1];
    out[2] = wld[2];
    return out;
  }

  /* The whole cat moved by this much over the ground, feet and all, after
   * a step: the last word of keeping it off the craft (./cat.js, which
   * moves the spot it asks for by the same). The bones are written against
   * the cat's spot, so they need nothing; the balls and the feet are the
   * world's and go with it. */
  function shift(dx, dz) {
    rootX += dx;
    rootZ += dz;
    for (let i = 0; i < PROBE.length; i += 1) {
      probes[i * 4] += dx;
      probes[i * 4 + 2] += dz;
    }
    carryFeet(dx, dz);
  }

  /* The highest any part of the cat reaches, world metres over the lawn. */
  function top() {
    let y = 0;
    for (let i = 0; i < PROBE.length; i += 1) {
      const t = probes[i * 4 + 1] + probes[i * 4 + 3];
      if (t > y) {
        y = t;
      }
    }
    return y;
  }

  /* The feet moved with the cat when the cat's spot is moved from under
   * it, so that they are not left behind to be stepped back to. */
  function carryFeet(dx, dz) {
    for (let i = 0; i < 4; i += 1) {
      foot[i].x += dx;
      foot[i].z += dz;
      foot[i].fromX += dx;
      foot[i].fromZ += dz;
    }
  }

  /* A fore paw is in the air and coming up: the moment to stop dead. */
  function poised() {
    return (foot[FL].mode === 1 && foot[FL].t < foot[FL].dur * 0.42) || (foot[FR].mode === 1 && foot[FR].t < foot[FR].dur * 0.42);
  }

  return {
    bones,
    probes,
    lead,
    step,
    at,
    shift,
    top,
    carryFeet,
    poised,
    reset,
    /* For the check, and for the drawing's dust. */
    feet: foot,
    state() {
      return { phase, speed: speedE, bristle, wiggle: wiggleE, turn: turnE };
    },
  };
}
