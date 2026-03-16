import { tunerView } from './views/tuner-view.js';
import { graphView } from './views/graph-view.js';
import { libraryView } from './views/library-view.js';
import { gameView } from './views/game-view.js';
import { sessionView } from './views/session-view.js';
import { bus } from './utils/event-bus.js';
import { qs, qsa } from './utils/dom.js';

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => {
    console.warn('Service worker registration failed:', err);
  });
}

// View management
let activeViewId = 'tuner-view';

function switchView(viewId) {
  if (viewId === activeViewId) return;

  // Deactivate old view
  const oldEl = qs(`#${activeViewId}`);
  if (oldEl) oldEl.classList.remove('active');
  if (activeViewId === 'tuner-view') tunerView.deactivate();
  if (activeViewId === 'graph-view') graphView.deactivate();
  if (activeViewId === 'game-view') gameView.deactivate();

  // Activate new view
  const newEl = qs(`#${viewId}`);
  if (newEl) newEl.classList.add('active');
  if (viewId === 'graph-view') graphView.activate();
  if (viewId === 'game-view') gameView.activate();

  activeViewId = viewId;

  // Update tab active state
  for (const tab of qsa('.view-switcher__tab')) {
    tab.classList.toggle('active', tab.dataset.view === viewId);
  }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  tunerView.init();
  graphView.init();
  libraryView.init();
  gameView.init();
  sessionView.init();

  // View switcher tabs
  for (const tab of qsa('.view-switcher__tab')) {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  }

  // Song selection → load into game and switch view
  bus.on('song:select', ({ song }) => {
    gameView.loadSong(song);
    switchView('game-view');
  });

  // Navigate event (e.g., back to library from results)
  bus.on('navigate', ({ view }) => {
    switchView(view);
  });

  // Session activation (from practice configurator)
  bus.on('session:activate', ({ config }) => {
    // Deactivate current view before entering session
    const oldEl = qs(`#${activeViewId}`);
    if (oldEl) oldEl.classList.remove('active');
    if (activeViewId === 'tuner-view') tunerView.deactivate();
    if (activeViewId === 'graph-view') graphView.deactivate();
    if (activeViewId === 'game-view') gameView.deactivate();

    sessionView.activate(config);
  });
});
