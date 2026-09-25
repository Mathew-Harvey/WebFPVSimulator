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
import { launchPage } from './lib/page.js';

const fixtureGhost = JSON.parse(
  readFileSync(new URL('../uploads/ghost-tm-aae280e5_2d37.json', import.meta.url), 'utf-8')
);

async function testNormalBoot() {
  const { page, close } = await launchPage();
  try {
    await page.goto('http://localhost:8080/sim/', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__shellReady === true, { timeout: 120000 });
    
    const info = await page.evaluate(() => window.__replayInfo());
    if (info.active !== false) {
      throw new Error(`Normal boot should have replay inactive, got ${JSON.stringify(info)}`);
    }
    
    console.log(' ok   normal boot reaches __shellReady with replay inactive');
    return true;
  } finally {
    await close();
  }
}

async function testReplayWithStub() {
  const { page, close } = await launchPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/board/api/tracks/trk-test/times/tm-00000000/ghost')) {
        req.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(fixtureGhost),
        });
      } else {
        req.continue();
      }
    });
    
    await page.goto(
      'http://localhost:8080/sim/?map=custom&share=trk-test&replay=tm-00000000&cam=fpv&clean=1',
      { waitUntil: 'load' }
    );
    await page.waitForFunction(() => window.__shellReady === true, { timeout: 120000 });
    
    /* Wait for ghost to load and replay to be ready */
    await page.waitForFunction(
      () => {
        const info = window.__replayInfo();
        return info.state === 'ready' && info.ghostLoaded;
      },
      { timeout: 30000 }
    );
    
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
    const result1 = await page.evaluate(() => {
      window.__replayStep(0); /* init */
      const r1 = window.__replayStep(1000);
      const cam1 = { x: window.__three.camera.position.x, y: window.__three.camera.position.y, z: window.__three.camera.position.z };
      return { r1, cam1 };
    });
    
    const result2 = await page.evaluate(() => {
      window.__replayStep(0); /* reset */
      const r2 = window.__replayStep(1000);
      const cam2 = { x: window.__three.camera.position.x, y: window.__three.camera.position.y, z: window.__three.camera.position.z };
      return { r2, cam2 };
    });
    
    if (result1.r1.vt !== 1000 || result2.r2.vt !== 1000) {
      throw new Error(`Step should advance to 1000ms, got ${result1.r1.vt} and ${result2.r2.vt}`);
    }
    
    /* Camera positions should match (deterministic) */
    const dx = Math.abs(result1.cam1.x - result2.cam2.x);
    const dy = Math.abs(result1.cam1.y - result2.cam2.y);
    const dz = Math.abs(result1.cam1.z - result2.cam2.z);
    if (dx > 0.001 || dy > 0.001 || dz > 0.001) {
      throw new Error(`Camera position not deterministic: delta ${dx}, ${dy}, ${dz}`);
    }
    
    /* Camera position should be finite */
    if (!Number.isFinite(result1.cam1.x) || !Number.isFinite(result1.cam1.y) || !Number.isFinite(result1.cam1.z)) {
      throw new Error(`Camera position not finite: ${JSON.stringify(result1.cam1)}`);
    }
    
    console.log(' ok   replay starts in flight, UI hidden, stepping is deterministic');
    return true;
  } finally {
    await close();
  }
}

async function test404Handling() {
  const { page, close } = await launchPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/board/api/tracks/') && url.includes('/ghost')) {
        req.respond({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Not found' }),
        });
      } else {
        req.continue();
      }
    });
    
    await page.goto(
      'http://localhost:8080/sim/?map=custom&share=trk-test&replay=tm-notfound&cam=chase',
      { waitUntil: 'load' }
    );
    await page.waitForFunction(() => window.__shellReady === true, { timeout: 120000 });
    
    /* Wait a moment for the fetch to fail */
    await new Promise(r => setTimeout(r, 2000));
    
    const info = await page.evaluate(() => window.__replayInfo());
    if (info.state !== 'failed') {
      throw new Error(`404 should result in state 'failed', got ${info.state}`);
    }
    
    /* Mode should have fallen back to allow normal operation */
    const mode = await page.evaluate(() => window.__mode);
    if (mode === 'flight') {
      /* If it stayed in flight, physics should still work (replayMode turned off) */
      const canStep = await page.evaluate(() => {
        return typeof window.__race === 'function';
      });
      if (!canStep) {
        throw new Error('Should be able to use race functions after failure');
      }
    }
    
    console.log(' ok   404 ghost fetch sets state to failed and falls back gracefully');
    return true;
  } finally {
    await close();
  }
}

async function testMissingShare() {
  const { page, close } = await launchPage();
  try {
    /* No share= parameter, so no track listing */
    await page.goto(
      'http://localhost:8080/sim/?replay=tm-00000000&cam=chase',
      { waitUntil: 'load' }
    );
    await page.waitForFunction(() => window.__shellReady === true, { timeout: 120000 });
    
    /* Wait a moment for the check to fail */
    await new Promise(r => setTimeout(r, 1000));
    
    const info = await page.evaluate(() => window.__replayInfo());
    if (info.state !== 'failed') {
      throw new Error(`Missing share should result in state 'failed', got ${info.state}`);
    }
    
    console.log(' ok   missing share parameter sets state to failed');
    return true;
  } finally {
    await close();
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
    await testReplayWithStub();
    pass++;
  } catch (e) {
    console.log(` FAIL replay with stub: ${e.message}`);
    fail++;
  }
  
  try {
    await test404Handling();
    pass++;
  } catch (e) {
    console.log(` FAIL 404 handling: ${e.message}`);
    fail++;
  }
  
  try {
    await testMissingShare();
    pass++;
  } catch (e) {
    console.log(` FAIL missing share: ${e.message}`);
    fail++;
  }
  
  console.log(`\n${pass + fail} tests: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
