// The between-battle hub. Owns the one authoritative `CampaignState`, routes
// `ProgressionIntents` into the pure ops in `core/progression`, and hands out
// the view models the roster screens draw.
//
// Headless on purpose — no DOM here. `betweenBattles.ts` mounts screens over
// this, `campaignRunner.ts` drives the chapter loop with it, and tests build it
// straight from content off disk.

import {
  applyBattleResults,
  changeJob,
  consumableStock,
  currentEncounterId,
  equipItem,
  facingToward,
  learnAbility,
  manhattan,
  rosterUnit,
  setAbilitySlot,
  setSecondaryJob,
  unequipItem,
  type BattleOutcome,
  type CampaignState,
  type ContentLibrary,
  type Deployment,
  type EquipmentSlot,
  type GameState,
  type InventoryStack,
  type PassiveSlot,
  type ProgressionError,
  type ProgressionResult,
} from "../core/index.js";
import type { Campaign, Encounter, Facing, GameMap, TileCoord, Unit } from "../data/index.js";
import type {
  BattleResultsView,
  ChapterCloseView,
  DeployOppositionView,
  DeploymentView,
  EquipmentView,
  JobsView,
  LearningView,
  PartyView,
  ProgressionIntents,
  UnitSheetView,
} from "../ui/index.js";
import {
  campaignBattleResultsView,
  campaignChapterCloseView,
  campaignDeploymentView,
  campaignEquipmentView,
  campaignJobsView,
  campaignLearningView,
  campaignOppositionView,
  campaignPartyView,
  campaignUnitSheetView,
} from "./campaignViews.js";

export interface CampaignSessionOptions {
  campaign: Campaign;
  content: ContentLibrary;
  state: CampaignState;
  /** Fired after any op that actually changed state — the auto-save hook. */
  onChange?: (state: CampaignState) => void;
  /** Fired when an op was refused; the shell turns it into a toast. */
  onError?: (error: ProgressionError) => void;
}

export interface PendingDeployment {
  encounterId: string;
  encounter: Encounter;
  map: GameMap;
  /** Unit id per deployment tile index, or null for an empty tile. */
  assignments: (string | null)[];
}

/** Deployed units start squared up to the closest of the enemy's positions. */
const facingTowardNearest = (from: TileCoord, targets: TileCoord[]): Facing => {
  let best: TileCoord | null = null;
  let bestDistance = Infinity;
  for (const target of targets) {
    const distance = manhattan(from, target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = target;
    }
  }
  return best === null ? "north" : facingToward(from, best);
};

export class CampaignSession {
  readonly campaign: Campaign;
  readonly content: ContentLibrary;

  private campaignState: CampaignState;
  private pending: PendingDeployment | null = null;
  private readonly onChange: (state: CampaignState) => void;
  private readonly onError: (error: ProgressionError) => void;

  constructor(options: CampaignSessionOptions) {
    this.campaign = options.campaign;
    this.content = options.content;
    this.campaignState = options.state;
    this.onChange = options.onChange ?? ((): void => undefined);
    this.onError = options.onError ?? ((): void => undefined);
  }

  get state(): CampaignState {
    return this.campaignState;
  }

  get deployment(): PendingDeployment | null {
    return this.pending;
  }

  /** Swap in a loaded save. Any staged formation is discarded. */
  replaceState(state: CampaignState): void {
    this.campaignState = state;
    this.pending = null;
    this.onChange(this.campaignState);
  }

  // --- encounters -----------------------------------------------------------

  /** The encounter the chapter is waiting on, whether or not content has it. */
  expectedEncounterId(): string | null {
    return currentEncounterId(this.campaignState, this.campaign);
  }

  /**
   * The next engagement to fight, or null once the chapter has run out of them.
   * Null is the end of the chapter and is meant to be reached: replaying a
   * finished engagement is `completedEncounters()`, an explicit choice, never a
   * fallback that quietly hides the ending.
   */
  playableEncounterId(): string | null {
    const expected = this.expectedEncounterId();
    if (expected !== null && this.content.encounters[expected] !== undefined) return expected;
    return null;
  }

  /** Won engagements the player may return to, in the order they were won. */
  completedEncounters(): { id: string; name: string }[] {
    const out: { id: string; name: string }[] = [];
    for (const id of this.campaignState.completedEncounterIds) {
      const encounter = this.content.encounters[id];
      if (encounter !== undefined) out.push({ id, name: encounter.name });
    }
    return out;
  }

