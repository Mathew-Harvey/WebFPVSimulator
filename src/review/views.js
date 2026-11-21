/*
 * views.js: one section of the review seen two ways, your line and the
 * ghost's through it, from above and from the side.
 *
 * FROM ABOVE: the two lines over the gates' openings seen from above, the
 * section's two gates bright, a scale bar in metres as the OSD counts them.
 * FROM THE SIDE: the same two lines at true scale, height up the picture,
 * looking across the section's own direction of travel, so a line that
 * climbs over a gate, or dives under the ghost's, is seen to.
 *
 * EVERY OPENING AS THE RACE SCORES IT. A station's opening is the
 * rectangle the race tests a pass against (Race.local in
 * src/game/race.js): centred centreY above the station, its sides along
 * the station's own across and up axes (ax, ay), which a dive gate's tilt
 * turns. Both views draw that rectangle's outline as it falls on the
 * picture: a bar where it is seen edge on, a rectangle where it is seen
 * face on or flat from above. The first cut drew every opening upright
 * from its heading alone, so a tilted gate stood where the race does not
 * score it and a line through it looked to miss (the contributor's 15 gate
 * track, 2026-11-21: "sometimes looks odd? unaligned?").
 *
 * THE SIDE VIEW LOOKS ACROSS THE SECTION, not across its first gate. Its
 * direction is the one the two lines spread furthest along over the ground,
 * pointed from the section's start to its end, so a section that leaves a
 * gate sideways is seen side on and not end on.
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

import { gateAcross, gateUp, travelAxis } from '../game/race.js';
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
 * station 0 is that gate. Each is its first opening, as Race.local tests a
 * pass: its centre centreY above the station, and the station's own axes,
 * ax across the opening, ay up it, az the way it is flown.
 */
export function stationsOfRaceGates(gates) {
  const t = Math.max(0, gates.findIndex((g) => !g.virtual));
  return gates.slice(t).concat(gates.slice(0, t)).map((g) => {
    const ap = (g.apertures && g.apertures[0]) || {};
    return {
      x: g.x, y: g.y + (ap.centreY ?? 0), z: g.z,
      ax: g.ax, ay: g.ay, az: g.az,
      clearW: ap.clearW ?? 2.4, clearH: ap.clearH ?? 2.4,
      virtual: Boolean(g.virtual),
    };
  });
}

/* A station made the way the race makes one from a heading and a tilt
 * (gateAcross, gateUp and travelAxis in src/game/race.js), with its
 * opening's centre at (x, y, z). For the selftest and the check's built
 * sections. */
export function stationOf({ x, y, z, heading = 0, pitch = 0, clearW = 2.4, clearH = 2.4, virtual = false }) {
  return { x, y, z, ax: gateAcross(heading), ay: gateUp(heading, pitch), az: travelAxis(heading, pitch), clearW, clearH, virtual };
}

/* The four corners of a station's opening, [x, y, z], in order round it. */
export function openingCorners(st) {
  const hw = st.clearW / 2;
  const hh = st.clearH / 2;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [
    st.x + st.ax.x * hw * u + st.ay.x * hh * v,
    st.y + st.ax.y * hw * u + st.ay.y * hh * v,
    st.z + st.ax.z * hw * u + st.ay.z * hh * v,
  ]);
}

/* A point in a station's own frame, as Race.local reads a pass: x across
 * the opening, y up it, z along the way it is flown, from its centre. A
 * line that goes through the opening is at z = 0 there with |x| and |y|
 * inside half the opening. */
