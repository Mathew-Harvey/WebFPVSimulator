/*
 * whoop-gates.js: the flight envelope of SIM_AIRFRAME_WHOOP65, measured
 * against numbers that came from somewhere other than this repository.
 *
 * WHY THIS FILE EXISTS AND WHY IT IS NOT IN tests/. Every band in
 * tests/thresholds.json was fitted to the five inch: hover 0.20 to 0.30 at
 * thrust to weight 8.4, a 55 to 85 m punch, 30 to 40 m/s of terminal
 * velocity, a 0.15 m body. A 23 gram whoop fails six of those sixteen checks
 * by being a whoop, and tests/ is owned by the harness and must not be
 * edited to make a new airframe fit. So the whoop gets its own runner here,
 * in scripts/, where the rest of this project's measuring lives.
 *
 * THE BANDS ARE NOT FITTED TO THE MODEL. Each one names its source, and the
 * sources are outside this repository: BetaFPV's published specification for
 * the Air65 II, thrust stand and review figures for the 0702 on 1S, the
 * ducted micro rotor literature for the figure of merit and the duct terms,
 * and RaceGOW's own leaderboards for what a lap actually takes. A gate that
 * fails is the plant being wrong, not the band.
 *
 * The five inch is measured too, in the same run, and the ONLY thing asserted
 * about it is that it did not move: the plant grew an airframe table for the
 * whoop's sake, and this is the cheap proof that doing so left the machine
 * every existing threshold was fitted against exactly where it was.
 *
 * Run it with `npm run whoop:gates`. It costs about a second.
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { ST } from '../tests/lib/replay.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const G = 9.80665;
const DEG = 180 / Math.PI;
const RPM = 60 / (2 * Math.PI);

const AF_5IN = 0;
const AF_WHOOP = 1;

/*
 * Every band, with the source that fixed it. "derived" means the number
 * follows by arithmetic from a cited figure and the derivation is written
 * out; "published" means somebody outside this project measured or stated
 * it. Nothing here says "chosen so the model passes".
 */
