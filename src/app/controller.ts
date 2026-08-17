// The game loop. Owns the one authoritative `GameState`, translates UI intents
// into core commands, and routes the resulting events three ways: visual events
// into the presentation queue, `DialogueRequested` into the dialogue box, and
// `BattleEnded` into the end banner.
//
// It talks to the renderer and the UI through the two small ports below, never
// to Three.js or the DOM directly, so the whole loop is constructible in a test
// with fakes on both sides.
//
// Phase machine (`ControllerPhase`):
//
//   presenting --(queue drained)--> dialogue --(player closed it)--> player
//        ^                              |                             |
//        |                              v                             v
//        +---------- command applied ---+------------------------- ai / ended
//
// The queue must drain before the next turn's menu opens; `skipPresentation()`
// (the X key) jumps every pending animation to its terminal state and lets the
// machine move on immediately.

import {
  abilityInfo,
  activeUnit,
  affectedTiles,
  aimTarget,
  allObjects,
  allUnits,
  applyCommand,
  battleMap,
  battleResult,
  getObject,
  gridFlipPreview,
  gridRestoringTies,
  objectEnergized,
  objectOperationPreview,
  powerRegister,
  getUnit,
  itemAbilityId,
  itemIdFromAbilityId,
  legalTargetTiles,
  reachableTiles,
  targetableTiles,
  type BattleEvent,
  type BattleResult,
  type BattleUnit,
  type Command,
  type CommandError,
  type GameState,
  type GridRegisterNode,
  type GridRegisterSection,
  type PowerCause,
  type TargetRef,
} from "../core/index.js";
import type { DialogueLine, Facing, TileCoord } from "../data/index.js";
import { toRenderEventList, viewModelFromGameState } from "../render/adapter.js";
import { palette } from "../render/palette.js";
import type { RenderEvent } from "../render/presentation.js";
import type { MovePreview } from "../render/scene.js";
import type { BattleViewModel } from "../render/viewmodel.js";
import type {
  BattleHudView,
  HudMode,
  NoticeTone,
  TargetRef as UiTargetRef,
  UiIntents,
} from "../ui/index.js";
import { battleHudView, forecastView, operateForecastView } from "./viewmodels.js";

export type ControllerPhase = "presenting" | "dialogue" | "player" | "ai" | "ended";

export interface HighlightStyle {
  opacity?: number;
  yOffset?: number;
  inset?: number;
}

/** What the controller needs from the 3D layer. `BattleRenderer` implements it. */
export interface RendererPort {
  buildScene(view: BattleViewModel): void;
  applyRenderEvents(events: readonly RenderEvent[]): void;
  setHighlight(
    layerId: string,
    tiles: readonly TileCoord[],
    color: number,
    options?: HighlightStyle,
  ): void;
  clearHighlight(layerId: string): void;
  /** Stand a unit on a tile it has not moved to; `null` puts it back. */
  setMovePreview(preview: MovePreview | null): void;
  skipPresentation(): void;
  isPresentationIdle(): boolean;
}

/** What the controller needs from the DOM overlay. */
export interface UiPort {
  /** Draw a fresh set of view models. Must not restart an open dialogue. */
  render(view: BattleHudView): void;
  /**
   * What the game is asking for now. The HUD announces it and styles itself
   * around it; nothing else in the overlay has to infer the phase.
   */
  setMode(mode: HudMode, detail?: string | null): void;
  /**
   * The staged action is away. The forecast keeps its numbers as the record of
   * what was ordered but must stop offering to send it again.
   */
  lockForecast(): void;
  /** The field is closed: clear every live affordance and settle on the truth. */
  showFinalState(view: BattleHudView | null, result: BattleResult | null): void;
  showDialogue(lines: DialogueLine[]): void;
  hideDialogue(): void;
  showResult(result: BattleResult): void;
  /** Ask the player which way the unit faces before its turn closes. */
  promptFacing(current: Facing, onPick: (facing: Facing) => void, onCancel: () => void): void;
  closePrompt(): void;
  /** Return any open submenu to the root: the staged action is spent. */
  resetMenus(): void;
  /**
   * Menus stop taking input while the presentation plays or the AI acts, so a
   * click can never land against a HUD that is one animation out of date.
   */
  setBusy(busy: boolean): void;
  /** Brief, non-modal feedback. `tone` separates a refusal from a report. */
  notify?(message: string, tone?: NoticeTone): void;
}

type Selection =
  | { mode: "none" }
  | { mode: "move"; pending: TileCoord | null }
  | { mode: "target"; abilityId: string; pending: TargetRef | null }
  | { mode: "facing" };

export interface ControllerOptions {
  state: GameState;
  /** Events `createBattle` returned; replayed like any other batch. */
  events?: readonly BattleEvent[];
  renderer: RendererPort;
  ui: UiPort;
  /** Enemy decision function. Defaults to `stubAiCommand`. */
  ai?: (state: GameState) => Command | null;
  turnOrderCount?: number;
}

