/*
 * picker.js: the map picker, the one screen a pilot chooses where to fly
 * from, in the simulator and on the board's maps and tracks page alike.
 *
 * ONE COPY. This file is the picker. The board does not have a picker of
 * its own: `node scripts/vendor.js ../WebFPVSimulator` in the board's
 * repository copies this file byte for byte into its public/sim/picker/,
 * records its SHA-256, and the board's `npm test` fails on a copy that does
 * not match. A change the board needs here is made here and copied again,
 * which is how the lettering already travels. So the two pages cannot show
 * two different pickers: they show this one, fed by two hosts.
 *
 * WHAT IT IS, the owner's pick of 19 October 2026: first direction B,
 * "Select screen", and then, the same morning, mockup A of the second
 * round, "Magazine page", because "most people will spend time scrolling
 * maps, however the map scroller is tiny compared to the currently
 * selected map" and the picker "should feel like a manga magazine, like
 * the hero in the landing page, like the story so far". So it is a page of
 * paper and ink: the shelf's title lettered in the simulator's hand over a
 * chapter kicker, the three shelves (Maps, 5 inch tracks, Whoop tracks) as
 * chapter panels with a picture each, the official entries in a big tier,
 * the ones pilots made in a grid of leaning panels under a ruled cut, and
 * a caption strip held at the foot of the window with the chosen entry's
 * name, facts and buttons. There is no big hero panel any more: browsing
 * is most of the page. "Official" is whatever the board has marked
 * official, plus the worlds the simulator ships, which are official by
 * being shipped.
 *
 * WHAT IT IS NOT. It fetches nothing and knows no addresses but the ones it
 * is handed. A host (src/ui/ui.js in the simulator, public/app.js on the
 * board) turns its own lists into entries with entriesFrom, says which
 * buttons an entry gets, and does what a button says. That is the seam that
 * lets one picker serve a page that flies and a page that links.
 *
 * THE PICTURE is the board's thumbnail: a frame of the real layout in the
 * renderer the game flies, drawn by the publishing browser at Publish
 * (src/share/orbit.js, THUMB_SHOT), 960 by 540 with no wordmark. An entry
 * published before thumbnails existed falls back to its share card, and
 * one with neither gets a halftone panel with its initial, never a broken
 * image. Only the caption's picture loads eagerly; the panels' load as
 * they scroll in, so a shelf of seventy costs what the visible ten cost.
 *
 * LATENCY. None in flight: nothing here runs while a pilot is flying, the
 * pictures are files made at publish rather than worlds built at choosing,
 * and there is no WebGL or timer in the file. The names are lettered on 2D
 * canvases by src/ui/lettering.js (copied beside this file on the board, so
 * the one relative import holds in both), each panel once, when it first
 * scrolls into view, and kept: typing in the find box re-sorts the panels
 * already built rather than lettering them again.
 *
 * KEYS, for a host that forwards them (handleKey): the arrows walk the
 * panels as they lie on the page, Q and E (or Page Up and Page Down) change
 * shelf, Enter presses the caption's first button, and a double click on a
 * panel flies it. Escape is the host's, because going back is the host's business
 * and the simulator has one rule for it on every screen.
 *
 * ZONES, for a host whose Up and Down already mean something (nav): the
 * simulator's menus walk rows with Up and Down, and a radio has nothing
 * else. So there the picker is three zones of its own, the shelves, the
 * panels and the caption's buttons. Left and Right move within a zone; Up
 * and Down move a row of panels at a time, leave the top row for the
 * shelves and the bottom row for the buttons, and Down off the buttons
 * hands the cursor back to the host's rows.
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

import { paintTitle, INKS } from '../ui/lettering.js';

/* The three shelves, in the order the rail lists them. `title` is the
 * page's lettered heading and `tab` the chapter panel's, as runs in the
 * lettering's inks; `ink` is what an official entry's name is lettered in. */
export const PICKER_SHELVES = [
  {
    id: 'maps', label: 'Maps', note: 'Freestyle: no gates, no clock', word: 'maps', ink: 'sakura',
    title: [['Freestyle ', 'cream'], ['maps', 'sakura']], tab: [['Maps', 'sakura']],
  },
  {
    id: 'five', label: '5 inch tracks', note: 'Race tracks on the sixty metre field', word: 'tracks', ink: 'mint',
    title: [['Five inch ', 'mint'], ['tracks', 'cream']], tab: [['Five inch', 'mint']],
  },
  {
    id: 'whoop', label: 'Whoop tracks', note: '65 mm whoop rooms', word: 'tracks', ink: 'cream',
    title: [['Whoop ', 'cream'], ['tracks', 'sakura']], tab: [['Whoop', 'cream']],
  },
];

/* The orders a shelf can be put in. Most flown means times posted, which
 * a map has none of, so the maps shelf offers the other two. */
export const PICKER_ORDERS = [
  { id: 'rated', label: 'Top rated' },
  { id: 'newest', label: 'Newest' },
  { id: 'flown', label: 'Most flown', tracksOnly: true },
];

function trimOrigin(origin) {
  return String(origin || '').replace(/\/+$/, '');
}

/* A board picture's address, with its stamp so a replaced one is a new URL
 * the board lets a browser keep for good. */
function pictureUrl(board, route, id, slot, utc) {
  const stamp = utc ? `?v=${encodeURIComponent(utc)}` : '';
  return `${trimOrigin(board)}/api/${route}/${encodeURIComponent(id)}/${slot}${stamp}`;
}

function ratingOf(raw) {
  const count = raw && Number.isInteger(raw.count) && raw.count > 0 ? raw.count : 0;
  if (!count || !Number.isFinite(raw.avg)) {
    return { count: 0, avg: null, score: null };
  }
  return { count, avg: raw.avg, score: Number.isFinite(raw.score) ? raw.score : raw.avg };
}

/*
 * The board's lists, and the host's own worlds, as entries.
 *
 *   tracks   the board's /api/tracks list, as it sends it
 *   maps     the board's /api/maps list
 *   worlds   [{ id, name, note, thumb, kind: 'world' }], the shipped worlds,
 *            each with its thumbnail's address as the host can reach it
 *   board    the board's origin, which the pictures are fetched from
 *
 * Every entry carries the item it came from as `item`, so a host's button
 * gets back exactly what it gave.
 */
