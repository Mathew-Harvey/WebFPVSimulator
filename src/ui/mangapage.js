/*
 * mangapage.js: the freestyle run's results as a manga page
 * (FREESTYLE-MAPS-PLAN.md section 3.2 item 6), and the share card made
 * from it.
 *
 * THE PANELS, one for each thing the run is remembered by, and only the
 * ones it has: a panel with nothing to show is left out, not drawn empty.
 *
 *   BEST TRICK     the run's biggest single trick, drawn by the trick film
 *                  (src/ui/trickfilm.js) from the pattern the recogniser
 *                  matched: the still at the end of the trick, its line
 *                  and its ghosts, so the picture is computed from the
 *                  same data that paid for it
 *   BEST GAP       the named gap that paid most, the craft through a
 *                  portal under focus lines, and ズバッ
 *   LONGEST SKIM   along a wall, or over a roof edge for a roof skim, with
 *                  the seconds held, and シュッ
 *   THE CHASE      the best tail, the car from behind on its road; the
 *                  drift car sliding in its own smoke when it was that one,
 *                  and キキーッ, or ブーン for any other car
 *   MARK FOUND     the STF mark, when the run found it: Stage B's found
 *                  panel (the mark on paper, the dot tone, the burst),
 *                  drawn here the way ui.js's stfFound lays it out
 *
 * ONE DRAWING FOR THE SCREEN AND THE CARD. drawMangaPage lays the panels
 * out for whatever box it is given, a tall page down the right of the
 * results screen, a strip on a phone on its side, the landscape half of
 * the share card, and draws them there. The card is the page beside the
 * score, with the wordmark the card code already draws
 * (src/share/card.js), at the card's own 1200 by 630.
 *
 * CEL SHADED, like the town and the films: flat fills, hard ink lines, no
 * blur, no gradient that is not a hard stop. Drawn once when the results
 * are shown and again only if the window changes size: no frame loop.
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

import { formatScore } from '../game/score.js';
import { PATTERNS } from '../game/trickdetect.js';
import { drawFilm, drawQuad, filmFor } from './trickfilm.js';
import {
  INK, INKS, PAPER, SFX, drawSfx, drawWord, sfxWidth, wordWidth,
} from './lettering.js';

const TURN = Math.PI * 2;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/* The town's palette, as the films have it, and the road's. */
const SKY_HIGH = '#8fb6d8';
const SKY_LOW = '#e9c3ac';
const GRASS = '#6f8f63';
const CONCRETE = '#b9b3a8';
const CONCRETE_DARK = '#8d877d';
const ROAD = '#5b6168';
const SAKURA = '#e8a8b8';
const HAZARD = '#ffd45c';
const DEEP = '#141c16';

function secs(ms) {
  return `${(ms / 1000).toFixed(1)} s`;
}

