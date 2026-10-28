/*
 * filmhud.js: what the pilot sees of the filming game on Drift Matsuri
 * (src/game/film.js, src/maps/drift/). A camera's viewfinder over the FPV
 * picture, because the pilot is the camera:
 *
 *   - the corner brackets of a viewfinder, and a focus box that sits on
 *     the car being scored, so the pilot can see what the judge sees;
 *   - REC and the take's timecode, top left, the take's number under it;
 *   - the slate down the left: who is in the shot, the three things a shot
 *     is scored on as bars (Frame, Close, Steady), what it is worth right
 *     now (tandem, zone), and the take's points in mint;
 *   - lettered callouts down the right in the chase's hand and place
 *     (ACTION!, MONEY SHOT!, THROUGH THE SMOKE!, LOST THE SHOT, CUT!);
 *   - and when the take is cut, the card in the middle: the grade stamped
 *     on it, the points, the three scores, and the best take on this
 *     browser.
 *
 * Nothing here covers the centre third but the focus box, which is a thin
 * line round the car the pilot is already looking at. Every write is
 * guarded on a change, as the score's are, and the focus box moves by a
 * transform, so a frame costs a few comparisons.
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

import { TAKE_MS } from '../game/film.js';
import {
  INKS, callSize, letterCanvas, paintCall, paintTitle, sideRoom,
} from './lettering.js';

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

/* How long a callout is up, ms: the chase-call keyframes in index.html. */
const CALL_MS = 1800;
const CALL_MAX = 3;
const COLUMN_RIGHT = 40;

/* The timecode: minutes, seconds and frames at 30 a second, as a camera's. */
function timecode(ms) {
  const t = Math.max(0, Math.floor(ms));
  const s = Math.floor(t / 1000);
  const f = Math.floor((t - s * 1000) * 30 / 1000);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  const two = (n) => (n < 10 ? `0${n}` : String(n));
  return `${two(m)}:${two(r)}:${two(f)}`;
}

/* What a callout says, and in which ink. */
export function filmCallText(e) {
  switch (e.type) {
    case 'action':
      return { word: 'Action!', line: 'Find the battle', fill: INKS.amber };
    case 'money':
      return { word: 'Money shot!', line: `${e.zone}  +${e.points}`, fill: INKS.amber };
    case 'smoke':
      return { word: 'In the smoke!', line: `+${e.points}`, fill: INKS.drift };
    case 'lost':
      return { word: 'Lost the shot', line: 'Find a car', fill: INKS.bail, lost: true };
    case 'cut':
      return { word: 'Cut!', line: "That's a take", fill: INKS.cream };
    case 'crash':
      return { word: 'Cut!', line: 'Camera down', fill: INKS.bail, lost: true };
    default:
      return null;
  }
}

function bar(label) {
  const row = el('div', 'film-bar');
  row.append(el('span', 'film-bar-label', label));
  const track = el('span', 'film-bar-track');
  const fill = el('span', 'film-bar-fill');
  track.append(fill);
  row.append(track);
  return { row, fill, last: -1 };
}

export class FilmHud {
  constructor(root) {
    this.root = el('div', 'film-hud is-off');

    /* The viewfinder: four brackets and the focus box. */
    this.finder = el('div', 'film-finder');
    for (const k of ['tl', 'tr', 'bl', 'br']) {
      this.finder.append(el('span', `film-corner is-${k}`));
    }
    this.focus = el('div', 'film-focus is-off');
    this.finder.append(this.focus);

    /* REC and the timecode. */
    this.rec = el('div', 'film-rec score-cut');
    this.dot = el('span', 'film-rec-dot');
    this.recWord = el('span', 'film-rec-word', 'STBY');
    this.tc = el('span', 'film-tc', timecode(0));
    this.take = el('div', 'film-take', '');
    this.rec.append(this.dot, this.recWord, this.tc);

    /* The slate. */
    this.slate = el('div', 'film-slate score-cut');
    this.subject = el('div', 'film-subject', '');
    this.bars = [bar('Frame'), bar('Close'), bar('Steady')];
    const bars = el('div', 'film-bars');
    for (const b of this.bars) {
      bars.append(b.row);
    }
    this.chips = el('div', 'film-chips');
    this.tandem = el('span', 'film-chip is-tandem', '');
    this.zone = el('span', 'film-chip is-zone', '');
    this.chips.append(this.tandem, this.zone);
    this.points = el('div', 'film-points', '0');
    this.best = el('div', 'film-best', '');
    this.slate.append(this.take, this.subject, bars, this.chips, this.points, this.best);

    this.calls = el('div', 'chase-calls film-calls');
    this.card = el('div', 'film-card is-off');

    this.root.append(this.finder, this.rec, this.slate, this.calls, this.card);
    root.append(this.root);
    this.visible = false;
    this.last = {};
    this.takeNo = 0;
    this.bestScore = 0;
  }

  setVisible(on) {
    if (on === this.visible) {
      return;
    }
    this.visible = on;
    this.root.classList.toggle('is-off', !on);
    if (!on) {
      this.calls.textContent = '';
    }
  }

  /* A new run: the card down, a new take number when it starts. */
  reset() {
    this.calls.textContent = '';
    this.card.classList.add('is-off');
    this.last = {};
  }

  setBest(score) {
    this.bestScore = score || 0;
    this.best.textContent = this.bestScore > 0 ? `Best take ${this.bestScore}` : '';
  }

