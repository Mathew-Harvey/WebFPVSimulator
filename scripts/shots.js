/*
 * shots.js: drive the real shell in headless Chromium and capture frames.
 *
 * Every rendering bug this project has had was found by looking at a
 * frame, so looking at frames needs to be one command. This serves the
 * repo, opens index.html in Chromium over the DevTools protocol, presses
 * keys, waits, and writes PNGs. The container's Chromium does not inherit
 * the outbound proxy, so requests to the Three.js CDN are paused with the
 * Fetch domain and fulfilled from Node, which does have the proxy, with a
 * local cache so a run does not refetch a megabyte of Three.
 *
 * Usage:
 *   node scripts/shots.js --out=DIR [--w=1600] [--h=900] [--url=/index.html]
 *                         step step step
 * Steps:
 *   wait:MS          advance wall time
 *   shot:NAME        write DIR/NAME.png, or DIR/NAME.jpg under --jpeg=Q
 *   tap:CODE         key down then up, e.g. tap:Enter
 *   down:CODE        key down, held
 *   up:CODE          key up
 *   eval:EXPR        evaluate in the page and print the value
 *   until:EXPR       poll until EXPR is truthy, fail the run after 20 s
 *   expect:EXPR      fail the run unless EXPR is truthy right now
 *   tstart:ID,X,Y    put touch point ID down at X,Y (needs --touch=1)
 *   tmove:ID,X,Y     drag touch point ID to X,Y
 *   tend:ID          lift touch point ID
 *
 * --touch=1 enables Chromium's touch emulation before the page loads, so
 * navigator.maxTouchPoints reports points and the thumb sticks mount. The
 * harness keeps the set of down points and sends the WHOLE set on every
 * event, which is what the protocol requires for multi-touch.
 *
 * until: and expect: exist because a wait in milliseconds is not evidence
 * of anything. On this container's software rasteriser a frame takes
 * about 120 ms, so a keypress followed by wait:400 can screenshot the
 * screen the player was on BEFORE the key, and the file gets a name that
 * lies. A capture of a named state must assert that state.
 *
 * Console errors and warnings are collected and printed at the end, so the
 * same run that produces the screenshots also answers the console gate.
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

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, keyInfo, describe } from '../tests/lib/page.js';
/* The storage key, from the module that owns it. ui.js is importable in
 * Node today and this line is what keeps it so: if it ever grows a browser
 * only top level import, this harness fails loudly at startup rather than
 * quietly seeding a key nothing reads. */
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
async function main() {
  const args = process.argv.slice(2);
  const opts = { out: '.loop/shots', w: 1600, h: 900, url: '/index.html' };
  const steps = [];
  for (const a of args) {
    const m = a.match(/^--([a-z]+)=(.*)$/);
    if (m) {
      opts[m[1]] = /^\d+$/.test(m[2]) ? Number(m[2]) : m[2];
    } else {
      steps.push(a);
    }
  }
  /* An absolute --out used to be pasted onto the repository root, which is
   * how four scratch screenshots from an earlier session ended up committed
   * under tmp/. A harness must not be able to write into the tree by
   * accident. */
  const outDir = isAbsolute(String(opts.out)) ? String(opts.out) : join(root, opts.out);
  await mkdir(outDir, { recursive: true });

  /*
   * The seeds run before the first line of the app, through the same door
   * the pilot uses rather than a test only hook.
   *
   * --graphics pins the quality preset, for the same reason --w and --h pin
   * the window: a cost measured at two different presets reports a
   * regression that is only a setting. Boot lowers a DETECTED preset to Low
   * when the session renderer turns out to be a CPU rasteriser, and headless
   * Chrome is always one, so without this the field's budget is measured at
   * Low here and at High on a machine with a GPU. graphicsAuto false is the
   * half that matters: it is what marks the value as chosen.
   *
   * --course=FILE seeds a track document as the builder's autosave and
   * selects the custom map. The launch block only exists on an authored
   * course, so without this there is no way to capture the pad shot at all.
   */
  const seed = [];
  if (opts.graphics) {
    seed.push(`try {
      const k = ${JSON.stringify(SETTINGS_KEY)};
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      s.graphics = ${JSON.stringify(String(opts.graphics))};
      s.graphicsAuto = false;
      localStorage.setItem(k, JSON.stringify(s));
    } catch (e) { /* Storage refused. The run still boots, at whatever
                     preset detection picks. */ }`);
  }
  if (opts.course) {
    const docText = await readFile(
      isAbsolute(String(opts.course)) ? String(opts.course)
        : join(root, String(opts.course)),
      'utf8',
    );
    seed.push(`try {
      localStorage.setItem('webfpv.trackbuilder.autosave.v1',
        JSON.stringify(${docText}));
      const k = ${JSON.stringify(SETTINGS_KEY)};
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      s.map = 'custom';
      localStorage.setItem(k, JSON.stringify(s));
    } catch (e) { /* Storage refused; the run boots on the default map. */ }`);
  }

  const page = await openPage({
    root,
    width: opts.w,
    height: opts.h,
    url: opts.url,
    touch: Boolean(opts.touch),
    seed,
  });
  const {
    cdp, sessionId, errors, warnings,
  } = page;
  /* Kept apart from console errors. Counting a sidecar failure in the same
   * total made "errors 0" two gates wearing one number, and D3 is about the
   * console. */
  const harnessFaults = [];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const step of steps) {
    const [op, ...rest] = step.split(':');
    const arg = rest.join(':');
    if (op === 'wait') {
      await sleep(Number(arg));
    } else if (op === 'throttle') {
      /*
       * Network throttling, so a loading screen can be checked against the
       * case it exists for: the network being the bottleneck rather than the
       * CPU. `throttle:0` restores full speed.
       *
       * KNOWN LIMIT, and it matters when reading a result. This harness
       * serves cdn.jsdelivr.net through Fetch.fulfillRequest from a local
       * cache, and a fulfilled request never touches the network stack, so
       * throttling does NOT reach the three.js module. It reaches everything
       * the local server answers, which is the map module graph, dist/sim.wasm
       * and the page itself, and for the city that is 61 files.
       */
      const kbps = Number(arg);
      await cdp.send('Network.enable', {}, sessionId);
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: kbps > 0 ? 40 : 0,
        downloadThroughput: kbps > 0 ? (kbps * 1024) / 8 : -1,
        uploadThroughput: kbps > 0 ? (kbps * 1024) / 8 : -1,
      }, sessionId);
      console.log(`throttle ${kbps > 0 ? `${kbps} kbps, 40 ms latency` : 'off'}`);
    } else if (op === 'shot') {
      /*
       * PNG by default, because a capture that is being LOOKED AT for a
       * rendering bug must not have compression artefacts in it.
       *
       * --jpeg=Q switches the whole run to JPEG at that quality, for the
       * generators that ship a frame into the repository rather than
       * inspecting it: og.js, gatecards.js and posters.js. A cel shaded
       * frame is a photograph as far as PNG is concerned, and the same frame
       * is four to six times smaller as a JPEG. The extension follows the
       * format so a run cannot write a JPEG called .png.
       */
      const jpeg = opts.jpeg ? Number(opts.jpeg) : 0;
      const { data } = await cdp.send('Page.captureScreenshot', jpeg
        ? { format: 'jpeg', quality: jpeg }
        : { format: 'png' }, sessionId);
      const path = join(outDir, `${arg}.${jpeg ? 'jpg' : 'png'}`);
      await writeFile(path, Buffer.from(data, 'base64'));
      console.log(`shot ${path}`);
      /* Every capture records which gate the race actually wants and where
       * that gate is on screen. Without it a G3 measurement is taken
       * against whichever ring happens to be bright in the frame, which is
       * not the same object as the target and is how G3 stayed unsettled
       * for a whole loop. Written beside the PNG so the two cannot drift
       * apart, and printed so a run's log carries it too. */
      const side = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify({
          mode: window.__mode ?? null,
          screen: window.__screen ?? null,
          viewport: { w: innerWidth, h: innerHeight },
          nextGate: typeof window.__nextGate === 'function' ? window.__nextGate() : null,
          quad: typeof window.__quadScreen === 'function' ? window.__quadScreen() : null,
        })`,
        returnByValue: true,
      }, sessionId).catch(() => null);
      if (side && !side.exceptionDetails && typeof side.result.value === 'string') {
        await writeFile(join(outDir, `${arg}.json`), `${side.result.value}\n`);
        const s = JSON.parse(side.result.value);
        const g = s.nextGate && s.nextGate.gates ? s.nextGate.gates[0] : null;
        if (g) {
          console.log(
            `  target: race gate ${s.nextGate.raceNext} (scene ${g.sceneIndex}, plate ${g.flyOrder}) ` +
            `at ${g.distance.toFixed(1)} m depth ${g.depth.toFixed(1)} m, ` +
            `screen ${g.screen.x.toFixed(0)},${g.screen.y.toFixed(0)}${g.screen.mirrored ? ' MIRRORED, behind the camera' : ''}, ` +
            `${g.centreInFrame ? 'centre in frame' : 'centre NOT in frame'}, ` +
            `aperture ${g.aperturePx == null ? 'refused' : `${g.aperturePx.toFixed(1)} px`}, ` +
            `glow sampled ${g.glowGainSampled.toFixed(2)}`,
          );
        } else if (s.nextGate && s.nextGate.gateless === true) {
          /*
           * A FREESTYLE MAP HAS NO GATES, AND THAT IS AN ANSWER.
           *
           * The fault below is right for the race field: a capture that
           * claims anything about the target has to record which gate the
           * race wanted, because every G3 measurement taken without it
           * measured whichever ring happened to be bright rather than the
           * one the race was aiming at. On a map with no gates the same rule
           * fails every capture even when the frame is perfect.
           *
           * The opt out is deliberately NOT a command line flag. A flag can
           * be passed on the race field, by habit or by a copied command
           * line, and then the gate that matters is gone. This reads the
           * PAGE's own answer: the shell reports `gateless: true` only for a
           * map whose gate list is empty, so the race field can never produce
           * it, and the check stays exactly as strong there as it was.
           */
          console.log(`  target: none, ${s.nextGate.mapId} is a ${s.nextGate.mapMode} map with no gates`);
        } else {
          harnessFaults.push(`shot ${arg}: window.__nextGate returned nothing, so the capture cannot support a G3 claim`);
        }
      } else {
        harnessFaults.push(`shot ${arg}: the aim sidecar could not be evaluated`);
      }
    } else if (op === 'tap' || op === 'down' || op === 'up') {
      const info = keyInfo(arg);
      if (op !== 'up') {
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...info }, sessionId);
      }
      if (op !== 'down') {
        if (op === 'tap') {
          await sleep(30);
        }
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...info }, sessionId);
      }
    } else if (op === 'eval') {
      const r = await cdp.send('Runtime.evaluate', {
        expression: arg, returnByValue: true, awaitPromise: true,
      }, sessionId);
      if (r.exceptionDetails) {
        console.log(`eval ${arg} threw: ${JSON.stringify(r.exceptionDetails.exception ?? r.exceptionDetails.text)}`);
      } else {
        console.log(`eval ${arg} = ${JSON.stringify(r.result.value)}`);
      }
    } else if (op === 'tstart' || op === 'tmove') {
      const [id, x, y] = arg.split(',').map(Number);
      touches.set(id, { x, y });
      await cdp.send('Input.dispatchTouchEvent', {
        type: op === 'tstart' ? 'touchStart' : 'touchMove',
        touchPoints: touchPoints(),
      }, sessionId);
    } else if (op === 'tend') {
      const id = Number(arg);
      touches.delete(id);
      /* touchEnd carries the points that remain down. */
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: touchPoints(),
      }, sessionId);
    } else if (op === 'click' || op === 'move') {
      const [x, y] = arg.split(',').map(Number);
      const common = { x, y, button: 'left', clickCount: 1 };
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...common }, sessionId);
      if (op === 'click') {
        await sleep(60);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...common }, sessionId);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...common }, sessionId);
      }
    } else if (op === 'until' || op === 'expect') {
      const deadline = Date.now() + (op === 'until' ? 20000 : 0);
      let value;
      for (;;) {
        const r = await cdp.send('Runtime.evaluate', {
          expression: arg, returnByValue: true,
        }, sessionId).catch(() => null);
        value = r && !r.exceptionDetails ? r.result.value : undefined;
        if (value) {
          break;
        }
        if (Date.now() >= deadline) {
          errors.push(`${op} failed: ${arg} was ${JSON.stringify(value)}`);
          console.log(`  FAIL ${op} ${arg} = ${JSON.stringify(value)}`);
          break;
        }
        await sleep(120);
      }
      if (value) {
        console.log(`${op} ${arg} ok`);
      }
    } else {
      throw new Error(`unknown step ${step}`);
    }
  }

  console.log(`console errors=${errors.length} warnings=${warnings.length} harness faults=${harnessFaults.length}`);
  for (const f of harnessFaults) {
    console.log(`  FAULT ${f}`);
  }
  for (const e of errors) {
    console.log(`  ERR ${e}`);
  }
  for (const w of warnings) {
    console.log(`  WARN ${w}`);
  }

  await page.close();
  process.exit(errors.length || harnessFaults.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`shots: ${e.message}`);
  process.exit(2);
});
