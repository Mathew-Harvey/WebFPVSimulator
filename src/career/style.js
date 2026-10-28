/*
 * style.js: the career's stylesheet, injected once.
 *
 * Kept with the career rather than in index.html so the career is one folder
 * an upstream merge never touches. It uses the page's own tokens (--cream,
 * --sakura, --amber, --mint, --slate, --deep, --panel, --ink-line), so it
 * looks like the rest of the game and follows any change to them, with the
 * values as fallbacks for a page that has none.
 *
 * THE MENUS ARE A MANGA MAGAZINE, the way the front screen is (index.html,
 * "THE GATE IS A MANGA MAGAZINE"): paper, ink frames, hard offset shadows,
 * heavy italic capitals. Nothing blurs and nothing moves on its own but the
 * stick drawings and the stars landing on a result; the live world in the
 * windows is the only thing drawing per frame, and it draws anyway. While a
 * lesson flies none of this is on screen, and the flying display has no
 * blur either: the last backdrop-filter went with the tree (2026-10-28).
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
  --c-paper: #f7f0dc;
  --c-card: #fbf6e9;
  --c-quiet: #4f5d6a;
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
#career[data-screen="cover"] .cr-cover,
#career[data-screen="tree"] .cr-tree,
#career[data-screen="fork"] .cr-fork,
#career[data-screen="level"] .cr-level,
#career[data-screen="briefing"] .cr-brief,
#career[data-screen="results"] .cr-results,
#career[data-screen="achievements"] .cr-ach { display: flex; }
#career[data-screen="paint"] .cr-paint { display: grid; }
#career[data-screen="tree"] .cr-tree,
#career[data-screen="briefing"] .cr-brief { display: block; }
#career[data-screen="fork"] .cr-fork,
#career[data-screen="level"] .cr-level { display: grid; }
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
#career .cr-icon { width: 100%; height: 100%; display: block; overflow: visible; }

/* ---------------- the page ---------------- */
/* A face is a page: paper with the dot screen a printed manga has, the
   windows cut out of it (screens.js, cutWindows), ink panels on it. The
   paper scrolls with its face, so the cut never has to follow a scroll. */
#career .cr-screen.has-paper { overflow: hidden auto; scrollbar-width: thin; }
#career .cr-paper {
  position: absolute; left: 0; top: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none;
  background-color: var(--c-paper);
  background-image: radial-gradient(rgba(11,17,22,0.09) 1.2px, transparent 1.4px);
  background-size: 9px 9px;
}
#career .cr-screen.has-paper > *:not(.cr-paper):not(.cr-legend) { position: relative; z-index: 1; }
#career .cr-screen.has-paper { color: var(--c-ink); }
#career[data-screen="cover"] .cr-scrim,
#career[data-screen="tree"] .cr-scrim,
#career[data-screen="fork"] .cr-scrim,
#career[data-screen="level"] .cr-scrim,
#career[data-screen="briefing"] .cr-scrim,
#career[data-screen="results"] .cr-scrim,
#career[data-screen="paint"] .cr-scrim { display: none; }

/* A window: an ink frame round a hole in the paper, the live world in it. */
#career .cr-window {
  border: 5px solid var(--c-ink); box-shadow: 8px 8px 0 var(--c-ink); background: transparent;
}

#career .cr-kick {
  display: inline-block; align-self: flex-start; width: max-content; max-width: 100%;
  padding: 4px 10px; background: var(--c-ink); color: var(--c-cream);
  font-size: clamp(11px, 0.85vw, 13px); font-weight: 900; letter-spacing: 0.16em; text-transform: uppercase;
}
#career .cr-kick.sakura { background: var(--c-sakura); color: var(--c-ink); }
#career .cr-panel {
  background: var(--c-card); color: var(--c-ink);
  border: 4px solid var(--c-ink); box-shadow: 7px 7px 0 var(--c-ink);
  padding: clamp(12px, 1.4vw, 22px);
  display: flex; flex-direction: column; gap: 10px; min-width: 0;
}
#career .cr-panel-line { margin: 0; font-size: clamp(14px, 1.05vw, 17px); line-height: 1.4; font-weight: 600; color: var(--c-ink); }
#career .cr-panel-line.wide { max-width: 62ch; }
#career .cr-caption {
  margin: 0; align-self: flex-start; max-width: min(62ch, 100%);
  padding: 9px 13px; background: var(--c-card); border: 3px solid var(--c-ink); box-shadow: 4px 4px 0 var(--c-ink);
  color: var(--c-ink); font-size: clamp(15px, 1.2vw, 20px); font-weight: 600; line-height: 1.35;
}
#career .cr-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }

/* ---------------- buttons ---------------- */
/* The gate's Back, grown into every button here: heavy italic capitals on
   a lean, an ink frame and a hard shadow, lifted when chosen. */
#career .cr-btn {
  font: inherit; font-size: clamp(14px, 1.05vw, 18px); font-weight: 900; font-style: italic;
  letter-spacing: 0.05em; text-transform: uppercase; line-height: 1.1;
  padding: 10px 18px; cursor: pointer; text-align: left;
  background: var(--c-card); color: var(--c-ink);
  border: 3px solid var(--c-ink); box-shadow: 4px 4px 0 var(--c-ink);
  display: inline-flex; align-items: center; gap: 10px;
  transform: skewX(-6deg);
  transition: transform 0.08s ease, box-shadow 0.08s ease;
}
#career .cr-btn .cr-key {
  font-style: normal; font-size: 0.7em; letter-spacing: 0.04em; padding: 2px 7px; border-radius: 3px;
  background: var(--c-ink); color: var(--c-cream); font-weight: 800;
}
#career .cr-btn.primary { background: var(--c-mint); }
#career .cr-btn.big { font-size: clamp(18px, 1.5vw, 26px); padding: 13px 24px; box-shadow: 5px 5px 0 var(--c-ink); }
#career .cr-btn.small { font-size: clamp(12px, 0.9vw, 15px); padding: 7px 13px; }
#career .cr-btn:disabled { opacity: 0.5; cursor: default; }
#career .cr-btn:hover:not(:disabled), #career .cr-btn.is-focus, #career .cr-btn:focus-visible {
  transform: skewX(-6deg) translate(-2px, -2px);
  box-shadow: 0 0 0 3px var(--c-sakura), 6px 6px 0 3px var(--c-ink);
  outline: none;
}
#career .cr-btn .cr-key[hidden] { display: none; }

