/**
 * analyze-audio.mjs — Offline spectral analysis for drone captures.
 *
 * Usage:
 *   node tools/analyze-audio.mjs <file.pcm16> <sampleRate> \
 *     [--chord G:dom7] [--register low|high] [--a4 440] [--bar 2000]
 *
 * Input: mono 16-bit LE PCM (from tools/audio-capture.js).
 * Reports: RMS envelope + onsets, Welch spectrum peaks matched against the
 * expected just-intonation chord (cents deviations), per-peak beating
 * (amplitude modulation depth/rate), and band-energy "mud" metrics.
 */

import { readFileSync } from 'node:fs';

// --- Expected-chord math (mirrors js/audio/drone-synth.js voicing) ----------

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const RATIOS = {
  maj: [1, 5 / 4, 3 / 2], min: [1, 6 / 5, 3 / 2],
  dom7: [1, 5 / 4, 3 / 2, 7 / 4], m7: [1, 6 / 5, 3 / 2, 9 / 5],
  maj7: [1, 5 / 4, 3 / 2, 15 / 8], sus4: [1, 4 / 3, 3 / 2],
  p5: [1, 3 / 2], dim: [1, 6 / 5, 7 / 5],
};

function midiToFreq(midi, a4 = 440) { return a4 * Math.pow(2, (midi - 69) / 12); }

function expectedFreqs(chord, register, a4) {
  if (!chord) return null;
  const [rootName, quality] = chord.split(':');
  const rootIndex = NOTE_NAMES.indexOf(rootName);
  if (rootIndex < 0 || !RATIOS[quality]) throw new Error(`bad --chord ${chord}`);
  let rootMidi = 48 + rootIndex;
  if (rootIndex > 7) rootMidi -= 12;
  if (register === 'high') rootMidi += 12;
  const rootHz = midiToFreq(rootMidi, a4);
  const tones = [
    { name: 'sub', hz: rootHz / 2 },
    ...RATIOS[quality].map((r, i) => ({ name: `tone${i} (${r.toFixed(3)}r)`, hz: rootHz * r })),
    { name: 'octave', hz: rootHz * 2 },
  ];
  return { label: chord, tones };
}

// --- FFT (iterative radix-2, real input via complex) -------------------------

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1, cwi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cwr - im[i + k + len / 2] * cwi;
        const vi = re[i + k + len / 2] * cwi + im[i + k + len / 2] * cwr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr; cwr = nwr;
      }
    }
  }
}

function hann(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
  return w;
}

// --- Load ---------------------------------------------------------------------

const [, , file, srArg, ...rest] = process.argv;
if (!file || !srArg) {
  console.error('usage: node tools/analyze-audio.mjs <file.pcm16> <sampleRate> [--chord G:dom7] [--register low|high] [--a4 440] [--bar 2000]');
  process.exit(1);
}
const sr = Number(srArg);
const opts = {};
for (let i = 0; i < rest.length; i += 2) opts[rest[i].replace('--', '')] = rest[i + 1];

const raw = readFileSync(file);
const n = Math.floor(raw.length / 2);
const x = new Float64Array(n);
for (let i = 0; i < n; i++) x[i] = raw.readInt16LE(i * 2) / 32768;
const durS = n / sr;

console.log(`\n=== ${file} — ${durS.toFixed(2)}s @ ${sr} Hz, ${n} samples ===`);

// --- RMS envelope + onsets ------------------------------------------------------

const hopMs = 20;
const hop = Math.round(sr * hopMs / 1000);
const env = [];
for (let i = 0; i + hop <= n; i += hop) {
  let s = 0;
  for (let k = 0; k < hop; k++) s += x[i + k] * x[i + k];
  env.push(Math.sqrt(s / hop));
}
const envMax = Math.max(...env, 1e-9);
const SPARK = '▁▂▃▄▅▆▇█';
const spark = (arr, cols = 100) => {
  const step = arr.length / cols;
  let out = '';
  for (let c = 0; c < cols; c++) {
    const v = arr[Math.floor(c * step)] / envMax;
    out += SPARK[Math.max(0, Math.min(7, Math.floor(v * 8)))];
  }
  return out;
};
console.log(`\nRMS envelope (peak ${(20 * Math.log10(envMax)).toFixed(1)} dBFS):`);
console.log(spark(env));

