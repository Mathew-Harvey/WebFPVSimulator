/*
 * replay-test.js: headless browser tests for replay mode
 *
 * This file is part of WebFPVSimulator - GPLv3
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { openPage } from './lib/page.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const fixtureGhost = JSON.parse(
  readFileSync(new URL('./fixtures/ghost-tm-aae280e5.json', import.meta.url), 'utf-8')
);

const fixtureTrackPayload = {
  id: 'trk-test0001',
  name: 'Test Track',
  author: 'test',
  board: 'http://127.0.0.1:3100',
  document: {
    schemaVersion: 1,
    id: 'trk-test0001',
    name: 'Test Track',
    trackClass: 'full',
    createdUtc: '2026-01-01T00:00:00Z',
    modifiedUtc: '2026-01-01T00:00:00Z',
    field: { width: 50, depth: 50, gridSize: 1 },
    settings: { tangentScale: 0.74, minCurveRadius: 2.5, samplesPerSegment: 48 },
    branding: { logo: null, logoName: '' },
    elements: [
      {
        id: 'el-1',
        type: 'gate',
        name: '0',
        position: { x: 10, y: 10, z: 0 },
        yaw: 0,
        pitch: 0,
        yawOverridden: false,
        dims: { levels: 1, sillH: 0, clearW: 1.524, clearH: 1.524, levelPitch: 1.557401 }
      },
      {
        id: 'el-2',
        type: 'startPads',
        name: 'Grid',
        position: { x: 5, y: 5, z: 0 },
        yaw: 0,
        pitch: 0,
        yawOverridden: false,
        dims: { pads: 2, spacing: 1.5, padSize: 0.6 }
      }
    ],
    sequence: [
      { id: 'sq-1', elementId: 'el-1', apertureIndex: 0, entry: -1, passSide: null, clearance: null, overridden: false }
    ]
  }
};

async function testNormalBoot() {
  const page = await openPage({ root: ROOT });
  try {
    await page.until('window.__shellReady === true', 120000);
    
    const info = await page.evaluate('JSON.stringify(window.__replayInfo())');
    const parsed = JSON.parse(info);
    if (parsed.active !== false) {
      throw new Error(`Normal boot should have replay inactive, got active=${parsed.active}`);
    }
    
    console.log(' ok   normal boot reaches __shellReady with replay inactive');
  } finally {
    await page.close();
  }
}

async function testReplaySuccess() {
  const page = await openPage({
    root: ROOT,
    url: '/index.html?map=custom&share=trk-test0001&board=http://127.0.0.1:3100&replay=tm-aae280e5&cam=fpv&clean=1',
    seed: [
      `(function() {
        var origFetch = window.fetch;
        var trackData = '${JSON.stringify(fixtureTrackPayload).replace(/'/g, "\\'")}';
        var ghostData = '${JSON.stringify(fixtureGhost).replace(/'/g, "\\'")}';
        window.fetch = function(url, opts) {
          var urlStr = typeof url === 'string' ? url : (url instanceof Request ? url.url : String(url));
          if (urlStr.includes('/api/tracks/trk-test0001/document')) {
            return Promise.resolve(new Response(trackData, {
              status: 200, headers: { 'content-type': 'application/json' }
            }));
          }
          if (urlStr.includes('/api/tracks/trk-test0001/times/tm-aae280e5/ghost')) {
            return Promise.resolve(new Response(ghostData, {
              status: 200, headers: { 'content-type': 'application/json' }
            }));
          }
          if (urlStr.includes('/api/tracks/trk-test0001') && !urlStr.includes('/document') && !urlStr.includes('/times/')) {
            return Promise.resolve(new Response(JSON.stringify({
              id: 'trk-test0001',
              times: [{ id: 'tm-aae280e5', name: 'test', lapMs: 5000, hasGhost: true }]
            }), {
              status: 200, headers: { 'content-type': 'application/json' }
            }));
          }
          return origFetch.call(this, url, opts);
        };
      })();`
    ],
  });
  try {
    await page.until('window.__shellReady === true', 120000);
    await page.until('window.__replayInfo && window.__replayInfo().state === "ready" && window.__replayInfo().ghostLoaded', 30000);
    
    const mode = await page.evaluate('window.__mode');
    if (mode !== 'flight') {
      throw new Error(`Replay should start in flight mode, got ${mode}`);
    }
    
    const uiHidden = await page.evaluate('document.getElementById("ui") && document.getElementById("ui").style.display === "none"');
    if (!uiHidden) {
      throw new Error('UI should be hidden with clean=1');
    }
    
    await page.sleep(200);
    
    const result1 = await page.evaluate(`(function() {
      window.__replayStep(0);
      window.__replayStep(1000);
      return new Promise(function(r) {
        requestAnimationFrame(function() {
          var info = window.__replayInfo();
          if (!info.cameraPosition) throw new Error('Camera position not available');
          r(JSON.stringify({ vt: info.clock.vt, x: info.cameraPosition.x, y: info.cameraPosition.y, z: info.cameraPosition.z }));
        });
      });
    })()`);
    
    const result2 = await page.evaluate(`(function() {
      window.__replayStep(0);
      window.__replayStep(1000);
      return new Promise(function(r) {
        requestAnimationFrame(function() {
          var info = window.__replayInfo();
          r(JSON.stringify({ vt: info.clock.vt, x: info.cameraPosition.x, y: info.cameraPosition.y, z: info.cameraPosition.z }));
        });
      });
    })()`);
    
    const r1 = JSON.parse(result1);
    const r2 = JSON.parse(result2);
    
    if (r1.vt !== 1000 || r2.vt !== 1000) {
      throw new Error(`Step should advance to 1000ms, got ${r1.vt} and ${r2.vt}`);
    }
    
    const dx = Math.abs(r1.x - r2.x);
    const dy = Math.abs(r1.y - r2.y);
    const dz = Math.abs(r1.z - r2.z);
    if (dx > 0.001 || dy > 0.001 || dz > 0.001) {
      throw new Error(`Camera not deterministic: delta ${dx.toFixed(4)}, ${dy.toFixed(4)}, ${dz.toFixed(4)}`);
    }
    
    if (!Number.isFinite(r1.x) || !Number.isFinite(r1.y) || !Number.isFinite(r1.z)) {
      throw new Error(`Camera position not finite: ${JSON.stringify(r1)}`);
    }
    
    const resetTest = await page.evaluate(`(function() {
      window.__replayStep(2000);
      var before = window.__replayInfo().clock.vt;
      window.__replayStep(0);
      var after = window.__replayInfo().clock.vt;
      return JSON.stringify({ before: before, after: after });
    })()`);
    
    const reset = JSON.parse(resetTest);
    if (reset.before !== 3000 || reset.after !== 0) {
      throw new Error(`Step(0) should reset vt, got before=${reset.before}, after=${reset.after}`);
    }
    
    console.log(' ok   replay starts in flight, UI hidden, stepping is deterministic, step(0) resets');
  } finally {
    await page.close();
  }
}

async function testMissingListing() {
  const page = await openPage({
    root: ROOT,
    url: '/index.html?map=custom&share=trk-notfound&replay=tm-00000001',
    seed: [
      `(function() {
        var origFetch = window.fetch;
        window.fetch = function(url, opts) {
          var urlStr = typeof url === 'string' ? url : (url instanceof Request ? url.url : String(url));
          if (urlStr.includes('/api/tracks/')) {
            return Promise.resolve(new Response(JSON.stringify({ error: 'Not found' }), {
              status: 404, headers: { 'content-type': 'application/json' }
            }));
          }
          return origFetch.call(this, url, opts);
        };
      })();`
    ],
  });
  try {
    await page.until('window.__shellReady === true', 120000);
    await page.sleep(2000);
    
    const info = await page.evaluate('JSON.stringify(window.__replayInfo())');
    const parsed = JSON.parse(info);
    if (parsed.state !== 'failed') {
      throw new Error(`Missing listing should result in state 'failed', got ${parsed.state}`);
    }
    
    if (parsed.active !== false) {
      throw new Error(`replayMode should be false after failure, got ${parsed.active}`);
    }
    
    const canFly = await page.evaluate('window.__mode !== undefined && typeof window.__race === "function"');
    if (!canFly) {
      throw new Error('Physics should work after failure');
    }
    
    console.log(' ok   missing listing sets state=failed, replayMode=false, physics works');
  } finally {
    await page.close();
  }
}

async function testFailureRestoresUI() {
  const page = await openPage({
    root: ROOT,
    url: '/index.html?map=custom&share=trk-test0002&replay=tm-00000002&clean=1',
    seed: [
      `(function() {
        var origFetch = window.fetch;
        var trackData = '${JSON.stringify({...fixtureTrackPayload, id: 'trk-test0002', document: {...fixtureTrackPayload.document, id: 'trk-test0002'}}).replace(/'/g, "\\'")}';
        window.fetch = function(url, opts) {
          var urlStr = typeof url === 'string' ? url : (url instanceof Request ? url.url : String(url));
          if (urlStr.includes('/api/tracks/trk-test0002/document')) {
            return Promise.resolve(new Response(trackData, {
              status: 200, headers: { 'content-type': 'application/json' }
            }));
          }
          if (urlStr.includes('/api/tracks/trk-test0002') && !urlStr.includes('/document') && !urlStr.includes('/times/')) {
            return Promise.resolve(new Response(JSON.stringify({
              id: 'trk-test0002',
              times: [{ id: 'tm-00000002', name: 'test', lapMs: 5000, hasGhost: true }]
            }), {
              status: 200, headers: { 'content-type': 'application/json' }
            }));
          }
          if (urlStr.includes('/ghost')) {
            return Promise.resolve(new Response(JSON.stringify({ error: 'Not found' }), {
              status: 404, headers: { 'content-type': 'application/json' }
            }));
          }
          return origFetch.call(this, url, opts);
        };
      })();`
    ],
  });
  try {
    await page.until('window.__shellReady === true', 120000);
    await page.until('window.__replayInfo && window.__replayInfo().state === "failed"', 10000);
    
    const uiVisible = await page.evaluate('(function() { var ui = document.getElementById("ui"); return ui && ui.style.display !== "none"; })()');
    if (!uiVisible) {
      throw new Error('UI should be restored (visible) after failure with clean=1');
    }
    
    const hasNotice = await page.evaluate('(function() { var text = document.body.textContent || ""; return text.includes("failed") || text.includes("fetch") || text.includes("ghost"); })()');
    if (!hasNotice) {
      throw new Error('Failure banner should be visible after error');
    }
    
    console.log(' ok   clean=1 failure restores #ui and shows visible banner');
  } finally {
    await page.close();
  }
}

async function testSponsorContentHidden() {
  const trackWithLogos = {
    ...fixtureTrackPayload,
    id: 'trk-test0003',
    document: {
      ...fixtureTrackPayload.document,
      id: 'trk-test0003',
      branding: {
        logos: [{
          id: 'logo-1',
          image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          name: 'test-logo.png'
        }]
      },
      elements: [
        ...fixtureTrackPayload.document.elements,
        {
          id: 'el-logo-1',
          type: 'groundLogo',
          name: 'Sponsor 1',
          position: { x: 15, y: 15, z: 0 },
          yaw: 0,
          pitch: 0,
          yawOverridden: false,
          dims: { width: 10, depth: 4 },
          logoId: 'logo-1'
        }
      ]
    }
  };
  
  /* Control case: clean=0, sponsors should be present */
  const pageControl = await openPage({
    root: ROOT,
    url: '/index.html?map=custom&share=trk-test0003&board=http://127.0.0.1:3100&replay=tm-aae280e5&cam=fpv',
    seed: [
      `(function() {
        var origFetch = window.fetch;
        var trackData = '${JSON.stringify(trackWithLogos).replace(/'/g, "\\'")}';
        var ghostData = '${JSON.stringify(fixtureGhost).replace(/'/g, "\\'")}';
        window.fetch = function(url, opts) {
          var urlStr = typeof url === 'string' ? url : (url instanceof Request ? url.url : String(url));
          if (urlStr.includes('/api/tracks/trk-test0003/document')) {
            return Promise.resolve(new Response(trackData, {
              status: 200, headers: { 'content-type': 'application/json' }
            }));
          }
          if (urlStr.includes('/api/tracks/trk-test0003/times/tm-aae280e5/ghost')) {
            return Promise.resolve(new Response(ghostData, {
              status: 200, headers: { 'content-type': 'application/json' }
            }));
          }
          if (urlStr.includes('/api/tracks/trk-test0003') && !urlStr.includes('/document') && !urlStr.includes('/times/')) {
            return Promise.resolve(new Response(JSON.stringify({
              id: 'trk-test0003',
              times: [{ id: 'tm-aae280e5', name: 'test', lapMs: 5000, hasGhost: true }]
            }), {
              status: 200, headers: { 'content-type': 'application/json' }
            }));
          }
          return origFetch.call(this, url, opts);
        };
      })();`
    ],
  });
  try {
    await pageControl.until('window.__shellReady === true', 120000);
    await pageControl.until('window.__replayInfo && window.__replayInfo().state === "ready" && window.__replayInfo().ghostLoaded', 30000);
    
    await pageControl.sleep(500);
    
    const controlHidden = await pageControl.evaluate('window.__map && window.__map().sponsorsHidden');
    
    if (controlHidden !== false) {
      throw new Error(`Control case: sponsors should be present (sponsorsHidden=false), got ${controlHidden}`);
    }
  } finally {
    await pageControl.close();
  }
  
  /* Test case: clean=1, sponsors should be hidden */
  const pageTest = await openPage({
    root: ROOT,
    url: '/index.html?map=custom&share=trk-test0003&board=http://127.0.0.1:3100&replay=tm-aae280e5&cam=fpv&clean=1',
    seed: [
      `(function() {
        var origFetch = window.fetch;
        var trackData = '${JSON.stringify(trackWithLogos).replace(/'/g, "\\'")}';
        var ghostData = '${JSON.stringify(fixtureGhost).replace(/'/g, "\\'")}';
        window.fetch = function(url, opts) {
          var urlStr = typeof url === 'string' ? url : (url instanceof Request ? url.url : String(url));
          if (urlStr.includes('/api/tracks/trk-test0003/document')) {
            return Promise.resolve(new Response(trackData, {
              status: 200, headers: { 'content-type': 'application/json' }
            }));
          }
          if (urlStr.includes('/api/tracks/trk-test0003/times/tm-aae280e5/ghost')) {
            return Promise.resolve(new Response(ghostData, {
              status: 200, headers: { 'content-type': 'application/json' }
            }));
          }
          if (urlStr.includes('/api/tracks/trk-test0003') && !urlStr.includes('/document') && !urlStr.includes('/times/')) {
            return Promise.resolve(new Response(JSON.stringify({
              id: 'trk-test0003',
              times: [{ id: 'tm-aae280e5', name: 'test', lapMs: 5000, hasGhost: true }]
            }), {
              status: 200, headers: { 'content-type': 'application/json' }
            }));
          }
          return origFetch.call(this, url, opts);
        };
      })();`
    ],
  });
  try {
    await pageTest.until('window.__shellReady === true', 120000);
    await pageTest.until('window.__replayInfo && window.__replayInfo().state === "ready" && window.__replayInfo().ghostLoaded', 30000);
    
    await pageTest.sleep(500);
    
    const testHidden = await pageTest.evaluate('window.__map && window.__map().sponsorsHidden');
    
    if (testHidden !== true) {
      throw new Error(`Test case: sponsors should be hidden (sponsorsHidden=true), got ${testHidden}`);
    }
    
    console.log(' ok   clean=1 hides sponsor content (turf decals and gate banners)');
  } finally {
    await pageTest.close();
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
  
  try {
    await testSponsorContentHidden();
    pass++;
  } catch (e) {
    console.log(` FAIL sponsor content hidden: ${e.message}`);
    fail++;
  }
  
  console.log(`\n${pass + fail} tests: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
