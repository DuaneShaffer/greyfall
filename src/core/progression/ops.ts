import type { Ability, Item, Job, Unit } from "../../data/index.js";
import { allUnits, battleEncounter, battleResult } from "../selectors.js";
import type { BattleResult, GameState } from "../state/types.js";
import {
  adjustInventory,
  bankStanding,
  cloneCampaign,
  jobLevel,
  rosterUnit,
  unitProgress,
  type CampaignState,
  type FallenRecord,
  type UnitProgress,
} from "./campaign.js";
import { EQUIPMENT_SLOT_ORDER } from "./stats.js";

/**
 * Between-battle operations. Same shape as the battle engine's `applyCommand`:
 * pure `(state, args) -> { state, error }`, state returned unchanged whenever
 * `error` is set, no exceptions for anything a player can ask for.
 */

export type EquipmentSlot = (typeof EQUIPMENT_SLOT_ORDER)[number];
export type PassiveSlot = "reaction" | "support" | "movement";

export type ProgressionErrorCode =
  | "unknown-unit"
  | "unknown-ability"
  | "unknown-item"
  | "unknown-job"
  | "ability-not-learnable"
  | "already-learned"
  | "not-learned"
  | "insufficient-standing"
  | "slot-mismatch"
  | "item-not-owned"
  | "job-cannot-equip"
  | "nothing-equipped"
  | "prerequisite-not-met"
  | "same-job"
  | "secondary-is-primary";

export interface ProgressionError {
  code: ProgressionErrorCode;
  message: string;
}

export interface ProgressionResult {
  state: CampaignState;
  error: ProgressionError | null;
}

/** The content slice the ops read. A full `ContentLibrary` satisfies it. */
export interface ProgressionContent {
  jobs: Readonly<Record<string, Job>>;
  abilities: Readonly<Record<string, Ability>>;
  items: Readonly<Record<string, Item>>;
}

const fail = (
  state: CampaignState,
  code: ProgressionErrorCode,
  message: string,
): ProgressionResult => ({ state, error: { code, message } });

const ok = (state: CampaignState): ProgressionResult => ({ state, error: null });

interface Editing {
  next: CampaignState;
  unit: Unit;
  progress: UnitProgress;
}

/** Clone-then-edit: callers mutate the copy and never the argument. */
function edit(state: CampaignState, unitId: string): Editing | null {
  const next = cloneCampaign(state);
  const unit = rosterUnit(next, unitId);
  const progress = unitProgress(next, unitId);
  if (unit === null || progress === null) return null;
  return { next, unit, progress };
}

/**
 * Roster `learnedAbilityIds` is the FFT skillset projection: the action
 * abilities the unit has paid for whose job is its current primary or
 * secondary. The engine reads that field directly, so a job change is what
 * takes a skillset off the menu — the purchase itself is never lost.
 */
export function projectSkillsets(
  unit: Unit,
  progress: UnitProgress,
  content: ProgressionContent,
): void {
  const jobIds = new Set<string>([unit.jobId]);
  if (unit.secondaryJobId !== undefined) jobIds.add(unit.secondaryJobId);
  unit.learnedAbilityIds = progress.learned
    .filter((id) => {
      const ability = content.abilities[id];
      return ability !== undefined && ability.slot === "action" && jobIds.has(ability.jobId);
    })
    .sort();
}

// --- learning ---------------------------------------------------------------

/**
 * Spend the unit's Standing in its current job on one of that job's learnable
 * abilities. Standing is per job: a Conduit cannot spend Enforcer Standing.
 */
export function learnAbility(
  state: CampaignState,
  unitId: string,
  abilityId: string,
  content: ProgressionContent,
): ProgressionResult {
  const editing = edit(state, unitId);
  if (editing === null) return fail(state, "unknown-unit", `${unitId} is not on the roster`);
  const { next, unit, progress } = editing;

  const ability = content.abilities[abilityId];
  if (ability === undefined) return fail(state, "unknown-ability", `unknown ability ${abilityId}`);
  if (progress.learned.includes(abilityId)) {
    return fail(state, "already-learned", `${unit.name} already knows ${ability.name}`);
  }

  const job = content.jobs[unit.jobId];
  if (job === undefined) return fail(state, "unknown-job", `unknown job ${unit.jobId}`);
  if (!job.learnableAbilityIds.includes(abilityId)) {
    return fail(
      state,
      "ability-not-learnable",
      `${ability.name} is not on the ${job.name} ability list`,
    );
  }

  const banked = bankStanding(progress, unit.jobId, 0);
  if (banked.balance < ability.standingCost) {
    return fail(
      state,
      "insufficient-standing",
      `Needs ${ability.standingCost - banked.balance} more Standing`,
    );
  }

  banked.balance -= ability.standingCost;
  progress.learned.push(abilityId);
  progress.learned.sort();
  projectSkillsets(unit, progress, content);
  return ok(next);
}

// --- equipment --------------------------------------------------------------

