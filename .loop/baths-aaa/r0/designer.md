# Designer, round 0

Cel AAA civic baths. Evidence: `.loop/baths-aaa/r0/` stills, 1600x900 High, parked cameras. Owns D1 to D8. Grade is from the pixels, not from `src/`.

Cited, not graded: leftoverOverlap 0, leftoverDeath 0, leftoverSamples [], named `__hit` lines CLEAR, attract through 0/320, P1 establishing 165 interior 108, P2 13329 / 11011, P5 91.6 MB at 1080p, PointLights 0, isolation expectedModules 16, colliders 232 boxes, platforms 42, map triangles 5352, craft radius 0.1735 m, CLEAR 1.4 m.

Disputes: none.

## Verdict

REJECT

## D1 to D8

| ID | Grade | One sentence |
|---|---|---|
| D1 | FAIL | title-ui.png is a cream corner, a navy window band and a grey apron under the menu: cyan pool is 0.3% of the world crop, the 10 m tower does not silhouette, and a 236 px card would not make a stranger pick baths. |
| D2 | PASS | establishing.png, spawn.png, plaza.png and lido.png stay cream, aqua tile, coral, lemon, navy and chlorine sky: no bando ochre, no city pastel, no fifth accent. |
| D3 | PASS | Ink sits on silhouettes at High in establishing.png, spawn.png, mouth.png, aerial.png and lido.png. |
| D4 | FAIL | pool-west.png centre crop is 94.7% navy with 0% sun tile, and hopper.png is 97.8% navy with no cream and no tile: the 50 m tube goes dark and the cellar does not band. |
| D5 | FAIL | establishing.png and title-ui.png put a canopy, two poles and bollards on a grey pad: fascia exists, lockers, start blocks and a flyable boundary do not, so the plaza is an empty apron. |
| D6 | PASS | probe.json measurements sit in the `references.js` bands: 50 m, 12.5 m, deep 5 m, door 12.4 m, one 10 m deck, four gallery pieces, teach 10 m, one bulkhead. |
| D7 | FAIL | hall-close.png and pool-west.png cream faces are single cream boxes, and lido.png apron is a cream sheet: no wainscot, waterline, sill or throw that reads at 5 m. |
| D8 | FAIL | establishing.png is chlorine noon, but pool-west.png, hall-close.png and tower.png grade as a navy gym: cool shade on cream exists outside, sun on tile does not reach the hall. |

## MUST-FIX

1. title-ui.png: park the title camera so CIVIC BATHS fascia, cyan pool in the mouth, and a 10 m tower mass read at 236 px. The menu must not eat the door. A cream pier and a grey pad is not the card. Do not fill the lens with a hoop.
2. pool-west.png: the 50 m tube must read as aqua tile and unlit cream down the bore. Centre crop (400,200)-(1200,700) is 94.7% navy at (850,370) `#3c4a54`. That is the kiln tube going dark.
3. hopper.png: 97.8% navy, (800,450) `#384047`, no tile, no cream, no lemon. A cellar with a lip, a lining stripe or a well of cream so it parses as a room.
4. Plaza at 0.5 m to 8 m (title-ui.png, establishing.png, plaza.png): lockers, start blocks and a boundary that read from the apron. Fascia is already there. A canopy and two poles do not make a set. Empty grey pad is the fail.
5. Hall walls at 5 m (hall-close.png, pool-west.png) and the lido apron (lido.png): a wainscot, a waterline, a sill or a throw that a still can see. Cream boxes are the fail.
6. Hall grade (pool-west.png, hall-close.png, tower.png): chlorine noon. Cool shade on cream, sun on tile, two or three cel bands. Navy gym is the fail.

## SHOULD

- lido.png: the back wall is a steel sheet at (800,200) `#8a9ca8`. Give it the civic band or a window, the same language as the hall, or it stays a leisure centre courtyard.
- aerial.png: roof is 76% cream. Two lemon well lips at (400,400) and (1200,400) `#f2d629` and two plant cubes are the only roof dress. Flight height is the bar, this is only a note.
- well.png: park is on the bar as allowed. The still is a coral and navy shaft, (800,450) `#80949a`, lit 1.4%. Recapture so the hole shows the hall, or the well never has a still.
- gallery.png: park is inside the parapet as allowed. The still is two slate bands, (800,450) `#576470` and (800,800) `#7c94a5`, cream 0%, ink 0%. Recapture the bridge and the hoop under it.
- tower.png: board recesses at (800,700) `#32373b`. A cream back wall in the shaft so the 10 m stack is not a navy slab with a coral hoop.
- west-door.png: lemon is 17.4% of the frame, (400,400) `#f2d629`. Fine for that line. Keep that mass off the title card.

## NIT

- spawn.png coral hoop at (850,210) `#a92f53` is large and does not fill the lens. Leave it.
- tower.png numerals read 10, 7.5, 5, 3. Authored boards are 3.0, 5.2, 7.6, 10.0. Round the sign, do not move the deck.
- title-ui.png cream is a greyer band (1050,370) `#c2c4b6` than establishing.png (800,450) `#d4d5c6`. Glancing light on the title park, not a fifth colour.
- plaza.png lower half is sun tile (850,690) `#00c4ca`. That is the pool, not plaza furniture. Do not count it as D5 dress.

## What the title still actually shows

title-ui.png, UI on, park 44,14,38 looking 4,6,0.

Left 480 px is the menu: navy panel, mint Fly, (50,50) `#2a3738`. World crop (480,0)-(1599,899): cream 11.4%, bright tile 0.3%, coral 1.1%, lemon 1.3%, navy 17.7%, sky 8.8%.

The building is a cream box, (1050,370) `#c2c4b6`, (1050,210) `#c1c3b4`. A navy window band, (850,370) `#347a90`. Cool sky, (1450,210) `#aac5d0`. Grey apron, (850,850) `#7c8681`. A striped corner pier sits on the right. The mouth is a dark teal notch, (650,370) `#2d687b`, under the menu edge. No readable CIVIC BATHS board. No cyan basin. No 10 m dive stack. No lemon hoop filling the lens.

establishing.png (UI hidden, park 42,13,36 looking 2,7,8) is the shot this camera wanted: chlorine sky (80,80) `#9ecee1`, cream hall (800,450) `#d4d5c6`, pool in the mouth (650,530) `#32c7ce`, lemon civic band (1450,530) `#efd329`, cool shade on the plaza (200,700) `#617889`. That still is a baths. The title still is not.

## What would make a stranger pick this world card at 236 px

A south face: CIVIC BATHS on aqua, a 12 m mouth with cyan water in it, the 10 m tower as a stacked navy mass with lemon decks, coral and lemon on the piers, chlorine sky, a plaza that has a queue. Cream warehouse plus grey car park plus a menu is a leisure centre from the ring road. That card gets skipped.
