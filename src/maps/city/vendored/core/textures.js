import * as THREE from 'three';
import { PAL } from './palette.js';

/* ------------------------------------------------------------------ *
 * Procedural canvas textures.
 *
 * The scene ships with zero binary assets: every sign, poster, price
 * strip and petal mask is drawn with Canvas2D at start-up.  Everything is
 * kept flat and low-frequency on purpose -- crisp shapes and type, never
 * photographic noise.
 * ------------------------------------------------------------------ */

const JP_FONT = `'Yu Gothic', 'Yu Gothic UI', 'Meiryo', 'MS Gothic', 'Hiragino Kaku Gothic ProN', sans-serif`;
const cache = new Map();

function make(w, h, draw, { srgb = true, repeat = null, aniso = 4 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = true;
  draw(c, w, h);
  const tex = new THREE.CanvasTexture(cv);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  tex.needsUpdate = true;
  return tex;
}

function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

function fitText(c, text, maxW, size, font = JP_FONT, weight = 'bold') {
  let s = size;
  do {
    c.font = `${weight} ${s}px ${font}`;
    if (c.measureText(text).width <= maxW) break;
    s -= 2;
  } while (s > 6);
  return s;
}

function centered(c, text, x, y, maxW, size, color, weight = 'bold', spacing = 0) {
  const s = fitText(c, text, maxW, size, JP_FONT, weight);
  c.fillStyle = color;
  c.textAlign = spacing ? 'left' : 'center';
  c.textBaseline = 'middle';
  if (spacing) {
    const chars = [...text];
    const total = chars.reduce((a, ch) => a + c.measureText(ch).width + spacing, -spacing);
    let cx = x - total / 2;
    for (const ch of chars) {
      c.fillText(ch, cx, y);
      cx += c.measureText(ch).width + spacing;
    }
  } else {
    c.fillText(text, x, y);
  }
  return s;
}

function vertical(c, text, x, y0, step, size, color) {
  c.font = `bold ${size}px ${JP_FONT}`;
  c.fillStyle = color;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  [...text].forEach((ch, i) => c.fillText(ch, x, y0 + i * step));
}

/* ---------------------------------- shop ---------------------------------- */

/** The big shop fascia: 青空商店 (fictional "Blue Sky Store"). */
export const shopSign = () =>
  cached('shopSign', () =>
    make(1024, 256, (c, w, h) => {
      c.fillStyle = '#fbfaf6';
      c.fillRect(0, 0, w, h);
      c.fillStyle = hex(PAL.blue);
      c.fillRect(0, h - 16, w, 16);
      c.fillRect(0, 0, w, 10);
      centered(c, '青空商店', w * 0.42, h * 0.5, w * 0.6, 150, '#20509e', 'bold', 14);
      c.font = `600 40px ${JP_FONT}`;
      c.fillStyle = '#7f8798';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText('AOZORA  STORE', w * 0.7, h * 0.42);
      c.font = `500 30px ${JP_FONT}`;
      c.fillStyle = '#a8adba';
      c.fillText('たばこ ・ 氷 ・ 弁当', w * 0.7, h * 0.68);
    })
  );

/** Vertical banner beside the shop door. */
export const shopBanner = () =>
  cached('shopBanner', () =>
    make(192, 768, (c, w, h) => {
      c.fillStyle = hex(PAL.red);
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#fdf6ec';
      c.fillRect(10, 10, w - 20, h - 20);
      c.fillStyle = hex(PAL.red);
      c.fillRect(10, 10, w - 20, 90);
      centered(c, '氷', w / 2, 55, w - 40, 70, '#fdf6ec');
      vertical(c, 'つめたい', w / 2, 180, 96, 76, '#1e4f96');
      vertical(c, 'のみもの', w / 2, 560, 96, 62, '#3c3a46');
    })
  );

/** Small paper posters taped to the shop wall. */
export const poster = (variant = 0) =>
  cached('poster' + variant, () =>
    make(320, 448, (c, w, h) => {
      const sets = [
        { bg: '#fdf7e8', bar: PAL.red, t: 'さくら祭', s: '四月五日' },
        { bg: '#eef6fd', bar: PAL.blue, t: '町内会', s: 'そうじ当番' },
        { bg: '#fdeef1', bar: PAL.purple, t: '春の便り', s: 'ひばり台' },
        { bg: '#f4fbef', bar: PAL.leafDeep, t: '野菜市', s: '毎週日曜' },
      ];
      const st = sets[variant % sets.length];
      c.fillStyle = st.bg;
      c.fillRect(0, 0, w, h);
      c.fillStyle = hex(st.bar);
      c.fillRect(0, 0, w, 26);
      c.fillRect(0, h - 20, w, 20);
      centered(c, st.t, w / 2, 120, w - 40, 96, hex(st.bar), 'bold', 6);
      centered(c, st.s, w / 2, 222, w - 60, 52, '#4b4757');
      // abstract flat illustration block
      c.fillStyle = '#e9e3d8';
      c.fillRect(40, 270, w - 80, 120);
      c.fillStyle = hex(PAL.blossomDeep);
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.arc(70 + i * 45, 330 + (i % 2) * 22, 16, 0, Math.PI * 2);
        c.fill();
      }
    })
  );

/** Rolling metal shutter (horizontal slats). */
export const shutterTex = (rows = 24) =>
  cached('shutter' + rows, () =>
    make(64, 512, (c, w, h) => {
      const step = h / rows;
      for (let i = 0; i < rows; i++) {
        // slats read as light/dark bands rather than a flat black field
        c.fillStyle = i % 2 ? '#c9c4d2' : '#eae6ee';
        c.fillRect(0, i * step, w, step);
        c.fillStyle = '#9a94a6';
        c.fillRect(0, i * step + step - 2.5, w, 2.5);
      }
    })
  );

/* -------------------------------- vending -------------------------------- */

/** Lit header panel with a fictional brand mark. */
export const vendHeader = (variant = 0) =>
  cached('vendHeader' + variant, () =>
    make(512, 160, (c, w, h) => {
      const sets = [
        { bg: '#ffffff', fg: PAL.red, t: 'そら茶' },
        { bg: '#e0453f', fg: 0xffffff, t: 'ハレ水' },
        { bg: '#2e9a98', fg: 0xffffff, t: 'なごみ' },
      ];
      const st = sets[variant % sets.length];
      c.fillStyle = st.bg;
      c.fillRect(0, 0, w, h);
      centered(c, st.t, w * 0.36, h / 2, w * 0.5, 106, hex(st.fg), 'bold', 8);
      c.fillStyle = hex(st.fg);
      c.globalAlpha = 0.85;
      c.beginPath();
      c.arc(w * 0.78, h / 2, 44, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
      c.fillStyle = st.bg;
      c.beginPath();
      c.arc(w * 0.78, h / 2, 26, 0, Math.PI * 2);
      c.fill();
    })
  );

/** Hot / cold strip and price row under the shelves. */
export const vendPrice = () =>
  cached('vendPrice', () =>
    make(512, 96, (c, w, h) => {
      c.fillStyle = '#f6f3ee';
      c.fillRect(0, 0, w, h);
      const n = 6;
      for (let i = 0; i < n; i++) {
        const x = (i * w) / n;
        c.fillStyle = i % 3 === 0 ? '#e0453f' : '#2f6fc4';
        c.fillRect(x + 6, 14, w / n - 12, 44);
        c.fillStyle = '#ffffff';
        c.font = `bold 30px ${JP_FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('150', x + w / n / 2, 38);
        c.fillStyle = '#8b8696';
        c.fillRect(x + 18, 68, w / n - 36, 8);
      }
    })
  );

export const vendCold = (hot = false) =>
  cached('vendCold' + hot, () =>
    make(256, 96, (c, w, h) => {
      c.fillStyle = hot ? '#d8453f' : '#2f6fc4';
      c.fillRect(0, 0, w, h);
      centered(c, hot ? 'あたたかい' : 'つめたい', w / 2, h / 2, w - 24, 58, '#ffffff', 'bold', 2);
    })
  );

/**
 * The 取出口 flap.
 *
 * This used to be the delivery *panel* -- a printed plate, 2:1, standing where
 * the opening should have been, with a painted black bar for the slot.  There
 * is a real opening in the body now and this is the face of the flap that
 * hangs over it, so it is 4:1 to match a 0.58 x 0.15 m flap and dark, because
 * a flap is smoked plastic and the plate around it was the machine's own
 * colour.
 */
export const vendSlot = () =>
  cached('vendSlot', () =>
    make(256, 64, (c, w, h) => {
      c.fillStyle = '#33313c';
      c.fillRect(0, 0, w, h);
      // the moulded lip along the hinge, which is what catches the light
      c.fillStyle = '#4b4856';
      c.fillRect(0, 0, w, 8);
      /* High on the plate, not centred: textures flip in y, so the canvas's
       * upper third is the flap's upper third -- and the can lands in the
       * bottom half of the opening, where lettering across it makes the drink
       * read as broken type rather than as a drink. */
      centered(c, '取出口', w / 2, h * 0.32, w - 80, 22, '#cbc5bb');
    })
  );

/* -------------------------------- railway -------------------------------- */

export const crossingSign = () =>
  cached('crossingSign', () =>
    make(512, 256, (c, w, h) => {
      c.fillStyle = '#fbf8f2';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = hex(PAL.black);
      c.lineWidth = 12;
      c.strokeRect(6, 6, w - 12, h - 12);
      centered(c, '踏切注意', w / 2, h * 0.36, w - 60, 96, hex(PAL.redDeep), 'bold', 6);
      centered(c, 'とまれ  みよ  きけ', w / 2, h * 0.74, w - 80, 46, hex(PAL.black), 'bold', 2);
    })
  );

export const stationSign = () =>
  cached('stationSign', () =>
    make(768, 192, (c, w, h) => {
      c.fillStyle = '#fbfaf6';
      c.fillRect(0, 0, w, h);
      c.fillStyle = hex(PAL.teal);
      c.fillRect(0, h - 22, w, 22);
      centered(c, 'ひばり台', w / 2, h * 0.42, w * 0.7, 104, '#2b3346', 'bold', 12);
      c.font = `600 34px ${JP_FONT}`;
      c.fillStyle = '#8a8fa0';
      c.textAlign = 'center';
      c.fillText('HIBARIDAI', w / 2, h * 0.82);
    })
  );

export const warningPlate = (variant = 0) =>
  cached('warnPlate' + variant, () =>
    make(256, 512, (c, w, h) => {
      const sets = [
        { bg: PAL.yellow, fg: PAL.black, t: '防犯カメラ' },
        { bg: PAL.red, fg: 0xfdf8f0, t: '立入禁止' },
        { bg: 0xfdf8f0, fg: PAL.blueDeep, t: '徐行' },
        /* Appended with ひばり台六丁目: the plate that explains a fifteen-metre
         * circle of asphalt with nothing parked on it.  A 転回場 is not a car
         * park and the sign at its mouth is the only thing that says so. */
        { bg: 0xfdf8f0, fg: PAL.redDeep, t: '転回場' },
      ];
      const st = sets[variant % sets.length];
      c.fillStyle = hex(st.bg);
      c.fillRect(0, 0, w, h);
      c.fillStyle = hex(st.fg);
      c.fillRect(12, 12, w - 24, 6);
      c.fillRect(12, h - 18, w - 24, 6);
      vertical(c, st.t, w / 2, 90, 88, 74, hex(st.fg));
    })
  );

/** Front destination board of the train. */
export const trainDest = () =>
  cached('trainDest', () =>
    make(512, 128, (c, w, h) => {
      c.fillStyle = '#1d2230';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#f2e6b0';
      c.fillRect(10, 22, 110, 84);
      centered(c, '各停', 65, 64, 96, 56, '#1d2230');
      centered(c, 'ひばり台', w * 0.62, h / 2, w * 0.55, 78, '#f2e6b0', 'bold', 6);
    })
  );

export const trainNumber = () =>
  cached('trainNumber', () =>
    make(256, 96, (c, w, h) => {
      c.fillStyle = '#f7f2e6';
      c.fillRect(0, 0, w, h);
      centered(c, 'クハ 2104', w / 2, h / 2, w - 20, 50, '#4a4657');
    })
  );

/* --------------------------------- street --------------------------------- */

/** Yellow tactile paving (点字ブロック) -- dots, tiling along its length. */
export const tactileTex = (bars = false) =>
  cached('tactile' + bars, () =>
    make(128, 128, (c, w, h) => {
      c.fillStyle = hex(PAL.tactile);
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#d9a91f';
      if (bars) {
        for (let i = 0; i < 4; i++) c.fillRect(10, 12 + i * 30, w - 20, 16);
      } else {
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 4; x++) {
            c.beginPath();
            c.arc(20 + x * 29, 20 + y * 29, 9, 0, Math.PI * 2);
            c.fill();
          }
      }
    }, { repeat: [1, 1] })
  );

/** Worn white road paint: 止まれ, and the diamond that warns of a crossing. */
export const roadPaint = (kind = 'stop') =>
  cached('roadPaint' + kind, () =>
    make(512, 512, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = 'rgba(244, 242, 246, 0.94)';
      if (kind === 'stop' || kind === 'slow') {
        c.save();
        c.translate(w / 2, h / 2);
        c.font = `bold 168px ${JP_FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        // stacked vertically the way it is painted on the road
        if (kind === 'slow') {
          /* 徐行 -- two characters rather than three, so it sits higher up the
           * plane and does not read as a cropped 止まれ.  Added with the motor
           * vehicles: a school frontage with cars parked along it needs the one
           * marking that says why they are all crawling. */
          c.fillText('徐', 0, -40);
          c.fillText('行', 0, 130);
        } else {
          c.fillText('止', 0, -95);
          c.fillText('ま', 0, 75);
          c.fillText('れ', 0, 235);
        }
        c.restore();
      } else if (kind === 'go') {
        /* 進行方向 -- the filled arrow painted on a ramp, an aisle or a lane.
         * Appended with ひばり台七丁目: the only other kind here is the hollow
         * diamond (菱形標示, "crossing ahead"), and a car park signed with two
         * dozen of those says something quite different from what it means. */
        c.beginPath();
        c.moveTo(w / 2, 44);
        c.lineTo(w / 2 + 132, 236);
        c.lineTo(w / 2 + 54, 236);
        c.lineTo(w / 2 + 54, h - 44);
        c.lineTo(w / 2 - 54, h - 44);
        c.lineTo(w / 2 - 54, 236);
        c.lineTo(w / 2 - 132, 236);
        c.closePath();
        c.fill();
      } else {
        c.lineWidth = 40;
        c.strokeStyle = 'rgba(244, 242, 246, 0.94)';
        c.beginPath();
        c.moveTo(w / 2, 40);
        c.lineTo(w - 60, h / 2);
        c.lineTo(w / 2, h - 40);
        c.lineTo(60, h / 2);
        c.closePath();
        c.stroke();
      }
    }, { srgb: true })
  );

export const drainTex = () =>
  cached('drainTex', () =>
    make(128, 128, (c, w, h) => {
      c.fillStyle = '#6d687a';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#8a849a';
      for (let i = 0; i < 7; i++) c.fillRect(12, 10 + i * 16, w - 24, 8);
    })
  );

export const platePlate = () =>
  cached('platePlate', () =>
    make(256, 128, (c, w, h) => {
      c.fillStyle = '#f6f4f0';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#4f5a72';
      c.lineWidth = 8;
      c.strokeRect(8, 8, w - 16, h - 16);
      centered(c, 'さ 21-08', w / 2, h / 2, w - 40, 56, '#2f3646');
    })
  );

export const noParking = () =>
  cached('noParking', () =>
    make(256, 256, (c, w, h) => {
      c.fillStyle = '#fbfaf6';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = hex(PAL.blue);
      c.lineWidth = 22;
      c.beginPath();
      c.arc(w / 2, h / 2, 96, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = hex(PAL.red);
      c.lineWidth = 20;
      c.beginPath();
      c.moveTo(48, 208);
      c.lineTo(208, 48);
      c.stroke();
    })
  );

/* --------------------------------- nature --------------------------------- */

/** Soft five-lobed petal silhouette used as an alpha mask. */
export const petalTex = () =>
  cached('petalTex', () =>
    make(128, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.translate(w / 2, h / 2);
      c.fillStyle = '#ffffff';
      c.beginPath();
      // a single rounded petal, wider at the tip with a small notch
      c.moveTo(0, 52);
      c.bezierCurveTo(38, 34, 46, -14, 14, -48);
      c.bezierCurveTo(6, -38, 2, -34, 0, -30);
      c.bezierCurveTo(-2, -34, -6, -38, -14, -48);
      c.bezierCurveTo(-46, -14, -38, 34, 0, 52);
      c.closePath();
      c.fill();
    }, { srgb: false })
  );

/** Soft round blob used for the flat anime clouds. */
export const cloudTex = () =>
  cached('cloudTex', () =>
    make(512, 256, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      const puffs = [
        [0.22, 0.62, 0.15], [0.36, 0.46, 0.2], [0.52, 0.4, 0.24],
        [0.68, 0.5, 0.19], [0.82, 0.63, 0.14], [0.45, 0.66, 0.2], [0.6, 0.68, 0.17],
      ];
      c.fillStyle = '#ffffff';
      for (const [x, y, r] of puffs) {
        c.beginPath();
        c.ellipse(x * w, y * h, r * w * 0.55, r * h * 1.1, 0, 0, Math.PI * 2);
        c.fill();
      }
      // trim the bottom flat, the way cel-painted clouds sit on a line
      c.globalCompositeOperation = 'destination-out';
      c.fillRect(0, h * 0.78, w, h * 0.22);
      c.globalCompositeOperation = 'source-over';
    }, { srgb: false })
  );

/* ------------------------------ misc surfaces ------------------------------ */

export const meterBox = () =>
  cached('meterBox', () =>
    make(256, 256, (c, w, h) => {
      c.fillStyle = '#eceaf0';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#cfccd6';
      c.fillRect(20, 20, w - 40, 90);
      c.fillStyle = '#3a3744';
      c.fillRect(40, 40, w - 80, 50);
      c.fillStyle = '#8b8696';
      c.fillRect(20, 140, w - 40, 12);
      c.fillRect(20, 172, w - 90, 12);
    })
  );

export const shrinePlate = () =>
  cached('shrinePlate', () =>
    make(128, 256, (c, w, h) => {
      c.fillStyle = '#e8e2ea';
      c.fillRect(0, 0, w, h);
      vertical(c, '地蔵', w / 2, 70, 70, 56, '#5a5468');
    })
  );

export const alleyPlate = () =>
  cached('alleyPlate', () =>
    make(512, 128, (c, w, h) => {
      c.fillStyle = '#fbfaf6';
      c.fillRect(0, 0, w, h);
      c.fillStyle = hex(PAL.blossomDeep);
      c.fillRect(0, h - 14, w, 14);
      centered(c, 'さくら通り', w / 2, h * 0.45, w - 60, 72, '#4a4657', 'bold', 6);
    })
  );

/* ================================================================== *
 * The wider district.
 *
 * Signage for the school, the shrine, the shopping street, the canal and
 * the new housing.  Same rules as everything above: flat colour, crisp
 * type, no photographic detail, and every string invented -- no real
 * brands, no real places, and no depictions of people anywhere.
 * ================================================================== */

/** Accept either a PAL number or a css string. */
const col = (v) => (typeof v === 'number' ? hex(v) : v);

const flipCache = new Map();

/**
 * A horizontally mirrored view of a texture, for the back face of a
 * double-sided sign.
 *
 * Opposite faces of a box share their UV winding, so putting the same map on
 * both sides of a blade sign or a road plate gives you correct type on the
 * front and mirror writing on the back.  Cloning the texture and flipping its
 * `repeat` costs nothing -- the image is shared -- and is cached per source so
 * a dozen signs still only build one flipped view of each.
 */
export function mirrored(tex) {
  if (flipCache.has(tex)) return flipCache.get(tex);
  const t = tex.clone();
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.x = -1;
  t.offset.x = 1;
  t.needsUpdate = true;
  flipCache.set(tex, t);
  return t;
}

/** A thin rule, the workhorse of Japanese signage layout. */
function rule(c, x, y, w, h, color) {
  c.fillStyle = col(color);
  c.fillRect(x, y, w, h);
}

/**
 * Chain-link mesh, as a diagonal lattice with genuinely transparent gaps.
 *
 * A flat translucent panel reads as tinted glass, which is exactly wrong for
 * a school fence.  Drawing the lattice and letting the gaps be empty is what
 * makes it read as mesh, and mipmapping softens it to a pale wash in the
 * distance instead of aliasing into moire.
 */
export const chainLinkTex = () =>
  cached('chainLink', () =>
    make(128, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255,255,255,0.92)';
      c.lineWidth = 7;
      c.lineCap = 'square';
      for (let i = -1; i <= 2; i++) {
        c.beginPath();
        c.moveTo(i * w, 0);
        c.lineTo(i * w + w, h);
        c.stroke();
        c.beginPath();
        c.moveTo(i * w, h);
        c.lineTo(i * w + w, 0);
        c.stroke();
      }
    }, { srgb: false })
  );

/* ---------------------------------- school ---------------------------------- */

/** Stone name plate beside the school gate. */
export const schoolPlate = () =>
  cached('schoolPlate', () =>
    make(320, 1024, (c, w, h) => {
      c.fillStyle = '#d9d4dc';
      c.fillRect(0, 0, w, h);
      rule(c, 18, 18, w - 36, 5, '#8f8a9c');
      rule(c, 18, h - 23, w - 36, 5, '#8f8a9c');
      vertical(c, '県立ひばり台高等学校', w / 2, 96, 88, 74, '#43404f');
    })
  );

/** The long board over the shoe-locker entrance. */
export const schoolEntrance = () =>
  cached('schoolEntrance', () =>
    make(1024, 192, (c, w, h) => {
      c.fillStyle = '#fbfaf6';
      c.fillRect(0, 0, w, h);
      rule(c, 0, h - 18, w, 18, PAL.teal);
      centered(c, 'ひばり台高等学校', w * 0.44, h * 0.46, w * 0.62, 96, '#2b3346', 'bold', 10);
      c.font = `600 34px ${JP_FONT}`;
      c.fillStyle = '#8a8fa0';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText('昇  降  口', w * 0.78, h * 0.46);
    })
  );

/**
 * Club recruitment and event notices.  These carry most of the school's
 * story: nobody is on screen, so the posters have to say that the place is
 * running.
 */
export const clubPoster = (variant = 0) =>
  cached('clubPoster' + variant, () =>
    make(384, 544, (c, w, h) => {
      const sets = [
        { bg: '#fdf6e6', bar: PAL.red, t: '吹奏楽部', s: '新入部員 募集中', f: '毎週 火・木・土' },
        { bg: '#eef5fd', bar: PAL.blue, t: '天文観測会', s: '四月十九日 夜', f: '屋上にて  雨天中止' },
        { bg: '#f2fbef', bar: PAL.leafDeep, t: '園芸部', s: '花壇の当番表', f: '水やりを わすれずに' },
        { bg: '#fdeef1', bar: PAL.purple, t: '春季大会', s: '応援よろしく', f: '第二グラウンド' },
        { bg: '#fdf1e2', bar: PAL.orange, t: '図書委員会', s: '返却は 期限までに', f: '貸出 三冊まで' },
        { bg: '#eefaf8', bar: PAL.teal, t: '剣道部', s: '見学 いつでも', f: '体育館 第二フロア' },
      ];
      const st = sets[variant % sets.length];
      c.fillStyle = st.bg;
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 30, st.bar);
      rule(c, 0, h - 22, w, 22, st.bar);
      centered(c, st.t, w / 2, 128, w - 46, 92, col(st.bar), 'bold', 6);
      centered(c, st.s, w / 2, 226, w - 60, 50, '#4b4757');
      // flat illustration band: bars and dots, never a figure
      c.fillStyle = '#e7e1d6';
      c.fillRect(38, 272, w - 76, 150);
      c.fillStyle = col(st.bar);
      c.globalAlpha = 0.7;
      for (let i = 0; i < 4; i++) c.fillRect(58 + i * 74, 300 + (i % 2) * 26, 46, 96 - (i % 2) * 30);
      c.globalAlpha = 1;
      centered(c, st.f, w / 2, 470, w - 60, 38, '#6a6577', '600');
    })
  );

/** Cork notice board backing, so the posters read as pinned to something. */
export const corkBoard = () =>
  cached('corkBoard', () =>
    make(512, 256, (c, w, h) => {
      c.fillStyle = '#c3a279';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#b8946b';
      for (let i = 0; i < 90; i++) {
        const x = ((i * 137) % w) | 0;
        const y = ((i * 89) % h) | 0;
        c.fillRect(x, y, 7, 4);
      }
      c.strokeStyle = '#7d6348';
      c.lineWidth = 10;
      c.strokeRect(5, 5, w - 10, h - 10);
    })
  );

/** Blackboard glimpsed through a classroom window. */
export const blackboardTex = () =>
  cached('blackboardTex', () =>
    make(512, 256, (c, w, h) => {
      c.fillStyle = hex(PAL.blackboard);
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#8a9c92';
      c.lineWidth = 6;
      c.globalAlpha = 0.5;
      // chalk marks: horizontal strokes only, no legible writing
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.moveTo(40, 56 + i * 38);
        c.lineTo(40 + 150 + ((i * 97) % 240), 56 + i * 38);
        c.stroke();
      }
      c.globalAlpha = 0.75;
      c.fillStyle = '#dfe6df';
      c.fillRect(w - 120, 30, 84, 8);
      c.globalAlpha = 1;
      rule(c, 0, h - 22, w, 22, 0x8a6f52);
    })
  );

