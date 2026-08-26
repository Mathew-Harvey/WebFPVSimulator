/*
 * figures.js: SVG diagrams for the FPV wiki.
 *
 * Drawn here, not loaded as assets, so they inherit the overlay palette and
 * so a missing MIME type cannot blank a figure. Animations are CSS classes
 * on the SVG (wiki-spin, wiki-flow, wiki-bob, wiki-pulse, wiki-dash).
 * prefers-reduced-motion is handled in index.html.
 *
 * Captions state what the picture is arguing. The article text is the
 * source of truth; the figure is a reading aid.
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

const NS = 'http://www.w3.org/2000/svg';

function svgNode(viewBox, html, label) {
  const n = document.createElementNS(NS, 'svg');
  n.setAttribute('viewBox', viewBox);
  n.setAttribute('role', 'img');
  n.setAttribute('aria-label', label);
  n.setAttribute('focusable', 'false');
  n.classList.add('wiki-svg');
  n.innerHTML = html;
  return n;
}

function figure(id, label, caption, html, viewBox = '0 0 640 280') {
  const wrap = document.createElement('figure');
  wrap.className = 'wiki-figure';
  wrap.dataset.fig = id;
  wrap.append(svgNode(viewBox, html, label));
  const cap = document.createElement('figcaption');
  cap.textContent = caption;
  wrap.append(cap);
  return wrap;
}

const CREAM = '#f3ead4';
const SAKURA = '#e8a8b8';
const AMBER = '#ffd45c';
const MINT = '#7dffb4';
const SLATE = '#9db3c8';
const INK = '#1a241c';

function box(x, y, w, h, fill, text, extra = '') {
  const fs = w > 90 ? 13 : 11;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${fill}" ${extra}/>
    <text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" fill="${INK}" font-size="${fs}" font-weight="700">${text}</text>`;
}

let figSerial = 0;

function arrowMarker() {
  figSerial += 1;
  const id = `wiki-arrow-${figSerial}`;
  return {
    attr: `url(#${id})`,
    def: `<defs>
  <marker id="${id}" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
    <path d="M0,0 L8,4 L0,8 z" fill="${SLATE}"/>
  </marker>
</defs>`,
  };
}

function arrow(x1, y1, x2, y2, color, markerAttr) {
  const stroke = color || SLATE;
  const end = markerAttr || 'url(#wiki-arrow)';
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="2" marker-end="${end}"/>`;
}

const FIGURES = {
  loop() {
    const m = arrowMarker();
    return figure(
      'loop',
      'The closed loop from stick to air and back',
      'Every millisecond: sticks become a packet, Betaflight computes motor duties, the plant turns duties into forces, the gyro reads the result, and the PID compares it to what you asked for.',
      `${m.def}
      ${box(20, 108, 88, 64, SAKURA, 'Sticks')}
      ${arrow(108, 140, 142, 140, SLATE, m.attr)}
      ${box(144, 108, 88, 64, AMBER, 'Radio')}
      ${arrow(232, 140, 266, 140, SLATE, m.attr)}
      ${box(268, 108, 108, 64, MINT, 'Betaflight')}
      ${arrow(376, 140, 410, 140, SLATE, m.attr)}
      ${box(412, 108, 88, 64, SAKURA, 'Motors')}
      ${arrow(500, 140, 534, 140, SLATE, m.attr)}
      ${box(536, 108, 84, 64, AMBER, 'Air')}
      <path class="wiki-dash" d="M578 108 C 578 36, 62 36, 62 108" fill="none" stroke="${SLATE}" stroke-width="2" stroke-dasharray="6 6"/>
      <text x="320" y="28" text-anchor="middle" fill="${SLATE}" font-size="12">gyro, 1 kHz</text>
      <text x="320" y="250" text-anchor="middle" fill="${CREAM}" font-size="13">The plant never sees the stick. It only sees four duties and the air.</text>`,
    );
  },

  frames() {
    return figure(
      'frames',
      'Body frame, right-handed, z up',
      'Physics is right-handed, z up, x forward, y left. Three.js is y up. The swap happens once, in src/render/frame.js.',
      `<g transform="translate(180,150)">
        <line x1="0" y1="0" x2="110" y2="0" stroke="#e23b4a" stroke-width="3"/>
        <polygon points="110,-6 128,0 110,6" fill="#e23b4a"/>
        <text x="136" y="5" fill="#e23b4a" font-size="14" font-weight="700">x forward</text>
        <line x1="0" y1="0" x2="-70" y2="-20" stroke="#3dcc5a" stroke-width="3"/>
        <polygon points="-76,-14 -88,-24 -64,-26" fill="#3dcc5a"/>
        <text x="-168" y="-28" fill="#3dcc5a" font-size="14" font-weight="700">y left</text>
        <line x1="0" y1="0" x2="0" y2="-110" stroke="#3b9cff" stroke-width="3"/>
        <polygon points="-6,-110 0,-128 6,-110" fill="#3b9cff"/>
        <text x="10" y="-118" fill="#3b9cff" font-size="14" font-weight="700">z up</text>
        <circle cx="0" cy="0" r="8" fill="${AMBER}"/>
      </g>
      <g transform="translate(460,150)">
        <rect x="-70" y="-18" width="140" height="12" rx="2" fill="${SLATE}"/>
        <rect x="-8" y="-70" width="16" height="140" rx="2" fill="${SLATE}"/>
        <circle class="wiki-spin" cx="-52" cy="-52" r="22" fill="none" stroke="${SAKURA}" stroke-width="3" stroke-dasharray="10 8"/>
        <circle class="wiki-spin wiki-spin-rev" cx="52" cy="-52" r="22" fill="none" stroke="${MINT}" stroke-width="3" stroke-dasharray="10 8"/>
        <circle class="wiki-spin wiki-spin-rev" cx="-52" cy="52" r="22" fill="none" stroke="${MINT}" stroke-width="3" stroke-dasharray="10 8"/>
        <circle class="wiki-spin" cx="52" cy="52" r="22" fill="none" stroke="${SAKURA}" stroke-width="3" stroke-dasharray="10 8"/>
        <text x="0" y="110" text-anchor="middle" fill="${SLATE}" font-size="12">QUADX, from above</text>
      </g>`,
    );
  },

  quadx() {
    return figure(
      'quadx',
      'Betaflight motor order and props-in spin',
      'Motor 0 rear right clockwise, 1 front right counter clockwise, 2 rear left counter clockwise, 3 front left clockwise. Positive yaw in the plant is nose left.',
      `<g transform="translate(320,140)">
        <line x1="-90" y1="-90" x2="90" y2="90" stroke="${SLATE}" stroke-width="8" stroke-linecap="round"/>
        <line x1="-90" y1="90" x2="90" y2="-90" stroke="${SLATE}" stroke-width="8" stroke-linecap="round"/>
        <rect x="-18" y="-12" width="36" height="24" rx="3" fill="${INK}" stroke="${AMBER}" stroke-width="2"/>
        <polygon points="0,-22 -8,-8 8,-8" fill="${AMBER}"/>
        <g transform="translate(90,-90)">
          <circle class="wiki-spin wiki-spin-rev" r="34" fill="none" stroke="${MINT}" stroke-width="3" stroke-dasharray="12 10"/>
          <text y="5" text-anchor="middle" fill="${CREAM}" font-size="12" font-weight="700">1 FR CCW</text>
        </g>
        <g transform="translate(90,90)">
          <circle class="wiki-spin" r="34" fill="none" stroke="${SAKURA}" stroke-width="3" stroke-dasharray="12 10"/>
          <text y="5" text-anchor="middle" fill="${CREAM}" font-size="12" font-weight="700">0 RR CW</text>
        </g>
        <g transform="translate(-90,90)">
          <circle class="wiki-spin wiki-spin-rev" r="34" fill="none" stroke="${MINT}" stroke-width="3" stroke-dasharray="12 10"/>
          <text y="5" text-anchor="middle" fill="${CREAM}" font-size="12" font-weight="700">2 RL CCW</text>
        </g>
        <g transform="translate(-90,-90)">
          <circle class="wiki-spin" r="34" fill="none" stroke="${SAKURA}" stroke-width="3" stroke-dasharray="12 10"/>
          <text y="5" text-anchor="middle" fill="${CREAM}" font-size="12" font-weight="700">3 FL CW</text>
        </g>
      </g>`,
      '0 0 640 300',
    );
  },

  motor() {
    const m = arrowMarker();
    return figure(
      'motor',
      'Duty, back EMF, and rotor lag',
      'Average voltage is duty times pack voltage. Current is (V - ke w) / R. Torque spins the bell against prop drag. The rotor cannot jump; it has inertia.',
      `${m.def}
      ${box(24, 100, 100, 56, SAKURA, 'duty d')}
      ${arrow(124, 128, 158, 128, SLATE, m.attr)}
      ${box(160, 92, 140, 72, AMBER, 'V = d · Vpack')}
      ${arrow(300, 128, 334, 128, SLATE, m.attr)}
      ${box(336, 84, 150, 88, MINT, 'I = (V − ke w)/R')}
      ${arrow(486, 128, 520, 128, SLATE, m.attr)}
      <g transform="translate(560,128)">
        <circle class="wiki-spin" r="36" fill="none" stroke="${CREAM}" stroke-width="4" stroke-dasharray="14 10"/>
        <circle r="8" fill="${AMBER}"/>
        <text y="58" text-anchor="middle" fill="${SLATE}" font-size="12">ω, RPM</text>
      </g>
      <text x="320" y="220" text-anchor="middle" fill="${CREAM}" font-size="13">j dw/dt = ke I − kQ ω |ω|. Check 8 asks 63 percent of a step in 10 to 30 ms.</text>
      <text x="320" y="244" text-anchor="middle" fill="${SLATE}" font-size="12">No winding inductance. No ESC current ceiling. The spike lasts a few milliseconds and the rotor filters it.</text>`,
    );
  },

  sag() {
    return figure(
      'sag',
      'Pack voltage falling under current',
      'V_load is solved implicitly each step: Voc minus pack current times cell resistance. A punch sags the pack. A hover barely does.',
      `<rect x="40" y="40" width="560" height="180" fill="none" stroke="${SLATE}" stroke-width="1"/>
      <text x="28" y="50" fill="${SLATE}" font-size="11">V</text>
      <text x="580" y="236" fill="${SLATE}" font-size="11">t</text>
      <path d="M60 70 L 200 78 L 240 160 L 360 148 L 500 86 L 580 80" fill="none" stroke="${AMBER}" stroke-width="3"/>
      <path class="wiki-flow" d="M60 200 L 200 196 L 240 110 L 360 118 L 500 188 L 580 192" fill="none" stroke="${SAKURA}" stroke-width="2" stroke-dasharray="8 6"/>
      <text x="250" y="64" fill="${AMBER}" font-size="12">pack voltage</text>
      <text x="250" y="128" fill="${SAKURA}" font-size="12">pack current</text>
      <text x="320" y="268" text-anchor="middle" fill="${CREAM}" font-size="13">6S, 2.5 mOhm a cell in plant.c. Settings Pack charge sets the open circuit voltage, not this curve.</text>`,
    );
  },

  thrustmu() {
    return figure(
      'thrustmu',
      'Thrust against axial advance ratio',
      'mu = va / pitch_speed. Climb loses thrust. Shallow descent gains it. Past VRS onset the smooth solution breaks and thrust falls to a floor.',
      `<rect x="50" y="30" width="540" height="200" fill="none" stroke="${SLATE}" stroke-width="1"/>
      <line x1="280" y1="30" x2="280" y2="230" stroke="${SLATE}" stroke-dasharray="3 4"/>
      <text x="284" y="44" fill="${SLATE}" font-size="11">hover, mu = 0</text>
      <text x="70" y="24" fill="${SLATE}" font-size="11">axial (thrust scale)</text>
      <text x="520" y="248" fill="${SLATE}" font-size="11">mu, descent left</text>
      <path d="M70 150 L 160 118 L 220 90 L 280 80 L 400 140 L 490 190 L 560 190" fill="none" stroke="${MINT}" stroke-width="3"/>
      <circle class="wiki-bob" cx="220" cy="90" r="6" fill="${SAKURA}"/>
      <text x="90" y="170" fill="${SAKURA}" font-size="12">VRS dip</text>
      <text x="400" y="70" fill="${MINT}" font-size="12">climb, thrust falls</text>
      <text x="430" y="210" fill="${SLATE}" font-size="12">floor 0.75</text>
      <text x="320" y="272" text-anchor="middle" fill="${CREAM}" font-size="13">Onset mu = −0.30, full loss at −1.20, floor 0.75. plant.c, PLANT_VRS_*.</text>`,
    );
  },

  vrs() {
    return figure(
      'vrs',
      'Vortex ring state, a rotor eating its own wake',
      'In a descent the disc meets the air it just pushed. Past about a third of pitch speed the windmill solution fails and a torus of recirculating flow forms.',
      `<g transform="translate(200,140)">
        <ellipse cx="0" cy="0" rx="70" ry="10" fill="none" stroke="${CREAM}" stroke-width="3"/>
        <line x1="-12" y1="0" x2="12" y2="0" stroke="${AMBER}" stroke-width="4"/>
        <path class="wiki-flow" d="M0 8 C 20 50, 70 50, 70 0 C 70 -50, 20 -50, 0 -8" fill="none" stroke="${SAKURA}" stroke-width="2" stroke-dasharray="8 8"/>
        <path class="wiki-flow" d="M0 8 C -20 50, -70 50, -70 0 C -70 -50, -20 -50, 0 -8" fill="none" stroke="${SAKURA}" stroke-width="2" stroke-dasharray="8 8"/>
        <polygon class="wiki-bob" points="-8,48 8,48 0,64" fill="${MINT}"/>
        <text y="88" text-anchor="middle" fill="${SLATE}" font-size="12">descent</text>
      </g>
      <g transform="translate(460,140)">
        <ellipse cx="0" cy="0" rx="70" ry="10" fill="none" stroke="${CREAM}" stroke-width="3"/>
        <line x1="-12" y1="0" x2="12" y2="0" stroke="${AMBER}" stroke-width="4"/>
        <path class="wiki-flow" d="M-20 16 L -20 80" stroke="${MINT}" stroke-width="2" stroke-dasharray="6 6"/>
        <path class="wiki-flow" d="M0 16 L 0 80" stroke="${MINT}" stroke-width="2" stroke-dasharray="6 6"/>
        <path class="wiki-flow" d="M20 16 L 20 80" stroke="${MINT}" stroke-width="2" stroke-dasharray="6 6"/>
        <text y="108" text-anchor="middle" fill="${SLATE}" font-size="12">climb, clean air</text>
      </g>
      <text x="200" y="36" text-anchor="middle" fill="${SAKURA}" font-size="13" font-weight="700">ring state</text>
      <text x="460" y="36" text-anchor="middle" fill="${MINT}" font-size="13" font-weight="700">climbing</text>`,
    );
  },

  wash() {
    return figure(
      'wash',
      'Unsteady propwash on four independent channels',
      'A constant asymmetry is what an I term trims. Recirculating flow is unsteady, 3 to 30 Hz, one band-limited channel per rotor, applied only when that disc is in its wake.',
      `<g transform="translate(320,130)">
        <line x1="-80" y1="-80" x2="80" y2="80" stroke="${SLATE}" stroke-width="6" stroke-linecap="round"/>
        <line x1="-80" y1="80" x2="80" y2="-80" stroke="${SLATE}" stroke-width="6" stroke-linecap="round"/>
        <g class="wiki-shake">
          <circle cx="80" cy="-80" r="28" fill="rgba(232,168,184,0.25)" stroke="${SAKURA}" stroke-width="2"/>
          <circle cx="80" cy="80" r="28" fill="rgba(125,255,180,0.18)" stroke="${MINT}" stroke-width="2"/>
          <circle cx="-80" cy="80" r="28" fill="rgba(232,168,184,0.18)" stroke="${SAKURA}" stroke-width="2"/>
          <circle cx="-80" cy="-80" r="28" fill="rgba(125,255,180,0.25)" stroke="${MINT}" stroke-width="2"/>
        </g>
      </g>
      <path class="wiki-flow" d="M140 240 C 200 200, 280 250, 340 210 C 400 170, 480 230, 560 190" fill="none" stroke="${AMBER}" stroke-width="2" stroke-dasharray="5 7"/>
      <text x="320" y="268" text-anchor="middle" fill="${CREAM}" font-size="13">xorshift32 in SimState, reset with the run. Same sequence every replay. k_propwash = 0.08 of thrust at full depth.</text>`,
    );
  },

  etl() {
    return figure(
      'etl',
      'Translational lift, induced velocity collapsing in edgewise flow',
      'Hover: the disc flies in its own downwash. Move sideways and it meets fresh air, induced velocity falls, angle of attack rises, thrust rises at the same RPM.',
      `<g transform="translate(160,140)">
        <ellipse cx="0" cy="0" rx="64" ry="10" fill="none" stroke="${CREAM}" stroke-width="3"/>
        <path class="wiki-flow" d="M-16 12 L -16 70" stroke="${SAKURA}" stroke-width="2" stroke-dasharray="5 5"/>
        <path class="wiki-flow" d="M0 12 L 0 78" stroke="${SAKURA}" stroke-width="2" stroke-dasharray="5 5"/>
        <path class="wiki-flow" d="M16 12 L 16 70" stroke="${SAKURA}" stroke-width="2" stroke-dasharray="5 5"/>
        <text y="-28" text-anchor="middle" fill="${SLATE}" font-size="13">hover</text>
        <text y="102" text-anchor="middle" fill="${SAKURA}" font-size="12">high v_i</text>
      </g>
      <g transform="translate(480,140)">
        <ellipse cx="0" cy="0" rx="64" ry="10" fill="none" stroke="${CREAM}" stroke-width="3"/>
        <path class="wiki-flow" d="M-90 0 L -20 0" stroke="${MINT}" stroke-width="3" stroke-dasharray="8 6"/>
        <path class="wiki-flow" d="M-8 14 L -8 40" stroke="${SLATE}" stroke-width="2" stroke-dasharray="4 6"/>
        <path class="wiki-flow" d="M8 14 L 8 36" stroke="${SLATE}" stroke-width="2" stroke-dasharray="4 6"/>
        <text y="-28" text-anchor="middle" fill="${SLATE}" font-size="13">cruise</text>
        <text y="102" text-anchor="middle" fill="${MINT}" font-size="12">v_i collapsed</text>
      </g>
      <text x="320" y="250" text-anchor="middle" fill="${CREAM}" font-size="13">Glauert: y² = 2 / (sqrt(x⁴ + 4) + x²), x = v_perp / v_h. Zero correction in a pure climb, so hover and punch checks do not move.</text>`,
    );
  },

  hforce() {
    return figure(
      'hforce',
      'Rotor H-force, the missing drag at race speed',
      'An edgewise disc pulls backward on the airframe. Linear in speed near hover, saturates at high speed. Applied 20 mm above the CG, it is also a nose-up couple.',
      `<g transform="translate(200,150)">
        <rect x="-50" y="-8" width="100" height="16" rx="2" fill="${SLATE}"/>
        <ellipse cx="-70" cy="-28" rx="36" ry="8" fill="none" stroke="${CREAM}" stroke-width="2"/>
        <ellipse cx="70" cy="-28" rx="36" ry="8" fill="none" stroke="${CREAM}" stroke-width="2"/>
        <path class="wiki-flow" d="M-110 -28 L -40 -28" stroke="${SAKURA}" stroke-width="3" stroke-dasharray="7 5"/>
        <path class="wiki-flow" d="M30 -28 L 100 -28" stroke="${SAKURA}" stroke-width="3" stroke-dasharray="7 5"/>
        <text x="0" y="48" text-anchor="middle" fill="${SAKURA}" font-size="12">H, rearward</text>
      </g>
      <g transform="translate(460,150)">
        <line x1="-40" y1="20" x2="40" y2="20" stroke="${SLATE}" stroke-width="4"/>
        <line x1="0" y1="20" x2="0" y2="-50" stroke="${AMBER}" stroke-width="2"/>
        <text x="10" y="-54" fill="${AMBER}" font-size="12">20 mm</text>
        <path d="M-50 -30 L 50 -30" stroke="${MINT}" stroke-width="3"/>
        <polygon points="-50,-30 -38,-24 -38,-36" fill="${MINT}"/>
        <text x="0" y="52" text-anchor="middle" fill="${MINT}" font-size="12">nose up couple</text>
      </g>
      <text x="320" y="250" text-anchor="middle" fill="${CREAM}" font-size="13">H = k ρ A v_i v_perp per rotor, k = 0.43842 from a published 0.30 /s hover drag on a 0.6 kg five inch.</text>`,
    );
  },

  cant() {
    return figure(
      'cant',
      'Build-tolerance motor cant, the only Stage 1 yaw from a roll',
      'On a perfect QUADX every roll pair holds one CW and one CCW motor, so RPM-squared drag, spin-up reaction and angular momentum all cancel. A real frame is not perfect.',
      `<g transform="translate(200,140)">
        <line x1="-70" y1="40" x2="70" y2="40" stroke="${SLATE}" stroke-width="6"/>
        <line x1="0" y1="40" x2="-8" y2="-70" stroke="${MINT}" stroke-width="4"/>
        <text x="0" y="80" text-anchor="middle" fill="${SLATE}" font-size="12">ideal, thrust on z</text>
      </g>
      <g transform="translate(460,140)">
        <line x1="-70" y1="40" x2="70" y2="40" stroke="${SLATE}" stroke-width="6"/>
        <line x1="0" y1="40" x2="28" y2="-70" stroke="${SAKURA}" stroke-width="4"/>
        <text x="0" y="80" text-anchor="middle" fill="${SAKURA}" font-size="12">canted, a yaw lever</text>
      </g>
      <text x="320" y="24" text-anchor="middle" fill="${CREAM}" font-size="13">Tangential cant, degrees: RR −0.9, FR +1.4, RL +0.6, FL −1.2. Chosen as a model of build tolerance, not derived from a scan.</text>
      <text x="320" y="250" text-anchor="middle" fill="${SLATE}" font-size="12">Radial cant cancels the hover side-force the tangential set would otherwise produce. It cannot yaw.</text>`,
    );
  },

  pid() {
    const m = arrowMarker();
    return figure(
      'pid',
      'P, I and D on the rate error',
      'P shoves now. I remembers a lasting error. D damps how fast the error is changing. Feedforward is not an error term: it is a prediction from the stick.',
      `${m.def}
      ${box(20, 110, 90, 52, SAKURA, 'setpoint')}
      <text x="155" y="100" fill="${SLATE}" font-size="18">−</text>
      ${arrow(110, 136, 178, 136, SLATE, m.attr)}
      ${box(180, 110, 70, 52, AMBER, 'error')}
      ${arrow(250, 136, 292, 80, SLATE, m.attr)}
      ${arrow(250, 136, 292, 136, SLATE, m.attr)}
      ${arrow(250, 136, 292, 192, SLATE, m.attr)}
      ${box(294, 54, 70, 44, MINT, 'P')}
      ${box(294, 114, 70, 44, MINT, 'I')}
      ${box(294, 174, 70, 44, MINT, 'D')}
      ${arrow(364, 76, 410, 120, SLATE, m.attr)}
      ${arrow(364, 136, 410, 136, SLATE, m.attr)}
      ${arrow(364, 196, 410, 152, SLATE, m.attr)}
      ${box(412, 110, 90, 52, AMBER, 'mix')}
      ${arrow(502, 136, 546, 136, SLATE, m.attr)}
      ${box(548, 110, 72, 52, SAKURA, 'motors')}
      <text x="320" y="250" text-anchor="middle" fill="${CREAM}" font-size="13">Compiled pid.c, every 1 ms. The plant does not contain a PID.</text>`,
    );
  },

  filters() {
    return figure(
      'filters',
      'Gyro noise, delay, and why D needs a low-pass',
      'A clean gyro makes filters look free. This sim injects imbalance lines at each rotor Hz plus a 80 to 350 Hz hump into the gyro reading, not into the rigid body.',
      `<rect x="40" y="36" width="560" height="180" fill="none" stroke="${SLATE}" stroke-width="1"/>
      <text x="48" y="28" fill="${SLATE}" font-size="11">amplitude</text>
      <path d="M60 190 L 120 188 L 180 40 L 200 190 L 260 186 L 320 70 L 340 188 L 400 184 L 460 96 L 480 186 L 560 182" fill="none" stroke="${SAKURA}" stroke-width="2"/>
      <path d="M60 196 L 560 150" fill="none" stroke="${MINT}" stroke-width="3"/>
      <text x="188" y="32" fill="${SAKURA}" font-size="11">rotor lines</text>
      <text x="420" y="140" fill="${MINT}" font-size="12">after LPF</text>
      <text x="320" y="248" text-anchor="middle" fill="${CREAM}" font-size="13">PT1 / biquad / PT2 / PT3. Lower Hz is quieter and later. Dynamic notch will not arm at 1 kHz. RPM filter will.</text>`,
    );
  },

  timestep() {
    return figure(
      'timestep',
      'Fixed 1 kHz step, render is interpolation',
      'requestAnimationFrame may drive the accumulator. Its delta never reaches the integrator. A dropped frame changes the picture, not the trajectory.',
      `<g>
        <rect x="40" y="80" width="28" height="40" fill="${MINT}"/>
        <rect x="76" y="80" width="28" height="40" fill="${MINT}"/>
        <rect x="112" y="80" width="28" height="40" fill="${MINT}"/>
        <rect x="148" y="80" width="28" height="40" fill="${MINT}"/>
        <rect x="184" y="80" width="28" height="40" fill="${MINT}"/>
        <rect x="220" y="80" width="28" height="40" fill="${MINT}"/>
        <rect x="256" y="80" width="28" height="40" fill="${MINT}"/>
        <text x="40" y="70" fill="${MINT}" font-size="12">1 ms physics</text>
        <rect x="40" y="160" width="110" height="40" fill="${AMBER}"/>
        <rect x="190" y="160" width="110" height="40" fill="${AMBER}"/>
        <rect x="400" y="160" width="110" height="40" fill="${SAKURA}"/>
        <text x="95" y="186" text-anchor="middle" fill="${INK}" font-size="12" font-weight="700">frame</text>
        <text x="245" y="186" text-anchor="middle" fill="${INK}" font-size="12" font-weight="700">frame</text>
        <text x="455" y="186" text-anchor="middle" fill="${INK}" font-size="12" font-weight="700">dropped</text>
        <text x="320" y="248" text-anchor="middle" fill="${CREAM}" font-size="13">Check 4: traces at 30, 60, 144 and 240 Hz simulated render rates are bit identical.</text>
      </g>`,
    );
  },

  mixer() {
    const m = arrowMarker();
    return figure(
      'mixer',
      'Throttle plus PID sum, four motors',
      'The mixer adds roll, pitch and yaw corrections onto throttle. Airmode keeps those corrections alive at zero throttle by letting some motors go below idle in software, then clipping against the real idle.',
      `${m.def}
      ${box(40, 40, 100, 44, AMBER, 'throttle')}
      ${box(40, 100, 100, 44, SAKURA, 'roll PID')}
      ${box(40, 160, 100, 44, SAKURA, 'pitch PID')}
      ${box(40, 220, 100, 44, SAKURA, 'yaw PID')}
      ${box(260, 118, 100, 56, MINT, 'mixTable')}
      ${arrow(140, 62, 258, 130, SLATE, m.attr)}
      ${arrow(140, 122, 258, 140, SLATE, m.attr)}
      ${arrow(140, 182, 258, 150, SLATE, m.attr)}
      ${arrow(140, 242, 258, 160, SLATE, m.attr)}
      ${box(460, 40, 140, 44, CREAM, '0 RR')}
      ${box(460, 100, 140, 44, CREAM, '1 FR')}
      ${box(460, 160, 140, 44, CREAM, '2 RL')}
      ${box(460, 220, 140, 44, CREAM, '3 FL')}
      ${arrow(360, 140, 458, 62, SLATE, m.attr)}
      ${arrow(360, 146, 458, 122, SLATE, m.attr)}
      ${arrow(360, 152, 458, 182, SLATE, m.attr)}
      ${arrow(360, 158, 458, 242, SLATE, m.attr)}`,
      '0 0 640 300',
    );
  },

  radio() {
    return figure(
      'radio',
      'A packet grid with delay, jitter and loss',
      'Perfect is the default: an exact 4 ms grid, no delay, so a lap time never changes unless you ask. ELRS and Crossfire presets put the radio back.',
      `<g>
        <circle cx="80" cy="80" r="8" fill="${MINT}"/>
        <circle cx="200" cy="80" r="8" fill="${MINT}"/>
        <circle cx="320" cy="80" r="8" fill="${MINT}"/>
        <circle cx="440" cy="80" r="8" fill="${MINT}"/>
        <circle cx="560" cy="80" r="8" fill="${MINT}"/>
        <text x="320" y="50" text-anchor="middle" fill="${SLATE}" font-size="12">perfect, every packet on the grid</text>
        <circle cx="90" cy="170" r="8" fill="${AMBER}"/>
        <circle cx="230" cy="186" r="8" fill="${AMBER}"/>
        <circle cx="340" cy="158" r="8" fill="${AMBER}"/>
        <text x="460" y="176" fill="${SAKURA}" font-size="18">×</text>
        <circle cx="560" cy="170" r="8" fill="${AMBER}"/>
        <text x="320" y="230" text-anchor="middle" fill="${SLATE}" font-size="12">ELRS 250 Hz: 4 ms delay, 0.8 ms jitter, 400 ppm loss</text>
        <text x="320" y="260" text-anchor="middle" fill="${CREAM}" font-size="13">Shaped in the shell (src/input/link.js). The WASM module stays bit identical for a given stream.</text>
      </g>`,
    );
  },

  collide() {
    return figure(
      'collide',
      'Swept sphere against capsules, outside the plant',
      'The integrator does not know about trees. collide.js tests a swept sphere against capsules and may call sim_deflect. Ground contact is a landing or a crash in the shell.',
      `<g transform="translate(200,140)">
        <rect x="-10" y="-80" width="20" height="160" rx="10" fill="${SLATE}"/>
        <circle class="wiki-bob" cx="70" cy="-10" r="28" fill="none" stroke="${AMBER}" stroke-width="3"/>
        <line x1="20" y1="-40" x2="70" y2="-10" stroke="${SAKURA}" stroke-width="2" stroke-dasharray="4 4"/>
        <text x="70" y="50" text-anchor="middle" fill="${SLATE}" font-size="12">craft sphere</text>
      </g>
      <g transform="translate(460,140)">
        <line x1="-80" y1="40" x2="80" y2="40" stroke="${MINT}" stroke-width="4"/>
        <circle cx="0" cy="8" r="24" fill="none" stroke="${AMBER}" stroke-width="3"/>
        <text y="80" text-anchor="middle" fill="${SLATE}" font-size="12">ground, shell-side</text>
      </g>
      <text x="320" y="250" text-anchor="middle" fill="${CREAM}" font-size="13">No ground effect. A landing stops the integrator. A crash is a penalty, not a bounce into the mesh.</text>`,
    );
  },
};

export function wikiFigure(id) {
  const make = FIGURES[id];
  return make ? make() : null;
}

export const FIGURE_IDS = Object.keys(FIGURES);
