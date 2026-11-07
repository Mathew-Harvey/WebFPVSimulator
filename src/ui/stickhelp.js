/*
 * stickhelp.js: what the Stick help screen says, and where a stick that
 * does nothing is being lost.
 *
 * WHY THIS EXISTS. The owner, 28 September 2026: the board kept getting
 * tickets saying a controller could not yaw, or pitch, or throttle, and
 * nothing in any of them could say whether the pilot's radio was set up
 * wrong or the sim was. Read against the reports' own context, the answer
 * was mostly neither:
 *
 *   phones      nine tickets, every one about yaw or throttle. Chrome on
 *               Android hands a page four axes from a radio it does not
 *               recognise and drops the rest, and a radio in AETR order
 *               puts throttle and yaw on the two axes that compete for one
 *               of the four. No calibration anywhere can bring a dropped
 *               axis back. See fourAxisPad in src/input/input.js.
 *   Firefox     both Linux tickets. It calls an EdgeTX radio a gamepad and
 *               moves its axes. See firefoxRadio in src/input/input.js.
 *   desktops    mostly a radio flown on the built in guess of the channel
 *               order, which the wizard fixes in a minute.
 *   Safari      a radio never seen at all. Every WebKit ticket on the board
 *               reads the keyboard and 0 Hz, and the pilots who had a radio
 *               plugged in were told to swap cables. See radioBlind.
 *
 * So the screen does not start with instructions. It starts with the one
 * question that splits every cause into two piles, asked while the pilot's
 * hand is on the stick: move the stick that is not working, does any bar
 * move? If one does, the browser has it and the sim is reading it wrong,
 * and the wizard fixes that. If none does, the stick never reached the
 * browser, nothing in any page can fix it, and what can is the radio, the
 * operating system or the browser, which is what the block under the bars
 * says for the platform the pilot is on.
 *
 * Plain functions of plain data, so scripts/input-selftest.js can read every
 * sentence without a browser. The DOM is src/ui/ui.js's; the axes are
 * input.js's stickCheckView.
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
 * WHICH MACHINE THE PILOT IS HOLDING, as far as the advice cares.
 *
 * `env` is what the browser says about itself: userAgent, the User-Agent
 * Client Hints platform where there is one, maxTouchPoints, and whether the
 * primary pointer is coarse. Passed in rather than read here, so a test can
 * be any machine.
 *
 * THE PHONE THAT SAYS IT IS A LINUX DESKTOP. Chrome on Android asked for the
 * desktop site sends "X11; Linux x86_64", and four of the nine phone tickets
 * came that way; only their GPUs, Adreno and Mali, gave them away. A coarse
 * primary pointer is the tell available here: a Linux laptop with a touch
 * screen still points with its touchpad, a phone points with a finger.
 */
export function stickPlatform(env = {}) {
  const ua = String(env.userAgent || '');
  const p = String(env.uaPlatform || '');
  const touch = Number(env.maxTouchPoints) || 0;
  if (/android/i.test(p) || /Android/.test(ua)) {
    return 'android';
  }
  /* iPadOS asks for the desktop site by default and says Macintosh, with
   * touch points no Mac has. */
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch > 1)) {
    return 'ios';
  }
  if (/windows/i.test(p) || /Windows/.test(ua)) {
    return 'windows';
  }
  if (/chrome ?os/i.test(p) || /CrOS/.test(ua)) {
    return 'chromeos';
  }
  if (/mac/i.test(p) || /Macintosh|Mac OS X/.test(ua)) {
    return 'mac';
  }
  if (/linux/i.test(p) || /Linux/.test(ua)) {
    return env.coarse ? 'android' : 'linux';
  }
  return 'other';
}

/* Which browser, for the two whose own behaviour the advice names. */
export function stickBrowser(userAgent = '') {
  const ua = String(userAgent);
  if (/Firefox\//.test(ua)) {
    return 'firefox';
  }
  if (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua)) {
    return 'safari';
  }
  return 'chromium';
}

