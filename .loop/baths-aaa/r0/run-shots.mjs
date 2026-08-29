/*
 * Drive scripts/shots.js so PowerShell cannot eat quotes.
 * Round 0 baseline for the Municipal baths AAA loop.
 */
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const chrome = process.env.SIM_CHROME_BIN
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function park(px, py, pz, tx, ty, tz) {
  return [
    `eval:void(window.__setCam(${px},${py},${pz},${tx},${ty},${tz}),window.__camMark=window.__boot().frames)`,
    'until:window.__boot().frames>=window.__camMark+3',
  ];
}

function overlay(cx, cz, r) {
  return `eval:(() => {
  const THREE = window.__three;
  const scene = window.__mapScene();
  let g = scene.getObjectByName('__colliderOverlay');
  if (g) { scene.remove(g); }
  g = new THREE.Group();
  g.name = '__colliderOverlay';
  const boxes = window.__colliderBoxes(${cx}, ${cz}, ${r});
  const pos = new Float32Array(boxes.length * 24 * 3);
  let p = 0;
  const edge = (ax, ay, az, bx, by, bz) => {
    pos[p] = ax; pos[p + 1] = ay; pos[p + 2] = az;
    pos[p + 3] = bx; pos[p + 4] = by; pos[p + 5] = bz;
    p += 6;
  };
  for (const b of boxes) {
    const [x0, y0, z0, x1, y1, z1] = b;
    edge(x0, y0, z0, x1, y0, z0); edge(x1, y0, z0, x1, y0, z1);
    edge(x1, y0, z1, x0, y0, z1); edge(x0, y0, z1, x0, y0, z0);
    edge(x0, y1, z0, x1, y1, z0); edge(x1, y1, z0, x1, y1, z1);
    edge(x1, y1, z1, x0, y1, z1); edge(x0, y1, z1, x0, y1, z0);
    edge(x0, y0, z0, x0, y1, z0); edge(x1, y0, z0, x1, y1, z0);
    edge(x1, y0, z1, x1, y1, z1); edge(x0, y0, z1, x0, y1, z1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, p), 3));
  const mat = new THREE.LineBasicMaterial({ color: 0x00ff66, depthTest: true, transparent: true, opacity: 0.85 });
  g.add(new THREE.LineSegments(geo, mat));
  scene.add(g);
  return { boxes: boxes.length };
})()`;
}

const CLEAR_OVERLAY = `eval:(() => { const s = window.__mapScene(); const g = s.getObjectByName('__colliderOverlay'); if (g) s.remove(g); return 'cleared'; })()`;

const INSTALL = `(async () => {
  function sweep(name, x0, y0, z0, x1, y1, z1, n) {
    const hits = [];
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const z = z0 + (z1 - z0) * t;
      const h = window.__hit(x, y, z, x, y, z);
      if (h.kind) {
        hits.push({
          t: Math.round(t * 100) / 100,
          kind: h.kind,
          pen: h.pen,
          index: h.index,
        });
      }
    }
    return { name, clear: hits.length === 0, n: hits.length, hits: hits.slice(0, 8) };
  }
  function waitFrames(n) {
    return new Promise((resolve) => {
      let left = n;
      const tick = () => {
        left -= 1;
        if (left <= 0) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }
  const m = window.__map();
  window.__setCam(42, 13, 36, 2, 7, 8);
  await waitFrames(3);
  const establishing = window.__budget('establishing');
  window.__setCam(-18, 0.7, 0, 12, 0.4, 0);
  await waitFrames(3);
  const interior = window.__budget('pool-west');
  window.__bathsProbe = {
    round: 0,
    graphics: m.graphics,
    leftoverDeath: m.leftoverDeath,
    leftoverOverlap: m.leftoverOverlap,
    leftoverSamples: m.leftoverSamples,
    platforms: m.platforms,
    meshes: m.meshes,
    triangles: m.triangles,
    pointLights: m.pointLights,
    casters: m.casters,
    pipelineScale: m.pipelineScale,
    colliders: m.colliders,
    spawn: m.spawn,
    references: m.references,
    audit: m.audit,
    expectedModules: m.expectedModules,
    budgetEstablishing: {
      p1: establishing.p1_calls,
      p2: establishing.p2_triangles,
      p5_MB: establishing.p5_target_MB,
      p5_1080: establishing.p5_target_MB_at_1080p,
      p10_MB: establishing.p10_attribute_MB,
      meshes: establishing.meshes,
    },
    budgetInterior: {
      p1: interior.p1_calls,
      p2: interior.p2_triangles,
      p5_MB: interior.p5_target_MB,
      p5_1080: interior.p5_target_MB_at_1080p,
      p10_MB: interior.p10_attribute_MB,
      meshes: interior.meshes,
    },
    lines: [
      sweep('L1_mouthS', 0, 2.8, 16.2, 0, 2.8, 13.2, 16),
      sweep('L1_coralHoop', 0, 2.9, 8.5, 0, 2.9, 7.1, 12),
      sweep('L2_poolBore', -22, 0.6, 0, 22, 0.6, 0, 40),
      sweep('L3_bulkhead', 2.2, 1.0, 0, -2.2, 1.0, 0, 16),
      sweep('L4_westDoor', -27.2, 2.0, -3.8, -31.2, 2.0, -3.8, 16),
      sweep('L5_teachHoop', -35.4, 1.7, 0, -36.6, 1.7, 0, 12),
      sweep('L6_diveHoop', 20.8, 6.3, 0, 21.6, 6.3, 0, 12),
      sweep('L7_hopper', 24.2, -1.8, -5.22, 26.2, -1.8, -5.22, 16),
      sweep('L8_westWell', -13.5, 17.5, 0, -13.5, 14.5, 0, 12),
      sweep('L8_eastWell', 11, 17.5, 2, 11, 14.5, 2, 12),
      sweep('L9_underBridge', -8.0, 2.85, 0, -6.8, 2.85, 0, 12),
      sweep('L10_catchHoop', -0.6, 6.71, 0, 0.6, 6.71, 0, 12),
      sweep('spawnApproach', 0, 2.6, 18.0, 0, 2.8, 14.0, 16),
    ],
  };
  return 'probe-ready';
})()`;

