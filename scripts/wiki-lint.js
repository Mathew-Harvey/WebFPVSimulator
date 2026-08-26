/*
 * wiki-lint.js: fail if the FPV wiki does not cover the catalog it claims
 * to cover, or if a LIVE / GATED / APPLIED_INERT key is still on a family
 * template instead of authored copy.
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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APPLIED_INERT_KEYS,
  FEATURES,
  FIELDS,
  GATED_KEYS,
  STATUS,
} from '../src/fc/catalog.js';
import { ARTICLES, ARTICLE_BY_ID, CHAPTERS } from '../src/wiki/articles.js';
import {
  AUTHORED,
  FEATURE_COPY,
  allCliPages,
  cliPageId,
  pageForField,
} from '../src/wiki/cli.js';
import { FIGURE_IDS } from '../src/wiki/figures.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

function fail(msg) {
  failures.push(msg);
}

const DASH = /[\u2013\u2014]/;
const wikiFiles = [
  'src/wiki/articles.js',
  'src/wiki/cli.js',
  'src/wiki/figures.js',
  'src/wiki/wiki.js',
];
for (const rel of wikiFiles) {
  const text = readFileSync(join(root, rel), 'utf8');
  if (DASH.test(text)) {
    fail(`${rel} contains an em or en dash`);
  }
}

const authored = new Set(Object.keys(AUTHORED));
const figureSet = new Set(FIGURE_IDS);
const pages = allCliPages();
const pageIds = new Set(pages.map((p) => p.id));
pageIds.add('cli-index');
for (const a of ARTICLES) {
  pageIds.add(a.id);
}

const seenIds = new Set();
for (const a of ARTICLES) {
  if (seenIds.has(a.id)) {
    fail(`duplicate article id ${a.id}`);
  }
  seenIds.add(a.id);
  if (!CHAPTERS.some((c) => c.id === a.chapter)) {
    fail(`article ${a.id} has unknown chapter ${a.chapter}`);
  }
  if (a.figure && !figureSet.has(a.figure)) {
    fail(`article ${a.id} figure ${a.figure} is missing`);
  }
  for (const id of a.related || []) {
    if (!pageIds.has(id)) {
      fail(`article ${a.id} related link ${id} does not resolve`);
    }
  }
  for (const sec of a.sections || []) {
    for (const para of sec.paras || []) {
      if (!para || !String(para).trim()) {
        fail(`article ${a.id} section ${sec.id} has an empty paragraph`);
      }
    }
  }
}

for (const f of FIELDS) {
  const id = cliPageId(f.key);
  if (!pageIds.has(id)) {
    fail(`catalog key ${f.key} has no wiki page ${id}`);
  }
  const page = pageForField(f);
  if (!page || page.id !== id) {
    fail(`pageForField(${f.key}) did not return ${id}`);
  }
  if (!page.sections || page.sections.length < 3) {
    fail(`page ${id} is missing air/lab/sim sections`);
  }
  if (f.status === STATUS.LIVE || f.status === STATUS.GATED || f.status === STATUS.APPLIED_INERT) {
    if (!authored.has(f.key)) {
      fail(`${f.status} key ${f.key} has no authored copy in cli.js`);
    }
  }
  if (page.figure && !figureSet.has(page.figure)) {
    fail(`cli page ${id} figure ${page.figure} is missing`);
  }
  for (const id2 of page.related || []) {
    if (!pageIds.has(id2)) {
      fail(`cli page ${id} related link ${id2} does not resolve`);
    }
  }
}

for (const key of GATED_KEYS) {
  if (!authored.has(key)) {
    fail(`GATED key ${key} has no authored copy`);
  }
}
for (const key of APPLIED_INERT_KEYS) {
  if (!authored.has(key)) {
    fail(`APPLIED_INERT key ${key} has no authored copy`);
  }
}

for (const feat of FEATURES) {
  const id = `feature-${feat.name}`;
  if (!pageIds.has(id)) {
    fail(`feature ${feat.name} has no wiki page`);
  }
  if (feat.status === STATUS.LIVE && !FEATURE_COPY[feat.name]) {
    fail(`LIVE feature ${feat.name} has no authored FEATURE_COPY`);
  }
}

const unknownAuthored = [...authored].filter((k) => !FIELDS.some((f) => f.key === k));
for (const k of unknownAuthored) {
  fail(`AUTHORED key ${k} is not in the catalog`);
}

if (ARTICLES.length < 20) {
  fail(`expected a plant/controller journey, got ${ARTICLES.length} articles`);
}

if (failures.length) {
  console.error(`wiki-lint: ${failures.length} failure(s)`);
  for (const f of failures) {
    console.error(`  ${f}`);
  }
  process.exit(1);
}

const live = FIELDS.filter((f) => f.status === STATUS.LIVE).length;
const gated = FIELDS.filter((f) => f.status === STATUS.GATED).length;
const applied = FIELDS.filter((f) => f.status === STATUS.APPLIED_INERT).length;
console.log(
  `wiki-lint: ok. ${ARTICLES.length} articles, ${FIELDS.length} catalog fields, `
  + `${pages.length} cli/feature pages, ${authored.size} authored keys, `
  + `${live} LIVE / ${gated} GATED / ${applied} APPLIED_INERT.`,
);