/*
 * A BROWSER THAT DOES NOT SHOW A RADIO TO A PAGE, and what to say when the
 * pilot has come here to fly with one.
 *
 * bug-616cc604, 29 September, Safari 27: a Radiomaster Pocket that neither a
 * MacBook Air nor an iPad showed to the sim, and "I've tried several USB-C to
 * USB-C cables and even my USB-C hub to a USB-A to USB-C cable". Everything
 * the sim said had sent them to do exactly that. "No radio or gamepad found.
 * Plug one in, set it to joystick mode" is right for a radio in the wrong
 * mode, and on Safari it sent a pilot off to swap cables that could not
 * matter. The title and the pause menu said nothing at all, because their
 * trouble rows only exist once a pad has reached the sim.
 *
 * WHAT IS KNOWN. Of the 200 tickets on the board that day, eight came from
 * WebKit: four Safari on a Mac and four on an iPhone or iPad, where every
 * browser is WebKit underneath. All eight read `source` the keyboard and
 * `padHz` 0. Three of the Mac ones were about a radio (bug-c3ecb273,
 * bug-7d3064fc, bug-616cc604, on Safari 26.5, 26.6.2 and 27.0) and so was
 * the iPad's bug-40980a75, and not one of the four was ever shown a pad. The
 * same board holds 22 tickets from Chrome and Firefox on Macs that flew a
 * pad or a radio. That evidence is one sided, since a pilot whose radio works
 * has no reason to file a ticket, but the flight feel tickets come from
 * exactly those pilots and none of them is a Safari radio.
 *
 * WHAT IS NOT. Why. On an iPhone or iPad the GameController framework is the
 * only source of pads and it lists the controllers Apple knows, which a USB
 * radio is not. On a Mac WebKit has a generic HID reader beside that one, so
 * "Safari only shows controllers it knows" is NOT a reason this file can give
 * for a Mac, and it does not. Nobody on this project has had a radio in
 * Safari to try. So the Mac words say what has been seen ("usually cannot")
 * and ask for the one test that settles it for the pilot in front of the
 * screen: the same radio, plugged in the same way, in Chrome, Edge or
 * Firefox. A report now carries what the browser listed (browserPads in
 * src/input/input.js), so the next Safari ticket says whether it listed
 * anything at all.
 *
 * One entry per surface, because the surfaces have different room: the
 * banner over a flight, the help column beside a menu row, a row of the
 * How to fly screen, the sentence under Stick help's bars, and its block for
 * when no bar moves. Null for every other browser, whose surfaces keep their
 * own words.
 */
const RADIO_TEST = 'Try Chrome, Edge or Firefox before anything else, with the radio plugged in and'
  + ' in joystick mode. If it shows up there, it was Safari.';

const RADIO_BLIND = {
  safari: {
    banner: 'Safari usually cannot see USB radios: try Chrome, Edge or Firefox.',
    note: 'Safari usually cannot see USB radios, so no cable, port or radio setting changes that.'
      + ' Open this page in Chrome, Edge or Firefox with the radio plugged in and in joystick mode.',
    howto: 'Safari usually cannot see USB radios. Open this page in Chrome, Edge or Firefox first,'
      + ' put the radio in joystick mode before loading it, then run Calibrate sticks in Settings.',
    say: 'Safari is not showing this page a radio or gamepad. It usually cannot see USB radios at all,'
      + ' and no cable, port or radio setting changes that: open this page in Chrome, Edge or Firefox'
      + ' instead. A game controller is shown once something on it moves.',
    lines: [
      'Safari usually does not show a USB radio to a web page at all, so changing the cable, the'
        + ` port or the hub is unlikely to help. ${RADIO_TEST}`,
    ],
  },
  ios: {
    banner: 'An iPhone or iPad usually cannot show a USB radio. Use a computer.',
    note: 'Every browser on an iPhone or iPad is Safari underneath, and it shows a page only the game'
      + ' controllers Apple knows. A USB radio is usually not one of them, so no cable, adapter or'
      + ' radio setting changes that. Use a computer with Chrome, Edge or Firefox.',
    howto: 'An iPhone or iPad usually cannot show a USB radio to any browser. Use a computer with'
      + ' Chrome, Edge or Firefox, put the radio in joystick mode before loading the page, then run'
      + ' Calibrate sticks in Settings.',
    say: 'This iPhone or iPad is not showing the page a radio or gamepad. A browser here shows only the'
      + ' game controllers Apple knows, and a USB radio is usually not one of them: use a computer with'
      + ' Chrome, Edge or Firefox.',
    lines: [
      'Every browser on an iPhone or iPad is Safari underneath, and Safari there shows a page only the'
        + ' game controllers it knows. A USB radio is usually not one of them, so no cable, adapter or'
        + ' radio setting changes it.',
      'A computer with Chrome, Edge or Firefox is the surest way to fly a radio. An Android phone can'
        + ' see one too, but Chrome there drops some of its axes.',
    ],
  },
};

