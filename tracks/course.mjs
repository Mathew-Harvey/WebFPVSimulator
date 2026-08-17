/*
 * course.mjs: one faithful reading of a Velocidrone .trk into a course.
 *
 * All of the import's judgement is here, so that convert.mjs downstream is
 * only a translation into the track document's vocabulary and the review
 * tools can look at exactly what the converter looked at.
 *
 * WHAT THE FILE SAYS, established from the twelve tracks under tracks/ and
 * cross checked against dutchdronesquad/trackdraw's exporter.
 *
 * ORDER. `gates` is the flying order and the `gate` field is the index. It
 * beats file order on every one of the twelve tracks, by 25 to 180 percent of
 * total lap length. gate 0 carries start and finish and is the lap line.
 *
 * ROLES. Three kinds of thing end up in `gates`: a gate mesh, which is a hole
 * you fly through; a flag or cone mesh, which is a turn marker you fly
 * around; and prefab 88, Velocidrone's invisible CHECKPOINT volume, which is
 * a box the lap has to pass through and which has no geometry at all. Turn
 * flags, cones, the start grid and every prop live in `barriers`, which is
 * never part of the order.
 *
 * WHICH WAY A THING FACES, and this is the trap, because it is not the same
 * axis for the two families. A gate mesh faces along its local FORWARD. A
 * checkpoint faces along its local RIGHT. The evidence is direct rather than
 * statistical: twelve checkpoints across three tracks sit inside the opening
 * of a real gate mesh, so the two are the same hole and must agree, and the
 * checkpoint's local right matches the mesh's forward at 0.996 against 0.059
 * and 0.017 for its other two axes. A checkpoint is authored lying flat and
 * stood up with a quarter turn about X, which also means its Euler yaw is
 * gimbal locked and reading one out of the quaternion returns garbage. Hence
 * axes, never angles.
 *
 * WHEN A CHECKPOINT'S HEADING MEANS NOTHING. A trigger volume does not care
 * which way you cross it, so an author only bothers aligning one when it is
 * standing in for a hole. 2023 GQ Scale's five free air checkpoints are all
 * at one of two default rotations, and taking those seriously would put five
 * gates broadside to the lap. So a heading is only read off a checkpoint that
 * is stood in a gate or sized like one.
 *
 * HOW BIG A CHECKPOINT IS. The prefab is a one metre box, so its scale is
 * metres, and the two axes across the plane are the two that are not the
 * normal. The check: checkpoints sitting in the openings of real gates on
 * 2024 WA States measure 1.51 by 1.27 m and 1.46 by 1.15 m against a MultiGP
 * 5 ft gate of 1.524 m, while free air ones on the same track reach 7.6 by
 * 4.3 m, which is nobody's gate. That gap is what separates "this checkpoint
 * is a gate" from "this checkpoint is a waypoint with nothing there".
 *
 * COORDINATES. Unity is left handed and Y up; the document is right handed
 * and Z up with yaw counter clockwise from +X. Mapping Unity x,z onto
 * document x,y REVERSES the sense of a heading, so a document yaw is pi/2
 * MINUS the Unity heading. See docYaw in trk.mjs.
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

import { parseTrk, metres, scaleOf, axesFromRot, PREFAB_NAMES } from './trk.mjs';

export const CHECKPOINT_PREFAB = 88;

/* A checkpoint this close to a gate mesh is standing in that gate's hole
 * rather than being a second obstacle beside it. Tight, because a tunnel of
 * gates on 2024 WA States is 2.7 m pitch and 1.5 m swallowed a checkpoint
 * that belonged between two of them. */
const IN_THE_HOLE = 0.8;

/* Two openings this close in plan are one structure. Wider than IN_THE_HOLE
 * because a stack's two checkpoints are authored by hand and lean by up to
 * 0.35 m on these tracks. */
const SITE_R = 1.0;

/* Two openings within this of each other in height are the same hole, so a
 * second visit is another pass and not another level. */
const SAME_LEVEL = 0.5;

/* A pennant sits on a gate's header. Further out than this from the gate
 * centre, or lower than this off the ground, and it is a turn flag standing
 * on its own. */
const PENNANT_R = 3.2;
const PENNANT_H = 1.6;

/* Wider or taller than this and a checkpoint is not standing in for a gate.
 * The biggest gate sized one measured is 1.81 m and the smallest free air one
 * 2.52 m, so the gap is comfortable. */
