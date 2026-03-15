# Fix-UI Log

## 2026-03-15 — graph-view-desktop.png
- Screen: Graph View (desktop Mac browser)
- Issues: 5
- Fixes applied:
  - `.view` bottom offset accounts for tab bar height (controls no longer hidden)
  - Label width increased from 44px to 52px (right labels no longer clipped)
  - Label font sizes bumped (10→11px base, 11→12px active)
  - Label padding increased from 6→8px (text not hugging edges)
  - Removed `.app` padding-bottom, moved to `.view` bottom offset (correct absolute positioning)
