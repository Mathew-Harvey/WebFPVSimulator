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

import { ELEMENTS, KIND, PATH_TOGGLE, paletteItems } from './elements.js';
import { aperturesOf, elementById, kindOf, isSequenceable } from './model.js';
import { sequenceLabel, faceLabel, unsequencedElements } from './sequence.js';
import { elevationProfile, sequencedElementCount } from './path.js';
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
  return s.replace(/\.?0+$/, '') || '0';
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
      host.append(el('h3', null, entries.length > 1 ? 'In the course, twice or more' : 'In the course'));
      if (!entries.length) {
        host.append(el('p', 'tb-help', 'Not in the flying order.'));
        host.append(button('Add to the course', 'tb-btn', () => this.host.addToSequence(element.id)));
      }
      for (const { s, i } of entries) {
        host.append(this.sequenceCard(doc, element, s, i));
      }
      if (def.kind === KIND.APERTURE && aperturesOf(element).length > 1) {
        host.append(button('Fly another level', 'tb-btn', () => this.host.addLevel(element.id),
          'Add a second sequence entry on this structure, on the next unused opening.'));
      }
    }
  }

  sequenceCard(doc, element, seq, index) {
    const card = el('div', 'tb-card');
    const head = el('div', 'tb-card-head');
    head.append(el('span', 'tb-num', String(index + 1)), el('span', 'tb-card-title', sequenceLabel(doc, seq)));
    if (seq.overridden || element.yawOverridden) {
      head.append(el('span', 'tb-badge', 'overridden'));
    }
    card.append(head);

    const levels = aperturesOf(element);
    if (levels.length > 1) {
      const row = el('label', 'tb-field');
      row.append(el('span', 'tb-field-label', 'Level'));
      const sel = el('select');
      sel.dataset.tbkey = `lvl-${seq.id}`;
      levels.forEach((ap, i) => {
        const opt = el('option', null, `${i + 1}, centre ${show(element.position.z + ap.centerH, 2)} m`);
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
      host.append(el('p', 'tb-help', 'Empty. Placing a gate, a ladder, a tower, a dive gate, a flag or a cone adds it to the order automatically.'));
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
      host.append(el('p', 'tb-help', 'Press Create Path to derive the racing line through the course.'));
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
      stat('Elements', String(sequencedElementCount(doc))),
      stat('Tightest radius', path.tightest && Number.isFinite(path.tightest.radius)
        ? `${path.tightest.radius.toFixed(2)} m` : 'straight'),
      stat('Lap', path.closed ? 'closes' : 'open'),
    );
    host.append(stats);

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

function stat(label, value) {
  const d = el('div', 'tb-stat');
  d.append(el('span', 'tb-stat-label', label), el('span', 'tb-stat-value', value));
  return d;
}
