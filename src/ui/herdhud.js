/*
 * herdhud.js: the HUD of a goat herding round with bots
 * (src/game/goatround.js). Ribbon cutting's (src/ui/ribbonhud.js), which is
 * the dogfight's with the weapons taken off, with goats for ribbons: how
 * many are home of the herd, the clock, how many are yours, a tag over
 * every bot with its count, arrows to the ones off screen, HOME! when one of
 * yours gets in, whose goat got home in the feed, and the round's results.
 *
 * COST. The dogfight HUD's: one 2D canvas cleared only where it was drawn,
 * a handful of strokes a frame, DOM written only when a value changes, the
 * lettered callout painted once. Fetched only when a round is flown.
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

import { paintCall, INKS } from './lettering.js';
import { DogfightHud, nameOf } from './dogfighthud.js';
import { MAX_PILOTS, ME } from '../game/dogfight.js';

const INK = '#0b1116';
const AMBER = '#ffd45c';
const MINT = '#7dffb4';

/* How long HOME! stays up, ms. */
const CALL_MS = 900;

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

export class HerdHud extends DogfightHud {
  constructor(root, opts = {}) {
    super(root, opts);
    this.root.classList.add('rb-hud');
    /* Nothing to fire: the touch buttons never show. */
    this.touch.remove();
    const gl = el('div', 'df-lbl');
    this.goatText = el('em', null, '0');
    gl.append(el('span', null, 'YOUR GOATS'), this.goatText);
    this.me.replaceChildren(gl);
    this.homeCall = el('canvas', 'df-call is-off');
    this.root.append(this.homeCall);
    this.callAt = -1e9;
    this.callOn = false;
  }

  paintOnce() {
    if (this.painted) {
      return;
    }
    this.painted = true;
    try {
      paintCall(this.homeCall, { word: 'HOME!', fill: INKS.mint, size: 48, balloon: true });
    } catch (e) {
      /* No canvas text (a test page): the HUD works without the lettering. */
    }
  }

  setVisible(on) {
    if (on === this.visible) {
      return;
    }
    this.visible = on;
    this.root.classList.toggle('is-off', !on);
    if (this.root.parentNode) {
      this.root.parentNode.classList.toggle('df-on', on);
    }
    if (on) {
      this.paintOnce();
    }
  }

  /* A slip in the feed: whose goat got home. */
  slip(by, goat, g) {
    const s = el('div', 'df-slip');
    const name = g.herd && goat >= 0 ? g.herd.names[goat] : 'A goat';
    if (by >= 0) {
      s.append(el('b', by === ME ? 'df-you' : null, nameOf(by)), document.createTextNode(` got ${name} home`));
    } else {
      s.append(document.createTextNode(`${name} wandered home`));
    }
    this.feed.append(s);
    while (this.feed.childElementCount > 4) {
      this.feed.firstChild.remove();
    }
    setTimeout(() => s.classList.add('is-old'), 5000);
    setTimeout(() => s.remove(), 5700);
  }

  event(e, g, nowMs) {
    if (e.type === 'home') {
      this.slip(e.by, e.goat, g);
      if (e.by === ME) {
        this.callAt = nowMs;
        this.callOn = true;
        this.homeCall.classList.remove('is-off');
        const w = this.homeCall.width || 160;
        this.homeCall.style.left = `${Math.round((this.w || window.innerWidth) / 2 - w / 2)}px`;
        this.homeCall.style.top = `${Math.round((this.h || window.innerHeight) * 0.2)}px`;
        return 'gate';
      }
      return null;
    }
    if (e.type === 'go') {
      return 'select';
    }
    return null;
  }

  frame(g, t, camera, nowMs, extra = {}) {
    if (!this.visible) {
      return;
    }
    this.resize();
    const L = this.last;
    const ctx = this.ctx;
    const k = g.k;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.dirtyN >= this.dirty.length / 3) {
      ctx.clearRect(0, 0, this.w, this.h);
    } else {
      for (let n = 0; n < this.dirtyN; n += 1) {
        const j = n * 3;
        const r = this.dirty[j + 2];
        ctx.clearRect(this.dirty[j] - r, this.dirty[j + 1] - r, r * 2, r * 2);
      }
    }
    this.dirtyN = 0;
    const u = 1 - t;
    const mx = g.x[ME];
    const my = g.y[ME];
    const mz = g.z[ME];
    const slots = g.cap || MAX_PILOTS;
    this.offBegin(slots);
    /* Over every bot: a chevron and its goats. */
    ctx.font = '900 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < slots; i += 1) {
      if (i === ME || !g.live(i)) {
        continue;
      }
      const x = g.xPrev[i] * u + g.x[i] * t;
      const y = g.yPrev[i] * u + g.y[i] * t;
      const z = g.zPrev[i] * u + g.z[i] * t;
      const dx = x - mx;
      const dy = y - my;
      const dz = z - mz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const p = this.project(x, y, z, camera, this.onP);
      const on = !p.behind && p.x > 8 && p.x < this.w - 8 && p.y > 8 && p.y < this.h - 8;
      if (!on) {
        this.offAdd(i, d, p);
        continue;
      }
      const s = Math.max(10, Math.min(30, (30 * k * 6) / Math.max(d, 0.1)));
      const top = p.y - s - 30;
      this.mark(p.x, top - 6, 46);
      ctx.fillStyle = AMBER;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(p.x - 9, top - 6);
      ctx.lineTo(p.x, top + 4);
      ctx.lineTo(p.x + 9, top - 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.fillRect(p.x - 13, top - 27, 26, 16);
      ctx.fillStyle = MINT;
      ctx.fillText(String(g.pops[i]), p.x, top - 19);
    }
    this.offDraw(ctx, g);

