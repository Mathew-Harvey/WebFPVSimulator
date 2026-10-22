/*
 * clips-check.js: the voice clips (src/render/clips.js) proved in plain
 * Node, with a stand-in for the audio element. No sound card, no browser.
 *
 *   1. files     every clip a set names is a file under assets/voices, no
 *                file is left unnamed, and the lot is small (it is fetched
 *                by the visitor, one clip at a time)
 *   2. sticker   a find plays a clip, the next find a different one, a whole
 *                bag goes by before any repeats, and the next clip's fetch
 *                starts while this one plays
 *   3. cues      Nick's crash, hit and landing play their own recording,
 *                a cue is quiet inside its cooldown, a find cuts a line he
 *                was saying and a line does not cut a find
 *   4. quiet     no volume, a set that does not exist, or a page nobody has
 *                touched: nothing plays, nothing throws
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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClipVoice, CLIP_SETS } from '../src/render/clips.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'voices');
let failed = 0;
function ok(cond, what) {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) {
    failed += 1;
  }
}

/* 1. files */
let total = 0;
for (const [set, def] of Object.entries(CLIP_SETS)) {
  const named = new Set([...def.sticker, ...(def.near || []), ...Object.values(def.cues || {})]);
  const onDisk = new Set(fs.readdirSync(path.join(root, set)).map((f) => f.replace(/\.mp3$/, '')));
  ok([...named].every((n) => (n.includes('/') ? fs.existsSync(path.join(root, `${n}.mp3`)) : onDisk.has(n))), `${set}: every named clip is a file`);
  ok([...onDisk].every((n) => named.has(n)), `${set}: every file is named by a cue or the sticker pool`);
  ok([...named].every((n) => typeof def.says[n] === 'string'), `${set}: every clip has its words written down`);
  for (const n of onDisk) {
    const size = fs.statSync(path.join(root, set, `${n}.mp3`)).size;
    total += size;
    ok(size < 45000, `${set}/${n}.mp3 is ${size} bytes, under 45000`);
  }
}
ok(total < 400000, `all clips together ${total} bytes, under 400000`);

function rig() {
  const made = [];
  let t = 0;
  const v = new ClipVoice({
    make: (url) => {
      const el = {
        url, preload: '', volume: 1, currentTime: 0, paused: true, ended: false, plays: 0,
        play() { this.paused = false; this.plays += 1; return Promise.resolve(); },
        pause() { this.paused = true; },
      };
      made.push(el);
      return el;
    },
    now: () => t,
  });
  return { v, made, tick: (ms) => { t += ms; } };
}
const base = globalThis.navigator;

/* 2. sticker */
{
  const { v, made } = rig();
  v.warm('jb');
  ok(made.length === 1, 'warm fetches exactly one clip ahead');
  const first = v.play('jb', 'sticker', 0.8);
  ok(first && made[0].url.endsWith(`/jb/${first}.mp3`) && made[0].plays === 1, 'a find plays the clip fetched ahead');
  ok(made.length === 2, 'the next find\'s clip is fetched while this one plays');
  const seen = [first];
  for (let i = 1; i < CLIP_SETS.jb.sticker.length; i += 1) {
    v.playing.el.paused = true;
    seen.push(v.play('jb', 'sticker', 0.8));
  }
  ok(new Set(seen).size === CLIP_SETS.jb.sticker.length, 'a whole bag of finds plays every clip once');
  v.playing.el.paused = true;
  const again = v.play('jb', 'sticker', 0.8);
  ok(again !== seen[seen.length - 1], 'the first of the next bag is not the last of this one');
}

/* 3. cues */
{
  const { v, tick } = rig();
  ok(v.play('nb', 'crash', 1) === 'crash', 'a crash plays the crash laugh');
  tick(5000);
  ok(v.play('nb', 'crash', 1) === null, 'a second crash inside the cooldown is quiet');
  tick(20000);
  v.playing.el.paused = true;
  ok(v.play('nb', 'hit', 1) === 'holy-catfish', 'a hit plays Holy catfish');
  ok(v.play('nb', 'near', 1) === null, 'a passing line does not cut a hit');
  ok(typeof v.play('nb', 'sticker', 1) === 'string' && CLIP_SETS.nb.sticker.includes(v.playing.name), 'a find cuts a cue and plays from the sticker pool');
  v.playing.el.paused = true;
  ok(v.play('nb', 'landed', 1) === 'just-right', 'a landing plays Get it just right');
  v.playing.el.paused = true;
  const near = v.play('nb', 'near', 1);
  ok(CLIP_SETS.nb.near.includes(near), 'within a metre of him plays one of his other lines');
  ok(v.play('nb', 'sticker', 1) === 'stickers', 'a sticker find on his map is always Stickers');
  ok(v.play('nb', 'nonsense', 1) === null, 'an unknown cue plays nothing');
}

/* 4. quiet */
{
  const { v } = rig();
  ok(v.play('jb', 'sticker', 0) === null, 'volume 0 plays nothing');
  ok(v.play('nope', 'sticker', 1) === null, 'an unknown set plays nothing');
  Object.defineProperty(globalThis, 'navigator', { value: { userActivation: { hasBeenActive: false } }, configurable: true });
  ok(v.play('jb', 'sticker', 1) === null, 'a page nobody has touched plays nothing');
  Object.defineProperty(globalThis, 'navigator', { value: base, configurable: true });
  const none = new ClipVoice({ make: null });
  ok(none.usable === (typeof globalThis.Audio === 'function'), 'no audio element, no voice');
  const bad = new ClipVoice({ make: () => { throw new Error('no'); } });
  ok(bad.play('jb', 'sticker', 1) === null, 'an element that will not be made is silence, not an exception');
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
