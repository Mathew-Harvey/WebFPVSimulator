/*
 * togetherstyle.js: the look of flying together, injected once.
 *
 * The sheets are the game's manga magazine furniture: paper on ink, hard
 * drop shadows, halftone, lettered titles and pills, the same hand the map
 * picker and the career already use, so a room reads as part of the game
 * rather than a web page laid over it. Ported from the owner's approved
 * mockup of 25 October 2026 (project files multiplayer/mockup/style.css),
 * scoped under #tg so nothing here can reach the shell's own screens.
 *
 * It uses the page's tokens (--cream, --sakura, --amber, --mint, --slate,
 * --ink-line) with the mockup's values as fallbacks. The speech face is the
 * system's comic hand where there is one: no web font is fetched, because a
 * Steam build is offline and every byte a visitor downloads is paid for.
 *
 * SIZES are clamp()s so the same rules read on a phone, a Steam Deck's 1280
 * by 800 and a 4K monitor. Nothing here animates in flight but the dialogue
 * as a line arrives, and that is CSS on a few nodes.
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

export const TOGETHER_CSS = `
#tg {
  --cream: var(--page-cream, #f3ead4);
  --sakura: #e8a8b8;
  --amber: #ffd45c;
  --mint: #7dffb4;
  --slate: #9db3c8;
  --sky: #8fe0ff;
  --bail: #ff7d96;
  --ink: #0b1116;
  --paper: #f7f0dc;
  --paper-2: #efe5c9;
  --white: #fffaf0;
  --quiet: #5d6b78;
  --red: #c8423a;
  --ui: var(--ui-font, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif);
  --speech: "Comic Sans MS", "Chalkboard SE", "Comic Neue", var(--ui);
  position: fixed; inset: 0; z-index: 45; pointer-events: none;
  font: 14px/1.4 var(--ui); color: var(--cream);
}
#tg * { box-sizing: border-box; }
#tg button, #tg input { font: inherit; color: inherit; }
#tg button { cursor: pointer; }
#tg [hidden] { display: none !important; }
#tg .tg-layer { position: absolute; inset: 0; pointer-events: none; }
#tg .tg-modal { position: absolute; inset: 0; pointer-events: auto; }
#tg .tg-scrim { position: absolute; inset: 0; background: rgba(11, 17, 22, 0.8); }
#tg .tg-checker {
  position: absolute; left: 0; right: 0; top: 0; height: 12px; opacity: 0.8;
  background: repeating-linear-gradient(90deg, var(--cream) 0 12px, transparent 12px 24px);
}
#tg .tg-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* Paper, ink and the furniture on it */
#tg .halftone {
  background: radial-gradient(circle at 1px 1px, rgba(11, 17, 22, 0.13) 1px, transparent 1.3px) 0 0 / 6px 6px, var(--paper);
}
#tg .sheet { position: relative; color: var(--ink); border: 4px solid var(--ink); box-shadow: 10px 10px 0 var(--ink); }
#tg .sheet.sakura { box-shadow: 8px 8px 0 var(--sakura), 12px 12px 0 var(--ink); }
#tg .kicker {
  display: inline-block; padding: 3px 9px; background: var(--ink); color: var(--cream);
  font-size: 11px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;
}
#tg canvas.lettered { display: block; max-width: 100%; }
#tg .tg-title { display: block; margin-top: 4px; min-height: 30px; }
#tg .rule { height: 4px; background: var(--ink); position: relative; margin: 8px 0 22px; flex: none; }
#tg .rule::before {
  content: ""; position: absolute; left: 0; top: 4px; width: 180px; height: 8px; background: var(--sakura);
  border: 3px solid var(--ink); border-top: 0; transform: skewX(-30deg); transform-origin: 0 0;
}
#tg .tag {
  display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border: 2.5px solid var(--ink);
  font-size: 11px; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink);
  background: var(--mint); white-space: nowrap;
}
#tg .tag.sakura { background: var(--sakura); }
#tg .tag.amber { background: var(--amber); }
#tg .tag.slate { background: var(--slate); }
#tg .tag.paper { background: var(--paper); }
#tg .tag.ink { background: var(--ink); color: var(--cream); }

#tg .btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 10px;
  padding: 11px 20px; border: 3px solid var(--ink); background: var(--ink); color: var(--cream);
  font-weight: 900; font-style: italic; font-size: clamp(14px, 1.3vw, 17px); letter-spacing: 0.02em; text-transform: uppercase;
  box-shadow: 5px 5px 0 var(--sakura); transform: skewX(-6deg);
}
#tg .btn > * { transform: skewX(6deg); }
#tg .btn.ghost { background: var(--paper); color: var(--ink); box-shadow: 5px 5px 0 var(--ink); }
#tg .btn.amber { background: var(--amber); color: var(--ink); box-shadow: 5px 5px 0 var(--ink); }
#tg .btn.mint { background: var(--mint); color: var(--ink); box-shadow: 5px 5px 0 var(--ink); }
#tg .btn.sakura { background: var(--sakura); color: var(--ink); box-shadow: 5px 5px 0 var(--ink); }
#tg .btn.danger { background: var(--bail); color: var(--ink); box-shadow: 5px 5px 0 var(--ink); }
#tg .btn.small { padding: 7px 14px; font-size: 13px; box-shadow: 4px 4px 0 var(--ink); }
#tg .btn[disabled] { opacity: 0.45; cursor: default; }
/* A pointer gets the same answer a pad gets from the focus ring: the button
 * rises under it and goes down when pressed, the way a printed panel would
 * if it could. Transforms only, so nothing around it moves. */
@media (hover: hover) {
  #tg .btn:not([disabled]):hover { transform: skewX(-6deg) translate(-2px, -2px); }
  #tg .room:hover, #tg .part:hover, #tg .radio:hover, #tg .switch:not([aria-disabled="true"]):hover, #tg .mapcard.me-chip:hover { transform: translate(-2px, -2px); }
  #tg .pilot:is(button):hover { background: var(--paper-2); }
}
#tg .btn:not([disabled]):active { transform: skewX(-6deg) translate(3px, 3px); box-shadow: 1px 1px 0 var(--ink); }
#tg .room, #tg .part, #tg .radio, #tg .switch, #tg .mapcard { transition: transform 0.08s; }
#tg .link {
  background: none; border: 0; padding: 4px 2px; font-weight: 800; color: var(--ink);
  text-decoration: underline 3px var(--sakura); text-underline-offset: 4px;
}

/* Focus is drawn loud, because a radio or a pad has no pointer to tell the
 * pilot where they are. */
#tg :focus { outline: none; }
#tg :focus-visible {
  outline: 4px solid var(--amber) !important; outline-offset: 3px; position: relative; z-index: 2;
}
#tg .btn:focus-visible { transform: skewX(-6deg) translate(-2px, -2px); }

#tg .field { display: grid; gap: 6px; }
#tg .field > label, #tg .field > .lab {
  font-size: 12px; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink);
}
#tg .input {
  width: 100%; padding: 9px 12px; border: 3px solid var(--ink); background: var(--white); color: var(--ink);
  font-size: 16px; font-weight: 700;
}
#tg .input.bad { border-color: var(--red); background: #ffe9e6; }
#tg .help { font-size: 13px; color: var(--quiet); }
#tg .help.bad { color: var(--red); font-weight: 800; }

#tg .switch {
  display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%;
  padding: 7px 12px; border: 3px solid var(--ink); background: var(--white); color: var(--ink); text-align: left;
}
#tg .switch b { display: block; font-size: 15px; }
#tg .switch small { display: block; font-size: 12.5px; color: var(--quiet); font-weight: 600; }
#tg .switch .knob { flex: none; position: relative; width: 58px; height: 30px; border: 3px solid var(--ink); background: var(--slate); }
#tg .switch .knob::after {
  content: "OFF"; position: absolute; top: 1px; left: 2px; width: 26px; height: 22px; background: var(--paper);
  border: 2.5px solid var(--ink); font: 900 8px/18px var(--ui); text-align: center; transition: left 0.12s;
}
#tg .switch[aria-checked="true"] .knob { background: var(--mint); }
#tg .switch[aria-checked="true"] .knob::after { content: "ON"; left: 24px; }
#tg .switch[aria-disabled="true"] { opacity: 0.6; cursor: default; }
#tg .switch .why { display: block; font-size: 11.5px; color: var(--red); font-weight: 800; }

#tg .stepper { display: flex; align-items: center; border: 3px solid var(--ink); background: var(--white); color: var(--ink); max-width: 220px; }
#tg .stepper button { width: 42px; height: 40px; border: 0; background: var(--paper-2); font-size: 22px; font-weight: 900; color: var(--ink); }
#tg .stepper output { flex: 1; text-align: center; font-size: 20px; font-weight: 900; }

#tg .radios { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
#tg .radios.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
#tg .radio { padding: 10px 12px; border: 3px solid var(--ink); background: var(--white); color: var(--ink); text-align: left; }
#tg .radio b { display: block; font-size: 15px; }
#tg .radio small { color: var(--quiet); font-weight: 600; font-size: 12.5px; }
#tg .radio[aria-checked="true"] { background: var(--ink); color: var(--cream); box-shadow: 4px 4px 0 var(--sakura); }
#tg .radio[aria-checked="true"] small { color: var(--slate); }

#tg kbd {
  display: inline-block; min-width: 1.6em; padding: 0 5px; border: 2px solid currentColor; border-radius: 4px;
  font: 700 11px/1.5 var(--ui); text-align: center;
}

/* Pages: the lobby, the host sheet, the avatar, settings */
#tg .page {
  position: absolute; inset: clamp(14px, 3.4vh, 30px) clamp(12px, 3.4vw, 46px) clamp(36px, 6vh, 50px);
  padding: clamp(14px, 2vw, 22px) clamp(14px, 2.2vw, 28px); overflow: hidden; display: flex; flex-direction: column; max-width: 1400px;
  margin: 0 auto;
}
/* A page that holds a form or a short list is as tall as what is on it and
 * sits in the middle, with its buttons under its last field: a full screen
 * of paper with a button marooned in the corner reads as unfinished. The
 * Rooms shelf keeps the whole screen, because it is a list that grows. */
#tg .page.fit { height: fit-content; margin: auto; max-height: calc(100% - clamp(50px, 9.4vh, 80px)); }
#tg .page.narrow { max-width: 980px; }
#tg .page-head { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
#tg .page-head .grow { flex: 1; min-width: 0; }
#tg .page-body { flex: 1; min-height: 0; overflow: auto; padding: 4px 10px 10px 2px; }
#tg .tg-cols { display: grid; grid-template-columns: 1.05fr 1fr; gap: 26px; align-content: start; }
#tg .stack { display: grid; gap: 10px; align-content: start; min-width: 0; }
#tg .btnrow { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
#tg .footer-row { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; margin-top: 14px; flex: none; }
#tg .footer-row .note { font-size: 13px; color: var(--quiet); font-weight: 600; }
#tg .mapcard { display: flex; gap: 12px; align-items: center; padding: 10px; border: 3px solid var(--ink); background: var(--white); color: var(--ink); text-align: left; }
#tg .mapcard .pic { width: 118px; aspect-ratio: 16 / 9; flex: none; background: var(--paper-2) center / cover; border: 3px solid var(--ink); }
#tg .mapcard b { font-size: 17px; font-style: italic; display: block; }
#tg .mapcard small { display: block; color: var(--quiet); font-weight: 700; }

