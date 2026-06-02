const DIRECTIONS = {
  North: { dx: 0, dy: -1 },
  South: { dx: 0, dy: 1 },
  East: { dx: 1, dy: 0 },
  West: { dx: -1, dy: 0 },
};

let G = null;
let PENDING_NAMED_GRID = null;
let ACTIVE_NAME_POOLS = null;
let NAMING_PROMPT_CACHE = null;
let GENERATED_CURSE_POOLS = null;
let AVAILABLE_CURSE_POOLS = null;
let AI_CONTEXT = {
  theme: '',
  characterDesc: '',
  townNpcDetails: ''
};
let CHRONICLE_INDEX = 0;
let CHRONICLE_SHOW_ALL = false;
const DEFAULT_BOSS_NAMES = ['the Ash Tyrant', 'the Hollow Sovereign', 'the Final Warden', 'the Iron Maw'];

function toggleAdvancedSetup(forceVisible) {
  const panel = document.getElementById('advanced-setup-fields');
  const button = document.getElementById('btn-advanced-setup');
  if (!panel || !button) return;

  const shouldShow = typeof forceVisible === 'boolean'
    ? forceVisible
    : panel.style.display === 'none';

  panel.style.display = shouldShow ? 'block' : 'none';
  button.textContent = shouldShow ? 'Hide Advanced Setup' : 'Show Advanced Setup';
}

function syncAdvancedSetupVisibility() {
  const inputs = getNamingPromptInputs();
  const hasAdvancedValues = Boolean(
    inputs.themeDetails || inputs.enemyDetails || inputs.curseDetails || inputs.townNpcDetails
  );
  toggleAdvancedSetup(hasAdvancedValues);
}

function toggleDebug() {
  const div = document.getElementById('debug-names');
  if (div.style.display === 'none') {
    div.style.display = 'block';
    document.getElementById('btn-debug').textContent = 'Hide Generated Names';
  } else {
    div.style.display = 'none';
    document.getElementById('btn-debug').textContent = 'Show Generated Names';
  }
}

function toggleTimingDebug() {
  const div = document.getElementById('debug-timings');
  const button = document.getElementById('btn-debug-timings');
  if (!div || !button) return;

  if (div.style.display === 'none') {
    if (typeof formatApiTimingLog === 'function') {
      div.value = formatApiTimingLog();
    }
    div.style.display = 'block';
    button.textContent = 'Hide API Timings';
  } else {
    div.style.display = 'none';
    button.textContent = 'Show API Timings';
  }
}

function isNarrationPromptDebugEnabled() {
  try {
    return localStorage.getItem(LS_NARRATION_PROMPT_DEBUG) === '1';
  } catch (_) {
    return false;
  }
}

function syncNarrationPromptDebugButton(forceEnabled) {
  const button = document.getElementById('btn-debug-narration');
  if (!button) return;
  const enabled = typeof forceEnabled === 'boolean' ? forceEnabled : isNarrationPromptDebugEnabled();
  button.textContent = enabled ? 'Hide Narration Prompt Logs' : 'Show Narration Prompt Logs';
  button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
}

function setNarrationPromptDebugEnabled(enabled) {
  try {
    localStorage.setItem(LS_NARRATION_PROMPT_DEBUG, enabled ? '1' : '0');
  } catch (_) {
    // Ignore storage failures; the toggle still works for this session.
  }
  syncNarrationPromptDebugButton(enabled);
  const status = document.getElementById('ai-status');
  if (status) {
    status.innerHTML = enabled
      ? '<span class="info-txt">Narration prompt logging is enabled. Check the browser console for each LLM prompt.</span>'
      : '';
  }
}

function toggleNarrationPromptDebug() {
  setNarrationPromptDebugEnabled(!isNarrationPromptDebugEnabled());
}

function logNarrationPromptDebug(label, payload, contextText = '') {
  if (!isNarrationPromptDebugEnabled()) return;
  console.groupCollapsed(`[Narration Prompt] ${label}`);
  if (contextText) console.log('Story context:', contextText);
  console.log('LLM prompt:', payload);
  console.groupEnd();
}

function refreshTimingDebug() {
  const div = document.getElementById('debug-timings');
  const button = document.getElementById('btn-debug-timings');
  if (!button) return;
  button.style.display = 'block';
  if (div && div.style.display !== 'none' && typeof formatApiTimingLog === 'function') {
    div.value = formatApiTimingLog();
  }
}

function getNamingPromptInputs() {
  return {
    setting: document.getElementById('game-setting').value.trim(),
    themeDetails: document.getElementById('game-theme-details').value.trim(),
    enemyDetails: document.getElementById('game-enemy-details').value.trim(),
    curseDetails: document.getElementById('game-curse-details').value.trim(),
    townNpcDetails: document.getElementById('game-town-npc-details').value.trim(),
    charDesc: document.getElementById('game-char-desc').value.trim(),
  };
}

function getNamingPromptSignature(inputs) {
  return JSON.stringify(inputs);
}

function applyNamingPromptInputs(inputs) {
  if (!inputs) return;
  const mapping = {
    setting: 'game-setting',
    themeDetails: 'game-theme-details',
    enemyDetails: 'game-enemy-details',
    curseDetails: 'game-curse-details',
    townNpcDetails: 'game-town-npc-details',
    charDesc: 'game-char-desc',
  };

  for (const [key, id] of Object.entries(mapping)) {
    const el = document.getElementById(id);
    if (!el || inputs[key] == null) continue;
    el.value = String(inputs[key]).trim();
  }
  syncAdvancedSetupVisibility();
}

function buildCachedNamingRequest(inputs = getNamingPromptInputs()) {
  const signature = getNamingPromptSignature(inputs);
  if (NAMING_PROMPT_CACHE && NAMING_PROMPT_CACHE.signature === signature) {
    return NAMING_PROMPT_CACHE;
  }

  const grid = generateGrid();
  const requirements = buildNamingRequirements(grid);
  const prompts = {
    enemies: buildEnemyNamesPrompt(inputs, requirements.enemies),
    npcs: buildNpcNamesPrompt(inputs, requirements.npcs),
    curses: buildCurseNamesPrompt(inputs, requirements.curses),
    items: buildItemNamesPrompt(inputs, requirements.items),
    boss: buildBossNamePrompt(inputs),
  };
  NAMING_PROMPT_CACHE = { signature, grid, requirements, prompts };
  return NAMING_PROMPT_CACHE;
}

async function fillMissingNamingInputs(inputs) {
  const missingFields = [];
  const hasSetupContext = Boolean(String(inputs.setting || '').trim() || String(inputs.themeDetails || '').trim());
  if (!String(inputs.setting || '').trim() && String(inputs.themeDetails || '').trim()) {
    missingFields.push('setting');
  }
  if (!String(inputs.themeDetails || '').trim() && hasSetupContext) {
    missingFields.push('themeDetails');
  }
  if (!String(inputs.enemyDetails || '').trim() && hasSetupContext) {
    missingFields.push('enemyDetails');
  }
  if (!String(inputs.curseDetails || '').trim() && hasSetupContext) {
    missingFields.push('curseDetails');
  }
  if (!String(inputs.townNpcDetails || '').trim() && hasSetupContext) {
    missingFields.push('townNpcDetails');
  }

  if (!missingFields.length) return inputs;

  const prompt = buildSetupAutofillPrompt(inputs, missingFields);
  const parsed = JSON.parse(await fetchGridNamingPromptJson(prompt, 'setupAutofill'));
  const nextInputs = { ...inputs };

  for (const key of missingFields) {
    if (parsed[key] != null && String(parsed[key]).trim()) {
      nextInputs[key] = String(parsed[key]).trim();
    }
  }

  applyNamingPromptInputs(nextInputs);
  if (typeof persistThemeLastSession === 'function') persistThemeLastSession();
  return nextInputs;
}

function togglePromptDebug() {
  const div = document.getElementById('debug-prompt');
  const button = document.getElementById('btn-debug-prompt');
  const statusDiv = document.getElementById('ai-status');

  if (div.style.display !== 'none') {
    div.style.display = 'none';
    button.textContent = 'Show AI Prompts';
    return;
  }

  const inputs = getNamingPromptInputs();
  if (!inputs.setting && !inputs.themeDetails) {
    statusDiv.innerHTML = '<span class="danger-txt">Setting or Theme Details are required to build the AI prompts.</span>';
    return;
  }

  const request = buildCachedNamingRequest(inputs);
  div.value = JSON.stringify(request.prompts, null, 2);
  div.style.display = 'block';
  button.textContent = 'Hide AI Prompts';
  statusDiv.innerHTML = '<span class="info-txt">These are the exact prompts that will be sent by the next name generation, unless you edit the setup fields.</span>';
}

function initState(className) {
  const base = CLASSES[className];
  const dungeonGrid = consumePendingOrGenerateDungeon();
  const townGrid = generateTown();
  G = {
    player: {
      hp: PLAYER_MAX_HP,
      money: PLAYER_STARTING_MONEY,
      level: 1,
      class: className,
      base: { power: base.power, perception: base.perception, persuasion: base.persuasion },
      statuses: [],
      permanentCurses: [],
      inventory: [],
      physicalDescription: AI_CONTEXT.characterDesc || `A ${className} adventurer.`,
      physicalDescriptionLoading: false,
      imagePromptText: '',
      imagePromptLastAuto: '',
    },
    currentLocation: 'dungeon',
    runNumber: 1,
    betweenRuns: false,
    lastDefeat: null,
    storySummary: '',
    currentRunChronicle: '',
    betweenRunChronicle: '',
    runDefeatInProgress: false,
    locations: {
      dungeon: {
        grid: dungeonGrid,
        pos: { x: dungeonGrid.start.x, y: dungeonGrid.start.y },
      },
      town: {
        grid: townGrid,
        pos: { x: townGrid.start.x, y: townGrid.start.y },
      },
    },
    phase: 'playing',
    turns: 0,
    runTurns: 0,
    gameOverSummaryLogged: false,
    pendingResolveFn: null,
    canFlee: false,
    encounterType: null,
    fleeCooldown: false
  };
}

function rollD(n) { return Math.floor(Math.random() * n) + 1; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rollRange(range) {
  return range.min + Math.floor(Math.random() * (range.max - range.min + 1));
}

function addMoney(amount) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  G.player.money += n;
  return n;
}

function spendMoney(amount) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  if (G.player.money < n) return false;
  G.player.money -= n;
  return true;
}

function attrLabel(attr) {
  if (attr === 'perception') return 'Agility';
  return attr.charAt(0).toUpperCase() + attr.slice(1);
}

function getLocationState(location = G.currentLocation) {
  return G.locations[location];
}

function getCurrentGrid() {
  return getLocationState().grid;
}

function getCurrentPos() {
  return getLocationState().pos;
}

function setCurrentPos(pos) {
  getLocationState().pos = { x: pos.x, y: pos.y };
}

function getCurrentCell() {
  const pos = getCurrentPos();
  return getCurrentGrid().cells[pos.y][pos.x];
}

function markCurrentDungeonEncounter(outcome) {
  if (G.currentLocation !== 'dungeon') return;
  const cell = getCurrentCell();
  if (!cell || !['enemy', 'treasure', 'npc', 'item'].includes(cell.type)) return;
  cell.encounterState = outcome === 'cleared' ? 'cleared' : 'failed-empty';
  cell.fled = false;
}

function respawnFailedDungeonEncounters() {
  const dungeon = G && G.locations && G.locations.dungeon;
  if (!dungeon) return;
  for (const row of dungeon.grid.cells) {
    for (const cell of row) {
      if (cell.encounterState === 'failed-empty') {
        cell.encounterState = 'active';
        cell.visited = false;
        cell.fled = false;
      }
    }
  }
}

function promptAttrKey(attr) {
  return attr === 'perception' ? 'agility' : attr;
}

function buildThemeSummary(inputs) {
  return [inputs.setting, inputs.themeDetails].filter(Boolean).join('. ');
}

function emptyTierCounts() {
  return { Easy: 0, Medium: 0, Hard: 0, 'Very Hard': 0 };
}

function emptyCurseCounts() {
  return {
    power: { '-1': 0, '-2': 0 },
    agility: { '-1': 0, '-2': 0 },
    persuasion: { '-1': 0, '-2': 0 },
  };
}

function defaultCursePoolTemplate() {
  return {
    power: { '-1': [], '-2': [] },
    perception: { '-1': [], '-2': [] },
    persuasion: { '-1': [], '-2': [] },
  };
}

function buildCurseGenerationRequirements() {
  return {
    total: 15,
    magnitude1Share: 0.8,
    magnitude2Share: 0.2,
    power: { '-1': 4, '-2': 1 },
    agility: { '-1': 4, '-2': 1 },
    persuasion: { '-1': 4, '-2': 1 },
  };
}

function emptyItemCounts() {
  return {
    power: { Weak: 0, Strong: 0 },
    agility: { Weak: 0, Strong: 0 },
    persuasion: { Weak: 0, Strong: 0 },
    curseClear: 0,
  };
}

function buildNamingRequirements(grid) {
  const requirements = {
    enemies: emptyTierCounts(),
    npcs: emptyTierCounts(),
    curses: buildCurseGenerationRequirements(),
    items: emptyItemCounts(),
  };

  const addItemNeed = (item) => {
    if (!item) return;
    if (item.type === 'curseClear') {
      requirements.items.curseClear += 1;
      return;
    }
    normalizeBuffItem(item);
    const primary = getItemPrimaryEffect(item);
    const attr = promptAttrKey(primary.attribute || 'power');
    const strength = item.level <= 2 ? 'Weak' : 'Strong';
    requirements.items[attr][strength] += 1;
  };
  const addRewardNeed = (reward) => {
    if (!reward || reward.type !== 'item') return;
    addItemNeed(reward.item);
  };

  for (let y = 0; y < GRID_HEIGHT; y++) for (let x = 0; x < GRID_WIDTH; x++) {
    const cell = grid.cells[y][x];
    const t = cell.type;
    const d = cell.data;
    if (t === 'enemy') {
      requirements.enemies[getDifficultyCategory(d.power)] += 1;
    } else if (t === 'treasure') {
      addRewardNeed(d.reward || { type: 'item', item: d.rewardItem });
    } else if (t === 'npc') {
      requirements.npcs[getDifficultyCategory(d.check)] += 1;
      addRewardNeed(d.reward || { type: 'item', item: d.rewardItem });
    } else if (t === 'item') {
      addItemNeed(d.pickup);
    }
  }

  return requirements;
}

function coerceStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || '').trim()).filter(Boolean);
}

function normalizeGeneratedNamePools(raw) {
  const enemySource = raw && raw.enemies ? raw.enemies : {};
  const npcSource = raw && raw.npcs ? raw.npcs : {};
  const curseSource = raw && (raw.curses || raw.statuses) ? (raw.curses || raw.statuses) : {};
  const itemSource = raw && raw.items ? raw.items : {};
  const legacyClearItems = [
    ...(itemSource.power && itemSource.power.Clear ? itemSource.power.Clear : []),
    ...(itemSource.perception && itemSource.perception.Clear ? itemSource.perception.Clear : []),
    ...(itemSource.agility && itemSource.agility.Clear ? itemSource.agility.Clear : []),
    ...(itemSource.persuasion && itemSource.persuasion.Clear ? itemSource.persuasion.Clear : []),
  ];

  return {
    enemies: {
      Easy: coerceStringArray(enemySource.Easy),
      Medium: coerceStringArray(enemySource.Medium),
      Hard: coerceStringArray(enemySource.Hard),
      'Very Hard': coerceStringArray(enemySource['Very Hard']),
    },
    npcs: {
      Easy: coerceStringArray(npcSource.Easy),
      Medium: coerceStringArray(npcSource.Medium),
      Hard: coerceStringArray(npcSource.Hard),
      'Very Hard': coerceStringArray(npcSource['Very Hard']),
    },
    curses: {
      power: {
        '-1': coerceStringArray(curseSource.power && curseSource.power['-1']),
        '-2': coerceStringArray(curseSource.power && curseSource.power['-2']),
      },
      perception: {
        '-1': coerceStringArray((curseSource.perception && curseSource.perception['-1']) || (curseSource.agility && curseSource.agility['-1'])),
        '-2': coerceStringArray((curseSource.perception && curseSource.perception['-2']) || (curseSource.agility && curseSource.agility['-2'])),
      },
      persuasion: {
        '-1': coerceStringArray(curseSource.persuasion && curseSource.persuasion['-1']),
        '-2': coerceStringArray(curseSource.persuasion && curseSource.persuasion['-2']),
      },
    },
    items: {
      power: {
        Weak: coerceStringArray(itemSource.power && itemSource.power.Weak),
        Strong: coerceStringArray(itemSource.power && itemSource.power.Strong),
      },
      perception: {
        Weak: coerceStringArray((itemSource.perception && itemSource.perception.Weak) || (itemSource.agility && itemSource.agility.Weak)),
        Strong: coerceStringArray((itemSource.perception && itemSource.perception.Strong) || (itemSource.agility && itemSource.agility.Strong)),
      },
      persuasion: {
        Weak: coerceStringArray(itemSource.persuasion && itemSource.persuasion.Weak),
        Strong: coerceStringArray(itemSource.persuasion && itemSource.persuasion.Strong),
      },
      curseClear: coerceStringArray(itemSource.curseClear || legacyClearItems),
    },
  };
}

function shuffleCopy(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function cloneCursePools(pools) {
  const src = pools || defaultCursePoolTemplate();
  return {
    power: { '-1': [...(src.power && src.power['-1'] ? src.power['-1'] : [])], '-2': [...(src.power && src.power['-2'] ? src.power['-2'] : [])] },
    perception: { '-1': [...(src.perception && src.perception['-1'] ? src.perception['-1'] : [])], '-2': [...(src.perception && src.perception['-2'] ? src.perception['-2'] : [])] },
    persuasion: { '-1': [...(src.persuasion && src.persuasion['-1'] ? src.persuasion['-1'] : [])], '-2': [...(src.persuasion && src.persuasion['-2'] ? src.persuasion['-2'] : [])] },
  };
}

function buildCursePoolsFromNegativeStatusPool() {
  const pools = defaultCursePoolTemplate();
  for (const status of NEGATIVE_STATUS_POOL) {
    if (!pools[status.attribute]) continue;
    const mag = String(status.magnitude);
    if (!pools[status.attribute][mag]) continue;
    pools[status.attribute][mag].push(status.name);
  }
  return pools;
}

function setRuntimeCursePools(cursePools) {
  GENERATED_CURSE_POOLS = cloneCursePools(cursePools);
  AVAILABLE_CURSE_POOLS = {
    power: { '-1': shuffleCopy(GENERATED_CURSE_POOLS.power['-1']), '-2': shuffleCopy(GENERATED_CURSE_POOLS.power['-2']) },
    perception: { '-1': shuffleCopy(GENERATED_CURSE_POOLS.perception['-1']), '-2': shuffleCopy(GENERATED_CURSE_POOLS.perception['-2']) },
    persuasion: { '-1': shuffleCopy(GENERATED_CURSE_POOLS.persuasion['-1']), '-2': shuffleCopy(GENERATED_CURSE_POOLS.persuasion['-2']) },
  };
}

function ensureRuntimeCursePools() {
  if (!GENERATED_CURSE_POOLS || !AVAILABLE_CURSE_POOLS) {
    setRuntimeCursePools(buildCursePoolsFromNegativeStatusPool());
  }
}

function resetAvailableCursePoolsForRun() {
  ensureRuntimeCursePools();
  setRuntimeCursePools(GENERATED_CURSE_POOLS);
}

function buildWorkingNamePools(namePools) {
  const pools = normalizeGeneratedNamePools(namePools || {});
  return {
    enemies: {
      Easy: shuffleCopy(pools.enemies.Easy),
      Medium: shuffleCopy(pools.enemies.Medium),
      Hard: shuffleCopy(pools.enemies.Hard),
      'Very Hard': shuffleCopy(pools.enemies['Very Hard']),
    },
    npcs: {
      Easy: shuffleCopy(pools.npcs.Easy),
      Medium: shuffleCopy(pools.npcs.Medium),
      Hard: shuffleCopy(pools.npcs.Hard),
      'Very Hard': shuffleCopy(pools.npcs['Very Hard']),
    },
    curses: {
      power: { '-1': shuffleCopy(pools.curses.power['-1']), '-2': shuffleCopy(pools.curses.power['-2']) },
      perception: { '-1': shuffleCopy(pools.curses.perception['-1']), '-2': shuffleCopy(pools.curses.perception['-2']) },
      persuasion: { '-1': shuffleCopy(pools.curses.persuasion['-1']), '-2': shuffleCopy(pools.curses.persuasion['-2']) },
    },
    items: {
      power: { Weak: shuffleCopy(pools.items.power.Weak), Strong: shuffleCopy(pools.items.power.Strong) },
      perception: { Weak: shuffleCopy(pools.items.perception.Weak), Strong: shuffleCopy(pools.items.perception.Strong) },
      persuasion: { Weak: shuffleCopy(pools.items.persuasion.Weak), Strong: shuffleCopy(pools.items.persuasion.Strong) },
      curseClear: shuffleCopy(pools.items.curseClear),
    },
  };
}

function drawPoolName(pool, fallbackFn) {
  if (pool && pool.length) return pool.pop();
  return fallbackFn();
}

function applyGeneratedItemName(item, workingPools) {
  if (!item) return;
  if (item.type === 'curseClear') {
    item.name = drawPoolName(workingPools.items.curseClear, () => pick(CURSE_CLEAR_ITEM_NAMES));
    return;
  }

  normalizeBuffItem(item);
  item.type = 'buff';
  const primary = getItemPrimaryEffect(item);
  const strength = item.level <= 2 ? 'Weak' : 'Strong';
  item.name = drawPoolName(
    workingPools.items[primary.attribute][strength],
    () => pick(ITEM_NAMES[primary.attribute][strength]),
  );
}

function getEff() {
  const p = G.player;
  const e = { power: p.base.power, perception: p.base.perception, persuasion: p.base.persuasion };
  for (const s of p.statuses) e[s.attribute] += s.magnitude;
  for (const item of p.inventory) {
    if (item.type === 'buff' && item.equipped) {
      for (const effect of getItemEffects(item)) {
        e[effect.attribute] += effect.magnitude;
      }
    }
  }
  return e;
}

function getPlayerContext() {
  const p = G.player;
  const chronicleContext = [G.storySummary, G.currentRunChronicle].filter(Boolean).join('\n\n').slice(-30000);
  let ctx = '';
  if (AI_CONTEXT.characterDesc) {
    ctx += `Character: ${AI_CONTEXT.characterDesc}. `;
  }
 // ctx += `HP: ${p.hp}/${PLAYER_MAX_HP}. Coins: ${p.money}. `;
  const equippedItems = p.inventory.filter(item => item.type === 'buff' && item.equipped);
  if (equippedItems.length > 0) {
    ctx += `Equipped Items: ${equippedItems.map(e => `${e.name} (${itemDescription(e)})`).join(', ')}. `;
  }
  if (p.statuses.length > 0) {
    ctx += `negative modifications: ${p.statuses.map(s => s.name).join(', ')}.`;
//  ctx += `the story so far: ${chronicleContext}`;
  }
  return ctx.trim();
}

function getEquippedItems() {
  return G.player.inventory.filter(item => item.type === 'buff' && item.equipped);
}

function escapeHtmlText(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function renderCharacterDescription() {
  const div = document.getElementById('character-description');
  if (!div || !G) return;
  const description = escapeHtmlText(G.player.physicalDescription || 'No physical description recorded yet.');
  const loading = G.player.physicalDescriptionLoading
    ? '<div class="runtime-api-note" style="margin-top:6px;">Updating appearance...</div>'
    : '';
  div.innerHTML = `${description}${loading}`;
}

function toggleStatusPanel(forceExpanded) {
  const panel = document.getElementById('status-panel');
  if (!panel) return;

  const shouldExpand =
    typeof forceExpanded === 'boolean'
      ? forceExpanded
      : !panel.classList.contains('expanded');

  panel.classList.toggle('expanded', shouldExpand);
  document.body.classList.toggle('status-expanded', shouldExpand);
}

function expandStatusPanelFromCollapsed(event) {
  const panel = document.getElementById('status-panel');
  if (!panel || panel.classList.contains('expanded')) return;

  if (event.target.closest('button, input, select, textarea')) return;

  toggleStatusPanel(true);
}

function toggleCharacterDescription() {
  const div = document.getElementById('character-description');
  const button = document.getElementById('btn-character-description');
  if (!div || !button) return;

  if (div.style.display === 'block') {
    div.style.display = 'none';
    button.textContent = 'Show Appearance';
    return;
  }

  renderCharacterDescription();
  div.style.display = 'block';
  button.textContent = 'Hide Appearance';
}

function getImagePromptFormatLabel() {
  const fmt = typeof IMAGE_PROMPT_FORMAT === 'string' ? IMAGE_PROMPT_FORMAT : 'structured';
  return fmt === 'danbooru' ? 'danbooru tags' : 'structured prompt';
}

function getImagePromptNoteDefault() {
  return `Format: ${getImagePromptFormatLabel()} (set in js/config/constants.js)`;
}

function renderImagePrompt() {
  const container = document.getElementById('image-prompt');
  const note = document.getElementById('image-prompt-format-note');
  const textarea = document.getElementById('image-prompt-text');
  if (!container || !note || !textarea || !G) return;

  note.textContent = getImagePromptNoteDefault();
  textarea.value = G.player.imagePromptText || '';

  if (!textarea.__gcWired) {
    textarea.__gcWired = true;
    textarea.addEventListener('input', () => {
      if (!G) return;
      G.player.imagePromptText = textarea.value;
    });
  }
}

function toggleImagePrompt() {
  const div = document.getElementById('image-prompt');
  const button = document.getElementById('btn-image-prompt');
  if (!div || !button) return;

  if (div.style.display === 'block') {
    div.style.display = 'none';
    button.textContent = 'Show Image Prompt';
    return;
  }

  renderImagePrompt();
  div.style.display = 'block';
  button.textContent = 'Hide Image Prompt';
}

function getImagePromptStoryContextSlice() {
  if (!G) return '';
  const maxChars = typeof IMAGE_PROMPT_CONTEXT_CHARS === 'number' ? IMAGE_PROMPT_CONTEXT_CHARS : 3000;
  const chronicleContext = [G.storySummary, G.currentRunChronicle].filter(Boolean).join('\n\n');
  return String(chronicleContext || '').slice(-Math.max(0, Number(maxChars) || 0));
}

async function copyImagePromptToClipboard() {
  const textarea = document.getElementById('image-prompt-text');
  const note = document.getElementById('image-prompt-format-note');
  const text = textarea ? textarea.value : (G && G.player ? G.player.imagePromptText : '');
  const payload = String(text || '');
  if (!payload) return;

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(payload);
    } else {
      const tmp = document.createElement('textarea');
      tmp.value = payload;
      tmp.setAttribute('readonly', 'readonly');
      tmp.style.position = 'fixed';
      tmp.style.left = '-9999px';
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      tmp.remove();
    }
    if (note) note.textContent = `Copied (${getImagePromptFormatLabel()})`;
    setTimeout(() => {
      if (note) note.textContent = getImagePromptNoteDefault();
    }, 1200);
  } catch (_) {
    if (note) note.textContent = 'Copy failed (browser permission)';
  }
}

