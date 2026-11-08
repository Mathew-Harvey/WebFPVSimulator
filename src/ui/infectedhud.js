/*
 * infectedhud.js: the HUD of Infected (src/game/infected.js), as drawn in
 * the owner's mock-ups of 2026-11-08 (/mnt/project-files/infection/mockup):
 * which side the pilot is on and their points, the clock, how many are
 * clean and how many infected, RUN! or HOLD through the head start, the
 * lettered calls (INFECTED!, TAG!, DOUBLE!, CLOSE SHAVE!, LAST ONE!), a
 * green edge on the side an infected pilot is close on, the sniff's rings
 * for the infected, the last one in gold for everybody, who infected whom
 * in the feed, and the round's and the match's tables.
 *
 * NO WORD OF SLIME, by the owner's word ("just infected"), and nothing a
 * pilot of eight would need explained.
 *
 * COST. The dogfight HUD's (./dogfighthud.js): one 2D canvas cleared only
 * where it was drawn, DOM written only when a value changes, every
 * lettered call painted once when the HUD is first shown. The sniff draws
 * for one second in twenty, the gold marker only in the last chase.
 * Fetched only when Infected is flown.
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
import {
  ME, LEGS, SNIFF_MS, POINTS,
} from '../game/infected.js';

const INK = '#0b1116';
const CREAM = '#f3ead4';
const AMBER = '#ffd45c';
const GREEN = '#5fe06e';
const SKY = '#8fe0ff';
const WHITE = '#f4f1ea';

/* How long a call stays up, ms, and the big ones. */
const CALL_MS = 1100;
const BIG_MS = 2200;
/* An infected pilot this close, in sim metres, lights the edge on its
 * side: about a classroom. */
const NEAR_M = 5;

const CSS = `
.if-hud .df-score .df-me { min-width: 128px; }
.if-hud .df-score .df-me.is-clean { background: ${WHITE}; }
.if-hud .df-score .df-me.is-inf { background: ${GREEN}; }
.if-hud .df-score .df-me.is-gold { background: ${AMBER}; }
.if-hud .if-count { display: flex !important; gap: 0; padding: 0 !important; }
.if-hud .if-count span { display: grid; place-items: center; padding: 5px 10px; font-weight: 900; }
.if-hud .if-count .is-clean { background: ${WHITE}; }
.if-hud .if-count .is-inf { background: ${GREEN}; border-left: 3px solid ${INK}; }
.if-hud .df-edge.is-left { background: linear-gradient(90deg, rgba(95,224,110,.6), transparent); }
.if-hud .df-edge.is-right { background: linear-gradient(270deg, rgba(95,224,110,.6), transparent); }
.if-hud .df-edge.is-gold.is-left { background: linear-gradient(90deg, rgba(255,212,92,.6), transparent); }
.if-hud .df-edge.is-gold.is-right { background: linear-gradient(270deg, rgba(255,212,92,.6), transparent); }
.if-hud .df-hurt { box-shadow: inset 0 0 110px rgba(95,224,110,.8); }
.if-hud .if-mid { position: absolute; left: 50%; top: 21%; transform: translateX(-50%); display: grid; justify-items: center; gap: 10px; }
.if-hud .if-mid canvas { display: block; }
.if-hud .if-say { background: #f7f0dc; color: ${INK}; border: 3px solid ${INK}; padding: 8px 16px; font-size: 18px; font-weight: 800; box-shadow: 3px 3px 0 ${INK}; text-align: center; max-width: min(560px, 86vw); }
.if-hud .if-say b { font-size: 24px; font-weight: 900; }
.if-hud .if-say.is-inf { background: ${GREEN}; }
.if-hud .if-say.is-gold { background: ${AMBER}; }
.if-hud .df-slip .is-inf { color: #1d7a2c; }
.if-hud .if-chain { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.if-hud .if-ring { width: 46px; height: 46px; border-radius: 50%; border: 4px solid ${INK}; background: ${GREEN}; display: grid; place-items: center; font: 900 italic 18px/1 system-ui, sans-serif; color: ${INK}; box-shadow: 3px 3px 0 ${INK}; }
.if-hud .if-chain .df-slip { font-size: 12px; }
.if-hud .df-result .df-cols { grid-template-columns: 1fr 220px; }
.if-hud .df-result td small { font-size: 10px; letter-spacing: .1em; color: #5d6b78; margin-left: 6px; font-weight: 800; }
.if-hud .df-result td small.is-inf { color: #1d7a2c; }
.if-hud .df-result td small.is-gold { color: #a07400; }
.if-hud .df-medal.is-gold { background: ${AMBER}; }
.if-hud .df-medal.is-inf { background: ${GREEN}; }
.if-hud .df-medal.is-sky { background: ${SKY}; }
.if-hud .df-medal.is-gold span, .if-hud .df-medal.is-inf span, .if-hud .df-medal.is-sky span { color: ${INK}; }
@media (max-width: 700px) { .if-hud .if-mid { top: 17%; transform: translateX(-50%) scale(.8); transform-origin: center top; } .if-hud .df-result .df-cols { grid-template-columns: 1fr; } }
`;

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

