/*
 * quality.js: named graphics presets, and the only place they are defined.
 *
 * WHY THREE NAMES AND NOT A WALL OF SLIDERS. This is a flight sim with a
 * radio-navigable menu, not a PC configurator. Forza, GT and every recent
 * console racer treat Low / Medium / High as the player-facing control and
 * hide the knobs behind them. One row, three values, a note that says what
 * the current one is for. Changing it rebuilds the world, because the
 * expensive levers (city foliage, shadow proxies) are bake time, not
 * frame time. Grass blades are not a lever: they are not drawn.
 *
 * WHAT THE ORIGINAL SPEC GOT WRONG, AND WHAT THIS FILE FIXES.
 *
 *   "None should require a GPU."
 *   WebGL always talks to a GPU, or to a software rasteriser pretending to
 *   be one (SwiftShader, llvmpipe). The real requirement is: no preset
 *   needs a DISCRETE GPU, WebGPU, compute shaders, mesh shaders or ray
 *   tracing. failIfMajorPerformanceCaveat stays false, so a machine with
 *   only a software renderer still boots. High is sized for a 2021-era
 *   PC or a strong laptop iGPU (RTX 3060 class, Intel Xe, M1), Medium for
 *   a 2020-era laptop iGPU (UHD 620 / Iris Plus / MX350), Low for a Steam
 *   Deck APU at 800p. All three are WebGL.
 *
 *   "If a GPU is present then it is used."
 *   The session renderer asks for powerPreference high-performance, so a
 *   dual-GPU laptop uses the discrete chip rather than the battery iGPU.
 *   Quality then scales resolution and effects, not which device draws.
 *   Orbit thumbnails and the settings-studio craft keep low-power: they
 *   are secondary contexts and must not steal the Deck's one GPU.
 *
 *   "Default to Medium."
 *   High IS the authored look. The field budget check (map-isolation)
 *   pins High's draw calls, triangles and target bytes. Defaulting to
 *   Medium would silently change the product and fail that check. First
 *   run on a Steam Deck / SteamOS user agent picks Low; everyone else
 *   gets High. The player can always change it. Nothing switches Low /
 *   Medium / High in flight: a hitch in FPV is less honest than a menu
 *   the pilot opened on purpose. Under Auto graphics, the default, the
 *   preset may move between runs, on the title, and the internal
 *   resolution moves in flight as a factor on the Render scale slider
 *   (src/render/autoscale.js), which is the owner's ask of 2026-09-27:
 *   "make the browser auto detect and set it to fly well". A preset the
 *   pilot picked by hand is never touched. The pacer that came before
 *   Auto, pace.js, never reached a map and was deleted on 2026-09-28.
 *
 *   "Low, a bit less grass."
 *   Blades are not drawn at any preset. The first 184000 world draws
 *   are still walked so the valley does not relocate. Density is not a
 *   quality lever.
 *
 * TARGETS, not promises. These are the machines the presets are BUILT
 * for, at 60 fps where the hardware can hold it, 40 fps on a Deck in its
 * 40 Hz mode. Fill rate is the enemy on handhelds; draw calls and
 * triangles are the enemy in the city.
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
 * A NOTE ON THE NOTES, because they are read by a pilot deciding what to
 * pick and they were promising something the field does not do.
 *
 * They used to say "fewer plants", "thinned planting" and "full planting"
 * without saying where. Only the city has a planting lever, `foliageKeep`;
 * the field reads shadowMap and shadowHalf out of this table and nothing
 * else, and its trees, rocks and cliffs come off a fixed rng walk. Measured
 * at 1600 by 900, the field draws 949,309 triangles on High and 949,296 on
 * Medium, the difference being the bloom quads, with the same 134 meshes on
 * all three presets. So the notes now say "the town", which is true, rather
 * than implying a lever the race field has never had.
 */
export const GRAPHICS_IDS = ['low', 'medium', 'high'];

