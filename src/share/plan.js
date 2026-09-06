/*
 * plan.js: a course, drawn as a plan.
 *
 * WHY THIS IS HERE AND NOT ONLY ON THE BOARD. A course was three different
 * pictures depending on where you met it: a recorded flight clip on the
 * simulator's map screen, a blueprint plan on the public board, a blueprint
 * canvas in the track builder. Two of those agreed and the odd one out was
 * the screen where you CHOOSE which course to fly, so a pilot picked a
 * course without ever seeing its shape. The drawing is cheap and the data
 * is already there, so the simulator draws the same picture the other two do.
 *
 * PORTED, NOT REWRITTEN. The drawing code below is
 * WebFPVSimulator-LeaderBoard/public/plan.js, carried over unchanged, and
 * planFromDocument is that repository's src/validate.js. Both are GPLv3 and
 * both are ours. The pair MUST keep drawing the same picture: if a mark
 * changes shape here, change it there in the same turn, or the same course
 * looks like two courses.
 *
 * The two ends of the pipe differ in one way only. The board holds published
 * courses and ships a plan payload with its list, so it never sees a document.
 * The simulator holds the working canvas as a schema.md document and has to
 * derive the plan from it, which is what planFromDocument is for. Give
 * drawPlan a plan from either source and it cannot tell them apart.
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

const C = {
  ground: '#080d12',
  plateTop: '#17232f',
  plateBottom: '#0d161e',
  gridMinor: 'rgba(157, 179, 200, 0.09)',
  gridMajor: 'rgba(157, 179, 200, 0.19)',
  bound: 'rgba(247, 232, 205, 0.5)',
  gate: '#dbe8f3',
  dive: '#7dffb4',
  diveFill: 'rgba(125, 255, 180, 0.14)',
  marker: 'rgba(247, 232, 205, 0.62)',
  cone: '#ffd45c',
  barrier: 'rgba(255, 125, 125, 0.45)',
  barrierEdge: 'rgba(255, 154, 154, 0.85)',
  start: '#7dffb4',
  path: 'rgba(255, 212, 92, 0.28)',
  pathCore: 'rgba(255, 212, 92, 0.88)',
  number: '#101a26',
  numberBg: '#f7e8cd',
  scale: 'rgba(157, 179, 200, 0.55)',
};

/* Metres. A thumbnail fattens a 5 ft opening so it still reads on a
 * hundred metre field. Types the drawer does not know stay off the
 * plate; the flown line is what makes two courses look different. */
const GATE_W = 1.524;      /* 5 ft clear opening, the chapter standard */
const GATE_D = 0.36;       /* frame depth, enough to read as a solid */
const DIVE_W = 2.13;       /* 7 ft, flown through from above */
const BARRIER_W = 4;
const BARRIER_D = 1;
const PAD_ROW = 4.5;       /* four stands at 1.5 m spacing */

/*
 * THE SIX ABOVE ARE FALLBACKS NOW, AND A PLAN FROM EITHER PRODUCER READS
 * NONE OF THEM.
 *
 * Each one used to be the size EVERY mark of its type was drawn at,
 * whatever the document said, and that was fine for exactly as long as
 * every track was a MultiGP one. On a 5 by 6 m room a gate held at 1.524 m
 * drew a bar 30 percent of the way across the plate, where the 0.711 m gate
 * it stands for is 14 percent of it, and the start line held at 4.5 m ran
 * two thirds of the way across the room. Measured on
 * tracks/json/micro-livingroom-1.json in a board tile: the gate bar was
 * 44.9 px on a 147 px plate and is 20.9 px now.
 *
 * The document has carried the real numbers all along, dims.clearW on a
 * gate and dims.pads with dims.spacing on the start, in exactly the way it
 * carries a barrier's width and a stack's level count, both of which this
 * drawer already reads. The gate opening was simply missed. So the plan
 * payload carries it, the drawer reads it, and these six are what a plan
 * built by something with no dimensions at all falls back to.
 *
 * BOTH PRODUCERS HAVE TO EMIT IT or the pair stops drawing the same
 * picture: planFromDocument in the simulator's src/share/plan.js, and the
 * board's own copy in src/validate.js.
 *
 * DIVE_W IS THE ONE OF THE SIX THAT REAL DOCUMENTS DISAGREE WITH, and it is
 * worth writing down because it means this change is not invisible on full
 * sized tracks. 2.13 is a 7 ft dive gate, which is what MultiGP publishes,
 * but not one dive gate under tracks/ is built at 7 ft: all fourteen of
 * them, across eleven documents, carry a 1.524 m opening like every other
 * aperture on those tracks, and the plan has been drawing each of them 40
 * percent oversize. Reading the document shrinks them to the size they are.
 * Measured: on the board's track sheet, the widest a plan is drawn here,
 * the square goes from 9.35 px to 7.0 px; at every smaller size both the
 * old number and the new one sit on the 3.5 px floor below and nothing
 * moves at all. Every other mark on those eleven tracks, at four card
 * sizes, with and without the scale bar, is drawn by the identical calls
 * with the identical arguments.
 */

