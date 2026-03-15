import { bus } from '../utils/event-bus.js';
import { qs } from '../utils/dom.js';
import { STARTER_SONGS, songDuration } from '../utils/song-data.js';

class LibraryView {
  #listEl;

  init() {
    this.#listEl = qs('#library-list');
    this.#renderSongs();
  }

  #renderSongs() {
    this.#listEl.innerHTML = '';

    for (const song of STARTER_SONGS) {
      const item = document.createElement('div');
      item.className = 'library__item';
      item.addEventListener('click', () => this.#selectSong(song));

      const info = document.createElement('div');
      info.className = 'library__item-info';

      const title = document.createElement('div');
      title.className = 'library__item-title';
      title.textContent = song.title;

      const meta = document.createElement('div');
      meta.className = 'library__item-meta';
      const dur = Math.ceil(songDuration(song) / 1000);
      const parts = [];
      if (song.artist) parts.push(song.artist);
      parts.push(`${song.notes.length} notes`);
      parts.push(`${dur}s`);
      meta.textContent = parts.join(' · ');

      info.appendChild(title);
      info.appendChild(meta);

      const badge = document.createElement('span');
      badge.className = `library__item-difficulty ${song.difficulty}`;
      badge.textContent = song.difficulty;

      item.appendChild(info);
      item.appendChild(badge);
      this.#listEl.appendChild(item);
    }
  }

  #selectSong(song) {
    bus.emit('song:select', { song });
  }
}

export const libraryView = new LibraryView();
