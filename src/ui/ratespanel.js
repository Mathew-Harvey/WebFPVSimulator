/*
 * ratespanel.js: the stick-to-rate curve, drawn.
 *
 * WHAT THIS IS NOT ANY MORE. It used to be a Configurator Rateprofile
 * table: five columns, three axes, a rates-type dropdown, and every cell
 * writing a CLI key straight into a Betaflight dump. That belonged to the
 * flight-controller screen, and the flight-controller screen is gone. A
 * pilot who wants to hand-edit a rateprofile has Betaflight for it.
 *
 * What is left is the part that was always doing the teaching: a picture of
 * what the sticks do. It reads the pilot's four rate knobs out of Settings
 * (configs/rates.js owns them) and previews Betaflight's own ACTUAL curve
 * through src/fc/ratescurve.js, which is a transcription of fc/rc.c. It
 * writes nothing. The rows beside it write the settings, the settings become
 * CLI in configs/rates.js, and Betaflight flies it.
 *
 * The live dots are the real sticks, fed from the frame loop, so moving a
 * stick on this screen moves the dot along the curve it is about to fly.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this software. If not, see <https://www.gnu.org/licenses/>.
 */

import { hoverStickPercent, normaliseRates } from '../../configs/rates.js';
import { ANGLE_RATE_SAMPLES, angleRateDeg } from '../fc/ratescurve.js';

/* House palette, from the :root block in index.html. Kept as literals
 * because a canvas cannot read a CSS custom property. */
const INK = 'rgba(12, 18, 14, 0.55)';
const GRID = 'rgba(244, 236, 214, 0.10)';
const AXIS = 'rgba(244, 236, 214, 0.26)';
const LABEL = 'rgba(235, 230, 215, 0.62)';
const SAKURA = '#e8a8b8';
const SLATE = '#9db3c8';
const AMBER = '#ffd45c';

/* Where the readout takes its samples. A quarter and a half are where a
 * pilot actually lives; the stop is what the number on the row claims. */
const SAMPLE_STICKS = [0.25, 0.5, 1];

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

/*
 * The two curves this screen draws, in the CLI units src/fc/ratescurve.js
 * expects: rc_rate and srate are TENS of deg/s, expo is hundredths. The
 * menu holds deg/s and whole expo, so the divide is the boundary.
 *
 * Roll and pitch share a curve because the menu gives them one Max rate.
 * Yaw has its own, because it always did: a quad yaws slower than it rolls.
 */
export function ratesCurves(settings) {
  const r = normaliseRates(settings || {});
  const shared = { expo: r.rateExpo, rcRate: r.rateCentre / 10 };
  return [
    { id: 'rollpitch', label: 'Roll, pitch', color: SAKURA, axis: { ...shared, srate: r.rateMax / 10 } },
    { id: 'yaw', label: 'Yaw', color: SLATE, dash: [5, 4], axis: { ...shared, srate: r.rateYawMax / 10 } },
  ];
}

function degAt(curve, stick) {
  return angleRateDeg('ACTUAL', curve.axis, stick);
}

/* One sentence a screen reader can read instead of the picture. */
function describe(curves) {
  const parts = curves.map((c) => {
    const at = SAMPLE_STICKS.map((s) => `${Math.round(degAt(c, s))} at ${s === 1 ? 'the stop' : `${s * 100} percent`}`);
    return `${c.label}: ${at.join(', ')} degrees per second`;
  });
  return `Stick to rate curve. ${parts.join('. ')}.`;
}

