/*
 * gatepages.js: the front screen's pages, drawn as a manga magazine.
 *
 * The owner, 2026-10-26: "a big multi player item at the front screen ...
 * a full redesign of all the available tiles, design it like a manga
 * magazine ... more like a series of comic book scenes to select ... like
 * turning the pages of a magazine". So the gate is pages now. With rooms on
 * it opens on a cover that asks one thing, solo or with other pilots, and
 * each answer turns to a page of its own: the solo page is the five cards
 * the gate always had, the multiplayer page is hosting, finding, joining by
 * a code and the pilot the room sees. With rooms off there is no cover and
 * the solo page is the gate, as it was.
 *
 * WHAT IS HERE. The words on each panel (a kicker, a short caption, the
 * lines in its speech bubbles) and the drawings laid over its picture: the
 * quads, the speed lines, the bubbles, the stickers and the small props.
 * They are this file's own drawings, inline SVG in the product's palette
 * with the ink line the lettering and the picker wear, so the page is the
 * same furniture as the rest of the shell. src/ui/ui.js builds the cards,
 * the cursor and the keys, exactly as it did for the five cards; this only
 * says what each panel looks like.
 *
 * Each drawing is its own small SVG, placed by the panel's corner it
 * belongs to, rather than one picture over the whole panel. The panels are
 * every shape from a tall career page to a wide strip, and one picture
 * scaled to fill would crop a bubble off one and leave a quad floating in
 * the middle of another.
 *
 * COST. Static markup, built when a page is first shown and kept until the
 * page changes. Nothing animates but the page turn itself (index.html), and
 * nothing here runs while a quad is flying. The pilot's portrait on the
 * multiplayer page loads the avatar parts (about 140 KB) the first time
 * that page is opened, which is the first time a pilot opens rooms: the
 * rule the avatars already keep.
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

const INK = '#0b1116';
const PAPER = '#f7f0dc';
const CREAM = '#f3ead4';
const AMBER = '#ffd45c';
const SAKURA = '#e8a8b8';
const MINT = '#7dffb4';
const SLATE = '#9db3c8';
const BAIL = '#ff7d96';
const SKY = '#8fe0ff';
const HAND = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

/* ------------------------------------------------------------------ *
 * The pages
 * ------------------------------------------------------------------ */

/*
 * The cover's panels. Multiplayer is the wider one and wears the NEW
 * sticker, because it is the news; solo is first, because a pilot who has
 * never flown should not be asked to meet strangers before a hover.
 */
export const GATE_SIDES = [
  {
    id: 'solo',
    label: 'Fly solo',
    kicker: 'Just you',
    art: 'assets/gate/race.jpg',
    caption: 'Career, racing, freestyle and the builder.',
    action: 'gate-solo',
  },
  {
    id: 'together',
    label: 'Multiplayer',
    kicker: 'With friends',
    art: 'assets/gate/freestyle.jpg',
    caption: 'Host a room or join one. Race, chase and chat with other pilots.',
    sticker: 'NEW!',
    action: 'gate-together',
  },
  /*
   * The mini games, the owner's ask of 2026-10-29: "the dog fight category
   * to belong to a mini games mode, so we can also aggregate other mini
   * games there". The panel the dogfight had, with its picture, now opens
   * a page of its own (GATE_GAMES).
   */
  {
    id: 'games',
    label: 'Mini games',
    kicker: 'Play',
    art: 'assets/gate/dogfight.jpg',
    caption: 'Dogfights, ribbon cutting, goat herding, drift filming and motocross chasing.',
    action: 'gate-games',
  },
];

/*
 * THE MINI GAMES PAGE, one panel a game. The owner, 2026-10-29 04:51Z:
 * "Every map should be available with friends so multiplayer or single
 * player, bots should be able to be added to either". So every panel
 * plays alone or with friends, and the page's switch (ui.js, gameFriends)
 * says which: `action` is the panel's way alone, `room` its way with
 * friends. `chips` are the three words under the line, as the mockup set
 * them. A new mini game is one more entry here and its two actions.
 */
