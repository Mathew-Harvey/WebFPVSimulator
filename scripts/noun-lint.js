/*
 * noun-lint.js: the player only ever sees "track", never "course".
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

/*
 * ONE WORD FOR ONE THING.
 *
 * "Track" was a map id, a menu row, a screen title and a mode, and the same
 * object was a "course" on the board and in the builder's prose. The board's
 * own empty state used both nouns in one sentence. A player cannot be
 * expected to work out that the thing they built, the thing they published
 * and the thing they are racing are the same object when the product calls
 * it two things.
 *
 * The rename is done. This is what stops it coming back, because it will:
 * the next screen somebody adds will say "course" if nothing objects.
 *
 * WHAT THIS CHECKS, and what it deliberately does not.
 *
 * Player-visible text only: string literals that reach the DOM, and HTML
 * text nodes and rendering attributes. NOT identifiers, screen ids, CSS
 * class names, storage keys or API routes. `activeCourseSummary` and
 * `.course-card` are fine: nobody reads them but us, and renaming a stored
 * key would orphan every track already in somebody's browser.
 *
 * Comments are not checked either. They are for whoever is reading the
 * code, and a comment explaining why a key is still spelled `course` has to
 * be allowed to say the word.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* Directories that are not the product: vendored source, build output,
 * scratch, and the test suites, whose names describe code rather than
 * addressing a player. */
const SKIP_DIRS = new Set(['node_modules', '.git', '.loop', 'vendor', 'dist', 'tests', 'tmp']);

/*
 * The one allowed sighting, with its reason, because a blanket rule that
 * cannot be argued with gets switched off rather than obeyed.
 *
 * "50 m course" is the swimming term, long course as against short course,
 * and it is the real world reference the world-scale check measures the
 * baths pool against. Writing "50 m track" there would make it wrong.
 */
const ALLOWED = [
  { file: 'src/maps/baths/references.js', text: 'FINA 50 m course' },
];

const WORD = /(?<![A-Za-z0-9_])[Cc]ourses?(?![A-Za-z0-9_])/;

/*
 * Strip comments, then hand back the string literals. Written as a small
 * scanner rather than a regex because a regex cannot tell an apostrophe in
 * a comment from the start of a string, and this file's whole job is to be
 * trusted about which text a player reads.
 */
function literals(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === c) {
          break;
        }
        j += 1;
      }
      out.push({ at: i + 1, text: src.slice(i + 1, Math.min(j, n)) });
      i = j + 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const j = src.indexOf('*/', i + 2);
      i = j < 0 ? n : j + 2;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      const j = src.indexOf('\n', i);
      i = j < 0 ? n : j;
      continue;
    }
    i += 1;
  }
  return out;
}

/*
 * A route, a storage key, a selector, or a list of CSS class names. Every
 * space separated token is lower case and made only of the characters those
 * things are made of, so `screen screen-page screen-courses` is machinery
 * and `A gated course` is prose.
 */
function isMachineText(text) {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return true;
  }
  return tokens.every((t) => /^[a-z0-9\-_./#?=&:]+$/.test(t));
}

/*
 * Blank out every ${...} in a template literal.
 *
 * What is inside one is CODE, not text: `${card.course.track.id}` puts the
 * word in front of this check while putting nothing in front of a player.
 * Reading a property name as prose is the single biggest way this lint
 * could earn a reputation for crying wolf, and a lint with that reputation
 * gets switched off rather than obeyed.
 */
function stripInterpolations(text) {
  return text.replace(/\$\{[^}]*\}/g, '');
}

async function walk(dir, out) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      await walk(join(dir, entry.name), out);
      continue;
    }
    if (/\.(js|html)$/.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function lineOf(src, at) {
  return src.slice(0, at).split('\n').length;
}

async function main() {
  const files = await walk(root, []);
  const findings = [];
  let scanned = 0;

  for (const file of files) {
    const rel = relative(root, file);
    /* This file names the word it is looking for, dozens of times. */
    if (rel === 'scripts/noun-lint.js') {
      continue;
    }
    /* A selftest's own check names describe code, not a player. */
    if (/selftest\.js$/.test(rel)) {
      continue;
    }
    const raw = await readFile(file, 'utf8');
    scanned += 1;

    if (rel.endsWith('.html')) {
      /*
       * A <style> block is not text a player reads, and a <script> block is
       * JavaScript, whose literals go through the same scanner as any other
       * file's. Both are blanked here, keeping the line count, so the text
       * node pass sees only what is actually rendered. Without this the
       * whole palette and every inline module came back as prose.
       */
      const keepLines = (m) => '\n'.repeat((m.match(/\n/g) || []).length);
      let src = raw.replace(/<!--[\s\S]*?-->/g, keepLines);
      const inlineScripts = [...src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
      src = src.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, keepLines);
      src = src.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, keepLines);
      for (const sc of inlineScripts) {
        for (const lit of literals(sc[1])) {
          const visible = stripInterpolations(lit.text);
          if (WORD.test(visible) && !isMachineText(visible)) {
            findings.push({
              rel,
              line: lineOf(raw, sc.index),
              text: `inline script: ${visible.trim().slice(0, 80)}`,
            });
          }
        }
      }
      /* Text nodes. */
      for (const m of src.matchAll(/>([^<]+)</g)) {
        if (WORD.test(m[1])) {
          findings.push({ rel, line: lineOf(src, m.index), text: m[1].trim().slice(0, 90) });
        }
      }
      /* The attributes that render. */
      for (const m of src.matchAll(/(content|placeholder|aria-label|title|alt)="([^"]*)"/g)) {
        if (WORD.test(m[2])) {
          findings.push({ rel, line: lineOf(src, m.index), text: `${m[1]}="${m[2].slice(0, 70)}"` });
        }
      }
      continue;
    }

    for (const lit of literals(raw)) {
      const visible = stripInterpolations(lit.text);
      if (!WORD.test(visible)) {
        continue;
      }
      if (isMachineText(visible)) {
        continue;
      }
      const line = lineOf(raw, lit.at);
      const text = lit.text.trim().replace(/\s+/g, ' ').slice(0, 90);
      if (ALLOWED.some((a) => a.file === rel && lit.text.includes(a.text))) {
        continue;
      }
      findings.push({ rel, line, text });
    }
  }

  console.log(`noun lint: ${scanned} file(s) scanned for a player-visible "course"`);
  if (!findings.length) {
    console.log(`  allowed, with reasons in this file: ${ALLOWED.length}`);
    console.log('\nPASS, the player only ever sees a track');
    return 0;
  }
  for (const f of findings) {
    console.log(`  ${f.rel}:${f.line}  ${f.text}`);
  }
  console.log(`\nFAIL, ${findings.length} player-visible "course"`);
  console.log('The player sees one noun. Use track, or add an argued exception to ALLOWED.');
  return 1;
}

process.exit(await main());
