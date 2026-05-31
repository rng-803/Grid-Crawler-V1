# Grid Crawler — Project Summary (Humans + AI Agents)

This document is a single reference for understanding **the game**, **the UI**, **the codebase**, and **how external services are used**. It consolidates and expands on `GDD.md`, `REFACTOR_NOTES.md`, and `SUPABASE_THEME_SETUP.md`, while reflecting the **current implementation** in the code.

## 1) What this project is

**Grid Crawler** is a browser-based, text-forward dungeon crawler. The game world is a procedurally generated grid (no full map reveal), where the player moves one tile at a time, triggers encounters, gains items and curses, and ultimately aims to defeat a boss.

The game can optionally use an **OpenAI-compatible Chat Completions API** for:
- Generating **name pools** (enemies, NPCs, items, curses, boss) before a run starts
- Providing **short narration** per encounter (streamed into the chronicle)
- Maintaining a **short story summary** across runs
- Updating a **player physical description** (“appearance”) after key events

The project also includes an **image-prompt helper**:
- Builds an **image generation prompt** from the current theme + appearance
- Supports either **structured natural language** or **danbooru tag format** (toggle in `js/config/constants.js`)
- Lets the player **edit** and **copy** the prompt for use in external generators
- Includes a starter **OpenAI-compatible Images API** integration (optional)

The project is plain HTML/CSS/JS (no bundler). It runs as a static site.

## 2) Quick start (local)

- Open `index.html` in a browser, or serve the folder with a simple static server.
- If you want AI narration / naming, provide:
  - **API Key**
  - **API Base URL** (defaults to OpenRouter-compatible)
  - **Model ID**
- Click **Generate map & names** (AI) or **Skip (Default)** (no AI naming).
- Choose a class card to start playing.

Notes:
- The game uses `fetch(...)` to talk to external APIs; some browsers restrict `file://` usage. If API calls fail in `file://`, use a local server.
- Supabase is optional; theme sync falls back to local-only automatically.

## 3) Game mechanics (current implementation)

### 3.1 Core loop
- Player selects a direction (N/S/E/W).
- Position updates if not blocked by boundary/wall.
- If the tile is an encounter and not already cleared:
  - The game logs an intro narration (optional via API).
  - The player chooses to **engage** (resolve) or sometimes **flee**.
  - The resolution updates HP / coins / curses / inventory, and may trigger level-up.
- Repeat until:
  - Boss is defeated (win), or
  - The run is lost (HP or an attribute drops to 0), sending the player back to town.

### 3.2 Attributes & effective stats
Player attributes are:
- `power` (combat)
- `perception` (displayed as **Agility** in the UI)
- `persuasion`

The game uses “effective” values:
`effective = base + equipped item bonuses + status (curse) modifiers`

If any effective attribute becomes **0 or below**, the run is lost (attrition defeat).

### 3.3 HP, runs, defeat, and permanence
- Player max HP is configured in `js/config/constants.js` (`PLAYER_MAX_HP`, currently 5).
- Losing a run (HP ≤ 0, or any effective attribute ≤ 0, or failing a boss stage) triggers **run defeat**:
  - One existing curse/status is selected to become **permanent**.
  - All other temporary curses are cleared.
  - HP resets to max.
  - Coins and inventory persist.
  - Player returns to **town** and can start a new run.

This creates a “roguelite-ish” loop: the player slowly accumulates permanent drawbacks across runs.

### 3.4 Dungeon grid generation
Dungeon tuning values live in `js/config/constants.js`:
- Dungeon size: `GRID_WIDTH × GRID_HEIGHT` (currently 13×13)
- Walls: `WALL_RATIO` (currently 0.4 of non-start/boss tiles)
- Empty cells: `EMPTY_CELL_CHANCE` (currently 0.5)

Generation rules (see `generateGrid()` in `js/gameplay/core.js`):
- **Start**: random `x` on the **top row** (`y = 0`)
- **Boss**: random `x` on the **bottom row** (`y = GRID_HEIGHT - 1`)
- Walls placed randomly
- The generator retries until there is a valid path between start and boss
- Remaining non-wall cells become either:
  - `empty` (no encounter), or
  - an encounter type: `enemy`, `treasure`, `npc`, `item`
- Encounter difficulty increases with proximity to the boss (distance-based roll)

### 3.5 Encounters

All encounter resolutions use `resolveEncounterOutcome(...)`, which can be overridden by debug flags in `js/config/constants.js`.

#### Enemy
- Compare: `effective power >= enemy power` → win, else lose
- Win:
  - Gain coins (range in constants)
  - Encounter cleared
  - Level-up granted
