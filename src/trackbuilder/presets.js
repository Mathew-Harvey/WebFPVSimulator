/*
 * presets.js: the tracks that ship with the builder, and nothing else.
 *
 * Copyright (C) 2026 WebFPVSimulator contributors
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

/*
 * THE RaceGOW5 SET, AND WHAT IT IS AND IS NOT.
 *
 * RaceGOW is a home whoop racing series: everybody builds the same track
 * out of the same 1.05 in pipe kit in their own living room and flies it
 * against the same leaderboard. racegow.com/tracks publishes eight tracks
 * for RaceGOW5, each with its own designer and its own sponsor.
 *
 * These are RECONSTRUCTIONS, not the official layouts, and the difference
 * matters enough to say twice. The site publishes each track as ONE
 * isometric render and nothing else: no gate list, no dimensions, no room
 * size, no downloadable layout. What a render gives you is the topology,
 * which structures there are and roughly where they sit relative to each
 * other, which one carries the green start banner, and which way the arrow
 * points. It does not give you a position in metres.
 *
 * So the topology here is read from the official diagrams and the SPACING
 * is RaceGOW's own published rulebook: 28 in gate openings, 30 in nominal
 * centres, 14 in minimum from a pole to a gate, 36 in between poles, all
 * of it already in src/trackbuilder/racegow.js. That is the most defensible
 * reading available, and it is still a reading. A pilot who has flown the
 * real thing will find these close in shape and wrong in detail.
 *
 * THE INVENTORY IS THE RENDER'S. Each track carries exactly the structures
 * its render shows and no more: Track 7 lost a gate that was never there,
 * Track 8 got back the tall pole that was, Track 6 became four gates and
 * two poles with one gate turned across the run. Poles come in two heights
 * because the renders draw two, one about a gate high and one full height,
 * and a pole the wrong height is as wrong as a pole in the wrong place.
 *
 * EVERY GATE FACES ALONG AN AXIS. The angle between any two gates is a
 * multiple of 90 degrees, because a RaceGOW kit is straight pipe and right
 * angle fittings and there is no diagonal fitting. A pass here built three
 * of these tracks with gates 26 degrees off the axis, and every rule in
 * racegow.js passed them because none of the eight was about heading. There
 * are nine now and warnings.js enforces it. Where a render shows a gate
 * near edge on, that is a gate at a RIGHT ANGLE to the run rather than a
 * gate on the diagonal, and Tracks 2, 4 and 8 are Ls because of it.
 *
 * A GATE STANDS UP OR IT LIES FLAT. Every RaceGOW aperture is vertical
 * except the Horizontal Gate, which the rules also call a Cube Gate: the
 * same square opening laid flat, at 900 mm for a whoop, flown down
 * through. A pass over these tracks invented leaning gates at 0.34 to 0.40
 * rad, which was an isometric render read wrong: a vertical gate turned in
 * YAW draws as a parallelogram and looks like it leans. The lean is now
 * yaw, where it belonged, and micro-check fails on any pitch that is
 * neither 0 nor a dive gate's right angle.
 *
 * A SECOND READING PUT THREE THINGS BACK that the first one missed, and
 * they are named here because they are the difference between a layout that
 * merely has the right count of gates and one that is the right shape. The
 * long horizontal rails: several of these tracks are built around a bar at
 * knee or head height that a pilot goes over or under, and the first pass
 * had none of them. And Track 7 is built around the Cube Gate, a square
 * opening laid flat, rather than a row.
 *
 * Tracks 3 and 5 are absent because their diagrams were not to hand.
 *
 * CREDIT GOES TO THE DESIGNER, one per track, as the site names them. The
 * series and the person who brought the set over are recorded separately.
 * Crediting seven people's work to one importer would be a lie, and a
 * public board is exactly where that would matter.
 */
