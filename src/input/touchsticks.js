/*
 * touchsticks.js: two thumbs on glass, flying the quad.
 *
 * A phone had no way to fly at all: the keyboard needs keys and a radio
 * needs a radio. This is the third stick source, virtual gimbals for the
 * thumbs in landscape, and it slots into InputManager UNDER a connected
 * radio and OVER the keyboard: plug a radio into a tablet and the radio
 * wins, exactly as it wins over the keys.
 *
 * RELATIVE FROM TOUCHDOWN, NEVER A JUMP. The thumb lands wherever it
 * lands, and that point is zero: deflection is the drag from there, full
 * deflection TRAVEL_FRACTION of the plate width. The alternative,
 * absolute mapping, spikes the channel to wherever the thumb happened to
 * hit, which on the throttle is a punch the pilot did not fly. Because
 * the mapping is relative, the whole lower corner of the screen is
 * catchment, not just the drawn plate: a thumb that grabs 40 px off the
 * gimbal still flies. Throttle runs on its own scale, one plate height
 * for the full sweep, a radio's ratio, and stays reachable whatever the
 * deflection travel is tuned to.
 *
 * THROTTLE IS STICKY, EVERYTHING ELSE SPRINGS. A radio's throttle stays
 * where the thumb left it and so does this one: lift the thumb and the
 * hover you trimmed is still trimmed. Yaw, roll and pitch run back to
 * centre at SPRING_RATE when released, a spring rather than a snap, so
 * the setpoint does not step and feedforward does not kick.
 *
 * The nub draws at the CHANNEL, not under the thumb. The thumb may be
 * anywhere in the catchment; the nub is the instrument, and an instrument
 * that showed the finger instead of the value would be decoration.
 *
 * TOUCH POINTERS ONLY. A touchscreen laptop keeps its mouse: pointer
 * events that are not touches fall through to nothing (the zones sit over
 * bare world), and the overlay only mounts at all on a device that
 * reports touch points. Menus never see these zones; the overlay is shown
 * in flight and hidden everywhere else by the shell.
 *
 * Channel signs are the keyboard's, which are the radio's: yaw and roll
 * positive rightward, throttle 0 at the bottom of the plate, and stick
 * forward is NEGATIVE pitch, the same sign the up arrow feeds and
 * placeSticks draws.
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

/* Released channels run back to centre at this rate, full scale per
 * second. 8 is about 125 ms from the stop, the pace of a real spring,
 * and slow enough that the D term sees a ramp rather than an edge. */
const SPRING_RATE = 8;

/*
 * Thumb travel for full deflection, as a fraction of the plate width.
 * It was one plate-half, 0.5, and the first phone pilot reported the
 * rates "way too fast": at that scale a 126 px plate put full stick 63 px
 * from touchdown, so a millimetre of thumb shake was tens of degrees a
 * second. 0.72 buys 44 percent more glass per degree without pushing the
 * stop out of a thumb's reach, and it works WITH the gentler touch rate
 * profile in configs/rates.js rather than instead of it: this constant
 * calibrates the transducer, the rates stay the pilot's and stay on the
 * Rates screen.
 */
const TRAVEL_FRACTION = 0.72;

/*
 * Whether this device wants thumb sticks at all. Touch points are the
 * signal: a phone and a tablet report them, a desktop does not, and a
 * touchscreen laptop reports them and ALSO keeps its keyboard, which
 * still works because the zones only answer to touch pointers.
 */
export function touchWanted() {
  try {
    return (navigator.maxTouchPoints || 0) > 0;
  } catch (e) {
    return false;
  }
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) {
    n.className = cls;
  }
  if (text != null) {
    n.textContent = text;
  }
  return n;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/* One plate, in the OSD gimbal's visual language, sized for a thumb. */
function makePlate(caption) {
  const zone = el('div', 'touch-zone');
  const plate = el('div', 'osd-gimbal-plate touch-plate');
  plate.append(el('div', 'osd-cross-x'), el('div', 'osd-cross-y'));
  const nub = el('div', 'osd-nub touch-nub');
  plate.append(nub);
  const wrap = el('div', 'touch-gimbal');
  wrap.append(plate, el('div', 'osd-gimbal-cap', caption));
  zone.append(wrap);
  return { zone, plate, nub };
}