- Lose:
  - `-1 HP`
  - Apply a curse/status from that tile’s configured failure curse
  - Gain a smaller coin amount
  - Encounter marked failed (not cleared)

#### Treasure (cache/trap)
- Compare: `effective perception > difficulty` → success, else trap
- Success:
  - Grant reward (item or coins)
  - Encounter cleared
  - Level-up granted
- Fail:
  - `-1 HP`
  - Apply a curse/status
  - Encounter marked failed

#### NPC
- Compare: `effective persuasion >= check` → success, else fail
- Success:
  - Grant reward (item or coins)
  - Encounter cleared
- Fail:
  - `-1 HP`
  - Apply a curse/status
  - Encounter marked failed

#### Item (floor pickup)
- Immediately grants an item (buff or curse-clear item)
- Encounter cleared

#### Boss (final chamber)
Boss is a 3-stage check in order:
1) Agility (`perception`)
2) Persuasion
3) Combat (`power`)

Failing any stage defeats the run. Passing all stages wins the game.

### 3.6 Flee rules
Some encounters can be fled from:
- You can flee only if the tile has not been fled from before (`cell.fled === false`)
- After fleeing once, a **flee cooldown** prevents fleeing again until you resolve an encounter
- If you return to the same fled tile later, it becomes non-fleeable for that revisit

### 3.7 Items, equipment, and coins
Items are in `G.player.inventory`. Types:
- `buff` items: equippable; provide attribute bonuses (derived from “level” and effects)
- `curseClear` items: consumable; removes one **temporary** curse/status chosen by the player

Limits and economy live in `js/config/constants.js`:
- Max equipped items: `MAX_EQUIPPED_ITEMS` (currently 3)
- Coins persist across runs
- Town includes an upgrader service that increases buff item level for a coin cost
- Merchant allows selling non-equipped items for coins

### 3.8 Town (between runs)
Town exists only **between runs**:
- After a run defeat, the player returns to town.
- Town grid is smaller (`TOWN_WIDTH × TOWN_HEIGHT`, currently 5×5) and always revealed.
- Town NPC roles (placed randomly):
  - Healer: story/narration; no paid healing/clearing (currently)
  - Upgrader: upgrades buff items for `ITEM_UPGRADE_COST`
  - Merchant: buys unequipped items
- The town gate starts a new dungeon run.

## 4) UI elements (what the player sees)

All UI is in `index.html` + `css/styles.css`, but most UI behavior and dynamic HTML generation is currently in `js/gameplay/core.js`.

### 4.1 Screens
1) **AI Setup Screen** (`#ai-setup-screen`)
   - API fields: key, base URL, model
   - API presets dropdown (localStorage)
   - Theme fields: setting, details, enemy details, curse details, town NPC details, character description
   - Story presets dropdown (localStorage + optional Supabase sync)
   - Buttons:
     - Generate map & names (calls the API and builds the naming pools + a pending grid)
     - Skip (Default) / Proceed (starts class selection)
     - Debug toggles: show prompts / show generated names JSON / show timings

2) **Class Select Screen** (`#setup-screen`)
   - 3 class cards: Fighter / Thinker / Talker (mapped to different base stats)

3) **Game Screen** (`#game-container`)
   - Status panel, chronicle panel, minimap + movement pad, and an actions panel

### 4.2 Status panel (`#status-panel`)
Shows:
- Current run and between-run status
- HP hearts and coin count
- Attribute pills (Power, Agility, Persuasion) showing base vs effective
- Equipped items list
- Curses (statuses), including permanent labeling
- Full inventory with buttons to Equip/Unequip or Use (curse-clear)
- “Appearance” (physical description) toggle
- “Image Prompt” toggle (editable + copy-to-clipboard)
- “Image Model API” controls (starter OpenAI-compatible image endpoint integration)
- Runtime “Narrator API” controls (change model + load/save API presets)

The status panel is **collapsible/expandable**:
- Clicking the collapsed panel expands it fullscreen
- “Collapse Status” button returns to collapsed view

### 4.3 Chronicle / log (`#log-panel`)
- All narrative and mechanical events append as “log entries”
- In “current entry” mode, only the active log entry is shown (paginated by character count)
- “Show All History” reveals the full list
- Click chronicle panel or press Space to advance (pages first, then next entry)

### 4.4 Minimap (`#minimap-grid`)
- Displays a **small window** around the player (radius 2)
- Shows visited tiles (and town is always visible)
- Special markers:
  - Player: `◉`
  - Start / town gate: `E`
  - Boss: `☠`
  - Town NPC: letter icons (`H`, `U`, `M`)

### 4.5 Movement pad + keyboard
- Movement pad buttons (N/W/E/S)
- Keyboard:
  - WASD or arrow keys move (during `playing` phase)
  - Space advances the chronicle