export function radioBlind(platform, browser) {
  if (platform === 'ios') {
    return RADIO_BLIND.ios;
  }
  if (platform === 'mac' && browser === 'safari') {
    return RADIO_BLIND.safari;
  }
  return null;
}

/*
 * THE BANNER FOR A RADIO THAT IS NOT THERE, for the pilot who asked for one:
 * Choose joystick, Calibrate sticks, Check sticks, the restart switch. Two
 * lines, the way lostStickNotice is. `then` is what the ordinary advice ends
 * on: move the stick so the browser shows the pad, or reload after plugging
 * it in.
 */
export function noRadioNotice(platform, browser, then = 'move', unflyable = null) {
  /* Something IS plugged in, and the browser shows it without sticks: name
   * it, and the setting, rather than send the pilot to plug in what they
   * already have (bug-ca2e5b4b, unflyableNote above). */
  if (unflyable && unflyable.length) {
    const p = unflyable[0];
    const n = Number(p.axes) || 0;
    return `${p.name || 'Your joystick'} has ${n} ${n === 1 ? 'axis' : 'axes'} here, too few to fly.`
      + '\nOn EdgeTX, set USB joystick mode to Classic, then replug it.';
  }
  const blind = radioBlind(platform, browser);
  if (blind) {
    return `No radio or gamepad found.\n${blind.banner}`;
  }
  return then === 'reload'
    ? 'No radio or gamepad found.\nPlug one in, set it to joystick mode, and reload.'
    : 'No radio or gamepad found.\nPlug one in, set it to joystick mode, then move it.';
}

/*
 * A DEVICE THAT IS PLUGGED IN AND CANNOT FLY, said where its card would be.
 * `list` is input.js's unflyableGamepads: a name and an axis count each.
 *
 * bug-ca2e5b4b: a RadioMaster Boxer the browser listed with 0 axes and 2
 * buttons, which this page dropped without a word, so the pilot read it as
 * the sim not detecting the radio. A browser shows an EdgeTX radio's sticks
 * when the model's USB joystick is in Classic mode, eight axes; Advanced mode
 * shows only what the pilot set up there, and a model with no channel set to
 * an axis shows none. That is the one setting named, and it is named for
 * EdgeTX only, because that is where it is known to live. Empty string for an
 * empty list, so a caller can append it unconditionally.
 */
export function unflyableNote(list) {
  if (!list || !list.length) {
    return '';
  }
  const p = list[0];
  const n = Number(p.axes) || 0;
  const more = list.length > 1 ? `, and ${list.length - 1} more device${list.length > 2 ? 's' : ''},` : '';
  return `${p.name || 'A joystick'}${more} is plugged in, but this browser shows it with ${n}`
    + ` ${n === 1 ? 'axis' : 'axes'}, and flying needs four. On an EdgeTX radio, set the model's USB`
    + ' joystick mode to Classic, then unplug the radio and plug it in again.';
}

export function capital(word) {
  const w = String(word || '');
  return w ? w[0].toUpperCase() + w.slice(1) : w;
}

/* "yaw", "yaw and throttle", "roll, pitch and yaw". */
export function channelList(channels) {
  const c = (channels || []).slice();
  if (c.length <= 1) {
    return c[0] || '';
  }
  const last = c.pop();
  return `${c.join(', ')} and ${last}`;
}

/*
 * THE LINE A FLYING PILOT SEES, once per channel per page, in the banner:
 * short, because it is read over a moving picture, and it names the one
 * thing to do, because the pilot has both hands on a radio. See main.js,
 * noteLostSticks.
 */
export function lostStickNotice(channel) {
  return `${capital(channel)} is not reaching the sim.\nPause for Stick help.`;
}

/*
 * THE LIVE SENTENCE UNDER THE BARS: what the pilot's hand just did, read
 * for them. First match wins, and the order is the order of certainty: a
 * missing axis is a fact about the map, a stick moving that nothing reads
 * is a fact about this second, and everything after that is waiting for
 * the pilot to try.
 */
