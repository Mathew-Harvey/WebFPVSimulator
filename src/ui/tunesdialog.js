/*
 * tunesdialog.js: the three small dialogs the Tunes library needs, and
 * nothing else.
 *
 *   Share this tune   name it, say a word about it, put it on the board and
 *                     get a code back.
 *   Load a tune       paste a code, read what is in it, use it, or put your
 *                     own back.
 *   Rate              one to five stars on a track, a map or a tune.
 *
 * They are dialogs and not a room on purpose. A room is a screen the whole
 * menu machine has to know about (its title, its crumb, its fit check, its
 * cursor), and this is three questions asked from rows that already exist.
 * They borrow the flight feel form's frame, `ui.nameDialog`, and honour its
 * contract: `nameWait` marks it open, `nameKeyHandler` owns Escape, and
 * `closeNameDialog` is the only way out, so a key never falls through to the
 * menu underneath.
 *
 * Everything that has to read or write the pilot's settings goes through
 * methods on the Ui (tuneSnapshot, describeTune, applyCommunityTune,
 * undoCommunityTune), because those need the file's own clamps and the
 * settings object, and a dialog that reached into either would be a second
 * copy of how a setting is changed. Nothing here is on the flight path:
 * these open from menu rows, between flights, and every request is a menu
 * request with the board's usual read deadline.
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

import {
  fetchTune, postRating, publishTune, removeTune, tuneCodeFrom, tuneCodeShown, tunesPageUrl,
} from '../share/board.js';
import { myStars, ratingWords } from '../share/rating.js';
import { nameRules, normaliseName, readPilotName, writePilotName } from '../share/pilot.js';

const MINE_TUNES_KEY = 'webfpv.tunes.mine.v1';
const MINE_TUNES_MAX = 20;

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
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}

function field(cls, { max, placeholder = '', value = '', label }) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = `name-dialog-input ${cls || ''}`.trim();
  input.maxLength = max;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = placeholder;
  input.value = value;
  input.setAttribute('aria-label', label);
  return input;
}

/*
 * The tunes this browser has shared, with the key each came back with, so a
 * pilot can take one down from the Load dialog. The key is the board's
 * ownership check and is kept nowhere else. Bounded, newest first.
 */
function readMine() {
  try {
    const list = JSON.parse(localStorage.getItem(MINE_TUNES_KEY) || '[]');
    return Array.isArray(list) ? list.filter((x) => x && typeof x.id === 'string' && typeof x.editKey === 'string') : [];
  } catch (e) {
    return [];
  }
}

function rememberMine(entry) {
  const list = [entry, ...readMine().filter((x) => x.id !== entry.id)].slice(0, MINE_TUNES_MAX);
  try {
    localStorage.setItem(MINE_TUNES_KEY, JSON.stringify(list));
  } catch (e) {
    /* Private mode: the tune is up and the key is lost with the page. The
     * success view says nothing about taking it down for that reason. */
  }
}

function forgetMine(id) {
  try {
    localStorage.setItem(MINE_TUNES_KEY, JSON.stringify(readMine().filter((x) => x.id !== id)));
  } catch (e) {
    /* Nothing to forget that was kept. */
  }
}

/*
 * Put a box in the shared dialog frame and give back `finish`. `busy` is a
 * function so Escape and a click outside are refused while a request is in
 * flight: closing the form under a publish that then lands is how a tune
 * gets shared twice.
 */
function mount(ui, box, busy) {
  if (ui.nameWait) {
    ui.closeNameDialog(null);
  }
  ui.nameDialog.textContent = '';
  ui.nameDialog.append(box);
  ui.nameDialog.hidden = false;
  ui.syncChips();
  const finish = () => ui.closeNameDialog(null);
  ui.nameWait = () => {};
  ui.nameKeyHandler = (e) => {
    if (e.key !== 'Escape') {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (!busy()) {
      finish();
    }
  };
  ui.nameDialog.addEventListener('keydown', ui.nameKeyHandler, true);
  ui.nameClickHandler = (e) => {
    if (e.target === ui.nameDialog && !busy()) {
      finish();
    }
  };
  ui.nameDialog.addEventListener('click', ui.nameClickHandler);
  return finish;
}

function copyButton(text) {
  const b = btn('name-dialog-btn', 'Copy code');
  b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      b.textContent = 'Copied';
    } catch (e) {
      b.textContent = 'Select it and copy';
    }
    setTimeout(() => { b.textContent = 'Copy code'; }, 2200);
  });
  return b;
}

