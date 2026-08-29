/*
 * Recapture hopper stills only. Look is straight east through the punch.
 */
import { spawn } from 'node:child_process';
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

const steps = [
  'until:window.__map&&window.__map().ready&&window.__map().id==="baths"',
  'wait:400',
  "eval:(() => { const n = document.getElementById('ui'); if (n) n.style.display = 'none'; return 'hidden'; })()",
  ...park(19, 0.8, -5.22, 28.5, -2.0, -6.5),
  'shot:hopper',
  overlay(27, -8, 14),
  'until:window.__boot().frames>=window.__camMark+5',
  'shot:hopper-boxes',
];

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
    stdio: 'inherit',
    env: { ...process.env, SIM_CHROME_BIN: chrome },
  },
);
child.on('exit', (code) => process.exit(code ?? 1));