export const GATE_GAMES = [
  {
    id: 'mg-dogfight',
    label: 'Dogfight',
    kicker: 'Guns and missiles',
    art: 'assets/gate/dogfight.jpg',
    caption: 'Pop the other quads before they pop you. Any map you like.',
    chips: ['Bots', 'Friends', 'Any map'],
    action: 'gate-dogfight',
    room: 'gate-dogfight-room',
  },
  {
    id: 'mg-ribbon',
    label: 'Ribbon cutting',
    kicker: 'New!',
    art: 'assets/gate/ribbons.jpg',
    caption: 'Snip their ribbons, keep yours. Last ribbon flying wins.',
    chips: ['Bots', 'Friends', 'Any map'],
    action: 'gate-ribbon',
    room: 'gate-ribbon-room',
  },
  {
    id: 'mg-goats',
    label: 'Goat herding',
    kicker: '90%er',
    art: 'assets/gate/goats.jpg',
    caption: "Herd more goats into Heads' garage than anyone else.",
    chips: ['Bots', 'Friends', "Heads' street"],
    action: 'gate-goats',
    room: 'gate-goats-room',
  },
  {
    id: 'mg-drift',
    label: 'Drift Matsuri',
    kicker: 'Be the camera',
    art: 'assets/gate/drift.jpg',
    caption: 'Chase the drift cars and film the best shots. Best reel wins.',
    chips: ['Bots', 'Friends', 'Drift Matsuri'],
    action: 'gate-drift',
    room: 'gate-drift-room',
  },
  {
    id: 'mg-ball',
    label: 'Quad Ball',
    kicker: 'New!',
    art: 'assets/gate/ball.jpg',
    caption: 'Rocket League with quads. Push the big ball into their goal.',
    chips: ['Bots', 'Friends', 'Quad Ball arena'],
    action: 'gate-ball',
    room: 'gate-ball-room',
  },
  {
    id: 'mg-moto',
    label: 'Ridgeline MX',
    kicker: 'Chase the pack',
    art: 'assets/gate/moto.jpg',
    caption: 'Chase the dirt bikes round a motocross track and film the whips. Best reel wins.',
    chips: ['Bots', 'Friends', 'Ridgeline MX'],
    action: 'gate-moto',
    room: 'gate-moto-room',
  },
];

/*
 * The multiplayer page: how every game that hosts rooms lays it out, host
 * first, then the list of open rooms, then a code from a friend, then the
 * face the others will see. Hosting starts in the map picker, which hosts
 * the map that is double clicked (ui.js hostPick).
 */
export const GATE_ROOMS = [
  {
    id: 'mp-host',
    label: 'Host a room',
    kicker: 'Host',
    art: 'assets/gate/freestyle.jpg',
    caption: 'Pick a map, open a room, send your friends the code.',
    action: 'mp-host',
  },
  {
    id: 'mp-find',
    label: 'Find a room',
    kicker: 'Join',
    burst: 'sakura',
    caption: 'Rooms other pilots have opened to anyone.',
    action: 'mp-find',
  },
  {
    id: 'mp-code',
    label: 'Join with a code',
    kicker: 'Join',
    burst: 'amber',
    caption: "A friend's six letter code, or the link they sent.",
    action: 'mp-code',
  },
  {
    id: 'mp-pilot',
    label: 'Your pilot',
    kicker: 'You',
    burst: 'mint',
    caption: 'Your face, your name and your colours, as the room sees them.',
    action: 'mp-pilot',
  },
];

/* The solo page's panels say less than the old cards did, because a panel
 * is a picture first: a kicker, the name, and one line. */
export const SOLO_PANELS = {
  career: { kicker: 'Start here', caption: 'Never flown? One skill a lesson, a coach in your ear and medals to chase.' },
  'race-5inch': { kicker: 'Race', caption: 'Gated tracks against the clock. Every lap you finish can go on the public board.' },
  'race-whoop65': { kicker: 'Race indoors', caption: 'A tiny ducted quad through a track that fits in a living room.' },
  'freestyle-5inch': { kicker: 'No clock', caption: 'The town, the houses, Hibari Yard and every map pilots have built.' },
  builder: { kicker: 'Make', caption: 'Draw a track or a map from above, then fly it.' },
};

/* The page heads: a kicker, the title, and the folio a magazine prints. */
export const GATE_HEADS = {
  cover: { kicker: 'This week', title: 'How do you want to fly?', folio: '01' },
  solo: { kicker: 'Chapter 1', title: 'Fly solo', folio: '02' },
  together: { kicker: 'Chapter 2', title: 'Multiplayer', folio: '03' },
  games: { kicker: 'Chapter 3', title: 'Mini games', folio: '04' },
};

/* ------------------------------------------------------------------ *
 * Drawing
 * ------------------------------------------------------------------ */

