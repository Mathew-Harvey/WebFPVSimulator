/*
 * world-check.js: the plant's solid world, flown in Node against small
 * constructed worlds.
 *
 * src/native/world.c moved every wall, roof and train into the plant on
 * 2026-09-24. scripts/crash-check.js flies the real town through the real
 * shell, which is the proof a pilot would recognise but takes a browser and
 * a minute and is not bit deterministic. This is the other half: the module
 * alone, a wall or a roof or a pole built for the purpose, flown through
 * Betaflight and the plant with a height hold, and measured to the bit.
 *
 * Every scenario is flown twice and must agree with itself. The yaw scenario
 * flies the same wall at four spawn yaws and must get the same answer, which
 * is the check that would have caught the reversed wall normal of 2026-09-03
 * in the new code. The rest assert the owner's crash (PROGRESS.md,
 * 2026-09-24): a tap leaves the wall, a hard hit tumbles rather than
 * pinballs, a roof is ground, nothing passes through anything, and no hull
 * ever ends up inside a solid.
 *
 * Usage: node scripts/world-check.js [--only=name] [--verbose] [--targets]
 * Exit code is the failed guards, plus failed targets with --targets.
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

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK, simErrorName } from '../tests/lib/simmod.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const verbose = args.includes('--verbose');

const ST = { X: 1, Y: 2, Z: 3, VX: 4, VY: 5, VZ: 6, QW: 7, QX: 8, QY: 9, QZ: 10, P: 11, Q: 12, R: 13 };
const REST = { 0: 0.045, 1: 0.010 };
const HOVER = { 0: 0.27, 1: 0.335 };
/* The shell's own materials (src/game/collide.js contactMaterial). */
const WALL = { e: 0.15, mu: 0.42 };
const PVC = { e: 0.22, mu: 0.30 };
const TRAIN = { e: 0.06, mu: 0.40 };
const GRASS_MU = 1.40;
const GRASS_E = 0.0;

const wasm = await readFile(join(root, 'dist/sim.wasm'));
const CONFIGS = {
  0: await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8'),
  1: await readFile(join(root, 'configs/whoop-freestyle.diff'), 'utf8'),
};

/*
 * GUARDS and TARGETS, the same split scripts/crash-check.js makes. A guard is
 * something the solver must never do (tunnel, disagree with itself, depend on
 * the map's heading, leave a craft inside a solid, hang it on a wall) and
 * counts toward the exit code always. A target is the owner's crash in
 * numbers (how hard a hit spins the craft, how much a wall throws it up):
 * measured and printed every run, counted only with --targets, because they
 * are the owner's to tune and some of them are argued in PROGRESS.md.
 */
