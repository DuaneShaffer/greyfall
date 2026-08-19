// THE UI SEAM, record side. The battle's log, accumulated from the one thing
// core promises: the events `applyCommand` returns.
//
// Every figure here is what the rules actually did. Nothing is re-derived from
// state and nothing is a forecast, so the log answers the two questions the HUD
// could not — "did that hit, and for how much" and "what happened during the
// enemy's turn" — including the turns that resolve behind a dialogue box and the
// sub-second ones nobody can watch.
//
// It is an accumulator rather than a selector because the events are the only
// place the information exists: a state snapshot cannot say that 14 of the 20 HP
// missing from a unit were taken by *this* order.

import {
  battleClock,
  battleEncounter,
  getAbility,
  getObject,
  getStatus,
  getUnit,
  powerRegister,
  turnNumber,
  type BattleEvent,
  type GameState,
} from "../core/index.js";
import type { StatKey, Team, TileCoord } from "../data/index.js";
import {
  STAT_LABELS,
  formatSigned,
  type LogActorView,
  type LogEntryView,
  type LogStatusView,
  type LogTargetView,
} from "../ui/index.js";

/** One entry under construction, collecting an order's consequences. */
interface Draft {
  kind: LogEntryView["kind"];
  turn: number;
  tick: number;
  actor: LogActorView | undefined;
  action: string | undefined;
  /** Keyed by unit or object id, in the order the events named them. */
  targets: Map<string, MutableTarget>;
  notes: string[];
  /** Machines this order energized or dropped, reported as one line. */
  powerGained: string[];
  powerLost: string[];
}

interface MutableTarget {
  id: string;
  name: string;
  team: Team | undefined;
  hit: boolean | null;
  damage: number | undefined;
  damageType: LogTargetView["damageType"];
  recovery: number | undefined;
  hpRemaining: number | undefined;
  statuses: LogStatusView[];
  downed: boolean;
}

const tileLabel = (tile: TileCoord): string => `(${tile.x}, ${tile.y})`;

/** Two names read; more than two are a count, because machine names are long. */
const machineList = (names: readonly string[]): string =>
  names.length <= 2 ? names.join(" and ") : `${names.length} machines`;

const allegiance = (team: Team): string =>
  team === "player" ? "ally" : team === "enemy" ? "hostile" : "neutral";

const statusClause = (status: LogStatusView): string => {
  switch (status.change) {
    case "applied":
      return status.remainingTurns === undefined || status.remainingTurns === null
        ? status.name
        : `${status.name} (${status.remainingTurns} turns)`;
    case "resisted":
      return `${status.name} resisted`;
    case "expired":
      return `${status.name} expired`;
    case "cleared":
      return `${status.name} cleared`;
  }
};

/** Null when the rules recorded no figure against this target at all. */
const targetClause = (target: LogTargetView): string | null => {
  const bits: string[] = [];
  if (target.hit === false) bits.push("missed");
  if (target.damage !== undefined) {
    bits.push(`${target.damage}${target.damageType === undefined ? "" : ` ${target.damageType}`} damage`);
  }
  if (target.recovery !== undefined) bits.push(`${target.recovery} recovered`);
  if (target.hpRemaining !== undefined) bits.push(`HP ${target.hpRemaining}`);
  for (const status of target.statuses) bits.push(statusClause(status));
  if (target.downed) bits.push("down");
  return bits.length === 0 ? null : `${target.name}: ${bits.join(", ")}`;
};

const join = (parts: readonly string[]): string => parts.filter((part) => part !== "").join(" — ");

export class BattleLog {
  private readonly rows: LogEntryView[] = [];
  private turn = 1;
  private tick = 0;
  private draft: Draft | null = null;
  /** The satchel line an `ItemUsed` leaves for the ability it resolves through. */
  private pendingItemNote: string | null = null;

  /** The whole record, oldest first. */
  get entries(): readonly LogEntryView[] {
    return this.rows;
  }

  /** The last `count` entries, oldest first. */
  tail(count: number): readonly LogEntryView[] {
    return count <= 0 ? [] : this.rows.slice(-count);
  }

  /**
   * File one command's batch. `after` and `before` are the states either side of
   * it: names are read from whichever still holds the unit, since an order can
   * take its own target off the board.
   */
  record(events: readonly BattleEvent[], after: GameState, before: GameState): void {
    this.turn = turnNumber(before);
    this.tick = battleClock(before);
    for (const event of events) this.consume(event, after, before);
    this.flush();
  }

