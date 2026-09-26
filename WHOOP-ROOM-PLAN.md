# The whoop room: a hall in the town

A plan for the owner, 26 September 2026. Nothing has been built yet: no source
file has moved. The plan is written to be argued with, and section 9 lists the
decisions it is waiting on.

## 0. What was asked

In the owner's words: "the whoop room is very very bland. I want it to be much
nicer. in theme for the sekura theme, but also tastefully decorate the walls
with https://webfpv.org/stickers/ stickers and ensure the whoop room matches
the overall styling of the city and the freestyle builder."

Read here as three things. The sakura theme is the brand's palette (cream
`#f3ead4`, sakura `#e8a8b8`, amber, mint, slate and deep green in
`index.html`), which is also the palette the stickers are drawn in, and the
town's cherry blossom. The stickers are the slap pack. And "match the city and
the freestyle builder" is the town's look: its palette, its cel kit, its ink
and its grade, which Your map already shares number for number.

## 1. What is there now

**Where.** The room is the `indoor` branch of `buildFieldScene` in
`src/render/scene.js`: the `ROOM` palette (line 195), the fog and background
(4355), two lamps and a hemisphere (4386), the walls, mat, ceiling and purlins
(4545 to 4667), and the course's floor logos (`roomDecals`, 1032). A micro
course reaches it through `src/maps/custom.js`.

**What.** RaceGOW's 10 by 12 by 4 m hall, built MICRO_SCALE (about 3.43) times
life size, so about 34 by 41 m with a 13.7 m ceiling. Pine board walls
`0x6b5335` with a darker band and a skirting, an OSB ceiling with purlins, a
black mat `0x1c1c1e` on a concrete border, two warm bulbs, and near black air
and fog `0x14100c`. Captured this turn from four angles: a brown box with a
black floor. Nothing in it gives scale, story or a reason to look at a wall.

**Why recolouring alone cannot make it match.** It renders through the race
field's kit, and the town and the builder use a different one:

| | the room (race field kit) | the town and Your map |
|---|---|---|
| materials | `celmat.js`, an RGB ramp and a fresnel rim | `toon.js` `cel()`, bands tinted violet `0x6c5f8c` |
| ink | `0x1a2230`, blue black | `PAL.ink` `0x39324f`, violet |
| grade | the field's GradeShader, fixed cool lift | shadow tint `0xada8d0`, light tint `0xfff7e8`, saturation 1.12, lift 0.032, vignette 0.15, warmth 0.05 |
| palette | dark pine and black | `PAL`: pale masses, violet shadow, one or two saturated accents per area, no value crushed to black |

**What works and has to survive.** The mat is the darkest thing in the room on
purpose. The file says why, citing RaceGOW pilots: bare white PVC on a pale
floor is unflyable. In the captures the cream PVC reads cleanly against both
the black floor and the mid brown walls. A room repainted in the town's pale
plaster would lose that at a stroke, and the plan is built around not losing
it.

**Who else shows the room.** The title's Whoop card (`scripts/gatecards.js`,
"indoors is the whole claim that card makes"), the board's cards for micro
tracks (`src/share/orbit.js` builds the real map), and the title's world for a
pilot seated on the whoop. Not the builder: its micro preview draws no walls,
and the animation export (`stage.js`) has its own black floor.

**What checks see it.** None look at its pixels. `micro:check` covers the
document and the race, `whoop:gates` the flight envelope, `check:world` and
the world golden synthetic walls rather than this room, and check 16 only
asserts that the race field fetches nothing under `src/maps/city`. So the
redesign brings its own evidence (section 7).

## 2. The stickers

The slap pack at https://webfpv.org/stickers/ is the landing repository's
`stickers/index.html`, which calls itself the copy of record. 22 stickers,
each an inline SVG with no rasters in it, in the house palette (ink `#0c120e`,
cream, sakura, red `#c14b52`, amber, mint), GPLv3 like everything else here.
The type is three faces embedded in the page, subsetted: Zen Kaku Gothic New,
Caveat Brush and M PLUS Rounded 1c, under the SIL Open Font License 1.1.

The landing page already generates `src/stickers-data.js` from the pack (every
SVG verbatim plus the font block, 203 KB) and puts the stickers on its film as
DOM SVG, not as WebGL textures. So an SVG with embedded fonts drawn into a
texture has not been proven anywhere in this family yet.