  /* v: film.view(). Once a frame. */
  update(v) {
    if (!this.visible) {
      return;
    }
    const L = this.last;
    const state = v.done ? 'done' : (v.running ? 'rec' : 'stby');
    if (state !== L.state) {
      L.state = state;
      this.recWord.textContent = state === 'rec' ? 'REC' : (state === 'done' ? 'CUT' : 'STBY');
      this.rec.classList.toggle('is-rec', state === 'rec');
    }
    const frames = Math.floor(v.timeMs / (1000 / 30));
    if (frames !== L.frames) {
      L.frames = frames;
      this.tc.textContent = timecode(v.timeMs);
      this.tc.classList.toggle('is-late', v.running && TAKE_MS - v.timeMs <= 10000);
    }
    const pts = Math.round(v.score);
    if (pts !== L.pts) {
      L.pts = pts;
      this.points.textContent = String(pts);
    }
    const subject = v.subject ? `${v.tandem >= 2 ? `${v.subject} in frame` : v.subject}` : (v.running ? 'No shot' : 'Take off to roll');
    if (subject !== L.subject) {
      L.subject = subject;
      this.subject.textContent = subject;
      this.subject.classList.toggle('is-none', !v.subject);
    }
    const vals = [v.frame, v.close, v.smooth];
    for (let i = 0; i < 3; i += 1) {
      const q = Math.round(vals[i] * 20);
      const b = this.bars[i];
      if (q !== b.last) {
        b.last = q;
        b.fill.style.transform = `scaleX(${q / 20})`;
        b.fill.classList.toggle('is-low', q < 8);
      }
    }
    const tandem = v.tandem >= 3 ? 'Train x1.8' : (v.tandem === 2 ? 'Tandem x1.5' : '');
    if (tandem !== L.tandem) {
      L.tandem = tandem;
      this.tandem.textContent = tandem;
      this.tandem.hidden = !tandem;
    }
    const zone = v.zone ? `${v.zone} x1.5` : '';
    if (zone !== L.zone) {
      L.zone = zone;
      this.zone.textContent = zone;
      this.zone.hidden = !zone;
    }
    /* The focus box on the subject, by a transform: sx and sy are -1 to 1
     * across the picture, sy up. */
    const on = Boolean(v.subject) && v.running;
    if (on !== L.focusOn) {
      L.focusOn = on;
      this.focus.classList.toggle('is-off', !on);
    }
    if (on) {
      const x = Math.round((v.sx * 0.5) * 1000) / 10;
      const y = Math.round((-v.sy * 0.5) * 1000) / 10;
      const good = v.frame * v.close > 0.6 ? 'is-good' : '';
      if (x !== L.fx || y !== L.fy) {
        L.fx = x;
        L.fy = y;
        this.focus.style.transform = `translate(${x}vw, ${y}vh)`;
      }
      if (good !== L.good) {
        L.good = good;
        this.focus.classList.toggle('is-good', Boolean(good));
      }
    }
  }

  /* The events of a frame: callouts, and the card at the cut. */
  events(list) {
    if (!list) {
      return;
    }
    for (const e of list) {
      if (e.type === 'action') {
        this.takeNo += 1;
        this.take.textContent = `Take ${this.takeNo}`;
        this.card.classList.add('is-off');
      }
      this.call(e);
      if ((e.type === 'cut' || e.type === 'crash') && e.summary) {
        this.showCard(e.summary, e.newBest);
      }
    }
  }

  call(e) {
    const t = filmCallText(e);
    if (!t || !this.visible) {
      return;
    }
    const call = el('div', `chase-call${t.lost ? ' is-lost' : ''}`);
    call.append(el('div', 'chase-call-burst'));
    const word = letterCanvas('lettering');
    paintCall(word, {
      word: t.word,
      fill: t.fill,
      line: t.line,
      lineFill: t.lost ? INKS.slate : INKS.mint,
      size: callSize(1.25),
      align: 'right',
      maxW: sideRoom(COLUMN_RIGHT),
    });
    const row = el('div', 'chase-call-row');
    row.append(word);
    call.append(row);
    this.calls.append(call);
    while (this.calls.childElementCount > CALL_MAX) {
      this.calls.removeChild(this.calls.firstChild);
    }
    setTimeout(() => {
      if (call.parentNode === this.calls) {
        this.calls.removeChild(call);
      }
    }, CALL_MS + 200);
  }

  /* The take's card: the grade stamped, the points, the three scores, the
   * seconds both cars of a battle were in the shot, and the best. */
  showCard(s, newBest) {
    const title = letterCanvas('lettering film-card-title');
    paintTitle(title, [{ text: `Take ${this.takeNo}`, fill: INKS.cream }], 30, { maxW: 260 });
    const pct = (x) => `${Math.round(x * 100)}`;
    const line = (label, value) => {
      const r = el('div', 'film-card-line');
      r.append(el('span', 'film-card-label', label), el('span', 'film-card-value', value));
      return r;
    };
    const stamp = el('div', `film-card-grade is-${s.grade.toLowerCase()}`, s.grade);
    const head = el('div', 'film-card-head');
    head.append(title, stamp);
    this.card.replaceChildren(
      head,
      el('div', 'film-card-points', `${s.score}`),
      el('div', 'film-card-why', s.reason === 'crash' ? `Camera down at ${s.seconds} s, the footage is kept` : `${s.seconds >= 60 ? 'A full minute' : `${s.seconds} s`} of footage`),
      line('Frame', pct(s.frame)),
      line('Close', pct(s.close)),
      line('Steady', pct(s.smooth)),
      line('Cars in shot', `${pct(s.inShot)}%`),
      line('Battle in frame', `${s.tandemS} s`),
      line('Money shots', String(s.money)),
      line('In the smoke', String(s.smoke)),
      el('div', 'film-card-best', newBest ? 'Best take yet!' : (this.bestScore > 0 ? `Best take ${this.bestScore}` : '')),
      el('div', 'film-card-next', 'Reset for another take'),
    );
    this.card.classList.remove('is-off');
  }
}