const PRESETS = {
  low: {
    id: 'low',
    name: 'Low',
    note: 'Steam Deck and similar handhelds. Lower internal resolution, no shadow maps, cheaper post, and a thinner town. Still uses a GPU if the machine has one. Changing this rebuilds the world.',
    /* Cap at 1x, then 0.85: Deck native is 1280x800, so the compositor sees
     * about 1088x680. Fill rate is what a 4 to 15 W APU is short of. */
    pixelRatioCap: 1,
    resolutionScale: 0.85,
    shadows: false,
    field: {
      shadowMap: 0,
      shadowFilter: 'none',
      shadowHalf: 72,
      outline: false,
      bloom: false,
      /*
       * No drifting cloud shading either, 2026-09-28: three octaves of
       * value noise on every terrain, pitch and clubhouse fragment, which
       * is most of the frame's lower half, on the preset that has already
       * traded every shadow for fill rate. Read at scene build
       * (setCelCloudShadows in celmat.js). Together with the 8 bit sRGB
       * composer target (post.js), this is for the machine bug-435f6aaa
       * was flown on: an integrated GPU spending 9.1 ms of a 16.7 ms
       * frame, where every millisecond the GPU gives back is a
       * millisecond the picture can reach the glass sooner through the
       * low latency canvas.
       */
      clouds: false,
      /*
       * LOW NEVER RENDERS MORE THAN A MILLION PIXELS. The owner's
       * decision of 2026-09-28 ("do 1 and 2", the answer to
       * bug-435f6aaa): on the integrated machines Low is for, GPU time is
       * latency through the low latency canvas, and pixels are GPU time.
       * The budget was 1.5e6, chosen as 1080p times 0.85 squared so a
       * 1080p window landed exactly on the authored ratio; at 1.0e6 that
       * window caps at 0.69 instead and draws 1.0 Mpx where it drew 1.5,
       * and the laptop the decision was made on (1896 by 909, which drew
       * 1.25 Mpx at 0.85) draws 1.0 at 0.76. Anything under about 1.38
       * Mpx of CSS keeps the authored 0.85 untouched: the Deck's own
       * 1280x800 is 0.74 Mpx, and a 1366x768 laptop 0.76. The Render
       * scale slider still multiplies underneath the cap.
       *
       * This ceiling sits BELOW MIN_INTERNAL_PIXELS on purpose: rubric
       * F4's 1.2 Mpx floor binds Medium and High, and Low is the one
       * preset the owner exempted (autoMinPixels above, review F6),
       * because on Low the only rescue left is fewer pixels. A ceiling
       * under the floor is that same decision read the other way round.
       * scripts/quality-check.js pins which screens keep their authored
       * ratio and that a 1080p Low frame is now exactly this budget.
       */
      pixelBudget: 1.0e6,
    },
    city: {
      shadowMap: 0,
      shadowHalf: 22,
      shadowProxyCell: 0,
      foliageKeep: 0.22,
      /* The town's canopy blobs near the eye drawn at eighty faces, or as
       * clumps with leafClumps, rather than twenty, within this many metres
       * of a cell's nearest point; 0 keeps twenty everywhere. See
       * roundCanopiesNear in src/maps/city/index.js. */
      leafRound: 0,
      /* Canopy blobs drawn as clumps of lumps rather than smooth round
       * blobs, 180 faces a blob where the round one has 80: a built map's,
       * and the town's within leafRound. See clumpBlob in
       * src/render/clump.js. */
      leafClumps: false,
      cullRadius: 50,
      fogNear: 22,
      fogFar: 46,
      /* Draw only the part of the town wide merge the fog leaves visible:
       * fogBanded in src/maps/city/bake.js. Low only: Medium and High ink
       * the town from depth, and the ink is not fogged, so it draws the
       * outlines of buildings well past the fog, and those would go too. */
      fogBands: true,
      pixelBudget: 0.9e6,
      /* Allow the city pipeline to render below CSS resolution. The vendored
       * walker pipeline floors scale at 1.0; a Deck cannot afford that. */
      minScale: 0.55,
      preferScale: 0.85,
      ink: false,
      fxaa: false,
      /* No live blossom on a handheld. The field is 980 instanced cards
       * whose matrices are rewritten and re-uploaded every frame, and
       * memory bandwidth is what a 4 to 15 W APU is short of. The fallen
       * drifts stay: they are static and cost three draws. */
      petals: false,
    },
  },
  medium: {
    id: 'medium',
    name: 'Medium',
    note: 'A 2020-era laptop with integrated graphics. Shadows at lower resolution, no bloom, and thinner planting in the town. Changing this rebuilds the world.',
    pixelRatioCap: 1.25,
    resolutionScale: 1,
    shadows: true,
    field: {
      shadowMap: 1024,
      shadowFilter: 'pcfsoft',
      shadowHalf: 72,
      /* The map is redrawn at most every third frame: see shadowrate.js. */
      shadowEvery: 3,
      outline: true,
      bloom: false,
      /* 1080p, for the reason under High. Medium has no bloom ladder and a
       * quarter of High's shadow map, so it is comfortably inside the
       * ceiling at this count rather than up against it. */
      pixelBudget: 2.07e6,
    },
    city: {
      shadowMap: 1024,
      shadowHalf: 18,
      shadowEvery: 3,
      shadowProxyCell: 24,
      foliageKeep: 0.30,
      leafRound: 25,
      leafClumps: true,
      cullRadius: 58,
      fogNear: 22,
      fogFar: 53,
      pixelBudget: 1.55e6,
      minScale: 0.85,
      preferScale: null,
      ink: true,
      fxaa: false,
      petals: true,
    },
  },
  high: {
    id: 'high',
    name: 'High',
    note: 'A 2021-era PC or a strong laptop. The authored look: full resolution, soft shadows, bloom, and the town at full planting. Changing this rebuilds the world.',
    /* Identical to the session default before this file existed. */
    pixelRatioCap: 2,
    resolutionScale: 1,
    shadows: true,
    field: {
      shadowMap: 2048,
      shadowFilter: 'pcfsoft',
      shadowHalf: 72,
      outline: true,
      bloom: true,
      /*
       * THE SAME CEILING THE CITY HAS HAD ALL ALONG, FOR THE SAME REASON.
       *
       * The field ran with no ceiling at all, so pixelRatioFor was
       * min(dpr, 2) and nothing else. A 1440x900 CSS laptop at DPR 2, which
       * is exactly the "strong laptop iGPU" this preset names, rendered
       * 2880x1800: 5.2 Mpx through the colour pass, the normal prepass and
       * the eight tap outline, plus grade and bloom, into two RGBA16F
       * composer targets. Scaling the measured 900p ledger, that is about
       * 237 MB of render targets against this project's own 120 MB budget,
       * and 3.6 times the fill of the 1080p frame the budget check pins.
       *
       * 2,073,600 is 1920 by 1080, and it is not a round number chosen for
       * looking sensible: it is the resolution the 120 MB render target
       * ceiling was measured at, in the low spec loop that took P5 from
       * 291 MB to 109.8 (PROGRESS.md, "Low spec loop, round 2"). So the
       * rule this expresses is simply that no screen renders more pixels
       * than the screen the budget was measured on.
       *
       * A 1080p monitor at DPR 1 therefore sits exactly on it and is not
       * touched at all: the authored frame is unchanged, and so is every
       * capture and every budget check. What changes is the 1440x900 DPR 2
       * laptop, from 5.2 Mpx to 2.07, the 1440p monitor from 3.7, and the
       * 4K monitor from 8.3.
       */
      pixelBudget: 2.07e6,
    },
    city: {
      shadowMap: 2048,
      shadowHalf: 22,
      shadowProxyCell: 24,
      foliageKeep: 0.48,
      leafRound: 25,
      leafClumps: true,
      cullRadius: 70,
      fogNear: 22,
      fogFar: 65,
      pixelBudget: 2.6e6,
      /* Floor 1.0 matches the vendored pipeline, so 1080p High is the
       * same frame the budget check was measured against. */
      minScale: 1,
      preferScale: null,
      ink: true,
      fxaa: true,
      /* The authored look. Falling blossom down the street corridor, three
       * instanced draws, driven from the fixed step count. */
      petals: true,
    },
  },
};

