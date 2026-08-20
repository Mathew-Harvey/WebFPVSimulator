/*
 * ratescurve.js: a preview of Betaflight 4.5.1's rate curves.
 *
 * DISPLAY ONLY, and the distinction is the whole reason this file is
 * allowed to exist next to CLAUDE.md's rule against reimplementing a rates
 * curve in JavaScript. The plant runs applyRates from fc/rc.c inside the
 * WASM module and always will. These copies exist so the Rates screen can
 * DRAW the curve, and so scripts/fc-trace.js can assert that the drawing
 * agrees with the firmware. Nothing here reaches the integrator.
 *
 * Formulas are applyBetaflightRates, applyRaceFlightRates, applyKissRates,
 * applyActualRates and applyQuickRates in vendor/betaflight/src/main/fc/rc.c.
 * All five stay, though the menu only writes ACTUAL: gates.config.json P2
 * checks all four named types against the compiled module, and a preview
 * that only knew one of them could not be checked at all.
 *
 * The Configurator table this used to feed went with the flight-controller
 * screen: no ratesColumns, no formatDisplay, no per-axis model read out of
 * a CLI dump. src/ui/ratespanel.js builds its two curves from the pilot's
 * settings and asks angleRateDeg for points on them.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this software. If not, see <https://www.gnu.org/licenses/>.
 */

export const ANGLE_RATE_SAMPLES = 80;

/* Firmware default, CONTROL_RATE_CONFIG_RATE_LIMIT_MAX. */
const RATE_LIMIT_DEFAULT = 1998;
const RC_RATE_INCREMENTAL = 14.54;
const SETPOINT_RATE_LIMIT = 1998;

function power3(x) {
  return x * x * x;
}

function power5(x) {
  const x2 = x * x;
  return x2 * x2 * x;
}

function constrainf(v, lo, hi) {
  if (v < lo) {
    return lo;
  }
  if (v > hi) {
    return hi;
  }
  return v;
}

function applyBetaflightRates(rcRateCli, srate, expo, rcCommandf, rcCommandfAbs) {
  let cmd = rcCommandf;
  if (expo) {
    const expof = expo / 100;
    cmd = cmd * power3(rcCommandfAbs) * expof + cmd * (1 - expof);
  }
  let rcRate = rcRateCli / 100;
  if (rcRate > 2) {
    rcRate += RC_RATE_INCREMENTAL * (rcRate - 2);
  }
  let angleRate = 200 * rcRate * cmd;
  if (srate) {
    const rcSuperfactor = 1 / constrainf(1 - (rcCommandfAbs * (srate / 100)), 0.01, 1);
    angleRate *= rcSuperfactor;
  }
  return angleRate;
}

function applyRaceFlightRates(rcRateCli, srate, expo, rcCommandf, rcCommandfAbs) {
  const cmd = (1 + 0.01 * expo * (rcCommandf * rcCommandf - 1)) * rcCommandf;
  let angleRate = 10 * rcRateCli * cmd;
  angleRate = angleRate * (1 + rcCommandfAbs * srate * 0.01);
  return angleRate;
}

function applyKissRates(rcRateCli, srate, expo, rcCommandf, rcCommandfAbs) {
  const rcCurvef = expo / 100;
  const kissRpyUseRates = 1 / constrainf(1 - (rcCommandfAbs * (srate / 100)), 0.01, 1);
  const kissRcCommandf = (power3(rcCommandf) * rcCurvef + rcCommandf * (1 - rcCurvef)) * (rcRateCli / 1000);
  return constrainf((2000 * kissRpyUseRates) * kissRcCommandf, -SETPOINT_RATE_LIMIT, SETPOINT_RATE_LIMIT);
}

function applyActualRates(rcRateCli, srate, expo, rcCommandf, rcCommandfAbs) {
  let expof = expo / 100;
  expof = rcCommandfAbs * (power5(rcCommandf) * expof + rcCommandf * (1 - expof));
  const centerSensitivity = rcRateCli * 10;
  const stickMovement = Math.max(0, srate * 10 - centerSensitivity);
  return rcCommandf * centerSensitivity + stickMovement * expof;
}

function applyQuickRates(rcRateCli, srate, expo, rcCommandf, rcCommandfAbs, quickRcExpo) {
  const rcRate = rcRateCli * 2;
  const maxDPS = Math.max(srate * 10, rcRate);
  const expof = expo / 100;
  const superFactorConfig = (maxDPS / rcRate - 1) / (maxDPS / rcRate);
  if (quickRcExpo) {
    const curve = power3(rcCommandf) * expof + rcCommandf * (1 - expof);
    const superFactor = 1 / constrainf(1 - (rcCommandfAbs * superFactorConfig), 0.01, 1);
    return constrainf(curve * rcRate * superFactor, -SETPOINT_RATE_LIMIT, SETPOINT_RATE_LIMIT);
  }
  const curve = power3(rcCommandfAbs) * expof + rcCommandfAbs * (1 - expof);
  const superFactor = 1 / constrainf(1 - (curve * superFactorConfig), 0.01, 1);
  return constrainf(rcCommandf * rcRate * superFactor, -SETPOINT_RATE_LIMIT, SETPOINT_RATE_LIMIT);
}

/*
 * Stick in -1..1. rcRate, srate, expo are the CLI uint8 fields, not the
 * Configurator display numbers. limit is roll_rate_limit etc.
 */
export function angleRateDeg(type, axis, stick) {
  const rcCommandf = stick;
  const rcCommandfAbs = stick < 0 ? -stick : stick;
  const rcRate = axis.rcRate;
  const srate = axis.srate;
  const expo = axis.expo;
  let angleRate;
  switch (type) {
    case 'RACEFLIGHT':
      angleRate = applyRaceFlightRates(rcRate, srate, expo, rcCommandf, rcCommandfAbs);
      break;
    case 'KISS':
      angleRate = applyKissRates(rcRate, srate, expo, rcCommandf, rcCommandfAbs);
      break;
    case 'ACTUAL':
      angleRate = applyActualRates(rcRate, srate, expo, rcCommandf, rcCommandfAbs);
      break;
    case 'QUICK':
      angleRate = applyQuickRates(rcRate, srate, expo, rcCommandf, rcCommandfAbs, axis.quickRcExpo);
      break;
    default:
      angleRate = applyBetaflightRates(rcRate, srate, expo, rcCommandf, rcCommandfAbs);
      break;
  }
  const limit = Number.isFinite(axis.limit) && axis.limit > 0 ? axis.limit : RATE_LIMIT_DEFAULT;
  return constrainf(angleRate, -limit, limit);
}
