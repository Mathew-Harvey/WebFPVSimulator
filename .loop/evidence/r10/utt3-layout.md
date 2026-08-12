# UTT 3 Bessel Run, the real layout. The T4 blocker is not a blocker.

The previous loop expected the UTT diagram PDFs to be unreadable in this
container and expected T4 to be closed by honestly labelling the course as an
original chapter layout. That expectation was wrong, and it was wrong for a
recoverable reason: `WebFetch` cannot render a PDF, but `curl` can download
one, and the diagram inside is a raster image that can be extracted from the
PDF's own image XObjects and measured.

**A real UTT is therefore buildable and the track must be UTT 3 Bessel Run,
not an original layout.**

## Sources, all fetched this round

- Obstacle dimensions:
  <https://www.multigp.com/multigp-drone-race-course-obstacles/>
- UTT index and per track guides:
  <https://www.multigp.com/universal-time-trial-utt/>
- UTT 3 guide PDF, 3 pages, 689,588 bytes, HTTP 200:
  <https://www.multigp.com/wp-content/uploads/2017/05/MultiGP-universal-time-trial-track-3-BesselRun-002.pdf>

The PDF is **not vendored into this repository**. It is MultiGP artwork under
an unstated licence, and D5 forbids adding an external asset without a
justification. Nothing in the build needs the file: what the build needs is
the dimensions, and those are written down here with their provenance.

## What the diagram page states in words

Extracted from the layout page of the PDF (image XObject 5, 1294 by 1000,
FlateDecode, DeviceRGB):

- Title: "Universal Time Trial Track 3", "BESSEL RUN".
- Required: "4 standard MultiGP gates and 1 standard MultiGP start/finish
  timing gate", drawn as x4 and x1.
- "The red lines are for measuring purposes only."
- "Gates must be traversed in the direction indicated by arrows. Gates must
  be traversed in this numerical sequence: 1-5"
- "No flags allowed."
- Field scale bars: "10 yds - 30 ft - 9.1 m", "100 yds  300 ft  ~91 m" along
  the long axis, "40 yds  120 ft  ~36.5 m" along the short axis.
- Dimensioned spacings along the lower row, left to right:
  gate 5, "23 ft - 7m", gate 4, "69 ft - 21m", gate 3, "92 ft - 28m", gate 2.
- One perpendicular dimension: "46 ft - 14m", between the timing gate's row
  and the lower row.
- Footer: "(C)2016 MULTIGP - 2016 SEASON - UNIVERSAL TIME TRIAL TRACK #3 v002".

## What was measured from the diagram, and how accurate it is

The five numbered badges were located by clustering the badge fill colour,
rgb(141, 25, 28), in the extracted raster. Cluster centroids, in diagram
pixels:

    badge 5   260.6, 725.6
    badge 4   353.4, 644.4
    badge 3   639.7, 641.2
    badge 2  1003.5, 725.6
    badge 1   582.1, 510.6   (labelled "Timing Gate")

Badges 2 to 5 are offset vertically from their gate glyphs but not
horizontally, so their x is their gate's x. Badge 1 sits to the LEFT of its
glyph, which is at x = 625 plus or minus 5 px, read off the zoomed crop.

Scale, derived three independent ways from the three published spacings:

    5 to 4:   353.4 - 260.6 =  92.8 px over  7 m  =  13.26 px/m
    4 to 3:   639.7 - 353.4 = 286.3 px over 21 m  =  13.63 px/m
    3 to 2:  1003.5 - 639.7 = 363.8 px over 28 m  =  12.99 px/m
    mean 13.29 px/m, spread plus or minus 2.6 percent

Applying the mean scale to the one measurement the diagram does not
dimension, the timing gate's lateral offset from gate 3:

    625 - 639.7 = -14.7 px = -1.1 m, plus or minus 0.3 m

So the timing gate is laterally aligned with gate 3 to within the diagram's
own drawing tolerance, and the build should place it exactly on gate 3's
lateral position rather than pretending to 1.1 m of precision the artwork
does not carry.

Perpendicular offset cross check: badge 1 to the lower row is
725.6 - 510.6 = 215 px using badge 5's row, and 641.2 - 510.6 = 130.6 px
using badge 3's. The badges on the lower row are drawn on two different
sides of their glyphs, so neither is the row separation. The red bracket
spans y 508 to y 700, 192 px, which at 13.29 px/m is 14.4 m against the
published 14 m. The published figure is the one to build to.

