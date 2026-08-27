/*
 * credits.js: who made this, who flew it, and whose work it stands on.
 *
 * Built as a DOM tree so the simulator overlay and the public board can
 * share the same roll. The live address is this page at #credits. The
 * board points there rather than keeping a second copy.
 *
 * WHY EVERY PILOT CARRIES A TICKET. A credits page that only says thank
 * you is a credits page nobody believes, and it reads like it was
 * generated rather than earned. Every line under a pilot's name here is
 * a real entry in PROGRESS.md: the date, what they reported, and what it
 * changed. One of them changed nothing on purpose, and that is written
 * down too, because a report that stops a bad fix is worth as much as
 * one that starts a good one.
 *
 * WHY THE CARD IS THE HIT TARGET BUT THE NAME IS THE LINK. A pilot card
 * is one thing about one person, so a click anywhere on it should land
 * on their channel. Wrapping the whole card in an <a> would make the
 * accessible name of that link the entire card, note and ticket and all,
 * which is a paragraph read out where a name should be. So the heading
 * holds the anchor and the anchor's ::after is stretched over the card.
 * The project cards below could not be wrapped anyway: their copy
 * already carries links, and an <a> inside an <a> is not a document.
 *
 * Marks live in assets/credits (sim) or credits/ (board). The four
 * project marks are the official ones: Betaflight's dark wordmark,
 * TrackDraw's dark-background colour mark, Grok's 2025 wordmark,
 * Claude's starburst. The faces are the channels' own pictures, at the
 * size YouTube serves them. All of them are used only to name the work.
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

/*
 * The beta roll. Slot numbers are a start list's: the order they turned
 * up, not a ranking. `ticket` and `found` quote PROGRESS.md down to a
 * sentence, so a reader can go and check any of them.
 *
 * Jannes has no channel to link. His card carries the same slot, the
 * same ticket and the same weight as the other three, with initials
 * where a face would be, because the roll is a record of who flew it
 * and not a list of who posts about it.
 */
const PILOTS = [
  {
    slot: '01',
    name: 'Asylum',
    face: 'asylum.jpg',
    channel: 'https://www.youtube.com/@AsylumFpv',
    handle: 'youtube.com/@AsylumFpv',
    note: 'Put laps on it and said when it did not feel like a radio.',
    ticket: 'Ticket, 19 Aug',
    found: 'Rateprofile Settings. RC Rate, Super Rate and Expo cut off the top of the stick to rate graph, and three tabs you could not read without a scroll box inside a scroll box.',
  },
  {
    slot: '02',
    name: 'Jannes',
    face: null,
    channel: null,
    handle: null,
    note: 'The kind of flying that finds the hole in a tune.',
    ticket: 'Ticket, 18 Aug',
    found: 'Title screen, Chrome 151. Refresh, touch nothing, hear nothing. It is Chrome holding the audio graph until a real gesture, not a broken bed, so the answer was to leave it alone rather than bodge a splash screen in front of the title.',
  },
  {
    slot: '03',
    name: 'LeStar',
    face: 'lestar.jpg',
    channel: 'https://www.youtube.com/@lestarfpv',
    handle: 'youtube.com/@lestarfpv',
    note: 'Kept flying it after the novelty wore off.',
    ticket: 'Two tickets, 18 Aug',
    found: 'Stuck in the flight controller until they found Escape. Every graze reading as an instant crash. There is an exit bar under the yellow header now, and a quad bounces and takes three hits before it wrecks.',
  },
  {
    slot: '04',
    name: 'CrapShack',
    face: 'crapshack.jpg',
    channel: 'https://www.youtube.com/@Z_CrapShack',
    handle: 'youtube.com/@Z_CrapShack',
    note: 'Aviation scientist. Said when the air did not behave like air.',
    ticket: 'The Precision tune',
    found: 'Asked for stiffer and got it swept rather than guessed. The preset ships his PIDs with the factory feedforward, because feedforward answers stick movement and that is the one gain a clean gyro does not buy.',
  },
];

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