/** Blue 通学路 plate and the yellow 注意 diamond. */
export const roadSignTex = (kind = 'tsugakuro') =>
  cached('roadSign' + kind, () =>
    make(320, 320, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      if (kind === 'chui') {
        c.save();
        c.translate(w / 2, h / 2);
        c.rotate(Math.PI / 4);
        c.fillStyle = hex(PAL.yellow);
        c.fillRect(-98, -98, 196, 196);
        c.fillStyle = hex(PAL.black);
        c.fillRect(-98, -98, 196, 10);
        c.fillRect(-98, 88, 196, 10);
        c.fillRect(-98, -98, 10, 196);
        c.fillRect(88, -98, 10, 196);
        c.rotate(-Math.PI / 4);
        centered(c, '注意', 0, 0, 168, 96, hex(PAL.black), 'bold', 8);
        c.restore();
      } else if (kind === 'slow') {
        c.fillStyle = '#fbfaf6';
        c.fillRect(0, 0, w, h);
        c.strokeStyle = hex(PAL.redDeep);
        c.lineWidth = 16;
        c.strokeRect(14, 14, w - 28, h - 28);
        centered(c, '徐行', w / 2, h * 0.36, w - 70, 104, hex(PAL.redDeep), 'bold', 8);
        centered(c, 'こどもがとびだします', w / 2, h * 0.74, w - 40, 36, '#4b4757', '600', 1);
      } else {
        c.fillStyle = hex(PAL.blue);
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#fbfaf6';
        c.fillRect(14, 14, w - 28, h - 28);
        centered(c, '通学路', w / 2, h * 0.4, w - 60, 96, hex(PAL.blueDeep), 'bold', 8);
        rule(c, 60, h * 0.58, w - 120, 6, PAL.blue);
        centered(c, 'SCHOOL ZONE', w / 2, h * 0.72, w - 60, 34, '#7f8798', '600', 2);
      }
    }, { srgb: true })
  );

/** Gate notice: the school is shut, which is the whole point. */
export const gateNotice = () =>
  cached('gateNotice', () =>
    make(384, 512, (c, w, h) => {
      c.fillStyle = '#fbf8f2';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 26, PAL.teal);
      centered(c, 'お知らせ', w / 2, 92, w - 60, 74, '#2b3346', 'bold', 6);
      rule(c, 40, 138, w - 80, 4, '#c8c4d0');
      const lines = ['校門は 十八時に', 'しまります', '', '来校のかたは', '職員室まで', '', 'ひばり台高等学校'];
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      lines.forEach((t, i) => {
        if (!t) return;
        c.font = `600 ${i === 6 ? 30 : 40}px ${JP_FONT}`;
        c.fillStyle = i === 6 ? '#8a8696' : '#4b4757';
        c.fillText(t, w / 2, 190 + i * 48);
      });
    })
  );

/* --------------------------------- shop fronts --------------------------------- */

const SHOPS = {
  conbini: { bg: '#fcfbf6', bar: PAL.teal, fg: '#1f6f6d', t: 'ひばりマート', s: '２４じかん', en: 'HIBARI MART' },
  ramen: { bg: '#b5322f', bar: PAL.yellow, fg: '#fdf6ec', t: 'らーめん 一心', s: 'しお しょうゆ みそ', en: 'ISSHIN' },
  wagashi: { bg: '#f7ede1', bar: PAL.blossomDeep, fg: '#8a4a62', t: '和菓子 さくら堂', s: 'だいふく どらやき', en: 'SAKURADO' },
  hana: { bg: '#f2f7ee', bar: PAL.leafDeep, fg: '#37684b', t: '花の店 みどり', s: 'きりばな はちうえ', en: 'MIDORI' },
  kosho: { bg: '#eae3d0', bar: PAL.roofBrown, fg: '#5b4335', t: '古本 つばめ書房', s: 'こしょ かいとり', en: 'TSUBAME BOOKS' },
  cleaning: { bg: '#eef4fb', bar: PAL.blue, fg: '#2a4f97', t: 'クリーニング しらゆき', s: 'あさだし ゆうがた', en: 'SHIRAYUKI' },
  bunbo: { bg: '#fdf3e0', bar: PAL.orange, fg: '#a3531c', t: '文具とゲーム ほしの', s: 'ガチャ ノート カード', en: 'HOSHINO' },
  bakery: { bg: '#fdf1dc', bar: 0xd8a03c, fg: '#8a5a20', t: 'パン工房 こむぎ', s: 'やきたて まいあさ', en: 'KOMUGI' },
  sento: { bg: '#f6f3ea', bar: PAL.blue, fg: '#20509e', t: '松 の 湯', s: 'あさ六時 - よる十一時', en: 'MATSU-NO-YU' },
  sozai: { bg: '#fdf4e2', bar: PAL.teal, fg: '#1d6a58', t: 'そうざい ひなた', s: 'おべんとう からあげ', en: 'HINATA' },
  /* The two Showa units.  Both fascias are deliberately *low contrast* -- a
   * forty-year-old painted sign has gone chalky and its ground has yellowed, and
   * that faded pair of tones next to the crisp modern shopfronts either side is
   * the whole reason they read as old.  No people on either, which rules out the
   * portrait window a photo studio would have wanted. */
  record: { bg: '#e6dcc4', bar: 0x9c4a3f, fg: '#7a3f38', t: 'レコード ほしぞら', s: 'えるぴー ・ どうなつばん', en: 'HOSHIZORA RECORD' },
  denki: { bg: '#dfe4dc', bar: 0x36527f, fg: '#2c4a72', t: '電器 たかの', s: 'しゅうり ・ でんきゅう', en: 'TAKANO DENKI' },
  // and the corner shop-house up on the north lane
  kokuya: { bg: '#f2ead2', bar: PAL.leafDeep, fg: '#4a5f35', t: '米 ・ 酒 なかの', s: 'こめ さけ たばこ', en: 'NAKANO' },
  /* The four services a residential block has and a shopping street does not:
   * nobody travels to any of them, so none of them advertises.  Every one of
   * these four is a near-white ground with a single thin bar and the type in
   * the bar's own hue -- no saturated field, no second accent, nothing that
   * would pull the eye off さくら坂 two streets away.  A clinic that shouts is
   * a clinic nobody trusts, and that is the reason as much as the composition
   * is. */
  /* `shopFascia` starts the right-hand column at 0.76 w and the board is 1024
   * wide, so `en` and `s` have 246 px: about thirteen Latin characters at 34 px
   * and eight full-width ones at 28 px.  Longer strings are simply cut off at
   * the edge of the board -- which is what 松の湯's 'あさ六時 - よる十一時' and
   * ほしの's 'ガチャ ノート カード' already do.  Hence the short romanisations
   * here, which is also what most of the row above uses. */
  clinic: { bg: '#f4f7fa', bar: PAL.blue, fg: '#23508f', t: 'ひばり台内科', s: 'ないか しょうにか', en: 'CLINIC' },
  yakkyoku: { bg: '#fbf7ec', bar: PAL.leafDeep, fg: '#37684b', t: 'くすり さかい', s: 'ちょうざい', en: 'SAKAI' },
  laundry: { bg: '#edf2f5', bar: PAL.teal, fg: '#1f6f6d', t: 'コインランドリー ひばり', s: '六時 - よる十二時', en: 'LAUNDRY' },
  fudosan: { bg: '#fbf6e6', bar: PAL.orange, fg: '#a3531c', t: 'ひばり不動産', s: 'あきま ちゅうしゃ', en: 'ESTATE' },
  /* The two on the school route.  They exist because reusing ほしの's and
   * たかの's fascias for them -- the nearest thing the table already had to a
   * stationer and a repair shop -- put さくら坂's two shops a second time on a
   * street four hundred metres away, which is the one thing this round's brief
   * ruled out. A town has one of each.
   *
   * Both are warmer and plainer than the さくら坂 row: a school stationer and a
   * bicycle shop are the two shops in a suburb that never had a sign designed
   * for them, they just painted the name on the board. */
  bungu: { bg: '#fdf6e4', bar: 0xc08a3e, fg: '#8a5a20', t: '文具 ひばり堂', s: 'ノート えんぴつ', en: 'HIBARIDO' },
  ringyo: { bg: '#eef2ec', bar: 0x4a6f58, fg: '#37684b', t: 'ひばり輪業', s: 'しゅうり ・ ぱんく', en: 'RINGYO' },
  /* The two on ひばり台六丁目, at the bus turnaround.  The table already had a
   * pharmacy, a coin laundry, a dry cleaner and a rice-and-sake shop, and the
   * whole point of six丁目 is that it is somebody's *ordinary* week -- so
   * reusing any of those would have put the same shop twice in one town, which
   * is the mistake `bungu` and `ringyo` were added to avoid one round ago.
   *
   * Both are deliberately the quietest fascias in the table.  They stand at the
   * end of a bus route on the edge of the estate, thirty metres from a hillside,
   * and the loudest thing in that frame has to be the bus. */
  bento: { bg: '#fdf2e0', bar: 0xc4713a, fg: '#a3531c', t: 'お弁当 のはら', s: 'できたて まいにち', en: 'NOHARA' },
  zakka: { bg: '#f4f1e6', bar: PAL.purple, fg: '#5c5480', t: '雑貨 まるみ', s: 'にちようひん', en: 'MARUMI' },
};

/** Horizontal shop fascia. One layout, nine tenants. */
export const shopFascia = (kind = 'conbini') =>
  cached('fascia' + kind, () =>
    make(1024, 224, (c, w, h) => {
      const st = SHOPS[kind] ?? SHOPS.conbini;
      c.fillStyle = st.bg;
      c.fillRect(0, 0, w, h);
      rule(c, 0, h - 16, w, 16, st.bar);
      rule(c, 0, 0, w, 8, st.bar);
      centered(c, st.t, w * 0.4, h * 0.46, w * 0.62, 118, st.fg, 'bold', 10);
      c.font = `600 34px ${JP_FONT}`;
      c.fillStyle = st.fg;
      c.globalAlpha = 0.72;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(st.en, w * 0.76, h * 0.36);
      c.font = `500 28px ${JP_FONT}`;
      c.globalAlpha = 0.55;
      c.fillText(st.s, w * 0.76, h * 0.66);
      c.globalAlpha = 1;
    })
  );

/** Tall projecting sign, the kind bolted out over a narrow street. */
export const shopBlade = (kind = 'ramen') =>
  cached('blade' + kind, () =>
    make(192, 768, (c, w, h) => {
      const st = SHOPS[kind] ?? SHOPS.ramen;
      c.fillStyle = st.bg;
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 12, st.bar);
      rule(c, 0, h - 12, w, 12, st.bar);
      const label = st.t.split(' ').pop();
      vertical(c, label, w / 2, 110, 108, 88, st.fg);
    })
  );

/** Cloth noren hung in a doorway. */
export const norenTex = (kind = 'ramen') =>
  cached('noren' + kind, () =>
    make(512, 256, (c, w, h) => {
      const sets = {
        ramen: { bg: PAL.norenRed, fg: '#f6ecdc', t: 'らーめん' },
        sento: { bg: PAL.noren, fg: '#f6ecdc', t: 'ゆ' },
        wagashi: { bg: PAL.norenCream, fg: '#8a4a62', t: '和菓子' },
        soba: { bg: 0x2f5540, fg: '#eef3e6', t: 'そば' },
        record: { bg: 0x3f4a68, fg: '#eee2c8', t: 'レコード' },
        // appended with ひばり台六丁目, for the 弁当屋 at the turnaround
        bento: { bg: 0xb8763a, fg: '#fdf4e4', t: 'お弁当' },
      };
      const st = sets[kind] ?? sets.ramen;
      c.fillStyle = col(st.bg);
      c.fillRect(0, 0, w, h);
      /* A noren is split into hanging panels, and the slits go through
       * whatever is printed on it.  Long labels can be sliced -- real ones
       * are -- but a single character has to sit inside one panel or it just
       * reads as broken marks. */
      const chars = [...st.t];
      if (chars.length === 1) {
        centered(c, st.t, w / 2, h * 0.46, w / 3 - 20, 130, st.fg, 'bold');
      } else {
        centered(c, st.t, w / 2, h * 0.46, w - 90, 118, st.fg, 'bold', 10);
      }
      c.globalCompositeOperation = 'destination-out';
      for (const x of [w * 0.33, w * 0.66]) c.fillRect(x - 4, h * 0.3, 8, h);
      c.globalCompositeOperation = 'source-over';
    }, { srgb: true })
  );

/** Chalked menu board leaned against a shopfront. */
export const menuBoard = () =>
  cached('menuBoard', () =>
    make(384, 512, (c, w, h) => {
      c.fillStyle = '#3a4148';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#a8845c';
      c.lineWidth = 20;
      c.strokeRect(10, 10, w - 20, h - 20);
      centered(c, '本日の', w / 2, 84, w - 90, 52, '#f0e6cc');
      centered(c, 'おすすめ', w / 2, 142, w - 80, 60, '#f4c033');
      const rows = [['しおらーめん', '七二〇'], ['みそらーめん', '七八〇'], ['ぎょうざ', '三六〇'], ['めんま', '一八〇']];
      c.textBaseline = 'middle';
      rows.forEach(([a, b], i) => {
        c.font = `600 38px ${JP_FONT}`;
        c.fillStyle = '#e8e2d2';
        c.textAlign = 'left';
        c.fillText(a, 46, 232 + i * 62);
        c.textAlign = 'right';
        c.fillText(b, w - 46, 232 + i * 62);
        c.globalAlpha = 0.35;
        rule(c, 46, 258 + i * 62, w - 92, 2, '#cfc8b6');
        c.globalAlpha = 1;
      });
    })
  );

/** Paper lantern, hung in a row down the shopping street. */
export const lanternTex = (variant = 0) =>
  cached('lantern' + variant, () =>
    make(256, 256, (c, w, h) => {
      c.fillStyle = variant === 1 ? '#f2ddb8' : '#f8ecd6';
      c.fillRect(0, 0, w, h);
      // ribs
      c.fillStyle = 'rgba(180,160,124,0.5)';
      for (let i = 0; i < 9; i++) c.fillRect(0, 12 + i * 28, w, 3);
      const t = ['桜坂', '商店街', 'ゆ', '祭', '奉納'][variant % 5];
      centered(c, t, w / 2, h / 2, w - 70, variant >= 3 ? 128 : 92,
        variant === 2 ? '#20509e' : '#b5322f', 'bold', 6);
    })
  );

/** Small promotional flag clipped to a shopfront rail. */
export const flagTex = (variant = 0) =>
  cached('flag' + variant, () =>
    make(256, 384, (c, w, h) => {
      const sets = [
        { bg: PAL.red, fg: '#fdf6ec', t: 'アイス' },
        { bg: PAL.blue, fg: '#fdf6ec', t: 'つめたい' },
        { bg: PAL.yellow, fg: '#3c3a46', t: 'しんはつばい' },
        { bg: PAL.teal, fg: '#fdf6ec', t: 'おべんとう' },
      ];
      const st = sets[variant % sets.length];
      c.fillStyle = col(st.bg);
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#fdf8f0';
      c.fillRect(10, 10, w - 20, h - 20);
      c.fillStyle = col(st.bg);
      c.fillRect(10, 10, w - 20, 70);
      vertical(c, st.t, w / 2, 140, 62, 52, col(st.fg === '#3c3a46' ? '#3c3a46' : st.bg));
    })
  );

/** Front of a capsule-toy machine. */
export const gachaTex = () =>
  cached('gachaTex', () =>
    make(256, 256, (c, w, h) => {
      c.fillStyle = '#f6f2ea';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 46, PAL.orange);
      centered(c, 'ガチャ', w / 2, 24, w - 40, 36, '#fdf6ec');
      // a jumble of capsules
      const cols = ['#e0453f', '#f4c033', '#3d6ec4', '#2f9c9a', '#ef8a3c', '#e86f9c'];
      for (let i = 0; i < 22; i++) {
        c.fillStyle = cols[i % cols.length];
        c.beginPath();
        c.arc(34 + ((i * 53) % 190), 88 + ((i * 71) % 130), 21, 0, Math.PI * 2);
        c.fill();
      }
      rule(c, 0, h - 30, w, 30, 0xd8d4dc);
      centered(c, '一回 三〇〇円', w / 2, h - 15, w - 40, 26, '#4b4757', '600');
    })
  );

/** The plate on the low wall of the vending corner, naming the place. */
export const cornerPlate = () =>
  cached('cornerPlate', () =>
    make(640, 190, (c, w, h) => {
      c.fillStyle = '#f4f1e6';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 12, PAL.teal);
      rule(c, 0, h - 12, w, 12, PAL.teal);
      rule(c, 22, 30, 8, h - 60, 0xd8d2c4);
      centered(c, 'さくら坂 いっぷく処', w * 0.52, h * 0.42, w - 90, 62, '#2f5b52', 'bold', 5);
      c.font = `500 26px ${JP_FONT}`;
      c.fillStyle = '#8a8b82';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('ごみは お持ちかえりください', w * 0.52, h * 0.72);
    })
  );

/* ------------------------------- overbridge ------------------------------- */

/** Direction plate at the foot of the 跨線橋 stairs. */
export const bridgeSign = (side = 0) =>
  cached('bridgeSign' + side, () =>
    make(576, 320, (c, w, h) => {
      c.fillStyle = '#f7f9fb';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 22, PAL.blue);
      rule(c, 0, h - 10, w, 10, 0xc8ccd4);
      centered(c, 'ひばり台こ線橋', w / 2, 84, w - 60, 62, '#23508f', 'bold', 4);
      /* The arrow does the work; the type only names the thing.  Two shapes,
       * pointing at whichever bank this plate stands on. */
      const dir = side ? -1 : 1;
      const cy = 196, ax = w / 2 + dir * 96;
      c.fillStyle = '#3a4657';
      c.fillRect(w / 2 - dir * 104, cy - 11, 150, 22);
      c.beginPath();
      c.moveTo(ax + dir * 46, cy);
      c.lineTo(ax - dir * 14, cy - 44);
      c.lineTo(ax - dir * 14, cy + 44);
      c.closePath();
      c.fill();
      c.font = `600 34px ${JP_FONT}`;
      c.fillStyle = '#5c6474';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(side ? 'のりば・駅' : 'さくら坂・商店街', w / 2, h - 52);
    })
  );

/** One of the two small ad boards bolted to the bridge balustrade. */
export const bridgeAd = (variant = 0) =>
  cached('bridgeAd' + variant, () =>
    make(768, 320, (c, w, h) => {
      const sets = [
        { bg: '#f3ede0', bar: PAL.red, fg: '#8d3a34', t: 'まつのゆ', s: 'あさ六時 - よる十一時', tag: '銭 湯' },
        { bg: '#eaf1f6', bar: PAL.teal, fg: '#1f6060', t: 'ひばり台自転車商会', s: 'しゅうり・タイヤ・かぎ', tag: '自転車' },
      ];
      const st = sets[variant % sets.length];
      c.fillStyle = st.bg;
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 18, st.bar);
      rule(c, 0, h - 18, w, 18, st.bar);
      rule(c, 26, 44, 150, h - 88, st.bar);
      c.globalAlpha = 0.92;
      vertical(c, st.tag, 101, 108, 92, 74, '#fdf6ec');
      c.globalAlpha = 1;
      centered(c, st.t, 470, 128, 540, 88, st.fg, 'bold', 6);
      c.font = `600 40px ${JP_FONT}`;
      c.fillStyle = st.fg;
      c.globalAlpha = 0.62;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(st.s, 470, 216);
      c.globalAlpha = 1;
    })
  );

/* -------------------------------- bathhouse -------------------------------- */

/**
 * The 富士 board over the bathhouse entrance.
 *
 * A sento is recognisable from the far end of a street by exactly one thing,
 * and it is not the chimney -- it is the painted Fuji.  Six flat shapes and
 * no gradient anywhere: sky, water, the cone, one shadow facet down its east
 * flank, the snow, and a pine at each end.  That flatness is the reference,
 * not a simplification of it -- these are painted fast, with a wide brush,
 * by somebody who has done four hundred of them.
 *
 * The name sits left of the cone rather than over it, so the board is not
 * symmetrical about the doorway underneath.
 */
export const sentoFuji = () =>
  cached('sentoFuji', () =>
    make(1024, 340, (c, w, h) => {
      const HZ = h * 0.74;                     // the waterline
      const px = w * 0.585, py = h * 0.115;    // the apex
      const half = w * 0.325;                  // half the base
      const poly = (pts, fill) => {
        c.fillStyle = fill;
        c.beginPath();
        pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.closePath();
        c.fill();
      };

      c.fillStyle = '#d7e9f5';
      c.fillRect(0, 0, w, h);
      poly([[px - half, HZ], [px, py], [px + half, HZ]], '#6d95bd');
      // the shadow side: the one facet that gives the cone any form at all
      poly([[px, py], [px + half, HZ], [px + half * 0.17, HZ]], '#4d719b');
      /* Snow, with the ragged lower edge these always get.  Every point stays
       * inside the cone: the half width at height y is half*(y-py)/(HZ-py),
       * which at the lowest notch here is 0.16 w. */
      poly([
        [px, py],
        [px + w * 0.112, h * 0.415], [px + w * 0.073, h * 0.345],
        [px + w * 0.032, h * 0.400], [px - w * 0.012, h * 0.340],
        [px - w * 0.052, h * 0.408], [px - w * 0.090, h * 0.352],
        [px - w * 0.112, h * 0.415],
      ], '#f6f9fb');
      rule(c, 0, HZ, w, h - HZ, '#4f7ba3');
      rule(c, 0, HZ, w, 5, '#e4eff7');          // the light line on the horizon

      // a pine at each end, three flat tiers on a stub trunk
      const pine = (x, s) => {
        rule(c, x - 5 * s, HZ - 42 * s, 10 * s, 46 * s, '#38291f');
        for (let i = 0; i < 3; i++) {
          const ty = HZ - 34 * s - i * 32 * s;
          const tw = (86 - i * 20) * s;
          poly([[x - tw, ty], [x + tw, ty], [x, ty - 40 * s]], i === 1 ? '#1d3a30' : '#264639');
        }
      };
      pine(w * 0.075, 1.05);
      pine(w * 0.945, 0.86);

      centered(c, '松の湯', w * 0.245, h * 0.33, w * 0.30, 104, '#16314f', 'bold', 10);
      c.font = `600 30px ${JP_FONT}`;
      c.fillStyle = '#3a5c86';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('ま つ の ゆ', w * 0.245, h * 0.56);
    })
  );

/* ---------------------------------- shrine ---------------------------------- */

/** Board over the shrine offertory. */
export const shrineName = () =>
  cached('shrineName', () =>
    make(256, 768, (c, w, h) => {
      c.fillStyle = '#e6dcc4';
      c.fillRect(0, 0, w, h);
      rule(c, 16, 16, w - 32, 6, 0x8a7350);
      rule(c, 16, h - 22, w - 32, 6, 0x8a7350);
      vertical(c, '桜守神社', w / 2, 140, 150, 122, '#4a4034');
    })
  );

/** Ema plaques.  Wishes only -- never a drawing of a person. */
export const emaTex = (variant = 0) =>
  cached('ema' + variant, () =>
    make(256, 192, (c, w, h) => {
      c.fillStyle = '#e9d9b6';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 12, 0xb5322f);
      const sets = ['合格祈願', '家内安全', '交通安全', '無病息災', '学業成就'];
      centered(c, sets[variant % sets.length], w / 2, h * 0.5, w - 40, 62, '#4a4034', 'bold', 4);
      c.globalAlpha = 0.5;
      rule(c, 40, h * 0.74, w - 80, 3, 0x8a7350);
      c.globalAlpha = 1;
    })
  );

/** Omikuji drawer front. */
export const omikujiTex = () =>
  cached('omikujiTex', () =>
    make(256, 320, (c, w, h) => {
      c.fillStyle = '#f2e8d2';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 54, 0xb5322f);
      centered(c, 'おみくじ', w / 2, 27, w - 30, 40, '#fdf6ec');
      centered(c, '一回', w / 2, 118, w - 90, 56, '#4a4034');
      centered(c, '百円', w / 2, 186, w - 90, 62, '#b5322f');
      c.globalAlpha = 0.45;
      rule(c, 34, 244, w - 68, 3, 0x8a7350);
      c.globalAlpha = 1;
      centered(c, 'ご自由に', w / 2, 282, w - 60, 30, '#6a6153', '600');
    })
  );

/** How-to-worship notice at the foot of the steps. */
export const sanpaiNotice = () =>
  cached('sanpaiNotice', () =>
    make(384, 512, (c, w, h) => {
      c.fillStyle = '#f6f2e6';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 24, 0xb5322f);
      centered(c, '参拝のしかた', w / 2, 84, w - 60, 62, '#4a4034', 'bold', 4);
      const lines = ['一、手水で きよめる', '二、二礼', '三、二拍手', '四、一礼', '', '氏子会'];
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      lines.forEach((t, i) => {
        if (!t) return;
        c.font = `600 ${i === 5 ? 28 : 36}px ${JP_FONT}`;
        c.fillStyle = i === 5 ? '#8a8172' : '#4b4436';
        c.fillText(t, 46, 176 + i * 54);
      });
    })
  );

