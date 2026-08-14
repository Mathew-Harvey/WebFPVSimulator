/*
 * app.js: the public board page.
 *
 * Cards for every published course. Expanding a card fetches that course's
 * times. Fly this course opens the simulator with ?share=id, which is the
 * whole of the link between the two sites.
 *
 * This file is part of WebFPVLeaderboard.
 *
 * WebFPVLeaderboard is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
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

function formatTime(ms) {
  if (ms == null || !Number.isFinite(ms)) {
    return '--.--';
  }
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  if (m > 0) {
    return `${m}:${s.toFixed(2).padStart(5, '0')}`;
  }
  return s.toFixed(2);
}

function formatWhen(iso) {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function flyHref(simOrigin, boardOrigin, id) {
  const board = encodeURIComponent(boardOrigin);
  return `${simOrigin}/?map=custom&share=${encodeURIComponent(id)}&board=${board}`;
}

/*
 * A tiny plan of the field. Grass, a cream boundary, gates as amber
 * frames, start pads as mint chevrons. Enough to recognise a course
 * without building a world.
 */
function drawPlan(canvas, plan) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3d6a36';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#4e7b3c';
  for (let i = 0; i < 18; i += 1) {
    const x = ((i * 47) % w);
    const y = ((i * 29) % h);
    ctx.fillRect(x, y, 18, 10);
  }
  if (!plan) {
    return;
  }
  const pad = 10;
  const sx = (plan.width > 0) ? (w - pad * 2) / plan.width : 1;
  const sy = (plan.depth > 0) ? (h - pad * 2) / plan.depth : 1;
  const s = Math.min(sx, sy);
  const ox = (w - plan.width * s) / 2;
  const oy = (h - plan.depth * s) / 2;
  ctx.strokeStyle = '#dcd6ca';
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, plan.width * s, plan.depth * s);
  for (const mark of plan.marks || []) {
    const x = ox + mark.x * s;
    const y = oy + (plan.depth - mark.y) * s;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-(mark.yaw || 0));
    if (mark.type === 'startPads') {
      ctx.fillStyle = '#7dffb4';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(5, 5);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
    } else if (mark.type === 'flag' || mark.type === 'cone') {
      ctx.fillStyle = mark.type === 'flag' ? '#f7e8cd' : '#ffd45c';
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (mark.type === 'barrier') {
      ctx.fillStyle = '#dcd6ca';
      ctx.fillRect(-10, -2, 20, 4);
    } else {
      ctx.strokeStyle = '#ffd45c';
      ctx.lineWidth = 2;
      ctx.strokeRect(-6, -5, 12, 10);
    }
    ctx.restore();
  }
}

function cardFor(track, config) {
  const card = el('article', 'card');
  card.dataset.id = track.id;

  const bar = el('div', 'gate-bar');
  bar.append(el('div', 'roundel', '1'));
  card.append(bar);

  const head = el('div', 'card-head');
  const canvas = document.createElement('canvas');
  canvas.className = 'plan';
  canvas.width = 240;
  canvas.height = 160;
  drawPlan(canvas, track.plan);

  const meta = el('div', 'meta');
  meta.append(el('h2', null, track.name));
  const by = el('p', 'by');
  by.append('by ');
  const author = el('b', null, track.author);
  by.append(author);
  meta.append(by);
  const chips = el('div', 'chips');
  chips.append(el('span', 'chip', `${track.gates} gate${track.gates === 1 ? '' : 's'}`));
  if (track.hasLogo) {
    chips.append(el('span', 'chip', 'Logo on the flags'));
  }
  if (track.best) {
    chips.append(el('span', 'chip best', `Best ${formatTime(track.best.lapMs)}  ${track.best.name}`));
  } else {
    chips.append(el('span', 'chip', 'No time yet'));
  }
  meta.append(chips);

  const actions = el('div', 'card-actions');
  const fly = el('a', 'btn primary', 'Fly this course');
  fly.href = flyHref(config.simOrigin, config.boardOrigin, track.id);
  fly.target = '_blank';
  fly.rel = 'noopener';
  fly.addEventListener('click', (e) => e.stopPropagation());
  const more = el('button', 'btn', 'Leaderboard');
  more.type = 'button';
  actions.append(fly, more);

  head.append(canvas, meta, actions);
  card.append(head);

  const board = el('div', 'board');
  board.append(el('p', 'none', 'Open to load the times.'));
  card.append(board);

  const open = async () => {
    const was = card.classList.contains('open');
    document.querySelectorAll('.card.open').forEach((n) => n.classList.remove('open'));
    if (was) {
      more.textContent = 'Leaderboard';
      return;
    }
    card.classList.add('open');
    more.textContent = 'Close';
    board.textContent = '';
    board.append(el('p', 'none', 'Loading times.'));
    try {
      const detail = await fetch(`/api/tracks/${encodeURIComponent(track.id)}`).then((r) => r.json());
      board.textContent = '';
      if (!detail.times || !detail.times.length) {
        board.append(el('p', 'none', 'No times yet. Fly the course and post one under your name.'));
        return;
      }
      const table = document.createElement('table');
      const headRow = document.createElement('tr');
      for (const label of ['Rank', 'Name', 'Time', 'Posted']) {
        headRow.append(el('th', null, label));
      }
      const thead = document.createElement('thead');
      thead.append(headRow);
      table.append(thead);
      const body = document.createElement('tbody');
      detail.times.forEach((row, i) => {
        const tr = document.createElement('tr');
        tr.append(el('td', 'rank', String(i + 1)));
        tr.append(el('td', null, row.name));
        tr.append(el('td', 'time', formatTime(row.lapMs)));
        tr.append(el('td', 'when', formatWhen(row.postedUtc)));
        body.append(tr);
      });
      table.append(body);
      board.append(table);
    } catch (e) {
      board.textContent = '';
      board.append(el('p', 'none', e.message || 'Could not load those times.'));
    }
  };

  head.addEventListener('click', open);
  more.addEventListener('click', (e) => {
    e.stopPropagation();
    open();
  });
  return card;
}

async function start() {
  const host = document.getElementById('list');
  try {
    const config = await fetch('/api/config').then((r) => r.json());
    const sim = document.getElementById('sim-link');
    const builder = document.getElementById('builder-link');
    if (sim) {
      sim.href = `${config.simOrigin}/`;
    }
    if (builder) {
      builder.href = `${config.simOrigin}/src/trackbuilder/index.html`;
    }
    const payload = await fetch('/api/tracks').then((r) => r.json());
    const tracks = payload.tracks || [];
    host.textContent = '';
    if (!tracks.length) {
      host.append(el('div', 'empty', 'No courses on the board yet. Open the track builder, place a flying order, and press Publish. The copy that lands here includes the logo on the gates and flags.'));
      return;
    }
    for (const track of tracks) {
      host.append(cardFor(track, config));
    }
  } catch (e) {
    host.textContent = '';
    host.append(el('div', 'status', e.message || 'The board could not be loaded.'));
  }
}

start();