async function generateImagePromptFromLLM() {
  const textarea = document.getElementById('image-prompt-text');
  const note = document.getElementById('image-prompt-format-note');
  if (!G || !textarea) return;

  if (typeof buildCharacterContextForImagePrompt !== 'function' || typeof buildImagePromptGenerationPrompt !== 'function') {
    if (note) note.textContent = 'Image prompt template not loaded.';
    return;
  }
  if (typeof chatCompletion !== 'function') {
    if (note) note.textContent = 'Chat API client not loaded.';
    return;
  }

  const p = G.player;
  const equippedItems = getEquippedItems().map(item => ({
    name: item.name,
    desc: itemDescription(item),
  }));
  const curses = (p.statuses || []).map(s => ({ ...s }));

  const characterContext = buildCharacterContextForImagePrompt({ equippedItems, curses });
  const storyContext = getImagePromptStoryContextSlice();
  const previousDescription = p.physicalDescription || AI_CONTEXT.characterDesc || '';
  const maxTokens = typeof IMAGE_PROMPT_MAX_TOKENS === 'number' ? IMAGE_PROMPT_MAX_TOKENS : 350;

  const prompt = buildImagePromptGenerationPrompt({
    format: typeof IMAGE_PROMPT_FORMAT === 'string' ? IMAGE_PROMPT_FORMAT : 'structured',
    storyContext,
    characterContext,
    previousDescription,
    maxTokens,
  });

  try {
    if (note) note.textContent = 'Generating prompt...';
    textarea.disabled = true;
    const result = await chatCompletion(prompt, { label: 'imagePrompt', maxTokens });
    const finalText = String(result || '').trim();
    if (finalText) {
      p.imagePromptText = finalText;
      textarea.value = finalText;
      if (note) note.textContent = `Generated (${getImagePromptFormatLabel()})`;
      setTimeout(() => {
        if (note) note.textContent = getImagePromptNoteDefault();
      }, 1200);
    } else {
      if (note) note.textContent = 'No prompt returned.';
    }
  } catch (err) {
    if (note) note.textContent = `Prompt error: ${err && err.message ? err.message : 'request failed'}`;
  } finally {
    textarea.disabled = false;
  }
}

async function generateImageFromPrompt() {
  const textarea = document.getElementById('image-prompt-text');
  const note = document.getElementById('image-prompt-format-note');
  const promptText = textarea ? textarea.value : '';
  if (!promptText.trim()) return;
  if (typeof imageGeneration !== 'function') {
    if (note) note.textContent = 'Image API client not loaded.';
    return;
  }

  try {
    if (note) note.textContent = 'Generating image...';
    const { b64, model } = await imageGeneration(promptText);
    const out = document.getElementById('image-api-output');
    const img = document.getElementById('image-api-output-img');
    if (img && out) {
      img.src = `data:image/png;base64,${b64}`;
      out.style.display = 'block';
    }
    if (note) note.textContent = `Generated (model: ${model})`;
  } catch (err) {
    if (note) note.textContent = `Image error: ${err && err.message ? err.message : 'request failed'}`;
  }
}

function clearGeneratedImage() {
  const out = document.getElementById('image-api-output');
  const img = document.getElementById('image-api-output-img');
  if (img) img.removeAttribute('src');
  if (out) out.style.display = 'none';
}

async function refreshPhysicalDescription(change) {
  if (!G) return;
  const p = G.player;
  const prompt = buildPhysicalDescriptionPrompt({
    theme: AI_CONTEXT.theme,
    characterDesc: AI_CONTEXT.characterDesc,
    className: p.class,
    currentDescription: p.physicalDescription,
    change,
    equippedItems: getEquippedItems(),
    curses: p.statuses,
  });

  p.physicalDescriptionLoading = true;
  renderCharacterDescription();
  const description = await generatePhysicalDescription(prompt);
  p.physicalDescriptionLoading = false;
  if (description && String(description).trim()) {
    p.physicalDescription = String(description).trim();
  }
  renderCharacterDescription();
}

function itemEffectsForLevel(level, primaryAttribute) {
  const primary = primaryAttribute || pick(['power', 'perception', 'persuasion']);
  const attrs = ['power', 'perception', 'persuasion'];
  const secondary = pick(attrs.filter(attr => attr !== primary));
  if (level === 1) return [{ attribute: primary, magnitude: 1 }];
  if (level === 2) return [{ attribute: primary, magnitude: 2 }];
  if (level === 3) return [
    { attribute: primary, magnitude: 2 },
    { attribute: secondary, magnitude: 1 },
  ];
  if (level === 4) return [
    { attribute: primary, magnitude: 2 },
    { attribute: secondary, magnitude: 2 },
  ];
  return [{ attribute: primary, magnitude: 5 }];
}

function getItemEffects(item) {
  if (!item || item.type !== 'buff') return [];
  if (Array.isArray(item.effects) && item.effects.length) {
    return item.effects
      .map(effect => ({
        attribute: effect.attribute || 'power',
        magnitude: Math.max(1, Math.min(5, Number(effect.magnitude) || 1)),
      }))
      .filter(effect => ['power', 'perception', 'persuasion'].includes(effect.attribute));
  }
  if (item.attribute) {
    return [{
      attribute: item.attribute,
      magnitude: Math.max(1, Math.min(5, Number(item.magnitude) || 1)),
    }];
  }
  return itemEffectsForLevel(Number(item.level) || 1, pick(['power', 'perception', 'persuasion']));
}

function getItemPrimaryEffect(item) {
  return getItemEffects(item)[0] || { attribute: 'power', magnitude: 1 };
}

function normalizeBuffItem(item) {
  if (!item || item.type === 'curseClear') return item;
  item.type = 'buff';
  item.level = Math.max(1, Math.min(5, Number(item.level) || 1));
  const primaryAttribute = item.attribute || (Array.isArray(item.effects) && item.effects[0] && item.effects[0].attribute) || pick(['power', 'perception', 'persuasion']);
  if (!Array.isArray(item.effects) || !item.effects.length) {
    item.effects = itemEffectsForLevel(item.level, primaryAttribute);
  } else {
    item.effects = getItemEffects(item);
  }
  const primary = getItemPrimaryEffect(item);
  item.attribute = primary.attribute;
  item.magnitude = primary.magnitude;
  return item;
}

function setItemLevel(item, level) {
  normalizeBuffItem(item);
  item.level = Math.max(1, Math.min(5, Number(level) || 1));
  item.effects = itemEffectsForLevel(item.level, item.attribute);
  const primary = getItemPrimaryEffect(item);
  item.attribute = primary.attribute;
  item.magnitude = primary.magnitude;
  return item;
}

function merchantItemPrice(item) {
  if (!item) return 0;
  if (item.type === 'curseClear') return MERCHANT_LEVEL_1_ITEM_PRICE;
  normalizeBuffItem(item);
  return item.level * MERCHANT_LEVEL_1_ITEM_PRICE;
}

function rollItemData() {
  if (Math.random() < CURSE_CLEAR_ITEM_CHANCE) {
    return { type: 'curseClear', name: '' };
  }
  const attribute = pick(['power', 'perception', 'persuasion']);
  return {
    type: 'buff',
    level: 1,
    attribute,
    magnitude: 1,
    effects: itemEffectsForLevel(1, attribute),
    name: '',
  };
}

function itemDescription(item) {
  if (item.type === 'curseClear') return 'Removes one curse';
  normalizeBuffItem(item);
  const effects = getItemEffects(item)
    .map(effect => `+${effect.magnitude} ${attrLabel(effect.attribute)}`)
    .join(', ');
  return `Lvl ${item.level}: ${effects}`;
}

function addItemFixed(itemData, legacyAttribute, legacyMagnitude) {
  const source = typeof itemData === 'object' && itemData
    ? { ...itemData }
    : { type: 'buff', name: itemData, attribute: legacyAttribute, magnitude: legacyMagnitude, level: Math.max(1, Math.min(5, Number(legacyMagnitude) || 1)) };
  const type = source.type === 'curseClear' ? 'curseClear' : 'buff';
  if (type === 'curseClear') {
    const finalName = source.name && String(source.name).trim()
      ? String(source.name).trim()
      : pick(CURSE_CLEAR_ITEM_NAMES);
    const item = { type, name: finalName };
    G.player.inventory.push(item);
    return item;
  }

  normalizeBuffItem(source);
  const primary = getItemPrimaryEffect(source);
  const strength = source.level <= 2 ? 'Weak' : 'Strong';
  const fallbackPool = ITEM_NAMES[primary.attribute][strength];
  const finalName = source.name && String(source.name).trim()
    ? String(source.name).trim()
    : pick(fallbackPool.length ? fallbackPool : ITEM_NAMES[primary.attribute].Strong);
  const item = {
    type,
    name: finalName,
    level: source.level,
    attribute: primary.attribute,
    magnitude: primary.magnitude,
    effects: source.effects,
    equipped: false,
  };
  G.player.inventory.push(item);
  return item;
}

function pickFallbackCurseName(attribute, magnitude) {
  const pool = NEGATIVE_STATUS_POOL.filter(s => s.attribute === attribute && s.magnitude === magnitude);
  const alt = NEGATIVE_STATUS_POOL.filter(s => s.magnitude === magnitude);
  const src = pool.length ? pool : (alt.length ? alt : NEGATIVE_STATUS_POOL);
  return pick(src).name;
}

function applyCurseFromEncounter(data) {
  const fc = data.failCurse;
  const curse = drawAvailableCurse(fc.attribute, fc.magnitude);
  const s = { name: curse.name, attribute: curse.attribute, magnitude: curse.magnitude };
  G.player.statuses.push(s);
  return s;
}

function drawAvailableCurse(preferredAttribute, preferredMagnitude) {
  ensureRuntimeCursePools();
  const preferredBucket = AVAILABLE_CURSE_POOLS[preferredAttribute] && AVAILABLE_CURSE_POOLS[preferredAttribute][String(preferredMagnitude)];
  if (preferredBucket && preferredBucket.length) {
    return {
      name: preferredBucket.pop(),
      attribute: preferredAttribute,
      magnitude: preferredMagnitude,
    };
  }

  const options = [];
  for (const attribute of ['power', 'perception', 'persuasion']) {
    for (const magnitude of ['-1', '-2']) {
      const bucket = AVAILABLE_CURSE_POOLS[attribute] && AVAILABLE_CURSE_POOLS[attribute][magnitude];
      if (bucket && bucket.length) options.push({ attribute, magnitude: Number(magnitude), bucket });
    }
  }

  if (options.length) {
    const choice = pick(options);
    return {
      name: choice.bucket.pop(),
      attribute: choice.attribute,
      magnitude: choice.magnitude,
    };
  }

  return {
    name: pickFallbackCurseName(preferredAttribute, preferredMagnitude),
    attribute: preferredAttribute,
    magnitude: preferredMagnitude,
  };
}

function rollMoneyReward(range = LARGE_MONEY_REWARD) {
  return { type: 'money', amount: rollRange(range) };
}

function rollDungeonRewardData() {
  if (Math.random() < MONEY_REWARD_CHANCE) return rollMoneyReward();
  return { type: 'item', item: rollItemData() };
}

function normalizeRewardData(data) {
  if (!data) return rollDungeonRewardData();
  if (data.reward) return data.reward;
  if (data.rewardItem) return { type: 'item', item: data.rewardItem };
  return rollDungeonRewardData();
}

function fillDefaultRewardName(reward) {
  if (!reward) return;
  if (reward.type === 'item') fillDefaultItemName(reward.item);
}

function applyGeneratedRewardName(reward, workingPools) {
  if (!reward) return;
  if (reward.type === 'item') applyGeneratedItemName(reward.item, workingPools);
}

function grantReward(reward) {
  if (!reward) return null;
  if (reward.type === 'money') {
    const amount = addMoney(reward.amount);
    return { type: 'money', amount };
  }
  const item = addItemFixed(reward.item);
  return { type: 'item', item };
}

function rewardName(reward) {
  if (!reward) return 'a reward';
  if (reward.type === 'money') return `${reward.amount} coins`;
  return reward.item.name;
}

function rewardDescription(reward) {
  if (!reward) return 'Reward';
  if (reward.type === 'money') return `${reward.amount} coins`;
  return `${reward.item.name} (${itemDescription(reward.item)})`;
}

function grantedRewardText(granted) {
  if (!granted) return 'nothing';
  if (granted.type === 'money') return `${granted.amount} coins`;
  return `<em>${granted.item.name}</em> (${itemDescription(granted.item)})`;
}

function damage(n) {
  if (DEBUG_INFINITE_HEALTH) return;
  G.player.hp = Math.max(0, G.player.hp - n);
}

function resolveEncounterOutcome(defaultWon) {
  if (DEBUG_LOSE_ALL_ENCOUNTERS) return false;
  if (DEBUG_WIN_ALL_ENCOUNTERS) return true;
  return defaultWon;
}

async function checkGameOver() {
  if (G.runDefeatInProgress || G.phase.startsWith('gameover')) return true;

  let reason = null;
  if (G.player.hp <= 0) reason = 'hp';
  else {
    const eff = getEff();
    for (const attr of ['power', 'perception', 'persuasion']) {
      if (eff[attr] <= 0) {
        reason = attr;
        break;
      }
    }
  }

  if (reason) {
    G.phase = 'loading';
    renderInputPanel();

    let reasonText = '';
    if (reason === 'hp') reasonText = 'You have succumbed to your wounds (0 HP).';
    else reasonText = `Your ${reason} has dropped to 0 or below due to curses.`;

    await handleRunDefeat(reasonText, 'attrition');
    return true;
  }
  return false;
}

function logGameOverSummaryOnce() {
  if (!G || G.gameOverSummaryLogged) return;
  G.gameOverSummaryLogged = true;
  addLog(`Adventure complete — level ${G.player.level}, ${G.turns} moves taken across ${G.runNumber || 1} run(s).`, 'event-win', { focus: false });
}

function levelUp() {
  if (G.player.level < MAX_LEVEL) {
    G.player.level++;
    G.phase = 'levelup';
  }
}

function isReachable(cells, sx, sy, ex, ey) {
  const W = cells[0].length;
  const H = cells.length;
  const seen = Array.from({ length: H }, () => Array(W).fill(false));
  const queue = [[sx, sy]];
  seen[sy][sx] = true;
  while (queue.length) {
    const [x, y] = queue.shift();
    if (x === ex && y === ey) return true;
    for (const { dx, dy } of Object.values(DIRECTIONS)) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (seen[ny][nx] || cells[ny][nx].type === 'wall') continue;
      seen[ny][nx] = true;
      queue.push([nx, ny]);
    }
  }
  return false;
}