/*
 * THE MICRO TWINS: the sizes that are not on a mark to be read.
 *
 * A plan carries its track class, 'full' or 'micro', the same way the
 * object src/game/trackdoc.js builds for the game carries it and for the
 * same reason, that almost everything downstream of a document is a length.
 * Everything below is a length that could not be read off a mark, either
 * because the document does not hold it or because reading it would change
 * what a full sized track has always looked like.
 */

/* The marker symbol, which is a symbol rather than a measurement at both
 * ends. 0.18 m is a road cone's base radius, 7 inches, so a full sized plan
 * draws a cone life size and draws a flag at the same size even though a
 * flag's pole is 25 mm, because 25 mm on a sixty metre field is nothing.
 * The twin is the same rule at the other end: the indoor marker cone the
 * element library carries is 100 mm tall on a 60 mm base, so this is that
 * base, life size again. Left at 0.18 a cone on a 5 m room draws 360 mm
 * across, six times the cone, and a room's turn markers come out half the
 * width of its gates. */
const MARKER_R = 0.18;
const MICRO_MARKER_R = 0.030;

/* The gate fallback, for the never reached case above. A RaceGOW gate is
 * 28 inches of clear opening, 0.711 m: the maximum the rules allow, what a
 * 3/4 inch pipe cut at 26.5 to 27.25 inches assembles to, and what the shop
 * that sells the parts cuts them at. The horizontal gate is the same square
 * laid flat, which is why one number serves here where the full sized pair
 * needs two. */
const MICRO_GATE_W = 0.711;

/* The start line fallback. RaceGOW has no heats: every pilot flies alone at
 * home and the whole series is an asynchronous time trial, so a micro start
 * is ONE stand and the line is as long as that stand, 100 mm. Four stands
 * at 1.5 m spacing is a MultiGP grid and nothing else. */
const MICRO_PAD_ROW = 0.10;

/* The barrier fallback. A living room's furniture rather than a crowd
 * barrier: a sofa is about 1.8 by 0.85 m and is the commonest obstacle on a
 * RaceGOW track by a wide margin. Kept beside the full sized pair so that a
 * plan with no dimensions on the mark draws something the right size for
 * its class rather than a four metre wall across a five metre room. */
const MICRO_BARRIER_W = 1.8;
const MICRO_BARRIER_D = 0.85;

/* The room a micro plan falls back to when it carries no field at all, the
 * twin of the 60 by 40 in fit(). RaceGOW's own envelope is 1.42 by 2.13 m
 * at the 28 inch gate everyone builds, and the rules ask for "additional
 * space around the outside of that to fly the tracks optimally"; 5 by 6 m
 * is a two car garage or a large living room, which is where these are
 * actually flown. Derived in src/trackbuilder/racegow.js, copied here
 * because a drawer shared with the board cannot import the builder. */
const MICRO_FIELD_W = 10;
const MICRO_FIELD_D = 12;

/*
 * A MICRO PLAN IS DRAWN ON THE TRACK, NOT ON THE ROOM, and this is the
 * window it uses.
 *
 * The two classes put their track in the room differently and it is not a
 * matter of taste. A MultiGP course uses the whole field: the 2022 AU
 * Nationals layout spans 6 to 122 m of a 128 m field, so fitting the field
 * fits the track. A RaceGOW track is 1.42 by 2.13 m in the MIDDLE of a
 * five by six metre room, with a metre and a half of run off on every side
 * that the rules ask for and nobody flies through. Fitting the room drew the
 * demo track at 15 percent of the width of its own thumbnail: honest, and
 * useless, because a tile a reader cannot tell from the next one is not
 * doing the job a tile is for.
 *
 * So a micro plan fits the marks plus MICRO_MARGIN of floor, never smaller
 * than the envelope, never larger than the room, and never off the edge of
 * it. The scale bar and the size chip still say how big the thing is.
 *
 * 0.45 m of margin is a gate opening and a bit: enough floor that the
 * outermost gate is not against the frame, less than a leg, so the drawing
 * does not fill up with room.
 */
