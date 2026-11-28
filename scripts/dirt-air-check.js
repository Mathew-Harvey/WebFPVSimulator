/*
 * dirt-air-check.js: a steep low dive through a ground gate counts, and a
 * crash on the grass still does not.
 *
 * THE REPORT. A pilot, 2026-11-28, on WA State Champs 2026, with a recording:
 * "i can fly under these gates". The gates stand on the grass. The clip is a
 * dive from 4 m through the bottom of gate 8, nose down about 70 degrees, at
 * 0.2 to 0.3 m and 65 km/h, and the gate not counted. The race had thrown the
 * pass away in shouldScorePass (src/game/collide.js): the centre was inside
 * the five inch's 0.22 m dirt band and the tilt past DIRT_UPZ, and the band
 * was a height and nothing else, so a clean dive read as a craft on its side
 * on the dirt.
 *
 * THE FIX. The shell counts how long the plant has been off the ground
 * (src/main.js msSinceGround), and a craft that has been off it for
 * DIRT_AIR_MS, props up, with its tilt aware hull clear of the surface, is in
 * the air and its pass counts. That number is only safe if no crash on the
 * grass is ever off the ground that long at a step where it would decide,
 * and this is what holds it there, on the plant itself.
 *
 * HOW. Every flight here is flown through dist/sim.wasm and Betaflight one
 * step a frame, which is the most the shell's counter can count (it is reset
 * by a contact on any step of a frame, so a longer frame only ever counts
 * less), with the shell's crash judge and its dull bounce on the step, as
 * scripts/bounce-check.js flies them, on level grass at the rest height. At
 * every step the pass gate is asked the way src/main.js asks it after the
 * frame: shouldScorePass with this step's travel, clearance, attitude, hit
 * count and the counter, against the same question with no counter, which is
 * the rule as it was.
 *
 * WHAT IS ASSERTED.
 *   THE DIVE: a run in at 4 m, then nose down 70 degrees at three tenths
 *     throttle into the grass, 58 km/h at the band. Every step in the band,
 *     past DIRT_UPZ, props up and hull clear before it touches is refused by
 *     the old rule and scored by the new one, and there are enough of them
 *     to be the report's pass; and every step from the touch on is refused as
 *     before.
 *   THE CRASHES: crash-pacing's eight scenarios and a sweep of crashes into
 *     the grass at throttle 0 and 0.3 (the flights that measured DIRT_AIR_MS,
 *     with the two longest found kept by name). At every step after the first
 *     contact the counter changes no verdict, and the longest air at a step
 *     where it could is printed against DIRT_AIR_MS.
 *   ON ITS BACK: a craft let down onto its back settles a little off flat
 *     and the plant reports no ground contact while it lies there, so the
 *     counter runs. It is refused at every step all the same.
 *
 * Deterministic: Node only, no clock, no random, and no JS trigonometry on
 * anything that reaches the module (the rest pose turns with
 * src/props/trig.js). About ten seconds.
 *
 * Usage: node scripts/dirt-air-check.js [--verbose]
 * Exit code is the number of failed lines.
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

import {
  CrashJudge, putDullBounce, stateUpZ, shouldScorePass, craftVerticalHalf, dirtClearance,
  DIRT_UPZ, DIRT_AIR_MS,
} from '../src/game/collide.js';
import { simPosToThree } from '../src/render/frame.js';
import { sincos } from '../src/props/trig.js';
import { SCENARIOS, record, newSim, flipPilot } from './crash-pacing.js';

/* crash-pacing's level grass: the plane at the five inch's rest height under
 * the sim origin, which is this height in the world. */
const REST = 0.033;
const GROUND_Y = simPosToThree(0, 0, -REST, vec()).y;
const HOVER = 0.27;
const verbose = process.argv.includes('--verbose');

function vec() {
  return {
    x: 0,
    y: 0,
    z: 0,
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    },
  };
}

const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
const r3 = (v) => Math.round(v * 1000) / 1000;

function heightHold(ctx, st, z) {
  const e = z - st[3];
  ctx.i = clamp(ctx.i + e * 0.004 * 0.4, -0.3, 0.3);
  const u = 1 - 2 * (st[8] * st[8] + st[9] * st[9]);
  return clamp((HOVER + 0.15 * e - 0.1 * st[6] + ctx.i) / (u > 0.5 ? u : 0.5), 0, 1);
}

/* Run along +x in angle mode at vRun, height h0; from x = 0, acro, and a
 * stick of roll and pitch held into the ground at throttle thr. */
