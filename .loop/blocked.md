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

## 5. Whether the mix actually sounds good

`scripts/audio-probe.js` renders the real audio graph offline and measures
it, so this container can prove that the mix does not scream, does not clip,
sits at a stated loudness, runs at a stated tempo, and is genuinely binaural
rather than monaural. It cannot prove the mix is pleasant. Nothing an FFT
reports distinguishes a good drum and bass bed from a competent one, and
there are no speakers here. **A human has to listen**, on headphones, to a
full throttle pass, a hover, and one lap with the bed and the focus tone
both up, and say whether they would choose to wear headphones for it.

## 6. Absolute frame rate, and P7 over a real sample, restated with this round's numbers

Unchanged as a blocker, with sharper evidence. The same build measured
worstBlockMs 53.6 over 50 frames and 16.8 over 152 frames at 1920 by 1080 in
two runs an hour apart. Six hundred frames of flight in this container is
about five minutes of wall clock per run at 1.9 frames per second at 1080p.
A human with an Iris Xe or a Vega 8 laptop settles both P7 and the 60 frames
per second contract in under a minute, and no absolute frame rate claim for
real hardware appears anywhere in this repository.

## Resolved, and recorded so a later round does not re-block it

The UTT layout coordinates were expected to be a blocker, on the grounds
that the diagram PDFs would not render in this container. They are not.
`curl` downloads the guide, the layout page is a raster image inside the
PDF's own image XObjects, and it can be extracted and measured with the
PNG decoder this repository already has. UTT 3 Bessel Run's full layout is
in .loop/evidence/r10/utt3-layout.md with its provenance. The track does not
need to be labelled an original layout under T4's second branch.

## 7. A9's byte for byte offline render, in Chromium

A9 says "The same input trace produces the same offline render, byte for
byte, in two runs." It does not, and no change to this repository can make it.

Measured: two `OfflineAudioContext` renders of the identical graph, driven by
the identical scheduled automation, **inside a single page**, differ in
293,580 of 576,000 samples. The maximum absolute difference is 2.98e-8, which
is one float32 unit in the last place, and the first differing sample is index
1. Across two processes the SHA-256 of channel 0 differs. The graph sums five
outputs into one gain node and Blink's mixing bus does not guarantee a stable
summation order between renders.

This is a property of the browser's audio engine, not of
`src/render/audio.js`. The parts of A9 that are in this project's hands do
hold and are checked: nothing in the audio path reads or writes simulator
state other than the values already exposed, `npm run verify` is unaffected,
and the analysis code is deterministic given a buffer.

`scripts/audio-probe.js` now prints a truncated SHA-256 of every rendered
channel, so the non-reproducibility is visible in every report rather than
hidden behind reductions printed to fifteen digits. Nobody noticed this for a
whole round because there was no digest.

What a human has to decide: whether A9 means bit identical, in which case it
is unsatisfiable in a browser and the item is blocked, or whether it means
reproducible to a stated tolerance, in which case the tolerance is one
float32 ULP per sample and the probe can gate on it. No threshold has been
changed either way.
