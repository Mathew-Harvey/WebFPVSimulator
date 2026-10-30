/*
 * ballroom.js: Quad Ball in a multiplayer room. The owner's ask of
 * 2026-10-29: "rocket league but with quads", single and multiplayer, bots
 * in it. Pink against mint, as src/game/quadball.js plays it solo.
 *
 * THE DOGFIGHT ROOM'S SLOTS, THE BALL ROUND'S BALL. A BallRoom is the
 * DogfightRoom (src/game/dogroom.js) for who is in the room, where the room
 * drew them and which bots the host's page flies, with the bots playing as
 * BallRound's do and nothing fired.
 *
 * THE BALL IS THE HOST'S. Two pages deciding where one ball goes would
 * decide it twice, so one page has to say where it is. Every page steps the
 * ball the same way against the same quads (the puppets where the room drew
 * them), so a hit looks like a hit the instant it happens, and every page is
 * pulled to the host's ball each time it hears it (blBall, about fifteen
 * times a second while the ball is live, six whole numbers). Only the host
 * says a ball went into a goal (blGoal), and the board counts it, keeps the
 * teams' score, and says it back to everybody with the time of the next
 * kickoff, so every page holds the ball for the same moment.
 *
 * Rounds, teams and the clock are the board's, as every room game's
 * (src/rooms.js ballMessage): the host starts one, the board deals the
 * teams, says GO, and when it ends.
 *
 * WHAT IT COSTS. On every page: the ball stepped once a feed against the
 * quads in the round, which is the solo round's cost. On the host's page,
 * fifteen messages of six integers a second while the ball is live, and
 * half a message a second while it sits still. Nothing is allocated on a
 * feed but those messages.
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

import { DOGFIGHT_EVERY, ME } from './dogfight.js';
import { DogfightRoom, ROOM_SLOTS } from './dogroom.js';
import {
  BallRound, arenaStep, KICK_MS, normaliseBallRules,
} from './quadball.js';

export { ROOM_SLOTS };

const DT = DOGFIGHT_EVERY / 1000;
/* How often the host sends the ball while it moves, and while it sits. */
const BALL_EVERY_MS = 66;
const BALL_STILL_EVERY_MS = 500;
/* A ball moving slower than this, aircraft metres a second, sits. */
const STILL = 0.5;
/* Further than this from the host's, world metres, and the ball is put
 * where the host says; nearer, it is pulled half way, a hearing at a time. */
const SNAP = 3;
/* A goal the board has not answered for this long was refused: the ball
 * goes back to the middle and the match goes on. */
const GOAL_WAIT_MS = 2000;
/* The board's comparison of a target against its goals. */
const GOALS_TO_WIN = 5;

export class BallRoom extends DogfightRoom {
  /*
   * world: as the Dogfight's, with `arena` the map's. pen: the ball map's
   * game (map.ballGame), as BallRound's. now: this page's clock, ms.
   */
  constructor(world, { now = () => performance.now(), seed = 1, pen = null } = {}) {
    super(world, { now, seed });
    this.pen = pen;
    this.arena = (pen && pen.arena) || world.arena;
    this.ballRules = normaliseBallRules({ size: 2 });
    this.setup();
    if (!this.flyer.nav.length && this.brain && this.brain.nav.length) {
      this.flyer.nav = this.brain.nav;
    }
    this.flyer.reset();
    this.state = {
      phase: 'pit', round: '3m', n: 0, goAt: 0, endAt: 0, kickAt: 0, score: [0, 0], overtime: false, winner: null, rows: [],
    };
    this.winner = -1;
    this.goalWait = false;
    this.goalWaitAt = 0;
    this.sentAt = -1e9;
    this.kickoff(false);
    this.holdUntil = 0;
  }

  get goalsToWin() {
    return this.state.round === 'first5' ? GOALS_TO_WIN : 0;
  }

  /* In the match, flying a quad the ball can meet, and drawn lately. */
  plays(i) {
    return this.inFight[i] === 1 && this.alive[i] === 1 && this.here(i);
  }

  /* A bot put somewhere new plays from there. */
  spawnBot(i, pick) {
    super.spawnBot(i, pick);
    if (this.flyer) {
      this.flyer.placed(i);
      this.gx[i] = this.x[i];
      this.gy[i] = this.y[i];
      this.gz[i] = this.z[i];
    }
  }

  setYou(you, host) {
    const was = this.host;
    super.setYou(you, host);
    if (this.host && !was && this.flyer) {
      for (let i = 1; i < ROOM_SLOTS; i += 1) {
        if (this.isBot[i] && this.idOf[i] >= 0) {
          this.flyer.placed(i);
          this.gx[i] = this.x[i];
          this.gy[i] = this.y[i];
          this.gz[i] = this.z[i];
        }
      }
      this.sentAt = -1e9;
    }
  }