  /** True when the chapter has run out of authored encounters, not out of story. */
  awaitingContent(): boolean {
    const expected = this.expectedEncounterId();
    return expected !== null && this.content.encounters[expected] === undefined;
  }

  // --- views ----------------------------------------------------------------

  partyView(): PartyView {
    const encounterId = this.pending?.encounterId ?? this.playableEncounterId();
    const encounter = encounterId === null ? undefined : this.content.encounters[encounterId];
    const limit = encounter?.maxDeployedUnits ?? this.campaignState.roster.length;
    // Membership comes off the staged formation, so the roster and the formation
    // screen can never disagree about who is going out.
    const deployed = (this.pending?.assignments ?? []).filter((id): id is string => id !== null);
    return campaignPartyView(this.campaignState, this.content, limit, deployed);
  }

  unitSheetView(unitId: string): UnitSheetView | null {
    return campaignUnitSheetView(this.campaignState, this.content, unitId);
  }

  learningView(unitId: string): LearningView | null {
    return campaignLearningView(this.campaignState, this.content, unitId);
  }

  equipmentView(unitId: string): EquipmentView | null {
    return campaignEquipmentView(this.campaignState, this.content, unitId);
  }

  jobsView(unitId: string): JobsView | null {
    return campaignJobsView(this.campaignState, this.content, unitId);
  }

  /**
   * The battle's record. `before` is the state the battle was fought from —
   * the fallen are still on it, which is the only place their names and job
   * levels survive.
   */
  battleResultsView(before: CampaignState, outcome: BattleOutcome): BattleResultsView {
    return campaignBattleResultsView(before, this.campaignState, this.content, outcome);
  }

  chapterCloseView(): ChapterCloseView {
    return campaignChapterCloseView(this.campaignState, this.campaign, this.content);
  }

  /** The other side of the board the staged formation is being read against. */
  oppositionView(): DeployOppositionView[] {
    if (this.pending === null) return [];
    return campaignOppositionView(this.content, this.pending.encounter);
  }

  deploymentView(): DeploymentView | null {
    if (this.pending === null) return null;
    return campaignDeploymentView(this.campaignState, this.content, {
      encounterId: this.pending.encounterId,
      encounterName: this.pending.encounter.name,
      maxDeployed: this.pending.encounter.maxDeployedUnits,
      deploymentTiles: this.pending.map.deploymentTiles,
      assignments: this.pending.assignments,
    });
  }

  // --- operations -----------------------------------------------------------

  private commit(result: ProgressionResult): boolean {
    if (result.error !== null) {
      this.onError(result.error);
      return false;
    }
    this.campaignState = result.state;
    this.pruneAssignments();
    this.onChange(this.campaignState);
    return true;
  }

  learnAbility(unitId: string, abilityId: string): boolean {
    return this.commit(learnAbility(this.campaignState, unitId, abilityId, this.content));
  }

  equipItem(unitId: string, slot: EquipmentSlot, itemId: string | null): boolean {
    return this.commit(
      itemId === null
        ? unequipItem(this.campaignState, unitId, slot)
        : equipItem(this.campaignState, unitId, slot, itemId, this.content),
    );
  }

  setAbilitySlot(unitId: string, slot: PassiveSlot, abilityId: string | null): boolean {
    return this.commit(
      setAbilitySlot(this.campaignState, unitId, slot, abilityId, this.content),
    );
  }

  changeJob(unitId: string, jobId: string): boolean {
    return this.commit(changeJob(this.campaignState, unitId, jobId, this.content));
  }

  setSecondaryJob(unitId: string, jobId: string | null): boolean {
    return this.commit(setSecondaryJob(this.campaignState, unitId, jobId, this.content));
  }

  // --- formation ------------------------------------------------------------

  /**
   * Stage a formation for `encounterId`, pre-filling the deployment tiles from
   * the top of the roster so a player who never opens the screen still fields
   * a party.
   */
  beginDeployment(encounterId: string): PendingDeployment | null {
    const encounter = this.content.encounters[encounterId];
    if (encounter === undefined) return null;
    const map = this.content.maps[encounter.mapId];
    if (map === undefined) return null;

    const tileCount = Math.min(encounter.maxDeployedUnits, map.deploymentTiles.length);
    const assignments: (string | null)[] = new Array<string | null>(tileCount).fill(null);
    for (let i = 0; i < tileCount; i += 1) {
      assignments[i] = this.campaignState.roster[i]?.id ?? null;
    }

    this.pending = { encounterId, encounter, map, assignments };
    return this.pending;
  }

