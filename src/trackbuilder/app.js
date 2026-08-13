/*
 * app.js: the track builder itself. State, keyboard, top bar, and the wiring
 * between the two views and the panels.
 *
 * This module is the ONLY thing in the track builder that holds mutable
 * state, and everything that changes the document goes through edit(), which
 * takes the undo snapshot, runs the mutation, re-derives the faces, clamps
 * the sequence, rebuilds the line if one is showing, refreshes the panels and
 * schedules an autosave. One door in, so no edit can arrive without an undo
 * step or leave a stale racing line behind it.
 *
 * ISOLATION. Nothing here imports from the simulator: not the physics, not
 * the flight controller, not the renderer, not the input path, not the game
 * state. The only thing this tool shares with the game is the track document
 * described in schema.md, and the game does not read it yet.
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

import { ELEMENTS, KIND, elementByKey } from './elements.js';
import {
  createTrack, createElement, deepClone, deserialize, duplicateTrack,
  elementById, kindOf, isSequenceable, normalize, startPadsOf, touch,
} from './model.js';
import { applyAutoFaces, clearOverride, defaultYawFor, flipFace } from './faces.js';
import {
  addToSequence, addNextLevel, clampSequenceToApertures, moveInSequence,
  removeElement, removeFromSequence, setApertureIndex,
} from './sequence.js';
import { buildPath } from './path.js';
import { collectWarnings, sortWarnings } from './warnings.js';
import { History } from './history.js';
import {
  deleteTrack, downloadTrack, listTracks, loadTrack, makeAutosaver,
  readAutosave, readFileText, saveTrack, writeAutosave,
} from './storage.js';
import { View2D } from './view2d.js';
import { View3D } from './view3d.js';
import { Panels } from './ui.js';
import { RAD } from './geometry.js';

export class App {
  constructor(nodes) {
    this.nodes = nodes;
    this.doc = createTrack();
    this.selection = new Set();
    this.armed = null;
    this.mode = '2d';
    this.pathVisible = false;
    this.path = null;
    this.warnings = [];
    this.history = new History();
    this.autosaver = makeAutosaver();
    this.drawQueued = false;

    this.view2d = new View2D(nodes.canvas2d, this);
    this.view3d = new View3D(nodes.canvas3d, this);
    this.panels = new Panels(this, nodes);

    this.restore();
    this.buildTopBar();
    this.bindKeys();
    this.bindResize();

    this.view2d.resize();
    this.view2d.frameField();
    this.view3d.frameField();
    this.refresh();
  }

  /* ---------------- lifecycle ---------------- */

  restore() {
    const saved = readAutosave();
    if (saved && saved.doc) {
      this.doc = saved.doc;
      applyAutoFaces(this.doc);
      if (saved.repairs.length) {
        this.toast(`Recovered the working track. ${saved.repairs.length} thing${saved.repairs.length === 1 ? '' : 's'} needed repairing.`);
      }
      return;
    }
    this.doc = createTrack();
  }

  bindResize() {
    const onResize = () => {
      this.view2d.resize();
      this.view3d.resize();
      this.requestDraw();
      this.panels.renderResults();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('beforeunload', () => this.autosaver.flush());
  }

  /* ---------------- the one door ---------------- */

  /*
   * Run a mutation as one undoable step. `mutate` gets the live document and
   * changes it in place.
   */
  edit(label, mutate) {
    const before = deepClone(this.doc);
    mutate(this.doc);
    this.settle();
    this.history.record(before, this.doc, label);
    this.refresh();
  }

  /* Gesture form of the same thing, for drags: begin, many mutations, end. */
  beginEdit(label) {
    this.history.begin(this.doc, label);
  }

  endEdit() {
    this.settle();
    this.history.commit(this.doc);
    this.refresh();
  }

  cancelEdit() {
    this.history.cancel();
    this.refresh();
  }

  /* Everything that has to be true after any change, in the order it has to
   * be true in: apertures first, because a face cannot be derived for a
   * level that no longer exists. */
  settle() {
    clampSequenceToApertures(this.doc);
    applyAutoFaces(this.doc);
    touch(this.doc);
  }

  refresh() {
    if (this.pathVisible) {
      this.rebuildPath();
    }
    this.panels.renderAll();
    this.updateTopBar();
    this.view3d.markDirty();
    this.requestDraw();
    this.autosaver.schedule(this.doc);
  }

  rebuildPath() {
    this.path = buildPath(this.doc);
    this.warnings = sortWarnings(collectWarnings(this.doc, this.path));
  }

  requestDraw() {
    if (this.drawQueued) {
      return;
    }
    this.drawQueued = true;
    requestAnimationFrame(() => {
      this.drawQueued = false;
      if (this.mode === '2d') {
        this.view2d.draw();
      } else {
        this.view3d.draw();
      }
    });
  }

  /* ---------------- selection ---------------- */

  setSelection(ids, additive = false) {
    if (!additive) {
      this.selection = new Set(ids);
    } else {
      for (const id of ids) {
        this.selection.add(id);
      }
    }
    this.panels.renderAll();
    this.requestDraw();
  }

  toggleSelection(id) {
    if (this.selection.has(id)) {
      this.selection.delete(id);
    } else {
      this.selection.add(id);
    }
    this.panels.renderAll();
    this.requestDraw();
  }

  selectionCentroid() {
    const ids = [...this.selection];
    if (!ids.length) {
      return null;
    }
    let x = 0;
    let y = 0;
    let z = 0;
    let n = 0;
    for (const id of ids) {
      const e = elementById(this.doc, id);
      if (e) {
        x += e.position.x;
        y += e.position.y;
        z += e.position.z;
        n += 1;
      }
    }
    return n ? { x: x / n, y: y / n, z: z / n } : null;
  }

  /* Both views centre on the same thing, which is what makes the 2D and 3D
   * toggle feel like one tool rather than two. */
  focusSelection() {
    const c = this.selectionCentroid();
    if (!c) {
      return;
    }
    this.view2d.centerOn(c);
    this.view3d.focusDoc(c, Math.max(12, this.view3d.orbit.radius * 0.6));
    this.requestDraw();
  }

  focusWarning(w) {
    if (w.elementId) {
      this.setSelection([w.elementId]);
      this.focusSelection();
      return;
    }
    if (w.seqId) {
      const seq = this.doc.sequence.find((s) => s.id === w.seqId);
      if (seq) {
        this.setSelection([seq.elementId]);
        this.focusSelection();
      }
    }
  }

  /* ---------------- placement ---------------- */

  arm(typeId) {
    this.armed = this.armed === typeId ? null : typeId;
    this.panels.renderPalette();
    this.requestDraw();
  }

  disarm() {
    this.armed = null;
    this.panels.renderPalette();
    this.requestDraw();
  }

  snap(world, offGrid) {
    if (offGrid) {
      return { x: world.x, y: world.y, z: 0 };
    }
    const g = this.doc.field.gridSize;
    return { x: Math.round(world.x / g) * g, y: Math.round(world.y / g) * g, z: 0 };
  }

  placeAt(world) {
    const type = this.armed;
    if (!type) {
      return;
    }
    const def = ELEMENTS[type];

    /* Exactly one set of start pads per track. A second press moves the
     * existing set rather than refusing, because refusing would look like a
     * broken hotkey. */
    if (def.kind === KIND.START) {
      const existing = startPadsOf(this.doc);
      if (existing) {
        this.edit('move start pads', (d) => {
          const e = elementById(d, existing.id);
          e.position.x = world.x;
          e.position.y = world.y;
        });
        this.setSelection([existing.id]);
        this.toast('A track has one set of start pads, so this moved the ones you had.');
        return;
      }
    }

    let newId = null;
    this.edit(`place ${def.label}`, (d) => {
      const yaw = def.kind === KIND.ANNOTATION ? 0 : defaultYawFor(d, world);
      const element = createElement(d, type, world, yaw);
      d.elements.push(element);
      newId = element.id;
      if (isSequenceable(element)) {
        addToSequence(d, element.id, 0);
      }
    });
    if (newId) {
      this.setSelection([newId]);
    }
  }

  moveSelected(origin, delta) {
    for (const [id, from] of origin) {
      const element = elementById(this.doc, id);
      if (element) {
        element.position.x = from.x + delta.x;
        element.position.y = from.y + delta.y;
      }
    }
    applyAutoFaces(this.doc);
    if (this.pathVisible) {
      this.rebuildPath();
    }
    this.requestDraw();
    this.panels.renderInspector();
  }

  rotateSelected(yaw) {
    for (const id of this.selection) {
      const element = elementById(this.doc, id);
      if (element) {
        element.yaw = yaw;
        element.yawOverridden = true;
      }
    }
    if (this.pathVisible) {
      this.rebuildPath();
    }
    this.requestDraw();
    this.panels.renderInspector();
  }

  /* The one edit the 3D view is allowed to make. */
  raiseSelected(origin, dz, fine) {
    for (const [id, fromZ] of origin) {
      const element = elementById(this.doc, id);
      if (!element) {
        continue;
      }
      const wanted = Math.max(0, fromZ + dz);
      element.position.z = fine ? wanted : Math.round(wanted * 4) / 4;
    }
    applyAutoFaces(this.doc);
    if (this.pathVisible) {
      this.rebuildPath();
    }
    this.view3d.markDirty();
    this.requestDraw();
    this.panels.renderInspector();
  }

  deleteSelection() {
    if (!this.selection.size) {
      return;
    }
    const ids = [...this.selection];
    this.edit(`delete ${ids.length}`, (d) => {
      for (const id of ids) {
        removeElement(d, id);
      }
    });
    this.selection.clear();
    this.panels.renderAll();
  }

  onHoverWorld(world) {
    if (!this.nodes.readout || !world) {
      return;
    }
    this.nodes.readout.textContent = `${world.x.toFixed(2)}, ${world.y.toFixed(2)} m`;
  }

  /* ---------------- faces and sequence ---------------- */

  flipFace(seqId) {
    this.edit('flip face', (d) => { flipFace(d, seqId); });
  }

  /* The keyboard shortcut works on whatever the selection's first sequence
   * entry is, which is what a user means by "flip that gate". */
  flipSelectedFace() {
    for (const id of this.selection) {
      const seq = this.doc.sequence.find((s) => s.elementId === id);
      if (seq) {
        this.flipFace(seq.id);
        return;
      }
    }
  }

  clearOverride(seqId) {
    this.edit('re-derive face', (d) => { clearOverride(d, seqId); });
  }

  addToSequence(elementId) {
    this.edit('add to the course', (d) => { addToSequence(d, elementId, 0); });
  }

  addLevel(elementId) {
    this.edit('fly another level', (d) => { addNextLevel(d, elementId); });
  }

  removeSequenceEntry(seqId) {
    this.edit('remove from the course', (d) => { removeFromSequence(d, seqId); });
  }

  setSequenceAperture(seqId, index) {
    this.edit('change level', (d) => { setApertureIndex(d, seqId, index); });
  }

  reorder(from, to) {
    this.edit('reorder', (d) => { moveInSequence(d, from, to); });
  }

  /* ---------------- path ---------------- */

  createPath() {
    this.pathVisible = true;
    this.rebuildPath();
    this.panels.renderAll();
    this.updateTopBar();
    this.view3d.markDirty();
    this.requestDraw();
  }

  togglePath() {
    if (!this.pathVisible) {
      this.createPath();
      return;
    }
    this.pathVisible = false;
    this.panels.renderPalette();
    this.view3d.markDirty();
    this.requestDraw();
  }

  /* ---------------- views ---------------- */

  setMode(mode) {
    if (this.mode === mode) {
      return;
    }
    this.mode = mode;
    this.nodes.canvas2d.hidden = mode !== '2d';
    this.nodes.canvas3d.hidden = mode !== '3d';
    /* Three.js arrives on the first press of the 3D button, so this settles
     * later and can fail. The 2D view carries on either way; see the header
     * of view3d.js for why the preview is not allowed to be load bearing. */
    this.view3d.setEnabled(mode === '3d').then((ok) => {
      if (!ok) {
        this.toast(`The 3D preview could not load Three.js: ${this.view3d.loadError}. The 2D view is unaffected.`);
        this.setMode('2d');
      }
    });
    if (mode === '2d') {
      this.view2d.resize();
    }
    /* Selection survives the switch, and so does what the camera is looking
     * at. */
    const c = this.selectionCentroid();
    if (c) {
      this.focusSelection();
    }
    this.updateTopBar();
    this.requestDraw();
  }

  frameAll() {
    if (this.mode === '2d') {
      this.view2d.frameField();
    } else {
      this.view3d.frameField();
    }
    this.requestDraw();
  }

  /* ---------------- documents ---------------- */

  loadDocument(doc, message) {
    this.doc = doc;
    applyAutoFaces(this.doc);
    this.selection.clear();
    this.history.reset();
    this.path = null;
    this.warnings = [];
    this.pathVisible = false;
    writeAutosave(this.doc);
    this.view2d.frameField();
    this.view3d.frameField();
    this.view3d.markDirty();
    this.refresh();
    if (message) {
      this.toast(message);
    }
  }

  newTrack() {
    this.confirm('Start a new track?', 'Anything unsaved in the current one is gone.', () => {
      this.loadDocument(createTrack(), 'New track.');
    });
  }

  save() {
    const ok = saveTrack(this.doc);
    this.toast(ok ? `Saved "${this.doc.name}".` : 'Could not save. Local storage is unavailable, so use Export instead.');
    this.updateTopBar();
  }

  duplicate() {
    const copy = duplicateTrack(this.doc);
    saveTrack(copy);
    this.loadDocument(copy, `Duplicated as "${copy.name}".`);
  }

  removeCurrent() {
    this.confirm(`Delete "${this.doc.name}"?`, 'It is removed from the saved list. This cannot be undone.', () => {
      deleteTrack(this.doc.id);
      this.loadDocument(createTrack(), 'Deleted.');
    });
  }

  openLoad() {
    const tracks = listTracks();
    const body = document.createElement('div');
    if (!tracks.length) {
      const p = document.createElement('p');
      p.className = 'tb-help';
      p.textContent = 'Nothing saved yet. Save the current track, or import a .json file.';
      body.append(p);
    }
    for (const t of tracks) {
      const row = document.createElement('div');
      row.className = 'tb-load-row';
      const name = document.createElement('div');
      name.className = 'tb-load-name';
      name.textContent = t.name;
      const meta = document.createElement('div');
      meta.className = 'tb-load-meta';
      meta.textContent = `${t.elements} elements, ${t.sequence} in the order, changed ${t.modifiedUtc}`;
      name.append(meta);
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'tb-btn';
      open.textContent = 'Open';
      open.addEventListener('click', () => {
        const found = loadTrack(t.id);
        this.closeModal();
        if (found) {
          this.loadDocument(found.doc, `Opened "${found.doc.name}".`);
        }
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'tb-btn tb-danger';
      del.textContent = 'Delete';
      del.addEventListener('click', () => {
        deleteTrack(t.id);
        this.closeModal();
        this.openLoad();
      });
      row.append(name, open, del);
      body.append(row);
    }
    this.modal('Saved tracks', body);
  }

  exportFile() {
    downloadTrack(this.doc);
    this.toast('Exported.');
  }

  async importFile(file) {
    if (!file) {
      return;
    }
    try {
      const text = await readFileText(file);
      const { doc, repairs, error } = deserialize(text);
      if (error) {
        this.toast(`Could not import: ${error}`);
        return;
      }
      this.loadDocument(doc, repairs.length
        ? `Imported "${doc.name}" with ${repairs.length} repair${repairs.length === 1 ? '' : 's'}: ${repairs[0]}`
        : `Imported "${doc.name}".`);
    } catch (e) {
      this.toast(`Could not read the file: ${e.message}`);
    }
  }

  undo() {
    const doc = this.history.undo(this.doc);
    if (!doc) {
      this.toast('Nothing to undo.');
      return;
    }
    this.doc = doc;
    this.pruneSelection();
    this.refresh();
  }

  redo() {
    const doc = this.history.redo(this.doc);
    if (!doc) {
      this.toast('Nothing to redo.');
      return;
    }
    this.doc = doc;
    this.pruneSelection();
    this.refresh();
  }

  pruneSelection() {
    for (const id of [...this.selection]) {
      if (!elementById(this.doc, id)) {
        this.selection.delete(id);
      }
    }
  }

  /* ---------------- chrome ---------------- */

  buildTopBar() {
    const bar = this.nodes.topbar;
    bar.textContent = '';

    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'tb-name';
    name.value = this.doc.name;
    name.dataset.tbkey = 'track-name';
    name.addEventListener('change', () => {
      this.edit('rename track', (d) => { d.name = name.value || 'Untitled track'; });
    });
    this.nameInput = name;

    const group = (...kids) => {
      const g = document.createElement('div');
      g.className = 'tb-bargroup';
      g.append(...kids);
      return g;
    };
    const btn = (label, onClick, title, cls = 'tb-btn') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = label;
      if (title) {
        b.title = title;
      }
      b.addEventListener('click', onClick);
      return b;
    };

    this.undoBtn = btn('Undo', () => this.undo(), 'Control Z');
    this.redoBtn = btn('Redo', () => this.redo(), 'Control Shift Z');
    this.mode2d = btn('2D', () => this.setMode('2d'), 'Top down authoring view');
    this.mode3d = btn('3D', () => this.setMode('3d'), 'Preview. Drag an element to change its height.');
    this.pathBtn = btn('Create Path', () => this.createPath(), 'Derive the racing line and draw it', 'tb-btn tb-primary');

    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.style.display = 'none';
    file.addEventListener('change', () => {
      this.importFile(file.files[0]);
      file.value = '';
    });
    this.fileInput = file;

    const back = document.createElement('a');
    back.className = 'tb-btn tb-quiet';
    back.href = '../../index.html';
    back.textContent = 'Back to the simulator';

    bar.append(
      Object.assign(document.createElement('span'), { className: 'tb-title', textContent: 'Track Builder' }),
      name,
      group(
        btn('New', () => this.newTrack()),
        btn('Save', () => this.save(), 'Control S'),
        btn('Load', () => this.openLoad()),
        btn('Duplicate', () => this.duplicate()),
        btn('Delete', () => this.removeCurrent(), null, 'tb-btn tb-danger'),
      ),
      group(
        btn('Import', () => file.click(), 'Read a .json track file'),
        btn('Export', () => this.exportFile(), 'Write a .json track file'),
      ),
      group(this.undoBtn, this.redoBtn),
      group(this.mode2d, this.mode3d),
      group(btn('Fit', () => this.frameAll(), 'Frame the whole field')),
      this.pathBtn,
      back,
      file,
    );
    this.updateTopBar();
  }

  updateTopBar() {
    if (this.nameInput && document.activeElement !== this.nameInput) {
      this.nameInput.value = this.doc.name;
    }
    this.undoBtn.disabled = !this.history.canUndo();
    this.redoBtn.disabled = !this.history.canRedo();
    this.undoBtn.title = this.history.canUndo() ? `Undo ${this.history.undoLabel()}` : 'Nothing to undo';
    this.redoBtn.title = this.history.canRedo() ? `Redo ${this.history.redoLabel()}` : 'Nothing to redo';
    this.mode2d.classList.toggle('on', this.mode === '2d');
    this.mode3d.classList.toggle('on', this.mode === '3d');
    this.pathBtn.classList.toggle('on', this.pathVisible);
  }

  toast(message) {
    const node = this.nodes.toast;
    node.textContent = message;
    node.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => node.classList.remove('on'), 4200);
  }

  modal(title, body, actions = []) {
    const back = this.nodes.modal;
    back.textContent = '';
    back.hidden = false;
    const box = document.createElement('div');
    box.className = 'tb-modal';
    const h = document.createElement('h2');
    h.textContent = title;
    box.append(h, body);
    const row = document.createElement('div');
    row.className = 'tb-row-btns';
    for (const a of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = a.danger ? 'tb-btn tb-danger' : 'tb-btn';
      b.textContent = a.label;
      b.addEventListener('click', () => {
        this.closeModal();
        a.run();
      });
      row.append(b);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tb-btn';
    close.textContent = actions.length ? 'Cancel' : 'Close';
    close.addEventListener('click', () => this.closeModal());
    row.append(close);
    box.append(row);
    back.append(box);
    back.addEventListener('click', (e) => {
      if (e.target === back) {
        this.closeModal();
      }
    }, { once: true });
  }

  confirm(title, detail, run) {
    const body = document.createElement('p');
    body.className = 'tb-help';
    body.textContent = detail;
    this.modal(title, body, [{ label: 'Yes', run, danger: true }]);
  }

  closeModal() {
    this.nodes.modal.hidden = true;
    this.nodes.modal.textContent = '';
  }

  /* ---------------- keyboard ---------------- */

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.save();
        return;
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        this.setSelection(this.doc.elements.map((el) => el.id));
        return;
      }
      if (mod) {
        return;
      }

      if (e.key === 'Escape') {
        if (!this.nodes.modal.hidden) {
          this.closeModal();
        } else if (this.armed) {
          this.disarm();
        } else {
          this.setSelection([]);
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.deleteSelection();
        return;
      }
      if (e.key === 'x' || e.key === 'X') {
        this.flipSelectedFace();
        return;
      }
      if (e.key === 'v' || e.key === 'V') {
        this.setMode(this.mode === '2d' ? '3d' : '2d');
        return;
      }
      if (e.key === 'q' || e.key === 'Q' || e.key === 'e' || e.key === 'E') {
        this.nudgeYaw((e.key === 'q' || e.key === 'Q') ? 15 : -15);
        return;
      }
      if (e.key === 'Home') {
        this.frameAll();
        return;
      }
      if (e.key === 'p' || e.key === 'P') {
        this.togglePath();
        return;
      }

      const def = elementByKey(e.key);
      if (def) {
        this.arm(def.id);
      }
    });
  }

  nudgeYaw(degrees) {
    if (!this.selection.size) {
      return;
    }
    this.edit('rotate', (d) => {
      for (const id of this.selection) {
        const element = elementById(d, id);
        if (element && kindOf(element) !== KIND.ANNOTATION) {
          element.yaw += degrees * RAD;
          element.yawOverridden = true;
        }
      }
    });
  }
}

/* Read a track handed in through the URL, so a track can be linked to. Used
 * by index.html at boot and kept here so app.js owns every way a document
 * can arrive. */
export function docFromLocation() {
  try {
    const raw = new URLSearchParams(window.location.search).get('track');
    if (!raw) {
      return null;
    }
    return normalize(JSON.parse(decodeURIComponent(raw))).doc;
  } catch (e) {
    return null;
  }
}
