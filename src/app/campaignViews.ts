// THE UI SEAM, between-battle side. Same rule as `viewmodels.ts`: `src/ui` may
// not import `src/core`, so every roster/learning/equipment/job/formation view
// model is assembled here from `CampaignState` plus the content library.
//
// `src/ui/mock.ts` stays the harness's fixture source; this is the app path.

import {
  consumableStock,
  deriveStats,
  equippedItems,
  inventoryCount,
  jobLevel,
  jobProgress,
  learnedAbilities,
  rosterUnit,
  standingToNextJobLevel,
  unmetPrerequisite,
  type BattleOutcome,
  type CampaignState,
  type ContentLibrary,
  type DerivedStats,
  type FallenRecord,
} from "../core/index.js";
import type { Ability, Campaign, Item, Job, Unit } from "../data/index.js";
import {
  EQUIP_SLOTS,
  STAT_LABELS,
  type AbilityView,
  type BattleResultsView,
  type ChapterCloseView,
  type DeploymentCandidateView,
  type DeploymentSlotView,
  type DeploymentView,
  type EquipSlot,
  type EquipSlotView,
  type EquipmentView,
  type FallenEntryView,
  type ItemEntryView,
  type ItemOptionView,
  type JobOptionView,
  type JobsView,
  type LearnableView,
  type LearningView,
  type PartyView,
  type RosterEntryView,
  type StandingAwardView,
  type StatLineView,
  type UnitSheetView,
  type UnitView,
} from "../ui/index.js";

/**
 * Content the between-battle screens read. A full `ContentLibrary` satisfies
 * it. `encounters` is optional because only the record screens need it, and
 * they degrade to the encounter id when a bench library has none.
 */
export type CampaignContent = Pick<ContentLibrary, "jobs" | "abilities" | "items"> &
  Partial<Pick<ContentLibrary, "encounters">>;

const jobOf = (content: CampaignContent, unit: Unit): Job | undefined => content.jobs[unit.jobId];

const jobName = (content: CampaignContent, jobId: string): string =>
  content.jobs[jobId]?.name ?? jobId;

const encounterName = (content: CampaignContent, encounterId: string): string =>
  content.encounters?.[encounterId]?.name ?? encounterId;

const fallenView = (content: CampaignContent, entry: FallenRecord): FallenEntryView => ({
  unitId: entry.unitId,
  name: entry.name,
  jobName: jobName(content, entry.jobId),
  level: entry.level,
  encounterName: encounterName(content, entry.encounterId),
});

/** Support/movement abilities the unit has slotted, in the stat-mod order. */
function slottedPassives(content: CampaignContent, unit: Unit): Ability[] {
  const out: Ability[] = [];
  for (const id of [unit.supportAbilityId, unit.movementAbilityId]) {
    if (id === undefined) continue;
    const ability = content.abilities[id];
    if (ability !== undefined) out.push(ability);
  }
  return out;
}

/** Out-of-battle stats: the same `deriveStats` the engine snapshots at deploy. */
export function campaignStats(content: CampaignContent, unit: Unit): DerivedStats | null {
  const job = jobOf(content, unit);
  if (job === undefined) return null;
  return deriveStats(unit, job, equippedItems(unit, content.items), slottedPassives(content, unit));
}

/**
 * A roster unit as the shared `UnitView` shape. Between battles there is no
 * battlefield: HP and Charge read full, CT is zero, and nothing is downed —
 * the downed are gone (see `applyBattleResults`).
 */
export function campaignUnitView(
  state: CampaignState,
  content: CampaignContent,
  unitId: string,
): UnitView | null {
  const unit = rosterUnit(state, unitId);
  if (unit === null) return null;
  const stats = campaignStats(content, unit);
  if (stats === null) return null;
  return {
    id: unit.id,
    name: unit.name,
    jobId: unit.jobId,
    jobName: jobName(content, unit.jobId),
    level: unit.level,
    team: "player",
    ...(unit.portraitId === undefined ? {} : { portraitId: unit.portraitId }),
    hp: stats.hp,
    maxHp: stats.hp,
    charge: stats.charge,
    maxCharge: stats.charge,
    ct: 0,
    facing: "north",
    statuses: [],
    disposition: unit.disposition,
    downed: false,
  };
}

function abilityViewOf(ability: Ability): AbilityView {
  return {
    id: ability.id,
    name: ability.name,
    description: ability.description,
    slot: ability.slot,
    chargeCost: ability.slot === "action" ? ability.chargeCost : 0,
    castSpeed: ability.slot === "action" ? ability.castSpeed : null,
    standingCost: ability.standingCost,
  };
}

