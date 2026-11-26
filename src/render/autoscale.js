/*
 * autoscale.js: Auto graphics' resolution, chosen from how this machine is
 * actually drawing, and the evidence for moving the preset.
 *
 * WHY THIS EXISTS. Until 2026-09-27 the preset was a guess from the GPU's
 * name, made once at boot (main.js, beside setGpuInfo): a software rasteriser
 * got Low, a name that looked integrated got Medium, everything else High.
 * Nothing measured whether the guess held, and the pacer written to hold 60
 * by scaling the buffer (pace.js, deleted on 2026-09-28) never reached a map.
 * bug-e82b8bb8 was a laptop on Low that could not be flown
 * for lag. So Auto now watches the frames and moves the one lever that costs
 * nothing to move, the resolution, and says when the preset itself should
 * move, which the shell does only between runs because a preset rebuilds the
 * world.
 *
 * THE LEVER is a factor on the Render scale slider, from FLOOR to 1: the same
 * path the slider takes (renderScaleOf and applyRenderScale in main.js). On
 * the race field it is the canvas's pixel ratio. The town's and a built
 * map's pipelines take it on their own targets (userScale there) and never
 * under their preset's minScale, 0.55, 0.85 and 1.0 of the CSS size on Low,
 * Medium and High. Until 2026-09-28 neither pipeline read the factor at all
 * (review finding F1). On every world, on Medium and High, the shell never
 * lets Auto take the picture under the rubric's 1,200,000 pixels
 * (prompts/bando-perf-loop.md, F4), so Auto cannot pace a 1080p picture into
 * 720p; Low is the one exception, the owner's decision of 2026-09-28
 * (autoMinPixels in quality.js, review finding F6). The floor is set from
 * main.js (autoFloorFor, asking a pipeline's autoFloor where there is one),
 * so Auto counts its time at the floor where the floor really is.
 *
 * THE SIGNALS, per frame, allocation free:
 *   dt       the frame interval: is the page holding sixty
 *   gpuMs    from gpugate.js: how long the GPU takes over a frame, queue
 *            included. The one signal that sees a GPU saturated at vsync,
 *            where dt says 16.7 ms and the frames are late anyway
 *   render   and block: the F5 rule the old pacer had. A frame that is long
 *            because of the page's own script is not helped by fewer
 *            pixels, so a CPU bound frame does not drop the scale
 *
 * THE RULES, with the reasons in the numbers. Every time below is for a
 * 60 Hz target and scales with the target the caller passes, which is the
 * display's own period when that is slower than sixty (see THE TARGET in
 * latency.js): a Steam Deck at 40 Hz is on time at 25 ms, and measured
 * against sixty it used to be paced to the floor with the GPU idle.
 *   over budget  dt average over 18.5 ms (under about 54 fps) and not CPU
 *                bound, or the GPU over 90 percent of a 60 Hz frame. Half
 *                a second of it steps the scale down a tenth.
 *   headroom     dt average under 17.5 ms and the GPU under 55 percent of a
 *                frame. Three seconds of it steps the scale up a twentieth.
 *                Down fast and up slowly, so a pilot sees one change and not
 *                a shimmer. Without GPU timing (no fences) a 60 Hz display
 *                cannot show headroom at all, so it only climbs on a clearly
 *                faster display.
 *   a drop blocks climbing for ten seconds, so a change cannot ping pong.
 *   a change is followed by a cooldown, and the first frames after it are
 *                not believed: resizing the targets hitches, and a hitch
 *                read as load would drop the scale again (the old pacer
 *                had this right, and it is kept).
 *
 * THE PRESET. Three seconds over budget at the floor sets `demote`; forty
 * five seconds at full scale with the GPU under 45 percent sets `promote`.
 * main.js acts on them on the title, between runs: down a step each time the
 * evidence says so, because a machine the name guessed wrong may need two,
 * and up at most once a session and never in a session that came down, so
 * the preset cannot ping pong.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/* The lowest factor Auto will use, the Render scale slider's lowest step. */
export const AUTO_FLOOR = 0.55;
const STEP_DOWN = 0.1;
const STEP_UP = 0.05;
/* The target frame when the caller gives none, and the floor of any it
 * gives: the aim is sixty. The frame interval rules are the 60 Hz numbers
 * they were tuned at, as fractions of the target: 18.5, 17.5 and 14.5 ms,
 * and the F5 rule's 7 ms of render and 9 of shell. */