## The layout, in metres, ready to build

Course frame: x along the field's long axis, y up, z across the short axis.
Origin at gate 3, because gate 3 is the one both dimension chains meet at.

| gate | role | x, m | z, m | opening faces |
|------|------|------|------|---------------|
| 1 | start and finish timing gate | 0 | -14 | along x |
| 2 | standard gate | +28 | 0 | along z |
| 3 | standard gate | 0 | 0 | along z |
| 4 | standard gate | -21 | 0 | along z |
| 5 | standard gate | -28 | 0 | along z |

Row span gate 5 to gate 2 is 7 + 21 + 28 = 56 m, inside the 91 m long axis.
The timing gate at 14 m off the row is inside the 36.5 m short axis. The
whole course fits in a football field, which is what MultiGP says it should.

Gate glyph orientation, read off the zoomed crop: gates 2, 3, 4 and 5 are
drawn as front elevations, two legs and a top banner, which in a plan view
means the opening faces along the page's short axis. Gate 1 is drawn edge on,
a bracket, so its opening faces along the long axis. That is the difference
between a gate you cross the row through and a gate you fly down the row
through, and it is the whole shape of the course.

## The racing line, from MultiGP's own render

The same PDF carries a rendered racing line for the track (image XObject 4,
1920 by 779, DCTDecode). It is a closed loop shaped like a decaying
oscillation, which is what the track's name and its logo say it is: one large
outer arc across the top, a smaller inner arc, a deep bowl, a small hump, and
a hairpin at each end.

Gate crossing glyphs appear on that line at, in render pixels, x = 150, 345,
910 and 1660 on the lower row at y about 515, and one at x = 910, y = 130 on
the top arc. Normalising the four row positions by their total span gives
0.129, 0.374 and 0.497 of the span for the three gaps, against 0.125, 0.385
and 0.490 from the dimensioned plan. They agree to within 3 percent, which
identifies the render's leftmost row gate as gate 5 and its rightmost as
gate 2, and puts the timing gate on the top arc directly across the field
from gate 3. That is the same layout, drawn twice, and the two agree.

## What is still not established

The direction arrows themselves are below the resolution of the extracted
raster. The sequence 1 to 5 is stated in words and the topology is fixed by
the racing line render, which between them determine the direction of travel
through every gate up to one global choice of which way round the loop is
flown. **Do not write a direction into the build as though it were read off
an arrow.** State it as derived from the sequence plus the racing line, and
say so where the track is defined.

## Obstacle library, published dimensions, for T3

Converted at the boundary, SI inside, per CLAUDE.md. 1 ft = 0.3048 m exactly.

| obstacle | published | metres |
|---|---|---|
| standard gate opening | 5 ft by 5 ft | 1.524 by 1.524 |
| championship gate opening | 7 ft by 6 ft | 2.1336 wide by 1.8288 tall |
| 5x5 tower | standard gate elevated 5 ft | base at 1.524 |
| 7x6 tower | championship gate elevated 6 ft | base at 1.8288 |
| double gate tower | two gates stacked | |
| ladder | three gates stacked | |
| topless ladder | three gate ladder, no top panel | |
| dive gate | 7x6 elevated 15 ft, slightly angled | base at 4.572 |
| launch gate | 7x6, not angled, panels facing the ground | |
| split-S gate | 7x6, flags 1.5 ft behind and to the side | flags at 0.4572 |
| offset 90 gate | gate joined to a tower at 90 degrees | |
| hurdle | 5 ft tall, 10 ft wide | 1.524 by 3.048 |
| h-hurdle | hurdle plus 1 ft of pole | 1.524 plus 0.3048 |
| gate plus flag | 5x5 gate, side panel at least 5 ft tall, at least 1 ft wide | 1.524 by 1.524, panel 1.524 by 0.3048 |
| micro or whoop gate | 19 in by 19 in, 361 sq in | 0.4826 square |

UTT 3 needs only the standard gate and the start and finish timing gate, and
allows no flags. T3 wants five distinct obstacle types on the track, and UTT 3
has two. Those two bars point in opposite directions and the conflict is
recorded in `.loop/threshold-disputes.md` rather than resolved by softening
either one.
