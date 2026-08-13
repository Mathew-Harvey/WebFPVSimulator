/*
 * tracks.js: the record crate. Every music track as data, no audio code.
 *
 * The owner asked for many tracks of drum and bass and lofi, and the node
 * budget in tests/thresholds.json caps the live graph at 64 AudioNodes, so
 * more tracks cannot mean more voices. A track here is a sheet of numbers
 * and pattern strings that src/render/music.js performs on the one pooled
 * instrument set it already owns: a kick, a snare, a hat, a sub, a three
 * voice pad and a crackle loop. Twelve tracks cost the same node count as
 * one.
 *
 * Patterns are sixteenth step strings, 16 characters to a bar: '1' a full
 * hit, 'g' a ghost, 'a' an accent (hats only), '.' nothing. Most tracks
 * write each bar once and arrange bars with seq(), because a reviewer can
 * read four bars and an arrangement where a 256 character string is a wall.
 * Track one is the shipped 174 BPM bed kept verbatim, strings and all, so
 * every number measured against it stays comparable.
 *
 * Two genre conventions, stated so the data reads as intent:
 *
 *   dnb: 170 to 176 BPM, sixteen bar loops, no swing, two step kick with
 *   the syncopation in the ghosts, snare on two and four, pads swelling
 *   over four bar chords.
 *
 *   lofi: 72 to 88 BPM, eight bar loops, swung sixteenths, boom bap kick,
 *   plucked keys instead of a swell, a heavier shelf, more pitch wow, and
 *   the vinyl crackle bed on.
 *
 * Every track keeps the bed's band split: sub and kick below 120 Hz, snare
 * and hats above 1.5 kHz, keys around 660 Hz to 2 kHz, because the motor
 * tone between 130 and 900 Hz is a flight instrument and the music must
 * not sing over it.
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

export const BAR_STEPS = 16;

/* Expand an arrangement into one pattern string: seq('A A A B', {A, B}).
 * Whitespace in the layout is layout only. Unknown letters throw here, at
 * import, where the stack trace names the track, not at 3 am in a hit(). */
function seq(layout, bars) {
  return layout
    .split(/\s+/)
    .filter((k) => k.length > 0)
    .map((k) => {
      if (!bars[k] || bars[k].length !== BAR_STEPS) {
        throw new Error(`tracks: bar ${k} missing or not ${BAR_STEPS} steps`);
      }
      return bars[k];
    })
    .join('');
}

/*
 * The shipped bed's patterns, verbatim. These strings predate seq() and
 * stay as strings because the measured seam, tempo and band figures in
 * PROGRESS.md were taken against exactly this data.
 */
const NIGHT_KICK = '1.......g.1.....1.......g.1.....1.......g.1.....1.......g.1...g.1.........1.....1.......g.1.....1.........1.....1.......g.1...g.1.......g.1.....1.......g.1.....1.......g.1.....1.......g.1...g.1.........1.....1.......g.1.....1.........1.....1.......g.1.1.g1';
const NIGHT_SNARE = '....1.......1.......1.......1.......1.......1.......1......g1.g.....1.......1.......1......g1.......1.......1.......1......g1.g.....1.......1.......1.......1..g....1.......1.......1......g1.g.....1.......1.......1......g1.......1.......1..g....1.......1.gg';
const NIGHT_HAT = 'a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a1a1';

/* Genre defaults, spread into each track then overridden per track. The
 * numbers for dnb are the shipped bed's, measured and argued over in
 * PROGRESS.md; the lofi set darkens the shelf, widens the wow, swings the
 * grid and turns the crackle on. */