const MICRO_MARGIN = 0.45;
const MICRO_MIN_W = 1.42;
const MICRO_MIN_D = 2.13;

/* Where the drawn marks and the flown line actually are, or null when there
 * is nothing to measure. */
function extent(plan) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  const eat = (p) => {
    const x = Number(p && p.x);
    const y = Number(p && p.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    if (x < x0) { x0 = x; }
    if (y < y0) { y0 = y; }
    if (x > x1) { x1 = x; }
    if (y > y1) { y1 = y; }
  };
  for (const m of (plan && plan.marks) || []) {
    eat(m);
  }
  for (const p of (plan && plan.path) || []) {
    eat(p);
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

/*
 * Grow a span to at least `min`, about its own centre, then slide it back
 * inside [0, room] without changing its length. Written once because the
 * two axes want exactly the same thing and getting one of them subtly
 * different is how a drawing ends up off centre in one direction only.
 */
function window1d(lo, hi, min, room) {
  let a = lo;
  let b = hi;
  if (b - a < min) {
    const mid = (a + b) / 2;
    a = mid - min / 2;
    b = mid + min / 2;
  }
  if (b - a >= room) {
    return { a: 0, len: room };
  }
  if (a < 0) {
    b -= a;
    a = 0;
  }
  if (b > room) {
    a -= b - room;
    b = room;
  }
  return { a: Math.max(0, a), len: b - a };
}

/* 'full' unless the plan says otherwise, so every plan already stored, and
 * every plan from a producer that has not learned the field yet, stays the
 * MultiGP field it has always been. Same default trackClassOf applies in
 * the builder and courseFromDocument applies in the game. */
function isMicro(plan) {
  return Boolean(plan) && plan.trackClass === 'micro';
}

const LEVELS = {
  gate: 1,
  flaggedGate: 1,
  doubleStack: 2,
  flaggedDoubleStack: 2,
  ladder: 3,
  tower: 2,
};

/*
 * The ladders the grid and the scale bar choose a step from, and the three
 * small ones at the front of each are new.
 *
 * pick() below walks the list and takes the FIRST step that is at least
 * minPx apart on screen, so a ladder starting at 1 m cannot draw a finer
 * grid than one metre however close in the drawing is. On a 5 by 6 m room
 * that put a grid five squares across on the whole field, and the bar,
 * whose ladder started at 5 m, either drew a rule as long as the room or
 * was dropped by the "longer than 42 percent of the card" test below and
 * drew nothing, so a room's plan carried no scale at all.
 *
 * THIS IS NOT A MICRO TWIN, it is a longer ladder, and every track gets it.
 * A step is only reached once it is at least 9 px (grid) or 44 px (bar) on
 * screen, so 0.5 m of grid needs 18 px per metre and a 2 m bar needs 22. A
 * 60 by 40 field is drawn between 3.4 and 8.1 px per metre everywhere in
 * this project, the widest being the board's track sheet, so on one of
 * those none of the six new steps can be reached and the MultiGP picture is
 * unchanged. A full sized track on a SMALL authored field can reach them:
 * 20 by 14 m in that same track sheet is 23 px per metre and now draws a
 * 0.5 m grid and a 2 m bar where it drew 1 m and 5 m. That is the chooser's
 * own rule working further down rather than a new rule, and it is the right
 * answer, but it is a change, and it is written here because "a big field
 * can never reach the small steps" is the obvious claim and it is false.
 */
const GRID_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];
const BAR_STEPS = [0.5, 1, 2, 5, 10, 20, 25, 50, 100];

function pick(steps, minPx, perMetre) {
  for (const step of steps) {
    if (step * perMetre >= minPx) {
      return step;
    }
  }
  return steps[steps.length - 1];
}

/* A course reads as a shape long before anyone counts its gates, so the
 * fit keeps the field's own proportions and centres it in whatever box
 * the card gives it. */
function fit(plan, w, h, pad) {
  /* A plan with no field of its own still has to be drawn on something, and
   * which something depends on the class: a MultiGP field is 60 by 40 and a
   * RaceGOW room is 5 by 6. Falling through to 60 by 40 on a micro plan
   * would draw a room at a twelfth of its own size, which is the same error
   * the gates had. Neither producer emits a plan without a field, so this
   * is the last line rather than the usual one. */
  const small = isMicro(plan);
  const roomW = Math.max(1, Number(plan && plan.width) || (small ? MICRO_FIELD_W : 60));
  const roomD = Math.max(1, Number(plan && plan.depth) || (small ? MICRO_FIELD_D : 40));
  /* The world coordinate at the plate's left and bottom edges. Zero on a
   * field, because the whole field is the picture. See MICRO_MARGIN. */
  let x0 = 0;
  let y0 = 0;
  let fw = roomW;
  let fd = roomD;
  const bounds = small ? extent(plan) : null;
  if (bounds) {
    const across = window1d(bounds.x0 - MICRO_MARGIN, bounds.x1 + MICRO_MARGIN, MICRO_MIN_W, roomW);
    const along = window1d(bounds.y0 - MICRO_MARGIN, bounds.y1 + MICRO_MARGIN, MICRO_MIN_D, roomD);
    x0 = across.a;
    y0 = along.a;
    fw = across.len;
    fd = along.len;
  }
  const s = Math.min((w - pad * 2) / fw, (h - pad * 2) / fd);
  return {
    s,
    fw,
    fd,
    x0,
    y0,
    ox: (w - fw * s) / 2,
    oy: (h - fd * s) / 2,
  };
}

function plate(ctx, w, h, box) {
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, box.oy, 0, box.oy + box.fd * box.s);
  g.addColorStop(0, C.plateTop);
  g.addColorStop(1, C.plateBottom);
  ctx.fillStyle = g;
  ctx.fillRect(box.ox, box.oy, box.fw * box.s, box.fd * box.s);
}

