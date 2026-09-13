# Turning a supplied track animation into a track in the game

RaceGOW publishes each of its tracks as one looping animation of one lap.
This is how that animation becomes a playable track in this simulator, end
to end, with the traps named. It was written after Tracks 8 and 5 were built
this way, refined on Track 1, and given step 4c by Track 2. Tracks 3 and 4
followed, and then a pass back over all six rewrote step 4c, because the
test it had was one a fitted camera can answer either way. Six tracks are in
`src/trackbuilder/presets.js` now.

It replaces two earlier documents. `TRACK-FROM-ANIMATION.md` concluded the
job could not be done from a render, which was true of the method it tried
and false of the method below. `TRACKGIF-PLAN.md` was the build spec for the
exporter, which shipped, and a spec for finished code is an invitation to
build it twice.

**The one idea.** A RaceGOW track is built from one length of pipe, 27
inches, and right angle fittings. So the track is a lattice: every gate is a
27 inch square, standing square to one of two axes or lying flat, and every
distance is a whole number of 27 inch units. That turns reading the
animation from an inverse problem, which does not converge, into counting,
which does. Do not start until you know the pipe length for the series you
are reading. Everything below rests on it.

## What the animation is saying

Three things move and each means something exact.

- **The green panel is the opening being flown towards**, drawn filled, lit
  from the moment the quad sets off for it until it is through. It is not a
  highlight following a line.
- **The red shape is a trail of fixed duration behind the quad**, and the
  chevron on it is where the quad is now. The trail is the racing line for
  the last second or so, not the whole lap.
- **A pole is drawn as a panel the full height of the pole**, on the side the
  quad passes. That is the pole rule as a picture: past this, on this side,
  at any height. In this builder that is a `pole` marker and its scoring
  square.

Two panels in each of the two tracks read as wider than one square. That is
the illustrator saying "under this rail anywhere". Build the square the line
actually crosses.

## Step 1, decode every frame

GIF disposal method 1 means most frames are partial rectangles. Reading them
naively gives grey fragments on a background. Coalesce by seeking in order
and converting each frame whole:

```python
im = Image.open(path)
for i in range(im.n_frames):
    im.seek(i)
    yield i, im.convert('RGB')
```

Everything after this reads the coalesced frames. There are 288 of them on
Track 8 and 192 on Track 5, so hold bands of rows rather than every frame at
full size if memory is tight.

## Step 2, three composites

- **The median of every frame is a clean plate of the structure**, because
  the structure is the only thing that never moves. This is the image you
  measure the track from.
- **The maximum greenness over time is every scored opening in one image.**
- **The maximum redness over time is the whole flown path in one image.**

## Step 3, the flying order

Threshold the green channel per frame, cluster the lit region by position
and area, and order the runs by frame number. Merge runs that are
consecutive and the same cluster. What comes out is the lap as a list of
passes, and it is the most reliable thing the animation yields. Track 8 is
29 passes over 16 distinct openings. Openings recur: a RaceGOW course
doubles back through its own gates, so a naive count undercounts.

## Step 4, the camera, which is the step that makes it work

Erode the plate to leave only the mouldings, which are fatter than the pipe,
and take a fitting at each blob. Split blobs that merge by peak picking with
a minimum separation, because a cluster of fittings comes back as one blob
whose centroid is on nothing.

Now assign lattice coordinates to as many fittings as you can read by eye,
in whole units, and fit a pinhole camera to that correspondence: focal
length, position, rotation vector, least squares on reprojection error, with
the principal point pinned at the image centre.

```python
def project(params, P):
    f = params[0]
    C = params[1:4]
    R = Rotation.from_rotvec(params[4:7]).as_matrix()
    Pc = (P - C) @ R.T
    return np.stack([512 + f * Pc[:, 0] / Pc[:, 2], 512 + f * Pc[:, 1] / Pc[:, 2]], 1)
```

