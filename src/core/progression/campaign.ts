import type { Campaign, Item, Unit } from "../../data/index.js";

/**
 * The between-battle layer's state. Everything a chapter carries from one
 * encounter to the next lives here and nowhere else: the roster is THE mutable
 * copy of the party (`data/units` is only the seed), Standing is banked per
 * unit per job, and the fallen never come back.
 *
 * Plain JSON, no classes and no closures, so it serializes exactly. Every
 * collection is kept in an explicit sort order (unit id, job id, item id) —
 * the determinism rule in docs/ARCHITECTURE.md binds this layer too, since a
 * save round-trip must reproduce byte-identical state.
 */

export const CAMPAIGN_STATE_VERSION = 1;

/**
 * Cumulative Standing banked into one job that unlocks each job level:
 * index `i` is the threshold for job level `i + 1`.
 *
 * Level:  1    2    3    4    5     6     7     8
 * Total:  0  100  250  450  700  1000  1350  1750
 *
 * First differences are an arithmetic run (100, 150, 200, …), FFT's own curve
 * shape. See docs/PROGRESSION.md for why these numbers.
 */
export const JOB_LEVEL_THRESHOLDS: readonly number[] = [0, 100, 250, 450, 700, 1000, 1350, 1750];
export const MAX_JOB_LEVEL = JOB_LEVEL_THRESHOLDS.length;

/** Standing in one job for one unit. */
export interface JobProgress {
  jobId: string;
  /** Total Standing ever banked into this job. Gates job level; never spent down. */
  earned: number;
  /** Unspent Standing, available to learn this job's abilities. */
  balance: number;
}

export interface UnitProgress {
  unitId: string;
  /** Sorted by job id. */
  jobs: JobProgress[];
  /**
   * Every ability this unit has ever paid for, sorted. Authoritative — the
   * roster `Unit.learnedAbilityIds` is a projection of this onto the current
   * primary/secondary skillsets (see `projectSkillsets` in ops.ts).
   */
  learned: string[];
}

export interface InventoryStack {
  itemId: string;
  count: number;
}

/** A unit removed by permadeath. Kept for the record, never revived. */
export interface FallenRecord {
  unitId: string;
  name: string;
  jobId: string;
  level: number;
  /** Encounter the unit was lost in. */
  encounterId: string;
}

export interface CampaignState {
  version: typeof CAMPAIGN_STATE_VERSION;
  campaignId: string;
  /**
   * The party in join order — the campaign's declared roster first, later
   * recruits appended. Explicit and stable, which is what determinism asks
   * for; it also puts the protagonist at the top of the list and on the first
   * deployment tile. Every *rule* that iterates units does so by unit id, in
   * `applyBattleResults` and in the engine.
   */
  roster: Unit[];
  /** Sorted by unit id; one entry per roster member. */
  progress: UnitProgress[];
  /** Unequipped stock, sorted by item id. Equipped kit is not in here. */
  inventory: InventoryStack[];
  fallen: FallenRecord[];
  /** Index into the campaign's `encounterIds`; equals its length when done. */
  encounterIndex: number;
  /** Encounter ids won, in the order they were won. */
  completedEncounterIds: string[];
}

const byUnitId = (a: { unitId: string }, b: { unitId: string }): number =>
  a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0;
const byJobId = (a: { jobId: string }, b: { jobId: string }): number =>
  a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0;
const byItemId = (a: { itemId: string }, b: { itemId: string }): number =>
  a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0;

/** Job level for a cumulative earned total. Never below 1, never above `MAX_JOB_LEVEL`. */
export function jobLevelFor(earned: number): number {
  let level = 1;
  for (let i = 1; i < JOB_LEVEL_THRESHOLDS.length; i += 1) {
    const threshold = JOB_LEVEL_THRESHOLDS[i];
    if (threshold === undefined || earned < threshold) break;
    level = i + 1;
  }
  return level;
}

/** Standing still needed for the next job level, or null at the cap. */
export function standingToNextJobLevel(earned: number): number | null {
  const level = jobLevelFor(earned);
  if (level >= MAX_JOB_LEVEL) return null;
  const next = JOB_LEVEL_THRESHOLDS[level];
  return next === undefined ? null : Math.max(0, next - earned);
}

export function rosterUnit(state: CampaignState, unitId: string): Unit | null {
  return state.roster.find((unit) => unit.id === unitId) ?? null;
}

export function unitProgress(state: CampaignState, unitId: string): UnitProgress | null {
  return state.progress.find((entry) => entry.unitId === unitId) ?? null;
}

