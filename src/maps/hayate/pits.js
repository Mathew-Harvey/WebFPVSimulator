/*
 * pits.js: Hayate Circuit's pit complex, north of the main straight: the
 * pit lane, the pit wall's timing stands, the pit building, the race
 * control tower at its west end and the paddock behind.
 *
 * THE PIT BUILDING is the two storey kind every Japanese national circuit
 * has: a row of garages on the ground floor, ten metres a bay and twenty
 * deep, open to the pit lane at the front and to the paddock through a
 * roller door at the back; the hospitality floor over them behind a glass
 * front, with a balcony over the pit lane where the podium is; a flat roof
 * with a parapet, which is where the spectators with paddock passes stand
 * and where the pilot starts. Every garage is a line: in from the pit lane
 * under the fascia, past the car on its stands, and out of the back door
 * between two transporters.
 *
 * THE CONTROL TOWER is the tall glazed block at the end of the pits that
 * the race director sits at the top of, with the circuit's name across it,
 * joined to the pit roof by a walkway over the alley between them.
 *
 * Sizes are a national circuit's, read off aerial photographs: a garage
 * 10 m by 20 m and 4.6 m clear inside, a pit lane 12 m wide behind a 1.1 m
 * wall, a transporter 16 m long and 4 m high, a control tower 30 m.
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

import { PIT_WALL } from './track.js';

export const PIT = {
  x0: 200, x1: 440, y0: 94, y1: 114, bay: 10, ground: 4.6, floor: 5.0, roof: 8.8, top: 9.4, parapet: 10.4, balcony: 91,
};
export const TOWER = { x0: 176, x1: 192, y0: 96, y1: 112, h: 28.4 };
export const PADDOCK = { x0: 196, x1: 452, y0: 114, y1: 174 };
/* Where the start pads stand, plan and world height: the pit roof over
 * the start line, looking south over the straight to the main stand. */
export const PAD = { x: 330, y: 104, h: PIT.top };

/* Each team's colour, by bay, for the fascia, the car and the truck. */
export const TEAMS = [
  { name: 'teamKitsune', m: 'mxOrange' }, { name: 'teamRaijin', m: 'mxBlue' },
  { name: 'teamMidori', m: 'mxGreen' }, { name: 'teamAka', m: 'mxRed' },
  { name: 'teamYuki', m: 'white' }, { name: 'teamKiiro', m: 'craneYellow' },
];

/* The pit lane's paving and paint, and its two blends onto the track. */
function pitLane(T) {
  const y0 = PIT_WALL.y1;
  const y1 = PIT.y0;
  T.deco('hyPitLane', 176, y0, 0.0, 516, y1, 0.022);
  /* The blends: the exit runs out onto the track before turn one, the
   * entry leaves it after the last corner. */
  T.obox('hyPitLane', 166, 79.2, 0.0, 0.021, 26, 5.5, -0.96, -0.28);
  T.obox('hyPitLane', 524, 79.6, 0.0, 0.021, 24, 5.5, 0.95, -0.31);
  /* The fast lane's line and the working lane's, and every bay's box. */
  T.deco('white', 180, 86.4, 0.022, 512, 86.6, 0.03);
  for (let x = PIT.x0; x < PIT.x1; x += PIT.bay) {
    T.deco('craneYellow', x + 0.6, 87.2, 0.022, x + 0.8, 93.6, 0.03, true);
    T.deco('craneYellow', x + 9.2, 87.2, 0.022, x + 9.4, 93.6, 0.03, true);
    T.deco('craneYellow', x + 0.6, 87.2, 0.022, x + 9.4, 87.4, 0.03, true);
  }
  /* The speed limit on the tarmac at both ends, and on posts. */
  T.sign('pit60', 186, 83, 0.03, 0, 0, 3.2, 3.2);
  T.sign('pit60', 504, 83, 0.03, 0, 0, 3.2, 3.2);
  for (const [x, key, nx] of [[180, 'pitOut', -1], [508, 'pitIn', 1]]) {
    T.post('metal', x, 92.8, 0, 3.0, 0.07, { kind: 'pole', name: 'pit sign' });
    T.box('white', x - 0.06, 92.1, 3.0, x + 0.06, 93.5, 4.2, { name: 'pit sign' });
    T.sign(key, x + nx * 0.08, 92.8, 3.6, nx, 0, 1.3, 1.1);
  }
  /* The pit exit light. */
  T.post('metal', 174, 82, 0, 3.4, 0.08, { kind: 'pole', name: 'pit light' });
  T.deco('hyInk', 173.7, 81.7, 2.6, 174.3, 82.3, 3.5);
  T.deco('lampRed', 173.65, 81.75, 3.05, 173.7, 82.25, 3.4);
  T.deco('hyGreen', 173.65, 81.75, 2.65, 173.7, 82.25, 3.0);
}

