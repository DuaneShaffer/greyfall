import type { Effect, TileCoord } from "../../data/index.js";
import { resolveAmount, unitAmountTarget } from "../rules/damage.js";
import { objectMaxHp } from "../rules/effects.js";
import { areEnemies, manhattan, tileAt, tileIndex, unitById } from "../rules/grid.js";
import { moveProfile, type MoveProfile } from "../rules/movement.js";
import { getAbility, knownActionAbilityIds } from "../state/content.js";
import type { ActionAbility, BattleUnit, GameState, ObjectRuntime } from "../state/types.js";
import { resolveArea } from "../rules/abilities.js";
import { distanceField, UNREACHABLE } from "./field.js";
import { OBJECT_AFFINITY_BONUS, PROFILES, WEIGHTS, type AiWeights, type Archetype } from "./weights.js";

/** What the actor's own kit says about how it wants to fight. */
export interface Kit {
  archetype: Archetype;
  abilities: ActionAbility[];
  bestRange: number;
  healsAllies: boolean;
  touchesObjects: boolean;
}

export interface ResolvedProfile {
  approachPercent: number;
  standoff: number;
  exposurePercent: number;
  coverPercent: number;
  heightPercent: number;
  allyAidPercent: number;
  objectPercent: number;
}

/** A hostile as the actor models it: how hard it hits and how far it gets. */
export interface Threat {
  unit: BattleUnit;
  strike: number;
  reach: number;
  ranged: boolean;
}

export interface AiContext {
  state: GameState;
  actor: BattleUnit;
  weights: AiWeights;
  profile: ResolvedProfile;
  kit: Kit;
  move: MoveProfile;
  urgency: number;
  hostiles: BattleUnit[];
  allies: BattleUnit[];
  threats: Threat[];
  /** Damage already committed to a unit by an in-flight charge. */
  pending: Map<string, number>;
  /** Allies whose move-and-strike range already covers each hostile. */
  crowding: Map<string, number>;
  /** Per-tile-index penalty for standing there before anyone attacks. */
  hazard: number[];
  fields: Map<string, number[]>;
  quarry: BattleUnit | null;
}

function actionAbilities(state: GameState, unit: BattleUnit): ActionAbility[] {
  const out: ActionAbility[] = [];
  for (const id of knownActionAbilityIds(state, unit)) {
    const ability = getAbility(state, unit, id);
    if (ability !== undefined && ability.slot === "action") out.push(ability);
  }
  return out;
}

function healsAllies(ability: ActionAbility): boolean {
  if (!ability.targeting.validTargets.some((t) => t === "ally" || t === "self")) return false;
  return ability.effects.some((e) => e.kind === "heal" || e.kind === "removeStatus");
}

function touchesObjects(ability: ActionAbility): boolean {
  return ability.effects.some(
    (e) => e.kind === "damageObject" || e.kind === "repairObject" || e.kind === "setPower" || e.kind === "spawnObject",
  );
}

/** Anything the unit can point at a hostile or at the machinery around one. */
function offensive(ability: ActionAbility): boolean {
  return ability.effects.some(
    (e) =>
      e.kind === "damage" ||
      e.kind === "applyStatus" ||
      e.kind === "damageObject" ||
      e.kind === "forceMove" ||
      e.kind === "modifyCharge",
  );
}

function readKit(state: GameState, unit: BattleUnit): Kit {
  const abilities = actionAbilities(state, unit);
  let bestRange = 1;
  let heals = false;
  let objects = false;
  for (const ability of abilities) {
    if (offensive(ability)) bestRange = Math.max(bestRange, ability.targeting.range.max);
    if (healsAllies(ability)) heals = true;
    if (touchesObjects(ability)) objects = true;
  }
  const archetype: Archetype = heals ? "support" : bestRange >= 3 ? "artillery" : "melee";
  return { archetype, abilities, bestRange, healsAllies: heals, touchesObjects: objects };
}