### 4.6 Actions panel (`#input-panel`)
The actions panel changes with game phase:
- `playing`: contextual town actions (talk / begin next run)
- `encounter-pause`: Engage/Resolve + optional Flee/Avoid (disabled if not allowed)
- `levelup`: choose an attribute to increase
- `gameover-win` / `gameover-loss`: restart

## 5) AI / API behavior (OpenAI-compatible)

### 5.1 What the API is used for
All API calls go through `js/api/client.js` and use the **Chat Completions** endpoint:
`POST {apiUrl}/chat/completions`

Used for:
- **Setup autofill**: fill missing theme sub-fields based on what the player entered
- **Name pool generation**: enemies / NPCs / curses / items / boss (JSON response expected)
- **Encounter narration**: streamed into the chronicle (1–2 paragraphs, no visible stats)
- **Story summary**: after run defeat, to keep continuity across runs
- **Physical description updates**: “appearance” paragraph updated after notable changes

### 5.2 Streaming narration
Narration uses `stream=true` and parses server-sent-event style `data:` chunks.
As tokens stream in, the active chronicle entry updates live.

If no API key is present, narration calls return `null` and the game falls back to mechanical-only text.

### 5.3 JSON-mode naming calls
Naming calls use `response_format: { type: "json_object" }` and then parse JSON:
- Enemy pools by difficulty
- NPC pools by difficulty
- Curses by attribute and magnitude
- Item names by attribute + strength + curseClear list
- Boss name

The generated pools are applied to a freshly generated dungeon grid, stored as `PENDING_NAMED_GRID`, and only consumed once the run starts.

### 5.4 Debug tools for AI
On the AI setup screen:
- **Show AI Prompts**: dumps the exact JSON prompts that will be sent
- **Show Generated Names**: a JSON blob that can be edited before proceeding
  - If the JSON includes `{ "version": 3, "namePools": ... }`, it applies to the pending generated grid
  - Otherwise it can override older “global pools” style (`ENEMY_NAMES`, `NPC_NAMES`, etc.)
- **Show API Timings**: shows a log of request durations and failures

## 6) Supabase integration (database)

Supabase is used only to sync **theme settings** across sessions/devices:
- Story presets
- Last session’s theme fields

API keys and API presets stay in browser localStorage only.

### 6.1 How it works
- `js/supabase/client.js` creates a Supabase client using a publishable (anon) key.
- It attempts `signInAnonymously()` to get a stable per-browser `auth.uid()`.
- `js/supabase/themeStore.js` reads/writes `theme_settings` for the current user.
- `js/presets/storage.js`:
  - loads local values first
  - then, if available, loads remote theme state and overrides local
  - queues remote writes (debounced) whenever theme values change

If Supabase is unavailable (missing CDN, auth disabled, network issues), the game silently falls back to localStorage-only.

### 6.2 Table and RLS
See `SUPABASE_THEME_SETUP.md` for the SQL to create:
- `public.theme_settings` with `user_id` primary key
- RLS policies allowing each user to select/insert/update only their own row

## 7) Code structure & architecture

### 7.1 No bundler; script load order matters
Scripts are loaded directly in `index.html` in this order:
1) `js/config/constants.js` (tuning + default pools)
2) Supabase CDN + `js/supabase/*` (optional theme sync)
3) `js/api/client.js` (network calls)
4) `js/presets/storage.js` (local presets + theme sync wiring)
5) `js/narration/prompts.js` (prompt templates)
6) `js/rendering/ui.js` (placeholder)
7) `js/narration/chronicle.js` (placeholder)
8) `js/gameplay/core.js` (main logic, state, UI rendering)

Most functions are globals on `window` by virtue of being defined in the top-level script scope.

### 7.2 Main game state (`G`)
`G` is a single global object holding the entire run state, including:
- `player`: hp, money, level, class, base attributes, inventory, statuses/curses, physical description
- `locations`: dungeon + town grids and positions
- `currentLocation`: `'dungeon'` or `'town'`
- `runNumber`, `betweenRuns`, `runTurns`, `turns`
- `phase`: controls UI rendering (`playing`, `loading`, `encounter-pause`, `levelup`, `gameover-*`)
- encounter flags: `pendingResolveFn`, `canFlee`, `encounterType`, `fleeCooldown`
- narration continuity: `storySummary`, `currentRunChronicle`, `llmChronicle`, `lastDefeat`

### 7.3 Grid cell model
Each grid cell typically looks like:
```js
{
  type: 'wall' | 'start' | 'boss' | 'empty' | 'enemy' | 'treasure' | 'npc' | 'item' | 'town-*',
  data: { ... },               // per-encounter data (difficulty, reward, etc.)
  visited: boolean,            // dungeon: fog-of-war; town: always true
  fled: boolean,               // whether the encounter was fled from
  encounterState: 'active' | 'cleared' | 'failed' | 'failed-empty' | 'none'
}
```

