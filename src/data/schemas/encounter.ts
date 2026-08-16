import { z } from "zod";
import { DialogueLine, Facing, Id, ItemStack, SchemaVersion, Team, TileCoord } from "./common.js";
import { Unit } from "./unit.js";

const PlacedUnit = z.object({
  unit: Unit,
  team: Team,
  position: TileCoord,
  facing: Facing,
});
export type PlacedUnit = z.infer<typeof PlacedUnit>;

// The win list is an OR; `all` is the AND inside it — "put down every
// provocateur". One level deep on purpose: groups do not nest.
const SIMPLE_WIN_CONDITIONS = [
  z.object({ kind: z.literal("rout") }),
  z.object({ kind: z.literal("defeatUnit"), unitId: Id }),
  z.object({ kind: z.literal("surviveTurns"), turns: z.int().positive() }),
  z.object({ kind: z.literal("reachTiles"), tiles: z.array(TileCoord).min(1), unitId: Id.optional() }),
] as const;

export const SimpleWinCondition = z.discriminatedUnion("kind", SIMPLE_WIN_CONDITIONS);
export type SimpleWinCondition = z.infer<typeof SimpleWinCondition>;

const WinCondition = z.discriminatedUnion("kind", [
  ...SIMPLE_WIN_CONDITIONS,
  z.object({ kind: z.literal("all"), conditions: z.array(SimpleWinCondition).min(2) }),
]);

const LossCondition = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("partyRout") }),
  z.object({ kind: z.literal("unitDowned"), unitId: Id }),
  z.object({ kind: z.literal("turnLimit"), turns: z.int().positive() }),
  // "They got away." `reachTiles` is a win, so a pursuit needs its own polarity.
  z.object({
    kind: z.literal("unitReachesTiles"),
    tiles: z.array(TileCoord).min(1),
    unitId: Id.optional(),
    team: Team.optional(),
  }),
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
  // Scripted repositioning: a withdrawal, a bolt for the stair.
  z.object({ kind: z.literal("moveUnit"), unitId: Id, to: TileCoord }),
  // Takes a unit off the field without downing it.
  z.object({ kind: z.literal("removeUnit"), unitId: Id }),
  z.object({ kind: z.literal("endBattle"), result: z.enum(["win", "loss"]) }),
]);

const Trigger = z.object({
  id: Id,
  when: TriggerCondition,
  /**
   * Ordering gate: the trigger stays shut until the named trigger has fired,
   * ANDed with `when`. A scene that must not be reached out of order says so
   * here — "he does not withdraw before he has answered" — instead of every
   * downstream trigger restating the upstream one's condition.
   */
  afterTriggerId: Id.optional(),
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
  // Consumables the hostile force shares for this battle, the enemy mirror of
  // the party satchel the chapter hands down.
  enemySatchel: z.array(ItemStack).optional(),
  winConditions: z.array(WinCondition).min(1),
  lossConditions: z.array(LossCondition).min(1),
  // What the end banner says about THIS engagement. Optional: the shell falls
  // back to neutral text for an encounter that has not been written up yet.
  endText: z.object({ win: z.string().optional(), loss: z.string().optional() }).optional(),
  triggers: z.array(Trigger),
});
export type Encounter = z.infer<typeof Encounter>;
