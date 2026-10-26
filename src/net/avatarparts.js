/*
 * avatarparts.js: where each avatar part sits in assets/avatar/parts.png.
 *
 * Generated, not written: the parts were cut from the owner's Grok sheets of
 * 25 October 2026 and packed by the thread's pack2x.py (NOTICE, "Pilot
 * avatars"). Every part is at the portrait's unit, a head 300 px wide.
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

export const ATLAS_SIZE = [2048, 3913];
export const UNIT = 300;
export const PARTS = {
  'eyes-bright-calm': { group: 'eyes', rect: [562, 3357, 244, 162], anchor: [123.66, 113.26] },
  'eyes-bright-calm2': { group: 'eyes', rect: [810, 3357, 239, 161], anchor: [120.2, 113.26] },
  'eyes-bright-calm3': { group: 'eyes', rect: [0, 3529, 242, 142], anchor: [122.51, 98.24] },
  'eyes-bright-fierce': { group: 'eyes', rect: [1270, 3675, 246, 112], anchor: [120.2, 71.66] },
  'eyes-bright-fierce2': { group: 'eyes', rect: [798, 3675, 244, 117], anchor: [119.62, 72.81] },
  'eyes-bright-happy': { group: 'eyes', rect: [1355, 3529, 247, 133], anchor: [125.4, 92.46] },
  'eyes-bright-laugh': { group: 'eyes', rect: [491, 3675, 232, 119], anchor: [115.57, 97.08] },
  'eyes-bright-oops': { group: 'eyes', rect: [0, 3675, 240, 128], anchor: [119.62, 87.84] },
  'eyes-bright-oops2': { group: 'eyes', rect: [1606, 3529, 242, 133], anchor: [120.2, 90.15] },
  'eyes-bright-smug': { group: 'eyes', rect: [1475, 3357, 246, 144], anchor: [122.51, 98.24] },
  'eyes-bright-wink': { group: 'eyes', rect: [840, 3529, 262, 138], anchor: [128.29, 97.08] },
  'eyes-round-surprised': { group: 'eyes', rect: [345, 3357, 213, 165], anchor: [105.75, 113.26] },
  'eyes-round-surprised2': { group: 'eyes', rect: [1053, 3357, 207, 159], anchor: [102.86, 115.57] },
  'eyes-round-surprised3': { group: 'eyes', rect: [1264, 3357, 207, 157], anchor: [102.86, 110.95] },
  'eyes-sleepy-calm': { group: 'eyes', rect: [1106, 3529, 245, 134], anchor: [124.24, 99.39] },
  'eyes-sleepy-calm2': { group: 'eyes', rect: [574, 3529, 262, 140], anchor: [128.29, 104.02] },
  'eyes-sleepy-calm3': { group: 'eyes', rect: [244, 3675, 243, 128], anchor: [120.77, 92.46] },
  'eyes-sleepy-happy': { group: 'eyes', rect: [1725, 3357, 235, 142], anchor: [116.73, 105.17] },
  'eyes-sleepy-smug': { group: 'eyes', rect: [0, 3807, 243, 106], anchor: [119.62, 69.34] },
  'hair-bob': { group: 'hair', rect: [1087, 1827, 503, 625], frame: { top: 32.88, chin: 618.49, width: 300.0, cx: 249.64 } },
  'hair-buns': { group: 'hair', rect: [557, 1827, 526, 629], frame: { top: 65.75, chin: 651.37, width: 300.0, cx: 261.39 } },
  'hair-buzz': { group: 'hair', rect: [956, 2495, 384, 370], frame: { top: 18.49, chin: 604.11, width: 300.0, cx: 190.46 } },
  'hair-long': { group: 'hair', rect: [0, 0, 530, 1052], frame: { top: 30.82, chin: 616.44, width: 300.0, cx: 262.02 } },
  'hair-messy': { group: 'hair', rect: [0, 1827, 553, 664], frame: { top: 82.19, chin: 667.81, width: 300.0, cx: 285.23 } },
  'hair-ponytail': { group: 'hair', rect: [1097, 0, 493, 865], frame: { top: 90.41, chin: 676.03, width: 300.0, cx: 211.42 } },
  'hair-spiky': { group: 'hair', rect: [0, 2495, 538, 514], frame: { top: 131.51, chin: 717.12, width: 300.0, cx: 272.47 } },
  'hair-twintails': { group: 'hair', rect: [534, 0, 559, 1032], frame: { top: 14.38, chin: 600.0, width: 300.0, cx: 277.88 } },
  'head-oval': { group: 'head', rect: [953, 1056, 457, 731], frame: { top: 9.15, chin: 442.37, width: 300.0, cx: 227.83 } },
  'head-round': { group: 'head', rect: [1414, 1056, 443, 693], frame: { top: 8.85, chin: 402.3, width: 300.0, cx: 217.85 } },
  'head-sharp': { group: 'head', rect: [487, 1056, 462, 739], frame: { top: 9.28, chin: 445.36, width: 300.0, cx: 230.5 } },
  'head-square': { group: 'head', rect: [0, 1056, 483, 767], frame: { top: 9.64, chin: 460.71, width: 300.0, cx: 238.26 } },
  'mark-blush': { group: 'mark', rect: [1103, 3807, 186, 59], anchor: [92.5, 28.84] },
  'mark-dizzy': { group: 'mark', rect: [1852, 3529, 126, 130], anchor: [60.21, 64.67] },
  'mark-lines': { group: 'mark', rect: [768, 3013, 240, 226], anchor: [115.04, 112.07] },
  'mark-note': { group: 'mark', rect: [975, 3807, 60, 73], anchor: [29.68, 36.38] },
  'mark-sparkles': { group: 'mark', rect: [1293, 3807, 126, 54], anchor: [62.66, 26.42] },
  'mark-sweat': { group: 'mark', rect: [923, 3807, 48, 74], anchor: [23.67, 36.67] },
  'mark-vein': { group: 'mark', rect: [1039, 3807, 60, 61], anchor: [29.74, 30.26] },
  'mouth-calm-open': { group: 'mouth', rect: [1893, 3675, 74, 108], anchor: [36.5, 63.0] },
  'mouth-calm-shut': { group: 'mouth', rect: [758, 3807, 79, 81], anchor: [39.0, 70.0] },
  'mouth-calm2-shut': { group: 'mouth', rect: [841, 3807, 78, 81], anchor: [38.5, 69.0] },
  'mouth-grit-open': { group: 'mouth', rect: [1108, 3675, 93, 117], anchor: [46.0, 63.0] },
  'mouth-grit-shut': { group: 'mouth', rect: [467, 3807, 99, 87], anchor: [49.0, 59.0] },
  'mouth-laugh-open': { group: 'mouth', rect: [1520, 3675, 89, 112], anchor: [44.0, 57.0] },
  'mouth-laugh-shut': { group: 'mouth', rect: [354, 3807, 109, 87], anchor: [54.0, 51.0] },
  'mouth-o-open': { group: 'mouth', rect: [1046, 3675, 58, 117], anchor: [28.5, 54.0] },
  'mouth-o-shut': { group: 'mouth', rect: [1205, 3675, 61, 115], anchor: [30.0, 54.0] },
  'mouth-smile-open': { group: 'mouth', rect: [1613, 3675, 90, 111], anchor: [44.5, 59.0] },
  'mouth-smile-shut': { group: 'mouth', rect: [247, 3807, 103, 88], anchor: [51.0, 59.0] },
  'mouth-smirk-open': { group: 'mouth', rect: [1798, 3675, 91, 110], anchor: [45.0, 48.0] },
  'mouth-smirk-shut': { group: 'mouth', rect: [570, 3807, 91, 85], anchor: [45.0, 45.0] },
  'mouth-talk-open': { group: 'mouth', rect: [727, 3675, 67, 118], anchor: [33.0, 52.0] },
  'mouth-wobble-open': { group: 'mouth', rect: [1707, 3675, 87, 111], anchor: [43.0, 64.0] },
  'mouth-wobble-shut': { group: 'mouth', rect: [665, 3807, 89, 82], anchor: [44.0, 64.0] },
  'wear-beanie': { group: 'wear', rect: [0, 3013, 372, 340], frame: { top: 35.03, chin: 507.11, width: 300.0, cx: 169.8 } },
  'wear-cap': { group: 'wear', rect: [376, 3013, 388, 330], frame: { top: 25.89, chin: 497.97, width: 300.0, cx: 160.24 } },
  'wear-fpv': { group: 'wear', rect: [1012, 3013, 349, 210], frame: { top: -18.27, chin: 453.81, width: 300.0, cx: 170.45 } },
  'wear-glasses': { group: 'wear', rect: [246, 3529, 324, 140], frame: { top: -190.36, chin: 281.73, width: 300.0, cx: 144.0 } },
  'wear-goggles': { group: 'wear', rect: [1365, 3013, 364, 195], frame: { top: -15.23, chin: 456.85, width: 300.0, cx: 145.08 } },
  'wear-headband': { group: 'wear', rect: [0, 3357, 341, 168], frame: { top: -65.48, chin: 406.6, width: 300.0, cx: 162.1 } },
  'wear-headphones': { group: 'wear', rect: [542, 2495, 410, 376], frame: { top: 6.09, chin: 478.17, width: 300.0, cx: 192.59 } },
  'wear-scarf': { group: 'wear', rect: [1344, 2495, 373, 370], frame: { top: -383.76, chin: 88.32, width: 300.0, cx: 188.65 } },
};