/* The keys, along the foot of the page, the way a magazine runs its
   page footer: ink, with the keys lit. */
#career .cr-legend {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 3; display: flex; gap: 22px; flex-wrap: wrap;
  padding: 8px clamp(16px, 3.4vw, 56px); background: var(--c-ink); color: var(--c-slate);
  font-size: clamp(12px, 0.95vw, 14px); font-weight: 600; pointer-events: none;
}
#career .cr-legend .cr-legend-key { color: var(--c-cream); font-weight: 800; margin-right: 6px; }
#career .cr-legend span[hidden] { display: none; }

#career .cr-stars { display: inline-flex; gap: 2px; align-items: center; }
#career .cr-stars .cr-star { width: 20px; height: 20px; }
#career .cr-stars.tiny .cr-star { width: 14px; height: 14px; }
#career .cr-stars.small .cr-star { width: 18px; height: 18px; }
#career .cr-stars.big { gap: clamp(6px, 1vw, 14px); }
#career .cr-stars.big .cr-star { width: clamp(46px, 7vh, 84px); height: clamp(46px, 7vh, 84px); filter: drop-shadow(4px 4px 0 var(--c-ink)); }
#career .cr-stars.big .cr-star { animation: cr-star-in 0.45s cubic-bezier(.2,1.6,.4,1) both; }
#career .cr-stars.big .cr-star:nth-child(2) { animation-delay: 0.18s; }
#career .cr-stars.big .cr-star:nth-child(3) { animation-delay: 0.36s; }
@keyframes cr-star-in { 0% { transform: scale(0.2) rotate(-40deg); opacity: 0; } 100% { transform: scale(1) rotate(0); opacity: 1; } }

/* The pilot's licence: who they are in the career, in one card. */
#career .cr-licence {
  display: flex; align-items: center; gap: 14px; padding: 10px 16px;
  background: var(--c-card); border: 4px solid var(--c-ink); box-shadow: 6px 6px 0 var(--c-ink);
  transform: rotate(1.2deg); flex: none;
}
#career .cr-licence-badge { width: clamp(44px, 4vw, 64px); height: clamp(44px, 4vw, 64px); background: var(--c-ink); border: 3px solid var(--c-ink); padding: 3px; }
#career .cr-licence-words { display: flex; flex-direction: column; gap: 2px; }
#career .cr-licence-kick { font-size: 11px; font-weight: 900; letter-spacing: 0.14em; text-transform: uppercase; color: var(--c-quiet); }
#career .cr-licence-title { font-size: clamp(18px, 1.6vw, 26px); font-weight: 900; font-style: italic; text-transform: uppercase; line-height: 1.05; }
#career .cr-licence-line { display: flex; align-items: center; gap: 6px; font-size: clamp(13px, 0.95vw, 15px); font-weight: 700; }
#career .cr-licence-line .cr-star { width: 18px; height: 18px; flex: none; }

/* ---------------- the cover ---------------- */
#career .cr-cover { flex-direction: column; gap: clamp(14px, 2.4vh, 28px); padding: clamp(16px, 3vh, 40px) clamp(16px, 3.4vw, 56px) 60px; }
#career .cr-cover > * { flex-shrink: 0; }
#career .cr-cover-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
#career .cr-cover-name { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
#career .cr-cover-grid {
  flex: 1 0 auto; display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: clamp(18px, 2.2vw, 34px);
  min-height: clamp(320px, 56vh, 640px);
}
#career .cr-continue { position: relative; display: flex; flex-direction: column; justify-content: flex-end; padding: clamp(16px, 2vw, 30px); min-height: 0; }
#career .cr-continue-words { display: flex; flex-direction: column; gap: 10px; }
#career .cr-continue-place {
  align-self: flex-start; padding: 3px 10px; background: var(--c-amber); border: 3px solid var(--c-ink);
  font-size: clamp(12px, 0.95vw, 15px); font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase;
}
#career .cr-continue .cr-btn { align-self: flex-start; margin-top: 4px; }
#career .cr-continue > .cr-kick { position: absolute; left: clamp(16px, 2vw, 30px); top: clamp(14px, 1.8vw, 26px); }
#career .cr-cover-balloon, #career .cr-fork-balloon {
  position: absolute; right: clamp(16px, 3vw, 46px); top: clamp(16px, 2.6vw, 40px);
  padding: 22px 30px; border-radius: 50%; background: var(--c-card); border: 4px solid var(--c-ink);
  font-size: clamp(18px, 1.7vw, 28px); font-weight: 900; font-style: italic; text-transform: uppercase; color: var(--c-ink);
  transform: rotate(4deg); box-shadow: 4px 4px 0 var(--c-ink);
}
#career .cr-cover-side { display: flex; flex-direction: column; gap: clamp(16px, 2.2vh, 26px); min-width: 0; }
#career .cr-treecard { flex: 1 1 auto; transform: rotate(0.6deg); }
#career .cr-levelcard { transform: rotate(-0.6deg); }
#career .cr-treecard .cr-btn, #career .cr-levelcard .cr-btn { align-self: flex-start; }
#career .cr-ways { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; flex: 1 1 auto; }
#career .cr-way { border: 4px solid var(--c-ink); padding: 12px; display: flex; flex-direction: column; justify-content: space-between; gap: 8px; min-width: 0; }
#career .cr-way-race { background: #ffe9a8; }
#career .cr-way-freestyle { background: #f7cbd7; }
#career .cr-way-name { font-size: clamp(20px, 1.8vw, 30px); font-weight: 900; font-style: italic; text-transform: uppercase; line-height: 1; }
#career .cr-way-line { font-size: clamp(13px, 1vw, 16px); font-weight: 600; line-height: 1.3; }
#career .cr-way-stat { display: flex; align-items: center; gap: 6px; font-size: clamp(12px, 0.9vw, 14px); font-weight: 800; }
#career .cr-way-stat svg { width: 20px; height: 20px; flex: none; }
#career .cr-way.is-locked .cr-way-stat { color: var(--c-quiet); }
#career .cr-cover-foot { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
#career .cr-save-note { margin-left: auto; font-size: clamp(12px, 0.95vw, 14px); font-weight: 700; color: var(--c-quiet); }

