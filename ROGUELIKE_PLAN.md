# Rogue-like Gameflow Implementation Plan

## Goals

- Replace one-shot loss with run-based resurrection: when the player dies, the run ends, the player returns to town, and a new randomized dungeon run can begin.
- Preserve long-term character progression across runs: inventory, coins, class, base attributes, and naming pools stay intact.
- Make curses partially persistent: all temporary curses are cured between runs, except one randomly selected active curse from the failed run, which becomes permanent.
- Keep story context bounded by summarizing the chronicle between runs before the next run starts.
- Restrict town access to the between-run state after defeat; the dungeon entrance cannot be used as an at-will town exit during a live run.
- Remove the curse remover NPC and convert the healer into a resurrection-dialogue NPC instead of a paid healing service.

## Current System Touchpoints

- `initState()` creates both dungeon and town locations, starts the player in the dungeon, initializes HP, money, statuses, inventory, phase, and run-adjacent flags.
- Dungeon generation is handled by `generateGrid()`, while names are assigned by `fillDefaultNames()` or `applyNamePoolsToGrid()` using existing name pools.
- Death is handled by `checkGameOver()`, which currently streams a final defeat narration, sets `G.phase = 'gameover-loss'`, logs a summary, and exposes a reload-based "Try Again" flow.
- Boss defeat failure is handled separately in `resolveBoss()` and also sets `G.phase = 'gameover-loss'`.
- The town currently contains healer, curse remover, upgrader, and merchant NPCs from `generateTown()`, with service behavior dispatched by `startTownNpc()`.
- The dungeon start tile currently offers `enterTown()`, and the town gate offers `enterDungeon()`, making town accessible during normal play.
- Narration context is accumulated in `G.llmChronicle` by `streamNarrationLog()`, which sends the recent chronicle as "story so far" context.

## Proposed State Model

Add explicit run metadata to `G`:

- `runNumber`: starts at `1`, increments after each defeat resurrection.
- `betweenRuns`: `false` while exploring the dungeon, `true` after defeat while the player is in town.
- `permanentCurses`: array of curse objects selected from previous failed runs.
- `lastDefeat`: small object containing the defeat reason, run number, and optionally the selected permanent curse for narrator prompts.
- `storySummary`: compact summary of prior runs used as the long-term narrative context.

Keep `G.player.statuses` as the effective active curse list. At the start of each new run, rebuild it from `G.player.permanentCurses` so permanent curses continue to affect stats, while non-permanent curses disappear.

## Run Reset Flow

Create a dedicated `handleRunDefeat(reasonText, defeatSource)` flow that replaces direct game-over-loss transitions:

1. Set `G.phase = 'loading'` and prevent movement/input.
2. Narrate the defeat with a new prompt that clearly says this is a run defeat, not a permanent game ending.
3. Select one random active curse from `G.player.statuses` before curing. If the player had no curses, no new permanent curse is added.
4. Add the selected curse to `G.player.permanentCurses`, marking it with a field such as `permanent: true`.
5. Cure all non-permanent curses and reset `G.player.statuses` to copies of permanent curses.
6. Heal `G.player.hp` to `PLAYER_MAX_HP`.
7. Preserve `G.player.money`, `G.player.inventory`, `G.player.level`, base attributes, equipped item states, and class.
8. Summarize `G.llmChronicle` into `G.storySummary`, then replace/compact `G.llmChronicle` with that summary.
9. Return the player to town, set `G.currentLocation = 'town'`, set `G.betweenRuns = true`, and place the player at the town start/gate.
10. Stream a resurrection/return-to-town narration after the defeat narration. This prompt can mention rescue, waking in town, being carried back, or another theme-appropriate mechanism.
11. Set `G.phase = 'playing'` and render the town UI with only between-run actions available.

## New Run Start Flow

Update `enterDungeon()` to only work when `G.currentLocation === 'town'` and `G.betweenRuns === true`.

When the player starts the next run:

1. Generate a fresh dungeon with `generateGrid()`.
2. Reapply existing naming pools without regenerating them:
   - If AI-generated pools exist, call `applyNamePoolsToGrid(newGrid, existingNamePools)`.
   - Otherwise, call `fillDefaultNames(newGrid)`.
   - Do not rebuild `NAMING_PROMPT_CACHE`, do not call name-generation APIs, and do not alter the naming pools.
3. Store the new grid at `G.locations.dungeon.grid` and reset dungeon position to the new start tile.
4. Set `G.currentLocation = 'dungeon'`, `G.betweenRuns = false`, `G.runNumber += 1`, and clear transient encounter flags.
5. Log/narrate the new descent using the summarized story context plus the permanent curses.

## Town Access Changes

