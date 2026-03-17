/**
 * history.js — Practice history storage and queries.
 *
 * Stores session records in localStorage via store.js. Each record captures
 * the session config, per-block measurements, and timing data.
 *
 * Capped at 90 days — auto-prunes on every write to prevent localStorage bloat.
 *
 * Named exports only.
 */

import { store } from '../utils/store.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HISTORY_KEY = 'history';
const MAX_AGE_DAYS = 90;
const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Load the history array from storage.
 * @returns {Object[]}
 */
function loadHistory() {
  const data = store.get(HISTORY_KEY);
  if (Array.isArray(data)) return data;
  return [];
}

/**
 * Save the history array, pruning records older than MAX_AGE_DAYS.
 * @param {Object[]} history
 */
function saveHistory(history) {
  const cutoff = Date.now() - MAX_AGE_DAYS * MS_PER_DAY;
  const pruned = history.filter(record => {
    const ts = record.date ?? record.timestamp ?? 0;
    const recordTime = typeof ts === 'string' ? new Date(ts).getTime() : ts;
    return recordTime >= cutoff;
  });
  store.set(HISTORY_KEY, pruned);
}

/**
 * Parse a date value (string or number) into a Date object.
 * @param {string|number} value
 * @returns {Date}
 */
function parseDate(value) {
  if (typeof value === 'string') return new Date(value);
  if (typeof value === 'number') return new Date(value);
  return new Date(0);
}

/**
 * Get the start of today (midnight local time) as a Date.
 * @returns {Date}
 */
function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a completed session.
 *
 * @param {Object} sessionResult
 * @param {string}  sessionResult.sessionId   - Unique identifier for the session config
 * @param {string}  sessionResult.name        - Session display name
 * @param {string}  [sessionResult.date]      - ISO date string (defaults to now)
 * @param {number}  sessionResult.duration    - Total session duration in ms
 * @param {Object[]} sessionResult.blocks     - Per-block results
 * @param {string}  sessionResult.blocks[].label        - Block label
 * @param {string}  [sessionResult.blocks[].exerciseType] - Exercise type (sequence, sustained, etc.)
 * @param {Object}  [sessionResult.blocks[].measurements] - Measurement data from evaluator
 */
export function recordSession(sessionResult) {
  const history = loadHistory();

  const record = {
    sessionId: sessionResult.sessionId ?? sessionResult.name ?? 'unknown',
    name: sessionResult.name ?? 'Practice Session',
    date: sessionResult.date ?? new Date().toISOString(),
    duration: sessionResult.duration ?? 0,
    blocks: (sessionResult.blocks ?? []).map(block => ({
      label: block.label ?? '',
      exerciseType: block.exerciseType ?? block.measurements?.exerciseType ?? '',
      measurements: block.measurements ?? {},
    })),
  };

  history.push(record);
  saveHistory(history);
  return record;
}

/**
 * Get session history from the last N days.
 *
 * @param {number} [days=30] - Number of days to look back
 * @returns {Object[]} Array of session records, newest first
 */
export function getHistory(days = 30) {
  const history = loadHistory();
  const cutoff = Date.now() - days * MS_PER_DAY;

  return history
    .filter(record => {
      const ts = record.date ?? record.timestamp ?? 0;
      const recordTime = typeof ts === 'string' ? new Date(ts).getTime() : ts;
      return recordTime >= cutoff;
    })
    .sort((a, b) => {
      const aTime = parseDate(a.date).getTime();
      const bTime = parseDate(b.date).getTime();
      return bTime - aTime;
    });
}

/**
 * Get recent exercises of a specific type.
 *
 * @param {string} type - Exercise type to filter by (e.g. 'sequence', 'sustained')
 * @param {number} [count=10] - Maximum number of results
 * @returns {Object[]} Array of { sessionDate, label, exerciseType, measurements }
 */
export function getRecentExercises(type, count = 10) {
  const history = loadHistory();
  const results = [];

  // Walk through sessions newest-first
  const sorted = [...history].sort((a, b) => {
    const aTime = parseDate(a.date).getTime();
    const bTime = parseDate(b.date).getTime();
    return bTime - aTime;
  });

  for (const session of sorted) {
    if (results.length >= count) break;

    for (const block of (session.blocks ?? [])) {
      if (results.length >= count) break;

      if (block.exerciseType === type) {
        results.push({
          sessionDate: session.date,
          label: block.label,
          exerciseType: block.exerciseType,
          measurements: block.measurements,
        });
      }
    }
  }

  return results;
}

/**
 * Compute practice streak data.
 *
 * @returns {{ current: number, longest: number, thisWeek: number }}
 */
export function getStreak() {
  const history = loadHistory();
  if (history.length === 0) {
    return { current: 0, longest: 0, thisWeek: 0 };
  }

  // Collect unique practice days (local dates)
  const daySet = new Set();
  for (const record of history) {
    const date = parseDate(record.date);
    const dayStr = startOfDay(date).toISOString().slice(0, 10);
    daySet.add(dayStr);
  }

  // Sort days descending
  const days = [...daySet].sort().reverse();
  if (days.length === 0) {
    return { current: 0, longest: 0, thisWeek: 0 };
  }

  // Current streak: count consecutive days from today backwards
  const today = startOfDay(new Date()).toISOString().slice(0, 10);
  let current = 0;
  let checkDate = new Date(today);

  // Allow "today" or "yesterday" as streak start
  const todayInSet = daySet.has(today);
  if (!todayInSet) {
    // Check yesterday
    checkDate.setDate(checkDate.getDate() - 1);
    const yesterday = checkDate.toISOString().slice(0, 10);
    if (!daySet.has(yesterday)) {
      // No recent practice — streak is 0
      current = 0;
    }
  }

  if (todayInSet || daySet.has(checkDate.toISOString().slice(0, 10))) {
    if (todayInSet) {
      checkDate = new Date(today);
    }
    while (daySet.has(checkDate.toISOString().slice(0, 10))) {
      current++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
  }

  // Longest streak: scan all sorted days
  const allDays = [...daySet].sort();
  let longest = 0;
  let streak = 1;
  for (let i = 1; i < allDays.length; i++) {
    const prev = new Date(allDays[i - 1]);
    const curr = new Date(allDays[i]);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / MS_PER_DAY);
    if (diffDays === 1) {
      streak++;
    } else {
      longest = Math.max(longest, streak);
      streak = 1;
    }
  }
  longest = Math.max(longest, streak);

  // This week: sessions since Monday (ISO week start)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(monday.getDate() - mondayOffset);
  monday.setHours(0, 0, 0, 0);

  let thisWeek = 0;
  for (const day of allDays) {
    if (new Date(day).getTime() >= monday.getTime()) {
      thisWeek++;
    }
  }

  return { current, longest, thisWeek };
}

/**
 * Get aggregate practice stats for the last N days.
 *
 * @param {number} [days=7] - Number of days to look back
 * @returns {{ totalSessions: number, totalMinutes: number, avgPerDay: number }}
 */
export function getPracticeStats(days = 7) {
  const recent = getHistory(days);
  const totalSessions = recent.length;
  const totalMs = recent.reduce((sum, s) => sum + (s.duration ?? 0), 0);
  const totalMinutes = Math.round(totalMs / 60_000);
  const avgPerDay = days > 0 ? Math.round((totalMinutes / days) * 10) / 10 : 0;

  return { totalSessions, totalMinutes, avgPerDay };
}