const steps = [
  'until:window.__map&&window.__map().ready&&window.__map().id==="baths"',
  'wait:400',
  ...park(-14, 11, 28, 4, 6, 10),
  'shot:title-ui',
  "eval:(() => { const n = document.getElementById('ui'); if (n) n.style.display = 'none'; return 'hidden'; })()",
  ...park(42, 13, 36, 2, 7, 8),
  'shot:establishing',
  overlay(4, 8, 48),
  'until:window.__boot().frames>=window.__camMark+5',
  'shot:establishing-boxes',
  CLEAR_OVERLAY,
  ...park(0, 2.6, 16.2, 0, 2.4, 6),
  'shot:spawn',
  ...park(0, 3.0, 14.8, 0, 2.2, 4),
  'shot:mouth',
  overlay(0, 10, 16),
  'until:window.__boot().frames>=window.__camMark+5',
  'shot:mouth-boxes',
  CLEAR_OVERLAY,
  ...park(-18, 0.7, 0, 12, 0.4, 0),
  'shot:pool-west',
  overlay(0, 0, 28),
  'until:window.__boot().frames>=window.__camMark+5',
  'shot:pool-west-boxes',
  CLEAR_OVERLAY,
  ...park(6.5, 1.2, 0, -2, 0.6, 0),
  'shot:bulkhead',
  overlay(0, 0, 10),
  'until:window.__boot().frames>=window.__camMark+5',
  'shot:bulkhead-boxes',
  CLEAR_OVERLAY,
  ...park(16, 3.2, 0, 26, 8, 0),
  'shot:tower',
  ...park(23.2, -1.8, -5.22, 28.5, -2.2, -8),
  'shot:hopper',
  overlay(27, -8, 14),
  'until:window.__boot().frames>=window.__camMark+5',
  'shot:hopper-boxes',
  CLEAR_OVERLAY,
  ...park(-36, 3.4, 4, -40, 2.2, -8),
  'shot:lido',
  ...park(-26.4, 2.2, -3.8, -40, 3.2, 0),
  'shot:west-door',
  ...park(0, 8.3, 10.2, -7.4, 5.5, 0),
  'shot:gallery',
  ...park(-13.5, 16.6, 0, -13.5, 4, 0),
  'shot:well',
  ...park(0, 42, 28, 0, 8, 0),
  'shot:aerial',
  ...park(0, 4.6, 21.2, 0, 5, 10),
  'shot:plaza',
  ...park(6, 1.4, 7.6, -2, 1.8, 2),
  'shot:hall-close',
  `eval:${INSTALL}`,
  'eval:window.__bathsProbe',
];

let buf = '';
const child = spawn(
  process.execPath,
  [
    'scripts/shots.js',
    `--out=${here}`,
    '--w=1600',
    '--h=900',
    '--graphics=high',
    '--url=/index.html?map=baths',
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
  const marker = 'eval window.__bathsProbe = ';
  const i = buf.lastIndexOf(marker);
  if (i >= 0) {
    const raw = buf.slice(i + marker.length).split(/\r?\n/)[0].trim();
    try {
      const parsed = JSON.parse(raw);
      await writeFile(join(here, 'probe.json'), `${JSON.stringify(parsed, null, 2)}\n`);
    } catch (err) {
      await writeFile(join(here, 'probe.raw.txt'), raw);
      process.stderr.write(`probe parse failed: ${err.message}\n`);
    }
  }
  process.exit(code ?? 1);
});
