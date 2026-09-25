/*
 * support-menu-capture.mjs: verify Support link menu layout and capture screenshots.
 *
 * This file is part of WebFPVSimulator.
 */

import { openPage } from './lib/page.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifactsDir = '/opt/cursor/artifacts';

const VIEWPORTS = [
  { width: 1600, height: 900 },
  { width: 1440, height: 800 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 390, height: 844 }
];

const SCREENS = ['title', 'paused'];

async function measureScreen(page, screen) {
  const screenClass = screen === 'paused' ? 'screen-modal' : 'screen-title';
  
  // Wait for UI to be ready, then navigate to screen
  await page.until(`window.__ui !== undefined`);
  
  await page.evaluate(`(() => {
    const ui = window.__ui;
    ui.firstRun = false;
    ui.craftGate = false;
    if (!ui.mode) { ui.mode = 'race'; }
    ui.show('${screen}');
  })()`);
  
  await page.sleep(500);
  
  // Log scroller element info
  const scrollerInfo = await page.evaluate(`(() => {
    const screenClass = '${screenClass}';
    const menu = document.querySelector('.' + screenClass + ' .menu');
    const peekScroller = document.querySelector('[data-peek-scroller]');
    const style = window.getComputedStyle(menu);
    
    return JSON.stringify({
      menuTag: menu.tagName,
      menuClasses: menu.className,
      menuScrollHeight: menu.scrollHeight,
      menuClientHeight: menu.clientHeight,
      menuOverflowY: style.overflowY,
      hasPeekScroller: !!peekScroller,
      peekScrollerSameAsMenu: peekScroller === menu
    });
  })()`);
  
  if (screen === 'title' && vp.width === 1366 && vp.height === 768) {
    console.log(`  Scroller info at ${vp.width}x${vp.height} ${screen}: ${scrollerInfo}`);
  }
  
  // Measure before scroll
  const before = JSON.parse(await page.evaluate(`(() => {
    const menu = document.querySelector('.${screenClass} .menu');
    const rows = Array.from(menu.querySelectorAll('.row'));
    const lastRow = rows[rows.length - 1];
    const commandBar = document.querySelector('.frame-bot');
    const rowPaddingTop = window.getComputedStyle(rows[0]).paddingTop;
    const menuRect = menu.getBoundingClientRect();
    const overflow = menu.scrollHeight - menu.clientHeight;
    
    let visibleFraction = 0;
    if (overflow > 0) {
      menu.scrollTop = 0;
      
      for (let i = 0; i < rows.length; i++) {
        const rowRect = rows[i].getBoundingClientRect();
        const menuBottom = menuRect.bottom;
        
        if (rowRect.top < menuBottom && rowRect.bottom > menuBottom) {
          const visibleHeight = menuBottom - rowRect.top;
          visibleFraction = visibleHeight / rowRect.height;
          break;
        }
      }
    }
    
    return JSON.stringify({
      lastRowBottom: lastRow.getBoundingClientRect().bottom,
      commandBarTop: commandBar.getBoundingClientRect().top,
      gap: commandBar.getBoundingClientRect().top - lastRow.getBoundingClientRect().bottom,
      overflow: overflow,
      rowPaddingTop: rowPaddingTop,
      rowHeight: lastRow.getBoundingClientRect().height,
      visibleFraction: visibleFraction
    });
  })()`));
  
  // Scroll to bottom
  await page.evaluate(`
    const menu = document.querySelector('.${screenClass} .menu');
    menu.scrollTop = menu.scrollHeight;
  `);
  
  await page.sleep(200);
  
  // Measure after scroll
  const after = JSON.parse(await page.evaluate(`(() => {
    const menu = document.querySelector('.${screenClass} .menu');
    const rows = Array.from(menu.querySelectorAll('.row'));
    const lastRow = rows[rows.length - 1];
    const commandBar = document.querySelector('.frame-bot');
    
    return JSON.stringify({
      lastRowBottom: lastRow.getBoundingClientRect().bottom,
      commandBarTop: commandBar.getBoundingClientRect().top,
      gap: commandBar.getBoundingClientRect().top - lastRow.getBoundingClientRect().bottom
    });
  })()`));
  
  return { before, after };
}

async function captureScreenshot(page, cdp, sessionId, screen, viewport, scrolled) {
  const screenClass = screen === 'paused' ? 'screen-modal' : 'screen-title';
  
  await page.until(`window.__ui !== undefined`);
  
  await page.evaluate(`(() => {
    const ui = window.__ui;
    ui.firstRun = false;
    ui.craftGate = false;
    if (!ui.mode) { ui.mode = 'race'; }
    ui.show('${screen}');
  })()`);
  
  await page.sleep(500);
  
  if (scrolled) {
    await page.evaluate(`
      const menu = document.querySelector('.${screenClass} .menu');
      menu.scrollTop = menu.scrollHeight;
    `);
    await page.sleep(200);
  }
  
  const screenshot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  }, sessionId);
  
  const suffix = scrolled ? '-scrolled' : '';
  const filename = `${screen}-${viewport.width}x${viewport.height}${suffix}.png`;
  const filepath = join(artifactsDir, filename);
  
  await writeFile(filepath, Buffer.from(screenshot.data, 'base64'));
  
  return filename;
}