const BANDS = {
  'W1 figure-of-merit': {
    min: 0.30, max: 0.40, unit: '',
    why: 'Ducted micro rotor at chord Reynolds number near 10,700. Bohorquez 2007 '
       + 'measured 0.42 for the best single rotor at Re 27,000 to 43,700; Harris '
       + 'NASA/CR-20205001147 puts Re 1e4 in 0.30 to 0.40. A 5 inch triblade is 0.52.',
  },
  'W2 hover-throttle': {
    min: 0.27, max: 0.36, unit: 'of stick',
    why: 'Published hover throttle for a modern 1S brushless 65 mm whoop. '
       + 'BetaFPV ship thr_hover 22 to 34 in the Air65 II rate profiles.',
  },
  'W3 thrust-to-weight': {
    min: 4.0, max: 5.4, unit: ': 1',
    why: 'BetaFPV quote 6.3:1 for the Champion, which is the DRY 16.6 g. With '
       + 'the recommended LAVA II 1S 280 mAh at 6.8 g the all up figure is 4.7.',
  },
  'W4 full-throttle-rpm': {
    min: 68000, max: 80000, unit: 'rpm',
    why: 'A 0702 at 36000 kV on 1S is 151,000 rpm unloaded and never sees it. '
       + 'Loaded on a GF1207 three blade the published and derived figure is '
       + 'about 74,700.',
  },
  'W5 punch-sag': {
    min: 3.00, max: 3.45, unit: 'V a cell',
    why: 'Real 1S whoop packs fall to 3.1 to 3.2 V under a punch from a fresh '
       + 'cell. Measured here from 4.20 V rather than the 4.35 V a LiHV charges '
       + 'to. SUSTAINED, not the minimum, for the same reason W6 is: the plant '
       + 'has no winding inductance and no ESC current ceiling, so the first '
       + 'two or three milliseconds of any punch draw a current that is silly '
       + 'and that the rotor time constant filters out completely before it '
       + 'reaches thrust. src/native/plant.c records that trade for the five '
       + 'inch at length; it is the same trade here and the transient is '
       + 'printed below so it cannot hide.',
  },
  'W6 punch-current': {
    min: 10.0, max: 22.0, unit: 'A pack',
    why: 'The Matrix 1S 5IN1 II ESC is rated 12 A continuous and 18 A peak per '
       + 'motor, and a real 1S whoop punch draws 12 to 18 A at the pack.',
  },
  'W7 motor-time-constant': {
    min: 0.015, max: 0.045, unit: 's',
    why: 'j R / ke squared for a 0702 bell plus a 1.5 g moulded three blade is '
       + '25 to 35 ms. This is the number the folklore gets wrong: a whoop motor '
       + 'is NOT quicker than a 5 inch one, it is comparable.',
  },
  'W8 roll-authority': {
    min: 1400, max: 2600, unit: 'rad/s^2',
    why: '2 T arm / Ixx. This IS why a whoop feels crisp: three times the 5 '
       + 'inch\'s 653 rad/s squared. Band is the parameter set plus the 25 '
       + 'percent of uncertainty the inertia estimate carries.',
  },
  'W9 terminal-velocity': {
    min: 7.0, max: 14.0, unit: 'm/s',
    why: 'A 65 mm whoop in a props level flat fall. Estimated at 10 m/s from a '
       + '2.2e-3 m^2 plan silhouette at Cd 1.15 against 23.4 g.',
  },
  'W10 top-speed': {
    min: 8.0, max: 20.0, unit: 'm/s',
    why: 'Level flight, full throttle, 45 degrees of pitch. Enthusiast claims of '
       + '40 to 60 mph are not supported by a 1.08 N thrust budget; 15 m/s is '
       + 'what the budget gives and is 54 km/h.',
  },
  'W11 duct-fade': {
    min: 0.35, max: 0.75, unit: 'of the augmentation left',
    why: 'The shroud earns 1.10 static and gives it back in translation. Read '
       + 'straight off the plant at an edgewise speed near the rotor\'s own '
       + 'induced velocity, which is where duct_fade puts the half point. A '
       + 'first attempt inferred it from a climb rate and measured the flying '
       + 'rather than the model; the tap exists so it cannot do that again.',
  },
  'W12 pitch-up-at-speed': {
    min: 2.0, max: 20.0, unit: 'percent of pitch authority',
    why: 'Duct lip suction plus the rotor plane sitting above the CG. Every '
       + 'ducted machine pitches up into the wind and is trimmed out of it, and '
       + 'the two bounds are what makes that a handling characteristic rather '
       + 'than a defect: below about 2 percent a pilot cannot feel it, and above '
       + 'about 20 the controller is spending a fifth of its pitch authority on '
       + 'trim before the pilot asks for anything.',
  },
  'W13 lap-scale': {
    min: 1.6, max: 6.0, unit: 's',
    why: 'Time to fly one RaceGOW lap, taken as 24 m of path. RaceGOW5 leaderboards '
       + 'give a fastest per lap of 2.26 s and a median of 5.87 s across seven '
       + 'published tracks, so the band is the field, not the winner.',
  },
  'W14 five-inch-unmoved': {
    min: 0, max: 0, unit: 'changed figures',
    why: 'The airframe table must not have moved the machine every threshold in '
       + 'tests/ was fitted against. Hover throttle, punch height, terminal '
       + 'velocity and motor time constant, all four to seven figures.',
  },
};

const results = [];
function report(id, pass, measured, extra = '') {
  results.push({ id, pass, measured, extra });
}
function band(id, value, fmt = (v) => v.toFixed(4)) {
  const b = BANDS[id];
  const ok = value >= b.min && value <= b.max;
  report(id, ok, `${fmt(value)} ${b.unit}`.trim(), `band ${b.min} to ${b.max}`);
  return ok;
}

async function fresh(wasm, cfgText, airframe, cellV) {
  const sim = await loadSim(wasm);
  /* Airframe BEFORE init, which is the order the shell uses: it is a mode
   * and it survives init, but setting it first means the hull corners and
   * the parked ground height are the new airframe's from the first step. */
  if (airframe !== AF_5IN) {
    const rc = sim.e.sim_set_airframe(airframe);
    if (rc !== SIM_OK) {
      throw new Error(`sim_set_airframe(${airframe}) returned ${rc}`);
    }
  }
  if (sim.init(cfgText) !== SIM_OK) {
    throw new Error('sim_init failed');
  }
  sim.reset();
  sim.setCellVoltage(cellV);
  return sim;
}

