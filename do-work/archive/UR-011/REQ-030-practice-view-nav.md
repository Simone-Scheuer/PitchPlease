---
id: REQ-030
title: Practice view + navigation update
status: pending
created_at: 2026-03-16T02:00:00Z
user_request: UR-011
related: [REQ-027, REQ-028, REQ-029]
batch: session-system
---

# Practice View + Navigation Update

## What
Create `js/views/practice-view.js` and `css/practice.css` — session launcher replacing the "Play" tab content. Update `js/app.js` and `index.html` for new navigation flow.

## Detailed Requirements

### Practice View
- Replaces library-view as the content of the "Play" tab
- Sections:
  - **Today's Practice** — large prominent button/card, starts a hardcoded session (Morning Practice template with default key). This becomes the generated session in Phase 8.
  - **Session Templates** — scrollable list of curated sessions from session-templates.js. Each shows: name, duration (e.g., "15 min"), description, tags as small pills. Tap to start.
  - **Quick Start** — collapsible section: root selector, scale selector, exercise type selector. Generates a single-exercise session and launches it. Reuses the practice configurator concept from library-view.
- On template tap or quick start: emit `session:launch` event with the session config
- Persist quick-start settings to localStorage (pp:quick-start-settings)
- HTML in index.html:
  ```
  <div id="practice-view" class="view" hidden>
    <div class="practice-header"><h2>Practice</h2></div>
    <div class="practice-today"></div>
    <div class="practice-templates"></div>
    <div class="practice-quick-start"></div>
  </div>
  ```

### Navigation Update
- Update app.js: add session-view import and routing
- "Play" tab (id="play-tab") now activates practice-view instead of library-view
- `session:launch` event → activate session-view (hides tab bar)
- Session complete / end → deactivate session-view, show tab bar, return to practice-view
- Keep library-view and game-view code in place (don't delete yet) but they're no longer reachable from nav
- Update index.html: add practice-view and session-view container divs, add session.css and practice.css stylesheet links
- Tab bar hide/show: add `.tab-bar-hidden` class to hide bottom nav during sessions

### CSS (practice.css)
- Today's Practice card: prominent, accent-colored border, large touch target
- Template list: cards with name, duration badge, description, tag pills
- Quick Start: collapsible panel with selectors
- Mobile-first, 44px min touch targets, dark theme

## Builder Guidance
- Certainty level: Firm for structure, Medium for visual details
- Follow existing view patterns (init/activate/deactivate singleton)
- The practice view does NOT run exercises — it launches them via session-view
- Keep the old library-view/game-view files but don't wire them to nav anymore
- The "Today's Practice" button is hardcoded to Morning Practice template for now

---
*Source: Phase 3.3 + 3.5 of IMPLEMENTATION_PLAN.md*
