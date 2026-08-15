/*
 * trackdoc.js: read a track document and hand back a course the field can
 * build.
 *
 * This is the seam between the track builder and the game, and it is the
 * only one. The builder writes a document; schema.md describes it; this file
 * reads it. Nothing else in the game knows the document exists.
 *
 * THE DIRECTION OF THE DEPENDENCY IS DELIBERATE AND IT IS ONE WAY. This
 * module imports the builder's model.js, elements.js, geometry.js and
 * path.js, which are pure data and pure functions: no DOM, no canvas, no
 * Three.js, no imports of their own outside that set. The ground-mark
 * builder in guide.js is the same kind of thing, and lives on this side
 * of the seam so the renderer never has to read a document. The builder
 * still imports nothing from the game and must not. The alternative, a second
 * implementation of normalize() and of the aperture maths living here, is
 * exactly the drift schema.md exists to prevent: two readers of one format
 * disagreeing about what a tilted gate means is a bug nobody would find
 * until a course flew wrong.
 *
 * WHAT THIS FILE DOES NOT DO: it does not touch Three.js and it does not
 * place anything. It converts frames, applies the game's obstacle scale, and
 * returns plain data. src/render/scene.js does the building.
 *
 * THE TWO FRAMES.
 *
 *   Document: right handed, Z up, origin at the field's near left corner,
 *   so every point has x in [0, width] and y in [0, depth].
 *   Scene: Three.js, Y up, origin at the middle of the world.
 *
 * The conversion is the same one the builder's own 3D preview makes, and it
 * happens here exactly once:
 *
 *   sceneX =  docX - width / 2
 *   sceneZ = -(docY - depth / 2)
 *   sceneY =  terrain(sceneX, sceneZ) + docZ
 *
 * so a document's field is centred on the world's origin and its base
 * heights are measured from the ground under them. The Y is not applied
 * here, because the terrain is not known until the height field has been
 * built from the course this file returns. The scene adds it.
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

import { ELEMENTS, KIND, GATE_FLAG_H, GATE_FLAG_POLE_R, flagSideOf, flagSideSigns } from '../trackbuilder/elements.js';
import {
  normalize, elementById, aperturesOf, startPadsOf,
} from '../trackbuilder/model.js';
import { buildPath } from '../trackbuilder/path.js';
import { wrapBetween, figureCueOf, upgradeStackedFigures } from '../trackbuilder/figures.js';
import { GATE_SCALE } from './track.js';
import { startBlockLaneOffset, startBlockDims } from '../art/startblock.js';
import { guideFromKnots } from './guide.js';

/*
 * How far behind the FIRST GATE the craft is parked when a track has no
 * start pads. The pads themselves are where the quad sits; they are not a
 * timing plane, so a course that has them parks on a stand, not behind it.
 */
const SPAWN_BACK = 2.5;

/*
 * The direction of travel through a gate is MINUS its plane normal, which is
 * the game's existing convention and not a choice made here: src/game/race.js
 * builds its local frame that way and the field's own stations, whose yaw is
 * the curve tangent, are flown against it. Every heading below is computed to
 * satisfy it, so a document's gate and a figure eight's gate are flown by the
 * same arithmetic.
 */
export function headingForTravel(tx, tz) {
  const n = Math.hypot(tx, tz);
  if (!(n > 1e-9)) {
    return null;
  }
  return Math.atan2(-tx / n, -tz / n);
}

/* Document yaw to scene yaw. A GATE's document yaw is a plane normal, so
 * the scene heading is a quarter turn on from it. Everything else (a wall,
 * a flag, the start pads) is a heading about up, and adding that quarter
 * turn is what stood every barrier 90 degrees off the builder's preview. */
function sceneYawFor(el, kind) {
  if (kind === KIND.APERTURE) {
    return el.yaw + Math.PI / 2;
  }
  if (kind === KIND.START) {
    const forward = { x: Math.cos(el.yaw), z: -Math.sin(el.yaw) };
    return headingForTravel(forward.x, forward.z) ?? 0;
  }
  return el.yaw;
}

