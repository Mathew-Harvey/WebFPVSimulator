# FPV pilot, round 1

Municipal baths. 5 inch freestyle. I have flown indoor halls. Evidence: `.loop/baths-aaa/r1/` stills and `probe.json`. Craft 0.1735 m. CLEAR 1.4 m. Inner clears of named lines are authored: I am not asking them to shrink or grow. Catch hoop inner Y 1.62 on purpose.

Every named sweep in `probe.json` reports `clear: true`, `n: 0` (L1_mouthS, L1_coralHoop, L2_poolBore, L3_bulkhead, L4_westDoor, L5_teachHoop, L6_diveHoop, L7_hopper, L8_westWell, L8_eastWell, L9_underBridge, L10_catchHoop, spawnApproach). leftoverOverlap 0, leftoverDeath 0. Those leftover counts are the coder's C1/C2. Attract `through 0/320`: I am not grading C5.

Title-ui.png and establishing.png are establishing shots, not flight lines. They may skip L3 to L10. L1 still asks that the title still show the door, not a hoop filling the lens.

r0 MUST-FIX was L7 only. I re-grade L7 from `hopper.png`, captured at (24.2, -1.8, -5.22) looking (28.5, -2.2, -8.4), close to the punch. r0 gallery and well parks were broken. This round `gallery.png` is above the parapet and `well.png` looks down the west well beside the bar. I am grading those stills. I am not inventing a flyable read from a park that cannot show the line.

## Verdict

REJECT

## Grades

| Item | Grade | Cite |
|---|---|---|
| C3 | PASS | `probe.json` lines: every named sweep `clear: true`, `n: 0`. Same `__hit` call the frame loop makes. |
| C4 | PASS | Named holes I can see are the slabs you hit: lemon mouth hoop, coral hoop, bulkhead slot, west lemon portal, teach hoop, dive hoop, catch hoop, under-bridge hoop (probe). `establishing-boxes.png` puts green on the cream hall (greenOv=72). `pool-west-boxes.png` greenOv=58 on the tube. `hopper-boxes.png` is the stripe still plus 33 green pixels on the steel band, not a hug I can claim. `mouth-boxes.png` greenOv=4. `bulkhead-boxes.png` greenOv=0. Mouth steel in `hall.js` is still `solid: false`: SHOULD, not a named-line miss. |
| L1 | PASS | `title-ui.png`: CIVIC BATHS fascia, door is cyan (`(700,420)` `#029CAC`), not a hoop filling the lens. `establishing.png`: dark mouth in the cream south wall (`(700,500)` `#394046`). `spawn.png` then `mouth.png`: cream gap at mid-hoop (`(800,350)` `#E3E4D3` both stills), coral in the aperture, basin below. L1_mouthS, L1_coralHoop, spawnApproach clear. `plaza.png` lemon lintel fills y=350 across the width (`#F3D62A`): that is the door hoop at close range, not the title FAIL. SHOULD park plaza at the y=2.8 line so the 12.4 x 5.8 m hole is the picture. |
| L2 | PASS | Basin from the mouth is in `spawn.png` (lower 3x3 tile `#518493`). `pool-west.png` reparked at y=0.7: lemon island in the foreground (`(800,800)` `#EFD429`), tile lanes (`(400,700)` `#1B6478`), bright slot ahead (`(800,450)` `#E6EAF1`), chrome loop mass above the bore (`(800,200)` `#3D4A54`), not the r0 park into that mass. L2_poolBore clear at y=0.6, under the west goal lintel (1.32) and through the bulkhead slot. unique_q=198. |
| L3 | PASS | `bulkhead.png` looks west through the slot: grey jambs (`(400,450)` and `(1200,450)` `#708595`), lemon=1512, bright aperture (`(800,450)` `#E6EAF1`). 3.4 m slot, sill -1.9, lintel 2.38 as authored. L3_bulkhead clear. Top third is still the coral loop mass (`(800,80)` `#A72F52`). The hole still reads. The through-view is one cream value, no west-pool tile this round. SHOULD. `bulkhead-boxes.png` still 0 green. |
| L4 | PASS | `west-door.png`: lemon portal (lemon=16704, y=350 x=500 `#F2D629`), sky through the hole (`(1200,200)` `#A3D6EB`), teaching pool tile at the bottom (`(900,700)` `#1B657A`). You are going out. `lido.png` puts the mushroom in the basin. Over the cap, not through it. Cap top 2.84, probe is the door at y=2.0. L4_westDoor clear. |
| L5 | PASS | `lido.png`: lemon=7217, teach pool tile (`(800,500)` `#107587`), coral pads (y=800 `#A82F52`). Mushroom is a hit. L5_teachHoop clear at y=1.7, x=-36. Park looks toward (-40, 2.2, -8), the drop tower's north. The three sided shaft is not the frame. SHOULD. |
| L6 | PASS | `tower.png`: dark shaft in the hoop (`(800,250)` `#303D4A`), lemon board edges (`(800,350)` and `(800,500)` `#F3D62A` / `#F3D72A`), coral in the lower hoop (`(800,600)` `#AA2F53`). Boards at 3, 5.2, 7.6, 10 as authored. L6_diveHoop clear at y=6.3, x=21.2. Inner stays. |
| L7 | FAIL | `hopper.png` is stripes. unique_q=61. Walk y=350: x=80..400 pool tile `#00BBCE`, x=560 lemon lip `#F2D62A`, x=720 steel `#3B444D`, x=880..1520 same-value grey `#E6EAF1`. 3x3 is `#1BBCBA` / `#7F8D8A` / `#E3E7EE`. cream=0, coral=0. Right half of the frame is one grey wall. `hopper-boxes.png` is the same picture plus 33 green pixels. L7_hopper reports clear from (24.2,-1.8,-5.22) to (26.2,-1.8,-5.22). A CLEAR probe that looks like a wall of same-value boxes is a FAIL. Lemon lip exists as a stripe. The punch still does not read as a cellar you enter. |
| L8 | PASS | `aerial.png` from y=42: lemon lips (lemon=3319, `(1000,350)` `#B8A42F`), cream roof, tile in the south of the frame. Two roof holes. Fly beside the bar, not through it. L8_westWell at x=-13.5 and L8_eastWell at x=11, z=2, both clear, both stop at y=14.5 above the bars at y=13.5. `well.png` now shows the west descent: pool through the hole (`(800,700)` `#1B6479`, mid `#E1F4F5`), coral hoop at the right (`(1400,450)` `#A82F52`), lemon=4118. Camera (-13.5, 16.6, 0) is beside the bar at x=-11.2, not on it. No east-well look-down still. SHOULD. |
| L9 | PASS | `gallery.png` park y=8.3 is above parapet top 7.65. West bridge reads: cream hall, coral deck strip (y=550 x=600..1000 `#AA2F53`), chrome below. Decks are `deck()` at gallery y=6.5. L9_underBridge clear at y=2.85, x=-7.4. Inner Y 1.90 as authored. lemon=357: the hoop under the bridge is not the picture. I am not inventing that hoop from this still. SHOULD repark the look at y=2.85. |
| L10 | PASS | Catch hoop over the bulkhead, inner Y 1.62 as authored. Do not grow it. L10_catchHoop clear at y=6.71. `hall-close.png` carries lemon at hoop height (`(800,100)` `#EFD429`). I am not asking leftoverDeath to open it to CLEAR. |

