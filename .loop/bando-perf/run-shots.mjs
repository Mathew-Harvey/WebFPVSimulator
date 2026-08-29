/*
 * Drive scripts/shots.js so PowerShell cannot eat quotes.
 * Perf loop: establishing park, budget, scale probe, a few beauty stills.
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const round = process.env.BANDO_PERF_ROUND || '1';
const outDir = join(here, `r${round}`);
const root = join(here, '..', '..');
const chrome = process.env.SIM_CHROME_BIN
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

await mkdir(outDir, { recursive: true });

function park(px, py, pz, tx, ty, tz) {
  return [
    `eval:void(window.__setCam(${px},${py},${pz},${tx},${ty},${tz}),window.__camMark=window.__boot().frames)`,
    'until:window.__boot().frames>=window.__camMark+3',
  ];
}

const INSTALL = `(() => {
  const m = window.__map();
  const establishing = window.__budget('establishing');
  const canvas = document.querySelector('canvas');
  return {
    map: m && m.id,
    leftoverOverlap: m && m.leftoverOverlap,
    leftoverDeath: m && m.leftoverDeath,
    pointLights: m && m.pointLights,
    casters: m && m.casters,
    pipelineScale: m && m.pipelineScale,
    pipelineSize: m && m.pipelineSize,
    pipelineCss: m && m.pipelineCss,
    canvas: canvas && { w: canvas.width, h: canvas.height, cssW: canvas.clientWidth, cssH: canvas.clientHeight },
    dpr: window.devicePixelRatio,
    scaleAt: {
      p1080: window.__scaleAt(1920, 1080),
      p1440: window.__scaleAt(2560, 1440),
      p4k: window.__scaleAt(3840, 2160),
    },
    pace: window.__pace(),
    boot: window.__boot(),
    stats: window.__renderStats(),
    establishing,
  };
})()`;

const steps = [
  'until:window.__shellReady===true',
  'until:window.__map && window.__map()',
  ...park(62, 24, 44, 16, 12, 0),
  'shot:establishing',
  ...park(-8, 3.4, 0, -46, 8, 0),
  'shot:hall-west',
  ...park(4, 10, 0, -16, 9.5, 0),
  'shot:kiln-bore',
  ...park(30, 17.2, 4.3, 44, 16.5, 4.3),
  'shot:gantry',
  `eval:${INSTALL}`,
];

let buf = '';
const child = spawn(
  process.execPath,
  [
    'scripts/shots.js',
    `--out=${outDir}`,
    '--w=1600',
    '--h=900',
    '--graphics=high',
    '--url=/index.html?map=bando',
    ...steps,
  ],
  {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SIM_CHROME_BIN: chrome },
  },
);
child.stdout.on('data', (chunk) => {
  const s = chunk.toString();
  buf += s;
  process.stdout.write(s);
});
child.stderr.on('data', (chunk) => process.stderr.write(chunk));
child.on('exit', async (code) => {
  const lines = buf.split(/\r?\n/);
  const line = [...lines].reverse().find((l) => l.startsWith('eval ') && l.includes(' = {'));
  if (line) {
    const json = line.slice(line.lastIndexOf(' = ') + 3);
    try {
      const parsed = JSON.parse(json);
      await writeFile(join(outDir, 'probe.json'), `${JSON.stringify(parsed, null, 2)}\n`);
    } catch (err) {
      await writeFile(join(outDir, 'probe.raw.txt'), json);
      process.stderr.write(`probe parse failed: ${err.message}\n`);
    }
  }
  process.exit(code ?? 1);
});
