# Game Design Document: Grid Crawler

## Overview

A text-based adventure game played on a procedurally generated grid. The player navigates through rooms, encountering enemies, treasures/traps, and NPCs, with the goal of reaching the exit. The game tracks player attributes, curses, inventory, and HP. No graphical map is shown — all grid logic is internal.

The game will have integration with LLMs and diffusion models via API to perform several functions. The API key will be provided by the user, compatible with services such as OpenRouter and NanoGPT

---

## Player Character

### HP
- Starts at **10**
- Decreases by 1 on: losing a combat, triggering a trap
- Can increase through items or game events
- Reaching **0 HP** = **Game Over (Loss)**

### Attributes
Each ranges from **1 to 20**, set at game start by chosen class, then modified by curses and level-up choices.

| Attribute   | Effect |
|-------------|--------|
| **Power**      | Determines combat outcome (compared against enemy Power) |
| **Agility** | High = find treasure; Low = trigger traps; also used in NPC checks |
| **Persuasion** | Determines outcome of NPC interactions |

### Inventory
- Holds **items** acquired through treasure/trap successes and NPC encounters
- Each item has:
  - A **name**
  - An **effect**: 
    - `+1` up to `+5` to one attribute (buff)
    - Remove one curse chosen by the player (single use)
- Items that provide buffs can be equipped and unequipped at any time. 
- Items must be equipped to have effect.
- Only 5 items can be equipped at a time.
- Items that remove curses can be used a single time, at any time, and disappear afterwards.
- The player state passed on to the narrator includes only equiped items, not all 

### Curses
- Accumulated through combat losses, trap failures, and NPC failures
- Each curse has:
  - A **name** (e.g., "Rusted Weapon")
  - An **effect**: `-1` or `-2` to one specific attribute
- Curses **stack** and are tracked individually
- Curses **persist** for the entire game (no expiry unless an item clears them)

### Level
- Starts at **1**
- Gained by: winning/drawing combat, passing a treasure check
- On level-up: player chooses **+1 to any one attribute** (capped at 20)

---

## Classes (Starting Configurations)

Three classes set the initial attribute spread (total of 15 points distributed across 3 attributes, min 1 each):

| Class      | Power | Agility | Persuasion |
|------------|-------|------------|------------|
| Warrior    | 7     | 4          | 4          |
| Scout      | 4     | 7          | 4          |
| Priestess  | 4     | 4          | 7          |

---

## Game World

### Grid
- Procedurally generated **N×N grid** (suggested: 5×6 = 30 squares)
- Randomly distributed wall squares, non traversible, comprising 40% of the grid
- Player starts at the center space of the lower line
- **Exit** is placed at one random square on the upper third of the grid
- on startup, a simple algorhythm checks if there is a clear path from the player start location to the exit. If there is not, the grid is remade
- All other squares contain exactly **one encounter**
- Encounter type per square is assigned randomly at generation: Enemy, Treasure/Trap, or NPC

### MAP
- Simple square grid structure on the corner of the screen, shows only visited squares, not squares yet to visit
- If an encounter has been fled from, it is marked on that space in the map

### Navigation
- Player chooses a cardinal direction: **North, South, East, West**
- Movement is one square per turn
- **Resolved squares**: no new encounter triggers; player may pass through freely
- **Escaped squares**: the escaped encounter remains there, and cannot be skipped again, should the player enter the same space once more
- Player cannot move outside grid boundaries, and cannot move into wall squares

---

## Encounters

### 1. Enemy Encounter

Each enemy has a hidden **Power** value (1–20), randomly assigned.
**Player choice:**
- the player may choose to Flee, or engage in battle. 
**Battle:**
- `Player Power ≥ Enemy Power` → **Win/Draw**
  - Player gains **1 level-up** (choose +1 to any attribute)
- `Player Power < Enemy Power` → **Loss**
  - Player loses **1 HP**
  - Player gains **1 random curse** (magnitude: **-1** to a random attribute)
**Fleeing:** The player escapes the encounter and is free to choose another direction, winning and gaining nothing from the encounter, but the encounter will reappear should the player reenter the same space, and on the second time the player cannot flee.
---

### 2. Treasure / Trap

Each treasure/trap square has a hidden **Difficulty** value (1–20).

**Player choice:**
- the player may choose to flee, or grab the treasure

**Resolution:**
- `Player Agility > Difficulty` → **Pass (Treasure)**
  - Player gains **1 level-up**
  - Player gains **1 item**
- `Player Agility ≤ Difficulty` → **Fail (Trap)**
  - Player loses **1 HP**
  - Player gains **1 random curse**