/* ------------------------------ canal and park ------------------------------ */

export const canalPlate = () =>
  cached('canalPlate', () =>
    make(384, 288, (c, w, h) => {
      c.fillStyle = hex(PAL.yellow);
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 14, PAL.black);
      rule(c, 0, h - 14, w, 14, PAL.black);
      centered(c, '危険', w / 2, h * 0.36, w - 80, 96, hex(PAL.redDeep), 'bold', 8);
      centered(c, 'ふかい水路です', w / 2, h * 0.68, w - 50, 44, hex(PAL.black), 'bold', 2);
    })
  );

/**
 * The 水利 plate on a culvert mouth.  0 is the inlet at the west end of the reach,
 * 1 the outlet at the east.
 *
 * **384 x 160 because the plate it lands on is 0.72 x 0.30.**  Aspect 2.4 against
 * aspect 2.4; `canalPlate` is 384 x 288 and putting that on this face is a 1.8-fold
 * horizontal crush, which renders as a smear and not as an error -- the `alleyPlate`
 * note in CLAUDE.md, and the reason the first draft of these two read as a grey bar.
 */
export const ankyoPlate = (v = 0) =>
  cached('ankyoPlate' + v, () =>
    make(384, 160, (c, w, h) => {
      c.fillStyle = hex(0xe8e4d6);
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 9, PAL.concreteDark);
      rule(c, 0, h - 9, w, 9, PAL.concreteDark);
      rule(c, 0, 0, 9, h, PAL.concreteDark);
      rule(c, w - 9, 0, 9, h, PAL.concreteDark);
      centered(c, v ? 'ひばり用水路　吐口' : 'ひばり用水路　呑口',
        w / 2, h * 0.38, w - 46, 44, hex(PAL.black), 'bold', 2);
      centered(c, v ? '第二号　暗渠　ひばり山土地改良区' : '第一号　暗渠　ごみを捨てないでください',
        w / 2, h * 0.72, w - 34, 26, hex(0x5a5346), 'normal', 1);
    })
  );

/**
 * 量水標 -- the gauge board at the outlet, graduated in tenths of a metre.
 *
 * 96 x 512, i.e. aspect 0.1875, and it is used at 0.18 x 0.96.  A gauge board is
 * the one plate in this world that is taller than it is wide, so it is also the one
 * where getting the aspect backwards would be obvious rather than subtle.
 */
export const gaugeBoard = () =>
  cached('gaugeBoard', () =>
    make(96, 512, (c, w, h) => {
      c.fillStyle = hex(0xf2efe4);
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 6, PAL.black);
      rule(c, 0, h - 6, w, 6, PAL.black);
      // ten major divisions, alternating red and black, with a tick at each half
      for (let i = 0; i < 10; i++) {
        const y0 = 10 + (i * (h - 20)) / 10;
        const seg = (h - 20) / 10;
        c.fillStyle = i % 2 ? hex(PAL.redDeep) : hex(PAL.black);
        c.fillRect(6, y0, w - 12, 5);
        c.fillRect(6, y0 + seg / 2, (w - 12) * 0.5, 4);
        c.font = 'bold 30px sans-serif';
        c.fillStyle = i % 2 ? hex(PAL.redDeep) : hex(PAL.black);
        c.textAlign = 'right';
        c.textBaseline = 'top';
        c.fillText(String(10 - i), w - 10, y0 + 8);
      }
    })
  );

/**
 * The cast plate on a bridge parapet.  0 is the canal footbridge, 1 the road
 * bridge where the street crosses the channel, 2 the plain farm crossing on
 * the eastern stretch.
 */
export const bridgePlate = (variant = 0) =>
  cached('bridgePlate' + variant, () =>
    make(512, 128, (c, w, h) => {
      const name = ['ひばり橋', 'こばと橋', 'なかて橋'][variant % 3];
      c.fillStyle = '#dcd7de';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#8f8a9c';
      c.lineWidth = 6;
      c.strokeRect(10, 10, w - 20, h - 20);
      centered(c, name, w / 2, h * 0.5, w - 70, 68, '#44404f', 'bold', 10);
    })
  );

/**
 * The enamel plate bolted to a sluice gate's headstock.
 *
 * Every 用水路 has one of these on its distribution gates, and it is the one
 * piece of signage in the world that reads as *infrastructure* rather than as
 * a shop or a warning: a works number, a gate number and the name of the body
 * that maintains it.  All invented.
 */
export const sluicePlate = () =>
  cached('sluicePlate', () =>
    make(384, 288, (c, w, h) => {
      c.fillStyle = '#e8e9e4';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 20, PAL.tealDeep);
      centered(c, '第二分水門', w / 2, 76, w - 60, 62, '#2f5b52', 'bold', 6);
      c.globalAlpha = 0.4;
      rule(c, 40, 118, w - 80, 3, '#9aa39a');
      c.globalAlpha = 1;
      const rows = [['管理番号', 'ひ - 一四'], ['開度', '全閉']];
      c.textBaseline = 'middle';
      rows.forEach(([a, b], i) => {
        c.font = `600 30px ${JP_FONT}`;
        c.fillStyle = '#4b4757';
        c.textAlign = 'left';
        c.fillText(a, 34, 162 + i * 48);
        c.textAlign = 'right';
        c.fillText(b, w - 34, 162 + i * 48);
      });
      centered(c, 'ひばり台 土地改良区', w / 2, 258, w - 60, 26, '#8a8696', '600');
    })
  );

export const parkSign = () =>
  cached('parkSign', () =>
    make(512, 384, (c, w, h) => {
      c.fillStyle = '#fbfaf4';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 26, PAL.leafDeep);
      centered(c, 'ひばり台 第二児童公園', w / 2, 96, w - 50, 62, '#37684b', 'bold', 4);
      c.globalAlpha = 0.4;
      rule(c, 50, 140, w - 100, 3, '#9aa39a');
      c.globalAlpha = 1;
      const lines = ['・ボール遊びは ひろばで', '・花火は きんし', '・ゴミは もちかえりましょう'];
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      lines.forEach((t, i) => {
        c.font = `600 34px ${JP_FONT}`;
        c.fillStyle = '#4b4757';
        c.fillText(t, 44, 196 + i * 54);
      });
      centered(c, '町内会', w / 2, 352, w - 80, 26, '#8a8696', '600');
    })
  );

export const parkingSign = () =>
  cached('parkingSign', () =>
    make(384, 512, (c, w, h) => {
      c.fillStyle = '#fbfaf6';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 96, PAL.blue);
      centered(c, 'ひばり駐車場', w / 2, 48, w - 40, 54, '#fdf8f0', 'bold', 2);
      centered(c, '２４', w / 2, 176, w - 120, 128, hex(PAL.redDeep));
      centered(c, '時間', w / 2, 262, w - 180, 56, '#4b4757');
      c.globalAlpha = 0.4;
      rule(c, 40, 310, w - 80, 3, '#9a94a6');
      c.globalAlpha = 1;
      const rows = [['８時 - ２０時', '２０分 １００円'], ['２０時 - ８時', '６０分 １００円']];
      c.textBaseline = 'middle';
      rows.forEach(([a, b], i) => {
        c.font = `600 28px ${JP_FONT}`;
        c.fillStyle = '#4b4757';
        c.textAlign = 'left';
        c.fillText(a, 40, 356 + i * 52);
        c.textAlign = 'right';
        c.fillText(b, w - 40, 356 + i * 52);
      });
      centered(c, '前払い  ・  空車', w / 2, 470, w - 60, 30, hex(PAL.teal), '600');
    })
  );

/* ------------------------------ the community bus ------------------------------ *
 * Added with the motor vehicles.  ひばり台ふれあい号 is the invented council
 * minibus; the only stop that exists is the one outside the library, which is
 * where the route would obviously turn.  Both plates are drawn to the aspect of
 * the geometry they land on -- a 1:1 disc and a 2:3 case -- because a map at the
 * wrong ratio renders as an unreadable smear rather than as an error. */

/**
 * The round stop head: operator over the stop name, a rule, then the route.
 *
 * Variant 0 is 図書館前 and is exactly as it was drawn, because a stop head is
 * an index like every other plate art in this file; variant 1 is the terminus
 * up at the turnaround in ひばり台六丁目, and the only difference that matters
 * is the 終点 line -- a stop that is the end of the route says so, and that one
 * word is what makes a circle of asphalt read as somewhere a bus turns round.
 */
export const busStopPlate = (variant = 0) =>
  cached('busStopPlate' + variant, () =>
    make(384, 384, (c, w) => {
      const sets = [
        { t: '図書館前', foot: '１日 ４便' },
        { t: '六丁目', foot: '終点  ・  ここで折返し' },
      ];
      const st = sets[variant % sets.length];
      c.fillStyle = '#fbfaf6';
      c.beginPath();
      c.arc(w / 2, w / 2, w / 2 - 6, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = hex(PAL.blueDeep);
      c.lineWidth = 14;
      c.stroke();
      centered(c, 'ひばり台', w / 2, 92, w - 130, 40, hex(PAL.blueDeep), '600');
      centered(c, st.t, w / 2, 168, w - 90, 62, '#3b3846', 'bold', 2);
      c.globalAlpha = 0.45;
      rule(c, 96, 226, w - 192, 3, '#8a84a0');
      c.globalAlpha = 1;
      centered(c, 'ふれあい号', w / 2, 268, w - 120, 34, hex(PAL.teal), '600');
      centered(c, st.foot, w / 2, 316, w - 130, 26, '#6f6a80', '600');
    })
  );

/**
 * 路線図 -- the route diagram in the shelter's case at the terminus.
 *
 * A line of stops with a dot at each one, which is what a community-bus board
 * actually is, and the one place in the world where the district's own place
 * names are all written down together.  Nobody on it, like everything else
 * here: a route map is a diagram of a place, not of the people on it.
 */
export const busRouteBoard = () =>
  cached('busRouteBoard', () =>
    make(512, 384, (c, w, h) => {
      c.fillStyle = '#fdfbf6';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 52, PAL.blueDeep);
      centered(c, 'ふれあい号  路線図', w / 2, 26, w - 40, 30, '#fdf8f0', 'bold', 2);

      // the line, drawn once, with a fatter cap at each terminus
      const x0 = 66, x1 = w - 66, y = 150;
      c.strokeStyle = hex(PAL.teal);
      c.lineWidth = 9;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x0, y);
      c.lineTo(x1, y);
      c.stroke();

      const stops = ['踏切前', '商店街', '図書館前', '町内会館', '六丁目'];
      stops.forEach((s, i) => {
        const x = x0 + ((x1 - x0) * i) / (stops.length - 1);
        const end = i === 0 || i === stops.length - 1;
        c.fillStyle = '#fdfbf6';
        c.beginPath();
        c.arc(x, y, end ? 17 : 12, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = hex(end ? PAL.blueDeep : PAL.teal);
        c.lineWidth = end ? 8 : 6;
        c.stroke();
        c.save();
        c.translate(x, y + 34);
        c.rotate(-0.62);
        c.font = `600 ${end ? 25 : 22}px ${JP_FONT}`;
        c.fillStyle = end ? '#3b3846' : '#6a6577';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText(s, 0, 0);
        c.restore();
      });

      c.globalAlpha = 0.35;
      rule(c, 48, 288, w - 96, 3, '#9a94a6');
      c.globalAlpha = 1;
      centered(c, '一周 およそ 二十分', w / 2, 318, w - 120, 26, '#4b4757', '600');
      centered(c, 'ひばり台町内会  ・  日祝は運休', w / 2, 352, w - 90, 22, '#8a8696', '600');
    })
  );

/** The timetable case under it: two columns of departure times. */
export const busTimetable = () =>
  cached('busTimetable', () =>
    make(320, 480, (c, w, h) => {
      c.fillStyle = '#fdfbf6';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 56, PAL.blueDeep);
      centered(c, '時刻表', w / 2, 28, w - 40, 32, '#fdf8f0', 'bold', 2);
      const cols = [['右まわり', ['7:40', '10:20', '13:50', '16:30']],
        ['左まわり', ['8:15', '11:05', '14:35', '17:10']]];
      cols.forEach(([head, times], i) => {
        const x = w * (i ? 0.74 : 0.26);
        centered(c, head, x, 96, w * 0.44, 24, hex(PAL.teal), '600');
        c.globalAlpha = 0.4;
        rule(c, x - w * 0.2, 122, w * 0.4, 2, '#9a94a6');
        c.globalAlpha = 1;
        times.forEach((t, j) => centered(c, t, x, 164 + j * 62, w * 0.4, 34, '#4b4757', '600'));
      });
      centered(c, '日祝は運休', w / 2, 436, w - 60, 22, '#8a8696', '600');
    })
  );

/* -------------------------------- the library -------------------------------- */

/** The name board over the library entrance. */
export const libraryName = () =>
  cached('libraryName', () =>
    make(1024, 176, (c, w, h) => {
      c.fillStyle = '#f7f4ec';
      c.fillRect(0, 0, w, h);
      rule(c, 0, h - 12, w, 12, PAL.tealDeep);
      centered(c, 'ひばり台 図書館', w * 0.42, h * 0.48, w * 0.66, 92, '#2f5b52', 'bold', 8);
      c.font = `600 26px ${JP_FONT}`;
      c.fillStyle = '#8a8b82';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText('HIBARIDAI  LIBRARY', w * 0.74, h * 0.42);
      c.font = `500 22px ${JP_FONT}`;
      c.fillText('町立 第二分館', w * 0.74, h * 0.68);
    })
  );

/** The opening-hours plate beside the door. */
export const libraryHours = () =>
  cached('libraryHours', () =>
    make(384, 512, (c, w, h) => {
      c.fillStyle = '#fbfaf4';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 22, PAL.teal);
      centered(c, '開館時間', w / 2, 76, w - 60, 58, '#2f5b52', 'bold', 6);
      c.globalAlpha = 0.4;
      rule(c, 40, 118, w - 80, 3, '#9aa39a');
      c.globalAlpha = 1;
      const rows = [['平日', '九時 - 十九時'], ['土日', '九時 - 十七時'], ['休館', '毎週月曜']];
      c.textBaseline = 'middle';
      rows.forEach(([a, b], i) => {
        c.font = `600 30px ${JP_FONT}`;
        c.fillStyle = i === 2 ? '#a3531c' : '#4b4757';
        c.textAlign = 'left';
        c.fillText(a, 34, 168 + i * 54);
        c.textAlign = 'right';
        c.fillText(b, w - 34, 168 + i * 54);
      });
      c.globalAlpha = 0.4;
      rule(c, 40, 344, w - 80, 3, '#9aa39a');
      c.globalAlpha = 1;
      centered(c, '返却は ポストへ', w / 2, 392, w - 50, 30, '#4b4757', '600');
      centered(c, '館内では おしずかに', w / 2, 444, w - 50, 30, '#8a8696', '600');
    })
  );

/** The 返却ポスト lid plate. */
export const returnPlate = () =>
  cached('returnPlate', () =>
    make(384, 192, (c, w, h) => {
      c.fillStyle = '#e8eae4';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 16, PAL.tealDeep);
      centered(c, '返却ポスト', w / 2, h * 0.44, w - 60, 56, '#2f5b52', 'bold', 5);
      centered(c, '閉館中も ご利用できます', w / 2, h * 0.78, w - 40, 24, '#8a8b82', '600');
    })
  );

/**
 * The library reading room, seen through glass.
 *
 * Same rules as `shopInterior`: flat, low contrast, and darker than the sunlit
 * frontage or the glass stops reading as glass.  What has to survive at four
 * metres is the *rhythm* -- a run of tall shelving, a long table under a row of
 * lamps, and the pale rectangle of a window on the far wall.  Nobody is in it,
 * which is exactly as quiet as a library at five in the afternoon.
 */
export const libraryInterior = (variant = 0) =>
  cached('libraryInterior' + variant, () =>
    make(512, 320, (c, w, h) => {
      const v = variant % 3;
      c.fillStyle = ['#e6e2d4', '#e8e2d0', '#e0ded2'][v];
      c.fillRect(0, 0, w, h);
      /* Ceiling warm and bright, and two lit fittings in it.  This frontage
       * faces away from the sun, so what these plates are really doing is
       * putting the only warm light on the elevation *behind* the glass -- the
       * building has to look occupied and lit from a cool street. */
      rule(c, 0, 0, w, 34, 0xf6efdc);
      for (let i = 0; i < 3; i++) rule(c, 40 + i * 160, 8, 110, 16, 0xfff2d4);
      rule(c, 0, h - 66, w, 66, 0xc4bcac);     // floor
      if (v === 0) {
        // the shelf wall: tall runs with a lighter book band on every tier
        for (let i = 0; i < 5; i++) {
          const x = 18 + i * 100;
          rule(c, x, 52, 86, h - 130, 0xc0ab8c);
          for (let r = 0; r < 4; r++) {
            rule(c, x + 5, 60 + r * 44, 76, 32, ['#b08f62', '#a89078', '#bda07c', '#9c8a72'][r % 4]);
            c.fillStyle = 'rgba(70,64,56,0.22)';
            for (let k = 0; k < 9; k++) c.fillRect(x + 7 + k * 8, 60 + r * 44, 3, 32);
          }
          rule(c, x, 52, 86, 6, 0x8a7558);
        }
      } else if (v === 1) {
        // the reading table: a long top, chair backs, and three hanging lamps
        rule(c, 0, 96, w, 12, 0xd8d2c4);        // a low shelf run behind
        for (let i = 0; i < 6; i++) rule(c, 20 + i * 84, 60, 62, 36, 0xb59a76);
        rule(c, 24, 186, w - 48, 18, 0xc9ad84);  // table top
        rule(c, 24, 204, w - 48, 10, 0xa88d66);  // its edge
        for (let i = 0; i < 5; i++) {
          rule(c, 52 + i * 96, 214, 46, 44, 0x8e7a5e);   // chair backs, tucked in
          rule(c, 66 + i * 96, 40, 8, 46, 0x9a94a2);     // the pendant stem
          rule(c, 52 + i * 96, 84, 36, 14, 0xf2e2b8);    // and its shade, lit
        }
      } else {
        // the counter and the notice wall behind it
        rule(c, 0, 60, 210, h - 138, 0xd8d2c4);
        for (let i = 0; i < 6; i++) {
          rule(c, 14 + (i % 3) * 66, 74 + ((i / 3) | 0) * 74, 54, 62, ['#eae2cc', '#dcd2b8', '#e4dcc4'][i % 3]);
        }
        rule(c, 232, 150, w - 258, 22, 0xc0a884);        // the counter
        rule(c, 232, 172, w - 258, 62, 0xa88d66);
        rule(c, 258, 118, 74, 32, 0xdfd6c0);             // a stack of returns on it
        rule(c, 268, 106, 54, 14, 0xcfc4a8);
        rule(c, 400, 120, 26, 30, 0xf2e2b8);             // the desk lamp
      }
      // the flat wash a pane puts over everything behind it
      c.fillStyle = 'rgba(118,114,138,0.18)';
      c.fillRect(0, 0, w, h);
    })
  );

/* --------------------------- the corner and its booth --------------------------- */

/** The light box on top of a public telephone box. */
export const phoneBoxSign = () =>
  cached('phoneBoxSign', () =>
    make(512, 160, (c, w, h) => {
      c.fillStyle = '#f4f2ea';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 10, 0x2f6b52);
      rule(c, 0, h - 10, w, 10, 0x2f6b52);
      centered(c, '公衆電話', w * 0.46, h * 0.44, w * 0.6, 82, '#245a44', 'bold', 8);
      c.font = `600 22px ${JP_FONT}`;
      c.fillStyle = '#7f8f84';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('TELEPHONE', w * 0.46, h * 0.78);
      /* the receiver glyph: a bar with a rounded cup at each end, which is the
       * whole of what a telephone mark is -- and involves nobody */
      c.strokeStyle = '#245a44';
      c.lineWidth = 13;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(w * 0.83, h * 0.32);
      c.lineTo(w * 0.9, h * 0.68);
      c.stroke();
      c.lineWidth = 24;
      c.beginPath();
      c.moveTo(w * 0.805, h * 0.28);
      c.lineTo(w * 0.855, h * 0.28);
      c.stroke();
      c.beginPath();
      c.moveTo(w * 0.875, h * 0.72);
      c.lineTo(w * 0.925, h * 0.72);
      c.stroke();
    })
  );

/** The small notice stuck inside the glass of a phone box. */
export const phoneNotice = (variant = 0) =>
  cached('phoneNotice' + variant, () =>
    make(256, 352, (c, w, h) => {
      const sets = [
        { bar: PAL.redDeep, t: '緊急通報', l: ['１１０ ・ １１９', 'は 無料です', '', '受話器を上げて', 'ボタンを押す'] },
        { bar: PAL.blue, t: 'ご案内', l: ['１０円 ・ ５０円', 'テレホンカード', '', 'つり銭は', 'でません'] },
      ];
      const st = sets[variant % sets.length];
      c.fillStyle = '#fbfaf4';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 18, st.bar);
      centered(c, st.t, w / 2, 56, w - 40, 44, col(st.bar), 'bold', 4);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      st.l.forEach((t, i) => {
        if (!t) return;
        c.font = `600 ${i === 0 ? 28 : 24}px ${JP_FONT}`;
        c.fillStyle = i === 0 ? '#4b4757' : '#6a6577';
        c.fillText(t, w / 2, 112 + i * 44);
      });
    })
  );

/**
 * The 街区案内図 on its board at the corner.
 *
 * An abstract plan, not a map: two crossing roads, a rail line, a scatter of
 * blocks and a red "you are here" dot.  It is here because a district guide
 * board is the one piece of street furniture that tells you a place is a place
 * with a name, and because it gives the phone box something to stand beside.
 */
export const guideBoard = () =>
  cached('guideBoard', () =>
    make(640, 448, (c, w, h) => {
      c.fillStyle = '#f6f4ec';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 44, PAL.blueDeep);
      centered(c, 'ひばり台 一丁目 案内図', w / 2, 22, w - 60, 30, '#f4f8ff', 'bold', 3);
      // the blocks
      c.fillStyle = '#e2e6dc';
      const blocks = [
        [24, 70, 150, 96], [200, 70, 118, 70], [344, 70, 130, 96], [500, 70, 116, 130],
        [24, 200, 118, 110], [172, 226, 146, 84], [344, 200, 130, 110],
        [24, 344, 200, 76], [252, 344, 130, 76], [412, 300, 204, 120],
      ];
      for (const [x, y, bw, bh] of blocks) c.fillRect(x, y, bw, bh);
      c.fillStyle = '#cfd8c8';
      for (const [x, y, bw, bh] of blocks.filter((_, i) => i % 3 === 0)) c.fillRect(x, y, bw, bh);
      // the two roads, then the railway across the bottom
      c.strokeStyle = '#ffffff';
      c.lineWidth = 18;
      c.beginPath();
      c.moveTo(0, 186);
      c.lineTo(w, 186);
      c.moveTo(332, 44);
      c.lineTo(332, h);
      c.stroke();
      c.strokeStyle = '#9aa3b4';
      c.lineWidth = 3;
      c.setLineDash([12, 9]);
      c.beginPath();
      c.moveTo(0, 292);
      c.lineTo(w, 292);
      c.stroke();
      c.setLineDash([]);
      // a few labels and the marker
      c.font = `600 19px ${JP_FONT}`;
      c.fillStyle = '#5a6472';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('図書館', 96, 118);
      c.fillText('商店街', 560, 132);
      c.fillText('小学校', 118, 254);
      c.fillText('駅', 470, 258);
      c.fillStyle = hex(PAL.redDeep);
      c.beginPath();
      c.arc(332, 220, 15, 0, Math.PI * 2);
      c.fill();
      c.font = `bold 20px ${JP_FONT}`;
      c.fillText('現在地', 396, 220);
    })
  );

/* ------------------------------ the Showa units ------------------------------ */

/**
 * The inside of the record shop and of the electrical shop, behind glass.
 *
 * Both are drawn as *stock*: rows of record sleeves on one, a wall of boxed
 * appliances on the other.  That is the whole difference between an old shop and
 * a new one -- the modern units on this street have air round their goods and
 * these two are full to the ceiling.  No people, which is also why the record
 * shop won over the photo studio that was drafted first: a Showa 写真館 window
 * is portraits, and this world does not have any.
 */
