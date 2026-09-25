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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function main() {
  const page = await openPage({ root });
  const failures = [];
  const notes = [];

  try {
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
      const items = ui.items();
      const supportItem = items.find(it => it && it.action === 'support');
      if (!supportItem) {
        return JSON.stringify({ found: false });
      }
      return JSON.stringify({
        found: true,
        label: supportItem.label,
        action: supportItem.action
      });
    })()`));

    if (!titleCheck.found) {
      failures.push('Support item not found in title menu items');
    } else {
      if (titleCheck.label !== 'Support') {
        failures.push(`Support item label is '${titleCheck.label}', expected 'Support'`);
      } else {
        notes.push('Support item has correct label');
      }
      if (titleCheck.action !== 'support') {
        failures.push(`Support item action is '${titleCheck.action}', expected 'support'`);
      } else {
        notes.push('Support item has correct action');
      }
    }

    /* TEST 2: Link exists on pause screen. */
    const pauseCheck = JSON.parse(await page.evaluate(`(() => {
      const ui = window.__ui;
      ui.show('paused');
      const items = ui.items();
      const supportItem = items.find(it => it && it.action === 'support');
      return JSON.stringify({ found: Boolean(supportItem) });
    })()`));

    if (!pauseCheck.found) {
      failures.push('Support item not found in pause menu');
    } else {
      notes.push('Support item exists on pause screen');
    }

    /* TEST 3: Click tracking sends correct event body. */
    const clickCheck = JSON.parse(await page.evaluate(`(() => {
      return new Promise((resolve) => {
        let intercepted = null;
        const originalSendBeacon = navigator.sendBeacon;
        navigator.sendBeacon = function(url, data) {
          if (url.includes('/api/stats/events')) {
            let text = '';
            if (data instanceof Blob) {
              const reader = new FileReader();
              reader.onload = function() {
                intercepted = { url, body: JSON.parse(reader.result) };
                resolve(JSON.stringify(intercepted));
              };
              reader.readAsText(data);
              return true;
            } else {
              text = String(data);
              intercepted = { url, body: JSON.parse(text) };
              resolve(JSON.stringify(intercepted));
              return true;
            }
          }
          return originalSendBeacon.apply(navigator, arguments);
        };
        
        import('/src/share/support.js').then((m) => {
          m.trackSupportClick();
          setTimeout(() => {
            navigator.sendBeacon = originalSendBeacon;
            resolve(JSON.stringify(intercepted));
          }, 100);
        });
      });
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

    /* TEST 4: No event sent when GPC is on. Also stub fetch in case
     * sendBeacon is not available. */
    const gpcCheck = JSON.parse(await page.evaluate(`(() => {
      return new Promise((resolve) => {
        let eventSent = false;
        const originalSendBeacon = navigator.sendBeacon;
        const originalFetch = window.fetch;
        navigator.sendBeacon = function(url, data) {
          if (url.includes('/api/stats/events')) {
            eventSent = true;
            return true;
          }
          return originalSendBeacon.apply(navigator, arguments);
        };
        window.fetch = function(url, options) {
          if (url.includes('/api/stats/events')) {
            eventSent = true;
            return Promise.resolve(new Response());
          }
          return originalFetch.apply(window, arguments);
        };
        
        /* Enable GPC. */
        Object.defineProperty(navigator, 'globalPrivacyControl', {
          value: true,
          configurable: true
        });
        
        import('/src/share/support.js').then((m) => {
          m.trackSupportClick();
          setTimeout(() => {
            navigator.sendBeacon = originalSendBeacon;
            window.fetch = originalFetch;
            delete navigator.globalPrivacyControl;
            resolve(JSON.stringify({ eventSent }));
          }, 100);
        });
      });
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