Seed it from several plausible eye positions and keep the best. **The
residual is the test of the whole reading.** Track 8 settled at 3.6 px rms
over 19 points and Track 5 at 5.5 px over 19. If the fit will not come below
about 10 px, the lattice assignment is wrong somewhere, not the fitter: go
back and recount. An earlier attempt that fitted the camera and the span
lengths together instead ran the focal length to ten million and reported 24
px, which is several inches of position error across a living room.

## Step 4b, the check that actually settles it

The camera residual is a weak test, because the fitting blobs you fed it are
the centres of mouldings rather than the pipe axes, and a foot's blob is
pulled sideways by its stubs. On Track 1 that floor was 14 px and no
assignment did better, while the reading was in fact exactly right.

The strong test is INTEGRALITY. With the camera from the three vanishing
points, unproject every foot onto the ground plane and print the positions
in units of one known bar. They should all land on integers. Then, for each
upright, intersect its top fitting's ray with the vertical line through its
own foot and print the height in the same units. Those should be integers
too. On Track 1 the six feet came out within 0.13 of an integer and the nine
tops within 0.07, which settles the lattice beyond argument even though the
camera residual never came below 14 px.

Do this before hunting for couplings. A bar that reads as two units will
show up as a foot at 2.0 rather than 1.0, and you will have measured it
instead of squinting at a texture band.

## Step 4c, the mirror, which is the one that ruins everything silently

A mirrored reading stays self consistent all the way down. The residual is
fine, the integrality check passes, the crossings come out clean, the panes
fit. The track is simply its own MIRROR IMAGE, every turn reversed, and
nothing else inside the reading can tell.

It was found on Track 2 at step 10, by the exported caption reading
backwards, after the whole spec had been written. The test written here then
was wrong, and Track 1 shipped mirrored under it for weeks.

**Why the residual decides nothing.** The camera is `u = 512 + f*Xc/Zc`,
`v = 512 + f*Yc/Zc`, with `Pc = R (X - C)` and R a proper rotation. Mirror
the lattice, negate f, and the whole scene moves BEHIND the camera: every
sign flips twice and the pixels come out identical. So the mirrored lattice
fits to exactly the residual the true one does, by a camera that is a
perfectly good rotation, and comparing residuals proves nothing on its own.

**Why reading the camera's axes decides nothing either.** `(f, R)` and
`(-f, diag(-1,-1,1) R)` are the same photograph, so a fitter hands back
whichever it lands on. Any test that looks at `R[0]`, `R[1]` or `R[2]`
against the eye, the old one here included, answers whichever way the gauge
fell. It reported the true Track 3 as left handed and the mirrored Track 1
as fine.

**What the gauge cannot touch is the sign of the depth.** A photograph has
every visible point in FRONT of the camera. So fit both lattices, the spec
and its mirror in y, and require `Zc > 0` at every point:

```python
Pc = (X - C) @ R.T
if not np.all(Pc[:, 2] > 0):
    continue            # not a photograph, whatever its residual
```

One of the two comes back with a residual of a few pixels and the other
cannot be fitted at all: on the six tracks here the loser sat at 170 to 200
px, which is the whole structure in the wrong place. That is the answer.
Seed the search with eyes on a sphere around the lattice, all above the
floor and all looking at it, so nothing in the search prefers one hypothesis
over the other, and run both hypotheses through the same code.

The repair is to negate one axis of the lattice everywhere: the spec's
coordinates, the signs of travel through every square whose axis is that
one, every waypoint's position and heading, the pole sides, the start, and
the origin, which moves by the track's own width so the track stands where
it stood in the room. Negate y rather than x, so the chain still runs along
positive x and the prose still reads.

## Step 5, every pane to a square

Enumerate every lattice rectangle the track could plausibly contain, one
unit or more on a side, on all three axis planes. Project each into the
image, rasterise it, and score it against that pane's union mask by
intersection over union. Take the best.

Do not trust the top score blindly. Perspective makes a square one unit away
look much like a taller square further back, and on these two tracks three
panes had an alias within a few percent. Draw the best two or three on the
plate with the pane mask underneath and pick by eye. That overlay is five
minutes and it settled every one.

## Step 6, which way through