/*
 * THE PIT WALL'S TIMING STANDS: every 20 m a team's stand on the pit lane
 * side, a roof in its colour on four legs with its screens hung under it
 * and stools along the wall. Flown under along the wall, it is a gap.
 */
export const STANDS = [];
function timingStands(T) {
  let i = 0;
  for (let c = 214; c <= 494; c += 20) {
    const team = TEAMS[i % TEAMS.length];
    const y0 = PIT_WALL.y1;
    const y1 = 82.8;
    for (const [x, y] of [[c - 2.9, y0 + 0.15], [c + 2.9, y0 + 0.15], [c - 2.9, y1 - 0.15], [c + 2.9, y1 - 0.15]]) {
      T.post('metal', x, y, 0, 2.95, 0.06, { kind: 'pole', name: 'timing stand' });
    }
    T.box(team.m, c - 3.1, PIT_WALL.y0 + 0.2, 2.95, c + 3.1, y1 + 0.2, 3.15, { name: 'timing stand roof' });
    T.deco('white', c - 3.12, y1 + 0.18, 2.95, c + 3.12, y1 + 0.22, 3.15, true);
    /* The screens under the roof, facing the lane, and the stools. */
    for (const dx of [-1.6, 0, 1.6]) {
      T.deco('hyInk', c + dx - 0.6, y0 + 0.5, 2.2, c + dx + 0.6, y0 + 0.6, 2.85, true);
      T.deco('glassBlue', c + dx - 0.52, y0 + 0.61, 2.26, c + dx + 0.52, y0 + 0.63, 2.79, true);
      T.cyl('metal', [c + dx, y0 + 1.6, 0], [c + dx, y0 + 1.6, 0.75], 0.03, 4, true);
      T.cyl('hyInk', [c + dx, y0 + 1.6, 0.75], [c + dx, y0 + 1.6, 0.8], 0.2, 8, true);
    }
    T.deco('metalDark', c - 2.8, y0, 0.95, c + 2.8, y0 + 0.7, 1.05, true);
    STANDS.push({ x: c, y0, y1, h: 2.95 });
    i += 1;
  }
}

/* A transporter: a trailer in the team's colour, a cab, wheels, the team
 * written down its side. Stood with its tail to the garages. */
function transporter(T, x, y0, team, k) {
  const y1 = y0 + 13.6;
  T.box(team.m, x - 1.3, y0, 1.1, x + 1.3, y1, 4.0, { name: 'transporter' });
  T.solid(x - 1.3, y0, 0, x + 1.3, y1, 1.1, 'transporter chassis');
  T.deco('hyInk', x - 1.2, y0 + 0.4, 0.4, x + 1.2, y1 - 0.4, 1.1);
  T.deco('white', x - 1.32, y0, 2.0, x + 1.32, y1, 2.25, true);
  /* The cab. */
  T.box('white', x - 1.25, y1 + 0.4, 0, x + 1.25, y1 + 2.6, 3.6, { name: 'transporter cab' });
  T.deco('glassBlue', x - 1.1, y1 + 2.6, 2.3, x + 1.1, y1 + 2.65, 3.3);
  T.deco(team.m, x - 1.27, y1 + 0.4, 0.9, x + 1.27, y1 + 2.6, 1.6, true);
  for (const yw of [y0 + 1.2, y0 + 2.5, y0 + 3.8, y1 + 1.6]) {
    T.cyl('drTyre', [x - 1.35, yw, 0.5], [x + 1.35, yw, 0.5], 0.5, 10, true);
  }
  /* Its name on both flanks. */
  T.sign(team.name, x - 1.33, (y0 + y1) / 2, 2.8, -1, 0, 9, 1.0);
  T.sign(team.name, x + 1.33, (y0 + y1) / 2, 2.8, 1, 0, 9, 1.0);
  /* The tailgate lift, down, and a tyre rack beside it. */
  T.deco('metalDark', x - 1.2, y0 - 1.6, 0, x + 1.2, y0, 0.12, true);
  if (k % 2 === 0) {
    T.op({ t: 'tyreRack', x: x + 2.4, y: y0 + 3, n: 4 });
    T.solid(x + 1.9, y0 + 1.5, 0, x + 2.9, y0 + 4.5, 1.6, 'tyre rack');
  }
}