/* A number in [0, 1) from a seed, so a drawing is the same every time. */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const f1 = (n) => Math.round(n * 10) / 10;

/*
 * A quad from above and a little behind, the way a manga panel shows one
 * crossing the frame: four props as blurred discs with a ring of ink, an X
 * of carbon arms, the motors, a body in the pilot's livery with its top
 * plate catching the light, the camera at the front and the antenna at the
 * back. Drawn about the origin, nose up, then turned, scaled and squashed
 * into the view. `ducted` draws a whoop's rings in place of props.
 */
function quad(x, y, s, rot, livery, { ducted = false, tilt = 0.74 } = {}) {
  const r = ducted ? 20 : 24;
  const m = ducted ? [[-24, -24], [24, -24], [-24, 24], [24, 24]] : [[-32, -30], [32, -30], [-30, 32], [30, 32]];
  const out = [];
  if (ducted) {
    out.push(`<rect x="-28" y="-28" width="56" height="56" rx="14" fill="#2a3038" stroke="${INK}" stroke-width="3"/>`);
  } else {
    for (const [mx, my] of m) {
      out.push(`<line x1="0" y1="0" x2="${mx}" y2="${my}" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>`);
      out.push(`<line x1="0" y1="0" x2="${mx}" y2="${my}" stroke="#3a414a" stroke-width="5.5" stroke-linecap="round"/>`);
    }
  }
  for (const [mx, my] of m) {
    if (ducted) {
      out.push(`<circle cx="${mx}" cy="${my}" r="${r}" fill="${livery}" stroke="${INK}" stroke-width="3"/>`);
      out.push(`<circle cx="${mx}" cy="${my}" r="${r - 6}" fill="${CREAM}" fill-opacity="0.35" stroke="${INK}" stroke-width="2"/>`);
    } else {
      out.push(`<circle cx="${mx}" cy="${my}" r="${r}" fill="${CREAM}" fill-opacity="0.3" stroke="${INK}" stroke-width="2.4"/>`);
    }
    /* The blur of the blades: two arcs, one light, one ink. */
    out.push(`<path d="M${mx - r * 0.72} ${my - r * 0.3} A${r * 0.8} ${r * 0.8} 0 0 1 ${mx + r * 0.3} ${my - r * 0.74}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity="0.85"/>`);
    out.push(`<path d="M${mx + r * 0.7} ${my + r * 0.34} A${r * 0.8} ${r * 0.8} 0 0 1 ${mx - r * 0.2} ${my + r * 0.76}" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" opacity="0.55"/>`);
    out.push(`<circle cx="${mx}" cy="${my}" r="5.5" fill="#2a2f36" stroke="${INK}" stroke-width="2.2"/>`);
  }
  out.push(`<path d="M0 22 L-7 40" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`);
  out.push(`<circle cx="-7" cy="41" r="3" fill="${livery}" stroke="${INK}" stroke-width="1.6"/>`);
  out.push(`<rect x="-14" y="-23" width="28" height="47" rx="8" fill="${livery}" stroke="${INK}" stroke-width="3"/>`);
  out.push(`<rect x="-14" y="2" width="28" height="7" fill="${INK}" opacity="0.22"/>`);
  out.push(`<rect x="-9" y="-18" width="7" height="34" rx="3" fill="#fff" opacity="0.4"/>`);
  out.push(`<rect x="-9" y="-34" width="18" height="13" rx="3.5" fill="#20252b" stroke="${INK}" stroke-width="2.4"/>`);
  out.push(`<circle cx="0" cy="-28.5" r="3.6" fill="${SKY}" stroke="${INK}" stroke-width="1.6"/>`);
  return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${s} ${f1(s * tilt * 100) / 100}) rotate(${rot})">${out.join('')}</g>`;
}

/*
 * Speed lines: thin wedges trailing a moving thing, light and ink in turn,
 * fanned across `spread` either side of the line it travelled along.
 * `ang` is the direction of travel in degrees, 0 to the right.
 */