const FRAME_MS = 1000 / 60;
const OVER_DT = 18.5 / FRAME_MS;
const EASY_DT = 17.5 / FRAME_MS;
const FAST_DISPLAY_DT = 14.5 / FRAME_MS;
const CPU_RENDER = 7 / FRAME_MS;
const CPU_SHELL = 9 / FRAME_MS;
const OVER_GPU = 0.9;
const EASY_GPU = 0.55;
const PROMOTE_GPU = 0.45;
const OVER_HOLD_MS = 500;
const EASY_HOLD_MS = 3000;
const CLIMB_BLOCK_MS = 10000;
const DEMOTE_HOLD_MS = 3000;
const PROMOTE_HOLD_MS = 45000;
/*
 * Time after a change whose samples are not believed, and time after it
 * before another change. In milliseconds, not frames: counted in frames, a
 * machine at ten frames a second waited nine seconds between steps, measured
 * on 2026-09-27 under SwiftShader, which made the slowest machine the slowest
 * to be helped. The warm up is time for the same reason.
 */
const HITCH_MS = 200;
const COOL_MS = 1500;
const WARM_MS = 500;

export function createAutoScale() {
  const s = {
    scale: 1,
    want: 1,
    dirty: 0,
    floor: AUTO_FLOOR,
    dtEma: FRAME_MS,
    renderEma: 3,
    shellEma: 3,
    warmMs: 0,
    coolMs: 0,
    overMs: 0,
    easyMs: 0,
    climbBlockMs: 0,
    floorOverMs: 0,
    easyFullMs: 0,
    demote: false,
    promote: false,
    cpuBound: 0,
    changes: 0,
  };

  /*
   * One frame. dt is the capped frame interval, renderMs the part of the
   * frame callback inside the draw, blockMs the whole callback, gate the
   * gpugate state (or null), drew whether this frame drew the world at
   * all, and targetMs the frame to measure against (latency.js targetMs:
   * sixty, or the display's own period when it is slower). Returns nothing;
   * `dirty` and `want` say whether the caller should apply a new scale.
   *
   * The render and shell averages learn only from frames that drew. A frame
   * the GPU guard or the frame cap held back has a render time of nothing,
   * and fed to F5 that reads as "the page is the cost, not the pixels":
   * measured on 2026-09-27, it stopped the scale dropping on exactly the
   * saturated GPU the guard had just found.
   */
  function observe(dt, renderMs, blockMs, gate, drew, targetMs = FRAME_MS) {
    s.dirty = 0;
    const target = targetMs > FRAME_MS ? targetMs : FRAME_MS;
    if (!(dt > 0) || dt > 250) {
      return;
    }
    if (s.coolMs > COOL_MS - HITCH_MS) {
      s.coolMs -= dt;
      return;
    }
    s.dtEma += (dt - s.dtEma) * 0.1;
    if (drew) {
      s.renderEma += (renderMs - s.renderEma) * 0.1;
      s.shellEma += ((blockMs - renderMs) - s.shellEma) * 0.1;
    }
    if (s.warmMs < WARM_MS) {
      s.warmMs += dt;
      return;
    }
    /* Ten timed fences: the average moves a tenth a sample, so ten is
     * where it has left its first reading behind, and on a machine drawing
     * a few frames a second thirty took most of a minute. */
    const gpuKnown = Boolean(gate && gate.on && gate.samples >= 10);
    const gpuShare = gpuKnown ? gate.gpuMs / target : 0;
    /* F5: fewer pixels cannot buy back the page's own script. */
    s.cpuBound = s.renderEma < CPU_RENDER * target && s.shellEma > CPU_SHELL * target
      && s.dtEma > OVER_DT * target ? 1 : 0;
    const over = (s.dtEma > OVER_DT * target && !s.cpuBound) || (gpuKnown && gpuShare > OVER_GPU);
    const easy = s.dtEma < EASY_DT * target
      && (gpuKnown ? gpuShare < EASY_GPU : s.dtEma < FAST_DISPLAY_DT * target);
    s.overMs = over ? s.overMs + dt : 0;
    s.easyMs = easy ? s.easyMs + dt : 0;
    if (s.climbBlockMs > 0) {
      s.climbBlockMs -= dt;
    }
    /* The preset's evidence, gathered whatever the cooldown says. */
    s.floorOverMs = over && s.scale <= s.floor + 0.001 ? s.floorOverMs + dt : 0;
    s.easyFullMs = easy && s.scale >= 0.999 && gpuKnown && gpuShare < PROMOTE_GPU
      ? s.easyFullMs + dt : 0;
    if (s.floorOverMs >= DEMOTE_HOLD_MS) {
      s.demote = true;
    }
    if (s.easyFullMs >= PROMOTE_HOLD_MS) {
      s.promote = true;
    }
    if (s.coolMs > 0) {
      s.coolMs -= dt;
      return;
    }
    if (s.overMs >= OVER_HOLD_MS && s.scale > s.floor + 0.001) {
      const next = s.scale - STEP_DOWN;
      s.want = next < s.floor ? s.floor : next;
      s.dirty = 1;
      s.climbBlockMs = CLIMB_BLOCK_MS;
    } else if (s.easyMs >= EASY_HOLD_MS && s.scale < 0.999 && s.climbBlockMs <= 0) {
      const next = s.scale + STEP_UP;
      s.want = next > 1 ? 1 : next;
      s.dirty = 1;
    }
  }

  /*
   * HEADROOM ONLY: the one question Auto can still answer while the timer
   * paces Low, and the only way off Low there is.
   *
   * bug-3402c0cd, 2026-11-25, Brave on "Laptop and desktop with 5x series
   * GPUs": "Used to look amazing now very clearly grainy. Nothing has been
   * changed across my settings or computers." The report: Auto, on Low, at
   * full scale, the timer pacing at 123 frames a second, the GPU at 6.7 ms.
   * Frame pacing's Auto paces Low with the timer (pacingTimerOn in ui.js),
   * and Auto stood down for every frame the timer paced (main.js, THE LOOP
   * WITHOUT VSYNC), on the reasoning that there is no preset below Low to
   * move to. There is one above it. A promotion is the only way Auto leaves
   * a preset upward, its evidence is gathered in observe() and nowhere
   * else, and so a machine on Auto's Low stayed there for good: however it
   * got there (a session's demotions, or a boot on a software rasteriser,
   * whose guess sets Low and says a future round may raise it), and the
   * faster the machine the more surely, because the timer hands the frames
   * back to the display only when it cannot outdraw it.
   *
   * So while the timer paces Low this gathers the promote evidence, by the
   * rule observe() uses for it, and nothing else: forty five seconds of
   * frames under 17.5 ms at full scale with the GPU timed under 45 percent
   * of a sixty hertz frame. It moves no scale and never asks for a lower
   * preset, so a machine without that headroom, which is nearly every
   * machine on Low, flies exactly as it did. The timer's interval is shorter
   * than the display's, so the frame interval half of the rule is easier to
   * meet here than under the display; the GPU half is the same per frame,
   * timed queue included, and it is the half that decides. Fences or
   * nothing: with no GPU timing there is no promotion, as in observe().
   *
   * What happens next is the existing rule, unchanged: main.js moves the
   * preset up one step on the title, at most once a session and never in a
   * session that came down. Medium is paced by the display, where observe()
   * watches everything again, so a promotion this machine cannot hold comes
   * back down, and coming down from a preset Auto raised to sets the
   * ceiling, which stops it being tried again (autoPresetMove).
   */
  function observeHeadroom(dt, gate, targetMs = FRAME_MS) {
    s.dirty = 0;
    const target = targetMs > FRAME_MS ? targetMs : FRAME_MS;
    if (!(dt > 0) || dt > 250) {
      return;
    }
    s.dtEma += (dt - s.dtEma) * 0.1;
    if (s.warmMs < WARM_MS) {
      s.warmMs += dt;
      return;
    }
    const gpuKnown = Boolean(gate && gate.on && gate.samples >= 10);
    const gpuShare = gpuKnown ? gate.gpuMs / target : 0;
    const quiet = gpuKnown && s.dtEma < EASY_DT * target && gpuShare < PROMOTE_GPU;
    s.easyFullMs = quiet && s.scale >= 0.999 ? s.easyFullMs + dt : 0;
    if (s.easyFullMs >= PROMOTE_HOLD_MS) {
      s.promote = true;
    }
  }

  /* The caller applied `want`. */
  function applied(scale) {
    s.scale = scale;
    s.dirty = 0;
    s.coolMs = COOL_MS;
    s.overMs = 0;
    s.easyMs = 0;
    s.changes += 1;
    /*
     * Each ask for another preset holds only while its reason does: lower
     * while the scale sits at the floor and is still late, higher while it
     * sits at full with the GPU quiet. A scale that climbs off the floor has
     * found room, and one that comes down from full has found a load, so the
     * ask made before is withdrawn rather than acted on later, on the title,
     * about a world that is no longer the one in front of the pilot. Found in
     * the review of 2026-09-27 (F4), where a stale ask moved the preset the
     * pilot had just picked.
     */
    if (scale > s.floor + 0.001) {
      s.demote = false;
      s.floorOverMs = 0;
    }
    if (scale < 0.999) {
      s.promote = false;
      s.easyFullMs = 0;
    }
  }

  /* A new floor, from the caller: it depends on the preset and the window. */
  function setFloor(floor) {
    s.floor = floor > 1 ? 1 : (floor < AUTO_FLOOR ? AUTO_FLOOR : floor);
  }

  /* Auto turned on, a preset picked, a map swapped: the evidence starts
   * again. The scale stays where it is; main.js sets it back to full on the
   * same occasions (autoForget there). */
  function resetEvidence() {
    s.warmMs = 0;
    s.overMs = 0;
    s.easyMs = 0;
    s.floorOverMs = 0;
    s.easyFullMs = 0;
    s.demote = false;
    s.promote = false;
  }

  return { state: s, observe, observeHeadroom, applied, setFloor, resetEvidence };
}

