import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { trainDest, trainNumber } from '../core/textures.js';
import { box, cyl, bake, trs, rngKit } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { RAIL_TOP } from './railway.js';
import { R, CENTER, wrapX, wrapDelta } from './planet.js';

/* ------------------------------------------------------------------ *
 * A three-car suburban EMU: cream body, blue waist stripe, dark strip
 * windows.  Interiors are painted rather than modelled -- flat silhouette
 * blocks and a soft highlight sit directly on the glass, which is how a
 * background artist would draw a train going past.
 * ------------------------------------------------------------------ */

const L = 19.4;          // car length
const W = 2.86;          // body width
const PITCH = 20.1;      // car spacing
const FLOOR = 1.06;
const TOP = 3.74;
const ROOF = 3.96;
const CONTACT_WIRE_Y = 4.88;

const M = {};
function initMaterials() {
  if (M.body) return;
  M.body = cel({ color: PAL.trainBody, bands: 3, tint: 0x6f6796 });
  M.bodyShade = cel({ color: PAL.trainBodyShade, bands: 3, tint: 0x6f6796 });
  M.stripe = cel({ color: PAL.trainStripe, bands: 3, tint: 0x4a4a92 });
  M.stripe2 = cel({ color: PAL.trainStripe2, bands: 3, tint: 0x3f5a8a });
  M.roof = cel({ color: PAL.trainRoof, bands: 3, tint: 0x60597f });
  M.skirt = cel({ color: PAL.trainSkirt, bands: 3, tint: 0x5b5480 });
  M.window = flat({ color: PAL.trainWindow });
  M.windowLit = flat({ color: PAL.trainWindowLit });
  M.door = cel({ color: PAL.trainDoor, bands: 3, tint: 0x6f6796 });
  M.dark = cel({ color: PAL.black, bands: 2, tint: 0x4b4560 });
  M.metal = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.wheel = cel({ color: 0x4a4552, bands: 2, tint: 0x4b4560 });
  M.headlight = flat({ color: 0xfff6da });
  M.tail = flat({ color: 0xff5a4a });
}

/** Window bays for one car side: [centreX, width] */
const DOORS = [-7.0, -2.4, 2.4, 7.0];
const DOOR_W = 1.32;
const BAYS = [
  [-8.5, 1.7], [-4.7, 3.2], [0, 3.4], [4.7, 3.2], [8.5, 1.7],
];

/**
 * Glass sits *outside* the window frame, not level with it -- otherwise the
 * frame box wins the depth test and the whole side of the train reads as a
 * blank panel.
 */
function addGlass(group, cx, w, sz, rng) {
  const y0 = 2.16, y1 = 3.16;
  const zz = sz * (W / 2 + 0.032);
  const g = new THREE.Mesh(new THREE.PlaneGeometry(w, y1 - y0), M.window);
  g.position.set(cx, (y0 + y1) / 2, zz);
  g.rotation.y = sz > 0 ? 0 : Math.PI;
  g.userData.noOutline = true;
  group.add(g);

  /* What you see through a train window, with nobody on the train.
   *
   * This used to be painted silhouettes of standing passengers -- a plane for
   * the body and a `CircleGeometry` for the head -- which is a straight breach
   * of the one constraint the whole project hangs on: no people anywhere, not
   * as geometry and not as silhouettes.  It also flickered, because the head
   * sat 6 mm off the glass and z-fought with it at range; that flicker is what
   * finally drew attention to it.
   *
   * What replaces it is the interior itself, which is what actually reads from
   * outside: the lit ceiling strip, the grab rail, and the dark band of seat
   * backs along the bottom of the glass.  Three horizontal bands, no figures,
   * and it fills the window better than the silhouettes did.
   *
   * Offsets are 18 mm and more, well clear of the depth precision that killed
   * the old version.  `rng` is still drawn from so the seeded sequence -- and
   * therefore every other random decision on the train -- is unchanged. */
  rng.next();
  const H = y1 - y0;
  const band = (yFrac, hh, col, off) => {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, hh), flat({ color: col }));
    b.position.set(cx, y0 + H * yFrac, zz + sz * off);
    b.rotation.y = sz > 0 ? 0 : Math.PI;
    b.userData.noOutline = true;
    group.add(b);
    return b;
  };
  band(0.14, H * 0.28, 0x515a72, 0.018);        // seat backs
  band(0.30, 0.035, 0x9fa8bb, 0.021);           // the top edge of the seat run
  band(0.72, 0.045, 0xb9c0cc, 0.021);           // grab rail
  band(0.93, 0.07, 0xf0ead8, 0.018);            // ceiling light strip

  // One flat diagonal highlight, the animator's shorthand for glass.  Kept
  // narrow and short: a big rotated quad overshoots the window and reads as a
  // pale smear across the bodywork.
  const hi = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.2, (y1 - y0) * 0.95),
    flat({ color: 0xdfeaf6, transparent: true, opacity: 0.13, depthWrite: false })
  );
  hi.position.set(cx - w * 0.2, (y0 + y1) / 2, zz + sz * 0.012);
  hi.rotation.set(0, sz > 0 ? 0 : Math.PI, 0.24);
  hi.userData.noOutline = true;
  group.add(hi);
}

