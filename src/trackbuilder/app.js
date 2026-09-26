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

import { ELEMENTS, KIND, elementByKey, trackClassOf, docModeOf } from './elements.js';
import {
  createTrack, createElement, deepClone, deserialize, duplicateTrack,
  elementById, kindOf, isSequenceable, normalize, startPadsOf, touch,
  aperturesOf, toPlain, logosOf, brandingBytes, newLogoId, dressOrder, setSideBuilt,
  LOGO_SLOTS, BRANDING_MAX_CHARS,
} from './model.js';
import { applyAutoFaces, clearOverride, defaultYawFor, flipFace, setYaw } from './faces.js';
import {
  addToSequence, addNextLevel, bendLineAt, clampSequenceToApertures, moveInSequence,
  neighboursOf, pinFacesAt, removeElement, removeFromSequence, setApertureIndex,
} from './sequence.js';
import { applyFigure, defaultFigure, upgradeStackedFigures } from './figures.js';
import { buildPath, passYawOf } from './path.js';
import { collectWarnings, freestyleReport, sortWarnings } from './warnings.js';
import { History } from './history.js';
/* The road tool: every rule about nodes and where a car goes is in here,
 * pure, and this file only applies them as edits. */
import {
  addDraftNode, closesDraft, deleteNode, endsDraft, insertNode, moveNode, roadFromDraft, snapToRoad,
  vehiclePlace, absNodes, OPEN_MIN, LOOP_MIN,
} from './roadtool.js';
import {
  animationFilename, deleteTrack, downloadBlob, downloadTrack, keepDisplaced, listTracks,
  loadTrack, makeAutosaver, readAutosave, readFileText, saveTrack, shipMaps, trackExists, writeAutosave,
} from './storage.js';
/* The yard Your map flies while the map seat is empty, listed in Load as
 * the maps' one shipped row. A plain document with no imports of its own,
 * so the builder takes nothing of the simulator's world with it. Handed to
 * storage.js from here, because storage.js is on the simulator's boot
 * graph and this is not (see shipMaps). */
import { starterMap } from '../maps/built/starter.js';
import { normaliseLogo, drawBannerPreview, drawGroundPreview } from './logo.js';
import {
  View2D, boardPlanOf, snapYaw, turnsOf, offCompass, QUARTER_TURN,
} from './view2d.js';
import { View3D } from './view3d.js';
import { Panels } from './ui.js';
import { RAD, wrapAngle } from './geometry.js';
import {
  boardOrigin, boardPageUrl, fetchMapDocument, publishMap, publishTrack, setBoardOrigin,
  adoptShareFromLocation, TRACK_TAGS, TRACK_TAGS_MAX, tagLabel, usableTags,
} from '../share/board.js';
import { sendCardAnimation } from '../share/cardgif.js';
import { sendShareCard } from '../share/card.js';
import { BOARD_WINDOW, SIM_WINDOW, claimWindowName } from '../share/windows.js';
import { patreonAnchor } from '../share/patreon.js';
import { nameRules, readPilotName, writePilotName } from '../share/pilot.js';
import {
  clearShareImport, readBuilderIntent, readEditKey, readMapListing, readShareImport,
  setActiveTrackClass, takeBuilderIntent, writeMapListing,
} from '../share/session.js';
import {
  bindOwnedCanvas,
  courseChip,
  flyCanvasWithoutListing,
  forkDocument,
  inspectCourse,
  isEmptyCanvas,
  layoutFingerprint,
  publishedTags,
  rememberPublish,
  suggestRemixName,
  syncOwnedName,
  syncOwnedIdentity,
  pushOwnedListing,
  tagsToSend,
} from '../share/listing.js';

shipMaps([starterMap()]);

/*
 * WHICH KIND OF TRACK A NEW ONE IS.
 *
 * A track class is a property of the track, so it has to be decided when a
 * NEW one is made, and the honest source for that decision is which aircraft
 * the pilot has seated: a 65 mm whoop flies a RaceGOW room and a 5 inch
 * flies a sixty metre field.
 *
 * Three sources, in order:
 *
 *   ?class=micro   an explicit answer in the URL. None of the simulator's
 *                  own links carry one; this is for a hand typed address.
 *   the settings   the shell's own blob, read as a STRING KEY rather than by
 *                  importing anything from it. The builder does not import a
 *                  line of the simulator (see schema.md) and this keeps that
 *                  true: the coupling is one localStorage key and one field
 *                  name, both named here, and a change to either shows up as
 *                  the builder defaulting to a field, which is the safe way
 *                  round.
 *   'full'         nobody said, so it is the track this tool has always made.
 *
 * Note what is NOT here: an existing document's own class always wins, and
 * this function is never consulted for one. Opening a RaceGOW track on a 5
 * inch shows you a RaceGOW track.
 */
const SHELL_SETTINGS_KEY = 'webfpv.settings.v3';
const WHOOP_AIRFRAME_ID = 'whoop65';

export function newTrackClass() {
  try {
    const wanted = new URLSearchParams(window.location.search).get('class');
    if (wanted === 'micro' || wanted === 'full') {
      return wanted;
    }
  } catch (e) {
    /* No URL to read. Fall through. */
  }
  try {
    const raw = localStorage.getItem(SHELL_SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.airframe === WHOOP_AIRFRAME_ID) {
        return 'micro';
      }
    }
  } catch (e) {
    /* Private mode, or a blob that is not JSON. Fall through. */
  }
  return 'full';
}

/*
 * THREE CANVASES: a five inch track, a whoop room, and a freestyle map.
 *
 * Each is its own autosave seat (see autosaveKey in storage.js), so moving
 * between them never destroys work. The two race canvases follow the seated
 * aircraft, as they always have. A map is flown on the five inch only, and
 * which canvas the author was last on is remembered here, in the builder's
 * own key, so reopening the builder brings the map back rather than
 * dropping the author on a race field they had left.
 */
export const CANVAS_KEY = 'webfpv.trackbuilder.canvas.v1';

export function canvasOf(doc) {
  return docModeOf(doc) === 'freestyle' ? 'freestyle' : trackClassOf(doc);
}

function readCanvas() {
  try {
    const v = localStorage.getItem(CANVAS_KEY);
    return v === 'freestyle' || v === 'micro' || v === 'full' ? v : null;
  } catch (e) {
    return null;
  }
}

function rememberCanvas(canvas) {
  try {
    localStorage.setItem(CANVAS_KEY, canvas);
  } catch (e) {
    /* Private mode. The builder opens on the seated aircraft's canvas. */
  }
}

/* What each canvas is called where the builder names one to the author. */
const CANVAS_NAMES = { full: 'five inch', micro: 'whoop', freestyle: 'freestyle' };

/*
 * THE CHOOSER'S THREE CARDS, which are the simulator's gate cards with the
 * builder's words on them.
 *
 * The owner asked on 2026-09-25 for the switch between five inch, whoop and
 * freestyle to be "way more prominent", as an overlay showing the gate's
 * three boxes with their pictures, a click on one doing what the switch
 * does, and the switch in the bar kept so an author can change back. So
 * these carry the gate's own names and its own pictures, the files
 * scripts/gatecards.js writes for the title, and a pilot who pressed Five
 * inch racing on the gate knows this card on sight. The sentences are about
 * building rather than flying, because this is the page where the question
 * is what to make.
 *
 * The pictures are the only thing taken from the simulator's side, and they
 * are files, not modules: the builder still imports none of the shell.
 */
const CHOICES = [
  {
    canvas: 'full',
    label: 'Five inch racing',
    art: '../../assets/gate/race.jpg',
    blurb: 'A race track on a sixty metre field. MultiGP gates, flags and dive gates on a grid in metres, flown on the five inch and published to the board.',
    facts: ['5 ft gates', '60 m field', 'The board'],
  },
  {
    canvas: 'micro',
    label: 'Whoop racing',
    art: '../../assets/gate/whoop.jpg',
    blurb: 'A room for the 65 mm whoop. RaceGOW’s 28 inch gates in a ten by twelve metre hall, a grid in inches, and RaceGOW’s own rules checking the layout.',
    facts: ['28 in gates', 'Indoors', 'RaceGOW'],
  },
  {
    canvas: 'freestyle',
    label: 'Freestyle',
    art: '../../assets/gate/freestyle.jpg',
    blurb: 'A map of your own on a 160 metre plot. Buildings, cranes, a skate set and named gaps wherever you put them, flown on the five inch with no gates and no clock.',
    facts: ['No gates', '160 m plot', 'Five inch'],
  },
];

/*
 * WHETHER THIS VISIT IS ASKED WHICH CANVAS, which is the same rule the
 * simulator's gate keeps: ask on arrival, unless the way in already said.
 *
 * Every link the simulator has into the builder says: ?mode= from the Track
 * room and the Freestyle room, an intent from Edit a copy and Edit this
 * track, ?share= from the board, ?track= from a pasted link. Those are not
 * asked, because a chooser in front of a decision made on the page before
 * is a keypress somebody has to spend for nothing. ?class= is a hand typed
 * answer and counts as one.
 *
 * What is left is a visit that names nothing: the gate's Map builder card,
 * a bookmark, the canonical address. Those are asked.
 *
 * And only a fresh visit. A reload is the same visit again, usually in the
 * middle of the work, and the address has already lost its ?mode by then
 * (see dropUrlMode), so without this every reload would ask what the author
 * is building while they are building it. Back and forward are the same.
 */
function asksCanvas(intent) {
  if (urlMode() || isRaceVisit(intent)) {
    return false;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('track') || params.has('class')) {
      return false;
    }
  } catch (e) {
    return false;
  }
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    return !nav || nav.type === 'navigate';
  } catch (e) {
    /* No navigation timing. Ask: a question too many is recoverable with
     * one press and a question too few is the thing being fixed. */
    return true;
  }
}

/*
 * WHETHER THIS VISIT OPENS THE MAP. Three answers, in order:
 *
 *   ?mode=         the address says outright. The simulator's own links
 *                  carry ?mode=freestyle from the map side and ?mode=race
 *                  from the race side, because the remembered canvas is
 *                  where the author last was, not what the link they
 *                  pressed was about: Open in the track builder on a race
 *                  track has to show that track, not yesterday's map.
 *   a race visit   Edit a copy or Edit this track from the simulator, or a
 *                  board link. Each brings a race track that is compared
 *                  with, and lands in, the race seat, so opening the map
 *                  first had adoptIncomingShare testing the map for
 *                  emptiness and then writing the race seat without asking.
 *   the remembered canvas, unless the pilot has since seated the whoop: a
 *                  map is not flown on a whoop, and reopening the map would
 *                  reseat the five inch behind their back.
 *
 * Not a race visit: the share seat on its own, which holds the last board
 * track flown for nearly every returning pilot and is adopted only with an
 * intent, and ?track=, which can carry a map and is loaded after this by
 * loadDocument, which follows the document's own canvas.
 */
function urlMode() {
  try {
    const v = new URLSearchParams(window.location.search).get('mode');
    return v === 'freestyle' || v === 'race' ? v : null;
  } catch (e) {
    return null;
  }
}

function isRaceVisit(intent) {
  if (intent && (intent.kind === 'remix' || intent.kind === 'edit')) {
    return true;
  }
  try {
    return Boolean(new URLSearchParams(window.location.search).get('share'));
  } catch (e) {
    return false;
  }
}

function opensMap(intent) {
  const asked = urlMode();
  if (asked) {
    return asked === 'freestyle';
  }
  if (isRaceVisit(intent)) {
    return false;
  }
  return readCanvas() === 'freestyle' && newTrackClass() !== 'micro';
}

/*
 * ?mode= comes out of the address once it has been read. It says which
 * canvas to open on arrival and nothing after that: left in the bar, a
 * reload after moving to the whoop went back to the map and reseated the
 * five inch over the whoop. Every other parameter stays, the way
 * src/share/stats.js takes out only the utm_ ones.
 */
function dropUrlMode() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('mode')) {
      return;
    }
    url.searchParams.delete('mode');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  } catch (e) {
    /* A sandboxed frame. The parameter stays in the bar, and a reload opens
     * the canvas it names. */
  }
}

function newMap() {
  return createTrack(undefined, 'full', 'freestyle');
}

/*
 * Whether a local version of a board track holds work the board's does
 * not: the flying layout the Publish button compares (layoutFingerprint),
 * the name, or the logos, which the fingerprint leaves out. Not the whole
 * document: the board's copy has been through the board's own handling
 * (credit, field defaults), so an unedited seat would not compare equal
 * to it and every open of your own board link would ask.
 */
function localDrift(seated, incoming) {
  const logos = (d) => {
    const p = toPlain(d);
    return JSON.stringify([p.branding, p.elements.filter((e) => e.type === 'groundLogo')]);
  };
  return layoutFingerprint(seated) !== layoutFingerprint(incoming) || seated.name !== incoming.name
    || logos(seated) !== logos(incoming);
}

/*
 * A MAP GOES ON THE BOARD NOW. Publish did nothing on a map while the
 * board knew only race tracks (FREESTYLE-MAPS-PLAN.md, section 13, which
 * left it out of that plan). The owner asked for published maps on the
 * board on 2026-09-25, so a map is published by openPublishMap below, to
 * the board's own /api/maps, with the drawing its card is made from.
 */
const PUBLISH_MAP_TITLE = 'Put this map on the public board, sponsor prints and all';

/* What a picked side is called in a toast. Left and right are left out on
 * purpose: which is which depends on where the author is standing, and the
 * pipe they just clicked is lit, so "that upright" is the clearer name. */
const SIDE_WORDS = {
  top: 'The top bar',
  bottom: 'The bottom bar',
  left: 'That upright',
  right: 'That upright',
};

