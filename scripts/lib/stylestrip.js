/*
 * stylestrip.js: take the comments out of a page's inline stylesheet, for
 * the deploy's copy only (scripts/minify.js).
 *
 * The pages' styles are inline on purpose and they are commented the way
 * the rest of this project is: more than half of index.html is the reasons
 * behind its rules. A visitor's browser has no use for the reasons, and
 * index.html is the one file every visit waits on before anything is
 * drawn. Measured on 2026-11-09: 383 KB and 97.4 KB gzipped as written,
 * 237 KB and 40.3 KB gzipped without the stylesheet's comments.
 *
 * Only what stands between <style> and </style> is touched, and in it only
 * comments and the lines they leave blank. A comment marker inside a
 * quoted string or a url() is the string's and stays. Rules, selectors,
 * values and their order are byte for byte what they were, so the sheet a
 * browser builds is the same sheet: scripts/stylestrip-check.js holds the
 * cases, and the rule lists a browser builds from the three pages with a
 * stylesheet were compared, written against stripped, when this was
 * written: the same text, rule for rule.
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

/* One stylesheet's text with its comments gone. A comment becomes a single
 * space where it stood between two tokens on a line, since CSS reads a
 * comment as a separator there, and nothing at all where it had a line or
 * more to itself. */
export function stripCssComments(css) {
  let out = '';
  let i = 0;
  const n = css.length;
  while (i < n) {
    const c = css[i];
    if (c === '"' || c === "'") {
      /* A string runs to its own quote; a backslash takes the next
       * character with it, a quote included. */
      let j = i + 1;
      while (j < n && css[j] !== c) {
        j += css[j] === '\\' ? 2 : 1;
      }
      out += css.slice(i, Math.min(n, j + 1));
      i = j + 1;
    } else if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      /* An unclosed comment swallows the rest of the sheet in a browser
       * too, so it is left exactly as written for the browser to judge. */
      if (end < 0) {
        out += css.slice(i);
        break;
      }
      out += ' ';
      i = end + 2;
    } else if (c === 'u' && css.startsWith('url(', i)) {
      /* An unquoted url() may hold anything up to its bracket, a data URI's
       * slashes and stars with it. A quoted one is caught as a string on
       * the next turn. */
      const open = i + 4;
      const quoted = /^\s*["']/.test(css.slice(open, open + 8));
      if (quoted) {
        out += 'url(';
        i = open;
      } else {
        const end = css.indexOf(')', open);
        const stop = end < 0 ? n : end + 1;
        out += css.slice(i, stop);
        i = stop;
      }
    } else {
      out += c;
      i += 1;
    }
  }
  /* The lines the comments left empty go, and blank ones with them. The
   * indentation STAYS: a custom property's value is kept by the browser as
   * it was written, white space and all, so a shadow list set over four
   * indented lines would come back a different string without it. It costs
   * almost nothing once the file is compressed. */
  return out
    .split('\n')
    .filter((line) => line.trim() !== '')
    .join('\n');
}

/* A page with every inline stylesheet stripped. Everything outside a
 * <style> element, the licence notice at the head of the file with it, is
 * returned as it was given. */
export function stripPageStyles(html) {
  return html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_m, open, css, close) => `${open}\n${stripCssComments(css)}\n${close}`);
}
