/*
 * infectbots.js: the bots of Infected (./infected.js), the owner's game of
 * 2026-11-08, and the school they play it in as a bot knows it. The
 * owner's words for them: "you can add bots for any player ... any ratio
 * of bots to humans, the bots should play well, easy, med or hard".
 *
 * THREE THINGS, each for the next.
 *
 * schoolWorld: the school's solids as a grid of cells an eighth of a real
 * metre across, which is what a bot asks "is that in the way?" of. The
 * dogfight's grid (gridWorld in ./dogfight.js) is cut for a whole map out
 * of doors, half a metre a cell or more, and at that size a 45 cm vent is
 * a wall and a 90 cm door is two cells. This one is the school's box and
 * nothing else, and its floor is the top of whatever is under a point, a
 * desk or a stair or the first floor's slab, so a bot over a desk knows it
 * is over a desk. Read once a round from the shell's colliders, so it is
 * the solids the pilot collides with and nothing drawn.
 *
 * SchoolMap: the school as a bot finds its way round it. The plan already
 * says where every room, door, window, transom, hatch, vent, stair and the
 * book lift are (SCHOOL_PLAN in src/maps/school/school.js); this makes
 * points from them (a few in every room, one each side of every way
 * through and one in it, and every point of every stair, lift and vent
 * path) and joins every two that a bot can fly between in a line. Each
 * class of bot pays its own price for a way through: an easy bot only
 * knows doors and stairs, a medium one climbs through windows and takes
 * the lift, and a hard one knows the vents and the transoms as well as a
 * person who has played it. The shortest way to any point is a row of
 * distances worked out the first time it is asked for, and kept.
 *
 * InfectBrain: what a bot decides, and InfectFlyer: how it flies it. A bot
 * only knows what it can see or hear, plus the sniff an infected pilot is
 * given (./infected.js), and the last clean pilot, whom everybody sees.
 * Infected bots hunt the nearest clean pilot they know of; a hard one
 * cuts across to where a pilot is running to when somebody else is
 * already behind them. Clean bots keep the school between them and what
 * they fear: an easy one runs straight away, into a dead end now and
 * then; a medium one puts a room between them; a hard one runs the loops
 * the classrooms' two doors make, through vents, and jinks at the last
 * moment for a close shave. The flying is the dogfight's (./botflyer.js),
 * with the numbers a corridor needs: they lean, overshoot and brush a
 * door frame as a quad does.
 *
 * PURE, as the dogfight is: no Three.js, no DOM, no JS trigonometry, and
 * nothing allocated on a step once the map is read. The same seed and the
 * same pilot give the same round in Node and in a browser, which is what
 * scripts/infected-arena.js plays its rounds on.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { BotFlyer } from './botflyer.js';
import { SKILLS } from './dogfight.js';

/* ------------------------------------------------------------------ */
/* The school as a grid                                                */
/* ------------------------------------------------------------------ */

/* A cell, real metres, and how far past the walls the grid goes. */
const CELL = 0.125;
const EDGE = 0.6;

/*
 * The school's solids as cells. c: the shell's colliders (src/game/
 * collide.js, built), world metres, Y up. plan: SCHOOL_PLAN. k: world
 * metres to the aircraft's metre. cruise: the dogfight's cruise for a
 * whoop, which only the dogfight's own code reads.
 */
export function schoolWorld(c, plan, k, cruise = 9) {
  const S = plan.S;
  const v = CELL * S;
  const xa = plan.worldAt(-EDGE, 0, 0)[0];
  const xb = plan.worldAt(plan.LEN + EDGE, 0, 0)[0];
  const za = plan.worldAt(0, plan.DEP + EDGE, 0)[2];
  const zb = plan.worldAt(0, -EDGE, 0)[2];
  const yLo = -0.3 * S;
  const yHi = (plan.high + 0.5) * S;
  const nx = Math.ceil((xb - xa) / v);
  const nz = Math.ceil((zb - za) / v);
  const ny = Math.ceil((yHi - yLo) / v);
  const occ = new Uint8Array(nx * nz * ny);
  const at = (i, j, l) => (l * nz + j) * nx + i;
  const lo = (q, o, nmax) => Math.max(0, Math.min(nmax - 1, Math.floor((q - o) / v)));
  const count = c && c.built ? c.count : 0;
  for (let s = 0; s < count; s += 1) {
    const box = c.fbox[s] === 1;
    const r = box ? 0 : c.fr[s];
    const ax = c.fax[s];
    const ay = c.fay[s];
    const az = c.faz[s];
    const bx = c.fbx[s];
    const by = c.fby[s];
    const bz = c.fbz[s];
    const minX = Math.min(ax, bx) - r;
    const maxX = Math.max(ax, bx) + r;
    const minY = Math.min(ay, by) - r;
    const maxY = Math.max(ay, by) + r;
    const minZ = Math.min(az, bz) - r;
    const maxZ = Math.max(az, bz) + r;
    if (maxX < xa || minX > xa + nx * v || maxZ < za || minZ > za + nz * v || maxY < yLo || minY > yLo + ny * v) {
      continue;
    }
    const i0 = lo(minX, xa, nx);
    const i1 = lo(maxX, xa, nx);
    const j0 = lo(minZ, za, nz);
    const j1 = lo(maxZ, za, nz);
    const l0 = lo(minY, yLo, ny);
    const l1 = lo(maxY, yLo, ny);
    const ex = bx - ax;
    const ey = by - ay;
    const ez = bz - az;
    const ee = ex * ex + ey * ey + ez * ez;
    const reach = r + v * 0.87;
    for (let l = l0; l <= l1; l += 1) {
      for (let j = j0; j <= j1; j += 1) {
        for (let i = i0; i <= i1; i += 1) {
          if (!box) {
            const px = xa + (i + 0.5) * v - ax;
            const py = yLo + (l + 0.5) * v - ay;
            const pz = za + (j + 0.5) * v - az;
            let u = ee > 0 ? (px * ex + py * ey + pz * ez) / ee : 0;
            u = u < 0 ? 0 : (u > 1 ? 1 : u);
            const qx = px - ex * u;
            const qy = py - ey * u;
            const qz = pz - ez * u;
            if (qx * qx + qy * qy + qz * qz > reach * reach) {
              continue;
            }
          }
          occ[at(i, j, l)] = 1;
        }
      }
    }
  }
  const solidAt = (i, j, l) => i >= 0 && j >= 0 && l >= 0 && i < nx && j < nz && l < ny && occ[(l * nz + j) * nx + i] === 1;
  const inside = (x, y, z) => solidAt(Math.floor((x - xa) / v), Math.floor((z - za) / v), Math.floor((y - yLo) / v));
  /* The top of whatever is under (x, y, z): a desk, a stair, a floor. A
   * point inside a solid has no floor that means anything, and says so
   * with a floor far below, which every reader takes as none. */
  const floorAt = (x, y, z) => {
    const i = Math.floor((x - xa) / v);
    const j = Math.floor((z - za) / v);
    if (i < 0 || j < 0 || i >= nx || j >= nz) {
      return yLo;
    }
    let l = Math.floor((y - yLo) / v);
    if (l >= ny) l = ny - 1;
    if (l < 0) return yLo;
    if (occ[(l * nz + j) * nx + i] === 1) {
      return -1e9;
    }
    for (let q = l - 1; q >= 0; q -= 1) {
      if (occ[(q * nz + j) * nx + i] === 1) {
        return yLo + (q + 1) * v;
      }
    }
    return yLo;
  };
  /* Along the line cell by cell, as the dogfight's grid walks it; a line
   * that starts in a marked cell is let out of it first. Where along the
   * line it is stopped, 0 to 1, or -1 for clear. */
  const blocked = (ax, ay, az, bx, by, bz) => {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    if (!(dx * dx + dy * dy + dz * dz > 0)) {
      return -1;
    }
    const px = (ax - xa) / v;
    const py = (ay - yLo) / v;
    const pz = (az - za) / v;
    let i = Math.floor(px);
    let l = Math.floor(py);
    let j = Math.floor(pz);
    const si = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
    const sl = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
    const sj = dz > 0 ? 1 : (dz < 0 ? -1 : 0);
    const di = si ? v / Math.abs(dx) : Infinity;
    const dl = sl ? v / Math.abs(dy) : Infinity;
    const dj = sj ? v / Math.abs(dz) : Infinity;
    let ti = si > 0 ? (i + 1 - px) * di : (si < 0 ? (px - i) * di : Infinity);
    let tl = sl > 0 ? (l + 1 - py) * dl : (sl < 0 ? (py - l) * dl : Infinity);
    let tj = sj > 0 ? (j + 1 - pz) * dj : (sj < 0 ? (pz - j) * dj : Infinity);
    let out = !solidAt(i, j, l);
    for (;;) {
      let t;
      if (ti <= tl && ti <= tj) {
        t = ti;
        i += si;
        ti += di;
      } else if (tl <= tj) {
        t = tl;
        l += sl;
        tl += dl;
      } else {
        t = tj;
        j += sj;
        tj += dj;
      }
      if (t > 1) {
        return -1;
      }
      const hit = solidAt(i, j, l);
      if (!out) {
        out = !hit;
      } else if (hit) {
        return t;
      }
    }
  };
  const [cx, , cz] = plan.worldAt(plan.LEN / 2, plan.DEP / 2, 0);
  return {
    k,
    cruise,
    cx,
    cy: 0,
    cz,
    radius: Math.sqrt(plan.LEN * plan.LEN + plan.DEP * plan.DEP) * 0.6 * S,
    top: (plan.high + 0.2) * S,
    spawns: plan.PADS.map((p) => {
      const [x, y, z] = plan.worldAt(p.px, p.py, plan.floors[p.f] + 0.6);
      return { x, y, z };
    }),
    floorAt,
    inside,
    blocked,
    /* The dogfight's bots read no open air of their own here. */
    noNav: true,
    grid: {
      occ, nx, nz, ny, v, x0: xa, z0: za, yLo,
    },
  };
}