const LAYER_MOVE = "move-range";
const LAYER_MOVE_PICK = "move-pick";
const LAYER_TARGET = "target-range";
const LAYER_TARGET_REACH = "target-reach";
const LAYER_AFFECTED = "affected";
/**
 * The component a staged grid order would flip. Three of the aim layers are
 * already BLOOD_300 separated only by opacity, so this takes OVERLOAD_500: it
 * is the flux colour, there was no flux colour in the tile overlays at all, and
 * a bus about to change state is exactly flux-borne (FLUX_GRID §2.5c).
 */
const LAYER_GRID_FLIP = "grid-flip";

/**
 * Seconds between AI commands, so enemy turns are watchable. The animations
 * either side of it already separate the beats; this is only the join, and a
 * full enemy round pays it two or three times per unit.
 */
const AI_STEP_SECONDS = 0.18;

const sameTile = (a: TileCoord, b: TileCoord): boolean => a.x === b.x && a.y === b.y;

const sameTarget = (a: TargetRef, b: TargetRef): boolean => {
  if (a.kind !== b.kind) return false;
  if (a.kind === "tile" && b.kind === "tile") return sameTile(a.tile, b.tile);
  if (a.kind === "unit" && b.kind === "unit") return a.unitId === b.unitId;
  if (a.kind === "object" && b.kind === "object") return a.objectId === b.objectId;
  return false;
};

const powerSnapshot = (state: GameState): Map<string, boolean> => {
  const out = new Map<string, boolean>();
  for (const object of allObjects(state)) {
    if (object.powered !== null) out.set(object.def.id, objectEnergized(state, object.def.id));
  }
  return out;
};

/** Two names read; more than two are a count, because machine names are long. */
const machineList = (names: readonly string[]): string =>
  names.length <= 2 ? names.join(" and ") : `${names.length} machines`;

/**
 * What the player's own hand on the lever actually did to the circuit. A
 * reclose that blows again on the same pass is the whole tug-of-war in one
 * beat, and it is exactly what "West Main operated." was hiding.
 */
function operateVerb(state: GameState, objectId: string, events: readonly BattleEvent[]): string {
  if (events.some((event) => event.type === "GridReset" && event.nodeId === objectId)) {
    return "reclosed";
  }
  const node = registerNode(state, objectId);
  const object = getObject(state, objectId);
  if (node === null || object === null || object.powered === null) return "operated";
  if (node.role === "source") return object.powered ? "put back in" : "pulled";
  return object.powered ? "closed" : "opened";
}

/**
 * What the machine actually did, not that it was touched. A switch usually
 * changes something else on the floor — e2's mains carry three presses — and
 * "Floor Nine Mains operated." left the player to discover the consequence by
 * walking up to a press and finding its controls dead.
 *
 * On a grid the player's answer-verb reports in the same voice the enemy's does
 * (FLUX_GRID §2.5b): naming the machine is not naming the consequence.
 */
function operateNotice(
  state: GameState,
  name: string,
  objectId: string,
  before: Map<string, boolean>,
  events: readonly BattleEvent[],
): string {
  const verb = operateVerb(state, objectId, events);
  const trip = events.find(
    (event): event is Extract<BattleEvent, { type: "GridTripped" }> => event.type === "GridTripped",
  );
  if (trip !== undefined) {
    const tie = tieClause(state, trip.gridId);
    const answer =
      verb === "reclosed"
        ? tie === null
          ? "Shed a load before it will hold."
          : `Shed a load, or take the ${tie}.`
        : "Someone has to reclose it.";
    const blew = verb === "reclosed" ? "tripped again" : "the bus tripped";
    return `${name} ${verb} — ${blew}, ${trip.load} against a rating of ${trip.capacity}. ${answer}`;
  }

  const lost: string[] = [];
  const gained: string[] = [];
  for (const object of allObjects(state)) {
    if (object.powered === null) continue;
    const now = objectEnergized(state, object.def.id);
    const was = before.get(object.def.id);
    if (was === undefined || was === now) continue;
    (now ? gained : lost).push(object.def.name);
  }
  const clauses: string[] = [];
  if (lost.length > 0) clauses.push(`${machineList(lost)} lost power`);
  if (gained.length > 0) clauses.push(`${machineList(gained)} came back up`);
  if (clauses.length === 0) return `${name} ${verb}.`;
  return `${name} ${verb} — ${clauses.join("; ")}.`;
}

/** The switch that carries these machines, if the floor has one. */
function switchFor(state: GameState, objectIds: readonly string[]): string | null {
  for (const object of allObjects(state)) {
    if (object.destroyed || object.def.operable === null) continue;
    if (objectIds.some((id) => object.def.operable?.targetObjectIds.includes(id) === true)) {
      return object.def.name;
    }
  }
  return null;
}

/** The object's name, or its id when the map has lost track of it. */
const objectName = (state: GameState, objectId: string): string =>
  getObject(state, objectId)?.def.name ?? objectId;