/* The lobby */
#tg .tools { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 10px 0 14px; }
#tg .codebox { display: flex; align-items: stretch; }
#tg .codebox .input { width: 160px; font-family: ui-monospace, Menlo, monospace; letter-spacing: 0.25em; text-transform: uppercase; }
#tg .codebox .btn { box-shadow: none; transform: none; }
#tg .codebox .btn > * { transform: none; }
#tg .me-chip { padding: 4px 12px 4px 4px; gap: 8px; cursor: pointer; }
#tg .tools .link { margin-left: auto; }
#tg .seg { display: flex; flex-wrap: wrap; gap: 10px; }
#tg .me-chip b { font-size: 14px; }
#tg .rooms { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 22px 20px; padding: 4px 12px 12px 4px; }
#tg .room {
  position: relative; display: flex; flex-direction: column; text-align: left; padding: 0; background: var(--paper);
  border: 4px solid var(--ink); box-shadow: 7px 7px 0 var(--ink); color: var(--ink);
}
#tg .room .pic { position: relative; aspect-ratio: 21 / 9; background: var(--paper-2) center / cover; border-bottom: 4px solid var(--ink); }
#tg .room .pic::after {
  content: ""; position: absolute; inset: 0;
  background: radial-gradient(circle at 1px 1px, rgba(11, 17, 22, 0.18) 1px, transparent 1.3px) 0 0 / 5px 5px;
}
#tg .room .count { position: absolute; right: 8px; bottom: 8px; z-index: 1; padding: 3px 9px; background: var(--ink); color: var(--cream); font-weight: 900; font-size: 13px; }
#tg .room .count.full { background: var(--bail); color: var(--ink); }
#tg .room .tg-lock { position: absolute; left: 8px; top: 8px; z-index: 1; padding: 2px 8px; background: var(--amber); border: 3px solid var(--ink); font-weight: 900; font-size: 11px; text-transform: uppercase; }
#tg .room .faces { position: absolute; left: 8px; bottom: 6px; z-index: 1; display: flex; }
#tg .room .faces .tg-face { margin-right: -9px; }
#tg .room .body { padding: 10px 12px 12px; display: grid; gap: 6px; }
#tg .room h4 { margin: 0; font-size: 17px; font-weight: 900; font-style: italic; line-height: 1.15; overflow-wrap: anywhere; }
#tg .room .map { font-size: 12.5px; font-weight: 700; color: var(--quiet); }
#tg .room .tags { display: flex; flex-wrap: wrap; gap: 5px; }
#tg .room.is-full { opacity: 0.72; }
#tg .empty { display: grid; place-items: center; text-align: center; color: var(--ink); padding: 20px; }
#tg .empty p { font-weight: 700; font-size: 16px; max-width: 540px; margin: 8px auto 14px; }
#tg .skeleton { background: linear-gradient(90deg, #e9dfc4 0 40%, #f7f0dc 50%, #e9dfc4 60%) 0 0 / 300% 100%; animation: tg-shimmer 1.4s linear infinite; min-height: 150px; border: 4px solid var(--ink); }
@keyframes tg-shimmer { to { background-position: -150% 0; } }

/* Faces */
#tg canvas.tg-face {
  display: inline-block; flex: none; border-radius: 50%; border: 3px solid var(--ink); background: var(--paper); vertical-align: middle;
}
#tg canvas.tg-bust { display: block; width: 100%; height: auto; }
#tg .crown { color: #b8860b; font-style: normal; }

/* The share sheet */
#tg .code-big { display: inline-flex; gap: 8px; margin: 4px 0 6px; flex-wrap: wrap; }
#tg .code-big span {
  width: clamp(40px, 4.6vw, 64px); height: clamp(52px, 5.8vw, 78px); display: grid; place-items: center; border: 4px solid var(--ink); background: var(--white);
  font: 900 clamp(28px, 3.2vw, 44px)/1 ui-monospace, Menlo, monospace; color: var(--ink); box-shadow: 4px 4px 0 var(--ink);
}
/* "!fly" before a stream name code: one wide box, the word in lower case
 * as it is typed. */
#tg .code-big span.word { width: auto; padding: 0 14px; font-size: clamp(22px, 2.4vw, 34px); background: var(--amber); }
#tg .copyrow { display: flex; align-items: stretch; }
#tg .copyrow .input { font-size: 14px; font-family: ui-monospace, Menlo, monospace; min-width: 0; }
#tg .copyrow .btn { transform: none; box-shadow: none; white-space: nowrap; }
#tg .copyrow .btn > * { transform: none; }
#tg .toast {
  position: absolute; left: 50%; bottom: 140px; transform: translateX(-50%); z-index: 20; padding: 10px 18px; max-width: calc(100% - 32px); text-align: center;
  background: var(--mint); color: var(--ink); border: 3px solid var(--ink); box-shadow: 5px 5px 0 var(--ink);
  font-weight: 900; font-style: italic; animation: tg-pop 0.25s ease-out; pointer-events: none;
}
#tg .toast.warn { background: var(--amber); }
#tg .toast.bad { background: var(--bail); }
@keyframes tg-pop { from { transform: translateX(-50%) scale(0.6); opacity: 0; } }

/* Cards in the middle: join, password, connecting, can't join */
#tg .card-mid {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 760px; max-width: calc(100% - 32px);
  max-height: calc(100% - 32px); overflow: auto; padding: clamp(16px, 2.4vw, 26px) clamp(16px, 2.6vw, 30px); display: grid; gap: 14px;
}
#tg .card-mid > .kicker, #tg .modal > .kicker { justify-self: start; }
#tg .state-row { display: grid; grid-template-columns: minmax(110px, 200px) 1fr; gap: 22px; align-items: center; }
#tg .say {
  position: relative; padding: 12px 16px; border: 3px solid var(--ink); background: #fff; color: var(--ink);
  border-radius: 22px; font: 700 clamp(15px, 1.5vw, 19px)/1.35 var(--speech);
}
#tg .say::before {
  content: ""; position: absolute; left: -22px; top: 26px; width: 22px; height: 18px; background: var(--ink);
  clip-path: polygon(100% 0, 0 60%, 100% 100%);
}
#tg .say::after {
  content: ""; position: absolute; left: -15px; top: 29px; width: 17px; height: 12px; background: #fff;
  clip-path: polygon(100% 0, 0 60%, 100% 100%);
}
/* In a room: the room's controls, a key or a way in on the left and what
 * it does on the right, one ruled line each like a page of a manual. */
#tg .teach { display: grid; border-top: 2px dashed rgba(11, 17, 22, 0.3); }
#tg .teach .tline {
  display: grid; grid-template-columns: minmax(150px, 38%) 1fr; gap: 14px; align-items: center;
  padding: 5px 2px; border-bottom: 2px dashed rgba(11, 17, 22, 0.3); color: var(--ink); font-weight: 700; font-size: 14.5px;
}
#tg .teach .k { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; font-weight: 900; }
#tg .teach kbd { font-size: 13px; min-width: 2em; background: var(--cream); border-color: var(--ink); }
#tg .pilots-mini { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
#tg .steps { display: grid; gap: 8px; margin: 4px 0; }
#tg .tg-step { display: flex; align-items: center; gap: 12px; font-weight: 800; color: var(--ink); font-size: 16px; }
#tg .tg-step i { width: 30px; height: 30px; flex: none; border: 3px solid var(--ink); display: grid; place-items: center; background: var(--white); font-style: normal; font-weight: 900; }
#tg .tg-step.done i { background: var(--mint); }
#tg .tg-step.now i { background: var(--amber); animation: tg-spin 1s linear infinite; }
#tg .tg-step.todo { opacity: 0.45; }
@keyframes tg-spin { to { transform: rotate(360deg); } }
#tg .shake { animation: tg-shake 0.4s; }
@keyframes tg-shake {
  20%, 60% { transform: translate(calc(-50% - 8px), -50%); }
  40%, 80% { transform: translate(calc(-50% + 8px), -50%); }
}

/* The avatar: the pilot's card, the first meeting's page and the look
 * editor. The card is a trading card in the pilot's livery, tilted a
 * degree like a card laid on a desk, on a burst of speed lines that turns
 * slowly, with a sheen that crosses it now and then and the pilot drawn
 * as a cut out, an ink line round them, breathing. A chosen part makes it
 * jump and sparkle. The editor around it is laid out as anime character
 * makers are: tabs with drawn icons, sections of large panels, and the
 * colours as swatches of paint under the parts they colour. */