export function entriesFrom({
  tracks = [], maps = [], worlds = [], board = '',
} = {}) {
  const out = [];
  for (const w of worlds) {
    out.push({
      key: `world:${w.id}`,
      kind: 'world',
      id: w.id,
      shelf: 'maps',
      name: w.name,
      author: '',
      note: w.note || '',
      official: true,
      rating: ratingOf(w.rating),
      best: null,
      times: 0,
      when: '',
      thumb: w.thumb || '',
      fallback: '',
      facts: w.facts || ['Ships with the simulator'],
      item: w,
    });
  }
  for (const m of maps) {
    if (!m || !m.id) {
      continue;
    }
    out.push({
      key: `map:${m.id}`,
      kind: 'map',
      id: m.id,
      shelf: 'maps',
      name: m.name || 'Untitled map',
      author: m.author || '',
      note: '',
      official: Boolean(m.official),
      rating: ratingOf(m.rating),
      best: null,
      times: 0,
      when: m.publishedUtc || '',
      thumb: m.hasThumb ? pictureUrl(m.board || board, 'maps', m.id, 'thumb', m.thumbUtc) : '',
      fallback: m.hasCard ? pictureUrl(m.board || board, 'maps', m.id, 'card', m.cardUtc) : '',
      facts: [
        m.pieces ? `${m.pieces} piece${m.pieces === 1 ? '' : 's'}` : '',
        m.gaps ? `${m.gaps} gap${m.gaps === 1 ? '' : 's'}` : '',
      ].filter(Boolean),
      item: m,
    });
  }
  for (const t of tracks) {
    if (!t || !t.id) {
      continue;
    }
    const room = t.trackClass === 'micro';
    const best = t.best && (room ? Number.isFinite(t.best.threeMs) : Number.isFinite(t.best.lapMs))
      ? { ms: room ? t.best.threeMs : t.best.lapMs, name: t.best.name || '', three: room }
      : null;
    out.push({
      key: `track:${t.id}`,
      kind: 'track',
      id: t.id,
      shelf: room ? 'whoop' : 'five',
      name: t.name || 'Untitled track',
      author: t.author || '',
      designer: t.designer || '',
      series: t.series || '',
      note: '',
      official: Boolean(t.official),
      rating: ratingOf(t.rating),
      best,
      times: Number(t.times) || 0,
      when: t.publishedUtc || '',
      thumb: t.hasThumb ? pictureUrl(t.board || board, 'tracks', t.id, 'thumb', t.thumbUtc) : '',
      fallback: t.hasCard ? pictureUrl(t.board || board, 'tracks', t.id, 'card', t.cardUtc) : '',
      facts: [
        t.gates ? `${t.gates} gate${t.gates === 1 ? '' : 's'}` : '',
        t.designer ? `Designed by ${t.designer}${t.series ? ` for ${t.series}` : ''}` : '',
      ].filter(Boolean),
      item: t,
    });
  }
  return out;
}

function byScore(a, b) {
  const sa = a.rating.score != null ? a.rating.score : -1;
  const sb = b.rating.score != null ? b.rating.score : -1;
  return sb - sa || b.rating.count - a.rating.count;
}

function byNewest(a, b) {
  return String(b.when).localeCompare(String(a.when));
}

/*
 * One shelf's entries, split and ordered: { official, pilots }. Official
 * first is the owner's rule, so the order chosen applies inside each half
 * and never lifts a pilot's entry over an official one. The worlds the
 * simulator ships keep the order the host gave them, at the head of the
 * official half, because they are the places a new pilot should see first.
 */
export function sortShelf(entries, shelf, order = 'rated', needle = '') {
  const want = String(needle || '').trim().toLowerCase();
  const on = entries.filter((e) => e.shelf === shelf && (!want
    || e.name.toLowerCase().includes(want)
    || e.author.toLowerCase().includes(want)
    || String(e.designer || '').toLowerCase().includes(want)));
  const cmp = order === 'newest'
    ? (a, b) => byNewest(a, b) || byScore(a, b)
    : order === 'flown'
      ? (a, b) => b.times - a.times || byScore(a, b)
      : (a, b) => byScore(a, b) || byNewest(a, b);
  const worlds = on.filter((e) => e.kind === 'world');
  const official = on.filter((e) => e.official && e.kind !== 'world').sort(cmp);
  /* A host's pinned entries, the simulator's own tracks in this browser,
   * lead the pilots' half in the order given: the one just built is the
   * one its builder came here to fly. */
  const pinned = on.filter((e) => !e.official && e.pin);
  const pilots = on.filter((e) => !e.official && !e.pin).sort(cmp);
  return { official: [...worlds, ...official], pilots: [...pinned, ...pilots] };
}

/* A lap as the board prints one: 41.38 or 1:03.40. */
export function formatLap(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '';
  }
  const cs = Math.round(ms / 10);
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  const two = (n) => String(n).padStart(2, '0');
  return m ? `${m}:${two(s)}.${two(c)}` : `${s}.${two(c)}`;
}