/* ---------------- the tree ---------------- */
/* Seven rows that fit the window: the rows share the height and never grow
   to fit what spans them, so the key and the chosen part's sheet scroll
   inside their own corner rather than pushing the tree off the page. */
#career .cr-tree { --tree-pad: clamp(12px, 2.2vh, 28px); padding: var(--tree-pad) clamp(14px, 2.6vw, 44px) 0; }
#career .cr-tree-grid {
  position: relative; display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  grid-template-rows: repeat(7, minmax(0, 1fr));
  column-gap: clamp(20px, 2.6vw, 44px); row-gap: clamp(14px, 2.6vh, 30px);
  height: calc(100vh - 44px - 2 * var(--tree-pad)); min-height: 560px;
}
#career .cr-links { position: absolute; left: 0; top: 0; z-index: 0; pointer-events: none; overflow: visible; }
#career .cr-link-ink { fill: none; stroke: var(--c-ink); stroke-width: 4; opacity: 0.3; }
#career .cr-link { fill: none; stroke: none; }
#career .cr-link-ink.is-lit { stroke-width: 9; opacity: 1; }
#career .cr-link.is-lit { stroke: var(--c-mint); stroke-width: 4; }
#career .cr-link-ink.is-soon, #career .cr-link.is-soon { stroke-dasharray: 9 7; }
#career .cr-part {
  position: relative; z-index: 1; min-width: 0; min-height: 0;
  grid-row-start: var(--row); grid-column: var(--col) / span var(--span, 1);
  display: flex; flex-direction: column; justify-content: space-between; gap: 2px;
  padding: 8px 12px 7px; text-align: left; cursor: pointer; font: inherit; color: var(--c-ink);
  background: var(--c-card); border: 4px solid var(--c-ink); box-shadow: 5px 5px 0 var(--c-ink);
  transition: transform 0.08s ease;
}
#career .cr-part::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 5px; background: var(--branch, var(--c-mint)); }
#career .cr-part-trunk { --branch: var(--c-mint); }
#career .cr-part-race { --branch: var(--c-amber); }
#career .cr-part-freestyle { --branch: var(--c-sakura); }
#career .cr-part-crown { --branch: var(--c-ink); }
#career .cr-part[data-col="0"] { --col: 1; } #career .cr-part[data-col="1"] { --col: 2; }
#career .cr-part[data-col="2"] { --col: 3; } #career .cr-part[data-col="3"] { --col: 4; }
#career .cr-part[data-col="4"] { --col: 5; }
#career .cr-part[data-row="0"] { --row: 1; } #career .cr-part[data-row="1"] { --row: 2; }
#career .cr-part[data-row="2"] { --row: 3; } #career .cr-part[data-row="3"] { --row: 4; }
#career .cr-part[data-row="4"] { --row: 5; } #career .cr-part[data-row="5"] { --row: 6; }
#career .cr-part[data-row="6"] { --row: 7; }
#career .cr-part[data-span="2"] { --span: 2; }
#career .cr-part-kick { font-size: clamp(10px, 0.72vw, 12px); font-weight: 900; letter-spacing: 0.14em; text-transform: uppercase; color: var(--c-quiet); margin-top: 3px; }
#career .cr-part-name { font-size: clamp(14px, calc(0.8vw + 0.5vh), 21px); font-weight: 900; font-style: italic; text-transform: uppercase; line-height: 1.02; }
#career .cr-part-foot { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-width: 0; }
#career .cr-part-short { font-size: clamp(11px, 0.8vw, 13px); font-weight: 700; color: var(--c-quiet); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#career .cr-pips { display: flex; gap: 3px; flex-wrap: wrap; }
#career .cr-pips i { width: 11px; height: 11px; border: 2px solid var(--c-ink); background: transparent; }
#career .cr-pips i.is-bronze { background: var(--c-bronze); }
#career .cr-pips i.is-silver { background: var(--c-silver); }
#career .cr-pips i.is-gold { background: var(--c-gold); }
#career .cr-part-stat { display: flex; align-items: center; gap: 4px; font-size: clamp(11px, 0.85vw, 14px); font-weight: 900; flex: none; }
#career .cr-part-stat svg { width: 18px; height: 18px; }
#career .cr-part.is-licence { border-width: 5px; }
#career .cr-part-race.is-licence:not(.is-locked):not(.is-done) { background: #ffe9a8; }
#career .cr-part-freestyle.is-licence:not(.is-locked):not(.is-done) { background: #f7cbd7; }
#career .cr-part.is-done { background: var(--c-mint); }
#career .cr-part.is-current { background: var(--c-amber); }
#career .cr-part.is-known { background-image: repeating-linear-gradient(45deg, rgba(125,255,180,0.6) 0 6px, transparent 6px 13px); }
#career .cr-part.is-locked {
  background-color: #dcd4bf; color: #4a5560; box-shadow: 3px 3px 0 var(--c-ink);
  background-image: repeating-linear-gradient(45deg, rgba(11,17,22,0.12) 0 2px, transparent 2px 7px);
}
#career .cr-part.is-locked::before { opacity: 0.35; }
#career .cr-part.is-soon {
  background: rgba(251,246,233,0.55); border-style: dashed; border-width: 3px; box-shadow: none; color: #4a5560;
}
#career .cr-part.is-soon::before { display: none; }
#career .cr-part.is-on { z-index: 2; transform: translate(-3px, -3px); box-shadow: 8px 8px 0 var(--c-ink); }
#career .cr-part.is-on.is-focus, #career .cr-part:focus-visible { box-shadow: 0 0 0 4px var(--c-sakura), 9px 9px 0 4px var(--c-ink); outline: none; }
#career .cr-stamp {
  position: absolute; right: -10px; top: -12px; z-index: 3; padding: 3px 8px; border: 2px solid var(--c-ink);
  box-shadow: 2px 2px 0 var(--c-ink); transform: rotate(6deg); white-space: nowrap;
  font-size: 11px; font-weight: 900; font-style: italic; letter-spacing: 0.06em; text-transform: uppercase; color: var(--c-ink);
}
#career .cr-stamp.here { background: var(--c-sakura); }
#career .cr-stamp.known { background: var(--c-mint); }
#career .cr-stamp.soon { background: var(--c-card); }

