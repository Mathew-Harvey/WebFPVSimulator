/*
 * views.js: one section of the review seen two ways, your line and the
 * ghost's through it, from above and from the side.
 *
 * FROM ABOVE: the two lines over the gates as their openings seen from
 * above, the section's two gates bright, a scale bar in metres as the OSD
 * counts them. FROM THE SIDE: the same two lines at true scale, height up
 * the picture, looking across the travel through the section's first gate,
 * the openings seen edge on as upright bars. So a line that climbs over
 * a gate, or dives under the ghost's, is seen to.
 *
 * ONE FRAME. Everything here is the scene's: Y up, world metres, the frame
 * src/game/race.js scores in, a trace stores (src/review/trace.js) and a
 * ghost stores (src/game/ghost.js). Nothing is converted here.
 *
 * The geometry is pure and scripts/review-views-selftest.js drives it in
 * Node; the two draw functions take a canvas and are run by the panel
 * (src/review/panel.js) when a section is picked, never per frame.
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
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { F } from './trace.js';

/* Your line amber, the ghost's blue, the section's gates mint. */
export const VIEW_COLOURS = {
  lap: '#ffb340',
  ref: '#7fd4ff',
  gate: '#7dffb4',
  gateOther: 'rgba(200, 200, 200, 0.35)',
  dim: '#9db3c8',
  ground: '#101216',
};

/* ------------------------------------------------------------------ *
 * the inputs, made one shape: { t, x, y, z }, ms from the lap's start and
 * scene positions
 * ------------------------------------------------------------------ */

/* A trace (src/review/trace.js). */
export function lineOfTrace(trace) {
  const n = trace.count;
  const t = new Float64Array(n); const x = new Float64Array(n); const y = new Float64Array(n); const z = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    t[i] = trace.at(i, F.T);
    x[i] = trace.at(i, F.PX); y[i] = trace.at(i, F.PY); z[i] = trace.at(i, F.PZ);
  }
  return { t, x, y, z };
}

/* A ghost (src/game/ghost.js): a pose on a grid from the lap's start. */
export function lineOfGhost(ghost) {
  const n = ghost.count;
  const t = new Float64Array(n); const x = new Float64Array(n); const y = new Float64Array(n); const z = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    t[i] = (i * 1000) / ghost.rateHz;
    x[i] = ghost.pos[i * 3]; y[i] = ghost.pos[i * 3 + 1]; z[i] = ghost.pos[i * 3 + 2];
  }
  return { t, x, y, z };
}

/*
 * The stations the race scores (race.gates in src/game/race.js, already in
 * flying order), from the timing gate: a lap's splits count from there, so
 * station 0 is that gate. A station's travel axis is az = (-sin h, ., -cos h)
 * for its heading h, so h comes back as atan2(-az.x, -az.z); its opening is
 * its first aperture, whose centre stands centreY above the station.
 */
export function stationsOfRaceGates(gates) {
  const t = Math.max(0, gates.findIndex((g) => !g.virtual));
  return gates.slice(t).concat(gates.slice(0, t)).map((g) => {
    const ap = (g.apertures && g.apertures[0]) || {};
    return {
      x: g.x, y: g.y + (ap.centreY ?? 0), z: g.z,
      yaw: Math.atan2(-g.az.x, -g.az.z),
      clearW: ap.clearW ?? 2.4, clearH: ap.clearH ?? 2.4,
      virtual: Boolean(g.virtual),
    };
  });
}

/* ------------------------------------------------------------------ *
 * the geometry
 * ------------------------------------------------------------------ */

/* Scene positions [x, y, z] of a line from msA to msB, the two ends placed
 * by interpolation, so a ghost thirty times a second still reaches its
 * gates. */
export function pathOf(line, msA, msB) {
  const n = line.t.length;
  if (!n) {
    return [];
  }
  const at = (ms) => {
    let i = 0;
    while (i + 1 < n && line.t[i + 1] <= ms) {
      i += 1;
    }
    const j = Math.min(n - 1, i + 1);
    const u = line.t[j] > line.t[i] ? Math.max(0, Math.min(1, (ms - line.t[i]) / (line.t[j] - line.t[i]))) : 0;
    return [line.x[i] + (line.x[j] - line.x[i]) * u, line.y[i] + (line.y[j] - line.y[i]) * u, line.z[i] + (line.z[j] - line.z[i]) * u];
  };
  const out = [at(msA)];
  for (let i = 0; i < n; i += 1) {
    if (line.t[i] > msA && line.t[i] < msB) {
      out.push([line.x[i], line.y[i], line.z[i]]);
    }
  }
  out.push(at(msB));
  return out;
}