function clockText(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

function cleanText(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/* The calls, painted once: the word, its colour, its size and the points
 * it is worth. */
const CALLS = {
  run: { word: 'RUN!', fill: INKS.cream, size: 96 },
  hold: { word: 'HOLD', fill: GREEN, size: 84 },
  go: { word: 'GO!', fill: GREEN, size: 96 },
  infected: { word: 'INFECTED!', fill: GREEN, size: 88 },
  x1: { word: 'TAG!', fill: GREEN, size: 64, pts: `+${POINTS.tag}` },
  x2: { word: 'DOUBLE!', fill: GREEN, size: 64, pts: `+${POINTS.tag * 2}` },
  x3: { word: 'TRIPLE!', fill: GREEN, size: 64, pts: `+${POINTS.tag * 3}` },
  x4: { word: 'QUAD!', fill: GREEN, size: 64, pts: `+${POINTS.tag * 4}` },
  shave: { word: 'CLOSE SHAVE!', fill: INKS.sky, size: 44, pts: `+${POINTS.shave}` },
  last: { word: 'LAST ONE!', fill: INKS.amber, size: 80 },
  sniff: { word: 'SNIFF!', fill: GREEN, size: 44 },
};

export class InfectedHud extends DogfightHud {
  constructor(root, opts = {}) {
    super(root, opts);
    if (!document.getElementById('if-hud-css')) {
      const st = document.createElement('style');
      st.id = 'if-hud-css';
      st.textContent = CSS;
      document.head.append(st);
    }
    this.root.classList.add('if-hud');
    /* Nothing to fire: the touch buttons never show. */
    this.touch.remove();
    /* The score strip: the pilot's side and points, the clock, the count. */
    this.scoreBest.className = 'if-count';
    this.countClean = el('span', 'is-clean', '0 CLEAN');
    this.countInf = el('span', 'is-inf', '0 INFECTED');
    this.scoreBest.replaceChildren(this.countClean, this.countInf);
    /* The pilot's panel: points, and the chain while one is open. */
    const pl = el('div', 'df-lbl');
    this.ptsText = el('em', null, '0');
    pl.append(el('span', null, 'POINTS'), this.ptsText);
    this.chainBox = el('div', 'if-chain is-off');
    this.chainRing = el('div', 'if-ring', 'x2');
    this.chainSay = el('div', 'df-slip', '');
    this.chainBox.append(this.chainRing, this.chainSay);
    this.me.replaceChildren(pl, this.chainBox);
    /* The middle: one call and the line under it. */
    this.mid = el('div', 'if-mid');
    this.calls = {};
    for (const id of Object.keys(CALLS)) {
      const c = el('canvas', 'is-off');
      this.calls[id] = c;
      this.mid.append(c);
    }
    this.say = el('div', 'if-say is-off');
    this.mid.append(this.say);
    this.root.append(this.mid);
    this.callId = '';
    this.callUntil = 0;
    this.sayUntil = 0;
    this.sayHtml = '';
  }

  paintOnce() {
    if (this.painted) {
      return;
    }
    this.painted = true;
    for (const [id, spec] of Object.entries(CALLS)) {
      try {
        paintCall(this.calls[id], { ...spec, balloon: id === 'shave' || id === 'sniff' });
      } catch (e) {
        /* No canvas text (a test page): the HUD works without the lettering. */
      }
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

  /* One call in the middle, for ms; a later one replaces it. */
  call(id, nowMs, ms = CALL_MS) {
    if (this.callId && this.callId !== id) {
      this.calls[this.callId].classList.add('is-off');
    }
    this.callId = id;
    this.callUntil = nowMs + ms;
    this.calls[id].classList.remove('is-off');
  }

  /* The line under the call, for ms. kind: '', 'inf' or 'gold'. */
  line(html, nowMs, ms, kind = '') {
    if (this.sayHtml !== html) {
      this.sayHtml = html;
      this.say.innerHTML = html;
    }
    this.say.className = `if-say${kind ? ` is-${kind}` : ''}`;
    this.sayUntil = nowMs + ms;
  }

  /* A slip in the feed. */
  slip(parts) {
    const s = el('div', 'df-slip');
    for (const p of parts) {
      if (typeof p === 'string') {
        s.append(document.createTextNode(p));
      } else {
        s.append(el('b', p.cls || (p.i === ME ? 'df-you' : null), p.text));
      }
    }
    this.feed.append(s);
    while (this.feed.childElementCount > 4) {
      this.feed.firstChild.remove();
    }
    setTimeout(() => s.classList.add('is-old'), 5000);
    setTimeout(() => s.remove(), 5700);
  }

  who(i, g) {
    return { i, text: nameOf(i, g), cls: i === ME ? 'df-you' : null };
  }

  event(e, g, nowMs) {
    this.g = g;
    if (e.type === 'go') {
      if (g.pz === ME) {
        this.call('hold', nowMs, g.headMs);
      } else {
        this.call('run', nowMs, Math.min(g.headMs, 2500));
      }
      return 'select';
    }
    if (e.type === 'free') {
      if (e.to === ME) {
        this.call('go', nowMs);
        this.line('Go get them! Tag the white ones.', nowMs, 2500, 'inf');
        return 'select';
      }
      this.slip([{ i: e.to, text: nameOf(e.to, g), cls: 'is-inf' }, ' is out of the tank!']);
      return null;
    }
    if (e.type === 'tag') {
      this.slip([{ i: e.by, text: nameOf(e.by, g), cls: e.by === ME ? 'df-you' : 'is-inf' }, ' infected ', this.who(e.to, g)]);
      if (e.to === ME) {
        this.call('infected', nowMs, BIG_MS);
        this.line(`${esc(nameOf(e.by, g))} got you. You're infected now. Go get them!`, nowMs, 3000, 'inf');
        this.hurt.classList.add('is-on');
        requestAnimationFrame(() => this.hurt.classList.remove('is-on'));
        return 'crash';
      }
      if (e.by === ME) {
        this.call(CALLS[e.weapon] ? e.weapon : 'x1', nowMs);
        return 'gate';
      }
      return null;
    }
    if (e.type === 'shave') {
      if (e.to === ME) {
        this.call('shave', nowMs);
        return 'clip';
      }
      return null;
    }
    if (e.type === 'last') {
      if (e.to === ME) {
        this.call('last', nowMs, BIG_MS);
        return 'select';
      }
      this.slip([this.who(e.to, g), ' is the last one!']);
      if (g.inf[ME]) {
        this.call('last', nowMs);
      }
      return null;
    }
    if (e.type === 'sniff') {
      if (g.inf[ME] && g.inFight[ME]) {
        this.call('sniff', nowMs, SNIFF_MS);
      }
      return null;
    }
    if (e.type === 'bonus' && e.to === ME) {
      const why = {
        'last caught': 'The last one caught',
        'caught the last one': 'You caught the last one',
        'outlasted the clock': 'You outlasted the clock',
        survived: 'You survived',
      }[e.weapon] || 'Bonus';
      this.slip([{ i: ME, text: `+${e.pts}`, cls: 'df-you' }, ` ${why}`]);
      return null;
    }
    if (e.type === 'over') {
      return 'gate';
    }
    return null;
  }

  frame(g, t, camera, nowMs, extra = {}) {
    this.g = g;
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
    const meIn = g.inFight[ME] === 1;
    const meInf = meIn && g.inf[ME] === 1;
    const phase = g.phase;
    const mx = g.x[ME];
    const my = g.y[ME];
    const mz = g.z[ME];

    /* The last one, in gold, for everybody else: through walls, and an
     * arrow when off the screen. */
    if (g.gold >= 0 && g.gold !== ME && !g.over) {
      const i = g.gold;
      const p = this.project(g.xPrev[i] * u + g.x[i] * t, g.yPrev[i] * u + g.y[i] * t, g.zPrev[i] * u + g.z[i] * t, camera, this.onP);
      const on = !p.behind && p.x > 8 && p.x < this.w - 8 && p.y > 8 && p.y < this.h - 8;
      if (on) {
        this.diamond(ctx, p.x, p.y - 26, 11, AMBER);
      } else {
        this.edgeArrow(ctx, p, AMBER, nameOf(i, g), true);
      }
    }

    /* The sniff: where every clean pilot was, to the infected, for a
     * second, as a dashed ring that opens and fades. */
    const sniffAge = g.clockMs - g.sniffAt;
    if (meInf && sniffAge >= 0 && sniffAge < SNIFF_MS && !g.over) {
      const a = 1 - sniffAge / SNIFF_MS;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      for (let i = 0; i < g.cap; i += 1) {
        if (!g.sniffOn[i] || i === ME) continue;
        const p = this.project(g.sniffX[i], g.sniffY[i], g.sniffZ[i], camera, this.onP);
        const on = !p.behind && p.x > 8 && p.x < this.w - 8 && p.y > 8 && p.y < this.h - 8;
        if (on) {
          const r = 16 + 18 * (1 - a);
          this.mark(p.x, p.y, r + 6);
          ctx.setLineDash([6, 5]);
          ctx.lineWidth = 3;
          ctx.strokeStyle = INK;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 1.5, 0, 6.2832);
          ctx.stroke();
          ctx.strokeStyle = GREEN;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, 6.2832);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = '900 14px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = CREAM;
          ctx.strokeStyle = INK;
          ctx.lineWidth = 3;
          ctx.strokeText('?', p.x, p.y);
          ctx.fillText('?', p.x, p.y);
        } else {
          this.edgeArrow(ctx, p, GREEN, null);
        }
      }
      ctx.restore();
    }

    /* The edge: the nearest infected pilot, while clean and within about
     * a classroom, on the side of the screen it is on. Gold while the
     * pilot is the last one. */
    let edge = 0;
    if (meIn && !meInf && g.hunting) {
      let best = NEAR_M * NEAR_M * k * k;
      let bi = -1;
      for (let q = 0; q < g.inCount; q += 1) {
        const i = g.inList[q];
        if (!g.inf[i]) continue;
        const dx = g.x[i] - mx;
        const dy = g.y[i] - my;
        const dz = g.z[i] - mz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < best) {
          best = d2;
          bi = i;
        }
      }
      if (bi >= 0) {
        const p = this.project(g.x[bi], g.y[bi], g.z[bi], camera, this.onP);
        const left = p.behind ? p.x > this.w / 2 : p.x < this.w / 2;
        const centred = !p.behind && p.x > this.w * 0.3 && p.x < this.w * 0.7;
        edge = centred ? 3 : (left ? 1 : 2);
      }
    }
    if (L.edge !== edge) {
      L.edge = edge;
      this.edgeL.classList.toggle('is-off', !(edge & 1));
      this.edgeR.classList.toggle('is-off', !(edge & 2));
    }
    const goldEdge = g.gold === ME;
    if (L.goldEdge !== goldEdge) {
      L.goldEdge = goldEdge;
      this.edgeL.classList.toggle('is-gold', goldEdge);
      this.edgeR.classList.toggle('is-gold', goldEdge);
    }

    /* The calls and the line under them: timed, and the head start's
     * held across it. */
    if (this.callId && nowMs > this.callUntil) {
      this.calls[this.callId].classList.add('is-off');
      this.callId = '';
    }
    if (phase === 'head') {
      const s = Math.max(1, Math.ceil(g.headLeftMs() / 1000));
      if (g.pz === ME) {
        this.line(`You're infected! Your motors wake in <b>${s}</b>`, nowMs, 200, 'inf');
      } else if (meIn) {
        this.line(`${esc(nameOf(g.pz, g))} is infected. They get out in <b>${s}</b>`, nowMs, 200, 'inf');
      }
    } else if (phase === 'last' && meIn) {
      const left = clockText(g.leftMs());
      if (g.gold === ME) {
        this.line(`Everyone can see you now. Survive <b>${left}</b>`, nowMs, 200, 'gold');
      } else if (meInf) {
        this.line(`Catch ${esc(nameOf(g.gold, g))}! <b>${left}</b>`, nowMs, 200, 'gold');
      }
    }
    const sayOn = nowMs < this.sayUntil && !g.over;
    if (L.sayOn !== sayOn) {
      L.sayOn = sayOn;
      this.say.classList.toggle('is-off', !sayOn);
    }

    /* The strip. */
    const side = !meIn ? '' : (g.gold === ME ? 'gold' : (meInf ? 'inf' : 'clean'));
    const sideWord = { gold: 'LAST ONE', inf: 'INFECTED', clean: 'CLEAN' }[side] || 'WATCHING';
    const meScore = `${sideWord} · ${g.pts[ME]}`;
    if (L.meScore !== meScore) {
      L.meScore = meScore;
      this.scoreMe.textContent = meScore;
    }
    if (L.side !== side) {
      L.side = side;
      this.scoreMe.className = `df-me${side ? ` is-${side}` : ''}`;
    }
    const clock = phase === 'wait' ? clockText(g.roundMs) : (phase === 'head' ? `0:${String(Math.ceil(g.headLeftMs() / 1000)).padStart(2, '0')}` : clockText(g.leftMs()));
    if (L.clock !== clock) {
      L.clock = clock;
      this.scoreClock.textContent = clock;
    }
    const c = g.counts(g.tally);
    const cc = `${c.clean} CLEAN`;
    const ci = `${c.infected} INFECTED`;
    if (L.cc !== cc) {
      L.cc = cc;
      this.countClean.textContent = cc;
    }
    if (L.ci !== ci) {
      L.ci = ci;
      this.countInf.textContent = ci;
    }
    const pts = String(g.pts[ME]);
    if (L.pts !== pts) {
      L.pts = pts;
      this.ptsText.textContent = pts;
    }
    /* The chain, while it is open: how long is left to tag again. */
    const chainLeft = meInf && g.chain[ME] > 0 ? g.chainUntil[ME] - g.clockMs : 0;
    const chainOn = chainLeft > 0 && !g.over;
    const chainText = chainOn
      ? (g.chain[ME] >= 4 ? `Chain at x4. Keep tagging: ${Math.ceil(chainLeft / 1000)} s` : `Tag again in ${Math.ceil(chainLeft / 1000)} s for x${g.chain[ME] + 1}`)
      : '';
    if (L.chainOn !== chainOn) {
      L.chainOn = chainOn;
      this.chainBox.classList.toggle('is-off', !chainOn);
    }
    if (chainOn && L.chainText !== chainText) {
      L.chainText = chainText;
      this.chainSay.textContent = chainText;
      this.chainRing.textContent = `x${g.chain[ME]}`;
    }

    /* The banner: what to do before the round goes. */
    let banner = '';
    if (!g.over && phase === 'wait') {
      const head = Math.round(g.headMs / 1000);
      if (g.room && g.startedMs >= 0) {
        /* The board's countdown: everybody on a pad. */
        const inS = Math.max(1, Math.ceil((g.startedMs - g.clockMs) / 1000));
        banner = g.pz === ME
          ? `You start infected, in the glass tank. The others get ${head} s to hide. Starting in ${inS}`
          : `${nameOf(g.pz, g)} starts infected. You get ${head} s to hide. Starting in ${inS}`;
      } else if (g.room) {
        banner = g.host
          ? 'Press G or the pause menu to start the match.'
          : 'The host starts the match. Fly around and learn the halls.';
      } else if (g.pz === ME) {
        banner = `You start infected, in the glass tank. Take off to start: the others get ${head} s to hide.`;
      } else {
        banner = `Take off to start. ${nameOf(g.pz, g)} starts infected in the science lab. You get ${head} s to hide.`;
      }
    } else if (!g.over && phase === 'hunt' && meInf && g.leg === 0 && g.clockMs - g.huntAt < 6000 && g.pz === ME) {
      banner = 'Fly into a white quad to tag it.';
    }
    if (L.banner !== banner) {
      L.banner = banner;
      this.banner.textContent = banner;
      this.banner.classList.toggle('is-off', !banner);
    }

    /* A room's table is put away by Fly on while the round stays over. */
    const showing = g.over && !g.dismissed;
    if (L.over !== showing) {
      L.over = showing;
      this.result.classList.toggle('is-off', !showing);
      if (showing) {
        this.showResult(g, extra);
      }
    }
    const nextRound = showing ? Math.max(1, Math.ceil((extra.nextMs || 0) / 1000)) : 0;
    if (showing && this.resultKeys && L.nextRound !== nextRound) {
      L.nextRound = nextRound;
      const what = g.matchOver ? 'A new match' : `Round ${g.leg + 2}`;
      /* A room's rounds follow each other by themselves, as a solo
       * match's do; a new match is the host's. */
      this.resultKeys.textContent = g.room && g.matchOver
        ? (g.host ? 'Press G for a new match' : 'The host starts the next match')
        : `${what} in ${nextRound} s`;
    }
  }

  /* A small diamond with ink round it, over a pilot. */
  diamond(ctx, x, y, r, fill) {
    this.mark(x, y, r + 6);
    ctx.fillStyle = fill;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.8, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.8, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  showResult(g, extra) {
    this.g = g;
    const match = g.matchOver;
    const rows = match ? g.matchStandings() : g.standings();
    const top = match ? (rows[0] ? rows[0].slot : -1) : g.winner;
    let title;
    if (top === ME) {
      title = match ? 'YOU WIN THE MATCH!' : 'YOU WIN!';
    } else if (top >= 0) {
      title = `${nameOf(top, g).toUpperCase()} ${match ? 'WINS THE MATCH' : 'WINS'}`;
    } else {
      title = "TIME'S UP!";
    }
    const h = el('h2');
    const kick = match ? `${extra.kicker || 'Infected'} · The match` : `${extra.kicker || 'Infected'} · Round ${g.leg + 1} of ${LEGS}`;
    h.append(el('small', null, kick), document.createTextNode(title));
    const table = el('table');
    const head = el('tr');
    head.append(el('th', 'n', '#'), el('th', null, 'PILOT'), el('th', 'n', 'TAGS'), el('th', 'n', 'CLEAN'), el('th', 'n', 'ROUND'), el('th', 'n', 'TOTAL'));
    table.append(head);
    rows.forEach((r, n) => {
      const tr = el('tr', r.slot === ME ? 'is-me' : null);
      const name = el('td', null, nameOf(r.slot, g));
      if (r.last) {
        name.append(el('small', 'is-gold', 'LAST ONE'));
      } else if (r.first) {
        name.append(el('small', 'is-inf', 'FIRST INFECTED'));
      }
      if (r.bot) {
        name.append(el('small', null, 'BOT'));
      }
      tr.append(el('td', 'n', String(n + 1)), name, el('td', 'n', String(r.tags)), el('td', 'n', cleanText(r.cleanMs)),
        el('td', 'n', String(r.pts)), el('td', 'n', String(r.total)));
      table.append(tr);
    });
    /* The awards: the last one, the best tagger and the closest shaves. */
    const medals = el('div');
    const medal = (b, s, cls) => {
      const m = el('div', `df-medal${cls ? ` is-${cls}` : ''}`);
      m.append(el('b', null, b), el('span', null, s));
      medals.append(m);
    };
    const round = g.standings();
    const last = round.find((r) => r.last);
    if (last) {
      medal(last.alive ? 'Last one standing' : 'Last one caught', nameOf(last.slot, g), 'gold');
    }
    let tagger = null;
    let shaver = null;
    for (const r of round) {
      if (r.tags > 0 && (!tagger || r.tags > tagger.tags)) tagger = r;
      if (r.shaves > 0 && (!shaver || r.shaves > shaver.shaves)) shaver = r;
    }
    if (tagger) {
      medal('Top tagger', `${nameOf(tagger.slot, g)}, ${tagger.tags} ${tagger.tags === 1 ? 'tag' : 'tags'}`, 'inf');
    }
    if (shaver) {
      medal('Closest shaves', `${nameOf(shaver.slot, g)}, ${shaver.shaves}`, 'sky');
    }
    const me = round.find((r) => r.slot === ME);
    if (me) {
      medal('Your round', `${me.pts} points, clean for ${cleanText(me.cleanMs)}`);
    }
    if (!match) {
      medal('Next round', 'The first pilot caught this round starts infected.');
    }
    const cols = el('div', 'df-cols');
    cols.append(table, medals);
    const row = el('div', 'df-row');
    const again = el('button', 'df-btn is-go', match ? 'New match' : `Round ${g.leg + 2}`);
    const change = el('button', 'df-btn', 'Waiting room');
    const leave = el('button', 'df-btn', 'Leave');
    again.type = 'button';
    change.type = 'button';
    leave.type = 'button';
    again.addEventListener('click', () => this.onAgain && this.onAgain());
    change.addEventListener('click', () => this.onChange && this.onChange());
    leave.addEventListener('click', () => this.onLeave && this.onLeave());
    const keys = el('span', 'df-keys', '');
    this.resultKeys = keys;
    if (g.room) {
      const fly = el('button', 'df-btn', 'Fly on');
      fly.type = 'button';
      fly.addEventListener('click', () => this.onFlyOn && this.onFlyOn());
      row.append(...(g.host && match ? [again, fly] : [fly]), keys);
    } else {
      row.append(again, change, leave, keys);
    }
    this.result.replaceChildren(h, cols, row);
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  })[c]);
}
