#!/usr/bin/env bash
# build-wasm.sh: compile the physics module to dist/sim.wasm with Emscripten.
#
# Stage 1 Loop A compiles only the stub in src/native/sim.c. When Loop B
# brings in Betaflight, the flow stays the same shape: copy the needed
# vendor/betaflight sources into a build directory, apply patches/*.patch to
# that copy, and add the objects to this link. vendor/betaflight itself is
# never modified in place; `git diff --stat vendor/betaflight` must remain
# empty after a build.
#
# Determinism flags are load-bearing: no fast math, no fp contraction, no
# relaxed SIMD. Do not remove them.
#
# This file is part of WebFPVSimulator.
#
# WebFPVSimulator is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or (at
# your option) any later version.
#
# WebFPVSimulator is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY, without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
# General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.

set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v emcc >/dev/null 2>&1; then
  for d in "${EMSDK:-}" "$HOME/emsdk" /opt/emsdk; do
    if [ -n "$d" ] && [ -f "$d/emsdk_env.sh" ]; then
      # shellcheck disable=SC1091
      source "$d/emsdk_env.sh" >/dev/null 2>&1 || true
      break
    fi
  done
fi

if ! command -v emcc >/dev/null 2>&1; then
  echo "build:wasm: emcc not found. Install emsdk (https://emscripten.org) or set EMSDK." >&2
  exit 1
fi

mkdir -p dist

emcc src/native/sim.c \
  -I src/native \
  -std=c11 \
  -Wall \
  -O2 \
  -fno-fast-math \
  -ffp-contract=off \
  --no-entry \
  -sSTANDALONE_WASM=1 \
  -sEXPORTED_FUNCTIONS=_malloc,_free \
  -sALLOW_MEMORY_GROWTH=1 \
  -o dist/sim.wasm

echo "build:wasm: wrote dist/sim.wasm"