  cancelDeployment(): void {
    this.pending = null;
  }

  /** Drop a unit on the first free tile, or pull it back off if it is already out. */
  toggleDeployment(unitId: string): boolean {
    if (this.pending === null) return false;
    if (rosterUnit(this.campaignState, unitId) === null) return false;
    const assignments = this.pending.assignments;
    const at = assignments.indexOf(unitId);
    if (at !== -1) {
      assignments[at] = null;
      return true;
    }
    const free = assignments.indexOf(null);
    if (free === -1) return false;
    assignments[free] = unitId;
    return true;
  }

  /**
   * Put a unit on a named tile. Whoever was standing there takes the mover's
   * old tile if it had one, so dragging a unit around a filled formation swaps
   * rather than silently benching somebody.
   */
  assignDeployment(unitId: string, tileIndex: number): boolean {
    if (this.pending === null) return false;
    if (rosterUnit(this.campaignState, unitId) === null) return false;
    const assignments = this.pending.assignments;
    if (tileIndex < 0 || tileIndex >= assignments.length) return false;
    const from = assignments.indexOf(unitId);
    const occupant = assignments[tileIndex] ?? null;
    assignments[tileIndex] = unitId;
    if (from !== -1 && from !== tileIndex) assignments[from] = occupant;
    return true;
  }

  /** The staged formation as core `Deployment`s, in tile order. */
  deploymentPlacements(): Deployment[] {
    if (this.pending === null) return [];
    const enemyTiles = this.pending.encounter.enemies.map((placed) => placed.position);
    const out: Deployment[] = [];
    this.pending.assignments.forEach((unitId, index) => {
      const tile = this.pending?.map.deploymentTiles[index];
      if (unitId === null || tile === undefined) return;
      out.push({ unitId, position: { ...tile }, facing: facingTowardNearest(tile, enemyTiles) });
    });
    return out;
  }

  /**
   * The satchel that goes out with them: the whole chapter's consumable stock,
   * shared by everyone deployed. Whatever comes back is what is left.
   */
  carriedItems(): InventoryStack[] {
    return consumableStock(this.campaignState, this.content.items);
  }

  /** The roster units the staged formation puts on the field, deep-copied. */
  deployedParty(): Unit[] {
    const ids = new Set(this.deploymentPlacements().map((placement) => placement.unitId));
    return this.campaignState.roster
      .filter((unit) => ids.has(unit.id))
      .map((unit) => structuredClone(unit));
  }

  // --- battle results -------------------------------------------------------

  /** Fold a finished battle back into the chapter and clear the formation. */
  finishBattle(final: GameState): BattleOutcome {
    const applied = applyBattleResults(this.campaignState, final);
    this.campaignState = applied.state;
    this.pending = null;
    this.onChange(this.campaignState);
    return applied.outcome;
  }

  /** Drop assignments for units that left the roster (permadeath, mostly). */
  private pruneAssignments(): void {
    if (this.pending === null) return;
    this.pending.assignments = this.pending.assignments.map((unitId) =>
      unitId !== null && rosterUnit(this.campaignState, unitId) === null ? null : unitId,
    );
  }
}

/** `ProgressionIntents` wired to a session; screen navigation stays with the shell. */
export function progressionIntents(
  session: CampaignSession,
  navigation: Pick<
    ProgressionIntents,
    | "selectRosterUnit"
    | "openUnitSheet"
    | "openLearning"
    | "openEquipment"
    | "openJobs"
    | "beginDeployment"
    | "confirmDeployment"
    | "closeScreen"
  >,
): ProgressionIntents {
  return {
    ...navigation,
    learnAbility: (unitId, abilityId) => void session.learnAbility(unitId, abilityId),
    equipItem: (unitId, slot, itemId) => void session.equipItem(unitId, slot, itemId),
    setAbilitySlot: (unitId, slot, abilityId) =>
      void session.setAbilitySlot(unitId, slot, abilityId),
    changeJob: (unitId, jobId) => void session.changeJob(unitId, jobId),
    setSecondaryJob: (unitId, jobId) => void session.setSecondaryJob(unitId, jobId),
    toggleDeployment: (unitId) => void session.toggleDeployment(unitId),
    assignDeployment: (unitId, tileIndex) => void session.assignDeployment(unitId, tileIndex),
  };
}