#career .cr-tree-key {
  grid-column: 1 / span 2; grid-row: 5 / span 3; align-self: end; z-index: 1;
  display: flex; flex-direction: column; gap: clamp(6px, 1.2vh, 10px); min-width: 0; max-height: 100%; overflow: hidden;
}
#career .cr-tree-key .cr-panel-line { font-size: clamp(13px, 0.95vw, 15px); max-width: 56ch; }
#career .cr-tree-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: clamp(12px, 0.9vw, 14px); font-weight: 800; }
#career .cr-tree-legend span { display: inline-flex; align-items: center; gap: 6px; }
#career .cr-swatch { display: inline-block; width: 22px; height: 15px; border: 3px solid var(--c-ink); background: var(--c-card); }
#career .cr-swatch.done { background: var(--c-mint); }
#career .cr-swatch.current { background: var(--c-amber); }
#career .cr-swatch.known { background-image: repeating-linear-gradient(45deg, rgba(125,255,180,0.9) 0 3px, transparent 3px 6px); }
#career .cr-swatch.locked { background-color: #dcd4bf; background-image: repeating-linear-gradient(45deg, rgba(11,17,22,0.3) 0 2px, transparent 2px 5px); }
#career .cr-swatch.soon { background: transparent; border-style: dashed; }

#career .cr-sheet {
  grid-column: 4 / span 2; grid-row: 5 / span 3; align-self: end; z-index: 1; min-width: 0; max-height: 100%; overflow: hidden auto; box-sizing: border-box;
  background: var(--c-card); border: 5px solid var(--c-ink); box-shadow: 7px 7px 0 var(--c-ink);
  padding: clamp(12px, 1.2vw, 20px); display: flex; flex-direction: column; gap: 8px;
}
#career .cr-sheet-race > .cr-kick { background: var(--c-amber); color: var(--c-ink); }
#career .cr-sheet-freestyle > .cr-kick { background: var(--c-sakura); color: var(--c-ink); }
#career .cr-sheet .cr-panel-line { font-size: clamp(13px, 0.92vw, 15px); line-height: 1.35; }
#career .cr-sheet-title { font-size: clamp(20px, 1.8vw, 32px); font-weight: 900; font-style: italic; text-transform: uppercase; line-height: 1; }
#career .cr-sheet .cr-btn { align-self: flex-start; }
/* One row of lessons, however many the part has, so the sheet keeps the
   height of its corner. A list on a narrow window wraps them instead. */
#career .cr-sheet-lessons { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 8px; }
#career .cr-tile {
  font: inherit; color: var(--c-ink); text-align: left; cursor: pointer; min-width: 0;
  display: flex; flex-direction: column; gap: 5px; padding: 5px;
  background: var(--c-card); border: 3px solid var(--c-ink); box-shadow: 3px 3px 0 var(--c-ink);
  transition: transform 0.08s ease;
}
#career .cr-tile-glyph { display: grid; place-items: center; background: var(--c-ink); height: clamp(30px, 4.2vh, 50px); }
#career .cr-tile-glyph svg { width: auto; height: clamp(24px, 3.4vh, 42px); }
#career .cr-tile-name { font-size: clamp(11.5px, 0.82vw, 13.5px); font-weight: 800; line-height: 1.15; min-height: 2.3em; }
#career .cr-tile-foot { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 2px 4px; }
#career .cr-tile-best { font-size: 11px; font-weight: 800; color: var(--c-quiet); }
#career .cr-tile.is-gold { background: #ffe9a8; }
#career .cr-tile.is-silver { background: #e4eaef; }
#career .cr-tile.is-bronze { background: #f1d9c6; }
#career .cr-tile.is-locked { cursor: default; background-color: #dcd4bf; background-image: repeating-linear-gradient(45deg, rgba(11,17,22,0.12) 0 2px, transparent 2px 7px); color: #4a5560; }
#career .cr-tile.is-focus, #career .cr-tile:hover:not(.is-locked) { transform: translate(-2px, -2px); box-shadow: 0 0 0 3px var(--c-sakura), 5px 5px 0 3px var(--c-ink); }