function generateGrid() {
  const W = GRID_WIDTH;
  const H = GRID_HEIGHT;
  const startY = 0;
  const bossY = H - 1;

  for (let attempt = 0; attempt < GRID_GEN_MAX_ATTEMPTS; attempt++) {
    const startX = Math.floor(Math.random() * W);
    const bossPos = { x: Math.floor(Math.random() * W), y: bossY };
    const wallN = Math.floor((W * H - 2) * WALL_RATIO);
    const cells = Array.from({ length: H }, () =>
      Array.from({ length: W }, () =>
        ({ type: null, data: {}, visited: false, fled: false })));

    const positions = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (!(x === startX && y === startY) && !(x === bossPos.x && y === bossPos.y)) positions.push({ x, y });

    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    for (let i = 0; i < wallN; i++)
      cells[positions[i].y][positions[i].x].type = 'wall';

    cells[bossPos.y][bossPos.x].type = 'boss';
    cells[bossPos.y][bossPos.x].data = {
      name: pick(DEFAULT_BOSS_NAMES),
      checks: { perception: 12, persuasion: 14, power: 16 },
    };
    cells[startY][startX].type = 'start';

    if (!isReachable(cells, startX, startY, bossPos.x, bossPos.y)) continue;

    cells[startY][startX].visited = true;
    cells[startY][startX].encounterState = 'none';
    cells[bossPos.y][bossPos.x].encounterState = 'active';

    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (cells[y][x].type) continue;
      if (Math.random() < EMPTY_CELL_CHANCE) {
        cells[y][x].type = 'empty';
        cells[y][x].encounterState = 'none';
        continue;
      }
      const t = pick(ENCOUNTER_TYPES);
      cells[y][x].type = t;
      const diff = rollDifficultyByDistance(x, y, bossPos.x, bossPos.y);
      if (t === 'enemy') {
        const failAttr = pick(['power', 'perception', 'persuasion']);
        cells[y][x].data = {
          power: diff,
          failCurse: { attribute: failAttr, magnitude: -1 },
          name: '',
        };
        cells[y][x].encounterState = 'active';
      } else if (t === 'treasure') {
        const failMag = rollD(2);
        const failAttr = pick(['power', 'perception', 'persuasion']);
        cells[y][x].data = {
          difficulty: diff,
          failCurse: { attribute: failAttr, magnitude: -failMag },
          reward: rollDungeonRewardData(),
        };
        cells[y][x].encounterState = 'active';
      } else if (t === 'npc') {
        const failAttr = pick(['power', 'perception', 'persuasion']);
        cells[y][x].data = {
          check: diff,
          failCurse: { attribute: failAttr, magnitude: -2 },
          name: '',
          reward: rollDungeonRewardData(),
        };
        cells[y][x].encounterState = 'active';
      } else if (t === 'item') {
        cells[y][x].data = {
          pickup: rollItemData(),
        };
        cells[y][x].encounterState = 'active';
      }
    }

    return { cells, boss: bossPos, start: { x: startX, y: startY } };
  }
  throw new Error(`Map generation failed after ${GRID_GEN_MAX_ATTEMPTS} attempts.`);
}

function cloneGridForPlay(grid) {
  const g = JSON.parse(JSON.stringify(grid));
  for (let y = 0; y < GRID_HEIGHT; y++) for (let x = 0; x < GRID_WIDTH; x++) {
    const c = g.cells[y][x];
    c.visited = c.type === 'start';
    c.encounterState = c.encounterState || (c.type === 'start' || c.type === 'wall' || c.type === 'empty' ? 'none' : 'active');
    c.fled = false;
  }
  return g;
}

function generateTown() {
  const start = { x: Math.floor(TOWN_WIDTH / 2), y: TOWN_HEIGHT - 1 };
  const cells = Array.from({ length: TOWN_HEIGHT }, (_, y) =>
    Array.from({ length: TOWN_WIDTH }, (_, x) => ({
      type: 'town-empty',
      data: {},
      visited: true,
      revealed: true,
      fled: false,
      encounterState: 'none',
    })));

  cells[start.y][start.x] = {
    type: 'town-gate',
    data: {},
    visited: true,
    revealed: true,
    fled: false,
    encounterState: 'none',
  };

  const npcPositions = [];
  for (let y = 0; y < TOWN_HEIGHT; y++) for (let x = 0; x < TOWN_WIDTH; x++) {
    if (x === start.x && y === start.y) continue;
    npcPositions.push({ x, y });
  }

  for (let i = npcPositions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [npcPositions[i], npcPositions[j]] = [npcPositions[j], npcPositions[i]];
  }

  const placeTownNpc = (role, name, mapIcon, serviceCost = 0) => {
    const pos = npcPositions.pop();
    cells[pos.y][pos.x] = {
      type: 'town-npc',
      data: {
        role,
        name,
        mapIcon,
        serviceCost,
        details: AI_CONTEXT.townNpcDetails,
      },
      visited: true,
      revealed: true,
      fled: false,
      encounterState: 'active',
    };
    return pos;
  };

  const npcs = {
    healer: placeTownNpc('healer', 'the healer', 'H', 0),
    upgrader: placeTownNpc('upgrader', 'the upgrader', 'U', ITEM_UPGRADE_COST),
    merchant: placeTownNpc('merchant', 'the merchant', 'M'),
  };

  return { cells, start, npcs };
}

function fillDefaultItemName(item) {
  if (!item) return;
  if (item.type === 'curseClear') {
    if (!item.name) item.name = pick(CURSE_CLEAR_ITEM_NAMES);
    return;
  }

  normalizeBuffItem(item);
  const primary = getItemPrimaryEffect(item);
  const strength = item.level <= 2 ? 'Weak' : 'Strong';
  if (!item.name) {
    item.name = pick(ITEM_NAMES[primary.attribute][strength]);
  }
}

function fillDefaultNames(grid) {
  for (let y = 0; y < GRID_HEIGHT; y++) for (let x = 0; x < GRID_WIDTH; x++) {
    const cell = grid.cells[y][x];
    const t = cell.type;
    const d = cell.data;
    if (t === 'enemy') {
      const cat = getDifficultyCategory(d.power);
      if (!d.name) d.name = pick(ENEMY_NAMES[cat]);
    } else if (t === 'treasure') {
      d.reward = normalizeRewardData(d);
      fillDefaultRewardName(d.reward);
    } else if (t === 'npc') {
      const cat = getDifficultyCategory(d.check);
      if (!d.name) d.name = pick(NPC_NAMES[cat]);
      d.reward = normalizeRewardData(d);
      fillDefaultRewardName(d.reward);
    } else if (t === 'item' && d.pickup) {
      fillDefaultItemName(d.pickup);
    } else if (t === 'boss') {
      if (!d.name) d.name = pick(DEFAULT_BOSS_NAMES);
    }
  }
}

function applyNamePoolsToGrid(grid, namePools) {
  const workingPools = buildWorkingNamePools(namePools);

  for (let y = 0; y < GRID_HEIGHT; y++) for (let x = 0; x < GRID_WIDTH; x++) {
    const cell = grid.cells[y][x];
    const t = cell.type;
    const d = cell.data;
    if (t === 'enemy') {
      const cat = getDifficultyCategory(d.power);
      d.name = drawPoolName(workingPools.enemies[cat], () => pick(ENEMY_NAMES[cat]));
    } else if (t === 'treasure') {
      d.reward = normalizeRewardData(d);
      applyGeneratedRewardName(d.reward, workingPools);
    } else if (t === 'npc') {
      const cat = getDifficultyCategory(d.check);
      d.name = drawPoolName(workingPools.npcs[cat], () => pick(NPC_NAMES[cat]));
      d.reward = normalizeRewardData(d);
      applyGeneratedRewardName(d.reward, workingPools);
    } else if (t === 'item') {
      applyGeneratedItemName(d.pickup, workingPools);
    } else if (t === 'boss') {
      if (namePools && namePools.boss && namePools.boss.name) {
        d.name = String(namePools.boss.name).trim();
      }
    }
  }
}

function applyBossNameToGrid(grid, bossName) {
  const fallback = pick(DEFAULT_BOSS_NAMES);
  const finalName = String(bossName || '').trim() || fallback;
  for (let y = 0; y < GRID_HEIGHT; y++) for (let x = 0; x < GRID_WIDTH; x++) {
    const cell = grid.cells[y][x];
    if (cell.type === 'boss') {
      cell.data.name = finalName;
      return;
    }
  }
}


function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function setActiveNamePools(namePools) {
  if (!namePools) {
    ACTIVE_NAME_POOLS = null;
    return;
  }
  ACTIVE_NAME_POOLS = clonePlain({
    ...normalizeGeneratedNamePools(namePools),
    boss: namePools.boss ? { ...namePools.boss } : undefined,
  });
}

function consumePendingOrGenerateDungeon() {
  if (PENDING_NAMED_GRID) {
    const dungeonGrid = cloneGridForPlay(PENDING_NAMED_GRID);
    PENDING_NAMED_GRID = null;
    return dungeonGrid;
  }
  return generateNamedDungeonForRun();
}

function generateNamedDungeonForRun() {
  const dungeonGrid = generateGrid();
  if (ACTIVE_NAME_POOLS) {
    applyNamePoolsToGrid(dungeonGrid, ACTIVE_NAME_POOLS);
  }
  fillDefaultNames(dungeonGrid);
  return dungeonGrid;
}

function resetTransientRunFlags() {
  G.pendingResolveFn = null;
  G.canFlee = false;
  G.encounterType = null;
  G.fleeCooldown = false;
}

function cloneCurse(curse, permanent = Boolean(curse && curse.permanent)) {
  return {
    name: curse.name,
    attribute: curse.attribute,
    magnitude: curse.magnitude,
    permanent,
  };
}

function sameCurse(a, b) {
  return Boolean(a && b && a.name === b.name && a.attribute === b.attribute && a.magnitude === b.magnitude);
}

function addPermanentCurse(curse) {
  if (!curse) return null;
  const permanent = cloneCurse(curse, true);
  G.player.permanentCurses = G.player.permanentCurses || [];
  if (!G.player.permanentCurses.some(existing => sameCurse(existing, permanent))) {
    G.player.permanentCurses.push(permanent);
  }
  return permanent;
}

function choosePermanentCurseFromDefeat() {
  const statuses = G.player.statuses || [];
  if (!statuses.length) return null;
  const temporary = statuses.filter(status => !status.permanent);
  return cloneCurse(pick(temporary.length ? temporary : statuses), true);
}

function resetStatusesToPermanentCurses() {
  G.player.permanentCurses = G.player.permanentCurses || [];
  G.player.statuses = G.player.permanentCurses.map(curse => cloneCurse(curse, true));
}

function stripHtml(value) {
  const div = document.createElement('div');
  div.innerHTML = String(value || '');
  return div.textContent || div.innerText || '';
}

function fallbackStorySummary(defeatDetails, permanentCurse) {
  const previous = G.storySummary ? `${G.storySummary} ` : '';
  const curseText = permanentCurse ? ` A curse remains permanent: ${permanentCurse.name}.` : '';
  const chronicle = String(G.currentRunChronicle || '').replace(/\s+/g, ' ').trim();
  const recent = chronicle ? ` Recent events: ${chronicle.slice(-700)}` : '';
  return `${previous}Run ${defeatDetails.runNumber} ended after ${defeatDetails.reasonText}.${curseText}${recent}`.slice(-1800).trim();
}

async function summarizeStoryAfterDefeat(defeatDetails, permanentCurse) {
  const previousSummary = G.storySummary || '';
  const chronicle = G.currentRunChronicle || G.llmChronicle || '';
  const summaryPrompt = buildStorySummaryPrompt(previousSummary, chronicle, defeatDetails, permanentCurse);
  logNarrationPromptDebug('storySummary', summaryPrompt, chronicle);
  let summary = null;
  try {
    const { apiKey } = getApiFromDom();
    if (apiKey) {
      summary = await chatCompletion(summaryPrompt, { label: 'storySummary' });
    }
  } catch (err) {
    console.error('Story summary error:', err);
  }
  G.storySummary = String(summary || fallbackStorySummary(defeatDetails, permanentCurse)).trim();
  G.llmChronicle = G.storySummary;
  G.currentRunChronicle = '';
}

async function handleRunDefeat(reasonText, defeatSource = 'dungeon') {
  if (G.runDefeatInProgress) return true;
  G.runDefeatInProgress = true;
  G.phase = 'loading';
  resetTransientRunFlags();
  renderInputPanel();

  const runNumber = G.runNumber || 1;
  const selectedCurse = choosePermanentCurseFromDefeat();
  const permanentCurse = selectedCurse ? addPermanentCurse(selectedCurse) : null;
  
  const removedCurses = G.player.statuses.filter(
  status => !G.player.permanentCurses.some(
    curse => curse.name === status.name
  )
);
console.log(`statuses: ${G.player.statuses}`);
console.log(`permanent curses: ${G.player.permanentCurses}`);
console.log(`removed curses: ${removedCurses}`); 
//  const removedCurses = G.player.statuses.filter(  status => !G.player.permanentCurses.includes(status)

  const defeatDetails = { reasonText, defeatSource, runNumber, permanentCurse, removedCurses};
  G.lastDefeat = defeatDetails;

  addLog(`<span class="danger-txt">☠ ${reasonText} Run ${runNumber} is lost.</span>`, 'event-loss', { focus: false });
  await streamNarrationLog(
    buildRunDefeatPrompt(reasonText, getPlayerContext()),
    '<span class="info-txt">The narrator is thinking...</span>',
    'event-loss',
    { focus: false },
  );

  resetStatusesToPermanentCurses();
  G.player.hp = PLAYER_MAX_HP;
  G.betweenRuns = true;
  G.currentLocation = 'town';
  G.phase = 'loading';
  const town = G.locations.town;
  town.pos = { x: town.grid.start.x, y: town.grid.start.y };

  await summarizeStoryAfterDefeat(defeatDetails, permanentCurse);
  await streamNarrationLog(
    buildReturnToTownPrompt(defeatDetails, getPlayerContext()),
    '<span class="info-txt">The narrator is describing your return...</span>',
    'event-loss',
  );

  const curseText = permanentCurse
    ? ` One curse becomes permanent: <em>${permanentCurse.name}</em> (${attrLabel(permanentCurse.attribute)} ${permanentCurse.magnitude}).`
    : ' No curse becomes permanent.';
  addLog(`<span class="info-txt">You awaken in town at full HP.${curseText} Your coins and items remain with you.</span>`, 'event-neutral');

  G.phase = 'playing';
  G.runDefeatInProgress = false;
  renderUI();
  return true;
}