/** The tie that would answer this, named — asked of core, never guessed. */
function tieClause(state: GameState, gridId: string): string | null {
  const tie = gridRestoringTies(state, gridId)[0];
  return tie === undefined ? null : objectName(state, tie);
}

/** Every register row of a grid, buses first, then whatever is on none of them. */
const sectionNodes = (section: GridRegisterSection): GridRegisterNode[] => [
  ...section.components.flatMap((component) => component.nodes),
  ...section.outOfCircuit,
];

/** Every source latched open on a grid right now, off the register. */
function trippedSources(state: GameState, gridId: string): GridRegisterNode[] {
  const section = powerRegister(state).grids.find((entry) => entry.gridId === gridId);
  if (section === undefined) return [];
  return sectionNodes(section).filter((node) => node.state === "tripped");
}

/**
 * The source that latched open in *this* settle, named.
 *
 * Taking the first tripped node in register order names whichever main sorts
 * first, which on a house running on two of them is the one that blew a turn
 * ago: closing the west feeder onto a bus the east main had already left
 * announced "East Main tripped" while the west main was the one going out. So
 * the latch is diffed against what it was before the order, and only what is
 * newly latched gets named.
 */
function trippedSourceName(state: GameState, before: GameState, gridId: string): string | null {
  const now = trippedSources(state, gridId);
  if (now.length === 0) {
    return powerRegister(state).grids.find((entry) => entry.gridId === gridId)?.name ?? null;
  }
  const was = new Set(trippedSources(before, gridId).map((node) => node.objectId));
  const fresh = now.filter((node) => !was.has(node.objectId));
  return machineList((fresh.length === 0 ? now : fresh).map((node) => node.name));
}

/** The register's own row for an object, when it is a node of a declared grid. */
function registerNode(state: GameState, objectId: string): GridRegisterNode | null {
  for (const section of powerRegister(state).grids) {
    const found = sectionNodes(section).find((node) => node.objectId === objectId);
    if (found !== undefined) return found;
  }
  return null;
}

/**
 * The grid's own annunciator. The register tells the player the state; this
 * tells them the verb that answers it, because a mechanic whose counterplay has
 * to be inferred is a mechanic that measures well and plays badly
 * (FLUX_GRID §2.5b, and the e2 lesson it operationalises).
 *
 * One line, always: the notice strip shows one at a time, so three lines that
 * overwrite each other are worse than one dense one.
 */
function gridNotice(
  state: GameState,
  events: readonly BattleEvent[],
  before: GameState,
): string | null {
  const trip = events.find(
    (event): event is Extract<BattleEvent, { type: "GridTripped" }> =>
      event.type === "GridTripped",
  );
  if (trip !== undefined) {
    const name = trippedSourceName(state, before, trip.gridId);
    return `${name ?? "The main"} tripped — ${trip.load} against a rating of ${trip.capacity}. Someone has to reclose it.`;
  }

  const lost: string[] = [];
  const gained: string[] = [];
  // What went dark names the line; what came back names it only if nothing did.
  let darkCause: PowerCause | null = null;
  let anyCause: PowerCause | null = null;
  for (const event of events) {
    if (event.type !== "PowerChanged" || event.cause === undefined) continue;
    (event.powered ? gained : lost).push(objectName(state, event.objectId));
    anyCause ??= event.cause;
    if (!event.powered) darkCause ??= event.cause;
  }
  const found = darkCause ?? anyCause;
  if (found === null) return null;
  // An order that opens a node and then wrecks it reports the isolator first,
  // because that is the effect that took the branch dark. Destruction outranks
  // it: the player told to throw it back would be standing at rubble.
  const wrecked = new Set(
    events.filter((event) => event.type === "ObjectDestroyed").map((event) => event.objectId),
  );
  const cause: PowerCause = wrecked.has(found.nodeId) ? { ...found, reason: "destroyed" } : found;

  const node = objectName(state, cause.nodeId);
  const tie = tieClause(state, cause.gridId);
  if (lost.length === 0) {
    const back = `${machineList(gained)} came back up.`;
    if (events.some((event) => event.type === "LineSpliced")) return `${node} spliced. ${back}`;
    if (events.some((event) => event.type === "GridReset")) return `${node} reclosed. ${back}`;
    return `${node} closed. ${back}`;
  }
  const dark = `${machineList(lost)} dark.`;
  switch (cause.reason) {
    case "cut":
      return `${node} cut. ${dark} Splice it${tie === null ? "" : ` or take the ${tie}`}.`;
    case "destroyed":
      return tie === null
        ? `${node} destroyed. ${dark} Nothing on this grid feeds them now.`
        : `${node} destroyed. ${dark} Take the ${tie} — a wreck does not splice.`;
    default:
      return `${node} opened. ${dark} Throw it back${tie === null ? "" : `, or take the ${tie}`}.`;
  }
}