export const showaInterior = (variant = 0) =>
  cached('showaInterior' + variant, () =>
    make(512, 320, (c, w, h) => {
      if (variant % 2 === 0) {
        c.fillStyle = '#d8cfba';
        c.fillRect(0, 0, w, h);
        rule(c, 0, 0, w, 34, 0xe8dcc0);
        rule(c, 0, h - 62, w, 62, 0xa8977c);
        // three racks of sleeves, each one a run of thin coloured spines
        const cols = ['#b5322f', '#2f4a72', '#d39c1f', '#3f7a5e', '#8a4a62', '#4a4a92', '#a3531c'];
        for (let r = 0; r < 3; r++) {
          const y = 52 + r * 78;
          rule(c, 16, y + 56, w - 32, 10, 0x8a7558);
          for (let i = 0; i < 48; i++) {
            c.fillStyle = cols[(i * 3 + r) % cols.length];
            c.globalAlpha = 0.85;
            c.fillRect(20 + i * 10, y + ((i * 7) % 5), 7, 54);
          }
          c.globalAlpha = 1;
        }
        // the counter with a turntable on it, as a plinth and a pale disc
        rule(c, 300, 214, 190, 22, 0xb59a76);
        rule(c, 300, 236, 190, 24, 0x94805f);
        c.fillStyle = '#4b4757';
        c.beginPath();
        c.arc(360, 206, 26, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#d8d4dc';
        c.beginPath();
        c.arc(360, 206, 7, 0, Math.PI * 2);
        c.fill();
        rule(c, 400, 190, 66, 22, 0xcfc4a8);
      } else {
        c.fillStyle = '#d2d6d0';
        c.fillRect(0, 0, w, h);
        rule(c, 0, 0, w, 30, 0xe4e8e0);
        rule(c, 0, h - 58, w, 58, 0xa4a89e);
        // shelving stacked with boxed goods, and a wall of small drawers
        for (let r = 0; r < 4; r++) {
          const y = 44 + r * 58;
          rule(c, 14, y + 44, 300, 9, 0x8f9a92);
          for (let i = 0; i < 6; i++) {
            rule(c, 20 + i * 50, y, 42, 42, ['#dcd2b8', '#c9c2ae', '#e2dcc6', '#cfd4cc'][(i + r) % 4]);
            c.fillStyle = 'rgba(70,74,80,0.25)';
            c.fillRect(24 + i * 50, y + 8, 34, 6);
          }
        }
        rule(c, 330, 44, 168, 200, 0xb9beb6);
        c.fillStyle = '#9aa09a';
        for (let r = 0; r < 6; r++) {
          for (let i = 0; i < 3; i++) c.fillRect(338 + i * 56, 50 + r * 33, 48, 26);
        }
        // a fluorescent batten, the one thing that says "still trading"
        rule(c, 60, 8, 200, 12, 0xfff6dc);
      }
      c.fillStyle = 'rgba(112,108,132,0.2)';
      c.fillRect(0, 0, w, h);
    })
  );

/** The small blackboard notice a shop props by its door. */
export const chalkNotice = (variant = 0) =>
  cached('chalkNotice' + variant, () =>
    make(320, 384, (c, w, h) => {
      const sets = [
        { t: '入荷', l: ['しました', '', '中古 えるぴー', '五〇〇円 より'] },
        { t: '修理', l: ['承ります', '', 'テレビ ・ せんぷうき', 'ラジオ ・ とけい'] },
      ];
      const st = sets[variant % sets.length];
      c.fillStyle = '#39413c';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#9c7f52';
      c.lineWidth = 18;
      c.strokeRect(9, 9, w - 18, h - 18);
      centered(c, st.t, w / 2, 92, w - 90, 76, '#f4c033', 'bold', 8);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      st.l.forEach((t, i) => {
        if (!t) return;
        c.font = `600 ${i === 0 ? 40 : 30}px ${JP_FONT}`;
        c.fillStyle = i === 0 ? '#eee6d2' : '#c8c0ac';
        c.fillText(t, w / 2, 168 + i * 52);
      });
    })
  );

/** A record sleeve: a square of flat colour blocks, never a photograph. */
export const sleeveTex = (variant = 0) =>
  cached('sleeve' + variant, () =>
    make(256, 256, (c, w, h) => {
      const sets = [
        { bg: '#b5322f', a: '#f2e8d6', b: '#f4c033' },
        { bg: '#2f4a72', a: '#d8e4f0', b: '#e08a3c' },
        { bg: '#e8dcc0', a: '#3f7a5e', b: '#b5322f' },
        { bg: '#3f3a4a', a: '#efe0b4', b: '#8f6fb5' },
      ];
      const st = sets[variant % sets.length];
      c.fillStyle = st.bg;
      c.fillRect(0, 0, w, h);
      c.fillStyle = st.a;
      c.fillRect(20, 20, w - 40, 40);
      c.beginPath();
      c.arc(w * 0.62, h * 0.58, 52, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = st.b;
      c.fillRect(24, h - 74, 108, 22);
      c.beginPath();
      c.arc(w * 0.62, h * 0.58, 20, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.16)';
      c.fillRect(0, 0, 14, h);
    })
  );

/** Block name plate for a walk-up. */
export const blockPlate = (variant = 0) =>
  cached('blockPlate' + variant, () =>
    make(512, 152, (c, w, h) => {
      /* Appended, never reordered: `plate:` on a walk-up is an index into this
       * array, so inserting a name would rechristen a block that is already
       * standing. */
      const names = [['ひばり台コーポ', 'HIBARIDAI  CORP'], ['メゾン さくら坂', 'MAISON  SAKURAZAKA'],
        ['ハイツ ひばり', 'HEIGHTS  HIBARI'], ['コーポ みなみ', 'CORP  MINAMI'],
        ['グリーンハイツ', 'GREEN  HEIGHTS'], ['さくら荘', 'SAKURA  SO'],
        // appended with ひばり台六丁目
        ['コーポ ひがし', 'CORP  HIGASHI'], ['ハイツ みのり', 'HEIGHTS  MINORI'],
        ['第二 さくら荘', 'SAKURA  SO  II'],
        // appended with ひばり台七丁目
        ['コーポ さかえ', 'CORP  SAKAE']];
      const st = names[variant % names.length];
      c.fillStyle = '#f4f2ea';
      c.fillRect(0, 0, w, h);
      rule(c, 0, h - 13, w, 13, PAL.trim);
      /* The romanisation is **stacked under** the name, centred, rather than set
       * beside it -- which is how `hallPlate` does it and why that one is legible.
       * Side by side it does not fit: the name was centred at 0.4 w with 0.56 w
       * of room, so a seven-character name reaches x = 363 while the roman line
       * started at 358, and 15 Latin characters then ran off the 512 px plate as
       * well.  Both plates already standing in the world were clipped -- ひばり台
       * コーポ read 'HIBARIDAI CO' with the last letters underneath the 台 -- and
       * no romanisation short enough to fix it would have been worth reading.
       * Stacked, any name up to eight characters fits with either line intact. */
      centered(c, st[0], w / 2, h * 0.38, w - 60, 66, '#4b4757', 'bold', 6);
      centered(c, st[1], w / 2, h * 0.76, w - 90, 24, '#8f8a9c', '600', 5);
    })
  );

/* ------------------------------- the summer festival ------------------------------- */

/** The banner strung over the entrance to the festival ground. */
export const matsuriBanner = () =>
  cached('matsuriBanner', () =>
    make(1536, 224, (c, w, h) => {
      c.fillStyle = '#f6efdc';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 18, PAL.redDeep);
      rule(c, 0, h - 18, w, 18, PAL.redDeep);
      centered(c, 'ひばり台 夏まつり', w * 0.42, h * 0.5, w * 0.56, 118, '#a5302c', 'bold', 12);
      c.font = `bold 46px ${JP_FONT}`;
      c.fillStyle = '#2f5b52';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText('八月十日  ゆうがた 五時', w * 0.7, h * 0.42);
      c.font = `600 30px ${JP_FONT}`;
      c.fillStyle = '#8a8696';
      c.fillText('桜守神社  ・  ひばり台町内会', w * 0.7, h * 0.7);
    })
  );

/** The timber programme board, brush-written down the side of the ground. */
export const matsuriBoard = () =>
  cached('matsuriBoard', () =>
    make(512, 704, (c, w, h) => {
      c.fillStyle = '#e9dcbc';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#a8845c';
      c.lineWidth = 14;
      c.strokeRect(7, 7, w - 14, h - 14);
      rule(c, 0, 0, w, 20, PAL.redDeep);
      centered(c, '夏まつり 次第', w / 2, 74, w - 70, 62, '#a5302c', 'bold', 6);
      c.globalAlpha = 0.4;
      rule(c, 48, 116, w - 96, 3, '#9c8f6e');
      c.globalAlpha = 1;
      const rows = [
        ['五時', 'たいこ'], ['五時半', 'よてん ひらく'], ['六時', 'ぼんおどり'],
        ['七時', 'きんぎょすくい'], ['八時', 'はなび'], ['九時', 'おひらき'],
      ];
      c.textBaseline = 'middle';
      rows.forEach(([a, b], i) => {
        c.font = `600 34px ${JP_FONT}`;
        c.fillStyle = '#4b4335';
        c.textAlign = 'left';
        c.fillText(a, 44, 172 + i * 68);
        c.textAlign = 'right';
        c.fillText(b, w - 44, 172 + i * 68);
        c.globalAlpha = 0.3;
        rule(c, 44, 200 + i * 68, w - 88, 2, '#9c8f6e');
        c.globalAlpha = 1;
      });
      centered(c, 'あめの ばあいは 翌日', w / 2, 640, w - 60, 28, '#8a8069', '600');
    })
  );

/**
 * The strung flags: goldfish, a firework and 祭.
 *
 * Drawn as pattern rather than as picture -- three fish, one burst, one
 * character -- because a flag 0.3 m across seen at six metres has room for one
 * shape and no more.
 */
export const matsuriFlag = (variant = 0) =>
  cached('matsuriFlag' + variant, () =>
    make(256, 320, (c, w, h) => {
      const v = variant % 3;
      if (v === 0) {
        c.fillStyle = '#f4f7fa';
        c.fillRect(0, 0, w, h);
        rule(c, 0, 0, w, 22, 0x2f7fd0);
        // three goldfish: a body, a fan tail, an eye
        for (let i = 0; i < 3; i++) {
          const cx = 62 + (i % 2) * 96;
          const cy = 96 + i * 74;
          c.fillStyle = i === 1 ? '#e0574a' : '#ef8a3c';
          c.beginPath();
          c.ellipse(cx, cy, 34, 21, 0, 0, Math.PI * 2);
          c.fill();
          c.beginPath();
          c.moveTo(cx - 30, cy);
          c.lineTo(cx - 62, cy - 22);
          c.lineTo(cx - 56, cy);
          c.lineTo(cx - 62, cy + 22);
          c.closePath();
          c.fill();
          c.fillStyle = '#3c3a46';
          c.beginPath();
          c.arc(cx + 17, cy - 5, 4.5, 0, Math.PI * 2);
          c.fill();
        }
      } else if (v === 1) {
        c.fillStyle = '#2f3550';
        c.fillRect(0, 0, w, h);
        // one burst: radial strokes with dotted tips
        c.strokeStyle = '#f4c033';
        c.lineWidth = 5;
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          c.beginPath();
          c.moveTo(w / 2 + Math.cos(a) * 26, h * 0.42 + Math.sin(a) * 26);
          c.lineTo(w / 2 + Math.cos(a) * 88, h * 0.42 + Math.sin(a) * 88);
          c.stroke();
          c.fillStyle = i % 2 ? '#ef8a3c' : '#e86f9c';
          c.beginPath();
          c.arc(w / 2 + Math.cos(a) * 98, h * 0.42 + Math.sin(a) * 98, 7, 0, Math.PI * 2);
          c.fill();
        }
        centered(c, 'はなび', w / 2, h * 0.86, w - 70, 44, '#f2e8d6', 'bold', 6);
      } else {
        c.fillStyle = '#b5322f';
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#f6efdc';
        c.fillRect(12, 12, w - 24, h - 24);
        centered(c, '祭', w / 2, h * 0.46, w - 70, 168, '#a5302c', 'bold');
        centered(c, 'ひばり台', w / 2, h * 0.84, w - 80, 34, '#8a4a44', '600', 3);
      }
    })
  );

/** The paper sign over a folding stall. */
export const stallSign = (variant = 0) =>
  cached('stallSign' + variant, () =>
    make(640, 200, (c, w, h) => {
      const sets = [
        { bg: '#f6efdc', bar: PAL.redDeep, fg: '#a5302c', t: 'たこ焼き', s: '一舟 四〇〇円' },
        { bg: '#eaf4fa', bar: 0x2f7fd0, fg: '#20509e', t: 'かき氷', s: 'いちご ・ めろん' },
        { bg: '#fdf4e2', bar: PAL.orange, fg: '#a3531c', t: '金魚すくい', s: '一回 三〇〇円' },
        { bg: '#f2f7ee', bar: PAL.leafDeep, fg: '#37684b', t: '射的', s: 'たまは 五つ' },
        { bg: '#fdeef1', bar: PAL.blossomDeep, fg: '#8a4a62', t: 'わたあめ', s: '二〇〇円' },
      ];
      const st = sets[variant % sets.length];
      c.fillStyle = st.bg;
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 14, st.bar);
      rule(c, 0, h - 14, w, 14, st.bar);
      centered(c, st.t, w * 0.4, h * 0.5, w * 0.56, 104, st.fg, 'bold', 8);
      c.font = `600 34px ${JP_FONT}`;
      c.fillStyle = '#6a6577';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(st.s, w * 0.72, h * 0.52);
    })
  );

/** Temporary works plate: the ground is being set up, not used. */
export const setupPlate = (variant = 0) =>
  cached('setupPlate' + variant, () =>
    make(384, 288, (c, w, h) => {
      const sets = [
        { bar: PAL.yellow, t: '準備中', l: ['たちいり', 'ごえんりょ', 'ください'] },
        { bar: 0x36527f, t: '電源', l: ['さわらないで', 'ください', '町内会'] },
      ];
      const st = sets[variant % sets.length];
      c.fillStyle = '#fbfaf4';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 30, st.bar);
      rule(c, 0, h - 14, w, 14, st.bar);
      centered(c, st.t, w / 2, 92, w - 60, 72, '#4b4757', 'bold', 6);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      st.l.forEach((t, i) => {
        c.font = `600 30px ${JP_FONT}`;
        c.fillStyle = '#6a6577';
        c.fillText(t, w / 2, 156 + i * 42);
      });
    })
  );

/* ------------------------------ housing details ------------------------------ */

/** Door nameplate. Fictional surnames; nobody appears in the world. */
export const namePlate = (variant = 0) =>
  cached('namePlate' + variant, () =>
    make(256, 128, (c, w, h) => {
      /* Appended, never reordered: a plate's variant is a bare index, so
       * inserting a surname would move somebody else's front door.  Six was
       * enough for one lane and is not enough for thirty. */
      const names = ['森田', '白石', '東', '小谷', '中根', '若宮',
        '瀬川', '大野', '朝倉', '柏木', '津田', '室井'];
      c.fillStyle = ['#f2ece0', '#e4e8ee', '#efe6e6'][variant % 3];
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#a49eae';
      c.lineWidth = 5;
      c.strokeRect(8, 8, w - 16, h - 16);
      centered(c, names[variant % names.length], w / 2, h / 2, w - 50, 62, '#43404f', 'bold', 8);
    })
  );

/** Apartment block sign. */
export const apartmentPlate = () =>
  cached('apartmentPlate', () =>
    make(512, 160, (c, w, h) => {
      c.fillStyle = '#f6f3ee';
      c.fillRect(0, 0, w, h);
      rule(c, 0, h - 14, w, 14, PAL.purple);
      centered(c, 'ひばり荘', w * 0.4, h * 0.48, w * 0.5, 82, '#4b4757', 'bold', 8);
      c.font = `600 26px ${JP_FONT}`;
      c.fillStyle = '#8f8a9c';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText('HIBARI  SO', w * 0.68, h * 0.48);
    })
  );

/**
 * Refuse collection point plate -- one of those signs on every corner.
 *
 * Variant 0 is the collection timetable and is on every refuse point in the
 * world, so it is left exactly as it was drawn; variant 1 is the second sheet
 * that goes up beside it once a district is big enough to get its sorting
 * wrong.  Keyed per variant, or the first caller would decide for everybody.
 */
export const gomiPlate = (variant = 0) =>
  cached('gomiPlate' + variant, () =>
    make(384, 288, (c, w, h) => {
      if (variant % 2 === 1) {
        c.fillStyle = '#fbfaf4';
        c.fillRect(0, 0, w, h);
        rule(c, 0, 0, w, 22, PAL.teal);
        centered(c, '分別のお願い', w / 2, 70, w - 50, 52, '#1f6f6d', 'bold', 4);
        c.globalAlpha = 0.4;
        rule(c, 34, 106, w - 68, 3, '#9aa39a');
        c.globalAlpha = 1;
        /* Category left, what to do with it right.  The note is smaller than
         * the category on purpose: at three metres only the left column is
         * legible and it has to carry the sheet on its own. */
        const rows = [
          ['もえるごみ', '生ごみ ・ 紙くず'],
          ['プラ', 'すすいで つぶす'],
          ['びん ・ かん', 'ふたを はずす'],
          ['粗大ごみ', '町内会に 連絡'],
        ];
        c.textBaseline = 'middle';
        rows.forEach(([a, b], i) => {
          const y = 142 + i * 38;
          c.font = `600 26px ${JP_FONT}`;
          c.fillStyle = '#4b4757';
          c.textAlign = 'left';
          c.fillText(a, 32, y);
          c.font = `500 21px ${JP_FONT}`;
          c.fillStyle = '#7a7588';
          c.textAlign = 'right';
          c.fillText(b, w - 32, y);
          if (i < 3) {
            c.globalAlpha = 0.3;
            rule(c, 32, y + 19, w - 64, 2, '#9a94a6');
            c.globalAlpha = 1;
          }
        });
        return;
      }
      c.fillStyle = '#fbfaf4';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 22, PAL.leafDeep);
      centered(c, 'ごみ集積所', w / 2, 74, w - 50, 58, '#37684b', 'bold', 4);
      const rows = [['もえるごみ', '月・木'], ['しげん', '水'], ['びん・かん', '第二金']];
      c.textBaseline = 'middle';
      rows.forEach(([a, b], i) => {
        c.font = `600 32px ${JP_FONT}`;
        c.fillStyle = '#4b4757';
        c.textAlign = 'left';
        c.fillText(a, 36, 148 + i * 50);
        c.textAlign = 'right';
        c.fillText(b, w - 36, 148 + i * 50);
      });
    })
  );

/** A single printed sheet -- the one the wind took off a notice board. */
export const paperSheet = () =>
  cached('paperSheet', () =>
    make(256, 352, (c, w, h) => {
      c.fillStyle = '#fbfaf4';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 12, PAL.blue);
      c.fillStyle = '#b8b3c0';
      for (let i = 0; i < 9; i++) {
        c.fillRect(28, 60 + i * 30, w - 56 - ((i * 37) % 70), 8);
      }
      c.fillStyle = '#d8d4dc';
      c.fillRect(28, 260, w - 56, 60);
    })
  );

/* -------------------------------- interiors -------------------------------- */

/**
 * A classroom seen through glass: desks in rows, a board at the end, a
 * pinboard.  Painted flat as one texture rather than modelled, because the
 * moment it becomes real geometry it also becomes a lighting problem.
 */
export const classroomTex = (variant = 0) =>
  cached('classroom' + variant, () =>
    make(512, 384, (c, w, h) => {
      const wall = ['#d8d2c6', '#dad6cb', '#d3d0c8'][variant % 3];
      c.fillStyle = wall;
      c.fillRect(0, 0, w, h);
      // ceiling and floor bands
      rule(c, 0, 0, w, 52, 0xe6e2d8);
      rule(c, 0, h - 96, w, 96, 0xc0b6a4);
      if (variant % 3 === 0) {
        // board wall
        c.fillStyle = hex(PAL.blackboard);
        c.fillRect(58, 92, w - 116, 150);
        c.fillStyle = '#8a6f52';
        c.fillRect(58, 242, w - 116, 16);
        c.strokeStyle = 'rgba(200,214,205,0.45)';
        c.lineWidth = 6;
        for (let i = 0; i < 4; i++) {
          c.beginPath();
          c.moveTo(84, 126 + i * 32);
          c.lineTo(84 + 120 + ((i * 83) % 200), 126 + i * 32);
          c.stroke();
        }
      } else if (variant % 3 === 1) {
        // rows of desks receding
        for (let r = 0; r < 3; r++) {
          const y = 196 + r * 54;
          const inset = 70 - r * 24;
          for (let i = 0; i < 4; i++) {
            const bw = 74 + r * 8;
            const x = inset + i * (bw + 14);
            c.fillStyle = hex(PAL.deskTop);
            c.fillRect(x, y, bw, 14);
            c.fillStyle = '#a89b86';
            c.fillRect(x + 8, y + 14, 6, 30 + r * 6);
            c.fillRect(x + bw - 14, y + 14, 6, 30 + r * 6);
            c.fillStyle = '#8f95a0';
            c.fillRect(x + 18, y + 30, bw - 36, 10);
          }
        }
        // pinboard
        c.fillStyle = '#c3a279';
        c.fillRect(w - 150, 78, 120, 84);
        c.fillStyle = '#f4f0e6';
        for (let i = 0; i < 4; i++) c.fillRect(w - 140 + (i % 2) * 56, 88 + ((i / 2) | 0) * 40, 48, 32);
      } else {
        // corridor: lockers and a run of windows opposite
        c.fillStyle = hex(PAL.locker);
        for (let i = 0; i < 6; i++) {
          c.fillRect(24 + i * 78, 104, 68, 190);
          c.fillStyle = '#94a4b4';
          c.fillRect(24 + i * 78, 104, 68, 8);
          c.fillRect(52 + i * 78, 150, 12, 6);
          c.fillStyle = hex(PAL.locker);
        }
        c.fillStyle = '#b0a89a';
        c.fillRect(0, 292, w, 12);
      }
      // a hint of the near mullion, so the glass has depth behind it
      c.fillStyle = 'rgba(90,86,104,0.18)';
      c.fillRect(0, 0, w, h);
    })
  );

/**
 * The inside of a small shop, seen from the pavement through a recessed
 * glazed front: shelving, a chiller run, a counter.  Flat and low contrast --
 * it is depth behind glass, not a room the player will ever be in.
 */
export const shopInterior = (variant = 0) =>
  cached('shopInterior' + variant, () =>
    make(512, 320, (c, w, h) => {
      const v = variant % 4;
      c.fillStyle = ['#e2ddd2', '#e6dcc8', '#dcd8d0', '#e8ded0'][v];
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 40, 0xf2eee4);        // ceiling, lit
      rule(c, 0, h - 60, w, 60, 0xbfb6a6);   // floor
      if (v === 3) {
        /* The bathhouse entrance hall.  The 下足箱 themselves are real
         * geometry standing in the recess (see `shotengai.js`) -- what this
         * has to supply is the thing behind them, which is the pair of
         * curtained doorways.  Two of them, side by side, is the whole
         * grammar of the building. */
        rule(c, 0, h - 60, w, 14, 0xa89a86);           // the 上がり框, one step up
        rule(c, 24, 96, 150, h - 168, 0xcfc0a8);       // more lockers, half seen
        c.fillStyle = '#b6a68c';
        for (let r = 0; r < 4; r++) c.fillRect(30, 108 + r * 42, 138, 6);
        // the counter side, between the lockers and the doorways
        rule(c, 182, 118, 42, h - 190, 0xb99a72);
        for (const [x0, label, tone] of [[236, '男湯', '#2f4a72'], [376, '女湯', '#8a3f56']]) {
          rule(c, x0, 74, 118, h - 148, 0x6f6656);     // the opening, in shadow
          rule(c, x0, 74, 118, 74, tone);              // the noren over it
          c.fillStyle = 'rgba(232,238,246,0.92)';
          c.font = `bold 30px ${JP_FONT}`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          [...label].forEach((ch, i) => c.fillText(ch, x0 + 34 + i * 50, 112));
          // the slit, so it reads as cloth and not a painted board
          c.fillStyle = '#6f6656';
          c.fillRect(x0 + 57, 104, 5, 44);
        }
      } else if (v === 0) {
        // convenience store: a chiller run, then gondola shelving
        c.fillStyle = '#c6d8e0';
        c.fillRect(20, 56, 190, 200);
        c.fillStyle = '#eaf2f6';
        for (let r = 0; r < 4; r++) c.fillRect(28, 68 + r * 48, 174, 8);
        const cols = ['#e0453f', '#f4c033', '#3d6ec4', '#2f9c9a', '#ef8a3c', '#8fbf4a'];
        for (let r = 0; r < 4; r++) {
          for (let i = 0; i < 9; i++) {
            c.fillStyle = cols[(r * 3 + i) % cols.length];
            c.fillRect(32 + i * 19, 76 + r * 48, 13, 30);
          }
        }
        c.fillStyle = '#d8d2c4';
        c.fillRect(238, 120, 250, 20);
        c.fillRect(238, 176, 250, 20);
        c.fillStyle = '#b6ad9c';
        for (let i = 0; i < 8; i++) c.fillRect(246 + i * 30, 96, 22, 24);
        for (let i = 0; i < 8; i++) c.fillRect(246 + i * 30, 150, 22, 26);
      } else if (v === 1) {
        // counter shop: a long counter, stools, a curtain to the back
        c.fillStyle = '#a8825c';
        c.fillRect(0, 168, w, 30);
        c.fillStyle = '#8e6a48';
        c.fillRect(0, 198, w, 62);
        c.fillStyle = '#b5322f';
        c.fillRect(0, 40, w, 44);
        c.fillStyle = '#f2e8d6';
        for (let i = 0; i < 6; i++) c.fillRect(28 + i * 82, 50, 44, 24);
        c.fillStyle = '#6a6153';
        for (let i = 0; i < 6; i++) c.fillRect(40 + i * 82, 200, 34, 12);
      } else {
        // general goods: tall shelving, boxes, a step ladder shape
        c.fillStyle = '#cdc3b0';
        for (let i = 0; i < 4; i++) c.fillRect(24 + i * 124, 52, 100, 210);
        c.fillStyle = '#b3a894';
        for (let i = 0; i < 4; i++) {
          for (let r = 0; r < 4; r++) c.fillRect(24 + i * 124, 52 + r * 52, 100, 8);
        }
        const cols = ['#efe0c4', '#dcc9a8', '#e8d4b6', '#cbb894'];
        for (let i = 0; i < 4; i++) {
          for (let r = 0; r < 4; r++) {
            c.fillStyle = cols[(i + r) % 4];
            c.fillRect(32 + i * 124, 62 + r * 52, 84, 38);
          }
        }
      }
      // the flat wash a shop window puts over everything behind it
      c.fillStyle = 'rgba(120,116,140,0.16)';
      c.fillRect(0, 0, w, h);
    })
  );

