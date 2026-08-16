import type {
  DamageType,
  Effect,
  Facing,
  MapObject,
  MapObjectKind,
  StatMods,
  Team,
  TileCoord,
} from "../../data/index.js";
import { chanceRoll } from "../rng/mulberry32.js";
import { getStatus } from "../state/content.js";
import { emit, nextOrdinal, type Ctx } from "../state/ctx.js";
import type { BattleUnit, GameState, ObjectRuntime } from "../state/types.js";
import {
  inertAmountTarget,
  resolveAmount,
  unitAmountTarget,
} from "./damage.js";
import {
  FACING_VECTORS,
  coordEq,
  facingToward,
  inBounds,
  isStandable,
  objectById,
  standHeight,
  unitAt,
  unitById,
} from "./grid.js";
import {
  attachLoad,
  dropLoadsOfCaster,
  gridNodeOf,
  gridNodeRuntimeOf,
  powerSnapshot,
  settlePower,
  severLine,
} from "./power.js";
import { maxCharge, maxHp } from "./status.js";

/** Height delta a shove can carry a unit across. */
export const FORCED_MOVE_HEIGHT_LIMIT = 2;

/** Runtime-spawned object shapes, by the `spawnObject` effect's `object` field. */
export const SPAWNED_OBJECT_SHAPES: Readonly<
  Record<"turret" | "mine" | "drone", { kind: MapObjectKind; blocksMovement: boolean }>
> = {
  turret: { kind: "turret", blocksMovement: true },
  mine: { kind: "mine", blocksMovement: false },
  drone: { kind: "drone", blocksMovement: true },
};

export interface EffectTargets {
  unitIds: string[];
  objectIds: string[];
  tiles: TileCoord[];
}

export interface EffectOutcome {
  damagedUnitIds: string[];
  downedUnitIds: string[];
  destroyedObjectIds: string[];
}

export function emptyOutcome(): EffectOutcome {
  return { damagedUnitIds: [], downedUnitIds: [], destroyedObjectIds: [] };
}

export function mergeOutcome(into: EffectOutcome, from: EffectOutcome): void {
  into.damagedUnitIds.push(...from.damagedUnitIds);
  into.downedUnitIds.push(...from.downedUnitIds);
  into.destroyedObjectIds.push(...from.destroyedObjectIds);
}

export function objectMaxHp(obj: ObjectRuntime): number {
  return obj.def.integrity.destructible ? obj.def.integrity.hp : 0;
}

/**
 * Units standing on the given tiles and objects covering them, both in id
 * order. Used to expand `targetTiles` payloads on machinery and triggers.
 */
export function collectTargets(
  state: GameState,
  tiles: readonly TileCoord[],
  objectIds: readonly string[] = [],
): EffectTargets {
  const unitIds = state.units
    .filter((u) => !u.downed && tiles.some((t) => coordEq(t, u.position)))
    .map((u) => u.id)
    .sort();
  const ids = new Set(objectIds);
  for (const obj of state.map.objects) {
    if (obj.destroyed) continue;
    if (obj.def.tiles.some((t) => tiles.some((c) => coordEq(c, t)))) ids.add(obj.def.id);
  }
  return { unitIds, objectIds: [...ids].sort(), tiles: [...tiles] };
}

export function damageUnit(
  ctx: Ctx,
  unitId: string,
  amount: number,
  damageType: DamageType,
  sourceUnitId: string | null,
  outcome: EffectOutcome,
): void {
  const unit = unitById(ctx.state, unitId);
  if (unit === undefined || unit.downed) return;
  const dealt = Math.max(0, amount);
  unit.hp = Math.max(0, unit.hp - dealt);
  emit(ctx, {
    type: "DamageDealt",
    unitId,
    sourceUnitId,
    amount: dealt,
    damageType,
    hpRemaining: unit.hp,
  });
  outcome.damagedUnitIds.push(unitId);
  if (unit.hp === 0) {
    downUnit(ctx, unit);
    outcome.downedUnitIds.push(unitId);
  }
}

/** Downing is terminal: there is no revival in this world (creative bible §5). */
export function downUnit(ctx: Ctx, unit: BattleUnit): void {
  if (unit.downed) return;
  unit.downed = true;
  unit.hp = 0;
  unit.ct = 0;
  emit(ctx, { type: "UnitDowned", unitId: unit.id });
  for (const charge of ctx.state.charges.filter((c) => c.actorId === unit.id)) {
    emit(ctx, {
      type: "AbilityChargeCancelled",
      unitId: charge.actorId,
      abilityId: charge.abilityId,
      chargeId: charge.id,
    });
  }
  ctx.state.charges = ctx.state.charges.filter((c) => c.actorId !== unit.id);
  dropLoadsOfCaster(ctx, unit.id);
}

