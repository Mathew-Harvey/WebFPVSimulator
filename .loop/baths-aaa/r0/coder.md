# Coder, round 0

Municipal baths AAA. Constitution: `prompts/baths-aaa-loop.md`. Evidence: `.loop/baths-aaa/r0/`. Disputes: `.loop/baths-aaa/disputes.md` (none yet).

MEASURE+BREAK. No BUILD this round. Numbers used as given from `probe.json` and `attract.txt`. leftoverSamples is empty. leftoverDeath 0, leftoverOverlap 0. Overlay stills: `establishing-boxes.png`, `mouth-boxes.png`, `pool-west-boxes.png`, `bulkhead-boxes.png`, `hopper-boxes.png`. Beauty stills read for C4: `establishing.png`, `spawn.png`, `mouth.png`, `pool-west.png`, `bulkhead.png`, `hopper.png`, `tower.png`, `lido.png`. Attract through is `attract.txt` from this round's `node scripts/attract-check.js baths`. P1 is establishing park and pool-west park, not attract.

`kit.js` CLEAR is 1.4. `leftoverScan` in `world.js` counts overlap when all three axes overlap above 0.02, and death when the other two axes overlap above 0.25 and `0.08 < gap < CLEAR`, unless a third box occupies the slot. `index.js` `stats()` reports those counts. `decal()` is `solid: false`. Signs are `sticker()` on `PlaneGeometry`, no `addBox`.

## Verdict: ACCEPT

Every item this reviewer owns is PASS. leftoverOverlap is 0. leftoverDeath is 0. Overlay stills exist. Drawn boxes are the boxes you hit. Signs, banners and letter holes are air. Budgets are under ceiling. Isolation holds: `MAP_MODULE_COUNT.baths` is 16, choosing baths does not import the city.

## Rubric

| Item | Grade |
|---|---|
| C1 leftoverOverlap | PASS |
| C2 leftoverDeath | PASS |
| C4 visual equals solid | PASS |
| C5 attract through | PASS |
| P1 draw calls | PASS |
| P2 triangles | PASS |
| P5 target bytes 1080p | PASS |
| P9 shadow maps | PASS |
| Lights PointLights Low/Medium | PASS |
| isolation | PASS |

## C1 leftoverOverlap 0 PASS

Bar is 0. Shared volume flips contact normals. `probe.json` leftoverOverlap is 0. leftoverSamples is `[]`. Audit leftoverOverlap 0. 232 boxes, 0 capsules. Hall long walls own the corners. End walls stop at `x0+t` / `x1-t`. Tower plugs `hit()` the leftover of the hall, they do not double the wall volume. Hoop lintels sit between posts so a shared face is leftover 0. Hopper east wall is a punched shared face with the pit, leftover 0. Disputes.md has nothing to cover. Do not make wrap trim solid without splitting it off the wall it sits on.

## C2 leftoverDeath 0 PASS

Bar is leftoverDeath 0, or a named inner that disputes.md has already argued. This round: leftoverDeath 0, leftoverSamples `[]`. No hoop inner, no aisle, no sill in the 0.08 to 1.4 m band. Catch hoop inner Y is 1.62 as authored, which is at or above CLEAR, so leftoverScan does not count it. Do not grow named hoops to CLEAR. Do not shrink L10. Audit: poolOk 600 poolWrong 0, teachOk 120 teachWrong 0, wellGhost 0, galleryMiss 0. Those are heightAt checks, not leftover, but they agree the wells are holes and the gallery decks land.

## C4 visual equals solid PASS

Overlay stills exist. Green is `__colliderBoxes` LineSegments from this round's shots eval. A painted gap must not hide a collider. A drawn box must be the box you hit. Signs, banners and letter holes are air. Decals are `solid: false`.

- `establishing-boxes.png`: hall, corner towers, plaza posts, start of the mouth. Green on the cream boxes and the plaza furniture legs. CIVIC BATHS fascia is a `sticker()`, no unique collider. Civic coral/lemon band is `decal()`. Tower visual is one cream AABB, `solid: false`, with `hit()` filling the same volume as the union of the plug and the parts that stick out of the hall.
- `mouth-boxes.png`: lemon mouth hoop, coral hoop at z 7.8, gallery edge, narthex lockers. Green hugs those boxes. Lane numbers, NO DIVING, depth marks are stickers. Steel mouth trim is `solid: false` on the cream jamb AABB (x at or outside ±6.2). The opening you fly is the cream hole, 12.4 x 5.8, and L1 is CLEAR.
- `pool-west-boxes.png`: basin walls, timing gantry, west goal, bulkhead, pillars, hanging hoops. Green on those boxes. Lane stripes and waterline are `decal()`. Coping is `decal()`.
- `bulkhead-boxes.png`: four bulkhead slabs, 3.4 m slot, sill -1.9, lintel 2.38. Green on the body, air in the slot. Lemon paint on the slot edges is `decal()`.
- `hopper-boxes.png`: pit walls, lip, plant bar. Green on the cellar boxes. East pool wall stops at `L.plant.y0` across the hopper z, so the opening is a hole, not a sealed box.