/** Frosted / net curtain, half drawn. */
export const curtainTex = (variant = 0) =>
  cached('curtainTex' + variant, () =>
    make(256, 256, (c, w, h) => {
      c.fillStyle = variant ? '#eef2f6' : hex(PAL.curtain);
      c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(150,144,164,0.28)';
      for (let i = 0; i < 12; i++) {
        const x = i * 21 + ((i % 3) * 3);
        c.fillRect(x, 0, 7, h);
      }
      c.fillStyle = 'rgba(255,255,255,0.5)';
      c.fillRect(0, 0, w, 18);
    })
  );

/** Warm window glow with a hint of what is behind it -- no figures. */
export const litWindowTex = (variant = 0) =>
  cached('litWindow' + variant, () =>
    make(256, 256, (c, w, h) => {
      c.fillStyle = ['#f7e2b8', '#f2dcc0', '#f6e6c8'][variant % 3];
      c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(160,124,86,0.3)';
      if (variant % 3 === 0) {
        c.fillRect(24, 150, 208, 14);        // a shelf
        c.fillRect(40, 96, 34, 54);          // things on it
        c.fillRect(88, 110, 26, 40);
      } else if (variant % 3 === 1) {
        c.fillRect(0, 176, w, 80);           // a low cabinet
        c.fillRect(150, 60, 70, 116);        // a tall lamp shape
      } else {
        c.fillRect(30, 40, 90, 12);
        c.fillRect(30, 70, 60, 12);
        c.fillRect(0, 200, w, 56);
      }
      // the pale wash a paper screen gives
      c.fillStyle = 'rgba(255,246,224,0.4)';
      c.fillRect(0, 0, w, h);
    })
  );

/** Gym interior glimpse: line-marked floor, wall bars, high windows. */
export const gymInterior = () =>
  cached('gymInterior', () =>
    make(512, 256, (c, w, h) => {
      c.fillStyle = '#d6cfc0';
      c.fillRect(0, 0, w, h);
      rule(c, 0, h - 84, w, 84, 0xc8a878);
      c.strokeStyle = '#f0ece0';
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(0, h - 46);
      c.lineTo(w, h - 46);
      c.stroke();
      c.fillStyle = '#b9ad98';
      for (let i = 0; i < 8; i++) c.fillRect(20 + i * 62, 40, 42, 128);
      c.fillStyle = 'rgba(90,86,104,0.2)';
      c.fillRect(0, 0, w, h);
    })
  );

/* ------------------------------------------------------------------ *
 * 湯の坂 -- the onsen street.
 *
 * Same rules as everything above -- flat shapes, one accent per sign, no
 * photographic detail -- but the palette runs older and warmer than the
 * shopping street's: indigo and bare timber instead of enamel and plastic, so
 * the two streets read as different decades rather than as different colour
 * schemes.  Every name here is invented.
 * ------------------------------------------------------------------ */

const ONSEN = {
  yunoya:   { bg: 0x2c3a52, fg: '#f0e4c8', bar: '#1a2334', t: '湯乃屋', s: 'ゆのや', en: 'YUNOYA' },
  hourai:   { bg: 0x25506b, fg: '#f2ece0', bar: '#173648', t: '蓬莱湯', s: 'ほうらいゆ', en: 'PUBLIC BATH' },
  sakuraan: { bg: 0xf0e3cc, fg: '#8a4a62', bar: '#c9a98c', t: 'さくら庵', s: 'かんみどころ', en: 'WAGASHI' },
  yunoka:   { bg: 0x6b4632, fg: '#f4e6c8', bar: '#4a2f21', t: 'ゆのか', s: 'じゅんきっさ', en: 'COFFEE' },
  kokeshi:  { bg: 0xb5322f, fg: '#f8ecd8', bar: '#82211f', t: 'こけし堂', s: 'みやげもの', en: 'SOUVENIR' },
};

/** The painted board over an onsen-street frontage. */
export const onsenFascia = (kind = 'yunoya') =>
  cached('onsenFascia' + kind, () =>
    make(1024, 220, (c, w, h) => {
      const st = ONSEN[kind] ?? ONSEN.yunoya;
      c.fillStyle = col(st.bg);
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 9, st.bar);
      rule(c, 0, h - 13, w, 13, st.bar);
      // the thin inset line an old painted board always has inside its frame
      c.globalAlpha = 0.35;
      rule(c, 22, 22, w - 44, 3, st.fg);
      rule(c, 22, h - 27, w - 44, 3, st.fg);
      c.globalAlpha = 1;
      centered(c, st.t, w * 0.38, h * 0.5, w * 0.52, 118, st.fg, 'bold', 14);
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillStyle = st.fg;
      c.globalAlpha = 0.7;
      c.font = `600 32px ${JP_FONT}`;
      c.fillText(st.s, w * 0.72, h * 0.38);
      c.globalAlpha = 0.45;
      c.font = `500 25px ${JP_FONT}`;
      c.fillText(st.en, w * 0.72, h * 0.68);
      c.globalAlpha = 1;
    })
  );

/**
 * The vertical wooden signboard bolted flat to a pier.
 *
 * Drawn as bare timber with the characters cut into it rather than as a
 * painted plate: at this size the grain is two tones and half a dozen strokes,
 * and that is the whole difference between "old shop" and "new sign".
 */
export const onsenBlade = (kind = 'yunoya') =>
  cached('onsenBlade' + kind, () =>
    make(192, 768, (c, w, h) => {
      const st = ONSEN[kind] ?? ONSEN.yunoya;
      c.fillStyle = '#c8a878';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(122,92,60,0.30)';
      c.lineWidth = 3;
      for (let i = 0; i < 7; i++) {
        const x = 16 + i * 26;
        c.beginPath();
        c.moveTo(x, 0);
        c.bezierCurveTo(x + 9, h * 0.3, x - 9, h * 0.66, x + 4, h);
        c.stroke();
      }
      rule(c, 0, 0, w, 14, '#8a6a44');
      rule(c, 0, h - 14, w, 14, '#8a6a44');
      vertical(c, [...st.t].slice(0, 4).join(''), w / 2, 132, 128, 104, '#3a2a20');
    })
  );

/** Cloth noren for the onsen street: the two bath doorways and the shops. */
export const onsenNoren = (kind = 'male') =>
  cached('onsenNoren' + kind, () =>
    make(512, 256, (c, w, h) => {
      const sets = {
        male:   { bg: 0x24425e, fg: '#f2ece0', t: '男湯' },
        female: { bg: 0xa33a4c, fg: '#f8ece4', t: '女湯' },
        yunoya: { bg: 0x2c3a52, fg: '#f0e4c8', t: '湯乃屋' },
        kanmi:  { bg: 0xefe2c8, fg: '#8a4a62', t: '甘味' },
        kissa:  { bg: 0x6b4632, fg: '#f4e6c8', t: '珈琲' },
      };
      const st = sets[kind] ?? sets.male;
      c.fillStyle = col(st.bg);
      c.fillRect(0, 0, w, h);
      /* A noren is split into three hanging panels and the slits go through
       * whatever is printed on it, so a two- or three-character name is set
       * one glyph to a panel.  A glyph straddling a slit just reads as
       * broken marks -- the same trap `norenTex` documents. */
      const chars = [...st.t];
      if (chars.length === 2) {
        centered(c, chars[0], w * 0.165, h * 0.46, w / 3 - 26, 116, st.fg);
        centered(c, chars[1], w * 0.835, h * 0.46, w / 3 - 26, 116, st.fg);
      } else if (chars.length === 3) {
        chars.forEach((ch, i) => centered(c, ch, w * (0.165 + i * 0.335), h * 0.46, w / 3 - 26, 104, st.fg));
      } else {
        centered(c, st.t, w / 2, h * 0.46, w - 90, 112, st.fg, 'bold', 8);
      }
      c.globalCompositeOperation = 'destination-out';
      for (const x of [w * 0.33, w * 0.66]) c.fillRect(x - 4, h * 0.26, 8, h);
      c.globalCompositeOperation = 'source-over';
    })
  );

/**
 * 蓬莱湯's mountain board.
 *
 * The other bathhouse in this world has one too, and that is the point: it is
 * the fixture the building type is known by. This one is deliberately a
 * different painting -- dawn rather than noon, open water in front instead of
 * a shoreline, the cone off to the west rather than the east -- so the two
 * read as two pictures of the same mountain and not as one asset used twice.
 */
export const houraiFuji = () =>
  cached('houraiFuji', () =>
    make(1024, 340, (c, w, h) => {
      const HZ = h * 0.70;
      const px = w * 0.36, py = h * 0.10;
      const half = w * 0.30;
      const poly = (pts, fill) => {
        c.fillStyle = fill;
        c.beginPath();
        pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.closePath();
        c.fill();
      };
      // a dawn sky: two flat bands, warm over cool
      c.fillStyle = '#f6dcc8';
      c.fillRect(0, 0, w, h * 0.42);
      c.fillStyle = '#e3ccd2';
      c.fillRect(0, h * 0.42, w, HZ - h * 0.42);
      poly([[px - half, HZ], [px, py], [px + half, HZ]], '#7b7ba0');
      poly([[px, py], [px - half, HZ], [px - half * 0.2, HZ]], '#5d5c85');
      /* Snow. Every notch stays inside the cone: the half width at height y is
       * half*(y-py)/(HZ-py), which at the lowest notch here is 0.15 w. */
      poly([
        [px, py],
        [px + w * 0.100, h * 0.40], [px + w * 0.062, h * 0.33],
        [px + w * 0.024, h * 0.39], [px - w * 0.018, h * 0.325],
        [px - w * 0.056, h * 0.395], [px - w * 0.096, h * 0.34],
      ], '#fbf4f2');
      rule(c, 0, HZ, w, h - HZ, '#5f7fa4');
      poly([[px - half * 0.62, HZ], [px, h * 0.94], [px + half * 0.62, HZ]], '#6f8db0');
      rule(c, 0, HZ, w, 5, '#eddfe0');
      for (let i = 0; i < 4; i++) rule(c, w * (0.05 + i * 0.23), HZ + 26 + i * 16, w * 0.11, 5, '#8fa8c4');
      centered(c, '蓬莱湯', w * 0.795, h * 0.34, w * 0.30, 100, '#20364f', 'bold', 10);
      c.font = `600 30px ${JP_FONT}`;
      c.fillStyle = '#456484';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('ほ う ら い ゆ', w * 0.795, h * 0.56);
    })
  );

/** The free-footbath notice: what it is, that it is free, and when it runs. */
export const ashiyuPlate = () =>
  cached('ashiyuPlate', () =>
    make(384, 512, (c, w, h) => {
      c.fillStyle = '#efe6d2';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#8a6a44';
      c.lineWidth = 14;
      c.strokeRect(7, 7, w - 14, h - 14);
      centered(c, '足湯', w / 2, 96, w - 90, 96, '#25506b', 'bold', 12);
      rule(c, 54, 152, w - 108, 4, '#b9a988');
      centered(c, 'ご自由にどうぞ', w / 2, 204, w - 70, 44, '#4a4050');
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.font = `500 30px ${JP_FONT}`;
      c.fillStyle = '#5a5262';
      ['りようじかん', '六時 — 二十二時', '湯温 四十一度'].forEach((s, i) => {
        c.fillText(s, 52, 282 + i * 52);
      });
      c.globalAlpha = 0.5;
      centered(c, '湯の坂町内会', w / 2, h - 58, w - 90, 28, '#6a6070', '500');
      c.globalAlpha = 1;
    })
  );

/**
 * What you see through a ryokan's ground-floor glass: tatami, a shoji screen,
 * a low table and the warm edge of a lamp.  Painted, not built -- the room is
 * only ever read at a glance from across a five-metre street, and the brief
 * for this district asks for the outline of a room rather than a room.
 */
export const tatamiRoom = (variant = 0) =>
  cached('tatamiRoom' + variant, () =>
    make(512, 320, (c, w, h) => {
      const FLOOR = h * 0.62;
      c.fillStyle = variant === 1 ? '#c9b489' : '#cbbc93';
      c.fillRect(0, 0, w, h);
      // the shoji grid on the back wall
      c.fillStyle = '#e8dcc0';
      c.fillRect(w * 0.08, h * 0.06, w * 0.84, FLOOR - h * 0.06);
      c.fillStyle = '#a08d68';
      for (let i = 0; i <= 6; i++) c.fillRect(w * 0.08 + (i * w * 0.84) / 6 - 3, h * 0.06, 6, FLOOR - h * 0.06);
      for (let i = 0; i <= 4; i++) c.fillRect(w * 0.08, h * 0.06 + (i * (FLOOR - h * 0.06)) / 4 - 3, w * 0.84, 6);
      // tatami: four mats with the dark border between them
      c.fillStyle = '#b6b184';
      c.fillRect(0, FLOOR, w, h - FLOOR);
      c.fillStyle = '#a8a377';
      for (let i = 0; i < 4; i++) c.fillRect(i * (w / 4) + 5, FLOOR + 6, w / 4 - 10, h - FLOOR - 12);
      c.fillStyle = '#5b5340';
      for (let i = 1; i < 4; i++) c.fillRect(i * (w / 4) - 3, FLOOR, 6, h - FLOOR);
      c.fillRect(0, FLOOR - 4, w, 7);
      // the low table, its legs, and a cushion either side
      c.fillStyle = '#6b4a33';
      c.fillRect(w * 0.30, FLOOR + 26, w * 0.40, 26);
      c.fillStyle = '#54382a';
      c.fillRect(w * 0.33, FLOOR + 52, 14, 34);
      c.fillRect(w * 0.65, FLOOR + 52, 14, 34);
      c.fillStyle = variant === 1 ? '#8a6a7a' : '#4f6b70';
      c.fillRect(w * 0.19, FLOOR + 44, 62, 24);
      c.fillRect(w * 0.72, FLOOR + 44, 62, 24);
      // the lamp and its bloom, which is the whole point of the plate
      const lx = variant === 1 ? w * 0.16 : w * 0.84;
      const gr = c.createRadialGradient(lx, h * 0.34, 8, lx, h * 0.34, 150);
      gr.addColorStop(0, 'rgba(255,226,170,0.95)');
      gr.addColorStop(1, 'rgba(255,226,170,0)');
      c.fillStyle = gr;
      c.fillRect(lx - 150, h * 0.34 - 150, 300, 300);
      c.fillStyle = '#f6dfae';
      c.fillRect(lx - 26, h * 0.30, 52, 60);
      c.fillStyle = '#3f3a44';
      c.fillRect(lx - 30, h * 0.30 - 10, 60, 12);
    })
  );

/** Lantern paper for the onsen street: 湯, and the street's own name. */
export const onsenLanternTex = (variant = 0) =>
  cached('onsenLantern' + variant, () =>
    make(256, 256, (c, w, h) => {
      c.fillStyle = variant === 1 ? '#f6e6c6' : '#faf0dc';
      c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(176,152,112,0.45)';
      for (let i = 0; i < 9; i++) c.fillRect(0, 12 + i * 28, w, 3);
      const t = ['湯', '湯の坂', '蓬莱湯'][variant % 3];
      centered(c, t, w / 2, h / 2, w - 66, t.length === 1 ? 150 : 90,
        variant === 1 ? '#2c3a52' : '#b5322f', 'bold', 6);
    })
  );

/** The street's guide board, at the head of the steps up from the shrine. */
export const yunosakaBoard = () =>
  cached('yunosakaBoard', () =>
    make(640, 400, (c, w, h) => {
      c.fillStyle = '#e8dcc2';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#7a6144';
      c.lineWidth = 12;
      c.strokeRect(6, 6, w - 12, h - 12);
      centered(c, '湯の坂', w / 2, 74, w - 140, 76, '#2c3a52', 'bold', 14);
      c.font = `600 26px ${JP_FONT}`;
      c.fillStyle = '#6a5f70';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('ゆ の さ か', w / 2, 122);
      rule(c, 70, 150, w - 140, 3, '#b9a988');
      // a schematic of the street: the run of it, the channel across it, and
      // the frontages as blocks either side
      rule(c, 80, 246, w - 160, 12, '#b3aec0');
      rule(c, 300, 176, 10, 152, '#8fb6cc');
      c.fillStyle = '#8d8598';
      for (const [x, wd, up] of [[96, 96, 1], [212, 62, 1], [330, 78, 1],
        [120, 74, 0], [230, 58, 0], [336, 70, 0], [426, 62, 0]]) {
        c.fillRect(x, up ? 196 : 264, wd, 42);
      }
      c.font = `600 22px ${JP_FONT}`;
      c.fillStyle = '#4a4050';
      c.fillText('現在地', 500, 302);
      c.fillStyle = '#b5322f';
      c.beginPath();
      c.arc(500, 264, 11, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 0.55;
      centered(c, '足元にご注意ください', w / 2, h - 44, w - 120, 26, '#6a6070', '500');
      c.globalAlpha = 1;
    })
  );

/* ------------------------------------------------------------------ *
 * The neighbourhood services.
 *
 * A clinic, a chemist, a laundry and a letting agent, plus the community
 * hall and the street furniture that comes with a block of housing.  The
 * four interiors here are all 512 x 256 -- shorter than `shopInterior`'s
 * 320, because these sit behind wide low windows rather than a full-height
 * shopfront -- and all four are drawn *dark* with a violet wash over the
 * top.  That wash is the whole reason the glass in front reads as glass:
 * an interior painted at street brightness makes the pane vanish and the
 * building end up looking like a hole.  Nobody is in any of them; a waiting
 * room at four in the afternoon is empty, which is the point.
 * ------------------------------------------------------------------ */

/** 内科's waiting room: benches, the reception hatch, one plant. */
export const clinicInterior = () =>
  cached('clinicInterior', () =>
    make(512, 256, (c, w, h) => {
      c.fillStyle = '#d4dadc';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 28, 0xe2e8e6);
      for (const x of [56, 292]) rule(c, x, 7, 132, 12, 0xf4f8ec);   // two battens, lit
      rule(c, 0, h - 52, w, 52, 0xbbbab0);                            // floor
      rule(c, 0, h - 56, w, 7, 0xa6a59c);                             // and its skirting line
      /* The hatch is what makes a room a surgery rather than an office: a
       * counter with a glazed panel slid half back, so half the opening is a
       * pane and half is the dark of the room behind. */
      rule(c, 314, 42, 184, 112, 0xb7bdba);
      rule(c, 322, 50, 168, 80, 0x7c878a);                            // the opening
      rule(c, 322, 50, 84, 80, 0xd6dcda);                             // the pane still across it
      rule(c, 404, 50, 5, 80, 0x5d686a);                              // its stile
      rule(c, 308, 148, 194, 18, 0xa6a89e);                           // the counter top
      rule(c, 308, 166, 194, 40, 0x8d8f88);
      // the bench run: one back, four pads, one continuous seat
      rule(c, 22, 130, 250, 34, 0x989ea0);
      for (let i = 0; i < 4; i++) rule(c, 28 + i * 62, 136, 52, 24, 0x6d8994);
      rule(c, 18, 164, 258, 16, 0x8d9396);
      for (let i = 0; i < 4; i++) rule(c, 24 + i * 80, 180, 8, 22, 0x74767c);
      // the clock, and a framed notice beside it
      c.fillStyle = '#eaeeeb';
      c.beginPath();
      c.arc(206, 66, 26, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#5d6468';
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(206, 66);
      c.lineTo(206, 48);
      c.moveTo(206, 66);
      c.lineTo(220, 72);
      c.stroke();
      rule(c, 38, 44, 108, 66, 0xcdd2ca);
      rule(c, 46, 52, 92, 50, 0xe6eae2);
      c.fillStyle = 'rgba(94,100,106,0.35)';
      for (let i = 0; i < 4; i++) c.fillRect(54, 60 + i * 11, 76 - (i % 2) * 24, 4);
      /* One plant, in the gap where the bench runs out and the counter starts.
       * Five leaves drawn as lenses rather than three thin triangles: a blade
       * three pixels across at the base renders as a hair, and this plant is
       * the only thing breaking the horizontal those two make where they
       * meet. */
      rule(c, 278, 190, 30, 32, 0xa8846a);
      rule(c, 275, 187, 36, 8, 0x94745e);                             // the pot rim
      c.fillStyle = '#4d7860';
      for (const [tx, ty] of [[261, 152], [275, 134], [293, 127], [312, 136], [325, 154]]) {
        const mx = (293 + tx) / 2, my = (192 + ty) / 2;
        c.beginPath();
        c.moveTo(293, 192);
        c.quadraticCurveTo(mx - 9, my - 3, tx, ty);
        c.quadraticCurveTo(mx + 9, my + 3, 293, 192);
        c.closePath();
        c.fill();
      }
      c.fillStyle = 'rgba(112,108,136,0.20)';
      c.fillRect(0, 0, w, h);
    })
  );

/** くすり's stock wall: boxes in tiers, the dispensing counter, the scale. */
export const yakkyokuInterior = () =>
  cached('yakkyokuInterior', () =>
    make(512, 256, (c, w, h) => {
      /* Held a good two stops darker than a shop fascia.  The first draft of
       * this plate was a pale ground with pale cartons on it and read as a lit
       * panel rather than as a room -- with nothing dark in the picture the
       * pane in front of it stops existing. */
      c.fillStyle = '#c6bda8';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 28, 0xd6cdb6);
      for (const x of [40, 254]) rule(c, x, 7, 152, 12, 0xf4e8c8);
      rule(c, 0, h - 50, w, 50, 0x9e9580);
      /* Boxed goods in tiers, and that is the shop: a chemist's window is a
       * wall of small identical cartons, so the read is the *grid* and the
       * printed band across each one, not any single box. */
      const boxes = ['#cdc3a8', '#b6bfc4', '#cec1b8', '#c0c4ae', '#c6b9a2'];
      for (let r = 0; r < 4; r++) {
        const y = 40 + r * 40;
        rule(c, 14, y + 34, 306, 8, 0x827868);        // the shelf board under each tier
        for (let i = 0; i < 8; i++) {
          rule(c, 20 + i * 38, y, 32, 34, boxes[(i + r) % boxes.length]);
          c.fillStyle = 'rgba(66,62,58,0.30)';
          c.fillRect(24 + i * 38, y + 6, 24, 5);
          c.fillRect(24 + i * 38, y + 22, 15, 4);
        }
      }
      // the dispensing counter
      rule(c, 336, 156, 166, 18, 0xa78e6c);
      rule(c, 336, 174, 166, 32, 0x846e4d);
      // the scale: a base, a column, a shallow pan and the dial on its side
      rule(c, 356, 142, 44, 14, 0x9aa0a4);
      rule(c, 374, 116, 8, 26, 0xb0b6ba);
      rule(c, 350, 108, 56, 8, 0xc4cacc);
      c.fillStyle = '#eef2f0';
      c.beginPath();
      c.arc(412, 128, 17, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#6a6f74';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(412, 128);
      c.lineTo(419, 116);
      c.stroke();
      // the queue-number stand, propped on the far end of the counter
      rule(c, 462, 122, 7, 34, 0x8f8a9c);
      rule(c, 444, 98, 44, 26, 0xf0ece0);
      centered(c, '３２', 466, 111, 36, 22, '#4b4757', 'bold');
      c.fillStyle = 'rgba(110,106,134,0.20)';
      c.fillRect(0, 0, w, h);
    })
  );

/** コインランドリー: four drums, the coin strip, a table and a left basket. */
export const laundryInterior = () =>
  cached('laundryInterior', () =>
    make(512, 256, (c, w, h) => {
      c.fillStyle = '#c9d1d4';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 26, 0xdfe6e8);
      rule(c, 108, 6, 300, 12, 0xfff8e6);              // one batten, the whole light in here
      rule(c, 0, h - 48, w, 48, 0xb0b4b2);             // floor
      for (let i = 1; i < 4; i++) rule(c, i * 128, h - 48, 3, 48, 0x9ea2a2);  // its tile joints
      /* The coin strip runs across the top of the row rather than one slot per
       * machine: it is the thing that says these are not somebody's washers. */
      rule(c, 20, 34, 412, 14, 0xa4acb0);
      c.fillStyle = '#6c757a';
      for (let i = 0; i < 12; i++) c.fillRect(30 + i * 34, 38, 14, 6);
      // four drums: a square front, a control band, a ring and the glass in it
      for (let i = 0; i < 4; i++) {
        const x = 24 + i * 104;
        rule(c, x, 52, 96, 100, 0xdbe2e4);
        rule(c, x, 52, 96, 14, 0xbec6c8);
        c.fillStyle = '#6c757a';
        c.fillRect(x + 66, 56, 20, 6);
        c.fillStyle = '#98a2a6';
        c.beginPath();
        c.arc(x + 48, 104, 34, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#7a878c';
        c.beginPath();
        c.arc(x + 48, 104, 26, 0, Math.PI * 2);
        c.fill();
      }
      // the folding table, standing in front of the row
      rule(c, 52, 172, 348, 14, 0xc2bdad);
      rule(c, 52, 186, 348, 8, 0xa6a293);
      rule(c, 74, 194, 10, 34, 0x9a958a);
      rule(c, 368, 194, 10, 34, 0x9a958a);
      // and the basket somebody has left on it
      rule(c, 288, 142, 78, 30, PAL.basket);
      rule(c, 284, 138, 86, 8, 0xc44e40);
      c.fillStyle = 'rgba(70,60,58,0.22)';
      for (let i = 0; i < 4; i++) c.fillRect(294 + i * 19, 150, 6, 20);
      c.fillStyle = 'rgba(108,106,138,0.20)';
      c.fillRect(0, 0, w, h);
    })
  );

/**
 * 不動産's window, which is the shop.
 *
 * A dozen property cards clipped to rails across the glass, each one a plan
 * diagram, two rules of particulars and a price mark.  No photographs of
 * rooms: a printed interior shot pasted into a hand-painted street is the same
 * mistake as an untouched PBR asset, and a plan drawing is what the near half
 * of one of these cards actually is anyway.
 */
export const fudosanInterior = () =>
  cached('fudosanInterior', () =>
    make(512, 256, (c, w, h) => {
      c.fillStyle = '#4a4e5a';                          // the unlit office behind the cards
      c.fillRect(0, 0, w, h);
      const grounds = ['#f0ece0', '#e8e8de', '#eee6d8'];
      for (let r = 0; r < 3; r++) {
        const y = 20 + r * 76;
        rule(c, 0, y - 6, w, 4, 0x6f7482);              // the rail this row hangs off
        for (let i = 0; i < 4; i++) {
          const x = 20 + i * 120;
          rule(c, x, y, 106, 68, grounds[(i + r) % grounds.length]);
          rule(c, x + 48, y - 6, 8, 8, 0x9aa0ac);       // its clip
          /* The plan has to be a good deal darker than the card it is printed
           * on: at 40 px square, a diagram one step off its ground reads as two
           * stray lines and the room disappears. */
          rule(c, x + 6, y + 8, 40, 40, 0xb2ab99);
          rule(c, x + 6 + ((i + r) % 2 ? 22 : 16), y + 8, 4, 40, 0x615d52);
          rule(c, x + 6, y + 8 + ((i + r) % 3) * 8 + 16, 40, 4, 0x615d52);
          rule(c, x + 6, y + 40, 9, 8, grounds[(i + r) % grounds.length]);
          // two rules of particulars, then the price
          rule(c, x + 54, y + 12, 44 - (i % 2) * 10, 5, 0x8a8696);
          rule(c, x + 54, y + 24, 34 - (r % 2) * 8, 5, 0xa8a4b0);
          rule(c, x + 54, y + 42, 46, 15, PAL.redDeep);
          rule(c, x + 58, y + 46, 30 - (i % 3) * 6, 7, 0xf0e2d8);
        }
      }
      c.fillStyle = 'rgba(116,112,142,0.18)';
      c.fillRect(0, 0, w, h);
    })
  );

/** The name board over the 町内会館 door. */
export const hallPlate = () =>
  cached('hallPlate', () =>
    make(512, 152, (c, w, h) => {
      c.fillStyle = '#f4f2ea';
      c.fillRect(0, 0, w, h);
      rule(c, 0, h - 13, w, 13, PAL.tealDeep);
      centered(c, 'ひばり台町内会館', w / 2, h * 0.38, w - 70, 66, '#2f5b52', 'bold', 6);
      /* The romanisation is centred under the name rather than set beside it
       * the way `blockPlate` does: three words is twice the run 'HIBARIDAI
       * CORP' takes, and alongside the name it goes off the end of the plate. */
      centered(c, 'HIBARIDAI  COMMUNITY  HALL', w / 2, h * 0.76, w - 130, 24, '#8a8b82', '600', 2);
    })
  );

/**
 * The sheets in the 町内会館's case.
 *
 * Set as a real 回覧 notice is: an お知らせ band, the subject on its own line,
 * the date, what to bring, and the association's stamp bottom right.  The
 * subject is split off from its ...のお知らせ on purpose -- at 256 px wide a
 * nine-character heading fits at 24 px and reads as body text, so the phrase
 * goes in the band above it and the four characters that matter go large.
 */
export const hallNotice = (variant = 0) =>
  cached('hallNotice' + variant, () =>
    make(256, 352, (c, w, h) => {
      const sets = [
        { bar: PAL.leafDeep, t: '町内清掃', d: '四月十四日  朝八時',
          l: ['一丁目 ・ 二丁目', '軍手を おもちください'] },
        { bar: PAL.redDeep, t: '防災訓練', d: '六月一日  朝九時',
          l: ['公園に あつまって', 'ください'] },
        { bar: PAL.blue, t: '回覧板', d: '五月ぶん',
          l: ['よんだら となりへ', 'まわしてください'] },
      ];
      const st = sets[variant % sets.length];
      c.fillStyle = '#fbfaf4';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 34, st.bar);
      centered(c, 'お知らせ', w / 2, 17, w - 90, 24, '#fbfaf4', '600', 4);
      centered(c, st.t, w / 2, 92, w - 44, 58, col(st.bar), 'bold', 6);
      c.globalAlpha = 0.45;
      rule(c, 30, 130, w - 60, 3, '#9a94a6');
      c.globalAlpha = 1;
      centered(c, st.d, w / 2, 162, w - 44, 26, '#4b4757', '600', 1);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      st.l.forEach((t, i) => {
        c.font = `500 21px ${JP_FONT}`;
        c.fillStyle = '#6a6577';
        c.fillText(t, w / 2, 208 + i * 34);
      });
      // the stamp: a red square with the association's name cut down it
      c.strokeStyle = col(PAL.redDeep);
      c.lineWidth = 4;
      c.strokeRect(166, 262, 66, 66);
      vertical(c, '町内会', 199, 280, 22, 17, col(PAL.redDeep));
      c.globalAlpha = 0.6;
      c.font = `500 18px ${JP_FONT}`;
      c.fillStyle = '#8a8696';
      c.textAlign = 'left';
      c.fillText('ひばり台', 30, 282);
      c.fillText('町内会長', 30, 306);
      c.globalAlpha = 1;
    })
  );

