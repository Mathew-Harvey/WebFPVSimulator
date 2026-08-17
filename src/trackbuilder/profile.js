/*
 * profile.js: the elevation chart under the results panel. Height above the
 * ground against distance along the lap.
 *
 * It is small on purpose. A course designer wants one question answered at a
 * glance, "does this track climb and dive or is it flat", and a chart with a
 * legend and a tooltip and a zoom would answer it worse. So: one line, one
 * ground reference, the extremes labelled, and the axes in metres.
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

const PAD_L = 30;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 18;

export function drawProfile(canvas, profile) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0d151e';
  ctx.fillRect(0, 0, w, h);

  const plotW = w - PAD_L - PAD_R;
  const plotH = h - PAD_T - PAD_B;
  ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = '#7f95ab';

  if (!profile || profile.points.length < 2) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Put gates in the flying order to see the elevation', w / 2, h / 2);
    ctx.restore();
    return;
  }

  /* Always include the ground in the vertical range, and never let a flat
   * track collapse to a zero height axis. */
  const lo = Math.min(0, profile.minZ);
  const hi = Math.max(profile.maxZ, lo + 1);
  const span = hi - lo;
  const sx = (s) => PAD_L + (s / Math.max(1e-6, profile.length)) * plotW;
  const sy = (z) => PAD_T + plotH - ((z - lo) / span) * plotH;

  /* Ground line. */
  ctx.strokeStyle = 'rgba(157, 179, 200, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD_L, Math.round(sy(0)) + 0.5);
  ctx.lineTo(PAD_L + plotW, Math.round(sy(0)) + 0.5);
  ctx.stroke();

  /* Filled area under the line, so a dive reads as a shape and not as a
   * squiggle. */
  ctx.beginPath();
  ctx.moveTo(sx(profile.points[0].s), sy(0));
  for (const p of profile.points) {
    ctx.lineTo(sx(p.s), sy(p.z));
  }
  ctx.lineTo(sx(profile.points[profile.points.length - 1].s), sy(0));
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 212, 92, 0.14)';
  ctx.fill();

  ctx.beginPath();
  profile.points.forEach((p, i) => {
    const x = sx(p.s);
    const y = sy(p.z);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.strokeStyle = '#ffd45c';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  /* Axis labels. Metres on both, because everything in this tool is. */
  ctx.fillStyle = '#7f95ab';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${hi.toFixed(1)}`, PAD_L - 4, sy(hi));
  ctx.fillText('0', PAD_L - 4, sy(0));
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('0 m', PAD_L, h - PAD_B + 3);
  ctx.textAlign = 'right';
  ctx.fillText(`${profile.length.toFixed(0)} m`, w - PAD_R, h - PAD_B + 3);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#9db3c8';
  ctx.fillText('height', 2, 1);

  ctx.restore();
}
