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
 *   than a menu the pilot opened on purpose. Internal resolution may
 *   scale to hold 60 fps. That is the Render scale slider, automatic,
 *   and it does not change the named preset.
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

export const GRAPHICS_IDS = ['low', 'medium', 'high'];

const PRESETS = {
  low: {
    id: 'low',
    name: 'Low',
    note: 'Steam Deck and similar handhelds. Lower internal resolution, no shadow maps, fewer plants, cheaper post. Still uses a GPU if the machine has one. Changing this rebuilds the world.',
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
    bando: {
      shadowMap: 0,
      shadowHalf: 28,
      pixelBudget: 0.9e6,
      minScale: 0.55,
      preferScale: 0.85,
      ink: false,
      fxaa: false,
      fogNear: 28,
      fogFar: 140,
      lamps: 0,
      mergeCell: Infinity,
      casterMin: 0.8,
    },
    baths: {
      shadowMap: 0,
      shadowHalf: 28,
      pixelBudget: 0.9e6,
      minScale: 0.55,
      preferScale: 0.85,
      ink: false,
      fxaa: false,
      fogNear: 40,
      fogFar: 180,
      lamps: 0,
      mergeCell: Infinity,
      casterMin: 0.8,
    },
    yard: {
      shadowMap: 0,
      shadowHalf: 32,
      pixelBudget: 0.9e6,
      minScale: 0.55,
      preferScale: 0.85,
      ink: false,
      fxaa: false,
      fogNear: 36,
      fogFar: 180,
      lamps: 0,
      mergeCell: Infinity,
      casterMin: 0.8,
      foliageKeep: 0.35,
    },
  },
  medium: {
    id: 'medium',
    name: 'Medium',
    note: 'A 2020-era laptop with integrated graphics. Shadows at lower resolution, no bloom, thinned planting. Changing this rebuilds the world.',
    pixelRatioCap: 1.25,
    resolutionScale: 1,
    shadows: true,
    field: {
      shadowMap: 1024,
      shadowFilter: 'pcfsoft',
      shadowHalf: 72,
      outline: true,
      bloom: false,
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
    bando: {
      shadowMap: 1024,
      shadowHalf: 32,
      pixelBudget: 1.55e6,
      minScale: 0.85,
      preferScale: 1,
      ink: true,
      fxaa: false,
      fogNear: 28,
      fogFar: 140,
      lamps: 0,
      mergeCell: Infinity,
      casterMin: 0.55,
    },
    baths: {
      shadowMap: 1024,
      shadowHalf: 32,
      pixelBudget: 1.55e6,
      minScale: 0.85,
      preferScale: 1,
      ink: true,
      fxaa: false,
      fogNear: 42,
      fogFar: 190,
      lamps: 0,
      mergeCell: Infinity,
      casterMin: 0.55,
    },
    yard: {
      shadowMap: 1024,
      shadowHalf: 36,
      pixelBudget: 1.55e6,
      minScale: 0.85,
      preferScale: 1,
      ink: true,
      fxaa: false,
      fogNear: 36,
      fogFar: 180,
      lamps: 0,
      mergeCell: Infinity,
      casterMin: 0.55,
      foliageKeep: 0.55,
    },
  },
  high: {
    id: 'high',
    name: 'High',
    note: 'A 2021-era PC or a strong laptop. The authored look: full resolution up to 2x, soft shadows, bloom, full planting. Changing this rebuilds the world.',
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
    bando: {
      shadowMap: 2048,
      shadowHalf: 36,
      pixelBudget: 2.6e6,
      /*
       * minScale is the pacer floor as a CSS fraction. It must not raise
       * the buffer above pixelBudget: High used to set 1 here, so a 4K
       * panel rendered native HalfFloat and hitching.
       *
       * It is a COARSE floor and on most panels it is not the one that
       * binds. On 1920x1080 the 1.2e6 absolute pixel floor binds first, at
       * 0.761, so the buffer stops just short of 1440x810 whatever this
       * says. The two sentences that used to be here said both of those
       * things about the same panel and contradicted each other.
       *
       * WHAT THIS DOES NOT DO, and it is worth writing down because the
       * commit that set it claimed otherwise: it does not give a 4K panel
       * a pacing range. At 3840x2160 the budget cap puts the ceiling at
       * 0.560 and 0.75 is above that, so the floor clamps to the ceiling
       * and the pacer has nowhere to go. The internal pixel cap does work
       * and 4K renders 2149x1209 rather than native, which was the hitch;
       * the pacing on top of it is inert there. Expressing the floor in
       * PIXELS, the way MIN_INTERNAL_PIXELS already is, would give 4K a
       * real 0.38 to 0.56 range. That is a measured change to how every
       * preset paces on every map, so it belongs to its own round with
       * numbers, not to a comment.
       */
      minScale: 0.75,
      preferScale: 1,
      ink: true,
      fxaa: true,
      fogNear: 32,
      fogFar: 180,
      lamps: 0,
      mergeCell: Infinity,
      casterMin: 0.45,
    },
    baths: {
      shadowMap: 2048,
      shadowHalf: 36,
      pixelBudget: 2.6e6,
      minScale: 1,
      preferScale: 1,
      ink: true,
      fxaa: true,
      fogNear: 45,
      fogFar: 200,
      lamps: 0,
      mergeCell: Infinity,
      casterMin: 0.45,
    },
    yard: {
      shadowMap: 2048,
      shadowHalf: 40,
      pixelBudget: 2.6e6,
      minScale: 1,
      preferScale: 1,
      ink: true,
      fxaa: true,
      fogNear: 40,
      fogFar: 220,
      lamps: 0,
      mergeCell: Infinity,
      casterMin: 0.45,
      foliageKeep: 1,
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
export function pixelRatioFor(id, scale = 1) {
  const q = qualityFor(id);
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const pr = Math.min(dpr, q.pixelRatioCap) * q.resolutionScale * scale;
  return Math.max(0.5, pr);
}

export function applyPixelRatio(shell, id, scale = 1) {
  const pr = pixelRatioFor(id, scale);
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
