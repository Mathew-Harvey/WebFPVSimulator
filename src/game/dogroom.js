/*
 * dogroom.js: a dogfight in a multiplayer room. The owner's ask of
 * 2026-10-29: "Every map should be available with friends so multiplayer
 * or single player, bots should be able to be added to either, single
 * player auto loads bots of your choice multiplayer you can fill the
 * roster with bots of you like".
 *
 * THE SAME FIGHT, MORE SLOTS. A DogfightRoom is the Dogfight with a slot
 * for everybody in the room (ROOM_SLOTS) instead of the pilot and seven
 * bots. Slot 0 is still this page's own pilot. Every other pilot in the
 * room is a puppet: put where the room last drew them and never flown or
 * judged here. The room's bots (the seats the host fills, src/net/
 * roombots.js) are flown by the host's page with the same brains as a solo
 * fight, and are puppets on everybody else's.
 *
 * EVERY PAGE JUDGES ITS OWN SHOTS, THE BOARD MAKES THEM TRUE. A pellet or
 * a missile from this page's pilot, or from a bot this page flies, that
 * lands on somebody is sent to the board as a hit (dfHit), and the board
 * checks it and tells everybody, with what is left of the target's health
 * and whether it popped (the board's src/rooms.js dogfightMessage). So a
 * hit is what its shooter saw, as in every online shooter, and health, pops
 * and the winner are the same on every page because only the board keeps
 * them. The other pages are told the gun going on and off and a missile
 * leaving (dfGun, dfLaunch) only to draw them: a missile coming for this
 * page's pilot is drawn chasing them and sounds its tone, so a hard break
 * beats it here as it does in the shooter's page.
 *
 * THE ROUND IS THE BOARD'S: when it starts, how long it runs and when it
 * ends, as in a ribbon cutting room.
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

import {
  Dogfight, ME, HITS, SHIELD_MS, MISSILE, DOGFIGHT_EVERY,
} from './dogfight.js';

/* A slot for everybody a room can hold, its 64 at most for a streamer
 * room, bots included. */
export const ROOM_SLOTS = 64;
/* A pilot not drawn for this long has left, or is in the menus. */
const GONE_MS = 1500;
/* The most damage one hit can be sent as: the board's DF_DAMAGE. */
const MOST = { gun: 14, missile: 55 };
/* How long a bot's gun has to be quiet before the others are told. */
const GUN_QUIET_MS = 150;

export class DogfightRoom extends Dogfight {
  /* world: as the Dogfight's. now: this page's clock, ms. */
  constructor(world, { now = () => performance.now(), seed = 1 } = {}) {
    super(world, {
      bots: 0, skill: 'pilot', round: 'none', hits: 'arcade',
    }, seed, ROOM_SLOTS);
    this.now = now;
    this.room = true;
    const n = ROOM_SLOTS;
    const f = () => new Float64Array(n);
    this.idOf = new Int32Array(n).fill(-1);
    this.slots = new Map();
    this.names = new Array(n).fill('');
    this.skills = new Array(n).fill('pilot');
    this.avatars = new Array(n).fill(null);
    /* The latest pose the room drew for a puppet, when, and how fast it
     * was going between the last two. */
    this.seenAt = f().fill(-1e9);
    this.tx = f(); this.ty = f(); this.tz = f();
    this.tvx = f(); this.tvy = f(); this.tvz = f();
    this.tfx = f(); this.tfy = f(); this.tfz = f();
    this.tux = f(); this.tuy = f(); this.tuz = f();
    /* A puppet's gun as its page says it is. */
    this.gunOn = new Uint8Array(n);
    /* What this page last told the others of its own guns. */
    this.toldGun = new Uint8Array(n);
    this.quietAt = f();
    this.you = -1;
    this.host = false;
    this.outbox = [];
    this.state = {
      phase: 'pit', hits: 'arcade', round: '3m', n: 0, goAt: 0, endAt: 0, winner: null, rows: [],
    };
    this.ended = false;
    this.dismissed = false;
    /* The room's pilot by id, set by the shell: see nameOf. */
    this.who = null;
    /* now(), read once a feed: here() is asked a great many times. */
    this.tNow = now();
    this.inFight[ME] = 0;
    this.alive[ME] = 0;
  }

