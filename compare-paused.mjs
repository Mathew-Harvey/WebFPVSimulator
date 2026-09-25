#!/usr/bin/env node
/*
 * Compare paused menu measurements between main and current branch
 */

import { spawn } from 'node:child_process';

// Simple Python HTTP server approach
async function measureBranch(branch) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Measurement timeout')), 300000);
    
    const proc = spawn('node', ['tests/support-menu-capture.mjs'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: '/workspace'
    });
    
    let output = '';
    proc.stdout.on('data', data => { output += data.toString(); });
    proc.stderr.on('data', data => { output += data.toString(); });
    
    proc.on('close', code => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Process exited with code ${code}: ${output.slice(-500)}`));
      } else {
        resolve(output);
      }
    });
  });
}

async function main() {
  // Current branch measurements
  console.log('=== Measuring current branch (6639aa7) ===\n');
  const current = await measureBranch('current');
  
  // Extract paused measurements at 1366x768 and 1280x720
  const pausedPattern = /paused screen at (\d+x\d+)[\s\S]*?Gap between last row bottom.*?: ([-\d.]+)px[\s\S]*?After natural scroll[\s\S]*?Gap: ([-\d.]+)px/g;
  
  const currentResults = {};
  let match;
  while ((match = pausedPattern.exec(current)) !== null) {
    const [, size, gapBefore, gapAfter] = match;
    if (size === '1366x768' || size === '1280x720') {
      currentResults[size] = { gapBefore: parseFloat(gapBefore), gapAfter: parseFloat(gapAfter) };
    }
  }
  
  console.log('\n=== Paused Menu Comparison Table ===\n');
  console.log('| Viewport  | Branch     | Before Scroll              | After Scroll               |');
  console.log('|-----------|------------|----------------------------|----------------------------|');
  
  for (const size of ['1366x768', '1280x720']) {
    const curr = currentResults[size];
    if (curr) {
      console.log(`| ${size} | 6639aa7    | gap ${curr.gapBefore.toFixed(2)}px | gap ${curr.gapAfter.toFixed(2)}px |`);
    }
  }
  
  console.log('\nNote: Negative gap means overlap with command bar.');
  console.log('Target: At least 16px gap after natural scroll.');
}

main().catch(console.error);
