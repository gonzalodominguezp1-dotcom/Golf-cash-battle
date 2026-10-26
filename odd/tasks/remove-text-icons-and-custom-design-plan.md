# Feature: Remove Text Icons & Custom Design Plan

## Objective
Remove all emoji/unicode icons embedded in text strings and code elements across the application, and develop a comprehensive, professional design plan for a custom icon system and logo blueprint.

## Context & Problem
Currently, the UI relies on inline emojis in texts (e.g. `⛳ Jugar`, `🎯 Juego Libre`, `✨ Skins`, `💎 Wallet`, `👤 Cuenta`, `⚔️ Jugadores`, `🔄 Reiniciar`, `🗺️ Mapas`, `⚙️ Ajustes`, `🏆`, etc.). These emojis look inconsistent across operating systems and detract from the sleek, premium luxury-esports aesthetic of Golf Cash Battle. The goal is to strip all text-embedded icons directly from the code, ensure the UI remains clean and balanced, and create an exhaustive blueprint for custom vector icons and a professional brand logo.

## Scope & Constraints
- Remove all emoji characters from UI strings, buttons, labels, hints, banners, cards, and select menus in `src/main.js` and `src/style.css`.
- Ensure clean typographic spacing and balanced layouts when icon spans/emojis are removed.
- Keep all functional logic intact (all 67 unit/integration tests must pass).
- Generate a comprehensive, professional Custom Icon Design Plan & Logo Blueprint covering all application categories, geometry guidelines, color systems, variants, and export formats.

## Actionable Checklist
- [x] Task 1: Remove all inline icons and emojis from `src/main.js` (nav, topbar, lobby, HUD, settings modal, dialogs, results, themes, course features).
- [x] Task 2: Remove emoji pseudo-elements and refine layout styles in `src/style.css`. Run test suite to verify no regressions.
- [x] Task 3: Create the comprehensive Custom Icon Design Plan and Professional Logo Blueprint with full design specifications.
- [x] Task 4: Export Black & Gold logo with transparent background to `public/logo-black-gold.png` and wire into topbar brand and favicon.
- [x] Task 5: Author official root `DESIGN.md` and `.impeccable/design.json` sidecar adhering strictly to `/impeccable` standard.
- [x] Task 6: Formulate hyper-professional prompt for standalone HTML SVG icon catalog and animated micro-interactions.

## Applicable Checks & Verification
- `node --test tests/*.test.js`: 67 passed, 0 failed.
- `npx vite build`: Production build successful in 1.20s.
- `git commit`: Omitted intentionally upon explicit user request ("No comitees los cambios"). All modifications remain unstaged in working directory.
- Transparent Logo: Located at [public/logo-black-gold.png](file:///c:/Users/DEV/Desktop/golfito/public/logo-black-gold.png).
- Design System: Located at [DESIGN.md](file:///c:/Users/DEV/Desktop/golfito/DESIGN.md) and [.impeccable/design.json](file:///c:/Users/DEV/Desktop/golfito/.impeccable/design.json).
- Design Artifact: Created at `C:\Users\DEV\.gemini\antigravity-ide\brain\9964fddb-4d47-49c2-81d5-42157fdf9684\custom_icon_and_logo_design_plan.md`.

