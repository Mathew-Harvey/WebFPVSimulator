/*
 * achievementart.js: one drawing per achievement, as SVG.
 *
 * The game's toast draws these at 56 pixels, and the repack's
 * scripts/achievements.js renders the same strings to the JPEGs Steam wants
 * (an earned and an unearned icon each), so there is one set of pictures
 * and it cannot drift. In the game's furniture: a heavy ink outline, flat
 * fills, the palette's cream, sakura, amber, mint and slate, and a ring in
 * the colour of the achievement's family (the career sakura, flying mint,
 * racing amber, freestyle cream). Unearned is the same picture in slate on
 * a darker ground, the way Steam greys a locked one.
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

const INK = '#0b1116';
const CREAM = '#f3ead4';
const SAKURA = '#e8a8b8';
const AMBER = '#ffd45c';
const MINT = '#7dffb4';
const SLATE = '#9db3c8';
const DEEP = '#141c16';
const GOLD = '#ffd45c';

/* Which family an achievement belongs to, by its id. */
function familyOf(id) {
  if (id.startsWith('CAREER')) {
    return SAKURA;
  }
  if (id.startsWith('RACE')) {
    return AMBER;
  }
  if (id.startsWith('TRICK') || id.startsWith('GAP') || id.startsWith('SCORE') || id.startsWith('MAP') || id.startsWith('TOWN')) {
    return CREAM;
  }
  return MINT;
}

/* A quad from above, centred on (cx, cy), r the arm reach. */
function quad(cx, cy, r, body, rotor) {
  const a = r * 0.72;
  return `<g stroke="${INK}" stroke-width="2.5">
    <line x1="${cx - a}" y1="${cy - a}" x2="${cx + a}" y2="${cy + a}"/>
    <line x1="${cx + a}" y1="${cy - a}" x2="${cx - a}" y2="${cy + a}"/>
    <circle cx="${cx - a}" cy="${cy - a}" r="${r * 0.36}" fill="${rotor}"/>
    <circle cx="${cx + a}" cy="${cy - a}" r="${r * 0.36}" fill="${rotor}"/>
    <circle cx="${cx - a}" cy="${cy + a}" r="${r * 0.36}" fill="${rotor}"/>
    <circle cx="${cx + a}" cy="${cy + a}" r="${r * 0.36}" fill="${rotor}"/>
    <rect x="${cx - r * 0.3}" y="${cy - r * 0.3}" width="${r * 0.6}" height="${r * 0.6}" rx="2" fill="${body}"/>
  </g>`;
}

function numeral(text, fill, size = 26, y = 41) {
  return `<text x="32" y="${y}" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-weight="900" font-size="${size}" fill="${fill}" stroke="${INK}" stroke-width="2.5" paint-order="stroke">${text}</text>`;
}

function medal(cx, cy, r, fill) {
  return `<g stroke="${INK}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M${cx - r * 0.7} ${cy - r * 2.1} L${cx - r * 0.1} ${cy - r * 0.8} L${cx - r * 0.55} ${cy - r * 0.5} L${cx - r * 1.2} ${cy - r * 1.8} Z" fill="${SAKURA}"/>
    <path d="M${cx + r * 0.7} ${cy - r * 2.1} L${cx + r * 0.1} ${cy - r * 0.8} L${cx + r * 0.55} ${cy - r * 0.5} L${cx + r * 1.2} ${cy - r * 1.8} Z" fill="${SAKURA}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>
  </g>
  <path d="M${cx} ${cy - r * 0.55} l${r * 0.17} ${r * 0.37} l${r * 0.4} ${r * 0.04} l-${r * 0.31} ${r * 0.27} l${r * 0.1} ${r * 0.4} l-${r * 0.36} -${r * 0.22} l-${r * 0.36} ${r * 0.22} l${r * 0.1} -${r * 0.4} l-${r * 0.31} -${r * 0.27} l${r * 0.4} -${r * 0.04} Z" fill="${INK}" opacity="0.75"/>`;
}