function grid(ctx, box) {
  const minor = pick(GRID_STEPS, 9, box.s);
  const major = minor * 5;
  const right = box.ox + box.fw * box.s;
  const bottom = box.oy + box.fd * box.s;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.ox, box.oy, box.fw * box.s, box.fd * box.s);
  ctx.clip();
  for (let pass = 0; pass < 2; pass += 1) {
    const step = pass === 0 ? minor : major;
    ctx.strokeStyle = pass === 0 ? C.gridMinor : C.gridMajor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= box.fw + 0.001; x += step) {
      const px = Math.round(box.ox + x * box.s) + 0.5;
      ctx.moveTo(px, box.oy);
      ctx.lineTo(px, bottom);
    }
    for (let y = 0; y <= box.fd + 0.001; y += step) {
      const py = Math.round(bottom - y * box.s) + 0.5;
      ctx.moveTo(box.ox, py);
      ctx.lineTo(right, py);
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = C.bound;
  ctx.lineWidth = 1;
  ctx.strokeRect(
    Math.round(box.ox) + 0.5,
    Math.round(box.oy) + 0.5,
    Math.round(box.fw * box.s) - 1,
    Math.round(box.fd * box.s) - 1,
  );
}

/*
 * A gate in plan is a bar across the direction of travel. It carries a
 * floor size because a championship field is over a hundred metres wide
 * and a true to scale 1.5 m opening would be two pixels of nothing. A
 * stack gets a deeper bar and, where there is room, one arc per level, so
 * a ladder is not a gate even in a thumbnail.
 */
/* The clear opening a mark is drawn at: the document's own number when the
 * plan carries one, which is every plan either producer builds, and the
 * class's standard gate when it does not. */
function openingOf(mark, fallback) {
  const w = Number(mark.clearW);
  return Number.isFinite(w) && w > 0 ? w : fallback;
}

function aperture(ctx, s, levels, openW) {
  const half = Math.max(3.2, (openW * 0.5) * s);
  /*
   * THE FRAME DEPTH IS A PROPORTION OF THE OPENING AND HAS TO BE.
   *
   * GATE_D is not a frame. A MultiGP gate is built out of 1 inch tube and a
   * RaceGOW one out of 26.7 mm pipe, and both are invisible at any scale a
   * plan is ever drawn at, so 0.36 m is a drawing thickness rather than a
   * measurement: it is 0.236 of a 5 ft opening, and that is the aspect that
   * makes a bar read as a bar rather than as a post or a blob. Held at 0.36
   * on a 0.711 m opening it is half the opening, so a RaceGOW gate draws as
   * a square block and a room of them reads as a scatter of dice. Written
   * as GATE_D times the ratio, not as a ratio of its own, so that a 5 ft
   * opening gives back exactly 0.36: the ratio is exactly 1 there and the
   * multiply is exact.
   */
  const depth = Math.max(1.8, GATE_D * (openW / GATE_W) * s) * (levels > 1 ? 1.8 : 1);
  ctx.beginPath();
  ctx.rect(-depth * 0.5, -half, depth, half * 2);
  ctx.fillStyle = C.gate;
  ctx.fill();
  if (levels > 1 && half > 8) {
    ctx.strokeStyle = C.gate;
    ctx.lineWidth = 1;
    for (let i = 1; i < levels; i += 1) {
      /* The arcs annotate the bar and have to sit inside it, so their
       * spacing follows the opening exactly the way the depth does. */
      const r = depth * 0.5 + i * Math.max(2.5, s * 0.22 * (openW / GATE_W));
      ctx.beginPath();
      ctx.arc(0, 0, r, -0.9, 0.9);
      ctx.stroke();
    }
  }
}

