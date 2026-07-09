export const qs = (selector, parent = document) => parent.querySelector(selector);
export const qsa = (selector, parent = document) => [...parent.querySelectorAll(selector)];

export function showToast(message, duration = 2500) {
  const el = qs('#toast');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => el.classList.remove('visible'), duration);
}

/** Update the chrome STATUS readout (word + live indicator). */
export function setStatus(word, live) {
  const wordEl = qs('#status-word');
  const boxEl = qs('#chrome-status');
  if (!wordEl || !boxEl) return;
  wordEl.textContent = word;
  boxEl.classList.toggle('chrome__status--live', !!live);
}