export function stickSay(view, platform = 'other', browser = '') {
  const v = view || {};
  if (!v.pad) {
    /* The browser listed a device and this page could not fly it: say which
     * and why, before any advice about plugging one in (bug-ca2e5b4b). */
    if (v.unflyable && v.unflyable.length) {
      return unflyableNote(v.unflyable);
    }
    /* Where nothing a pilot does with a stick or a cable can matter, saying
     * "move a stick" is the wrong answer: see radioBlind. */
    const blind = radioBlind(platform, browser);
    if (blind) {
      return blind.say;
    }
    return 'No radio or gamepad is reaching this browser yet. Plug it in, set it to joystick'
      + ' mode and move a stick: a browser shows a pad to a page only once something on it moves.';
  }
  const missing = v.missing || [];
  if (missing.length) {
    return `Your saved calibration reads ${channelList(missing)} from an axis this pad does not have,`
      + ` so ${missing.length > 1 ? 'they read' : 'it reads'} nothing. It has ${v.axisCount}.`
      + ' Calibrate sticks maps it again from what it actually sends.';
  }
  const m = v.moving;
  if (m && !m.channel) {
    const stick = (v.strays || []).includes(m.axis);
    return stick
      ? `Axis ${m.axis} is moving like a stick, and nothing in the sim reads it. The browser has your`
        + ' stick; the sim has it on the wrong channel. Calibrate sticks fixes that in about a minute.'
      : `Axis ${m.axis} is moving, and nothing in the sim reads it. If that is the stick that is not`
        + ' working, Calibrate sticks puts it on the right channel.';
  }
  if (m && m.channel) {
    return `That is ${m.channel}, on axis ${m.axis}, and it is reaching the sim.`;
  }
  const strays = v.strays || [];
  if (strays.length) {
    const which = strays.length > 1 ? `Axes ${channelList(strays.map(String))}` : `Axis ${strays[0]}`;
    return `${which} moved like a stick, and nothing in the sim reads ${strays.length > 1 ? 'them' : 'it'}.`
      + ' That is a stick on the wrong channel, and Calibrate sticks fixes it.';
  }
  const dead = v.dead || [];
  if (dead.length) {
    const where = platform === 'android' && v.fourAxes
      ? ' This phone is passing on four of your radio\'s axes, so if no bar moves, Chrome is dropping it.'
      : '';
    return `${capital(channelList(dead))} did not move once in flight. Move ${dead.length > 1 ? 'those sticks' : 'that stick'}`
      + ` now and watch the bars.${where}`;
  }
  return 'Move the stick that is not working, all the way to each end, and watch the bars.';
}

/*
 * THE RADIO'S HALF, which is the same on every machine: the mode it is in
 * and the model it is on. A model decides what each channel sends, and a
 * new or empty one can send nothing on a stick, which from here looks
 * exactly like a stick that is not there.
 */
const RADIO_LINE = 'On the radio: choose USB joystick mode as you plug it in, before opening this page,'
  + ' and check the model selected on it. The model decides what each channel sends, and a new or'
  + ' empty one can send nothing on a stick.';

/*
 * IF NO BAR MOVES, for the machine the pilot is on. Each is what can
 * actually be done there, in the order a pilot should try it, and says
 * plainly where this page can do nothing.
 *
 * THE ANDROID PARAGRAPHS ARE WORKED OUT FROM BOTH ENDS' CODE, NOT TRIED.
 *
 * Chrome's fallback for a pad it does not know (GamepadMappings.java,
 * UnknownGamepadMappings, the legacy branch: "only the canonical axes are
 * exposed ... and unmatched input axes are dropped") keeps X and Y, one of Z
 * and Rx, and one of Ry and Rz. EdgeTX in its ordinary joystick mode sends
 * channels 1 to 8 on X, Y, Z, Rx, Ry, Rz, Slider and Dial, in that order
 * (usb_driver.cpp fills axis i from channel i + 1), and OpenTX, which EdgeTX
 * came from, does the same. So a phone gets channels 1 and 2, one of 3 and
 * 4, and one of 5 and 6, and on an AETR radio that is one of throttle and yaw
 * gone. Five tickets on 29 and 30 September, five radios from three makers
 * (bug-8acd3b2f, bug-abaabdde, bug-b2de5239, bug-da8c8d0e, bug-f42ae325), all
 * arrived as 4 axes and 17 buttons with axis 2 resting at the throttle's end:
 * Z kept, Rx and yaw dropped.
 *
 * The fix this used to give was a computer, or EdgeTX's Advanced mode with
 * the four sticks on X, Y, Z and rotZ. That is right, and it is no help on
 * OpenTX, which has no such mode. Mixing the missing stick onto channels 5
 * AND 6 works on both, in the joystick mode they are already in: Chrome keeps
 * one of the two, so the stick arrives on it whichever that is, and on a
 * radio that lost yaw the four axes are then roll, pitch, throttle and yaw,
 * the order this page guesses. Nobody has flown it on a phone yet, so the
 * copy says so and asks to be told. A copy of the model, because channel 5
 * is often the arm switch on the model that flies a real quad. And CLEAR the
 * two channels rather than add to them: a line added under an arm switch's
 * line sums with it by default, and the stick would arrive offset by the
 * switch and clipped at one end.
 *
 * Chrome has a newer mapping behind a feature (ANDROID_UNKNOWN_GAMEPAD_EXTRA_
 * AXES, enabled by default in Chromium's main branch by November 2026) that
 * keeps the rest as extra axes. Under it a radio arrives with more than four
 * axes, fourAxisPad is false, none of this is shown, and input.js flies the
 * radio on the layout that mapping gives (androidExtraAxesPad). So updating
 * Chrome is the first thing to try, and the copy says so before the recipe.
 * Which stable release first carries it on by default was not found, so it
 * names Chrome Beta too rather than a version.
 */