function diveGate(ctx, s, openW) {
  const half = Math.max(3.5, (openW * 0.5) * s);
  ctx.beginPath();
  ctx.rect(-half, -half, half * 2, half * 2);
  ctx.fillStyle = C.diveFill;
  ctx.fill();
  ctx.strokeStyle = C.dive;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(1, half * 0.28), 0, Math.PI * 2);
  ctx.fillStyle = C.dive;
  ctx.fill();
}

/* Local +x is the barrier's heading, and its long side runs along it. The
 * axes used to be the other way round here, which stood every barrier on the
 * board a quarter turn out of the one the builder and the simulator draw:
 * scene.js lays the collider along (cos yaw, -sin yaw) and view2d.js gives
 * boxCorners the width as its along-yaw argument. */
function barrier(ctx, s, dims, small) {
  const w = Math.max(4, (dims && dims.w > 0 ? dims.w : (small ? MICRO_BARRIER_W : BARRIER_W)) * s);
  const h = Math.max(2, (dims && dims.d > 0 ? dims.d : (small ? MICRO_BARRIER_D : BARRIER_D)) * s);
  ctx.beginPath();
  ctx.rect(-w * 0.5, -h * 0.5, w, h);
  ctx.fillStyle = C.barrier;
  ctx.fill();
  ctx.strokeStyle = C.barrierEdge;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function marker(ctx, s, cone, small) {
  const r = Math.max(1.6, s * (small ? MICRO_MARKER_R : MARKER_R));
  ctx.beginPath();
  if (cone) {
    ctx.moveTo(0, -r * 1.3);
    ctx.lineTo(r * 1.15, r * 0.9);
    ctx.lineTo(-r * 1.15, r * 0.9);
    ctx.closePath();
  } else {
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  }
  ctx.fillStyle = cone ? C.cone : C.marker;
  ctx.fill();
}

/*
 * How long the start line is, in metres: the span from the first stand to
 * the last, never shorter than one stand, because a lone stand is still a
 * mark on the ground. Read off the document rather than assumed, for the
 * same reason a gate's opening is. The constants are what a plan with no
 * dimensions on the mark falls back to.
 */
function padRow(mark, small) {
  const pads = Number(mark.pads);
  const spacing = Number(mark.spacing);
  const size = Number(mark.padSize);
  if (Number.isFinite(pads) && pads > 0 && Number.isFinite(spacing) && spacing >= 0) {
    return Math.max((pads - 1) * spacing, Number.isFinite(size) && size > 0 ? size : 0);
  }
  return small ? MICRO_PAD_ROW : PAD_ROW;
}

/*
 * The start line, and which way the pack faces. Local +x is the launch
 * heading, so the chevron points down the first straight.
 *
 * THE LINE IS AS LONG AS THE ROW OF STANDS. Four MultiGP stands at 1.5 m
 * spacing span 4.5 m, which is where PAD_ROW came from; a RaceGOW start is
 * ONE stand, because there are no heats and every pilot flies alone at
 * home, so its line is the stand itself. Held at 4.5 m the start line on a
 * RaceGOW room ran two thirds of the way across it with a metre and a half
 * of chevron on the end, which is most of a drawing spent on the one mark
 * nobody flies through.
 *
 * The chevron follows the line rather than the field, at the proportion the
 * full sized pair already encodes: 1.9 m of tip and 1.2 m of wing on a
 * 4.5 m line. Written as a ratio to PAD_ROW so a MultiGP grid gives back
 * exactly 1.9 and 1.2.
 */
function startPads(ctx, s, row) {
  const half = Math.max(5, (row * 0.5) * s);
  ctx.strokeStyle = C.start;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -half);
  ctx.lineTo(0, half);
  ctx.stroke();
  const k = row / PAD_ROW;
  const tip = Math.max(6, s * 1.9 * k);
  const wing = Math.max(4, s * 1.2 * k);
  ctx.beginPath();
  ctx.moveTo(tip, 0);
  ctx.lineTo(tip - wing, -wing * 0.78);
  ctx.lineTo(tip - wing, wing * 0.78);
  ctx.closePath();
  ctx.fillStyle = C.start;
  ctx.fill();
}