/*
 * A project's official mark. A <span> and not a <div> because the mark
 * is the card's heading now, and a div inside an <h4> is not a document.
 *
 * A mark that spells the name is the label, so it takes role=img and the
 * name. A mark that sits beside the name in type is decorative, and
 * labelling it as well would have the card announce itself twice.
 */
function logo(src, alt, well, decorative) {
  const box = el('span', well === 'light' ? 'credit-logo light' : 'credit-logo');
  if (decorative) {
    box.setAttribute('aria-hidden', 'true');
  } else {
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', alt);
  }
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

function initials(name) {
  const parts = name.replace(/([a-z])([A-Z])/g, '$1 $2').split(/\s+/);
  const letters = parts.length > 1
    ? parts.map((p) => p[0]).join('').slice(0, 2)
    : name.slice(0, 2);
  return letters.toUpperCase();
}

/*
 * A channel picture in a square plate. The name is already the heading
 * beside it, so the plate is decorative and stays out of the accessible
 * tree: a screen reader that reads the picture as well would announce
 * every pilot twice. A picture that fails to load falls back to the
 * initials plate, which is also what Jannes gets, so a missing file
 * never leaves a hole where a person should be.
 */
function face(src, name) {
  const box = el('span', 'credit-face');
  box.setAttribute('aria-hidden', 'true');
  if (!src) {
    box.classList.add('is-blank');
    box.append(el('span', 'credit-face-mark', initials(name)));
    return box;
  }
  const img = new Image(240, 240);
  img.src = src;
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('error', () => {
    img.remove();
    box.classList.add('is-blank');
    box.append(el('span', 'credit-face-mark', initials(name)));
  });
  box.append(img);
  return box;
}

/* The small mono line that says where the link goes. The play triangle
   in front of it is drawn in CSS, so nothing here borrows a trademark to
   say the word video. */
function handleLine(text) {
  return el('span', 'credit-handle', text);
}

/*
 * A project card: the mark across the top, and copy under it.
 *
 * THE MARK IS THE HEADING. Betaflight's wordmark says Betaflight, so a
 * card that showed the wordmark and then wrote the name underneath said
 * it twice, which is what the roll used to do. The mark carries the
 * link and `alt` carries the accessible name, so a screen reader still
 * hears one title and a broken fetch still shows one, in the fallback.
 *
 * `wordmark: false` is for a mark that is a symbol rather than a name.
 * Claude's starburst is a lovely thing and it does not spell anything,
 * so that card gets the symbol and the word beside it. Three lines of
 * flag beats a heading that only some readers can read.
 *
 * WHY THIS CARD IS NOT A LINK THE WAY A PERSON CARD IS. Its copy
 * already carries two or three links of its own, and a hit target
 * stretched over the card would swallow every one of them.
 */
function projectCard({ src, alt, well, title, href, body, wordmark = true }) {
  const n = el('article', 'credit project');
  const h = el('h4', 'credit-title');
  const parts = [logo(src, alt || title, well, !wordmark)];
  if (!wordmark) {
    parts.push(el('span', 'credit-title-text', title));
  }
  if (href) {
    const a = link(href, null);
    a.append(...parts);
    h.append(a);
  } else {
    h.append(...parts);
  }
  n.append(h);
  const copy = el('div', 'credit-copy');
  if (typeof body === 'string') {
    copy.append(el('p', null, body));
  } else if (body) {
    copy.append(body);
  }
  n.append(copy);
  return n;
}

/*
 * A person card: face and slot number down the left, copy down the
 * right, and the whole card is the hit target when there is a channel to
 * open. `nameNode` lets the maker keep the andAgainFPV wordmark as its
 * own heading instead of plain text.
 */
function personCard({ cls, src, slot, name, nameNode, note, ticket, found, channel, handle }) {
  const n = el('article', cls ? `credit person ${cls}` : 'credit person');
  const stack = el('div', 'credit-stack');
  stack.append(face(src, name));
  if (slot) {
    const num = el('span', 'credit-slot', slot);
    num.setAttribute('aria-hidden', 'true');
    stack.append(num);
  }
  n.append(stack);

  const copy = el('div', 'credit-copy');
  const h = el('h4', null, null);
  const label = nameNode || document.createTextNode(name);
  if (channel) {
    const a = link(channel, null);
    a.append(label);
    h.append(a);
    n.classList.add('is-link');
  } else {
    h.append(label);
  }
  copy.append(h);
  if (note) {
    copy.append(el('p', null, note));
  }
  if (found) {
    const box = el('p', 'credit-ticket');
    if (ticket) {
      box.append(el('span', 'credit-ticket-label', ticket));
    }
    box.append(document.createTextNode(found));
    copy.append(box);
  }
  if (handle) {
    copy.append(handleLine(handle));
  }
  n.append(copy);
  return n;
}

function section(kicker, heading) {
  const n = el('section', 'credit-block');
  const k = el('div', 'credit-kicker');
  k.append(el('span', null, kicker));
  n.append(k);
  if (heading) {
    n.append(el('h3', null, heading));
  }
  return n;
}

/**
 * Fill `host` with the credits roll. assetBase is the directory that
 * holds the marks and the faces, with no trailing slash.
 */
export function fillCredits(host, { assetBase = 'assets/credits' } = {}) {
  const src = (name) => new URL(`${assetBase}/${name}`, document.baseURI).href;
  host.textContent = '';

  const lede = el('p', 'credits-lede', 'A browser FPV racing simulator. The controller is Betaflight. The course language comes from Track Draw. The rest is one pilot and the people who flew it until it felt right.');
  host.append(lede);

  const made = section('Made by', '');
  const makerMark = el('span', 'maker-mark');
  makerMark.append(document.createTextNode('andAgain'), el('span', 'fpv', 'FPV'));
  made.append(personCard({
    cls: 'maker',
    src: src('andagain.jpg'),
    name: 'andAgainFPV',
    nameNode: makerMark,
    note: 'Built this simulator, the track builder, and the public board. Orchestrated a horde of Grok and Claude along the way.',
    channel: 'https://www.youtube.com/@andAgainFPV',
    handle: 'youtube.com/@andAgainFPV',
  }));
  host.append(made);

  const pilots = section('Beta test pilots', 'They flew it until it felt like a quad.');
  const row = el('div', 'credit-row pilots');
  for (const p of PILOTS) {
    row.append(personCard({
      cls: 'pilot',
      src: p.face ? src(p.face) : null,
      slot: p.slot,
      name: p.name,
      note: p.note,
      ticket: p.ticket,
      found: p.found,
      channel: p.channel,
      handle: p.handle,
    }));
  }
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
  controller.append(projectCard({
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
  tracks.append(projectCard({
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
    projectCard({
      src: src('grok.svg'),
      alt: 'Grok',
      well: 'light',
      title: 'Grok',
      href: 'https://grok.com',
      body: grokBody,
    }),
    projectCard({
      src: src('claude.svg'),
      alt: 'Claude',
      title: 'Claude',
      wordmark: false,
      href: 'https://claude.ai',
      body: claudeBody,
    }),
  );
  horde.append(ai);
  host.append(horde);

  const legal = el('p', 'credits-legal');
  legal.append(
    document.createTextNode('Betaflight, Track Draw, Grok, Claude, Dutch Drone Squad, and their marks belong to their owners. The channel pictures belong to the pilots. Using them here is credit, not a claim they endorse this page. WebFPV is free software under '),
    link('https://www.gnu.org/licenses/gpl-3.0.html', 'GPLv3'),
    document.createTextNode('.'),
  );
  host.append(legal);
}
