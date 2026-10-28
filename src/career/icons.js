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
  /* A licence: the card, a photo square and a stamp across its corner. */
  licence: `
    <rect x="6" y="14" width="46" height="34" rx="3" fill="#f3ead4" stroke="${INK}" stroke-width="3.5"/>
    <rect x="11" y="20" width="13" height="16" fill="#9db3c8" stroke="${INK}" stroke-width="2.5"/>
    <path d="M29 22 H46 M29 29 H44 M29 36 H40" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="46" cy="46" r="12" fill="#7dffb4" stroke="${INK}" stroke-width="3.5"/>
    <path d="M46 38 L48.4 43.4 L54 43.8 L49.7 47.4 L51 53 L46 50 L41 53 L42.3 47.4 L38 43.8 L43.6 43.4 Z" fill="${INK}"/>`,
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
  /* A ghost: the quad, and its last lap a pale step behind it. */
  ghost: `
    <g opacity="0.4" transform="translate(-6,24) scale(0.66)">${QUAD}</g>
    <path d="M24 34 C30 30 34 28 40 26" fill="none" stroke="#9db3c8" stroke-width="4" stroke-dasharray="3 5" stroke-linecap="round"/>
    <g transform="translate(22,-4) scale(0.66)">${QUAD}</g>`,
  /* Close: a wall, the quad a hand's width off it, and the rush between. */
  close: `
    <rect x="44" y="6" width="14" height="52" fill="#5a6f7f" stroke="${INK}" stroke-width="3"/>
    <path d="M44 16 H58 M44 28 H58 M44 40 H58" stroke="${INK}" stroke-width="2"/>
    <path d="M38 14 V26 M38 34 V40 M38 46 V54" stroke="#7dffb4" stroke-width="3.5" stroke-linecap="round"/>
    <g transform="translate(2,13) scale(0.6)">${QUAD}</g>`,
  /* A combo: three moves linked, and the multiplier they make. */
  combo: `
    <circle cx="13" cy="40" r="7" fill="#e8a8b8" stroke="${INK}" stroke-width="3"/>
    <circle cx="29" cy="40" r="7" fill="#ffd45c" stroke="${INK}" stroke-width="3"/>
    <circle cx="45" cy="40" r="7" fill="#7dffb4" stroke="${INK}" stroke-width="3"/>
    <path d="M20 40 H22 M36 40 H38" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
    <path d="M36 10 L50 26 M50 10 L36 26" stroke="#f3ead4" stroke-width="5" stroke-linecap="round"/>
    <path d="M53 11 H60 L55.5 17 C61.5 17 61.5 26 54.5 25.5 L52.5 24.5" fill="none" stroke="#f3ead4" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`,
};

/* The glyph for a lesson: its most telling objective. */
export function lessonGlyph(lesson) {
  if (lesson.glyph && GLYPHS[lesson.glyph]) {
    return svg(GLYPHS[lesson.glyph], `cr-glyph cr-glyph-${lesson.glyph}`);
  }
  const kinds = lesson.objectives.map((o) => o.kind);
  const pick = ['combo', 'trick', 'segmented', 'attitude', 'gap', 'close', 'gates', 'orbit', 'rings', 'face', 'land', 'hold', 'score', 'speed', 'takeoff']
    .find((k) => kinds.includes(k)) || 'takeoff';
  if (pick === 'segmented') {
    return svg(GLYPHS.trick, 'cr-glyph cr-glyph-trick');
  }
  return svg(GLYPHS[pick] || GLYPHS.takeoff, `cr-glyph cr-glyph-${pick}`);
}

export function glyphOf(kind) {
  return svg(GLYPHS[kind] || GLYPHS.takeoff, `cr-glyph cr-glyph-${kind}`);
}

/* A star, filled when earned. Three to a lesson: finishing, silver, gold. */
export function starSvg(on, fill = '#ffd45c') {
  return `<svg class="cr-icon cr-star${on ? ' is-on' : ''}" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M32 4 L40.5 22.6 L60.8 24.8 L45.6 38.4 L49.8 58.4 L32 48.2 L14.2 58.4 L18.4 38.4 L3.2 24.8 L23.5 22.6 Z"
      fill="${on ? fill : '#f7f0dc'}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  </svg>`;
}

/*
 * THE COACH, drawn for the game: nobody real, so no line the coach says
 * needs anyone's word but the owner's. Manga line art in the shell's
 * palette, flat fills and an ink line, goggles pushed up on the forehead
 * the way a pilot wears them between packs. One small inline drawing, no
 * picture to fetch.
 */
export function coachSvg() {
  return `<svg class="cr-coach-art" viewBox="0 0 120 140" aria-hidden="true">
    <path d="M14 140 C16 112 34 100 60 100 C86 100 104 112 106 140 Z" fill="#e8a8b8" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M44 100 L60 120 L76 100" fill="#f7f0dc" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M50 88 L50 102 L70 102 L70 88" fill="#f3d6c2" stroke="${INK}" stroke-width="3.5"/>
    <path d="M30 56 C30 30 44 20 60 20 C76 20 90 30 90 56 C90 80 77 94 60 94 C43 94 30 80 30 56 Z" fill="#f3d6c2" stroke="${INK}" stroke-width="4"/>
    <path d="M26 54 C22 30 36 10 60 10 C84 10 98 28 94 54 L88 40 L82 50 L76 34 L66 46 L60 30 L52 46 L44 34 L38 50 L32 40 Z" fill="#141c16" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <rect x="30" y="26" width="60" height="16" rx="8" fill="#9db3c8" stroke="${INK}" stroke-width="3.5"/>
    <rect x="37" y="29" width="20" height="10" rx="5" fill="#8fe0ff" stroke="${INK}" stroke-width="2.5"/>
    <rect x="63" y="29" width="20" height="10" rx="5" fill="#8fe0ff" stroke="${INK}" stroke-width="2.5"/>
    <path d="M42 30 L48 30" stroke="#f7f0dc" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M68 30 L74 30" stroke="#f7f0dc" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M41 58 Q46 54 51 58" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M69 58 Q74 54 79 58" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M46 72 Q60 84 74 72 Q60 78 46 72 Z" fill="#ffffff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M36 66 L42 66 M78 66 L84 66" stroke="#e8a8b8" stroke-width="3" stroke-linecap="round"/>
    <path d="M90 58 C100 58 102 72 92 74" fill="none" stroke="${INK}" stroke-width="3.5"/>
    <path d="M92 74 C86 84 76 86 70 84" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="68" cy="84" r="3.5" fill="${INK}"/>
  </svg>`;
}
