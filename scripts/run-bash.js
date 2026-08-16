/*
 * run-bash.js: run a .sh script with a real bash, not the Windows WSL stub.
 *
 * `npm run build:wasm` used to call `bash`, and on Windows that is often
 * %LOCALAPPDATA%\Microsoft\WindowsApps\bash.exe, which pops
 * "WSL installation appears to be corrupted" and never runs the script.
 * Git Bash is the one this project actually uses. This file prefers it,
 * then any other bash that is not that stub.
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

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function isWslStub(p) {
  return p.replace(/\\/g, '/').toLowerCase().includes('/windowsapps/bash');
}

function findBash() {
  const home = homedir();
  const listed = [
    process.env.SIM_BASH,
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    join(home, 'AppData', 'Local', 'Programs', 'Git', 'bin', 'bash.exe'),
    '/bin/bash',
    '/usr/bin/bash',
  ];
  for (const c of listed) {
    if (c && existsSync(c) && !isWslStub(c)) {
      return c;
    }
  }
  return 'bash';
}

const script = process.argv[2];
if (!script) {
  console.error('run-bash: pass a script path, e.g. scripts/build-wasm.sh');
  process.exit(1);
}

const bash = findBash();
const env = { ...process.env };
const prepend = [];
const emshim = join(homedir(), '.emshim');
if (existsSync(emshim)) {
  prepend.push(emshim);
}
const gitBin = dirname(bash);
if (gitBin && gitBin !== '.') {
  prepend.push(gitBin);
}
if (prepend.length > 0) {
  const sep = process.platform === 'win32' ? ';' : ':';
  env.PATH = `${prepend.join(sep)}${sep}${env.PATH || ''}`;
}

const run = spawnSync(bash, [script], {
  cwd: root,
  env,
  stdio: 'inherit',
});
process.exit(run.status ?? 1);
