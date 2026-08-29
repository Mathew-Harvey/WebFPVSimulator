# FPV pilot, round 0

Municipal baths. 5 inch freestyle. I have flown indoor halls. Evidence: `.loop/baths-aaa/r0/` stills and `probe.json`. Craft 0.1735 m. CLEAR 1.4 m. Inner clears of named lines are authored: I am not asking them to shrink or grow.

Every named sweep in `probe.json` reports `clear: true`, `n: 0` (L1_mouthS, L1_coralHoop, L2_poolBore, L3_bulkhead, L4_westDoor, L5_teachHoop, L6_diveHoop, L7_hopper, L8_westWell, L8_eastWell, L9_underBridge, L10_catchHoop, spawnApproach). leftoverOverlap 0, leftoverDeath 0. Those leftover counts are the coder's C1/C2. Attract `through 0/320`: I am not grading C5.

Title-ui.png and establishing.png are establishing shots, not flight lines. They may skip L3 to L10. L1 still asks that the title still show the door, not a hoop filling the lens.

gallery.png park is inside the parapet (camera y 7.4, parapet top 7.65). The frame is two cel bands of grey, unique_q=6, no hoop, no deck, no pool. well.png park sits on the west well bar (camera x=-11, y=14.2 against the bar at x=-11.2, y=13.5). Vertical bands of chrome, a tile strip, and the west coral hoop filling the right edge. If a still cannot show the line I say so. I am not inventing a flyable read from those two parks.

## Verdict

REJECT

## Grades

| Item | Grade | Cite |
|---|---|---|
| C3 | PASS | `probe.json` lines: every named sweep `clear: true`, `n: 0`. Same `__hit` call the frame loop makes. |
| C4 | PASS | Named holes I can see are the slabs you hit: lemon mouth hoop, coral hoop, bulkhead slot, west lemon portal, teach hoop, dive hoop, catch hoop, under-bridge hoop. `mouth-boxes.png` matches `mouth.png` (coral frame, bulkhead in the aperture). `establishing-boxes.png` puts green on the cream hall. `pool-west-boxes.png` has green on the chrome mass that fills the bore at camera height. Hopper overlay is 36 green pixels on a black cellar: I am not claiming a hug I cannot see. Mouth steel frame is SHOULD, not a named-line miss. |
| L1 | PASS | `plaza.png` from ~19 m: dark mouth in the cream south wall (y=350 x=500 `#38474B`), lemon lintel above it, not a hoop filling the lens. `establishing.png` / `title-ui.png`: CIVIC BATHS door, coral is the corner tower band. `spawn.png` then `mouth.png`: lemon door hoop, then coral hoop at z 7.8. Coral posts, cream gap at mid-hoop (`spawn.png` y=350 x=800 `#E3E4D3`), bulkhead filling the lower aperture. That letterbox is the y=2.9 line. L1_mouthS, L1_coralHoop, spawnApproach clear. |
| L2 | PASS | Basin is in `spawn.png` (tile at y=650) and in `pool-west.png` waterline (y=800 tile `#1A6176`, bright centre `#DEF0F1`). L2_poolBore clear at y=0.6, under the west goal lintel (1.32) and through the bulkhead slot. `pool-west.png` is parked at y=2.2 into the chrome mass at x=-15.3 (`#3C4A54` across the middle). That mass is a hit, not the water line. SHOULD repark at y=0.6 so six lanes are the picture. |
| L3 | PASS | `bulkhead.png` looks west through the slot: pool tile in the opening (y=500 `#1B667A`, y=800 `#1A6479`), bright centre (y=650 `#E0F3F4`). 3.4 m slot, sill -1.9, lintel 2.38 as authored. L3_bulkhead clear. Top third of the still is the underside of the coral loop mass (`#A92F53`). The hole still reads. SHOULD pull the park back so the slot is the frame. `bulkhead-boxes.png` showed 0 green from under that mass. |
| L4 | PASS | `west-door.png`: lemon portal post down the left (`#F0D429` every row), sky through the hole, teaching pool tile at the bottom. You are going out. `lido.png` then puts the mushroom in the basin as a white/cream mass with a lemon cap. Over the cap, not through it. Cap top 2.84, probe is the door at y=2.0. L4_westDoor clear. |
| L5 | PASS | `lido.png`: lemon hoop (`#F3D62A`), mushroom stem/cap (cream `#E7EBF1` plus lemon), coral pads in the teach pool (`#A62E51` at y=800). Mushroom is a hit. L5_teachHoop clear at y=1.7, x=-36. Drop tower is a three sided shaft open north: this park looks at the mushroom, not into that shaft. SHOULD. |
| L6 | PASS | `tower.png`: coral dive hoop (`#A92F53` at y=200), lemon board edges through it (`#F3D62A` at y=350/500/650), dark three sided shaft in the middle. Boards at 3, 5.2, 7.6, 10 as authored. L6_diveHoop clear at y=6.3, x=21.2. Inner stays. |
| L7 | FAIL | `hopper.png` is a wall of same-value dark. unique_q=22. 87622 of 90000 samples classify dark. No coral, no lemon, no readable punch. 3x3 is `#25505E` / `#384047` / `#294854` in every cell. `hopper-boxes.png` is the same picture plus 36 green pixels. L7_hopper reports clear from (24.2,-1.8,-5.22) to (26.2,-1.8,-5.22). A CLEAR probe that looks like a sealed box is a FAIL. This is a cellar you cannot read, so you will not enter it. |
| L8 | PASS | `aerial.png` from y=42: two roof holes with lemon lips (`#F2D629` at y=400 x=400 and x=1000/1200), tile down both wells (y=700 `#357F97` / `#368199`). Fly beside the bar, not through it. L8_westWell at x=-13.5 and L8_eastWell at x=11, z=2, both clear, both stop at y=14.5 above the bars at y=13.5. `well.png` cannot show that line: the park sits on the west bar and the coral hoop at x=-11.2. I am not grading L8 from `well.png`. |
| L9 | PASS | Under-bridge lemon hoop is in `bulkhead.png` through the slot (lemon in the lower bands, bright aperture). L9_underBridge clear at y=2.85, x=-7.4. Inner Y 1.90 as authored. Decks are `deck()` at gallery y=6.5. `gallery.png` cannot show those decks: two grey bands, camera in the south parapet. I am not inventing a landable read from that park. SHOULD repark. |
| L10 | PASS | Catch hoop over the bulkhead, inner Y 1.62 as authored. Do not grow it. L10_catchHoop clear at y=6.71. `spawn.png` / `hall-close.png` carry lemon at hoop height. I am not asking leftoverDeath to open it to CLEAR. |