/* ------------------------------------------------------------------ */
/* The school as a bot finds its way round it                          */
/* ------------------------------------------------------------------ */

/* The three classes of bot: easy, medium, hard. */
export const CLASSES = 3;

/* What a way through costs each class, as a multiple of its length, and 0
 * for a way that class never takes. A room is a room to everybody. */
const WAY_COST = {
  room: [1, 1, 1],
  door: [1, 1, 1],
  window: [0, 1.4, 1.05],
  hatch: [0, 1.6, 1.1],
  transom: [0, 0, 1.5],
  vent: [0, 3, 1.2],
  lift: [0, 2.4, 1.3],
  stairs: [1.6, 1.4, 1.3],
};

/* What a point is: in a room, either side of a way through, in it, or on
 * a stair, lift or vent path. */
export const ROOM = 0;
export const SIDE = 1;
export const GAP = 2;
export const PATH = 3;

/* How far apart a room's points are, and how far out from a wall a way
 * through's own points are, real metres. */
const ROOM_STEP = 3.2;
const SIDE_OUT = [0.55, 0.4, 0.8];
/* The farthest two points in a room are joined, real metres. */
const JOIN = 13;

export class SchoolMap {
  /* world: schoolWorld's. plan: SCHOOL_PLAN. */
  constructor(world, plan) {
    this.w = world;
    this.plan = plan;
    const S = plan.S;
    this.S = S;
    const pts = [];
    const edges = [];
    const clear = (x, y, z, r) => !world.inside(x, y, z) && !world.inside(x + r, y, z) && !world.inside(x - r, y, z)
      && !world.inside(x, y + r, z) && !world.inside(x, y - r, z) && !world.inside(x, y, z + r) && !world.inside(x, y, z - r);
    const add = (px, py, h, rooms, kind, r) => {
      const [x, y, z] = plan.worldAt(px, py, h);
      if (r > 0 ? !clear(x, y, z, r * S) : world.inside(x, y, z)) {
        return -1;
      }
      pts.push({
        x, y, z, rooms, kind,
      });
      return pts.length - 1;
    };
    const link = (a, b, way) => {
      if (a >= 0 && b >= 0 && a !== b) {
        edges.push([a, b, way]);
      }
    };
    /* A few points in every room, over the desks, nudged off anything that
     * stands where the grid puts them. */
    for (const r of plan.ROOMS) {
      if (r.f === null) {
        continue;
      }
      const lv = plan.floors[r.f];
      const W = r.x1 - r.x0;
      const D = r.y1 - r.y0;
      const ni = Math.max(1, Math.round(W / ROOM_STEP));
      const nj = Math.max(1, Math.round(D / ROOM_STEP));
      for (let i = 0; i < ni; i += 1) {
        for (let j = 0; j < nj; j += 1) {
          const px = r.x0 + ((i + 0.5) * W) / ni;
          const py = r.y0 + ((j + 0.5) * D) / nj;
          let done = false;
          for (const h of [1.2, 1.6, 0.95, 2.0]) {
            for (const [ox, oy] of [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) {
              if (!done && add(px + ox, py + oy, lv + h, [r.id], ROOM, 0.3) >= 0) {
                done = true;
              }
            }
          }
        }
      }
    }
    /* Every way through that is not glass: a point in it, and one each
     * side as far out as is clear. */
    this.gapOf = new Map();
    for (const o of plan.OPENINGS) {
      if (o.glass || o.kind === 'vent') {
        continue;
      }
      const way = o.kind === 'wide' ? 'door' : o.kind;
      const a = (o.a0 + o.a1) / 2;
      const tall = o.kind === 'door' || o.kind === 'wide';
      const h = tall ? o.h0 + Math.min(1.15, (o.h1 - o.h0) / 2) : (o.h0 + o.h1) / 2;
      const place = (off) => (o.axis === 'x' ? [a, o.at + off] : [o.at + off, a]);
      const [cx, cy] = place(0);
      const mid = add(cx, cy, h, o.rooms.slice(), GAP, 0);
      if (mid < 0) {
        continue;
      }
      this.gapOf.set(o.id, mid);
      for (let s = 0; s < 2; s += 1) {
        const sign = s ? 1 : -1;
        for (const d of SIDE_OUT) {
          const [px, py] = place(sign * d);
          const side = add(px, py, h, [o.rooms[s]], SIDE, 0.15);
          if (side >= 0) {
            const A = pts[mid];
            const B = pts[side];
            if (world.blocked(A.x, A.y, A.z, B.x, B.y, B.z) < 0) {
              link(mid, side, way);
              break;
            }
            pts.pop();
          }
        }
      }
    }
    /* The stairs, the book lift and the vents: every point of each, in
     * order, the ends in the rooms they come out in. */
    for (const p of plan.PATHS) {
      const way = p.id.startsWith('stair') ? 'stairs' : (p.id === 'lift' ? 'lift' : 'vent');
      let prev = -1;
      const last = p.points.length - 1;
      p.points.forEach(([px, py, h], n) => {
        let rooms = [];
        if (n === 0 || n === last) {
          const r = plan.roomAt(px, py, h);
          rooms = r ? [r.id] : [];
        }
        const [x, y, z] = plan.worldAt(px, py, h);
        pts.push({
          x, y, z, rooms, kind: PATH,
        });
        const at = pts.length - 1;
        if (prev >= 0) {
          link(prev, at, way);
        }
        prev = at;
      });
    }
    /* Out of the glass tank: from over its pad to over its wall, the way
     * the first infected leaves it. */
    this.tankNode = -1;
    if (plan.TANK_PAD && plan.TANK) {
      const T = plan.TANK;
      const P = plan.TANK_PAD;
      const lv = plan.floors[P.f];
      const low = plan.worldAt(P.px, P.py, lv + T.base + 0.5);
      const high = plan.worldAt(P.px, P.py, lv + T.top + 0.45);
      pts.push({
        x: low[0], y: low[1], z: low[2], rooms: [], kind: PATH,
      });
      pts.push({
        x: high[0], y: high[1], z: high[2], rooms: [plan.roomAt(P.px, P.py, lv + 1).id], kind: PATH,
      });
      link(pts.length - 2, pts.length - 1, 'room');
      this.tankNode = pts.length - 1;
    }
    /* In each room, every two of its points a bot can fly between: the
     * middle line and one either side of it a little over a whoop apart,
     * so a line that grazes a corner is not a line. */
    const byRoom = new Map();
    pts.forEach((p, n) => {
      if (p.kind === GAP) return;
      for (const r of p.rooms) {
        if (!byRoom.has(r)) byRoom.set(r, []);
        byRoom.get(r).push(n);
      }
    });
    const fat = 0.12 * S;
    const fatClear = (A, B) => {
      if (world.blocked(A.x, A.y, A.z, B.x, B.y, B.z) >= 0) return false;
      let sx = -(B.z - A.z);
      let sz = B.x - A.x;
      const m = Math.sqrt(sx * sx + sz * sz);
      if (m < 1e-9) return true;
      sx = (sx / m) * fat;
      sz = (sz / m) * fat;
      return world.blocked(A.x + sx, A.y, A.z + sz, B.x + sx, B.y, B.z + sz) < 0
        && world.blocked(A.x - sx, A.y, A.z - sz, B.x - sx, B.y, B.z - sz) < 0
        && world.blocked(A.x, A.y - fat, A.z, B.x, B.y - fat, B.z) < 0;
    };
    const join2 = (JOIN * S) ** 2;
    for (const list of byRoom.values()) {
      for (let a = 0; a < list.length; a += 1) {
        for (let b = a + 1; b < list.length; b += 1) {
          const A = pts[list[a]];
          const B = pts[list[b]];
          const d2 = (A.x - B.x) ** 2 + (A.y - B.y) ** 2 + (A.z - B.z) ** 2;
          if (d2 < join2 && fatClear(A, B)) {
            link(list[a], list[b], 'room');
          }
        }
      }
    }
    /* Packed, for the step. */
    const N = pts.length;
    this.N = N;
    this.x = new Float64Array(N);
    this.y = new Float64Array(N);
    this.z = new Float64Array(N);
    this.kind = new Uint8Array(N);
    this.rooms = pts.map((p) => p.rooms);
    pts.forEach((p, n) => {
      this.x[n] = p.x;
      this.y[n] = p.y;
      this.z[n] = p.z;
      this.kind[n] = p.kind;
    });
    /* Each class's links, as flat lists: start and count per point, then
     * the far end and the cost. */
    this.adjStart = [];
    this.adjCount = [];
    this.adjTo = [];
    this.adjW = [];
    this.usable = [];
    for (let c = 0; c < CLASSES; c += 1) {
      const lists = Array.from({ length: N }, () => []);
      for (const [a, b, way] of edges) {
        const f = WAY_COST[way][c];
        if (!f) continue;
        const d = Math.sqrt((this.x[a] - this.x[b]) ** 2 + (this.y[a] - this.y[b]) ** 2 + (this.z[a] - this.z[b]) ** 2) * f;
        lists[a].push([b, d]);
        lists[b].push([a, d]);
      }
      const start = new Int32Array(N);
      const cnt = new Int32Array(N);
      let total = 0;
      for (let n = 0; n < N; n += 1) {
        start[n] = total;
        cnt[n] = lists[n].length;
        total += lists[n].length;
      }
      const to = new Int32Array(total);
      const w = new Float64Array(total);
      const use = new Uint8Array(N);
      for (let n = 0; n < N; n += 1) {
        lists[n].forEach(([b, d], m) => {
          to[start[n] + m] = b;
          w[start[n] + m] = d;
        });
        use[n] = cnt[n] > 0 ? 1 : 0;
      }
      this.adjStart.push(start);
      this.adjCount.push(cnt);
      this.adjTo.push(to);
      this.adjW.push(w);
      this.usable.push(use);
    }
    /* The rows of distances, each class's, filled the first time a point
     * is asked for. */
    this.rows = new Float64Array(CLASSES * N * N);
    this.rowDone = new Uint8Array(CLASSES * N);
    this.done = new Uint8Array(N);
    this.warmAt = 0;
    /* How many ways out each room point's room has, for the clean bots. */
    this.exits = new Uint8Array(N);
    const roomExits = new Map();
    for (const o of plan.OPENINGS) {
      if (o.glass || !this.gapOf.has(o.id)) continue;
      for (const r of o.rooms) roomExits.set(r, (roomExits.get(r) || 0) + 1);
    }
    for (const p of plan.PATHS) {
      for (const r of p.rooms) roomExits.set(r, (roomExits.get(r) || 0) + 1);
    }
    for (let n = 0; n < N; n += 1) {
      let e = 0;
      for (const r of this.rooms[n]) e = Math.max(e, roomExits.get(r) || 0);
      this.exits[n] = Math.min(255, e);
    }
    this.links = edges.length;
    /* Scratch for the nearest points, so a step allocates nothing. */
    this.nearN = new Int32Array(8);
    this.nearD = new Float64Array(8);
    /* The room ids, numbered, for a fast "is this point in that room". */
    this.roomNo = new Map(plan.ROOMS.map((r, n) => [r.id, n]));
    this.inRoom = new Uint8Array(N * plan.ROOMS.length);
    for (let n = 0; n < N; n += 1) {
      for (const r of this.rooms[n]) {
        this.inRoom[n * plan.ROOMS.length + this.roomNo.get(r)] = 1;
      }
    }
  }

  /* The room number a world point is in, or -1. */
  roomOf(x, y, z) {
    const [px, py, h] = this.plan.planAt(x, y, z);
    const r = this.plan.roomAt(px, py, h);
    return r ? this.roomNo.get(r.id) : -1;
  }

  /* Class c's distance from every point to `goal`, Dijkstra over the
   * links, worked out once and kept. */
  row(c, goal) {
    const N = this.N;
    const base = (c * N + goal) * N;
    if (!this.rowDone[c * N + goal]) {
      this.rowDone[c * N + goal] = 1;
      const rows = this.rows;
      const done = this.done;
      for (let n = 0; n < N; n += 1) {
        rows[base + n] = Infinity;
        done[n] = 0;
      }
      rows[base + goal] = 0;
      const start = this.adjStart[c];
      const cnt = this.adjCount[c];
      const to = this.adjTo[c];
      const w = this.adjW[c];
      for (;;) {
        let u = -1;
        let best = Infinity;
        for (let n = 0; n < N; n += 1) {
          if (!done[n] && rows[base + n] < best) {
            best = rows[base + n];
            u = n;
          }
        }
        if (u < 0) break;
        done[u] = 1;
        for (let m = start[u]; m < start[u] + cnt[u]; m += 1) {
          const v = to[m];
          const d = best + w[m];
          if (d < rows[base + v]) rows[base + v] = d;
        }
      }
    }
    return base;
  }

  /* A few rows worked out ahead of being asked for, so a hunt's first
   * second does not ask for forty at once: `budget` of them, in order. */
  warm(budget) {
    const total = CLASSES * this.N;
    let done = 0;
    while (done < budget && this.warmAt < total) {
      const c = Math.floor(this.warmAt / this.N);
      const goal = this.warmAt % this.N;
      this.warmAt += 1;
      if (!this.rowDone[c * this.N + goal]) {
        this.row(c, goal);
        done += 1;
      }
    }
  }

  /* Class c's distance between two points, world metres; Infinity for no
   * way. */
  dist(c, a, b) {
    if (a < 0 || b < 0) return Infinity;
    return this.rows[this.row(c, b) + a];
  }

  /* The point after a on class c's shortest way to `goal`; a itself when
   * a is the goal, -1 for no way. */
  next(c, a, goal) {
    if (a < 0 || goal < 0) return -1;
    if (a === goal) return a;
    const base = this.row(c, goal);
    const rows = this.rows;
    const start = this.adjStart[c];
    const cnt = this.adjCount[c];
    const to = this.adjTo[c];
    const w = this.adjW[c];
    let best = -1;
    let bestD = Infinity;
    for (let m = start[a]; m < start[a] + cnt[a]; m += 1) {
      const d = w[m] + rows[base + to[m]];
      if (d < bestD) {
        bestD = d;
        best = to[m];
      }
    }
    return best;
  }

  /*
   * The point class c can use that is nearest (x, y, z) and seen from it:
   * of the nearest eight in the room the point is in first, then of any.
   * -1 for none.
   */
  near(x, y, z, c) {
    const room = this.roomOf(x, y, z);
    const R = this.plan.ROOMS.length;
    for (let pass = 0; pass < 2; pass += 1) {
      if (pass === 0 && room < 0) continue;
      const nn = this.nearN;
      const nd = this.nearD;
      let found = 0;
      const use = this.usable[c];
      for (let n = 0; n < this.N; n += 1) {
        if (!use[n]) continue;
        if (pass === 0 && this.kind[n] !== PATH && !this.inRoom[n * R + room]) continue;
        const dx = this.x[n] - x;
        const dy = this.y[n] - y;
        const dz = this.z[n] - z;
        const d = dx * dx + dy * dy + dz * dz;
        if (found < 8) {
          let k = found;
          while (k > 0 && nd[k - 1] > d) {
            nd[k] = nd[k - 1];
            nn[k] = nn[k - 1];
            k -= 1;
          }
          nd[k] = d;
          nn[k] = n;
          found += 1;
        } else if (d < nd[7]) {
          let k = 7;
          while (k > 0 && nd[k - 1] > d) {
            nd[k] = nd[k - 1];
            nn[k] = nn[k - 1];
            k -= 1;
          }
          nd[k] = d;
          nn[k] = n;
        }
      }
      for (let m = 0; m < found; m += 1) {
        const n = nn[m];
        if (this.w.blocked(x, y, z, this.x[n], this.y[n], this.z[n]) < 0) {
          return n;
        }
      }
    }
    return -1;
  }
}

/* ------------------------------------------------------------------ */
/* How a bot flies a school                                            */
/* ------------------------------------------------------------------ */

/* What a bot of each skill is like. speed: m/s, the aircraft's. think:
 * how often it decides, ms. see: how far it sees, real metres, and cone,
 * the cosine of how far off its nose (1 dead ahead, -1 all round). hear:
 * how close a whoop's buzz gives itself away through anything. memory:
 * how long it goes on believing where it last knew somebody was. fear:
 * how near a known infected pilot has to be before a clean bot runs.
 * lead: how far ahead of a pilot it aims, s. sniff: how often an infected
 * bot uses the sniff. juke: how often a clean bot jinks at the last
 * moment. flyAs: the dogfight's skill it flies with (./dogfight.js). */
export const INFECT_BOTS = {
  easy: {
    speed: 3.0, think: 420, see: 8, cone: 0.17, hear: 1.5, memory: 2500, fear: 4.5, lead: 0, sniff: 0, juke: 0, cls: 0, flyAs: 'rookie',
  },
  medium: {
    speed: 3.9, think: 260, see: 13, cone: -0.3, hear: 2.5, memory: 4500, fear: 8, lead: 0.2, sniff: 0.5, juke: 0.25, cls: 1, flyAs: 'pilot',
  },
  hard: {
    speed: 4.8, think: 160, see: 18, cone: -1.1, hear: 3.5, memory: 7000, fear: 11, lead: 0.4, sniff: 1, juke: 0.6, cls: 2, flyAs: 'ace',
  },
};
export const BOT_SKILLS = Object.keys(INFECT_BOTS);

/* What a bot is doing. */
const SIT = 0;
const HIDE = 1;
const FLEE = 2;
const CHASE = 3;
const HUNT = 4;
const PATROL = 5;
const JUKE = 6;

/* What a point is picked for (InfectBrain.score). */
const PATROL_AT = 1;
const HIDE_AT = 2;
const SAFE_AT = 3;
const AWAY_AT = 4;

export class InfectFlyer extends BotFlyer {
  constructor(game, rules, map) {
    super(game, rules);
    this.map = map;
    /* A corridor's numbers: apart by a little under a metre, and from
     * one's own side only; whiskers a whoop wide and a quarter of a
     * second out; down to 20 cm over a desk or a vent's floor; stuck is
     * under 60 cm in a second. */
    this.apartR = 0.9;
    this.whiskR = 0.16;
    this.whiskT = 0.25;
    this.floorGap = 0.2;
    this.stuckR2 = 0.36;
    /* Indoors a way round stays level: up only when the floor is close,
     * down only when the ceiling is, a dive marked down only just over
     * the floor, and boxed in or stuck it backs off level. */
    this.diveAlt = 0.6;
    this.boxedBack = 0.9;
    this.boxedUp = 0.2;
    this.unstickUp = 0.1;
    const n = this.n;
    this.cls = new Uint8Array(n);
    this.wayTo = new Int16Array(n).fill(-1);
    this.wayAt = new Float64Array(n);
    this.final = new Uint8Array(n);
    this.ram = new Uint8Array(n);
    this.lookFar = new Float64Array(n).fill(Infinity);
    this.toX = new Float64Array(n);
    this.toY = new Float64Array(n);
    this.toZ = new Float64Array(n);
    this.clear = new Uint8Array(n);
    this.clearAt = new Float64Array(n);
  }

