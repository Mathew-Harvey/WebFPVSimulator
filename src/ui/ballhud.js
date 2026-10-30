/*
 * ballhud.js: the HUD of a Quad Ball match (src/game/quadball.js). The
 * goat herding HUD's (src/ui/herdhud.js) frame, which is the dogfight's with
 * the weapons taken off: the two teams' score and the clock at the top, your
 * own goals at the side, a ring on the ball with its distance and an arrow
 * to it when it is off screen, an arrow to the goal you are attacking, a
 * tag in the team's colour over every other quad, the kickoff count, GOAL!
 * when one goes in, and the match's results.
 *
 * COST. The dogfight HUD's: one 2D canvas cleared only where it was drawn,
 * a handful of strokes a frame, DOM written only when a value changes, the
 * lettered callouts painted once. Fetched only when a match is flown.
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
import { TEAM_NAMES } from '../maps/ball/arena.js';
import { BALL } from '../game/quadball.js';

const BALL_G = BALL.gravity;

const INK = '#0b1116';
const AMBER = '#ffd45c';
const CREAM = '#f3ead4';
const TEAM_COL = ['#f2a6bd', '#8fe0b8'];

/* How long GOAL! stays up, ms. */
const CALL_MS = 1800;

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

export class BallHud extends DogfightHud {
  constructor(root, opts = {}) {
    super(root, opts);
    this.root.classList.add('rb-hud');
    this.touch.remove();
    const gl = el('div', 'df-lbl');
    this.goalText = el('em', null, '0');
    gl.append(el('span', null, 'YOUR GOALS'), this.goalText);
    this.me.replaceChildren(gl);
    this.goalCall = el('canvas', 'df-call is-off');
    this.count = el('div', 'df-say is-off');
    this.count.style.cssText = 'position:absolute;left:50%;top:28%;transform:translateX(-50%);font:900 96px/1 system-ui,sans-serif;color:#ffd45c;-webkit-text-stroke:4px #0b1116;paint-order:stroke fill;pointer-events:none;background:none;border:0;box-shadow:none';
    this.root.append(this.goalCall, this.count);
    this.callAt = -1e9;
    this.callOn = false;
    this.ballP = { x: 0, y: 0, behind: false };
    this.landP = { x: 0, y: 0, behind: false };
    this.goalP = { x: 0, y: 0, behind: false };
  }

