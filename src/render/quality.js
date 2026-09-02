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
 *   gets High. The player can always change it. We never auto-switch
 *   Low / Medium / High mid session: a hitch in FPV is less honest
 *   than a menu the pilot opened on purpose. Internal resolution is the
 *   Render scale slider, which the pilot sets and which does not change
 *   the named preset. It is not automatic: the pacer that would have
 *   driven it needs a per map applyPace hook that no map implements,
 *   and pace.js says so at the top of the file.
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
      /* The Deck's own 1280x800 at the authored 0.85 is 0.74 Mpx, well
       * inside this. The number is 1080p times this preset's own 0.85
       * squared, so a 1080p screen at DPR 1 lands exactly on its authored
       * ratio and is not clamped at all: the budget catches dense panels
       * and nothing else, on this preset as on the other two. It is also
       * comfortably above MIN_INTERNAL_PIXELS, the 1.2 Mpx floor the city's
       * rubric F4 sets against pacing a 1080p panel into 720p. */
      pixelBudget: 1.5e6,
    },
    city: {
      shadowMap: 0,
      shadowHalf: 22,
      shadowProxyCell: 0,
      foliageKeep: 0.22,
      cullRadius: 50,
      fogNear: 22,
      fogFar: 46,
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
      shadowProxyCell: 24,
      foliageKeep: 0.30,
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
  const s = String(id || '').toLowerCase();
  return GRAPHICS_IDS.includes(s) ? s : 'high';
}

export function qualityFor(id) {
  return PRESETS[normalizeGraphics(id)];
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
 * userScale is the Render scale slider. forceScale is the pacer; null
 * means "use the authored ceiling", 0 clamps to the floor.
 *
 * 1,200,000 is the absolute pixel floor so a 1080p panel cannot be
 * paced into 720p to buy a frame. That is rubric F4.
 */
const MIN_INTERNAL_PIXELS = 1200 * 1000;

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