function streaks(x, y, ang, len, n, spread, seed = 7) {
  const rand = rng(seed);
  const a = (ang * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const px = -dy;
  const py = dx;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const off = (i / Math.max(1, n - 1) - 0.5) * 2 * spread + (rand() - 0.5) * 6;
    const back = 6 + rand() * 14;
    const l = len * (0.45 + rand() * 0.55);
    const w = 1.2 + rand() * 2.2;
    const sx = x + px * off - dx * back;
    const sy = y + py * off - dy * back;
    const ex = sx - dx * l;
    const ey = sy - dy * l;
    const col = i % 3 === 1 ? INK : '#fff';
    out.push(`<path d="M${f1(sx + px * w)} ${f1(sy + py * w)} L${f1(sx - px * w)} ${f1(sy - py * w)} L${f1(ex)} ${f1(ey)} Z" fill="${col}" opacity="${col === INK ? 0.55 : 0.9}"/>`);
  }
  return out.join('');
}

/*
 * A speech bubble: an ellipse with a tail to the speaker, the outline of
 * the two merged, and the words set in the hand's heavy italic capitals.
 * `lines` is one or two lines; `tail` is where the tail points, in the
 * bubble's own coordinates.
 */
function bubble(w, h, lines, tail, { fill = PAPER, ink = INK, size = 0 } = {}) {
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2 - 4;
  const ry = h / 2 - 4;
  const [tx, ty] = tail;
  /* The tail's root: two points on the rim, either side of the line to
   * its tip. */
  const ang = Math.atan2(ty - cy, tx - cx);
  const spread = 0.24;
  const p1 = [cx + Math.cos(ang - spread) * rx * 0.86, cy + Math.sin(ang - spread) * ry * 0.86];
  const p2 = [cx + Math.cos(ang + spread) * rx * 0.86, cy + Math.sin(ang + spread) * ry * 0.86];
  const tailPath = `M${f1(p1[0])} ${f1(p1[1])} L${f1(tx)} ${f1(ty)} L${f1(p2[0])} ${f1(p2[1])} Z`;
  const px = size || Math.min(h * (lines.length > 1 ? 0.27 : 0.36), (w * 1.5) / Math.max(...lines.map((l) => l.length + 1)));
  const lead = px * 1.05;
  const top = cy - ((lines.length - 1) * lead) / 2 + px * 0.36;
  const text = lines.map((l, i) => `<text x="${f1(cx)}" y="${f1(top + i * lead)}" text-anchor="middle" font-family='${HAND}' font-weight="900" font-style="italic" font-size="${f1(px)}" fill="${ink}" letter-spacing="0.02em">${l}</text>`).join('');
  return `<path d="${tailPath}" fill="${fill}" stroke="${ink}" stroke-width="3.2" stroke-linejoin="round"/>`
    + `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${ink}" stroke-width="3.2"/>`
    + `<path d="${tailPath}" fill="${fill}"/>${text}`;
}

/* A starburst sticker with a word on it, as a magazine cover shouts. */
function burst(cx, cy, r1, r2, n, fill, word, rot = -12, seed = 3) {
  const rand = rng(seed);
  const pts = [];
  for (let i = 0; i < n * 2; i += 1) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? r2 * (0.92 + rand() * 0.14) : r1;
    pts.push(`${f1(cx + Math.cos(a) * r)},${f1(cy + Math.sin(a) * r)}`);
  }
  const px = r2 * 0.62;
  return `<g transform="rotate(${rot} ${cx} ${cy})">`
    + `<polygon points="${pts.join(' ')}" fill="${INK}" transform="translate(4 5)"/>`
    + `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>`
    + `<text x="${cx}" y="${f1(cy + px * 0.36)}" text-anchor="middle" font-family='${HAND}' font-weight="900" font-style="italic" font-size="${f1(px)}" fill="${INK}">${word}</text></g>`;
}

/* A sound effect in the lettering's manner: heavy italic capitals in
 * cream, an ink outline, a hard drop. */
function sfx(x, y, word, px, rot, fill = CREAM) {
  const t = (dx, dy, extra) => `<text x="${x + dx}" y="${y + dy}" font-family='${HAND}' font-weight="900" font-style="italic" font-size="${px}" letter-spacing="0.04em" ${extra}>${word}</text>`;
  return `<g transform="rotate(${rot} ${x} ${y})">`
    + t(px * 0.07, px * 0.09, `fill="${INK}" stroke="${INK}" stroke-width="${f1(px * 0.2)}" stroke-linejoin="round"`)
    + t(0, 0, `fill="${fill}" stroke="${INK}" stroke-width="${f1(px * 0.2)}" stroke-linejoin="round" paint-order="stroke"`)
    + '</g>';
}