  paintOnce() {
    if (this.painted) {
      return;
    }
    this.painted = true;
    try {
      paintCall(this.goalCall, { word: 'GOAL!', fill: INKS.mint, size: 64, balloon: true });
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

  slipGoal(e, g) {
    const s = el('div', 'df-slip');
    const team = e.to >= 0 ? TEAM_NAMES[e.to] : '';
    if (e.by >= 0) {
      s.append(el('b', e.by === ME ? 'df-you' : null, nameOf(e.by, g)), document.createTextNode(` scored for ${team}`));
    } else if (e.weapon === 'own') {
      s.append(document.createTextNode(`An own goal: ${team} score`));
    } else {
      s.append(document.createTextNode(`${team} score`));
    }
    this.feed.append(s);
    while (this.feed.childElementCount > 4) {
      this.feed.firstChild.remove();
    }
    setTimeout(() => s.classList.add('is-old'), 5000);
    setTimeout(() => s.remove(), 5700);
  }

  event(e, g, nowMs) {
    if (e.type === 'goal') {
      this.slipGoal(e, g);
      this.callAt = nowMs;
      this.callOn = true;
      this.goalCall.classList.remove('is-off');
      const w = this.goalCall.width || 200;
      this.goalCall.style.left = `${Math.round((this.w || window.innerWidth) / 2 - w / 2)}px`;
      this.goalCall.style.top = `${Math.round((this.h || window.innerHeight) * 0.16)}px`;
      return e.to === g.team[ME] ? 'gate' : 'select';
    }
    if (e.type === 'go' || e.type === 'overtime' || e.type === 'reset') {
      return 'select';
    }
    /* A hard knock of the ball is heard when it is near you. */
    if (e.type === 'bounce' && e.big) {
      const d = Math.hypot(e.x - g.x[ME], e.z - g.z[ME]);
      return d < 45 * g.k ? 'land' : null;
    }
    /* Your own touch is heard: a thud for a nudge, a crack for a hard hit.
     * Another pilot's is not, so a crowded pitch is not a wall of noise. */
    if (e.type === 'touch' && e.by === ME) {
      return e.big ? 'clip' : 'land';
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
    const mine = g.team[ME];
    ctx.font = '900 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    /* A chevron in the team's colour over every other quad. */
    for (let i = 0; i < slots; i += 1) {
      if (i === ME || !g.inFight[i] || !g.alive[i]) {
        continue;
      }
      const x = g.xPrev[i] * u + g.x[i] * t;
      const y = g.yPrev[i] * u + g.y[i] * t;
      const z = g.zPrev[i] * u + g.z[i] * t;
      const dx = x - mx;
      const dy = y - my;
      const dz = z - mz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const p = this.project(x, y + 0.5 * k, z, camera, this.onP);
      if (p.behind || p.x < 8 || p.x > this.w - 8 || p.y < 8 || p.y > this.h - 8) {
        continue;
      }
      const s = Math.max(8, Math.min(22, (22 * k * 8) / Math.max(d, 0.1)));
      const top = p.y - s - 6;
      this.mark(p.x, top, 30);
      ctx.fillStyle = TEAM_COL[g.team[i]];
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(p.x - 8, top - 6);
      ctx.lineTo(p.x, top + 4);
      ctx.lineTo(p.x + 8, top - 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    /* The ball. */
    const bx = g.ballPrev.x * u + g.ball.x * t;
    const by = g.ballPrev.y * u + g.ball.y * t;
    const bz = g.ballPrev.z * u + g.ball.z * t;
    const bd = Math.sqrt((bx - mx) ** 2 + (by - my) ** 2 + (bz - mz) ** 2);
    const bp = this.project(bx, by, bz, camera, this.ballP);
    const bon = !bp.behind && bp.x > 8 && bp.x < this.w - 8 && bp.y > 8 && bp.y < this.h - 8;
    if (bon) {
      const r = Math.max(14, Math.min(60, (90 * k) / Math.max(bd, 0.1) * 6));
      this.mark(bp.x, bp.y, r + 26);
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, r, 0, Math.PI * 2);
      ctx.stroke();
      if (bd > 12 * k) {
        ctx.fillStyle = CREAM;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        const txt = `${Math.round(bd / k)} m`;
        ctx.strokeText(txt, bp.x, bp.y + r + 14);
        ctx.fillText(txt, bp.x, bp.y + r + 14);
      }
    } else {
      this.edgeArrow(ctx, bp, AMBER, 'BALL', true);
    }
    /* Where the ball will come down, flat on the pitch: the straight line
     * under gravity, from this frame's height and speed. It is drawn on
     * this canvas, so it costs no draw call. */
    const floor = g.arena.floor || 0;
    const R = g.bR;
    const hh = by - R - floor;
    if (hh > 3 * k && g.inPlay) {
      const gg = BALL_G * k;
      const tt = (g.ball.vy + Math.sqrt(g.ball.vy * g.ball.vy + 2 * gg * hh)) / gg;
      const lx = Math.max(-g.arena.hx, Math.min(g.arena.hx, bx + g.ball.vx * tt));
      const lz = Math.max(-g.arena.hz, Math.min(g.arena.hz, bz + g.ball.vz * tt));
      const lp = this.project(lx, floor + 0.1, lz, camera, this.landP);
      if (!lp.behind && lp.x > 8 && lp.x < this.w - 8 && lp.y > 8 && lp.y < this.h - 8) {
        const lr = Math.max(8, Math.min(40, (60 * k) / Math.max(Math.hypot(lx - mx, lz - mz, 4 * k), 0.1) * 6));
        this.mark(lp.x, lp.y, lr * 1.4);
        ctx.strokeStyle = AMBER;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(lp.x, lp.y, lr, lr * 0.4, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    /* The goal you attack, off screen only: an arrow in your colour. */
    const gx = (mine === 0 ? 1 : -1) * g.arena.hx;
    const gp = this.project(gx, g.arena.gh * 0.5, 0, camera, this.goalP);
    const gon = !gp.behind && gp.x > 8 && gp.x < this.w - 8 && gp.y > 8 && gp.y < this.h - 8;
    if (!gon) {
      this.edgeArrow(ctx, gp, TEAM_COL[1 - mine], 'THEIR GOAL', false);
    }

    if (this.callOn && nowMs - this.callAt > CALL_MS) {
      this.callOn = false;
      this.goalCall.classList.add('is-off');
    }

    /* The count to a kickoff. */
    const cd = g.countdownS();
    const word = cd > 0 ? String(cd) : '';
    if (L.count !== word) {
      L.count = word;
      this.count.textContent = word;
      this.count.classList.toggle('is-off', !word);
    }

    const score = `${TEAM_NAMES[0]} ${g.teamScore[0]}  -  ${g.teamScore[1]} ${TEAM_NAMES[1]}`;
    if (L.meScore !== score) {
      L.meScore = score;
      this.scoreMe.textContent = score;
    }
    const ms = g.roundMs ? g.leftMs() : -1;
    const clock = g.overtime ? 'OVERTIME' : (ms >= 0 ? clockText(ms) : (g.ballRules.practice ? 'PRACTICE' : `FIRST TO ${g.goalsToWin}`));
    if (L.clock !== clock) {
      L.clock = clock;
      this.scoreClock.textContent = clock;
    }
    const side = `YOU ARE ${TEAM_NAMES[mine]}`;
    if (L.best !== side) {
      L.best = side;
      this.scoreBest.textContent = side;
      this.scoreBest.style.color = TEAM_COL[mine];
    }
    const goals = String(g.pops[ME]);
    if (L.mine !== goals) {
      L.mine = goals;
      this.goalText.textContent = goals;
    }

    let banner = '';
    if (g.room) {
      if (!g.over && g.startedMs < 0) {
        banner = g.host
          ? 'Press G or the pause menu to start the match. Push the ball into their goal.'
          : 'The host starts each match. Push the ball into their goal.';
      }
    } else if (!g.over && g.startedMs < 0 && g.ballRules.practice) {
      banner = 'Take off to kick off. Just you and the ball: no clock, no bots. Hit it into the east goal.';
    } else if (!g.over && g.startedMs < 0) {
      const n = g.ballRules.size;
      banner = `Take off to kick off. ${n} a side, you are ${TEAM_NAMES[mine]}. Hit the ball into the ${mine === 0 ? 'east' : 'west'} goal.`;
    }
    if (L.banner !== banner) {
      L.banner = banner;
      this.banner.textContent = banner;
      this.banner.classList.toggle('is-off', !banner);
    }

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
      this.resultKeys.textContent = g.room
        ? (g.host ? 'Press G for another match' : 'The host starts the next match')
        : `Next match in ${nextRound} s`;
    }
  }

  showResult(g, extra) {
    const rows = g.standings();
    const mine = g.team[ME];
    let title;
    if (g.winnerTeam < 0) {
      title = 'A DRAW!';
    } else if (g.winnerTeam === mine) {
      title = 'YOU WIN!';
    } else {
      title = `${TEAM_NAMES[g.winnerTeam]} WIN`;
    }
    const h = el('h2');
    h.append(el('small', null, extra.kicker || 'Quad Ball'), document.createTextNode(title));
    const table = el('table');
    const head = el('tr');
    head.append(el('th', 'n', '#'), el('th', null, 'PILOT'), el('th', null, 'TEAM'), el('th', 'n', 'GOALS'), el('th', 'n', 'TOUCHES'));
    table.append(head);
    rows.forEach((r, n) => {
      const tr = el('tr', r.slot === ME ? 'is-me' : null);
      const name = el('td', null, nameOf(r.slot, g));
      if (r.bot) {
        name.append(el('span', 'df-bot', 'BOT'));
      }
      const tm = el('td', null, TEAM_NAMES[r.team]);
      tm.style.color = TEAM_COL[r.team];
      tr.append(el('td', 'n', String(n + 1)), name, tm, el('td', 'n', String(r.goals)), el('td', 'n', String(r.touches)));
      table.append(tr);
    });
    const medals = el('div');
    const medal = (b, s) => {
      const m = el('div', 'df-medal');
      m.append(el('b', null, b), el('span', null, s));
      medals.append(m);
    };
    medal('Final score', `${TEAM_NAMES[0]} ${g.teamScore[0]}, ${TEAM_NAMES[1]} ${g.teamScore[1]}`);
    const m = g.pops[ME];
    medal('Your goals', `${m} ${m === 1 ? 'goal' : 'goals'}, ${g.touches[ME]} touches`);
    if (extra.best != null && !g.room) {
      medal('Your best here', extra.newBest ? `${extra.best} goals, a new best` : `${extra.best} goals`);
    }
    const cols = el('div', 'df-cols');
    cols.append(table, medals);
    const row = el('div', 'df-row');
    const again = el('button', 'df-btn is-go', 'Again');
    const change = el('button', 'df-btn', 'Change the match');
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
      row.append(...(g.host ? [again, fly] : [fly]), keys);
    } else {
      row.append(again, change, leave, keys);
    }
    this.result.replaceChildren(h, cols, row);
  }
}