/* The side view's plane: the travel axis of a station, flat, with the
 * station as its origin. */
export function sideAxis(stations, k) {
  const st = stations[k];
  return { x: -Math.sin(st.yaw), z: -Math.cos(st.yaw), ox: st.x, oz: st.z };
}

/* Scene points [x, y, z] seen from the side: [distance along the axis,
 * height], scene metres. */
export function sideOf(points, axis) {
  return points.map((p) => [(p[0] - axis.ox) * axis.x + (p[2] - axis.oz) * axis.z, p[1]]);
}

/* How far to the side of the axis a scene point stands, scene metres: the
 * depth the side view looks through. */
export function lateralOf(p, axis) {
  return (p[0] - axis.ox) * axis.z - (p[2] - axis.oz) * axis.x;
}

/* The openings seen edge on from the side, those flown within 45 degrees
 * of the axis either way: where each stands along it, its bottom and top,
 * how far to the side it stands (lat) and its half width. Bays stacked one
 * above another are separate bars, which is the point of the view. */
export function sideGates(stations, axis) {
  const out = [];
  stations.forEach((st, i) => {
    if (st.virtual) {
      return;
    }
    const dot = -Math.sin(st.yaw) * axis.x + -Math.cos(st.yaw) * axis.z;
    if (Math.abs(dot) < Math.SQRT1_2) {
      return;
    }
    const [[along, y]] = sideOf([[st.x, st.y, st.z]], axis);
    const lat = lateralOf([st.x, st.y, st.z], axis);
    out.push({ i, along, lo: y - st.clearH / 2, hi: y + st.clearH / 2, lat, halfW: st.clearW / 2 });
  });
  return out;
}

/*
 * The gates the side view draws: the section's own two, and the others the
 * lines pass near. Seen from the side, a gate across the room at the same
 * distance along the travel stands in the same place as one the lines fly
 * through; drawn, it framed the picture round its height and squashed the
 * lines to a few pixels (the contributor's 15 gate track, 2026-11-20). So
 * a gate is near when it stands within one opening's width to the side of
 * the lines' own sideways reach, and within a tenth of their length along
 * the travel. `points` are the lines' scene points.
 */
export function nearSideGates(gates, points, axis, ends) {
  if (!points.length) {
    return gates.filter((q) => ends.includes(q.i));
  }
  let l0 = Infinity; let l1 = -Infinity; let u0 = Infinity; let u1 = -Infinity;
  for (const p of points) {
    const l = lateralOf(p, axis);
    const [[u]] = sideOf([p], axis);
    l0 = Math.min(l0, l); l1 = Math.max(l1, l); u0 = Math.min(u0, u); u1 = Math.max(u1, u);
  }
  const reach = Math.max(u1 - u0, 1) * 0.1;
  return gates.filter((q) => {
    if (ends.includes(q.i)) {
      return true;
    }
    const along = q.along >= u0 - reach && q.along <= u1 + reach;
    const aside = Math.max(0, l0 - q.lat, q.lat - l1) <= 2 * q.halfW;
    return along && aside;
  });
}

/*
 * Where a label goes: the first of `cands` (rects { x, y, w, h }, in
 * order of preference) that is inside `bounds`, overlaps none of `taken`
 * and covers none of `points` ([x, y] pixels, the lines), each with `pad`
 * round it. When none is free, the first inside the bounds, so a label is
 * never lost. The rect chosen is added to `taken`.
 */
export function placeLabel(cands, taken, points, bounds, pad = 2) {
  const inside = (r) => r.x >= bounds.x && r.y >= bounds.y && r.x + r.w <= bounds.x + bounds.w && r.y + r.h <= bounds.y + bounds.h;
  const hits = (r, s) => r.x - pad < s.x + s.w && s.x - pad < r.x + r.w && r.y - pad < s.y + s.h && s.y - pad < r.y + r.h;
  const covers = (r) => points.some(([x, y]) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad);
  const fits = cands.filter(inside);
  const best = fits.find((r) => !taken.some((s) => hits(r, s)) && !covers(r)) || fits[0] || cands[0];
  taken.push(best);
  return best;
}

/* Candidate rects for a label of width tw and height th beside an anchor:
 * right of it, then left, then each moved up and down a line at a time. */
