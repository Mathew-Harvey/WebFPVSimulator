/*
 * minigames-check.js: the mini games flown solo in the real page, in
 * headless Chromium. The game modules have their own Node checks
 * (scripts/dogfight-selftest.js, scripts/ribbons-selftest.js) and the room
 * versions are in scripts/together-shots.js; this one is the seams between
 * a game and the shell that neither can see: a pop putting the pilot back,
 * a round ending and the next one starting, leaving, a restart, a quad of
 * another size, and the results table's buttons.
 *
 *   node scripts/minigames-check.js [--only=menu,load,yard,touch,herd,driftbots,goats,drift,dogfight,ribbon,scale]
 *
 * Minutes of wall clock on a software rasteriser. Written for the bug hunt
 * of 2026-10-29 ("Across all games before we push to main, please do a bug
 * hunt and polish run").
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { answerQuadPicker, openPage } from '../tests/lib/page.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const only = new Set((process.argv.find((a) => a.startsWith('--only=')) || '--only=').slice(7).split(',').filter(Boolean));
const wanted = (name) => !only.size || only.has(name);

const sleep = (ms) => new Promise((r) => {
  setTimeout(r, ms);
});

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  PASS  ${name}${detail ? `: ${detail}` : ''}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
  }
}

/* A page on `map`, flying, past the quad picker. */
async function flying(map, craft = '5inch') {
  const page = await openPage({ root: ROOT, width: 800, height: 450, url: `/index.html?map=${map}&craft=${craft}&fly=1` });
  const ev = async (body) => {
    const r = await page.cdp.send('Runtime.evaluate', {
      expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true,
    }, page.sessionId);
    if (r.exceptionDetails) {
      throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
    }
    return r.result.value;
  };
  const until = async (body, ms = 20000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await ev(body)) {
        return true;
      }
      await sleep(200);
    }
    return false;
  };
  if (!(await until('return !!window.__shellReady', 120000))) {
    throw new Error('the shell never came up');
  }
  if (!(await until(`const m = window.__map ? window.__map() : null; return Boolean(m && m.ready && m.id === '${map}');`, 150000))) {
    throw new Error(`${map} never became ready`);
  }
  await answerQuadPicker(page, 60000).catch(() => {});
  await until("return window.__ui.screen === 'flight'", 20000);
  return { page, ev, until };
}

/* Errors the page logged that are not the board being away. */
function pageErrors(page) {
  return page.errors.filter((e) => !/api\/|ERR_CONNECTION_REFUSED|Failed to load resource/.test(e));
}

const G = 'const g = window.__dogfight();';