function crashPilot(vRun, h0, roll, pitch, thr) {
  return (ms, st, ctx) => {
    if (ctx.go || st[1] >= 0) {
      ctx.go = true;
      ctx.angle = false;
      return [roll, pitch, 0, thr];
    }
    ctx.cruise = ctx.cruise || st[4] >= vRun;
    const stick = ctx.cruise ? -clamp(0.3 + 0.2 * (vRun - st[4]), 0, 0.8) : -0.8;
    return [0, stick, 0, heightHold(ctx, st, h0)];
  };
}

/* Let down from 0.25 m tilted tiltDeg about the body x axis, sticks centred,
 * throttle off. Turned with the fixed trig, since it reaches the module. */
function restPose(tiltDeg) {
  const h = sincos((tiltDeg * Math.PI) / 360, { s: 0, c: 1 });
  return [0, 0, 0.25, h.c, h.s, 0, 0];
}

/*
 * Fly a recorded stream one step a frame as the shell does, and ask the pass
 * gate at every step both ways. Returns a row a step: the step, its contacts,
 * the counter, the clearance and attitude, and the two verdicts.
 */
async function fly(sc, stream) {
  const { sim, readReport, raiseGround } = await newSim(sc);
  if (sc.restPose) {
    sim.e.sim_set_pose(...sc.restPose);
    sim.e.sim_rest();
    sim.setAngleMode(false);
  }
  const judge = new CrashJudge();
  judge.seat(1, 0);
  const out = new Float64Array(3);
  const rows = [];
  const prev = vec();
  const curr = vec();
  const heightAt = () => GROUND_Y;
  let nextInput = 0;
  let nextMode = 0;
  let st = sim.readState().state;
  /* src/main.js msSinceGround: zeroed when the stream starts. */
  let airMs = 0;
  for (let step = 0; step < stream.endMs; step += 1) {
    while (nextInput < stream.input.length && stream.input[nextInput][0] < step + 1) {
      const k = stream.input[nextInput];
      sim.input(k[0] / 1000, k[1], k[2], k[3], k[4]);
      nextInput += 1;
    }
    while (nextMode < stream.modes.length && stream.modes[nextMode].step === step) {
      sim.setAngleMode(stream.modes[nextMode].angle);
      nextMode += 1;
    }
    judge.beginFrame();
    const before = st;
    raiseGround();
    sim.step(1);
    st = sim.readState().state;
    const g = sim.e.sim_ground_contacts();
    const rep = readReport();
    const crashed = judge.step(before, st, g, rep, step + 1, true);
    if (crashed || judge.knock(rep, st)) {
      if (putDullBounce(sim, crashed ? judge.stepKind : 'solid', before, st, rep, 0, 0, 1, 1, 0, out, !crashed)) {
        st = sim.readState().state;
      }
    }
    /* The frame's end, as src/main.js reads it: the counter, then the gate. */
    airMs = g > 0 ? 0 : airMs + 1;
    simPosToThree(before[1], before[2], before[3], prev);
    simPosToThree(st[1], st[2], st[3], curr);
    const upz = stateUpZ(st);
    const clearance = curr.y - GROUND_Y;
    const ask = (ms) => shouldScorePass(prev, curr, { upz, clearance, hits: g, airMs: ms, heightAt });
    rows.push({ at: step + 1, g, airMs, clearance, upz, now: ask(airMs), was: ask(0) });
  }
  return rows;
}

/* A step the dirt rule decides and the counter could change: in the band,
 * past DIRT_UPZ, props up, hull clear. */
function deciding(r) {
  return r.clearance < dirtClearance() && r.upz < DIRT_UPZ && r.upz >= 0
    && r.clearance > craftVerticalHalf(Math.sqrt(1 - r.upz * r.upz));
}