  placed(i) {
    super.placed(i);
    this.wayTo[i] = -1;
    this.wayAt[i] = 0;
    this.final[i] = 1;
    this.ram[i] = 0;
    this.clearAt[i] = 0;
  }

  /* Apart from one's own side: a clean bot does not shy off the infected
   * pilot it is dodging past, and an infected one does not shy off its
   * target. */
  apart(i, j) {
    return this.g.inf[i] === this.g.inf[j];
  }

  minAlt(alt, k) {
    return 0.22 * k;
  }

  updown(x, y, z, floor, k) {
    const w = this.g.world;
    if (y - floor < 0.35 * k) return 1;
    const v = w.grid.v;
    for (let up = v; up < 0.5 * k; up += v) {
      if (w.inside(x, y + up, z)) return -1;
    }
    return 0;
  }

  lookCap(i) {
    return this.lookFar[i];
  }

  /* Slow with the point it is flying to in sight is not stuck: it is
   * getting there. */
  mayStick(i) {
    return !this.clear[i];
  }

  /*
   * Where bot i flies next on its way to (x, y, z): straight there when it
   * can see it, else along the school's map, the next point it can see
   * on the shortest way, worked out again every fifth of a second and the
   * moment it gets to one.
   */
  route(i, x, y, z, now, to) {
    const g = this.g;
    const w = g.world;
    const m = this.map;
    const S = m.S;
    to.x = x;
    to.y = y;
    to.z = z;
    const px = g.x[i];
    const py = g.y[i];
    const pz = g.z[i];
    if (now >= this.wayAt[i]) {
      this.wayAt[i] = now + 200 + ((i * 37) % 100);
      this.wayTo[i] = -1;
      const gx = x - px;
      const gy = y - py;
      const gz = z - pz;
      const far = gx * gx + gy * gy + gz * gz > 196 * S * S;
      if (far || w.blocked(px, py, pz, x, y, z) >= 0) {
        const c = this.cls[i];
        const s = m.near(px, py, pz, c);
        const e = m.near(x, y, z, c);
        if (s >= 0 && e >= 0) {
          let pick = s;
          const n1 = m.next(c, s, e);
          if (n1 >= 0 && n1 !== s && w.blocked(px, py, pz, m.x[n1], m.y[n1], m.z[n1]) < 0) {
            pick = n1;
            /* Past a point in a room to the one after it, when that is in
             * sight too: a room is crossed in a line, a door never cut. */
            if (m.kind[n1] === ROOM) {
              const n2 = m.next(c, n1, e);
              if (n2 >= 0 && n2 !== n1 && m.kind[n2] !== GAP && w.blocked(px, py, pz, m.x[n2], m.y[n2], m.z[n2]) < 0) {
                pick = n2;
              }
            }
          } else if (s === e) {
            pick = -1;
          }
          this.wayTo[i] = pick;
        }
      }
    }
    const n = this.wayTo[i];
    this.final[i] = n < 0 ? 1 : 0;
    if (n >= 0) {
      to.x = m.x[n];
      to.y = m.y[n];
      to.z = m.z[n];
      if (this.near(i, to.x, to.y, to.z, (m.kind[n] === ROOM ? 0.8 : 0.4) * S)) {
        this.wayAt[i] = 0;
      }
    }
    const dx = to.x - px;
    const dy = to.y - py;
    const dz = to.z - pz;
    this.lookFar[i] = Math.max(1.2 * S, Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.15 * S);
    this.toX[i] = to.x;
    this.toY[i] = to.y;
    this.toZ[i] = to.z;
  }