/**
 * Power that went out without the player throwing anything. The enemy cutting
 * the mains on Floor Nine used to be invisible — the presses simply stopped
 * answering, and a player not standing beside one never learned the floor had a
 * lever on it at all. Naming the switch that carries them says the cut is a
 * position to be fought over, not a fact of the map.
 */
function powerChangeNotice(
  state: GameState,
  events: readonly BattleEvent[],
  before: GameState,
): string | null {
  const gridded = gridNotice(state, events, before);
  if (gridded !== null) return gridded;
  const lost: string[] = [];
  const gained: string[] = [];
  const lostIds: string[] = [];
  for (const event of events) {
    if (event.type !== "PowerChanged") continue;
    const name = getObject(state, event.objectId)?.def.name ?? event.objectId;
    if (event.powered) {
      gained.push(name);
    } else {
      lost.push(name);
      lostIds.push(event.objectId);
    }
  }
  if (lost.length === 0 && gained.length === 0) return null;
  if (lost.length === 0) return `${machineList(gained)} came back up.`;
  const carrier = switchFor(state, lostIds);
  const carried = lost.length === 1 ? "it" : "them";
  const lever = carrier === null ? "" : ` ${carrier} carries ${carried}, and it works both ways.`;
  const rest = gained.length === 0 ? "" : ` ${machineList(gained)} came back up.`;
  return `${machineList(lost)} lost power.${lever}${rest}`;
}

const facingToward = (from: TileCoord, to: TileCoord): Facing => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "east" : "west";
  return dy >= 0 ? "south" : "north";
};

export class BattleController {
  readonly intents: UiIntents;

  private gameState: GameState;
  private readonly renderer: RendererPort;
  private readonly ui: UiPort;
  private readonly ai: (state: GameState) => Command | null;
  private readonly turnOrderCount: number;

  private currentPhase: ControllerPhase = "presenting";
  private selection: Selection = { mode: "none" };
  private pendingDialogue: DialogueLine[] = [];
  private dialogueShown = false;
  private inspectedUnitId: string | null = null;
  private inspectedObjectId: string | null = null;
  /** The machine the Operate cursor is resting on, forecast but not sent. */
  private previewedOperable: string | null = null;
  private awaitingPresentation = false;
  private aiTimer = 0;
  private moveTargets: TileCoord[] = [];
  /** The tile the move cursor is standing the acting unit on, if any. */
  private previewedMove: TileCoord | null = null;
  private aimTargets: TileCoord[] = [];
  private aimReach: TileCoord[] = [];
  private lastCommandError: CommandError | null = null;
  private started = false;
  /** Set while the player's own Operate is in flight; it reports itself. */
  private operating = false;
  /** The events the last command settled into, for a notice composed after it. */
  private lastBatch: readonly BattleEvent[] = [];

  constructor(options: ControllerOptions) {
    this.gameState = options.state;
    this.renderer = options.renderer;
    this.ui = options.ui;
    this.ai = options.ai ?? (() => null);
    this.turnOrderCount = options.turnOrderCount ?? 6;
    this.intents = this.buildIntents();
    this.startupEvents = options.events ?? [];
  }

  private readonly startupEvents: readonly BattleEvent[];

  get state(): GameState {
    return this.gameState;
  }

  get phase(): ControllerPhase {
    return this.currentPhase;
  }

  /** True while the action menu owns the keyboard; camera pan keys stand down. */
  get menuOpen(): boolean {
    return this.currentPhase === "player";
  }

  get lastError(): CommandError | null {
    return this.lastCommandError;
  }

  get dialogue(): readonly DialogueLine[] {
    return this.pendingDialogue;
  }

  /** Build the scene, play the opening events, and hand over the first turn. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.renderer.buildScene(viewModelFromGameState(this.gameState));
    this.consume(this.startupEvents, this.gameState, this.gameState);
    this.refresh();
    this.advance();
  }

  /** Called once per frame. Drains the queue, then paces the AI. */
  tick(deltaSeconds: number): void {
    if (this.currentPhase === "presenting") {
      if (this.renderer.isPresentationIdle()) this.advance();
      return;
    }
    if (this.currentPhase !== "ai") return;
    this.aiTimer += Math.max(0, deltaSeconds);
    if (this.aiTimer < AI_STEP_SECONDS) return;
    this.aiTimer = 0;
    this.stepAi();
  }

  /** X: finish every queued animation immediately. */
  skipPresentation(): void {
    this.renderer.skipPresentation();
    if (this.currentPhase === "presenting") this.advance();
  }

  /**
   * The cursor over the field. A unit answers first, then the machinery
   * standing on the tile: on a grid map the machines are the terrain, and
   * "what is this and is it being fed" was a question only the register could
   * answer, by name, for something the player was already pointing at.
   */
  onTileHover(tile: TileCoord | null): void {
    if (this.currentPhase !== "player") return;
    const acting = activeUnit(this.gameState);
    const hovered = tile === null ? null : this.unitAt(tile);
    this.inspectedObjectId = hovered !== null || tile === null ? null : this.objectAt(tile);
    this.inspectedUnitId = hovered?.id ?? acting?.id ?? null;
    this.previewMove(tile);
    this.refresh();
  }

