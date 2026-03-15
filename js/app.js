import { tunerView } from './views/tuner-view.js';

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => {
    console.warn('Service worker registration failed:', err);
  });
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  // Activate tuner view
  const tunerEl = document.getElementById('tuner-view');
  if (tunerEl) {
    tunerEl.classList.add('active');
  }

  tunerView.init();
});