  /*
   * Round what is in the way, indoors: nothing to go round while the
   * point it is flying to is in sight, because the map chose that point
   * for being in sight; a bot carried into a door frame by its speed
   * scrapes it, as a quad does. Out of sight (somebody it is after round a
   * corner, or no map point to be had), the dogfight's way round, looking
   * no farther than the point.
   */
  avoid(i, now, vmax, want, speed, sk) {
    if (now < this.unstickUntil[i]) {
      return;
    }
    if (now >= this.clearAt[i]) {
      const g = this.g;
      this.clearAt[i] = now + 40;
      this.clear[i] = g.world.blocked(g.x[i], g.y[i], g.z[i], this.toX[i], this.toY[i], this.toZ[i]) < 0 ? 1 : 0;
    }
    if (this.clear[i]) {
      this.avoidUntil[i] = 0;
      return;
    }
    super.avoid(i, now, vmax, want, speed, sk);
  }

  /* Toward a point: at full speed through the points on the way, slowing
   * only for where it is going, and not even then when it is going for
   * somebody. */
  toward(i, x, y, z, speed, want) {
    const g = this.g;
    const dx = x - g.x[i];
    const dy = y - g.y[i];
    const dz = z - g.z[i];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 1e-6) {
      return;
    }
    let s = speed;
    if (!this.ram[i]) {
      s = this.final[i] ? Math.min(speed, d * 1.2) : Math.min(speed, Math.max(d * 2.2, speed * 0.6));
    }
    want.vx = (dx / d) * s;
    want.vy = (dy / d) * s;
    want.vz = (dz / d) * s;
  }
}