export function campaignPartyView(
  state: CampaignState,
  content: CampaignContent,
  deployedLimit: number,
): PartyView {
  const members: RosterEntryView[] = [];
  for (const unit of state.roster) {
    const stats = campaignStats(content, unit);
    if (stats === null) continue;
    const level = jobLevel(state, unit.id, unit.jobId);
    members.push({
      unitId: unit.id,
      name: unit.name,
      jobName: jobName(content, unit.jobId),
      level: unit.level,
      ...(unit.portraitId === undefined ? {} : { portraitId: unit.portraitId }),
      hp: stats.hp,
      maxHp: stats.hp,
      standing: jobProgress(state, unit.id, unit.jobId).balance,
      // The row already prints the job beside the name; the job *level* is the
      // fact it does not carry, and it belongs to the record pane.
      jobLevel: level,
    });
  }
  return {
    members,
    deployedLimit,
    fallen: state.fallen.map((entry) => fallenView(content, entry)),
  };
}

function equipSlotViews(content: CampaignContent, unit: Unit): EquipSlotView[] {
  return EQUIP_SLOTS.map((slot: EquipSlot) => {
    const itemId = unit.equipment[slot] ?? null;
    const item = itemId === null ? null : (content.items[itemId] ?? null);
    return {
      slot,
      itemId,
      itemName: item?.name ?? null,
      summary: item === null ? "—" : itemSummary(item),
    };
  });
}

export function campaignUnitSheetView(
  state: CampaignState,
  content: CampaignContent,
  unitId: string,
): UnitSheetView | null {
  const unit = rosterUnit(state, unitId);
  const view = campaignUnitView(state, content, unitId);
  const stats = unit === null ? null : campaignStats(content, unit);
  if (unit === null || view === null || stats === null) return null;

  const statLines: StatLineView[] = (["hp", "charge", "speed", "phys", "mag"] as const).map(
    (key) => ({ key, label: STAT_LABELS[key], value: stats[key] }),
  );

  const learned = learnedAbilities(state, unitId)
    .map((id) => content.abilities[id])
    .filter((ability): ability is Ability => ability !== undefined)
    .map(abilityViewOf);

  const passives = (["reaction", "support", "movement"] as const).map((slot) => {
    const id =
      slot === "reaction"
        ? unit.reactionAbilityId
        : slot === "support"
          ? unit.supportAbilityId
          : unit.movementAbilityId;
    const ability = id === undefined ? undefined : content.abilities[id];
    return { slot, abilityName: ability?.name ?? null };
  });

  return {
    unit: view,
    standing: jobProgress(state, unitId, unit.jobId).balance,
    stats: statLines,
    move: stats.move,
    jump: stats.jump,
    evade: stats.evade,
    equipment: equipSlotViews(content, unit),
    learnedAbilities: learned,
    passives,
  };
}

export function campaignLearningView(
  state: CampaignState,
  content: CampaignContent,
  unitId: string,
): LearningView | null {
  const unit = rosterUnit(state, unitId);
  if (unit === null) return null;
  const job = jobOf(content, unit);
  if (job === undefined) return null;
  const known = new Set(learnedAbilities(state, unitId));

  const entries: LearnableView[] = [];
  for (const abilityId of job.learnableAbilityIds) {
    const ability = content.abilities[abilityId];
    if (ability === undefined) continue;
    entries.push({
      abilityId,
      name: ability.name,
      description: ability.description,
      slot: ability.slot,
      standingCost: ability.standingCost,
      chargeCost: ability.slot === "action" ? ability.chargeCost : 0,
      learned: known.has(abilityId),
    });
  }

  return {
    unitId,
    unitName: unit.name,
    jobName: job.name,
    standing: jobProgress(state, unitId, unit.jobId).balance,
    entries,
  };
}

const DELTA_KEYS = ["hp", "charge", "speed", "phys", "mag", "move", "jump", "evade"] as const;
type DeltaKey = (typeof DELTA_KEYS)[number];

function statDeltas(
  before: DerivedStats,
  after: DerivedStats,
): { key: DeltaKey; label: string; delta: number }[] {
  const out: { key: DeltaKey; label: string; delta: number }[] = [];
  for (const key of DELTA_KEYS) {
    const delta = after[key] - before[key];
    if (delta !== 0) out.push({ key, label: STAT_LABELS[key], delta });
  }
  return out;
}