/* ------------------------------------------------------------------ */
/* Stars                                                                */
/* ------------------------------------------------------------------ */

/*
 * Five chips and a take-back, for one item. `send(stars)` is the request;
 * the row paints the answer. Used by the Rate dialog and by the Load
 * dialog's preview, so both read and write stars the same way.
 */
function starRow({ kind, id, rating, board, onRated }) {
  const wrap = el('div', 'tune-rate');
  const summary = el('p', 'lede feel-hint', ratingWords(rating));
  const status = el('p', 'name-dialog-err', '');
  status.setAttribute('role', 'status');
  const chips = el('div', 'feel-chips');
  const buttons = [];
  const undo = btn('name-dialog-btn', 'Take my rating back');
  const paint = (mine) => {
    buttons.forEach((b, i) => {
      b.classList.toggle('on', i < mine);
      b.setAttribute('aria-pressed', i + 1 === mine ? 'true' : 'false');
    });
    undo.hidden = !mine;
  };
  const send = async (stars) => {
    buttons.forEach((b) => { b.disabled = true; });
    undo.disabled = true;
    status.textContent = '';
    try {
      const done = await postRating({
        kind, id, stars, origin: board,
      });
      paint(stars);
      summary.textContent = ratingWords(done.rating);
      status.textContent = stars ? 'Thanks, that is counted.' : 'Taken back.';
      if (onRated) {
        onRated(done.rating);
      }
    } catch (e) {
      status.textContent = e.message || 'The board could not take that rating.';
    }
    buttons.forEach((b) => { b.disabled = false; });
    undo.disabled = false;
  };
  for (let n = 1; n <= 5; n += 1) {
    const b = btn('feel-chip', n === 1 ? '1 star' : `${n} stars`);
    b.addEventListener('click', () => { send(n); });
    buttons.push(b);
    chips.append(b);
  }
  undo.addEventListener('click', () => { send(0); });
  paint(myStars(kind, id));
  wrap.append(summary, chips, undo, status);
  return { wrap, first: buttons[0] };
}

/* A track, a map or a tune. `item` is a board listing with `id`, `name`,
 * `board` and `rating`; `onRated` repaints whatever shows the mean. */
export function openRate(ui, {
  kind, item, onRated,
}) {
  const box = el('div', 'name-dialog-box bug feel');
  box.append(el('h2', null, `Rate ${item.name}`));
  box.append(el(
    'p',
    'lede',
    'One to five stars, one rating each. You can change it or take it back. Pilots see the average beside the name, and the board can put the best first.',
  ));
  const row = starRow({
    kind, id: item.id, rating: item.rating, board: item.board, onRated,
  });
  box.append(row.wrap);
  const buttons = el('div', 'name-dialog-row');
  const close = btn('name-dialog-btn on', 'Done');
  buttons.append(close);
  box.append(buttons);
  const finish = mount(ui, box, () => false);
  close.addEventListener('click', finish);
  row.first.focus();
}

/* ------------------------------------------------------------------ */
/* Share this tune                                                      */
/* ------------------------------------------------------------------ */

