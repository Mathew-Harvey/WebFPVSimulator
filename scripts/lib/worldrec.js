/*
 * worldrec.js: every step a flight takes, recorded at the physics module's
 * own boundary.
 *
 * WHY AT THE BOUNDARY. The world golden (scripts/world-golden.js) pins the
 * flights scripts/world-check.js flies, and world-check is not changed to do
 * it: its scenarios are the scenarios, and a copy of them would drift. So
 * the module itself is wrapped as it is instantiated. After every sim_step
 * the wrapper reads the state block, and it keeps the contact report the
 * host reads after the step; a host that never reads the report (world-check's
 * train) has it read for it before the next step. Nothing the host does is
 * changed by being watched: sim_state and sim_ground_contacts only read, and
 * the report is only read here when the host has not read it.
 *
 * The same wrapper is where the golden's self test plants its faults, on the
 * way into the module: every box moved by a nanometre, every restitution one
 * bit higher, every mover shifted, every capsule radius changed. A fault
 * planted there reaches world-check's flights and the golden's own in the
 * same way, because both go through sim_world_box and friends.
 *
 * ONE RECORD PER STEP, 248 bytes: the state block (20 doubles, sim_abi.h)
 * then the world report (11 doubles), as the module wrote them. That is
 * exactly what scripts/world-check.js hashes in its own fly(), so a flight's
 * SHA-256 here is world-check's trace hash for the same flight. Each record
 * also gets a 32 bit digest of its own, integer arithmetic only, so two
 * traces can be compared step by step and the first step that differs
 * named, in Node or in a browser, with the same bits.
 *
 * Environment neutral: no Node import, runs unchanged in a page. A host that
 * wants a SHA-256 of the whole trace hands one in (Node's crypto).
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

/* sim_abi.h: SIM_STATE_DOUBLES and SIM_WORLD_REPORT_DOUBLES. */
export const STATE_DOUBLES = 20;
export const REPORT_DOUBLES = 11;
export const RECORD_BYTES = (STATE_DOUBLES + REPORT_DOUBLES) * 8;

/* The names of the record's 31 words, for saying which one moved. */
export const RECORD_FIELDS = [
  't', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'qw', 'qx', 'qy', 'qz', 'p', 'q', 'r',
  'rpm0', 'rpm1', 'rpm2', 'rpm3', 'volts', 'amps',
  'rep.steps', 'rep.closing', 'rep.dv', 'rep.shape', 'rep.nx', 'rep.ny', 'rep.nz',
  'rep.props', 'rep.frame', 'rep.depth', 'rep.support',
];

/*
 * The faults the self test plants, each far below anything a pilot or a
 * map could notice. `d` is the nanometre every length is moved by.
 */
export const FAULTS = {
  box: 'every static box moved 1e-9 m along x, y and z',
  restitution: 'every static shape\'s restitution one bit higher',
  mover: 'every mover moved 1e-9 m along x, y and z',
  capsule: 'every capsule radius 1e-9 m larger',
};
const NUDGE = 1e-9;

const f64 = new Float64Array(1);
const u64 = new BigUint64Array(f64.buffer);

/* The next double above a positive one: one bit in the last place. */
export function nextUp(v) {
  f64[0] = v;
  u64[0] += 1n;
  return f64[0];
}

/*
 * A 32 bit digest of one record: MurmurHash3's x86_32 body and finaliser
 * over its 62 little endian words. Math.imul and shifts, so the same bits in
 * every engine. Not a cryptographic hash and not used as one: the trace's
 * SHA-256 decides equality, and this only says where two traces part.
 */
