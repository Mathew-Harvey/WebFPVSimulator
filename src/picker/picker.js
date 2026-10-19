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
 * WHAT IT IS, the owner's pick of 19 October 2026 (direction B, "Select
 * screen", modelled on the AAA drone sims): a rail of three shelves, Maps,
 * 5 inch tracks and Whoop tracks; a big panel with the chosen entry's
 * picture, its facts, its record and its buttons; and a strip of every
 * entry on the shelf under it, the official ones first and the ones pilots
 * made after a divider. "Official" is whatever the board has marked
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
 * image. Only the big panel's picture loads eagerly; the strip's load as
 * they scroll in, so a shelf of seventy costs what the visible ten cost.
 *
 * LATENCY. None in flight: nothing here runs while a pilot is flying, the
 * pictures are files made at publish rather than worlds built at choosing,
 * and there is no WebGL, canvas or timer in the file.
 *
 * KEYS, for a host that forwards them (handleKey): Left and Right walk the
 * strip, Up and Down change shelf, Enter presses the big panel's first
 * button. Escape is the host's, because going back is the host's business
 * and the simulator has one rule for it on every screen.
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

/* The three shelves, in the order the rail lists them. */
export const PICKER_SHELVES = [
  { id: 'maps', label: 'Maps', note: 'Freestyle: no gates, no clock' },
  { id: 'five', label: '5 inch tracks', note: 'Race tracks on the sixty metre field' },
  { id: 'whoop', label: 'Whoop tracks', note: '65 mm whoop rooms' },
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
  const pilots = on.filter((e) => !e.official).sort(cmp);
  return { official: [...worlds, ...official], pilots };
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

/*
 * THE LOOK, inline, in the palette the simulator and the board share: ink
 * frames, a hard offset shadow, halftone on the pictures, heavy slanted
 * capitals for the names. Every colour reads its page's own token first,
 * so the simulator's and the board's stylesheets keep the last word, and a
 * plain fallback after it so the picker is whole on a page with neither.
 * Injected once per document, as a <style>, because the board's rule is
 * that a page's styles must not depend on a server's MIME table.
 */
const STYLE_ID = 'webfpv-picker-style';
const CSS = `
.wp{--wp-deep:var(--deep,#141c16);--wp-panel:var(--panel,#1a241c);--wp-panel2:#223027;--wp-ink:var(--ink-line,#0b1116);
--wp-cream:var(--cream,#f3ead4);--wp-sakura:var(--sakura,#e8a8b8);--wp-amber:var(--amber,#ffd45c);--wp-mint:var(--mint,#7dffb4);--wp-slate:var(--slate,#9db3c8);
--wp-dot:radial-gradient(circle at 50% 50%,rgba(243,234,212,.12) 0 1.1px,transparent 1.6px) 0 0/7px 7px;
display:grid;grid-template-columns:minmax(150px,200px) minmax(0,1fr);gap:14px;color:var(--wp-cream);font:14px/1.45 var(--ui-font,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif);min-width:0}
.wp *{box-sizing:border-box}
.wp-rail{display:grid;gap:8px;align-content:start;min-width:0}
.wp-shelf{appearance:none;text-align:left;cursor:pointer;font-family:inherit;font-size:13px;line-height:1.15;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:var(--wp-cream);background:var(--wp-panel);border:3px solid var(--wp-ink);box-shadow:3px 3px 0 var(--wp-ink);padding:11px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px}
.wp-shelf i{font-style:normal;color:var(--wp-slate);font-weight:700;font-variant-numeric:tabular-nums}
.wp-shelf[aria-selected=true]{background:var(--wp-cream);color:var(--wp-ink)}
.wp-shelf[aria-selected=true] i{color:var(--wp-ink)}
.wp-stage{display:grid;gap:12px;min-width:0}
.wp-hero{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);background:var(--wp-panel);border:3px solid var(--wp-ink);box-shadow:6px 6px 0 var(--wp-ink);min-width:0}
.wp-pic{position:relative;aspect-ratio:16/9;background:var(--wp-ink);overflow:hidden;min-width:0}
.wp-pic img{display:block;width:100%;height:100%;object-fit:cover}
.wp-pic::after{content:"";position:absolute;inset:0;background:var(--wp-dot);mix-blend-mode:soft-light;pointer-events:none}
.wp-pic .wp-blank{position:absolute;inset:0;display:grid;place-items:center;background:var(--wp-panel2) var(--wp-dot);font-family:inherit;font-weight:900;font-style:italic;font-size:64px;line-height:1;color:var(--wp-slate)}
.wp-hero .wp-pic{border-right:3px solid var(--wp-ink)}
.wp-stamp{font-family:inherit;position:absolute;left:8px;top:8px;z-index:2;background:var(--wp-sakura);color:var(--wp-ink);font-weight:900;font-size:11px;line-height:1;letter-spacing:.1em;text-transform:uppercase;padding:5px 8px;border:2px solid var(--wp-ink);transform:rotate(-3deg);box-shadow:2px 2px 0 var(--wp-ink);max-width:calc(100% - 16px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wp-stamp.is-pilot{background:var(--wp-slate)}
.wp-info{padding:14px 16px;display:grid;gap:10px;align-content:start;min-width:0}
.wp-kicker{color:var(--wp-slate);font-size:12px;display:flex;flex-wrap:wrap;gap:4px 10px}
.wp-kicker b{color:var(--wp-cream)}
.wp-name{margin:0;font-weight:900;font-style:italic;text-transform:uppercase;font-size:clamp(22px,3vw,32px);line-height:1.02;letter-spacing:.01em;text-shadow:2px 2px 0 var(--wp-ink);overflow-wrap:anywhere}
.wp-note{color:var(--wp-slate);margin:0}
.wp-rec{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.wp-rec div{background:var(--wp-deep);border:2px solid var(--wp-ink);padding:7px 9px;min-width:0}
.wp-rec small{display:block;color:var(--wp-slate);font-size:10px;letter-spacing:.1em;text-transform:uppercase}
.wp-rec b{font-size:17px;font-variant-numeric:tabular-nums;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wp-rec .wp-mint b{color:var(--wp-mint)}
.wp-rec span{color:var(--wp-slate);font-size:12px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wp-stars{color:var(--wp-amber);letter-spacing:1px}
.wp-acts{display:flex;flex-wrap:wrap;gap:8px}
.wp-act{appearance:none;cursor:pointer;font-family:inherit;font-weight:800;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:var(--wp-cream);background:var(--wp-panel2);border:3px solid var(--wp-ink);box-shadow:3px 3px 0 var(--wp-ink);padding:10px 12px;text-decoration:none;display:inline-flex;align-items:center}
.wp-act.is-primary{flex:1 1 100%;justify-content:center;font-style:italic;font-weight:900;font-size:19px;color:var(--wp-ink);background:var(--wp-amber);box-shadow:4px 4px 0 var(--wp-ink);padding:13px 16px}
.wp-act:disabled{opacity:.55;cursor:default}
.wp-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.wp-find{flex:1 1 180px;min-width:0;font-family:inherit;font-size:14px;font-weight:600;background:var(--wp-panel);color:var(--wp-cream);border:3px solid var(--wp-ink);padding:8px 10px}
.wp-find::placeholder{color:var(--wp-slate)}
.wp-chip{appearance:none;cursor:pointer;font-family:inherit;font-weight:700;font-size:12px;line-height:1;color:var(--wp-cream);background:var(--wp-panel);border:2px solid var(--wp-ink);box-shadow:2px 2px 0 var(--wp-ink);padding:8px 10px}
.wp-chip[aria-pressed=true]{background:var(--wp-mint);color:var(--wp-ink)}
.wp-strip{display:flex;gap:12px;overflow-x:auto;padding:4px 6px 12px 4px;scroll-snap-type:x proximity;scrollbar-color:var(--wp-slate) transparent}
.wp-card{flex:0 0 190px;scroll-snap-align:start;appearance:none;text-align:left;cursor:pointer;color:inherit;font:inherit;background:var(--wp-panel);border:3px solid var(--wp-ink);box-shadow:4px 4px 0 var(--wp-ink);padding:0;min-width:0}
.wp-card[aria-current=true]{outline:4px solid var(--wp-amber);outline-offset:1px}
.wp-card .wp-pic{aspect-ratio:16/10;border-bottom:3px solid var(--wp-ink)}
.wp-card .wp-stamp{font-size:9px;padding:4px 6px}
.wp-card .wp-blank{font-size:36px}
.wp-cbody{padding:7px 9px 9px;display:grid;gap:2px}
.wp-cname{font-weight:900;font-size:14px;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wp-cmeta{font-size:12px;color:var(--wp-slate);display:flex;gap:8px;overflow:hidden;white-space:nowrap}
.wp-cmeta .wp-mint{color:var(--wp-mint)}
.wp-split{flex:0 0 auto;align-self:stretch;display:flex;align-items:center;writing-mode:vertical-rl;transform:rotate(180deg);font-weight:900;font-style:italic;text-transform:uppercase;letter-spacing:.08em;font-size:12px;color:var(--wp-slate);border-left:4px solid var(--wp-slate);padding:0 4px}
.wp-empty{color:var(--wp-slate);padding:12px 2px}
.wp :focus-visible{outline:3px solid var(--wp-mint);outline-offset:2px}
@media (max-width:760px){.wp{grid-template-columns:1fr}.wp-rail{display:flex;overflow-x:auto;padding-bottom:4px}.wp-shelf{flex:0 0 auto}
.wp-hero{grid-template-columns:1fr}.wp-hero .wp-pic{border-right:0;border-bottom:3px solid var(--wp-ink)}.wp-card{flex-basis:150px}}
@media (prefers-reduced-motion:reduce){.wp-strip{scroll-behavior:auto}}
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

/* The picture, with the card as its fallback and an initial under both. */
function picture(doc, entry, eager) {
  const box = make(doc, 'div', 'wp-pic');
  const blank = make(doc, 'div', 'wp-blank', (entry.name.trim()[0] || '?').toUpperCase());
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
  const stamp = make(doc, 'span', `wp-stamp${entry.official ? '' : ' is-pilot'}`,
    entry.official ? 'Official' : (entry.author ? `By ${entry.author}` : 'Pilot made'));
  box.append(stamp);
  return box;
}

/*
 * Build the picker into `host`. Options:
 *
 *   entries      from entriesFrom, and setEntries for a fresh list later
 *   shelf        which shelf opens, 'maps', 'five' or 'whoop'
 *   order        'rated', 'newest' or 'flown'
 *   selected     an entry's key to open on, when it is on the shelf
 *   actions      (entry) => [{ id, label, href?, primary?, disabled? }], the
 *                big panel's buttons, the first primary one being Enter's
 *   onAction     (id, entry, event) => void, for a button without an href
 *   onShelf      (shelf) => void, told when the pilot changes shelf
 *   onOrder      (order) => void, told when the pilot changes order
 *   onSelect     (entry) => void, told when the big panel changes
 *   counts       true to print how many entries each shelf holds
 *   loading      a sentence for a shelf whose list has not arrived
 *
 * Returns a controller: setEntries, setShelf, setLoading, select, move,
 * moveShelf, activate, current, handleKey, refresh and destroy.
 */
export function createPicker(host, opts = {}) {
  const doc = host.ownerDocument || document;
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
  const rail = make(doc, 'div', 'wp-rail');
  rail.setAttribute('role', 'tablist');
  rail.setAttribute('aria-label', 'Shelves');
  const stage = make(doc, 'div', 'wp-stage');
  const hero = make(doc, 'section', 'wp-hero');
  hero.setAttribute('aria-live', 'polite');
  const bar = make(doc, 'div', 'wp-bar');
  const find = make(doc, 'input', 'wp-find');
  find.type = 'search';
  find.placeholder = 'Find by name or pilot';
  find.setAttribute('aria-label', 'Find by name or pilot');
  find.autocomplete = 'off';
  const chips = make(doc, 'div', 'wp-bar');
  bar.append(find, chips);
  const strip = make(doc, 'div', 'wp-strip');
  strip.setAttribute('role', 'listbox');
  strip.setAttribute('aria-label', 'Choose');
  stage.append(hero, bar, strip);
  root.append(rail, stage);
  host.append(root);

  let shown = [];

  function lists() {
    const { official, pilots } = sortShelf(state.entries, state.shelf, state.order, state.needle);
    return { official, pilots, all: [...official, ...pilots] };
  }

  function current() {
    return shown.find((e) => e.key === state.selected) || shown[0] || null;
  }

  function paintRail() {
    rail.replaceChildren();
    for (const s of PICKER_SHELVES) {
      const b = make(doc, 'button', 'wp-shelf');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(s.id === state.shelf));
      b.title = s.note;
      b.append(doc.createTextNode(s.label));
      if (opts.counts !== false) {
        b.append(make(doc, 'i', '', String(state.entries.filter((e) => e.shelf === s.id).length || '')));
      }
      b.addEventListener('click', () => setShelf(s.id, true));
      rail.append(b);
    }
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

  function paintHero(entry) {
    hero.replaceChildren();
    if (!entry) {
      const empty = make(doc, 'p', 'wp-empty', state.loading
        || (state.needle ? 'Nothing on this shelf matches that.' : 'Nothing on this shelf yet.'));
      hero.append(empty);
      return;
    }
    hero.append(picture(doc, entry, true));
    const info = make(doc, 'div', 'wp-info');
    const kicker = make(doc, 'div', 'wp-kicker');
    const kind = entry.kind === 'track'
      ? (entry.shelf === 'whoop' ? 'Whoop track' : '5 inch track')
      : 'Freestyle map';
    kicker.append(make(doc, 'b', '', kind));
    for (const f of entry.facts) {
      kicker.append(make(doc, 'span', '', f));
    }
    info.append(kicker);
    info.append(make(doc, 'h2', 'wp-name', entry.name));
    const by = entry.author && entry.kind !== 'world' ? `Published by ${entry.author}.` : '';
    const note = [entry.note, by].filter(Boolean).join(' ');
    if (note) {
      info.append(make(doc, 'p', 'wp-note', note));
    }
    const rec = make(doc, 'div', 'wp-rec');
    const rated = make(doc, 'div');
    rated.append(make(doc, 'small', '', 'Rating'));
    const stars = starsOf(entry.rating);
    rated.append(make(doc, 'b', stars ? 'wp-stars' : '', stars || 'Not rated'));
    rated.append(make(doc, 'span', '', entry.rating.count
      ? `${entry.rating.avg.toFixed(1)} from ${entry.rating.count}` : 'Be the first'));
    const record = make(doc, 'div', 'wp-mint');
    if (entry.kind === 'track') {
      record.append(make(doc, 'small', '', entry.best && entry.best.three ? 'Record, 3 laps' : 'Record lap'));
      record.append(make(doc, 'b', '', entry.best ? formatLap(entry.best.ms) : 'Open'));
      record.append(make(doc, 'span', '', entry.best
        ? `${entry.best.name || 'A pilot'}, ${entry.times} time${entry.times === 1 ? '' : 's'}`
        : 'No times yet'));
    } else {
      record.append(make(doc, 'small', '', 'Clock'));
      record.append(make(doc, 'b', '', 'None'));
      record.append(make(doc, 'span', '', 'Fly it your way'));
    }
    rec.append(rated, record);
    info.append(rec);
    const acts = make(doc, 'div', 'wp-acts');
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
        if (!a.href && opts.onAction) {
          opts.onAction(a.id, entry, ev);
        } else if (a.href && opts.onAction) {
          opts.onAction(a.id, entry, ev);
        }
      });
      acts.append(btn);
    }
    info.append(acts);
    hero.append(info);
  }

  function cardFor(entry) {
    const b = make(doc, 'button', 'wp-card');
    b.type = 'button';
    b.setAttribute('role', 'option');
    b.dataset.key = entry.key;
    b.append(picture(doc, entry, false));
    const body = make(doc, 'div', 'wp-cbody');
    body.append(make(doc, 'div', 'wp-cname', entry.name));
    const meta = make(doc, 'div', 'wp-cmeta');
    const stars = starsOf(entry.rating);
    meta.append(make(doc, 'span', 'wp-stars', stars || '☆☆☆☆☆'));
    if (entry.best) {
      meta.append(make(doc, 'span', 'wp-mint', formatLap(entry.best.ms)));
    }
    body.append(meta);
    b.append(body);
    b.addEventListener('click', () => select(entry.key, true));
    return b;
  }

  function paintStrip(official, pilots) {
    strip.replaceChildren();
    for (const e of official) {
      strip.append(cardFor(e));
    }
    if (official.length && pilots.length) {
      const split = make(doc, 'div', 'wp-split', 'Made by pilots');
      split.setAttribute('aria-hidden', 'true');
      strip.append(split);
    }
    for (const e of pilots) {
      strip.append(cardFor(e));
    }
    if (!official.length && !pilots.length && !state.loading) {
      strip.append(make(doc, 'p', 'wp-empty', state.needle ? 'No matches.' : ''));
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
    paintHero(current());
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

  function moveShelf(dir) {
    const i = PICKER_SHELVES.findIndex((s) => s.id === state.shelf);
    const next = PICKER_SHELVES[(i + dir + PICKER_SHELVES.length) % PICKER_SHELVES.length];
    setShelf(next.id, true);
  }

  function activate() {
    const btn = hero.querySelector('.wp-act.is-primary') || hero.querySelector('.wp-act');
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
    return false;
  }

  /* A key the host forwards; true when the picker used it. The find box
   * keeps its own keys, apart from Down, which leaves it for the strip. */
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
      moveShelf(-1);
    } else if (key === 'ArrowDown') {
      if (ev.target === find) {
        find.blur();
        return true;
      }
      moveShelf(1);
    } else if (key === 'Enter') {
      return activate();
    } else {
      return false;
    }
    return true;
  }

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
    refresh: paint,
    destroy() {
      root.remove();
    },
  };
}