const itemSummary = (item: Item): string =>
  item.slot === "weapon" ? `Power ${item.power}` : item.description;

/**
 * The chapter's consumables. One shared pile: it is not per-unit kit, so it
 * reads the same on every unit's equipment screen and on the formation screen.
 */
export function campaignSatchelView(
  state: CampaignState,
  content: CampaignContent,
): ItemEntryView[] {
  const out: ItemEntryView[] = [];
  for (const stack of consumableStock(state, content.items)) {
    const item = content.items[stack.itemId];
    if (item === undefined) continue;
    out.push({
      itemId: item.id,
      name: item.name,
      description: item.description,
      count: stack.count,
    });
  }
  return out;
}

export function campaignEquipmentView(
  state: CampaignState,
  content: CampaignContent,
  unitId: string,
): EquipmentView | null {
  const unit = rosterUnit(state, unitId);
  if (unit === null) return null;
  const job = jobOf(content, unit);
  const baseline = campaignStats(content, unit);
  if (job === undefined || baseline === null) return null;

  const options = {} as Record<EquipSlot, ItemOptionView[]>;
  for (const slot of EQUIP_SLOTS) options[slot] = [];

  const candidateIds = new Set<string>();
  for (const stack of state.inventory) candidateIds.add(stack.itemId);
  for (const slot of EQUIP_SLOTS) {
    const equipped = unit.equipment[slot];
    if (equipped !== undefined) candidateIds.add(equipped);
  }

  for (const itemId of [...candidateIds].sort()) {
    const item = content.items[itemId];
    if (item === undefined || item.slot === "consumable") continue;
    const slot: EquipSlot = item.slot;
    const equipped = unit.equipment[slot] === itemId;
    const compatible = item.equipTags.some((tag) => job.equipTags.includes(tag));

    const equipment: Unit["equipment"] = { ...unit.equipment };
    equipment[slot] = itemId;
    const after = campaignStats(content, { ...unit, equipment });

    const reason = !compatible
      ? `${job.name} cannot carry it`
      : !equipped && inventoryCount(state, itemId) === 0
        ? "None in stock"
        : undefined;

    options[slot].push({
      itemId,
      name: item.name,
      description: item.description,
      slot,
      equipTags: [...item.equipTags],
      equipped,
      summary: itemSummary(item),
      deltas: after === null ? [] : statDeltas(baseline, after),
      ...(reason === undefined ? {} : { unavailableReason: reason }),
    });
  }

  return {
    unitId,
    unitName: unit.name,
    jobName: job.name,
    jobEquipTags: [...job.equipTags],
    slots: equipSlotViews(content, unit),
    options,
    satchel: campaignSatchelView(state, content),
  };
}

export function campaignJobsView(
  state: CampaignState,
  content: CampaignContent,
  unitId: string,
): JobsView | null {
  const unit = rosterUnit(state, unitId);
  if (unit === null) return null;

  const options: JobOptionView[] = [];
  for (const jobId of Object.keys(content.jobs).sort()) {
    const job = content.jobs[jobId];
    if (job === undefined) continue;
    const unmet = unmetPrerequisite(state, unitId, job);
    const reason =
      unmet === null
        ? undefined
        : `Needs ${jobName(content, unmet.jobId)} level ${unmet.required} (has ${unmet.actual})`;
    options.push({
      jobId,
      name: job.name,
      description: job.description,
      jobLevel: jobLevel(state, unitId, jobId),
      standing: jobProgress(state, unitId, jobId).balance,
      isPrimary: unit.jobId === jobId,
      isSecondary: unit.secondaryJobId === jobId,
      ...(reason === undefined ? {} : { lockedReason: reason }),
    });
  }

  return {
    unitId,
    unitName: unit.name,
    primaryJobName: jobName(content, unit.jobId),
    secondaryJobName: unit.secondaryJobId === undefined ? null : jobName(content, unit.secondaryJobId),
    options,
  };
}

/** How much more Standing the unit's current job needs to level, for HUD copy. */
export function standingToNextLevel(state: CampaignState, unitId: string): number | null {
  const unit = rosterUnit(state, unitId);
  if (unit === null) return null;
  return standingToNextJobLevel(jobProgress(state, unitId, unit.jobId).earned);
}

export interface DeploymentInputs {
  encounterId: string;
  encounterName: string;
  maxDeployed: number;
  deploymentTiles: readonly { x: number; y: number }[];
  /** Unit id per tile index, or null for an empty tile. */
  assignments: readonly (string | null)[];
}