## MUST-FIX

- L7. `hopper.png` is the named cellar at the punch and it does not read. Probe is already clear: do not move the punch. The look at (28.5, -2.2, -8.4) rakes the shared face, so the picture is tile, a lemon stripe, a steel stripe, then a grey wall. Look straight east along the probe, (24.2, -1.8, -5.22) to (26.2, -1.8, -5.22), so the aperture is the picture. The pit has to band as a cellar (litter floor, cream or steel walls, lemon lip as a frame). A stripe of lemon on a sealed grey half-frame is not a hole a 5 inch will enter. No PointLights on Low or Medium.

## SHOULD

- `plaza.png`: lemon lintel fills y=350 full width. Park y=2.8, z~21 looking at z=13 so the 12.4 x 5.8 m door is the hole, not the hoop stick.
- `gallery.png`: west bridge reads. Look at (-7.4, 2.85, 0) so the lemon hoop under it is the picture.
- `bulkhead.png`: slot is the mid frame. Through-view is one cream (`#E6EAF1`) with no west basin. Look slightly down so tile is in the hole. Recapture `bulkhead-boxes.png`: overlay is still 0 green.
- `mouth-boxes.png`: greenOv=4. The overlay does not show the hug.
- Mouth steel in `hall.js` is `solid: false`. A drawn box must be the box you hit.
- L5 drop tower: `lido.png` aims at (-40, 2.2, -8) but the three sided shaft open north is not the frame. Park in that north mouth.
- L8 east well: `aerial.png` shows both holes. Park the east descent at x=11, z=2, y=16.5 looking down, beside the bar.

## NIT

- L10 inner Y 1.62. It reads as a hoop over the bulkhead in `hall-close.png`. Do not grow it for leftoverDeath or for a tighter still.
- Title-ui.png and establishing.png are establishing shots. The door is in the south wall. A lemon hoop does not fill the title lens.
- r0 gallery and well parks are fixed. I am not carrying those SHOULDs forward.
- Hopper lemon lips are decals. Hug the stripe and you ghost a centimetre. Draw the box you hit if you keep the lip. Not the L7 miss. The miss is the sealed grey.
