/*
 * realrow-check.js: the Realistic physics switch, in the real shell.
 *
 * The owner, 2026-11-14: "Let's build it all but put all changes behind a
 * realistic physics switch in settings", and after flying it the same
 * evening: "for 5 inch, default the realistic phyiscs to on, leave it
 * defualted to off for whoop. In 5 inch show the user a modal to explain
 * the experiemental flight feel realistic physics, and tell them how to
 * turn it back to how it was if they like". The module's half is
 * check:realism and the plant golden, which fly the module directly. This
 * is the shell's half, in headless Chromium on the real page, with no
 * physics force (every other check here is held to the classic model by
 * tests/lib/page.js, and one line below proves that force works):
 *
 *   - a returning five inch pilot who has said nothing boots on the model:
 *     the module holds the shell's mask, gravity is one real g, the best
 *     lap is filed under `.real`, and the lap is NOT tagged Tuned, because
 *     this is the quad as it ships;
 *   - their first Fly is met by the explainer, once. Escape is "Got it" and
 *     changes nothing; the second Fly goes straight to the air;
 *   - "Use the old feel" on the explainer puts the five inch back: no mask,
 *     the airframe's gravity, the old record key, and now Tuned;
 *   - the Pilot screen's row does the same from Settings, and working the
 *     row counts as having been told;
 *   - on a freestyle map with nothing scored the pack drains, and on a race
 *     course it does not;
 *   - the whoop boots on the classic model untagged, is never shown the
 *     explainer, and its row is its own: turning it on does not move the
 *     five inch's answer, and on the whoop it is Realistic that is Tuned;
 *   - a pilot who has never flown is not shown the explainer;
 *   - ?physics=classic in the address flies the classic model whatever the
 *     rows say and shows no explainer.
 *
 * Usage:
 *   node scripts/realrow-check.js
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

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
/* As a namespace, so a shell without feelWeightLine fails its line below
 * rather than this import, and every other line still runs. */
import * as shellUi from '../src/ui/ui.js';

const { SETTINGS_KEY } = shellUi;
/* The hover tables the keys fly on, the same way: a tree without
 * packRestVolts fails the lines that need it, not the run. */
const rates = await import('../configs/rates.js');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });

const ALL = 255;
const PACK = 16;