/* The pictures, each drawn into the badge's middle, roughly 12 to 52. `c`
 * is the colour set: earned, or the unearned slate. */
const GLYPHS = {
  pad: (c) => `<rect x="14" y="40" width="36" height="8" rx="3" fill="${c.amber}" stroke="${INK}" stroke-width="2.5"/>
    ${quad(32, 27, 11, c.sakura, c.slate)}`,
  ch1: (c) => numeral('1', c.cream, 30, 43),
  ch2: (c) => numeral('2', c.cream, 30, 43),
  ch3: (c) => numeral('3', c.cream, 30, 43),
  ch4: (c) => numeral('4', c.cream, 30, 43),
  ch5: (c) => numeral('5', c.cream, 30, 43),
  ch6: (c) => numeral('6', c.cream, 30, 43),
  ch7: (c) => numeral('7', c.cream, 30, 43),
  ch8: (c) => numeral('8', c.cream, 30, 43),
  ch9: (c) => numeral('9', c.cream, 30, 43),
  ch10: (c) => `<path d="M18 26 L32 18 L46 26 L32 34 Z" fill="${c.amber}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M23 29 V37 Q32 43 41 37 V29" fill="${c.sakura}" stroke="${INK}" stroke-width="2.5"/>
    ${numeral('PRO', c.cream, 11, 52)}`,
  gold: (c) => medal(32, 38, 12, c.gold),
  gold10: (c) => `${medal(32, 38, 12, c.gold)}${numeral('10', c.cream, 13, 43)}`,
  goldall: (c) => `${medal(20, 40, 8, c.gold)}${medal(44, 40, 8, c.gold)}${medal(32, 36, 10, c.gold)}`,
  cap: (c) => `<path d="M12 28 L32 18 L52 28 L32 38 Z" fill="${c.sakura}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M20 32 V42 Q32 50 44 42 V32" fill="${c.slate}" stroke="${INK}" stroke-width="2.5"/>
    <path d="M48 30 V44" stroke="${c.amber}" stroke-width="3" stroke-linecap="round"/>`,
  persist: (c) => `${quad(32, 32, 13, c.sakura, c.slate)}
    <path d="M22 44 L42 20" stroke="${c.cream}" stroke-width="6" stroke-linecap="round" opacity="0.9"/>
    <path d="M22 44 L42 20" stroke="${c.amber}" stroke-width="2.5" stroke-dasharray="3 3"/>`,
  takeoff: (c) => `<rect x="16" y="46" width="32" height="6" rx="2" fill="${c.amber}" stroke="${INK}" stroke-width="2.5"/>
    ${quad(32, 32, 9, c.sakura, c.slate)}
    <path d="M32 8 V18 M27 13 L32 8 L37 13" stroke="${c.mint}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
  clock: (c) => `<circle cx="32" cy="33" r="17" fill="${c.cream}" stroke="${INK}" stroke-width="3"/>
    <path d="M32 33 V22 M32 33 L40 38" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    <rect x="28" y="11" width="8" height="5" rx="1" fill="${c.mint}" stroke="${INK}" stroke-width="2"/>`,
  clock10: (c) => `<circle cx="32" cy="33" r="17" fill="${c.mint}" stroke="${INK}" stroke-width="3"/>
    ${numeral('10', c.cream, 16, 39)}
    <rect x="28" y="11" width="8" height="5" rx="1" fill="${c.cream}" stroke="${INK}" stroke-width="2"/>`,
  speed: (c) => `<path d="M12 42 A20 20 0 0 1 52 42" fill="none" stroke="${c.slate}" stroke-width="5"/>
    <path d="M12 42 A20 20 0 0 1 44 26" fill="none" stroke="${c.mint}" stroke-width="5"/>
    <path d="M32 42 L45 25" stroke="${c.amber}" stroke-width="4" stroke-linecap="round"/>
    <circle cx="32" cy="42" r="4" fill="${c.cream}" stroke="${INK}" stroke-width="2"/>`,
  rocket: (c) => `<path d="M32 10 C42 18 42 34 38 42 H26 C22 34 22 18 32 10 Z" fill="${c.cream}" stroke="${INK}" stroke-width="2.5"/>
    <circle cx="32" cy="25" r="4" fill="${c.mint}" stroke="${INK}" stroke-width="2"/>
    <path d="M26 42 L20 50 L27 47 M38 42 L44 50 L37 47" fill="${c.sakura}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M29 45 L32 54 L35 45" fill="${c.amber}" stroke="${INK}" stroke-width="2"/>`,
  crash: (c) => `<path d="M32 10 L37 24 L52 20 L42 32 L52 44 L37 40 L32 54 L27 40 L12 44 L22 32 L12 20 L27 24 Z" fill="${c.amber}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    ${quad(32, 32, 7, c.sakura, c.slate)}`,
  props: (c) => `<g stroke="${INK}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M32 32 C26 22 20 14 26 12 C32 12 34 24 32 32 Z" fill="${c.mint}"/>
    <path d="M32 32 C42 34 52 38 50 44 C46 48 38 40 32 32 Z" fill="${c.mint}"/>
    <path d="M32 32 C24 38 16 46 14 40 C14 34 26 32 32 32 Z" fill="${c.mint}"/></g>
    <circle cx="32" cy="32" r="4.5" fill="${c.cream}" stroke="${INK}" stroke-width="2"/>`,
  turtle: (c) => `<ellipse cx="32" cy="36" rx="18" ry="12" fill="${c.mint}" stroke="${INK}" stroke-width="2.5"/>
    <path d="M22 34 H42 M27 28 L32 34 L37 28" stroke="${INK}" stroke-width="2" fill="none"/>
    <circle cx="51" cy="34" r="5" fill="${c.slate}" stroke="${INK}" stroke-width="2.5"/>
    <path d="M18 18 A16 16 0 0 1 46 16" fill="none" stroke="${c.amber}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M46 16 L40 14 M46 16 L44 22" stroke="${c.amber}" stroke-width="3.5" stroke-linecap="round"/>`,
  lap: (c) => `<path d="M20 50 V14" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
    <path d="M20 14 H46 L40 21 L46 28 H20 Z" fill="${c.amber}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M28 40 A9 9 0 1 0 37 32" fill="none" stroke="${c.mint}" stroke-width="3.5" stroke-linecap="round"/>`,
  laps: (c) => `${numeral('100', c.amber, 18, 38)}
    <path d="M14 46 A18 18 0 0 0 50 46" fill="none" stroke="${c.mint}" stroke-width="3.5" stroke-linecap="round"/>`,
  record: (c) => `<circle cx="32" cy="35" r="16" fill="${c.cream}" stroke="${INK}" stroke-width="3"/>
    <rect x="28" y="12" width="8" height="5" rx="1" fill="${c.amber}" stroke="${INK}" stroke-width="2"/>
    <path d="M32 26 l2.6 5.6 l6 .6 l-4.5 4 l1.4 6 l-5.5 -3.2 l-5.5 3.2 l1.4 -6 l-4.5 -4 l6 -.6 Z" fill="${c.amber}" stroke="${INK}" stroke-width="1.5"/>`,
  flag: (c) => `<path d="M16 52 V12" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
    <rect x="16" y="12" width="32" height="22" fill="${c.cream}" stroke="${INK}" stroke-width="2.5"/>
    <path d="M16 12 h8 v5.5 h-8 Z M32 12 h8 v5.5 h-8 Z M24 17.5 h8 v5.5 h-8 Z M40 17.5 h8 v5.5 h-8 Z M16 23 h8 v5.5 h-8 Z M32 23 h8 v5.5 h-8 Z M24 28.5 h8 v5.5 h-8 Z M40 28.5 h8 v5.5 h-8 Z" fill="${INK}"/>`,
  tour: (c) => `<circle cx="32" cy="32" r="18" fill="${c.slate}" stroke="${INK}" stroke-width="2.5"/>
    <path d="M14 32 H50 M32 14 C24 22 24 42 32 50 M32 14 C40 22 40 42 32 50" fill="none" stroke="${INK}" stroke-width="2"/>
    <circle cx="24" cy="24" r="4" fill="${c.amber}" stroke="${INK}" stroke-width="2"/>
    <circle cx="42" cy="28" r="4" fill="${c.amber}" stroke="${INK}" stroke-width="2"/>
    <circle cx="30" cy="42" r="4" fill="${c.amber}" stroke="${INK}" stroke-width="2"/>`,
  whoop: (c) => `<path d="M12 30 L32 14 L52 30 V52 H12 Z" fill="${c.slate}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <rect x="24" y="34" width="16" height="12" fill="${c.amber}" stroke="${INK}" stroke-width="2"/>
    ${quad(32, 27, 5, c.sakura, c.cream)}`,
  /* Every WebFPV room: the house, three of them. */
  house: (c) => `<path d="M12 30 L32 14 L52 30 V52 H12 Z" fill="${c.slate}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    ${numeral('3', c.amber, 24, 49)}`,
  /* Every UTT track: a whoop gate, eight of them. */
  utt: (c) => `<rect x="15" y="10" width="34" height="32" rx="3" fill="none" stroke="${INK}" stroke-width="8"/>
    <rect x="15" y="10" width="34" height="32" rx="3" fill="none" stroke="${c.amber}" stroke-width="3.5"/>
    ${numeral('8', c.cream, 20, 34)}
    ${numeral('UTT', c.mint, 12, 57)}`,
  build: (c) => `<path d="M14 50 L18 38 L42 14 L50 22 L26 46 Z" fill="${c.amber}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M14 50 L18 38 L26 46 Z" fill="${c.cream}" stroke="${INK}" stroke-width="2"/>
    <path d="M38 18 L46 26" stroke="${INK}" stroke-width="2"/>`,
  board: (c) => `<rect x="24" y="22" width="16" height="30" fill="${c.amber}" stroke="${INK}" stroke-width="2.5"/>
    <rect x="10" y="32" width="14" height="20" fill="${c.slate}" stroke="${INK}" stroke-width="2.5"/>
    <rect x="40" y="38" width="14" height="14" fill="${c.sakura}" stroke="${INK}" stroke-width="2.5"/>
    ${numeral('1', INK, 13, 36)}`,
  trick: (c) => `<path d="M16 40 A16 16 0 1 1 34 50" fill="none" stroke="${c.sakura}" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M34 50 L26 49 M34 50 L31 42" stroke="${c.sakura}" stroke-width="4.5" stroke-linecap="round"/>
    ${quad(32, 32, 7, c.cream, c.slate)}`,
  powerloop: (c) => `<rect x="14" y="40" width="36" height="12" fill="${c.slate}" stroke="${INK}" stroke-width="2.5"/>
    <path d="M18 40 C18 6 46 6 46 26 C46 40 30 40 28 36" fill="none" stroke="${c.amber}" stroke-width="4" stroke-linecap="round"/>
    <path d="M28 36 L33 33 M28 36 L33 40" stroke="${c.amber}" stroke-width="4" stroke-linecap="round"/>`,
  splits: (c) => `<path d="M16 14 C46 14 46 32 32 32 C18 32 18 50 48 50" fill="none" stroke="${c.mint}" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M48 50 L41 46 M48 50 L42 55" stroke="${c.mint}" stroke-width="4.5" stroke-linecap="round"/>`,
  matty: (c) => `<rect x="10" y="44" width="44" height="8" fill="${c.slate}" stroke="${INK}" stroke-width="2.5"/>
    <path d="M16 44 C16 12 48 12 48 44" fill="none" stroke="${c.sakura}" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M48 44 L44 37 M48 44 L52 37" stroke="${c.sakura}" stroke-width="4.5" stroke-linecap="round"/>`,
  juicy: (c) => `<path d="M14 46 L30 30 C34 26 40 26 44 30 C48 34 46 40 42 42" fill="none" stroke="${c.amber}" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M42 42 L36 40 M42 42 L44 36" stroke="${c.amber}" stroke-width="4.5" stroke-linecap="round"/>
    <circle cx="46" cy="18" r="5" fill="${c.mint}" stroke="${INK}" stroke-width="2"/>`,
  tricks: (c) => `${numeral('100', c.cream, 18, 38)}
    <path d="M14 46 A18 18 0 0 0 50 46" fill="none" stroke="${c.sakura}" stroke-width="3.5" stroke-linecap="round"/>`,
  gap: (c) => `<rect x="8" y="14" width="16" height="40" fill="${c.slate}" stroke="${INK}" stroke-width="2.5"/>
    <rect x="40" y="14" width="16" height="40" fill="${c.sakura}" stroke="${INK}" stroke-width="2.5"/>
    <path d="M32 50 V22 M26 28 L32 22 L38 28" stroke="${c.amber}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  gaps: (c) => `<rect x="8" y="14" width="12" height="40" fill="${c.slate}" stroke="${INK}" stroke-width="2.5"/>
    <rect x="44" y="14" width="12" height="40" fill="${c.sakura}" stroke="${INK}" stroke-width="2.5"/>
    ${numeral('50', c.amber, 17, 40)}`,
  score: (c) => `<path d="M32 10 L38 25 L54 26 L42 36 L46 52 L32 43 L18 52 L22 36 L10 26 L26 25 Z" fill="${c.amber}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`,
  map: (c) => `<path d="M10 18 L24 12 L40 18 L54 12 V46 L40 52 L24 46 L10 52 Z" fill="${c.cream}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M24 12 V46 M40 18 V52" stroke="${INK}" stroke-width="2"/>
    <path d="M14 40 C22 32 30 38 36 28 C40 22 46 26 50 20" fill="none" stroke="${c.sakura}" stroke-width="3" stroke-dasharray="4 3"/>`,
  town: (c) => `<rect x="10" y="26" width="14" height="26" fill="${c.slate}" stroke="${INK}" stroke-width="2.5"/>
    <rect x="24" y="16" width="16" height="36" fill="${c.cream}" stroke="${INK}" stroke-width="2.5"/>
    <rect x="40" y="30" width="14" height="22" fill="${c.sakura}" stroke="${INK}" stroke-width="2.5"/>
    <path d="M28 22 h3 M33 22 h3 M28 28 h3 M33 28 h3 M28 34 h3 M33 34 h3" stroke="${INK}" stroke-width="2.5"/>`,
};

const EARNED = {
  ink: INK, cream: CREAM, sakura: SAKURA, amber: AMBER, mint: MINT, slate: SLATE, gold: GOLD,
};
const LOCKED = {
  ink: INK, cream: '#7d8a96', sakura: '#5d6874', amber: '#8a949e', mint: '#6c7984', slate: '#4a5560', gold: '#8a949e',
};

/*
 * The whole badge for an achievement, as an SVG string on a 64 unit square.
 * `earned` false draws the unearned icon.
 */
export function achievementSvg(a, earned = true) {
  const c = earned ? EARNED : LOCKED;
  const ring = earned ? familyOf(a.id) : '#3a444e';
  const ground = earned ? DEEP : '#151a1f';
  const glyph = (GLYPHS[a.glyph] || GLYPHS.trick)(c);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect x="0" y="0" width="64" height="64" fill="${ground}"/>
  <rect x="3" y="3" width="58" height="58" rx="10" fill="none" stroke="${ring}" stroke-width="4"/>
  <rect x="1" y="1" width="62" height="62" rx="12" fill="none" stroke="${INK}" stroke-width="2"/>
  ${glyph}
</svg>`;
}

export const GLYPH_NAMES = Object.freeze(Object.keys(GLYPHS));
