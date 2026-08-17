#!/usr/bin/env bash
# build-wasm.sh: compile the physics module to dist/sim.wasm with Emscripten.
#
# Betaflight IS compiled in: its controller objects are listed below and
# linked alongside src/native. The two patches in patches/ are applied to
# the vendor tree before those objects are built and reverted by the EXIT
# trap afterwards, so vendor/betaflight is never modified in place and
# `git diff --stat vendor/betaflight` must remain empty after a build.
#
# This header used to say Loop A compiled "only the stub in sim.c" and the
# block below used to say no patches existed yet. Both were true once.
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

# Patches in patches/ are applied with git apply against the vendor tree at
# build time and reverted after object compilation, so the tree stays clean.
# There are two: 0001 adds the rotor telemetry the plant feeds the RPM
# filter, and 0002 resets runtime statics on init so a re-init is a real
# reset rather than a warm start.
# Strip CR before apply. Windows core.autocrlf checks the patch files out
# as CRLF, and git apply then fails to match the LF vendor tree. The revert
# lives in a function so the trap does not re-parse '\r' as the letter r.
apply_vendor_patches() {
  local reverse="${1:-}"
  local p
  for p in $PATCHES; do
    if [ -n "$reverse" ]; then
      tr -d $'\r' < "$p" | git -C vendor/betaflight apply $reverse || true
    else
      tr -d $'\r' < "$p" | git -C vendor/betaflight apply
    fi
  done
}
PATCHES=$(ls patches/*.patch 2>/dev/null || true)
if [ -n "$PATCHES" ]; then
  apply_vendor_patches
  trap 'apply_vendor_patches -R || true' EXIT
fi

CFLAGS_COMMON="-std=gnu17 -O2 -fno-fast-math -ffp-contract=off"

# Simulator sources, plain includes.
SIM_SRC="src/native/sim.c src/native/plant.c src/native/bridge.c src/native/libm/sim_math.c"

# Betaflight sources compiled with the SITL target configuration, plus the
# glue that feeds the simulated gyro in and reads motor outputs back.
# SIM_ROTOR_TELEMETRY is read by patches/0001: it switches on the dynamic
# notch, the RPM filter and dynamic idle. All three need DShot telemetry on
# hardware to learn rotor speed, and this simulator knows it exactly, so the
# only thing standing between them and working was a target guard.
BF_INC="-I vendor/betaflight/src/main/target/SITL -I vendor/betaflight/src/main -DSIMULATOR_BUILD -DSIM_ROTOR_TELEMETRY"
BF_SRC="
  src/native/bf/bf_glue.c
  src/native/bf/bf_settings.c
  src/native/bf/bf_stubs.c
  vendor/betaflight/src/main/sensors/gyro.c
  vendor/betaflight/src/main/sensors/gyro_init.c
  vendor/betaflight/src/main/sensors/boardalignment.c
  vendor/betaflight/src/main/config/simplified_tuning.c
  vendor/betaflight/src/main/fc/rc.c
  vendor/betaflight/src/main/fc/rc_controls.c
  vendor/betaflight/src/main/fc/rc_modes.c
  vendor/betaflight/src/main/fc/controlrate_profile.c
  vendor/betaflight/src/main/fc/runtime_config.c
  vendor/betaflight/src/main/flight/pid.c
  vendor/betaflight/src/main/flight/pid_init.c
  vendor/betaflight/src/main/flight/mixer.c
  vendor/betaflight/src/main/flight/mixer_init.c
  vendor/betaflight/src/main/flight/dyn_notch_filter.c
  vendor/betaflight/src/main/flight/rpm_filter.c
  vendor/betaflight/src/main/common/maths.c
  vendor/betaflight/src/main/common/filter.c
  vendor/betaflight/src/main/common/sdft.c
  vendor/betaflight/src/main/common/bitarray.c
  vendor/betaflight/src/main/pg/rx.c
  vendor/betaflight/src/main/pg/motor.c
  vendor/betaflight/src/main/pg/dyn_notch.c
  vendor/betaflight/src/main/pg/rpm_filter.c
  vendor/betaflight/src/main/config/feature.c
  vendor/betaflight/src/main/build/debug.c
"

OBJS=""
for src in $SIM_SRC; do
  obj="build/obj/$(basename "$src" .c).o"
  emcc -c "$src" -I src/native $CFLAGS_COMMON -Wall -o "$obj"
  OBJS="$OBJS $obj"
done
# Object names carry the parent directory. Betaflight has more than one file
# with the same basename (flight/rpm_filter.c and pg/rpm_filter.c), and a
# basename-only rule silently overwrites one with the other, which the linker
# then reports as a pile of duplicate symbols from a single object.
for src in $BF_SRC; do
  obj="build/obj/bf_$(basename "$(dirname "$src")")_$(basename "$src" .c).o"
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
