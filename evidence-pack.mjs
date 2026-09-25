/*
 * evidence-pack.mjs: capture screenshots and measurements for PR evidence
 */

import { openPage } from './tests/lib/page.js';
import { writeFile } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);
const root = dirname(fileURLToPath(import.meta.url));

const viewports = [
  { width: 1600, height: 900, name: '1600x900' },
  { width: 1366, height: 768, name: '1366x768' },
  { width: 1280, height: 720, name: '1280x720' },
  { width: 390, height: 844, name: '390x844' }
];

async function captureScreen(page, screen, viewport, scrolled, artifactsDir) {
  const { evaluate, cdp, sessionId, sleep } = page;
  
  // Navigate to the screen
  await evaluate(`(() => {
    const ui = window.__ui;
    ui.firstRun = false;
    ui.craftGate = false;
    if (!ui.mode) { ui.mode = 'race'; }
    ui.show('${screen}');
  })()`);
  
  await sleep(500);
  
  // Scroll if needed
  if (scrolled) {
    await evaluate(`
      const screenClass = '${screen}' === 'paused' ? '.screen-modal' : '.screen-title';
      const menu = document.querySelector(screenClass + ' .menu');
      if (menu) menu.scrollTop = menu.scrollHeight;
    `);
    await sleep(200);
  }
  
  // Measure
  const data = JSON.parse(await evaluate(`(() => {
    const screenClass = '${screen}' === 'paused' ? '.screen-modal' : '.screen-title';
    const menu = document.querySelector(screenClass + ' .menu');
    if (!menu) return JSON.stringify(null);
    
    const rows = Array.from(menu.querySelectorAll('.row'));
    const lastRow = rows[rows.length - 1];
    const commandBar = document.querySelector('.frame-bot');
    
    const menuRect = menu.getBoundingClientRect();
    const lastRect = lastRow.getBoundingClientRect();
    const barRect = commandBar.getBoundingClientRect();
    
    const overflow = menu.scrollHeight - menu.clientHeight;
    const scrollTop = menu.scrollTop;
    
    return JSON.stringify({
      lastRowBottom: lastRect.bottom,
      commandBarTop: barRect.top,
      gap: barRect.top - lastRect.bottom,
      overflow: overflow,
      scrollTop: scrollTop
    });
  })()`));
  
  if (!data) return null;
  
  // Take screenshot
  const screenName = screen === 'paused' ? 'paused' : 'title';
  const scrollSuffix = scrolled ? '-scrolled' : '';
  const filename = `${screenName}-${viewport.name}${scrollSuffix}.png`;
  const filepath = `/opt/cursor/artifacts/${filename}`;
  
  const screenshot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  }, sessionId);
  
  await writeFile(filepath, Buffer.from(screenshot.data, 'base64'));
  
  return { ...data, filename };
}

async function measurePausedMenu(branch) {
  console.log(`\n=== Measuring paused menu on ${branch} ===`);
  
  const results = {};
  
  for (const vp of [{ width: 1366, height: 768 }, { width: 1280, height: 720 }]) {
    const page = await openPage({ root, width: vp.width, height: vp.height });
    await page.sleep(2000); // Wait for UI to initialize
    
    // Navigate to paused screen
    await page.evaluate(`(() => {
      const ui = window.__ui;
      ui.firstRun = false;
      ui.craftGate = false;
      if (!ui.mode) { ui.mode = 'race'; }
      ui.show('paused');
    })()`);
    
    await page.sleep(500);
    
    // Measure before scroll
    const before = JSON.parse(await page.evaluate(`(() => {
      const menu = document.querySelector('.screen-modal .menu');
      const rows = Array.from(menu.querySelectorAll('.row'));
      const lastRow = rows[rows.length - 1];
      const commandBar = document.querySelector('.frame-bot');
      
      const lastRect = lastRow.getBoundingClientRect();
      const barRect = commandBar.getBoundingClientRect();
      
      return JSON.stringify({
        lastRowBottom: lastRect.bottom,
        commandBarTop: barRect.top,
        gap: barRect.top - lastRect.bottom
      });
    })()`));
    
    // Scroll to bottom
    await page.evaluate(`
      const menu = document.querySelector('.screen-modal .menu');
      menu.scrollTop = menu.scrollHeight;
    `);
    
    await page.sleep(200);
    
    // Measure after scroll
    const after = JSON.parse(await page.evaluate(`(() => {
      const menu = document.querySelector('.screen-modal .menu');
      const rows = Array.from(menu.querySelectorAll('.row'));
      const lastRow = rows[rows.length - 1];
      const commandBar = document.querySelector('.frame-bot');
      
      const lastRect = lastRow.getBoundingClientRect();
      const barRect = commandBar.getBoundingClientRect();
      
      return JSON.stringify({
        lastRowBottom: lastRect.bottom,
        commandBarTop: barRect.top,
        gap: barRect.top - lastRect.bottom
      });
    })()`));
    
    results[`${vp.width}x${vp.height}`] = { before, after };
    
    await page.close();
  }
  
  return results;
}

