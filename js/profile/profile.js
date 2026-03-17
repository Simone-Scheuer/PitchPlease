/**
 * profile.js — User profile model and persistence.
 *
 * Stores instrument preferences, session length, favorite scales, octave range,
 * and timestamps. Auto-creates a default profile on first access if none exists.
 *
 * All persistence goes through store.js (pp: namespace, JSON serialization).
 * Named exports only.
 */

import { store } from '../utils/store.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROFILE_KEY = 'profile';

/**
 * Default profile structure. Created automatically on first access.
 * Player-facing — no modal, no form, just sensible defaults.
 */
const DEFAULT_PROFILE = Object.freeze({
  instruments: [],               // [{ type: 'harmonica', key: 'C' }, { type: 'voice' }]
  preferences: Object.freeze({
    defaultSessionLength: 15,    // minutes
    feedbackStyle: 'minimal',
    favoriteScales: ['major', 'pentatonic_minor', 'blues'],
    octaveRange: [3, 5],         // user's comfortable range
    harmonicaKey: 'C',           // diatonic harp key
    holdDuration: 600,           // ms to hold a note before advancing
    exerciseOptions: Object.freeze({
      'scale-runner': Object.freeze({ pattern: 'ascending', drone: 'off', loop: true }),
      'drone-match':  Object.freeze({ pattern: 'ascending', drone: 'follow', loop: true }),
      'long-tone':    Object.freeze({ drone: 'off' }),
      'random-note':  Object.freeze({ drone: 'off' }),
      'bend-trainer': Object.freeze({ drone: 'off' }),
      'echo-mode':    Object.freeze({ difficulty: 'easy' }),
      'pitch-trace':  Object.freeze({ traceShape: 'wave' }),
    }),
  }),
  createdAt: null,
  updatedAt: null,
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Deep-clone the default profile with current timestamps.
 * @param {Object} [overrides]
 * @returns {Object}
 */
function buildProfile(overrides = {}) {
  const now = new Date().toISOString();
  const base = {
    instruments: [...DEFAULT_PROFILE.instruments],
    preferences: { ...DEFAULT_PROFILE.preferences, octaveRange: [...DEFAULT_PROFILE.preferences.octaveRange] },
    createdAt: now,
    updatedAt: now,
  };

  // Merge overrides
  if (overrides.instruments) {
    base.instruments = overrides.instruments;
  }
  if (overrides.preferences) {
    const prefs = { ...base.preferences, ...overrides.preferences };
    if (overrides.preferences.octaveRange) {
      prefs.octaveRange = [...overrides.preferences.octaveRange];
    }
    if (overrides.preferences.favoriteScales) {
      prefs.favoriteScales = [...overrides.preferences.favoriteScales];
    }
    if (overrides.preferences.exerciseOptions) {
      prefs.exerciseOptions = { ...base.preferences.exerciseOptions, ...overrides.preferences.exerciseOptions };
    }
    base.preferences = prefs;
  }

  return base;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the current profile, or null if none exists.
 * Does NOT auto-create — use ensureProfile() for auto-creation.
 * @returns {Object|null}
 */
export function getProfile() {
  return store.get(PROFILE_KEY);
}

/**
 * Returns true if a profile exists in storage.
 * @returns {boolean}
 */
export function hasProfile() {
  return store.get(PROFILE_KEY) != null;
}

/**
 * Create a profile with optional overrides merged into defaults.
 * Overwrites any existing profile.
 *
 * @param {Object} [overrides] - Partial profile fields to merge
 * @returns {Object} The created profile
 */
export function createProfile(overrides = {}) {
  const profile = buildProfile(overrides);
  store.set(PROFILE_KEY, profile);
  return profile;
}

/**
 * Ensure a profile exists. If none exists, create one with defaults.
 * This is the primary entry point — call it on app init.
 *
 * @returns {Object} The existing or newly created profile
 */
export function ensureProfile() {
  const existing = store.get(PROFILE_KEY);
  if (existing) return existing;
  return createProfile();
}

/**
 * Shallow-merge updates into the existing profile.
 * Creates a default profile first if none exists.
 *
 * @param {Object} updates - Partial profile fields to merge
 * @returns {Object} The updated profile
 */
export function updateProfile(updates) {
  let profile = store.get(PROFILE_KEY);
  if (!profile) {
    profile = buildProfile();
  }

  // Shallow merge top-level fields
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'preferences' && typeof value === 'object') {
      profile.preferences = { ...profile.preferences, ...value };
      // Deep-copy arrays inside preferences
      if (value.octaveRange) {
        profile.preferences.octaveRange = [...value.octaveRange];
      }
      if (value.favoriteScales) {
        profile.preferences.favoriteScales = [...value.favoriteScales];
      }
      // Deep-merge exerciseOptions (per-exercise key merge)
      if (value.exerciseOptions) {
        const existing = profile.preferences.exerciseOptions ?? {};
        const incoming = value.exerciseOptions;
        const merged = { ...existing };
        for (const [exId, opts] of Object.entries(incoming)) {
          merged[exId] = { ...(existing[exId] ?? {}), ...opts };
        }
        profile.preferences.exerciseOptions = merged;
      }
    } else if (key === 'instruments' && Array.isArray(value)) {
      profile.instruments = [...value];
    } else {
      profile[key] = value;
    }
  }

  profile.updatedAt = new Date().toISOString();
  store.set(PROFILE_KEY, profile);
  return profile;
}

/**
 * Shortcut: get the user's octave range from profile.
 * Returns the default [3, 5] if no profile exists.
 *
 * @returns {[number, number]}
 */
export function getOctaveRange() {
  const profile = store.get(PROFILE_KEY);
  const range = profile?.preferences?.octaveRange;
  if (Array.isArray(range) && range.length === 2) {
    return [range[0], range[1]];
  }
  return [DEFAULT_PROFILE.preferences.octaveRange[0], DEFAULT_PROFILE.preferences.octaveRange[1]];
}

/**
 * Shortcut: set the user's octave range in profile.
 * Creates a default profile if none exists.
 *
 * @param {number} low
 * @param {number} high
 */
export function setOctaveRange(low, high) {
  const safeLow = Math.max(1, Math.min(7, low));
  const safeHigh = Math.max(safeLow, Math.min(7, high));
  updateProfile({ preferences: { octaveRange: [safeLow, safeHigh] } });
}

/**
 * Shortcut: get the user's harmonica key from profile.
 * Returns 'C' if no profile exists or no key is set.
 *
 * @returns {string}
 */
export function getHarmonicaKey() {
  const profile = store.get(PROFILE_KEY);
  return profile?.preferences?.harmonicaKey ?? DEFAULT_PROFILE.preferences.harmonicaKey;
}

/**
 * Shortcut: set the user's harmonica key in profile.
 * Creates a default profile if none exists.
 *
 * @param {string} key - One of HARMONICA_KEYS (e.g. 'C', 'G', 'Bb')
 */
export function setHarmonicaKey(key) {
  updateProfile({ preferences: { harmonicaKey: key } });
}

/**
 * Get exercise-specific options, merging saved values over defaults.
 * @param {string} exerciseId - Exercise identifier (e.g. 'scale-runner', 'drone-match')
 * @returns {Object} Merged options
 */
export function getExerciseOptions(exerciseId) {
  const profile = getProfile();
  const defaults = DEFAULT_PROFILE.preferences.exerciseOptions[exerciseId] || {};
  const saved = profile?.preferences?.exerciseOptions?.[exerciseId] || {};
  return { ...defaults, ...saved };
}

/**
 * Set exercise-specific options (shallow-merged into existing options for that exercise).
 * @param {string} exerciseId - Exercise identifier
 * @param {Object} options - Options to merge
 */
export function setExerciseOptions(exerciseId, options) {
  const profile = getProfile();
  const current = profile?.preferences?.exerciseOptions || {};
  updateProfile({
    preferences: {
      ...profile.preferences,
      exerciseOptions: {
        ...current,
        [exerciseId]: { ...current[exerciseId], ...options },
      },
    },
  });
}

/** @returns {number} Hold duration in ms */
export function getHoldDuration() {
  const profile = getProfile();
  return profile?.preferences?.holdDuration ?? 600;
}

/** @param {number} ms - Hold duration in ms */
export function setHoldDuration(ms) {
  updateProfile({ preferences: { holdDuration: ms } });
}
