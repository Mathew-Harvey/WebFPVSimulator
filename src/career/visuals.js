/*
 * visuals.js: what a lesson draws in the world.
 *
 * Rings to fly through, the box or column to hold a hover in, pads to land
 * on, a light column over the next target so it can be found from anywhere,
 * the band round a pylon, the frame of the next named gap. All of it is
 * paint: unlit, transparent, never a collider, never handed to the plant.
 * The physics cannot see any of it, which is the point: a lesson changes
 * what the pilot is asked, never how the quad flies.
 *
 * Colours are the game's: amber for what is next (an instrument), cream for
 * what comes after, mint for done (a record), sakura for the column.
 *
 * This file is part of WebFPV.
 *
 * WebFPV is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * WebFPV is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY, without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along
 * with WebFPV. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';

const AMBER = 0xffd45c;
const CREAM = 0xf3ead4;
const MINT = 0x7dffb4;
const SAKURA = 0xe8a8b8;

/* Drawn after the world and over its transparency, never writing depth, so
 * a marker never hides a gate behind it or flickers against the grass. */
function paint(color, opacity, side = THREE.FrontSide) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, side, fog: false,
  });
}

function lineMat(color, opacity) {
  return new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false });
}

function orient(obj, n) {
  /* A torus and a circle face +Z in their own frame. */
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(n.x, n.y, n.z).normalize());
}

