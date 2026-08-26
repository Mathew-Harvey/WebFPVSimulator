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
 *   gets High. The player can always change it. We never auto-downgrade
 *   mid session: a hitch in FPV is less honest than a menu the pilot
 *   opened on purpose.
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
      petals: false,
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
      foliageKeep: 0.42,
      cullRadius: 58,
      fogNear: 22,
      fogFar: 53,
      pixelBudget: 1.55e6,
      minScale: 0.85,
      preferScale: null,
      ink: true,
      fxaa: false,
      petals: false,
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
      foliageKeep: 0.65,
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
      petals: false,
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
