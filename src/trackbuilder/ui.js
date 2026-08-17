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

import { ELEMENTS, KIND, PATH_TOGGLE, paletteItems, FLAG_SIDES, flagSideOf, countElementsByType } from './elements.js';
import { aperturesOf, elementById, kindOf, isSequenceable } from './model.js';
import { sequenceLabel, faceLabel, unsequencedElements } from './sequence.js';
import { figuresFor, matchingFigure, figureBlurb, levelName } from './figures.js';
import { elevationProfile } from './path.js';
import { drawProfile } from './profile.js';
import { DEG, RAD } from './geometry.js';

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

const FLAG_SIDE_LABEL = { left: 'Left', right: 'Right', both: 'Both' };

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
  return svg;
}

export class Panels {
  constructor(host, nodes) {
    this.host = host;
    this.nodes = nodes;
    this.buildPalette();
  }

  /* ---------------- palette ---------------- */

  buildPalette() {
    const host = this.nodes.palette;
    host.textContent = '';
    this.paletteButtons = new Map();

    const track = el('div', 'tb-group');
    track.append(el('h3', null, 'Track'));
    const extra = el('div', 'tb-group');
    extra.append(el('h3', null, 'Extra'));

    for (const def of paletteItems()) {
      const b = el('button', 'tb-tool');
      b.type = 'button';
      b.title = def.note;
      b.append(el('span', 'tb-tool-key', def.key), el('span', 'tb-tool-label', def.label));
      b.addEventListener('click', () => this.host.arm(def.id));
      this.paletteButtons.set(def.id, b);
      (def.group === 'track' ? track : extra).append(b);
    }

    const pathBtn = el('button', 'tb-tool');
    pathBtn.type = 'button';
    pathBtn.title = PATH_TOGGLE.note;
    pathBtn.append(el('span', 'tb-tool-key', PATH_TOGGLE.key), el('span', 'tb-tool-label', PATH_TOGGLE.label));
    pathBtn.addEventListener('click', () => this.host.togglePath());
    this.pathButton = pathBtn;
    extra.append(pathBtn);

    host.append(track, extra);
    host.append(el('p', 'tb-help', 'Press a key or click a tool, then click the field. The tool stays armed, so ten gates are ten clicks. Escape or right click puts it away.'));
  }

  renderPalette() {
    for (const [id, b] of this.paletteButtons) {
      b.classList.toggle('on', this.host.armed === id);
    }
    this.pathButton.classList.toggle('on', this.host.pathVisible);
  }

  /* ---------------- render entry point ---------------- */

