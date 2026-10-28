/*
 * curriculum.js: the career, as data.
 *
 * Ten chapters, from a first hover to a pro licence. Each lesson is one
 * skill: a world, a flight mode the lesson holds for you, objectives in
 * order (judged by ./objectives.js), medal times, a briefing written to be
 * read in fifteen seconds, the sticks the lesson is about, and the tip the
 * pilot gets when they crash. The order is the order a real pilot learns
 * in: Angle mode until the sticks make sense, then Acro, then gaps, then
 * rotations, then gates and racing, then freestyle.
 *
 * THE WORDS follow the game's glossary (scripts/noun-lint.js): a track is a
 * track, a gate is a gate, Angle and Acro are named as Betaflight names them.
 *
 * MEDAL TIMES are milliseconds from takeoff to the last objective. Bronze is
 * finishing. Silver and gold were set from the flight rig's own flights of
 * each lesson (tests/career-rig.test.js), with gold a little behind a clean
 * rig flight so it takes practice, not perfection.
 *
 * STICKS in a briefing name what the pilot will move, for the drawing in the
 * briefing: 'throttle', 'yaw', 'pitch', 'roll', and a direction.
 *
 * This file is part of WebFPV.
 *
 * WebFPV is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * WebFPV is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY, without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along
 * with WebFPV. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  EAST, NORTH, WEST, FIELD_SPAWN, GAP_SPAWN, WEBFPV_CREDIT, gapSchool, trainingField,
} from './maps.js';
import { OFFICIAL_TRACKS, careerTrack } from './tracks.js';
import { starterMap } from '../maps/built/starter.js';

const deg = (d) => d;

/* Rings on a route: each ring faces the bisector of the leg in and the leg
 * out, so a smooth line through the centres goes through every ring square.
 * `from` is where the pilot comes from before the first. */
function route(points, { r = 2.5, from = [FIELD_SPAWN.x, FIELD_SPAWN.y] } = {}) {
  const rings = [];
  for (let i = 0; i < points.length; i += 1) {
    const [x, y, z] = points[i];
    const prev = i === 0 ? from : points[i - 1];
    const next = i + 1 < points.length ? points[i + 1] : null;
    const inYaw = Math.atan2(y - prev[1], x - prev[0]);
    let yaw = inYaw;
    if (next) {
      const outYaw = Math.atan2(next[1] - y, next[0] - x);
      yaw = Math.atan2(Math.sin(inYaw) + Math.sin(outYaw), Math.cos(inYaw) + Math.cos(outYaw));
    }
    rings.push({ at: [x, y, z], yaw, r });
  }
  return rings;
}

/* Hibari Yard, the built world's own starter map: the freestyle chapter is
 * flown in the map every new pilot meets first in free flight. The career's
 * copy carries the game's credit, so it reads as the game's own layout. */
const hibariYard = () => ({ ...starterMap(), credit: { ...WEBFPV_CREDIT } });

/*
 * Medal times for a race lesson on an official track: the run up from the
 * pads to the timing gate, then `laps` laps at the track's own gold and
 * silver lap (./tracks.js OFFICIAL_TRACKS), rounded up to the half second.
 */
function raceMedals(trackId, laps, runUpS = 2) {
  const t = OFFICIAL_TRACKS.find((x) => x.id === trackId);
  const half = (ms) => Math.ceil(ms / 500) * 500;
  return {
    gold: half(runUpS * 1000 + laps * t.gold),
    silver: half(runUpS * 1500 + laps * t.silver),
  };
}

/* A world that is a freestyle map document, built by src/maps/built. */
const built = (doc) => ({ map: 'built', doc });
/* A world that is a race track document, built by src/maps/custom. */
const race = (doc) => ({ map: 'custom', doc });

/* ---------------------------------------------------------------- *
 * Shared pieces of the field lessons.
 * ---------------------------------------------------------------- */

const fieldFlags = [
  /* Four flags round the pad, 18 m out, for Look around. */
  ['flag', 98, 25, EAST, { height: 2.5, poleRadius: 0.025, clearance: 1.5 }],
  ['flag', 80, 7, EAST, { height: 2.5, poleRadius: 0.025, clearance: 1.5 }],
  ['flag', 62, 25, EAST, { height: 2.5, poleRadius: 0.025, clearance: 1.5 }],
  ['flag', 80, 43, EAST, { height: 2.5, poleRadius: 0.025, clearance: 1.5 }],
];

const ringRoad = [
  [80, 47, 3], [96, 66, 3], [108, 88, 3], [96, 110, 3], [76, 116, 3], [58, 100, 3], [54, 78, 3], [64, 58, 3],
];

/* The ring road again, with every ring at its own height. The highest is
 * 7 m and the turns at the top are where it climbs least: tests/rig
 * flew 9 m there in Angle and the turn ran wide of the ring. */
const highLow = [
  [80, 47, 2.2], [96, 66, 5], [108, 88, 2.5], [96, 110, 7], [76, 116, 3], [58, 100, 6], [54, 78, 2.5], [64, 58, 4.5],
];

/* The figure eight round two poles at (64, 80) and (96, 80). */
const eightRings = (laps) => {
  const one = [
    { at: [96, 96, 3], yaw: EAST, r: 2.6 },
    { at: [112, 80, 3], yaw: -Math.PI / 2, r: 2.6 },
    { at: [96, 64, 3], yaw: WEST, r: 2.6 },
    { at: [64, 96, 3], yaw: WEST, r: 2.6 },
    { at: [48, 80, 3], yaw: -Math.PI / 2, r: 2.6 },
    { at: [64, 64, 3], yaw: EAST, r: 2.6 },
  ];
  const out = [];
  for (let l = 0; l < laps; l += 1) {
    out.push(...one.map((x) => ({ ...x, at: [...x.at] })));
  }
  return out;
};

const eightPoles = [
  ['utilityPole', 64, 80, NORTH, { height: 10 }],
  ['utilityPole', 96, 80, NORTH, { height: 10 }],
];

/* The slalom poles, 12 m apart up the middle, and a ring beside each on
 * alternate sides. */
const slalomPoles = [0, 1, 2, 3, 4, 5].map((k) => ['pole', 80, 48 + k * 12, EAST, { height: 2.5, poleRadius: 0.025, clearance: 1.5 }]);
const slalomRings = [0, 1, 2, 3, 4, 5].map((k) => ({
  at: [80 + (k % 2 === 0 ? 4.2 : -4.2), 48 + k * 12, 2.2], yaw: NORTH, r: 2.2,
}));

const pylon = [['pylon', 80, 86, EAST, { height: 28 }]];

/* ---------------------------------------------------------------- *
 * The chapters.
 * ---------------------------------------------------------------- */

