/*
 * budget.js: measure the hardware contract, rather than assert it.
 *
 * The minimum spec for this project is a mid range laptop from five years
 * ago at 1920 by 1080 and 60 frames per second. Absolute frame rate is not
 * measurable in a software rasterised container, so the contract is a set
 * of proxies that are: draw calls, triangles, full resolution post passes,
 * texture taps per output pixel, render target bytes, load time, the worst
 * synchronous block, shadow maps, and resident vertex attribute bytes.
 *
 * Everything here reads the live objects. Nothing is a constant copied out
 * of a comment. The pass count and the tap count in particular come from
 * instrumenting one real frame and reading the fragment shader source that
 * was actually bound, because a pass list read from a source file does not
 * know which passes are enabled or what resolution they ran at.
 *
 * Called on demand from the capture harness through window.__budget. It is
 * never called from the frame loop.
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

import * as THREE from 'three';

const CHANNELS = new Map([
  [THREE.RedFormat, 1],
  [THREE.RGFormat, 2],
  [THREE.RGBFormat, 3],
  [THREE.RGBAFormat, 4],
  [THREE.DepthFormat, 1],
  [THREE.DepthStencilFormat, 1],
]);

const TYPE_BYTES = new Map([
  [THREE.UnsignedByteType, 1],
  [THREE.ByteType, 1],
  [THREE.ShortType, 2],
  [THREE.UnsignedShortType, 2],
  [THREE.IntType, 4],
  [THREE.UnsignedIntType, 4],
  [THREE.HalfFloatType, 2],
  [THREE.FloatType, 4],
  [THREE.UnsignedInt248Type, 4],
]);

function texelBytes(texture) {
  const ch = CHANNELS.get(texture.format) ?? 4;
  const by = TYPE_BYTES.get(texture.type) ?? 1;
  return ch * by;
}

/*
 * A multisampled colour target costs the resolve texture plus one
 * renderbuffer per sample, because the driver keeps both: the samples are
 * written during rasterisation and resolved into the texture afterwards.
 * That is why samples: 4 on an RGBA16F target at 1080p is 5 x 8.3 MB and
 * not 8.3 MB, and it is the single largest line in this ledger.
 */
function targetBytes(rt, label) {
  if (!rt) {
    return null;
  }
  const w = rt.width;
  const h = rt.height;
  const samples = rt.samples > 1 ? rt.samples : 1;
  const colour = w * h * texelBytes(rt.texture) * (samples > 1 ? samples + 1 : 1);
  let depth = 0;
  if (rt.depthTexture) {
    depth = w * h * texelBytes(rt.depthTexture);
  } else if (rt.depthBuffer) {
    /* three.js allocates DEPTH_COMPONENT24 without a stencil buffer, and
     * DEPTH24_STENCIL8 with one. Both are four bytes per pixel. */
    depth = w * h * 4 * (samples > 1 ? samples : 1);
  }
  return { label, w, h, samples, bytes: colour + depth };
}

