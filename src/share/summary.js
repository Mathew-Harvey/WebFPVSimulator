/*
 * summary.js: the name of the course this browser will fly, without
 * building it.
 *
 * The title menu and the map cards need a name. They must not import the
 * custom map, because that pulls the renderer. This file reads the two
 * seats the custom map reads, share import then builder autosave, and
 * hands back a summary.
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

import { inspectCourse } from './listing.js';

export function activeCourseSummary() {
  try {
    const course = inspectCourse();
    if (!course || course.kind === 'none' || !course.doc) {
      return null;
    }
    return course;
  } catch (e) {
    return null;
  }
}
