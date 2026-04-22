/**
 * theme-colors.js — Cached CSS custom-property reader for canvas rendering.
 *
 * Reads color tokens from :root (or [data-theme] overrides) and caches them
 * on a flat object.  A MutationObserver watches for data-theme changes and
 * auto-refreshes so canvas code always paints with the active palette.
 *
 * Usage:
 *   import { themeColors } from '../utils/theme-colors.js';
 *   ctx.fillStyle = themeColors.canvasBg;
 */

const PROPERTY_MAP = {
  '--color-canvas-bg':              'canvasBg',
  '--color-canvas-grid':            'canvasGrid',
  '--color-canvas-grid-bold':       'canvasGridBold',
  '--color-canvas-label':           'canvasLabel',
  '--color-canvas-label-active':    'canvasLabelActive',
  '--color-canvas-scale-highlight': 'canvasScaleHighlight',
  '--color-canvas-pitch-dot':       'canvasPitchDot',
  '--color-canvas-pitch-dot-off':   'canvasPitchDotOff',
  '--color-canvas-pitch-line':      'canvasPitchLine',
  '--color-canvas-current-note-bg': 'canvasCurrentNoteBg',
  '--color-canvas-playhead':        'canvasPlayhead',
  '--color-accent':                 'accent',
  '--color-accent-dim':             'accentDim',
  '--color-in-tune':                'inTune',
  '--color-close':                  'close',
  '--color-off':                    'off',
  '--color-text':                   'text',
  '--color-text-dim':               'textDim',
  '--color-text-muted':             'textMuted',
  '--color-bg':                     'bg',
  '--color-bg-elevated':            'bgElevated',
  '--color-bg-surface':             'bgSurface',
};

/** Flat object whose keys match the JS names above. */
export const themeColors = {};

/**
 * Re-read every mapped CSS custom property and update `themeColors` in place.
 * Call manually after programmatic style changes, or let the MutationObserver
 * handle data-theme swaps automatically.
 */
export function refresh() {
  const style = getComputedStyle(document.documentElement);
  for (const [prop, key] of Object.entries(PROPERTY_MAP)) {
    themeColors[key] = style.getPropertyValue(prop).trim();
  }
}

/* --- Bootstrap ---------------------------------------------------------- */

// Auto-refresh when the data-theme attribute changes on <html>.
const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.attributeName === 'data-theme') {
      refresh();
      return;
    }
  }
});
observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// Initial read — if DOM is already interactive, read now; otherwise wait.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', refresh, { once: true });
} else {
  refresh();
}
