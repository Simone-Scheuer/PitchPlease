/**
 * audio-capture.js — Dev tooling: tap the drone's output bus and hand back
 * raw PCM for offline spectral analysis (tools/analyze-audio.mjs).
 *
 * Not shipped in the app shell or the service worker precache — load it
 * on demand from the console / automation:
 *
 *   const { captureDrone } = await import('/tools/audio-capture.js');
 *   const cap = await captureDrone(8);   // seconds
 *   // cap = { sampleRate, seconds, pcm16b64 }  (mono, 16-bit LE, base64)
 *
 * Start the drone first — the tap hangs off droneSynth.output.
 */

import { droneSynth } from '../js/audio/drone-synth.js';
import { mic } from '../js/audio/mic.js';

export async function captureDrone(seconds = 8, targetRate = 22050) {
  await mic.ensureAudioContext();
  const ctx = mic.audioContext;
  const src = droneSynth.output;
  if (!src) throw new Error('Drone has never played — no output bus to tap. Start it first.');

  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0; // the tap must not double the audible output
  src.connect(proc);
  proc.connect(mute);
  mute.connect(ctx.destination);

  const chunks = [];
  proc.onaudioprocess = (e) => {
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };

  await new Promise(r => setTimeout(r, seconds * 1000));

  proc.onaudioprocess = null;
  src.disconnect(proc);
  proc.disconnect();
  mute.disconnect();

  // Concatenate, then decimate to the target rate (drones live way below Nyquist)
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) { all.set(c, offset); offset += c.length; }

  const ds = Math.max(1, Math.round(ctx.sampleRate / targetRate));
  const outLen = Math.floor(all.length / ds);
  const pcm = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    // tiny box filter while decimating to tame aliasing
    let sum = 0;
    for (let k = 0; k < ds; k++) sum += all[i * ds + k];
    const v = Math.max(-1, Math.min(1, sum / ds));
    pcm[i] = Math.round(v * 32767);
  }

  const bytes = new Uint8Array(pcm.buffer);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }

  return {
    sampleRate: ctx.sampleRate / ds,
    seconds: outLen / (ctx.sampleRate / ds),
    pcm16b64: btoa(bin),
  };
}
