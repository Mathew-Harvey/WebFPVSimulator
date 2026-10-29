/*
 * arena.js: Quad Ball, the place. Pure: no Three.js, so the solids and the
 * numbers the game plays by load in Node (scripts/ball-selftest.js) as they
 * do in the browser. The owner's ask of 2026-10-29: "rocket league but with
 * quads", pilots pushing a big ball into goals.
 *
 * THE FRAME IS THE WORLD'S. The arena's middle is the world's origin, its
 * long axis is x and it is z across, floor at y = 0, so the game reads
 * these numbers as world metres with no conversion. The built map's plan
 * puts x east and y north from the plot's near left corner, so a plan point
 * is (x + FIELD_W / 2, FIELD_D / 2 - z) and a document yaw of 0 faces +x,
 * which is down the arena toward the east goal.
 *
 * TWO ENDS. The west goal (x < 0) is the pink team's to defend, the east
 * goal (x > 0) the mint team's. A goal is a mouth cut in the end wall and a
 * pocket behind it; the walls are solid for the quad (a crash is the usual
 * crash) and the ball bounces off them in src/game/quadball.js, which reads
 * ARENA for where.
 *
 * NO CEILING for the quad. The ball is held under CEIL by the game, and a
 * quad that climbs over the wall is simply out of the match.
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

import { Parts } from '../../props/parts.js';
import { BALL_DOC_ID } from '../registry.js';

export const BALL_NAME = 'Quad Ball';

/* The plot, metres. */
export const FIELD_W = 150;
export const FIELD_D = 100;

/*
 * The arena in world metres. half length hx, half width hz, wall height,
 * the goal mouth's half width and height, how deep the pocket is, and the
 * ceiling the ball is held under.
 */
export const ARENA = Object.freeze({
  hx: 55,
  hz: 26,
  wall: 24,
  gw: 9,
  gh: 9.5,
  gd: 8,
  ceil: 22,
  /* Where the pilot's pad is, world x: the pink half, a way in front of
   * their own goal. */
  padX: -26,
});

/* Team colours: pink is the home side (west), mint the away (east). */
export const TEAM_NAMES = ['PINK', 'MINT'];

const T = 0.9;

/* A plan point (x east, y north) from a world one. */
export function toPlan(x, z) {
  return [x + FIELD_W / 2, FIELD_D / 2 - z];
}

export function ballLayout() {
  const A = ARENA;
  const P = new Parts();
  const wallM = 'wallCream';
  /* The floor: a pitch laid over the grass, drawn and not solid. */
  P.box('qbPitch', -A.hx - A.gd, 0, -A.hz, A.hx + A.gd, 0.04, A.hz, { solid: false, cast: false, name: 'pitch' });
  /* Side walls. */
  for (const s of [-1, 1]) {
    P.box(wallM, -A.hx - T, 0, s > 0 ? A.hz : -A.hz - T, A.hx + T, A.wall, s > 0 ? A.hz + T : -A.hz, { name: 'side wall' });
    P.box('qbBand', -A.hx - T, A.wall - 2.2, s > 0 ? A.hz - 0.05 : -A.hz - T, A.hx + T, A.wall - 1.6, s > 0 ? A.hz + T : -A.hz + 0.05, { solid: false, cast: false, name: 'side band' });
  }
  /* End walls, each with its mouth, a lintel over it, and its pocket. */
  for (const s of [-1, 1]) {
    const m = s < 0 ? 'qbSakura' : 'qbMint';
    const glow = s < 0 ? 'qbSakuraGlow' : 'qbMintGlow';
    const x0 = s > 0 ? A.hx : -A.hx - T;
    const x1 = s > 0 ? A.hx + T : -A.hx;
    P.box(m, x0, 0, A.gw, x1, A.wall, A.hz + T, { name: 'end wall' });
    P.box(m, x0, 0, -A.hz - T, x1, A.wall, -A.gw, { name: 'end wall' });
    P.box(m, x0, A.gh, -A.gw, x1, A.wall, A.gw, { name: 'lintel' });
    /* The pocket: two side walls, a roof, a back wall that glows. */
    const px0 = s > 0 ? A.hx + T : -A.hx - T - A.gd;
    const px1 = s > 0 ? A.hx + T + A.gd : -A.hx - T;
    for (const z of [-1, 1]) {
      P.box(wallM, px0, 0, z > 0 ? A.gw : -A.gw - T, px1, A.gh + T, z > 0 ? A.gw + T : -A.gw, { name: 'pocket wall' });
    }
    P.box(wallM, px0, A.gh, -A.gw, px1, A.gh + T, A.gw, { name: 'pocket roof' });
    const bx0 = s > 0 ? A.hx + T + A.gd : -A.hx - T - A.gd - T;
    P.box(glow, bx0, 0, -A.gw, bx0 + T, A.gh, A.gw, { name: 'goal back' });
  }
  /* Floodlight masts at the four corners, outside the walls. */
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      P.post('concreteDark', sx * (A.hx + 7), sz * (A.hz + 7), 0, 34, 0.5, { kind: 'pole', name: 'mast' });
    }
  }
  return { parts: P.list };
}

