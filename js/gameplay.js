const DIRECTIONS = {
  North: { dx: 0, dy: -1 },
  South: { dx: 0, dy: 1 },
  East: { dx: 1, dy: 0 },
  West: { dx: -1, dy: 0 },
};

let G = null;
let PENDING_NAMED_GRID = null;
let NAMING_PROMPT_CACHE = null;
let GENERATED_CURSE_POOLS = null;
let AVAILABLE_CURSE_POOLS = null;
let AI_CONTEXT = {
  theme: '',
  characterDesc: '',
  townNpcDetails: ''
};

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
  let dungeonGrid;
  if (PENDING_NAMED_GRID) {
    dungeonGrid = cloneGridForPlay(PENDING_NAMED_GRID);
    PENDING_NAMED_GRID = null;
  } else {
    dungeonGrid = generateGrid();
    fillDefaultNames(dungeonGrid);
  }
  const townGrid = generateTown();
  G = {
    player: {
      hp: PLAYER_MAX_HP,
      money: PLAYER_STARTING_MONEY,
      level: 1,
      class: className,
      base: { power: base.power, perception: base.perception, persuasion: base.persuasion },
      statuses: [],
      inventory: [],
      physicalDescription: AI_CONTEXT.characterDesc || `A ${className} adventurer.`,
      physicalDescriptionLoading: false,
    },
    currentLocation: 'dungeon',
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
  let ctx = '';
  if (AI_CONTEXT.characterDesc) {
    ctx += `Character: ${AI_CONTEXT.characterDesc}. `;
  }
  ctx += `HP: ${p.hp}/${PLAYER_MAX_HP}. Coins: ${p.money}. `;
  const equippedItems = p.inventory.filter(item => item.type === 'buff' && item.equipped);
  if (equippedItems.length > 0) {
    ctx += `Equipped Items: ${equippedItems.map(e => `${e.name} (${itemDescription(e)})`).join(', ')}. `;
  }
  if (p.statuses.length > 0) {
    ctx += `Curses: ${p.statuses.map(s => s.name).join(', ')}.`;
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
  G.player.hp = Math.max(0, G.player.hp - n);
}

async function checkGameOver() {
  if (G.phase.startsWith('gameover')) return true;

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

    addLog(`<span class="danger-txt">☠ ${reasonText} You have perished in the dungeon.</span>`, 'event-loss');
    const prompt = buildGameOverPrompt(reasonText, getPlayerContext());
    await streamNarrationLog(prompt, '<span class="info-txt">The narrator is thinking...</span>', 'event-loss');

    G.phase = 'gameover-loss';
    renderUI();
    return true;
  }
  return false;
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
  const exitY = H - 1;

  for (let attempt = 0; attempt < GRID_GEN_MAX_ATTEMPTS; attempt++) {
    const startX = Math.floor(Math.random() * W);
    const exitPos = { x: Math.floor(Math.random() * W), y: exitY };
    const wallN = Math.floor((W * H - 2) * WALL_RATIO);
    const cells = Array.from({ length: H }, () =>
      Array.from({ length: W }, () =>
        ({ type: null, data: {}, visited: false, fled: false })));

    const positions = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (!(x === startX && y === startY) && !(x === exitPos.x && y === exitPos.y)) positions.push({ x, y });

    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    for (let i = 0; i < wallN; i++)
      cells[positions[i].y][positions[i].x].type = 'wall';

    cells[exitPos.y][exitPos.x].type = 'exit';
    cells[startY][startX].type = 'start';

    if (!isReachable(cells, startX, startY, exitPos.x, exitPos.y)) continue;

    cells[startY][startX].visited = true;
    cells[startY][startX].encounterState = 'none';
    cells[exitPos.y][exitPos.x].encounterState = 'none';

    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (cells[y][x].type) continue;
      if (Math.random() < EMPTY_CELL_CHANCE) {
        cells[y][x].type = 'empty';
        cells[y][x].encounterState = 'none';
        continue;
      }
      const t = pick(ENCOUNTER_TYPES);
      cells[y][x].type = t;
      const diff = rollDifficultyByDistance(x, y, exitPos.x, exitPos.y);
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

    return { cells, exit: exitPos, start: { x: startX, y: startY } };
  }
  throw new Error(`Map generation failed after ${GRID_GEN_MAX_ATTEMPTS} attempts.`);
}