export class App {
  constructor(nodes) {
    /* The builder is the simulator's tab, not a tab of its own: the shell
     * navigates here in place and Back to the simulator navigates back.
     * Claiming the same name keeps the board's Fly this track landing on
     * this tab rather than opening a second simulator beside it. */
    claimWindowName(SIM_WINDOW);
    this.nodes = nodes;
    this.doc = createTrack(undefined, newTrackClass());
    this.selection = new Set();
    /* One side of the selected gate, picked in the 3D view to be taken away
     * with Delete: { id, side } or null. See FRAME_SIDES in elements.js. */
    this.pickedSide = null;
    /* Whether the author has been told once what bending the line does to
     * the gates either side of it. */
    this.bendSaid = false;
    this.armed = null;
    /* Which of the course's logos an armed ground decal will wear. Set only
     * by armGroundLogo, cleared by everything else that touches `armed`. */
    this.armedLogoId = '';
    this.mode = '2d';
    this.pathVisible = false;
    /* Flying-order numbers, on by default. A view choice, like the line:
     * it is not stored in the track, and turning it off does not change
     * what gets flown or published. */
    this.labelsVisible = true;
    this.path = null;
    this.warnings = [];
    this.history = new History();
    this.autosaver = makeAutosaver();
    this.drawQueued = false;
    /* A map's report: its solid count and its warnings, from the same
     * placement the simulator makes. Null on a race track. */
    this.report = null;
    /* The heading each asset type was last turned to on a map, so a row of
     * containers placed after turning the first one all come out turned. */
    this.lastYaw = new Map();
    /* The compass toast is said once a session: a tool that repeats itself
     * every drag is a tool people stop reading. */
    this.compassSaid = false;
    /* THE ROAD TOOL'S STATE. The road being laid, as plan points, which is
     * not in the document until it is finished, so the whole road lands as
     * one undo step and Escape leaves nothing behind; and the node of the
     * selected road the author last took hold of, which Delete removes. The
     * road tool's hints are said once each a session, as the compass's is. */
    this.roadDraft = null;
    this.activeNode = null;
    this.roadSaid = new Set();

    this.view2d = new View2D(nodes.canvas2d, this);
    this.view3d = new View3D(nodes.canvas3d, this);
    this.panels = new Panels(this, nodes);

    /* Read before restore(), which takes ?mode out of the address. */
    const asking = asksCanvas(readBuilderIntent());
    /* Run once when the open dialog closes, however it closes. The chooser
     * uses it to point at the switch in the bar. See closeModal. */
    this.afterModal = null;
    this.restore();
    /* The palette is the RESTORED document's class, not the default. Panels
     * builds one in its constructor because it must have something before a
     * document exists, and restore() runs after that, so a reopened RaceGOW
     * session was coming back with a field's tools over a room. */
    this.panels.buildPalette(trackClassOf(this.doc), docModeOf(this.doc));
    rememberCanvas(canvasOf(this.doc));
    this.buildTopBar();
    this.bindKeys();
    this.bindResize();
    this.bindModalBackdrop();

    this.view2d.resize();
    this.view2d.frameField();
    this.view3d.frameField();
    this.refresh();
    if (asking) {
      this.openChooser();
    }
  }

  /* ---------------- lifecycle ---------------- */

  restore() {
    const map = opensMap(readBuilderIntent());
    dropUrlMode();
    if (map) {
      /* The map's own seat, and the five inch in the chair, because that is
       * what flies it. A first visit starts a blank map. */
      setActiveTrackClass('full');
      const held = readAutosave('full', 'freestyle');
      this.doc = (held && held.doc) || newMap();
      if (held && held.repairs.length) {
        this.toast(`Recovered the working map. ${held.repairs.length} thing${held.repairs.length === 1 ? '' : 's'} needed repairing.`);
      }
      return;
    }
    const saved = readAutosave();
    if (saved && saved.doc) {
      this.doc = saved.doc;
      /* Same upgrade every other entry point runs. An autosave written
       * before stacked figures existed came back without one, so a reopened
       * session flew a stack differently from the file it was saved to. */
      upgradeStackedFigures(this.doc);
      applyAutoFaces(this.doc);
      if (saved.repairs.length) {
        this.toast(`Recovered the working track. ${saved.repairs.length} thing${saved.repairs.length === 1 ? '' : 's'} needed repairing.`);
      }
      return;
    }
    this.doc = createTrack(undefined, newTrackClass());
  }

