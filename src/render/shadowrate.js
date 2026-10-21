/*
 * shadowrate.js: how often a world redraws its shadow map.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * WHY A SHADOW MAP DOES NOT NEED A REDRAW EVERY FRAME.
 *
 * Three redraws the whole map each frame by default: the sun's camera is
 * re-aimed at the craft, and every caster in its box is drawn again, 50 to
 * 90 draws and up to 180,000 triangles a frame on Medium (perf-hunt item 11).
 * But the world under the map does not move, and the camera is snapped to the
 * map's own texel grid, so a map drawn a few frames ago still holds the right
 * depths for every static caster. Three keeps the shadow matrix that goes
 * with the map it last drew, so a stale map is stale in what it covers and
 * never in where it puts a shadow: nothing slides, nothing crawls.
 *
 * What a stale map does cost is two things, and the gate below bounds both:
 * the box's edge, which trails the craft by how far it has flown since the
 * last draw (a few metres on a box tens of metres across, at its far edge),
 * and a moving caster, a car, whose shadow steps at the map's rate and not
 * the frame's. A redraw is therefore asked for when the focus has moved a
 * twenty fifth of the box's half width, or when `every` frames have gone by,
 * whichever comes first. At 20 m/s and 60 fps the first reads about every
 * second or third frame on the field and every frame or two in the town, so
 * the saving is in the quiet frames, the hover, the title and the slow turn,
 * and a flat out run is capped at one redraw in `every`.
 *
 * `every` of 1 is the old behaviour exactly: autoUpdate stays on and this
 * object does nothing. It is set on the renderer either way, because the
 * renderer is the shell's and outlives the world: the world that follows
 * must not inherit a switched off map.
 */
export function makeShadowRate(renderer, every, half) {
  const on = every > 1 && half > 0;
  renderer.shadowMap.autoUpdate = !on;
  renderer.shadowMap.needsUpdate = true;
  const gate2 = (half / 25) * (half / 25);
  let age = 0;
  let x = 1e9;
  let y = 1e9;
  let z = 1e9;
  return {
    every: on ? every : 1,
    /* Called once a frame with the snapped focus, after the light has been
     * moved to it. */
    step(focus) {
      if (!on) {
        return;
      }
      age += 1;
      const dx = focus.x - x;
      const dy = focus.y - y;
      const dz = focus.z - z;
      if (age >= every || dx * dx + dy * dy + dz * dz > gate2) {
        renderer.shadowMap.needsUpdate = true;
        age = 0;
        x = focus.x;
        y = focus.y;
        z = focus.z;
      }
    },
  };
}

/*
 * A SHADOW PROXY IS NOT DRAWN IN THE COLOUR PASS.
 *
 * Both proxy builders (proxyCasters in ../maps/built/index.js and
 * buildShadowProxies in ../maps/city/bake.js) turn colour and depth writes
 * off and take that to mean the colour pass costs nothing. It does not: three
 * still submits the mesh, runs every vertex through the shader and rasterises
 * every triangle, only to throw each fragment away. On Heads' house on High
 * that was about 100,000 triangles a frame, a second copy of the yard's trees
 * and furniture, drawn for nothing.
 *
 * Three cannot be told to leave a mesh out of one pass and keep it in the
 * other: visibility, layers and the material's own `visible` are all read by
 * both passes, with the main camera's layers in both (checked in the vendored
 * r160 source, WebGLShadowMap's renderObject and the renderer's projectObject).
 * What does differ is the hook: the colour pass calls `onBeforeRender` and the
 * shadow pass calls `onBeforeShadow` instead. So the colour pass hands the
 * renderer a negative draw range, which renderBufferDirect returns on before
 * any draw call, and `onAfterRender` puts the range back for the shadow pass.
 * Nothing the proxy painted was ever visible, so no pixel changes; the shadow
 * pass sees the range it always saw.
 */
export function shadowOnly(mesh) {
  const range = mesh.geometry.drawRange;
  const count = range.count;
  mesh.onBeforeRender = () => {
    range.count = -1;
  };
  mesh.onAfterRender = () => {
    range.count = count;
  };
  return mesh;
}