/* A gold medal on a ribbon, the career's. */
function medal() {
  return `<path d="M22 4 L34 40 L46 40 L58 4 Z" fill="${SAKURA}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`
    + `<path d="M34 4 L40 22 L46 4" fill="none" stroke="${INK}" stroke-width="2.4"/>`
    + `<circle cx="40" cy="62" r="24" fill="${INK}" transform="translate(3 4)"/>`
    + `<circle cx="40" cy="62" r="24" fill="${AMBER}" stroke="${INK}" stroke-width="3.2"/>`
    + `<circle cx="40" cy="62" r="16" fill="none" stroke="${INK}" stroke-width="2" opacity="0.6"/>`
    + `<path d="M40 50 L43.5 58 L52 58.6 L45.5 64 L47.6 72.4 L40 67.8 L32.4 72.4 L34.5 64 L28 58.6 L36.5 58 Z" fill="#fff6c8" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`
    + `<path d="M24 52 A20 20 0 0 1 34 42" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.8"/>`;
}

/* A stopwatch, the race's. */
function stopwatch() {
  let ticks = '';
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const r1 = i % 3 === 0 ? 20 : 23;
    ticks += `<line x1="${f1(40 + Math.cos(a) * r1)}" y1="${f1(56 + Math.sin(a) * r1)}" x2="${f1(40 + Math.cos(a) * 26)}" y2="${f1(56 + Math.sin(a) * 26)}" stroke="${INK}" stroke-width="${i % 3 === 0 ? 3 : 1.8}"/>`;
  }
  return `<rect x="33" y="8" width="14" height="10" rx="2" fill="${SLATE}" stroke="${INK}" stroke-width="2.6"/>`
    + `<rect x="58" y="20" width="10" height="8" rx="2" fill="${SLATE}" stroke="${INK}" stroke-width="2.4" transform="rotate(40 63 24)"/>`
    + `<circle cx="40" cy="56" r="34" fill="${INK}" transform="translate(3 4)"/>`
    + `<circle cx="40" cy="56" r="34" fill="${CREAM}" stroke="${INK}" stroke-width="3.4"/>`
    + `<circle cx="40" cy="56" r="29" fill="none" stroke="${INK}" stroke-width="1.6" opacity="0.5"/>${ticks}`
    + `<path d="M40 56 L40 34" stroke="${BAIL}" stroke-width="3.6" stroke-linecap="round"/>`
    + `<path d="M40 56 L55 64" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>`
    + `<circle cx="40" cy="56" r="4" fill="${INK}"/>`;
}

/* A pencil laid over a ruler, the builder's. */
function pencil() {
  let marks = '';
  for (let i = 0; i < 11; i += 1) {
    marks += `<line x1="${12 + i * 9}" y1="56" x2="${12 + i * 9}" y2="${i % 5 === 0 ? 44 : 50}" stroke="${INK}" stroke-width="1.8"/>`;
  }
  return `<g transform="rotate(-8 60 50)"><rect x="4" y="40" width="112" height="22" rx="3" fill="${INK}" transform="translate(3 4)"/>`
    + `<rect x="4" y="40" width="112" height="22" rx="3" fill="${AMBER}" stroke="${INK}" stroke-width="3"/>${marks}</g>`
    + '<g transform="rotate(-38 60 40)">'
    + `<rect x="18" y="30" width="78" height="18" fill="${INK}" transform="translate(3 4)"/>`
    + `<rect x="18" y="30" width="72" height="18" fill="${SAKURA}" stroke="${INK}" stroke-width="3"/>`
    + `<rect x="90" y="30" width="12" height="18" fill="${SLATE}" stroke="${INK}" stroke-width="3"/>`
    + `<path d="M18 30 L0 39 L18 48 Z" fill="#f5d9b0" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`
    + `<path d="M6 36 L0 39 L6 42 Z" fill="${INK}"/>`
    + `<line x1="22" y1="36" x2="86" y2="36" stroke="#fff" stroke-width="2.4" opacity="0.6"/></g>`;
}

/* The room sign that hangs over the host's panel: two strings, a board,
 * and the words a shop door says. */