  async adoptIncomingShare() {
    try {
      const intent = takeBuilderIntent();
      let share = readShareImport();
      const params = new URLSearchParams(window.location.search);
      if (params.get('share')) {
        try {
          share = await adoptShareFromLocation();
        } catch (e) {
          this.toast(`Could not open that published track. ${e.message || e}`);
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
      /* What the incoming track replaces is whatever its OWN seat holds,
       * which is the canvas on screen only when the two are the same kind:
       * a room from a board link opened on a five inch lands in the whoop
       * seat, and asking about the five inch track on screen asked about
       * the one thing that was not going to change. */
      const seated = this.seatedFor(incoming);
      if (wantEdit) {
        const load = () => {
          /* The seat may hold this same track with edits the board has not
           * had: the Publish button calls that drift and offers to send it.
           * Opening the board's version must not drop them, so they are
           * kept in Load as a copy under a new id (never under the board's
           * id, which would be two documents behind one edit key). */
          let local = '';
          if (!isEmptyCanvas(seated) && seated.id === incoming.id && localDrift(seated, incoming)) {
            const copy = duplicateTrack(seated, `${seated.name} (local changes)`);
            if (!saveTrack(copy)) {
              this.toast(`Nothing was opened: "${seated.name}" has changes the board does not, and they could not be kept because local storage is unavailable or full. Export it first.`);
              return;
            }
            local = `Your local changes are in Load as "${copy.name}".`;
          }
          this.loadDocument(incoming, [`Editing "${incoming.name}" on the board.`, local].filter(Boolean).join(' '));
        };
        if (!isEmptyCanvas(seated) && seated.id !== incoming.id) {
          this.confirm(
            ...this.replaceWords(seated, incoming, 'This published track', [
              'Replace the track on the canvas?',
              'Your current canvas will be replaced with this published track. Save it first if you still need it.',
            ]),
            load,
          );
        } else {
          load();
        }
        return;
      }
      const { copy, commit } = forkDocument(incoming, {
        sourceId: share.id,
        sourceName: share.name || incoming.name,
        sourceAuthor: share.author || '',
        board: share.board || boardOrigin(),
      });
      const load = () => {
        /* The other canvas's document is kept FIRST, because it can fail
         * (storage full), and then nothing may happen: loadDocument would
         * refuse, but only after the bind below was committed. The keep
         * is handed to loadDocument rather than asked for twice. */
        const keep = canvasOf(copy) !== canvasOf(this.doc) ? this.keepSeat(copy) : null;
        if (keep && !keep.ok) {
          this.toast(keep.said);
          return;
        }
        /* Committed HERE, not in forkDocument: the confirm below can be
         * declined, and a bind for a copy the author never opened is a
         * course this browser claims to own and has never seen. */
        commit();
        clearShareImport();
        this.loadDocument(copy, `This is your copy of "${share.name || incoming.name}". Publish it under a new name to put it on the board.`, keep);
      };
      if (!isEmptyCanvas(seated) && seated.id !== share.id) {
        this.confirm(
          ...this.replaceWords(seated, incoming, `A copy of "${share.name || incoming.name}"`, [
            `Open a copy of "${share.name || incoming.name}"?`,
            'The track on your canvas will be replaced. Save it first if you still need it.',
          ]),
          load,
        );
      } else {
        load();
      }
    } finally {
      this.syncBoardIdentity();
    }
  }

  /*
   * A PUBLISHED MAP FROM THE BOARD, as ?mapshare=id: its Remix in the
   * builder, which also carries ?mode=freestyle so restore() has already
   * opened the map canvas.
   *
   * A map this browser published opens as itself, so Publish updates it. Any
   * other opens as a copy under a new id and a remix's name, so Publish puts
   * up a new map and the original stays its builder's. Nothing is written to
   * the track seats or binds: a map's only record is its own key, and a copy
   * has none until it is published.
   *
   * The parameter comes out of the address once read, as ?mode= does, so a
   * reload is the author reloading their copy rather than asking the board
   * for another one.
   */
  async adoptIncomingMap() {
    let id = '';
    try {
      const url = new URL(window.location.href);
      id = url.searchParams.get('mapshare') || '';
      if (id) {
        url.searchParams.delete('mapshare');
        history.replaceState(history.state, '', url);
      }
    } catch (e) {
      return;
    }
    if (!id) {
      return;
    }
    let payload;
    try {
      payload = await fetchMapDocument(id, boardOrigin());
    } catch (e) {
      this.toast(`Could not open that published map. ${e.message || e}`);
      return;
    }
    const incoming = normalize(payload.document || payload).doc;
    if (docModeOf(incoming) !== 'freestyle') {
      this.toast('That link names a race track, not a map.');
      return;
    }
    const name = payload.name || incoming.name;
    const owned = Boolean(readMapListing(incoming.id));
    const seated = this.seatedFor(incoming);
    if (owned && seated && seated.id === incoming.id) {
      /* Already on the canvas, perhaps with edits the board has not had.
       * Replacing it with the board's copy would throw those away. */
      this.toast(`"${seated.name}" is already on your canvas.`);
      return;
    }
    const doc = owned ? incoming : duplicateTrack(incoming, suggestRemixName(name));
    const by = payload.author ? ` by ${payload.author}` : '';
    const load = () => this.loadDocument(doc, owned
      ? `Editing "${name}" on the board. Publish updates it.`
      : `This is your copy of "${name}"${by}. Publish it to put it on the board under your name. The original stays.`);
    if (!isEmptyCanvas(seated) && seated.id !== doc.id) {
      this.confirm(
        ...this.replaceWords(seated, doc, owned ? `"${name}"` : `A copy of "${name}"`, [
          owned ? `Open "${name}"?` : `Open a copy of "${name}"?`,
          'The map on your canvas will be replaced. Save it first if you still need it.',
        ]),
        load,
      );
    } else {
      load();
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
      this.fitTopBar();
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
    /*
     * DERIVE ALWAYS, DRAW ON REQUEST. The line used to be built only while
     * it was being drawn, so the length, the tightest radius, the elevation
     * profile and every warning sat behind a button: an author had to press
     * Create Path to find out whether the course they had just built was
     * valid, and nothing told them there was anything to find out. Deriving
     * is what tells them, so it happens on every edit. pathVisible now means
     * only what it says, whether the line is painted on the canvas.
     */
    this.rebuildPath();
    this.panels.renderAll();
    this.updateTopBar();
    this.view3d.markDirty();
    this.requestDraw();
    this.autosaver.schedule(this.doc);
  }

  rebuildPath() {
    /* A map has no flying order, so no line to derive. What it has instead
     * is the world it builds, and the report checks that. */
    if (docModeOf(this.doc) === 'freestyle') {
      this.path = null;
      this.report = freestyleReport(this.doc);
      this.warnings = sortWarnings(this.report.warnings);
      return;
    }
    this.report = null;
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
    this.pruneActiveNode();
    this.keepPickedSide();
    this.panels.renderAll();
    this.requestDraw();
  }

  toggleSelection(id) {
    if (this.selection.has(id)) {
      this.selection.delete(id);
    } else {
      this.selection.add(id);
    }
    this.pruneActiveNode();
    this.keepPickedSide();
    this.panels.renderAll();
    this.requestDraw();
  }

  /* The picked node belongs to the one road selected, or to nothing. */
  pruneActiveNode() {
    const a = this.activeNode;
    if (!a) {
      return;
    }
    const road = elementById(this.doc, a.id);
    if (this.selection.size !== 1 || !this.selection.has(a.id) || !road || !(a.index < (road.nodes?.length ?? 0))) {
      this.activeNode = null;
    }
  }

  /* ---------------- one side of a gate ---------------- */

  /* A picked side belongs to the one selected gate, and to a side that is
   * still there to take away. Anything else lets it go. */
  keepPickedSide() {
    const p = this.pickedSide;
    if (!p) {
      return;
    }
    const el = elementById(this.doc, p.id);
    if (this.selection.size !== 1 || !this.selection.has(p.id) || !el
      || (el.unbuiltSides ?? []).includes(p.side) || el.unbuilt === true) {
      this.pickedSide = null;
      this.view3d.markDirty();
    }
  }

  /*
   * WHERE AN ELEMENT IS on the plan, for centring the views on it: its
   * position, except a vehicle's, which is where it is drawn (its position
   * is written 0 and never read), and a road's, which is the middle of its
   * nodes rather than its first one.
   */
  placeOf(el) {
    const kind = kindOf(el);
    if (kind === KIND.VEHICLE) {
      const at = vehiclePlace(this.doc, el);
      return { x: at.x, y: at.y, z: 0 };
    }
    if (kind === KIND.ROAD) {
      const nodes = absNodes(el);
      if (nodes.length) {
        const xs = nodes.map((p) => p.x);
        const ys = nodes.map((p) => p.y);
        return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, z: 0 };
      }
    }
    return el.position;
  }

  /*
   * The 3D view's click on a pipe of the gate that is already selected: that
   * pipe is picked, drawn hot, and Delete takes just it away. The first
   * click on a gate selects the gate, as it always has, so Delete after one
   * click still removes the gate.
   */
  pickSide(id, side) {
    this.pickedSide = side ? { id, side } : null;
    this.view3d.markDirty();
    this.requestDraw();
    if (side) {
      this.toast(`${SIDE_WORDS[side]} picked. Delete takes away just that pipe: the opening still scores and still lights. Esc lets go of it.`);
    }
  }

  clearPickedSide() {
    if (!this.pickedSide) {
      return false;
    }
    this.pickedSide = null;
    this.view3d.markDirty();
    this.requestDraw();
    return true;
  }

  /* The inspector's Frame toggles and the Delete key both come here. */
  setFrameSide(id, side, built) {
    this.edit(built ? 'put a side back' : 'take a side away', (d) => {
      setSideBuilt(d, id, side, built);
    });
    this.keepPickedSide();
  }

  removePickedSide() {
    const p = this.pickedSide;
    this.pickedSide = null;
    if (!p || !elementById(this.doc, p.id)) {
      return;
    }
    this.setFrameSide(p.id, p.side, false);
    this.toast(`${SIDE_WORDS[p.side]} taken away. The opening still scores. Put it back under Frame in the inspector, or undo.`);
  }

  /* ---------------- bending the line, in 3D ---------------- */

  /*
   * A drag that starts on the racing line drops a waypoint where the line
   * was grabbed and moves it: see bendLineAt in sequence.js. Called on the
   * drag's first move, not on the press, so a click on the line that goes
   * nowhere leaves nothing behind. Returns the new waypoint's id.
   */
  beginBend(hit) {
    if (docModeOf(this.doc) === 'freestyle' || !this.path) {
      return null;
    }
    this.history.begin(this.doc, 'bend the line');
    const yaw = Math.atan2(hit.tangent.y, hit.tangent.x);
    const el = bendLineAt(this.doc, this.path, hit.segment, hit.pos, yaw);
    if (!el) {
      this.history.cancel();
      return null;
    }
    this.selection = new Set([el.id]);
    this.pickedSide = null;
    this.afterBendMove();
    this.panels.renderAll();
    if (!this.bendSaid) {
      this.bendSaid = true;
      this.toast('That dropped a waypoint on the line, which bends it and scores nothing. The gates either side keep facing the way they face; Re-derive in the inspector hands one back to the automatic rule.');
    }
    return el.id;
  }

  /* A drag on a waypoint that is already there: the same gesture. The
   * neighbours are pinned on the first move, not here, so a click that does
   * not move leaves no undo step. */
  beginWaypointDrag() {
    this.history.begin(this.doc, 'bend the line');
  }

  moveWaypoint(id, pos, first = false) {
    const el = elementById(this.doc, id);
    if (!el) {
      return;
    }
    if (first) {
      pinFacesAt(this.doc, neighboursOf(this.doc, id));
    }
    el.position.x = pos.x;
    el.position.y = pos.y;
    el.position.z = Math.max(0, pos.z);
    this.afterBendMove();
  }

  afterBendMove() {
    applyAutoFaces(this.doc);
    this.rebuildPath();
    this.view3d.markDirty();
    this.requestDraw();
    this.panels.renderInspector();
  }

  /* A gesture the browser took away: put the document back as it was when
   * the gesture began. cancelEdit keeps what the drag did, which suits a
   * height drag; a bend has added an element, and a cancelled bend that
   * left one behind would be a waypoint nobody asked for with no undo step
   * to take it away again. */
  revertEdit() {
    const before = this.history.pending?.doc;
    this.history.cancel();
    if (before) {
      this.doc = deepClone(before);
      this.pruneSelection();
    }
    this.refresh();
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
        const at = this.placeOf(e);
        x += at.x;
        y += at.y;
        z += at.z;
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
      /* A road's warning about one of its nodes picks that node too, so
       * Delete, or a drag, is the next thing to do. */
      const el = elementById(this.doc, w.elementId);
      if (el && kindOf(el) === KIND.ROAD && Number.isInteger(w.node) && w.node < el.nodes.length) {
        this.setActiveNode(el.id, w.node);
      }
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
    /* A road half laid is put away with the tool that was laying it. */
    if (this.armed !== 'road') {
      this.roadDraft = null;
    }
    /* A tool armed from the palette carries no logo with it. The decal it
     * places falls back to the course's first logo, which is what
     * createElement has always done. */
    this.armedLogoId = '';
    this.panels.renderPalette();
    this.requestDraw();
    if (this.armed === 'road') {
      this.sayOnce('arm road', 'Click to lay the road’s nodes: it bends through them the way a car can drive. Click the first node to close a loop, press Enter or double click to finish it open, Escape to stop.');
    } else if (this.armed === 'vehicle') {
      const roads = this.doc.elements.some((e) => kindOf(e) === KIND.ROAD);
      this.sayOnce(roads ? 'arm vehicle' : 'arm vehicle, no road', roads
        ? 'Click on a road to put a car there. On a two lane loop the side you click is the lane it drives.'
        : 'A vehicle drives a road, and this map has none yet. Lay one with the Road tool first.');
    }
  }

  /* A road tool hint, said the first time it applies and not again this
   * session. */
  sayOnce(key, message) {
    if (this.roadSaid.has(key)) {
      return;
    }
    this.roadSaid.add(key);
    this.toast(message);
  }

  /*
   * Arm the ground decal with a logo already chosen, which is what the
   * Sponsor logos dialog's Paint on the grass button does.
   *
   * A separate entry point rather than an argument to arm(), because arm()
   * TOGGLES: pressing Paint on the grass on two logos in a row would have
   * disarmed the tool on the second press, and the author plainly wants to
   * paint the second one.
   */
  armGroundLogo(logoId) {
    this.armed = 'groundLogo';
    this.armedLogoId = typeof logoId === 'string' ? logoId : '';
    this.panels.renderPalette();
    this.requestDraw();
    this.toast('Click the field where the paint goes. Its size is in the inspector.');
  }

  disarm() {
    this.armed = null;
    this.armedLogoId = '';
    this.roadDraft = null;
    this.panels.renderPalette();
    this.requestDraw();
  }

  /* ---------------- the road tool ---------------- */

  /*
   * A click with the road tool. On the draft's first node (three down) it
   * closes the road into a loop; on its last it finishes it open, which is
   * where the second click of a double click lands; anywhere else it lays a
   * node at the snapped point. `raw` is the pointer, so a node can be hit
   * whatever the grid; `reach` is how close counts, in metres.
   */
  draftClick(raw, snapped, reach) {
    const nodes = this.roadDraft ?? [];
    if (closesDraft(nodes, raw.x, raw.y, reach)) {
      this.finishDraft(true);
      return;
    }
    if (endsDraft(nodes, raw.x, raw.y, reach)) {
      this.finishDraft(false);
      return;
    }
    this.roadDraft = addDraftNode(nodes, snapped);
    this.requestDraw();
  }

  /* The draft laid as a road, in one edit, and selected. The tool stays
   * armed, so the next click starts the next road. */
  finishDraft(closed) {
    const nodes = this.roadDraft ?? [];
    const road = roadFromDraft(nodes, closed);
    if (!road) {
      this.toast(closed
        ? `A loop needs ${LOOP_MIN} nodes.`
        : `A road needs ${OPEN_MIN} nodes: click where it goes next.`);
      return;
    }
    let newId = null;
    this.edit(closed ? 'lay loop' : 'lay road', (d) => {
      const el = createElement(d, 'road', road.position);
      el.nodes = road.nodes;
      el.closed = road.closed;
      d.elements.push(el);
      newId = el.id;
    });
    this.roadDraft = null;
    if (newId) {
      this.setSelection([newId]);
    }
    this.sayOnce('laid', 'Road laid. Drag a node to reshape it, drag the + between two nodes to add one, click a node and press Delete to take it out. Pick Vehicle and click on it to put a car on it.');
  }

  cancelDraft() {
    this.roadDraft = null;
    this.requestDraw();
  }

  /* Backspace while laying: the last node back. */
  undoDraftNode() {
    if (!this.roadDraft) {
      return;
    }
    this.roadDraft = this.roadDraft.length > 1 ? this.roadDraft.slice(0, -1) : null;
    this.requestDraw();
  }

  setActiveNode(id, index) {
    this.activeNode = { id, index };
    this.panels.renderInspector();
    this.requestDraw();
  }

  /* Where every vehicle on a road is drawn now, by id: taken before an edit
   * that moves the road's line, so reseatVehicles can put each back. */
  vehicleStarts(roadId) {
    const starts = new Map();
    for (const el of this.doc.elements) {
      if (kindOf(el) === KIND.VEHICLE && el.road === roadId) {
        const at = vehiclePlace(this.doc, el);
        if (at.onRoad) {
          starts.set(el.id, { x: at.x, y: at.y });
        }
      }
    }
    return starts;
  }

  /*
   * KEEP THE CARS WHERE THEY WERE. A car's place is how far along its road's
   * centre line it starts, so reshaping the road (a node moved, added or
   * taken out, a loop opened, a new radius) would slide every car on it to
   * wherever that distance now falls. Instead each goes to the point of the
   * new line nearest where it was drawn, which is where the author left it.
   * Moving the whole road changes no distance, and every car goes with it.
   */
  reseatVehicles(doc, roadId, starts) {
    for (const [id, p] of starts) {
      const el = elementById(doc, id);
      const snap = snapToRoad(doc, p.x, p.y, Infinity, roadId);
      if (el && snap) {
        el.dims.offset = snap.offset;
      }
    }
  }

  /* An edit to one road that may move its line, with its cars kept. */
  editRoad(label, id, mutate) {
    const starts = this.vehicleStarts(id);
    this.edit(label, (d) => {
      const el = elementById(d, id);
      if (el) {
        mutate(el);
        this.reseatVehicles(d, id, starts);
      }
    });
  }

  setRoadClosed(id, closed) {
    const el = elementById(this.doc, id);
    if (!el || (closed && el.nodes.length < LOOP_MIN)) {
      return;
    }
    this.editRoad(closed ? 'close loop' : 'open loop', id, (e2) => { e2.closed = closed; });
  }

  /* A node dragged: many of these between beginEdit and endEdit, one undo
   * step. */
  moveRoadNode(id, index, p, starts) {
    const el = elementById(this.doc, id);
    const moved = el ? moveNode(el, index, p) : null;
    if (!moved) {
      return;
    }
    el.position = moved.position;
    el.nodes = moved.nodes;
    this.reseatVehicles(this.doc, id, starts);
    this.requestDraw();
    this.panels.renderInspector();
  }

  /* A node put in on a leg, inside a gesture the caller began. Returns the
   * new node's index, or -1. */
  insertRoadNode(id, leg, p, starts) {
    const el = elementById(this.doc, id);
    const out = el ? insertNode(el, leg, p) : null;
    if (!out) {
      return -1;
    }
    el.position = out.position;
    el.nodes = out.nodes;
    this.reseatVehicles(this.doc, id, starts);
    this.activeNode = { id, index: out.index };
    this.requestDraw();
    this.panels.renderInspector();
    return out.index;
  }

  deleteRoadNode(id, index) {
    const el = elementById(this.doc, id);
    const out = el ? deleteNode(el, index) : null;
    if (!out) {
      this.toast('A road needs two nodes. Delete the road itself instead: click away from its nodes and press Delete.');
      return;
    }
    const wasLoop = el.closed === true;
    this.activeNode = null;
    this.editRoad('delete node', id, (e2) => {
      e2.position = out.position;
      e2.nodes = out.nodes;
      e2.closed = out.closed;
    });
    if (wasLoop && !out.closed) {
      this.toast('Two nodes cannot close a loop, so the road is open now.');
    }
  }

  /*
   * A click with the vehicle armed: a car on the nearest road within reach,
   * at the nearest point of its centre line, facing the way the side of a
   * two lane loop that was clicked drives. `slack` is metres past the
   * road's own edge.
   */
  dropVehicle(world, slack) {
    const snap = snapToRoad(this.doc, world.x, world.y, slack);
    if (!snap) {
      const roads = this.doc.elements.some((e) => kindOf(e) === KIND.ROAD);
      this.toast(roads
        ? 'A vehicle goes on a road: click on one, or close beside it.'
        : 'A vehicle drives a road, and this map has none yet. Lay one with the Road tool first.');
      return;
    }
    let newId = null;
    this.edit('place Vehicle', (d) => {
      const el = createElement(d, 'vehicle', { x: 0, y: 0 });
      el.road = snap.road;
      el.dims.offset = snap.offset;
      el.reverse = snap.twoLaneLoop && snap.right;
      d.elements.push(el);
      newId = el.id;
    });
    if (newId) {
      this.setSelection([newId]);
    }
  }

  /*
   * A vehicle dragged: slid along its own road, to the point of it nearest
   * the pointer. A vehicle with no road is put on the nearest one within
   * reach, which is how one left behind by a deleted road is put back.
   */
  slideVehicle(id, world, slack) {
    const el = elementById(this.doc, id);
    if (!el) {
      return;
    }
    const road = elementById(this.doc, el.road);
    const own = road && kindOf(road) === KIND.ROAD;
    const snap = own
      ? snapToRoad(this.doc, world.x, world.y, Infinity, road.id)
      : snapToRoad(this.doc, world.x, world.y, slack);
    if (!snap) {
      return;
    }
    if (!own) {
      el.road = snap.road;
      el.reverse = snap.twoLaneLoop && snap.right;
    }
    el.dims.offset = snap.offset;
    this.requestDraw();
    this.panels.renderInspector();
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
    const freestyle = docModeOf(this.doc) === 'freestyle';

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
        this.toast(freestyle
          ? 'A map has one set of start pads, where the pilot starts, so this moved the ones you had.'
          : 'A track has one set of start pads, so this moved the ones you had.');
        return;
      }
    }

    /*
     * ON A MAP, NOTHING JOINS A FLYING ORDER, because there is none: a gate
     * on a map is furniture. And there is no course for a new element to
     * face along, so it faces the way the author last turned one of its
     * kind, or east.
     */
    if (freestyle) {
      let newId = null;
      this.edit(`place ${def.label}`, (d) => {
        const yaw = def.kind === KIND.ANNOTATION ? 0 : this.newYawFor(type);
        const element = createElement(d, type, world, yaw);
        if (def.kind === KIND.DECAL && this.armedLogoId
          && logosOf(d).some((l) => l.id === this.armedLogoId)) {
          element.logoId = this.armedLogoId;
        }
        d.elements.push(element);
        newId = element.id;
      });
      if (newId) {
        this.setSelection([newId]);
      }
      return;
    }

    let newId = null;
    this.edit(`place ${def.label}`, (d) => {
      const yaw = def.kind === KIND.ANNOTATION ? 0 : defaultYawFor(d, world);
      const element = createElement(d, type, world, yaw);
      /* The logo the Sponsor logos dialog armed this with, if it armed it.
       * createElement has already put the course's first logo on a decal, so
       * this only overrides, and only for a logo that is still on the
       * course: removing one between arming and clicking is a real order of
       * events and it must not write a dangling id. */
      if (def.kind === KIND.DECAL && this.armedLogoId
        && logosOf(d).some((l) => l.id === this.armedLogoId)) {
        element.logoId = this.armedLogoId;
      }
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
      /* A vehicle is wherever its road puts it: it goes with its road, or
       * slides along it, and has no position of its own to move. */
      if (element && kindOf(element) !== KIND.VEHICLE) {
        element.position.x = from.x + delta.x;
        element.position.y = from.y + delta.y;
      }
    }
    applyAutoFaces(this.doc);
    this.rebuildPathForDrag();
    this.requestDraw();
    this.panels.renderInspector();
  }

  /*
   * ON EVERY STEP OF A DRAG ON A TRACK, not only while the line is shown: a
   * marker's square is drawn off the line's own knot (markerSquare in
   * path.js), so a stale line is a square left behind by the drag. Measured
   * on the heaviest shipped track, the line and its warnings are 7 ms; a
   * room is under 2. A map has no line, and its report is a placement of
   * every solid, so a map keeps the rule it had.
   */
  rebuildPathForDrag() {
    if (this.pathVisible || docModeOf(this.doc) !== 'freestyle') {
      this.rebuildPath();
    }
  }

  rotateSelected(yaw) {
    for (const id of this.selection) {
      /* setYaw, not the two fields by hand: turning a gate has to pin which
       * way its passes are flown as well as which way it points, or the
       * auto rule takes the direction back the moment the drag ends. */
      setYaw(this.doc, id, yaw);
      this.rememberYaw(elementById(this.doc, id));
    }
    /* A turned marker's square swings with the line's knot, so the knot has
     * to move with the handle: see rebuildPathForDrag. */
    this.rebuildPathForDrag();
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
    this.rebuildPathForDrag();
    this.view3d.markDirty();
    this.requestDraw();
    this.panels.renderInspector();
  }

  deleteSelection() {
    if (!this.selection.size) {
      return;
    }
    const ids = [...this.selection];
    /* A road's cars are not deleted with it: they keep the road they named
     * and stay parked until they are put on another, as normalize keeps
     * them, and the warnings say so. Said here too, once, as it happens. */
    const gone = new Set(ids);
    const stranded = this.doc.elements.filter((e) => kindOf(e) === KIND.VEHICLE && !gone.has(e.id)
      && gone.has(e.road) && kindOf(elementById(this.doc, e.road)) === KIND.ROAD);
    this.edit(`delete ${ids.length}`, (d) => {
      for (const id of ids) {
        removeElement(d, id);
      }
    });
    this.selection.clear();
    this.activeNode = null;
    this.panels.renderAll();
    if (stranded.length) {
      this.toast(`${stranded.length === 1 ? 'A vehicle was' : `${stranded.length} vehicles were`} on that road, and ${stranded.length === 1 ? 'it is' : 'they are'} parked now with no road, in the row along the south edge of the plot. Drag ${stranded.length === 1 ? 'it' : 'each'} onto a road, or delete ${stranded.length === 1 ? 'it' : 'them'}.`);
    }
  }

  onHoverWorld(world) {
    if (!this.nodes.readout || !world) {
      return;
    }
    this.nodes.readout.textContent = `${world.x.toFixed(2)}, ${world.y.toFixed(2)} m`;
  }

  /*
   * THE HEADING A MARKER IS TURNED FROM.
   *
   * A flag, cone or pole nobody has turned sits its square on the outside of
   * the turn, and its own stored yaw is whatever it was placed with, which is
   * not where the square is. Turning it by hand makes the yaw the pass
   * direction (markerPassDir in faces.js), so a turn that started from the
   * stored yaw threw the square round the pole to wherever that yaw happened
   * to point: the first press of Q, or the first pull on the handle, and the
   * square jumped a quarter of the way round before it began to follow. So
   * until it is turned, a marker reports the way its square actually sits,
   * read off the racing line's knot, and the handle, Q and E and the
   * inspector all start from there.
   */
  shownYaw(el) {
    return passYawOf(this.doc, this.path, el);
  }

  /* ---------------- headings on a map ---------------- */

  /* The heading a new element of `type` is placed at on a map. */
  newYawFor(type) {
    return snapYaw(type, this.lastYaw.get(type) ?? 0, true);
  }

  rememberYaw(el) {
    if (el && docModeOf(this.doc) === 'freestyle') {
      this.lastYaw.set(el.type, el.yaw);
    }
  }

  /*
   * THE FIRST TIME AN AUTHOR TRIES TO TURN A BUILDING OFF THE COMPASS, say
   * why it will not go. Snapping silently looks like a broken handle, and a
   * refusal with no reason is the thing a tool should never do.
   */
  noteOffCompass() {
    if (this.compassSaid) {
      return;
    }
    this.compassSaid = true;
    this.toast('Buildings, containers, bridges and the skate set keep to the compass for now: they turn in quarter turns until the physics learns turned boxes. Cranes, trees, masts and gates turn freely.');
  }

  /* The inspector's yaw field. A quarter asset snaps, and says so the first
   * time; everything else takes exactly what was typed, as it always has. */
  setElementYaw(id, yaw) {
    const el = elementById(this.doc, id);
    if (!el || !Number.isFinite(yaw)) {
      return;
    }
    let want = yaw;
    if (turnsOf(el.type) === 'quarter') {
      if (offCompass(wrapAngle(yaw)) > 1e-3) {
        this.noteOffCompass();
      }
      want = snapYaw(el.type, yaw);
    }
    this.edit('rotate', (d) => {
      setYaw(d, id, want);
    });
    this.rememberYaw(elementById(this.doc, id));
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
    this.edit('add to the track', (d) => { addToSequence(d, elementId, 0); });
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
    this.edit('remove from the track', (d) => { removeFromSequence(d, seqId); });
  }

  setSequenceAperture(seqId, index) {
    this.edit('change level', (d) => { setApertureIndex(d, seqId, index); });
  }

  reorder(from, to) {
    this.edit('reorder', (d) => { moveInSequence(d, from, to); });
  }

  /* ---------------- path ---------------- */

  createPath() {
    /* A map has no racing line to paint. */
    if (docModeOf(this.doc) === 'freestyle') {
      return;
    }
    this.pathVisible = true;
    this.rebuildPath();
    this.panels.renderAll();
    this.updateTopBar();
    this.view3d.markDirty();
    this.requestDraw();
  }

  togglePath() {
    if (docModeOf(this.doc) === 'freestyle') {
      return;
    }
    if (!this.pathVisible) {
      this.createPath();
      return;
    }
    /* renderAll and updateTopBar, the same pair createPath calls. Only the
     * palette was refreshed, so the top bar's button stayed lit while the
     * line was gone. */
    /* The path stays derived. Only the paint goes away, so the Results
     * panel keeps reporting on the course either way. */
    this.pathVisible = false;
    this.panels.renderAll();
    this.updateTopBar();
    this.view3d.markDirty();
    this.requestDraw();
  }

  /*
   * The flying-order numbers on the gates. They sit on the opening, which
   * is where the racing line passes, so a dense room is a field of chips
   * with the line hiding behind them. Off, the numbers go and the line,
   * the gates and the sequence list stay. The list is where the order is
   * read while the canvas is clear.
   */
  toggleLabels() {
    this.labelsVisible = !this.labelsVisible;
    this.updateTopBar();
    this.view3d.markDirty();
    this.requestDraw();
  }

  /* ---------------- views ---------------- */

  setMode(mode) {
    if (this.mode === mode) {
      return;
    }
    this.mode = mode;
    /* Roads are laid on the plan. */
    this.roadDraft = null;
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

  /* The document `doc` would replace: the one on screen when the two are
   * the same kind of canvas, otherwise what that canvas's seat holds, or
   * null when it holds nothing. */
  seatedFor(doc) {
    if (canvasOf(doc) === canvasOf(this.doc)) {
      return this.doc;
    }
    const held = readAutosave(trackClassOf(doc), docModeOf(doc));
    return held && held.doc ? held.doc : null;
  }

  /*
   * A confirm's title and body for replacing `seated`. On screen, the words
   * the caller always had. Off screen, the seat is named, because the
   * author cannot see it, and what keepSeat will do with it is said.
   */
  replaceWords(seated, incoming, what, onScreen) {
    if (seated === this.doc) {
      return onScreen;
    }
    const where = CANVAS_NAMES[canvasOf(incoming)];
    return [
      `Replace "${seated.name}" on the ${where} canvas?`,
      `${what} opens on the ${where} canvas in its place. ${trackExists(seated.id)
        ? 'The copy saved in Load stays, and any changes made since it was saved go into Load beside it.'
        : `"${seated.name}" goes into Load first, so it is not lost.`}`,
    ];
  }

  /*
   * A DOCUMENT OF ANOTHER CANVAS REPLACES WHAT THAT CANVAS HELD, out of
   * sight. Importing a map on a race track, a ?track= link to one, a room
   * imported on the five inch, or a copy of a board track opened while the
   * map was up, each wrote over a seat the author could not see. What was
   * there goes into the library first, by keepDisplaced in ./storage.js,
   * the rule seatLocal in src/ui/ui.js applies when the simulator seats a
   * track: as itself when Load does not have it, as a copy beside the
   * saved one when it was edited after its last Save, and not at all when
   * Load has it as it is. The toast says where it went. The toggle hands
   * over the seat's own document, the same id, so it never saves anything
   * here. Returns { ok, said }: ok is false when the seat needed keeping
   * and could not be kept, and then nothing may replace it.
   */
  keepSeat(doc) {
    const seated = this.seatedFor(doc);
    if (isEmptyCanvas(seated) || seated.id === doc.id) {
      return { ok: true, said: '' };
    }
    const where = CANVAS_NAMES[canvasOf(doc)];
    const kept = keepDisplaced(seated);
    if (!kept.ok) {
      return {
        ok: false,
        said: `Nothing was opened: "${seated.name}" is on the ${where} canvas and could not be kept, because local storage is unavailable or full. Export it first.`,
      };
    }
    if (!kept.saved) {
      return { ok: true, said: '' };
    }
    return {
      ok: true,
      said: kept.saved === seated
        ? `"${seated.name}" was on the ${where} canvas, so it is in Load now.`
        : `"${seated.name}" on the ${where} canvas had changes made after it was saved, so they are in Load as "${kept.saved.name}".`,
    };
  }

  loadDocument(doc, message, keep = null) {
    /* A document of another canvas moves the author to that canvas, so the
     * one being left is written to its own seat first, the same as the
     * toggle does: importing a race track onto a map must not drop the
     * map's last few seconds of edits. Then whatever the other canvas held
     * is kept, see keepSeat, or was already by a caller that had to know
     * first and hands the answer in as `keep`. If it could not be kept,
     * nothing changes: the screen, both seats and the canvas stay as they
     * were, and the author is told. Returns whether the document opened. */
    let kept = '';
    if (canvasOf(doc) !== canvasOf(this.doc)) {
      this.autosaver.flush();
      const k = keep ?? this.keepSeat(doc);
      if (!k.ok) {
        this.toast(k.said);
        return false;
      }
      kept = k.said;
    }
    this.doc = doc;
    /* The palette is the track class's, so it is rebuilt whenever a document
     * arrives rather than once at boot. A RaceGOW room and a sixty metre
     * field are not made of the same parts, and a map is made of neither. */
    this.panels.buildPalette(trackClassOf(this.doc), docModeOf(this.doc));
    /* Loading a document is choosing its canvas, so the builder reopens on
     * it next time. */
    rememberCanvas(canvasOf(this.doc));
    /*
     * THE DOCUMENT GOVERNS THE CLASS, not only the toggle. A room opened from
     * the library, from a board link or as a remix on a five inch builder
     * drew the whoop palette and filed its autosave in the whoop seat, but
     * left the shell seated on the five inch, so Fly this track opened a
     * simulator reading the five inch's seat and the room was not in it.
     * Loading a document of the other class IS choosing that class.
     */
    setActiveTrackClass(trackClassOf(this.doc));
    upgradeStackedFigures(this.doc);
    applyAutoFaces(this.doc);
    this.selection.clear();
    this.activeNode = null;
    this.roadDraft = null;
    this.pickedSide = null;
    this.history.reset();
    this.path = null;
    this.warnings = [];
    this.pathVisible = false;
    writeAutosave(this.doc);
    this.view2d.frameField();
    this.view3d.frameField();
    this.view3d.markDirty();
    this.refresh();
    const said = [message, kept].filter(Boolean).join(' ');
    if (said) {
      this.toast(said);
    }
    return true;
  }

  newTrack() {
    if (docModeOf(this.doc) === 'freestyle') {
      this.confirm('Start a new map?', 'Anything unsaved in the current one is gone.', () => {
        this.loadDocument(newMap(), 'New map, on a 160 metre plot.');
      });
      return;
    }
    this.confirm('Start a new track?', 'Anything unsaved in the current one is gone.', () => {
      this.loadDocument(createTrack(undefined, newTrackClass()), 'New track.');
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

  /* The bar's Delete. Named apart from removeCurrent so the confirm cannot
   * be skipped by a caller reaching for the shorter name. */
  confirmRemove() {
    this.removeCurrent();
  }

  toggleMore() {
    if (!this.moreMenu) {
      return;
    }
    this.moreMenu.hidden = !this.moreMenu.hidden;
    this.moreBtn.classList.toggle('on', !this.moreMenu.hidden);
  }

  closeMore() {
    if (!this.moreMenu || this.moreMenu.hidden) {
      return;
    }
    this.moreMenu.hidden = true;
    this.moreBtn.classList.remove('on');
  }

  removeCurrent() {
    this.confirm(`Delete "${this.doc.name}"?`, 'It is removed from the saved list. This cannot be undone.', () => {
      deleteTrack(this.doc.id);
      this.loadDocument(docModeOf(this.doc) === 'freestyle' ? newMap() : createTrack(undefined, newTrackClass()), 'Deleted.');
    });
  }

  openLoad() {
    /* A map lists with maps and a track with tracks, so the Load list of one
     * canvas never offers the other's documents. */
    const map = docModeOf(this.doc) === 'freestyle';
    const tracks = listTracks(trackClassOf(this.doc), docModeOf(this.doc));
    const body = document.createElement('div');
    if (!tracks.length) {
      const p = document.createElement('p');
      p.className = 'tb-help';
      p.textContent = map
        ? 'No maps saved yet. Save the current map, or import a .json file.'
        : 'Nothing saved yet. Save the current track, or import a .json file.';
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
      if (map) {
        /* The shipped yard has no change date worth showing; what a pilot
         * knows it as is the map the simulator flew them round. */
        meta.textContent = t.preset
          ? `${t.mix}, the yard Your map flies until you build one`
          : `${t.mix}, changed ${t.modifiedUtc}`;
      } else {
        meta.textContent = t.preset
          ? `${t.mix}, ${t.sequence} in the order`
          : `${t.mix}, ${t.sequence} in the order, changed ${t.modifiedUtc}`;
      }
      name.append(meta);
      /*
       * WHOSE TRACK THIS IS, on the row.
       *
       * A pilot's own tracks carry no credit and get no byline. A track
       * that came from somewhere else does, and keeps it when the pilot
       * saves their own copy, because saving a layout does not make it
       * yours: the DESIGNER is named rather than the series or whoever
       * imported it, because those are three different people and only one
       * of them drew it. textContent, never innerHTML: a credit is data and
       * one day it may not be ours.
       */
      if (t.credit) {
        const by = document.createElement('div');
        by.className = 'tb-load-meta';
        const bits = [];
        if (t.credit.designer) bits.push(`by ${t.credit.designer}`);
        if (t.credit.series) bits.push(t.credit.series);
        if (t.credit.sponsor) bits.push(`sponsored by ${t.credit.sponsor}`);
        by.textContent = bits.join(', ');
        name.append(by);
      }
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
      /* No Delete on a shipped track. There is nothing to delete: it is
       * not in the library until the pilot saves their own copy, and a
       * button that does nothing is worse than no button. */
      if (t.preset) {
        row.append(name, open);
      } else {
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
      }
      body.append(row);
    }
    this.modal(map ? 'Saved maps' : 'Saved tracks', body);
  }

  exportFile() {
    downloadTrack(this.doc);
    this.toast('Exported.');
  }

  /*
   * A looping animation of one lap, as a file the pilot can post.
   *
   * The render is minutes of work on a slow machine and seconds on a fast
   * one, so it is behind its own button inside a modal rather than on the
   * menu item: pressing Export animation should open something that explains
   * what is about to happen, not lock the page up for a minute.
   *
   * Three.js and the exporter are imported here and not at the top of the
   * file, the same way view3d.js loads Three, so a pilot who never asks for
   * an animation never pays for the code or for the CDN being up.
   */
  async exportAnimation() {
    if (this.nameInput && this.nameInput.value) {
      this.doc.name = this.nameInput.value.trim() || 'Untitled track';
    }
    /* A map has no lap to animate. The menu does not offer this on a map;
     * this is for any other way in. */
    if (docModeOf(this.doc) === 'freestyle') {
      this.toast('An animation is one lap of a track, and a map has no lap.');
      return;
    }
    /* One element is not a lap, which is the same rule the racing line
     * itself applies, so the refusal says the same thing. */
    if (this.doc.sequence.length < 2) {
      this.toast('An animation needs at least two elements in the flying order.');
      return;
    }

    const body = document.createElement('div');
    const help = document.createElement('p');
    help.className = 'tb-help';
    /* No duration named any more, because there is no one duration: the
     * quad flies a steady pace and a longer lap simply takes longer to go
     * round. See LAP_SPEED in stage.js. */
    help.textContent = 'One lap of the racing line, 512 by 512, looping, flown at the '
      + 'same pace whatever the track, so a longer lap is a longer clip. '
      + 'It comes out around 1 to 2 MB, which posts anywhere. Rendering takes a minute '
      + 'or so and this tab has to stay open while it does.';
    const status = document.createElement('p');
    status.className = 'tb-help';
    body.append(help, status);

    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'tb-btn tb-primary';
    go.textContent = 'Render the animation';
    go.addEventListener('click', async () => {
      go.disabled = true;
      status.textContent = 'Loading the renderer.';
      try {
        const { exportTrackGif } = await import('./animate.js');
        const bytes = await exportTrackGif(this.doc, {
          onProgress: (done, total) => {
            status.textContent = `Frame ${done} of ${total}.`;
          },
        });
        downloadBlob(bytes, animationFilename(this.doc), 'image/gif');
        const mb = (bytes.length / 1e6).toFixed(2);
        status.textContent = `Done. ${mb} MB, saved as ${animationFilename(this.doc)}.`;
        go.textContent = 'Render it again';
        go.disabled = false;
      } catch (e) {
        status.textContent = e && e.message ? e.message : String(e);
        go.disabled = false;
      }
    });
    body.append(go);
    this.modal('Export animation', body);
  }

  /*
   * The card animation, rendered and sent after a room is published. The
   * rendering and the sending are in src/share/cardgif.js, because the
   * simulator's own Publish does the same thing and the two must not
   * differ. What is here is what to say while it happens.
   *
   * It is sixty frames rather than the export button's three hundred, so it
   * is three or four seconds on real hardware rather than a minute. The
   * author is looking at a dialog that has just said Published, so the wait
   * is paid for by a sentence rather than by a spinner.
   */
  async renderCardForBoard(origin, status) {
    const was = status.textContent;
    const done = await sendCardAnimation(this.doc, {
      origin,
      onProgress: (n, total) => {
        status.textContent = `${was} Drawing its card, frame ${n} of ${total}.`;
      },
    });
    if (done.skipped) {
      return;
    }
    /* Said plainly, and said as what it is: the track went up, the picture
     * did not. */
    status.textContent = done.error
      ? `${was} The track is up, but its card animation could not be sent: ${done.error}`
      : `${was} Its card on the board is a lap of it.`;
  }

  /*
   * THE SHARE CARD, drawn here for the reason the animation is. A link to
   * this track posted on Facebook, X or WhatsApp shows a picture, their
   * crawlers run no script to find one, and the board renders nothing, so
   * the picture has to exist before anybody posts the link and only a
   * browser can draw it. Every track and every map gets one, a field track
   * included. See src/share/card.js.
   *
   * After the animation rather than beside it: two worlds built at once is
   * two GPU contexts on a machine that may only have been happy with one.
   * `noun` is "track" or "map", for the sentence.
   */
  async renderShareCardForBoard({ kind, noun, origin, editKey, status }) {
    const was = status.textContent;
    status.textContent = `${was} Drawing the picture a link to it shows.`;
    const done = await sendShareCard({
      kind, id: this.doc.id, board: origin, editKey,
    });
    status.textContent = done.error
      ? `${was} The ${noun} is up, but its share picture could not be sent, so a link to it shows the WebFPV card for now: ${done.error}`
      : `${was} A link to it, posted anywhere, shows the ${noun}.`;
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
    if (docModeOf(this.doc) === 'freestyle') {
      this.openPublishMap();
      return;
    }
    if (this.nameInput && this.nameInput.value) {
      this.doc.name = this.nameInput.value.trim() || 'Untitled track';
    }
    if (!this.doc.sequence.length) {
      this.toast('A published track needs at least one gate in the flying order.');
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
      help.textContent = `This is your copy${of}${by}. It goes on the board as a new track under the name below. The original stays.`;
    } else if (owned && listing.layoutDrift) {
      help.textContent = 'The layout changed. Updating the board will clear posted times. A rename alone would have kept them.';
    } else if (owned) {
      help.textContent = 'This track is already on the board. Updating it keeps the times if the flying layout has not changed.';
    } else {
      help.textContent = 'The public board keeps a copy of this track, including every sponsor logo on the gates, the flags and the grass. Times people post are stored there.';
    }
    body.append(help);

    const courseField = document.createElement('div');
    courseField.className = 'tb-field';
    const courseLabel = document.createElement('label');
    courseLabel.className = 'tb-field-label';
    courseLabel.textContent = 'Track name';
    const courseInput = document.createElement('input');
    courseInput.type = 'text';
    courseInput.maxLength = 80;
    courseInput.value = remix ? suggestRemixName(this.doc.name) : this.doc.name;
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
    nameField.append(nameLabel, nameInput);
    body.append(nameField);
    const nameHelp = document.createElement('p');
    nameHelp.className = 'tb-help';
    nameHelp.textContent = nameRules();
    body.append(nameHelp);

    /*
     * WHAT THE TRACK IS FOR, which is the one thing about a published track
     * that nothing else on the board can work out.
     *
     * A gate count says how big it is and a plan drawing says what shape it
     * is, and neither says whether it was built to be raced, to practise
     * one thing, or to find out whether an idea works. That is the question
     * a visitor scrolling a board is actually asking, and only the author
     * can answer it.
     *
     * A CLOSED LIST OF BUTTONS, not a text field. Free text would give the
     * board "race", "racing", "Race Track" and "racetrack" as four separate
     * tags and no filter at all. The vocabulary is mirrored from the board
     * in src/share/board.js, and the board refuses an id it does not know
     * rather than dropping it, so a stale builder is told rather than
     * quietly ignored.
     *
     * Seeded from the BIND rather than from the document, because tags are
     * not in the document: see rememberPublish in src/share/listing.js.
     *
     * `held` is null when this browser does not know which tags the board
     * shows on this track, which is every track published before binds
     * kept them. An empty row means something different then: not "none",
     * but "not seen", and tagsToSend in src/share/listing.js sends no list
     * for it, so the board keeps what it has.
     */
    const held = publishedTags(this.doc.id);
    const chosen = new Set(usableTags(held));
    const tagField = document.createElement('div');
    tagField.className = 'tb-field';
    const tagLabelEl = document.createElement('label');
    tagLabelEl.className = 'tb-field-label';
    tagLabelEl.textContent = 'What it is for';
    const tagRow = document.createElement('div');
    tagRow.className = 'tb-tags';
    const tagHelp = document.createElement('p');
    tagHelp.className = 'tb-help';
    const sayTags = () => {
      if (chosen.size) {
        tagHelp.textContent = `${[...chosen].map(tagLabel).join(', ')}. People filter the board by these.`;
      } else if (owned && !Array.isArray(held)) {
        /* Said, because an empty row on a track that is already on the
         * board reads as "it has no tags", and here it only means this
         * browser never heard which it has. */
        tagHelp.textContent = 'This browser has no record of the tags this track wears on the board, so none are ticked. Leave them that way to keep whatever it wears, or tick some to replace them.';
      } else {
        tagHelp.textContent = `Optional, and up to ${TRACK_TAGS_MAX}. People filter the board by these, so a track with none is harder to find.`;
      }
    };
    for (const tag of TRACK_TAGS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tb-tag';
      btn.textContent = tag.label;
      btn.title = tag.note;
      btn.setAttribute('aria-pressed', chosen.has(tag.id) ? 'true' : 'false');
      btn.addEventListener('click', () => {
        if (chosen.has(tag.id)) {
          chosen.delete(tag.id);
        } else if (chosen.size >= TRACK_TAGS_MAX) {
          /* Refused rather than silently swapping one out, because a
           * control that quietly drops the thing you ticked first is worse
           * than one that says no. */
          tagHelp.textContent = `That is ${TRACK_TAGS_MAX} already. Untick one to add another.`;
          return;
        } else {
          chosen.add(tag.id);
        }
        btn.setAttribute('aria-pressed', chosen.has(tag.id) ? 'true' : 'false');
        sayTags();
      });
      tagRow.append(btn);
    }
    sayTags();
    tagField.append(tagLabelEl, tagRow);
    body.append(tagField, tagHelp);

    const boardField = document.createElement('div');
    boardField.className = 'tb-field';
    const boardLabel = document.createElement('label');
    boardLabel.className = 'tb-field-label';
    boardLabel.textContent = 'Board address';
    const boardInput = document.createElement('input');
    boardInput.type = 'url';
    boardInput.value = boardOrigin();
    boardField.append(boardLabel, boardInput);
    body.append(boardField);

    const status = document.createElement('p');
    status.className = 'tb-help';
    body.append(status);

    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'tb-btn tb-primary';
    send.textContent = owned ? 'Update the board' : (remix ? 'Publish as yours' : 'Publish this track');
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
      status.textContent = 'Sending the track, logos included.';
      /* A list, empty when the author unticked every tag they were shown,
       * or undefined to leave the board's alone. See tagsToSend. */
      const tags = tagsToSend(held, [...chosen]);
      const sendDoc = async (doc) => {
        const posted = await publishTrack({
          author,
          document: toPlain(doc),
          editKey: readEditKey(doc.id),
          origin,
          tags,
        });
        /* The bind is where the tags live on this side, and rememberPublish
         * keeps the board's own answer about them, so the next publish
         * pre-ticks what the board is showing rather than untagging the
         * track. See rememberPublish. */
        rememberPublish(toPlain(doc), posted, origin, author, { tags });
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
          const { copy, commit } = forkDocument(this.doc, {
            name: courseName,
            board: origin,
            sourceId: this.doc.id,
            sourceName: this.doc.name,
            sourceAuthor: '',
          });
          commit();
          this.loadDocument(copy, '');
          posted = await sendDoc(this.doc);
          status.textContent = `This id was already on the board, so it went up as a new track, "${posted.name}".`;
        }
        const cleared = posted.timesCleared
          ? ' The flying layout changed, so the old times were cleared.'
          : '';
        if (!status.textContent.startsWith('This id')) {
          status.textContent = `Published as "${posted.name}".${cleared}`;
        }
        this.toast(`Published "${posted.name}" to the board.`);
        /*
         * A ROOM'S CARD ON THE BOARD IS ITS ANIMATION, SO IT IS RENDERED
         * HERE, NOW.
         *
         * The board renders nothing and never will, so if this browser does
         * not make the picture nothing does. The moment after a publish is
         * the only moment when the document, the edit key and a live WebGL
         * context are all in one place, which is why it is here and not
         * behind a button the author would have to know to press.
         *
         * Only a room. A field track's plan is drawn by the board from the
         * listing for nothing, and the board refuses an animation for one
         * anyway. See inspectGif in the board's src/validate.js.
         */
        await this.renderCardForBoard(origin, status);
        await this.renderShareCardForBoard({
          kind: 'track', noun: 'track', origin, editKey: readEditKey(this.doc.id), status,
        });
        this.updateTopBar();
        const open = document.createElement('a');
        open.className = 'tb-btn tb-primary';
        /* The builder's class goes with the link, so an author on the
         * whoop builder lands on the whoop board. */
        open.href = boardPageUrl(origin, trackClassOf(this.doc) === 'micro' ? 'whoop65' : '5inch');
        /* The board's own tab, reused if it is already open. No rel here:
         * noopener would send this to a fresh tab every time. */
        open.target = BOARD_WINDOW;
        open.textContent = 'Open Tracks and Statistics';
        send.replaceWith(open);
      } catch (e) {
        send.disabled = false;
        status.textContent = e.message || 'The board could not take that track.';
        this.toast(`Could not publish: ${e.message || e}`);
      }
    });
    body.append(send);
    this.modal(owned ? 'Update this track' : (remix ? 'Publish as yours' : 'Publish this track'), body);
  }

  /*
   * PUT THIS MAP ON THE BOARD: the map's own Publish, beside the track's.
   *
   * Simpler than a track's, because less rides on it: no flying order to
   * require, no posted times a changed layout would clear, and no tags,
   * whose vocabulary is a race track's. Two shapes, a first publish and an
   * update of a map this browser put up, told apart by the map's own key
   * (readMapListing in src/share/session.js) and never by a track's.
   *
   * The document goes as it is, which is already a list of references with
   * their modifiers, sponsor prints included; the board keeps each print
   * once however many maps wear it. The drawing for its card goes beside
   * it, measured here by boardPlanOf, because the board does not know what
   * a piece looks like and is not meant to.
   */
  openPublishMap() {
    if (this.nameInput && this.nameInput.value) {
      this.doc.name = this.nameInput.value.trim() || 'Untitled map';
    }
    /* The board's own rule, asked here first so the author is told before
     * the request rather than by it: a label, the start and paint on the
     * ground are not pieces, and a map of nothing else is refused there.
     * See NOT_A_PIECE in the board's src/validate.js. */
    const standing = this.doc.elements.some((el) => {
      const kind = ELEMENTS[el.type] && ELEMENTS[el.type].kind;
      return kind && kind !== KIND.ANNOTATION && kind !== KIND.START && kind !== KIND.DECAL;
    });
    if (!standing) {
      this.toast('A published map needs at least one piece on it.');
      return;
    }
    this.autosaver.flush();
    const owned = Boolean(readMapListing(this.doc.id));
    const body = document.createElement('div');
    const help = document.createElement('p');
    help.className = 'tb-help';
    help.textContent = owned
      ? 'This map is already on the board. Updating it puts this version up in its place.'
      : 'The public board keeps a copy of this map, sponsor prints included, and draws its card from the pieces on it. Anybody can fly it from there.';
    body.append(help);

    const field = (label, input) => {
      const row = document.createElement('div');
      row.className = 'tb-field';
      const name = document.createElement('label');
      name.className = 'tb-field-label';
      name.textContent = label;
      row.append(name, input);
      body.append(row);
    };
    const mapInput = document.createElement('input');
    mapInput.type = 'text';
    mapInput.maxLength = 80;
    mapInput.value = this.doc.name;
    field('Map name', mapInput);
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 24;
    nameInput.value = readPilotName() || '';
    field('Your name', nameInput);
    const nameHelp = document.createElement('p');
    nameHelp.className = 'tb-help';
    nameHelp.textContent = nameRules();
    body.append(nameHelp);
    const boardInput = document.createElement('input');
    boardInput.type = 'url';
    boardInput.value = boardOrigin();
    field('Board address', boardInput);

    const status = document.createElement('p');
    status.className = 'tb-help';
    body.append(status);

    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'tb-btn tb-primary';
    send.textContent = owned ? 'Update the board' : 'Publish this map';
    send.addEventListener('click', async () => {
      const author = writePilotName(nameInput.value);
      if (!author) {
        status.textContent = nameRules();
        return;
      }
      const mapName = String(mapInput.value || '').trim() || 'Untitled map';
      this.doc.name = mapName;
      if (this.nameInput) {
        this.nameInput.value = mapName;
      }
      const origin = setBoardOrigin(boardInput.value) || boardOrigin();
      send.disabled = true;
      status.textContent = 'Sending the map, sponsor prints included.';
      const sendDoc = async (doc) => {
        const held = readMapListing(doc.id);
        const posted = await publishMap({
          author,
          document: toPlain(doc),
          plan: boardPlanOf(doc),
          editKey: held ? held.editKey : '',
          origin,
        });
        /* The key comes back on the first publish only, so an update keeps
         * the one already held. */
        writeMapListing(doc.id, {
          editKey: posted.editKey || (held && held.editKey) || '',
          board: origin,
          author,
          nameOnBoard: posted.name || doc.name,
        });
        writeAutosave(doc);
        return posted;
      };
      try {
        let posted;
        let forked = false;
        try {
          posted = await sendDoc(this.doc);
        } catch (e) {
          if (!e || !e.conflict) {
            throw e;
          }
          /* The id is on the board under a key this browser does not hold:
           * a map imported from a file somebody had already published. It
           * goes up as a new map under a new id, which is what a track does
           * in the same case, and the original stays theirs. */
          const copy = duplicateTrack(this.doc, mapName);
          this.loadDocument(copy, '');
          posted = await sendDoc(this.doc);
          forked = true;
        }
        const verb = posted.updated ? 'Updated' : 'Published';
        status.textContent = forked
          ? `This id was already on the board, so it went up as a new map, "${posted.name}".`
          : `${verb} as "${posted.name}".`;
        this.toast(`${verb} "${posted.name}" on the board.`);
        /* The board drops a map's share card on every republish, because
         * this is the only thing that republishes one, and it draws the
         * new card here. See publishMapUnlocked in the board's store.js. */
        const held = readMapListing(this.doc.id);
        await this.renderShareCardForBoard({
          kind: 'map', noun: 'map', origin, editKey: held ? held.editKey : '', status,
        });
        this.updateTopBar();
        const open = document.createElement('a');
        open.className = 'tb-btn tb-primary';
        /* Straight to the map's own sheet on the board's maps tab. */
        open.href = `${boardPageUrl(origin)}#map=${encodeURIComponent(posted.id)}`;
        /* The board's own tab, reused if it is already open. No rel here:
         * noopener would send this to a fresh tab every time. */
        open.target = BOARD_WINDOW;
        open.textContent = 'Open Tracks and Statistics';
        send.replaceWith(open);
      } catch (e) {
        send.disabled = false;
        status.textContent = e.message || 'The board could not take that map.';
        this.toast(`Could not publish: ${e.message || e}`);
      }
    });
    body.append(send);
    this.modal(owned ? 'Update this map' : 'Publish this map', body);
  }

  /* ---------------- the sponsors' logos ---------------- */

  /*
   * The pictures this course is dressed in: up to five of them.
   *
   * A dialog rather than a field in the inspector, and the reason is what
   * they belong to: a logo is a property of the TRACK, not of any element on
   * it, so putting them beside a gate's dimensions would say the opposite.
   * The inspector's Field section is the other candidate and it is where a
   * field width lives, but that panel is only reachable with nothing
   * selected, which is not where somebody who has just placed ten gates is.
   *
   * FIVE SLOTS, NUMBERED, and the numbers are load bearing. Gate 1 wears
   * logo 1, gate 2 logo 2, round and round, so fifteen gates share five
   * sponsors three apiece; the inspector's picker for a painted footprint
   * counts in the same numbers; and the line under the list says what that
   * works out as for THIS course rather than leaving an author to divide.
   *
   * THE PREVIEWS ARE THE POINT OF THE DIALOG. Uploading an image and then
   * having to load a world to find out it came out square, or too small to
   * read, or half off the board, is the version of this feature nobody would
   * use twice. Each slot shows the gate header it lands on and the grass it
   * lands on, because those are two different shapes and a logo can suit one
   * and not the other.
   *
   * PAINT ON THE GRASS IS A BUTTON HERE, and it is here because it was
   * nowhere. Putting a logo on the turf meant knowing that the palette's
   * Ground logo was the thing that did it, which is a name you only
   * recognise once somebody has told you. The grass preview sitting in this
   * dialog beside every logo made that worse rather than better: it showed
   * an author what paint would look like and then left them no way to ask
   * for any. The button arms the same palette tool with this logo already
   * chosen, so the next click on the field is the decal.
   */
  openLogo() {
    const body = document.createElement('div');
    const help = document.createElement('p');
    help.className = 'tb-help';
    help.textContent = 'Up to five sponsors\u2019 logos. They are dealt out round the gates in flying order, so each sponsor gets a share of the boards, the upright banners and the flags, spread down the lap rather than bunched at the start. Any of them can also be painted on the grass: press Paint on the grass under it, then click the field. They travel inside the track file, so a track you send somebody arrives with its branding on.';
    body.append(help);

    const list = document.createElement('div');
    body.append(list);

    const summary = document.createElement('p');
    summary.className = 'tb-help';
    body.append(summary);

    /* One image element per data URL, reused across redraws, so repainting
     * the list after a change does not start five fresh decodes. */
    const images = new Map();
    const imageFor = (url, onLoad) => {
      let img = images.get(url);
      if (!img) {
        img = new Image();
        images.set(url, img);
        img.addEventListener('load', onLoad);
        img.src = url;
        return img;
      }
      /* Already asked for, but not decoded yet, and this redraw's canvases
       * still need telling. Two slots holding the same file is the case: one
       * decode, two previews waiting on it. */
      if (!img.complete) {
        img.addEventListener('load', onLoad);
      }
      return img;
    };

    /* One file input, pointed at whichever slot asked for it. Five inputs
     * would be five change handlers disagreeing about which slot they are. */
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
    file.style.display = 'none';
    let target = -1;
    body.append(file);

    const redraw = () => {
      list.textContent = '';
      const logos = logosOf(this.doc);
      const spent = brandingBytes(this.doc);
      for (let i = 0; i < LOGO_SLOTS; i += 1) {
        const mark = logos[i] ?? null;
        const row = document.createElement('div');
        row.className = mark ? 'tb-slot' : 'tb-slot empty';
        const num = document.createElement('span');
        num.className = 'tb-num';
        num.textContent = String(i + 1);
        const slot = document.createElement('div');
        slot.className = 'tb-slot-body';
        row.append(num, slot);
        /*
         * In the document BEFORE anything is painted into it. Both preview
         * painters size their bitmap from the canvas's clientWidth, and a
         * canvas that is not laid out yet reports zero: the previews came
         * out at the fallback width and were then stretched by the CSS,
         * which is a blurry picture of somebody's logo in the one dialog
         * whose whole job is showing it sharply.
         */
        list.append(row);

        if (!mark) {
          const note = document.createElement('p');
          note.className = 'tb-help';
          note.textContent = i === logos.length
            ? 'Empty. Add a logo here and the gates start sharing it.'
            : 'Empty.';
          slot.append(note);
          if (i === logos.length) {
            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'tb-btn';
            add.textContent = 'Add a logo';
            add.addEventListener('click', () => { target = i; file.click(); });
            const btns = document.createElement('div');
            btns.className = 'tb-row-btns';
            btns.append(add);
            slot.append(btns);
          }
          continue;
        }

        /* The two places a logo lands, side by side, because they are two
         * different shapes: a long strip on the gate's header board and a
         * rectangle on the grass. A logo can suit one and not the other. */
        const arts = document.createElement('div');
        arts.className = 'tb-slot-arts';
        const board = document.createElement('canvas');
        board.className = 'tb-logo-preview slot';
        const grass = document.createElement('canvas');
        grass.className = 'tb-ground-preview';
        arts.append(board, grass);
        slot.append(arts);
        /* The grass preview is drawn at the footprint a Ground logo is
         * PLACED with, from the element library, so what an author judges
         * here is the box they will actually get. */
        const foot = ELEMENTS.groundLogo.dims;
        const draw = () => {
          drawBannerPreview(board, mark.image, img);
          drawGroundPreview(grass, img, foot.width, foot.depth);
        };
        const img = imageFor(mark.image, draw);
        draw();

        const caption = document.createElement('p');
        caption.className = 'tb-help';
        caption.textContent = `${mark.name || `Logo ${i + 1}`}, ${Math.round(mark.image.length / 1024)} kB, stored in the track.`;
        slot.append(caption);

        const btns = document.createElement('div');
        btns.className = 'tb-row-btns';
        const swap = document.createElement('button');
        swap.type = 'button';
        swap.className = 'tb-btn';
        swap.textContent = 'Replace';
        swap.addEventListener('click', () => { target = i; file.click(); });
        /*
         * The one route from a logo to paint on the field. It arms the
         * palette's Ground logo with THIS slot's id and shuts the dialog,
         * because a modal over the canvas cannot be clicked through and the
         * next thing an author has to do is click the canvas.
         */
        const paint = document.createElement('button');
        paint.type = 'button';
        paint.className = 'tb-btn';
        paint.textContent = 'Paint on the grass';
        paint.title = 'Put this logo on the turf: click the field where you want it';
        paint.addEventListener('click', () => {
          this.armGroundLogo(mark.id);
          this.closeModal();
        });
        const drop = document.createElement('button');
        drop.type = 'button';
        drop.className = 'tb-btn tb-danger';
        drop.textContent = 'Remove';
        drop.addEventListener('click', () => {
          this.edit('remove logo', (d) => {
            d.branding.logos.splice(i, 1);
          });
          redraw();
          this.toast('Logo removed. Any grass painted with it now shows nothing until you pick another.');
        });
        btns.append(swap, paint, drop);
        slot.append(btns);
      }

      /*
       * What the list works out to on THIS course, which is the question an
       * author actually has: not "how many logos are there" but "how many
       * gates does each sponsor get".
       */
      const gates = dressOrder(this.doc).size;
      const n = logos.length;
      const left = Math.max(0, BRANDING_MAX_CHARS - spent);
      const budget = `${Math.round(spent / 1024)} kB of ${Math.round(BRANDING_MAX_CHARS / 1024)} kB used, ${Math.round(left / 1024)} kB left.`;
      if (!n) {
        summary.textContent = `No logos yet. The gates carry a chequered flag device and their number. ${budget}`;
      } else if (!gates) {
        summary.textContent = `Nothing is in the flying order yet, so nothing is wearing them. ${budget}`;
      } else {
        const base = Math.floor(gates / n);
        const extra = gates % n;
        const share = extra === 0
          ? `${base} gate${base === 1 ? '' : 's'} each`
          : `${base + 1} gates for the first ${extra}, ${base} for the rest`;
        summary.textContent = `${gates} gate${gates === 1 ? '' : 's'} in the flying order, ${n} logo${n === 1 ? '' : 's'}: ${share}. ${budget}`;
      }
    };

    file.addEventListener('change', async () => {
      const chosen = file.files[0];
      const slot = target;
      file.value = '';
      target = -1;
      if (!chosen || slot < 0) {
        return;
      }
      const logos = logosOf(this.doc);
      /* Replacing a slot gets its own bytes back before it is asked to fit,
       * so swapping a 90 kB logo for another 90 kB logo is never refused for
       * a budget the logo it is replacing was spending. */
      const freed = logos[slot] ? logos[slot].image.length : 0;
      const budget = BRANDING_MAX_CHARS - brandingBytes(this.doc) + freed;
      try {
        const logo = await normaliseLogo(chosen, budget);
        this.edit(logos[slot] ? 'replace logo' : 'add logo', (d) => {
          const list2 = d.branding.logos;
          if (list2[slot]) {
            /* The id survives a replacement, so a footprint painted on the
             * grass keeps pointing at this slot rather than going blank
             * because the sponsor sent a new file. */
            list2[slot].image = logo.dataUrl;
            list2[slot].name = logo.name;
          } else {
            list2.push({ id: newLogoId(d), image: logo.dataUrl, name: logo.name });
          }
        });
        redraw();
        this.toast(`Logo ${slot + 1} set from ${logo.name}, ${logo.width} by ${logo.height}.`);
      } catch (e) {
        this.toast(`Could not use that image: ${e.message}`);
      }
    });

    this.modal('Sponsor logos', body);
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
    this.pruneActiveNode();
    this.keepPickedSide();
  }

  /* ---------------- chrome ---------------- */

  /*
   * MOVE THE WHOLE PRODUCT TO A CLASS.
   *
   * Nothing is converted and nothing is lost. Each class has its own canvas,
   * so this puts the current one away, seats the aircraft that flies the
   * other, and opens whatever was left there, or a blank track of that class
   * on a first visit.
   *
   * Converting was the alternative and it is worse in both directions: a 5 ft
   * gate scaled to 28 inches is not a RaceGOW gate, it is a MultiGP gate
   * somebody shrank, and a room's layout stretched onto sixty metres is a
   * track nobody designed. Two canvases is what an author actually has.
   */
  setTrackClass(cls) {
    this.setCanvas(cls === 'micro' ? 'micro' : 'full');
  }

  /*
   * The same move for any of the three canvases. A map seats the five inch,
   * exactly as the 5 inch button does, because that is what flies it.
   */
  setCanvas(canvas) {
    const want = canvas === 'freestyle' || canvas === 'micro' ? canvas : 'full';
    if (canvasOf(this.doc) === want) {
      return;
    }
    const cls = want === 'micro' ? 'micro' : 'full';
    const mode = want === 'freestyle' ? 'freestyle' : 'race';
    /* The canvas being left is written NOW rather than on the debounce, so
     * the last few seconds of editing are still there on the way back. */
    this.autosaver.flush();
    setActiveTrackClass(cls);
    /* readAutosave hands back { doc, repairs }, not a document: every other
     * caller in this project reads `.doc` off it and the first version of
     * this one did not, which threw inside loadDocument on the first press
     * of the toggle. */
    const held = readAutosave(cls, mode);
    const doc = (held && held.doc) || (mode === 'freestyle' ? newMap() : createTrack(undefined, cls));
    const name = CANVAS_NAMES[want];
    const fresh = {
      full: 'five inch track, on a sixty metre field',
      micro: 'whoop track, in a ten by twelve metre hall',
      freestyle: 'freestyle map, on a 160 metre plot. Place buildings, cranes and a skate set, then fly it',
    }[want];
    this.loadDocument(doc, held && held.doc
      ? `Back on the ${name} builder, holding "${doc.name}".`
      : `A new ${fresh}.`);
  }

  /*
   * THE CHOOSER: the three canvases as the gate's three picture cards, over
   * the whole page, on arrival. See asksCanvas for when, and CHOICES for why
   * these cards.
   *
   * A card does exactly what the switch in the bar does, through the same
   * setCanvas, so nothing is converted and nothing is lost: each canvas is
   * its own seat. The switch stays where it was, and when the chooser closes
   * the switch is pointed at, so the way back is seen once rather than
   * found later.
   *
   * The cursor is the keyboard focus, drawn as the gate draws its cursor: a
   * sakura ring and a sakura name. It opens on the canvas already behind
   * the chooser, which is the one the builder reopened on, the way the
   * gate's cursor opens on the seated aircraft's card. Enter keeps it, and
   * so do Escape, Close and a click outside: closing is an answer too, and
   * it is "the one behind".
   *
   * Real buttons, not the gate's role=button divs. The gate's Enter is its
   * own handler's; here Enter and Space are the browser's, and the page's
   * keys are held while the chooser is up (see bindKeys), so nothing behind
   * it arms a tool or flips the view.
   */
  openChooser() {
    const now = canvasOf(this.doc);
    const body = document.createElement('div');
    const lede = document.createElement('p');
    lede.className = 'tb-help tb-choose-lede';
    lede.textContent = 'Each keeps its own work, so nothing is lost by picking. The 5 inch, Whoop and Freestyle switch at the top left moves between them any time.';
    const grid = document.createElement('div');
    grid.className = 'tb-choose';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'Which builder');
    let current = null;
    for (const c of CHOICES) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'tb-choose-card';
      card.dataset.canvas = c.canvas;
      const art = document.createElement('span');
      art.className = 'tb-choose-art';
      const img = document.createElement('img');
      img.className = 'tb-choose-shot';
      img.src = c.art;
      /* The name is right under it. */
      img.alt = '';
      img.decoding = 'async';
      art.append(img);
      const text = document.createElement('span');
      text.className = 'tb-choose-body';
      const name = document.createElement('span');
      name.className = 'tb-choose-name';
      name.textContent = c.label;
      const blurb = document.createElement('span');
      blurb.className = 'tb-choose-blurb';
      blurb.textContent = c.blurb;
      const facts = document.createElement('span');
      facts.className = 'tb-choose-facts';
      for (const f of c.facts) {
        const fact = document.createElement('span');
        fact.className = 'tb-choose-fact';
        fact.textContent = f;
        facts.append(fact);
      }
      text.append(name, blurb, facts);
      card.append(art, text);
      if (c.canvas === now) {
        card.setAttribute('aria-current', 'true');
        current = card;
      }
      card.addEventListener('click', () => this.chooseCanvas(c.canvas));
      /* The ring is the cursor, as on the gate, and the cursor follows the
       * pointer there, so it does here: the card under the pointer takes
       * the focus and the ring with it, and there is never one card ringed
       * while another is about to be picked. */
      card.addEventListener('pointerenter', () => card.focus({ preventScroll: true }));
      grid.append(card);
    }
    /* Arrows walk the cards, as they walk the gate's. */
    grid.addEventListener('keydown', (e) => {
      const cards = [...grid.querySelectorAll('.tb-choose-card')];
      const at = cards.indexOf(document.activeElement);
      if (at < 0) {
        return;
      }
      const to = {
        ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1,
        Home: 0, End: cards.length - 1,
      }[e.key];
      if (to === undefined) {
        return;
      }
      e.preventDefault();
      cards[Math.max(0, Math.min(cards.length - 1, to))].focus();
    });
    body.append(lede, grid);
    this.modal('What are you building?', body, [], { cls: 'tb-chooser' });
    this.afterModal = () => this.pointAtSwitch();
    (current || grid.querySelector('.tb-choose-card')).focus();
  }

