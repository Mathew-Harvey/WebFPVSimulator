/*
 * start.js: the track builder's first module.
 *
 * It was the inline module at the foot of index.html, and it moved here
 * unchanged when src/fresh.js started loading every page's scripts: the
 * builder's page asks for its deploy, has fresh.js write the import map,
 * and fresh.js imports this, once the page is parsed. An inline module
 * would have started the module loader before the import map was written.
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

import { App, docFromLocation } from './app.js';
import { pingVisit } from '../share/stats.js';

/*
 * FIRST, BEFORE ANYTHING READS THE QUERY. It takes a sponsor's
 * utm_source out of the address and puts it away, takes every utm_
 * parameter out of the address bar so a shared ?track= link does not
 * carry somebody else's poster, and counts one visit per browser per
 * UTC day across all three pages. It sends nothing at all when the
 * pilot has switched counting off on the board, or when their browser
 * sends Global Privacy Control. Nothing waits for it.
 */
pingVisit('builder');

/* One canvas for the elevation chart, created once and re-appended by
   the results panel on every render. */
const profile = document.createElement('canvas');
profile.id = 'tb-profile';

const app = new App({
  topbar: document.getElementById('tb-topbar'),
  palette: document.getElementById('tb-palette'),
  canvas2d: document.getElementById('tb-2d'),
  canvas3d: document.getElementById('tb-3d'),
  inspector: document.getElementById('tb-inspector'),
  sequence: document.getElementById('tb-sequence'),
  results: document.getElementById('tb-results'),
  profile,
  readout: document.getElementById('tb-readout'),
  toast: document.getElementById('tb-toast'),
  modal: document.getElementById('tb-modal'),
});

/* A track passed in the URL wins over the autosave, so a link to a
   track opens that track. A published course from the board, or an
   Edit a copy intent from the simulator, is adopted after that, and
   a published map from the board's Remix in the builder after that. */
const linked = docFromLocation();
if (linked) {
  app.loadDocument(linked, `Opened "${linked.name}" from the link.`);
}
await app.adoptIncomingShare();
await app.adoptIncomingMap();

window.trackBuilder = app;