/* Document point to scene point, horizontally. Height is the scene's job. */
function toScene(field, p) {
  return { x: p.x - field.width / 2, z: -(p.y - field.depth / 2) };
}

/*
 * Every length in an obstacle, through the game's declared departure from
 * the published dimensions.
 *
 * GATE_SCALE IS APPLIED HERE, and that is a decision worth stating. A
 * document holds MultiGP's own figures; the race field builds every obstacle
 * 15 percent larger, which src/game/track.js declares and explains as a
 * playability choice made with the rulebook still on the page. If a custom
 * course did not get the same treatment, the identical 5 ft gate would be a
 * different size on the two maps and a pilot's eye would have to relearn the
 * world every time they changed track. Positions are NOT scaled: the layout
 * is the author's and moving their gates is not a scale, it is a redesign.
 */
function builtDims(dims) {
  return {
    clearW: dims.clearW * GATE_SCALE,
    clearH: dims.clearH * GATE_SCALE,
    sillH: dims.sillH * GATE_SCALE,
    levelPitch: dims.levelPitch * GATE_SCALE,
    stack: Math.max(1, Math.round(dims.levels)),
  };
}

/*
 * Read a document and return a course.
 *
 *   structures  one per element on the field, whatever it is, with its scene
 *               position and orientation and its BUILT dimensions
 *   stations    one per APERTURE in the flying order, which is not the same
 *               list: a ladder flown twice is one structure and two stations
 *   spawn       where the quad is parked, from the start pads
 *   line        the racing line as scene points, which the terrain uses to
 *               flatten its corridor
 *   guide       the taut-string ground marks: dashes, gate arrows, flag wraps
 *   warnings    anything the game itself could not honour
 *
 * Never throws. A document it cannot use yields a course with no stations,
 * which the shell already treats as a map with nothing to score.
 */