- Remove or disable the dungeon-start `Exit Dungeon` button during active runs.
- Keep the town gate `Enter Dungeon` button only in the between-run state.
- Prevent direct calls to `enterTown()` from moving the player to town unless the run has ended.
- Consider replacing `enterTown()` with `returnToTownAfterDefeat()` so normal dungeon traversal has no town escape path.

## Town NPC Changes

- Update `generateTown()` to stop placing the curse remover NPC.
- Change healer generation so the healer has no service cost and serves as a resurrection-dialogue NPC.
- Update `startTownNpc()`:
  - Remove the `curseRemover` dispatch.
  - Keep merchant/upgrader if between-run economy should remain available.
  - Route healer to a new `visitResurrectionHealer()` that provides dialogue only, with no HP changes and no coin cost.
- Remove or retire `visitCurseRemover()`, `returnCurseToPool()` usage from the NPC, `CURSE_REMOVER_SERVICE_COST`, and curse-remover prompts.
- Update the town NPC action button label so healer dialogue does not show "Talk (0 coins)" as a paid service.

## Curse Persistence Details

- Permanent curse selection should happen before any status cleanup and should use the curses active at the moment of defeat.
- If the selected curse is already permanent, do not duplicate it. If all current curses are permanent, the failed run does not add another copy unless the intended design allows duplicate permanent stacks.
- Permanent curses should not be returned to `AVAILABLE_CURSE_POOLS`, because naming pools are not altered and permanent state is character-specific.
- Curse-clearing items should be reviewed:
  - Recommended behavior: items can clear temporary curses during a run but cannot clear permanent curses.
  - UI should mark permanent curses distinctly, for example "Permanent" in the curse list.

## Story Summarization

Add a prompt builder such as `buildStorySummaryPrompt(previousSummary, chronicle, defeatDetails, permanentCurse)`.

Implementation path:

1. Add an API helper or reuse existing narration generation to request a concise summary.
2. Include previous `G.storySummary`, important player facts, key run outcomes, permanent curses, notable items, and the latest defeat.
3. Store only the returned summary in `G.storySummary` and reset `G.llmChronicle` to that summary.
4. Update `streamNarrationLog()` so the "story so far" prefix uses `G.storySummary` plus the current run chronicle, rather than an ever-growing raw chronicle.
5. Provide a fallback summary if the API fails, so the resurrection flow never blocks permanently.

## Prompt Updates

- Replace the current game-over prompt semantics with defeat-and-return semantics.
- Add a resurrection prompt that asks the narrator to describe both defeat aftermath and return to town in a theme-appropriate way.
- Add a healer resurrection-dialogue prompt for between-run town conversations.
- Remove curse-remover prompt usage and eventually delete the unused prompt builder.

## UI Updates

- Replace the loss screen "Try Again" reload button with between-run town controls.
- Add visible run metadata, such as "Run 2" and "Between runs" in the status panel or input title.
- Mark permanent curses in the status panel.
- Hide the dungeon-to-town action button during active runs.
- Ensure movement pad behavior is correct in town between runs and in dungeon during runs.

## Suggested Implementation Order

1. **Branch setup:** create and work on a dedicated `rogue-like` branch.
2. **State scaffolding:** add `runNumber`, `betweenRuns`, `permanentCurses`, `storySummary`, and helper accessors.
3. **Dungeon reroll helper:** add `generateNamedDungeonForRun()` that rerolls the map and reapplies existing names without touching name pools.
4. **Death flow refactor:** route `checkGameOver()` and boss-loss failure through `handleRunDefeat()` instead of `gameover-loss`.
5. **Curse persistence:** implement random permanent curse selection, temporary curse cleanup, full HP heal, and permanent curse display.
6. **Town gating:** disable active-run town access and require `betweenRuns` for `enterDungeon()`.
7. **Town NPC cleanup:** remove curse remover placement/dispatch, convert healer to dialogue-only resurrection flavor.
8. **Story summarization:** compact `G.llmChronicle` after defeat and update narration context building.
9. **UI polish:** update button labels, status panel run info, loss title removal, and town action availability.
10. **Validation:** manually test normal death, curse-based death, boss failure, no-curse death, starting the next run, town gating, inventory/money preservation, and naming-pool reuse.

## Acceptance Checklist

- Player death no longer reloads or ends the whole game.
- After death, the player appears in town with full HP.
- Inventory, money, class, level, base stats, and equipped items persist across runs.
- Exactly one curse from the failed run becomes permanent when at least one eligible temporary curse exists.
- All non-permanent curses are removed between runs.
- A new dungeon layout and encounters are generated for every new run.
- Existing naming pools are reused and not regenerated between runs.
- The town cannot be reached from the dungeon during an active run.
- The town gate starts the next randomized run only while between runs.
- The curse remover NPC is absent.
- The healer offers resurrection dialogue only and no paid healing/curse service.
- Story context is summarized/compacted between runs.
- Narration describes defeat and return to town instead of final death.