For each pass, take the last frame of its run, find the red pixel nearest
the pane's centre, and walk back along the trail to get the direction of
travel at that point. Sign it against the pane's outward normal projected
into the image.

**That method lies whenever the quad loops.** The nearest red pixel can be a
part of the loop rather than the part going through the hole, and on Track 1
it got two of six backwards. Two better cues, in order:

- **Occlusion.** Where the trail crosses a pipe, look at which is drawn on
  top. The trail over the pipe means the quad is on the camera's side of it.
  That one cue fixed the whole of Track 1's back half: the trail is drawn
  over the pole at the frame where the gap pane lights, so the quad is in
  front, so the gap is flown away from the camera.
- **Alternation.** Consecutive passes through the same plane must alternate
  sign, because the quad has to come back to cross again. Chain that through
  the lap and most signs are forced by the one or two you are sure of.

Where the arrow is short or nearly edge on, crop the frames either side at
full size and look. Roughly one pass in six needed the look.

## Step 7, write the spec

The result goes in `scripts/racegow-lattice.js` as one object. Lattice units
throughout, `origin` in inches from the room's near left corner:

- `squares`, keyed by a letter: `axis` is which axis the opening faces, `x`
  and `y` stand up and `z` lies flat, `at` is the centre in plan, `sill` is
  the height of the bottom pipe, and `unbuilt` says the opening is a gap in
  the lattice rather than a gate with a frame of its own. See "A scored
  opening is not always a gate" below.
- `poles`: `at` is the lattice line it stands on, `side` is the way its pass
  panel faces, `beside` names the square whose centre the 14 inch pole rule
  is measured from, `height` in units.
- `rails`: a bare pipe between two lattice points that no square accounts
  for. The picture has it, so the track has it. A rail carries no legs: it
  is held up by whatever is at its ends.
- `posts`: a bare upright the lap does not score, standing on its lattice
  node. This is the leg that holds up an opening marked `unbuilt` where no
  pole and no neighbouring structure does.
- `waypoints`: see step 9.
- `lap`: one token per pass, in order. A square's letter carries the sign of
  travel along its axis, `A+` or `C-`. A pole or a waypoint is its letter
  alone.

Then `node scripts/racegow-lattice.js` rewrites `src/trackbuilder/presets.js`.
That file is generated. Do not edit it, and `micro:check` fails if you do.

## Step 8, read the crossings, not the picture

The check that matters is not whether the plan view looks right. Walk the
built racing line and print every crossing of every lattice plane, with the
height and the direction:

Every scored pass should appear at its own square, at the height of that
square's centre, going the way the lap says. Anything else crossing a
lattice plane where a gate stands is the line going through the PVC. This
catches what a plan view cannot: a pass at the right place and the wrong
height reads as correct from above.

## Step 8b, project your own pipe on to the plate

Step 8 checks the LINE. This checks the STRUCTURE, and it is the one that
caught the worst mistake in all three reconstructions.

Take every pipe your spec builds, in lattice coordinates: for each opening
a rectangle at its plane and a leg from each lower corner to the floor, for
each pole a vertical, for each rail its span. Project them with the camera
from step 4 and sample the plate along each one, taking the brightest pixel
within about nine pixels of the line, because the camera fit is a few
pixels out. PVC is near white on a dark floor, so a pipe that is really
there comes back bright along its whole length and one you invented comes
back dark.

Everything that scores below about half is a pipe the track does not have.
Look at those with the segment drawn on the plate before you believe it: a
line that happens to run ALONG another pipe in projection reads bright and
is a false pass, which is how a top bar over the rail on Track 8 survived
the numbers and not the picture.

## Step 9, waypoints, and the hairpin trap

A cubic between two openings does not know about the loop the quad flies
beyond a pole, or the climb over a tower. Where the animation's line does
something the openings do not imply, pin it with a `waypoint`: a step in the
flying order that pins the line through a point, at a height, headed the way
its arrow points, and scores nothing and is drawn nowhere. Track 8 needed
six, Track 5 eight.

