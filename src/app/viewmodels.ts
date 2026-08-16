// THE UI SEAM, read side. Every `src/ui` view model is built here from core
// selectors and nothing else.
//
// It lives in `src/app` rather than `src/ui/adapter.ts` because the UI layer is
// forbidden from importing `src/core` (see the header of `src/ui/intents.ts`);
// `src/app` is the only package allowed to see both. `src/ui/mock.ts` stays as
// the harness's fixture source — this module is the app path.

import {
  BASIC_ATTACK_ID,
  abilityInfo,
  abilityOutcomes,
  activatableObjects,
  activeTurnState,
  activeUnit,
  allCharges,
  allUnits,
  attackAngleAgainst,
  availableAbilities,
  battleClock,
  battleEncounter,
  forecast,
  getObject,
  getUnit,
  itemIdFromAbilityId,
  itemInfo,
  jobInfo,
  powerRegister,
  standHeight,
  statusInfo,
  turnOrderPreview,
  unitCanAct,
  unitCanMove,
  unitMaxCharge,
  unitMaxHp,
  unitStats,
  usableItems,
  type ActionAbility,
  type BattleUnit,
  type ForecastOutcome,
  type GameState,
  type TargetRef,
} from "../core/index.js";
import type { DamageType, DialogueLine, StatKey } from "../data/index.js";
import {
  EQUIP_SLOTS,
  STAT_LABELS,
  formatSigned,
  type AbilityView,
  type ActionMenuView,
  type BattleHudView,
  type EquipSlot,
  type EquipSlotView,
  type ForecastTargetView,
  type ForecastView,
  type ItemEntryView,
  type PartyView,
  type PowerLedgerView,
  type PowerLoadLevel,
  type PowerNetworkView,
  type RosterEntryView,
  type SkillsetView,
  type StatLineView,
  type StatModView,
  type StatusView,
  type TargetRef as UiTargetRef,
  type TurnOrderEntryView,
  type TurnOrderView,
  type UnitSheetView,
  type UnitView,
} from "../ui/index.js";

const DEFAULT_TURN_ORDER_COUNT = 6;

const jobName = (state: GameState, jobId: string): string => jobInfo(state, jobId)?.name ?? jobId;

const statusViews = (state: GameState, unit: BattleUnit): StatusView[] =>
  unit.statuses.map((active) => {
    const status = statusInfo(state, active.statusId);
    return {
      id: active.statusId,
      name: status?.name ?? active.statusId,
      category: status?.category ?? "debuff",
      remainingTurns: active.turnsRemaining,
    };
  });

/**
 * Timed stat changes, named by what they actually did. A `modifyStats` effect
 * carries no status and no icon, so without this the number simply moved and
 * the player had nothing to read it against.
 */
const modifierViews = (unit: BattleUnit): StatModView[] => {
  const out: StatModView[] = [];
  for (const mod of unit.tempMods) {
    const parts = Object.entries(mod.mods).filter(
      (entry): entry is [StatKey, number] => typeof entry[1] === "number" && entry[1] !== 0,
    );
    if (parts.length === 0) continue;
    const gains = parts.filter(([, value]) => value > 0).length;
    const losses = parts.length - gains;
    out.push({
      id: mod.id,
      label: parts.map(([key, value]) => `${STAT_LABELS[key]} ${formatSigned(value)}`).join(" · "),
      remainingTurns: mod.turnsRemaining,
      direction: losses === 0 ? "gain" : gains === 0 ? "loss" : "mixed",
    });
  }
  return out;
};

export function unitView(state: GameState, unitId: string): UnitView | null {
  const unit = getUnit(state, unitId);
  if (unit === null) return null;
  return {
    id: unit.id,
    name: unit.unit.name,
    jobId: unit.unit.jobId,
    jobName: jobName(state, unit.unit.jobId),
    level: unit.unit.level,
    team: unit.team,
    ...(unit.unit.portraitId === undefined ? {} : { portraitId: unit.unit.portraitId }),
    hp: unit.hp,
    maxHp: unitMaxHp(state, unit.id) ?? unit.hp,
    charge: unit.charge,
    maxCharge: unitMaxCharge(state, unit.id) ?? unit.charge,
    ct: unit.ct,
    facing: unit.facing,
    statuses: statusViews(state, unit),
    modifiers: modifierViews(unit),
    disposition: unit.unit.disposition,
    downed: unit.downed,
  };
}

