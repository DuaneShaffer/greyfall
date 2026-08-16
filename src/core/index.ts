/**
 * Greyfall battle core — the headless, deterministic rules engine.
 *
 * This module is the entire public surface. Everything downstream (renderer,
 * UI, AI, simulation harness, tests) builds a battle with {@link createBattle},
 * changes it only through {@link applyCommand}, animates the returned
 * {@link BattleEvent} stream, and reads the state through the selectors below.
 * Nothing outside `src/core` may reach into `GameState` directly.
 *
 * The engine has no DOM, no timers, and no wall clock: the same seed and the
 * same command log always reproduce the same battle.
 */

export { createBattle, DEFAULT_DEPLOY_FACING, type BattleStart, type Deployment } from "./setup.js";
export { applyCommand } from "./commands/apply.js";

export type {
  Command,
  CommandError,
  CommandErrorCode,
  CommandKind,
  CommandResult,
} from "./commands/types.js";
export type { BattleEvent, BattleEventType } from "./events/types.js";

export type {
  ActionAbility,
  ActiveStatus,
  ActiveTurn,
  BattleContent,
  BattleResult,
  BattleUnit,
  ChargedAction,
  ConsumableItem,
  GameState,
  MapState,
  MovementAbility,
  ObjectRuntime,
  ReactionAbility,
  SupportAbility,
  TargetRef,
  TeamSatchel,
  TempStatMod,
  WeaponItem,
} from "./state/types.js";
export type { ContentLibrary } from "./state/content.js";
export { BASIC_ATTACK_ID } from "./state/content.js";
export type { RngState } from "./rng/mulberry32.js";

export {
  abilityInfo,
  abilityOutcomes,
  activatableObjects,
  activeTurnState,
  activeUnit,
  affectedTiles,
  aimTarget,
  allCharges,
  allObjects,
  allUnits,
  attackAngleAgainst,
  availableAbilities,
  battleClock,
  battleEncounter,
  battleMap,
  battleResult,
  forecast,
  getObject,
  getUnit,
  itemInfo,
  jobInfo,
  legalTargetTiles,
  lineOfSight,
  poweredObjects,
  reachableTiles,
  statusInfo,
  targetableTiles,
  teamSatchel,
  turnNumber,
  turnOrderPreview,
  unitCanAct,
  unitCanMove,
  unitMaxCharge,
  unitMaxHp,
  unitStats,
  usableItems,
  type ForecastEntry,
  type ForecastOutcome,
  type PoweredObject,
  type TurnOrderEntry,
  type UsableItemEntry,
} from "./selectors.js";
export {
  DEFAULT_CONSUMABLE_TARGETING,
  ITEM_ABILITY_PREFIX,
  consumablePotencyBonus,
  consumableRangeBonus,
  itemAbility,
  itemAbilityId,
  itemIdFromAbilityId,
} from "./rules/items.js";
export type { AttackAngle } from "./rules/grid.js";
export type { ReachableTile } from "./rules/movement.js";

export { deriveStats, equippedItems, STAT_BASE, type DerivedStats } from "./progression/stats.js";

export {
  CAMPAIGN_STATE_VERSION,
  JOB_LEVEL_THRESHOLDS,
  MAX_JOB_LEVEL,
  adjustInventory,
  cloneCampaign,
  consumableStock,
  createCampaign,
  currentEncounterId,
  currentStanding,
  inventoryCount,
  isCampaignComplete,
  jobLevel,
  jobLevelFor,
  learnedAbilities,
  rosterUnit,
  standingToNextJobLevel,
  unitProgress,
  jobProgress,
  type CampaignState,
  type FallenRecord,
  type InventoryStack,
  type JobProgress,
  type UnitProgress,
} from "./progression/campaign.js";
export {
  applyBattleResults,
  changeJob,
  equipItem,
  learnAbility,
  setAbilitySlot,
  setSecondaryJob,
  unequipItem,
  unmetPrerequisite,
  type BattleOutcome,
  type BattleResultsApplied,
  type EquipmentSlot,
  type PassiveSlot,
  type ProgressionContent,
  type ProgressionError,
  type ProgressionErrorCode,
  type ProgressionResult,
  type StandingAward,
} from "./progression/ops.js";

export { standHeight } from "./rules/grid.js";
export {
  CT_COST_MOVE_AND_ACT,
  CT_COST_NEITHER,
  CT_COST_SINGLE,
  CT_TURN_THRESHOLD,
} from "./rules/turn.js";
export { STANDING_PER_ACTION } from "./rules/abilities.js";
export {
  DAMAGE_DIVISOR_PER_LEVEL,
  MIN_HIT_CHANCE,
  STAT_AMOUNT_NUMERATOR,
  WEAPON_DAMAGE_DIVISOR,
  damageDivisor,
} from "./rules/damage.js";
export { chooseCommand, enemyCommand, WEIGHTS, type AiWeights } from "./ai/index.js";