function resolveProfile(kit: Kit): ResolvedProfile {
  const base = PROFILES[kit.archetype];
  return {
    approachPercent: base.approachPercent,
    standoff: Math.floor((kit.bestRange * base.standoffPercent) / 100),
    exposurePercent: base.exposurePercent,
    coverPercent: base.coverPercent,
    heightPercent: base.heightPercent,
    allyAidPercent: base.allyAidPercent,
    objectPercent: base.objectPercent + (kit.touchesObjects ? OBJECT_AFFINITY_BONUS : 0),
  };
}

/** Damage the hostile's best ability would do to `victim` on a clean hit. */
function strikeEstimate(state: GameState, attacker: BattleUnit, victim: BattleUnit): number {
  let best = 0;
  for (const ability of actionAbilities(state, attacker)) {
    if (attacker.charge < ability.chargeCost) continue;
    let total = 0;
    for (const effect of ability.effects) {
      if (effect.kind !== "damage") continue;
      total += resolveAmount(state, effect.amount, attacker, unitAmountTarget(state, victim));
    }
    if (total > best) best = total;
  }
  return best;
}

function threatOf(state: GameState, hostile: BattleUnit, victim: BattleUnit): Threat {
  let range = 1;
  for (const ability of actionAbilities(state, hostile)) {
    if (offensive(ability)) range = Math.max(range, ability.targeting.range.max);
  }
  const profile = moveProfile(state, hostile);
  return {
    unit: hostile,
    strike: strikeEstimate(state, hostile, victim),
    reach: profile.move + range,
    ranged: range >= 2,
  };
}

/** Damage in flight from charges already on the clock, by target unit id. */
function pendingDamage(state: GameState): Map<string, number> {
  const pending = new Map<string, number>();
  for (const charge of state.charges) {
    const actor = unitById(state, charge.actorId);
    if (actor === undefined || actor.downed) continue;
    const ability = getAbility(state, actor, charge.abilityId);
    if (ability === undefined || ability.slot !== "action") continue;
    const area = resolveArea(state, actor, ability, charge.target);
    for (const unitId of area.unitIds) {
      const victim = unitById(state, unitId);
      if (victim === undefined || victim.downed) continue;
      let damage = 0;
      for (const effect of ability.effects) {
        if (effect.kind !== "damage") continue;
        damage += resolveAmount(state, effect.amount, actor, unitAmountTarget(state, victim));
      }
      if (damage > 0) pending.set(unitId, (pending.get(unitId) ?? 0) + damage);
    }
  }
  return pending;
}

/** How many allies could already bring an attack to bear on each hostile. */
function crowdingMap(state: GameState, actor: BattleUnit, hostiles: readonly BattleUnit[]): Map<string, number> {
  const crowding = new Map<string, number>();
  for (const hostile of hostiles) {
    let count = 0;
    for (const ally of state.units) {
      if (ally.downed || ally.team !== actor.team || ally.id === actor.id) continue;
      const threat = threatOf(state, ally, hostile);
      if (manhattan(ally.position, hostile.position) <= threat.reach) count += 1;
    }
    crowding.set(hostile.id, count);
  }
  return crowding;
}

/** Caster-less damage an effect list would do to `victim`. */
export function damageBite(
  state: GameState,
  effects: readonly Effect[] | undefined,
  victim: BattleUnit,
): number {
  if (effects === undefined) return 0;
  let total = 0;
  for (const effect of effects) {
    if (effect.kind !== "damage") continue;
    total += resolveAmount(state, effect.amount, null, unitAmountTarget(state, victim));
  }
  return total;
}

/** Damage a payload of effects would do to a unit like the actor. */
export function payloadBite(state: GameState, payload: ObjectRuntime["def"]["onDestroyed"], victim: BattleUnit): number {
  return damageBite(state, payload?.effects, victim);
}

/**
 * Standing danger per tile: the blast footprint of every destructible object
 * that carries an `onDestroyed` payload, weighted up sharply once the object
 * has already taken integrity damage, plus slow, wet terrain.
 */