export function normalizeGraphics(id) {
  const s = String(id && typeof id === 'object' ? id.id : id || '').toLowerCase();
  return GRAPHICS_IDS.includes(s) ? s : 'high';
}

/*
 * A preset's quality, or the quality it was handed: a world is built from
 * whatever `options.quality` is, and a preset with its shadows taken away
 * (withoutShadows) is an object, not an id.
 */
export function qualityFor(id) {
  if (id && typeof id === 'object' && id.field && id.city) {
    return id;
  }
  return PRESETS[normalizeGraphics(id)];
}

/*
 * The Shadows row's Off: the preset's own numbers with the shadow pass, the
 * map and the town's proxies taken out. Low is already this, but still comes
 * back marked `shadowsOff`, because the shell tells a world built with the row
 * off from one built with it on by that mark and would otherwise rebuild a Low
 * world for ever. Cached, so the same id is the same object.
 */
const NO_SHADOWS = {};
export function withoutShadows(id) {
  const key = normalizeGraphics(id);
  const p = PRESETS[key];
  if (!NO_SHADOWS[key]) {
    NO_SHADOWS[key] = Object.freeze({
      ...p,
      shadows: false,
      shadowsOff: true,
      field: { ...p.field, shadowMap: 0, shadowFilter: 'none' },
      city: { ...p.city, shadowMap: 0, shadowProxyCell: 0 },
    });
  }
  return NO_SHADOWS[key];
}

