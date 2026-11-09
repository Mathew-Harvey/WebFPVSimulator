/*
 * infected-check.js: Infected in the real shell (headless Chromium). Midori
 * Gakuen loads, a solo round builds with bots in a mix of skills, the
 * pilot is seated on a pad, taking off starts the head start, the first
 * infected is let out and the bots fly, and the HUD shows each moment:
 * the wait, RUN!, the hunt, INFECTED!, the sniff, LAST ONE!, the round's
 * table and the match's, and the waiting room page. With --shots=DIR a
 * picture of each is left there, and one for the Mini games card.
 *
 *   node scripts/infected-check.js [--shots=DIR]
 *
 * Headless runs well under real time, so waits are on the round's own
 * clock, and the moments after the hunt starts are put on the round by
 * its own methods (tag, sniff, end) rather than waited for: the seeded
 * Node arena (scripts/infected-arena.js) is what proves the bots catch and
 * escape on their own.
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

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { answerQuadPicker, openPage } from '../tests/lib/page.js';
import { MATERIALS } from '../src/props/school.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const shotsArg = process.argv.find((a) => a.startsWith('--shots='));
const SHOTS = shotsArg ? shotsArg.slice(8) : '';
if (SHOTS) {
  mkdirSync(SHOTS, { recursive: true });
}

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

const G = 'const g = window.__dogfight();';
/* A camera a little behind and over bot `i`, looking along its way. */
const behind = (i, back = 1.4, up = 0.35) => `${G} const k = g.k; const i = ${i};
  const fx = g.fx[i], fz = g.fz[i]; const n = Math.hypot(fx, fz) || 1;
  window.__setCam(g.x[i] - fx / n * ${back} * k, g.y[i] + ${up} * k, g.z[i] - fz / n * ${back} * k, g.x[i] + fx / n * 2 * k, g.y[i], g.z[i] + fz / n * 2 * k); return 1;`;

