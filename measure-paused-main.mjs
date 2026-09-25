#!/usr/bin/env node
/* Measure paused menu gaps on main branch */

import { openPage } from './tests/lib/page.js';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

async function measure() {
  for (const vp of [{ width: 1366, height: 768 }, { width: 1280, height: 720 }]) {
    const page = await openPage({ root, width: vp.width, height: vp.height });
    await page.sleep(2000);
    
    const data = JSON.parse(await page.evaluate(`(() => {
      const ui = window.__ui;
      ui.firstRun = false;
      ui.craftGate = false;
      if (!ui.mode) { ui.mode = 'race'; }
      ui.show('paused');
      
      return new Promise(resolve => {
        setTimeout(() => {
          const menu = document.querySelector('.screen-modal .menu');
          const rows = Array.from(menu.querySelectorAll('.row'));
          const lastRow = rows[rows.length - 1];
          const commandBar = document.querySelector('.frame-bot');
          
          const before = {
            lastRowBottom: lastRow.getBoundingClientRect().bottom,
            commandBarTop: commandBar.getBoundingClientRect().top,
            gap: commandBar.getBoundingClientRect().top - lastRow.getBoundingClientRect().bottom
          };
          
          menu.scrollTop = menu.scrollHeight;
          
          setTimeout(() => {
            const after = {
              lastRowBottom: lastRow.getBoundingClientRect().bottom,
              commandBarTop: commandBar.getBoundingClientRect().top,
              gap: commandBar.getBoundingClientRect().top - lastRow.getBoundingClientRect().bottom
            };
            
            resolve(JSON.stringify({ before, after }));
          }, 200);
        }, 500);
      });
    })()`));
    
    console.log(`\n${vp.width}x${vp.height}:`);
    console.log(`  Before: last ${data.before.lastRowBottom.toFixed(2)}px, bar ${data.before.commandBarTop.toFixed(2)}px, gap ${data.before.gap.toFixed(2)}px`);
    console.log(`  After:  last ${data.after.lastRowBottom.toFixed(2)}px, bar ${data.after.commandBarTop.toFixed(2)}px, gap ${data.after.gap.toFixed(2)}px`);
    
    await page.close();
  }
}

measure().catch(console.error);