async function main() {
  let failures = 0;
  const check = (name, ok, detail) => {
    if (!ok) {
      failures += 1;
    }
    console.log(`     ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
  };
  console.log(`dirt-air-check: DIRT_AIR_MS ${DIRT_AIR_MS}, the band ${r3(dirtClearance())} m, DIRT_UPZ ${DIRT_UPZ}\n`);

  /* THE DIVE. */
  console.log('  the dive: from 4 m, nose down 70 degrees, into the grass');
  {
    const sc = { world: [], pose: [-40, 0, 4], ms: 14000, after: 300, pilot: () => flipPilot(12, 0, -70, 0.3) };
    const stream = await record(sc);
    const rows = await fly(sc, stream);
    const touch = rows.findIndex((r) => r.g > 0);
    const air = touch < 0 ? [] : rows.slice(0, touch).filter(deciding);
    const fixed = air.filter((r) => r.now && !r.was);
    const a = air[0];
    check('it reaches the grass, and in the band before it does it is past DIRT_UPZ, props up and hull clear for 5 steps or more',
      touch >= 0 && air.length >= 5,
      a ? `${air.length} steps from ${r3(a.clearance)} m at body up ${r3(a.upz)}, ${a.airMs} ms off the ground` : 'none');
    check('every one of them was refused by the old rule and is scored now', air.length > 0 && fixed.length === air.length,
      `${fixed.length} of ${air.length}`);
    const after = touch < 0 ? [] : rows.slice(touch);
    const changed = after.filter((r) => r.now !== r.was);
    check('from the touch on, every step judged as before', touch >= 0 && changed.length === 0,
      `${after.length} steps, ${changed.length} changed`);
  }

  /* THE CRASHES. */
  const crashes = SCENARIOS.map((s) => ({ ...s, after: 1500 }));
  const sweep = [];
  for (const v of [10, 15, 20]) {
    for (const h of [0.5, 3]) {
      for (const r of [0, 1]) {
        for (const p of [-1, -0.6, 0.6]) {
          for (const t of [0, 0.3]) {
            sweep.push([v, h, r, p, t]);
          }
        }
      }
    }
  }
  /* The two longest the measuring sweep found, 0.40 s and 0.56 s. */
  sweep.push([15, 1.5, 1, -1, 0], [15, 3, 0.3, 0.6, 0.3]);
  for (const [v, h, r, p, t] of sweep) {
    crashes.push({
      name: `into the grass at ${v} m/s from ${h} m, roll ${r} pitch ${p}, throttle ${t}`,
      world: [], pose: [-60, 0, h], ms: 14000, after: 2500, pilot: () => crashPilot(v, h, r, p, t),
    });
  }
  console.log(`\n  the crashes: ${crashes.length} flights, one step a frame, from the first contact on`);
  let reached = 0;
  let worst = { airMs: 0 };
  let worstName = '';
  const changedIn = [];
  for (const sc of crashes) {
    /* eslint-disable no-await-in-loop */
    const stream = await record(sc);
    if (stream.first < 0) {
      continue;
    }
    reached += 1;
    const rows = (await fly(sc, stream)).filter((r) => r.at >= stream.first);
    const changed = rows.filter((r) => r.now !== r.was);
    if (changed.length) {
      changedIn.push(`${sc.name} (${changed.length} steps, first at ${changed[0].at} ms, ${changed[0].airMs} ms off)`);
    }
    for (const r of rows) {
      if (deciding(r) && r.airMs > worst.airMs) {
        worst = r;
        worstName = sc.name;
      }
    }
    if (verbose) {
      const top = rows.filter(deciding).reduce((m, r) => Math.max(m, r.airMs), 0);
      console.log(`       ${sc.name}: longest ${top} ms`);
    }
  }
  check(`the flights are crashes: at least ${crashes.length - 8} of the ${crashes.length} reach the grass`, reached >= crashes.length - 8,
    `${reached} of ${crashes.length}`);
  check('after the first contact the counter changes no verdict on any of them', changedIn.length === 0,
    changedIn.slice(0, 3).join('; ') || 'none');
  check('the longest air at a step it could decide is under DIRT_AIR_MS', worst.airMs < DIRT_AIR_MS,
    `${worst.airMs} ms against ${DIRT_AIR_MS}${worstName ? `, ${worstName}, ${r3(worst.clearance)} m at body up ${r3(worst.upz)}` : ''}`);

  /* ON ITS BACK. */
  console.log('\n  on its back: let down at 150 degrees, three seconds');
  {
    const sc = { world: [], pose: [0, 0, 0.3], restPose: restPose(150), ms: 3000, after: 3000, pilot: () => () => [0, 0, 0, 0] };
    const stream = { input: [], modes: [], endMs: 3000 };
    for (let ms = 0; ms < 3000; ms += 4) {
      stream.input.push([ms, 0, 0, 0, 0]);
    }
    const rows = await fly(sc, stream);
    const end = rows[rows.length - 1];
    const late = rows.slice(500);
    check('it settles on its back in the band with the counter past DIRT_AIR_MS (the plant reports no contact there)',
      end.upz < 0 && end.clearance < dirtClearance() && end.airMs >= DIRT_AIR_MS,
      `body up ${r3(end.upz)}, ${r3(end.clearance)} m, ${end.airMs} ms off`);
    check('and from half a second on it is refused at every step', late.every((r) => !r.now && !r.was),
      `${late.filter((r) => r.now).length} of ${late.length} scored`);
  }

  console.log(`\ndirt-air-check: ${failures === 0 ? 'all passed' : `${failures} FAILED`}`);
  process.exit(failures);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