/*
 * WHICH OF AUTO'S TWO WATCHES THIS FRAME GETS: 'all' (observe), 'headroom'
 * (observeHeadroom) or 'none'. A decision rather than a condition in
 * main.js, so it can be held in Node (scripts/autolow-check.js).
 *
 *   timer      whether the timer loop is pacing (main.js timerLoop)
 *   forced     whether the ?loop= address forced the loop for the session
 *   pacing     the Frame pacing row: 'auto', 'timer' or 'display'
 *   graphics   the normalised preset
 *   deviceLow  whether this device starts on Low by detection (a Steam
 *              Deck, a phone, an iPad: detectDefaultGraphics in quality.js)
 *
 * Under the display, everything, as always. Under the timer, the headroom
 * watch only where the timer is pacing BECAUSE the preset is Low: Frame
 * pacing on Auto, nothing forcing the loop, the preset Low. Not under Timer,
 * always, or ?loop=timer, which are a pilot's choice of loop: there Medium
 * would be timer paced too, observe() would stand down again, and a
 * promotion that machine could not hold would never come back down. And not
 * on a device whose own default is Low: that Low was chosen for the hardware
 * in hand before any frame was drawn ("the first flight has to hold frame
 * rate"), it is not a measurement that went wrong, and this change is not
 * the place to start promoting a Steam Deck. It flies as it did.
 */
