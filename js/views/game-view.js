import { mic } from '../audio/mic.js';
import { detector } from '../audio/detector.js';
import { songEngine } from '../audio/song-engine.js';
import { bus } from '../utils/event-bus.js';
import { qs, showToast } from '../utils/dom.js';
import { GameCanvas } from '../components/game-canvas.js';
import { songMidiRange } from '../utils/song-data.js';

class GameView {
  #canvas;
  #songTitleEl;
  #liveScoreEl;
  #playBtn;
  #tempoBtn;
  #difficultySelect;
  #resultsOverlay;
  #micActive = false;

  // Live score tracking
  #liveScore = 0;
  #scoreFrames = 0;
  #scoreSum = 0;

  init() {
    this.#canvas = new GameCanvas(qs('#game-canvas'));
    this.#songTitleEl = qs('#game-song-title');
    this.#liveScoreEl = qs('#game-live-score');
    this.#playBtn = qs('#game-play-btn');
    this.#tempoBtn = qs('#game-tempo-btn');
    this.#difficultySelect = qs('#game-difficulty');
    this.#resultsOverlay = qs('#results-overlay');

    this.#playBtn.addEventListener('click', () => this.#togglePlay());
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
    this.#liveScoreEl.textContent = '0';
    this.#liveScore = 0;
    this.#scoreFrames = 0;
    this.#scoreSum = 0;

    const [midiLow, midiHigh] = songMidiRange(song);
    this.#canvas.loadSong(
      songEngine.noteTimings,
      midiLow,
      midiHigh,
      songEngine.totalDuration
    );
    this.#resultsOverlay.classList.remove('visible');
  }

  async #togglePlay() {
    if (songEngine.isRunning) {
      this.#stopAll();
    } else {
      await this.#startPlaying();
    }
  }

  async #startPlaying() {
    try {
      if (!this.#micActive) {
        await mic.start();
        detector.start();
        this.#micActive = true;
      }
      this.#canvas.start();
      songEngine.start();
      this.#playBtn.classList.add('active');
      this.#resultsOverlay.classList.remove('visible');
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        showToast('Microphone access denied.');
      } else {
        showToast('Could not access microphone.');
      }
    }
  }

  #stopAll() {
    songEngine.stop();
    this.#canvas.stop();
    this.#playBtn.classList.remove('active');
  }

  #stopMic() {
    detector.stop();
    mic.stop();
    this.#micActive = false;
  }

  #cycleTempo() {
    const scales = [1, 0.75, 0.5];
    const labels = ['1x', '0.75x', '0.5x'];
    const current = songEngine.tempoScale;
    const idx = scales.indexOf(current);
    const next = (idx + 1) % scales.length;
    songEngine.setTempoScale(scales[next]);
    this.#tempoBtn.textContent = labels[next];

    // Reload timings into canvas
    if (songEngine.song) {
      const [midiLow, midiHigh] = songMidiRange(songEngine.song);
      this.#canvas.loadSong(
        songEngine.noteTimings,
        midiLow,
        midiHigh,
        songEngine.totalDuration
      );
    }
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
    this.#playBtn.classList.remove('active');
    this.#canvas.stop();
    this.#showResults(data.scores);
  }

  #showResults(scores) {
    const overlay = this.#resultsOverlay;

    // Overall score
    const scoreEl = qs('.results__score', overlay);
    scoreEl.textContent = scores.overall;
    scoreEl.className = 'results__score';
    if (scores.overall >= 80) scoreEl.classList.add('great');
    else if (scores.overall >= 50) scoreEl.classList.add('good');
    else scoreEl.classList.add('poor');

    // Label
    const labelEl = qs('.results__label', overlay);
    if (scores.overall >= 90) labelEl.textContent = 'Perfect!';
    else if (scores.overall >= 80) labelEl.textContent = 'Great job!';
    else if (scores.overall >= 60) labelEl.textContent = 'Good effort';
    else if (scores.overall >= 40) labelEl.textContent = 'Keep practicing';
    else labelEl.textContent = 'Try again';

    // Per-note breakdown
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
    this.#startPlaying();
  }

  #backToLibrary() {
    this.#resultsOverlay.classList.remove('visible');
    this.#stopAll();
    bus.emit('navigate', { view: 'play-view' });
  }
}

export const gameView = new GameView();