// Onsets: envelope rises by >6 dB within 60ms after a local dip
const onsets = [];
for (let i = 3; i < env.length; i++) {
  const before = (env[i - 3] + env[i - 2]) / 2;
  if (env[i] > before * 2 && env[i] > envMax * 0.15) {
    const t = i * hopMs / 1000;
    if (!onsets.length || t - onsets[onsets.length - 1] > 0.25) onsets.push(t);
  }
}
if (onsets.length > 1) {
  const gaps = onsets.slice(1).map((t, i) => t - onsets[i]);
  console.log(`onsets: ${onsets.map(t => t.toFixed(2) + 's').join(' ')}  (spacing ${gaps.map(g => g.toFixed(2)).join(', ')})`);
} else {
  console.log(`onsets: ${onsets.length ? onsets[0].toFixed(2) + 's' : 'none detected'} — sustained`);
}
const troughs = [];
for (let i = 1; i < env.length - 1; i++) {
  if (env[i] < env[i - 1] && env[i] < env[i + 1] && env[i] < envMax * 0.1) troughs.push(env[i]);
}
console.log(`floor between strikes: ${troughs.length ? (20 * Math.log10(Math.max(...troughs) / envMax)).toFixed(1) + ' dB below peak' : 'n/a (no deep troughs)'}`);

// --- Welch spectrum ------------------------------------------------------------

const W = 16384;
const win = hann(W);
const spec = new Float64Array(W / 2);
let frames = 0;
for (let start = 0; start + W <= n; start += W / 2) {
  const re = new Float64Array(W), im = new Float64Array(W);
  for (let i = 0; i < W; i++) re[i] = x[start + i] * win[i];
  fft(re, im);
  for (let k = 0; k < W / 2; k++) spec[k] += re[k] * re[k] + im[k] * im[k];
  frames++;
}
for (let k = 0; k < W / 2; k++) spec[k] /= frames;
const binHz = sr / W;

// Peak picking
const peaks = [];
for (let k = 3; k < W / 2 - 3; k++) {
  const hz = k * binHz;
  if (hz < 40 || hz > 5000) continue;
  if (spec[k] > spec[k - 1] && spec[k] > spec[k + 1] && spec[k] > spec[k - 3] && spec[k] > spec[k + 3]) {
    // parabolic interpolation for sub-bin frequency
    const a = Math.log(spec[k - 1] + 1e-30), b = Math.log(spec[k] + 1e-30), c = Math.log(spec[k + 1] + 1e-30);
    const d = 0.5 * (a - c) / (a - 2 * b + c || 1e-30);
    peaks.push({ hz: (k + d) * binHz, mag: spec[k], bin: k });
  }
}
peaks.sort((p, q) => q.mag - p.mag);
const top = peaks.slice(0, 14).sort((p, q) => p.hz - q.hz);
const magMax = Math.max(...top.map(p => p.mag), 1e-30);

const expected = expectedFreqs(opts.chord, opts.register ?? 'low', Number(opts.a4 ?? 440));
console.log(`\nTop spectral peaks${expected ? ` vs expected ${expected.label} (JI)` : ''}:`);
for (const p of top) {
  const db = (10 * Math.log10(p.mag / magMax)).toFixed(1);
  let match = '';
  if (expected) {
    let best = null;
    for (const tone of expected.tones) {
      for (let h = 1; h <= 8; h++) {
        const cents = 1200 * Math.log2(p.hz / (tone.hz * h));
        if (Math.abs(cents) < 45 && (!best || Math.abs(cents) < Math.abs(best.cents))) {
          best = { tone, h, cents };
        }
      }
    }
    match = best
      ? `  = ${best.tone.name}${best.h > 1 ? ` h${best.h}` : ''} ${best.cents >= 0 ? '+' : ''}${best.cents.toFixed(1)}¢`
      : '  = UNMATCHED';
  }
  console.log(`  ${p.hz.toFixed(1).padStart(7)} Hz  ${db.padStart(6)} dB${match}`);
}