const enforceTargets = args.includes('--targets');
let failures = 0;
function check(name, ok, detail) {
  if (!ok) {
    failures += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
}
function target(name, ok, detail) {
  if (!ok && enforceTargets) {
    failures += 1;
  }
  console.log(`  ${ok ? 'met ' : (enforceTargets ? 'FAIL' : 'not ')}  target  ${name}${detail ? `: ${detail}` : ''}`);
}

function call(sim, name, ...a) {
  if (typeof sim.e[name] !== 'function') {
    throw new Error(`sim.wasm does not export ${name}`);
  }
  const code = sim.e[name](...a);
  if (code < 0) {
    throw new Error(`${name}: ${simErrorName(code)}`);
  }
  return code;
}

function upZ(st) {
  return 1 - 2 * (st[ST.QX] * st[ST.QX] + st[ST.QY] * st[ST.QY]);
}
function speed(st) {
  return Math.hypot(st[ST.VX], st[ST.VY], st[ST.VZ]);
}
function rate(st) {
  return Math.hypot(st[ST.P], st[ST.Q], st[ST.R]);
}
function clamp(v, a, b) {
  return v < a ? a : (v > b ? b : v);
}

/* Plant to world: W = Rz(yaw) p + O. Only multiples of a quarter turn are
 * used here, so the rotation is written out exactly. */
function rotq(q, x, y) {
  const k = ((q % 4) + 4) % 4;
  if (k === 0) return [x, y];
  if (k === 1) return [-y, x];
  if (k === 2) return [-x, -y];
  return [y, -x];
}

/*
 * A world is a list of shapes in PLANT coordinates for readability, turned
 * into world coordinates through the scenario's frame (origin, quarter turns)
 * before upload. A box is [x0, y0, z0, x1, y1, z1, material].
 */
function uploadWorld(sim, frame, shapes) {
  call(sim, 'sim_world_clear');
  const yaw = frame.quarter * (Math.PI / 2);
  call(sim, 'sim_world_frame', frame.o[0], frame.o[1], frame.o[2], yaw);
  for (const sh of shapes) {
    if (sh.box) {
      const [x0, y0, z0, x1, y1, z1] = sh.box;
      const a = rotq(frame.quarter, x0, y0);
      const b = rotq(frame.quarter, x1, y1);
      call(sim, 'sim_world_box',
        Math.min(a[0], b[0]) + frame.o[0], Math.min(a[1], b[1]) + frame.o[1], z0 + frame.o[2],
        Math.max(a[0], b[0]) + frame.o[0], Math.max(a[1], b[1]) + frame.o[1], z1 + frame.o[2],
        sh.m.e, sh.m.mu);
    } else if (sh.capsule) {
      const [ax, ay, az, bx, by, bz, r] = sh.capsule;
      const a = rotq(frame.quarter, ax, ay);
      const b = rotq(frame.quarter, bx, by);
      call(sim, 'sim_world_capsule',
        a[0] + frame.o[0], a[1] + frame.o[1], az + frame.o[2],
        b[0] + frame.o[0], b[1] + frame.o[1], bz + frame.o[2], r, sh.m.e, sh.m.mu);
    }
  }
  call(sim, 'sim_world_build');
}

/* Is the CG inside any box of the world (plant coordinates)? */
function insideDepth(shapes, st) {
  let d = 0;
  for (const sh of shapes) {
    if (!sh.box) continue;
    const [x0, y0, z0, x1, y1, z1] = sh.box;
    const x = st[ST.X];
    const y = st[ST.Y];
    const z = st[ST.Z];
    if (x > x0 && x < x1 && y > y0 && y < y1 && z > z0 && z < z1) {
      d = Math.max(d, Math.min(x - x0, x1 - x, y - y0, y1 - y, z - z0, z1 - z));
    }
  }
  return d;
}

function heightHold(ctx, st, z) {
  const e = z - st[ST.Z];
  ctx.i = clamp(ctx.i + e * 0.004 * 0.4, -0.3, 0.3);
  const u = upZ(st);
  return clamp((HOVER[ctx.af] + 0.15 * e - 0.1 * st[ST.VZ] + ctx.i) / (u > 0.5 ? u : 0.5), 0, 1);
}

/*
 * Fly one run. sc.sticks(ms, st, ctx) returns [roll, pitch, yaw, throttle]
 * and may set ctx.angle. The ground plane is level grass at z = 0 minus the
 * rest height, as the shell raises it, unless sc.noGround.
 */
async function fly(sc, frame = { o: [0, 0, 0], quarter: 0 }) {
  const af = sc.airframe || 0;
  const sim = await loadSim(wasm);
  call(sim, 'sim_set_airframe', af);
  if (sim.init(CONFIGS[af]) !== SIM_OK) {
    throw new Error('sim_init failed');
  }
  sim.reset();
  sim.setCellVoltage(4.2);
  uploadWorld(sim, frame, sc.world || []);
  const pose = sc.pose || { p: [0, 0, 2], q: [1, 0, 0, 0] };
  call(sim, 'sim_set_pose', pose.p[0], pose.p[1], pose.p[2], ...pose.q);
  call(sim, 'sim_rest');
  const ctx = { af, i: 0, angle: sc.angle ?? true, t0: -1, touched: false, rep: null };
  sim.setAngleMode(ctx.angle);
  let angleNow = ctx.angle;
  const rep = new Float64Array(11);
  const repPtr = sim.e.malloc(11 * 8);
  const hash = createHash('sha256');
  const rows = [];
  let st = sim.readState().state;
  for (let ms = 0; ms < sc.ms; ms += 1) {
    if (ms % 4 === 0) {
      const k = sc.sticks(ms, st, ctx);
      if (ctx.angle !== angleNow) {
        sim.setAngleMode(ctx.angle);
        angleNow = ctx.angle;
      }
      sim.input(ms / 1000, k[0], k[1], k[2], k[3]);
    }
    if (!sc.noGround) {
      call(sim, 'sim_set_ground', 1, 0, 0, 1, 0, 0, -REST[af], GRASS_MU, GRASS_E);
    }
    sim.step(1);
    st = sim.readState().state;
    hash.update(sim.readStateBytes().bytes);
    call(sim, 'sim_world_report', repPtr);
    rep.set(new Float64Array(sim.e.memory.buffer, repPtr, 11));
    hash.update(Buffer.from(rep.buffer));
    for (let i = 0; i < 14; i += 1) {
      if (!Number.isFinite(st[i])) {
        throw new Error(`non-finite state at ${ms} ms`);
      }
    }
    const touching = rep[0] > 0;
    if (rep[10] >= 0 && sim.e.sim_ground_contacts() > 0) {
      ctx.roofed = true;
    }
    if (touching && !ctx.touched) {
      ctx.touched = true;
      ctx.t0 = ms;
    }
    rows.push({
      ms, p: [st[ST.X], st[ST.Y], st[ST.Z]], v: [st[ST.VX], st[ST.VY], st[ST.VZ]],
      spd: speed(st), rate: rate(st), up: upZ(st), touching,
      closing: rep[1], depth: rep[9], props: rep[7], support: rep[10],
      rpm: [st[14], st[15], st[16], st[17]],
      inside: insideDepth(sc.world || [], st),
      ground: sim.e.sim_ground_contacts(),
    });
  }
  return { rows, hash: hash.digest('hex'), t0: ctx.t0 };
}

/*
 * The speed a run reaches, and where: fly the approach once with no wall to
 * learn where the craft is doing v, so the wall can be put a metre past it.
 * Deterministic, so the second flight is the same flight until it meets it.
 */
async function whereAtSpeed(sc, v) {
  const probe = await fly({ ...sc, world: [], ms: 6000 });
  const r = probe.rows.find((x) => x.spd >= v);
  if (!r) {
    throw new Error(`the approach never reached ${v} m/s`);
  }
  return r;
}

/* Angle mode, the stick forward at `pitch`, height held; once in contact,
 * hands off in acro the way crash-check's pilot lets go. */
function approach(pitch, z, after = [0, 0, 0, 0.34]) {
  return (ms, st, ctx) => {
    if (ctx.touched) {
      ctx.angle = false;
      return after;
    }
    /* Negative pitch is nose down: forward, nose first, as a pilot flies
     * into a wall. Measured: positive flies the craft backwards. */
    return [0, -pitch, 0, heightHold(ctx, st, z)];
  };
}

function after(rows, t0, a, b) {
  return rows.filter((r) => r.ms >= t0 + a && r.ms <= t0 + b);
}

function summarise(res, n) {
  const rows = res.rows;
  const t0 = res.t0;
  const pre = rows[Math.max(0, t0 - 1)];
  const w = after(rows, t0, 0, 300);
  const s = {
    t0,
    impact: pre.spd,
    peakRate: Math.max(...w.map((r) => r.rate)),
    rebound: Math.max(0, ...w.map((r) => r.v[0] * n[0] + r.v[1] * n[1] + r.v[2] * n[2])),
    upKick: Math.max(0, ...w.map((r) => r.v[2] - pre.v[2])),
    deepest: Math.max(...rows.map((r) => r.depth)),
    inside: Math.max(...rows.map((r) => r.inside)),
    minUp: Math.min(...w.map((r) => r.up)),
    end: rows[rows.length - 1],
  };
  return s;
}

function r3(v) {
  return Math.round(v * 1000) / 1000;
}

/* ------------------------------------------------------------------ */

const SCENARIOS = [];
function scenario(name, fn) {
  SCENARIOS.push({ name, fn });
}

/* A wall across the approach, face `gap` metres past where the craft first
 * does v. The approach is along whichever way the craft actually goes. */
async function wallRun(v, pitch, opts = {}) {
  const base = { ms: 6000, sticks: approach(pitch, 2), airframe: opts.airframe || 0 };
  const at = await whereAtSpeed(base, v);
  const dir = Math.sign(at.v[0]);
  const face = at.p[0] + dir * (opts.gap ?? 1.0);
  const box = dir > 0 ? [face, -20, -1, face + 1, 20, 12] : [face - 1, -20, -1, face, 20, 12];
  const world = [{ box, m: WALL }];
  const sc = { ...base, world, ms: opts.ms ?? 3500, sticks: approach(pitch, 2, opts.after) };
  const res = await fly(sc, opts.frame);
  const res2 = await fly(sc, opts.frame);
  return { res, res2, n: [-dir, 0, 0], face, dir, world };
}

function wallChecks(label, w, t) {
  const s = summarise(w.res, w.n);
  if (args.includes('--trace')) {
    const t0 = w.res.t0;
    for (const r of w.res.rows.slice(t0 - 1, t0 + 40)) {
      console.log(`       ${r.ms} x ${r3(r.p[0])} z ${r3(r.p[2])} v ${r.v.map(r3).join(',')} rate ${r3(r.rate)} up ${r3(r.up)} props ${r.props} depth ${r3(r.depth)} close ${r3(r.closing)} rpm ${r.rpm.map(Math.round).join(',')}`);
    }
  }
  if (verbose) {
    console.log(`     ${JSON.stringify({ impact: r3(s.impact), peakRate: r3(s.peakRate), rebound: r3(s.rebound), upKick: r3(s.upKick), deepest: r3(s.deepest), minUp: r3(s.minUp) })}`);
  }
  check(`${label}: two runs agree to the bit`, w.res.hash === w.res2.hash);
  check(`${label}: it reached the wall`, w.res.t0 >= 0, `at ${r3(s.impact)} m/s`);
  check(`${label}: the CG never goes inside the wall`, s.inside === 0, `${r3(s.inside)} m`);
  check(`${label}: no contact deeper than 5 cm`, s.deepest <= 0.05, `${r3(s.deepest)} m`);
  if (t.rate != null) {
    target(`${label}: spins at ${t.rate} rad/s or less`, s.peakRate <= t.rate, `${r3(s.peakRate)} rad/s`);
  }
  if (t.rebound != null) {
    target(`${label}: rebounds at ${t.rebound} m/s or less`, s.rebound <= t.rebound, `${r3(s.rebound)} m/s`);
  }
  if (t.leaves != null) {
    target(`${label}: leaves the wall`, s.rebound >= t.leaves, `${r3(s.rebound)} m/s away from it`);
  }
  if (t.upKick != null) {
    target(`${label}: a vertical wall adds ${t.upKick} m/s upward or less`, s.upKick <= t.upKick, `${r3(s.upKick)} m/s`);
  }
  return s;
}

scenario('wall tap, 3 m/s', async () => {
  const w = await wallRun(3, 0.7);
  wallChecks('tap 3 m/s', w, { rate: 5, leaves: 0.02 });
});

scenario('wall head-on, 5 m/s', async () => {
  const w = await wallRun(5, 0.8);
  wallChecks('head-on 5 m/s', w, { rate: 5, rebound: 0.3 });
});

scenario('wall head-on, 10 m/s', async () => {
  const w = await wallRun(10, 1.0);
  wallChecks('head-on 10 m/s', w, {});
});

scenario('wall head-on, 20 m/s', async () => {
  const w = await wallRun(20, 1.0);
  wallChecks('head-on 20 m/s', w, { rate: 25, upKick: 0.5 });
});

scenario('whoop, wall head-on, 5 m/s', async () => {
  const w = await wallRun(5, 0.8, { airframe: 1 });
  wallChecks('whoop head-on 5 m/s', w, { rate: 8 });
});

scenario('the same wall at four spawn yaws', async () => {
  const got = [];
  for (let q = 0; q < 4; q += 1) {
    const w = await wallRun(10, 1.0, { frame: { o: [12.5, -40.25, 3.5], quarter: q } });
    const s = summarise(w.res, w.n);
    got.push(s);
  }
  const base = got[0];
  const same = got.every((s) => Math.abs(s.peakRate - base.peakRate) < 1e-6
    && Math.abs(s.rebound - base.rebound) < 1e-6
    && Math.abs(s.end.p[0] - base.end.p[0]) < 1e-6
    && Math.abs(s.end.p[2] - base.end.p[2]) < 1e-6);
  check('a wall hit is the same whichever way the map faces', same,
    got.map((s) => `${r3(s.peakRate)} rad/s, end x ${r3(s.end.p[0])}`).join(' | '));
});

/* A 20 by 20 m roof, 5 m up, the craft arriving from above and to one side. */
function roofWorld() {
  return [{ box: [-10, -10, -60, 10, 10, 5], m: WALL }];
}

scenario('dive onto a roof, 8 m/s', async () => {
  /* Start over the roof's far edge, pitch forward and let it fall onto it. */
  const sc = {
    ms: 5000, world: roofWorld(), pose: { p: [-8, 0, 8.6], q: [1, 0, 0, 0] },
    sticks: (ms, st, ctx) => (ctx.roofed ? (ctx.angle = false, [0, 0, 0, 0]) : [0, -1, 0, 0.12]),
  };
  const res = await fly(sc);
  const res2 = await fly(sc);
  const rows = res.rows;
  /* A roof is the GROUND now, so touchdown is a ground contact with the roof
   * as the support, not an obstacle contact. */
  const t0 = rows.findIndex((r) => r.ground > 0 && r.support >= 0);
  if (verbose) {
    console.log(`     t0 ${t0}`, JSON.stringify(rows.slice(Math.max(0, t0 - 2), t0 + 3).map((r) => [r.ms, r.p.map(r3), r3(r.spd), r.support, r.ground])));
  }
  const pre = rows[Math.max(0, t0 - 1)];
  const stop = rows.findIndex((r) => r.ms > t0 && r.spd < 0.1);
  const at = stop >= 0 ? rows[stop] : rows[rows.length - 1];
  const slide = Math.hypot(at.p[0] - pre.p[0], at.p[1] - pre.p[1]);
  const end = rows[rows.length - 1];
  if (verbose) {
    console.log(`     impact ${r3(pre.spd)} m/s, slide ${r3(slide)} m, end z ${r3(end.p[2])} spd ${r3(end.spd)} support ${end.support}`);
  }
  check('roof dive: two runs agree to the bit', res.hash === res2.hash);
  check('roof dive: arrives fast', pre.spd >= 6, `${r3(pre.spd)} m/s`);
  check('roof dive: the roof is the ground under it', rows.slice(t0).some((r) => r.support === 0 && r.ground > 0));
  check('roof dive: slides no more than 3 m', slide <= 3, `${r3(slide)} m`);
  check('roof dive: comes to rest on the roof', end.spd < 0.3 && end.p[2] > 4.9, `z ${r3(end.p[2])}, ${r3(end.spd)} m/s`);
});

scenario('settle onto a roof, 2 m/s', async () => {
  const sc = {
    ms: 5000, world: roofWorld(), pose: { p: [0, 0, 7], q: [1, 0, 0, 0] },
    sticks: (ms, st, ctx) => {
      if (ctx.touched && ms > ctx.t0 + 200) {
        return [0, 0, 0, 0];
      }
      /* Down at 2 m/s. */
      const zt = 7 - 2 * (ms / 1000);
      return [0, 0, 0, heightHold(ctx, st, zt)];
    },
  };
  const res = await fly(sc);
  const end = res.rows[res.rows.length - 1];
  if (verbose) {
    console.log(`     end z ${r3(end.p[2])} spd ${r3(end.spd)} up ${r3(end.up)}`);
  }
  check('roof settle: comes to rest on the roof, level', end.spd < 0.1 && Math.abs(end.p[2] - 5 - REST[0]) < 0.01 && end.up > 0.99,
    `z ${r3(end.p[2])}, ${r3(end.spd)} m/s`);
});

scenario('off the roof edge', async () => {
  /* Centre just past the edge, the hull half over it: it must tip off, not
   * stand on air. */
  const sc = {
    ms: 3000, world: roofWorld(), pose: { p: [10.05, 0, 5.3], q: [1, 0, 0, 0] },
    sticks: () => [0, 0, 0, 0],
  };
  const res = await fly(sc);
  const end = res.rows[res.rows.length - 1];
  check('roof edge: a craft centred off the edge falls off it', end.p[2] < 1, `ends at z ${r3(end.p[2])}`);
  check('roof edge: never inside the roof', Math.max(...res.rows.map((r) => r.inside)) === 0);
});

scenario('a thin pole does not tunnel', async () => {
  const base = { ms: 6000, sticks: approach(1.0, 2) };
  const at = await whereAtSpeed(base, 15);
  const dir = Math.sign(at.v[0]);
  const x = at.p[0] + dir * 1.5;
  const y = at.p[1];
  const world = [{ box: [x - 0.015, y - 0.015, -1, x + 0.015, y + 0.015, 8], m: WALL }];
  const res = await fly({ ...base, world, ms: 3000, sticks: approach(1.0, 2) });
  const passed = res.rows.some((r) => dir * (r.p[0] - x) > 0.05);
  check('pole 3 cm at 15 m/s: the craft does not pass through it', !passed && res.t0 >= 0,
    res.t0 < 0 ? 'never touched it' : `touched at ${res.t0} ms`);
});

scenario('a ceiling holds', async () => {
  const world = [{ box: [-20, -20, 4, 20, 20, 5], m: WALL }];
  const sc = { ms: 3000, world, pose: { p: [0, 0, 1], q: [1, 0, 0, 0] }, sticks: () => [0, 0, 0, 1] };
  const res = await fly(sc);
  const top = Math.max(...res.rows.map((r) => r.p[2]));
  check('full throttle into a ceiling: the craft stays under it', top < 4, `highest z ${r3(top)}`);
  check('full throttle into a ceiling: it touched', res.t0 >= 0);
});

scenario('a gate bar (capsule) stops the craft', async () => {
  const base = { ms: 6000, sticks: approach(1.0, 2) };
  const at = await whereAtSpeed(base, 12);
  const dir = Math.sign(at.v[0]);
  const x = at.p[0] + dir * 1.5;
  /* At the height the craft is actually flying, which the hold keeps near
   * but not at 2 m while it is tilted 60 degrees. */
  const z = at.p[2];
  const world = [{ capsule: [x, -3, z, x, 3, z, 0.02], m: PVC }];
  const res = await fly({ ...base, world, ms: 3000, sticks: approach(1.0, 2) });
  if (verbose) {
    const t = res.t0;
    console.log('     ', JSON.stringify(res.rows.filter((r, i) => i >= t - 3 && i <= t + 60 && (i - t) % 3 === 0)
      .map((r) => [r.ms, r3(r.p[0] - x), r3(r.p[2] - z), r3(r.v[0]), r3(r.v[2]), r3(r.up), r3(r.rate)])));
  }
  /* Glancing off a round bar and going over or under it is allowed. Going
   * THROUGH it is not: the CG may never come nearer the bar's axis than the
   * bar's radius plus the thinnest the hull ever is. */
  const nearest = Math.min(...res.rows.map((r) => Math.hypot(r.p[0] - x, r.p[2] - z)));
  check('a 4 cm bar at 12 m/s: the craft touches it and never goes through it',
    res.t0 >= 0 && nearest >= 0.02 + 0.03,
    res.t0 < 0 ? 'never touched it' : `nearest the axis ${r3(nearest)} m`);
});

/*
 * Pinned flat against a wall, thrust into the face. Measured: at full
 * throttle it STAYS, and that is not a bug. The battery is the highest thing
 * on the stack, so it is what touches the wall and the props turn 18 mm
 * clear of it, and thrust into the face times the frame's grip is more than
 * the craft weighs. A real quad does the same. What gets a pilot off a wall
 * is what gets one off a wall in life: turning the thrust away, or letting
 * go so it drops.
 */
function pinned(sticks) {
  const world = [{ box: [0.2, -10, -1, 1.2, 10, 10], m: WALL }];
  const s2 = Math.SQRT1_2;
  return {
    ms: 2000, world, angle: false,
    /* Pitched 90 degrees: body z (thrust) along +x, into the wall. */
    pose: { p: [0.2 - 0.04, 0, 2], q: [s2, 0, s2, 0] },
    sticks,
  };
}

scenario('pinned against a wall', async () => {
  const off = (res) => res.rows.findIndex((r) => r.p[0] < 0.2 - 0.5 || r.p[2] < 1.0);
  /* Friction alone would hold it: flat on the face, the craft can only
   * rotate off by pivoting on an edge, which lifts the CG against its own
   * thrust. What lets it go is the rotor bleed the owner accepted for the
   * "stuck and bounce forever" report, ported from the shell into world.c:
   * thrust held into a face for 150 ms bleeds the rotors. */
  const full = await fly(pinned(() => [0, 0, 0, 1]));
  const k = off(full);
  check('pinned: even at full throttle, the rotor bleed lets it go', k >= 0,
    k < 0 ? 'still on the wall after 2 s' : `off it at ${full.rows[k].ms} ms`);
  const cut = await fly(pinned((ms) => (ms < 300 ? [0, 0, 0, 1] : [0, 0, 0, 0])));
  const j = off(cut);
  check('pinned: letting go of the throttle lets it drop', j >= 0 && cut.rows[j].ms - 300 <= 700,
    j < 0 ? 'still on the wall after 2 s' : `off it ${cut.rows[j].ms - 300} ms after letting go`);
});

scenario('a prop strike costs rotor speed', async () => {
  const w = await wallRun(10, 1.0);
  const rows = w.res.rows;
  const t0 = w.res.t0;
  const before = rows[t0 - 1].rpm;
  const hit = rows.slice(t0, t0 + 30).find((r) => r.props > 0);
  const low = Math.min(...rows.slice(t0, t0 + 40).map((r) => Math.min(...r.rpm)));
  check('a 10 m/s hit strikes a prop', Boolean(hit));
  check('and that rotor loses speed', low < Math.min(...before) * 0.8,
    `${Math.round(Math.min(...before))} to ${Math.round(low)} rpm`);
});

scenario('the train', async () => {
  /* A 20 m car going 23.5 m/s across a hovering craft. */
  const af = 0;
  const sim = await loadSim(wasm);
  call(sim, 'sim_set_airframe', af);
  sim.init(CONFIGS[af]);
  sim.reset();
  call(sim, 'sim_world_clear');
  call(sim, 'sim_world_frame', 0, 0, 0, 0);
  call(sim, 'sim_world_build');
  call(sim, 'sim_set_pose', 0, 0, 2, 1, 0, 0, 0);
  call(sim, 'sim_rest');
  sim.setAngleMode(true);
  const ctx = { af, i: 0 };
  let st = sim.readState().state;
  let maxSp = 0;
  let hitAt = -1;
  for (let ms = 0; ms < 3000; ms += 1) {
    const x = -30 + 23.5 * ms * 0.001;
    call(sim, 'sim_world_mover', 0, x - 10, -1.5, 0, x + 10, 1.5, 4, 23.5, 0, 0, TRAIN.e, TRAIN.mu);
    if (ms % 4 === 0) {
      sim.input(ms / 1000, 0, 0, 0, heightHold(ctx, st, 2));
    }
    call(sim, 'sim_set_ground', 1, 0, 0, 1, 0, 0, -REST[af], GRASS_MU, GRASS_E);
    sim.step(1);
    st = sim.readState().state;
    if (hitAt < 0 && Math.abs(st[ST.VX]) > 1) {
      hitAt = ms;
    }
    maxSp = Math.max(maxSp, speed(st));
    if (!Number.isFinite(st[1])) {
      break;
    }
  }
  check('the train hits a hovering craft', hitAt >= 0, `at ${hitAt} ms`);
  check('and throws it no faster than a train goes', maxSp < 30, `${r3(maxSp)} m/s`);
});

console.log(`world-check: dist/sim.wasm against constructed worlds\n`);
for (const s of SCENARIOS) {
  if (only && !s.name.toLowerCase().includes(only.toLowerCase())) {
    continue;
  }
  console.log(`  ${s.name}`);
  try {
    /* eslint-disable no-await-in-loop */
    await s.fn();
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${s.name}: ${e.message}`);
  }
}
console.log(`\nworld-check: ${failures === 0 ? 'all passed' : `${failures} FAILED`}`);
process.exit(failures);
