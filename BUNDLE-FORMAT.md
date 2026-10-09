# The track bundle, format 1

A whoop track exported as one zip, for a program to read and a person to build
from. Made by Export bundle in the whoop builder (More menu) or by
`node scripts/trackbundle.js <track.json | preset-id>`. Everything is made in the
browser: no server is involved. Code: `src/trackbuilder/bundle.js` (data, map,
page), `bundlemaker.js` (stills and animation), `zip.js` (the archive).

## Files

The zip is flat, stored (not deflated) and deterministic: the same track and the
same `--now` make the same bytes. Read `bundle.json` first. Find files by `role`
in its `files` list, never by name.

| role | path | what |
| --- | --- | --- |
| (the manifest) | `bundle.json` | everything a program needs, below |
| `document` | `track.json` | the builder's own track document (schemaVersion 3). Opens in the builder and the simulator as it is |
| `map` | `map.svg` | route map from above, north up, line coloured by height, passes numbered, start marked |
| `view-route`, `view-obstacles` | `views/<id>-route.png`, `views/<id>-obstacles.png` | 800 by 500 stills of the room, with the line and without it |
| `lap` | `lap.gif` | one lap, looping (384 by 240 or 640 by 400) |
| `instructions` | `instructions.html` | standalone page: lap table, pictures, build plan, parts to buy |

`lap.gif` and the `views/` files are optional (a weak computer can skip them);
`files` lists only what is present, and a view whose picture is absent has `null`
for that path.

## bundle.json

`format` is `"webfpv.track-bundle"` and `formatVersion` is `1`. A reader must
refuse a higher version. New optional keys may appear without a version change.

All lengths are metres, angles radians. Frame: x east, y north, z up, right
handed; a yaw is counter clockwise from east. Coordinates are the document's,
unless a key says "build".

- `track`: `id`, `name`, `class` (`micro` is a whoop room), `schemaVersion`, `modifiedUtc`, `credit` (designer, series, sponsor, source or null).
- `room`: `widthM`, `depthM`, `heightM`.
- `lap`: `closed`, `lengthM`, `gateCount`, `lapsCounted` (3 on a whoop: RaceGOW's fastest three consecutive laps; null elsewhere), `tightest` (`radiusM`, `lapDistanceM`).
- `gates[]`, in flying order, waypoints left out: `number` (one based), `elementId`, `type`, `label`, `pass` (`aperture` or `marker`), `apertureIndex` (level of a stack), `position`, `yawRad`, `pitchRad`, `opening` (`widthM`, `heightM`, `sillM`; null for a marker), `passPoint` (where the line crosses it), `direction` (unit vector the quad is going), `lapDistanceM` (distance round the lap at the pass). A gate flown more than once has one row per pass.
- `route`: `closed`, `spacingM` (0.1), `lengthM`, `points`: `[x, y, z]` every `spacingM` along the line, first gate round to first gate again, so point `i` is at distance `i * spacingM` (the last gap may be a little different, as `lengthM / n`).
- `build`: `cornerFrom` (the south west corner of the smallest rectangle holding the pieces), `originM` (subtract it from a document x, y to get a build sheet measurement), `boundsM`, `gateOpeningM`, `pipeOutsideDiameterM`, `pieces[]` (`key`, `numbers`, `type`, `label`, `xM`, `yM` from the corner, `heights`, `faces`, `frameRuns`, `note`, `elementIds`), `parts` (`sections`, `cuts`, `fittings`, `poles`, `bars`, `other`), `notes`.
- `views[]`: `id`, `label`, `azimuthDeg` (from the middle of the track to the camera, counter clockwise from east), `elevationDeg`, `route`, `obstacles`.
- `files[]`: `role`, `path`, `type`, `bytes`, `crc32` (lower case hex, zip's CRC-32). `bundle.json` is not in its own list.

## What the numbers are

The line is the builder's racing line, `buildPath(doc, { closeLoop: true })`,
the same one the builder draws and the lap animation flies. The pieces and parts
are `buildsheet.js`'s, the same as the printed build sheet. Nothing is derived a
second time.

## Not in format 1

Times, laps flown, results, rooms, weeks and members: those belong to whatever
hosts the races. The `track.id` is the document's id and is stable across
exports of one track; a new week's track is a new document and a new id.

## Who reads it: CommunityGow

The board's CommunityGow portal (`/CommunityGow` on the board) is the first host.
An organiser either uploads the zip on the community's page or sends it from the
builder: the page's Make it in the builder opens the whoop builder with
`?community=<slug>` and the organiser key as `#cgkey=` in the fragment, and the
strip under the bar sends the bundle as the next round (`src/trackbuilder/community.js`,
which also reads a pasted organiser link in Export bundle). A bundle sent that way has
the six views and the small lap animation, which keeps it inside the board's 4 MB.

The board makes the bundle's `track.json` a published track as it takes the round,
matched by layout so one layout is one track, which is how a round is flyable in the
simulator from its page. That is why `track.json` is always in the zip.