function pause(announceFn, resolveFn, canFlee = false, type = 'enemy') {
  announceFn();
  renderStatusPanel();
  G.phase = 'encounter-pause';
  G.pendingResolveFn = resolveFn;
  G.canFlee = canFlee;
  G.encounterType = type;
  renderInputPanel();
}

async function continueEncounter() {
  const fn = G.pendingResolveFn;
  G.pendingResolveFn = null;
  G.canFlee = false;

  const pos = getCurrentPos();
  const cell = getCurrentGrid().cells[pos.y][pos.x];
  cell.fled = false;

  await fn();
  G.fleeCooldown = false;
  if (!G.phase.startsWith('gameover')) {
    const isGameOver = await checkGameOver();
    if (!isGameOver) renderUI();
  }
}

async function fleeEncounter() {
  const pos = getCurrentPos();
  const cell = getCurrentGrid().cells[pos.y][pos.x];
  cell.fled = true;
  G.pendingResolveFn = null;
  G.canFlee = false;
  G.phase = 'loading';
  renderInputPanel();

  G.fleeCooldown = true;

  const prompt = buildFleeNarrationPrompt(getPlayerContext());
  const narration = await streamNarrationLog(prompt);
  addLog(`You flee from the encounter. It remains here should you return.`, 'event-neutral', { focus: !narration });

  const isGameOver = await checkGameOver();
  if (!isGameOver) {
    G.phase = 'playing';
    renderUI();
  }
}

async function startEnemy(data, canFlee) {
  G.phase = 'loading';
  renderInputPanel();
  const eff = getEff();
  const diffCat = getDifficultyCategory(data.power);
  const defaultText = `You enter a chamber and face <span class="highlight">${data.name}</span>. Its Power is <span class="highlight">${diffCat}</span>. Your effective Power is <span class="highlight">${eff.power}</span>. Brace yourself…`;

  const prompt = buildEnemyStartPrompt(data, diffCat, getPlayerContext());
  const narration = await streamNarrationLog(prompt, '<span class="info-txt">The narrator is thinking...</span>', 'event-enemy');

  pause(
    () => { if (!narration) addLog(defaultText, 'event-enemy'); },
    () => resolveEnemy(data),
    canFlee,
    'enemy'
  );
}

async function resolveEnemy(data) {
  G.phase = 'loading';
  renderInputPanel();
  const eff = getEff();
  const won = resolveEncounterOutcome(eff.power >= data.power);
  let mechText = '';
  let s = null;
  if (won) {
    const gained = addMoney(rollRange(ENEMY_WIN_MONEY));
    mechText = `<span class="good-txt">Your strength prevails — ${data.name} falls. Victory!</span><br><span class="good-txt">⬆ You gain a level · +${gained} coins.</span>`;
  } else {
    s = applyCurseFromEncounter(data);
    damage(1);
    const gained = addMoney(rollRange(ENEMY_LOSS_MONEY));
    mechText = `<span class="danger-txt">The enemy overwhelms you (Power ${data.power} vs your ${eff.power}). You stagger back, wounded.</span><br><span class="danger-txt">▼ −1 HP · Cursed: <em>${s.name}</em> (${attrLabel(s.attribute)} ${s.magnitude}) · +${gained} coins.</span>`;
  }

  const prompt = buildEnemyResolvePrompt(data, won, getPlayerContext(), s);
  const narration = await streamNarrationLog(prompt, '<span class="info-txt">The narrator is thinking...</span>', 'event-enemy');
  addLog(mechText, 'event-enemy', { focus: !narration });
  if (s) await refreshPhysicalDescription(`Inflicted curse ${s.name}.`);

  if (won) {
    markCurrentDungeonEncounter('cleared');
    levelUp();
  }
  else {
    markCurrentDungeonEncounter('failed');
    const isGameOver = await checkGameOver();
    if (!isGameOver) {
      G.phase = 'playing';
    }
  }
}

async function startTreasure(data, canFlee) {
  G.phase = 'loading';
  renderInputPanel();
  const eff = getEff();
  const diffCat = getDifficultyCategory(data.difficulty);
  data.reward = normalizeRewardData(data);
  fillDefaultRewardName(data.reward);
  const defaultText = `You spot something in the shadows — a hidden cache, or perhaps a snare. The Difficulty is <span class="highlight">${diffCat}</span>. Your Agility is <span class="highlight">${eff.perception}</span>. Proceed carefully…`;

  const prompt = buildTreasureStartPrompt(diffCat, getPlayerContext(), data.reward);
  const narration = await streamNarrationLog(prompt, '<span class="info-txt">The narrator is thinking...</span>', 'event-treasure');

  pause(
    () => { if (!narration) addLog(defaultText, 'event-treasure'); },
    () => resolveTreasure(data),
    canFlee,
    'treasure'
  );
}

async function resolveTreasure(data) {
  G.phase = 'loading';
  renderInputPanel();
  const eff = getEff();
  const won = resolveEncounterOutcome(eff.perception > data.difficulty);

  let mechText = '';
  let granted = null;
  let s = null;
  if (won) {
    data.reward = normalizeRewardData(data);
    granted = grantReward(data.reward);
    mechText = `<span class="good-txt">Your agility (${eff.perception}) beats the concealment (Difficulty ${data.difficulty}). Treasure claimed!</span><br><span class="good-txt">⬆ You gain a level and pocket: ${grantedRewardText(granted)}</span>`;
  } else {
    s = applyCurseFromEncounter(data);
    damage(1);
    mechText = `<span class="danger-txt">You trigger the treasure's trap (Difficulty ${data.difficulty} vs Agility ${eff.perception}).</span><br><span class="danger-txt">▼ −1 HP · Cursed: <em>${s.name}</em> (${attrLabel(s.attribute)} ${s.magnitude})</span>`;
  }

  const prompt = buildTreasureResolvePrompt(won, getPlayerContext(), data.reward, data, s);
  const narration = await streamNarrationLog(prompt, '<span class="info-txt">The narrator is thinking...</span>', 'event-treasure');
  addLog(mechText, 'event-treasure', { focus: !narration });
  if (s) await refreshPhysicalDescription(`Inflicted curse ${s.name}.`);

  if (won) {
    markCurrentDungeonEncounter('cleared');
    levelUp();
  }
  else {
    markCurrentDungeonEncounter('failed');
    const isGameOver = await checkGameOver();
    if (!isGameOver) {
      G.phase = 'playing';
    }
  }
}

async function startNPC(data, canFlee) {
  G.phase = 'loading';
  renderInputPanel();
  const eff = getEff();
  const diffCat = getDifficultyCategory(data.check);
  const defaultText = `You encounter <span class="highlight">${data.name}</span>. They eye you warily. The Persuasion check is <span class="highlight">${diffCat}</span>. Your Persuasion is <span class="highlight">${eff.persuasion}</span>. Choose your words…`;

  const prompt = buildNpcStartPrompt(data, diffCat, getPlayerContext());
  const narration = await streamNarrationLog(prompt, '<span class="info-txt">The narrator is thinking...</span>', 'event-npc');

  pause(
    () => { if (!narration) addLog(defaultText, 'event-npc'); },
    () => resolveNPC(data),
    canFlee,
    'npc'
  );
}

async function resolveNPC(data) {
  G.phase = 'loading';
  renderInputPanel();
  const eff = getEff();
  const won = resolveEncounterOutcome(eff.persuasion >= data.check);
  data.reward = normalizeRewardData(data);
  fillDefaultRewardName(data.reward);

  let mechText = '';
  let granted = null;
  let s = null;
  if (won) {
    granted = grantReward(data.reward);
    mechText = `<span class="good-txt">Your words win them over (Persuasion ${eff.persuasion} vs Difficulty ${data.check}). They offer a gift.</span><br><span class="good-txt">Received: ${grantedRewardText(granted)}</span>`;
  } else {
    s = applyCurseFromEncounter(data);
    damage(1);
    mechText = `<span class="danger-txt">Your words fall flat (Persuasion ${eff.persuasion} vs Difficulty ${data.check}). The encounter turns hostile.</span><br><span class="danger-txt">▼ −1 HP · Cursed: <em>${s.name}</em> (${attrLabel(s.attribute)} ${s.magnitude})</span>`;
  }

  const prompt = buildNpcResolvePrompt(data, won, getPlayerContext(), data.reward, s);
  const narration = await streamNarrationLog(prompt, '<span class="info-txt">The narrator is thinking...</span>', 'event-npc');
  addLog(mechText, 'event-npc', { focus: !narration });
  if (s) await refreshPhysicalDescription(`Inflicted curse ${s.name}.`);
  markCurrentDungeonEncounter(won ? 'cleared' : 'failed');

  const isGameOver = await checkGameOver();
  if (!isGameOver) {
    G.phase = 'playing';
  }
}

async function startItem(data) {
  G.phase = 'loading';
  renderInputPanel();

  const item = addItemFixed(data.pickup);
  const defaultText = `You find an item on the floor: <span class="good-txt">${item.name}</span> (${itemDescription(item)}).`;

  const prompt = buildFloorItemPrompt(item, getPlayerContext());
  const narration = await streamNarrationLog(prompt);
  addLog(defaultText, 'event-neutral', { focus: !narration });
  markCurrentDungeonEncounter('cleared');

  const isGameOver = await checkGameOver();
  if (!isGameOver) {
    G.phase = 'playing';
    renderUI();
  }
}

async function startBoss(data) {
  G.phase = 'loading';
  renderInputPanel();
  const eff = getEff();
  const defaultText = `The final chamber opens. <span class="highlight">${data.name}</span> blocks your path. Three trials await: Agility (${eff.perception} vs ${data.checks.perception}), Persuasion (${eff.persuasion} vs ${data.checks.persuasion}), then Combat (${eff.power} vs ${data.checks.power}).`;
  const prompt = buildBossStartPrompt(data, getPlayerContext());
  const narration = await streamNarrationLog(prompt, '<span class="info-txt">The narrator is thinking...</span>', 'event-enemy');
  pause(
    () => { if (!narration) addLog(defaultText, 'event-enemy'); },
    () => resolveBoss(data),
    false,
    'boss'
  );
}

async function resolveBoss(data) {
  G.phase = 'loading';
  renderInputPanel();
  const eff = getEff();
  const checks = [
    { key: 'perception', label: 'Agility' },
    { key: 'persuasion', label: 'Persuasion' },
    { key: 'power', label: 'Combat' },
  ];
  for (const stage of checks) {
    const won = resolveEncounterOutcome(eff[stage.key] >= data.checks[stage.key]);
    const mechText = won
      ? `<span class="good-txt">Boss ${stage.label} check passed (${eff[stage.key]} vs ${data.checks[stage.key]}).</span>`
      : `<span class="danger-txt">Boss ${stage.label} check failed (${eff[stage.key]} vs ${data.checks[stage.key]}). You are defeated.</span>`;
    const prompt = buildBossResolvePrompt(data, stage.key, won, getPlayerContext());
    const narration = await streamNarrationLog(prompt, '<span class="info-txt">The narrator is thinking...</span>', won ? 'event-win' : 'event-loss');
    addLog(mechText, won ? 'event-win' : 'event-loss', { focus: !narration });
    if (!won) {
      await handleRunDefeat(`The boss ${data.name} defeated you during the ${stage.label} trial.`, 'boss');
      return;
    }
  }

  markCurrentDungeonEncounter('cleared');
  G.phase = 'gameover-win';
  addLog(`<span class="good-txt">✦ ${data.name} is defeated. You conquer the dungeon!</span>`, 'event-win');
  addLog(`Survived ${G.turns} moves · reached level ${G.player.level}.`, 'event-win', { focus: false });
}

function returnCurseToPool(curse) {
  ensureRuntimeCursePools();
  const bucket = AVAILABLE_CURSE_POOLS[curse.attribute] && AVAILABLE_CURSE_POOLS[curse.attribute][String(curse.magnitude)];
  if (bucket) bucket.push(curse.name);
}

function payForTownService(data) {
  const cost = Math.max(0, Math.floor(Number(data.serviceCost) || 0));
  if (!spendMoney(cost)) {
    addLog(`<span class="danger-txt">${data.name} charges ${cost} coins, but you only have ${G.player.money}.</span>`, 'event-neutral');
    renderUI();
    return false;
  }
  return true;
}

async function startTownNpc(data) {
  if (!data) {
    addLog(`<span class="info-txt">They have nothing for you yet.</span>`, 'event-neutral');
    renderUI();
    return;
  }
  if (data.role === 'healer') {
    await visitHealer(data);
    return;
  }
  if (data.role === 'upgrader') {
    await visitUpgrader(data);
    return;
  }
  if (data.role === 'merchant') {
    await visitMerchant(data);
    return;
  }

  addLog(`<span class="info-txt">They have nothing for you yet.</span>`, 'event-neutral');
  renderUI();
}

async function visitHealer(data) {
  G.phase = 'loading';
  renderInputPanel();

  const prompt = buildHealerDialoguePrompt(data, getPlayerContext(), G.lastDefeat);
  const narration = await streamNarrationLog(prompt, '<span class="info-txt">The healer is speaking...</span>', 'event-npc');
  addLog(`<span class="info-txt">${data.name} watches over your resurrection, but offers no paid healing or curse removal.</span>`, 'event-neutral', { focus: !narration });
  G.phase = 'playing';
  renderUI();
}