const unavailableReason = (unit: BattleUnit, ability: ActionAbility): string | undefined => {
  if (unit.charge < ability.chargeCost) return "Insufficient charge";
  const hpCost = ability.hpCost ?? 0;
  if (hpCost > 0 && unit.hp <= hpCost) return "Not enough vitality";
  return undefined;
};

export function abilityView(state: GameState, unitId: string, abilityId: string): AbilityView | null {
  const unit = getUnit(state, unitId);
  const ability = abilityInfo(state, unitId, abilityId);
  if (unit === null || ability === null || ability.slot !== "action") return null;
  const reason = unavailableReason(unit, ability);
  return {
    id: ability.id,
    name: ability.name,
    description: ability.description,
    slot: "action",
    chargeCost: ability.chargeCost,
    castSpeed: ability.castSpeed,
    standingCost: ability.standingCost,
    ...(reason === undefined ? {} : { unavailableReason: reason }),
  };
}

/** Action abilities grouped by the job that owns them, primary job first. */
export function skillsetViews(state: GameState, unitId: string): SkillsetView[] {
  const unit = getUnit(state, unitId);
  if (unit === null) return [];
  const byJob = new Map<string, AbilityView[]>();
  for (const abilityId of availableAbilities(state, unitId)) {
    const ability = abilityInfo(state, unitId, abilityId);
    const view = abilityView(state, unitId, abilityId);
    if (ability === null || view === null) continue;
    const owner = abilityId === BASIC_ATTACK_ID ? unit.unit.jobId : ability.jobId;
    const list = byJob.get(owner) ?? [];
    list.push(view);
    byJob.set(owner, list);
  }
  const order = [unit.unit.jobId, ...(unit.unit.secondaryJobId === undefined ? [] : [unit.unit.secondaryJobId])];
  const jobIds = [...byJob.keys()].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia !== ib) return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
    return a < b ? -1 : 1;
  });
  return jobIds.map((jobId) => ({
    jobId,
    name: jobName(state, jobId),
    abilities: byJob.get(jobId) ?? [],
  }));
}

export function actionMenuView(state: GameState, unitId: string): ActionMenuView | null {
  const unit = unitView(state, unitId);
  if (unit === null) return null;
  const turn = activeTurnState(state);
  const isActive = turn !== null && turn.unitId === unitId;
  const moveSpent = isActive && turn.moved;
  const actSpent = isActive && turn.acted;
  const heldStill = !unitCanMove(state, unitId);
  const heldBack = !unitCanAct(state, unitId);
  const operables = [...activatableObjectViews(state, unitId)];
  return {
    unit,
    skillsets: skillsetViews(state, unitId),
    canMove: isActive && !moveSpent && !heldStill,
    canAct: isActive && !actSpent && !heldBack,
    ...(moveSpent || heldStill
      ? { moveBlockedReason: heldStill ? "Held in place" : "Move already spent" }
      : {}),
    ...(actSpent || heldBack
      ? { actBlockedReason: heldBack ? "Cannot act" : "Action already spent" }
      : {}),
    operables,
    items: satchelViews(state, unitId),
  };
}

/** The force's shared satchel as this unit's Item submenu reads it. */
export function satchelViews(state: GameState, unitId: string): ItemEntryView[] {
  return usableItems(state, unitId).map((entry) => ({
    itemId: entry.itemId,
    name: entry.name,
    description: entry.description,
    count: entry.count,
    ...(entry.unavailableReason === undefined ? {} : { unavailableReason: entry.unavailableReason }),
  }));
}

/** Adjacent operable machinery, as action-menu entries. */
export function activatableObjectViews(
  state: GameState,
  unitId: string,
): { objectId: string; name: string }[] {
  const turn = activeTurnState(state);
  if (turn === null || turn.unitId !== unitId || turn.acted || !unitCanAct(state, unitId)) return [];
  return activatableObjects(state, unitId).map((object) => ({
    objectId: object.def.id,
    name: object.def.name,
  }));
}

const damageTypeOf = (ability: ActionAbility): DamageType | undefined => {
  for (const effect of ability.effects) {
    if (effect.kind === "damage") return effect.damageType;
  }
  return undefined;
};

const SPAWN_LABELS: Record<"turret" | "mine" | "drone", string> = {
  turret: "Sentry frame",
  mine: "Charge",
  drone: "Drone",
};