/* ---------------- the fork ---------------- */
#career .cr-fork { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: clamp(16px, 2vw, 32px); align-items: stretch; padding: clamp(18px, 4vh, 56px) clamp(16px, 3.4vw, 56px) 64px; }
#career .cr-fork-side {
  font: inherit; color: var(--c-ink); text-align: left; cursor: pointer; position: relative;
  display: flex; flex-direction: column; gap: 14px; justify-content: flex-end; padding: clamp(18px, 2.4vw, 36px);
  border: 5px solid var(--c-ink); box-shadow: 8px 8px 0 var(--c-ink);
  background-image: repeating-linear-gradient(115deg, rgba(11,17,22,0.12) 0 2px, transparent 2px 22px);
  transition: transform 0.1s ease;
}
#career .cr-fork-race { background-color: var(--c-amber); transform: rotate(-1deg); }
#career .cr-fork-freestyle { background-color: var(--c-sakura); transform: rotate(1deg); }
#career .cr-fork-side > .cr-kick { position: absolute; left: clamp(18px, 2.4vw, 36px); top: clamp(18px, 2.4vw, 36px); }
#career .cr-fork-list { margin: 0; padding: 0 0 0 1.2em; display: grid; gap: 6px; font-size: clamp(15px, 1.25vw, 20px); font-weight: 700; line-height: 1.3; }
#career .cr-fork-side .cr-btn { align-self: flex-start; }
#career .cr-fork-side.is-focus, #career .cr-fork-side:hover { box-shadow: 0 0 0 5px var(--c-ink), 0 0 0 9px var(--c-cream), 14px 14px 0 9px var(--c-ink); }
#career .cr-fork-race.is-focus, #career .cr-fork-race:hover { transform: rotate(-1deg) translate(-3px, -3px); }
#career .cr-fork-freestyle.is-focus, #career .cr-fork-freestyle:hover { transform: rotate(1deg) translate(-3px, -3px); }
#career .cr-fork-mid { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; width: clamp(160px, 16vw, 260px); }
#career .cr-fork-mid .cr-fork-balloon { position: relative; right: auto; top: auto; }
#career .cr-fork-note { margin: 0; text-align: center; font-size: clamp(13px, 1vw, 16px); font-weight: 700; }
#career .cr-fork-stamp {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  width: clamp(130px, 12vw, 190px); aspect-ratio: 1; border-radius: 50%;
  border: 5px solid var(--c-ink); background: var(--c-mint); box-shadow: 5px 5px 0 var(--c-ink); transform: rotate(-8deg);
  text-transform: uppercase; text-align: center;
}
#career .cr-fork-stamp span { font-size: clamp(10px, 0.8vw, 13px); font-weight: 900; letter-spacing: 0.14em; }
#career .cr-fork-stamp b { font-size: clamp(20px, 2vw, 32px); font-weight: 900; font-style: italic; line-height: 1; }
#career .cr-fork-stamp.small { width: 110px; flex: none; }
#career .cr-fork-stamp.small b { font-size: 16px; }

/* ---------------- set my level ---------------- */
#career .cr-level { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: clamp(18px, 2.6vw, 44px); align-content: start; padding: clamp(18px, 4vh, 52px) clamp(16px, 3.4vw, 56px) 64px; }
#career .cr-level-main, #career .cr-level-side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
#career .cr-level-side { padding-top: clamp(30px, 6vh, 90px); }
#career .cr-level-side > .cr-btn { align-self: flex-start; }
#career .cr-questions { gap: 0; padding: 0; }
#career .cr-q { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 12px 16px; border-top: 3px solid var(--c-ink); }
#career .cr-q:first-child { border-top: 0; }
#career .cr-q-text { font-size: clamp(15px, 1.2vw, 19px); font-weight: 700; }
#career .cr-choice {
  font: inherit; font-size: clamp(13px, 1vw, 16px); font-weight: 900; font-style: italic; text-transform: uppercase;
  padding: 7px 14px; border: 3px solid var(--c-ink); background: var(--c-card); color: var(--c-ink); cursor: pointer;
  box-shadow: 3px 3px 0 var(--c-ink);
}
#career .cr-choice.is-picked { background: var(--c-ink); color: var(--c-cream); }
#career .cr-choice.is-focus, #career .cr-choice:hover { box-shadow: 0 0 0 3px var(--c-sakura), 4px 4px 0 3px var(--c-ink); transform: translate(-1px, -1px); }
#career .cr-level-message { margin: 0; align-self: flex-start; padding: 8px 12px; background: var(--c-mint); border: 3px solid var(--c-ink); font-weight: 800; }
#career .cr-code {
  font: 600 14px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--c-ink); width: 100%; box-sizing: border-box;
  padding: 8px 10px; border: 3px solid var(--c-ink); background: #fffdf6; resize: vertical; word-break: break-all;
}
#career .cr-code[hidden], #career .cr-savecard .cr-btn[hidden] { display: none; }
#career .cr-code-said { margin: 0; min-height: 1.3em; font-size: 14px; font-weight: 700; }

/* ---------------- the paint shop ---------------- */
/* A swatch per livery, two chips each, and the quad drawn large in the one
   the cursor is on. A locked swatch is printed in grey ink. */
#career .cr-quad { display: block; width: 100%; height: 100%; }
#career .cr-livery-chips { display: inline-flex; flex: none; border: 3px solid var(--c-ink); box-shadow: 2px 2px 0 var(--c-ink); }
#career .cr-livery-chips i { display: block; width: 18px; height: 22px; }
#career .cr-livery-chips i + i { border-left: 2px solid var(--c-ink); }
#career .cr-paint { grid-template-columns: minmax(0, 7fr) minmax(0, 4fr); gap: clamp(18px, 2.6vw, 44px); align-content: start; padding: clamp(18px, 4vh, 52px) clamp(16px, 3.4vw, 56px) 64px; }
#career .cr-paint-main, #career .cr-paint-side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
/* As specific as the page's own rule that sets its children relative, or
   the preview would scroll away with the grid it is the preview of. */
