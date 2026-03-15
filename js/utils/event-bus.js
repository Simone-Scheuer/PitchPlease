class EventBus {
  #listeners = new Map();

  on(event, fn) {
    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, new Set());
    }
    this.#listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const fns = this.#listeners.get(event);
    if (fns) fns.delete(fn);
  }

  emit(event, data) {
    const fns = this.#listeners.get(event);
    if (fns) {
      for (const fn of fns) fn(data);
    }
  }

  clear() {
    this.#listeners.clear();
  }
}

export const bus = new EventBus();