/*
 * WHAT A BOT DECIDES. g: the round (./infected.js), its pilots, its teams
 * (inf), its phase and its sniff. One brain for every bot in it.
 */
export class InfectBrain {
  constructor(g, map, DT) {
    this.g = g;
    this.map = map;
    const n = g.cap;
    this.n = n;
    this.flyer = new InfectFlyer(g, { DT, MAX: n }, map);
    const f = () => new Float64Array(n);
    this.mode = new Uint8Array(n);
    this.thinkAt = f();
    this.goalNode = new Int16Array(n).fill(-1);
    this.goalX = f(); this.goalY = f(); this.goalZ = f();
    this.goalUntil = f();
    this.target = new Int16Array(n).fill(-1);
    this.padX = f(); this.padY = f(); this.padZ = f();
    this.nodeAt = new Int16Array(n).fill(-1);
    /* What bot i knows of pilot j: when, where and how it was moving. */
    this.kAt = new Float64Array(n * n).fill(-Infinity);
    this.kx = new Float64Array(n * n);
    this.ky = new Float64Array(n * n);
    this.kz = new Float64Array(n * n);
    this.kvx = new Float64Array(n * n);
    this.kvy = new Float64Array(n * n);
    this.kvz = new Float64Array(n * n);
    this.seenNow = new Uint8Array(n * n);
    /* Where every bot has chosen to hide, so two do not pick one room. */
    this.hideNode = new Int16Array(n).fill(-1);
    /* Scratch: the nearest infected a clean bot minds. */
    this.thr = new Int32Array(3);
    this.thrD = new Float64Array(3);
    this.awayX = 0;
    this.awayZ = 0;
  }

