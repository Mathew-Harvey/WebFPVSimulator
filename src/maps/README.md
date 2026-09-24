# Maps

Two kinds of world, one shell. `src/render/shell.js` owns everything that outlives a
map: the renderer, the canvas, the camera and the airframe. A map owns its
scene, its post chain, its colliders and its contact data, and disposes all of
it when it is swapped out. That split is what keeps only one map's render
targets alive at a time, which is what keeps P5's 120 MB budget meaningful.

`registry.js` is the only place a map is named, and its loaders are dynamic
`import()`. That is not style: a static import of the city would fetch 59
vendored files at boot for a player who only ever flies the race field.
`tests/lib/checks.js` check 16 measures it.

There used to be three more freestyle worlds, each with its own copy of the
city's cel kit so that choosing one fetched nothing under `src/maps/city`.
Industrial bando, Municipal baths and Bardwell's yard were removed on
2026-08-30 on the owner's ask: Freestyle offered the town and nothing else.
They are in the history at 974f4ce.

On 2026-09-24 the owner asked for one more (FREESTYLE-MAPS-PLAN.md, section
6), so Freestyle offers two: the town, and **Your map**, `built/`. That is a
freestyle map made in the track builder, or Hibari Yard, the starter
(`built/starter.js`), until the pilot has made one. It draws through the
shared asset library in `src/props`, which uses the town's cel kit where it
stands, so choosing it fetches twelve files under `src/maps/city/vendored`
(the core kit, and the town's vehicle and vending machine builders) and
none of the town itself.

### `built/`, in one paragraph

`place.js` places a freestyle document in the world and says what is
solid, pure, so the builder's warnings and the map read one answer.
`index.js` draws what it placed in the town's look (fog, four lights, the
sky and ridge lines, the post chain), paints a yard under it, wires the
poles and pylons, and puts exactly the placed solids in the Colliders the
shell uploads. The ground is flat at zero. A named gap draws nothing. The
ink pass is the town's with one change, taken on inverse depth so a flat
yard is not inked along the horizon; the reason is at `BuiltPipeline`.

## The contract a map module must satisfy

    export async function buildMap(shell, onProgress, options) -> MapInstance

`shell` is `{ renderer, camera, canvas, pixelRatio, quad, discs, resize }`.
`onProgress(fraction)` is optional and drives the loading screen's world stage.
`options` is optional. `options.quality` is `'low' | 'medium' | 'high'` and
selects the graphics preset in `src/render/quality.js`. Custom tracks and
built maps also accept `options.document`, which builds that document
without touching any seat. The instance stamps `graphics` with the resolved
id.

A MapInstance is:

    id            'field' | 'city' | 'custom' | 'built'
    name          what the menu shows
    mode          'race' | 'freestyle'
    graphics      'low' | 'medium' | 'high'
    scene         THREE.Scene, with shell.quad added to it
    post          { render(), setSize(w, h) }
    colliders     a built src/game/collide.js Colliders
    gates         array, EMPTY on a freestyle map and that is a real state
    curve         the racing line, or null
    spawn         { x, z, yaw }
    attract       { path, speed, lookAhead, aimDrop } for the title camera
    references    measured reference objects, for check 15
    height(x, z, fromY)   the contact surface
    setNextGate(sceneIndex)
    updateShadowFocus(target)
    updateWind(t, quadPos, wash)
    updateAnim(stepIndex)
    dispose()
    stats()       optional, harness only

### `height(x, z, fromY)` is three arguments, and the third one is the point

`fromY` is the height the query is made FROM. A platform is only offered if it
is within a step of it, so a quad above the overbridge lands on the deck and a
quad under it sees the road. The race field has one ground surface and ignores
the argument; it takes it anyway so `main.js` has one call shape.

`heightAt` cannot express that a deck is also SOLID from underneath, so the
city adds a thin slab collider under every raised platform. See
`city/index.js`.

### `updateAnim(stepIndex)` takes an integer step count, not a delta

Anything a map animates that a craft can HIT must be a pure function of the
fixed step count, or the geometry becomes a function of the frame rate and a
dropped frame changes the trajectory from the scenery side. During a run the
step count is the physics clock, so a collision is reproducible from a
recorded input stream. See `city/animation.js` for the worked example: a level
crossing whose booms were an integrator over raw frame time.

### Renderer state belongs to the map

The two maps want different shadow filtering and different clear colours, and
a map that silently inherits the other one's renderer state is a defect that
only shows up on the second map you load. Set what you need at the top of
`buildMap`.