const MOVE_SELF_LABELS: Record<"toward-target" | "away-from-target" | "forward", string> = {
  "toward-target": "toward the target",
  "away-from-target": "back from the target",
  forward: "forward",
};

const FORCE_MOVE_LABELS: Record<"push" | "pull" | "toward-actor-facing", string> = {
  push: "Pushed",
  pull: "Pulled",
  "toward-actor-facing": "Driven",
};

const turnsLabel = (turns: number): string => `${turns} turn${turns === 1 ? "" : "s"}`;

/**
 * One line of plain English per consequence. A forecast that reports "Damage —"
 * and nothing else for a three-turn buff is lying about what the order does;
 * these are the sentences that make it stop.
 */
function outcomeLine(state: GameState, outcome: ForecastOutcome): string | null {
  switch (outcome.kind) {
    case "statMods": {
      const parts = Object.entries(outcome.mods)
        .filter((entry): entry is [StatKey, number] => typeof entry[1] === "number" && entry[1] !== 0)
        .map(([key, value]) => `${STAT_LABELS[key]} ${formatSigned(value)}`);
      if (parts.length === 0) return null;
      const window =
        outcome.durationTurns === null ? "rest of battle" : turnsLabel(outcome.durationTurns);
      return `${parts.join(" · ")} for ${window}`;
    }
    case "removeStatus":
      return `Clears ${statusInfo(state, outcome.statusId)?.name ?? outcome.statusId}`;
    case "charge": {
      const moved = `Charge ${formatSigned(outcome.amount)}`;
      return outcome.siphonedToActor ? `${moved}, drawn to the caster` : moved;
    }
    case "disposition":
      return `${outcome.stat === "resolve" ? "Resolve" : "Attunement"} ${formatSigned(outcome.amount)}`;
    case "forceMove":
      return `${FORCE_MOVE_LABELS[outcome.direction]} ${outcome.distance}`;
    case "power":
      return outcome.mode === "toggle" ? "Power switched" : `Power ${outcome.mode}`;
    case "moveSelf":
      return `Caster steps ${outcome.distance} ${MOVE_SELF_LABELS[outcome.direction]}`;
    case "spawn":
      return `${SPAWN_LABELS[outcome.object]} placed · ${outcome.hp} integrity`;
  }
}

const outcomeLines = (state: GameState, outcomes: readonly ForecastOutcome[]): string[] =>
  outcomes.map((outcome) => outcomeLine(state, outcome)).filter((line): line is string => line !== null);

const uiTarget = (target: TargetRef): UiTargetRef => {
  if (target.kind === "unit") return { kind: "unit", unitId: target.unitId };
  if (target.kind === "object") return { kind: "object", objectId: target.objectId };
  return { kind: "tile", tile: { ...target.tile } };
};

export function forecastView(
  state: GameState,
  unitId: string,
  abilityId: string,
  target: TargetRef,
): ForecastView | null {
  const attacker = getUnit(state, unitId);
  const ability = abilityInfo(state, unitId, abilityId);
  if (attacker === null || ability === null || ability.slot !== "action") return null;

  const itemId = itemIdFromAbilityId(abilityId);
  const damageType = damageTypeOf(ability);
  const targets: ForecastTargetView[] = [];
  for (const entry of forecast(state, unitId, abilityId, target)) {
    const amount = entry.heal > 0 && entry.damage === 0 ? entry.heal : entry.damage;
    const kind = entry.heal > 0 && entry.damage === 0 ? "heal" : "damage";
    const statuses = entry.statusChances.map((chance) => ({
      name: statusInfo(state, chance.statusId)?.name ?? chance.statusId,
      chancePercent: chance.chance,
    }));

    if (entry.unitId !== null) {
      const victim = getUnit(state, entry.unitId);
      if (victim === null) continue;
      const angle = attackAngleAgainst(state, unitId, entry.unitId);
      targets.push({
        unitId: entry.unitId,
        name: victim.unit.name,
        ...(victim.unit.portraitId === undefined ? {} : { portraitId: victim.unit.portraitId }),
        hitChancePercent: entry.hitChance,
        damage:
          amount === 0 && kind === "damage"
            ? null
            : { kind, min: amount, max: amount, ...(damageType === undefined ? {} : { damageType }) },
        statuses,
        effects: outcomeLines(state, entry.outcomes),
        relativeFacing: angle,
        heightAdvantage:
          standHeight(state, attacker.position) - standHeight(state, victim.position),
      });
      continue;
    }

    // Objects have no unit-shaped view model; the object id rides in `unitId`
    // so the forecast panel can list machinery targets without a second shape.
    if (entry.objectId === null) continue;
    const object = getObject(state, entry.objectId);
    if (object === null) continue;
    targets.push({
      unitId: entry.objectId,
      name: object.def.name,
      hitChancePercent: entry.hitChance,
      damage:
        amount === 0 && kind === "damage"
          ? null
          : { kind, min: amount, max: amount, ...(damageType === undefined ? {} : { damageType }) },
      statuses,
      effects: outcomeLines(state, entry.outcomes),
      relativeFacing: null,
      heightAdvantage: 0,
    });
  }

  return {
    attacker: {
      unitId: attacker.id,
      name: attacker.unit.name,
      ...(attacker.unit.portraitId === undefined ? {} : { portraitId: attacker.unit.portraitId }),
      jobName: jobName(state, attacker.unit.jobId),
    },
    abilityId: ability.id,
    abilityName: ability.name,
    chargeCost: ability.chargeCost,
    castSpeed: ability.castSpeed,
    ...(itemId === null ? {} : { item: { itemId, remaining: itemRemaining(state, unitId, itemId) } }),
    targets,
    effects: outcomeLines(state, abilityOutcomes(state, unitId, abilityId)),
    aimedAt: uiTarget(target),
  };
}