function chooseInventoryIndex(items, label, formatter) {
  // Deprecated: native `prompt()` breaks backspace/delete on some mobile browsers.
  // Use `chooseInventoryIndexModal(...)` instead (async).
  console.warn('chooseInventoryIndex is deprecated; use chooseInventoryIndexModal instead.');
  return -1;
}

function chooseInventoryIndexes(items, label, formatter) {
  // Deprecated: native `prompt()` breaks backspace/delete on some mobile browsers.
  // Use `chooseInventoryIndexesModal(...)` instead (async).
  console.warn('chooseInventoryIndexes is deprecated; use chooseInventoryIndexesModal instead.');
  return [];
}

function ensureGcActionModalStyles() {
  if (document.getElementById('gc-action-modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'gc-action-modal-styles';
  style.textContent = `
    .gc-action-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}
    .gc-action-modal{width:min(680px,100%);max-height:min(82vh,720px);overflow:auto;background:var(--panel,#000410);border:1px solid var(--border,#1a3250);border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.8);padding:14px}
    .gc-action-modal h3{margin:0 0 8px 0;font-size:1.05rem;color:var(--gold,#ffbe1a);letter-spacing:.5px;text-transform:uppercase}
    .gc-action-modal p{margin:0 0 10px 0;color:var(--text,#eaeaff);opacity:.95}
    .gc-action-list{display:flex;flex-direction:column;gap:8px;margin-top:8px}
    .gc-action-row{display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid rgba(26,50,80,.65);border-radius:12px;background:rgba(255,255,255,.03)}
    .gc-action-row input{margin-top:3px;flex:0 0 auto}
    .gc-action-row label{flex:1 1 auto;cursor:pointer}
    .gc-action-title{font-weight:700;color:var(--text,#eaeaff)}
    .gc-action-sub{opacity:.85;color:var(--text-dim,#627b9b);font-size:.92rem;margin-top:2px}
    .gc-action-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}
    .gc-action-actions .btn{margin:0}
  `;
  document.head.appendChild(style);
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function gcModalSelect({ title, message, options, multiple = false, confirmText, cancelText } = {}) {
  ensureGcActionModalStyles();
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'gc-action-backdrop';
    const modal = document.createElement('div');
    modal.className = 'gc-action-modal';

    const safeTitle = escapeHtml(title || (multiple ? 'Choose Items' : 'Choose One'));
    const safeMsg = escapeHtml(message || '');
    const okText = escapeHtml(confirmText || (multiple ? 'Confirm' : 'Choose'));
    const noText = escapeHtml(cancelText || 'Cancel');

    const inputType = multiple ? 'checkbox' : 'radio';
    const groupName = `gcModalSel_${Math.random().toString(36).slice(2)}`;

    const rowsHtml = (options || []).map((opt, idx) => {
      const id = `${groupName}_${idx}`;
      const titleHtml = escapeHtml(opt.title || opt.label || String(opt.value));
      const subHtml = opt.subtitle ? `<div class="gc-action-sub">${escapeHtml(opt.subtitle)}</div>` : '';
      return `
        <div class="gc-action-row">
          <input id="${id}" type="${inputType}" name="${groupName}" value="${escapeHtml(String(opt.value))}">
          <label for="${id}">
            <div class="gc-action-title">${titleHtml}</div>
            ${subHtml}
          </label>
        </div>
      `;
    }).join('');

    modal.innerHTML = `
      <h3>${safeTitle}</h3>
      ${safeMsg ? `<p>${safeMsg}</p>` : ''}
      <div class="gc-action-list">${rowsHtml}</div>
      <div class="gc-action-actions">
        <button type="button" class="btn btn-dir">${noText}</button>
        <button type="button" class="btn btn-continue">${okText}</button>
      </div>
    `;

    const [btnCancel, btnOk] = modal.querySelectorAll('.gc-action-actions button');

    const cleanup = () => {
      document.removeEventListener('keydown', onKeyDown, true);
      backdrop.remove();
    };

    const finish = (value) => {
      cleanup();
      resolve(value);
    };

    const getSelected = () => {
      const inputs = Array.from(modal.querySelectorAll(`input[type="${inputType}"]`));
      if (multiple) {
        const selected = inputs.filter(i => i.checked).map(i => i.value);
        return selected;
      }
      const one = inputs.find(i => i.checked);
      return one ? one.value : null;
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(null);
        return;
      }
      if (e.key === 'Enter') {
        // Enter confirms selection (useful on desktop).
        e.preventDefault();
        btnOk.click();
      }
    };

    btnCancel.addEventListener('click', () => finish(null));
    btnOk.addEventListener('click', () => finish(getSelected()));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) finish(null);
    });

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    document.addEventListener('keydown', onKeyDown, true);

    // Autofocus first option for accessibility.
    setTimeout(() => {
      const first = modal.querySelector('input');
      if (first) first.focus({ preventScroll: true });
    }, 0);
  });
}

async function chooseInventoryIndexModal(items, label, formatter, confirmText = 'Choose') {
  const options = items.map(({ item, index }) => ({
    value: String(index),
    title: item.name,
    subtitle: formatter(item),
  }));
  const picked = await gcModalSelect({
    title: label || 'Choose One',
    message: '',
    options,
    multiple: false,
    confirmText,
  });
  if (picked == null) return -1;
  const asNum = Number(picked);
  return Number.isInteger(asNum) ? asNum : -1;
}

async function chooseInventoryIndexesModal(items, label, formatter, confirmText = 'Confirm') {
  const options = items.map(({ item, index }) => ({
    value: String(index),
    title: item.name,
    subtitle: formatter(item),
  }));
  const picked = await gcModalSelect({
    title: label || 'Choose Items',
    message: '',
    options,
    multiple: true,
    confirmText,
  });
  if (!Array.isArray(picked)) return [];
  return picked.map((v) => Number(v)).filter((n) => Number.isInteger(n));
}

async function visitUpgrader(data) {
  const eligible = G.player.inventory
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.type === 'buff' && normalizeBuffItem(item).level < 5);

  if (!eligible.length) {
    addLog(`<span class="info-txt">${data.name} can only upgrade status items below level 5.</span>`, 'event-neutral');
    renderUI();
    return;
  }

  const itemIndex = await chooseInventoryIndexModal(
    eligible,
    `Choose a status item to upgrade for ${data.serviceCost} coins`,
    itemDescription,
  );
  if (itemIndex < 0) {
    addLog(`<span class="info-txt">No item was upgraded.</span>`, 'event-neutral');
    renderUI();
    return;
  }

  if (!payForTownService(data)) return;

  G.phase = 'loading';
  renderInputPanel();
  const item = G.player.inventory[itemIndex];
  const previousLevel = normalizeBuffItem(item).level;
  setItemLevel(item, previousLevel + 1);
  const fallbackText = `<span class="good-txt">${data.name} upgrades <em>${item.name}</em> to level ${item.level} for ${data.serviceCost} coins.</span>`;

  const prompt = buildUpgraderDialoguePrompt(data, item, previousLevel, getPlayerContext());
  const narration = await streamNarrationLog(prompt, '<span class="info-txt">The upgrader is speaking...</span>', 'event-npc');
  addLog(fallbackText, 'event-neutral', { focus: !narration });
  await refreshPhysicalDescription(`Town upgrader improved ${item.name} from level ${previousLevel} to level ${item.level}.`);
  G.phase = 'playing';
  renderUI();
}

async function visitMerchant(data) {
  const sellable = G.player.inventory
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !(item.type === 'buff' && item.equipped));
  if (!sellable.length) {
    addLog(`<span class="info-txt">${data.name} only buys unequipped items.</span>`, 'event-neutral');
    renderUI();
    return;
  }

  const itemIndexes = await chooseInventoryIndexesModal(
    sellable,
    'Choose item(s) to sell',
    item => `${itemDescription(item)} · ${merchantItemPrice(item)} coins`,
  );
  if (!itemIndexes.length) {
    addLog(`<span class="info-txt">No item was sold.</span>`, 'event-neutral');
    renderUI();
    return;
  }

  const sold = [];
  let total = 0;
  for (const index of itemIndexes.sort((a, b) => b - a)) {
    const item = G.player.inventory[index];
    if (!item || (item.type === 'buff' && item.equipped)) continue;
    const price = merchantItemPrice(item);
    total += price;
    sold.push({ item, price });
    G.player.inventory.splice(index, 1);
  }

  if (!sold.length) {
    addLog(`<span class="info-txt">No item was sold.</span>`, 'event-neutral');
    renderUI();
    return;
  }

  addMoney(total);
  const soldText = sold.reverse().map(({ item, price }) => `<em>${item.name}</em> (${price} coins)`).join(', ');
  addLog(`<span class="good-txt">${data.name} buys ${soldText}. Total: ${total} coins.</span>`, 'event-neutral');
  G.phase = 'playing';
  renderUI();
}

function movePlayer(dir) {
  if (G.phase !== 'playing') return;
  if (G.currentLocation === 'town') {
    movePlayerInTown(dir);
    return;
  }
  movePlayerInDungeon(dir);
}

function movePlayerInDungeon(dir) {
  const { dx, dy } = DIRECTIONS[dir];
  const pos = getCurrentPos();
  const grid = getCurrentGrid();
  const np = { x: pos.x + dx, y: pos.y + dy };

  if (np.x < 0 || np.x >= GRID_WIDTH || np.y < 0 || np.y >= GRID_HEIGHT) {
    addLog(`There is nothing but solid stone in that direction.`, 'event-neutral');
    renderUI();
    return;
  }

  if (grid.cells[np.y][np.x].type === 'wall') {
    grid.cells[np.y][np.x].visited = true;
    addLog(`A wall of cold stone blocks your path.`, 'event-neutral');
    renderUI();
    return;
  }

  setCurrentPos(np);
  G.turns++;
  G.runTurns = (G.runTurns || 0) + 1;

  const cell = grid.cells[np.y][np.x];

  if (cell.type === 'boss') {
    cell.visited = true;
    if (cell.encounterState === 'cleared') {
      G.phase = 'gameover-win';
      addLog(`<span class="good-txt">✦ The boss chamber lies silent. You are victorious.</span>`, 'event-win');
      addLog(`Survived ${G.turns} moves · reached level ${G.player.level}.`, 'event-win', { focus: false });
      renderUI();
      return;
    }
    startBoss(cell.data);
    return;
  }

  if (cell.type === 'start') {
    cell.visited = true;
    checkGameOver().then(isGameOver => {
      if (!isGameOver) renderUI();
    });
    return;
  }

  if (cell.encounterState === 'cleared') {
    checkGameOver().then(isGameOver => {
      if (!isGameOver) renderUI();
    });
    return;
  }
  if (cell.encounterState === 'failed-empty') {
    checkGameOver().then(isGameOver => {
      if (!isGameOver) renderUI();
    });
    return;
  }

  const canFlee = !cell.fled && !G.fleeCooldown;
  cell.visited = true;

  if (cell.type === 'enemy') startEnemy(cell.data, canFlee);
  else if (cell.type === 'treasure') startTreasure(cell.data, canFlee);
  else if (cell.type === 'npc') startNPC(cell.data, canFlee);
  else if (cell.type === 'item') startItem(cell.data);
  else renderUI();
}

function movePlayerInTown(dir) {
  const { dx, dy } = DIRECTIONS[dir];
  const pos = getCurrentPos();
  const grid = getCurrentGrid();
  const np = { x: pos.x + dx, y: pos.y + dy };

  if (np.x < 0 || np.x >= TOWN_WIDTH || np.y < 0 || np.y >= TOWN_HEIGHT) {
    addLog(`The town boundary stops you from wandering farther.`, 'event-neutral');
    renderUI();
    return;
  }

  setCurrentPos(np);
  G.turns++;
  const cell = grid.cells[np.y][np.x];
  if (cell.type === 'town-npc') {
    addLog(`You approach <span class="highlight">${cell.data.name}</span>.`, 'event-neutral');
  }
  renderUI();
}

function enterTown() {
  if (!G.betweenRuns) {
    addLog(`<span class="info-txt">The way back to town is lost until this run ends.</span>`, 'event-neutral');
    renderUI();
    return;
  }
  if (G.currentLocation !== 'dungeon') return;
  G.currentLocation = 'town';
  G.phase = 'playing';
  resetTransientRunFlags();
  const town = G.locations.town;
  town.pos = { x: town.grid.start.x, y: town.grid.start.y };
  renderUI();
}

function enterDungeon() {
  if (G.currentLocation !== 'town') return;
  if (!G.betweenRuns) {
    addLog(`<span class="info-txt">You are already committed to the current run.</span>`, 'event-neutral');
    renderUI();
    return;
  }

  resetAvailableCursePoolsForRun();
  const dungeonGrid = generateNamedDungeonForRun();
  G.locations.dungeon = {
    grid: dungeonGrid,
    pos: { x: dungeonGrid.start.x, y: dungeonGrid.start.y },
  };
  G.currentLocation = 'dungeon';
  G.phase = 'playing';
  G.betweenRuns = false;
  G.runNumber = (G.runNumber || 1) + 1;
  G.runTurns = 0;
  G.currentRunChronicle = '';
  resetStatusesToPermanentCurses();
  resetTransientRunFlags();
  addLog(`<span class="info-txt">Run ${G.runNumber} begins. The dungeon has shifted into a new shape.</span>`, 'event-neutral');
  renderUI();
}

function getEquippedItemCount() {
  return getEquippedItems().length;
}

async function toggleEquipItem(index) {
  const item = G.player.inventory[index];
  if (!item || item.type !== 'buff') return;

  if (!item.equipped && getEquippedItemCount() >= MAX_EQUIPPED_ITEMS) {
    addLog(`<span class="info-txt">You can only equip ${MAX_EQUIPPED_ITEMS} items at a time.</span>`, 'event-neutral');
    renderUI();
    return;
  }

  item.equipped = !item.equipped;
  addLog(`You ${item.equipped ? 'equip' : 'unequip'} <em>${item.name}</em> (${itemDescription(item)}).`, 'event-neutral');
  await refreshPhysicalDescription(`${item.equipped ? 'Equipped' : 'Unequipped'} ${item.name}.`);
  const isGameOver = await checkGameOver();
  if (!isGameOver) renderUI();
}

