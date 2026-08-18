// THE UI SEAM, read side. Every `src/ui` view model is built here from core
// selectors and nothing else.
//
// It lives in `src/app` rather than `src/ui/adapter.ts` because the UI layer is
// forbidden from importing `src/core` (see the header of `src/ui/intents.ts`);
// `src/app` is the only package allowed to see both. `src/ui/mock.ts` stays as
// the harness's fixture source — this module is the app path.

import {
  abilityOutcomes,
  activatableObjects,
  activeTurnState,
  activeUnit,
  affectedTiles,
  aimVerdicts,
  allCharges,
  allObjects,
  allUnits,
  attackAngleAgainst,
  availableAbilities,
  BASIC_ATTACK_ID,
  battleClock,
  battleEncounter,
  battleMap,
  canUndoMove,
  forecast,
  getAbility,
  getItem,
  getJob,
  getObject,
  getStatus,
  getUnit,
  itemAbilityId,
  itemIdFromAbilityId,
  objectEnergized,
  objectGridRole,
  objectOperationPreview,
  powerRegister,
  standHeight,
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
import type { DamageType, DialogueLine, StatKey, TileCoord } from "../data/index.js";
import { mechanicsView } from "./mechanics.js";
import {
  EQUIP_SLOTS,
  STAT_LABELS,
  formatSigned,
  type AbilityView,
  type ActionMenuView,
  type BattleHudView,
  type EquipSlot,
  type EquipSlotView,
  type FieldCursorView,
  type FieldObjectView,
  type FieldStatusView,
  type FieldUnitView,
  type FieldView,
  type ForecastTargetView,
  type ForecastView,
  type ItemEntryView,
  type LogEntryView,
  type MechanicsView,
  type ObjectInspectView,
  type PartyView,
  type PowerLedgerView,
  type PowerLoadLevel,
  type PowerNetworkView,
  type PowerNodeState,
  type RosterEntryView,
  type SkillsetView,
  type StatLineView,
  type StatModView,
  type StatusView,
  type TargetingRefusalView,
  type TargetingView,
  type TargetRef as UiTargetRef,
  type TurnOrderEntryView,
  type TurnOrderView,
  type UnitSheetView,
  type UnitView,
} from "../ui/index.js";

const DEFAULT_TURN_ORDER_COUNT = 6;

const jobName = (state: GameState, jobId: string): string => getJob(state, jobId)?.name ?? jobId;

const statusViews = (state: GameState, unit: BattleUnit): StatusView[] =>
  unit.statuses.map((active) => {
    const status = getStatus(state, active.statusId);
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

/**
 * The cast this unit has committed to, and when it lands — FFT's telegraph and
 * no more than it: a charge already sent, never an intent nobody has staged.
 *
 * The tick count is read off the same preview the turn order lists, so the card
 * and the queue can never disagree about when the thing resolves. Charges are
 * rare, so the preview is only asked for when this unit actually has one.
 */
export function chargingView(
  state: GameState,
  unitId: string,
): { abilityName: string; ticksUntil: number | null } | null {
  const charge = allCharges(state).find((pending) => pending.actorId === unitId);
  if (charge === undefined) return null;
  const entry = turnOrderPreview(state, CHARGE_LOOKAHEAD).find(
    (candidate) => candidate.kind === "charge" && candidate.id === charge.id,
  );
  const ability = getAbility(state, unitId, charge.abilityId);
  return {
    abilityName: ability?.name ?? charge.abilityId,
    ticksUntil: entry === undefined ? null : Math.max(0, entry.clock - battleClock(state)),
  };
}

/** Deep enough that a cast in flight is always in the preview it is read from. */
const CHARGE_LOOKAHEAD = 24;

/** Where a charging unit's cast would land, for the field paint (UI_DESIGN §13.5). */
export function chargeLandingTiles(state: GameState, unitId: string): TileCoord[] {
  const charge = allCharges(state).find((pending) => pending.actorId === unitId);
  if (charge === undefined) return [];
  return affectedTiles(state, charge.actorId, charge.abilityId, charge.target);
}

export function unitView(state: GameState, unitId: string): UnitView | null {
  const unit = getUnit(state, unitId);
  if (unit === null) return null;
  const charging = chargingView(state, unitId);
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
    ...(charging === null ? {} : { charging }),
    downed: unit.downed,
  };
}

const unavailableReason = (unit: BattleUnit, ability: ActionAbility): string | undefined => {
  if (unit.charge < ability.chargeCost) return "Insufficient charge";
  const hpCost = ability.hpCost ?? 0;
  if (hpCost > 0 && unit.hp <= hpCost) return "Not enough vitality";
  return undefined;
};

/**
 * What an order does, read off the definition this unit would actually issue —
 * the weapon attack's reach comes from the weapon, an item's from the thrower's
 * mastery. The menu row prints these; the prose beside them stops having to.
 */
export function abilityMechanicsView(
  state: GameState,
  unitId: string,
  abilityId: string,
  usesRemaining?: number,
): MechanicsView | null {
  const ability = getAbility(state, unitId, abilityId);
  if (ability === null || ability.slot !== "action") return null;
  return mechanicsView(
    {
      targeting: ability.targeting,
      effects: ability.effects,
      chargeCost: ability.chargeCost,
      castSpeed: ability.castSpeed,
    },
    {
      ...(usesRemaining === undefined ? {} : { usesRemaining }),
      statusName: (statusId) => getStatus(state, statusId)?.name ?? statusId,
    },
  );
}

export function abilityView(state: GameState, unitId: string, abilityId: string): AbilityView | null {
  const unit = getUnit(state, unitId);
  const ability = getAbility(state, unitId, abilityId);
  if (unit === null || ability === null || ability.slot !== "action") return null;
  const reason = unavailableReason(unit, ability);
  const mechanics = abilityMechanicsView(state, unitId, abilityId);
  return {
    id: ability.id,
    name: ability.name,
    description: ability.description,
    slot: "action",
    chargeCost: ability.chargeCost,
    castSpeed: ability.castSpeed,
    standingCost: ability.standingCost,
    ...(reason === undefined ? {} : { unavailableReason: reason }),
    ...(mechanics === null ? {} : { mechanics }),
  };
}

/** Action abilities grouped by the job that owns them, primary job first. */
export function skillsetViews(state: GameState, unitId: string): SkillsetView[] {
  const unit = getUnit(state, unitId);
  if (unit === null) return [];
  const byJob = new Map<string, AbilityView[]>();
  for (const abilityId of availableAbilities(state, unitId)) {
    const ability = getAbility(state, unitId, abilityId);
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
    // Asked of core, never inferred from the turn flags: the undo slot is the
    // whole rule, and it is cleared by every command a move is not.
    ...(canUndoMove(state, unitId) ? { canUndoMove: true } : {}),
    operables,
    items: satchelViews(state, unitId),
  };
}

/** The force's shared satchel as this unit's Item submenu reads it. */
export function satchelViews(state: GameState, unitId: string): ItemEntryView[] {
  return usableItems(state, unitId).map((entry) => {
    // An item is aimed through its synthesized ability, so its mechanics are
    // read the same way an ability's are — mastery bonuses included.
    const mechanics = abilityMechanicsView(
      state,
      unitId,
      itemAbilityId(entry.itemId),
      Math.max(0, entry.count - 1),
    );
    return {
      itemId: entry.itemId,
      name: entry.name,
      description: entry.description,
      count: entry.count,
      ...(entry.unavailableReason === undefined ? {} : { unavailableReason: entry.unavailableReason }),
      ...(mechanics === null ? {} : { mechanics }),
    };
  });
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
      return `Clears ${getStatus(state, outcome.statusId)?.name ?? outcome.statusId}`;
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
  const ability = getAbility(state, unitId, abilityId);
  if (attacker === null || ability === null || ability.slot !== "action") return null;

  const itemId = itemIdFromAbilityId(abilityId);
  const damageType = damageTypeOf(ability);
  const targets: ForecastTargetView[] = [];
  for (const entry of forecast(state, unitId, abilityId, target)) {
    const amount = entry.heal > 0 && entry.damage === 0 ? entry.heal : entry.damage;
    const kind = entry.heal > 0 && entry.damage === 0 ? "heal" : "damage";
    const statuses = entry.statusChances.map((chance) => ({
      name: getStatus(state, chance.statusId)?.name ?? chance.statusId,
      chancePercent: chance.chance,
    }));

    if (entry.unitId !== null) {
      const victim = getUnit(state, entry.unitId);
      if (victim === null) continue;
      const angle = attackAngleAgainst(state, unitId, entry.unitId);
      targets.push({
        unitId: entry.unitId,
        name: victim.unit.name,
        team: victim.team,
        ...(victim.unit.portraitId === undefined ? {} : { portraitId: victim.unit.portraitId }),
        jobName: jobName(state, victim.unit.jobId),
        hp: victim.hp,
        maxHp: unitMaxHp(state, victim.id) ?? victim.hp,
        hitChancePercent: entry.hitChance,
        damage:
          amount === 0 && kind === "damage"
            ? null
            : { kind, min: amount, max: amount, ...(damageType === undefined ? {} : { damageType }) },
        statuses,
        effects: outcomeLines(state, entry.outcomes),
        attackAngle: angle,
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
      jobName: objectCategory(state, entry.objectId, object.def.kind),
      ...(object.def.integrity.destructible
        ? { hp: object.hp, maxHp: object.def.integrity.hp }
        : {}),
      hitChancePercent: entry.hitChance,
      damage:
        amount === 0 && kind === "damage"
          ? null
          : { kind, min: amount, max: amount, ...(damageType === undefined ? {} : { damageType }) },
      statuses,
      effects: outcomeLines(state, entry.outcomes),
      attackAngle: null,
      heightAdvantage: 0,
    });
  }

  return {
    attacker: {
      unitId: attacker.id,
      name: attacker.unit.name,
      ...(attacker.unit.portraitId === undefined ? {} : { portraitId: attacker.unit.portraitId }),
      jobName: jobName(state, attacker.unit.jobId),
      hp: attacker.hp,
      maxHp: unitMaxHp(state, attacker.id) ?? attacker.hp,
      team: attacker.team,
    },
    // An aimed order is only ever built from a staged target, so this panel is
    // always the confirm moment; the Operate preview below is the one that is not.
    armed: true,
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

/** Two names read; more than two are a count, because machine names are long. */
const machineList = (names: readonly string[]): string =>
  names.length <= 2 ? names.join(" and ") : `${names.length} machines`;

/** One machine takes the singular; two names and a count both take the plural. */
const machinePhrase = (names: readonly string[], singular: string, plural: string): string =>
  `${machineList(names)} ${names.length === 1 ? singular : plural}`;

/**
 * What working this machine's controls would do to the grid, per the real
 * recompute. Operate is the only order the player sends with no aim step, so it
 * was the only one with no forecast and no flip highlight — on a grid map that
 * is the cheapest grid verb on the board going out blind.
 */
export function operateForecastView(
  state: GameState,
  unitId: string,
  objectId: string,
): ForecastView | null {
  const actor = getUnit(state, unitId);
  const object = getObject(state, objectId);
  if (actor === null || object === null || object.def.operable === null) return null;

  const lost: string[] = [];
  const gained: string[] = [];
  for (const flipped of objectOperationPreview(state, unitId, objectId)) {
    const name = getObject(state, flipped)?.def.name ?? flipped;
    (objectEnergized(state, flipped) ? lost : gained).push(name);
  }
  const effects: string[] = [];
  if (lost.length > 0) effects.push(machinePhrase(lost, "loses power", "lose power"));
  if (gained.length > 0) effects.push(machinePhrase(gained, "comes back up", "come back up"));
  // Most maps declare no grid at all, so the old wording promised a grid the
  // player could not see and reported honestly about nothing.
  if (effects.length === 0) effects.push("No powered machines affected");

  return {
    attacker: {
      unitId: actor.id,
      name: actor.unit.name,
      ...(actor.unit.portraitId === undefined ? {} : { portraitId: actor.unit.portraitId }),
      jobName: jobName(state, actor.unit.jobId),
      hp: actor.hp,
      maxHp: unitMaxHp(state, actor.id) ?? actor.hp,
      team: actor.team,
    },
    // Operate has no aim step, so there is nothing staged to confirm: the
    // machine under the menu cursor is a preview, and it stays a side panel.
    armed: false,
    abilityId: "operate",
    abilityName: `Operate — ${object.def.name}`,
    chargeCost: 0,
    castSpeed: null,
    operate: { objectId },
    targets: [],
    effects,
    aimedAt: { kind: "object", objectId },
  };
}

/** How the inspect panel names a machine: its grid job first, then what it is. */
function objectCategory(state: GameState, objectId: string, kind: string): string {
  const role = objectGridRole(state, objectId);
  if (role === null) return OBJECT_KIND_LABELS[kind] ?? kind;
  const grid = battleMap(state).grids.find((candidate) =>
    candidate.nodes.some((node) => node.objectId === objectId),
  );
  const node = grid?.nodes.find((candidate) => candidate.objectId === objectId);
  if (node?.role === "source") return `Source · rated ${node.capacity}`;
  if (node?.role === "sink") return `Sink · draws ${node.draw}`;
  return role === "line" ? "Cable run" : "Breaker";
}

const OBJECT_KIND_LABELS: Record<string, string> = {
  machine: "Machinery",
  switch: "Switch",
  lift: "Lift",
  cell: "Flux cell",
  wall: "Structure",
  catwalk: "Catwalk",
  turret: "Frame",
};

/** A machine under the cursor, for the inspect panel. */
export function objectInspectView(state: GameState, objectId: string): ObjectInspectView | null {
  const object = getObject(state, objectId);
  if (object === null) return null;
  const row = powerRegister(state)
    .grids.flatMap((section) => [
      ...section.components.flatMap((component) => component.nodes),
      ...section.outOfCircuit,
    ])
    .find((node) => node.objectId === objectId);
  const power: PowerNodeState | null =
    row?.state ??
    (object.powered === null
      ? null
      : object.destroyed
        ? "destroyed"
        : objectEnergized(state, objectId)
          ? "live"
          : "dead");
  const destructible = object.def.integrity.destructible;
  return {
    kind: "object",
    id: objectId,
    name: object.def.name,
    category: objectCategory(state, objectId, object.def.kind),
    power,
    hp: destructible ? object.hp : null,
    maxHp: destructible ? object.def.integrity.hp : null,
    destroyed: object.destroyed,
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
 *
 * A tripped bus never reads at rest, whatever the ratio says. On a house with
 * two mains the second one latches against what the first one left — 18 against
 * 14, not against the 28 the pair are rated for together — so the copper of a
 * bus running quietly was being spent on a bus that had already blown, and the
 * load was painted as headroom. The figures stay what the component is carrying
 * against what it is rated for; only the claim that this is a bus at rest goes.
 */
export function powerLoadLevel(load: number, capacity: number, tripped = false): PowerLoadLevel {
  if (capacity <= 0) return load > 0 ? "over" : tripped ? "rated" : "rest";
  if (load > capacity) return "over";
  if (tripped) return "rated";
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
  const nodeViews = (nodes: readonly { objectId: string; name: string; state: PowerNodeState }[]) =>
    nodes.map((node) => ({ objectId: node.objectId, name: node.name, state: node.state }));
  const networks: PowerNetworkView[] = register.grids.map((section) => ({
    gridId: section.gridId,
    name: section.name,
    components: section.components.map((component) => ({
      id: component.id,
      sources: [...component.sources],
      load: component.load,
      capacity: component.capacity,
      held: component.held,
      level: powerLoadLevel(component.load, component.capacity, component.state === "tripped"),
      state: component.state,
      nodes: nodeViews(component.nodes),
    })),
    outOfCircuit: nodeViews(section.outOfCircuit),
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
    const ability = getAbility(state, charge.actorId, charge.abilityId);
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

// --- the field, as data ------------------------------------------------------

const fieldStatusViews = (state: GameState, unit: BattleUnit): FieldStatusView[] =>
  statusViews(state, unit).map((status) => ({
    id: status.id,
    label: status.name,
    category: status.category,
    remainingTurns: status.remainingTurns,
  }));

/**
 * The board as data: its elevations, its units, its machinery.
 *
 * Elevation decides half the aim gate and was the one fact the field never
 * printed, so it is stated here per tile rather than left to be read off a
 * shaded mesh. Heights are recomputed each frame on purpose — a wrecked catwalk
 * lowers the tiles it was decking, so a cached grid would be a lie the moment a
 * deck came down.
 */
export function fieldView(state: GameState): FieldView {
  const map = battleMap(state);
  const acting = activeUnit(state);
  const heights: number[][] = [];
  for (let y = 0; y < map.depth; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < map.width; x += 1) row.push(standHeight(state, { x, y }));
    heights.push(row);
  }
  const units: FieldUnitView[] = allUnits(state).map((unit) => {
    const charging = chargingView(state, unit.id);
    return {
      unitId: unit.id,
      name: unit.unit.name,
      jobName: jobName(state, unit.unit.jobId),
      team: unit.team,
      tile: { ...unit.position },
      height: standHeight(state, unit.position),
      facing: unit.facing,
      hp: unit.hp,
      maxHp: unitMaxHp(state, unit.id) ?? unit.hp,
      charge: unit.charge,
      maxCharge: unitMaxCharge(state, unit.id) ?? unit.charge,
      downed: unit.downed,
      acting: acting !== null && acting.id === unit.id,
      statuses: fieldStatusViews(state, unit),
      ...(charging === null ? {} : { charging }),
    };
  });
  const objects: FieldObjectView[] = [];
  for (const object of allObjects(state)) {
    const inspect = objectInspectView(state, object.def.id);
    if (inspect === null) continue;
    objects.push({ ...inspect, tiles: object.def.tiles.map((tile) => ({ ...tile })) });
  }
  return { width: map.width, depth: map.depth, heights, units, objects };
}

/**
 * The tile under the cursor. `fromUnitId` is the unit the height is measured
 * against — set while an order is being aimed, absent when the cursor is only
 * resting, because there is nothing to measure a hover against outside a
 * targeting mode.
 */
export function cursorView(
  state: GameState,
  tile: TileCoord | null,
  fromUnitId: string | null = null,
): FieldCursorView | null {
  if (tile === null) return null;
  const from = fromUnitId === null ? null : getUnit(state, fromUnitId);
  const height = standHeight(state, tile);
  return {
    tile: { ...tile },
    height,
    heightDelta: from === null ? null : height - standHeight(state, from.position),
  };
}

/**
 * What the staged order may actually be sent at. `inRange` is the reach overlay;
 * `legal` is the subset the aim gate accepts and `illegal` carries the gate's own
 * refusal per tile, so a tile painted as a target can be trusted to be one.
 */
export function targetingView(
  state: GameState,
  unitId: string,
  abilityId: string,
): TargetingView | null {
  const ability = getAbility(state, unitId, abilityId);
  if (ability === null || ability.slot !== "action") return null;
  const inRange: TileCoord[] = [];
  const legal: TileCoord[] = [];
  const illegal: TargetingRefusalView[] = [];
  for (const verdict of aimVerdicts(state, unitId, abilityId)) {
    inRange.push({ ...verdict.tile });
    if (verdict.refusal === null) {
      legal.push({ ...verdict.tile });
      continue;
    }
    illegal.push({
      tile: { ...verdict.tile },
      code: verdict.refusal.code,
      reason: verdict.refusal.message,
    });
  }
  return { abilityId, abilityName: ability.name, inRange, legal, illegal };
}

export interface HudInputs {
  /** Unit under the cursor; falls back to the acting unit. */
  inspectedUnitId?: string | null;
  /** Machine under the cursor. Takes the panel while it is set. */
  inspectedObjectId?: string | null;
  /**
   * Who the HUD is about when nobody is acting — the closing frame of a battle.
   * The panels still have to report final numbers; they just cannot offer
   * anything to do with them.
   */
  subjectUnitId?: string | null;
  forecast?: ForecastView | null;
  dialogue?: DialogueLine[];
  turnOrderCount?: number;
  /** The tile under the cursor, for the elevation readout. */
  hoveredTile?: TileCoord | null;
  /**
   * The ability being aimed. It drives the legality split and the hover's height
   * delta: outside a targeting mode neither has anything to be about.
   */
  targetingAbilityId?: string | null;
  /** The battle's record so far, accumulated by the controller from the events. */
  log?: readonly LogEntryView[];
}

export function battleHudView(state: GameState, inputs: HudInputs = {}): BattleHudView | null {
  const acting = activeUnit(state);
  const subjectId = acting?.id ?? inputs.subjectUnitId ?? null;
  if (subjectId === null) return null;
  const action = actionMenuView(state, subjectId);
  if (action === null) return null;
  const inspectedId = inputs.inspectedUnitId ?? subjectId;
  const power = powerLedgerView(state);
  const inspectedObject =
    inputs.inspectedObjectId === undefined || inputs.inspectedObjectId === null
      ? null
      : objectInspectView(state, inputs.inspectedObjectId);
  const aimedAbilityId = inputs.targetingAbilityId ?? null;
  const targeting =
    aimedAbilityId === null || acting === null ? null : targetingView(state, acting.id, aimedAbilityId);
  return {
    action,
    inspected: inspectedObject ?? (inspectedId === null ? null : unitView(state, inspectedId)),
    turnOrder: turnOrderView(state, inputs.turnOrderCount ?? DEFAULT_TURN_ORDER_COUNT),
    forecast: inputs.forecast ?? null,
    dialogue: inputs.dialogue ?? [],
    ...(power === undefined ? {} : { power }),
    activeUnitId: acting?.id ?? null,
    ...(inputs.log === undefined ? {} : { log: inputs.log }),
    cursor: cursorView(
      state,
      inputs.hoveredTile ?? null,
      targeting === null ? null : (acting?.id ?? null),
    ),
    targeting,
    field: fieldView(state),
    objective: battleEncounter(state).objective ?? null,
  };
}

const equipSlotViews = (state: GameState, unit: BattleUnit): EquipSlotView[] =>
  EQUIP_SLOTS.map((slot: EquipSlot) => {
    const itemId = unit.unit.equipment[slot] ?? null;
    const item = itemId === null ? null : getItem(state, itemId);
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
    const ability = id === undefined ? null : getAbility(state, unitId, id);
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
      disposition: unit.unit.disposition,
      // Everyone on this list took the field: the battle roster has no reserve.
      deployed: true,
      note: unit.downed ? "Downed" : "Deployed",
    });
  }
  return {
    members,
    deployedLimit: battleEncounter(state).maxDeployedUnits,
    deployedCount: members.length,
  };
}

function allPlayerUnits(state: GameState): readonly BattleUnit[] {
  return allUnits(state).filter((unit) => unit.team === "player");
}
