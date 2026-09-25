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
    
    await page.until('window.__mode === "flight"', 10000);
    
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
  /* Magenta logo for paint-level detection */
  const magentaLogo = 'data:image/png;base64,' + readFileSync(join(__dirname, 'fixtures', 'test-sponsor-logo.png')).toString('base64');
  
  /* Micro track with FIVE logos covering all sponsor surfaces:
   * gates, banners, flags, turf decals, whoop room */
  const sponsoredTrack = {
    schemaVersion: 1,
    id: 'trk-test0003',
    name: 'Sponsored Test Track',
    trackClass: 'micro',
    createdUtc: '2026-01-01T00:00:00Z',
    modifiedUtc: '2026-01-01T00:00:00Z',
    field: { width: 30, depth: 30, gridSize: 1 },
    settings: { tangentScale: 0.74, minCurveRadius: 2.5, samplesPerSegment: 48 },
    branding: {
      logos: [
        { id: 'logo-1', image: magentaLogo, name: 'sponsor1.png' },
        { id: 'logo-2', image: magentaLogo, name: 'sponsor2.png' },
        { id: 'logo-3', image: magentaLogo, name: 'sponsor3.png' },
        { id: 'logo-4', image: magentaLogo, name: 'sponsor4.png' },
        { id: 'logo-5', image: magentaLogo, name: 'sponsor5.png' }
      ]
    },
    elements: [
      {
        id: 'el-g0',
        type: 'gate',
        name: '0',
        position: { x: 12, y: 15, z: 0 },
        yaw: 90,
        pitch: 0,
        yawOverridden: true,
        dims: { levels: 1, sillH: 0, clearW: 1.524, clearH: 1.524, levelPitch: 1.557401 }
      },
      {
        id: 'el-g1',
        type: 'gate',
        name: '1',
        position: { x: 18, y: 15, z: 0 },
        yaw: 90,
        pitch: 0,
        yawOverridden: true,
        dims: { levels: 1, sillH: 0, clearW: 1.524, clearH: 1.524, levelPitch: 1.557401 }
      },
      {
        id: 'el-sp',
        type: 'startPads',
        name: 'Grid',
        position: { x: 8, y: 15, z: 0 },
        yaw: 90,
        pitch: 0,
        yawOverridden: false,
        dims: { pads: 2, spacing: 1.5, padSize: 0.6 }
      },
      {
        id: 'el-flag1',
        type: 'flag',
        name: 'Flag 1',
        position: { x: 15, y: 12, z: 0 },
        yaw: 0,
        pitch: 0,
        yawOverridden: false,
        dims: { height: 3, sailWidth: 1.2, sailHeight: 0.8 }
      },
      {
        id: 'el-flag2',
        type: 'flag',
        name: 'Flag 2',
        position: { x: 15, y: 18, z: 0 },
        yaw: 0,
        pitch: 0,
        yawOverridden: false,
        dims: { height: 3, sailWidth: 1.2, sailHeight: 0.8 }
      },
      {
        id: 'el-logo-1',
        type: 'groundLogo',
        name: 'Turf Logo 1',
        position: { x: 10, y: 15, z: 0 },
        yaw: 0,
        pitch: 0,
        yawOverridden: false,
        dims: { width: 4, depth: 2 },
        logoId: 'logo-1'
      },
      {
        id: 'el-logo-2',
        type: 'groundLogo',
        name: 'Turf Logo 2',
        position: { x: 20, y: 15, z: 0 },
        yaw: 0,
        pitch: 0,
        yawOverridden: false,
        dims: { width: 4, depth: 2 },
        logoId: 'logo-2'
      }
    ],
    sequence: [
      { id: 'sq-0', elementId: 'el-g0', apertureIndex: 0, entry: -1, passSide: null, clearance: null, overridden: false },
      { id: 'sq-1', elementId: 'el-g1', apertureIndex: 0, entry: -1, passSide: null, clearance: null, overridden: false }
    ]
  };
  
  const trackPayload = {
    id: 'trk-test0003',
    name: 'Sponsored Test Track',
    author: 'test',
    board: 'http://127.0.0.1:3100',
    document: sponsoredTrack
  };
  
  const stubSetup = `(function() {
    var origFetch = window.fetch;
    var trackData = ${JSON.stringify(JSON.stringify(trackPayload))};
    var ghostData = ${JSON.stringify(JSON.stringify(fixtureGhost))};
    window.fetch = function(url, opts) {
      var urlStr = typeof url === 'string' ? url : (url instanceof Request ? url.url : String(url));
      if (urlStr.includes('/api/tracks/trk-test0003/document')) {
        return Promise.resolve(new Response(trackData, {
          status: 200, headers: { 'content-type': 'application/json' }
        }));
      }
      if (urlStr.includes('/times/tm-aae280e5/ghost')) {
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
      if (urlStr.includes('127.0.0.1:3100')) {
        return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      return origFetch.call(this, url, opts);
    };
  })();`;
  
  /* Helper: count magenta pixels using canvas evaluation */
  const countMagenta = async (page) => {
    return await page.evaluate(`(function() {
      const canvas = document.getElementById('view');
      if (!canvas) return 0;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r > 200 && g < 100 && b > 200) {
          count++;
        }
      }
      return count;
    })()`);
  };
  
  /* Control: clean=0 with chase and fpv, sponsors SHOULD be visible */
  for (const cam of ['chase', 'fpv']) {
    const page = await openPage({
      root: ROOT,
      url: `/index.html?map=custom&share=trk-test0003&board=http://127.0.0.1:3100&replay=tm-aae280e5&cam=${cam}`,
      seed: [stubSetup],
      width: 1080,
      height: 1920
    });
    
    try {
      await page.until('window.__shellReady === true', 120000);
      await page.until('window.__replayInfo && window.__replayInfo().state === "ready"', 30000);
      
      let maxMagenta = 0;
      /* Step through the lap */
      for (const t of [0, 1000, 2000, 3000, 4000]) {
        await page.evaluate(`window.__replayStep(${t})`);
        await page.sleep(300);
        const magentaCount = await countMagenta(page);
        if (magentaCount > maxMagenta) {
          maxMagenta = magentaCount;
        }
      }
      
      /* Scene-level counter check */
      const paintedCount = await page.evaluate('window.__map && window.__map().sponsorsPainted');
      
      if (maxMagenta < 1000) {
        throw new Error(`Control clean=0 ${cam}: expected >=1000 magenta pixels, got ${maxMagenta}`);
      }
      if (!paintedCount || paintedCount === 0) {
        throw new Error(`Control clean=0 ${cam}: expected >0 painted sponsors, got ${paintedCount}`);
      }
    } finally {
      await page.close();
    }
  }
  
  /* Test: clean=1 with chase and fpv, sponsors MUST be hidden */
  for (const cam of ['chase', 'fpv']) {
    const page = await openPage({
      root: ROOT,
      url: `/index.html?map=custom&share=trk-test0003&board=http://127.0.0.1:3100&replay=tm-aae280e5&cam=${cam}&clean=1`,
      seed: [stubSetup],
      width: 1080,
      height: 1920
    });
    
    try {
      await page.until('window.__shellReady === true', 120000);
      await page.until('window.__replayInfo && window.__replayInfo().state === "ready"', 30000);
      
      /* Check next-gate glow is hidden */
      const glowHidden = await page.evaluate('window.__replayInfo && window.__replayInfo().nextGateGlowHidden');
      if (!glowHidden) {
        throw new Error(`Test clean=1 ${cam}: next-gate glow should be hidden`);
      }
      
      /* Check cursor is hidden */
      const cursorStyle = await page.evaluate('document.getElementById("view").style.cursor');
      if (cursorStyle !== 'none') {
        throw new Error(`Test clean=1 ${cam}: cursor should be "none", got "${cursorStyle}"`);
      }
      
      /* Step through the lap, count magenta pixels */
      for (const t of [0, 1000, 2000, 3000, 4000]) {
        await page.evaluate(`window.__replayStep(${t})`);
        await page.sleep(300);
        const magentaCount = await countMagenta(page);
        
        if (magentaCount > 0) {
          throw new Error(`Test clean=1 ${cam} t=${t}: expected 0 magenta pixels, got ${magentaCount}`);
        }
      }
      
      /* Scene-level counter check */
      const paintedCount = await page.evaluate('window.__map && window.__map().sponsorsPainted');
      if (paintedCount !== 0) {
        throw new Error(`Test clean=1 ${cam}: expected 0 painted sponsors, got ${paintedCount}`);
      }
    } finally {
      await page.close();
    }
  }
  
  console.log(' ok   clean=1 hides all sponsor content (paint-level check, gates, banners, flags, turf, whoop room)');
}