/* Scripted flight on the shell's own 250 Hz RC grid, clock threaded. */
function fly(sim, segs, onStep, startMs = 0) {
  let t = startMs;
  let nextRc = startMs;
  for (const seg of segs) {
    const end = t + seg.ms;
    while (t < end) {
      while (nextRc <= t) {
        sim.input(nextRc / 1000, seg.roll ?? 0, seg.pitch ?? 0, seg.yaw ?? 0, seg.thr ?? 0);
        nextRc += 4;
      }
      sim.step(1);
      t += 1;
      if (onStep) {
        onStep(t, sim.readState().state);
      }
    }
  }
  return t;
}

/* Bisect the throttle that holds a steady hover, the same procedure
 * tests/lib/checks.js uses for the five inch. */
async function trimHover(wasm, cfg, airframe, cellV, settleS = 2.0) {
  let lo = 0.0;
  let hi = 1.0;
  let best = 0.5;
  for (let i = 0; i < 24; i += 1) {
    const mid = 0.5 * (lo + hi);
    const sim = await fresh(wasm, cfg, airframe, cellV);
    let vz = 0;
    fly(sim, [{ ms: Math.round(settleS * 1000), thr: mid }], (t, s) => { vz = s[ST.VZ]; });
    best = mid;
    if (vz > 0) {
      hi = mid;
    } else {
      lo = mid;
    }
    if (Math.abs(vz) < 0.02) {
      break;
    }
  }
  return best;
}