const DNB = {
  genre: 'dnb',
  bars: 16,
  swing: 0,
  loops: 3,
  shelf: { hz: 3200, db: -14 },
  wow: { seconds: 0.005, periodBars: 8, cents: 12 },
  crackle: 0,
  kickTone: { start: 96, end: 44, drop: 0.09, peak: 0.5, ghost: 0.24, len: 0.16, ghostLen: 0.10 },
  snareTone: { bp: 2100, q: 0.9, peak: 1.9, ghost: 0.85, len: 0.11 },
  hatTone: { hp: 6500, accent: 0.85, tick: 0.30, len: 0.06 },
  bassTone: { peak: 0.75, noteSteps: 3.2 },
  pads: { baseHz: 880, lp: 2500, barsPerChord: 4, mode: 'swell', level: 0.085, attack: 0.30 },
};
const LOFI_STYLE = {
  genre: 'lofi',
  bars: 8,
  /* Fraction of a sixteenth added to every odd step. 0.24 puts the pair
   * ratio at 62 percent, a lazy MPC swing rather than a shuffle. */
  swing: 0.24,
  loops: 3,
  shelf: { hz: 2800, db: -16 },
  wow: { seconds: 0.007, periodBars: 4, cents: 18 },
  crackle: 0.7,
  /* Hotter per hit than the dnb numbers, on purpose: at half the tempo
   * there are half the onsets, and equal peaks measured the lofi bed 7 dB
   * under the drum and bass bed, which read as the music leaving the room
   * every time the rotation changed genre. These bring the sparse groove
   * within about 3 dB of the busy one. */
  kickTone: { start: 82, end: 48, drop: 0.11, peak: 0.72, ghost: 0.34, len: 0.22, ghostLen: 0.13 },
  snareTone: { bp: 1750, q: 0.8, peak: 2.1, ghost: 0.9, len: 0.14 },
  hatTone: { hp: 6000, accent: 0.72, tick: 0.28, len: 0.05 },
  bassTone: { peak: 0.95, noteSteps: 6.0 },
  pads: { baseHz: 880, lp: 2200, barsPerChord: 2, mode: 'pluck', level: 0.16, attack: 0.025, decay: 2.4, strikes: [0] },
};

/*
 * The crate. Rotation plays this order, so it alternates genres on
 * purpose: a lap of rollers, a breather, another lap.
 *
 * Chords are semitones from pads.baseHz, three per chord because there are
 * three pad voices. Bass phrases are [step, semitone] over phraseBars of
 * sixteen steps, semitones from rootHz. Keeping a seventh in a triad slot,
 * like [0, 3, 10], is what makes the lofi chords read as keys rather than
 * as an organ.
 */
