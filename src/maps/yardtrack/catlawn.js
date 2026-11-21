/*
 * catlawn.js: where the yard cat may be. Pure arithmetic, made once when
 * the map is built: no three.js, no page, and nothing here runs in a frame
 * except a few lookups in arrays made at load.
 *
 * WHY THE CAT NEEDS A MAP OF ITS OWN. The owner asked for a cat that hunts
 * the craft "everywhere the track is" and that "can't actually touch you".
 * The project's map rule is that every gap a pilot can see is flyable and
 * every solid collides. The cat is the one thing drawn in a yard that is
 * not solid, so it has to earn that by never being where a pilot flies on
 * purpose and never standing in something that is solid. This file is that
 * promise as a grid over the lawn the track stands on, a quarter of a metre
 * to a cell:
 *
 *   hard   the cat is never here: off the lawn, in or beside anything
 *          solid that stands in its way (read from the very collider set
 *          the plant flies against, so the cat's idea of a tree is the
 *          craft's), on a drawn slab that is not lawn, in the mouth of a
 *          gate on either side of it, and where a run is set down
 *   soft   the cat may cross but never stops: under the low parts of the
 *          racing line, in the mouth of a scoring plane that has no pipe,
 *          on the track's two floor logos, round the start
 *   roof   how high the lowest solid over a cell is, so a leap never goes
 *          up into a gate's top bar or a tree's crown
 *   clear  how far a cell is from the nearest hard one, so a place to sit,
 *          to wait in ambush or to land a pounce has room for the whole
 *          cat whichever way it turns
 *
 * and the two lists the cat hunts from: places to rest, and places beside
 * the low parts of the racing line to lie in wait.
 *
 * Finding a way round things is a flood from the goal over the free cells
 * (a few thousand, a few tens of microseconds), done only when the goal
 * moves to another cell and there is no straight way to it, never every
 * frame, into arrays made here.
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

/* A cell's side, world metres. */
export const CELL = 0.25;
/* What way() answers. */
export const NONE = 0;
export const WAY = 1;
export const WAIT = 2;
/* The two kinds of place to lie in wait. */
export const BESIDE = 0;
export const UNDER = 1;
/* Not reached, in the flood. */
const FAR = 0xffff;
/* How many cells the flood spreads in one call. */
const SPREAD = 500;

/*
 * The lengths below are in a CAT's metres and are multiplied by the
 * track's scale, the world metres to one of the cat's, so the lawn is the
 * same lawn to the cat in a yard built at 3.5 and in one built at 3.43.
 *
 *   MARGIN     how far past the track's own box the cat's lawn runs
 *   BODY       what a solid is grown by: half the cat's width and a little
 *   STEP_OVER  a solid no higher than this is stepped over (a gate's foot,
 *              a pipe lying on the grass), unless it is a slab
 *   TALL       the cat standing on its hind legs: a solid that begins above
 *              this is a roof and not a wall
 *   GATE_SIDE  a gate's mouth is hard this far past each post
 *   GATE_DEEP  and this far in front of it and behind it
 *   GATE_WIDE  an opening wider than this with no pipe round it is a
 *              scoring plane and not a gate: soft, not hard
 *   START      hard this far round where a run is set down
 *   LANE       soft this far either side of the racing line where it is low
 *   LANE_LOW   "low": the line lower than this over the lawn
 *   ROOM       a place to stop has this much room all round
 *   UNDER_LOW  the line this high or higher can be leapt at from below
 *   UNDER_HIGH and higher than this it is out of a cat's reach
 */
const MARGIN = 1.3;
const BODY = 0.16;
const STEP_OVER = 0.05;
const TALL = 0.56;
const GATE_SIDE = 0.1;
const GATE_DEEP = 0.45;
const GATE_WIDE = 0.9;
const START = 0.75;
const LANE = 0.3;
const LANE_LOW = 0.75;
const ROOM = 0.34;
const UNDER_LOW = 1.08;
const UNDER_HIGH = 1.75;