export function healUnit(ctx: Ctx, unitId: string, amount: number, sourceUnitId: string | null): void {
  const unit = unitById(ctx.state, unitId);
  if (unit === undefined || unit.downed || amount <= 0) return;
  const cap = maxHp(ctx.state, unit);
  const healed = Math.min(amount, cap - unit.hp);
  unit.hp += healed;
  emit(ctx, { type: "Healed", unitId, sourceUnitId, amount: healed, hpRemaining: unit.hp });
}

export function applyStatus(ctx: Ctx, unitId: string, statusId: string, chance: number): void {
  const unit = unitById(ctx.state, unitId);
  if (unit === undefined || unit.downed) return;
  const status = getStatus(ctx.state, statusId);
  if (status === undefined) return;
  if (!chanceRoll(ctx.state.rng, chance)) {
    emit(ctx, { type: "StatusResisted", unitId, statusId });
    return;
  }
  const turnsRemaining = status.duration.kind === "turns" ? status.duration.turns : null;
  const existing = unit.statuses.find((s) => s.statusId === statusId);
  if (existing === undefined) {
    unit.statuses.push({ statusId, turnsRemaining });
    unit.statuses.sort((a, b) => (a.statusId < b.statusId ? -1 : a.statusId > b.statusId ? 1 : 0));
  } else {
    existing.turnsRemaining = turnsRemaining;
  }
  emit(ctx, { type: "StatusApplied", unitId, statusId, turnsRemaining });
}

export function removeStatus(ctx: Ctx, unitId: string, statusId: string): void {
  const unit = unitById(ctx.state, unitId);
  if (unit === undefined) return;
  if (!unit.statuses.some((s) => s.statusId === statusId)) return;
  unit.statuses = unit.statuses.filter((s) => s.statusId !== statusId);
  emit(ctx, { type: "StatusRemoved", unitId, statusId });
}

/**
 * Slide a unit along `facing`, stopping at the map edge, an unstandable or
 * occupied tile, or a height delta over `FORCED_MOVE_HEIGHT_LIMIT`. Move, Jump
 * and terrain cost are all ignored — this is a shove, not a walk.
 */
function slide(ctx: Ctx, unit: BattleUnit, facing: Facing, distance: number): TileCoord {
  const step = FACING_VECTORS[facing];
  let current: TileCoord = { ...unit.position };
  for (let i = 0; i < distance; i += 1) {
    const next: TileCoord = { x: current.x + step.dx, y: current.y + step.dy };
    if (!inBounds(ctx.state.content.map, next)) break;
    if (!isStandable(ctx.state, next)) break;
    if (unitAt(ctx.state, next) !== undefined) break;
    if (Math.abs(standHeight(ctx.state, next) - standHeight(ctx.state, current)) > FORCED_MOVE_HEIGHT_LIMIT) break;
    current = next;
  }
  return current;
}

export function forceMoveUnit(
  ctx: Ctx,
  unitId: string,
  direction: "push" | "pull" | "toward-actor-facing",
  distance: number,
  actor: BattleUnit | null,
  outcome: EffectOutcome,
): void {
  const unit = unitById(ctx.state, unitId);
  if (unit === undefined || unit.downed || actor === null) return;
  if (unit.id === actor.id) return;

  const facing =
    direction === "toward-actor-facing"
      ? actor.facing
      : direction === "push"
        ? facingToward(actor.position, unit.position)
        : facingToward(unit.position, actor.position);

  const from = { ...unit.position };
  const to = slide(ctx, unit, facing, distance);
  if (coordEq(to, from)) return;
  unit.position = to;
  emit(ctx, { type: "UnitForcedMove", unitId, from, to });
  checkContact(ctx, unitId, outcome);
}

/**
 * Reposition the acting unit itself. Direction is measured against `aimed` —
 * the first tile of the ability's area — with `forward` following the actor's
 * own facing, which is what a self-targeted ability needs.
 */
