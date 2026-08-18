/*
 * ratespanel.js: Configurator-shaped Rateprofile Settings.
 *
 * Table plus graph. Writes CLI keys on the FC draft. Does not run a rate
 * curve of its own in the plant: Max Vel and the plot are previews of
 * fc/rc.c, via src/fc/ratescurve.js.
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
 * along with this software. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  ANGLE_RATE_SAMPLES,
  AXIS_COLOR,
  AXIS_IDS,
  RATES_TYPES,
  angleRateDeg,
  formatDisplay,
  maxVelDeg,
  parseDisplay,
  ratesColumns,
  ratesFromCliMap,
} from '../fc/ratescurve.js';

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

function axisField(axis, col) {
  if (col.id === 'rc_rate') {
    return `${axis}_rc_rate`;
  }
  if (col.id === 'srate') {
    return `${axis}_srate`;
  }
  return `${axis}_expo`;
}

function typeLabel(type) {
  if (type === 'ACTUAL') {
    return 'Actual';
  }
  if (type === 'BETAFLIGHT') {
    return 'Betaflight';
  }
  if (type === 'RACEFLIGHT') {
    return 'Raceflight';
  }
  if (type === 'QUICK') {
    return 'Quick';
  }
  return type;
}

export function mountRatesPanel(handlers) {
  const root = el('div', 'fc-rates');
  root.hidden = true;

  const head = el('div', 'fc-rates-head');
  const typeWrap = el('label', 'fc-rates-type');
  typeWrap.append(el('span', 'fc-rates-type-lab', 'Rates type'));
  const typeSel = el('select', 'fc-rates-type-sel');
  typeSel.setAttribute('aria-label', 'Rates type');
  for (const t of RATES_TYPES) {
    const o = document.createElement('option');
    o.value = t;
    o.textContent = typeLabel(t);
    typeSel.append(o);
  }
  typeWrap.append(typeSel);
  const badge = el('span', 'fc-rates-badge', 'ACTUAL');
  const reset = el('button', 'fc-rates-reset');
  reset.type = 'button';
  reset.setAttribute('aria-label', 'Revert to default rates, Actual 70 centre 670 max no expo');
  reset.append(el('span', 'fc-rates-reset-lab', 'Revert to default rates'));
  reset.append(el('span', 'fc-rates-reset-note', 'Actual 70 centre, 670 max, no expo'));
  reset.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof handlers.onReset === 'function') {
      handlers.onReset();
    }
  });
  head.append(typeWrap, badge, reset);

  const tableWrap = el('div', 'fc-rates-table-wrap');
  const table = document.createElement('table');
  table.className = 'fc-rates-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.append(el('th', 'fc-rates-axis', ''));
  thead.append(headRow);
  table.append(thead);
  const tbody = document.createElement('tbody');
  table.append(tbody);
  tableWrap.append(table);

  const graphWrap = el('div', 'fc-rates-graph-wrap');
  const canvas = document.createElement('canvas');
  canvas.className = 'fc-rates-graph';
  canvas.setAttribute('aria-label', 'Stick to rate curve');
  graphWrap.append(canvas);

  root.append(head, tableWrap, graphWrap);

  const inputs = new Map();
  let lastType = '';
  let lastStick = { roll: 0, pitch: 0, yaw: 0 };
  let model = null;

  function commitType() {
    handlers.onType(typeSel.value);
  }

  typeSel.addEventListener('change', commitType);

  function bindInput(input, key, col) {
    const commit = () => {
      const cli = parseDisplay(col, input.value);
      if (cli == null) {
        handlers.onPaint();
        return;
      }
      handlers.onField(key, String(cli));
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') {
        e.preventDefault();
        input.blur();
        commit();
        e.stopPropagation();
        return;
      }
      if (e.code === 'Escape') {
        return;
      }
      e.stopPropagation();
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    input.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  }

  function rebuildTable(type) {
    const cols = ratesColumns(type);
    headRow.textContent = '';
    headRow.append(el('th', 'fc-rates-axis', ''));
    for (const col of cols) {
      headRow.append(el('th', null, col.label));
    }
    headRow.append(el('th', null, 'Max Vel [deg/s]'));
    tbody.textContent = '';
    inputs.clear();
    for (const axis of AXIS_IDS) {
      const tr = document.createElement('tr');
      tr.className = `fc-rates-row fc-rates-row-${axis}`;
      const lab = el('th', 'fc-rates-axis', axis.toUpperCase());
      lab.scope = 'row';
      tr.append(lab);
      for (const col of cols) {
        const td = document.createElement('td');
        const cell = el('div', 'fc-rates-cell');
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'fc-rates-input';
        input.step = String(col.step);
        input.min = String(col.min);
        input.max = String(col.max);
        input.setAttribute('aria-label', `${axis} ${col.label}`);
        const key = axisField(axis, col);
        bindInput(input, key, col);
        const steps = el('span', 'fc-rates-spin');
        const up = document.createElement('button');
        up.type = 'button';
        up.className = 'fc-rates-spin-btn';
        up.textContent = '▲';
        up.setAttribute('aria-label', `Increase ${axis} ${col.label}`);
        const down = document.createElement('button');
        down.type = 'button';
        down.className = 'fc-rates-spin-btn';
        down.textContent = '▼';
        down.setAttribute('aria-label', `Decrease ${axis} ${col.label}`);
        const nudge = (dir) => {
          const cur = Number(input.value);
          const next = (Number.isFinite(cur) ? cur : col.min) + dir * col.step;
          const cli = parseDisplay(col, String(next));
          if (cli == null) {
            return;
          }
          handlers.onField(key, String(cli));
        };
        up.addEventListener('click', (e) => {
          e.preventDefault();
          nudge(1);
        });
        down.addEventListener('click', (e) => {
          e.preventDefault();
          nudge(-1);
        });
        steps.append(up, down);
        cell.append(input, steps);
        td.append(cell);
        tr.append(td);
        inputs.set(key, { input, col });
      }
      const vel = el('td', 'fc-rates-vel', '');
      vel.dataset.axis = axis;
      tr.append(vel);
      tbody.append(tr);
    }
    lastType = type;
  }

  function fillValues(next) {
    const cols = ratesColumns(next.type);
    for (const axis of AXIS_IDS) {
      for (const col of cols) {
        const key = axisField(axis, col);
        const slot = inputs.get(key);
        if (!slot) {
          continue;
        }
        if (document.activeElement === slot.input) {
          continue;
        }
        const cli = next[axis][col.id === 'rc_rate' ? 'rcRate' : col.id === 'srate' ? 'srate' : 'expo'];
        slot.input.value = formatDisplay(col, cli);
      }
      const vel = tbody.querySelector(`td.fc-rates-vel[data-axis="${axis}"]`);
      if (vel) {
        vel.textContent = String(Math.round(maxVelDeg(next.type, next[axis])));
      }
    }
  }

  function drawGraph(next, stick) {
    const wrap = graphWrap;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = Math.max(160, wrap.clientWidth || 480);
    const cssH = Math.max(160, wrap.clientHeight || 220);
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const maxY = Math.max(
      200,
      maxVelDeg(next.type, next.roll),
      maxVelDeg(next.type, next.pitch),
      maxVelDeg(next.type, next.yaw),
    );
    const padL = 8;
    const padR = 56;
    const padT = 10;
    const padB = 10;
    const gw = cssW - padL - padR;
    const gh = cssH - padT - padB;
    const x0 = padL + gw / 2;
    const y0 = padT + gh / 2;
    const xOf = (stickPos) => x0 + stickPos * (gw / 2);
    const yOf = (deg) => y0 - (deg / maxY) * (gh / 2);

    ctx.fillStyle = '#2e2e2e';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.fillStyle = 'rgba(255, 220, 80, 0.10)';
    const band = gw * 0.08;
    ctx.fillRect(padL, padT, band, gh);
    ctx.fillRect(padL + gw - band, padT, band, gh);

    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, y0);
    ctx.lineTo(padL + gw, y0);
    ctx.moveTo(x0, padT);
    ctx.lineTo(x0, padT + gh);
    ctx.stroke();

    const samples = ANGLE_RATE_SAMPLES;
    for (const axis of AXIS_IDS) {
      ctx.beginPath();
      ctx.strokeStyle = AXIS_COLOR[axis];
      ctx.lineWidth = 2;
      for (let i = 0; i <= samples; i += 1) {
        const s = -1 + (2 * i) / samples;
        const deg = angleRateDeg(next.type, next[axis], s);
        const x = xOf(s);
        const y = yOf(deg);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    ctx.fillStyle = '#9ad0ff';
    ctx.beginPath();
    ctx.arc(x0, y0, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '11px "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8a8a8a';
    ctx.textAlign = 'left';
    ctx.fillText('0 deg/s', padL + 8, y0 - 12);
    for (const axis of AXIS_IDS) {
      const vel = Math.round(maxVelDeg(next.type, next[axis]));
      ctx.fillStyle = AXIS_COLOR[axis];
      ctx.fillText(`${vel}`, padL + gw + 6, yOf(vel));
    }

    if (stick) {
      for (const axis of AXIS_IDS) {
        const s = Math.max(-1, Math.min(1, stick[axis] || 0));
        const deg = angleRateDeg(next.type, next[axis], s);
        ctx.fillStyle = AXIS_COLOR[axis];
        ctx.beginPath();
        ctx.arc(xOf(s), yOf(deg), 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function paint(session, stick) {
    const next = ratesFromCliMap(session.cliMapCached());
    model = next;
    if (typeSel.value !== next.type) {
      typeSel.value = next.type;
    }
    badge.textContent = next.type;
    badge.className = `fc-rates-badge fc-rates-badge-${next.type.toLowerCase()}`;
    if (lastType !== next.type) {
      rebuildTable(next.type);
    }
    fillValues(next);
    lastStick = stick || lastStick;
    drawGraph(next, lastStick);
  }

  function paintStick(stick) {
    if (!model || root.hidden) {
      return;
    }
    lastStick = stick || lastStick;
    drawGraph(model, lastStick);
  }

  return { root, paint, paintStick };
}