#tg .av-stage { display: grid; grid-template-columns: minmax(200px, 280px) minmax(0, 1fr); gap: clamp(18px, 2.4vw, 32px); align-items: start; }
#tg .av-card {
  container-type: inline-size; position: relative; padding: 8px 8px 0; border: 4px solid var(--ink); background: var(--liv, var(--mint));
  box-shadow: 8px 8px 0 var(--ink); transform: rotate(-1.2deg); margin: 0 14px 8px 0;
}
#tg .av-card::before {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(circle at 1px 1px, rgba(11, 17, 22, 0.16) 1px, transparent 1.4px) 0 0 / 5px 5px;
}
#tg .av-card.is-pop { animation: av-pop 0.42s cubic-bezier(0.3, 1.7, 0.5, 1); }
/* Dealt: the card spins in face down and turns over, as a card game deals. */
#tg .av-card.is-dealt { animation: av-deal 0.62s cubic-bezier(0.2, 1.1, 0.4, 1) both; }
@keyframes av-deal {
  0% { transform: perspective(900px) translate(-40px, 30px) rotate(-14deg) rotateY(88deg); opacity: 0; }
  55% { transform: perspective(900px) translate(4px, -4px) rotate(1deg) rotateY(-8deg); opacity: 1; }
  100% { transform: perspective(900px) rotate(-1.2deg) rotateY(0deg); }
}
@keyframes av-pop {
  0% { transform: rotate(-1.2deg) scale(1); }
  35% { transform: rotate(-2.6deg) scale(1.045); }
  100% { transform: rotate(-1.2deg) scale(1); }
}
#tg .av-card-top {
  position: relative; display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 0 2px 7px;
  color: var(--liv-ink, var(--ink)); font: 900 clamp(8px, 4.6cqw, 11px)/1 var(--ui); letter-spacing: 0.14em; text-transform: uppercase; white-space: nowrap;
}
#tg .av-card-face { padding: 3px 8px; background: var(--ink); color: var(--cream); letter-spacing: 0.1em; }
#tg .av-card-pic {
  position: relative; overflow: hidden; border: 3px solid var(--ink); aspect-ratio: 4 / 5;
  background: radial-gradient(ellipse at 50% 38%, #fffdf6 0, color-mix(in srgb, var(--liv, var(--mint)) 34%, #fffdf6) 46%, color-mix(in srgb, var(--liv, var(--mint)) 78%, #fffdf6) 100%);
}
#tg .av-card-burst {
  position: absolute; left: -50%; top: -45%; width: 200%; height: 200%; pointer-events: none;
  background: repeating-conic-gradient(from 0deg at 50% 50%, rgba(255, 255, 255, 0.6) 0 3.5deg, transparent 3.5deg 10deg);
  animation: av-spin 90s linear infinite;
}
@keyframes av-spin { to { transform: rotate(360deg); } }
#tg .av-card-fig {
  position: absolute; left: 0; right: 0; bottom: 0; transform-origin: 50% 100%;
  animation: av-breathe 3.8s ease-in-out infinite;
}
@keyframes av-breathe {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-1.5%) scale(1.012); }
}
#tg .av-card-fig canvas {
  display: block; width: 100%; height: auto;
  filter: drop-shadow(2.5px 0 0 #fff) drop-shadow(-2.5px 0 0 #fff) drop-shadow(0 -2.5px 0 #fff) drop-shadow(3px 4px 0 rgba(11, 17, 22, 0.85));
}
#tg .av-card-sheen {
  position: absolute; inset: 0; pointer-events: none; mix-blend-mode: soft-light;
  background: linear-gradient(112deg, transparent 38%, rgba(255, 255, 255, 0.85) 48%, transparent 58%) 0 0 / 260% 100% no-repeat;
  animation: av-sheen 7s ease-in-out infinite;
}
@keyframes av-sheen {
  0%, 62% { background-position: 130% 0; }
  100% { background-position: -40% 0; }
}
#tg .av-card-spark { position: absolute; inset: 0; pointer-events: none; }
#tg .av-card-spark svg { width: 100%; height: 100%; display: block; }
#tg .av-card-spark path { transform-box: fill-box; transform-origin: center; animation: av-spark 0.62s ease-out both; }
#tg .av-card-spark path:nth-child(2) { animation-delay: 0.06s; }
#tg .av-card-spark path:nth-child(3) { animation-delay: 0.12s; }
#tg .av-card-spark path:nth-child(4) { animation-delay: 0.03s; }
@keyframes av-spark {
  0% { transform: scale(0) rotate(-30deg); opacity: 0; }
  40% { transform: scale(1.15) rotate(0deg); opacity: 1; }
  100% { transform: scale(0.6) rotate(20deg); opacity: 0; }
}
#tg .av-say {
  position: absolute; right: 8px; top: 10px; max-width: 70%; padding: 0.45em 0.85em; background: #fff; color: var(--ink);
  border: 3px solid var(--ink); border-radius: 50% / 46%; text-align: center; z-index: 2;
  font: 900 italic clamp(11px, 6.4cqw, 16px)/1.15 var(--ui);
}
#tg .av-card.is-pop .av-say { animation: av-say 0.3s cubic-bezier(0.3, 1.6, 0.5, 1); }
@keyframes av-say { from { transform: scale(0.6); } to { transform: scale(1); } }
#tg .av-say::after {
  content: ""; position: absolute; left: 16%; bottom: -14px; width: 18px; height: 16px; background: var(--ink);
  clip-path: polygon(0 0, 100% 0, 10% 100%);
}
#tg .av-say::before {
  content: ""; position: absolute; left: calc(16% + 3px); bottom: -9px; width: 12px; height: 11px; background: #fff; z-index: 1;
  clip-path: polygon(0 0, 100% 0, 10% 100%);
}
#tg .av-card-foot { position: relative; display: flex; align-items: center; min-height: clamp(34px, 21cqw, 50px); padding: 6px 25% 8px 2px; }
#tg .av-card-foot b, #tg .av-name {
  color: var(--liv-ink, var(--ink)); font: 900 italic clamp(9px, 8cqw, 26px)/1.05 var(--ui); text-transform: uppercase; overflow-wrap: anywhere;
}
#tg .av-name {
  width: 100%; min-width: 0; padding: 4px 6px; border: 0; border-bottom: 3px dashed color-mix(in srgb, var(--liv-ink, var(--ink)) 45%, transparent);
  background: transparent; outline: none; border-radius: 0;
}
#tg .av-name::placeholder { color: color-mix(in srgb, var(--liv-ink, var(--ink)) 45%, transparent); }
#tg .av-name:focus { background: rgba(255, 250, 240, 0.85); border-bottom: 3px solid var(--ink); color: var(--ink); }
#tg .av-name.bad { border-bottom: 3px solid var(--red); color: var(--red); }
/* A card dealt small (a phone held sideways) keeps its face's name and
 * drops the line it would push off the corner, and its name has the
 * foot's width. After the card's own rules, which it overrides. */
@container (max-width: 110px) {
  #tg .av-card-top > span:first-child { display: none; }
  #tg .av-card-top { justify-content: flex-end; }
  #tg .av-card-foot { padding-right: 6%; }
  #tg .av-name { padding-left: 1px; padding-right: 1px; letter-spacing: -0.02em; }
}
#tg .cr-name-help { margin: -4px 0 0; color: var(--red); font: 800 12px/1.3 var(--ui); }
#tg .cr-name-help[hidden] { display: none; }
#tg .av-card-quad { position: absolute; right: -6%; bottom: -16px; width: 38%; pointer-events: none; }
#tg .av-card-quad svg, #tg .part.liv svg { display: block; width: 100%; height: auto; }
#tg .exprs { display: flex; flex-wrap: wrap; gap: 8px; }
#tg .exprs button { padding: 3px 2px 2px; border: 3px solid var(--ink); background: var(--white); color: var(--ink); }
#tg .exprs canvas { margin: 0 auto; display: block; }
#tg .exprs button[aria-pressed="true"] { background: var(--amber); box-shadow: 3px 3px 0 var(--ink); }
#tg .exprs small { display: block; font-size: 10px; font-weight: 900; text-transform: uppercase; padding: 2px 2px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#tg .tabs { display: flex; flex-wrap: wrap; border-bottom: 4px solid var(--ink); }
#tg .tabs button {
  padding: 8px 14px; border: 3px solid var(--ink); border-bottom: 0; margin-right: -3px; background: var(--paper-2);
  color: var(--ink); font-weight: 900; text-transform: uppercase; font-size: 13px; letter-spacing: 0.05em;
}
#tg .tabs button[aria-selected="true"] { background: var(--ink); color: var(--cream); box-shadow: inset 0 -5px 0 var(--sakura); }

/* The editor's own page. */
#tg .creator { gap: 0; max-width: 1320px; }
#tg .cr-head { position: relative; flex: none; padding-bottom: 6px; border-bottom: 4px solid var(--ink); margin-bottom: 16px; }
#tg .cr-head::after {
  content: ""; position: absolute; left: 0; bottom: -12px; width: 170px; height: 8px; background: var(--sakura);
  border: 3px solid var(--ink); transform: skewX(-24deg); transform-origin: 0 0;
}
/* The card is as large as the height allows: the left column is a size
 * container, and the card, its tools and its faces are all as wide as the
 * card can be when they are stacked in it. */
#tg .cr-body {
  flex: 1; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr);
  grid-template-columns: clamp(220px, calc((100vh - 372px) * 0.72), 430px) minmax(0, 1fr); gap: clamp(20px, 2.6vw, 38px);
}
#tg .cr-left {
  --cw: min(100cqw - 16px, (100cqh - 156px) * 0.72);
  container-type: size; display: flex; flex-direction: column; align-items: flex-start; gap: 11px; min-width: 0; min-height: 0; padding-top: 4px;
}
#tg .cr-left .av-card { width: var(--cw); flex: none; }
#tg .cr-left .cr-tools, #tg .cr-left .cr-faces, #tg .cr-left .cr-name-help { width: calc(var(--cw) + 8px); }
#tg .cr-right { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
#tg .cr-tools { display: grid; grid-template-columns: minmax(0, 1fr) 44px 44px; gap: 8px; }
#tg .cr-tool {
  display: flex; align-items: center; justify-content: center; gap: 6px; height: 40px; padding: 0 6px;
  border: 3px solid var(--ink); background: var(--white); color: var(--ink); box-shadow: 3px 3px 0 var(--ink);
  font: 900 italic 13px/1 var(--ui); text-transform: uppercase; letter-spacing: 0.03em; transition: transform 0.08s;
}
#tg .cr-tool:not(:disabled):hover { transform: translate(-2px, -2px); box-shadow: 5px 5px 0 var(--ink); }
#tg .cr-tool:not(:disabled):active { transform: translate(1px, 1px); box-shadow: 1px 1px 0 var(--ink); }
#tg .cr-tool:disabled { opacity: 0.42; box-shadow: none; }
#tg .cr-tool.cr-reroll { background: var(--amber); }
#tg .tool-ico, #tg .tab-ico { display: inline-flex; flex: none; }
#tg .tool-ico svg { width: 22px; height: 22px; }
#tg .cr-tool.cr-reroll { font-size: 15px; letter-spacing: 0.06em; }
#tg .cr-tool.cr-reroll:not(:disabled):hover .tool-ico { animation: cr-roll 0.5s cubic-bezier(0.3, 1.5, 0.5, 1); }
@keyframes cr-roll { from { transform: rotate(-120deg) scale(0.8); } to { transform: none; } }
#tg .cr-faces { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 4px; }
#tg .cr-faces button {
  aspect-ratio: 1; padding: 0; overflow: hidden; border: 2.5px solid var(--ink); border-radius: 50%;
  background: var(--white); transition: transform 0.08s;
}
#tg .cr-faces button canvas { display: block; width: 100% !important; height: 100% !important; border: 0; border-radius: 0; }
#tg .cr-faces button:hover { transform: translateY(-2px); }
#tg .cr-faces button[aria-pressed="true"] { background: var(--amber); box-shadow: 0 0 0 3px var(--amber), 0 0 0 5.5px var(--ink); }
#tg .cr-tabs { display: flex; gap: 4px; padding: 0 4px; border-bottom: 4px solid var(--ink); flex: none; }
#tg .cr-tabs button {
  display: flex; align-items: center; gap: 8px; padding: 7px 15px 8px; border: 3px solid var(--ink); border-bottom: 0;
  background: var(--paper-2); color: var(--ink); font: 900 italic 14.5px/1 var(--ui); text-transform: uppercase; letter-spacing: 0.04em;
  transform: skewX(-7deg); transform-origin: 50% 100%; transition: transform 0.08s, background 0.08s;
}
#tg .cr-tabs button > * { transform: skewX(7deg); }
#tg .cr-tabs button:hover { background: var(--white); transform: skewX(-7deg) translateY(-2px); }
#tg .cr-tabs button[aria-selected="true"] { background: var(--ink); color: var(--cream); box-shadow: inset 0 -5px 0 var(--sakura); transform: skewX(-7deg) translateY(-3px); }
#tg .cr-tabs button[aria-selected="true"] .tab-ico { color: var(--amber); }
#tg .tab-ico svg { width: 24px; height: 24px; }
#tg .cr-panel { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 14px; padding: 14px 10px 10px 4px; }
#tg .cr-panel.is-new > * { animation: cr-in 0.24s cubic-bezier(0.2, 1, 0.4, 1) both; }
#tg .cr-panel.is-new > *:nth-child(2) { animation-delay: 0.04s; }
#tg .cr-panel.is-new > *:nth-child(3) { animation-delay: 0.08s; }
@keyframes cr-in { from { transform: translateX(18px); opacity: 0; } to { transform: none; opacity: 1; } }
#tg .cr-faces-lab { margin: 2px 0 -5px; color: var(--quiet); font: 900 10.5px/1 var(--ui); letter-spacing: 0.16em; text-transform: uppercase; }
#tg .cr-lab {
  display: flex; align-items: center; gap: 10px; margin: 0 0 9px;
  color: var(--ink); font: 900 12px/1 var(--ui); letter-spacing: 0.16em; text-transform: uppercase;
}
#tg .cr-lab::before { content: ""; width: 10px; height: 10px; background: var(--sakura); border: 2.5px solid var(--ink); transform: rotate(45deg); flex: none; }
#tg .cr-lab::after { content: ""; flex: 1; height: 3px; background: rgba(11, 17, 22, 0.14); }
/* A section's panels are all in one row when the panel is wide enough
 * for them at their smallest, each as wide as a row of them can be up to
 * the largest a panel is drawn, and wrap into more rows when it is not.
 * Never wider than the largest, so four face shapes are not four posters. */