async function main() {
  console.log('=== Capturing screenshots at all viewports ===\n');
  
  for (const vp of viewports) {
    console.log(`Processing ${vp.name}...`);
    
    // Title screen unscrolled
    const titlePage = await openPage({ root, width: vp.width, height: vp.height });
    await titlePage.sleep(2000); // Wait for UI to initialize
    const titleUnscrolled = await captureScreen(titlePage, 'title', vp, false);
    console.log(`  ${titleUnscrolled.filename}: gap ${titleUnscrolled.gap.toFixed(2)}px, overflow ${titleUnscrolled.overflow}px`);
    await titlePage.close();
    
    // Title screen scrolled
    const titlePageScrolled = await openPage({ root, width: vp.width, height: vp.height });
    await titlePageScrolled.sleep(2000);
    const titleScrolled = await captureScreen(titlePageScrolled, 'title', vp, true);
    console.log(`  ${titleScrolled.filename}: gap ${titleScrolled.gap.toFixed(2)}px, overflow ${titleScrolled.overflow}px`);
    await titlePageScrolled.close();
    
    // Paused screen unscrolled
    const pausedPage = await openPage({ root, width: vp.width, height: vp.height });
    await pausedPage.sleep(2000);
    const pausedUnscrolled = await captureScreen(pausedPage, 'paused', vp, false);
    if (pausedUnscrolled) {
      console.log(`  ${pausedUnscrolled.filename}: gap ${pausedUnscrolled.gap.toFixed(2)}px, overflow ${pausedUnscrolled.overflow}px`);
    }
    await pausedPage.close();
    
    // Paused screen scrolled
    const pausedPageScrolled = await openPage({ root, width: vp.width, height: vp.height });
    await pausedPageScrolled.sleep(2000);
    const pausedScrolled = await captureScreen(pausedPageScrolled, 'paused', vp, true);
    if (pausedScrolled) {
      console.log(`  ${pausedScrolled.filename}: gap ${pausedScrolled.gap.toFixed(2)}px, overflow ${pausedScrolled.overflow}px`);
    }
    await pausedPageScrolled.close();
  }
  
  // Get paused menu measurements for comparison table
  const currentResults = await measurePausedMenu('6639aa7');
  
  console.log('\n=== Paused menu measurements (6639aa7) ===');
  for (const [size, data] of Object.entries(currentResults)) {
    console.log(`\n${size}:`);
    console.log(`  Before scroll: last row bottom ${data.before.lastRowBottom.toFixed(2)}px, bar top ${data.before.commandBarTop.toFixed(2)}px, gap ${data.before.gap.toFixed(2)}px`);
    console.log(`  After scroll:  last row bottom ${data.after.lastRowBottom.toFixed(2)}px, bar top ${data.after.commandBarTop.toFixed(2)}px, gap ${data.after.gap.toFixed(2)}px`);
  }
  
  // Check PNG dimensions
  console.log('\n=== Verifying PNG dimensions ===');
  const { stdout } = await execAsync('file /opt/cursor/artifacts/*.png');
  console.log(stdout);
  
  console.log('\n=== Screenshot capture complete ===');
}

main().catch(console.error);