  /* A round is the board's to start: nothing here after the first. */
  reset(round) {
    if (!this.idOf) {
      super.reset(round);
      return;
    }
    /* After the table's time, or Fly on: the table is put away and the
     * round stays the board's. */
    if (this.over) {
      this.dismissed = true;
    }
    this.havePrevMe = false;
  }

  /* The round is the board's, not this page's. */
  get judged() {
    return false;
  }

  get running() {
    return this.startedMs >= 0 && !this.over && this.clockMs >= this.startedMs;
  }

  skillOf(i) {
    return this.skills[i];
  }

  /* The room's own list first (main.js sets `who`, the link's pilots by
   * id): the board gives a pilot who joins the lowest id free, so a slot
   * kept for a pilot who left is the next one's, and the name learned from
   * the last one's poses stayed on it until the new one flew. A pilot who
   * joined and sat in the menus finished the round under the name of the
   * one who had gone. */
  nameOf(i) {
    if (i === ME) {
      return 'YOU';
    }
    const p = this.who && i > 0 && this.idOf[i] >= 0 ? this.who(this.idOf[i]) : null;
    return (p && p.handle) || this.names[i] || 'PILOT';
  }

  /* The room's id for slot i. */
  idAt(i) {
    return i === ME ? this.you : this.idOf[i];
  }

  /* The slot room pilot `id` has, or -1. */
  slotOf(id) {
    if (id === this.you) {
      return ME;
    }
    const s = this.slots.get(id);
    return s === undefined ? -1 : s;
  }

  /* A slot for room pilot `id`, made the first time it is asked for. */
  slotFor(id) {
    const had = this.slotOf(id);
    if (had >= 0) {
      return had;
    }
    let s = -1;
    for (let i = 1; i < ROOM_SLOTS; i += 1) {
      if (this.idOf[i] < 0) {
        s = i;
        break;
      }
    }
    if (s < 0) {
      /* Full: the one longest unheard and not in the round gives way. */
      let oldest = Infinity;
      for (let i = 1; i < ROOM_SLOTS; i += 1) {
        if (!this.inFight[i] && !this.isBot[i] && this.seenAt[i] < oldest) {
          oldest = this.seenAt[i];
          s = i;
        }
      }
      if (s < 0) {
        return -1;
      }
      this.slots.delete(this.idOf[s]);
    }
    this.idOf[s] = id;
    this.slots.set(id, s);
    this.names[s] = '';
    this.avatars[s] = null;
    this.skills[s] = 'pilot';
    this.isBot[s] = 0;
    this.puppet[s] = 1;
    this.inFight[s] = 0;
    this.alive[s] = 0;
    this.gunOn[s] = 0;
    this.toldGun[s] = 0;
    this.target[s] = -1;
    this.lockOn[s] = -1;
    this.lockMs[s] = 0;
    this.firing[s] = 0;
    this.zero(s);
    this.whole(s);
    return s;
  }

  free(s) {
    this.slots.delete(this.idOf[s]);
    this.idOf[s] = -1;
    this.isBot[s] = 0;
    this.puppet[s] = 0;
    this.inFight[s] = 0;
    this.alive[s] = 0;
  }

  zero(i) {
    this.pops[i] = 0;
    this.popped[i] = 0;
    this.hits[i] = 0;
    this.shots[i] = 0;
    this.streak[i] = 0;
    this.bestStreak[i] = 0;
    this.dodged[i] = 0;
    this.longest[i] = 0;
    this.dealt[i] = 0;
  }

  /* Drawn lately, or flown here. */
  here(i) {
    return i === ME || !this.puppet[i] || this.tNow - this.seenAt[i] < GONE_MS;
  }

  live(i) {
    return this.inFight[i] === 1 && this.alive[i] === 1 && this.here(i);
  }