function hazardField(state: GameState, actor: BattleUnit, weights: AiWeights): number[] {
  const map = state.content.map;
  const hazard = new Array<number>(map.width * map.depth).fill(0);

  for (let index = 0; index < hazard.length; index += 1) {
    const tile = map.tiles[index];
    if (tile !== undefined && tile.terrain === "water") hazard[index] = weights.hazardTerrainPoint;
  }

  for (const obj of state.map.objects) {
    if (obj.destroyed || obj.def.onDestroyed === undefined) continue;
    if (!obj.def.integrity.destructible) continue;
    const bite = payloadBite(state, obj.def.onDestroyed, actor);
    if (bite <= 0) continue;
    const full = objectMaxHp(obj);
    const wounded = full > 0 && obj.hp < full;
    const percent = wounded ? weights.damagedBlastPercent : weights.intactBlastPercent;
    const value = Math.floor((bite * weights.blastPoint * percent) / 100);
    for (const tile of obj.def.onDestroyed.targetTiles) {
      const index = tileIndex(map, tile);
      if (index < 0 || index >= hazard.length) continue;
      hazard[index] = (hazard[index] ?? 0) + value;
    }
  }

  // Mines and anything else that goes off underfoot. Unlike a blast, this is a
  // certainty rather than a risk, so it carries full weight — and a deployable
  // never goes off for the team that laid it.
  for (const obj of state.map.objects) {
    const contact = obj.def.onContact;
    if (obj.destroyed || contact === undefined) continue;
    if (obj.owner !== null && obj.owner === actor.team) continue;
    const bite = damageBite(state, contact.effects, actor);
    if (bite <= 0) continue;
    const value = bite * weights.blastPoint;
    for (const tile of obj.def.tiles) {
      const index = tileIndex(map, tile);
      if (index < 0 || index >= hazard.length) continue;
      hazard[index] = (hazard[index] ?? 0) + value;
    }
  }
  return hazard;
}

/** The hostile this unit means to fight: closest by path, unit id breaking ties. */
function pickQuarry(
  state: GameState,
  hostiles: readonly BattleUnit[],
  fields: Map<string, number[]>,
  origin: TileCoord,
): BattleUnit | null {
  const map = state.content.map;
  const home = tileIndex(map, origin);
  let best: BattleUnit | null = null;
  let bestDistance = Number.MAX_SAFE_INTEGER;
  for (const hostile of hostiles) {
    const field = fields.get(hostile.id);
    const distance = field?.[home] ?? UNREACHABLE;
    if (distance < bestDistance) {
      best = hostile;
      bestDistance = distance;
    }
  }
  return best;
}

export function buildContext(state: GameState, actor: BattleUnit, weights: AiWeights = WEIGHTS): AiContext {
  const hostiles = state.units.filter((u) => !u.downed && areEnemies(u, actor));
  const allies = state.units.filter((u) => !u.downed && u.team === actor.team && u.id !== actor.id);
  const kit = readKit(state, actor);
  const move = moveProfile(state, actor);
  const fields = new Map<string, number[]>();
  for (const hostile of hostiles) fields.set(hostile.id, distanceField(state, move, hostile.position));

  return {
    state,
    actor,
    weights,
    profile: resolveProfile(kit),
    kit,
    move,
    urgency: Math.min(weights.maxUrgency, Math.floor(state.turn / weights.stallTurnWindow)),
    hostiles,
    allies,
    threats: hostiles.map((hostile) => threatOf(state, hostile, actor)),
    pending: pendingDamage(state),
    crowding: crowdingMap(state, actor, hostiles),
    hazard: hazardField(state, actor, weights),
    fields,
    quarry: pickQuarry(state, hostiles, fields, actor.position),
  };
}

/** HP the unit will actually have when this turn's committed damage lands. */
export function effectiveHp(ctx: AiContext, unit: BattleUnit): number {
  return unit.hp - (ctx.pending.get(unit.id) ?? 0);
}

export function tileHazard(ctx: AiContext, tile: TileCoord): number {
  const map = ctx.state.content.map;
  if (tileAt(map, tile) === undefined) return 0;
  return ctx.hazard[tileIndex(map, tile)] ?? 0;
}

export function fieldDistance(ctx: AiContext, hostileId: string, tile: TileCoord): number {
  const map = ctx.state.content.map;
  return ctx.fields.get(hostileId)?.[tileIndex(map, tile)] ?? UNREACHABLE;
}