  /* Whether the chooser is the dialog that is up. */
  choosing() {
    return !this.nodes.modal.hidden && Boolean(this.nodes.modal.querySelector('.tb-choose'));
  }

  chooseCanvas(canvas) {
    this.closeModal();
    this.setCanvas(canvas);
  }

  /* Two sakura pulses round the switch in the bar, which is the way back to
   * the other canvases once the chooser has gone. Reduced motion flattens
   * them to nothing, like every other animation here. */
  pointAtSwitch() {
    const t = this.classToggle;
    if (!t) {
      return;
    }
    t.classList.remove('tb-class-hint');
    /* A read of the layout between the two, so a second chooser in one
     * session pulses again rather than finding the class already there. */
    void t.offsetWidth;
    t.classList.add('tb-class-hint');
    t.addEventListener('animationend', () => t.classList.remove('tb-class-hint'), { once: true });
  }

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
     * the thing to press. Show line goes amber while a line is showing,
     * which is the state that matters. */
    /* The line is derived on every edit now, so this only paints it. */
    this.pathBtn = btn('Show line', () => this.togglePath(), 'Draw the racing line on the canvas');
    this.labelsBtn = btn('Labels', () => this.toggleLabels(), 'Flying-order numbers on the gates. Turn them off to see the racing line.');

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
    this.flyBtn = btn('Fly this track', () => this.flyThisTrack(), 'Build the world around this track and fly it', 'tb-btn tb-primary');
    this.publishBtn = btn('Publish', () => this.openPublish(), 'Put this track on the public board, logos and all');
    this.listingChip = document.createElement('span');
    this.listingChip.className = 'tb-listing';

