# Designer, round 1

Cel AAA civic baths. Evidence: `.loop/baths-aaa/r1/` stills, 1600x900 High, parked cameras. Owns D1 to D8. Grade is from the pixels, not from `src/`.

Cited, not graded: leftoverOverlap 0, leftoverDeath 0, leftoverSamples [], named `__hit` lines CLEAR, attract through 0/320, P1 establishing 205 interior 110 (ceiling 400), P2 17017 / 12545 (ceiling 1.2e6), P5 91.6 MB at 1080p (ceiling 120), PointLights 0, isolation expectedModules 16, colliders 270 boxes, 0 capsules, platforms 53, map triangles 6372, craft radius 0.1735 m, CLEAR 1.4 m.

Disputes: none.

r0 REJECT D1 D4 D5 D7 D8. This round added navy dado and lemon sill, unlit tile and cream lining in the pool tube, hopper lemon lip and cream lining, plaza lockers, queue blocks, fence, solid pergola cap, title park SW, plant well, mouth lintel flush. Grade is r1 pixels.

## Verdict

REJECT

## D1 to D8

| ID | Grade | One sentence |
|---|---|---|
| D1 | FAIL | title-ui.png has cyan in the mouth and no lemon hoop filling the lens, but CIVIC BATHS fascia does not read and the 10 m tower never silhouettes, so a 236 px card is still a cream box, a cyan hole and a menu. |
| D2 | PASS | establishing.png, spawn.png, lido.png and title-ui.png stay cream, aqua tile, coral, lemon, navy and chlorine sky: no bando ochre, no city pastel, no fifth accent. |
| D3 | PASS | Ink sits on High silhouettes: establishing.png roof edge (899,217) `#3d4145`, spawn.png hoop edge (800,196) `#3f353d`. |
| D4 | PASS | pool-west.png no longer goes black: sun tile (180,560) `#00b9cc`, unlit teal lining (180,650) `#1b6377`, unlit cream (180,400) `#e0e1d0`. hopper.png is a stripe wall, not a cellar, but it is tile, lemon lip and cream lining, not a navy void. |
| D5 | FAIL | title-ui.png plaza y>640 is 47.1% grey and 0.1% lemon: lockers, start blocks and a boundary do not survive the pad. An empty grey apron is the same fail as an empty cream apron. |
| D6 | PASS | probe.json measurements sit in the `references.js` bands: 50 m, 12.5 m, deep 5 m, door 12.4 m, one 10 m deck, four gallery pieces, teach 10 m, one bulkhead. |
| D7 | FAIL | hall-close.png is a single slate field (800,450) `#718596` from y 300 to 870: no wainscot, waterline, sill or throw at 5 m. |
| D8 | FAIL | establishing.png is chlorine noon, but hall-close.png grades as a grey gym and tower.png is 63.9% navy with tile 0.2%: sun on tile does not reach those stills. |

## MUST-FIX

1. title-ui.png: park a south face so CIVIC BATHS fascia, cyan pool in the mouth, and a 10 m tower mass read at 236 px. The menu must not eat the door. Keep the hoop out of the lens. Cyan in the mouth is done. Fascia and tower are not.
2. Plaza pad at 0.5 m to 8 m (title-ui.png lower half, establishing.png apron, a plaza still that is actually the pad): lockers, start blocks and a boundary that a still can name. title-ui.png (850,850) `#8c9093` grey, right plaza x>=1000 y>=600 is 48.8% grey and 0% tile. Cubes that vanish into the shade do not make a set.
3. hall-close.png at 5 m: a wainscot, a waterline, a sill or a throw on the wall that fills the frame. (800,450) `#718596` is one box. spawn.png far wall has a navy dado (1300,600) `#2f3942` under cream (1300,520) `#e1e2d2`. That language is missing from the 5 m still.
4. Hall grade (hall-close.png, tower.png): chlorine noon. Cool shade on cream, sun on tile, two or three cel bands. Grey gym and navy shaft are the fail.

## SHOULD