function cloneGridForPlay(grid) {
  const g = JSON.parse(JSON.stringify(grid));
  for (let y = 0; y < GRID_HEIGHT; y++) for (let x = 0; x < GRID_WIDTH; x++) {
    const c = g.cells[y][x];
    c.visited = c.type === 'start';
    c.encounterState = c.encounterState || (c.type === 'start' || c.type === 'exit' || c.type === 'wall' || c.type === 'empty' ? 'none' : 'active');
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
    healer: placeTownNpc('healer', 'the healer', 'H', HEALER_SERVICE_COST),
    curseRemover: placeTownNpc('curseRemover', 'the curse remover', 'C', CURSE_REMOVER_SERVICE_COST),
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
    }
  }
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
  await streamNarrationLog(prompt);
  addLog(`You flee from the encounter. It remains here should you return.`, 'event-neutral');

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
  const won = eff.power >= data.power;
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

  const prompt = buildEnemyResolvePrompt(data, won, getPlayerContext());
  await streamNarrationLog(prompt, '<span class="info-txt">The narrator is thinking...</span>', 'event-enemy');
  addLog(mechText, 'event-enemy');
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
  const won = eff.perception > data.difficulty;

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
  await streamNarrationLog(prompt, '<span class="info-txt">The narrator is thinking...</span>', 'event-treasure');
  addLog(mechText, 'event-treasure');
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
  const won = eff.persuasion >= data.check;
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
  await streamNarrationLog(prompt, '<span class="info-txt">The narrator is thinking...</span>', 'event-npc');
  addLog(mechText, 'event-npc');
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
  await streamNarrationLog(prompt);
  addLog(defaultText, 'event-neutral');
  markCurrentDungeonEncounter('cleared');

  const isGameOver = await checkGameOver();
  if (!isGameOver) {
    G.phase = 'playing';
    renderUI();
  }
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
  if (data.role === 'curseRemover') {
    await visitCurseRemover(data);
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
  if (!payForTownService(data)) return;
  G.phase = 'loading';
  renderInputPanel();
  const maxHp = PLAYER_MAX_HP;
  const previousHp = G.player.hp;
  G.player.hp = maxHp;

  const fallbackText = previousHp < maxHp
    ? `<span class="good-txt">${data.name} restores your HP to full for ${data.serviceCost} coins.</span>`
    : `<span class="info-txt">${data.name} accepts ${data.serviceCost} coins and says your wounds are already healed.</span>`;

  const prompt = buildHealerDialoguePrompt(data, previousHp, maxHp, getPlayerContext());
  await streamNarrationLog(prompt, '<span class="info-txt">The healer is speaking...</span>', 'event-npc');
  addLog(fallbackText, 'event-neutral');
  if (previousHp < maxHp) await refreshPhysicalDescription(`Town healer restored HP from ${previousHp} to ${maxHp}.`);
  G.phase = 'playing';
  renderUI();
}

async function visitCurseRemover(data) {
  if (!payForTownService(data)) return;
  G.phase = 'loading';
  renderInputPanel();
  const removed = G.player.statuses.length ? G.player.statuses.shift() : null;
  if (removed) returnCurseToPool(removed);

  const fallbackText = removed
    ? `<span class="good-txt">${data.name} removes <em>${removed.name}</em> for ${data.serviceCost} coins.</span>`
    : `<span class="info-txt">${data.name} accepts ${data.serviceCost} coins and finds no curses to remove.</span>`;

  const prompt = buildCurseRemoverDialoguePrompt(data, removed, getPlayerContext());
  await streamNarrationLog(prompt, '<span class="info-txt">The curse remover is speaking...</span>', 'event-npc');
  addLog(fallbackText, 'event-neutral');
  if (removed) await refreshPhysicalDescription(`Town curse remover removed curse: ${removed.name}.`);
  G.phase = 'playing';
  renderUI();
}

function chooseInventoryIndex(items, label, formatter) {
  const choices = items.map(({ item, index }, i) => `${i + 1}. ${item.name} (${formatter(item)})`).join('\n');
  const raw = prompt(`${label}:\n${choices}`, '1');
  if (raw == null) return -1;
  const choiceIndex = Number(raw) - 1;
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= items.length) return -1;
  return items[choiceIndex].index;
}