/** The hours plate screwed up beside the clinic door. */
export const clinicHours = () =>
  cached('clinicHours', () =>
    make(384, 288, (c, w, h) => {
      c.fillStyle = '#fbfaf6';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 22, PAL.blue);
      centered(c, '診療時間', w / 2, 74, w - 50, 58, '#23508f', 'bold', 6);
      c.globalAlpha = 0.4;
      rule(c, 36, 112, w - 72, 3, '#9aa3b4');
      c.globalAlpha = 1;
      // 休診 in the warm accent, the way `libraryHours` marks its closed day:
      // it is the only row anybody walks up to the door to read.
      const rows = [['午前', '9:00 - 12:30'], ['午後', '15:00 - 18:00'], ['休診', '木 ・ 日祝']];
      c.textBaseline = 'middle';
      rows.forEach(([a, b], i) => {
        c.font = `600 30px ${JP_FONT}`;
        c.fillStyle = i === 2 ? '#a3531c' : '#4b4757';
        c.textAlign = 'left';
        c.fillText(a, 34, 152 + i * 52);
        c.textAlign = 'right';
        c.fillText(b, w - 34, 152 + i * 52);
      });
    })
  );

/** The plate on a delivery locker bank. */
export const lockerPlate = () =>
  cached('lockerPlate', () =>
    make(384, 192, (c, w, h) => {
      c.fillStyle = '#f4f2ea';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 16, PAL.tealDeep);
      centered(c, '宅配ロッカー', w / 2, 46, w - 60, 44, '#2f5b52', 'bold', 5);
      /* Eight doors in two tiers, which is what the bank underneath actually
       * has -- the diagram is a key to it, so the counts have to agree or it is
       * decoration.  Drawn as large as the plate allows: the first pass put 14 px
       * numerals in 44 px doors, and a numeral that cannot be resolved is not a
       * key to anything either. */
      for (let r = 0; r < 2; r++) {
        for (let i = 0; i < 4; i++) {
          const x = 84 + i * 58, y = 76 + r * 32;
          rule(c, x, y, 54, 30, 0xdcdad2);
          rule(c, x, y, 54, 4, 0xb4b2aa);
          c.font = `600 18px ${JP_FONT}`;
          c.fillStyle = '#5f5a6c';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(String(r * 4 + i + 1), x + 27, y + 17);
        }
      }
      centered(c, '暗証番号は 控えをごらんください', w / 2, 166, w - 40, 24, '#8a8b82', '600');
    })
  );

/**
 * The lane name plates, clamped to a post at a junction.
 *
 * Built to `alleyPlate`'s layout down to the 14 px rule at the bottom, because
 * it goes on the same 1.1 x 0.28 m plate: at that aspect a taller canvas
 * renders as a vertical smear rather than as type.  The rule colour is what
 * varies -- a district hangs the same plate everywhere and paints the band by
 * the ward that maintains it.
 */
export const laneNamePlate = (variant = 0) =>
  cached('laneNamePlate' + variant, () =>
    make(512, 128, (c, w, h) => {
      const sets = [
        ['ひばり台一丁目', PAL.blue],
        ['ひばり台二丁目', PAL.teal],
        ['ひばり台四丁目', PAL.purple],
        ['桜守裏通り', PAL.blossomDeep],
        ['通学路', PAL.yellowDeep],
        ['公園通り', PAL.leafDeep],
        // appended, never reordered: `variant:` on a `laneSign` is an index
        ['川端の道', PAL.blue],
        ['ひばり台六丁目', PAL.orange],
        ['六丁目 北の道', PAL.leafDeep],
        // appended with ひばり台七丁目 and スーパー さかえ
        ['ひばり台七丁目', PAL.leafDeep],
        ['七丁目通り', PAL.teal],
        ['さかえ 裏通り', PAL.trim],
      ];
      const [name, bar] = sets[variant % sets.length];
      c.fillStyle = '#fbfaf6';
      c.fillRect(0, 0, w, h);
      rule(c, 0, h - 14, w, 14, bar);
      centered(c, name, w / 2, h * 0.45, w - 60, 72, '#4a4657', 'bold', 6);
    })
  );

/**
 * The numbered plate clipped to a wheel stop in a small parking area.
 *
 * Drawn at 3:2 because `makeWheelStops` puts it on a 0.18 x 0.12 m face, and a
 * decal whose aspect does not match the face it lands on renders as a smear
 * rather than as an error -- the `alleyPlate` trap.  It is also the smallest
 * piece of signage in the world, so only the numeral survives at three metres:
 * hence a numeral two thirds of the height and a word that is barely there.
 */
export const bayNumber = (n = 1) =>
  cached('bayNumber' + n, () =>
    make(192, 128, (c, w, h) => {
      c.fillStyle = '#f7f4ec';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 10, PAL.blueDeep);
      c.strokeStyle = '#b4aec0';
      c.lineWidth = 4;
      c.strokeRect(6, 6, w - 12, h - 12);
      centered(c, String(n), w * 0.38, h * 0.54, w * 0.42, 82, '#3b3846');
      c.save();
      c.font = `600 30px ${JP_FONT}`;
      c.fillStyle = '#7a7588';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText('番', w * 0.60, h * 0.44);
      c.font = `500 20px ${JP_FONT}`;
      c.fillText('月極', w * 0.60, h * 0.74);
      c.restore();
    })
  );

/* ================================================================== *
 * ひばり台七丁目 -- スーパー さかえ and its roof car park.
 *
 * A local supermarket is the one building in a Japanese suburb whose whole
 * elevation is *print*: the fascia, the hours, the banner over the doors, the
 * price sheets taped inside the glass and the A-board on the pavement.  So the
 * district needs more new art than any other has, and all of it is appended --
 * every `variant:` already standing in the world is a bare index.
 *
 * Two rules held throughout.  **Nobody is on any of it**, which for a
 * supermarket means the produce posters are produce and the parking guide is a
 * diagram.  And the ground is always near-white with one saturated bar: this
 * building is twice the footprint of anything else in the district, and if its
 * signage were as loud as its mass it would be the only thing in every frame it
 * appears in.
 * ================================================================== */

/**
 * The main fascia over the entrance.  It lands on a 6.4 x 0.8 m band, so it is
 * drawn at 8:1 -- an aspect check rather than a guess: `alleyPlate` was
 * 512 x 128 on a 0.24 x 1.5 m face and rendered as an unreadable smear.
 */
export const superFascia = () =>
  cached('superFascia', () =>
    make(2048, 256, (c, w, h) => {
      c.fillStyle = '#fbf9f2';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 14, PAL.leafDeep);
      rule(c, 0, h - 20, w, 20, PAL.leafDeep);
      // the mark: three stacked bars, the way a co-op fascia carries one
      c.fillStyle = hex(PAL.leafDeep);
      for (let i = 0; i < 3; i++) c.fillRect(74, 78 + i * 34, 96 - i * 22, 22);
      centered(c, 'スーパー さかえ', 700, h * 0.48, 800, 132, '#2f6b45', 'bold', 8);
      c.globalAlpha = 0.75;
      centered(c, '生鮮食品 ・ 惣菜 ・ 日用品', 1500, h * 0.36, 520, 44, '#4b4757', '600', 3);
      c.globalAlpha = 0.55;
      centered(c, 'SAKAE  FOOD  MARKET', 1500, h * 0.68, 500, 34, '#7a7588', '600', 4);
      c.globalAlpha = 1;
    })
  );

/** The lit box sign on the corner pier -- the same mark, drawn square. */
export const superBoxSign = () =>
  cached('superBoxSign', () =>
    make(512, 512, (c, w, h) => {
      c.fillStyle = '#fcfaf4';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 26, PAL.leafDeep);
      rule(c, 0, h - 26, w, 26, PAL.leafDeep);
      c.fillStyle = hex(PAL.leafDeep);
      for (let i = 0; i < 3; i++) c.fillRect(w / 2 - 78 + i * 26, 96 + i * 44, 156 - i * 52, 30);
      centered(c, 'さかえ', w / 2, 320, w - 90, 116, '#2f6b45', 'bold', 8);
      centered(c, 'SAKAE', w / 2, 428, w - 160, 40, '#8a8598', '600', 6);
    })
  );

/** 営業時間 -- the hours plate beside the doors. */
export const superHours = () =>
  cached('superHours', () =>
    make(384, 512, (c, w, h) => {
      c.fillStyle = '#fbfaf6';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 76, PAL.leafDeep);
      centered(c, '営業時間', w / 2, 38, w - 60, 46, '#fdf8f0', 'bold', 4);
      centered(c, '９:００', w / 2, 168, w - 90, 96, '#3b3846');
      centered(c, '｜', w / 2, 238, w - 90, 40, '#a8a2b4');
      centered(c, '２１:００', w / 2, 308, w - 90, 96, '#3b3846');
      c.globalAlpha = 0.4;
      rule(c, 40, 366, w - 80, 3, '#9a94a6');
      c.globalAlpha = 1;
      centered(c, '年中無休', w / 2, 406, w - 90, 40, '#4b4757', '600', 3);
      centered(c, '屋上駐車場 ２時間無料', w / 2, 464, w - 40, 28, hex(PAL.tealDeep), '600');
    })
  );

/**
 * The banners strung under the canopy.  Wide cloth, one line each, and the
 * words are the ordinary week of a supermarket rather than a closing-down
 * sale: a shop that is always having a sale is a shop that has closed down.
 */
export const superBanner = (variant = 0) =>
  cached('superBanner' + variant, () =>
    make(1024, 192, (c, w, h) => {
      const sets = [
        { bg: '#e8534a', fg: '#fdf6ec', t: '本日 特価 市' },
        { bg: '#f0c341', fg: '#5a4416', t: 'あさどれ 野菜 入荷' },
        { bg: '#2f9c9a', fg: '#f4fbfa', t: 'ポイント ２倍 デー' },
        { bg: '#f2ede0', fg: '#8a5a20', t: '毎週 火曜  たまごの日' },
      ];
      const st = sets[variant % sets.length];
      c.fillStyle = st.bg;
      c.fillRect(0, 0, w, h);
      c.globalAlpha = 0.35;
      c.fillStyle = st.fg;
      c.fillRect(0, 16, w, 4);
      c.fillRect(0, h - 20, w, 4);
      c.globalAlpha = 1;
      centered(c, st.t, w / 2, h * 0.52, w - 120, 104, st.fg, 'bold', 8);
    })
  );

/**
 * The price sheets taped up inside the glass.  A-portrait, so 1:1.41, and
 * deliberately illegible past four metres -- what has to read at distance is
 * the block of colour and the one big numeral, which is all a real one reads
 * as anyway.
 */
export const superPoster = (variant = 0) =>
  cached('superPoster' + variant, () =>
    make(362, 512, (c, w, h) => {
      const sets = [
        { bar: '#e8534a', head: '特価', n: '１９８', unit: '円', foot: '国産 とりもも肉  １００ｇ' },
        { bar: '#3f7f60', head: '朝どれ', n: '１２８', unit: '円', foot: 'きゅうり  ３本入' },
        { bar: '#3d6ec4', head: 'お買得', n: '２９８', unit: '円', foot: 'たまご  １０コ入' },
        { bar: '#ef8a3c', head: '半額', n: '１５０', unit: '円', foot: 'そうざい  １８時から' },
      ];
      const st = sets[variant % sets.length];
      c.fillStyle = '#fdfbf5';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 96, st.bar);
      centered(c, st.head, w / 2, 48, w - 50, 64, '#fdf8f0', 'bold', 6);
      centered(c, st.n, w * 0.44, 250, w * 0.70, 168, st.bar);
      c.font = `bold 58px ${JP_FONT}`;
      c.fillStyle = st.bar;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(st.unit, w * 0.80, 286);
      c.globalAlpha = 0.35;
      rule(c, 34, 360, w - 68, 3, '#8a8598');
      c.globalAlpha = 1;
      centered(c, st.foot, w / 2, 408, w - 44, 32, '#4b4757', '600');
      centered(c, '税込', w / 2, 466, 90, 26, '#9a94a6', '600');
    })
  );

/**
 * The 本日特価 A-board that stands out on the apron.
 *
 * Chalk on a dark board, and it is the one piece of this building's signage
 * that is handwritten -- which is the whole reason it is worth standing next
 * to six printed ones.
 */
export const superDeal = () =>
  cached('superDeal', () =>
    make(384, 512, (c, w, h) => {
      c.fillStyle = '#3c4a48';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#f2ece0';
      c.lineWidth = 5;
      c.globalAlpha = 0.8;
      c.strokeRect(22, 22, w - 44, h - 44);
      c.globalAlpha = 1;
      centered(c, '本日 特価', w / 2, 96, w - 70, 70, '#fdf6e4', 'bold', 6);
      c.globalAlpha = 0.45;
      rule(c, 50, 146, w - 100, 3, '#e8e2d4');
      c.globalAlpha = 1;
      const rows = [['さんま', '１４８円'], ['とうふ', '６８円'], ['牛乳 １Ｌ', '１７８円'], ['食パン', '１２８円']];
      c.textBaseline = 'middle';
      rows.forEach(([a, b], i) => {
        c.font = `600 38px ${JP_FONT}`;
        c.fillStyle = '#f2ece0';
        c.textAlign = 'left';
        c.fillText(a, 48, 214 + i * 62);
        c.textAlign = 'right';
        c.fillStyle = '#f6d78a';
        c.fillText(b, w - 48, 214 + i * 62);
      });
      centered(c, '１８時から そうざい 半額', w / 2, 468, w - 50, 30, '#bfe0c8', '600');
    })
  );

/**
 * What you see through the glass.
 *
 * Three bands and nothing else: a lit ceiling strip with the aisle signs hung
 * off it, a run of gondola shelving, and either the chiller wall or the
 * checkout in front of that.  It has to be *darker* than the sunlit frontage or
 * the glass stops reading as glass -- the same note `shops.js` carries -- and
 * what has to survive at two metres is the depth, which is what the hung signs
 * are for.
 *
 * **Pale and warm, not dark and cool.**  The first pass was based on #6e6a7e,
 * which is a third of the value of every other glimpsed interior in this world
 * (`shopInterior` #e2ddd2, `libraryInterior` #e6e2d4) -- and behind glass at 0.42
 * opacity a supermarket at four in the afternoon came out as a shut one.  The
 * rule those two carry is the one that matters: darker than the *sunlit* render
 * (0xf6f1e4 here) so the glazing reads as glazing, and light enough that the
 * building reads as open.  The recess is walkable now, so this plate is seen from
 * two metres as well as from the road.
 */