  setBots(seats) {
    super.setBots(seats);
    for (let i = 1; i < ROOM_SLOTS; i += 1) {
      if (this.isBot[i] && this.idOf[i] >= 0) {
        this.alive[i] = 1;
      }
    }
  }

  /*
   * The board's round, { phase, round, n, goAt, endAt, kickAt, score,
   * overtime, winner, rows: [{ id, goals, team }] }. toLocal as the
   * dogfight room's.
   */
  heard(state, toLocal) {
    const goLocal = toLocal(state.goAt);
    const endLocal = state.endAt ? toLocal(state.endAt) : 0;
    const was = this.state;
    this.state = state;
    const inRound = state.phase === 'count' || state.phase === 'live' || state.phase === 'results';
    const fresh = inRound && state.n !== was.n;
    const rowOf = new Map();
    for (const row of state.rows || []) {
      rowOf.set(row.id, row);
    }
    for (let i = 0; i < ROOM_SLOTS; i += 1) {
      const id = this.idAt(i);
      const row = id >= 0 ? rowOf.get(id) : undefined;
      if (!inRound || !row) {
        this.inFight[i] = 0;
        this.alive[i] = i === ME || (this.isBot[i] && id >= 0) ? 1 : 0;
        if (!inRound) {
          this.pops[i] = 0;
        }
        continue;
      }
      if (fresh) {
        this.zero(i);
        this.touches[i] = 0;
        this.ownGoals[i] = 0;
      }
      this.inFight[i] = 1;
      this.alive[i] = 1;
      this.team[i] = row.team === 1 ? 1 : 0;
      this.pops[i] = row.goals;
    }
    this.teamScore[0] = state.score ? state.score[0] : 0;
    this.teamScore[1] = state.score ? state.score[1] : 0;
    this.overtime = Boolean(state.overtime);
    this.winnerTeam = state.winner === 0 || state.winner === 1 ? state.winner : -1;
    this.ballRules = { ...this.ballRules, round: state.round };
    const nowMs = this.now();
    if (fresh) {
      this.goalPending = false;
      this.goalWait = false;
      this.goalUntil = 0;
      this.lastTouch = -1;
      this.lastTouchTeam = -1;
      this.kickoff(false);
      this.sentAt = -1e9;
    }
    if (state.phase === 'count' || state.phase === 'live') {
      this.startedMs = this.clockMs + Math.round(goLocal - nowMs);
      this.roundMs = endLocal > goLocal ? Math.round(endLocal - goLocal) : 0;
      this.over = false;
      this.ended = false;
      this.dismissed = false;
      this.winner = -1;
      if (state.kickAt > 0) {
        this.holdUntil = this.clockMs + Math.round(toLocal(state.kickAt) - nowMs);
        if (this.goalPending) {
          this.goalUntil = this.holdUntil - KICK_MS;
        }
      }
    } else if (state.phase === 'results') {
      this.winner = this.bestOf(this.winnerTeam);
      if (!this.ended) {
        this.ended = true;
        this.over = true;
        this.dismissed = false;
        this.overAtMs = this.clockMs;
        this.event('over', this.winner, this.winnerTeam, 0, '', 0, 0, 0);
      }
    } else {
      this.startedMs = -1;
      this.over = false;
      this.ended = false;
      this.dismissed = false;
      this.winner = -1;
      this.holdUntil = 0;
    }
  }

  /* The slot with most goals on `team`, or -1. */
  bestOf(team) {
    let best = -1;
    for (let i = 0; i < ROOM_SLOTS; i += 1) {
      if (this.inFight[i] && this.team[i] === team && (best < 0 || this.pops[i] > this.pops[best])) {
        best = i;
      }
    }
    return best;
  }

  /* A goal the board counted, { n, team, by, own, score, goals, kickAt }. */
  heardGoal(msg, toLocal) {
    if (msg.n !== this.state.n) {
      return;
    }
    const nowMs = this.now();
    const slot = Number.isInteger(msg.by) && msg.by >= 0 ? this.slotOf(msg.by) : -1;
    this.teamScore[0] = msg.score[0];
    this.teamScore[1] = msg.score[1];
    if (slot >= 0) {
      this.pops[slot] = msg.goals;
      this.inFight[slot] = 1;
    }
    const b = this.ball;
    b.vx = 0;
    b.vy = 0;
    b.vz = 0;
    this.holdUntil = this.clockMs + Math.round(toLocal(msg.kickAt) - nowMs);
    this.goalUntil = this.holdUntil - KICK_MS;
    this.goalPending = true;
    this.goalWait = false;
    this.lastScorer = slot;
    this.lastScoringTeam = msg.team;
    this.lastOwn = msg.own === true;
    this.event('goal', slot, msg.team, 0, msg.own === true ? 'own' : '', b.x, b.y, b.z, true);
    this.lastTouch = -1;
    this.lastTouchTeam = -1;
  }