## MUST-FIX

- L7. `hopper.png` is the named cellar and it does not read. Probe is already clear: do not move the punch. Make the east-wall hole a hole a 5 inch can see (cream or lemon lip on the shared face with the pool wall) and make the pit band (cream vs steel vs litter, or a well). No PointLights on Low or Medium. Repark from the pool at the probe (`y=-1.8`, `z=-5.22`) looking into the punch, so the aperture is the picture, not a glance into one dark value.

## SHOULD

- `gallery.png`: camera (0, 7.4, 10.2) is below parapet top 7.65. The still is two cel bands. Park y>=8.2 on the south gallery looking at the west bridge and the hoop under it.
- `well.png`: camera (-11, 14.2, 0) sits on the bar. Park the west descent at x=-13.5, y=16.5 looking down, beside the bar, not through it. Same for the east well at x=11, z=2.
- `pool-west.png`: parked at y=2.2 into the chrome mass at x=-15.3. Park y=0.6, z=0 looking east so six lanes, the island, and the bulkhead slot are the tube.
- `bulkhead.png`: parked under the coral loop mass. Pull east so the 3.4 m slot with lemon edges is the frame. Recapture `bulkhead-boxes.png` from there: this round's overlay was 0 green.
- Mouth steel in `hall.js` is `solid: false`. The steel lintel hangs to y=5.52 into the lemon opening (solid lintel at y=5.6). A drawn box must be the box you hit. Posts sit on cream, so only the hanging lintel ghosts.
- L5 drop tower: `lido.png` shows mushroom and hoop, not the three sided shaft open north. Park looking into that north mouth.
- `plaza.png` lower half is the pergola tile roof (`#00C4CA`). The mouth still reads in the upper half. Frame the door.

## NIT

- L10 inner Y 1.62. It reads as a hoop over the bulkhead. Do not grow it for leftoverDeath or for a tighter still.
- Title-ui.png and establishing.png are establishing shots. The door is in the south wall. A lemon hoop does not fill the lens.
- `plaza.png` is a 20 m L1 still that happened to clip a toy. The door is still there. Not a miss of the mouth.
- Catch hoop sill at y=5.90 vs lemon mass top at y=5.40 is 0.50 m. That leftover is the coder's C2 if it lands in the scan. I am not opening L10.
