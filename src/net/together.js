/*
 * together.js: flying together, as the pilot sees it.
 *
 * Stages 3 to 6 of the multiplayer plan the owner approved on 25 October
 * 2026 ("start the build"), drawn from the mockup approved the same day
 * (project files multiplayer/mockup). The wire is src/net/room.js and
 * src/net/link.js; the craft are src/render/roomcraft.js; this is every
 * sheet, card and line a pilot meets on the way into a room and in it:
 *
 *   getting in    the Rooms shelf (the lobby), Fly together's host sheet,
 *                 the invite sheet, the join card a link opens, the
 *                 password card, the connecting card and every way a join
 *                 can fail, each said by a face with a next step
 *   you           meet your avatar once, and change its look any time
 *   in flight     the room's chip, banners, the comic dialogue and its log,
 *                 quick chat (1 to 6 say a line, 7 waves, Q the strip), the
 *                 pilots list (Tab), the proximity hello
 *   paused        the room's page: its pilots and what can be done about
 *                 one (mute, report, and for the host make host, kick,
 *                 ban), talking, inviting, the room's settings, leaving
 *   racing        the pit, the countdown, place and standings, results
 *
 * THE RULES THIS FILE KEEPS, from the plan. A solo flight is never entered:
 * nothing here runs until the pilot presses Fly together or the Rooms tab,
 * or opens a room's link, and a link only ever shows "Join this room?"
 * (src/net/roomlinks.js). Nothing here reaches the physics: it reads where
 * the craft is through the shell and asks the shell to pause, resume, fly
 * or put the craft on the grid, the same things a menu press does.
 *
 * DRIVEN WITHOUT A POINTER. Every sheet is buttons and fields, and the
 * arrows, a pad or a radio move to the nearest one in that direction
 * (moveFocus), Enter or the pad's select presses, Escape or back goes back.
 * A text field on a pad or a radio opens the game's own keyboard. While a
 * sheet is up it has the keys and the pad (wantsPad), and a sheet opened
 * in flight pauses the flight, so a stick that is still being held cannot
 * fly the quad into a wall behind it.
 *
 * COST. The sheets are DOM, built when they open and gone when they close.
 * In flight the overlays change only when something happens: a line said,
 * a pilot arriving, a race moving on. The one thing that runs every frame
 * is frame(), which is a few comparisons unless a countdown is on.
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

import { RoomSession } from './room.js';
import { ROOM_MAX, STREAM_MAX, roomsUrl } from './link.js';
import { RoomRace, RACE_LAPS_MAX } from './roomrace.js';
import { TOGETHER_CSS } from './togetherstyle.js';
import {
  CODE_RE, addressInRoom, addressOutOfRoom, craftForRoom, isBuiltInWorld, normaliseCode, readRoomAddress,
  roomUrl, takeJoinToken, writeJoinToken,
} from './roomlinks.js';
import {
  EXPRESSIONS, EYE_COLOURS, FIELD_COUNTS, HAIR_COLOURS, LIVERIES, PART_NAMES, SKINS,
  avatarCanvas, cleanAvatar, liveryCss, paintAvatar, rollAvatar,
} from './avatar.js';
import { paintTitle } from '../ui/lettering.js';
import { nameRules, normaliseName, readPilotName, writePilotName } from '../share/pilot.js';
import { boardOrigin, fetchMapList, fetchTrackList } from '../share/board.js';
import { raterKey } from '../share/rating.js';
import { DESKTOP, STEAM_EDITION, allowReach } from '../steam/edition.js';

const STORE_KEY = 'webfpv.together.v1';
/* The board's close code for a pilot whose browser joined the same room
 * again from another tab (src/rooms.js CLOSE_REPLACED). */
const CLOSE_REPLACED = 4020;
/* The Rooms shelf is fetched when it opens and this often while it is up:
 * about 2 KB a time, and only while somebody is looking. */
const LOBBY_EVERY_MS = 15000;
/* A line on screen, then into the log. */
const TALK_SHOW_MS = 4200;
const TYPE_MS = 28;
const FLAP_MS = 110;
const LOG_KEPT = 30;
/* The proximity hello: under 3 m, once per pair, four a minute at most. */
const HELLO_RANGE_M2 = 9;
const HELLO_SHOW_MS = 2400;
const HELLOS_PER_MINUTE = 4;
/* Near within this long ago still counts as near, for a queued hello. */
const HELLO_FRESH_MS = 1000;
const BANNER_MS = 4200;
const TOAST_MS = 2400;
const QBAR_MS = 5000;
/* The pad's repeat, as the career's (src/career/controller.js). */
const PAD_REPEAT_FIRST_MS = 380;
const PAD_REPEAT_MS = 140;

/* The six quick lines, in the board's words (src/rooms.js QUICK_LINES),
 * each with the face it is said with, so "Crashed..." always comes with
 * the oops face. 1 to 6 say them; 7 waves. */
export const QUICK = Object.freeze([
  { line: 'hi', text: 'Hi!', face: 'hello' },
  { line: 'gg', text: 'GG!', face: 'laugh' },
  { line: 'nice', text: 'Nice line!', face: 'smug' },
  { line: 'crash', text: 'Crashed...', face: 'oops' },
  { line: 'more', text: 'One more?', face: 'fierce' },
  { line: 'wait', text: 'Wait up!', face: 'wow' },
]);
export const WAVE = Object.freeze({ line: 'wave', text: '(waves)', face: 'hello' });
const QUICK_BY_LINE = new Map([...QUICK, WAVE].map((q) => [q.line, q]));

/* The faces a typed line can be said with, from the scene's face row. */
const TALK_FACES = ['calm', 'hello', 'laugh', 'smug', 'oops', 'fierce'];
const FACE_NAMES = {
  calm: 'Calm', hello: 'Hi', laugh: 'Laugh', wow: 'Surprised', smug: 'Smug', oops: 'Oops', fierce: 'Determined', crash: 'Crashed',
};

/* The board's tags (src/rooms.js TAGS), as a card prints them. */
const TAGS = [
  { id: 'beginners', label: 'Beginners welcome', ink: 'mint' },
  { id: 'racing', label: 'Racing', ink: 'amber' },
  { id: 'club', label: 'Club', ink: 'sakura' },
  { id: 'chill', label: 'Chill', ink: 'slate' },
];
const WAY_NAMES = { freestyle: 'Freestyle', '5inch': 'Five inch', whoop: 'Whoop' };
const WAY_PICTURES = { freestyle: 'assets/gate/freestyle.jpg', '5inch': 'assets/gate/race.jpg', whoop: 'assets/gate/whoop.jpg' };
const REPORT_WHYS = [
  { id: 'words', label: 'Rude or hurtful words' },
  { id: 'name', label: 'Their name' },
  { id: 'spam', label: 'Spamming the chat' },
  { id: 'other', label: 'Something else' },
];
const CHAT_REFUSED = {
  off: 'Typed chat is off in this room.',
  long: 'That line is empty or too long: 80 letters at most.',
  words: 'That has a word the board does not allow.',
  links: 'No links, handles or phone numbers in chat.',
  slow: 'Easy: one line every two seconds.',
};
const SETTINGS_FIELDS = {
  name: 'That name has a word the board does not allow, or is too short. Try another.',
  password: 'A password is 4 to 64 characters.',
  max: 'Never fewer than the pilots already in.',
  stream: 'Paste your twitch.tv page, or the link to your YouTube live video. A channel page does not say which stream.',
};

/* Where a streamer room's viewers can prove their name (the board's
 * VIAS), as a pilot reads them. */
const VIA_NAMES = { twitch: 'Twitch', youtube: 'YouTube' };
/* What the board said to a viewer asking for their stream name, as a card:
 * title, face, words, and whether trying again could help. */
const CLAIM_SAYS = {
  expired: ['NOT SEEN', 'oops', 'Nothing came through in two minutes. Try again, and type it just as it is shown.', true],
  off: ['NOT TODAY', 'calm', "This room is not reading a stream's chat right now.", false],
  slow: ['ONE MOMENT', 'calm', 'Give it a few seconds, then try again.', true],
  busy: ['BUSY', 'oops', 'A lot of streams are being read right now. Try again in a minute.', true],
  notLive: ['NOT LIVE?', 'oops', "The stream's chat could not be read. This works while the stream is live.", true],
  resting: ['TOMORROW', 'calm', 'YouTube names have had their fill for today. Try again tomorrow.', false],
  trouble: ['NO ANSWER', 'oops', 'The chat did not answer. Try again in a minute.', true],
  name: ['KEEP YOURS', 'oops', 'Your name has letters the room cannot show, so you keep your made up one.', false],
  dropped: ['MADE UP NAME', 'calm', 'The host gave you the made up name back, and it stays for this room.', false],
  noChannel: ['NO SUCH CHANNEL', 'oops', 'Twitch does not know the channel this room reads. The streamer can fix the link in Room settings.', false],
  moved: ['NEW STREAM', 'calm', 'The host changed the stream, so names start again. Try again to use yours in the new chat.', true],
};

/* A streamer room's stream as a link a host would recognise. */
function streamLink(st) {
  if (!st) return '';
  return st.via === 'youtube' ? `youtu.be/${st.id}` : `twitch.tv/${st.id}`;
}

/* Where a viewer types their code. */
function streamWhere(st) {
  return st.via === 'youtube' ? "the stream's YouTube live chat" : `the chat on twitch.tv/${st.id}`;
}

/* The platform a viewer in this room can fly under the name of, or ''. */
function namesHere(r) {
  return r && r.stream && Array.isArray(r.streamNames) && r.streamNames.includes(r.stream.via) ? r.stream.via : '';
}

const INKS = {
  cream: '#f3ead4', sakura: '#e8a8b8', mint: '#7dffb4', amber: '#ffd45c', sky: '#8fe0ff', bail: '#ff7d96',
};

/* ------------------------------------------------------------------ *
 * Building blocks
 * ------------------------------------------------------------------ */

/* A small element builder: h('button.btn.ghost', { type: 'button' }, kids).
 * `on` takes listeners, `style` takes properties (custom ones too), and
 * aria-, data-, role, for, title and tabindex go on as attributes. */
function h(tag, props, ...kids) {
  const [name, ...classes] = tag.split('.');
  const e = document.createElement(name || 'div');
  if (classes.length) {
    e.className = classes.join(' ');
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) {
      continue;
    }
    if (k === 'on') {
      for (const [ev, fn] of Object.entries(v)) {
        e.addEventListener(ev, fn);
      }
    } else if (k === 'style') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) {
          e.style.setProperty(sk, sv);
        } else {
          e.style[sk] = sv;
        }
      }
    } else if (k === 'text') {
      e.textContent = v;
    } else if (k === 'class') {
      e.className = `${e.className} ${v}`.trim();
    } else if (k.startsWith('aria-') || k.startsWith('data-') || ['role', 'for', 'title', 'tabindex', 'inputmode', 'autocomplete', 'enterkeyhint'].includes(k)) {
      e.setAttribute(k, v === true ? 'true' : String(v));
    } else {
      e[k] = v;
    }
  }
  for (const kid of kids.flat(3)) {
    if (kid != null && kid !== false && kid !== '') {
      e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
  }
  return e;
}

/* replaceChildren with h()'s rules for what it is given: lists are
 * flattened and nothing is dropped, so a row of pilots can be passed as the
 * list it is. */
function fill(el, ...kids) {
  el.replaceChildren(...kids.flat(3).filter((k) => k != null && k !== false && k !== ''));
}

function btn(label, cls, onClick, extra = {}) {
  return h(`button.btn${cls ? `.${cls.split(' ').join('.')}` : ''}`, { type: 'button', on: { click: onClick }, ...extra }, h('span', { text: label }));
}

/*
 * A title in the game's lettering, the words kept for a reader. Words take
 * the fills in turn, as the mockup's titles do.
 *
 * Lettering is the most expensive thing a sheet draws, and a sheet is drawn
 * again on every change to it (a switch, a pilot pausing), so each title is
 * lettered once and copied after: a copy is one drawImage. The pilots list
 * is redrawn in flight, and this is what keeps that cheap.
 */
const titles = new Map();
const TITLES_KEPT = 64;

function letteredCanvas(text, fills, size, maxW) {
  /* A short window (a laptop at 720, a Deck at 800) gets titles a shade
   * smaller, so a sheet's fields stay above its buttons. */
  const tall = typeof window !== 'undefined' ? window.innerHeight : 900;
  const px = Math.round(size * Math.min(1, Math.max(0.75, tall / 820)));
  const room = typeof window !== 'undefined' ? window.innerWidth - 90 : maxW;
  const w = Math.max(160, Math.min(maxW, room));
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const key = `${text}|${fills.join(',')}|${px}|${w}|${dpr}`;
  let src = titles.get(key);
  if (!src) {
    const words = String(text).split(' ');
    const runs = words.map((wd, i) => ({ text: i < words.length - 1 ? `${wd} ` : wd, fill: fills[i % fills.length] }));
    src = document.createElement('canvas');
    paintTitle(src, runs, px, { maxW: w });
    if (titles.size >= TITLES_KEPT) {
      titles.delete(titles.keys().next().value);
    }
    titles.set(key, src);
  }
  const c = document.createElement('canvas');
  c.className = 'lettered';
  c.setAttribute('aria-hidden', 'true');
  c.width = src.width;
  c.height = src.height;
  c.style.width = src.style.width;
  c.style.height = src.style.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

function lettered(text, fills, px, maxW, cls = 'tg-title') {
  const box = h(`div.${cls}`, { role: 'heading', 'aria-level': '2' });
  try {
    box.append(letteredCanvas(text, fills, px, maxW), h('span.tg-sr', { text }));
  } catch (e) {
    box.textContent = text;
    box.style.font = `900 italic ${Math.round(px * 0.7)}px var(--ui)`;
    box.style.color = 'var(--ink)';
  }
  return box;
}

function face(avatar, expr = 'calm', size = 38) {
  return avatarCanvas(cleanAvatar(avatar), { crop: 'face', size, expr });
}

function bust(avatar, expr = 'calm', size = 220) {
  const c = avatarCanvas(cleanAvatar(avatar), { crop: 'bust', size, expr });
  c.style.width = '100%';
  c.style.height = 'auto';
  return c;
}

function plate(handle, avatar, id, extra = '', cls = '') {
  return h(`span.plate${cls ? `.${cls}` : ''}`, { style: { '--liv': liveryCss(avatar, id) } }, h('span', { text: `${handle}${extra}` }));
}

function tag(text, ink = 'paper') {
  return h(`span.tag.${ink}`, { text });
}

function crown() {
  return h('span.crown', { text: ' ♛', 'aria-label': 'host' });
}

function thumbOf(room) {
  const board = boardOrigin();
  if (!room || !room.map) {
    return '';
  }
  if (isBuiltInWorld(room.map)) {
    return `assets/thumbs/${room.map === 'city' ? 'city' : room.map}.jpg`;
  }
  /* The Steam edition carries the board's maps and tracks as a shelf, with
   * their pictures (src/steam/shelf.js shelfThumb, in the Steam
   * repository), and reaches no picture on the board. */
  if (STEAM_EDITION) {
    return /^[A-Za-z0-9_-]+$/.test(room.map) ? new URL(`../steam/shelf/thumbs/${room.map}.jpg`, import.meta.url).href : '';
  }
  return room.way === 'freestyle'
    ? `${board}/api/maps/${encodeURIComponent(room.map)}/thumb`
    : `${board}/api/tracks/${encodeURIComponent(room.map)}/thumb`;
}

function fmtMs(ms) {
  if (!(ms > 0)) {
    return '';
  }
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(2).padStart(5, '0');
  return m ? `${m}:${rest}` : (s).toFixed(2);
}

function loadStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      return {
        avatar: raw.avatar ? cleanAvatar(raw.avatar) : null,
        met: raw.met === true,
        consent: raw.consent === true,
      };
    }
  } catch (e) {
    /* A private window: the avatar lasts the visit. */
  }
  return { avatar: null, met: false, consent: false };
}

/* ------------------------------------------------------------------ *
 * The controller
 * ------------------------------------------------------------------ */

/*
 * shell, from src/main.js:
 *
 *   world()        the world on screen as a room names it, { map, name,
 *                  link }, or null
 *   ready()        whether that world is loaded and on screen
 *   flying()       in flight, not paused or in a menu
 *   paused()       on the pause menu
 *   pause(), resume()
 *   fly()          into the air from wherever the pilot is
 *   grid()         onto the start line for a race, the run fresh
 *   airborne()     off the ground, for a false start
 *   whoop()        whether the seated aircraft is the whoop
 *   roomInfo(info) the pause menu's rows: { code, name, n, host } or null
 *   forget(id)     a pilot who left, for the craft's name tags
 *   sound(name)    the menus' own click
 *   mp             keep ?mp=1 on the links this writes
 *
 * The Steam edition is read from src/steam/edition.js, not from the shell:
 * whether to ask before going online, the desktop's switch, Steam's
 * keyboard and the shelf's pictures.
 */
