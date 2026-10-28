/*
 * goathud.js: 90%er goat herding on the screen (src/maps/goats/). How many
 * goats are home in Heads' garage of how many, the time since the first
 * one ran, and whose goat is on the run right now, down the left under
 * the score, because a stream watching the game wants all three at a
 * glance. A goat coming home is called out on the right by the sticker
 * callout (goatFrame in src/main.js), not here.
 *
 * The score's clothes (.score-cut), the palette's meanings: cream for
 * words, mint for what is banked, amber for the clock. No animation loop:
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

function clockText(s) {
  const t = Math.floor(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t - h * 3600) / 60);
  const r = t - h * 3600 - m * 60;
  const mm = h > 0 && m < 10 ? `0${m}` : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${r < 10 ? '0' : ''}${r}`;
}

export class GoatHud {
  constructor(root) {
    this.root = el('div', 'goat-hud is-off');
    this.box = el('div', 'goat-box score-cut');
    const head = el('div', 'goat-head', 'Goats home');
    this.count = el('div', 'goat-count', '0');
    this.of = el('div', 'goat-of', '');
    this.clock = el('div', 'goat-clock', '');
    this.run = el('div', 'goat-run', '');
    this.box.append(head, this.count, this.of, this.clock, this.run);
    this.root.append(this.box);
    root.append(this.root);
    this.visible = false;
    this.last = { home: -1, total: -1, sec: -1, herding: null, started: null };
  }

  setVisible(on) {
    if (on === this.visible) {
      return;
    }
    this.visible = on;
    this.root.classList.toggle('is-off', !on);
  }

  /* s: { home, total, clockS, started, herding }. Cheap every frame. */
  update(s) {
    if (!this.visible) {
      return;
    }
    const L = this.last;
    if (s.home !== L.home || s.total !== L.total) {
      L.home = s.home;
      L.total = s.total;
      this.count.textContent = String(s.home);
      this.of.textContent = `of ${s.total}`;
      this.box.classList.toggle('is-all', s.home >= s.total && s.total > 0);
    }
    const sec = s.started ? Math.floor(s.clockS) : -1;
    if (sec !== L.sec) {
      L.sec = sec;
      this.clock.textContent = s.started ? clockText(s.clockS) : '';
    }
    const herding = s.started || s.herding ? s.herding : null;
    if (herding !== L.herding || s.started !== L.started) {
      L.herding = herding;
      L.started = s.started;
      if (herding) {
        this.run.textContent = `On the run: ${herding}`;
      } else {
        this.run.textContent = s.started ? '' : 'Fly low to move a goat';
      }
    }
  }
}