/** Stock the satchel would hold after this use, for the forecast's cost line. */
function itemRemaining(state: GameState, unitId: string, itemId: string): number {
  const entry = usableItems(state, unitId).find((candidate) => candidate.itemId === itemId);
  return Math.max(0, (entry?.count ?? 0) - 1);
}

/**
 * Where the LOAD line takes its colour. Integer arithmetic throughout: nothing
 * in the grid touches the `Amount` pipeline, so nothing in the readout can
 * drift off a rounding step (FLUX_GRID §5.3).
 */
export function powerLoadLevel(load: number, capacity: number): PowerLoadLevel {
  if (capacity <= 0) return load > 0 ? "over" : "rest";
  if (load > capacity) return "over";
  return load * 10 >= capacity * 9 ? "rated" : "rest";
}

/** The floor's power register, or undefined on a map that switches nothing. */
export function powerLedgerView(state: GameState): PowerLedgerView | undefined {
  const register = powerRegister(state);
  const entries = register.ungridded.map((entry) => ({
    objectId: entry.objectId,
    name: entry.name,
    powered: entry.powered,
  }));
  const networks: PowerNetworkView[] = register.grids.map((section) => ({
    gridId: section.gridId,
    name: section.name,
    load: section.load,
    capacity: section.capacity,
    level: powerLoadLevel(section.load, section.capacity),
    tripped: section.tripped,
    nodes: section.nodes.map((node) => ({
      objectId: node.objectId,
      name: node.name,
      state: node.state,
    })),
  }));
  if (entries.length === 0 && networks.length === 0) return undefined;
  return networks.length === 0 ? { entries } : { entries, networks };
}

export function turnOrderView(state: GameState, count = DEFAULT_TURN_ORDER_COUNT): TurnOrderView {
  const clock = battleClock(state);
  const charges = allCharges(state);
  const entries: TurnOrderEntryView[] = [];

  for (const entry of turnOrderPreview(state, count)) {
    if (entry.kind === "unit") {
      const unit = getUnit(state, entry.id);
      if (unit === null) continue;
      entries.push({
        unitId: unit.id,
        name: unit.unit.name,
        jobName: jobName(state, unit.unit.jobId),
        team: unit.team,
        ...(unit.unit.portraitId === undefined ? {} : { portraitId: unit.unit.portraitId }),
        kind: "turn",
        ticksUntil: Math.max(0, entry.clock - clock),
      });
      continue;
    }
    const charge = charges.find((c) => c.id === entry.id);
    if (charge === undefined) continue;
    const caster = getUnit(state, charge.actorId);
    if (caster === null) continue;
    const ability = abilityInfo(state, charge.actorId, charge.abilityId);
    entries.push({
      unitId: caster.id,
      name: caster.unit.name,
      jobName: jobName(state, caster.unit.jobId),
      team: caster.team,
      ...(caster.unit.portraitId === undefined ? {} : { portraitId: caster.unit.portraitId }),
      kind: "cast",
      abilityName: ability?.name ?? charge.abilityId,
      ticksUntil: Math.max(0, entry.clock - clock),
    });
  }
  return { entries };
}