Beauty stills agree. `spawn.png` / `mouth.png`: mouth is a hole, not glass. `pool-west.png` / `bulkhead.png`: the tube reads empty, the bulkhead is the box you hit. `hopper.png`: cellar you can enter. `tower.png`: three sided shaft, boards at 3, 5.2, 7.6, 10, numerals are stickers. `lido.png`: mushroom stem and cap are `slab` obstacles, lemon hoop is `hoopX`, drop tower is three walls plus `deck()` landings.

Authoring: `slab()` writes the mesh and the box together unless `solid: false`. `pipe()` is a hit. `hoopX` / `hoopZ` / `portalX` are hits. `deck()` draws a slab `solid: false` and adds the underside box `deck()` already writes. `cyl()` is not in this map's kit. 232 boxes, 0 capsules. No cylinder shell over a smaller AABB in these stills.

## C5 PASS

`attract.txt`: baths path loop, through 0/320. Title camera is not a flight line. No clip in the attract probe.

Named `__hit` lines CLEAR (L1 to L10, spawnApproach) is recorded, not graded here (pilot owns C3).

## P PASS

Ceilings from the table. Measured this round, parked cameras, not attract. Establishing `__setCam(44, 14, 38, 4, 6, 0)`. Interior `__setCam(-18, 2.2, 0, 8, 1.5, 0)` (pool-west).

| Item | Ceiling | Measured | Grade |
|---|---|---|
| P1 calls | 400 | establishing 165, interior 108 | PASS |
| P2 triangles | 1,200,000 | establishing 13329, interior 11011 | PASS |
| P5 1080p | 120 MB | 91.6 MB both views | PASS |
| P9 | one map, 2048 or smaller | `quality.js` baths High 2048, Medium 1024, Low 0. One sun `castShadow`. Fill and bounce do not cast. | PASS |
| Lights | 0 PointLights on Low and Medium | 0. `bq.lamps` is 0 on Low, Medium and High. `probe.json` `pointLights` 0. | PASS |
| isolation | no city fetch | `MAP_MODULE_COUNT.baths` 16. Registry loads `./baths/index.js` only. `src/maps/baths` does not import the city or the bando. Cel kit is copied under `src/maps/baths/cel`. | PASS |

Map triangles 5352, meshes 30, platforms 42, casters 50, pipelineScale 1. `mergeCell: Infinity` on Low, Medium and High. PointLights not used to pretty a still. Hardware contract holds.

P9 read from `quality.js`, not re-probed in the tab. Low keeps ink off, preferScale 0.85, shadowMap 0, lamps 0.

## isolation PASS

`src/main.js` `MAP_MODULE_COUNT.baths` is 16. `probe.json` `expectedModules` 16. `MAP_MODULE_PREFIX.baths` is `/src/maps/baths/`. Loader is `import('./baths/index.js')`. No file under `src/maps/baths` imports `src/maps/city` or `src/maps/bando`. compact-perf is `src/maps/compact-perf.js`, shared, not a city module.

Static import graph under the baths prefix is 15 files (index, world, hall, pool, play, dress, ground, kit, sky, signs, palette, references, cel/toon, cel/post, cel/util). That is a loading-bar weight, not a city leak. See SHOULD.

## MUST-FIX

None.

## SHOULD

- Plaza canopy in `plazaToys`: columns and perimeter beams are hits. The tile cap is `decal()` over a 6 x 4.6 m hole, y 3.42 to 3.48. A 5 inch that lands on the visual top falls through except on the 0.27 m frame. Either `slab` a thin obstacle for the cap or drop the cap so it reads as an open frame. Not leftover. Not overlap. Do not fail C1 to close it.
- Steel mouth lintel in `hall.js` hangs 0.28 m below `doorH` into the opening and is `solid: false`. Jambs sit on the cream wall AABB. Same grammar as a collar: making the three slabs solid without a split would share volume with the cream and fail C1. Pull the lintel up to `doorH`, or `hit()` only the proud Z lips.
- `MAP_MODULE_COUNT.baths` is 16 as required. Cold fetch was not counted this round. If a later isolation check reports 15 under `/src/maps/baths/`, drop the constant to match. Do not invent a city fetch.

## NIT

- `addLamp` is wired and unused while `lamps` stays 0. Fine on the laptop contract. Do not turn it on to light an interior. High may light a lamp only if P1 and P5 still pass.
- Clerestory `windowBand` is a pane `decal()` on a solid cream wall. It reads as glass, not a hole. Do not punch it unless the still should show sky through it.
- Hanging lights in `dress.js` `lights()` are `decal()`, air, same as banners. Leave them.
- Door steel jambs are `solid: false` cladding on the cream opening. Overlay hugs the cream. Fine.