function starsOf(rating) {
  if (!rating || !rating.count) {
    return '';
  }
  const n = Math.max(0, Math.min(5, Math.round(rating.avg)));
  return `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;
}


/* A name in at most two lines of about `per` characters, broken between
 * words where the two come out nearest even, because a lettered name is
 * shrunk to fit its panel and a long one shrunk onto one line is unreadable.
 * Anything still too long is cut, and the whole name is the button's label. */
function nameLines(name, per) {
  const n = String(name || '').trim();
  if (n.length <= per) {
    return [n];
  }
  const words = n.split(/\s+/);
  let best = [n];
  let worst = Infinity;
  for (let k = 1; k < words.length; k += 1) {
    const a = words.slice(0, k).join(' ');
    const b = words.slice(k).join(' ');
    const w = Math.max(a.length, b.length);
    if (w < worst) {
      worst = w;
      best = [a, b];
    }
  }
  return best.map((line) => (line.length > per + 6 ? `${line.slice(0, per + 4).trim()}...` : line));
}

/*
 * THE LOOK, inline: a manga page. Paper and ink, the simulator's ink
 * (INK) and paper (PAPER) from lettering.js, leaning panels with a hard
 * offset shadow, a ring of sakura and still focus lines round the chosen
 * one, and the palette's accents for what they always mean: amber for the
 * button that flies, mint for a record and a world, sakura for official.
 * The page is opaque paper on either host's dark ground, the way the
 * landing page's hero and the story book sit. Injected once per document,
 * as a <style>, because the board's rule is that a page's styles must not
 * depend on a server's MIME table.
 *
 * A panel's frame is skewed and its contents skewed back, so the gutters
 * lean and the world in the picture stays upright. The focus lines are two
 * repeating conic gradients masked to the panel's edge, still, because a
 * field of stripes that moves on its own is a photosensitivity question
 * (the landing page's rule for its own focus lines). The caption is sticky
 * to the foot of whatever scrolls the page, so the page scrolls and not a
 * box inside it, which is the simulator's rule for its rooms;
 * --wp-cap-bottom lifts it clear of a host's own bar, and a panel's scroll
 * margin keeps the chosen one from being scrolled to behind it.
 */
const STYLE_ID = 'webfpv-picker-style';
const CSS = `
.wp{--wp-ink:#0b1116;--wp-paper:#f7f0dc;--wp-rule:#d9cdab;--wp-quiet:#5d6b78;
--wp-cream:var(--cream,#f3ead4);--wp-sakura:var(--sakura,#e8a8b8);--wp-amber:var(--amber,#ffd45c);--wp-mint:var(--mint,#7dffb4);--wp-slate:var(--slate,#9db3c8);
position:relative;display:flex;flex-direction:column;gap:14px;min-width:0;color:var(--wp-ink);
background:var(--wp-paper) radial-gradient(circle,rgba(11,17,22,.035) 0 1px,transparent 1.4px) 0 0/5px 5px;
border:4px solid var(--wp-ink);box-shadow:8px 8px 0 rgba(11,17,22,.9);padding:18px clamp(14px,2.4vw,30px) 0;
font:14px/1.45 var(--ui-font,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif)}
.wp *{box-sizing:border-box}
.wp-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.wp-lt{display:block;line-height:0}
.wp-lt canvas{display:block;max-width:100%!important;height:auto!important}
.wp-lt canvas+canvas{margin-top:-.3em}
.wp-lt.is-text{line-height:1.05;font-weight:900;font-style:italic;text-transform:uppercase}
.wp-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:14px 24px}
.wp-ttl{display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-width:0;flex:1 1 300px}
.wp-title.is-text{font-size:40px;color:var(--wp-ink)}
.wp-kick{display:inline-block;border:2.5px solid var(--wp-ink);background:var(--wp-paper);padding:5px 9px 4px;font-weight:800;font-size:12px;line-height:1;letter-spacing:.16em;text-transform:uppercase;white-space:nowrap}
.wp-kick.is-ink{background:var(--wp-ink);color:var(--wp-paper)}
.wp-rail{display:flex;gap:14px;padding:8px 10px 6px 4px;min-width:0;overflow-x:auto;scrollbar-width:none}
.wp-rail::-webkit-scrollbar{display:none}
.wp-shelf{appearance:none;position:relative;flex:0 0 auto;width:clamp(150px,15vw,206px);height:clamp(64px,6.4vw,86px);padding:0;cursor:pointer;
border:4px solid var(--wp-ink);background:var(--wp-ink);overflow:hidden;transform:skewX(-9deg);font:inherit;color:var(--wp-cream)}
.wp-shelf .wp-sk{position:absolute;inset:0 -14%;transform:skewX(9deg)}
.wp-shelf .wp-pic{position:absolute;inset:0;filter:grayscale(1) contrast(.85) brightness(1.1);opacity:.5}
.wp-shelf .wp-dt{opacity:.5}
.wp-shelf .wp-lt{position:absolute;left:calc(14% + 8px);bottom:6px;right:calc(14% + 6px)}
.wp-shelf .wp-lt.is-text{font-size:20px}
.wp-shelf i{position:absolute;right:calc(14% + 8px);top:7px;font-style:normal;font-weight:800;font-size:12px;line-height:1;color:var(--wp-ink);background:var(--wp-paper);border:2.5px solid var(--wp-ink);padding:4px 6px 3px;font-variant-numeric:tabular-nums}
.wp-shelf i:empty{display:none}
.wp-shelf[aria-selected=true]{transform:skewX(-9deg) translateY(-5px);box-shadow:0 0 0 4px var(--wp-sakura),7px 7px 0 4px var(--wp-ink)}
.wp-shelf[aria-selected=true] .wp-pic{filter:none;opacity:1}
.wp-shelf[aria-selected=true] .wp-dt{opacity:.2}
.wp-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.wp-find{flex:1 1 220px;max-width:420px;min-width:0;height:42px;font:inherit;font-size:15px;font-weight:600;background:var(--wp-paper);color:var(--wp-ink);border:3px solid var(--wp-ink);padding:0 12px;border-radius:0}
.wp-find::placeholder{color:var(--wp-quiet)}
.wp-chips{display:flex;flex-wrap:wrap;gap:8px}
.wp-chip{appearance:none;cursor:pointer;font:inherit;font-weight:800;font-size:13px;line-height:1;color:var(--wp-ink);background:var(--wp-paper);border:3px solid var(--wp-ink);height:42px;padding:0 13px}
.wp-chip[aria-pressed=true]{background:var(--wp-ink);color:var(--wp-paper)}
.wp-strip{display:flex;flex-direction:column;gap:14px;padding:4px 6px 12px;min-width:0}
.wp-tier{display:flex;align-items:center;gap:12px;margin:4px 2px 0}
.wp-tier .wp-kick{transform:skewX(-8deg)}
.wp-tier hr{flex:1;height:3px;margin:0;border:0;background:var(--wp-ink)}
.wp-tier span{font-weight:800;font-size:12px;letter-spacing:.12em;color:var(--wp-quiet)}
.wp-offs,.wp-grid{display:grid;gap:24px 22px;padding:0 8px}
.wp-offs{grid-template-columns:1.55fr 1fr 1fr;grid-auto-rows:clamp(170px,19vw,240px)}
.wp-grid{grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.wp-grid .wp-card{aspect-ratio:16/10}
.wp-card{--lean:-3.5deg;position:relative;display:block;width:100%;padding:0;margin:0;cursor:pointer;font:inherit;color:var(--wp-cream);text-align:left;
border:4px solid var(--wp-ink);background:var(--wp-ink);overflow:hidden;transform:skewX(var(--lean));transition:transform .12s ease,box-shadow .12s ease;min-width:0;
scroll-margin:24px 0 132px}
.wp-offs .wp-card{--lean:-4deg}
.wp-sk{position:absolute;inset:0 -16%;transform:skewX(calc(-1 * var(--lean,0deg)))}
.wp-pic{position:absolute;inset:0;overflow:hidden;background:var(--wp-ink)}
.wp-pic img{display:block;width:100%;height:100%;object-fit:cover}
.wp-blank{position:absolute;inset:0;display:grid;place-items:center;background:var(--wp-ink) radial-gradient(circle,rgba(243,234,212,.16) 0 1.2px,transparent 1.7px) 0 0/7px 7px;
font-weight:900;font-style:italic;font-size:56px;line-height:1;color:var(--wp-slate)}
.wp-dt{position:absolute;inset:0;background:radial-gradient(circle,rgba(11,17,22,.9) 0 1px,transparent 1.5px) 0 0/4px 4px;opacity:.1;pointer-events:none}
.wp-sh{position:absolute;inset:0;background:linear-gradient(to top,rgba(11,17,22,.74),rgba(11,17,22,0) 42%);pointer-events:none}
.wp-fl{position:absolute;inset:0;opacity:0;pointer-events:none;
background:repeating-conic-gradient(from 3deg at 50% 52%,rgba(247,240,220,.95) 0 .45deg,transparent .45deg 3.3deg),repeating-conic-gradient(from 0deg at 50% 52%,rgba(247,240,220,.8) 0 .25deg,transparent .25deg 5.1deg);
-webkit-mask:radial-gradient(ellipse 72% 70% at 50% 52%,transparent 62%,#000 96%);mask:radial-gradient(ellipse 72% 70% at 50% 52%,transparent 62%,#000 96%)}
.wp-stamp{position:absolute;left:calc(16% + 10px);top:9px;max-width:62%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
background:var(--wp-paper);color:var(--wp-ink);border:2.5px solid var(--wp-ink);padding:4px 8px 3px;font-weight:800;font-size:11px;line-height:1;letter-spacing:.14em;text-transform:uppercase}
.wp-stamp.is-official{background:var(--wp-sakura)}
.wp-stamp.is-world{background:var(--wp-mint)}
.wp-nm{position:absolute;left:calc(16% + 6px);right:calc(16% + 6px);bottom:24px;pointer-events:none}
.wp-nm.is-text{font-size:20px;color:var(--wp-cream);text-shadow:2px 2px 0 var(--wp-ink)}
.wp-cmeta{position:absolute;left:calc(16% + 12px);bottom:7px;display:flex;gap:8px;font-weight:800;font-size:12px;line-height:1;color:var(--wp-cream);text-shadow:1px 1px 0 var(--wp-ink);white-space:nowrap}
.wp-stars{color:var(--wp-amber);letter-spacing:.08em}
.wp-cmeta .wp-mint{color:var(--wp-mint)}
.wp-card:hover{transform:skewX(var(--lean)) translate(-2px,-2px);box-shadow:5px 5px 0 var(--wp-ink)}
.wp-card[aria-current=true]{z-index:2;transform:skewX(var(--lean)) translate(-4px,-4px);box-shadow:0 0 0 4px var(--wp-sakura),9px 9px 0 4px var(--wp-ink)}
.wp-card[aria-current=true] .wp-fl{opacity:1}
.wp-hero{position:sticky;bottom:var(--wp-cap-bottom,0px);z-index:5;margin:6px 4px 18px;min-height:78px;border:4px solid var(--wp-ink);background:var(--wp-paper);
box-shadow:7px 7px 0 var(--wp-ink);transform:skewX(-5deg)}
.wp-cap{display:flex;flex-wrap:wrap;align-items:center;gap:10px 20px;padding:10px 20px;transform:skewX(5deg);min-height:70px}
.wp-cap .wp-pic{position:relative;flex:none;width:118px;height:62px;border:3px solid var(--wp-ink)}
.wp-who{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1 1 300px}
.wp-name{margin:0;font-size:inherit;line-height:0}
.wp-name .wp-lt.is-text{font-size:24px;line-height:1.05}
.wp-line{font-weight:700;font-size:14px;line-height:1.25;color:var(--wp-quiet);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wp-line b{color:var(--wp-ink)}
.wp-line .wp-stars{color:#a87c00}
.wp-acts{display:flex;flex-wrap:wrap;gap:14px;align-items:center}
.wp-act{appearance:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;height:46px;padding:0 16px;font:inherit;font-weight:900;font-style:italic;font-size:15px;line-height:1;letter-spacing:.04em;
text-transform:uppercase;text-decoration:none;color:var(--wp-ink);background:var(--wp-paper);border:4px solid var(--wp-ink);box-shadow:4px 4px 0 var(--wp-ink);transform:skewX(-8deg);white-space:nowrap}
.wp-act.is-primary{height:52px;padding:0 30px;font-size:21px;background:var(--wp-amber);box-shadow:5px 5px 0 var(--wp-ink)}
.wp-act:disabled{opacity:.5;cursor:default}
.wp-empty{color:var(--wp-quiet);font-weight:700;padding:14px 4px;margin:0}
.wp :focus-visible{outline:3px solid var(--wp-ink);outline-offset:3px}
.wp-card:focus-visible{outline:none;box-shadow:0 0 0 4px var(--wp-mint),9px 9px 0 4px var(--wp-ink)}
.wp[data-zone=rail] .wp-shelf[aria-selected=true]{box-shadow:0 0 0 4px var(--wp-amber),7px 7px 0 4px var(--wp-ink)}
.wp[data-zone=rail] .wp-card[aria-current=true],.wp[data-zone=acts] .wp-card[aria-current=true],.wp[data-zone=away] .wp-card[aria-current=true]{box-shadow:0 0 0 4px var(--wp-rule),9px 9px 0 4px var(--wp-ink)}
.wp-act.is-focus{outline:4px solid var(--wp-ink);outline-offset:3px;box-shadow:0 0 0 7px var(--wp-mint)}
@media (max-width:760px){.wp{padding:14px 12px 0;box-shadow:5px 5px 0 rgba(11,17,22,.9)}
.wp-offs{grid-template-columns:1fr;grid-auto-rows:auto}.wp-offs .wp-card{aspect-ratio:16/9}
.wp-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:18px 14px}
.wp-offs,.wp-grid{padding:0 4px}
.wp-hero{transform:none;margin:4px 0 12px}.wp-cap{transform:none;padding:10px 12px}.wp-cap .wp-pic{display:none}
.wp-acts{width:100%}.wp-act.is-primary{flex:1 1 auto}}
@media (prefers-reduced-motion:reduce){.wp-card,.wp-shelf{transition:none}}
@media (forced-colors:active){.wp-lt canvas{display:none}.wp-lt .wp-sr{position:static;width:auto;height:auto;clip:auto;white-space:normal}}
`;

function injectStyle(doc) {
  if (doc.getElementById(STYLE_ID)) {
    return;
  }
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.append(style);
}

function make(doc, tag, cls, text) {
  const n = doc.createElement(tag);
  if (cls) {
    n.className = cls;
  }
  if (text != null) {
    n.textContent = text;
  }
  return n;
}

/*
 * Letter `lines` (each an array of [text, ink] runs) into `box`, one canvas
 * a line, the words kept beside them for a screen reader and for forced
 * colours. A page that cannot draw (no 2D context) keeps the words as heavy
 * type, which is what the lettering is a drawing of.
 */
function letter(doc, box, lines, px, maxW) {
  box.replaceChildren();
  box.classList.add('wp-lt');
  const words = lines.map((l) => l.map((r) => r[0]).join('')).join(' ');
  try {
    for (const line of lines) {
      const c = doc.createElement('canvas');
      c.setAttribute('aria-hidden', 'true');
      if (!c.getContext || !c.getContext('2d')) {
        throw new Error('no 2d');
      }
      box.append(c);
      paintTitle(c, line.map(([text, ink]) => ({ text, fill: INKS[ink] || ink })), px, { maxW: maxW > 0 ? maxW : 0 });
    }
    box.append(make(doc, 'span', 'wp-sr', words));
    box.classList.remove('is-text');
  } catch (err) {
    box.replaceChildren(doc.createTextNode(words));
    box.classList.add('is-text');
  }
}

/* The picture, with the card as its fallback and an initial under both. */
function picture(doc, entry, eager) {
  const box = make(doc, 'span', 'wp-pic');
  const blank = make(doc, 'span', 'wp-blank', (entry.name.trim()[0] || '?').toUpperCase());
  blank.setAttribute('aria-hidden', 'true');
  box.append(blank);
  const sources = [entry.thumb, entry.fallback].filter(Boolean);
  if (sources.length) {
    const img = doc.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.loading = eager ? 'eager' : 'lazy';
    let at = 0;
    img.addEventListener('error', () => {
      at += 1;
      if (at < sources.length) {
        img.src = sources[at];
      } else {
        img.remove();
      }
    });
    img.addEventListener('load', () => { blank.remove(); });
    img.src = sources[0];
    box.append(img);
  }
  return box;
}

function stampOf(entry) {
  if (entry.stamp) {
    return { text: entry.stamp, cls: entry.official ? 'is-official' : '' };
  }
  if (entry.kind === 'world') {
    return { text: 'World', cls: 'is-world' };
  }
  if (entry.official) {
    return { text: 'Official', cls: 'is-official' };
  }
  return { text: entry.author ? `By ${entry.author}` : 'Pilot made', cls: '' };
}

/*
 * Build the picker into `host`. Options:
 *
 *   entries      from entriesFrom, and setEntries for a fresh list later
 *   shelf        which shelf opens, 'maps', 'five' or 'whoop'
 *   order        'rated', 'newest' or 'flown'
 *   selected     an entry's key to open on, when it is on the shelf
 *   actions      (entry) => [{ id, label, href?, primary?, disabled? }], the
 *                caption's buttons, the first primary one being Enter's
 *   onAction     (id, entry, event) => void, for a button without an href
 *   onShelf      (shelf) => void, told when the pilot changes shelf
 *   onOrder      (order) => void, told when the pilot changes order
 *   onSelect     (entry) => void, told when the chosen entry changes
 *   counts       true to print how many entries each shelf holds
 *   shelfPictures { maps, five, whoop }, a picture's address for each
 *                shelf's chapter panel, when the host has its own
 *   loading      a sentence for a shelf whose list has not arrived
 *
 * Returns a controller: setEntries, setShelf, setLoading, select, move,
 * moveShelf, activate, current, handleKey, nav, setZone, zone, refresh and
 * destroy.
 */
export function createPicker(host, opts = {}) {
  const doc = host.ownerDocument || document;
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  injectStyle(doc);
  const state = {
    entries: opts.entries || [],
    shelf: PICKER_SHELVES.some((s) => s.id === opts.shelf) ? opts.shelf : 'five',
    order: PICKER_ORDERS.some((o) => o.id === opts.order) ? opts.order : 'rated',
    needle: '',
    selected: opts.selected || '',
    loading: opts.loading || '',
  };
  const root = make(doc, 'div', 'wp');
  const head = make(doc, 'div', 'wp-head');
  const ttl = make(doc, 'div', 'wp-ttl');
  const kick = make(doc, 'span', 'wp-kick');
  /* Headings are divs with a heading's role, so a host's own h2 rules
   * (the simulator rules a line under every one) stay off the page. */
  const title = make(doc, 'div', 'wp-title');
  title.setAttribute('role', 'heading');
  title.setAttribute('aria-level', '2');
  ttl.append(kick, title);
  const rail = make(doc, 'div', 'wp-rail');
  rail.setAttribute('role', 'tablist');
  rail.setAttribute('aria-label', 'Shelves');
  head.append(ttl, rail);
  const bar = make(doc, 'div', 'wp-bar');
  const find = make(doc, 'input', 'wp-find');
  find.type = 'search';
  find.placeholder = 'Find by name or pilot';
  find.setAttribute('aria-label', 'Find by name or pilot');
  find.autocomplete = 'off';
  const chips = make(doc, 'div', 'wp-chips');
  bar.append(find, chips);
  const strip = make(doc, 'div', 'wp-strip');
  strip.setAttribute('role', 'listbox');
  strip.setAttribute('aria-label', 'Choose');
  const hero = make(doc, 'section', 'wp-hero');
  hero.setAttribute('aria-live', 'polite');
  const cap = make(doc, 'div', 'wp-cap');
  hero.append(cap);
  root.append(head, bar, strip, hero);
  host.append(root);

  let shown = [];
  /* Which zone a host's nav is on, '' for none (the board, which uses
   * handleKey), 'away' while the host's own rows have it. */
  let zone = '';
  let act = 0;
  /* Panels built so far, by key, with the facts they were built from, so a
   * re-sort or a search reuses them, lettering and all. */
  const built = new Map();
  let railSig = '';
  let titleSig = '';

  /* A panel's name is lettered when the panel first comes near the window,
   * at the width it has then. */
  const io = win && 'IntersectionObserver' in win
    ? new win.IntersectionObserver((seen) => {
      for (const s of seen) {
        if (s.isIntersecting) {
          io.unobserve(s.target);
          letterCard(s.target);
        }
      }
    }, { rootMargin: '300px 0px' })
    : null;

  function letterCard(card) {
    const box = card.querySelector('.wp-nm');
    if (!box || box.dataset.done) {
      return;
    }
    const entry = shown.find((e) => e.key === card.dataset.key) || state.entries.find((e) => e.key === card.dataset.key);
    if (!entry) {
      return;
    }
    box.dataset.done = '1';
    const w = card.offsetWidth || 260;
    const px = Math.max(16, Math.min(34, Math.round(w * 0.072)));
    const per = Math.max(12, Math.round(w / 15));
    const ink = entry.official ? shelfOf(entry.shelf).ink : 'cream';
    letter(doc, box, nameLines(entry.name, per).map((l) => [[l, ink]]), px, w * 0.84);
  }

  /* How a pilot's panels lean: row by row, one way and then the other, as
   * a manga page's tiers do. The columns are what the grid's width gives
   * auto-fill, worked out rather than read back from every panel. */
  let lastGridW = 0;
  function leanRows() {
    const grid = strip.querySelector('.wp-grid');
    if (!grid) {
      return;
    }
    const w = grid.clientWidth;
    lastGridW = w;
    const narrow = win && win.matchMedia && win.matchMedia('(max-width:760px)').matches;
    const min = narrow ? 150 : 240;
    const gap = narrow ? 14 : 22;
    const cols = Math.max(1, Math.floor((w - 16 + gap) / (min + gap)));
    [...grid.children].forEach((c, i) => {
      c.style.setProperty('--lean', `${Math.floor(i / cols) % 2 ? 3.5 : -3.5}deg`);
    });
  }
  const ro = win && 'ResizeObserver' in win
    ? new win.ResizeObserver(() => {
      const grid = strip.querySelector('.wp-grid');
      if (grid && grid.clientWidth !== lastGridW) {
        leanRows();
      }
    })
    : null;
  if (ro) {
    ro.observe(strip);
  }

  function shelfOf(id) {
    return PICKER_SHELVES.find((s) => s.id === id) || PICKER_SHELVES[0];
  }

  function acts() {
    return [...cap.querySelectorAll('.wp-act')];
  }

  function markActs() {
    const all = acts();
    act = Math.max(0, Math.min(all.length - 1, act));
    all.forEach((b, i) => b.classList.toggle('is-focus', zone === 'acts' && i === act));
  }

  function setZone(z) {
    /* No buttons to hold, which is an empty shelf: the panels are next. */
    zone = z === 'acts' && !acts().length ? 'strip' : (z || '');
    act = 0;
    if (zone) {
      root.dataset.zone = zone;
    } else {
      delete root.dataset.zone;
    }
    markActs();
    if (zone === 'strip') {
      markCurrent(true);
    } else if (zone === 'rail') {
      rail.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function lists() {
    const { official, pilots } = sortShelf(state.entries, state.shelf, state.order, state.needle);
    return { official, pilots, all: [...official, ...pilots] };
  }

  function current() {
    return shown.find((e) => e.key === state.selected) || shown[0] || null;
  }

  function paintTitle_() {
    const s = shelfOf(state.shelf);
    const count = state.entries.filter((e) => e.shelf === s.id).length;
    const n = PICKER_SHELVES.indexOf(s) + 1;
    kick.textContent = count ? `Chapter 0${n} · ${count} ${s.word}` : `Chapter 0${n}`;
    const w = root.clientWidth || 1000;
    const sig = `${s.id}|${w > 760}`;
    if (sig === titleSig) {
      return;
    }
    titleSig = sig;
    letter(doc, title, [s.title.map(([t, ink]) => [t.toUpperCase(), ink])], w > 760 ? 50 : 34, w > 760 ? w * 0.48 : w - 40);
  }

  /*
   * The shelf's picture: the host's own for it (shelfPictures, which the
   * simulator gives as its gate's art), else its first official entry with
   * a picture, else any. A host that feeds one shelf at a time, as the
   * simulator's rooms do, gets the count and picture each shelf had when
   * it was last fed, rather than an empty chapter.
   */
  const seen = {};
  function tabEntry(id) {
    const own = opts.shelfPictures && opts.shelfPictures[id];
    if (own) {
      return { key: `shelf:${id}`, name: id, thumb: own, fallback: '' };
    }
    const sorted = sortShelf(state.entries, id, 'rated');
    const found = [...sorted.official, ...sorted.pilots].find((e) => e.thumb || e.fallback);
    return found || (seen[id] && seen[id].pic) || null;
  }

  function paintRail() {
    const counts = PICKER_SHELVES.map((s) => {
      const n = state.entries.filter((e) => e.shelf === s.id).length;
      if (n) {
        seen[s.id] = { n, pic: tabEntry(s.id) };
      }
      return n || (seen[s.id] ? seen[s.id].n : 0);
    });
    const pics = PICKER_SHELVES.map((s) => {
      const e = tabEntry(s.id);
      return e ? e.key : '';
    });
    const sig = `${state.shelf}|${counts.join(',')}|${pics.join(',')}|${opts.counts !== false}`;
    if (sig === railSig) {
      return;
    }
    railSig = sig;
    rail.replaceChildren();
    PICKER_SHELVES.forEach((s, k) => {
      const b = make(doc, 'button', 'wp-shelf');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(s.id === state.shelf));
      b.setAttribute('aria-label', s.label);
      b.title = s.note;
      const sk = make(doc, 'span', 'wp-sk');
      const e = tabEntry(s.id);
      if (e) {
        sk.append(picture(doc, { ...e, name: s.label }, true));
      }
      sk.append(make(doc, 'span', 'wp-dt'));
      const name = make(doc, 'span');
      sk.append(name);
      sk.append(make(doc, 'i', '', opts.counts !== false && counts[k] ? String(counts[k]) : ''));
      b.append(sk);
      b.addEventListener('click', () => setShelf(s.id, true));
      rail.append(b);
      letter(doc, name, [s.tab.map(([t, ink]) => [t.toUpperCase(), ink])], 28, b.offsetWidth ? b.offsetWidth * 0.7 : 140);
    });
  }

  function paintChips() {
    chips.replaceChildren();
    for (const o of PICKER_ORDERS) {
      if (o.tracksOnly && state.shelf === 'maps') {
        continue;
      }
      const b = make(doc, 'button', 'wp-chip', o.label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(o.id === state.order));
      b.addEventListener('click', () => {
        state.order = o.id;
        if (opts.onOrder) {
          opts.onOrder(o.id);
        }
        paint();
      });
      chips.append(b);
    }
  }

  /* The caption: the chosen entry's picture, name, facts and buttons. */
  function paintHero(entry) {
    cap.replaceChildren();
    hero.hidden = !entry;
    if (!entry) {
      return;
    }
    cap.append(picture(doc, entry, true));
    const who = make(doc, 'div', 'wp-who');
    const name = make(doc, 'div', 'wp-name');
    name.setAttribute('role', 'heading');
    name.setAttribute('aria-level', '3');
    const nameBox = make(doc, 'span');
    name.append(nameBox);
    who.append(name);
    const line = make(doc, 'div', 'wp-line');
    const kind = entry.kind === 'track'
      ? (entry.shelf === 'whoop' ? 'Whoop track' : '5 inch track')
      : 'Freestyle map';
    const bits = [];
    const add = (text, strong) => {
      if (bits.length) {
        line.append(doc.createTextNode(' · '));
      }
      line.append(strong ? make(doc, 'b', '', text) : doc.createTextNode(text));
      bits.push(text);
    };
    add(kind, true);
    if (entry.note) {
      add(entry.note);
    }
    if (entry.author && entry.kind !== 'world') {
      add(`by ${entry.author}`);
    }
    for (const f of entry.facts) {
      add(f);
    }
    if (entry.kind === 'track') {
      add(entry.best
        ? `${entry.best.three ? 'Record, 3 laps' : 'Record'} ${formatLap(entry.best.ms)}, ${entry.best.name || 'a pilot'}`
        : 'No times yet');
    }
    const stars = starsOf(entry.rating);
    if (bits.length) {
      line.append(doc.createTextNode(' · '));
    }
    line.append(make(doc, 'span', 'wp-stars', stars || 'Not rated'));
    line.title = line.textContent;
    who.append(line);
    cap.append(who);
    const box = make(doc, 'div', 'wp-acts');
    for (const a of (opts.actions ? opts.actions(entry) : [])) {
      const btn = a.href ? make(doc, 'a', 'wp-act') : make(doc, 'button', 'wp-act');
      btn.textContent = a.label;
      if (a.primary) {
        btn.classList.add('is-primary');
      }
      if (a.href) {
        btn.href = a.href;
        if (a.target) {
          btn.target = a.target;
        }
      } else {
        btn.type = 'button';
        btn.disabled = Boolean(a.disabled);
      }
      btn.dataset.act = a.id;
      btn.addEventListener('click', (ev) => {
        if (opts.onAction) {
          opts.onAction(a.id, entry, ev);
        }
      });
      box.append(btn);
    }
    /* The primary button last, at the right, where the eye ends. */
    const primary = box.querySelector('.is-primary');
    if (primary) {
      box.append(primary);
    }
    cap.append(box);
    const w = who.offsetWidth || 360;
    letter(doc, nameBox, nameLines(entry.name, 44).map((l) => [[l, shelfOf(entry.shelf).ink]]), 26, w);
    markActs();
  }

  function cardFor(entry) {
    const stamp = stampOf(entry);
    const sig = [entry.name, entry.official, entry.thumb, entry.fallback, entry.rating.count, entry.rating.avg,
      entry.best ? entry.best.ms : '', stamp.text].join('|');
    const had = built.get(entry.key);
    if (had && had.sig === sig) {
      return had.el;
    }
    const b = make(doc, 'button', 'wp-card');
    b.type = 'button';
    b.setAttribute('role', 'option');
    b.setAttribute('aria-label', `${entry.name}, ${stamp.text}`);
    b.dataset.key = entry.key;
    const sk = make(doc, 'span', 'wp-sk');
    sk.append(picture(doc, entry, false), make(doc, 'span', 'wp-dt'), make(doc, 'span', 'wp-sh'), make(doc, 'span', 'wp-fl'));
    sk.append(make(doc, 'span', `wp-stamp ${stamp.cls}`, stamp.text));
    sk.append(make(doc, 'span', 'wp-nm'));
    const meta = make(doc, 'span', 'wp-cmeta');
    const stars = starsOf(entry.rating);
    meta.append(make(doc, 'span', 'wp-stars', stars || '☆☆☆☆☆'));
    if (entry.best) {
      meta.append(make(doc, 'span', 'wp-mint', formatLap(entry.best.ms)));
    }
    sk.append(meta);
    b.append(sk);
    b.addEventListener('click', () => select(entry.key, true));
    b.addEventListener('dblclick', () => {
      select(entry.key, true);
      activate();
    });
    built.set(entry.key, { sig, el: b });
    return b;
  }

  function tier(text, count, ink) {
    const t = make(doc, 'div', 'wp-tier');
    t.setAttribute('aria-hidden', 'true');
    t.append(make(doc, 'span', `wp-kick${ink ? ' is-ink' : ''}`, text), make(doc, 'hr'), make(doc, 'span', '', String(count)));
    return t;
  }

  function paintStrip(official, pilots) {
    strip.replaceChildren();
    if (!official.length && !pilots.length) {
      strip.append(make(doc, 'p', 'wp-empty', state.loading
        || (state.needle ? 'Nothing on this shelf matches that.' : 'Nothing on this shelf yet.')));
      return;
    }
    const cards = [];
    if (official.length) {
      strip.append(tier(state.shelf === 'maps' ? 'Worlds and official' : 'Official', official.length, true));
      /* Always three columns, the first wide, so one official entry is a
       * big panel at the head of the page rather than a banner that crops
       * its picture to a sliver. */
      const offs = make(doc, 'div', 'wp-offs');
      for (const e of official) {
        const c = cardFor(e);
        c.style.removeProperty('--lean');
        offs.append(c);
        cards.push(c);
      }
      strip.append(offs);
    }
    if (pilots.length) {
      strip.append(tier('Made by pilots', pilots.length, false));
      const grid = make(doc, 'div', 'wp-grid');
      for (const e of pilots) {
        const c = cardFor(e);
        grid.append(c);
        cards.push(c);
      }
      strip.append(grid);
    }
    leanRows();
    for (const c of cards) {
      if (io) {
        io.observe(c);
      } else {
        letterCard(c);
      }
    }
  }

  function markCurrent(scroll) {
    const cur = current();
    for (const c of strip.querySelectorAll('.wp-card')) {
      const on = Boolean(cur) && c.dataset.key === cur.key;
      c.setAttribute('aria-current', String(on));
      c.setAttribute('aria-selected', String(on));
      if (on && scroll) {
        c.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
  }

  function paint() {
    const { official, pilots, all } = lists();
    shown = all;
    if (!all.some((e) => e.key === state.selected)) {
      state.selected = all[0] ? all[0].key : '';
    }
    paintTitle_();
    paintRail();
    paintChips();
    paintStrip(official, pilots);
    paintHero(current());
    markCurrent(false);
  }

  function select(key, user) {
    if (!shown.some((e) => e.key === key)) {
      return;
    }
    const changed = key !== state.selected;
    state.selected = key;
    if (changed || !cap.firstChild) {
      paintHero(current());
    }
    markCurrent(true);
    if (changed && user && opts.onSelect) {
      opts.onSelect(current());
    }
  }

  function setShelf(id, user) {
    if (!PICKER_SHELVES.some((s) => s.id === id)) {
      return;
    }
    const changed = id !== state.shelf;
    state.shelf = id;
    if (state.shelf === 'maps' && state.order === 'flown') {
      state.order = 'rated';
    }
    paint();
    if (changed && user && opts.onShelf) {
      opts.onShelf(id);
    }
  }

  function move(dir) {
    if (!shown.length) {
      return;
    }
    const i = Math.max(0, shown.findIndex((e) => e.key === state.selected));
    const next = Math.max(0, Math.min(shown.length - 1, i + dir));
    select(shown[next].key, true);
  }

  /*
   * A row up or down, as the panels lie: the panel on the next row whose
   * middle is nearest this one's, because the official tier and the grid
   * under it have different columns. False when there is no row that way.
   */
  function moveRow(dir) {
    const cards = [...strip.querySelectorAll('.wp-card')];
    const here = cards.find((c) => c.dataset.key === state.selected) || cards[0];
    if (!here) {
      return false;
    }
    const r = here.getBoundingClientRect();
    const mid = r.left + r.width / 2;
    const rows = cards
      .map((c) => ({ c, r: c.getBoundingClientRect() }))
      .filter((x) => (dir > 0 ? x.r.top > r.top + r.height / 2 : x.r.bottom < r.bottom - r.height / 2));
    if (!rows.length) {
      return false;
    }
    const edge = dir > 0 ? Math.min(...rows.map((x) => x.r.top)) : Math.max(...rows.map((x) => x.r.top));
    const row = rows.filter((x) => Math.abs(x.r.top - edge) < 4);
    row.sort((a, b) => Math.abs(a.r.left + a.r.width / 2 - mid) - Math.abs(b.r.left + b.r.width / 2 - mid));
    select(row[0].c.dataset.key, true);
    return true;
  }

  function moveShelf(dir) {
    const i = PICKER_SHELVES.findIndex((s) => s.id === state.shelf);
    const next = PICKER_SHELVES[(i + dir + PICKER_SHELVES.length) % PICKER_SHELVES.length];
    setShelf(next.id, true);
  }

  function activate() {
    const btn = cap.querySelector('.wp-act.is-primary') || cap.querySelector('.wp-act');
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
    return false;
  }

  /* A key the host forwards; true when the picker used it. The find box
   * keeps its own keys, apart from Down, which leaves it for the panels. */
  function handleKey(ev) {
    const key = ev.key;
    if (ev.target === find && key !== 'ArrowDown' && key !== 'Enter') {
      return false;
    }
    if (key === 'ArrowLeft') {
      move(-1);
    } else if (key === 'ArrowRight') {
      move(1);
    } else if (key === 'ArrowUp') {
      moveRow(-1);
    } else if (key === 'ArrowDown') {
      if (ev.target === find) {
        find.blur();
        return true;
      }
      moveRow(1);
    } else if (key === 'q' || key === 'Q' || key === 'PageUp') {
      moveShelf(-1);
    } else if (key === 'e' || key === 'E' || key === 'PageDown') {
      moveShelf(1);
    } else if (key === 'Enter') {
      return activate();
    } else {
      return false;
    }
    return true;
  }

  /*
   * A host's arrow, in zones: 'up', 'down', 'left', 'right' or 'enter'.
   * True when the picker used it, 'down' when Down left the buttons, which
   * is the host's cue to put its cursor on its own first row, and false
   * when no zone is held.
   */
  function nav(dir) {
    if (!zone || zone === 'away') {
      return false;
    }
    if (zone === 'rail') {
      if (dir === 'left' || dir === 'right') {
        moveShelf(dir === 'left' ? -1 : 1);
      } else if (dir === 'down' || dir === 'enter') {
        setZone('strip');
      }
      return true;
    }
    if (zone === 'strip') {
      if (dir === 'left' || dir === 'right') {
        move(dir === 'left' ? -1 : 1);
      } else if (dir === 'up') {
        if (!moveRow(-1)) {
          setZone('rail');
        }
      } else if (dir === 'down') {
        if (!moveRow(1)) {
          if (!acts().length) {
            return 'down';
          }
          setZone('acts');
        }
      } else if (dir === 'enter') {
        activate();
      }
      return true;
    }
    const all = acts();
    if (dir === 'left' || dir === 'right') {
      act += dir === 'left' ? -1 : 1;
      markActs();
    } else if (dir === 'up') {
      setZone('strip');
    } else if (dir === 'down') {
      return 'down';
    } else if (dir === 'enter' && all[act] && !all[act].disabled) {
      all[act].click();
    }
    return true;
  }

  /* A pointer says which zone it is in by where it went down. */
  root.addEventListener('pointerdown', (ev) => {
    if (!zone) {
      return;
    }
    const t = ev.target;
    const z = t.closest('.wp-rail') ? 'rail' : (t.closest('.wp-acts') ? 'acts' : 'strip');
    setZone(z);
    if (z === 'acts') {
      const i = acts().indexOf(t.closest('.wp-act'));
      act = i < 0 ? 0 : i;
      markActs();
    }
  });

  find.addEventListener('input', () => {
    state.needle = find.value;
    paint();
  });

  paint();

  return {
    root,
    setEntries(entries) {
      state.entries = entries || [];
      state.loading = '';
      paint();
    },
    setLoading(text) {
      state.loading = text || '';
      paint();
    },
    setShelf: (id) => setShelf(id, false),
    shelf: () => state.shelf,
    order: () => state.order,
    select: (key) => select(key, false),
    move,
    moveShelf,
    activate,
    current,
    handleKey,
    nav,
    setZone,
    zone: () => zone,
    refresh: paint,
    destroy() {
      if (io) {
        io.disconnect();
      }
      if (ro) {
        ro.disconnect();
      }
      root.remove();
    },
  };
}