export function platformHelp(platform, browser = 'chromium', facts = {}) {
  const four = facts.fourAxes ? ` Your radio is arriving as ${facts.axisCount || 4} axes.` : '';
  if (platform === 'android') {
    return {
      title: 'If no bar moves: Android',
      lines: [
        'Chrome on Android passes on only four of a radio\'s channels and drops the rest: channels'
          + ' 1 and 2, one of channels 3 and 4, and one of channels 5 and 6. Most radios send throttle'
          + ' on 3 and yaw on 4, so one of those two never arrives, most often yaw. Nothing in this'
          + ` page or any other can bring a dropped channel back, calibrating included.${four}`,
        'Try this first: update Chrome from the Play Store, or install Chrome Beta. Newer Chrome passes'
          + ' on every channel, and this page reads a radio laid out that way without any setup.',
        'The fix is on the radio. Make a copy of the model you fly the sim with, because the copy'
          + ' gives up its channels 5 and 6, which often carry the arm switch. In the copy, on the'
          + ' Mixes page, clear channels 5 and 6 and give each of them one line whose source is the'
          + ' stick that does not arrive: Rud for yaw, Thr for throttle. Chrome keeps one of those two'
          + ' channels, so the stick comes through on it. Then run Calibrate sticks.',
        'That should work on any EdgeTX or OpenTX radio, and nobody has confirmed it on a phone yet,'
          + ' so say whether it did with Report a bug from this screen. A radio whose channels cannot'
          + ' be changed, a DJI controller among them, needs a computer for now, which sees every axis.',
        RADIO_LINE,
      ],
    };
  }
  if (platform === 'windows') {
    return {
      title: 'If no bar moves: Windows',
      lines: [
        'Check whether Windows sees the stick: press Windows and R, type joy.cpl, press Enter, pick'
          + ' your radio and open Properties, then move it. If it moves there and not here, report a'
          + ' bug from this screen and say so.',
        'If it does not move there either, the radio is not sending it. Calibrating in that Windows'
          + ' window changes nothing a browser reads, so there is no need to.',
        RADIO_LINE,
      ],
    };
  }
  if (platform === 'mac') {
    const blind = radioBlind('mac', browser);
    return {
      title: 'If no bar moves: Mac',
      lines: [
        ...(blind ? blind.lines : []),
        'macOS has no stick test of its own, so these bars are the test. If a stick moves here in one'
          + ' browser and not in another, report a bug from this screen and say which.',
        RADIO_LINE,
      ],
    };
  }
  if (platform === 'linux') {
    return {
      title: 'If no bar moves: Linux',
      lines: [
        'jstest-gtk or evtest shows what the radio is sending. If the stick moves there and not'
          + ' here, report a bug from this screen and say so.',
        ...(browser === 'firefox'
          ? ['Firefox calls many radios a gamepad and moves their axes around. EdgeTX and OpenTX'
            + ' radios are read the way Firefox lays them out; for anything else, Calibrate sticks'
            + ' sorts it out, or try Chrome.']
          : []),
        RADIO_LINE,
      ],
    };
  }
  if (platform === 'ios') {
    return {
      title: 'If no bar moves: iPhone and iPad',
      lines: [
        ...radioBlind('ios', browser).lines,
        RADIO_LINE,
      ],
    };
  }
  return {
    title: 'If no bar moves',
    lines: [
      `Then the stick is not reaching this browser, and nothing in this page can change that.${four}`,
      RADIO_LINE,
    ],
  };
}
