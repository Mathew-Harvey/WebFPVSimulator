/*
 * replay-test.js: headless browser tests for replay mode
 *
 * Tests that replay mode works correctly with stubbed ghost data,
 * handles errors gracefully, and doesn't break normal play.
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

import { readFileSync } from 'fs';
import { openPage } from './lib/page.js';

const fixtureGhost = JSON.parse(
  readFileSync(new URL('./fixtures/ghost-tm-aae280e5.json', import.meta.url), 'utf-8')
);

const fixtureTrack = {
  id: 'trk-test0001',
  name: 'Test Track',
  author: 'test',
  version: 1,
  gates: [],
};

async function testNormalBoot() {
  const page = await openPage();
  try {
    await page.until(() => window.__shellReady === true, 120000);
    
    const info = await page.evaluate(() => window.__replayInfo());
    if (info.active !== false) {
      throw new Error(`Normal boot should have replay inactive, got active=${info.active}`);
    }
    
    console.log(' ok   normal boot reaches __shellReady with replay inactive');
  } finally {
    await page.close();
  }
}

async function setupIntercept(page, trackId, timeId, ghostData, trackData) {
  /* Enable Fetch domain for all requests */
  await page.cdp.send('Fetch.enable', {
    patterns: [{ urlPattern: '*' }],
  }, page.sessionId);
  
  /* Set up request interception */
  const handler = async (msg) => {
    if (msg.method !== 'Fetch.requestPaused') {
      return;
    }
    const { requestId, request } = msg.params;
    const url = request.url;
    
    try {
      if (url.includes(`/board/api/tracks/${trackId}`) && !url.includes('/times/')) {
        await page.cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'content-type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify(trackData)).toString('base64'),
        }, page.sessionId);
      } else if (url.includes(`/board/api/tracks/${trackId}/times/${timeId}/ghost`)) {
        await page.cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'content-type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify(ghostData)).toString('base64'),
        }, page.sessionId);
      } else if (url.includes('cdn.jsdelivr.net')) {
        /* Let the existing CDN handler deal with it */
        await page.cdp.send('Fetch.continueRequest', { requestId }, page.sessionId);
      } else {
        await page.cdp.send('Fetch.continueRequest', { requestId }, page.sessionId);
      }
    } catch (e) {
      await page.cdp.send('Fetch.failRequest', {
        requestId,
        errorReason: 'Failed'
      }, page.sessionId).catch(() => {});
    }
  };
  
  page.cdp.onEvent(handler);
}

async function setup404Intercept(page, trackId, timeId, trackData) {
  await page.cdp.send('Fetch.enable', {
    patterns: [{ urlPattern: '*' }],
  }, page.sessionId);
  
  const handler = async (msg) => {
    if (msg.method !== 'Fetch.requestPaused') {
      return;
    }
    const { requestId, request } = msg.params;
    const url = request.url;
    
    try {
      if (url.includes(`/board/api/tracks/${trackId}`) && !url.includes('/times/')) {
        await page.cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'content-type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify(trackData)).toString('base64'),
        }, page.sessionId);
      } else if (url.includes('/ghost')) {
        await page.cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 404,
          responseHeaders: [{ name: 'content-type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify({ error: 'Not found' })).toString('base64'),
        }, page.sessionId);
      } else if (url.includes('cdn.jsdelivr.net')) {
        await page.cdp.send('Fetch.continueRequest', { requestId }, page.sessionId);
      } else {
        await page.cdp.send('Fetch.continueRequest', { requestId }, page.sessionId);
      }
    } catch (e) {
      await page.cdp.send('Fetch.failRequest', {
        requestId,
        errorReason: 'Failed'
      }, page.sessionId).catch(() => {});
    }
  };
  
  page.cdp.onEvent(handler);
}

