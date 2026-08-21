/*
 * music.js: encode the record crate for the wire.
 *
 * The crate arrived as thirteen mp3s averaging 189 kbps VBR, 48 kHz
 * stereo, five and three quarter megabytes a track and seventy five
 * megabytes on disk. That is a mastering bitrate for a bed that plays
 * under four motors and a wind stem, and on an ordinary connection the
 * first track is several seconds of contention with the map at exactly
 * the moment the player is trying to fly. This makes the two files the
 * shell actually serves:
 *
 *   assets/music/<id>.webm   Opus 80 kbps VBR, what almost everyone gets
 *   assets/music/<id>.mp3    LAME V7, ~110 kbps VBR, the fallback
 *
 * <id> is the track id from src/render/tracks.js, so the crate needs no
 * filename column and the URL needs no percent encoding.
 *
 * Two formats and not one because Opus at 80 kbps is roughly half the
 * bytes of the smallest mp3 anyone would ship and loses nothing measurable
 * up to 17 kHz, but Safari older than 14.1 on the desktop and 17.4 on the
 * phone cannot open a WebM at all. src/render/music.js asks canPlayType
 * first and demotes the whole session to mp3 if a WebM load fails anyway,
 * so the tail gets music rather than silence.
 *
 * NO LOUDNESS PROCESSING. Not a limiter, not loudnorm, not a gain. The
 * mix in src/render/audio.js is balanced against these tracks as they are
 * and MUSIC_BUS is 0.60 because of how hot they were mastered. Moving the
 * loudness here moves the whole mix silently. The check below asserts the
 * integrated loudness lands within 0.5 LU of the source and fails the
 * encode if it does not.
 *
 * Usage:
 *   node scripts/music.js [--src=DIR] [--only=id] [--dry]
 *
 * DIR defaults to assets/music-src, which is not in the repository: the
 * masters are the mp3s as they stood at commit f9e0804 and come back with
 *   git show f9e0804:"assets/music/Tarmac Pulse.mp3" > out.mp3
 * Needs ffmpeg with libopus and libmp3lame on PATH, the same way
 * scripts/build-wasm.sh needs emcc. It is not an npm dependency and the
 * page does not need it: the output is committed.
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

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TRACKS } from '../src/render/tracks.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'assets/music');

/*
 * 80 kbps Opus and LAME V7. Both were chosen by measurement against the
 * masters rather than by taste, and the numbers are in PROGRESS.md: at 72
 * kbps Opus already holds every octave to 17 kHz within 0.3 dB of the
 * master, so 80 is a margin on the dense tracks rather than a floor.
 */
const OPUS_KBPS = 80;
/*
 * V7 and not V6 on the fallback, which costs 1.2 dB of 16 kHz content on
 * the densest track in the crate and saves a further eleven percent. The
 * fallback is only reached by a browser too old for WebM, and a browser
 * too old for WebM is likelier to be an old phone on mobile data than a
 * desktop with a spare 400 kB. Opus already covers everyone in a position
 * to hear the difference: at 80 kbps it holds 16 kHz to within 1.0 dB of
 * the master where V6 loses 2.9 dB and V7 loses 4.1 dB, in a third fewer
 * bytes than either.
 */
const LAME_Q = 7;

/* The bed's level is a mix decision, not an encoder one. 0.5 LU is tight
 * enough to catch a stray filter and loose enough for the LUFS gate's own
 * block quantisation across two different codecs. */
const MAX_LUFS_DRIFT = 0.5;

/*
 * True peak is REPORTED and not gated, which is a decision rather than an
 * omission. Some of these masters already clip: Neon Horizon is +0.6 dBFS
 * true peak before anything here touches it, and Opus takes that to +1.4
 * while the mp3 holds +0.5. A codec cannot un-clip a master, and a gate
 * here would fail an encode over a fault it did not cause.
 *
 * It is printed because it is the number that would matter if the mix ever
 * ran the bed near full scale, and today it does not: the music bus is
 * level 0.5 times MUSIC_BUS 0.60, so 0.30, and +1.4 dBFS of source lands
 * about 10 dB below full scale in the graph. Move MUSIC_BUS and read this
 * column again.
 */