/* What a world is built from, given the pilot's settings. */
export function qualityOf(settings) {
  return settings.shadowsOff ? withoutShadows(settings.graphics) : normalizeGraphics(settings.graphics);
}

export function graphicsLabel(id) {
  return qualityFor(id).name;
}

export function graphicsNote(id) {
  return qualityFor(id).note;
}

/*
 * First run only. A stored choice, even an old save that never had this
 * key, is handled by the caller: missing key means detect, present key
 * means honour it.
 */
export function detectDefaultGraphics() {
  if (typeof navigator === 'undefined') {
    return 'high';
  }
  const ua = navigator.userAgent || '';
  if (/Steam Deck|SteamOS/i.test(ua)) {
    return 'low';
  }
  /* Phones start Low for the Deck's reason: the first flight has to hold
   * frame rate on the hardware in hand, and a phone GPU driving a 3x
   * pixel ratio screen does not hold High. An iPad says Macintosh in its
   * UA, so it is told apart by the touch points a Mac does not report.
   * Detection only: a stored choice in Settings still wins. */
  const touchPoints = navigator.maxTouchPoints || 0;
  if (/Android|iPhone|iPod/i.test(ua) || (touchPoints > 2 && /Mac/i.test(ua))) {
    return 'low';
  }
  const plat = navigator.userAgentData && navigator.userAgentData.platform;
  if (plat && /Steam/i.test(String(plat))) {
    return 'low';
  }
  return 'high';
}

/*
 * THE BOOT GUESS FROM THE RENDERER'S NAME, as a decision rather than a side
 * effect, so it can be checked without a GPU of every kind
 * (scripts/quality-check.js). Given what the renderer calls itself
 * (gpuinfo.js) and the settings, the preset a boot should lower an Auto
 * preset to, or null to leave it. main.js applies it beside setGpuInfo,
 * where the comments say why each branch exists.
 *
 * A software rasteriser always gets Low: nothing above it can run there,
 * whatever Auto measured on this machine's GPU another day, and a driver
 * that fell back to the CPU is exactly the day this matters. An integrated
 * GPU gets Medium from High only while Auto has never measured the machine.
 * Once it has moved the preset on the frames (graphicsAutoMeasured), the
 * frames have spoken: the guess used to undo Auto's promotion at every boot,
 * a world rebuild on the title every session (review finding F5,
 * 2026-09-27).
 */
export function bootGuessGraphics(info, s) {
  if (!info || !s || !s.graphicsAuto) {
    return null;
  }
  const now = normalizeGraphics(s.graphics);
  if (info.software) {
    return now !== 'low' ? 'low' : null;
  }
  if (info.integrated && now === 'high' && !s.graphicsAutoMeasured) {
    return 'medium';
  }
  return null;
}

/*
 * scale is the pilot's own render scale on top of the preset, 1 for
 * native. It multiplies rather than replaces the preset's resolutionScale
 * because the two answer different questions: the preset knows what a
 * class of machine can afford, the setting is one pilot saying theirs
 * cannot afford that. The 0.5 floor still holds, below it text in the
 * world stops being text.
 */
