import { bus } from '../utils/event-bus.js';
import { parseNoteString } from '../utils/song-data.js';

const TOLERANCE = { easy: 50, medium: 25, hard: 15 };

export class SongEngine {
  #song = null;
  #noteTimings = [];    // [{ midi, noteName, octave, startMs, endMs, duration, lyric, index }]
  #cursor = 0;          // current note index
  #startTime = 0;
  #elapsed = 0;
  #running = false;
  #paused = false;
  #difficulty = 'medium';
  #tempoScale = 1;      // 1 = normal, 0.5 = half speed, etc.

  // Per-note scoring accumulators
  #noteScores = [];     // [{ totalFrames, inTuneFrames, centsSum, centsCount }]

  // Loop
  #loopStart = -1;
  #loopEnd = -1;

  // rAF
  #rafId = null;
  #lastFrameTime = 0;

  get song() { return this.#song; }
  get noteTimings() { return this.#noteTimings; }
  get elapsed() { return this.#elapsed; }
  get isRunning() { return this.#running; }
  get isPaused() { return this.#paused; }
  get cursor() { return this.#cursor; }
  get difficulty() { return this.#difficulty; }
  get tolerance() { return TOLERANCE[this.#difficulty]; }
  get tempoScale() { return this.#tempoScale; }
  get totalDuration() {
    if (this.#noteTimings.length === 0) return 0;
    const last = this.#noteTimings[this.#noteTimings.length - 1];
    return last.endMs;
  }

  get noteScores() { return this.#noteScores; }

  load(song) {
    this.#song = song;
    this.#buildTimings();
    this.#cursor = 0;
    this.#elapsed = 0;
    this.#running = false;
    this.#paused = false;
    this.#loopStart = -1;
    this.#loopEnd = -1;
    this.#initScores();
    bus.emit('song:loaded', { song, timings: this.#noteTimings });
  }

  #buildTimings() {
    this.#noteTimings = [];
    let t = 0;
    for (let i = 0; i < this.#song.notes.length; i++) {
      const n = this.#song.notes[i];
      const parsed = parseNoteString(n.note);
      if (!parsed) continue;
      const duration = n.duration * this.#tempoScale;
      this.#noteTimings.push({
        midi: parsed.midi,
        noteName: parsed.noteName,
        octave: parsed.octave,
        startMs: t,
        endMs: t + duration,
        duration,
        lyric: n.lyric || null,
        noteStr: n.note,
        index: i,
      });
      t += duration;
    }
  }

  #initScores() {
    this.#noteScores = this.#noteTimings.map(() => ({
      totalFrames: 0,
      inTuneFrames: 0,
      centsSum: 0,
      centsCount: 0,
      bestCents: 999,
    }));
  }

  setDifficulty(d) {
    if (TOLERANCE[d]) this.#difficulty = d;
  }

  setTempoScale(scale) {
    this.#tempoScale = Math.max(0.25, Math.min(2, scale));
    if (this.#song) this.#buildTimings();
  }

  setLoop(startIndex, endIndex) {
    this.#loopStart = startIndex;
    this.#loopEnd = endIndex;
  }

  clearLoop() {
    this.#loopStart = -1;
    this.#loopEnd = -1;
  }

  start() {
    if (this.#running) return;
    this.#running = true;
    this.#paused = false;
    this.#elapsed = 0;
    this.#cursor = this.#loopStart >= 0 ? this.#loopStart : 0;
    this.#initScores();
    this.#startTime = performance.now();
    this.#lastFrameTime = this.#startTime;

    bus.on('pitch', this.#onPitch);
    bus.on('silence', this.#onSilence);
    this.#tick();
    bus.emit('song:start', {});
  }

  stop() {
    this.#running = false;
    this.#paused = false;
    if (this.#rafId) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
    bus.off('pitch', this.#onPitch);
    bus.off('silence', this.#onSilence);
  }

  pause() {
    this.#paused = true;
  }

  resume() {
    if (this.#paused) {
      this.#paused = false;
      this.#lastFrameTime = performance.now();
    }
  }

  #tick() {
    if (!this.#running) return;

    const now = performance.now();
    if (!this.#paused) {
      this.#elapsed += now - this.#lastFrameTime;
    }
    this.#lastFrameTime = now;

    // Find current note
    const activeNote = this.#getActiveNote();
    if (activeNote) {
      this.#cursor = activeNote.index;
    }

    // Check song end or loop
    const endMs = this.#loopEnd >= 0
      ? this.#noteTimings[Math.min(this.#loopEnd, this.#noteTimings.length - 1)]?.endMs ?? this.totalDuration
      : this.totalDuration;

    if (this.#elapsed >= endMs) {
      if (this.#loopStart >= 0) {
        // Loop back
        const loopStartMs = this.#noteTimings[this.#loopStart]?.startMs ?? 0;
        this.#elapsed = loopStartMs;
        this.#cursor = this.#loopStart;
      } else {
        // Song finished
        this.stop();
        bus.emit('song:end', { scores: this.#computeFinalScores() });
        return;
      }
    }

    bus.emit('song:tick', {
      elapsed: this.#elapsed,
      cursor: this.#cursor,
      activeNote,
    });

    this.#rafId = requestAnimationFrame(() => this.#tick());
  }

  #getActiveNote() {
    for (const t of this.#noteTimings) {
      if (this.#elapsed >= t.startMs && this.#elapsed < t.endMs) {
        return t;
      }
    }
    return null;
  }

  #onPitch = (data) => {
    if (!this.#running || this.#paused) return;
    const activeNote = this.#getActiveNote();
    if (!activeNote) return;

    const score = this.#noteScores[activeNote.index];
    if (!score) return;

    score.totalFrames++;
    const centsOff = Math.abs(data.midi - activeNote.midi) * 100 + Math.abs(data.cents);
    // More precise: compute actual cents distance
    const exactCents = (data.midi - activeNote.midi) * 100 + data.cents;
    const absCents = Math.abs(exactCents);

    score.centsSum += absCents;
    score.centsCount++;
    score.bestCents = Math.min(score.bestCents, absCents);

    if (absCents <= this.tolerance) {
      score.inTuneFrames++;
    }

    bus.emit('song:note-feedback', {
      noteIndex: activeNote.index,
      absCents,
      inTune: absCents <= this.tolerance,
      close: absCents <= this.tolerance * 2,
    });
  };

  #onSilence = () => {
    if (!this.#running || this.#paused) return;
    const activeNote = this.#getActiveNote();
    if (!activeNote) return;

    const score = this.#noteScores[activeNote.index];
    if (score) score.totalFrames++;
  };

  #computeFinalScores() {
    const results = this.#noteTimings.map((timing, i) => {
      const s = this.#noteScores[i];
      const holdPct = s.totalFrames > 0 ? s.inTuneFrames / s.totalFrames : 0;
      const avgCents = s.centsCount > 0 ? s.centsSum / s.centsCount : 999;
      const accuracy = Math.max(0, 1 - avgCents / this.tolerance);
      const noteScore = Math.round(accuracy * holdPct * 100);

      return {
        noteStr: timing.noteStr,
        noteName: timing.noteName,
        octave: timing.octave,
        midi: timing.midi,
        score: noteScore,
        holdPct: Math.round(holdPct * 100),
        avgCents: Math.round(avgCents),
        bestCents: s.bestCents === 999 ? null : Math.round(s.bestCents),
        totalFrames: s.totalFrames,
        inTuneFrames: s.inTuneFrames,
      };
    });

    const overall = results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
      : 0;

    return { overall, notes: results };
  }
}

export const songEngine = new SongEngine();