  private consume(event: BattleEvent, after: GameState, before: GameState): void {
    switch (event.type) {
      case "BattleStarted":
        this.flush();
        this.simple("battle", `${battleEncounter(after).name} — the engagement opens`);
        return;
      case "TurnStarted": {
        this.flush();
        this.turn = event.turn;
        this.tick = event.clock;
        const actor = this.actor(event.unitId, after, before);
        this.simple("turn", `Turn ${event.turn} — ${actor.name}`, actor);
        return;
      }
      case "ClockAdvanced":
        this.tick = event.clock;
        return;
      case "AbilityUsed": {
        this.open("action", event.unitId, this.abilityName(event.unitId, event.abilityId, after, before), after, before);
        if (this.pendingItemNote !== null) {
          this.note(this.pendingItemNote);
          this.pendingItemNote = null;
        }
        // The aimed target is staged even when nothing landed on it, so an order
        // that did nothing still says what it was sent at.
        if (event.target.kind === "unit") this.target(event.target.unitId, after, before);
        if (event.target.kind === "object") this.target(event.target.objectId, after, before);
        return;
      }
      case "ItemUsed":
        this.pendingItemNote = `${event.remaining} left in the satchel`;
        return;
      case "AbilityCharging":
        this.open("action", event.unitId, this.abilityName(event.unitId, event.abilityId, after, before), after, before);
        this.note(`charge staged, cast speed ${event.castSpeed}`);
        return;
      case "AbilityChargeCancelled":
        this.open("action", event.unitId, this.abilityName(event.unitId, event.abilityId, after, before), after, before);
        this.note("charge cancelled");
        return;
      case "ReactionTriggered":
        this.open("action", event.unitId, this.abilityName(event.unitId, event.abilityId, after, before), after, before);
        this.note("reaction");
        return;
      case "ObjectActivated":
        this.open("action", event.unitId, `Operate — ${this.name(event.objectId, after, before)}`, after, before);
        return;
      case "ObjectTriggered":
        this.openObject("action", event.objectId, after, before);
        this.target(event.unitId, after, before);
        return;
      case "ObjectAttacked": {
        this.openObject("action", event.objectId, after, before);
        const target = this.target(event.targetUnitId, after, before);
        target.hit = event.hit;
        return;
      }
      case "UnitMoved":
        this.open("action", event.unitId, "Move", after, before);
        this.note(`to ${tileLabel(event.to)}`);
        return;
      case "UnitMoveUndone":
        this.open("action", event.unitId, "Move", after, before);
        this.note(`withdrawn, back at ${tileLabel(event.to)}`);
        return;
      case "UnitForcedMove":
        this.note(`${this.name(event.unitId, after, before)} moved to ${tileLabel(event.to)}`);
        return;
      case "AbilityMissed": {
        const target = this.target(event.targetUnitId, after, before);
        target.hit = false;
        return;
      }
      case "DamageDealt": {
        const target = this.target(event.unitId, after, before);
        target.hit = true;
        target.damage = (target.damage ?? 0) + event.amount;
        target.damageType = event.damageType;
        target.hpRemaining = event.hpRemaining;
        return;
      }
      case "Healed": {
        const target = this.target(event.unitId, after, before);
        target.hit = true;
        target.recovery = (target.recovery ?? 0) + event.amount;
        target.hpRemaining = event.hpRemaining;
        return;
      }
      case "ObjectDamaged": {
        const target = this.target(event.objectId, after, before);
        target.hit = true;
        target.damage = (target.damage ?? 0) + event.amount;
        target.hpRemaining = event.hpRemaining;
        return;
      }
      case "ObjectRepaired": {
        const target = this.target(event.objectId, after, before);
        target.hit = true;
        target.recovery = (target.recovery ?? 0) + event.amount;
        target.hpRemaining = event.hpRemaining;
        return;
      }
      case "StatusApplied": {
        const target = this.target(event.unitId, after, before);
        target.statuses.push({
          id: event.statusId,
          name: this.statusName(event.statusId, after),
          change: "applied",
          remainingTurns: event.turnsRemaining,
        });
        return;
      }
      case "StatusResisted": {
        const target = this.target(event.unitId, after, before);
        target.statuses.push({
          id: event.statusId,
          name: this.statusName(event.statusId, after),
          change: "resisted",
        });
        return;
      }
      case "StatusRemoved": {
        // Cleansed by an order, or simply run out: the difference is whether
        // anybody was acting when it went.
        const cleared = this.draft?.actor !== undefined;
        const target = this.target(event.unitId, after, before);
        target.statuses.push({
          id: event.statusId,
          name: this.statusName(event.statusId, after),
          change: cleared ? "cleared" : "expired",
        });
        return;
      }
      case "StatsModified": {
        const parts = Object.entries(event.mods)
          .filter((entry): entry is [StatKey, number] => typeof entry[1] === "number" && entry[1] !== 0)
          .map(([key, value]) => `${STAT_LABELS[key]} ${formatSigned(value)}`);
        if (parts.length === 0) return;
        const window =
          event.turnsRemaining === null ? "rest of battle" : `${event.turnsRemaining} turns`;
        this.note(`${this.name(event.unitId, after, before)} ${parts.join(" · ")} for ${window}`);
        return;
      }
      case "UnitDowned": {
        const existing = this.draft?.targets.get(event.unitId);
        if (existing !== undefined) {
          existing.downed = true;
          return;
        }
        const actor = this.actor(event.unitId, after, before);
        this.simple("death", `${actor.name} is down`, actor);
        return;
      }
      case "UnitSpawned": {
        this.flush();
        const actor = this.actor(event.unitId, after, before);
        this.simple(
          "join",
          `${actor.name} takes the field at ${tileLabel(event.position)} — ${allegiance(event.team)}`,
          actor,
        );
        return;
      }
      case "UnitRemoved": {
        const actor = this.actor(event.unitId, after, before);
        this.simple("left", `${actor.name} leaves the field`, actor);
        return;
      }
      case "ObjectSpawned": {
        const at = event.tiles[0];
        this.note(`${event.kind} placed${at === undefined ? "" : ` at ${tileLabel(at)}`}`);
        return;
      }
      case "ObjectDestroyed":
        this.note(`${this.name(event.objectId, after, before)} destroyed`);
        return;
      case "PowerChanged": {
        const name = this.name(event.objectId, after, before);
        const draft = this.ensure("grid");
        (event.powered ? draft.powerGained : draft.powerLost).push(name);
        return;
      }
      case "GridTripped":
        this.note(
          `${this.gridName(event.gridId, after)} tripped — ${event.load} against a rating of ${event.capacity}`,
        );
        return;
      case "GridReset":
        this.note(`${this.name(event.nodeId, after, before)} reclosed`);
        return;
      case "LineSevered":
        this.note(`${this.name(event.objectId, after, before)} cut`);
        return;
      case "LineSpliced":
        this.note(`${this.name(event.objectId, after, before)} spliced`);
        return;
      case "LoadAttached":
        this.note(
          `${this.name(event.nodeId, after, before)} takes ${event.amount} more draw${event.turns === null ? "" : ` for ${event.turns} turns`}`,
        );
        return;
      case "BattleEnded":
        this.flush();
        this.simple("battle", event.result === "win" ? "The field is held" : "The line is broken");
        return;
      default:
        // Turn ends, clock housekeeping, dialogue, standing and grid recomputes
        // are reported by the panels that own them; the record stays readable.
        return;
    }
  }