#tg .creator .parts {
  --gap: 12px; display: grid; gap: var(--gap); padding: 0 0 4px; max-width: none;
  grid-template-columns: repeat(auto-fill, max(var(--tile), min(var(--most), (100% - (var(--n) - 1) * var(--gap)) / var(--n))));
  --tile: 80px; --most: 136px;
}
#tg .creator .parts:has(.crop-eyes) { --tile: 110px; --most: 160px; }
#tg .creator .parts.shapes { --most: 118px; }
#tg .creator .parts.small { --tile: 70px; --most: 96px; --gap: 10px; }
#tg .creator .parts.liveries { --tile: 92px; --most: 132px; }
#tg .editor .part { position: relative; display: flex; flex-direction: column; padding: 0; overflow: hidden; box-shadow: 3px 3px 0 var(--ink); }
#tg .editor .part-pic {
  display: block; aspect-ratio: 1;
  background: radial-gradient(circle at 1px 1px, rgba(11, 17, 22, 0.1) 1px, transparent 1.3px) 0 0 / 5px 5px,
    radial-gradient(ellipse at 50% 40%, #fffdf6 0, #f1e8d0 100%);
}
#tg .editor .part .part-pic canvas { display: block; width: 100% !important; height: 100% !important; }
#tg .editor .part small { padding: 4px 3px; background: var(--ink); color: var(--cream); font-size: 10.5px; letter-spacing: 0.05em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#tg .editor .parts.small .part small { font-size: 9.5px; padding: 3px 2px; }
#tg .editor .part { transition: transform 0.08s, box-shadow 0.08s; }
#tg .editor .part:not([aria-pressed="true"]):hover, #tg .editor .part:not([aria-pressed="true"]):focus-visible { transform: translate(-2px, -2px); box-shadow: 5px 5px 0 var(--ink); }
#tg .editor .part:not([aria-pressed="true"]):hover small { background: var(--sakura); color: var(--ink); }
#tg .editor .part[aria-pressed="true"] { background: var(--amber); box-shadow: 0 0 0 3px var(--amber), 6px 6px 0 3px var(--ink); transform: translate(-2px, -2px); z-index: 1; }
#tg .editor .part[aria-pressed="true"] .part-pic { background-color: #fff3c4; background-image: radial-gradient(circle at 1px 1px, rgba(11, 17, 22, 0.12) 1px, transparent 1.3px), radial-gradient(ellipse at 50% 40%, #fffbe6 0, #ffe7a0 100%); background-size: 5px 5px, auto; }
#tg .editor .part[aria-pressed="true"] small { background: var(--amber); color: var(--ink); }
#tg .editor .part[aria-pressed="true"]::after {
  content: "\\2713"; position: absolute; right: 4px; top: 4px; width: 22px; height: 22px; border-radius: 50%;
  background: var(--mint); border: 2.5px solid var(--ink); color: var(--ink); font: 900 13px/17px var(--ui); text-align: center;
}
#tg .editor .parts.small .part[aria-pressed="true"]::after { width: 18px; height: 18px; font-size: 11px; line-height: 13px; right: 3px; top: 3px; }
#tg .editor .part.liv { padding: 6px 4px; background: color-mix(in srgb, var(--sw) 28%, var(--white)); }
#tg .help.ink { color: var(--ink); font-weight: 700; max-width: 460px; margin: 12px 0 0; }
#tg .swatches { --sws: clamp(30px, 2.7vw, 40px); display: flex; flex-wrap: wrap; gap: 9px; padding: 4px 4px 6px; }
#tg .swatch {
  position: relative; width: var(--sws); height: var(--sws); border: 3px solid var(--ink); border-radius: 50%;
  background: radial-gradient(circle at 34% 30%, rgba(255, 255, 255, 0.55) 0 18%, transparent 19%), var(--sw, var(--paper));
  box-shadow: 2px 3px 0 var(--ink); transition: transform 0.08s;
}
#tg .swatch:hover { transform: translateY(-2px) scale(1.06); }
#tg .swatch[aria-pressed="true"] { transform: scale(1.12); box-shadow: 0 0 0 3px var(--paper), 0 0 0 6px var(--ink); }
#tg .swatch[aria-pressed="true"]::after {
  content: "\\2713"; position: absolute; left: 50%; top: 50%; width: 20px; height: 20px; margin: -10px 0 0 -10px; border-radius: 50%;
  background: var(--white); border: 2px solid var(--ink); color: var(--ink); font: 900 12px/16px var(--ui); text-align: center;
}
#tg .cr-foot { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex: none; margin-top: 12px; padding-top: 12px; border-top: 4px solid var(--ink); }
#tg .cr-foot .btn { min-width: 170px; }
#tg .cr-keys { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 18px; min-width: 0; color: var(--ink); font: 900 12px var(--ui); letter-spacing: 0.08em; text-transform: uppercase; }
#tg .cr-key { display: inline-flex; align-items: center; gap: 5px; }
#tg .cr-key span { margin-left: 3px; }
#tg .cr-keys kbd { min-width: 28px; padding: 4px 7px; border: 2.5px solid var(--ink); border-radius: 0; background: var(--white); color: var(--ink); box-shadow: 2px 2px 0 var(--ink); font: 900 12px/1.2 var(--ui); text-align: center; }
#tg .cr-keys .note { font-size: 13px; color: var(--quiet); font-weight: 700; text-transform: none; letter-spacing: 0; }
/* Tools too narrow for Random's name keep its dice. */
#tg .cr-tools { container-type: inline-size; }
@container (max-width: 214px) {
  #tg .cr-tool.cr-reroll > span:not(.tool-ico) { display: none; }
}
/* On a laptop or a desktop the faces run down the card's side, the strip
 * of a pilot's expressions that a manga character sheet draws, so each is
 * big enough to read at any height. Under the card, eight across, they
 * were dots on a 1280 by 720 screen. Track sizes are content sized because
 * the card's width is in the column's own container units, which the
 * column itself cannot use. */
@media (min-width: 641px) and (min-height: 521px) and (min-aspect-ratio: 801/1000) {
  #tg .cr-body { grid-template-columns: clamp(250px, calc((100vh - 300px) * 0.72), 500px) minmax(0, 1fr); }
  #tg .cr-left {
    --fs: clamp(28px, (100cqh - 106px) / 8 - 6px, 50px);
    --cw: min(100cqw - 26px - var(--fs), (100cqh - 64px) * 0.633);
    display: grid; grid-template-columns: max-content max-content; align-content: start; align-items: start; gap: 11px 10px;
  }
  #tg .cr-left .av-card { grid-area: 1 / 1; }
  #tg .cr-left .cr-faces { grid-area: 1 / 2; align-self: stretch; width: auto; display: flex; flex-direction: column; justify-content: space-between; gap: 4px; }
  #tg .cr-left .cr-faces button { width: var(--fs); flex: none; }
  #tg .cr-left .cr-tools, #tg .cr-left .cr-name-help { grid-column: 1 / -1; width: auto; }
  #tg .cr-left .cr-faces-lab { display: none; }
}
/* A tall screen (a 1080p desktop and up) has the height for larger
 * panels in even rows: four across, three for the eyes, each as large as
 * four rows allow, and no row is left with one panel in it. Packed as many
 * as fit, the right column at 1080p ran seven, seven and two, with half
 * the sheet empty under them. Gear's nineteen are five across, so they
 * are four rows too, and the fourteen liveries two rows of seven. */
@media (min-height: 960px) and (min-width: 641px) and (min-aspect-ratio: 801/1000) {
  #tg .creator .parts {
    --cols: 4; --fit: calc((100vh - 528px) / 4);
    grid-template-columns: repeat(var(--cols), min(var(--most), var(--fit), (100% - (var(--cols) - 1) * var(--gap)) / var(--cols)));
  }
  #tg .creator .parts:has(.crop-eyes) { --cols: 3; --fit: calc((100vh - 528px) / 2); }
  #tg .creator .parts.shapes, #tg .creator .parts.liveries { --most: 150px; }
  /* Five kinds of facial hair are one row of five, not four and one. */
  #tg .creator .parts.beards, #tg .creator .parts.gear { --cols: 5; }
  #tg .creator .parts.liveries { --cols: 7; }
}
/* A big screen (1440p at full size) has the sheet wider, the card and
 * its faces larger and the panels drawn larger, where every size above
 * stops growing and the sheet was a small page in the middle of it. */
@media (min-height: 1200px) and (min-width: 1600px) {
  #tg .creator { max-width: 1760px; }
  #tg .cr-body { grid-template-columns: clamp(250px, calc((100vh - 300px) * 0.72), 660px) minmax(0, 1fr); }
  #tg .cr-left { --fs: clamp(28px, (100cqh - 106px) / 8 - 6px, 66px); }
  #tg .creator .parts, #tg .creator .parts.shapes, #tg .creator .parts.liveries { --most: 200px; }
  #tg .creator .parts:has(.crop-eyes) { --most: 240px; }
  #tg .creator .parts.small { --most: 140px; }
  #tg .swatches { --sws: 48px; }
}
/* A short laptop screen draws the face shapes smaller so the face marks
 * under them are on the page and not below the fold. */
@media (max-height: 640px) and (min-width: 641px) {
  #tg .creator .parts.shapes { --most: 92px; }
  #tg .creator .parts.small { --most: 84px; }
  #tg .cr-head { margin-bottom: 10px; }
  #tg .cr-head canvas.lettered { height: 34px !important; width: auto !important; }
  #tg .cr-panel { gap: 10px; padding-top: 10px; }
}
#tg .cr-tabs { overflow-x: auto; scrollbar-width: none; }
#tg .cr-tabs::-webkit-scrollbar { display: none; }
#tg .cr-tabs button { flex: none; }
/* A phone held sideways: no room over the card for the title or under it
 * for the faces, so both go and the card has the height. */
@media (max-height: 520px) and (min-width: 600px) {
  #tg .creator { padding-top: 8px; padding-bottom: 8px; }
  #tg .creator .cr-head, #tg .creator .cr-faces, #tg .creator .cr-faces-lab { display: none; }
  #tg .cr-body { grid-template-columns: clamp(140px, calc((100vh - 150px) * 0.62), 260px) minmax(0, 1fr); gap: 18px; }
  #tg .cr-left { --cw: min(100cqw - 16px, (100cqh - 122px) * 0.78); gap: 9px; }
  #tg .cr-tools { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  #tg .cr-tool { height: 36px; }
  #tg .creator .parts { --most: 100px; }
  #tg .cr-tabs button { padding: 6px 11px 7px; font-size: 12.5px; }
  #tg .tab-ico svg { width: 19px; height: 19px; }
  #tg .cr-panel { padding-top: 10px; gap: 10px; }
  #tg .cr-foot { margin-top: 6px; padding-top: 6px; border-top-width: 3px; }
  #tg .cr-foot .btn { min-height: 0; padding-top: 7px; padding-bottom: 7px; }
}
/* A phone held upright, or a tablet: the card at the top, Random and the
 * faces beside it, and the tabs and their parts below, scrolling. A
 * screen taller than it is wide has no room for the card beside the parts. */
