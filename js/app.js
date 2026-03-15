import { tunerView } from './views/tuner-view.js';
import { graphView } from './views/graph-view.js';
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
  if (activeViewId === 'graph-view') graphView.deactivate();

  // Activate new view
  const newEl = qs(`#${viewId}`);
  if (newEl) newEl.classList.add('active');
  if (viewId === 'graph-view') graphView.activate();

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

  // View switcher tabs
  for (const tab of qsa('.view-switcher__tab')) {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  }
});
