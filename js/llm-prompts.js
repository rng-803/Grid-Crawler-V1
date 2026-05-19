// Strings and templates for LLM requests (no network I/O).

function promptAttrLabel(attr) {
  if (attr === 'perception') return 'agility';
  return attr;
}

function promptAttrDisplay(attr) {
  const label = promptAttrLabel(attr);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function buildNarratorFullPrompt(aiContext, promptText) {
  let themeContext = `The theme is "${aiContext.theme}".`;

  return `You are the narrator of a text-based dungeon crawler game. ${themeContext}
The narration must be restricted to one or two paragraphs, in order to avoid making it too long.
${promptText}`;
}

function buildGameOverPrompt(reasonText, playerContext) {
  return `The player has died in the dungeon.
Reason: ${reasonText}
Player state: ${playerContext}
Describe the defeat and death of the adventurer.`;
}

function buildFleeNarrationPrompt(playerContext) {
  return `The player chose to flee from the encounter.
Player state: ${playerContext}
Describe the player's escape.`;
}

function buildEnemyStartPrompt(data, diffCat, playerContext) {
  return `The player has encountered an enemy: ${data.name} (Difficulty: ${diffCat}).
Player state: ${playerContext}
Describe the start of the encounter, before the player chooses to engage or flee.`;
}

function buildEnemyResolvePrompt(data, won, playerContext) {
  return `The player engaged the enemy: ${data.name}.
Outcome: The player ${won ? 'WON' : 'LOST'}.
Player state: ${playerContext}
Describe the resolution of the encounter. The player is not completely defeated, but has taken damage and is cursed, and will continue the adventure in this state.`;
}

function promptRewardLabel(reward) {
  if (!reward) return 'a reward';
  if (reward.type === 'money') return `${reward.amount} coins`;
  if (reward.type === 'item' && reward.item) return reward.item.name;
  return 'a reward';
}

function buildTreasureStartPrompt(diffCat, playerContext, reward) {
  return `The player has encountered ${promptRewardLabel(reward)}, but it could be a trap. (Difficulty: ${diffCat}).
Player state: ${playerContext}
Describe the start of the encounter, before the player chooses to investigate or flee.`;
}

function buildTreasureResolvePrompt(won, playerContext, reward, data, s) {
  const rewardText = promptRewardLabel(reward);
  return `The player investigated ${rewardText}.
Player state: ${playerContext}
Outcome: The player ${won ? `avoided a trap and claimed ${rewardText}` : `${rewardText} was enchanted with a trap, and cursed the player with ${s.name}`}.
Describe the resolution of the encounter. The player is not completely defeated, but has taken damage and is cursed, and will continue the adventure in this state. Do not describe events not related to the outcome of the encounter, and the curse acquired.`;
}

function buildNpcStartPrompt(data, diffCat, playerContext) {
  return `The player has encountered an NPC: ${data.name} (Persuasion Difficulty: ${diffCat}).
Player state: ${playerContext}
Describe the start of the encounter, before the player chooses to talk or flee. Take into account the NPC's personality and attitude, and the player's persuasion check difficulty.`;
}

function buildNpcResolvePrompt(data, won, playerContext, reward, s) {
  const rewardText = promptRewardLabel(reward);
  return `The player talked to the NPC: ${data.name}.
Player state: ${playerContext}
Outcome: The player ${won ? `WON and received a gift: ${rewardText}` : `LOST and angered the NPC, and is cursed with ${s.name}, The player is not completely defeated, but has taken damage and is cursed, and will continue the adventure in this state.`}.
Describe the resolution of the encounter. Include a short dialogue exchange between player and NPC, always start with the player character addressing the NPC. Do not describe events not related to the outcome of the encounter, and the curse acquired.`;
}

function buildFloorItemPrompt(item, playerContext) {
  return `The player found an item: ${item.name}.
Player state: ${playerContext}
Describe the player picking up the item, in a short paragraph`;
}

function buildTownNpcDetailText(data) {
  return data && data.details ? `Town NPC details: ${data.details}` : 'Town NPC details: unspecified';
}

function buildHealerDialoguePrompt(data, previousHp, maxHp, playerContext) {
  return `The player visited a town healer: ${data.name}.
${buildTownNpcDetailText(data)}
Player state: ${playerContext}
Service: The healer restores HP, not curses.
Service cost paid: ${data.serviceCost || 0} coins
HP before healing: ${previousHp}/${maxHp}
HP after healing: ${maxHp}/${maxHp}
Write a short healer dialogue exchange. The healer should speak in a way that fits the theme, acknowledge the healing, and not invent unrelated events.`;
}

function buildCurseRemoverDialoguePrompt(data, removedCurse, playerContext) {
  const curseText = removedCurse
    ? `${removedCurse.name} (${promptAttrDisplay(removedCurse.attribute)} ${removedCurse.magnitude})`
    : 'none';
  return `The player visited a town curse remover: ${data.name}.
${buildTownNpcDetailText(data)}
Player state: ${playerContext}
Service: The curse remover removes one curse at a time.
Service cost paid: ${data.serviceCost || 0} coins
Curse removed: ${curseText}
Write a short curse-removal dialogue exchange. The NPC should speak in a way that fits the theme, acknowledge the removed curse if any, and not invent unrelated events.`;
}

function buildUpgraderDialoguePrompt(data, item, previousLevel, playerContext) {
  return `The player visited a town item upgrader: ${data.name}.
${buildTownNpcDetailText(data)}
Player state: ${playerContext}
Service: The upgrader improves one status item, not curse-clear items.
Service cost paid: ${data.serviceCost || 0} coins
Item upgraded: ${item.name}
Previous item level: ${previousLevel}
New item level: ${item.level}
New item effect: ${itemDescriptionForPrompt(item)}
Write a short upgrade dialogue exchange. The NPC should speak in a way that fits the theme, acknowledge the upgraded item, and not invent unrelated events.`;
}

function itemDescriptionForPrompt(item) {
  if (!item || item.type === 'curseClear') return 'removes one curse';
  const effects = Array.isArray(item.effects) && item.effects.length
    ? item.effects.map(effect => `+${effect.magnitude} ${promptAttrDisplay(effect.attribute)}`).join(', ')
    : `+${item.magnitude} ${promptAttrDisplay(item.attribute)}`;
  return `Lvl ${item.level || 1}: ${effects}`;
}

function buildPhysicalDescriptionPrompt(data) {
  const equippedItems = data.equippedItems.length
    ? data.equippedItems.map(item => {
      const effects = Array.isArray(item.effects) && item.effects.length
        ? item.effects.map(effect => `+${effect.magnitude} ${promptAttrDisplay(effect.attribute)}`).join(', ')
        : `+${item.magnitude} ${promptAttrDisplay(item.attribute)}`;
      return `${item.name} (Lvl ${item.level || 1}: ${effects})`;
    }).join(', ')
    : 'none';
  const curses = data.curses.length
    ? data.curses.map(curse => `${curse.name} (${promptAttrDisplay(curse.attribute)} ${curse.magnitude})`).join(', ')
    : 'none';

  return `Update the player character's physical description for the game state.
Theme: ${data.theme || 'unspecified'}
Character baseline: ${data.characterDesc || `a ${data.className} adventurer`}
Previous physical description: ${data.currentDescription || 'none yet'}
Latest change: ${data.change}
Equipped items: ${equippedItems}
Curses currently affecting the player: ${curses}

Return only the updated physical description, in one concise paragraph. Describe visible body, clothing, equipment, posture, and obvious curse effects. Include only equipped items, not unequipped inventory. Keep continuity with the previous description where possible.`;
}

function buildNameGeneratorContext(inputs, detailKind) {
  const setting = inputs.setting || 'fantasy';
  let context = `Create names for a ${setting} setting.`;
  if (inputs.themeDetails) context += ` Theme details: ${inputs.themeDetails}.`;
  if (detailKind !== 'item' && inputs.charDesc) context += ` Character context: ${inputs.charDesc}.`;

  if (detailKind === 'enemy' && inputs.enemyDetails) {
    context += ` The enemies found should include ${inputs.enemyDetails}.`;
  }
  if (detailKind === 'curse' && inputs.curseDetails) {
    context += ` The curses should include ${inputs.curseDetails}.`;
    context += ' Curse names should be easy to understand and direct. Avoid vague or overly abstract curse names.';
  }
  return context;
}

function buildEnemyNamesPrompt(inputs, requirements) {
  const needsJson = JSON.stringify(requirements, null, 2);
  return `You are naming enemies for a grid-based dungeon crawler. ${buildNameGeneratorContext(inputs, 'enemy')}

Generate exactly the requested number of enemy names for each difficulty tier. Easy enemies should sound minor or mundane. Very Hard enemies should sound dangerous or elite.

Enemy names must be short noun phrases and should usually include a lowercase article when natural, such as "a rusted sentry" or "an ash hound".

COUNTS NEEDED (JSON):
${needsJson}

Return ONLY valid JSON in this shape:
{
  "enemies": {
    "Easy": ["<name>"],
    "Medium": ["<name>"],
    "Hard": ["<name>"],
    "Very Hard": ["<name>"]
  }
}`;
}

function buildNpcNamesPrompt(inputs, requirements) {
  const needsJson = JSON.stringify(requirements, null, 2);
  return `You are naming NPCs for a grid-based dungeon crawler. ${buildNameGeneratorContext(inputs, 'npc')}

Generate exactly the requested number of NPC names for each difficulty tier. Higher difficulty NPCs should sound more unusual, influential, elusive, or intimidating.

NPC names must be short noun phrases and should usually include a lowercase article when natural, such as "a wounded surveyor" or "an ivory broker".

COUNTS NEEDED (JSON):
${needsJson}

Return ONLY valid JSON in this shape:
{
  "npcs": {
    "Easy": ["<name>"],
    "Medium": ["<name>"],
    "Hard": ["<name>"],
    "Very Hard": ["<name>"]
  }
}`;
}

function buildCurseNamesPrompt(inputs, requirements) {
  const needsJson = JSON.stringify(requirements, null, 2);
  return `You are naming curses for a grid-based dungeon crawler. ${buildNameGeneratorContext(inputs, 'curse')}

Generate a reusable global pool of curse names for the whole run. Follow the requested weighted distribution exactly. Names for magnitude -2 should sound harsher than names for magnitude -1. The attribute affected matters less than clarity and tone, but the result should still feel appropriate for that category.

COUNTS NEEDED (JSON):
${needsJson}

Return ONLY valid JSON in this shape:
{
  "curses": {
    "power": { "-1": ["<name>"], "-2": ["<name>"] },
    "agility": { "-1": ["<name>"], "-2": ["<name>"] },
    "persuasion": { "-1": ["<name>"], "-2": ["<name>"] }
  }
}`;
}

function buildItemNamesPrompt(inputs, requirements) {
  const needsJson = JSON.stringify(requirements, null, 2);
  return `You are naming items for a grid-based dungeon crawler. ${buildNameGeneratorContext(inputs, 'item')}

Generate exactly the requested number of item names for each category. Buff items should sound like physical objects and should match their attribute and strength. Strong items should sound more potent than weak items. Curse-clear items should sound cleansing, restorative, protective, or purifying.

COUNTS NEEDED (JSON):
${needsJson}

Return ONLY valid JSON in this shape:
{
  "items": {
    "power": { "Weak": ["<name>"], "Strong": ["<name>"] },
    "agility": { "Weak": ["<name>"], "Strong": ["<name>"] },
    "persuasion": { "Weak": ["<name>"], "Strong": ["<name>"] },
    "curseClear": ["<name>"]
  }
}`;
}

function buildSetupAutofillPrompt(inputs, missingFields) {
  const existing = {
    setting: inputs.setting || '',
    themeDetails: inputs.themeDetails || '',
    enemyDetails: inputs.enemyDetails || '',
    curseDetails: inputs.curseDetails || '',
    townNpcDetails: inputs.townNpcDetails || '',
    charDesc: inputs.charDesc || '',
  };
  const missingJson = JSON.stringify(missingFields, null, 2);
  const existingJson = JSON.stringify(existing, null, 2);
  return `You are filling missing setup fields for a grid-based dungeon crawler generator.

Use the existing information to infer concise, useful text for only the missing setup fields. Keep each field practical and brief. Do not overwrite fields that already have values.

KNOWN FIELDS (JSON):
${existingJson}

MISSING FIELDS TO FILL (JSON ARRAY):
${missingJson}

Return ONLY valid JSON in this shape:
{
  "setting": "<only if requested>",
  "themeDetails": "<only if requested>",
  "enemyDetails": "<only if requested>",
  "curseDetails": "<only if requested>",
  "townNpcDetails": "<only if requested>"
}`;
}