export const PRESETS = [
  {
    "schemaVersion": 3,
    "id": "racegow5-track1",
    "name": "RaceGOW5 Track 1",
    "createdUtc": "2026-09-07T00:00:00Z",
    "modifiedUtc": "2026-09-07T00:00:00Z",
    "trackClass": "micro",
    "credit": {
      "designer": "Skittles",
      "series": "RaceGOW5",
      "sponsor": "EMAX",
      "source": "racegow.com/tracks",
      "broughtOverBy": "andAgainFPV"
    },
    "field": {
      "width": 10,
      "depth": 12,
      "gridSize": 0.0254
    },
    "settings": {
      "tangentScale": 1.1,
      "minCurveRadius": 0.45,
      "samplesPerSegment": 48
    },
    "branding": {
      "logos": []
    },
    "elements": [
      {
        "id": "el-1",
        "type": "startPads",
        "name": "",
        "position": {
          "x": 5,
          "y": 4.86,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "pads": 1,
          "spacing": 0.3,
          "padSize": 0.1
        }
      },
      {
        "id": "el-2",
        "type": "gate",
        "name": "",
        "position": {
          "x": 5,
          "y": 5.46,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "levels": 1,
          "sillH": 0,
          "clearW": 0.7111999999999999,
          "clearH": 0.7111999999999999,
          "levelPitch": 0.762
        }
      },
      {
        "id": "el-3",
        "type": "gate",
        "name": "",
        "position": {
          "x": 4.62,
          "y": 6.16,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "levels": 1,
          "sillH": 0,
          "clearW": 0.7111999999999999,
          "clearH": 0.7111999999999999,
          "levelPitch": 0.762
        }
      },
      {
        "id": "el-4",
        "type": "pole",
        "name": "",
        "position": {
          "x": 5,
          "y": 6.72,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "height": 1.5,
          "poleRadius": 0.013335,
          "clearance": 0.35559999999999997
        }
      },
      {
        "id": "el-5",
        "type": "doubleStack",
        "name": "",
        "position": {
          "x": 5.38,
          "y": 6.16,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "levels": 2,
          "sillH": 0,
          "clearW": 0.7111999999999999,
          "clearH": 0.7111999999999999,
          "levelPitch": 0.762
        }
      },
      {
        "id": "el-6",
        "type": "horizontalPole",
        "name": "",
        "position": {
          "x": 4.24,
          "y": 6.16,
          "z": 1.1
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "width": 0.76,
          "depth": 0.02667,
          "height": 0.02667
        }
      }
    ],
    "sequence": [
      {
        "id": "sq-1",
        "elementId": "el-2",
        "apertureIndex": 0,
        "entry": 1,
        "passSide": null,
        "clearance": null,
        "overridden": false
      },
      {
        "id": "sq-2",
        "elementId": "el-3",
        "apertureIndex": 0,
        "entry": 1,
        "passSide": null,
        "clearance": null,
        "overridden": false
      },
      {
        "id": "sq-3",
        "elementId": "el-4",
        "apertureIndex": null,
        "entry": null,
        "passSide": "left",
        "clearance": 0.35559999999999997,
        "overridden": false
      },
      {
        "id": "sq-4",
        "elementId": "el-5",
        "apertureIndex": 0,
        "entry": -1,
        "passSide": null,
        "clearance": null,
        "overridden": false
      }
    ]
  },
  {
    "schemaVersion": 3,
    "id": "racegow5-track2",
    "name": "RaceGOW5 Track 2",
    "createdUtc": "2026-09-07T00:00:00Z",
    "modifiedUtc": "2026-09-07T00:00:00Z",
    "trackClass": "micro",
    "credit": {
      "designer": "Skittles",
      "series": "RaceGOW5",
      "sponsor": "Happymodel",
      "source": "racegow.com/tracks",
      "broughtOverBy": "andAgainFPV"
    },
    "field": {
      "width": 10,
      "depth": 12,
      "gridSize": 0.0254
    },
    "settings": {
      "tangentScale": 1.1,
      "minCurveRadius": 0.45,
      "samplesPerSegment": 48
    },
    "branding": {
      "logos": []
    },
    "elements": [
      {
        "id": "el-1",
        "type": "startPads",
        "name": "",
        "position": {
          "x": 4.05,
          "y": 5.3,
          "z": 0
        },
        "yaw": 0,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "pads": 1,
          "spacing": 0.3,
          "padSize": 0.1
        }
      },
      {
        "id": "el-2",
        "type": "gate",
        "name": "",
        "position": {
          "x": 4.62,
          "y": 5.3,
          "z": 0
        },
        "yaw": 0,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "levels": 1,
          "sillH": 0,
          "clearW": 0.7111999999999999,
          "clearH": 0.7111999999999999,
          "levelPitch": 0.762
        }
      },
      {
        "id": "el-3",
        "type": "horizontalPole",
        "name": "",
        "position": {
          "x": 5.2,
          "y": 5.3,
          "z": 0.6
        },
        "yaw": 0,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "width": 1.45,
          "depth": 0.02667,
          "height": 0.02667
        }
      },
      {
        "id": "el-4",
        "type": "gate",
        "name": "",
        "position": {
          "x": 5.42,
          "y": 6.1,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "levels": 1,
          "sillH": 0,
          "clearW": 0.7111999999999999,
          "clearH": 0.7111999999999999,
          "levelPitch": 0.762
        }
      },
      {
        "id": "el-5",
        "type": "gate",
        "name": "",
        "position": {
          "x": 5.42,
          "y": 6.8,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "levels": 1,
          "sillH": 0,
          "clearW": 0.7111999999999999,
          "clearH": 0.7111999999999999,
          "levelPitch": 0.762
        }
      },
      {
        "id": "el-6",
        "type": "horizontalPole",
        "name": "",
        "position": {
          "x": 4.92,
          "y": 6.8,
          "z": 1.45
        },
        "yaw": 0,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "width": 1,
          "depth": 0.02667,
          "height": 0.02667
        }
      },
      {
        "id": "el-7",
        "type": "pole",
        "name": "",
        "position": {
          "x": 4.78,
          "y": 6.45,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "height": 1.5,
          "poleRadius": 0.013335,
          "clearance": 0.35559999999999997
        }
      }
    ],
    "sequence": [
      {
        "id": "sq-1",
        "elementId": "el-2",
        "apertureIndex": 0,
        "entry": 1,
        "passSide": null,
        "clearance": null,
        "overridden": false
      },
      {
        "id": "sq-2",
        "elementId": "el-4",
        "apertureIndex": 0,
        "entry": 1,
        "passSide": null,
        "clearance": null,
        "overridden": false
      },
      {
        "id": "sq-3",
        "elementId": "el-5",
        "apertureIndex": 0,
        "entry": -1,
        "passSide": null,
        "clearance": null,
        "overridden": false
      },
      {
        "id": "sq-4",
        "elementId": "el-7",
        "apertureIndex": null,
        "entry": null,
        "passSide": "right",
        "clearance": 0.35559999999999997,
        "overridden": false
      }
    ]
  },
  {
    "schemaVersion": 3,
    "id": "racegow5-track4",
    "name": "RaceGOW5 Track 4",
    "createdUtc": "2026-09-07T00:00:00Z",
    "modifiedUtc": "2026-09-07T00:00:00Z",
    "trackClass": "micro",
    "credit": {
      "designer": "SanderPuh",
      "series": "RaceGOW5",
      "sponsor": "Liftoff Micro Drones",
      "source": "racegow.com/tracks",
      "broughtOverBy": "andAgainFPV"
    },
    "field": {
      "width": 10,
      "depth": 12,
      "gridSize": 0.0254
    },
    "settings": {
      "tangentScale": 1.1,
      "minCurveRadius": 0.45,
      "samplesPerSegment": 48
    },
    "branding": {
      "logos": []
    },
    "elements": [
      {
        "id": "el-1",
        "type": "startPads",
        "name": "",
        "position": {
          "x": 4.05,
          "y": 5.2,
          "z": 0
        },
        "yaw": 0,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "pads": 1,
          "spacing": 0.3,
          "padSize": 0.1
        }
      },
      {
        "id": "el-2",
        "type": "gate",
        "name": "",
        "position": {
          "x": 4.62,
          "y": 5.2,
          "z": 0
        },
        "yaw": 0,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "levels": 1,
          "sillH": 0,
          "clearW": 0.7111999999999999,
          "clearH": 0.7111999999999999,
          "levelPitch": 0.762
        }
      },
      {
        "id": "el-3",
        "type": "horizontalPole",
        "name": "",
        "position": {
          "x": 5,
          "y": 5.76,
          "z": 0.55
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "width": 1.45,
          "depth": 0.02667,
          "height": 0.02667
        }
      },
      {
        "id": "el-4",
        "type": "gate",
        "name": "",
        "position": {
          "x": 4.62,
          "y": 6.32,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "levels": 1,
          "sillH": 0,
          "clearW": 0.7111999999999999,
          "clearH": 0.7111999999999999,
          "levelPitch": 0.762
        }
      },
      {
        "id": "el-5",
        "type": "pole",
        "name": "",
        "position": {
          "x": 5,
          "y": 6.32,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "height": 1.5,
          "poleRadius": 0.013335,
          "clearance": 0.35559999999999997
        }
      },
      {
        "id": "el-6",
        "type": "gate",
        "name": "",
        "position": {
          "x": 5.38,
          "y": 6.32,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "levels": 1,
          "sillH": 0,
          "clearW": 0.7111999999999999,
          "clearH": 0.7111999999999999,
          "levelPitch": 0.762
        }
      }
    ],
    "sequence": [
      {
        "id": "sq-1",
        "elementId": "el-2",
        "apertureIndex": 0,
        "entry": 1,
        "passSide": null,
        "clearance": null,
        "overridden": false
      },
      {
        "id": "sq-2",
        "elementId": "el-4",
        "apertureIndex": 0,
        "entry": 1,
        "passSide": null,
        "clearance": null,
        "overridden": false
      },
      {
        "id": "sq-3",
        "elementId": "el-5",
        "apertureIndex": null,
        "entry": null,
        "passSide": "left",
        "clearance": 0.35559999999999997,
        "overridden": false
      },
      {
        "id": "sq-4",
        "elementId": "el-6",
        "apertureIndex": 0,
        "entry": -1,
        "passSide": null,
        "clearance": null,
        "overridden": false
      }
    ]
  },
  {
    "schemaVersion": 3,
    "id": "racegow5-track6",
    "name": "RaceGOW5 Track 6",
    "createdUtc": "2026-09-07T00:00:00Z",
    "modifiedUtc": "2026-09-07T00:00:00Z",
    "trackClass": "micro",
    "credit": {
      "designer": "MrE",
      "series": "RaceGOW5",
      "sponsor": "Average Jane & Joes",
      "source": "racegow.com/tracks",
      "broughtOverBy": "andAgainFPV"
    },
    "field": {
      "width": 10,
      "depth": 12,
      "gridSize": 0.0254
    },
    "settings": {
      "tangentScale": 1.1,
      "minCurveRadius": 0.45,
      "samplesPerSegment": 48
    },
    "branding": {
      "logos": []
    },
    "elements": [
      {
        "id": "el-1",
        "type": "startPads",
        "name": "",
        "position": {
          "x": 4.62,
          "y": 4.82,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "pads": 1,
          "spacing": 0.3,
          "padSize": 0.1
        }
      },
      {
        "id": "el-2",
        "type": "gate",
        "name": "",
        "position": {
          "x": 4.62,
          "y": 5.4,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "levels": 1,
          "sillH": 0,
          "clearW": 0.7111999999999999,
          "clearH": 0.7111999999999999,
          "levelPitch": 0.762
        }
      },
      {
        "id": "el-3",
        "type": "gate",
        "name": "",
        "position": {
          "x": 5.4,
          "y": 5.4,
          "z": 0
        },
        "yaw": 0,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "levels": 1,
          "sillH": 0,
          "clearW": 0.7111999999999999,
          "clearH": 0.7111999999999999,
          "levelPitch": 0.762
        }
      },
      {
        "id": "el-4",
        "type": "gate",
        "name": "",
        "position": {
          "x": 5.4,
          "y": 6.16,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "levels": 1,
          "sillH": 0,
          "clearW": 0.7111999999999999,
          "clearH": 0.7111999999999999,
          "levelPitch": 0.762
        }
      },
      {
        "id": "el-5",
        "type": "pole",
        "name": "",
        "position": {
          "x": 5.47,
          "y": 6.9,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "height": 1.5,
          "poleRadius": 0.013335,
          "clearance": 0.35559999999999997
        }
      },
      {
        "id": "el-6",
        "type": "pole",
        "name": "",
        "position": {
          "x": 4.55,
          "y": 6.9,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "height": 0.71,
          "poleRadius": 0.013335,
          "clearance": 0.35559999999999997
        }
      },
      {
        "id": "el-7",
        "type": "gate",
        "name": "",
        "position": {
          "x": 4.62,
          "y": 6.16,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "levels": 1,
          "sillH": 0,
          "clearW": 0.7111999999999999,
          "clearH": 0.7111999999999999,
          "levelPitch": 0.762
        }
      }
    ],
    "sequence": [
      {
        "id": "sq-1",
        "elementId": "el-2",
        "apertureIndex": 0,
        "entry": 1,
        "passSide": null,
        "clearance": null,
        "overridden": false
      },
      {
        "id": "sq-2",
        "elementId": "el-3",
        "apertureIndex": 0,
        "entry": 1,
        "passSide": null,
        "clearance": null,
        "overridden": false
      },
      {
        "id": "sq-3",
        "elementId": "el-4",
        "apertureIndex": 0,
        "entry": 1,
        "passSide": null,
        "clearance": null,
        "overridden": false
      },
      {
        "id": "sq-4",
        "elementId": "el-5",
        "apertureIndex": null,
        "entry": null,
        "passSide": "left",
        "clearance": 0.35559999999999997,
        "overridden": false
      },
      {
        "id": "sq-5",
        "elementId": "el-6",
        "apertureIndex": null,
        "entry": null,
        "passSide": "left",
        "clearance": 0.35559999999999997,
        "overridden": false
      },
      {
        "id": "sq-6",
        "elementId": "el-7",
        "apertureIndex": 0,
        "entry": -1,
        "passSide": null,
        "clearance": null,
        "overridden": false
      }
    ]
  },
  {
    "schemaVersion": 3,
    "id": "racegow5-track7",
    "name": "RaceGOW5 Track 7",
    "createdUtc": "2026-09-07T00:00:00Z",
    "modifiedUtc": "2026-09-07T00:00:00Z",
    "trackClass": "micro",
    "credit": {
      "designer": "FPVBean",
      "series": "RaceGOW5",
      "sponsor": "BetaFPV",
      "source": "racegow.com/tracks",
      "broughtOverBy": "andAgainFPV"
    },
    "field": {
      "width": 10,
      "depth": 12,
      "gridSize": 0.0254
    },
    "settings": {
      "tangentScale": 1.1,
      "minCurveRadius": 0.45,
      "samplesPerSegment": 48
    },
    "branding": {
      "logos": []
    },
    "elements": [
      {
        "id": "el-1",
        "type": "startPads",
        "name": "",
        "position": {
          "x": 4.66,
          "y": 4.98,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "pads": 1,
          "spacing": 0.3,
          "padSize": 0.1
        }
      },
      {
        "id": "el-2",
        "type": "gate",
        "name": "",
        "position": {
          "x": 4.66,
          "y": 5.56,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "levels": 1,
          "sillH": 0,
          "clearW": 0.7111999999999999,
          "clearH": 0.7111999999999999,
          "levelPitch": 0.762
        }
      },
      {
        "id": "el-3",
        "type": "pole",
        "name": "",
        "position": {
          "x": 5.3,
          "y": 5.94,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "height": 1.5,
          "poleRadius": 0.013335,
          "clearance": 0.35559999999999997
        }
      },
      {
        "id": "el-4",
        "type": "gate",
        "name": "",
        "position": {
          "x": 4.66,
          "y": 6.3,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "levels": 1,
          "sillH": 0,
          "clearW": 0.7111999999999999,
          "clearH": 0.7111999999999999,
          "levelPitch": 0.762
        }
      },
      {
        "id": "el-5",
        "type": "diveGate",
        "name": "",
        "position": {
          "x": 5.38,
          "y": 6.66,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 1.5707963267948966,
        "yawOverridden": true,
        "dims": {
          "levels": 1,
          "sillH": 0.9,
          "clearW": 0.7111999999999999,
          "clearH": 0.7111999999999999,
          "levelPitch": 0.762
        }
      },
      {
        "id": "el-6",
        "type": "horizontalPole",
        "name": "",
        "position": {
          "x": 5.38,
          "y": 7.3,
          "z": 0.9
        },
        "yaw": 0,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "width": 1,
          "depth": 0.02667,
          "height": 0.02667
        }
      }
    ],
    "sequence": [
      {
        "id": "sq-1",
        "elementId": "el-2",
        "apertureIndex": 0,
        "entry": 1,
        "passSide": null,
        "clearance": null,
        "overridden": false
      },
      {
        "id": "sq-2",
        "elementId": "el-3",
        "apertureIndex": null,
        "entry": null,
        "passSide": "left",
        "clearance": 0.35559999999999997,
        "overridden": false
      },
      {
        "id": "sq-3",
        "elementId": "el-4",
        "apertureIndex": 0,
        "entry": 1,
        "passSide": null,
        "clearance": null,
        "overridden": false
      },
      {
        "id": "sq-4",
        "elementId": "el-5",
        "apertureIndex": 0,
        "entry": 1,
        "passSide": null,
        "clearance": null,
        "overridden": false
      }
    ]
  },
  {
    "schemaVersion": 3,
    "id": "racegow5-track8",
    "name": "RaceGOW5 Track 8",
    "createdUtc": "2026-09-07T00:00:00Z",
    "modifiedUtc": "2026-09-07T00:00:00Z",
    "trackClass": "micro",
    "credit": {
      "designer": "AyyyKayyy",
      "series": "RaceGOW5",
      "sponsor": "weBLEEDfpv",
      "source": "racegow.com/tracks",
      "broughtOverBy": "andAgainFPV"
    },
    "field": {
      "width": 10,
      "depth": 12,
      "gridSize": 0.0254
    },
    "settings": {
      "tangentScale": 1.1,
      "minCurveRadius": 0.45,
      "samplesPerSegment": 48
    },
    "branding": {
      "logos": []
    },
    "elements": [
      {
        "id": "el-1",
        "type": "startPads",
        "name": "",
        "position": {
          "x": 4.3,
          "y": 5.62,
          "z": 0
        },
        "yaw": 0,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "pads": 1,
          "spacing": 0.3,
          "padSize": 0.1
        }
      },
      {
        "id": "el-2",
        "type": "gate",
        "name": "",
        "position": {
          "x": 4.68,
          "y": 5.62,
          "z": 0
        },
        "yaw": 0,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "levels": 1,
          "sillH": 0,
          "clearW": 0.7111999999999999,
          "clearH": 0.7111999999999999,
          "levelPitch": 0.762
        }
      },
      {
        "id": "el-3",
        "type": "horizontalPole",
        "name": "",
        "position": {
          "x": 5.02,
          "y": 5.62,
          "z": 0.55
        },
        "yaw": 0,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "width": 1.1,
          "depth": 0.02667,
          "height": 0.02667
        }
      },
      {
        "id": "el-4",
        "type": "pole",
        "name": "",
        "position": {
          "x": 5.3,
          "y": 6.14,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "height": 0.71,
          "poleRadius": 0.013335,
          "clearance": 0.35559999999999997
        }
      },
      {
        "id": "el-5",
        "type": "pole",
        "name": "",
        "position": {
          "x": 4.38,
          "y": 6.14,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "height": 0.71,
          "poleRadius": 0.013335,
          "clearance": 0.35559999999999997
        }
      },
      {
        "id": "el-6",
        "type": "gate",
        "name": "",
        "position": {
          "x": 4.84,
          "y": 6.74,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "levels": 1,
          "sillH": 0,
          "clearW": 0.7111999999999999,
          "clearH": 0.7111999999999999,
          "levelPitch": 0.762
        }
      },
      {
        "id": "el-7",
        "type": "pole",
        "name": "",
        "position": {
          "x": 5.44,
          "y": 7.16,
          "z": 0
        },
        "yaw": 1.5707963267948966,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "height": 1.5,
          "poleRadius": 0.013335,
          "clearance": 0.35559999999999997
        }
      },
      {
        "id": "el-8",
        "type": "horizontalPole",
        "name": "",
        "position": {
          "x": 5.14,
          "y": 6.95,
          "z": 1.45
        },
        "yaw": 0,
        "pitch": 0,
        "yawOverridden": true,
        "dims": {
          "width": 0.6,
          "depth": 0.02667,
          "height": 0.02667
        }
      }
    ],
    "sequence": [
      {
        "id": "sq-1",
        "elementId": "el-2",
        "apertureIndex": 0,
        "entry": 1,
        "passSide": null,
        "clearance": null,
        "overridden": false
      },
      {
        "id": "sq-2",
        "elementId": "el-4",
        "apertureIndex": null,
        "entry": null,
        "passSide": "left",
        "clearance": 0.35559999999999997,
        "overridden": false
      },
      {
        "id": "sq-3",
        "elementId": "el-5",
        "apertureIndex": null,
        "entry": null,
        "passSide": "right",
        "clearance": 0.35559999999999997,
        "overridden": false
      },
      {
        "id": "sq-4",
        "elementId": "el-6",
        "apertureIndex": 0,
        "entry": 1,
        "passSide": null,
        "clearance": null,
        "overridden": false
      },
      {
        "id": "sq-5",
        "elementId": "el-7",
        "apertureIndex": null,
        "entry": null,
        "passSide": "left",
        "clearance": 0.35559999999999997,
        "overridden": false
      }
    ]
  }
];

/* Every preset that belongs to a track class, newest first is meaningless
 * here so they stay in the order the series numbers them. */
export function presetsForClass(cls) {
  return PRESETS.filter((d) => d.trackClass === cls);
}

/* The document for a preset id, or null. Returned as a deep copy, because
 * the caller edits what it is given and a shared module constant that the
 * builder mutates would change under every other reader. */
export function presetById(id) {
  const found = PRESETS.find((d) => d.id === id);
  return found ? JSON.parse(JSON.stringify(found)) : null;
}

/* Whether an id names a preset. storage.js uses it to keep a preset out of
 * the delete path and to know that a save is making a copy. */
export function isPresetId(id) {
  return PRESETS.some((d) => d.id === id);
}
