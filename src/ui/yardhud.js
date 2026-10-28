/*
 * yardhud.js: the yard track on the screen (src/game/yardrace.js). Near
 * the track, top middle: the track's name, the lap clock once the start
 * gate has been flown (before it, "Fly through the start gate"), the gate
 * the race wants next, the last lap and the best; the race's own flash
 * under it when a lap counts. Away from the track, nothing.
 *
 * And the one question Bardwell's place asks (the owner, 2026-10-24: "if i
 * get within a defined boundary and land, it asks if i want to swap to a
 * whoop"): a card with two buttons, Y and N on the keys, up while the
 * quad sits in the zone on a five inch.
 *
 * The score's clothes (.score-cut), the palette's meanings: cream for
 * words, amber for the clock, mint for a record. No animation loop:
 * update() writes nothing on a frame where nothing it shows has changed.
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

/* A lap time as the race's flash writes it: seconds to the hundredth,
 * minutes once there are any. */
export function lapText(ms) {
  /* Hundredths first, then the minute carried: 59.996 s is 1:00.00, and
   * 69.996 s is 1:10.00, where the old sum printed 60.00 and 1:010.00. */
  const cs = Math.round(ms / 10);
  const m = Math.floor(cs / 6000);
  const s = ((cs - m * 6000) / 100).toFixed(2);
  return m > 0 ? `${m}:${s.padStart(5, '0')}` : s;
}

export class YardHud {
  constructor(root) {
    this.root = el('div', 'yard-hud is-off');
    this.box = el('div', 'yard-box score-cut');
    this.name = el('div', 'yard-name', '');
    this.clock = el('div', 'yard-clock', '');
    this.gate = el('div', 'yard-gate', '');
    this.laps = el('div', 'yard-laps', '');
    this.flash = el('div', 'yard-flash', '');
    this.box.append(this.name, this.clock, this.gate, this.laps, this.flash);
    this.ask = el('div', 'yard-ask is-off');
    const title = el('p', 'yard-ask-title', 'Swap to the whoop?');
    const body = el('p', 'yard-ask-body', 'This track is timed on the whoop. Stay on the five inch and it will not time you.');
    const actions = el('div', 'yard-ask-actions');
    this.yes = el('button', 'yard-ask-btn is-yes', 'Swap (Y)');
    this.no = el('button', 'yard-ask-btn', 'Not now (N)');
    this.yes.type = 'button';
    this.no.type = 'button';
    actions.append(this.yes, this.no);
    this.ask.append(title, body, actions);
    this.root.append(this.box, this.ask);
    root.append(this.root);
    this.visible = false;
    this.asking = false;
    this.onAnswer = null;
    this.last = {};
    const answer = (yes) => {
      if (this.asking && this.onAnswer) {
        this.onAnswer(yes);
      }
    };
    this.yes.addEventListener('click', () => answer(true));
    this.no.addEventListener('click', () => answer(false));
    window.addEventListener('keydown', (e) => {
      if (!this.asking || e.repeat || e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        return;
      }
      if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        answer(true);
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        answer(false);
      }
    });
  }

  setVisible(on) {
    if (on === this.visible) {
      return;
    }
    this.visible = on;
    this.root.classList.toggle('is-off', !on);
  }

  /* The swap card up or down. */
  setAsking(on) {
    if (on === this.asking) {
      return;
    }
    this.asking = on;
    this.ask.classList.toggle('is-off', !on);
  }

  /*
   * s: { name, near, armed, started, lapMs, next, gates, lastMs, bestMs,
   * record, flash }. Cheap to call every frame.
   */
  update(s) {
    if (!this.visible) {
      return;
    }
    const L = this.last;
    const set = (key, node, text) => {
      if (L[key] !== text) {
        L[key] = text;
        node.textContent = text;
      }
    };
    this.box.classList.toggle('is-off', !s.near);
    set('name', this.name, s.name);
    let clock;
    if (!s.armed) {
      clock = 'Whoop only: land in the white box';
    } else if (s.started) {
      clock = lapText(s.lapMs);
    } else {
      clock = 'Fly through the start gate';
    }
    set('clock', this.clock, clock);
    const timing = s.armed && s.started;
    if (L.timing !== timing) {
      L.timing = timing;
      this.clock.classList.toggle('is-timing', timing);
    }
    set('gate', this.gate, timing ? `Gate ${s.next + 1} of ${s.gates}` : '');
    const parts = [];
    if (s.lastMs != null) {
      parts.push(`Last ${lapText(s.lastMs)}`);
    }
    if (s.bestMs != null) {
      parts.push(`Best ${lapText(s.bestMs)}`);
    }
    set('laps', this.laps, parts.join('   '));
    set('flash', this.flash, s.flash || '');
    if (L.record !== s.record) {
      L.record = s.record;
      this.flash.classList.toggle('is-record', Boolean(s.record));
    }
  }
}
