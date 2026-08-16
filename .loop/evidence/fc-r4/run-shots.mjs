/*
 * Drive scripts/shots.js with JS string args so PowerShell cannot eat quotes.
 * Evidence for Configurator round 4: classic 10.10 homage chrome.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const chrome = process.env.SIM_CHROME_BIN
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const steps = [
  'until:!!window.__fc',
  'wait:500',
  'tap:ArrowDown',
  'tap:ArrowDown',
  'tap:ArrowDown',
  'tap:ArrowDown',
  'tap:Enter',
  "until:window.__ui.screen==='fc'",
  'wait:400',
  'eval:window.__fc()',
  "expect:(function(){var e=document.querySelector('.fc-head');return e&&getComputedStyle(e).backgroundColor==='rgb(255, 187, 0)';})()",
  "expect:(function(){var s=window.__fc();return s.homage===true&&s.chrome===true&&s.status===true&&s.tabs===24;})()",
  'shot:fc-pid',
  "eval:void(window.__ui.fc.setTab('cli'),window.__ui.renderMenu())",
  "until:window.__fc().tab==='cli'",
  'wait:200',
  'shot:fc-cli',
  "eval:void(window.__ui.fc.setTab('osd'),window.__ui.renderMenu())",
  "until:window.__fc().tab==='osd'",
  'wait:200',
  'shot:fc-osd',
  "eval:void(window.__ui.fc.setTab('pid'),window.__ui.fc.page='filters',window.__ui.renderMenu())",
  "until:window.__fc().page==='filters'",
  'wait:200',
  'shot:fc-filters',
  "eval:void(window.__ui.fc.setTab('pid'),window.__ui.fc.page='rates',window.__ui.renderMenu())",
  "until:window.__fc().page==='rates'",
  'wait:200',
  'shot:fc-rates',
  "eval:void(window.__ui.fc.setTab('configuration'),window.__ui.renderMenu())",
  "until:window.__fc().tab==='configuration'",
  'wait:200',
  'shot:fc-configuration',
  'tap:Escape',
  "until:window.__ui.screen==='title'",
  'tap:Enter',
  "until:window.__ui.screen==='flight'",
  'wait:400',
  'tap:Escape',
  "until:window.__ui.screen==='paused'",
  'tap:ArrowDown',
  'tap:ArrowDown',
  'tap:ArrowDown',
  'tap:Enter',
  "until:window.__ui.screen==='fc'",
  "eval:void(window.__ui.fc.runActive=true,window.__ui.fc.setValue('p_roll','80'),window.__ui.renderMenu())",
  'expect:window.__fc().dirty',
  "eval:window.__ui.act('fc-save')",
  "until:window.__fc().confirm==='save-run'",
  'wait:200',
  'shot:fc-save-confirm',
  "eval:window.__ui.act('fc-save-restart')",
  "until:window.__ui.screen==='flight'",
  'wait:250',
  'eval:window.__fc()',
  'expect:(function(){var s=window.__fc();return s.simStepMs===s.moduleMs&&s.lastTs<=s.simStepMs/1000+1e-9;})()',
];

const child = spawn(
  process.execPath,
  ['scripts/shots.js', `--out=${here}`, '--w=1600', '--h=900', ...steps],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, SIM_CHROME_BIN: chrome },
  },
);
child.on('exit', (code) => process.exit(code ?? 1));