function toScreen(box, x, y) {
  return {
    /* x0 and y0 are the world coordinate at the plate's left and bottom, so
     * a plan drawn on a window rather than on the whole field lands in the
     * right place. Zero on every field plan, which is why this reads as the
     * old two lines there. */
    x: box.ox + ((Number(x) || 0) - (box.x0 || 0)) * box.s,
    y: box.oy + (box.fd - ((Number(y) || 0) - (box.y0 || 0))) * box.s,
  };
}

function strokePoly(ctx, pts) {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
}

/*
 * The flown line, in flying order. Straight segments between the knots
 * the sequence already named: enough to read the lap as a shape, which
 * a scatter of gates never was. Consecutive knots that share a point
 * (a stack flown twice) are already collapsed in the payload. A circuit
 * closes back to the first gate when the last knot is not already there.
 */
function raceLine(ctx, box, path) {
  if (!path || path.length < 2) {
    return;
  }
  const pts = path.map((p) => toScreen(box, p.x, p.y));
  const a = pts[0];
  const b = pts[pts.length - 1];
  if (Math.hypot(a.x - b.x, a.y - b.y) > Math.max(8, box.s * 2)) {
    pts.push(a);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.ox, box.oy, box.fw * box.s, box.fd * box.s);
  ctx.clip();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const core = Math.max(1.4, Math.min(2.8, box.s * 0.38));
  ctx.strokeStyle = C.path;
  ctx.lineWidth = core + 2.4;
  strokePoly(ctx, pts);
  ctx.strokeStyle = C.pathCore;
  ctx.lineWidth = core;
  strokePoly(ctx, pts);
  ctx.restore();
}

function gateNumbers(ctx, box, numbers) {
  if (!numbers || !numbers.length) {
    return;
  }
  const r = Math.max(6, Math.min(9, box.s * 0.55));
  ctx.font = `600 ${Math.round(r * 1.15)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const mark of numbers) {
    const p = toScreen(box, mark.x, mark.y);
    /* Stacked upward when one structure is flown more than once, so a
     * ladder taken twice shows both of its numbers instead of hiding one
     * badge exactly behind the other. The builder stacks the same way. */
    const y = p.y - (Number(mark.stack) || 0) * (r * 2.1);
    ctx.beginPath();
    ctx.arc(p.x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = C.numberBg;
    ctx.fill();
    ctx.fillStyle = C.number;
    ctx.fillText(String(mark.n), p.x, y + 0.5);
  }
}

function scaleBar(ctx, box, w, h) {
  const metres = pick(BAR_STEPS, 44, box.s);
  const len = metres * box.s;
  if (len > w * 0.42) {
    return;
  }
  const x = w - 14 - len;
  const y = h - 16;
  ctx.strokeStyle = C.scale;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y - 3.5);
  ctx.lineTo(x + 0.5, y + 0.5);
  ctx.lineTo(x + len + 0.5, y + 0.5);
  ctx.lineTo(x + len + 0.5, y - 3.5);
  ctx.stroke();
  ctx.fillStyle = C.scale;
  ctx.font = '11px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${metres} m`, x + len, y - 6);
}

/* Obstacles first, then markers, then the gates and the start, so the
 * things a pilot actually flies through are never underneath a flag. */
/*
 * A horizontal pole is a bar on two legs and draws as the barrier it is; a
 * pole is a marker and draws as the dot RaceGOW's own diagrams use. Both
 * used to fall through to the aperture case and draw as gates, so a board
 * tile showed a room with two more gates than the track had.
 */
function isBarrier(type) {
  return type === 'barrier' || type === 'horizontalPole';
}

function isMarker(type) {
  return type === 'flag' || type === 'cone' || type === 'pole';
}

function order(type) {
  if (isBarrier(type)) {
    return 0;
  }
  if (isMarker(type)) {
    return 1;
  }
  if (type === 'startPads') {
    return 3;
  }
  return 2;
}