/* The pit building itself. */
function building(T) {
  const {
    x0, x1, y0, y1, bay, ground, floor, roof, top, parapet, balcony,
  } = PIT;
  /* Front columns between the bays, and the fascia over the openings. */
  for (let x = x0; x <= x1; x += bay) {
    T.box('hyPitWall', x - 0.3, y0, 0, x + 0.3, y0 + 0.6, ground, { name: 'pit column' });
  }
  T.box('hyPitWall', x0 - 0.3, y0, 4.0, x1 + 0.3, y0 + 0.3, ground, { name: 'pit fascia' });
  /* The partitions between garages, full depth, and the end walls. */
  for (let x = x0 + bay; x < x1; x += bay) {
    T.box('hyPitIn', x - 0.15, y0 + 0.6, 0, x + 0.15, y1 - 0.4, ground, { name: 'garage partition' });
  }
  T.box('hyPitWall', x0 - 0.3, y0, 0, x0, y1, ground, { name: 'pit end wall' });
  T.box('hyPitWall', x1, y0, 0, x1 + 0.3, y1, ground, { name: 'pit end wall' });
  /* The back wall, a roller door's opening in every bay. */
  for (let x = x0; x < x1; x += bay) {
    T.box('hyPitWall', x, y1 - 0.4, 0, x + 2.5, y1, ground, { name: 'pit back wall' });
    T.box('hyPitWall', x + 7.5, y1 - 0.4, 0, x + bay, y1, ground, { name: 'pit back wall' });
    T.box('hyPitWall', x + 2.5, y1 - 0.4, 4.2, x + 7.5, y1, ground, { name: 'pit back wall' });
    /* The door, rolled up, and its guides. */
    T.deco('shutterLight', x + 2.5, y1 - 0.5, 3.9, x + 7.5, y1 - 0.2, 4.2, true);
  }
  /* The garages' floor paint, a lighter epoxy than the lane. */
  T.deco('hyGarageFloor', x0, y0 + 0.6, 0.0, x1, y1 - 0.4, 0.025);
  /* The first floor's slab, the balcony and its rail. */
  T.box('hyPitWall', x0 - 0.3, y0, ground, x1 + 0.3, y1, floor, { name: 'first floor' });
  T.box('hyPitWall', x0 - 0.3, balcony, ground + 0.1, x1 + 0.3, y0, floor, { name: 'balcony' });
  T.box('glassBlue', x0 - 0.3, balcony, floor, x1 + 0.3, balcony + 0.12, floor + 1.1, { name: 'balcony rail' });
  T.deco('metal', x0 - 0.3, balcony - 0.02, floor + 1.06, x1 + 0.3, balcony + 0.14, floor + 1.16);
  /* The hospitality floor: a block behind its glass front. */
  T.box('hyPitWall', x0 - 0.3, y0 + 1.6, floor, x1 + 0.3, y1, roof, { name: 'hospitality' });
  T.deco('glassBlue', x0 - 0.2, y0 + 1.57, floor + 0.3, x1 + 0.2, y0 + 1.6, roof - 0.3);
  for (let x = x0; x <= x1; x += 2.5) {
    T.deco('hyPitWall', x - 0.08, y0 + 1.5, floor, x + 0.08, y0 + 1.6, roof, true);
  }
  /* The back's windows, a band of them. */
  T.deco('glassBlue', x0, y1 + 0.01, floor + 1.0, x1, y1 + 0.03, roof - 0.8);
  for (let x = x0 + 4; x < x1; x += 4) {
    T.deco('hyPitWall', x - 0.15, y1 + 0.02, floor + 1.0, x + 0.15, y1 + 0.05, roof - 0.8, true);
  }
  /* The roof, over the balcony too, and its parapet. */
  T.box('hyPitRoof', x0 - 0.6, balcony, roof, x1 + 0.6, y1 + 0.3, top, { name: 'pit roof' });
  T.box('white', x0 - 0.6, balcony, top, x1 + 0.6, balcony + 0.3, parapet, { name: 'parapet' });
  T.box('white', x0 - 0.6, y1, top, x1 + 0.6, y1 + 0.3, parapet, { name: 'parapet' });
  T.box('white', x0 - 0.6, balcony + 0.3, top, x0 - 0.3, y1, parapet, { name: 'parapet' });
  T.box('white', x1 + 0.3, balcony + 0.3, top, x1 + 0.6, y1, parapet, { name: 'parapet' });
  T.deco('hyKerbRed', x0 - 0.62, balcony - 0.02, roof + 0.1, x1 + 0.62, balcony + 0.01, top - 0.05);
  /* Roof plant: air handlers along the back. */
  for (let x = x0 + 8; x < x1 - 6; x += 22) {
    T.box('acUnit', x, y1 - 4.5, top, x + 3.2, y1 - 1.5, top + 1.5, { name: 'roof plant' });
    T.op({ t: 'fan', x: x + 1.6, y: y1 - 3, h: top + 1.52 });
  }
  /* Each bay's number and its team over its opening, on the fascia. */
  let k = 0;
  for (let x = x0; x < x1; x += bay) {
    const team = TEAMS[k % TEAMS.length];
    T.sign(`bay${k + 1}`, x + 1.6, y0 - 0.02, 4.3, 0, -1, 1.6, 0.55);
    T.sign(team.name, x + 6, y0 - 0.02, 4.3, 0, -1, 6.4, 0.55);
    k += 1;
  }
  /* The circuit's name along the parapet, read from the main stand. */
  for (const xc of [262, 398]) {
    T.sign('hayateLong', xc, balcony - 0.02, parapet - 0.5, 0, -1, 24, 0.85);
  }
}