const TAP_CALL = /\btexture(2D|Cube|2DProj|Lod|Grad)?\s*\(/g;

function strip(source) {
  return String(source || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
}

function countIn(code, re) {
  const m = code.match(re);
  return m ? m.length : 0;
}

/*
 * Taps per output pixel, which is not the same as the number of times
 * texture2D appears in the file. A shader that writes one fetch inside a
 * helper and calls the helper five times costs five fetches per pixel and
 * reads as one in the source. P4 is a bandwidth budget, so it has to be
 * the dynamic figure.
 *
 * So: pull out every user defined function with a brace matched body,
 * count each one's direct taps and its calls to the others, and resolve
 * main by substitution. Recursion is impossible in GLSL, so the
 * substitution terminates. Loops are the one thing this cannot see, and a
 * pass containing one is flagged rather than guessed at.
 */
function countTaps(source) {
  const code = strip(source);
  const defs = new Map();
  const bodies = [];
  const head = /\b(?:void|float|int|bool|u?vec[234]|mat[234])\s+(\w+)\s*\([^)]*\)\s*\{/g;
  let m;
  while ((m = head.exec(code)) !== null) {
    let depth = 1;
    let i = head.lastIndex;
    while (i < code.length && depth > 0) {
      if (code[i] === '{') {
        depth += 1;
      } else if (code[i] === '}') {
        depth -= 1;
      }
      i += 1;
    }
    const body = code.slice(head.lastIndex, i - 1);
    defs.set(m[1], body);
    bodies.push(body);
  }
  const cache = new Map();
  function cost(name, seen) {
    if (cache.has(name)) {
      return cache.get(name);
    }
    const body = defs.get(name);
    if (body == null || seen.has(name)) {
      return 0;
    }
    seen.add(name);
    let total = countIn(body, TAP_CALL);
    for (const other of defs.keys()) {
      if (other === name || other === 'main') {
        continue;
      }
      const calls = countIn(body, new RegExp(`\\b${other}\\s*\\(`, 'g'));
      if (calls > 0) {
        total += calls * cost(other, seen);
      }
    }
    seen.delete(name);
    cache.set(name, total);
    return total;
  }
  const taps = defs.has('main') ? cost('main', new Set()) : countIn(code, TAP_CALL);
  return { taps, loops: countIn(bodies.join('\n'), /\bfor\s*\(/g) };
}

/*
 * One instrumented frame. Every fullscreen quad in three.js goes through
 * renderer.render with a Mesh as the scene argument, so patching
 * setRenderTarget and render for the duration of one frame records what
 * resolution each pass ran at and which fragment shader was bound. That is
 * a measurement of the frame that ran, not a reading of the pass list.
 */
function traceFrame(renderer, renderFrame) {
  const passes = [];
  /*
   * Every render target the frame binds, collected from the bind itself
   * rather than from a hand written list. An earlier version of this file
   * listed the targets it knew about and deduplicated them on rt.uuid,
   * which WebGLRenderTarget does not have, so the whole ledger collapsed
   * to whichever target was added first and reported 116 MB where the
   * real figure was more than twice that. Watching the binds cannot miss
   * a target, including ones inside three.js that this file has never
   * heard of, such as the shadow map and the bloom mip chain.
   */
  const targets = new Set();
  const realSetTarget = renderer.setRenderTarget.bind(renderer);
  const realRender = renderer.render.bind(renderer);
  let cur = null;
  let curW = renderer.domElement.width;
  let curH = renderer.domElement.height;

  renderer.setRenderTarget = (rt, ...rest) => {
    cur = rt || null;
    if (rt) {
      targets.add(rt);
      curW = rt.width;
      curH = rt.height;
    } else {
      curW = renderer.domElement.width;
      curH = renderer.domElement.height;
    }
    return realSetTarget(rt, ...rest);
  };
  renderer.render = (scene, camera) => {
    const quad = scene.isMesh === true;
    const t = quad ? countTaps(scene.material.fragmentShader) : { taps: 0, loops: 0 };
    passes.push({
      w: curW,
      h: curH,
      quad,
      target: cur,
      name: quad ? (scene.material.name || scene.material.type) : (scene.type || 'scene'),
      taps: t.taps,
      loops: t.loops,
    });
    return realRender(scene, camera);
  };
  try {
    renderFrame();
  } finally {
    renderer.setRenderTarget = realSetTarget;
    renderer.render = realRender;
  }
  return { passes, targets };
}

export function measureBudget(view, post, extra) {
  const renderer = view.renderer;
  const canvasW = renderer.domElement.width;
  const canvasH = renderer.domElement.height;

  /* P3 and P4: instrument one real frame. P1 and P2 come from the same
   * frame, counted the way the frame loop counts them, so every number in
   * this ledger refers to one frame from one camera position. */
  renderer.info.reset();
  const traced = traceFrame(renderer, () => post.render());
  const fullRes = traced.passes.filter(
    (p) => p.quad && p.w === canvasW && p.h === canvasH,
  );
  const fullResPasses = fullRes.length;
  const fullResTaps = fullRes.reduce((a, p) => a + p.taps, 0);
  const fullResLoops = fullRes.reduce((a, p) => a + p.loops, 0);

  /* P5: every render target the frame bound, named by what was drawn into
   * it, plus the composer's back buffer, which the frame allocates and
   * swaps to even when a given frame's pass order happens not to bind it. */
  const named = new Map();
  for (const p of traced.passes) {
    if (p.target && !named.has(p.target)) {
      named.set(p.target, p.name);
    }
  }
  const rts = new Set(traced.targets);
  if (post.composer) {
    rts.add(post.composer.renderTarget1);
    rts.add(post.composer.renderTarget2);
  }
  /* A shadow map's size is authored, not derived from the panel, so it is
   * the one target that does not scale with resolution. Collected here so
   * that the figure derived for 1080p from a 900p capture is right: an
   * earlier version scaled the whole total by pixel area and over
   * reported by 12.8 percent. */
  const shadowRts = new Set();
  view.scene.traverse((o) => {
    if (o.isLight && o.castShadow && o.shadow && o.shadow.map) {
      shadowRts.add(o.shadow.map);
    }
  });

  const targets = [];
  for (const rt of rts) {
    if (!rt) {
      continue;
    }
    const t = targetBytes(rt, `${rt.width}x${rt.height} <- ${named.get(rt) || 'allocated, not bound this frame'}`);
    if (t) {
      t.scales = !shadowRts.has(rt);
      targets.push(t);
    }
  }

  /*
   * The default framebuffer. It is a render target the frame writes into
   * every single frame, it is the size of the panel, and an earlier
   * version of this file could not see it because it only counted objects
   * passed to setRenderTarget and the canvas is passed as null. That is
   * 16.6 MB at 1080p missing from a 120 MB budget. Read from the context's
   * actual attributes rather than assumed: a browser is free to give the
   * canvas a stencil buffer nobody asked for, and this one does.
   */
  const gl = renderer.getContext();
  const attrs = gl.getContextAttributes ? gl.getContextAttributes() : {};
  const fbDepthBytes = (attrs.stencil ? 4 : (attrs.depth ? 4 : 0));
  targets.push({
    label: `${canvasW}x${canvasH} <- the default framebuffer, rgba${attrs.depth ? ' + depth' : ''}${attrs.stencil ? ' + stencil' : ''}`,
    w: canvasW,
    h: canvasH,
    samples: 1,
    bytes: canvasW * canvasH * (4 + fbDepthBytes),
    scales: true,
  });
  targets.sort((a, b) => b.bytes - a.bytes);

  /* P9: shadow maps, from the lights themselves. */
  const shadows = [];
  view.scene.traverse((o) => {
    if (o.isLight && o.castShadow) {
      shadows.push({
        light: o.type,
        size: `${o.shadow.mapSize.x}x${o.shadow.mapSize.y}`,
        allocated: !!(o.shadow && o.shadow.map),
      });
    }
  });
  const targetBytesTotal = targets.reduce((a, t) => a + t.bytes, 0);

  /* P10: resident vertex attribute bytes, each geometry counted once. */
  const geos = new Set();
  let attrBytes = 0;
  let indexBytes = 0;
  let meshes = 0;
  /*
   * Where the triangles ARE, not just how many there are.
   *
   * P2 has failed at about 1.6x for five rounds and the ledger could not say
   * which meshes carried it, which is the same defect a reviewer found in the
   * P5 breakdown: an instrument that reports a total it cannot attribute
   * cannot tell anyone what to fix. Each row is a mesh's triangle count, its
   * material type, whether the renderer is allowed to frustum cull it, and
   * its bounding sphere radius, because a merged mesh whose bounds span the
   * world is culled by nothing even when the flag is on.
   */
  const heavy = [];
  view.scene.traverse((o) => {
    if (!o.isMesh && !o.isPoints && !o.isLine) {
      return;
    }
    meshes += 1;
    const g = o.geometry;
    if (!g || geos.has(g.uuid)) {
      return;
    }
    geos.add(g.uuid);
    if (g.attributes.position) {
      if (!g.boundingSphere) {
        g.computeBoundingSphere();
      }
      heavy.push({
        material: o.material && o.material.type ? o.material.type : 'unknown',
        triangles: Math.round(g.index ? g.index.count / 3 : g.attributes.position.count / 3),
        frustumCulled: Boolean(o.frustumCulled),
        boundsRadius: g.boundingSphere ? Math.round(g.boundingSphere.radius * 10) / 10 : -1,
      });
    }
    for (const name of Object.keys(g.attributes)) {
      attrBytes += g.attributes[name].array.byteLength;
    }
    if (g.index) {
      indexBytes += g.index.array.byteLength;
    }
  });

  /* Scale the resolution dependent lines to the 1080p the contract is
   * written against, so a capture at 1600 by 900 still answers P5. Only
   * the lines that actually scale: the shadow map's size is authored, and
   * scaling the whole total by pixel area over reported a 900p capture's
   * 1080p equivalent by 12.8 percent. The scaled figure is derived, and it
   * is labelled as derived. */
  const scale = (1920 * 1080) / (canvasW * canvasH);
  const scaledBytes = targets.reduce(
    (a, t) => a + (t.scales === false ? t.bytes : t.bytes * scale),
    0,
  );

  return {
    view: extra && extra.view ? extra.view : 'unnamed',
    canvas: { w: canvasW, h: canvasH, dpr: renderer.getPixelRatio() },
    p1_calls: view.renderer.info.render.calls,
    p2_triangles: view.renderer.info.render.triangles,
    p3_fullres_passes: fullResPasses,
    p4_fullres_taps: fullResTaps,
    p4_fullres_loops: fullResLoops,
    /* Bytes, and then the same bytes in both units, because the ceiling is
     * written as "120 MB" and a ledger that quietly reports mebibytes
     * under a megabyte heading is 4.9 percent lenient at this scale. Both
     * are printed so neither reading can be the flattering one by
     * accident. */
    p5_target_bytes: targetBytesTotal,
    p5_target_MB: +(targetBytesTotal / 1e6).toFixed(1),
    p5_target_MiB: +(targetBytesTotal / 1048576).toFixed(1),
    p5_target_MB_at_1080p: +(scaledBytes / 1e6).toFixed(1),
    p5_targets: targets,
    p9_shadow_maps: shadows,
    p10_attribute_bytes: attrBytes,
    p10_attribute_MB: +(attrBytes / 1e6).toFixed(1),
    p10_index_bytes: indexBytes,
    meshes,
    geometries: geos.size,
    p2_top_meshes: heavy.sort((a, b) => b.triangles - a.triangles).slice(0, 10),
    passes: traced.passes.map((p) => `${p.name} ${p.w}x${p.h}${p.quad ? ` taps=${p.taps}${p.loops ? ` loops=${p.loops}` : ''}` : ''}`),
  };
}
