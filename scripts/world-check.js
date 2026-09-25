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
 *        [--cost-baseline=PATH] [--wasm=PATH]
 * Exit code is the failed guards, plus failed targets with --targets.
 * --wasm=PATH flies another module in place of dist/sim.wasm: a scratch
 * build with a fault planted, to show which checks see it.
 *
 * SCENARIOS and fly are exported for scripts/world-golden.js, which flies
 * these same scenarios and pins every step of them. Importing this file runs
 * nothing: the checks below run only when it is the script node was given.
 *
 * VEHICLE_SCENARIOS (Stage D part 2, cars that follow a road inside the
 * module) are a list of their own, run after SCENARIOS, and NOT part of it:
 * world-golden flies every entry of SCENARIOS and would call each new one a
 * run it does not have. Pinning them in tests/goldens/world.json is a
 * reviewed act for the owner. --cost-baseline=PATH also times another
 * module (HEAD's, say) in the 64 car scenario, in the same process.
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
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadSim, SIM_OK, SIM_ERR_BAD_ARG, SIM_ERR_BAD_STATE, simErrorName } from '../tests/lib/simmod.js';
import {
  sweepRun, clipRun, rideRun, driftRun, driftEntryRun, propEdgeRun, roofRideRun, invarianceRun, crowdRun, stadiumRoad,
  turnRoad, pieceRoad, roadToThree, CAR, HULL,
} from './lib/worldruns.js';
import {
  uploadRoad, addVehicle, setVehicleClock, readVehicles, makeVehiclePoses, roadInfo, MOVER_SLOTS,
  VEHICLE_POSE_DOUBLES,
} from '../src/game/plantworld.js';
import { threeDirToSim } from '../src/render/frame.js';
import { GRAZE_SPEED_MAX, bodyUpDotWorld, solidContactCrash } from '../src/game/collide.js';
import { sincos } from '../src/props/trig.js';

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

const wasmArg = (args.find((a) => a.startsWith('--wasm=')) || '').split('=')[1] || '';
const wasmPath = wasmArg ? resolve(wasmArg) : join(root, 'dist/sim.wasm');
const wasm = await readFile(wasmPath);
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
export async function fly(sc, frame = { o: [0, 0, 0], quarter: 0 }) {
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
      /* The whole step's report and the attitude after it, for the shell's
       * crash verdict, which reads both (frameReport below). */
      rep: Float64Array.from(rep),
      q: [st[ST.QW], st[ST.QX], st[ST.QY], st[ST.QZ]],
    });
    if (sc.stopAfterTouch != null && ctx.touched && ms - ctx.t0 >= sc.stopAfterTouch) {
      break;
    }
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

export const SCENARIOS = [];
function scenario(name, fn) {
  SCENARIOS.push({ name, fn });
}

/*
 * THE SHELL'S READINGS of what the module reports. Flown through the module
 * like the scenarios above, but what they judge is the shell's own code
 * (src/game/collide.js), not the world solve. They are kept out of SCENARIOS
 * because scripts/world-golden.js pins every step of every scenario, and a
 * run new to that golden is recorded only with the owner's approval.
 */
