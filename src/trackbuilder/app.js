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
  aperturesOf, toPlain,
} from './model.js';
import { applyAutoFaces, clearOverride, defaultYawFor, flipFace } from './faces.js';
import {
  addToSequence, addNextLevel, clampSequenceToApertures, moveInSequence,
  removeElement, removeFromSequence, setApertureIndex,
} from './sequence.js';
import { applyFigure, defaultFigure, upgradeStackedFigures } from './figures.js';
import { buildPath } from './path.js';
import { collectWarnings, sortWarnings } from './warnings.js';
import { History } from './history.js';
import {
  deleteTrack, downloadTrack, listTracks, loadTrack, makeAutosaver,
  readAutosave, readFileText, saveTrack, writeAutosave,
} from './storage.js';
import { normaliseLogo, drawBannerPreview } from './logo.js';
import { View2D } from './view2d.js';
import { View3D } from './view3d.js';
import { Panels } from './ui.js';
import { RAD } from './geometry.js';
import { boardOrigin, boardPageUrl, publishTrack, setBoardOrigin, adoptShareFromLocation } from '../share/board.js';
import { nameRules, readPilotName, writePilotName } from '../share/pilot.js';
import {
  clearShareImport, readBuilderIntent, readEditKey, readShareImport, takeBuilderIntent,
} from '../share/session.js';
import {
  bindOwnedCanvas,
  flyCanvasWithoutListing,
  forkDocument,
  inspectCourse,
  isEmptyCanvas,
  rememberPublish,
  suggestRemixName,
  syncOwnedName,
  syncOwnedIdentity,
  pushOwnedListing,
} from '../share/listing.js';

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
    /* Start new map is chosen in the simulator before this page loads, so
     * the autosave must not come back as the canvas they asked to leave. */
    const intent = readBuilderIntent();
    if (intent && intent.kind === 'new') {
      this.doc = createTrack();
      return;
    }
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

  async adoptIncomingShare() {
    try {
      const intent = takeBuilderIntent();
      if (intent && intent.kind === 'new') {
        clearShareImport();
        this.loadDocument(createTrack(), 'New map.');
        return;
      }
      let share = readShareImport();
      const params = new URLSearchParams(window.location.search);
      if (params.get('share')) {
        try {
          share = await adoptShareFromLocation();
        } catch (e) {
          this.toast(`Could not open that published course. ${e.message || e}`);
          return;
        }
      }
      if (!share || !share.document) {
        share = readShareImport() || share;
      }
      if (!share || !share.document) {
        return;
      }
      const owned = Boolean(readEditKey(share.id));
      const fromBoard = Boolean(params.get('share'));
      const wantRemix = (intent && intent.kind === 'remix') || (!owned && fromBoard);
      const wantEdit = owned && (fromBoard || (intent && intent.kind === 'edit'));
      if (!wantRemix && !wantEdit) {
        return;
      }
      const incoming = normalize(share.document).doc;
      if (wantEdit) {
        const load = () => {
          this.loadDocument(incoming, `Editing "${incoming.name}" on the board.`);
        };
        if (!isEmptyCanvas(this.doc) && this.doc.id !== incoming.id) {
          this.confirm(
            'Replace the course on the canvas?',
            'Your current canvas will be replaced with this published course. Save it first if you still need it.',
            load,
          );
        } else {
          load();
        }
        return;
      }
      const copy = forkDocument(incoming, {
        sourceId: share.id,
        sourceName: share.name || incoming.name,
        sourceAuthor: share.author || '',
        board: share.board || boardOrigin(),
      });
      const load = () => {
        clearShareImport();
        this.loadDocument(copy, `This is your copy of "${share.name || incoming.name}". Publish it under a new name to put it on the board.`);
      };
      if (!isEmptyCanvas(this.doc) && this.doc.id !== share.id) {
        this.confirm(
          `Open a copy of "${share.name || incoming.name}"?`,
          'The course on your canvas will be replaced. Save it first if you still need it.',
          load,
        );
      } else {
        load();
      }
    } finally {
      this.syncBoardIdentity();
    }
  }

  syncBoardIdentity() {
    syncOwnedIdentity().catch(() => {
      /* The board can stay a step behind until they save the name again. */
    });
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
        const fig = defaultFigure(element);
        if (fig !== 'single') {
          applyFigure(d, element.id, fig);
        }
      }
    });
    if (newId) {
      this.setSelection([newId]);
      const placed = elementById(this.doc, newId);
      if (placed && aperturesOf(placed).length > 1) {
        if (!this.pathVisible) {
          this.togglePath();
        }
        this.toast('Each hole is its own gate. This stack is a spiral up: bottom, wrap around, then the top. Change it under How it is flown.');
      }
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

  applyFigure(elementId, figureId) {
    this.edit(`fly ${figureId}`, (d) => { applyFigure(d, elementId, figureId); });
    if (figureId !== 'single' && !this.pathVisible) {
      this.togglePath();
    }
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
    upgradeStackedFigures(this.doc);
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

  /*
   * Put this course on the public board. The document goes as it is, logo
   * included, so every gate and every flag on the board copy wears the
   * same print the author sees here.
   *
   * Three shapes of this dialog, because they are three different promises:
   * a first publish, an update of a listing this browser owns, and a copy
   * of someone else's course under a new name.
   */
  listingOfCanvas() {
    return inspectCourse({
      share: null,
      autosave: { doc: this.doc },
    });
  }

  openPublish() {
    if (this.nameInput && this.nameInput.value) {
      this.doc.name = this.nameInput.value.trim() || 'Untitled track';
    }
    if (!this.doc.sequence.length) {
      this.toast('A published course needs at least one gate in the flying order.');
      return;
    }
    this.autosaver.flush();
    const listing = this.listingOfCanvas();
    const remix = listing.kind === 'remix';
    const owned = listing.kind === 'owned';
    const body = document.createElement('div');
    const help = document.createElement('p');
    help.className = 'tb-help';
    if (remix) {
      const of = listing.sourceName ? ` of ${listing.sourceName}` : '';
      const by = listing.sourceAuthor ? ` by ${listing.sourceAuthor}` : '';
      help.textContent = `This is your copy${of}${by}. It goes on the board as a new course under the name below. The original stays.`;
    } else if (owned && listing.layoutDrift) {
      help.textContent = 'The layout changed. Updating the board will clear posted times. A rename alone would have kept them.';
    } else if (owned) {
      help.textContent = 'This course is already on the board. Updating it keeps the times if the flying layout has not changed.';
    } else {
      help.textContent = 'The public board keeps a copy of this course, including the logo on the gates and flags. Times people post are stored there.';
    }
    body.append(help);

    const courseField = document.createElement('div');
    courseField.className = 'tb-field';
    const courseLabel = document.createElement('label');
    courseLabel.className = 'tb-field-label';
    courseLabel.textContent = 'Course name';
    const courseInput = document.createElement('input');
    courseInput.type = 'text';
    courseInput.maxLength = 80;
    courseInput.value = remix ? suggestRemixName(this.doc.name) : this.doc.name;
    courseInput.style.width = '220px';
    courseField.append(courseLabel, courseInput);
    body.append(courseField);

    const nameField = document.createElement('div');
    nameField.className = 'tb-field';
    const nameLabel = document.createElement('label');
    nameLabel.className = 'tb-field-label';
    nameLabel.textContent = 'Your name';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 24;
    nameInput.value = readPilotName() || '';
    nameInput.style.width = '180px';
    nameField.append(nameLabel, nameInput);
    body.append(nameField);
    const nameHelp = document.createElement('p');
    nameHelp.className = 'tb-help';
    nameHelp.textContent = nameRules();
    body.append(nameHelp);

    const boardField = document.createElement('div');
    boardField.className = 'tb-field';
    const boardLabel = document.createElement('label');
    boardLabel.className = 'tb-field-label';
    boardLabel.textContent = 'Board address';
    const boardInput = document.createElement('input');
    boardInput.type = 'url';
    boardInput.value = boardOrigin();
    boardInput.style.width = '220px';
    boardField.append(boardLabel, boardInput);
    body.append(boardField);

    const status = document.createElement('p');
    status.className = 'tb-help';
    body.append(status);

    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'tb-btn tb-primary';
    send.textContent = owned ? 'Update the board' : (remix ? 'Publish as yours' : 'Publish this course');
    send.addEventListener('click', async () => {
      const author = writePilotName(nameInput.value);
      if (!author) {
        status.textContent = nameRules();
        return;
      }
      const courseName = String(courseInput.value || '').trim() || 'Untitled track';
      this.doc.name = courseName;
      if (this.nameInput) {
        this.nameInput.value = courseName;
      }
      const origin = setBoardOrigin(boardInput.value) || boardOrigin();
      send.disabled = true;
      status.textContent = 'Sending the course, logo included.';
      const sendDoc = async (doc) => {
        const posted = await publishTrack({
          author,
          document: toPlain(doc),
          editKey: readEditKey(doc.id),
          origin,
        });
        rememberPublish(toPlain(doc), posted, origin, author);
        writeAutosave(doc);
        return posted;
      };
      try {
        let posted;
        try {
          posted = await sendDoc(this.doc);
        } catch (e) {
          if (!e || !e.conflict) {
            throw e;
          }
          const copy = forkDocument(this.doc, {
            name: courseName,
            board: origin,
            sourceId: this.doc.id,
            sourceName: this.doc.name,
            sourceAuthor: '',
          });
          this.loadDocument(copy, '');
          posted = await sendDoc(this.doc);
          status.textContent = `This id was already on the board, so it went up as a new course, "${posted.name}".`;
        }
        const cleared = posted.timesCleared
          ? ' The flying layout changed, so the old times were cleared.'
          : '';
        if (!status.textContent.startsWith('This id')) {
          status.textContent = `Published as "${posted.name}".${cleared}`;
        }
        this.toast(`Published "${posted.name}" to the board.`);
        this.updateTopBar();
        const open = document.createElement('a');
        open.className = 'tb-btn tb-primary';
        open.href = boardPageUrl(origin);
        open.target = '_blank';
        open.rel = 'noopener';
        open.textContent = 'Open the board';
        send.replaceWith(open);
      } catch (e) {
        send.disabled = false;
        status.textContent = e.message || 'The board could not take that course.';
        this.toast(`Could not publish: ${e.message || e}`);
      }
    });
    body.append(send);
    this.modal(owned ? 'Update this course' : (remix ? 'Publish as yours' : 'Publish this course'), body);
  }

  /* ---------------- the event logo ---------------- */

  /*
   * The picture every gate on this course wears.
   *
   * A dialog rather than a field in the inspector, and the reason is what it
   * belongs to: a logo is a property of the TRACK, not of any element on it,
   * so putting it beside a gate's dimensions would say the opposite. The
   * inspector's Field section is the other candidate and it is where a field
   * width lives, but that panel is only reachable with nothing selected,
   * which is not where somebody who has just placed ten gates is.
   *
   * The preview is the point of the dialog. Uploading an image and then
   * having to load a world to find out it came out square, or too small to
   * read, or half off the board, is the version of this feature nobody
   * would use twice.
   */
  openLogo() {
    const body = document.createElement('div');
    const help = document.createElement('p');
    help.className = 'tb-help';
    help.textContent = 'Every gate on this course is a white board. The picture sits on the header, beside the gate number, on both faces, and it travels inside the track file so a course you send somebody arrives with its branding on.';
    body.append(help);

    const preview = document.createElement('canvas');
    preview.className = 'tb-logo-preview';
    body.append(preview);

    const caption = document.createElement('p');
    caption.className = 'tb-help';
    body.append(caption);

    /* One image element, reused, so redrawing the preview after a change
     * does not start a second decode of the same data URL. */
    const img = new Image();
    const redraw = () => {
      const url = this.doc.branding?.logo ?? null;
      caption.textContent = url
        ? `${this.doc.branding.logoName || 'Logo'}, ${Math.round(url.length / 1024)} kB, stored in the track.`
        : 'No logo yet. The gates carry their number and nothing else.';
      if (!url) {
        drawBannerPreview(preview, null, null);
        return;
      }
      if (img.src !== url) {
        img.onload = () => drawBannerPreview(preview, url, img);
        img.src = url;
      }
      drawBannerPreview(preview, url, img);
    };

    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
    file.style.display = 'none';
    file.addEventListener('change', async () => {
      const chosen = file.files[0];
      file.value = '';
      if (!chosen) {
        return;
      }
      try {
        const logo = await normaliseLogo(chosen);
        this.edit('set logo', (d) => {
          d.branding.logo = logo.dataUrl;
          d.branding.logoName = logo.name;
        });
        redraw();
        this.toast(`Logo set from ${logo.name}, fitted to ${logo.width} by ${logo.height}.`);
      } catch (e) {
        caption.textContent = `Could not use that image: ${e.message}`;
        this.toast(`Could not use that image: ${e.message}`);
      }
    });
    body.append(file);

    const row = document.createElement('div');
    row.className = 'tb-row-btns';
    const choose = document.createElement('button');
    choose.type = 'button';
    choose.className = 'tb-btn';
    choose.textContent = 'Choose an image';
    choose.addEventListener('click', () => file.click());
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'tb-btn tb-danger';
    clear.textContent = 'Remove';
    clear.addEventListener('click', () => {
      this.edit('clear logo', (d) => {
        d.branding.logo = null;
        d.branding.logoName = '';
      });
      img.removeAttribute('src');
      redraw();
      this.toast('Logo removed.');
    });
    row.append(choose, clear);
    body.append(row);

    this.modal('Gate logo', body);
    redraw();
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
      this.syncNameIfOwned();
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
    /* Plain, not primary. There is one green button on this bar and it is
     * the one that leaves for the air; a second would make neither read as
     * the thing to press. Create Path goes amber while a line is showing,
     * which is the state that matters. */
    this.pathBtn = btn('Create Path', () => this.createPath(), 'Derive the racing line and draw it');

    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.style.display = 'none';
    file.addEventListener('change', () => {
      this.importFile(file.files[0]);
      file.value = '';
    });
    this.fileInput = file;

    /*
     * The whole point of the tool, in one button. It flushes the autosave
     * first and then links to the game with the map named in the URL, so the
     * course on this canvas is the course in the air a moment later. The
     * autosave is what the game reads, not a saved track, because asking
     * somebody to remember to press Save before they fly is asking them to
     * fly the wrong track once.
     */
    this.flyBtn = btn('Fly this track', () => this.flyThisTrack(), 'Build the world around this course and fly it', 'tb-btn tb-primary');
    this.publishBtn = btn('Publish', () => this.openPublish(), 'Put this course on the public board, logo and all');
    this.listingChip = document.createElement('span');
    this.listingChip.className = 'tb-listing';

    const back = document.createElement('a');
    back.className = 'tb-btn tb-quiet';
    back.href = '../../index.html';
    back.textContent = 'Back to the simulator';

    bar.append(
      Object.assign(document.createElement('span'), { className: 'tb-title', textContent: 'Track Builder' }),
      name,
      this.listingChip,
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
      group(btn('Logo', () => this.openLogo(), 'Put a picture on every gate on this course')),
      group(this.undoBtn, this.redoBtn),
      group(this.mode2d, this.mode3d),
      group(btn('Fit', () => this.frameAll(), 'Frame the whole field')),
      this.pathBtn,
      this.publishBtn,
      this.flyBtn,
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
    if (this.listingChip && this.publishBtn) {
      const listing = this.listingOfCanvas();
      this.listingChip.className = 'tb-listing';
      if (listing.kind === 'owned') {
        this.listingChip.classList.add('owned');
        this.listingChip.textContent = listing.layoutDrift
          ? 'Layout not on the board'
          : listing.nameDrift
            ? 'Rename waiting'
            : 'On the board';
        this.publishBtn.textContent = listing.canUpdateListing ? 'Update board' : 'On the board';
        this.publishBtn.title = listing.layoutDrift
          ? 'The layout changed. Updating the board will clear posted times.'
          : 'This course is on the public board. A rename updates the listing.';
      } else if (listing.kind === 'remix') {
        this.listingChip.classList.add('remix');
        const of = listing.sourceName ? ` of ${listing.sourceName}` : '';
        this.listingChip.textContent = `Copy${of}`;
        this.publishBtn.textContent = 'Publish as yours';
        this.publishBtn.title = 'Put this copy on the board under a new name. The original stays.';
      } else {
        this.listingChip.textContent = listing.canPublishNew ? 'Not on the board' : 'Not on the board';
        this.publishBtn.textContent = 'Publish';
        this.publishBtn.title = 'Put this course on the public board, logo and all';
      }
    }
  }

  async syncNameIfOwned() {
    this.autosaver.flush();
    if (!readEditKey(this.doc.id)) {
      this.updateTopBar();
      return;
    }
    try {
      const result = await syncOwnedName(toPlain(this.doc));
      if (result && result.ok) {
        this.toast(`Name updated on the board: "${this.doc.name}".`);
      } else if (result && result.skipped === 'layout-changed') {
        this.toast('The layout changed too. Update the board to send the new name.');
      }
    } catch (e) {
      this.toast(`Could not update the name on the board. ${e.message || e}`);
    }
    this.updateTopBar();
  }

  async flyThisTrack() {
    this.autosaver.flush();
    if (this.nameInput && this.nameInput.value && this.nameInput.value !== this.doc.name) {
      this.doc.name = this.nameInput.value;
    }
    if (readEditKey(this.doc.id)) {
      try {
        await pushOwnedListing(toPlain(this.doc));
      } catch (e) {
        /* Still fly. The board name can catch up. */
      }
      bindOwnedCanvas(this.doc);
    } else {
      flyCanvasWithoutListing();
    }
    window.location.href = '../../index.html?map=custom';
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
