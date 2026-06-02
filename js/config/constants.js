// Grid / progression tuning
const GRID_WIDTH = 13;
const GRID_HEIGHT = 13;
const TOWN_WIDTH = 5;
const TOWN_HEIGHT = 5;
const WALL_RATIO = 0.4;
const EMPTY_CELL_CHANCE = 0.5;
const MAX_ATTR = 20;
const MAX_LEVEL = 100;
const PLAYER_MAX_HP = 3;
const PLAYER_STARTING_MONEY = 0;
const ENEMY_WIN_MONEY = { min: 8, max: 14 };
const ENEMY_LOSS_MONEY = { min: 2, max: 5 };
const LARGE_MONEY_REWARD = { min: 18, max: 35 };
const MONEY_REWARD_CHANCE = 0.35;
const ITEM_UPGRADE_COST = 20;
const MERCHANT_LEVEL_1_ITEM_PRICE = 10;
const MAX_EQUIPPED_ITEMS = 3;
const CURSE_CLEAR_ITEM_CHANCE = 0.25;
const GRID_GEN_MAX_ATTEMPTS = 200;

// Debug toggles
// If both DEBUG_WIN_ALL_ENCOUNTERS and DEBUG_LOSE_ALL_ENCOUNTERS are true,
// lose-all takes precedence.
const DEBUG_INFINITE_HEALTH = false;
const DEBUG_WIN_ALL_ENCOUNTERS = false;
const DEBUG_LOSE_ALL_ENCOUNTERS = true;
const NONARRATION = false;

const ENCOUNTER_TYPES = ['enemy', 'treasure', 'npc', 'item'];
// Relative weights used when a dungeon cell becomes an encounter instead of empty space.
// Treasure cells are the game's trap / risky loot encounters.
const ENCOUNTER_TYPE_WEIGHTS = {
  enemy: 0.42,
  npc: 0.20,
  treasure: 0.20,
  item: 0.18,
};

// Image prompt formatting
// - 'structured': natural-language structured prompt block
// - 'danbooru': comma-separated danbooru-style tags (SDXL-friendly)
const IMAGE_PROMPT_FORMAT = 'structured';
// Context slice fed into prompt generation (characters from chronicle + summary).
const IMAGE_PROMPT_CONTEXT_CHARS = 3000;
// Keep generated prompts short enough for most image models.
const IMAGE_PROMPT_MAX_TOKENS = 350;

// Persistent debuffs applied to the player (shown in-game as “curses”).
let NEGATIVE_STATUS_POOL = [
  { name: 'Weakened', attribute: 'power', magnitude: -1 },
  { name: 'Fatigued', attribute: 'power', magnitude: -1 },
  { name: 'Exhausted', attribute: 'power', magnitude: -2 },
  { name: 'Broken', attribute: 'power', magnitude: -2 },
  { name: 'Dazed', attribute: 'perception', magnitude: -1 },
  { name: 'Distracted', attribute: 'perception', magnitude: -1 },
  { name: 'Blinded', attribute: 'perception', magnitude: -2 },
  { name: 'Deafened', attribute: 'perception', magnitude: -2 },
  { name: 'Confused', attribute: 'persuasion', magnitude: -1 },
  { name: 'Flustered', attribute: 'persuasion', magnitude: -1 },
  { name: 'Terrified', attribute: 'persuasion', magnitude: -2 },
  { name: 'Muted', attribute: 'persuasion', magnitude: -2 },
];

let ITEM_NAMES = {
  power: {
    'Weak': ['Iron Tonic', 'War Salve'],
    'Strong': ['Berserker Draught', 'Strengthening Elixir'],
    'Clear': ['Purifying Brew', 'Mending Salve']
  },
  perception: {
    'Weak': ['Eagle Eye Drops', 'Clarity Vial'],
    'Strong': ["Seer's Brew", 'Lens of Truth'],
    'Clear': ['Eye Wash', 'Focus Potion']
  },
  persuasion: {
    'Weak': ['Silver Tongue Oil', 'Charm Potion'],
    'Strong': ["Diplomat's Tea", 'Signet of Trust'],
    'Clear': ['Calming Incense', 'Soothing Tea']
  }
};

let CURSE_CLEAR_ITEM_NAMES = [
  'Purifying Brew',
  'Mending Salve',
  'Absolution Charm',
  'Restoration Talisman',
  'Cleansefire Candle',
];

const CLASSES = {
  Fighter: { power: 7, perception: 4, persuasion: 4 },
  Thinker: { power: 4, perception: 7, persuasion: 4 },
  Talker: { power: 4, perception: 4, persuasion: 7 },
};

let ENEMY_NAMES = {
  'Easy': ['a sickly rat', 'a weak slime', 'a crippled goblin'],
  'Medium': ['a gaunt wraith', 'a grinning goblin', 'a feral hound'],
  'Hard': ['a cave troll', 'a skeletal knight', 'a rogue mercenary'],
  'Very Hard': ['a stone golem', 'a blood cultist', 'a dungeon warden']
};
let NPC_NAMES = {
  'Easy': ['a lost pilgrim', 'a beggar'],
  'Medium': ['a wandering merchant', 'a wounded soldier'],
  'Hard': ['a suspicious hermit', 'an elusive thief'],
  'Very Hard': ['a cryptic oracle', 'a powerful wizard']
};

function getDifficultyCategory(val) {
  if (val <= 5) return 'Easy';
  if (val <= 10) return 'Medium';
  if (val <= 15) return 'Hard';
  return 'Very Hard';
}

function rollDifficultyByDistance(x, y, exitX, exitY) {
  let maxDist = 1;
  for (let cy = 0; cy < GRID_HEIGHT; cy++) {
    for (let cx = 0; cx < GRID_WIDTH; cx++) {
      const d = Math.abs(cx - exitX) + Math.abs(cy - exitY);
      if (d > maxDist) maxDist = d;
    }
  }

  const dist = Math.abs(x - exitX) + Math.abs(y - exitY);
  const ratio = 1 - (dist / maxDist);

  let base;
  if (ratio >= 0.75) {
    base = 16;
  } else if (ratio >= 0.5) {
    base = 11;
  } else if (ratio >= 0.25) {
    base = 6;
  } else {
    base = 1;
  }

  return base + Math.floor(Math.random() * 5);
}

function pickEncounterType() {
  const entries = ENCOUNTER_TYPES
    .map((type) => [type, Number(ENCOUNTER_TYPE_WEIGHTS[type] || 0)])
    .filter(([, weight]) => weight > 0);

  if (!entries.length) return pick(ENCOUNTER_TYPES);

  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [type, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return type;
  }
  return entries[entries.length - 1][0];
}