    if (this.callOn && nowMs - this.callAt > CALL_MS) {
      this.callOn = false;
      this.homeCall.classList.add('is-off');
    }

    const score = `HOME ${g.home}/${g.total}`;
    if (L.meScore !== score) {
      L.meScore = score;
      this.scoreMe.textContent = score;
    }
    const ms = g.roundMs ? g.leftMs() : -1;
    const clock = ms >= 0 ? clockText(ms) : 'ALL HOME';
    if (L.clock !== clock) {
      L.clock = clock;
      this.scoreClock.textContent = clock;
    }
    /* The leader, read from the counts: standings() is a table a frame. */
    let lead = -1;
    for (let i = 0; i < slots; i += 1) {
      if (g.inFight[i] && g.pops[i] > 0 && (lead < 0 || g.pops[i] > g.pops[lead])) {
        lead = i;
      }
    }
    const best = lead >= 0 ? `TOP ${nameOf(lead)} ${g.pops[lead]}` : '';
    if (L.best !== best) {
      L.best = best;
      this.scoreBest.textContent = best;
      this.scoreBest.classList.toggle('is-off', !best);
    }
    const mine = String(g.pops[ME]);
    if (L.mine !== mine) {
      L.mine = mine;
      this.goatText.textContent = mine;
    }

    let banner = '';
    if (!g.over && g.startedMs < 0) {
      const n = g.goatRules.bots;
      banner = n
        ? `Take off to start. ${n === 1 ? 'One bot is' : `${n} bots are`} herding too. Every goat is whoever pushed it in last.`
        : "Take off to start. Herd the goats into Heads' garage.";
    }
    if (L.banner !== banner) {
      L.banner = banner;
      this.banner.textContent = banner;
      this.banner.classList.toggle('is-off', !banner);
    }

    if (L.over !== g.over) {
      L.over = g.over;
      this.result.classList.toggle('is-off', !g.over);
      if (g.over) {
        this.showResult(g, extra);
      }
    }
    const nextRound = g.over ? Math.max(1, Math.ceil((extra.nextMs || 0) / 1000)) : 0;
    if (g.over && this.resultKeys && L.nextRound !== nextRound) {
      L.nextRound = nextRound;
      this.resultKeys.textContent = `Next round in ${nextRound} s`;
    }
  }

  showResult(g, extra) {
    const rows = g.standings();
    let title;
    if (g.winner === ME) {
      title = 'YOU WIN!';
    } else if (g.winner >= 0) {
      title = `${nameOf(g.winner).toUpperCase()} WINS`;
    } else {
      title = rows[0] && rows[0].goats > 0 ? 'A DRAW!' : 'NO GOATS HOME';
    }
    const h = el('h2');
    h.append(el('small', null, extra.kicker || 'Goat herding'), document.createTextNode(title));
    const table = el('table');
    const head = el('tr');
    head.append(el('th', 'n', '#'), el('th', null, 'PILOT'), el('th', 'n', 'GOATS'));
    table.append(head);
    rows.forEach((r, n) => {
      const tr = el('tr', r.slot === ME ? 'is-me' : null);
      const name = el('td', null, nameOf(r.slot));
      if (r.bot) {
        name.append(el('span', 'df-bot', 'BOT'));
      }
      tr.append(el('td', 'n', String(n + 1)), name, el('td', 'n', String(r.goats)));
      table.append(tr);
    });
    const medals = el('div');
    const medal = (b, s) => {
      const m = el('div', 'df-medal');
      m.append(el('b', null, b), el('span', null, s));
      medals.append(m);
    };
    const mine = g.pops[ME];
    medal('Your goats', `${mine} ${mine === 1 ? 'goat' : 'goats'} home`);
    medal('The herd', `${g.home} of ${g.total} home`);
    if (extra.best != null) {
      medal('Your best here', extra.newBest ? `${extra.best} goats, a new best` : `${extra.best} goats`);
    }
    const cols = el('div', 'df-cols');
    cols.append(table, medals);
    const row = el('div', 'df-row');
    const again = el('button', 'df-btn is-go', 'Again');
    const change = el('button', 'df-btn', 'Change the round');
    const leave = el('button', 'df-btn', 'Leave');
    again.type = 'button';
    change.type = 'button';
    leave.type = 'button';
    again.addEventListener('click', () => this.onAgain && this.onAgain());
    change.addEventListener('click', () => this.onChange && this.onChange());
    leave.addEventListener('click', () => this.onLeave && this.onLeave());
    const keys = el('span', 'df-keys', '');
    this.resultKeys = keys;
    row.append(again, change, leave, keys);
    this.result.replaceChildren(h, cols, row);
  }
}

function clockText(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}
