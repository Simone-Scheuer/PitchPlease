import { mic } from '../audio/mic.js';
import { detector } from '../audio/detector.js';
import { songEngine } from '../audio/song-engine.js';
import { bus } from '../utils/event-bus.js';
import { qs, showToast } from '../utils/dom.js';
import { GameCanvas } from '../components/game-canvas.js';
import { songMidiRange } from '../utils/song-data.js';

const COUNTDOWN_SECS = 3;
const LOOP_GAP_MS = 3000;
const LOOP_SCORE_DISPLAY_MS = 2000;

class GameView {
  #canvas;
  #songTitleEl;
  #liveScoreEl;
  #playBtn;
  #pauseBtn;
  #restartBtn;
  #loopBtn;
  #tempoBtn;
  #difficultySelect;
  #resultsOverlay;
  #countdownEl;
  #loopScoreEl;
  #micActive = false;
  #countdownTimer = null;
  #loopTimer = null;
  #loopMode = true;
  #songPaused = false;

  // Live score tracking
  #liveScore = 0;
  #scoreFrames = 0;
  #scoreSum = 0;

  init() {
    this.#canvas = new GameCanvas(qs('#game-canvas'));
    this.#songTitleEl = qs('#game-song-title');
    this.#liveScoreEl = qs('#game-live-score');
    this.#playBtn = qs('#game-play-btn');
    this.#pauseBtn = qs('#game-pause-btn');
    this.#restartBtn = qs('#game-restart-btn');
    this.#loopBtn = qs('#game-loop-btn');
    this.#tempoBtn = qs('#game-tempo-btn');
    this.#difficultySelect = qs('#game-difficulty');
    this.#resultsOverlay = qs('#results-overlay');
    this.#countdownEl = qs('#game-countdown');
    this.#loopScoreEl = qs('#game-loop-score');

    this.#playBtn.addEventListener('click', () => this.#togglePlay());
    this.#pauseBtn.addEventListener('click', () => this.#togglePause());
    this.#restartBtn.addEventListener('click', () => this.#restart());
    this.#loopBtn.addEventListener('click', () => this.#toggleLoop());
    this.#tempoBtn.addEventListener('click', () => this.#cycleTempo());
    this.#difficultySelect.addEventListener('change', () => {
      songEngine.setDifficulty(this.#difficultySelect.value);
    });

    qs('#results-retry-btn').addEventListener('click', () => this.#retry());
    qs('#results-back-btn').addEventListener('click', () => this.#backToLibrary());

    bus.on('song:loaded', () => this.#onSongLoaded());
    bus.on('song:tick', (data) => this.#onTick(data));
    bus.on('song:end', (data) => this.#onSongEnd(data));
    bus.on('song:note-feedback', (data) => this.#onNoteFeedback(data));

    // Set initial loop button state
    this.#loopBtn.classList.add('active');
  }

  activate() {
    if (songEngine.song) {
      this.#canvas.start();
    }
  }

  deactivate() {
    this.#canvas.stop();
  }

  loadSong(song) {
    songEngine.load(song);
  }

  #onSongLoaded() {
    const song = songEngine.song;
    this.#songTitleEl.textContent = song.title;
    this.#resetScore();
    this.#reloadCanvas();
    this.#resultsOverlay.classList.remove('visible');
  }

  #resetScore() {
    this.#liveScore = 0;
    this.#scoreFrames = 0;
    this.#scoreSum = 0;
    this.#liveScoreEl.textContent = '0';
  }

  #reloadCanvas() {
    if (!songEngine.song) return;
    const [midiLow, midiHigh] = songMidiRange(songEngine.song);
    this.#canvas.loadSong(
      songEngine.noteTimings,
      midiLow,
      midiHigh,
      songEngine.totalDuration
    );
  }

  async #togglePlay() {
    if (songEngine.isRunning || this.#songPaused) {
      this.#stopAll();
    } else {
      await this.#startWithCountdown();
    }
  }

  #togglePause() {
    if (!songEngine.isRunning && !this.#songPaused) return;

    if (this.#songPaused) {
      // Resume
      songEngine.resume();
      this.#canvas.start();
      this.#songPaused = false;
      this.#pauseBtn.classList.remove('active');
    } else {
      // Pause
      songEngine.pause();
      this.#canvas.stop();
      this.#songPaused = true;
      this.#pauseBtn.classList.add('active');
    }
  }