export function autoWatch({ timer, forced, pacing, graphics, deviceLow }) {
  if (!timer) {
    return 'all';
  }
  if (forced || pacing === 'timer' || graphics !== 'low' || deviceLow) {
    return 'none';
  }
  return 'headroom';
}

/* The presets in the order Auto moves through them. */
export const AUTO_PRESETS = ['low', 'medium', 'high'];

/*
 * WHERE AUTO MOVES THE PRESET, as a decision rather than a side effect, so
 * the rules can be driven in Node (scripts/autoscale-selftest.js). main.js
 * applies it on the title, between runs (autoMovePreset). `graphics` is the
 * normalised preset, `raised` the preset Auto last promoted INTO (stored),
 * `ceiling` the highest Auto may promote to ('' for none, stored), `ask`
 * the controller's state and `session` whether this session has already
 * come down or gone up. Returns null, or what to store: the next preset,
 * which way, and the new raised and ceiling.
 *
 * Down a step whenever the evidence says so, because a machine the name
 * guessed wrong may need two. Coming down from a preset Auto itself had
 * promoted into sets the CEILING: that preset was tried on this machine and
 * did not hold. Without it, the next session's forty five quiet seconds
 * promoted it again, and it came down again, a world rebuild each way every
 * session (review finding F5, 2026-09-27). Coming down from a preset the
 * name guess chose sets none: the guess was wrong, not the preset tried.
 * Up one step, at most once a session, never in a session that came down,
 * and never above the ceiling.
 */
export function autoPresetMove(graphics, raised, ceiling, ask, session) {
  const at = AUTO_PRESETS.indexOf(graphics);
  if (at < 0 || !ask) {
    return null;
  }
  const top = AUTO_PRESETS.indexOf(ceiling || '');
  if (ask.demote && at > 0) {
    const next = AUTO_PRESETS[at - 1];
    const fromRaised = raised === graphics;
    return {
      next,
      way: 'down',
      raised: fromRaised ? '' : (raised || ''),
      ceiling: fromRaised ? next : (ceiling || ''),
    };
  }
  if (ask.promote && !session.demoted && !session.promoted
    && at < AUTO_PRESETS.length - 1 && (top < 0 || at + 1 <= top)) {
    const next = AUTO_PRESETS[at + 1];
    return { next, way: 'up', raised: next, ceiling: ceiling || '' };
  }
  return null;
}