    const back = document.createElement('a');
    back.className = 'tb-btn tb-quiet';
    back.href = '../../index.html';
    back.textContent = 'Back to the simulator';

    /*
     * THREE ZONES, NOT SEVENTEEN BUTTONS.
     *
     * This bar was one flat row of seventeen controls at a single weight,
     * which wrapped, so on any normal window Publish and Fly this track,
     * the two things this whole tool exists to reach, landed on a second
     * row while Duplicate sat on the first. The zones are what the buttons
     * already were: what the course IS (file), what you are doing to it
     * (canvas), and where it goes (publish and fly).
     *
     * The file zone's rarely used half sits behind More, so Import, Export,
     * Duplicate and Delete stop competing with Save. Delete asks first: it
     * used to sit inline beside Save and remove a course on one click.
     */
    this.moreWrap = document.createElement('div');
    this.moreWrap.className = 'tb-more';
    this.moreBtn = btn('More', () => this.toggleMore(), 'Import, export, duplicate, delete');
    this.moreMenu = document.createElement('div');
    this.moreMenu.className = 'tb-more-menu';
    this.moreMenu.hidden = true;
    /* Kept by name, because a map words them differently and has no lap to
     * animate. */
    this.moreItems = new Map();
    for (const [id, label, fn, title, cls] of [
      ['duplicate', 'Duplicate', () => this.duplicate(), 'Copy this track under a new name', ''],
      ['import', 'Import', () => file.click(), 'Read a .json track file', ''],
      ['export', 'Export', () => this.exportFile(), 'Write a .json track file', ''],
      ['animation', 'Export animation', () => this.exportAnimation(), 'Write a looping .gif of one lap', ''],
      ['delete', 'Delete', () => this.confirmRemove(), 'Remove this track from this browser', 'tb-danger'],
    ]) {
      const b = btn(label, () => { this.closeMore(); fn(); }, title, `tb-more-item ${cls}`.trim());
      this.moreItems.set(id, b);
      this.moreMenu.append(b);
    }
    this.moreWrap.append(this.moreBtn, this.moreMenu);
    document.addEventListener('mousedown', (e) => {
      if (this.moreWrap && !this.moreWrap.contains(e.target)) {
        this.closeMore();
      }
    });

