/*
 * faces.js: which way each element faces, and which side of a marker the
 * quad goes.
 *
 * This is the core of the tool, so the rules are written out rather than
 * inferred from the code.
 *
 * ENTRY FACE. Every aperture has a normal, fixed by the element's yaw and
 * pitch. A sequence entry carries `entry`, either +1 or -1, and the DIRECTION
 * OF TRAVEL through that opening is entry multiplied by the normal. So
 * entry = +1 means the quad flies along the normal and therefore enters the
 * opening from the face the normal points AWAY from. entry = 0 means nobody
 * has decided yet, and the results panel says so.
 *
 * PASS SIDE. A flag or a cone has no opening. `passSide` says which side of
 * the MARKER the QUAD passes on, in the frame of the direction of travel.
 * "left" means the quad is to the left of the marker, so the racing line is
 * pushed to marker + clearance * left. "right" is the mirror.
 *
 * AUTO DEFAULTING. The user should almost never have to set either. When an
 * element is placed, or when a neighbour moves, or when the sequence is
 * reordered, every entry that the user has NOT touched is re-derived from the
 * straight line between the previous and the next sequenced element:
 *
 *   an aperture element referenced ONCE in the sequence is rotated so its
 *   normal lies along that line, and its entry becomes +1;
 *   an aperture element referenced MORE THAN ONCE is not rotated, because
 *   rotating it for position 5 would break position 9, and only its entry
 *   sign is chosen from which way through it the line goes;
 *   a marker is put on the outside of the turn, which is the side a pilot
 *   actually flies.
 *
 * Touching a face by hand sets `overridden` on the sequence entry and
 * rotating an element by hand sets `yawOverridden` on the element. Either
 * flag stops the re-derivation dead for that item and the inspector says so.
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

import { KIND } from './elements.js';
import {
  elementById, kindOf, entryAnchor, elementNormal, startPadsOf, sequenceRefCount,
} from './model.js';
import { apertureFrame, cross, dot, leftOf, normalize, scale, sub, yawVector, wrapAngle } from './geometry.js';

/*
 * A flag parked on a gate stile has neighbours along the PVC, so the chain
 * through it runs along the header and the virtual square would stand at 90
 * degrees to the opening. When the pole is beside an aperture, travel is
 * that aperture's, not the chain.
 */
const BESIDE_GATE_M = 3.0;
const BESIDE_ALONG_N_M = 1.2;

export function nearbyApertureTravel(doc, el) {
  if (!el || (el.type !== 'flag' && el.type !== 'cone')) {
    return null;
  }
  let best = null;
  for (const gate of doc.elements) {
    if (kindOf(gate) !== KIND.APERTURE || gate.type === 'diveGate') {
      continue;
    }
    const dx = el.position.x - gate.position.x;
    const dy = el.position.y - gate.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist > BESIDE_GATE_M || dist < 0.15) {
      continue;
    }
    const frame = apertureFrame(gate.yaw, 0);
    const alongN = dx * frame.normal.x + dy * frame.normal.y;
    const alongW = dx * frame.widthAxis.x + dy * frame.widthAxis.y;
    const half = (gate.dims?.clearW || 1.524) / 2;
    if (Math.abs(alongN) > BESIDE_ALONG_N_M || Math.abs(alongW) < half * 0.45) {
      continue;
    }
    if (!best || dist < best.dist) {
      best = { gate, dist };
    }
  }
  if (!best) {
    return null;
  }
  const n = elementNormal(best.gate);
  const sign = sequenceEntryNear(doc, el, best.gate);
  return { x: n.x * sign, y: n.y * sign, z: n.z * sign };
}

function sequenceEntryNear(doc, marker, gate) {
  const flagAt = doc.sequence.findIndex((s) => s.elementId === marker.id);
  let best = null;
  doc.sequence.forEach((s, i) => {
    if (s.elementId !== gate.id || s.entry === 0) {
      return;
    }
    const d = flagAt < 0 ? i : Math.abs(i - flagAt);
    if (!best || d < best.d) {
      best = { entry: s.entry, d };
    }
  });
  return best ? best.entry : 1;
}

/*
 * The anchor chain the directions are read off: the start pads, then every
 * sequence entry's raw anchor, then the start pads again to close the lap.
 * Marker anchors are the marker itself and not the offset knot, because the
 * offset depends on the direction and the direction must not depend on the
 * offset.
 */