const canJobEquip = (job: Job, item: Item): boolean =>
  item.equipTags.some((tag) => job.equipTags.includes(tag));

export function equipItem(
  state: CampaignState,
  unitId: string,
  slot: EquipmentSlot,
  itemId: string,
  content: ProgressionContent,
): ProgressionResult {
  const editing = edit(state, unitId);
  if (editing === null) return fail(state, "unknown-unit", `${unitId} is not on the roster`);
  const { next, unit } = editing;

  const item = content.items[itemId];
  if (item === undefined) return fail(state, "unknown-item", `unknown item ${itemId}`);
  if (item.slot !== slot) {
    return fail(state, "slot-mismatch", `${item.name} does not go in the ${slot} slot`);
  }

  const job = content.jobs[unit.jobId];
  if (job === undefined) return fail(state, "unknown-job", `unknown job ${unit.jobId}`);
  if (!canJobEquip(job, item)) {
    return fail(state, "job-cannot-equip", `${job.name} cannot carry ${item.name}`);
  }

  const current = unit.equipment[slot];
  if (current === itemId) return ok(next);

  const stocked = next.inventory.find((entry) => entry.itemId === itemId);
  if (stocked === undefined) return fail(state, "item-not-owned", `No ${item.name} in stock`);

  adjustInventory(next.inventory, itemId, -1);
  if (current !== undefined) adjustInventory(next.inventory, current, 1);
  unit.equipment[slot] = itemId;
  return ok(next);
}

export function unequipItem(
  state: CampaignState,
  unitId: string,
  slot: EquipmentSlot,
): ProgressionResult {
  const editing = edit(state, unitId);
  if (editing === null) return fail(state, "unknown-unit", `${unitId} is not on the roster`);
  const { next, unit } = editing;

  const current = unit.equipment[slot];
  if (current === undefined) return fail(state, "nothing-equipped", `The ${slot} slot is empty`);

  adjustInventory(next.inventory, current, 1);
  delete unit.equipment[slot];
  return ok(next);
}

// --- ability slots ----------------------------------------------------------

const PASSIVE_FIELDS: Readonly<Record<PassiveSlot, "reactionAbilityId" | "supportAbilityId" | "movementAbilityId">> = {
  reaction: "reactionAbilityId",
  support: "supportAbilityId",
  movement: "movementAbilityId",
};

/**
 * Slot a learned reaction/support/movement ability. Unlike action skillsets
 * these are not job-gated once bought — FFT's rule, and the reason R/S/M
 * shopping across jobs is the build game.
 */
export function setAbilitySlot(
  state: CampaignState,
  unitId: string,
  slot: PassiveSlot,
  abilityId: string | null,
  content: ProgressionContent,
): ProgressionResult {
  const editing = edit(state, unitId);
  if (editing === null) return fail(state, "unknown-unit", `${unitId} is not on the roster`);
  const { next, unit, progress } = editing;
  const field = PASSIVE_FIELDS[slot];

  if (abilityId === null) {
    delete unit[field];
    return ok(next);
  }

  const ability = content.abilities[abilityId];
  if (ability === undefined) return fail(state, "unknown-ability", `unknown ability ${abilityId}`);
  if (ability.slot !== slot) {
    return fail(state, "slot-mismatch", `${ability.name} is not a ${slot} ability`);
  }
  if (!progress.learned.includes(abilityId)) {
    return fail(state, "not-learned", `${unit.name} has not learned ${ability.name}`);
  }

  unit[field] = abilityId;
  return ok(next);
}

// --- jobs -------------------------------------------------------------------

/** First unmet prerequisite of `job` for this unit, or null when it is open. */
export function unmetPrerequisite(
  state: CampaignState,
  unitId: string,
  job: Job,
): { jobId: string; required: number; actual: number } | null {
  for (const requiredJobId of Object.keys(job.prerequisites).sort()) {
    const required = job.prerequisites[requiredJobId];
    if (required === undefined) continue;
    const actual = jobLevel(state, unitId, requiredJobId);
    if (actual < required) return { jobId: requiredJobId, required, actual };
  }
  return null;
}

function prerequisiteError(
  state: CampaignState,
  unitId: string,
  job: Job,
  content: ProgressionContent,
): ProgressionError | null {
  const unmet = unmetPrerequisite(state, unitId, job);
  if (unmet === null) return null;
  const name = content.jobs[unmet.jobId]?.name ?? unmet.jobId;
  return {
    code: "prerequisite-not-met",
    message: `${job.name} needs ${name} level ${unmet.required} (has ${unmet.actual})`,
  };
}

/**
 * Change primary job. Kit the new job cannot carry goes back to stock, the
 * secondary is cleared if it collided, and the action skillset is re-projected.
 */