async function main() {
  const wasm = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
  const whoopCfg = await readFile(join(root, 'configs/whoop-champion.diff'), 'utf8');
  const fiveCfg = await readFile(join(root, 'configs/betaflight-default.diff'), 'utf8');

  /* ---- W1 figure of merit, read out of the compiled constants ---- */
  {
    const sim = await fresh(wasm, whoopCfg, AF_WHOOP, 4.2);
    band('W1 figure-of-merit', sim.e.sim_bf_debug(12));
  }

  /* ---- W2 hover throttle, W3 thrust to weight, W4 full throttle rpm ---- */
  const hover = await trimHover(wasm, whoopCfg, AF_WHOOP, 4.2);
  band('W2 hover-throttle', hover, (v) => v.toFixed(3));

  let fullRpm = 0;
  let sagMin = 9;
  let ampsMax = 0;
  {
    const sim = await fresh(wasm, whoopCfg, AF_WHOOP, 4.2);
    /* Two seconds of hover, then a punch. The punch is what a pack sees. */
    let t = fly(sim, [{ ms: 2000, thr: hover }]);
    fly(sim, [{ ms: 2000, thr: 1.0 }], (tt, s) => {
      const rpm = 0.25 * (s[ST.RPM0] + s[ST.RPM1] + s[ST.RPM2] + s[ST.RPM3]);
      if (rpm > fullRpm) {
        fullRpm = rpm;
      }
      if (s[ST.VBAT] < sagMin) {
        sagMin = s[ST.VBAT];
      }
      if (s[ST.AMPS] > ampsMax) {
        ampsMax = s[ST.AMPS];
      }
    }, t);
    const mass = sim.e.sim_bf_debug(51);
    const kt = sim.e.sim_bf_debug(10);
    /* Static duct augmentation, 1.10 on this airframe: plant.c multiplies
     * the thrust by it, so a figure without it is ten percent under what
     * the plant actually makes. */
    const duct = sim.e.sim_bf_debug(58) || 1;
    const w = fullRpm / RPM;
    band('W3 thrust-to-weight', (4 * kt * w * w * duct) / (mass * G), (v) => v.toFixed(2));
  }
  band('W4 full-throttle-rpm', fullRpm, (v) => v.toFixed(0));
  /*
   * The pack current PEAK is not the figure to gate on and the five inch's
   * plant.c says why at length: there is no winding inductance and no ESC
   * ceiling, so the first two or three milliseconds of any punch draw a
   * number that is silly and that the rotor's own time constant filters out
   * completely before it reaches thrust. What a pack and an ESC actually
   * live with is the SUSTAINED draw, so that is what is measured: the mean
   * over the last half second of a two second punch.
   */
  {
    const sim = await fresh(wasm, whoopCfg, AF_WHOOP, 4.2);
    let t = fly(sim, [{ ms: 2000, thr: hover }]);
    let sum = 0;
    let n = 0;
    fly(sim, [{ ms: 2000, thr: 1.0 }], (tt, s) => {
      if (tt - t > 1500) {
        sum += s[ST.AMPS];
        n += 1;
      }
    }, t);
    band('W6 punch-current', sum / n, (v) => v.toFixed(2));
  }
  {
    const sim = await fresh(wasm, whoopCfg, AF_WHOOP, 4.2);
    let t = fly(sim, [{ ms: 2000, thr: hover }]);
    let sum = 0;
    let n = 0;
    fly(sim, [{ ms: 2000, thr: 1.0 }], (tt, s) => {
      if (tt - t > 1500) {
        sum += s[ST.VBAT];
        n += 1;
      }
    }, t);
    band('W5 punch-sag', sum / n, (v) => v.toFixed(3));
    report('    transient minimum', true, `${sagMin.toFixed(3)} V a cell`,
      'no inductance, no ESC ceiling: 2 to 3 ms, filtered out by the rotor');
    report('    transient peak amps', true, `${ampsMax.toFixed(0)} A pack`, 'same');
  }

  /* ---- W7 motor time constant, the check 8 procedure ---- */
  async function motorTau(cfg, airframe) {
    const sim = await fresh(wasm, cfg, airframe, 4.2);
    sim.motorOverride(-1, 0);
    fly(sim, [{ ms: 200, thr: 0 }]);
    sim.motorOverride(-1, -1);
    sim.motorOverride(0, 1);
    let final = 0;
    const trace = [];
    const t0 = 200;
    fly(sim, [{ ms: 1000, thr: 0 }], (t, s) => {
      trace.push([t - t0, s[ST.RPM0]]);
      final = s[ST.RPM0];
    }, t0);
    const target = 0.63 * final;
    for (const [ms, rpm] of trace) {
      if (rpm >= target) {
        return ms / 1000;
      }
    }
    return NaN;
  }
  band('W7 motor-time-constant', await motorTau(whoopCfg, AF_WHOOP), (v) => v.toFixed(4));

  /* ---- W8 roll authority ---- */
  {
    const sim = await fresh(wasm, whoopCfg, AF_WHOOP, 4.2);
    const kt = sim.e.sim_bf_debug(10);
    const armX = sim.e.sim_bf_debug(53);
    const ixx = sim.e.sim_bf_debug(55);
    const w = fullRpm / RPM;
    const tMax = kt * w * w;
    band('W8 roll-authority', (2 * tMax * armX) / ixx, (v) => v.toFixed(0));
  }

  /* ---- W9 terminal velocity, props level, throttle closed ---- */
  {
    const sim = await fresh(wasm, whoopCfg, AF_WHOOP, 4.2);
    let vz = 0;
    fly(sim, [{ ms: 12000, thr: 0 }], (t, s) => { vz = s[ST.VZ]; });
    band('W9 terminal-velocity', Math.abs(vz), (v) => v.toFixed(2));
  }

  /* ---- W10 top speed, level flight with the nose down ---- */
  {
    const sim = await fresh(wasm, whoopCfg, AF_WHOOP, 4.2);
    /* Pitch forward to 45 degrees under angle mode, then hold full throttle
     * and let it find its own speed. Angle mode so the attitude is a stick
     * position rather than an integration nobody can reproduce. */
    sim.setAngleMode(1);
    let speed = 0;
    fly(sim, [{ ms: 14000, pitch: -1.0, thr: 1.0 }], (t, s) => {
      speed = Math.sqrt(s[ST.VX] * s[ST.VX] + s[ST.VY] * s[ST.VY] + s[ST.VZ] * s[ST.VZ]);
    });
    band('W10 top-speed', speed, (v) => v.toFixed(2));
  }

  /* ---- W11 duct fade and W12 pitch up, both read off the plant ----
   *
   * One run: fly forward under angle mode until the speed settles, then read
   * the duct factor motor 0 actually applied and the nose up couple the
   * rotor plane and the lips actually produced. Reading the taps rather than
   * inferring the terms from a trajectory is the difference between measuring
   * the model and measuring the flying.
   */
  {
    const sim = await fresh(wasm, whoopCfg, AF_WHOOP, 4.2);
    const kDuct = sim.e.sim_bf_debug(58);
    const iyy = sim.e.sim_bf_debug(56);
    const armX = sim.e.sim_bf_debug(53);
    const kt = sim.e.sim_bf_debug(10);
    /*
     * A LEVEL pass, and the first attempt at this gate got it wrong in an
     * instructive way. Flown at full throttle the craft climbs at 8 m/s and
     * pitches to 55 degrees, so nearly all of its airspeed goes THROUGH the
     * disc rather than across it: the tap read 2.5 m/s of edgewise flow at
     * 13.6 m/s of airspeed and the duct barely faded at all. That is correct
     * physics and a useless measurement. Angle mode at a fixed pitch with
     * the throttle a little over hover holds a shallow climbing pass
     * instead, where the flow the duct actually cares about is the flow it
     * gets.
     *
     * THE STICK IS AIMED AT THE WINDOW, NOT THE OTHER WAY ROUND. The window
     * below is the physics: it brackets the rotor's own hover induced
     * velocity, which is where duct_fade puts the half point, and it does
     * not move. The stick that reaches it is a property of the airframe's
     * drag, and when k_rotor_drag came down from 1.00 to 0.70 the old
     * 42 degrees at 0.47 flew 8.05 m/s of edgewise air instead of 5.73 and
     * left the window. 0.58 of stick, about 24 degrees, at 0.44 reads 5.63
     * m/s at the rotor, the half point itself, in a 7 m/s pass climbing
     * under 3 m/s.
     */
    sim.setAngleMode(1);
    let speed = 0;
    let climb = 0;
    fly(sim, [{ ms: 14000, pitch: -0.58, thr: 0.44 }], (t, s) => {
      speed = Math.sqrt(s[ST.VX] * s[ST.VX] + s[ST.VY] * s[ST.VY]);
      climb = s[ST.VZ];
    });
    const duct = sim.e.sim_bf_debug(68);
    const vperp = sim.e.sim_bf_debug(69);
    const noseUp = sim.e.sim_bf_debug(70);
    /*
     * The operating point has to be reported and checked, because a fade
     * figure without the speed it was measured at means nothing. The window
     * brackets the rotor's own hover induced velocity, 5.6 m/s, which is
     * where duct_fade puts the half point.
     */
    const atPoint = vperp >= 4.5 && vperp <= 7.0;
    band('W11 duct-fade', (duct - 1) / (kDuct - 1), (v) => v.toFixed(3));
    report('    edgewise speed', atPoint, `${vperp.toFixed(2)} m/s at the rotor`,
      `window 4.5 to 7.0, ground speed ${speed.toFixed(2)} m/s, climb ${climb.toFixed(2)} m/s`);

    /* Pitch authority is the couple two rotors at full thrust and two at
     * nothing can make, over the pitch inertia. */
    const w = fullRpm / RPM;
    const authority = (2 * kt * w * w * armX) / iyy;
    band('W12 pitch-up-at-speed', 100 * (noseUp / iyy) / authority, (v) => v.toFixed(2));
    report('    nose up couple', true, `${(noseUp * 1e3).toFixed(3)} mN m`,
      `${(noseUp / iyy).toFixed(0)} rad/s^2 against ${authority.toFixed(0)} available`);
  }

  /* ---- W13 lap scale: how long 24 m of RaceGOW track takes ---- */
  {
    const sim = await fresh(wasm, whoopCfg, AF_WHOOP, 4.2);
    /*
     * Not a lap, a straight, and that is deliberate: a lap time depends on a
     * line and a pilot, and neither is a property of the plant. What IS a
     * property of the plant is how long it takes to cover the distance while
     * decelerating for gates, so the run is 24 m flown as six 4 m dashes with
     * a full stop between them, which is roughly what an indoor lap costs.
     */
    sim.setAngleMode(1);
    let dist = 0;
    let ms = 0;
    let last = null;
    const segs = [];
    for (let i = 0; i < 12; i += 1) {
      segs.push({ ms: 700, pitch: -0.55, thr: 0.95 });
      segs.push({ ms: 450, pitch: 0.55, thr: 0.55 });
    }
    fly(sim, segs, (t, s) => {
      const p = [s[ST.PX], s[ST.PY], s[ST.PZ]];
      if (last) {
        dist += Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]);
      }
      last = p;
      if (dist < 24) {
        ms = t;
      }
    });
    band('W13 lap-scale', ms / 1000, (v) => v.toFixed(2));
    report('    path measured', dist >= 24, `${dist.toFixed(1)} m flown`,
      'the clock stops at 24 m; the run goes further so it cannot run short');
  }

  /* ---- W14 the five inch did not move ---- */
  {
    const h5 = await trimHover(wasm, fiveCfg, AF_5IN, 4.0);
    const sim = await fresh(wasm, fiveCfg, AF_5IN, 4.2);
    const hp = await trimHover(wasm, fiveCfg, AF_5IN, 4.2);
    let z0 = 0;
    let z1 = 0;
    let t = fly(sim, [{ ms: 2000, thr: hp }], (tt, s) => { z0 = s[ST.PZ]; });
    fly(sim, [{ ms: 3000, thr: 1.0 }], (tt, s) => { z1 = s[ST.PZ]; }, t);
    const term = await (async () => {
      const s2 = await fresh(wasm, fiveCfg, AF_5IN, 4.2);
      let v = 0;
      fly(s2, [{ ms: 20000, thr: 1.0 }], (tt, s) => {
        v = Math.hypot(s[ST.VX], s[ST.VY], s[ST.VZ]);
      });
      return v;
    })();
    const tau5 = await motorTau(fiveCfg, AF_5IN);
    /*
     * These four are the values the five inch produced BEFORE the airframe
     * table landed, measured on the checked in dist/sim.wasm of the commit
     * before this one and written down here so a regression has something to
     * fail against. They are not thresholds and they are not in tests/: they
     * are a fingerprint, and the tolerances are tight enough that any change
     * at all to the five inch's arithmetic trips them.
     */
    const REF = { hover: 0.2789999842643738, punch: 80.02533350994806,
      terminal: 31.010392473266936, tau: 0.025 };
    const changed = [];
    const cmp = (name, got, want, tol) => {
      if (!(Math.abs(got - want) <= tol)) {
        changed.push(`${name} ${got.toFixed(6)} was ${want}`);
      }
    };
    cmp('hover', h5, REF.hover, 1e-6);
    cmp('punch', z1 - z0, REF.punch, 1e-3);
    cmp('terminal', term, REF.terminal, 1e-3);
    cmp('tau', tau5, REF.tau, 1e-9);
    report('W14 five-inch-unmoved', changed.length === 0,
      changed.length === 0 ? 'identical' : changed.join('; '),
      `hover ${h5.toFixed(6)} punch ${(z1 - z0).toFixed(3)} m terminal ${term.toFixed(3)} m/s tau ${tau5}`);
  }

  /* ---- print ---- */
  let fails = 0;
  const w = Math.max(...results.map((r) => r.id.length));
  console.log('\nwhoop-gates: the 65 mm 1S whoop against numbers from outside this repo\n');
  for (const r of results) {
    if (!r.pass) {
      fails += 1;
    }
    const tag = r.pass ? ' ok  ' : 'FAIL ';
    console.log(`${tag} ${r.id.padEnd(w)}  ${r.measured.padEnd(22)} ${r.extra}`);
  }
  console.log('');
  for (const [id, b] of Object.entries(BANDS)) {
    const r = results.find((x) => x.id === id);
    if (r && !r.pass) {
      console.log(`  ${id}: ${b.why}`);
    }
  }
  console.log(`\n${results.length - fails} of ${results.length} gates pass\n`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