  skill(i) {
    return INFECT_BOTS[this.g.botSkill(i)] || INFECT_BOTS.medium;
  }

  reset() {
    this.flyer.reset();
    this.kAt.fill(-Infinity);
    this.seenNow.fill(0);
    this.hideNode.fill(-1);
    this.target.fill(-1);
    this.goalNode.fill(-1);
  }

  /* Bot i sat down on its pad at (x, y, z). */
  placed(i) {
    const g = this.g;
    this.flyer.placed(i);
    this.flyer.cls[i] = this.skill(i).cls;
    this.mode[i] = SIT;
    this.thinkAt[i] = 0;
    this.padX[i] = g.x[i];
    this.padY[i] = g.y[i];
    this.padZ[i] = g.z[i];
    this.goalX[i] = g.x[i];
    this.goalY[i] = g.y[i];
    this.goalZ[i] = g.z[i];
    this.goalUntil[i] = 0;
    this.goalNode[i] = -1;
    this.target[i] = -1;
    this.nodeAt[i] = -1;
    const n = this.n;
    for (let j = 0; j < n; j += 1) {
      this.kAt[i * n + j] = -Infinity;
    }
  }

  /* Bot i learns where pilot j is, now. */
  know(i, j, now) {
    const g = this.g;
    const q = i * this.n + j;
    this.kAt[q] = now;
    this.kx[q] = g.x[j];
    this.ky[q] = g.y[j];
    this.kz[q] = g.z[j];
    this.kvx[q] = g.vx[j];
    this.kvy[q] = g.vy[j];
    this.kvz[q] = g.vz[j];
  }

  /* The sniff: every infected bot that uses it learns where every clean
   * pilot was when it went off. */
  sniffed(now) {
    const g = this.g;
    for (let i = 1; i < this.n; i += 1) {
      if (!g.isBot[i] || !g.live(i) || !g.inf[i]) continue;
      if (g.rand() >= this.skill(i).sniff) continue;
      for (let j = 0; j < this.n; j += 1) {
        if (g.live(j) && !g.inf[j]) this.know(i, j, now);
      }
    }
  }

  /* What bot i sees and hears of the other side, and the last clean pilot,
   * whom everybody sees. */
  perceive(i, now, b) {
    const g = this.g;
    const w = g.world;
    const S = this.map.S;
    const n = this.n;
    const x = g.x[i];
    const y = g.y[i];
    const z = g.z[i];
    for (let j = 0; j < n; j += 1) {
      const q = i * n + j;
      this.seenNow[q] = 0;
      if (j === i || !g.live(j)) continue;
      const gold = g.gold === j;
      if (g.inf[j] === g.inf[i] && !gold) continue;
      const dx = g.x[j] - x;
      const dy = g.y[j] - y;
      const dz = g.z[j] - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (gold || d2 < b.hear * b.hear * S * S) {
        this.know(i, j, now);
        this.seenNow[q] = gold ? 1 : 0;
        if (gold && w.blocked(x, y, z, g.x[j], g.y[j], g.z[j]) < 0) this.seenNow[q] = 1;
        continue;
      }
      if (d2 > b.see * b.see * S * S) continue;
      const d = Math.sqrt(d2);
      const sp = Math.sqrt(g.vx[i] * g.vx[i] + g.vz[i] * g.vz[i]);
      const fx = sp > 0.5 * S ? g.vx[i] / sp : g.fx[i];
      const fz = sp > 0.5 * S ? g.vz[i] / sp : g.fz[i];
      if ((dx * fx + dz * fz) / d < b.cone) continue;
      if (w.blocked(x, y, z, g.x[j], g.y[j], g.z[j]) < 0) {
        this.know(i, j, now);
        this.seenNow[q] = 1;
      }
    }
  }

  /* Whether bot i knows of j, recently enough to act on. */
  knows(i, j, now, b) {
    return now - this.kAt[i * this.n + j] < b.memory;
  }

  /* ONE FEED OF BOT i. */
  step(i, now) {
    const g = this.g;
    const b = this.skill(i);
    const fl = this.flyer;
    const k = g.k;
    /* Sat on its pad until the round goes, and the first infected until
     * its head start is over. */
    if (g.holds(i)) {
      g.vx[i] = 0;
      g.vy[i] = 0;
      g.vz[i] = 0;
      this.mode[i] = SIT;
      return;
    }
    /* Off the pad: up out of the floor's cells first, which reach an
     * eighth of a metre over the floor, so the first move is in the air. */
    if (this.mode[i] === SIT) {
      const w = g.world;
      const fl = w.floorAt(g.x[i], g.y[i] + 0.5 * this.map.S, g.z[i]);
      if (g.y[i] < fl + 0.25 * k) {
        g.y[i] = fl + 0.25 * k;
        g.yPrev[i] = g.y[i];
      }
      this.mode[i] = HIDE;
      this.thinkAt[i] = 0;
    }
    if (now >= this.thinkAt[i]) {
      this.thinkAt[i] = now + b.think + Math.floor(g.rand() * 60);
      this.perceive(i, now, b);
      this.nodeAt[i] = this.map.near(g.x[i], g.y[i], g.z[i], b.cls);
      if (g.inf[i]) {
        this.thinkInfected(i, now, b);
      } else {
        this.thinkClean(i, now, b);
      }
    }
    /* A chase is flown at the pilot as they are now, ahead by the lead. */
    let gx = this.goalX[i];
    let gy = this.goalY[i];
    let gz = this.goalZ[i];
    let speed = b.speed * k;
    fl.ram[i] = 0;
    if (this.mode[i] === CHASE) {
      const t = this.target[i];
      if (t >= 0 && this.seenNow[i * this.n + t]) {
        const lead = b.lead;
        gx = g.x[t] + g.vx[t] * lead;
        gy = g.y[t] + g.vy[t] * lead;
        gz = g.z[t] + g.vz[t] * lead;
        if (g.world.blocked(g.x[i], g.y[i], g.z[i], gx, gy, gz) >= 0) {
          gx = g.x[t];
          gy = g.y[t];
          gz = g.z[t];
        }
        fl.ram[i] = 1;
      }
    } else if (this.mode[i] === JUKE || this.mode[i] === FLEE) {
      /* Running is flown flat out, not eased into the point it runs to. */
      fl.ram[i] = 1;
    } else if (this.mode[i] === HIDE && !g.hunting) {
      /* Off to its hiding place in the head start: as fast as it goes. */
    } else if (this.mode[i] === HIDE || this.mode[i] === PATROL) {
      speed *= 0.7;
    }
    fl.setGoal(i, gx, gy, gz, speed);
    fl.step(i, now, SKILLS[b.flyAs]);
    if (now >= this.goalUntil[i] && this.mode[i] === JUKE) {
      this.mode[i] = FLEE;
      this.thinkAt[i] = 0;
    }
  }

  setGoalNode(i, node) {
    const m = this.map;
    this.goalNode[i] = node;
    if (node >= 0) {
      this.goalX[i] = m.x[node];
      this.goalY[i] = m.y[node];
      this.goalZ[i] = m.z[node];
    }
  }