  // --- draft plumbing -------------------------------------------------------

  private open(
    kind: LogEntryView["kind"],
    unitId: string,
    action: string,
    after: GameState,
    before: GameState,
  ): void {
    this.flush();
    this.draft = this.blank(kind, this.actor(unitId, after, before), action);
  }

  private openObject(
    kind: LogEntryView["kind"],
    objectId: string,
    after: GameState,
    before: GameState,
  ): void {
    this.flush();
    const name = this.name(objectId, after, before);
    this.draft = this.blank(kind, { id: objectId, name, team: null }, name);
  }

  /** The open entry, or a bare one for a consequence nobody ordered. */
  private ensure(kind: LogEntryView["kind"]): Draft {
    this.draft ??= this.blank(kind, undefined, undefined);
    return this.draft;
  }

  private blank(
    kind: LogEntryView["kind"],
    actor: LogActorView | undefined,
    action: string | undefined,
  ): Draft {
    return {
      kind,
      turn: this.turn,
      tick: this.tick,
      actor,
      action,
      targets: new Map(),
      notes: [],
      powerGained: [],
      powerLost: [],
    };
  }

  private note(text: string): void {
    this.ensure("effect").notes.push(text);
  }

  private target(id: string, after: GameState, before: GameState): MutableTarget {
    const draft = this.ensure("effect");
    const existing = draft.targets.get(id);
    if (existing !== undefined) return existing;
    const unit = getUnit(after, id) ?? getUnit(before, id);
    const fresh: MutableTarget = {
      id,
      name: this.name(id, after, before),
      team: unit?.team,
      hit: null,
      damage: undefined,
      damageType: undefined,
      recovery: undefined,
      hpRemaining: undefined,
      statuses: [],
      downed: false,
    };
    draft.targets.set(id, fresh);
    return fresh;
  }