@media (max-width: 640px), (max-aspect-ratio: 4/5) {
  #tg .creator { padding-left: 12px; padding-right: 12px; }
  #tg .cr-head { margin-bottom: 12px; }
  #tg .cr-head canvas.lettered { height: 30px !important; width: auto !important; }
  #tg .cr-body { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); gap: 12px; }
  #tg .cr-left {
    --cw: min(max(150px, 30vw), 40vw, 300px); container-type: normal; display: grid; grid-template-columns: calc(var(--cw) + 14px) minmax(0, 1fr);
    grid-template-rows: auto auto auto 1fr; gap: 10px 10px; align-items: start;
  }
  #tg .cr-left .av-card { grid-row: 1 / 5; }
  #tg .cr-left .cr-tools, #tg .cr-left .cr-faces, #tg .cr-left .cr-faces-lab, #tg .cr-left .cr-name-help { width: auto; max-width: 340px; grid-column: 2; }
  #tg .cr-tools { grid-template-columns: 1fr 1fr; }
  #tg .cr-tool.cr-reroll { grid-column: 1 / 3; }
  #tg .cr-tool.cr-reroll > span:not(.tool-ico) { display: inline; }
  #tg .cr-faces { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  #tg .av-card-top { font-size: clamp(9px, 4.6cqw, 11px); letter-spacing: 0.1em; }
  #tg .cr-tabs { gap: 2px; padding: 0; }
  #tg .cr-tabs button { flex-direction: column; gap: 3px; padding: 6px 8px 6px; font-size: 10.5px; flex: 1 0 auto; }
  #tg .tab-ico svg { width: 20px; height: 20px; }
  #tg .cr-panel { padding: 10px 4px 8px 2px; gap: 12px; }
  #tg .creator .parts { --tile: 70px; --gap: 9px; }
  #tg .creator .parts.small { --tile: 62px; }
  #tg .cr-foot { margin-top: 8px; padding-top: 8px; }
  #tg .cr-foot .btn { min-width: 120px; }
  /* Three rows of key prompts would push the parts off a narrow window,
   * and the keys are the same keys a wide one prints. */
  #tg .cr-key { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  #tg .av-card-burst, #tg .av-card-fig, #tg .av-card-sheen, #tg .av-card.is-pop, #tg .av-card.is-dealt, #tg .av-card-spark path, #tg .av-say,
  #tg .cr-panel.is-new > * { animation: none !important; }
  #tg .av-card-spark { display: none; }
}

/* A code on its own page, and a room that has just opened. */
#tg .sheet.amber-edge { box-shadow: 8px 8px 0 var(--amber), 12px 12px 0 var(--ink); }
#tg .codebox.big .input { width: min(320px, 56vw); padding: 10px 16px; font-size: clamp(26px, 3vw, 38px); letter-spacing: 0.32em; }
#tg .codebox.big .btn { padding: 0 30px; font-size: clamp(17px, 1.6vw, 21px); }
#tg .open-stamp {
  align-self: center; padding: 6px 18px; background: var(--mint); color: var(--ink); border: 4px solid var(--ink);
  box-shadow: 5px 5px 0 var(--ink); font: 900 italic clamp(24px, 2.6vw, 34px)/1 var(--ui); letter-spacing: 0.08em;
  transform: rotate(-8deg);
}

/* Name plates, in the pilot's livery */
#tg .plate {
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 14px 4px 12px; background: var(--liv, var(--mint));
  border: 3px solid var(--ink); box-shadow: 3px 3px 0 var(--ink); color: var(--liv-ink, var(--ink)); font: 900 italic 16px/1.1 var(--ui);
  transform: skewX(-8deg); white-space: nowrap;
}
#tg .plate > * { transform: skewX(8deg); }

/* In flight: the room chip, banners, the dialogue. The room keeps to the
 * right hand column, under the shell's Report bug and Pause: the chip, and
 * under it the pilots, the pit and the standings. The top centre is the
 * shell's clock and the top left its music and score, and a chip at the
 * top centre sat on the lap time. While the shell's line before takeoff
 * reaches into the column, the column starts under it (measureLine). */
#tg .roomchip {
  position: absolute; right: 14px; top: var(--tg-chip-top, 92px); transition: top 0.18s ease; display: flex; align-items: center; gap: 8px;
  padding: 4px 10px 4px 4px; background: var(--paper); color: var(--ink); border: 3px solid var(--ink); box-shadow: 4px 4px 0 var(--ink);
  max-width: min(360px, 40vw);
}
/* The chip is the room's door in flight for a mouse or a thumb: a click
 * opens the room's page, where talk, the pilots and the race are. */
#tg .roomchip { pointer-events: auto; cursor: pointer; }
#tg .roomchip:hover { box-shadow: 4px 4px 0 var(--sakura); }
#tg .roomchip b { font-style: italic; font-size: 14px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#tg .roomchip small { display: block; font-size: 11px; font-weight: 800; color: var(--quiet); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#tg .roomchip .n { padding: 2px 7px; background: var(--ink); color: var(--cream); font-weight: 900; font-size: 13px; white-space: nowrap; }
#tg .bars { display: inline-flex; align-items: flex-end; gap: 2px; height: 16px; }
#tg .bars i { width: 4px; background: var(--mint); border: 1px solid var(--ink); }
#tg .bars i:nth-child(1) { height: 5px; } #tg .bars i:nth-child(2) { height: 9px; } #tg .bars i:nth-child(3) { height: 13px; } #tg .bars i:nth-child(4) { height: 16px; }
#tg .bars.mid i { background: var(--amber); } #tg .bars.mid i:nth-child(4) { background: #3a4552; }
#tg .bars.low i { background: var(--bail); } #tg .bars.low i:nth-child(n+3) { background: #3a4552; }

/* While a sheet is up the flight's panels wait under it. Only the toast
 * stays, because it is how a sheet says "Link copied". */
#tg.has-modal .tg-layer > :not(.tg-toasts) { visibility: hidden; }

/* Under the shell's clock, never on it: the lap time is the one number a
 * pilot reads while a banner is up. Not .banner: that is the shell's
 * own launch line, which index.html starts at opacity 0 and fades in by
 * hand, and a room banner wearing the name was drawn invisible. */
#tg .tg-banner {
  position: absolute; left: 50%; top: 104px; transform: translateX(-50%); display: flex; align-items: center; gap: 14px;
  padding: 10px 18px 10px 10px; background: var(--paper); border: 4px solid var(--ink); box-shadow: 7px 7px 0 var(--ink);
  color: var(--ink); animation: tg-drop 0.3s cubic-bezier(.2,1.4,.4,1); transition: top 0.18s ease;
  /* Clear of the room's right hand column (the chip, and under it the pit,
   * the standings or the pilots) on both sides, since it is centred. */
  width: max-content; max-width: min(760px, calc(100% - 2 * (min(360px, 40vw) + 28px)));
}
/* Centred on the page, it keeps a column's width clear on the left as well
 * as the right, which leaves a 1024 wide window 248 px for the words and an
 * 800 wide one 104. Below 1280 it is centred in the room left of the
 * column instead, which is all of the page it can use. */
@media (min-width: 761px) and (max-width: 1279px) {
  #tg .tg-banner { left: calc((100% - min(360px, 40vw) - 12px) / 2); max-width: min(760px, calc(100% - min(360px, 40vw) - 54px)); }
}
#tg .tg-banner > div { min-width: 0; }
#tg .tg-banner.mint { background: var(--mint); }
#tg .tg-banner b { font: 900 italic 18px var(--ui); display: block; }
#tg .tg-banner small { font-size: 14px; font-weight: 700; color: var(--quiet); }
@keyframes tg-drop { from { transform: translate(-50%, -30px); opacity: 0; } }
/* A banner that offers something takes a press: the callout's Watch. */
#tg .tg-banner.offers { pointer-events: auto; }
#tg .tg-banner.offers .btn { flex: none; }

/* Watching another pilot: who, and the way to another and back, across
 * the bottom middle, where the stick overlay is in flight. The shell puts
 * its own instruments and the hidden pause menu away while it is up
 * (.tg-watching in index.html). */
#tg .watchbar {
  position: absolute; left: 50%; bottom: calc(20px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); display: grid; justify-items: center; gap: 10px;
  width: max-content; max-width: calc(100% - 24px); pointer-events: auto; animation: tg-rise 0.3s cubic-bezier(.2,1.4,.4,1);
}
#tg .watchbar .wpanel {
  display: flex; align-items: center; gap: 12px; padding: 8px 10px; color: var(--ink);
  border: 4px solid var(--ink); box-shadow: 7px 7px 0 var(--ink);
}
#tg .watchbar .wface canvas { display: block; border: 3px solid var(--ink); background: var(--white); }
#tg .watchbar .wtext { display: grid; justify-items: start; gap: 5px; min-width: 0; max-width: min(300px, 50vw); }
#tg .watchbar .wtext .plate { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
#tg .watchbar .wtext small { font: 800 12px/1.25 var(--ui); color: var(--quiet); }
#tg .watchbar .wrow { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 10px 14px; }
#tg .watchbar .whint {
  padding: 4px 12px; border-radius: 14px; background: rgba(11, 17, 22, 0.82); color: var(--cream); font: 700 13px/1.3 var(--ui);
}
@keyframes tg-rise { from { transform: translate(-50%, 30px); opacity: 0; } }
/* A phone on its side: the bar in one line along the foot, the face a size
 * down and the words that say what it is gone, because the quad watched
 * rides a little under the middle of the picture and the two-line bar,
 * 150 px of a 390 px screen, was over it. The keys' hint goes too: the
 * first ride's banner says them. */
@media (max-height: 520px) {
  #tg .watchbar { bottom: calc(8px + env(safe-area-inset-bottom, 0px)); grid-auto-flow: column; align-items: center; gap: 10px; }
  #tg .watchbar .wpanel { gap: 8px; padding: 4px 6px; border-width: 3px; box-shadow: 4px 4px 0 var(--ink); }
  #tg .watchbar .wface canvas { width: 40px !important; height: 40px !important; border-width: 2px; }
  #tg .watchbar .wtext { gap: 2px; }
  #tg .watchbar .wtext .kicker, #tg .watchbar .whint { display: none; }
}

/* The overview: the whole field from a free camera, with the panels a
 * commentator calls a race from (the owner's ask of 28 October 2026). The
 * camera is the page's, so everything here but the buttons lets a drag
 * through to it. The flight's own race panels give way to the overview's
 * board, and the room chip goes up to the corner the shell's clock and
 * Pause have left, as they do while following. */
