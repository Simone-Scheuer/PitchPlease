export class FrequencyDisplay {
  #el;

  constructor(el) {
    this.#el = el;
  }

  update({ frequency }) {
    this.#el.textContent = `${frequency.toFixed(1)} Hz`;
  }

  clear() {
    this.#el.textContent = '--- Hz';
  }

  destroy() {
    this.#el = null;
  }
}