export const superInterior = (variant = 0) =>
  cached('superInterior' + variant, () =>
    make(512, 384, (c, w, h) => {
      c.fillStyle = '#ddd8d0';
      c.fillRect(0, 0, w, h);
      // ceiling and its light strips
      c.fillStyle = '#cfcac6';
      c.fillRect(0, 0, w, 74);
      c.fillStyle = '#fff7e2';
      c.globalAlpha = 0.95;
      c.fillRect(28, 24, w - 56, 13);
      c.globalAlpha = 0.7;
      c.fillRect(58, 52, w - 116, 7);
      c.globalAlpha = 1;
      // the hung aisle signs
      const tags = [['青果', '#3f7f60'], ['鮮魚', '#3d6ec4'], ['惣菜', '#c4713a'], ['日配', '#8f6fb5']];
      for (let i = 0; i < 4; i++) {
        const x = 54 + i * 118;
        const tag = tags[(i + variant) % 4];
        c.fillStyle = '#a8a29c';
        c.fillRect(x + 40, 74, 3, 16);
        c.fillStyle = '#fbf8f0';
        c.fillRect(x, 90, 84, 34);
        c.fillStyle = tag[1];
        c.fillRect(x, 90, 84, 6);
        c.font = `bold 22px ${JP_FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(tag[0], x + 42, 111);
      }
      if (variant === 1) {
        // the chiller wall: three glazed cases with pale stock in them
        for (let i = 0; i < 3; i++) {
          const x = 26 + i * 160;
          c.fillStyle = '#aab5c0';
          c.fillRect(x, 156, 146, 200);
          c.fillStyle = '#c3ced8';
          c.fillRect(x + 8, 164, 130, 184);
          c.fillStyle = '#eef2f6';
          for (let k = 0; k < 4; k++) c.fillRect(x + 14, 172 + k * 46, 118, 8);
          c.fillStyle = '#d8e0e8';
          for (let k = 0; k < 4; k++) {
            for (let j = 0; j < 5; j++) c.fillRect(x + 18 + j * 24, 184 + k * 46, 18, 22);
          }
        }
      } else if (variant === 2) {
        // the checkout line: three lanes with their belts and pole lights
        for (let i = 0; i < 3; i++) {
          const x = 40 + i * 150;
          c.fillStyle = '#b5aea4';
          c.fillRect(x, 236, 112, 120);
          c.fillStyle = '#d2ccc2';
          c.fillRect(x, 236, 112, 16);
          c.fillStyle = '#8c8680';
          c.fillRect(x + 84, 150, 8, 90);
          c.fillStyle = ['#e8534a', '#3f7f60', '#3d6ec4'][i];
          c.fillRect(x + 74, 138, 28, 20);
        }
      } else {
        // gondola shelving, three runs deep
        for (let i = 0; i < 3; i++) {
          const x = 22 + i * 168;
          c.fillStyle = '#b3aca2';
          c.fillRect(x, 150, 148, 206);
          for (let k = 0; k < 4; k++) {
            c.fillStyle = '#c6bfb4';
            c.fillRect(x + 6, 160 + k * 50, 136, 10);
            c.fillStyle = ['#dfd0b2', '#cfdcc6', '#dcc6ca', '#c9d2e0'][(k + variant) % 4];
            for (let j = 0; j < 6; j++) c.fillRect(x + 10 + j * 22, 170 + k * 50, 17, 30);
          }
        }
      }
      // the floor, catching the ceiling strip
      c.fillStyle = '#c9c3ba';
      c.fillRect(0, 356, w, h - 356);
      c.globalAlpha = 0.22;
      c.fillStyle = '#fff7e2';
      c.fillRect(60, 356, w - 120, 12);
      c.globalAlpha = 1;
    })
  );

/**
 * Every plate the parking needs, in one generator.
 *
 * A roof car park is signed to death, and that is most of what makes one read
 * as a roof car park rather than as a flat roof somebody left cars on -- so
 * this is seven variants rather than seven textures, each drawn to the 2:3
 * face `makeSignPost` clamps a plate to.
 */
export const parkPlate = (variant = 0) =>
  cached('parkPlate' + variant, () =>
    make(342, 512, (c, w, h) => {
      const sets = [
        { bar: PAL.blueDeep, t: '屋上駐車場', s: '入口', arrow: 'up' },
        { bar: PAL.blueDeep, t: '出口', s: '徐行', arrow: 'down' },
        { bar: PAL.redDeep, t: '場内徐行', s: '１０km/h 以下' },
        { bar: PAL.redDeep, t: '制限高', s: '２.１ｍ' },
        { bar: PAL.blueDeep, t: '関係者以外', s: '立入禁止' },
        { bar: PAL.tealDeep, t: '荷捌き場', s: '搬入車両専用' },
        { bar: PAL.blueDeep, t: 'おもいやり', s: '駐車場' },
      ];
      const st = sets[variant % sets.length];
      c.fillStyle = '#fbfaf6';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 78, st.bar);
      c.strokeStyle = '#c4bfd0';
      c.lineWidth = 5;
      c.strokeRect(9, 9, w - 18, h - 18);
      centered(c, st.t, w / 2, 39, w - 40, 44, '#fdf8f0', 'bold', 3);
      centered(c, st.s, w / 2, 178, w - 50, 82, '#3b3846', 'bold', 4);
      if (st.arrow) {
        const cy = 350, s = st.arrow === 'up' ? -1 : 1;
        c.fillStyle = hex(st.bar);
        c.beginPath();
        c.moveTo(w / 2, cy + s * 74);
        c.lineTo(w / 2 - 62, cy - s * 14);
        c.lineTo(w / 2 - 24, cy - s * 14);
        c.lineTo(w / 2 - 24, cy - s * 74);
        c.lineTo(w / 2 + 24, cy - s * 74);
        c.lineTo(w / 2 + 24, cy - s * 14);
        c.lineTo(w / 2 + 62, cy - s * 14);
        c.closePath();
        c.fill();
      } else {
        c.globalAlpha = 0.35;
        rule(c, 46, 300, w - 92, 3, '#9a94a6');
        c.globalAlpha = 1;
        centered(c, 'スーパー さかえ', w / 2, 376, w - 60, 32, '#7a7588', '600', 2);
        centered(c, '七丁目店', w / 2, 430, w - 130, 30, '#9a94a6', '600', 2);
      }
    })
  );

/** 駐車場ご案内 -- the board at the ramp foot.  A section, not a map. */
export const parkGuide = () =>
  cached('parkGuide', () =>
    make(512, 384, (c, w, h) => {
      c.fillStyle = '#fbfaf6';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 62, PAL.blueDeep);
      centered(c, '駐車場 ご案内', w / 2, 31, w - 60, 40, '#fdf8f0', 'bold', 4);
      c.strokeStyle = '#6f6a80';
      c.lineWidth = 4;
      c.strokeRect(64, 176, 300, 150);
      c.fillStyle = '#dfe6ee';
      c.fillRect(64, 148, 300, 28);
      c.strokeRect(64, 148, 300, 28);
      c.fillStyle = hex(PAL.blueDeep);
      for (let i = 0; i < 5; i++) c.fillRect(84 + i * 58, 154, 34, 16);
      c.beginPath();
      c.moveTo(364, 326);
      c.lineTo(432, 326);
      c.lineTo(432, 162);
      c.lineTo(364, 162);
      c.stroke();
      c.font = `600 24px ${JP_FONT}`;
      c.fillStyle = '#4b4757';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('屋上 駐車場', 214, 128);
      c.fillText('売場', 214, 250);
      c.save();
      c.translate(468, 244);
      c.rotate(-Math.PI / 2);
      c.fillText('のぼり', 0, 0);
      c.restore();
      centered(c, '２時間 無料 ・ 以後 ３０分 １００円', w / 2, 360, w - 50, 26, '#6f6a80', '600');
    })
  );

/** The numeral painted at the head of a roof bay. */
export const deckBay = (n = 1) =>
  cached('deckBay' + n, () =>
    make(128, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      centered(c, String(n), w / 2, h / 2, w - 24, 104, 'rgba(244,242,246,0.92)');
    })
  );

/** The coin park on the plot opposite the store. */
export const coinParkPlate = () =>
  cached('coinParkPlate', () =>
    make(384, 512, (c, w, h) => {
      c.fillStyle = '#fbfaf6';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 88, PAL.teal);
      centered(c, '七丁目 パーキング', w / 2, 44, w - 36, 44, '#fdf8f0', 'bold', 2);
      centered(c, '６', w / 2, 196, w - 220, 148, hex(PAL.redDeep));
      centered(c, '台', w / 2, 288, w - 260, 50, '#4b4757');
      c.globalAlpha = 0.4;
      rule(c, 40, 330, w - 80, 3, '#9a94a6');
      c.globalAlpha = 1;
      const rows = [['８時 - ２０時', '３０分 １００円'], ['２０時 - ８時', '６０分 １００円']];
      c.textBaseline = 'middle';
      rows.forEach(([a, b], i) => {
        c.font = `600 26px ${JP_FONT}`;
        c.fillStyle = '#4b4757';
        c.textAlign = 'left';
        c.fillText(a, 36, 372 + i * 48);
        c.textAlign = 'right';
        c.fillText(b, w - 36, 372 + i * 48);
      });
      centered(c, '月極 ２台  空きあり', w / 2, 474, w - 50, 28, hex(PAL.tealDeep), '600');
    })
  );

/** 荷捌き -- the plates on the delivery yard's gate, dock and recycling cage. */
export const deliveryPlate = (variant = 0) =>
  cached('deliveryPlate' + variant, () =>
    make(512, 256, (c, w, h) => {
      const sets = [
        { bar: PAL.tealDeep, t: '搬入口', s: 'スーパー さかえ  七丁目店' },
        { bar: PAL.redDeep, t: '荷捌き中 注意', s: '車両 出入口' },
        { bar: PAL.blueDeep, t: '資源 回収', s: 'ダンボール ・ トレー' },
      ];
      const st = sets[variant % sets.length];
      c.fillStyle = '#fbfaf6';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 16, st.bar);
      rule(c, 0, h - 16, w, 16, st.bar);
      centered(c, st.t, w / 2, h * 0.42, w - 70, 72, '#3b3846', 'bold', 5);
      centered(c, st.s, w / 2, h * 0.74, w - 60, 30, '#7a7588', '600', 2);
    })
  );

/* ------------------------------------------------------------------ *
 * ひばり山 -- the back hills and the railway tunnel through them.
 *
 * Appended, like everything before it: every `variant:`, `kind:` and `plate:`
 * index in the world is a position in one of these tables, so nothing may be
 * inserted above.
 *
 * The range is ひばり山, the tunnel ひばり山トンネル, the viewing deck
 * ひばり山 展望台 and the stone shrine on the path 山ノ神.  The bearings on the
 * view panel are the real ones, measured off the world -- a 展望案内板 whose
 * arrows point at nothing is the fastest way to give a hilltop away as a set.
 * ------------------------------------------------------------------ */

/** 扁額 -- the name stone set into the crown of a tunnel portal. */
export const tunnelPlate = () =>
  cached('tunnelPlate', () =>
    make(768, 192, (c, w, h) => {
      c.fillStyle = '#d6d1d8';
      c.fillRect(0, 0, w, h);
      // a chiselled bevel: two tones, no gradient
      c.fillStyle = '#c2bcc6';
      c.fillRect(0, 0, w, 10);
      c.fillRect(0, 0, 10, h);
      c.fillStyle = '#eae6ec';
      c.fillRect(0, h - 10, w, 10);
      c.fillRect(w - 10, 0, 10, h);
      centered(c, 'ひばり山トンネル', w / 2, h * 0.52, w - 70, 92, '#413d4e', 'bold', 10);
    })
  );

/**
 * The works plate beside a portal: length, bore and the maintenance number.
 *
 * 36.0 m is not a round number picked to look plausible -- it is the distance
 * between the two portal planes, which is set by how much mountain there is.
 */
export const tunnelInfo = () =>
  cached('tunnelInfo', () =>
    make(384, 288, (c, w, h) => {
      c.fillStyle = '#e6e7e2';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 18, PAL.blueDeep);
      centered(c, 'ひばり山トンネル', w / 2, 70, w - 50, 50, '#2f3a5b', 'bold', 4);
      c.globalAlpha = 0.4;
      rule(c, 36, 106, w - 72, 3, '#9aa0ac');
      c.globalAlpha = 1;
      const rows = [['延長', '36.0 m'], ['内径', '6.6 m'], ['管理番号', 'ト - 三']];
      c.textBaseline = 'middle';
      rows.forEach(([a, b], i) => {
        c.font = `600 28px ${JP_FONT}`;
        c.fillStyle = '#4b4757';
        c.textAlign = 'left';
        c.fillText(a, 32, 150 + i * 44);
        c.textAlign = 'right';
        c.fillText(b, w - 32, 150 + i * 44);
      });
      centered(c, 'ひばり電鉄  施設課', w / 2, 264, w - 60, 24, '#8a8696', '600');
    })
  );

/**
 * The plates on the lineside round the tunnel.  0 立入禁止, 1 触車注意,
 * 2 待避所 (the refuge recess in the bore), 3 a block-signal number.
 */
export const railPlate = (variant = 0) =>
  cached('railPlate' + variant, () =>
    make(384, 288, (c, w, h) => {
      const sets = [
        { bg: hex(PAL.redDeep), fg: '#fdf8f0', t: '立入禁止', s: '鉄道用地' },
        { bg: hex(PAL.yellow), fg: '#2f2b38', t: '触車 注意', s: '列車に注意' },
        { bg: '#fdf8f0', fg: '#2f5b52', t: '待避所', s: 'ト - 三  第二' },
        { bg: '#2b2f3e', fg: '#f2e6b0', t: '第 4 閉塞', s: '下り' },
      ];
      const st = sets[variant % sets.length];
      c.fillStyle = st.bg;
      c.fillRect(0, 0, w, h);
      c.fillStyle = st.fg;
      c.fillRect(14, 14, w - 28, 5);
      c.fillRect(14, h - 19, w - 28, 5);
      centered(c, st.t, w / 2, h * 0.42, w - 60, 76, st.fg, 'bold', 6);
      centered(c, st.s, w / 2, h * 0.72, w - 60, 32, st.fg, '600', 2);
    })
  );

/**
 * The 遊歩道 fingerpost plates.  One per plate, because a fingerpost carries a
 * destination and a distance and nothing else.
 */
export const trailSign = (variant = 0) =>
  cached('trailSign' + variant, () =>
    make(512, 128, (c, w, h) => {
      const sets = [
        ['展望台', '260 m'], ['山ノ神', '110 m'], ['林間広場', '180 m'],
        ['学校 裏門', '150 m'], ['尾根道', '90 m'], ['ひばり山 遊歩道', ''],
      ];
      const [t, d] = sets[variant % sets.length];
      c.fillStyle = '#f3ecdc';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 8, 0x6f5943);
      rule(c, 0, h - 8, w, 8, 0x6f5943);
      if (d) {
        centered(c, t, w * 0.40, h * 0.52, w * 0.56, 62, '#4a3b2a', 'bold', 6);
        c.font = `600 40px ${JP_FONT}`;
        c.fillStyle = '#7f6a52';
        c.textAlign = 'right';
        c.textBaseline = 'middle';
        c.fillText(d, w - 26, h * 0.55);
      } else {
        centered(c, t, w / 2, h * 0.52, w - 60, 62, '#4a3b2a', 'bold', 8);
      }
    })
  );

/**
 * The notice boards on the hill.  0 the safety notice at the trail head, 1 the
 * nature-observation board at the glade, 2 the shrine's board, 3 the plate on
 * the school's back gate.
 */
export const trailNotice = (variant = 0) =>
  cached('trailNotice' + variant, () =>
    make(512, 384, (c, w, h) => {
      c.fillStyle = '#fbfaf4';
      c.fillRect(0, 0, w, h);
      const sets = [
        {
          bar: PAL.redDeep, t: 'ひばり山 遊歩道 ご注意',
          rows: ['・ 雨のあとは足もとがすべります', '・ 日没後の入山はご遠慮ください',
            '・ ごみはお持ち帰りください', '・ たき火 ・ 喫煙は禁止です'],
          foot: 'ひばり台 町内会  ・  学校 環境委員会',
        },
        {
          bar: PAL.leafDeep, t: '自然観察のご案内',
          rows: ['この林は コナラ ・ クヌギ の雑木林です', '春 : やまざくら ・ すみれ',
            '初夏 : ほたるぶくろ ・ うつぎ', '秋 : どんぐり ・ きのこ'],
          foot: 'ひばり台高校  生物部  観察記録より',
        },
        {
          bar: PAL.torii, t: '山ノ神',
          rows: ['この石祠は 山の作業と', '道の安全を守るものです',
            'お参りのあとは 段を下りて', '道におもどりください'],
          foot: 'ひばり台 町内会',
        },
        {
          bar: PAL.blueDeep, t: '裏門  施錠時間',
          rows: ['平日  七時三十分 ー 十八時', '土曜  七時三十分 ー 十六時',
            '日曜 ・ 休日  閉門', '遊歩道へは この門からどうぞ'],
          foot: '県立ひばり台高等学校  事務室',
        },
      ];
      const st = sets[variant % sets.length];
      rule(c, 0, 0, w, 24, st.bar);
      centered(c, st.t, w / 2, 84, w - 50, 54, '#3b3846', 'bold', 3);
      c.globalAlpha = 0.4;
      rule(c, 44, 122, w - 88, 3, '#a8a4b2');
      c.globalAlpha = 1;
      c.font = `500 30px ${JP_FONT}`;
      c.fillStyle = '#5a5666';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      st.rows.forEach((r, i) => c.fillText(r, 42, 172 + i * 46));
      centered(c, st.foot, w / 2, 356, w - 50, 24, '#8f8b9a', '600');
    })
  );

/**
 * 眺望案内 -- the panel on the viewing deck's rail that names what you can see.
 *
 * Drawn as a plan with the deck at the bottom and the town fanned across the
 * top, which is how these actually are drawn, and the bearings are the real ones
 * measured off the world from (34.5, -128.2).
 */
export const deckPanel = () =>
  cached('deckPanel', () =>
    make(1024, 512, (c, w, h) => {
      c.fillStyle = '#f6f1e4';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 22, PAL.tealDeep);
      centered(c, 'ひばり山 展望台  眺望案内', w * 0.5, 62, w * 0.7, 46, '#2f5b52', 'bold', 4);
      c.globalAlpha = 0.35;
      rule(c, 60, 92, w - 120, 3, '#a0a8a0');
      c.globalAlpha = 1;

      const ox = w * 0.5, oy = h - 54;
      c.strokeStyle = '#c0bcae';
      c.lineWidth = 2;
      for (let k = -3; k <= 3; k++) {
        c.beginPath();
        c.moveTo(ox, oy);
        c.lineTo(ox + Math.sin(k * 0.30) * 460, oy - Math.cos(k * 0.30) * 380);
        c.stroke();
      }
      c.fillStyle = '#2f5b52';
      c.beginPath();
      c.moveTo(ox, oy - 16);
      c.lineTo(ox - 13, oy + 8);
      c.lineTo(ox + 13, oy + 8);
      c.closePath();
      c.fill();
      centered(c, '現在地', ox, oy + 26, 160, 22, '#5a5666', '600');

      const marks = [
        ['学校 ぐらうんど', -0.6, 0.42], ['校舎 ・ 屋上の鐘', -0.2, 0.52],
        ['体育館', 0.5, 0.44], ['まちなみ ・ 商店街', -1.5, 0.80],
        ['駅  ・  踏切', -0.05, 0.92], ['用水路', 1.2, 0.86],
        ['ひばり山トンネル ↗', 2.5, 0.72], ['尾根道 ・ 山ノ神', -2.6, 0.36],
      ];
      c.textBaseline = 'middle';
      for (const [t, k, rf] of marks) {
        const a = k * 0.30;
        const px = ox + Math.sin(a) * 460 * rf;
        const py = oy - Math.cos(a) * 380 * rf;
        c.fillStyle = '#8f9a8a';
        c.beginPath();
        c.arc(px, py, 6, 0, Math.PI * 2);
        c.fill();
        c.font = `600 25px ${JP_FONT}`;
        c.fillStyle = '#4b4757';
        c.textAlign = px < ox ? 'right' : 'left';
        c.fillText(t, px + (px < ox ? -14 : 14), py);
      }
      c.font = `600 22px ${JP_FONT}`;
      c.fillStyle = '#8a8696';
      c.textAlign = 'left';
      c.fillText('標高  約 15 m   ・   ひばり台 町内会', 44, h - 24);
    })
  );

/** The name plates on the school's new blocks and its back gate. */
export const schoolBlockPlate = (variant = 0) =>
  cached('schoolBlockPlate' + variant, () =>
    make(512, 128, (c, w, h) => {
      const sets = [
        ['第二校舎  ・  特別教室', 'DAINI KOSHA'],
        ['管理棟', 'KANRITO'],
        ['体育館  ・  器材庫', 'TAIIKUKAN'],
        ['職員室  ・  事務室', 'SHOKUINSHITSU'],
        ['裏門', 'URAMON'],
      ];
      const [t, s] = sets[variant % sets.length];
      c.fillStyle = '#f4f1ea';
      c.fillRect(0, 0, w, h);
      rule(c, 0, h - 10, w, 10, PAL.schoolRoof);
      centered(c, t, w / 2, h * 0.42, w - 50, 52, '#3f4658', 'bold', 4);
      c.font = `600 20px ${JP_FONT}`;
      c.fillStyle = '#9aa0ae';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(s, w / 2, h * 0.76);
    })
  );

/**
 * The interiors glimpsed through the second block's windows.
 *
 * A 特別教室棟 earns its own set because the entire point of it is that the rooms
 * are *not* classrooms: 0 理科 (benches with tap risers), 1 美術 (easels and the
 * plaster shelf), 2 音楽 (an upright and instrument cases), 3 家庭科 (cooking
 * islands under a hood), 4 コンピュータ (rows of monitors), 5 the corridor with
 * its lockers and a sink run.  Same construction as `classroomTex`: flat blocks,
 * unlit, knocked back toward violet at the end, and no figures anywhere.
 */
export const specialRoomTex = (variant = 0) =>
  cached('specialRoom' + variant, () =>
    make(512, 256, (c, w, h) => {
      const v = variant % 6;
      c.fillStyle = ['#cfd4cc', '#d6d2c6', '#cfcbd6', '#d2d6d0', '#c9ccd6', '#d8d4c8'][v];
      c.fillRect(0, 0, w, h);
      // the floor band and the ceiling line every one of them has
      c.fillStyle = '#b3ada6';
      c.fillRect(0, h * 0.74, w, h * 0.26);
      c.fillStyle = '#e2e0d8';
      c.fillRect(0, 0, w, 16);
      const box = (x, y, bw, bh, col) => { c.fillStyle = col; c.fillRect(x, y, bw, bh); };
      if (v === 0) {
        for (let r = 0; r < 2; r++) {
          const y = h * (0.42 + r * 0.22);
          box(w * 0.06, y, w * 0.88, 26 - r * 4, '#4d5358');
          box(w * 0.06, y + 26 - r * 4, w * 0.88, 12, '#8d8b86');
          for (let k = 0; k < 5; k++) box(w * (0.14 + k * 0.18), y - 22, 7, 22, '#9aa4a8');
        }
        box(w * 0.02, h * 0.18, w * 0.3, h * 0.2, '#b8bcb4');
      } else if (v === 1) {
        box(0, h * 0.2, w, 14, '#c4bfb2');
        for (let k = 0; k < 4; k++) box(w * (0.1 + k * 0.1), h * 0.14, 20, 22, '#e6e2d8');
        for (let k = 0; k < 3; k++) {
          const x = w * (0.16 + k * 0.29);
          box(x, h * 0.38, 46, 52, '#e8e4d6');
          box(x + 20, h * 0.38 + 52, 7, 34, '#8a7358');
          box(x - 6, h * 0.38 + 84, 60, 6, '#8a7358');
        }
      } else if (v === 2) {
        box(w * 0.08, h * 0.3, w * 0.26, h * 0.34, '#4a3b34');
        box(w * 0.08, h * 0.3, w * 0.26, 12, '#6a564b');
        box(w * 0.11, h * 0.44, w * 0.2, 10, '#efeae0');
        box(w * 0.42, h * 0.16, w * 0.5, h * 0.22, '#3d5148');
        for (let k = 0; k < 4; k++) box(w * 0.44, h * (0.19 + k * 0.045), w * 0.46, 2, '#c8d2c8');
        for (let k = 0; k < 3; k++) box(w * (0.46 + k * 0.14), h * 0.46, 34, 62, '#5f5a52');
      } else if (v === 3) {
        for (let r = 0; r < 2; r++) {
          const y = h * (0.4 + r * 0.24);
          box(w * 0.1, y, w * 0.34, 24, '#c8cccc');
          box(w * 0.54, y, w * 0.34, 24, '#c8cccc');
          box(w * 0.1, y + 24, w * 0.78, 14, '#a8aca8');
        }
        box(w * 0.3, h * 0.14, w * 0.4, h * 0.16, '#b0b4b8');
      } else if (v === 4) {
        box(w * 0.34, h * 0.1, w * 0.34, h * 0.22, '#eeece4');
        for (let r = 0; r < 2; r++) {
          const y = h * (0.44 + r * 0.2);
          box(w * 0.06, y + 26, w * 0.88, 12, '#a8a49c');
          for (let k = 0; k < 6; k++) {
            box(w * (0.09 + k * 0.15), y, 38, 26, '#39404e');
            box(w * (0.09 + k * 0.15) + 14, y + 26, 10, 6, '#6d6a78');
          }
        }
      } else {
        box(0, h * 0.24, w, h * 0.4, '#b7c7d5');
        for (let k = 0; k < 9; k++) box(w * (0.02 + k * 0.11), h * 0.24, 4, h * 0.4, '#93a4b2');
        box(0, h * 0.64, w, 10, '#8d97a2');
        box(w * 0.62, h * 0.5, w * 0.34, 20, '#dfe4e6');
        box(w * 0.3, 18, w * 0.4, 8, '#f4f0e0');
      }
      c.fillStyle = 'rgba(126,116,150,0.20)';
      c.fillRect(0, 0, w, h);
    })
  );

/* ------------------------------------------------------------------ *
 * 東山トンネル -- the second bore, through the east shoulder's col, and the
 * plates that only exist because a player can now walk into a tunnel.
 *
 * Appended, like everything before it.  The bore's own signage is a different
 * problem from the lineside's: at the mouth you read a plate from twenty metres
 * and it has to be a shape, but on the lining you read one from two, so these
 * carry real text at real sizes and are the first plates in the world sized for
 * that distance.
 * ------------------------------------------------------------------ */

/** 扁額 for the second bore.  Same stone as `tunnelPlate`, different name --
 * which is the whole point of there being two of them. */
export const eastTunnelPlate = () =>
  cached('eastTunnelPlate', () =>
    make(768, 192, (c, w, h) => {
      c.fillStyle = '#d3cfd9';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#bfb9c6';
      c.fillRect(0, 0, w, 10);
      c.fillRect(0, 0, 10, h);
      c.fillStyle = '#e8e4ec';
      c.fillRect(0, h - 10, w, 10);
      c.fillRect(w - 10, 0, 10, h);
      centered(c, '東山トンネル', w / 2, h * 0.52, w - 90, 100, '#3e3a4c', 'bold', 14);
    })
  );

/** Its works plate.  30.0 m is the distance between its two portal planes, the
 * same way 36.0 is the other one's -- both are what the mountain gave. */
export const eastTunnelInfo = () =>
  cached('eastTunnelInfo', () =>
    make(384, 288, (c, w, h) => {
      c.fillStyle = '#e6e7e2';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 18, PAL.blueDeep);
      centered(c, '東山トンネル', w / 2, 70, w - 50, 50, '#2f3a5b', 'bold', 4);
      c.globalAlpha = 0.4;
      rule(c, 36, 106, w - 72, 3, '#9aa0ac');
      c.globalAlpha = 1;
      const rows = [['延長', '30.0 m'], ['内径', '6.6 m'], ['管理番号', 'ト - 四']];
      c.textBaseline = 'middle';
      rows.forEach(([a, b], i) => {
        c.font = `600 28px ${JP_FONT}`;
        c.fillStyle = '#4b4757';
        c.textAlign = 'left';
        c.fillText(a, 32, 150 + i * 44);
        c.textAlign = 'right';
        c.fillText(b, w - 32, 150 + i * 44);
      });
      centered(c, 'ひばり電鉄  施設課', w / 2, 264, w - 60, 24, '#8a8696', '600');
    })
  );

/**
 * The plates *inside* a bore, read from two metres.
 *
 * 0 距離標, 1 覆工番号 (the ring number stencilled on the lining), 2 保守用通路,
 * 3 the exit distance at a refuge.  Deliberately grubby-white on grey rather
 * than the lineside's saturated enamel: down here there is no daylight on them
 * and a red plate in an unlit bore is the only thing you would ever see.
 */
export const borePlate = (variant = 0) =>
  cached('borePlate' + variant, () =>
    make(384, 192, (c, w, h) => {
      const sets = [
        { bg: '#e9e6dc', fg: '#33303c', t: '12k 400', s: 'ひばり電鉄 本線' },
        { bg: '#dcd8cf', fg: '#3c3846', t: '覆工 08', s: '巻厚 420' },
        { bg: '#e4e7e2', fg: '#2f4a44', t: '保守用通路', s: '足元 注意' },
        { bg: '#e9e6dc', fg: '#33303c', t: '坑口 12 m', s: '西 ←' },
      ];
      const st = sets[variant % sets.length];
      c.fillStyle = st.bg;
      c.fillRect(0, 0, w, h);
      c.fillStyle = st.fg;
      c.globalAlpha = 0.55;
      c.fillRect(12, 12, w - 24, 3);
      c.fillRect(12, h - 15, w - 24, 3);
      c.globalAlpha = 1;
      centered(c, st.t, w / 2, h * 0.44, w - 54, 62, st.fg, 'bold', 4);
      centered(c, st.s, w / 2, h * 0.75, w - 54, 26, st.fg, '600', 2);
    })
  );

/**
 * The maintenance gate's plate, on the leaf itself.
 *
 * This is the one sign in the world whose job is to explain a *route*: the gate
 * is the only reason a player standing on the lineside believes they are allowed
 * to walk into a railway tunnel, so it says who may and what the path is, rather
 * than only saying keep out.
 */
/* ------------------------------------------------------------------ *
 * ひばり湖 -- the lake district.
 *
 * Appended, like every other table in this file, because `variant:` indices are
 * baked into geometry all over the world.  Nine generators for twenty-six
 * different pieces of signage, which is the ratio this file has settled at: one
 * variant list per *kind* of sign, because a lake's plates all look alike and
 * differ only in what they say.
 * ------------------------------------------------------------------ */

/**
 * The lake's name and place plates -- the small enamel-on-timber sort a 町内会
 * and a 土地改良区 put up between them.
 *
 * Landscape 512 x 128 like every other plate here, so it fits `makeSignPost`'s
 * standard 1.05 x 0.26 blade without an aspect check.
 */
export const lakePlate = (variant = 0) =>
  cached('lakePlate' + variant, () =>
    make(512, 128, (c, w, h) => {
      const sets = [
        ['ひばり湖', 'HIBARI-KO'],
        ['ひばり湖畔公園', 'LAKESIDE PARK'],
        ['見晴らし桟橋', 'MIHARASHI PIER'],
        ['貸ボート ひばり', 'BOAT HIRE'],
        ['ひばり湖 キャンプ場', 'CAMP SITE'],
        ['野鳥観察小屋 かいつぶり', 'BIRD HIDE'],
        ['水神様', 'SUIJIN'],
        ['ひばり湖 見晴台', 'MIHARASHIDAI'],
        ['ひばり湖 堰堤', 'EMBANKMENT'],
        ['湖畔遊歩道', 'SHORE WALK'],
        ['湖畔道路', 'LAKE ROAD'],
        ['ひばり湖 土地改良区', 'LAND IMPROVEMENT DISTRICT'],
      ];
      const [t, s] = sets[variant % sets.length];
      c.fillStyle = '#f2eee2';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 7, PAL.tealDeep);
      rule(c, 0, h - 7, w, 7, PAL.tealDeep);
      centered(c, t, w / 2, h * 0.44, w - 56, 58, '#2f4a52', 'bold', 4);
      c.font = `600 19px ${JP_FONT}`;
      c.fillStyle = '#8f9a9a';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(s, w / 2, h * 0.79);
    })
  );

/** Direction plates with real distances, for the shore walk's fingerposts. */
export const lakeSign = (variant = 0) =>
  cached('lakeSign' + variant, () =>
    make(512, 128, (c, w, h) => {
      const sets = [
        ['湖畔公園', '160 m'], ['見晴らし桟橋', '40 m'], ['貸ボート', '210 m'],
        ['喫茶 みなも', '340 m'], ['キャンプ場', '430 m'], ['野鳥観察小屋', '520 m'],
        ['水神様', '760 m'], ['見晴台', '280 m'], ['堰堤 ・ 学校', '520 m'],
        ['ひばり湖 一周 (行き止まり)', ''],
      ];
      const [t, d] = sets[variant % sets.length];
      c.fillStyle = '#f3ecdc';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 8, 0x6f5943);
      rule(c, 0, h - 8, w, 8, 0x6f5943);
      if (d) {
        centered(c, t, w * 0.40, h * 0.52, w * 0.56, 60, '#4a3b2a', 'bold', 5);
        c.font = `600 40px ${JP_FONT}`;
        c.fillStyle = '#7f6a52';
        c.textAlign = 'right';
        c.textBaseline = 'middle';
        c.fillText(d, w - 26, h * 0.55);
      } else {
        centered(c, t, w / 2, h * 0.52, w - 50, 46, '#4a3b2a', 'bold', 2);
      }
    })
  );

/**
 * The notice boards.  Six of them, and between them they are most of what says
 * this is a working irrigation reservoir with a park bolted onto one end rather
 * than a beauty spot.
 */
export const lakeNotice = (variant = 0) =>
  cached('lakeNotice' + variant, () =>
    make(512, 384, (c, w, h) => {
      c.fillStyle = '#fbfaf4';
      c.fillRect(0, 0, w, h);
      const sets = [
        {
          bar: PAL.redDeep, t: '水辺のご注意',
          rows: ['・ 遊泳 ・ 釣りは禁止です', '・ water depth  最大 二 . 六 メートル',
            '・ 岸はすべります  柵の外に出ないでください', '・ お子さまから目をはなさないで'],
          foot: 'ひばり湖 土地改良区  ・  ひばり台 町内会',
        },
        {
          bar: PAL.tealDeep, t: 'ひばり湖 のなりたち',
          rows: ['この池は 昭和のはじめに', 'ひばり台の田に水を引くため', 'つくられた 灌漑用のため池です',
            '水は 放水路から 用水路へ流れます'],
          foot: 'ひばり湖 土地改良区',
        },
        {
          bar: PAL.blueDeep, t: '貸ボート ご利用案内',
          rows: ['手こぎボート  三十分  三百円', '足こぎボート  三十分  四百円',
            '受付  九時 ー 十六時三十分', '風の強い日はお休みします'],
          foot: 'ひばり湖畔公園  管理事務所',
        },
        {
          bar: PAL.orange, t: 'キャンプ場 火気のお願い',
          rows: ['・ 焚き火は 炉のなかだけで', '・ 灰は 灰おき場へ',
            '・ 消火用の水は 洗い場に', '・ 二十一時から 静かに'],
          foot: 'ひばり湖 キャンプ場  管理棟',
        },
        {
          bar: PAL.leafDeep, t: '野鳥観察のマナー',
          rows: ['・ 小屋のなかから ゆっくり', '・ 大きな声を出さないで',
            '・ 葦のなかに入らないで', '春 : かいつぶり ・ ばん ・ さぎ'],
          foot: 'ひばり台高校  生物部  ・  野鳥の会',
        },
        {
          bar: PAL.red, t: '管理区域  立入禁止',
          rows: ['堰堤 ・ 余水吐 ・ 取水施設は', '管理区域です  柵の内側には',
            '入らないでください', '緊急時連絡先  管理棟'],
          foot: 'ひばり湖 土地改良区',
        },
      ];
      const st = sets[variant % sets.length];
      rule(c, 0, 0, w, 24, st.bar);
      centered(c, st.t, w / 2, 84, w - 50, 52, '#3b3846', 'bold', 3);
      c.globalAlpha = 0.4;
      rule(c, 44, 122, w - 88, 3, '#a8a4b2');
      c.globalAlpha = 1;
      c.font = `500 29px ${JP_FONT}`;
      c.fillStyle = '#5a5666';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      st.rows.forEach((r, i) => c.fillText(r, 42, 172 + i * 46));
      centered(c, st.foot, w / 2, 356, w - 50, 23, '#8f8b9a', '600');
    })
  );

/**
 * 湖区案内図 -- the lake's own map board.
 *
 * Drawn as a plan with north up, the water as one flat shape and the eight places
 * marked, which is how these are: the shape is traced from the shoreline table in
 * `lakeform.js` at 1 : 480, so the board and the lake are the same lake.
 */
export const lakeMap = () =>
  cached('lakeMap', () =>
    make(1024, 640, (c, w, h) => {
      c.fillStyle = '#f6f1e4';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 22, PAL.tealDeep);
      centered(c, 'ひばり湖  案内図', w * 0.5, 60, w * 0.5, 44, '#2f5b52', 'bold', 4);
      /* the water: the same 37 vertices, mapped x -> px, z -> py with north up.
       * Scaled from x 136..256, z -34..-142 into the box below the title. */
      const SH = [
        [161.0, -45.2], [154.0, -48.8], [147.2, -52.2], [143.6, -60.0], [142.4, -70.0],
        [142.2, -80.0], [145.0, -90.0], [147.6, -100.0], [148.6, -110.0], [151.6, -118.0],
        [159.4, -125.6], [170.0, -131.6], [181.0, -135.6], [184.0, -126.0], [186.0, -116.0],
        [189.0, -107.0], [194.0, -101.0], [199.0, -105.0], [201.0, -114.0], [200.0, -124.0],
        [202.0, -134.0], [214.0, -136.5], [226.0, -135.0], [236.0, -130.0], [243.0, -120.0],
        [247.0, -108.0], [249.6, -96.0], [249.8, -84.0], [247.0, -72.0], [242.0, -60.0],
        [234.0, -50.0], [224.0, -43.0], [212.0, -40.0], [199.0, -39.4], [186.0, -39.6],
        [174.0, -40.6], [166.0, -42.4],
      ];
      const X0 = 132, X1 = 260, Z0 = -146, Z1 = -32;
      const px = (x) => 90 + ((x - X0) / (X1 - X0)) * (w - 300);
      const py = (z) => h - 60 - ((z - Z0) / (Z1 - Z0)) * (h - 170);
      c.beginPath();
      SH.forEach(([x, z], i) => (i ? c.lineTo(px(x), py(z)) : c.moveTo(px(x), py(z))));
      c.closePath();
      c.fillStyle = '#a9c8d8';
      c.fill();
      c.strokeStyle = '#5f83a4';
      c.lineWidth = 3;
      c.stroke();
      // the road and the walk, as two dashed lines
      c.setLineDash([10, 7]);
      c.strokeStyle = '#8f8b7a';
      c.lineWidth = 4;
      c.beginPath();
      [[150, -34], [143, -44], [130, -76], [140, -105], [165, -129], [205, -147]]
        .forEach(([x, z], i) => (i ? c.lineTo(px(x), py(z)) : c.moveTo(px(x), py(z))));
      c.stroke();
      c.setLineDash([]);
      const marks = [
        ['堰堤', 150, -41], ['湖畔公園', 134, -74], ['桟橋', 160, -80],
        ['貸ボート', 141, -104], ['喫茶', 178, -142], ['キャンプ場', 208, -151],
        ['野鳥小屋', 218, -145], ['水神様', 254, -92], ['見晴台', 136, -108],
      ];
      c.textBaseline = 'middle';
      for (const [t, x, z] of marks) {
        const cx = px(x), cy = py(z);
        c.fillStyle = '#cf6a5e';
        c.beginPath();
        c.arc(cx, cy, 7, 0, Math.PI * 2);
        c.fill();
        c.font = `600 26px ${JP_FONT}`;
        c.fillStyle = '#3f4658';
        c.textAlign = cx > w * 0.55 ? 'right' : 'left';
        c.fillText(t, cx + (cx > w * 0.55 ? -14 : 14), cy);
      }
      // north arrow and the scale bar
      c.fillStyle = '#4b4757';
      c.beginPath();
      c.moveTo(w - 120, 120);
      c.lineTo(w - 136, 158);
      c.lineTo(w - 104, 158);
      c.closePath();
      c.fill();
      centered(c, 'N', w - 120, 178, 60, 28, '#4b4757');
      rule(c, 90, h - 34, 160, 6, 0x4b4757);
      c.font = `600 22px ${JP_FONT}`;
      c.textAlign = 'left';
      c.fillStyle = '#8a8696';
      c.fillText('0             50 m', 90, h - 12);
      c.textAlign = 'right';
      c.fillText('水面標高  約 四 . 五 メートル   ・   最大水深 二 . 六 メートル', w - 60, h - 12);
    })
  );

/**
 * 眺望案内 for the 見晴台, and the bearings are measured off the world from
 * (124, -108) rather than invented -- the same discipline `deckPanel` follows.
 */
export const lakePanel = () =>
  cached('lakePanel', () =>
    make(1024, 512, (c, w, h) => {
      c.fillStyle = '#f6f1e4';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 22, PAL.tealDeep);
      centered(c, 'ひばり湖 見晴台  眺望案内', w * 0.5, 62, w * 0.7, 44, '#2f5b52', 'bold', 4);
      c.globalAlpha = 0.35;
      rule(c, 60, 92, w - 120, 3, '#a0a8a0');
      c.globalAlpha = 1;
      const ox = w * 0.5, oy = h - 54;
      c.strokeStyle = '#c0bcae';
      c.lineWidth = 2;
      for (let k = -3; k <= 3; k++) {
        c.beginPath();
        c.moveTo(ox, oy);
        c.lineTo(ox + Math.sin(k * 0.3) * 460, oy - Math.cos(k * 0.3) * 380);
        c.stroke();
      }
      c.fillStyle = '#2f5b52';
      c.beginPath();
      c.moveTo(ox, oy - 16);
      c.lineTo(ox - 13, oy + 8);
      c.lineTo(ox + 13, oy + 8);
      c.closePath();
      c.fill();
      centered(c, '現在地  標高 約 十二 m', ox, oy + 26, 260, 22, '#5a5666', '600');
      const marks = [
        ['湖畔公園 ・ 桟橋', -1.4, 0.34], ['ひばり湖', 0.1, 0.62],
        ['半島 ・ 葦原', 0.7, 0.80], ['堰堤 ・ 余水吐', -2.2, 0.52],
        ['喫茶 みなも', 1.9, 0.50], ['水神様 ・ 東の尾根', 1.4, 0.94],
        ['東山トンネル ↗', -2.9, 0.86], ['学校 ・ まちなみ ↖', -3.0, 0.44],
      ];
      c.textBaseline = 'middle';
      for (const [t, k, rf] of marks) {
        const a = k * 0.3;
        const mx = ox + Math.sin(a) * 460 * rf;
        const my = oy - Math.cos(a) * 380 * rf;
        c.fillStyle = '#8f9a8a';
        c.beginPath();
        c.arc(mx, my, 6, 0, Math.PI * 2);
        c.fill();
        c.font = `600 25px ${JP_FONT}`;
        c.fillStyle = '#4b4757';
        c.textAlign = mx < ox ? 'right' : 'left';
        c.fillText(t, mx + (mx < ox ? -14 : 14), my);
      }
      c.font = `600 22px ${JP_FONT}`;
      c.fillStyle = '#8a8696';
      c.textAlign = 'left';
      c.fillText('ひばり台 町内会  ・  ひばり湖 土地改良区', 44, h - 24);
    })
  );

/** 喫茶 みなも's fascia, and the little lightbox by its door. */
export const cafeFascia = () =>
  cached('cafeFascia', () =>
    make(1024, 220, (c, w, h) => {
      c.fillStyle = '#f4ece0';
      c.fillRect(0, 0, w, h);
      rule(c, 0, h - 14, w, 14, 0x8a6647);
      centered(c, '喫茶 みなも', w * 0.40, h * 0.5, w * 0.5, 116, '#4a3b2a', 'bold', 12);
      c.font = `600 34px ${JP_FONT}`;
      c.fillStyle = '#9a8f7a';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText('COFFEE  ・  KOHAN', w * 0.68, h * 0.40);
      c.font = `500 27px ${JP_FONT}`;
      c.fillText('こーひー ・ 軽食 ・ 湖の見える席', w * 0.68, h * 0.68);
    })
  );

export const cafeMenu = () =>
  cached('cafeMenu', () =>
    make(384, 512, (c, w, h) => {
      c.fillStyle = '#3d4046';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#efe6d4';
      centered(c, 'ほんじつの', w / 2, 64, w - 60, 42, '#efe6d4', 'bold', 2);
      centered(c, 'おすすめ', w / 2, 112, w - 60, 46, '#e8c48a', 'bold', 2);
      c.globalAlpha = 0.5;
      rule(c, 50, 146, w - 100, 3, '#efe6d4');
      c.globalAlpha = 1;
      const rows = [
        ['ブレンド', '４２０'], ['アイス珈琲', '４６０'], ['湖畔ソーダ', '５００'],
        ['トースト', '３８０'], ['ナポリタン', '７８０'], ['クリームあんみつ', '６２０'],
      ];
      c.font = `600 30px ${JP_FONT}`;
      c.textBaseline = 'middle';
      rows.forEach(([a, b], i) => {
        c.fillStyle = '#efe6d4';
        c.textAlign = 'left';
        c.fillText(a, 44, 196 + i * 46);
        c.textAlign = 'right';
        c.fillStyle = '#c9bfa6';
        c.fillText(b, w - 44, 196 + i * 46);
      });
      centered(c, 'テラス席あります', w / 2, h - 46, w - 70, 28, '#a8a08e', '600', 1);
    })
  );

/**
 * What you see through 喫茶 みなも's windows: 0 the counter and its shelf, 1 the
 * tables with a pendant over them, 2 the kitchen hatch.  Same construction as
 * every other interior here -- flat blocks, unlit, knocked back toward violet,
 * and no figures anywhere.
 */
export const cafeInterior = (variant = 0) =>
  cached('cafeInterior' + variant, () =>
    make(512, 384, (c, w, h) => {
      c.fillStyle = '#4a4238';
      c.fillRect(0, 0, w, h);
      // the warm wash every one of them shares -- a lit room seen from outside
      const glow = c.createLinearGradient(0, 0, 0, h);
      glow.addColorStop(0, 'rgba(255, 214, 150, 0.55)');
      glow.addColorStop(1, 'rgba(255, 200, 130, 0.10)');
      c.fillStyle = glow;
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#6b5a44';
      c.fillRect(0, h - 90, w, 90);                        // the floor
      if (variant === 0) {
        c.fillStyle = '#8a6647';
        c.fillRect(40, 210, w - 80, 44);                   // the counter
        c.fillStyle = '#5d4c38';
        c.fillRect(40, 254, w - 80, 60);
        c.fillStyle = '#3e352a';
        c.fillRect(70, 96, w - 140, 96);                   // the back shelf
        for (let k = 0; k < 7; k++) {
          c.fillStyle = ['#c9bfa6', '#a8907a', '#d8cbb0'][k % 3];
          c.fillRect(84 + k * 48, 108, 30, 34);
        }
        c.fillStyle = '#2f2a24';
        c.fillRect(84, 158, w - 168, 8);
      } else if (variant === 1) {
        for (const tx of [90, 300]) {
          c.fillStyle = '#8a6647';
          c.fillRect(tx, 232, 132, 20);
          c.fillStyle = '#5d4c38';
          c.fillRect(tx + 56, 252, 20, 62);
          c.fillStyle = '#6f5943';
          c.fillRect(tx - 34, 240, 26, 76);
          c.fillRect(tx + 140, 240, 26, 76);
        }
        // the pendant, which is the one thing that says "evening" from outside
        c.fillStyle = '#3a332a';
        c.fillRect(246, 0, 6, 96);
        c.fillStyle = '#ffd79a';
        c.beginPath();
        c.moveTo(210, 148);
        c.lineTo(288, 148);
        c.lineTo(266, 96);
        c.lineTo(232, 96);
        c.closePath();
        c.fill();
      } else {
        c.fillStyle = '#d8cbb0';
        c.fillRect(0, 150, w, 30);                         // the hatch
        c.fillStyle = '#3e352a';
        c.fillRect(0, 0, w, 150);
        c.fillStyle = '#9aa0ae';
        c.fillRect(60, 180, w - 120, 52);                  // stainless bench
        for (let k = 0; k < 4; k++) {
          c.fillStyle = '#c2bdc8';
          c.fillRect(84 + k * 96, 60, 54, 72);
        }
      }
      c.fillStyle = 'rgba(120, 104, 150, 0.24)';
      c.fillRect(0, 0, w, h);
    })
  );

/** The hire boats' number plates -- 一 to 五, on the transom. */
export const boatNumber = (n = 1) =>
  cached('boatNumber' + n, () =>
    make(128, 128, (c, w, h) => {
      c.fillStyle = '#f2eee2';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 8, PAL.blueDeep);
      rule(c, 0, h - 8, w, 8, PAL.blueDeep);
      centered(c, ['一', '二', '三', '四', '五', '六'][(n - 1) % 6], w / 2, h * 0.52, w - 30, 82, '#2a4f97');
    })
  );

/** 鳥類図鑑 -- the chart inside the hide, and the ecology board beside it. */
export const birdChart = (variant = 0) =>
  cached('birdChart' + variant, () =>
    make(512, 384, (c, w, h) => {
      c.fillStyle = '#fbfaf4';
      c.fillRect(0, 0, w, h);
      if (variant === 0) {
        rule(c, 0, 0, w, 22, PAL.leafDeep);
        centered(c, 'ひばり湖で見られる鳥', w / 2, 76, w - 60, 44, '#2f5b52', 'bold', 2);
        const rows = [
          ['かいつぶり', '一年中', 0x6e6a62], ['ばん', '春 ー 秋', 0x4b4757],
          ['こさぎ', '春 ー 秋', 0xe4dccc], ['かるがも', '一年中', 0x8a7f6a],
          ['かわせみ', '朝 ・ 夕', 0x2f7fd0], ['せきれい', '一年中', 0x9aa0ae],
        ];
        c.textBaseline = 'middle';
        rows.forEach(([nm, se, col], i) => {
          const y = 132 + i * 40;
          // a silhouette rather than a drawing: a body, a neck and a bill
          c.fillStyle = hex(col);
          c.beginPath();
          c.ellipse(70, y, 24, 12, 0, 0, Math.PI * 2);
          c.fill();
          c.fillRect(86, y - 16, 6, 14);
          c.beginPath();
          c.arc(92, y - 18, 8, 0, Math.PI * 2);
          c.fill();
          c.fillRect(99, y - 20, 12, 4);
          c.font = `600 26px ${JP_FONT}`;
          c.fillStyle = '#3f4658';
          c.textAlign = 'left';
          c.fillText(nm, 130, y);
          c.font = `500 22px ${JP_FONT}`;
          c.fillStyle = '#8f8b9a';
          c.textAlign = 'right';
          c.fillText(se, w - 40, y);
        });
      } else {
        rule(c, 0, 0, w, 22, PAL.teal);
        centered(c, '葦原のはたらき', w / 2, 76, w - 60, 44, '#2f5b52', 'bold', 2);
        c.font = `500 27px ${JP_FONT}`;
        c.fillStyle = '#5a5666';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        ['葦は水をきれいにします', '小さな魚と貝のすみかです',
          '鳥は そこで えさをとります', '刈った葦は 屋根や すだれに',
          '毎年 二月に 半分だけ刈ります'].forEach((r, i) => c.fillText(r, 42, 140 + i * 44));
        centered(c, 'ひばり台高校  生物部  観察記録より', w / 2, h - 34, w - 60, 23, '#8f8b9a', '600');
      }
    })
  );

/** The plates on the dam's own furniture: 余水吐, 取水施設, 底樋, 量水標. */
export const damPlate = (variant = 0) =>
  cached('damPlate' + variant, () =>
    make(512, 128, (c, w, h) => {
      const sets = [
        ['余水吐', 'SPILLWAY'], ['取水施設', 'INTAKE'], ['底樋', 'OUTLET'],
        ['量水標', 'GAUGE'], ['管理棟', 'CONTROL HUT'], ['放水路', 'OUTFALL CHANNEL'],
      ];
      const [t, s] = sets[variant % sets.length];
      c.fillStyle = '#e6e3e8';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 10, PAL.metalDark);
      centered(c, t, w * 0.42, h * 0.48, w * 0.5, 60, '#3f4658', 'bold', 6);
      c.font = `600 22px ${JP_FONT}`;
      c.fillStyle = '#8f8b9a';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(s, w * 0.7, h * 0.52);
    })
  );

export const maintGatePlate = () =>
  cached('maintGatePlate', () =>
    make(384, 288, (c, w, h) => {
      c.fillStyle = '#fdf9f0';
      c.fillRect(0, 0, w, h);
      rule(c, 0, 0, w, 26, PAL.yellow);
      rule(c, 0, h - 26, w, 26, PAL.yellow);
      centered(c, '保守用 通路', w / 2, 96, w - 56, 56, '#33303c', 'bold', 4);
      c.globalAlpha = 0.35;
      rule(c, 40, 132, w - 80, 3, '#8d8898');
      c.globalAlpha = 1;
      centered(c, '関係者以外', w / 2, 172, w - 70, 38, '#8a3b3b', 'bold', 3);
      centered(c, '立入禁止', w / 2, 214, w - 70, 38, '#8a3b3b', 'bold', 3);
      centered(c, 'ひばり電鉄  施設課', w / 2, 258, w - 60, 22, '#8a8696', '600');
    })
  );