// --- Beating (per-peak amplitude modulation via STFT bin tracking) ---------------

const SW = 4096, SH = 1024;
const swin = hann(SW);
const stftFrames = [];
for (let start = 0; start + SW <= n; start += SH) {
  const re = new Float64Array(SW), im = new Float64Array(SW);
  for (let i = 0; i < SW; i++) re[i] = x[start + i] * swin[i];
  fft(re, im);
  stftFrames.push({ re, im });
}
const frameRate = sr / SH;

console.log(`\nBeating / modulation (steady mid-capture, top 6 peaks):`);
const startF = Math.floor(stftFrames.length * 0.2);
const endF = Math.floor(stftFrames.length * 0.9);
for (const p of top.slice(0, 12).sort((a, b) => b.mag - a.mag).slice(0, 6).sort((a, b) => a.hz - b.hz)) {
  const kc = Math.round(p.hz / (sr / SW));
  const series = [];
  for (let f = startF; f < endF; f++) {
    let m = 0;
    for (let k = kc - 1; k <= kc + 1; k++) {
      const fr = stftFrames[f];
      m += Math.sqrt(fr.re[k] ** 2 + fr.im[k] ** 2);
    }
    series.push(m);
  }
  if (series.length < 8) continue;
  const mean = series.reduce((a, b) => a + b) / series.length;
  const centered = series.map(v => v - mean);
  const depth = (Math.max(...series) - Math.min(...series)) / (2 * mean || 1e-30);
  // dominant modulation rate via autocorrelation peak (0.2–10 Hz)
  let bestLag = 0, bestR = -Infinity;
  const minLag = Math.max(1, Math.floor(frameRate / 10));
  const maxLag = Math.min(centered.length - 2, Math.ceil(frameRate / 0.2));
  for (let lag = minLag; lag <= maxLag; lag++) {
    let r = 0;
    for (let i = 0; i + lag < centered.length; i++) r += centered[i] * centered[i + lag];
    if (r > bestR) { bestR = r; bestLag = lag; }
  }
  const rate = bestLag ? frameRate / bestLag : 0;
  const verdict = depth < 0.12 ? 'steady' : depth < 0.3 ? 'mild' : 'STRONG';
  console.log(`  ${p.hz.toFixed(1).padStart(7)} Hz  mod depth ${(depth * 100).toFixed(0).padStart(3)}%  @ ~${rate.toFixed(1)} Hz  ${verdict}`);
}

// --- Band energy / mud ------------------------------------------------------------

const bands = [
  ['sub <100', 0, 100], ['low 100–250', 100, 250], ['MUD 250–500', 250, 500],
  ['mid 500–1k', 500, 1000], ['hi-mid 1–2k', 1000, 2000], ['high 2–5k', 2000, 5000],
];
let totalE = 0;
const bandE = bands.map(() => 0);
let centroidNum = 0;
for (let k = 1; k < W / 2; k++) {
  const hz = k * binHz;
  if (hz > 5000) break;
  totalE += spec[k];
  centroidNum += hz * spec[k];
  bands.forEach(([, lo, hi], i) => { if (hz >= lo && hz < hi) bandE[i] += spec[k]; });
}
console.log(`\nBand energy:`);
bands.forEach(([name], i) => {
  const pct = (100 * bandE[i] / totalE);
  console.log(`  ${name.padEnd(14)} ${pct.toFixed(1).padStart(5)}%  ${'#'.repeat(Math.round(pct / 2))}`);
});
console.log(`spectral centroid: ${(centroidNum / totalE).toFixed(0)} Hz`);
console.log();