#career .cr-screen.has-paper.cr-paint > .cr-paint-side { padding-top: clamp(30px, 6vh, 90px); position: sticky; top: 0; align-self: start; }
#career .cr-paint-side > .cr-btn { align-self: flex-start; }
#career .cr-livery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(196px, 1fr)); gap: 12px; }
#career .cr-livery {
  font: inherit; color: var(--c-ink); text-align: left; cursor: pointer;
  display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 10px; row-gap: 2px; align-items: center;
  padding: 10px 12px; background: var(--c-card); border: 3px solid var(--c-ink); box-shadow: 4px 4px 0 var(--c-ink);
  transition: transform 0.08s ease, box-shadow 0.08s ease;
}
#career .cr-livery .cr-livery-chips { grid-row: 1 / 3; }
#career .cr-livery-name { font-size: clamp(13px, 0.95vw, 16px); font-weight: 900; font-style: italic; text-transform: uppercase; line-height: 1.05; overflow-wrap: anywhere; }
#career .cr-livery-line { display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 700; color: var(--c-quiet); }
#career .cr-livery-line svg { width: 13px; height: 13px; flex: none; }
#career .cr-livery.is-on { background: var(--c-mint); }
#career .cr-livery.is-on .cr-livery-line { color: var(--c-ink); }
#career .cr-livery.is-locked { background: #ece5d2; }
#career .cr-livery.is-locked .cr-livery-chips { opacity: 0.55; }
#career .cr-livery.is-locked .cr-livery-name { color: var(--c-quiet); }
#career .cr-livery.is-focus, #career .cr-livery:hover {
  transform: translate(-2px, -2px); box-shadow: 0 0 0 3px var(--c-sakura), 6px 6px 0 3px var(--c-ink); outline: none;
}
#career .cr-paint-show { align-items: center; text-align: center; transform: rotate(0.8deg); }
#career .cr-paint-pic { width: min(100%, 300px); aspect-ratio: 1; }
#career .cr-paint-name { font-size: clamp(22px, 2vw, 32px); font-weight: 900; font-style: italic; text-transform: uppercase; line-height: 1; }
#career .cr-paint-from { font-size: clamp(13px, 0.95vw, 15px); font-weight: 700; color: var(--c-quiet); }
#career .cr-paint-said { margin: 0; min-height: 1.3em; font-weight: 800; }
#career .cr-paint-said:empty { display: none; }
#career .cr-paint-said:not(:empty) { align-self: flex-start; padding: 8px 12px; background: var(--c-mint); border: 3px solid var(--c-ink); }
#career .cr-cover-pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: clamp(14px, 1.6vw, 24px); align-items: stretch; }
#career .cr-cover-pair .cr-panel { justify-content: space-between; }
#career .cr-paintcard { transform: rotate(0.6deg); }
#career .cr-paintcard-row { display: flex; align-items: center; gap: 10px; }
#career .cr-paintcard-pic { width: clamp(48px, 4.2vw, 70px); aspect-ratio: 1; flex: none; }
#career .cr-paintcard .cr-btn { align-self: flex-start; }
#career .cr-res-livery { flex-direction: row; align-items: center; gap: 14px; background: #fde3ea; transform: rotate(-0.8deg); }
#career .cr-res-livery-pic { width: clamp(80px, 7vw, 118px); aspect-ratio: 1; flex: none; }
#career .cr-res-livery-words { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
#career .cr-res-livery .cr-btn { align-self: flex-start; }

/* ---------------- the briefing ---------------- */
#career .cr-brief { padding: clamp(14px, 2.6vh, 36px) clamp(16px, 3vw, 52px) 56px; }
#career .cr-brief-page {
  display: grid; gap: clamp(16px, 2vw, 30px);
  grid-template-columns: repeat(12, minmax(0, 1fr));
  grid-template-areas:
    "hero hero hero hero hero hero hero hero coach coach coach coach"
    "job job job job job sticks sticks sticks go go go go";
  grid-template-rows: minmax(clamp(220px, 40vh, 460px), auto) auto;
}
#career .cr-brief-hero { grid-area: hero; position: relative; display: flex; flex-direction: column; justify-content: flex-end; padding: clamp(14px, 1.8vw, 28px); min-width: 0; }
#career .cr-brief-hero-words { display: flex; flex-direction: column; gap: 10px; }
#career .cr-tags { display: flex; gap: 8px; flex-wrap: wrap; }
#career .cr-tag {
  display: inline-block; padding: 3px 9px 2px; font-size: clamp(11px, 0.9vw, 13px);
  letter-spacing: 0.12em; text-transform: uppercase; font-weight: 900; color: var(--c-ink); background: var(--c-card);
  border: 2px solid var(--c-ink); box-shadow: 2px 2px 0 var(--c-ink);
}
#career .cr-tag.angle { background: var(--c-mint); }
#career .cr-tag.acro { background: var(--c-sakura); }
#career .cr-tag.warn { background: var(--c-amber); }
#career .cr-load {
  position: absolute; right: clamp(14px, 1.8vw, 28px); top: clamp(14px, 1.8vw, 28px);
  padding: 5px 11px; background: var(--c-ink); color: var(--c-slate); font-size: 14px; font-weight: 800;
}
#career .cr-load.ready { color: var(--c-mint); }
#career .cr-brief-coach { grid-area: coach; display: flex; flex-direction: column; justify-content: flex-end; align-items: flex-end; gap: 0; min-width: 0; }
#career .cr-balloon {
  position: relative; align-self: stretch; margin: 0 0 22px; padding: clamp(14px, 1.4vw, 22px) clamp(16px, 1.6vw, 26px);
  background: var(--c-card); border: 4px solid var(--c-ink); border-radius: 26px; box-shadow: 5px 5px 0 var(--c-ink);
  font-size: clamp(15px, 1.2vw, 19px); font-weight: 600; line-height: 1.45; color: var(--c-ink);
}
#career .cr-balloon::after {
  content: ""; position: absolute; right: clamp(40px, 5vw, 80px); bottom: -24px; width: 26px; height: 26px;
  background: var(--c-card); border-right: 4px solid var(--c-ink); border-bottom: 4px solid var(--c-ink);
  transform: skewX(-30deg) rotate(20deg);
}
#career .cr-balloon.left { margin: 0; align-self: center; }
#career .cr-balloon.left::after { right: auto; left: -18px; bottom: 26px; transform: rotate(135deg); }
#career .cr-coach-face { width: clamp(96px, 9vw, 150px); flex: none; margin-right: clamp(10px, 2vw, 40px); }
#career .cr-coach-face.small { width: clamp(70px, 6vw, 100px); margin: 0; }
#career .cr-coach-face svg { width: 100%; height: auto; display: block; filter: drop-shadow(4px 4px 0 var(--c-ink)); }
#career .cr-brief-job { grid-area: job; }
#career .cr-brief-sticks { grid-area: sticks; }
#career .cr-brief-go { grid-area: go; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
#career .cr-brief .cr-goal { margin: 0; font-size: clamp(17px, 1.45vw, 23px); line-height: 1.35; font-weight: 800; }
#career .cr-steps { margin: 0; padding: 0; list-style: none; counter-reset: s; display: grid; gap: 9px; }
#career .cr-steps li { counter-increment: s; display: grid; grid-template-columns: 32px 1fr; gap: 10px; align-items: start; font-size: clamp(14px, 1.1vw, 17px); line-height: 1.4; font-weight: 600; }
#career .cr-steps li::before {
  content: counter(s); width: 28px; height: 28px; display: grid; place-items: center;
  background: var(--c-amber); color: var(--c-ink); font-weight: 900; border: 3px solid var(--c-ink);
}
#career .cr-note { margin: 0; padding: 9px 13px; border-left: 6px solid var(--c-mint); background: rgba(125,255,180,0.2); font-size: clamp(13px, 1vw, 16px); line-height: 1.45; font-weight: 600; }
#career .cr-sticks { display: flex; gap: 12px; justify-content: center; }
#career .cr-gimbal { flex: 1 1 0; max-width: 170px; text-align: center; opacity: 0.45; }
#career .cr-gimbal.is-used { opacity: 1; }
#career .cr-gimbal svg { width: 100%; height: auto; display: block; }
#career .cr-gimbal-cap { margin-top: 6px; font-size: 13px; font-weight: 700; color: var(--c-quiet); }
#career .cr-gimbal-cap b { color: var(--c-ink); }
#career .cr-keys-note { margin: 0; padding: 8px 10px; background: #ffe9a8; border: 3px solid var(--c-ink); font-size: clamp(13px, 1vw, 15px); line-height: 1.4; font-weight: 600; }
#career .cr-brief-go .cr-row .cr-btn.big { flex: 1 1 auto; justify-content: center; }
#career .cr-best { margin: 0; font-size: 14px; font-weight: 800; color: var(--c-quiet); }