  /* Who this page is in the room, and whether it is the host: the host's
   * page flies the bots, and a page that becomes the host takes them on
   * where they were. */
  setYou(you, host) {
    if (you !== this.you) {
      const s = this.slots.get(you);
      if (s !== undefined) {
        this.free(s);
      }
      this.you = you;
    }
    const was = this.host;
    this.host = Boolean(host);
    if (was === this.host) {
      return;
    }
    for (let i = 1; i < ROOM_SLOTS; i += 1) {
      if (!this.isBot[i] || this.idOf[i] < 0) {
        continue;
      }
      this.puppet[i] = this.host ? 0 : 1;
      if (this.host) {
        this.x[i] = this.tx[i]; this.y[i] = this.ty[i]; this.z[i] = this.tz[i];
        this.vx[i] = this.tvx[i]; this.vy[i] = this.tvy[i]; this.vz[i] = this.tvz[i];
        this.fx[i] = this.tfx[i]; this.fy[i] = this.tfy[i]; this.fz[i] = this.tfz[i];
        this.ux[i] = this.tux[i]; this.uy[i] = this.tuy[i]; this.uz[i] = this.tuz[i];
        this.brain.spawned(i);
      }
    }
  }

  /*
   * The room's bot seats, [{ id, name, skill }], from src/net/roombots.js.
   * A seat that is new is put at a spawn, on the host's page; a seat that
   * has gone gives its slot back.
   */
  setBots(seats) {
    const keep = new Set();
    for (const seat of seats) {
      const s = this.slotFor(seat.id);
      if (s <= 0) {
        continue;
      }
      keep.add(s);
      const fresh = !this.isBot[s];
      this.isBot[s] = 1;
      this.names[s] = String(seat.name || 'BOT').slice(0, 24);
      this.skills[s] = Object.prototype.hasOwnProperty.call(SKILL_NAMES, seat.skill) ? seat.skill : 'pilot';
      this.puppet[s] = this.host ? 0 : 1;
      if (fresh && this.host) {
        this.spawnBot(s, -1);
        this.seenAt[s] = this.now();
      }
    }
    for (let i = 1; i < ROOM_SLOTS; i += 1) {
      if (this.isBot[i] && this.idOf[i] >= 0 && !keep.has(i)) {
        this.free(i);
      }
    }
  }

  /*
   * A puppet's pose as the room drew it this frame (main.js mpDraw): world
   * metres and the craft's quaternion, and the room's pilot, { handle,
   * avatar, bot, skill }. Taken at the next feed. The host's own bots never
   * come here: it flies them.
   */
  remote(id, pose, pilot) {
    const s = this.slotFor(id);
    if (s <= 0) {
      return;
    }
    if (pilot) {
      this.names[s] = String(pilot.handle || '').slice(0, 24);
      this.avatars[s] = pilot.avatar || null;
      if (pilot.bot) {
        this.isBot[s] = 1;
        this.skills[s] = Object.prototype.hasOwnProperty.call(SKILL_NAMES, pilot.skill) ? pilot.skill : 'pilot';
      }
    }
    if (!this.puppet[s]) {
      return;
    }
    const t = this.now();
    const dt = (t - this.seenAt[s]) / 1000;
    if (dt > 0.004 && dt < 0.5 && !pose.cut) {
      this.tvx[s] = (pose.px - this.tx[s]) / dt;
      this.tvy[s] = (pose.py - this.ty[s]) / dt;
      this.tvz[s] = (pose.pz - this.tz[s]) / dt;
    } else if (dt >= 0.5 || pose.cut) {
      this.tvx[s] = 0; this.tvy[s] = 0; this.tvz[s] = 0;
    }
    this.seenAt[s] = t;
    const qx = pose.qx; const qy = pose.qy; const qz = pose.qz; const qw = pose.qw;
    this.tx[s] = pose.px;
    this.ty[s] = pose.py;
    this.tz[s] = pose.pz;
    /* The craft's up, +Y turned, and its nose, -Z turned. The camera's
     * tilt is the pilot's own and is not sent, so a puppet's gun is drawn
     * along its nose. */
    this.tux[s] = 2 * (qx * qy - qw * qz);
    this.tuy[s] = 1 - 2 * (qx * qx + qz * qz);
    this.tuz[s] = 2 * (qy * qz + qw * qx);
    this.tfx[s] = -2 * (qx * qz + qw * qy);
    this.tfy[s] = -2 * (qy * qz - qw * qx);
    this.tfz[s] = -(1 - 2 * (qx * qx + qy * qy));
  }

