/*
 * credits.js: who made this, who flew it, and whose work it stands on.
 *
 * Built as a DOM tree so the simulator overlay and the public board can
 * share the same roll. The live address is this page at #credits. The
 * board points there rather than keeping a second copy. Logos live in
 * assets/credits (sim) or credits/ (board). They are the official marks,
 * used only to name the work:
 * Betaflight's dark wordmark, TrackDraw's dark-background colour mark,
 * Grok's 2025 wordmark, Claude's starburst.
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

function link(href, text) {
  const a = el('a', null, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

function logo(src, alt, well) {
  const box = el('div', well === 'light' ? 'credit-logo light' : 'credit-logo');
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', alt);
  /*
   * Inline the SVG instead of <img src>. The local static server has no
   * MIME table for images unless it is restarted, and Chrome will not
   * paint an SVG <img> served as application/octet-stream. fetch() still
   * reads the bytes, and an inline <svg> does not care about the type.
   */
  fetch(src)
    .then((r) => {
      if (!r.ok) {
        throw new Error(String(r.status));
      }
      return r.text();
    })
    .then((text) => {
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      const svg = doc.documentElement;
      if (!svg || svg.tagName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
        throw new Error('bad svg');
      }
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('aria-hidden', 'true');
      box.append(svg);
    })
    .catch(() => {
      box.append(el('span', 'credit-logo-fallback', alt));
    });
  return box;
}

function card({ mark, title, body, href, src, alt, well }) {
  const n = el('article', 'credit');
  if (src) {
    n.append(logo(src, alt || title, well));
  } else if (mark) {
    const plate = el('div', 'credit-logo plate');
    plate.append(mark);
    n.append(plate);
  }
  const copy = el('div', 'credit-copy');
  const h = el('h4', null, title);
  if (href) {
    const a = link(href, title);
    h.textContent = '';
    h.append(a);
  }
  copy.append(h);
  if (typeof body === 'string') {
    copy.append(el('p', null, body));
  } else if (body) {
    copy.append(body);
  }
  n.append(copy);
  return n;
}

function initials(name) {
  const parts = name.replace(/([a-z])([A-Z])/g, '$1 $2').split(/\s+/);
  const letters = parts.length > 1
    ? parts.map((p) => p[0]).join('').slice(0, 2)
    : name.slice(0, 2);
  return letters.toUpperCase();
}

function pilotCard(name, note) {
  const mark = el('span', 'pilot-chip', initials(name));
  mark.setAttribute('aria-hidden', 'true');
  return card({
    mark,
    title: name,
    body: note,
  });
}

function section(kicker, heading) {
  const n = el('section', 'credit-block');
  n.append(el('div', 'credit-kicker', kicker));
  if (heading) {
    n.append(el('h3', null, heading));
  }
  return n;
}

/**
 * Fill `host` with the credits roll. assetBase is the directory that
 * holds the logo SVGs, with no trailing slash.
 */
export function fillCredits(host, { assetBase = 'assets/credits' } = {}) {
  const src = (name) => new URL(`${assetBase}/${name}`, document.baseURI).href;
  host.textContent = '';

  const lede = el('p', 'credits-lede', 'A browser FPV racing simulator. The controller is Betaflight. The course language comes from Track Draw. The rest is one pilot and the people who flew it until it felt right.');
  host.append(lede);

  const made = section('Made by', '');
  const makerMark = el('span', 'maker-mark');
  makerMark.append(document.createTextNode('andAgain'), el('span', 'fpv', 'FPV'));
  made.append(card({
    mark: makerMark,
    title: 'andAgainFPV',
    body: 'Built this simulator, the track builder, and the public board. Orchestrated a horde of Grok and Claude along the way.',
  }));
  host.append(made);

  const pilots = section('Beta test pilots', 'They flew it until it felt like a quad.');
  const row = el('div', 'credit-row pilots');
  row.append(
    pilotCard('Asylum', 'Beta test. Put laps on it and said when it did not feel like a radio.'),
    pilotCard('Jannes', 'Beta test. The kind of flying that finds the hole in a tune.'),
    pilotCard('LeStar', 'Beta test. Kept flying it after the novelty wore off.'),
    pilotCard('CrapShack', 'Beta test. Aviation scientist. Said when the air did not behave like air.'),
  );
  pilots.append(row);
  host.append(pilots);

  const controller = section('The controller', '');
  const bfBody = el('p');
  bfBody.append(
    document.createTextNode('The rates, the PID loop, the filters, feedforward, TPA, iterm relax, airmode, anti-gravity. Compiled into this page, not rewritten. '),
    link('https://github.com/betaflight/betaflight', 'Betaflight'),
    document.createTextNode(' is GPLv3, so this is too. The flight-controller screen is a homage of '),
    link('https://github.com/betaflight/betaflight-configurator', 'Betaflight Configurator'),
    document.createTextNode(' 10.10: tab names, 4.5.1 fields, and the classic dark grey and orange. It is not that app. No Vue, no MSP, no iframe. With thanks to the Betaflight developers.'),
  );
  controller.append(card({
    src: src('betaflight.svg'),
    alt: 'Betaflight',
    title: 'Betaflight',
    href: 'https://betaflight.com',
    body: bfBody,
  }));
  host.append(controller);

  const tracks = section('The track language', '');
  const tdBody = el('p');
  tdBody.append(
    document.createTextNode('The course builder is inspired by '),
    link('https://trackdraw.app/', 'Track Draw'),
    document.createTextNode(', from the Dutch drone gods at '),
    link('https://dutchdronesquad.nl/', 'Dutch Drone Squad'),
    document.createTextNode('. Real field scale, real obstacles, a plan you can hand to a crew.'),
  );
  tracks.append(card({
    src: src('trackdraw.svg'),
    alt: 'TrackDraw',
    title: 'Track Draw',
    href: 'https://trackdraw.app/',
    body: tdBody,
  }));
  host.append(tracks);

  const horde = section('The horde', 'Written with Grok. Built with Claude.');
  const ai = el('div', 'credit-row pair');
  const grokBody = el('p');
  grokBody.append(
    document.createTextNode('xAI\'s Grok. A lot of the lines, a lot of the arguments, and a lot of the stubbornness about flight feel.'),
  );
  const claudeBody = el('p');
  claudeBody.append(
    document.createTextNode('Anthropic\'s Claude. The other half of the horde. Same human holding the sticks.'),
  );
  ai.append(
    card({
      src: src('grok.svg'),
      alt: 'Grok',
      well: 'light',
      title: 'Grok',
      href: 'https://grok.com',
      body: grokBody,
    }),
    card({
      src: src('claude.svg'),
      alt: 'Claude',
      title: 'Claude',
      href: 'https://claude.ai',
      body: claudeBody,
    }),
  );
  horde.append(ai);
  host.append(horde);

  const legal = el('p', 'credits-legal');
  legal.append(
    document.createTextNode('Betaflight, Track Draw, Grok, Claude, Dutch Drone Squad, and their marks belong to their owners. Using them here is credit, not a claim they endorse this page. WebFPV is free software under '),
    link('https://www.gnu.org/licenses/gpl-3.0.html', 'GPLv3'),
    document.createTextNode('.'),
  );
  host.append(legal);
}