async function main() {
  const page = await openPage({ root: ROOT, width: 1280, height: 720, url: '/index.html?map=school&craft=whoop65&fly=1' });
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
  const shot = async (name) => {
    if (!SHOTS) {
      return;
    }
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
  };
  try {
    check('the shell comes up', await until('return !!window.__shellReady', 120000));
    check('the school is ready', await until("const m = window.__map ? window.__map() : null; return Boolean(m && m.ready && m.id === 'school');", 150000));
    /* A link to the school flies the whoop, the only quad it is flown on,
     * with no quad picker: one used to open on a five inch and wait. */
    await sleep(2500);
    const picker = "const d = document.querySelector('.name-dialog'); return Boolean(d && !d.hidden && document.querySelector('.qp-page'));";
    const asked = await ev(picker);
    check('a school link flies the whoop with no quad picker', !asked && await until("return window.__ui.screen === 'flight'", 20000)
      && await ev("return window.__ui.settings.airframe === 'whoop65';"));
    if (asked) {
      await answerQuadPicker(page, 15000).catch(() => {});
      await until("return window.__ui.screen === 'flight'", 20000);
    }
    /* Flown alone, the school promises no count it will not show. */
    check('the school alone says no clock and no gates, and promises no count', await until("const b = window.__ui.banner; return Boolean(b) && /Fly the whole school/.test(b.textContent) && !/count/.test(b.textContent);", 10000));
    check('and has no score overlay', await ev("const h = document.querySelector('.score-hud'); return !h || h.classList.contains('is-off');"));
    const free = await ev('return window.__renderStats().calls;');
    await ev(`window.__ui.dogfight = { game: 'infected', bots: 9, skills: ['easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard', 'hard'], round: '2m', head: 5, first: 'bot' }; return 1;`);
    check('the round builds', await until(`${G} return Boolean(g && g.infRules);`, 60000));
    check('ten pilots: the pilot and nine bots', await ev(`${G} return g.inCount === 10;`));
    check('each bot has its own skill', await ev(`${G} return g.botSkill(1) === 'easy' && g.botSkill(5) === 'medium' && g.botSkill(9) === 'hard';`));
    check('a bot starts infected, in the tank', await ev(`${G} return g.pz > 0 && g.inf[g.pz] === 1 && g.phase === 'wait';`));
    await sleep(1500);
    const seat = await ev(`${G} return { d: Math.hypot(g.x[0] - g.seatX[0], g.z[0] - g.seatZ[0]) / g.k, y: (g.y[0] - g.seatY[0]) / g.k };`);
    check('the pilot sits on their pad', seat.d < 0.3 && Math.abs(seat.y) < 0.3, JSON.stringify(seat));
    check('the HUD is up', await until("const h = document.querySelector('.if-hud'); return Boolean(h) && !h.classList.contains('is-off');", 10000));
    check('it says how to start', await until("const b = document.querySelector('.if-hud .df-banner'); return Boolean(b) && /Take off to start/.test(b.textContent);", 10000));
    const words = await ev("return document.querySelector('.if-hud').textContent;");
    check('no word of slime anywhere on it', !/slime/i.test(words));
    await shot('1-wait');
    /* The pause in a round: the waiting room, leaving the round, and Quit
     * says where it lands; Settings shows the whoop as the school's only
     * quad, with nothing to swap it for. */
    await ev("window.__ui.act('pause'); window.__ui.show('paused'); return 1;");
    await until("return window.__ui.screen === 'paused'", 5000);
    const labels = await ev("return window.__ui.items().map((i) => i.label);");
    check('the pause has Change the match, Leave the match and Back to Mini games', ['Resume', 'Change the match', 'Leave the match', 'Back to Mini games'].every((l) => labels.includes(l))
      && !labels.some((l) => /swap|change map/i.test(l)), labels.join(' | '));
    /* Every mini game's pause is the same menu (miniGamePauseItems in
     * src/ui/ui.js, the owner's "make standard menu systems"): the same
     * rows in the same order, the one word for what the game plays in
     * Restart, Change and Leave, and the way out saying it lands on Mini
     * games. Read off the live pause with each game's rules swapped in and
     * put back, so nothing is flown. And a game room's way out says so too. */
    const shapes = await ev(`
      const ui = window.__ui; const keep = ui.dogfight; const out = {};
      for (const game of ['ball', 'drift', 'infected', 'goats', 'ribbon', 'dogfight']) {
        ui.dogfight = Object.assign({}, keep, { game: game === 'dogfight' ? undefined : game });
        out[game] = ui.items().map((i) => (i.section ? '#' : '') + i.label);
      }
      ui.dogfight = keep;
      const room = ui.roomInfo; const ri = { code: 'ABCD', n: 2, host: false, infected: { phase: 'pit' } };
      ui.roomInfo = ri; const inRoom = ui.items().map((i) => i.label);
      ui.roomInfo = Object.assign({}, ri, { infected: null }); const raceRoom = ui.items().map((i) => i.label);
      ui.roomInfo = room;
      return { out, inRoom, raceRoom };`);
    const NOUN = { ball: 'match', drift: 'round', infected: 'match', goats: 'round', ribbon: 'round', dogfight: 'fight' };
    const bad = Object.entries(shapes.out).filter(([game, rows]) => {
      const n = NOUN[game];
      const tail = rows.slice(-4);
      return rows[0] !== 'Resume' || rows[1] !== `Restart the ${n}` || rows[2] !== `Change the ${n}`
        || tail.join('|') !== `#Elsewhere|Settings|Leave the ${n}|Back to Mini games`
        || !rows.includes('#Does it feel wrong?') || rows.some((l) => /Quit to title/.test(l));
    }).map(([game, rows]) => `${game}: ${rows.join(', ')}`);
    check('every mini game\'s pause is the same menu in its own word', bad.length === 0, bad.join(' || '));
    check('a game room\'s way out says Back to Mini games, a race room\'s Quit to title',
      shapes.inRoom.includes('Back to Mini games') && !shapes.inRoom.includes('Quit to title') && shapes.raceRoom.includes('Quit to title'),
      `${shapes.inRoom.join(', ')} / ${shapes.raceRoom.join(', ')}`);
    await ev("window.__ui.act('quad'); return 1;");
    await sleep(400);
    const craft = await ev("const a = window.__ui.items().find((i) => i.label === 'Aircraft'); return a ? { value: a.value || '', cards: Boolean(a.cards), note: a.note || '' } : null;");
    check('Settings shows the whoop as the school\'s one quad, not a swap', craft && /whoop/i.test(craft.value) && !craft.cards && /only/.test(craft.note), JSON.stringify(craft));
    await ev("window.__ui.act('resume'); return 1;");
    check('Resume is back in the round, still waiting', await until(`return window.__ui.screen === 'flight' && window.__dogfight() && window.__dogfight().phase === 'wait';`, 5000));
    check('the score overlay stays down in a round', await ev("const h = document.querySelector('.score-hud'); return !h || h.classList.contains('is-off');"));
    check('and the airtime clock gives way to the round\'s own', await until("const c = document.querySelector('.osd .osd-clock'); return Boolean(c) && getComputedStyle(c).visibility === 'hidden';", 5000));
    await ev('window.__stick(0, 0, 0, 0.62); return 1;');
    check('taking off starts the head start', await until(`${G} return g.startedMs >= 0;`, 20000));
    check('the first infected is held', await ev(`${G} return g.phase === 'head' && g.holds(g.pz);`));
    await sleep(500);
    await shot('2-run');
    await ev('window.__stick(0, 0, 0, 0.0); return 1;');
    check('the first infected is let out', await until(`${G} return g.hunting;`, 120000));
    const start = await ev(`${G} const a = []; for (let i = 1; i < 10; i += 1) a.push([g.x[i], g.y[i], g.z[i]]); return a;`);
    await until(`${G} return g.clockMs - g.huntAt > 4000;`, 90000);
    const moved = await ev(`${G} const s = ${JSON.stringify(start)}; let n = 0; for (let i = 1; i < 10; i += 1) { if (Math.hypot(g.x[i] - s[i - 1][0], g.y[i] - s[i - 1][1], g.z[i] - s[i - 1][2]) > g.k) n += 1; } return n;`);
    check('the bots fly', moved >= 7, `${moved} of 9 moved a metre in four seconds`);
    check('the first infected left the tank', await ev(`${G} const i = g.pz; return Math.hypot(g.x[i] - g.seatX[i], g.z[i] - g.seatZ[i]) > g.k;`));
    const inside = await ev(`${G} let bad = 0; for (let i = 1; i < 10; i += 1) { if (g.bots.mode[i] !== 0 && g.world.inside(g.x[i], g.y[i], g.z[i])) bad += 1; } return bad;`);
    check('no bot is inside a solid', inside === 0, `${inside}`);
    /* R in the hunt, as a pilot stuck somewhere presses it: put back on
     * their own pad, and the round goes on with the same first infected.
     * The owner, 2026-11-09: "when i get stuck and reset in a all bot
     * match the game restarts and the infected bot is changed". */
    const was = await ev(`${G} return { pz: g.pz, round: g.round, huntAt: g.huntAt, clock: g.clockMs };`);
    await ev(`${G} window.__placeCraft(g.seatX[0] + 2 * g.k, g.seatY[0] + 1.2 * g.k, g.seatZ[0]); return 1;`);
    await sleep(600);
    await ev("window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', key: 'r' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyR', key: 'r' })); return 1;");
    await sleep(1500);
    const now = await ev(`${G} return { pz: g.pz, round: g.round, huntAt: g.huntAt, clock: g.clockMs, hunting: g.hunting, d: Math.hypot(g.x[0] - g.seatX[0], g.z[0] - g.seatZ[0]) / g.k, y: (g.y[0] - g.seatY[0]) / g.k };`);
    check('R in the hunt keeps the round and its first infected', now.pz === was.pz && now.round === was.round && now.huntAt === was.huntAt && now.hunting && now.clock > was.clock,
      JSON.stringify({ was, now }));
    check('and puts the pilot back on their own pad', now.d < 0.3 && Math.abs(now.y) < 0.3, `${now.d.toFixed(3)} m off it, ${now.y.toFixed(3)} m up`);
    /* The hunt, from behind the first infected. */
    await ev(behind('g.pz'));
    await sleep(1200);
    const calls = await ev('return window.__renderStats().calls;');
    console.log(`  info  draw calls: ${free} free flight, ${calls} in a round (the craft, the rings and the effects)`);
    await shot('3-hunt');
    /* A clean bot, from behind, with its ring and name. */
    await ev(`${G} let c = 1; for (let i = 1; i < 10; i += 1) { if (!g.inf[i]) { c = i; break; } } window.__cleanBot = c; return 1;`);
    await ev(behind('window.__cleanBot', 1.1, 0.25));
    await sleep(1200);
    await shot('4-clean-bot');
    await ev('window.__setCam(); return 1;');
    /* The pilot tagged. */
    await ev(`${G} g.tag(g.pz, 0, g.clockMs); return 1;`);
    check('the pilot is infected', await ev(`${G} return g.inf[0] === 1;`));
    await sleep(400);
    check('INFECTED! is called', await ev("const c = document.querySelectorAll('.if-hud .if-mid canvas:not(.is-off)'); return c.length === 1;"));
    await shot('5-infected');
    /* The sniff: where the clean ones are, for a second. */
    await until(`${G} return g.clockMs - g.sniffAt > 1500;`, 20000);
    await ev(`${G} g.sniff(g.clockMs); return 1;`);
    await sleep(250);
    await shot('6-sniff');
    /* The last one: everybody else tagged. */
    await ev(`${G} let left = 0; for (let i = 1; i < 10; i += 1) { if (!g.inf[i]) left = i; } for (let i = 1; i < 10; i += 1) { if (!g.inf[i] && i !== left) g.tag(0, i, g.clockMs); } window.__goldBot = left; return 1;`);
    check('one clean bot left is the last one, in gold', await ev(`${G} return g.gold === window.__goldBot && g.phase === 'last';`));
    check('the clock drops to 45 s at most', await ev(`${G} return g.leftMs() <= 45000;`));
    await sleep(600);
    await shot('7-last');
    await ev(behind('window.__goldBot', 1.1, 0.25));
    await sleep(900);
    await shot('8-gold-bot');
    await ev('window.__setCam(); return 1;');
    /* The bell: caught at the end. */
    await ev(`${G} g.tag(0, g.gold, g.clockMs); return 1;`);
    check('the round is over when nobody is clean', await ev(`${G} return g.over;`));
    check('the last one caught wins the round', await ev(`${G} return g.winner === window.__goldBot;`));
    check('the table is up', await until("const r = document.querySelector('.if-hud .df-result'); return Boolean(r) && !r.classList.contains('is-off');", 10000));
    await sleep(400);
    await shot('9-round');
    /* The match's table, as it shows after round three. */
    await ev(`${G} g.leg = 2; window.__dogfightHud().showResult(g, { kicker: 'Infected' }); return 1;`);
    await sleep(300);
    await shot('10-match');
    await ev(`${G} g.leg = 0; return 1;`);
    /* The waiting room page, from the table's button. */
    await ev("window.__ui.act('fight-change'); return 1;");
    check('the waiting room opens', await until("return Boolean(document.querySelector('.if-wait'));", 20000));
    await sleep(600);
    await shot('11-waiting-room');
    const seats = await ev("return document.querySelectorAll('.if-seat.is-bot').length;");
    check('it shows the nine bots', seats === 9, `${seats}`);
    await ev("document.querySelectorAll('.if-seat.is-empty')[0].click(); return 1;");
    check('a click on an empty seat adds a bot', await ev("return document.querySelectorAll('.if-seat.is-bot').length === 10;"));
    await ev("document.querySelector('.qp-btn.qp-fly').click(); return 1;");
    check('Play! takes the new rules', await until(`${G} return Boolean(g) && g.infRules.bots === 10 && g.inCount === 11;`, 20000));
    const errs = page.errors.filter((e) => !/api\/|ERR_CONNECTION_REFUSED|Failed to load resource/.test(e));
    check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
    /* The art for the Mini games card: the hallway, a white quad flying
     * at the eye with a green one behind it, staged on a paused round
     * with the page's own furniture hidden. */
    if (SHOTS) {
      await ev("window.__ui.act('pause'); return 1;");
      await sleep(600);
      await ev(`${G} const P = g.plan; let c = -1; let f = -1;
        for (let i = 1; i < g.cap; i += 1) { if (!g.inFight[i] || i === g.pz) continue; if (c < 0) c = i; else if (f < 0) f = i; }
        g.inf[f] = 1;
        const put = (i, px, py, h, fz, ux, uz) => { const [x, y, z] = P.worldAt(px, py, h);
          g.x[i] = x; g.y[i] = y; g.z[i] = z; g.xPrev[i] = x; g.yPrev[i] = y; g.zPrev[i] = z;
          g.fx[i] = 1; g.fy[i] = 0; g.fz[i] = fz; g.fxPrev[i] = 1; g.fyPrev[i] = 0; g.fzPrev[i] = fz;
          g.ux[i] = ux; g.uy[i] = 0.95; g.uz[i] = uz; g.uxPrev[i] = ux; g.uyPrev[i] = 0.95; g.uzPrev[i] = uz; };
        for (let i = 1; i < g.cap; i += 1) { if (g.inFight[i] && i !== c && i !== f) put(i, 2, 2, -3, 0, 0, 0); }
        put(c, 24.27, 8.82, 1.08, 0.15, 0.3, 0.15); put(f, 23.98, 9.0, 1.24, 0.1, -0.3, 0.1);
        const [ex, ey, ez] = P.worldAt(24.6, 8.92, 1.18); const [lx, ly, lz] = P.worldAt(20, 8.85, 1.1);
        window.__setCam(ex, ey, ez, lx, ly, lz); return [c, f];`);
      await ev("window.__ui.root.style.visibility = 'hidden'; return 1;");
      await sleep(2500);
      await shot('12-card-art');
      await ev("window.__ui.root.style.visibility = ''; window.__setCam(); window.__ui.act('resume'); return 1;");
    }
    await ev("window.__ui.act('pause'); window.__ui.act('fight-leave'); return 1;");
    check('leaving ends the round', await until('return !window.__dogfight();', 10000));
    check('and the airtime clock is back', await until("const c = document.querySelector('.osd .osd-clock'); return Boolean(c) && getComputedStyle(c).visibility !== 'hidden';", 5000));
    /* The gradient tone (src/render/hatch.js): on High the walls' two
     * colours (plaster and wainscot) of the school's own parts are toned
     * copies, both one program, and nothing else is; on any other preset
     * there is none and the school is as it was. Whatever preset this page
     * booted on is read, then the other side of High is flown and read
     * too. */
    const HATCH = `const s = window.__mapScene(); const own = s && s.getObjectByName('props:extra'); let toon = 0; let hatched = 0; const keys = new Set(); const cols = new Set();
      if (own) { own.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshToonMaterial) { toon += 1; if (o.material.userData.hatch) { hatched += 1; keys.add(o.material.customProgramCacheKey()); cols.add(o.material.color.getHexString()); } } }); }
      const m = window.__map(); return { graphics: m.graphics, id: m.id, toon, hatched, keys: keys.size, cols: [...cols].sort().join(' ') };`;
    const WALLS = [MATERIALS.scWall.c, MATERIALS.scWainscot.c].map((c) => c.toString(16).padStart(6, '0')).sort().join(' ');
    const hatchRight = (h) => h.id === 'school' && h.toon > 2 && (h.graphics === 'high' ? h.hatched === 2 && h.keys === 1 && h.cols === WALLS : h.hatched === 0);
    const h0 = await ev(HATCH);
    check(`on ${h0.graphics}, the school ${h0.graphics === 'high' ? 'tones its walls and nothing else, one program' : 'is not toned'}`, hatchRight(h0), JSON.stringify(h0));
    const other = h0.graphics === 'high' ? 'medium' : 'high';
    await ev(`const ui = window.__ui; ui.settings.map = 'school'; ui.settings.graphics = '${other}'; ui.settings.graphicsAuto = false; ui.onAction('fly', ui.settings); return 1;`);
    await until(`const m = window.__map(); return Boolean(m && m.id === 'school' && m.ready && m.graphics === '${other}');`, 120000);
    const h1 = await ev(HATCH);
    check(`on ${other}, the school ${other === 'high' ? 'tones its walls and nothing else, one program' : 'is not toned'}`, hatchRight(h1), JSON.stringify(h1));
    /* The Mini games page, as Back from a game's own page opens it. */
    await ev("const u = window.__ui; u.mode = null; u.craftGate = true; u.gatePage = 'games'; u.gameReturn = false; u.show('title'); u.renderMenu(); return 1;");
    check('the Mini games page has the Infected card', await until("const e = document.querySelector('.gate-card-mg-infected'); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 120 && r.height > 30 && r.right <= innerWidth + 2 && r.bottom <= innerHeight + 2;", 15000));
    await sleep(1500);
    await shot('13-mini-games');
  } finally {
    await page.close();
  }
  console.log(failures ? `${failures} failed` : 'all passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