export function changeJob(
  state: CampaignState,
  unitId: string,
  jobId: string,
  content: ProgressionContent,
): ProgressionResult {
  const editing = edit(state, unitId);
  if (editing === null) return fail(state, "unknown-unit", `${unitId} is not on the roster`);
  const { next, unit, progress } = editing;

  const job = content.jobs[jobId];
  if (job === undefined) return fail(state, "unknown-job", `unknown job ${jobId}`);
  if (unit.jobId === jobId) return fail(state, "same-job", `${unit.name} is already a ${job.name}`);

  const blocked = prerequisiteError(state, unitId, job, content);
  if (blocked !== null) return { state, error: blocked };

  unit.jobId = jobId;
  if (unit.secondaryJobId === jobId) delete unit.secondaryJobId;

  for (const slot of EQUIPMENT_SLOT_ORDER) {
    const itemId = unit.equipment[slot];
    if (itemId === undefined) continue;
    const item = content.items[itemId];
    if (item !== undefined && canJobEquip(job, item)) continue;
    adjustInventory(next.inventory, itemId, 1);
    delete unit.equipment[slot];
  }

  bankStanding(progress, jobId, 0);
  projectSkillsets(unit, progress, content);
  return ok(next);
}

/** Set (or clear, with null) the borrowed secondary skillset. */
export function setSecondaryJob(
  state: CampaignState,
  unitId: string,
  jobId: string | null,
  content: ProgressionContent,
): ProgressionResult {
  const editing = edit(state, unitId);
  if (editing === null) return fail(state, "unknown-unit", `${unitId} is not on the roster`);
  const { next, unit, progress } = editing;

  if (jobId === null) {
    delete unit.secondaryJobId;
    projectSkillsets(unit, progress, content);
    return ok(next);
  }

  const job = content.jobs[jobId];
  if (job === undefined) return fail(state, "unknown-job", `unknown job ${jobId}`);
  if (unit.jobId === jobId) {
    return fail(state, "secondary-is-primary", `${job.name} is already the primary job`);
  }

  const blocked = prerequisiteError(state, unitId, job, content);
  if (blocked !== null) return { state, error: blocked };

  unit.secondaryJobId = jobId;
  projectSkillsets(unit, progress, content);
  return ok(next);
}

// --- battle results ---------------------------------------------------------

export interface StandingAward {
  unitId: string;
  jobId: string;
  amount: number;
}

export interface BattleOutcome {
  result: BattleResult;
  encounterId: string;
  standing: StandingAward[];
  fallen: FallenRecord[];
  /** True when the encounter index moved on — a first win, not a replay. */
  advanced: boolean;
}

export interface BattleResultsApplied {
  state: CampaignState;
  outcome: BattleOutcome;
}

/**
 * Fold a finished battle back into the chapter.
 *
 * **A loss changes nothing.** No Standing banked, nobody lost, no progress: the
 * player retries the encounter from the same between-battle state. That keeps
 * permadeath from compounding into an unwinnable run and matches how a tactics
 * player actually treats a wipe.
 *
 * **A win banks and buries.** Every deployed unit's `standingEarned` goes into
 * the job it fought in, then every unit still downed when the dust settled is
 * struck from the roster into `fallen` — the dead stay dead
 * (CREATIVE_BIBLE §5.4). Their kit is recovered to stock; they are not.
 *
 * Replays of an already-won encounter bank and bury as usual but do not
 * advance the index.
 */
export function applyBattleResults(
  state: CampaignState,
  final: GameState,
): BattleResultsApplied {
  const result = battleResult(final);
  const encounterId = battleEncounter(final).id;

  if (result === null || result === "loss") {
    return {
      state,
      outcome: {
        result: result ?? "loss",
        encounterId,
        standing: [],
        fallen: [],
        advanced: false,
      },
    };
  }

  const next = cloneCampaign(state);
  const standing: StandingAward[] = [];
  const fallen: FallenRecord[] = [];

  for (const battleUnit of allUnits(final)) {
    if (battleUnit.team !== "player") continue;
    const progress = unitProgress(next, battleUnit.id);
    const unit = rosterUnit(next, battleUnit.id);
    if (progress === null || unit === null) continue;

    if (battleUnit.standingEarned > 0) {
      bankStanding(progress, unit.jobId, battleUnit.standingEarned);
      standing.push({ unitId: unit.id, jobId: unit.jobId, amount: battleUnit.standingEarned });
    }
    if (!battleUnit.downed) continue;

    fallen.push({
      unitId: unit.id,
      name: unit.name,
      jobId: unit.jobId,
      level: unit.level,
      encounterId,
    });
    for (const slot of EQUIPMENT_SLOT_ORDER) {
      const itemId = unit.equipment[slot];
      if (itemId !== undefined) adjustInventory(next.inventory, itemId, 1);
    }
    next.roster = next.roster.filter((entry) => entry.id !== unit.id);
    next.progress = next.progress.filter((entry) => entry.unitId !== unit.id);
  }

  next.fallen.push(...fallen);

  const advanced = !next.completedEncounterIds.includes(encounterId);
  if (advanced) {
    next.completedEncounterIds.push(encounterId);
    next.encounterIndex += 1;
  }

  return { state: next, outcome: { result, encounterId, standing, fallen, advanced } };
}