async function testReplayGuards() {
  const stubSetup = `(function() {
    var origFetch = window.fetch;
    var trackData = ${JSON.stringify(JSON.stringify(fixtureTrackPayload))};
    var ghostData = ${JSON.stringify(JSON.stringify(fixtureGhost))};
    var postCalls = [];
    var visitPings = [];
    window.fetch = function(url, opts) {
      var urlStr = typeof url === 'string' ? url : (url instanceof Request ? url.url : String(url));
      if (urlStr.includes('/api/tracks/') && urlStr.includes('/times') && opts && opts.method === 'POST') {
        postCalls.push({ url: urlStr, time: Date.now() });
        return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      if (urlStr.includes('/api/visit') && opts && opts.method === 'POST') {
        visitPings.push({ url: urlStr, time: Date.now() });
        return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      if (urlStr.includes('/api/tracks/trk-test0001/document')) {
        return Promise.resolve(new Response(trackData, { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      if (urlStr.includes('/times/tm-aae280e5/ghost')) {
        return Promise.resolve(new Response(ghostData, { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      if (urlStr.includes('/api/tracks/trk-test0001') && !urlStr.includes('/document') && !urlStr.includes('/times/')) {
        return Promise.resolve(new Response(JSON.stringify({
          id: 'trk-test0001',
          times: [{ id: 'tm-aae280e5', name: 'test', lapMs: 5000, hasGhost: true }]
        }), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      if (urlStr.includes('127.0.0.1:3100')) {
        return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      return origFetch.call(this, url, opts);
    };
    window.__getPostCalls = function() { return postCalls; };
    window.__getVisitPings = function() { return visitPings; };
  })();`;
  
  const page = await openPage({
    root: ROOT,
    url: '/index.html?map=custom&share=trk-test0001&board=http://127.0.0.1:3100&replay=tm-aae280e5&cam=fpv&clean=1',
    seed: [stubSetup],
  });
  
  try {
    await page.until('window.__shellReady === true', 120000);
    await page.until('window.__replayInfo && window.__replayInfo().state === "ready"', 30000);
    
    /* Step through entire lap */
    for (let t = 0; t <= 5000; t += 500) {
      await page.evaluate(`window.__replayStep(${t})`);
      await page.sleep(100);
    }
    
    await page.sleep(1000);
    
    /* Check no laps were recorded */
    const lapsLength = await page.evaluate('window.__race && window.__race().laps && window.__race().laps.length');
    if (lapsLength !== 0) {
      throw new Error(`Replay should not record laps, got ${lapsLength} laps`);
    }
    
    /* Check no POST to tracks times endpoint */
    const postCalls = await page.evaluate('window.__getPostCalls()');
    if (postCalls.length > 0) {
      throw new Error(`Replay should not POST times, got ${postCalls.length} POST calls`);
    }
    
    /* Check no visit ping */
    const visitPings = await page.evaluate('window.__getVisitPings()');
    const simVisits = visitPings.filter(p => p.url.includes('sim'));
    if (simVisits.length > 0) {
      throw new Error(`Replay should not ping visit, got ${simVisits.length} sim visit pings`);
    }
    
    console.log(' ok   replay guards prevent lap recording, time posting, and visit ping');
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
  
  try {
    await testSponsorContentHidden();
    pass++;
  } catch (e) {
    console.log(` FAIL sponsor content hidden: ${e.message}`);
    fail++;
  }
  
  try {
    await testReplayGuards();
    pass++;
  } catch (e) {
    console.log(` FAIL replay guards: ${e.message}`);
    fail++;
  }
  
  console.log(`\n${pass + fail} tests: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