  /*
   * The board's round, { phase, hits, round, n, goAt, endAt, winner, rows
   * }. toLocal turns a time on the board's clock into one on now()'s.
   */
  heard(state, toLocal) {
    const goLocal = toLocal(state.goAt);
    const endLocal = state.endAt ? toLocal(state.endAt) : 0;
    const was = this.state;
    this.state = state;
    const fresh = state.n !== was.n;
    if (Object.prototype.hasOwnProperty.call(HITS, state.hits)) {
      this.hpMax = HITS[state.hits].hp;
      this.backMs = HITS[state.hits].backMs;
    }
    const inRound = state.phase === 'count' || state.phase === 'live' || state.phase === 'results';
    const rowOf = new Map();
    for (const row of state.rows || []) {
      rowOf.set(row.id, row);
    }
    const nowMs = this.now();
    for (let i = 0; i < ROOM_SLOTS; i += 1) {
      const id = this.idAt(i);
      const row = id >= 0 ? rowOf.get(id) : undefined;
      if (!inRound || !row) {
        this.inFight[i] = 0;
        this.alive[i] = 0;
        continue;
      }
      if (fresh) {
        this.zero(i);
        this.whole(i);
        this.target[i] = -1;
        if (this.isBot[i] && !this.puppet[i]) {
          this.spawnBot(i, -1);
        }
      }
      this.inFight[i] = 1;
      this.pops[i] = row.pops;
      this.popped[i] = row.popped;
      this.dealt[i] = row.dealt;
      if (row.backAt) {
        this.hp[i] = 0;
        this.alive[i] = 0;
        this.backAt[i] = this.clockMs + Math.max(0, Math.round(toLocal(row.backAt) - nowMs));
      } else {
        this.hp[i] = row.hp;
        this.alive[i] = 1;
      }
    }
    if (state.phase === 'count' || state.phase === 'live') {
      this.startedMs = this.clockMs + Math.round(goLocal - nowMs);
      this.roundMs = endLocal > goLocal ? Math.round(endLocal - goLocal) : 0;
      this.over = false;
      this.ended = false;
      this.dismissed = false;
      if (fresh) {
        for (let i = 0; i < ROOM_SLOTS; i += 1) {
          this.shieldUntil[i] = i === ME ? Infinity : this.startedMs + SHIELD_MS;
        }
        this.pAlive.fill(0);
        this.mAlive.fill(0);
      }
    } else if (state.phase === 'results') {
      if (!this.ended) {
        this.ended = true;
        this.over = true;
        this.dismissed = false;
        this.overAtMs = this.clockMs;
        this.pAlive.fill(0);
        for (let s = 0; s < this.mAlive.length; s += 1) {
          if (this.mAlive[s]) {
            this.boom(s, false);
          }
        }
        this.event('over', -1, -1, 0, '', 0, 0, 0);
      }
    } else {
      this.startedMs = -1;
      this.over = false;
      this.ended = false;
      this.dismissed = false;
    }
  }