export function pixelRatioFor(id, scale = 1, viewport = null) {
  const q = qualityFor(id);
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  let pr = Math.min(dpr, q.pixelRatioCap) * q.resolutionScale * scale;
  /*
   * A CAP ON THE RATIO IS NOT A CAP ON THE PIXELS, AND THE PIXELS ARE WHAT
   * THE GPU PAYS FOR.
   *
   * pixelRatioCap 2 says nothing about how big the window is. The same cap
   * is 2.1 Mpx on a 720p laptop panel and 8.3 Mpx on a 4K monitor, through
   * the same three full resolution passes. The city has had an area budget
   * since it shipped; the field never had one, and the field is the map a
   * first visit lands on.
   *
   * The budget is a CEILING, so a machine already under it is not touched
   * and the authored 1080p frame does not move. The floor is the existing
   * 0.5: below that, text painted into the world stops being text.
   */
  const budget = q.field && q.field.pixelBudget > 0 ? q.field.pixelBudget : 0;
  const vp = viewport || defaultViewport();
  if (budget > 0 && vp && vp.w > 0 && vp.h > 0) {
    /*
     * IT CLAMPS A DESKTOP MONITOR TOO, AND THAT IS THE POINT.
     *
     * The first version of this floored the cap at 1 so it only ever took
     * away supersampling, on the reasoning that a monitor at DPR 1 shows
     * every pixel it is given. scripts/quality-check.js refused it: at the
     * measured 39 bytes a pixel across two RGBA16F composer targets, the
     * normal target and the bloom ladder, a 1440p monitor came to 162 MB of
     * render targets and a 4K one to 343 MB, against the 120 MB ceiling this
     * project set itself and spent a whole low spec loop getting under.
     * A budget that exempts the two largest screens is not a budget.
     *
     * The city's pipeline has always clamped those same screens through its
     * own pixelBudget. The field being the exception was the inconsistency,
     * not the clamp.
     *
     * The floor is the existing 0.5, below which text painted into the world
     * stops being text, and a pilot who wants fewer pixels still has the
     * Render scale slider, which works again now (see post.js setSize).
     */
    const cap = Math.sqrt(budget / (vp.w * vp.h));
    if (pr > cap) {
      pr = cap;
    }
  }
  return Math.max(0.5, pr);
}

/* The window, in CSS pixels, or null off a browser. Kept beside
 * pixelRatioFor because it is the only reason that function needs a window
 * at all beyond devicePixelRatio. */
function defaultViewport() {
  if (typeof window === 'undefined') {
    return null;
  }
  const w = window.innerWidth || 0;
  const h = window.innerHeight || 0;
  return w > 0 && h > 0 ? { w, h } : null;
}

export function applyPixelRatio(shell, id, scale = 1, viewport = null) {
  const pr = pixelRatioFor(id, scale, viewport);
  shell.pixelRatio = pr;
  shell.renderer.setPixelRatio(pr);
  return pr;
}

/*
 * Internal buffer scale for a compact map pipeline.
 *
 * pixelBudget is a ceiling on CSS width times height times scale
 * squared. minScale is the pacer floor as a fraction of CSS size, and
 * it must not raise the buffer above the budget: High used to take
 * max(minScale, budgetCap) with minScale 1, so a 3840x2160 panel
 * rendered native HalfFloat. preferScale is the authored look.
 * userScale is the Render scale slider. forceScale is the vendored city
 * pipeline's own override, which nothing here sets since the pacer that
 * did was deleted on 2026-09-28; null means "use the authored ceiling", 0
 * clamps to the floor.
 *
 * 1,200,000 is the absolute pixel floor so a 1080p panel cannot be
 * paced into 720p to buy a frame. That is rubric F4.
 */
const MIN_INTERNAL_PIXELS = 1200 * 1000;

/*
 * THE FLOOR AUTO GRAPHICS KEEPS ON EACH PRESET, in internal pixels: how far
 * Auto's resolution factor (src/render/autoscale.js) may take the picture on
 * its own. 0 means no pixel floor, only the Render scale slider's lowest
 * step and a pipeline's minScale.
 *
 * AN EXCEPTION TO F4 ON LOW, AND ONLY THERE. THE OWNER'S DECISION OF
 * 2026-09-28. Rubric F4 was written for High. Auto first shipped honouring
 * it on High only and pacing Low and Medium to the slider's 55 percent, and
 * review finding F6 (prompts/input-lag-review-2026-09-27.md) put the two
 * options to the owner with the numbers. At the owner's 1896 by 943 window
 * on Low (ratio 0.85) the full picture is 1.29 Mpx, so honouring F4 there
 * would leave Auto four percent of room and nothing else to do, and Low has
 * no preset under it to demote to: a blurrier sixty is the only rescue left.
 * On Medium a demote exists, so a Medium picture that cannot hold sixty
 * above 1.2 Mpx goes to Low rather than into 720p. The owner chose exactly
 * that: the exception on Low, F4 honoured on Medium and High.
 *
 * "Unless the panel itself is smaller than that" reads as it always has
 * here (internalScale below, and autoFloorFor in main.js on High since
 * 2026-09-27): the floor is 1.2 Mpx or the preset's own full picture,
 * whichever is smaller, so on a small window Auto has no room at all.
 * The pilot's own slider is never bound by it: F4 is about a pacer.
 */