  #toggleLoop() {
    this.#loopMode = !this.#loopMode;
    this.#loopBtn.classList.toggle('active', this.#loopMode);
  }

  async #restart() {
    this.#stopAll();
    this.#resultsOverlay.classList.remove('visible');
    this.#loopScoreEl.classList.remove('visible');
    this.#resetScore();
    this.#reloadCanvas();
    await this.#startWithCountdown();
  }

  async #startWithCountdown() {
    try {
      if (!this.#micActive) {
        await mic.start();
        detector.start();
        this.#micActive = true;
      }

      this.#playBtn.classList.add('active');
      this.#pauseBtn.classList.remove('active');
      this.#songPaused = false;
      this.#resultsOverlay.classList.remove('visible');
      this.#canvas.start();

      await this.#countdown();

      songEngine.start();
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        showToast('Microphone access denied.');
      } else {
        showToast('Could not access microphone.');
      }
    }
  }

  #countdown() {
    return new Promise((resolve) => {
      let remaining = COUNTDOWN_SECS;
      this.#countdownEl.textContent = remaining;
      this.#countdownEl.classList.add('visible');

      this.#countdownTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(this.#countdownTimer);
          this.#countdownTimer = null;
          this.#countdownEl.classList.remove('visible');
          resolve();
        } else {
          this.#countdownEl.textContent = remaining;
        }
      }, 1000);
    });
  }

  #stopAll() {
    if (this.#countdownTimer) {
      clearInterval(this.#countdownTimer);
      this.#countdownTimer = null;
      this.#countdownEl.classList.remove('visible');
    }
    if (this.#loopTimer) {
      clearTimeout(this.#loopTimer);
      this.#loopTimer = null;
    }
    songEngine.stop();
    this.#canvas.stop();
    this.#playBtn.classList.remove('active');
    this.#pauseBtn.classList.remove('active');
    this.#songPaused = false;
    this.#loopScoreEl.classList.remove('visible');
  }

  #cycleTempo() {
    const scales = [1, 0.75, 0.5];
    const labels = ['1x', '0.75x', '0.5x'];
    const current = songEngine.tempoScale;
    const idx = scales.indexOf(current);
    const next = (idx + 1) % scales.length;
    songEngine.setTempoScale(scales[next]);
    this.#tempoBtn.textContent = labels[next];
    this.#reloadCanvas();
  }

  #onTick(data) {
    this.#canvas.updateElapsed(data.elapsed);
  }

  #onNoteFeedback(data) {
    this.#scoreFrames++;
    if (data.inTune) {
      this.#scoreSum += 100;
    } else if (data.close) {
      this.#scoreSum += 50;
    }
    this.#liveScore = Math.round(this.#scoreSum / this.#scoreFrames);
    this.#liveScoreEl.textContent = this.#liveScore;
  }

  #onSongEnd(data) {
    if (this.#loopMode) {
      this.#handleLoopEnd(data.scores);
    } else {
      this.#playBtn.classList.remove('active');
      this.#canvas.stop();
      this.#showResults(data.scores);
    }
  }

  #handleLoopEnd(scores) {
    // Show brief popup score
    this.#loopScoreEl.textContent = scores.overall;
    this.#loopScoreEl.className = 'game__loop-score visible';
    if (scores.overall >= 80) this.#loopScoreEl.classList.add('great');
    else if (scores.overall >= 50) this.#loopScoreEl.classList.add('good');
    else this.#loopScoreEl.classList.add('poor');

    // After gap, restart the song (no countdown on loops)
    this.#loopTimer = setTimeout(() => {
      this.#loopScoreEl.classList.remove('visible');
      this.#resetScore();
      this.#reloadCanvas();
      this.#canvas.start();
      songEngine.start();
    }, LOOP_GAP_MS);
  }

  #showResults(scores) {
    const overlay = this.#resultsOverlay;

    const scoreEl = qs('.results__score', overlay);
    scoreEl.textContent = scores.overall;
    scoreEl.className = 'results__score';
    if (scores.overall >= 80) scoreEl.classList.add('great');
    else if (scores.overall >= 50) scoreEl.classList.add('good');
    else scoreEl.classList.add('poor');

    const labelEl = qs('.results__label', overlay);
    if (scores.overall >= 90) labelEl.textContent = 'Perfect!';
    else if (scores.overall >= 80) labelEl.textContent = 'Great job!';
    else if (scores.overall >= 60) labelEl.textContent = 'Good effort';
    else if (scores.overall >= 40) labelEl.textContent = 'Keep practicing';
    else labelEl.textContent = 'Try again';

    const notesContainer = qs('.results__notes', overlay);
    notesContainer.innerHTML = '';

    for (const note of scores.notes) {
      const row = document.createElement('div');
      row.className = 'results__note-row';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'results__note-name';
      nameSpan.textContent = note.noteStr;

      const barDiv = document.createElement('div');
      barDiv.className = 'results__note-bar';
      const fillDiv = document.createElement('div');
      fillDiv.className = 'results__note-fill';
      if (note.score >= 80) fillDiv.classList.add('great');
      else if (note.score >= 50) fillDiv.classList.add('good');
      else fillDiv.classList.add('poor');
      fillDiv.style.width = `${note.score}%`;
      barDiv.appendChild(fillDiv);

      const scoreSpan = document.createElement('span');
      scoreSpan.className = 'results__note-score';
      scoreSpan.textContent = note.score;

      row.appendChild(nameSpan);
      row.appendChild(barDiv);
      row.appendChild(scoreSpan);
      notesContainer.appendChild(row);
    }

    overlay.classList.add('visible');
  }

  #retry() {
    this.#resultsOverlay.classList.remove('visible');
    this.#restart();
  }

  #backToLibrary() {
    this.#resultsOverlay.classList.remove('visible');
    this.#stopAll();
    bus.emit('navigate', { view: 'play-view' });
  }
}

export const gameView = new GameView();