/* What the pipeline draws beside the parts: pitch lines and the lamps. */
export function drawArena(kit) {
  const A = ARENA;
  kit.begin(0, 0, 0, 0, 'extra');
  const y0 = 0.04;
  const y1 = 0.07;
  kit.box('qbLine', -0.15, y0, -A.hz, 0.15, y1, A.hz);
  kit.cyl('qbLine', [0, y0, 0], [0, y1, 0], 9.2, 32);
  kit.cyl('qbPitch', [0, y0, 0], [0, y1 + 0.005, 0], 8.9, 32);
  for (const s of [-1, 1]) {
    const x = s * (A.hx - 0.2);
    kit.box('qbLine', s > 0 ? A.hx - 12 : -A.hx, y0, -A.gw - 5, s > 0 ? A.hx : -A.hx + 12, y1, -A.gw - 4.7);
    kit.box('qbLine', s > 0 ? A.hx - 12 : -A.hx, y0, A.gw + 4.7, s > 0 ? A.hx : -A.hx + 12, y1, A.gw + 5);
    kit.box('qbLine', s > 0 ? A.hx - 12.3 : -A.hx + 12, y0, -A.gw - 5, s > 0 ? A.hx - 12 : -A.hx + 12.3, y1, A.gw + 5);
    /* The goal's frame, picked out in white round the mouth. */
    kit.box('white', x, 0, -A.gw - 0.3, x + s * 0.5, A.gh, -A.gw);
    kit.box('white', x, 0, A.gw, x + s * 0.5, A.gh, A.gw + 0.3);
    kit.box('white', x, A.gh - 0.3, -A.gw, x + s * 0.5, A.gh, A.gw);
  }
  /* The lamps on the masts. */
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      kit.box('whLamp', sx * (A.hx + 7) - 2, 33.5, sz * (A.hz + 7) - 1, sx * (A.hx + 7) + 2, 35, sz * (A.hz + 7) + 1);
    }
  }
}

export function ballDocument() {
  const A = ARENA;
  const [px, py] = toPlan(A.padX, 0);
  const el = {
    id: 'el-1',
    type: 'startPads',
    name: '',
    position: { x: px, y: py, z: 0 },
    yaw: 0,
    pitch: 0,
    yawOverridden: true,
    dims: { pads: 1, spacing: 1.5, padSize: 0.9 },
  };
  return {
    schemaVersion: 3,
    id: BALL_DOC_ID,
    name: BALL_NAME,
    createdUtc: '2026-10-29T00:00:00Z',
    modifiedUtc: '2026-10-29T00:00:00Z',
    trackClass: 'full',
    mode: 'freestyle',
    field: { width: FIELD_W, depth: FIELD_D, gridSize: 1 },
    settings: { tangentScale: 1.1, minCurveRadius: 2.5, samplesPerSegment: 48 },
    scene: { time: 'noon', ground: 'grass' },
    branding: { logos: [] },
    credit: null,
    elements: [el],
    sequence: [],
  };
}