function chooseInventoryIndexes(items, label, formatter) {
  const choices = items.map(({ item, index }, i) => `${i + 1}. ${item.name} (${formatter(item)})`).join('\n');
  const raw = prompt(`${label}:\n${choices}\n\nEnter one or more numbers separated by commas.`, '1');
  if (raw == null) return [];
  const picked = [];
  const seen = new Set();
  for (const part of String(raw).split(',')) {
    const choiceIndex = Number(part.trim()) - 1;
    if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= items.length || seen.has(choiceIndex)) continue;
    seen.add(choiceIndex);
    picked.push(items[choiceIndex].index);
  }
  return picked;
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

  const itemIndex = chooseInventoryIndex(
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
  await streamNarrationLog(prompt, '<span class="info-txt">The upgrader is speaking...</span>', 'event-npc');
  addLog(fallbackText, 'event-neutral');
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

  const itemIndexes = chooseInventoryIndexes(
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

  const cell = grid.cells[np.y][np.x];

  if (cell.type === 'exit') {
    cell.visited = true;
    G.phase = 'gameover-win';
    addLog(`<span class="good-txt">✦ Daylight floods through a hidden door. You have escaped the dungeon!</span>`, 'event-win');
    addLog(`Survived ${G.turns} moves · reached level ${G.player.level}.`, 'event-win');
    renderUI();
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
  if (G.currentLocation !== 'dungeon') return;
  respawnFailedDungeonEncounters();
  G.currentLocation = 'town';
  G.phase = 'playing';
  G.pendingResolveFn = null;
  G.canFlee = false;
  const town = G.locations.town;
  town.pos = { x: town.grid.start.x, y: town.grid.start.y };
  addLog(`<span class="info-txt">You leave the dungeon entrance and return to town.</span>`, 'event-neutral');
  renderUI();
}

function enterDungeon() {
  if (G.currentLocation !== 'town') return;
  G.currentLocation = 'dungeon';
  G.phase = 'playing';
  G.pendingResolveFn = null;
  G.canFlee = false;
  const dungeon = G.locations.dungeon;
  dungeon.pos = { x: dungeon.grid.start.x, y: dungeon.grid.start.y };
  addLog(`<span class="info-txt">You descend through the dungeon entrance.</span>`, 'event-neutral');
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
  if (!curses.length) {
    addLog(`<span class="info-txt">You have no curses for <em>${item.name}</em> to remove.</span>`, 'event-neutral');
    renderUI();
    return;
  }

  const choices = curses.map((s, i) => `${i + 1}. ${s.name} (${attrLabel(s.attribute)} ${s.magnitude})`).join('\n');
  const raw = prompt(`Choose a curse to remove with ${item.name}:\n${choices}`, '1');
  if (raw == null) return;
  const curseIndex = Number(raw) - 1;
  if (!Number.isInteger(curseIndex) || curseIndex < 0 || curseIndex >= curses.length) {
    addLog(`<span class="info-txt">No curse was removed.</span>`, 'event-neutral');
    renderUI();
    return;
  }

  const removed = curses.splice(curseIndex, 1)[0];
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

function addLog(html, cls = 'event-neutral') {
  const div = document.getElementById('log');
  const el = document.createElement('div');
  el.className = `log-entry ${cls}`;
  el.innerHTML = html;
  div.appendChild(el);
  document.getElementById('log-panel').scrollTop = 99999;
  return el;
}

async function streamNarrationLog(prompt, placeholderHtml = '<span class="info-txt">The narrator is thinking...</span>', cls = 'event-neutral') {
  const el = addLog(placeholderHtml, cls);
  let text = '';
  const narration = await generateNarration(AI_CONTEXT, prompt, {
    onChunk: (chunk, fullText) => {
      text = fullText || (text + chunk);
      el.textContent = text;
      document.getElementById('log-panel').scrollTop = 99999;
    },
  });
  if (!narration) {
    if (el.parentNode) el.parentNode.removeChild(el);
    return null;
  }
  el.textContent = narration;
  return narration;
}

function renderStatusPanel() {
  const p = G.player;
  const eff = getEff();

  const curseHtml = p.statuses.length
    ? p.statuses.map(s => `<span class="status-tag">${s.name}: ${attrLabel(s.attribute)} ${s.magnitude}</span>`).join('')
    : '<span class="empty-note">None</span>';

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
            ? `<button class="btn-use" onclick="toggleEquipItem(${i})">${item.equipped ? 'Unequip' : 'Equip'}</button>`
            : `<button class="btn-use" onclick="useCurseClearItem(${i})">Use</button>`}
        </div>`).join('')
    : '<span class="empty-note">Empty</span>';

  const attrLine = (label, baseVal, effVal) => {
    const diff = effVal - baseVal;
    const mod = diff === 0 ? ''
      : diff > 0 ? ` <span class="good-txt">(+${diff})</span>`
        : ` <span class="danger-txt">(${diff})</span>`;
    return `<div class="stat-row"><span class="stat-label">${label}</span><span class="stat-val">${effVal}${mod}</span></div>`;
  };

  document.getElementById('status-content').innerHTML = `
    <div class="stat-row"><span class="stat-label">Level</span><span class="stat-val">${p.level}</span>
    <span class="stat-label">HP</span>
      <span class="stat-val ${p.hp <= 2 ? 'danger' : ''}">${p.hp} / ${PLAYER_MAX_HP}</span></div>
    <div class="hp-bar"><div class="hp-fill" style="width:${(p.hp / PLAYER_MAX_HP) * 100}%"></div></div>
    <div class="stat-row"><span class="stat-label">Coins</span><span class="stat-val">${p.money}</span></div>

    <div class="panel-title section-gap" style="font-size:0.85rem;">Attributes</div>
    ${attrLine('Power', p.base.power, eff.power)}
    ${attrLine('Agility', p.base.perception, eff.perception)}
    ${attrLine('Persuasion', p.base.persuasion, eff.persuasion)}

    <div class="panel-title section-gap" style="font-size:0.85rem;">Equipped Items (${equippedItems.length} / ${MAX_EQUIPPED_ITEMS})</div>
    <div style="padding:4px 0;">${activeHtml}</div>

    <div class="panel-title section-gap" style="font-size:0.85rem;">Curses</div>
    <div style="padding:4px 0;">${curseHtml}</div>

    <div class="panel-title section-gap" style="font-size:0.85rem;">Inventory</div>
    <div>${invHtml}</div>
  `;
}

function renderInputPanel() {
  const title = document.getElementById('input-title');
  const buttons = document.getElementById('input-buttons');

  if (G.phase === 'loading') {
    title.textContent = 'Please wait...';
    buttons.innerHTML = '';
    return;
  }

  if (G.phase === 'playing') {
    title.textContent = 'Choose Direction';
    const cell = getCurrentCell();
    const actionButtons = [];
    if (G.currentLocation === 'dungeon' && cell && cell.type === 'start') {
      actionButtons.push(`<button class="btn btn-continue" onclick="enterTown()">Go to Town</button>`);
    }
    if (G.currentLocation === 'town' && cell && cell.type === 'town-gate') {
      actionButtons.push(`<button class="btn btn-continue" onclick="enterDungeon()">Enter Dungeon</button>`);
    }
    if (G.currentLocation === 'town' && cell && cell.type === 'town-npc') {
      const cost = Math.max(0, Math.floor(Number(cell.data.serviceCost) || 0));
      actionButtons.push(`<button class="btn btn-continue" onclick="startTownNpc(getCurrentCell().data)">Talk (${cost} coins)</button>`);
    }
    buttons.innerHTML = Object.keys(DIRECTIONS).map(dir =>
      `<button class="btn btn-dir" onclick="movePlayer('${dir}')">${dir}</button>`).join('');
    if (actionButtons.length) buttons.innerHTML += actionButtons.join('');
    return;
  }

  if (G.phase === 'encounter-pause') {
    title.textContent = 'An encounter awaits…';
    let resolveText = 'Resolve';
    let fleeText = 'Flee';
    let resolveIcon = '⚔';
    let fleeIcon = '🏃';

    if (G.encounterType === 'enemy') {
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

    buttons.innerHTML = `<button class="btn btn-continue" onclick="continueEncounter()">${resolveIcon} &nbsp;${resolveText}</button>`;
    if (G.canFlee) {
      buttons.innerHTML += `<button class="btn btn-flee" onclick="fleeEncounter()">${fleeIcon} &nbsp;${fleeText}</button>`;
    } else {
      let reason = G.fleeCooldown ? "You must resolve an encounter before fleeing again." : "You cannot flee from this encounter again.";
      buttons.innerHTML += `<button class="btn btn-flee" disabled style="opacity: 0.5; cursor: not-allowed;" title="${reason}">${fleeIcon} &nbsp;${fleeText}</button>`;
    }
    return;
  }

  if (G.phase === 'levelup') {
    title.textContent = '⬆ Level Up — Choose an Attribute to Improve';
    buttons.innerHTML = ['power', 'perception', 'persuasion'].map(attr => {
      const cur = G.player.base[attr];
      const next = Math.min(MAX_ATTR, cur + 1);
      const cap = cur >= MAX_ATTR;
      return `<button class="btn btn-attr" onclick="applyLevelUp('${attr}')" ${cap ? 'disabled' : ''}>
        + ${attrLabel(attr)} &nbsp;(${cur} → ${next})
      </button>`;
    }).join('');
    return;
  }

  if (G.phase === 'gameover-win') {
    title.textContent = '✦ Victory';
    buttons.innerHTML = `<button class="btn btn-restart" onclick="location.reload()">Play Again</button>`;
    return;
  }

  if (G.phase === 'gameover-loss') {
    title.textContent = '✦ Defeated';
    buttons.innerHTML = `<button class="btn btn-restart" onclick="location.reload()">Try Again</button>`;
    addLog(`Your adventure ends here — level ${G.player.level}, ${G.turns} moves taken.`, 'event-loss');
    return;
  }
}

function renderMinimap() {
  const grid = document.getElementById('minimap-grid');
  const location = G.currentLocation;
  const locationState = getLocationState();
  const W = location === 'town' ? TOWN_WIDTH : GRID_WIDTH;
  const H = location === 'town' ? TOWN_HEIGHT : GRID_HEIGHT;
  grid.style.gridTemplateColumns = `repeat(${W}, 14px)`;
  grid.style.gridTemplateRows = `repeat(${H}, 14px)`;
  let html = '';
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cell = locationState.grid.cells[y][x];
      const isPlayer = locationState.pos.x === x && locationState.pos.y === y;
      let cls = 'minimap-cell', content = '';
      const visible = location === 'town' || cell.visited || cell.type === 'start';
      if (visible) {
        cls += ' visited';
        if (cell.type === 'wall') { cls += ' wall'; content = ''; }
        if (cell.type === 'exit') { cls += ' exit'; content = '✦'; }
        if (cell.type === 'start') { cls += ' exit'; content = 'E'; }
        if (cell.type === 'town-gate') { cls += ' exit'; content = 'E'; }
        if (cell.type === 'town-npc') { content = cell.data.mapIcon || 'N'; }
      }
      if (isPlayer) { cls += ' player'; content = '◉'; }
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
    const [enemyNamesRaw, npcNamesRaw, curseNamesRaw, itemNamesRaw] = await Promise.all([
      fetchGridNamingPromptJson(request.prompts.enemies, 'enemyNames'),
      fetchGridNamingPromptJson(request.prompts.npcs, 'npcNames'),
      fetchGridNamingPromptJson(request.prompts.curses, 'curseNames'),
      fetchGridNamingPromptJson(request.prompts.items, 'itemNames'),
    ]);
    const enemyNames = JSON.parse(enemyNamesRaw);
    const npcNames = JSON.parse(npcNamesRaw);
    const curseNames = JSON.parse(curseNamesRaw);
    const itemNames = JSON.parse(itemNamesRaw);
    const namePools = normalizeGeneratedNamePools({
      ...enemyNames,
      ...npcNames,
      ...curseNames,
      ...itemNames,
    });

    applyNamePoolsToGrid(request.grid, namePools);
    setRuntimeCursePools(namePools.curses);
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
        fillDefaultNames(PENDING_NAMED_GRID);
      } else {
        PENDING_NAMED_GRID = null;
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
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('game-container').style.display = 'grid';
  addLog(`You are standing at the entrance of a ${GRID_WIDTH}×${GRID_HEIGHT} dungeon. The exit lies somewhere within. Survive.`, 'event-neutral');
  renderUI();
}

document.addEventListener('keydown', (e) => {
  if (!G || G.phase !== 'playing') return;
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
});