export function labelCandidates(ax, ay, tw, th, gap) {
  const out = [];
  for (const dy of [0, -1, 1, -2, 2, -3, 3]) {
    const y = ay - th / 2 + dy * (th + gap);
    out.push({ x: ax + gap, y, w: tw, h: th }, { x: ax - gap - tw, y, w: tw, h: th });
  }
  return out;
}

/* A gate's name on the picture: the timing gate is the start. */
const gateName = (i) => (i === 0 ? 'start' : String(i));

/* Openings that stand at one spot from above (a stack of bays) are one
 * label, "3, 7". */
export function topSpots(stations) {
  const spots = [];
  stations.forEach((st, i) => {
    const near = spots.find((s) => Math.hypot(s.x - st.x, s.z - st.z) < 0.25 * st.clearW);
    if (near) {
      near.list.push(i);
    } else {
      spots.push({ x: st.x, z: st.z, list: [i] });
    }
  });
  return spots;
}

/* A scale bar's length in OSD metres: the first of these that is at least
 * `share` of the picture's width. lifeScale is the room's multiple of life
 * size (scene metres per OSD metre); pxPerScene the picture's scale. */
export function scaleMetres(lifeScale, pxPerScene, width, share, steps = [0.25, 0.5, 1, 2, 5, 10, 20, 50]) {
  return steps.find((m) => m * lifeScale * pxPerScene > width * share) || steps[steps.length - 1];
}

/* ------------------------------------------------------------------ *
 * the drawing
 * ------------------------------------------------------------------ */

function sizeCanvas(cv, aspect) {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const w = Math.max(200, Math.round(cv.clientWidth * dpr));
  const h = Math.round(w * aspect);
  cv.width = w;
  cv.height = h;
  return { g: cv.getContext('2d'), w, h, dpr };
}

function strokeLine(g, list, P, colour, dash, dpr) {
  if (list.length < 2) {
    return;
  }
  g.strokeStyle = colour;
  g.lineWidth = 3 * dpr;
  g.setLineDash(dash ? [8 * dpr, 6 * dpr] : []);
  g.beginPath();
  list.forEach((p, i) => {
    const q = P(p);
    if (i) {
      g.lineTo(q[0], q[1]);
    } else {
      g.moveTo(q[0], q[1]);
    }
  });
  g.stroke();
  g.setLineDash([]);
  /* Which way it went: a dot at the start. */
  const s = P(list[0]);
  g.fillStyle = colour;
  g.beginPath();
  g.arc(s[0], s[1], 4 * dpr, 0, Math.PI * 2);
  g.fill();
}

/* Every pixel a line passes through, near enough: the points and the
 * middles between them, so a label can keep off a long straight stretch
 * as well as off a sample. */
function linePixels(lists, P) {
  const out = [];
  for (const list of lists) {
    let prev = null;
    for (const p of list) {
      const q = P(p);
      if (prev) {
        const n = Math.ceil(Math.hypot(q[0] - prev[0], q[1] - prev[1]) / 6);
        for (let s = 1; s < n; s += 1) {
          out.push([prev[0] + ((q[0] - prev[0]) * s) / n, prev[1] + ((q[1] - prev[1]) * s) / n]);
        }
      }
      out.push(q);
      prev = q;
    }
  }
  return out;
}

/* Pixels along a straight bar from p to q, for a label to keep off. */
function barPixels(p, q) {
  const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 6));
  const out = [];
  for (let s = 0; s <= n; s += 1) {
    out.push([p[0] + ((q[0] - p[0]) * s) / n, p[1] + ((q[1] - p[1]) * s) / n]);
  }
  return out;
}

/* A label written where placeLabel puts it, beside the anchor (ax, ay). */
function writeLabel(g, text, ax, ay, taken, pixels, w, h, dpr) {
  const tw = g.measureText(text).width;
  const th = 12 * dpr;
  const r = placeLabel(labelCandidates(ax, ay, tw, th, 6 * dpr), taken, pixels, { x: 2 * dpr, y: 2 * dpr, w: w - 4 * dpr, h: h - 4 * dpr }, 2 * dpr);
  g.fillText(text, r.x, r.y + th - 2 * dpr);
}

function scaleBar(g, w, h, dpr, metres, len, inset) {
  /* On its own backing, so a gate standing in the strip cannot run through
   * it. */
  g.fillStyle = VIEW_COLOURS.ground;
  g.fillRect(6 * dpr, h - inset * dpr, len + 14 * dpr, (inset - 4) * dpr);
  g.strokeStyle = VIEW_COLOURS.dim;
  g.lineWidth = 2 * dpr;
  g.beginPath();
  g.moveTo(12 * dpr, h - 10 * dpr);
  g.lineTo(12 * dpr + len, h - 10 * dpr);
  g.stroke();
  g.fillStyle = VIEW_COLOURS.dim;
  g.font = `${12 * dpr}px system-ui,sans-serif`;
  g.fillText(`${metres} m`, 12 * dpr, h - 15 * dpr);
}