export interface HudInputs {
  /** Unit under the cursor; falls back to the acting unit. */
  inspectedUnitId?: string | null;
  /**
   * Who the HUD is about when nobody is acting — the closing frame of a battle.
   * The panels still have to report final numbers; they just cannot offer
   * anything to do with them.
   */
  subjectUnitId?: string | null;
  forecast?: ForecastView | null;
  dialogue?: DialogueLine[];
  turnOrderCount?: number;
}

export function battleHudView(state: GameState, inputs: HudInputs = {}): BattleHudView | null {
  const acting = activeUnit(state);
  const subjectId = acting?.id ?? inputs.subjectUnitId ?? null;
  if (subjectId === null) return null;
  const action = actionMenuView(state, subjectId);
  if (action === null) return null;
  const inspectedId = inputs.inspectedUnitId ?? subjectId;
  const power = powerLedgerView(state);
  return {
    action,
    inspected: inspectedId === null ? null : unitView(state, inspectedId),
    turnOrder: turnOrderView(state, inputs.turnOrderCount ?? DEFAULT_TURN_ORDER_COUNT),
    forecast: inputs.forecast ?? null,
    dialogue: inputs.dialogue ?? [],
    ...(power === undefined ? {} : { power }),
  };
}

const equipSlotViews = (state: GameState, unit: BattleUnit): EquipSlotView[] =>
  EQUIP_SLOTS.map((slot: EquipSlot) => {
    const itemId = unit.unit.equipment[slot] ?? null;
    const item = itemId === null ? null : itemInfo(state, itemId);
    return {
      slot,
      itemId,
      itemName: item?.name ?? null,
      summary: item === null ? "—" : item.slot === "weapon" ? `Power ${item.power}` : item.description,
    };
  });

export function unitSheetView(state: GameState, unitId: string): UnitSheetView | null {
  const unit = getUnit(state, unitId);
  const view = unitView(state, unitId);
  const stats = unitStats(state, unitId);
  if (unit === null || view === null || stats === null) return null;

  const statLines: StatLineView[] = [
    { key: "hp", label: STAT_LABELS.hp, value: stats.hp },
    { key: "charge", label: STAT_LABELS.charge, value: stats.charge },
    { key: "speed", label: STAT_LABELS.speed, value: stats.speed },
    { key: "phys", label: STAT_LABELS.phys, value: stats.phys },
    { key: "mag", label: STAT_LABELS.mag, value: stats.mag },
  ];

  const passiveNames = (["reaction", "support", "movement"] as const).map((slot) => {
    const id =
      slot === "reaction"
        ? unit.unit.reactionAbilityId
        : slot === "support"
          ? unit.unit.supportAbilityId
          : unit.unit.movementAbilityId;
    const ability = id === undefined ? null : abilityInfo(state, unitId, id);
    return { slot, abilityName: ability?.name ?? null };
  });

  return {
    unit: view,
    standing: unit.standingEarned,
    stats: statLines,
    move: stats.move,
    jump: stats.jump,
    evade: stats.evade,
    equipment: equipSlotViews(state, unit),
    learnedAbilities: unit.unit.learnedAbilityIds
      .map((id) => abilityView(state, unitId, id))
      .filter((entry): entry is AbilityView => entry !== null),
    passives: passiveNames,
  };
}

/** The deployed party, as the roster screen reads it mid-battle. */
export function partyView(state: GameState): PartyView {
  const members: RosterEntryView[] = [];
  for (const unit of allPlayerUnits(state)) {
    members.push({
      unitId: unit.id,
      name: unit.unit.name,
      jobName: jobName(state, unit.unit.jobId),
      level: unit.unit.level,
      ...(unit.unit.portraitId === undefined ? {} : { portraitId: unit.unit.portraitId }),
      hp: unit.hp,
      maxHp: unitMaxHp(state, unit.id) ?? unit.hp,
      standing: unit.standingEarned,
      note: unit.downed ? "Downed" : "Deployed",
    });
  }
  return { members, deployedLimit: battleEncounter(state).maxDeployedUnits };
}

function allPlayerUnits(state: GameState): readonly BattleUnit[] {
  return allUnits(state).filter((unit) => unit.team === "player");
}
