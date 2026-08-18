/*
 * ratescurve.js: Configurator-shaped preview of Betaflight 4.5.1 rate
 * curves. Display only. The plant still runs applyRates from fc/rc.c
 * inside the WASM module. These copies exist so the graph can label Max
 * Vel without a second control loop.
 *
 * Formulas are applyBetaflightRates, applyRaceFlightRates, applyKissRates,
 * applyActualRates and applyQuickRates in vendor/betaflight/src/main/fc/rc.c.
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

export const RATES_TYPES = ['ACTUAL', 'BETAFLIGHT', 'RACEFLIGHT', 'KISS', 'QUICK'];

export const ANGLE_RATE_SAMPLES = 80;

export const AXIS_IDS = ['roll', 'pitch', 'yaw'];

export const AXIS_COLOR = {
  roll: '#e23b4a',
  pitch: '#3dcc5a',
  yaw: '#3b9cff',
};

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

export function maxVelDeg(type, axis) {
  return angleRateDeg(type, axis, 1);
}

function cliNum(map, key, fallback) {
  const n = Number(map.get(key));
  return Number.isFinite(n) ? n : fallback;
}

export function ratesFromCliMap(map) {
  const type = map.get('rates_type') || 'ACTUAL';
  const quick = map.get('quickrates_rc_expo');
  const axis = (name, rcFallback, sFallback) => ({
    rcRate: cliNum(map, `${name}_rc_rate`, rcFallback),
    srate: cliNum(map, `${name}_srate`, sFallback),
    expo: cliNum(map, `${name}_expo`, 0),
    limit: cliNum(map, `${name}_rate_limit`, RATE_LIMIT_DEFAULT),
    quickRcExpo: quick === 'ON' || quick === '1',
  });
  /* ACTUAL firmware defaults: rc 7, srate 67. Used only when a dump has
   * not yet written the key, so the graph is not a blank line. */
  return {
    type: RATES_TYPES.includes(type) ? type : 'ACTUAL',
    roll: axis('roll', 7, 67),
    pitch: axis('pitch', 7, 67),
    yaw: axis('yaw', 7, 67),
  };
}

/*
 * How Configurator 10.10 shows each field. Display value times `fromDisplay`
 * is the CLI integer. `toDisplay` is the inverse.
 */
export function ratesColumns(type) {
  const expo01 = {
    id: 'expo',
    label: 'Expo',
    toDisplay: (cli) => cli / 100,
    fromDisplay: (d) => Math.round(d * 100),
    min: 0,
    max: 1,
    step: 0.01,
    decimals: 2,
  };
  if (type === 'BETAFLIGHT') {
    return [
      {
        id: 'rc_rate',
        label: 'RC Rate',
        toDisplay: (cli) => cli / 100,
        fromDisplay: (d) => Math.round(d * 100),
        min: 0.01,
        max: 2.55,
        step: 0.01,
        decimals: 2,
      },
      {
        id: 'srate',
        label: 'Super Rate',
        toDisplay: (cli) => cli,
        fromDisplay: (d) => Math.round(d),
        min: 0,
        max: 100,
        step: 1,
        decimals: 0,
      },
      expo01,
    ];
  }
  if (type === 'KISS') {
    return [
      {
        id: 'rc_rate',
        label: 'RC Rate',
        toDisplay: (cli) => cli / 100,
        fromDisplay: (d) => Math.round(d * 100),
        min: 0.01,
        max: 2.55,
        step: 0.01,
        decimals: 2,
      },
      {
        id: 'srate',
        label: 'Rate',
        toDisplay: (cli) => cli,
        fromDisplay: (d) => Math.round(d),
        min: 0,
        max: 99,
        step: 1,
        decimals: 0,
      },
      { ...expo01, label: 'RC Curve' },
    ];
  }
  if (type === 'RACEFLIGHT') {
    return [
      {
        id: 'rc_rate',
        label: 'Rate',
        toDisplay: (cli) => cli * 10,
        fromDisplay: (d) => Math.round(d / 10),
        min: 10,
        max: 2550,
        step: 10,
        decimals: 0,
      },
      {
        id: 'srate',
        label: 'Acro+',
        toDisplay: (cli) => cli,
        fromDisplay: (d) => Math.round(d),
        min: 0,
        max: 255,
        step: 1,
        decimals: 0,
      },
      {
        id: 'expo',
        label: 'Expo',
        toDisplay: (cli) => cli,
        fromDisplay: (d) => Math.round(d),
        min: 0,
        max: 100,
        step: 1,
        decimals: 0,
      },
    ];
  }
  if (type === 'QUICK') {
    return [
      {
        id: 'rc_rate',
        label: 'RC Rate',
        toDisplay: (cli) => cli,
        fromDisplay: (d) => Math.round(d),
        min: 1,
        max: 255,
        step: 1,
        decimals: 0,
      },
      {
        id: 'srate',
        label: 'Max Rate',
        toDisplay: (cli) => cli * 10,
        fromDisplay: (d) => Math.round(d / 10),
        min: 0,
        max: 2550,
        step: 10,
        decimals: 0,
      },
      expo01,
    ];
  }
  /* ACTUAL, and anything unknown. Max Rate is srate * 10 deg/s. */
  return [
    {
      id: 'rc_rate',
      label: 'Center Sensitivity',
      toDisplay: (cli) => cli * 10,
      fromDisplay: (d) => Math.round(d / 10),
      min: 10,
      max: 2550,
      step: 10,
      decimals: 0,
    },
    {
      id: 'srate',
      label: 'Max Rate',
      toDisplay: (cli) => cli * 10,
      fromDisplay: (d) => Math.round(d / 10),
      min: 0,
      max: 2550,
      step: 10,
      decimals: 0,
    },
    expo01,
  ];
}

export function formatDisplay(col, cli) {
  const d = col.toDisplay(cli);
  return col.decimals > 0 ? d.toFixed(col.decimals) : String(Math.round(d));
}

export function parseDisplay(col, text) {
  const n = Number(text);
  if (!Number.isFinite(n)) {
    return null;
  }
  const clamped = Math.min(col.max, Math.max(col.min, n));
  const stepped = col.step > 0 ? Math.round(clamped / col.step) * col.step : clamped;
  let cli = col.fromDisplay(stepped);
  if (col.id === 'rc_rate') {
    cli = Math.max(1, cli);
  }
  return Math.max(0, Math.min(255, cli));
}

export const RATES_PANEL_KEYS = new Set([
  'rates_type',
  'roll_rc_rate',
  'pitch_rc_rate',
  'yaw_rc_rate',
  'roll_srate',
  'pitch_srate',
  'yaw_srate',
  'roll_expo',
  'pitch_expo',
  'yaw_expo',
]);
