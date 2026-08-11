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

mkdir -p dist build/obj

# Apply patches to a pristine vendor tree state check. Patches in patches/
# are applied with git apply against the vendor tree at build time and
# reverted after object compilation, so the tree stays clean. None exist
# yet; the hook is here so adding one is a one line change.
PATCHES=$(ls patches/*.patch 2>/dev/null || true)
if [ -n "$PATCHES" ]; then
  for p in $PATCHES; do
    git -C vendor/betaflight apply "../../$p"
  done
  trap 'for p in $PATCHES; do git -C vendor/betaflight apply -R "../../$p" || true; done' EXIT
fi

CFLAGS_COMMON="-std=gnu17 -O2 -fno-fast-math -ffp-contract=off"

# Simulator sources, plain includes.
SIM_SRC="src/native/sim.c src/native/plant.c src/native/bridge.c src/native/libm/sim_math.c"

# Betaflight sources compiled with the SITL target configuration, plus the
# glue that feeds the simulated gyro in and reads motor outputs back.
BF_INC="-I vendor/betaflight/src/main/target/SITL -I vendor/betaflight/src/main -DSIMULATOR_BUILD"
BF_SRC="
  src/native/bf/bf_glue.c
  src/native/bf/bf_stubs.c
  vendor/betaflight/src/main/fc/rc.c
  vendor/betaflight/src/main/fc/rc_controls.c
  vendor/betaflight/src/main/fc/rc_modes.c
  vendor/betaflight/src/main/fc/controlrate_profile.c
  vendor/betaflight/src/main/fc/runtime_config.c
  vendor/betaflight/src/main/flight/pid.c
  vendor/betaflight/src/main/flight/pid_init.c
  vendor/betaflight/src/main/flight/mixer.c
  vendor/betaflight/src/main/flight/mixer_init.c
  vendor/betaflight/src/main/common/maths.c
  vendor/betaflight/src/main/common/filter.c
  vendor/betaflight/src/main/common/bitarray.c
  vendor/betaflight/src/main/pg/rx.c
  vendor/betaflight/src/main/pg/motor.c
  vendor/betaflight/src/main/config/feature.c
  vendor/betaflight/src/main/build/debug.c
"

OBJS=""
for src in $SIM_SRC; do
  obj="build/obj/$(basename "$src" .c).o"
  emcc -c "$src" -I src/native $CFLAGS_COMMON -Wall -o "$obj"
  OBJS="$OBJS $obj"
done
for src in $BF_SRC; do
  obj="build/obj/bf_$(basename "$src" .c).o"
  emcc -c "$src" -I src/native $BF_INC $CFLAGS_COMMON -o "$obj"
  OBJS="$OBJS $obj"
done

emcc $OBJS \
  --no-entry \
  -sSTANDALONE_WASM=1 \
  -sEXPORTED_FUNCTIONS=_malloc,_free \
  -sALLOW_MEMORY_GROWTH=1 \
  -o dist/sim.wasm

echo "build:wasm: wrote dist/sim.wasm"