  /**
   * FFT's move preview: with Move open, the tile under the cursor is where the
   * unit would be standing, so height, adjacency and facing lines are read off
   * the figure itself instead of imagined from a highlight. Nothing here is a
   * command — the renderer displaces a billboard and the game state never hears
   * about it.
   *
   * It hangs off the one hover entry point, so a keyboard cursor over the tiles
   * drives it exactly as the pointer does (UI_DESIGN §8's parity rule).
   */
  private previewMove(tile: TileCoord | null): void {
    const acting = activeUnit(this.gameState);
    if (
      tile === null ||
      acting === null ||
      this.currentPhase !== "player" ||
      this.selection.mode !== "move" ||
      // The unit's own tile is a legal zero-distance move with nothing to show:
      // it is already standing there.
      sameTile(acting.position, tile) ||
      !this.moveTargets.some((candidate) => sameTile(candidate, tile))
    ) {
      this.clearMovePreview();
      return;
    }
    if (this.previewedMove !== null && sameTile(this.previewedMove, tile)) return;
    this.previewedMove = { ...tile };
    this.renderer.setMovePreview({ unitId: acting.id, tile: { ...tile } });
  }

  private clearMovePreview(): void {
    if (this.previewedMove === null) return;
    this.previewedMove = null;
    this.renderer.setMovePreview(null);
  }

  /**
   * Cursor click. Pick-then-confirm throughout: the first click on a legal tile
   * stages the choice and shows what it would do, the second commits it.
   */
  onTileClick(tile: TileCoord | null): void {
    if (this.currentPhase !== "player" || tile === null) return;
    const acting = activeUnit(this.gameState);
    if (acting === null) return;

    switch (this.selection.mode) {
      case "none": {
        const unit = this.unitAt(tile);
        this.intents.inspectUnit(unit?.id ?? null);
        return;
      }
      case "move": {
        if (!this.moveTargets.some((candidate) => sameTile(candidate, tile))) {
          this.refuse("No path there");
          return;
        }
        if (this.selection.pending !== null && sameTile(this.selection.pending, tile)) {
          this.intents.confirmMove(acting.id, tile);
          return;
        }
        this.selection = { mode: "move", pending: { ...tile } };
        this.renderer.setHighlight(LAYER_MOVE_PICK, [tile], palette.highlightPath, {
          opacity: 0.45,
          yOffset: 0.04,
        });
        this.refresh();
        return;
      }
      case "target": {
        const abilityId = this.selection.abilityId;
        const target = this.aimTargets.some((candidate) => sameTile(candidate, tile))
          ? aimTarget(this.gameState, acting.id, abilityId, tile)
          : null;
        if (target === null) {
          this.refuse(this.aimRefusal(acting, abilityId, tile));
          return;
        }
        if (this.selection.pending !== null && sameTarget(this.selection.pending, target)) {
          this.commitAct(acting.id, abilityId, target);
          return;
        }
        this.selection = { mode: "target", abilityId, pending: target };
        this.renderer.setHighlight(
          LAYER_AFFECTED,
          affectedTiles(this.gameState, acting.id, abilityId, target),
          palette.highlightTarget,
          { opacity: 0.5, yOffset: 0.045 },
        );
        this.markGridFlip(acting.id, abilityId, target);
        this.refresh();
        return;
      }
      case "facing": {
        this.commitWait(acting.id, facingToward(acting.position, tile));
        return;
      }
    }
  }

  // --- intents --------------------------------------------------------------

  private buildIntents(): UiIntents {
    const noop = (): void => undefined;
    return {
      beginMove: (unitId) => this.beginMove(unitId),
      confirmMove: (unitId, tile) => this.dispatch({ kind: "move", unitId, to: tile }),
      selectAbility: (unitId, abilityId) => this.selectAbility(unitId, abilityId),
      confirmTarget: (unitId, abilityId, target) =>
        this.commitAct(unitId, abilityId, this.resolveUiTarget(unitId, abilityId, target)),
      // An item is aimed through its synthesized ability, so targeting, the
      // affected-tile overlay and the forecast are the ability path unchanged;
      // only the command that finally goes out is different.
      selectItem: (unitId, itemId) => this.selectAbility(unitId, itemAbilityId(itemId)),
      confirmItemTarget: (unitId, itemId, target) => {
        const abilityId = itemAbilityId(itemId);
        this.commitAct(unitId, abilityId, this.resolveUiTarget(unitId, abilityId, target));
      },
      activateObject: (unitId, objectId) => this.operate(unitId, objectId),
      previewOperable: (unitId, objectId) => this.previewOperable(unitId, objectId),
      cancelSelection: () => {
        this.clearSelection();
        this.refresh();
      },
      wait: (unitId, facing) => this.beginWait(unitId, facing),
      inspectUnit: (unitId) => {
        this.inspectedUnitId = unitId ?? activeUnit(this.gameState)?.id ?? null;
        this.refresh();
      },
      advanceDialogue: noop,
      endDialogue: () => this.endDialogue(),
      // Progression intents belong to the between-battle layer
      // (`src/app/campaign.ts`), which owns its own routing. Inert here.
      selectRosterUnit: noop,
      openUnitSheet: noop,
      openLearning: noop,
      openEquipment: noop,
      openJobs: noop,
      learnAbility: noop,
      equipItem: noop,
      setAbilitySlot: noop,
      changeJob: noop,
      setSecondaryJob: noop,
      beginDeployment: noop,
      toggleDeployment: noop,
      assignDeployment: noop,
      confirmDeployment: noop,
      closeScreen: noop,
    };
  }