  /* A room point at random, of the ones class c can reach from `from`,
   * nearer than `most` and farther than `least`, real metres; -1 for none.
   * Best of a few by `how` (score below). */
  pickNode(i, c, from, least, most, tries, how, now, b) {
    const g = this.g;
    const m = this.map;
    const S = m.S;
    let best = -1;
    let bestS = -Infinity;
    for (let t = 0; t < tries; t += 1) {
      const n = Math.floor(g.rand() * m.N);
      if (m.kind[n] !== ROOM) continue;
      const d = from >= 0 ? m.dist(c, n, from) : 0;
      if (!(d < most * S) || d < least * S) continue;
      const s = this.score(i, how, n, now, b);
      if (s > bestS) {
        bestS = s;
        best = n;
      }
    }
    return best;
  }

  /*
   * How good room point `cand` is for bot i, by `how`: PATROL_AT, away
   * from the other infected so they spread out; HIDE_AT, far from the tank
   * and from the others' hiding places; SAFE_AT, far from the infected it
   * has known of; AWAY_AT, away from (awayX, awayZ) and not past it. A
   * method and not a closure, so a choice allocates nothing.
   */
  score(i, how, cand, now, b) {
    const g = this.g;
    const m = this.map;
    const S = m.S;
    const n = this.n;
    if (how === PATROL_AT) {
      let s = g.rand() * 4 * S;
      if (b.cls > 0) {
        let near = Infinity;
        for (let o = 0; o < n; o += 1) {
          if (o === i || !g.live(o) || !g.inf[o]) continue;
          const dx = m.x[cand] - g.x[o];
          const dz = m.z[cand] - g.z[o];
          near = Math.min(near, Math.sqrt(dx * dx + dz * dz));
        }
        s += Math.min(near, 15 * S);
      }
      return s;
    }
    if (how === HIDE_AT) {
      let s = g.rand() * 3 * S;
      const tank = m.tankNode;
      if (tank >= 0) s += Math.min(m.dist(b.cls, cand, tank), 25 * S);
      for (let o = 1; o < n; o += 1) {
        if (o !== i && this.hideNode[o] >= 0) {
          const h = this.hideNode[o];
          const dx = m.x[cand] - m.x[h];
          const dz = m.z[cand] - m.z[h];
          if (dx * dx + dz * dz < 16 * S * S) s -= 6 * S;
        }
      }
      if (b.cls === 2) s += m.exits[cand] * 1.5 * S;
      return s;
    }
    if (how === SAFE_AT) {
      return this.safety(i, cand, now, b) + g.rand() * 2 * S;
    }
    if (how === AWAY_AT) {
      const tx = this.awayX;
      const tz = this.awayZ;
      const dx = m.x[cand] - tx;
      const dz = m.z[cand] - tz;
      const ax = m.x[cand] - g.x[i];
      const az = m.z[cand] - g.z[i];
      const away = Math.sqrt(dx * dx + dz * dz);
      const toward = (ax * (tx - g.x[i]) + az * (tz - g.z[i])) > 0 ? 6 * S : 0;
      return away - toward;
    }
    return g.rand();
  }

  /* The infected: after the nearest clean pilot it knows of, cutting
   * across when it is not the nearest; else where it last knew of one;
   * else round the school. */
  thinkInfected(i, now, b) {
    const g = this.g;
    const m = this.map;
    const S = m.S;
    const n = this.n;
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < n; j += 1) {
      if (j === i || !g.live(j) || g.inf[j] || !this.knows(i, j, now, b)) continue;
      const q = i * n + j;
      const dx = this.kx[q] - g.x[i];
      const dy = this.ky[q] - g.y[i];
      const dz = this.kz[q] - g.z[i];
      let d = Math.sqrt(dx * dx + dy * dy + dz * dz) + (this.seenNow[q] ? 0 : 3 * S);
      /* Somebody else after them already: an easy or medium bot looks for
       * another, a hard one goes round to meet them. */
      for (let o = 1; o < n; o += 1) {
        if (o !== i && g.isBot[o] && g.live(o) && g.inf[o] && this.target[o] === j && b.cls < 2) d += 4 * S;
      }
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    this.target[i] = best;
    if (best >= 0) {
      const q = i * n + best;
      if (this.seenNow[q]) {
        /* In sight. A hard bot that is not the nearest to them heads for
         * where they are going instead, until it is close. */
        if (b.cls === 2 && bestD > 3 * S && this.nearerChaser(i, best)) {
          const lead = 1.6;
          const px = g.x[best] + g.vx[best] * lead;
          const py = g.y[best] + g.vy[best] * lead;
          const pz = g.z[best] + g.vz[best] * lead;
          const node = m.near(px, py, pz, b.cls);
          if (node >= 0) {
            this.mode[i] = HUNT;
            this.setGoalNode(i, node);
            return;
          }
        }
        this.mode[i] = CHASE;
        this.goalX[i] = g.x[best];
        this.goalY[i] = g.y[best];
        this.goalZ[i] = g.z[best];
        return;
      }
      /* Out of sight: where they were, and a little on. */
      this.mode[i] = HUNT;
      const lead = b.cls === 0 ? 0 : 0.5;
      this.goalX[i] = this.kx[q] + this.kvx[q] * lead;
      this.goalY[i] = this.ky[q] + this.kvy[q] * lead * 0.3;
      this.goalZ[i] = this.kz[q] + this.kvz[q] * lead;
      if (g.world.inside(this.goalX[i], this.goalY[i], this.goalZ[i])) {
        this.goalX[i] = this.kx[q];
        this.goalY[i] = this.ky[q];
        this.goalZ[i] = this.kz[q];
      }
      /* Got there and nobody: they are forgotten, and it looks about. */
      if (this.flyer.near(i, this.kx[q], this.ky[q], this.kz[q], 1.0 * S)) {
        this.kAt[q] = -Infinity;
      }
      return;
    }
    /* Nobody known: round the school, each infected bot somewhere the
     * others are not. */
    if (this.mode[i] !== PATROL || now >= this.goalUntil[i] || this.flyer.near(i, this.goalX[i], this.goalY[i], this.goalZ[i], 1.0 * S)) {
      this.mode[i] = PATROL;
      const from = this.nodeAt[i];
      const node = this.pickNode(i, b.cls, from, 6, 60, 24, PATROL_AT, now, b);
      if (node >= 0) {
        this.setGoalNode(i, node);
      }
      this.goalUntil[i] = now + 5000 + Math.floor(g.rand() * 3000);
    }
  }

  /* Whether another infected pilot is nearer clean pilot j than bot i. */
  nearerChaser(i, j) {
    const g = this.g;
    const dx = g.x[j] - g.x[i];
    const dy = g.y[j] - g.y[i];
    const dz = g.z[j] - g.z[i];
    const mine = dx * dx + dy * dy + dz * dz;
    for (let o = 0; o < this.n; o += 1) {
      if (o === i || !g.live(o) || !g.inf[o]) continue;
      const ex = g.x[j] - g.x[o];
      const ey = g.y[j] - g.y[o];
      const ez = g.z[j] - g.z[o];
      if (ex * ex + ey * ey + ez * ez < mine) return true;
    }
    return false;
  }

