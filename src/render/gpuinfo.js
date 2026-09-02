/*
 * gpuinfo.js: the GPU WebGL actually bound, named for the settings row.
 *
 * IS THIS POSSIBLE IN A BROWSER. Yes, with limits. A page cannot scan the
 * machine's device manager. It can only ask the WebGL context that is
 * already drawing: WEBGL_debug_renderer_info unmasks vendor and renderer
 * strings. That is the chip this tab is using, which on a dual-GPU laptop
 * is the one powerPreference high-performance selected, not a list of
 * every GPU in the box.
 *
 * WHAT THE BROWSER MAY HIDE. Firefox with resist-fingerprinting, some
 * Safari builds, and locked-down Chromium return a generic string
 * ("WebKit WebGL", "Apple GPU") instead of the chip. The context is still
 * drawing. The row then says the name is hidden rather than inventing one.
 *
 * SOFTWARE. Headless Chrome and machines with no usable GPU hand back
 * SwiftShader, llvmpipe or Microsoft Basic Render. That is a CPU
 * rasteriser pretending to be a GPU. The game still boots. It will not
 * run well.
 *
 * Read off the SESSION renderer. A second WebGL context would be a second
 * GPU reservation, which is exactly what the Deck cannot spare.
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

const SOFTWARE_RE = /swiftshader|llvmpipe|softpipe|lavapipe|microsoft basic render|gdi generic|mesa offscreen|software rasterizer|cpu raster/i;

/*
 * Integrated graphics, by name, because the name is the only thing a browser
 * will tell us about the chip.
 *
 * quality.js says in its own header that Medium is sized for "a 2020-era
 * laptop iGPU (UHD 620 / Iris Plus / MX350)" and High for "a 2021-era PC or
 * a strong laptop iGPU". Detection did not read the chip at all: it returned
 * Low for a Steam Deck, a phone and an iPad, and High for literally
 * everything else, so the machine Medium was written for booted into High.
 *
 * WHAT IS AND IS NOT MATCHED. Intel's integrated parts through UHD, Iris and
 * the Arc-branded Xe iGPUs; AMD's, which report as plain "Radeon Graphics",
 * "Vega N" or an APU model; and the mobile parts, Mali, Adreno, PowerVR,
 * Videocore. Apple Silicon is NOT here: an M series GPU holds the authored
 * look and the header says so. Discrete parts are not here either, and the
 * patterns are anchored so that "Radeon RX 7900" and "Arc A770" do not match
 * the integrated ones they share a word with.
 *
 * A name test is a heuristic and it will be wrong about something. That is
 * why it only ever lowers a DETECTED preset, never a chosen one, and why it
 * lowers to Medium rather than Low: Medium is a real preset with shadows and
 * ink, not a fallback, and the pilot who disagrees changes one row in
 * Settings.
 */
const INTEGRATED_RE = new RegExp([
  /* Intel: HD Graphics 4000, UHD Graphics 620, Iris Plus, Iris Xe. */
  'intel\\b[^,)]*\\b(hd|uhd|iris|xe)\\b',
  '\\b(hd|uhd) graphics\\b',
  '\\biris\\b',
  /* AMD integrated: bare "Radeon Graphics", Vega 3 to 11, Radeon RX Vega N. */
  '\\bradeon\\s*(\\(tm\\)\\s*)?graphics\\b',
  '\\bvega\\b\\s*\\d',
  /* Phones, tablets and handheld SoCs. */
  '\\bmali\\b',
  '\\badreno\\b',
  '\\bpowervr\\b',
  '\\bvideocore\\b',
].join('|'), 'i');

/*
 * True when the renderer string names a chip that shares system memory with
 * the CPU. Exported so the shell can lower a detected preset, and so a test
 * can pin the list against real strings.
 */
export function isIntegratedGpu(raw) {
  const s = String(raw || '');
  if (!s || SOFTWARE_RE.test(s)) {
    return false;
  }
  return INTEGRATED_RE.test(s);
}

function glOf(renderer) {
  if (!renderer) {
    return null;
  }
  if (typeof renderer.getContext === 'function') {
    return renderer.getContext();
  }
  return renderer;
}

function parseAngle(raw) {
  const m = /^ANGLE \(([\s\S]*)\)$/.exec(String(raw).trim());
  if (!m) {
    return null;
  }
  const inner = m[1];
  const first = inner.indexOf(', ');
  if (first < 0) {
    return { vendor: inner, renderer: inner, backend: '' };
  }
  const vendor = inner.slice(0, first);
  const rest = inner.slice(first + 2);
  const last = rest.lastIndexOf(', ');
  if (last < 0) {
    return { vendor, renderer: rest, backend: '' };
  }
  return {
    vendor,
    renderer: rest.slice(0, last),
    backend: rest.slice(last + 2),
  };
}