### 7.4 Rendering approach
`renderUI()` calls:
- `renderStatusPanel()`
- `renderCharacterDescription()`
- `renderInputPanel()`
- `renderMinimap()`

At the moment these rendering functions live in `js/gameplay/core.js`. `js/rendering/ui.js` and `js/narration/chronicle.js` are intentionally empty placeholders for a future refactor (see `REFACTOR_NOTES.md`).

## 8) File-by-file reference

### Root
- `index.html`
  - Static markup for the three screens and panel containers
  - Loads scripts in dependency order
- `css/styles.css`
  - Full UI theme: layout, panels, minimap, movement pad, buttons, typography
- `GDD.md`
  - Original design document (some parts differ from current implementation)
- `REFACTOR_NOTES.md`
  - Notes on current module split and suggested refactor slices
- `SUPABASE_THEME_SETUP.md`
  - Supabase schema + RLS setup for theme sync

### `assets/`
UI icons used in the status panel:
- `assets/Health.png` (HP hearts)
- `assets/coins.png`
- `assets/power.png`
- `assets/agility.png`
- `assets/persuasion.png`

### `js/config/`
- `js/config/constants.js`
  - Game tuning constants (grid size, wall ratio, difficulty scaling, coin ranges, item limits)
  - Debug toggles (win-all, lose-all, infinite health, narration disable)
  - Image prompt format toggle (`IMAGE_PROMPT_FORMAT`)
  - Default naming pools used if AI naming is skipped

### `js/api/`
- `js/api/client.js`
  - OpenAI-compatible Chat Completions client
  - Streaming parser for `stream=true`
  - Timing log utilities (`formatApiTimingLog()` etc.)
  - Helpers for narration, physical description, and JSON-mode naming calls
- `js/api/imageClient.js`
  - Starter OpenAI-compatible Images API client (`/images/generations`)
  - Returns base64 image payloads for in-app preview

### `js/narration/`
- `js/narration/prompts.js`
  - All prompt templates (narration, naming, story summary, appearance updates)
  - No network calls; pure string builders
- `js/narration/imagePrompts.js`
  - Image prompt builders (structured prompt block vs danbooru tags)
- `js/narration/chronicle.js`
  - Placeholder (chronicle logic currently implemented in `js/gameplay/core.js`)

### `js/presets/`
- `js/presets/storage.js`
  - localStorage persistence for:
    - API presets + last session API fields
    - Story/theme presets + last session theme fields
  - Supabase theme sync integration (load remote, queue remote saves)

### `js/supabase/`
- `js/supabase/client.js`
  - Creates Supabase client using UMD CDN global
  - Anonymous auth session helper (`ensureSession`)
- `js/supabase/themeStore.js`
  - Loads/saves theme state to `theme_settings`
  - Debounced saving and a small “sync status” indicator

### `js/gameplay/`
- `js/gameplay/core.js`
  - The main “engine”:
    - State initialization (`initState`)
    - Dungeon/town generation
    - Encounter start/resolve handlers
    - Items, statuses, defeat/run loop
    - Rendering (status panel, input panel, minimap)
    - Chronicle/log management and narration streaming integration
    - AI setup flow (generate name pools; apply overrides; proceed to class select)

### `js/rendering/`
- `js/rendering/ui.js`
  - Placeholder (rendering code currently in `js/gameplay/core.js`)

## 9) Design doc vs current implementation (important differences)

`GDD.md` describes an earlier (or target) design. The current code differs in a few key ways:
- Attribute naming: code uses `perception` but UI labels it as **Agility**
- HP max is currently **5** (GDD says 10)
- Dungeon is **13×13** with a **boss** at the bottom row (GDD references an “exit”)
- There is a **town** layer between runs with coin economy, item upgrades, and selling
- Items are level-based with derived multi-effect bonuses; max equipped items is currently **3**
- Run defeat sends the player back to town and makes one curse permanent (multi-run progression)

When updating the design, treat `js/gameplay/core.js` + `js/config/constants.js` as the source of truth for current mechanics.

## 10) Extension points / next refactor steps

From `REFACTOR_NOTES.md` (still relevant):
- Move status panel and button DOM building from `js/gameplay/core.js` → `js/rendering/ui.js`
- Move chronicle/log state and event handlers from `js/gameplay/core.js` → `js/narration/chronicle.js`
- Introduce explicit namespaces (or a boot module) to reduce global coupling
- Add smoke tests for setup flow, movement, and encounter resolution