/** Standing in one job. Missing entries read as zero rather than throwing. */
export function jobProgress(state: CampaignState, unitId: string, jobId: string): JobProgress {
  const found = unitProgress(state, unitId)?.jobs.find((entry) => entry.jobId === jobId);
  return found ?? { jobId, earned: 0, balance: 0 };
}

export function jobLevel(state: CampaignState, unitId: string, jobId: string): number {
  return jobLevelFor(jobProgress(state, unitId, jobId).earned);
}

/** Spendable Standing in the unit's current primary job. */
export function currentStanding(state: CampaignState, unitId: string): number {
  const unit = rosterUnit(state, unitId);
  return unit === null ? 0 : jobProgress(state, unitId, unit.jobId).balance;
}

export function learnedAbilities(state: CampaignState, unitId: string): readonly string[] {
  return unitProgress(state, unitId)?.learned ?? [];
}

export function inventoryCount(state: CampaignState, itemId: string): number {
  return state.inventory.find((stack) => stack.itemId === itemId)?.count ?? 0;
}

/**
 * The chapter's consumables, in item-id order — the satchel the party takes
 * into a battle. Equipment stock stays behind: nothing in a battle equips.
 */
export function consumableStock(
  state: CampaignState,
  items: Readonly<Record<string, Item>>,
): InventoryStack[] {
  return state.inventory
    .filter((stack) => items[stack.itemId]?.slot === "consumable" && stack.count > 0)
    .map((stack) => ({ itemId: stack.itemId, count: stack.count }));
}

/** The encounter the chapter is waiting on, or null once the list runs out. */
export function currentEncounterId(state: CampaignState, campaign: Campaign): string | null {
  return campaign.encounterIds[state.encounterIndex] ?? null;
}

export function isCampaignComplete(state: CampaignState, campaign: Campaign): boolean {
  return state.encounterIndex >= campaign.encounterIds.length;
}

export function cloneCampaign(state: CampaignState): CampaignState {
  return structuredClone(state);
}

/** Add (or subtract, with a negative count) stock, keeping the list sorted and dense. */
export function adjustInventory(inventory: InventoryStack[], itemId: string, delta: number): void {
  if (delta === 0) return;
  const existing = inventory.find((stack) => stack.itemId === itemId);
  if (existing === undefined) {
    if (delta > 0) {
      inventory.push({ itemId, count: delta });
      inventory.sort(byItemId);
    }
    return;
  }
  existing.count += delta;
  if (existing.count <= 0) {
    const index = inventory.indexOf(existing);
    inventory.splice(index, 1);
  }
}

/** Bank Standing into a unit's job, creating the job entry on first use. */
export function bankStanding(progress: UnitProgress, jobId: string, amount: number): JobProgress {
  let entry = progress.jobs.find((job) => job.jobId === jobId);
  if (entry === undefined) {
    entry = { jobId, earned: 0, balance: 0 };
    progress.jobs.push(entry);
    progress.jobs.sort(byJobId);
  }
  if (amount > 0) {
    entry.earned += amount;
    entry.balance += amount;
  }
  return entry;
}

/**
 * Open a fresh chapter. The roster is deep-copied from the unit definitions —
 * from here on `data/units` is history and `state.roster` is the truth.
 *
 * Throws on a starting roster id with no unit: campaign definitions are
 * authoring, not player input (`tests/progression/campaign-refs.test.ts`
 * guards it in CI).
 */
export function createCampaign(
  campaign: Campaign,
  units: Readonly<Record<string, Unit>>,
): CampaignState {
  const roster: Unit[] = [];
  const progress: UnitProgress[] = [];
  const bonus = campaign.startingStandingBonus ?? 0;

  for (const unitId of campaign.startingRosterUnitIds) {
    const definition = units[unitId];
    if (definition === undefined) {
      throw new Error(`campaign ${campaign.id}: unknown starting roster unit ${unitId}`);
    }
    const unit = structuredClone(definition);
    roster.push(unit);

    const learned = new Set<string>(unit.learnedAbilityIds);
    for (const id of [unit.reactionAbilityId, unit.supportAbilityId, unit.movementAbilityId]) {
      if (id !== undefined) learned.add(id);
    }
    const entry: UnitProgress = { unitId: unit.id, jobs: [], learned: [...learned].sort() };
    bankStanding(entry, unit.jobId, bonus);
    progress.push(entry);
  }

  progress.sort(byUnitId);

  const inventory: InventoryStack[] = [];
  for (const stack of campaign.startingInventory ?? []) {
    adjustInventory(inventory, stack.itemId, stack.count);
  }

  return {
    version: CAMPAIGN_STATE_VERSION,
    campaignId: campaign.id,
    roster,
    progress,
    inventory,
    fallen: [],
    encounterIndex: 0,
    completedEncounterIds: [],
  };
}