async function useCurseClearItem(index) {
  const item = G.player.inventory[index];
  if (!item || item.type !== 'curseClear') return;

  const curses = G.player.statuses;
  const removable = curses
    .map((curse, index) => ({ curse, index }))
    .filter(({ curse }) => !curse.permanent);
  if (!removable.length) {
    addLog(`<span class="info-txt">You have no temporary curses for <em>${item.name}</em> to remove. Permanent curses cannot be cleared.</span>`, 'event-neutral');
    renderUI();
    return;
  }

  const options = removable.map(({ curse }, idx) => ({
    value: String(idx),
    title: curse.name,
    subtitle: `${attrLabel(curse.attribute)} ${curse.magnitude}`,
  }));
  const picked = await gcModalSelect({
    title: 'Remove a Curse',
    message: `Choose a curse to remove with ${item.name}:`,
    options,
    multiple: false,
    confirmText: 'Remove',
  });
  if (picked == null) return;
  const choiceIndex = Number(picked);
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= removable.length) {
    addLog(`<span class="info-txt">No curse was removed.</span>`, 'event-neutral');
    renderUI();
    return;
  }

  const removed = curses.splice(removable[choiceIndex].index, 1)[0];
  returnCurseToPool(removed);
  G.player.inventory.splice(index, 1);
  addLog(`<span class="good-txt">You use <em>${item.name}</em> and remove <em>${removed.name}</em>.</span>`, 'event-neutral');
  await refreshPhysicalDescription(`Removed curse ${removed.name} with ${item.name}.`);
  renderUI();
}

function applyLevelUp(attr) {
  if (G.player.base[attr] >= MAX_ATTR) return;
  G.player.base[attr] = Math.min(MAX_ATTR, G.player.base[attr] + 1);
  addLog(`<span class="good-txt">You improve your <em>${attrLabel(attr)}</em> — base now ${G.player.base[attr]}.</span>`, 'event-level');
  G.phase = 'playing';
  renderUI();
}

function paginateChronicleText(text, maxChars = 230) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const pages = [];
  let page = '';
  for (const word of words) {
    const next = page ? `${page} ${word}` : word;
    if (next.length > maxChars && page) {
      pages.push(page);
      page = word;
    } else {
      page = next;
    }
  }
  if (page) pages.push(page);
  return pages.length ? pages : [''];
}

function setChroniclePlainText(el, text) {
  el._chronicleFullText = String(text || '');
  el._chroniclePages = paginateChronicleText(text);
  el._chroniclePage = Math.min(el._chroniclePage || 0, el._chroniclePages.length - 1);
  if (CHRONICLE_SHOW_ALL) {
    el.textContent = el._chronicleFullText;
  } else if (el.classList.contains('active')) {
    el.textContent = el._chroniclePages[el._chroniclePage];
  }
}
function toggleSidebar() {
  document.getElementById('sidebar')
    .classList.toggle('collapsed');
}
function addLog(html, cls = 'event-neutral', options = {}) {
  const div = document.getElementById('log');
  const el = document.createElement('div');
  el.className = `log-entry ${cls}`;
  if (options.plainText) setChroniclePlainText(el, html);
  else el.innerHTML = html;
  div.appendChild(el);
  const entries = getChronicleEntries();
  if (options.focus !== false) CHRONICLE_INDEX = entries.length - 1;
  updateChronicleVisibility();
  return el;
}

function getChronicleEntries() {
  const div = document.getElementById('log');
  return div ? Array.from(div.querySelectorAll('.log-entry')) : [];
}

function updateChronicleVisibility() {
  const entries = getChronicleEntries();
  if (!entries.length) return;
  CHRONICLE_INDEX = Math.max(0, Math.min(CHRONICLE_INDEX, entries.length - 1));
  entries.forEach((entry, index) => {
    const active = index === CHRONICLE_INDEX;
    entry.classList.toggle('active', active);
    if (entry._chroniclePages) {
      if (CHRONICLE_SHOW_ALL) {
        entry.textContent = entry._chronicleFullText || entry._chroniclePages.join(' ');
      } else if (active) {
        entry.textContent = entry._chroniclePages[entry._chroniclePage || 0];
      }
    }
  });
  const hint = document.getElementById('chronicle-hint');
  if (hint) {
    const current = entries[CHRONICLE_INDEX];
    const pageText = current && current._chroniclePages && current._chroniclePages.length > 1
      ? ` page ${(current._chroniclePage || 0) + 1}/${current._chroniclePages.length}`
      : '';
    if (CHRONICLE_SHOW_ALL) {
      hint.textContent = `Showing all chronicle entries (${entries.length})`;
    } else if (CHRONICLE_INDEX < entries.length - 1 || pageText) {
      hint.textContent = `Tap chronicle or press Space: next${pageText} (${CHRONICLE_INDEX + 1}/${entries.length})`;
    } else {
      hint.textContent = `Tap chronicle or press Space: current (${CHRONICLE_INDEX + 1}/${entries.length})`;
    }
  }
  const button = document.getElementById('btn-chronicle-history');
  if (button) {
    button.textContent = CHRONICLE_SHOW_ALL ? 'Show Current Entry' : 'Show All History';
    button.setAttribute('aria-pressed', CHRONICLE_SHOW_ALL ? 'true' : 'false');
  }
}

function advanceChronicle() {
  const entries = getChronicleEntries();
  if (!entries.length) return false;
  const current = entries[CHRONICLE_INDEX];
  if (current && current._chroniclePages && (current._chroniclePage || 0) < current._chroniclePages.length - 1) {
    current._chroniclePage = (current._chroniclePage || 0) + 1;
    updateChronicleVisibility();
    return true;
  }
  if (CHRONICLE_INDEX < entries.length - 1) {
    CHRONICLE_INDEX++;
    updateChronicleVisibility();
    return true;
  }
  updateChronicleVisibility();
  return false;
}

function advanceChronicleForAction() {
  advanceChronicle();
}

function focusChronicleEntry(el) {
  const entries = getChronicleEntries();
  const index = entries.indexOf(el);
  if (index >= 0) {
    CHRONICLE_INDEX = index;
    updateChronicleVisibility();
  }
}

function toggleChronicleHistory() {
  CHRONICLE_SHOW_ALL = !CHRONICLE_SHOW_ALL;
  const panel = document.getElementById('log-panel');
  if (panel) panel.classList.toggle('show-all', CHRONICLE_SHOW_ALL);
  updateChronicleVisibility();
  if (CHRONICLE_SHOW_ALL) {
    const log = document.getElementById('log');
    if (log) {
      requestAnimationFrame(() => {
        log.scrollTop = log.scrollHeight;
      });
    }
  }
}

async function streamNarrationLog(prompt, placeholderHtml = '<span class="info-txt">The narrator is thinking...</span>', cls = 'event-neutral', options = {}) {
  const chronicleContext = [G.storySummary, G.currentRunChronicle, G.betweenRunChronicle]
    .filter(Boolean)
    .join('\n\n')
    .slice(-30000);
  const shouldFocus = options.focus !== false;
  const el = addLog(placeholderHtml, cls, { focus: shouldFocus });
  if (shouldFocus) focusChronicleEntry(el);
  let text = '';
  const promptWithContext = `The story so far: ${chronicleContext}. Current event: ${prompt}`;
  if (isNarrationPromptDebugEnabled()) {
    const fullPrompt = buildNarratorFullPrompt(AI_CONTEXT, promptWithContext);
    logNarrationPromptDebug(cls, fullPrompt, chronicleContext || '(empty)');
  }
  const narration = await generateNarration(AI_CONTEXT, promptWithContext, {
    onChunk: (chunk, fullText) => {
      text = fullText || (text + chunk);
      setChroniclePlainText(el, text);
      if (shouldFocus) focusChronicleEntry(el);
    },
  });
  if (!narration) {
    if (el.parentNode) el.parentNode.removeChild(el);
    updateChronicleVisibility();
    return null;
  }
  
  setChroniclePlainText(el, narration);
  if (shouldFocus) focusChronicleEntry(el);
  if (narration) {
    const trimmed = narration.trim();
    if (G.betweenRuns) {
      G.betweenRunChronicle = G.betweenRunChronicle
        ? `${G.betweenRunChronicle}\n\n${trimmed}`
        : trimmed;
    } else {
      G.currentRunChronicle = G.currentRunChronicle
        ? `${G.currentRunChronicle}\n\n${trimmed}`
        : trimmed;
    }
    G.llmChronicle = [G.storySummary, G.betweenRunChronicle, G.currentRunChronicle].filter(Boolean).join('\n\n');
  }
  return narration;
}

function renderStatusPanel() {
  const p = G.player;
  const eff = getEff();

  const curseHtml = p.statuses.length
    ? p.statuses.map(s => `<span class="status-tag">${s.name}: ${attrLabel(s.attribute)} ${s.magnitude}${s.permanent ? ' · Permanent' : ''}</span>`).join('')
    : '<span class="empty-note">None</span>';

  const runHtml = G.betweenRuns
    ? `Between runs · Next run: ${(G.runNumber || 1) + 1}`
    : `Run ${G.runNumber || 1}`;

  const equippedItems = p.inventory.filter(item => item.type === 'buff' && item.equipped);
  const activeHtml = equippedItems.length
    ? equippedItems.map(e =>
      `<span class="status-tag" style="border-color:rgba(90,170,208,0.5);background:rgba(58,96,128,0.15);color:#7ecfee;">
          ${e.name}: ${itemDescription(e)}
        </span>`).join('')
    : '<span class="empty-note">None</span>';

  const invHtml = p.inventory.length
    ? p.inventory.map((item, i) => `
        <div class="item-row">
          <span class="item-name">${item.name}</span>
          <span class="item-effect">${itemDescription(item)}</span>
          ${item.type === 'buff'
            ? `<button class="btn-use" onclick="advanceChronicleForAction(); toggleEquipItem(${i})">${item.equipped ? 'Unequip' : 'Equip'}</button>`
            : `<button class="btn-use" onclick="advanceChronicleForAction(); useCurseClearItem(${i})">Use</button>`}
        </div>`).join('')
    : '<span class="empty-note">Empty</span>';
    
  const attrValue = (baseVal, effVal) => {
    const diff = effVal - baseVal;
    return diff === 0 ? `${effVal}`
      : diff > 0 ? ` <span class="good-txt">${effVal}</span>`
        : ` <span class="danger-txt">${effVal}</span>`;
  };

  const heartsHtml = Array.from({ length: PLAYER_MAX_HP }, (_, index) => {
    const emptyClass = index < p.hp ? '' : ' empty';
    return `<img class="heart-icon${emptyClass}" src="assets/Health.png" alt="${index < p.hp ? 'HP' : 'Missing HP'}">`;
  }).join('');

  document.getElementById('status-content').innerHTML = `
    <div class="runtime-api-note" style="margin-bottom:8px;">${runHtml}</div>
    <div class="vitals-row">
      <div class="heart-row" aria-label="HP ${p.hp} of ${PLAYER_MAX_HP}">${heartsHtml}</div>
      <div class="coins-display" aria-label="Coins ${p.money}">
        <img class="coins-icon" src="assets/coins.png" alt="Coins">
        <span>${p.money}</span>
      </div>
    </div>

    <div class="attribute-strip">
      <div class="attribute-pill" title="Power">
        <img class="attribute-icon" src="assets/power.png" alt="Power">
        <span class="attribute-value">${attrValue(p.base.power, eff.power)}</span>
      </div>
      <div class="attribute-pill" title="Agility">
        <img class="attribute-icon" src="assets/agility.png" alt="Agility">
        <span class="attribute-value">${attrValue(p.base.perception, eff.perception)}</span>
      </div>
      <div class="attribute-pill" title="Persuasion">
        <img class="attribute-icon" src="assets/persuasion.png" alt="Persuasion">
        <span class="attribute-value">${attrValue(p.base.persuasion, eff.persuasion)}</span>
      </div>
    </div>
<div class= "status-details">
    <div class="panel-title section-gap" style="font-size:0.85rem;">Equipped Items (${equippedItems.length} / ${MAX_EQUIPPED_ITEMS})</div>
    <div style="padding:4px 0;">${activeHtml}</div>

    <div class="panel-title section-gap" style="font-size:0.85rem;">Curses</div>
    <div style="padding:4px 0;">${curseHtml}</div>

    <div class="panel-title section-gap" style="font-size:0.85rem;">Inventory</div>
    <div>${invHtml}</div>
    </div>
  `;
}