const PEAK_NOTE_DB = 1.0;

function have(cmd) {
  return spawnSync(cmd, ['-version'], { stdio: 'ignore' }).status === 0;
}

/*
 * +bitexact on the demuxer, the encoder and the muxer, because without it
 * this script is not reproducible. Matroska writes a RANDOM SegmentUID and
 * stamps in the libavformat version, so running the encode twice on the
 * same master produces two different files with the same audio in them,
 * and a re-encode shows up as a 30 MB diff nobody can review. With it, run
 * it again and `git status` is clean. It also takes 62 bytes of tool
 * version strings off every track, which is not the reason but is not
 * nothing either.
 */
const BITEXACT = ['-fflags', '+bitexact', '-flags:a', '+bitexact'];

function run(args) {
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`ffmpeg failed: ${args.join(' ')}\n${r.stderr ?? ''}`);
  }
  return r.stderr ?? '';
}

/*
 * Integrated loudness, true peak and duration. Read off ffmpeg rather
 * than guessed from the file length, because a VBR file's length is not
 * its duration and a codec change is exactly the thing that would make
 * the guess wrong.
 *
 * The loudness comes out of the block AFTER 'Summary:' and not out of the
 * first line that matches. ebur128 prints a running I: on every frame and
 * the first of those is -70 LUFS, which is the gate value for silence, so
 * a regex over the whole log compares -70 against -70 and passes whatever
 * you feed it. That is how this check was written first, and it would
 * have waved through an encode that halved the bed.
 */
