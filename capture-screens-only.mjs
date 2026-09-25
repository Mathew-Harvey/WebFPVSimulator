import { openPage } from './tests/lib/page.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

const root = dirname(fileURLToPath(import.meta.url));
const artifactsDir = '/opt/cursor/artifacts';

const VIEWPORTS = [
  { width: 1440, height: 800 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 }
];

for (const vp of VIEWPORTS) {
  for (const screen of ['title', 'paused']) {
    const page = await openPage({ root, width: vp.width, height: vp.height });
    await page.sleep(2000);
    
    await page.until(`window.__ui !== undefined`);
    
    await page.evaluate(`(() => {
      const ui = window.__ui;
      ui.firstRun = false;
      ui.craftGate = false;
      if (!ui.mode) { ui.mode = 'race'; }
      ui.show('${screen}');
    })()`);
    
    await page.sleep(500);
    
    const screenshot = await page.cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false
    }, page.sessionId);
    
    const filename = `${screen}-${vp.width}x${vp.height}.png`;
    const filepath = join(artifactsDir, filename);
    
    await writeFile(filepath, Buffer.from(screenshot.data, 'base64'));
    console.log(`Saved ${filename}`);
    
    await page.close();
  }
}
