/*
 * supportprompt.js: the soft support prompt, once on every exit from a flight.
 *
 * A small, dismissible prompt shown on the title screen each time a pilot
 * leaves a flight for the menu (trigger 'exit', from the pause menu's Quit
 * to title, a results screen's Back to title, or Escape on either). It used
 * to come at a new personal best, after 20 minutes of flying and after
 * publishing a map, at most once a week; all four are gone, and nothing
 * here gates on time any more. The two opt-outs stay: Settings > Advanced >
 * Support prompts, and the localStorage key below. Never during a run.
 *
 * ON THE PAGE, NOT IN A SCREEN. Until 2026-10-05 the shell put the prompt
 * inside .screen-results or .screen-paused. A screen is pointer-events
 * none, which its children inherit, so a click on the close button or a
 * link went through to the page behind it, and the prompt went hidden with
 * the screen and came back on the next one. The builder put it inside its
 * dialog, which has none of these styles. So the prompt goes on the body,
 * the one place every page has, and whoever shows it puts it away (main.js
 * does so the moment the screen it was shown on is left).
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
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { counting, eventsUrl } from './stats.js';
import { COFFEE_TIER_URL } from './patreon.js';

const SUPPORT_PROMPT_KEY = 'webfpv.support.prompt.v1';
const SUPPORT_DISABLED_KEY = 'webfpv.support.disabled.v1';

/* The shell's settings, where Settings > Advanced > Support prompts is
 * kept: SETTINGS_KEY in src/ui/ui.js, and SHELL_SETTINGS_KEY in
 * src/trackbuilder/app.js reads the same blob. Read here so the builder,
 * which is another page and has no settings of its own for this, keeps a
 * pilot's Off as well as the shell does. */
const SHELL_SETTINGS_KEY = 'webfpv.settings.v3';

/* A link with its tags added as parameters. Appending '?utm_source=...' to
 * an address that already had a query wrote two question marks into the
 * Patreon link, and the tier id became '29740590?utm_source=sim-prompt'. */
function tagged(base, params) {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.href;
}

/* Stripe tip link: one-off, USD $5 suggested, payer can change the amount */
export const TIP_URL = 'https://donate.stripe.com/7sY4gzaAC2Eu3aOews8so0g';


/* The last time the prompt was shown. A record only: nothing gates on it. */
function writePromptState(lastShownMs) {
  try {
    localStorage.setItem(SUPPORT_PROMPT_KEY, JSON.stringify({ lastShownMs }));
    return true;
  } catch (e) {
    return false;
  }
}

/* Check if the prompt is disabled in settings: this module's own key, or
 * the shell's Support prompts switch set to Off. */
export function isPromptDisabled() {
  try {
    if (localStorage.getItem(SUPPORT_DISABLED_KEY) === 'true') {
      return true;
    }
    const raw = localStorage.getItem(SHELL_SETTINGS_KEY);
    const shell = raw ? JSON.parse(raw) : null;
    return Boolean(shell && shell.supportPrompts === false);
  } catch (e) {
    return false;
  }
}

export function disablePrompt() {
  try {
    localStorage.setItem(SUPPORT_DISABLED_KEY, 'true');
    return true;
  } catch (e) {
    return false;
  }
}

/* Every exit shows it, unless the pilot has said no. */
export function canShowPrompt() {
  return !isPromptDisabled();
}

/* Record that the prompt was shown and send a tracking beacon */
function recordPromptShown(trigger) {
  writePromptState(Date.now());
  try {
    if (counting()) {
      const body = JSON.stringify({ v: 1, kind: 'support_prompt_shown', source: `sim-${trigger}` });
      navigator.sendBeacon(eventsUrl(), new Blob([body], { type: 'text/plain;charset=UTF-8' }));
    }
  } catch (e) {
    /* No beacon in this browser, or it refused. The prompt is already showing. */
  }
}

/* Record a click on one of the support options. The board counts a
 * support click from 'sim' or 'landing' and refuses any other source
 * (SUPPORT_SOURCES in its src/validate.js), so the 'sim-prompt-pb' this
 * sent was never counted. A prompt's click is the simulator's; which
 * prompt it was rides on the link itself, as ref and client_reference_id. */
function recordPromptClick(trigger, target) {
  try {
    if (counting()) {
      const body = JSON.stringify({ v: 1, kind: 'support_click', source: 'sim', target });
      navigator.sendBeacon(eventsUrl(), new Blob([body], { type: 'text/plain;charset=UTF-8' }));
    }
  } catch (e) {
    /* No beacon */
  }
}

/*
 * Show the support prompt. `trigger` is 'exit' (the pilot left a flight
 * for the menu), and rides on the beacon's source ('sim-exit') and the tip
 * link's client_reference_id.
 * `onSettings`, when given, is what the Settings button does, and without
 * it there is no Settings button: the builder has no settings room to
 * open, and a button that only closed the prompt said otherwise. Returns
 * the prompt, on the body, or null when it is not to be shown.
 */
export function showSupportPrompt(trigger, { onSettings = null } = {}) {
  if (!canShowPrompt() || !document.body) {
    return null;
  }

  recordPromptShown(trigger);

  const prompt = document.createElement('div');
  prompt.className = 'support-prompt';
  prompt.setAttribute('role', 'dialog');
  prompt.setAttribute('aria-label', 'Support WebFPV');

  const message = document.createElement('p');
  message.className = 'support-prompt-message';
  message.textContent = 'I build WebFPV in my spare time. If you\'re enjoying it, buy me a $1 coffee on Patreon or a one-off battery to help keep it free.';

  const actions = document.createElement('div');
  actions.className = 'support-prompt-actions';

  const patreonBtn = document.createElement('a');
  patreonBtn.href = tagged(COFFEE_TIER_URL, { utm_source: 'sim-prompt', ref: 'sim-prompt' });
  patreonBtn.target = '_blank';
  patreonBtn.rel = 'noopener noreferrer';
  patreonBtn.className = 'support-prompt-btn support-prompt-btn-primary';
  patreonBtn.textContent = 'Buy Mat a coffee $1/mo';
  patreonBtn.addEventListener('click', () => {
    recordPromptClick(trigger, 'patreon');
  });

  const tipBtn = document.createElement('a');
  tipBtn.href = tagged(TIP_URL, { utm_source: 'sim-prompt', client_reference_id: `prompt-${trigger}`, ref: 'sim-prompt' });
  tipBtn.target = '_blank';
  tipBtn.rel = 'noopener noreferrer';
  tipBtn.className = 'support-prompt-btn';
  tipBtn.textContent = 'One-off $5';
  tipBtn.addEventListener('click', () => {
    recordPromptClick(trigger, 'tip');
  });

  let settingsBtn = null;
  if (typeof onSettings === 'function') {
    settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.className = 'support-prompt-btn-text';
    settingsBtn.textContent = 'Settings';
    settingsBtn.addEventListener('click', () => {
      prompt.remove();
      onSettings();
    });
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'support-prompt-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => {
    prompt.remove();
  });

  actions.append(patreonBtn, tipBtn);
  if (settingsBtn) {
    actions.append(settingsBtn);
  }
  prompt.append(closeBtn, message, actions);
  document.body.append(prompt);

  return prompt;
}