export function anchorChain(doc) {
  const start = startPadsOf(doc);
  const chain = [];
  if (start) {
    chain.push({ pos: { ...start.position }, seq: null });
  }
  for (const s of doc.sequence) {
    const pos = entryAnchor(doc, s);
    if (pos) {
      chain.push({ pos, seq: s });
    }
  }
  if (start && chain.length > 1) {
    chain.push({ pos: { ...start.position }, seq: null });
  }
  return chain;
}

/*
 * Direction of travel at each link of the chain. Interior links look one
 * step either side; the ends look at their one neighbour. A chain of length
 * one has no direction at all and reports null, which every caller treats as
 * "leave whatever is there alone".
 */
function chainDirections(chain) {
  const n = chain.length;
  const out = new Array(n).fill(null);
  if (n < 2) {
    return out;
  }
  for (let i = 0; i < n; i += 1) {
    const a = chain[Math.max(0, i - 1)].pos;
    const b = chain[Math.min(n - 1, i + 1)].pos;
    const d = sub(b, a);
    out[i] = (Math.abs(d.x) + Math.abs(d.y) + Math.abs(d.z)) > 1e-9 ? normalize(d) : null;
  }
  return out;
}

/*
 * Is the quad going UP or DOWN through this link? Returns +1, -1, or a small
 * number when it genuinely cannot tell.
 *
 * IT IS THE DEPARTURE THAT DECIDES, NOT THE CHORD ACROSS THE ELEMENT. A dive
 * gate sits 3 m above the gate before it AND 3 m above the gate after it, so
 * the chord from one neighbour to the other is level and says nothing, while
 * the obvious truth is that you leave the thing going down. Reading the
 * chord instead, which is what this did first, put the dive gate's tangent
 * pointing at the sky between two knots at the same height and left a 1.8 m
 * radius hook in the line straight afterwards.
 *
 * So: the drop to the next knot, and only if that is flat, the drop from the
 * previous one, and only if the whole neighbourhood is flat, down, because a
 * dive gate is for diving through.
 */
const LEVEL = 0.2;

function verticalSense(chain, i) {
  const here = chain[i].pos;
  if (i + 1 < chain.length) {
    const d = chain[i + 1].pos.z - here.z;
    if (Math.abs(d) > LEVEL) {
      return d;
    }
  }
  if (i > 0) {
    const d = here.z - chain[i - 1].pos.z;
    if (Math.abs(d) > LEVEL) {
      return d;
    }
  }
  return -1;
}

/*
 * Re-derive every face and pass side the user has not overridden. Mutates
 * the document in place and returns it, because it runs after every edit and
 * cloning the track on every mouse move would be the tool's slowest thing.
 */
export function applyAutoFaces(doc) {
  const chain = anchorChain(doc);
  const dirs = chainDirections(chain);

  for (let i = 0; i < chain.length; i += 1) {
    const link = chain[i];
    const seq = link.seq;
    if (!seq) {
      continue;
    }
    const el = elementById(doc, seq.elementId);
    if (!el) {
      continue;
    }
    const dir = dirs[i];
    const kind = kindOf(el);

    if (kind === KIND.APERTURE) {
      if (!dir) {
        /* No neighbours to point at. Leave the element where it is and give
         * the entry a sign so the line still has a direction to follow. */
        if (!seq.overridden && seq.entry === 0) {
          seq.entry = 1;
        }
        continue;
      }
      const single = sequenceRefCount(doc, el.id) === 1;
      const canRotate = single && !el.yawOverridden;

      if (!canRotate) {
        /* The heading is fixed, either because the user set it or because
         * the structure is flown more than once and rotating it for one pass
         * would break the other. All that is left to choose is the sign. */
        if (!seq.overridden) {
          const n = elementNormal(el);
          const along = dot(n, dir);
          if (Math.abs(along) > 1e-6) {
            seq.entry = along >= 0 ? 1 : -1;
          } else if (seq.entry === 0) {
            seq.entry = n.z >= 0 ? -1 : 1;
          }
        }
        continue;
      }

      /*
       * THE TILTED CASE IS WHY THIS IS NOT ONE LINE.
       *
       * The tilt fixes the vertical part of the normal and nothing else can
       * change it: sin(pitch) is what it is. So the sign is decided FIRST,
       * from whether the course is climbing or descending here, and the
       * heading is decided SECOND, to make the horizontal part of the
       * tangent agree with the horizontal part of the travel.
       *
       * Doing it the other way round, heading first from the ground track
       * and then the sign from the dot product, is what a naive version
       * does, and it turns every angled dive gate into a launch gate: the
       * heading lines up with the travel, the dot product comes out positive
       * because of it, and the quad is sent UP through a gate that leans
       * down the hill. Tilting a dive gate off flat has to keep it a dive
       * gate, so this rotates the structure a half turn instead.
       *
       * A vertical gate has sin(pitch) of zero, falls into the last branch,
       * and behaves exactly as it always did: entry +1, facing along the
       * course.
       */
      const sp = Math.sin(el.pitch);
      const tilted = Math.abs(sp) > 0.05;
      let entry = seq.entry;
      if (!seq.overridden) {
        if (tilted) {
          entry = (verticalSense(chain, i) * sp) >= 0 ? 1 : -1;
        } else {
          entry = 1;
        }
        seq.entry = entry;
      }
      const base = Math.atan2(dir.y, dir.x);
      el.yaw = wrapAngle((entry >= 0 ? base : base + Math.PI));
      continue;
    }

    if (kind === KIND.MARKER) {
      if (seq.overridden) {
        continue;
      }
      const inDir = i > 0 ? sub(link.pos, chain[i - 1].pos) : null;
      const outDir = i < chain.length - 1 ? sub(chain[i + 1].pos, link.pos) : null;
      if (!inDir || !outDir) {
        continue;
      }
      const turn = cross(inDir, outDir).z;
      /* A left turn puts the marker on the inside, which is the pilot's
       * left, so the quad goes past it on the marker's right. A straight run
       * has no outside and keeps whatever side it already had. */
      if (Math.abs(turn) > 1e-6) {
        seq.passSide = turn > 0 ? 'right' : 'left';
      }
    }
  }
  return doc;
}