export function createTogether(shell) {
  if (!document.getElementById('tg-style')) {
    const style = document.createElement('style');
    style.id = 'tg-style';
    style.textContent = TOGETHER_CSS;
    document.head.append(style);
  }
  const root = h('div', { id: 'tg' });
  const layer = h('div.tg-layer');
  const modal = h('div.tg-modal');
  modal.hidden = true;
  root.append(layer, modal);
  document.body.append(root);

  const store = loadStore();
  if (!store.avatar) {
    store.avatar = rollAvatar();
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) {
      /* Kept for the visit. */
    }
  }

  let session = null;
  let race = null;
  /* What the pilot asked for and has not got yet: { kind: 'host', entry }
   * or { kind: 'join', code, room }. */
  let pending = null;
  let flowSeq = 0;
  let boot = null;
  /* Pilots muted for this visit: the board never knows. */
  const muted = new Set();
  const reported = new Set();
  /* The board's last word on this pilot's stream name ('claim'), and the
   * stream link the host is typing on the invite page. */
  let claimNow = null;
  let streamDraft = null;
  let streamSaving = false;
  let streamBad = false;
  /* Why a host's own stream name went, held for the toast that answers
   * their save, which would otherwise cover it a moment later. */
  let nameNote = '';
  const helloed = new Set();
  const helloTimes = [];
  const helloQueue = [];
  /* When each pilot was last near enough for a hello. */
  const nearAt = new Map();
  const log = [];
  let lastLink = 'good';
  let welcomedOnce = false;

  function me() {
    return {
      handle: readPilotName() || 'You', avatar: store.avatar, id: session ? session.you : 0,
    };
  }

  function pilotsList() {
    return session ? [...session.link.pilots.values()] : [];
  }

  function pilot(id) {
    return session ? session.link.pilots.get(id) || null : null;
  }

  function room() {
    return session && session.inRoom ? session.room : null;
  }

  function isHost() {
    return Boolean(session && session.inRoom && session.you === session.link.hostId);
  }

  function hostPilot() {
    return session ? pilot(session.link.hostId) : null;
  }

  function sound(name) {
    if (shell.sound) {
      shell.sound(name);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Sheets: one at a time, with a way back                            */
  /* ---------------------------------------------------------------- */

  /* [{ name, render, back, focus }]. render builds the sheet from scratch
   * each time it is shown, which is how a sheet changes: refresh(). */
  let stack = [];
  let pausedByUs = false;
  let focusKey = '';
  /* A sheet drops in when it opens, and not when it is drawn again. */
  let entering = false;

  function topName() {
    return stack.length ? stack[stack.length - 1].name : '';
  }

  function open(name, render, opts = {}) {
    if (modal.hidden) {
      padWait = true;
      if (shell.flying()) {
        shell.pause();
        pausedByUs = true;
      }
    }
    /* The spinner is never a sheet to come back to: whatever follows it
     * (the join card, the password, the avatar, the card that says why)
     * takes its place, so Back from that is where the pilot asked from. */
    if (topName() === 'connecting' && name !== 'connecting') {
      stack.pop();
    }
    if (opts.replace && stack.length) {
      stack.pop();
    }
    stack.push({ name, render, back: opts.back || null });
    focusKey = opts.focus || '';
    entering = true;
    paint();
  }

  function paint() {
    const top = stack[stack.length - 1];
    if (!top) {
      return;
    }
    closeOsk();
    const node = top.render();
    if (entering) {
      node.classList.add('tg-enter');
      entering = false;
    }
    modal.replaceChildren(node);
    modal.hidden = false;
    root.classList.add('has-modal');
    const want = focusKey && node.querySelector(`[data-k="${focusKey}"]`);
    focusKey = '';
    /* A card over a sheet (a confirm, a report) is drawn with the sheet
     * under it, whose own first button must not take the focus. */
    const backs = node.querySelectorAll('.modal-back');
    const front = backs.length ? backs[backs.length - 1] : node;
    const first = want || front.querySelector('[data-autofocus]') || focusables()[0];
    if (first) {
      first.focus({ preventScroll: false });
      /* A field drawn again keeps its words; the caret goes after them,
       * where the pilot was typing. */
      if (first.tagName === 'INPUT' && first.type !== 'checkbox' && typeof first.setSelectionRange === 'function') {
        try {
          first.setSelectionRange(first.value.length, first.value.length);
        } catch (e) {
          /* A field that has no caret. */
        }
      }
    }
  }

  /* The sheet named again, as it is now, the focus kept where it was. */
  function refresh(name) {
    if (topName() !== name) {
      return;
    }
    const active = document.activeElement;
    focusKey = active && modal.contains(active) ? active.getAttribute('data-k') || '' : '';
    paint();
  }

  function back() {
    sound('back');
    const top = stack[stack.length - 1];
    if (oskOpen()) {
      closeOsk();
      return;
    }
    if (top && top.back) {
      top.back();
      return;
    }
    pop();
  }

  function pop() {
    stack.pop();
    if (stack.length) {
      paint();
    } else {
      closeAll();
    }
  }

  function closeAll() {
    stack = [];
    closeOsk();
    modal.replaceChildren();
    modal.hidden = true;
    root.classList.remove('has-modal');
    stopLobby();
    if (pausedByUs) {
      pausedByUs = false;
      if (shell.paused()) {
        shell.resume();
      }
    }
  }

  function focusables(scope) {
    const backs = modal.querySelectorAll('.modal-back');
    const box = scope || (backs.length ? backs[backs.length - 1] : modal);
    return [...box.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex="0"]')]
      .filter((e) => e.offsetParent !== null || e === document.activeElement);
  }

  /*
   * The nearest control in a direction, the mockup's rule: ahead of the
   * focus by more than a few pixels, scored on how far ahead plus twice
   * how far off the line, so Down from a button finds the one under it
   * rather than the one diagonally nearer.
   */
  function moveFocus(dx, dy) {
    const scope = oskOpen() ? oskEl : null;
    const list = focusables(scope);
    const cur = document.activeElement && (scope || modal).contains(document.activeElement) ? document.activeElement : null;
    if (!cur) {
      if (list[0]) list[0].focus();
      return;
    }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    let best = null;
    let bestD = Infinity;
    for (const e of list) {
      if (e === cur) continue;
      const r = e.getBoundingClientRect();
      const vx = r.left + r.width / 2 - ax;
      const vy = r.top + r.height / 2 - ay;
      const along = vx * dx + vy * dy;
      if (along <= 4) continue;
      const across = Math.abs(vx * dy - vy * dx);
      const d = along + across * 2.2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (best) {
      best.focus();
      best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      sound('move');
    }
  }

  function press(target) {
    const t = target || document.activeElement;
    if (!t || !modal.contains(t)) {
      const first = focusables()[0];
      if (first) first.focus();
      return;
    }
    if (t.tagName === 'INPUT') {
      if (padHands && t.type !== 'checkbox') {
        keyboardFor(t);
        return;
      }
      if (t.dataset.enter) {
        const go = modal.querySelector(`[data-k="${t.dataset.enter}"]`);
        if (go) go.click();
      }
      return;
    }
    t.click();
  }

  /* Every press makes the menus' click, whether a pointer, a key or a pad
   * made it: they all arrive here as a click. */
  /* Before the button's own handler, so a sheet it repaints keeps the
   * focus on the button pressed. Safari and Firefox on a Mac leave the
   * focus where it was when a button is clicked, and a refresh would put
   * it back there: on the Face tab while Hair is the one showing. */
  modal.addEventListener('click', (e) => {
    const b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (b && !b.disabled && b.getAttribute('aria-disabled') !== 'true') {
      if (document.activeElement !== b) {
        b.focus({ preventScroll: true });
      }
      sound('select');
    }
  }, true);

  /* An Enter whose keydown was not the sheet's: the press that opened the
   * sheet (Enter on the picker's Rooms tab) or that put the focus back on
   * it (Enter with the focus lost). The browser clicks a button on the
   * keypress after, wherever the focus is by then, so that one press also
   * pressed the control it landed on, the shelf's Back or the host
   * sheet's Cancel. The keydown below takes every Enter the sheet does
   * see, so a keypress reaching here is never one to act on. */
  modal.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  }, true);

  /* Keys inside a sheet, before the window hears them: so Enter on a
   * button is one press and not the browser's click and the shell's too,
   * and the arrows in a field leave it up and down but move the caret
   * left and right. */
  modal.addEventListener('keydown', (e) => {
    const t = e.target;
    const typing = t && t.tagName === 'INPUT';
    const dirs = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    };
    const d = dirs[e.key];
    let used = true;
    if (d && !(typing && d[0] !== 0)) {
      moveFocus(d[0], d[1]);
    } else if (e.key === 'Tab') {
      /* Tab goes round the sheet and never out of it: the shell's menu
       * behind is not this sheet's to reach. */
      const list = focusables(oskOpen() ? oskEl : null);
      if (list.length) {
        const at = list.indexOf(document.activeElement);
        const next = e.shiftKey ? (at <= 0 ? list.length - 1 : at - 1) : (at + 1) % list.length;
        list[next].focus();
      }
    } else if (e.key === 'Enter' || (e.key === ' ' && !typing)) {
      press(t);
    } else if (e.key === 'Escape') {
      back();
    } else {
      used = false;
    }
    if (used) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  /* ---------------------------------------------------------------- */
  /* The game's own keyboard, for a pad or a radio in a text field     */
  /* ---------------------------------------------------------------- */

  let oskEl = null;
  let oskTarget = null;
  let padHands = false;

  function oskOpen() {
    return Boolean(oskEl);
  }

  /*
   * A pad's way to type: in the desktop game, Steam's own keyboard, which
   * knows the Deck and the player's language; the game's own anywhere
   * else, when Steam is not running, and for a password, which Steam's
   * keyboard would print in the clear.
   */
  async function keyboardFor(input) {
    const steam = DESKTOP && DESKTOP.steam && typeof DESKTOP.steam.keyboard === 'function' ? DESKTOP.steam : null;
    if (steam && input.type !== 'password') {
      const max = input.maxLength > 0 ? input.maxLength : 64;
      let r = null;
      try {
        r = await steam.keyboard({ description: input.getAttribute('aria-label') || input.placeholder || 'Name', max, text: input.value.slice(0, max) });
      } catch (e) {
        r = null;
      }
      if (r && r.ok) {
        if (typeof r.text === 'string' && document.contains(input)) {
          input.value = r.text.slice(0, max);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus();
        }
        return;
      }
    }
    openOsk(input);
  }

  function openOsk(input) {
    closeOsk();
    oskTarget = input;
    const keys = (input.dataset.osk === 'code' ? 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' : '1234567890QWERTYUIOPASDFGHJKLZXCVBNM.-_').split('');
    const put = (ch) => {
      if (input.value.length < (input.maxLength > 0 ? input.maxLength : 80)) {
        input.value += input.dataset.osk === 'code' || input.dataset.osk === 'upper' ? ch : ch.toLowerCase();
        input.dispatchEvent(new Event('input'));
      }
    };
    oskEl = h('div.osk.sheet.halftone', { role: 'group', 'aria-label': 'Keyboard' },
      keys.map((k) => h('button', { type: 'button', on: { click: () => put(k) } }, k)),
      input.dataset.osk === 'code' ? null : h('button.wide', { type: 'button', on: { click: () => put(' ') } }, 'Space'),
      h('button.wide', {
        type: 'button',
        on: {
          click: () => {
            input.value = input.value.slice(0, -1);
            input.dispatchEvent(new Event('input'));
          },
        },
      }, 'Delete'),
      h('button.wide.go', { type: 'button', on: { click: () => { const t = oskTarget; closeOsk(); if (t) { t.focus(); if (t.dataset.enter) press(t); } } } }, 'Done'));
    modal.append(oskEl);
    oskEl.querySelector('button').focus();
  }

  function closeOsk() {
    if (oskEl) {
      oskEl.remove();
      oskEl = null;
      if (oskTarget && document.contains(oskTarget)) {
        oskTarget.focus();
      }
      oskTarget = null;
    }
  }

  /* ---------------------------------------------------------------- */
  /* The room: sessions, hosting, joining                              */
  /* ---------------------------------------------------------------- */

  function makeSession() {
    if (session) {
      return session;
    }
    let override = '';
    try {
      override = new URLSearchParams(window.location.search).get('rooms') || '';
    } catch (e) {
      override = '';
    }
    session = new RoomSession({
      url: roomsUrl(boardOrigin(), override),
      key: raterKey(),
      handle: readPilotName() || '',
      avatar: cleanAvatar(store.avatar),
      onEvent: (name, data) => heard(name, data),
    });
    race = new RoomRace({
      send: (m) => session && session.link.raceSend(m),
      you: () => (session ? session.you : 0),
    });
    return session;
  }

  /* Out of the room, however that came about. The card that says why, if
   * there is one, is the caller's. */
  function dropSession() {
    if (session) {
      session.leave();
    }
    session = null;
    race = null;
    pending = null;
    welcomedOnce = false;
    claimNow = null;
    streamDraft = null;
    streamSaving = false;
    streamBad = false;
    clearOverlays();
    dropRoomSheets();
    shell.roomInfo(null);
    writeAddressOut();
  }

  /*
   * The sheets that are about the room: its page, its settings, the talk
   * scene, the race, invite, and the cards over them. A room that has gone
   * takes them with it, wherever they were in the stack, so neither Back
   * nor a press can reach one that would talk to a room that is not there.
   */
  const ROOM_SHEETS = new Set(['room', 'roomSettings', 'scene', 'race', 'confirm', 'report', 'share', 'claim']);

  function dropRoomSheets() {
    const top = stack[stack.length - 1];
    const kept = stack.filter((s) => !ROOM_SHEETS.has(s.name));
    if (kept.length === stack.length) {
      return;
    }
    stack = kept;
    if (!stack.length) {
      closeAll();
    } else if (stack[stack.length - 1] !== top) {
      paint();
    }
  }

  /*
   * The room as the chip and the frame loop see it: the room while in it,
   * and still the room while the page is getting back into it after a
   * drop, so the chip can say so and the others stay drawn. Nothing that
   * sends to the board reads this one.
   */
  function heldRoom() {
    if (!session) {
      return null;
    }
    const state = session.link.state;
    return session.inRoom || (welcomedOnce && (state === 'retrying' || state === 'connecting')) ? session.room : null;
  }

  /* The room, for a page of it about to open; in a drop, a word that the
   * page waits for the board, and no page. */
  function roomToOpen() {
    const r = room();
    if (!r && heldRoom()) {
      waitToast('Getting back into the room. One moment.');
    }
    return r;
  }

  function sameWorld(r) {
    const w = shell.world();
    return Boolean(r && w && shell.ready() && w.map === r.map);
  }

  /* A room that flies whoops is flown on a whoop, and a five inch room on
   * a five inch: the aircraft its link names (craftForRoom). A pilot on
   * the other one goes to it the way they would go to another map, by its
   * link, because a five inch among whoops is a different race and is
   * drawn to the others as one of theirs. */
  function sameCraft(r) {
    return Boolean(r) && shell.whoop() === (craftForRoom(r) === 'whoop65');
  }

  function writeAddress() {
    const r = room();
    const w = shell.world();
    if (!r || !w || w.map !== r.map) {
      return;
    }
    try {
      const next = addressInRoom(window.location.href, w.link, r.code, shell.mp);
      if (next) {
        window.history.replaceState(window.history.state, '', next);
      }
    } catch (e) {
      /* An address that cannot be rewritten keeps what it had. */
    }
  }

  function writeAddressOut() {
    try {
      const next = addressOutOfRoom(window.location.href);
      if (next) {
        window.history.replaceState(window.history.state, '', next);
      }
    } catch (e) {
      /* As above. */
    }
  }

  function infoForShell() {
    const r = room();
    if (!r) {
      shell.roomInfo(null);
      return;
    }
    shell.roomInfo({
      code: r.code, name: r.name, n: session.link.pilots.size, host: isHost(), race: RoomRace.racing(r.way),
    });
  }

  /*
   * THE STEAM EDITION IS OFFLINE until the pilot says yes, and then online
   * for rooms only (PLAN.md B7 in the Steam repository, and the owner's
   * yes of 2026-10-25 to Steam pilots joining the same rooms). The yes is
   * kept; going online is asked of the desktop once per run, the first
   * time Fly together is used, so a run that never opens it makes no
   * request. The desktop opens the rooms' addresses and nothing else, and
   * the page's guard lets the same addresses through.
   */
  let online = !STEAM_EDITION;

  async function goOnline(on = true) {
    let ok = true;
    if (DESKTOP) {
      try {
        ok = Boolean(DESKTOP.app && typeof DESKTOP.app.community === 'function' && await DESKTOP.app.community(on));
      } catch (e) {
        ok = false;
      }
    }
    allowReach(`${boardOrigin()}/api/rooms`, on && ok);
    online = on && ok;
    return online;
  }

  /* The pilot's no, from the rooms page: offline again, and the yes
   * forgotten, so the next Fly together asks. */
  function goOffline() {
    store.consent = false;
    save();
    if (session) {
      dropSession();
    }
    goOnline(false);
    closeAll();
    toast('Online is off. Nothing in the game goes online now.');
  }

  /*
   * WHICH ROOMS THIS COPY CAN FLY. The web flies every map and track on
   * the board. The Steam edition flies the worlds it ships and the board's
   * maps and tracks it carries as a shelf (src/steam/shelf.js in the Steam
   * repository answers the board's lists from it), and shows a room on any
   * other greyed (the owner, 2026-10-25).
   */
  let shipped = null;
  let shippedLoading = null;

  function hasWorldNow(r) {
    if (!STEAM_EDITION || !r || isBuiltInWorld(r.map)) {
      return true;
    }
    return Boolean(shipped && shipped.has(r.map));
  }

  async function hasWorld(r) {
    if (STEAM_EDITION && !shipped) {
      if (!shippedLoading) {
        shippedLoading = Promise.all([fetchMapList().catch(() => []), fetchTrackList().catch(() => [])])
          .then(([maps, tracks]) => {
            shipped = new Set([...maps, ...tracks].map((x) => x.id));
          });
      }
      await shippedLoading;
    }
    return hasWorldNow(r);
  }

  /* Consent (Steam), then the avatar, then whatever the pilot asked for. */
  function gate(next) {
    if (STEAM_EDITION && !store.consent) {
      sheetConsent(() => gate(next));
      return;
    }
    if (!online) {
      goOnline().then((ok) => (ok ? gate(next) : sheetCant('noOnline')));
      return;
    }
    if (!store.met) {
      sheetMeet(next);
      return;
    }
    next();
  }

  async function fetchJson(path) {
    try {
      const r = await fetch(`${boardOrigin()}${path}`, { cache: 'no-store' });
      let body = null;
      try {
        body = await r.json();
      } catch (e) {
        body = null;
      }
      return { ok: r.ok, status: r.status, body };
    } catch (e) {
      return { ok: false, status: 0, body: null };
    }
  }

  /*
   * A room by its code, the way every join starts: the board's card for
   * it, then on this world the password if it needs one and the room, or
   * on another world a reload into that world. `pressed` is a pilot's own
   * press (a Rooms card, a typed code, a press carried across a reload),
   * which skips the "Join?" card a link shows. Each walk to the door has
   * a number (flowSeq), so one the pilot cancelled, or left for another,
   * is not finished for them when the board's answer lands.
   */
  async function joinFlow(code, invite = '', { pressed = false } = {}) {
    const c = normaliseCode(code);
    if (!c) {
      sheetCant('notFound', { code });
      return;
    }
    if (!online) {
      gate(() => joinFlow(c, invite, { pressed }));
      return;
    }
    sheetConnecting({ code: c, step: 0 });
    flowSeq += 1;
    const mine = flowSeq;
    const dropped = () => mine !== flowSeq || topName() !== 'connecting';
    const got = await fetchJson(`/api/rooms/${c}${invite ? `?i=${encodeURIComponent(invite)}` : ''}`);
    if (dropped()) {
      return;
    }
    if (!got.ok) {
      sheetCant(got.status === 404 ? 'notFound' : (got.body && got.body.why) || 'offline', { code: c });
      return;
    }
    const r = { ...got.body, code: c };
    const flies = await hasWorld(r);
    if (dropped()) {
      return;
    }
    if (!flies) {
      sheetCant('noWorld', { code: c, room: r });
      return;
    }
    if (r.n >= r.max) {
      sheetCant('full', { code: c, room: r, invite });
      return;
    }
    if (!pressed) {
      sheetJoin(r, invite);
      return;
    }
    joinNow(r, invite);
  }

  /* After the pilot has said yes to this room. */
  function joinNow(r, invite) {
    const here = heldRoom();
    if (here && here.code === r.code) {
      closeAll();
      toast('You are in this room already.');
      return;
    }
    leaveFirst(`Joining ${r.name} takes you out of this room. The others carry on without you.`, () => gate(() => {
      if (!sameWorld(r) || !sameCraft(r)) {
        travel(r, invite);
        return;
      }
      if (r.needsPassword) {
        sheetPassword(r, invite);
        return;
      }
      connect(r, { invite });
    }));
  }

  /* A pilot in a room who asks for another room is asked first, because
   * the way into another room is out of this one. */
  function leaveFirst(words, next) {
    const r = heldRoom();
    if (!r) {
      next();
      return;
    }
    open('switch', () => scrimmed(h('div.card-mid.sheet.sakura.halftone', null,
      h('span.kicker', { text: 'You are in a room' }),
      lettered(`LEAVE ${r.name.toUpperCase()}?`, [INKS.cream, INKS.bail], 42, 640),
      h('div.state-row', null, h('div.who', null, bust(store.avatar, 'wow')), h('div.say', { text: words })),
      h('div.btnrow', null,
        btn('Leave and go', 'danger', () => { pop(); next(); }, { 'data-k': 'switch-go' }),
        /* Stay has the focus: leaving is never one stray press away. */
        btn('Stay', 'ghost', () => back(), { 'data-k': 'switch-stay', 'data-autofocus': true })))));
  }

  /* Into the room's world: the page reloads on its address, carrying the
   * press for a minute so the card does not ask again. */
  function travel(r, invite) {
    sheetConnecting({ code: r.code, room: r, step: 2 });
    try {
      writeJoinToken(window.sessionStorage, { code: r.code, invite }, Date.now());
    } catch (e) {
      /* No session storage: the card asks once more after the reload. */
    }
    const next = roomUrl(window.location.href, r, { invite, mp: shell.mp });
    const a = new URL(next);
    const b = new URL(window.location.href);
    a.hash = '';
    b.hash = '';
    if (a.href === b.href) {
      window.history.replaceState(window.history.state, '', next);
      window.location.reload();
    } else {
      window.location.assign(next);
    }
  }

  function connect(r, { invite = '', password = '' } = {}) {
    if (session && session.inRoom && session.room.code === r.code) {
      closeAll();
      return;
    }
    if (session) {
      dropSession();
    }
    makeSession();
    pending = { kind: 'join', code: r.code, room: r, invite };
    session.join(r.code, { invite, password });
    sheetConnecting({ code: r.code, room: r, step: 3 });
  }

  function host(entry, settings) {
    if (session) {
      dropSession();
    }
    makeSession();
    pending = { kind: 'host', entry, settings };
    session.host({
      ...settings,
      way: entry.way,
      map: entry.map,
      mapName: String(entry.name || 'A map').slice(0, 48),
      scale: entry.whoop ? 100 : 50,
    });
    sheetConnecting({ hosting: entry, step: 0 });
  }

  function leave() {
    dropSession();
    closeAll();
    toast('You left the room. Flying solo.');
  }

  /* ---------------------------------------------------------------- */
  /* What the board says                                               */
  /* ---------------------------------------------------------------- */

  function heard(name, data) {
    if (!session) {
      return;
    }
    const now = performance.now();
    switch (name) {
      case 'welcome':
        welcomed(data, now);
        break;
      case 'joined':
        logLine(data.id, 'joined the room', 'hello');
        sound('move');
        paintChip();
        infoForShell();
        refresh('room');
        refresh('share');
        break;
      case 'left': {
        if (shell.forget) shell.forget(data.id);
        if (data.pilot && !muted.has(data.id)) {
          logLine(data.id, data.why === 'kicked' || data.why === 'banned' ? 'was taken out of the room' : 'left', 'calm', data.pilot);
        }
        if (openRow === data.id) openRow = 0;
        paintChip();
        infoForShell();
        refresh('room');
        refresh('share');
        /* A card about a pilot who has gone has nothing left to act on. */
        if ((topName() === 'confirm' || topName() === 'report') && aboutId === data.id) {
          pop();
        }
        break;
      }
      case 'host': {
        const p = pilot(data.id);
        if (data.id === session.you) {
          banner(me().avatar, 'laugh', "You're the host now", 'Pause, then Room, for the host tools.');
        } else if (p) {
          banner(p.avatar, 'laugh', `${p.handle} is the host now`, 'The room carries on.');
        }
        infoForShell();
        paintChip();
        /* Host tools open on a page that is no longer the host's would
         * send words the board refuses: they close. */
        if (!isHost() && (topName() === 'roomSettings' || (topName() === 'confirm' && aboutHostTool))) {
          pop();
          toast('You are not the host now.', 'warn');
        }
        refresh('room');
        refresh('race');
        break;
      }
      case 'room':
        paintChip();
        infoForShell();
        writeAddress();
        if (streamSaving) {
          streamSaving = false;
          streamDraft = null;
          streamBad = false;
          const via = namesHere(data.room);
          toast(`${via ? `Viewers can fly as their ${VIA_NAMES[via]} name` : 'Stream names off'}${nameNote ? `. ${nameNote}` : ''}`);
          nameNote = '';
        }
        if (topName() === 'roomSettings' && settingsSaving) {
          settingsSaving = false;
          toast(nameNote ? `Saved. ${nameNote}` : 'Saved');
          nameNote = '';
          pop();
        } else {
          refresh('room');
          refresh('share');
        }
        if (nameNote) {
          toast(nameNote);
          nameNote = '';
        }
        break;
      case 'pilots':
      case 'away':
        paintChip();
        refresh('room');
        if (rosterOn) paintRoster();
        break;
      case 'look':
        /* Everywhere a face is drawn from the room's list. */
        paintChip();
        refresh('room');
        refresh('share');
        refresh('scene');
        if (rosterOn) paintRoster();
        raceChanged();
        break;
      case 'removed': {
        const hp = hostPilot();
        sheetCant(data.why === 'replaced' ? 'replaced' : data.why === 'banned' ? 'banned' : 'kicked', { room: session.room, hostAvatar: hp ? hp.avatar : null });
        dropSession();
        break;
      }
      case 'refused':
        refused(data);
        break;
      case 'lost':
        banner(me().avatar, 'oops', 'The room closed while you were away', 'Flying solo.');
        dropSession();
        break;
      case 'retrying':
        if (welcomedOnce) {
          lastLink = 'low';
          paintChip();
          refresh('room');
          if (data.tries === 2) {
            banner(null, '', 'Lost the board for a moment', 'Pilots near you are still here. Trying again.');
          }
        } else if (pending && data.tries >= 3) {
          /* Never got in, and the board is not answering: say so rather
           * than spin. */
          const was = pending;
          dropSession();
          sheetCant('offline', notIn(was));
        }
        break;
      case 'closed':
        if (data.code === CLOSE_REPLACED) {
          sheetCant('replaced', { room: session.room });
          dropSession();
        } else if (!data.wasIn && pending) {
          const was = pending;
          dropSession();
          sheetCant(data.code === 1000 ? 'gone' : 'offline', notIn(was));
        } else if (data.wasIn) {
          banner(hostPilot() ? hostPilot().avatar : me().avatar, 'oops', 'The room has closed', 'Flying solo.');
          dropSession();
        }
        break;
      case 'say':
      case 'chat':
        spoken(name, data);
        break;
      case 'chatRefused':
        toast(CHAT_REFUSED[data.why] || 'That line was not said.', 'warn');
        break;
      case 'reported':
        reported.add(data.id);
        if (topName() === 'report') {
          refresh('report');
        }
        break;
      case 'reportFailed':
        reportBusy = false;
        toast('The report did not go. Try again in a moment.', 'bad');
        refresh('report');
        break;
      case 'settingsRefused':
        if (streamSaving) {
          streamSaving = false;
          streamBad = (data.fields || []).includes('stream');
          refresh('share');
          break;
        }
        settingsSaving = false;
        settingsBad = new Set(data.fields || []);
        refresh('roomSettings');
        break;
      case 'claim':
        claimNow = data.state === 'stopped' ? null : data;
        if (topName() !== 'claim') {
          if (data.state === 'done') {
            toast(`You are flying as ${data.handle}`);
          } else if (data.state === 'dropped' || data.state === 'moved') {
            /* A banner is hidden under an open sheet, and the host who
             * changed the stream is on one, so there it is a toast. */
            const why = data.state === 'dropped' ? 'The host chose it for this room.'
              : !data.again ? 'This room reads no stream now.'
                : topName() ? 'The stream changed, so prove yours again in the new chat.'
                  : 'The stream changed. Pause, then Room, to prove yours again.';
            if (topName() && (settingsSaving || streamSaving)) {
              nameNote = `Your made up name is back. ${why}`;
            } else if (topName()) {
              toast(`Your made up name is back. ${why}`);
            } else {
              banner(store.avatar, 'calm', 'Your made up name is back', why);
            }
          } else if (data.state === 'expired') {
            toast('Your code ran out. Pause, then Room, to try again.', 'warn');
          } else if (data.state === 'noChannel' && isHost() && room() && room().stream) {
            /* Only the host can fix a link Twitch does not know, so the
             * host hears it whoever was asking. */
            toast(`Twitch does not know twitch.tv/${room().stream.id}. Check Your stream on Invite pilots.`, 'bad');
          }
        }
        if (data.state === 'done') {
          sound('select');
        }
        refresh('claim');
        refresh('room');
        break;
      case 'named':
        /* A stream name proved, or a made up one put back: everywhere a
         * name is drawn. The name tags over the craft follow by
         * themselves, because they are painted again when a name
         * changes. */
        paintChip();
        refresh('room');
        refresh('share');
        refresh('scene');
        refresh('claim');
        if (rosterOn) paintRoster();
        raceChanged();
        break;
      case 'pong':
        if (race) race.pong(data, now);
        break;
      case 'race':
        if (race) race.heard(data.race);
        raceChanged();
        break;
      default:
        break;
    }
  }

  function welcomed(data, now) {
    const was = pending;
    pending = null;
    if (race) {
      race.welcome(data, now);
    }
    lastLink = 'good';
    paintChip();
    infoForShell();
    writeAddress();
    raceChanged();
    if (welcomedOnce) {
      /* A deploy, or a drop, and back in from the ticket: whatever page
       * of the room is open is drawn again from the board's word, and a
       * save or a report lost in the drop can be pressed again. */
      settingsSaving = false;
      reportBusy = false;
      if (dropToastUp) {
        clearTimeout(toastTimer);
        toastBox.replaceChildren();
        dropToastUp = false;
      }
      /* A code handed out before the drop died with the old socket. */
      if (claimNow && (claimNow.state === 'waiting' || claimNow.state === 'asking')) {
        claimNow = null;
        if (topName() === 'claim') {
          askClaim();
        }
      }
      for (const name of ['room', 'share', 'scene', 'race', 'roomSettings', 'claim']) {
        refresh(name);
      }
      banner(hostPilot() ? hostPilot().avatar : me().avatar, 'hello', 'Back in', 'The room is just as you left it.', 'mint');
      return;
    }
    welcomedOnce = true;
    const r = session.room;
    if (was && was.kind === 'host') {
      sheetShare({ first: true, entry: was.entry });
      return;
    }
    closeAll();
    if (!shell.flying()) {
      shell.fly();
    }
    const hp = hostPilot();
    const n = session.link.pilots.size;
    const others = n - 1;
    const who = others > 0 ? `${others} ${others === 1 ? 'pilot' : 'pilots'} here` : 'Nobody else here yet';
    const via = namesHere(r);
    banner(hp ? hp.avatar : null, 'hello', `Welcome to ${r.name}`,
      `${hp && hp.id !== session.you ? `${hp.handle} is hosting. ` : ''}${who}. ${r.typedChat ? 'Say hi with 1 to 6, or Enter to type.' : 'Say hi with 1 to 6, or Q for the lines.'}${via ? ` Your ${VIA_NAMES[via]} name: pause, then Room.` : ''}`);
  }

  function refused(data) {
    const was = pending;
    const why = data.why;
    if (why === 'fields' && was && was.kind === 'host') {
      dropSession();
      sheetHost(was.entry, { ...was.settings, bad: new Set(data.fields || []) }, { replace: true });
      return;
    }
    if (why === 'password' && was && was.kind === 'join') {
      dropSession();
      sheetPassword({ ...was.room, needsPassword: true }, was.invite, { wrong: true, replace: true });
      return;
    }
    dropSession();
    sheetCant(why, notIn(was));
  }

  /* What a card that says why needs from what the pilot asked for: the
   * room to try again, or for a room of their own, the same again. */
  function notIn(was) {
    if (!was) {
      return {};
    }
    if (was.kind === 'host') {
      return { again: () => host(was.entry, was.settings) };
    }
    return { code: was.code || '', room: was.room || null, invite: was.invite || '' };
  }

  /* ---------------------------------------------------------------- */
  /* Sheets: getting in                                                */
  /* ---------------------------------------------------------------- */

  function scrimmed(...kids) {
    return h('div', null, h('div.tg-scrim'), h('div.tg-checker'), ...kids);
  }

  /* A switch row. A locked one is shown fixed where the room's rules keep
   * it, says why, and does nothing when pressed. */
  function switchRow(k, label, small, on, toggle, { locked = false, why = '' } = {}) {
    return h('button.switch', {
      type: 'button', role: 'switch', 'aria-checked': String(Boolean(on)), 'aria-disabled': locked ? 'true' : null, 'data-k': k,
      on: { click: () => { if (!locked) toggle(); } },
    }, h('span', null, h('b', { text: label }), h('small', { text: small }), why ? h('span.why', { text: why }) : null), h('span.knob'));
  }

  /* The room's tags, up to three, for the host sheet and room settings. */
  function tagPicker(f, again) {
    return h('div.field', null, h('span.lab', { text: 'Tags' }), h('div.btnrow', { style: { gap: '8px' } }, TAGS.map((t) => h(`button.tag.${f.tags.includes(t.id) ? t.ink : 'paper'}`, {
      type: 'button', 'aria-pressed': String(f.tags.includes(t.id)), 'data-k': `tag-${t.id}`, style: { padding: '6px 10px', cursor: 'pointer' },
      on: {
        click: () => {
          f.tags = f.tags.includes(t.id) ? f.tags.filter((x) => x !== t.id) : [...f.tags, t.id].slice(-3);
          again();
        },
      },
    }, t.label))));
  }

  /* The same words for the address switch wherever a host meets it. */
  const HIDE_LABEL = "Hide pilots' addresses";
  const HIDE_SMALL = "Pilots connect through a relay, so nobody can see another pilot's internet address.";

  function sheetConsent(next) {
    open('consent', () => scrimmed(h('div.card-mid.sheet.sakura.halftone', null,
      h('span.kicker', { text: 'Steam edition' }),
      lettered('FLY TOGETHER GOES ONLINE', [INKS.cream, INKS.sakura], 44, 680),
      h('div.state-row', null, h('div.who', null, bust(store.avatar, 'hello')),
        h('div.stack', { style: { color: 'var(--ink)', fontSize: '16px', fontWeight: '600' } },
          h('div', null, 'To fly with others, WebFPV connects to ', h('b', { text: 'the WebFPV board' }), ' for rooms and chat, and to the pilots you fly near.'),
          h('div', { text: 'In listed rooms other pilots never see your address. Nothing else in the game goes online.' }),
          h('div', { text: 'You can turn it off again at the foot of the rooms page.' }))),
      h('div.btnrow', null,
        btn('Turn on and continue', '', () => {
          store.consent = true;
          save();
          pop();
          next();
        }, { 'data-autofocus': true }),
        btn('Not now', 'ghost', () => closeAll()),
        h('button.link', { type: 'button', on: { click: () => sheetPrivacy() } }, 'How rooms keep you safe')))));
  }

  /* ---- you ---- */

  /* The pilot's name. `draft` holds what is typed until it is kept, so a
   * sheet drawn again (a face picked, the look rolled) keeps it. */
  function nameField(draft) {
    const input = h('input.input', {
      id: 'tg-handle', value: draft.name, maxLength: 24, autocomplete: 'off', 'data-k': 'handle', 'data-osk': 'name', placeholder: 'Your pilot name',
    });
    const okNow = () => !input.value.trim() || Boolean(normaliseName(input.value));
    const help = h('span.help', { text: `The name your lap times use. ${nameRules()} In listed and school safe rooms you get a made up one instead.` });
    const mark = () => {
      input.classList.toggle('bad', !okNow());
      help.classList.toggle('bad', !okNow());
    };
    input.addEventListener('input', () => {
      draft.name = input.value;
      mark();
    });
    input.addEventListener('change', () => {
      const n = normaliseName(input.value);
      if (n) writePilotName(n);
    });
    mark();
    return h('div.field', null, h('label', { for: 'tg-handle', text: 'Your name' }), input, help);
  }

  function keepName(draft) {
    const n = normaliseName(draft.name);
    if (n) writePilotName(n);
  }

  function sheetMeet(next) {
    let expr = 'hello';
    const draft = { name: readPilotName() || '' };
    open('meet', () => {
      const portrait = h('div.av-portrait', null, bust(store.avatar, expr), h('span.plate', { style: { '--liv': liveryCss(store.avatar, 0) } }, h('span', { text: draft.name.trim() || 'You' })));
      return scrimmed(h('div.page.fit.narrow.sheet.halftone', null,
        h('div.page-head', null, h('div.grow', null, h('span.kicker', { text: 'Fly together' }), lettered('THIS IS YOU', [INKS.cream, INKS.mint], 50, 600))),
        h('div.rule'),
        h('div.page-body', null, h('div.av-stage', null, portrait,
          h('div.stack', { style: { gap: '14px' } },
            h('div.say', { text: "Hi! I'm your pilot. Keep me, roll a new one, or change my look." }),
            h('div.exprs', null, ['calm', 'hello', 'laugh'].map((e) => h('button', {
              type: 'button', 'aria-pressed': String(expr === e), 'data-k': `expr-${e}`, on: { click: () => { expr = e; refresh('meet'); } },
            }, face(store.avatar, e, 48), h('small', { text: FACE_NAMES[e] })))),
            nameField(draft),
            h('div.btnrow', null,
              btn('Keep', '', () => {
                keepName(draft);
                store.met = true;
                save();
                pop();
                next();
              }, { 'data-autofocus': true, 'data-k': 'keep' }),
              btn('Roll again', 'amber', () => {
                keepName(draft);
                store.avatar = rollAvatar();
                save();
                refresh('meet');
              }, { 'data-k': 'roll' }),
              btn('Change look', 'ghost', () => {
                keepName(draft);
                sheetEditor(() => refresh('meet'));
              }, { 'data-k': 'look' })))))));
    });
  }

  const EDITOR_TABS = ['Face', 'Hair', 'Eyes', 'Extras', 'Colours', 'Quad'];

  function sheetEditor(after) {
    let tab = 'Face';
    let expr = 'calm';
    const was = cleanAvatar(store.avatar);
    const setPart = (k, v) => {
      store.avatar = { ...store.avatar, [k]: v };
      save();
      refresh('editor');
    };
    open('editor', () => {
      const av = store.avatar;
      const key = { Face: 'face', Hair: 'hair', Eyes: 'eyes', Extras: 'acc' }[tab];
      let grid;
      if (key) {
        /* Rows as even as the count allows: eight is two fours, nine is a
         * five and a four, never a row of seven and one left over. */
        const names = PART_NAMES[key];
        const cols = Math.ceil(names.length / Math.ceil(names.length / 5));
        grid = h('div.parts', { style: { '--cols': String(cols) } }, names.map((label, i) => h('button.part', {
          type: 'button', 'aria-pressed': String(av[key] === i), 'data-k': `${key}-${i}`, on: { click: () => setPart(key, i) },
        }, face({ ...av, [key]: i }, 'calm', 72), h('small', { text: label }))));
      } else if (tab === 'Colours') {
        const sw = (k, label, list) => h('div.field', { style: { marginTop: '12px' } }, h('span.lab', { text: label }),
          h('div.swatches', null, list.map((c, i) => h('button.swatch', {
            type: 'button', style: { background: c }, 'aria-label': `${label} ${i + 1}`, 'aria-pressed': String(av[k] === i), 'data-k': `${k}-${i}`, on: { click: () => setPart(k, i) },
          }))));
        grid = h('div', null, sw('skin', 'Skin', SKINS), sw('hairColour', 'Hair', HAIR_COLOURS), sw('eyeColour', 'Eyes', EYE_COLOURS));
      } else {
        grid = h('div', null, h('div.field', { style: { marginTop: '12px' } }, h('span.lab', { text: 'Livery: your jacket and your quad' }),
          h('div.swatches', null, LIVERIES.map((c, i) => h('button.swatch', {
            type: 'button', style: { background: `#${c.toString(16).padStart(6, '0')}` }, 'aria-label': `Livery ${i + 1}`, 'aria-pressed': String(av.livery === i + 1), 'data-k': `livery-${i}`, on: { click: () => setPart('livery', i + 1) },
          })))),
        h('p.help', { style: { color: 'var(--ink)', fontWeight: '700', maxWidth: '340px' }, text: 'Other pilots see your quad in this colour with an ink outline, and your name above it.' }));
      }
      return scrimmed(h('div.page.fit.sheet.halftone', null,
        h('div.page-head', null, h('div.grow', null, h('span.kicker', { text: 'Your avatar' }), lettered('CHANGE YOUR LOOK', [INKS.cream, INKS.amber], 46, 640))),
        h('div.rule'),
        h('div.page-body', null, h('div.av-stage', null,
          h('div.av-portrait', null, bust(av, expr), h('span.plate', { style: { '--liv': liveryCss(av, 0) } }, h('span', { text: readPilotName() || 'You' }))),
          h('div', { style: { minWidth: '0', display: 'flex', flexDirection: 'column' } },
            h('div.tabs', { role: 'tablist' }, EDITOR_TABS.map((t) => h('button', {
              type: 'button', role: 'tab', 'aria-selected': String(t === tab), 'data-k': `tab-${t}`, 'data-autofocus': t === tab ? true : null, on: { click: () => { tab = t; refresh('editor'); } },
            }, t))),
            grid,
            h('div.field', { style: { marginTop: '14px' } }, h('span.lab', { text: 'Try a face' }),
              h('div.exprs', { role: 'group', 'aria-label': 'Try a face' }, EXPRESSIONS.map((e) => h('button', {
                type: 'button', 'aria-pressed': String(expr === e), 'data-k': `ex-${e}`, on: { click: () => { expr = e; refresh('editor'); } },
              }, face(av, e, 36), h('small', { text: FACE_NAMES[e] }))))),
            session && session.inRoom ? h('p.help', { text: 'The room sees your new look when you press Done.' }) : null))),
        h('div.footer-row', null,
          btn('Done', '', () => back(), { 'data-k': 'done' }),
          btn('Roll again', 'amber', () => {
            store.avatar = rollAvatar();
            save();
            refresh('editor');
          }, { 'data-k': 'reroll' }),
          h('span.note', { text: 'Every change is kept as you make it.' }))));
    }, {
      back: () => {
        pop();
        /* In a room, the others see it too: the board tells everybody,
         * this page included, and the room's list is drawn from that. */
        const now = cleanAvatar(store.avatar);
        if (session && session.inRoom && JSON.stringify(now) !== JSON.stringify(was)) {
          session.look(now);
        }
        if (after) after();
      },
    });
  }

  /* ---- the Rooms shelf ---- */

  let lobbyWay = 'freestyle';
  let lobby = { state: 'loading', rooms: [], counts: null };
  let lobbyTimer = null;
  /* What is typed in the code box, kept across the shelf's refreshes. */
  let lobbyCode = '';

  function stopLobby() {
    if (lobbyTimer) {
      clearInterval(lobbyTimer);
      lobbyTimer = null;
    }
  }

  async function loadLobby() {
    const way = lobbyWay;
    const [got] = await Promise.all([fetchJson(`/api/rooms?way=${encodeURIComponent(way)}`), hasWorld(null)]);
    /* A tab changed while this was in the air: its own fetch answers it. */
    if (way !== lobbyWay) {
      return;
    }
    if (got.ok && got.body && Array.isArray(got.body.rooms)) {
      lobby = { state: 'ok', rooms: got.body.rooms, counts: got.body.counts || null };
    } else {
      lobby = { state: 'offline', rooms: [], counts: null };
    }
    refresh('lobby');
  }

  function openLobby(way) {
    gate(() => {
      lobbyWay = WAY_NAMES[way] ? way : 'freestyle';
      lobby = { state: 'loading', rooms: [], counts: null };
      stopLobby();
      sheetLobby();
      loadLobby();
      lobbyTimer = setInterval(() => {
        if (topName() === 'lobby') {
          loadLobby();
        }
      }, LOBBY_EVERY_MS);
    });
  }

  function roomCard(r) {
    const full = r.n >= r.max;
    const missing = !hasWorldNow(r);
    /* A map this copy lacks has no picture in it either. */
    const pic = missing ? '' : thumbOf(r);
    return h(`button.room${full || missing ? '.is-full' : ''}`, {
      type: 'button',
      'data-k': `room-${r.code}`,
      on: {
        click: () => {
          if (missing) {
            toast('This room flies a map your copy does not have.', 'warn');
            return;
          }
          if (full) {
            sheetCant('full', { code: r.code, room: r });
            return;
          }
          joinNow({ ...r, needsPassword: r.lock }, '');
        },
      },
    },
    h('div.pic', { style: { backgroundImage: pic ? `url("${pic}")` : '' } },
      r.lock ? h('span.tg-lock', { text: 'Password' }) : null,
      h('span.faces', null, (r.faces || []).slice(0, 3).map((a) => face(a, 'calm', 32))),
      h(`span.count${full ? '.full' : ''}`, { text: full ? 'Full' : `${r.n}/${r.max}` })),
    h('div.body', null,
      h('h4', { text: r.name }),
      h('span.map', { text: `${r.mapName}${r.host ? ` · ${r.host} hosting` : ''}` }),
      h('div.tags', null,
        missing ? tag('Not in your copy', 'slate') : null,
        r.streamer ? tag('Streamer room', 'amber') : null,
        r.schoolSafe ? tag('School safe', 'mint') : null,
        (r.tags || []).map((t) => {
          const known = TAGS.find((x) => x.id === t);
          return known ? tag(known.label, known.ink) : null;
        }))));
  }

  function sheetLobby() {
    open('lobby', () => {
      const counts = lobby.counts && lobby.counts[lobbyWay];
      const kicker = counts ? `Chapter 04 · ${counts.rooms} open · ${counts.pilots} flying` : 'Chapter 04';
      const codeInput = h('input.input', {
        id: 'tg-code', value: lobbyCode, placeholder: 'CODE', maxLength: 7, 'aria-label': 'Room code', autocomplete: 'off', 'data-k': 'code', 'data-osk': 'code', 'data-enter': 'code-go',
      });
      codeInput.addEventListener('input', () => {
        codeInput.value = codeInput.value.toUpperCase();
        codeInput.classList.remove('bad');
        lobbyCode = codeInput.value;
      });
      const goCode = () => {
        const c = normaliseCode(codeInput.value);
        if (!c) {
          codeInput.classList.add('bad');
          toast('A code is six letters and numbers.', 'warn');
          return;
        }
        lobbyCode = '';
        joinFlow(c, '', { pressed: true });
      };
      let body;
      if (lobby.state === 'loading') {
        body = h('div.rooms', null, [0, 1, 2, 3].map(() => h('div.room', null, h('div.pic.skeleton', { style: { aspectRatio: '21 / 9', minHeight: '0' } }),
          h('div.body', null, h('div.skeleton', { style: { height: '18px', minHeight: '0', width: '70%' } }), h('div.skeleton', { style: { height: '28px', minHeight: '0' } })))));
      } else if (lobby.state === 'offline') {
        body = h('div.empty', null, h('div', null, h('div.who', { style: { width: '160px', margin: '0 auto' } }, bust(store.avatar, 'oops')),
          lettered("CAN'T REACH THE BOARD", [INKS.cream, INKS.bail], 36, 640),
          h('p', { text: 'Rooms need the internet. Your flight still works: fly solo, and try again when you are back online.' }),
          h('div.btnrow', { style: { justifyContent: 'center' } }, btn('Try again', '', () => { lobby.state = 'loading'; refresh('lobby'); loadLobby(); }, { 'data-k': 'retry' }),
            btn('Fly solo', 'ghost', () => closeAll(), { 'data-k': 'solo' }))));
      } else if (!lobby.rooms.length) {
        body = h('div.empty', null, h('div', null, h('div.who', { style: { width: '160px', margin: '0 auto' } }, bust(store.avatar, 'wow')),
          lettered('NOBODY IS HOSTING', [INKS.cream, INKS.amber], 36, 600),
          h('p', { text: `No listed ${WAY_NAMES[lobbyWay].toLowerCase()} rooms right now. Pick a map and press Fly together, then send the link to a friend.` }),
          h('div.btnrow', { style: { justifyContent: 'center' } }, btn('Pick a map', 'sakura', () => closeAll(), { 'data-k': 'pick' }))));
      } else {
        body = h('div.rooms', null, lobby.rooms.map(roomCard));
      }
      return scrimmed(h('div.page.sheet.halftone', null,
        h('div.page-head', null,
          h('div.grow', null, h('span.kicker', { text: kicker }), lettered('OPEN ROOMS', [INKS.cream, INKS.sakura], 50, 520)),
          btn('Back', 'small ghost', () => back(), { 'data-k': 'back' })),
        h('div.tools', null,
          h('div.seg', { role: 'tablist', 'aria-label': 'Kind of room' }, Object.entries(WAY_NAMES).map(([w, label]) => h(`button.btn.small${w === lobbyWay ? '' : '.ghost'}`, {
            type: 'button', role: 'tab', 'aria-selected': String(w === lobbyWay), 'data-k': `way-${w}`,
            on: {
              click: () => {
                if (w === lobbyWay) return;
                lobbyWay = w;
                lobby = { state: 'loading', rooms: [], counts: lobby.counts };
                refresh('lobby');
                loadLobby();
              },
            },
          }, h('span', { text: label })))),
          h('div.codebox', null, codeInput, btn('Join', 'small', goCode, { 'data-k': 'code-go' })),
          h('button.mapcard.me-chip', { type: 'button', 'data-k': 'me', on: { click: () => sheetEditor(() => refresh('lobby')) } },
            face(store.avatar, 'hello', 38), h('span', null, h('b', { text: readPilotName() || 'You' }), h('small', { text: 'Change look' }))),
          h('button.link', { type: 'button', 'data-k': 'privacy', on: { click: () => sheetPrivacy() } }, 'How rooms keep you safe')),
        h('div.page-body', null, body),
        h('div.footer-row', null, h('span.note', { text: 'Only rooms whose host listed them appear here. Private rooms are joined by link or code.' }),
          STEAM_EDITION ? h('button.link', { type: 'button', 'data-k': 'offline', on: { click: () => goOffline() } }, 'Turn online off') : null)));
    });
  }

  /* ---- hosting ---- */

  /*
   * entry: the picker's chosen map, as ui.js describes it for a room: {
   * map, name, way, thumb, whoop, fly() }. Fly together from the picker.
   */
  function openHost(entry) {
    leaveFirst('Opening a room of your own takes you out of this one. The others carry on without you.', () => gate(() => sheetHost(entry, null)));
  }

  function sheetHost(entry, was, opts = {}) {
    const handle = readPilotName();
    const suggested = handle ? `${handle}'s room`.slice(0, 32) : '';
    const f = {
      name: suggested,
      listed: false,
      password: '',
      max: 16,
      typedChat: true,
      schoolSafe: false,
      streamer: false,
      hide: false,
      tags: entry.way === 'freestyle' ? [] : ['racing'],
      ...(was || {}),
    };
    const bad = (was && was.bad) || new Set();
    open('host', () => {
      const strict = f.listed || f.schoolSafe || f.streamer;
      const most = f.streamer ? STREAM_MAX : ROOM_MAX;
      /* A room that gives everybody a made up name must not show the
       * host's own through its title: the suggestion made from it goes, and
       * comes back if the room is made ordinary again with nothing typed. */
      if (strict && suggested && f.name === suggested) {
        f.name = '';
        f.dropped = true;
      } else if (!strict && f.dropped) {
        f.name = f.name || suggested;
        f.dropped = false;
      }
      const again = () => refresh('host');
      const nameIn = h('input.input', {
        id: 'tg-rname', value: f.name, maxLength: 32, autocomplete: 'off', 'data-k': 'rname', 'data-osk': 'name', class: bad.has('name') ? 'bad' : null,
      });
      nameIn.addEventListener('input', () => { f.name = nameIn.value; });
      const pwIn = h('input.input', {
        id: 'tg-pw', type: 'password', value: f.password, maxLength: 64, placeholder: 'Leave empty for none', autocomplete: 'new-password', 'data-k': 'pw', 'data-osk': 'name', class: bad.has('password') ? 'bad' : null,
      });
      pwIn.addEventListener('input', () => { f.password = pwIn.value; });
      const openRoom = () => {
        const problems = new Set();
        const name = f.name.trim();
        if (name && (name.length < 2 || name.length > 32)) problems.add('name');
        if (f.password && (f.password.length < 4 || f.password.length > 64)) problems.add('password');
        if (problems.size) {
          sheetHost(entry, { ...f, bad: problems }, { replace: true });
          return;
        }
        host(entry, {
          name,
          listed: f.listed,
          schoolSafe: f.schoolSafe,
          streamer: f.streamer,
          typedChat: !strict && f.typedChat,
          hide: strict || f.hide,
          password: f.password || undefined,
          max: f.max,
          tags: f.tags,
        });
      };
      return scrimmed(h('div.page.fit.sheet.halftone', null,
        h('div.page-head', null, h('div.grow', null, h('span.kicker', { text: 'Host a room' }), lettered('FLY TOGETHER', [INKS.cream, INKS.sakura], 50, 560)),
          btn('Cancel', 'small ghost', () => back(), { 'data-k': 'cancel' })),
        h('div.rule'),
        h('div.page-body', null, h('div.tg-cols', null,
          h('div.stack', null,
            h('div.mapcard', null, h('div.pic', { style: { backgroundImage: entry.thumb ? `url("${entry.thumb}")` : '' } }),
              h('div', { style: { flex: '1' } }, h('small', { text: 'Map' }), h('b', { text: entry.name }), h('small', { text: WAY_NAMES[entry.way] || '' }))),
            h('div.field', null, h('label', { for: 'tg-rname', text: 'Room name' }), nameIn,
              bad.has('name') ? h('span.help.bad', { text: SETTINGS_FIELDS.name }) : h('span.help.spare', { text: strict ? 'Leave it empty and the room takes your made up name.' : 'Leave it empty and the room is named after you.' })),
            /* Who can find it decides the size too: a streamer room is for a
             * stream's viewers, who may be eight, so it is never on the
             * shelf and is as safe as a listed room. The board holds it to
             * that. */
            h('div.field', null, h('span.lab', { text: 'Who can find it' }), h('div.radios.three', { role: 'radiogroup' },
              h('button.radio', {
                type: 'button', role: 'radio', 'aria-checked': String(!f.listed && !f.streamer), 'data-k': 'private', on: { click: () => { f.listed = false; f.streamer = false; f.max = Math.min(f.max, ROOM_MAX); again(); } },
              }, h('b', { text: 'Link only' }), h('small', { text: 'Friends join with the link or code.' })),
              h('button.radio', {
                type: 'button', role: 'radio', 'aria-checked': String(f.listed), 'data-k': 'listed', on: { click: () => { f.listed = true; f.streamer = false; f.max = Math.min(f.max, ROOM_MAX); again(); } },
              }, h('b', { text: 'Listed under Rooms' }), h('small', { text: 'Anyone can find it and join.' })),
              h('button.radio', {
                type: 'button', role: 'radio', 'aria-checked': String(f.streamer), 'data-k': 'streamer', on: { click: () => { f.listed = false; f.streamer = true; f.max = STREAM_MAX; again(); } },
              }, h('b', { text: 'Streamer room' }), h('small', { text: `Up to ${STREAM_MAX} viewers, by the code on your stream.` })))),
            h('div.field', null, h('label', { for: 'tg-pw' }, 'Password ', h('span', { style: { fontWeight: '600', textTransform: 'none', letterSpacing: '0' }, text: '(optional)' })), pwIn,
              h(`span.help${bad.has('password') ? '.bad' : ''}`, { text: bad.has('password') ? SETTINGS_FIELDS.password : 'Your invite link skips it, so you never have to say it out loud.' }))),
          h('div.stack', null,
            h('div.field', null, h('span.lab', { text: 'Pilots' }), h('div.stepper', null,
              h('button', { type: 'button', 'aria-label': 'Fewer', 'data-k': 'fewer', on: { click: () => { f.max = Math.max(2, f.max - 1); again(); } } }, '−'),
              h('output', { text: String(f.max) }),
              h('button', { type: 'button', 'aria-label': 'More', 'data-k': 'more', on: { click: () => { f.max = Math.min(most, f.max + 1); again(); } } }, '+')),
            h('span.help.spare', { text: `Up to ${most}. Big rooms are busier on slow connections.` })),
            switchRow('sw-typedChat', 'Typed chat', 'Pilots can type when they are paused. Preset lines are always on.',
              !strict && f.typedChat, () => { f.typedChat = !f.typedChat; again(); },
              { locked: strict, why: strict ? `${f.streamer ? 'Streamer' : f.listed ? 'Listed' : 'School safe'} rooms always use preset lines.` : '' }),
            switchRow('sw-schoolSafe', 'School safe', 'Made up names, preset lines only, addresses hidden.', f.schoolSafe, () => { f.schoolSafe = !f.schoolSafe; again(); }),
            switchRow('sw-hide', HIDE_LABEL, HIDE_SMALL, strict || f.hide, () => { f.hide = !f.hide; again(); },
              { locked: strict, why: strict ? 'Always on in listed, school safe and streamer rooms.' : '' }),
            tagPicker(f, again)))),
        h('div.footer-row', null, btn('Open room', '', openRoom, { 'data-k': 'open', 'data-autofocus': true }),
          h('span.note', { text: f.streamer ? 'Nobody can come in until you show the code on your stream or send the link.'
            : `Nobody can come in until you send the link${f.listed ? ' or they find it under Rooms' : ''}.` }))));
    }, { replace: opts.replace });
  }

  function copyText(text, input) {
    const done = () => toast('Link copied');
    const select = () => {
      if (input) {
        input.focus();
        input.select();
      }
      toast('Select the link and copy it', 'warn');
    };
    try {
      navigator.clipboard.writeText(text).then(done, select);
    } catch (e) {
      select();
    }
  }

  function sheetShare({ first = false, entry = null } = {}) {
    if (!roomToOpen()) {
      return;
    }
    const flyNow = () => {
      closeAll();
      const r = room();
      if (entry && entry.fly && !sameWorld(r)) {
        entry.fly();
      } else if (!shell.flying()) {
        shell.fly();
      }
    };
    open('share', () => {
      const r = heldRoom();
      if (!r) {
        return scrimmed(h('div.card-mid.sheet.halftone', null, h('p', { text: 'The room has closed.' }), btn('Back', 'ghost', () => back())));
      }
      const link = roomUrl(window.location.href, r, { mp: shell.mp });
      const invite = session.invite ? roomUrl(window.location.href, r, { invite: session.invite, mp: shell.mp }) : '';
      const linkIn = h('input.input', { readOnly: true, value: link, 'aria-label': 'Room link', tabindex: '-1' });
      const invIn = h('input.input', { readOnly: true, value: invite, 'aria-label': 'Invite link', tabindex: '-1' });
      const pilots = pilotsList().sort((a, b) => a.id - b.id);
      const pic = (entry && entry.thumb) || thumbOf(r);
      return scrimmed(h('div.page.fit.sheet.halftone', null,
        h('div.page-head', null, h('div.grow', null, h('span.kicker', { text: first ? 'Room open' : r.name }), lettered('INVITE PILOTS', [INKS.cream, INKS.mint], 50, 560)),
          first ? null : btn('Back', 'small ghost', () => back(), { 'data-k': 'back-top' })),
        h('div.rule'),
        h('div.page-body', null, h('div.tg-cols', null,
          h('div.stack', null,
            h('div.field', null, h('span.lab', { text: 'Room code' }), h('div.code-big', { 'aria-label': r.code }, r.code.split('').map((c) => h('span', { text: c }))),
              h('span.help', { text: 'Typed into Join under Rooms, on any copy of WebFPV.' })),
            h('div.field', null, h('span.lab', { text: 'Room link' }), h('div.copyrow', null, linkIn, btn('Copy', 'small', () => copyText(link, linkIn), { 'data-k': 'copy' }))),
            r.lock && invite ? h('div.field', null, h('span.lab', { text: 'Invite link, skips the password' }),
              h('div.copyrow', null, invIn, btn('Copy', 'small', () => copyText(invite, invIn), { 'data-k': 'copy-inv' })),
              h('span.help', { text: 'If it spreads further than you meant, change the password in Room settings and the old one stops working.' })) : null,
            r.streamer && isHost() ? streamField(r) : null),
          h('div.stack', null,
            h('div.mapcard', null, h('div.pic', { style: { backgroundImage: pic ? `url("${pic}")` : '' } }),
              h('div', { style: { flex: '1', minWidth: '0' } }, h('small', { text: isHost() ? 'You are hosting' : 'You are in' }), h('b', { text: r.mapName }),
                h('small', { text: `${r.streamer ? 'Streamer room' : r.listed ? 'Listed' : 'Link only'} · ${pilots.length} of ${r.max}${r.typedChat ? ' · typed chat on' : ''}${r.schoolSafe ? ' · school safe' : ''}` }))),
            h('div.field', null, h('span.lab', { text: 'In the room' }),
              h('div.pane', { style: { border: '3px solid var(--ink)', background: 'var(--white)', padding: '4px 10px', maxHeight: '220px', overflow: 'auto' } },
                pilots.map((p) => pilotRow(p, { actions: false })),
                pilots.length < 2 ? h('p.help', { style: { margin: '6px 0' }, text: 'Just you so far. Pilots appear here as they arrive.' }) : null)),
            h('p.help', { style: { color: 'var(--ink)', fontWeight: '700' }, text: 'A link never pulls anybody in: it shows them the room and asks first.' })))),
        h('div.footer-row', null, first ? btn('Start flying', 'amber', flyNow, { 'data-k': 'fly', 'data-autofocus': true }) : btn('Back to the room', '', () => back(), { 'data-k': 'back', 'data-autofocus': true }),
          first ? h('span.note', { text: 'You can come back to this any time: pause, then Room.' }) : null)));
    }, { back: first ? flyNow : null });
  }

  /*
   * A streamer room's stream, which its viewers prove their names in. On
   * the invite page it saves on its own, so a streamer who has just opened
   * the room can set it before flying; in Room settings it is one more
   * field, f being the settings being edited.
   */
  function streamField(r, f = null) {
    const bad = f ? settingsBad.has('stream') : streamBad;
    const value = f ? f.stream : (streamDraft ?? streamLink(r.stream));
    const id = f ? 'tg-st2' : 'tg-st';
    const input = h('input.input', {
      id, value, maxLength: 200, placeholder: 'twitch.tv/yourname', autocomplete: 'off', spellcheck: 'false', 'data-k': 'stream', 'data-osk': 'name',
      'data-enter': f ? null : 'stream-go', class: bad ? 'bad' : null,
    });
    input.addEventListener('input', () => {
      if (f) f.stream = input.value; else streamDraft = input.value;
    });
    const typed = (f ? f.stream : value) || '';
    const via = namesHere(r);
    let help = 'Your twitch.tv page or your YouTube live link. Viewers who type a code in its chat fly under their own name.';
    if (bad) {
      help = /youtu/i.test(typed) && !(r.streamNames || []).includes('youtube')
        ? 'YouTube names are not switched on here yet. A Twitch page works.' : SETTINGS_FIELDS.stream;
    } else if (via && !f) {
      help = `Viewers type a code in ${streamWhere(r.stream)} to fly as their ${VIA_NAMES[via]} name. Empty it to stop.`;
    }
    const go = () => {
      streamSaving = true;
      streamBad = false;
      session.link.settings({ stream: (streamDraft ?? streamLink(r.stream)).trim() });
      refresh('share');
    };
    return h('div.field', null, h('label', { for: id, text: 'Your stream' }),
      f ? input : h('div.copyrow', null, input, btn(streamSaving ? 'Saving' : 'Use', 'small', go, { 'data-k': 'stream-go', disabled: streamSaving })),
      h(`span.help${bad ? '.bad' : ''}`, { text: help }));
  }

  function askClaim() {
    claimNow = { state: 'asking' };
    session.claim();
    refresh('claim');
  }

  /*
   * Flying as your Twitch or YouTube name: a code to type in the stream's
   * chat, and the board puts the name on the quad when it reads it there.
   * Made up names stay the default; this page is the only way to the
   * other.
   */
  function sheetClaim() {
    const r = roomToOpen();
    const via = namesHere(r);
    if (!r || !via) {
      return;
    }
    const mine = pilot(session.you);
    if (!(mine && mine.via) && !(claimNow && claimNow.state === 'waiting')) {
      askClaim();
    }
    /* The page's Back, and every way off it: a code still waiting is
     * given up, so the board stops reading the chat for it. */
    const stopWaiting = () => {
      if (session && claimNow && (claimNow.state === 'waiting' || claimNow.state === 'asking')) {
        session.claim(true);
        claimNow = null;
      }
      pop();
    };
    open('claim', () => {
      const rr = heldRoom();
      if (!rr || !namesHere(rr)) {
        return scrimmed(h('div.card-mid.sheet.halftone', null, h('p', { text: "This room is not reading a stream's chat right now." }), btn('Back', 'ghost', () => back(), { 'data-k': 'back' })));
      }
      const st = rr.stream;
      const p = pilot(session.you);
      const c = claimNow;
      const kicker = h('span.kicker', { text: `${VIA_NAMES[st.via]} name` });
      if (p && p.via && (!c || c.state === 'done' || c.state === 'asking')) {
        return scrimmed(h('div.card-mid.sheet.halftone', null, kicker,
          lettered("THAT'S YOU", [INKS.cream, INKS.mint], 46, 520),
          h('div.state-row', null, h('div.who', null, bust(store.avatar, 'laugh')),
            h('div.say', { text: `You are flying as ${p.handle}, your ${VIA_NAMES[p.via]} name. Everybody in the room sees it over your quad.` })),
          h('div.btnrow', null,
            btn('Back to the room', '', () => back(), { 'data-k': 'back', 'data-autofocus': true }),
            btn('Use my made up name', 'ghost', () => { session.unname(); claimNow = null; back(); }, { 'data-k': 'unname' }))));
      }
      if (!c || c.state === 'asking') {
        return scrimmed(h('div.card-mid.sheet.halftone', null, kicker,
          lettered('ONE MOMENT', [INKS.cream, INKS.sky], 46, 520),
          h('p.help', { style: { color: 'var(--ink)', fontWeight: '700' }, text: 'Getting your code.' }),
          h('div.btnrow', null, btn('Cancel', 'ghost', stopWaiting, { 'data-k': 'cancel', 'data-autofocus': true }))));
      }
      if (c.state === 'waiting') {
        return scrimmed(h('div.card-mid.sheet.halftone', null, kicker,
          lettered(`FLY AS YOUR ${VIA_NAMES[st.via].toUpperCase()} NAME`, [INKS.cream, INKS.sky], 42, 760),
          h('div.field', null, h('span.lab', { text: `Type this in ${streamWhere(st)}` }),
            h('div.code-big.claim', { 'aria-label': `!fly ${c.code}` }, h('span.word', { text: '!fly' }), c.code.split('').map((ch) => h('span', { text: ch })))),
          h('div.state-row', null, h('div.who', null, bust(store.avatar, 'hello')),
            h('div.say', { text: 'Type it just as it is shown. Your quad takes your name the moment it lands, and the code works for two minutes.' })),
          h('div.btnrow', null, btn('Cancel', 'ghost', stopWaiting, { 'data-k': 'cancel', 'data-autofocus': true }))));
      }
      const says = c.state === 'noChannel' && isHost()
        ? ['NO SUCH CHANNEL', 'oops', `Twitch does not know twitch.tv/${st.id}. Check Your stream on Invite pilots, then try again.`, false]
        : CLAIM_SAYS[c.state] || CLAIM_SAYS.trouble;
      return scrimmed(h('div.card-mid.sheet.halftone', null, kicker,
        lettered(says[0], [INKS.cream, INKS.amber], 46, 560),
        h('div.state-row', null, h('div.who', null, bust(store.avatar, says[1])), h('div.say', { text: says[2] })),
        h('div.btnrow', null,
          says[3] ? btn('Try again', '', askClaim, { 'data-k': 'again', 'data-autofocus': true }) : null,
          btn('Back', says[3] ? 'ghost' : '', () => back(), { 'data-k': 'back', 'data-autofocus': says[3] ? null : true }))));
    }, { back: stopWaiting });
  }

  /* ---- joining ---- */

  function sheetJoin(r, invite) {
    const ofWorld = sameWorld(r);
    /* A listed or school safe room names everybody for them, and a card
     * that promised the pilot's own name would be wrong on arrival. The
     * board says which (ownNames on the room's card); an older board's card
     * does not, and then only school safe is known to. */
    const madeUp = r.ownNames === false || (r.ownNames == null && r.schoolSafe);
    open('join', () => scrimmed(h('div.card-mid.sheet.sakura.halftone', null,
      h('span.kicker', { text: 'Room invite' }),
      lettered(r.host ? `JOIN ${r.host.toUpperCase()}'S ROOM?` : 'JOIN THIS ROOM?', [INKS.cream, INKS.sakura], 42, 680),
      h('div.mapcard', null, h('div.pic', { style: { backgroundImage: `url("${thumbOf(r)}")`, width: '190px' } }),
        h('div', { style: { flex: '1', display: 'grid', gap: '6px' } }, h('b', { text: r.name }),
          h('small', { text: `${WAY_NAMES[r.way] || ''} on ${r.mapName} · ${r.n} of ${r.max} pilots` }),
          h('div.pilots-mini', null, (r.faces || []).map((a) => face(a, 'calm', 34)), r.n > (r.faces || []).length ? tag(`+${r.n - (r.faces || []).length}`) : null),
          h('div.tags', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, tag(WAY_NAMES[r.way] || 'Room', 'sakura'),
            r.streamer ? tag('Streamer room', 'amber') : null,
            r.typedChat ? tag('Typed chat on') : tag('Preset chat'), r.schoolSafe ? tag('School safe', 'mint') : null, r.lock && !invite ? tag('Password', 'amber') : null))),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--ink)', fontWeight: '700', flexWrap: 'wrap' } },
        "You'll fly as", face(store.avatar, 'hello', 40), madeUp ? h('span', { text: r.streamVia && VIA_NAMES[r.streamVia] ? `a made up name, or your ${VIA_NAMES[r.streamVia]} name once you are in` : 'a made up name, chosen by the room' }) : h('b', { text: readPilotName() || 'a made up name' }),
        h('button.link', { type: 'button', 'data-k': 'change', on: { click: () => sheetEditor(() => refresh('join')) } }, 'Change look')),
      ofWorld && sameCraft(r) ? null : h('p.help', { text: ofWorld ? `This room flies ${craftForRoom(r) === 'whoop65' ? 'whoops' : 'five inch quads'}, so joining swaps your quad.` : `Joining loads ${r.mapName}.` }),
      h('div.btnrow', null,
        btn('Join', '', () => joinNow(r, invite), { 'data-autofocus': true, 'data-k': 'join' }),
        btn('Fly solo instead', 'ghost', () => { writeAddressOut(); closeAll(); }, { 'data-k': 'solo' })))));
  }

  function sheetPassword(r, invite, { wrong = false, replace = false } = {}) {
    open('password', () => {
      const pw = h('input.input', {
        id: 'tg-pw2', type: 'password', placeholder: 'Password', maxLength: 64, autocomplete: 'off', 'data-k': 'pw', 'data-osk': 'name', 'data-enter': 'pw-go', 'data-autofocus': true, class: wrong ? 'bad' : null,
      });
      const help = h(`span.help${wrong ? '.bad' : ''}`, { text: wrong ? 'That is not it. After eight misses there is a ten minute wait.' : 'Got an invite link? It skips this.' });
      pw.addEventListener('input', () => pw.classList.remove('bad'));
      const card = h('div.card-mid.sheet.halftone', null,
        h('span.kicker', { text: r.name }),
        lettered('PASSWORD, PLEASE', [INKS.cream, INKS.amber], 42, 640),
        h('div.field', null, h('label', { for: 'tg-pw2', text: `${r.host ? `${r.host}'s room` : 'This room'} has a password` }),
          h('div.copyrow', null, pw, btn('Join', 'small', () => {
            if (pw.value.length < 4) {
              pw.classList.add('bad');
              help.classList.add('bad');
              help.textContent = 'A password is at least four characters.';
              return;
            }
            connect(r, { invite, password: pw.value });
          }, { 'data-k': 'pw-go' })),
          help),
        h('div.btnrow', null, btn('Back', 'ghost small', () => back(), { 'data-k': 'back' })));
      if (wrong) {
        card.classList.add('shake');
      }
      return scrimmed(card);
    }, { replace });
  }

  /* Four plain steps. step: 0 finding the room, 1 checked, 2 loading the
   * world, 3 meeting the pilots. */
  function sheetConnecting({ code = '', room: r = null, hosting = null, step = 0 }) {
    const steps = hosting
      ? ['Opening a room on the board', `Choosing ${hosting.name}`, 'Writing your invite']
      : ['Finding the room', 'Checking the way in', `Loading ${r ? r.mapName : 'the map'}`, 'Meeting the pilots'];
    const at = hosting ? 1 : step;
    const render = () => scrimmed(h('div.card-mid.sheet.halftone', null,
      h('span.kicker', { text: hosting ? 'Fly together' : (r ? r.name : `Room ${code}`) }),
      lettered('HERE WE GO', [INKS.cream, INKS.sky], 44, 600),
      h('div.state-row', null, h('div.who', null, bust(store.avatar, 'fierce')),
        h('div.steps', null, steps.map((s, i) => {
          let cls = 'todo';
          if (i < at) cls = 'done';
          else if (i === at) cls = 'now';
          return h(`div.tg-step.${cls}`, null, h('i', { text: cls === 'done' ? '✓' : cls === 'now' ? '↻' : '' }), s);
        }))),
      h('div.btnrow', null, btn('Cancel', 'ghost small', cancelConnecting, { 'data-k': 'cancel', 'data-autofocus': true }))));
    if (topName() === 'connecting') {
      stack[stack.length - 1].render = render;
      paint();
    } else {
      open('connecting', render, { back: cancelConnecting });
    }
  }

  /* Cancel on the spinner: what was asked for is dropped, an answer still
   * on its way is ignored when it lands, and the pilot is back on the
   * sheet they asked from (the shelf, the host sheet, the join card), or
   * flying when there was none. */
  function cancelConnecting() {
    flowSeq += 1;
    dropSession();
    if (topName() === 'connecting') {
      pop();
    }
  }

  const CANT = {
    full: ['ROOM FULL', 'wow', (c) => `${c.room ? c.room.name : 'That room'} is full${c.room ? `: ${c.room.n} of ${c.room.max}` : ''}. Try again in a moment, when somebody leaves.`, 'retry'],
    notFound: ['NO SUCH ROOM', 'oops', (c) => `No room has the code ${c.code || 'you typed'}. Codes are six letters and numbers, never O, 0, I or 1. Rooms close when the last pilot leaves.`, 'lobby'],
    expired: ['NO SUCH ROOM', 'oops', () => 'That room has closed. Rooms close when the last pilot leaves.', 'lobby'],
    gone: ['NO SUCH ROOM', 'oops', () => 'That room has closed.', 'lobby'],
    kicked: ['YOU WERE REMOVED', 'calm', (c) => `The host took you out of ${c.room ? c.room.name : 'the room'}. You can join again in five minutes.`, 'lobby'],
    banned: ["YOU CAN'T JOIN", 'calm', (c) => `The host has blocked this browser from ${c.room ? c.room.name : 'that room'} until the room closes.`, 'lobby'],
    replaced: ['IN ANOTHER TAB', 'wow', () => 'You joined this room from another tab or window, so this one has left it.', 'solo'],
    version: ['UPDATE FIRST', 'fierce', () => 'This room runs a newer WebFPV. Reload to update. Your settings and avatar stay.', 'reload'],
    tooMany: ['TAKE A BREAK', 'smug', () => 'Too many tries from here. Wait ten minutes, or ask the host for an invite link, which skips the password.', 'lobby'],
    busy: ['ROOMS ARE FULL', 'wow', () => 'Every room the board can hold is open right now. Try again soon.', 'solo'],
    offline: ["CAN'T REACH THE BOARD", 'oops', () => 'Rooms need the internet. Your flight is fine: fly solo, and try again when you are back online.', 'retry'],
    noWorld: ['NOT IN YOUR GAME', 'wow', (c) => `${c.room ? c.room.name : 'That room'} flies ${c.room && c.room.mapName ? c.room.mapName : 'a map'} that this copy of WebFPV does not have. Rooms on the maps and tracks in your game will work.`, 'lobby'],
    noOnline: ['ROOMS ARE OFF', 'calm', () => 'This copy of WebFPV cannot go online, so rooms are off. Everything else works as it did.', 'solo'],
  };

  function sheetCant(why, ctx = {}) {
    const [head, expr, say, next] = CANT[why] || ['COULD NOT JOIN', 'oops', () => 'The board would not open that room. Try again in a moment.', 'solo'];
    const actions = [];
    if (next === 'retry' && (ctx.code || ctx.again)) {
      actions.push(btn('Try again', '', () => {
        pop();
        if (ctx.again) {
          ctx.again();
        } else {
          joinFlow(ctx.code, ctx.invite || '', { pressed: true });
        }
      }, { 'data-k': 'retry', 'data-autofocus': true }));
    }
    if (next === 'reload') {
      actions.push(btn('Reload', '', () => window.location.reload(), { 'data-k': 'reload', 'data-autofocus': true }));
    }
    /* A room of the pilot's own that would not open has no shelf to go
     * back to: the map they picked is under this card. */
    if (next === 'lobby' || (next === 'retry' && !ctx.again)) {
      actions.push(btn('Back to rooms', actions.length ? 'ghost' : '', () => { closeAll(); openLobby(lobbyWay); }, { 'data-k': 'lobby' }));
    }
    actions.push(btn('Fly solo', 'ghost', () => closeAll(), { 'data-k': 'solo' }));
    open('cant', () => scrimmed(h('div.card-mid.sheet.halftone', null,
      lettered(head, [INKS.cream, why === 'banned' || why === 'kicked' ? INKS.bail : INKS.amber], 44, 640),
      h('div.state-row', null, h('div.who', null, bust(why === 'kicked' || why === 'banned' ? (ctx.hostAvatar || store.avatar) : store.avatar, expr)), h('div.say', { text: say(ctx) })),
      h('div.btnrow', null, actions))), { replace: topName() === 'cant' });
  }

  function sheetPrivacy() {
    const blk = (head, text) => h('div.blk', null, h('b', { text: head }), h('p', { text }));
    open('privacy', () => scrimmed(h('div.page.fit.sheet.halftone', null,
      h('div.page-head', null, h('div.grow', null, h('span.kicker', { text: 'Fly together' }), lettered('HOW ROOMS KEEP YOU SAFE', [INKS.cream, INKS.mint], 44, 760)),
        btn('Back', 'small ghost', () => back(), { 'data-k': 'back', 'data-autofocus': true })),
      h('div.rule'),
      h('div.page-body', null, h('div.tg-cols', { style: { color: 'var(--ink)' } },
        h('div.stack', { style: { gap: '14px' } },
          blk('Nobody joins you uninvited', 'Solo flight is always private. You only join a room you pick, and a room only gets people its host invites or lists. A link always asks first.'),
          blk('Other pilots see', 'Your name, your avatar, your quad and what you say. In listed and school safe rooms, a made up name and never your internet address.'),
          blk('Chat', 'Listed rooms talk in preset lines only. Typed chat exists only in private rooms whose host allows it, and the board filters it: no links, no handles, no phone numbers.')),
        h('div.stack', { style: { gap: '14px' } },
          blk('The board sees', "Your address while you are connected, your name, your avatar's part numbers and the room's chat as it goes past. It keeps none of it after the room closes."),
          blk('Reports', "A report sends the room's last 20 lines to the WebFPV admin, kept 30 days. That is the only chat ever stored."),
          blk('Schools', 'School safe rooms give everyone a made up name, preset chat only, and hidden addresses.')))))));
  }

  /* ---------------------------------------------------------------- */
  /* Sheets: in the room                                               */
  /* ---------------------------------------------------------------- */

  let openRow = 0;
  /* Which pilot the card on top is about (a confirm, a report), and
   * whether it is a host tool, so either can close when that changes. */
  let aboutId = 0;
  let aboutHostTool = false;

  function pilotRow(p, { actions = true } = {}) {
    const mine = p.id === session.you;
    const host = p.id === session.link.hostId;
    const isOpen = actions && openRow === p.id && !mine;
    const status = [];
    if (mine) status.push('You');
    else if (p.away) status.push('In the menus');
    else status.push('Flying');
    if (p.via && VIA_NAMES[p.via]) status.push(`${VIA_NAMES[p.via]} name`);
    if (muted.has(p.id)) status.push('muted');
    if (reported.has(p.id)) status.push('reported');
    /* In the room's page a row is a button that opens what can be done
     * about that pilot; in the in-flight list it is only a line. */
    const opens = actions && !mine;
    const row = h(`${opens ? 'button' : 'div'}.pilot${mine ? '.me' : ''}${p.away && !mine ? '.away' : ''}${isOpen ? '.open' : ''}`, {
      type: opens ? 'button' : null,
      'data-k': actions ? `pilot-${p.id}` : null,
      'aria-expanded': opens ? String(isOpen) : null,
      on: {
        click: () => {
          if (!opens) return;
          openRow = openRow === p.id ? 0 : p.id;
          refresh('room');
        },
      },
    }, face(p.avatar, mine ? 'hello' : 'calm', 38), h('div', null, h('b', null, p.handle, host ? crown() : null), h('small', { text: status.join(' · ') })), h('span'),
    opens ? h('span.chev', { 'aria-hidden': 'true', text: '›' }) : h('span'));
    if (!isOpen) {
      return row;
    }
    const acts = h('div.actions', null,
      btn(muted.has(p.id) ? 'Unmute' : 'Mute', 'small ghost', () => {
        if (muted.has(p.id)) muted.delete(p.id); else muted.add(p.id);
        refresh('room');
      }, { 'data-k': `mute-${p.id}` }),
      btn(reported.has(p.id) ? 'Reported' : 'Report', 'small ghost', () => sheetReport(p), { 'data-k': `report-${p.id}`, disabled: reported.has(p.id) }),
      isHost() ? [
        p.via ? btn('Made up name', 'small ghost', () => sheetConfirm('unname', p), { 'data-k': `un-${p.id}` }) : null,
        btn('Make host', 'small amber', () => sheetConfirm('makeHost', p), { 'data-k': `mh-${p.id}` }),
        btn('Kick', 'small danger', () => sheetConfirm('kick', p), { 'data-k': `kick-${p.id}` }),
        btn('Ban', 'small danger', () => sheetConfirm('ban', p), { 'data-k': `ban-${p.id}` }),
      ] : null);
    return [row, acts];
  }

  /* The room's own words, as tags: where, how many, who hosts, and the
   * rules the host chose. */
  function roomTags(r, n) {
    const hp = hostPilot();
    return h('div.infotags', null,
      tag(r.mapName, 'paper'),
      tag(`${n} of ${r.max} pilots`, 'paper'),
      lastLink === 'low' ? tag('Getting back in', 'amber') : null,
      tag(isHost() ? 'You are host' : `Host: ${hp ? hp.handle : 'nobody yet'}`, isHost() ? 'amber' : 'paper'),
      tag(r.streamer ? 'Streamer room' : r.listed ? 'Listed' : 'Link only', r.streamer ? 'amber' : 'paper'),
      tag(r.typedChat ? 'Typed chat on' : 'Preset chat', 'paper'),
      r.lock ? tag('Password', 'paper') : null,
      r.schoolSafe ? tag('School safe', 'mint') : null,
      namesHere(r) ? tag(`${VIA_NAMES[namesHere(r)]} names`, 'paper') : null);
  }

  /* The room's page, from the pause menu's Room row. */
  function sheetRoom() {
    if (!roomToOpen()) {
      return;
    }
    /* Every visit opens with each pilot's tools folded: a row left open
     * last time, pressed now, would fold rather than open. */
    openRow = 0;
    open('room', () => {
      /* Drawn through a drop too, its tags saying so. */
      const r = heldRoom();
      if (!r) {
        return scrimmed(h('div.card-mid.sheet.halftone', null, h('p', { text: 'The room has closed.' }), btn('Back', 'ghost', () => back())));
      }
      const racing = RoomRace.racing(r.way);
      const rc = race && race.race;
      const phase = rc ? rc.phase : 'pit';
      const raceNote = { pit: 'Pit', count: 'Starting', live: 'Racing', results: 'Results' }[phase] || '';
      const pilots = pilotsList().sort((a, b) => (b.id === session.you) - (a.id === session.you) || a.id - b.id);
      return scrimmed(h('div.page.fit.sheet.halftone', null,
        h('div.page-head', null, h('div.grow', null,
          h('span.kicker', { text: `Room · Code ${r.code}` }),
          lettered(r.name.toUpperCase(), [INKS.cream, INKS.sakura], 46, 760),
          roomTags(r, pilots.length)),
        btn('Back', 'small ghost', () => back(), { 'data-k': 'back' })),
        h('div.rule'),
        h('div.roomsheet', null,
          h('div.tg-menu', null,
            racing ? h('button.btn.ghost', {
              type: 'button', 'data-k': 'race', 'data-autofocus': true, on: { click: () => sheetRace() },
            }, h('span', { text: 'Race' }), h('small', { text: raceNote })) : null,
            btn('Talk', 'ghost', () => sheetScene(), { 'data-k': 'talk', 'data-autofocus': racing ? null : true }),
            btn('Invite pilots', 'ghost', () => sheetShare(), { 'data-k': 'invite' }),
            isHost() ? btn('Room settings', 'ghost', () => sheetSettings(), { 'data-k': 'settings' }) : null,
            btn('Your look', 'ghost', () => sheetEditor(() => refresh('room')), { 'data-k': 'look' }),
            namesHere(r) ? btn(`${VIA_NAMES[namesHere(r)]} name`, 'ghost', () => sheetClaim(), { 'data-k': 'claim' }) : null,
            btn('Leave room', 'danger', () => sheetConfirm('leave'), { 'data-k': 'leave' })),
          h('div.pane', null, h('span.lab-h', { text: 'Pilots' }),
            pilots.map((p) => pilotRow(p)),
            h('p.help', { text: pilots.length < 2 ? 'Nobody else is here yet. Invite pilots sends them the link.'
              : isHost() ? 'Pick a pilot to mute, report, kick or ban them, or to hand them the room. Mute is only for you, and the board never knows.'
                : 'Pick a pilot to mute or report them. Mute is only for you, and the board never knows.' })))));
    });
  }

  function sheetConfirm(what, p = null) {
    const words = {
      kick: [`KICK ${p ? p.handle.toUpperCase() : ''}?`, 'They leave the room now and can come back in five minutes.', 'Kick', 'danger'],
      ban: [`BAN ${p ? p.handle.toUpperCase() : ''}?`, 'They leave now, and this browser cannot join again until the room closes.', 'Ban', 'danger'],
      makeHost: [`MAKE ${p ? p.handle.toUpperCase() : ''} HOST?`, 'They get the host tools and you become a pilot. They can hand it back.', 'Make host', 'amber'],
      unname: [`GIVE ${p ? p.handle.toUpperCase() : ''} A MADE UP NAME?`, 'Their quad shows the room\'s made up name instead, and that account cannot use its name in this room again.', 'Made up name', 'danger'],
      leave: ['LEAVE THE ROOM?', 'You carry on flying solo where you are. The room carries on without you.', 'Leave', 'danger'],
    }[what];
    aboutId = p ? p.id : 0;
    aboutHostTool = what !== 'leave';
    const under = stack.length ? stack[stack.length - 1].render : null;
    open('confirm', () => h('div', null, under ? under() : null, h('div.modal-back', null, h('div.modal.sheet.sakura.halftone', null,
      lettered(words[0], [INKS.cream, what === 'makeHost' ? INKS.amber : INKS.bail], 38, 500),
      h('div', { style: { display: 'flex', gap: '14px', alignItems: 'center', color: 'var(--ink)', fontWeight: '700', fontSize: '16px' } },
        face(p ? p.avatar : store.avatar, 'wow', 70), h('span', { text: words[1] })),
      h('div.btnrow', null,
        btn(words[2], words[3], () => {
          if (what === 'leave') {
            leave();
            return;
          }
          session.link.hostAction(what, p.id);
          openRow = 0;
          pop();
        }, { 'data-k': 'yes' }),
        /* Cancel has the focus, so a stray roll right from a radio cannot
         * kick anybody. */
        btn('Cancel', 'ghost', () => back(), { 'data-k': 'no', 'data-autofocus': true }))))));
  }

  let reportBusy = false;

  function sheetReport(p) {
    let why = 'words';
    reportBusy = false;
    aboutId = p.id;
    aboutHostTool = false;
    open('report', () => {
      const sent = reported.has(p.id);
      const under = stack.length > 1 ? stack[stack.length - 2].render : null;
      const card = sent
        ? h('div.modal.sheet.halftone', null, lettered('THANKS', [INKS.cream, INKS.mint], 40, 400),
          h('div.state-row', null, h('div.who', null, bust(store.avatar, 'calm')),
            h('div.say', { style: { fontSize: '17px' }, text: `Sent. ${p.handle} is muted for you. The WebFPV admin reads every report.` })),
          h('div.btnrow', { style: { justifyContent: 'flex-end' } }, btn('Back', '', () => back(), { 'data-k': 'back', 'data-autofocus': true })))
        : h('div.modal.sheet.halftone', null, lettered(`REPORT ${p.handle.toUpperCase()}`, [INKS.cream, INKS.bail], 38, 500),
          h('div.radios', { role: 'radiogroup' }, REPORT_WHYS.map((w) => h('button.radio', {
            type: 'button', role: 'radio', 'aria-checked': String(why === w.id), 'data-k': `why-${w.id}`, on: { click: () => { why = w.id; refresh('report'); } },
          }, h('b', { text: w.label })))),
          h('span.help', { style: { color: 'var(--ink)', fontWeight: '700' }, text: "The room's last 20 chat lines go with the report. Only the WebFPV admin sees it, and it is deleted after 30 days." }),
          h('div.btnrow', null,
            btn(reportBusy ? 'Sending' : 'Send report', 'danger', () => {
              if (reportBusy) return;
              reportBusy = true;
              muted.add(p.id);
              session.report(p.id, why);
              refresh('report');
            }, { 'data-k': 'send', disabled: reportBusy }),
            btn('Cancel', 'ghost', () => back(), { 'data-k': 'cancel', 'data-autofocus': true })));
      return h('div', null, under ? under() : null, h('div.modal-back', null, card));
    });
  }

  let settingsBad = new Set();
  let settingsSaving = false;

  function sheetSettings() {
    const r = roomToOpen();
    if (!r || !isHost()) {
      return;
    }
    const f = {
      name: r.name, max: r.max, listed: r.listed, schoolSafe: r.schoolSafe, typedChat: r.typedChat, hide: r.hide, tags: [...(r.tags || [])], password: '', dropPassword: false,
      stream: streamLink(r.stream),
    };
    settingsBad = new Set();
    settingsSaving = false;
    open('roomSettings', () => {
      const strict = f.listed || f.schoolSafe || r.streamer;
      const again = () => refresh('roomSettings');
      const n = session.link.pilots.size;
      const nameIn = h('input.input', {
        id: 'tg-rn2', value: f.name, maxLength: 32, autocomplete: 'off', 'data-k': 'rname', 'data-osk': 'name', class: settingsBad.has('name') ? 'bad' : null,
      });
      nameIn.addEventListener('input', () => { f.name = nameIn.value; });
      const pwIn = h('input.input', {
        id: 'tg-pw3', type: 'password', value: f.password, maxLength: 64, autocomplete: 'new-password', placeholder: r.lock ? 'Unchanged' : 'None', 'data-k': 'pw', 'data-osk': 'name', class: settingsBad.has('password') ? 'bad' : null,
      });
      pwIn.addEventListener('input', () => { f.password = pwIn.value; });
      const saveIt = () => {
        const msg = {
          name: f.name.trim(), max: f.max, listed: f.listed, schoolSafe: f.schoolSafe, typedChat: !strict && f.typedChat, hide: strict || f.hide, tags: f.tags,
        };
        if (f.password) {
          msg.password = f.password;
        } else if (f.dropPassword) {
          msg.password = '';
        }
        if (r.streamer) {
          msg.stream = f.stream.trim();
        }
        settingsSaving = true;
        settingsBad = new Set();
        session.link.settings(msg);
        again();
      };
      /* A streamer room names everybody for them whatever is switched. */
      const renames = !r.streamer && (f.listed || f.schoolSafe) !== (r.listed || r.schoolSafe);
      return scrimmed(h('div.page.fit.sheet.halftone', null,
        h('div.page-head', null, h('div.grow', null, h('span.kicker', { text: r.name }), lettered('ROOM SETTINGS', [INKS.cream, INKS.amber], 46, 600)),
          btn('Cancel', 'small ghost', () => back(), { 'data-k': 'cancel' })),
        h('div.rule'),
        h('div.page-body', null, h('div.tg-cols', null,
          h('div.stack', null,
            h('div.field', null, h('label', { for: 'tg-rn2', text: 'Room name' }), nameIn, settingsBad.has('name') ? h('span.help.bad', { text: SETTINGS_FIELDS.name }) : null),
            h('div.field', null, h('label', { for: 'tg-pw3', text: 'Password' }), pwIn,
              h(`span.help${settingsBad.has('password') ? '.bad' : ''}`, { text: settingsBad.has('password') ? SETTINGS_FIELDS.password : 'A new one does not remove anyone already here, and retires the old invite link.' }),
              r.lock ? switchRow('sw-drop', 'Remove the password', 'Anybody with the code can join.', f.dropPassword, () => { f.dropPassword = !f.dropPassword; again(); }) : null),
            h('div.field', null, h('span.lab', { text: 'Pilots' }), h('div.stepper', null,
              h('button', { type: 'button', 'aria-label': 'Fewer', 'data-k': 'fewer', on: { click: () => { f.max = Math.max(Math.max(2, n), f.max - 1); again(); } } }, '−'),
              h('output', { text: String(f.max) }),
              h('button', { type: 'button', 'aria-label': 'More', 'data-k': 'more', on: { click: () => { f.max = Math.min(r.streamer ? STREAM_MAX : ROOM_MAX, f.max + 1); again(); } } }, '+')),
            h(`span.help${settingsBad.has('max') ? '.bad' : ''}`, { text: `Never below the ${n} ${n === 1 ? 'pilot' : 'pilots'} already in.` })),
            r.streamer ? streamField(r, f) : null),
          h('div.stack', null,
            switchRow('sw-listed', 'Listed under Rooms', 'Turning this off takes the room off the Rooms shelf. Everyone stays.', !r.streamer && f.listed, () => { f.listed = !f.listed; again(); },
              { locked: r.streamer, why: r.streamer ? 'A streamer room is joined by the code on the stream.' : '' }),
            switchRow('sw-typedChat', 'Typed chat', 'Pilots can type when they are paused.', !strict && f.typedChat, () => { f.typedChat = !f.typedChat; again(); },
              { locked: strict, why: strict ? 'Never in a listed, school safe or streamer room.' : '' }),
            switchRow('sw-schoolSafe', 'School safe', 'Made up names, preset lines only, addresses hidden.', f.schoolSafe, () => { f.schoolSafe = !f.schoolSafe; again(); }),
            switchRow('sw-hide', HIDE_LABEL, HIDE_SMALL, strict || f.hide, () => { f.hide = !f.hide; again(); },
              { locked: strict, why: strict ? 'Always on in listed, school safe and streamer rooms.' : '' }),
            tagPicker(f, again)))),
        h('div.footer-row', null, btn(settingsSaving ? 'Saving' : 'Save', '', saveIt, { 'data-k': 'save', 'data-autofocus': true, disabled: settingsSaving }),
          renames ? h('span.note', { style: { color: 'var(--red)' }, text: f.listed || f.schoolSafe ? 'Saving gives everybody in the room a made up name.' : 'Saving gives everybody their own name back.' }) : null)));
    });
  }

  /* ---- talking, parked ---- */

  let sceneFace = 'calm';
  /* A line half typed, kept while the scene is drawn again for somebody
   * else's line, and while the pilot steps away to the room's page. */
  let sceneDraft = '';

  function sheetScene() {
    if (!roomToOpen()) {
      return;
    }
    open('scene', () => {
      const r = heldRoom() || { typedChat: false };
      const said = log.filter((l) => l.said && !muted.has(l.id));
      const last = said[said.length - 1] || null;
      const mine = (l) => l.id === session.you;
      /* The pilot spoken with: whoever spoke last who is not this pilot,
       * or else the host, or anybody, so the scene is a conversation from
       * the start. Alone, there is nobody on the left. */
      const lastOther = [...said].reverse().find((l) => !mine(l)) || null;
      let other = lastOther ? { avatar: lastOther.avatar, handle: lastOther.handle, id: lastOther.id } : null;
      if (!other) {
        const hp = hostPilot();
        other = (hp && hp.id !== session.you ? hp : null) || pilotsList().find((p) => p.id !== session.you) || null;
      }
      const meLast = Boolean(last && mine(last));
      const left = other ? h(`div.pl${meLast || !last ? '.dim' : ''}`, null, bust(other.avatar, lastOther ? lastOther.face : 'calm'),
        plate(other.handle, other.avatar, other.id, '', 'who-tag')) : null;
      const right = h(`div.pr${meLast ? '' : '.dim'}`, null, bust(store.avatar, sceneFace));
      const before = said.slice(-8, -1).map((l) => h(`div.line${mine(l) ? '.mine' : ''}`, null, l.avatar ? face(l.avatar, l.face, 26) : null, h('b', { text: l.handle }), h('span', { text: l.text })));
      const box = h('div.bigbox', null,
        last ? plate(last.handle, last.avatar, last.id, last.id === session.link.hostId ? ' ♛' : '') : null,
        h('div.scroll', null, last ? last.text : 'Nobody has said anything yet.',
          last ? null : h('span.hint', { text: r.typedChat ? 'Type below, or pick a line. Everybody in the room sees it.' : 'Pick a line below. Everybody in the room sees it.' })));
      const quick = h('div.quickrow', null,
        QUICK.map((q, i) => btn(q.text, 'small ghost', () => sayQuick(i), { 'data-k': `q-${i}`, 'data-autofocus': !r.typedChat && i === 0 ? true : null })),
        btn('Wave', 'small ghost', () => sayQuick(6), { 'data-k': 'wave' }),
        btn('Done', 'small sakura', () => back(), { 'data-k': 'done' }));
      let bar;
      if (r.typedChat) {
        const input = h('input.input', {
          id: 'tg-say', value: sceneDraft, maxLength: 80, placeholder: 'Say something', 'aria-label': 'Say something', autocomplete: 'off', 'data-k': 'say', 'data-osk': 'name', 'data-enter': 'say-go', 'data-autofocus': true,
        });
        input.addEventListener('input', () => { sceneDraft = input.value; });
        const say = () => {
          const text = input.value.trim();
          if (!text) return;
          if (session.chat(text, sceneFace)) {
            sceneDraft = '';
            input.value = '';
          } else {
            /* Kept in the box, to say again once the room is back. */
            waitToast('Not said yet: getting back into the room.');
          }
        };
        bar = h('div.saybar', null, h('div.sheet.halftone.typebox', null,
          TALK_FACES.map((e) => h('button.facebtn', {
            type: 'button', 'aria-pressed': String(sceneFace === e), 'data-k': `face-${e}`, on: { click: () => { sceneFace = e; refresh('scene'); } },
          }, face(store.avatar, e, 36), h('small', { text: FACE_NAMES[e] }))),
          input, btn('Say', 'small', say, { 'data-k': 'say-go' })),
        quick);
      } else {
        bar = h('div.saybar', null, quick);
      }
      return h('div.scene', null, h('div.shade'), left, right, h('div.transcript', { 'aria-live': 'polite' }, before), box, bar);
    });
  }

  /* ---- racing ---- */

  function podium(rc) {
    const rows = (rc.rows || []).slice(0, 3);
    const pod = (row, place) => {
      if (!row) {
        return h('div.pod.empty');
      }
      const p = pilot(row.id);
      const art = h('div.art', null, p ? avatarCanvas(cleanAvatar(p.avatar), { crop: 'bust', size: place === 1 ? 168 : 132, expr: place === 1 ? 'laugh' : row.dnf ? 'oops' : 'smug' }) : null,
        h('span.place', { text: String(place) }));
      return h(`div.pod${place === 1 ? '.first' : ''}`, null, art,
        h('div.cap', null, h('span', { text: p ? p.handle : 'Gone' }), h('span', { text: row.dnf ? 'Out' : fmtMs(row.total) })));
    };
    return h('div.podium', null, pod(rows[1], 2), pod(rows[0], 1), pod(rows[2], 3));
  }

  /* A race word said from the race's page is a pilot going racing: the
   * sheets close and, if they came from the pause menu, the flight goes
   * on, where the pit and the countdown are. */
  function toFlight() {
    closeAll();
    if (shell.paused()) {
      shell.resume();
    }
  }

  function sheetRace() {
    if (!roomToOpen()) {
      return;
    }
    open('race', () => {
      const r = room();
      const rc = race && race.race;
      const phase = rc ? rc.phase : 'pit';
      const ready = rc ? rc.ready.includes(session.you) : false;
      const laps = rc ? rc.laps : 3;
      const host = isHost();
      const n = session.link.pilots.size;
      const rows = [];
      let note = '';
      if (phase === 'pit') {
        rows.push(h('div.btnrow', null,
          btn(ready ? 'Not ready' : 'Ready', ready ? 'ghost' : 'mint', () => { session.link.raceSend({ t: 'ready', on: !ready }); toFlight(); }, { 'data-k': 'ready', 'data-autofocus': true }),
          host ? btn('Start the race', 'amber', () => { session.link.raceSend({ t: 'start' }); toFlight(); }, { 'data-k': 'start' }) : null));
        if (host) {
          rows.push(h('div.field', null, h('span.lab', { text: 'Laps' }), h('div.stepper', { style: { width: '190px' } },
            h('button', { type: 'button', 'aria-label': 'Fewer laps', 'data-k': 'lfewer', on: { click: () => session.link.raceSend({ t: 'laps', n: Math.max(1, laps - 1) }) } }, '−'),
            h('output', { text: `${laps} ${laps === 1 ? 'lap' : 'laps'}` }),
            h('button', { type: 'button', 'aria-label': 'More laps', 'data-k': 'lmore', on: { click: () => session.link.raceSend({ t: 'laps', n: Math.min(RACE_LAPS_MAX, laps + 1) }) } }, '+'))));
        }
        note = host ? 'It starts by itself when everyone flying is ready, or when you press Start. Ready takes you back to the start line.' : 'Press Ready, or G while you fly. The host can start any time, and the countdown puts you on the start line.';
      } else if (phase === 'results') {
        const voted = (rc.votes || []).includes(session.you);
        rows.push(h('div.btnrow', null,
          btn(voted ? 'Voted' : 'One more', 'amber', () => { session.link.raceSend({ t: 'again' }); toFlight(); }, { 'data-k': 'again', 'data-autofocus': voted ? null : true, disabled: voted }),
          host ? btn('Back to the pit', 'ghost', () => { session.link.raceSend({ t: 'pit' }); pop(); }, { 'data-k': 'pit' }) : null,
          voted ? btn('Back', 'ghost', () => back(), { 'data-k': 'back-low', 'data-autofocus': true }) : null));
        note = `${(rc.votes || []).length} of ${n} want one more. More than half and the countdown starts.`;
      } else if (race && race.racing()) {
        /* Back to the race is first and has the focus: retiring is never
         * one stray press away. */
        rows.push(h('div.btnrow', null,
          btn('Back to the race', '', () => back(), { 'data-k': 'back-race', 'data-autofocus': true }),
          btn('Retire', 'danger', () => { session.link.raceSend({ t: 'dnf' }); closeAll(); }, { 'data-k': 'dnf' }),
          host ? btn('Call it off', 'ghost', () => { session.link.raceSend({ t: 'pit' }); pop(); }, { 'data-k': 'pit' }) : null));
        note = 'Every lap is timed on your own screen from GO, so a slow connection never costs you time.';
      } else if (race && race.canJoin()) {
        rows.push(h('div.btnrow', null,
          btn('Join the race', 'mint', () => { joinCount(); toFlight(); }, { 'data-k': 'join-race', 'data-autofocus': true }),
          btn('Back to flying', 'ghost', () => back(), { 'data-k': 'back-fly' }),
          host ? btn('Call it off', 'ghost', () => { session.link.raceSend({ t: 'pit' }); pop(); }, { 'data-k': 'pit' }) : null));
        note = 'The countdown has started without you. There is still time: join and you go on the start line.';
      } else {
        rows.push(h('div.btnrow', null,
          btn('Back to flying', '', () => back(), { 'data-k': 'back-fly', 'data-autofocus': true }),
          host ? btn('Call it off', 'ghost', () => { session.link.raceSend({ t: 'pit' }); pop(); }, { 'data-k': 'pit' }) : null));
        note = 'This race started without you. When it ends, press One more to be in the next.';
      }
      const title = { pit: 'THE PIT', count: 'RACE', live: 'RACE', results: 'RESULTS' }[phase] || 'RACE';
      return scrimmed(h('div.page.fit.sheet.halftone', null,
        h('div.page-head', null, h('div.grow', null, h('span.kicker', { text: `${r ? r.name : ''} · ${r ? r.mapName : ''} · ${laps} ${laps === 1 ? 'lap' : 'laps'}` }),
          lettered(title, [INKS.cream, phase === 'results' ? INKS.mint : INKS.amber], 50, 460)),
        btn('Back', 'small ghost', () => back(), { 'data-k': 'back' })),
        h('div.rule'),
        h('div.page-body', null,
          phase === 'results' && rc && rc.rows && rc.rows.length ? podium(rc) : null,
          h('div.resgrid', null,
            h('div.stack', null, rows, h('p.help', { text: note })),
            standingsTable(rc)))));
    });
  }

  function standingsTable(rc) {
    if (!rc || !rc.rows || !rc.rows.length) {
      const list = pilotsList().sort((a, b) => a.id - b.id);
      return h('div.pane', { style: { border: '3px solid var(--ink)', background: 'var(--white)', padding: '4px 10px' } }, list.map((p) => h('div.pilot', null, face(p.avatar, 'calm', 34),
        h('div', null, h('b', null, p.handle, p.id === session.link.hostId ? crown() : null), h('small', { text: rc && rc.ready.includes(p.id) ? 'Ready' : (p.away ? 'In the menus' : 'Not ready yet') })),
        h('span'),
        h(`span.hanko${rc && rc.ready.includes(p.id) ? '' : '.wait'}`, { text: rc && rc.ready.includes(p.id) ? 'READY' : '...' }))));
    }
    return h('table.restable', null, h('thead', null, h('tr', null, ['#', 'Pilot', 'Best lap', 'Total'].map((t) => h('th', { text: t })))),
      h('tbody', null, rc.rows.map((row, i) => {
        const p = pilot(row.id);
        let total = fmtMs(row.total);
        if (row.dnf) total = row.laps ? `Out, lap ${row.laps + 1}` : 'Out';
        else if (!row.done) total = `Lap ${Math.min(rc.laps, row.laps + 1)}`;
        return h(`tr${row.id === session.you ? '.me' : ''}`, null, h('td.num', { text: String(i + 1) }),
          h('td', null, h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } }, p ? face(p.avatar, 'calm', 26) : null, p ? p.handle : 'Gone')),
          h('td.num', { text: fmtMs(row.best) || '-' }), h('td.num', { text: total }));
      })));
  }

  /* ---------------------------------------------------------------- */
  /* In flight: the chip, banners, the dialogue                        */
  /* ---------------------------------------------------------------- */

  const chip = h('div.roomchip');
  chip.hidden = true;
  const bannerBox = h('div');
  const talk = h('div.talk');
  talk.hidden = true;
  const logBox = h('div.log');
  const helloBox = h('div');
  const qbar = h('div.qbar');
  qbar.hidden = true;
  const roster = h('div.roster');
  roster.hidden = true;
  const pit = h('div.pit.sheet.halftone');
  pit.hidden = true;
  const countBox = h('div.count-big');
  countBox.hidden = true;
  const posBox = h('div.pos');
  posBox.hidden = true;
  const standBox = h('div.standings');
  standBox.hidden = true;
  const toastBox = h('div.tg-toasts');
  layer.append(chip, pit, standBox, posBox, roster, logBox, talk, helloBox, qbar, bannerBox, countBox, toastBox);

  let rosterOn = false;
  let qbarTimer = null;
  let bannerTimer = null;
  let toastTimer = null;
  let dropToastUp = false;

  /* Where the race's own panel may sit: over the flight, and beside the
   * sim's results screen when a room race ends a run, never over a menu. */
  function panelScreen() {
    return shell.flying() || Boolean(shell.results && shell.results());
  }

  function paintChip() {
    const r = heldRoom();
    /* Over the flight, the pause menu and the results, never the title or
     * the picker: frame() says which screen is up. Kept while the page is
     * getting back into the room, when its bars say so. */
    chip.hidden = !r || lastScreen === 'other';
    if (!r) {
      return;
    }
    const n = session.link.pilots.size;
    const hp = hostPilot();
    fill(chip,
      hp ? face(hp.avatar, 'calm', 30) : null,
      h('div', { style: { minWidth: '0' } }, h('b', { text: r.name }), h('small', { text: lastLink === 'low' ? 'Getting back in' : `${r.mapName} · ${r.code}` })),
      h('span.n', { text: `${n}/${r.max}` }),
      h(`span.bars${lastLink === 'good' ? '' : lastLink === 'mid' ? '.mid' : '.low'}`, { 'aria-label': lastLink === 'good' ? 'Connected' : 'Reconnecting' }, h('i'), h('i'), h('i'), h('i')),
    );
  }

  function banner(avatar, expr, head, small, tone = '') {
    clearTimeout(bannerTimer);
    bannerBox.replaceChildren(h(`div.tg-banner${tone ? `.${tone}` : ''}`, null, avatar ? face(avatar, expr || 'calm', 56) : null,
      h('div', null, h('b', { text: head }), small ? h('small', { text: small }) : null)));
    bannerTimer = setTimeout(() => bannerBox.replaceChildren(), BANNER_MS);
    measureLine();
    placeBanner();
  }

  /*
   * The shell's line across the heading ("Throttle up to take off") and
   * where it ends. Measured only when its words or the window change, so
   * the frame loop reads no layout otherwise. A long line, or any line on
   * a small screen, reaches into the room's right hand column, and then
   * the whole column (the chip, and under it the pilots, the pit or the
   * standings) starts under it rather than on its words. At takeoff the
   * line goes and the column goes back up.
   */
  let lineKey = '';
  let lineBottom = 0;
  function measureLine() {
    const line = shell.line ? shell.line() : null;
    const words = line ? line.textContent : '';
    const key = `${words}|${innerWidth}x${innerHeight}`;
    if (key === lineKey) {
      return false;
    }
    lineKey = key;
    lineBottom = 0;
    let intoColumn = false;
    if (words) {
      const at = layer.getBoundingClientRect();
      const column = at.right - 14 - Math.min(360, at.width * 0.4) - 12;
      const range = document.createRange();
      range.selectNodeContents(line);
      for (const r of range.getClientRects()) {
        lineBottom = Math.max(lineBottom, r.bottom - at.top);
        intoColumn = intoColumn || r.right > column;
      }
    }
    const chipTop = Math.round(Math.max(92, lineBottom + 12));
    layer.style.setProperty('--tg-chip-top', intoColumn ? `${chipTop}px` : '');
    layer.style.setProperty('--tg-col-top', intoColumn ? `${chipTop + 62}px` : '');
    return true;
  }

  /* A banner goes under the line, never over it: at a join the two arrive
   * together. Only ever moved down, so it does not jump back up under the
   * pilot's eye when the line goes. */
  function placeBanner() {
    const b = bannerBox.firstElementChild;
    if (!b || !lineBottom) {
      return;
    }
    const top = Math.round(lineBottom + 14);
    if (top > (parseFloat(b.style.top) || b.offsetTop)) {
      b.style.top = `${top}px`;
    }
  }

  /* tone: '' for done (mint), 'warn' for "not that" (amber), 'bad' for
   * something that went wrong (the bail pink). */
  function toast(text, tone = '') {
    dropToastUp = false;
    clearTimeout(toastTimer);
    toastBox.replaceChildren(h(`div.toast${tone ? `.${tone}` : ''}`, { role: 'status', text }));
    toastTimer = setTimeout(() => toastBox.replaceChildren(), TOAST_MS + Math.min(2400, text.length * 25));
  }

  /* A toast that says to wait for the board. Back in, it goes at once,
   * rather than sit under "Back in" saying the opposite. */
  function waitToast(text) {
    toast(text, 'warn');
    dropToastUp = true;
  }

  /* `who` is the pilot when the room's list no longer has them, as for a
   * pilot who has just left. A line keeps its speaker's name and face, so
   * the talk scene can still show it after they go. Joins and leaves are
   * kept apart from what was said, as `event`. */
  function logLine(id, text, faceName = 'calm', who = null, said = false) {
    const p = id == null ? null : (id === (session && session.you) ? me() : pilot(id) || who);
    log.push({
      id, text, face: faceName, at: performance.now(), handle: p ? p.handle : '', avatar: p ? p.avatar : null, said,
    });
    if (log.length > LOG_KEPT) {
      log.splice(0, log.length - LOG_KEPT);
    }
    const line = h(`div.line${said ? '' : '.event'}`, null, p ? face(p.avatar, faceName, 26) : null, p ? h('b', { text: p.handle }) : null, h('span', { text }));
    logBox.append(line);
    while (logBox.childElementCount > 3) {
      logBox.firstElementChild.remove();
    }
    setTimeout(() => line.remove(), 9000);
    refresh('scene');
  }

  /*
   * A line said: the speaker's portrait on the speech box, the words typed
   * out, the mouth moving while they are. Then into the log above. During
   * a race the box stays folded and only the log line shows, so nothing
   * big covers the track.
   */
  let talkTimers = [];

  function spoken(kind, data) {
    if (muted.has(data.id)) {
      return;
    }
    const p = data.id === session.you ? me() : pilot(data.id);
    if (!p) {
      return;
    }
    let text;
    let expr;
    if (kind === 'say') {
      const q = QUICK_BY_LINE.get(data.line);
      if (!q) return;
      text = q.text;
      expr = q.face;
    } else {
      text = String(data.text || '');
      expr = EXPRESSIONS.includes(data.face) ? data.face : 'calm';
    }
    showLine(p, data.id, text, expr);
  }

  function showLine(p, id, text, expr) {
    /* The big box only over the flight: on the pause menu it would sit on
     * the rows, and in a race on the track. The log line always. */
    if (racingNow() || !shell.flying()) {
      logLine(id, text, expr, null, true);
      return;
    }
    for (const t of talkTimers) clearTimeout(t);
    talkTimers = [];
    const shut = avatarCanvas(cleanAvatar(p.avatar), { crop: 'bust', size: 170, expr, open: false });
    const openMouth = avatarCanvas(cleanAvatar(p.avatar), { crop: 'bust', size: 170, expr, open: true });
    for (const c of [shut, openMouth]) {
      c.style.width = '100%';
      c.style.height = 'auto';
    }
    openMouth.style.display = 'none';
    const words = h('span');
    talk.replaceChildren(h('div.portrait.in', null, shut, openMouth), h('div.box', null, plate(p.handle, p.avatar, id), words));
    talk.hidden = false;
    talk.classList.remove('fade');
    let i = 0;
    const typer = setInterval(() => {
      i += 1;
      words.textContent = text.slice(0, i);
      const flap = i < text.length && Math.floor((i * TYPE_MS) / FLAP_MS) % 2 === 1;
      openMouth.style.display = flap ? '' : 'none';
      shut.style.display = flap ? 'none' : '';
      if (i >= text.length) {
        clearInterval(typer);
      }
    }, TYPE_MS);
    talkTimers.push(typer);
    talkTimers.push(setTimeout(() => talk.classList.add('fade'), TALK_SHOW_MS));
    talkTimers.push(setTimeout(() => {
      talk.hidden = true;
      talk.classList.remove('fade');
    }, TALK_SHOW_MS + 1200));
    logLine(id, text, expr, null, true);
  }

  function sayQuick(i) {
    const q = i === 6 ? WAVE : QUICK[i];
    if (!q || !session) {
      return;
    }
    if (!session.inRoom) {
      if (heldRoom()) {
        waitToast('Not said: getting back into the room.');
      }
      return;
    }
    /* Shown when the board says it back, as a typed line is: a line it
     * refuses as too quick was never said, and must not look said. */
    session.say(q.line);
    if (!qbar.hidden) {
      qbar.querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k === i));
      clearTimeout(qbarTimer);
      qbarTimer = setTimeout(() => { qbar.hidden = true; }, 900);
    }
  }

  function toggleQbar() {
    if (!qbar.hidden) {
      qbar.hidden = true;
      return;
    }
    qbar.replaceChildren(...[...QUICK, WAVE].map((q, i) => h('button', { type: 'button', on: { click: () => sayQuick(i) } },
      h('kbd', { text: String(i + 1) }), face(store.avatar, q.face, 44), h('span', { text: q === WAVE ? 'Wave' : q.text }))));
    qbar.hidden = false;
    clearTimeout(qbarTimer);
    qbarTimer = setTimeout(() => { qbar.hidden = true; }, QBAR_MS);
  }

  function paintRoster() {
    const r = room();
    if (!r) {
      roster.hidden = true;
      return;
    }
    const pilots = pilotsList().sort((a, b) => a.id - b.id);
    fill(roster, h('h5', null, lettered('PILOTS', [INKS.cream, INKS.sakura], 26, 200), tag(`${pilots.length} of ${r.max}`, 'ink')),
      pilots.map((p) => pilotRow(p, { actions: false })));
    roster.hidden = false;
  }

  function toggleRoster() {
    rosterOn = !rosterOn;
    if (rosterOn) {
      paintRoster();
    } else {
      roster.hidden = true;
    }
  }

  /* The proximity hello: a burst over the dialogue, once per pair, the
   * rest queued. Worked out from what this page already draws, so it sends
   * nothing. */
  function near(id, d2) {
    if (d2 > HELLO_RANGE_M2) {
      return;
    }
    nearAt.set(id, performance.now());
    if (helloed.has(id) || muted.has(id) || racingNow() || !session || id === session.you) {
      return;
    }
    helloed.add(id);
    helloQueue.push(id);
    pumpHello();
  }

  let helloShowing = false;

  function pumpHello() {
    if (helloShowing || !helloQueue.length) {
      return;
    }
    const now = performance.now();
    while (helloTimes.length && now - helloTimes[0] > 60000) helloTimes.shift();
    if (helloTimes.length >= HELLOS_PER_MINUTE) {
      setTimeout(pumpHello, 60000 - (now - helloTimes[0]) + 50);
      return;
    }
    /* A hello is for a pilot near now. Four a minute is the most, so a
     * crowd on the start pad, which is how a big room begins, queues dozens
     * that would otherwise greet pilots a field away for a quarter of an
     * hour. One gone by is greeted the next time they are near. */
    let id = 0;
    while (helloQueue.length && !id) {
      const next = helloQueue.shift();
      if (pilot(next) && now - (nearAt.get(next) || -Infinity) < HELLO_FRESH_MS) {
        id = next;
      } else {
        helloed.delete(next);
      }
    }
    const p = id ? pilot(id) : null;
    if (!p) {
      return;
    }
    helloTimes.push(now);
    helloShowing = true;
    const hi = document.createElement('canvas');
    hi.className = 'lettered';
    hi.setAttribute('aria-hidden', 'true');
    try {
      paintTitle(hi, [{ text: 'HI!', fill: INKS.cream }], 46, { maxW: 110 });
    } catch (e) {
      /* No lettering: the plate says who. */
    }
    helloBox.replaceChildren(h('div.hello', null, h('div.burst-ink'), h('div.burst'), h('div.who', null, face(p.avatar, 'hello', 70)), hi,
      plate(p.handle, p.avatar, id), helloQueue.length ? h('span.queue', { text: `+${helloQueue.length}` }) : null));
    setTimeout(() => {
      helloBox.replaceChildren();
      helloShowing = false;
      pumpHello();
    }, HELLO_SHOW_MS);
  }

  function clearOverlays() {
    chip.hidden = true;
    talk.hidden = true;
    qbar.hidden = true;
    roster.hidden = true;
    rosterOn = false;
    pit.hidden = true;
    countBox.hidden = true;
    posBox.hidden = true;
    standBox.hidden = true;
    logBox.replaceChildren();
    helloBox.replaceChildren();
    helloQueue.length = 0;
    nearAt.clear();
    log.length = 0;
    countShown = '';
  }

  /* ---------------------------------------------------------------- */
  /* Racing on screen                                                  */
  /* ---------------------------------------------------------------- */

  function racingNow() {
    return Boolean(race && race.race && (race.race.phase === 'count' || race.race.phase === 'live') && race.racing());
  }

  function raceChanged() {
    const r = room();
    if (!r || !race || !RoomRace.racing(r.way)) {
      pit.hidden = true;
      standBox.hidden = true;
      posBox.hidden = true;
      return;
    }
    const rc = race.race || { phase: 'pit', laps: 3, ready: [], racers: [], rows: [] };
    paintPit(rc);
    paintStandings(rc);
    refresh('race');
  }

  function paintPit(rc) {
    const show = rc.phase === 'pit' || rc.phase === 'results';
    pit.hidden = !show || !panelScreen();
    if (!show) {
      return;
    }
    const host = isHost();
    const ready = rc.ready.includes(session.you);
    if (rc.phase === 'results') {
      const voted = (rc.votes || []).includes(session.you);
      const top = (rc.rows || []).slice(0, 3);
      fill(pit,
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } }, h('span.kicker', { text: 'Results' }), tag(`${rc.laps} ${rc.laps === 1 ? 'lap' : 'laps'}`, 'amber'),
          tag(`One more: ${(rc.votes || []).length} of ${session.link.pilots.size}`)),
        lettered('RESULTS', [INKS.cream, INKS.mint], 34, 220),
        top.map((row, i) => {
          const p = pilot(row.id);
          return h('div.pilot', null, p ? face(p.avatar, i === 0 ? 'laugh' : 'calm', 34) : h('span'),
            h('div', null, h('b', { text: `${i + 1}. ${p ? p.handle : 'Gone'}` }), h('small', { text: row.dnf ? 'Out' : `${fmtMs(row.total)} · best ${fmtMs(row.best)}` })), h('span'));
        }),
        h('div.btnrow', { style: { marginTop: '10px' } },
          btn(voted ? 'Voted' : 'One more', 'amber small', () => session.link.raceSend({ t: 'again' }), { disabled: voted }),
          host ? btn('Back to the pit', 'ghost small', () => session.link.raceSend({ t: 'pit' })) : null),
        h('span.help', { text: voted ? 'Waiting for the others. More than half and the countdown starts.' : 'G for one more. More than half say yes and the countdown starts.' }));
      return;
    }
    fill(pit,
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } }, h('span.kicker', { text: 'Next race' }),
        tag(`${rc.laps} ${rc.laps === 1 ? 'lap' : 'laps'}`, 'amber'), tag(`${rc.ready.length} of ${session.link.pilots.size} ready`)),
      lettered('PIT', [INKS.cream, INKS.amber], 34, 200),
      pilotsList().sort((a, b) => a.id - b.id).slice(0, 8).map((p) => h('div.pilot', null, face(p.avatar, 'calm', 34),
        h('div', null, h('b', null, p.handle, p.id === session.link.hostId ? crown() : null), h('small', { text: rc.ready.includes(p.id) ? 'Ready' : (p.away ? 'In the menus' : 'Still flying') })),
        h(`span.hanko${rc.ready.includes(p.id) ? '' : '.wait'}`, { text: rc.ready.includes(p.id) ? 'READY' : '...' }))),
      h('div.btnrow', { style: { marginTop: '10px' } },
        btn(ready ? 'Not ready' : 'Ready', ready ? 'ghost small' : 'mint small', () => session.link.raceSend({ t: 'ready', on: !ready })),
        host ? btn('Start', 'amber small', () => session.link.raceSend({ t: 'start' })) : null),
      h('span.help', { text: host ? 'G to ready up. It starts when everyone is ready, or press Start.' : 'G to ready up. The countdown puts you on the start line.' }));
  }

  function paintStandings(rc) {
    const live = rc.phase === 'count' || rc.phase === 'live';
    const here = panelScreen();
    standBox.hidden = !live || !here || !rc.rows || !rc.rows.length;
    posBox.hidden = !live || !here || !race.racing();
    if (!live) {
      return;
    }
    const rows = rc.rows || [];
    const leader = rows[0];
    const watch = watchLine();
    watchShown = watch;
    standBox.replaceChildren(...rows.slice(0, 8).map((row, i) => {
      const p = pilot(row.id);
      let right = '';
      if (row.dnf) right = 'Out';
      else if (row.done) right = i === 0 ? fmtMs(row.total) : `+${fmtMs(row.total - leader.total)}`;
      else right = `Lap ${Math.min(rc.laps, row.laps + 1)}`;
      return h(`div.r${row.id === session.you ? '.me' : ''}`, null, h('span', { text: String(i + 1) }), p ? face(p.avatar, 'calm', 24) : h('span'),
        h('span', { text: p ? p.handle : 'Gone' }), h('i', { text: right }));
    }), ...(watch ? [h('div.watch', { text: watch })] : []));
    const mine = rows.findIndex((x) => x.id === session.you);
    if (mine >= 0) {
      const row = rows[mine];
      const ahead = mine > 0 ? rows[mine - 1] : null;
      const ap = ahead ? pilot(ahead.id) : null;
      fill(posBox, h('div.big', null, `P${mine + 1}`, h('small', { text: `/${rows.length}` })),
        row.done ? h('div.split', { text: `Home in ${fmtMs(row.total)}` })
          : ahead && ahead.laps === row.laps && ap ? h('div.split', { text: `Chasing ${ap.handle}` }) : null);
    }
  }

  /* What a pilot the race on now has left out can do about it, under its
   * standings, and what that said when last painted. */
  let watchShown = '';
  function watchLine() {
    if (!race || race.racing()) {
      return '';
    }
    if (race.phase === 'count') {
      return race.canJoin() ? 'G to join before GO' : 'Watching this one';
    }
    return race.phase === 'live' ? 'Watching. One more to join next' : '';
  }

  /* Into a countdown that began without this pilot, while the board can
   * still put them on its grid. Too late says so, rather than nothing. */
  function joinCount() {
    if (race && race.canJoin()) {
      session.link.raceSend({ t: 'ready', on: true });
    } else {
      toast('Too late for this one. One more at the end puts you in the next.');
    }
  }

  let countShown = '';

  function paintCount() {
    const rc = race && race.race;
    const counting = rc && race.holding();
    const toGo = counting ? race.toGo() : null;
    let word = '';
    if (counting && toGo != null) {
      if (toGo > 3000) word = 'READY';
      else if (toGo > 0) word = String(Math.ceil(toGo / 1000));
    } else if (race && race.goFor && rc && rc.n === race.goFor && performance.now() - race.goLocal < 900) {
      word = 'GO!';
    }
    if (word === countShown) {
      return;
    }
    countShown = word;
    countBox.hidden = !word;
    if (!word) {
      countBox.replaceChildren();
      return;
    }
    const c = document.createElement('canvas');
    /* The numbers each have a second and go out with it; READY has two,
     * and comes in and stays until the 3 replaces it. */
    c.className = word === 'READY' ? 'lettered hold' : 'lettered';
    c.setAttribute('aria-hidden', 'true');
    try {
      paintTitle(c, [{ text: word, fill: word === 'GO!' ? INKS.mint : INKS.cream }], word === 'READY' ? 120 : 190, { maxW: Math.min(700, window.innerWidth - 40) });
    } catch (e) {
      /* The words are read below. */
    }
    countBox.replaceChildren(h('div.speedlines'), c, h('span.tg-sr', { role: 'status', text: word }));
  }

  /* ---------------------------------------------------------------- */
  /* Once a frame                                                      */
  /* ---------------------------------------------------------------- */

  let lastScreen = '';
  let falseStartAt = 0;

  function frame(now) {
    if (boot && shell.ready()) {
      const b = boot;
      boot = null;
      bootJoin(b);
    }
    if (measureLine()) {
      placeBanner();
    }
    if (!session) {
      return;
    }
    let screen = 'other';
    if (shell.flying()) screen = 'flight';
    else if (shell.paused()) screen = 'paused';
    else if (shell.results && shell.results()) screen = 'results';
    if (screen !== lastScreen) {
      lastScreen = screen;
      const r = room();
      chip.hidden = !heldRoom() || screen === 'other';
      if (screen !== 'flight') {
        qbar.hidden = true;
        roster.hidden = true;
        talk.hidden = true;
      } else if (rosterOn) {
        paintRoster();
      }
      if (r && race) {
        raceChanged();
      }
    }
    const r = room();
    if (!r || !race || !RoomRace.racing(r.way)) {
      return;
    }
    /* The grid and a false start are the room's track's: a pilot who has
     * wandered to another world is not put on that world's start line. */
    const here = sameWorld(r);
    const what = race.frame();
    /* The last moment to join passes with no word from the board. */
    if (race.phase === 'count' && !standBox.hidden && watchLine() !== watchShown) {
      paintStandings(race.race);
    }
    if (what === 'grid' && here) {
      shell.grid();
      toast('On the grid. Wait for GO.');
    }
    if (here && race.holding() && shell.airborne() && now - falseStartAt > 1000) {
      falseStartAt = now;
      shell.grid();
      toast('False start! Back on the grid. Wait for GO.', 'bad');
    }
    if (race.holding() || countShown) {
      paintCount();
    }
  }

  /* A lap the sim's own race counted, its finish crossing at crossLocal on
   * the frame clock. */
  function lap(crossLocal) {
    /* Laps of the room's own track only: the sim counts laps on whatever
     * it is flying, and another track's are not this race's. */
    if (race && race.racing() && sameWorld(room())) {
      race.lap(crossLocal);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Keys and the pad                                                  */
  /* ---------------------------------------------------------------- */

  function handleKey(code, repeat) {
    if (!modal.hidden) {
      const dirs = {
        ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0],
      };
      padHands = false;
      if (dirs[code]) {
        moveFocus(dirs[code][0], dirs[code][1]);
      } else if (!repeat && (code === 'Enter' || code === 'Space')) {
        press();
      } else if (!repeat && (code === 'Escape' || code === 'Backspace')) {
        back();
      }
      return true;
    }
    if (!heldRoom() || repeat) {
      return false;
    }
    if (!session.inRoom) {
      /* A drop: the keys that talk to the room say why nothing happens. */
      if (shell.flying() && (/^Digit[1-7]$/.test(code) || code === 'Enter')) {
        waitToast('Not said: getting back into the room.');
        return true;
      }
      return false;
    }
    /* G answers the race's panel, which also sits beside the results. */
    if (code === 'KeyG' && race && race.race && panelScreen()) {
      const rc = race.race;
      if (rc.phase === 'pit') {
        session.link.raceSend({ t: 'ready', on: !rc.ready.includes(session.you) });
        return true;
      }
      if (rc.phase === 'results') {
        session.link.raceSend({ t: 'again' });
        return true;
      }
      if (rc.phase === 'count' && !race.racing()) {
        joinCount();
        return true;
      }
    }
    if (!shell.flying()) {
      return false;
    }
    const digit = /^Digit([1-7])$/.exec(code);
    if (digit) {
      sayQuick(Number(digit[1]) - 1);
      return true;
    }
    if (code === 'KeyQ') {
      toggleQbar();
      return true;
    }
    if (code === 'Tab') {
      toggleRoster();
      return true;
    }
    if (code === 'Enter') {
      sheetScene();
      return true;
    }
    return false;
  }

  /* Tab moves the browser's focus unless it is stopped, and in flight in a
   * room it is the pilots list. */
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Tab') {
      return;
    }
    if (modal.hidden && session && session.inRoom && shell.flying()) {
      e.preventDefault();
    } else if (!modal.hidden && !modal.contains(e.target)) {
      /* A sheet is up and the focus is somewhere behind it, after a click
       * on the scrim: Tab brings it back to the sheet. */
      e.preventDefault();
      const first = focusables()[0];
      if (first) first.focus();
    }
  }, true);

  const padHeld = { at: 0, dir: '' };
  let padPrev = {};
  let padWait = true;
  /* The press that took the last sheet down, still held. The menu behind
   * would read it as a press of its own the moment it had the pad again,
   * so one B closed the host sheet and backed the picker out to the title
   * as well. The pad stays here until it comes up. */
  let padHolding = false;

  function wantsPad() {
    return !modal.hidden || padHolding;
  }

  /* Called only while wantsPad(); open() sets padWait for each sheet that
   * opens over no other. */
  function pollPad(nav, nowMs) {
    if (!nav) {
      return false;
    }
    if (modal.hidden) {
      padHolding = Boolean(nav.select || nav.back || nav.up || nav.down || nav.left || nav.right);
      padPrev = { ...nav };
      return true;
    }
    /* A sheet that has just opened waits for the sticks to rest and the
     * buttons to come up before it listens (src/input/padgate.js). */
    if (padWait) {
      const quiet = (nav.calm !== false) && !nav.select && !nav.back && !nav.up && !nav.down && !nav.left && !nav.right;
      if (quiet) {
        padWait = false;
      }
      padPrev = { ...nav };
      return true;
    }
    if (nav.select || nav.back || nav.up || nav.down || nav.left || nav.right) {
      padHands = true;
    }
    if (nav.select && !padPrev.select) {
      press();
    } else if (nav.back && !padPrev.back) {
      back();
    }
    if (modal.hidden) {
      padHolding = true;
      padPrev = { ...nav };
      return true;
    }
    const dir = ['up', 'down', 'left', 'right'].find((d) => nav[d]) || '';
    const step = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    if (dir) {
      if (dir !== padHeld.dir) {
        padHeld.dir = dir;
        padHeld.at = nowMs + PAD_REPEAT_FIRST_MS;
        moveFocus(...step[dir]);
      } else if (nowMs >= padHeld.at) {
        padHeld.at = nowMs + PAD_REPEAT_MS;
        moveFocus(...step[dir]);
      }
    } else {
      padHeld.dir = '';
    }
    padPrev = { ...nav };
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* The way in from an address                                        */
  /* ---------------------------------------------------------------- */

  /* A room's address on the page: read it, take the invite out of the
   * address bar at once, and wait for the world before asking. */
  function startFromAddress() {
    const a = readRoomAddress(window.location.search, window.location.hash);
    if (!a.code) {
      return false;
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('i');
      if (/(^|&)i=/.test(url.hash.replace(/^#/, ''))) {
        url.hash = '';
      }
      window.history.replaceState(window.history.state, '', url.href);
    } catch (e) {
      /* Left as it was. */
    }
    boot = a;
    return true;
  }

  function bootJoin(a) {
    let token = null;
    try {
      token = takeJoinToken(window.sessionStorage, a.code, Date.now());
    } catch (e) {
      token = null;
    }
    joinFlow(a.code, a.invite || (token ? token.invite : ''), { pressed: Boolean(token) });
  }

  /* ---------------------------------------------------------------- */
  /* The pause menu's rows                                             */
  /* ---------------------------------------------------------------- */

  function act(action) {
    /* The pause rows stay through a drop, so Leave and Quit still work;
     * the room's own pages say they wait for the board (roomToOpen). */
    if (action === 'room-sheet') {
      sheetRoom();
    } else if (action === 'room-invite') {
      sheetShare();
    } else if (action === 'room-leave') {
      sheetConfirm('leave');
    } else if (action === 'room-quit') {
      dropSession();
    } else if (action === 'room-talk') {
      sheetScene();
    }
  }

  return {
    /* For the frame loop: the session while in a room or getting back
     * into one, never one still knocking, which has no room to draw. */
    get session() {
      return heldRoom() ? session : null;
    },
    get anySession() {
      return session;
    },
    openLobby,
    openHost,
    startFromAddress,
    act,
    frame,
    lap,
    near,
    handleKey,
    wantsPad,
    pollPad,
    /* Whether a room race has this pilot's run: the sim keeps its own
     * results screen out of the way, as it does for a career lesson. */
    ownsRun() {
      return racingNow();
    },
    /* Whether this pilot is in a race room, where the room's panel says
     * what starts and the map's own promise of no clock would be wrong. */
    raceRoom() {
      const r = room();
      return Boolean(r && race && RoomRace.racing(r.way));
    },
    inRoom() {
      return Boolean(room());
    },
    modalOpen() {
      return !modal.hidden;
    },
    /* For scripts/together-shots.js: what is on screen, by name. */
    debugState() {
      return {
        sheet: topName(),
        inRoom: Boolean(room()),
        code: room() ? room().code : '',
        stream: room() && room().stream ? `${room().stream.via}:${room().stream.id}` : '',
        max: room() ? room().max : 0,
        claim: claimNow ? claimNow.state : '',
        you: session ? session.you : 0,
        host: session ? session.link.hostId : 0,
        link: session ? session.link.state : '',
        pilots: pilotsList().length,
        race: race && race.race ? race.race.phase : '',
        racing: racingNow(),
        direct: session ? session.peers.openCount() : 0,
        peerPoses: session ? session.peerPoses : 0,
        hands: padHands ? 'pad' : 'keys',
      };
    },
    leave,
  };
}

export { CODE_RE };