export const TRACKS = [
  {
    ...DNB,
    id: 'night-circuit',
    name: 'Night Circuit',
    bpm: 174,
    kick: NIGHT_KICK,
    snare: NIGHT_SNARE,
    hat: NIGHT_HAT,
    bass: {
      rootHz: 55,
      phraseBars: 8,
      phrase: [
        [0, 0], [10, 0], [14, -2],
        [16, 3], [26, 3], [30, 5],
        [32, -2], [42, -2], [46, 0],
        [48, 5], [58, 3], [62, 0],
        [64, 0], [74, 0], [78, -2],
        [80, -4], [90, -4], [94, -2],
        [96, 3], [106, 5], [110, 7],
        [112, 0], [122, 0], [126, -5],
      ],
    },
    chords: [
      [0, 3, 7],
      [-4, 0, 3],
      [3, 7, 10],
      [-2, 2, 5],
    ],
  },

  {
    ...LOFI_STYLE,
    id: 'porch-light',
    name: 'Porch Light',
    bpm: 80,
    kick: seq('A A A B  A A C B', {
      A: '1......1..1.....',
      B: '1......1..1...g.',
      C: '1.........1..1..',
    }),
    snare: seq('A A A B  A A A C', {
      A: '....1.......1...',
      B: '....1.......1..g',
      C: '....1......g1.g.',
    }),
    hat: seq('A A B A  A A B C', {
      A: 'a.1.1.1.a.1.1.1.',
      B: 'a.1.1.1.a.1.1.11',
      C: 'a.1.1.g.a.g.1.g.',
    }),
    bass: {
      rootHz: 55,
      phraseBars: 8,
      phrase: [
        [0, 0], [24, -4],
        [32, -2], [56, 3],
        [64, 0], [88, -4],
        [96, 5], [120, 3],
      ],
    },
    /* A minor 7 to F major 7 to C to G, the four chords every porch knows. */
    chords: [
      [0, 3, 10],
      [-4, 0, 7],
      [3, 7, 12],
      [-2, 2, 10],
    ],
  },

  {
    ...DNB,
    id: 'rolling-deep',
    name: 'Rolling Deep',
    bpm: 172,
    kick: seq('A A A B  A A C B  A A A B  A C A D', {
      A: '1.......g.1.....',
      B: '1.......g.1...g.',
      C: '1.........1..g..',
      D: '1.......g.1.g.g1',
    }),
    snare: seq('A A A B  A A A B  A A C B  A A A D', {
      A: '....1.......1...',
      B: '....1......g1..g',
      C: '....1..g....1...',
      D: '....1.......1.gg',
    }),
    hat: seq('A A A A  A A A B  A A A A  A A B C', {
      A: 'a.1.a.1.a.1.a.1.',
      B: 'a.1.a.1.a.1.a.11',
      C: 'a.1.a.1.a.11a1a1',
    }),
    bass: {
      rootHz: 49,
      phraseBars: 8,
      phrase: [
        [0, 0], [10, 0], [14, 3],
        [16, 3], [30, 2],
        [32, 0], [42, 0], [46, -2],
        [48, -4], [62, 0],
        [64, 0], [74, 0], [78, 3],
        [80, 5], [94, 3],
        [96, 2], [106, 2], [110, 0],
        [112, -4], [126, -2],
      ],
    },
    chords: [
      [0, 3, 7],
      [-2, 2, 5],
      [-4, 0, 3],
      [0, 5, 8],
    ],
  },

  {
    ...LOFI_STYLE,
    id: 'rainy-glass',
    name: 'Rainy Glass',
    bpm: 76,
    swing: 0.27,
    crackle: 0.85,
    kick: seq('A B A C  A B A D', {
      A: '1.........1.....',
      B: '1......g..1.....',
      C: '1......1..1..g..',
      D: '1......1..1.....',
    }),
    snare: seq('A A A A  A A A B', {
      A: '....1.......1...',
      B: '....1.......1..g',
    }),
    hat: seq('A A A B  A A A B', {
      A: 'a...1...a...1...',
      B: 'a...1...a...1.g.',
    }),
    bass: {
      rootHz: 43.65,
      phraseBars: 8,
      phrase: [
        [0, 0], [28, 2],
        [32, 3], [60, 2],
        [64, 0], [92, -4],
        [96, -2], [120, 0],
      ],
    },
    /* F minor colours around the F1 root: quiet, wet, a little unresolved. */
    chords: [
      [0, 3, 10],
      [3, 7, 14],
      [-4, 3, 8],
      [-2, 5, 10],
    ],
    pads: { ...LOFI_STYLE.pads, level: 0.15, decay: 3.0, strikes: [0, 16] },
  },

  {
    ...DNB,
    id: 'skyline',
    name: 'Skyline',
    bpm: 176,
    shelf: { hz: 3600, db: -12 },
    kick: seq('A A A B  A A A B  A C A B  A A C D', {
      A: '1.........1.....',
      B: '1.......g.1...g.',
      C: '1.......g.1.....',
      D: '1.........1.gg.1',
    }),
    snare: seq('A A A B  A A A B  A A A B  A A B C', {
      A: '....1.......1...',
      B: '....1.......1..g',
      C: '....1..g...g1.g.',
    }),
    hat: seq('A A A B  A A A B  A A A B  A B A C', {
      A: 'a.1.a.1.a.1.a.1.',
      B: 'a.11a.1.a.1.a.1.',
      C: 'a.11a.11a.1.a1a1',
    }),
    bass: {
      rootHz: 43.65,
      phraseBars: 8,
      phrase: [
        [0, 0], [10, 0], [14, 4],
        [16, 5], [26, 5], [30, 7],
        [32, 4], [46, 2],
        [48, 0], [58, 0], [62, -3],
        [64, 0], [74, 0], [78, 4],
        [80, 5], [90, 5], [94, 9],
        [96, 7], [110, 5],
        [112, 4], [122, 2], [126, 0],
      ],
    },
    /* Major and lydian shapes: this one is the liquid roller. */
    chords: [
      [0, 4, 11],
      [2, 7, 14],
      [-3, 4, 9],
      [-1, 2, 7],
    ],
    pads: { ...DNB.pads, level: 0.095, barsPerChord: 4 },
  },

  {
    ...LOFI_STYLE,
    id: 'corner-store',
    name: 'Corner Store',
    bpm: 84,
    swing: 0.2,
    kick: seq('A A B C  A A B D', {
      A: '1......1..1.....',
      B: '1..g...1..1.....',
      C: '1......1..1..1..',
      D: '1......1..1...g1',
    }),
    snare: seq('A A A B  A A A C', {
      A: '....1.......1...',
      B: '....1.....g.1...',
      C: '....1.......1g.g',
    }),
    hat: seq('A B A B  A B A C', {
      A: 'a.1.1.1.a.1.1.1.',
      B: 'a.1.1.11a.1.1.1.',
      C: 'a.111.1.a.1.11g.',
    }),
    bass: {
      rootHz: 49,
      phraseBars: 8,
      phrase: [
        [0, 0], [14, 0], [24, 3],
        [32, 5], [56, 3],
        [64, 0], [78, 0], [88, -2],
        [96, -4], [120, -2],
      ],
    },
    chords: [
      [0, 3, 10],
      [5, 8, 15],
      [-2, 2, 8],
      [-4, 0, 7],
    ],
    pads: { ...LOFI_STYLE.pads, level: 0.17, decay: 2.0, strikes: [0, 8, 20] },
  },

  {
    ...DNB,
    id: 'undertow',
    name: 'Undertow',
    bpm: 170,
    shelf: { hz: 2800, db: -15 },
    kick: seq('A A A A  B A A C  A A A A  B A C D', {
      A: '1.......g.1.....',
      B: '1..g....g.1.....',
      C: '1.......g.1...g1',
      D: '1.g.....g.1..g.1',
    }),
    snare: seq('A A A A  A A A B  A A A A  A A B C', {
      A: '....1.......1...',
      B: '....1.......1.g.',
      C: '....1...g...1.gg',
    }),
    hat: seq('A A A A  A A A A  B A A A  A A A B', {
      A: 'a...a.1.a...a.1.',
      B: 'a...a.1.a..1a.1.',
    }),
    bass: {
      rootHz: 55,
      phraseBars: 8,
      phrase: [
        [0, 0], [14, -2],
        [16, -4], [30, -2],
        [32, 0], [46, -2],
        [48, -4], [58, -4], [62, -7],
        [64, 0], [78, -2],
        [80, -4], [94, -2],
        [96, -7], [110, -5],
        [112, -4], [122, -2], [126, 0],
      ],
    },
    /* Dark: minor with a flat six leaning on the root. */
    chords: [
      [0, 3, 7],
      [-4, 0, 5],
      [-2, 0, 3],
      [-7, -4, 0],
    ],
    pads: { ...DNB.pads, level: 0.07 },
  },

  {
    ...LOFI_STYLE,
    id: 'paper-planes',
    name: 'Paper Planes',
    bpm: 72,
    swing: 0.3,
    wow: { seconds: 0.009, periodBars: 4, cents: 22 },
    kick: seq('A B A C  A B A C', {
      A: '1.........1.....',
      B: '1.......g.1.....',
      C: '1......1..1.....',
    }),
    snare: seq('A A A A  A A A B', {
      A: '....1.......1...',
      B: '....1......g1...',
    }),
    hat: seq('A A B A  A A B C', {
      A: 'a...1...a...1...',
      B: 'a...1..ga...1...',
      C: 'a...1...a..g1.g.',
    }),
    bass: {
      rootHz: 41.2,
      phraseBars: 8,
      phrase: [
        [0, 0], [28, 3],
        [32, 5], [60, 3],
        [64, 7], [92, 5],
        [96, 3], [124, 0],
      ],
    },
    chords: [
      [0, 4, 11],
      [-3, 2, 9],
      [-1, 4, 7],
      [0, 5, 9],
    ],
    pads: { ...LOFI_STYLE.pads, level: 0.14, decay: 3.4, attack: 0.05 },
  },

  {
    ...DNB,
    id: 'copper-wire',
    name: 'Copper Wire',
    bpm: 174,
    kick: seq('A B A C  A B A C  A B A C  A B C D', {
      A: '1.......g.1.....',
      B: '1.....g...1.....',
      C: '1.......g.1..g..',
      D: '1.....g.g.1.1..g',
    }),
    snare: seq('A A B A  A A B A  A A B A  A B A C', {
      A: '....1.......1...',
      B: '....1..g....1..g',
      C: '....1.g.....1ggg',
    }),
    hat: seq('A A A B  A A A B  A A A B  A A B B', {
      A: 'a.1.a.1.a.1.a.1.',
      B: 'a.1.a1..a.1.a.1.',
    }),
    bass: {
      rootHz: 41.2,
      phraseBars: 8,
      phrase: [
        [0, 0], [10, 0], [14, 7],
        [16, 5], [26, 5], [30, 3],
        [32, 2], [42, 2], [46, 0],
        [48, 3], [62, 2],
        [64, 0], [74, 0], [78, 7],
        [80, 8], [90, 8], [94, 7],
        [96, 5], [106, 3], [110, 2],
        [112, 0], [122, 0], [126, -2],
      ],
    },
    chords: [
      [0, 3, 8],
      [-2, 3, 7],
      [0, 5, 8],
      [-4, 0, 5],
    ],
  },

  {
    ...LOFI_STYLE,
    id: 'slow-orbit',
    name: 'Slow Orbit',
    bpm: 88,
    swing: 0.18,
    crackle: 0.55,
    kick: seq('A A B A  A A B C', {
      A: '1......1..1.....',
      B: '1......1..1....g',
      C: '1......1.g1..1..',
    }),
    snare: seq('A B A B  A B A C', {
      A: '....1.......1...',
      B: '....1.......1..g',
      C: '....1..g....1.g.',
    }),
    hat: seq('A A A B  A A A B', {
      A: 'a.1.1.1.a.1.1.1.',
      B: 'a.1.1.1.a.1.11g.',
    }),
    bass: {
      rootHz: 46.25,
      phraseBars: 8,
      phrase: [
        [0, 0], [20, 0], [28, -2],
        [32, -4], [56, -2],
        [64, 0], [84, 0], [92, 3],
        [96, 5], [120, 3],
      ],
    },
    chords: [
      [0, 3, 10],
      [-4, 0, 8],
      [-2, 3, 7],
      [1, 5, 12],
    ],
    pads: { ...LOFI_STYLE.pads, level: 0.15, decay: 2.2, strikes: [0, 16] },
  },

  {
    ...DNB,
    id: 'afterimage',
    name: 'Afterimage',
    bpm: 172,
    shelf: { hz: 3400, db: -13 },
    kick: seq('A A A B  A A A B  C A A B  A A B D', {
      A: '1.......g.1.....',
      B: '1.........1...g.',
      C: '1..g......1.....',
      D: '1.......g.11...g',
    }),
    snare: seq('A A A B  A A A B  A A A B  A A B C', {
      A: '....1.......1...',
      B: '....1.......1g..',
      C: '....1....g..1.g1',
    }),
    hat: seq('A A A A  B A A A  A A A A  B A A C', {
      A: 'a.1.a.1.a.1.a.1.',
      B: 'a.1.a.1.a.1.a11.',
      C: 'a.1.a.1.a1a1a1a1',
    }),
    bass: {
      rootHz: 49,
      phraseBars: 8,
      phrase: [
        [0, 0], [14, 2],
        [16, 3], [26, 3], [30, 5],
        [32, 7], [46, 5],
        [48, 3], [58, 2], [62, 0],
        [64, 0], [78, 2],
        [80, 3], [90, 3], [94, 7],
        [96, 8], [106, 7], [110, 5],
        [112, 3], [122, 2], [126, 0],
      ],
    },
    /* Chord change every two bars: the airy one. */
    chords: [
      [0, 4, 9],
      [2, 5, 10],
      [-3, 0, 4],
      [-1, 2, 9],
      [0, 4, 9],
      [2, 7, 12],
      [-3, 2, 5],
      [-1, 4, 7],
    ],
    pads: { ...DNB.pads, barsPerChord: 2, level: 0.09, attack: 0.22 },
  },

  {
    ...LOFI_STYLE,
    id: 'amber-dusk',
    name: 'Amber Dusk',
    bpm: 80,
    swing: 0.22,
    kick: seq('A B A C  A B A D', {
      A: '1......1..1.....',
      B: '1......g..1..1..',
      C: '1......1..1....g',
      D: '1......1.g1.....',
    }),
    snare: seq('A A A B  A A A C', {
      A: '....1.......1...',
      B: '....1.....g.1...',
      C: '....1.......1gg.',
    }),
    hat: seq('A B A B  A B A C', {
      A: 'a.1.1.1.a.1.1.1.',
      B: 'a.1.g.1.a.1.g.1.',
      C: 'a.1.g.1.a.g.1g..',
    }),
    bass: {
      rootHz: 55,
      phraseBars: 8,
      phrase: [
        [0, 0], [24, -2],
        [32, -4], [56, 0],
        [64, -5], [88, -4],
        [96, -2], [116, -2], [124, 0],
      ],
    },
    chords: [
      [0, 3, 10],
      [-2, 2, 8],
      [-5, 0, 7],
      [-4, 3, 10],
    ],
    pads: { ...LOFI_STYLE.pads, level: 0.16, decay: 2.8, strikes: [0, 20] },
  },
];

