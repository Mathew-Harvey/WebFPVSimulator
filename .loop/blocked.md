# Blocked, with reasons

Items that cannot be closed inside this container. Each one names what a
human has to supply. Nothing here has been faked or softened, and no
threshold has been touched.

## 1. Validating the plant against a real quad

Needs real Betaflight blackbox logs from a physical 6S five inch race
build, covering hard cornering, a full throttle straight, a dive into
propwash, a Split-S, a low proximity pass, and a tumble recovery. There
are none in the repository and they cannot be generated from the
simulator without begging the question. Until a human supplies logs, the
claim "flight feel indistinguishable from a real quad" rests on the
plant's derivation and on stock Betaflight defaults flying it cleanly,
not on measurement against reality.

## 2. Absolute frame rate on target hardware

This container has software rasterisation only (Chromium with
--use-angle=swiftshader). Measured frame rates here are around 5 to 8
frames per second at 1600 by 900 and say nothing about a discrete GPU at
1440p. Relative cost is measurable and is measured: draw calls,
triangles, and frame time deltas between two builds on the same
rasteriser. No absolute frame rate claim for real hardware appears
anywhere in this repository.

## 3. End to end photon latency

Stick to photon latency needs a camera pointed at a screen, or at least
a real display's present timing. In headless Chromium there is no
present. What is measurable here is the internal path: how many
milliseconds of simulated time sit between a stick sample being taken
and the frame that shows its consequence. That is measured and reported
separately; it is a lower bound on the real figure, not the real figure.

## 4. Real radio hardware

The Gamepad API path cannot be exercised without a gamepad. Chromium's
DevTools protocol has no gamepad injection, so the calibration wizard
and the stick driven menu navigation are reviewed by reading the code and
by the keyboard equivalents, not by driving a real radio. A human with a
radio in joystick mode has to confirm the axis mapping wizard end to
end.

## Container notes, not blockers

- `emcc` and the `vendor/betaflight` submodule were both absent when this
  container started, which made check 1 (build-clean) fail for want of a
  toolchain rather than for a code reason. Fixed inside the container by
  cloning the submodule and installing emsdk 3.1.61 at /opt/emsdk. Any
  fresh container needs the same two steps before `npm run verify` can
  report 12 of 13:
      git submodule update --init --depth 1 vendor/betaflight
      git clone --depth 1 https://github.com/emscripten-core/emsdk /opt/emsdk
      cd /opt/emsdk && ./emsdk install 3.1.61 && ./emsdk activate 3.1.61
      source /opt/emsdk/emsdk_env.sh
- The rebuilt module under emsdk 3.1.61 produces the same replay hash as
  the committed one, 000931016224, which is evidence for the determinism
  claim across toolchain versions as well as across hosts.