/* The star ladder: a rung a medal, its stars, its mark, a tick when won. */
#career .cr-ladder { display: grid; gap: 6px; }
#career .cr-rung {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto 22px; align-items: center; gap: 10px;
  padding: 5px 10px; border: 3px solid var(--c-ink); background: var(--c-card); color: var(--c-ink);
  font-size: clamp(13px, 1vw, 16px);
}
#career .cr-rung b { font-weight: 900; font-style: italic; text-transform: uppercase; letter-spacing: 0.04em; }
#career .cr-rung .cr-rung-value { font-weight: 900; font-variant-numeric: tabular-nums; }
#career .cr-rung .cr-rung-tick { width: 22px; height: 22px; }
#career .cr-rung .cr-rung-tick svg { width: 100%; height: 100%; display: block; }
#career .cr-rung .cr-check path { stroke: var(--c-ink); }
#career .cr-rung.is-got { background: var(--c-mint); }

/* ---------------- results ---------------- */
#career .cr-results { flex-direction: column; gap: clamp(14px, 2.4vh, 28px); padding: clamp(18px, 4vh, 52px) clamp(16px, 3.4vw, 56px) 60px; }
#career .cr-results > * { flex-shrink: 0; }
#career .cr-results.is-gold .cr-paper { background-color: #fbefc4; }
#career .cr-results.is-failed .cr-paper { background-color: #f3e3e3; }
#career .cr-res-page { flex: 1 0 auto; display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 4fr); gap: clamp(18px, 2.6vw, 44px); align-items: start; }
#career .cr-res-page > :only-child { grid-column: 1 / -1; }
#career .cr-res-main { display: flex; flex-direction: column; gap: clamp(10px, 1.8vh, 20px); min-width: 0; }
#career .cr-res-word { animation: cr-word-in 0.5s cubic-bezier(.2,1.6,.4,1) both; transform-origin: left center; }
@keyframes cr-word-in { 0% { transform: scale(0.4) rotate(-6deg); opacity: 0; } 100% { transform: scale(1) rotate(-2deg); opacity: 1; } }
#career .cr-res-time { align-self: flex-start; flex-direction: row; align-items: baseline; flex-wrap: wrap; gap: 6px 16px; transform: rotate(-0.6deg); }
#career .cr-res-time b { font-size: clamp(34px, 4vw, 62px); font-weight: 900; font-style: italic; letter-spacing: 0.01em; line-height: 1; font-variant-numeric: tabular-nums; }
#career .cr-res-time span { font-size: clamp(14px, 1.1vw, 17px); font-weight: 700; }
#career .cr-res-main .cr-ladder { max-width: 520px; }
#career .cr-res-coach { display: flex; align-items: center; gap: 18px; max-width: 760px; }
#career .cr-res-chase { max-width: 560px; transform: rotate(-0.4deg); }
#career .cr-res-side { display: flex; flex-direction: column; gap: 18px; min-width: 0; padding-top: clamp(0px, 4vh, 60px); }
#career .cr-res-side.is-full { gap: 14px; padding-top: 0; }
#career .cr-res-licence { flex-direction: row; align-items: center; gap: 16px; background: #ffe9a8; transform: rotate(1deg); }
#career .cr-res-opened { transform: rotate(-1deg); }
#career .cr-res-opened-list { display: flex; flex-wrap: wrap; gap: 2px 16px; }
#career .cr-res-opened-name { font-size: clamp(18px, 1.6vw, 26px); font-weight: 900; font-style: italic; text-transform: uppercase; line-height: 1.05; }
#career .cr-res-starsum { align-self: flex-start; padding: 6px 12px; background: var(--c-amber); border: 3px solid var(--c-ink); box-shadow: 4px 4px 0 var(--c-ink); font-weight: 900; font-size: clamp(15px, 1.2vw, 19px); }
#career .cr-meter { height: 14px; border: 3px solid var(--c-ink); background: var(--c-card); }
#career .cr-meter i { display: block; height: 100%; background: var(--c-mint); }
#career .cr-res-actions { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }

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
  background: rgba(11,17,22,0.72); border: 2px solid rgba(11,17,22,0.9); border-radius: 12px; padding: 12px 14px;
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