**They are small.** Printed sizes run from 36 to 100 mm. In the flown world an
80 mm sticker is 274 mm, about the size of the whoop itself (223 mm). From 3 m
(true) away it is about 16 px of a 1280 px frame. That is the right answer for
"tasteful": at true size a sticker is a spot of colour until you fly close,
and it rewards the wall skim the counter already scores. Only a handful of
large prints should read from across the room.

| sticker | printed | proposed use |
|---|---|---|
| chibi whoop | 80 x 72 die-cut | entrance door cluster |
| bubble whoop | 90 x 90 die-cut | entrance door cluster |
| goggle view | 90 x 55 die-cut | entrance door cluster |
| wakaba | 70 x 85 die-cut | beside the door, where new pilots come in |
| pilot | 85 x 85 die-cut | noticeboard |
| ema plaque | 90 x 70 die-cut | noticeboard, it is a prayer plaque |
| manga corner | 100 x 66 | the noticeboard's corner |
| peeker | 120 x 40 | peeking over the door frame and the cabinet top |
| speech bubble | 90 x 70 die-cut | trophy cabinet glass |
| hinomaru hatch | 85 circle | trophy cabinet glass |
| sakura branch | 100 x 70 die-cut | a window frame |
| petal wake, visor strip | 200 x 36 | door kick plates, cabinet base |
| railway town | 100 x 74 | large print: an A1 poster, "FLY THE CITY", a wink at the town |
| brush banner | 45 x 100 | large print: a nobori style banner, about 0.6 by 1.8 m true |
| wave strip | 200 x 40 | large print: a frieze over the stage |
| cut vinyl wordmark | 200 x 50, one colour | large print: cut vinyl across the lobby glass |

Held back for now: pen and ink gate, hinomaru sea, wave peeker, wave crest,
livery strip. Easy to swap; the picks are a proposal.

## 3. The concept: Hibari community hall, whoop night

The room stops being a basement and becomes the town's community hall,
ひばり台公民館, with the club's mat laid down for a whoop night. The town's own
name is already on its street signs (`src/props/street.js`). A 10 by 12 by 4 m
hall is exactly a community hall's size, a hall naturally has wall space,
windows, a stage and a noticeboard, and the black mat is still honest: it is
what a club lays on a hall floor.

Plan view (the scene's frame: x east, z south):

```
                  north: the stage end
     +--------------------------------------------------+
     |      [ wave strip frieze over the proscenium ]   |
     |      closed sakura curtain, flush                |
 W   |                                                  |   E
 i   |                                                  |   t
 n   |                                                  |   h
 d   |               the mat: the flying area           |   e
 o   |                                                  |
 w   |                                                  |   c
 s   |                                                  |   l
     |                                                  |   u
     |                                                  |   b
     |  noticeboard  [ glass doors, lobby beyond ]  EXIT |
     +--------------------------------------------------+
                  south: the entrance end
```

The club wall, in elevation:

```
  ceiling: pale, beams kept, panel lights between them
  +------------------------------------------------------------+
  |   [ FLY THE CITY ]        ( clock )        [ nobori print ] |  pale plaster
  |      A1 poster                                             |
  |  --- picture rail ---------------------------------------  |
  |  [ trophy cabinet, glass ]  ::: sticker cluster :::        |  dark wainscot
  |                                                            |  to about 1.6 m true
  +------------------------------------------------------------+
     floor: honey wood border, then the mat
```

**Floor.** The mat stays over the flying area, pulled from neutral black to
the town's own dark (`PAL.black` is `0x322e3b`), so it sits in the town's
range and still reads as the darkest thing. The concrete border becomes honey
wood boards.

**Lower walls.** A tall dark wainscot, about 1.6 m (true), in a deep town tone
(the roof slates, `0x4d5c78` to `0x59617a`, or a dark stained wood). This is
the band a whoop pilot sees gates against, so it keeps today's contrast, and
it is also where stickers read best: every sticker has a white keyline, which
vanishes on pale plaster and pops on a dark panel.

**Upper walls.** Pale plaster in the town's wall tones above a picture rail,
carrying the few large prints.

**Windows, the west wall.** A row of high windows looking out on the town: a
painted backdrop in the town's palette (its sky stops, rooftops, a pole and
its wires, a sakura tree right outside), set a short way outside the wall so
it moves against the frames as the whoop does. The town's golden sun stands
in the south west (`looks.js`), so it comes in through these windows and lays
warm pools on the floor. This is the move that puts the room in the city.