export function digestRecord(dv) {
  let h = 0x9747b28c;
  for (let i = 0; i < RECORD_BYTES; i += 4) {
    let k = dv.getUint32(i, true);
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  h ^= RECORD_BYTES;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/*
 * What one flight did, step by step. Built by the wrapper below; a host
 * never makes one.
 */
class Flight {
  constructor(ex, session) {
    this.ex = ex;
    this.label = session.label;
    this.index = session.flights.length;
    this.steps = 0;
    this.digests = new Uint32Array(4096);
    this.record = new Uint8Array(RECORD_BYTES);
    this.view = new DataView(this.record.buffer);
    this.pending = false;
    this.tookIt = false;
    this.hash = session.hash ? session.hash() : null;
    this.inputs = session.hash ? session.hash() : null;
    this.keep = session.keep ? [] : null;
    this.shapeType = [];
    this.buf = 0;
    this.error = null;
    this.contacts = 0;
    this.s = {
      steps: 0, contactSteps: 0, boxSteps: 0, capsuleSteps: 0, moverSteps: 0,
      supportSteps: 0, supportContactSteps: 0, propSteps: 0, frameSteps: 0, firstContact: -1,
      maxClosing: 0, deepest: 0, boxes: 0, capsules: 0, movers: 0, end: null,
    };
    this.scratch = new Float64Array(9);
  }

  /* The wrapper's own scratch in the module's heap: 20 doubles for the
   * state, 11 for a report it reads itself. Taken at the first step, after
   * the host has made its own allocations, and never freed: an instance
   * lives for one flight. */
  ptr() {
    if (!this.buf) {
      this.buf = this.ex.malloc(RECORD_BYTES);
      if (!this.buf) {
        throw new Error('worldrec: malloc failed');
      }
    }
    return this.buf;
  }

  input(kind, args) {
    if (!this.inputs) {
      return;
    }
    const b = this.scratch;
    b[0] = kind;
    this.inputs.update(new Uint8Array(b.buffer, 0, 8));
    for (const v of args) {
      b[0] = v;
      this.inputs.update(new Uint8Array(b.buffer, 0, 8));
    }
  }

  shape(kind, args, index, type) {
    this.input(kind, args);
    if (index >= 0) {
      this.shapeType[index] = type;
      if (type === 1) {
        this.s.boxes += 1;
      } else {
        this.s.capsules += 1;
      }
    }
  }

  mover(args) {
    this.input(5, args);
    if (args[4] >= args[1]) {
      this.s.movers += 1;
    }
  }

  beforeStep() {
    if (this.pending) {
      /* The host did not read the report after the last step. */
      const p = this.ptr() + STATE_DOUBLES * 8;
      this.ex.sim_world_report(p);
      this.take(p);
      this.tookIt = true;
    }
  }

  afterStep(n) {
    if (n !== 1) {
      this.error = `sim_step(${n}): the recorder sees one step at a time`;
      return;
    }
    const p = this.ptr();
    this.ex.sim_state(p);
    this.record.set(new Uint8Array(this.ex.memory.buffer, p, STATE_DOUBLES * 8), 0);
    this.contacts = this.ex.sim_ground_contacts();
    this.pending = true;
  }

  reportRead(p) {
    if (this.pending) {
      this.take(p);
      this.tookIt = false;
      return;
    }
    if (this.tookIt) {
      /* A host that reads the report less often than every step found it
       * already taken, and a flight must never change by being watched. A
       * second read in the same step is harmless: it reads zeros either way. */
      this.error = this.error || 'the host read the world report after the recorder had taken it, so it reads less often than every step and watching it changed what it saw';
    }
  }

  take(p) {
    this.record.set(new Uint8Array(this.ex.memory.buffer, p, REPORT_DOUBLES * 8), STATE_DOUBLES * 8);
    this.pending = false;
    const k = this.steps;
    if (k >= this.digests.length) {
      const grown = new Uint32Array(this.digests.length * 2);
      grown.set(this.digests);
      this.digests = grown;
    }
    this.digests[k] = digestRecord(this.view);
    if (this.hash) {
      this.hash.update(this.record);
    }
    if (this.keep) {
      this.keep.push(this.record.slice());
    }
    this.steps = k + 1;
    this.summarise(k);
  }

  summarise(k) {
    const v = this.view;
    const at = (i) => v.getFloat64(i * 8, true);
    const s = this.s;
    s.steps = this.steps;
    const r0 = at(STATE_DOUBLES);
    const shape = at(STATE_DOUBLES + 3);
    const dv = at(STATE_DOUBLES + 2);
    const support = at(STATE_DOUBLES + 10);
    if (r0 > 0) {
      s.contactSteps += 1;
      if (s.firstContact < 0) {
        s.firstContact = k + 1;
      }
    }
    if (dv > 0 && shape >= 0) {
      if (this.shapeType[shape] === 2) {
        s.capsuleSteps += 1;
      } else {
        s.boxSteps += 1;
      }
    } else if (dv > 0 && shape <= -2) {
      s.moverSteps += 1;
    }
    if (support >= 0) {
      s.supportSteps += 1;
      if (this.contacts > 0) {
        s.supportContactSteps += 1;
      }
    }
    if (at(STATE_DOUBLES + 7) > 0) {
      s.propSteps += 1;
    }
    if (at(STATE_DOUBLES + 8) > 0) {
      s.frameSteps += 1;
    }
    const closing = at(STATE_DOUBLES + 1);
    if (closing > s.maxClosing) {
      s.maxClosing = closing;
    }
    const depth = at(STATE_DOUBLES + 9);
    if (depth > s.deepest) {
      s.deepest = depth;
    }
    s.end = [at(1), at(2), at(3), at(4), at(5), at(6)];
  }

  finish() {
    this.beforeStep();
    const s = this.s;
    const r = (x) => Math.round(x * 1000) / 1000;
    const end = s.end || [0, 0, 0, 0, 0, 0];
    return {
      label: this.label,
      index: this.index,
      steps: this.steps,
      sha256: this.hash ? this.hash.digest('hex') : null,
      inputs: this.inputs ? this.inputs.digest('hex') : null,
      digests: this.digests.slice(0, this.steps),
      records: this.keep,
      error: this.error,
      summary: {
        steps: this.steps,
        contactSteps: s.contactSteps,
        boxSteps: s.boxSteps,
        capsuleSteps: s.capsuleSteps,
        moverSteps: s.moverSteps,
        supportSteps: s.supportSteps,
        supportContactSteps: s.supportContactSteps,
        propSteps: s.propSteps,
        frameSteps: s.frameSteps,
        firstContact: s.firstContact,
        maxClosing: r(s.maxClosing),
        deepest: r(s.deepest),
        world: { boxes: s.boxes, capsules: s.capsules, moverSets: s.movers },
        endP: end.slice(0, 3).map(r),
        endSpeed: r(Math.sqrt(end[3] * end[3] + end[4] * end[4] + end[5] * end[5])),
      },
    };
  }
}

function moved(args, from, to, d) {
  const out = args.slice();
  for (let i = from; i < to; i += 1) {
    out[i] += d;
  }
  return out;
}

/*
 * Wrap one instance's exports. The host gets back an object with every
 * export it had, the same memory, and nine functions watched on the way
 * through: sim_step, sim_world_report, and the seven that build the world.
 */
function wrapExports(ex, flight, fault) {
  const w = {};
  for (const k of Object.keys(ex)) {
    w[k] = ex[k];
  }
  w.sim_step = (n) => {
    flight.beforeStep();
    const code = ex.sim_step(n);
    flight.afterStep(n);
    return code;
  };
  w.sim_world_report = (p) => {
    const code = ex.sim_world_report(p);
    flight.reportRead(p);
    return code;
  };
  w.sim_world_clear = () => {
    flight.input(0, []);
    return ex.sim_world_clear();
  };
  w.sim_world_frame = (ox, oy, oz, yaw) => {
    flight.input(1, [ox, oy, oz, yaw]);
    return ex.sim_world_frame(ox, oy, oz, yaw);
  };
  w.sim_world_box = (...a) => {
    let b = a;
    if (fault === 'box') {
      b = moved(a, 0, 6, NUDGE);
    } else if (fault === 'restitution') {
      b = a.slice();
      b[6] = nextUp(a[6]);
    }
    const i = ex.sim_world_box(...b);
    flight.shape(2, b, i, 1);
    return i;
  };
  w.sim_world_capsule = (...a) => {
    let b = a;
    if (fault === 'capsule') {
      b = a.slice();
      b[6] = a[6] + NUDGE;
    } else if (fault === 'restitution') {
      b = a.slice();
      b[7] = nextUp(a[7]);
    }
    const i = ex.sim_world_capsule(...b);
    flight.shape(3, b, i, 2);
    return i;
  };
  w.sim_world_box_z = (i, z0, z1) => {
    flight.input(4, [i, z0, z1]);
    return ex.sim_world_box_z(i, z0, z1);
  };
  w.sim_world_mover = (...a) => {
    /* a = [m, x0, y0, z0, x1, y1, z1, vx, vy, vz, e, mu]; x1 < x0 parks. */
    const b = fault === 'mover' && a[4] >= a[1] ? moved(a, 1, 7, NUDGE) : a;
    flight.mover(b);
    return ex.sim_world_mover(...b);
  };
  w.sim_world_build = () => {
    const n = ex.sim_world_build();
    flight.input(6, [n]);
    return n;
  };
  return w;
}

/*
 * Record every instance of the physics module made while a session has a
 * label. `WA` is the host's WebAssembly namespace; its instantiate is
 * replaced by one that wraps the exports, and, when session.moduleBytes is
 * set, instantiates those bytes instead of the ones it was handed, which is
 * how a scratch module is flown by code that reads dist/sim.wasm itself.
 * Returns the session.
 *
 *   session.begin(label)   start recording flights under a label
 *   session.end()          finish them and hand them back
 *   session.fault          one of FAULTS' keys, or null
 */
export function recordModule(WA, { hash = null, keep = false } = {}) {
  const session = {
    label: null,
    flights: [],
    fault: null,
    moduleBytes: null,
    hash,
    keep,
    begin(label) {
      if (this.label !== null) {
        throw new Error(`worldrec: ${label} began inside ${this.label}`);
      }
      this.label = label;
      this.flights = [];
    },
    end() {
      const out = this.flights.map((f) => f.finish());
      this.label = null;
      this.flights = [];
      return out;
    },
  };
  const real = WA.instantiate;
  WA.instantiate = async function instantiate(source, imports) {
    const isModule = source instanceof WA.Module;
    const bytes = session.moduleBytes && !isModule ? session.moduleBytes : source;
    const out = await real.call(WA, bytes, imports);
    const inst = out instanceof WA.Instance ? out : out.instance;
    const ex = inst.exports;
    if (session.label === null || typeof ex.sim_step !== 'function') {
      return out;
    }
    const flight = new Flight(ex, session);
    session.flights.push(flight);
    const wrapped = { exports: wrapExports(ex, flight, session.fault) };
    return out instanceof WA.Instance ? wrapped : { module: out.module, instance: wrapped };
  };
  return session;
}

/*
 * The per step digests as text for a golden: the low 12 bits of each, two
 * base64url characters a step. Twelve bits keeps a golden of a few hundred
 * thousand steps a few hundred kilobytes; the trace's SHA-256 is what
 * decides equality, and these only place the first difference. A step whose
 * 12 bits happen to agree although its record moved (one in 4096) hides
 * itself, so the step they name is the first that differs or a later one,
 * never an earlier one.
 */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export const STEP_BITS = 12;

export function packDigests(digests) {
  let s = '';
  for (let i = 0; i < digests.length; i += 1) {
    const v = digests[i] & 0xfff;
    s += B64[v >> 6] + B64[v & 63];
  }
  return s;
}

export function unpackDigest(text, i) {
  return (B64.indexOf(text[2 * i]) << 6) | B64.indexOf(text[2 * i + 1]);
}

/* The first step (0 based) whose low 12 bits differ, or -1. */
export function firstDifference(digests, text) {
  const n = Math.min(digests.length, text.length / 2);
  for (let i = 0; i < n; i += 1) {
    if ((digests[i] & 0xfff) !== unpackDigest(text, i)) {
      return i;
    }
  }
  return digests.length === text.length / 2 ? -1 : n;
}
