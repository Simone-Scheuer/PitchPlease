import { tunerView } from './views/tuner-view.js';
import { graphView } from './views/graph-view.js';
import { libraryView } from './views/library-view.js';
import { practiceView } from './views/practice-view.js';
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
let activeViewId = 'practice-view';

function switchView(viewId) {
  // Map play-view tab to practice-view
  const resolvedId = viewId === 'play-view' ? 'practice-view' : viewId;

  if (resolvedId === activeViewId) return;

  // Deactivate old view
  const oldEl = qs(`#${activeViewId}`);
  if (oldEl) oldEl.classList.remove('active');
  if (activeViewId === 'tuner-view') tunerView.deactivate();
  if (activeViewId === 'graph-view') graphView.deactivate();
  if (activeViewId === 'practice-view') practiceView.deactivate();
  if (activeViewId === 'game-view') gameView.deactivate();
  if (activeViewId === 'session-view') sessionView.deactivate();

  // Activate new view
  if (resolvedId === 'practice-view') {
    practiceView.activate();
  } else {
    const newEl = qs(`#${resolvedId}`);
    if (newEl) newEl.classList.add('active');
  }
  if (resolvedId === 'graph-view') graphView.activate();
  if (resolvedId === 'game-view') gameView.activate();

  activeViewId = resolvedId;

  // Update tab active state (play-view tab maps to practice-view)
  for (const tab of qsa('.view-switcher__tab')) {
    const tabTarget = tab.dataset.view === 'play-view' ? 'practice-view' : tab.dataset.view;
    tab.classList.toggle('active', tabTarget === resolvedId);
  }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  tunerView.init();
  graphView.init();
  libraryView.init();
  practiceView.init();
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
    if (activeViewId === 'practice-view') practiceView.deactivate();
    if (activeViewId === 'game-view') gameView.deactivate();

    // Track that we're in session mode so navigate back works
    activeViewId = 'session-view';
    sessionView.activate(config);
  });
});