**The stage end.** A proscenium frame and a closed sakura pink curtain, flush
with the wall, the wave strip enlarged as a frieze above it.

**The entrance end.** Glass double doors into the lobby, with the town's own
vending machine lit beyond the glass, shoe lockers and a potted plant; the
cut vinyl wordmark across the glass; the noticeboard; a green EXIT sign; the
main sticker cluster on the doors and the wainscot beside them.

**The club wall, east.** A glass fronted trophy cabinet built into the wall,
a school clock, the FLY THE CITY poster, the nobori print, a second, smaller
sticker cluster.

**Ceiling.** Pale, with the beams kept (they are how a pilot judges height up
there) and flat lit panels between them.

**Light and air.** The town's golden hour through the windows, an even light
from the ceiling, the hemisphere for the corners, and pale warm air in place
of near black. Shadows through the window openings on High and Medium only.

**Alternatives considered.** A school gym: the town has one, but its hoops,
backboards and wall bars stand in the air, so they are new solids, and a gym
floor is pale. A hobby shop's back room: it needs furniture across the floor,
and it is darker and less sakura. Recolour the basement: cheapest, but it
stays in the field's kit and will never look like the town.

## 4. The rule that keeps physics and every published track untouched

The walls stand exactly on the edge of the builder's micro field
(`elements.js` sets the field to `ROOM_WIDTH` by `ROOM_DEPTH`, the numbers the
walls are built from). So anything that stands proud of a wall stands where an
author may already have put a gate. Hence:

- **Proud of a wall face: at most 30 mm (true), and paint, not solid.** A
  sticker, a print, a frame, the noticeboard, the clock, a sill.
- **Anything deeper is behind glass or closed.** The windows, the glass doors
  and the lobby beyond them, the trophy cabinet, the closed curtain. Glass is
  where a pilot expects a solid face, so the wall collider still tells the
  truth.
- **Nothing hangs in open air.** No lanterns or garlands across the room:
  flying through a paper lantern looks broken, and a solid one is an obstacle
  nobody asked for.

The collider set stays the five boxes it is today, exactly. The plant, the
module ABI and the build are untouched, and every published micro track flies
bit for bit as it does now.

Solid furniture (a stage lip, pit tables, a shoe rack) is possible later, but
only by growing the hall a margin outside the RaceGOW field and putting the
furniture in it. That moves the walls a whoop can hit, so it is a separate
decision (section 9, question 2), not part of this plan.

## 5. How it is built

- **`src/art/hall.js`, new.** The hall, beside `src/art/clubhouse.js`, which
  is the race field's pavilion. The indoor block in `scene.js` (a 6269 line
  file) shrinks to one call. It is imported dynamically inside the indoor
  branch, so the race field never fetches it and check 16 stays green; the
  whoop room then fetches the town's small core kit files, as Your map
  already does. `lint:preload` regenerated for the new modules.
- **Materials are the town's.** `cel()` and `flat()` from `toon.js` in `PAL`
  colours, so shading, violet shadow bands and unlit flats are the town's. The
  first job is a spike proving toon materials behave in the field's ink
  prepass; the fallback is `celmat.js` materials in town colours.
- **Post.** `src/render/post.js` gains an ink colour and grade option per map.
  The field passes nothing and keeps today's values, so its frame is
  identical, proved by a capture diff rather than asserted. The hall passes the
  town's golden values from `looks.js`. The field chain stays because the gate
  glow needs its bloom.
- **Windows.** The backdrop is a painted Canvas2D panel, the way the town
  paints its signs. The wall visuals get openings; the wall collider box does
  not.
- **Stickers, generated.** `scripts/stickers.js` (`npm run gen:stickers`)
  reads the slap pack, renders the chosen stickers in the headless Chromium
  this repository already uses for posters and gate cards, and packs one
  transparent atlas under `assets/stickers/` plus a generated table in
  `src/art/` (name, UV rectangle, printed size in mm). No fonts ship: the
  glyphs become pixels, which the OFL does not restrict, so NOTICE gains the
  stickers' origin and no new licence.
