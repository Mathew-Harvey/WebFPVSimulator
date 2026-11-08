/*
 * infectrules.js: the rules of Infected (./infected.js) and nothing else,
 * so the waiting room page (src/ui/dogfightpages.js askInfected) can read
 * and check them without fetching the round and its bots, which are most
 * of the game's bytes and are wanted only once a round is flown.
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

import { BOT_NAMES } from './dogfight.js';

/* Sixteen pilots: the pilot and fifteen bots, or a room's sixteen. */
export const CAP = 16;
export const MAX_BOTS = CAP - 1;

/* The owner's three, by his words: easy, medium and hard. The bots'
 * numbers for each are ./infectbots.js INFECT_BOTS, in the same order. */
export const SKILLS = ['easy', 'medium', 'hard'];

export const ROUNDS = {
  '2m': 120000,
  '3m': 180000,
  '5m': 300000,
};
export const HEADS = [5, 10, 15];
export const FIRSTS = ['random', 'me', 'bot'];

/* Fifteen made up names: the dogfight's seven and eight more, in the
 * menus' capitals. */
export const INFECT_NAMES = [...BOT_NAMES, 'DANGO', 'KIWI', 'SORA', 'BEANS', 'YUZU', 'TAKO', 'NOODLE', 'PEBBLE'];

/* The rules, every field checked. skills: one per bot seat, the owner's
 * easy, medium or hard; `skill` fills any seat without one. */
export function normaliseInfectedRules(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const one = SKILLS.includes(r.skill) ? r.skill : 'medium';
  const skills = [];
  for (let s = 0; s < MAX_BOTS; s += 1) {
    const v = Array.isArray(r.skills) ? r.skills[s] : null;
    skills.push(SKILLS.includes(v) ? v : one);
  }
  return {
    game: 'infected',
    bots: Number.isInteger(r.bots) ? Math.max(1, Math.min(MAX_BOTS, r.bots)) : 7,
    skills,
    round: has(ROUNDS, r.round) ? r.round : '3m',
    head: HEADS.includes(r.head) ? r.head : 10,
    first: FIRSTS.includes(r.first) ? r.first : 'random',
  };
}
