/*
 * sources.mjs: which .trk files become courses, and what they are called.
 *
 * One list, because the converter writes these documents and check.mjs
 * verifies them, and a second copy of the list is how a track quietly stops
 * being checked.
 *
 * The id is derived from the display name so that re-running the converter
 * updates a course rather than publishing a second copy of it. Renaming a
 * track therefore makes a new course, which is the intended behaviour: the
 * board keys edits off the id.
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

import { createHash } from 'node:crypto';

export function trackId(name) {
  return `trk-${createHash('sha256').update(`webfpv.course.${name}`).digest('hex').slice(0, 8)}`;
}

export const TRK_FILES = [
  { file: '2024 WA states aligned ironoid.trk', name: '2024 WA States' },
  { file: 'WA-Global-Drone-Solutions-States-2025.trk', name: '2025 WA States' },
  { file: 'WCMRC Round 5.trk', name: 'WCMRC Round 5' },
  { file: '2023 AU NATS Qualifying Track.trk', name: '2023 AU NATS Qualifying' },
  { file: '2023 AU NATS 5inch.trk', name: '2023 AU NATS 5 inch' },
  { file: '2022 Mission Foods Australian Drone Nationals.trk', name: '2022 AU Nationals' },
  { file: '2023 GQ Scale.trk', name: '2023 MultiGP GQ' },
  { file: 'ROX OPEN 2023.trk', name: 'ROX Open 2023' },
  { file: 'FAI Turkiye Drone Race 2024 Istanbul.trk', name: 'FAI Turkiye 2024' },
].map((spec) => ({ ...spec, id: trackId(spec.name) }));

/* Courses built from a published diagram rather than a .trk. convert.mjs
 * writes these next to the imports, and check.mjs has to walk them too or a
 * flag in a hole on the hand-built 2022 MultiGP GQ never fails a check. */
export const PLAN_TRACKS = [
  { name: '2022 MultiGP GQ' },
].map((spec) => ({ ...spec, id: trackId(spec.name) }));

export const CHECK_TRACKS = [...TRK_FILES, ...PLAN_TRACKS];