function renderInputPanel() {
  const title = document.getElementById('input-title');
  const buttons = document.getElementById('input-buttons');
  const movementPad = document.getElementById('movement-pad');
  const movementDisabled = G.phase !== 'playing';
  movementPad.innerHTML = `
    <button class="btn btn-dir btn-dir-north" onclick="advanceChronicleForAction(); movePlayer('North')" aria-label="Move north" ${movementDisabled ? 'disabled' : ''}>▲</button>
    <button class="btn btn-dir btn-dir-west" onclick="advanceChronicleForAction(); movePlayer('West')" aria-label="Move west" ${movementDisabled ? 'disabled' : ''}>◀</button>
    <button class="btn btn-dir btn-dir-east" onclick="advanceChronicleForAction(); movePlayer('East')" aria-label="Move east" ${movementDisabled ? 'disabled' : ''}>▶</button>
    <button class="btn btn-dir btn-dir-south" onclick="advanceChronicleForAction(); movePlayer('South')" aria-label="Move south" ${movementDisabled ? 'disabled' : ''}>▼</button>
  `;


  
  const setTitle = (text) => {
    if (title) title.textContent = text;
  };

  if (G.phase === 'loading') {
    setTitle('Please wait...');
    buttons.innerHTML = '';
    return;
  }

  if (G.phase === 'playing') {
    setTitle(G.betweenRuns ? 'Town respite' : `Run ${G.runNumber || 1}`);
    const cell = getCurrentCell();
    const actionButtons = [];
    if (G.currentLocation === 'town' && cell && cell.type === 'town-gate' && G.betweenRuns) {
      actionButtons.push(`<button class="btn btn-continue" onclick="advanceChronicleForAction(); enterDungeon()">Begin Run ${(G.runNumber || 1) + 1}</button>`);
    }
    if (G.currentLocation === 'town' && cell && cell.type === 'town-npc') {
      const cost = Math.max(0, Math.floor(Number(cell.data.serviceCost) || 0));
      const label = cost > 0 ? `Talk (${cost} coins)` : 'Talk';
      actionButtons.push(`<button class="btn btn-continue" onclick="advanceChronicleForAction(); startTownNpc(getCurrentCell().data)">${label}</button>`);
    }
    buttons.innerHTML = `<div class="runtime-api-note">Tap the chronicle to advance dialogue. Keyboard controls still work.</div>`;
    if (actionButtons.length) buttons.innerHTML += actionButtons.join('');
    return;
  }

  if (G.phase === 'encounter-pause') {
    setTitle('An encounter awaits…');
    let resolveText = 'Resolve';
    let fleeText = 'Flee';
    let resolveIcon = '⚔';
    let fleeIcon = '🏃';

    if (G.encounterType === 'enemy' || G.encounterType === 'boss') {
      resolveText = 'Engage';
      fleeText = 'Flee';
    } else if (G.encounterType === 'treasure') {
      resolveText = 'Check';
      fleeText = 'Avoid';
      resolveIcon = '🔍';
    } else if (G.encounterType === 'npc') {
      resolveText = 'Persuade';
      fleeText = 'Flee';
      resolveIcon = '🗣';
    }

    buttons.innerHTML = `<button class="btn btn-continue" onclick="advanceChronicleForAction(); continueEncounter()">${resolveIcon} &nbsp;${resolveText}</button>`;
    if (G.canFlee) {
      buttons.innerHTML += `<button class="btn btn-flee" onclick="advanceChronicleForAction(); fleeEncounter()">${fleeIcon} &nbsp;${fleeText}</button>`;
    } else {
      let reason = G.fleeCooldown ? "You must resolve an encounter before fleeing again." : "You cannot flee from this encounter again.";
      buttons.innerHTML += `<button class="btn btn-flee" disabled style="opacity: 0.5; cursor: not-allowed;" title="${reason}">${fleeIcon} &nbsp;${fleeText}</button>`;
    }
    return;
  }

  if (G.phase === 'levelup') {
    setTitle('⬆ Level Up — Choose an Attribute to Improve');
    buttons.innerHTML = ['power', 'perception', 'persuasion'].map(attr => {
      const cur = G.player.base[attr];
      const next = Math.min(MAX_ATTR, cur + 1);
      const cap = cur >= MAX_ATTR;
      return `<button class="btn btn-attr" onclick="advanceChronicleForAction(); applyLevelUp('${attr}')" ${cap ? 'disabled' : ''}>
        + ${attrLabel(attr)} &nbsp;(${cur} → ${next})
      </button>`;
    }).join('');
    return;
  }

  if (G.phase === 'gameover-win') {
    setTitle('✦ Victory');
    buttons.innerHTML = `<button class="btn btn-restart" onclick="location.reload()">Play Again</button>`;
    return;
  }

  if (G.phase === 'gameover-loss') {
    setTitle('✦ Defeated');
    buttons.innerHTML = `<button class="btn btn-restart" onclick="location.reload()">Restart Adventure</button>`;
    return;
  }
}


function renderMinimap() {
  const grid = document.getElementById('minimap-grid');
  const location = G.currentLocation;
  const locationState = getLocationState();

  const MINIMAP_VIEW_RADIUS = 2;
  const VIEW_SIZE = MINIMAP_VIEW_RADIUS * 2 + 1;

  const W = location === 'town'? TOWN_WIDTH : GRID_WIDTH;
  const H = location === 'town'? TOWN_HEIGHT : GRID_HEIGHT;
  const px = locationState.pos.x;
  const py = locationState.pos.y;

  // CHANGED: grid is now fixed to VIEW_SIZE instead of full W/H
  grid.style.gridTemplateColumns = `repeat(${VIEW_SIZE}, var(--map-cell-size))`;
  grid.style.gridTemplateRows = `repeat(${VIEW_SIZE}, var(--map-cell-size))`;

  let html = '';

  // CHANGED: loop only around player, not full grid
  for (let dy = -MINIMAP_VIEW_RADIUS; dy <= MINIMAP_VIEW_RADIUS; dy++) {
    for (let dx = -MINIMAP_VIEW_RADIUS; dx <= MINIMAP_VIEW_RADIUS; dx++) {
      const x = px + dx;
      const y = py + dy;

      let cls = 'minimap-cell', content = '';

      // CHANGED: handle out-of-bounds as walls
      if (x < 0 || y < 0 || x >= W || y >= H) {
        cls += ' wall';
      } else {
        const cell = locationState.grid.cells[y][x];
        const isPlayer = dx === 0 && dy === 0; // center is always player
        const visible = location === 'town' || cell.visited || cell.type === 'start';

        if (visible) {
          cls += ' visited';
          if (cell.type === 'wall') { cls += ' wall'; content = ''; }
          if (cell.type === 'boss') { cls += ' exit'; content = '☠'; }
          if (cell.type === 'start') { cls += ' exit'; content = 'E'; }
          if (cell.type === 'town-gate') { cls += ' exit'; content = 'E'; }
          if (cell.type === 'town-npc') { content = cell.data.mapIcon || 'N'; }
        }

        if (isPlayer) { cls += ' player'; content = '◉'; }
      }

      html += `<div class="${cls}">${content}</div>`;
    }
  }
  grid.innerHTML = html;
}

function renderUI() {
  renderStatusPanel();
  renderCharacterDescription();
  renderInputPanel();
  renderMinimap();
}

async function generateTheme() {
  const { apiKey } = getApiFromDom();
  let inputs = getNamingPromptInputs();
  const statusDiv = document.getElementById('ai-status');
  const startedAt = typeof nowMs === 'function' ? nowMs() : Date.now();

  if (!apiKey || (!inputs.setting && !inputs.themeDetails)) {
    statusDiv.innerHTML = '<span class="danger-txt">API Key and either Setting or Theme Details are required.</span>';
    return;
  }

  statusDiv.innerHTML = 'Preparing setup and generating naming pools… please wait.';
  document.getElementById('btn-generate').disabled = true;
  if (typeof resetApiTimingLog === 'function') resetApiTimingLog('generateTheme');

  try {
    inputs = await fillMissingNamingInputs(inputs);
    AI_CONTEXT.theme = buildThemeSummary(inputs);
    AI_CONTEXT.characterDesc = inputs.charDesc;
    AI_CONTEXT.townNpcDetails = inputs.townNpcDetails;

    const request = buildCachedNamingRequest(inputs);
    const [enemyNamesRaw, npcNamesRaw, curseNamesRaw, itemNamesRaw, bossNameRaw] = await Promise.all([
      fetchGridNamingPromptJson(request.prompts.enemies, 'enemyNames'),
      fetchGridNamingPromptJson(request.prompts.npcs, 'npcNames'),
      fetchGridNamingPromptJson(request.prompts.curses, 'curseNames'),
      fetchGridNamingPromptJson(request.prompts.items, 'itemNames'),
      fetchGridNamingPromptJson(request.prompts.boss, 'bossName'),
    ]);
    const enemyNames = JSON.parse(enemyNamesRaw);
    const npcNames = JSON.parse(npcNamesRaw);
    const curseNames = JSON.parse(curseNamesRaw);
    const itemNames = JSON.parse(itemNamesRaw);
    const bossNameJson = JSON.parse(bossNameRaw);
    const namePools = normalizeGeneratedNamePools({
      ...enemyNames,
      ...npcNames,
      ...curseNames,
      ...itemNames,
    });

    if (bossNameJson && bossNameJson.boss) namePools.boss = bossNameJson.boss;
    applyNamePoolsToGrid(request.grid, namePools);
    applyBossNameToGrid(request.grid, bossNameJson && bossNameJson.boss && bossNameJson.boss.name);
    setRuntimeCursePools(namePools.curses);
    setActiveNamePools(namePools);
    fillDefaultNames(request.grid);
    PENDING_NAMED_GRID = request.grid;
    NAMING_PROMPT_CACHE = null;

    const debugDiv = document.getElementById('debug-names');
    debugDiv.value = JSON.stringify({ version: 3, namePools }, null, 2);
    document.getElementById('btn-debug').style.display = 'block';
    if (typeof recordApiTiming === 'function') {
      recordApiTiming({
        label: 'generateThemeTotal',
        durationMs: (typeof nowMs === 'function' ? nowMs() : Date.now()) - startedAt,
        kind: 'total',
        ok: true,
      });
    }
    refreshTimingDebug();

    statusDiv.innerHTML = '<span class="good-txt">Dungeon mapped and naming pools generated. Edit JSON if you wish, then proceed.</span>';
    document.getElementById('btn-generate').disabled = false;
    document.getElementById('btn-proceed').textContent = 'Proceed';
  } catch (err) {
    PENDING_NAMED_GRID = null;
    if (typeof recordApiTiming === 'function') {
      recordApiTiming({
        label: 'generateThemeTotal',
        durationMs: (typeof nowMs === 'function' ? nowMs() : Date.now()) - startedAt,
        kind: 'total',
        ok: false,
        extra: err.message || 'generation failed',
      });
    }
    refreshTimingDebug();
    statusDiv.innerHTML = `<span class="danger-txt">Failed to generate: ${err.message}</span>`;
    document.getElementById('btn-generate').disabled = false;
  }
}

function skipTheme() {
  if (typeof persistApiLastSession === 'function') persistApiLastSession();
  if (typeof persistThemeLastSession === 'function') persistThemeLastSession();
  const inputs = getNamingPromptInputs();
  AI_CONTEXT.theme = buildThemeSummary(inputs);
  AI_CONTEXT.characterDesc = inputs.charDesc;
  AI_CONTEXT.townNpcDetails = inputs.townNpcDetails;

  const debugDiv = document.getElementById('debug-names');
  const raw = debugDiv.value.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.version === 3 && parsed.namePools) {
        if (!PENDING_NAMED_GRID) {
          alert('No generated map is loaded. Click "Generate map & names" first, or remove "version": 3 from the JSON to use manual pool overrides.');
          return;
        }
        applyNamePoolsToGrid(PENDING_NAMED_GRID, parsed.namePools);
        setRuntimeCursePools(normalizeGeneratedNamePools(parsed.namePools).curses);
        setActiveNamePools(parsed.namePools);
        fillDefaultNames(PENDING_NAMED_GRID);
      } else {
        PENDING_NAMED_GRID = null;
        setActiveNamePools(null);
        if (parsed.enemies) ENEMY_NAMES = parsed.enemies;
        if (parsed.npcs) NPC_NAMES = parsed.npcs;
        if (parsed.items) {
          const items = normalizeGeneratedNamePools({ items: parsed.items }).items;
          ITEM_NAMES = {
            power: { ...ITEM_NAMES.power, ...items.power },
            perception: { ...ITEM_NAMES.perception, ...items.perception },
            persuasion: { ...ITEM_NAMES.persuasion, ...items.persuasion },
          };
          if (items.curseClear.length) CURSE_CLEAR_ITEM_NAMES = items.curseClear;
        }
        const curseNames = parsed.curses || parsed.statuses;
        if (curseNames) {
          NEGATIVE_STATUS_POOL = [];
          const normalizedCurses = normalizeGeneratedNamePools({ curses: curseNames }).curses;
          for (const attr of ['power', 'perception', 'persuasion']) {
            for (const mag of ['-1', '-2']) {
              if (normalizedCurses[attr] && normalizedCurses[attr][mag]) {
                for (const name of normalizedCurses[attr][mag]) {
                  NEGATIVE_STATUS_POOL.push({ name, attribute: attr, magnitude: parseInt(mag) });
                }
              }
            }
          }
          setRuntimeCursePools(normalizedCurses);
        }
      }
    } catch (err) {
      alert("Invalid JSON in the generated names window. Please fix it before proceeding.");
      return;
    }
  }

  document.getElementById('ai-setup-screen').style.display = 'none';
  document.getElementById('setup-screen').style.display = 'block';
}

function startGame(className) {
  initState(className);
  CHRONICLE_INDEX = 0;
  CHRONICLE_SHOW_ALL = false;
  toggleStatusPanel(false);
  const logPanel = document.getElementById('log-panel');
  if (logPanel) logPanel.classList.remove('show-all');
  document.body.classList.add('game-active');
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('game-container').style.display = '';
  addLog(`You are standing at the entrance of a ${GRID_WIDTH}×${GRID_HEIGHT} dungeon. A boss awaits in the depths. Survive and defeat it.`, 'event-neutral');
  renderUI();
}

const chroniclePanel = document.getElementById('log-panel');
if (chroniclePanel) {
  chroniclePanel.addEventListener('click', (event) => {
    if (event.target && event.target.closest && event.target.closest('button')) return;
    advanceChronicle();
  });
  chroniclePanel.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    advanceChronicle();
  });
}

document.addEventListener('keydown', (e) => {
  if (!G) return;
  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    advanceChronicle();
    return;
  }
  if (G.phase !== 'playing') return;
  const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  const wsad =
    e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W'
      ? 'North'
      : e.key === 'ArrowDown' || e.key === 's' || e.key === 'S'
        ? 'South'
        : e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D'
          ? 'East'
          : e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A'
            ? 'West'
            : null;
  if (!wsad) return;
  if (arrows.includes(e.key)) e.preventDefault();
  movePlayer(wsad);
  if (e.key === 'Escape') {
  toggleStatusPanel(false);
}
});