/*
 * The direction of travel at one sequence entry, for drawing the 2D arrow
 * and for the inspector's readout. Returns null when the course is too short
 * to have a direction.
 */
export function travelDirection(doc, seqId) {
  const chain = anchorChain(doc);
  const dirs = chainDirections(chain);
  for (let i = 0; i < chain.length; i += 1) {
    if (chain[i].seq && chain[i].seq.id === seqId) {
      const seq = chain[i].seq;
      const el = elementById(doc, seq.elementId);
      if (el && kindOf(el) === KIND.APERTURE && seq.entry !== 0) {
        /* An aperture's own normal is the truth, not the chain: that is what
         * the arrow through it has to agree with. */
        const n = elementNormal(el);
        return { x: n.x * seq.entry, y: n.y * seq.entry, z: n.z * seq.entry };
      }
      if (el && kindOf(el) === KIND.MARKER) {
        const nearby = nearbyApertureTravel(doc, el);
        if (nearby) {
          return nearby;
        }
      }
      return dirs[i];
    }
  }
  return null;
}

/* One key press flips the face. Marks the entry overridden, which is what
 * stops the auto rule putting it straight back. */
export function flipFace(doc, seqId) {
  const seq = doc.sequence.find((s) => s.id === seqId);
  if (!seq) {
    return false;
  }
  const el = elementById(doc, seq.elementId);
  if (!el) {
    return false;
  }
  if (kindOf(el) === KIND.APERTURE) {
    seq.entry = seq.entry === 1 ? -1 : 1;
    seq.overridden = true;
    return true;
  }
  if (kindOf(el) === KIND.MARKER) {
    seq.passSide = seq.passSide === 'left' ? 'right' : 'left';
    seq.overridden = true;
    /* A hand turned marker reads its side off its own yaw, so flipping the
     * side has to turn the marker. Without this, Flip side on a rotated
     * flag toggled a field nothing was reading and the square sat still. */
    if (el.yawOverridden) {
      el.yaw = wrapAngle(el.yaw + Math.PI);
    }
    return true;
  }
  return false;
}

/* Hand the item back to the auto rule. */
export function clearOverride(doc, seqId) {
  const seq = doc.sequence.find((s) => s.id === seqId);
  if (!seq) {
    return false;
  }
  seq.overridden = false;
  const el = elementById(doc, seq.elementId);
  if (el) {
    el.yawOverridden = false;
  }
  applyAutoFaces(doc);
  return true;
}