export function openTuneShare(ui) {
  const snap = ui.tuneSnapshot();
  const box = el('div', 'name-dialog-box bug feel');
  box.append(el('h2', null, 'Share this tune'));
  box.append(el(
    'p',
    'lede',
    'Puts the tune you fly on the public board, with a short code anybody can paste to fly it. This is what goes up, and only this:',
  ));
  const list = el('ul', 'tune-share-list');
  for (const line of ui.describeTune(snap)) {
    list.append(el('li', null, line));
  }
  box.append(list);
  box.append(el(
    'p',
    'lede feel-hint',
    'Not included: your graphics, your sticks and radio, your flight mode and your lap times. Loading a tune never touches those.',
  ));

  box.append(el('p', 'name-dialog-label', 'Name this tune'));
  const name = field('', { max: 40, placeholder: 'Calm and locked in', label: 'Name this tune' });
  box.append(name);
  box.append(el('p', 'name-dialog-label', 'A word about it (optional)'));
  const notes = field('', { max: 280, placeholder: 'What it is good for, what to try first.', label: 'A word about it' });
  box.append(notes);
  box.append(el('p', 'name-dialog-label', 'Your pilot name'));
  const pilot = field('', {
    max: 24, placeholder: 'Shown as the author', value: readPilotName() || '', label: 'Your pilot name',
  });
  box.append(pilot);

  const err = el('p', 'name-dialog-err', '');
  const row = el('div', 'name-dialog-row');
  const send = btn('name-dialog-btn on', 'Share');
  const dismiss = btn('name-dialog-btn', 'Not now');
  row.append(send, dismiss);
  box.append(err, row);

  let sending = false;
  const finish = mount(ui, box, () => sending);
  dismiss.addEventListener('click', () => { if (!sending) { finish(); } });

  const submit = async () => {
    // Enter in a text box reaches here while the Share button is disabled,
    // and a second post would be a second tune with a code nobody keeps.
    if (sending) {
      return;
    }
    err.textContent = '';
    const title = name.value.trim().replace(/\s+/g, ' ');
    if (title.length < 3) {
      err.textContent = 'Give it a name, three characters or more.';
      return;
    }
    const author = normaliseName(pilot.value);
    if (!author) {
      err.textContent = nameRules();
      return;
    }
    sending = true;
    send.disabled = true;
    dismiss.disabled = true;
    send.textContent = 'Sharing';
    try {
      const made = await publishTune({
        author,
        name: title,
        notes: notes.value.trim(),
        airframe: snap.airframe,
        setup: snap.setup,
      });
      writePilotName(author);
      rememberMine({
        id: made.id, editKey: made.editKey, name: title, utc: new Date().toISOString(),
      });
      sending = false;
      box.textContent = '';
      box.append(el('h2', null, 'Shared'));
      box.append(el('p', 'lede', 'It is on the board. Send this code to anybody who wants to fly it.'));
      box.append(el('p', 'tune-code', made.code));
      const done = el('div', 'name-dialog-row');
      const copy = copyButton(made.code);
      const see = el('a', 'name-dialog-btn', 'See it on the board');
      see.href = tunesPageUrl(made.board);
      see.target = '_blank';
      see.rel = 'noopener';
      const close = btn('name-dialog-btn on', 'Done');
      close.addEventListener('click', finish);
      done.append(copy, see, close);
      box.append(done);
      close.focus();
    } catch (e) {
      sending = false;
      send.disabled = false;
      dismiss.disabled = false;
      send.textContent = 'Share';
      err.textContent = e.message || 'The board could not take that tune.';
    }
  };
  send.addEventListener('click', submit);
  for (const input of [name, notes, pilot]) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
  }
  name.focus();
}

/* ------------------------------------------------------------------ */
/* Load a tune                                                          */
/* ------------------------------------------------------------------ */

