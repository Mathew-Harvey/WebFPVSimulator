/*
 * pidspanel.js: what the flight controller is actually flying, drawn.
 *
 * The bars are painted from values read back OUT of the running module
 * through sim_bf_get after every init, never from the menu's own state,
 * for the same reason the Rates screen reads its numbers off the module: a
 * row that writes nothing must be visible as a row that writes nothing.
 * The rows beside this panel write settings, configs/pids.js turns the
 * settings into CLI, Betaflight applies the CLI, and this panel shows what
 * came out the other end.
 *
 * EACH GROUP HAS ITS OWN SCALE. P lives near 45, feedforward near 120, and
 * one shared axis would flatten every P bar into unreadability. Within a
 * group the three axes and the stock notch share a scale, so "pitch D is a
 * sixth above roll D" and "this is nearly double stock" both read
 * straight off the picture, which are the two comparisons a pilot
 * actually makes. Across groups the bars are not comparable, and nothing
 * here invites it: the number is printed under each group.
 *
 * The stock notch is Betaflight 4.5.1's factory value from
 * configs/pids.js STOCK_PIDS, the same on every tune, so switching tunes
 * moves the bars against a reference that stays put.
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

import { PID_AXES, PID_FIELDS, STOCK_PIDS } from '../../configs/pids.js';

/* House palette, from the :root block in index.html, as literals because a
 * canvas cannot read a CSS custom property. Same trio the rates curves
 * use, so an axis keeps its colour from one screen to the next. */
const INK = 'rgba(12, 18, 14, 0.55)';
const AXIS_LINE = 'rgba(244, 236, 214, 0.26)';
const LABEL = 'rgba(235, 230, 215, 0.62)';
const NOTCH = 'rgba(244, 236, 214, 0.75)';
const SAKURA = '#e8a8b8';
const MINT = '#7dffb4';
const SLATE = '#9db3c8';

const AXIS_COLOR = { roll: SAKURA, pitch: MINT, yaw: SLATE };
const AXIS_LABEL = { roll: 'Roll', pitch: 'Pitch', yaw: 'Yaw' };
/* Short group captions under the bars; the row notes carry the teaching. */
const GROUP_LABEL = {
  p: 'P', i: 'I', d: 'D', dmax: 'D max', f: 'FF',
};

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

/* One sentence a screen reader can read instead of the picture. */
function describe(pids) {
  const parts = PID_AXES.map((axis) => {
    const a = pids[axis];
    return `${AXIS_LABEL[axis]} P ${a.p}, I ${a.i}, D ${a.d}, D max ${a.dmax}, feedforward ${a.f}`;
  });
  return `PID values the module is flying. ${parts.join('. ')}. Stock roll is P 45, I 80, D 30, D max 40, feedforward 120.`;
}

export function mountPidsPanel() {
  const root = el('div', 'rates-panel pids-panel');

  const caption = el('div', 'pids-caption', '');
  const graphWrap = el('div', 'rates-graph-wrap pids-graph-wrap');
  const canvas = document.createElement('canvas');
  canvas.className = 'rates-graph';
  canvas.setAttribute('role', 'img');
  graphWrap.append(canvas);

  const legend = el('div', 'rates-legend');
  for (const axis of PID_AXES) {
    const key = el('span', 'rates-key');
    const dot = el('span', 'rates-key-dot');
    dot.style.background = AXIS_COLOR[axis];
    key.append(dot, el('span', 'rates-key-lab', AXIS_LABEL[axis]));
    legend.append(key);
  }

  const readout = el('dl', 'rates-readout pids-readout');
  const cells = new Map();
  for (const axis of PID_AXES) {
    const wrap = el('div', 'rates-cell');
    const dt = el('dt', null, AXIS_LABEL[axis]);
    const dd = el('dd', null, '');
    dd.style.color = AXIS_COLOR[axis];
    wrap.append(dt, dd);
    readout.append(wrap);
    cells.set(axis, dd);
  }

  root.append(caption, graphWrap, legend, readout);

  let pids = null;

  function draw() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = Math.max(200, graphWrap.clientWidth || 520);
    const cssH = Math.max(140, graphWrap.clientHeight || 220);
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const padT = 10;
    const padB = 22;
    const padS = 8;
    const gh = Math.max(20, cssH - padT - padB);
    const groupW = (cssW - padS * 2) / PID_FIELDS.length;
    const barW = Math.max(4, Math.min(16, (groupW - 18) / PID_AXES.length));

    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = AXIS_LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padS, padT + gh + 0.5);
    ctx.lineTo(cssW - padS, padT + gh + 0.5);
    ctx.stroke();

    ctx.font = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    PID_FIELDS.forEach((f, gi) => {
      const x0 = padS + gi * groupW;
      const cur = pids ? PID_AXES.map((a) => pids[a][f]) : [];
      const stock = PID_AXES.map((a) => STOCK_PIDS[a][f]);
      /* The group scale: whatever is tallest, flown or stock, with a
       * little air. The max() floor keeps a group of zeros (yaw D on
       * every stock tune) from dividing by nothing. */
      const top = Math.max(...cur, ...stock, 1) * 1.12;
      const span = PID_AXES.length * barW + (PID_AXES.length - 1) * 3;
      const bx0 = x0 + (groupW - span) / 2;
      PID_AXES.forEach((axis, ai) => {
        const x = bx0 + ai * (barW + 3);
        if (pids) {
          const bh = (pids[axis][f] / top) * gh;
          ctx.fillStyle = AXIS_COLOR[axis];
          ctx.fillRect(x, padT + gh - bh, barW, bh);
        }
        const notch = (STOCK_PIDS[axis][f] / top) * gh;
        if (STOCK_PIDS[axis][f] > 0) {
          ctx.fillStyle = NOTCH;
          ctx.fillRect(x - 1, padT + gh - notch, barW + 2, 1.5);
        }
      });
      ctx.fillStyle = LABEL;
      ctx.fillText(GROUP_LABEL[f], x0 + groupW / 2, padT + gh + 15);
    });
  }

  /*
   * Repaint from a module readback, or from nothing. `live` is the object
   * src/main.js publishes after every successful sim_init: null means the
   * module has not been read for the tune on the menu yet (a tune fetch in
   * flight), and the panel says so instead of drawing stale bars.
   */
  function paint(live, captionText) {
    pids = live && live.pids ? live.pids : null;
    caption.textContent = captionText || '';
    for (const axis of PID_AXES) {
      const dd = cells.get(axis);
      if (!pids) {
        dd.textContent = 'reading the module';
      } else {
        const a = pids[axis];
        dd.textContent = PID_FIELDS
          .map((f) => `${GROUP_LABEL[f]} ${a[f]}`)
          .join('  ');
      }
    }
    canvas.setAttribute(
      'aria-label',
      pids ? describe(pids) : 'PID values are being read from the module.',
    );
    draw();
  }

  return { root, paint };
}