    /*
     * THE CLASS TOGGLE, AND IT IS THE FIRST THING ON THE BAR.
     *
     * These are two different tools. A five inch builder is 5 ft gates on a
     * sixty metre field with a grid in metres; a whoop builder is 28 inch
     * gates out of 26.7 mm PVC on a five by six metre floor with a grid in
     * inches, a different palette, different presets and RaceGOW's own rules
     * checking the layout. Everything on this page changes with it, so it
     * cannot be a line of read only text in a side panel where it was: an
     * author who opened the wrong one found out several gates in.
     *
     * It is also the SAME switch the simulator's aircraft choice is, and
     * pressing it here seats that aircraft. That is the whole point: one
     * answer governs the builder, the world behind the title, the track the
     * shell flies and the tracks the board offers.
     *
     * Each class keeps its own canvas, so this never destroys work: the
     * track you were building is still there when you come back. See
     * autosaveKey in storage.js.
     */
    this.classToggle = document.createElement('div');
    this.classToggle.className = 'tb-class';
    this.classToggle.setAttribute('role', 'group');
    this.classToggle.setAttribute('aria-label', 'Which builder');
    this.classBtns = new Map();
    /*
     * THE THIRD CANVAS IS A MAP, not a third class. It is flown on the five
     * inch, so choosing it seats the five inch exactly as the first button
     * does; what it changes is what the document IS: a place made of
     * assets, with no flying order through it.
     */
    for (const [canvas, label, hint] of [
      ['full', '5 inch', 'MultiGP gates on a sixty metre field'],
      ['micro', 'Whoop', 'RaceGOW gates in a ten by twelve metre hall'],
      ['freestyle', 'Freestyle', 'Your own freestyle map: buildings, cranes, a skate set and named gaps on a 160 metre plot, flown on the five inch'],
    ]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tb-class-btn';
      b.textContent = label;
      b.title = hint;
      b.addEventListener('click', () => this.setCanvas(canvas));
      this.classBtns.set(canvas, b);
      this.classToggle.append(b);
    }

