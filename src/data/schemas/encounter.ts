import { z } from "zod";
import { DialogueLine, Facing, Id, SchemaVersion, Team, TileCoord } from "./common.js";
import { Unit } from "./unit.js";

const PlacedUnit = z.object({
  unit: Unit,
  team: Team,
  position: TileCoord,
  facing: Facing,
});
export type PlacedUnit = z.infer<typeof PlacedUnit>;

const WinCondition = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rout") }),
  z.object({ kind: z.literal("defeatUnit"), unitId: Id }),
  z.object({ kind: z.literal("surviveTurns"), turns: z.int().positive() }),
  z.object({ kind: z.literal("reachTiles"), tiles: z.array(TileCoord).min(1), unitId: Id.optional() }),
]);

const LossCondition = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("partyRout") }),
  z.object({ kind: z.literal("unitDowned"), unitId: Id }),
  z.object({ kind: z.literal("turnLimit"), turns: z.int().positive() }),
]);

const TriggerCondition = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("battleStart") }),
  z.object({ kind: z.literal("turnStart"), turn: z.int().positive() }),
  z.object({ kind: z.literal("unitDowned"), unitId: Id }),
  z.object({ kind: z.literal("objectDestroyed"), objectId: Id }),
  z.object({ kind: z.literal("unitEntersTiles"), tiles: z.array(TileCoord).min(1), team: Team.optional() }),
  z.object({ kind: z.literal("unitHpBelowPercent"), unitId: Id, percent: z.int().min(1).max(99) }),
]);

// Trigger actions inject commands through the same front door as players/AI;
// they are the slice-scale stand-in for a cutscene system.
const TriggerAction = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("dialogue"), lines: z.array(DialogueLine).min(1) }),
  z.object({ kind: z.literal("spawnUnits"), units: z.array(PlacedUnit).min(1) }),
  z.object({ kind: z.literal("setPower"), objectId: Id, powered: z.boolean() }),
  z.object({ kind: z.literal("destroyObject"), objectId: Id }),
  z.object({ kind: z.literal("endBattle"), result: z.enum(["win", "loss"]) }),
]);

const Trigger = z.object({
  id: Id,
  when: TriggerCondition,
  once: z.boolean(),
  actions: z.array(TriggerAction).min(1),
});

export const Encounter = z.object({
  schemaVersion: SchemaVersion,
  id: Id,
  name: z.string(),
  mapId: Id,
  rngSeed: z.int().nonnegative(),
  maxDeployedUnits: z.int().positive(),
  enemies: z.array(PlacedUnit).min(1),
  winConditions: z.array(WinCondition).min(1),
  lossConditions: z.array(LossCondition).min(1),
  triggers: z.array(Trigger),
});
export type Encounter = z.infer<typeof Encounter>;
