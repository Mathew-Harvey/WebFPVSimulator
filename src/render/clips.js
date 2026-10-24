/*
 * clips.js: a few recorded voice clips, played on a map's cues.
 *
 * The owner, 2026-10-22: Joshua Bardwell's comments for each sticker found,
 * and Nick Burns' comments in context on his house (a crash, a hit, a
 * landing, a sticker). Twenty short recordings, one set per voice.
 *
 * FOR THE LATENCY RULE. Nothing here decodes on the main thread: a clip is a
 * plain HTMLAudioElement, which the browser fetches, decodes and mixes off
 * it, and which is not in the Web Audio graph of src/render/audio.js, so the
 * motor graph, its node count and its ducking are untouched. Nothing is
 * created until a map asks, and a clip is fetched only when it is the NEXT
 * one to play: the pick for the next sticker is made ahead and fetched
 * quietly, a few kilobytes, so the find is heard without a wait and a pilot
 * who never finds one never downloads one. Each file is a mono mp3 of 5 to
 * 40 kilobytes (assets/voices, 324 kB for all twenty).
 *
 * It follows the Sound switch and the Volume level, handed in by the shell
 * on every call. A browser that refuses to play, or a page nobody has
 * touched, stays silent: every failure here is silence, never an exception.
 *
 * Render only. Nothing here reaches the physics or the plant.
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
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

const BASE = new URL('../../assets/voices/', import.meta.url).href;

/*
 * The sets. `sticker` is the pool a find draws from, in a shuffled order
 * that never repeats a clip before the rest have gone. The other keys are
 * named cues. `says` is what each recording says, for the harness and for
 * the next person who has to match one to its moment.
 */
export const CLIP_SETS = {
  /* Joshua Bardwell: every find. */
  jb: {
    /* A goat caught on the field: Nick Burns' Boom Shakala (a name with a
     * slash is another set's file), fetched when a goat first runs. */
    cues: { goat: 'nb/boom' },
    sticker: [
      'almost-fit', 'chonky', 'controlled-load', 'evil-laugh', 'fake-laugh', 'great-package',
      'just-a-meme', 'sally', 'spam-in-chat', 'that-would-be-great', 'uwu',
    ],
    says: {
      'nb/boom': 'Boom Shakala!',
      'almost-fit': 'It had just fit in there two years ago.',
      chonky: 'Chonky boy.',
      'controlled-load': 'A very controlled load.',
      'evil-laugh': '(an evil laugh)',
      'fake-laugh': '(a fake laugh)',
      'great-package': 'It\'s a great, great little package.',
      'just-a-meme': 'It\'s just a meme. It\'s a meme and I thought it was clever.',
      sally: 'For $10, I\'ll call you Sally.',
      'spam-in-chat': 'Is there some spam going on in the chat, guys?',
      'that-would-be-great': 'That would be great.',
      uwu: 'Can I get an UwU?',
    },
  },
  /* Nick Burns: the cues of his house, and the finds of its sticker hunt. */
  nb: {
    /* The owner, 2026-10-22: a sticker is always "Stickers"; Holy catfish
     * only when he is hit; the other lines at random when the craft is
     * within a metre of him. */
    sticker: ['stickers'],
    near: ['boom', 'beefy-thicc', 'calipers', 'red-shoes', 'robust'],
    cues: {
      crash: 'crash',
      hit: 'holy-catfish',
      landed: 'just-right',
    },
    says: {
      crash: 'Poor thing.',
      'holy-catfish': 'Holy catfish, what\'s going on?',
      boom: 'Boom Shakala!',
      'just-right': 'Get it just right.',
      stickers: 'Stickers!',
      'beefy-thicc': 'Beefy and thicc.',
      calipers: 'Larger than my calipers will stretch to.',
      'red-shoes': 'Red shoes for safety.',
      robust: 'Very robust.',
    },
  },
};

/*
 * Which cue wins over which. A sticker find is the celebration and cuts
 * whatever is playing; a cue that answers the craft cuts a line he was
 * saying on his own clock, and is not cut by one.
 */
const PRIORITY = { sticker: 3, goat: 2, crash: 2, hit: 2, landed: 2, near: 1 };

/* A cue that plays only some of the time, 0 to 1. The owner, 2026-10-23:
 * "a random chance of the meme call out, not often". A miss starts no
 * cooldown. */
const CHANCE = { crash: 0.15 };

/* Quiet, per cue, ms: an auto reset after a crash can crash again in two. */
const COOLDOWN_MS = { goat: 1500, crash: 8000, hit: 4000, landed: 4000, near: 2500 };