export function moveSelfUnit(
  ctx: Ctx,
  actor: BattleUnit | null,
  direction: "toward-target" | "away-from-target" | "forward",
  distance: number,
  aimed: TileCoord | undefined,
  outcome: EffectOutcome,
): void {
  if (actor === null || actor.downed) return;
  const from = { ...actor.position };
  const facing =
    direction === "forward" || aimed === undefined || coordEq(aimed, from)
      ? actor.facing
      : direction === "toward-target"
        ? facingToward(from, aimed)
        : facingToward(aimed, from);

  const to = slide(ctx, actor, facing, distance);
  if (coordEq(to, from)) return;
  actor.position = to;
  emit(ctx, { type: "UnitForcedMove", unitId: actor.id, from, to });
  checkContact(ctx, actor.id, outcome);
}

export function modifyCharge(
  ctx: Ctx,
  unitId: string,
  amount: number,
  siphonToActor: boolean,
  actor: BattleUnit | null,
): void {
  const unit = unitById(ctx.state, unitId);
  if (unit === undefined || unit.downed) return;
  const cap = maxCharge(ctx.state, unit);
  const next = Math.min(cap, Math.max(0, unit.charge + amount));
  const delta = next - unit.charge;
  unit.charge = next;
  emit(ctx, { type: "ChargeChanged", unitId, delta, charge: unit.charge });
  if (siphonToActor && delta < 0 && actor !== null && actor.id !== unitId) {
    const actorCap = maxCharge(ctx.state, actor);
    const gained = Math.min(-delta, actorCap - actor.charge);
    actor.charge += gained;
    emit(ctx, { type: "ChargeChanged", unitId: actor.id, delta: gained, charge: actor.charge });
  }
}

export function modifyDisposition(
  ctx: Ctx,
  unitId: string,
  stat: "resolve" | "attunement",
  amount: number,
): void {
  const unit = unitById(ctx.state, unitId);
  if (unit === undefined) return;
  const value = Math.min(100, Math.max(0, unit.unit.disposition[stat] + amount));
  unit.unit.disposition[stat] = value;
  emit(ctx, { type: "DispositionChanged", unitId, stat, value });
}

export function modifyStats(
  ctx: Ctx,
  unitId: string,
  mods: StatMods,
  duration: number | null,
): void {
  const unit = unitById(ctx.state, unitId);
  if (unit === undefined || unit.downed) return;
  unit.tempMods.push({ id: `mod-${nextOrdinal(ctx.state)}`, mods, turnsRemaining: duration });
  unit.hp = Math.min(unit.hp, maxHp(ctx.state, unit));
  unit.charge = Math.min(unit.charge, maxCharge(ctx.state, unit));
  emit(ctx, { type: "StatsModified", unitId, mods, turnsRemaining: duration });
}

/**
 * Write a node's isolator. Closing a tripped source's isolator is the reclose —
 * the only way to clear a latch, and deliberately the cheapest verb on the grid,
 * because a restore that costs more than the cut ends the argument at the first
 * cut. The `PowerChanged` this causes is emitted by the recompute, since what
 * the event reports is energization rather than the flag.
 */
export function setObjectPower(
  ctx: Ctx,
  objectId: string,
  mode: "on" | "off" | "toggle",
  actorId: string | null = null,
): void {
  const obj = objectById(ctx.state, objectId);
  if (obj === undefined || obj.destroyed || obj.powered === null) return;
  const powered = mode === "toggle" ? !obj.powered : mode === "on";
  const found = gridNodeOf(ctx.state, objectId);
  const node = gridNodeRuntimeOf(ctx.state, objectId);
  const reclosing = powered && found?.node.role === "source" && node?.tripped === true;
  if (powered === obj.powered && !reclosing) return;

  const before = powerSnapshot(ctx.state);
  obj.powered = powered;
  if (reclosing && node !== undefined && found !== null) {
    node.tripped = false;
    emit(ctx, { type: "GridReset", gridId: found.grid.id, nodeId: objectId, unitId: actorId });
  }
  settlePower(ctx, before, { nodeObjectId: objectId, reason: powered ? "restored" : "isolated" });
}

export function damageObject(
  ctx: Ctx,
  objectId: string,
  amount: number,
  sourceUnitId: string | null,
  outcome: EffectOutcome,
): void {
  const obj = objectById(ctx.state, objectId);
  if (obj === undefined || obj.destroyed || !obj.def.integrity.destructible) return;
  const dealt = Math.max(0, amount);
  obj.hp = Math.max(0, obj.hp - dealt);
  emit(ctx, { type: "ObjectDamaged", objectId, sourceUnitId, amount: dealt, hpRemaining: obj.hp });
  if (obj.hp === 0) destroyObject(ctx, objectId, outcome);
}