async function sceneDogfight() {
  console.log('dogfight: solo on the town');
  const { page, ev, until } = await flying('city');
  try {
    await ev("window.__ui.dogfight = { bots: 2, skill: 'rookie', round: '3m', hits: 'arcade' }; return 1;");
    check('the fight is built once its modules land', await until('return Boolean(window.__dogfight())', 20000));
    check('the gun is live while it flies', await ev('return window.__input.weaponsLive === true'));
    await ev('window.__stick(0, 0, 0, 0.7); return 1;');
    check('taking off starts the round', await until(`${G} return g.startedMs >= 0;`, 20000));
    const finite = await ev(`${G} for (let i = 0; i < g.cap; i += 1) { if (!Number.isFinite(g.x[i] + g.y[i] + g.z[i])) return false; } return true;`);
    check('every slot is somewhere real', finite);

    /* A pop of the pilot: back at the spawn, out for the wait, then whole. */
    await ev(`${G} g.shieldUntil[0] = 0; g.damage(0, 1, 500, 'gun', g.x[0], g.y[0], g.z[0]); return 1;`);
    check('a pop takes the pilot out', await until(`${G} return g.alive[0] === 0;`, 3000));
    check('and the HUD says so', await until("return !document.querySelector('.df-pop').classList.contains('is-off')", 3000));
    check('and back in once the wait is over', await until(`${G} return g.alive[0] === 1 && g.hp[0] === g.hpMax;`, 30000));

    /* The round ends: the table, then a new round on its own. */
    const round = await ev(`${G} return g.round;`);
    await ev(`${G} g.roundMs = g.clockMs - g.startedMs + 30; return 1;`);
    check('the clock running out ends the round', await until(`${G} return g.over;`, 10000));
    check('and the table is up', await until("return !document.querySelector('.df-result').classList.contains('is-off')", 3000));
    const buttons = await ev("return [...document.querySelectorAll('.df-result .df-btn')].map((b) => b.textContent)");
    check('a solo table has Again, Change the fight and Leave', ['Again', 'Change the fight', 'Leave'].every((b) => buttons.includes(b)), buttons.join(', '));
    await ev("[...document.querySelectorAll('.df-result .df-btn')].find((b) => b.textContent === 'Again').click(); return 1;");
    check('Again starts the next round', await until(`${G} return !g.over && g.round === ${round + 1};`, 5000));
    check('and puts the table away', await until("return document.querySelector('.df-result').classList.contains('is-off')", 3000));

    /* A restart is a fresh round. */
    const r2 = await ev(`${G} return g.round;`);
    await ev("window.__ui.act('restart'); return 1;");
    check('a restart starts a fresh round', await until(`${G} return g.round === ${r2 + 1};`, 10000));

    /* Quit to title is the end of the fight too, not a fight behind the
     * menus waiting for the next Fly. */
    await ev("window.__ui.act('pause'); window.__ui.act('title'); return 1;");
    check('quit to title ends the fight', await until('return window.__dogfight() === null && window.__ui.dogfight === null', 5000));
    await ev("window.__ui.dogfight = { bots: 1, skill: 'rookie', round: '3m', hits: 'arcade' }; window.__ui.act('fly'); return 1;");
    await until("return Boolean(window.__dogfight()) && window.__ui.screen === 'flight'", 20000);

    /* Leaving: nothing of the fight is left behind. */
    await ev("window.__ui.act('pause'); window.__ui.act('fight-leave'); return 1;");
    check('leaving ends the fight', await until('return window.__dogfight() === null', 5000));
    check('the gun is not live once it has gone', await ev('return window.__input.weaponsLive === false'));
    check('and its HUD is hidden', await ev("return document.querySelector('.df-hud').classList.contains('is-off')"));
    const errs = pageErrors(page);
    check('no errors on the page', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }
}

async function sceneRibbon() {
  console.log('ribbon: solo on the town');
  const { page, ev, until } = await flying('city');
  try {
    await ev("window.__ui.dogfight = { game: 'ribbon', bots: 2, skill: 'rookie', length: 'normal', round: '2m' }; return 1;");
    check('ribbon cutting is built', await until(`${G} return Boolean(g && g.rCount);`, 20000));
    check('nothing is fired in ribbon cutting', await ev('return window.__input.weaponsLive === false'));
    await ev('window.__stick(0, 0, 0, 0.7); return 1;');
    check('taking off starts the round', await until(`${G} return g.startedMs >= 0;`, 20000));
    await ev("window.__ui.act('pause'); window.__ui.act('fight-leave'); return 1;");
    check('leaving ends it', await until('return window.__dogfight() === null', 5000));
    const errs = pageErrors(page);
    check('no errors on the page', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }
}

/*
 * GOAT HERDING WITH BOTS (src/game/goatround.js): a round on the goat map,
 * the bots herding for real, a goat home counted to whoever pushed it, the
 * table at the end, and nothing left on the herd once it is left.
 */
async function sceneHerd() {
  console.log('herd: goat herding with bots');
  const { page, ev, until } = await flying('goats');
  try {
    await ev("window.__ui.dogfight = { game: 'goats', bots: 3, skill: 'ace', round: '3m' }; return 1;");
    check('the round is built on the map\'s herd', await until(`${G} return Boolean(g && g.herd && g.total === g.herd.count);`, 30000));
    check('nothing is fired in goat herding', await ev('return window.__input.weaponsLive === false'));
    check('the round\'s HUD is up and the map\'s own steps aside', await until("return !document.querySelector('.df-hud').classList.contains('is-off') && document.querySelector('.goat-hud').classList.contains('is-off')", 5000));
    check('the herd is handed the bots', await ev(`${G} return g.pen.nOthers === 3 && g.pen.others[2] < 1e8 && g.pen.others[8] < 1e8;`));
    await ev('window.__stick(0, 0, 0, 0.7); return 1;');
    check('taking off starts the round', await until(`${G} return g.startedMs >= 0;`, 20000));
    const finite = await ev(`${G} for (let i = 0; i < g.cap; i += 1) { if (!Number.isFinite(g.x[i] + g.y[i] + g.z[i])) return false; } return true;`);
    check('every slot is somewhere real', finite);
    /* One of the pilot's: a goat put in the garage as the pilot's. */
    await ev(`${G} const h = g.herd; let n = 0; while (h.MODE[n] === 2) n += 1; h.BY[n] = 0; h.place(n, 15.9, 4); return 1;`);
    check('a goat home that the pilot moved is the pilot\'s', await until(`${G} return g.pops[0] === 1;`, 5000));
    check('and the HUD counts it', await until("return document.querySelector('.df-me-panel em').textContent === '1'", 3000));
    /* A headless page flies slower than the wall clock, a fifth as fast
     * here, so this waits on the round's own clock: a minute and a half of
     * it, which is a dozen goats' worth in scripts/goats-check.js. */
    const bots = await until(`${G} return g.pops[1] + g.pops[2] + g.pops[3] > 0 || g.clockMs - g.startedMs > 90000;`, 600000);
    const botGoats = await ev(`${G} return g.pops[1] + g.pops[2] + g.pops[3];`);
    const roundS = await ev(`${G} return ((g.clockMs - g.startedMs) / 1000).toFixed(0);`);
    check('the bots herd goats home on their own', bots && botGoats > 0, `${botGoats} home by ${roundS} s of the round`);
    const low = await ev(`${G} let n = 0; for (let s = 1; s <= 3; s += 1) { if (g.y[s] / g.plan.S < 3.2) n += 1; } return n;`);
    check('and none of them is lost in a solid', await ev(`${G} for (let s = 1; s <= 3; s += 1) { if (g.world.inside(g.x[s], g.y[s], g.z[s])) return false; } return true;`), `${low} of 3 down low herding`);
    await ev(`${G} g.roundMs = g.clockMs - g.startedMs + 30; return 1;`);
    check('the clock running out ends the round', await until(`${G} return g.over;`, 10000));
    check('and the table is up', await until("return !document.querySelector('.df-result').classList.contains('is-off')", 3000));
    const buttons = await ev("return [...document.querySelectorAll('.df-result .df-btn')].map((b) => b.textContent)");
    check('with Again, Change the round and Leave', ['Again', 'Change the round', 'Leave'].every((b) => buttons.includes(b)), buttons.join(', '));
    const top = await ev(`${G} const r = g.standings(); return r[0].goats >= r[1].goats && (g.winner < 0 || g.winner === r[0].slot);`);
    check('the most goats is first, and the winner', top);
    await ev("[...document.querySelectorAll('.df-result .df-btn')].find((b) => b.textContent === 'Again').click(); return 1;");
    check('Again starts the next round with a fresh herd', await until(`${G} return !g.over && g.pops[0] === 0 && g.herd.homeCount() === 0;`, 5000));
    await ev("window.__ui.act('pause'); window.__ui.show('paused'); return 1;");
    const rows = await ev("return window.__ui.items().map((i) => i.label).join(',')");
    check('the pause has the round\'s rows', rows.includes('Change the round') && rows.includes('Leave the round'), rows);
    await ev(`${G} window.__pen = g.pen; window.__ui.act('fight-leave'); return 1;`);
    check('leaving ends the round', await until('return window.__dogfight() === null', 5000));
    check('and the herd has no bots left in it', await ev('return window.__pen.nOthers === 0'));
    check('and the map\'s own HUD is back', await until("return !document.querySelector('.goat-hud').classList.contains('is-off')", 5000));
    const errs = pageErrors(page);
    check('no errors on the page', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }
}

/* The fight is read in the aircraft's own metres through the world scale.
 * A quad of another size on the same map (the room host's swap, the quad
 * picker on a map already loaded) moves the scale under it. */
async function sceneScale() {
  console.log('scale: the fight follows the world scale');
  const { page, ev, until } = await flying('house');
  try {
    await ev("window.__ui.dogfight = { bots: 2, skill: 'pilot', round: '3m', hits: 'arcade' }; return 1;");
    await until('return Boolean(window.__dogfight())', 20000);
    const before = await ev(`${G} return g.world.k;`);
    await ev('window.__forceWorldScale(1 / 3.5); return 1;');
    const after = await until(`${G} return Boolean(g) && Math.abs(g.world.k - 3.5 * ${before}) < 1e-6;`, 8000);
    check('a new scale builds the fight again at it', after, `k ${await ev(`${G} return g ? g.world.k : null;`)}, want ${3.5 * before}`);
    await ev('window.__forceWorldScale(null); return 1;');
    check('and back', await until(`${G} return Boolean(g) && Math.abs(g.world.k - ${before}) < 1e-6;`, 8000));
  } finally {
    await page.close();
  }
}

/* A fight on a map that has its own game: the goat map's herd, and Drift
 * Matsuri's take. The fight is the game being played, so the map's HUD
 * steps aside while it lasts and comes back when it ends. */
async function sceneMapGame(map, hud) {
  console.log(`${map}: a fight on a map with its own game`);
  const { page, ev, until } = await flying(map);
  try {
    check(`the map's own HUD is up before the fight (${hud})`, await until(`return !document.querySelector('.${hud}').classList.contains('is-off')`, 10000));
    await ev("window.__ui.dogfight = { bots: 1, skill: 'rookie', round: '3m', hits: 'arcade' }; return 1;");
    await until('return Boolean(window.__dogfight())', 20000);
    check('and steps aside while the fight is on', await until(`return document.querySelector('.${hud}').classList.contains('is-off')`, 5000));
    check('the fight marks the layer, so the first flights\' tips sit under its score', await ev("return document.querySelector('.df-hud').parentNode.classList.contains('df-on')"));
    await ev("window.__ui.act('pause'); window.__ui.act('fight-leave'); return 1;");
    await until('return window.__dogfight() === null', 5000);
    check('and comes back when the fight ends', await until(`return !document.querySelector('.${hud}').classList.contains('is-off')`, 5000));
    check('the layer is unmarked', await ev("return !document.querySelector('.df-hud').parentNode.classList.contains('df-on')"));
    const errs = pageErrors(page);
    check('no errors on the page', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }
}

/*
 * THE MINI GAMES PAGE's ways in and back (the owner, 2026-10-29: "Make
 * sure all the menu systems are complete"). Every panel, alone and with
 * friends where a page can host without a board, opens its game's way in,
 * and Escape from there walks back to the page on that panel, never to the
 * plain title menu. Goat herding's flight, quit to title, is back on the
 * page too.
 */
async function sceneMenu() {
  console.log('menu: the Mini games page');
  const page = await openPage({ root: ROOT, width: 1280, height: 720, url: '/index.html' });
  const ev = async (body) => {
    const r = await page.cdp.send('Runtime.evaluate', {
      expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true,
    }, page.sessionId);
    if (r.exceptionDetails) {
      throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
    }
    return r.result.value;
  };
  const until = async (body, ms = 20000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await ev(body)) {
        return true;
      }
      await sleep(200);
    }
    return false;
  };
  const onPage = (card) => `const u = window.__ui; return u.screen === 'title' && u.onGate() && u.gatePageNow() === 'games' && (u.items()[u.cursor] || {}).card === '${card}';`;
  try {
    check('the title is up', await until("return Boolean(window.__ui && window.__ui.screen === 'title' && window.__ui.onGate())", 120000));
    check('the cover has Mini games', await ev("return window.__ui.items().some((i) => i.card === 'games')"));
    await ev("window.__ui.act('gate-games'); return 1;");
    check('Mini games turns to its page', await until("return window.__ui.gatePageNow() === 'games'", 5000));
    const cards = await ev("return window.__ui.items().map((i) => i.card).join(',')");
    check('with the switch and four games', cards === 'mg-switch,mg-dogfight,mg-ribbon,mg-goats,mg-drift', cards);
    const play = async (card, friends) => {
      await ev(`const u = window.__ui; if (Boolean(u.gameFriends) !== ${friends}) u.act('mg-friends'); u.setCursor(u.items().findIndex((i) => i.card === '${card}')); u.select(); return 1;`);
    };
    for (const [card, friends, open, escs] of [
      ['mg-dogfight', false, "Boolean(window.__ui.fightPick && window.__ui.fightPick.game === 'dogfight')", 1],
      ['mg-ribbon', false, "Boolean(window.__ui.fightPick && window.__ui.fightPick.game === 'ribbon')", 1],
      ['mg-goats', false, "Boolean(document.querySelector('.qp-page'))", 2],
      ['mg-drift', false, "Boolean(document.querySelector('.qp-page'))", 2],
      ['mg-dogfight', true, "Boolean(window.__ui.hostPick && window.__ui.hostPick.game === 'dogfight')", 1],
      ['mg-ribbon', true, "Boolean(window.__ui.hostPick && window.__ui.hostPick.game === 'ribbon')", 1],
    ]) {
      const name = `${card.slice(3)}${friends ? ' with friends' : ''}`;
      await play(card, friends);
      check(`${name} opens its way in`, await until(`return ${open}`, 30000));
      for (let i = 0; i < escs; i += 1) {
        await sleep(500);
        await page.tap('Escape');
      }
      check(`and Escape${escs > 1 ? ' twice' : ''} is back on the page, on ${name}`, await until(onPage(card), 5000));
    }
    await play('mg-goats', false);
    check('goat herding alone opens Set the herd', await until("return Boolean(document.querySelector('.df-page'))", 30000));
    await sleep(450);
    await page.tap('Enter');
    await until("return Boolean(document.querySelector('.qp-page:not(.df-page)'))", 30000);
    await sleep(450);
    await page.tap('Enter');
    check('goat herding flies from the page', await until("return window.__ui.screen === 'flight'", 150000));
    check('as a round with bots', await until("const g = window.__dogfight(); return Boolean(g && g.herd && window.__ui.dogfight.game === 'goats');", 30000));
    await ev("window.__ui.act('pause'); window.__ui.show('paused'); window.__ui.act('title'); return 1;");
    check('and quit to title is back on the page, on goat herding', await until(onPage('mg-goats'), 5000));
    const errs = pageErrors(page);
    check('no errors on the page', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }
}

/*
 * The yard track's HUD (src/ui/yardhud.js), on the maps that have one, up
 * by the spawn once the quad is in the air: "Whoop only: land in the white
 * box" sat over a ribbon round's results on Bardwell's house in the room
 * check's pictures of 2026-10-29, the way the goat and film HUDs did
 * before the bug hunt put them aside. A fight is the game being played.
 */
async function sceneYard() {
  console.log('yard: the yard track\'s HUD steps aside for a fight');
  const { page, ev, until } = await flying('bardwell');
  try {
    await ev('window.__stick(0, 0, 0, 0.62); return 1;');
    check('the yard HUD is up once the quad is in the air', await until("return !document.querySelector('.yard-hud').classList.contains('is-off')", 15000));
    await ev("window.__ui.dogfight = { game: 'ribbon', bots: 1, skill: 'rookie', length: 'normal', round: '2m' }; return 1;");
    await until('return Boolean(window.__dogfight())', 20000);
    check('and steps aside while the fight is on', await until("return document.querySelector('.yard-hud').classList.contains('is-off')", 5000));
    await ev("window.__ui.act('pause'); window.__ui.act('fight-leave'); return 1;");
    await until('return window.__dogfight() === null', 5000);
    await ev("window.__ui.act('resume'); window.__stick(0, 0, 0, 0.62); return 1;");
    check('and comes back when the fight ends', await until("return !document.querySelector('.yard-hud').classList.contains('is-off')", 15000));
    const errs = pageErrors(page);
    check('no errors on the page', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }
}

/*
 * On the glass, in a dogfight: the GUN and MISSILE buttons sit beside the
 * right thumb plate, as the mockup drew them (/mnt/project-files/dogfight/
 * shots/phone.png), not on it. They were placed in fixed pixels and sat on
 * the plate, so a thumb landing on its left half fired instead of steering
 * (2026-10-29). The health panel draws over the left plate's corner and
 * takes no touches (pointer-events none), so only the buttons are held to
 * this.
 */
async function sceneTouch() {
  for (const [w, h] of [[844, 390], [390, 844], [1024, 768]]) {
    console.log(`touch: a dogfight on the glass at ${w} by ${h}`);
    const page = await openPage({ root: ROOT, width: w, height: h, touch: true, url: '/index.html?map=city&fly=1' });
    const ev = async (body) => {
      const r = await page.cdp.send('Runtime.evaluate', { expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true }, page.sessionId);
      if (r.exceptionDetails) {
        throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
      }
      return r.result.value;
    };
    const until = async (body, ms = 20000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (await ev(body)) {
          return true;
        }
        await sleep(200);
      }
      return false;
    };
    try {
      if (!(await until("const m = window.__map ? window.__map() : null; return Boolean(window.__shellReady && m && m.ready && m.id === 'city');", 150000))) {
        throw new Error('the town never became ready');
      }
      await answerQuadPicker(page, 60000).catch(() => {});
      await until("return window.__ui.screen === 'flight'", 20000);
      await ev("window.__ui.dogfight = { bots: 1, skill: 'rookie', round: '3m', hits: 'arcade' }; return 1;");
      await until('return Boolean(window.__dogfight())', 20000);
      await until("const g = document.querySelector('.df-fire.is-gun'); return Boolean(g && g.getBoundingClientRect().width > 0);", 5000);
      const crossing = await ev(`const R = (e) => e.getBoundingClientRect();
        const plates = [...document.querySelectorAll('.touch-plate')].filter((e) => R(e).width > 0).map(R);
        const mine = ['.df-fire.is-gun', '.df-fire.is-missile'].map((q) => [q, document.querySelector(q)]).filter(([, e]) => e && R(e).width > 0);
        const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        const off = mine.filter(([, e]) => R(e).left < 0 || R(e).right > innerWidth || R(e).top < 0 || R(e).bottom > innerHeight).map(([q]) => q);
        return JSON.stringify({ plates: plates.length, mine: mine.length, over: mine.filter(([, e]) => plates.some((p) => hit(R(e), p))).map(([q]) => q), off });`);
      const cr = JSON.parse(crossing);
      check(`the fire buttons are clear of both thumb plates, and on the glass`, cr.plates === 2 && cr.mine === 2 && cr.over.length === 0 && cr.off.length === 0, crossing);
      const errs = pageErrors(page);
      check('no errors on the page', errs.length === 0, errs.slice(0, 3).join(' | '));
    } finally {
      await page.close();
    }
  }
}

/*
 * A key pressed while the world is building. The quad picker's Fly starts
 * the map's load, and the loading screen covers the title, but the title
 * was still taking keys behind it: a second Enter (a pad's A pressed twice,
 * a key held) chose whatever row the hidden menu had under its cursor, and
 * on a phone sized window that row is Fly together, so a solo ribbon round
 * opened under "This is you" and the room's pages. Found 2026-10-29 walking
 * the Mini games page; the fix is in main.js, input.onKey and the pad poll.
 */
async function sceneLoadKeys() {
  console.log('load: keys while the world builds act on nothing');
  const page = await openPage({ root: ROOT, width: 844, height: 390, touch: true, url: '/index.html' });
  const ev = async (body) => {
    const r = await page.cdp.send('Runtime.evaluate', { expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true }, page.sessionId);
    if (r.exceptionDetails) {
      throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
    }
    return r.result.value;
  };
  const until = async (body, ms = 20000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await ev(body)) {
        return true;
      }
      await sleep(100);
    }
    return false;
  };
  try {
    if (!(await until('return !!window.__shellReady', 120000)) || !(await until("return window.__ui.screen === 'title'", 60000))) {
      throw new Error('the shell never came up');
    }
    await sleep(1000);
    await ev("window.__ui.act('gate-games'); window.__ui.act('gate-ribbon'); return 1;");
    await until("return window.__ui.screen === 'freestyle'", 10000);
    await sleep(800);
    /* A phone has no double click, so the band over the picker says tap. */
    const band = await ev("const b = document.querySelector('.host-band-line'); return b ? b.textContent : '';");
    check('on a phone the picker\'s band says tap, not double click', band.includes('Tap a map') && !/double click/i.test(band), band);
    let loading = false;
    for (let i = 0; i < 8 && !loading; i += 1) {
      await page.tap('Enter');
      loading = await until('return Boolean(window.__loading && window.__loading.visible)', 1200);
    }
    check('Enter through the arena, Set the ribbons and the quad picker builds the town', loading);
    await page.tap('Enter');
    await sleep(300);
    await page.tap('Enter');
    check('the round starts once the town is built', await until("return window.__ui.screen === 'flight' && Boolean(window.__dogfight())", 150000),
      await ev('return window.__ui.screen'));
    await sleep(1500);
    const sheet = await ev("return [...document.querySelectorAll('#tg .sheet')].filter((e) => e.getBoundingClientRect().width > 0).length");
    check('and the keys pressed while it built opened nothing', sheet === 0 && await ev("return window.__ui.screen === 'flight'"),
      `${sheet} sheets, screen ${await ev('return window.__ui.screen')}`);
    const errs = pageErrors(page);
    check('no errors on the page', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }
}

/*
 * Drift Matsuri with bots (src/game/driftround.js): the owner's ask of
 * 2026-10-29, bots in every mini game, and best reel wins. The round is
 * built on the map's judge, the viewfinder stays up under the round's
 * HUD, the bots go to the cars and score their own takes on the map's
 * judge, and the end of the take ends the round with a table.
 */
async function sceneDriftBots() {
  console.log('driftbots: Drift Matsuri with bots');
  const { page, ev, until } = await flying('drift');
  try {
    await ev("window.__ui.dogfight = { game: 'drift', bots: 3, skill: 'ace' }; return 1;");
    check('the round is built on the map\'s judge', await until(`${G} return Boolean(g && g.film && g.driftRules && g.driftRules.bots === 3);`, 30000));
    check('nothing is fired in Drift Matsuri', await ev('return window.__input.weaponsLive === false'));
    await ev('window.__stick(0, 0, 0, 0.62); return 1;');
    check('taking off starts the round', await until(`${G} return g.startedMs >= 0;`, 20000));
    check('the viewfinder stays up under the round\'s HUD', await until("return !document.querySelector('.df-hud').classList.contains('is-off') && !document.querySelector('.film-hud').classList.contains('is-off')", 5000));
    /* Twenty seconds of the round's own clock: the bots on their cars. */
    await until(`${G} return g.clockMs - g.startedMs > 20000;`, 400000);
    const near = await ev(`${G} const P = g.pen.poses(); const out = []; for (let i = 1; i <= 3; i += 1) { const c = g.dCar[i]; if (c < 0) { out.push(-1); continue; } const p = P[g.film.cars[c].slot]; out.push(Math.hypot(p.x - g.x[i], p.z - g.z[i])); } return out;`);
    check('every bot is on a car', near.every((d) => d >= 0 && d < 20), near.map((d) => d.toFixed(1)).join(' '));
    const scores = await ev(`${G} return [1, 2, 3].map((i) => g.pops[i]);`);
    check('and films it: each bot\'s take scores on the map\'s judge', scores.every((x) => x > 0), scores.join(' '));
    const finite = await ev(`${G} for (let i = 0; i < g.cap; i += 1) { if (!Number.isFinite(g.x[i] + g.y[i] + g.z[i])) return false; } return true;`);
    check('every slot is somewhere real', finite);
    /* The end of the take, without waiting the rest of the minute. */
    await ev(`${G} g.takeFrom -= 61000; window.__filmCut(); return 1;`);
    const ended = await until(`${G} return g.over;`, 10000);
    check('the end of every take ends the round', ended, ended ? '' : JSON.stringify(await ev(`${G} return { screen: window.__ui.screen, mode: window.__mode, now: g.clockMs, over: g.over, started: g.startedMs, from: g.takeFrom, clock: g.clockMs, film: g.film.done, films: g.films.map((f) => (f ? f.done : null)), fight: [...g.inFight], bots: [...g.isBot] };`)));
    check('and the table is up', await until("return !document.querySelector('.df-result').classList.contains('is-off')", 3000));
    const table = await ev("return document.querySelector('.df-result').textContent");
    check('with every take\'s reel and grade', /REEL/.test(table) && /GRADE/.test(table), table.slice(0, 160));
    const top = await ev(`${G} const r = g.standings(); return r.length === 4 && r[0].reel >= r[1].reel && (g.winner < 0 || g.winner === r[0].slot);`);
    check('the best reel is first, and the winner', top);
    await ev("[...document.querySelectorAll('.df-result .df-btn')].find((b) => b.textContent === 'Again').click(); return 1;");
    check('Again starts a fresh take', await until(`${G} return !g.over && g.pops[1] === 0 && !g.film.done;`, 5000));
    await ev("window.__ui.act('pause'); window.__ui.show('paused'); return 1;");
    const rows = await ev("return window.__ui.items().map((i) => i.label).join(',')");
    check('the pause has the round\'s rows', rows.includes('Change the round') && rows.includes('Leave the round'), rows);
    await ev("window.__ui.act('fight-leave'); return 1;");
    check('leaving ends the round', await until('return window.__dogfight() === null', 5000));
    const errs = pageErrors(page);
    check('no errors on the page', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }
}

try {
  if (wanted('menu')) await sceneMenu();
  if (wanted('load')) await sceneLoadKeys();
  if (wanted('yard')) await sceneYard();
  if (wanted('touch')) await sceneTouch();
  if (wanted('herd')) await sceneHerd();
  if (wanted('driftbots')) await sceneDriftBots();
  if (wanted('goats')) await sceneMapGame('goats', 'goat-hud');
  if (wanted('drift')) await sceneMapGame('drift', 'film-hud');
  if (wanted('dogfight')) await sceneDogfight();
  if (wanted('ribbon')) await sceneRibbon();
  if (wanted('scale')) await sceneScale();
} catch (e) {
  failures += 1;
  console.log(`  FAIL  ${e.message}`);
}
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
