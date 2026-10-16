/*
 * balloonhud.js: Balloon chase on the screen. The points, the round's
 * clock, the best on this map and the streak, top right; a "+1" or a gold
 * "+3" flash at each pop; and the round's result in the middle when the
 * clock runs out.
 *
 * The score's clothes (.score-cut), the palette's meanings: cream for words,
 * mint for what is banked, amber for the clock. No animation loop: update()
 * writes nothing on a frame where nothing it shows has changed, and a flash
 * is a keyframe on a node a timer removes, as src/ui/chasehud.js does.
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

/* The pop flash's keyframes in index.html run this long: change both. */
const FLASH_MS = 700;

function clockText(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

export class BalloonHud {
  constructor(root) {
    this.root = el('div', 'balloon-hud is-off');
    this.box = el('div', 'balloon-box score-cut');
    const head = el('div', 'balloon-head', 'Balloons');
    this.points = el('div', 'balloon-points', '0');
    this.clock = el('div', 'balloon-clock', clockText(0));
    this.best = el('div', 'balloon-best', '');
    this.streak = el('div', 'balloon-streak', '');
    this.box.append(head, this.points, this.clock, this.best, this.streak);
    this.flashes = el('div', 'balloon-flashes');
    this.result = el('div', 'balloon-result score-cut is-off');
    this.root.append(this.box, this.flashes, this.result);
    root.append(this.root);
    this.visible = false;
    this.last = { points: -1, sec: -1, best: -2, streak: -1, over: null, next: -1 };
  }

  setVisible(on) {
    if (on === this.visible) {
      return;
    }
    this.visible = on;
    this.root.classList.toggle('is-off', !on);
  }

  /*
   * s: { points, leftMs, best, streak, over, popped, gold, bestStreak,
   * newBest, nextMs }. Cheap to call every frame.
   */
  update(s) {
    if (!this.visible) {
      return;
    }
    const L = this.last;
    if (s.points !== L.points) {
      L.points = s.points;
      this.points.textContent = String(s.points);
    }
    const sec = Math.ceil(s.leftMs / 1000);
    if (sec !== L.sec) {
      L.sec = sec;
      this.clock.textContent = clockText(s.leftMs);
      this.clock.classList.toggle('is-low', s.leftMs > 0 && s.leftMs <= 10000);
    }
    if (s.best !== L.best) {
      L.best = s.best;
      this.best.textContent = s.best > 0 ? `Best ${s.best}` : '';
    }
    if (s.streak !== L.streak) {
      L.streak = s.streak;
      this.streak.textContent = s.streak >= 2 ? `Streak x${s.streak}` : '';
    }
    const next = s.over ? Math.ceil(s.nextMs / 1000) : -1;
    if (s.over !== L.over || next !== L.next) {
      L.over = s.over;
      L.next = next;
      this.result.classList.toggle('is-off', !s.over);
      if (s.over) {
        this.result.replaceChildren(
          el('div', 'balloon-result-head', s.newBest ? 'New best!' : 'Time!'),
          el('div', 'balloon-result-points', `${s.points} points`),
          el('div', 'balloon-result-line',
            `${s.popped} popped, ${s.gold} gold, best streak ${s.bestStreak}`),
          el('div', 'balloon-result-line', s.best > 0 ? `Best on this map ${s.best}` : ''),
          el('div', 'balloon-result-next', next > 0 ? `Next round in ${next}` : ''),
        );
      }
    }
  }

  /* A pop: "+1", or "+3 gold". */
  flash(gold, value) {
    if (!this.visible) {
      return;
    }
    const n = el('div', `balloon-flash score-cut${gold ? ' is-gold' : ''}`, gold ? `+${value} gold` : `+${value}`);
    this.flashes.append(n);
    while (this.flashes.childElementCount > 4) {
      this.flashes.firstChild.remove();
    }
    setTimeout(() => n.remove(), FLASH_MS);
  }
}
