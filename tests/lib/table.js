/*
 * table.js: plain text table rendering for the verify runner.
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

export function renderTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i]).length)),
  );
  const line = (cells) =>
    '| ' + cells.map((c, i) => String(c).padEnd(widths[i])).join(' | ') + ' |';
  const rule =
    '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|';
  const out = [line(headers), rule];
  for (const r of rows) {
    out.push(line(r));
  }
  return out.join('\n');
}