/*
 * INSIDE THE GARAGES: a car on its stands in every other bay (drawn by
 * ./cars.js with the moving cars, solid here), the tyre sets, the tool
 * chests along a partition, the team's banner on the back wall and the
 * data gantry overhead.
 */
export const PARKED = [];
function garages(T) {
  const { x0, x1, y0, y1, bay } = PIT;
  let k = 0;
  for (let x = x0; x < x1; x += bay) {
    const team = TEAMS[k % TEAMS.length];
    const cx = x + bay / 2;
    if (k % 2 === 0) {
      /* The car nose out, on its stands: solid as a box, drawn by cars.js. */
      PARKED.push({ x: cx, y: y0 + 8, hx: 0, hy: -1, team: k % TEAMS.length, lift: 0.18 });
      T.solid(cx - 1.0, y0 + 5.7, 0, cx + 1.0, y0 + 10.3, 1.35, 'garage car');
    }
    /* Tyre sets, stacked four high, against the left partition. */
    for (const yy of [y0 + 13, y0 + 15]) {
      T.op({ t: 'tyreStack', x: x + 1.1, y: yy, n: 4 });
    }
    T.solid(x + 0.5, y0 + 12.3, 0, x + 1.7, y0 + 15.7, 1.3, 'tyre sets');
    /* Tool chests on the right. */
    T.box(team.m, x + bay - 1.4, y0 + 12, 0, x + bay - 0.4, y0 + 15.5, 1.0, { name: 'tool chest' });
    T.deco('metal', x + bay - 1.42, y0 + 12, 1.0, x + bay - 0.38, y0 + 15.5, 1.05, true);
    for (let i = 0; i < 4; i += 1) {
      T.deco('white', x + bay - 1.42, y0 + 12.1, 0.2 + i * 0.2, x + bay - 1.41, y0 + 15.4, 0.23 + i * 0.2, true);
    }
    /* The data gantry over the car: a beam on the partitions, screens. */
    T.deco('metalDark', x + 0.3, y0 + 3.6, 3.6, x + bay - 0.3, y0 + 3.9, 3.8, true);
    T.deco('hyInk', cx - 0.8, y0 + 3.62, 2.95, cx + 0.8, y0 + 3.7, 3.6, true);
    T.deco('glassBlue', cx - 0.7, y0 + 3.6, 3.0, cx + 0.7, y0 + 3.61, 3.55, true);
    /* The banner on the back wall, each side of the door. */
    T.sign(team.name, x + 1.25, y1 - 0.42, 2.6, 0, -1, 2.3, 0.6);
    k += 1;
  }
}

/* The podium on the balcony at the middle of the building, the step for
 * each place and the backdrop behind them. */
