/*
 * ui.js: the panels. Palette, inspector, sequence, results.
 *
 * The page skeleton is static in index.html; this module only ever writes
 * into it. Everything here talks to the app through one method,
 * host.edit(label, mutate), which takes an undo snapshot, runs the mutation,
 * re-derives the faces and redraws. Panels never touch the document
 * directly, so there is exactly one place an edit can fail to become undoable.
 *
 * REBUILDING AND FOCUS. Every panel is rebuilt from scratch on every render,
 * which is simple and cannot get out of step with the document, and which
 * would normally throw away the caret while somebody is typing in a number
 * field. So the id of the focused control and its selection range are saved
 * before the rebuild and put back after it. That one trick is what lets the
 * rest of this file be as blunt as it is.
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
  ELEMENTS, KIND, paletteItems, FLAG_SIDES, FRAME_SIDES, flagSideOf, frameSidesOf, unbuiltPolesOf, poleBuilt, countElementsByType,
  GATE_PRESETS, MICRO_GATE_PRESETS, gatePresetsFor,
  applyGatePreset, matchingGatePreset, presetHeight, levelPitchFor, apertureLevels, apertureShapeOf, openingSizesOf,
  elementHeight, TRACK_CLASS_DEFAULT, trackClassOf, docModeOf, paletteGroupOf, clampByLimits, lowestBase,
  isLetterPiece, isUnbuilt, letterExtent, pieceLabel,
} from './elements.js';
import { LETTERS, openingCount, openingName } from '../props/letters.js';
import {
  aperturesOf, elementById, kindOf, isSequenceable, logosOf, logoForDecal, setOpeningSize,
  SCENE_TIMES, SCENE_GROUNDS, sceneOf,
} from './model.js';
import { gateNumbers, gateNumberOf, sequenceLabel, faceLabel, unsequencedElements } from './sequence.js';
import { labelOf, MAP_TOOLS, WHOOP_TOOLS, FIVE_INCH_TOOLS, partPiecesFor } from './elements.js';
import { replacementsFor } from './snap.js';
import {
  canBecomeLetter, canBeInvisible, canFlag, flagsAsFlown, flagsOf, roundFlagOf, wallOf, wallFlagsOf, wallIsWoven, wallSizeOf, HURDLE,
  HURDLE_LINES, HURDLE_SIZES, HURDLE_TYPES, canFlyOver, hurdleAngleOf, hurdleLineOf, hurdleSizeOf,
} from './parts.js';
import { scaleOf, say as sayLength } from './scale.js';
import { passList, reuseOf } from './passes.js';
import { needsSeat, standsOnGround } from './seat.js';
import {
  HANDED_FIGURES, consecutiveEntries, figureBlurb, figureHandOf, figuresFor, levelName, matchingFigure,
} from './figures.js';
import { RUN_SHAPES, RUN_SPACINGS, runShapeById } from './runs.js';
import { MANOEUVRES, figureName, manoeuvreById, parseFigureName } from './manoeuvres.js';
import { figureGlyph, GLYPH_H, GLYPH_W } from './glyphs.js';
import {
  aroundOf, defaultAroundHand, figureHolding, intoOf, thenOf,
} from './flightpaths.js';
import { elevationProfile } from './path.js';
import { drawProfile } from './profile.js';
import { DEG, RAD, wrapAngle } from './geometry.js';
import { localBoundsOf, planShapeOf, turnsOf } from './view2d.js';
import {
  PROP_GROUPS, GAP_POINTS, clampDim, fitDims, hollowDoorHeight, styleDims, styleOf as propStyleOf, tiltOf,
} from '../props/types.js';
/* What a room's furniture may be sized to, so the fields hold to it. */
import { isRoomType, clampRoomSize, ROOM_SIZE_MIN, ROOM_SIZE_MAX } from '../props/room.js';
/* A road's eased line and the drift car's numbers, for the road and vehicle
 * inspectors: the same answers the plan draws and the physics is handed. */
import { roadOf } from '../maps/built/road.js';
import { DRIFT } from '../maps/built/traffic.js';
/* What each canvas calls its ground and its documents. */
import { wordsFor, CANVAS_WORDS } from './words.js';
/* The parts a track cannot be published with yet, marked on the palette. */

/* The small mark a chip on the lap strip wears for the piece it is a pass of. */
const CHIP_KINDS = {
  gate: 'gate', doubleStack: 'tall', ladder: 'tall', tower: 'tall', diveGate: 'flat',
  pole: 'pole', horizontalPole: 'pole', cone: 'cone', flag: 'pole', hoop: 'ring', hexGate: 'hex', letter: 'tall',
};

/* Metres a second in kilometres an hour. A vehicle's speed is m/s in the
 * document and km/h in its inspector, the unit a driver reads: this is the
 * one place the builder converts it. */
const KMH = 3.6;

/*
 * THE PLAIN WORDS. The panels were written in the model's words, and a pilot
 * who has never seen the tool does not know what a sill is, or that Yaw is
 * which way a gate faces, or what a face flipped is for. The whoop canvas
 * learned to say each the way a person building the track says it, and the
 * five inch and the map say them the same way now (MENUS-PLAN.md 4.2b): one
 * piece is not called two things on two canvases. A room has a floor and the
 * other two have the ground, which is the one word that differs (say). The
 * model and the file keep theirs.
 */
const WHOOP_WORDS = {
  'Sill height': 'Height off floor',
  'Level spacing': 'Gap between gates',
  'Opening width': 'Gate width',
  'Opening height': 'Gate height',
  'Opening size': 'Gate size',
  Base: 'Height off floor',
  Yaw: 'Turn',
  'Flip face': 'Reverse direction',
  'Re-derive': 'Let the tool decide again',
  'How it is flown': 'Path through the stack',
  set: 'Turned by hand',
};

/* Inches, because the rules and the pipe are in them, with the millimetres
 * beside; the document stays in metres. */
const IN = 0.0254;
const FT = 0.3048;
const round6 = (v) => Math.round(v * 1e6) / 1e6;

/*
 * WHAT A LETTER HAS TO FLY THROUGH, in a sentence: "W has one gap: between the Vs", "B has two gaps: lower bowl and
 * upper bowl". The names are the letter's own (src/props/letters.js), the ones the flying order and the card call
 * each gap by.
 */
