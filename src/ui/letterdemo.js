/*
 * letterdemo.js: the fixtures the lettering and the results page are
 * photographed with, through window.__lettering (installLetteringHooks in
 * src/ui/ui.js). Loaded only when a harness asks for it, never at boot.
 *
 * Every event is in the shape the counter's scorer emits (FREESTYLE-MAPS-
 * PLAN.md section 7, Stage C) and every chase event in src/game/chase.js's,
 * so a picture taken from these is a picture of what a pilot will see when
 * the scorer sends the same. The summaries are marked `assisted`, which is
 * the flag Post this run refuses, so a harness run can never reach the
 * public board.
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

/* The score HUD's events, in groups a stack of six can hold at once, in the
 * shapes the header of src/game/score.js gives them. */
export const SCORE_EVENTS = {
  tricks: [
    { kind: 'trick', name: 'Powerloop', points: 480, execution: 'CLEAN' },
    { kind: 'trick', name: 'Split-S', points: 120, execution: 'SLOPPY' },
    { kind: 'trick', name: 'Matty Flip', points: 90, execution: 'BUMP' },
  ],
  gaps: [
    {
      kind: 'gap', name: 'CRANE GAP', tier: 1000, repeat: 0, points: 1000, atMs: 41200,
    },
    {
      kind: 'gap', name: 'FOOTBRIDGE', tier: 250, repeat: 1, points: 188, atMs: 44800,
    },
    {
      kind: 'gap', name: 'WATER TOWER', tier: 2500, repeat: 0, points: 2500, atMs: 52100,
    },
  ],
  close: [
    {
      kind: 'skim', name: 'Roof skim', holdMs: 2400, clearance: 0.42, repeat: 0, points: 310, atMs: 60100,
    },
    {
      kind: 'skim', name: 'Wall skim', holdMs: 900, clearance: 0.61, repeat: 0, points: 90, atMs: 61800,
    },
    {
      kind: 'under', name: 'Under', clearance: 0.8, repeat: 0, points: 160, atMs: 63300,
    },
    {
      kind: 'thread', name: 'Thread', clearance: 0.55, repeat: 1, points: 195, atMs: 64900,
    },
    {
      kind: 'lowpass', name: 'Low pass', holdMs: 1300, clearance: 0.3, repeat: 0, points: 40, atMs: 66000,
    },
  ],
  chase: [
    {
      kind: 'tail', name: 'Drift Tail', holdMs: 5850, drift: true, repeat: 0, points: 585, atMs: 80400,
    },
    {
      kind: 'chase-thread', name: 'Thread', repeat: 0, points: 420, atMs: 82000,
    },
    {
      kind: 'hurdle', name: 'Leapfrog', repeat: 0, points: 330, atMs: 83900,
    },
    {
      kind: 'egg', name: 'STF', repeat: 0, points: 1000, atMs: 90000,
    },
  ],
  bank: [{
    kind: 'bank', points: 12340, mult: 5, names: ['CRANE GAP', 'Roof skim', 'Powerloop'],
  }],
  smallBank: [{
    kind: 'bank', points: 320, mult: 1, names: ['Split-S', 'Low pass'],
  }],
  bail: [{ kind: 'bail', points: 2400, names: ['Thread', 'Under the deck'] }],
};

/* A scorer view with a combo open at x4 and a skim held, for the meter. */
export const SKIM_VIEW = {
  total: 8200,
  trickCount: 3,
  combo: {
    names: ['Roof skim'], points: 1840, mult: 4, value: 7360, remain: 0.62,
  },
  skim: { on: true, holdMs: 1700, clearance: 0.38 },
};

/* The chase HUD's events, in src/game/chase.js's shape. */
export const CHASE_EVENTS = [
  {
    kind: 'tail', name: 'Drift Tail', value: 585, ms: 5850, drift: true,
  },
  { kind: 'thread', name: 'Thread', value: 420 },
  { kind: 'hurdle', name: 'Leapfrog', value: 330 },
];
export const CHASE_LOST = [{
  kind: 'lost', name: 'Drift Tail', why: 'contact', value: 0,
}];

/* The Tail meter held on the drift car, for the skim meter to stand by. */
export const TAIL_VIEW = {
  on: true, slot: 0, label: 'Drift car', drift: true, grace: false, heldMs: 3300, value: 330, fill: 0.33,
};

/*
 * Two runs' summaries: `all` with every panel the page has, and `two` with
 * a gap and a skim only, no tricks (trick scoring off), no tail and no
 * mark, so the page shows the panels a run has and no empty ones. The
 * local best is in both shapes, the shell's `counterBest` and the older
 * `localBest`, so the page reads it before and after the two meet.
 */
export function demoSummary(which) {
  if (which === 'two') {
    return {
      total: 0,
      counter: 2310,
      tricks: 0,
      unique: 0,
      bestCombo: 2310,
      bestTrick: 0,
      signature: '',
      crashes: 1,
      bonus: 0,
      state: 'over',
      durationMs: 120000,
      assisted: true,
      timed: true,
      rows: [],
      bestGap: { name: 'WATER TOWER', points: 1000 },
      longestSkim: { ms: 1800, name: 'Wall skim' },
      bestTail: null,
      eggFound: false,
      gaps: 2,
      closeCalls: { skim: 2 },
      counterBestCombo: 2310,
      counterDurationMs: 120000,
      counterBest: 2310,
      counterBestBefore: 0,
      counterImproved: true,
      localBest: 2310,
    };
  }
  return {
    total: 4200,
    counter: 12340,
    tricks: 9,
    unique: 6,
    bestCombo: 6400,
    bestTrick: 480,
    signature: 'Powerloop',
    crashes: 0,
    bonus: 0,
    state: 'over',
    durationMs: 120000,
    assisted: true,
    timed: true,
    rows: [
      { name: 'Powerloop', count: 2, points: 900 },
      { name: 'Split-S', count: 3, points: 360 },
      { name: 'Matty Flip', count: 2, points: 180 },
      { name: 'Yaw Spin', count: 2, points: 120 },
    ],
    bestGap: { name: 'CRANE GAP', points: 1000 },
    longestSkim: { ms: 2400, name: 'Roof skim' },
    bestTail: { ms: 5800, drift: true },
    eggFound: true,
    gaps: 4,
    closeCalls: {
      skim: 3, under: 2, thread: 1, lowpass: 5,
    },
    counterBestCombo: 7300,
    counterDurationMs: 120000,
    counterBest: 15100,
    counterBestBefore: 15100,
    counterImproved: false,
    localBest: 15100,
  };
}