/* A stored id that no longer exists falls back to the first track, exactly
 * as maps and tunes do, because a stale localStorage entry must never stop
 * the page booting. */
export function trackById(id) {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}

/*
 * Checked at import, where getting a length wrong is otherwise invisible:
 * a pattern one bar short would wrap the groove against the wow and the
 * chord grid and de-phase the loop, which is exactly the class of defect
 * the seam measurement exists to rule out.
 */
for (const t of TRACKS) {
  const steps = t.bars * BAR_STEPS;
  for (const key of ['kick', 'snare', 'hat']) {
    if (t[key].length !== steps) {
      throw new Error(`tracks: ${t.id} ${key} is ${t[key].length} steps, wants ${steps}`);
    }
  }
  if (t.bars % t.wow.periodBars !== 0) {
    throw new Error(`tracks: ${t.id} wow period ${t.wow.periodBars} must divide ${t.bars} bars`);
  }
  /* The rotation advances after loops plays of the loop; zero would ask the
   * scheduler to advance forever without scheduling a step. */
  if (!Number.isInteger(t.loops) || t.loops < 1) {
    throw new Error(`tracks: ${t.id} loops must be a positive integer`);
  }
  if (!(t.bpm >= 60 && t.bpm <= 220)) {
    throw new Error(`tracks: ${t.id} bpm ${t.bpm} outside the schedulable range`);
  }
  const phraseSteps = t.bass.phraseBars * BAR_STEPS;
  if (steps % phraseSteps !== 0) {
    throw new Error(`tracks: ${t.id} bass phrase ${t.bass.phraseBars} bars must divide the loop`);
  }
  for (const [at, semi] of t.bass.phrase) {
    if (at < 0 || at >= phraseSteps || !Number.isFinite(semi)) {
      throw new Error(`tracks: ${t.id} bass note at ${at} outside the phrase`);
    }
  }
  const chordSteps = t.pads.barsPerChord * BAR_STEPS;
  if (steps % chordSteps !== 0) {
    throw new Error(`tracks: ${t.id} chord span ${t.pads.barsPerChord} bars must divide the loop`);
  }
  for (const c of t.chords) {
    if (c.length !== 3) {
      throw new Error(`tracks: ${t.id} chord [${c}] wants exactly 3 voices`);
    }
  }
}