/* A stable wobble for the art, the lettering's hash's cousin. */
function wob(seed, i) {
  let h = Math.imul(seed ^ Math.imul(i + 1, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/*
 * The panels a summary has, in the order the page reads them, biggest
 * first. Pure: Node can ask it what a run's page will hold.
 *
 * Reads, from src/game/score.js summary(): tricks, signature, bestTrick and
 * rows (the trick), and from the counter's additions bestGap {name,
 * points}, longestSkim {ms, name}, bestTail {ms, drift} and eggFound.
 */
export function mangaPanels(s) {
  const out = [];
  if (!s) {
    return out;
  }
  const top = s.rows && s.rows.length ? s.rows[0] : null;
  const trick = s.signature || (top ? top.name : '');
  if (s.tricks > 0 && trick) {
    const pat = PATTERNS.find((p) => p.name === trick);
    out.push({
      kind: 'trick',
      label: 'Best trick',
      name: trick,
      value: formatScore(s.bestTrick > 0 ? s.bestTrick : (top ? top.points : 0)),
      steps: pat ? pat.steps : null,
    });
  }
  if (s.bestGap && s.bestGap.name) {
    out.push({
      kind: 'gap', label: 'Best gap', name: s.bestGap.name, value: `+${formatScore(s.bestGap.points || 0)}`,
    });
  }
  if (s.longestSkim && s.longestSkim.ms > 0) {
    const name = s.longestSkim.name || 'Skim';
    out.push({
      kind: 'skim', label: 'Longest skim', name, value: secs(s.longestSkim.ms), roof: /roof/i.test(name),
    });
  }
  if (s.bestTail && s.bestTail.ms > 0) {
    out.push({
      kind: 'chase',
      label: 'The chase',
      name: s.bestTail.drift ? 'Drift Tail' : 'Tail',
      value: secs(s.bestTail.ms),
      drift: Boolean(s.bestTail.drift),
    });
  }
  if (s.eggFound) {
    out.push({
      kind: 'stf', label: 'Mark found', name: 'STF', value: '',
    });
  }
  return out;
}

/* The page in words, for the canvas's accessible name: a picture of five
 * panels says nothing to a screen reader otherwise. */
export function pageSentence(panels) {
  return panels.map((p) => {
    if (p.kind === 'stf') {
      return 'The STF mark, found.';
    }
    return `${p.label}: ${p.name}, ${p.value}.`;
  }).join(' ');
}

/* ------------------------------------------------------------------ *
 * The layout: panels as quadrilaterals with slanted gutters
 * ------------------------------------------------------------------ */

/* A quad is [TLx, TLy, TRx, TRy, BRx, BRy, BLx, BLy]. */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/* Split by a line from the top edge at f + d to the bottom edge at f - d:
 * a vertical gutter leaning by d. */
function splitV(q, f, d) {
  const tx = lerp(q[0], q[2], f + d);
  const ty = lerp(q[1], q[3], f + d);
  const bx = lerp(q[6], q[4], f - d);
  const by = lerp(q[7], q[5], f - d);
  return [
    [q[0], q[1], tx, ty, bx, by, q[6], q[7]],
    [tx, ty, q[2], q[3], q[4], q[5], bx, by],
  ];
}

/* Split by a line from the left edge at f - e to the right edge at f + e. */
function splitH(q, f, e) {
  const lx = lerp(q[0], q[6], f - e);
  const ly = lerp(q[1], q[7], f - e);
  const rx = lerp(q[2], q[4], f + e);
  const ry = lerp(q[3], q[5], f + e);
  return [
    [q[0], q[1], q[2], q[3], rx, ry, lx, ly],
    [lx, ly, rx, ry, q[4], q[5], q[6], q[7]],
  ];
}

/*
 * n panels in quad R, whose aspect is a. The first is the biggest. A strip
 * when the box is very wide (a phone on its side), a column when it is very
 * tall; otherwise the shapes a manga page uses, every gutter leaning a
 * little, alternately, so the page reads as drawn rather than tabulated.
 */
function gridQuads(R, n, a) {
  if (n <= 1) {
    return [R];
  }
  if (a >= 2.3 || a <= 0.62) {
    const out = [];
    let rest = R;
    for (let i = 0; i < n - 1; i += 1) {
      const lean = i % 2 ? -0.03 : 0.03;
      const [p, r] = a >= 2.3 ? splitV(rest, 1 / (n - i), lean) : splitH(rest, 1 / (n - i), lean);
      out.push(p);
      rest = r;
    }
    out.push(rest);
    return out;
  }
  if (n === 2) {
    return a >= 1 ? splitV(R, 0.56, 0.04) : splitH(R, 0.5, 0.04);
  }
  if (n >= 5) {
    /* Two over three, or three bands on a tall page. The found panel
     * used to break the grid over the bottom right corner, the way the
     * found panel in flight does, and it covered the chase panel's car
     * and its lettering: a panel drawn over another is a panel hidden. */
    if (a < 0.85) {
      const [T, rest] = splitH(R, 0.3, 0.03);
      const [M, B] = splitH(rest, 0.5, -0.03);
      const [M1, M2] = splitV(M, 0.5, 0.05);
      const [B1, B2] = splitV(B, 0.5, -0.05);
      return [T, M1, M2, B1, B2];
    }
    const [T, B] = splitH(R, 0.52, 0.03);
    const [T1, T2] = splitV(T, 0.58, 0.04);
    const [B1, rest] = splitV(B, 0.34, -0.03);
    const [B2, B3] = splitV(rest, 0.5, 0.04);
    return [T1, T2, B1, B2, B3];
  }
  if (n === 3) {
    if (a >= 1.15) {
      const [A, B] = splitV(R, 0.56, 0.035);
      const [B1, B2] = splitH(B, 0.5, -0.05);
      return [A, B1, B2];
    }
    const [T, B] = splitH(R, 0.5, 0.04);
    const [B1, B2] = splitV(B, 0.5, 0.05);
    return [T, B1, B2];
  }
  if (a < 0.85) {
    const [T, rest] = splitH(R, 0.34, 0.03);
    const [M, B] = splitH(rest, 0.5, -0.03);
    const [M1, M2] = splitV(M, 0.5, 0.05);
    return [T, M1, M2, B];
  }
  const [T, B] = splitH(R, 0.52, 0.03);
  const [T1, T2] = splitV(T, 0.58, 0.04);
  const [B1, B2] = splitV(B, 0.42, -0.04);
  return [T1, T2, B1, B2];
}

/*
 * The quad moved in by d on every side: each edge's line offset inward and
 * the neighbours' lines intersected, which keeps a gutter the same width
 * however the edges lean. The quads here are convex and wound clockwise on
 * a y-down canvas, so inward is to the right of each edge.
 */
function insetQuad(q, d) {
  const lines = [];
  for (let i = 0; i < 4; i += 1) {
    const px = q[i * 2];
    const py = q[i * 2 + 1];
    const dx = q[((i + 1) % 4) * 2] - px;
    const dy = q[((i + 1) % 4) * 2 + 1] - py;
    const len = Math.hypot(dx, dy) || 1;
    lines.push([px - (dy / len) * d, py + (dx / len) * d, dx, dy]);
  }
  const out = new Array(8);
  for (let i = 0; i < 4; i += 1) {
    const [ax, ay, adx, ady] = lines[(i + 3) % 4];
    const [bx, by, bdx, bdy] = lines[i];
    const cross = adx * bdy - ady * bdx;
    const t = cross ? ((bx - ax) * bdy - (by - ay) * bdx) / cross : 0;
    out[i * 2] = ax + adx * t;
    out[i * 2 + 1] = ay + ady * t;
  }
  return out;
}

function quadPath(ctx, q) {
  ctx.beginPath();
  ctx.moveTo(q[0], q[1]);
  ctx.lineTo(q[2], q[3]);
  ctx.lineTo(q[4], q[5]);
  ctx.lineTo(q[6], q[7]);
  ctx.closePath();
}

function boxOf(q) {
  const x0 = Math.min(q[0], q[6]);
  const x1 = Math.max(q[2], q[4]);
  const y0 = Math.min(q[1], q[3]);
  const y1 = Math.max(q[5], q[7]);
  return {
    x: x0, y: y0, w: x1 - x0, h: y1 - y0,
  };
}

/* ------------------------------------------------------------------ *
 * The art, one function a kind, each drawing into (x, y, w, h)
 * ------------------------------------------------------------------ */

function inkLine(ctx, w) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = w;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

function skyAndGround(ctx, x, y, w, h, horizon) {
  const hz = y + h * horizon;
  ctx.fillStyle = SKY_HIGH;
  ctx.fillRect(x, y, w, (hz - y) * 0.62);
  ctx.fillStyle = SKY_LOW;
  ctx.fillRect(x, y + (hz - y) * 0.62, w, (hz - y) * 0.38 + 1);
  ctx.fillStyle = GRASS;
  ctx.fillRect(x, hz, w, y + h - hz);
  inkLine(ctx, 2);
  ctx.beginPath();
  ctx.moveTo(x, hz);
  ctx.lineTo(x + w, hz);
  ctx.stroke();
  return hz;
}

/*
 * FOCUS LINES, the manga's 集中線: thin ink wedges from outside the panel
 * toward a point, stopping short of it, so the eye is driven to whatever
 * is left clear in the middle.
 */
function focusLines(ctx, cx, cy, r0, reach, seed, n, alpha) {
  ctx.save();
  ctx.fillStyle = INK;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * TURN + (wob(seed, i) - 0.5) * (TURN / n);
    const inner = r0 * (1 + wob(seed, i + 300) * 0.45);
    const spread = 0.006 + wob(seed, i + 600) * 0.012;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a - spread) * reach, cy + Math.sin(a - spread) * reach);
    ctx.lineTo(cx + Math.cos(a + spread) * reach, cy + Math.sin(a + spread) * reach);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/* Speed streaks along a direction: flat ink strokes of uneven length. */
function streaks(ctx, x, y, w, h, seed, n, dirX, dirY, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  inkLine(ctx, Math.max(1, Math.min(w, h) * 0.008));
  for (let i = 0; i < n; i += 1) {
    const sx = x + wob(seed, i) * w;
    const sy = y + wob(seed, i + 50) * h;
    const len = Math.min(w, h) * (0.15 + wob(seed, i + 100) * 0.35);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + dirX * len, sy + dirY * len);
    ctx.stroke();
  }
  ctx.restore();
}

function artTrick(ctx, x, y, w, h, p) {
  if (!p.steps) {
    skyAndGround(ctx, x, y, w, h, 0.78);
    focusLines(ctx, x + w * 0.5, y + h * 0.42, Math.min(w, h) * 0.24, Math.hypot(w, h), 7, 60, 0.7);
    drawQuad(ctx, x + w * 0.5, y + h * 0.42, -0.4, Math.min(w, h) * 0.14, 1, 1, false);
    return;
  }
  const film = filmFor(p.steps);
  /* The still at the end of the trick: its whole line and its ghosts. */
  let t = 0;
  for (const seg of film.segs) {
    t += seg.ms;
  }
  ctx.save();
  ctx.translate(x, y);
  drawFilm(ctx, film, t, w, h);
  ctx.restore();
}

function artGap(ctx, x, y, w, h, p) {
  const u = Math.min(w, h);
  const hz = skyAndGround(ctx, x, y, w, h, 0.76);
  const cx = x + w * 0.5;
  const cy = y + h * 0.47;
  focusLines(ctx, cx, cy, u * 0.3, Math.hypot(w, h), 11, 72, 0.75);
  /* The portal: two pillars and a jib, striped like the crane's. */
  const top = y + h * 0.14;
  const beamH = h * 0.09;
  const pw = w * 0.1;
  const left = x + w * 0.17;
  const right = x + w * 0.83 - pw;
  inkLine(ctx, Math.max(2, u * 0.012));
  ctx.fillStyle = CONCRETE;
  for (const px of [left, right]) {
    ctx.fillRect(px, top, pw, hz - top);
    ctx.strokeRect(px, top, pw, hz - top);
    ctx.fillStyle = CONCRETE_DARK;
    ctx.fillRect(px + pw * 0.62, top + beamH, pw * 0.38, hz - top - beamH);
    ctx.fillStyle = CONCRETE;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + w * 0.12, top, w * 0.76, beamH);
  ctx.fillStyle = HAZARD;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = INK;
  for (let sx = x + w * 0.12 - beamH; sx < x + w * 0.9; sx += beamH * 1.4) {
    ctx.beginPath();
    ctx.moveTo(sx, top + beamH);
    ctx.lineTo(sx + beamH * 0.7, top + beamH);
    ctx.lineTo(sx + beamH * 1.4, top);
    ctx.lineTo(sx + beamH * 0.7, top);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeRect(x + w * 0.12, top, w * 0.76, beamH);
  /* The craft, through it, with its wake behind. */
  streaks(ctx, cx - u * 0.42, cy - u * 0.02, u * 0.3, u * 0.14, 23, 8, -1, 0.35, 0.8);
  drawQuad(ctx, cx, cy + h * 0.04, -0.35, u * 0.13, 1, 1, false);
}

function artSkim(ctx, x, y, w, h, p) {
  const u = Math.min(w, h);
  if (p.roof) {
    /* Over a roof edge: the slab below, its edge the line the craft rides. */
    ctx.fillStyle = SKY_HIGH;
    ctx.fillRect(x, y, w, h * 0.5);
    ctx.fillStyle = SKY_LOW;
    ctx.fillRect(x, y + h * 0.5, w, h * 0.5);
    const edge = y + h * 0.66;
    ctx.fillStyle = CONCRETE;
    ctx.beginPath();
    ctx.moveTo(x - 2, edge);
    ctx.lineTo(x + w + 2, edge - h * 0.1);
    ctx.lineTo(x + w + 2, y + h);
    ctx.lineTo(x - 2, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = CONCRETE_DARK;
    ctx.beginPath();
    ctx.moveTo(x - 2, edge + h * 0.06);
    ctx.lineTo(x + w + 2, edge - h * 0.04);
    ctx.lineTo(x + w + 2, y + h);
    ctx.lineTo(x - 2, y + h);
    ctx.closePath();
    ctx.fill();
    inkLine(ctx, Math.max(2, u * 0.012));
    ctx.beginPath();
    ctx.moveTo(x - 2, edge);
    ctx.lineTo(x + w + 2, edge - h * 0.1);
    ctx.stroke();
    streaks(ctx, x, y + h * 0.3, w, h * 0.32, 31, 26, -1, 0.1, 0.55);
    drawQuad(ctx, x + w * 0.46, edge - h * 0.13, -0.12, u * 0.12, 1, 1, false);
    return;
  }
  /* Along a wall, the town's slab with its sakura band, running away. */
  skyAndGround(ctx, x, y, w, h, 0.72);
  const vx = x + w * 0.18;
  const vy = y + h * 0.5;
  const nearX = x + w * 0.98;
  ctx.fillStyle = CONCRETE;
  ctx.beginPath();
  ctx.moveTo(vx, vy - h * 0.06);
  ctx.lineTo(nearX, y + h * 0.02);
  ctx.lineTo(nearX, y + h * 0.98);
  ctx.lineTo(vx, vy + h * 0.2);
  ctx.closePath();
  ctx.fill();
  inkLine(ctx, Math.max(2, u * 0.012));
  ctx.stroke();
  ctx.fillStyle = SAKURA;
  ctx.beginPath();
  ctx.moveTo(vx, vy + h * 0.04);
  ctx.lineTo(nearX, y + h * 0.4);
  ctx.lineTo(nearX, y + h * 0.52);
  ctx.lineTo(vx, vy + h * 0.07);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  streaks(ctx, x, y + h * 0.2, w * 0.7, h * 0.6, 37, 22, -1, 0.18, 0.5);
  drawQuad(ctx, x + w * 0.56, y + h * 0.5, 0.1, u * 0.13, 0.62, 1, false);
}

/* Smoke as the town's cars throw it: round, flat, cream over violet, inked. */
function puff(ctx, cx, cy, r, u) {
  ctx.fillStyle = '#f1e6d6';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TURN);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#b9a7c9';
  ctx.beginPath();
  ctx.arc(cx + r * 0.35, cy + r * 0.45, r, 0, TURN);
  ctx.fill();
  ctx.restore();
  inkLine(ctx, Math.max(1.5, u * 0.008));
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TURN);
  ctx.stroke();
}

function artChase(ctx, x, y, w, h, p) {
  const u = Math.min(w, h);
  const hz = skyAndGround(ctx, x, y, w, h, 0.42);
  /* The road, running to the horizon. */
  const vx = x + w * 0.5;
  ctx.fillStyle = ROAD;
  ctx.beginPath();
  ctx.moveTo(vx - w * 0.04, hz);
  ctx.lineTo(vx + w * 0.04, hz);
  ctx.lineTo(x + w * 1.1, y + h);
  ctx.lineTo(x - w * 0.1, y + h);
  ctx.closePath();
  ctx.fill();
  inkLine(ctx, 2);
  ctx.stroke();
  ctx.save();
  ctx.strokeStyle = '#f3ead4';
  ctx.lineWidth = Math.max(2, u * 0.012);
  ctx.setLineDash([u * 0.06, u * 0.05]);
  ctx.beginPath();
  ctx.moveTo(vx, hz);
  ctx.lineTo(vx, y + h);
  ctx.stroke();
  ctx.restore();
  focusLines(ctx, vx, y + h * 0.58, u * 0.42, Math.hypot(w, h), 43, 56, 0.55);
  /* The car from behind. */
  const cw = Math.min(w * 0.46, h * 0.62);
  const ch = cw * 0.52;
  const cx = vx;
  const cy = y + h * 0.66;
  ctx.save();
  ctx.translate(cx, cy);
  if (p.drift) {
    ctx.rotate(-0.16);
  }
  if (p.drift) {
    for (let i = 0; i < 5; i += 1) {
      puff(ctx, -cw * (0.5 + i * 0.16), ch * (0.3 - i * 0.12), cw * (0.13 + i * 0.03), u);
    }
    puff(ctx, cw * 0.5, ch * 0.36, cw * 0.1, u);
  }
  inkLine(ctx, Math.max(2, u * 0.012));
  /* Wheels, then the body over them. */
  ctx.fillStyle = INK;
  ctx.fillRect(-cw * 0.44, ch * 0.18, cw * 0.16, ch * 0.34);
  ctx.fillRect(cw * 0.28, ch * 0.18, cw * 0.16, ch * 0.34);
  ctx.fillStyle = p.drift ? '#ff9f5a' : '#6fb3a8';
  ctx.beginPath();
  ctx.moveTo(-cw * 0.5, ch * 0.34);
  ctx.lineTo(-cw * 0.5, -ch * 0.08);
  ctx.lineTo(-cw * 0.34, -ch * 0.5);
  ctx.lineTo(cw * 0.34, -ch * 0.5);
  ctx.lineTo(cw * 0.5, -ch * 0.08);
  ctx.lineTo(cw * 0.5, ch * 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  /* The rear window and the lamps, lit. */
  ctx.fillStyle = '#2a3440';
  ctx.beginPath();
  ctx.moveTo(-cw * 0.3, -ch * 0.12);
  ctx.lineTo(-cw * 0.24, -ch * 0.42);
  ctx.lineTo(cw * 0.24, -ch * 0.42);
  ctx.lineTo(cw * 0.3, -ch * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ff4d5e';
  ctx.fillRect(-cw * 0.46, ch * 0.0, cw * 0.16, ch * 0.12);
  ctx.strokeRect(-cw * 0.46, ch * 0.0, cw * 0.16, ch * 0.12);
  ctx.fillRect(cw * 0.3, ch * 0.0, cw * 0.16, ch * 0.12);
  ctx.strokeRect(cw * 0.3, ch * 0.0, cw * 0.16, ch * 0.12);
  ctx.fillStyle = '#f3ead4';
  ctx.fillRect(-cw * 0.12, ch * 0.12, cw * 0.24, ch * 0.1);
  ctx.strokeRect(-cw * 0.12, ch * 0.12, cw * 0.24, ch * 0.1);
  ctx.restore();
  /* The craft, on its tail, up and off to the side, clear of the sound
   * effect in the far corner. */
  drawQuad(ctx, x + w * 0.2, y + h * 0.56, -1.3, u * 0.09, 1, 1, false);
}

/* The found panel, as Stage B draws it (.stf-panel in index.html): paper,
 * a 45 degree dot tone, an ink burst from the middle, and the mark over
 * all of it. `stf` is the painted mark (src/art/stf.js stfCanvas), or null
 * before it has loaded, when the lettering stands in for it. */
function artStf(ctx, x, y, w, h, p, stf) {
  const u = Math.min(w, h);
  ctx.fillStyle = '#f3ead4';
  ctx.fillRect(x, y, w, h);
  const step = Math.max(5, u * 0.045);
  ctx.fillStyle = 'rgba(11, 17, 22, 0.34)';
  for (let j = 0; j * step < h + step; j += 1) {
    for (let i = 0; i * step < w + step; i += 1) {
      ctx.beginPath();
      ctx.arc(x + i * step + (j % 2 ? step * 0.5 : 0), y + j * step, step * 0.17, 0, TURN);
      ctx.fill();
    }
  }
  focusLines(ctx, x + w * 0.5, y + h * 0.5, u * 0.26, Math.hypot(w, h), 57, 64, 0.8);
  if (stf) {
    const mw = w * 0.84;
    const mh = mw * (stf.height / stf.width);
    ctx.save();
    ctx.translate(x + w * 0.5, y + h * 0.52);
    ctx.rotate(-0.045);
    ctx.drawImage(stf, -mw * 0.5, -mh * 0.5, mw, mh);
    ctx.restore();
    return;
  }
  const px = Math.min(h * 0.46, w * 0.28);
  let lx = x + w * 0.5 - px * 1.05;
  const by = y + h * 0.5 + px * 0.34;
  lx += drawWord(ctx, 'S', lx, by, px, '#f3f0e8');
  lx += drawWord(ctx, 'T', lx, by, px, INKS.green);
  drawWord(ctx, 'F', lx, by, px, '#f3f0e8');
}

const SFX_OF = {
  gap: () => SFX.gap,
  skim: () => SFX.skim,
  chase: (p) => (p.drift ? SFX.drift : SFX.tail),
};

const FILL_OF = {
  trick: INKS.cream,
  gap: INKS.amber,
  skim: INKS.sky,
  chase: INKS.cream,
};

/*
 * One panel: the art clipped to it, a narration box with what the panel
 * is, the name and its number lettered along the foot, the sound effect
 * in the far corner, and the ink border.
 */
function drawPanel(ctx, q, p, border, stf) {
  const b = boxOf(q);
  const u = Math.min(b.w, b.h);
  ctx.save();
  quadPath(ctx, q);
  ctx.clip();
  if (p.kind === 'trick') {
    artTrick(ctx, b.x, b.y, b.w, b.h, p);
  } else if (p.kind === 'gap') {
    artGap(ctx, b.x, b.y, b.w, b.h, p);
  } else if (p.kind === 'skim') {
    artSkim(ctx, b.x, b.y, b.w, b.h, p);
  } else if (p.kind === 'chase') {
    artChase(ctx, b.x, b.y, b.w, b.h, p);
  } else {
    artStf(ctx, b.x, b.y, b.w, b.h, p, stf);
  }
  /* The narration box, typeset rather than lettered, as a manga sets its
   * captions, in the top left corner in from the edge's lean. */
  let fs = Math.max(9, Math.min(18, u * 0.085));
  ctx.font = `800 ${fs}px ${FONT}`;
  const label = p.label.toUpperCase();
  let lw = ctx.measureText(label).width + fs * 1.1;
  const lx = Math.max(q[0], q[6]) + fs * 0.5;
  const ly = Math.max(q[1], q[3]) + fs * 0.5;
  const avail = (Math.min(q[2], q[4]) - lx) * 0.92;
  if (lw > avail && fs * (avail / lw) >= 8) {
    fs *= avail / lw;
    lw = avail;
    ctx.font = `800 ${fs}px ${FONT}`;
  }
  /* A caption that still does not fit its panel is left off rather than
   * cut: a panel in a phone's strip is a picture and its lettered name. */
  if (lw <= avail) {
    ctx.fillStyle = PAPER;
    ctx.fillRect(lx, ly, lw, fs * 1.7);
    inkLine(ctx, Math.max(1.5, fs * 0.12));
    ctx.lineJoin = 'miter';
    ctx.strokeRect(lx, ly, lw, fs * 1.7);
    ctx.fillStyle = INK;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(label, lx + fs * 0.55, ly + fs * 0.9);
  }
  /* The name and its number, lettered along the foot, fitted. */
  if (p.kind !== 'stf') {
    const inX = Math.max(q[0], q[6]) + u * 0.06;
    const room = Math.min(q[2], q[4]) - inX - u * 0.06;
    const word = p.name.toUpperCase();
    let px = Math.max(10, Math.min(b.h * 0.15, 56));
    const fit = (s) => wordWidth(ctx, word, s) + wordWidth(ctx, p.value, s * 0.62) + s * 0.2;
    if (fit(px) > room) {
      px = Math.max(8, px * (room / fit(px)));
    }
    const base = Math.min(q[5], q[7]) - px * 0.45;
    const x1 = inX + drawWord(ctx, word, inX, base, px, FILL_OF[p.kind], { rim: true });
    drawWord(ctx, p.value, x1 + px * 0.2, base, px * 0.62, INKS.cream, { rim: true });
    const sfx = SFX_OF[p.kind] ? SFX_OF[p.kind](p) : null;
    if (sfx) {
      const cell = Math.max(12, Math.min(46, u * 0.16));
      const sx = Math.min(q[2], q[4]) - sfxWidth(sfx, cell) - u * 0.04;
      drawSfx(ctx, sfx, sx, ly + fs * 2.2, cell, INKS.cream);
    }
  }
  ctx.restore();
  quadPath(ctx, q);
  inkLine(ctx, border);
  ctx.lineJoin = 'miter';
  ctx.stroke();
}

/*
 * The page, into (0, 0, W, H) of ctx. `stf` is the painted mark or null.
 * Paper, then the panels in their slanted grid.
 */
export function drawMangaPage(ctx, W, H, panels, opts = {}) {
  const u = Math.min(W, H);
  const margin = Math.max(6, u * 0.035);
  const gutter = Math.max(5, u * 0.022);
  const border = Math.max(2, u * 0.0065);
  ctx.save();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  if (!panels.length) {
    ctx.restore();
    return;
  }
  const R = [margin, margin, W - margin, margin, W - margin, H - margin, margin, H - margin];
  const quads = gridQuads(R, panels.length, W / H);
  for (let i = 0; i < panels.length; i += 1) {
    drawPanel(ctx, insetQuad(quads[i], gutter * 0.5), panels[i], border, opts.stf || null);
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * The share card
 * ------------------------------------------------------------------ */

/*
 * The run as a share card, onto `canvas` at `w` by `h` (the card code's
 * CARD_W and CARD_H): the deep ground the card code lays under the
 * wordmark, the wordmark drawn by that code (`wordmark(ctx)`, card.js's
 * drawWordmark, at its own place and size), under it the map, the score
 * lettered and one line of what made it, and the page down the right.
 *
 * `run` is { summary, panels, mapName, stf }. The score is the counter
 * total when the summary has one and the trick total otherwise, the same
 * number the results screen puts in its hero.
 */
export function drawRunCard(canvas, w, h, run, wordmark) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const s = run.summary || {};
  ctx.fillStyle = DEEP;
  ctx.fillRect(0, 0, w, h);
  /* A dot tone down the left, the page's paper tone in ink, so the ground
   * under the score reads as the same book. */
  ctx.fillStyle = 'rgba(243, 234, 212, 0.05)';
  for (let j = 0; j * 9 < h; j += 1) {
    for (let i = 0; i * 9 < w * 0.4; i += 1) {
      ctx.beginPath();
      ctx.arc(i * 9 + (j % 2 ? 4.5 : 0), j * 9, 1.6, 0, TURN);
      ctx.fill();
    }
  }
  if (wordmark) {
    wordmark(ctx);
  }
  const left = 56;
  /* Right of the wordmark, which is 96 px type from x 52 and reaches
   * about 540: the page must not cut it. */
  const pageX = Math.round(w * 0.475);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `700 22px ${FONT}`;
  ctx.fillStyle = '#d8d2c0';
  ctx.fillText(String(run.mapName || 'Freestyle').toUpperCase(), left, 206);
  ctx.fillStyle = SAKURA;
  ctx.fillRect(left, 220, 40, 3);
  ctx.font = `700 16px ${FONT}`;
  ctx.fillStyle = INKS.slate;
  ctx.fillText('SCORE', left, 282);
  const total = formatScore(s.counter != null ? s.counter : (s.total || 0));
  const room = pageX - left - 40;
  let px = 96;
  if (wordWidth(ctx, total, px) > room) {
    px *= room / wordWidth(ctx, total, px);
  }
  const scoreBase = 300 + px * 0.84;
  drawWord(ctx, total, left, scoreBase, px, INKS.cream);
  const bits = [];
  if (s.tricks > 0) {
    bits.push(`${s.tricks} trick${s.tricks === 1 ? '' : 's'}`);
  }
  if (s.gaps > 0) {
    bits.push(`${s.gaps} gap${s.gaps === 1 ? '' : 's'}`);
  }
  const calls = closeCallCount(s.closeCalls);
  if (calls > 0) {
    bits.push(`${calls} close call${calls === 1 ? '' : 's'}`);
  }
  if (s.crashes === 0) {
    bits.push('no crashes');
  }
  /* One line of what made it, wrapped rather than run under the page. */
  ctx.font = `600 20px ${FONT}`;
  ctx.fillStyle = INKS.slate;
  ctx.textBaseline = 'alphabetic';
  let line = '';
  let ly = scoreBase + 58;
  for (const bit of bits) {
    const next = line ? `${line}  ·  ${bit}` : bit;
    if (line && ctx.measureText(next).width > room) {
      ctx.fillText(line, left, ly);
      ly += 30;
      line = bit;
    } else {
      line = next;
    }
  }
  if (line) {
    ctx.fillText(line, left, ly);
  }
  /* The page, with a hard shadow, down the right. */
  const py = 28;
  const pw = w - pageX - 28;
  const ph = h - py * 2;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(pageX + 10, py + 12, pw, ph);
  ctx.save();
  ctx.translate(pageX, py);
  ctx.beginPath();
  ctx.rect(0, 0, pw, ph);
  ctx.clip();
  drawMangaPage(ctx, pw, ph, run.panels, { stf: run.stf });
  ctx.restore();
  return canvas;
}

/* The close calls, summed, from the summary's counts by kind. */
export function closeCallCount(counts) {
  if (!counts || typeof counts !== 'object') {
    return 0;
  }
  let n = 0;
  for (const k of Object.keys(counts)) {
    n += counts[k] > 0 ? counts[k] : 0;
  }
  return n;
}
