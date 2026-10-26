/*
 * avatarparts.js: where each avatar part sits in assets/avatar/parts.png.
 *
 * Generated, not written: the parts were cut from the owner's Grok sheets of
 * 25 October 2026 and packed by the thread's pack.py (NOTICE, "Pilot
 * avatars"). Every part is at the portrait's unit, a head 150 px wide.
 * `rect` is x, y, width, height in the atlas; heads, hair and wear carry the
 * frame of the face they were drawn on (skull top, chin, face width and
 * centre), eyes, mouths and marks an anchor, all in the part's own pixels.
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

export const ATLAS_SIZE = [1024, 1957];
export const UNIT = 150;
export const PARTS = {
  'eyes-bright-calm': { group: 'eyes', rect: [281, 1679, 122, 81], anchor: [61.83, 56.63] },
  'eyes-bright-calm2': { group: 'eyes', rect: [405, 1679, 120, 80], anchor: [60.1, 56.63] },
  'eyes-bright-calm3': { group: 'eyes', rect: [0, 1765, 121, 71], anchor: [61.25, 49.12] },
  'eyes-bright-fierce': { group: 'eyes', rect: [634, 1838, 123, 56], anchor: [60.1, 35.83] },
  'eyes-bright-fierce2': { group: 'eyes', rect: [399, 1838, 122, 58], anchor: [59.81, 36.41] },
  'eyes-bright-happy': { group: 'eyes', rect: [678, 1765, 124, 66], anchor: [62.7, 46.23] },
  'eyes-bright-laugh': { group: 'eyes', rect: [245, 1838, 116, 60], anchor: [57.79, 48.54] },
  'eyes-bright-oops': { group: 'eyes', rect: [0, 1838, 120, 64], anchor: [59.81, 43.92] },
  'eyes-bright-oops2': { group: 'eyes', rect: [804, 1765, 121, 66], anchor: [60.1, 45.07] },
  'eyes-bright-smug': { group: 'eyes', rect: [737, 1679, 123, 72], anchor: [61.25, 49.12] },
  'eyes-bright-wink': { group: 'eyes', rect: [420, 1765, 131, 69], anchor: [64.14, 48.54] },
  'eyes-round-surprised': { group: 'eyes', rect: [173, 1679, 106, 83], anchor: [52.88, 56.63] },
  'eyes-round-surprised2': { group: 'eyes', rect: [527, 1679, 103, 80], anchor: [51.43, 57.79] },
  'eyes-round-surprised3': { group: 'eyes', rect: [632, 1679, 103, 79], anchor: [51.43, 55.48] },
  'eyes-sleepy-calm': { group: 'eyes', rect: [553, 1765, 123, 67], anchor: [62.12, 49.7] },
  'eyes-sleepy-calm2': { group: 'eyes', rect: [287, 1765, 131, 70], anchor: [64.14, 52.01] },
  'eyes-sleepy-calm3': { group: 'eyes', rect: [122, 1838, 121, 64], anchor: [60.39, 46.23] },
  'eyes-sleepy-happy': { group: 'eyes', rect: [862, 1679, 117, 71], anchor: [58.36, 52.59] },
  'eyes-sleepy-smug': { group: 'eyes', rect: [0, 1904, 121, 53], anchor: [59.81, 34.67] },
  'hair-bob': { group: 'hair', rect: [543, 914, 252, 312], frame: { top: 16.44, chin: 309.25, width: 150, cx: 124.82 } },
  'hair-buns': { group: 'hair', rect: [278, 914, 263, 314], frame: { top: 32.88, chin: 325.68, width: 150, cx: 130.7 } },
  'hair-buzz': { group: 'hair', rect: [478, 1248, 192, 185], frame: { top: 9.25, chin: 302.05, width: 150, cx: 95.23 } },
  'hair-long': { group: 'hair', rect: [0, 0, 265, 526], frame: { top: 15.41, chin: 308.22, width: 150, cx: 131.01 } },
  'hair-messy': { group: 'hair', rect: [0, 914, 276, 332], frame: { top: 41.1, chin: 333.9, width: 150, cx: 142.61 } },
  'hair-ponytail': { group: 'hair', rect: [548, 0, 247, 433], frame: { top: 45.21, chin: 338.01, width: 150, cx: 105.71 } },
  'hair-spiky': { group: 'hair', rect: [0, 1248, 269, 257], frame: { top: 65.75, chin: 358.56, width: 150, cx: 136.24 } },
  'hair-twintails': { group: 'hair', rect: [267, 0, 279, 516], frame: { top: 7.19, chin: 300.0, width: 150, cx: 138.94 } },
  'head-oval': { group: 'head', rect: [477, 528, 228, 366], frame: { top: 4.58, chin: 221.19, width: 150, cx: 113.92 } },
  'head-round': { group: 'head', rect: [707, 528, 221, 347], frame: { top: 4.43, chin: 201.15, width: 150, cx: 108.92 } },
  'head-sharp': { group: 'head', rect: [244, 528, 231, 370], frame: { top: 4.64, chin: 222.68, width: 150, cx: 115.25 } },
  'head-square': { group: 'head', rect: [0, 528, 242, 384], frame: { top: 4.82, chin: 230.36, width: 150, cx: 119.13 } },
  'mark-blush': { group: 'mark', rect: [552, 1904, 93, 29], anchor: [46.25, 14.42] },
  'mark-dizzy': { group: 'mark', rect: [927, 1765, 63, 65], anchor: [30.11, 32.34] },
  'mark-lines': { group: 'mark', rect: [384, 1507, 120, 113], anchor: [57.52, 56.03] },
  'mark-note': { group: 'mark', rect: [488, 1904, 30, 37], anchor: [14.84, 18.19] },
  'mark-sparkles': { group: 'mark', rect: [647, 1904, 63, 27], anchor: [31.33, 13.21] },
  'mark-sweat': { group: 'mark', rect: [462, 1904, 24, 37], anchor: [11.83, 18.33] },
  'mark-vein': { group: 'mark', rect: [520, 1904, 30, 31], anchor: [14.87, 15.13] },
  'mouth-calm-open': { group: 'mouth', rect: [946, 1838, 37, 54], anchor: [18.25, 31.5] },
  'mouth-calm-shut': { group: 'mouth', rect: [379, 1904, 40, 40], anchor: [19.5, 35.0] },
  'mouth-calm2-shut': { group: 'mouth', rect: [421, 1904, 39, 40], anchor: [19.25, 34.5] },
  'mouth-grit-open': { group: 'mouth', rect: [586, 1838, 46, 58], anchor: [23.0, 31.5] },
  'mouth-grit-shut': { group: 'mouth', rect: [233, 1904, 50, 44], anchor: [24.5, 29.5] },
  'mouth-laugh-open': { group: 'mouth', rect: [806, 1838, 44, 56], anchor: [22.0, 28.5] },
  'mouth-laugh-shut': { group: 'mouth', rect: [177, 1904, 54, 44], anchor: [27.0, 25.5] },
  'mouth-o-open': { group: 'mouth', rect: [555, 1838, 29, 58], anchor: [14.25, 27.0] },
  'mouth-o-shut': { group: 'mouth', rect: [523, 1838, 30, 58], anchor: [15.0, 27.0] },
  'mouth-smile-open': { group: 'mouth', rect: [759, 1838, 45, 56], anchor: [22.25, 29.5] },
  'mouth-smile-shut': { group: 'mouth', rect: [123, 1904, 52, 44], anchor: [25.5, 29.5] },
  'mouth-smirk-open': { group: 'mouth', rect: [898, 1838, 46, 55], anchor: [22.5, 24.0] },
  'mouth-smirk-shut': { group: 'mouth', rect: [285, 1904, 46, 42], anchor: [22.5, 22.5] },
  'mouth-talk-open': { group: 'mouth', rect: [363, 1838, 34, 59], anchor: [16.5, 26.0] },
  'mouth-wobble-open': { group: 'mouth', rect: [852, 1838, 44, 56], anchor: [21.5, 32.0] },
  'mouth-wobble-shut': { group: 'mouth', rect: [333, 1904, 44, 41], anchor: [22.0, 32.0] },
  'wear-beanie': { group: 'wear', rect: [0, 1507, 186, 170], frame: { top: 17.51, chin: 253.55, width: 150, cx: 84.9 } },
  'wear-cap': { group: 'wear', rect: [188, 1507, 194, 165], frame: { top: 12.94, chin: 248.98, width: 150, cx: 80.12 } },
  'wear-fpv': { group: 'wear', rect: [506, 1507, 174, 105], frame: { top: -9.14, chin: 226.9, width: 150, cx: 85.23 } },
  'wear-glasses': { group: 'wear', rect: [123, 1765, 162, 70], frame: { top: -95.18, chin: 140.86, width: 150, cx: 72.0 } },
  'wear-goggles': { group: 'wear', rect: [682, 1507, 182, 97], frame: { top: -7.61, chin: 228.43, width: 150, cx: 72.54 } },
  'wear-headband': { group: 'wear', rect: [0, 1679, 171, 84], frame: { top: -32.74, chin: 203.3, width: 150, cx: 81.05 } },
  'wear-headphones': { group: 'wear', rect: [271, 1248, 205, 188], frame: { top: 3.05, chin: 239.09, width: 150, cx: 96.29 } },
  'wear-scarf': { group: 'wear', rect: [672, 1248, 187, 185], frame: { top: -191.88, chin: 44.16, width: 150, cx: 94.32 } },
};