export function openTuneLoad(ui, { code = '' } = {}) {
  const box = el('div', 'name-dialog-box bug feel');
  box.append(el('h2', null, 'Load a tune'));
  box.append(el(
    'p',
    'lede',
    'Paste a share code, like k7mq-2xrt-9vwd. You see what is in the tune before anything changes, and you can put your own back.',
  ));
  const entry = field('tune-code-field', { max: 24, placeholder: 'k7mq-2xrt-9vwd', value: code, label: 'Share code' });
  const look = btn('name-dialog-btn on', 'Look it up');
  const lookRow = el('div', 'name-dialog-row');
  lookRow.append(entry, look);
  const err = el('p', 'name-dialog-err', '');
  const preview = el('div', 'tune-preview');
  const row = el('div', 'name-dialog-row');
  const close = btn('name-dialog-btn', 'Close');
  const browse = el('a', 'name-dialog-btn', 'Browse all tunes');
  browse.href = tunesPageUrl();
  browse.target = '_blank';
  browse.rel = 'noopener';
  row.append(browse, close);
  box.append(lookRow, err, preview, row);

  let busy = false;
  const finish = mount(ui, box, () => busy);
  close.addEventListener('click', () => { if (!busy) { finish(); } });

  const show = (tune) => {
    preview.textContent = '';
    preview.append(el('h3', 'tune-preview-name', tune.name));
    preview.append(el(
      'p',
      'lede',
      [tune.author ? `by ${tune.author}` : '', ui.airframeName(tune.airframe), tune.code].filter(Boolean).join(' · '),
    ));
    if (tune.notes) {
      preview.append(el('p', 'lede feel-hint', tune.notes));
    }
    const list = el('ul', 'tune-share-list');
    for (const line of ui.describeTune(tune)) {
      list.append(el('li', null, line));
    }
    preview.append(list);
    const stars = starRow({
      kind: 'setup',
      id: tune.id,
      rating: tune.rating,
      board: tune.board,
    });
    preview.append(stars.wrap);

    const effects = ui.tuneEffects(tune);
    const note = el('p', 'lede feel-hint', effects.join(' '));
    preview.append(note);

    const actions = el('div', 'name-dialog-row');
    const use = btn('name-dialog-btn on', 'Use this tune');
    actions.append(use);
    const mine = readMine().find((x) => x.id === tune.id);
    if (mine) {
      const down = btn('name-dialog-btn', 'Take my tune down');
      down.addEventListener('click', async () => {
        busy = true;
        down.disabled = true;
        down.textContent = 'Taking down';
        try {
          await removeTune({ id: tune.id, editKey: mine.editKey, origin: tune.board });
          forgetMine(tune.id);
          preview.textContent = '';
          err.textContent = 'Taken down. The code no longer works.';
        } catch (e) {
          down.disabled = false;
          down.textContent = 'Take my tune down';
          err.textContent = e.message || 'The board could not take that down.';
        }
        busy = false;
      });
      actions.append(down);
    }
    preview.append(actions);
    use.addEventListener('click', () => {
      const result = ui.applyCommunityTune(tune);
      if (result.error) {
        err.textContent = result.error;
        return;
      }
      err.textContent = '';
      preview.textContent = '';
      preview.append(el('h3', 'tune-preview-name', 'Loaded'));
      preview.append(el('p', 'lede', `${tune.name} is what you are flying now. Put mine back returns your previous settings.`));
      const after = el('div', 'name-dialog-row');
      const back = btn('name-dialog-btn', 'Put mine back');
      back.addEventListener('click', () => {
        ui.undoCommunityTune();
        err.textContent = 'Your previous settings are back.';
        back.hidden = true;
      });
      const done = btn('name-dialog-btn on', 'Done');
      done.addEventListener('click', finish);
      after.append(back, done);
      preview.append(after);
      done.focus();
    });
    use.focus();
  };

  const lookup = async () => {
    if (busy) {
      return;
    }
    err.textContent = '';
    const id = tuneCodeFrom(entry.value);
    if (!id) {
      err.textContent = 'A share code is twelve letters and numbers, like k7mq-2xrt-9vwd.';
      return;
    }
    entry.value = tuneCodeShown(id);
    busy = true;
    look.disabled = true;
    look.textContent = 'Looking';
    preview.textContent = '';
    try {
      show(await fetchTune(id));
    } catch (e) {
      err.textContent = e.status === 404 ? 'No tune has that code.' : (e.message || 'The board could not be reached.');
    }
    busy = false;
    look.disabled = false;
    look.textContent = 'Look it up';
  };
  look.addEventListener('click', lookup);
  entry.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      lookup();
    }
  });
  entry.focus();
  if (tuneCodeFrom(code)) {
    lookup();
  }
}
