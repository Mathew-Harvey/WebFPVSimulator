# Maps

Two worlds, one shell. `src/render/shell.js` owns everything that outlives a
map: the renderer, the canvas, the camera and the airframe. A map owns its
scene, its post chain, its colliders and its contact data, and disposes all of
it when it is swapped out. That split is what keeps only one map's render
targets alive at a time, which is what keeps P5's 120 MB budget meaningful.

`registry.js` is the only place either map is named, and both of its loaders
are dynamic `import()`. That is not style: a static import of the city would
fetch 59 vendored files at boot for a player who only ever flies the race
field. `tests/lib/checks.js` check 16 measures it.

## The contract a map module must satisfy

    export async function buildMap(shell, onProgress, options) -> MapInstance

`shell` is `{ renderer, camera, canvas, pixelRatio, quad, discs, resize }`.
`onProgress(fraction)` is optional and drives the loading screen's world stage.
`options` is optional. `options.quality` is `'low' | 'medium' | 'high'` and
selects the graphics preset in `src/render/quality.js`. Custom tracks also
accept `options.document`. The instance stamps `graphics` with the resolved
id.

A MapInstance is:

    id            'field' | 'city' | 'custom'
    name          what the menu shows
    mode          'race' | 'freestyle'
    graphics      'low' | 'medium' | 'high'
    scene         THREE.Scene, with shell.quad added to it
    post          { render(), setSize(w, h) }
    colliders     a built src/game/collide.js Colliders
    gates         array, EMPTY on a freestyle map and that is a real state
    curve         the racing line, or null
    spawn         { x, z, yaw }
    attract       { x, y, z, radius, eye, aim } for the title camera
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