export function drawPlan(canvas, plan, options = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const w = Math.round(rect.width || canvas.clientWidth || 0);
  const h = Math.round(rect.height || canvas.clientHeight || 0);
  if (w < 8 || h < 8) {
    return false;
  }
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return false;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const box = fit(plan, w, h, options.pad == null ? Math.max(6, w * 0.022) : options.pad);
  plate(ctx, w, h, box);
  grid(ctx, box);
  if (!plan) {
    return true;
  }
  raceLine(ctx, box, plan.path);
  /* Read once. Only the three sizes that are not on a mark need it: the
   * marker symbol, and the two fallbacks nothing reaches. */
  const small = isMicro(plan);
  const marks = [...(plan.marks || [])].sort((a, b) => order(a.type) - order(b.type));
  for (const mark of marks) {
    const type = String(mark.type || '');
    /* Waypoints used to fall through to aperture() and stand in as
     * gates. Anything we do not have a drawing for stays off the plate. */
    if (!type || type === 'waypoint' || type === 'label') {
      continue;
    }
    const known = type === 'startPads' || type === 'barrier' || type === 'flag'
      || type === 'cone' || type === 'diveGate' || LEVELS[type];
    if (!known) {
      continue;
    }
    const p = toScreen(box, mark.x, mark.y);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-(Number(mark.yaw) || 0));
    if ((type === 'flag' || type === 'cone') && mark.seq === false) {
      ctx.globalAlpha = 0.38;
    }
    if (type === 'startPads') {
      startPads(ctx, box.s, padRow(mark, small));
    } else if (isBarrier(type)) {
      barrier(ctx, box.s, mark, small);
    } else if (isMarker(type)) {
      marker(ctx, box.s, type === 'cone', small);
    } else if (type === 'diveGate') {
      diveGate(ctx, box.s, openingOf(mark, small ? MICRO_GATE_W : DIVE_W));
    } else {
      /* The authored level count and the authored opening when the plan
       * carries them, the type default and the class's standard gate when
       * it is an older stored plan that does not. */
      aperture(ctx, box.s, mark.levels > 0 ? mark.levels : LEVELS[type],
        openingOf(mark, small ? MICRO_GATE_W : GATE_W));
    }
    ctx.restore();
  }
  if (options.scaleBar) {
    gateNumbers(ctx, box, plan.numbers);
    scaleBar(ctx, box, w, h);
  }
  return true;
}

/*
 * A schema.md document, reduced to the plan the drawer above wants.
 *
 * MIRRORS planFromDocument in WebFPVSimulator-LeaderBoard/src/validate.js.
 * The board runs its copy at publish time and stores the result; this one
 * runs on the working canvas, which has never been published and so has no
 * stored plan. They must produce the same keys, or a course would change
 * shape the moment it went on the board.
 *
 * THE TWO ARE OUT OF STEP BY FIVE KEYS AS OF THIS TURN, and deliberately.
 * This copy emits trackClass, clearW, pads, spacing and padSize; the
 * board's does not emit any of them yet. Nothing is drawn wrongly by that,
 * because the drawer falls back to the full sized constants for exactly
 * these fields and every track the board holds is a full sized one: it
 * refuses anything but schemaVersion 1 and 2, and a micro track is
 * schemaVersion 3, so no room can reach it. The board's own store rebuilds
 * a plan from the document on every list rather than reading the stored
 * one, so the day validate.js learns schemaVersion 3 it can emit these five
 * in the same commit and every track already published picks them up with
 * no migration. That is the change to make there, and it is the same five
 * lines as below.
 */