  private beginMove(unitId: string): void {
    if (this.currentPhase !== "player") return;
    this.clearSelection();
    this.moveTargets = reachableTiles(this.gameState, unitId)
      .filter((reachable) => reachable.canStop)
      .map((reachable) => reachable.tile);
    this.selection = { mode: "move", pending: null };
    this.renderer.setHighlight(LAYER_MOVE, this.moveTargets, palette.highlightMove, {
      opacity: 0.3,
    });
    this.refresh();
  }

  private selectAbility(unitId: string, abilityId: string): void {
    if (this.currentPhase !== "player") return;
    this.clearSelection();
    const ability = abilityInfo(this.gameState, unitId, abilityId);
    if (ability === null || ability.slot !== "action") return;
    // Faint layer: how far the ability carries. Bright layer: what it may
    // actually be sent at. Nothing outside the bright one ever arms a forecast.
    this.aimReach = targetableTiles(this.gameState, unitId, abilityId);
    this.aimTargets = legalTargetTiles(this.gameState, unitId, abilityId);
    this.selection = { mode: "target", abilityId, pending: null };
    this.renderer.setHighlight(LAYER_TARGET_REACH, this.aimReach, palette.highlightTarget, {
      opacity: 0.1,
    });
    this.renderer.setHighlight(LAYER_TARGET, this.aimTargets, palette.highlightTarget, {
      opacity: 0.32,
    });

    // Self-only abilities have nothing to aim: stage the caster straight away.
    const targets = ability.targeting.validTargets;
    if (targets.length === 1 && targets[0] === "self") {
      const staged: TargetRef = { kind: "unit", unitId };
      this.selection = { mode: "target", abilityId, pending: staged };
      this.markGridFlip(unitId, abilityId, staged);
    }
    this.refresh();
  }

  /**
   * Mark every node the staged order would flip, in the same overlay the area
   * highlight uses. Core answers the hypothetical off the recompute the rules
   * run, so there is no second model of the graph on this side of the seam.
   */
  private markGridFlip(unitId: string, abilityId: string, target: TargetRef): void {
    this.markFlipped(gridFlipPreview(this.gameState, unitId, abilityId, target));
  }

  private markFlipped(flipped: readonly string[]): void {
    if (flipped.length === 0) {
      this.renderer.clearHighlight(LAYER_GRID_FLIP);
      return;
    }
    const tiles = flipped.flatMap(
      (objectId) => getObject(this.gameState, objectId)?.def.tiles.map((tile) => ({ ...tile })) ?? [],
    );
    this.renderer.setHighlight(LAYER_GRID_FLIP, tiles, palette.overloadViolet, {
      opacity: 0.42,
      yOffset: 0.05,
    });
  }

  /**
   * The Operate cursor resting on a machine. It forecasts the order and marks
   * the component it would flip, off the same recompute the rules run — the
   * aim-time affordance every other order already had.
   */
  private previewOperable(unitId: string, objectId: string | null): void {
    if (this.currentPhase !== "player") return;
    this.previewedOperable = objectId;
    if (objectId === null) {
      this.renderer.clearHighlight(LAYER_GRID_FLIP);
      this.refresh();
      return;
    }
    this.markFlipped(objectOperationPreview(this.gameState, unitId, objectId));
    this.refresh();
  }

  private beginWait(unitId: string, facing: Facing): void {
    if (this.currentPhase !== "player") return;
    this.clearSelection();
    this.selection = { mode: "facing" };
    this.refresh();
    this.ui.promptFacing(
      facing,
      (picked) => this.commitWait(unitId, picked),
      () => {
        this.clearSelection();
        this.refresh();
      },
    );
  }

  private commitWait(unitId: string, facing: Facing): void {
    this.ui.closePrompt();
    this.dispatch({ kind: "wait", unitId, facing });
  }

  /**
   * Operating machinery is the one player action whose whole result is a state
   * change on a map object. The renderer flashes the seams; the HUD says which
   * machine answered and what it did, or the player is left guessing whether
   * the click landed.
   */
  private operate(unitId: string, objectId: string): void {
    const name = getObject(this.gameState, objectId)?.def.name ?? "Machinery";
    const before = powerSnapshot(this.gameState);
    this.operating = true;
    const sent = this.dispatch({ kind: "activateObject", unitId, objectId });
    this.operating = false;
    if (!sent) return;
    this.ui.notify?.(
      operateNotice(this.gameState, name, objectId, before, this.lastBatch),
      "machine",
    );
  }