/*
 * The section from above.
 *   cv        a canvas, sized here from its laid out width (16:9)
 *   stations  stationsOfRaceGates
 *   ends      the section's two stations, [from, to]
 *   mine      pathOf your line through the section
 *   ref       pathOf the ghost's, or []
 *   lifeScale scene metres per OSD metre
 * Returns how many points of each line it drew.
 */
export function drawTop(cv, { stations, ends, mine, ref, lifeScale = 1 }) {
  const { g, w, h, dpr } = sizeCanvas(cv, 9 / 16);
  g.clearRect(0, 0, w, h);
  const flat = (list) => list.map((p) => [p[0], p[2]]);
  const a = flat(mine);
  const b = flat(ref);
  const pts = [...a, ...b];
  if (!pts.length) {
    return { lap: 0, ref: 0 };
  }
  let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity;
  for (const [x, z] of pts) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  const span = Math.max(x1 - x0, z1 - z0, 1);
  const pad = span * 0.15;
  x0 -= pad; x1 += pad; z0 -= pad; z1 += pad;
  /* The lines are fitted above a strip kept for the scale bar. */
  const hFit = h - 34 * dpr;
  const k = Math.min(w / (x1 - x0), hFit / (z1 - z0));
  const ox = (w - (x1 - x0) * k) / 2;
  const oz = (hFit - (z1 - z0) * k) / 2;
  const P = ([x, z]) => [ox + (x - x0) * k, oz + (z - z0) * k];

  /* The gates, as their openings seen from above: a bar across the travel
   * axis, the section's two ends bright and drawn last, over the others. */
  const lit = new Set(ends);
  const order = stations.map((_, i) => i).sort((p, q) => Number(lit.has(p)) - Number(lit.has(q)));
  const bars = [];
  for (const i of order) {
    const st = stations[i];
    const ax = Math.cos(st.yaw) * (st.clearW / 2);
    const az = -Math.sin(st.yaw) * (st.clearW / 2);
    const p = P([st.x - ax, st.z - az]);
    const q = P([st.x + ax, st.z + az]);
    bars.push(...barPixels(p, q));
    g.strokeStyle = lit.has(i) ? VIEW_COLOURS.gate : VIEW_COLOURS.gateOther;
    g.lineWidth = 4 * dpr;
    g.beginPath();
    g.moveTo(p[0], p[1]);
    g.lineTo(q[0], q[1]);
    g.stroke();
  }
  strokeLine(g, b, P, VIEW_COLOURS.ref, true, dpr);
  strokeLine(g, a, P, VIEW_COLOURS.lap, false, dpr);

  const metres = scaleMetres(lifeScale, k, w, 0.12, [0.5, 1, 2, 5, 10, 20, 50]);
  const len = metres * lifeScale * k;
  scaleBar(g, w, h, dpr, metres, len, 36);

  /* The labels last, over everything, each kept off the others, the lines,
   * the gates' bars and the scale bar, the section's own gates placed
   * first. */
  g.font = `${12 * dpr}px system-ui,sans-serif`;
  const taken = [{ x: 0, y: h - 36 * dpr, w: len + 24 * dpr, h: 36 * dpr }];
  const pixels = [...linePixels([a, b], P), ...bars];
  const spots = topSpots(stations).sort((p, q) => Number(q.list.some((i) => lit.has(i))) - Number(p.list.some((i) => lit.has(i))));
  let labels = 0;
  for (const s of spots) {
    const c = P([s.x, s.z]);
    if (c[0] < 0 || c[0] > w || c[1] < 0 || c[1] > h) {
      continue;
    }
    g.fillStyle = s.list.some((i) => lit.has(i)) ? VIEW_COLOURS.gate : VIEW_COLOURS.dim;
    writeLabel(g, s.list.map(gateName).join(', '), c[0], c[1], taken, pixels, w, h, dpr);
    labels += 1;
  }
  return { lap: a.length, ref: b.length, labels, rects: taken.slice(1) };
}

/*
 * The section from the side (sideAxis through `ends[0]`): the two lines
 * at true scale, height up, and the openings seen edge on as upright bars,
 * the section's two ends bright. Arguments as drawTop; 8:3. Returns what
 * it drew.
 */