  renderAll() {
    const focus = this.captureFocus();
    this.renderPalette();
    this.renderInspector();
    this.renderSequence();
    this.renderResults();
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

  field(key, label, value, onCommit, opts = {}) {
    const row = el('label', 'tb-field');
    row.append(el('span', 'tb-field-label', label));
    const input = el('input');
    input.type = opts.text ? 'text' : 'number';
    if (!opts.text) {
      input.step = opts.step ?? 0.1;
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
      }
      e.stopPropagation();
    });
    row.append(input);
    if (opts.suffix) {
      row.append(el('span', 'tb-field-suffix', opts.suffix));
    }
    return row;
  }

  renderInspector() {
    const host = this.nodes.inspector;
    host.textContent = '';
    const doc = this.host.doc;
    const ids = [...this.host.selection];

    host.append(el('h3', null, ids.length === 1 ? 'Element' : (ids.length ? `${ids.length} selected` : 'Field')));

    if (ids.length === 0) {
      this.renderFieldSettings(host, doc);
      return;
    }
    if (ids.length > 1) {
      host.append(el('p', 'tb-help', 'Drag to move them together. Delete removes them. Select one to edit its dimensions.'));
      return;
    }

    const element = elementById(doc, ids[0]);
    if (!element) {
      return;
    }
    const def = ELEMENTS[element.type];
    host.append(el('p', 'tb-kind', `${def.label}. ${def.note}`));

    host.append(this.field(`name-${element.id}`, 'Name', element.name, (val) => {
      this.host.edit('rename', (d) => { elementById(d, element.id).name = val; });
    }, { text: true }));

    if (def.kind === KIND.APERTURE && aperturesOf(element).length > 1) {
      this.renderFigurePicker(host, doc, element);
    }

    const grid = el('div', 'tb-grid3');
    grid.append(
      this.field(`x-${element.id}`, 'X', element.position.x, (val) => {
        this.host.edit('move', (d) => { elementById(d, element.id).position.x = val; });
      }, { suffix: 'm' }),
      this.field(`y-${element.id}`, 'Y', element.position.y, (val) => {
        this.host.edit('move', (d) => { elementById(d, element.id).position.y = val; });
      }, { suffix: 'm' }),
      this.field(`z-${element.id}`, 'Base', element.position.z, (val) => {
        this.host.edit('height', (d) => { elementById(d, element.id).position.z = val; });
      }, { suffix: 'm' }),
    );
    host.append(grid);

    if (def.kind !== KIND.ANNOTATION) {
      host.append(this.field(`yaw-${element.id}`, 'Yaw', element.yaw * DEG, (val) => {
        this.host.edit('rotate', (d) => {
          const e2 = elementById(d, element.id);
          e2.yaw = val * RAD;
          e2.yawOverridden = true;
        });
      }, { suffix: 'deg', step: 5, places: 1 }));
    }

    if (def.kind === KIND.APERTURE) {
      /*
       * PITCH IS SHOWN FOR EVERY APERTURE ELEMENT, not only for the dive
       * gate, because the tilt is a property of the aperture plane and an
       * angled ladder is a legitimate thing to build. It is described in
       * the terms the task uses: zero is a vertical gate, 90 is flown
       * straight down through.
       */
      host.append(this.field(`pitch-${element.id}`, 'Tilt', element.pitch * DEG, (val) => {
        this.host.edit('tilt', (d) => {
          const e2 = elementById(d, element.id);
          e2.pitch = Math.max(-90, Math.min(90, val)) * RAD;
        });
      }, { suffix: 'deg', step: 5, places: 1, min: -90, max: 90 }));
      host.append(el('p', 'tb-help', 'Tilt 0 is a vertical gate. Tilt 90 lays the aperture flat, so it is flown straight down or straight up through. Anything between is an angled dive gate.'));
    }

    /* Dimensions, all of them, named the way elements.js names them. */
    const dims = el('div', 'tb-grid2');
    const LABELS = {
      levels: 'Levels', sillH: 'Sill height', clearW: 'Opening width', clearH: 'Opening height',
      levelPitch: 'Level spacing', width: 'Width', depth: 'Depth', height: 'Height',
      poleRadius: 'Pole radius', baseRadius: 'Base radius', clearance: 'Clearance',
      pads: 'Pads', spacing: 'Pad spacing', padSize: 'Pad size', textHeight: 'Text height',
    };
    for (const key of Object.keys(def.dims)) {
      const isCount = key === 'levels' || key === 'pads';
      dims.append(this.field(`dim-${element.id}-${key}`, LABELS[key] ?? key, element.dims[key], (val) => {
        this.host.edit('resize', (d) => {
          const e2 = elementById(d, element.id);
          e2.dims[key] = isCount ? Math.max(1, Math.round(val)) : Math.max(0, val);
        });
      }, { suffix: isCount ? '' : 'm', step: isCount ? 1 : 0.05 }));
    }
    host.append(dims);

    if (def.flagSide) {
      this.renderFlagSidePicker(host, element);
    }

    if (def.kind === KIND.ANNOTATION) {
      host.append(this.field(`text-${element.id}`, 'Text', element.text ?? '', (val) => {
        this.host.edit('label', (d) => { elementById(d, element.id).text = val; });
      }, { text: true }));
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
        : (entries.length > 1 ? 'In the course, twice or more' : 'In the course')));
      if (!entries.length) {
        host.append(el('p', 'tb-help', 'Not in the flying order.'));
        host.append(button('Add to the course', 'tb-btn', () => this.host.addToSequence(element.id)));
      }
      for (const { s, i } of entries) {
        host.append(this.sequenceCard(doc, element, s, i, named));
      }
      if (def.kind === KIND.APERTURE && aperturesOf(element).length > 1 && !named) {
        host.append(button('Fly another level', 'tb-btn', () => this.host.addLevel(element.id),
          'Add another gate on this stack, on the next unused opening.'));
      }
    }
  }

  renderFigurePicker(host, doc, element) {
    const current = matchingFigure(doc, element);
    const n = aperturesOf(element).length;
    host.append(el('h3', null, 'How it is flown'));
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
    const blurb = current
      ? figureBlurb(element, current)
      : 'This mix is not a named figure. Each hole you listed still counts as its own gate.';
    if (blurb) {
      host.append(el('p', 'tb-fig-blurb', blurb));
    }
  }

  renderFlagSidePicker(host, element) {
    const current = flagSideOf(element);
    host.append(el('h3', null, 'Header flag'));
    host.append(el('p', 'tb-help', 'Pennant on the header, as seen facing the gate.'));
    const grid = el('div', 'tb-side-grid');
    for (const side of FLAG_SIDES) {
      const b = el('button', current === side ? 'tb-fig-card on' : 'tb-fig-card');
      b.type = 'button';
      b.append(flagSideIcon(side));
      b.append(el('strong', null, FLAG_SIDE_LABEL[side]));
      grid.append(b);
      b.addEventListener('click', () => {
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
    const title = namedFigure
      ? `${levelName(element, seq.apertureIndex)}, gate ${index + 1}`
      : sequenceLabel(doc, seq);
    head.append(el('span', 'tb-num', String(index + 1)), el('span', 'tb-card-title', title));
    if (seq.overridden || element.yawOverridden) {
      head.append(el('span', 'tb-badge', 'overridden'));
    }
    card.append(head);

    const levels = aperturesOf(element);
    if (levels.length > 1 && !namedFigure) {
      const row = el('label', 'tb-field');
      row.append(el('span', 'tb-field-label', 'Hole'));
      const sel = el('select');
      sel.dataset.tbkey = `lvl-${seq.id}`;
      levels.forEach((ap, i) => {
        const opt = el('option', null, `${levelName(element, i)}, centre ${show(element.position.z + ap.centerH, 2)} m`);
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
      card.append(el('p', 'tb-help', 'The green square is the space you have to fly through. Flip side moves it to the other side of the pole.'));
      card.append(this.field(`clr-${seq.id}`, 'Clearance', seq.clearance ?? 0, (val) => {
        this.host.edit('clearance', (d) => {
          const s2 = d.sequence.find((x) => x.id === seq.id);
          if (s2) {
            s2.clearance = Math.max(0, val);
          }
        });
      }, { suffix: 'm', step: 0.1 }));
    }

    const row = el('div', 'tb-row-btns');
    row.append(button(kindOf(element) === KIND.MARKER ? 'Flip side' : 'Flip face', 'tb-btn', () => this.host.flipFace(seq.id), 'Shortcut: X'));
    if (seq.overridden || element.yawOverridden) {
      row.append(button('Re-derive', 'tb-btn', () => this.host.clearOverride(seq.id),
        'Hand this back to the automatic rule, which points it along the line from the previous element to the next.'));
    }
    row.append(button('Remove', 'tb-btn tb-danger', () => this.host.removeSequenceEntry(seq.id)));
    card.append(row);
    return card;
  }

  renderFieldSettings(host, doc) {
    host.append(el('p', 'tb-help', 'Nothing selected. Click an element to edit it, or drag a box on empty ground to select several.'));
    host.append(el('h3', null, 'Field'));
    const grid = el('div', 'tb-grid3');
    grid.append(
      this.field('field-w', 'Width', doc.field.width, (val) => {
        this.host.edit('field', (d) => { d.field.width = Math.max(5, val); });
      }, { suffix: 'm', step: 1 }),
      this.field('field-d', 'Depth', doc.field.depth, (val) => {
        this.host.edit('field', (d) => { d.field.depth = Math.max(5, val); });
      }, { suffix: 'm', step: 1 }),
      this.field('field-g', 'Grid', doc.field.gridSize, (val) => {
        this.host.edit('field', (d) => { d.field.gridSize = Math.max(0.1, val); });
      }, { suffix: 'm', step: 0.5 }),
    );
    host.append(grid);

    host.append(el('h3', null, 'Racing line'));
    host.append(this.field('set-tangent', 'Tangent scale', doc.settings.tangentScale, (val) => {
      this.host.edit('settings', (d) => { d.settings.tangentScale = Math.max(0.01, val); });
    }, { step: 0.02, places: 3 }));
    host.append(el('p', 'tb-help', 'How long the spline tangents are, as a fraction of the gap to the next knot. About a third draws a circular arc through a right angle. Higher bulges the line wide, lower squares off the corners.'));
    host.append(this.field('set-radius', 'Warn under radius', doc.settings.minCurveRadius, (val) => {
      this.host.edit('settings', (d) => { d.settings.minCurveRadius = Math.max(0.1, val); });
    }, { suffix: 'm', step: 0.5 }));
    host.append(this.field('set-samples', 'Samples per segment', doc.settings.samplesPerSegment, (val) => {
      this.host.edit('settings', (d) => { d.settings.samplesPerSegment = Math.max(4, Math.round(val)); });
    }, { step: 4, places: 0 }));
  }

  /* ---------------- sequence ---------------- */

  renderSequence() {
    const host = this.nodes.sequence;
    host.textContent = '';
    const doc = this.host.doc;
    host.append(el('h3', null, `Flying order, ${doc.sequence.length}`));

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
      li.append(el('span', 'tb-num', String(i + 1)));
      const body = el('div', 'tb-seq-body');
      body.append(el('span', 'tb-seq-name', sequenceLabel(doc, seq)));
      const face = el('span', 'tb-seq-face', faceLabel(doc, seq));
      if (seq.entry === 0) {
        face.classList.add('bad');
      }
      body.append(face);
      li.append(body);
      if (seq.overridden) {
        li.append(el('span', 'tb-badge', 'set'));
      }
      li.append(button('X', 'tb-mini', (e) => { e.stopPropagation(); this.host.flipFace(seq.id); }, 'Flip the face or the pass side'));
      li.append(button('-', 'tb-mini tb-danger', (e) => { e.stopPropagation(); this.host.removeSequenceEntry(seq.id); }, 'Take it out of the order'));

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
      host.append(el('h3', null, 'Not in the course'));
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

  /* ---------------- results ---------------- */

  renderResults() {
    const host = this.nodes.results;
    host.textContent = '';
    const doc = this.host.doc;
    const path = this.host.path;

    host.append(el('h3', null, 'Results'));
    if (!path) {
      host.append(el('p', 'tb-help', 'Nothing in the flying order yet. Place a gate and it appears here, with the lap figures and any warnings.'));
      appendTypeStats(host, doc);
      const empty = el('div', 'tb-profile-foot');
      empty.append(el('h3', null, 'Elevation'), this.nodes.profile);
      host.append(empty);
      drawProfile(this.nodes.profile, null);
      return;
    }

    const stats = el('div', 'tb-stats');
    stats.append(
      stat('Length', `${path.length.toFixed(1)} m`),
      stat('In the order', String(doc.sequence.length)),
      stat('Tightest radius', path.tightest && Number.isFinite(path.tightest.radius)
        ? `${path.tightest.radius.toFixed(2)} m` : 'straight'),
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
    drawProfile(this.nodes.profile, elevationProfile(path));
  }
}

function appendTypeStats(host, doc) {
  const rows = countElementsByType(doc.elements);
  if (!rows.length) {
    return;
  }
  host.append(el('h3', null, 'On the field'));
  const stats = el('div', 'tb-stats');
  for (const row of rows) {
    stats.append(stat(row.label, String(row.count)));
  }
  host.append(stats);
}

function stat(label, value) {
  const d = el('div', 'tb-stat');
  d.append(el('span', 'tb-stat-label', label), el('span', 'tb-stat-value', value));
  return d;
}
