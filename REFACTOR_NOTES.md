# Refactor Notes

## Implemented structure

- `index.html` keeps markup only.
- `css/styles.css` contains all stylesheet rules extracted from inline `<style>`.
- `js/config/constants.js` contains game-balance constants.
- `js/api/client.js` contains API call helpers.
- `js/narration/prompts.js` contains LLM prompt builders.
- `js/presets/storage.js` contains preset persistence helpers.
- `js/gameplay/core.js` remains the orchestration/game-loop entrypoint.
- `js/rendering/ui.js` and `js/narration/chronicle.js` are scaffold files for the next refactor phase.

## Suggested next slices

1. Move all status panel and button DOM building from `js/gameplay/core.js` into `js/rendering/ui.js`.
2. Move `addLog`, chronicle index/history toggles, and log panel event handlers from `js/gameplay/core.js` into `js/narration/chronicle.js`.
3. Introduce explicit namespaces (for example `window.Rendering`, `window.Narration`, `window.Gameplay`) to reduce global coupling.
4. Add a tiny boot file (`js/main.js`) that wires modules in one place.
5. Add smoke tests (Playwright) for setup flow, movement, and one encounter resolution.