const GATE_SIZED = 2.2;

/* Off vertical by more than this and the aperture is flown down through
 * rather than across, which the document calls a dive gate. */
const DIVE_TILT = Math.PI / 6;

/*
 * How far a gate's authored normal may be from the way the lap goes through
 * it before the heading is not usable.
 *
 * A gate is a hole and you go through it along its normal. At 60 degrees off,
 * the opening a quad has to fit through is already down to cos 60, half its
 * width, which is 0.87 m of a built 1.75 m gate; past that the hole is more
 * closed than open and the frame is standing across the course. Flown at
 * exactly 90 it is a wall, which is what was reported from the cockpit: "the
 * 90 degrees rotated gate that is not correct".
 *
 * 33 gates across eight of the nine courses are past this line, and several
 * are at EXACTLY 90.0 degrees, which is what rules out a bad reading of the
 * quaternion: the same rotation on the same prefab reads correctly elsewhere
 * on the same track. 2023 GQ Scale is the clearest case. Its start gate and
 * its gate 3 carry the identical rotation, [1000,0,0,0]; the lap crosses the
 * start gate north to south, which the grid sitting 33 m due north of it
 * confirms independently, and it crosses gate 3 east to west. The file is
 * consistent and the course still cannot be flown through gate 3 on that
 * heading, so the heading is not what the designer meant for that pass. In
 * Velocidrone it does not have to be: a gate's collision is its frame, the
 * checkpoint that scores it is a separate volume, and an object dropped at
 * the default rotation still counts if you fly past the trigger.
 */
const UNFLYABLE = Math.cos(Math.PI / 3);

/* Below this a gate is standing on the ground and the few centimetres are
 * how the author dropped it, not an elevation. */
export const ON_THE_GROUND = 0.4;

function meshRole(prefab) {
  if (Number(prefab) === CHECKPOINT_PREFAB) {
    return 'checkpoint';
  }
  return PREFAB_NAMES[Number(prefab)] || 'gate';
}

function openingOf(item, normalName) {
  const ax = axesFromRot(item.trans.rot);
  const s = scaleOf(item.trans);
  const across = [
    { v: ax.right, size: s.x },
    { v: ax.up, size: s.y },
    { v: ax.forward, size: s.z },
  ].filter((_, i) => ['right', 'up', 'forward'][i] !== normalName);
  const vertical = Math.abs(across[0].v.y) >= Math.abs(across[1].v.y) ? across[0] : across[1];
  const flat = vertical === across[0] ? across[1] : across[0];
  return { clearW: flat.size, clearH: vertical.size };
}