const PLAN_SKIP = new Set(['label', 'waypoint']);
const PLAN_APERTURE = new Set([
  'gate', 'flaggedGate', 'doubleStack', 'flaggedDoubleStack', 'ladder', 'tower', 'diveGate',
]);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function planFromDocument(doc) {
  if (!isObject(doc)) {
    return null;
  }
  const field = isObject(doc.field) ? doc.field : {};
  /* Anything that is not the word 'micro' is the field this builder has
   * always drawn, which is how trackClassOf defaults it in the builder and
   * courseFromDocument defaults it in the game. A document written before
   * there were two classes has no such key and is a MultiGP field, which is
   * what it was. */
  const small = doc.trackClass === 'micro';
  const byId = new Map();
  const sequenced = new Set();
  for (const step of doc.sequence || []) {
    if (isObject(step) && typeof step.elementId === 'string' && step.elementId) {
      sequenced.add(step.elementId);
    }
  }
  const marks = [];
  for (const item of doc.elements || []) {
    if (!isObject(item) || !isObject(item.position)) {
      continue;
    }
    if (typeof item.id === 'string' && item.id) {
      byId.set(item.id, item);
    }
    const type = String(item.type || 'gate');
    if (PLAN_SKIP.has(type)) {
      continue;
    }
    const levels = Number(item.dims && item.dims.levels);
    const barrierW = Number(item.dims && item.dims.width);
    const barrierD = Number(item.dims && item.dims.depth);
    /*
     * THE GATE'S OWN OPENING, which is the fourth number of the family the
     * three above belong to and the one that was missing. A gate is 1.524 m
     * on a MultiGP field and 0.711 on a RaceGOW one, and an author can type
     * any width into either, so a drawer that assumes one draws every track
     * that is not that one wrongly. On a room it drew every gate at a third
     * of the width of the room.
     */
    const clearW = Number(item.dims && item.dims.clearW);
    /* And the start line's length, which is a row rather than one number:
     * how many stands, how far apart, and how big one is. Four at 1.5 m is
     * a MultiGP grid; a RaceGOW start is a single 100 mm stand, because
     * there are no heats. */
    const pads = Number(item.dims && item.dims.pads);
    const spacing = Number(item.dims && item.dims.spacing);
    const padSize = Number(item.dims && item.dims.padSize);
    marks.push({
      type,
      x: Number(item.position.x) || 0,
      y: Number(item.position.y) || 0,
      yaw: Number(item.yaw) || 0,
      seq: sequenced.has(item.id),
      levels: Number.isFinite(levels) && levels > 0 ? levels : undefined,
      w: Number.isFinite(barrierW) && barrierW > 0 ? barrierW : undefined,
      d: Number.isFinite(barrierD) && barrierD > 0 ? barrierD : undefined,
      clearW: Number.isFinite(clearW) && clearW > 0 ? clearW : undefined,
      pads: Number.isFinite(pads) && pads > 0 ? pads : undefined,
      spacing: Number.isFinite(spacing) && spacing >= 0 ? spacing : undefined,
      padSize: Number.isFinite(padSize) && padSize > 0 ? padSize : undefined,
    });
  }
  const path = [];
  const numbers = [];
  const stacked = new Map();
  let n = 0;
  for (const step of doc.sequence || []) {
    if (!isObject(step)) {
      continue;
    }
    const item = byId.get(step.elementId);
    if (!item || !isObject(item.position)) {
      continue;
    }
    const x = Number(item.position.x) || 0;
    const y = Number(item.position.y) || 0;
    const last = path[path.length - 1];
    if (!last || last.x !== x || last.y !== y) {
      path.push({ x, y });
    }
    const type = String(item.type || '');
    if (PLAN_APERTURE.has(type) && item.id) {
      const spot = `${x},${y}`;
      const stack = stacked.get(spot) || 0;
      stacked.set(spot, stack + 1);
      n += 1;
      numbers.push({ n, x, y, stack });
    }
  }
  return {
    /* The class travels with the plan for the same reason it travels with
     * the course: the drawer has three sizes it cannot read off a mark, and
     * without this it would have to guess them from the field. */
    trackClass: small ? 'micro' : 'full',
    width: Number(field.width) || (small ? MICRO_FIELD_W : 60),
    depth: Number(field.depth) || (small ? MICRO_FIELD_D : 40),
    marks,
    path,
    numbers,
  };
}

/*
 * A canvas that knows its own plan. The menu is rebuilt on every cursor
 * move, so a card holds the canvas and the plan together and repaints on
 * resize rather than being rebuilt from the document each time.
 */
export function planCanvas(plan, label) {
  const canvas = document.createElement('canvas');
  canvas.className = 'plan';
  canvas.planData = plan || null;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label || 'Track plan');
  return canvas;
}

export function paintPlans(root, options = {}) {
  if (!root) {
    return;
  }
  for (const canvas of root.querySelectorAll('canvas.plan')) {
    drawPlan(canvas, canvas.planData, options);
  }
}

/* "60 by 40 m", the one fact about a field that a plan cannot show, because
 * the drawing is fitted to the box rather than to a scale. */
export function fieldSize(plan) {
  const w = Math.round(Number(plan && plan.width) || 0);
  const d = Math.round(Number(plan && plan.depth) || 0);
  return w && d ? `${w} by ${d} m` : '';
}