/*
 * THE LAWN. `track` is the yard track (./yardtrack.js): its box, its
 * gates, its racing line, its start and its logos, in the world. `solids`
 * is the map's built collider set (src/game/collide.js Colliders, after
 * build()), every solid there is. `parts` is the map's own structure
 * (src/props/parts.js), read for what is drawn and not solid: a drive, a
 * path, a kerb, which are not lawn.
 */
export function makeLawn({ track, solids = null, parts = null }) {
  const S = track.scale;
  const g = track.y || 0;
  const M = MARGIN * S;
  const x0 = track.box.x0 - M;
  const z0 = track.box.z0 - M;
  const cols = Math.max(1, Math.ceil((track.box.x1 + M - x0) / CELL));
  const rows = Math.max(1, Math.ceil((track.box.z1 + M - z0) / CELL));
  const n = cols * rows;
  const hard = new Uint8Array(n);
  const soft = new Uint8Array(n);
  const roof = new Float32Array(n).fill(1e9);
  const clear = new Float32Array(n);
  const dist = new Uint16Array(n).fill(FAR);
  const queue = new Int32Array(n);
  const cx = (i) => x0 + (i + 0.5) * CELL;
  const cz = (j) => z0 + (j + 0.5) * CELL;
  const body = BODY * S;
  const stepOver = g + STEP_OVER * S;
  const tall = g + TALL * S;

  /* Every cell whose middle is within `r` of the segment a to b: `into` set
   * to one, or `roof` brought down to `y`. */
  function pipe(into, ax, az, bx, bz, r, y) {
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - x0) / CELL));
    const i1 = Math.min(cols - 1, Math.floor((Math.max(ax, bx) + r - x0) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - r - z0) / CELL));
    const j1 = Math.min(rows - 1, Math.floor((Math.max(az, bz) + r - z0) / CELL));
    const ex = bx - ax;
    const ez = bz - az;
    const ee = ex * ex + ez * ez;
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const px = cx(i) - ax;
        const pz = cz(j) - az;
        const t = ee > 1e-9 ? Math.min(1, Math.max(0, (px * ex + pz * ez) / ee)) : 0;
        const dx = px - ex * t;
        const dz = pz - ez * t;
        if (dx * dx + dz * dz <= r * r) {
          if (into) {
            into[j * cols + i] = 1;
          } else if (y < roof[j * cols + i]) {
            roof[j * cols + i] = y;
          }
        }
      }
    }
  }
  /* The same for a rectangle with its sides along the axes, grown by `r`. */
  function slab(into, ax, az, bx, bz, r, y) {
    const i0 = Math.max(0, Math.floor((ax - r - x0) / CELL));
    const i1 = Math.min(cols - 1, Math.floor((bx + r - x0) / CELL));
    const j0 = Math.max(0, Math.floor((az - r - z0) / CELL));
    const j1 = Math.min(rows - 1, Math.floor((bz + r - z0) / CELL));
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const dx = Math.max(ax - cx(i), 0, cx(i) - bx);
        const dz = Math.max(az - cz(j), 0, cz(j) - bz);
        if (dx * dx + dz * dz <= r * r) {
          if (into) {
            into[j * cols + i] = 1;
          } else if (y < roof[j * cols + i]) {
            roof[j * cols + i] = y;
          }
        }
      }
    }
  }
  /* And for a rectangle turned any way: its middle, its two unit axes and
   * its half sizes along them. */
  function plank(into, mx, mz, ux, uz, hu, hv) {
    const r = Math.hypot(hu, hv);
    const i0 = Math.max(0, Math.floor((mx - r - x0) / CELL));
    const i1 = Math.min(cols - 1, Math.floor((mx + r - x0) / CELL));
    const j0 = Math.max(0, Math.floor((mz - r - z0) / CELL));
    const j1 = Math.min(rows - 1, Math.floor((mz + r - z0) / CELL));
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const px = cx(i) - mx;
        const pz = cz(j) - mz;
        if (Math.abs(px * ux + pz * uz) <= hu && Math.abs(-px * uz + pz * ux) <= hv) {
          into[j * cols + i] = 1;
        }
      }
    }
  }

  /* One solid, as a wall, a roof or nothing: a box from (ax, ay, az) to
   * (bx, by, bz), or a pipe between those ends of radius r. */
  let walls = 0;
  function solid(box, ax, ay, az, bx, by, bz, r, drawnOnly) {
    const lo = Math.min(ay, by) - r;
    const hi = Math.max(ay, by) + r;
    if (hi <= g + 0.03) {
      return;
    }
    if (box) {
      const xa = Math.min(ax, bx);
      const xb = Math.max(ax, bx);
      const za = Math.min(az, bz);
      const zb = Math.max(az, bz);
      if (lo >= tall) {
        if (!drawnOnly) {
          slab(null, xa, za, xb, zb, body, lo);
        }
        return;
      }
      /* A low thing is stepped over unless it is a slab: a drive, a path. */
      if (hi <= stepOver && Math.min(xb - xa, zb - za) < 0.6) {
        return;
      }
      slab(hard, xa, za, xb, zb, hi <= stepOver ? 0.1 : body, 0);
      walls += 1;
      return;
    }
    if (lo >= tall) {
      if (!drawnOnly) {
        pipe(null, ax, az, bx, bz, r + body, lo);
      }
      return;
    }
    if (hi <= stepOver) {
      return;
    }
    pipe(hard, ax, az, bx, bz, r + body, 0);
    walls += 1;
  }
  if (solids && solids.fax) {
    for (let i = 0; i < solids.fax.length; i += 1) {
      solid(solids.fbox[i] === 1, solids.fax[i], solids.fay[i], solids.faz[i], solids.fbx[i], solids.fby[i], solids.fbz[i], solids.fr[i], false);
    }
  }
  if (parts) {
    for (const p of parts) {
      /* What the collider set already holds is not asked twice. */
      if (p.draw === false || (p.solid !== false && solids && solids.fax) || p.sweep) {
        continue;
      }
      if (p.t === 'box') {
        solid(true, p.lo[0], p.lo[1], p.lo[2], p.hi[0], p.hi[1], p.hi[2], 0, p.solid === false);
      } else if (p.t === 'cap') {
        solid(false, p.a[0], p.a[1], p.a[2], p.b[0], p.b[1], p.b[2], p.r, p.solid === false);
      }
    }
  }

  /* THE GATES. A gate's heading is the way it is flown: its opening lies
   * across that (./yardtrack.js gatePipes). */
  let mouths = 0;
  for (const gt of track.gates) {
    const a = gt.aperture;
    const low = gt.position.y + a.centreY - a.clearH / 2;
    if (low > g + 0.2 * S) {
      continue;
    }
    const ux = Math.cos(gt.heading);
    const uz = -Math.sin(gt.heading);
    if (a.clearW <= GATE_WIDE * S) {
      plank(hard, gt.position.x, gt.position.z, ux, uz, a.clearW / 2 + GATE_SIDE * S, GATE_DEEP * S);
      mouths += 1;
    } else {
      plank(soft, gt.position.x, gt.position.z, ux, uz, a.clearW / 2, LANE * S);
    }
  }
  /* Where a run is set down, and a ring round it not to stop in. */
  pipe(hard, track.start.x, track.start.z, track.start.x, track.start.z, START * S, 0);
  pipe(soft, track.start.x, track.start.z, track.start.x, track.start.z, (START + 0.25) * S, 0);
  /* The floor logos: a cat sat on a partner's mark hides it. */
  for (const lg of track.logos || []) {
    plank(soft, lg.x, lg.z, Math.cos(lg.yaw), -Math.sin(lg.yaw), lg.w / 2, lg.d / 2);
  }

  /* THE RACING LINE, kept as flat arrays, with how far along it each point
   * is. A lap's line ends where it began: the last point is the first. */
  const raw = track.line || [];
  const closed = raw.length > 2 && Math.hypot(raw[0].x - raw[raw.length - 1].x, raw[0].y - raw[raw.length - 1].y, raw[0].z - raw[raw.length - 1].z) < 0.05;
  const ln = closed ? raw.length - 1 : raw.length;
  const lx = new Float32Array(ln);
  const ly = new Float32Array(ln);
  const lz = new Float32Array(ln);
  const ls = new Float32Array(ln + 1);
  for (let i = 0; i < ln; i += 1) {
    lx[i] = raw[i].x;
    ly[i] = raw[i].y - g;
    lz[i] = raw[i].z;
  }
  for (let i = 0; i < ln; i += 1) {
    const k = (i + 1) % ln;
    ls[i + 1] = ls[i] + (i + 1 < ln || closed ? Math.hypot(lx[k] - lx[i], ly[k] - ly[i], lz[k] - lz[i]) : 0);
  }
  const lineLength = ls[ln];
  for (let i = 0; i < ln; i += 1) {
    if (ly[i] < LANE_LOW * S) {
      pipe(soft, lx[i], lz[i], lx[i], lz[i], LANE * S, 0);
    }
  }

  /* HOW MUCH ROOM. Two sweeps, each cell taking the least of its
   * neighbours' and a step: near enough to the true distance, and the edge
   * of the lawn counts as hard. */
  {
    const D1 = CELL;
    const D2 = CELL * Math.SQRT2;
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const k = j * cols + i;
        if (hard[k]) {
          clear[k] = 0;
          continue;
        }
        let d = Math.min(i + 1, j + 1) * CELL;
        if (i > 0) {
          d = Math.min(d, clear[k - 1] + D1);
        }
        if (j > 0) {
          d = Math.min(d, clear[k - cols] + D1);
          if (i > 0) {
            d = Math.min(d, clear[k - cols - 1] + D2);
          }
          if (i < cols - 1) {
            d = Math.min(d, clear[k - cols + 1] + D2);
          }
        }
        clear[k] = d;
      }
    }
    for (let j = rows - 1; j >= 0; j -= 1) {
      for (let i = cols - 1; i >= 0; i -= 1) {
        const k = j * cols + i;
        if (hard[k]) {
          continue;
        }
        let d = Math.min(clear[k], Math.min(cols - i, rows - j) * CELL);
        if (i < cols - 1) {
          d = Math.min(d, clear[k + 1] + D1);
        }
        if (j < rows - 1) {
          d = Math.min(d, clear[k + cols] + D1);
          if (i < cols - 1) {
            d = Math.min(d, clear[k + cols + 1] + D2);
          }
          if (i > 0) {
            d = Math.min(d, clear[k + cols - 1] + D2);
          }
        }
        clear[k] = d;
      }
    }
  }

  const cellAt = (x, z) => {
    const i = Math.floor((x - x0) / CELL);
    const j = Math.floor((z - z0) / CELL);
    return i < 0 || j < 0 || i >= cols || j >= rows ? -1 : j * cols + i;
  };
  /* May the cat be here at all. */
  const free = (x, z) => {
    const k = cellAt(x, z);
    return k >= 0 && hard[k] === 0;
  };
  /* May it stop here, with `room` world metres all round. */
  const stay = (x, z, room = ROOM * S) => {
    const k = cellAt(x, z);
    return k >= 0 && hard[k] === 0 && soft[k] === 0 && clear[k] >= room;
  };
  /* Is this where a run is flown low or set down: a place to cross, and to
   * look both ways first. */
  const lane = (x, z) => {
    const k = cellAt(x, z);
    return k >= 0 && soft[k] !== 0;
  };
  const roomAt = (x, z) => {
    const k = cellAt(x, z);
    return k < 0 ? 0 : clear[k];
  };
  /* The lowest solid overhead, as a height over the lawn. */
  const roofAt = (x, z) => {
    const k = cellAt(x, z);
    return k < 0 ? 0 : roof[k] - g;
  };
  /* A straight way from one place to another, over free cells only: every
   * cell the line crosses is looked at, so a way that only clips the corner
   * of something is not a way. */
  function sight(ax, az, bx, bz) {
    let i = Math.floor((ax - x0) / CELL);
    let j = Math.floor((az - z0) / CELL);
    const i1 = Math.floor((bx - x0) / CELL);
    const j1 = Math.floor((bz - z0) / CELL);
    if (i < 0 || j < 0 || i >= cols || j >= rows || i1 < 0 || j1 < 0 || i1 >= cols || j1 >= rows) {
      return false;
    }
    const dx = bx - ax;
    const dz = bz - az;
    const si = dx > 0 ? 1 : -1;
    const sj = dz > 0 ? 1 : -1;
    const ex = Math.abs(dx) > 1e-9 ? CELL / Math.abs(dx) : Infinity;
    const ez = Math.abs(dz) > 1e-9 ? CELL / Math.abs(dz) : Infinity;
    let tx = ex === Infinity ? Infinity : (dx > 0 ? x0 + (i + 1) * CELL - ax : ax - (x0 + i * CELL)) / Math.abs(dx);
    let tz = ez === Infinity ? Infinity : (dz > 0 ? z0 + (j + 1) * CELL - az : az - (z0 + j * CELL)) / Math.abs(dz);
    for (let n = cols + rows + 4; n > 0; n -= 1) {
      if (hard[j * cols + i]) {
        return false;
      }
      if (i === i1 && j === j1) {
        return true;
      }
      if (tx < tz) {
        tx += ex;
        i += si;
      } else {
        tz += ez;
        j += sj;
      }
      if (i < 0 || j < 0 || i >= cols || j >= rows) {
        return false;
      }
    }
    return false;
  }

  /* The free cell nearest a place, by rings outward: its index, or -1. */
  function nearestFree(x, z, need = 0) {
    const i = Math.min(cols - 1, Math.max(0, Math.floor((x - x0) / CELL)));
    const j = Math.min(rows - 1, Math.max(0, Math.floor((z - z0) / CELL)));
    for (let r = 0; r < Math.max(cols, rows); r += 1) {
      let best = -1;
      let bd = 1e9;
      for (let b = j - r; b <= j + r; b += 1) {
        if (b < 0 || b >= rows) {
          continue;
        }
        const edge = b === j - r || b === j + r;
        for (let a = i - r; a <= i + r; a += edge ? 1 : 2 * r || 1) {
          if (a < 0 || a >= cols) {
            continue;
          }
          const k = b * cols + a;
          if (hard[k] === 0 && clear[k] >= need && (need === 0 || soft[k] === 0)) {
            const d = (cx(a) - x) * (cx(a) - x) + (cz(b) - z) * (cz(b) - z);
            if (d < bd) {
              bd = d;
              best = k;
            }
          }
        }
      }
      if (best >= 0) {
        return best;
      }
    }
    return -1;
  }

  /* THE FLOOD: free cells' steps from the goal, the eight ways, never
   * cutting a corner, spread only as far as the cell that asked: a way
   * round a gate is short, and most of the lawn is never reached. Kept, and
   * carried on from where it stopped, until the goal is another cell. It
   * spreads at most SPREAD cells a call, about fifteen microseconds, so the
   * longest way round is found over a few frames and no frame pays for it
   * all: a cat that waits a moment before it sets off is a cat. */
  let flooded = -1;
  let floods = 0;
  let head = 0;
  let tail = 0;
  function flood(goal, until) {
    let left = SPREAD;
    if (goal !== flooded) {
      flooded = goal;
      floods += 1;
      dist.fill(FAR);
      head = 0;
      tail = 0;
      if (goal < 0 || hard[goal]) {
        return;
      }
      dist[goal] = 0;
      queue[tail] = goal;
      tail += 1;
    }
    while (head < tail && left > 0 && (until < 0 || dist[until] === FAR)) {
      const k = queue[head];
      head += 1;
      left -= 1;
      const i = k % cols;
      const j = (k - i) / cols;
      const d = dist[k] + 1;
      const w = i > 0 && hard[k - 1] === 0;
      const e = i < cols - 1 && hard[k + 1] === 0;
      const s = j > 0 && hard[k - cols] === 0;
      const nn = j < rows - 1 && hard[k + cols] === 0;
      if (w && dist[k - 1] === FAR) {
        dist[k - 1] = d;
        queue[tail] = k - 1;
        tail += 1;
      }
      if (e && dist[k + 1] === FAR) {
        dist[k + 1] = d;
        queue[tail] = k + 1;
        tail += 1;
      }
      if (s && dist[k - cols] === FAR) {
        dist[k - cols] = d;
        queue[tail] = k - cols;
        tail += 1;
      }
      if (nn && dist[k + cols] === FAR) {
        dist[k + cols] = d;
        queue[tail] = k + cols;
        tail += 1;
      }
      if (w && s && hard[k - cols - 1] === 0 && dist[k - cols - 1] === FAR) {
        dist[k - cols - 1] = d;
        queue[tail] = k - cols - 1;
        tail += 1;
      }
      if (e && s && hard[k - cols + 1] === 0 && dist[k - cols + 1] === FAR) {
        dist[k - cols + 1] = d;
        queue[tail] = k - cols + 1;
        tail += 1;
      }
      if (w && nn && hard[k + cols - 1] === 0 && dist[k + cols - 1] === FAR) {
        dist[k + cols - 1] = d;
        queue[tail] = k + cols - 1;
        tail += 1;
      }
      if (e && nn && hard[k + cols + 1] === 0 && dist[k + cols + 1] === FAR) {
        dist[k + cols + 1] = d;
        queue[tail] = k + cols + 1;
        tail += 1;
      }
    }
  }
  /* The neighbour of `k` nearest the goal, or `k` itself. */
  function downhill(k) {
    const i = k % cols;
    const j = (k - i) / cols;
    let best = k;
    let bd = dist[k];
    for (let b = -1; b <= 1; b += 1) {
      for (let a = -1; a <= 1; a += 1) {
        if ((a === 0 && b === 0) || i + a < 0 || i + a >= cols || j + b < 0 || j + b >= rows) {
          continue;
        }
        const q = k + b * cols + a;
        if (dist[q] >= bd) {
          continue;
        }
        if (a !== 0 && b !== 0 && (hard[k + a] || hard[k + b * cols])) {
          continue;
        }
        bd = dist[q];
        best = q;
      }
    }
    return best;
  }
  /*
   * Where to walk next to get from (x, z) to (gx, gz): the goal itself if
   * the way is straight, else the furthest cell down the flood that can be
   * walked straight at. Into out[0], out[1]. Answers WAY (walk there), WAIT
   * (still looking: ask again next frame) or NONE (there is no way).
   */
  function way(x, z, gx, gz, out) {
    if (sight(x, z, gx, gz)) {
      out[0] = gx;
      out[1] = gz;
      return WAY;
    }
    let from = cellAt(x, z);
    if (from < 0 || hard[from]) {
      /* Stood somewhere it may not be (shoved there): out, the nearest way. */
      from = nearestFree(x, z);
      if (from < 0) {
        return NONE;
      }
      out[0] = cx(from % cols);
      out[1] = cz((from - (from % cols)) / cols);
      return WAY;
    }
    let goal = cellAt(gx, gz);
    if (goal < 0 || hard[goal]) {
      goal = nearestFree(gx, gz);
    }
    if (goal < 0) {
      return NONE;
    }
    flood(goal, from);
    if (dist[from] === FAR) {
      return head < tail ? WAIT : NONE;
    }
    let cur = from;
    let best = from;
    for (let s = 0; s < 24; s += 1) {
      const next = downhill(cur);
      if (next === cur) {
        break;
      }
      cur = next;
      if (!sight(x, z, cx(cur % cols), cz((cur - (cur % cols)) / cols))) {
        break;
      }
      best = cur;
    }
    if (best === from) {
      best = downhill(from);
    }
    out[0] = cx(best % cols);
    out[1] = cz((best - (best % cols)) / cols);
    return WAY;
  }

  /* PLACES TO REST: a metre apart, with room, off everything soft. */
  const restList = [];
  for (let j = 2; j < rows - 2; j += 4) {
    for (let i = 2; i < cols - 2; i += 4) {
      const k = j * cols + i;
      if (hard[k] === 0 && soft[k] === 0 && clear[k] >= ROOM * S) {
        restList.push(k);
      }
    }
  }
  const rests = restList.length;
  const restX = new Float32Array(rests);
  const restZ = new Float32Array(rests);
  restList.forEach((k, r) => {
    restX[r] = cx(k % cols);
    restZ[r] = cz((k - (k % cols)) / cols);
  });

  /*
   * PLACES TO LIE IN WAIT. BESIDE the racing line where it is low enough to
   * leap at, to one side or the other, the nearest place out from it that
   * has room and is off the lane; and UNDER it where it is high enough to
   * leap up at from below and still low enough to be worth the leap. Each
   * remembers the point of the line it watches and which of the two it is.
   */
  const waitList = [];
  const stride = Math.max(1, Math.round(0.5 / Math.max(0.01, lineLength / Math.max(1, ln))));
  for (let i = 0; i < ln; i += stride) {
    if (ly[i] >= UNDER_LOW * S && ly[i] <= UNDER_HIGH * S && stay(lx[i], lz[i], 0.3 * S)) {
      waitList.push(lx[i], lz[i], i, UNDER);
    }
    if (ly[i] > 1.0 * S) {
      continue;
    }
    const a = (i - 2 + ln) % ln;
    const b = (i + 2) % ln;
    let tx = lx[b] - lx[a];
    let tz = lz[b] - lz[a];
    const tl = Math.hypot(tx, tz);
    if (tl < 0.05) {
      continue;
    }
    tx /= tl;
    tz /= tl;
    for (let side = -1; side <= 1; side += 2) {
      for (let d = 0.62; d <= 0.87; d += 0.12) {
        const x = lx[i] - tz * side * d * S;
        const z = lz[i] + tx * side * d * S;
        if (stay(x, z, 0.3 * S)) {
          waitList.push(x, z, i, BESIDE);
          break;
        }
      }
    }
  }
  const waits = waitList.length / 4;
  const waitX = new Float32Array(waits);
  const waitZ = new Float32Array(waits);
  const waitAt = new Int32Array(waits);
  const waitKind = new Uint8Array(waits);
  for (let w = 0; w < waits; w += 1) {
    waitX[w] = waitList[w * 4];
    waitZ[w] = waitList[w * 4 + 1];
    waitAt[w] = waitList[w * 4 + 2];
    waitKind[w] = waitList[w * 4 + 3];
  }

  /* The point of the line nearest a place, looked for near `hint` first
   * (a craft flying the line is near where it last was) and then all of
   * it: its index, or -1 if the line is further than `reach`. */
  function onLine(x, y, z, hint, reach) {
    let best = -1;
    let bd = reach * reach;
    if (ln === 0) {
      return -1;
    }
    if (hint >= 0) {
      for (let s = -6; s <= 36; s += 1) {
        const i = ((hint + s) % ln + ln) % ln;
        const d = (lx[i] - x) * (lx[i] - x) + (ly[i] - y) * (ly[i] - y) + (lz[i] - z) * (lz[i] - z);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      if (best >= 0) {
        return best;
      }
    }
    for (let i = 0; i < ln; i += 1) {
      const d = (lx[i] - x) * (lx[i] - x) + (ly[i] - y) * (ly[i] - y) + (lz[i] - z) * (lz[i] - z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }
  /* How far along the line it is from point `a` on to point `b`. */
  const ahead = (a, b) => {
    const d = ls[b] - ls[a];
    return d >= 0 ? d : d + lineLength;
  };

  let blocked = 0;
  let lanes = 0;
  for (let k = 0; k < n; k += 1) {
    blocked += hard[k];
    lanes += soft[k] && !hard[k] ? 1 : 0;
  }

  return {
    scale: S,
    ground: g,
    x0,
    z0,
    cols,
    rows,
    hard,
    soft,
    clear,
    cellAt,
    free,
    stay,
    lane,
    roomAt,
    roofAt,
    sight,
    nearestFree,
    way,
    cellX: (k) => cx(k % cols),
    cellZ: (k) => cz((k - (k % cols)) / cols),
    centre: { x: (track.box.x0 + track.box.x1) / 2, z: (track.box.z0 + track.box.z1) / 2 },
    reach: Math.hypot(track.box.x1 - track.box.x0, track.box.z1 - track.box.z0) / 2 + M,
    top: (track.box.top ?? 10 * S) - g,
    rests,
    restX,
    restZ,
    waits,
    waitX,
    waitZ,
    waitAt,
    waitKind,
    line: { n: ln, x: lx, y: ly, z: lz, s: ls, length: lineLength, closed },
    onLine,
    ahead,
    /* For the check and the harness. */
    stats() {
      return { cols, rows, cells: n, blocked, lane: lanes, walls, mouths, rests, waits, floods };
    },
  };
}
