/*
 * style.js: the career's stylesheet, injected once.
 *
 * Kept with the career rather than in index.html so the career is one folder
 * an upstream merge never touches. It uses the page's own tokens (--cream,
 * --sakura, --amber, --mint, --slate, --deep, --panel, --ink-line), so it
 * looks like the rest of the game and follows any change to them, with the
 * values as fallbacks for a page that has none.
 *
 * SIZES are clamp()s against the viewport so the same rules read on a Steam
 * Deck's 1280 by 800 and a 4K monitor. Nothing is smaller than 14 px.
 *
 * This file is part of WebFPV.
 *
 * WebFPV is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * WebFPV is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY, without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along
 * with WebFPV. If not, see <https://www.gnu.org/licenses/>.
 */

export const CAREER_CSS = `
#career {
  --c-cream: var(--cream, #f3ead4);
  --c-sakura: var(--sakura, #e8a8b8);
  --c-amber: var(--amber, #ffd45c);
  --c-mint: var(--mint, #7dffb4);
  --c-slate: var(--slate, #9db3c8);
  --c-deep: var(--deep, #141c16);
  --c-panel: var(--panel, #1a241c);
  --c-ink: var(--ink-line, #0b1116);
  --c-gold: #ffd45c;
  --c-silver: #d6dee6;
  --c-bronze: #d08a58;
  position: fixed;
  inset: 0;
  z-index: 40;
  pointer-events: none;
  font-family: var(--ui-font, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  color: var(--c-cream);
  font-variant-numeric: tabular-nums;
}
#career[hidden] { display: none; }
/* While a career screen is up, the game's own screens are under it and
   hidden, and so is the loading screen: the briefing says when the field is
   ready. The world keeps drawing behind the scrim. */
body.career-menu #ui { visibility: hidden; }
body.career-menu #loading { visibility: hidden; }
/* While a lesson flies, the game's own run clock gives way to the lesson's,
   the weight slider (a tuning control) is put away, and the freestyle score
   shows only in a lesson that scores. The volts, the speed, the mode, the
   height and the stick drawings stay: they are the pilot's instruments. */
body.career-flight #ui .osd-clock,
body.career-flight #ui .osd-air { visibility: hidden; }
body.career-flight:not(.career-score) #ui .score-total,
body.career-flight:not(.career-score) #ui .score-combo { visibility: hidden; }
#career .cr-screen { position: absolute; inset: 0; display: none; pointer-events: auto; }
#career[data-screen="hub"] .cr-hub,
#career[data-screen="briefing"] .cr-brief,
#career[data-screen="results"] .cr-results,
#career[data-screen="achievements"] .cr-ach { display: flex; }
#career[data-screen="flight"] .cr-hud { display: block; }
#career .cr-hud { position: absolute; inset: 0; display: none; pointer-events: none; }

/* The scrim that lets the live world show behind the menus and still lets
   type read: dark at the edges where the type is, lighter in the middle. */
#career .cr-scrim {
  position: absolute; inset: 0; pointer-events: none;
  background:
    linear-gradient(180deg, rgba(11,17,22,0.86) 0%, rgba(11,17,22,0.35) 32%, rgba(11,17,22,0.45) 62%, rgba(11,17,22,0.92) 100%),
    radial-gradient(120% 90% at 70% 40%, rgba(20,28,22,0) 0%, rgba(20,28,22,0.55) 100%);
}
#career[data-screen="flight"] .cr-scrim { display: none; }

#career .cr-title { position: relative; margin: 0; line-height: 1; }
#career .cr-title .cr-letters { display: block; }
#career .cr-title .cr-title-text { position: absolute; inset: 0; color: transparent; overflow: hidden; }
#career .cr-kicker {
  font-size: clamp(13px, 1.05vw, 16px); letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--c-slate); font-weight: 600;
}
#career .cr-tag {
  display: inline-block; padding: 3px 9px 2px; border-radius: 4px; font-size: clamp(12px, 0.95vw, 14px);
  letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700;
  border: 2px solid var(--c-ink); box-shadow: 2px 2px 0 var(--c-ink);
}
#career .cr-tag.angle { background: var(--c-mint); color: var(--c-ink); }
#career .cr-tag.acro { background: var(--c-sakura); color: var(--c-ink); }
#career .cr-icon { width: 100%; height: 100%; display: block; overflow: visible; }

/* ---------------- buttons ---------------- */
#career .cr-btn {
  font: inherit; font-size: clamp(15px, 1.2vw, 19px); font-weight: 700; letter-spacing: 0.04em;
  padding: 12px 22px; border-radius: 10px; cursor: pointer;
  background: var(--c-panel); color: var(--c-cream);
  border: 3px solid var(--c-ink); box-shadow: 3px 3px 0 var(--c-ink);
  display: inline-flex; align-items: center; gap: 10px;
  transition: transform 0.08s ease, background 0.12s ease;
}
#career .cr-btn .cr-key {
  font-size: 0.78em; padding: 1px 7px; border-radius: 5px; background: rgba(243,234,212,0.12);
  color: var(--c-slate); font-weight: 600;
}
#career .cr-btn.primary { background: var(--c-mint); color: var(--c-ink); }
#career .cr-btn.primary .cr-key { background: rgba(11,17,22,0.15); color: var(--c-ink); }
#career .cr-btn:disabled { opacity: 0.45; cursor: default; }
#career .cr-btn.is-focus, #career .cr-btn:focus-visible {
  outline: 3px solid var(--c-sakura); outline-offset: 3px; transform: translate(-1px,-1px);
  box-shadow: 4px 4px 0 var(--c-ink);
}

/* ---------------- the hub ---------------- */
#career .cr-hub { flex-direction: column; padding: clamp(18px, 3vh, 44px) clamp(20px, 3.4vw, 64px) 0; gap: clamp(8px, 1.6vh, 20px); overflow: hidden auto; }
/* Nothing in the column gives up its height: a short window scrolls the
   hub rather than squashing the chapter strip into a sliver. */
#career .cr-hub > * { flex-shrink: 0; }
#career .cr-hub-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; position: relative; }
#career .cr-hub-head .cr-sub { margin-top: 8px; color: var(--c-slate); font-size: clamp(14px, 1.15vw, 18px); max-width: 52ch; }
#career .cr-tally { display: flex; gap: clamp(10px, 1.2vw, 18px); align-items: center; }
#career .cr-tally-item { display: flex; align-items: center; gap: 6px; font-size: clamp(18px, 1.6vw, 26px); font-weight: 800; }
#career .cr-tally-item .cr-medal-box { width: clamp(28px, 2.4vw, 40px); height: clamp(28px, 2.4vw, 40px); }
#career .cr-tally-done { color: var(--c-slate); font-size: clamp(14px, 1.1vw, 17px); font-weight: 600; margin-left: 8px; }

#career .cr-chapters { display: flex; gap: 8px; overflow-x: auto; padding: 4px 4px 10px; scrollbar-width: none; position: relative; }
#career .cr-chapters::-webkit-scrollbar { display: none; }
#career .cr-chapters-wrap { position: relative; }
#career .cr-chapters-wrap::before, #career .cr-chapters-wrap::after {
  content: ''; position: absolute; top: 0; bottom: 10px; width: 84px; pointer-events: none; opacity: 0;
  transition: opacity 0.15s ease;
}
#career .cr-chapters-wrap::before { left: 0; background: linear-gradient(to right, rgba(11,17,22,0.9), rgba(11,17,22,0)); }
#career .cr-chapters-wrap::after { right: 0; background: linear-gradient(to left, rgba(11,17,22,0.9), rgba(11,17,22,0)); }
#career .cr-chapters-wrap.more-l::before, #career .cr-chapters-wrap.more-r::after { opacity: 1; }
#career .cr-chip {
  flex: 0 0 auto; display: flex; align-items: center; gap: 10px; cursor: pointer;
  padding: 8px 14px 8px 10px; border-radius: 10px; border: 3px solid var(--c-ink);
  background: rgba(26,36,28,0.92); box-shadow: 3px 3px 0 var(--c-ink); color: var(--c-cream);
}
#career .cr-chip .cr-num { font-size: clamp(18px, 1.5vw, 24px); font-weight: 900; color: var(--c-amber); min-width: 1.6em; text-align: center; }
#career .cr-chip .cr-chip-name { font-size: clamp(13px, 1vw, 16px); font-weight: 700; white-space: nowrap; }
#career .cr-chip .cr-chip-bar { height: 4px; border-radius: 2px; background: rgba(157,179,200,0.25); margin-top: 4px; overflow: hidden; }
#career .cr-chip .cr-chip-bar i { display: block; height: 100%; background: var(--c-mint); }
#career .cr-chip.is-locked { opacity: 0.55; }
#career .cr-chip.is-locked .cr-num { color: var(--c-slate); }
#career .cr-chip.is-on { background: var(--c-sakura); color: var(--c-ink); }
#career .cr-chip.is-on .cr-num { color: var(--c-ink); }
#career .cr-chip.is-on .cr-chip-bar { background: rgba(11,17,22,0.2); }
#career .cr-chip.is-on .cr-chip-bar i { background: var(--c-ink); }
#career .cr-chip.is-focus { outline: 3px solid var(--c-sakura); outline-offset: 3px; transform: translate(-1px, -1px); box-shadow: 4px 4px 0 var(--c-ink); }
#career .cr-chip-lock { width: 18px; height: 18px; }

#career .cr-chapter-head { display: grid; grid-template-columns: auto auto minmax(0, 1fr); align-items: center; column-gap: 16px; position: relative; }
#career .cr-chapter-head .cr-blurb { grid-column: 1 / -1; margin: 6px 0 0; color: var(--c-slate); font-size: clamp(14px, 1.15vw, 18px); max-width: 80ch; }

#career .cr-lessons { display: grid; grid-template-columns: repeat(auto-fill, minmax(clamp(170px, 15.5vw, 280px), 1fr)); gap: clamp(10px, 1.2vw, 18px); position: relative; }
#career .cr-card {
  position: relative; border-radius: 14px; border: 3px solid var(--c-ink); box-shadow: 4px 4px 0 var(--c-ink);
  background: linear-gradient(180deg, rgba(26,36,28,0.96), rgba(20,28,22,0.96));
  padding: clamp(12px, 1.2vw, 18px); cursor: pointer; display: grid; grid-template-rows: auto 1fr auto; gap: 8px;
  min-height: clamp(170px, 24vh, 250px); transition: transform 0.1s ease;
}
#career .cr-card .cr-card-top { display: flex; justify-content: space-between; align-items: center; }
#career .cr-card .cr-card-num { font-weight: 900; font-size: clamp(15px, 1.2vw, 19px); color: var(--c-amber); letter-spacing: 0.06em; }
#career .cr-card .cr-card-glyph { width: clamp(54px, 4.6vw, 80px); height: clamp(54px, 4.6vw, 80px); justify-self: start; align-self: center; }
#career .cr-card .cr-card-name { font-size: clamp(17px, 1.45vw, 23px); font-weight: 800; line-height: 1.15; }
#career .cr-card .cr-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
#career .cr-card .cr-card-best { color: var(--c-slate); font-size: clamp(13px, 1vw, 15px); }
#career .cr-card .cr-card-medal { width: clamp(32px, 2.6vw, 44px); height: clamp(32px, 2.6vw, 44px); }
#career .cr-card.is-locked { filter: saturate(0.2) brightness(0.65); cursor: default; }
#career .cr-card.is-locked .cr-card-lockmark { position: absolute; right: 12px; top: 40%; width: 40px; height: 40px; opacity: 0.9; }
#career .cr-card.is-on { transform: translate(-3px, -3px); box-shadow: 7px 7px 0 var(--c-ink); border-color: var(--c-sakura); }
#career .cr-card.is-on::after {
  content: ""; position: absolute; inset: -3px; border-radius: 14px; pointer-events: none;
  box-shadow: 0 0 0 3px var(--c-sakura) inset;
}

#career .cr-detail {
  margin-top: auto; display: grid; grid-template-columns: 1fr auto; gap: 18px; align-items: end;
  padding: clamp(12px, 1.8vh, 22px) 0 clamp(14px, 2.2vh, 26px); border-top: 2px solid rgba(157,179,200,0.18);
}
#career .cr-detail .cr-goal { font-size: clamp(16px, 1.35vw, 21px); line-height: 1.4; max-width: 70ch; }
#career .cr-detail .cr-targets { display: flex; gap: 14px; margin-top: 10px; flex-wrap: wrap; }
#career .cr-target { display: inline-flex; align-items: center; gap: 6px; color: var(--c-slate); font-size: clamp(14px, 1.05vw, 16px); }
#career .cr-target .cr-medal-box { width: 26px; height: 26px; }
#career .cr-target b { color: var(--c-cream); }
#career .cr-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }

#career .cr-legend {
  position: absolute; left: 0; right: 0; bottom: 0; display: flex; gap: 22px; justify-content: flex-start;
  padding: 10px clamp(20px, 3.4vw, 64px); background: rgba(11,17,22,0.75); color: var(--c-slate);
  font-size: clamp(13px, 1vw, 15px); pointer-events: none;
}
#career .cr-legend .cr-legend-key { color: var(--c-cream); font-weight: 700; margin-right: 6px; }
#career .cr-legend span[hidden] { display: none; }
#career .cr-btn .cr-key[hidden] { display: none; }
#career .cr-hub { padding-bottom: 44px; }

/* ---------------- the briefing ---------------- */
#career .cr-brief { align-items: center; justify-content: flex-start; padding: clamp(18px, 3vh, 44px) clamp(20px, 4vw, 80px) 56px; }
#career .cr-brief-card {
  width: min(1180px, 100%); max-height: 100%; overflow: auto; position: relative;
  display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: clamp(18px, 2.4vw, 40px);
  background: rgba(20,28,22,0.94); border: 3px solid var(--c-ink); border-radius: 18px; box-shadow: 6px 6px 0 var(--c-ink);
  padding: clamp(18px, 2.4vw, 38px);
}
#career .cr-brief-card::before {
  content: ""; position: absolute; left: 0; right: 0; top: 0; height: 4px; border-radius: 18px 18px 0 0; background: var(--c-sakura);
}
#career .cr-brief .cr-goal { font-size: clamp(18px, 1.6vw, 25px); line-height: 1.35; margin: 12px 0 10px; font-weight: 600; }
#career .cr-brief .cr-why { color: var(--c-slate); font-size: clamp(15px, 1.2vw, 18px); line-height: 1.5; margin: 0 0 14px; }
#career .cr-steps { margin: 0; padding: 0; list-style: none; counter-reset: s; display: grid; gap: 10px; }
#career .cr-steps li { counter-increment: s; display: grid; grid-template-columns: 34px 1fr; gap: 10px; align-items: start; font-size: clamp(15px, 1.2vw, 18px); line-height: 1.4; }
#career .cr-steps li::before {
  content: counter(s); width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center;
  background: var(--c-amber); color: var(--c-ink); font-weight: 900; border: 2px solid var(--c-ink);
}
#career .cr-note { margin-top: 14px; padding: 10px 14px; border-left: 4px solid var(--c-mint); background: rgba(125,255,180,0.07); color: var(--c-cream); font-size: clamp(14px, 1.05vw, 16px); line-height: 1.45; }
#career .cr-brief-side { display: flex; flex-direction: column; gap: 16px; }
#career .cr-panel { border: 2px solid rgba(157,179,200,0.25); border-radius: 12px; padding: 14px; background: rgba(11,17,22,0.35); }
#career .cr-panel h4 { margin: 0 0 10px; font-size: 13px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--c-slate); }
#career .cr-sticks { display: flex; gap: 14px; justify-content: center; }
#career .cr-gimbal { flex: 1 1 0; max-width: 180px; text-align: center; opacity: 0.5; }
#career .cr-gimbal.is-used { opacity: 1; }
#career .cr-gimbal svg { width: 100%; height: auto; display: block; }
#career .cr-gimbal-cap { margin-top: 6px; font-size: 14px; color: var(--c-slate); }
#career .cr-gimbal-cap b { color: var(--c-cream); }
#career .cr-load { color: var(--c-slate); font-size: 15px; min-height: 1.4em; }
#career .cr-load.ready { color: var(--c-mint); }
#career .cr-brief-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: auto; }
#career .cr-keys-note { margin: 10px 0 0; padding: 8px 10px; border-radius: 8px; background: rgba(255,212,92,0.08); border: 1px solid rgba(255,212,92,0.3); color: var(--c-cream); font-size: clamp(13px, 1vw, 15px); line-height: 1.4; }

/* The medal ladder: a rung a medal, named, its mark, and a tick on the
   rungs reached. The reached rungs are lit; the rest wait in slate. */
#career .cr-ladder { display: grid; gap: 6px; justify-content: center; }
#career .cr-rung {
  display: grid; grid-template-columns: 28px auto auto 24px; align-items: center; gap: 10px;
  padding: 5px 12px 5px 8px; border-radius: 999px; color: var(--c-slate); font-size: clamp(14px, 1.1vw, 17px);
  background: rgba(11,17,22,0.35); border: 2px solid rgba(157,179,200,0.18);
}
#career .cr-rung .cr-medal-box { width: 28px; height: 28px; }
#career .cr-rung b { color: var(--c-cream); letter-spacing: 0.04em; }
#career .cr-rung .cr-rung-value { font-weight: 700; color: var(--c-cream); font-variant-numeric: tabular-nums; }
#career .cr-rung .cr-rung-tick { width: 24px; height: 24px; }
#career .cr-rung .cr-rung-tick svg { width: 100%; height: 100%; display: block; }
#career .cr-rung.is-got { color: var(--c-cream); background: rgba(125,255,180,0.1); border-color: rgba(125,255,180,0.55); }
#career .cr-rung.is-got .cr-rung-value { color: var(--c-mint); }
#career .cr-ladder.compact { justify-content: stretch; }
#career .cr-ladder.compact .cr-rung { padding: 3px 10px 3px 6px; font-size: clamp(13px, 1vw, 15px); }
#career .cr-ladder.compact .cr-rung .cr-medal-box { width: 24px; height: 24px; }

/* The stick end's loops. Every move starts from where the stick rests:
   --rest is how far below the middle that is (a throttle stick sits low). */
#career .cr-stick { transform-box: view-box; transform: translate(0, var(--rest)); animation-duration: 2.4s; animation-iteration-count: infinite; animation-timing-function: ease-in-out; }
@keyframes cr-up { 0%, 15% { transform: translate(0, var(--rest)); } 50%, 70% { transform: translate(0, -34px); } 100% { transform: translate(0, var(--rest)); } }
@keyframes cr-upfull { 0%, 10% { transform: translate(0, var(--rest)); } 40%, 75% { transform: translate(0, -40px); } 100% { transform: translate(0, var(--rest)); } }
@keyframes cr-down { 0%, 15% { transform: translate(0, var(--rest)); } 50%, 70% { transform: translate(0, 34px); } 100% { transform: translate(0, var(--rest)); } }
@keyframes cr-left { 0%, 15% { transform: translate(0, var(--rest)); } 50%, 70% { transform: translate(-34px, var(--rest)); } 100% { transform: translate(0, var(--rest)); } }
@keyframes cr-right { 0%, 15% { transform: translate(0, var(--rest)); } 50%, 70% { transform: translate(34px, var(--rest)); } 100% { transform: translate(0, var(--rest)); } }
@keyframes cr-rightfull { 0%, 10% { transform: translate(0, var(--rest)); } 40%, 75% { transform: translate(40px, var(--rest)); } 100% { transform: translate(0, var(--rest)); } }
@keyframes cr-vboth { 0%, 100% { transform: translate(0, var(--rest)); } 25% { transform: translate(0, calc(var(--rest) - 26px)); } 75% { transform: translate(0, calc(var(--rest) + 26px)); } }
@keyframes cr-hboth { 0%, 100% { transform: translate(0, var(--rest)); } 25% { transform: translate(-28px, var(--rest)); } 75% { transform: translate(28px, var(--rest)); } }
@keyframes cr-vtap { 0%, 30%, 60%, 100% { transform: translate(0, var(--rest)); } 15% { transform: translate(0, calc(var(--rest) - 18px)); } 45% { transform: translate(0, calc(var(--rest) + 18px)); } }
@keyframes cr-htap { 0%, 30%, 60%, 100% { transform: translate(0, var(--rest)); } 15% { transform: translate(18px, var(--rest)); } 45% { transform: translate(-18px, var(--rest)); } }
@keyframes cr-hover { 0%, 100% { transform: translate(0, 8px); } 50% { transform: translate(0, 2px); } }
#career .cr-anim-up { animation-name: cr-up; }
#career .cr-anim-upfull { animation-name: cr-upfull; }
#career .cr-anim-down { animation-name: cr-down; }
#career .cr-anim-left { animation-name: cr-left; }
#career .cr-anim-right { animation-name: cr-right; }
#career .cr-anim-rightfull { animation-name: cr-rightfull; }
#career .cr-anim-vboth { animation-name: cr-vboth; }
#career .cr-anim-hboth { animation-name: cr-hboth; }
#career .cr-anim-vtap { animation-name: cr-vtap; }
#career .cr-anim-htap { animation-name: cr-htap; }
#career .cr-anim-hover { animation-name: cr-hover; }

/* ---------------- the HUD ---------------- */
/* Under the music dock, which sits in the top left corner of every flight;
   lower again in a lesson that shows the freestyle score there. */
#career .cr-obj {
  position: absolute; left: clamp(14px, 2vw, 32px); top: 52px; width: min(420px, 34vw);
  background: rgba(11,17,22,0.62); border: 2px solid rgba(11,17,22,0.9); border-radius: 12px; padding: 12px 14px;
  backdrop-filter: blur(2px);
}
body.career-score #career .cr-obj { top: 150px; }
#career .cr-obj .cr-obj-kicker { font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--c-slate); }
#career .cr-obj .cr-obj-text { font-size: clamp(17px, 1.5vw, 24px); font-weight: 800; margin: 4px 0 8px; text-shadow: 0 2px 0 var(--c-ink); }
#career .cr-bar { height: 8px; border-radius: 4px; background: rgba(157,179,200,0.22); overflow: hidden; }
#career .cr-bar i { display: block; height: 100%; width: 0; background: var(--c-amber); transition: width 0.12s linear; }
#career .cr-list { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 4px; }
#career .cr-list li { display: grid; grid-template-columns: 18px 1fr; gap: 8px; align-items: center; font-size: 14px; color: var(--c-slate); }
#career .cr-list li::before { content: ""; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--c-slate); }
#career .cr-list li.is-done { color: var(--c-mint); }
#career .cr-list li.is-done::before { background: var(--c-mint); border-color: var(--c-mint); }
#career .cr-list li.is-active { color: var(--c-cream); font-weight: 700; }
#career .cr-list li.is-active::before { border-color: var(--c-amber); background: rgba(255,212,92,0.4); }
#career .cr-timer {
  position: absolute; top: clamp(12px, 2vh, 26px); left: 50%; transform: translateX(-50%);
  font-size: clamp(22px, 2.2vw, 36px); font-weight: 900; color: var(--c-amber); letter-spacing: 0.04em;
  text-shadow: 2px 2px 0 var(--c-ink), -1px -1px 0 var(--c-ink), 1px -1px 0 var(--c-ink), -1px 1px 0 var(--c-ink);
}
#career .cr-timer small { display: block; text-align: center; font-size: 12px; letter-spacing: 0.18em; color: var(--c-cream); font-weight: 700; }
#career .cr-coach {
  position: absolute; left: 50%; bottom: clamp(110px, 17vh, 180px); transform: translateX(-50%) translateY(8px);
  max-width: min(720px, 80vw); padding: 10px 18px; border-radius: 999px; text-align: center;
  background: rgba(11,17,22,0.78); border: 2px solid var(--c-ink); font-size: clamp(16px, 1.4vw, 22px); font-weight: 700;
  opacity: 0; transition: opacity 0.25s ease, transform 0.25s ease;
}
#career .cr-coach.show { opacity: 1; transform: translateX(-50%) translateY(0); }
#career .cr-coach.warn { color: var(--c-amber); }
#career .cr-alt {
  position: absolute; right: clamp(16px, 2vw, 34px); top: 50%; transform: translateY(-50%);
  width: 46px; height: min(46vh, 380px); border-radius: 10px; background: rgba(11,17,22,0.55); border: 2px solid var(--c-ink);
  display: none;
}
#career .cr-alt.show { display: block; }
#career .cr-alt .cr-alt-band { position: absolute; left: 4px; right: 4px; background: rgba(255,212,92,0.28); border: 2px solid var(--c-amber); border-radius: 6px; }
#career .cr-alt .cr-alt-mark { position: absolute; left: -10px; right: -10px; height: 4px; background: var(--c-cream); border: 1px solid var(--c-ink); border-radius: 2px; }
#career .cr-alt .cr-alt-mark.in { background: var(--c-mint); }
#career .cr-alt .cr-alt-label { position: absolute; right: 54px; font-size: 15px; font-weight: 800; color: var(--c-cream); white-space: nowrap; text-shadow: 1px 1px 0 var(--c-ink), -1px -1px 0 var(--c-ink), 1px -1px 0 var(--c-ink), -1px 1px 0 var(--c-ink); }
#career .cr-alt .cr-alt-mark.in + .cr-alt-label { color: var(--c-mint); }
#career .cr-marker { position: absolute; width: 0; height: 0; display: none; }
#career .cr-marker.show { display: block; }
#career .cr-marker .cr-marker-dot {
  position: absolute; left: -16px; top: -16px; width: 32px; height: 32px; border-radius: 50%;
  border: 3px solid var(--c-amber); box-shadow: 0 0 0 2px var(--c-ink);
}
#career .cr-marker .cr-marker-arrow {
  position: absolute; left: -15px; top: -18px; width: 0; height: 0; border-left: 15px solid transparent; border-right: 15px solid transparent;
  border-bottom: 26px solid var(--c-amber); filter: drop-shadow(0 0 2px var(--c-ink)); display: none;
}
#career .cr-marker.edge .cr-marker-dot { display: none; }
#career .cr-marker.edge .cr-marker-arrow { display: block; }
#career .cr-marker .cr-marker-dist { position: absolute; left: 22px; top: -10px; font-size: 14px; font-weight: 800; color: var(--c-amber); text-shadow: 1px 1px 0 var(--c-ink); white-space: nowrap; }
#career .cr-pop {
  position: absolute; left: 50%; top: 26%; transform: translate(-50%, 0) scale(0.8); opacity: 0;
  transition: opacity 0.2s ease, transform 0.25s cubic-bezier(.2,1.6,.4,1);
}
#career .cr-pop.show { opacity: 1; transform: translate(-50%, 0) scale(1); }
#career .cr-flash {
  position: absolute; left: 50%; top: 36%; transform: translate(-50%, 0); font-size: clamp(16px, 1.4vw, 22px); font-weight: 800;
  color: var(--c-mint); text-shadow: 2px 2px 0 var(--c-ink); opacity: 0; transition: opacity 0.3s ease;
}
#career .cr-flash.show { opacity: 1; }

/* ---------------- results ---------------- */
#career .cr-results { align-items: center; justify-content: center; padding: 24px; }
#career .cr-res-card {
  width: min(820px, 96vw); max-height: 100%; overflow: hidden auto; background: rgba(20,28,22,0.96); border: 3px solid var(--c-ink); border-radius: 20px;
  box-shadow: 8px 8px 0 var(--c-ink); padding: clamp(16px, 2.2vw, 34px); display: grid; gap: clamp(10px, 1.6vh, 18px); position: relative; text-align: center;
}
#career .cr-res-card::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 5px; border-radius: 20px 20px 0 0; background: var(--c-mint); }
#career .cr-res-card.failed::before { background: var(--c-sakura); }
#career .cr-res-card .cr-title .cr-letters { margin: 0 auto; }
#career .cr-res-medal { width: clamp(96px, 14vh, 150px); height: clamp(96px, 14vh, 150px); margin: 0 auto; animation: cr-medal-in 0.6s cubic-bezier(.2,1.5,.4,1) both; }
@keyframes cr-medal-in { 0% { transform: scale(0.3) rotate(-30deg); opacity: 0; } 100% { transform: scale(1) rotate(0); opacity: 1; } }
#career .cr-res-shout { display: flex; justify-content: center; margin: -10px 0 -6px; animation: cr-shout-in 0.5s 0.25s cubic-bezier(.2,1.6,.4,1) both; }
#career .cr-res-shout canvas { display: block; }
#career .cr-res-shout b { font-size: clamp(22px, 2.2vw, 34px); letter-spacing: 0.1em; text-transform: uppercase; color: var(--c-amber); }
@keyframes cr-shout-in { 0% { transform: scale(0.4) rotate(-6deg); opacity: 0; } 100% { transform: scale(1) rotate(-2deg); opacity: 1; } }
#career .cr-res-time { font-size: clamp(34px, 4vw, 58px); font-weight: 900; color: var(--c-amber); letter-spacing: 0.02em; text-shadow: 3px 3px 0 var(--c-ink); }
#career .cr-res-line { color: var(--c-slate); font-size: clamp(15px, 1.2vw, 18px); }
#career .cr-res-badges { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
#career .cr-badge { padding: 4px 12px; border-radius: 999px; font-weight: 800; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; background: var(--c-mint); color: var(--c-ink); border: 2px solid var(--c-ink); }
#career .cr-badge.sakura { background: var(--c-sakura); }
#career .cr-badge.amber { background: var(--c-amber); }
#career .cr-res-targets { display: flex; gap: 18px; justify-content: center; flex-wrap: wrap; }
#career .cr-res-tip { font-size: clamp(15px, 1.2vw, 18px); line-height: 1.45; color: var(--c-cream); max-width: 56ch; margin: 0 auto; }
#career .cr-res-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }

/* ---------------- achievements ---------------- */
#career .cr-ach { flex-direction: column; padding: clamp(18px, 3vh, 44px) clamp(20px, 3.4vw, 64px) 52px; gap: clamp(10px, 1.6vh, 18px); }
#career .cr-ach > * { flex-shrink: 0; }
#career .cr-ach-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
#career .cr-ach-head .cr-sub { margin-top: 8px; color: var(--c-slate); font-size: clamp(14px, 1.15vw, 18px); max-width: 60ch; }
#career .cr-ach-count { font-size: clamp(22px, 2vw, 32px); font-weight: 900; color: var(--c-amber); text-shadow: 2px 2px 0 var(--c-ink); }
#career .cr-ach-count small { font-size: 0.55em; color: var(--c-slate); text-shadow: none; font-weight: 700; margin-left: 6px; }
#career .cr-ach-grid {
  flex: 1 1 auto; min-height: 0; overflow: hidden auto; scroll-behavior: smooth;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(clamp(260px, 22vw, 360px), 1fr));
  gap: clamp(8px, 1vw, 14px); align-content: start; padding: 4px 6px 8px 2px;
}
#career .cr-ach-tile {
  display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; align-items: center;
  padding: 10px 12px; border-radius: 12px; border: 3px solid var(--c-ink); box-shadow: 3px 3px 0 var(--c-ink);
  background: rgba(26,36,28,0.94);
}
#career .cr-ach-tile.is-locked { background: rgba(20,26,24,0.9); }
#career .cr-ach-tile.is-locked .cr-ach-name { color: var(--c-slate); }
#career .cr-ach-icon { width: clamp(48px, 3.6vw, 60px); height: clamp(48px, 3.6vw, 60px); border-radius: 8px; overflow: hidden; border: 2px solid var(--c-ink); }
#career .cr-ach-icon svg { width: 100%; height: 100%; display: block; }
#career .cr-ach-name { font-size: clamp(15px, 1.15vw, 18px); font-weight: 800; }
#career .cr-ach-desc { color: var(--c-slate); font-size: clamp(13px, 0.95vw, 15px); line-height: 1.35; margin-top: 2px; }
#career .cr-ach-when { color: var(--c-mint); font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; margin-top: 4px; }
#career .cr-ach-bar { height: 5px; border-radius: 3px; background: rgba(157,179,200,0.22); margin-top: 6px; overflow: hidden; }
#career .cr-ach-bar i { display: block; height: 100%; background: var(--c-amber); }
#career .cr-ach-of { color: var(--c-slate); font-size: 12px; margin-top: 3px; }
#career .cr-ach-foot { display: flex; justify-content: flex-end; gap: 12px; }

@media (max-height: 820px) {
  #career .cr-card { min-height: 150px; }
  #career .cr-hub-head .cr-sub { display: none; }
  #career .cr-res-card .cr-title .cr-letters { max-height: 54px; width: auto; }
  #career .cr-res-time { font-size: clamp(28px, 3.2vw, 44px); }
  #career .cr-rung { padding: 3px 10px 3px 6px; }
  #career .cr-rung .cr-medal-box { width: 24px; height: 24px; }
}
@media (prefers-reduced-motion: reduce) {
  #career .cr-stick, #career .cr-res-medal, #career .cr-res-shout { animation: none !important; }
}

`;

let injected = false;

export function injectCareerStyle() {
  if (injected || typeof document === 'undefined') {
    return;
  }
  injected = true;
  const style = document.createElement('style');
  style.id = 'career-style';
  style.textContent = CAREER_CSS;
  document.head.append(style);
}