  /* Where the host's ball is, as blBall's `b`: centimetres, then decimetres
   * a second. Only a live ball is pulled; a held one hangs where it hangs. */
  heardBall(msg) {
    if (this.host || msg.n !== this.state.n || !this.inPlay || this.goalWait || !Array.isArray(msg.b)) {
      return;
    }
    const v = msg.b;
    const b = this.ball;
    const k = this.world.k;
    const sx = v[0] / 100;
    const sy = v[1] / 100;
    const sz = v[2] / 100;
    const dx = sx - b.x;
    const dy = sy - b.y;
    const dz = sz - b.z;
    const far = dx * dx + dy * dy + dz * dz > (SNAP * k) * (SNAP * k);
    const f = far ? 1 : 0.5;
    b.x += dx * f;
    b.y += dy * f;
    b.z += dz * f;
    b.vx += (v[3] / 10 - b.vx) * f;
    b.vy += (v[4] / 10 - b.vy) * f;
    b.vz += (v[5] / 10 - b.vz) * f;
  }

  /* The host's ball out to the room. */
  sendBall(now) {
    const b = this.ball;
    const k = this.world.k;
    const still = b.vx * b.vx + b.vy * b.vy + b.vz * b.vz < (STILL * k) * (STILL * k);
    if (now - this.sentAt < (still ? BALL_STILL_EVERY_MS : BALL_EVERY_MS)) {
      return;
    }
    this.sentAt = now;
    this.outbox.push({
      t: 'blBall',
      n: this.state.n,
      b: [pos(b.x), pos(b.y), pos(b.z), tenth(b.vx), tenth(b.vy), tenth(b.vz)],
    });
  }

  /* The ball's feed and the goals, as BallRound's but for the score, which
   * is the board's: a ball in a goal waits for the board to say so. */
  play(now) {
    if (this.goalPending) {
      this.afterGoal();
    }
    if (this.goalWait && now - this.goalWaitAt > GOAL_WAIT_MS) {
      this.goalWait = false;
      const hold = this.holdUntil;
      this.kickoff(false);
      this.holdUntil = Math.max(hold, now);
    }
    if (!this.running) {
      return;
    }
    if (this.inPlay && !this.goalWait) {
      const b = this.ball;
      for (let i = 0; i < this.cap; i += 1) {
        if (this.plays(i)) {
          this.meet(i, now);
        }
      }
      const side = arenaStep(b, this.bR, this.world.k, this.arena, DT);
      if (side !== 0) {
        b.vx = 0;
        b.vy = 0;
        b.vz = 0;
        this.goalWait = true;
        this.goalWaitAt = now;
        if (this.host && !this.over) {
          const scorer = side > 0 ? 0 : 1;
          const own = this.lastTouch >= 0 && this.lastTouchTeam !== scorer;
          const msg = {
            t: 'blGoal', n: this.state.n, team: scorer, own,
          };
          if (this.lastTouch >= 0 && !own) {
            msg.by = this.idAt(this.lastTouch);
          } else if (own) {
            msg.by = this.idAt(this.lastTouch);
          }
          this.outbox.push(msg);
        }
      } else if (this.host) {
        this.sendBall(now);
      }
    } else if (this.clockMs < this.holdUntil && this.clockMs >= this.goalUntil && !this.goalPending) {
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.ball.vz = 0;
    }
  }

  leftMs() {
    return this.overtime ? 0 : super.leftMs();
  }

  /* ONE FEED: the puppets where the room drew them, this page's pilot, the
   * bots this page flies playing, the ball stepped against all of them. */
  step(me, teleported = false) {
    const t = this.now();
    this.tNow = t;
    this.carry(t);
    this.snapshot();
    this.ballPrev.x = this.ball.x;
    this.ballPrev.y = this.ball.y;
    this.ballPrev.z = this.ball.z;
    this.clockMs += DOGFIGHT_EVERY;
    const now = this.clockMs;
    this.meFlying = Boolean(me.flying);
    this.feedMe(me, teleported);
    for (let i = 1; i < ROOM_SLOTS; i += 1) {
      if (this.isBot[i] && !this.puppet[i] && this.alive[i] && this.idOf[i] >= 0) {
        this.playBot(i, now);
      }
    }
    this.play(now);
  }
}

/* BallRound's play, shared: the bots, the ball's meeting, the kickoff and
 * the table. */
for (const k of [
  'setup', 'playBot', 'pickRole', 'rankOf', 'meet', 'kickoff', 'countdownS', 'dirOf', 'afterGoal', 'standings', 'bR', 'inPlay',
]) {
  Object.defineProperty(BallRoom.prototype, k, Object.getOwnPropertyDescriptor(BallRound.prototype, k));
}

function pos(v) {
  const n = Math.round(v * 100);
  return n < -20000 ? -20000 : (n > 20000 ? 20000 : n);
}

/* Decimetres a second, for a speed in metres a second. */
function tenth(v) {
  const n = Math.round(v * 10);
  return n < -20000 ? -20000 : (n > 20000 ? 20000 : n);
}