  /*
   * A hit the board believed, { n, by, to, w, d, hp, pop, backAt }; toLocal
   * as heard()'s. The shooter's own page drew the hit when it saw it;
   * everybody else draws it now.
   */
  heardHit(msg, toLocal) {
    if (msg.n !== this.state.n) {
      return;
    }
    const to = this.slotOf(msg.to);
    const by = this.slotOf(msg.by);
    if (to < 0) {
      return;
    }
    this.hp[to] = msg.hp;
    const mine = by === ME || (by > 0 && this.isBot[by] && !this.puppet[by]);
    if (by >= 0) {
      this.hits[by] += 1;
      this.dealt[by] += msg.d;
      if (!mine) {
        this.event('hit', by, to, msg.d, msg.w, this.x[to], this.y[to], this.z[to], msg.w === 'missile' || msg.d >= 12);
        this.brain.onHit(to, by);
      }
    }
    if (!msg.pop) {
      return;
    }
    this.hp[to] = 0;
    this.alive[to] = 0;
    this.lockOn[to] = -1;
    this.lockMs[to] = 0;
    this.firing[to] = 0;
    this.backAt[to] = this.clockMs + Math.max(0, Math.round(toLocal(msg.backAt) - this.now()));
    this.popped[to] += 1;
    this.streak[to] = 0;
    if (by >= 0 && by !== to) {
      this.pops[by] += 1;
      this.streak[by] += 1;
      if (this.streak[by] > this.bestStreak[by]) {
        this.bestStreak[by] = this.streak[by];
      }
      this.brain.onPop(to, by);
    }
    this.event('pop', by, to, msg.d, msg.w, this.x[to], this.y[to], this.z[to], true);
  }

  /* Another page's gun went on or off: drawn here, judged there. */
  heardGun(msg) {
    if (msg.n !== this.state.n) {
      return;
    }
    const s = this.slotOf(msg.by);
    if (s > 0 && this.puppet[s]) {
      this.gunOn[s] = msg.on ? 1 : 0;
    }
  }