async function setupMissingTrackIntercept(page) {
  await page.cdp.send('Fetch.enable', {
    patterns: [{ urlPattern: '*' }],
  }, page.sessionId);
  
  const handler = async (msg) => {
    if (msg.method !== 'Fetch.requestPaused') {
      return;
    }
    const { requestId, request } = msg.params;
    const url = request.url;
    
    try {
      if (url.includes('/board/api/tracks/')) {
        await page.cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 404,
          responseHeaders: [{ name: 'content-type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify({ error: 'Not found' })).toString('base64'),
        }, page.sessionId);
      } else if (url.includes('cdn.jsdelivr.net')) {
        await page.cdp.send('Fetch.continueRequest', { requestId }, page.sessionId);
      } else {
        await page.cdp.send('Fetch.continueRequest', { requestId }, page.sessionId);
      }
    } catch (e) {
      await page.cdp.send('Fetch.failRequest', {
        requestId,
        errorReason: 'Failed'
      }, page.sessionId).catch(() => {});
    }
  };
  
  page.cdp.onEvent(handler);
}

async function testReplaySuccess() {
  const page = await openPage();
  try {
    await setupIntercept(page, 'trk-test0001', 'tm-aae280e5', fixtureGhost, fixtureTrack);
    
    await page.cdp.send('Page.navigate', {
      url: `${page.origin}/sim/?map=custom&share=trk-test0001&replay=tm-aae280e5&cam=fpv&clean=1`
    }, page.sessionId);
    
    await page.until(() => window.__shellReady === true, 120000);
    
    /* Wait for ghost to load and replay to be ready */
    await page.until(() => {
      const info = window.__replayInfo();
      return info.state === 'ready' && info.ghostLoaded;
    }, 30000);
    
    const mode = await page.evaluate(() => window.__mode);
    if (mode !== 'flight') {
      throw new Error(`Replay should start in flight mode, got ${mode}`);
    }
    
    const uiHidden = await page.evaluate(() => {
      const ui = document.getElementById('ui');
      return ui && ui.style.display === 'none';
    });
    if (!uiHidden) {
      throw new Error('UI should be hidden with clean=1');
    }
    
    /* Test deterministic stepping */
    await page.sleep(200);
    
    const result1 = await page.evaluate(() => {
      window.__replayStep(0);
      window.__replayStep(1000);
      return new Promise(r => requestAnimationFrame(() => {
        const shell = window.__shell;
        if (!shell || !shell.camera) throw new Error('Camera not found');
        const cam = shell.camera;
        r({
          vt: window.__replayInfo().clock.vt,
          x: cam.position.x,
          y: cam.position.y,
          z: cam.position.z
        });
      }));
    });
    
    const result2 = await page.evaluate(() => {
      window.__replayStep(0);
      window.__replayStep(1000);
      return new Promise(r => requestAnimationFrame(() => {
        const shell = window.__shell;
        const cam = shell.camera;
        r({
          vt: window.__replayInfo().clock.vt,
          x: cam.position.x,
          y: cam.position.y,
          z: cam.position.z
        });
      }));
    });
    
    if (result1.vt !== 1000 || result2.vt !== 1000) {
      throw new Error(`Step should advance to 1000ms, got ${result1.vt} and ${result2.vt}`);
    }
    
    /* Camera positions should match (deterministic) */
    const dx = Math.abs(result1.x - result2.x);
    const dy = Math.abs(result1.y - result2.y);
    const dz = Math.abs(result1.z - result2.z);
    if (dx > 0.001 || dy > 0.001 || dz > 0.001) {
      throw new Error(`Camera position not deterministic: delta ${dx.toFixed(4)}, ${dy.toFixed(4)}, ${dz.toFixed(4)}`);
    }
    
    /* Camera position should be finite */
    if (!Number.isFinite(result1.x) || !Number.isFinite(result1.y) || !Number.isFinite(result1.z)) {
      throw new Error(`Camera position not finite: ${JSON.stringify(result1)}`);
    }
    
    /* Test __replayStep(0) resets vt */
    const resetTest = await page.evaluate(() => {
      window.__replayStep(2000);
      const before = window.__replayInfo().clock.vt;
      window.__replayStep(0);
      const after = window.__replayInfo().clock.vt;
      return { before, after };
    });
    
    if (resetTest.before !== 3000 || resetTest.after !== 0) {
      throw new Error(`Step(0) should reset vt, got before=${resetTest.before}, after=${resetTest.after}`);
    }
    
    console.log(' ok   replay starts in flight, UI hidden, stepping is deterministic, step(0) resets');
  } finally {
    await page.close();
  }
}

