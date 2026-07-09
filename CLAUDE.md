# PitchPlease

## Project Vision
A pitch mirror that knows the player's instruments. Detects the note in real time and shows it on a scrolling graph in note names AND the instrument's own language (harmonica hole tokens, tin whistle fingerings), plus a precision tuner and a bend trainer. Fully client-side, no backend, works offline as a PWA. See `PRD.md` v3.

## Tech Stack
- **Language**: Vanilla JavaScript (ES modules, no transpilation)
- **Markup/Style**: HTML5, CSS3 (custom properties, clamp, dvh)
- **Pitch Detection**: [pitchy](https://github.com/ianprime0509/pitchy) via esm.sh CDN
- **Audio**: Web Audio API (getUserMedia → AnalyserNode → pitchy)
- **Rendering**: Canvas 2D for graph/strip/meter visualizations
- **Type**: Departure Mono (OFL), self-hosted at `assets/fonts/`
- **Persistence**: localStorage (namespaced with `pp:` prefix; app settings live in one `pp:settings` object via `js/utils/settings.js`)
- **PWA**: Service worker (cache-first local, network-first CDN), web manifest. Append `?dev` to the URL to skip the SW during local iteration.
- **Build**: None. No bundler, no transpiler. ES modules loaded natively by the browser.

## Architecture
- **Event bus** (`js/utils/event-bus.js`) decouples audio pipeline from UI. All components subscribe to `pitch` / `silence` events — never poll or directly reference the audio layer.
- **Views** (`js/views/`) are screen controllers that wire components to events and manage lifecycle.
- **Components** (`js/components/`) are reusable UI units with `update(data)` / `clear()` / `destroy()` interface.
- **Audio modules** (`js/audio/`) handle mic access, pitch detection, and music math. They emit events, never touch DOM. `mic.start()` is idempotent; views release the mic on deactivate.
- **Instrument profiles** (`js/utils/instruments.js`) are pure data/math: midi → native label maps (harp tokens, whistle fingerings), default ranges, harp position math. Unit-tested with `node --test js/utils/instruments.test.js`.
- **Skins**: `data-skin` on `<html>` (`press` / `neon` / `riso`) restyles chrome and canvas together. Canvas reads colors via `js/utils/theme-colors.js`; per-skin render behavior (glow, misregistration) lives in `pitch-graph.js` SKIN_FX.
- **View visibility**: exactly one mechanism — `.view.active`, switched by the registry in `app.js`. `[hidden]` carries `!important` in reset.css; never add per-ID display overrides.

## Developer Guidelines

### Code Style
- ES modules with named exports (avoid default exports for discoverability)
- Use `#private` class fields for encapsulation
- No `var` — use `const` by default, `let` only when reassignment is needed
- Template literals over string concatenation
- Prefer `for...of` over `.forEach()` for readability

### CSS
- All colors, sizes, and spacing use CSS custom properties defined in `css/tokens.css`
- Never hardcode hex colors or pixel values in component CSS
- Mobile-first: base styles target 375px portrait, add `min-width` media queries for larger screens
- All interactive elements: `min-width: 44px; min-height: 44px`

### File Naming
- Lowercase kebab-case for all files and directories
- One module per file, file name matches the primary export

### Performance
- Canvas redraws only when data changes (check threshold before redraw)
- Audio processing constraints: `{ echoCancellation: false, noiseSuppression: false, autoGainControl: false }` for minimum latency
- `requestAnimationFrame` for all animation loops (syncs with display, auto-pauses in background)

### localStorage
- All keys prefixed with `pp:` to avoid collisions
- Always JSON.stringify/parse — never store raw strings
- Use `js/utils/store.js` abstraction (when created), never raw `localStorage` calls

### Testing
- Manual testing: open in browser, use Chrome DevTools device simulation
- PWA: Lighthouse audit for installability and offline support
- Audio: test with real microphone input across devices
