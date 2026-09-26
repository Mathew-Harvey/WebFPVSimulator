/*
 * fresh.js: every page runs the scripts of the deploy it was served from.
 *
 * THE PROBLEM, MEASURED. Through webfpv.org a page comes back max-age=0 and
 * every script max-age=14400: Cloudflare's browser cache TTL raises it on the
 * way through (DEPLOY.md, "The browser cache TTL in front"). So a returning
 * browser ran a fresh page over scripts up to four hours old. On 2026-09-25
 * that drew the gate's three old cards in the new four card column, and an
 * hour after maps could be published the owner's builder still said "The
 * public board does not take freestyle maps yet", from an app.js the site
 * had stopped serving. Nothing is content hashed here, so a script's address
 * never changed when the script did, and a cache had every right to keep it.
 *
 * THE FIX: A DEPLOY IS ITS OWN SET OF ADDRESSES. Render stamps every file of
 * a deploy with the deploy's time in Last-Modified, and the page itself is
 * never cached, so the page's own Last-Modified is the deploy. The few lines
 * at the top of each page ask for it with a HEAD no cache may answer, then
 * load this file with it as ?d=. This writes the page's import map with
 * every module this site serves given that stamp: src/main.js is imported as
 * src/main.js?d=<stamp>, and so is everything it imports, statically or not,
 * because an import map is applied to every import there is. A browser and
 * the edge may keep a script as long as they like; the next deploy asks for
 * a different address, and a page is never half one deploy and half another.
 *
 * What it costs: a deploy fetches every module it loads once, changed or not,
 * because the stamp is the deploy's and not the file's. About a megabyte
 * compressed for a boot. In return nothing has to be remembered by anybody:
 * no hash to regenerate on every edit, no build step the host does not run.
 *
 * WHEN THERE IS NO STAMP, which is a checkout (scripts/serve.js and the test
 * harness send no Last-Modified, and no-store besides) or a HEAD that failed,
 * the import map carries no versions and the page loads exactly as it did
 * before this file existed.
 *
 * A CLASSIC SCRIPT AND NOT A MODULE, because an import map has to be in the
 * document before the first module is asked for, and a module would be the
 * first module. For the same reason the pages carry no import map and no
 * modulepreload of their own any more: either would start the module loader
 * before this could say which addresses to load.
 *
 * THE PAGE'S FIRST MODULE WAITS FOR THE DOCUMENT. A module script in the
 * markup runs after the page is parsed; one imported from here runs the
 * moment it arrives, which on a fast connection is while the parser is still
 * in the body, and every page's first module looks its elements up at once.
 * So the preloads start as soon as this runs, and the import waits for
 * DOMContentLoaded.
 *
 * NOT COVERED: pictures, which the domain keeps four hours the same way (a
 * picture changed under the same name keeps its old face until then);
 * dist/sim.wasm, which the domain already sends max-age=0; the board, whose
 * scripts are no-store; and the landing page, another repository.
 *
 * MODULES and PRELOAD are written by scripts/gen-preload.js, and
 * `npm run lint:preload` fails when they are stale. A module missing from
 * MODULES is imported at its bare address, which is the old behaviour for
 * that one file rather than a failure.
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

(() => {
  'use strict';

  /*
   * The import map every page shares: three.js from the CDN, pinned, which is
   * the only thing on the render side (CLAUDE.md). Written as JSON rather
   * than in this file's own style because scripts/gen-preload.js reads it
   * with JSON.parse to resolve 'three', and refuses a version it has no
   * add-on table for.
   */
  const IMPORTS = {
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
  };

  // GENERATED BELOW by scripts/gen-preload.js, do not edit by hand
  const MODULES = [
    'configs/airframes.js',
    'configs/pids.js',
    'configs/ratepresets.js',
    'configs/rates.js',
    'configs/registry.js',
    'src/art/banners.js',
    'src/art/clubhouse.js',
    'src/art/startblock.js',
    'src/art/stf.js',
    'src/boot.js',
    'src/fc/catalog-data.js',
    'src/fc/catalog.js',
    'src/fc/dump.js',
    'src/fc/keynotes.js',
    'src/fc/ratescurve.js',
    'src/game/chase.js',
    'src/game/circuit.js',
    'src/game/closecall.js',
    'src/game/collide.js',
    'src/game/counterbest.js',
    'src/game/egg.js',
    'src/game/gaps.js',
    'src/game/ghost.js',
    'src/game/guide.js',
    'src/game/obstacles.js',
    'src/game/plantworld.js',
    'src/game/proven.js',
    'src/game/race.js',
    'src/game/score.js',
    'src/game/track.js',
    'src/game/trackdoc.js',
    'src/game/trickdetect.js',
    'src/game/tricks.js',
    'src/input/input.js',
    'src/input/link.js',
    'src/input/stickmode.js',
    'src/input/touchsticks.js',
    'src/main.js',
    'src/maps/build-cost.js',
    'src/maps/built/cars.js',
    'src/maps/built/egg.js',
    'src/maps/built/index.js',
    'src/maps/built/looks.js',
    'src/maps/built/place.js',
    'src/maps/built/road.js',
    'src/maps/built/roadmesh.js',
    'src/maps/built/starter.js',
    'src/maps/built/traffic.js',
    'src/maps/city/animation.js',
    'src/maps/city/bake.js',
    'src/maps/city/cavity.js',
    'src/maps/city/drawn.js',
    'src/maps/city/index.js',
    'src/maps/city/places/blossom.js',
    'src/maps/city/places/index.js',
    'src/maps/city/places/kit.js',
    'src/maps/city/places/pool.js',
    'src/maps/city/places/road.js',
    'src/maps/city/places/signs.js',
    'src/maps/city/places/training.js',
    'src/maps/city/places/works.js',
    'src/maps/city/references.js',
    'src/maps/city/scan.js',
    'src/maps/city/vendored/core/outline.js',
    'src/maps/city/vendored/core/palette.js',
    'src/maps/city/vendored/core/post.js',
    'src/maps/city/vendored/core/sky.js',
    'src/maps/city/vendored/core/textures.js',
    'src/maps/city/vendored/core/toon.js',
    'src/maps/city/vendored/core/util.js',
    'src/maps/city/vendored/world/alleys.js',
    'src/maps/city/vendored/world/approach.js',
    'src/maps/city/vendored/world/blocks.js',
    'src/maps/city/vendored/world/buildings.js',
    'src/maps/city/vendored/world/canal.js',
    'src/maps/city/vendored/world/details.js',
    'src/maps/city/vendored/world/district.js',
    'src/maps/city/vendored/world/gakkomae.js',
    'src/maps/city/vendored/world/ground.js',
    'src/maps/city/vendored/world/hills.js',
    'src/maps/city/vendored/world/housing.js',
    'src/maps/city/vendored/world/ichome.js',
    'src/maps/city/vendored/world/index.js',
    'src/maps/city/vendored/world/kawabata.js',
    'src/maps/city/vendored/world/koenmae.js',
    'src/maps/city/vendored/world/kohan.js',
    'src/maps/city/vendored/world/lake.js',
    'src/maps/city/vendored/world/lakeform.js',
    'src/maps/city/vendored/world/lakeroad.js',
    'src/maps/city/vendored/world/landform.js',
    'src/maps/city/vendored/world/library.js',
    'src/maps/city/vendored/world/matsuri.js',
    'src/maps/city/vendored/world/nanachome.js',
    'src/maps/city/vendored/world/nichome.js',
    'src/maps/city/vendored/world/northblock.js',
    'src/maps/city/vendored/world/onsen.js',
    'src/maps/city/vendored/world/overbridge.js',
    'src/maps/city/vendored/world/petals.js',
    'src/maps/city/vendored/world/planet.js',
    'src/maps/city/vendored/world/plots.js',
    'src/maps/city/vendored/world/props.js',
    'src/maps/city/vendored/world/railway.js',
    'src/maps/city/vendored/world/restcorner.js',
    'src/maps/city/vendored/world/rokuchome.js',
    'src/maps/city/vendored/world/school.js',
    'src/maps/city/vendored/world/shop.js',
    'src/maps/city/vendored/world/shops.js',
    'src/maps/city/vendored/world/shotengai.js',
    'src/maps/city/vendored/world/showa.js',
    'src/maps/city/vendored/world/shrine.js',
    'src/maps/city/vendored/world/street.js',
    'src/maps/city/vendored/world/streetprops.js',
    'src/maps/city/vendored/world/traffic.js',
    'src/maps/city/vendored/world/train.js',
    'src/maps/city/vendored/world/trees.js',
    'src/maps/city/vendored/world/tsugakuro.js',
    'src/maps/city/vendored/world/tunnel.js',
    'src/maps/city/vendored/world/uramachi.js',
    'src/maps/city/vendored/world/urayama.js',
    'src/maps/city/vendored/world/vehicles.js',
    'src/maps/city/vendored/world/vending.js',
    'src/maps/city/vendored/world/yonchome.js',
    'src/maps/custom.js',
    'src/maps/field.js',
    'src/maps/preload.js',
    'src/maps/registry.js',
    'src/props/buildings.js',
    'src/props/catalog.js',
    'src/props/course.js',
    'src/props/gallery.js',
    'src/props/industrial.js',
    'src/props/kit.js',
    'src/props/parts.js',
    'src/props/skate.js',
    'src/props/solids.js',
    'src/props/street.js',
    'src/props/textures.js',
    'src/props/trig.js',
    'src/props/types.js',
    'src/render/attract.js',
    'src/render/audio.js',
    'src/render/budget.js',
    'src/render/celmat.js',
    'src/render/craft.js',
    'src/render/craftpose.js',
    'src/render/frame.js',
    'src/render/ghostcraft.js',
    'src/render/gpuinfo.js',
    'src/render/herocraft.js',
    'src/render/lens.js',
    'src/render/manga.js',
    'src/render/marks.js',
    'src/render/music.js',
    'src/render/pace.js',
    'src/render/post.js',
    'src/render/quality.js',
    'src/render/scene.js',
    'src/render/session-textures.js',
    'src/render/shell.js',
    'src/render/showcase.js',
    'src/render/tracks.js',
    'src/render/whoopcraft.js',
    'src/share/board.js',
    'src/share/bugs.js',
    'src/share/card.js',
    'src/share/cardgif.js',
    'src/share/flightlog.js',
    'src/share/ghostdata.js',
    'src/share/listing.js',
    'src/share/orbit.js',
    'src/share/orbitcache.js',
    'src/share/patreon.js',
    'src/share/pilot.js',
    'src/share/plan.js',
    'src/share/session.js',
    'src/share/stamps.js',
    'src/share/stats.js',
    'src/share/summary.js',
    'src/share/windows.js',
    'src/trackbuilder/animate.js',
    'src/trackbuilder/app.js',
    'src/trackbuilder/elements.js',
    'src/trackbuilder/faces.js',
    'src/trackbuilder/figures.js',
    'src/trackbuilder/geometry.js',
    'src/trackbuilder/gif.js',
    'src/trackbuilder/history.js',
    'src/trackbuilder/logo.js',
    'src/trackbuilder/model.js',
    'src/trackbuilder/path.js',
    'src/trackbuilder/presets.js',
    'src/trackbuilder/profile.js',
    'src/trackbuilder/racegow.js',
    'src/trackbuilder/roadtool.js',
    'src/trackbuilder/selftest.js',
    'src/trackbuilder/sequence.js',
    'src/trackbuilder/stage.js',
    'src/trackbuilder/start.js',
    'src/trackbuilder/storage.js',
    'src/trackbuilder/ui.js',
    'src/trackbuilder/view2d.js',
    'src/trackbuilder/view3d.js',
    'src/trackbuilder/warnings.js',
    'src/ui/chasehud.js',
    'src/ui/credits.js',
    'src/ui/fc.js',
    'src/ui/letterdemo.js',
    'src/ui/lettering.js',
    'src/ui/loading.js',
    'src/ui/mangapage.js',
    'src/ui/pidspanel.js',
    'src/ui/ratespanel.js',
    'src/ui/scorehud.js',
    'src/ui/trickfilm.js',
    'src/ui/ui.js',
    'src/units.js',
  ];
  const PRELOAD = {
    boot: [
      'src/boot.js',
      'src/ui/loading.js',
      'src/maps/build-cost.js',
      'src/share/windows.js',
      'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
      'src/main.js',
      'src/render/shell.js',
      'src/render/craft.js',
      'src/game/collide.js',
      'src/render/frame.js',
      'src/render/herocraft.js',
      'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js',
      'src/render/celmat.js',
      'src/render/lens.js',
      'src/render/whoopcraft.js',
      'configs/airframes.js',
      'src/render/quality.js',
      'src/render/pace.js',
      'src/render/gpuinfo.js',
      'src/render/attract.js',
      'src/render/manga.js',
      'src/render/budget.js',
      'src/render/audio.js',
      'src/render/music.js',
      'src/render/tracks.js',
      'src/input/input.js',
      'src/input/stickmode.js',
      'configs/rates.js',
      'src/fc/ratescurve.js',
      'src/input/touchsticks.js',
      'src/input/link.js',
      'src/share/flightlog.js',
      'src/game/race.js',
      'src/game/track.js',
      'src/units.js',
      'src/game/trickdetect.js',
      'src/game/obstacles.js',
      'src/game/tricks.js',
      'src/game/egg.js',
      'src/game/score.js',
      'src/game/gaps.js',
      'src/props/trig.js',
      'src/game/chase.js',
      'src/game/closecall.js',
      'src/game/counterbest.js',
      'src/game/ghost.js',
      'src/share/ghostdata.js',
      'src/render/ghostcraft.js',
      'src/game/plantworld.js',
      'src/ui/ui.js',
      'src/maps/registry.js',
      'configs/registry.js',
      'src/trackbuilder/elements.js',
      'src/trackbuilder/racegow.js',
      'src/props/types.js',
      'configs/ratepresets.js',
      'src/share/session.js',
      'configs/pids.js',
      'src/share/board.js',
      'src/game/proven.js',
      'src/ui/trickfilm.js',
      'src/share/bugs.js',
      'src/share/pilot.js',
      'src/share/stamps.js',
      'src/trackbuilder/storage.js',
      'src/trackbuilder/model.js',
      'src/trackbuilder/geometry.js',
      'src/trackbuilder/presets.js',
      'src/share/listing.js',
      'src/share/plan.js',
      'src/share/summary.js',
      'src/share/orbitcache.js',
      'src/ui/scorehud.js',
      'src/ui/lettering.js',
      'src/ui/chasehud.js',
      'src/ui/mangapage.js',
      'src/ui/credits.js',
      'src/share/patreon.js',
      'src/share/stats.js',
      'src/ui/ratespanel.js',
      'src/ui/pidspanel.js',
      'src/ui/fc.js',
      'src/fc/keynotes.js',
      'src/fc/catalog.js',
      'src/fc/catalog-data.js',
      'src/fc/dump.js',
      'src/share/cardgif.js',
      'src/render/showcase.js',
      'src/render/craftpose.js',
      'src/render/session-textures.js',
      'src/maps/preload.js',
      'tests/lib/simmod.js',
      'src/maps/custom.js',
      'src/render/scene.js',
      'src/game/circuit.js',
      'src/game/guide.js',
      'src/render/marks.js',
      'src/art/banners.js',
      'src/art/startblock.js',
      'src/art/clubhouse.js',
      'src/maps/field.js',
      'src/render/post.js',
      'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js',
      'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/shaders/CopyShader.js',
      'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/ShaderPass.js',
      'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/Pass.js',
      'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/MaskPass.js',
      'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPass.js',
      'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js',
      'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/shaders/LuminosityHighPassShader.js',
      'src/game/trackdoc.js',
      'src/trackbuilder/path.js',
      'src/trackbuilder/faces.js',
      'src/trackbuilder/figures.js',
    ],
  };
  // GENERATED ABOVE

  const me = document.currentScript;
  /* This file is src/fresh.js, so the site's root is one level up, wherever
   * the site is mounted: / on a checkout, /sim/ on webfpv.org. */
  const root = new URL('../', me.src);
  const stamp = new URL(me.src).searchParams.get('d') || '';
  const at = (path) => (/^https?:/.test(path) ? path : new URL(path, root).href);
  const listed = new Set(MODULES.map(at));
  /* The address a module is imported from: the one the import map gives it. */
  const deployed = (url) => (stamp && listed.has(url) ? `${url}?d=${stamp}` : url);

  const imports = { ...IMPORTS };
  if (stamp) {
    for (const url of listed) {
      imports[url] = deployed(url);
    }
  }
  const map = document.createElement('script');
  map.type = 'importmap';
  map.textContent = JSON.stringify({ imports });
  document.head.appendChild(map);

  /*
   * The whole boot graph in the first wave rather than one import level at a
   * time: see scripts/gen-preload.js for why, and the measurement. At the
   * deployed address, or the preload would fetch a copy nothing imports.
   */
  for (const path of PRELOAD[me.dataset.preload] || []) {
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = deployed(at(path));
    document.head.appendChild(link);
  }

  /* For the checks: which deploy this page is running, and how many modules
   * it gave that deploy's address. Nothing in the page reads it. */
  window.__fresh = { stamp, entry: me.dataset.entry, versioned: stamp ? listed.size : 0 };

  const start = () => {
    import(at(me.dataset.entry)).catch((e) => {
      console.error(e);
      /* The simulator's loading screen has a line for exactly this, and the
       * orbit page a status line. The builder has neither and the console
       * is all there is. */
      const say = document.querySelector('#loading .loading-help') || document.getElementById('status');
      if (say) {
        say.hidden = false;
        say.textContent = 'This page could not load its scripts. Reload it to try again.';
      }
    });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
