/*
 * panel.js: the review, a panel over the pause menu that shows the newest
 * lap against the ghost it chased, section by section, by time alone: how
 * long you took from one gate to the next, how long the ghost took, and the
 * difference, green where you gained and red where you lost. The numbers are
 * src/review/splits.js's.
 *
 * BESIDE THE TABLE, the section picked in it seen from above and from the
 * side: your line and the ghost's through it, over the gates
 * (src/review/views.js). Picking another section draws them again.
 *
 * DRAWN WHEN IT OPENS OR A SECTION IS PICKED. Nothing here runs per frame
 * or per physics step, and nothing is made until the pilot opens it.
 *
 * KEYS. Up and down move between sections, Escape or Backspace closes. It
 * listens on the document in the capture phase, so the pause menu behind
 * does not also act on a key while the review is over it. A radio or a
 * gamepad reaches it the same way: the menu's pad poll hands this panel's
 * keys to it while it is open (Ui.overlay in src/ui/ui.js).
 *
 * Styling lives in index.html with the rest of the page's CSS (.review).
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

import { compareSplits, deltaText, seconds } from './splits.js';
import { VIEW_COLOURS, drawSide, drawTop, pathOf, throughPlane } from './views.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) {
    e.className = cls;
  }
  if (text !== undefined) {
    e.textContent = text;
  }
  return e;
}

const secs = (ms) => (ms === null ? '' : `${seconds(ms)} s`);

export class ReviewPanel {
  constructor() {
    this.root = null;
    this.data = null;
    this.result = null;
    this.rows = [];
    this.selected = 0;
    this.onKey = null;
    this.drawn = null;
  }

  get isOpen() {
    return Boolean(this.root && this.root.isConnected);
  }

  /*
   * open({ lap, ref, title, refName, views }) or open({ empty })
   *   lap      { splits, durationMs } of the lap flown
   *   ref      { splits, durationMs } of the ghost it chased, or null
   *   title    one line under the heading: the lap and what it chased
   *   refName  the ghost column's heading
   *   views    optional, for the views beside the table:
   *            { stations, lapLine, refLine, lifeScale }, the stations from
   *            stationsOfRaceGates and the two lines from lineOfTrace and
   *            lineOfGhost (refLine null with no ghost)
   *   onReplay optional (k): replay section k in the room; a button
   *            under the views and Enter on a row call it
   *   empty    instead of all of that, a sentence: there is no lap yet
   */
  open(data) {
    this.close();
    this.data = data;
    this.result = data.empty
      ? { sections: [], total: null, matched: false, why: data.empty }
      : compareSplits(data.lap, data.ref);
    const r = this.result;

    const root = el('div', 'review');
    root.id = 'review';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Review');
    const card = el('div', 'review-card');
    root.append(card);

    const head = el('div', 'review-head');
    head.append(el('h2', 'review-heading', 'Review'));
    head.append(el('div', 'review-title', data.title || ''));
    const close = el('button', 'review-close', 'Close');
    close.type = 'button';
    close.addEventListener('click', () => this.close());
    head.append(close);
    card.append(head);

    if (r.why) {
      card.append(el('div', 'review-why', r.why));
    }
    this.rows = [];
    this.top = null;
    this.side = null;
    this.drawn = null;
    if (!data.empty) {
      const body = el('div', 'review-body');
      const left = el('div', 'review-left');
      left.append(this.table(data, r));
      if (data.ref) {
        left.append(el('div', 'review-legend', 'Green: faster than the ghost there. Red: slower.'));
      }
      body.append(left);
      if (data.views && r.sections.length && data.views.stations.length) {
        body.append(this.viewsColumn(data));
        card.classList.add('wide');
      }
      card.append(body);
    }

    document.body.append(root);
    this.root = root;
    this.select(0);
    this.onKey = (e) => {
      if (!this.isOpen) {
        return;
      }
      e.stopPropagation();
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault();
        this.close();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = this.rows.length;
        if (n) {
          this.select((this.selected + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
        }
      } else if (e.key === 'Enter' && this.data.onReplay && this.rows.length) {
        /* The section picked, replayed (src/review/replayview.js). */
        e.preventDefault();
        this.data.onReplay(this.selected);
      }
    };
    document.addEventListener('keydown', this.onKey, true);
  }

  /* The sections, one row each, and the lap under them. */
  table(data, r) {
    const scroll = el('div', 'review-scroll');
    const table = el('table', 'review-table');
    const thead = el('thead');
    const hr = el('tr');
    for (const words of ['Section', 'You', data.refName || 'Ghost', 'Difference']) {
      hr.append(el('th', '', words));
    }
    thead.append(hr);
    const tbody = el('tbody');
    this.rows = r.sections.map((s, k) => {
      const tr = el('tr', 'review-row');
      tr.append(el('td', 'review-name', s.name));
      tr.append(el('td', 'review-time', secs(s.lapMs)));
      tr.append(el('td', 'review-time', secs(s.refMs)));
      tr.append(el('td', `review-delta ${s.tone}`, s.deltaMs === null ? '' : deltaText(s.deltaMs)));
      tr.addEventListener('click', () => this.select(k));
      tbody.append(tr);
      return tr;
    });
    const tfoot = el('tfoot');
    const fr = el('tr', 'review-total');
    fr.append(el('td', 'review-name', 'The lap'));
    fr.append(el('td', 'review-time', secs(r.total.lapMs)));
    fr.append(el('td', 'review-time', secs(r.total.refMs)));
    fr.append(el('td', `review-delta ${r.total.tone}`, r.total.deltaMs === null ? '' : deltaText(r.total.deltaMs)));
    tfoot.append(fr);
    table.append(thead, tbody, tfoot);
    scroll.append(table);
    return scroll;
  }

  /* The two views and their key, drawn by drawViews. */
  viewsColumn(data) {
    const col = el('div', 'review-views');
    this.top = el('canvas', 'review-top');
    this.side = el('canvas', 'review-side');
    const legend = el('div', 'review-legend');
    const key = (colour, dashed, words) => {
      const s = el('span', 'review-key');
      const swatch = el('span', `review-swatch${dashed ? ' dashed' : ''}`);
      swatch.style.borderColor = colour;
      s.append(swatch, document.createTextNode(words));
      legend.append(s);
    };
    key(VIEW_COLOURS.lap, false, 'your line');
    if (data.views.refLine) {
      key(VIEW_COLOURS.ref, true, 'the ghost');
    }
    this.viewNote = el('div', 'review-legend');
    col.append(this.top, this.side, legend, this.viewNote);
    if (data.onReplay) {
      /* The section picked, replayed in the room: the button, or Enter. */
      const replay = el('button', 'review-replay-open', 'Replay this section');
      replay.type = 'button';
      replay.addEventListener('click', () => data.onReplay(this.selected));
      col.append(replay);
    }
    return col;
  }

  /* Section k from above and from the side. Each line is drawn from where
   * it went through the section's first opening to where it went through
   * its last (throughPlane), found from the splits either side of it: the
   * lap's own, and the ghost's own when its sections line up with the
   * lap's. */
  drawViews(k) {
    const v = this.data.views;
    const n = v.stations.length;
    const ends = [k % n, (k + 1) % n];
    const span = (line, splits) => {
      const at = [0, ...splits];
      return pathOf(line, throughPlane(line, v.stations[ends[0]], at[k]), throughPlane(line, v.stations[ends[1]], at[k + 1]));
    };
    const mine = span(v.lapLine, this.data.lap.splits);
    let ref = [];
    if (v.refLine && this.result.matched) {
      ref = span(v.refLine, this.data.ref.splits);
    }
    const args = { stations: v.stations, ends, mine, ref, lifeScale: v.lifeScale || 1 };
    this.drawn = { section: k, top: drawTop(this.top, args), side: drawSide(this.side, args) };
    this.viewNote.textContent = `${this.result.sections[k].name}. Top: from above. Below: from the side, looking across the section, start on the left, height up the picture. A dot marks where each line starts.`;
  }

  select(k) {
    if (!this.rows.length) {
      return;
    }
    this.selected = k;
    this.rows.forEach((tr, i) => tr.classList.toggle('selected', i === k));
    const tr = this.rows[k];
    if (tr.scrollIntoView) {
      tr.scrollIntoView({ block: 'nearest' });
    }
    if (this.top) {
      this.drawViews(k);
    }
  }

  close() {
    if (this.onKey) {
      document.removeEventListener('keydown', this.onKey, true);
      this.onKey = null;
    }
    if (this.root) {
      this.root.remove();
    }
    this.root = null;
  }

  /* What is on screen, for scripts/review-check.js. */
  state() {
    if (!this.isOpen) {
      return { open: false };
    }
    const cells = (tr) => [...tr.children].map((td) => td.textContent);
    const tone = (tr) => tr.lastChild.className.replace('review-delta', '').trim();
    const head = this.root.querySelector('thead tr');
    const total = this.root.querySelector('.review-total');
    return {
      open: true,
      title: this.data.title || '',
      why: this.result.why,
      selected: this.selected,
      head: head ? cells(head) : [],
      rows: this.rows.map((tr) => ({ cells: cells(tr), tone: tone(tr) })),
      total: total ? { cells: cells(total), tone: tone(total) } : null,
      drawn: this.drawn,
    };
  }
}