export function localOf(st, p) {
  const dx = p[0] - st.x; const dy = p[1] - st.y; const dz = p[2] - st.z;
  return {
    x: dx * st.ax.x + dy * st.ax.y + dz * st.ax.z,
    y: dx * st.ay.x + dy * st.ay.y + dz * st.ay.z,
    z: dx * st.az.x + dy * st.az.y + dz * st.az.z,
  };
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

/*
 * When a line went through a station's opening: the first time at or after
 * `ms` (less a sample) that it crosses the opening's plane forwards, within
 * `lookMs`, or `ms` when it does not.
 *
 * WHY NOT THE SPLIT ITSELF. The race credits a gate on entering a box that
 * stands PASS_DEPTH either side of its opening (src/game/race.js: half a
 * metre, 4.5 cm on a micro track), so a lap's split is the moment the
 * craft reached the box, not the opening. A section drawn from split to
 * split stopped that far short of each gate, and on a dive or a split S
 * the lines looked to miss it (the contributor's 15 gate track,
 * 2026-11-21: "unaligned?"). The table keeps the race's splits; the views
 * draw each section from the opening to the opening.
 */
export function throughPlane(line, st, ms, lookMs = 1000) {
  const n = line.t.length;
  const z = (i) => localOf(st, [line.x[i], line.y[i], line.z[i]]).z;
  let i = 0;
  while (i + 1 < n && line.t[i + 1] <= ms) {
    i += 1;
  }
  for (; i + 1 < n && line.t[i] <= ms + lookMs; i += 1) {
    const a = z(i);
    const b = z(i + 1);
    if (a < 0 && b >= 0) {
      return line.t[i] + ((line.t[i + 1] - line.t[i]) * -a) / (b - a);
    }
  }
  return ms;
}

/*
 * The side view's plane: a direction over the ground (x, z, unit) and an
 * origin (ox, oz). The direction is the one `paths` spread furthest along,
 * the long axis of their points over the ground, pointed so the first
 * path's end lies further along it than its start: the section reads left
 * to right. Where the paths have no spread (a hover), the travel of the
 * section's first station over the ground, or across it when that station
 * is flown straight up or down.
 */
export function sideFrame(paths, station) {
  const pts = paths.flat();
  let mx = 0; let mz = 0;
  for (const p of pts) {
    mx += p[0]; mz += p[2];
  }
  const n = pts.length || 1;
  mx /= n; mz /= n;
  let sxx = 0; let sxz = 0; let szz = 0;
  for (const p of pts) {
    const dx = p[0] - mx; const dz = p[2] - mz;
    sxx += dx * dx; sxz += dx * dz; szz += dz * dz;
  }
  let x; let z;
  if (sxx + szz > 1e-6) {
    /* The long axis of the 2 by 2 spread, by its angle. */
    const a = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    x = Math.cos(a); z = Math.sin(a);
  } else {
    const flat = Math.hypot(station.az.x, station.az.z) > 0.2 ? station.az : station.ax;
    const len = Math.hypot(flat.x, flat.z) || 1;
    x = flat.x / len; z = flat.z / len;
  }
  const first = paths.find((p) => p.length >= 2);
  if (first) {
    const a = first[0]; const b = first[first.length - 1];
    if ((b[0] - a[0]) * x + (b[2] - a[2]) * z < 0) {
      x = -x; z = -z;
    }
  }
  return { x, z, ox: pts.length ? mx : station.x, oz: pts.length ? mz : station.z };
}

/* Scene points [x, y, z] seen from the side: [distance along, height],
 * scene metres. */
export function sideOf(points, frame) {
  return points.map((p) => [(p[0] - frame.ox) * frame.x + (p[2] - frame.oz) * frame.z, p[1]]);
}

/* How far into the picture a scene point stands, scene metres: the depth
 * the side view looks through. */
export function depthOf(p, frame) {
  return (p[0] - frame.ox) * frame.z - (p[2] - frame.oz) * frame.x;
}

/*
 * The openings seen from the side: each as its four corners on the
 * picture ([along, height]), and how far along and how deep its corners
 * reach. A flat dive gate comes out a level bar, an upright one seen edge
 * on an upright bar, and one seen face on a rectangle.
 */
export function sideGates(stations, frame) {
  const out = [];
  stations.forEach((st, i) => {
    if (st.virtual) {
      return;
    }
    const c = openingCorners(st);
    const quad = sideOf(c, frame);
    const d = c.map((p) => depthOf(p, frame));
    out.push({
      i, quad, w: st.clearW,
      along0: Math.min(...quad.map((q) => q[0])), along1: Math.max(...quad.map((q) => q[0])),
      lo: Math.min(...quad.map((q) => q[1])), hi: Math.max(...quad.map((q) => q[1])),
      depth0: Math.min(...d), depth1: Math.max(...d),
    });
  });
  return out;
}

/*
 * The gates the side view draws: the section's own two, and the others the
 * lines pass near. Seen from the side, a gate across the room at the same
 * distance along stands in the same place as one the lines fly through;
 * drawn, it framed the picture round its height and squashed the lines to
 * a few pixels (the contributor's 15 gate track, 2026-11-20). So a gate is
 * near when its depth comes within one opening's width of the lines' own,
 * and its reach along comes within a tenth of theirs. `points` are the
 * lines' scene points.
 */
export function nearSideGates(gates, points, frame, ends) {
  if (!points.length) {
    return gates.filter((q) => ends.includes(q.i));
  }
  let d0 = Infinity; let d1 = -Infinity; let u0 = Infinity; let u1 = -Infinity;
  for (const p of points) {
    const d = depthOf(p, frame);
    const [[u]] = sideOf([p], frame);
    d0 = Math.min(d0, d); d1 = Math.max(d1, d); u0 = Math.min(u0, u); u1 = Math.max(u1, u);
  }
  const reach = Math.max(u1 - u0, 1) * 0.1;
  return gates.filter((q) => {
    if (ends.includes(q.i)) {
      return true;
    }
    const along = q.along1 >= u0 - reach && q.along0 <= u1 + reach;
    const deep = Math.max(0, d0 - q.depth1, q.depth0 - d1) <= q.w;
    return along && deep;
  });
}

/* Openings that fall in one place on a picture are one outline and one
 * label, "3, 7": a stack of bays seen from above, or bays one behind
 * another seen from the side. `items` are { i, quad, w }, quads in scene
 * metres on the picture's two axes. */
export function joinSpots(items) {
  const spots = [];
  const centre = (q) => [q.reduce((s, p) => s + p[0], 0) / 4, q.reduce((s, p) => s + p[1], 0) / 4];
  for (const it of items) {
    const c = centre(it.quad);
    const tol = 0.15 * it.w;
    const near = spots.find((s) => {
      const sc = centre(s.quad);
      return Math.hypot(sc[0] - c[0], sc[1] - c[1]) < tol
        && s.quad.every((p, k) => Math.hypot(p[0] - it.quad[k][0], p[1] - it.quad[k][1]) < tol * 2);
    });
    if (near) {
      near.list.push(it.i);
    } else {
      spots.push({ quad: it.quad, list: [it.i] });
    }
  }
  return spots;
}

/* The openings seen from above: each as its four corners over the ground,
 * [x, z]. */
export function topGates(stations) {
  return stations.map((st, i) => ({ i, w: st.clearW, quad: openingCorners(st).map((p) => [p[0], p[2]]) }));
}

/* A scale bar's length in OSD metres: the first of these that is at least
 * `share` of the picture's width. lifeScale is the room's multiple of life
 * size (scene metres per OSD metre); pxPerScene the picture's scale. */
export function scaleMetres(lifeScale, pxPerScene, width, share, steps = [0.25, 0.5, 1, 2, 5, 10, 20, 50]) {
  return steps.find((m) => m * lifeScale * pxPerScene > width * share) || steps[steps.length - 1];
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

/*
 * An opening's outline drawn a few pixels inside its corners, so openings
 * that touch (bays stacked one on another, or two gates side by side)
 * read as separate outlines with a gap between, not one long line (the
 * contributor, 2026-11-21: "add a bit of space when stacking gates bc now
 * it look just one green line"). Each corner moves px towards the middle,
 * or a quarter of the way when it is nearer than that. An opening seen
 * edge on is a bar, and its two ends come in by px.
 */
export function shrinkQuad(quad, px) {
  const cx = quad.reduce((s, p) => s + p[0], 0) / quad.length;
  const cy = quad.reduce((s, p) => s + p[1], 0) / quad.length;
  return quad.map(([x, y]) => {
    const d = Math.hypot(cx - x, cy - y);
    if (!(d > 0)) {
      return [x, y];
    }
    const m = Math.min(px, d / 4);
    return [x + ((cx - x) * m) / d, y + ((cy - y) * m) / d];
  });
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

/* Where a label for an outline goes: the middle of the part of its
 * bounding box that is in the picture, or null when none of it is. */
export function anchorIn(quad, w, h) {
  const x0 = Math.max(0, Math.min(...quad.map((p) => p[0])));
  const x1 = Math.min(w, Math.max(...quad.map((p) => p[0])));
  const y0 = Math.max(0, Math.min(...quad.map((p) => p[1])));
  const y1 = Math.min(h, Math.max(...quad.map((p) => p[1])));
  if (x1 < x0 || y1 < y0) {
    return null;
  }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
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
 * as well as off a sample. `closed` joins the last point to the first. */
function pixelsAlong(list, closed = false) {
  const out = [];
  const pts = closed && list.length > 2 ? [...list, list[0]] : list;
  let prev = null;
  for (const q of pts) {
    if (prev) {
      const n = Math.ceil(Math.hypot(q[0] - prev[0], q[1] - prev[1]) / 6);
      for (let s = 1; s < n; s += 1) {
        out.push([prev[0] + ((q[0] - prev[0]) * s) / n, prev[1] + ((q[1] - prev[1]) * s) / n]);
      }
    }
    out.push(q);
    prev = q;
  }
  return out;
}

/* An opening's outline, in pixels, shrunk off its corners (shrinkQuad). */
function strokeOutline(g, quad, colour, dpr) {
  g.strokeStyle = colour;
  g.lineWidth = 4 * dpr;
  g.lineJoin = 'miter';
  g.beginPath();
  quad.forEach((q, k) => (k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
  g.closePath();
  g.stroke();
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

/* The two lines, the outlines and the labels, on a picture already fitted:
 * P takes a point on the picture's two scene axes to pixels. Outlines are
 * drawn clipped above the scale bar's strip; the section's own over the
 * others, and their labels first. Returns the outlines and labels drawn. */
function paint(g, { spots, lit, a, b, P, w, h, hFit, dpr, strip, len }) {
  const bright = (s) => s.list.some((i) => lit.has(i));
  const order = [...spots].sort((p, q) => Number(bright(p)) - Number(bright(q)));
  const outlines = [];
  g.save();
  g.beginPath();
  g.rect(0, 0, w, hFit);
  g.clip();
  for (const s of order) {
    const quad = shrinkQuad(s.quad.map(P), 4 * dpr);
    outlines.push({ list: s.list, quad });
    strokeOutline(g, quad, bright(s) ? VIEW_COLOURS.gate : VIEW_COLOURS.gateOther, dpr);
  }
  g.restore();

  strokeLine(g, b, P, VIEW_COLOURS.ref, true, dpr);
  strokeLine(g, a, P, VIEW_COLOURS.lap, false, dpr);

  /* The labels last, over everything, each kept off the others, the lines,
   * the outlines and the scale bar. */
  g.font = `${12 * dpr}px system-ui,sans-serif`;
  const taken = [{ x: 0, y: h - strip * dpr, w: len + 24 * dpr, h: strip * dpr }];
  const pixels = [
    ...pixelsAlong(a.map(P)), ...pixelsAlong(b.map(P)),
    ...outlines.flatMap((o) => pixelsAlong(o.quad, true)),
  ];
  let labels = 0;
  for (const o of [...outlines].reverse()) {
    const at = anchorIn(o.quad, w, hFit);
    if (!at) {
      continue;
    }
    g.fillStyle = o.list.some((i) => lit.has(i)) ? VIEW_COLOURS.gate : VIEW_COLOURS.dim;
    writeLabel(g, o.list.map((i) => (i === 0 ? 'start' : String(i))).join(', '), at[0], at[1], taken, pixels, w, h, dpr);
    labels += 1;
  }
  /* Where each line fell, in pixels, so a check can see a line is in the
   * picture even where the other is drawn over it. */
  const box = (list) => {
    const q = list.map(P);
    return q.length ? {
      x0: Math.min(...q.map((p) => p[0])), x1: Math.max(...q.map((p) => p[0])),
      y0: Math.min(...q.map((p) => p[1])), y1: Math.max(...q.map((p) => p[1])),
    } : null;
  };
  return { outlines, labels, rects: taken.slice(1), boxes: { lap: box(a), ref: box(b), w, h: hFit } };
}

/* A picture's fit: the scene box [u0, u1] by [v0, v1] padded by `share`
 * of its larger side and scaled to fill w by hFit, v up or down. */
function fit(u0, u1, v0, v1, w, hFit, share, vUp) {
  const span = Math.max(u1 - u0, v1 - v0, 1e-3);
  const pad = span * share;
  u0 -= pad; u1 += pad; v0 -= pad; v1 += pad;
  const k = Math.min(w / (u1 - u0), hFit / (v1 - v0));
  const ox = (w - (u1 - u0) * k) / 2;
  const oy = (hFit - (v1 - v0) * k) / 2;
  const P = vUp
    ? ([u, v]) => [ox + (u - u0) * k, hFit - oy - (v - v0) * k]
    : ([u, v]) => [ox + (u - u0) * k, oy + (v - v0) * k];
  return { P, k };
}

/*
 * The section from above.
 *   cv        a canvas, sized here from its laid out width (16:9)
 *   stations  stationsOfRaceGates
 *   ends      the section's two stations, [from, to]
 *   mine      pathOf your line through the section
 *   ref       pathOf the ghost's, or []
 *   lifeScale scene metres per OSD metre
 * Returns what it drew.
 */
export function drawTop(cv, { stations, ends, mine, ref, lifeScale = 1 }) {
  const { g, w, h, dpr } = sizeCanvas(cv, 9 / 16);
  g.clearRect(0, 0, w, h);
  const flat = (list) => list.map((p) => [p[0], p[2]]);
  const a = flat(mine);
  const b = flat(ref);
  const pts = [...a, ...b];
  if (!pts.length) {
    return { lap: 0, ref: 0, outlines: [], labels: 0, rects: [] };
  }
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  const hFit = h - 34 * dpr;
  const { P, k } = fit(Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs), w, hFit, 0.15, false);
  const metres = scaleMetres(lifeScale, k, w, 0.12, [0.5, 1, 2, 5, 10, 20, 50]);
  const len = metres * lifeScale * k;
  scaleBar(g, w, h, dpr, metres, len, 36);
  const spots = joinSpots(topGates(stations).filter((q) => !stations[q.i].virtual || ends.includes(q.i)));
  const drawn = paint(g, { spots, lit: new Set(ends), a, b, P, w, h, hFit, dpr, strip: 36, len });
  return { lap: a.length, ref: b.length, ...drawn };
}

/*
 * The section from the side (sideFrame): the two lines at true scale,
 * height up, and the openings near them as they fall on the picture, the
 * section's two ends bright and in the picture whole. Arguments as drawTop;
 * 8:3. Returns what it drew.
 */
export function drawSide(cv, { stations, ends, mine, ref, lifeScale = 1 }) {
  const { g, w, h, dpr } = sizeCanvas(cv, 3 / 8);
  g.clearRect(0, 0, w, h);
  const frame = sideFrame([mine, ref], stations[ends[0]]);
  const a = sideOf(mine, frame);
  const b = sideOf(ref, frame);
  const pts = [...a, ...b];
  if (!pts.length) {
    return { lap: 0, ref: 0, gates: 0, outlines: [], labels: 0, rects: [] };
  }
  const gates = nearSideGates(sideGates(stations, frame), [...mine, ...ref], frame, ends);
  /* Framed on the lines and the section's own two openings, whole; any
   * other is drawn as far as the picture reaches, so a tall stack beside
   * the lines runs off the edge and never shrinks the lines to fit. */
  const box = [...pts, ...gates.filter((q) => ends.includes(q.i)).flatMap((q) => q.quad)];
  const us = box.map((p) => p[0]);
  const vs = box.map((p) => p[1]);
  const hFit = h - 30 * dpr;
  const { P, k } = fit(Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs), w, hFit, 0.08, true);
  const metres = scaleMetres(lifeScale, k, w, 0.1);
  const len = metres * lifeScale * k;
  scaleBar(g, w, h, dpr, metres, len, 30);
  const drawn = paint(g, { spots: joinSpots(gates), lit: new Set(ends), a, b, P, w, h, hFit, dpr, strip: 30, len });
  return { lap: a.length, ref: b.length, gates: gates.length, frame, ...drawn };
}