  /* The clean: off to a hiding place in the head start; run from what it
   * knows of once it is near; else keep somewhere quiet. */
  thinkClean(i, now, b) {
    const g = this.g;
    const m = this.map;
    const S = m.S;
    const n = this.n;
    const here = this.nodeAt[i];
    /* The nearest infected pilot it knows of. */
    let threat = -1;
    let threatD = Infinity;
    for (let j = 0; j < n; j += 1) {
      if (j === i || !g.live(j) || !g.inf[j] || !this.knows(i, j, now, b)) continue;
      const q = i * n + j;
      const dx = this.kx[q] - g.x[i];
      const dy = this.ky[q] - g.y[i];
      const dz = this.kz[q] - g.z[i];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < threatD) {
        threatD = d;
        threat = j;
      }
    }
    const scared = threat >= 0 && threatD < b.fear * S && g.hunting;
    if (this.mode[i] === JUKE && now < this.goalUntil[i]) {
      return;
    }
    if (!scared) {
      /* Quiet: in the head start, to a hiding place far from the tank and
       * from the others'; later, a medium or hard bot keeps moving to
       * wherever is farthest from what it last knew of. */
      if (this.hideNode[i] < 0 || (!g.hunting && this.mode[i] === SIT)) {
        const node = this.pickNode(i, b.cls, here, 3, 60, 30, HIDE_AT, now, b);
        if (node >= 0) {
          this.hideNode[i] = node;
          this.setGoalNode(i, node);
        }
        this.mode[i] = HIDE;
        this.goalUntil[i] = now + 8000 + Math.floor(g.rand() * 6000);
        return;
      }
      if (this.mode[i] !== HIDE) {
        this.mode[i] = HIDE;
        this.goalUntil[i] = 0;
      }
      if (g.hunting && b.cls > 0 && now >= this.goalUntil[i]) {
        const node = this.pickNode(i, b.cls, here, 2, 16, 20, SAFE_AT, now, b);
        if (node >= 0) {
          this.hideNode[i] = node;
          this.setGoalNode(i, node);
        }
        /* A hard bot keeps on the move; a medium one moves less, since
         * moving is being seen. */
        this.goalUntil[i] = now + (b.cls === 2 ? 3500 : 12000) + Math.floor(g.rand() * 4000);
      }
      return;
    }
    /* A jink, close in, for a hard or a medium bot now and then. */
    const tq = i * n + threat;
    if (threatD < 1.8 * S && this.seenNow[tq] && g.rand() < b.juke) {
      const dx = g.x[threat] - g.x[i];
      const dz = g.z[threat] - g.z[i];
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      const side = g.rand() < 0.5 ? -1 : 1;
      const sx = (-dz / d) * side * 1.3 * S;
      const sz = (dx / d) * side * 1.3 * S;
      const up = (g.rand() - 0.3) * 0.6 * S;
      const jx = g.x[i] + sx;
      const jy = g.y[i] + up;
      const jz = g.z[i] + sz;
      if (g.world.blocked(g.x[i], g.y[i], g.z[i], jx, jy, jz) < 0) {
        this.mode[i] = JUKE;
        this.goalX[i] = jx;
        this.goalY[i] = jy;
        this.goalZ[i] = jz;
        this.goalUntil[i] = now + 380;
        return;
      }
    }
    this.mode[i] = FLEE;
    const c = b.cls;
    if (c === 0) {
      /* Easy: straight away from it, as far as it can see to go. */
      this.awayX = this.kx[tq];
      this.awayZ = this.kz[tq];
      const node = this.pickNode(i, c, here, 1.5, 9, 18, AWAY_AT, now, b);
      if (node >= 0) this.setGoalNode(i, node);
      return;
    }
    /* Medium and hard: a room between, by the school's map; a medium bot
     * minds the two nearest infected pilots it knows of, a hard one the
     * three nearest, so it does not run from one into another. */
    if (here < 0) {
      return;
    }
    const thr = this.thr;
    const thrD = this.thrD;
    let nt = 0;
    const most = c === 2 ? 3 : 2;
    for (let j = 0; j < n; j += 1) {
      if (j === i || !g.live(j) || !g.inf[j] || !this.knows(i, j, now, b)) continue;
      const q = i * n + j;
      const dx = this.kx[q] - g.x[i];
      const dy = this.ky[q] - g.y[i];
      const dz = this.kz[q] - g.z[i];
      const d = dx * dx + dy * dy + dz * dz;
      if (nt < most) {
        thr[nt] = j;
        thrD[nt] = d;
        nt += 1;
      } else {
        let far = 0;
        for (let t = 1; t < nt; t += 1) if (thrD[t] > thrD[far]) far = t;
        if (d < thrD[far]) {
          thr[far] = j;
          thrD[far] = d;
        }
      }
    }
    for (let t = 0; t < nt; t += 1) {
      const q = i * n + thr[t];
      thr[t] = m.near(this.kx[q], this.ky[q], this.kz[q], c);
    }
    const lambda = c === 2 ? 0.55 : 0.8;
    let best = -1;
    let bestS = -Infinity;
    for (let t = 0; t < 40; t += 1) {
      const cand = Math.floor(g.rand() * m.N);
      if (m.kind[cand] !== ROOM && m.kind[cand] !== SIDE) continue;
      const dMe = m.dist(c, cand, here);
      if (!(dMe < 14 * S) || dMe < 1.5 * S) continue;
      /* As far from the nearest of them as the school allows, and not by
       * way of any of them: one is on the way when going by it is next to
       * no longer than the way itself. Every distance here is from the
       * bot's own point or one of theirs, so a choice works out a row or
       * four, never forty. */
      let dT = Infinity;
      let past = false;
      for (let u = 0; u < nt; u += 1) {
        const tn = thr[u];
        if (tn < 0) continue;
        const toCand = m.dist(c, cand, tn);
        dT = Math.min(dT, toCand);
        if (m.dist(c, here, tn) + toCand < dMe + 1.0 * S) past = true;
      }
      if (past || !Number.isFinite(dT)) continue;
      const s = Math.min(dT, 30 * S) - lambda * dMe + m.exits[cand] * (c === 2 ? 1.2 : 0.6) * S + g.rand() * S;
      if (s > bestS) {
        bestS = s;
        best = cand;
      }
    }
    if (best >= 0) this.setGoalNode(i, best);
  }

  /* How safe room point `cand` is for clean bot i: how far, as the
   * infected fly, from the nearest it has known of lately. */
  safety(i, cand, now, b) {
    const g = this.g;
    const m = this.map;
    const S = m.S;
    const n = this.n;
    let near = 30 * S;
    for (let j = 0; j < n; j += 1) {
      if (!g.live(j) || !g.inf[j]) continue;
      const q = i * n + j;
      if (now - this.kAt[q] > b.memory * 3) continue;
      const dx = m.x[cand] - this.kx[q];
      const dz = m.z[cand] - this.kz[q];
      near = Math.min(near, Math.sqrt(dx * dx + dz * dz));
    }
    return near + m.exits[cand] * 0.8 * S;
  }
}
