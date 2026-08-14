/*
 * seed.js: put a couple of courses on a local board so the page is not empty.
 * Usage: node scripts/seed.js
 */

const origin = process.env.BOARD_ORIGIN || 'http://127.0.0.1:3100';

const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function course(id, name, marks) {
  const elements = marks.map((m, i) => ({
    id: `el-${i + 1}`,
    type: m.type,
    name: m.type,
    position: { x: m.x, y: m.y, z: 0 },
    yaw: m.yaw || 0,
    pitch: 0,
    yawOverridden: false,
    dims: m.type === 'startPads'
      ? { width: 2.4, depth: 0.6 }
      : { clearW: 1.524, clearH: 1.524, sillH: 0, levels: 1 },
  }));
  const sequence = elements
    .filter((e) => e.type !== 'startPads' && e.type !== 'flag')
    .map((e, i) => ({ id: `seq-${i + 1}`, elementId: e.id, apertureIndex: 0, entry: 1 }));
  return {
    schemaVersion: 1,
    id,
    name,
    createdUtc: '2026-08-14T00:00:00Z',
    modifiedUtc: '2026-08-14T00:00:00Z',
    field: { width: 60, depth: 40, gridSize: 1 },
    settings: { tangentScale: 0.4, minCurveRadius: 2, samplesPerSegment: 24 },
    branding: { logo, logoName: 'seed.png' },
    elements,
    sequence,
  };
}

const tracks = [
  {
    author: 'Ada Rook',
    document: course('trk-5e1d0001', 'Sunset Ladder', [
      { type: 'startPads', x: 8, y: 20, yaw: 0 },
      { type: 'gate', x: 18, y: 20 },
      { type: 'flaggedGate', x: 30, y: 28, yaw: 0.4 },
      { type: 'doubleStack', x: 44, y: 20 },
      { type: 'flag', x: 36, y: 12 },
      { type: 'gate', x: 22, y: 10, yaw: 1.2 },
    ]),
    times: [
      { name: 'Ada Rook', lapMs: 28440 },
      { name: 'Bo Kite', lapMs: 30110 },
      { name: 'Cy', lapMs: 33680 },
    ],
  },
  {
    author: 'Bo Kite',
    document: course('trk-ca0a1008', 'Canal Eight', [
      { type: 'startPads', x: 30, y: 6, yaw: 1.57 },
      { type: 'gate', x: 30, y: 16 },
      { type: 'gate', x: 42, y: 24, yaw: 0.8 },
      { type: 'diveGate', x: 30, y: 32 },
      { type: 'gate', x: 18, y: 24, yaw: -0.8 },
    ]),
    times: [
      { name: 'Bo Kite', lapMs: 41200 },
    ],
  },
];

for (const t of tracks) {
  const published = await fetch(`${origin}/api/tracks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ author: t.author, document: t.document }),
  });
  const body = await published.json();
  if (!published.ok) {
    console.error(t.document.name, body.error || published.status);
    continue;
  }
  for (const time of t.times) {
    await fetch(`${origin}/api/tracks/${body.id}/times`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(time),
    });
  }
  const doc = await fetch(`${origin}/api/tracks/${body.id}/document`).then((r) => r.json());
  const logoOk = Boolean(doc.document?.branding?.logo);
  console.log(`published ${body.name} (${body.id}), logo ${logoOk ? 'kept' : 'MISSING'}`);
}