export function readCourse(text, displayName) {
  const parsed = parseTrk(text);
  const raw = [...(parsed.value.gates || [])].sort((a, b) => (a.gate ?? 0) - (b.gate ?? 0));
  const barriers = parsed.value.barriers || [];

  /* The floor. A gate mesh stands on it, so the lowest gate mesh is it.
   * Reading it off every object instead picks up cones and posts that are
   * deliberately sunk and lands a metre low, which makes every height above
   * ground a metre too big. */
  const standing = raw.filter((g) => meshRole(g.prefab) === 'gate');
  const pool = standing.length ? standing : raw;
  const floor = Math.min(...pool.map((g) => metres(g.trans.pos).height));

  const stops = raw.map((g, i) => {
    const p = metres(g.trans.pos);
    const mesh = meshRole(g.prefab);
    const normalName = mesh === 'checkpoint' ? 'right' : 'forward';
    const n = axesFromRot(g.trans.rot)[normalName];
    return {
      order: g.gate ?? i,
      prefab: Number(g.prefab),
      mesh,
      x: p.x,
      z: p.z,
      agl: p.height - floor,
      /* Unity heading of the aperture normal, from +Z toward +X. */
      heading: Math.atan2(n.x, n.z),
      /* How far the normal is lifted off the horizontal. Zero is a vertical
       * gate, a quarter turn is a hoop lying flat. */
      tilt: Math.asin(Math.max(-1, Math.min(1, n.y))),
      opening: mesh === 'checkpoint' ? openingOf(g, normalName) : null,
      start: Boolean(g.start),
      role: null,
      headingTrusted: mesh !== 'checkpoint',
      siteId: -1,
      level: 0,
      repeatOf: null,
    };
  });

  /*
   * What each stop IS in the document's vocabulary.
   *
   * A checkpoint standing in a gate's hole is that gate. A checkpoint sized
   * like a gate is a hole in its own right, which on these tracks means the
   * scene has something there that the .trk does not list, a stacked
   * structure or an angled hoop. Anything bigger is a waypoint: the author
   * pinning the line where nothing is standing.
   */
  for (const s of stops) {
    if (s.mesh === 'flag' || s.mesh === 'cone') {
      s.role = s.mesh;
      continue;
    }
    if (s.mesh !== 'checkpoint') {
      s.role = 'gate';
      continue;
    }
    const inHole = stops.some((g) => (
      g.mesh !== 'checkpoint'
      && g.mesh !== 'flag'
      && g.mesh !== 'cone'
      && Math.hypot(g.x - s.x, g.z - s.z) < IN_THE_HOLE
    ));
    const sized = Math.max(s.opening.clearW, s.opening.clearH) <= GATE_SIZED;
    s.role = (inHole || sized) ? 'gate' : 'waypoint';
    s.headingTrusted = s.role === 'gate';
  }

  /*
   * Sites. One place on the field is one element, however many times the lap
   * visits it and however many holes it has. Grouping is what lets a gate
   * flown four times be one gate: WCMRC Round 5 does exactly that, and the
   * old import discarded any stop whose position it had seen before, which
   * silently deleted three of those four passes.
   */
  const sites = [];
  for (const s of stops) {
    const radius = s.role === 'gate' ? SITE_R : 0.5;
    let site = sites.find((t) => t.role === s.role && Math.hypot(t.x - s.x, t.z - s.z) < radius);
    if (!site) {
      site = {
        id: sites.length,
        role: s.role,
        x: s.x,
        z: s.z,
        members: [],
        levels: [],
        heading: s.heading,
        tilt: s.tilt,
        /* Filled by the barrier pass below. Which END of the header each
         * pennant sits on is a document question, so it is answered in
         * convert.mjs where the document yaw exists. */
        pennants: [],
        names: [],
      };
      sites.push(site);
    }
    site.members.push(s);
    s.siteId = site.id;
  }

  for (const site of sites) {
    site.names = site.members.map((m) => String(m.order));
    /* Centre the site on its members rather than on whichever one arrived
     * first, so a stack that leans does not hang off its own base. */
    site.x = site.members.reduce((a, m) => a + m.x, 0) / site.members.length;
    site.z = site.members.reduce((a, m) => a + m.z, 0) / site.members.length;

    /* A heading is only worth taking from something that has one: a mesh
     * first, then a checkpoint that is standing in for a hole. */
    const authored = site.members.find((m) => m.mesh !== 'checkpoint' && m.headingTrusted)
      || site.members.find((m) => m.headingTrusted);
    site.heading = authored ? authored.heading : site.members[0].heading;
    site.headingTrusted = Boolean(authored);
    const tilted = site.members.find((m) => Math.abs(m.tilt) > DIVE_TILT);
    site.tilt = tilted ? tilted.tilt : 0;

    if (site.role !== 'gate') {
      site.levels = [{ centre: site.members[0].agl }];
      for (const m of site.members) {
        m.level = 0;
      }
      continue;
    }

    /*
     * The openings. Only a CHECKPOINT knows where a hole is: its position is
     * the centre of the volume you fly through, while a gate mesh's position
     * is the foot of the frame, so reading a height off a mesh would put the
     * hole on the floor. A site with no checkpoint therefore gets one hole at
     * the standard height, and a mesh at a site that does have checkpoints
     * flies the nearest of them.
     */
    const fromChecks = site.members.filter((m) => m.mesh === 'checkpoint').map((m) => m.agl);
    if (fromChecks.length) {
      const levels = [];
      for (const h of fromChecks.slice().sort((a, b) => a - b)) {
        if (!levels.some((c) => Math.abs(c - h) < SAME_LEVEL)) {
          levels.push(h);
        }
      }
      site.levels = levels.map((centre) => ({ centre }));
    } else {
      site.levels = [{ centre: null }];
    }
    for (const m of site.members) {
      if (site.levels.length === 1) {
        m.level = 0;
        continue;
      }
      let best = 0;
      let bestD = Infinity;
      site.levels.forEach((lv, i) => {
        const d = Math.abs(lv.centre - m.agl);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      m.level = best;
    }
    /* The base the frame stands on. A few centimetres is how the author
     * dropped it; a real elevation is kept. */
    const base = Math.min(...site.members.map((m) => m.agl));
    site.base = site.levels[0].centre == null && base > ON_THE_GROUND ? base : 0;
  }

  /*
   * A pass through something already flown. Consecutive repeats are dropped,
   * because two knots in the same place give the line no direction and
   * warnings.js says so; a repeat later in the lap is a real second pass and
   * is kept.
   */
  for (let i = 1; i < stops.length; i += 1) {
    const prev = stops[i - 1];
    if (stops[i].siteId === prev.siteId && stops[i].level === prev.level) {
      stops[i].repeatOf = prev.order;
    }
  }

  /*
   * A heading the lap cannot use is not a heading. See UNFLYABLE above for
   * why this is the file's meaning rather than a misreading of it.
   *
   * The test is against the chord from the stop before to the stop after,
   * which is the direction the lap goes through this one. A site flown more
   * than once is judged on its FIRST pass and keeps whatever it gets, because
   * one structure cannot face two ways; the builder has the same rule.
   */
  const flown = stops.filter((s) => s.repeatOf == null);
  for (let i = 0; i < flown.length; i += 1) {
    const s = flown[i];
    const site = sites[s.siteId];
    if (site.role !== 'gate' || !site.headingTrusted || site.judged) {
      continue;
    }
    site.judged = true;
    const before = flown[(i - 1 + flown.length) % flown.length];
    const after = flown[(i + 1) % flown.length];
    /*
     * ENTRY AND EXIT SEPARATELY, NEVER THE CHORD BETWEEN THE NEIGHBOURS.
     *
     * The chord from the stop before to the stop after is the BISECTOR of the
     * turn, and at a corner it can be ninety degrees from a perfectly placed
     * gate. The first version of this test used it and re-aimed the entrance
     * of 2025 WA States' five gate tunnel by eighty degrees, breaking the one
     * piece of that course that was already right. Arriving at a tunnel from
     * the side is normal; you swing in and then go straight through. So the
     * question is whether EITHER the way in or the way out lines up with the
     * hole, and only a gate that agrees with neither is unusable.
     */
    const legs = [
      [s.x - before.x, s.z - before.z],
      [after.x - s.x, after.z - s.z],
    ];
    /*
     * A SHORT LEG TO ANOTHER GATE IS A TUNNEL, and the heading has to agree
     * with that leg, not with a long swing-in from the side.
     *
     * The entry-OR-exit test is right at a corner: arriving from the side
     * and leaving straight through is a normal manoeuvre, and condemning the
     * entrance of 2025 WA States' five gate tunnel on the bisector was the
     * bug that put this rule in. It is the wrong test inside the tunnel.
     * 2023 MultiGP GQ's gates 10 and 12 sit 3.6 m apart in a line with gate
     * 11, which this pass had already aimed along the line. Their authored
     * normals agreed with the long arrival (or the long departure) and so
     * they stayed 90 degrees to the tunnel: two gates facing the camera and
     * a wall between them. From the cockpit that is "a 90 degree gate right
     * in front of two gates side by side".
     *
     * So a neighbour that is itself a gate, within a gate-and-a-bit, wins.
     * The long swing-in is ignored for that decision, and the heading is
     * aimed along that short leg.
     */
    const beforeSite = sites[before.siteId];
    const afterSite = sites[after.siteId];
    const entryLen = Math.hypot(legs[0][0], legs[0][1]);
    const exitLen = Math.hypot(legs[1][0], legs[1][1]);
    const tunnel = [];
    if (entryLen > 0.5 && entryLen < 5.5 && beforeSite?.role === 'gate') {
      tunnel.push(legs[0]);
    }
    if (exitLen > 0.5 && exitLen < 5.5 && afterSite?.role === 'gate') {
      tunnel.push(legs[1]);
    }
    const use = tunnel.length ? tunnel : legs;
    let best = 0;
    let aim = null;
    let judged = false;
    for (const [dx, dz] of use) {
      const len = Math.hypot(dx, dz);
      if (len < (tunnel.length ? 0.5 : 1)) {
        continue;
      }
      judged = true;
      const along = Math.abs((Math.sin(site.heading) * dx + Math.cos(site.heading) * dz) / len);
      if (along >= best) {
        best = along;
        aim = [dx / len, dz / len];
      }
    }
    if (judged && best < UNFLYABLE && aim) {
      site.headingTrusted = false;
      /* Aim it down the way the lap leaves, or along the tunnel if that is
       * what was judged. For a site flown once the builder's own auto face
       * rule refines this from the racing line; for one flown more than once
       * it will not rotate the structure at all, so this is the answer it
       * keeps. */
      site.heading = Math.atan2(aim[0], aim[1]);
      site.headingDerived = true;
    }
  }

  /*
   * Two parallel gates side by side with a third at 90 degrees in front:
   * that third heading is not usable. 2025 WA States 25 and 27 face the
   * same way 3.9 m apart; 26 sits in front of them square-on, close enough
   * that its side panel is the thing you hit. Mark it derived so the import
   * does not pin the wall, and aim it with the pair. convert.mjs repeats the
   * same geometry on the document as a safety net for the hand-built plan.
   */
  const gateSites = sites.filter((t) => t.role === 'gate');
  for (let i = 0; i < gateSites.length; i += 1) {
    for (let j = i + 1; j < gateSites.length; j += 1) {
      const a = gateSites[i];
      const b = gateSites[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.5 || dist > 6.5) {
        continue;
      }
      const aNx = Math.sin(a.heading);
      const aNz = Math.cos(a.heading);
      const bNx = Math.sin(b.heading);
      const bNz = Math.cos(b.heading);
      if (Math.abs(aNx * bNx + aNz * bNz) < 0.85) {
        continue;
      }
      const alongW = Math.abs(aNz * dx - aNx * dz) / dist;
      if (alongW < 0.7) {
        continue;
      }
      const midX = (a.x + b.x) / 2;
      const midZ = (a.z + b.z) / 2;
      for (const c of gateSites) {
        if (c.id === a.id || c.id === b.id) {
          continue;
        }
        const cNx = Math.sin(c.heading);
        const cNz = Math.cos(c.heading);
        if (Math.abs(aNx * cNx + aNz * cNz) > Math.cos((50 * Math.PI) / 180)) {
          continue;
        }
        const da = Math.hypot(c.x - a.x, c.z - a.z);
        const db = Math.hypot(c.x - b.x, c.z - b.z);
        if (Math.min(da, db) > 4) {
          continue;
        }
        const alongN = (c.x - midX) * aNx + (c.z - midZ) * aNz;
        if (Math.abs(alongN) < 0.3 || Math.abs(alongN) > 4) {
          continue;
        }
        c.headingTrusted = false;
        c.heading = a.heading;
        c.headingDerived = true;
      }
    }
  }

  /*
   * Barriers. A flag close to a gate and up near its header is the pennant on
   * that gate, which the document spells as a flagged gate rather than as a
   * second object. Everything else that is a flag or a cone is a marker
   * standing on the field, and everything else again is scenery the document
   * has no word for.
   */
  const props = [];
  let grid = null;
  for (const b of barriers) {
    const p = metres(b.trans.pos);
    const role = PREFAB_NAMES[Number(b.prefab)] || null;
    const ax = axesFromRot(b.trans.rot);
    const prop = {
      prefab: Number(b.prefab),
      role,
      x: p.x,
      z: p.z,
      agl: p.height - floor,
      heading: Math.atan2(ax.forward.x, ax.forward.z),
      attachedTo: null,
    };
    if (role === 'start grid' && !grid) {
      grid = prop;
    }
    if (role === 'flag' && prop.agl > PENNANT_H) {
      let best = null;
      for (const site of sites) {
        if (site.role !== 'gate') {
          continue;
        }
        const d = Math.hypot(site.x - prop.x, site.z - prop.z);
        if (d < PENNANT_R && (!best || d < best.d)) {
          best = { site, d };
        }
      }
      if (best) {
        prop.attachedTo = best.site.id;
        best.site.pennants.push(prop);
      }
    }
    props.push(prop);
  }

  return {
    name: displayName || parsed.name,
    sourceName: parsed.name,
    sceneId: parsed.sceneId,
    floor,
    stops,
    sites,
    props,
    grid,
    diveTilt: DIVE_TILT,
    gateSized: GATE_SIZED,
  };
}

export function isDive(site) {
  return Math.abs(site.tilt) > DIVE_TILT;
}