  private commitAct(unitId: string, abilityId: string, target: TargetRef | null): void {
    if (target === null) return;
    const itemId = itemIdFromAbilityId(abilityId);
    if (itemId !== null) {
      this.dispatch({ kind: "useItem", unitId, itemId, target });
      return;
    }
    this.dispatch({ kind: "act", unitId, abilityId, target });
  }

  /** The staged selection is authoritative; the reported target is a fallback. */
  private resolveUiTarget(
    unitId: string,
    abilityId: string,
    target: UiTargetRef,
  ): TargetRef | null {
    if (this.selection.mode === "target" && this.selection.abilityId === abilityId) {
      if (this.selection.pending !== null) return this.selection.pending;
    }
    if (target.kind === "self") return { kind: "unit", unitId };
    if (target.kind === "unit") return { kind: "unit", unitId: target.unitId };
    if (target.kind === "object") return { kind: "object", objectId: target.objectId };
    return { kind: "tile", tile: target.tile };
  }

  private endDialogue(): void {
    this.pendingDialogue = [];
    this.dialogueShown = false;
    this.ui.hideDialogue();
    if (this.currentPhase === "dialogue") this.advance();
  }

  // --- command plumbing -----------------------------------------------------

  private dispatch(command: Command): boolean {
    const before = this.gameState;
    const result = applyCommand(this.gameState, command);
    if (result.error !== null) {
      this.lastCommandError = result.error;
      this.ui.notify?.(result.error.message, "refusal");
      this.refresh();
      return false;
    }
    this.lastCommandError = null;
    this.lastBatch = result.events;
    this.gameState = result.state;
    this.clearSelection();
    // The forecast stays up through the presentation as the record of what was
    // ordered, but it is describing an action already in flight: kill the stamp
    // now rather than when the queue finally drains.
    this.ui.lockForecast();
    this.ui.resetMenus();
    this.consume(result.events, result.state, before);
    // No refresh here: the HUD must not jump ahead of the animation it is
    // describing. `advance` redraws it once the queue is drained.
    this.advance();
    return true;
  }

  private consume(
    events: readonly BattleEvent[],
    stateAfter: GameState,
    stateBefore: GameState,
  ): void {
    // Spawns are the only beats with no animation of their own; removal,
    // contact triggers and machine fire all present themselves now.
    const rebuilds = new Set(["UnitSpawned", "ObjectSpawned"]);
    if (events.some((event) => rebuilds.has(event.type))) {
      this.renderer.buildScene(viewModelFromGameState(stateAfter));
    }
    const renderEvents = toRenderEventList(events, stateAfter);
    if (renderEvents.length > 0) this.renderer.applyRenderEvents(renderEvents);
    for (const event of events) {
      if (event.type === "DialogueRequested") this.pendingDialogue.push(...event.lines);
    }
    if (!this.operating) {
      const notice = powerChangeNotice(stateAfter, events, stateBefore);
      if (notice !== null) this.ui.notify?.(notice, "machine");
    }
    this.awaitingPresentation = renderEvents.length > 0;
  }

  /** Decide what happens next now that the last batch has been consumed. */
  private advance(): void {
    if (this.awaitingPresentation && !this.renderer.isPresentationIdle()) {
      this.setPhase("presenting");
      return;
    }
    this.awaitingPresentation = false;

    if (this.pendingDialogue.length > 0) {
      this.setPhase("dialogue");
      if (!this.dialogueShown) {
        this.dialogueShown = true;
        this.ui.showDialogue([...this.pendingDialogue]);
      }
      return;
    }

    const result = battleResult(this.gameState);
    if (result !== null) {
      this.setPhase("ended");
      this.clearSelection();
      // The banner used to land over a HUD frozen at the killing blow: a turn
      // order listing the dead, stale hp, and a forecast still offering to
      // commit. Hand the final state over with the result so the overlay can
      // settle before the banner covers it.
      this.ui.showFinalState(this.finalView(), result);
      this.ui.showResult(result);
      return;
    }

    const acting = activeUnit(this.gameState);
    if (acting === null) {
      this.setPhase("ended");
      this.ui.showFinalState(this.finalView(), null);
      return;
    }
    this.inspectedUnitId = acting.id;
    this.aiTimer = 0;
    if (acting.team === "player") {
      this.setPhase("player");
      this.ui.resetMenus();
      this.refresh();
      return;
    }
    this.setPhase("ai");
    this.refresh();
  }

  private setPhase(phase: ControllerPhase): void {
    // Nobody is holding a cursor over the field outside the player's own turn.
    if (phase !== "player") this.clearMovePreview();
    this.currentPhase = phase;
    this.ui.setBusy(phase !== "player");
    this.announceMode();
  }