function sign(word, sub) {
  return `<path d="M30 0 L52 34 M170 0 L148 34" stroke="${INK}" stroke-width="3"/>`
    + `<circle cx="52" cy="34" r="4" fill="${INK}"/><circle cx="148" cy="34" r="4" fill="${INK}"/>`
    + '<g transform="rotate(-4 100 62)">'
    + `<rect x="16" y="32" width="168" height="66" rx="8" fill="${INK}" transform="translate(5 6)"/>`
    + `<rect x="16" y="32" width="168" height="66" rx="8" fill="${MINT}" stroke="${INK}" stroke-width="3.6"/>`
    + `<rect x="24" y="40" width="152" height="50" rx="5" fill="none" stroke="${INK}" stroke-width="1.8" stroke-dasharray="5 4"/>`
    + `<text x="100" y="71" text-anchor="middle" font-family='${HAND}' font-weight="900" font-style="italic" font-size="24" fill="${INK}" letter-spacing="0.02em">${word}</text>`
    + `<text x="100" y="86" text-anchor="middle" font-family='${HAND}' font-weight="800" font-size="10" fill="${INK}" letter-spacing="0.16em">${sub}</text></g>`;
}

/* A room's card as the Rooms shelf draws one, small: a map's picture, a
 * name, a count and a face or two. Three of them fanned make the Find
 * panel. `pic` is a picture the gate has already fetched. */
function roomCard(x, y, rot, pic, name, count, liveries, id) {
  const faces = liveries.map((c, i) => `<circle cx="${114 - i * 13}" cy="84" r="7" fill="${c}" stroke="${INK}" stroke-width="2"/>`).join('');
  return `<g transform="translate(${x} ${y}) rotate(${rot})">`
    + `<rect x="0" y="0" width="128" height="96" fill="${INK}" transform="translate(5 6)"/>`
    + `<rect x="0" y="0" width="128" height="96" fill="${PAPER}" stroke="${INK}" stroke-width="3.2"/>`
    + `<clipPath id="${id}"><rect x="4" y="4" width="120" height="52"/></clipPath>`
    + `<image href="${pic}" x="4" y="4" width="120" height="52" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`
    + `<line x1="2" y1="57" x2="126" y2="57" stroke="${INK}" stroke-width="3"/>`
    + `<rect x="86" y="9" width="34" height="16" rx="3" fill="${INK}"/>`
    + `<text x="103" y="21" text-anchor="middle" font-family='${HAND}' font-weight="900" font-size="12" fill="${MINT}">${count}</text>`
    + `${faces}<text x="9" y="74" font-family='${HAND}' font-weight="900" font-style="italic" font-size="13" fill="${INK}">${name}</text>`
    + '</g>';
}

/* The code panel's ticket: six tiles, a perforated edge, and a quad
 * going through it. */
function ticket(code) {
  const tiles = code.split('').map((c, i) => {
    const x = 26 + i * 33;
    return `<rect x="${x}" y="40" width="28" height="38" rx="4" fill="#fff" stroke="${INK}" stroke-width="2.8"/>`
      + `<text x="${x + 14}" y="69" text-anchor="middle" font-family='${HAND}' font-weight="900" font-size="26" fill="${INK}">${c}</text>`;
  }).join('');
  let holes = '';
  for (let i = 0; i < 7; i += 1) {
    holes += `<circle cx="0" cy="${16 + i * 13}" r="4" fill="${INK}"/><circle cx="246" cy="${16 + i * 13}" r="4" fill="${INK}"/>`;
  }
  return '<g transform="rotate(-6 123 60)">'
    + `<rect x="0" y="6" width="246" height="96" rx="6" fill="${INK}" transform="translate(5 6)"/>`
    + `<rect x="0" y="6" width="246" height="96" rx="6" fill="${PAPER}" stroke="${INK}" stroke-width="3.4"/>${holes}`
    + `<text x="26" y="30" font-family='${HAND}' font-weight="900" font-size="11" fill="${INK}" letter-spacing="0.2em">ROOM CODE</text>`
    + `${tiles}<line x1="18" y1="88" x2="228" y2="88" stroke="${INK}" stroke-width="1.6" stroke-dasharray="4 4"/></g>`;
}

/* A person's shape with a question on it, for a pilot who has not made a
 * face yet. */
function stranger() {
  return `<circle cx="80" cy="66" r="38" fill="${INK}" opacity="0.88"/>`
    + `<path d="M18 168 C18 120 50 104 80 104 C110 104 142 120 142 168 Z" fill="${INK}" opacity="0.88"/>`
    + `<text x="80" y="82" text-anchor="middle" font-family='${HAND}' font-weight="900" font-size="46" fill="${MINT}">?</text>`;
}