/*
 * Rotating by hand is an override in its own right, because the whole point
 * of turning a gate is that it stops turning itself back.
 *
 * IT PINS THE SIGN AS WELL AS THE HEADING, and that is the whole of the fix
 * for a bug reported against WCMRC Round 5 gate 2.
 *
 * The direction a quad flies through a hole is `entry` times the aperture
 * normal, so as a gate is turned the direction follows it. It follows it
 * right up to the moment the normal passes square to the chord that
 * applyAutoFaces reads the sign from; there the derived sign flips, and the
 * direction of travel jumps a HALF TURN BACK. Turning a gate a little never
 * reaches that point. Turning it round to send the pilot the other way
 * always does. That is why it was reported as happening only sometimes, and
 * why it happened every single time the author tried to do the one thing
 * rotation is for.
 *
 * Measured on that course: gate 2 is flown three times, and a 360 degree
 * sweep in one degree steps reversed a pass without being asked to twenty
 * times. With the sign pinned it is zero, and the direction of travel tracks
 * the gate to within a thousandth of a degree the whole way round.
 *
 * IT PINS EVERY PASS, because a structure flown more than once has one frame
 * and turning the frame turns all of them together. Steering one pass of a
 * shared gate on its own is what Flip face is for, and that pins its own
 * entry already. Re-derive hands both back to the automatic rule.
 *
 * An entry that has never been decided is left alone, so a gate placed and
 * turned in one gesture still gets its first sign from the course rather
 * than arriving pinned to nothing.
 */
export function setYaw(doc, elementId, yaw) {
  const el = elementById(doc, elementId);
  if (!el) {
    return false;
  }
  el.yaw = wrapAngle(yaw);
  el.yawOverridden = true;
  for (const seq of doc.sequence) {
    if (seq.elementId === elementId && seq.entry !== 0 && seq.entry !== null) {
      seq.overridden = true;
    }
  }
  return true;
}

export function setPitch(doc, elementId, pitch) {
  const el = elementById(doc, elementId);
  if (!el) {
    return false;
  }
  /* Clamped rather than wrapped. Past a quarter turn the normal has flipped
   * to point at the ground, which is the entry sign's job to say, not the
   * tilt's, and letting the tilt wrap gives two spellings of one gate. */
  el.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
  return true;
}

/* The default yaw for a brand new element, so it lands facing the way the
 * course is already going rather than facing east. */
export function defaultYawFor(doc, position) {
  const chain = anchorChain(doc);
  if (!chain.length) {
    return 0;
  }
  const last = chain[chain.length - (chain.length > 1 && !chain[chain.length - 1].seq ? 2 : 1)];
  if (!last) {
    return 0;
  }
  const d = sub(position, last.pos);
  if (Math.abs(d.x) + Math.abs(d.y) < 1e-6) {
    return 0;
  }
  return wrapAngle(Math.atan2(d.y, d.x));
}

/* Exported for the 2D view, which draws a chevron on the side of a marker
 * the quad passes, and for path.js, which offsets the knot there. */
export function passOffsetSign(passSide) {
  return passSide === 'right' ? -1 : 1;
}

/*
 * WHICH WAY OFF THE MARKER THE PASS IS, as a unit vector in the plan.
 *
 * The owner's report: "the rotational thing in the track builder should
 * allow the gate to move around the flag completely as the user wants,
 * currently it doesn't." It did not, and the reason is worth stating
 * because it was not a bug in the handle. A marker's square was ALWAYS
 * square to the direction of travel, on one of exactly two sides, so the
 * only thing the rotation handle could reach was the flag's own mesh: the
 * pole turned, the sail swung round with it, and the green square did not
 * move a degree. There was nothing between "left" and "right".
 *
 * So the marker's OWN YAW is the offset direction once the author has
 * turned it by hand. yawOverridden is already the flag setYaw raises and
 * the flag "Re-derive" clears, and it already means exactly this
 * everywhere else: the author has decided, stop deriving. A turned flag
 * therefore puts its square wherever the handle points, all the way round,
 * and an untouched one keeps the automatic rule, which is the outside of
 * the turn and the thing an author should almost never have to set.
 *
 * IT IS PER ELEMENT, NOT PER PASS, and that is the same trade an aperture
 * makes: a structure flown twice has one frame, and turning the frame
 * turns both passes together. Steering one pass of a shared marker on its
 * own is what Flip side is for.
 *
 * `travel` is the local direction of travel, needed only for the automatic
 * case. The vector comes back in the plan, z zero, because a marker has no
 * vertical face and a z component here is what sends a Hermite between two
 * ground markers underground.
 */
export function markerPassDir(el, seq, travel) {
  if (el && el.yawOverridden) {
    const d = yawVector(el.yaw);
    return { x: d.x, y: d.y, z: 0 };
  }
  const flat = normalize({ x: travel?.x ?? 1, y: travel?.y ?? 0, z: 0 }, { x: 1, y: 0, z: 0 });
  return scale(leftOf(flat), passOffsetSign(seq?.passSide));
}

export function faceAxis(el) {
  return kindOf(el) === KIND.APERTURE ? elementNormal(el) : yawVector(el.yaw);
}
