// Strings and templates for LLM requests (no network I/O).

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

function buildTreasureStartPrompt(diffCat, playerContext, item) {
  return `The player has encountered the ${item.name}, but it could be a trap. (Difficulty: ${diffCat}).
Player state: ${playerContext}
Describe the start of the encounter, before the player chooses to investigate or flee.`;
}

function buildTreasureResolvePrompt(won, playerContext, item, data, s) {
  return `The player investigated the ${item.name}.
Player state: ${playerContext}
Outcome: The player ${won ? `avoided a trap and grabbed the ${item.name}` : `the ${item.name} was enchanted with a trap, and cursed the player with ${s.name}`}.
Describe the resolution of the encounter. The player is not completely defeated, but has taken damage and is cursed, and will continue the adventure in this state. Do not describe events not related to the outcome of the encounter, and the curse acquired.`;
}

function buildNpcStartPrompt(data, diffCat, playerContext) {
  return `The player has encountered an NPC: ${data.name} (Persuasion Difficulty: ${diffCat}).
Player state: ${playerContext}
Describe the start of the encounter, before the player chooses to talk or flee. Take into account the NPC's personality and attitude, and the player's persuasion check difficulty.`;
}

function buildNpcResolvePrompt(data, won, playerContext, item, s) {
  return `The player talked to the NPC: ${data.name}.
Player state: ${playerContext}
Outcome: The player ${won ? `WON and received a gift: ${item.name}` : `LOST and angered the NPC, and is cursed with ${s.name}, The player is not completely defeated, but has taken damage and is cursed, and will continue the adventure in this state.`}.
Describe the resolution of the encounter. Include a short dialogue exchange between player and NPC, always start with the player character addressing the NPC. Do not describe events not related to the outcome of the encounter, and the curse acquired.`;
}

function buildFloorItemPrompt(item, playerContext) {
  return `The player found an item: ${item.name}.
Player state: ${playerContext}
Describe the player picking up the item, in a short paragraph`;
}

function buildPhysicalDescriptionPrompt(data) {
  const equippedItems = data.equippedItems.length
    ? data.equippedItems.map(item => `${item.name} (+${item.magnitude} ${item.attribute})`).join(', ')
    : 'none';
  const curses = data.curses.length
    ? data.curses.map(curse => `${curse.name} (${curse.attribute} ${curse.magnitude})`).join(', ')
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

function buildThemeGeneratorContext(theme, curseTypes, charDesc) {
  let promptContext = `The user has chosen the theme: "${theme}".`;
  if (charDesc) promptContext += `\nCharacter Description: "${charDesc}"`;
  if (curseTypes) {
    promptContext += `\nCURSE NAMING GUIDELINES: Curses are: ${curseTypes}. Include all of these themes and types among the curses named, avoid repeating too many similar curses, (example: leather blindfold, soft blindfold, eyes glued shut. these are all too similar). Keep in mind the theme and character description provided. Curse names should be easy to understand, and direct. Avoid vague and complicated concepts, prefer simple things. For example: 'armor removed' would be good, while 'curse of uncertain protection' is bad."`;
  }
  return promptContext;
}

function buildGridNamingPrompt(theme, curseTypes, charDesc, manifest) {
  const promptContext = buildThemeGeneratorContext(theme, curseTypes, charDesc);
  const manifestJson = JSON.stringify(manifest);
  return `You are naming encounters, items, and curses for a grid-based dungeon crawler. ${promptContext}

The dungeon map is already generated. Each slot below describes ONE cell that needs creative names. Names must fit the theme and character above.

Difficulty tiers are hints only: Easy encounters sound mundane or harmless; Very Hard sound intimidating or lethal. Stronger buff rewards should sound more potent than weaker ones. Curse-removal rewards should sound cleansing, restorative, protective, or otherwise suited to removing a curse.

Each slot lists curseOnFailure with exact attribute ("power", "perception", or "persuasion") and magnitude. Choose names for each curse based primarily on the theme chosen by the user, and the aforementioned curse naming guidelines. The attribute affected is os lesser importance when choosing the name of the curse. Your curse name must match that severity in tone (-2 worse than -1, and so forth).

INPUT MANIFEST (JSON):
${manifestJson}

Return ONLY valid JSON:
{
  "slots": [
    {
      "slotIndex": <number matching input>,
      "x": <number>,
      "y": <number>,
      "encounterType": "enemy"|"treasure"|"npc"|"item",

      For encounterType "enemy":
      "enemyName": "<short phrase with article, e.g. a scarred vault-guard>",
      "curseName": "<short curse label tied to this enemy; matches curseOnFailure, follow the CURSE NAMING GUIDELINES>",

      For "treasure":
      "trapName": "<trap label tied to concealment difficulty>",
      "curseName": "<curse tied to this trap; matches curseOnFailure, follow the CURSE NAMING GUIDELINES>",
      "rewardItemName": "<item found on success; if rewardIfSuccess.type is buff, match its attribute/magnitude/theme; if curseClear, make it sound like it removes one curse>",

      For "npc":
      "npcName": "<NPC with article>",
      "curseName": "<curse tied to this NPC/rejection; matches curseOnFailure, follow the CURSE NAMING GUIDELINES>",
      "rewardItemName": "<gift item on success; if rewardIfSuccess.type is buff, match its attribute/magnitude/theme; if curseClear, make it sound like it removes one curse>",

      For "item":
      "itemName": "<Items are physical objects. If pickup.type is buff, tie it to its attribute/magnitude; if curseClear, make it sound like it removes one curse>"
    }
  ]
}

Include exactly one object per manifest slot, same slotIndex/x/y/encounterType as provided. Use lowercase articles where natural.`;
}