async function testMissingListing() {
  const page = await openPage();
  try {
    await setupMissingTrackIntercept(page);
    
    await page.cdp.send('Page.navigate', {
      url: `${page.origin}/sim/?map=custom&share=trk-notfound&replay=tm-00000001`
    }, page.sessionId);
    
    await page.until(() => window.__shellReady === true, 120000);
    
    /* Wait a moment for the check to fail */
    await page.sleep(2000);
    
    const info = await page.evaluate(() => window.__replayInfo());
    if (info.state !== 'failed') {
      throw new Error(`Missing listing should result in state 'failed', got ${info.state}`);
    }
    
    if (info.active !== false) {
      throw new Error(`replayMode should be false after failure, got ${info.active}`);
    }
    
    /* Physics should work (can reach flight mode) */
    const canFly = await page.evaluate(() => {
      return window.__mode !== undefined && typeof window.__race === 'function';
    });
    if (!canFly) {
      throw new Error('Physics should work after failure (mode and race available)');
    }
    
    console.log(' ok   missing listing sets state=failed, replayMode=false, physics works');
  } finally {
    await page.close();
  }
}

async function testFailureRestoresUI() {
  const page = await openPage();
  try {
    await setup404Intercept(page, 'trk-test0002', 'tm-00000002', fixtureTrack);
    
    await page.cdp.send('Page.navigate', {
      url: `${page.origin}/sim/?map=custom&share=trk-test0002&replay=tm-00000002&clean=1`
    }, page.sessionId);
    
    await page.until(() => window.__shellReady === true, 120000);
    
    /* Wait for fetch to fail */
    await page.until(() => {
      const info = window.__replayInfo();
      return info.state === 'failed';
    }, 10000);
    
    const uiVisible = await page.evaluate(() => {
      const ui = document.getElementById('ui');
      return ui && ui.style.display !== 'none';
    });
    if (!uiVisible) {
      throw new Error('UI should be restored (visible) after failure with clean=1');
    }
    
    /* Check that a failure banner/notice is shown */
    const hasNotice = await page.evaluate(() => {
      const text = document.body.textContent || '';
      return text.includes('failed') || text.includes('fetch') || text.includes('ghost');
    });
    if (!hasNotice) {
      throw new Error('Failure banner should be visible after error');
    }
    
    console.log(' ok   clean=1 failure restores #ui and shows visible banner');
  } finally {
    await page.close();
  }
}

async function main() {
  console.log('replay-test: headless browser checks for replay mode\n');
  
  let pass = 0;
  let fail = 0;
  
  try {
    await testNormalBoot();
    pass++;
  } catch (e) {
    console.log(` FAIL normal boot: ${e.message}`);
    fail++;
  }
  
  try {
    await testReplaySuccess();
    pass++;
  } catch (e) {
    console.log(` FAIL replay success: ${e.message}`);
    fail++;
  }
  
  try {
    await testMissingListing();
    pass++;
  } catch (e) {
    console.log(` FAIL missing listing: ${e.message}`);
    fail++;
  }
  
  try {
    await testFailureRestoresUI();
    pass++;
  } catch (e) {
    console.log(` FAIL failure restores UI: ${e.message}`);
    fail++;
  }
  
  console.log(`\n${pass + fail} tests: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