  /** Say what the game is waiting for. Phase alone is too coarse: inside the
   *  player's turn, picking a tile and picking a target are different jobs. */
  private announceMode(): void {
    const acting = activeUnit(this.gameState);
    const name = acting?.unit.name ?? null;
    if (this.currentPhase === "presenting") return this.ui.setMode("presenting", null);
    if (this.currentPhase === "dialogue") return this.ui.setMode("dialogue", null);
    if (this.currentPhase === "ai") return this.ui.setMode("ai", name);
    if (this.currentPhase === "ended") return this.ui.setMode("ended", null);
    if (this.selection.mode === "move") return this.ui.setMode("move", name);
    if (this.selection.mode === "facing") return this.ui.setMode("facing", name);
    if (this.selection.mode === "target" && acting !== null) {
      const ability = abilityInfo(this.gameState, acting.id, this.selection.abilityId);
      return this.ui.setMode("target", ability?.name ?? name);
    }
    this.ui.setMode("orders", name);
  }

  /** A refused click. Non-modal, and it never costs the player their staging. */
  private refuse(message: string): void {
    this.ui.notify?.(message, "refusal");
  }

  /** Why a click on `tile` was not a target: out of reach, or the wrong thing. */
  private aimRefusal(actor: BattleUnit, abilityId: string, tile: TileCoord): string {
    if (!this.aimReach.some((candidate) => sameTile(candidate, tile))) return "Out of reach";
    const name = abilityInfo(this.gameState, actor.id, abilityId)?.name ?? "That";
    return `${name} cannot target that`;
  }

  /** The battle's closing frame: fresh numbers, nothing still offering input. */
  private finalView(): BattleHudView | null {
    const survivor =
      allUnits(this.gameState).find((unit) => unit.team === "player" && !unit.downed) ?? null;
    const view = battleHudView(this.gameState, {
      inspectedUnitId: this.inspectedUnitId,
      subjectUnitId: survivor?.id ?? allUnits(this.gameState)[0]?.id ?? null,
      forecast: null,
      dialogue: [],
      turnOrderCount: this.turnOrderCount,
    });
    if (view === null) return null;
    // Nobody is queued once the field is closed. Listing the next few turns —
    // the dead among them — was the HUD's biggest lie.
    return { ...view, turnOrder: { entries: [] } };
  }

  private stepAi(): void {
    const command = this.ai(this.gameState);
    const acting = activeUnit(this.gameState);
    if (acting === null) {
      this.advance();
      return;
    }
    this.dispatch(command ?? { kind: "endTurn", unitId: acting.id });
  }

  // --- helpers --------------------------------------------------------------

  private refresh(): void {
    const view = battleHudView(this.gameState, {
      inspectedUnitId: this.inspectedUnitId,
      inspectedObjectId: this.inspectedObjectId,
      forecast: this.pendingForecast(),
      dialogue: this.pendingDialogue,
      turnOrderCount: this.turnOrderCount,
    });
    if (view !== null) this.ui.render(view);
    this.announceMode();
  }

  private pendingForecast(): ReturnType<typeof forecastView> {
    const acting = activeUnit(this.gameState);
    if (this.previewedOperable !== null && acting !== null) {
      return operateForecastView(this.gameState, acting.id, this.previewedOperable);
    }
    if (this.selection.mode !== "target" || this.selection.pending === null) return null;
    if (acting === null) return null;
    return forecastView(
      this.gameState,
      acting.id,
      this.selection.abilityId,
      this.selection.pending,
    );
  }

  private clearSelection(): void {
    this.selection = { mode: "none" };
    this.previewedOperable = null;
    // Before anything the command produces is handed to the renderer: a walk
    // must start from the unit's true tile, never from a previewed one.
    this.clearMovePreview();
    this.moveTargets = [];
    this.aimTargets = [];
    this.aimReach = [];
    this.renderer.clearHighlight(LAYER_MOVE);
    this.renderer.clearHighlight(LAYER_MOVE_PICK);
    this.renderer.clearHighlight(LAYER_TARGET);
    this.renderer.clearHighlight(LAYER_TARGET_REACH);
    this.renderer.clearHighlight(LAYER_AFFECTED);
    this.renderer.clearHighlight(LAYER_GRID_FLIP);
  }

  private unitAt(tile: TileCoord): BattleUnit | null {
    return (
      allUnits(this.gameState).find((unit) => !unit.downed && sameTile(unit.position, tile)) ?? null
    );
  }

  private objectAt(tile: TileCoord): string | null {
    return (
      allObjects(this.gameState).find((object) =>
        object.def.tiles.some((covered) => sameTile(covered, tile)),
      )?.def.id ?? null
    );
  }

  /** Deployment tiles, for the opening frame before the first turn. */
  get deploymentTiles(): readonly TileCoord[] {
    return battleMap(this.gameState).deploymentTiles;
  }

  /** Current view of a unit; handy for debug overlays and tests. */
  unitSnapshot(unitId: string): BattleUnit | null {
    return getUnit(this.gameState, unitId);
  }
}
