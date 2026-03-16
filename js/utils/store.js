export const store = {
  get(key) {
    try {
      const raw = localStorage.getItem(`pp:${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  set(key, value) {
    localStorage.setItem(`pp:${key}`, JSON.stringify(value));
  },
  remove(key) {
    localStorage.removeItem(`pp:${key}`);
  },
};