export function autoMinPixels(id) {
  return normalizeGraphics(id) === 'low' ? 0 : MIN_INTERNAL_PIXELS;
}

export function internalScale(w, h, mapQ, forceScale, userScale) {
  const area = Math.max(1, w * h);
  const prefer = (mapQ.preferScale == null ? 1 : mapQ.preferScale)
    * (userScale == null ? 1 : userScale);
  const budget = mapQ.pixelBudget > 0 ? mapQ.pixelBudget : area;
  const cap = Math.sqrt(budget / area);
  const ceil = prefer < cap ? prefer : cap;
  if (forceScale == null) {
    return ceil;
  }
  const cssFloor = mapQ.minScale == null ? 0.75 : mapQ.minScale;
  const absFloor = Math.sqrt(MIN_INTERNAL_PIXELS / area);
  let floor = cssFloor > absFloor ? cssFloor : absFloor;
  if (floor > ceil) {
    floor = ceil;
  }
  let s = forceScale;
  if (s > ceil) {
    s = ceil;
  }
  if (s < floor) {
    s = floor;
  }
  return s;
}

/*
 * THE INK LINES, AND THE PILOT'S HAND ON THEM. The black outline round the
 * edges of the world, in the town, on a built map and on the race field
 * alike, is a screen space pass that Low leaves out and Medium and High
 * draw (city.ink and field.outline above). The pilot's Manga and scoring
 * switch (src/ui/ui.js, DEFAULTS.mangaAndScoring) takes it away on Medium
 * and High too, so the picture is Low's without giving up anything else
 * those presets pay for. It can only narrow what the preset gave: on Low
 * the switch has nothing to take, and turning it on never adds a pass the
 * preset left out.
 *
 * There are two post chains, and they hold the ink differently:
 *
 *   The town's and a built map's Pipeline: the ink is a pass of its own,
 *   `enabled.ink`, and off is not running it, as Low does, which also saves
 *   a full screen pass. What the preset gave is `inkPreset`, written where
 *   the pipeline is built.
 *
 *   The race field's composer: the outline pass is the field's
 *   antialiasing as well as its ink (src/render/post.js, "Antialiasing,
 *   paid for entirely by fetches the ink already made"), and its order in
 *   the composer decides whether a render target needs a depth buffer, so
 *   the pass is left where it is and the ink's strength goes to zero. The
 *   strength the preset gave is `inkStrength`. Only Medium and High have
 *   the pass at all.
 *
 * Called once a frame from main.js with the switch, so a world swapped in
 * (a new map, a new preset) is given it without a call of its own, and each
 * write is guarded on a change. Render only: nothing here is read by the
 * physics, the scorer or the plant.
 *
 * What it does NOT touch is the inverted hull outline on a few props (a
 * gate post, a trunk, a vending machine: outlineHull in celmat.js and
 * hullOutline in the vendored core/outline.js). Those are geometry, every
 * preset draws them, and Low does, which is the picture this matches.
 */
export function setInkLines(post, on) {
  if (!post) {
    return;
  }
  const want = on !== false;
  if (post.enabled && post.ink) {
    /* A pipeline built by something that never said what its preset gave
     * is left as it is: narrowing needs the thing it narrows. */
    if (post.inkPreset === undefined) {
      return;
    }
    const ink = want && post.inkPreset !== false;
    if (post.enabled.ink !== ink) {
      post.enabled.ink = ink;
    }
    return;
  }
  const u = post.outline && post.outline.uniforms ? post.outline.uniforms.uStrength : null;
  if (u && post.inkStrength !== undefined) {
    const strength = want ? post.inkStrength : 0;
    if (u.value !== strength) {
      u.value = strength;
    }
  }
}

/* Whether the chain draws ink lines now, for the harness
 * (window.__manga.state) and the checks. */
export function inkLinesOn(post) {
  if (!post) {
    return false;
  }
  if (post.enabled && post.ink) {
    return Boolean(post.enabled.ink);
  }
  const u = post.outline && post.outline.uniforms ? post.outline.uniforms.uStrength : null;
  return Boolean(u && u.value > 0);
}