function buildCar({ cab = false, tail = false, rng }) {
  const car = new THREE.Group();
  const parts = { body: [], stripe: [], roof: [], skirt: [], door: [], dark: [], metal: [] };

  const bodyH = TOP - FLOOR;
  parts.body.push({
    geometry: new THREE.BoxGeometry(L, bodyH, W),
    matrix: trs(0, (FLOOR + TOP) / 2, 0),
  });

  // roof: slightly inset, flatter tone
  parts.roof.push({
    geometry: new THREE.BoxGeometry(L - 0.1, ROOF - TOP, W - 0.24),
    matrix: trs(0, (TOP + ROOF) / 2, 0),
  });
  // rain gutter line
  for (const s of [-1, 1]) {
    parts.roof.push({
      geometry: new THREE.BoxGeometry(L - 0.05, 0.07, 0.1),
      matrix: trs(0, TOP + 0.02, s * (W / 2 - 0.06)),
    });
  }

  // waist stripe, wrapped round the whole body
  const stripeY = 1.92, stripeH = 0.34;
  parts.stripe.push({
    geometry: new THREE.BoxGeometry(L + 0.02, stripeH, W + 0.03),
    matrix: trs(0, stripeY, 0),
  });
  parts.stripe.push({
    geometry: new THREE.BoxGeometry(L + 0.02, 0.07, W + 0.04),
    matrix: trs(0, stripeY - stripeH / 2 - 0.055, 0),
  });

  // underframe + skirt
  parts.skirt.push({
    geometry: new THREE.BoxGeometry(L - 0.3, 0.5, W - 0.34),
    matrix: trs(0, FLOOR - 0.25, 0),
  });
  parts.skirt.push({
    geometry: new THREE.BoxGeometry(L - 1.6, 0.28, W - 0.8),
    matrix: trs(0, FLOOR - 0.52, 0),
  });

  // doors and glass
  for (const sz of [1, -1]) {
    for (const dx of DOORS) {
      parts.door.push({
        geometry: new THREE.BoxGeometry(DOOR_W, TOP - FLOOR - 0.12, 0.05),
        matrix: trs(dx, (FLOOR + TOP) / 2 - 0.02, sz * (W / 2 + 0.012)),
      });
      parts.dark.push({
        geometry: new THREE.BoxGeometry(0.05, TOP - FLOOR - 0.12, 0.06),
        matrix: trs(dx, (FLOOR + TOP) / 2 - 0.02, sz * (W / 2 + 0.02)),
      });
      addGlass(car, dx, 0.94, sz, rng);
    }
    for (const [bx, bw] of BAYS) {
      // frame first, sitting flush with the body; glass goes on top of it
      parts.metal.push({
        geometry: new THREE.BoxGeometry(bw + 0.12, 1.14, 0.035),
        matrix: trs(bx, 2.66, sz * (W / 2 + 0.008)),
      });
      addGlass(car, bx, bw, sz, rng);
    }
  }

  // bogies
  for (const bx of [-6.3, 6.3]) {
    parts.metal.push({
      geometry: new THREE.BoxGeometry(2.9, 0.42, W - 0.9),
      matrix: trs(bx, 0.78, 0),
    });
    parts.dark.push({
      geometry: new THREE.BoxGeometry(3.3, 0.2, 0.28),
      matrix: trs(bx, 0.62, 0),
    });
  }

  // roof equipment
  for (const rx of [-5.6, -1.4, 3.2, 7.4]) {
    parts.roof.push({
      geometry: new THREE.BoxGeometry(2.1, 0.3, 1.5),
      matrix: trs(rx, ROOF + 0.13, rx % 2 === 0 ? 0.18 : -0.18),
    });
  }
  for (const rx of [-8.2, 0.6, 8.6]) {
    parts.metal.push({
      geometry: new THREE.BoxGeometry(0.7, 0.16, 0.7),
      matrix: trs(rx, ROOF + 0.07, -0.7),
    });
  }

  /* ------------------------------- cab end ------------------------------- */
  if (cab || tail) {
    const s = cab ? 1 : -1;
    const fx = s * (L / 2);
    // black mask around the windscreen
    parts.dark.push({
      geometry: new THREE.BoxGeometry(0.1, 1.34, W - 0.22),
      matrix: trs(fx + s * 0.03, 2.86, 0),
    });
    // windscreen: two panes with a centre pillar
    for (const wz of [-0.72, 0.72]) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.16, 1.02), M.window);
      pane.position.set(fx + s * 0.085, 2.88, wz);
      pane.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      pane.userData.noOutline = true;
      car.add(pane);
      const hi = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3, 0.98),
        flat({ color: 0xe4eef8, transparent: true, opacity: 0.16, depthWrite: false })
      );
      hi.position.set(fx + s * 0.095, 2.88, wz - 0.26);
      hi.rotation.set(0, s > 0 ? Math.PI / 2 : -Math.PI / 2, 0.26);
      hi.userData.noOutline = true;
      car.add(hi);
    }
    parts.body.push({
      geometry: new THREE.BoxGeometry(0.12, 1.4, 0.16),
      matrix: trs(fx + s * 0.05, 2.86, 0),
    });

    // destination board
    const dest = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.38),
      flat({ color: 0xffffff, map: trainDest(), cache: false })
    );
    dest.position.set(fx + s * 0.09, 3.52, 0);
    dest.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    dest.userData.noOutline = true;
    car.add(dest);
    parts.dark.push({
      geometry: new THREE.BoxGeometry(0.08, 0.5, 1.66),
      matrix: trs(fx + s * 0.04, 3.52, 0),
    });

    // head / tail lights
    for (const lz of [-1.06, 1.06]) {
      parts.dark.push({
        geometry: new THREE.BoxGeometry(0.14, 0.42, 0.5),
        matrix: trs(fx + s * 0.05, 1.55, lz),
      });
      const lamp = new THREE.Mesh(
        new THREE.PlaneGeometry(0.34, 0.16),
        cab ? M.headlight : M.tail
      );
      lamp.position.set(fx + s * 0.13, 1.63, lz);
      lamp.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      lamp.userData.noOutline = true;
      car.add(lamp);
      const lamp2 = new THREE.Mesh(
        new THREE.PlaneGeometry(0.34, 0.14),
        cab ? M.tail : M.headlight
      );
      lamp2.position.set(fx + s * 0.13, 1.44, lz);
      lamp2.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      lamp2.userData.noOutline = true;
      car.add(lamp2);
    }

    // front skirt + coupler
    parts.skirt.push({
      geometry: new THREE.BoxGeometry(0.34, 0.78, W - 0.5),
      matrix: trs(fx + s * 0.1, 0.82, 0),
    });
    parts.dark.push({
      geometry: new THREE.BoxGeometry(0.5, 0.22, 0.34),
      matrix: trs(fx + s * 0.25, 0.62, 0),
    });

    // car number plate
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.24),
      flat({ color: 0xffffff, map: trainNumber(), cache: false })
    );
    plate.position.set(fx - s * 1.4, 1.42, W / 2 + 0.02);
    plate.userData.noOutline = true;
    car.add(plate);
  }

  /* ----------------------------- merged meshes ----------------------------- */
  const matFor = {
    body: M.body, stripe: M.stripe, roof: M.roof,
    skirt: M.skirt, door: M.door, dark: M.dark, metal: M.metal,
  };
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    car.add(mesh);
    if (key === 'body' || key === 'roof' || key === 'skirt') {
      hullOutline(mesh, { thickness: 0.0034 });
    }
  }

  /* -------------------------------- wheels --------------------------------
   * Two nested groups per wheel, and the nesting is the whole fix.
   *
   * These used to be bare meshes carrying their position on `position` and
   * their spin on `rotation.z`.  The planet bake folds a mesh's transform into
   * its geometry -- the geometry ends up in root space and `position` is reset
   * to the origin -- so after the bake `rotation.z` was no longer spinning each
   * wheel about its own axle: it was swinging root-space geometry about the
   * *world origin*, on a radius of about 7.4 m, at nine revolutions a second.
   * Twenty-four dark 0.86 m discs flying in circles and travelling with the
   * train, which is exactly how it was reported.
   *
   * So the hub is marked `planetRigid`: the bake re-seats it on the surface and
   * leaves the rig intact rather than baking its position away.  The axle
   * inside it is what spins, because writing `rotation.z` on the re-seated hub
   * would throw the seating away -- the same trap as the cloth in `details.js`.
   * The wheel is 0.86 m across, so leaving its geometry unbent costs nothing;
   * that is what `planetRigid` is for. */
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.43, 0.43, 0.14, 12);
  wheelGeo.rotateX(Math.PI / 2);
  for (const bx of [-6.3, 6.3]) {
    for (const wx of [-1.05, 1.05]) {
      for (const wz of [-0.72, 0.72]) {
        const hub = new THREE.Group();
        hub.position.set(bx + wx, RAIL_TOP + 0.43, wz);
        hub.userData.planetRigid = true;
        const axle = new THREE.Group();
        hub.add(axle);
        const w = new THREE.Mesh(wheelGeo, M.wheel);
        w.castShadow = true;
        axle.add(w);
        wheels.push(axle);
        car.add(hub);
      }
    }
  }

  /* ------------------------------ pantograph ------------------------------ */
  if (cab || tail) {
    const p = new THREE.Group();
    p.position.set(cab ? -4.0 : 4.0, ROOF + 0.05, 0);
    p.scale.y = (CONTACT_WIRE_Y - p.position.y) / 1.64;
    p.add(box(1.5, 0.08, 1.5, M.metal, 0, 0.04, 0));
    for (const s of [-1, 1]) {
      const lower = box(0.06, 0.9, 0.06, M.metal, s * 0.35, 0.5, 0);
      lower.rotation.z = s * 0.55;
      p.add(lower);
      const upper = box(0.05, 0.78, 0.05, M.metal, s * 0.0575, 1.247, 0);
      upper.rotation.z = s * 0.148;
      p.add(upper);
    }
    p.add(box(0.1, 0.06, 1.3, M.dark, 0, 1.6, 0));
    p.add(box(0.24, 0.05, 1.34, M.metal, 0, 1.64, 0));
    p.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    car.add(p);
  }

  return { car, wheels };
}

