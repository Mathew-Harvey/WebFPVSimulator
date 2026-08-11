/*
 * simmod.js: load dist/sim.wasm and wrap the ABI from src/native/sim_abi.h.
 *
 * Environment-neutral module, runs unchanged in Node and the browser. The
 * module is built with STANDALONE_WASM, so it exports its own memory and
 * the C names directly. Imports the module may request (WASI shims from
 * libc) are satisfied with no-op stubs; the physics path must never depend
 * on them.
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

export const SIM_OK = 0;
export const SIM_ERR_NOT_IMPLEMENTED = -1;
export const SIM_ERR_BAD_ARG = -2;
export const SIM_ERR_BAD_STATE = -3;
export const SIM_ERR_CONFIG_PARSE = -4;
export const SIM_ABI_VERSION = 1;

const ERROR_NAMES = new Map([
  [SIM_OK, 'OK'],
  [SIM_ERR_NOT_IMPLEMENTED, 'NOT_IMPLEMENTED'],
  [SIM_ERR_BAD_ARG, 'BAD_ARG'],
  [SIM_ERR_BAD_STATE, 'BAD_STATE'],
  [SIM_ERR_CONFIG_PARSE, 'CONFIG_PARSE'],
]);

export function simErrorName(code) {
  return ERROR_NAMES.get(code) ?? `ERR_${code}`;
}

function stubImports() {
  // Any import the toolchain asks for resolves to a function returning 0.
  // The stub and the implemented module alike must not rely on host
  // behaviour here; this exists only so instantiation never fails on a
  // libc shim name.
  const moduleCache = new Map();
  return new Proxy(
    {},
    {
      get(_target, moduleName) {
        if (!moduleCache.has(moduleName)) {
          moduleCache.set(
            moduleName,
            new Proxy(
              {},
              {
                get: () => () => 0,
              },
            ),
          );
        }
        return moduleCache.get(moduleName);
      },
    },
  );
}

export async function loadSim(wasmBytes) {
  const { instance } = await WebAssembly.instantiate(wasmBytes, stubImports());
  const exports = instance.exports;
  // STANDALONE_WASM emits _initialize for constructors when there is no main.
  if (typeof exports._initialize === 'function') {
    exports._initialize();
  }
  const required = [
    'sim_abi_version',
    'sim_init',
    'sim_reset',
    'sim_set_cell_voltage',
    'sim_input',
    'sim_step',
    'sim_motor_override',
    'sim_state_size',
    'sim_state',
    'malloc',
    'free',
  ];
  for (const name of required) {
    if (typeof exports[name] !== 'function') {
      throw new Error(`sim.wasm does not export ${name}`);
    }
  }
  if (!(exports.memory instanceof WebAssembly.Memory)) {
    throw new Error('sim.wasm does not export its memory');
  }
  return new Sim(exports);
}

export class Sim {
  constructor(exports) {
    this.e = exports;
    this.statePtr = 0;
    this.stateDoubles = 0;
  }

  abiVersion() {
    return this.e.sim_abi_version();
  }

  init(diffText) {
    const bytes = new TextEncoder().encode(diffText);
    const ptr = this.e.malloc(bytes.length || 1);
    if (!ptr) {
      throw new Error('sim.wasm malloc failed');
    }
    new Uint8Array(this.e.memory.buffer, ptr, bytes.length).set(bytes);
    const code = this.e.sim_init(ptr, bytes.length);
    this.e.free(ptr);
    return code;
  }

  reset() {
    return this.e.sim_reset();
  }

  setCellVoltage(volts) {
    return this.e.sim_set_cell_voltage(volts);
  }

  input(tSeconds, roll, pitch, yaw, throttle) {
    return this.e.sim_input(tSeconds, roll, pitch, yaw, throttle);
  }

  step(n) {
    return this.e.sim_step(n);
  }

  motorOverride(motor, duty) {
    return this.e.sim_motor_override(motor, duty);
  }

  stateSize() {
    return this.e.sim_state_size();
  }

  ensureStateBuffer() {
    if (!this.statePtr) {
      const n = this.stateSize();
      if (n <= 0) {
        return n;
      }
      this.stateDoubles = n;
      this.statePtr = this.e.malloc(n * 8);
      if (!this.statePtr) {
        throw new Error('sim.wasm malloc failed for state buffer');
      }
    }
    return this.stateDoubles;
  }

  // Returns { code, state } where state is a Float64Array copy, or null on error.
  readState() {
    const n = this.ensureStateBuffer();
    if (n <= 0) {
      return { code: n, state: null };
    }
    const code = this.e.sim_state(this.statePtr);
    if (code !== SIM_OK) {
      return { code, state: null };
    }
    const view = new Float64Array(this.e.memory.buffer, this.statePtr, n);
    return { code, state: new Float64Array(view) };
  }

  // Returns { code, bytes } with the raw little-endian state block bytes,
  // used for trace hashing so no float formatting is involved.
  readStateBytes() {
    const n = this.ensureStateBuffer();
    if (n <= 0) {
      return { code: n, bytes: null };
    }
    const code = this.e.sim_state(this.statePtr);
    if (code !== SIM_OK) {
      return { code, bytes: null };
    }
    const view = new Uint8Array(this.e.memory.buffer, this.statePtr, n * 8);
    return { code, bytes: new Uint8Array(view) };
  }
}