- hopper.png: this still is a wall of stripes. y=450 runs aqua (200,450) `#00b9cd`, lemon lip (480,450) `#f2d629`, navy (800,450) `#3b444d`, cream lining (1100,450) `#e5e9f0`. Do not invent a cellar. Recapture so the pit reads as a room, or the hopper never has a still.
- plaza.png is not a plaza. Park (0, 4.6, 21.2) looking (0, 5, 10) fills with fascia and the hall: y 0-250 is 55.8% tile and 27.4% coral, y 700-899 is pool teal. Recapture the pad. Do not count pool as D5 dress.
- lido.png: the back wall is still a steel sheet (600,350) `#899ba8`. Give it the civic band or a window, or it stays a leisure centre courtyard.
- tower.png: (800,450) `#303e4b`, (800,700) `#32373b`. A cream back wall in the shaft so the 10 m stack is not a navy slab.
- Interior lemon sill: pool-west.png left wall goes cream to navy dado (180,476) `#353a41` with no lemon line. Exterior mouth lintel has lemon (title-ui 800,320) `#d0b826`. The sill has to show at 5 m, not only on the south door.
- aerial.png: roof field (800,450) `#dae2da`. Lemon well lips (400,400) and (1200,400) `#f2d629` are there. Flight height is the bar, this is only a note.

## NIT

- spawn.png coral hoop (850,210) `#a92f53` is large and does not fill the lens. Leave it.
- west-door.png lemon is 17.3% of the frame, (400,400) `#f2d629`. Fine for that line. Keep that mass off the title card.
- title-ui.png cream (1050,370) `#c2c4b6` is greyer than establishing.png (800,450) `#d4d5c6`. Glancing light on the title park, not a fifth colour.
- well.png now shows the hall: pool tile (850,850) `#00b8cb`, lemon lip (200,80) `#eacf28`. r0 recapture note is closed.
- gallery.png now has cream (600,350) `#e3e4d3` and coral deck (200,400) `#a82f52`. r0 slate-only note is closed.

## What the title still actually shows

title-ui.png, UI on, park (-14, 11, 28) looking (4, 6, 10).

Left 480 px is the menu: ink panel (50,50) `#151b19`, mint Fly (400,400) `#7dffb4`. World crop x>=480: cream 20.6%, grey 29.4%, navy 13.9%, tile 4.9%, lemon 1.0%, coral 1.1%. Building band (480,80)-(1599,620): cream 32.7%, tile 8.1%, teal 7.4%.

The building is a cream box, (1050,370) `#c2c4b6`, (850,210) `#c3c4b7`. A navy window band, (1050,210) `#32788e`. Lemon mouth lintel, (800,320) `#d0b826`. Cyan basin in the door, (800,400) `#01aaba`, (880,420) `#01aec0`. Coral hoop inside the mouth, (800,450) `#992d4d`, not filling the lens. Cool sky, (1450,210) `#b4c6cf`. Grey apron, (850,850) `#8c9093`. Right plaza x>=1000 y>=600 is 48.8% grey. No readable CIVIC BATHS board on this park: fascia band y 240-340 is cream and window teal. No 10 m dive stack on the right mass: cream, sky, a cyan glint (1280,530) `#01b4b9`.

establishing.png (UI hidden, park 42, 13, 36 looking 2, 7, 8) is still the better baths: chlorine sky (50,50) `#9ecee1`, cream hall (800,450) `#d4d5c6`, pool in the mouth (650,530) `#32c7ce`, lemon civic band (1450,530) `#efd329`, cool shade on the plaza (200,700) `#617889`. plaza.png, not the title still, is the fascia: navy letters (400,0) `#2e3b47` on aqua (200,0) `#00b2c5`.

hopper.png, park (24.2, -1.8, -5.22) looking (28.5, -2.2, -8.4), is a punch macro. It is not a cellar.

## What would make a stranger pick this world card at 236 px

A south face: CIVIC BATHS on aqua, a 12 m mouth with cyan water in it, the 10 m tower as a stacked navy mass with lemon decks seen through or beside that mouth, coral and lemon on the piers, chlorine sky, a plaza that has a queue. Cream warehouse, cyan hole, grey car park and a menu is a leisure centre from the ring road. That card gets skipped.