export function repairObject(ctx: Ctx, objectId: string, amount: number): void {
  const obj = objectById(ctx.state, objectId);
  if (obj === undefined || obj.destroyed || !obj.def.integrity.destructible || amount <= 0) return;
  const cap = objectMaxHp(obj);
  const healed = Math.min(amount, cap - obj.hp);
  if (healed <= 0) return;
  obj.hp += healed;
  emit(ctx, { type: "ObjectRepaired", objectId, amount: healed, hpRemaining: obj.hp });
}

/**
 * Destroy an object: it stops blocking movement and LoS, loses power, and fires
 * its `onDestroyed` payload onto the tiles the content names.
 */
export function destroyObject(ctx: Ctx, objectId: string, outcome: EffectOutcome): void {
  const obj = objectById(ctx.state, objectId);
  if (obj === undefined || obj.destroyed) return;
  const before = powerSnapshot(ctx.state);
  obj.destroyed = true;
  obj.hp = 0;
  if (obj.powered === true) obj.powered = false;
  settlePower(ctx, before, { nodeObjectId: objectId, reason: "destroyed" });
  emit(ctx, { type: "ObjectDestroyed", objectId });
  outcome.destroyedObjectIds.push(objectId);

  const payload = obj.def.onDestroyed;
  if (payload === undefined || payload.effects.length === 0) return;
  const targets = collectTargets(ctx.state, payload.targetTiles);
  mergeOutcome(outcome, applyEffects(ctx, payload.effects, null, targets));
}

export function spawnObject(
  ctx: Ctx,
  effect: Extract<Effect, { kind: "spawnObject" }>,
  tile: TileCoord,
  actor: BattleUnit | null,
): void {
  const shape = SPAWNED_OBJECT_SHAPES[effect.object];
  const id = `spawned-${effect.object}-${nextOrdinal(ctx.state)}`;
  const def: MapObject = {
    id,
    kind: shape.kind,
    name: effect.object,
    spriteId: effect.object,
    tiles: [{ ...tile }],
    blocksMovement: shape.blocksMovement,
    blocksLos: false,
    integrity: { destructible: true, hp: effect.hp },
    powered: null,
    operable: null,
    ...(effect.onContact === undefined ? {} : { onContact: structuredClone(effect.onContact) }),
    ...(effect.attack === undefined ? {} : { autoAttack: structuredClone(effect.attack) }),
  };
  const owner = actor === null ? null : actor.team;
  ctx.state.map.objects.push({
    def,
    hp: effect.hp,
    destroyed: false,
    powered: null,
    owner,
    ownerUnitId: actor === null ? null : actor.id,
    ct: 0,
  });
  ctx.state.map.objects.sort((a, b) => (a.def.id < b.def.id ? -1 : a.def.id > b.def.id ? 1 : 0));
  emit(ctx, { type: "ObjectSpawned", objectId: id, kind: shape.kind, owner, tiles: [{ ...tile }] });
}

/** Deployables set off by their own shoves must not chain forever. */
export const MAX_CONTACT_DEPTH = 4;

/**
 * Fire the `onContact` payload of every deployable covering the tile a unit
 * just entered. A deployable never goes off under the team that placed it, and
 * one that `destroysSelf` (the default) is destroyed before its payload runs,
 * so it cannot re-trigger itself.
 */
export function checkContact(ctx: Ctx, unitId: string, outcome: EffectOutcome): void {
  const depth = ctx.contactDepth ?? 0;
  if (depth >= MAX_CONTACT_DEPTH) return;
  const unit = unitById(ctx.state, unitId);
  if (unit === undefined || unit.downed) return;

  ctx.contactDepth = depth + 1;
  try {
    for (const obj of [...ctx.state.map.objects]) {
      const contact = obj.def.onContact;
      if (obj.destroyed || contact === undefined) continue;
      if (obj.owner !== null && obj.owner === unit.team) continue;
      const standing = unitById(ctx.state, unitId);
      if (standing === undefined || standing.downed) return;
      if (!obj.def.tiles.some((t) => coordEq(t, standing.position))) continue;
      emit(ctx, { type: "ObjectTriggered", objectId: obj.def.id, unitId });
      if (contact.destroysSelf !== false) destroyObject(ctx, obj.def.id, outcome);
      mergeOutcome(outcome, applyEffects(ctx, contact.effects, null, collectTargets(ctx.state, obj.def.tiles)));
    }
  } finally {
    ctx.contactDepth = depth;
  }
}