#tg .tg-layer.ov .standings, #tg .tg-layer.ov .pos, #tg .tg-layer.ov .pit, #tg .tg-layer.ov .watchbar { display: none; }
#tg .tg-layer.ov .roomchip { top: 14px; }
#tg .tg-layer.ovclean .roomchip { display: none; }
#tg .ovhud { position: absolute; inset: 0; pointer-events: none; color: var(--ink); }
#tg .ovhud button, #tg .ovhud tr { pointer-events: auto; }
#tg .ovtop { position: absolute; left: 16px; top: 14px; display: grid; gap: 6px; justify-items: start; max-width: calc(100% - 420px); }
#tg .ovtop .ovtitle { display: block; }
#tg .ovchips { display: flex; flex-wrap: wrap; gap: 6px; }
#tg .ovchip {
  display: inline-block; border: 2px solid var(--ink); background: var(--white); color: var(--ink); font: 800 11px/1 var(--ui);
  letter-spacing: 0.08em; text-transform: uppercase; padding: 5px 8px; white-space: nowrap;
}
#tg .ovchip.amber { background: var(--amber); }
#tg .ovchip.dark { background: var(--ink); color: var(--cream); }
#tg .ovboard {
  position: absolute; right: 16px; top: 86px; width: min(356px, 38vw); padding: 10px 12px 12px; border: 4px solid var(--ink);
  box-shadow: 7px 7px 0 var(--ink); max-height: calc(100% - 300px); overflow: auto; pointer-events: auto;
}
#tg .ovbhead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; gap: 10px; }
#tg .ovboard table { border-collapse: collapse; width: 100%; font: 700 13px/1 var(--ui); font-variant-numeric: tabular-nums; }
#tg .ovboard th { font: 800 9.5px/1 var(--ui); letter-spacing: 0.12em; color: var(--quiet); text-align: left; padding: 4px 4px 6px; border-bottom: 2px solid var(--ink); text-transform: uppercase; }
#tg .ovboard td { padding: 5px 4px; border-bottom: 1.5px dashed rgba(11, 17, 22, 0.25); white-space: nowrap; }
#tg .ovboard tr { cursor: pointer; }
#tg .ovboard tbody tr:hover td { background: rgba(255, 212, 92, 0.35); }
#tg .ovboard tr.sel td { background: var(--amber); }
#tg .ovboard td.p { font: 900 italic 17px/1 var(--ui); width: 22px; }
#tg .ovboard td.n { font: 800 italic 13.5px/1 var(--ui); max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
#tg .ovboard .r { text-align: right; }
#tg .ovboard .sw { display: inline-block; width: 6px; height: 22px; vertical-align: middle; margin-right: 6px; border: 1.5px solid var(--ink); }
#tg .ovboard .gap { color: var(--quiet); }
#tg .ovboard .best, #tg .ovstats .best { color: #0f8a52; font-weight: 900; }
#tg .ovmoments { position: absolute; left: 16px; top: 46%; display: grid; gap: 6px; }
#tg .ovmoments > div {
  display: flex; align-items: center; gap: 7px; padding: 4px 10px 4px 4px; background: rgba(247, 240, 220, 0.95); border: 2.5px solid var(--ink);
  font: 700 12px/1.2 var(--ui); box-shadow: 3px 3px 0 var(--ink); width: max-content; max-width: 40vw; animation: tg-slide 0.25s ease-out;
}
#tg .ovmoments > div b { font-style: italic; font-weight: 900; }
#tg .ovmoments > div.rec { background: var(--mint); }
#tg .ovmoments > div.bad { background: var(--bail); }
@keyframes tg-slide { from { transform: translateX(-20px); opacity: 0; } }
#tg .ovcard {
  position: absolute; left: 16px; bottom: 70px; padding: 10px 12px; display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; align-items: center;
  width: min(390px, 44vw); border: 4px solid var(--ink); box-shadow: 7px 7px 0 var(--ink);
}
#tg .ovcard .ovface canvas { display: block; }
#tg .ovcardr { display: grid; gap: 6px; min-width: 0; }
#tg .ovcardn { display: flex; align-items: center; gap: 8px; min-width: 0; }
#tg .ovcardn .plate { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
#tg .ovstats { display: flex; gap: 14px; font: 800 15px/1 var(--ui); font-variant-numeric: tabular-nums; flex-wrap: wrap; }
#tg .ovstats small { display: block; font: 800 9px/1 var(--ui); letter-spacing: 0.12em; color: var(--quiet); margin-bottom: 3px; text-transform: uppercase; }
#tg .ovacts { grid-column: 1 / -1; display: flex; gap: 12px; margin-top: 4px; }
#tg .ovstrip { position: absolute; left: 50%; bottom: 46px; transform: translateX(-50%); width: min(470px, 36vw); padding: 8px 14px 10px; border: 4px solid var(--ink); box-shadow: 7px 7px 0 var(--ink); }
#tg .ovstrip .lab { display: flex; justify-content: space-between; font: 800 9.5px/1 var(--ui); letter-spacing: 0.12em; color: var(--quiet); margin-bottom: 6px; text-transform: uppercase; }
#tg .ovstrip .line { position: relative; height: 30px; }
#tg .ovstrip .rail { position: absolute; left: 0; right: 0; top: 14px; height: 3px; background: var(--ink); }
#tg .ovstrip .tick { position: absolute; top: 10px; width: 2px; height: 11px; background: var(--ink); }
#tg .ovstrip .tick.big { height: 15px; top: 8px; width: 3px; }
#tg .ovstrip .dot { position: absolute; top: 4px; transform: translateX(-50%); width: 22px; height: 22px; border-radius: 50%; border: 2.5px solid var(--ink); font: 900 11px/17px var(--ui); text-align: center; color: var(--ink); transition: left 0.25s linear; }
#tg .ovstrip .dot.sel { outline: 3px solid var(--amber); outline-offset: 1px; }
#tg .ovhint {
  position: absolute; left: 50%; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); padding: 5px 14px; border-radius: 14px;
  background: rgba(11, 17, 22, 0.84); color: var(--cream); font: 700 12.5px/1.3 var(--ui); white-space: nowrap; max-width: calc(100% - 24px); overflow: hidden; text-overflow: ellipsis;
}
#tg .ovtouch { position: absolute; right: 16px; bottom: calc(46px + env(safe-area-inset-bottom, 0px)); display: flex; gap: 10px; }
#tg .ovhud.none .ovtouch, #tg .ovhud.strip .ovtouch { bottom: calc(14px + env(safe-area-inset-bottom, 0px)); }
#tg .ovhud.strip .ovtouch { bottom: 64px; }
/* The clean feed: one strip along the foot and nothing else, for a stream. */
#tg .ovfeed {
  position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center; gap: 14px; padding: 8px 16px; overflow: hidden;
  background: rgba(11, 17, 22, 0.86); color: var(--cream); font: 800 13px/1 var(--ui); white-space: nowrap; font-variant-numeric: tabular-nums;
}
#tg .ovfeed .lead { padding: 4px 8px; background: var(--amber); color: var(--ink); font-style: italic; text-transform: uppercase; }
#tg .ovfeed .cell { display: inline-flex; align-items: center; gap: 6px; }
#tg .ovfeed .cell b { color: var(--amber); font-style: italic; }
#tg .ovfeed .cell i { color: var(--slate); font-style: normal; }
#tg .ovfeed .sw { width: 9px; height: 9px; border: 1.5px solid var(--cream); }
#tg .ovkeys { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(860px, calc(100% - 32px)); max-height: calc(100% - 32px); overflow: auto; padding: 16px 20px; pointer-events: auto; }
#tg .ovkgrid { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 18px; margin: 10px 0; }
#tg .ovkcol { display: grid; gap: 5px; align-content: start; }
#tg .ovkcol .kicker { justify-self: start; margin-bottom: 4px; }
#tg .ovk { display: grid; grid-template-columns: 96px 1fr; gap: 8px; font: 600 13px/1.3 var(--ui); }
#tg .ovk b { font-weight: 900; }
@media (max-width: 760px), (max-height: 520px) {
  #tg .ovtop { max-width: calc(100% - 32px); }
  #tg .ovtop .ovtitle canvas { height: 28px !important; width: auto !important; }
  #tg .ovboard { top: auto; bottom: 64px; right: 12px; width: min(300px, 46vw); max-height: 46vh; }
  #tg .ovstrip, #tg .ovmoments, #tg .ovhint { display: none; }
  #tg .ovcard { bottom: 64px; left: 12px; width: min(300px, 46vw); padding: 6px 8px; }
  #tg .ovcard .ovface { display: none; }
  #tg .ovcard { grid-template-columns: 1fr; }
  #tg .ovtouch { right: 12px; bottom: 12px; }
  #tg .ovkgrid { grid-template-columns: 1fr; }
}

/* The comic dialogue: a portrait stands on a speech box, as in a visual
 * novel, so a quick line reads as a character speaking. Bottom left, clear
 * of the centre third. */
/* Above the pack's volts, which the flight's own HUD keeps in the bottom
 * left corner, and above the stick overlay, whose left gimbal the box's
 * end used to cover: a line said must never hide the battery or the
 * sticks. */
#tg .talk { position: absolute; left: 14px; bottom: 132px; width: min(470px, 46vw); height: 164px; }
#tg .talk .portrait { position: absolute; left: -4px; bottom: 0; width: min(140px, 15vw); z-index: 1; transform-origin: 50% 100%; }
#tg .talk .portrait canvas { filter: drop-shadow(4px 0 0 var(--ink)); }
#tg .talk .portrait.in { animation: tg-slidein 0.28s cubic-bezier(.2,1.4,.4,1); }
@keyframes tg-slidein { from { transform: translateX(-40px) scale(0.92); opacity: 0; } }
#tg .talk .box {
  position: absolute; left: min(60px, 6vw); right: 0; bottom: 0; min-height: 96px; padding: 26px 18px 12px min(98px, 10vw);
  background: var(--paper); border: 4px solid var(--ink); box-shadow: 6px 6px 0 var(--ink);
  color: var(--ink); font: 700 clamp(16px, 1.7vw, 22px)/1.25 var(--speech); overflow-wrap: anywhere;
}
#tg .talk .box::before { content: ""; position: absolute; inset: 5px; border: 2px solid rgba(11,17,22,.25); pointer-events: none; }
#tg .talk .plate { position: absolute; left: min(146px, 15vw); top: -18px; font-size: 15px; }
#tg .talk.fade { animation: tg-fadeout 1.2s forwards; }
@keyframes tg-fadeout { to { opacity: 0; } }
#tg .log { position: absolute; left: 14px; bottom: 310px; display: grid; gap: 6px; }
#tg .log .line {
  display: flex; align-items: center; gap: 8px; padding: 3px 12px 3px 3px; border-radius: 22px; width: max-content;
  max-width: min(440px, 44vw); background: rgba(247, 240, 220, 0.92); border: 2.5px solid var(--ink); color: var(--ink);
  font: 700 14px/1.2 var(--speech); animation: tg-fadeline 9s forwards;
}
#tg .log .line b { font: 900 italic 13px var(--ui); white-space: nowrap; }
/* Comings and goings are the room talking, not a pilot: ink, not paper. */
#tg .log .line.event { background: rgba(11, 17, 22, 0.82); color: var(--cream); font: 700 13px/1.2 var(--ui); }
#tg .log .line.event b { color: var(--cream); }
@keyframes tg-fadeline { 0%, 75% { opacity: 1; } 100% { opacity: 0; } }