    const zoneFile = document.createElement('div');
    zoneFile.className = 'tb-zone tb-zone-file';
    zoneFile.append(
      Object.assign(document.createElement('span'), { className: 'tb-title', textContent: 'Track Builder' }),
      this.classToggle,
      name,
      group(
        (this.newBtn = btn('New', () => this.newTrack(), 'Start a blank track')),
        btn('Save', () => this.save(), 'Control S'),
        (this.loadBtn = btn('Load', () => this.openLoad(), 'Open a saved track')),
      ),
      this.moreWrap,
    );

    const zoneEdit = document.createElement('div');
    zoneEdit.className = 'tb-zone tb-zone-edit';
    zoneEdit.append(
      group(this.undoBtn, this.redoBtn),
      group(this.mode2d, this.mode3d),
      group(
        btn('Fit', () => this.frameAll(), 'Frame the whole field'),
        this.pathBtn,
        this.labelsBtn,
        btn('Sponsor logos', () => this.openLogo(), 'Up to five sponsors\u2019 logos, shared out over the gates, the flags and the grass'),
      ),
    );

    const zoneOut = document.createElement('div');
    zoneOut.className = 'tb-zone tb-zone-out';
    /* The listing chip moved here from beside the track name. It says
     * whether this track is on the board, which is the question the button
     * next to it answers, and the file zone needed the 130 px once the class
     * toggle joined it. */
    zoneOut.append(this.listingChip, this.publishBtn, this.flyBtn, back);

