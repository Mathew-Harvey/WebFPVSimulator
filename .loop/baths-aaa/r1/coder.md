# Coder, round 1

Municipal baths AAA. Constitution: `prompts/baths-aaa-loop.md`. Evidence: `.loop/baths-aaa/r1/`. Disputes: `.loop/baths-aaa/disputes.md` (none yet).

r0 BUILD, then this MEASURE. Numbers used as given from `probe.json` and `attract.txt`. leftoverSamples is empty. leftoverDeath 0, leftoverOverlap 0. Overlay stills: `establishing-boxes.png`, `mouth-boxes.png`, `pool-west-boxes.png`, `bulkhead-boxes.png`, `hopper-boxes.png`. Beauty stills read for C4: `establishing.png`, `spawn.png`, `mouth.png`, `pool-west.png`, `bulkhead.png`, `hopper.png`, `tower.png`, `lido.png`, `plaza.png`. Attract through is `attract.txt` from this round's `node scripts/attract-check.js baths`. P1 is establishing park and pool-west park, not attract.

`kit.js` CLEAR is 1.4. `leftoverScan` in `world.js` counts overlap when all three axes overlap above 0.02, and death when the other two axes overlap above 0.25 and `0.08 < gap < CLEAR`, unless a third box occupies the slot. `index.js` `stats()` lifts leftoverDeath and leftoverOverlap from `audit()`. `decal()` is `solid: false`. Signs are `sticker()` on `PlaneGeometry`, no `addBox`.

r0 SHOULDs that this build closed: plaza pergola cap is a solid tile slab plus platform. Mouth steel lintel `y0` is `doorH`. Fence rail is segmented between posts. Queue blocks sit on 2.5 m centres. leftoverDeath is on `stats()`.

## Verdict: ACCEPT

Every item this reviewer owns is PASS. leftoverOverlap is 0. leftoverDeath is 0. Overlay stills exist and carry green collider lines the matching beauty frames do not. Drawn boxes are the boxes you hit. Signs, banners and letter holes are air. Budgets are under ceiling. Isolation holds: `MAP_MODULE_COUNT.baths` is 16, choosing baths does not import the city.

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

Bar is 0. Shared volume flips contact normals. `probe.json` leftoverOverlap is 0. leftoverSamples is `[]`. Audit leftoverOverlap 0. 270 boxes, 0 capsules. Hall long walls own the corners. End walls stop at `x0+t` / `x1-t`. Tower plugs `hit()` the leftover of the hall, they do not double the wall volume. Hoop lintels sit between posts so a shared face is leftover 0. Hopper east wall is a punched shared face with the pit, leftover 0. Pergola beams share the `y = 3.42` face with the tile cap, not a volume. Fence rails start at `x + 0.12` where the post ends. Disputes.md has nothing to cover. Do not make wrap trim solid without splitting it off the wall it sits on.

## C2 leftoverDeath 0 PASS

Bar is leftoverDeath 0, or a named inner that disputes.md has already argued. This round: leftoverDeath 0, leftoverSamples `[]`. No hoop inner, no aisle, no sill in the 0.08 to 1.4 m band. Catch hoop inner Y is 1.62 as authored (`hoopX` y0 5.70, y1 7.72, t 0.2), which is at or above CLEAR, so leftoverScan does not count it. Queue centres are 2.5 m, block width 0.72, gap 1.78, which is above CLEAR. Do not grow named hoops to CLEAR. Do not shrink L10. Audit: poolOk 600 poolWrong 0, teachOk 120 teachWrong 0, wellGhost 0, galleryMiss 0. Those are heightAt checks, not leftover, but they agree the wells are holes and the gallery decks land.

## C4 visual equals solid PASS

Overlay stills exist. Green is `__colliderBoxes` LineSegments from this round's shots eval. Overlay green pixels (high G, low R, mid B) versus the matching beauty frame: establishing 918 vs 1, mouth 340 vs 0, pool-west 1423 vs 4, bulkhead 602 vs 0, hopper 472 vs 1. A painted gap must not hide a collider. A drawn box must be the box you hit. Signs, banners and letter holes are air. Decals are `solid: false`.

- `establishing-boxes.png`: hall, corner towers, plaza posts, pergola, queue blocks, fence. Green on the cream boxes and the plaza furniture. CIVIC BATHS fascia is a `sticker()`, no unique collider. Civic coral/lemon band is `decal()`. Pergola cap is now a tile `slab` obstacle at y 3.42 to 3.52 plus a platform, not a `decal()` over a hole. Tower visual is one cream AABB, `solid: false`, with `hit()` filling the same volume as the union of the plug and the parts that stick out of the hall.
- `mouth-boxes.png`: lemon mouth hoop, coral hoop at z 7.8, gallery edge, narthex lockers. Green hugs those boxes. Lane numbers, NO DIVING, depth marks are stickers. Steel mouth trim is `solid: false` on the cream jamb AABB. Lintel `y0` is `doorH`, so steel does not hang into the opening. The opening you fly is the cream hole, 12.4 x 5.8, and L1 is CLEAR.
- `pool-west-boxes.png`: basin walls, timing gantry, west goal, bulkhead, pillars, hanging hoops. Green on those boxes. Lane stripes and waterline are `decal()`. Coping is `decal()`. Unlit `tileFlat` / `creamFlat` lining is `decal()`.
- `bulkhead-boxes.png`: four bulkhead slabs, 3.4 m slot, sill -1.9, lintel 2.38. Green on the body, air in the slot. Lemon paint on the slot edges is `decal()`.
- `hopper-boxes.png`: pit walls, lip, plant bar. Green on the cellar boxes. East pool wall stops at `L.plant.y0` across the hopper z, so the opening is a hole, not a sealed box. Lemon lip is `decal()`. The park is close and wall-on (see SHOULD). The punch is still a punched shared face.