/* The proximity hello: a burst over the dialogue. */
#tg .hello { position: absolute; left: min(290px, 30vw); bottom: 292px; width: 230px; height: 140px; animation: tg-burst 0.35s cubic-bezier(.2,1.6,.4,1); }
#tg .hello .burst, #tg .hello .burst-ink {
  position: absolute; inset: 0;
  clip-path: polygon(50% 0, 58% 22%, 78% 6%, 74% 30%, 100% 26%, 82% 46%, 100% 64%, 76% 66%, 84% 92%, 60% 76%, 50% 100%, 40% 76%, 16% 92%, 24% 66%, 0 64%, 18% 46%, 0 26%, 26% 30%, 22% 6%, 42% 22%);
}
#tg .hello .burst-ink { inset: -5px; background: var(--ink); }
#tg .hello .burst { background: var(--amber); }
#tg .hello .who { position: absolute; left: 22px; top: 18px; }
#tg .hello canvas.lettered { position: absolute; right: 10px; top: 30px; }
#tg .hello .plate { position: absolute; left: 50%; bottom: -14px; transform: translateX(-50%) skewX(-8deg); font-size: 13px; }
#tg .hello .queue { position: absolute; right: -6px; bottom: 4px; padding: 2px 7px; background: var(--ink); color: var(--cream); font-weight: 900; font-size: 12px; border-radius: 10px; }
@keyframes tg-burst { from { transform: scale(0.2) rotate(-14deg); opacity: 0; } }

/* Quick chat, a strip of lines */
/* Across the bottom, not centred on a point: a box hung from left: 50% may
 * only be half the screen wide, and seven lines wrapped to two rows. */
#tg .qbar { position: absolute; left: 12px; right: 12px; bottom: 16px; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; pointer-events: none; }
#tg .qbar button { pointer-events: auto; }
#tg .qbar button {
  position: relative; width: 92px; padding: 4px 4px 6px; background: var(--paper); border: 3.5px solid var(--ink);
  color: var(--ink); box-shadow: 4px 4px 0 var(--ink); text-align: center;
}
#tg .qbar button canvas { margin: 0 auto 2px; }
#tg .qbar button span { display: block; font: 900 italic 13px var(--ui); }
#tg .qbar button kbd { position: absolute; left: 4px; top: 3px; color: var(--quiet); }
#tg .qbar button.on, #tg .qbar button:focus-visible { background: var(--amber); transform: translateY(-8px); }

/* The pilots list, a glance */
#tg .roster {
  position: absolute; right: 14px; top: var(--tg-col-top, 154px); transition: top 0.18s ease; width: min(360px, 40vw); max-height: calc(100% - 136px - var(--tg-col-top, 154px)); overflow: auto; padding: 12px;
  background: var(--paper); border: 4px solid var(--ink); box-shadow: 8px 8px 0 var(--ink); color: var(--ink);
}
#tg .roster h5 { margin: 0 0 8px; display: flex; align-items: center; gap: 8px; }
#tg .pilot { display: grid; grid-template-columns: 38px 1fr auto auto; align-items: center; gap: 8px; padding: 5px 4px; border-top: 2px dashed rgba(11,17,22,.25); text-align: left; width: 100%; background: transparent; border-left: 0; border-right: 0; border-bottom: 0; color: var(--ink); }
#tg .pilot b { font: 900 italic 15px var(--ui); overflow-wrap: anywhere; }
#tg .pilot small { display: block; font-size: 11.5px; color: var(--quiet); font-weight: 700; }
#tg .pilot.me b { text-decoration: underline 3px var(--sakura); }
#tg .pilot.away { opacity: 0.6; }
#tg .pilot.open { background: var(--amber); }
#tg .pilot .chev { font: 900 20px/1 var(--ui); color: var(--quiet); transition: transform 0.12s; }
#tg .pilot.open .chev { transform: rotate(90deg); color: var(--ink); }
#tg .actions { display: flex; flex-wrap: wrap; gap: 8px; padding: 6px 0 8px 46px; }

/* The room page from the pause menu: the room's own rows and its pilots */
#tg .roomsheet { display: grid; grid-template-columns: minmax(220px, 300px) 1fr; gap: 24px; min-height: 0; flex: 1 1 auto; }
#tg .roomsheet .tg-menu { display: grid; gap: 12px; align-content: start; padding: 2px 8px 8px 2px; }
#tg .roomsheet .tg-menu .btn { justify-content: flex-start; width: 100%; }
#tg .roomsheet .tg-menu .btn small { margin-left: auto; font-size: 11px; font-style: normal; letter-spacing: 0.06em; opacity: 0.75; }
#tg .roomsheet .pane { min-height: 0; max-height: 100%; overflow: auto; border: 3px solid var(--ink); background: var(--white); padding: 8px 12px; align-self: start; }
#tg .infotags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
#tg .lab-h { font-weight: 900; text-transform: uppercase; font-size: 12px; letter-spacing: 0.1em; color: var(--ink); }

/* The conversation, parked. The game behind is put away entirely, so the
 * scene reads as a page of the comic and not as words over a menu. The
 * last line said is the big box; the lines before it run up the middle,
 * between the pilot spoken to and the pilot speaking. */
#tg .scene { position: absolute; inset: 0; pointer-events: auto; }
#tg .scene .shade {
  position: absolute; inset: 0;
  background: radial-gradient(circle at 1px 1px, rgba(243, 234, 212, 0.06) 1px, transparent 1.4px) 0 0 / 6px 6px, var(--ink);
}
#tg .scene .pl, #tg .scene .pr { position: absolute; bottom: 236px; width: min(300px, 24vw); transition: filter 0.2s, transform 0.2s; }
#tg .scene .pl { left: 4vw; }
#tg .scene .pr { right: 4vw; }
#tg .scene .pr canvas { transform: scaleX(-1); }
#tg .scene .pl canvas, #tg .scene .pr canvas { filter: drop-shadow(6px 0 0 var(--ink)); }
#tg .scene .dim { filter: brightness(0.62) saturate(0.55); transform: scale(0.94); transform-origin: 50% 100%; }
#tg .scene .who-tag { position: absolute; left: 8px; top: 8px; font-size: 14px; z-index: 1; }
#tg .scene .transcript {
  position: absolute; left: calc(4vw + min(300px, 24vw) + 18px); right: calc(4vw + min(300px, 24vw) + 18px); top: 56px; bottom: 300px;
  display: flex; flex-direction: column; justify-content: flex-end; gap: 8px; overflow: hidden;
}
#tg .scene .transcript .line {
  display: flex; align-items: center; gap: 8px; padding: 3px 12px 3px 3px; border-radius: 22px; max-width: 100%; width: max-content;
  background: var(--paper); border: 2.5px solid var(--ink); color: var(--ink); font: 700 14px/1.2 var(--speech);
}
#tg .scene .transcript .line.mine { align-self: flex-end; background: var(--white); }
#tg .scene .transcript .line b { font: 900 italic 13px var(--ui); white-space: nowrap; }
#tg .scene .transcript .line span { min-width: 0; overflow-wrap: anywhere; }
#tg .scene .bigbox {
  position: absolute; left: 4vw; right: 4vw; bottom: 140px; min-height: 120px; padding: 30px 30px 14px; background: var(--paper);
  border: 5px solid var(--ink); box-shadow: 8px 8px 0 var(--ink); color: var(--ink); font: 700 clamp(18px, 2.2vw, 28px)/1.3 var(--speech);
  overflow-wrap: anywhere;
}
#tg .scene .bigbox .plate { position: absolute; left: 26px; top: -22px; font-size: 18px; }
#tg .scene .bigbox .hint { display: block; margin-top: 6px; font: 700 14px var(--ui); color: var(--quiet); }
#tg .scene .scroll { max-height: 4.2em; overflow: auto; }
#tg .scene .saybar { position: absolute; left: 4vw; right: 4vw; bottom: 14px; display: grid; gap: 10px; justify-items: center; }
#tg .scene .quickrow { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
#tg .scene .typebox { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; align-items: center; padding: 6px 10px; box-shadow: 6px 6px 0 var(--sakura); }
#tg .scene .typebox .input { width: min(380px, 50vw); }
#tg .scene .typebox .facelab { font: 900 10px/1.2 var(--ui); text-transform: uppercase; letter-spacing: 0.06em; color: var(--quiet); width: 4.6em; }
#tg .scene .typebox .facebtn { padding: 2px 2px 1px; border: 3px solid var(--ink); background: var(--white); color: var(--ink); }
#tg .scene .typebox .facebtn small { display: block; font: 900 9px/1.1 var(--ui); text-transform: uppercase; text-align: center; }
#tg .scene .typebox .facebtn canvas { display: block; margin: 0 auto; }
#tg .scene .typebox .facebtn[aria-pressed="true"] { background: var(--amber); }

/* Racing */
/* The right hand panels sit under the flight's own Pause button, never on it. */
/* Both stop short of the speed and the stick overlay, a little over a
 * hundred pixels up from the bottom. */
#tg .pit { position: absolute; right: 14px; top: var(--tg-col-top, 154px); transition: top 0.18s ease; width: min(340px, 40vw); padding: 14px; color: var(--ink); pointer-events: auto; max-height: calc(100% - 136px - var(--tg-col-top, 154px)); overflow: auto; }
#tg .pit .pilot { grid-template-columns: 38px 1fr auto; }
#tg .hanko {
  display: inline-grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; border: 3px solid var(--red);
  color: var(--red); font: 900 9px/1 var(--ui); transform: rotate(-12deg); letter-spacing: 0.04em;
}
#tg .hanko.wait { border-color: var(--slate); color: var(--quiet); border-style: dashed; }
#tg .count-big { position: absolute; inset: 0; display: grid; place-items: center; }
#tg .count-big canvas { animation: tg-countin 0.95s ease-out forwards; }
#tg .count-big canvas.hold { animation: tg-countin-hold 0.3s ease-out forwards; }
@keyframes tg-countin-hold { from { transform: scale(2.4); opacity: 0; } }
@keyframes tg-countin { 0% { transform: scale(2.4); opacity: 0; } 25% { transform: scale(1); opacity: 1; } 85% { transform: scale(1); opacity: 1; } 100% { transform: scale(0.8); opacity: 0; } }
/* The host's move, asked across the middle of the screen (the owner's ask
 * of 2026-10-28). No scrim: the pilot is still flying under it, so the
 * panel is the only thing in the way and the world shows round it. Only
 * the panel takes presses, so a stick drag on a phone either side of it
 * still reaches the touch sticks. */
/* Centred in the band between the shell's launch line, which runs to about
 * 212 px from the top, and the stick and weight dials along the bottom. */
