/*
 * support-menu-capture.mjs: verify Support link menu layout and capture screenshots.
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

import { openPage } from './lib/page.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifactsDir = '/opt/cursor/artifacts';

async function checkCSSInServedFile(origin) {
  console.log('\n=== Checking served index.html for CSS rules ===');
  const res = await fetch(`${origin}/index.html`);
  const html = await res.text();
  
  const hasScreenModalMenu = html.includes('.screen-modal .menu');
  const hasScreenModalMenuRow = html.includes('.screen-modal .menu .row');
  const hasScreenTitleMenuRow = html.includes('.screen-title .menu .row');
  
  console.log(`  .screen-modal .menu: ${hasScreenModalMenu ? 'FOUND' : 'NOT FOUND'}`);
  console.log(`  .screen-modal .menu .row: ${hasScreenModalMenuRow ? 'FOUND' : 'NOT FOUND'}`);
  console.log(`  .screen-title .menu .row: ${hasScreenTitleMenuRow ? 'FOUND' : 'NOT FOUND'}`);
  
  if (!hasScreenModalMenu || !hasScreenModalMenuRow || !hasScreenTitleMenuRow) {
    throw new Error('CSS rules not found in served index.html');
  }
  
  return true;
}

async function measureAndCapture(page, viewport, screen, artifactsDir) {
  const { width, height } = viewport;
  const screenName = screen === 'paused' ? 'paused' : 'title';
  
  console.log(`\n=== ${screenName} screen at ${width}x${height} ===`);
  
  // Navigate to the screen
  await page.evaluate(`(() => {
    const ui = window.__ui;
    ui.firstRun = false;
    ui.craftGate = false;
    if (!ui.mode) { ui.mode = 'race'; }
    ui.show('${screen}');
  })()`);
  
  await page.sleep(500); // Allow rendering to settle
  
  // Get measurements
  const measurements = JSON.parse(await page.evaluate(`(() => {
    const innerWidth = window.innerWidth;
    const innerHeight = window.innerHeight;
    
    // Get the current screen element
    const screenClass = '${screen}' === 'paused' ? '.screen-modal' : '.screen-title';
    
    // Get computed padding
    const menuRow = document.querySelector(screenClass + ' .menu .row');
    const rowPadding = menuRow ? 
      window.getComputedStyle(menuRow).paddingTop : 'N/A';
    
    // Get menu items
    const ui = window.__ui;
    const items = ui.items();
    const supportIndex = items.findIndex(it => it && it.action === 'support');
    
    // Find the last row, Support row, and hint bar
    const rows = document.querySelectorAll(screenClass + ' .menu .row');
    const lastRow = rows[rows.length - 1];
    const supportRow = supportIndex >= 0 ? rows[supportIndex] : null;
    
    // Bottom hint bar is inside the screen (but may be display:none)
    const hintBar = document.querySelector(screenClass + ' .hint');
    
    const lastRowRect = lastRow ? lastRow.getBoundingClientRect() : null;
    const supportRowRect = supportRow ? supportRow.getBoundingClientRect() : null;
    const hintBarRect = hintBar ? hintBar.getBoundingClientRect() : null;
    
    // If hint bar is hidden (display:none), measure against viewport bottom
    // We want to ensure the last row doesn't extend beyond the viewport
    const effectiveBottom = (hintBarRect && hintBarRect.height > 0) ? 
      hintBarRect.top : innerHeight;
    
    const gap = (lastRowRect && effectiveBottom) ? 
      (effectiveBottom - lastRowRect.bottom) : null;
    
    return JSON.stringify({
      innerWidth,
      innerHeight,
      screenClass,
      rowPadding,
      supportIndex,
      lastRowRect: lastRowRect ? {
        top: lastRowRect.top,
        bottom: lastRowRect.bottom,
        left: lastRowRect.left,
        right: lastRowRect.right,
        width: lastRowRect.width,
        height: lastRowRect.height
      } : null,
      supportRowRect: supportRowRect ? {
        top: supportRowRect.top,
        bottom: supportRowRect.bottom,
        left: supportRowRect.left,
        right: supportRowRect.right,
        width: supportRowRect.width,
        height: supportRowRect.height
      } : null,
      hintBarRect: hintBarRect ? {
        top: hintBarRect.top,
        bottom: hintBarRect.bottom,
        left: hintBarRect.left,
        right: hintBarRect.right,
        width: hintBarRect.width,
        height: hintBarRect.height
      } : null,
      effectiveBottom,
      gap
    });
  })()`));
  
  console.log(`  window.innerWidth: ${measurements.innerWidth}`);
  console.log(`  window.innerHeight: ${measurements.innerHeight}`);
  console.log(`  screenClass: ${measurements.screenClass}`);
  console.log(`  ${measurements.screenClass} .menu .row computed padding-top: ${measurements.rowPadding}`);
  console.log(`  Support item index: ${measurements.supportIndex}`);
  
  if (measurements.lastRowRect) {
    console.log(`  Last row rect: top=${measurements.lastRowRect.top.toFixed(2)}, bottom=${measurements.lastRowRect.bottom.toFixed(2)}, height=${measurements.lastRowRect.height.toFixed(2)}`);
  } else {
    console.log(`  Last row rect: NOT FOUND`);
  }
  
  if (measurements.supportRowRect) {
    console.log(`  Support row rect: top=${measurements.supportRowRect.top.toFixed(2)}, bottom=${measurements.supportRowRect.bottom.toFixed(2)}, height=${measurements.supportRowRect.height.toFixed(2)}`);
  } else {
    console.log(`  Support row rect: NOT FOUND`);
  }
  
  if (measurements.hintBarRect) {
    console.log(`  Hint bar rect: top=${measurements.hintBarRect.top.toFixed(2)}, bottom=${measurements.hintBarRect.bottom.toFixed(2)}, height=${measurements.hintBarRect.height.toFixed(2)}`);
  } else {
    console.log(`  Hint bar rect: NOT FOUND`);
  }
  
  console.log(`  Effective bottom: ${measurements.effectiveBottom.toFixed(2)}`);
  
  if (measurements.gap !== null) {
    console.log(`  Gap between last row bottom and effective bottom: ${measurements.gap.toFixed(2)}px`);
    if (measurements.gap < 16) {
      console.log(`  ⚠️  WARNING: Gap is less than 16px minimum requirement!`);
    } else {
      console.log(`  ✓ Gap meets 16px minimum requirement`);
    }
  } else {
    console.log(`  Gap: CANNOT CALCULATE (missing elements)`);
  }
  
  // Handle scrolling and screenshot for mobile viewport
  let screenshotPath;
  if (width === 390 && height === 844) {
    // Scroll to last row
    await page.evaluate(`(() => {
      const screenClass = '${screen}' === 'paused' ? '.screen-modal' : '.screen-title';
      const rows = document.querySelectorAll(screenClass + ' .menu .row');
      const lastRow = rows[rows.length - 1];
      if (lastRow) {
        lastRow.scrollIntoView({block:'end'});
      }
    })()`);
    
    await page.sleep(300); // Allow scroll to complete
    
    // Re-measure after scroll
    const scrolledMeasurements = JSON.parse(await page.evaluate(`(() => {
      const screenClass = '${screen}' === 'paused' ? '.screen-modal' : '.screen-title';
      const rows = document.querySelectorAll(screenClass + ' .menu .row');
      const lastRow = rows[rows.length - 1];
      const lastRowRect = lastRow ? lastRow.getBoundingClientRect() : null;
      
      const hintBar = document.querySelector(screenClass + ' .hint');
      const hintBarRect = hintBar ? hintBar.getBoundingClientRect() : null;
      
      // If hint bar is hidden, measure against viewport bottom
      const innerHeight = window.innerHeight;
      const effectiveBottom = (hintBarRect && hintBarRect.height > 0) ? 
        hintBarRect.top : innerHeight;
      
      const gap = (lastRowRect && effectiveBottom) ? 
        (effectiveBottom - lastRowRect.bottom) : null;
      
      return JSON.stringify({
        lastRowRect: lastRowRect ? {
          top: lastRowRect.top,
          bottom: lastRowRect.bottom
        } : null,
        hintBarRect: hintBarRect ? {
          top: hintBarRect.top,
          height: hintBarRect.height
        } : null,
        effectiveBottom,
        gap
      });
    })()`));
    
    console.log(`  After scrollIntoView({block:'end'}):`);
    if (scrolledMeasurements.lastRowRect) {
      console.log(`    Last row bottom: ${scrolledMeasurements.lastRowRect.bottom.toFixed(2)}`);
    }
    if (scrolledMeasurements.hintBarRect) {
      console.log(`    Hint bar top: ${scrolledMeasurements.hintBarRect.top.toFixed(2)}, height: ${scrolledMeasurements.hintBarRect.height.toFixed(2)}`);
    }
    console.log(`    Effective bottom: ${scrolledMeasurements.effectiveBottom.toFixed(2)}`);
    if (scrolledMeasurements.gap !== null) {
      console.log(`    Gap: ${scrolledMeasurements.gap.toFixed(2)}px`);
    }
    
    screenshotPath = join(artifactsDir, `${screenName}-${width}x${height}-scrolled.png`);
  } else {
    screenshotPath = join(artifactsDir, `${screenName}-${width}x${height}.png`);
  }
  
  // Capture screenshot
  const screenshot = await page.cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  }, page.sessionId);
  
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  console.log(`  Screenshot saved: ${screenshotPath}`);
  
  return { measurements, screenshotPath };
}

async function main() {
  const viewports = [
    { width: 1600, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ];
  
  await mkdir(artifactsDir, { recursive: true });
  
  const allScreenshots = [];
  
  for (const viewport of viewports) {
    let page = null;
    try {
      page = await openPage({
        root,
        width: viewport.width,
        height: viewport.height,
      });
      
      // Only check CSS once from the first viewport
      if (viewport.width === 1600 && viewport.height === 900) {
        await checkCSSInServedFile(page.origin);
      }
      
      await page.until('window.__shellReady === true', 90000);
      await page.until('!!window.__ui', 10000);
      
      // Capture title screen
      const titleResult = await measureAndCapture(page, viewport, 'title', artifactsDir);
      allScreenshots.push(titleResult.screenshotPath);
      
      // Capture paused screen
      const pausedResult = await measureAndCapture(page, viewport, 'paused', artifactsDir);
      allScreenshots.push(pausedResult.screenshotPath);
      
    } finally {
      if (page) {
        await page.close();
      }
    }
  }
  
  // Print PNG dimensions
  console.log('\n=== Screenshot PNG Dimensions ===');
  for (const path of allScreenshots) {
    try {
      const { stdout } = await execAsync(`file "${path}"`);
      console.log(stdout.trim());
    } catch (e) {
      console.log(`  ${path}: ERROR - ${e.message}`);
    }
  }
  
  console.log('\n=== Capture Complete ===');
  console.log(`All screenshots saved to ${artifactsDir}`);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