function letterNote(letter) {
  const n = openingCount(letter);
  const names = Array.from({ length: n }, (_, i) => openingName(letter, i));
  const list = n === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[n - 1]}`;
  return `${letter} has ${n === 1 ? 'one gap' : (n === 2 ? 'two gaps' : 'three gaps')}: ${list}.`;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) {
    n.className = cls;
  }
  if (text != null) {
    n.textContent = text;
  }
  return n;
}

function button(label, cls, onClick, title) {
  const b = el('button', cls, label);
  b.type = 'button';
  if (title) {
    b.title = title;
  }
  b.addEventListener('click', onClick);
  return b;
}

/* Round for display without printing a float's tail. */
function show(x, places = 2) {
  if (!Number.isFinite(x)) {
    return '';
  }
  const s = x.toFixed(places);
  /* Only strip AFTER a decimal point. With places 0 there is no point in
   * the string and the old expression chewed the trailing zeros off the
   * number itself: a levels count of 40 displayed as 4, and 100 as 1. */
  return s.includes('.') ? (s.replace(/\.?0+$/, '') || '0') : s;
}

const SVG = 'http://www.w3.org/2000/svg';

function svgEl(name, attrs) {
  const n = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) {
    n.setAttribute(k, String(v));
  }
  return n;
}

/*
 * A FLIGHT PATH'S PICTURE: the figure's own curve, drawn small (glyphs.js), the piece it is flown after a dot on it and
 * the way it goes out an arrowhead, with a small arrow where height is the point.
 */
function figureGlyphSvg(spec, cls) {
  const svg = svgEl('svg', { viewBox: `0 0 ${GLYPH_W} ${GLYPH_H}`, 'aria-hidden': 'true' });
  if (spec === null) {
    /* Nothing laid: the line, dashed and quiet, with no arrow, so it is not read as a figure that goes straight on. */
    svg.append(svgEl('path', {
      d: `M7 ${GLYPH_H / 2} L${GLYPH_W - 7} ${GLYPH_H / 2}`, fill: 'none', stroke: '#9db3c8', 'stroke-width': 1.5,
      'stroke-linecap': 'round', 'stroke-dasharray': '3 3',
    }));
    return svg;
  }
  const g = figureGlyph(spec, cls);
  const line = (d) => svgEl('path', {
    d, fill: 'none', stroke: '#7dffb4', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  });
  svg.append(line(g.d));
  const head = (back) => `M${g.end.x} ${g.end.y} l${(-5 * Math.cos(g.angle + back)).toFixed(2)} ${(-5 * Math.sin(g.angle + back)).toFixed(2)}`;
  svg.append(line(`${head(-0.45)} ${head(0.45)}`));
  svg.append(svgEl('circle', { cx: g.piece.x, cy: g.piece.y, r: 2.2, fill: '#ffd45c' }));
  if (g.badge) {
    svg.append(svgEl('path', { d: g.badge === 'up' ? 'M62 10 l4 -7 l4 7 z' : 'M62 3 l4 7 l4 -7 z', fill: '#ffd45c' }));
  }
  return svg;
}

/*
 * A tiny diagram of a stacked gate and how it is flown. The inspector is
 * where an author decides the figure, so the picture has to carry the
 * meaning: which holes, which way, wrap or invert.
 */
function figureIcon(figId, levels) {
  const n = Math.max(2, Math.min(3, levels));
  const svg = svgEl('svg', { viewBox: '0 0 72 80', 'aria-hidden': 'true' });
  const holeH = n === 3 ? 18 : 22;
  const gap = 4;
  const total = n * holeH + (n - 1) * gap;
  const top = (80 - total) / 2;
  const x = 22;
  const w = 28;
  const used = new Set();
  if (figId === 'single') {
    used.add(0);
  } else if (figId === 'splitS') {
    used.add(n - 1);
    used.add(0);
  } else {
    for (let i = 0; i < n; i += 1) {
      used.add(i);
    }
  }
  const yOf = (i) => top + (n - 1 - i) * (holeH + gap);
  for (let i = 0; i < n; i += 1) {
    const y = yOf(i);
    const on = used.has(i);
    svg.append(svgEl('rect', {
      x, y, width: w, height: holeH, rx: 2,
      fill: on ? 'rgba(255, 212, 92, 0.18)' : 'rgba(157, 179, 200, 0.06)',
      stroke: on ? '#ffd45c' : 'rgba(157, 179, 200, 0.35)',
      'stroke-width': on ? 1.6 : 1,
    }));
  }
  const midY = (i) => yOf(i) + holeH / 2;
  const left = x - 6;
  const right = x + w + 6;
  const arrow = (x1, y1, x2, y2, dashed = false) => {
    const p = svgEl('path', {
      d: `M${x1} ${y1} L${x2} ${y2}`,
      fill: 'none',
      stroke: '#7dffb4',
      'stroke-width': 1.8,
      'stroke-linecap': 'round',
    });
    if (dashed) {
      p.setAttribute('stroke-dasharray', '3 2');
      p.setAttribute('stroke', '#9db3c8');
    }
    svg.append(p);
  };
  if (figId === 'single') {
    arrow(left, midY(0), right, midY(0));
  } else if (figId === 'splitS') {
    arrow(left, midY(n - 1), right, midY(n - 1));
    arrow(right, midY(n - 1), right, midY(0), true);
    arrow(right, midY(0), left, midY(0));
  } else if (figId === 'revSplitS') {
    arrow(left, midY(0), right, midY(0));
    arrow(right, midY(0), right, midY(n - 1), true);
    arrow(right, midY(n - 1), left, midY(n - 1));
  } else if (figId === 'spiralDown') {
    for (let i = n - 1; i >= 0; i -= 1) {
      const fromLeft = (n - 1 - i) % 2 === 0;
      if (fromLeft) {
        arrow(left, midY(i), right, midY(i));
      } else {
        arrow(right, midY(i), left, midY(i));
      }
      if (i > 0) {
        const xw = fromLeft ? right : left;
        arrow(xw, midY(i), xw, midY(i - 1), true);
      }
    }
  } else {
    for (let i = 0; i < n; i += 1) {
      arrow(left, midY(i), right, midY(i));
      if (i < n - 1) {
        arrow(right, midY(i), right, midY(i + 1), true);
      }
    }
  }
  return svg;
}

const FLAG_SIDE_LABEL = {
  left: 'Left', right: 'Right', both: 'Both', top: 'On top',
};

/*
 * What each dimension is called in the panel. Module level, because the
 * multi selection preset row and the single element grid both name them and
 * a label that differs between two panels is a label an author cannot trust.
 *
 * "Level spacing" is spelled out rather than abbreviated, and it gets a
 * sentence of its own under the grid, because it was the one field somebody
 * had to ask about: "what is level spacing".
 */
const DIM_LABELS = {
  levels: 'Levels', sillH: 'Sill height', clearW: 'Opening width', clearH: 'Opening height',
  levelPitch: 'Level spacing', width: 'Width', depth: 'Depth', height: 'Height',
  flagH: 'Flag height',
  poleRadius: 'Pole radius', baseRadius: 'Base radius', clearance: 'Clearance',
  pads: 'Pads', spacing: 'Pad spacing', padSize: 'Pad size', textHeight: 'Text height',
};

/*
 * What a freestyle asset's styles are called on their buttons. The ids are
 * the document's and are short and lower case; the buttons are read, so they
 * get words. A style missing here is shown capitalised rather than hidden.
 */
const STYLE_LABELS = {
  flats: 'Flats', office: 'Office', warehouse: 'Warehouse', shop: 'Shop',
  '40ft': '40 ft', '20ft': '20 ft', '40ft open': '40 ft open',
  open: 'Open', netted: 'Netted',
  road: 'Road', footbridge: 'Footbridge',
  kei: 'Kei car', keivan: 'Kei van', hatch: 'Hatch', sedan: 'Sedan', wagon: 'Wagon',
  minivan: 'Minivan', van: 'Van', boxtruck: 'Box truck', minibus: 'Minibus', r32: 'R32', e82: 'E82',
  sakura: 'Sakura', street: 'Street', pine: 'Pine',
};

/* A map's scene, as the Map panel names and explains it. What each looks
 * like is src/maps/built/looks.js; this is only what the author reads. */
const TIME_LABELS = { golden: 'Golden', noon: 'Noon', dusk: 'Dusk', overcast: 'Overcast' };
const TIME_HELP = {
  golden: 'Golden hour: a low warm sun and long violet shadows. The town\u2019s own light.',
  noon: 'A high white sun, short hard shadows and a deep blue sky.',
  dusk: 'The sun on the horizon and a violet sky. Windows, street lamps, billboards and vending machines light up.',
  overcast: 'A flat grey violet day with soft shadows and a nearer haze.',
};
const GROUND_LABELS = { concrete: 'Concrete', tarmac: 'Tarmac', grass: 'Grass', dirt: 'Dirt' };
const GROUND_HELP = {
  concrete: 'A yard of sawn concrete slabs, with a yellow line round it.',
  tarmac: 'A dark car park, with bays and arrows painted round whatever you place.',
  grass: 'A lawn inside the kerb. No lines are painted on it except the launch box.',
  dirt: 'A worked earth yard with tyre ruts across it.',
};

function styleLabel(id) {
  return STYLE_LABELS[id] ?? `${String(id).charAt(0).toUpperCase()}${String(id).slice(1)}`;
}

/*
 * How a freestyle asset's dimension steps, by the kind of number it is
 * (src/props/types.js): a count by one, a length by half a metre, a fraction
 * by a twentieth, a multiplier by a tenth. The arrow keys nudge by this and
 * shift nudges by ten of it, the same as every other field.
 */
const LIMIT_STEP = { int: 1, m: 0.5, frac: 0.05, x: 0.1 };
const LIMIT_PLACES = { int: 0, m: 2, frac: 2, x: 2 };

/* The frame toggles' words. Upright rather than pole, because a pole is
 * RaceGOW's own element, flown round, and this is a side of a gate. */
const FRAME_SIDE_LABEL = {
  top: 'Top bar',
  bottom: 'Bottom bar',
  left: 'Left upright',
  right: 'Right upright',
};

function flagSideIcon(side) {
  const svg = svgEl('svg', { viewBox: '0 0 72 56', 'aria-hidden': 'true' });
  svg.append(svgEl('rect', {
    x: 18, y: 22, width: 36, height: 26, rx: 2,
    fill: 'rgba(255, 212, 92, 0.10)',
    stroke: '#9db3c8',
    'stroke-width': 2,
  }));
  svg.append(svgEl('rect', {
    x: 14, y: 16, width: 44, height: 8, rx: 1,
    fill: '#c7d8e6',
  }));
  const pennant = (cx, dir) => {
    svg.append(svgEl('polygon', {
      points: `${cx},16 ${cx},3 ${cx + dir * 14},9.5`,
      fill: '#f7e8cd',
    }));
  };
  if (side === 'left' || side === 'both') {
    pennant(16, -1);
  }
  if (side === 'right' || side === 'both') {
    pennant(56, 1);
  }
  /* On top is one mast on the middle of the board, over the opening, which
   * is the placement the three end choices had no way to say. */
  if (side === 'top') {
    pennant(36, 1);
  }
  return svg;
}

export class Panels {
  constructor(host, nodes) {
    this.host = host;
    this.nodes = nodes;
    /* The choices a flight path is laid with, kept between pieces: which way, how far round, how big. A figure that is
     * there reads its own back into this, so what is shown is what is laid. */
    const draft = () => ({
      hand: 'left', deg: 180, sense: 'up', size: 'standard', count: 4, bias: 'none',
    });
    this.flight = { then: draft(), into: draft(), around: draft() };
    /* Which of a pass's flight paths the details are showing: 'then', 'into' or, for a flag, 'around'. */
    this.flightTab = 'then';
    this.buildPalette();
    /* The lap bar is as tall as what is in it: a chip is a finger on a touched screen
     * and the figures wrap on a narrow one. The coach and a card docked to the foot sit
     * just above it, so its height is measured and handed to the stylesheet, and again
     * whenever it changes. */
    this.barH = 0;
    if (nodes.lapbar && typeof ResizeObserver === 'function') {
      new ResizeObserver(() => this.measureBar()).observe(nodes.lapbar);
    }
  }

  measureBar() {
    const bar = this.nodes.lapbar;
    if (!bar || !bar.offsetHeight) {
      return;
    }
    const h = bar.offsetHeight;
    if (h !== this.barH) {
      this.barH = h;
      bar.parentElement?.style.setProperty('--tb-bar-h', `${h}px`);
      /* And a card already up is placed again against it: the bar takes a
       * row more when the drawer opens and narrows it, and the card, placed
       * for the shorter bar, sat on the strip's first chips. */
      this.host.requestDraw?.();
    }
  }

  /* ---------------- palette ---------------- */

  /*
   * Rebuilt when the track class changes, not only at construction, because
   * a RaceGOW room and a sixty metre field are not made of the same parts: a
   * micro track has poles and horizontal poles and no flagged gates or
   * MultiGP dive gate. app.js calls it after restore and on every load.
   */
  buildPalette(cls = TRACK_CLASS_DEFAULT, mode = 'race') {
    const host = this.nodes.palette;
    host.textContent = '';
    this.paletteClass = cls;
    this.paletteMode = mode;
    this.paletteButtons = new Map();
    this.runBox = null;
    this.letterBox = null;

    /* A phone's palette is a drawer, with its own close button; the
     * stylesheet shows it only there. */
    const close = button('×', 'tb-tools-x', () => this.host.closeTools(), 'Close the palette. Esc');
    close.setAttribute('aria-label', 'Close the palette');
    host.append(close);
    if (mode === 'freestyle') {
      this.buildFreestylePalette(host, cls);
      return;
    }

    const track = el('div', 'tb-group');
    track.append(el('h3', null, 'Track'));
    const extra = el('div', 'tb-group');
    extra.append(el('h3', null, 'Extra'));

    const place = CANVAS_WORDS[cls === 'micro' ? 'micro' : 'full'].place;
    const ground = CANVAS_WORDS[cls === 'micro' ? 'micro' : 'full'].ground;
    for (const def of paletteItems(cls)) {
      const b = this.toolButton(def.id, def.key, labelOf(def.id, cls), def.id === 'groundLogo'
        ? `A sponsor logo painted on the ${ground}. Pick which of the logos it wears, and its size, in the inspector.`
        : def.note);
      (def.group === 'track' ? track : extra).append(b);
      /* The letter has a choice to make before it is laid, so the twenty six stand under its button while it is in hand. */
      if (def.id === 'letter') {
        this.letterBox = el('div', 'tb-letter-opts');
        this.letterBox.hidden = true;
        track.append(this.letterBox);
      }
      /* A five inch track's wall, up gate and hurdle, and either canvas's invisible gate, stand among the pieces, each after the one it is made from. */
      if (def.group === 'track') {
        for (const part of partPiecesFor(cls).filter((p) => p.after === def.id)) {
          track.append(this.toolButton(part.id, part.key, part.label, part.note));
          /* The run of gates has choices to make before it is laid, so they stand under its button while it is in hand. */
          if (part.id === 'run') {
            this.runBox = el('div', 'tb-run-opts');
            this.runBox.hidden = true;
            track.append(this.runBox);
          }
        }
      }
    }

    /* A track's tools that are not pieces: a row of whoop gates, and the ruler; on a field, Fly order and the ruler. */
    let tools = null;
    {
      tools = el('div', 'tb-group');
      tools.append(el('h3', null, 'Tools'));
      for (const t of cls === 'micro' ? WHOOP_TOOLS : FIVE_INCH_TOOLS) {
        tools.append(this.toolButton(t.id, t.key, t.label, t.note));
      }
    }

    /*
     * NO PATH HERE. The palette had a Path toggle that was the bar's Show line
     * a second time, and it stayed lit while the line showed, like an armed
     * tool that was not armed (MENUS-PLAN.md 1.23). Show line on the bar is
     * the one switch, and P is still its key.
     */
    host.append(...(tools ? [track, tools, extra] : [track, extra]));
    host.append(el('p', 'tb-help', cls === 'micro'
      ? `Press a key or click a tool, then click the ${place}. The tool stays armed, so ten gates are ten clicks. Escape or right click puts it away.`
      : `Press a key or click a tool, then click the ${place}. A gate stays armed, so ten gates are ten clicks; a wall, a hurdle and an up gate are one at a time. Escape or right click puts it away.`));
  }

  /*
   * ONE TOOL ON THE PALETTE: its key and its name. It used to carry a line for the parts
   * the board did not know yet (MENUS-PLAN.md 4.3a); the board knows them all now.
   */
  toolButton(id, key, label, note) {
    const b = el('button', 'tb-tool');
    b.type = 'button';
    b.dataset.tool = id;
    /* A tool with no key of its own (the letters ran out) keeps an empty chip,
     * so the labels still line up. */
    b.append(el('span', key ? 'tb-tool-key' : 'tb-tool-key none', key || ''));
    /* The label alone in its own span, which is what anything finding a tool
     * by its name reads; the note stands under it, beside it in the markup. */
    const words = el('span', 'tb-tool-words');
    words.append(el('span', 'tb-tool-label', label));
    b.title = note;
    b.append(words);
    b.addEventListener('click', () => this.host.pickTool(id));
    this.paletteButtons.set(id, b);
    return b;
  }

  /*
   * THE MAP'S PALETTE: the assets under the headings src/props/types.js
   * gives them, then the builder's own gates and markers as Course
   * furniture, then the extras. No Path: a map has no racing line to show.
   * The hotkeys are the freestyle palette's own (elementByKey with the
   * map's mode), so a key does what the button beside it says.
   */
  buildFreestylePalette(host, cls) {
    const groups = new Map();
    for (const g of PROP_GROUPS) {
      const div = el('div', 'tb-group');
      div.append(el('h3', null, g.label));
      groups.set(g.id, div);
    }
    /* The road tool and the vehicle, after the assets: a road is laid node
     * by node and a car is put on a road, so they come once there is a
     * place for them to run through. */
    const roads = el('div', 'tb-group');
    roads.append(el('h3', null, 'Roads and vehicles'));
    groups.set('roads', roads);
    const course = el('div', 'tb-group');
    /* The race palette's gates and markers, placed as furniture: a map has
     * no track, so the heading names what they are. */
    course.append(el('h3', null, 'Gates and markers'));
    groups.set('course', course);
    const extra = el('div', 'tb-group');
    extra.append(el('h3', null, 'Extra'));
    groups.set('extra', extra);

    const ground = wordsFor(this.host.doc).ground;
    for (const def of paletteItems(cls, 'freestyle')) {
      /* Three assets have no key of their own: the digits and the free
       * letters ran out before the list did. They keep an empty chip so the
       * labels still line up. */
      const b = this.toolButton(def.id, def.key, def.label, def.id === 'groundLogo'
        ? `A sponsor logo painted on the ${ground}. Pick which of the logos it wears, and its size, in the inspector.`
        : def.note);
      (groups.get(paletteGroupOf(def)) ?? course).append(b);
    }
    for (const div of groups.values()) {
      if (div.children.length > 1) {
        host.append(div);
      }
    }
    /* The ruler, after the pieces: it measures, and places nothing. */
    const tools = el('div', 'tb-group');
    tools.append(el('h3', null, 'Tools'));
    for (const t of MAP_TOOLS) {
      tools.append(this.toolButton(t.id, t.key, t.label, t.note));
    }
    host.append(tools);
    host.append(el('p', 'tb-help', 'Press a key or click a tool, then click the plot. A piece stands on what the pointer is over: the ground, a roof, a container. The tool stays armed. Buildings, containers and the skate set keep to the compass; everything else turns freely. Escape or right click puts it away.'));
  }

  /*
   * THE RUN TOOL'S CHOICES, under its button while it is in hand: the shape, which way it turns, how many gates, how far
   * apart, and for a step sequence whether it climbs or drops. They are set before the click and the ghost in the room shows
   * what the click will lay; afterwards the gates are ordinary and there is nothing here to keep in step with them.
   */
  renderRunOptions() {
    const box = this.runBox;
    if (!box) {
      return;
    }
    const armed = this.host.armed === 'run';
    box.hidden = !armed;
    box.textContent = '';
    if (!armed) {
      return;
    }
    const spec = this.host.runSpec;
    const def = runShapeById(spec.shape);
    const row = (heading, className, items) => {
      box.append(el('div', 'tb-run-label', heading));
      const seg = el('div', className);
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', heading);
      for (const it of items) {
        const b = button(it.label, it.on ? 'tb-seg-btn on' : 'tb-seg-btn', () => this.host.setRunSpec(it.patch), it.title);
        b.setAttribute('aria-pressed', it.on ? 'true' : 'false');
        seg.append(b);
      }
      box.append(seg);
    };
    row('Shape', 'tb-run-shapes', RUN_SHAPES.map((s) => ({
      label: s.label, on: spec.shape === s.id, patch: { shape: s.id, count: null }, title: s.hint,
    })));
    if (def.hand) {
      row('Which way', 'tb-seg', [['Left', 'left'], ['Right', 'right']].map(([label, hand]) => ({
        label, on: spec.hand === hand, patch: { hand }, title: `${label} as flown: the first bend is to the ${hand}`,
      })));
    }
    if (def.rise) {
      row('Steps go', 'tb-seg', [['Up', 'up'], ['Down', 'down']].map(([label, rise]) => ({
        label, on: spec.rise === rise, patch: { rise }, title: `Each gate is a step ${rise === 'up' ? 'higher' : 'lower'} than the one before`,
      })));
    }
    const [lo, hi] = def.count;
    const things = def.piece === 'flag' ? 'flags' : 'gates';
    if (hi > lo) {
      row(def.piece === 'flag' ? 'Flags' : 'Gates', 'tb-seg', Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((n) => ({
        label: String(n), on: spec.count === n, patch: { count: n }, title: `${n} ${things}`,
      })));
    }
    if (def.id !== 'dutch8') {
      row(def.id === 'hairpin' ? 'Size' : 'Gap', 'tb-seg', RUN_SPACINGS.map((s) => ({
        label: s.label, on: spec.spacing === s.id, patch: { spacing: s.id },
        title: def.id === 'hairpin' ? `${s.label}: how wide the half circle is` : `${s.label}: how far apart the ${things} are`,
      })));
    }
  }

  /*
   * THE TWENTY SIX, as a grid of capitals: one press picks, the one lit is the one the next click lays or, on a
   * letter that is selected, the one it is. `onPick` is handed the letter. A group of buttons, each named for what
   * it is, so a keyboard and a screen reader reach every one.
   */
  letterGrid(current, onPick, label) {
    const grid = el('div', 'tb-letter-grid');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', label);
    for (const letter of LETTERS) {
      const on = letter === current;
      const b = button(letter, on ? 'tb-seg-btn on' : 'tb-seg-btn', () => onPick(letter), letterNote(letter));
      b.dataset.letter = letter;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      grid.append(b);
    }
    return grid;
  }

  /*
   * THE LETTER TOOL'S CHOICE, under its button while it is in hand: which letter the next click lays, and what that
   * letter has to fly through. They are set before the click and the ghost in the room shows the letter in hand;
   * afterwards the piece is ordinary and its card changes it.
   */
  renderLetterOptions() {
    const box = this.letterBox;
    if (!box) {
      return;
    }
    const armed = this.host.armed === 'letter';
    box.hidden = !armed;
    box.textContent = '';
    if (!armed) {
      return;
    }
    const letter = this.host.letterTool;
    box.append(el('div', 'tb-run-label', 'Letter'));
    box.append(this.letterGrid(letter, (next) => this.host.setLetterTool(next), 'The letter the next click lays'));
    box.append(el('p', 'tb-letter-note', letterNote(letter)));
  }

  renderPalette() {
    for (const [id, b] of this.paletteButtons) {
      b.classList.toggle('on', this.host.armed === id);
      b.setAttribute('aria-pressed', this.host.armed === id ? 'true' : 'false');
    }
    this.renderRunOptions();
    this.renderLetterOptions();
    /* What the pointer does now is said by the coach line, and whether the card
     * shows changes the moment a tool is armed or put away. */
    this.renderCoach();
    this.renderCard();
    this.renderEmpty();
    this.renderLapBar();
    this.host.syncToolsBtn?.();
  }

  /* ---------------- render entry point ---------------- */

  renderAll() {
    const focus = this.captureFocus();
    this.renderPalette();
    this.renderInspector();
    this.renderSequence();
    this.renderResults();
    this.renderWhoop();
    this.restoreFocus(focus);
  }

  captureFocus() {
    const a = document.activeElement;
    if (!a || !a.dataset || !a.dataset.tbkey) {
      return null;
    }
    return {
      key: a.dataset.tbkey,
      start: a.selectionStart ?? null,
      end: a.selectionEnd ?? null,
    };
  }

  restoreFocus(f) {
    if (!f) {
      return;
    }
    const node = document.querySelector(`[data-tbkey="${CSS.escape(f.key)}"]`);
    if (!node) {
      return;
    }
    node.focus();
    if (f.start != null && node.setSelectionRange) {
      try {
        node.setSelectionRange(f.start, f.end);
      } catch (e) {
        /* number inputs refuse a selection range in some browsers */
      }
    }
  }

  /* ---------------- inspector ---------------- */

  /* A word, in the plain words where there is one: off the floor in a room,
   * off the ground on a field or a plot. */
  say(word) {
    const plain = WHOOP_WORDS[word];
    if (!plain) {
      return word;
    }
    return this.host.isWhoopRace() ? plain : plain.replace('off floor', 'off the ground');
  }

  field(key, label, value, onCommit, opts = {}) {
    const row = el('label', 'tb-field');
    row.append(el('span', 'tb-field-label', this.say(label)));
    const input = el('input');
    input.type = opts.text ? 'text' : 'number';
    const nudge = opts.step ?? 0.1;
    if (!opts.text) {
      /*
       * STEP IS "any", AND THE ARROWS ARE OURS.
       *
       * A number input with step 0.05 refuses every value that is not a
       * multiple of it, and a MultiGP opening is 1.524 m and a level
       * spacing is 1.557401. So the field showed a number the browser
       * then called invalid, and editing it raised "please select a valid
       * value, the two nearest valid values are 1.55 and 1.6" and threw
       * the edit away. Reported with a screenshot of exactly that.
       *
       * These are real lengths in metres and any of them is legal, so the
       * constraint is simply wrong and it is gone. What the step was
       * really for is the spinner, so the arrows are handled below and
       * nudge by the field's own increment, ten times that with shift.
       */
      input.step = 'any';
      if (opts.min != null) {
        input.min = opts.min;
      }
      if (opts.max != null) {
        input.max = opts.max;
      }
    }
    input.value = opts.text ? value : show(value, opts.places ?? 3);
    input.dataset.tbkey = key;
    const commit = () => {
      const raw = opts.text ? input.value : Number(input.value);
      if (!opts.text && !Number.isFinite(raw)) {
        return;
      }
      onCommit(raw);
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        commit();
        input.blur();
      } else if (!opts.text && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        /* The spinner the step used to provide, without the validation the
         * step also provided. Shift is a coarse nudge, the same modifier
         * the plan uses for a coarse drag. */
        e.preventDefault();
        const by = nudge * (e.shiftKey ? 10 : 1);
        const at = Number(input.value);
        let next = (Number.isFinite(at) ? at : 0) + (e.key === 'ArrowUp' ? by : -by);
        if (opts.min != null) {
          next = Math.max(opts.min, next);
        }
        if (opts.max != null) {
          next = Math.min(opts.max, next);
        }
        input.value = show(next, opts.places ?? 3);
        commit();
      }
      e.stopPropagation();
    });
    row.append(input);
    if (opts.suffix) {
      /* A field's unit is in its label and the suffix is hidden, except the
       * millimetres the whoop canvas prints under an inch field, which are the
       * other unit in small print and are shown wherever they are. */
      row.append(el('span', opts.mm ? 'tb-field-suffix tb-field-mm' : 'tb-field-suffix', opts.suffix));
    }
    return row;
  }

  /*
   * ONE UNIT AND ONE ORIGIN ON A CANVAS (MENUS-PLAN.md 4.2a).
   *
   * The whoop canvas gave one piece in three ways: its card in inches from the
   * middle of the room, the drawer in metres from a corner, and the readout in
   * metres. A pilot in a hall with a tape measure reads inches, and the middle
   * of the room is where the game puts a track, so the card's way is the
   * canvas's way: every length of a piece in inches, every place in inches
   * from the middle, and the millimetres under each in small print. The other
   * two canvases are in metres from the corner, as their rulers are. The
   * document is in metres from the corner whatever is shown.
   */
  inches() {
    return this.host.isWhoopRace();
  }

  /* A length field: metres on a field or a plot, inches over millimetres in a
   * room. `onCommit` is handed metres either way. */
  lengthField(key, label, metres, onCommit, opts = {}) {
    if (!this.inches()) {
      return this.field(key, label, metres, onCommit, {
        suffix: 'm', step: opts.step, places: opts.places, min: opts.min, max: opts.max,
      });
    }
    return this.field(key, `${this.say(label)} (in)`, metres / IN, (val) => onCommit(round6(val * IN)), {
      step: opts.stepIn ?? 1,
      places: opts.placesIn ?? 1,
      min: opts.min != null ? opts.min / IN : undefined,
      max: opts.max != null ? opts.max / IN : undefined,
      suffix: `${Math.round(metres * 1000)} mm`,
      mm: true,
    });
  }

  /* X or Y of a piece: from the corner in metres, or from the middle of the
   * room in inches. `onCommit` is handed the document's own coordinate. */
  placeField(key, axis, element, onCommit) {
    const doc = this.host.doc;
    const at = element.position[axis];
    if (!this.inches()) {
      return this.field(key, axis.toUpperCase(), at, onCommit, { suffix: 'm' });
    }
    const mid = axis === 'x' ? doc.field.width / 2 : doc.field.depth / 2;
    return this.field(key, `${axis.toUpperCase()} (in)`, (at - mid) / IN, (val) => onCommit(round6(mid + val * IN)), {
      step: 1, places: 1, suffix: `${Math.round((at - mid) * 1000)} mm`, mm: true,
    });
  }

  renderInspector() {
    const host = this.nodes.inspector;
    host.textContent = '';
    /* The details give the inspector most of the drawer while a flight path is in it: a grid of pictures wants the height. */
    document.body.classList.remove('tb-flighting');
    const doc = this.host.doc;
    const ids = [...this.host.selection];

    /* With nothing selected the panel is about the ground everything stands
     * on, named the canvas's way: a field, a room or a plot. It said Field on
     * all three (MENUS-PLAN.md 4.1). */
    host.append(el('h3', null, ids.length === 1 ? 'Element' : (ids.length ? `${ids.length} selected` : wordsFor(doc).area)));

    if (ids.length === 0) {
      this.renderFieldSettings(host, doc);
      return;
    }
    if (ids.length > 1) {
      host.append(el('p', 'tb-help', 'Drag to move them together. Delete removes them. Select one to edit its dimensions.'));
      /*
       * A PRESET APPLIES TO THE WHOLE SELECTION, and this is the half of
       * the request the single element picker does not answer. "So the
       * user doesn't have to customise each gate placement" means box
       * select the course and click once, not open ten inspectors.
       */
      const apertures = ids
        .map((id) => elementById(doc, id))
        .filter((e2) => e2 && ELEMENTS[e2.type]?.kind === KIND.APERTURE);
      /* A cube's faces are placed for the size they are, so a size chosen for them is not a thing to offer: the
       * presets are for the gates that are not part of one. */
      if (apertures.some((e2) => e2.group)) {
        host.append(el('p', 'tb-help', 'A cube is one piece, five gates that share their pipe. It is flown in at one face and out at another: change which with the Fly order tool.'));
      }
      /* A letter is sized by its width and height, and a standard gate's opening would make a W the size of a gate. */
      const loose = apertures.filter((e2) => !e2.group && !isLetterPiece(e2));
      if (loose.length) {
        this.renderGatePresets(host, loose);
      }
      return;
    }

    const element = elementById(doc, ids[0]);
    if (!element) {
      return;
    }
    const def = ELEMENTS[element.type];
    const freestyle = docModeOf(doc) === 'freestyle';
    host.append(el('p', 'tb-kind', `${def.label}. ${def.note}`));

    if (def.kind === KIND.ZONE) {
      this.renderGapInspector(host, element, def);
      return;
    }

    host.append(this.field(`name-${element.id}`, 'Name', element.name, (val) => {
      this.host.edit('rename', (d) => { elementById(d, element.id).name = val; });
    }, { text: true }));

    /* The flags of a five inch gate or a hurdle are the first thing asked about it, not the last: they were at the
     * foot of a column that is a screen and a half tall. The same choice is on the card in the room. */
    if (!freestyle && !this.host.isWhoopRace() && canFlag(element)) {
      this.renderFlagSidePicker(host, element);
    }

    /* A letter's own section is the first thing asked about it, as a gate's flags are: which letter it is and how big
     * it stands are what it is, and the flight path under it is a screen long. */
    if (!freestyle && isLetterPiece(element)) {
      this.renderLetterInspector(host, element);
    }

    if (def.kind === KIND.STRUCTURE) {
      this.renderStructureInspector(host, element, def);
      return;
    }
    if (def.kind === KIND.ROAD) {
      this.renderRoadInspector(host, element, def);
      return;
    }
    if (def.kind === KIND.VEHICLE) {
      this.renderVehicleInspector(host, element, def);
      return;
    }

    /* What the line does after, into and round a piece is a flying order question too: a figure from the owner's
     * catalogue of manoeuvres. A waypoint that belongs to one says so, and takes the whole figure out. */
    if (!freestyle && element.type === 'waypoint') {
      this.renderFigureNote(host, doc, element);
    }
    if (!freestyle && (def.kind === KIND.APERTURE || (def.kind === KIND.MARKER && element.type !== 'waypoint'))) {
      const entries = doc.sequence.filter((q) => q.elementId === element.id);
      const focusId = this.host.focusedPass?.(false) ?? null;
      const at = entries.find((q) => q.id === focusId) ?? entries[0] ?? null;
      if (at) {
        this.renderFlightPath(host, doc, element, at);
      }
    }

    /* How a stack is flown is a flying order question, and a map has none. A letter's holes are not a stack:
     * each is a gate of its own, picked on the pass. */
    if (!freestyle && def.kind === KIND.APERTURE && aperturesOf(element).length > 1 && !isLetterPiece(element)) {
      this.renderFigurePicker(host, doc, element);
    }
    if (def.kind === KIND.APERTURE && !isLetterPiece(element)) {
      this.renderGatePresets(host, [element]);
    }

    /* Paint has no base height: it is on the ground or it is not paint. A
     * Base field that changed a number nothing reads is a bug report
     * waiting to be filed, so a decal gets two columns rather than three.
     * So does a built thing on a track, whose base is the ground and cannot
     * be anything else (standsOnGround in ./seat.js): a gate is lifted on its
     * legs with Sill height, not off them. */
    const flat = def.kind === KIND.DECAL || standsOnGround(doc, element);
    const grid = el('div', flat ? 'tb-grid2' : 'tb-grid3');
    grid.append(
      this.placeField(`x-${element.id}`, 'x', element, (val) => {
        this.host.setElementCoord(element.id, 'x', val);
      }),
      this.placeField(`y-${element.id}`, 'y', element, (val) => {
        this.host.setElementCoord(element.id, 'y', val);
      }),
    );
    if (!flat) {
      grid.append(this.lengthField(`z-${element.id}`, 'Base', element.position.z, (val) => {
        this.host.edit('height', (d) => { elementById(d, element.id).position.z = val; });
      }));
    }
    host.append(grid);

    if (def.kind !== KIND.ANNOTATION) {
      this.appendYawField(host, element);
    }

    if (def.kind === KIND.APERTURE && !isLetterPiece(element)) {
      /*
       * PITCH IS SHOWN FOR EVERY APERTURE ELEMENT, not only for the dive
       * gate, because the tilt is a property of the aperture plane and an
       * angled ladder is a legitimate thing to build. It is described in
       * the terms the task uses: zero is a vertical gate, 90 is flown
       * straight down through.
       */
      host.append(this.field(`pitch-${element.id}`, this.inches() ? 'Tilt (degrees)' : 'Tilt', element.pitch * DEG, (val) => {
        this.host.edit('tilt', (d) => {
          const e2 = elementById(d, element.id);
          e2.pitch = Math.max(-90, Math.min(90, val)) * RAD;
        });
      }, { suffix: 'deg', step: 5, places: 1, min: -90, max: 90 }));
      host.append(el('p', 'tb-help', 'Tilt 0 is a vertical gate. Tilt 90 lays the aperture flat, so it is flown straight down or straight up through. Anything between is an angled dive gate.'));
    }

    /* Dimensions, all of them, named the way elements.js names them. */
    const dims = el('div', 'tb-grid2');
    const shape = def.kind === KIND.APERTURE ? apertureShapeOf(element) : 'square';
    /* A letter's dimensions are its width and its height, set in the letter's own section above. */
    for (const key of (isLetterPiece(element) ? [] : Object.keys(def.dims))) {
      /*
       * A HOOP AND A HEX GATE HAVE ONE OPENING AND ONE SIZE. There is no stack of hoops, so no count of
       * levels and no spacing; and a hoop is as high as it is wide and a hex gate as high as a hexagon
       * that wide is, so the height is not a field of its own: the width is, and the height follows.
       */
      if (shape !== 'square' && (key === 'levels' || key === 'clearH')) {
        continue;
      }
      /*
       * LEVEL SPACING ON A ONE LEVEL ELEMENT IS A FIELD THAT DOES NOTHING,
       * and a field that does nothing is the reason somebody has to ask
       * what it is. It appears only once there are two openings for it to
       * sit between. Same reading for a hidden field everywhere else in
       * this panel: a decal has no Base because paint has no height.
       */
      if (key === 'levelPitch' && Math.round(element.dims.levels) < 2) {
        continue;
      }
      const isCount = key === 'levels' || key === 'pads';
      const label = shape !== 'square' && key === 'clearW' ? (shape === 'circle' ? 'Diameter' : 'Across the points') : (DIM_LABELS[key] ?? key);
      /* A count is a count on every canvas; a length is in the canvas's unit. */
      const make = isCount ? this.field.bind(this) : this.lengthField.bind(this);
      dims.append(make(`dim-${element.id}-${key}`, label, element.dims[key], (val) => {
        this.host.edit('resize', (d) => {
          const e2 = elementById(d, element.id);
          /* Furniture is held to what a room can have; everything else may be
           * any length, as it always has been. */
          e2.dims[key] = isCount ? Math.max(1, Math.round(val)) : (isRoomType(e2.type) ? clampRoomSize(val) : Math.max(0, val));
          if (shape !== 'square' && key === 'clearW') {
            e2.dims.clearH = presetHeight({ clearW: e2.dims.clearW }, shape);
          }
          /*
           * Changing the opening height of a stack whose spacing is still
           * the one the OLD height implied leaves the frames overlapping
           * or a gap of nothing between them, and the author has to work
           * out the arithmetic to fix it. So the spacing follows, but only
           * while it is still the derived one: an author who has typed
           * their own spacing has said they mean it.
           */
          if (key === 'clearH' && e2.dims.levelPitch != null
            && Math.abs(e2.dims.levelPitch - levelPitchFor(element.dims.clearH)) < 1e-6) {
            e2.dims.levelPitch = levelPitchFor(e2.dims.clearH);
          }
        });
      }, {
        suffix: isCount ? '' : 'm',
        step: isCount ? 1 : 0.05,
        ...(isRoomType(element.type) ? { min: ROOM_SIZE_MIN, max: ROOM_SIZE_MAX } : {}),
      }));
    }
    host.append(dims);
    if (def.kind === KIND.APERTURE) {
      if (!isLetterPiece(element)) {
        this.renderApertureReadout(host, def, element);
        this.renderOpeningSizes(host, element);
      }
      /* Which sides have pipe. A map's gates are furniture with no opening
       * that scores, so taking a side off one would only be a broken gate. */
      if (!freestyle && shape === 'square') {
        this.renderFrameSides(host, element);
      } else if (!freestyle && isLetterPiece(element)) {
        this.renderLetterFrame(host, element);
      }
      /* A plain gate on a five inch track can be a letter: the way a track that was drawn with gates is edited. */
      if (!freestyle && canBecomeLetter(doc, element)) {
        host.append(el('h3', null, 'Make it a letter'));
        host.append(el('p', 'tb-help', 'This gate becomes a capital of pipe, standing where it stands and facing the way it faces, in the same place in the flying order. The gap the pass goes through is the one the letter is sized by.'));
        host.append(this.letterSelect('Letter', '', (next) => this.host.setPieceLetter(element.id, next),
          `make-letter-${element.id}`, 'Takes this gate\u2019s place in the track as a letter'));
      }
    }

    if (def.kind === KIND.DECAL) {
      this.renderDecalLogoPicker(host, doc, element);
    }

    /* A map's flagged gates keep the picker where it was. */
    if (def.flagSide && freestyle) {
      this.renderFlagSidePicker(host, element);
    }

    if (def.kind === KIND.ANNOTATION) {
      host.append(this.field(`text-${element.id}`, 'Text', element.text ?? '', (val) => {
        this.host.edit('label', (d) => { elementById(d, element.id).text = val; });
      }, { text: true }));
    }

    if (freestyle) {
      if (isSequenceable(element)) {
        host.append(el('p', 'tb-help', 'On a map this is furniture: nothing is timed through it and there is no order to fly it in. It is solid, and it is there to thread.'));
      }
      return;
    }

    /* Every sequence entry that points at this element. For a ladder that is
     * where the two levels and the two faces are edited. */
    const entries = doc.sequence
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.elementId === element.id);

    if (isSequenceable(element)) {
      const fig = matchingFigure(doc, element);
      const named = fig && fig !== 'single';
      host.append(el('h3', null, named
        ? `Passes, ${entries.length}`
        : (entries.length > 1 ? 'In the track, twice or more' : 'In the track')));
      if (!entries.length) {
        host.append(el('p', 'tb-help', 'Not in the flying order.'));
        host.append(button('Add to the track', 'tb-btn', () => this.host.addToSequence(element.id)));
      }
      for (const { s, i } of entries) {
        host.append(this.sequenceCard(doc, element, s, i, named));
      }
      if (def.kind === KIND.APERTURE && aperturesOf(element).length > 1 && !named) {
        const letter = isLetterPiece(element);
        host.append(button(letter ? 'Fly another gap' : 'Fly another level', 'tb-btn', () => this.host.addLevel(element.id),
          letter ? 'Add a pass through the next gap of this letter that is not flown yet.' : 'Add another gate on this stack, on the next unused opening.'));
      }
    }
  }

  /*
   * Whether an asset that can stand on end does, as the two choices the inspector and the card both offer: Flat, and
   * On end. Two words, not a number: a quarter turn is the only thing a box can be turned about a horizontal axis
   * and stay a box, which is why the document's pitch is read to the nearest quarter (tiltOf).
   */
  standItems(element) {
    const id = element.id;
    const q = tiltOf(element);
    const stand = (pitch, label) => () => this.host.edit(label, (d) => {
      const e2 = elementById(d, id);
      if (e2) {
        e2.pitch = pitch;
      }
    });
    return [
      { label: 'Flat', on: q === 0, run: stand(0, 'lay it flat') },
      { label: 'On end', on: q !== 0, run: stand(Math.PI / 2, 'stand it on end') },
    ];
  }

  /*
   * The heading, in degrees because that is how people think about a
   * heading, stored in radians. It goes through the app rather than
   * straight to setYaw, because a building keeps to the compass: the field
   * snaps it, and the first time an author types 40 the tool says why it
   * came back as 0.
   */
  appendYawField(host, element) {
    const quarter = turnsOf(element.type) === 'quarter';
    /* A marker nobody has turned shows the way its square sits, which is
     * what a typed heading turns it from: see shownYaw in app.js. */
    const yaw = this.host.shownYaw ? this.host.shownYaw(element) : element.yaw;
    /* Turn, in degrees, said as the card says it on the whoop canvas. */
    host.append(this.field(`yaw-${element.id}`, this.inches() ? 'Turn (degrees)' : 'Yaw', yaw * DEG, (val) => {
      this.host.setElementYaw(element.id, val * RAD);
    }, { suffix: 'deg', step: quarter ? 90 : 5, places: 1 }));
    if (quarter) {
      host.append(el('p', 'tb-help', isRoomType(element.type)
        ? 'Keeps to quarter turns: it is made of boxes, and they stand square to the room.'
        : 'Keeps to the compass, in quarter turns, until the physics learns turned boxes.'));
    }
  }

  /* X, Y and the base height, the one grid every element with a place has. */
  appendPositionGrid(host, element) {
    const grid = el('div', 'tb-grid3');
    grid.append(
      this.field(`x-${element.id}`, 'X', element.position.x, (val) => {
        this.host.setElementCoord(element.id, 'x', val);
      }, { suffix: 'm' }),
      this.field(`y-${element.id}`, 'Y', element.position.y, (val) => {
        this.host.setElementCoord(element.id, 'y', val);
      }, { suffix: 'm' }),
      this.field(`z-${element.id}`, 'Base', element.position.z, (val) => {
        /* An asset on a map may be sunk, to hide some of it: lowestBase. */
        this.host.edit('height', (d) => {
          const e2 = elementById(d, element.id);
          e2.position.z = Math.max(lowestBase(d, e2), val);
        });
      }, { suffix: 'm', min: lowestBase(this.host.doc, element) }),
    );
    host.append(grid);
  }

  /*
   * One of an asset's dimensions, named, stepped and bounded the way
   * src/props/types.js says. Whatever is typed is clamped by clampDim, the
   * same function the document reader uses, so the field can never hold a
   * number the file would not.
   */
  propDimField(element, def, key, prefix = 'dim') {
    const lim = def.limits?.[key] ?? null;
    const kind = lim ? lim[2] : 'm';
    /* On the card the unit is in the label, as X and Y are, and not under the field. */
    const onCard = prefix !== 'dim';
    const named = def.labels?.[key] ?? DIM_LABELS[key] ?? key;
    return this.field(`${prefix}-${element.id}-${key}`, onCard && kind === 'm' ? `${named} (m)` : named, element.dims[key], (val) => {
      this.host.edit('resize', (d) => {
        const e2 = elementById(d, element.id);
        if (e2) {
          e2.dims[key] = clampDim(element.type, key, val);
          fitDims(element.type, e2.dims);
        }
      });
    }, {
      suffix: kind === 'm' && !onCard ? 'm' : '',
      step: LIMIT_STEP[kind] ?? 0.1,
      places: LIMIT_PLACES[kind] ?? 2,
      min: lim ? lim[0] : undefined,
      max: lim ? lim[1] : undefined,
    });
  }

  /*
   * A FREESTYLE ASSET: its look, where it stands, which way it faces, and
   * its size. The style buttons also set the size a style starts at
   * (styleDims), because a warehouse is not an office with a different
   * texture: it is lower and wider, and choosing Warehouse on a six storey
   * office block and keeping six storeys builds nobody's warehouse.
   */
  /* An asset's look, and the size that look starts at (styleDims), as one edit. */
  setAssetStyle(element, style) {
    this.host.edit('style', (d) => {
      const e2 = elementById(d, element.id);
      if (!e2) {
        return;
      }
      e2.style = style;
      const sized = styleDims(element.type, style);
      if (sized) {
        for (const [k, v] of Object.entries(sized)) {
          e2.dims[k] = clampDim(element.type, k, v);
        }
      }
    });
  }

  renderStructureInspector(host, element, def) {
    if (def.styles) {
      const current = propStyleOf(element);
      host.append(el('h3', null, 'Style'));
      const seg = el('div', 'tb-seg');
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', 'Style');
      for (const style of def.styles) {
        const b = button(styleLabel(style), current === style ? 'tb-seg-btn on' : 'tb-seg-btn', () => this.setAssetStyle(element, style));
        b.setAttribute('aria-pressed', current === style ? 'true' : 'false');
        seg.append(b);
      }
      host.append(seg);
    }

    this.appendPositionGrid(host, element);
    if (element.position.z < -0.005) {
      /* Said in plain words, because a part that is gone from the preview is
       * otherwise a bug report: it is under the ground, which hides it. */
      host.append(el('p', 'tb-help', `Sunk ${show(-element.position.z, 2)} m into the ground. What is under the ground is neither drawn nor solid; a negative Base is how a piece is half hidden.`));
    }
    this.appendYawField(host, element);
    /*
     * STANDING ON END, for the assets that can: a container is as tall as it
     * is long, and an open one is then a square shaft with both ends open.
     */
    if (def.tilt) {
      this.segRow(host, 'Stands', this.standItems(element));
      host.append(el('p', 'tb-help', element.type === 'containers'
        ? 'On end it stands as tall as it is long, with the stack beside it. The open style stood on end is a square shaft, open at both ends: a line to dive down.'
        : 'On end it stands as tall as it is long.'));
    }

    host.append(el('h3', null, 'Size'));
    const dims = el('div', 'tb-grid2');
    for (const key of Object.keys(def.dims)) {
      const field = this.propDimField(element, def, key);
      if (key === 'variant') {
        /*
         * REROLL, beside the number it rolls. A variant is a seed, not a
         * quantity: 7 is not more of anything than 6. Nobody wants to type
         * a seed, they want a different one, so the button steps it round
         * one to 99 and the field stays for the author who wrote down the
         * one they liked.
         */
        const cell = el('div', 'tb-reroll');
        cell.append(field, button('Reroll', 'tb-btn tb-reroll-btn', () => {
          this.host.edit('reroll', (d) => {
            const e2 = elementById(d, element.id);
            if (e2) {
              const v = Math.round(Number(e2.dims.variant) || 1);
              e2.dims.variant = clampDim(element.type, 'variant', (v % 99) + 1);
            }
          });
        }, 'Roll a different one'));
        dims.append(cell);
      } else {
        dims.append(field);
      }
    }
    host.append(dims);

    /* What that adds up to, in the terms a pilot thinks in. */
    const b = localBoundsOf(element);
    const tall = elementHeight(def, element.dims, propStyleOf(element), tiltOf(element));
    const sunk = element.position.z < -0.005 ? `, with ${show(-element.position.z, 1)} m of it under the ground` : '';
    const doorway = element.type === 'hollowChimney'
      ? ` Its doorway is ${show(element.dims.door, 1)} m wide and ${show(hollowDoorHeight(element.dims.door, element.dims.height), 1)} m high.`
      : '';
    host.append(el('p', 'tb-fig-blurb', `About ${show(tall, 1)} m tall, taking ${show(b.x1 - b.x0, 1)} by ${show(b.z1 - b.z0, 1)} m of ground${sunk}.${doorway}`));
  }

  /* A heading and a row of segment buttons, one of them on: the inspector's
   * way of offering a choice of a few words. `items` are { label, on, run,
   * disabled, title }. */
  segRow(host, heading, items) {
    host.append(el('h3', null, heading));
    const seg = el('div', 'tb-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', heading);
    for (const it of items) {
      const b = button(it.label, it.on ? 'tb-seg-btn on' : 'tb-seg-btn', () => {
        if (!it.on && !it.disabled) {
          it.run();
        }
      }, it.title);
      b.setAttribute('aria-pressed', it.on ? 'true' : 'false');
      if (it.disabled) {
        b.disabled = true;
      }
      seg.append(b);
    }
    host.append(seg);
  }

  /* Whether a road closes and how many lanes it has, as the choices the inspector and the card both offer. */
  roadShapeItems(element) {
    const id = element.id;
    const closed = element.closed === true;
    const n = element.nodes.length;
    return [
      { label: 'Open road', on: !closed, run: () => this.host.setRoadClosed(id, false) },
      {
        label: 'Loop',
        on: closed,
        run: () => this.host.setRoadClosed(id, true),
        disabled: !closed && n < 3,
        title: !closed && n < 3 ? 'A loop needs three nodes. Add one first.' : 'Join the last node back to the first',
      },
    ];
  }

  roadLaneItems(element) {
    const id = element.id;
    const lanes = element.dims.lanes === 1 ? 1 : 2;
    return [
      { label: 'One lane', on: lanes === 1, run: () => this.host.editRoad('lanes', id, (e2) => { e2.dims.lanes = 1; }) },
      { label: 'Two lanes', on: lanes === 2, run: () => this.host.editRoad('lanes', id, (e2) => { e2.dims.lanes = 2; }) },
    ];
  }

  /*
   * A ROAD: whether it closes into a loop, its lanes, how wide it is and
   * how wide its bends are eased, where it starts, and what that adds up to.
   * Its nodes are edited on the road, not here: drag one, drag the knob between
   * two to add one, click one and press Delete. A change that moves the
   * road's line (closing it, a radius) keeps every car on it where it was
   * (reseatVehicles in app.js).
   */
  renderRoadInspector(host, element, def) {
    const doc = this.host.doc;
    const r = roadOf(element);
    const n = element.nodes.length;
    const closed = element.closed === true;
    const id = element.id;
    this.segRow(host, 'Shape', this.roadShapeItems(element));
    this.segRow(host, 'Lanes', this.roadLaneItems(element));

    host.append(el('h3', null, 'Size'));
    const dims = el('div', 'tb-grid2');
    for (const key of ['width', 'radius']) {
      const lim = def.limits[key];
      dims.append(this.field(`dim-${id}-${key}`, def.labels[key], element.dims[key], (val) => {
        this.host.editRoad('resize', id, (e2) => { e2.dims[key] = clampByLimits(def, key, val); });
      }, { suffix: 'm', step: key === 'width' ? 0.5 : 1, places: 2, min: lim[0], max: lim[1] }));
    }
    host.append(dims);

    /* Where it starts: its first node, which is its position. */
    const grid = el('div', 'tb-grid2');
    grid.append(
      this.field(`x-${id}`, 'Start X', element.position.x, (val) => {
        this.host.edit('move', (d) => { elementById(d, id).position.x = val; });
      }, { suffix: 'm' }),
      this.field(`y-${id}`, 'Start Y', element.position.y, (val) => {
        this.host.edit('move', (d) => { elementById(d, id).position.y = val; });
      }, { suffix: 'm' }),
    );
    host.append(grid);

    const tight = r.report.tightest;
    const bent = Number.isFinite(tight.radius);
    const squeezed = bent && tight.radius < r.radius * 0.95;
    const drives = !closed
      ? 'Every car on an open road drives its middle, out to the end and back.'
      : (r.lanes === 2
        ? `A car keeps left, ${show(r.laneOffset, 2)} m off the middle, and one set to Reverse drives the other lane the other way.`
        : 'Every car drives the middle of its one lane, so two going opposite ways would meet head on.');
    host.append(el('p', 'tb-fig-blurb', r.centre.points.length < 2
      ? 'This road has no line to drive yet: see the warnings.'
      : `${show(r.centre.length, 1)} m ${closed ? 'round' : 'end to end'}, ${n} node${n === 1 ? '' : 's'}. ${bent
        ? `Its tightest bend is ${show(tight.radius, 1)} m${squeezed ? `, tighter than the ${show(r.radius, 1)} m asked for where two nodes are close` : ''}.`
        : 'It runs straight.'} ${drives}`));

    host.append(el('h3', null, 'Nodes'));
    const active = this.host.activeNode;
    if (active && active.id === id && active.index < n) {
      host.append(el('p', 'tb-help', `Node ${active.index + 1} is picked${active.index === 0 ? ', the one the road starts at' : ''}.`));
      const row = el('div', 'tb-row-btns');
      row.append(button('Delete node', 'tb-btn tb-danger', () => this.host.deleteRoadNode(id, active.index), 'Shortcut: Delete'));
      host.append(row);
    }
    host.append(el('p', 'tb-help', 'Drag a node to reshape the road, and drag the road itself to move it. Drag a + between two nodes to add one there. Click a node and press Delete to take it out.'));

    const cars = doc.elements.filter((e) => e.type === 'vehicle' && e.road === id);
    host.append(el('h3', null, cars.length ? `On this road, ${cars.length}` : 'On this road'));
    if (!cars.length) {
      host.append(el('p', 'tb-help', 'No vehicles yet. Pick Vehicle in the palette and click on the road.'));
      return;
    }
    const list = el('div', 'tb-spare');
    cars.forEach((car, i) => {
      const row = el('div', 'tb-spare-row');
      row.append(el('span', null, car.name || `${styleLabel(car.style)} ${i + 1}`));
      row.append(button('Select', 'tb-mini', () => {
        this.host.setSelection([car.id]);
        this.host.focusSelection();
      }));
      list.append(row);
    });
    host.append(list);
  }

  /* How a car drives and which way, as the choices the inspector and the card both offer. */
  vehicleDrivingItems(element, def) {
    const id = element.id;
    const drift = element.drift === true;
    const styleSpeed = (style) => styleDims('vehicle', style)?.speed ?? def.dims.speed;
    return [
      {
        label: 'Traffic',
        on: !drift,
        run: () => this.host.edit('drift', (d) => {
          const e2 = elementById(d, id);
          e2.drift = false;
          e2.dims.speed = clampByLimits(def, 'speed', styleSpeed(e2.style));
        }),
      },
      {
        label: 'Drift car',
        on: drift,
        title: `Corners twice as hard and slides, its nose into every bend, at ${Math.round(DRIFT.speed * KMH)} km/h on the straights`,
        run: () => this.host.edit('drift', (d) => {
          const e2 = elementById(d, id);
          e2.drift = true;
          e2.dims.speed = clampByLimits(def, 'speed', DRIFT.speed);
        }),
      },
    ];
  }

  vehicleDirectionItems(element) {
    const id = element.id;
    const reverse = element.reverse === true;
    return [
      { label: 'Forward', on: !reverse, run: () => this.host.edit('direction', (d) => { elementById(d, id).reverse = false; }) },
      { label: 'Reverse', on: reverse, run: () => this.host.edit('direction', (d) => { elementById(d, id).reverse = true; }) },
    ];
  }

  /*
   * A VEHICLE: which of the town's cars, how it drives, where it starts and
   * its colour. Its speed is m/s in the document and km/h here, the unit a
   * driver reads, converted at this boundary and nowhere else. Where it is
   * comes from its road and its start along it, so there is no X and Y:
   * drag it along the road, or type how far along it starts.
   */
  renderVehicleInspector(host, element, def) {
    const doc = this.host.doc;
    const id = element.id;
    const road = elementById(doc, element.road);
    const onRoad = Boolean(road && ELEMENTS[road.type]?.kind === KIND.ROAD);
    const styleSpeed = (style) => styleDims('vehicle', style)?.speed ?? def.dims.speed;

    host.append(el('h3', null, 'Style'));
    const seg = el('div', 'tb-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Style');
    for (const style of def.styles) {
      const on = element.style === style;
      const b = button(styleLabel(style), on ? 'tb-seg-btn on' : 'tb-seg-btn', () => {
        this.host.edit('style', (d) => {
          const e2 = elementById(d, id);
          if (!e2) {
            return;
          }
          e2.style = style;
          /* A style starts at its own speed, as a building starts at its
           * own size; the drift car keeps the drift car's. */
          if (!e2.drift) {
            e2.dims.speed = clampByLimits(def, 'speed', styleSpeed(style));
          }
        });
      });
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      seg.append(b);
    }
    host.append(seg);

    this.segRow(host, 'Driving', this.vehicleDrivingItems(element, def));
    this.segRow(host, 'Direction', this.vehicleDirectionItems(element));

    host.append(el('h3', null, 'Speed and start'));
    const grid = el('div', 'tb-grid2');
    const [lo, hi] = def.limits.speed;
    grid.append(
      this.field(`speed-${id}`, def.labels.speed, element.dims.speed * KMH, (val) => {
        this.host.edit('speed', (d) => { elementById(d, id).dims.speed = clampByLimits(def, 'speed', val / KMH); });
      }, { suffix: 'km/h', step: 5, places: 0, min: Math.round(lo * KMH), max: Math.round(hi * KMH) }),
      this.field(`offset-${id}`, def.labels.offset, element.dims.offset, (val) => {
        this.host.edit('start', (d) => { elementById(d, id).dims.offset = clampByLimits(def, 'offset', val); });
      }, { suffix: 'm', step: 1, places: 2, min: def.limits.offset[0], max: def.limits.offset[1] }),
    );
    host.append(grid);
    const variant = el('div', 'tb-reroll');
    variant.append(this.field(`dim-${id}-variant`, def.labels.variant, element.dims.variant, (val) => {
      this.host.edit('resize', (d) => { elementById(d, id).dims.variant = clampByLimits(def, 'variant', val); });
    }, { step: 1, places: 0, min: def.limits.variant[0], max: def.limits.variant[1] }), button('Reroll', 'tb-btn tb-reroll-btn', () => {
      this.host.edit('reroll', (d) => {
        const e2 = elementById(d, id);
        const v = Math.round(Number(e2.dims.variant) || 1);
        e2.dims.variant = clampByLimits(def, 'variant', (v % 99) + 1);
      });
    }, 'Paint it another colour'));
    const colour = el('div', 'tb-grid2');
    colour.append(variant);
    host.append(colour);

    const closed = onRoad && road.closed === true;
    const twoLanes = closed && road.dims.lanes !== 1;
    const ways = !onRoad ? ''
      : (!closed
        ? `Forward sets off along ${road.name || 'the road'} from its first node, Reverse back toward it; either way it turns round at each end.`
        : (twoLanes
          ? 'Forward keeps to the left lane in the order the road was laid, Reverse drives the other lane the other way.'
          : 'Forward goes round in the order the road was laid, Reverse the other way.'));
    host.append(el('p', 'tb-fig-blurb', onRoad
      ? `On ${road.name || 'its road'}, starting ${show(element.dims.offset, 1)} m round from its first node, at ${Math.round(element.dims.speed * KMH)} km/h on the straights. It slows for every bend by itself. ${ways}`
      : 'This vehicle has no road, so it stays parked in the row along the south edge of the plot. Drag it onto a road.'));
    if (onRoad) {
      const row = el('div', 'tb-row-btns');
      row.append(button('Select its road', 'tb-btn', () => {
        this.host.setSelection([road.id]);
        this.host.focusSelection();
      }));
      host.append(row);
    }
    host.append(el('p', 'tb-help', 'Drag the car to slide it along its road. A car dropped on the right hand half of a two lane loop drives the other lane.'));
  }

  /*
   * A NAMED GAP. Its name is the point of it, the way a skate game's gaps
   * are known by name, so the name is the first and biggest thing here;
   * then what it is worth, from the tiers a skate game uses; then the
   * window. Width runs across its heading and Height up from its base.
   */
  renderGapInspector(host, element, def) {
    const name = this.field(`name-${element.id}`, 'Gap name', element.name, (val) => {
      this.host.edit('rename', (d) => { elementById(d, element.id).name = String(val).slice(0, 40); });
    }, { text: true });
    name.classList.add('tb-gap-name');
    host.append(name);

    host.append(el('h3', null, 'Points'));
    const seg = el('div', 'tb-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Points');
    for (const pts of GAP_POINTS) {
      const on = element.points === pts;
      const b = button(String(pts), on ? 'tb-seg-btn on' : 'tb-seg-btn', () => {
        this.host.edit('points', (d) => {
          const e2 = elementById(d, element.id);
          if (e2) {
            e2.points = pts;
          }
        });
      });
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      seg.append(b);
    }
    host.append(seg);

    host.append(el('h3', null, 'Window'));
    const dims = el('div', 'tb-grid2');
    for (const key of Object.keys(def.dims)) {
      dims.append(this.propDimField(element, def, key));
    }
    host.append(dims);
    this.appendPositionGrid(host, element);
    this.appendYawField(host, element);
    host.append(el('p', 'tb-help', `A window ${show(element.dims.width, 1)} m across its heading and ${show(element.dims.height, 1)} m up from its base, ${show(element.position.z, 1)} m off the ground. It is not solid and it is not drawn in the world: a pilot finds it by flying through it.`));
  }

  renderFigurePicker(host, doc, element) {
    const current = matchingFigure(doc, element);
    const n = aperturesOf(element).length;
    host.append(el('h3', null, this.say('How it is flown')));
    host.append(el('p', 'tb-help', 'Each hole is its own gate. Pick the figure, then fly that line. The racing line shows the wrap.'));
    const grid = el('div', 'tb-fig-grid');
    for (const fig of figuresFor(element)) {
      const b = el('button', current === fig.id ? 'tb-fig-card on' : 'tb-fig-card');
      b.type = 'button';
      b.title = fig.hint;
      b.append(figureIcon(fig.id, n));
      b.append(el('strong', null, fig.label));
      grid.append(b);
      b.addEventListener('click', () => this.host.applyFigure(element.id, fig.id));
    }
    host.append(grid);
    /* A spiral goes round the side of the structure, and it is flown round either: the way it turns is the pilot's left or right. */
    if (current && HANDED_FIGURES.includes(current)) {
      const hand = figureHandOf(consecutiveEntries(doc, element.id));
      this.segRow(host, 'Which way it turns', [['Left', 'left'], ['Right', 'right']].map(([label, value]) => ({
        label, on: hand === value, run: () => this.host.applyFigure(element.id, current, { hand: value }),
        title: `${label} of the structure as flown: the line goes round that side between the holes`,
      })));
    }
    const blurb = current
      ? figureBlurb(element, current)
      : 'This mix is not a named figure. Each hole you listed still counts as its own gate.';
    if (blurb) {
      host.append(el('p', 'tb-fig-blurb', blurb));
    }
  }

  /* ---------------- flight path ---------------- */

  /*
   * THE FLIGHT PATH OF A PASS, in the details. The owner's catalogue of manoeuvres, laid as figures (manoeuvres.js,
   * flightpaths.js): what the line does after the piece, into it, and, for a flag, round it. Each is a card with the
   * figure's own picture, so a choice is made by looking, and each is a run of waypoints in the flying order that
   * can be dragged to reshape it and taken out in one press. The options under a figure that is laid change that
   * figure where it is.
   */
  renderFlightPath(host, doc, element, at) {
    const kind = kindOf(element);
    const cls = trackClassOf(doc);
    const number = gateNumberOf(doc, at.id);
    const slots = kind === KIND.MARKER ? ['around', 'then', 'into'] : ['then', 'into'];
    /* A figure round a flag stands on both sides of its pass, so it is that and not also a Then and an Into. */
    const around = kind === KIND.MARKER ? aroundOf(doc, at.id) : null;
    const found = {
      then: around ? null : thenOf(doc, at.id),
      into: around ? null : intoOf(doc, at.id),
      around,
    };
    if (!slots.includes(this.flightTab)) {
      this.flightTab = 'then';
    }
    const section = el('div', 'tb-fp');
    section.id = 'tb-flight';
    document.body.classList.add('tb-flighting');
    section.append(el('h3', null, 'Flight path'));
    section.append(el('p', 'tb-help', `What the line does ${number != null ? `at pass ${number}` : 'here'}: ${kind === KIND.MARKER ? 'round the flag, ' : ''}after it, or into it. Left and right are as flown. A figure is waypoints, so it can be dragged into shape, and one press takes it out.`));
    /* One slot at a time, because a grid of fourteen pictures is a screen of its own: a dot on a tab says there is a figure laid in it. */
    const seg = el('div', 'tb-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Which flight path');
    const labels = { around: 'Round it', then: 'Then', into: 'Into it' };
    const titles = {
      around: 'A turn round the flag: flown round it and never over it',
      then: 'What the line does after this pass',
      into: 'What the line does before this pass, on the way in',
    };
    for (const slot of slots) {
      const on = this.flightTab === slot;
      const b = button(labels[slot], `${on ? 'tb-seg-btn on' : 'tb-seg-btn'}${found[slot] ? ' has' : ''}`, () => {
        this.flightTab = slot;
        this.renderInspector();
      }, `${titles[slot]}${found[slot] ? `. Laid: ${figureName(found[slot].spec)}` : ''}`);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      seg.append(b);
    }
    section.append(seg);
    section.append(el('p', 'tb-fp-laid', found[this.flightTab] ? `Laid: ${figureName(found[this.flightTab].spec)}` : 'Nothing laid.'));
    if (this.flightTab === 'around') {
      this.flightAround(section, doc, at, cls);
    } else {
      this.flightSlot(section, doc, at, this.flightTab, cls);
    }
    if (kind === KIND.APERTURE) {
      this.flightPiece(section, doc, at);
    }
    host.append(section);
  }

  /* A card of the grid: the figure's picture and its name, lit when it is the one that is laid. A null spec is None. */
  flightCard(spec, label, on, onClick, title, cls) {
    const b = el('button', on ? 'tb-fig-card on' : 'tb-fig-card');
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.append(figureGlyphSvg(spec, cls));
    b.append(el('strong', null, label));
    b.addEventListener('click', onClick);
    return b;
  }

  /* The choices a flight path is laid with, for the figure that is laid, as rows of words; changing one lays it again. */
  flightOptions(host, at, slot, current) {
    const def = manoeuvreById(current.id);
    if (!def) {
      return;
    }
    /* Whatever else the figure did (a pass back through the gate) is the figure it was, and a figure laid again at a
     * size or a heading of its own is a plain one: the pass it came back through goes with it. */
    const lay = (patch) => {
      const next = { ...current, ...patch };
      delete next.again;
      this.host.setFlightPath(at.id, slot, next);
    };
    const row = (heading, items) => this.segRow(host, heading, items.map(([label, key, value, title]) => ({
      label, on: current[key] === value, run: () => lay({ [key]: value }), title,
    })));
    if (def.hand) {
      row('Which way', [['Left', 'hand', 'left'], ['Right', 'hand', 'right']]);
    }
    if (def.degs) {
      row('How far round', def.degs.map((d) => [`${d}°`, 'deg', d]));
    }
    if (def.sense) {
      row(def.id === 'hop' ? 'Over or under' : 'Up or down', def.id === 'hop'
        ? [['Over', 'sense', 'up'], ['Under', 'sense', 'down']]
        : [['Up', 'sense', 'up'], ['Down', 'sense', 'down']]);
    }
    if (def.count) {
      row('Weaves', def.count.map((n) => [String(n), 'count', n]));
    }
    if (def.bias) {
      row('Exit leans', [['Straight', 'bias', 'none'], ['Left', 'bias', 'left'], ['Right', 'bias', 'right'], ['Up', 'bias', 'up'], ['Down', 'bias', 'down']]);
    }
    if (def.id !== 'straight') {
      row('Size', [['Tight', 'size', 'tight'], ['Standard', 'size', 'standard'], ['Wide', 'size', 'wide']]);
    }
  }

  /* The slot after a pass, or the one before it: None, then the manoeuvres. */
  flightSlot(host, doc, at, slot, cls) {
    const found = slot === 'then' ? thenOf(doc, at.id) : intoOf(doc, at.id);
    const draft = this.flight[slot];
    if (found && found.spec) {
      for (const key of ['hand', 'deg', 'sense', 'size', 'count', 'bias']) {
        if (found.spec[key] !== undefined) {
          draft[key] = found.spec[key];
        }
      }
    }
    const grid = el('div', 'tb-fig-grid');
    grid.append(this.flightCard(null, 'None', !found,
      () => this.host.clearFlightPath(at.id, slot),
      slot === 'then' ? 'Nothing laid after this pass: the line goes on to the next piece.' : 'Nothing laid into this pass: the line comes in from the piece before it.', cls));
    for (const m of MANOEUVRES) {
      const spec = { ...draft, id: m.id };
      const on = Boolean(found && found.spec.id === m.id);
      grid.append(this.flightCard(spec, m.label, on, () => this.host.setFlightPath(at.id, slot, spec),
        `${m.hint}${m.also.length ? ` Also called ${m.also.join(', ')}.` : ''}`, cls));
    }
    host.append(grid);
    if (found && found.spec) {
      this.flightOptions(host, at, slot, found.spec);
    }
  }

  /* Round a flag, a cone or a pole: a turn of 90, 180 or 360 degrees round it, flat, climbing or descending. */
  flightAround(host, doc, at, cls) {
    const found = aroundOf(doc, at.id);
    const draft = this.flight.around;
    if (found && found.spec) {
      draft.hand = found.spec.hand;
      draft.deg = found.spec.deg;
    } else {
      draft.hand = defaultAroundHand(doc, at.id);
    }
    const grid = el('div', 'tb-fig-grid');
    grid.append(this.flightCard(null, 'None', !found,
      () => this.host.clearFlightPath(at.id, 'around'),
      'The line passes the flag and goes on: no turn round it.', cls));
    for (const id of ['turn', 'climb', 'descend']) {
      const m = manoeuvreById(id);
      const spec = { ...draft, id };
      grid.append(this.flightCard(spec, m.label, Boolean(found && found.spec.id === id),
        () => this.host.setFlightPath(at.id, 'around', spec),
        `${m.hint} Round the flag at the turn clearance, so it is flown round and never over.`, cls));
    }
    host.append(grid);
    if (found && found.spec) {
      const lay = (patch) => this.host.setFlightPath(at.id, 'around', { ...found.spec, ...patch });
      this.segRow(host, 'Which way', [['Left', 'left'], ['Right', 'right']].map(([label, hand]) => ({
        label, on: found.spec.hand === hand, run: () => lay({ hand }),
      })));
      this.segRow(host, 'How far round', [90, 180, 360].map((deg) => ({
        label: `${deg}°`, on: found.spec.deg === deg, run: () => lay({ deg }),
      })));
    }
  }

  /*
   * THE FIGURES THAT ARE A GATE'S OWN: round a flagged leg, a turnaround, a power loop gate. Each is a figure and
   * usually a second pass through the gate, laid in one press, and then it is the gate's "Then" like any other.
   */
  flightPiece(host, doc, at) {
    const flags = flagsAsFlown(doc, at.id);
    const act = (heading, items) => this.segRow(host, heading, items.map(([label, run, title]) => ({
      label, on: false, run, title,
    })));
    host.append(el('h3', 'tb-fp-slot', 'Round this gate'));
    for (const side of ['left', 'right']) {
      if (flags[side]) {
        act(`Round the ${side} flag`, [
          ['Hairpin', () => this.host.setPieceFlight(at.id, 'leg', side, 'hairpin'), 'Through, then a flat 180 round the flagged leg'],
          ['Spiral up', () => this.host.setPieceFlight(at.id, 'leg', side, 'spiralUp'), 'Through, then a climbing 180 round the flagged leg'],
          ['Spiral down', () => this.host.setPieceFlight(at.id, 'leg', side, 'spiralDown'), 'Through, then a descending 180 round the flagged leg'],
          ['Orbit', () => this.host.setPieceFlight(at.id, 'leg', side, 'orbit'), 'Through, a full circle round the flagged leg, and back through the gate the way it went in'],
        ]);
      }
    }
    if (flags.left && flags.right) {
      act('Both flags', [['Figure 8', () => this.host.setPieceFlight(at.id, 'leg', 'left', 'figure8'), 'Through, round one leg, back through, round the other, back through']]);
    }
    act('Turnaround', [
      ['Hairpin left', () => this.host.setPieceFlight(at.id, 'turnaround', 'flat', 'left'), 'Through, a flat 180 to the left, and back through the same gate reversed'],
      ['Hairpin right', () => this.host.setPieceFlight(at.id, 'turnaround', 'flat', 'right'), 'Through, a flat 180 to the right, and back through the same gate reversed'],
      ['Over the top', () => this.host.setPieceFlight(at.id, 'turnaround', 'over'), 'Through, a reverse Split-S over the top, and a drop back through the gate reversed'],
    ]);
    act('Power loop gate', [['Loop', () => this.host.setPieceFlight(at.id, 'powerLoop'), 'Through, a loop over the top that starts at the gate, and through again the same way']]);
  }

  /* A waypoint that is a point of a figure says which, and takes the whole figure out. */
  renderFigureNote(host, doc, element) {
    const spec = parseFigureName(element.name);
    if (!spec) {
      return;
    }
    const entry = doc.sequence.find((q) => q.elementId === element.id);
    const held = entry ? figureHolding(doc, entry.id) : null;
    host.append(el('h3', null, 'Figure'));
    host.append(el('p', 'tb-help', `One point of ${figureName(spec)}. The points of a figure are waypoints: drag them to reshape it, or take the whole figure out.`));
    if (held) {
      const row = el('div', 'tb-row-btns');
      row.append(button('Take the figure out', 'tb-btn tb-danger', () => this.host.clearFigureOf(entry.id),
        'Every point of it goes, and a second pass through its gate with them'));
      host.append(row);
    }
  }

  /*
   * THE CARD'S WAY IN: what is after the piece, into it and, for a flag, round it, in a word each, and a press opens
   * the details at the flight path, where the choices are. The card is the room's and this is a row of it; the
   * figures themselves are a screen of pictures, which a floating card is not the place for.
   */
  cardFlight(card, element, at, touched = false) {
    const kind = kindOf(element);
    /* On a screen that is touched the card is the small bar and the choices are left to the details (More), which has the
     * Flight path in it: three rows at finger size were a card a third taller, over the room it is for. */
    if (touched || !at || element.type === 'waypoint' || (kind !== KIND.APERTURE && kind !== KIND.MARKER)) {
      return;
    }
    const doc = this.host.doc;
    const say = (found) => (found && found.spec ? figureName(found.spec) : 'None');
    const around = kind === KIND.MARKER ? aroundOf(doc, at.id) : null;
    /* A button says what is laid in its place and opens the details at it. Two share a row, because the card is over the room
     * and a row each was a third taller; a long name is cut with an ellipsis and is in its title whole. */
    const button1 = (slot, label, found, what) => ({
      label: `${label ? `${label}: ` : ''}${say(found)} \u25be`,
      on: Boolean(found),
      toggle: true,
      className: 'tb-card-wide',
      run: () => this.host.openFlightPath(at.id, slot),
      title: `${what}${found ? ` Laid: ${figureName(found.spec)}.` : ''} Opens the flight path in the details`,
    });
    const thenFound = around ? null : thenOf(doc, at.id);
    const intoFound = around ? null : intoOf(doc, at.id);
    if (kind === KIND.MARKER) {
      card.append(this.cardChoice('Round it', [button1('around', '', around, 'A turn round the flag, flown round and never over.')], 'A turn round the flag'));
    }
    card.append(this.cardChoice('Flight path', [
      button1('then', 'Then', thenFound, 'What the line does after this pass: a turn, a loop, a hop and the rest.'),
      button1('into', 'Into', intoFound, 'What the line does before this pass.'),
    ], 'What the line does after this pass and before it'));
  }

  /*
   * Which of the course's sponsor logos a painted footprint wears.
   *
   * NAMED BY ID, chosen by clicking a picture. The document holds the id so
   * that removing one sponsor cannot silently repaint another sponsor's
   * decal, and the author never sees the id: they see the artwork, at the
   * footprint's own proportions, which is the only way to answer "is that
   * the right one and is the box the right shape for it".
   *
   * With no logos uploaded there is nothing to pick, and the panel says so
   * and points at the button that fixes it rather than showing an empty row.
   */
  renderDecalLogoPicker(host, doc, element) {
    host.append(el('h3', null, 'Which logo'));
    const logos = logosOf(doc);
    /* Grass on a field, the floor in a room and whatever the plot is paved
     * with on a map: see wordsFor. */
    const w = wordsFor(doc);
    if (!logos.length) {
      host.append(el('p', 'tb-help', `This ${w.noun} carries no sponsor logos yet. Add one under Sponsor logos, and every footprint on the ${w.ground} can wear it.`));
      host.append(button('Sponsor logos', 'tb-btn', () => this.host.openLogo(),
        `Add up to five sponsors\u2019 logos to this ${w.noun}`));
      return;
    }
    const current = logoForDecal(doc, element);
    const grid = el('div', 'tb-logo-grid');
    logos.forEach((logo, i) => {
      const b = el('button', current === logo ? 'tb-logo-card on' : 'tb-logo-card');
      b.type = 'button';
      b.title = logo.name || `Logo ${i + 1}`;
      const img = el('img');
      img.src = logo.image;
      img.alt = '';
      b.append(img, el('span', null, String(i + 1)));
      b.addEventListener('click', () => {
        this.host.edit('logo', (d) => {
          const e2 = elementById(d, element.id);
          if (e2) {
            e2.logoId = logo.id;
          }
        });
      });
      grid.append(b);
    });
    host.append(grid);
    host.append(el('p', 'tb-help', current
      ? `${current.name || `Logo ${logos.indexOf(current) + 1}`}, fitted inside the ${show(element.dims.width, 1)} by ${show(element.dims.depth, 1)} m footprint above. Resize the footprint to match its shape and it fills more of it.`
      : `The logo this footprint named is no longer on the ${w.noun}. Pick one, or the ${w.ground} stays plain.`));
  }

  /* What a preset says its size is for the shape it would be given: "28 x 28 in" for a gate, "28 in across"
   * for a hoop, "28 in across, 24 in high" for a hex gate. */
  presetSize(preset, shape) {
    if (shape === 'square') {
      return preset.size;
    }
    const across = Math.round((preset.clearW / 0.0254) * 10) / 10;
    if (shape === 'circle') {
      return `${across} in across`;
    }
    return `${across} in across, ${Math.round((presetHeight(preset, 'hex') / 0.0254) * 10) / 10} in high`;
  }

  /*
   * The named opening sizes. One click sets width, height and level
   * spacing together, on one element or on every aperture in the
   * selection, so a course is sized in one gesture rather than in two
   * fields per gate.
   *
   * The row also SAYS WHICH ONE IS ON, including saying "custom" when the
   * answer is none of them, because an author who has typed their own size
   * should be able to see that they have.
   */
  renderGatePresets(host, elements) {
    const first = elements[0];
    /* A hoop and a hex gate are a preset's width and their own shape's proportion of it, so each is
     * read in its own shape; and the size a button names is the one it would give the piece. */
    const shapeOf = (e2) => apertureShapeOf(e2);
    const all = elements.every((e2) => {
      const m = matchingGatePreset(e2.dims, shapeOf(e2));
      const f = matchingGatePreset(first.dims, shapeOf(first));
      return m && f && m.id === f.id;
    });
    const current = all ? matchingGatePreset(first.dims, shapeOf(first)) : null;
    const shapeAll = elements.every((e2) => shapeOf(e2) === shapeOf(first)) ? shapeOf(first) : 'square';
    host.append(el('h3', null, elements.length > 1 ? `${this.say('Opening size')}, ${elements.length} gates` : this.say('Opening size')));
    const grid = el('div', 'tb-fig-grid');
    /* The class's own presets: MultiGP's four on a field, RaceGOW's two
     * legal sizes in a room. */
    for (const preset of gatePresetsFor(this.paletteClass ?? TRACK_CLASS_DEFAULT)) {
      const b = el('button', current && current.id === preset.id ? 'tb-fig-card on' : 'tb-fig-card');
      b.type = 'button';
      b.title = preset.hint;
      b.append(el('strong', null, preset.label));
      b.append(el('span', null, this.presetSize(preset, shapeAll)));
      grid.append(b);
      b.addEventListener('click', () => {
        this.host.edit(elements.length > 1 ? `size ${elements.length} gates` : 'gate size', (d) => {
          for (const e2 of elements) {
            const live = elementById(d, e2.id);
            if (live) {
              applyGatePreset(live.dims, preset, apertureShapeOf(live));
            }
          }
        });
      });
    }
    host.append(grid);
    host.append(el('p', 'tb-help', current
      ? `${current.label}, ${this.presetSize(current, shapeAll)}. ${current.hint}`
      : (elements.length > 1
        ? 'These gates are not all the same size. Pick one to set them all.'
        : 'A size of your own. Pick a preset to go back to a standard one, or type the opening below.')));
  }

  /*
   * WHAT THIS STRUCTURE ACTUALLY IS, in the units the author is thinking
   * in, derived from the dimensions above rather than typed alongside them.
   *
   * This is the answer to "what is level spacing": one sentence naming it,
   * and then the sills it produces, so the number in the field and the
   * frame on the field are visibly the same thing.
   */
  renderApertureReadout(host, def, element) {
    const levels = apertureLevels(element.dims);
    const base = element.position.z;
    const top = base + elementHeight(def, element.dims);
    if (levels.length > 1) {
      host.append(el('p', 'tb-help', `${this.say('Level spacing')} is the rise from one opening to the next, sill to sill. Two openings share one frame tube, so the natural spacing is the opening height plus the tube, which is what a preset sets.`));
    }
    /* In the canvas's unit: see lengthField. */
    const u = this.inches() ? ' in' : ' m';
    const n = (m) => (this.inches() ? show(m / IN, 1) : show(m, 2));
    const sills = levels
      .map((ap, i) => `${i + 1}: ${openingSizesOf(element.dims, levels.length) ? `${n(ap.clearW)} by ${n(ap.clearH)}${u}, ` : ''}sill ${n(base + ap.sillH)}${u}, centre ${n(base + ap.centerH)}${u}`)
      .join('. ');
    const shape = apertureShapeOf(element);
    const one = shape === 'circle'
      ? `One round opening ${n(element.dims.clearW)}${u} across`
      : (shape === 'hex'
        ? `One six sided opening ${n(element.dims.clearW)}${u} across the points and ${n(element.dims.clearH)}${u} across the flats`
        : `One opening ${n(element.dims.clearW)} by ${n(element.dims.clearH)}${u}`);
    const ground = this.inches() ? 'the floor' : 'the ground';
    const what = levels.length > 1
      ? (openingSizesOf(element.dims, levels.length)
        ? `${levels.length} openings, each its own size. ${sills}.`
        : `${levels.length} openings of ${n(element.dims.clearW)} by ${n(element.dims.clearH)}${u}. ${sills}.`)
      : `${one}, centre ${n(base + levels[0].centerH)}${u} above ${ground}.`;
    host.append(el('p', 'tb-fig-blurb', `${what} Top of the structure ${n(top)}${u}.`));
  }

  /*
   * EACH OPENING OF A STACK IS A GATE OF ITS OWN, and has its own width and height here. A stack's Opening width and
   * Opening height above are what an opening is when it has not been given its own, so changing them moves every
   * opening that has not been set apart. An opening set apart is marked, and has a button that gives it the stack's
   * size back. The sills follow the heights (apertureLevels in elements.js), so a taller opening pushes the ones above
   * it up. Only a stack of square openings has these.
   */
  renderOpeningSizes(host, element) {
    const count = Math.round(element.dims.levels);
    if (count < 2 || apertureShapeOf(element) !== 'square' || isUnbuilt(element)) {
      return;
    }
    const id = element.id;
    const sizes = openingSizesOf(element.dims, count);
    const holes = apertureLevels(element.dims);
    host.append(el('h3', null, 'Each opening'));
    host.append(el('p', 'tb-help', 'Every opening of a stack is a gate of its own: give it its own width and height, and the race scores each pass against that opening\u2019s own size. An opening you do not touch is the stack\u2019s size above.'));
    holes.forEach((ap, i) => {
      const own = sizes?.[i] ?? {};
      const apart = own.clearW !== undefined || own.clearH !== undefined;
      const row = el('div', 'tb-grid2 tb-opening-row');
      row.dataset.opening = String(i);
      row.append(
        this.lengthField(`open-${id}-${i}-w`, `Opening ${i + 1} width`, ap.clearW, (val) => {
          this.host.edit('resize an opening', (d) => { setOpeningSize(d, id, i, { clearW: val }); });
        }, { step: 0.05, min: 0.05 }),
        this.lengthField(`open-${id}-${i}-h`, `Opening ${i + 1} height`, ap.clearH, (val) => {
          this.host.edit('resize an opening', (d) => { setOpeningSize(d, id, i, { clearH: val }); });
        }, { step: 0.05, min: 0.05 }),
      );
      host.append(row);
      if (apart) {
        host.append(button(`Opening ${i + 1} back to the stack\u2019s size`, 'tb-btn', () => {
          this.host.edit('reset an opening', (d) => { setOpeningSize(d, id, i, { clearW: null, clearH: null }); });
        }));
      }
    });
  }

  /*
   * A LETTER'S OWN SECTION: which letter it is, how big it stands, what it has to fly through and the way back to a
   * gate. The letter is picked from all twenty six, as on the palette, and changing it keeps the size the author
   * gave it and its place in the flying order. The size is the letter's as it stands, pipe and all, and not the
   * gap's: the author is thinking of a letter, and the gap follows (src/props/letters.js).
   */
  renderLetterInspector(host, element) {
    const id = element.id;
    host.append(el('h3', null, 'Letter'));
    host.append(this.letterGrid(element.letter, (next) => this.host.setPieceLetter(id, next), 'Which letter this is'));
    host.append(el('p', 'tb-help', `${letterNote(element.letter)} Each gap is a gate of its own in the flying order: the pass says which one it goes through.`));
    const size = letterExtent(element);
    const grid = el('div', 'tb-grid2');
    grid.append(
      this.lengthField(`letter-w-${id}`, 'Letter width', size.width, (val) => this.host.setLetterSize(id, { width: val }), { step: 0.25, min: 0.5 }),
      this.lengthField(`letter-h-${id}`, 'Letter height', size.height, (val) => this.host.setLetterSize(id, { height: val }), { step: 0.25, min: 0.5 }),
    );
    host.append(grid);
    const holes = aperturesOf(element);
    const n = (m) => show(m, 2);
    host.append(el('p', 'tb-fig-blurb', `${holes.map((h, i) => (h.poly.length
      ? `${openingName(element.letter, i)}: a gap that fits in ${n(h.clearW)} by ${n(h.clearH)} m`
      : `${openingName(element.letter, i)}: too small for the pipe, so nothing scores there`)).join('. ')}. The pipe is 2 inch, and the pipe of a letter is solid.`));
    if (!element.group) {
      host.append(button('Make it a gate', 'tb-btn', () => this.host.makeLetterAGate(id),
        'A plain gate where the primary gap is, as big as it is. The pass through any other gap is taken out of the order.'));
    }
  }

  /*
   * A LETTER'S FRAME, as one choice. A letter has no four sides to take away one at a time: it has its pipe, or, made
   * invisible, only its gaps, which still score and light and have nothing to hit.
   */
  renderLetterFrame(host, element) {
    const hidden = isUnbuilt(element);
    host.append(el('h3', null, 'Frame'));
    host.append(el('p', 'tb-help', hidden
      ? 'The pipe is taken away: the gaps still score and light, and there is nothing to hit. It shows in the room as its gaps alone.'
      : 'The letter is built of pipe. Make it invisible to keep its gaps as targets with nothing built round them.'));
    host.append(button(hidden ? 'Put the pipe back' : 'Make it invisible', 'tb-btn',
      () => this.host.setPieceInvisible(element.id, !hidden)));
  }

  /*
   * THE FOUR SIDES OF THE FRAME, each a toggle: lit means there is pipe
   * there. Taking one away keeps the opening, which still scores, lights and
   * pins the line (FRAME_SIDES in elements.js); this is also where a side
   * taken away with Delete in the 3D view is put back. Laid out as the gate
   * is, top over the two uprights over the bottom.
   */
  renderFrameSides(host, element) {
    const sides = frameSidesOf(element);
    const levels = aperturesOf(element).length;
    host.append(el('h3', null, 'Frame'));
    host.append(el('p', 'tb-help', levels > 1
      ? 'Each side is its own pipe: the top bar is over the top opening and the bottom bar under the lowest, and an upright is one stretch per opening. The Left and Right buttons take the whole upright; the buttons under them take one opening\'s stretch. Take one away and the openings still score. In the 3D view, click a pipe of the selected gate and press Delete: that takes just the stretch you clicked. Left and right are as seen facing the gate, like the header flag.'
      : 'Each side is its own pipe. Take one away and the opening still scores and lights, with no pipe there to hit. In the 3D view, click a pipe of the selected gate and press Delete. Left and right are as seen facing the gate, like the header flag.'));
    const grid = el('div', 'tb-frame-grid');
    for (const side of FRAME_SIDES) {
      const on = sides[side];
      const b = el('button', on ? 'tb-frame-side on' : 'tb-frame-side');
      b.type = 'button';
      b.dataset.side = side;
      b.textContent = FRAME_SIDE_LABEL[side];
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.title = on ? `Take the ${FRAME_SIDE_LABEL[side].toLowerCase()} away` : `Put the ${FRAME_SIDE_LABEL[side].toLowerCase()} back`;
      b.addEventListener('click', () => this.host.setFrameSide(element.id, side, !on));
      grid.append(b);
    }
    host.append(grid);
    /* A stack's uprights, one stretch per opening, bottom to top: the finer toggle under the whole-upright one. */
    if (levels > 1 && apertureShapeOf(element) === 'square' && !isUnbuilt(element)) {
      const stretches = el('div', 'tb-frame-grid');
      for (const side of ['left', 'right']) {
        for (let i = 0; i < levels; i += 1) {
          const on = poleBuilt(element, side, i);
          const label = `${FRAME_SIDE_LABEL[side]} ${i + 1}`;
          const b = el('button', on ? 'tb-frame-side on' : 'tb-frame-side');
          b.type = 'button';
          b.dataset.side = side;
          b.dataset.level = String(i);
          b.textContent = label;
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
          b.title = on ? `Take the ${label.toLowerCase()} stretch away` : `Put the ${label.toLowerCase()} stretch back`;
          b.addEventListener('click', () => this.host.setFramePole(element.id, side, i, !on));
          stretches.append(b);
        }
      }
      host.append(stretches);
    }
    const hidden = isUnbuilt(element);
    if (FRAME_SIDES.some((side) => !sides[side]) || unbuiltPolesOf(element).length) {
      host.append(button(hidden ? 'Put the frame back' : 'Put every side back', 'tb-btn', () => {
        this.host.edit('put the frame back', (d) => {
          const e2 = elementById(d, element.id);
          if (e2) {
            delete e2.unbuiltSides;
            delete e2.unbuiltPoles;
            delete e2.unbuilt;
          }
        });
      }));
    }
    /* All four at once, as an invisible gate: an opening with nothing built round it, which is the way to put a target
     * where no frame of its own is wanted. A cube's faces and a wall's bays share their pipe and are not offered it. */
    if (!hidden && canBeInvisible(element)) {
      host.append(button('Make it invisible', 'tb-btn', () => this.host.setPieceInvisible(element.id, true),
        'Take every side away, and the flag if it has one: the opening still scores and lights, with nothing to hit.'));
    }
  }

  renderFlagSidePicker(host, element) {
    const doc = this.host.doc;
    /* A track's piece that can carry flags has a choice that includes none, and is changed by type where it must
     * be (parts.js setFlags). A map's flagged gate has only the sides it always had. */
    const choosing = docModeOf(doc) !== 'freestyle' && canFlag(element);
    const current = choosing ? flagsOf(element) : flagSideOf(element);
    host.append(el('h3', null, choosing ? 'Flags' : 'Header flag'));
    host.append(el('p', 'tb-help', element.type === 'barrier'
      ? 'Where the pennants stand on a hurdle: at its ends. Mast height is the flag height in the dimensions below, and the mast is solid.'
      : 'Where the pennant stands on the header, as seen facing the gate. On top puts one mast in the middle of the board, directly over the opening. Mast height is the flag height in the dimensions below, and the mast is solid: a pilot diving onto the top rail can hit it.'));
    const grid = el('div', 'tb-side-grid');
    const choices = choosing
      ? (element.type === 'barrier' ? ['none', 'left', 'right', 'both'] : ['none', ...FLAG_SIDES])
      : FLAG_SIDES;
    for (const side of choices) {
      const b = el('button', current === side ? 'tb-fig-card on' : 'tb-fig-card');
      b.type = 'button';
      b.append(flagSideIcon(side));
      b.append(el('strong', null, side === 'none' ? 'None' : FLAG_SIDE_LABEL[side]));
      grid.append(b);
      b.addEventListener('click', () => {
        if (choosing) {
          this.host.setPieceFlags(element.id, side);
          return;
        }
        this.host.edit('flag side', (d) => {
          const e2 = elementById(d, element.id);
          if (e2) {
            e2.flagSide = side;
          }
        });
      });
    }
    host.append(grid);
  }

  sequenceCard(doc, element, seq, index, namedFigure = false) {
    const card = el('div', 'tb-card');
    const head = el('div', 'tb-card-head');
    const number = gateNumberOf(doc, seq.id);
    const title = namedFigure
      ? `${levelName(element, seq.apertureIndex)}, gate ${number ?? index + 1}`
      : sequenceLabel(doc, seq);
    head.append(
      el('span', number == null ? 'tb-num tb-num-bend' : 'tb-num', number == null ? '\u00b7' : String(number)),
      el('span', 'tb-card-title', title),
    );
    if (seq.overridden || element.yawOverridden) {
      head.append(el('span', 'tb-badge', this.say('set')));
    }
    card.append(head);

    const levels = aperturesOf(element);
    if (levels.length > 1 && !namedFigure) {
      const row = el('label', 'tb-field');
      row.append(el('span', 'tb-field-label', isLetterPiece(element) ? 'Gap' : 'Hole'));
      const sel = el('select');
      sel.dataset.tbkey = `lvl-${seq.id}`;
      levels.forEach((ap, i) => {
        const centre = element.position.z + ap.centerH;
        const opt = el('option', null, `${levelName(element, i)}, centre ${this.inches() ? `${show(centre / IN, 1)} in` : `${show(centre, 2)} m`}`);
        opt.value = String(i);
        if (i === (seq.apertureIndex ?? 0)) {
          opt.selected = true;
        }
        sel.append(opt);
      });
      sel.addEventListener('change', () => this.host.setSequenceAperture(seq.id, Number(sel.value)));
      row.append(sel);
      card.append(row);
    }

    card.append(el('p', 'tb-face', faceLabel(doc, seq)));

    if (kindOf(element) === KIND.MARKER) {
      card.append(el('p', 'tb-help', 'The green square is the space you have to fly through. Drag the round handle on the plan to swing it anywhere round the marker, all the way round. Flip side sends it to the opposite side, and Re-derive hands it back to the automatic rule, which is the outside of the turn.'));
      card.append(this.lengthField(`clr-${seq.id}`, 'Clearance', seq.clearance ?? 0, (val) => {
        this.host.edit('clearance', (d) => {
          const s2 = d.sequence.find((x) => x.id === seq.id);
          if (s2) {
            s2.clearance = Math.max(0, val);
          }
        });
      }, { step: 0.1, min: 0 }));
    }

    const row = el('div', 'tb-row-btns');
    row.append(button(kindOf(element) === KIND.MARKER ? 'Flip side' : this.say('Flip face'), 'tb-btn', () => this.host.flipFace(seq.id), 'Shortcut: X'));
    if (seq.overridden || element.yawOverridden) {
      row.append(button(this.say('Re-derive'), 'tb-btn', () => this.host.clearOverride(seq.id),
        'Hand this back to the automatic rule, which points it along the line from the previous element to the next.'));
    }
    row.append(button('Remove', 'tb-btn tb-danger', () => this.host.removeSequenceEntry(seq.id)));
    card.append(row);
    return card;
  }

  renderFieldSettings(host, doc) {
    host.append(el('p', 'tb-help', 'Nothing selected. Click an element to edit it, or drag a box on empty ground to select several.'));
    if (docModeOf(doc) === 'freestyle') {
      this.renderPlotSettings(host, doc);
      return;
    }
    /*
     * WHAT KIND OF TRACK THIS IS, said out loud, because everything else on
     * this screen is a consequence of it: the palette, the gate sizes, the
     * grid, the warnings and the field. An author who opened the wrong one
     * should find out here rather than by wondering where the flags went.
     *
     * It is READ ONLY on purpose. Changing a track's class after it has
     * elements on it would leave a room full of 5 ft gates or a field of
     * 28 in ones, and neither is a track anybody meant to build. The class
     * is chosen when the track is made, from the aircraft that is seated.
     */
    {
      const micro = trackClassOf(doc) === 'micro';
      const line = el('p', 'tb-help');
      line.append(el('strong', null, CANVAS_WORDS[micro ? 'micro' : 'full'].kind));
      line.append(document.createTextNode(micro
        ? ': RaceGOW, for a 65 mm whoop in a room. Gates 24 to 28 in, adjacent gates 30 in centre to centre, and the whole track inside 4 by 6 ft at the smallest gate, scaled up with them. Every piece is measured in inches from the middle of the room, and the grid is one inch.'
        : ': a five inch quad on a field. MultiGP gate sizes, and every piece measured in metres from the corner of the field.'));
      host.append(line);
    }
    /* Size, not Field a second time: the panel's own heading already names
     * the ground, the canvas's way. */
    host.append(el('h3', null, 'Size'));
    const grid = el('div', 'tb-grid3');
    const micro = trackClassOf(doc) === 'micro';
    grid.append(
      /* A room's walls are said in metres even on the whoop canvas, where a
       * piece is in inches: a hall is ten by twelve metres to the people who
       * book it, and 394 by 472 in is nobody's room. The label says which. */
      this.field('field-w', micro ? 'Width (m)' : 'Width', doc.field.width, (val) => {
        this.host.edit('field', (d) => { d.field.width = Math.max(5, val); });
      }, { suffix: 'm', step: 1 }),
      this.field('field-d', micro ? 'Depth (m)' : 'Depth', doc.field.depth, (val) => {
        this.host.edit('field', (d) => { d.field.depth = Math.max(5, val); });
      }, { suffix: 'm', step: 1 }),
      /*
       * A tenth of a metre was the floor and half a metre was the step, both
       * of which are a MultiGP field's. A RaceGOW grid is ONE INCH, 0.0254,
       * because every dimension their rules publish is a whole number of
       * inches and a metric grid would put none of them on a line. The floor
       * has to come down for that to be typeable at all, and on the whoop
       * canvas it is read in inches, as every length of a piece is.
       */
      micro
        ? this.lengthField('field-g', 'Grid', doc.field.gridSize, (val) => {
          this.host.edit('field', (d) => { d.field.gridSize = Math.max(0.005, val); });
        }, { stepIn: 0.5, min: 0.005 })
        : this.field('field-g', 'Grid', doc.field.gridSize, (val) => {
          this.host.edit('field', (d) => { d.field.gridSize = Math.max(0.005, val); });
        }, { suffix: 'm', step: 0.5 }),
    );
    host.append(grid);

    host.append(el('h3', null, 'Racing line'));
    host.append(this.field('set-tangent', 'Tangent scale', doc.settings.tangentScale, (val) => {
      this.host.edit('settings', (d) => { d.settings.tangentScale = Math.max(0.01, val); });
    }, { step: 0.02, places: 3 }));
    host.append(el('p', 'tb-help', 'How long the spline tangents are, as a fraction of the gap to the next knot. About a third draws a circular arc through a right angle. Higher bulges the line wide, lower squares off the corners.'));
    host.append(this.lengthField('set-radius', 'Warn under radius', doc.settings.minCurveRadius, (val) => {
      this.host.edit('settings', (d) => { d.settings.minCurveRadius = Math.max(0.1, val); });
    }, { step: 0.5, stepIn: 1, min: 0.1 }));
    host.append(this.field('set-samples', 'Samples per segment', doc.settings.samplesPerSegment, (val) => {
      this.host.edit('settings', (d) => { d.settings.samplesPerSegment = Math.max(4, Math.round(val)); });
    }, { step: 4, places: 0 }));
  }

  /*
   * A MAP'S OWN SETTINGS: what it is, its scene, and the plot. No racing
   * line block, because there is no line; a map is five inch only, because
   * freestyle is not offered on the whoop.
   */
  renderPlotSettings(host, doc) {
    const line = el('p', 'tb-help');
    line.append(el('strong', null, 'Freestyle map'));
    line.append(document.createTextNode(': a place to fly, with no track through it. Built from the town’s own assets, flown on a five inch, and every solid you place is solid in the air.'));
    host.append(line);
    /*
     * THE SCENE: when it is, and what the plot is paved with. The two
     * things that change a map's mood more than any asset, so they come
     * straight after what a map is, above the plot's numbers, where an
     * author sees them without scrolling. Each is an edit like any other,
     * so Undo takes it back and the autosave keeps it.
     */
    const scene = sceneOf(doc);
    const choose = (heading, values, labels, current, set) => {
      host.append(el('h3', null, heading));
      const seg = el('div', 'tb-seg');
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', heading);
      for (const v of values) {
        const on = current === v;
        const b = button(labels[v], on ? 'tb-seg-btn on' : 'tb-seg-btn', () => {
          if (sceneOf(this.host.doc)[set] !== v) {
            this.host.edit(heading.toLowerCase(), (d) => { d.scene = { ...sceneOf(d), [set]: v }; });
          }
        });
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        seg.append(b);
      }
      host.append(seg);
    };
    choose('Time of day', SCENE_TIMES, TIME_LABELS, scene.time, 'time');
    host.append(el('p', 'tb-help', TIME_HELP[scene.time]));
    choose('Ground', SCENE_GROUNDS, GROUND_LABELS, scene.ground, 'ground');
    host.append(el('p', 'tb-help', GROUND_HELP[scene.ground]));
    /* Size, as on the other canvases: the panel's heading is Plot already. */
    host.append(el('h3', null, 'Size'));
    const grid = el('div', 'tb-grid3');
    grid.append(
      this.field('field-w', 'Width', doc.field.width, (val) => {
        this.host.edit('plot', (d) => { d.field.width = Math.max(5, val); });
      }, { suffix: 'm', step: 10 }),
      this.field('field-d', 'Depth', doc.field.depth, (val) => {
        this.host.edit('plot', (d) => { d.field.depth = Math.max(5, val); });
      }, { suffix: 'm', step: 10 }),
      this.field('field-g', 'Grid', doc.field.gridSize, (val) => {
        this.host.edit('plot', (d) => { d.field.gridSize = Math.max(0.005, val); });
      }, { suffix: 'm', step: 0.5 }),
    );
    host.append(grid);
    host.append(el('p', 'tb-help', 'Everything placed snaps to the grid; hold Alt to place off it.'));
  }

  /* ---------------- sequence ---------------- */

  renderSequence() {
    const host = this.nodes.sequence;
    host.textContent = '';
    const doc = this.host.doc;
    /* A map has no flying order, and no panel for one: see the stylesheet. */
    if (docModeOf(doc) === 'freestyle') {
      return;
    }
    /* Gates and markers are counted, waypoints are said apart: a waypoint
     * bends the line and is not something anybody flies through. */
    const numbers = gateNumbers(doc);
    const passes = [...numbers.values()].filter((n) => n != null).length;
    const bends = doc.sequence.length - passes;
    host.append(el('h3', null, bends
      ? `Flying order, ${passes}, and ${bends} waypoint${bends === 1 ? '' : 's'}`
      : `Flying order, ${passes}`));

    if (!doc.sequence.length) {
      host.append(el('p', 'tb-help', 'Empty. Placing a gate or a stack adds it to the order. A stack is one structure and several gates: pick how it is flown in the inspector.'));
    }

    const list = el('ol', 'tb-seq');
    doc.sequence.forEach((seq, i) => {
      const element = elementById(doc, seq.elementId);
      const li = el('li', 'tb-seq-row');
      li.draggable = true;
      li.dataset.index = String(i);
      if (element && this.host.selection.has(element.id)) {
        li.classList.add('sel');
      }
      /* A waypoint has no number, the same as on the race field: see
       * gateNumbers in sequence.js. */
      const number = numbers.get(seq.id);
      li.append(el('span', number == null ? 'tb-num tb-num-bend' : 'tb-num', number == null ? '\u00b7' : String(number)));
      const body = el('div', 'tb-seq-body');
      body.append(el('span', 'tb-seq-name', sequenceLabel(doc, seq)));
      const face = el('span', 'tb-seq-face', faceLabel(doc, seq));
      if (seq.entry === 0) {
        face.classList.add('bad');
      }
      /* Turned by hand is a fact about the pass, so it is said on the pass's
       * own line rather than beside the name, where its fourteen capitals took
       * the width the name needed and a name such as "Round the frame pole"
       * wrapped into four lines. */
      if (seq.overridden) {
        face.append(el('span', 'tb-badge tb-badge-inline', this.say('set')));
      }
      body.append(face);
      li.append(body);
      /* Two buttons that said X and a dash on every row, X being the key that
       * flips a face and reading as "remove" to anybody who did not know it.
       * Words on every canvas now, as the whoop canvas already had them. */
      li.append(button('Reverse', 'tb-mini', (e) => { e.stopPropagation(); this.host.flipFace(seq.id); }, 'Flip the face or the pass side. X'));
      li.append(button('Remove', 'tb-mini tb-danger', (e) => { e.stopPropagation(); this.host.removeSequenceEntry(seq.id); }, 'Take it out of the order'));

      li.addEventListener('click', () => {
        if (element) {
          this.host.setSelection([element.id]);
          this.host.focusSelection();
        }
      });
      li.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(i));
        e.dataTransfer.effectAllowed = 'move';
        li.classList.add('dragging');
      });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
      li.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        li.classList.add('over');
      });
      li.addEventListener('dragleave', () => li.classList.remove('over'));
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        li.classList.remove('over');
        const from = Number(e.dataTransfer.getData('text/plain'));
        if (Number.isFinite(from)) {
          this.host.reorder(from, i);
        }
      });
      list.append(li);
    });
    host.append(list);

    const spare = unsequencedElements(doc);
    if (spare.length) {
      host.append(el('h3', null, 'Not in the track'));
      const ul = el('div', 'tb-spare');
      for (const element of spare) {
        const row = el('div', 'tb-spare-row');
        row.append(el('span', null, element.name || ELEMENTS[element.type].label));
        row.append(button('Add', 'tb-mini', () => this.host.addToSequence(element.id)));
        ul.append(row);
      }
      host.append(ul);
    }
  }

  /* ---------------- the whoop room's own chrome ---------------- */

  /* The card, the lap bar, the coach and the empty canvas's way in: the four
   * things laid over the room, in place of the side column a whoop canvas
   * keeps in a drawer. Each is empty and hidden anywhere else. */
  renderWhoop() {
    this.renderCard();
    this.renderLapBar();
    this.renderCoach();
    this.renderEmpty();
  }

  /* Whether what is selected is every piece of one group, which is what a cube is when it is picked. */
  wholeGroup(doc, ids) {
    const first = elementById(doc, ids[0]);
    if (!first || !first.group) {
      return false;
    }
    const members = doc.elements.filter((e) => e.group === first.group);
    return members.length === ids.length && members.every((m) => ids.includes(m.id));
  }

  /*
   * THE CARD BY THE SELECTED PIECE: a few fields and a few buttons, in inches
   * with the millimetres beside them in a hall and in metres on a field,
   * because a pilot standing in a hall with a tape measure thinks in one and
   * reads the rules in the other, and a course designer dimensions a plan in
   * the other. Everything else, the frame's sides, the stack's figure, is in
   * the drawer under More. X and Y are measured from the middle of a hall,
   * which is where the game puts a track, so they are numbers a track that is
   * about the size of an envelope can have; on a field they are the plan's own,
   * from its south west corner, because that is where a designer's dimensions
   * start. It floats beside the piece in the room (placeCard) and docks to the
   * foot where there is no room for that.
   *
   * WHAT IS ON IT FOR A FIVE INCH PIECE that a hall's has none of: the flags,
   * as one choice, which was a header flag in the drawer's second screen; a
   * wall's own controls (how it is flown, which way, how wide a bay, which
   * ends carry a pennant); a loop after a pass; and a hurdle's way over. They
   * are the things the plan this was made for needed and could not reach.
   *
   * ON A SCREEN THAT IS TOUCHED the fields are left to the drawer (More),
   * where the inspector has them all: typing a length on a glass keyboard is not
   * how a track is built on a tablet, and six fields at finger size were a card
   * taller than half the room, covering the very track it was for. What is left is
   * the small bar the plan asked for: Turn, Reverse, Copy, Remove, and Replace with.
   */
  /*
   * The card is dragged by its heading, with a mouse or a finger. One listener on the card, installed once, so
   * every variant of the card gets it and none has to remember to. A press on a button or a field is theirs.
   * The card is kept inside the stage, and its size is untouched, so no layout baseline moves.
   *
   * Only by the first finger down. A second finger that lands on the heading is the second finger of a pinch:
   * from 2026-10-04 the heading took it as a drag and kept it, and the pinch it belonged to never zoomed
   * (builder-flow-check, "touch": "with the card up, the second finger on it still joins").
   */
  armCardDrag(card) {
    if (card.dataset.dragArmed) {
      return;
    }
    card.dataset.dragArmed = '1';
    card.addEventListener('pointerdown', (e) => {
      const head = e.target.closest ? e.target.closest('.tb-card-head') : null;
      if (!head || e.target.closest('button, input, select, textarea, a, label') || (e.pointerType === 'mouse' && e.button !== 0)
        || !e.isPrimary) {
        return;
      }
      const parent = card.offsetParent;
      if (!parent) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const sx = e.clientX - card.offsetLeft;
      const sy = e.clientY - card.offsetTop;
      const id = e.pointerId;
      try { head.setPointerCapture(id); } catch (err) { /* a synthetic pointer has none to capture */ }
      card.classList.add('dragging');
      const move = (m) => {
        if (m.pointerId !== id) {
          return;
        }
        m.preventDefault();
        this.cardPin = { x: m.clientX - sx, y: m.clientY - sy };
        this.applyCardPin(card);
      };
      const done = (u) => {
        if (u.pointerId !== id) {
          return;
        }
        head.removeEventListener('pointermove', move);
        head.removeEventListener('pointerup', done);
        head.removeEventListener('pointercancel', done);
        card.classList.remove('dragging');
      };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', done);
      head.addEventListener('pointercancel', done);
    });
  }

  /* Puts the card where it was dragged to, kept 6 px inside the stage. False when it has not been dragged. */
  applyCardPin(card) {
    const parent = card.offsetParent;
    if (!this.cardPin || !parent) {
      return false;
    }
    const x = Math.max(6, Math.min(this.cardPin.x, parent.clientWidth - card.offsetWidth - 6));
    const y = Math.max(6, Math.min(this.cardPin.y, parent.clientHeight - card.offsetHeight - 6));
    card.classList.remove('docked');
    card.style.left = `${x.toFixed(0)}px`;
    card.style.top = `${y.toFixed(0)}px`;
    return true;
  }

  renderCard() {
    const card = this.nodes.card;
    if (!card) {
      return;
    }
    const doc = this.host.doc;
    const ids = [...this.host.selection].filter((id) => elementById(doc, id));
    /* Not while a tool is armed: the pointer is for placing then, and a card
     * beside the piece just placed sits exactly where the next one goes. And not on a map while the drawer is open:
     * it holds every field the card has, and a card over the view saying the same again is what a map builder
     * asked to be rid of (bug-67ae1762). It is back when the drawer is shut. */
    if (!this.host.buildsIn3D() || !ids.length || this.host.armed
      || (docModeOf(doc) === 'freestyle' && this.host.drawerOpen)) {
      card.hidden = true;
      card.textContent = '';
      this.cardPin = null;
      return;
    }
    /* A card the pilot has dragged stays where it was put while the same pieces are selected, and goes back to
     * following the piece the moment the selection is of something else. */
    const pinKey = ids.join(',');
    if (pinKey !== this.cardPinKey) {
      this.cardPin = null;
      this.cardPinKey = pinKey;
    }
    this.armCardDrag(card);
    if (docModeOf(doc) === 'freestyle') {
      this.renderMapCard(card, doc, ids);
      return;
    }
    const cls = trackClassOf(doc);
    const metric = scaleOf(doc).metric;
    card.textContent = '';
    card.hidden = false;
    card.classList.toggle('docked', this.host.mode !== '3d');
    const head = el('div', 'tb-card-head');
    const actions = el('div', 'tb-card-actions');
    const touched = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    /* A quarter turn, for a screen with no Q and E. Only for what turns. */
    const turns = ids.some((id) => [KIND.APERTURE, KIND.START, KIND.OBSTACLE].includes(kindOf(elementById(doc, id))));
    if (turns) {
      actions.append(button('Turn', 'tb-btn', () => this.host.nudgeYaw(metric ? -90 : -15), metric
        ? 'Turn it a quarter. E turns it fifteen degrees one way and Q the other; Shift with either is a quarter'
        : 'Turn it a quarter. E turns it one way and Q the other'));
    }
    const copyBtn = button('Copy', 'tb-btn', () => this.host.copySelection(), metric
      ? 'A copy beside it. Control D'
      : 'A copy beside it, 30 in on. Control D');
    const removeBtn = button('Remove', 'tb-btn tb-danger', () => this.host.deleteSelection(), 'Delete');
    actions.append(
      copyBtn,
      removeBtn,
      button('More', 'tb-btn', (e) => this.host.toggleDrawer(true, { from: e.currentTarget, keys: e.detail === 0 }), metric
        ? 'Everything else about it: the frame, its size, how a stack is flown'
        : 'Everything else about it: the frame, the flag, how a stack is flown'),
    );
    const close = button('\u00d7', 'tb-btn tb-mini tb-card-x', () => this.host.setSelection([]), 'Let go of it. Escape');
    close.setAttribute('aria-label', 'Let go of it');

    /* A WALL, as the whole piece it is. */
    const wall = ids.length > 1 && this.wholeGroup(doc, ids) ? wallOf(doc, ids[0]) : null;
    if (wall) {
      this.renderWallCard(card, head, close, actions, copyBtn, wall, ids[0]);
      return;
    }

    if (ids.length > 1) {
      /* A whole cube says what it is: it is one piece, and the two faces it is flown through are the passes. */
      const cube = this.wholeGroup(doc, ids);
      head.append(el('strong', null, cube ? 'Cube' : `${ids.length} selected`), close);
      card.append(head, el('p', 'tb-help', cube
        ? 'One piece: gates that share their pipe. It is flown in at one face and out at another, and the Fly order tool changes which. Drag it to move it. Q and E turn it. Arrow keys nudge it.'
        : 'Drag one to move them together. Q and E turn them. Arrow keys nudge them.'));
      const swap = this.replaceField(ids);
      if (swap) {
        card.append(swap);
      }
      /* A whole course made one size: Select all, and one press. A cube's faces and a wall's bays are sized as the
       * pieces they are. */
      const loose = ids.map((id) => elementById(doc, id)).filter((e2) => e2 && kindOf(e2) === KIND.APERTURE && !e2.group && !isLetterPiece(e2));
      if (!this.host.isWhoopRace() && loose.length) {
        const looseIds = loose.map((e2) => e2.id);
        const sameAs = (preset) => loose.every((e2) => Math.abs(e2.dims.clearW - preset.clearW) < 1e-6);
        card.append(this.cardChoice('Gate size', ['standard', 'wide', 'championship'].map((key) => {
          const preset = GATE_PRESETS.find((p) => p.id === key);
          return {
            label: preset.label, on: sameAs(preset), run: () => this.host.setGateSize(looseIds, key), title: preset.hint || `${preset.label}: ${this.presetSize(preset, 'square')}`,
          };
        }), 'The size of every gate selected that is not part of a wall'));
      }
      card.append(actions);
      return;
    }
    const element = elementById(doc, ids[0]);
    const def = ELEMENTS[element.type];
    const entries = doc.sequence.filter((q) => q.elementId === element.id);
    const numbers = gateNumbers(doc);
    /*
     * THE PASS THE CARD IS ABOUT. A piece flown more than once has a pass for each
     * time, and Place in order, Reverse and Remove this pass are about one of them:
     * the one in focus when it is this piece's, else the first. The card said only
     * the first's number and acted on the first whichever the pilot meant.
     */
    const focusId = this.host.focusedPass?.(false) ?? null;
    const at = entries.find((q) => q.id === focusId) ?? entries[0] ?? null;
    const number = at ? numbers.get(at.id) : null;
    const flown = entries.length;
    const called = element.name || pieceLabel(element, cls);
    if (flown > 1 && touched) {
      /* On a touched screen the strip along the foot is the way to another pass (a chip
       * is a finger there, and the passes of this piece are ringed on it): a row of
       * chips here would be another 100 px of card on a tablet whose room is 580. The
       * pass the card is about is named under the piece. */
      const title = el('div', 'tb-card-title');
      title.append(el('strong', null, called), el('span', 'tb-card-sub', `Flown ${flown} times${number != null ? `, this is pass ${number}` : ''}`));
      head.append(title, close);
    } else {
      head.append(el('strong', null, flown > 1 ? `${called}, flown ${flown} times` : `${called}${number != null ? `, number ${number}` : ''}`), close);
    }
    card.append(head);
    if (flown > 1 && !touched) {
      card.append(this.passChips(entries, numbers, at));
    }
    /* Fly again, and for a piece that is flown more than once Remove says how much
     * it takes with it. */
    if (isSequenceable(element)) {
      actions.insertBefore(button(flown ? 'Fly again' : 'Fly it', 'tb-btn', () => this.host.flyPieceAgain(element.id, at ? at.apertureIndex ?? 0 : 0),
        'Another pass through it, at the end of the lap'), copyBtn);
    }
    /* A hurdle is not a gate: the lap goes over it, and this is what puts the lap there. */
    if (canFlyOver(element) && !this.host.isWhoopRace()) {
      const gate = !HURDLE_TYPES.includes(element.type);
      actions.insertBefore(button('Fly over', 'tb-btn', () => this.host.flyOverPiece(element.id), gate
        ? 'Hop over the top of it instead of through it: a pass a metre above it, at the end of the lap'
        : 'Add a pass over the middle of it, a metre above the top, at the end of the lap'), copyBtn);
    }
    if (flown > 1) {
      removeBtn.textContent = 'Remove piece';
      removeBtn.title = `Takes the piece and its ${flown} passes out of the track. Delete`;
      if (touched && at) {
        /* The chips that carry this button on a fine pointer are not on this card. */
        actions.insertBefore(button('Remove pass', 'tb-btn', () => this.host.removeSequenceEntry(at.id),
          'Takes this one pass out of the lap and leaves the piece where it stands'), removeBtn);
      }
    }

    /* THE FIVE INCH PIECE'S OWN CHOICES: which way it faces, its flags, and the flag gone round before the pass the
     * card is about. */
    this.cardFacing(card, element);
    this.cardLetter(card, element, at);
    this.cardFrame(card, element);
    this.cardPassOn(card, element, at);
    this.cardFlags(card, element);
    this.cardHurdle(card, element, touched);
    this.cardRound(card, element, at);
    this.cardFlight(card, element, at, touched);

    if (touched) {
      /* The small bar: what a keyboard's Q, E and X did, as buttons. */
      if (at && (def.kind === KIND.APERTURE || def.kind === KIND.MARKER)) {
        actions.prepend(button(def.kind === KIND.APERTURE ? 'Reverse' : 'Other side', 'tb-btn', () => this.host.flipFace(at.id),
          `${faceLabel(doc, at)}. X`));
      }
      const swap = this.replaceField(ids);
      if (swap) {
        card.append(swap);
      }
      card.append(actions);
      this.cardWarnings(card, element, entries);
      return;
    }

    const grid = el('div', 'tb-card-grid');
    const id = element.id;
    if (number != null) {
      grid.append(this.field(`card-order-${id}`, 'Place in order', number, (val) => this.host.renumber(at.id, val),
        { step: 1, places: 0, min: 1 }));
    }
    this.cardPlaceFields(grid, element);
    /* How far outside a flag the line goes round it, which is how wide the turn is: a turn flag a pilot swings wide
     * round is the same flag with a bigger number. Only a field's markers, where a turn round one is a design choice. */
    if (at && def.kind === KIND.MARKER && !this.host.isWhoopRace()) {
      grid.append(this.field(`card-clr-${at.id}`, 'Turn clearance (m)', at.clearance ?? 0, (val) => {
        this.host.edit('clearance', (d) => {
          const s2 = d.sequence.find((x) => x.id === at.id);
          if (s2) {
            s2.clearance = Math.max(0, val);
          }
        });
      }, { step: 0.5, places: 2, min: 0 }));
    }
    if (at && (def.kind === KIND.APERTURE || def.kind === KIND.MARKER)) {
      const fig = el('div', 'tb-card-fig');
      fig.append(el('span', null, def.kind === KIND.APERTURE ? 'Direction' : 'Pass side'),
        button(def.kind === KIND.APERTURE ? 'Reverse' : 'Other side', 'tb-btn', () => this.host.flipFace(at.id), `${faceLabel(doc, at)}. X`));
      grid.append(fig);
    }
    card.append(grid);
    const swap = this.replaceField(ids);
    if (swap) {
      card.append(swap);
    }
    card.append(actions);
    /* After the buttons, so a sentence appearing or going after a press moves
     * nothing that is under the finger. */
    this.cardWarnings(card, element, entries);
  }

  /*
   * THE CARD ON A MAP: what a piece is asked about while it is being built, beside the piece. Its look, where it
   * stands (X, Y and Base, which is the height it stands at: a roof, a deck, the paving), which way it faces and
   * how big it is, in metres from the plot's corner as the plan has them; for a road its shape and its lanes, for
   * a car how it drives, for a gap its name and what it is worth. Everything else is under More, which is the
   * inspector. A map's pieces are furniture and have no flying order, so none of a track's rows about passes is
   * here. On a screen that is touched it is the small bar and nothing else, for the reason the track's is.
   */
  renderMapCard(card, doc, ids) {
    card.textContent = '';
    card.hidden = false;
    card.classList.toggle('docked', this.host.mode !== '3d');
    const head = el('div', 'tb-card-head');
    const actions = el('div', 'tb-card-actions');
    const touched = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const picked = ids.map((id) => elementById(doc, id));
    const turns = picked.some((e2) => ![KIND.ROAD, KIND.VEHICLE, KIND.ANNOTATION].includes(kindOf(e2)));
    if (turns) {
      actions.append(button('Turn', 'tb-btn', () => this.host.nudgeYaw(-90),
        'Turn it a quarter. E turns it fifteen degrees one way and Q the other; Shift with either is a quarter'));
    }
    const copyBtn = button('Copy', 'tb-btn', () => this.host.copySelection(), 'A copy beside it. Control D');
    actions.append(
      copyBtn,
      button('Remove', 'tb-btn tb-danger', () => this.host.deleteSelection(), 'Delete'),
      button('More', 'tb-btn', (e) => this.host.toggleDrawer(true, { from: e.currentTarget, keys: e.detail === 0 }),
        'Everything else about it: its name, its size, where it is to the centimetre'),
    );
    const close = button('\u00d7', 'tb-btn tb-mini tb-card-x', () => this.host.setSelection([]), 'Let go of it. Escape');
    close.setAttribute('aria-label', 'Let go of it');

    if (ids.length > 1) {
      head.append(el('strong', null, `${ids.length} selected`), close);
      card.append(head, el('p', 'tb-help', 'Drag one to move them together. Q and E turn them. Arrow keys nudge them. Delete removes them.'), actions);
      return;
    }
    const element = picked[0];
    const def = ELEMENTS[element.type];
    const id = element.id;
    const called = element.name ? `${def.label} \u201c${element.name}\u201d` : def.label;
    head.append(el('strong', null, called), close);
    card.append(head);

    if (!touched) {
      if (def.kind === KIND.ZONE) {
        const name = this.field(`card-name-${id}`, 'Gap name', element.name, (val) => {
          this.host.edit('rename', (d) => { elementById(d, id).name = String(val).slice(0, 40); });
        }, { text: true });
        name.classList.add('tb-gap-name');
        card.append(name);
        card.append(this.cardChoice('Points', GAP_POINTS.map((pts) => ({
          label: String(pts), on: element.points === pts,
          run: () => this.host.edit('points', (d) => { const e2 = elementById(d, id); if (e2) { e2.points = pts; } }),
        })), 'What flying through it is worth'));
      } else if (def.kind === KIND.ROAD) {
        card.append(this.cardChoice('Shape', this.roadShapeItems(element), 'Whether the road closes into a loop'));
        card.append(this.cardChoice('Lanes', this.roadLaneItems(element), 'How many lanes it has'));
      } else if (def.kind === KIND.VEHICLE) {
        card.append(this.cardChoice('Driving', this.vehicleDrivingItems(element, def), 'Traffic, or the drift car'));
        card.append(this.cardChoice('Direction', this.vehicleDirectionItems(element), 'Which way it drives its road'));
      } else if (def.kind === KIND.STRUCTURE && def.styles) {
        const current = propStyleOf(element);
        card.append(this.cardChoice('Style', def.styles.map((style) => ({
          label: styleLabel(style), on: current === style, run: () => this.setAssetStyle(element, style),
        })), 'How it looks, and the size that look starts at'));
      }
      if (def.kind === KIND.STRUCTURE && def.tilt) {
        card.append(this.cardChoice('Stands', this.standItems(element), 'Upright, or on its end: as tall as it is long'));
      }
      if (def.kind !== KIND.ROAD && def.kind !== KIND.VEHICLE) {
        const grid = el('div', 'tb-card-grid');
        grid.append(
          this.field(`card-x-${id}`, 'X (m)', element.position.x, (val) => {
            this.host.setElementCoord(id, 'x', round6(val));
          }, { step: 1, places: 2 }),
          this.field(`card-y-${id}`, 'Y (m)', element.position.y, (val) => {
            this.host.setElementCoord(id, 'y', round6(val));
          }, { step: 1, places: 2 }),
        );
        /* The height a built piece stands at, which is what it was put down on: the paving, a roof, a deck. */
        if (needsSeat(element) || def.kind === KIND.ZONE) {
          /* Under the ground for an asset, to hide some of it (lowestBase); never for anything else. */
          grid.append(this.field(`card-h-${id}`, 'Base (m)', element.position.z, (val) => {
            this.host.edit('height', (d) => {
              const e2 = elementById(d, id);
              e2.position.z = round6(Math.max(lowestBase(d, e2), val));
            });
          }, { step: 0.25, places: 2, min: lowestBase(doc, element) }));
        }
        if (turns && def.kind !== KIND.ANNOTATION) {
          grid.append(this.field(`card-turn-${id}`, 'Turn (degrees)', element.yaw * DEG, (val) => {
            this.host.setElementYaw(id, val * RAD);
          }, { step: turnsOf(element.type) === 'quarter' ? 90 : 15, places: 0 }));
        }
        /* An asset's own size: the first few of its dimensions, which are the ones that say how much ground it takes. */
        if (def.kind === KIND.STRUCTURE || def.kind === KIND.ZONE) {
          for (const key of Object.keys(def.dims).filter((k) => k !== 'variant').slice(0, 3)) {
            grid.append(this.propDimField(element, def, key, 'card-dim'));
          }
        }
        /* Paint has its footprint, and a label its words. */
        if (def.kind === KIND.DECAL) {
          for (const [key, label] of [['width', 'Width (m)'], ['depth', 'Depth (m)']]) {
            grid.append(this.field(`card-dim-${id}-${key}`, label, element.dims[key], (val) => {
              this.host.edit('resize', (d) => { elementById(d, id).dims[key] = round6(Math.max(0.2, val)); });
            }, { step: 0.5, places: 2, min: 0.2 }));
          }
        }
        card.append(grid);
        if (element.position.z < -0.005) {
          card.append(el('p', 'tb-help', `Sunk ${show(-element.position.z, 2)} m into the ground, which hides what is under it. Page Up brings it back.`));
        }
        if (def.kind === KIND.ANNOTATION) {
          card.append(this.field(`card-text-${id}`, 'Text', element.text ?? '', (val) => {
            this.host.edit('label', (d) => { elementById(d, id).text = val; });
          }, { text: true }));
        }
      }
    }
    card.append(actions);
    /* After the buttons, so a sentence appearing or going after a press moves nothing that is under the finger. */
    this.cardWarnings(card, element, []);
  }

  /*
   * X, Y, the height and the turn of a piece, in the units the canvas speaks: inches with the millimetres beside
   * them, from the middle of a hall; metres, from the corner of a field. A barrier has a width and a board height
   * of its own that a field's designer sets, and a tilted gate its tilt.
   */
  cardPlaceFields(grid, element) {
    const doc = this.host.doc;
    const def = ELEMENTS[element.type];
    const id = element.id;
    const metric = scaleOf(doc).metric;
    if (metric) {
      grid.append(
        this.field(`card-x-${id}`, 'X (m)', element.position.x, (val) => {
          this.host.edit('move', (d) => { elementById(d, id).position.x = round6(val); });
        }, { step: 1, places: 2 }),
        this.field(`card-y-${id}`, 'Y (m)', element.position.y, (val) => {
          this.host.edit('move', (d) => { elementById(d, id).position.y = round6(val); });
        }, { step: 1, places: 2 }),
      );
      if (def.kind === KIND.APERTURE && isLetterPiece(element)) {
        /* How big the letter stands, pipe and all: its primary gap follows (setLetterSize in app.js). It stands on the
         * ground and upright, so it has no height off the ground and no tilt. */
        const size = letterExtent(element);
        grid.append(
          this.field(`card-lw-${id}`, 'Width (m)', size.width, (val) => this.host.setLetterSize(id, { width: val }), { step: 0.25, places: 2, min: 0.5 }),
          this.field(`card-lh-${id}`, 'Height (m)', size.height, (val) => this.host.setLetterSize(id, { height: val }), { step: 0.25, places: 2, min: 0.5 }),
        );
      } else if (def.kind === KIND.APERTURE) {
        grid.append(this.field(`card-h-${id}`, 'Height off ground (m)', element.dims.sillH ?? 0, (val) => {
          this.host.edit('resize', (d) => { elementById(d, id).dims.sillH = round6(Math.max(0, val)); });
        }, { step: 0.25, places: 2, min: 0 }));
        if (Math.abs(element.pitch ?? 0) > 1e-6 || element.type === 'diveGate') {
          grid.append(this.field(`card-tilt-${id}`, 'Tilt (degrees)', element.pitch * DEG, (val) => {
            this.host.edit('tilt', (d) => { elementById(d, id).pitch = Math.max(-90, Math.min(90, val)) * RAD; });
          }, { step: 5, places: 0, min: -90, max: 90 }));
        }
      } else if (element.type === 'barrier') {
        grid.append(
          this.field(`card-w-${id}`, 'Length (m)', element.dims.width, (val) => {
            this.host.edit('resize', (d) => { elementById(d, id).dims.width = round6(Math.max(0.5, val)); });
          }, { step: 0.5, places: 2, min: 0.5 }),
          this.field(`card-bh-${id}`, 'Height (m)', element.dims.height, (val) => {
            this.host.edit('resize', (d) => { elementById(d, id).dims.height = round6(Math.max(0.1, val)); });
          }, { step: 0.25, places: 2, min: 0.1 }),
        );
      } else if (!standsOnGround(doc, element) && def.kind !== KIND.DECAL) {
        grid.append(this.field(`card-h-${id}`, 'Height off ground (m)', element.position.z, (val) => {
          this.host.edit('height', (d) => { elementById(d, id).position.z = round6(Math.max(0, val)); });
        }, { step: 0.25, places: 2, min: 0 }));
      }
    } else {
      const mid = { x: doc.field.width / 2, y: doc.field.depth / 2 };
      const mm = (m) => `${Math.round(m * 1000)} mm`;
      const dx = element.position.x - mid.x;
      const dy = element.position.y - mid.y;
      grid.append(
        this.field(`card-x-${id}`, 'X (in)', dx / IN, (val) => {
          this.host.edit('move', (d) => { elementById(d, id).position.x = round6(mid.x + val * IN); });
        }, { step: 1, places: 1, suffix: mm(dx) }),
        this.field(`card-y-${id}`, 'Y (in)', dy / IN, (val) => {
          this.host.edit('move', (d) => { elementById(d, id).position.y = round6(mid.y + val * IN); });
        }, { step: 1, places: 1, suffix: mm(dy) }),
      );
      /* Height off the floor: the sill of a gate, which is what lifts one on its
       * legs; the base of a pole laid across a room; nothing for what stands on
       * the ground. */
      if (def.kind === KIND.APERTURE) {
        grid.append(this.field(`card-h-${id}`, 'Height off floor (in)', (element.dims.sillH ?? 0) / IN, (val) => {
          this.host.edit('resize', (d) => { elementById(d, id).dims.sillH = round6(Math.max(0, val * IN)); });
        }, { step: 1, places: 1, min: 0, suffix: mm(element.dims.sillH ?? 0) }));
      } else if (!standsOnGround(doc, element) && def.kind !== KIND.DECAL) {
        grid.append(this.field(`card-h-${id}`, 'Height off floor (in)', element.position.z / IN, (val) => {
          this.host.edit('height', (d) => { elementById(d, id).position.z = round6(Math.max(0, val * IN)); });
        }, { step: 1, places: 1, min: 0, suffix: mm(element.position.z) }));
      }
    }
    if (def.kind === KIND.APERTURE || def.kind === KIND.START || def.kind === KIND.OBSTACLE) {
      const yaw = this.host.shownYaw ? this.host.shownYaw(element) : element.yaw;
      grid.append(this.field(`card-turn-${id}`, 'Turn (degrees)', yaw * DEG, (val) => {
        this.host.setElementYaw(id, val * RAD);
      }, { step: metric ? 15 : 90, places: 0 }));
    }
  }

  /* A row of a few words, one of them lit: the card's way of offering a choice. */
  cardChoice(label, items, title) {
    const row = el('div', 'tb-card-choice');
    row.append(el('span', 'tb-card-choice-label', label));
    const seg = el('div', 'tb-seg tb-seg-card');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', label);
    for (const it of items) {
      const b = button(it.label, `${it.on ? 'tb-seg-btn on' : 'tb-seg-btn'}${it.className ? ` ${it.className}` : ''}`, () => {
        /* The lit one of a choice is already chosen; a toggle is pressed to turn it off as well as on. */
        if (it.toggle || !it.on) {
          it.run();
        }
      }, it.title ?? title);
      b.setAttribute('aria-pressed', it.on ? 'true' : 'false');
      /* Offered and refused, with the reason in its title: a choice that is missing says nothing about why. */
      b.disabled = Boolean(it.disabled);
      seg.append(b);
    }
    row.append(seg);
    return row;
  }

  /*
   * A HURDLE'S OWN CHOICES: its size (the plan's, MultiGP's 10 by 5 ft, the h-hurdle with its tall pole, a super hurdle),
   * how the lap goes past it (over, skimming, or under a bar), and the angle it is set at to the line, square or forty
   * five degrees. The line and the angle are about the waypoint that puts the lap over it, so they are offered once
   * there is one: Fly over puts it there.
   */
  cardHurdle(card, element, touched = false) {
    if (!canFlyOver(element) || this.host.isWhoopRace()) {
      return;
    }
    const doc = this.host.doc;
    /* A gate that is hopped over has a line over it to choose, and nothing else of a hurdle's: its size and its angle are the gate's. */
    if (!HURDLE_TYPES.includes(element.type)) {
      const over = hurdleLineOf(doc, element.id);
      if (over) {
        card.append(this.cardChoice('Flown', HURDLE_LINES.map((l) => ({
          label: l.label, on: over === l.id, disabled: l.id === 'under',
          run: () => this.host.setHurdleLine(element.id, l.id),
          title: l.id === 'under' ? 'A gate has nothing to go under' : l.hint,
        })), 'How the lap goes over it'));
      }
      return;
    }
    const bar = element.type === 'horizontalPole';
    const size = hurdleSizeOf(element);
    const sizes = bar ? HURDLE_SIZES.filter((s) => s.id === 'multigp' || s.id === 'super') : HURDLE_SIZES;
    /* On a screen that is touched only how it is flown is on the card: its size is a field of the details and its angle the Turn. */
    if (!touched) {
      card.append(this.cardChoice('Size', sizes.map((s) => ({
        label: s.label, on: size === s.id, run: () => this.host.setHurdleSize(element.id, s.id), title: s.hint,
      })), 'How big the hurdle is'));
    }
    const line = hurdleLineOf(doc, element.id);
    card.append(this.cardChoice('Flown', HURDLE_LINES.map((l) => ({
      label: l.label, on: line === l.id, disabled: l.id === 'under' && !bar,
      run: () => this.host.setHurdleLine(element.id, l.id),
      title: l.id === 'under' && !bar ? 'A board stands on the ground and has nothing to go under. A bar hurdle has.' : l.hint,
    })), 'How the lap goes past it'));
    if (line && !touched) {
      const angle = hurdleAngleOf(doc, element.id);
      card.append(this.cardChoice('Set at', [['Square', 'square'], ['45° left', 'left'], ['45° right', 'right']].map(([label, value]) => ({
        label, on: angle === value, run: () => this.host.setHurdleAngle(element.id, value),
        title: value === 'square' ? 'Across the line the lap flies' : `Turned forty five degrees to the ${value}, as flown`,
      })), 'The angle it is set at to the line'));
    }
  }

  /*
   * WHICH WAY A GATE FACES, as the compass the plan is drawn on: north is the far side of the room, east is right
   * of it. One press is the heading, where a quarter turn from wherever it is was one press for each of the three
   * it might need. The way a lap is flown through it is the pass's and is Reverse. A heading between two of them
   * lights none. Only a five inch gate: a hall's are on quarter turns and have Turn.
   */
  cardFacing(card, element) {
    if (this.host.isWhoopRace() || kindOf(element) !== KIND.APERTURE) {
      return;
    }
    const yaw = this.host.shownYaw ? this.host.shownYaw(element) : element.yaw;
    const at = (deg) => Math.abs(wrapAngle(yaw - deg * RAD)) < 0.02;
    card.append(this.cardChoice('Faces', [
      ['North', 90], ['East', 0], ['South', -90], ['West', 180],
    ].map(([label, deg]) => ({
      label, on: at(deg), run: () => this.host.setElementYaw(element.id, deg * RAD),
    })), 'Which way the gate faces. North is the far side of the room. Reverse flies it the other way through.'));
  }

  /*
   * A SELECT OF THE TWENTY SIX, in the card's own row: a label and the letters, the way Replace with is offered. A
   * select and not the grid the palette has, because the card is a few rows beside a piece and a grid of twenty six
   * is three of them. `current` is lit; with none it asks to be chosen.
   */
  letterSelect(label, current, onPick, key, title) {
    const row = el('label', 'tb-field tb-card-swap tb-card-letter');
    row.append(el('span', 'tb-field-label', label));
    const sel = el('select');
    sel.dataset.tbkey = key;
    sel.title = title;
    if (!current) {
      const none = el('option', null, 'Choose a letter');
      none.value = '';
      sel.append(none);
    }
    for (const letter of LETTERS) {
      const opt = el('option', null, `${letter}, ${letterNote(letter).replace(`${letter} has `, '')}`);
      opt.value = letter;
      if (letter === current) {
        opt.selected = true;
      }
      sel.append(opt);
    }
    sel.addEventListener('change', () => {
      if (sel.value) {
        onPick(sel.value);
      }
    });
    row.append(sel);
    return row;
  }

  /*
   * A LETTER, AND A GATE THAT COULD BE ONE. A letter says which it is and changes to another in place, keeping its size,
   * where it stands and its place in the flying order; one with more than one gap says which gap this pass goes
   * through. A plain gate on a five inch track offers to become a letter, which is how a track that already has a gate
   * where its W is edited, without a gate being deleted and the order put right. Only a five inch track: a hall and a
   * map have no letters.
   */
  cardLetter(card, element, at) {
    if (this.host.isWhoopRace()) {
      return;
    }
    if (isLetterPiece(element)) {
      card.append(this.letterSelect('Letter', element.letter, (next) => this.host.setPieceLetter(element.id, next),
        `card-letter-${element.id}`, 'Another letter in its place: the same size, the same spot in the flying order'));
      const holes = aperturesOf(element);
      if (at && holes.length > 1) {
        card.append(this.cardChoice('Flies through', holes.map((h, i) => ({
          label: openingName(element.letter, i),
          on: (at.apertureIndex ?? 0) === i,
          className: 'tb-card-wide',
          run: () => this.host.setSequenceAperture(at.id, i),
          title: `This pass goes through the gap ${openingName(element.letter, i)}`,
        })), 'Which gap of the letter this pass goes through'));
      }
      return;
    }
    if (canBecomeLetter(this.host.doc, element)) {
      card.append(this.letterSelect('Make it a letter', '', (next) => this.host.setPieceLetter(element.id, next),
        `card-make-letter-${element.id}`, 'Takes this gate\u2019s place in the track as a letter: where it stands, which way it faces and its place in the flying order stay'));
    }
  }

  /*
   * THE FRAME, AS ONE CHOICE: built, or invisible. An invisible gate has nothing built round its opening: it scores
   * and it lights when it is the next one, and there is no pipe to hit. Any gate or letter can be made one and put
   * back, and the four sides one at a time are in the details. Not one that shares its
   * pipe with others in a wall or a cube.
   */
  cardFrame(card, element) {
    if (!canBeInvisible(element)) {
      return;
    }
    const hidden = isUnbuilt(element);
    card.append(this.cardChoice('Frame', [
      {
        label: 'Built', on: !hidden, run: () => this.host.setPieceInvisible(element.id, false),
        title: 'Pipe round the opening, as a gate or a letter is built',
      },
      {
        label: 'Invisible', on: hidden, run: () => this.host.setPieceInvisible(element.id, true),
        title: 'Nothing built: the opening still scores and lights, and there is nothing to hit. A flag goes with the frame.',
      },
    ], 'Whether the opening has a frame round it'));
  }

  /*
   * WHICH SIDE OF A FLAG THE LINE GOES ROUND, as the compass: the line passes on the north side of it, or the south,
   * or either of the others, and the pass is turned to face that way and kept there. That is what a turn flag at
   * the end of a long oval is, a pass on its far side, and it was a round handle on the plan that had to be dragged
   * to it. Auto hands it back to the rule, which is the outside of the turn. Only a five inch marker: a waypoint
   * has no side, and a hall's poles are not turned round.
   */
  cardPassOn(card, element, at) {
    if (this.host.isWhoopRace() || !at || kindOf(element) !== KIND.MARKER || element.type === 'waypoint') {
      return;
    }
    const set = element.yawOverridden === true;
    const lit = (deg) => set && Math.abs(wrapAngle(element.yaw - deg * RAD)) < 0.02;
    card.append(this.cardChoice('Line passes on its', [
      ...[['North', 90], ['East', 0], ['South', -90], ['West', 180]].map(([label, deg]) => ({
        label, on: lit(deg), run: () => this.host.setElementYaw(element.id, deg * RAD),
      })),
      { label: 'Auto', on: !set, run: () => this.host.clearOverride(at.id), title: 'The outside of the turn, worked out from the line' },
    ], 'Which side of the flag the line goes round'));
  }

  /*
   * THE FLAGS ON A PIECE, as one choice: none, left, right, both, on top. A gate with flags and one without are
   * two types and the card does not make anybody know that: choosing is what changes it. Left and right are as
   * seen facing the gate. A hurdle has no top, because its flags are at its ends. Only on a five inch track.
   */
  cardFlags(card, element) {
    if (this.host.isWhoopRace() || !canFlag(element) || isUnbuilt(element)) {
      return;
    }
    const now = flagsOf(element);
    const choices = element.type === 'barrier' ? ['none', 'left', 'right', 'both'] : ['none', 'left', 'right', 'both', 'top'];
    const word = { none: 'None', left: 'Left', right: 'Right', both: 'Both', top: 'On top' };
    card.append(this.cardChoice('Flags', choices.map((c) => ({
      label: word[c], on: now === c, run: () => this.host.setPieceFlags(element.id, c),
    })), 'Where the pennants stand, as seen facing the gate'));
  }

  /*
   * ROUND THE FLAG, BEFORE THE PASS THE CARD IS ABOUT: the line goes round the pennant on one of the gate's uprights
   * and through the gate once, spiralling down a whole turn from over the header when Spiral down is on, and round
   * and straight in when it is off (parts.js addSpiral). Waypoints, one undo step each way. The row shows the figure
   * that is in front of this pass, as Flags shows the flags: None, or the side it goes round, and Spiral down lit when
   * it spirals; with none there, Spiral down is what the next press makes. Left and right are as flown, so the side
   * is the way the pilot turns: clockwise round a flag on the right. A side with no flag on it is offered and
   * refused, with the reason, because Flags is the row above. `label` lets a wall's card say which bay it is about.
   */
  cardRound(card, element, at, label = 'Round the flag') {
    /* A letter has no pennant to go round, and nor has a gate with no frame. */
    if (this.host.isWhoopRace() || !at || kindOf(element) !== KIND.APERTURE || isLetterPiece(element) || isUnbuilt(element)) {
      return;
    }
    const has = flagsAsFlown(this.host.doc, at.id);
    const now = roundFlagOf(this.host.doc, at.id);
    const spiral = now ? now.spiral : this.host.spiralDown;
    const how = spiral ? 'spiral down a whole turn round' : 'go round';
    const side = (key, word, way) => ({
      label: word,
      on: now?.side === key,
      disabled: !has[key] && now?.side !== key,
      run: () => this.host.roundFlag(at.id, key),
      title: has[key]
        ? `Before this pass: ${how} the flag on the ${key} hand upright, ${way}, and through the gate`
        : `There is no flag on the ${key} hand upright as this pass flies it. Flags puts one there.`,
    });
    card.append(this.cardChoice(label, [
      { label: 'None', on: !now, run: () => this.host.clearRoundFlag(at.id), title: 'Straight into the gate: no figure in front of this pass' },
      side('left', 'Left', 'anticlockwise'),
      side('right', 'Right', 'clockwise'),
      {
        label: 'Spiral down',
        toggle: true,
        on: spiral,
        /* On a pass with the figure in front of it, this makes it again the other way round the same flag. Without
         * one it is a way of working that stays for the next press, as the Square on the bar does. */
        run: () => this.host.setSpiralDown(!spiral, now ? at.id : null),
        title: 'On: a whole turn round the flag, coming down from over the header, then the pass. Off: round the flag and straight in.',
      },
    ]));
  }

  /* A wall's card: one piece of N bays, how it is flown, how wide a bay is, and which ends carry a pennant. */
  renderWallCard(card, head, close, actions, copyBtn, wall, id) {
    const doc = this.host.doc;
    const n = wall.ids.length;
    head.append(el('strong', null, `Wall, ${n} bays`), close);
    card.append(head);
    const woven = wallIsWoven(doc, id);
    card.append(this.cardChoice('Flown', [
      { label: 'Weave', on: woven, run: () => this.host.setWeave(id, true), title: 'A slalom: each bay the other way to the one before' },
      { label: 'Straight', on: !woven, run: () => this.host.setWeave(id, false), title: 'Every bay the same way' },
    ]));
    const size = wallSizeOf(doc, id);
    card.append(this.cardChoice('Bay', [
      ['standard', 'Standard'], ['wide', 'Wide'], ['championship', 'Championship'],
    ].map(([key, label]) => ({
      label, on: size === key, run: () => this.host.setWallBay(id, key),
      title: GATE_PRESETS.find((p) => p.id === key)?.hint || `${label}: the gate size`,
    })), 'How wide a bay is'));
    const ends = wallFlagsOf(doc, id);
    card.append(this.cardChoice('Flags', [
      ['none', 'None'], ['first', 'First end'], ['last', 'Last end'], ['both', 'Both'],
    ].map(([key, label]) => ({
      label, on: ends === key, run: () => this.host.setPieceFlags(id, key),
      title: 'The first end is where the wall was dragged from, which is the bay flown first',
    })), 'Which ends carry a pennant, on their outer upright'));
    /* Into the first bay round the flag on its end, which is how a wall with a flag on it is often entered. */
    const into = doc.sequence.find((q) => wall.ids.includes(q.elementId));
    if (into) {
      this.cardRound(card, elementById(doc, into.elementId), into, 'Into it round the flag');
    }
    actions.insertBefore(button('Reverse', 'tb-btn', () => this.host.reverseWallOf(id), 'Fly the wall the other way. Every pass turns round'), copyBtn);
    card.append(actions);
    const doneWall = new Set(wall.ids);
    this.cardWarnings(card, { id: wall.ids[0] }, doc.sequence.filter((q) => doneWall.has(q.elementId)));
  }

  /*
   * A piece's passes as a row of chips on its card, the pass the card is about
   * filled. A click pins that pass (and the card, the room and the strip all turn to
   * it), and the pointer over one lights it in the room and changes nothing else:
   * the card stays about the pass that was chosen. Under the row, the card's own
   * controls are about that pass alone, and a button there takes just that pass out
   * of the lap.
   */
  passChips(entries, numbers, at) {
    const row = el('div', 'tb-card-passes');
    row.append(el('span', 'tb-card-passes-label', 'Pass'));
    for (const q of entries) {
      const n = numbers.get(q.id);
      const chip = el('button', q.id === at?.id ? 'tb-chip on' : 'tb-chip', n == null ? '\u00b7' : String(n));
      chip.type = 'button';
      chip.dataset.seq = q.id;
      chip.title = n == null ? 'A waypoint pass' : `Pass ${n} in the flying order`;
      chip.addEventListener('pointerenter', () => this.host.setPassHover(q.id));
      chip.addEventListener('pointerleave', () => this.host.setPassHover(null));
      chip.addEventListener('click', () => this.host.setPassPinned(q.id));
      row.append(chip);
    }
    if (at) {
      row.append(button('Remove this pass', 'tb-btn tb-mini', () => this.host.removeSequenceEntry(at.id),
        'Takes this one pass out of the lap and leaves the piece where it stands'));
    }
    return row;
  }

  /* What the rules say about this piece, in the words the mark on it carries. */
  cardWarnings(card, element, entries) {
    const said = (this.host.warnings ?? []).filter((w) => w.level === 'warn'
      && (w.elementId === element.id || (w.also ?? []).includes(element.id)
        || (w.seqId && entries.some((q) => q.id === w.seqId))));
    if (!said.length) {
      return;
    }
    const list = el('div', 'tb-card-warns');
    for (const w of said) {
      list.append(el('p', 'tb-card-warn', w.message));
    }
    card.append(list);
  }

  /*
   * REPLACE WITH: a gate that ought to have been a stack, or a pole a cone, is
   * changed where it stands and keeps its place in the order, so the piece does
   * not have to be deleted, placed again and renumbered. Only what every selected
   * piece can become is offered (snap.js replacementsFor); nothing at all, and so
   * no field, when what is selected has no such answer.
   */
  replaceField(ids) {
    /* The swaps are RaceGOW's palette; a five inch track keeps the flag choice on the card instead. */
    if (!this.host.isWhoopRace()) {
      return null;
    }
    const types = replacementsFor(this.host.doc, ids);
    if (!types.length) {
      return null;
    }
    const row = el('label', 'tb-field tb-card-swap');
    row.append(el('span', 'tb-field-label', 'Replace with'));
    const sel = el('select');
    sel.dataset.tbkey = 'card-replace';
    const none = el('option', null, 'Choose a piece');
    none.value = '';
    sel.append(none);
    for (const type of types) {
      const opt = el('option', null, labelOf(type, 'micro'));
      opt.value = type;
      sel.append(opt);
    }
    sel.addEventListener('change', () => {
      if (sel.value) {
        this.host.replaceSelection(sel.value);
      }
    });
    row.append(sel);
    return row;
  }

  /*
   * Where the card floats: to the right of what is selected, or to its left
   * when there is no room on the right, and never over the lap bar. `project`
   * puts a document point on the stage; a window too narrow to float it in
   * docks it. Called by view3d.placeOverlay after every frame.
   */
  placeCard(project, rect) {
    const card = this.nodes.card;
    if (!card || card.hidden) {
      return;
    }
    /* Out of the way of a pull on a map: it follows the piece, and the piece is what the pointer is on. Hidden and
     * not taken out, so it is back where it was the frame the piece is put down (bug-67ae1762). */
    if (docModeOf(this.host.doc) === 'freestyle' && this.host.gesturing && this.host.gesturing()) {
      card.style.visibility = 'hidden';
      return;
    }
    card.style.visibility = '';
    if (this.applyCardPin(card)) {
      return;
    }
    const c = this.host.selectionCentroid();
    const at = c ? project({ x: c.x, y: c.y, z: c.z + 0.9 }) : null;
    /* A map's pieces are anything from a lamp to a warehouse: the card keeps off the whole of what is selected,
     * as it appears on the screen, and not only off a point in it. */
    const area = docModeOf(this.host.doc) === 'freestyle' ? this.selectionArea(project) : null;
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    /* The open drawer takes the right of the stage, and the card, its close
     * button above all, keeps out from under it (MENUS-PLAN.md 1.18). */
    const cover = this.host.drawerCover ? this.host.drawerCover() : 0;
    rect = { width: Math.max(w + 20, rect.width - cover), height: rect.height };
    /* The first place that does not sit on the piece the card is about: beside
     * it on the right, beside it on the left, above it, below it. The clear
     * space is what the pilot is looking at, so where none is left the card is
     * docked to the foot and the room goes on under it. */
    const gap = 72;
    /* Its top is fixed to the piece, not its middle: a card that grows (a
     * sentence appears) grows downward, and nothing under the finger jumps. */
    const top = at ? at.y - 48 : 0;
    const side = 24;
    const tries = area ? [
      { x: area.x1 + side, y: Math.max(10, area.y0) },
      { x: area.x0 - side - w, y: Math.max(10, area.y0) },
      { x: area.cx - w / 2, y: area.y0 - side - h },
      { x: area.cx - w / 2, y: area.y1 + side },
    ] : (at ? [
      { x: at.x + gap, y: top },
      { x: at.x - gap - w, y: top },
      { x: at.x - w / 2, y: at.y - gap - h },
      { x: at.x - w / 2, y: at.y + gap },
    ] : []);
    for (const t of tries) {
      const x = clamp(t.x, 10, Math.max(10, rect.width - w - 10));
      /* The bar stands 44 px off the foot, and a card keeps 8 px clear of it. */
      const y = clamp(t.y, 10, Math.max(10, rect.height - h - (this.barH || 90) - 52));
      const covers = area
        ? x < area.x1 + 8 && x + w > area.x0 - 8 && y < area.y1 + 8 && y + h > area.y0 - 8
        : at.x > x - 60 && at.x < x + w + 60 && at.y > y - 60 && at.y < y + h + 60;
      if (!covers && this.host.mode === '3d') {
        card.classList.remove('docked');
        card.style.left = `${x.toFixed(0)}px`;
        card.style.top = `${y.toFixed(0)}px`;
        return;
      }
    }
    card.classList.add('docked');
    card.style.left = '';
    card.style.top = '';
  }

  /*
   * WHERE WHAT IS SELECTED IS ON THE SCREEN, as a box { x0, y0, x1, y1, cx }: the corners of each piece's ground
   * (planShapeOf) at its base and a point over the middle at its top. Null when none of it is in front of the
   * camera, which docks the card.
   */
  selectionArea(project) {
    const doc = this.host.doc;
    const out = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const id of this.host.selection) {
      const e2 = elementById(doc, id);
      if (!e2) {
        continue;
      }
      const def = ELEMENTS[e2.type];
      const base = e2.position.z;
      const top = base + (def?.kind === KIND.STRUCTURE ? elementHeight(def, e2.dims, propStyleOf(e2), tiltOf(e2)) : 1);
      const pts = [...planShapeOf(e2, doc).map((q) => ({ x: q.x, y: q.y, z: base })), { x: e2.position.x, y: e2.position.y, z: top }];
      for (const q of pts) {
        const at = project(q);
        if (!at) {
          continue;
        }
        out.x0 = Math.min(out.x0, at.x);
        out.y0 = Math.min(out.y0, at.y);
        out.x1 = Math.max(out.x1, at.x);
        out.y1 = Math.max(out.y1, at.y);
      }
    }
    if (!Number.isFinite(out.x0)) {
      return null;
    }
    out.cx = (out.x0 + out.x1) / 2;
    return out;
  }

  /*
   * THE LAP STRIP, along the foot of the room above the lap bar: one chip for each
   * pass in flying order, its number and a small mark for what kind of piece it
   * is, a waypoint as a dot. It is the same lap the tags in the room number, laid
   * out in time, and the two point at each other: a pass under the pointer here
   * is the pass in focus there (host.setPassHover), a click pins it and selects its
   * piece, and while one is in focus every other chip of the same piece is ringed,
   * which is how a piece flown four times is found on a strip with no colour to
   * remember. A drag moves a pass in the order; Delete takes that pass out and
   * only that pass. The last chip is the Fly order tool.
   *
   * The chips are kept while the lap says the same thing. Hover and focus are only
   * classes (renderPassFocus), because a button the pointer is on must not be
   * rebuilt from under it: a click that lands on the new one is a click that never
   * happened.
   */
  lapStrip() {
    const doc = this.host.doc;
    const list = passList(doc);
    const warned = new Set((this.host.warnings ?? []).filter((w) => w.level === 'warn' && w.seqId).map((w) => w.seqId));
    const armed = this.host.armed === 'route';
    const sig = `${armed ? '+' : '-'}${list.map((p) => `${p.seq.id}:${p.number ?? '.'}:${p.element.type}:${faceLabel(doc, p.seq)}:${warned.has(p.seq.id) ? 'w' : ''}`).join('|')}`;
    if (this.stripNode && sig === this.stripSig) {
      return this.stripNode;
    }
    this.stripSig = sig;
    const strip = el('div', 'tb-strip');
    /* A toolbar: buttons that are one stop for Tab and are walked with the arrow keys,
     * which is what the strip is. (A list item would take the chip's button role away.) */
    strip.setAttribute('role', 'toolbar');
    strip.setAttribute('aria-label', 'The lap, pass by pass');
    const host = this.host;
    /* One tab stop for the whole strip: thirty chips are thirty presses of Tab to get
     * past, and the arrow keys walk them. The stop is the chip that last had the
     * keyboard, else the pass in focus, else the first. */
    const ids = list.map((p) => p.seq.id);
    const focus = host.focusedPass?.() ?? null;
    const stop = ids.includes(this.stripTab) || this.stripTab === 'add' ? this.stripTab : ids.includes(focus) ? focus : (ids[0] ?? 'add');
    const allChips = () => [...strip.querySelectorAll('.tb-chip')];
    const takeStop = (chip) => {
      this.stripTab = chip.dataset.seq ?? 'add';
      for (const c of allChips()) {
        c.tabIndex = c === chip ? 0 : -1;
      }
    };
    /* Left, Right, Home and End walk the strip; true when the key was one of them. */
    const walk = (e, chip) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        return false;
      }
      e.preventDefault();
      e.stopPropagation();
      const chips = allChips();
      const at = chips.indexOf(chip);
      const to = e.key === 'Home' ? 0 : e.key === 'End' ? chips.length - 1 : at + (e.key === 'ArrowRight' ? 1 : -1);
      chips[Math.max(0, Math.min(chips.length - 1, to))]?.focus();
      return true;
    };
    list.forEach((p, i) => {
      const bend = p.number == null;
      const chip = el('button', bend ? 'tb-chip tb-chip-bend' : 'tb-chip', bend ? '' : String(p.number));
      chip.type = 'button';
      chip.dataset.seq = p.seq.id;
      chip.dataset.el = p.element.id;
      chip.dataset.kind = CHIP_KINDS[p.element.type] ?? 'gate';
      /* An opening with no frame is drawn dashed, as the plan draws it, so a strip can be read without the room. */
      if (isUnbuilt(p.element)) {
        chip.dataset.invisible = '1';
      }
      if (warned.has(p.seq.id)) {
        chip.classList.add('warn');
      }
      const said = bend
        ? 'A waypoint: the line bends here'
        : `Pass ${p.number}: ${sequenceLabel(doc, p.seq)}, ${faceLabel(doc, p.seq)}`;
      chip.setAttribute('aria-label', said);
      chip.title = `${said}. Click to look at it, drag to move it, Delete takes it out of the lap.`;
      chip.draggable = true;
      chip.tabIndex = p.seq.id === stop ? 0 : -1;
      chip.addEventListener('focus', () => takeStop(chip));
      chip.addEventListener('pointerenter', () => host.setPassHover(p.seq.id));
      chip.addEventListener('pointerleave', () => host.setPassHover(null));
      chip.addEventListener('click', () => host.setPassPinned(p.seq.id));
      chip.addEventListener('dblclick', () => host.focusSelection());
      chip.addEventListener('keydown', (e) => {
        /* The keys a chip owns are not the room's: Delete would take the piece
         * out from under the pass, and the arrows would nudge it. */
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          e.stopPropagation();
          const next = list[i + 1] ?? list[i - 1];
          if (next) {
            requestAnimationFrame(() => this.stripNode?.querySelector(`[data-seq="${next.seq.id}"]`)?.focus());
          }
          host.removeSequenceEntry(p.seq.id);
        } else {
          walk(e, chip);
        }
      });
      chip.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(p.index));
        e.dataTransfer.effectAllowed = 'move';
        chip.classList.add('dragging');
      });
      chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
      chip.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        chip.classList.add('over');
      });
      chip.addEventListener('dragleave', () => chip.classList.remove('over'));
      chip.addEventListener('drop', (e) => {
        e.preventDefault();
        chip.classList.remove('over');
        const from = Number(e.dataTransfer.getData('text/plain'));
        if (Number.isFinite(from) && from !== p.index) {
          host.reorder(from, p.index);
        }
      });
      strip.append(chip);
    });
    const add = el('button', armed ? 'tb-chip tb-chip-add on' : 'tb-chip tb-chip-add', '+');
    add.type = 'button';
    add.setAttribute('aria-label', 'Fly order: click the pieces in the order you fly them');
    add.title = 'Fly order (N). Click the pieces in the order you fly them: a click on a piece again is another pass through it.';
    add.tabIndex = stop === 'add' ? 0 : -1;
    add.addEventListener('focus', () => takeStop(add));
    add.addEventListener('keydown', (e) => { walk(e, add); });
    add.addEventListener('click', () => host.arm('route'));
    strip.append(add);
    this.stripNode = strip;
    return strip;
  }

  /*
   * The strip and the card say which pass is in focus by a class, and this puts
   * them right without building anything: the chip of the pass in focus is lit, the
   * other chips of its piece are ringed, and the chip is scrolled into view when the
   * focus moved by a click and not by the pointer passing over.
   */
  renderPassFocus() {
    const focus = this.host.focusedPass?.() ?? null;
    const strip = this.stripNode;
    if (strip) {
      const owner = focus ? this.host.doc.sequence.find((q) => q.id === focus)?.elementId ?? null : null;
      for (const chip of strip.querySelectorAll('.tb-chip[data-seq]')) {
        if (chip.dataset.seq === focus) {
          chip.setAttribute('aria-current', 'true');
        } else {
          chip.removeAttribute('aria-current');
        }
        chip.classList.toggle('on', chip.dataset.seq === focus);
        chip.classList.toggle('linked', owner != null && chip.dataset.el === owner && chip.dataset.seq !== focus);
      }
      if (focus !== this.stripFocus && this.host.passHover == null) {
        strip.querySelector(`[data-seq="${focus}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }
      this.stripFocus = focus;
    }
  }

  /*
   * THE LAP BAR, along the foot: the lap's length, how many gates, whether the
   * lap closes and how many warnings there are, from the same path and the same
   * warnings the drawer's results show. The button opens the drawer, which is
   * where the flying order, the warnings and the elevation profile are.
   */
  renderLapBar() {
    const bar = this.nodes.lapbar;
    if (!bar) {
      return;
    }
    /* Emptying the bar takes a focused chip out of the page, and a click on a chip
     * repaints the bar (the selection changed), so the keys that belong to the strip
     * would stop working the moment the chip was pressed. A chip that is still on the
     * strip afterwards gets its focus back. */
    const held = bar.contains(document.activeElement) ? document.activeElement : null;
    const heldAs = held && held.classList.contains('tb-chip') ? (held.dataset.seq ?? 'add') : null;
    bar.textContent = '';
    if (!this.host.buildsIn3D()) {
      this.stripNode = null;
      this.stripSig = '';
      return;
    }
    const doc = this.host.doc;
    const bad = (this.host.warnings ?? []).filter((w) => w.level === 'warn').length;
    const fig = (label, value, tone, small = '') => {
      const f = el('span', tone ? `tb-lap-fig ${tone}` : 'tb-lap-fig');
      f.append(el('span', null, label), el('b', null, value));
      if (small) {
        f.append(el('small', null, small));
      }
      return f;
    };
    /*
     * A MAP'S BAR: what is on it, what the physics will hold, what is wrong, and how big the plot is. No strip
     * and no length, because a map has no lap; the drawer is the inspector and the report, so it says Details.
     */
    if (docModeOf(doc) === 'freestyle') {
      this.stripNode = null;
      this.stripSig = '';
      const report = this.host.report ?? null;
      bar.append(
        fig('Things', String(doc.elements.length)),
        fig('Solids', report ? String(report.solids) : '0'),
        fig('Warnings', String(bad), bad ? 'bad' : 'good'),
        el('span', 'tb-lap-gap'),
        button(`Plot ${sayLength(doc, doc.field.width).replace(' m', '')} \u00d7 ${sayLength(doc, doc.field.depth)}`, 'tb-btn', () => this.host.openFieldSettings(),
          'How big the plot is, the grid, the time of day and the ground'),
        this.drawerToggle('Details', 'Everything about what is selected, the plot, and every warning', 'Close the panel. Esc'),
      );
      return;
    }
    const path = this.host.path;
    const gates = [...gateNumbers(doc).values()].filter((n) => n != null).length;
    const reuse = reuseOf(doc);
    /* Nothing to fly, nothing to show: a lone plus on an empty room is a tool for a lap
     * that has no pieces. */
    const anything = doc.sequence.length > 0 || doc.elements.some((e) => isSequenceable(e));
    bar.append(
      ...(anything ? [this.lapStrip()] : []),
      /* Feet, as the room's pieces are inches, and the metres in small print (MENUS-PLAN.md 4.2a). A field is in metres
       * from end to end, as its pieces are. */
      this.inches()
        ? fig('Length', path ? `${Math.round(path.length / FT)} ft` : '0 ft', '', path ? `${path.length.toFixed(1)} m` : '')
        : fig('Length', path ? `${path.length.toFixed(0)} m` : '0 m'),
      /* Passes are not gates: Track 8 is 14 pieces flown 29 times, and "Gates 29" was wrong about
       * the room it stood in. Said as it is once a piece is flown more than once. */
      reuse.passes > reuse.pieces ? fig('Passes', `${reuse.passes} on ${reuse.pieces} pieces`) : fig('Gates', String(gates)),
      fig('Lap', path && path.closed ? 'closes' : 'open', path && path.closed ? 'good' : ''),
      fig('Warnings', String(bad), bad ? 'bad' : 'good'),
      el('span', 'tb-lap-gap'),
      ...(this.host.armed === 'route' && doc.sequence.length
        ? [button('Start over', 'tb-btn', () => this.host.startOrderOver(), 'Empty the flying order and begin it again, waypoints included. One undo brings it back')]
        : []),
      ...(this.host.isWhoopRace()
        ? [button('Build sheet', 'tb-btn tb-lap-sheet', () => this.host.openSheet(), 'A page to print: where every piece stands, measured from a corner, and what pipe and fittings to buy')]
        : [button(`Field ${sayLength(doc, doc.field.width).replace(' m', '')} \u00d7 ${sayLength(doc, doc.field.depth)}`, 'tb-btn', () => this.host.openFieldSettings(),
          'How big the field is, and the grid. A track has to stay inside it')]),
      this.drawerToggle(),
    );
    this.renderPassFocus();
    if (held && held.isConnected && held !== document.activeElement) {
      held.focus({ preventScroll: true });
    } else if (heldAs && !held.isConnected && this.stripNode) {
      /* The strip was made again (an edit changed the lap): the same pass, if it is
       * still there, has the keyboard back. A pass that was taken out has none, and
       * whoever took it out has said where the keyboard goes. */
      this.stripNode.querySelector(heldAs === 'add' ? '.tb-chip-add' : `[data-seq="${heldAs}"]`)?.focus({ preventScroll: true });
    }
  }

  /*
   * THE LAP BAR'S FLYING ORDER, which opens and closes the drawer and says which
   * it will do. While the drawer is open the bar stands clear of it (the
   * stylesheet's --tb-cover), so this button is never under the thing it
   * closes, and it is lit, as an open panel's switch is.
   */
  drawerToggle(word = 'Flying order', hint = 'The order the gates are flown in, every warning, and the elevation profile', openHint = 'Close the panel with the flying order, the warnings and the profile. Esc') {
    const open = Boolean(this.host.drawerOpen);
    const b = button(word, open ? 'tb-btn on' : 'tb-btn', (e) => this.host.toggleDrawer(null, { from: e.currentTarget, keys: e.detail === 0 }),
      open ? openHint : hint);
    b.dataset.drawer = '';
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
    b.setAttribute('aria-controls', 'tb-side');
    return b;
  }

  /* One line at the foot of the room, while a track is still a few gates, saying
   * what the pointer does now. It goes when there are three gates: by then the
   * pilot knows. */
  renderCoach() {
    const coach = this.nodes.coach;
    if (!coach) {
      return;
    }
    const doc = this.host.doc;
    if (docModeOf(doc) === 'freestyle') {
      const said = this.mapCoach(doc);
      coach.hidden = !said;
      coach.textContent = said;
      return;
    }
    const gates = doc.elements.filter((e) => kindOf(e) === KIND.APERTURE).length;
    let text = '';
    const touched = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const room = this.host.buildsIn3D();
    const whoop = this.host.isWhoopRace();
    const armed = this.host.armed;
    const ground = whoop ? 'floor' : 'ground';
    if (room && armed === 'route') {
      /* Words only: a button floating over the room would take the tap meant for the
       * piece beside it, and Start over is not a thing to be pressed by accident. It is
       * on the lap bar. */
      const hurdle = whoop ? '' : ' A hurdle is flown over.';
      text = touched
        ? (doc.sequence.length
          ? `Fly order: tap the next piece. A piece again is another pass.${hurdle} Tap the plus again to put the tool away.`
          : `Fly order: tap the first piece the lap goes through, then the next. A piece again is another pass.${hurdle}`)
        : (doc.sequence.length
          ? `Fly order: click the next piece. A piece again is another pass.${hurdle} Backspace takes the last pass off. Esc puts the tool away.`
          : `Fly order: click the first piece the lap goes through, then the next. A piece again is another pass.${hurdle} Esc puts the tool away.`);
    } else if (whoop && armed === 'cube') {
      text = touched
        ? 'Tap the floor to put a cube down: five gates in one piece, flown straight through along the way it faces. The tool stays armed. Tap Cube again to put it away.'
        : 'Click the floor to put a cube down: five gates in one piece, flown straight through along the way it faces. The tool stays armed. Right click or Esc puts it away.';
    } else if (whoop && (armed === 'row' || armed === 'ruler')) {
      /* A finger has no right button and no Esc: on a touch screen the tool is
       * put away where it was taken from, which on a phone is behind Tools. */
      const away = this.host.onPhone() ? ' Put it away from Tools.' : ' Tap it again on the left to put it away.';
      text = armed === 'row'
        ? (touched
          ? `Drag along the floor to lay a row of two or three gates, 30 in apart. One tap lays a pair.${away}`
          : 'Drag along the floor to lay a row of two or three gates, 30 in apart. One click lays a pair. Right click or Esc puts the tool away.')
        : (touched
          ? `Tap two points to measure between them. A tap near a gate or a pole takes its middle.${away}`
          : 'Click two points to measure between them. A click near a gate or a pole takes its middle. Right click or Esc puts the ruler away.');
    } else if (room && armed === 'ruler') {
      text = touched
        ? `Tap two points to measure between them, in metres. A tap near a piece takes its middle.${this.host.onPhone() ? ' Put it away from Tools.' : ' Tap it again on the left to put it away.'}`
        : 'Click two points to measure between them, in metres. A click near a piece takes its middle. Right click or Esc puts the ruler away.';
    } else if (room && !whoop && armed === 'wall') {
      text = touched
        ? 'Drag along the ground, from the bay that is flown first, to lay a wall. A tap lays three. One wall, then the tool is put away.'
        : 'Drag along the ground, from the bay that is flown first, to lay a wall of gates that share their uprights, two to six. A click lays three. One wall, then the tool is put away. Alt turns it freely.';
    } else if (room && !whoop && armed === 'run') {
      text = `${touched ? 'Tap' : 'Click'} where the section starts: the first piece stands there, facing the way the track is going, and the rest follow the shape picked under the tool. One section, then the tool is put away.${touched && this.host.onPhone() ? ' The shapes are under Tools.' : ''}`;
    } else if (room && !whoop && armed === 'launchGate') {
      text = `${touched ? 'Tap' : 'Click'} where the launch gate goes: a horizontal gate 15 ft up, flown up through from below, with the pull up and push over that fly it laid as waypoints. One gate, then the tool is put away.`;
    } else if (room && !whoop && armed === 'barHurdle') {
      text = `${touched ? 'Tap' : 'Click'} where the bar hurdle goes: a bar 10 ft wide and 5 ft up on two legs, turned across the track, with the lap passing over it. The card says under or skimming. One hurdle, then the tool is put away.`;
    } else if (room && !whoop && armed === 'hurdle') {
      text = `${touched ? 'Tap' : 'Click'} where the hurdle goes: a board 4 m long and 1 m high with a flag at each end, turned across the track, with the lap passing over it. One hurdle, then the tool is put away.`;
    } else if (room && !whoop && armed === 'upGate') {
      text = `${touched ? 'Tap' : 'Click'} where the up gate goes: leaning 45 degrees with its lower edge 1.5 m up, flown up through. One gate, then the tool is put away.`;
    } else if (room && (doc.elements.length || armed) && gates < 3) {
      const phone = this.host.onPhone();
      if (armed) {
        text = touched
          ? `Tap the ${ground} to place it. The tool stays in hand, so a second tap places another.${phone ? ' Put it away from Tools.' : ' Tap it again on the left to put it away.'}`
          : `Click the ${ground} to place it. The tool stays armed, so a second click places another. Right click or Esc puts it away.`;
      } else if (this.host.selection.size) {
        /* The card is on the screen with its own buttons, and on a field it is tall enough to sit over this line. */
        text = whoop
          ? (touched
            ? 'Drag it to move it. Drag the ring at its foot to turn it.'
            : 'Drag it to move it. Drag the ring at its foot to turn it. The arrow keys nudge it.')
          : '';
      } else {
        text = touched
          ? `Tap a gate to select it. Drag empty ${ground} to look round. ${phone ? 'Tools has the pieces to place more.' : 'Pick a tool on the left to place more.'}`
          : `Click a gate to select it. Drag empty ${ground} to look round. Pick a tool on the left to place more.`;
      }
    }
    coach.hidden = !text;
    coach.textContent = text;
  }

  /*
   * THE LINE AT THE FOOT OF A MAP'S ROOM: what the pointer does with the tool in hand, and while the map is only a
   * few things, what it does with none. A road and a car say what the next click does, because they are not
   * placed the way the rest are. It goes when there are six things: by then the pilot knows.
   */
  mapCoach(doc) {
    const touched = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const phone = this.host.onPhone();
    const armed = this.host.armed;
    const tap = touched ? 'Tap' : 'Click';
    const away = phone ? ' Put it away from Tools.' : ' Tap it again on the left to put it away.';
    const esc = touched ? away : ' Right click or Esc puts it away.';
    if (armed === 'ruler') {
      return `${tap} two points to measure between them, in metres. A ${tap.toLowerCase()} near a piece takes its middle.${touched ? away : ' Right click or Esc puts the ruler away.'}`;
    }
    if (armed === 'road') {
      const n = this.host.roadDraft?.length ?? 0;
      if (!n) {
        return `${tap} the ground to lay the road's first node. It bends through its nodes the way a car can drive.${esc}`;
      }
      return touched
        ? `${n} node${n === 1 ? '' : 's'} laid. Tap the next, tap the first to close a loop, tap the last again to finish. Backspace takes one back.${esc}`
        : `${n} node${n === 1 ? '' : 's'} laid. Click the next, click the first to close a loop, double click or Enter to finish. Backspace takes one back. Esc cancels.`;
    }
    if (armed === 'vehicle') {
      return doc.elements.some((e) => kindOf(e) === KIND.ROAD)
        ? `${tap} a road to put a car on it. On a two lane loop the side you ${tap.toLowerCase()} is the lane it drives.${esc}`
        : 'A car drives a road, and this map has none yet. Lay one with the Road tool first.';
    }
    if (armed) {
      return `${tap} the plot to place it. It stands on what is under the ${touched ? 'finger' : 'pointer'}: the ground, a roof, a container. The tool stays in hand, so a second ${tap.toLowerCase()} places another.${esc}`;
    }
    if (doc.elements.length >= 6 || this.host.selection.size) {
      return '';
    }
    return doc.elements.length
      ? (touched
        ? `Tap a piece to select it. Drag it to move it, and the ring at its foot turns it. Drag empty ground to look round. ${phone ? 'Tools has the pieces to place more.' : 'Pick a tool on the left to place more.'}`
        : 'Click a piece to select it. Drag it to move it, and the ring at its foot turns it. Drag empty ground to look round. Pick a tool on the left to place more.')
      : '';
  }

  /* An empty canvas is the hardest thing to start from and a finished track with
   * one gate to move is the easiest, so it says what to do and offers the
   * second. */
  renderEmpty() {
    const box = this.nodes.empty;
    if (!box) {
      return;
    }
    /*
     * Not once a tool is armed: the coach line says what to do then. Not on a map. Every race canvas has one, the
     * five inch's too (MENUS-PLAN.md 4.2b): a first author met an empty grid and a paragraph at the foot of the
     * palette, and Load had no five inch track to start from. Its way in is the board, whose five inch tracks are
     * opened as a copy the way Remix opens one, so there is no second copy shipped here to drift from the one
     * people race. The five inch canvas is built in the room now, so it shows in either view.
     */
    const doc = this.host.doc;
    const whoop = this.host.isWhoopRace();
    const show = this.host.buildsIn3D() && doc.elements.length === 0 && !this.host.armed;
    box.hidden = !show;
    box.textContent = '';
    if (!show) {
      return;
    }
    /* Where the tools are and what a finger does: a phone's palette is a
     * drawer behind Tools on the bar, and a touch screen is tapped. */
    const touched = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const thing = docModeOf(doc) === 'freestyle' ? 'a piece' : 'a gate';
    const first = (place) => (this.host.onPhone()
      ? `Open Tools and pick ${thing}, then tap the ${place}.`
      : `Pick ${thing} on the left, then ${touched ? 'tap' : 'click'} the ${place}.`);
    if (whoop) {
      box.append(
        el('p', null, first('floor')),
        el('p', 'tb-help', 'Or start from a finished RaceGOW track and move a gate.'),
        button('Start from a RaceGOW track', 'tb-btn tb-primary', () => this.host.openLoad(), 'The eight tracks of RaceGOW5, to open and change'),
      );
      return;
    }
    if (docModeOf(doc) === 'freestyle') {
      box.append(
        el('p', null, `${first('plot')} It stands on what is under the ${touched ? 'finger' : 'pointer'}: the ground, or a roof.`),
        el('p', 'tb-help', 'Or open the starter yard, and make it yours.'),
        button('Start from the yard', 'tb-btn tb-primary', () => this.host.openLoad(), 'The maps that ship with the builder, and the ones you saved'),
      );
      return;
    }
    box.append(
      el('p', null, first('field')),
      el('p', 'tb-help', 'Or start from a track on the board, and make it yours. Square on the bar keeps new gates on the compass, as a plan is drawn.'),
      button('Start from a track on the board', 'tb-btn tb-primary', () => this.host.openBoardStarters(), 'The five inch tracks on Tracks and times, each opened as your own copy'),
    );
  }

  /* ---------------- results ---------------- */

  renderResults() {
    const host = this.nodes.results;
    host.textContent = '';
    const doc = this.host.doc;
    const path = this.host.path;

    host.append(el('h3', null, 'Results'));
    if (docModeOf(doc) === 'freestyle') {
      this.renderMapResults(host, doc);
      return;
    }
    if (!path) {
      host.append(el('p', 'tb-help', 'Nothing in the flying order yet. Place a gate and it appears here, with the lap figures and any warnings.'));
      appendTypeStats(host, doc);
      const empty = el('div', 'tb-profile-foot');
      empty.append(el('h3', null, 'Elevation'), this.nodes.profile);
      host.append(empty);
      drawProfile(this.nodes.profile, null);
      return;
    }

    /* A whoop canvas in feet and inches, with the metres in small print, as
     * everything else on it is (MENUS-PLAN.md 4.2a). */
    const inches = this.host.isWhoopRace();
    const bend = path.tightest && Number.isFinite(path.tightest.radius) ? path.tightest.radius : null;
    const stats = el('div', 'tb-stats');
    stats.append(
      inches
        ? stat('Length', `${Math.round(path.length / FT)} ft`, `${path.length.toFixed(1)} m`)
        : stat('Length', `${path.length.toFixed(1)} m`),
      stat('In the order', String(doc.sequence.length)),
      /* Bend, not radius: "Tightest radius" was cut to "Tightest ra..." beside
       * its own value in a 320 px column. */
      bend == null
        ? stat('Tightest bend', 'straight')
        : inches
          ? stat('Tightest bend', `${(bend / IN).toFixed(1)} in`, `${Math.round(bend * 1000)} mm`)
          : stat('Tightest bend', `${bend.toFixed(2)} m`),
      stat('Lap', path.closed ? 'closes' : 'open'),
    );
    host.append(stats);
    appendTypeStats(host, doc);

    const warnings = this.host.warnings ?? [];
    const bad = warnings.filter((w) => w.level === 'warn');
    host.append(el('h3', null, bad.length ? `Warnings, ${bad.length}` : 'Warnings'));
    if (!warnings.length) {
      host.append(el('p', 'tb-help', 'Nothing to report. The line goes through every element in the right direction, inside the field, clear of the barriers.'));
    }
    const ul = el('ul', 'tb-warn');
    for (const w of warnings) {
      const li = el('li', w.level === 'warn' ? 'warn' : 'info');
      li.append(el('span', null, w.message));
      if (w.elementId || w.seqId) {
        li.classList.add('clickable');
        li.addEventListener('click', () => this.host.focusWarning(w));
      }
      ul.append(li);
    }
    host.append(ul);
    host.append(el('p', 'tb-help', 'Warnings are advisory. Nothing here stops a save or an export.'));

    /* The chart is a long lived canvas rather than a fresh one per render:
     * the panel is rebuilt wholesale on every change and allocating a canvas
     * that often is the one thing here that would show up in a profile. */
    const foot = el('div', 'tb-profile-foot');
    foot.append(el('h3', null, 'Elevation'), this.nodes.profile);
    host.append(foot);
    drawProfile(this.nodes.profile, elevationProfile(path), { imperial: inches });
  }

  /*
   * A MAP'S RESULTS: what is on it, how many solids the physics will hold,
   * and the warnings. No length, no radius and no elevation, because those
   * are properties of a lap and a map has none.
   */
  renderMapResults(host, doc) {
    const report = this.host.report ?? null;
    const stats = el('div', 'tb-stats');
    stats.append(
      stat('Elements', String(doc.elements.length)),
      stat('Solids', report ? String(report.solids) : '0'),
      stat('Named gaps', report ? String(report.zones) : '0'),
    );
    /* Roads and vehicles, once there are any: they are not assets, so the
     * inventory below leaves them out, and a map's traffic is worth a
     * count of its own. */
    const roads = doc.elements.filter((e) => e.type === 'road').length;
    const cars = doc.elements.filter((e) => e.type === 'vehicle').length;
    if (roads || cars) {
      stats.append(stat('Roads', String(roads)), stat('Vehicles', String(cars)));
    }
    host.append(stats);
    appendTypeStats(host, doc, 'On the plot');
    this.appendWarnings(host, 'Nothing to report. Every space between two things is closed or wide enough to fly, the start is clear, and every named gap is open.');
  }

  appendWarnings(host, allClear) {
    const warnings = this.host.warnings ?? [];
    const bad = warnings.filter((w) => w.level === 'warn');
    host.append(el('h3', null, bad.length ? `Warnings, ${bad.length}` : 'Warnings'));
    if (!warnings.length) {
      host.append(el('p', 'tb-help', allClear));
    }
    const ul = el('ul', 'tb-warn');
    for (const w of warnings) {
      const li = el('li', w.level === 'warn' ? 'warn' : 'info');
      li.append(el('span', null, w.message));
      if (w.elementId || w.seqId) {
        li.classList.add('clickable');
        li.addEventListener('click', () => this.host.focusWarning(w));
      }
      ul.append(li);
    }
    host.append(ul);
    host.append(el('p', 'tb-help', 'Warnings are advisory. Nothing here stops a save or an export.'));
  }
}

/* Headed with where the pieces stand, the canvas's way: on the field, in the
 * room, on the plot. */
function appendTypeStats(host, doc, heading = trackClassOf(doc) === 'micro' ? 'In the room' : `On the ${wordsFor(doc).place}`) {
  const rows = countElementsByType(doc.elements, trackClassOf(doc));
  if (!rows.length) {
    return;
  }
  host.append(el('h3', null, heading));
  const stats = el('div', 'tb-stats');
  for (const row of rows) {
    stats.append(stat(row.label, String(row.count)));
  }
  host.append(stats);
}

/* `small` is the same figure in the other unit, in small print under it: a
 * whoop canvas says feet and inches and gives the metres there (MENUS-PLAN.md
 * 4.2a). */
function stat(label, value, small = '') {
  const d = el('div', 'tb-stat');
  const v = el('span', 'tb-stat-value', value);
  if (small) {
    v.append(el('small', 'tb-stat-small', small));
  }
  d.append(el('span', 'tb-stat-label', label), v);
  return d;
}