**Do not put both legs of a hairpin on the same line.** The first placement
on both tracks ran out and back along one axis at the same offset, and a
cubic through two knots that face opposite ways at the same place is a
needle: the tightest radius came out in millimetres. Separating the legs by
half a unit fixed it. Check the tightest radius after every waypoint move.

## Step 10, export and compare

`node scripts/trackgif.js <track.json>` writes the same kind of animation
back out, and `--camera ex,ey,ez,ax,ay,az,fov` shoots it from a fixed
viewpoint in document metres so it can be laid over the reference. The
camera fitted in step 4 converts straight into those seven numbers: the eye
is its position in lattice units times 27 inches plus the origin, and the
field of view is `2 * atan(512 / f)` in degrees.

Render at `--frames 24` first. A full render is minutes on a software
rasteriser and a smoke render catches a broken scene in seconds.

The loop's length is the LAP's: the quad flies one steady pace whatever the
track, 3.73 m/s on a whoop, which is what RaceGOW's own three animations
average, so a 41 m course is an eleven second clip and a 13 m one is under
four. `--frames` overrides it. Before this the exporter gave every track the
same twelve seconds, so the line moved three times as fast on a busy track
as on a short one, which is exactly what it looks like.

## A scored opening is not always a gate

RaceGOW rule 2 says "all gates must be fully enclosed", and the builder's
aperture draws four sides because of it. The official tracks are not built
that way throughout. A bar on two legs with one leg carried up past the bar
makes two scored openings, one under the bar and one over it, and the one
over it has the bar below and the pole beside and nothing else.

Building that as a square puts two lengths of PVC in mid air, one of them
through the flight path, and boxes in a pole that is meant to be flown
around. All three tracks shipped that way once. So an aperture can be
marked `unbuilt` in the spec: the opening still scores, still lights and
still pins the line, and the pipe around it belongs to the structures
beside it, which draw it themselves. Twelve of the openings across the
three tracks are gaps of this kind.

Two consequences to keep in mind:

- **Something else has to hold the gap up.** The bar below it is usually
  the head of the opening underneath; the upright beside it is usually a
  pole, or the leg of the next structure along. Where neither is true, put
  the pipe in the spec as a `post` (a bare upright the lap does not score)
  or a `rail`, and check step 8b again.
- **A leg that is carried up is not a pole in the rules' sense.** It stands
  half an opening from the gate's centre, which is 13.5 inches on a 27 inch
  lattice, so RaceGOW's 14 inch pole rule and its 36 inch pole to pole rule
  both fire on it. `warnings.js` skips any pole standing on a gate's own
  frame line for exactly that reason.

## What the builder still cannot draw

The bar along the ground. The game draws no member under an opening whose
sill is the floor, so what a pilot flies is the goalpost the reference
shows; the GIF exporter draws the bar rule 2 asks for, so an export carries
one pipe per ground gate that the reference plate does not. It lies on the
floor under the opening and changes no clear height. That is the only
structural difference left between these three tracks and their
animations, and it is written here rather than absorbed.

## What this does not answer

The animation cannot tell you the pipe length, so the series rulebook or the
track owner has to. It cannot tell a 27 inch lattice from a 30 inch one,
which is why the owner's instruction beats `racegow.js`'s published nominal
spacing. Where a lit panel spans two squares it does not say which one is
the gate, and the line crossing it is the only evidence. Everything else on
these two tracks came out of the frames.

## Tooling

The analysis is ad hoc Python with Pillow, NumPy and SciPy, run outside the
repository in a scratch directory. It is deliberately not vendored: this
repository is dependency free JavaScript, and a Python toolchain carried
along for a job done twice a season would cost more than it saves. The
method above is the part worth keeping, and it is all here.

**The caption is not a mirror test when the camera is overridden.** Track 2's
mirror was caught in round 59 by an export whose caption read backwards, and
that worked because the export was framed by the card's own camera, which
always stands the name up for the reader. `--camera` moves the eye and leaves
the nameplate where the framing camera would have put it, so the name can
read backwards on a track that is perfectly correct. Track 3's does. Use step
4c for the mirror and this step for everything else.