function podium(T) {
  const xc = 330;
  const y0 = PIT.balcony + 0.2;
  const y1 = PIT.y0 + 1.4;
  const f = PIT.floor;
  T.box('white', xc - 1.0, y0, f, xc + 1.0, y1, f + 1.0, { name: 'podium' });
  T.box('white', xc - 3.0, y0, f, xc - 1.0, y1, f + 0.7, { name: 'podium' });
  T.box('white', xc + 1.0, y0, f, xc + 3.0, y1, f + 0.45, { name: 'podium' });
  T.deco('craneYellow', xc - 1.02, y0 - 0.02, f + 0.85, xc + 1.02, y0 + 0.01, f + 0.98);
  T.deco('metal', xc - 3.02, y0 - 0.02, f + 0.55, xc - 0.98, y0 + 0.01, f + 0.68);
  T.deco('hyBronze', xc + 0.98, y0 - 0.02, f + 0.3, xc + 3.02, y0 + 0.01, f + 0.43);
  T.sign('pod1', xc, y0 - 0.03, f + 0.45, 0, -1, 0.7, 0.7);
  T.sign('pod2', xc - 2, y0 - 0.03, f + 0.32, 0, -1, 0.5, 0.5);
  T.sign('pod3', xc + 2, y0 - 0.03, f + 0.2, 0, -1, 0.36, 0.36);
}

/* The race control tower and the walkway to the pit roof. */
function tower(T) {
  const {
    x0, x1, y0, y1, h,
  } = TOWER;
  const glass = h - 4.4;
  T.box('hyTower', x0, y0, 0, x1, y1, glass, { name: 'control tower' });
  /* Window bands round every floor. */
  for (let f = 3.2; f < glass - 1; f += 3.6) {
    T.deco('glassBlue', x0 - 0.03, y0 - 0.03, f, x1 + 0.03, y1 + 0.03, f + 1.6);
    T.deco('hyTowerBand', x0 - 0.05, y0 - 0.05, f + 1.6, x1 + 0.05, y1 + 0.05, f + 1.8, true);
  }
  /* The race director's floor: all glass, leaning out. */
  T.box('glassBlue', x0 - 0.8, y0 - 0.8, glass, x1 + 0.8, y1 + 0.8, h, { name: 'control room' });
  for (let x = x0 - 0.8; x <= x1 + 0.8; x += 2.4) {
    T.deco('hyInk', x - 0.07, y0 - 0.86, glass, x + 0.07, y0 - 0.8, h, true);
    T.deco('hyInk', x - 0.07, y1 + 0.8, glass, x + 0.07, y1 + 0.86, h, true);
  }
  for (let y = y0 - 0.8; y <= y1 + 0.8; y += 2.4) {
    T.deco('hyInk', x0 - 0.86, y - 0.07, glass, x0 - 0.8, y + 0.07, h, true);
    T.deco('hyInk', x1 + 0.8, y - 0.07, glass, x1 + 0.86, y + 0.07, h, true);
  }
  T.box('hyTower', x0 - 1.6, y0 - 1.6, h, x1 + 1.6, y1 + 1.6, h + 0.6, { name: 'tower roof' });
  T.deco('hyKerbRed', x0 - 1.62, y0 - 1.62, h + 0.1, x1 + 1.62, y1 + 1.62, h + 0.5);
  /* The roof's own plant and the mast with its windsock arm. */
  T.box('acUnit', x0 + 2, y0 + 8, h + 0.6, x0 + 6, y0 + 12, h + 1.8, { name: 'tower plant' });
  T.post('mastWhite', (x0 + x1) / 2, (y0 + y1) / 2, h + 0.6, h + 10, 0.12, { kind: 'pole', name: 'tower mast' });
  for (let i = 0; i < 4; i += 1) {
    T.cyl(i % 2 ? 'mastRed' : 'mastWhite', [(x0 + x1) / 2, (y0 + y1) / 2, h + 7 + i * 0.75], [(x0 + x1) / 2, (y0 + y1) / 2, h + 7.75 + i * 0.75], 0.14, 6, true);
  }
  T.cyl('metal', [(x0 + x1) / 2, (y0 + y1) / 2, h + 9.2], [(x0 + x1) / 2 + 1.4, (y0 + y1) / 2, h + 9.2], 0.04, 4, true);
  T.cone('awning', [(x0 + x1) / 2 + 1.4, (y0 + y1) / 2, h + 8.4], 0.3, 0.9, 6, true);
  /* The circuit's name across the south face and a clock over it. */
  T.sign('hayateTower', (x0 + x1) / 2, y0 - 0.03, glass - 4.8, 0, -1, 14, 4.2);
  T.sign('hayateTower', (x0 + x1) / 2, y1 + 0.03, glass - 4.8, 0, 1, 14, 4.2);
  T.sign('clock', x0 - 0.03, (y0 + y1) / 2, glass - 4.8, -1, 0, 4, 4);
  /* The walkway from the pit roof to the tower's door, over the alley. */
  T.box('hyPitRoof', x1, 100, PIT.top - 0.4, PIT.x0 - 0.3, 104, PIT.top, { name: 'walkway' });
  T.box('glassBlue', x1, 99.9, PIT.top, PIT.x0 - 0.3, 100.05, PIT.top + 1.1, { name: 'walkway rail' });
  T.box('glassBlue', x1, 103.95, PIT.top, PIT.x0 - 0.3, 104.1, PIT.top + 1.1, { name: 'walkway rail' });
  /* The way in at the bottom, a canopy over it. */
  T.deco('glassBlue', x0 + 5, y0 - 0.04, 0, x1 - 5, y0 - 0.02, 2.6);
  T.box('hyPitRoof', x0 + 4, y0 - 2.6, 2.8, x1 - 4, y0, 3.1, { name: 'tower canopy' });
}
export const ALLEY = { x0: TOWER.x1, x1: PIT.x0 - 0.3, y: 102, h: PIT.top - 0.4 };