function measure(file) {
  const err = run(['-hide_banner', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const cut = err.lastIndexOf('Summary:');
  const summary = cut < 0 ? '' : err.slice(cut);
  const lufs = /I:\s*(-?[\d.]+)\s*LUFS/.exec(summary);
  const peak = /Peak:\s*(-?[\d.]+)\s*dBFS/.exec(summary);
  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
    { encoding: 'utf8' },
  );
  return {
    lufs: lufs ? Number(lufs[1]) : NaN,
    peak: peak ? Number(peak[1]) : NaN,
    seconds: probe.status === 0 ? Number(probe.stdout.trim()) : NaN,
    bytes: statSync(file).size,
  };
}

/*
 * Find the master for a track. The masters have the pretty filenames the
 * crate used to carry, so match on a slug of the filename rather than on
 * an exact string: 'Copper Gypsy Run take 2.mp3' has to reach
 * 'copper-gypsy-run-take-2' without a lookup table to keep in step.
 */
function slug(name) {
  return name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function main() {
  const args = process.argv.slice(2);
  const srcArg = args.find((a) => a.startsWith('--src='));
  const only = args.find((a) => a.startsWith('--only='))?.slice(7);
  const dry = args.includes('--dry');
  const src = srcArg ? srcArg.slice(6) : join(root, 'assets/music-src');

  if (!have('ffmpeg') || !have('ffprobe')) {
    console.error('music: ffmpeg and ffprobe are not both on PATH. See the header of this file.');
    process.exit(1);
  }
  if (!existsSync(src)) {
    console.error(`music: no master directory at ${src}. See the header of this file.`);
    process.exit(1);
  }
  mkdirSync(out, { recursive: true });

  const masters = new Map();
  for (const f of readdirSync(src)) {
    if (!/\.(mp3|wav|flac|m4a|aiff?|ogg|opus)$/i.test(f)) {
      continue;
    }
    masters.set(slug(f), join(src, f));
  }

  const work = TRACKS.filter((t) => !only || t.id === only);
  if (work.length === 0) {
    console.error(`music: no track matches --only=${only}`);
    process.exit(1);
  }

  let inBytes = 0;
  let webmBytes = 0;
  let mp3Bytes = 0;
  const fails = [];

  for (const t of work) {
    const master = masters.get(t.id);
    if (!master) {
      fails.push(`${t.id}: no master in ${src} whose name slugs to ${t.id}`);
      continue;
    }
    const before = measure(master);
    inBytes += before.bytes;
    const webm = join(out, `${t.id}.webm`);
    const mp3 = join(out, `${t.id}.mp3`);

    if (dry) {
      console.log(`${t.id.padEnd(24)} would encode from ${basename(master)}`);
      continue;
    }

    /* -map_metadata -1 because an ID3 frame on a bed nobody tags is bytes
     * on the wire and a tool name in a public deploy. -vn because a master
     * with cover art would otherwise carry the jpeg into both outputs. */
    run([
      '-hide_banner', '-loglevel', 'error', '-y', '-fflags', '+bitexact', '-i', master,
      '-map_metadata', '-1', '-vn', '-ac', '2', '-ar', '48000',
      '-c:a', 'libopus', '-b:a', `${OPUS_KBPS}k`, '-vbr', 'on',
      '-compression_level', '10', '-application', 'audio',
      ...BITEXACT, webm,
    ]);
    /* 48 kHz on the fallback too, so it is a codec change and not a
     * resample as well, and so the two formats measure against the master
     * on the same grid. -write_xing is the default and is the difference
     * between a VBR mp3 whose duration the element knows on the first
     * frame and one it has to scan the whole file to learn. */
    run([
      '-hide_banner', '-loglevel', 'error', '-y', '-fflags', '+bitexact', '-i', master,
      '-map_metadata', '-1', '-vn', '-ac', '2', '-ar', '48000',
      '-c:a', 'libmp3lame', '-q:a', String(LAME_Q), '-write_xing', '1',
      ...BITEXACT, mp3,
    ]);

    const a = measure(webm);
    const b = measure(mp3);
    webmBytes += a.bytes;
    mp3Bytes += b.bytes;

    for (const [label, m] of [['webm', a], ['mp3', b]]) {
      if (!Number.isFinite(m.lufs) || Math.abs(m.lufs - before.lufs) > MAX_LUFS_DRIFT) {
        fails.push(`${t.id} ${label}: ${m.lufs} LUFS against the master's ${before.lufs}`);
      }
      if (!Number.isFinite(m.seconds) || Math.abs(m.seconds - before.seconds) > 0.5) {
        fails.push(`${t.id} ${label}: ${m.seconds} s against the master's ${before.seconds}`);
      }
    }

    const mb = (n) => (n / 1048576).toFixed(2);
    console.log(
      `${t.id.padEnd(24)} ${mb(before.bytes)} MB -> webm ${mb(a.bytes)} MB, mp3 ${mb(b.bytes)} MB` +
        `  (${before.seconds.toFixed(0)} s, ${before.lufs} LUFS)`,
    );
    for (const [label, m] of [['webm', a], ['mp3', b]]) {
      if (m.peak > 0 && m.peak - before.peak > PEAK_NOTE_DB) {
        console.log(
          `  note ${label} true peak ${m.peak} dBFS against the master's ${before.peak}.` +
            ' Not a failure, see PEAK_NOTE_DB.',
        );
      }
    }
  }

  if (!dry) {
    const mb = (n) => (n / 1048576).toFixed(1);
    console.log(
      `\ncrate ${mb(inBytes)} MB -> ${mb(webmBytes)} MB webm + ${mb(mp3Bytes)} MB mp3` +
        `  (a visitor pays one of the two: ${(webmBytes / inBytes * 100).toFixed(0)}% of the old bytes on Opus,` +
        ` ${(mp3Bytes / inBytes * 100).toFixed(0)}% on the fallback)`,
    );
  }

  if (fails.length > 0) {
    console.error('\nmusic: FAILED');
    for (const f of fails) {
      console.error(`  ${f}`);
    }
    process.exit(1);
  }
}

main();