  private simple(kind: LogEntryView["kind"], text: string, actor?: LogActorView): void {
    this.rows.push({
      index: this.rows.length,
      kind,
      turn: this.turn,
      tick: this.tick,
      ...(actor === undefined ? {} : { actor }),
      targets: [],
      notes: [],
      text,
    });
  }

  private flush(): void {
    const draft = this.draft;
    this.draft = null;
    if (draft === null) return;
    const notes = [...draft.notes];
    if (draft.powerLost.length > 0) notes.push(`${machineList(draft.powerLost)} lost power`);
    if (draft.powerGained.length > 0) notes.push(`${machineList(draft.powerGained)} came back up`);
    const targets: LogTargetView[] = [...draft.targets.values()].map((target) => ({
      id: target.id,
      name: target.name,
      ...(target.team === undefined ? {} : { team: target.team }),
      hit: target.hit,
      ...(target.damage === undefined ? {} : { damage: target.damage }),
      ...(target.damageType === undefined ? {} : { damageType: target.damageType }),
      ...(target.recovery === undefined ? {} : { recovery: target.recovery }),
      ...(target.hpRemaining === undefined ? {} : { hpRemaining: target.hpRemaining }),
      statuses: target.statuses,
      downed: target.downed,
    }));
    if (targets.length === 0 && notes.length === 0 && draft.action === undefined) return;
    const head =
      draft.actor === undefined
        ? ""
        : draft.action === undefined
          ? draft.actor.name
          : `${draft.actor.name} — ${draft.action}`;
    this.rows.push({
      index: this.rows.length,
      kind: draft.kind,
      turn: draft.turn,
      tick: draft.tick,
      ...(draft.actor === undefined ? {} : { actor: draft.actor }),
      ...(draft.action === undefined ? {} : { action: draft.action }),
      targets,
      notes,
      text: join([head, this.targetsText(targets, notes), notes.join("; ")]),
    });
  }

  /**
   * "No effect" means "no damage or recovery figure", and the clause right after
   * it named the effect: `Throw the Breaker — Freight Lift: no effect — Freight
   * Lift came back up`. So a target the rules recorded nothing against says so
   * only when nothing else in the line does.
   */
  private targetsText(targets: readonly LogTargetView[], notes: readonly string[]): string {
    const named = targets.map(targetClause).filter((clause): clause is string => clause !== null);
    if (named.length > 0 || targets.length === 0) return named.join("; ");
    if (notes.length > 0) return "";
    return targets.map((target) => `${target.name}: no effect`).join("; ");
  }

  // --- naming ---------------------------------------------------------------

  private actor(id: string, after: GameState, before: GameState): LogActorView {
    const unit = getUnit(after, id) ?? getUnit(before, id);
    if (unit !== null) return { id, name: unit.unit.name, team: unit.team };
    return { id, name: this.name(id, after, before), team: null };
  }

  /** A unit's or a machine's name, from whichever state still has it. */
  private name(id: string, after: GameState, before: GameState): string {
    const unit = getUnit(after, id) ?? getUnit(before, id);
    if (unit !== null) return unit.unit.name;
    const object = getObject(after, id) ?? getObject(before, id);
    return object?.def.name ?? id;
  }

  private abilityName(
    unitId: string,
    abilityId: string,
    after: GameState,
    before: GameState,
  ): string {
    const ability = getAbility(after, unitId, abilityId) ?? getAbility(before, unitId, abilityId);
    return ability?.name ?? abilityId;
  }

  private statusName(statusId: string, state: GameState): string {
    return getStatus(state, statusId)?.name ?? statusId;
  }

  private gridName(gridId: string, state: GameState): string {
    return powerRegister(state).grids.find((section) => section.gridId === gridId)?.name ?? gridId;
  }
}
