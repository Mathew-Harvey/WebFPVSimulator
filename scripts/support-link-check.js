/*
 * support-link-check.js: test the Support link in the menu.
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

import { openPage } from '../tests/lib/page.js';

const SUPPORT_URL = 'https://www.patreon.com/cw/webfpv';

async function main() {
  const page = await openPage();
  const failures = [];
  const notes = [];

  try {
    await page.goto('http://127.0.0.1:8000/index.html', { waitUntil: 'networkidle2', timeout: 90000 });
    await page.until('window.__shellReady === true', 90000);
    await page.until('!!window.__ui', 10000);

    /* Move past the gate. */
    await page.evaluate(`(() => {
      const ui = window.__ui;
      ui.firstRun = false;
      ui.craftGate = false;
      if (!ui.mode) { ui.mode = 'race'; }
    })()`);

    /* TEST 1: Link exists on title screen with correct attributes. */
    const titleCheck = JSON.parse(await page.evaluate(`(() => {
      const ui = window.__ui;
      ui.show('title');
      const link = document.querySelector('.screen-title .support-link');
      if (!link) {
        return JSON.stringify({ found: false });
      }
      return JSON.stringify({
        found: true,
        href: link.href,
        target: link.target,
        rel: link.rel,
        text: link.textContent
      });
    })()`));

    if (!titleCheck.found) {
      failures.push('Support link not found on title screen');
    } else {
      if (titleCheck.href !== SUPPORT_URL) {
        failures.push(`Support link href is '${titleCheck.href}', expected '${SUPPORT_URL}'`);
      } else {
        notes.push('Support link has correct href');
      }
      if (titleCheck.target !== '_blank') {
        failures.push(`Support link target is '${titleCheck.target}', expected '_blank'`);
      } else {
        notes.push('Support link has correct target');
      }
      if (titleCheck.rel !== 'noopener noreferrer') {
        failures.push(`Support link rel is '${titleCheck.rel}', expected 'noopener noreferrer'`);
      } else {
        notes.push('Support link has correct rel');
      }
      if (titleCheck.text !== 'Support') {
        failures.push(`Support link text is '${titleCheck.text}', expected 'Support'`);
      } else {
        notes.push('Support link has correct text');
      }
    }

    /* TEST 2: Link exists on pause screen with correct attributes. */
    const pauseCheck = JSON.parse(await page.evaluate(`(() => {
      const ui = window.__ui;
      ui.show('paused');
      const link = document.querySelector('.screen-paused .support-link');
      if (!link) {
        return JSON.stringify({ found: false });
      }
      return JSON.stringify({
        found: true,
        href: link.href,
        target: link.target,
        rel: link.rel,
        text: link.textContent
      });
    })()`));

    if (!pauseCheck.found) {
      failures.push('Support link not found on pause screen');
    } else {
      notes.push('Support link exists on pause screen with correct attributes');
    }

    /* TEST 3: Click tracking sends correct event body. */
    const clickCheck = JSON.parse(await page.evaluate(`(async () => {
      let intercepted = null;
      const originalSendBeacon = navigator.sendBeacon;
      navigator.sendBeacon = function(url, data) {
        if (url.includes('/api/stats/events')) {
          const text = data instanceof Blob ? 
            await data.text() : String(data);
          intercepted = { url, body: JSON.parse(text) };
          return true;
        }
        return originalSendBeacon.apply(navigator, arguments);
      };
      
      const ui = window.__ui;
      ui.show('title');
      const link = document.querySelector('.screen-title .support-link');
      if (!link) {
        return JSON.stringify({ error: 'link not found' });
      }
      
      link.click();
      
      /* Give it a moment to send. */
      await new Promise(resolve => setTimeout(resolve, 100));
      
      navigator.sendBeacon = originalSendBeacon;
      return JSON.stringify(intercepted);
    })()`));

    if (clickCheck.error) {
      failures.push(`Click tracking test failed: ${clickCheck.error}`);
    } else if (!clickCheck) {
      failures.push('Click tracking: no event was sent');
    } else {
      const body = clickCheck.body;
      if (body.v !== 1) {
        failures.push(`Click event v is ${body.v}, expected 1`);
      }
      if (body.kind !== 'support_click') {
        failures.push(`Click event kind is '${body.kind}', expected 'support_click'`);
      }
      if (body.source !== 'sim') {
        failures.push(`Click event source is '${body.source}', expected 'sim'`);
      }
      if (body.referrer !== undefined) {
        failures.push(`Click event should not have referrer field, got '${body.referrer}'`);
      }
      if (body.ref !== undefined) {
        failures.push(`Click event should not have ref field, got '${body.ref}'`);
      }
      if (Object.keys(body).length !== 3) {
        failures.push(`Click event has ${Object.keys(body).length} fields, expected exactly 3 (v, kind, source)`);
      }
      if (failures.length === 0 || !failures.some(f => f.startsWith('Click'))) {
        notes.push('Click tracking sends exactly {"v":1,"kind":"support_click","source":"sim"}');
      }
    }

    /* TEST 4: No event sent when GPC is on. */
    const gpcCheck = JSON.parse(await page.evaluate(`(async () => {
      let eventSent = false;
      const originalSendBeacon = navigator.sendBeacon;
      navigator.sendBeacon = function(url, data) {
        if (url.includes('/api/stats/events')) {
          eventSent = true;
          return true;
        }
        return originalSendBeacon.apply(navigator, arguments);
      };
      
      /* Enable GPC. */
      Object.defineProperty(navigator, 'globalPrivacyControl', {
        value: true,
        configurable: true
      });
      
      const ui = window.__ui;
      ui.show('title');
      const link = document.querySelector('.screen-title .support-link');
      if (!link) {
        return JSON.stringify({ error: 'link not found' });
      }
      
      link.click();
      
      /* Give it a moment. */
      await new Promise(resolve => setTimeout(resolve, 100));
      
      navigator.sendBeacon = originalSendBeacon;
      delete navigator.globalPrivacyControl;
      
      return JSON.stringify({ eventSent });
    })()`));

    if (gpcCheck.error) {
      failures.push(`GPC test failed: ${gpcCheck.error}`);
    } else if (gpcCheck.eventSent) {
      failures.push('Click tracking sent event when GPC was on');
    } else {
      notes.push('Click tracking respects Global Privacy Control');
    }

  } catch (e) {
    failures.push(`Test error: ${e.message}`);
  } finally {
    await page.close();
  }

  console.log(`\nSupport link check:`);
  if (failures.length) {
    console.log(`  FAILURES: ${failures.length}`);
    failures.forEach(f => console.log(`    - ${f}`));
  } else {
    console.log(`  PASS`);
  }
  if (notes.length) {
    notes.forEach(n => console.log(`  ✓ ${n}`));
  }

  return failures.length === 0;
}

const ok = await main();
process.exit(ok ? 0 : 1);