export function mountRatesPanel() {
  const root = el('div', 'rates-panel');

  const graphWrap = el('div', 'rates-graph-wrap');
  const canvas = document.createElement('canvas');
  canvas.className = 'rates-graph';
  canvas.setAttribute('role', 'img');
  graphWrap.append(canvas);

  const legend = el('div', 'rates-legend');
  const swatches = new Map();
  for (const c of ratesCurves(null)) {
    const key = el('span', 'rates-key');
    /* A dot for a solid curve, a dashed rule for the dashed one, so the key
     * matches what is actually on the canvas. */
    const dot = el('span', c.dash ? 'rates-key-dot rates-key-dash' : 'rates-key-dot');
    dot.style.background = c.color;
    const lab = el('span', 'rates-key-lab', c.label);
    const val = el('span', 'rates-key-val', '');
    key.append(dot, lab, val);
    legend.append(key);
    swatches.set(c.id, val);
  }

  /*
   * The same curve as numbers, at the three places a thumb actually sits.
   *
   * Roll and yaw are separate spans in the curves' own colours rather than
   * one "66 / 44" string, because a slash does not say which half is which
   * and the legend two lines up already taught the colours.
   */
  const readout = el('dl', 'rates-readout');
  const cells = [];
  for (const s of SAMPLE_STICKS) {
    const wrap = el('div', 'rates-cell');
    wrap.append(el('dt', null, s === 1 ? 'Full stick' : `${s * 100}% stick`));
    const dd = el('dd', null, '');
    const rp = el('span', 'rates-num rates-num-rp', '');
    const sep = el('span', 'rates-num-sep', ' / ');
    const yaw = el('span', 'rates-num rates-num-yaw', '');
    const unit = el('span', 'rates-num-unit', ' deg/s');
    dd.append(rp, sep, yaw, unit);
    wrap.append(dd);
    readout.append(wrap);
    cells.push({ stick: s, rp, sep, yaw });
  }
  const hoverWrap = el('div', 'rates-cell');
  hoverWrap.append(el('dt', null, 'Hover sits at'));
  const hoverDd = el('dd', null, '');
  hoverWrap.append(hoverDd);
  readout.append(hoverWrap);

  root.append(graphWrap, legend, readout);

  let curves = ratesCurves(null);
  let stick = { roll: 0, pitch: 0, yaw: 0 };

  function draw() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = Math.max(200, graphWrap.clientWidth || 520);
    const cssH = Math.max(150, graphWrap.clientHeight || 240);
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

    /* The vertical scale is the fastest curve, rounded up to a round
     * hundred, so the drawing does not rescale by a pixel every time a
     * knob moves one step. */
    const peak = Math.max(...curves.map((c) => degAt(c, 1)), 100);
    const maxY = Math.ceil(peak / 100) * 100;

    const padL = 44;
    const padR = 52;
    const padT = 14;
    const padB = 26;
    const gw = Math.max(20, cssW - padL - padR);
    const gh = Math.max(20, cssH - padT - padB);
    const x0 = padL + gw / 2;
    const y0 = padT + gh / 2;
    const xOf = (s) => x0 + s * (gw / 2);
    const yOf = (deg) => y0 - (deg / maxY) * (gh / 2);

    ctx.fillStyle = INK;
    ctx.fillRect(padL, padT, gw, gh);

    /* Quarter-stick gridlines, both sides. A pilot reads the curve against
     * where their thumb is, not against a number on an axis. */
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const s of [-0.75, -0.5, -0.25, 0.25, 0.5, 0.75]) {
      const x = Math.round(xOf(s)) + 0.5;
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + gh);
    }
    for (const frac of [-0.5, 0.5]) {
      const y = Math.round(y0 - frac * (gh / 2)) + 0.5;
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + gw, y);
    }
    ctx.stroke();

    ctx.strokeStyle = AXIS;
    ctx.beginPath();
    ctx.moveTo(padL, Math.round(y0) + 0.5);
    ctx.lineTo(padL + gw, Math.round(y0) + 0.5);
    ctx.moveTo(Math.round(x0) + 0.5, padT);
    ctx.lineTo(Math.round(x0) + 0.5, padT + gh);
    ctx.stroke();

    /*
     * Yaw is DASHED and drawn LAST, on top of roll and pitch.
     *
     * On the Betaflight defaults the two curves are the same curve, and two
     * solid lines on the same pixels is one line in whichever colour was
     * painted last: the screen claimed a sakura roll curve and drew a slate
     * yaw one over it. Dashes on top is the fix that works in both cases.
     * Where the curves coincide the slate dashes sit in the sakura line and
     * you can see that both are there; where they part, both read whole.
     */
    for (const c of curves) {
      ctx.beginPath();
      ctx.setLineDash(c.dash || []);
      ctx.strokeStyle = c.color;
      ctx.lineWidth = 2;
      for (let i = 0; i <= ANGLE_RATE_SAMPLES; i += 1) {
        const s = -1 + (2 * i) / ANGLE_RATE_SAMPLES;
        const x = xOf(s);
        const y = yOf(degAt(c, s));
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.font = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = LABEL;
    ctx.textAlign = 'right';
    ctx.fillText(`${maxY}`, padL - 6, yOf(maxY));
    ctx.fillText('0', padL - 6, y0);
    ctx.fillText(`-${maxY}`, padL - 6, yOf(-maxY));
    ctx.textAlign = 'center';
    ctx.fillText('centre', x0, padT + gh + 12);
    ctx.fillText('left', padL + 16, padT + gh + 12);
    ctx.fillText('right', padL + gw - 16, padT + gh + 12);

    /* Each curve's own maximum, on its own line, in its own colour. Equal
     * maxima would stack two strings on one baseline, so a label that lands
     * on top of one already placed is pushed clear of it. */
    ctx.textAlign = 'left';
    const placed = [];
    for (const c of curves) {
      const deg = degAt(c, 1);
      let y = yOf(deg);
      while (placed.some((p) => Math.abs(p - y) < 12)) {
        y += 12;
      }
      placed.push(y);
      ctx.fillStyle = c.color;
      ctx.fillText(`${Math.round(deg)}`, padL + gw + 6, y);
    }

    /* The live sticks. Roll and pitch share a curve, so they share its
     * colour and the two dots ride the same line. */
    const dots = [
      { s: stick.roll, curve: curves[0] },
      { s: stick.pitch, curve: curves[0] },
      { s: stick.yaw, curve: curves[1] },
    ];
    for (const d of dots) {
      if (!Number.isFinite(d.s)) {
        continue;
      }
      const s = Math.max(-1, Math.min(1, d.s));
      ctx.fillStyle = AMBER;
      ctx.beginPath();
      ctx.arc(xOf(s), yOf(degAt(d.curve, s)), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function paint(settings, next) {
    curves = ratesCurves(settings);
    if (next) {
      stick = next;
    }
    const r = normaliseRates(settings || {});
    for (const c of curves) {
      const val = swatches.get(c.id);
      if (val) {
        val.textContent = `${Math.round(degAt(c, 1))} deg/s`;
      }
    }
    for (const cell of cells) {
      const rp = Math.round(degAt(curves[0], cell.stick));
      const yaw = Math.round(degAt(curves[1], cell.stick));
      const split = rp !== yaw;
      cell.rp.textContent = String(rp);
      cell.yaw.textContent = split ? String(yaw) : '';
      cell.sep.hidden = !split;
      cell.yaw.hidden = !split;
    }
    hoverDd.textContent = `${hoverStickPercent(r.throttleCap).toFixed(1)}% stick`;
    canvas.setAttribute('aria-label', describe(curves));
    draw();
  }

  /* Called from the frame loop, and only while this screen is up: the caller
   * owns that check. Redraws the curve, nothing else, because rebuilding the
   * readout sixty times a second to write the same string is work the pilot
   * cannot see. */
  function paintStick(next) {
    if (next) {
      stick = next;
    }
    draw();
  }

  return { root, paint, paintStick };
}