export function tidyGpuName(raw) {
  if (!raw) {
    return '';
  }
  let s = String(raw).trim();
  const angle = parseAngle(s);
  if (angle) {
    s = angle.renderer || angle.vendor || s;
  }
  s = s.replace(/^ANGLE Metal Renderer:\s*/i, '');
  s = s.replace(/\s*\(0x[0-9a-fA-F]+\)/g, '');
  s = s.replace(/\s*Direct3D1[12][^,]*/gi, '');
  s = s.replace(/\s*vs_[0-9_]+(\s+ps_[0-9_]+)?/gi, '');
  s = s.replace(/\s*ps_[0-9_]+/gi, '');
  s = s.replace(/\s*OpenGL ES [0-9.]+.*/i, '');
  s = s.replace(/\s*OpenGL [0-9.]+.*/i, '');
  s = s.replace(/\s*Vulkan[^,]*/gi, '');
  s = s.replace(/\s*D3D1[12][-0-9.]*/gi, '');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^(NVIDIA|AMD|Intel|Apple|Qualcomm)\s+\1\s+/i, '$1 ');
  /* Mesa strings put the useful name before a driver soup in parentheses.
   * Keep generation tags such as (KBL GT2). Strip LLVM/DRM/PCI soup even
   * on short names like llvmpipe. */
  const cut = s.indexOf(' (');
  if (cut > 0 && /llvm|drm|radeonsi|navi|vangogh|pci/i.test(s.slice(cut))) {
    s = s.slice(0, cut).trim();
  }
  return s;
}

function looksGeneric(name, raw) {
  const s = `${name || ''} ${raw || ''}`.trim();
  if (!s) {
    return true;
  }
  return /^(WebKit WebGL|WebGL|Mozilla|ANGLE)$/i.test(name)
    || /^Mozilla$/i.test(raw);
}

function isSoftware(raw) {
  return SOFTWARE_RE.test(String(raw || ''));
}

function buildNote(info) {
  if (!info.usable) {
    return 'WebGL is not drawing. Reload the page. If this stays, the browser refused a graphics context.';
  }
  const api = info.webgl2 ? 'WebGL 2' : 'WebGL';
  if (info.software) {
    return `${api} is running on the CPU, not a GPU (${info.raw || 'software rasteriser'}). Headless Chrome does this. Low is the preset that will run. Nothing is uploaded.`;
  }
  if (info.hidden) {
    return `${api} is drawing, so a GPU is in use, but this browser will not name the chip. Firefox's resist-fingerprinting and some Safari builds do that. Nothing is uploaded.`;
  }
  if (/^Apple GPU$/i.test(info.name)) {
    return `${info.name}. ${api} is drawing. Safari hides the chip model. On a dual-GPU machine this is the device the tab bound after asking for high-performance. Nothing is uploaded.`;
  }
  return `${info.name}. ${api} is drawing on this GPU. On a dual-GPU laptop that should be the discrete chip, because the session asked for high-performance. Nothing is uploaded.`;
}

/*
 * `renderer` is the three.js WebGLRenderer, or a raw WebGL context.
 */
export function readGpuInfo(renderer) {
  const gl = glOf(renderer);
  const info = {
    raw: '',
    integrated: false,
    vendor: '',
    name: '',
    display: 'Unknown',
    software: false,
    usable: false,
    webgl2: false,
    hidden: true,
    note: 'The GPU name is not available yet.',
  };
  if (!gl || typeof gl.getParameter !== 'function') {
    info.note = 'No WebGL context. The world cannot draw.';
    return info;
  }
  if (typeof gl.isContextLost === 'function' && gl.isContextLost()) {
    info.note = 'The WebGL context was lost. Reload the page.';
    return info;
  }
  info.usable = true;
  info.webgl2 = typeof WebGL2RenderingContext !== 'undefined'
    && gl instanceof WebGL2RenderingContext;
  let raw = '';
  let vendor = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      raw = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '';
      vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '';
    }
  } catch (e) {
    raw = '';
  }
  if (!raw) {
    try {
      raw = gl.getParameter(gl.RENDERER) || '';
      vendor = vendor || gl.getParameter(gl.VENDOR) || '';
    } catch (e) {
      raw = '';
    }
  }
  info.raw = raw;
  info.vendor = vendor;
  const name = tidyGpuName(raw) || tidyGpuName(vendor);
  info.name = name;
  info.software = isSoftware(raw) || isSoftware(name);
  /* Reported alongside `software` rather than folded into it: an iGPU is a
   * real GPU that draws, it is simply short of fill rate and memory
   * bandwidth, so the shell lowers it a step instead of all the way. */
  info.integrated = !info.software && (isIntegratedGpu(raw) || isIntegratedGpu(name));
  info.hidden = !info.software && looksGeneric(name, raw);
  if (info.software) {
    info.display = name ? `Software (${name})` : 'Software';
  } else if (info.hidden) {
    info.display = 'Hidden by this browser';
  } else {
    info.display = name || 'GPU in use';
  }
  info.note = buildNote(info);
  return info;
}