export function courseFromDocument(raw) {
  const { doc, repairs } = normalize(raw);
  upgradeStackedFigures(doc);
  const field = doc.field;
  const warnings = [...repairs];

  /* One structure per element. Markers and barriers are here too: they are
   * built and they are solid, they are simply never flown through. */
  const structures = [];
  const byElement = new Map();
  for (const el of doc.elements) {
    const def = ELEMENTS[el.type];
    const kind = def.kind;
    if (kind === KIND.ANNOTATION) {
      /* A label is an authoring note. It is drawn on the plan and in the
       * builder's preview and it has no business standing on a race field. */
      continue;
    }
    const p = toScene(field, el.position);
    const s = {
      id: el.id,
      type: el.type,
      kind,
      name: el.name || def.label,
      x: p.x,
      z: p.z,
      baseY: el.position.z,
      yaw: sceneYawFor(el, kind),
      /* Tilt of the aperture plane, radians, straight from the document.
       * Zero for everything that is not an aperture. */
      pitch: kind === KIND.APERTURE ? el.pitch : 0,
      dims: kind === KIND.APERTURE ? builtDims(el.dims) : { ...el.dims },
    };
    if (def.flagSide) {
      s.flagSigns = flagSideSigns(flagSideOf(el));
      s.flagH = GATE_FLAG_H * GATE_SCALE;
      s.flagPoleR = GATE_FLAG_POLE_R * GATE_SCALE;
    }
    structures.push(s);
    byElement.set(el.id, s);
  }

  /*
   * The stations, in flying order, read off the racing line the builder
   * derives rather than off doc.sequence directly. The line is where the
   * entry sign has already been turned into a direction of travel and a
   * marker's clearance has already been turned into a knot, so reading it
   * means the course the game flies is the course the builder drew.
   */
  const path = buildPath(doc);
  const stations = [];
  for (const knot of path.knots) {
    if (knot.role !== 'aperture' || !knot.seq) {
      continue;
    }
    const el = elementById(doc, knot.seq.elementId);
    const structure = byElement.get(knot.seq.elementId);
    if (!el || !structure) {
      continue;
    }
    const apertures = aperturesOf(el);
    const index = Math.min(Math.max(0, knot.seq.apertureIndex ?? 0), apertures.length - 1);
    const ap = apertures[index];

    /* The travel direction, document frame to scene frame. */
    const t = knot.tangent;
    const travel = { x: t.x, y: t.z, z: -t.y };
    const heading = headingForTravel(travel.x, travel.z);

    /*
     * A flat dive gate has no horizontal travel at all, so there is no
     * heading to read off it. Fall back to the structure's own yaw, which is
     * still a real direction: it is the azimuth the opening's width runs
     * across, and with the pitch below it makes a complete frame.
     */
    const yaw = heading == null ? structure.yaw : heading;

    /*
     * Pitch, as the angle the direction of travel dips below the horizontal.
     * The document's own pitch is a property of the PLANE and the entry sign
     * says which way through it; what the gate has to be built and scored
     * against is the direction the quad actually goes, so the two are folded
     * together here and the station carries one angle.
     */
    const tilt = Math.asin(Math.max(-1, Math.min(1, travel.y)));

    const pos = toScene(field, { x: el.position.x, y: el.position.y });
    stations.push({
      elementId: el.id,
      structure,
      apertureIndex: index,
      flyOrder: stations.length,
      x: pos.x,
      z: pos.z,
      baseY: el.position.z,
      /* Height of THIS opening's centre above the structure's base, built. */
      centreY: ap.centerH * GATE_SCALE,
      clearW: ap.clearW * GATE_SCALE,
      clearH: ap.clearH * GATE_SCALE,
      yaw,
      pitch: tilt,
      name: structure.name,
      type: el.type,
      entry: knot.seq.entry,
      cue: '',
    });
  }

  /* Where the quad is parked. On a launch stand when the track has pads,
   * otherwise behind the first gate the same way the field stands off its
   * own timing line. */
  const pads = startPadsOf(doc);
  let spawn = null;
  if (pads) {
    const p = toScene(field, pads.position);
    /*
     * THE PADS' YAW IS A HEADING, NOT A PLANE.
     *
     * A gate's document yaw points its plane NORMAL, so its scene yaw is
     * that angle plus a quarter turn; the start pads' document yaw points
     * the way the quad sets off. Reusing the gate formula here sent the quad
     * out backwards, with the first gate behind its right shoulder, which is
     * what the frame check in the harness caught. Running the pads' heading
     * through headingForTravel is not just the fix, it is the reason that
     * function exists: it is the one place the game's travel convention is
     * written down.
     */
    const forward = { x: Math.cos(pads.yaw), z: -Math.sin(pads.yaw) };
    const yaw = headingForTravel(forward.x, forward.z) ?? 0;
    /* Onto one stand in the row, using the same across-the-line offset the
     * mesh uses, so the craft sits on a block rather than in the grass
     * between two. Pitch matches the ramp so the front arms rest on the
     * foam. */
    const off = startBlockLaneOffset(pads.dims);
    spawn = {
      x: p.x + Math.cos(yaw) * off,
      z: p.z - Math.sin(yaw) * off,
      yaw,
      pitch: startBlockDims(pads.dims.padSize).tilt,
    };
  } else if (stations.length) {
    const first = stations[0];
    spawn = {
      x: first.x + Math.sin(first.yaw) * SPAWN_BACK * 3,
      z: first.z + Math.cos(first.yaw) * SPAWN_BACK * 3,
      yaw: first.yaw,
    };
    warnings.push('No start pads in the track, so the quad is parked behind the first gate.');
  } else {
    spawn = { x: 0, z: 0, yaw: 0 };
  }

  /* The racing line in scene metres. The terrain flattens a corridor along
   * it. */
  const line = path.samples.map((s) => {
    const p = toScene(field, s.pos);
    return { x: p.x, y: s.pos.z, z: p.z };
  });

  /*
   * Ground marks. Built from the knots, not from the Hermite samples: the
   * paint has to hug flags on the pass side the way a racer does, and the
   * cubic through gate-normal tangents does not. Scene XZ, so the renderer
   * never has to know a document existed.
   */
  const guide = guideFromKnots(sceneKnots(path.knots, field));

  if (!stations.length) {
    warnings.push('This track has nothing to fly through, so there is no lap to time.');
  }

  const out = {
    id: 'custom',
    name: doc.name,
    documentId: doc.id,
    /*
     * The event's logo, straight through. normalize() has already refused
     * anything that is not an embedded image, so what reaches the renderer
     * is a data URL or nothing, and the renderer never has to decide whether
     * a string is safe to hand a texture loader.
     */
    logo: doc.branding?.logo ?? null,
    field: { width: field.width, depth: field.depth },
    structures,
    stations,
    spawn,
    line,
    guide,
    figures: stampFigures(doc, field, stations),
    warnings,
    /* Kept so a caller can report on the track without re-reading it. */
    lapLength: path.length,
    closed: path.closed,
  };
  out.samples = corridorSamples(out);
  return out;
}