export class ClipVoice {
  /* `make` builds an audio element from a url; the node selftest hands in a
   * stand-in, which is the only way to check this without a sound card. */
  constructor({ make = null, now = () => globalThis.performance.now(), rand = Math.random } = {}) {
    this.rand = rand;
    const native = typeof globalThis.Audio === 'function';
    this.make = make || (native ? (url) => new globalThis.Audio(url) : null);
    this.now = now;
    this.usable = this.make !== null;
    this.els = new Map();
    this.bags = new Map();
    this.upNext = new Map();
    this.last = new Map();
    this.playing = null;
    this.played = 0;
  }

  /* The next clip of a set's sticker pool: a shuffled bag, refilled when
   * empty, and never the clip just played twice running. */
  pickSticker(set) {
    return this.pickFrom(set, 'sticker');
  }

  /* The same shuffled bag for any of a set's pools ('sticker', 'near'). */
  pickFrom(set, key) {
    const pool = CLIP_SETS[set] && CLIP_SETS[set][key];
    if (!pool || !pool.length) {
      return null;
    }
    const slot = `${set}:${key}`;
    let bag = this.bags.get(slot);
    if (!bag || !bag.length) {
      bag = pool.slice();
      for (let i = bag.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      const lastOne = this.upNext.get(`${slot}:last`);
      if (bag.length > 1 && bag[bag.length - 1] === lastOne) {
        [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      }
      this.bags.set(slot, bag);
    }
    const name = bag.pop();
    this.upNext.set(`${slot}:last`, name);
    return name;
  }

  /* The element for a clip, made on first ask. preload 'auto' is what
   * fetches it; an element made and never played costs the one request. */
  element(set, name) {
    const key = `${set}/${name}`;
    let el = this.els.get(key);
    if (!el && this.make) {
      try {
        el = this.make(name.includes('/') ? `${BASE}${name}.mp3` : `${BASE}${set}/${name}.mp3`);
        el.preload = 'auto';
        this.els.set(key, el);
      } catch (e) {
        el = null;
      }
    }
    return el || null;
  }

  /* Ahead of a find: choose the next sticker clip and start its fetch. */
  warm(set) {
    if (!this.usable || !CLIP_SETS[set] || this.upNext.has(set)) {
      return;
    }
    const name = this.pickSticker(set);
    if (name) {
      this.upNext.set(set, name);
      this.element(set, name);
    }
  }

  /* Ahead of a cue: fetch its clip now (a few kilobytes), play nothing. */
  warmCue(set, cue) {
    const def = CLIP_SETS[set];
    const name = this.usable && def && def.cues ? def.cues[cue] : null;
    if (name) {
      this.element(set, name);
    }
  }

  /*
   * Play a cue from a set at `volume` from 0 to 1: 'sticker' for a find, or
   * one of the set's named cues. Returns the clip name when one started.
   */
  play(set, cue, volume) {
    const def = CLIP_SETS[set];
    if (!this.usable || !def || !(volume > 0)) {
      return null;
    }
    if (cue.startsWith('warm:')) {
      this.warmCue(set, cue.slice(5));
      return null;
    }
    const nav = globalThis.navigator;
    if (nav && nav.userActivation && !nav.userActivation.hasBeenActive) {
      return null;
    }
    const t = this.now();
    const rank = PRIORITY[cue] ?? 1;
    if (COOLDOWN_MS[cue] && t - (this.last.get(cue) ?? -Infinity) < COOLDOWN_MS[cue]) {
      return null;
    }
    if (CHANCE[cue] !== undefined && !(this.rand() < CHANCE[cue])) {
      return null;
    }
    if (this.playing && !this.playing.el.paused && !this.playing.el.ended) {
      if (rank < this.playing.rank) {
        return null;
      }
      this.stop();
    }
    let name = null;
    if (cue === 'sticker') {
      name = this.upNext.get(set) || this.pickSticker(set);
      this.upNext.delete(set);
    } else if (cue === 'near') {
      name = this.pickFrom(set, 'near');
    } else {
      name = def.cues ? def.cues[cue] : null;
    }
    if (!name) {
      return null;
    }
    const el = this.element(set, name);
    if (!el) {
      return null;
    }
    try {
      el.volume = volume > 1 ? 1 : volume;
      el.currentTime = 0;
      const p = el.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {});
      }
    } catch (e) {
      return null;
    }
    this.playing = { el, rank, name };
    this.last.set(cue, t);
    this.played += 1;
    /* The next find's clip is fetched while this one plays. */
    if (cue === 'sticker') {
      this.warm(set);
    }
    return name;
  }

  /* Quiet now, as a new run or another map does. */
  stop() {
    if (this.playing) {
      try {
        this.playing.el.pause();
      } catch (e) {
        /* Nothing to stop. */
      }
      this.playing = null;
    }
  }

  /* A map is left: nothing carries over, and its fetched clips go. */
  reset() {
    this.stop();
    this.els.clear();
    this.bags.clear();
    this.upNext.clear();
    this.last.clear();
  }
}
