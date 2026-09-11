# Rebuilding a RaceGOW track from its animation

This is a findings document, not a change. No preset moved.

The owner supplied two RaceGOW5 animations, Track 8 and Track 5, and asked for
those two to be the only whoop tracks in the builder, built to match the GIF
exactly. This records what the animations can and cannot be made to say, with
the numbers, so the next attempt starts from evidence rather than from another
reading of a picture.

**The short version: the flying order is solid and the metre positions are
not. I did not ship a layout I could not verify, because a layout that merely
looks about right is what the existing presets already are.**

## 1. What the animation is

Not what round 29 assumed. The green quad is the OPENING BEING FLOWN THROUGH,
drawn filled, and the red shape is a directional arrow into it with a head.
Round 29 read the green as a gate highlight following a continuous racing
line. It is a gate by gate walkthrough instead. That misreading is recorded
because it survived a whole round and was only caught by looking at a single
frame at full size.

Three composites turn 288 frames into evidence:

- the **median** of every frame removes the arrow and the panel and leaves a
  clean plate of the structure, because the structure is the only thing that
  never moves;
- the **maximum redness** over time is the whole flown path in one image;
- the **maximum greenness** over time is every scored opening in one image.

## 2. The flying order, which is solid

Clustering the green panel by position and area, then ordering the runs by
frame, gives the sequence directly. This is the strongest thing either
animation yields and it is reusable as is.

**Track 8**, 288 frames, 16 distinct openings, 34 passes:

```
A A B C D E F G G H I J K L M B I E B C N G G F J O B E C D P P K A
```

**Track 5**, 192 frames, 14 distinct openings, 22 passes:

```
A B C D E F F G H D I J K J L G B L M N K A
```

Openings recur: Track 8's most flown is passed four times. A RaceGOW course
doubles back through its own gates, which is why a naive reading of the render
undercounts the passes.

## 3. The 27 inch lattice, which also holds

The owner supplied the key fact: **every length of PVC is 27 inches.** With
`racegow.js`'s published 30 inch nominal centres that is a 27 inch pipe plus a
1.5 inch fitting socket at each end, so the whole track is a lattice on
0.762 m and the picture only has to answer how many units each span is.

Extracting that lattice works:

- eroding the plate leaves only the mouldings, which are fatter than the pipe,
  so the fittings are findable. Blobs that merge are split by peak picking
  with a minimum separation, because on Track 8 the whole left cluster came
  back as one 1405 pixel blob whose centroid sat 20 px off any real junction;
- testing which fitting pairs are joined by unbroken pipe gives the spans;
- pipe left over after that is a free end, and walking it to its tip finds the
  capped pole tops that have no fitting at all.

Track 8 comes out as 27 fittings and 20 spans, Track 5 as 29 and 19. Every
span falls into one of **three mutually perpendicular families**, which is an
independent confirmation of the claim `presets.js` already makes: a RaceGOW
kit is straight pipe and right angle fittings, and nothing is on a diagonal.

**Every cycle in both graphs closes as exactly one unit.** That is the lattice
hypothesis passing a test it could have failed, and it needed no camera.

## 4. Why the metre positions did not come out

Two things defeat the reconstruction, and both are measured rather than
suspected.

**The camera is perspective and the fit runs away.** It is not orthographic: a
vertical pole on Track 8 with three collinear points gives image spans of 98
and 138 px, a ratio of 1.41, which the vertical vanishing point at (493, 1304)
resolves to a world length ratio of **1.080**. So both spans really are one
unit and the apparent difference is nearly all perspective. Good news for the
lattice, bad news for the solver: Track 8's three vanishing point pairs give
focal lengths of 698, 738 and 809 px, a 15 percent spread, and Track 5's A
family is too thin to fit at all and puts its vanishing point inside the
image. A least squares fit over camera plus per structure offsets settles at
**24.5 px rms on Track 8 and 44.1 px on Track 5**, with the focal running to
9731 px and then to 10 million, which is the optimiser escaping into an
orthographic limit where the reconstruction is scale degenerate. At 1024 px
across a living room, 24 px of reprojection error is several inches of
position error and 44 px is most of a foot.

**Some spans are more than one unit and there is no clean way to tell which.**
Within a single axis family the image lengths vary by 1.3 to 4.9 times.
Perspective explains a ratio of about 1.4 over the height of this scene, not
4.9. So the long runs carry couplings the erosion did not find, and an
alternating fit of camera against span count does not converge: it reports
zero count changes on the first round because the degenerate camera makes
every span round to one unit.

This was checked against the obvious explanation first. Free pipe ends have no
fitting to anchor them, so their lengths could have been junk, but restricting
to fitting-to-fitting spans leaves the spread at 1.3 to 4.9 unchanged.

## 5. What would finish it

In the order that would help most:

1. **The Track Diagram cards.** `racegow.js` already cites them, in the build
   videos at `youtube.com/watch?v=IZVy-fwQVjE`. They carry the dimensions.
   With a card, none of section 4 matters and the track can be built to the
   inch.
2. **A second camera angle** of the same track, which makes the reconstruction
   a stereo problem instead of an inverse one.
3. **Finding the missing couplings.** The erosion threshold is a single
   percentile over the whole plate. A coupling on a long run is a smaller
   bulge than a tee and is being missed. Detecting local width along each
   span, rather than globally, would split the multi unit runs and is the one
   piece of section 4 that looks tractable without new input.

## 6. What was deliberately not done

The six shipped RaceGOW5 presets were left in place. Removing five of them and
leaving the sixth, which is itself one of the reconstructions the owner
rejected, is worse than leaving all six: `micro:check` validates each one and
the game's whoop picker reads `presetsForClass('micro')` at
`src/ui/ui.js:4674`, so a picker with one bad track in it is not an
improvement on a picker with six.

Shipping two tracks built from the topology with positions guessed to look
right would reproduce exactly what `presets.js` already admits in its own
header: "close in shape and wrong in detail". The owner asked for perfect. The
honest answer is that this input does not contain perfect, and the fix is a
dimension card rather than a better guess.