Beauty stills agree. `spawn.png` / `mouth.png` / `plaza.png`: mouth is a hole, not glass. `pool-west.png` / `bulkhead.png`: the tube reads empty, the bulkhead is the box you hit. `hopper.png`: cellar you can enter. `tower.png`: three sided shaft, boards at 3, 5.2, 7.6, 10, numerals are stickers. `lido.png`: mushroom stem and cap are `slab` obstacles, lemon hoop is `hoopX`, drop tower is three walls plus `deck()` landings. Fence rail is a `pipe` between posts, not one tube through them.

Authoring: `slab()` writes the mesh and the box together unless `solid: false`. `pipe()` is a hit. `hoopX` / `hoopZ` / `portalX` are hits. `deck()` draws a slab `solid: false` and adds the underside box `deck()` already writes. `cyl()` is not in this map's kit. 270 boxes, 0 capsules. No cylinder shell over a smaller AABB in these stills.

## C5 PASS

`attract.txt`: baths path loop, through 0/320. Title camera is not a flight line. No clip in the attract probe.

Named `__hit` lines CLEAR (L1 to L10, spawnApproach) is recorded, not graded here (pilot owns C3).

## P PASS

Ceilings from the table. Measured this round, parked cameras, not attract. Establishing `__setCam(42, 13, 36, 2, 7, 8)`. Interior `__setCam(-18, 0.7, 0, 12, 0.4, 0)` (pool-west).

| Item | Ceiling | Measured | Grade |
|---|---|---|
| P1 calls | 400 | establishing 205, interior 110 | PASS |
| P2 triangles | 1,200,000 | establishing 17017, interior 12545 | PASS |
| P5 1080p | 120 MB | 91.6 MB both views | PASS |
| P9 | one map, 2048 or smaller | `quality.js` baths High 2048, Medium 1024, Low 0. One sun `castShadow`. Fill and bounce do not cast. | PASS |
| Lights | 0 PointLights on Low and Medium | 0. `bq.lamps` is 0 on Low, Medium and High. `probe.json` `pointLights` 0. | PASS |
| isolation | no city fetch | `MAP_MODULE_COUNT.baths` 16. Registry loads `./baths/index.js` only. `src/maps/baths` does not import the city or the bando. Cel kit is copied under `src/maps/baths/cel`. | PASS |

Map triangles 6372, meshes 32, platforms 53, casters 50, pipelineScale 1. `mergeCell: Infinity` on Low, Medium and High. PointLights not used to pretty a still. Hardware contract holds.

P9 read from `quality.js` baths blocks only, not re-probed in the tab. Low keeps ink off, preferScale 0.85, shadowMap 0, lamps 0. Medium lamps 0, ink true, shadowMap 1024, mergeCell Infinity. High lamps 0, ink true, shadowMap 2048, mergeCell Infinity, minScale 1. Do not put PointLights on Low or Medium. Do not change leftover thresholds.

## isolation PASS

`src/main.js` `MAP_MODULE_COUNT.baths` is 16. `probe.json` `expectedModules` 16. `MAP_MODULE_PREFIX.baths` is `/src/maps/baths/`. Loader is `import('./baths/index.js')`. No file under `src/maps/baths` imports `src/maps/city` or `src/maps/bando`. compact-perf is `src/maps/compact-perf.js`, shared, not a city module.

Static import graph under the baths prefix is 15 files (index, world, hall, pool, play, dress, ground, kit, sky, signs, palette, references, cel/toon, cel/post, cel/util) plus compact-perf from the parent. That is a loading-bar weight, not a city leak.

## MUST-FIX

None.

## SHOULD

- `hopper-boxes.png` is still a wall-on seam (472 overlay green pixels on vertical bands). The punch is leftover 0 and L7 is CLEAR. Repark from the pool looking east through the punch so green on the pit walls and air in the hole is the picture. Do not move the punch. Do not make the lemon lip solid.

## NIT

- `addLamp` is wired and unused while `lamps` stays 0. Fine on the laptop contract. Do not turn it on to light an interior. High may light a lamp only if P1 and P5 still pass.
- Clerestory `windowBand` is a pane `decal()` on a solid cream wall. It reads as glass, not a hole. Do not punch it unless the still should show sky through it.
- Hanging lights in `dress.js` `lights()` are `decal()`, air, same as banners. Leave them.
- Door steel jambs are `solid: false` cladding on the cream opening. Overlay hugs the cream. Fine.
- `MAP_MODULE_COUNT.baths` is 16 as required (15 under the prefix plus compact-perf). Cold fetch was not counted this round. Do not invent a city fetch.
