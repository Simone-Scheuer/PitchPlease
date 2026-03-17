/**
 * journal-view.js — Practice journal showing sessions, trends, streaks,
 * and encouraging feedback.
 *
 * Singleton view following the same pattern as practice-view and session-view.
 * Reads from history.js and skill-model.js, renders into the #journal-view
 * container. No audio, no event bus subscriptions — purely a read-only display.
 */

import { qs } from '../utils/dom.js';
import { getHistory, getStreak, getPracticeStats } from '../profile/history.js';
import { computeSkillMap } from '../profile/skill-model.js';
import { COLORS } from '../renderers/renderer-base.js';

// ---------------------------------------------------------------------------
// Skill dimension labels (human-readable, for radar chart)
// ---------------------------------------------------------------------------

const DIMENSION_LABELS = {
  pitchAccuracy: 'Pitch\nAccuracy',
  pitchStability: 'Stability',
  earTraining: 'Ear\nTraining',
  scaleFluency: 'Scale\nFluency',
  reactionSpeed: 'Speed',
  range: 'Range',
};

const DIMENSION_KEYS = Object.keys(DIMENSION_LABELS);

// ---------------------------------------------------------------------------
// Relative date formatting
// ---------------------------------------------------------------------------

/**
 * Format a date string/timestamp as a relative day label.
 * @param {string|number} dateValue
 * @returns {string}
 */