export function buildTrain(ctx) {
  initMaterials();
  const rng = rngKit(5150);
  const group = new THREE.Group();
  group.name = 'train';
  group.visible = false;
  ctx.add(group);

  const wheels = [];
  const cars = [];
  for (let i = 0; i < 3; i++) {
    const { car, wheels: w } = buildCar({ cab: i === 0, tail: i === 2, rng });
    car.position.x = (i - 1) * PITCH;
    group.add(car);
    cars.push(car);
    wheels.push(...w);
  }

  /* The track is the equator, a circle in the XY plane centred on the planet
   * centre. So travelling along it is exactly a rotation about the planet's Z
   * axis -- which means the cars can be bent onto the rail once at bake time
   * and then simply spun, with no per-frame re-projection and no sag. */
  const tC = new THREE.Matrix4().makeTranslation(CENTER.x, CENTER.y, CENTER.z);
  const tNegC = new THREE.Matrix4().makeTranslation(-CENTER.x, -CENTER.y, -CENTER.z);

  const api = {
    group,
    cars,
    wheels,
    length: PITCH * 3,
    dir: 1,
    x: 0,
    speed: 23.5,
    /** normalised progress, used by the petal wind */
    gust: 0,
    /** distance along the track from the crossing, signed, shortest way round */
    get offset() { return wrapDelta(this.x, 0); },

    /** Called once after the world is projected onto the planet. */
    planetize() {
      group.visible = true;
      group.matrixAutoUpdate = false;
      this.update(0);
    },

    update(dt) {
      this.x = wrapX(this.x + this.dir * this.speed * dt);

      // spin about the planet axis: T(C) · Rz(-x/R) · T(-C)
      group.matrix
        .makeRotationZ(-this.x / R)
        .premultiply(tC)
        .multiply(tNegC);
      group.matrixWorldNeedsUpdate = true;

      const spin = (this.speed * dt) / 0.43;
      for (const w of this.wheels) w.rotation.z -= spin * this.dir;

      // the wind that shoves the petals about as it goes through
      const near = Math.max(0, 1 - Math.abs(this.offset) / 46);
      this.gust = Math.max(this.gust * Math.exp(-dt * 1.4), near * near);
    },
  };
  return api;
}