**Fleeing:** The player escapes the encounter and is free to choose another direction, winning and gaining nothing from the encounter, but the encounter will reappear should the player reenter the same space, and on the second time the player cannot flee.
---

### 3. NPC Encounter

Each NPC has a hidden **Persuasion check** value (1–20).

**Player choice:**
- the player may choose to flee, or engage the NPC in Negotiation

**Negotiation:**
- `Player Persuasion ≥ NPC check` → **Pass**
  - Player gains **1 item**
- `Player Persuasion < NPC check` → **Fail**
  - Player gains **1 random curse** to a random attribute

**Fleeing:** The player escapes the encounter and is free to choose another direction, winning and gaining nothing from the encounter, but the encounter will reappear should the player reenter the same space, and on the second time the player cannot flee.

### 4. Difficulty

All encounters are categorized according to their difficulty:
- Easy (1-5)
- Medium (6-10)
- Hard (11-15)
- Very Hard (16-20)
Whenever a player encounters a new enemy, the player does not see exactly the numbers, but rather the difficulty of the encounter.
Harder encounters appear more often as the player progresses through the game. When the grid is first formed, the game calculates the distance of all squares to the exit square. The closer a square is to the exit, the harder the encounter will be.
---

## Items

Items are stored in inventory and can be used by the player on their turn (before or after moving).

| Property  | Values |
|-----------|--------|
| Use type  | `single-use` / `multi-use` |
| Effect    | `+1`, `+2`, or `+3` to one attribute / `Clear Single Curse`|
| Attribute | Power, Agility, or Persuasion |

Single-use items are removed from inventory after use. Multi-use items remain.
Curse-clearing effects remove one random curse from the chosen category (power, agility, or persuasion)

---

## Negative curses

Randomly selected from a pool. Each applies a persistent debuff.

Example pool:
- Rusted Weapon → -1 Power
- Blurred Vision → -1 Agility
- Shaken Nerves → -1 Persuasion
- Heavy Wound → -2 Power
- Blinded → -2 Agility
- Rattled → -2 Persuasion

Curses stack (two "Rusted Weapon" curses = -2 Power total).

---

## Win / Loss Conditions

| Condition | Result |
|-----------|--------|
| Player reaches the Exit square | **Win** |
| Player HP reaches 0 | **Loss** |

---

## Effective Attribute Calculation

> `Effective Attribute = Base Attribute + Item Bonuses (if active) + Sum of all curse modifiers`

Attributes cannot go below 0 for calculation purposes.

---

## Turn Structure

```
1. Player selects direction
2. Grid position updates
3. If new square:
   a. Encounter triggers
   b. Player chooses to engage or flee, if available
   c. Outcome calculated using effective attributes
   d. HP / inventory / curses updated
   e. If level-up earned: player picks +1 attribute
4. If revisited square with encounter previously resolved: no encounter, player continues
5. If revisited square with encounter previously fled: enconter is trigerred with no possibility of fleeing
6. Check win/loss conditions

## Game setup

1. Map generation: as soon as the game boots up, the grid is generated, the exit is placed, and then all locations for encounters, NPCs, items, and traps, as well as their difficulty, are chosen. 

2. For each square, the following information is stored
- Type: entrance, exit, wall, item, NPC, trap, or enemy
- Difficulty with number (if applicable)
- Curse effect (for enemy, NPC or trap spaces, as a consequence of a failure)
- Item effect (for item spaces, NPC, or trap spaces as rewards for success) 

3. Initial settings with player input
- The player is prompted to provide API information as well as model ID for the LLM integration
- The player is prompted to choose a theme, a detailed description of the theme, as well as a character description
- Both of these settings can be saved as presets

4. Names generation with AI
- The LLM will be tasked with generating names for all enemies, NPCs, traps, items, and curses. 
- The information provided by the player in the theme spaces will be used by the LLM to generate adequate names
- The AI will be instructed to choose names that make sense in the context of harder encounters having more intimidating names, and easier encounters having more mundane names, same for stronger or weaker items
- For each square, the LLM will receive the information regarding the contents of the square and will have to generate names.
  - Example prompt: type:enemy/difficulty:easy/Curse-effect:-1 power
  - Example response: goblin/difficulty:3/curse:sprained ankle -1 power
- The new names chosen by the LLM will then be imported into the game, and used during the session.

### Narration
This is where the flavour of the game resides. Every turn, the AI will receive the information of:
- the encounter type
- the name of the encountered NPC, trap, or enemy
- the player's active items, if any
- any curses affecting the player

The AI will then generate a short description of the  encounter that is about to occur.
After the player has chosen to flee or engage, the AI will generate a short description of the resolution of the encounter, describing the encounter itself, or the escape.
The narration must be restricted to one or two paragraphs, in order to avoid making it too long.