    bar.append(zoneFile, zoneEdit, zoneOut, file);
    /* On the keep strip, not in the toolbar. The toolbar is already the
     * width of its three zones, and a pill in it cuts the last edit button. */
    const keep = document.getElementById('tb-keep');
    if (keep) {
      keep.append(patreonAnchor());
    }
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
    const map = docModeOf(this.doc) === 'freestyle';
    if (this.classBtns) {
      const canvas = canvasOf(this.doc);
      for (const [id, b] of this.classBtns) {
        b.classList.toggle('on', id === canvas);
        b.setAttribute('aria-pressed', id === canvas ? 'true' : 'false');
      }
    }
    this.pathBtn.classList.toggle('on', this.pathVisible);
    this.labelsBtn.classList.toggle('on', this.labelsVisible);
    /*
     * A MAP'S BAR. No line to show, no lap to animate, and nothing the board
     * can take yet, so those go or say why; the words that said "track" say
     * "map". Everything else on the bar works on a map as it does on a
     * track. A map has no flying order and so no numbers, but it has names:
     * the named gaps' labels in both views and the names on the plan, and
     * Labels puts those away so the map can be seen. The selected element
     * keeps its name, and a car off its road keeps its warning.
     */
    this.pathBtn.style.display = map ? 'none' : '';
    this.labelsBtn.title = map
      ? 'The named gaps\u2019 labels and the names on the plan. Turn them off to see the map.'
      : 'Flying-order numbers on the gates. Turn them off to see the racing line.';
    document.body.classList.toggle('tb-map', map);
    /* The status bar's hints for the 3D view's own gestures. */
    document.body.classList.toggle('tb-in-3d', this.mode === '3d');
    this.flyBtn.textContent = map ? 'Fly this map' : 'Fly this track';
    this.flyBtn.title = map
      ? 'Build this map in the town\u2019s style and fly it on the five inch'
      : 'Build the world around this track and fly it';
    this.newBtn.title = map ? 'Start a blank map' : 'Start a blank track';
    this.loadBtn.title = map ? 'Open a saved map' : 'Open a saved track';
    if (this.moreItems) {
      const noun = map ? 'map' : 'track';
      this.moreItems.get('duplicate').title = `Copy this ${noun} under a new name`;
      this.moreItems.get('import').title = `Read a .json ${noun} file`;
      this.moreItems.get('export').title = `Write a .json ${noun} file`;
      this.moreItems.get('delete').title = `Remove this ${noun} from this browser`;
      this.moreItems.get('animation').style.display = map ? 'none' : '';
    }
    if (map && this.listingChip && this.publishBtn) {
      /* A map's listing is its own key, and there is no chip for it: the
       * button's word says whether this map is on the board. */
      const listed = Boolean(readMapListing(this.doc.id));
      this.listingChip.style.display = 'none';
      this.publishBtn.textContent = listed ? 'Update board' : 'Publish';
      this.publishBtn.title = listed
        ? 'This map is on the public board. Send this version up in its place.'
        : PUBLISH_MAP_TITLE;
      this.publishBtn.classList.remove('tb-off');
      this.publishBtn.removeAttribute('aria-disabled');
    } else if (this.listingChip && this.publishBtn) {
      this.listingChip.style.display = '';
      this.publishBtn.classList.remove('tb-off');
      this.publishBtn.removeAttribute('aria-disabled');
    }
    if (!map && this.listingChip && this.publishBtn) {
      const listing = this.listingOfCanvas();
      /* The words come from courseChip in src/share/listing.js, which is
       * also what the simulator's course cards read, so the same course
       * cannot be described one way here and another way there. */
      const chip = courseChip(listing);
      this.listingChip.className = 'tb-listing';
      this.listingChip.textContent = chip.label;
      this.listingChip.title = chip.note;
      if (chip.tone === 'live') {
        this.listingChip.classList.add('owned');
      } else if (chip.tone === 'warn') {
        this.listingChip.classList.add('remix');
      }
      if (listing.kind === 'owned') {
        this.publishBtn.textContent = listing.canUpdateListing ? 'Update board' : 'On the board';
        this.publishBtn.title = listing.layoutDrift
          ? 'The layout changed. Updating the board will clear posted times.'
          : 'This track is on the public board. A rename updates the listing.';
      } else if (listing.kind === 'remix') {
        this.publishBtn.textContent = 'Publish as yours';
        this.publishBtn.title = 'Put this copy on the board under a new name. The original stays.';
      } else {
        this.publishBtn.textContent = 'Publish';
        this.publishBtn.title = 'Put this track on the public board, logos and all';
      }
    }
    this.fitTopBar();
  }

  /*
   * THE BAR WRAPS WHEN ITS ZONES DO NOT FIT, MEASURED RATHER THAN GUESSED.
   *
   * The 1330 px media query gives the canvas zone its own row on a small
   * laptop. Above it the three zones shared one row whatever they held, and
   * on the race canvas they need about 1944 px: at 1440 and 1600 Undo, Redo,
   * 2D, Labels and Sponsor logos sat clipped under the file and outgoing
   * zones, and at 1920 Undo and Sponsor logos were still cut, because a
   * centred row that overflows spills off BOTH ends and a scroller cannot
   * reach the left one. A breakpoint cannot know the width: the bar's words
   * change with the canvas, the listing and the button labels. So this sums
   * what the zones hold and puts .tb-bar-wrap on the bar when the sum is
   * wider than the bar, which is the 1330 layout. Called when the bar's
   * words change and on resize; nothing per frame.
   */
  fitTopBar() {
    const bar = this.nodes.topbar;
    const zones = bar ? [...bar.children].filter((z) => z.classList.contains('tb-zone')) : [];
    if (zones.length !== 3) {
      return;
    }
    /* Measured on one row, as it would be drawn unwrapped: the wrapped bar
     * is tightened, and judging from that would flip it back and forth. */
    bar.classList.remove('tb-bar-wrap');
    const px = (v) => parseFloat(v) || 0;
    const content = (z) => {
      const kids = [...z.children].filter((k) => k.getBoundingClientRect().width > 0);
      const gap = px(getComputedStyle(z).columnGap);
      return kids.reduce((sum, k) => sum + k.getBoundingClientRect().width, 0)
        + gap * Math.max(0, kids.length - 1);
    };
    const cs = getComputedStyle(bar);
    /* The one row's gap, not the wrapped bar's, and the edit zone's 12 px
     * fade at each end, which would otherwise dim a button that only just
     * fits. */
    const rowGap = px(cs.getPropertyValue('--s5'));
    const need = zones.reduce((sum, z) => sum + content(z), 0)
      + rowGap * (zones.length - 1)
      + px(cs.paddingLeft) + px(cs.paddingRight)
      + 24;
    bar.classList.toggle('tb-bar-wrap', need > bar.clientWidth);
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
    /*
     * A MAP FLIES AS THE BUILT MAP, which the simulator reads from the map's
     * own autosave seat, so it is flushed again here, after the name is
     * taken from the field. There is no board listing to bind, because the
     * board does not take maps.
     */
    if (docModeOf(this.doc) === 'freestyle') {
      this.autosaver.flush();
      setActiveTrackClass('full');
      /* The map, the aircraft and fly=1: the simulator's gate opens every
       * visit unless the link names both what and which aircraft, and
       * fly=1 takes the title's Fly press too, so this press is the one
       * that puts the pilot in the air. See linkedFly in src/ui/ui.js. */
      window.location.href = '../../index.html?map=built&craft=5inch&fly=1';
      return;
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
    /*
     * The same three answers as a map's link: the track, the aircraft its
     * class is built for, and fly=1. Without them the pilot landed on the
     * title and had to press Fly and then Go to reach the grid, for a
     * track they had just asked to fly. The owner's report on 2026-09-26:
     * Fly this track should go straight to the starting blocks.
     */
    const craft = trackClassOf(this.doc) === 'micro' ? 'whoop65' : '5inch';
    window.location.href = `../../index.html?map=custom&craft=${craft}&fly=1`;
  }

  toast(message) {
    const node = this.nodes.toast;
    node.textContent = message;
    node.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => node.classList.remove('on'), 4200);
  }

  /* `opts.cls` adds a class to the box, for a dialog that needs its own
   * width: the chooser is three picture cards across, not a column. */
  modal(title, body, actions = [], opts = {}) {
    const back = this.nodes.modal;
    back.textContent = '';
    back.hidden = false;
    /* A new dialog replaces the old one's content without closing it, so
     * whatever the old one wanted run on close no longer applies. */
    this.afterModal = null;
    const box = document.createElement('div');
    box.className = opts.cls ? `tb-modal ${opts.cls}` : 'tb-modal';
    /* Said to a screen reader as what it is: a dialog, named by its title,
     * with the page behind it out of reach until it closes. */
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', title);
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
    /* The backdrop click handler is bound ONCE, in the constructor. It used
     * to be registered per open with { once: true }, which only removes
     * itself when it fires: closing with a button left it attached, so a
     * session that opened five modals through their buttons carried five
     * handlers on a node that is reused. The e.target check already makes
     * it harmless while the modal is hidden. */
  }

  bindModalBackdrop() {
    const back = this.nodes.modal;
    back.addEventListener('click', (e) => {
      if (e.target === back && !back.hidden) {
        this.closeModal();
      }
    });
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
    const after = this.afterModal;
    this.afterModal = null;
    if (after) {
      after();
    }
  }

  /* ---------------- keyboard ---------------- */

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) {
        return;
      }
      /* The chooser is a question, and nothing behind it moves while it is
       * asked. It opens before the author has touched anything, so a first
       * key pressed at it (G for a gate, V for the 3D view, Delete) would
       * otherwise land on a canvas they have not chosen yet. Its own keys,
       * the arrows, Enter and Space, are handled on its cards. */
      if (this.choosing()) {
        if (e.key === 'Escape') {
          this.closeModal();
        }
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

      /* A road being laid: Enter finishes it open, Escape puts it away and
       * leaves the tool armed, and Backspace takes back the last node. */
      if (this.roadDraft && this.nodes.modal.hidden) {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.finishDraft(false);
          return;
        }
        if (e.key === 'Escape') {
          this.cancelDraft();
          return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          this.undoDraftNode();
          return;
        }
      }
      if (e.key === 'Escape') {
        if (!this.nodes.modal.hidden) {
          this.closeModal();
        } else if (this.armed) {
          this.disarm();
        } else if (this.clearPickedSide()) {
          /* Let go of the picked pipe and keep the gate selected. */
        } else {
          this.setSelection([]);
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        /* A picked node of the selected road goes, not the road; a picked
         * pipe goes on its own; otherwise the selection goes. */
        this.pruneActiveNode();
        if (this.activeNode) {
          this.deleteRoadNode(this.activeNode.id, this.activeNode.index);
          return;
        }
        if (this.pickedSide) {
          this.removePickedSide();
        } else {
          this.deleteSelection();
        }
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

      /* The palette's own keys: a map's are not a track's. */
      const def = elementByKey(e.key, trackClassOf(this.doc), docModeOf(this.doc));
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
        /* A road turns by its nodes and a vehicle by its road. */
        if (element && ![KIND.ANNOTATION, KIND.ROAD, KIND.VEHICLE].includes(kindOf(element))) {
          /* A building steps a whole quarter turn, from wherever the
           * compass has it, rather than fifteen degrees it cannot hold. */
          if (turnsOf(element.type) === 'quarter') {
            setYaw(d, id, snapYaw(element.type, snapYaw(element.type, element.yaw) + Math.sign(degrees) * QUARTER_TURN));
          } else {
            /* From where a marker's square sits, not its stored yaw: see
             * shownYaw. Everything else, shownYaw returns its own yaw. */
            setYaw(d, id, this.shownYaw(element) + degrees * RAD);
          }
        }
      }
    });
    for (const id of this.selection) {
      this.rememberYaw(elementById(this.doc, id));
    }
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
