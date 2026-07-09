/**
 * app.js — Boot: skin, view registry, dock nav, settings drawer, SW.
 *
 * Exactly ONE view visibility mechanism: `.view.active` (display flip in
 * layout.css). Every view is a controller with init/activate/deactivate;
 * switching always deactivates the old view before activating the new one.
 */

import { graphView } from './views/graph-view.js';
import { tunerView } from './views/tuner-view.js';
import { bendsView } from './views/bends-view.js';
import { settingsDrawer, applySkin } from './views/settings-drawer.js';
import { settings } from './utils/settings.js';
import { refresh as refreshThemeColors } from './utils/theme-colors.js';
import { qs, qsa } from './utils/dom.js';

// ?dev skips the service worker so local edits aren't served cache-first
const DEV_MODE = new URLSearchParams(location.search).has('dev');
if ('serviceWorker' in navigator && !DEV_MODE) {
  navigator.serviceWorker.register('./sw.js').catch(err => {
    console.warn('Service worker registration failed:', err);
  });
} else if ('serviceWorker' in navigator && DEV_MODE) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
  if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
}

// Apply the persisted skin before first paint
applySkin(settings.get('skin'));

const VIEWS = {
  'graph-view': graphView,
  'tuner-view': tunerView,
  'bends-view': bendsView,
};

let activeViewId = 'graph-view';

function switchView(viewId) {
  if (!(viewId in VIEWS) || viewId === activeViewId) return;

  VIEWS[activeViewId].deactivate?.();
  qs(`#${activeViewId}`)?.classList.remove('active');

  qs(`#${viewId}`)?.classList.add('active');
  VIEWS[viewId].activate?.();
  activeViewId = viewId;

  for (const tab of qsa('.dock__tab')) {
    tab.classList.toggle('active', tab.dataset.view === viewId);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  refreshThemeColors();

  graphView.init();
  tunerView.init();
  bendsView.init();
  settingsDrawer.init();

  for (const tab of qsa('.dock__tab')) {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  }

  graphView.activate();

  if (DEV_MODE) window.__views = VIEWS;
});
