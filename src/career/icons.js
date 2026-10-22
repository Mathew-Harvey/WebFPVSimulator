/*
 * icons.js: the career's small pictures, drawn as SVG strings.
 *
 * Medals, a lock, and one glyph per kind of lesson, in the game's ink and
 * palette: a heavy dark outline, flat fills, nothing that needs a file. A
 * string so the screens can set it as innerHTML, and drawn on a 64 unit
 * square so every glyph scales the same.
 *
 * This file is part of WebFPV.
 *
 * WebFPV is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * WebFPV is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY, without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along
 * with WebFPV. If not, see <https://www.gnu.org/licenses/>.
 */

export const INK = '#0b1116';
export const MEDAL_FILL = Object.freeze({
  gold: '#ffd45c',
  silver: '#d6dee6',
  bronze: '#d08a58',
});

const svg = (body, cls = '') => `<svg class="cr-icon ${cls}" viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;

/* A medal: ribbon, disc, a star punched in it. An empty one is a socket. */
export function medalSvg(kind) {
  if (!kind) {
    return svg(`<circle cx="32" cy="38" r="18" fill="none" stroke="#9db3c8" stroke-width="3" stroke-dasharray="5 5" opacity="0.55"/>`, 'cr-medal cr-medal-none');
  }
  const fill = MEDAL_FILL[kind];
  return svg(`
    <path d="M20 4 L30 26 L24 30 L12 8 Z" fill="#e8a8b8" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M44 4 L34 26 L40 30 L52 8 Z" fill="#e8a8b8" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="32" cy="40" r="19" fill="${fill}" stroke="${INK}" stroke-width="4"/>
    <circle cx="32" cy="40" r="13" fill="none" stroke="${INK}" stroke-width="2" opacity="0.35"/>
    <path d="M32 29 L35.2 36.3 L43 37 L37 42.2 L38.9 50 L32 45.8 L25.1 50 L27 42.2 L21 37 L28.8 36.3 Z" fill="${INK}" opacity="0.8"/>
  `, `cr-medal cr-medal-${kind}`);
}

export function lockSvg() {
  return svg(`
    <rect x="14" y="28" width="36" height="28" rx="5" fill="#2a3a30" stroke="${INK}" stroke-width="4"/>
    <path d="M22 28 V20 a10 10 0 0 1 20 0 V28" fill="none" stroke="${INK}" stroke-width="6"/>
    <path d="M22 28 V20 a10 10 0 0 1 20 0 V28" fill="none" stroke="#9db3c8" stroke-width="2.5"/>
    <circle cx="32" cy="41" r="4" fill="#9db3c8"/>
  `, 'cr-lock');
}

export function checkSvg() {
  return svg(`<path d="M14 34 L27 47 L51 18" fill="none" stroke="#7dffb4" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`, 'cr-check');
}

/* The quad, top down, as the lessons draw it. */
const QUAD = `
  <g stroke="${INK}" stroke-width="3">
    <line x1="22" y1="22" x2="42" y2="42"/><line x1="42" y1="22" x2="22" y2="42"/>
    <circle cx="20" cy="20" r="7" fill="#9db3c8"/><circle cx="44" cy="20" r="7" fill="#9db3c8"/>
    <circle cx="20" cy="44" r="7" fill="#9db3c8"/><circle cx="44" cy="44" r="7" fill="#9db3c8"/>
    <rect x="27" y="27" width="10" height="10" rx="2" fill="#e8a8b8"/>
  </g>`;

const GLYPHS = {
  takeoff: `
    <rect x="12" y="50" width="40" height="6" rx="2" fill="#ffd45c" stroke="${INK}" stroke-width="3"/>
    <g transform="translate(0,-6) scale(1)">${QUAD}</g>
    <path d="M32 6 L32 18 M26 12 L32 6 L38 12" stroke="#7dffb4" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  hold: `
    <rect x="10" y="10" width="44" height="44" rx="3" fill="#ffd45c22" stroke="#ffd45c" stroke-width="3" stroke-dasharray="6 4"/>
    <g transform="translate(9.6,9.6) scale(0.7)">${QUAD}</g>`,
  face: `
    <circle cx="32" cy="32" r="22" fill="none" stroke="#9db3c8" stroke-width="3" stroke-dasharray="4 5"/>
    <path d="M32 6 L32 16 M58 32 L48 32 M32 58 L32 48 M6 32 L16 32" stroke="#ffd45c" stroke-width="4" stroke-linecap="round"/>
    <path d="M44 20 A17 17 0 0 1 50 34" fill="none" stroke="#7dffb4" stroke-width="4" stroke-linecap="round"/>
    <path d="M50 34 L45 30 M50 34 L53 28" stroke="#7dffb4" stroke-width="4" stroke-linecap="round"/>`,
  land: `
    <ellipse cx="32" cy="46" rx="24" ry="10" fill="#ffd45c33" stroke="#ffd45c" stroke-width="3"/>
    <path d="M24 42 V50 M40 42 V50 M24 46 H40" stroke="#f3ead4" stroke-width="3"/>
    <path d="M32 6 L32 24 M26 18 L32 24 L38 18" stroke="#7dffb4" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  rings: `
    <ellipse cx="18" cy="38" rx="7" ry="13" fill="none" stroke="#f3ead4" stroke-width="3.5"/>
    <ellipse cx="34" cy="30" rx="8" ry="15" fill="none" stroke="#ffd45c" stroke-width="4"/>
    <ellipse cx="50" cy="24" rx="7" ry="13" fill="none" stroke="#f3ead4" stroke-width="3.5" opacity="0.7"/>`,
  gates: `
    <path d="M10 54 V18 H34 V54" fill="none" stroke="${INK}" stroke-width="7"/>
    <path d="M10 54 V18 H34 V54" fill="none" stroke="#7dffb4" stroke-width="3.5"/>
    <path d="M38 54 V26 H56 V54" fill="none" stroke="${INK}" stroke-width="6"/>
    <path d="M38 54 V26 H56 V54" fill="none" stroke="#f3ead4" stroke-width="3"/>`,
  gap: `
    <rect x="6" y="14" width="18" height="42" fill="#5a6f7f" stroke="${INK}" stroke-width="3"/>
    <rect x="40" y="14" width="18" height="42" fill="#7a5a4f" stroke="${INK}" stroke-width="3"/>
    <path d="M32 50 L32 22 M25 29 L32 22 L39 29" stroke="#ffd45c" stroke-width="4.5" fill="none" stroke-linecap="round"/>`,
  trick: `
    <path d="M14 36 A18 18 0 1 1 30 52" fill="none" stroke="#e8a8b8" stroke-width="5" stroke-linecap="round"/>
    <path d="M30 52 L22 50 M30 52 L28 44" stroke="#e8a8b8" stroke-width="5" stroke-linecap="round"/>
    <g transform="translate(17,17) scale(0.47)">${QUAD}</g>`,
  attitude: `
    <path d="M6 44 H58" stroke="#9db3c8" stroke-width="3" stroke-dasharray="5 4"/>
    <g transform="rotate(90 32 32) translate(10,10) scale(0.68)">${QUAD}</g>`,
  level: `
    <path d="M6 44 H58" stroke="#9db3c8" stroke-width="3"/>
    <g transform="translate(10,6) scale(0.68)">${QUAD}</g>`,
  orbit: `
    <ellipse cx="32" cy="34" rx="25" ry="13" fill="none" stroke="#ffd45c" stroke-width="3.5" stroke-dasharray="7 4"/>
    <path d="M32 10 L32 50 M24 50 L40 50 M27 22 L37 22 M25 32 L39 32" stroke="#f3ead4" stroke-width="3"/>`,
  score: `
    <path d="M32 6 L39 24 L58 25 L43 37 L48 56 L32 45 L16 56 L21 37 L6 25 L25 24 Z" fill="#ffd45c" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`,
  speed: `
    <path d="M10 46 A24 24 0 0 1 54 46" fill="none" stroke="#9db3c8" stroke-width="4"/>
    <path d="M32 46 L46 24" stroke="#ffd45c" stroke-width="5" stroke-linecap="round"/>`,
};

/* The glyph for a lesson: its most telling objective. */
export function lessonGlyph(lesson) {
  if (lesson.glyph && GLYPHS[lesson.glyph]) {
    return svg(GLYPHS[lesson.glyph], `cr-glyph cr-glyph-${lesson.glyph}`);
  }
  const kinds = lesson.objectives.map((o) => o.kind);
  const pick = ['trick', 'segmented', 'attitude', 'gap', 'gates', 'orbit', 'rings', 'face', 'land', 'hold', 'score', 'speed', 'takeoff']
    .find((k) => kinds.includes(k)) || 'takeoff';
  if (pick === 'segmented') {
    return svg(GLYPHS.trick, 'cr-glyph cr-glyph-trick');
  }
  return svg(GLYPHS[pick] || GLYPHS.takeoff, `cr-glyph cr-glyph-${pick}`);
}

export function glyphOf(kind) {
  return svg(GLYPHS[kind] || GLYPHS.takeoff, `cr-glyph cr-glyph-${kind}`);
}