const READINGS = [];
function reading(name, fn) {
  READINGS.push({ name, fn });
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

/*
 * THE SHELL'S CRASH VERDICT, asked of flights through the module.
 *
 * src/main.js resets a crash on the frame it reads one (CRASH IS A RESET),
 * and for the solid world it asks solidContactCrash in src/game/collide.js,
 * once a frame, of the frame's sim_world_report and the attitude at the
 * frame's end. The report's normal is the world's and the attitude is the
 * plant's, and until 2026-09-25 the two were read as one frame, so a belly
 * flat on a wall scored cos(yaw) where it should score 1. The owner's belly
 * first wall tap, on a map of their own, was reset as a crash. The module
 * was right all along (the scenario above holds it to 1e-6 across headings);
 * the shell's reading of it was not, and nothing flew a tap faster than
 * GRAZE_SPEED_MAX at a heading other than zero.
 *
 * So: a wall tap, base first, at a smack's closing speed, and a steep nose
 * first hit, each flown at the four headings, and judged as the shell judges
 * them for frames of 7, 16 and 33 steps at every phase: 144, 60 and 30 Hz.
 */

/* What the shell reads once a frame: sim_world_report summed over steps
 * [a, b) the way the module sums it between two reads, folded from the
 * per-step reads fly() keeps. */
function frameReport(rows, a, b) {
  const f = new Float64Array(11);
  f[3] = -1;
  for (let k = a; k < b; k += 1) {
    const r = rows[k].rep;
    if (!(r[0] > 0)) {
      continue;
    }
    f[0] += r[0];
    f[1] = r[1] > f[1] ? r[1] : f[1];
    if (r[2] >= f[2]) {
      f[2] = r[2];
      f[3] = r[3];
      f[4] = r[4];
      f[5] = r[5];
      f[6] = r[6];
    }
    f[7] += r[7];
    f[8] += r[8];
    f[9] = r[9] > f[9] ? r[9] : f[9];
  }
  f[10] = rows[b - 1].rep[10];
  return f;
}

/* Of a frame length's phases, how many have the shell reset the run within
 * 150 ms of its first contact, with the world turned into the plant by
 * (c, s). */
function resetPhases(res, len, c, s) {
  const rows = res.rows;
  let hits = 0;
  for (let ph = 0; ph < len; ph += 1) {
    for (let a = res.t0 - len + ph; a <= res.t0 + 150 && a + len <= rows.length; a += len) {
      const q = rows[a + len - 1].q;
      if (a >= 0 && solidContactCrash(frameReport(rows, a, a + len), q[0], q[1], q[2], q[3], c, s)) {
        hits += 1;
        break;
      }
    }
  }
  return hits;
}

/*
 * Run in along plant +x in angle mode, height held at 4 m, at vRun; once the
 * face is dFlip ahead, acro, and the stick on the error to a pitch of
 * pitchDeg (nose up positive) at throttle thr, held into the wall. A pitch
 * of 90 with the throttle cut is the workbook's Wall Tap: "a 90 pitch back
 * while simultaneously cutting the throttle. Gently tap the wall".
 */
function flipPilot(face, vRun, dFlip, pitchDeg, thr) {
  /* The wanted pitch as a direction, turned with src/props/trig.js: the stick
   * reaches the module, and no JS trigonometry does (the same rule
   * scripts/world-golden.js keeps for the runs it pins). */
  const want = sincos((pitchDeg * Math.PI) / 180, { s: 0, c: 1 });
  return (ms, st, ctx) => {
    if (ctx.flip || face - st[ST.X] <= dFlip) {
      ctx.flip = true;
      ctx.angle = false;
      const w = st[ST.QW];
      const x = st[ST.QX];
      const y = st[ST.QY];
      const z = st[ST.QZ];
      /* The nose, body x, in the plant's x z plane, and the sine of the pitch
       * still to go: sin(want - pitch). Nose up is negative q. */
      const nx = 1 - 2 * (y * y + z * z);
      const nz = 2 * (x * z - w * y);
      const err = want.s * nx - want.c * nz;
      return [0, clamp(1.6 * err + 0.03 * st[ST.Q], -1, 1), 0, thr];
    }
    ctx.cruise = ctx.cruise || st[ST.VX] >= vRun;
    const stick = ctx.cruise ? -clamp(0.3 + 0.2 * (vRun - st[ST.VX]), 0, 0.8) : -0.8;
    return [0, stick, 0, heightHold(ctx, st, 4)];
  };
}

reading('a wall tap is judged the same whichever way the map faces', async () => {
  const world = [{ box: [0, -20, -1, 1, 20, 30], m: WALL }];
  const runs = {
    tap: { ms: 9000, world, pose: { p: [-30, 0, 4], q: [1, 0, 0, 0] }, stopAfterTouch: 200,
      sticks: flipPilot(0, 7, 1.3, 90, 0.05) },
    nose: { ms: 9000, world, pose: { p: [-30, 0, 4], q: [1, 0, 0, 0] }, stopAfterTouch: 200,
      sticks: flipPilot(0, 7, 1.6, -75, 0.35) },
  };
  const LENS = [7, 16, 33];
  const out = { tap: [], nose: [] };
  for (let q = 0; q < 4; q += 1) {
    const frame = { o: [12.5, -40.25, 3.5], quarter: q };
    const turn = sincos(q * (Math.PI / 2), { s: 0, c: 1 });
    for (const [name, sc] of Object.entries(runs)) {
      const res = await fly(sc, frame);
      const res2 = await fly(sc, frame);
      const pre = res.rows[res.t0 - 1];
      out[name].push({
        q,
        same: res.hash === res2.hash,
        t0: res.t0,
        closing: Math.max(...res.rows.slice(res.t0, res.t0 + 20).map((r) => r.closing)),
        /* The belly against the wall's own normal, plant frame: the wall is
         * at +x in the plant whatever the heading, so its normal is -x. */
        belly: bodyUpDotWorld(pre.q[0], pre.q[1], pre.q[2], pre.q[3], -1, 0, 0, 1, 0),
        fixed: LENS.map((n) => resetPhases(res, n, turn.c, turn.s)),
        blind: LENS.map((n) => resetPhases(res, n, 1, 0)),
      });
    }
  }
  const tap = out.tap;
  const nose = out.nose;
  const show = (rs, k) => rs.map((r) => `${r.q * 90}: ${r[k].join('/')}`).join(' | ');
  if (verbose) {
    for (const r of [...tap, ...nose]) {
      console.log(`     ${JSON.stringify({ q: r.q, t0: r.t0, closing: r3(r.closing), belly: r3(r.belly), fixed: r.fixed, blind: r.blind })}`);
    }
  }
  check('every run agrees with itself to the bit', [...tap, ...nose].every((r) => r.same));
  check('the tap reaches the wall at every heading', tap.every((r) => r.t0 >= 0));
  check('the tap arrives at a smack\'s closing speed, so the verdict is asked',
    tap.every((r) => r.closing >= GRAZE_SPEED_MAX + 0.5),
    tap.map((r) => `${r3(r.closing)} m/s`).join(', '));
  check('and belly first, within about 25 degrees of square to the face',
    tap.every((r) => r.belly >= 0.9), tap.map((r) => r3(r.belly)).join(', '));
  check('a belly first tap is never reset, at any heading, frame rate or phase',
    tap.every((r) => r.fixed.every((n) => n === 0)),
    `phases reset of 7/16/33, by heading ${show(tap, 'fixed')}`);
  check('the nose first hit reaches the wall steep, at a smack\'s closing speed',
    nose.every((r) => r.t0 >= 0 && r.belly <= -0.8 && r.closing >= GRAZE_SPEED_MAX + 0.5),
    nose.map((r) => `${r3(r.closing)} m/s, belly ${r3(r.belly)}`).join(', '));
  check('a steep nose first hit is reset at every heading, frame rate and phase',
    nose.every((r) => r.fixed.every((n, i) => n === LENS[i])),
    `phases reset of 7/16/33, by heading ${show(nose, 'fixed')}`);
  /* And the check can see the fault it was written for: read in one frame,
   * as the shell did until 2026-09-25, the same tap is reset at the three
   * headings that are not zero, and the nose first hit is missed at 180. */
  check('read without the frame\'s turn, the tap would be reset at 90, 180 and 270 and not at 0',
    tap[0].blind.every((n) => n === 0) && tap.slice(1).every((r) => r.blind.some((n) => n > 0)),
    show(tap, 'blind'));
  check('and the nose first hit would be missed at 180',
    nose[2].blind.every((n) => n === 0), show(nose, 'blind'));
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

/* ================================================================== *
 * VEHICLES, Stage D part 2: cars that follow a road inside the module
 * (src/native/world.c section 5), handed over and read back through the
 * shell's own src/game/plantworld.js.
 *
 * NOT IN SCENARIOS. scripts/world-golden.js flies every entry of SCENARIOS
 * and pins it step by step, and these are not pinned yet: recording them in
 * tests/goldens/world.json is a reviewed act for the owner. The flights are
 * scripts/lib/worldruns.js's vehicle runs, the ones scripts/world-engines.js
 * flies in Node and in Chromium; here a loop that watches everything flies
 * them, every one twice, and the two must agree to the bit, the cars' poses
 * included, before anything else is asked of them.
 * ================================================================== */
export const VEHICLE_SCENARIOS = [];
function vehicleScenario(name, fn) {
  VEHICLE_SCENARIOS.push({ name, fn });
}

const VP = VEHICLE_POSE_DOUBLES;
/* sim_abi.h SIM_VEHICLE_CONTACT_DOUBLES, and world.c WORLD_MAX_CONTACTS, the
 * most one step can have. */
const VC = 12;
const VC_MAX = 96;
/* The craft's reach from its CG: the five inch's prop tip and lens are both
 * inside a quarter metre (world.c world_step's reach). */
const REACH = 0.25;

/* Slot m of sim_world_vehicle_poses, the physics world frame. */
function carAt(raw, m) {
  const b = m * VP;
  return {
    on: raw[b],
    p: [raw[b + 1], raw[b + 2], raw[b + 3]],
    h: [raw[b + 4], raw[b + 5]],
    speed: raw[b + 6],
    dist: raw[b + 7],
    vel: [raw[b + 8], raw[b + 9], raw[b + 10]],
    omega: raw[b + 11],
    u: [raw[b + 12], raw[b + 13]],
    kap: raw[b + 14],
    slip: raw[b + 15],
  };
}

function readRaw(sim, ptr, out) {
  call(sim, 'sim_world_vehicle_poses', ptr);
  out.set(new Float64Array(sim.e.memory.buffer, ptr, MOVER_SLOTS * VP));
  return out;
}

/*
 * Fly one of worldruns.js's vehicle runs the way its flyRun flies it
 * (sticks on the 4 ms RC grid, the run's own before() ahead of every step,
 * one step at a time), and watch everything after every step: the state,
 * the contact report, every car's pose straight from the module, the watched
 * car as the shell reads it, and every contact the step made with a car
 * (sim_world_vehicle_contacts), each with its car's pose as the step began,
 * the one the contact was found with, and as it ended. The trace hash covers
 * all but the shell's reading.
 */
async function flyCars(run, bytes = wasm) {
  const af = run.airframe || 0;
  const sim = await loadSim(bytes);
  call(sim, 'sim_set_airframe', af);
  if (sim.init(CONFIGS[af]) !== SIM_OK) {
    throw new Error('sim_init failed');
  }
  sim.reset();
  sim.setCellVoltage(4.2);
  const ctx = { af, i: 0, angle: true, touched: false, t0: -1 };
  run.setup(sim, ctx);
  sim.setAngleMode(ctx.angle);
  let angleNow = ctx.angle;
  const rep = new Float64Array(11);
  const repPtr = sim.e.malloc(11 * 8);
  const raw = new Float64Array(MOVER_SLOTS * VP);
  const rawPtr = sim.e.malloc(MOVER_SLOTS * VP * 8);
  const rawPre = readRaw(sim, rawPtr, new Float64Array(MOVER_SLOTS * VP));
  const vcPtr = sim.e.malloc(VC_MAX * VC * 8);
  const shell = makeVehiclePoses();
  const hash = createHash('sha256');
  const rows = [];
  const watch = run.spec.watch || 0;
  let st = sim.readState().state;
  for (let ms = 0; ms < run.ms; ms += 1) {
    if (ms % 4 === 0) {
      const k = run.sticks(ms, st, ctx);
      if (ctx.angle !== angleNow) {
        sim.setAngleMode(ctx.angle);
        angleNow = ctx.angle;
      }
      sim.input(ms / 1000, k[0], k[1], k[2], k[3]);
    }
    run.before(sim, ms, st, ctx);
    sim.step(1);
    st = sim.readState().state;
    hash.update(sim.readStateBytes().bytes);
    call(sim, 'sim_world_report', repPtr);
    rep.set(new Float64Array(sim.e.memory.buffer, repPtr, 11));
    hash.update(Buffer.from(rep.buffer));
    readRaw(sim, rawPtr, raw);
    hash.update(Buffer.from(raw.buffer));
    const nvc = call(sim, 'sim_world_vehicle_contacts', vcPtr, VC_MAX);
    const vcs = new Float64Array(sim.e.memory.buffer, vcPtr, Math.min(nvc, VC_MAX) * VC).slice();
    hash.update(Buffer.from(vcs.buffer));
    const vc = [];
    for (let c = 0; c < vcs.length; c += VC) {
      const slot = vcs[c];
      vc.push({
        slot,
        kind: vcs[c + 1],
        p: [vcs[c + 2], vcs[c + 3], vcs[c + 4]],
        n: [vcs[c + 5], vcs[c + 6], vcs[c + 7]],
        vs: [vcs[c + 8], vcs[c + 9], vcs[c + 10]],
        depth: vcs[c + 11],
        pre: carAt(rawPre, slot),
        post: carAt(raw, slot),
      });
    }
    readVehicles(sim, shell);
    for (let i = 0; i < 14; i += 1) {
      if (!Number.isFinite(st[i])) {
        throw new Error(`non-finite state at ${ms} ms`);
      }
    }
    const s = shell[watch];
    rows.push({
      ms,
      p: [st[ST.X], st[ST.Y], st[ST.Z]],
      v: [st[ST.VX], st[ST.VY], st[ST.VZ]],
      q: [st[ST.QW], st[ST.QX], st[ST.QY], st[ST.QZ]],
      w: [st[ST.P], st[ST.Q], st[ST.R]],
      spd: speed(st),
      rate: rate(st),
      touching: rep[0] > 0,
      shape: rep[3],
      n: [rep[4], rep[5], rep[6]],
      depth: rep[9],
      support: rep[10],
      supportNow: sim.e.sim_world_support(),
      ground: sim.e.sim_ground_contacts(),
      car: carAt(raw, watch),
      carPre: carAt(rawPre, watch),
      nvc,
      vc,
      shell: {
        on: s.on, hx: s.hx, hz: s.hz, tx: s.tx, tz: s.tz, qx: s.qx, qy: s.qy, qz: s.qz, qw: s.qw, slip: s.slip,
      },
      cars: run.spec.cars.length > 1 ? Array.from(run.spec.cars, (c) => carAt(raw, c.slot)) : null,
    });
    rawPre.set(raw);
  }
  sim.e.free(repPtr);
  sim.e.free(rawPtr);
  sim.e.free(vcPtr);
  return { rows, hash: hash.digest('hex'), digests: run.rec.digests.slice(), af, spec: run.spec };
}

/* A run flown twice from fresh run objects; `same` is whether the two agree
 * to the bit, trace and pose digests both. Kept by the run's name, so the
 * scenarios that hold the same run to different things fly it once. */
const FLOWN = new Map();
async function twice(make, bytes = wasm) {
  const probe = make();
  const name = `${probe.name} | ${probe.ms} ms`;
  if (bytes === wasm && FLOWN.has(name)) {
    return FLOWN.get(name);
  }
  const a = await flyCars(make(), bytes);
  const b = await flyCars(make(), bytes);
  const same = a.hash === b.hash && a.digests.length === b.digests.length
    && a.digests.every((d, i) => d === b.digests[i]);
  const out = { ...a, same };
  if (bytes === wasm) {
    FLOWN.set(name, out);
  }
  return out;
}

/* The craft's CG in the car's own frame, from the pose the module read out
 * after the same step. Every vehicle run's frame is at yaw 0, so the plant is
 * the world less the rest height. */
function inCarFrame(row, af, h = row.car.h) {
  const c = row.car;
  const dx = row.p[0] - c.p[0];
  const dy = row.p[1] - c.p[1];
  return [h[0] * dx + h[1] * dy, -h[1] * dx + h[0] * dy, row.p[2] + REST[af] - c.p[2]];
}

/* How far a point in the car's frame is from its body box, 0 inside. */
function outsideBox(l) {
  const hx = CAR.length / 2;
  const hy = CAR.width / 2;
  const ox = Math.max(0, Math.abs(l[0]) - hx);
  const oy = Math.max(0, Math.abs(l[1]) - hy);
  const oz = Math.max(0, CAR.clearance - l[2], l[2] - CAR.clearance - CAR.height);
  return Math.sqrt(ox * ox + oy * oy + oz * oz);
}

function insideBox(l) {
  return Math.abs(l[0]) < CAR.length / 2 && Math.abs(l[1]) < CAR.width / 2
    && l[2] > CAR.clearance && l[2] < CAR.clearance + CAR.height;
}

/*
 * How deep the craft's HULL is in the car: its eight corners (src/native/
 * plant.c's hull box, the same box world.c tests) turned into the car's
 * frame, and the deepest corner's distance to the nearest face. The contact
 * report's own depth counts the prop discs too, and a five inch's discs stand
 * 4.95 cm proud of its hull and are soft (world.c PROP_F_MAX): a car that
 * keeps pushing sits a face that far into a disc for as long as it pushes,
 * which is the soft prop doing its job. The hull is what must stay out.
 */
const HULL_BOX = { 0: [0.094, 0.094, 0.045, 0.038], 1: [0.041, 0.041, 0.010, 0.018] };
function hullDepth(row, af, h = row.car.h) {
  const [hx, hy, down, up] = HULL_BOX[af];
  const [w, x, y, z] = row.q;
  const R = [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ];
  const c = row.car;
  let deepest = 0;
  for (const bx of [-hx, hx]) {
    for (const by of [-hy, hy]) {
      for (const bz of [-down, up]) {
        const wx = row.p[0] + R[0][0] * bx + R[0][1] * by + R[0][2] * bz - c.p[0];
        const wy = row.p[1] + R[1][0] * bx + R[1][1] * by + R[1][2] * bz - c.p[1];
        const wz = row.p[2] + REST[af] + R[2][0] * bx + R[2][1] * by + R[2][2] * bz - c.p[2];
        const l = [h[0] * wx + h[1] * wy, -h[1] * wx + h[0] * wy, wz];
        if (insideBox(l)) {
          deepest = Math.max(deepest, Math.min(CAR.length / 2 - Math.abs(l[0]), CAR.width / 2 - Math.abs(l[1]),
            l[2] - CAR.clearance, CAR.clearance + CAR.height - l[2]));
        }
      }
    }
  }
  return deepest;
}

function firstCarTouch(rows, slot = 0) {
  return rows.findIndex((r) => r.touching && r.shape === -2 - slot);
}

function sine(v) {
  const l = Math.hypot(v[0], v[1]);
  return l > 0 ? v[1] / l : 0;
}

/* ------------------------------------------------------------------ */

vehicleScenario('the vehicle ABI refuses what nobody could drive', async () => {
  const sim = await loadSim(wasm);
  const e = sim.e;
  const buf = e.malloc(3 * 8 * 9000);
  const road = (pts, closed) => {
    new Float64Array(e.memory.buffer, buf, pts.length * 3).set(pts.flat());
    return e.sim_world_road(buf, pts.length, closed);
  };
  const info = e.malloc(3 * 8);
  const car = (m, r, o = {}) => e.sim_world_vehicle(m, r, o.offset ?? 0, o.top ?? 10, o.lat ?? 5, o.drift ?? 0,
    o.len ?? 4.5, o.wid ?? 1.8, o.hei ?? 1.4, o.clr ?? 0.15, o.e ?? 0.06, o.mu ?? 0.4);
  const raw = new Float64Array(MOVER_SLOTS * VP);
  const rawPtr = e.malloc(MOVER_SLOTS * VP * 8);
  const bad = [];
  const want = (label, got, expect) => {
    if (got !== expect) {
      bad.push(`${label}: ${simErrorName(got)}, not ${simErrorName(expect)}`);
    }
  };
  e.sim_world_clear();
  want('a road of one point', road([[0, 0, 0]], 0), SIM_ERR_BAD_ARG);
  want('a closed road of two points', road([[0, 0, 0], [10, 0, 0]], 1), SIM_ERR_BAD_ARG);
  want('a coordinate that is not finite', road([[0, 0, 0], [NaN, 0, 0]], 0), SIM_ERR_BAD_ARG);
  want('a point given twice', road([[0, 0, 0], [0, 0, 0], [10, 0, 0]], 0), SIM_ERR_BAD_ARG);
  want('a closed road repeating its first point', road([[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 0, 0]], 1), SIM_ERR_BAD_ARG);
  want('a segment straight up', road([[0, 0, 0], [0, 0, 10]], 0), SIM_ERR_BAD_ARG);
  want('more points than a road holds', road(Array.from({ length: 8193 }, (_, i) => [i, 0, 0]), 0), SIM_ERR_BAD_ARG);
  want('a road longer than a road holds', road([[0, 0, 0], [9000, 0, 0]], 0), SIM_ERR_BAD_STATE);
  /* The turn limit (world.c ROAD_TURN_COS, 30 degrees at a point in plan)
   * and the coordinate bound (ROAD_COORD_MAX, a thousand kilometres). A
   * corner drawn as one point, either side of the limit, placed with
   * trig.js; a road folded back on itself, whose bend reads as none and
   * whose car would reverse at speed within a step; a closed triangle, every
   * corner of it past the limit; and a road out where doubles are 2 m apart,
   * which cut into pieces of no length and a pose that was not a number
   * (the verifier's finding of 2026-09-25). */
  const corner = (deg) => {
    const sc = sincos((deg * Math.PI) / 180, { s: 0, c: 0 });
    return [[0, 0, 0], [10, 0, 0], [10 + 10 * sc.c, 10 * sc.s, 0]];
  };
  want('a corner of 31 degrees at one point', road(corner(31), 0), SIM_ERR_BAD_ARG);
  want('a corner of 31 degrees to the right', road(corner(-31), 0), SIM_ERR_BAD_ARG);
  want('a road folded back on itself', road([[0, 0, 0], [10, 0, 0], [0, 0.5, 0]], 0), SIM_ERR_BAD_ARG);
  want('a closed triangle, every corner past 30 degrees', road([[0, 0, 0], [50, 0, 0], [50, 50, 0]], 1), SIM_ERR_BAD_ARG);
  want('a closed road whose joining point folds back', road([[0, 0, 0], [10, 0, 0], [20, 0, 0]], 1), SIM_ERR_BAD_ARG);
  want('a road at x = 1e16', road([[1e16, 0, 0], [1e16 + 10, 0, 0], [1e16 + 20, 0, 0]], 0), SIM_ERR_BAD_ARG);
  want('a road a metre past a thousand kilometres', road([[0, 0, 0], [10, 0, 0], [1e6 + 1, 0, 0]], 0), SIM_ERR_BAD_ARG);
  want('a road dropping past a thousand kilometres', road([[0, 0, 0], [10, 0, -1e6 - 1]], 0), SIM_ERR_BAD_ARG);
  want('an open road 100 m long', road([[0, 0, 0], [100, 0, 0]], 0), 0);
  /* A closed 36 sided ring of 20 m radius, 10 degrees at every point: an
   * eased bend the limit lets through. */
  const ring = [];
  for (let i = 0; i < 36; i += 1) {
    const sc = sincos((i * Math.PI) / 18, { s: 0, c: 0 });
    ring.push([20 * sc.c, 20 * sc.s, 0]);
  }
  want('a closed ring, 10 degrees at every point', road(ring, 1), 1);
  want('a corner of 29 degrees at one point', road(corner(29), 0), 2);
  want('road info of a road that is not there', e.sim_world_road_info(3, info), SIM_ERR_BAD_ARG);
  e.sim_world_road_info(0, info);
  const r0 = Array.from(new Float64Array(e.memory.buffer, info, 3));
  e.sim_world_road_info(1, info);
  const r1 = Array.from(new Float64Array(e.memory.buffer, info, 3));
  /* 100 m cut to a metre is 101 points. The ring's sides are each cut to
   * the metre too, and its first point comes again at the end; its length
   * is its sides', summed here from the points it was handed. */
  let ringPts = 1;
  let ringLen = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const l = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
    ringPts += Math.ceil(l);
    ringLen += l;
  }
  if (!(r0[0] === 101 && Math.abs(r0[1] - 100) < 1e-9 && r0[2] === 0
    && r1[0] === ringPts && Math.abs(r1[1] - ringLen) < 1e-9 && r1[2] === 1)) {
    bad.push(`road info: [${r0}] and [${r1}], not [101, 100, 0] and [${ringPts}, ${ringLen}, 1]`);
  }
  want('a car in slot 64', car(64, 0), SIM_ERR_BAD_ARG);
  want('a car in slot -1', car(-1, 0), SIM_ERR_BAD_ARG);
  want('a car on a road that is not there', car(0, 3), SIM_ERR_BAD_ARG);
  want('a car of no length', car(0, 0, { len: 0 }), SIM_ERR_BAD_ARG);
  want('a car standing still', car(0, 0, { top: 0 }), SIM_ERR_BAD_ARG);
  want('a car slower than 0.1 m/s', car(0, 0, { top: 0.05 }), SIM_ERR_BAD_ARG);
  want('a car past 100 m/s', car(0, 0, { top: 101 }), SIM_ERR_BAD_ARG);
  want('a car with no grip', car(0, 0, { lat: 0 }), SIM_ERR_BAD_ARG);
  want('a car cornering at under 0.1 m/s/s', car(0, 0, { lat: 0.05 }), SIM_ERR_BAD_ARG);
  want('an offset past ten thousand kilometres', car(0, 0, { offset: 1.1e7 }), SIM_ERR_BAD_ARG);
  want('a negative drift', car(0, 0, { drift: -0.1 }), SIM_ERR_BAD_ARG);
  want('restitution past 1', car(0, 0, { e: 1.5 }), SIM_ERR_BAD_ARG);
  want('an offset that is not finite', car(0, 0, { offset: Infinity }), SIM_ERR_BAD_ARG);
  want('a car in slot 63', car(63, 0), 0);
  want('a car in slot 5 on the ring', car(5, 1, { drift: 0.05 }), 0);
  want('the clock at half a step', e.sim_world_clock(0.5), SIM_ERR_BAD_ARG);
  want('the clock not a number', e.sim_world_clock(NaN), SIM_ERR_BAD_ARG);
  want('the clock past 2^53', e.sim_world_clock(9007199254740994), SIM_ERR_BAD_ARG);
  want('the clock before 0', e.sim_world_clock(-12345), 0);
  want('a train car in slot 63, the last', e.sim_world_mover(63, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0.06, 0.4), 0);
  want('a train car in slot 64', e.sim_world_mover(64, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0.06, 0.4), SIM_ERR_BAD_ARG);
  e.sim_world_vehicle_poses(rawPtr);
  raw.set(new Float64Array(e.memory.buffer, rawPtr, MOVER_SLOTS * VP));
  if (!(raw[63 * VP] === 0 && raw[5 * VP] === 1)) {
    bad.push(`a train car seated in a car's slot should end the car there: slot 63 reads ${raw[63 * VP]}, slot 5 ${raw[5 * VP]}`);
  }
  e.sim_world_clear();
  e.sim_world_vehicle_poses(rawPtr);
  raw.set(new Float64Array(e.memory.buffer, rawPtr, MOVER_SLOTS * VP));
  if (raw.some((v) => v !== 0)) {
    bad.push('after sim_world_clear some slot still reads as a car');
  }
  want('a car after the world was cleared', car(0, 0), SIM_ERR_BAD_ARG);
  for (let i = 0; i < 16; i += 1) {
    want(`road ${i} of 16`, road([[0, i * 10, 0], [5, i * 10, 0]], 0), i);
  }
  want('a seventeenth road', road([[0, 0, 0], [5, 0, 0]], 0), SIM_ERR_BAD_STATE);
  e.sim_world_clear();
  want('a first road of 8,001 points', road([[0, 0, 0], [8000, 0, 0]], 0), 0);
  want('a second', road([[0, 10, 0], [8000, 10, 0]], 0), 1);
  want('a third, past the 16,384 points all roads hold', road([[0, 20, 0], [8000, 20, 0]], 0), SIM_ERR_BAD_STATE);
  /* Eight speed tables of 8,001 points fill the 65,536; the ninth distinct
   * one does not fit, and a car that shares an existing table still does. */
  for (let k = 0; k < 8; k += 1) {
    want(`speed table ${k + 1}`, car(k, 0, { top: 10 + k }), 0);
  }
  want('a ninth speed table', car(8, 0, { top: 30 }), SIM_ERR_BAD_STATE);
  want('a car sharing the first table', car(9, 0, { top: 10 }), 0);
  /* A road knotted round a circle of 0.3 m, drawn smoothly (36 points, 10
   * degrees at each, so the turn limit lets it through) and tighter than any
   * road: driven at world.c's ROAD_KAPPA_MAX, 2 per metre, so its corner
   * speed has a floor, its lap an end, and its car a place that is a number. */
  e.sim_world_clear();
  const knot = [];
  for (let i = 0; i < 36; i += 1) {
    const sc = sincos((i * Math.PI) / 18, { s: 0, c: 0 });
    knot.push([0.3 * sc.c, 0.3 * sc.s, 0]);
  }
  want('a road knotted round 0.3 m, drawn smoothly', road(knot, 1), 0);
  want('a slow car on it', car(0, 0, { top: 0.1, lat: 0.1 }), 0);
  let knotted = true;
  for (const n of [0, 1, 777, 1e6, -1e6, 9007199254740992]) {
    e.sim_world_clock(n);
    e.sim_world_vehicle_poses(rawPtr);
    raw.set(new Float64Array(e.memory.buffer, rawPtr, MOVER_SLOTS * VP));
    const k = carAt(raw, 0);
    knotted = knotted && raw.slice(0, VP).every(Number.isFinite) && Math.abs(k.kap) <= 2 && k.speed > 0;
  }
  if (!knotted) {
    bad.push('a car on a road knotted tighter than half a metre is not a finite pose bending at most 2 per metre');
  }
  check('every refusal is the one the ABI promises, and every good call is taken', bad.length === 0, bad.join('; '));
});

vehicleScenario('a car\'s pose is a pure function of the clock', async () => {
  /* A stadium with an ordinary car and a drift car, and an open road with a
   * bend whose car turns round at both ends; the craft parked far away. */
  const world = async () => {
    const sim = await loadSim(wasm);
    call(sim, 'sim_set_airframe', 0);
    sim.init(CONFIGS[0]);
    sim.reset();
    sim.setCellVoltage(4.2);
    call(sim, 'sim_world_clear');
    call(sim, 'sim_world_frame', 0, 0, REST[0], 0);
    call(sim, 'sim_world_build');
    uploadRoad(sim, roadToThree(stadiumRoad(60, 15)), true);
    uploadRoad(sim, roadToThree(turnRoad(1, 12, 30, 120, 30)), false);
    addVehicle(sim, 0, 0, { offset: 0, topSpeed: 14, lateral: 7, ...CAR });
    addVehicle(sim, 7, 0, { offset: 100, topSpeed: 14, lateral: 7, drift: 0.06, ...CAR });
    addVehicle(sim, 63, 1, { offset: 10, topSpeed: 12, lateral: 5, ...CAR });
    call(sim, 'sim_set_pose', 500, 500, 0, 1, 0, 0, 0);
    call(sim, 'sim_rest');
    return sim;
  };
  const direct = await world();
  const ptr = direct.e.malloc(MOVER_SLOTS * VP * 8);
  const at = (n) => {
    setVehicleClock(direct, n);
    return readRaw(direct, ptr, new Float64Array(MOVER_SLOTS * VP));
  };
  const lens = [roadInfo(direct, 0).length, roadInfo(direct, 1).length];
  const lenOf = (r) => lens[r];
  /* The first step at which fn holds, searched directly on the clock. */
  const firstWhere = (fn, from, to) => {
    let n = from;
    while (n < to && !fn(at(n))) {
      n += 25;
    }
    let lo = Math.max(from, n - 25);
    while (lo < n && !fn(at(lo))) {
      lo += 1;
    }
    return lo;
  };
  const wrap = firstWhere((f) => f[7] >= lenOf(0), 0, 80000);
  const turn = firstWhere((f) => f[63 * VP + 7] >= lenOf(1), 0, 80000);
  const back = firstWhere((f) => f[63 * VP + 7] >= 2 * lenOf(1), turn, 120000);
  /* The drift car starts in a bend; the next one it slides into. */
  const bend = firstWhere((f) => Math.abs(f[7 * VP + 15]) > 0.3, 2000, 80000);
  const marks = [...new Set([1, 999, bend, bend + 1, wrap - 1, wrap, wrap + 1, turn - 1, turn, turn + 1,
    back - 1, back, back + 1])].sort((a, b) => a - b);
  const last = marks[marks.length - 1];
  const expect = new Map(marks.map((n) => [n, at(n)]));
  const negative = [at(-1), at(-5000)];
  /* Stepped: the clock set once, then the module's own steps. On the way,
   * the clock is set to the value it already has, and the craft is reset;
   * neither may move a car. */
  const stepped = async () => {
    const sim = await world();
    const p = sim.e.malloc(MOVER_SLOTS * VP * 8);
    const buf = new Float64Array(MOVER_SLOTS * VP);
    setVehicleClock(sim, 0);
    const h = createHash('sha256');
    const got = new Map();
    let quiet = true;
    for (let n = 1; n <= last; n += 1) {
      call(sim, 'sim_set_ground', 1, 0, 0, 1, 0, 0, -REST[0], GRASS_MU, GRASS_E);
      sim.step(1);
      readRaw(sim, p, buf);
      h.update(Buffer.from(buf.buffer));
      if (expect.has(n)) {
        got.set(n, buf.slice());
      }
      if (n === wrap) {
        setVehicleClock(sim, n);
        quiet = quiet && readRaw(sim, p, new Float64Array(MOVER_SLOTS * VP)).every((v, i) => Object.is(v, buf[i]));
      }
      if (n === turn) {
        sim.reset();
        call(sim, 'sim_set_pose', 500, 500, 0, 1, 0, 0, 0);
        quiet = quiet && readRaw(sim, p, new Float64Array(MOVER_SLOTS * VP)).every((v, i) => Object.is(v, buf[i]));
      }
    }
    return { got, hash: h.digest('hex'), quiet };
  };
  const a = await stepped();
  const b = await stepped();
  check('pose clock: two runs agree to the bit', a.hash === b.hash);
  const differ = marks.filter((n) => !expect.get(n).every((v, i) => Object.is(v, a.got.get(n)[i])));
  check('pose clock: every car at step N set directly is the car stepped to N, to the bit', differ.length === 0,
    `${marks.length} steps across a bend (${bend}), the loop's end (${wrap}) and both of the open road's ends (${turn}, ${back})${differ.length ? `; differ at ${differ.join(', ')}` : ''}`);
  check('pose clock: setting the clock to its own value, and sim_reset, move no car', a.quiet);
  const wrapped = at(wrap);
  const before = at(wrap - 1);
  check('pose clock: the loop wraps with the distance still counting on', wrapped[7] > before[7] && wrapped[7] - before[7] < 0.02,
    `${r3(before[7])} m to ${r3(wrapped[7])} m over the ${r3(lenOf(0))} m lap`);
  const tb = at(turn - 1);
  const tt = at(turn + 1);
  check('pose clock: the open road\'s car turns round at its end, facing back the way it came',
    tb[63 * VP + 4] * tt[63 * VP + 4] + tb[63 * VP + 5] * tt[63 * VP + 5] < -0.99 && tt[63 * VP + 6] < 0.05,
    `heading ${r3(tb[63 * VP + 4])}, ${r3(tb[63 * VP + 5])} to ${r3(tt[63 * VP + 4])}, ${r3(tt[63 * VP + 5])}, ${r3(tt[63 * VP + 6])} m/s`);
  check('pose clock: a clock before 0 is a place on the route too',
    negative.every((f) => f[0] === 1 && Number.isFinite(f[1]) && f[7] < 0));
});

vehicleScenario('the speed profile slows for a tight corner and not a gentle one', async () => {
  /* 120 m straight, a gentle left of 150 m radius through 20 degrees, 80 m,
   * a tight left of 8 m through 90 degrees, 120 m: open, so it also stops at
   * both ends. And the stadium, closed, where braking and pulling away
   * differ. */
  const sim = await loadSim(wasm);
  call(sim, 'sim_world_clear');
  uploadRoad(sim, roadToThree(pieceRoad([{ line: 120 }, { bend: [1, 150, 20] }, { line: 80 }, { bend: [1, 8, 90] }, { line: 120 }])), false);
  uploadRoad(sim, roadToThree(stadiumRoad(60, 15)), true);
  const TOP = 15;
  const LAT = 6;
  addVehicle(sim, 0, 0, { offset: 0, topSpeed: TOP, lateral: LAT, ...CAR });
  addVehicle(sim, 1, 1, { offset: 0, topSpeed: 14, lateral: 7, ...CAR });
  const ptr = sim.e.malloc(MOVER_SLOTS * VP * 8);
  const buf = new Float64Array(MOVER_SLOTS * VP);
  const open = [];
  const loop = [];
  const lenOpen = roadInfo(sim, 0).length;
  const lenLoop = roadInfo(sim, 1).length;
  for (let n = 0; ; n += 1) {
    setVehicleClock(sim, n);
    readRaw(sim, ptr, buf);
    const a = carAt(buf, 0);
    const b = carAt(buf, 1);
    if (a.dist <= 2 * lenOpen) {
      open.push(a);
    }
    if (b.dist <= lenLoop) {
      loop.push(b);
    }
    if (a.dist > 2 * lenOpen && b.dist > lenLoop) {
      break;
    }
  }
  const lateral = (c) => c.speed * c.speed * Math.abs(c.kap);
  const topOk = open.every((c) => c.speed <= TOP) && loop.every((c) => c.speed <= 14);
  const latMax = Math.max(...open.map((c) => lateral(c) / LAT), ...loop.map((c) => lateral(c) / 7));
  const tight = open.filter((c) => Math.abs(c.kap) >= 0.1);
  /* Inside the gentle bend, both ways, clear of its ends by the window the
   * bend is measured across: from 120 m to 172.4 m along the road. */
  const inGentle = (d) => (d > 123 && d < 169.4) || (d > 2 * lenOpen - 169.4 && d < 2 * lenOpen - 123);
  const gentle = open.filter((c) => inGentle(c.dist));
  const tightMin = Math.min(...tight.map((c) => c.speed));
  const kTight = Math.max(...tight.map((c) => Math.abs(c.kap)));
  const gentleMin = Math.min(...gentle.map((c) => c.speed));
  check('profile: never faster than the top speed', topOk,
    `${r3(Math.max(...open.map((c) => c.speed)))} of ${TOP}, ${r3(Math.max(...loop.map((c) => c.speed)))} of 14 m/s`);
  /* The corner speed is sqrt(lateral / curvature) at the tightest curvature
   * either side of a point, so speed squared times curvature is at most the
   * limit everywhere, to the rounding of a square root and two products. */
  check('profile: never corners harder than its lateral limit', latMax <= 1 + 1e-12,
    `at most ${latMax.toPrecision(15)} of it`);
  check('profile: slows hard for the 8 m corner', tight.length > 0 && tightMin <= 1.02 * Math.sqrt(LAT / kTight) && tightMin < 0.6 * TOP,
    `${r3(tightMin)} m/s through it, sqrt(${LAT} / ${r3(kTight)}) = ${r3(Math.sqrt(LAT / kTight))}`);
  check('profile: takes the 150 m bend at full speed', gentle.length > 0 && gentleMin === TOP,
    `${gentle.length} samples in it, slowest ${r3(gentleMin)} m/s`);
  const decel = (arr, dt) => {
    let up = 0;
    let down = 0;
    for (let i = 1; i < arr.length; i += 1) {
      const a = (arr[i].speed - arr[i - 1].speed) / dt;
      up = Math.max(up, a);
      down = Math.max(down, -a);
    }
    return { up, down };
  };
  const lp = decel(loop, 0.001);
  const op = decel(open, 0.001);
  check('profile: on the loop it pulls away at 2.5 m/s/s and brakes at 4 at most', lp.up <= 2.5 * (1 + 1e-9) && lp.down <= 4 * (1 + 1e-9) && lp.down > 3.5,
    `pulls away at ${r3(lp.up)}, brakes at ${r3(lp.down)} m/s/s`);
  check('profile: on the open road 2.5 m/s/s both ways, so its way back is drivable', op.up <= 2.5 * (1 + 1e-9) && op.down <= 2.5 * (1 + 1e-9),
    `${r3(op.up)} up, ${r3(op.down)} down`);
  const ends = open.filter((c) => c.dist < 0.001 || Math.abs(c.dist - lenOpen) < 0.001);
  check('profile: the open road\'s car stops at each end to turn round',
    ends.some((c) => c.dist < 0.001) && ends.some((c) => c.dist > 1) && ends.every((c) => c.speed < 0.1)
    && Math.min(...ends.filter((c) => c.dist > 1).map((c) => c.speed)) < 0.002,
    `${ends.length} samples within a millimetre of an end, none faster than ${r3(Math.max(...ends.map((c) => c.speed)))} m/s`);
});

vehicleScenario('the same hit on a car whichever way its road runs', async () => {
  const degs = [0, 37, 90, 143];
  const got = {};
  for (const d of degs) {
    got[d] = await twice(() => invarianceRun(d));
  }
  check('heading: every heading flown twice agrees with itself to the bit', degs.every((d) => got[d].same));
  const base = got[0].rows;
  const t0 = firstCarTouch(base);
  check('heading: the car hits the craft', t0 >= 0, `at ${t0} ms, ${base.filter((r) => r.touching).length} steps in contact`);
  /* The pose on the road turned a quarter is the pose turned a quarter,
   * every number of it at every step: the road's own arithmetic (lengths,
   * chords, the Menger bend, the tables) is sums and products whose values a
   * quarter turn only swaps and negates. Equal as numbers: a zero coordinate
   * may come back as the other signed zero. */
  const q = got[90].rows;
  const exact = base.every((r, i) => {
    const a = r.car;
    const b = q[i].car;
    return b.p[0] === -a.p[1] && b.p[1] === a.p[0] && b.p[2] === a.p[2] && b.h[0] === -a.h[1] && b.h[1] === a.h[0]
      && b.u[0] === -a.u[1] && b.u[1] === a.u[0] && b.vel[0] === -a.vel[1] && b.vel[1] === a.vel[0]
      && b.speed === a.speed && b.dist === a.dist && b.omega === a.omega && b.kap === a.kap;
  });
  check('heading: at 90 degrees the car is the car at 0 turned a quarter, every number at every step', exact);
  /*
   * The flights. The test turned the road and the craft, so turning each
   * run's state back by its heading must give the 0 degree run's. Nothing
   * about the car's arithmetic can be exact at 37 or 143 degrees: the road's
   * points are placed through trig.js, and every step turns the craft into
   * the car's frame and the contacts back, each a rounding of 1 part in
   * 2^53. So the floor is rounding, and it is measured: the same hit at 37
   * degrees and at 37 plus 1e-13 degrees, a turn no heading means and
   * rounding does. The bar is 1e-9 (m, m/s, rad/s and quaternion), a
   * thousand times that floor as measured when this was written, far below
   * anything a pilot could see, and far above nothing: a heading bug (a sign,
   * a transposed turn) moves this hit by metres.
   */
  const floor = await flyCars(invarianceRun(37 + 1e-13));
  const TOL = 1e-9;
  const qmul = (a, b) => [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
  /* A run's state turned back by its road's heading, into the road's own
   * frame: a quarter turn exactly, any other through trig.js. Reading only. */
  const backOf = (a, deg) => {
    if (deg === 0) {
      return a;
    }
    const b = deg === 90 ? { c: 0, s: 1 } : sincos((deg * Math.PI) / 180, { s: 0, c: 0 });
    const half = sincos((-deg * Math.PI) / 360, { s: 0, c: 0 });
    return {
      p: [b.c * a.p[0] + b.s * a.p[1], -b.s * a.p[0] + b.c * a.p[1], a.p[2]],
      v: [b.c * a.v[0] + b.s * a.v[1], -b.s * a.v[0] + b.c * a.v[1], a.v[2]],
      q: qmul([half.c, 0, 0, half.s], a.q),
      w: a.w,
    };
  };
  const worst = (rows, deg, ref, refDeg) => {
    let m = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const a = backOf(rows[i], deg);
      const b = backOf(ref[i], refDeg);
      const sg = a.q[0] * b.q[0] + a.q[1] * b.q[1] + a.q[2] * b.q[2] + a.q[3] * b.q[3] < 0 ? -1 : 1;
      for (let k = 0; k < 3; k += 1) {
        m = Math.max(m, Math.abs(a.p[k] - b.p[k]), Math.abs(a.v[k] - b.v[k]), Math.abs(a.w[k] - b.w[k]));
      }
      for (let k = 0; k < 4; k += 1) {
        m = Math.max(m, Math.abs(a.q[k] - sg * b.q[k]));
      }
    }
    return m;
  };
  const bottom = worst(floor.rows, 37 + 1e-13, got[37].rows, 37);
  const parts = degs.slice(1).map((d) => [d, worst(got[d].rows, d, base, 0), firstCarTouch(got[d].rows)]);
  check('heading: the same hit at 37, 90 and 143 degrees as at 0, every step, to 1e-9',
    parts.every(([, m, t]) => m <= TOL && t === t0),
    `${parts.map(([d, m]) => `${d}: ${m.toExponential(2)}`).join(', ')}; rounding's own floor, 37 against 37 plus 1e-13 degrees, ${bottom.toExponential(2)}`);
});

vehicleScenario('a car sweeping into a hovering craft pushes it the way it turns', async () => {
  const runs = { left: await twice(() => sweepRun(1)), right: await twice(() => sweepRun(-1)), straight: await twice(() => sweepRun(0)) };
  check('sweep: each flown twice agrees with itself to the bit', Object.values(runs).every((r) => r.same));
  const out = {};
  for (const [k, r] of Object.entries(runs)) {
    const t0 = firstCarTouch(r.rows);
    const after = r.rows[Math.min(r.rows.length - 1, t0 + 150)];
    out[k] = {
      t0,
      carSine: t0 >= 0 ? r.rows[t0].car.h[1] : NaN,
      craftSine: t0 >= 0 ? sine(after.v) : NaN,
      deep: Math.max(...r.rows.map((x) => hullDepth(x, r.af))),
      props: Math.max(...r.rows.map((x) => x.depth)),
      inside: r.rows.some((x) => insideBox(inCarFrame(x, r.af))),
      speed: after.spd,
    };
  }
  check('sweep: the car hits the craft every time', Object.values(out).every((o) => o.t0 >= 0),
    Object.entries(out).map(([k, o]) => `${k} at ${o.t0} ms`).join(', '));
  /* How far round the craft goes, as the sine of its heading off the
   * approach 150 ms after the hit, against the car's own heading when it
   * struck: pushed the way it turns means at least as far round as that. */
  check('sweep: on a left bend it throws the craft left, at least as far round as the car was',
    out.left.craftSine >= out.left.carSine && out.left.carSine > 0.2,
    `the craft leaves at sine ${r3(out.left.craftSine)}, the car struck at ${r3(out.left.carSine)}`);
  check('sweep: on a right bend, right', out.right.craftSine <= out.right.carSine && out.right.carSine < -0.2,
    `the craft leaves at sine ${r3(out.right.craftSine)}, the car struck at ${r3(out.right.carSine)}`);
  check('sweep: straight on, straight on', Math.abs(out.straight.craftSine) < 0.05,
    `sine ${r3(out.straight.craftSine)}`);
  check('sweep: the hull never 5 cm into the car, and the CG never inside it',
    Object.values(out).every((o) => o.deep <= 0.05 && !o.inside),
    Object.entries(out).map(([k, o]) => `${k} ${r3(o.deep)} m (a prop disc ${r3(o.props)} m)`).join(', '));
});

vehicleScenario('a car\'s front corner clips a craft at 20 m/s', async () => {
  const r = await twice(() => clipRun());
  const rows = r.rows;
  const t0 = firstCarTouch(rows);
  const after = rows.slice(t0, t0 + 300);
  const top = Math.max(...rows.map((x) => x.spd));
  const deep = Math.max(...rows.map((x) => hullDepth(x, r.af)));
  const props = Math.max(...rows.map((x) => x.depth));
  const v = rows[Math.min(rows.length - 1, t0 + 100)].v;
  check('clip: two runs agree to the bit', r.same);
  check('clip: the car\'s corner reaches the craft', t0 >= 0, `at ${t0} ms, ${after.filter((x) => x.touching).length} steps of contact`);
  check('clip: it throws the craft forward and out to the side it was on', v[0] > 5 && v[1] > 0.5,
    `${r3(v[0])} m/s along, ${r3(v[1])} m/s out`);
  check('clip: no faster than one and a half times the car', top < 1.5 * 20, `${r3(top)} m/s`);
  check('clip: the hull never 5 cm into the car, and the CG never inside it',
    deep <= 0.05 && !rows.some((x) => insideBox(inCarFrame(x, r.af))), `${r3(deep)} m (a prop disc ${r3(props)} m)`);
});

vehicleScenario('a whoop rides beside a car as it pulls away and turns', async () => {
  const r = await twice(() => rideRun());
  const rows = r.rows;
  const off = CAR.width / 2 + HULL[1];
  const t0 = firstCarTouch(rows);
  const bend = rows.filter((x) => Math.abs(x.car.omega) > 0.1);
  const gaps = bend.map((x) => {
    const l = inCarFrame(x, r.af);
    return { along: l[0], gap: -l[1] - off };
  });
  const touches = bend.filter((x) => x.touching && x.shape === -2).length;
  const end = rows[rows.length - 1];
  const turned = Math.acos(Math.max(-1, Math.min(1, rows[0].car.h[0] * end.car.h[0] + rows[0].car.h[1] * end.car.h[1])));
  const vh = Math.hypot(end.v[0], end.v[1]);
  const along = (end.v[0] * end.car.h[0] + end.v[1] * end.car.h[1]) / vh;
  check('ride: two runs agree to the bit', r.same);
  check('ride: it is against the car before the bend', t0 >= 0 && t0 < rows.findIndex((x) => Math.abs(x.car.omega) > 0.1), `from ${t0} ms`);
  check('ride: through the bend it stays beside the car, never more than 15 cm off its side, never 2 cm into it',
    bend.length > 0 && gaps.every((g) => g.gap > -0.02 && g.gap < 0.15 && Math.abs(g.along) < CAR.length / 2),
    `gap ${r3(Math.min(...gaps.map((g) => g.gap)))} to ${r3(Math.max(...gaps.map((g) => g.gap)))} m, along ${r3(Math.min(...gaps.map((g) => g.along)))} to ${r3(Math.max(...gaps.map((g) => g.along)))} m`);
  check('ride: and leans on it there', touches >= 100, `${touches} steps of the ${bend.length} in the bend in contact`);
  check('ride: the car turned, and the whoop with it, at its speed', turned > Math.PI / 4 && along > Math.cos((5 * Math.PI) / 180)
    && Math.abs(vh - end.car.speed) < 0.5,
    `the car turned ${r3((turned * 180) / Math.PI)} degrees; the whoop goes ${r3(vh)} m/s to its ${r3(end.car.speed)}, ${r3((Math.acos(Math.min(1, along)) * 180) / Math.PI)} degrees off its heading`);
  check('ride: no contact deeper than 5 cm (a whoop\'s ducts are its hull)', Math.max(...rows.map((x) => x.depth)) <= 0.05,
    `${r3(Math.max(...rows.map((x) => x.depth)))} m`);
});

vehicleScenario('a drift car\'s solid body is yawed off its path by the slip', async () => {
  const plain = await twice(() => driftRun(0));
  const drift = await twice(() => driftRun(0.06));
  check('drift: both flown twice agree with themselves to the bit', plain.same && drift.same);
  check('drift: an ordinary car points the way it goes and passes the craft clear',
    plain.rows.every((x) => x.car.slip === 0 && x.car.h[0] === x.car.u[0] && x.car.h[1] === x.car.u[1])
    && !plain.rows.some((x) => x.touching));
  const bend = drift.rows.filter((x) => Math.abs(x.car.kap) > 0.06);
  const straight = drift.rows.filter((x) => x.car.kap === 0);
  const slipMin = Math.min(...bend.map((x) => x.car.slip));
  check('drift: the drift car slides into the bend, and not on the straight',
    bend.length > 0 && slipMin > 0.3 && straight.length > 0 && straight.every((x) => x.car.slip === 0),
    `tan(slip / 2) ${r3(slipMin)} or more in the bend (${r3((2 * Math.atan(slipMin) * 180) / Math.PI)} degrees)`);
  /* The heading is the direction of travel turned by the slip, as the
   * module holds it and as the shell reads it: cos = (1 - t^2) / (1 + t^2),
   * sin = 2 t / (1 + t^2), and the shell's quaternion turns a model's nose
   * (-z) onto the shell's heading. */
  let worstPose = 0;
  let worstShell = 0;
  for (const x of drift.rows) {
    const c = x.car;
    const t = c.slip;
    const cs = (1 - t * t) / (1 + t * t);
    const sn = (2 * t) / (1 + t * t);
    const dot = c.h[0] * c.u[0] + c.h[1] * c.u[1];
    const crs = c.u[0] * c.h[1] - c.u[1] * c.h[0];
    worstPose = Math.max(worstPose, Math.abs(dot - cs), Math.abs(crs - sn));
    const s = x.shell;
    const hs = threeDirToSim(s.hx, 0, s.hz, { x: 0, y: 0, z: 0 });
    const q = s;
    /* (0, 0, -1) turned by q, a turn about +y: (-2 (xz + wy), 0, -(1 - 2 (x^2 + y^2))). */
    const nx = -2 * (q.qx * q.qz + q.qw * q.qy);
    const nz = -(1 - 2 * (q.qx * q.qx + q.qy * q.qy));
    worstShell = Math.max(worstShell, Math.abs(hs.x - c.h[0]), Math.abs(hs.y - c.h[1]), Math.abs(nx - s.hx), Math.abs(nz - s.hz),
      Math.abs(s.slip - t));
  }
  check('drift: the heading is the travel turned by the slip, to 1e-12, in the module and in what the shell reads',
    worstPose < 1e-12 && worstShell < 1e-12, `module ${worstPose.toExponential(2)}, shell ${worstShell.toExponential(2)}`);
  const t0 = firstCarTouch(drift.rows);
  check('drift: the drift car\'s tail swings into the craft the ordinary car passed', t0 >= 0, `at ${t0} ms`);
  if (t0 >= 0) {
    const row = drift.rows[t0];
    const c = row.car;
    const yawed = outsideBox(inCarFrame(row, drift.af, c.h));
    const onPath = outsideBox(inCarFrame(row, drift.af, c.u));
    check('drift: what it hit is the body turned by the slip, and not the body along its path',
      yawed <= REACH && onPath > REACH + 0.3,
      `the craft's CG ${r3(yawed)} m from the yawed body, ${r3(onPath)} m from the same body along the path`);
    /* The contact of step t0 was found with the car where it was as that
     * step began: the pose read after step t0 - 1. A face of that car, and
     * the face on the craft's side of it: the normal in the car's frame
     * points the way the craft's CG lies from the car's centre, which a
     * face's axis alone does not say. */
    const pre = row.carPre;
    const used = pre.h;
    const n = row.n;
    const along = n[0] * used[0] + n[1] * used[1];
    const across = n[1] * used[0] - n[0] * used[1];
    const face = Math.max(Math.abs(along), Math.abs(across));
    const l = inCarFrame({ ...row, car: pre }, drift.af, used);
    const outward = (Math.abs(along) > Math.abs(across) ? along * l[0] : across * l[1]) > 0;
    check('drift: the normal it reported is a face of the drawn car, along its heading or across it, facing the craft',
      Math.abs(face - 1) < 1e-9 && outward,
      `n ${n.map(r3).join(', ')}, heading ${used.map(r3).join(', ')}, off a face by ${Math.abs(face - 1).toExponential(1)}; the craft's CG at ${l.slice(0, 2).map(r3).join(', ')} in the car's frame, ${outward ? 'on' : 'NOT on'} the face's side`);
  }
});

/* ------------------------------------------------------------------ *
 * HOW A CAR'S CONTACT MOVES, which way it pushes, and the face a point comes
 * in by (the verifier's findings on Stage D part 2, 2026-09-25: the yaw rate
 * in a contact's surface velocity, the drift's share of it, the normal's
 * sign and the car's pose a step ago were each invisible to every check).
 * Read from the module's own record of every contact a step made with a
 * car (sim_world_vehicle_contacts), against the car's poses as the step
 * began and ended, read back as the shell reads them.
 * ------------------------------------------------------------------ */

/* The turn from heading a to heading b, rad, left positive, the short way
 * modulo half a turn, as world.c's vehicle_turn reads it: a box turned half
 * round is the same box. The test's own arithmetic, atan2 included, none of
 * which reaches the module. */
function turnOf(a, b) {
  let c = a[0] * b[0] + a[1] * b[1];
  let s = a[0] * b[1] - a[1] * b[0];
  if (c < 0) {
    c = -c;
    s = -s;
  }
  return Math.atan2(s, c);
}
const STEP_S = 0.001;
/* src/native/plant.c prop_r: a prop contact is pushed at its hub, and the
 * car's surface velocity is taken at the rim point that touched (world.c
 * vehicle_contacts), up to a prop's radius from it. */
const PROP_R = { 0: 0.0635, 1: 0.0155 };

/* Every vehicle run with a car's contact in it, flown twice (once, shared by
 * the scenarios that read them). The first five are cars that turn. */
async function contactFlights() {
  return {
    'sweep left': await twice(() => sweepRun(1)),
    'sweep right': await twice(() => sweepRun(-1)),
    ride: await twice(() => rideRun()),
    drift: await twice(() => driftRun(0.06)),
    'drift entry': await twice(() => driftEntryRun()),
    clip: await twice(() => clipRun()),
    'prop edge': await twice(() => propEdgeRun()),
  };
}
const TURNING = ['sweep left', 'sweep right', 'ride', 'drift', 'drift entry'];

vehicleScenario('a drift car\'s tail swings out through a craft as it enters a bend', async () => {
  const r = (await contactFlights())['drift entry'];
  const rows = r.rows;
  const t0 = firstCarTouch(rows);
  check('drift entry: two runs agree to the bit', r.same);
  /* The slide's own rate where the tail first touches: the heading's turn
   * over the step less the path's, from the two poses. */
  const x = t0 >= 0 ? rows[t0] : null;
  const slide = x ? (turnOf(x.carPre.h, x.car.h) - turnOf(x.carPre.u, x.car.u)) / STEP_S : 0;
  check('drift entry: the tail reaches the craft while the slide is still growing', t0 >= 0 && slide > 1,
    x ? `at ${t0} ms, the slide growing at ${r3(slide)} rad/s, ${r3((2 * Math.atan(x.carPre.slip) * 180) / Math.PI)} degrees of it so far` : 'no touch');
  const deep = Math.max(...rows.map((y) => hullDepth(y, r.af)));
  check('drift entry: the hull never 5 cm into the car, and the CG never inside it',
    deep <= 0.05 && !rows.some((y) => insideBox(inCarFrame(y, r.af))), `${r3(deep)} m`);
});

vehicleScenario('a contact on a car moves as the drawn car moves', async () => {
  const flights = await contactFlights();
  /*
   * The surface velocity each contact read, less the car's velocity as the
   * step began, is the car's turn across the lever arm: the turn between the
   * heading the step began with and the one it ended with, over the step,
   * about the road point under the car's centre. World.c takes that turn as
   * 2 tan(turn / 2); this takes it by atan2, and the two part by the turn
   * cubed over twelve. So each contact's bar is twice that across its lever,
   * over the step, and a micrometre a second for rounding: 3e-5 m/s at the
   * fastest turn here, 1e-6 on a car going straight. The parts it has to
   * see are each far above that and are measured below: the whole turn
   * across the lever (left out, it is 0);
   * the drift's share, the heading's turn less the path's (left out, a drift
   * car is read as if it followed its path); and the path's turn less speed
   * times curvature (read as v kappa, a car entering or leaving a bend is
   * read as turning when it is not, or not when it is).
   *
   * A prop contact is pushed at its hub and its surface velocity is taken at
   * the rim point that touched, which the record does not give, so a prop's
   * is held only to within the turn across a prop's radius. Every hull and
   * lens contact is held to the bar.
   */
  const bar = (w, lever) => 1e-6 + (2 * Math.abs(w * w * w) * STEP_S * STEP_S * lever) / 12;
  let n = 0;
  let nProp = 0;
  let worst = 0;
  let where = 'none';
  let barMax = 0;
  let propWorst = 0;
  const past = new Map();
  let yawMax = 0;
  let driftMax = 0;
  let vkMax = 0;
  for (const k of TURNING) {
    const r = flights[k];
    for (const x of r.rows) {
      for (const c of x.vc) {
        const w = turnOf(c.pre.h, c.post.h) / STEP_S;
        const wu = turnOf(c.pre.u, c.post.u) / STEP_S;
        const rx = c.p[0] - c.pre.p[0];
        const ry = c.p[1] - c.pre.p[1];
        const lever = Math.sqrt(rx * rx + ry * ry);
        const err = Math.hypot(c.vs[0] - c.pre.vel[0] + w * ry, c.vs[1] - c.pre.vel[1] - w * rx, c.vs[2] - c.pre.vel[2]);
        if (c.kind === 2) {
          nProp += 1;
          propWorst = Math.max(propWorst, (err - Math.abs(w) * PROP_R[r.af]) / bar(w, lever + PROP_R[r.af]));
          continue;
        }
        n += 1;
        const b = bar(w, lever);
        barMax = Math.max(barMax, b);
        if (err > b) {
          past.set(k, (past.get(k) || 0) + 1);
        }
        if (err / b > worst) {
          worst = err / b;
          where = `${err.toExponential(2)} m/s against a bar of ${b.toExponential(2)}, ${k} at ${x.ms} ms, ${r3(lever)} m out, the car turning ${r3(w)} rad/s`;
        }
        yawMax = Math.max(yawMax, Math.abs(w) * lever);
        driftMax = Math.max(driftMax, Math.abs(w - wu) * lever);
        vkMax = Math.max(vkMax, Math.abs(wu - c.pre.speed * c.pre.kap) * lever);
      }
    }
  }
  check('contact motion: every hull and lens contact on a turning car moves as the car does, its velocity plus the turn between its two poses across the lever arm, each to its bar',
    n > 0 && worst <= 1, `${n} contacts in ${TURNING.join(', ')}; the worst for its bar ${where}${past.size ? `; past the bar: ${[...past].map(([k, c]) => `${k} ${c}`).join(', ')}` : ''}`);
  check('contact motion: every prop contact within a prop\'s radius of that', nProp > 0 && propWorst <= 1,
    `${nProp} prop contacts, ${propWorst > 0 ? `the worst ${r3(propWorst)} of its bar` : 'none'} past the turn across a prop's radius`);
  check('contact motion: and each part of the turn is there to be seen, ten times the largest bar or more',
    yawMax >= 10 * barMax && driftMax >= 10 * barMax && vkMax >= 10 * barMax,
    `the largest bar ${barMax.toExponential(2)} m/s; at these contacts the turn across the lever reaches ${r3(yawMax)} m/s, the drift's share of it ${r3(driftMax)}, the path's turn less speed times curvature ${r3(vkMax)}`);
  /*
   * And the car's velocity is how its point moves: between the two poses of
   * every step, to half a step of the firmest braking (world.c's
   * VEHICLE_BRAKE, 4 m/s/s: 2 mm/s). Where a step crosses a point the road
   * turns at, the point's path bends inside the step and the two are not the
   * same thing; those steps are counted and left out.
   */
  let all = 0;
  let kept = 0;
  let lin = 0;
  let linAt = 'none';
  for (const [k, r] of Object.entries(flights)) {
    for (const x of r.rows) {
      const a = x.carPre;
      const b = x.car;
      const d = [(b.p[0] - a.p[0]) / STEP_S, (b.p[1] - a.p[1]) / STEP_S, (b.p[2] - a.p[2]) / STEP_S];
      const sv = Math.hypot(a.vel[0], a.vel[1]);
      const sd = Math.hypot(d[0], d[1]);
      all += 1;
      if (sv > 1e-6 && sd > 1e-6 && Math.abs(a.vel[0] * d[1] - a.vel[1] * d[0]) / (sv * sd) > 1e-9) {
        continue;
      }
      kept += 1;
      const e = Math.hypot(d[0] - a.vel[0], d[1] - a.vel[1], d[2] - a.vel[2]);
      if (e > lin) {
        lin = e;
        linAt = `${k} at ${x.ms} ms`;
      }
    }
  }
  check('contact motion: the car\'s velocity is how its point moves from one pose to the next, to 2 mm/s',
    kept >= 0.9 * all && lin <= 0.002 * (1 + 1e-6) + 1e-9,
    `${kept} of ${all} steps (the rest cross a point the road turns at); worst ${lin.toExponential(2)} m/s, ${linAt}`);
});

vehicleScenario('every contact a car makes pushes the craft away from the car', async () => {
  const flights = await contactFlights();
  /* The normal each contact carries, against the line from the car's box
   * centre (as the step began, the pose the contact was found with) to the
   * craft's CG: pointing from the car toward the craft, it has a positive
   * share of that line. A face normal of a box the CG is outside does, and
   * so does the box test's own separating axis, whose sign is taken from the
   * two centres; a point whose face was chosen from a stale or wrong pose
   * does not. Every contact of every step, and the one the report names. */
  let n = 0;
  let steps = 0;
  const bad = [];
  for (const [k, r] of Object.entries(flights)) {
    const zc = CAR.clearance + CAR.height / 2;
    for (const x of r.rows) {
      const cg = [x.p[0], x.p[1], x.p[2] + REST[r.af]];
      const away = (nv, pre) => nv[0] * (cg[0] - pre.p[0]) + nv[1] * (cg[1] - pre.p[1]) + nv[2] * (cg[2] - pre.p[2] - zc) > 0;
      if (x.vc.length) {
        steps += 1;
      }
      for (const c of x.vc) {
        n += 1;
        if (!away(c.n, c.pre)) {
          bad.push(`${k} at ${x.ms} ms (${['hull', 'lens', 'prop'][c.kind]})`);
        }
      }
      if (x.touching && x.shape === -2 && !away(x.n, x.carPre)) {
        bad.push(`${k} at ${x.ms} ms (reported)`);
      }
    }
  }
  check('normals: every contact on a car, on every step of every car run, points from the car toward the craft',
    n > 0 && bad.length === 0,
    `${n} contacts on ${steps} steps of ${Object.keys(flights).join(', ')}${bad.length ? `; ${bad.length} point into the car, first ${bad.slice(0, 4).join(', ')}` : ''}`);
});

vehicleScenario('a prop is pushed out of a car by the face it came in through, as the car was a step ago', async () => {
  const r = (await contactFlights())['prop edge'];
  const rows = r.rows;
  check('prop edge: two runs agree to the bit', r.same);
  /* The first step any disc meets the car. Its tips came in through the
   * front face: 5 mm clear of it as the car was a step ago, 20 mm through it
   * now, and 10 mm under the roof, so the roof is the face nearest them and
   * only the car's pose a step ago says it was the front. */
  const first = rows.find((x) => x.vc.some((c) => c.kind === 2));
  const props = first ? first.vc.filter((c) => c.kind === 2) : [];
  let off = 0;
  let shallow = Infinity;
  for (const c of props) {
    off = Math.max(off, Math.hypot(c.n[0] - c.pre.h[0], c.n[1] - c.pre.h[1], c.n[2]));
    shallow = Math.min(shallow, c.depth);
  }
  check('prop edge: on the step the discs first meet the car, each is pushed along the car\'s heading, out of its front, and not up out of its roof',
    first && first.ms === 3 && props.length > 0 && off < 1e-12 && shallow > r.spec.gap,
    first ? `${props.length} prop contacts at step ${first.ms + 1}, each ${r3(shallow)} m or more through the front with the roof ${r.spec.gap} m above; normals off the heading by ${off.toExponential(1)}` : 'no prop met the car');
  const deep = Math.max(...rows.map((y) => hullDepth(y, r.af)));
  check('prop edge: the hull never 5 cm into the car, and the CG never inside it',
    deep <= 0.05 && !rows.some((y) => insideBox(inCarFrame(y, r.af))), `${r3(deep)} m`);
});

vehicleScenario('a craft set on a moving car\'s roof is not held by it', async () => {
  const r = await twice(() => roofRideRun());
  const rows = r.rows;
  const onRoof = rows.filter((x) => x.p[2] + REST[r.af] > CAR.clearance + CAR.height - 0.05);
  const lastOn = rows.findLastIndex((x) => x.p[2] + REST[r.af] > CAR.clearance + CAR.height - 0.05);
  const end = rows[rows.length - 1];
  const fastest = Math.max(...rows.map((x) => Math.hypot(x.v[0], x.v[1])));
  check('roof: two runs agree to the bit', r.same);
  check('roof: it sits on the car, touching it', onRoof.length > 0 && onRoof.some((x) => x.touching && x.shape === -2));
  check('roof: the module never takes the roof as ground', rows.every((x) => x.supportNow === -1 && x.support === -1)
    && !rows.some((x) => x.p[2] > 0.3 && x.ground > 0));
  check('roof: friction is all it has, so it never goes faster than the car', fastest <= end.car.speed,
    `${r3(fastest)} m/s at most, the car ${r3(end.car.speed)}`);
  check('roof: the car drives out from under it, and it ends on the road behind',
    lastOn < rows.length - 500 && end.p[2] + REST[r.af] < 0.3 && end.car.p[0] - end.p[0] > 10,
    `off the roof at ${lastOn} ms; ends ${r3(end.car.p[0] - end.p[0])} m behind the car`);
});

const costBaseline = (args.find((a) => a.startsWith('--cost-baseline=')) || '').split('=')[1] || '';

/* One configuration's step cost, microseconds a step: the host loop as the
 * shell runs it (sticks every 4 ms, the ground raised every step, the
 * train's cars seated every step where there is a train), 20,000 steps. */
async function costOf(bytes, kind) {
  const sim = await loadSim(bytes);
  call(sim, 'sim_set_airframe', 0);
  sim.init(CONFIGS[0]);
  sim.reset();
  sim.setCellVoltage(4.2);
  call(sim, 'sim_world_clear');
  call(sim, 'sim_world_frame', 0, 0, REST[0], 0);
  call(sim, 'sim_world_build');
  if (kind === 'cars') {
    const run = crowdRun(64, 1);
    uploadRoad(sim, run.spec.roads[0].points, true);
    for (const c of run.spec.cars) {
      addVehicle(sim, c.slot, 0, c);
    }
    setVehicleClock(sim, 0);
  }
  call(sim, 'sim_set_pose', 75, -2.5, 1 - REST[0], 1, 0, 0, 0);
  call(sim, 'sim_rest');
  sim.setAngleMode(true);
  const ctx = { af: 0, i: 0 };
  let st = sim.readState().state;
  const N = 20000;
  const t0 = performance.now();
  for (let ms = 0; ms < N; ms += 1) {
    if (ms % 4 === 0) {
      sim.input(ms / 1000, 0, 0, 0, heightHold(ctx, st, 1 - REST[0]));
    }
    if (kind === 'train') {
      /* The town's train: three cars of about 20 m at 23.5 m/s. */
      const x = -200 + 23.5 * ms * 0.001;
      for (let m = 0; m < 3; m += 1) {
        const cx = x + m * 20;
        sim.e.sim_world_mover(m, cx - 9.7, -1.5, 0, cx + 9.7, 1.5, 4, 23.5, 0, 0, TRAIN.e, TRAIN.mu);
      }
    }
    sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, -REST[0], GRASS_MU, GRASS_E);
    sim.step(1);
    st = sim.readState().state;
  }
  return ((performance.now() - t0) * 1000) / N;
}

vehicleScenario('sixty four cars on one road, and what a step costs', async () => {
  /* Timed first, before any flight has left garbage to collect, in one
   * process: every configuration once to warm the engine, then five rounds
   * interleaved. A measurement and not a guard, because a machine's load
   * moves it: the minimum is the nearest to what a step costs, the median
   * what a busy machine sees. */
  const mods = [['this module', wasm]];
  if (costBaseline) {
    mods.unshift(['baseline', await readFile(costBaseline)]);
  }
  const plan = [];
  for (const [label, bytes] of mods) {
    plan.push([`${label}, no car`, bytes, 'none'], [`${label}, the train alone`, bytes, 'train']);
  }
  plan.push(['this module, 64 cars', wasm, 'cars']);
  const times = new Map(plan.map((p) => [p[0], []]));
  for (const [, bytes, kind] of plan) {
    /* eslint-disable-next-line no-await-in-loop */
    await costOf(bytes, kind);
  }
  for (let round = 0; round < 5; round += 1) {
    for (const [label, bytes, kind] of plan) {
      /* eslint-disable-next-line no-await-in-loop */
      times.get(label).push(await costOf(bytes, kind));
    }
  }
  const r = await twice(() => crowdRun(64, 3000));
  const rows = r.rows;
  const end = rows[rows.length - 1].cars;
  const places = new Set(end.map((c) => `${c.p[0]},${c.p[1]}`));
  check('crowd: two runs agree to the bit', r.same);
  check('crowd: all 64 are on the road, each somewhere of its own', end.length === 64 && end.every((c) => c.on === 1) && places.size === 64);
  check('crowd: they pass within the craft\'s bounding test and none touches it',
    rows.some((x) => x.cars.some((c) => Math.hypot(c.p[0] - x.p[0], c.p[1] - x.p[1]) < REACH + Math.sqrt(4.5 * 4.5 + 1.8 * 1.8 + 1.4 * 1.4) / 2))
    && !rows.some((x) => x.touching));
  console.log(`     step cost, microseconds a step, 5 rounds of 20,000 steps of the whole host loop${costBaseline ? `; baseline ${costBaseline}` : ''}:`);
  for (const [k, v] of times) {
    const sorted = [...v].sort((x, y) => x - y);
    console.log(`       ${k.padEnd(30)} min ${sorted[0].toFixed(2)}  median ${sorted[2].toFixed(2)}  (${v.map((x) => x.toFixed(2)).join(' ')})`);
  }
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`world-check: ${wasmArg ? wasmPath : 'dist/sim.wasm'} against constructed worlds\n`);
  for (const s of [...SCENARIOS, ...READINGS, ...VEHICLE_SCENARIOS]) {
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
}