function relativeDate(dateValue) {
  const date = typeof dateValue === 'string' ? new Date(dateValue) : new Date(dateValue);
  const now = new Date();

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfDate = new Date(date);
  startOfDate.setHours(0, 0, 0, 0);

  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  // Format as short date
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Format a duration in ms as a human-readable string.
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  const totalSec = Math.round(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

// ---------------------------------------------------------------------------
// Encouragement generator
// ---------------------------------------------------------------------------

/**
 * Generate 1-2 encouraging messages based on recent performance.
 * Never negative. If performance declined, omit that dimension.
 *
 * @param {Object[]} history - Recent session records
 * @param {Object} skillMap - Current skill map from computeSkillMap
 * @param {Object} streak - Streak data from getStreak
 * @param {Object} stats - Practice stats from getPracticeStats
 * @returns {string[]}
 */
function generateEncouragement(history, skillMap, streak, stats) {
  const messages = [];

  // Streak-based
  if (streak.current >= 3) {
    messages.push(`${streak.current} day streak — you're on fire!`);
  } else if (streak.thisWeek >= 3) {
    messages.push(`You've practiced ${streak.thisWeek} days this week — keep it up!`);
  }

  // Sessions this month
  const monthStats = getPracticeStats(30);
  if (monthStats.totalSessions >= 5) {
    messages.push(`${monthStats.totalSessions} sessions this month — building a habit!`);
  }

  // Improving dimensions
  for (const key of DIMENSION_KEYS) {
    const dim = skillMap[key];
    if (dim && dim.trend === 'improving' && dim.level > 0) {
      const label = DIMENSION_LABELS[key].replace('\n', ' ');
      messages.push(`Your ${label} is improving nicely`);
      break; // only one dimension message
    }
  }

  // Total practice time this week
  if (stats.totalMinutes >= 30) {
    messages.push(`${stats.totalMinutes} minutes of practice this week`);
  }

  // If nothing yet, give a starter message
  if (messages.length === 0) {
    if (history.length > 0) {
      messages.push('Every session counts — keep going!');
    } else {
      messages.push('Start practicing to track your progress');
    }
  }

  return messages.slice(0, 2);
}

// ---------------------------------------------------------------------------
// Radar chart drawing
// ---------------------------------------------------------------------------

/**
 * Draw a hexagonal radar chart on the canvas.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} skillMap - Skill map from computeSkillMap
 * @param {number} size - Canvas size (assumed square)
 */
function drawRadar(ctx, skillMap, size) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.35;
  const labelRadius = size * 0.47;
  const numAxes = DIMENSION_KEYS.length;
  const angleStep = (Math.PI * 2) / numAxes;
  const startAngle = -Math.PI / 2; // start at top

  ctx.clearRect(0, 0, size, size);

  // Check if there's any data
  const hasData = DIMENSION_KEYS.some(key => skillMap[key]?.level > 0);

  // Draw background hexagon rings (3 levels: 33%, 66%, 100%)
  for (const ringPct of [0.33, 0.66, 1.0]) {
    ctx.beginPath();
    for (let i = 0; i < numAxes; i++) {
      const angle = startAngle + i * angleStep;
      const x = cx + Math.cos(angle) * radius * ringPct;
      const y = cy + Math.sin(angle) * radius * ringPct;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = COLORS.BG_SURFACE;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Draw axis lines
  for (let i = 0; i < numAxes; i++) {
    const angle = startAngle + i * angleStep;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.strokeStyle = COLORS.BG_SURFACE;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Draw filled data area
  if (hasData) {
    ctx.beginPath();
    for (let i = 0; i < numAxes; i++) {
      const key = DIMENSION_KEYS[i];
      const level = skillMap[key]?.level ?? 0;
      const angle = startAngle + i * angleStep;
      const r = Math.max(level, 0.04) * radius; // min visible radius
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    // Fill
    ctx.fillStyle = 'rgba(78, 205, 196, 0.2)';
    ctx.fill();

    // Stroke
    ctx.strokeStyle = COLORS.ACCENT;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Data points
    for (let i = 0; i < numAxes; i++) {
      const key = DIMENSION_KEYS[i];
      const level = skillMap[key]?.level ?? 0;
      if (level > 0) {
        const angle = startAngle + i * angleStep;
        const r = level * radius;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.ACCENT;
        ctx.fill();
      }
    }
  }

  // Draw labels
  ctx.fillStyle = COLORS.TEXT_MUTED;
  ctx.font = '11px Inter, -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < numAxes; i++) {
    const key = DIMENSION_KEYS[i];
    const label = DIMENSION_LABELS[key];
    const angle = startAngle + i * angleStep;
    const x = cx + Math.cos(angle) * labelRadius;
    const y = cy + Math.sin(angle) * labelRadius;

    // Multi-line labels
    const lines = label.split('\n');
    const lineHeight = 13;
    const startY = y - ((lines.length - 1) * lineHeight) / 2;
    for (let j = 0; j < lines.length; j++) {
      ctx.fillText(lines[j], x, startY + j * lineHeight);
    }
  }

  // Empty state message
  if (!hasData) {
    ctx.fillStyle = COLORS.TEXT_DIM;
    ctx.font = '12px Inter, -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Practice to see', cx, cy - 8);
    ctx.fillText('your skills', cx, cy + 8);
  }
}

// ---------------------------------------------------------------------------
// Journal View
// ---------------------------------------------------------------------------

class JournalView {
  #viewEl;
  #streakEl;
  #weekStatsEl;
  #radarCanvas;
  #radarCtx;
  #encouragementEl;
  #sessionsEl;

  init() {
    this.#viewEl = qs('#journal-view');
    this.#streakEl = qs('#journal-streak');
    this.#weekStatsEl = qs('#journal-week-stats');
    this.#radarCanvas = qs('#journal-radar');
    this.#radarCtx = this.#radarCanvas?.getContext('2d');
    this.#encouragementEl = qs('#journal-encouragement');
    this.#sessionsEl = qs('#journal-sessions');
  }

  activate() {
    this.#viewEl.hidden = false;
    this.#viewEl.classList.add('active');
    this.#render();
  }

  deactivate() {
    this.#viewEl.classList.remove('active');
    this.#viewEl.hidden = true;
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  #render() {
    const history = getHistory(30);
    const streak = getStreak();
    const stats = getPracticeStats(7);
    const skillMap = computeSkillMap(history);

    this.#renderStreak(streak);
    this.#renderWeekStats(stats);
    this.#renderRadar(skillMap);
    this.#renderEncouragement(history, skillMap, streak, stats);
    this.#renderSessions(history);
  }

  #renderStreak(streak) {
    if (!this.#streakEl) return;

    if (streak.current > 0) {
      const dayWord = streak.current === 1 ? 'day' : 'days';
      this.#streakEl.innerHTML = `
        <span class="journal-streak-number">${streak.current}</span>
        <span class="journal-streak-label">${dayWord} streak</span>
      `;
    } else {
      this.#streakEl.innerHTML = `
        <span class="journal-streak-number">0</span>
        <span class="journal-streak-label">day streak</span>
      `;
    }
  }

  #renderWeekStats(stats) {
    if (!this.#weekStatsEl) return;

    const sessionWord = stats.totalSessions === 1 ? 'session' : 'sessions';
    const minLabel = stats.totalMinutes === 1 ? 'min' : 'min';

    if (stats.totalSessions > 0) {
      this.#weekStatsEl.textContent =
        `This week: ${stats.totalSessions} ${sessionWord} \u00B7 ${stats.totalMinutes} ${minLabel}`;
    } else {
      this.#weekStatsEl.textContent = 'No sessions this week';
    }
  }

  #renderRadar(skillMap) {
    if (!this.#radarCanvas || !this.#radarCtx) return;

    // Handle DPI scaling
    const dpr = window.devicePixelRatio || 1;
    const displaySize = 200;
    this.#radarCanvas.style.width = `${displaySize}px`;
    this.#radarCanvas.style.height = `${displaySize}px`;
    this.#radarCanvas.width = displaySize * dpr;
    this.#radarCanvas.height = displaySize * dpr;
    this.#radarCtx.scale(dpr, dpr);

    drawRadar(this.#radarCtx, skillMap, displaySize);
  }

  #renderEncouragement(history, skillMap, streak, stats) {
    if (!this.#encouragementEl) return;

    const messages = generateEncouragement(history, skillMap, streak, stats);
    this.#encouragementEl.innerHTML = '';

    for (const msg of messages) {
      const p = document.createElement('p');
      p.className = 'journal-encouragement-msg';
      p.textContent = msg;
      this.#encouragementEl.appendChild(p);
    }
  }

  #renderSessions(history) {
    if (!this.#sessionsEl) return;

    this.#sessionsEl.innerHTML = '';

    if (history.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'journal-empty';
      empty.textContent = 'No practice sessions yet. Start one from the Practice tab!';
      this.#sessionsEl.appendChild(empty);
      return;
    }

    for (const session of history) {
      const item = this.#createSessionItem(session);
      this.#sessionsEl.appendChild(item);
    }
  }

  /**
   * Create a single session item element with expand/collapse behavior.
   * @param {Object} session
   * @returns {HTMLElement}
   */
  #createSessionItem(session) {
    const item = document.createElement('div');
    item.className = 'journal-session-item';

    // Header row (always visible)
    const header = document.createElement('button');
    header.className = 'journal-session-header';
    header.setAttribute('aria-expanded', 'false');

    const left = document.createElement('div');
    left.className = 'journal-session-left';

    const dateEl = document.createElement('span');
    dateEl.className = 'journal-session-date';
    dateEl.textContent = relativeDate(session.date);

    const nameEl = document.createElement('span');
    nameEl.className = 'journal-session-name';
    nameEl.textContent = session.name ?? 'Practice Session';

    left.appendChild(dateEl);
    left.appendChild(nameEl);

    const durationEl = document.createElement('span');
    durationEl.className = 'journal-session-duration';
    durationEl.textContent = formatDuration(session.duration ?? 0);

    header.appendChild(left);
    header.appendChild(durationEl);

    // Exercises detail (hidden by default)
    const exercises = document.createElement('div');
    exercises.className = 'journal-session-exercises';

    const blocks = session.blocks ?? [];
    if (blocks.length > 0) {
      for (const block of blocks) {
        const exEl = document.createElement('div');
        exEl.className = 'journal-session-exercise';

        const exLabel = document.createElement('span');
        exLabel.className = 'journal-session-exercise-label';
        exLabel.textContent = block.label || block.exerciseType || 'Exercise';

        exEl.appendChild(exLabel);

        // Show a key metric if available
        const metrics = block.measurements?.metrics;
        if (metrics) {
          const stat = this.#pickKeyStat(metrics);
          if (stat) {
            const statEl = document.createElement('span');
            statEl.className = 'journal-session-exercise-stat';
            statEl.textContent = stat;
            exEl.appendChild(statEl);
          }
        }

        exercises.appendChild(exEl);
      }
    } else {
      const noDetail = document.createElement('div');
      noDetail.className = 'journal-session-exercise';
      noDetail.textContent = 'No exercise details recorded';
      noDetail.style.color = 'var(--color-text-dim)';
      exercises.appendChild(noDetail);
    }

    // Toggle expand/collapse
    header.addEventListener('click', () => {
      const isExpanded = item.classList.toggle('expanded');
      header.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    });

    item.appendChild(header);
    item.appendChild(exercises);
    return item;
  }

  /**
   * Pick a single key stat from metrics to display.
   * @param {Object} metrics
   * @returns {string|null}
   */
  #pickKeyStat(metrics) {
    if (metrics['notes-hit-pct'] != null) {
      return `${Math.round(metrics['notes-hit-pct'])}% notes hit`;
    }
    if (metrics['cents-avg'] != null) {
      return `${Math.round(metrics['cents-avg'])} cents avg`;
    }
    if (metrics['hold-steady-ms'] != null) {
      const sec = (metrics['hold-steady-ms'] / 1000).toFixed(1);
      return `${sec}s steady`;
    }
    if (metrics['phrase-accuracy'] != null) {
      return `${Math.round(metrics['phrase-accuracy'])}% phrase accuracy`;
    }
    return null;
  }
}

export const journalView = new JournalView();
