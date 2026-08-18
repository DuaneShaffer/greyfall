import type { Ability, Encounter, Facing, Team, TileCoord, Unit } from "../../../src/data/index.js";
import {
  applyCommand,
  createBattle,
  type Command,
  type ContentLibrary,
  type GameState,
} from "../../../src/core/index.js";
import { chooseCommand } from "../../../src/core/ai/index.js";
import { testContent, yardEncounter } from "../fixtures.js";

type Placement = Encounter["enemies"][number];

/** A bench heal, so a support kit exists to infer an archetype from. */
export const AI_MEND: Ability = {
  schemaVersion: 1,
  id: "ai-mend",
  name: "Mend",
  description: "Coagulant and a field dressing, at the length of an arm and a shout.",
  jobId: "conduit",
  standingCost: 0,
  slot: "action",
  targeting: {
    range: { min: 0, max: 3, vertical: 2 },
    area: { shape: "single" },
    requiresLos: true,
    validTargets: ["ally", "self"],
  },
  chargeCost: 0,
  castSpeed: null,
  effects: [{ kind: "heal", amount: { base: "mag", power: 6 } }],
};

function aiContent(encounters: Encounter[] = []): ContentLibrary {
  const base = testContent(encounters);
  return { ...base, abilities: { ...base.abilities, "ai-mend": AI_MEND } };
}

/** Any unit, any team, anywhere on the yard — the encounter roster ignores deployment tiles. */
export function at(unit: Unit, team: Team, position: TileCoord, facing: Facing = "north"): Placement {
  return { unit, team, position, facing };
}

export function conduit(id: string, name = "Conduit", extra: Partial<Unit> = {}): Unit {
  return {
    schemaVersion: 1,
    id,
    name,
    level: 1,
    jobId: "conduit",
    disposition: { resolve: 50, attunement: 70 },
    learnedAbilityIds: ["overload-cell"],
    equipment: {},
    ...extra,
  };
}

export function watchman(id: string, name = "Watchman", extra: Partial<Unit> = {}): Unit {
  return {
    schemaVersion: 1,
    id,
    name,
    level: 1,
    jobId: "enforcer",
    disposition: { resolve: 60, attunement: 40 },
    learnedAbilityIds: ["pin"],
    equipment: { weapon: "shock-maul" },
    ...extra,
  };
}

export interface YardOptions {
  id?: string;
  rngSeed?: number;
  /** Consumables the hostile force shares. */
  satchel?: Encounter["enemySatchel"];
  winConditions?: Encounter["winConditions"];
  lossConditions?: Encounter["lossConditions"];
}

export function medic(id: string, name = "Medic", extra: Partial<Unit> = {}): Unit {
  return {
    schemaVersion: 1,
    id,
    name,
    level: 1,
    jobId: "conduit",
    disposition: { resolve: 50, attunement: 70 },
    learnedAbilityIds: ["ai-mend"],
    equipment: {},
    ...extra,
  };
}

/** A battle on the Marshaling Yard whose whole roster is placed by hand. */
export function yardBattle(placements: Placement[], options: YardOptions = {}): GameState {
  const id = options.id ?? "e-ai-bench";
  const encounter = yardEncounter(aiContent(), {
    id,
    enemies: placements,
    ...(options.satchel === undefined ? {} : { enemySatchel: options.satchel }),
    ...(options.rngSeed === undefined ? {} : { rngSeed: options.rngSeed }),
    ...(options.winConditions === undefined ? {} : { winConditions: options.winConditions }),
    ...(options.lossConditions === undefined ? {} : { lossConditions: options.lossConditions }),
    triggers: [],
  });
  return createBattle(aiContent([encounter]), id, [], []).state;
}

export function unit(state: GameState, unitId: string) {
  const found = state.units.find((candidate) => candidate.id === unitId);
  if (found === undefined) throw new Error(`no unit ${unitId}`);
  return found;
}

export function apply(state: GameState, command: Command): GameState {
  const result = applyCommand(state, command);
  if (result.error !== null) throw new Error(`${command.kind}: ${result.error.message}`);
  return result.state;
}

export interface TurnLog {
  state: GameState;
  commands: Command[];
}

/** Run the active unit's whole turn through the AI, stopping when it ends. */
export function playTurn(state: GameState, maxCommands = 6): TurnLog {
  const commands: Command[] = [];
  let current = state;
  const turn = current.activeTurn;
  if (turn === null) return { state: current, commands };
  for (let step = 0; step < maxCommands; step += 1) {
    if (current.activeTurn === null || current.activeTurn.unitId !== turn.unitId) break;
    const command = chooseCommand(current);
    commands.push(command);
    current = apply(current, command);
  }
  return { state: current, commands };
}

/** Both teams driven by the AI until the battle resolves or the budget runs out. */
export function playBattle(state: GameState, maxCommands = 4000): TurnLog {
  const commands: Command[] = [];
  let current = state;
  while (current.result === null && current.activeTurn !== null && commands.length < maxCommands) {
    const command = chooseCommand(current);
    commands.push(command);
    current = apply(current, command);
  }
  return { state: current, commands };
}