/*
 * Name each stacked pass, and build the polyline the world draws as the
 * figure's hint: the openings in order, with a wrap between each pair so
 * the ribbon goes around the stack rather than through it.
 *
 * Mutates stations (writes `cue`). Returns the figures list.
 */
function stampFigures(doc, field, stations) {
  const figures = [];
  let i = 0;
  while (i < stations.length) {
    let j = i;
    while (j + 1 < stations.length && stations[j + 1].elementId === stations[i].elementId) {
      j += 1;
    }
    const run = stations.slice(i, j + 1);
    const el = elementById(doc, stations[i].elementId);
    if (el) {
      const seqs = run.map((st) => ({ apertureIndex: st.apertureIndex, entry: st.entry }));
      for (const st of run) {
        st.cue = figureCueOf(el, { apertureIndex: st.apertureIndex }, seqs);
      }
      if (run.length >= 2) {
        const points = [];
        for (let k = 0; k < run.length; k += 1) {
          const st = run[k];
          points.push({ x: st.x, y: st.baseY + st.centreY, z: st.z });
          if (k < run.length - 1) {
            const nxt = run[k + 1];
            const wrap = wrapBetween(el, seqs[k], seqs[k + 1]);
            const p = toScene(field, wrap.pos);
            points.push({
              x: p.x,
              y: (st.baseY + st.centreY + nxt.baseY + nxt.centreY) * 0.5,
              z: p.z,
            });
          }
        }
        figures.push({
          flyOrders: run.map((st) => st.flyOrder),
          points,
        });
      }
    }
    i = j + 1;
  }
  return figures;
}

/*
 * Knots the ground-mark builder wants, in the scene frame. A marker's fly
 * point is already offset; the pole and the clearance go with it so the
 * string line can wrap the peg instead of the Hermite bulge.
 */
function sceneKnots(knots, field) {
  return knots.map((k) => {
    const p = toScene(field, k.pos);
    const out = { role: k.role, x: p.x, z: p.z, radius: 0 };
    if (k.role === 'marker' && k.markerPos) {
      const pole = toScene(field, k.markerPos);
      out.poleX = pole.x;
      out.poleZ = pole.z;
      out.radius = k.seq && k.seq.clearance != null ? k.seq.clearance : 1.5;
    }
    return out;
  });
}

/*
 * Points for the height field's flat corridor, in the shape it wants:
 * { x, z } along the course. The racing line is the right curve to flatten
 * against, because it is where the quad goes, but a line sampled every few
 * centimetres would make the height field's nearest point search 4000 deep
 * for every terrain vertex, so it is thinned to a stated spacing.
 */
export function corridorSamples(course, spacingM = 4) {
  const out = [];
  let last = null;
  for (const p of course.line) {
    if (!last || Math.hypot(p.x - last.x, p.z - last.z) >= spacingM) {
      out.push({ x: p.x, z: p.z });
      last = p;
    }
  }
  /* Every structure gets one too, so a gate placed off the line still stands
   * on flat ground rather than half way up a hillside. */
  for (const s of course.structures) {
    out.push({ x: s.x, z: s.z });
  }
  if (course.spawn) {
    out.push({ x: course.spawn.x, z: course.spawn.z });
  }
  if (!out.length) {
    out.push({ x: 0, z: 0 });
  }
  return out;
}
