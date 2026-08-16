/*
 * mini.js: a tiny expander for the public Tidal / Strudel mini-notation
 * subset this crate actually writes.
 *
 * Why this file exists instead of importing @strudel/web: Strudel is
 * AGPL-3.0. Pulling it into the sim would relicense the combined work,
 * needs a bundler this project does not have, loads sample banks this
 * licence cannot ship, and builds an unbounded Web Audio graph against
 * a 64 node budget. The notation is the public language (sequences,
 * rests, brackets, *repeat, Euclidean). The performer is ours, GPLv3,
 * pooled, measured.
 *
 * One cycle becomes one bar of 16 sixteenths, which is what music.js
 * already schedules. Events snap to that grid. A hit that cannot land
 * on a sixteenth is a composition error and throws at import.
 *
 * Supported, and nothing else:
 *   bd sd hh     sequence, equal shares of the cycle
 *   ~            rest
 *   [a b]        subdivide one share
 *   x*n          play x n times inside its share
 *   x(k,n)       Euclidean: k hits across n segments of this share
 *   x(k,n,r)     the same, rotated r steps
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

/* Same 16 as tracks.js BAR_STEPS. Duplicated so this file cannot cycle
 * import the crate it is used to write. */
const STEPS = 16;

const MAPS = {
  kick: { bd: '1', g: 'g' },
  snare: { sd: '1', g: 'g', sg: 'g', cp: '1' },
  hat: { hh: '1', ho: 'a', oh: 'a', g: 'g', hg: 'g' },
};

function parseNum(s, i) {
  const m = s.slice(i).match(/^\d+/);
  if (!m) {
    throw new Error(`mini: expected a number at ${i} in "${s}"`);
  }
  return { n: Number(m[0]), i: i + m[0].length };
}

function parseList(s, i, stop) {
  const kids = [];
  while (i < s.length) {
    while (s[i] === ' ' || s[i] === '\n' || s[i] === '\t') {
      i += 1;
    }
    if (i >= s.length || s[i] === stop) {
      break;
    }
    const one = parseExpr(s, i);
    kids.push(one.node);
    i = one.i;
  }
  if (stop && s[i] !== stop) {
    throw new Error(`mini: missing ${stop} in "${s}"`);
  }
  if (stop) {
    i += 1;
  }
  return { kids, i };
}

function parseExpr(s, i) {
  while (s[i] === ' ' || s[i] === '\n' || s[i] === '\t') {
    i += 1;
  }
  let node;
  if (s[i] === '[') {
    const list = parseList(s, i + 1, ']');
    node = { type: 'seq', kids: list.kids };
    i = list.i;
  } else if (s[i] === '~' || s[i] === '-') {
    node = { type: 'rest' };
    i += 1;
  } else if (/[A-Za-z]/.test(s[i] || '')) {
    let w = '';
    while (i < s.length && /[A-Za-z0-9]/.test(s[i])) {
      w += s[i];
      i += 1;
    }
    node = { type: 'hit', name: w };
  } else {
    throw new Error(`mini: unexpected "${s[i] || 'end'}" in "${s}"`);
  }
  for (;;) {
    if (s[i] === '*') {
      const num = parseNum(s, i + 1);
      const copies = [];
      for (let k = 0; k < num.n; k += 1) {
        copies.push(node);
      }
      node = { type: 'seq', kids: copies };
      i = num.i;
      continue;
    }
    if (s[i] === '(') {
      const a = parseNum(s, i + 1);
      if (s[a.i] !== ',') {
        throw new Error(`mini: Euclidean wants (hits,steps) in "${s}"`);
      }
      const b = parseNum(s, a.i + 1);
      let rot = 0;
      i = b.i;
      if (s[i] === ',') {
        const c = parseNum(s, i + 1);
        rot = c.n;
        i = c.i;
      }
      if (s[i] !== ')') {
        throw new Error(`mini: missing ) in "${s}"`);
      }
      i += 1;
      node = { type: 'euclid', kid: node, hits: a.n, steps: b.n, rot };
      continue;
    }
    break;
  }
  return { node, i };
}

function euclidMask(hits, steps, rot) {
  const mask = [];
  if (steps < 1) {
    throw new Error(`mini: Euclidean steps must be positive`);
  }
  for (let i = 0; i < steps; i += 1) {
    const a = Math.floor((i * hits) / steps);
    const b = Math.floor(((i - 1) * hits) / steps);
    mask.push(a !== b);
  }
  const r = ((rot % steps) + steps) % steps;
  return mask.slice(r).concat(mask.slice(0, r));
}

function walk(node, t0, dur, out) {
  if (node.type === 'rest') {
    return;
  }
  if (node.type === 'hit') {
    out.push({ t: t0, name: node.name });
    return;
  }
  if (node.type === 'seq') {
    const n = node.kids.length;
    if (n === 0) {
      return;
    }
    const slice = dur / n;
    for (let i = 0; i < n; i += 1) {
      walk(node.kids[i], t0 + slice * i, slice, out);
    }
    return;
  }
  if (node.type === 'euclid') {
    const mask = euclidMask(node.hits, node.steps, node.rot);
    const slice = dur / node.steps;
    for (let i = 0; i < node.steps; i += 1) {
      if (mask[i]) {
        walk(node.kid, t0 + slice * i, slice, out);
      }
    }
  }
}

/*
 * Expand one cycle of mini-notation into a BAR_STEPS character pattern
 * for a named voice. Throws at import if a token is unknown or a hit
 * cannot land on a sixteenth.
 */
export function mini(src, kind) {
  const map = MAPS[kind];
  if (!map) {
    throw new Error(`mini: unknown voice ${kind}`);
  }
  const text = String(src).trim();
  if (text.length === 0) {
    throw new Error(`mini: empty ${kind} pattern`);
  }
  const list = parseList(text, 0, null);
  if (list.i !== text.length) {
    throw new Error(`mini: trailing junk in "${text}"`);
  }
  const root = list.kids.length === 1
    ? list.kids[0]
    : { type: 'seq', kids: list.kids };
  const events = [];
  walk(root, 0, 1, events);
  const chars = Array(STEPS).fill('.');
  for (const e of events) {
    const scaled = e.t * STEPS;
    const step = Math.round(scaled);
    if (Math.abs(scaled - step) > 0.05) {
      throw new Error(`mini: ${kind} hit "${e.name}" at ${e.t.toFixed(4)} is off the 16th grid`);
    }
    if (step < 0 || step >= STEPS) {
      continue;
    }
    const ch = map[e.name];
    if (!ch) {
      throw new Error(`mini: ${kind} does not know "${e.name}"`);
    }
    chars[step] = ch;
  }
  return chars.join('');
}