export function campaignDeploymentView(
  state: CampaignState,
  content: CampaignContent,
  inputs: DeploymentInputs,
): DeploymentView {
  const tiles = inputs.deploymentTiles.slice(0, inputs.maxDeployed);
  const slots: DeploymentSlotView[] = tiles.map((tile, index) => {
    const unitId = inputs.assignments[index] ?? null;
    const unit = unitId === null ? null : rosterUnit(state, unitId);
    return { tile: { ...tile }, unitId, unitName: unit?.name ?? null };
  });

  const assignedIds = new Set(slots.map((slot) => slot.unitId).filter((id): id is string => id !== null));
  const full = assignedIds.size >= tiles.length;

  const candidates: DeploymentCandidateView[] = [];
  for (const unit of state.roster) {
    const stats = campaignStats(content, unit);
    if (stats === null) continue;
    const assigned = assignedIds.has(unit.id);
    candidates.push({
      unitId: unit.id,
      name: unit.name,
      jobName: jobName(content, unit.jobId),
      level: unit.level,
      hp: stats.hp,
      maxHp: stats.hp,
      assigned,
      ...(assigned || !full ? {} : { unavailableReason: "No deployment tile free" }),
    });
  }

  const deployed = assignedIds.size;
  return {
    encounterId: inputs.encounterId,
    encounterName: inputs.encounterName,
    maxDeployed: tiles.length,
    candidates,
    slots,
    satchel: campaignSatchelView(state, content),
    canConfirm: deployed > 0,
    ...(deployed > 0 ? {} : { blockedReason: "Deploy at least one unit" }),
  };
}

// --- the record screens -----------------------------------------------------

/** Every job level the chapter has banked, across every unit still on it. */
function bankedStanding(state: CampaignState): number {
  return state.progress.reduce(
    (total, unit) => total + unit.jobs.reduce((sum, job) => sum + job.earned, 0),
    0,
  );
}

/**
 * The battle's filed record, read from the campaign either side of
 * `applyBattleResults`: `before` still holds the units the win struck off, so
 * the dead can be named and their job levels compared.
 */
export function campaignBattleResultsView(
  before: CampaignState,
  after: CampaignState,
  content: CampaignContent,
  outcome: BattleOutcome,
): BattleResultsView {
  const struck = new Set(outcome.fallen.map((entry) => entry.unitId));
  const standing: StandingAwardView[] = outcome.standing.map((award) => {
    const unit = rosterUnit(before, award.unitId);
    const levelBefore = jobLevel(before, award.unitId, award.jobId);
    const levelAfter = struck.has(award.unitId)
      ? levelBefore
      : jobLevel(after, award.unitId, award.jobId);
    return {
      unitId: award.unitId,
      name: unit?.name ?? award.unitId,
      jobName: jobName(content, award.jobId),
      amount: award.amount,
      jobLevel: levelAfter,
      jobLevelsGained: levelAfter - levelBefore,
      struck: struck.has(award.unitId),
    };
  });

  const won = outcome.result === "win";
  return {
    result: won ? "win" : "loss",
    encounterId: outcome.encounterId,
    encounterName: encounterName(content, outcome.encounterId),
    headline: won ? "Field Held" : "Line Broken",
    note: !won
      ? "The line did not hold. Nothing was banked and nothing was lost."
      : outcome.advanced
        ? "Engagement closed and entered on the chapter."
        : "Returned to a closed engagement; the chapter stands where it stood.",
    standing,
    standingTotal: standing.reduce((total, award) => total + award.amount, 0),
    fallen: outcome.fallen.map((entry) => fallenView(content, entry)),
    consumed: outcome.consumed.map((stack) => ({
      itemId: stack.itemId,
      name: content.items[stack.itemId]?.name ?? stack.itemId,
      count: stack.count,
    })),
    advanced: outcome.advanced,
  };
}

/** What the chapter has to show for itself once its last engagement is won. */
export function campaignChapterCloseView(
  state: CampaignState,
  campaign: Pick<Campaign, "name">,
  content: CampaignContent,
): ChapterCloseView {
  return {
    chapterName: campaign.name,
    note: "No further engagements are on the docket.",
    engagements: state.completedEncounterIds.map((id) => ({
      encounterId: id,
      name: encounterName(content, id),
    })),
    standingTotal: bankedStanding(state),
    survivors: state.roster.map((unit) => ({
      unitId: unit.id,
      name: unit.name,
      jobName: jobName(content, unit.jobId),
      level: unit.level,
    })),
    fallen: state.fallen.map((entry) => fallenView(content, entry)),
  };
}