  /* Another page's missile left: flown here on the same rules, chasing
   * the same pilot, so a pilot it chases sees it come and can beat it. It
   * hurts nobody here; its shooter's page says what it did. */
  heardLaunch(msg) {
    if (msg.n !== this.state.n) {
      return;
    }
    const by = this.slotOf(msg.by);
    if (by <= 0 || !this.puppet[by]) {
      return;
    }
    let s = -1;
    for (let m = 0; m < this.mAlive.length; m += 1) {
      if (!this.mAlive[m]) {
        s = m;
        break;
      }
    }
    if (s < 0) {
      return;
    }
    const tgt = msg.to >= 0 ? this.slotOf(msg.to) : -1;
    const k = this.k;
    let dx = msg.dx;
    let dy = msg.dy;
    let dz = msg.dz;
    const dm = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dm < 1e-6) {
      return;
    }
    dx /= dm; dy /= dm; dz /= dm;
    this.mAlive[s] = 1;
    this.mOwner[s] = by;
    this.mTarget[s] = tgt;
    this.mSerial += 1;
    this.mId[s] = this.mSerial;
    this.mdx[s] = dx; this.mdy[s] = dy; this.mdz[s] = dz;
    this.mx[s] = msg.x; this.my[s] = msg.y; this.mz[s] = msg.z;
    this.mxPrev[s] = msg.x; this.myPrev[s] = msg.y; this.mzPrev[s] = msg.z;
    this.mFromX[s] = msg.x; this.mFromY[s] = msg.y; this.mFromZ[s] = msg.z;
    const own = this.vx[by] * dx + this.vy[by] * dy + this.vz[by] * dz;
    this.mSpeed[s] = Math.max(MISSILE.speed0 * k, own + MISSILE.speed0 * k * 0.5);
    this.mAge[s] = 0;
    this.event('launch', by, tgt, 0, 'missile', msg.x, msg.y, msg.z);
  }

  /*
   * A hit seen here. Only a shot from this page's pilot or from a bot this
   * page flies is this page's to judge: it is drawn now and sent to the
   * board, which says what it did to the target's health. A shot from
   * anybody else is only drawn here and its own page judges it.
   */
  damage(to, by, dmg, weapon, x, y, z) {
    if (!this.hittable(to) || dmg <= 0 || by < 0 || this.puppet[by] || to === by) {
      return;
    }
    if (by !== ME && !this.isBot[by]) {
      return;
    }
    const d = Math.min(MOST[weapon], Math.max(1, Math.round(dmg)));
    const msg = {
      t: 'dfHit', n: this.state.n, to: this.idAt(to), w: weapon, d,
    };
    if (by !== ME) {
      msg.by = this.idAt(by);
    }
    this.outbox.push(msg);
    this.event('hit', by, to, d, weapon, x, y, z, weapon === 'missile' || d >= 12);
    this.brain.onHit(to, by);
  }

  launch(i, now) {
    const was = this.mSerial;
    const ok = super.launch(i, now);
    if (!ok || this.puppet[i] || this.mSerial === was) {
      return ok;
    }
    let s = -1;
    for (let m = 0; m < this.mAlive.length; m += 1) {
      if (this.mAlive[m] && this.mId[m] === this.mSerial) {
        s = m;
        break;
      }
    }
    if (s >= 0) {
      const tgt = this.mTarget[s];
      const msg = {
        t: 'dfLaunch',
        n: this.state.n,
        to: tgt >= 0 ? this.idAt(tgt) : -1,
        x: this.mx[s],
        y: this.my[s],
        z: this.mz[s],
        dx: this.mdx[s],
        dy: this.mdy[s],
        dz: this.mdz[s],
      };
      if (i !== ME) {
        msg.by = this.idAt(i);
      }
      this.outbox.push(msg);
    }
    return ok;
  }

  /* ONE FEED: the puppets where the room last drew them, carried on by
   * how fast they were going, their guns drawn, then the fight as solo. */
  step(me, teleported = false) {
    const t = this.now();
    this.tNow = t;
    const now = this.clockMs + DOGFIGHT_EVERY;
    for (let i = 1; i < ROOM_SLOTS; i += 1) {
      if (this.idOf[i] < 0 || !this.puppet[i]) {
        continue;
      }
      const ahead = Math.min(0.25, Math.max(0, (t - this.seenAt[i]) / 1000));
      this.x[i] = this.tx[i] + this.tvx[i] * ahead;
      this.y[i] = this.ty[i] + this.tvy[i] * ahead;
      this.z[i] = this.tz[i] + this.tvz[i] * ahead;
      this.vx[i] = this.tvx[i];
      this.vy[i] = this.tvy[i];
      this.vz[i] = this.tvz[i];
      this.fx[i] = this.tfx[i]; this.fy[i] = this.tfy[i]; this.fz[i] = this.tfz[i];
      this.ux[i] = this.tux[i]; this.uy[i] = this.tuy[i]; this.uz[i] = this.tuz[i];
    }
    super.step(me, teleported);
    for (let i = 1; i < ROOM_SLOTS; i += 1) {
      if (this.idOf[i] < 0 || !this.puppet[i]) {
        continue;
      }
      this.firing[i] = 0;
      if (this.gunOn[i] && this.running && this.live(i)) {
        this.pull(i, this.fx[i], this.fy[i], this.fz[i], now);
      }
    }
    /* This page's own guns, told to the others when they change. */
    for (let i = 0; i < ROOM_SLOTS; i += 1) {
      if (i !== ME && (!this.isBot[i] || this.puppet[i] || this.idOf[i] < 0)) {
        continue;
      }
      const on = this.firing[i] === 1 && this.running;
      if (on) {
        this.quietAt[i] = now + GUN_QUIET_MS;
      }
      const say = on ? 1 : (now >= this.quietAt[i] ? 0 : this.toldGun[i]);
      if (say !== this.toldGun[i]) {
        this.toldGun[i] = say;
        const msg = { t: 'dfGun', n: this.state.n, on: say === 1 };
        if (i !== ME) {
          msg.by = this.idAt(i);
        }
        this.outbox.push(msg);
      }
    }
  }

  /* The bots this page flies, for src/net/roombots.js to send:
   * fn(id, x, y, z, fx, fy, fz, ux, uy, uz). */
  eachFlown(fn) {
    for (let i = 1; i < ROOM_SLOTS; i += 1) {
      if (this.isBot[i] && !this.puppet[i] && this.idOf[i] >= 0) {
        fn(this.idOf[i], this.x[i], this.y[i], this.z[i], this.fx[i], this.fy[i], this.fz[i], this.ux[i], this.uy[i], this.uz[i]);
      }
    }
  }

  takeOutbox() {
    if (!this.outbox.length) {
      return null;
    }
    const out = this.outbox;
    this.outbox = [];
    return out;
  }
}

const SKILL_NAMES = { rookie: 1, pilot: 1, ace: 1 };
