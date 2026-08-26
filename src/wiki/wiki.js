/*
 * wiki.js: the FPV wiki screen.
 *
 * A two-pane document over the live title world. Search, a chapter rail,
 * and one article at a time. Hash is #wiki/<id> so a page can be shared.
 * Nothing here steps the integrator.
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

import { ARTICLES, ARTICLE_BY_ID, CHAPTERS } from './articles.js';
import { allCliPages, cliIndexPage, cliPageId } from './cli.js';
import { wikiFigure } from './figures.js';
import { FIELDS, TABS } from '../fc/catalog.js';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) {
    n.className = cls;
  }
  if (text != null) {
    n.textContent = text;
  }
  return n;
}

function btn(cls, text) {
  const n = el('button', cls, text);
  n.type = 'button';
  return n;
}

const CLI_PAGES = allCliPages();
const CLI_BY_ID = new Map(CLI_PAGES.map((p) => [p.id, p]));
const INDEX = cliIndexPage();

const JOURNEY = [
  'start-welcome',
  'start-nowings',
  'start-loop',
  'start-compiled',
  'start-honesty',
  'physics-airframe',
  'physics-motor',
  'physics-vrs',
  'physics-wash',
  'physics-hforce',
  'control-pid',
  'control-filters',
  'cli-index',
];

function pageById(id) {
  if (id === 'cli-index') {
    return INDEX;
  }
  return ARTICLE_BY_ID.get(id) || CLI_BY_ID.get(id) || null;
}

function searchHay(page) {
  const bits = [page.id, page.title, page.kicker, page.lede, page.key, page.status];
  for (const s of page.sections || []) {
    bits.push(s.title, ...(s.paras || []));
  }
  return bits.filter(Boolean).join(' ').toLowerCase();
}

let SEARCH_INDEX = null;
function searchIndex() {
  if (SEARCH_INDEX) {
    return SEARCH_INDEX;
  }
  SEARCH_INDEX = [
    ...ARTICLES,
    INDEX,
    ...CLI_PAGES,
  ].map((p) => ({ id: p.id, title: p.title, status: p.status || '', hay: searchHay(p) }));
  return SEARCH_INDEX;
}

function hitScore(row, q) {
  let s = 0;
  if (row.id === q || row.id === `cli-${q}` || row.id === `feature-${q}`) {
    s += 120;
  }
  if (row.id.toLowerCase().includes(q)) {
    s += 40;
  }
  const title = row.title.toLowerCase();
  if (title === q) {
    s += 90;
  } else if (title.startsWith(q)) {
    s += 55;
  } else if (title.includes(q)) {
    s += 25;
  }
  if (row.hay.includes(q)) {
    s += 1;
  }
  if (row.status === 'LIVE') {
    s += 2;
  }
  return s;
}

function statusChip(status) {
  if (!status) {
    return null;
  }
  const n = el('span', `wiki-chip wiki-chip-${status.toLowerCase().replace(/_/g, '-')}`, status.replace(/_/g, ' '));
  return n;
}

export class WikiView {
  constructor(host) {
    this.host = host;
    this.pageId = 'start-welcome';
    this.filter = 'all';
    this.cliTab = '';
    this.query = '';
    this.onOpenFc = null;
    this.build();
  }

  build() {
    this.host.textContent = '';
    this.host.classList.add('wiki-host');
    const shell = el('div', 'wiki-shell');
    this.rail = el('nav', 'wiki-rail');
    this.rail.setAttribute('aria-label', 'Wiki chapters');
    this.main = el('div', 'wiki-main');
    const tools = el('div', 'wiki-tools');
    this.search = document.createElement('input');
    this.search.type = 'search';
    this.search.className = 'wiki-search';
    this.search.placeholder = 'Search the wiki and every CLI key';
    this.search.setAttribute('aria-label', 'Search the wiki');
    this.search.autocomplete = 'off';
    this.search.addEventListener('input', () => {
      this.query = this.search.value.trim();
      this.renderResults();
    });
    this.search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.search.blur();
        e.stopPropagation();
      }
      e.stopPropagation();
    });
    tools.append(this.search);
    this.results = el('div', 'wiki-results');
    this.article = el('article', 'wiki-article');
    this.main.append(tools, this.results, this.article);
    shell.append(this.rail, this.main);
    this.host.append(shell);
    this.renderRail();
    this.render();
  }

  typing() {
    return document.activeElement === this.search;
  }

  open(id, opts = {}) {
    const page = pageById(id);
    if (!page) {
      return false;
    }
    this.pageId = id;
    this.query = '';
    if (this.search) {
      this.search.value = '';
    }
    this.renderRail();
    this.render();
    if (!opts.silentHash) {
      const url = new URL(window.location.href);
      url.hash = `wiki/${id}`;
      history.replaceState(null, '', url);
    }
    this.article.scrollTop = 0;
    this.main.scrollTop = 0;
    return true;
  }

  openDefault() {
    const hash = (window.location.hash || '').replace(/^#/, '');
    if (hash.startsWith('wiki/')) {
      const id = decodeURIComponent(hash.slice(5));
      if (this.open(id, { silentHash: true })) {
        return;
      }
    }
    this.open('start-welcome', { silentHash: false });
  }

  renderRail() {
    this.rail.textContent = '';
    const journey = el('div', 'wiki-rail-block');
    journey.append(el('div', 'wiki-rail-kicker', 'The path'));
    for (const id of JOURNEY) {
      const p = pageById(id);
      if (!p) {
        continue;
      }
      const b = btn(this.pageId === id ? 'wiki-rail-link on' : 'wiki-rail-link', p.title);
      b.addEventListener('click', () => this.open(id));
      journey.append(b);
    }
    this.rail.append(journey);
    for (const ch of CHAPTERS) {
      const block = el('div', 'wiki-rail-block');
      block.append(el('div', 'wiki-rail-kicker', ch.title));
      block.append(el('p', 'wiki-rail-note', ch.note));
      const items = ARTICLES.filter((a) => a.chapter === ch.id);
      if (ch.id === 'cli') {
        const openIdx = btn(this.pageId === 'cli-index' ? 'wiki-rail-link on' : 'wiki-rail-link', 'Catalog index');
        openIdx.addEventListener('click', () => this.open('cli-index'));
        block.append(openIdx);
        for (const tab of TABS) {
          const b = btn('wiki-rail-link wiki-rail-sub', tab.label);
          b.addEventListener('click', () => {
            this.cliTab = tab.id;
            this.filter = 'all';
            this.open('cli-index');
            this.renderCliList();
          });
          block.append(b);
        }
      } else {
        for (const p of items) {
          const b = btn(this.pageId === p.id ? 'wiki-rail-link on' : 'wiki-rail-link', p.title);
          b.addEventListener('click', () => this.open(p.id));
          block.append(b);
        }
      }
      this.rail.append(block);
    }
  }

  renderResults() {
    this.results.textContent = '';
    const q = this.query.toLowerCase();
    if (!q) {
      this.results.hidden = true;
      this.article.hidden = false;
      return;
    }
    this.results.hidden = false;
    this.article.hidden = true;
    const ranked = searchIndex()
      .map((row) => ({ row, score: hitScore(row, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const hits = ranked.slice(0, 40).map((x) => x.row);
    this.results.append(el('p', 'wiki-results-cap', ranked.length ? `${hits.length}${ranked.length > 40 ? '+' : ''} matches` : 'No matches'));
    for (const hit of hits) {
      const b = btn('wiki-hit', '');
      const t = el('span', 'wiki-hit-title', hit.title);
      b.append(t);
      if (hit.status) {
        b.append(statusChip(hit.status));
      }
      b.append(el('span', 'wiki-hit-id', hit.id));
      b.addEventListener('click', () => this.open(hit.id));
      this.results.append(b);
    }
  }

  render() {
    this.results.hidden = true;
    this.article.hidden = false;
    this.article.textContent = '';
    const page = pageById(this.pageId);
    if (!page) {
      this.article.append(el('p', null, 'That page is missing.'));
      return;
    }
    const kicker = el('div', 'wiki-kicker', page.kicker || '');
    if (page.status) {
      kicker.append(statusChip(page.status));
    }
    this.article.append(kicker);
    this.article.append(el('h2', null, page.title));
    if (page.key && page.kind === 'cli') {
      const code = el('p', 'wiki-key');
      const k = el('code', null, page.key);
      code.append(k);
      this.article.append(code);
    }
    if (page.lede) {
      this.article.append(el('p', 'wiki-lede', page.lede));
    }
    if (page.figure) {
      const fig = wikiFigure(page.figure);
      if (fig) {
        this.article.append(fig);
      }
    }
    if (page.kind === 'index') {
      this.renderCliIndex(page);
      return;
    }
    const pair = el('div', 'wiki-pair');
    const air = (page.sections || []).find((s) => s.id === 'air');
    const lab = (page.sections || []).find((s) => s.id === 'lab');
    if (air) {
      pair.append(this.sectionNode(air, 'wiki-col wiki-col-air'));
    }
    if (lab) {
      pair.append(this.sectionNode(lab, 'wiki-col wiki-col-lab'));
    }
    this.article.append(pair);
    for (const s of page.sections || []) {
      if (s.id === 'air' || s.id === 'lab') {
        continue;
      }
      this.article.append(this.sectionNode(s, `wiki-sec wiki-sec-${s.id}`));
    }
    if (page.reason && page.status && page.status !== 'LIVE') {
      const note = el('p', 'wiki-reason');
      note.append(el('strong', null, 'Catalog reason. '), document.createTextNode(page.reason));
      this.article.append(note);
    }
    if (page.kind === 'cli' && this.onOpenFc && page.key && !String(page.key).startsWith('feature ')) {
      const live = page.status === 'LIVE';
      const go = btn('wiki-fc-link', live
        ? 'Open this in the flight controller'
        : 'Show this key in the flight controller');
      go.addEventListener('click', () => this.onOpenFc(page.key));
      this.article.append(go);
    }
    if (page.related && page.related.length) {
      const rel = el('div', 'wiki-related');
      rel.append(el('div', 'wiki-rail-kicker', 'Related'));
      const row = el('div', 'wiki-related-row');
      for (const id of page.related) {
        const p = pageById(id);
        const b = btn('wiki-related-link', p ? p.title : id);
        b.addEventListener('click', () => this.open(id));
        row.append(b);
      }
      rel.append(row);
      this.article.append(rel);
    }
    if (page.source) {
      this.article.append(el('p', 'wiki-source', `Source: ${page.source}`));
    }
    this.appendJourneyNav();
  }

  appendJourneyNav() {
    const i = JOURNEY.indexOf(this.pageId);
    if (i < 0) {
      return;
    }
    const nav = el('div', 'wiki-journey-nav');
    if (i > 0) {
      const prev = pageById(JOURNEY[i - 1]);
      const b = btn('wiki-related-link', prev ? `Previous: ${prev.title}` : 'Previous');
      b.addEventListener('click', () => this.open(JOURNEY[i - 1]));
      nav.append(b);
    }
    if (i < JOURNEY.length - 1) {
      const next = pageById(JOURNEY[i + 1]);
      const b = btn('wiki-related-link wiki-journey-next', next ? `Next: ${next.title}` : 'Next');
      b.addEventListener('click', () => this.open(JOURNEY[i + 1]));
      nav.append(b);
    }
    this.article.append(nav);
  }

  sectionNode(sec, cls) {
    const n = el('section', cls);
    n.append(el('h3', null, sec.title));
    for (const para of sec.paras || []) {
      if (para) {
        n.append(el('p', null, para));
      }
    }
    return n;
  }

  renderCliIndex(page) {
    const pair = el('div', 'wiki-pair');
    const air = page.sections.find((s) => s.id === 'air');
    const lab = page.sections.find((s) => s.id === 'lab');
    pair.append(this.sectionNode(air, 'wiki-col wiki-col-air'));
    pair.append(this.sectionNode(lab, 'wiki-col wiki-col-lab'));
    this.article.append(pair);
    this.article.append(this.sectionNode(page.sections.find((s) => s.id === 'sim'), 'wiki-sec'));
    const counts = el('p', 'wiki-counts');
    counts.textContent = Object.entries(page.counts).map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`).join(' · ');
    this.article.append(counts);
    const filters = el('div', 'wiki-filters');
    for (const id of ['all', 'LIVE', 'GATED', 'APPLIED_INERT', 'INERT', 'ABSENT']) {
      const b = btn(this.filter === id ? 'wiki-filter on' : 'wiki-filter', id === 'all' ? 'All' : id.replace(/_/g, ' '));
      b.addEventListener('click', () => {
        this.filter = id;
        this.renderCliList();
      });
      filters.append(b);
    }
    this.article.append(filters);
    const tabs = el('div', 'wiki-filters wiki-tabs');
    const allTab = btn(!this.cliTab ? 'wiki-filter on' : 'wiki-filter', 'Every tab');
    allTab.addEventListener('click', () => {
      this.cliTab = '';
      this.renderCliList();
    });
    tabs.append(allTab);
    for (const tab of TABS) {
      const b = btn(this.cliTab === tab.id ? 'wiki-filter on' : 'wiki-filter', tab.label);
      b.addEventListener('click', () => {
        this.cliTab = tab.id;
        this.renderCliList();
      });
      tabs.append(b);
    }
    this.article.append(tabs);
    this.cliList = el('div', 'wiki-cli-list');
    this.article.append(this.cliList);
    this.renderCliList();
    if (page.source) {
      this.article.append(el('p', 'wiki-source', `Source: ${page.source}`));
    }
    this.appendJourneyNav();
  }

  renderCliList() {
    if (!this.cliList) {
      return;
    }
    this.cliList.textContent = '';
    const rows = FIELDS.filter((f) => {
      if (this.filter !== 'all' && f.status !== this.filter) {
        return false;
      }
      if (this.cliTab && f.tab !== this.cliTab) {
        return false;
      }
      return true;
    });
    this.cliList.append(el('p', 'wiki-results-cap', `${rows.length} keys`));
    for (const f of rows) {
      const b = btn('wiki-cli-row', '');
      b.append(el('span', 'wiki-cli-key', f.key));
      b.append(statusChip(f.status));
      b.addEventListener('click', () => this.open(cliPageId(f.key)));
      this.cliList.append(b);
    }
  }
}

export function mountWiki(host) {
  return new WikiView(host);
}

export function wikiPageCount() {
  return ARTICLES.length + 1 + CLI_PAGES.length;
}