/* ---------------- small windows ---------------- */
/* A phone, or a window too short for seven rows: the tree is a list, up
   the trunk and then each branch, with the chosen part's lessons under it,
   and every page is one column. */
@media (max-width: 760px), (max-height: 560px) {
  /* The key row is fixed over the foot of a page that scrolls, so the page
     ends clear of it and a key's scroll stops above it. */
  #career .cr-screen.has-paper { padding-bottom: 52px; scroll-padding-bottom: 52px; }
  #career .cr-tree { padding-bottom: 52px; }
  #career .cr-tree-grid { display: flex; flex-direction: column; gap: 12px; height: auto; min-height: 0; }
  #career .cr-tree-key, #career .cr-sheet { max-height: none; overflow: visible; }
  #career .cr-sheet-lessons { grid-auto-flow: row; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); }
  #career .cr-links { display: none; }
  #career .cr-part { min-height: 64px; scroll-margin-top: 16px; }
  #career .cr-tree-key, #career .cr-sheet { align-self: stretch; }
  #career .cr-cover-grid { grid-template-columns: minmax(0, 1fr); min-height: 0; }
  #career .cr-continue { min-height: clamp(240px, 60vh, 420px); }
  #career .cr-brief-page {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "hero" "coach" "job" "sticks" "go";
    grid-template-rows: minmax(clamp(200px, 46vh, 360px), auto);
  }
  #career .cr-brief-coach { flex-direction: row-reverse; align-items: center; gap: 14px; }
  #career .cr-brief-coach .cr-balloon { margin: 0; }
  #career .cr-brief-coach .cr-balloon::after { right: auto; left: -18px; bottom: 26px; transform: rotate(135deg); }
  #career .cr-coach-face { width: 80px; margin: 0; }
  #career .cr-level, #career .cr-res-page, #career .cr-paint { grid-template-columns: minmax(0, 1fr); }
  #career .cr-level-side, #career .cr-res-side, #career .cr-paint-side { padding-top: 0; }
  /* The preview rides along the foot of the page as a tray, so the quad in
     the livery the cursor is on stays in sight while the grid scrolls. */
  #career[data-screen="paint"] .cr-paint { display: flex; flex-direction: column; }
  #career .cr-screen.has-paper.cr-paint > .cr-paint-side {
    position: sticky; top: auto; bottom: -52px; z-index: 2; align-self: stretch; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 8px 12px;
    /* Paper under the tray, down past the key bar, with an ink rule along
       its top: the swatches scroll under it, not through it. A sticky box
       stops short of its page by the page's own foot padding (52px here,
       24px on a phone, above), so it is set that far below the edge. */
    margin: 0 calc(-1 * clamp(16px, 3.4vw, 56px)); padding: 12px clamp(16px, 3.4vw, 56px) 46px;
    background-color: var(--c-paper); border-top: 4px solid var(--c-ink);
  }
  #career .cr-paint-show {
    flex: 1 1 260px; display: grid; grid-template-columns: 64px minmax(0, 1fr); grid-template-rows: auto auto;
    column-gap: 12px; row-gap: 2px; align-items: center; justify-items: start; text-align: left;
    padding: 8px 12px; transform: none; box-shadow: 5px 5px 0 var(--c-ink);
  }
  #career .cr-paint-pic { width: 64px; grid-row: 1 / 3; }
  #career .cr-paint-name { font-size: 20px; align-self: end; }
  #career .cr-paint-from { align-self: start; }
  #career .cr-livery { scroll-margin-bottom: 190px; }
  #career .cr-cover-pair { grid-template-columns: minmax(0, 1fr); }
  #career .cr-fork { grid-template-columns: minmax(0, 1fr); grid-auto-rows: max-content; align-content: start; }
  #career .cr-fork-side { min-height: 0; padding-top: 64px; justify-content: flex-start; }
  #career .cr-fork-mid { width: auto; flex-direction: row; flex-wrap: wrap; }
  #career .cr-cover-balloon { padding: 14px 18px; font-size: 16px; }
  #career .cr-q { grid-template-columns: auto auto; justify-content: start; }
  #career .cr-q-text { grid-column: 1 / -1; }
}
@media (max-width: 600px) {
  #career .cr-legend { display: none; }
  #career .cr-screen.has-paper.cr-paint > .cr-paint-side { bottom: -24px; padding-bottom: 12px; }
  #career .cr-screen.has-paper { padding-bottom: 24px; scroll-padding-bottom: 0; }
  #career .cr-save-note { margin-left: 0; }
}
@media (max-height: 560px) {
  /* A phone on its side: the tray at its smallest, so the grid keeps most
     of the page. */
  #career .cr-screen.has-paper.cr-paint > .cr-paint-side { padding-top: 8px; }
  #career .cr-paint-show { grid-template-columns: 48px minmax(0, 1fr); padding: 5px 10px; }
  #career .cr-paint-pic { width: 48px; }
  #career .cr-paint-name { font-size: 17px; }
}
@media (max-height: 820px) {
  #career .cr-res-time b { font-size: clamp(28px, 3.2vw, 44px); }
  #career .cr-rung { padding: 3px 9px; }
}
@media (prefers-reduced-motion: reduce) {
  #career .cr-stick, #career .cr-stars.big .cr-star, #career .cr-res-word { animation: none !important; }
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