export function mountTouchSticks({ onPause } = {}) {
  const root = el('div', 'touch-fly');
  root.hidden = true;

  const left = makePlate('yaw · throttle');
  left.zone.classList.add('touch-zone-left');
  const right = makePlate('roll · pitch');
  right.zone.classList.add('touch-zone-right');

  const pause = el('button', 'bug-chip touch-pause', 'Pause');
  pause.type = 'button';
  pause.addEventListener('click', () => {
    if (onPause) {
      onPause();
    }
  });

  const rotate = el('div', 'touch-rotate', 'Turn your phone sideways to fly');

  root.append(left.zone, right.zone, pause, rotate);

  /* The channel state. `springing` marks channels whose thumb has lifted
   * and which sample() is still walking back to centre. */
  const ch = {
    roll: 0, pitch: 0, yaw: 0, throttle: 0,
  };
  const grip = {
    left: null, /* { id, x, y, throttle } */
    right: null, /* { id, x, y } */
  };
  let visible = false;

  /* Full deflection is TRAVEL_FRACTION of the plate's width of thumb
   * travel, measured off the plate actually drawn so the feel follows
   * the size on this screen. The height is the throttle's own scale. */
  function travelOf(plate) {
    const r = plate.getBoundingClientRect();
    return {
      deflect: Math.max(40, r.width * TRAVEL_FRACTION),
      sweep: Math.max(60, r.height),
    };
  }

  function bindZone(side, stick) {
    const { zone, plate } = stick;
    zone.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || grip[side]) {
        return;
      }
      e.preventDefault();
      zone.setPointerCapture(e.pointerId);
      const t = travelOf(plate);
      grip[side] = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        throttle: ch.throttle,
        deflect: t.deflect,
        sweep: t.sweep,
      };
      plate.classList.add('is-held');
    });
    zone.addEventListener('pointermove', (e) => {
      const g = grip[side];
      if (!g || e.pointerId !== g.id) {
        return;
      }
      e.preventDefault();
      const dx = (e.clientX - g.x) / g.deflect;
      const dyPx = g.y - e.clientY;
      if (side === 'left') {
        ch.yaw = clamp(dx, -1, 1);
        /* One plate height is one full throttle sweep, a radio's ratio,
         * on its own scale so tuning the deflection travel cannot push
         * full throttle off the glass. */
        ch.throttle = clamp(g.throttle + dyPx / g.sweep, 0, 1);
      } else {
        ch.roll = clamp(dx, -1, 1);
        ch.pitch = clamp(-(dyPx / g.deflect), -1, 1);
      }
    });
    const drop = (e) => {
      const g = grip[side];
      if (!g || e.pointerId !== g.id) {
        return;
      }
      grip[side] = null;
      plate.classList.remove('is-held');
    };
    zone.addEventListener('pointerup', drop);
    zone.addEventListener('pointercancel', drop);
    /* A long press is a stick hold, not a text selection. */
    zone.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  bindZone('left', left);
  bindZone('right', right);

  function springToward(value, step) {
    if (value > 0) {
      return Math.max(0, value - step);
    }
    return Math.min(0, value + step);
  }

  return {
    root,

    /* The InputManager source contract: active() gates the poll branch,
     * sample(dtMs) advances the springs and returns the channels. The
     * throttle deliberately never springs; see the header. */
    active() {
      return visible;
    },
    sample(dtMs) {
      const step = SPRING_RATE * (Math.min(dtMs, 100) / 1000);
      if (!grip.left) {
        ch.yaw = springToward(ch.yaw, step);
      }
      if (!grip.right) {
        ch.roll = springToward(ch.roll, step);
        ch.pitch = springToward(ch.pitch, step);
      }
      return { ...ch };
    },

    /* Shown in flight, hidden everywhere else; the shell owns the call.
     * Hiding drops any held grip, because the pointer capture dies with
     * the layout and a grip that survived it would fly a stale thumb. */
    setVisible(on) {
      const want = Boolean(on);
      if (want === visible) {
        return;
      }
      visible = want;
      root.hidden = !want;
      if (!want) {
        grip.left = null;
        grip.right = null;
        left.plate.classList.remove('is-held');
        right.plate.classList.remove('is-held');
      }
    },

    /* Once per rendered frame, from the shell's loop, and only while
     * shown: the nubs draw the CHANNELS, springs included, in the same
     * mapping placeSticks uses for the keyboard ghost. */
    paint() {
      if (!visible) {
        return;
      }
      left.nub.style.left = `${50 + ch.yaw * 50}%`;
      left.nub.style.top = `${50 - (ch.throttle * 2 - 1) * 50}%`;
      right.nub.style.left = `${50 + ch.roll * 50}%`;
      right.nub.style.top = `${50 - (-ch.pitch) * 50}%`;
    },

    /* A fresh craft gets fresh sticks, throttle included: resetCraft
     * zeroes the keyboard for the same reason, and a crash recovery that
     * kept a sticky full throttle would relaunch the wreck by itself. */
    reset() {
      ch.roll = 0;
      ch.pitch = 0;
      ch.yaw = 0;
      ch.throttle = 0;
      grip.left = null;
      grip.right = null;
      left.plate.classList.remove('is-held');
      right.plate.classList.remove('is-held');
    },

    /* Harness window: what the overlay believes, for scripts/shots.js. */
    debug() {
      return {
        visible,
        channels: { ...ch },
        held: { left: Boolean(grip.left), right: Boolean(grip.right) },
      };
    },
  };
}