function svg(vb, body, cls) {
  return `<svg class="gp-svg ${cls || ''}" viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;
}

/*
 * Each panel's drawings: a list of { cls, svg }. The class places the
 * piece (index.html, `.gp-*`), at a share of the panel, so a piece keeps
 * its corner on a tall panel and on a wide one.
 */
/* Two ribbons streaming off two quads, the blue one snipped in two. */
function ribbons() {
  const band = (d, fill, dash = '') => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="round"/>`
    + `<path d="${d}" fill="none" stroke="${fill}" stroke-width="9" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
  return band('M60 120 C 110 70, 150 160, 200 110 S 270 60, 292 96', BAIL)
    + band('M150 30 C 175 22, 190 44, 214 40', SKY, '30 10')
    + quad(48, 124, 0.5, -60, BAIL) + quad(140, 34, 0.5, -110, SKY)
    + burst(244, 62, 22, 38, 11, AMBER, 'CUT!', -12, 5);
}

const SCENES = {
  solo: () => [
    { cls: 'gp-solo-quad', svg: svg('0 0 220 150', streaks(140, 62, -28, 120, 9, 26, 11) + quad(140, 62, 1.25, 62, SAKURA)) },
    { cls: 'gp-solo-sfx', svg: svg('0 0 200 70', sfx(14, 54, 'VWOOM!', 44, -9)) },
  ],
  together: () => [
    {
      cls: 'gp-team',
      svg: svg('0 0 260 160', streaks(76, 96, -12, 90, 6, 18, 5) + streaks(156, 56, -12, 100, 6, 18, 9) + streaks(214, 112, -12, 80, 5, 16, 13)
        + quad(76, 96, 0.82, 78, SAKURA) + quad(156, 56, 0.95, 78, AMBER) + quad(214, 112, 0.72, 78, SLATE)),
    },
    { cls: 'gp-bub-a', svg: svg('0 0 160 92', bubble(160, 76, ['RACE YOU!'], [128, 90])) },
    { cls: 'gp-bub-b', svg: svg('0 0 110 82', bubble(110, 66, ['GG!'], [24, 80])) },
    { cls: 'gp-sticker', svg: svg('0 0 120 120', burst(60, 60, 34, 54, 13, AMBER, 'NEW!', -12)) },
  ],
  /* Two quads at it, the tracer between them, and the noise it makes. */
  'mg-dogfight': () => SCENES.dogfight().filter((p) => p.cls !== 'gp-dog-sticker'),
  games: () => [
    ...SCENES.dogfight().filter((p) => p.cls !== 'gp-dog-sticker'),
    { cls: 'gp-dog-sticker', svg: svg('0 0 120 120', burst(60, 60, 34, 54, 13, MINT, 'NEW!', 10)) },
  ],
  /* Two quads, each trailing its ribbon, one of them snipped. */
  'mg-ribbon': () => [
    { cls: 'gp-ribbon', svg: svg('0 0 300 170', ribbons()) },
  ],
  dogfight: () => [
    {
      cls: 'gp-dog',
      svg: svg('0 0 240 150', streaks(64, 104, 20, 80, 6, 18, 41) + streaks(186, 46, 200, 80, 6, 18, 43)
        + `<path d="M92 92 L158 58" stroke="${AMBER}" stroke-width="4" stroke-linecap="round" stroke-dasharray="10 9"/>`
        + quad(64, 104, 0.8, 62, SAKURA) + quad(186, 46, 0.8, -118, AMBER)),
    },
    { cls: 'gp-dog-sfx', svg: svg('0 0 200 70', sfx(14, 54, 'POW!', 46, -9, AMBER)) },
    { cls: 'gp-dog-sticker', svg: svg('0 0 120 120', burst(60, 60, 34, 54, 13, MINT, 'NEW!', 10)) },
  ],
  career: () => [
    { cls: 'gp-career-bub', svg: svg('0 0 170 100', bubble(170, 80, ['START', 'HERE!'], [40, 98])) },
    { cls: 'gp-medal', svg: svg('0 0 80 92', medal()) },
  ],
  'race-5inch': () => [
    { cls: 'gp-watch', svg: svg('0 0 80 96', stopwatch()) },
  ],
  'race-whoop65': () => [
    { cls: 'gp-whoop', svg: svg('0 0 180 110', streaks(124, 52, -20, 90, 7, 14, 21) + quad(124, 52, 0.85, 70, MINT, { ducted: true })) },
  ],
  'freestyle-5inch': () => [
    { cls: 'gp-free-sfx', svg: svg('0 0 220 70', sfx(10, 54, 'WHOOSH!', 40, -7)) },
  ],
  builder: () => [
    { cls: 'gp-pencil', svg: svg('0 0 124 82', pencil()) },
    { cls: 'gp-build-bub', svg: svg('0 0 170 100', bubble(170, 80, ['MAKE YOUR', 'OWN!'], [130, 98])) },
  ],
  'mp-host': () => [
    { cls: 'gp-sign', svg: svg('0 0 200 110', sign('ROOM OPEN', 'COME IN AND FLY')) },
    {
      cls: 'gp-arrivals',
      svg: svg('0 0 260 120', `<path d="M10 100 Q70 40 120 74" fill="none" stroke="${CREAM}" stroke-width="3" stroke-dasharray="7 7" opacity="0.9"/>`
        + `<path d="M250 96 Q200 30 150 64" fill="none" stroke="${CREAM}" stroke-width="3" stroke-dasharray="7 7" opacity="0.9"/>`
        + quad(120, 74, 0.6, 40, AMBER) + quad(150, 64, 0.55, -40, SAKURA)),
    },
  ],
  'mp-find': () => [
    {
      cls: 'gp-rooms',
      svg: svg('0 0 340 190',
        roomCard(8, 50, -9, 'assets/thumbs/house.jpg', 'House party', '5/16', [SAKURA, AMBER], 'gp-rc1')
        + roomCard(196, 44, 8, 'assets/thumbs/yard.jpg', 'Yard laps', '3/16', [SLATE], 'gp-rc2')
        + roomCard(102, 12, -1, 'assets/gate/freestyle.jpg', 'Town chase', '9/16', [MINT, SAKURA, AMBER], 'gp-rc3')),
    },
  ],
  'mp-code': () => [
    { cls: 'gp-ticket', svg: svg('0 0 260 120', ticket('K7Q2FX')) },
    { cls: 'gp-code-quad', svg: svg('0 0 140 90', streaks(92, 40, -24, 80, 6, 14, 31) + quad(92, 40, 0.7, 66, SAKURA)) },
  ],
  'mp-pilot': () => [],
};

/* A pilot's quad in their livery, for the look editor's card and its
 * livery tiles: the same drawing the front screen's panels fly. */
export function quadMark(livery, rot = 24) {
  return svg('0 0 120 104', streaks(60, 52, -90 + rot, 40, 5, 22, 17) + quad(60, 52, 0.92, rot, livery), 'gp-quadmark');
}

/* The drawings for one panel, as elements ready to append. */
export function sceneFor(id, doc = document) {
  const make = SCENES[id];
  if (!make) {
    return [];
  }
  return make().map((p) => {
    const box = doc.createElement('div');
    box.className = `gp-piece ${p.cls}`;
    box.innerHTML = p.svg;
    return box;
  });
}

/* ------------------------------------------------------------------ *
 * The pilot on the multiplayer page
 * ------------------------------------------------------------------ */

const STORE_KEY = 'webfpv.together.v1';

function storedAvatar() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    return raw && raw.avatar ? raw.avatar : null;
  } catch (e) {
    return null;
  }
}

/*
 * The pilot's own portrait into `box`: their bust as the room will see it,
 * or a stranger's shape asking who they are when they have not made one.
 * Called when the page is built and again when the look editor closes.
 */
export function paintGatePilot(box, name) {
  if (!box) {
    return;
  }
  const av = storedAvatar();
  if (!av) {
    box.innerHTML = `<div class="gp-portrait is-new">${svg('0 0 160 168', stranger(), 'gp-stranger')}</div>`
      + `<div class="gp-piece gp-pilot-bub">${svg('0 0 170 100', bubble(170, 80, ['WHO ARE', 'YOU?'], [30, 98]))}</div>`;
    return;
  }
  box.innerHTML = '<div class="gp-portrait"></div>';
  if (name) {
    const plate = box.ownerDocument.createElement('span');
    plate.className = 'gp-plate';
    plate.textContent = name;
    box.append(plate);
  }
  const at = box.querySelector('.gp-portrait');
  import('../net/avatar.js').then(({ avatarCanvas, liveryCss, liveryInk }) => {
    if (!at.isConnected) {
      return;
    }
    box.style.setProperty('--gp-livery', liveryCss(av, 0));
    box.style.setProperty('--gp-livery-ink', liveryInk(av, 0));
    at.replaceChildren(avatarCanvas(av, { expr: 'hello', size: 220 }));
  }).catch(() => {});
}