export function createVisuals() {
  const root = new THREE.Group();
  root.name = 'careerVisuals';
  root.renderOrder = 5;
  let rings = [];
  let pads = [];
  let zone = null;
  let column = null;
  let band = null;
  let gapFrame = null;
  let kind = '';
  let pulse = 0;

  function disposeTree(o) {
    o.traverse((x) => {
      if (x.geometry) {
        x.geometry.dispose();
      }
      if (x.material) {
        x.material.dispose();
      }
    });
  }

  function clear() {
    for (const c of [...root.children]) {
      root.remove(c);
      disposeTree(c);
    }
    rings = [];
    pads = [];
    zone = null;
    column = null;
    band = null;
    gapFrame = null;
    kind = '';
  }

  function makeRing(r) {
    const g = new THREE.Group();
    const torus = new THREE.Mesh(new THREE.TorusGeometry(r.r, Math.max(0.07, r.r * 0.035), 10, 56), paint(CREAM, 0.55));
    const glow = new THREE.Mesh(new THREE.TorusGeometry(r.r, Math.max(0.16, r.r * 0.08), 8, 56), paint(AMBER, 0.0));
    g.add(glow, torus);
    g.position.set(r.c.x, r.c.y, r.c.z);
    orient(g, r.n);
    g.userData = { torus, glow };
    return g;
  }

  function makeZone(z) {
    const g = new THREE.Group();
    if (z.kind === 'box') {
      const geo = new THREE.BoxGeometry(z.hx * 2, z.hy * 2, z.hz * 2);
      g.add(new THREE.Mesh(geo, paint(AMBER, 0.07, THREE.DoubleSide)));
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat(AMBER, 0.85)));
      g.position.set(z.c.x, z.c.y, z.c.z);
    } else if (z.kind === 'cylinder') {
      const h = Math.min(z.y1, 40) - Math.max(z.y0, 0);
      const geo = new THREE.CylinderGeometry(z.r, z.r, h, 48, 1, true);
      g.add(new THREE.Mesh(geo, paint(AMBER, 0.07, THREE.DoubleSide)));
      for (const y of [-h / 2, h / 2]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(z.r, 0.04, 6, 64), paint(AMBER, 0.85));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = y;
        g.add(ring);
      }
      g.position.set(z.c.x, Math.max(z.y0, 0) + h / 2, z.c.z);
    }
    return g;
  }

  function makePad(p) {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(p.r, 48), paint(AMBER, 0.18, THREE.DoubleSide));
    disc.rotation.x = -Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.RingGeometry(p.r * 0.86, p.r, 48), paint(AMBER, 0.9, THREE.DoubleSide));
    rim.rotation.x = -Math.PI / 2;
    /* An H, two posts and a bar, the way a pad says pad from the air. */
    const h = new THREE.Group();
    const post = new THREE.PlaneGeometry(p.r * 0.14, p.r * 0.9);
    const bar = new THREE.PlaneGeometry(p.r * 0.6, p.r * 0.14);
    const hm = paint(CREAM, 0.85, THREE.DoubleSide);
    const a = new THREE.Mesh(post, hm);
    a.position.x = -p.r * 0.3;
    const b = new THREE.Mesh(post, hm);
    b.position.x = p.r * 0.3;
    h.add(a, b, new THREE.Mesh(bar, hm));
    h.rotation.x = -Math.PI / 2;
    g.add(disc, rim, h);
    for (const c of g.children) {
      c.position.y = 0.03;
    }
    h.position.y = 0.035;
    g.position.set(p.c.x, p.ground ?? 0, p.c.z);
    g.userData = { disc, rim };
    return g;
  }

  function makeColumn() {
    const geo = new THREE.CylinderGeometry(0.35, 0.35, 60, 12, 1, true);
    geo.translate(0, 30, 0);
    return new THREE.Mesh(geo, paint(SAKURA, 0.22, THREE.DoubleSide));
  }

  function makeBand(o) {
    const geo = new THREE.RingGeometry(o.rMin, o.rMax, 72);
    const m = new THREE.Mesh(geo, paint(AMBER, 0.12, THREE.DoubleSide));
    m.rotation.x = -Math.PI / 2;
    m.position.set(o.center.x, 0.05, o.center.z);
    return m;
  }

  function makeGapFrame(z) {
    const g = new THREE.Group();
    const w = z.w;
    const h = z.h;
    const pts = [
      new THREE.Vector3(-w / 2, 0, 0), new THREE.Vector3(w / 2, 0, 0),
      new THREE.Vector3(w / 2, h, 0), new THREE.Vector3(-w / 2, h, 0), new THREE.Vector3(-w / 2, 0, 0),
    ];
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(AMBER, 0.95)));
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paint(AMBER, 0.06, THREE.DoubleSide));
    fill.position.y = h / 2;
    g.add(fill);
    g.position.set(z.x, z.y, z.z);
    /* A zone's yaw is the window's normal in the world's turn about +Y. */
    g.rotation.y = z.yaw;
    return g;
  }

  /*
   * Set up for an objective. `o` is the prepared objective (./objectives.js
   * prepareObjective), `extra` what the shell knows about the world: the
   * named gaps placed in world coordinates, and the ground height function.
   */
  function setObjective(o, extra = {}) {
    clear();
    if (!o) {
      return;
    }
    kind = o.kind;
    if (o.rings) {
      rings = o.rings.map((r) => {
        const g = makeRing(r);
        root.add(g);
        return g;
      });
    }
    if (o.zone && (o.zone.kind === 'box' || o.zone.kind === 'cylinder')) {
      zone = makeZone(o.zone);
      root.add(zone);
    }
    const padList = o.pads || (o.pad ? [o.pad] : null);
    if (padList) {
      pads = padList.map((p) => {
        const g = makePad({ ...p, ground: extra.groundAt ? extra.groundAt(p.c.x, p.c.z) : 0 });
        root.add(g);
        return g;
      });
    }
    if (o.kind === 'orbit') {
      band = makeBand(o);
      root.add(band);
    }
    column = makeColumn();
    column.visible = false;
    root.add(column);
    if (o.kind === 'gap' && extra.gapZones) {
      root.userData.gapZones = extra.gapZones;
    }
  }

  /* Every frame: which ring is next, which pad, where the column stands. */
  function update(status, dtMs, craft) {
    pulse += dtMs / 1000;
    const cur = status && status.current;
    if (!cur) {
      if (column) {
        column.visible = false;
      }
      return;
    }
    const st = cur.state || {};
    const o = cur.objective;
    if (rings.length) {
      for (let i = 0; i < rings.length; i += 1) {
        const { torus, glow } = rings[i].userData;
        const passed = st.passed && st.passed[i];
        const next = o.ordered === false ? !passed : i === st.index;
        torus.material.color.setHex(passed ? MINT : (next ? AMBER : CREAM));
        torus.material.opacity = passed ? Math.max(0, torus.material.opacity - dtMs / 900) : (next ? 0.95 : 0.4);
        glow.material.opacity = next ? 0.18 + 0.1 * Math.sin(pulse * 4) : 0;
        rings[i].visible = !passed || torus.material.opacity > 0.02;
      }
    }
    if (pads.length) {
      const idx = st.index ?? 0;
      pads.forEach((p, i) => {
        const done = i < idx;
        const next = i === idx;
        p.userData.rim.material.color.setHex(done ? MINT : (next ? AMBER : CREAM));
        p.userData.disc.material.opacity = next ? 0.22 + 0.08 * Math.sin(pulse * 3) : 0.1;
      });
    }
    if (zone) {
      const inside = Boolean(st.inside);
      zone.traverse((x) => {
        if (x.material && x.material.color) {
          x.material.color.setHex(inside ? MINT : AMBER);
        }
      });
    }
    if (o.kind === 'gap' && root.userData.gapZones) {
      const name = st.target || (o.names || []).find((n) => !(st.seen || []).includes(n));
      const z = root.userData.gapZones.find((g) => g.name === name);
      const key = z ? z.name : '';
      if (!gapFrame || gapFrame.userData.key !== key) {
        if (gapFrame) {
          root.remove(gapFrame);
          disposeTree(gapFrame);
          gapFrame = null;
        }
        if (z) {
          gapFrame = makeGapFrame(z);
          gapFrame.userData.key = key;
          root.add(gapFrame);
        }
      }
    }
    /* The column says where to go from far off and fades as the pilot
     * arrives, so it is never a pink wall across the view from inside the
     * thing it marks. */
    const m = cur.marker;
    if (column) {
      const far = m && craft ? Math.hypot(m.x - craft.x, m.z - craft.z) : 99;
      const fade = Math.max(0, Math.min(1, (far - 8) / 16));
      column.visible = Boolean(m) && kind !== 'face' && fade > 0.02;
      if (m) {
        column.position.set(m.x, 0, m.z);
        column.material.opacity = (0.09 + 0.04 * Math.sin(pulse * 2.4)) * fade;
      }
    }
  }

  return {
    root, clear, setObjective, update,
  };
}