let failures = 0;
function check(name, cond, detail = '') {
  console.log(`  ${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!cond) failures += 1;
  return Boolean(cond);
}

/* A returning pilot's blob with nothing said about the physics, or with
 * `extra` on top. `fresh` leaves storage empty: a first visit. */
const seed = (map, airframe, extra = {}, fresh = false) => (fresh ? 'void 0;' : `try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  if (!sessionStorage.getItem('realrow.seeded')) {
    sessionStorage.setItem('realrow.seeded', '1');
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.airframeAsked = true;
    s.hasFlown = true;
    s.graphics = 'low';
    s.graphicsAuto = false;
    s.airframe = ${JSON.stringify(airframe)};
    s.map = ${JSON.stringify(map)};
    delete s.realPhysicsFive;
    delete s.realPhysicsWhoop;
    delete s.realPhysicsTold;
    Object.assign(s, ${JSON.stringify(extra)});
    localStorage.setItem(k, JSON.stringify(s));
  }
} catch (e) { /* defaults */ }`);

const click = (word) => `(() => {
  const row = [...document.querySelectorAll('.menu .row')].find((r) => /Realistic physics/.test(r.textContent));
  if (!row) return 0;
  const b = [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(word)});
  if (!b) return 0;
  b.click();
  return 1;
})()`;
const OPEN = "(() => { window.__ui.show('pilot'); return window.__ui.items().findIndex((it) => it.label === 'Realistic physics'); })()";
const READ = `(() => ({ ...window.__realism(),
  five: window.__ui.settings.realPhysicsFive, whoop: window.__ui.settings.realPhysicsWhoop, told: window.__ui.settings.realPhysicsTold,
  mode: window.__map().mode, craft: window.__ui.settings.airframe }))()`;
/* The explainer, if it is up: its title and its two buttons. */
const DIALOG = `(() => {
  const d = document.querySelector('.name-dialog');
  if (!d || d.hidden) return null;
  const h = d.querySelector('h2');
  return { title: h ? h.textContent : '', text: d.textContent, buttons: [...d.querySelectorAll('button')].map((b) => b.textContent) };
})()`;
const press = (word) => `(() => {
  const b = [...document.querySelectorAll('.name-dialog button')].find((x) => x.textContent.trim() === ${JSON.stringify(word)});
  if (!b) return 0;
  b.click();
  return 1;
})()`;
const FLY = "(() => { window.__ui.act('fly'); return 1; })()";

/*
 * THE REPORT A PILOT FILES, beside what the module is flying. Every five
 * inch ticket after Realistic became the default said the classic model's
 * gravity and hover: bug-b5f43230's context said 1.539 times g and hover at
 * 33.9 percent while its own tune block, read off the module, said 0.95 and
 * the keys hovered at 26. So the report is held to the module here, on the
 * model and off it, rather than to a number written in this file.
 */
const REPORT = `(() => {
  const c = window.__ui.feelSnapshot();
  return { physics: c.physics, gravityScale: c.gravityScale, weight: c.weight, throttle: c.throttle,
    keyHover: c.stick && c.stick.keyHover, keys: Object.keys(c), flown: window.__realism() };
})()`;
async function reportSays(page, want) {
  const c = await page.evaluate(REPORT);
  const hover = /hover near ([0-9.]+) percent/.exec(c.throttle || '');
  check(`the report names the model it flies, ${want}`, c.physics === want, String(c.physics));
  check('its gravity is the gravity the module flies', c.gravityScale === c.flown.gravity, `${c.gravityScale} against ${c.flown.gravity}`);
  check('its hover is where the keys hover', Boolean(hover) && Math.abs(Number(hover[1]) - c.keyHover) <= 0.15,
    `${c.throttle} against keyHover ${c.keyHover}`);
  /*
   * AND THE KEYS REST WHERE THIS MODEL HOVERS AT THIS WEIGHT. The line above
   * holds the report to the keys; this holds the keys to the model's own
   * table, which scripts/hoverline-check.js holds to the module. The first
   * cut read the classic table at the slider over the airframe's base, so
   * at Weight 90 on Realistic the keys rested a point over hover and at 75
   * three and a half, and a light quad climbed every time a key came up.
   */
  const usedAh = Number(c.flown.used) || 0;
  const volts = typeof rates.packRestVolts === 'function' ? rates.packRestVolts(4.2, usedAh) : 4.2;
  const wantHover = rates.hoverStickPercent(100, '5inch', c.weight, volts, 100, want === 'realistic');
  check('and the keys rest at this model\'s own hover for this weight', Math.abs(c.keyHover - wantHover) <= 0.15,
    `keyHover ${c.keyHover} against ${wantHover.toFixed(2)} at Weight ${c.weight}`);
  const line = typeof shellUi.feelWeightLine === 'function' ? shellUi.feelWeightLine(c) : '';
  check('the feel note says the same', line.includes(`${Number(c.flown.gravity).toFixed(2)} times g`)
    && line.includes(want === 'realistic' ? 'with Realistic physics on' : 'with Realistic physics off'), line);
  /* The board refuses a context of more than 32 top level keys, and a
   * refused feel note is a lost one. fault, loadFailure and career are only
   * there when there is one, so they are counted in as if they were. */
  const optional = ['fault', 'loadFailure', 'career'].filter((k) => !c.keys.includes(k)).length;
  check('and the report stays inside the board\'s 32 keys with every optional one in', c.keys.length + optional <= 32,
    `${c.keys.length} + ${optional}`);
}
const TITLE = "(() => { const ui = window.__ui; ui.onAction('title', ui.settings); ui.show('title'); return 1; })()";

/* A race's Fly stops at its launch card, as it always has; the card's own
 * button is the last step to the air. */
async function toAir(page) {
  await page.until("window.__mode === 'flight' || window.__ui.screen === 'launch'", 60000);
  if (await page.evaluate("window.__mode !== 'flight'")) {
    await page.evaluate("(() => { window.__ui.act('launch-go'); return 1; })()");
  }
  await page.until("window.__mode === 'flight'", 60000);
}

async function boot(map, airframe, opts = {}) {
  const page = await openPage({
    root, width: 1280, height: 720, url: opts.url || '/index.html', physics: 'pilot',
    seed: [seed(map, airframe, opts.extra, opts.fresh)],
  });
  await page.until('window.__shellReady === true', 120000);
  await page.until('window.__map && window.__map().ready', 120000);
  return page;
}

async function fiveInch(map) {
  console.log(`five inch, ${map}`);
  const page = await boot(map, '5inch');
  try {
    const b = await page.evaluate(READ);
    check('a five inch pilot who has said nothing boots on the model', b.shell !== 0 && b.module === b.shell && (b.shell | PACK) === ALL, JSON.stringify(b));
    check('at one real g', b.gravity === 1, String(b.gravity));
    check('with a best lap of its own', /\.real$/.test(b.key), b.key);
    check('and not Tuned: it is the quad as it ships', b.tuned === false && b.forced === false);
    await reportSays(page, 'realistic');
    await page.evaluate(FLY);
    await wait(500);
    let d = await page.evaluate(DIALOG);
    check('the first Fly is met by the explainer', Boolean(d) && /Realistic physics is on/.test(d.title), JSON.stringify(d && d.title));
    check('which says it is experimental and where the switch is',
      Boolean(d) && /experimental/.test(d.text) && /Settings, Pilot, Realistic physics/.test(d.text));
    check('and carries the way back as a button', Boolean(d) && d.buttons.includes('Use the old feel') && d.buttons.includes('Got it, fly'), JSON.stringify(d && d.buttons));
    check('it has not flown yet', await page.evaluate("window.__mode !== 'flight'"));
    await wait(400);
    await page.evaluate("(() => { document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1; })()");
    await toAir(page);
    await wait(500);
    const f = await page.evaluate(READ);
    check('Escape is Got it: the model stays on and the flight starts', f.shell !== 0 && f.five !== false && f.told === true, JSON.stringify(f));
    check(f.mode === 'freestyle' ? 'in freestyle the pack drains' : 'on a race course the pack does not drain',
      ((f.shell & PACK) !== 0) === (f.mode === 'freestyle') && f.module === f.shell, JSON.stringify(f));
    if (f.mode === 'freestyle') {
      /*
       * AND THE KEYS FOLLOW THE PACK DOWN. Hover climbs the stick as the
       * pack falls, three or four points over a pack, and the keyboard's
       * throttle springs to hover: left on the fresh pack's figure it let a
       * half used pack sink at two metres a second whenever a key came up.
       * A punch straight up uses the charge; the shell reads it twice a
       * second and moves the spring.
       */
      const KEYS = '(() => ({ at: window.__input.kbHover * 100, used: window.__realism().used }))()';
      const fresh = await page.evaluate(KEYS);
      const freshWant = rates.hoverStickPercent(100, '5inch', 100, 4.2, 100, true);
      check('on a fresh pack the keys rest at the realistic hover', fresh.used === 0 && Math.abs(fresh.at - freshWant) <= 0.15,
        `${fresh.at.toFixed(2)} against ${freshWant.toFixed(2)}, ${fresh.used} Ah used`);
      await page.evaluate('(window.__stick(0, 0, 0, 1), 1)');
      await page.until('window.__realism().used > 0.05', 90000).catch(() => {});
      await page.evaluate('(window.__stick(0, 0, 0, 0.3), 1)');
      await wait(1200);
      const spent = await page.evaluate(KEYS);
      await page.evaluate('(window.__stick(), 1)');
      const spentWant = typeof rates.packRestVolts === 'function'
        ? rates.hoverStickPercent(100, '5inch', 100, rates.packRestVolts(4.2, spent.used), 100, true) : NaN;
      check('a punch uses the pack and the shell sees it', spent.used > 0.05, `${spent.used} Ah used`);
      check('and the keys\' rest has moved up the stick with it, to the hover of the pack as it stands',
        spent.at > fresh.at + 0.2 && Math.abs(spent.at - spentWant) <= 0.15,
        `${spent.at.toFixed(2)} against ${Number.isFinite(spentWant) ? spentWant.toFixed(2) : 'no packRestVolts'}, from ${fresh.at.toFixed(2)}`);
      await page.evaluate(TITLE);
      await wait(500);
      await page.evaluate(FLY);
      await toAir(page);
      await wait(800);
      const again = await page.evaluate(KEYS);
      check('a new run is a fresh pack, and the keys are back on its hover', again.used === 0 && Math.abs(again.at - freshWant) <= 0.15,
        `${again.at.toFixed(2)}, ${again.used} Ah used`);
      /*
       * AND THE SHELL READS THE NEW PACK FROM ITS FIRST FRAME IN THE AIR.
       * The line above is read on the ground, where the pack is not polled,
       * so it could not see this. The tap the shell reads keeps the last
       * pack's figure until the module steps on the new one, and the read
       * came before the frame's steps: the first poll in the air on a new
       * run took the old pack, and a pack flown flat met the next run with
       * "Pack is getting low" on a full one (the owner, 2026-11-24). A pack
       * only runs down, so whatever the shell took must not be more than the
       * module says has been used since. Every frame is watched, because the
       * stale figure lasted one poll, half a second.
       */
      await page.evaluate(`(() => {
        window.__packSeen = 0;
        const look = () => {
          const u = window.__realism().used;
          if (u > window.__packSeen) {
            window.__packSeen = u;
          }
          window.__packLook = requestAnimationFrame(look);
        };
        look();
        window.__stick(0, 0, 0, 1);
        return 1;
      })()`);
      await wait(1200);
      await page.evaluate('(window.__stick(0, 0, 0, 0.3), 1)');
      await wait(1200);
      const took = await page.evaluate('(() => { cancelAnimationFrame(window.__packLook); window.__stick(); return { seen: window.__packSeen, module: window.__simModule().e.sim_bf_debug(74), air: window.__mode }; })()');
      check('and in the air the shell never takes more of the pack than the module has used, not even on the first frame',
        took.module > 0 && took.seen <= took.module + 1e-9,
        `the shell took ${took.seen.toFixed(4)} Ah, the module has used ${took.module.toFixed(4)}, the last run ended on ${spent.used.toFixed(4)}`);
    }
    await page.evaluate(TITLE);
    await wait(500);
    await page.evaluate(FLY);
    await toAir(page);
    check('the second Fly goes straight to the air', (await page.evaluate(DIALOG)) === null);
    /* The row, from Settings. */
    const at = await page.evaluate(OPEN);
    await wait(300);
    check('the Pilot screen has the row', at >= 0, String(at));
    check('clicking Off finds the switch', await page.evaluate(click('Off')) === 1);
    await wait(300);
    const off = await page.evaluate(READ);
    check('Off is the old five inch: no mask, its own gravity, the old key', off.shell === 0 && off.module === 0 && off.gravity === 1.62 && !/\.real/.test(off.key), JSON.stringify(off));
    check('and on the five inch it is the old model that is Tuned', off.tuned === true && off.five === false);
    await reportSays(page, 'classic');
    /* The slider too, on the model: a feel note at 90 said 1.46 times g
     * (bug-01f0ca83) for a quad flown at 0.90. */
    check('clicking On finds the switch', await page.evaluate(click('On')) === 1);
    await page.evaluate('(() => { const ui = window.__ui; ui.settings.weight = 90; ui.onSettings(ui.settings); return 1; })()');
    await page.until('window.__realism().gravity === 0.9', 10000).catch(() => {});
    await reportSays(page, 'realistic');
    await page.evaluate('(() => { const ui = window.__ui; ui.settings.weight = 100; ui.onSettings(ui.settings); return 1; })()');
    await page.until('window.__realism().gravity === 1', 10000).catch(() => {});
    await page.evaluate(click('Off'));
    await wait(300);
    check('clicking On finds the switch', await page.evaluate(click('On')) === 1);
    await wait(300);
    const on = await page.evaluate(READ);
    check('On puts it all back', on.shell !== 0 && on.module === on.shell && on.gravity === 1 && on.key === b.key && on.tuned === false, JSON.stringify(on));
    return f.mode;
  } finally {
    await page.close();
  }
}

async function oldFeel() {
  console.log('five inch, the explainer\'s way back');
  const page = await boot('built', '5inch');
  try {
    await page.evaluate(FLY);
    await wait(800);
    check('pressing Use the old feel finds the button', await page.evaluate(press('Use the old feel')) === 1);
    await page.until("window.__mode === 'flight'", 60000);
    await wait(400);
    const s = await page.evaluate(READ);
    check('the flight it starts is the old five inch', s.shell === 0 && s.module === 0 && s.gravity === 1.62 && s.five === false && !/\.real/.test(s.key), JSON.stringify(s));
    check('and the choice is remembered as told', s.told === true);
    await page.evaluate("location.reload()");
    await wait(1500);
    await page.until('window.__shellReady === true && window.__map && window.__map().ready', 120000);
    const r = await page.evaluate(READ);
    check('a reload keeps the old feel', r.shell === 0 && r.five === false && r.gravity === 1.62, JSON.stringify(r));
  } finally {
    await page.close();
  }
}

async function whoop() {
  console.log('whoop');
  const page = await boot('built', 'whoop65');
  try {
    const b = await page.evaluate(READ);
    check('the whoop is seated', b.craft === 'whoop65', b.craft);
    check('a whoop pilot who has said nothing boots on the classic model, untagged', b.shell === 0 && b.module === 0 && b.gravity === 1.62 && b.tuned === false, JSON.stringify(b));
    await page.evaluate(FLY);
    await wait(800);
    const d = await page.evaluate(DIALOG);
    check('and is not shown the five inch\'s explainer', !d || !/Realistic physics/.test(d.title), JSON.stringify(d && d.title));
    await page.evaluate(OPEN);
    await wait(300);
    check('clicking On finds the switch', await page.evaluate(click('On')) === 1);
    await wait(300);
    const on = await page.evaluate(READ);
    check('the whoop\'s row is its own, and on the whoop Realistic is the Tuned one',
      on.shell !== 0 && on.gravity === 1 && on.tuned === true && on.whoop === true && on.five !== false, JSON.stringify(on));
  } finally {
    await page.close();
  }
}

async function firstVisit() {
  console.log('a first visit');
  const page = await boot('built', '5inch', { fresh: true });
  try {
    const b = await page.evaluate(READ);
    check('a new pilot on the five inch boots on the model', b.craft !== '5inch' || (b.shell !== 0 && b.gravity === 1), JSON.stringify(b));
    await page.evaluate(FLY);
    await wait(1000);
    const d = await page.evaluate(DIALOG);
    check('and is not shown the explainer', !d || !/Realistic physics/.test(d.title), JSON.stringify(d && d.title));
  } finally {
    await page.close();
  }
}

async function forced() {
  console.log('?physics=classic');
  const page = await boot('built', '5inch', { url: '/index.html?physics=classic' });
  try {
    const b = await page.evaluate(READ);
    check('the address flies the classic model whatever the rows say', b.forced === true && b.shell === 0 && b.module === 0 && b.gravity === 1.62 && b.five !== false, JSON.stringify(b));
    await page.evaluate(FLY);
    await page.until("window.__mode === 'flight'", 60000);
    check('with no explainer', (await page.evaluate(DIALOG)) === null);
  } finally {
    await page.close();
  }
}

const modes = [await fiveInch('built'), await fiveInch('field')];
check('one freestyle map and one race course were flown', modes.includes('freestyle') && modes.some((m) => m !== 'freestyle'), modes.join(', '));
await oldFeel();
await whoop();
await firstVisit();
await forced();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exitCode = failures ? 1 : 0;