/* The paddock behind the pits: its paving, the transporters tail to the
 * garages between the doors, the hospitality tents, the scooters, the
 * fuel pumps and the paddock's own lamp posts. */
function paddock(T) {
  const { x0, x1, y0, y1 } = PADDOCK;
  T.deco('concrete', x0, y0, 0, x1, y1, 0.02);
  let k = 0;
  for (let i = 1; i < 24; i += 2) {
    const x = PIT.x0 + i * PIT.bay;
    transporter(T, x, PIT.y1 + 6, TEAMS[k % TEAMS.length], k);
    k += 1;
  }
  /* The hospitality tents: white pagoda tents in a row. */
  let t = 0;
  for (let x = 206; x <= 430; x += 14) {
    const yc = 160;
    T.op({ t: 'tent', x, y: yc, s: 5, h: 2.6, m: t % 3 === 0 ? 'white' : (t % 3 === 1 ? 'hyTent' : 'white') });
    T.solid(x - 5, yc - 5, 2.6, x + 5, yc + 5, 3.0, 'tent roof');
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      T.post('metal', x + dx * 4.9, yc + dy * 4.9, 0, 2.6, 0.05, { kind: 'pole', name: 'tent leg' });
    }
    T.op({ t: 'tableSet', x, y: yc });
    t += 1;
  }
  /* Scooters by the doors, and the paddock lamps. */
  for (let x = PIT.x0 + 4; x < PIT.x1; x += 20) {
    T.op({ t: 'scooter', x, y: PIT.y1 + 2.5, k: x });
  }
  for (let x = 210; x <= 440; x += 30) {
    T.post('metal', x, 146, 0, 7, 0.08, { kind: 'pole', name: 'paddock lamp' });
    T.op({ t: 'lamp', x, y: 146, h: 7 });
  }
  /* The fuel station at the paddock's east end. */
  T.box('white', 446, 124, 4.2, 458, 136, 4.6, { name: 'fuel canopy' });
  for (const [x, y] of [[447, 125], [457, 125], [447, 135], [457, 135]]) {
    T.post('metal', x, y, 0, 4.2, 0.12, { kind: 'pole', name: 'fuel canopy' });
  }
  for (const y of [127.5, 132.5]) {
    T.box('white', 451.4, y - 0.4, 0, 452.6, y + 0.4, 1.8, { name: 'fuel pump' });
    T.deco('mxRed', 451.38, y - 0.42, 1.2, 452.62, y + 0.42, 1.8, true);
  }
  T.deco('mxRed', 445.98, 123.98, 4.2, 458.02, 136.02, 4.35);
}

export function pitComplex(T) {
  pitLane(T);
  timingStands(T);
  building(T);
  garages(T);
  podium(T);
  tower(T);
  paddock(T);
}