export const CHAPTERS = [
  {
    id: 'c1',
    title: 'First Hover',
    blurb: 'Angle mode, the self levelling mode every new pilot starts in. Lift off, hold still, turn, fly and land.',
    mode: 'angle',
    lessons: [
      {
        id: '1-1',
        title: 'Lift Off',
        glyph: 'takeoff',
        mode: 'angle',
        camera: 'chase',
        world: built(trainingField('trk-c4a91011', 'Training Field')),
        briefing: {
          goal: 'Lift the quad off the pad, hold it between one and three metres for five seconds, then land.',
          why: 'Throttle is the first thing every pilot learns, because it is the one stick that never lets go of you. Smooth throttle is what everything else is built on.',
          steps: [
            'Push {throttle} up slowly until the quad lifts.',
            'Hold it in the band: a little up to climb, a little down to sink.',
            'Ease the stick down to land. Gently is the whole trick.',
          ],
          sticks: [{ stick: 'throttle', dir: 'up' }],
          note: 'Angle mode levels the quad for you, and this lesson shows you the quad from behind. Real pilots fly from the quad\'s own camera, and you will too from lesson three.',
        },
        objectives: [
          { kind: 'takeoff', text: 'Take off', hint: 'Push {throttle} up, slowly.' },
          {
            kind: 'hold', text: 'Hold between 1 and 3 m', seconds: 5,
            zone: { kind: 'cylinder', at: [FIELD_SPAWN.x, FIELD_SPAWN.y], r: 9, z0: 1, z1: 3 },
            hint: 'Small throttle moves. The gauge on the right shows your height.',
          },
          { kind: 'land', text: 'Land', maxDescent: 2.5, hint: 'Ease the throttle down until it touches.' },
        ],
        medals: { gold: 14000, silver: 28000 },
        crashTip: 'Too much throttle all at once. Push the stick up slowly and stop as soon as the quad lifts.',
      },
      {
        id: '1-2',
        title: 'Hold the Box',
        mode: 'angle',
        camera: 'chase',
        world: built(trainingField('trk-c4a91012', 'Training Field')),
        briefing: {
          goal: 'Fly into the box ahead and stay inside it for twelve seconds.',
          why: 'Holding a position is the quiet skill under every gate and every landing. In Angle mode {tilt} tilts the quad, and it goes where it leans.',
          steps: [
            'Take off and climb into the height of the box.',
            'Push {pitch} forward a little to drift into it.',
            'Let go to stop leaning: the quad levels itself and slows.',
          ],
          sticks: [{ stick: 'throttle', dir: 'hold' }, { stick: 'pitch', dir: 'forward' }, { stick: 'roll', dir: 'both' }],
        },
        objectives: [
          { kind: 'takeoff', text: 'Take off', hint: '{Throttle} up, gently.' },
          {
            kind: 'hold', text: 'Stay in the box for 12 s', seconds: 12,
            zone: { kind: 'box', at: [80, 37, 3], size: [6, 6, 3.4] },
            hint: 'Tiny moves on {tilt}. Let go and it levels.',
          },
        ],
        medals: { gold: 20000, silver: 34000 },
        crashTip: 'Leaning too far makes the quad sink. Keep {tilt} near the middle and add a touch of throttle as you move.',
      },
      {
        id: '1-3',
        title: 'Into the Goggles',
        mode: 'angle',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91013', 'Training Field', fieldFlags)),
        briefing: {
          goal: 'From the quad\'s own camera now. Turn on the spot to face each flag in turn: right, behind, left, and ahead again.',
          why: 'Yaw turns the nose without moving the quad. Every turn you will ever fly starts with knowing where the nose is.',
          steps: [
            'Take off and hold a low hover over the pad.',
            'Push {yaw} right to turn the nose right.',
            'Stop on each flag until it is counted, then turn to the next.',
          ],
          sticks: [{ stick: 'yaw', dir: 'right' }, { stick: 'throttle', dir: 'hold' }],
        },
        objectives: [
          { kind: 'takeoff', text: 'Take off', hint: 'A low hover over the pad.' },
          {
            kind: 'face', text: 'Face each flag', headings: [deg(0), deg(-90), deg(180), deg(90)], tol: 14, hold: 0.7,
            zone: { kind: 'cylinder', at: [FIELD_SPAWN.x, FIELD_SPAWN.y], r: 6, z0: 0.4, z1: 6 },
            hint: '{Yaw} sideways turns the nose. Turn right.',
          },
        ],
        medals: { gold: 10000, silver: 18000 },
        crashTip: 'Watch the throttle while you turn: it is easy to move it by accident when you yaw.',
      },
      {
        id: '1-4',
        title: 'Forward and Stop',
        glyph: 'hold',
        mode: 'angle',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91014', 'Training Field')),
        briefing: {
          goal: 'Fly to the circle thirty metres ahead, stop in it for three seconds, then fly back and land on the pad.',
          why: 'Going is easy; stopping where you meant to is flying. A quad has no brakes: you stop it by leaning back.',
          steps: [
            '{Pitch} forward to go. A little throttle keeps your height.',
            'Pull {pitch} back to slow down before the circle.',
            'Turn round with yaw, fly back, and land on the pad.',
          ],
          sticks: [{ stick: 'pitch', dir: 'forward' }, { stick: 'pitch', dir: 'back' }, { stick: 'yaw', dir: 'both' }],
        },
        objectives: [
          { kind: 'takeoff', text: 'Take off', hint: 'Climb to a couple of metres.' },
          {
            kind: 'hold', text: 'Stop in the circle for 3 s', seconds: 3, maxSpeed: 2,
            zone: { kind: 'cylinder', at: [80, 55], r: 3.2, z0: 0.8, z1: 6 },
            hint: 'Slow down early: pull {pitch} back as you arrive.',
          },
          {
            kind: 'land', text: 'Land on the pad', maxDescent: 2.2,
            pad: { at: [FIELD_SPAWN.x, FIELD_SPAWN.y], r: 3 },
            hint: 'Turn round, come back slowly, and set it down on the pad.',
          },
        ],
        medals: { gold: 26000, silver: 42000 },
        crashTip: 'Slow down before you try to stop: pull {pitch} back early and gently.',
      },
      {
        id: '1-5',
        title: 'Touchdown',
        mode: 'angle',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91015', 'Training Field')),
        briefing: {
          goal: 'Land gently on each of the three pads in turn.',
          why: 'Landing is half of flying, and the half that decides whether you fly again today. Come in slow and low, and let it settle.',
          steps: [
            'Fly to the lit pad and stop over it.',
            'Lower the throttle slowly. The quad sinks onto the pad.',
            'Take off again and do the next one.',
          ],
          sticks: [{ stick: 'throttle', dir: 'down' }, { stick: 'pitch', dir: 'both' }, { stick: 'roll', dir: 'both' }],
        },
        objectives: [
          {
            kind: 'land', text: 'Land on all three pads', maxDescent: 1.6,
            pads: [{ at: [96, 42], r: 1.8 }, { at: [80, 58], r: 1.8 }, { at: [64, 42], r: 1.8 }],
            hint: 'Stop over the pad first, then come down.',
          },
        ],
        medals: { gold: 42000, silver: 65000 },
        crashTip: 'Too fast on the way down. Stop over the pad, then lower the throttle a little at a time.',
      },
    ],
  },

  {
    id: 'c2',
    title: 'Angle Mode Navigation',
    blurb: 'Fly lines, not points: rings, a figure eight, heights and a slalom, still in Angle mode.',
    mode: 'angle',
    lessons: [
      {
        id: '2-1',
        title: 'Ring Road',
        mode: 'angle',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91021', 'Training Field')),
        briefing: {
          goal: 'Fly through the eight rings in order, a loop round the field.',
          why: 'A line is a lot of small corrections made early. Look at the next ring, not the one you are in.',
          steps: [
            'Hold a steady height and a gentle forward lean.',
            'Turn with yaw and a touch of roll the same way.',
            'Line up early: aim for the middle of the next ring.',
          ],
          sticks: [{ stick: 'pitch', dir: 'forward' }, { stick: 'yaw', dir: 'both' }, { stick: 'roll', dir: 'both' }],
        },
        objectives: [
          { kind: 'rings', text: 'Fly the rings', rings: route(ringRoad), hint: 'The lit ring is next.' },
        ],
        medals: { gold: 34000, silver: 52000 },
        crashTip: 'Slow down. A ring flown slowly counts the same, and speed comes on its own.',
      },
      {
        id: '2-2',
        title: 'Figure Eight',
        mode: 'angle',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91022', 'Training Field', eightPoles)),
        briefing: {
          goal: 'A figure eight round the two poles, through every ring.',
          why: 'A figure eight turns you both ways in turn, which is the only way to get as good turning left as turning right.',
          steps: [
            'Round the right pole clockwise, then the left one the other way.',
            'Cross the middle on a diagonal.',
            'Keep a steady height the whole way round.',
          ],
          sticks: [{ stick: 'yaw', dir: 'both' }, { stick: 'roll', dir: 'both' }, { stick: 'pitch', dir: 'forward' }],
        },
        objectives: [
          { kind: 'rings', text: 'Fly the eight', rings: eightRings(1), hint: 'Clockwise round the right pole first.' },
        ],
        medals: { gold: 46000, silver: 68000 },
        crashTip: 'The poles are thin and easy to clip. Give them room: the rings are well clear of them.',
      },
      {
        id: '2-3',
        title: 'High and Low',
        mode: 'angle',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91023', 'Training Field')),
        briefing: {
          goal: 'The ring road again, but every ring at a different height.',
          why: 'Throttle and pitch work together: lean forward and you need more throttle to keep your height. Here you change both on purpose.',
          steps: [
            'Look ahead to see whether the next ring is high or low.',
            'Climb or sink before you get there, not in the ring.',
            'Ease off the throttle to come down: never drop it to nothing.',
          ],
          sticks: [{ stick: 'throttle', dir: 'both' }, { stick: 'pitch', dir: 'forward' }],
        },
        objectives: [
          { kind: 'rings', text: 'Fly the rings', rings: route(highLow, { r: 3 }), hint: 'High or low? Change height early.' },
        ],
        medals: { gold: 36000, silver: 56000 },
        crashTip: 'Dropping the throttle to nothing makes the quad fall like a stone. Ease it down instead.',
      },
      {
        id: '2-4',
        title: 'Slalom',
        mode: 'angle',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91024', 'Training Field', slalomPoles)),
        briefing: {
          goal: 'Weave up the line of poles, through the ring beside each one.',
          why: 'Quick, small direction changes, side to side. Roll does the work here and the nose stays pointing up the line.',
          steps: [
            'Fly up the line slowly at first.',
            'Roll left and right to step across each pole.',
            'Small inputs: the quad moves more than you expect.',
          ],
          sticks: [{ stick: 'roll', dir: 'both' }, { stick: 'pitch', dir: 'forward' }],
        },
        objectives: [
          { kind: 'rings', text: 'Weave the slalom', rings: slalomRings, hint: 'Roll side to side.' },
        ],
        medals: { gold: 22000, silver: 34000 },
        crashTip: 'Slower. A slalom flown at walking pace is still a slalom.',
      },
      {
        id: '2-5',
        title: 'First Lap',
        mode: 'angle',
        camera: 'fpv',
        world: race(careerTrack('meadow-wide')),
        laps: 1,
        briefing: {
          goal: 'One lap of a real race track, through every gate, against a generous clock.',
          why: 'Gates are what racing is made of. These are wide ones; the narrow ones come later, in Acro.',
          steps: [
            'Take off from the pads and fly through the first gate.',
            'The lit gate is next, and the line on the grass shows the way.',
            'Back through the first gate to finish the lap.',
          ],
          sticks: [{ stick: 'pitch', dir: 'forward' }, { stick: 'yaw', dir: 'both' }, { stick: 'roll', dir: 'both' }],
        },
        objectives: [
          { kind: 'gates', text: 'Fly one lap', laps: 1, hint: 'Through the lit gate.' },
        ],
        medals: { gold: 30000, silver: 50000 },
        crashTip: 'Aim for the middle of the gate and slow down before it. Through slowly beats into it quickly.',
      },
    ],
  },

  {
    id: 'c3',
    title: 'Switching to Acro',
    blurb: 'The mode every racer and freestyler flies. No self levelling: the quad does exactly what you tell it, and keeps doing it.',
    mode: 'acro',
    lessons: [
      {
        id: '3-1',
        title: 'No More Self Levelling',
        mode: 'acro',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91031', 'Training Field')),
        briefing: {
          goal: 'Stay in the air inside the big box for twenty seconds, in Acro.',
          why: 'In Acro, pitch and roll set how fast the quad rotates, not how far it leans. Let go and it holds whatever angle it is at. It feels loose for a while, and then it feels like freedom.',
          steps: [
            'Take off with a little forward lean, never straight up from flat.',
            'Tap {tilt} and centre it: a tap is a small tilt that stays.',
            'Tap the other way to undo it. Small and often.',
          ],
          sticks: [{ stick: 'pitch', dir: 'tap' }, { stick: 'roll', dir: 'tap' }, { stick: 'throttle', dir: 'hold' }],
          note: 'Everything from here on is flown in Acro.',
        },
        objectives: [
          { kind: 'takeoff', text: 'Take off', hint: 'A little throttle and a little forward tilt.' },
          {
            kind: 'hold', text: 'Fly 20 s inside the box', seconds: 20,
            zone: { kind: 'box', at: [80, 62, 8], size: [44, 56, 14] },
            hint: 'Tap and centre. The quad keeps the angle you leave it at.',
          },
        ],
        medals: { gold: 25000, silver: 32000 },
        crashTip: 'In Acro, letting go does not level the quad. Tap the stick the other way to bring it back level.',
      },
      {
        id: '3-2',
        title: 'Hold the Angle',
        mode: 'acro',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91032', 'Training Field')),
        briefing: {
          goal: 'Cross the field through six rings in a straight line, then cruise nose down for four seconds.',
          why: 'Fast flight in Acro is a held angle: tilt forward, centre the stick, and the quad keeps going. Throttle decides whether you climb or sink.',
          steps: [
            'Tilt forward to about twenty degrees and centre {pitch}.',
            'Keep your height with throttle, not with pitch.',
            'After the rings, hold a nose down cruise.',
          ],
          sticks: [{ stick: 'pitch', dir: 'tap' }, { stick: 'throttle', dir: 'hold' }],
        },
        objectives: [
          {
            kind: 'rings', text: 'Fly the line of rings',
            rings: route([[80, 40, 3], [80, 52, 3], [80, 64, 3], [80, 76, 3], [80, 88, 3], [80, 100, 3]]),
            hint: 'Tilt, centre, and let it run.',
          },
          {
            kind: 'attitude', text: 'Cruise nose down for 4 s', pose: 'noseDown', band: [12, 45], seconds: 4,
            minHeight: 2, minSpeed: 5, accumulate: true,
            hint: 'Hold 15 to 40 degrees of forward tilt while flying.',
          },
        ],
        medals: { gold: 22000, silver: 36000 },
        crashTip: 'Too steep with too little throttle sinks you into the grass. Add throttle as you tilt.',
      },
      {
        id: '3-3',
        title: 'Throttle Is Height',
        mode: 'acro',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91033', 'Training Field')),
        briefing: {
          goal: 'Up the field and back, through every ring, all at the same height.',
          why: 'Level flight in Acro is a balance of tilt and throttle. Here you find the throttle that holds a height at speed.',
          steps: [
            'Fly up the left line at four metres.',
            'Turn round at the top with yaw and roll together.',
            'Come back down the right line at the same height.',
          ],
          sticks: [{ stick: 'throttle', dir: 'hold' }, { stick: 'pitch', dir: 'tap' }, { stick: 'yaw', dir: 'both' }],
        },
        objectives: [
          {
            kind: 'rings', text: 'Up and back, level',
            rings: route([[70, 46, 4], [70, 66, 4], [70, 86, 4], [70, 106, 4], [80, 124, 4], [90, 106, 4], [90, 86, 4], [90, 66, 4], [90, 46, 4]]),
            hint: 'Same height for every ring.',
          },
        ],
        medals: { gold: 28000, silver: 42000 },
        crashTip: 'When you turn, you need a little more throttle to keep your height.',
      },
      {
        id: '3-4',
        title: 'Banked Turns',
        mode: 'acro',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91034', 'Training Field', pylon)),
        briefing: {
          goal: 'Circle the pylon twice, between seven and sixteen metres from it.',
          why: 'A coordinated turn is roll and yaw together, with a little pitch to hold it in. It is how every gate after this one is reached.',
          steps: [
            'Fly towards the pylon and pass it on your left.',
            'Roll left, add left yaw, and pull back a little to keep turning.',
            'Keep the pylon in the left of the picture all the way round.',
          ],
          sticks: [{ stick: 'roll', dir: 'left' }, { stick: 'yaw', dir: 'left' }, { stick: 'pitch', dir: 'back' }],
        },
        objectives: [
          {
            kind: 'orbit', text: 'Two circles round the pylon', center: [80, 86], rMin: 7, rMax: 16, turns: 2, minHeight: 2,
            hint: 'Roll and yaw together, the same way.',
          },
        ],
        medals: { gold: 26000, silver: 40000 },
        crashTip: 'The pylon is big and its arms reach out. Keep at least seven metres from its middle.',
      },
      {
        id: '3-5',
        title: 'Acro Eight',
        mode: 'acro',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91035', 'Training Field', eightPoles)),
        briefing: {
          goal: 'The figure eight again, two laps, in Acro.',
          why: 'The same line you flew in Angle mode, flown the way a racer flies it. Notice how much more the quad will do.',
          steps: [
            'Bank into each turn and hold it with a little pull.',
            'Level out with roll as you cross the middle.',
            'Smooth beats fast. Fast comes from smooth.',
          ],
          sticks: [{ stick: 'roll', dir: 'both' }, { stick: 'yaw', dir: 'both' }, { stick: 'pitch', dir: 'back' }],
        },
        objectives: [
          { kind: 'rings', text: 'Two laps of the eight', rings: eightRings(2), hint: 'Clockwise round the right pole first.' },
        ],
        medals: { gold: 52000, silver: 78000 },
        crashTip: 'Roll back to level as you cross the middle, or the quad keeps turning into the other pole.',
      },
    ],
  },

  {
    id: 'c4',
    title: 'Big Gaps',
    blurb: 'Containers, a footbridge, a billboard and a building with an arcade: through the gaps, wide ones first.',
    mode: 'acro',
    lessons: [
      {
        id: '4-1',
        title: 'The Wide Gap',
        mode: 'acro',
        camera: 'fpv',
        world: built(gapSchool()),
        briefing: {
          goal: 'Through the eight metre gap between the container stacks, then turn round and through it again.',
          why: 'A gap is a gate somebody forgot to paint. Look at the space, not at the walls: the quad goes where you look.',
          steps: [
            'Line up from a long way back, level and steady.',
            'Look at the middle of the gap, not at the containers.',
            'Through, turn round, and through again.',
          ],
          sticks: [{ stick: 'pitch', dir: 'tap' }, { stick: 'roll', dir: 'tap' }, { stick: 'yaw', dir: 'both' }],
        },
        objectives: [
          { kind: 'gap', text: 'Through the wide gap twice', names: ['WIDE GAP'], count: 2, hint: 'Look at the gap, not the walls.' },
        ],
        medals: { gold: 16000, silver: 28000 },
        crashTip: 'Line up earlier. A gap flown straight is twice as wide as one flown at an angle.',
      },
      {
        id: '4-2',
        title: 'Low Gaps',
        mode: 'acro',
        camera: 'fpv',
        world: built(gapSchool()),
        briefing: {
          goal: 'Under the footbridge, then under the billboard.',
          why: 'Low gaps are about height as much as line. Settle low early, then fly flat.',
          steps: [
            'Come down to two metres well before the bridge.',
            'Fly flat and steady through.',
            'The billboard is to the right of the bridge, between its legs.',
          ],
          sticks: [{ stick: 'throttle', dir: 'hold' }, { stick: 'pitch', dir: 'tap' }],
        },
        objectives: [
          { kind: 'gap', text: 'Under the bridge', names: ['UNDER THE BRIDGE'], hint: 'Two metres up, flat.' },
          { kind: 'gap', text: 'Under the billboard', names: ['BILLBOARD GAP'], hint: 'Between its legs, low.' },
        ],
        medals: { gold: 18000, silver: 32000 },
        crashTip: 'Settle at the height of the gap before you reach it, not in it.',
      },
      {
        id: '4-3',
        title: 'Narrowing',
        mode: 'acro',
        camera: 'fpv',
        world: built(gapSchool()),
        briefing: {
          goal: 'Up the line of container gaps in order: eight metres, six, then four.',
          why: 'Each gap is narrower than the last, so each asks for a straighter line. By the four metre gap you will be flying it on purpose.',
          steps: [
            'Fly up the middle of the plot.',
            'Under the bridge on the way: it is between the gaps.',
            'Each gap a little slower and a little straighter.',
          ],
          sticks: [{ stick: 'roll', dir: 'tap' }, { stick: 'pitch', dir: 'tap' }],
        },
        objectives: [
          {
            kind: 'gap', text: 'Wide, six, four', names: ['WIDE GAP', 'SIX METRE GAP', 'FOUR METRE GAP'], ordered: true,
            hint: 'One line up the middle.',
          },
        ],
        medals: { gold: 18000, silver: 30000 },
        crashTip: 'Slow down for the narrow ones. The line matters more than the speed.',
      },
      {
        id: '4-4',
        title: 'Through the Building',
        mode: 'acro',
        camera: 'fpv',
        world: built(gapSchool()),
        briefing: {
          goal: 'Through the arcade under the office, the building to the west.',
          why: 'A gap with a roof feels much smaller than it is. Trust the line you set up outside.',
          steps: [
            'Fly west towards the office and drop to two metres.',
            'Line up with the arcade from at least twenty metres out.',
            'Through it in one smooth line, no corrections inside.',
          ],
          sticks: [{ stick: 'yaw', dir: 'left' }, { stick: 'throttle', dir: 'hold' }],
        },
        objectives: [
          { kind: 'gap', text: 'Through the arcade', names: ['THE ARCADE'], hint: 'Line up from far out.' },
        ],
        medals: { gold: 14000, silver: 26000 },
        crashTip: 'Set the line outside. Inside the arcade, hands still.',
      },
      {
        id: '4-5',
        title: 'Gap Line',
        mode: 'acro',
        camera: 'fpv',
        world: built(gapSchool()),
        briefing: {
          goal: 'Every gap at Gap School in one run, in order, against the clock.',
          why: 'A line is gaps strung together so that each sets up the next. Plan the whole thing before you take off.',
          steps: [
            'The wide gap, under the bridge, the six and the four.',
            'Round to the right and under the billboard.',
            'Across to the left and through the arcade.',
          ],
          sticks: [{ stick: 'roll', dir: 'both' }, { stick: 'yaw', dir: 'both' }, { stick: 'pitch', dir: 'tap' }],
        },
        objectives: [
          {
            kind: 'gap', text: 'The whole line',
            names: ['WIDE GAP', 'UNDER THE BRIDGE', 'SIX METRE GAP', 'FOUR METRE GAP', 'BILLBOARD GAP', 'THE ARCADE'], ordered: true,
            hint: 'The next gap is named at the top.',
          },
        ],
        medals: { gold: 46000, silver: 70000 },
        crashTip: 'Fly the line slowly once. Then fly it again a little faster.',
      },
    ],
  },

  {
    id: 'c5',
    title: 'Flips and Rolls',
    blurb: 'Rotations: a flip, a roll, both ways and doubles. Height first, then commit.',
    mode: 'acro',
    lessons: [
      {
        id: '5-1',
        title: 'First Flip',
        mode: 'acro',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91051', 'Training Field')),
        briefing: {
          goal: 'One full flip, nose over, above five metres, and fly away from it.',
          why: 'A flip is commitment. Punch up for height, cut the throttle, flip, and catch it with throttle when the horizon comes back.',
          steps: [
            'Climb to at least eight metres.',
            'Throttle low, then {pitch} fully forward and hold it.',
            'Let go as the horizon comes round, and add throttle to catch it.',
          ],
          sticks: [{ stick: 'throttle', dir: 'up' }, { stick: 'pitch', dir: 'full' }, { stick: 'throttle', dir: 'down' }],
        },
        objectives: [
          { kind: 'takeoff', text: 'Take off and climb', minHeight: 3, hint: 'Get some height first.' },
          {
            kind: 'trick', text: 'A full flip', minHeight: 4, need: [{ axis: 'pitch', minTurns: 1 }],
            hint: 'High, throttle low, {pitch} fully forward.',
          },
        ],
        medals: { gold: 12000, silver: 24000 },
        crashTip: 'More height, and catch it with throttle as soon as the horizon is level again.',
      },
      {
        id: '5-2',
        title: 'First Roll',
        mode: 'acro',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91052', 'Training Field')),
        briefing: {
          goal: 'One full roll, either way, above five metres.',
          why: 'A roll is the same commitment on the other axis. Moving forward while you roll keeps the quad from sinking.',
          steps: [
            'Fly forward at eight metres or more.',
            'Throttle low, {roll} fully to one side and hold.',
            'Centre it as you come level, and throttle up.',
          ],
          sticks: [{ stick: 'roll', dir: 'full' }, { stick: 'throttle', dir: 'down' }],
        },
        objectives: [
          { kind: 'takeoff', text: 'Take off and climb', minHeight: 3, hint: 'Height first.' },
          {
            kind: 'trick', text: 'A full roll', minHeight: 4, need: [{ axis: 'roll', minTurns: 1 }],
            hint: '{Roll} fully sideways, then catch it.',
          },
        ],
        medals: { gold: 12000, silver: 24000 },
        crashTip: 'Roll with some forward speed and catch it with throttle the moment you are level.',
      },
      {
        id: '5-3',
        title: 'Back Flip',
        mode: 'acro',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91053', 'Training Field')),
        briefing: {
          goal: 'A full flip backwards, nose up and over.',
          why: 'The same flip the other way round. It feels different because the ground disappears behind you instead of in front.',
          steps: [
            'Climb to eight metres and slow down.',
            'Throttle low, {pitch} fully back and hold.',
            'Catch it with throttle as the horizon comes back.',
          ],
          sticks: [{ stick: 'pitch', dir: 'back' }, { stick: 'throttle', dir: 'down' }],
        },
        objectives: [
          { kind: 'takeoff', text: 'Take off and climb', minHeight: 3, hint: 'Height first.' },
          {
            kind: 'trick', text: 'A back flip', minHeight: 4, need: [{ axis: 'pitch', minTurns: 1, dir: 'back' }],
            hint: '{Pitch} fully back.',
          },
        ],
        medals: { gold: 12000, silver: 24000 },
        crashTip: 'A back flip loses height too. Start higher and catch it early.',
      },
      {
        id: '5-4',
        title: 'Both Ways',
        mode: 'acro',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91054', 'Training Field')),
        briefing: {
          goal: 'A roll to the left and a roll to the right.',
          why: 'Everyone has a good side. This lesson is about the other one.',
          steps: [
            'One roll to your easy side.',
            'Fly level, climb back up.',
            'One roll to the other side.',
          ],
          sticks: [{ stick: 'roll', dir: 'left' }, { stick: 'roll', dir: 'right' }],
        },
        objectives: [
          { kind: 'takeoff', text: 'Take off and climb', minHeight: 3, hint: 'Height first.' },
          {
            kind: 'trick', text: 'A roll each way', minHeight: 3,
            need: [{ axis: 'roll', minTurns: 1, dir: 'left' }, { axis: 'roll', minTurns: 1, dir: 'right' }],
            hint: 'Left, then right, or the other way round.',
          },
        ],
        medals: { gold: 18000, silver: 32000 },
        crashTip: 'Give yourself height again between the two rolls.',
      },
      {
        id: '5-5',
        title: 'Doubles',
        mode: 'acro',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91055', 'Training Field')),
        briefing: {
          goal: 'Two full turns without stopping: a double flip or a double roll.',
          why: 'Twice round needs twice the height and the nerve to hold the stick for longer than feels right.',
          steps: [
            'Climb to twelve metres.',
            'Throttle low, full stick, and keep holding through the first turn.',
            'Let go on the second, and catch it.',
          ],
          sticks: [{ stick: 'pitch', dir: 'full' }, { stick: 'roll', dir: 'full' }],
        },
        objectives: [
          { kind: 'takeoff', text: 'Take off and climb', minHeight: 4, hint: 'Lots of height.' },
          {
            kind: 'trick', text: 'A double flip or roll', minHeight: 5,
            need: [{ axes: ['pitch', 'roll'], minTurns: 2 }],
            hint: 'Hold the stick through two turns.',
          },
        ],
        medals: { gold: 14000, silver: 26000 },
        crashTip: 'Start higher. A double loses more height than you think.',
      },
    ],
  },

  {
    id: 'c6',
    title: 'Segmented Flips and Rolls',
    blurb: 'Stopping a rotation where you mean to: knife edge, inverted, and rotations in steps.',
    mode: 'acro',
    lessons: [
      {
        id: '6-1',
        title: 'Knife Edge',
        mode: 'acro',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91061', 'Training Field')),
        briefing: {
          goal: 'Roll a quarter turn onto your side, hold it for a second, and roll back level.',
          why: 'Stopping a rotation exactly where you want it is the skill under every freestyle trick. A knife edge is the first stop.',
          steps: [
            'Fly forward with some height and speed.',
            'A quarter roll, then centre the stick to stop on your side.',
            'Hold it, then roll back to level.',
          ],
          sticks: [{ stick: 'roll', dir: 'tap' }, { stick: 'throttle', dir: 'hold' }],
        },
        objectives: [
          { kind: 'takeoff', text: 'Take off and climb', minHeight: 3, hint: 'Height and some speed.' },
          { kind: 'attitude', text: 'Hold knife edge for 1 s', pose: 'knife', seconds: 1, minHeight: 2.5, hint: 'A quarter roll, then centre.' },
          { kind: 'level', text: 'Back to level', seconds: 0.4, hint: 'Roll back the way you came.' },
        ],
        medals: { gold: 13000, silver: 22000 },
        crashTip: 'On your side the quad has no lift and falls. Keep it short, and keep the speed up.',
      },
      {
        id: '6-2',
        title: 'Inverted Hang',
        mode: 'acro',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91062', 'Training Field')),
        briefing: {
          goal: 'Half a roll to upside down, hold it for a second, and half a roll back.',
          why: 'Upside down, throttle pushes you at the ground. Hang there with the throttle low, then come back.',
          steps: [
            'Climb high: at least ten metres.',
            'Half roll and stop, throttle low.',
            'Half roll back and catch it with throttle.',
          ],
          sticks: [{ stick: 'roll', dir: 'tap' }, { stick: 'throttle', dir: 'down' }],
        },
        objectives: [
          { kind: 'takeoff', text: 'Take off and climb', minHeight: 4, hint: 'High.' },
          { kind: 'attitude', text: 'Hang inverted for 1 s', pose: 'inverted', seconds: 1, minHeight: 3, hint: 'Half a roll, throttle low.' },
          { kind: 'level', text: 'Back to level', seconds: 0.4, hint: 'Half roll back, then throttle.' },
        ],
        medals: { gold: 12000, silver: 24000 },
        crashTip: 'Throttle low while you are upside down, or it drives you into the ground.',
      },
      {
        id: '6-3',
        title: 'Segmented Roll',
        mode: 'acro',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91063', 'Training Field')),
        briefing: {
          goal: 'A roll in two halves: half a roll, a clear stop upside down, then the other half the same way.',
          why: 'A rotation in segments shows you have the stick, not the other way round. Judges call it a segmented roll.',
          steps: [
            'Half a roll and stop upside down.',
            'Hold it there for a beat: count "one".',
            'The second half, the same direction.',
          ],
          sticks: [{ stick: 'roll', dir: 'tap' }],
        },
        objectives: [
          { kind: 'takeoff', text: 'Take off and climb', minHeight: 4, hint: 'High.' },
          {
            kind: 'segmented', text: 'A segmented roll', axis: 'roll', mode: 'same', minHeight: 3,
            hint: 'Half, stop, half, same way.',
          },
        ],
        medals: { gold: 14000, silver: 28000 },
        crashTip: 'The stop is upside down: throttle low there, and catch it after the second half.',
      },
      {
        id: '6-4',
        title: 'Segmented Flip',
        mode: 'acro',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91064', 'Training Field')),
        briefing: {
          goal: 'A flip in two halves: half a flip, a clear stop upside down, then the other half the same way.',
          why: 'The same discipline on the pitch axis, where the stop is harder because the nose points at the ground.',
          steps: [
            'Climb high, fifteen metres or more, then half a flip forward and stop, upside down.',
            'Hold a beat.',
            'The second half, the same direction, then catch it.',
          ],
          sticks: [{ stick: 'pitch', dir: 'tap' }],
        },
        objectives: [
          { kind: 'takeoff', text: 'Take off and climb', minHeight: 4, hint: 'High.' },
          {
            kind: 'segmented', text: 'A segmented flip', axis: 'pitch', mode: 'same', minHeight: 3,
            hint: 'Half, stop, half, same way.',
          },
        ],
        medals: { gold: 14000, silver: 28000 },
        crashTip: 'More height. A segmented flip spends a long time pointing at the ground.',
      },
      {
        id: '6-5',
        title: 'Invert Rewind',
        mode: 'acro',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91065', 'Training Field')),
        briefing: {
          goal: 'Half a roll to upside down, a stop, and half a roll back the way you came.',
          why: 'A rewind undoes a rotation: the same axis, the other direction. It is the first trick that looks like a trick.',
          steps: [
            'Half a roll and stop upside down.',
            'Hold a beat.',
            'Half a roll back the way you came.',
          ],
          sticks: [{ stick: 'roll', dir: 'both' }],
        },
        objectives: [
          { kind: 'takeoff', text: 'Take off and climb', minHeight: 4, hint: 'High.' },
          { kind: 'segmented', text: 'An invert rewind', axis: 'roll', mode: 'back', minHeight: 3, hint: 'Half, stop, half back.' },
        ],
        medals: { gold: 14000, silver: 28000 },
        crashTip: 'Same as the segmented roll, but the second half goes back the other way.',
      },
    ],
  },

  {
    id: 'c7',
    title: 'Gates',
    blurb: 'Five foot gates, the size racers fly. One gate both ways, a weave, a dive from above, a stack and a hairpin.',
    mode: 'acro',
    lessons: [
      {
        id: '7-1',
        title: 'Out and Back',
        mode: 'acro',
        camera: 'fpv',
        world: race(careerTrack('one-gate')),
        laps: 2,
        briefing: {
          goal: 'Out through the gate, round the far flag, back through the same gate the other way, round the flag behind the pads. Twice.',
          why: 'A five foot gate is half the width of the ones in chapter two. Flying one both ways is how you learn to line up from either side.',
          steps: [
            'Line up from the pads and go straight through.',
            'Round the far flag on its green side and come back.',
            'Through the gate again the other way, then round the flag behind you.',
          ],
          sticks: [{ stick: 'pitch', dir: 'tap' }, { stick: 'roll', dir: 'both' }, { stick: 'yaw', dir: 'both' }],
        },
        objectives: [
          { kind: 'gates', text: 'Two laps, both ways', laps: 2, hint: 'Through the lit gate.' },
        ],
        medals: { gold: 26000, silver: 40000 },
        crashTip: 'Slow down for the gate and speed up after it. Through slowly beats into it quickly.',
      },
      {
        id: '7-2',
        title: 'Weave',
        mode: 'acro',
        camera: 'fpv',
        world: race(careerTrack('gate-slalom')),
        laps: 1,
        briefing: {
          goal: 'Five gates up the field, each one to the side of the last, then round the flag and back to the first.',
          why: 'Gates are rarely in a straight line. Here every gate is a small turn, and each turn sets up the next one.',
          steps: [
            'Through the first gate, then roll gently towards the next.',
            'Look at the next gate as soon as you are through this one.',
            'Round the flag at the end and fly back to the first gate.',
          ],
          sticks: [{ stick: 'roll', dir: 'both' }, { stick: 'yaw', dir: 'both' }, { stick: 'pitch', dir: 'tap' }],
        },
        objectives: [
          { kind: 'gates', text: 'One lap of the weave', laps: 1, hint: 'Look at the next gate, not this one.' },
        ],
        medals: { gold: 20000, silver: 30000 },
        crashTip: 'Wider lines: start each turn before the gate, not after it.',
      },
      {
        id: '7-3',
        title: 'Dive In',
        mode: 'acro',
        camera: 'fpv',
        world: race(careerTrack('dive-in')),
        laps: 1,
        briefing: {
          goal: 'Through the first gate, up and over, down through the dive gate from above, then round and through the last gate.',
          why: 'A dive gate is flown downwards, so the throttle is low and the quad is pointing at the ground. It is the first gate that needs the throttle as much as the sticks.',
          steps: [
            'Climb as you leave the first gate: the dive gate is above head height.',
            'Over the top, nose down, throttle low, and drop through it.',
            'Catch it with throttle underneath and turn for the last gate.',
          ],
          sticks: [{ stick: 'throttle', dir: 'down' }, { stick: 'pitch', dir: 'forward' }, { stick: 'throttle', dir: 'up' }],
        },
        objectives: [
          { kind: 'gates', text: 'One lap with the dive', laps: 1, hint: 'Over the dive gate, then down through it.' },
        ],
        medals: { gold: 16000, silver: 26000 },
        crashTip: 'Catch the dive earlier: throttle up as soon as you are through.',
      },
      {
        id: '7-4',
        title: 'Double Up',
        mode: 'acro',
        camera: 'fpv',
        world: race(careerTrack('double-up')),
        laps: 1,
        briefing: {
          goal: 'Through the top of the double stack, round the flag, back round and through the bottom.',
          why: 'Two holes, one above the other, is a gate that asks for a height as well as a line. Height is throttle.',
          steps: [
            'Climb to the top hole before you reach it.',
            'Round the flag, then come back low.',
            'Through the bottom hole flat and steady.',
          ],
          sticks: [{ stick: 'throttle', dir: 'both' }, { stick: 'roll', dir: 'both' }, { stick: 'yaw', dir: 'both' }],
        },
        objectives: [
          { kind: 'gates', text: 'Top, then bottom', laps: 1, hint: 'The lit hole is next.' },
        ],
        medals: { gold: 20000, silver: 32000 },
        crashTip: 'Settle at the hole\'s height before you get there, not in it.',
      },
      {
        id: '7-5',
        title: 'Hairpin',
        mode: 'acro',
        camera: 'fpv',
        world: race(careerTrack('hairpin')),
        laps: 2,
        briefing: {
          goal: 'Two laps of four gates with a hairpin at each end.',
          why: 'A hairpin is a half circle at speed: bank hard, pull through, and come out lined up. It is most of what racing is.',
          steps: [
            'Brake before the hairpin by pulling back a little.',
            'Bank and yaw together, and pull through the turn.',
            'Roll level as the next gate comes into view.',
          ],
          sticks: [{ stick: 'roll', dir: 'both' }, { stick: 'yaw', dir: 'both' }, { stick: 'pitch', dir: 'back' }],
        },
        objectives: [
          { kind: 'gates', text: 'Two laps', laps: 2, hint: 'Brake, bank, pull, level.' },
        ],
        medals: { gold: 22000, silver: 34000 },
        crashTip: 'Slower into the hairpin. Speed comes back out of it.',
      },
    ],
  },

  {
    id: 'c8',
    title: 'Racing',
    blurb: 'The five official tracks, three laps each, against the clock. Every lap you fly on them also counts on Steam.',
    mode: 'acro',
    lessons: [
      {
        id: '8-1',
        title: 'Meadow Sprint',
        mode: 'acro',
        camera: 'fpv',
        world: race(careerTrack('meadow-sprint')),
        laps: 3,
        briefing: {
          goal: 'Three laps of Meadow Sprint: the oval from chapter two, in five foot gates.',
          why: 'A race is laps, and laps are the same corners flown again and again. Fly the first lap to learn it and the next two to go faster.',
          steps: [
            'Lap one: smooth and clean, find the line.',
            'Lap two: the same line, a little more throttle.',
            'Lap three: hold it together to the end.',
          ],
          sticks: [{ stick: 'throttle', dir: 'hold' }, { stick: 'roll', dir: 'both' }, { stick: 'yaw', dir: 'both' }],
        },
        objectives: [
          { kind: 'gates', text: 'Three laps', laps: 3, hint: 'Smooth first, then fast.' },
        ],
        medals: raceMedals('meadow-sprint', 3),
        crashTip: 'A crash costs more time than a slow corner. Back off a little.',
      },
      {
        id: '8-2',
        title: 'River Bend',
        mode: 'acro',
        camera: 'fpv',
        world: race(careerTrack('river-bend')),
        laps: 3,
        briefing: {
          goal: 'Three laps of River Bend, an S out and a sweep back, eight gates.',
          why: 'An S bend is two turns the opposite way with no straight between. The roll back from one is the start of the next.',
          steps: [
            'Out along the S, rolling from one turn into the next.',
            'Back down the long sweep with throttle.',
            'Three laps, the same line each time.',
          ],
          sticks: [{ stick: 'roll', dir: 'both' }, { stick: 'yaw', dir: 'both' }, { stick: 'throttle', dir: 'hold' }],
        },
        objectives: [
          { kind: 'gates', text: 'Three laps', laps: 3, hint: 'Roll from one turn into the next.' },
        ],
        medals: raceMedals('river-bend', 3),
        crashTip: 'In the S, level out for a moment between the two turns.',
      },
      {
        id: '8-3',
        title: 'Stack and Dive',
        mode: 'acro',
        camera: 'fpv',
        world: race(careerTrack('stack-and-dive')),
        laps: 3,
        briefing: {
          goal: 'Three laps with a dive gate in the far corner and a double stack on the way back.',
          why: 'Everything from the gates chapter in one lap: height changes, a dive and a stack, at race pace.',
          steps: [
            'Climb before the far corner for the dive.',
            'Catch the dive low and stay low for the bottom of the stack.',
            'Round the last corner and back through the start.',
          ],
          sticks: [{ stick: 'throttle', dir: 'both' }, { stick: 'pitch', dir: 'forward' }, { stick: 'roll', dir: 'both' }],
        },
        objectives: [
          { kind: 'gates', text: 'Three laps', laps: 3, hint: 'Climb early for the dive.' },
        ],
        medals: raceMedals('stack-and-dive', 3),
        crashTip: 'The dive comes up fast. Climb and slow down before it.',
      },
      {
        id: '8-4',
        title: 'Switchback',
        mode: 'acro',
        camera: 'fpv',
        world: race(careerTrack('switchback')),
        laps: 3,
        briefing: {
          goal: 'Three laps of Switchback, ten gates and a turn at every one.',
          why: 'A technical track rewards the pilot who is never late for a corner. Look two gates ahead.',
          steps: [
            'Fly the first lap slowly to learn the order.',
            'Start every turn before the gate.',
            'Keep your height: no climbing, no sinking.',
          ],
          sticks: [{ stick: 'roll', dir: 'both' }, { stick: 'yaw', dir: 'both' }, { stick: 'pitch', dir: 'tap' }],
        },
        objectives: [
          { kind: 'gates', text: 'Three laps', laps: 3, hint: 'Look two gates ahead.' },
        ],
        medals: raceMedals('switchback', 3),
        crashTip: 'Late for a corner means wide for the next. Turn earlier.',
      },
      {
        id: '8-5',
        title: 'Grand Prix',
        mode: 'acro',
        camera: 'fpv',
        world: race(careerTrack('grand-prix')),
        laps: 3,
        briefing: {
          goal: 'Three laps of the Grand Prix: the longest official track, on the big field.',
          why: 'Long straights reward throttle and long sweepers reward a smooth line. This is the track the leaderboards are fought over.',
          steps: [
            'Full throttle on the straights, but lift before the sweepers.',
            'Hold one smooth arc through each sweeper.',
            'Three laps without a mistake.',
          ],
          sticks: [{ stick: 'throttle', dir: 'up' }, { stick: 'roll', dir: 'both' }, { stick: 'yaw', dir: 'both' }],
        },
        objectives: [
          { kind: 'gates', text: 'Three laps', laps: 3, hint: 'Throttle on the straights.' },
        ],
        medals: raceMedals('grand-prix', 3),
        crashTip: 'Lift off the throttle before the sweepers, not in them.',
      },
    ],
  },

  {
    id: 'c9',
    title: 'Freestyle',
    blurb: 'Hibari Yard, a whole freestyle map: its named gaps, the tricks that are flown round objects, and a scored run.',
    mode: 'acro',
    lessons: [
      {
        id: '9-1',
        /* Steam edition: the freestyle five inch, pack on top, camera at 20. */
        airframe: '5inchfs',
        title: 'Hibari Yard',
        mode: 'acro',
        camera: 'fpv',
        world: built(hibariYard()),
        briefing: {
          goal: 'Find your way round the yard: under the footbridge on the east lane and under the billboard by the containers.',
          why: 'A freestyle map has no gates: the gaps are where you find them. Every named gap is counted the moment you are through it.',
          steps: [
            'The billboard is east of the pads, beyond the containers.',
            'The footbridge crosses the lane on the far east side.',
            'Either order. The marker points at the nearest one left.',
          ],
          sticks: [{ stick: 'yaw', dir: 'both' }, { stick: 'pitch', dir: 'tap' }, { stick: 'throttle', dir: 'hold' }],
        },
        objectives: [
          { kind: 'gap', text: 'Billboard and footbridge', names: ['BILLBOARD GAP', 'FOOTBRIDGE'], hint: 'Follow the marker.' },
        ],
        medals: { gold: 30000, silver: 50000 },
        crashTip: 'Fly the yard slowly once. The gaps are wider than they look from far away.',
      },
      {
        id: '9-2',
        /* Steam edition: the freestyle five inch, pack on top, camera at 20. */
        airframe: '5inchfs',
        title: 'Powerloop',
        mode: 'acro',
        camera: 'fpv',
        world: built(hibariYard()),
        briefing: {
          goal: 'A Powerloop: fly at something, up and over it backwards in a full loop, and away underneath the way you came in.',
          why: 'The Powerloop is the trick every freestyle pilot learns first, because it is a flip that goes somewhere. It is judged round an object, so it needs one.',
          steps: [
            'Fly towards a container stack or the bando wall, low.',
            'Pull back hard with throttle up, over the top of it.',
            'Throttle down over the top, then catch it on the way down the far side.',
          ],
          sticks: [{ stick: 'pitch', dir: 'back' }, { stick: 'throttle', dir: 'up' }, { stick: 'throttle', dir: 'down' }],
          note: 'Tricks are named by the game as it watches you fly. If it names something else, the coach will say what it saw.',
        },
        objectives: [
          { kind: 'trick', text: 'Land a Powerloop', need: [{ names: ['Powerloop', 'Inverted 360 Powerloop'] }], hint: 'Pull up and over something solid.' },
        ],
        medals: { gold: 20000, silver: 40000 },
        crashTip: 'Start the loop further away from the object, and pull harder.',
      },
      {
        id: '9-3',
        /* Steam edition: the freestyle five inch, pack on top, camera at 20. */
        airframe: '5inchfs',
        title: 'Split-S',
        mode: 'acro',
        camera: 'fpv',
        world: built(hibariYard()),
        briefing: {
          goal: 'A Split-S: over an object, half a roll to upside down, then pull through half a loop and out underneath, going back the way you came.',
          why: 'The Split-S turns you round and drops you in one move. Over a wall or a roof edge it is a trick; on a race track it is how you take a tight turn downwards.',
          steps: [
            'Fly over something, a roof edge or the billboard, with height.',
            'Half roll to upside down as you pass over it.',
            'Pull back through half a loop and fly out underneath.',
          ],
          sticks: [{ stick: 'roll', dir: 'tap' }, { stick: 'pitch', dir: 'back' }, { stick: 'throttle', dir: 'down' }],
        },
        objectives: [
          { kind: 'trick', text: 'Land a Split-S', need: [{ names: ['Split-S'] }], hint: 'Over it, half roll, pull through.' },
        ],
        medals: { gold: 20000, silver: 40000 },
        crashTip: 'More height above the object before you roll.',
      },
      {
        id: '9-4',
        /* Steam edition: the freestyle five inch, pack on top, camera at 20. */
        airframe: '5inchfs',
        title: 'Matty Flip',
        mode: 'acro',
        camera: 'fpv',
        world: built(hibariYard()),
        briefing: {
          goal: 'A Matty Flip: fly over an object, flip forward half a turn, and fly back out underneath it.',
          why: 'The Matty Flip is the Powerloop turned round: over, then back under. The forward flip over the top is what makes it look effortless.',
          steps: [
            'Fly over the billboard or the footbridge, slowly.',
            'Push forward to flip half a turn as you pass over it.',
            'Throttle to fly back out underneath, the way you came.',
          ],
          sticks: [{ stick: 'pitch', dir: 'forward' }, { stick: 'throttle', dir: 'up' }],
        },
        objectives: [
          { kind: 'trick', text: 'Land a Matty Flip', need: [{ names: ['Matty Flip', 'Beginner Matty'] }], hint: 'Over, flip forward, back under.' },
        ],
        medals: { gold: 20000, silver: 40000 },
        crashTip: 'Slower over the top. A Matty Flip is flown at walking pace.',
      },
      {
        id: '9-5',
        /* Steam edition: the freestyle five inch, pack on top, camera at 20. */
        airframe: '5inchfs',
        title: 'Up High',
        mode: 'acro',
        camera: 'fpv',
        world: built(hibariYard()),
        briefing: {
          goal: 'The two high gaps: through the water tower\'s legs, and the crane gap over the office roof, under the jib.',
          why: 'High gaps are flown with nothing under you but air. The line is the same as low down; the nerve is not.',
          steps: [
            'Climb to the gap\'s height well before you reach it.',
            'Line up from far out, the same as any gap.',
            'Through and away. Do not look down.',
          ],
          sticks: [{ stick: 'throttle', dir: 'up' }, { stick: 'pitch', dir: 'tap' }, { stick: 'roll', dir: 'tap' }],
        },
        objectives: [
          { kind: 'gap', text: 'Water tower and crane gap', names: ['WATER TOWER', 'CRANE GAP'], hint: 'Climb first, then line up.' },
        ],
        medals: { gold: 36000, silver: 60000 },
        crashTip: 'Climb to the height first and slow down. The water tower\'s gap is narrow.',
      },
      {
        id: '9-6',
        /* Steam edition: the freestyle five inch, pack on top, camera at 20. */
        airframe: '5inchfs',
        title: 'Score Run',
        mode: 'acro',
        camera: 'fpv',
        world: built(hibariYard()),
        briefing: {
          goal: 'Ninety seconds, flown for points: gaps, close calls and tricks, linked into combos. Bank at least 1,500.',
          why: 'A freestyle run is judged by what you link together. One move after another, with no gap between, multiplies them all.',
          steps: [
            'Plan a line through two or three gaps close together.',
            'Add a trick between them, and skim close past walls.',
            'Keep moving: a combo is banked when it ends.',
          ],
          sticks: [{ stick: 'throttle', dir: 'hold' }, { stick: 'roll', dir: 'both' }, { stick: 'pitch', dir: 'both' }],
        },
        objectives: [
          { kind: 'score', text: 'Bank 1,500 points in 90 s', points: 1500, seconds: 90, hint: 'Link moves into combos.' },
        ],
        medals: { metric: 'score', gold: 6000, silver: 3500 },
        scoreTip: 'Link your lines: a gap, a trick and a close call in one combo pays more than the three apart.',
        crashTip: 'A crash loses the combo you were building. Fly within yourself.',
      },
    ],
  },

  {
    id: 'c10',
    title: 'Pro Licence',
    blurb: 'Four finals that put it all together. Pass them all and you are a pilot.',
    mode: 'acro',
    lessons: [
      {
        id: '10-1',
        title: 'Checkride',
        mode: 'acro',
        camera: 'fpv',
        world: built(trainingField('trk-c4a91101', 'Training Field')),
        failOn: { crash: true },
        briefing: {
          goal: 'The full check: the high and low rings, a flip, a roll, a knife edge, and a landing on the pad. One crash ends it.',
          why: 'A checkride is the skills you have, flown one after another, under a little pressure. Every one of them is a lesson you have already passed.',
          steps: [
            'The rings first, high and low, in order.',
            'Then a flip and a roll, any way round, with height.',
            'A knife edge for a second, then home to the pad and down gently.',
          ],
          sticks: [{ stick: 'pitch', dir: 'full' }, { stick: 'roll', dir: 'full' }, { stick: 'throttle', dir: 'down' }],
          note: 'No crashes. If you crash, the checkride starts again.',
        },
        objectives: [
          { kind: 'rings', text: 'The high and low rings', rings: route(highLow), hint: 'High or low? Change height early.' },
          { kind: 'trick', text: 'A flip and a roll', minHeight: 3, need: [{ axis: 'pitch', minTurns: 1 }, { axis: 'roll', minTurns: 1 }], hint: 'Climb first.' },
          { kind: 'attitude', text: 'Knife edge for 1 s', pose: 'knife', seconds: 1, minHeight: 2.5, hint: 'A quarter roll, then centre.' },
          {
            kind: 'land', text: 'Land on the pad', maxDescent: 2.2,
            pad: { at: [FIELD_SPAWN.x, FIELD_SPAWN.y], r: 2.5 },
            hint: 'Home, slow, and down gently.',
          },
        ],
        medals: { gold: 60000, silver: 95000 },
        crashTip: 'A checkride is flown within yourself. Slower, and finish it.',
      },
      {
        id: '10-2',
        title: 'Gap Final',
        mode: 'acro',
        camera: 'fpv',
        world: built(gapSchool()),
        briefing: {
          goal: 'Every gap at Gap School in order, as fast as you can, then land on the pad.',
          why: 'The gap line from chapter four, flown against a hard clock, and finished properly: on the pad, not in a heap.',
          steps: [
            'Wide, under the bridge, six and four.',
            'Round to the billboard, across to the arcade.',
            'Home to the pad and land.',
          ],
          sticks: [{ stick: 'roll', dir: 'both' }, { stick: 'yaw', dir: 'both' }, { stick: 'throttle', dir: 'down' }],
        },
        objectives: [
          {
            kind: 'gap', text: 'The whole line',
            names: ['WIDE GAP', 'UNDER THE BRIDGE', 'SIX METRE GAP', 'FOUR METRE GAP', 'BILLBOARD GAP', 'THE ARCADE'], ordered: true,
            hint: 'The next gap is named at the top.',
          },
          {
            kind: 'land', text: 'Land on the pad', maxDescent: 2.2,
            pad: { at: [GAP_SPAWN.x, GAP_SPAWN.y], r: 2.5 },
            hint: 'Home to the pad.',
          },
        ],
        medals: { gold: 56000, silver: 85000 },
        crashTip: 'The line is the same as chapter four. Fly it at that pace once, then push.',
      },
      {
        id: '10-3',
        /* Steam edition: the freestyle five inch, pack on top, camera at 20. */
        airframe: '5inchfs',
        title: 'Freestyle Final',
        mode: 'acro',
        camera: 'fpv',
        world: built(hibariYard()),
        briefing: {
          goal: 'In one run: a Powerloop, a Split-S, and the container tunnel.',
          why: 'Freestyle is tricks and lines in one flight. The container tunnel is the tightest gap in the yard: two metres wide.',
          steps: [
            'A Powerloop over anything solid.',
            'A Split-S off a roof edge or the billboard.',
            'Then line up from far out and fly the container tunnel.',
          ],
          sticks: [{ stick: 'pitch', dir: 'back' }, { stick: 'roll', dir: 'tap' }, { stick: 'throttle', dir: 'hold' }],
        },
        objectives: [
          { kind: 'trick', text: 'Land a Powerloop', need: [{ names: ['Powerloop', 'Inverted 360 Powerloop'] }], hint: 'Up and over something solid.' },
          { kind: 'trick', text: 'Land a Split-S', need: [{ names: ['Split-S'] }], hint: 'Over it, half roll, pull through.' },
          { kind: 'gap', text: 'The container tunnel', names: ['CONTAINER TUNNEL'], hint: 'Line up from twenty metres out.' },
        ],
        medals: { gold: 45000, silver: 80000 },
        crashTip: 'The tunnel is two metres wide. Slow and straight beats fast and sideways.',
      },
      {
        id: '10-4',
        title: 'Championship',
        mode: 'acro',
        camera: 'fpv',
        world: race(careerTrack('grand-prix')),
        laps: 5,
        briefing: {
          goal: 'Five laps of the Grand Prix. The last lesson in the career.',
          why: 'A championship is won by the pilot who is still fast on the last lap. Five laps is long enough to find out.',
          steps: [
            'A clean first lap. Nothing is won on it, a lot can be lost.',
            'Build to your pace over the next two.',
            'Hold it for the last two. Then you are licensed.',
          ],
          sticks: [{ stick: 'throttle', dir: 'up' }, { stick: 'roll', dir: 'both' }, { stick: 'yaw', dir: 'both' }],
        },
        objectives: [
          { kind: 'gates', text: 'Five laps', laps: 5, hint: 'Clean first, then fast.' },
        ],
        medals: raceMedals('grand-prix', 5),
        crashTip: 'Five laps is a long time. Leave a little in hand.',
      },
    ],
  },

  /*
   * The Rookie Licence: the trunk's last lesson on the skill tree
   * (./tree.js), and the one that opens both branches. One run of the
   * beginner chapters' skills in Acro, the ring road, a circle round the
   * pylon and the pad, with no crashes. Listed last so the numbered
   * chapters keep their numbers; the tree, not this list, is the order a
   * pilot meets it in.
   */
  {
    id: 'rk',
    title: 'Rookie Licence',
    blurb: 'One checkride of everything Learn to fly taught you, in Acro. Pass it and both ways open: race and freestyle.',
    mode: 'acro',
    lessons: [
      {
        id: 'rk-1',
        title: 'Rookie Licence',
        glyph: 'licence',
        mode: 'acro',
        camera: 'fpv',
        world: built(trainingField('trk-c4a910a1', 'Training Field', pylon)),
        failOn: { crash: true },
        briefing: {
          goal: 'Your first checkride: the ring road in Acro, one circle round the pylon, and a gentle landing on the pad. One crash ends it.',
          why: 'Everything since your first hover, flown in one go. A licence is not a fast run, it is a clean one: the same smooth inputs from the first ring to the pad.',
          steps: [
            'Take off and fly the ring road, in order, at a steady height.',
            'Then one circle round the pylon, banked and held with a little pull.',
            'Home to the pad, slow right down, and set it down gently.',
          ],
          sticks: [{ stick: 'throttle', dir: 'hold' }, { stick: 'roll', dir: 'both' }, { stick: 'pitch', dir: 'back' }],
          note: 'No crashes. If you crash, the checkride starts again. Take it slowly: a clean run beats a fast one.',
        },
        objectives: [
          { kind: 'rings', text: 'The ring road', rings: route(ringRoad), hint: 'The lit ring is next. Line up early.' },
          {
            kind: 'orbit', text: 'One circle round the pylon', center: [80, 86], rMin: 7, rMax: 18, turns: 1, minHeight: 2,
            hint: 'Roll and yaw together, and pull a little to hold the turn.',
          },
          {
            kind: 'land', text: 'Land on the pad', maxDescent: 2.2,
            pad: { at: [FIELD_SPAWN.x, FIELD_SPAWN.y], r: 2.5 },
            hint: 'Slow down well before the pad, then ease the throttle down.',
          },
        ],
        /* tests/career/rig.test.js flies it in 84 s, carefully; the marks
         * are set off that the way the Checkride's are (two thirds of it for
         * gold, a little over it for silver). */
        medals: { gold: 56000, silver: 88000 },
        crashTip: 'A licence is flown within yourself. Slower, smoother, and finish it.',
      },
    ],
  },
];

/* Every lesson, in career order, with its chapter. */
export function allLessons() {
  const out = [];
  for (const c of CHAPTERS) {
    for (const l of c.lessons) {
      out.push({ ...l, chapter: c.id });
    }
  }
  return out;
}

export function lessonById(id) {
  for (const c of CHAPTERS) {
    const l = c.lessons.find((x) => x.id === id);
    if (l) {
      return { ...l, chapter: c.id };
    }
  }
  return null;
}

export function chapterOf(lessonId) {
  return CHAPTERS.find((c) => c.lessons.some((l) => l.id === lessonId)) || null;
}

/* The lesson after this one, across chapters, or null at the end. */
export function nextLesson(lessonId) {
  const list = allLessons();
  const i = list.findIndex((l) => l.id === lessonId);
  return i >= 0 && i + 1 < list.length ? list[i + 1] : null;
}
