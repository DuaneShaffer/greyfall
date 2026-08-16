/**
 * Every number the enemy AI scores with, in one table so the balance
 * workstream can tune behaviour without reading the search.
 *
 * The unit of account is a tenth of a hit point: `damagePerHp` is 10, so a
 * score of 400 reads as "worth about 40 HP". All arithmetic is integer.
 */
export interface AiWeights {
  damagePerHp: number;
  healPerHp: number;
  killBonus: number;
  /** Value kept for damage aimed at a unit an in-flight charge already kills. */
  doomedTargetPercent: number;
  /** Extra weight on harm that lands on an ally (over 100 = actively avoided). */
  friendlyHarmPercent: number;
  selfHarmPercent: number;
  /** Ceiling on what one buff landing on a friendly is worth, before `allyAidPercent`. */
  buffValueCap: number;
  /** Value of a hostile that no ally is already engaging, per engaging ally. */
  crowdingPercent: number;

  statusPreventAction: number;
  statusPreventMove: number;
  statusPreventReaction: number;
  statusCtPerPercent: number;
  statusStatPoint: number;
  statusFallback: number;
  statusTurnCap: number;

  forceMovePoint: number;
  /** Ceiling on the tile swing a `moveSelf` effect may be credited, either way. */
  repositionCap: number;
  /** Floor of the taper on a status the target already holds, as a percentage. */
  heldStatusFloorPercent: number;

  spawnObjectPoint: number;
  /** Credit for a deployable's `onContact` payload — it pays out once. */
  contactPayloadPercent: number;
  /** Credit for a deployable's `attack` — it keeps firing while it stands. */
  autoAttackPercent: number;
  /** Shots a deployable forfeits to its own CT clock before the first one. */
  deployableSetupPercent: number;
  /** Percent of the payload lost per step the nearest hostile stands outside reach. */
  deployableReachStep: number;
  deployableReachFloor: number;
  /** Turns a deployable has to survive to be worth its full credit. */
  deployableLifeTurns: number;
  drainChargePercent: number;

  chargePoint: number;
  hpPoint: number;
  /** Extra price per flux point as the cost eats the pool the unit has left. */
  fluxScarcityPercent: number;
  /** Gross value under which spending flux still counts as chip damage. */
  chipThreshold: number;
  chipPenalty: number;
  /** Starting a cast forfeits the rest of the turn. */
  castTurnCost: number;
  /** Value retained per turn the target gets before a charge lands. */
  castEscapePercent: number;

  /** Credit for integrity damage that does not yet destroy, as a percentage. */
  objectChipPercent: number;
  objectStructurePoint: number;
  /** Per step of detour the team is spared when a blocker comes down. */
  objectPathPoint: number;
  /** Steps of detour one blocker may be credited with. */
  objectPathCap: number;
  /** Path distance inside which a machine counts as part of the fight. */
  objectHorizon: number;
  /** Value kept for a second object the first one's payload would destroy. */
  objectChainPercent: number;
  /** Worth of denying the enemy a powered machine it could work against us. */
  machineDenialPercent: number;
  /** Worth of putting a catwalk or lift deck under a friend, or out from under a foe. */
  deckPoint: number;

  /** Premium for a turn that both moves and acts (100 CT versus 80). */
  moveCost: number;
  actThreshold: number;

  approachPoint: number;
  standoffPoint: number;
  unreachablePenalty: number;
  exposurePoint: number;
  coverPoint: number;
  heightPoint: number;
  clumpRadius: number;
  clumpPoint: number;
  /** Per point of ally damage a support kit could still undo from this tile. */
  guardPoint: number;
  hazardTerrainPoint: number;
  blastPoint: number;
  damagedBlastPercent: number;
  intactBlastPercent: number;
  backExposure: number;
  sideExposure: number;

  /** Turns of stalemate per step of advance urgency. */
  stallTurnWindow: number;
  maxUrgency: number;
  forceAdvanceUrgency: number;
}

export const WEIGHTS: AiWeights = {
  damagePerHp: 10,
  healPerHp: 8,
  killBonus: 400,
  doomedTargetPercent: 15,
  friendlyHarmPercent: 150,
  selfHarmPercent: 200,
  buffValueCap: 250,
  crowdingPercent: 25,

  statusPreventAction: 250,
  statusPreventMove: 120,
  statusPreventReaction: 40,
  statusCtPerPercent: 4,
  statusStatPoint: 6,
  statusFallback: 60,
  statusTurnCap: 3,

  forceMovePoint: 25,
  repositionCap: 250,
  heldStatusFloorPercent: 0,

  spawnObjectPoint: 120,
  contactPayloadPercent: 100,
  autoAttackPercent: 250,
  deployableSetupPercent: 100,
  deployableReachStep: 12,
  deployableReachFloor: 10,
  deployableLifeTurns: 3,
  drainChargePercent: 60,

  chargePoint: 12,
  hpPoint: 14,
  fluxScarcityPercent: 120,
  chipThreshold: 60,
  chipPenalty: 40,
  castTurnCost: 60,
  castEscapePercent: 45,

  objectChipPercent: 35,
  objectStructurePoint: 15,
  objectPathPoint: 35,
  objectPathCap: 6,
  objectHorizon: 8,
  objectChainPercent: 60,
  machineDenialPercent: 60,
  deckPoint: 200,

  moveCost: 25,
  actThreshold: 0,

  approachPoint: 20,
  standoffPoint: 10,
  unreachablePenalty: 900,
  exposurePoint: 6,
  coverPoint: 40,
  heightPoint: 8,
  clumpRadius: 1,
  clumpPoint: 30,
  guardPoint: 120,
  hazardTerrainPoint: 25,
  blastPoint: 10,
  damagedBlastPercent: 120,
  intactBlastPercent: 35,
  backExposure: 100,
  sideExposure: 45,

  stallTurnWindow: 8,
  maxUrgency: 4,
  forceAdvanceUrgency: 2,
};

/** Which fantasy the unit's kit expresses. Inferred, never authored. */
export type Archetype = "melee" | "artillery" | "support";

export interface ArchetypeProfile {
  approachPercent: number;
  /** Preferred distance from the nearest hostile, as a percent of best range. */
  standoffPercent: number;
  exposurePercent: number;
  coverPercent: number;
  heightPercent: number;
  /** Weight on keeping allies alive and unhurt. */
  allyAidPercent: number;
  objectPercent: number;
}

export const PROFILES: Readonly<Record<Archetype, ArchetypeProfile>> = {
  melee: {
    approachPercent: 140,
    standoffPercent: 0,
    exposurePercent: 30,
    coverPercent: 40,
    heightPercent: 60,
    allyAidPercent: 90,
    objectPercent: 90,
  },
  artillery: {
    approachPercent: 80,
    standoffPercent: 90,
    exposurePercent: 130,
    coverPercent: 140,
    heightPercent: 140,
    allyAidPercent: 100,
    objectPercent: 110,
  },
  support: {
    approachPercent: 45,
    standoffPercent: 120,
    exposurePercent: 170,
    coverPercent: 150,
    heightPercent: 90,
    allyAidPercent: 200,
    objectPercent: 90,
  },
};

/** Added to `objectPercent` when the kit can damage, power, or build objects. */
export const OBJECT_AFFINITY_BONUS = 45;