- **Stickers, at run time.** One texture, one material, every quad merged into
  one mesh, so one draw call for all of them. The no ink layer, no depth
  write, a polygon offset, the way `roomDecals` already does it.
- **Placement is a table, not a scatter.** `{ sticker, surface, x, y, turn,
  scale }`, authored by hand and tuned from pictures. Inside a cluster, small
  turns and overlaps so it looks slapped. Any jitter comes from a private
  seeded generator, so the world's random stream does not move.
- **Scale.** Every dressing length pays `K = MICRO_SCALE`, as the current
  block's does.
- **Budget.** The atlas at 2048 by 2048 on High is 16 MB of GPU memory, 21 MB
  with mips; 2048 by 1024 or smaller if that is too much, and half on Low.
  Measured with `lint:memory` once it seeds a micro course, which today it
  does not.

## 6. Stages, each one flyable on its own

1. **Guard rails first.** A `scripts/hall-check.js` that pins the room's
   collider list and records the PVC against background contrast at fixed
   whoop eye cameras on Living room 1 as the baseline, plus field captures for
   the identity diff. Before anything moves.
2. **The shell in the town's look.** Palette, wainscot, wood border, pale
   ceiling and panels, light, air, the post options. The biggest visible
   change for the least risk.
3. **Windows onto the town,** and the daylight pools.
4. **The stickers.** Generator, atlas, run time, placement.
5. **The two ends and the club wall.** Curtain and frieze; glass doors, lobby,
   noticeboard, EXIT sign; cabinet and clock.
6. **The Whoop card** regenerated (`npm run gen:gatecards`), PROGRESS.md, and
   the board's cards pick the hall up as they are rendered.

## 7. How we will know it worked

- **Colliders:** the same list, exactly (`hall-check`).
- **Readability:** PVC against the background beside it, luminance contrast at
  four fixed cameras at whoop eye height, before and after, written to a file.
  The bar: no worse than today in the gate band.
- **The race field:** a pixel identical capture at fixed cameras, and check 16.
- **Pictures:** the four angles captured this turn, FPV at gate height, and the
  new Whoop card.
- **Fly it:** the one that decides. What to look for is in the hand over.
- **`npm run verify`:** only if something physical changes, which under
  section 4 nothing does.

## 8. Risks

- **Tall elements against pale plaster.** A tower or ladder top can sit in
  front of the upper wall from a low eye. Mitigated by the tall wainscot, the
  town's violet ink on every silhouette and the mint glow on the next gate,
  and measured, not assumed.
- **Stickers as noise near gates.** Kept in clusters at the doors, the
  noticeboard and the cabinet, not along the long runs of wall.
- **Toon materials in the field's pipeline.** The spike in stage 2 answers it
  before anything else is built on it.
- **Memory and build time.** Measured; the loading bar's estimate
  (`build-cost.js`) updated if the build grows.

## 9. Decisions for the owner

1. **The concept.** The community hall (recommended), a school gym, a hobby
   shop's back room, or the basement recoloured.
2. **Decor only.** Everything under the 30 mm rule, the collider set
   untouched (recommended). Solid furniture would mean a margin round the
   RaceGOW field and moving the walls: a separate conversation.
3. **How stickers ship.** A baked atlas from the slap pack (recommended), or
   the SVGs plus the OFL fonts rendered in the browser.
4. **Which stickers, and how many.** The sixteen above, most at true size and
   four as large prints, or a different set. And are large prints welcome, or
   true size only?
5. **The field's post chain** gains a per map ink and grade option, the field
   itself unchanged. It is a render change in a shared file.
6. **Time of day.** Golden afternoon, the town's default and every poster's
   (recommended), or a dusk whoop night with the lights on.
7. **Sponsors on the wall.** A course's own logos as banners in the hall as
   well as on the floor; the code already says that is where RaceGOW
   sponsors belong. Optional.
8. **Later, not here.** The hall could become the whoop's indoor freestyle
   space, which `freestyleOffered` in `src/ui/ui.js` says is the one function
   that would have to change.