#tg .tg-vote { position: absolute; inset: 0; display: grid; place-items: center; padding: 222px 14px 132px; }
#tg .tg-vote .vsheet {
  pointer-events: auto; width: min(640px, 100%); padding: 14px 18px 0; display: grid; gap: 10px; justify-items: start;
  animation: tg-vote-in 0.32s cubic-bezier(.2,1.4,.4,1); overflow: hidden;
}
#tg .tg-vote .vrow { display: flex; gap: 14px; align-items: center; width: 100%; min-width: 0; }
#tg .tg-vote .vpic { flex: none; width: 150px; aspect-ratio: 16 / 10; max-width: 40%; border: 3px solid var(--ink); background: var(--slate) center / cover no-repeat; }
#tg .tg-vote .vwords { min-width: 0; display: grid; gap: 4px; }
#tg .tg-vote .vwords b { font: 900 italic 22px var(--ui); }
#tg .tg-vote .vwords span { font-weight: 700; font-size: 15px; }
#tg .tg-vote .btnrow { display: grid; grid-template-columns: 1fr 1fr; width: 100%; }
#tg .tg-vote .btnrow .btn { width: 100%; font-size: 20px; padding-block: 12px; }
#tg .tg-vote .vhow { font-size: 14px; font-weight: 700; color: var(--quiet); }
#tg .tg-vote .vbar { align-self: stretch; justify-self: stretch; height: 8px; margin: 0 -18px; background: var(--ink); }
#tg .tg-vote .vbar i { display: block; height: 100%; background: var(--amber); transform-origin: left; animation: tg-vote-bar linear forwards; }
@keyframes tg-vote-in { from { transform: scale(1.25); opacity: 0; } }
@keyframes tg-vote-bar { from { transform: scaleX(1); } to { transform: scaleX(0); } }
#tg .speedlines {
  position: absolute; inset: -20%; opacity: 0.45;
  background: repeating-conic-gradient(from 0deg at 50% 50%, rgba(11,17,22,0) 0 3deg, rgba(11,17,22,.55) 3deg 3.6deg, rgba(11,17,22,0) 3.6deg 8deg);
  -webkit-mask: radial-gradient(circle, transparent 30%, #000 60%); mask: radial-gradient(circle, transparent 30%, #000 60%);
}
/* Under the score and the track's name, which the flight keeps top left. */
#tg .pos { position: absolute; left: 14px; top: 132px; display: grid; gap: 6px; }
#tg .pos .big { font: 900 italic 50px/0.9 var(--ui); color: var(--amber); -webkit-text-stroke: 3px var(--ink); paint-order: stroke fill; }
#tg .pos .big small { font-size: 22px; }
#tg .split { padding: 4px 10px; border: 3px solid var(--ink); font: 900 15px var(--ui); color: var(--ink); background: var(--mint); width: max-content; }
#tg .standings { position: absolute; right: 14px; top: var(--tg-col-top, 154px); transition: top 0.18s ease; width: min(260px, 30vw); display: grid; gap: 4px; }
#tg .standings .r {
  display: grid; grid-template-columns: 22px 28px 1fr auto; align-items: center; gap: 6px; padding: 3px 8px 3px 4px;
  background: rgba(247,240,220,.92); border: 2.5px solid var(--ink); color: var(--ink); font-weight: 900; font-size: 13px;
}
#tg .standings .r.me { background: var(--amber); }
#tg .standings .r > * { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#tg .standings i { font-style: normal; font-variant-numeric: tabular-nums; }
#tg .standings .watch { padding: 3px 8px; background: var(--ink); border: 2.5px solid var(--ink); color: var(--cream); font: 900 12px var(--ui); text-align: right; }
#tg .resgrid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 24px; min-height: 0; align-items: start; }
#tg .resgrid .btnrow .btn { flex: none; }
#tg .podium { display: grid; grid-template-columns: 1fr 1.25fr 1fr; gap: 14px; align-items: end; min-height: 0; max-width: 720px; margin: 0 auto 6px; width: 100%; }
#tg .pod { position: relative; border: 4px solid var(--ink); background: var(--white); box-shadow: 6px 6px 0 var(--ink); overflow: hidden; display: flex; flex-direction: column; }
#tg .pod .art { position: relative; display: flex; align-items: flex-end; justify-content: center; background: repeating-conic-gradient(from 0deg at 50% 70%, rgba(11,17,22,.08) 0 3deg, transparent 3deg 9deg), var(--paper-2); }
#tg .pod.first .art { background: repeating-conic-gradient(from 0deg at 50% 70%, rgba(11,17,22,.12) 0 3deg, transparent 3deg 9deg), var(--amber); }
#tg .pod .art { height: 132px; }
#tg .pod.first .art { height: 168px; }
#tg .pod .art canvas { height: 100% !important; width: auto !important; }
#tg .pod.empty { visibility: hidden; }
#tg .pod .cap { padding: 6px 10px; border-top: 4px solid var(--ink); display: grid; gap: 1px; font-weight: 900; line-height: 1.15; overflow-wrap: anywhere; }
#tg .pod .cap span + span { font-variant-numeric: tabular-nums; color: var(--quiet); font-size: 13px; }
#tg .pod .place { position: absolute; left: 8px; top: 6px; font: 900 italic 40px/1 var(--ui); color: var(--cream); -webkit-text-stroke: 3px var(--ink); paint-order: stroke fill; z-index: 1; }
#tg .restable { width: 100%; border-collapse: collapse; color: var(--ink); font-size: 14px; }
#tg .restable td, #tg .restable th { padding: 5px 8px; border-bottom: 2px dashed rgba(11,17,22,.25); text-align: left; }
#tg .restable th { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; }
#tg .restable td.num { font-variant-numeric: tabular-nums; font-weight: 800; }
#tg .restable tr.me td { background: rgba(255, 212, 92, 0.45); }

/* Modals over a page */
#tg .modal-back { position: absolute; inset: 0; background: rgba(11,17,22,.6); display: grid; place-items: center; padding: 16px; }
#tg .modal { width: 560px; max-width: 100%; padding: 22px 26px; display: grid; gap: 14px; }
#tg .modal .state-row { grid-template-columns: 120px 1fr; }

/* A sheet arrives: a quick drop into place, never on a refresh of the same
 * sheet, and not at all for a pilot who asked for less motion. */
#tg .tg-enter > .page { animation: tg-sheetin 0.2s cubic-bezier(.2, 1.2, .4, 1); }
#tg .tg-enter > .card-mid { animation: tg-cardin 0.2s cubic-bezier(.2, 1.2, .4, 1); }
#tg .tg-enter > .modal-back > .modal { animation: tg-sheetin 0.18s cubic-bezier(.2, 1.2, .4, 1); }
#tg .tg-enter > .scene .pl { animation: tg-fromleft 0.28s cubic-bezier(.2, 1.2, .4, 1); }
#tg .tg-enter > .scene .pr { animation: tg-fromright 0.28s cubic-bezier(.2, 1.2, .4, 1); }
#tg .tg-enter > .scene .bigbox, #tg .tg-enter > .scene .saybar { animation: tg-fromdown 0.22s cubic-bezier(.2, 1.2, .4, 1); }
@keyframes tg-sheetin { from { opacity: 0; translate: 0 18px; scale: 0.98; } }
@keyframes tg-cardin { from { opacity: 0; scale: 0.94; } }
@keyframes tg-fromleft { from { opacity: 0; translate: -60px 0; } }
@keyframes tg-fromright { from { opacity: 0; translate: 60px 0; } }
@keyframes tg-fromdown { from { opacity: 0; translate: 0 30px; } }

/* The privacy page */
#tg .blk b { font: 900 italic 18px var(--ui); }
#tg .blk p { margin: 4px 0 0; font-size: 15px; font-weight: 600; }

/* The on screen keyboard, for a pad or a radio on the web */
#tg .osk {
  position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%); width: min(820px, calc(100% - 24px)); padding: 12px;
  display: grid; grid-template-columns: repeat(10, 1fr); gap: 6px; pointer-events: auto; z-index: 30;
}
#tg .osk button { padding: 9px 0; border: 3px solid var(--ink); background: var(--paper); color: var(--ink); font-weight: 900; }
#tg .osk button.wide { grid-column: span 2; }
#tg .osk button.go { background: var(--mint); }

@media (max-width: 760px) {
  #tg .tg-cols, #tg .av-stage, #tg .roomsheet, #tg .resgrid { grid-template-columns: minmax(0, 1fr); }
  #tg .state-row { grid-template-columns: 90px 1fr; gap: 14px; }
  #tg .radios { grid-template-columns: 1fr; }
  #tg .talk { width: calc(100% - 28px); height: 150px; bottom: 96px; }
  #tg .talk .portrait { width: 110px; }
  #tg .talk .box { left: 40px; padding-left: 84px; }
  #tg .talk .plate { left: 112px; }
  #tg .log { bottom: 258px; }
  #tg .hello { left: auto; right: 10px; bottom: 170px; transform: scale(0.8); }
  #tg .roster, #tg .pit, #tg .standings { width: calc(100% - 28px); }
  /* The column is the whole width here, so the banner takes it too, under
   * the chip. */
  #tg .tg-banner { max-width: calc(100% - 28px); top: 150px; }
  #tg .tg-vote { padding: 150px 14px 120px; }
  #tg .tg-vote .vpic { width: 96px; }
  #tg .tg-vote .vwords span { font-size: 13px; }
  #tg .scene .pl, #tg .scene .pr { width: 30vw; bottom: 250px; }
  #tg .scene .transcript { left: 4vw; right: 4vw; bottom: 330px; }
  #tg .podium { gap: 8px; }
  #tg .pod .art { height: 96px; }
  #tg .pod.first .art { height: 120px; }
}
/* Less motion: the arrivals, the spinner, the shake and the hover lift go.
 * The fades that time a line out stay, because they are how a line leaves. */
@media (prefers-reduced-motion: reduce) {
  #tg .tg-enter > *, #tg .tg-enter .modal, #tg .tg-enter .scene *, #tg .toast, #tg .tg-banner, #tg .hello, #tg .talk .portrait.in,
  #tg .tg-step.now i, #tg .shake, #tg .skeleton, #tg .count-big canvas, #tg .tg-vote .vsheet { animation: none !important; }
  #tg .btn, #tg .room, #tg .part, #tg .radio, #tg .switch, #tg .mapcard, #tg .pilot .chev, #tg .tg-banner,
  #tg .roomchip, #tg .roster, #tg .pit, #tg .standings { transition: none !important; }
}
@media (max-height: 800px) {
  #tg .page { padding-top: 12px; padding-bottom: 12px; }
  #tg .rule { margin: 4px 0 18px; }
  #tg .mapcard .pic { width: 96px; }
}
/* A netbook's 600 px: the spacing tightens, two spare hints go, and the
 * parts, the faces and the switches come down a size, so a sheet's last
 * row sits above its footer and not under it. */
@media (max-height: 660px) {
  #tg .page { padding-top: 8px; padding-bottom: 8px; }
  #tg .rule { margin: 2px 0 10px; }
  /* A hint a pilot can do without, given up before a field is. */
  #tg .help.spare { display: none; }
  #tg .part canvas { width: 54px !important; height: 54px !important; }
  #tg .parts { gap: 8px; padding-top: 8px; }
  #tg .exprs canvas { width: 28px !important; height: 28px !important; }
  #tg .stack { gap: 7px; }
  #tg .switch { padding: 4px 10px; }
  #tg .switch small { font-size: 11.5px; line-height: 1.25; }
  #tg .stepper button { height: 34px; }
  #tg .mapcard { padding: 6px 10px; }
  #tg .radio { padding: 6px 10px; }
  #tg .field { gap: 4px; }
}
@media (forced-colors: active) {
  #tg .sheet, #tg .btn, #tg .input, #tg .room { border-color: CanvasText; }
}
`;
