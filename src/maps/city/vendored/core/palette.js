/**
 * One place for every colour in the scene.
 * The palette is deliberately narrow: warm off-whites, a gray-purple road,
 * teal-leaning greens, pale pinks, and four saturated accents (red / yellow /
 * blue / teal) reserved for focal objects.
 */
export const PAL = {
  // --- sky & atmosphere ---
  skyTop: 0x8fbdea,
  skyMid: 0xd4e8fa,
  skyHaze: 0xfbe7e9,
  cloud: 0xfdfaf8,
  cloudShade: 0xe6e6f2,
  fog: 0xe6ecf7,
  hill: 0xc6cfe6,
  hillFar: 0xd8dded,

  // --- light ---
  sun: 0xfff1d8,
  fill: 0xa9bdf5,
  hemiSky: 0xdcecff,
  hemiGround: 0xb6a6c6,

  // --- ink ---
  ink: 0x39324f,
  inkSoft: 0x4a4468,

  // --- ground ---
  road: 0x8e8a9c,
  roadWorn: 0x9a95a6,
  roadDark: 0x7b7689,
  lineWhite: 0xf4f2f6,
  lineYellow: 0xf0c341,
  tactile: 0xf2c53d,
  sidewalk: 0xdcd8e2,
  sidewalkAlt: 0xe7e2e6,
  curb: 0xc7c2d0,
  concrete: 0xd9d5dd,
  concreteMid: 0xc2bdc8,
  concreteDark: 0xa7a2b0,
  gutter: 0xbdb8c4,
  drain: 0x6d687a,
  dirt: 0xc9bfae,
  gravel: 0xa9a3ab,
  ballast: 0x7d7686,

  // --- buildings ---
  wallWhite: 0xfaf6ef,
  wallCream: 0xf2e7d3,
  wallBlue: 0xd6e3ee,
  wallBeige: 0xe7dbc4,
  wallGray: 0xdedee6,
  wallPink: 0xf0dcda,
  /* Added with the north housing block.  The brief for it asked for warm white,
   * pale grey, cream, pale blue, pink-grey *and* pale tea -- and the six tones
   * above stop one short of that, so a street of twelve houses had to reuse.
   * Appended rather than inserted: every `wall:` index in the world is a number. */
  wallTea: 0xdccdb6,
  wallSage: 0xdde2d6,
  roofSlate: 0x59617a,
  roofBlue: 0x4d5c78,
  roofBrown: 0x6b585c,
  roofTeal: 0x4f6b70,
  trim: 0x8b8496,
  glass: 0x9dc0d4,
  glassDark: 0x53627a,
  shutter: 0x6e6a7a,
  shutterLight: 0x847f92,

  // --- accents ---
  red: 0xe0453f,
  redDeep: 0xb5322f,
  redSoft: 0xef6a60,
  yellow: 0xf4c033,
  yellowDeep: 0xd39c1f,
  black: 0x322e3b,
  blackSoft: 0x453f4f,
  teal: 0x2f9c9a,
  tealDeep: 0x22736f,
  blue: 0x3d6ec4,
  blueDeep: 0x2a4f97,
  orange: 0xef8a3c,
  purple: 0x8f6fb5,

  // --- vegetation ---
  leaf: 0x5aa578,
  leafDeep: 0x3f7f60,
  leafPale: 0x84bd97,
  grass: 0x86ab84,
  trunk: 0x9a8082,
  trunkDark: 0x765f62,

  // --- cherry blossom ---
  blossom: 0xfbc6d8,
  blossomLight: 0xfff0f4,
  blossomWarm: 0xfedde2,
  blossomDeep: 0xf0a3c0,
  petal: 0xfcd9e4,
  petalDeep: 0xf6bccf,

  // --- railway ---
  railMetal: 0x6b6472,
  railHead: 0xc2bcc4,
  sleeper: 0x6d6576,
  sleeperLight: 0x847b8c,
  gateYellow: 0xf4c033,
  gateBlack: 0x322e3b,
  signalRed: 0xf2453c,
  signalOff: 0x6a3b44,
  cabinet: 0xd8d5da,
  cabinetTop: 0xb6b2bc,

  // --- train ---
  trainBody: 0xf7f2e6,
  trainBodyShade: 0xe6dfd0,
  trainStripe: 0x2f7fd0,
  trainStripe2: 0x3fae9a,
  trainWindow: 0x3a4258,
  trainWindowLit: 0x6b7794,
  trainSkirt: 0x9aa0ad,
  trainRoof: 0xbdb8bd,
  trainDoor: 0xeae4d8,

  // --- metal / misc props ---
  metal: 0xb8bcc6,
  metalDark: 0x878b96,
  metalWarm: 0xc9c0b4,
  mirrorBack: 0xe4a83c,
  mirrorFace: 0xc8d8e4,
  vendWhite: 0xf8f5f0,
  vendRed: 0xdb4038,
  vendTeal: 0x2e9a98,
  crate: 0x3f7fbf,
  crateAlt: 0xe25a4a,
  basket: 0xdb5a4a,
  bin: 0x5d8fb8,
  taxiYellow: 0xf5be2a,
  taxiYellowDeep: 0xdc9f18,
  cat: 0xf0e6da,
  catDark: 0x6a5f63,
  umbrella: 0xd8ecf4,
  shrineStone: 0xcfcad2,
  shrineBib: 0xd8453f,

  /* ------------------------------------------------------------------ *
   * The wider district.
   *
   * Everything below was added when the world grew out from the crossing
   * into a school, a shrine, a shopping street, a canal and more housing.
   * It stays inside the original range on purpose: pale masses, one or two
   * saturated accents per area, and greens that lean teal.
   * ------------------------------------------------------------------ */

  // --- ground ---
  // The one warm surface in the district.  Held well back from a real ochre:
  // at full saturation it becomes the loudest thing in every frame it is in.
  clay: 0xcfb59c,
  clayLine: 0xe8dcc8,      // lime markings on it
  sand: 0xdccaa6,          // sandpit
  moss: 0x7d9c74,

  // --- water ---
  water: 0x93b8ce,
  waterDeep: 0x6d90ad,
  waterSky: 0xcadff0,      // the block that stands in for a sky reflection
  waterPetal: 0xf3cada,

  // --- stone ---
  stone: 0xc6c0cb,
  stoneDark: 0xa39daf,
  stoneWarm: 0xcfc6bc,

  // --- school ---
  schoolWall: 0xf7f3ea,
  schoolWallAlt: 0xe4ebf2,
  schoolWallBlue: 0xd3e0ec,
  schoolTrim: 0xcfd6de,
  schoolRoof: 0x4d5468,
  gymWall: 0xedeff4,
  gymRoof: 0x59606f,
  blackboard: 0x3d5148,
  deskTop: 0xd8c29c,
  locker: 0xb7c7d5,
  curtain: 0xf4ead9,
  corridor: 0xd8d2c6,

  // --- shrine ---
  torii: 0xd8412f,
  toriiDeep: 0xa72f23,
  shrineWood: 0xa9744f,
  shrineWoodDark: 0x8a604a,
  shrineRoof: 0x69707e,
  rope: 0xf0e5ca,
  ema: 0xe9d9b6,
  bamboo: 0x94b06b,
  bambooDeep: 0x6f8c50,
  cedar: 0x3f6b52,
  cedarDeep: 0x2f5540,
  /* --- 杉林, the cedar plantation ---------------------------------------
   * The second tree species on the hills, and the three tones are chosen to be
   * a *mass* rather than a tree: a 人工林 is read at fifty metres as one dark
   * wedge with a lit edge, and what separates it from the broadleaf grove beside
   * it has to be value, because the two are both green.
   *
   * Relative luminance against what it stands on and next to:
   *
   *     hillGrassSun     0.754      the slope the stand sits on
   *     grove light      0.658      0x8cb884, the broadleaf canopy's top tone
   *     cedarLit         0.517      the sunlit face of a cedar crown
   *     grove deep       0.376      0x3f6b52 -- which is `cedar`, below
   *     cedarDeep        0.296      the shaded underside of the tiers
   *
   * So the stand's *lightest* tone is darker than the broadleaf's middle one,
   * which is what makes the boundary between the two read as a boundary and not
   * as a change of light.  `cedarLit` is deliberately not darker than that: the
   * grove's deep tone is already at the value where the cel ramp's bottom band
   * goes to very nearly the ink colour (see the note on `CAR.forest`), and a
   * crown built entirely out of tones below it would be a black triangle.
   *
   * `cedarBark` is redder than `trunkDark` (0x765f62, a mauve-brown) on purpose.
   * A plantation's clean pruned trunks are half of what says "planted" rather
   * than "grown", so they are the one part of the tree that has to be visibly a
   * different wood from the broadleaf beside it. */
  cedarLit: 0x64906b,
  cedarBark: 0x7e6150,

  // --- shopping street ---
  awningGreen: 0x4f8f6a,
  awningOrange: 0xe08a3c,
  awningBlue: 0x4a7fae,
  awningCream: 0xefe0c2,
  lantern: 0xf6e2c0,
  lanternLit: 0xffd9a0,
  noren: 0x2f4a72,
  norenRed: 0xb5322f,
  norenCream: 0xf2e8d6,
  freezer: 0xd8e6ee,

  /* --- 湯の坂, the onsen street ---
   * A deliberately narrow set, and none of it shared with the shopping
   * street: that row is enamel and plastic, this one is timber, plaster and
   * tile.  Four tones of wood do all the work -- frame, lattice, fresh cedar
   * and the deep members -- against one plaster and one very dark tile, so
   * the whole street is dark structure on a pale field with the lanterns as
   * the only saturated thing in it. */
  onsenWood: 0x8a6647,       // the frame: posts, rails, battens
  onsenWoodDark: 0x513a28,   // the deep members, and the recess behind a 格子
  onsenWoodPale: 0xc4a074,   // fresh cedar: signboards, decking, the footbath
  onsenPlaster: 0xe8dfd0,
  onsenPlasterAlt: 0xd9cdba,
  onsenTile: 0x454452,       // roof tile, near black at this range
  onsenTileEdge: 0x5c5a6a,
  onsenSlab: 0xcac4c6,       // the street's stone
  /* Hot water is paler, greener and far more opaque than the canal's: it is
   * mineral rather than sky, and you read steam off the top of it rather than
   * gravel through it. */
  onsenWater: 0xb9d0d4,
  onsenWaterDeep: 0x8fb0b6,
  onsenSteam: 0xf4eef0,
  onsenIndigo: 0x2c3a52,

  /* --- 裏山, the back hills ---
   * The one part of the world that is *landscape* rather than town, and it needs
   * its own greens for a reason the district colours do not cover: a hillside is
   * read at fifty to two hundred metres, through the haze, at every angle to the
   * sun at once.  `PAL.grass` (0x86ab84) is a lawn tone chosen against pale
   * paving at ten metres; spread over thirty thousand square metres it goes flat
   * and slightly sour.  These three are lifted and pushed a shade warmer so the
   * lit slopes hold their value against the sky, with one deep tone for the
   * shaded and higher ground and one bare-earth tone for the steep faces --
   * which is also what stops a big smooth hill reading as a single blob.
   *
   * The two tunnel tones are separate from `concrete` on purpose: a portal is
   * cast in situ and weathered, so it is greyer and a little darker than the
   * town's precast, and the bore has to be near-black at the mouth or the tunnel
   * reads as a painted arch on a hillside. */
  /* ------------------------------ the hillside ------------------------------
   * **A ladder of five, and the reason it has to be a ladder is the cel ramp.**
   *
   * `RAMPS[3]` is `[92, 178, 255]` on a three-texel `NearestFilter` texture
   * sampled at `dotNL * 0.5 + 0.5`, so its band boundaries fall at
   * `dotNL = ±1/3` and nowhere else.  Measured over the 22 000 facets of
   * ひばり山: 66.5 % of them land in the top band and 31 % in the middle one, and
   * within any one *slope* they are all in the same band -- from a local
   * `dotNL` of 0.8 a facet has to turn about 35° to cross into the next one, which
   * on a 3 m lattice is a metre and a half of relief per cell.  So **direct light
   * cannot give a gentle hillside its form here**, and no amount of roughness
   * changes that.  The material value has to do it instead, which is what these
   * five are for.
   *
   * Relative luminance (0.2126 R + 0.7152 G + 0.0722 B on the sRGB values):
   *
   *     hillGrassSun   0.754   the sunlit turf
   *     hillBracken    0.739   dry ススキ and bracken on the high sunny slopes
   *     hillGrass      0.701   the mid tone
   *     hillEarth      0.700   bare earth -- same value as the mid green on
   *                            purpose, separated by hue, and only ever on faces
   *                            steeper than 0.74 where the light differs anyway
   *     hillGrassDeep  0.574   the damp shaded flanks and the gully floors
   *
   * **The sun tone was 0xc2d69b at 0.806 and the hill rendered bleached.**  It is
   * the *lightest* tone and it lands on the near sunny slope, which is the largest
   * area in every frame taken from the town side -- and that slope is already in
   * the ramp's top band, so 0.806 of material on top of full direct light came out
   * as a sheet of pale yellow-green.  0.754 is a 0.053 step over the mid tone,
   * which is small but is *all* that is wanted there: the form has to be carried
   * by the dark end of the ladder, where 0.701 to 0.574 is a 0.127 step, because
   * that is the end the eye reads a cel image from.
   *
   * Bracken carries hue rather than value -- 0.038 off the sun tone but decisively
   * yellower -- so it reads as a change of *cover* and not as a change of light.
   * `hillGrass`, `hillGrassDeep` and `hillEarth` keep their old values because
   * `tunnel.js` builds its cutting faces from `hillEarth` and `buildMoss` mixes
   * `hillGrassDeep`. */
  hillGrassSun: 0xb4c98e,
  hillGrass: 0x9fbc90,
  hillGrassDeep: 0x7a9c78,
  hillBracken: 0xc6bf86,
  /* The floor of a 杉林, at 0.495 -- the only ground tone darker than
   * `hillGrassDeep`, and the sixth surface mesh.
   *
   * It exists because the first plantation went in over `hillBracken`: a closed
   * block of near-black conifer standing on the brightest, driest, most open
   * ground tone there is, which is a contradiction you can see from the crest
   * walk without knowing anything about forestry.  Bracken is what grows where
   * the light gets in.  Under 11 m of cedar at 4 m centres nothing does, and the
   * floor is needle litter: warm, dull, olive-brown, and *darker than any grass*.
   *
   * Which is also why it earns its own material instead of borrowing
   * `hillGrassDeep`.  The stands are 12 % of the range, and folding them into the
   * deep tone would take it from 31.6 % of the drawn surface to about 40 -- past
   * the one-third ceiling the five-tone ladder was built to hold.  A sixth mesh
   * is one draw call against ~5 800 in the heaviest view.
   *
   * Tinted mauve rather than blue (`0x847a94`) for the same reason bracken is:
   * this is the ground that is *always* in shade, so its shadow band is most of
   * what is ever seen of it, and a blue-shifted olive at this value is mud. */
  hillLitter: 0x7e8163,
  /* Held well back from an ochre, for the reason `clay` is: a bare-earth scar on
   * a green hillside is a large area, and at full saturation it becomes the
   * loudest thing in the frame -- the first pass read as sheets of gold leaf on
   * the cutting banks. */
  hillEarth: 0xbdb2a2,
  hillRock: 0xb4aeb6,
  hillMoss: 0x83a06d,
  hillPath: 0xc8b69a,
  hillPathStone: 0xc0bcc4,
  tunnelFace: 0xc7c2ca,
  tunnelFaceDark: 0xaba7b3,
  tunnelBore: 0x565269,
  tunnelBoreDeep: 0x322f42,

  /* ------------------------- ひばり湖 -------------------------
   * The lake, and its water is a **different problem from the canal's**.
   *
   * `waterDeep` (0x6d90ad) works in a 5 m concrete channel because the whole
   * surface is 2.5 m wide, always in the shade of its own revetment, and read
   * from directly above.  Spread over ten thousand square metres, read from a
   * viewpoint eight metres up and against a pale sky, that same tone comes out as
   * flat slate: it is *darker* than the sky it is supposed to be reflecting, so
   * the water reads as a hole rather than as a surface.
   *
   * So the lake's ladder starts from the sky and works down, and the numbers are
   * relative luminance (0.2126R + 0.7152G + 0.0722B on the sRGB values):
   *
   *     lakeSky      0.798   the block that stands in for a sky reflection
   *     lakeShallow  0.688   the first metre, over pale silt -- green, not blue
   *     lakeWater    0.588   the body of it
   *     lakeDeep     0.470   the middle, and the shade of the far bank
   *     canal waterDeep 0.470  -- the same value, which is the point: what the
   *                              channel uses as its *base* is this one's floor
   *
   * `lakeShallow` leans decisively green and `lakeDeep` decisively blue-violet,
   * which is the one thing that makes a body of water read as having depth in a
   * three-band cel image: the eye takes the hue shift as distance from the bank
   * even where the value step is too small to see.
   *
   * `lakeGlint` is the only near-white in the set and is used for perhaps 2 % of
   * the surface -- the wind lanes and the ripple rings.  Any more and the lake
   * stops being a quiet one, which the brief for this place is explicit about. */
  lakeSky: 0xcfe3f2,
  lakeShallow: 0x9dc4bd,
  lakeWater: 0x7ba6bd,
  lakeDeep: 0x5f83a4,
  lakeGlint: 0xf2f7fa,
  /** the block-colour reflection of the far hills, and of blossom on the bank */
  lakeHillEcho: 0x86a8a8,
  lakeBloomEcho: 0xe6c3cf,
  /* The bed, and the drawdown margin above the waterline.  The bed is silt seen
   * *through* water, so it is desaturated toward the water's own hue rather than
   * being a ground colour; the margin is the pale dried mud a pond in spring
   * always has a metre of, and it is what draws the waterline as a band rather
   * than as a single ink line. */
  lakeBed: 0x9aae9e,
  lakeShore: 0xcfc6b4,
  /* 柳 -- see the note by `GREEN_TONES` in `trees.js`.  The palest, yellowest
   * green in the world, on purpose: a willow at a lakeside is the one tree that
   * has to be lighter than the hill behind it. */
  willow: 0xa8c489,
  /* The hire boats.  Four hulls, and the constraint is the same one `CAR` has --
   * nothing saturated enough to be the loudest thing in the frame - except that
   * a rowing boat is *allowed* one, because a row of white hulls with a single
   * red one in it is what a park boat station looks like from across the water. */
  boatWhite: 0xf0ece2,
  boatBlue: 0xa8c6d8,
  boatYellow: 0xe8d295,
  boatRed: 0xcf6a5e,
  boatTeal: 0x77b3ad,
  boatDeck: 0xc9b492,
  /* Tents: low saturation on purpose.  A campsite of bright nylon is a festival;
   * four canvas-toned tents under trees is a Tuesday in April. */
  tentCream: 0xe4dcc6,
  tentGreen: 0xb8c4a6,
  tentBlue: 0xb4c6d2,
  tentOchre: 0xcbb08a,
};

/** Bright can/bottle colours for vending machine shelves. */
export const DRINKS = [
  0xe0453f, 0xf4c033, 0x3d6ec4, 0x2f9c9a, 0xef8a3c, 0x8f6fb5,
  0x5aa578, 0xf4f2f6, 0xe86f9c, 0x44b4d8, 0xc94f7a, 0x9dbb3c,
];