/**
 * Interpret an effect list against already-resolved targets.
 *
 * Unit-scoped effects (`damage`, `heal`, `applyStatus`, `removeStatus`,
 * `forceMove`, `modifyCharge`, `modifyDisposition`, `modifyStats`) run on
 * `unitIds`; object-scoped effects (`setPower`, `damageObject`,
 * `repairObject`, `addLoad`, `severLine`) run on `objectIds`;
 * `spawnObject` runs on `tiles`;
 * `moveSelf` runs once on the acting unit. Effects are applied in content
 * order, targets in id order.
 */
export function applyEffects(
  ctx: Ctx,
  effects: readonly Effect[],
  actorId: string | null,
  targets: EffectTargets,
): EffectOutcome {
  const outcome = emptyOutcome();
  const actor = actorId === null ? null : (unitById(ctx.state, actorId) ?? null);

  for (const effect of effects) {
    switch (effect.kind) {
      case "damage":
        for (const unitId of targets.unitIds) {
          const unit = unitById(ctx.state, unitId);
          if (unit === undefined) continue;
          const amount = resolveAmount(ctx.state, effect.amount, actor, unitAmountTarget(ctx.state, unit));
          damageUnit(ctx, unitId, amount, effect.damageType, actorId, outcome);
        }
        break;
      case "heal":
        for (const unitId of targets.unitIds) {
          const unit = unitById(ctx.state, unitId);
          if (unit === undefined) continue;
          const amount = resolveAmount(ctx.state, effect.amount, actor, unitAmountTarget(ctx.state, unit));
          healUnit(ctx, unitId, amount, actorId);
        }
        break;
      case "applyStatus":
        for (const unitId of targets.unitIds) applyStatus(ctx, unitId, effect.statusId, effect.chance);
        break;
      case "removeStatus":
        for (const unitId of targets.unitIds) removeStatus(ctx, unitId, effect.statusId);
        break;
      case "forceMove":
        for (const unitId of targets.unitIds) {
          forceMoveUnit(ctx, unitId, effect.direction, effect.distance, actor, outcome);
        }
        break;
      case "moveSelf":
        moveSelfUnit(ctx, actor, effect.direction, effect.distance, targets.tiles[0], outcome);
        break;
      case "modifyCharge":
        for (const unitId of targets.unitIds) {
          modifyCharge(ctx, unitId, effect.amount, effect.siphonToActor ?? false, actor);
        }
        break;
      case "modifyDisposition":
        for (const unitId of targets.unitIds) modifyDisposition(ctx, unitId, effect.stat, effect.amount);
        break;
      case "modifyStats":
        for (const unitId of targets.unitIds) {
          modifyStats(ctx, unitId, effect.mods, effect.duration ?? null);
        }
        break;
      case "setPower":
        for (const objectId of targets.objectIds) setObjectPower(ctx, objectId, effect.mode, actorId);
        break;
      case "addLoad":
        for (const objectId of targets.objectIds) {
          attachLoad(ctx, objectId, effect.amount, effect.durationTurns, actorId);
        }
        break;
      case "severLine":
        for (const objectId of targets.objectIds) severLine(ctx, objectId, effect.mode, actorId);
        break;
      case "damageObject":
        for (const objectId of targets.objectIds) {
          const obj = objectById(ctx.state, objectId);
          if (obj === undefined) continue;
          const amount = resolveAmount(
            ctx.state,
            effect.amount,
            actor,
            inertAmountTarget(objectMaxHp(obj)),
          );
          damageObject(ctx, objectId, amount, actorId, outcome);
        }
        break;
      case "repairObject":
        for (const objectId of targets.objectIds) {
          const obj = objectById(ctx.state, objectId);
          if (obj === undefined) continue;
          const amount = resolveAmount(
            ctx.state,
            effect.amount,
            actor,
            inertAmountTarget(objectMaxHp(obj)),
          );
          repairObject(ctx, objectId, amount);
        }
        break;
      case "spawnObject":
        for (const tile of targets.tiles) {
          if (unitAt(ctx.state, tile) !== undefined) continue;
          if (!isStandable(ctx.state, tile)) continue;
          spawnObject(ctx, effect, tile, actor);
        }
        break;
    }
  }
  return outcome;
}

/** Cost in flux a unit pays up front to use an ability. */
export function spendCharge(ctx: Ctx, unit: BattleUnit, chargeCost: number, hpCost: number): void {
  if (chargeCost > 0) {
    unit.charge -= chargeCost;
    emit(ctx, { type: "ChargeChanged", unitId: unit.id, delta: -chargeCost, charge: unit.charge });
  }
  if (hpCost > 0) {
    const outcome = emptyOutcome();
    damageUnit(ctx, unit.id, hpCost, "chemical", unit.id, outcome);
  }
}
