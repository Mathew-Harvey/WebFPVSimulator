/*
 * ribbonhud.js: ribbon cutting's HUD. The dogfight's (src/ui/dogfighthud.js)
 * with the weapons taken off: how many still have a ribbon, the clock, how
 * many you have cut, how much of your own ribbon is left, a tag over every
 * quad still in with how much of its ribbon it has, arrows to the nearest
 * ones off screen, SNIP! when you cut one and CUT! when you take one, who
 * took whose in the feed, and the round's results.
 *
 * COST. The dogfight HUD's: one 2D canvas cleared only where it was drawn,
 * a handful of strokes a frame, DOM written only when a value changes, the
 * lettered callouts painted once. Fetched only when ribbons are flown.
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
const CREAM = '#f3ead4';
const AMBER = '#ffd45c';
const MINT = '#7dffb4';
const BAIL = '#ff7d96';

/* How long SNIP! and CUT! stay up, ms. */
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

function place(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export class RibbonHud extends DogfightHud {
  constructor(root, opts = {}) {
    super(root, opts);
    this.root.classList.add('rb-hud');
    /* Nothing to fire: the touch buttons never show. */
    this.touch.remove();
    /* The pilot's panel: the ribbon, and nothing else. */
    const rl = el('div', 'df-lbl');
    this.ribbonText = el('em', null, '100%');
    rl.append(el('span', null, 'YOUR RIBBON'), this.ribbonText);
    this.ribbonBar = el('div', 'df-bar');
    this.ribbonFill = el('i');
    this.ribbonFill.style.background = MINT;
    this.ribbonBar.append(this.ribbonFill);
    this.me.replaceChildren(rl, this.ribbonBar);
    this.snipCall = el('canvas', 'df-call is-off');
    this.cutCall = el('canvas', 'df-call is-off');
    this.root.append(this.snipCall, this.cutCall);
    this.callAt = -1e9;
    this.callEl = null;
  }

  paintOnce() {
    if (this.painted) {
      return;
    }
    this.painted = true;
    try {
      paintCall(this.snipCall, { word: 'SNIP!', fill: INKS.amber, size: 40, balloon: true });
      paintCall(this.cutCall, { word: 'CUT!', fill: INKS.bail, size: 56, balloon: true });
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
    if (on) {
      this.paintOnce();
    }
  }

  /* A slip in the feed: who took whose ribbon. */
  slip(by, to) {
    const s = el('div', 'df-slip');
    const who = (i) => el('b', i === ME ? 'df-you' : null, nameOf(i));
    if (by >= 0) {
      s.append(who(by), document.createTextNode(' cut '), who(to), document.createTextNode(to === ME ? ' ribbon' : '’s ribbon'));
    } else {
      s.append(who(to), document.createTextNode(' is out'));
    }
    this.feed.append(s);
    while (this.feed.childElementCount > 4) {
      this.feed.firstChild.remove();
    }
    setTimeout(() => s.classList.add('is-old'), 5000);
    setTimeout(() => s.remove(), 5700);
  }

  call(which, nowMs) {
    if (this.callEl && this.callEl !== which) {
      this.callEl.classList.add('is-off');
    }
    this.callEl = which;
    this.callAt = nowMs;
    which.classList.remove('is-off');
    const w = which.width || 160;
    which.style.left = `${Math.round((this.w || window.innerWidth) / 2 - w / 2)}px`;
    which.style.top = `${Math.round((this.h || window.innerHeight) * 0.2)}px`;
  }

  event(e, g, nowMs) {
    if (e.type === 'cut' || e.type === 'out') {
      if (e.type === 'out') {
        this.slip(e.by, e.to);
      }
      if (e.by === ME) {
        this.call(e.type === 'out' ? this.cutCall : this.snipCall, nowMs);
        return e.type === 'out' ? 'gate' : 'clip';
      }
      if (e.to === ME) {
        this.hurt.classList.add('is-on');
        requestAnimationFrame(() => this.hurt.classList.remove('is-on'));
        this.cutBy = e.by;
        return 'crash';
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
    const alive = g.alive[ME] === 1;
    const u = 1 - t;
    const mx = g.x[ME];
    const my = g.y[ME];
    const mz = g.z[ME];
    const offscreen = [];
    /* A mark over every quad still in, above the name tag the craft
     * already wear: a chevron, and how much ribbon it has as pips. */
    for (let i = 0; i < MAX_PILOTS; i += 1) {
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
      const p = this.project(x, y, z, camera);
      const on = !p.behind && p.x > 8 && p.x < this.w - 8 && p.y > 8 && p.y < this.h - 8;
      if (!on) {
        offscreen.push({ i, d, p });
        continue;
      }
      const s = Math.max(10, Math.min(30, (30 * k * 6) / Math.max(d, 0.1)));
      const top = p.y - s - 30;
      this.mark(p.x, top, 46);
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
      const pips = 5;
      const left = Math.ceil(g.share(i) * pips);
      for (let n = 0; n < pips; n += 1) {
        ctx.fillStyle = n < left ? MINT : 'rgba(11,17,22,0.55)';
        ctx.fillRect(p.x - 22 + n * 9, top - 16, 7, 4);
      }
    }
    offscreen.sort((a, b) => a.d - b.d);
    for (let n = 0; n < Math.min(3, offscreen.length); n += 1) {
      const o = offscreen[n];
      this.edgeArrow(ctx, o.p, AMBER, nameOf(o.i));
    }

    /* SNIP! and CUT!, for a moment. */
    if (this.callEl && nowMs - this.callAt > CALL_MS) {
      this.callEl.classList.add('is-off');
      this.callEl = null;
    }

    /* Who is left, the clock, and your cuts. */
    const total = g.starters;
    const leftN = g.left;
    const cuts = g.cuts[ME];
    const score = total > 1 ? `LEFT ${leftN}/${total}` : 'PRACTICE';
    if (L.meScore !== score) {
      L.meScore = score;
      this.scoreMe.textContent = score;
    }
    const ms = g.roundMs ? g.leftMs() : -1;
    const clock = ms >= 0 ? clockText(ms) : 'NO CLOCK';
    if (L.clock !== clock) {
      L.clock = clock;
      this.scoreClock.textContent = clock;
    }
    const best = `CUTS ${cuts}`;
    if (L.best !== best) {
      L.best = best;
      this.scoreBest.textContent = best;
      this.scoreBest.classList.remove('is-off');
    }

    /* Your ribbon. */
    const share = Math.round(g.share(ME) * 100);
    if (L.share !== share) {
      L.share = share;
      this.ribbonText.textContent = share ? `${share}%` : 'GONE';
      const f = share / 100;
      this.ribbonFill.style.transform = `scaleX(${f})`;
      this.ribbonFill.style.background = f > 0.6 ? MINT : (f > 0.3 ? AMBER : BAIL);
    }

    let banner = '';
    if (!g.over && alive && g.startedMs < 0) {
      const n = g.ribbon.bots;
      banner = n
        ? `Take off to start. ${n === 1 ? 'One bot has' : `${n} bots have`} a ribbon. Cut theirs and keep yours.`
        : 'Take off to fly with your ribbon.';
    } else if (!g.over && alive && !g.cutting && g.starters > 1) {
      banner = 'Ribbons out!';
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
    const mine = rows.findIndex((r) => r.slot === ME);
    const meRow = rows[mine];
    let title;
    if (g.winner === ME) {
      title = 'YOU WIN!';
    } else if (meRow && !meRow.alive) {
      title = `CUT OUT! ${place(mine + 1).toUpperCase()}`;
    } else if (g.winner < 0) {
      title = 'A DRAW!';
    } else {
      title = `${nameOf(g.winner)} WINS`;
    }
    const h = el('h2');
    h.append(el('small', null, extra.kicker || 'Ribbon cutting'), document.createTextNode(title));
    const table = el('table');
    const head = el('tr');
    head.append(el('th', 'n', '#'), el('th', null, 'PILOT'), el('th', 'n', 'RIBBON'), el('th', 'n', 'CUT'));
    table.append(head);
    rows.forEach((r, n) => {
      const tr = el('tr', r.slot === ME ? 'is-me' : null);
      const name = el('td', null, nameOf(r.slot));
      if (r.bot) {
        name.append(el('span', 'df-bot', 'BOT'));
      }
      const ribbon = r.alive ? `${Math.round(r.share * 100)}%` : 'OUT';
      tr.append(el('td', 'n', String(n + 1)), name, el('td', 'n', ribbon), el('td', 'n', String(r.cuts)));
      table.append(tr);
    });
    const medals = el('div');
    const medal = (b, s) => {
      const m = el('div', 'df-medal');
      m.append(el('b', null, b), el('span', null, s));
      medals.append(m);
    };
    if (meRow) {
      medal('Ribbons taken', `${meRow.cuts} ${meRow.cuts === 1 ? 'ribbon' : 'ribbons'} cut off`);
      medal('Snips', `${meRow.snips} ${meRow.snips === 1 ? 'cut' : 'cuts'} into a ribbon`);
      if (!meRow.alive && this.cutBy != null && this.cutBy >= 0) {
        medal('Cut by', nameOf(this.cutBy));
      }
      if (extra.best != null) {
        medal('Your best here', extra.newBest ? `${extra.best} ribbons, a new best` : `${extra.best} ribbons`);
      }
    }
    this.cutBy = null;
    const cols = el('div', 'df-cols');
    cols.append(table, medals);
    const row = el('div', 'df-row');
    const again = el('button', 'df-btn is-go', 'Again');
    const change = el('button', 'df-btn', 'Change the ribbons');
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