async function main() {
  const results = [];
  let failed = false;
  
  console.log('\n=== Menu Clearance Measurements ===\n');
  console.log('Viewport     Screen   RowPadTop  Overflow  VisFrac  Before: LastBottom  BarTop     Gap      After: LastBottom  BarTop     Gap      RowHeight');
  console.log('------------ -------- ---------- --------- -------- ------------------- ---------- -------- ------------------ ---------- -------- ---------');
  
  for (const vp of VIEWPORTS) {
    for (const screen of SCREENS) {
      const page = await openPage({ root, width: vp.width, height: vp.height });
      await page.sleep(2000);
      
      const data = await measureScreen(page, screen);
      
      const vpStr = `${vp.width}x${vp.height}`.padEnd(12);
      const screenStr = screen.padEnd(8);
      const paddingStr = data.before.rowPaddingTop.padEnd(10);
      const overflowStr = `${data.before.overflow}px`.padEnd(9);
      const visFracStr = data.before.overflow > 0 ? data.before.visibleFraction.toFixed(2).padStart(8) : '-'.padStart(8);
      const beforeLastStr = data.before.lastRowBottom.toFixed(2).padStart(19);
      const beforeBarStr = data.before.commandBarTop.toFixed(2).padStart(10);
      const beforeGapStr = data.before.gap.toFixed(2).padStart(8);
      const afterLastStr = data.after.lastRowBottom.toFixed(2).padStart(18);
      const afterBarStr = data.after.commandBarTop.toFixed(2).padStart(10);
      const afterGapStr = data.after.gap.toFixed(2).padStart(8);
      const heightStr = data.before.rowHeight.toFixed(2).padStart(9);
      
      console.log(`${vpStr} ${screenStr} ${paddingStr} ${overflowStr} ${visFracStr} ${beforeLastStr} ${beforeBarStr} ${beforeGapStr} ${afterLastStr} ${afterBarStr} ${afterGapStr} ${heightStr}`);
      
      // Assert 16px clearance after scroll
      if (data.after.gap < 16) {
        console.error(`  ✗ FAIL: ${screen} at ${vp.width}x${vp.height} has ${data.after.gap.toFixed(2)}px gap after scroll (need 16px)`);
        failed = true;
      }
      
      // Assert visible fraction is between 0.4 and 0.6 when there's overflow
      if (data.before.overflow > 0) {
        if (data.before.visibleFraction < 0.4 || data.before.visibleFraction > 0.6) {
          console.error(`  ✗ FAIL: ${screen} at ${vp.width}x${vp.height} has ${data.before.visibleFraction.toFixed(2)} visible fraction (need 0.40-0.60)`);
          failed = true;
        }
      }
      
      // Check row height is at least 32px if paused
      if (screen === 'paused' && data.before.rowHeight < 32) {
        console.error(`  ✗ FAIL: ${screen} at ${vp.width}x${vp.height} has ${data.before.rowHeight.toFixed(2)}px row height (need 32px minimum)`);
        failed = true;
      }
      
      results.push({ viewport: vp, screen, data });
      
      await page.close();
    }
  }
  
  console.log('\n');
  
  if (failed) {
    console.error('✗ Clearance assertions FAILED');
    process.exit(1);
  }
  
  console.log('✓ All clearance assertions PASSED\n');
  
  // Now capture screenshots
  console.log('=== Capturing Screenshots ===\n');
  
  for (const vp of VIEWPORTS) {
    for (const screen of SCREENS) {
      const page = await openPage({ root, width: vp.width, height: vp.height });
      await page.sleep(2000);
      
      // Unscrolled
      const unscrolled = await captureScreenshot(page, page.cdp, page.sessionId, screen, vp, false);
      console.log(`  ${unscrolled}`);
      
      await page.close();
      
      // Scrolled
      const pageScrolled = await openPage({ root, width: vp.width, height: vp.height });
      await pageScrolled.sleep(2000);
      
      const scrolled = await captureScreenshot(pageScrolled, pageScrolled.cdp, pageScrolled.sessionId, screen, vp, true);
      console.log(`  ${scrolled}`);
      
      await pageScrolled.close();
    }
  }
  
  console.log('\n✓ Screenshots captured to', artifactsDir);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
