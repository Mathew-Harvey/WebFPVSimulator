/*
 * voice.js: the lap time, called out loud, the way a race timer calls it.
 *
 * The owner, 2026-09-26: "call lap times out loud". The timing system at a
 * club race speaks every lap as the pilot crosses the line, because a pilot
 * in goggles cannot read a screen. The flash in src/game/race.js is the
 * half of that a pilot can see, and this is the half they hear. It says
 * the same three things: the lap, the time and, when it is one, the record.
 *
 * THE BROWSER'S OWN VOICE. speechSynthesis ships in every browser the shell
 * runs in, so there is no dependency and no recorded audio to carry. It
 * does not pass through the Web Audio graph in audio.js, so it makes no
 * AudioNode, P12's count is untouched, and it ducks nothing. It follows the
 * Sound switch and the Volume level, which the shell hands in.
 *
 * NOT ON THE PHYSICS PATH. The shell calls it from the render loop after
 * the race has counted a lap on the simulation clock, and nothing comes
 * back. A browser with no voice, or one that refuses to speak, stays quiet:
 * every failure here is silence, never an exception.
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

/* Brisk, the way a timer reads, and not so fast that a hundredth is lost. */
const RATE = 1.1;

/*
 * What is said for a lap.
 *
 * The time is the flash's own arithmetic (fmt in src/game/race.js), so the
 * voice and the screen cannot disagree about a hundredth. Past a minute it
 * is said in words, "Lap 3, 1 minute 3.20", because "1:03.20" is a string
 * a speech engine is free to read as a time of day.
 */
export function lapCall(n, ms, record = false) {
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = (total - m * 60).toFixed(2);
  const time = m > 0 ? `${m} minute${m === 1 ? '' : 's'} ${s}` : s;
  return `Lap ${n}, ${time}${record ? '. New track record' : ''}`;
}

/*
 * Which installed voice reads it.
 *
 * English, because the words are. The pilot's own English first, so an
 * Australian machine says it in an Australian voice, and a voice on the
 * machine before one on the network: a network voice starts a few hundred
 * milliseconds late, and a call is worth most at the line. With no English
 * voice at all, the browser's default, which still reads the numbers. With
 * no voice at all, nothing: that is a headless browser, or one without
 * speech.
 */
export function pickVoice(voices, lang) {
  if (!voices || !voices.length) {
    return null;
  }
  const norm = (x) => String(x || '').toLowerCase().replace('_', '-');
  const want = norm(lang);
  const english = voices.filter((v) => /^en(-|$)/.test(norm(v.lang)));
  const same = (v) => norm(v.lang) === want;
  return english.find((v) => same(v) && v.localService)
    || english.find(same)
    || english.find((v) => v.localService)
    || english[0]
    || voices.find((v) => v.default)
    || voices[0];
}

export class LapVoice {
  /*
   * synth, Utterance and lang default to the browser's own. The node
   * selftest hands in stand-ins, which is the only way to check this
   * without a sound card.
   */
  constructor({
    synth = globalThis.speechSynthesis,
    Utterance = globalThis.SpeechSynthesisUtterance,
    lang = globalThis.navigator ? globalThis.navigator.language : '',
  } = {}) {
    const usable = synth && typeof synth.speak === 'function' && typeof Utterance === 'function';
    this.synth = usable ? synth : null;
    this.Utterance = Utterance;
    this.lang = lang || 'en';
    this.voice = null;
    /* The call being spoken, held so it cannot be collected halfway
     * through, which is how Chrome has been known to cut one off. */
    this.speaking = null;
    this.primed = false;
    if (this.synth) {
      /* Asking for the list is what makes Chrome load it, and the list
       * arrives later with voiceschanged, so the choice is made on both. */
      this.pick();
      try {
        this.synth.addEventListener('voiceschanged', () => this.pick());
      } catch (e) {
        /* An engine without the event: say() asks again. */
      }
    }
  }

  pick() {
    let voices = [];
    try {
      voices = this.synth.getVoices() || [];
    } catch (e) {
      voices = [];
    }
    this.voice = pickVoice(voices, this.lang);
    return this.voice;
  }

  /*
   * From the first key press or tap, INSIDE the gesture. iOS will not let a
   * page speak until it has spoken once from a gesture, and a lap is
   * crossed in the frame loop, which is not one. One silent, empty call
   * opens it for the page.
   */
  prime() {
    if (!this.synth || this.primed) {
      return;
    }
    this.primed = true;
    try {
      const u = new this.Utterance('');
      u.volume = 0;
      this.synth.speak(u);
    } catch (e) {
      /* Nothing to open. */
    }
  }

  /* Say it, at `volume` from 0 to 1. True when a call was handed over. */
  say(text, volume) {
    if (!this.synth || !(volume > 0)) {
      return false;
    }
    /* A page nobody has touched is refused by the browser, which writes a
     * console warning for every attempt, so it is asked first. */
    const nav = globalThis.navigator;
    if (nav && nav.userActivation && !nav.userActivation.hasBeenActive) {
      return false;
    }
    const voice = this.voice || this.pick();
    if (!voice) {
      return false;
    }
    try {
      /* A call still going is a lap old, and the pilot is already past it. */
      if (this.synth.speaking || this.synth.pending) {
        this.synth.cancel();
      }
      /* Chrome can leave the engine paused after the tab has been in the
       * background, and a paused engine queues calls and says none. */
      if (this.synth.paused) {
        this.synth.resume();
      }
      const u = new this.Utterance(text);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = RATE;
      u.volume = volume > 1 ? 1 : volume;
      const done = () => {
        if (this.speaking === u) {
          this.speaking = null;
        }
      };
      u.onend = done;
      u.onerror = done;
      this.speaking = u;
      this.synth.speak(u);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* Quiet now. A new run does not carry the last run's call into it. */
  stop() {
    this.speaking = null;
    if (!this.synth) {
      return;
    }
    try {
      if (this.synth.speaking || this.synth.pending) {
        this.synth.cancel();
      }
    } catch (e) {
      /* Nothing was speaking. */
    }
  }
}
