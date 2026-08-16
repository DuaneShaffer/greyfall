import type { Facing, ItemStack, TileCoord, Unit } from "../data/index.js";
import type { BattleEvent } from "./events/types.js";
import { buildSatchels } from "./rules/items.js";
import { advanceClock } from "./rules/turn.js";
import { evaluateOutcome } from "./rules/outcome.js";
import { evaluateTriggers } from "./rules/triggers.js";
import { coordEq } from "./rules/grid.js";
import { initialGrids, initializePower } from "./rules/power.js";
import { createRng } from "./rng/mulberry32.js";
import type { ContentLibrary } from "./state/content.js";
import { emit, type Ctx } from "./state/ctx.js";
import type { BattleContent, GameState, ObjectRuntime } from "./state/types.js";
import { createBattleUnit, sortUnits } from "./state/unit.js";

/** Where one party member starts. */
export interface Deployment {
  unitId: string;
  position: TileCoord;
  facing?: Facing;
}

export const DEFAULT_DEPLOY_FACING: Facing = "north";

export interface BattleStart {
  state: GameState;
  events: BattleEvent[];
}

function snapshotContent(content: ContentLibrary, encounterId: string): BattleContent {
  const encounter = content.encounters[encounterId];
  if (encounter === undefined) throw new Error(`unknown encounter ${encounterId}`);
  const map = content.maps[encounter.mapId];
  if (map === undefined) throw new Error(`unknown map ${encounter.mapId}`);
  return {
    jobs: structuredClone(content.jobs),
    abilities: structuredClone(content.abilities),
    items: structuredClone(content.items),
    statuses: structuredClone(content.statuses),
    map: structuredClone(map),
    encounter: structuredClone(encounter),
  };
}

function initialObjects(content: BattleContent): ObjectRuntime[] {
  return content.map.objects
    .map((def) => ({
      def: structuredClone(def),
      hp: def.integrity.destructible ? def.integrity.hp : 0,
      destroyed: false,
      powered: def.powered,
      owner: null,
      ownerUnitId: null,
      ct: 0,
    }))
    .sort((a, b) => (a.def.id < b.def.id ? -1 : a.def.id > b.def.id ? 1 : 0));
}

/**
 * Build the opening state of a battle and run it up to the first unit's turn.
 *
 * Party members are placed by `deployment`; each placement must name a unit in
 * `party` and a tile from the map's `deploymentTiles`. Enemies come from the
 * encounter. Battle stats are derived here once, from the job stat curve,
 * equipment, and passive abilities.
 *
 * `carried` is the party's field kit for this battle — the chapter's consumable
 * stock, drawn from and spent down as one shared pool (`docs/ITEMS.md`). The
 * hostile force's own pool comes from the encounter's `enemySatchel`.
 *
 * Throws on invalid setup — deployment is authoring, not a player command.
 */
export function createBattle(
  content: ContentLibrary,
  encounterId: string,
  party: readonly Unit[],
  deployment: readonly Deployment[],
  carried: readonly ItemStack[] = [],
): BattleStart {
  const battleContent = snapshotContent(content, encounterId);
  const encounter = battleContent.encounter;
  const map = battleContent.map;

  if (deployment.length > encounter.maxDeployedUnits) {
    throw new Error(`${encounterId} deploys at most ${encounter.maxDeployedUnits} units`);
  }

  const state: GameState = {
    version: 2,
    content: battleContent,
    rng: createRng(encounter.rngSeed),
    map: { objects: initialObjects(battleContent) },
    grids: initialGrids(map),
    units: [],
    satchels: buildSatchels([
      { team: "player", items: carried },
      { team: "enemy", items: encounter.enemySatchel ?? [] },
    ]),
    charges: [],
    clock: 0,
    turn: 0,
    activeTurn: null,
    firedTriggerIds: [],
    result: null,
    nextOrdinal: 0,
  };

  const taken: TileCoord[] = [];
  for (const placement of deployment) {
    const unit = party.find((u) => u.id === placement.unitId);
    if (unit === undefined) throw new Error(`unit ${placement.unitId} is not in the party`);
    if (!map.deploymentTiles.some((t) => coordEq(t, placement.position))) {
      throw new Error(`(${placement.position.x},${placement.position.y}) is not a deployment tile`);
    }
    if (taken.some((t) => coordEq(t, placement.position))) {
      throw new Error(`two units deployed on (${placement.position.x},${placement.position.y})`);
    }
    taken.push(placement.position);
    state.units.push(
      createBattleUnit(
        battleContent,
        unit,
        "player",
        placement.position,
        placement.facing ?? DEFAULT_DEPLOY_FACING,
      ),
    );
  }

  for (const placed of encounter.enemies) {
    state.units.push(
      createBattleUnit(battleContent, placed.unit, placed.team, placed.position, placed.facing),
    );
  }
  sortUnits(state.units);

  // A grid authored over its rating starts latched open; nothing announces a
  // state the battle has not seen change.
  initializePower(state);

  const ctx: Ctx = { state, events: [] };
  emit(ctx, { type: "BattleStarted", encounterId: encounter.id, mapId: map.id });
  evaluateTriggers(ctx);
  evaluateOutcome(ctx);
  advanceClock(ctx);
  evaluateTriggers(ctx);
  evaluateOutcome(ctx);
  return { state: ctx.state, events: ctx.events };
}