export function drawSide(cv, { stations, ends, mine, ref, lifeScale = 1 }) {
  const { g, w, h, dpr } = sizeCanvas(cv, 3 / 8);
  g.clearRect(0, 0, w, h);
  const axis = sideAxis(stations, ends[0]);
  const a = sideOf(mine, axis);
  const b = sideOf(ref, axis);
  const pts = [...a, ...b];
  if (!pts.length) {
    return { lap: 0, ref: 0, gates: 0 };
  }
  let u0 = Infinity; let u1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  for (const [u, y] of pts) {
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  /* The gates near the lines (nearSideGates). The picture is framed on the
   * lines and the section's own two gates, whole; any other gate is drawn
   * as far as the picture reaches, so a tall stack beside the lines shows
   * as bars running off the edge and never shrinks the lines to fit. */
  const gates = nearSideGates(sideGates(stations, axis), [...mine, ...ref], axis, ends);
  for (const q of gates) {
    if (ends.includes(q.i)) {
      u0 = Math.min(u0, q.along); u1 = Math.max(u1, q.along);
      y0 = Math.min(y0, q.lo); y1 = Math.max(y1, q.hi);
    }
  }
  const span = Math.max(u1 - u0, y1 - y0, 1);
  const pad = span * 0.08;
  u0 -= pad; u1 += pad; y0 -= pad; y1 += pad;
  const hFit = h - 30 * dpr;
  const k = Math.min(w / (u1 - u0), hFit / (y1 - y0));
  const ox = (w - (u1 - u0) * k) / 2;
  const oy = (hFit - (y1 - y0) * k) / 2;
  const P = ([u, y]) => [ox + (u - u0) * k, hFit - oy - (y - y0) * k];

  const lit = new Set(ends);
  g.font = `${12 * dpr}px system-ui,sans-serif`;
  /* Openings that stand in one place from the side are one bar and one
   * label, as the view from above joins a stack. Clipped at the top of the
   * scale bar's strip, so a bar run off the frame does not cross it. */
  g.save();
  g.beginPath();
  g.rect(0, 0, w, hFit);
  g.clip();
  const spots = [];
  for (const q of gates) {
    const near = spots.find((s) => Math.abs(s.along - q.along) < 0.3 && Math.abs(s.lo - q.lo) < 0.3 && Math.abs(s.hi - q.hi) < 0.3);
    if (near) {
      near.list.push(q.i);
    } else {
      spots.push({ ...q, list: [q.i] });
    }
  }
  const bright = (s) => s.list.some((i) => lit.has(i));
  spots.sort((p, q) => Number(bright(p)) - Number(bright(q)));
  for (const s of spots) {
    const p = P([s.along, s.lo]);
    const q = P([s.along, s.hi]);
    g.strokeStyle = bright(s) ? VIEW_COLOURS.gate : VIEW_COLOURS.gateOther;
    g.lineWidth = 4 * dpr;
    g.beginPath();
    g.moveTo(p[0], p[1]);
    g.lineTo(q[0], q[1]);
    g.stroke();
  }
  g.restore();

  strokeLine(g, b, P, VIEW_COLOURS.ref, true, dpr);
  strokeLine(g, a, P, VIEW_COLOURS.lap, false, dpr);

  const metres = scaleMetres(lifeScale, k, w, 0.1);
  const len = metres * lifeScale * k;
  scaleBar(g, w, h, dpr, metres, len, 30);

  /* The labels last, the section's own first, each beside the middle of
   * the part of its bar that is in the picture, and kept off the others,
   * the lines and the scale bar. */
  const taken = [{ x: 0, y: h - 30 * dpr, w: len + 24 * dpr, h: 30 * dpr }];
  const pixels = [...linePixels([a, b], P), ...spots.flatMap((s) => barPixels(P([s.along, s.lo]), P([s.along, s.hi])))];
  let labels = 0;
  for (const s of [...spots].reverse()) {
    const top = Math.max(0, P([s.along, s.hi])[1]);
    const bottom = Math.min(hFit, P([s.along, s.lo])[1]);
    const x = P([s.along, s.lo])[0];
    if (bottom <= top || x < 0 || x > w) {
      continue;
    }
    g.fillStyle = bright(s) ? VIEW_COLOURS.gate : VIEW_COLOURS.dim;
    writeLabel(g, s.list.map(gateName).join(', '), x, (top + bottom) / 2, taken, pixels, w, h, dpr);
    labels += 1;
  }
  return { lap: a.length, ref: b.length, gates: gates.length, labels, rects: taken.slice(1) };
}
