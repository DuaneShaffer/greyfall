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
  allObjects,
  allUnits,
  applyCommand,
  battleMap,
  battleResult,
  getUnit,
  reachableTiles,
  targetableTiles,
  type BattleEvent,
  type BattleResult,
  type BattleUnit,
  type Command,
  type CommandError,
  type GameState,
  type TargetRef,
} from "../core/index.js";
import type { DialogueLine, Facing, TileCoord } from "../data/index.js";
import { toRenderEventList, viewModelFromGameState } from "../render/adapter.js";
import { palette } from "../render/palette.js";
import type { RenderEvent } from "../render/presentation.js";
import type { BattleViewModel } from "../render/viewmodel.js";
import type { BattleHudView, TargetRef as UiTargetRef, UiIntents } from "../ui/index.js";
import { battleHudView, forecastView } from "./viewmodels.js";

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
  skipPresentation(): void;
  isPresentationIdle(): boolean;
}

/** What the controller needs from the DOM overlay. */
export interface UiPort {
  /** Draw a fresh set of view models. Must not restart an open dialogue. */
  render(view: BattleHudView): void;
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
  notify?(message: string): void;
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
const LAYER_AFFECTED = "affected";

/** Seconds between AI commands, so enemy turns are watchable. */
const AI_STEP_SECONDS = 0.3;

const sameTile = (a: TileCoord, b: TileCoord): boolean => a.x === b.x && a.y === b.y;

const sameTarget = (a: TargetRef, b: TargetRef): boolean => {
  if (a.kind !== b.kind) return false;
  if (a.kind === "tile" && b.kind === "tile") return sameTile(a.tile, b.tile);
  if (a.kind === "unit" && b.kind === "unit") return a.unitId === b.unitId;
  if (a.kind === "object" && b.kind === "object") return a.objectId === b.objectId;
  return false;
};

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
  private awaitingPresentation = false;
  private aiTimer = 0;
  private moveTargets: TileCoord[] = [];
  private aimTargets: TileCoord[] = [];
  private lastCommandError: CommandError | null = null;
  private started = false;

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
    this.consume(this.startupEvents, this.gameState);
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

  onTileHover(tile: TileCoord | null): void {
    if (this.currentPhase !== "player") return;
    const acting = activeUnit(this.gameState);
    const hovered = tile === null ? null : this.unitAt(tile);
    this.inspectedUnitId = hovered?.id ?? acting?.id ?? null;
    this.refresh();
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
        if (!this.moveTargets.some((candidate) => sameTile(candidate, tile))) return;
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
        if (!this.aimTargets.some((candidate) => sameTile(candidate, tile))) return;
        const abilityId = this.selection.abilityId;
        const target = this.targetRefAt(acting, abilityId, tile);
        if (target === null) return;
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
      activateObject: (unitId, objectId) =>
        this.dispatch({ kind: "activateObject", unitId, objectId }),
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
    this.aimTargets = targetableTiles(this.gameState, unitId, abilityId);
    this.selection = { mode: "target", abilityId, pending: null };
    this.renderer.setHighlight(LAYER_TARGET, this.aimTargets, palette.highlightTarget, {
      opacity: 0.24,
    });

    // Self-only abilities have nothing to aim: stage the caster straight away.
    const targets = ability.targeting.validTargets;
    if (targets.length === 1 && targets[0] === "self") {
      this.selection = { mode: "target", abilityId, pending: { kind: "unit", unitId } };
    }
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

  private commitAct(unitId: string, abilityId: string, target: TargetRef | null): void {
    if (target === null) return;
    this.dispatch({ kind: "act", unitId, abilityId, target });
  }

  /**
   * The forecast panel's Commit button reports its first row as a unit target,
   * which is wrong for machinery. The staged selection is authoritative when
   * there is one; the reported target is only a fallback.
   */
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
    const result = applyCommand(this.gameState, command);
    if (result.error !== null) {
      this.lastCommandError = result.error;
      this.ui.notify?.(result.error.message);
      this.refresh();
      return false;
    }
    this.lastCommandError = null;
    this.gameState = result.state;
    this.clearSelection();
    this.ui.resetMenus();
    this.consume(result.events, result.state);
    // No refresh here: the HUD must not jump ahead of the animation it is
    // describing. `advance` redraws it once the queue is drained.
    this.advance();
    return true;
  }

  private consume(events: readonly BattleEvent[], stateAfter: GameState): void {
    if (events.some((event) => event.type === "UnitSpawned" || event.type === "ObjectSpawned")) {
      this.renderer.buildScene(viewModelFromGameState(stateAfter));
    }
    const renderEvents = toRenderEventList(events, stateAfter);
    if (renderEvents.length > 0) this.renderer.applyRenderEvents(renderEvents);
    for (const event of events) {
      if (event.type === "DialogueRequested") this.pendingDialogue.push(...event.lines);
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
      this.ui.showResult(result);
      return;
    }

    const acting = activeUnit(this.gameState);
    if (acting === null) {
      this.setPhase("ended");
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
    this.currentPhase = phase;
    this.ui.setBusy(phase !== "player");
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
      forecast: this.pendingForecast(),
      dialogue: this.pendingDialogue,
      turnOrderCount: this.turnOrderCount,
    });
    if (view !== null) this.ui.render(view);
  }

  private pendingForecast(): ReturnType<typeof forecastView> {
    if (this.selection.mode !== "target" || this.selection.pending === null) return null;
    const acting = activeUnit(this.gameState);
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
    this.moveTargets = [];
    this.aimTargets = [];
    this.renderer.clearHighlight(LAYER_MOVE);
    this.renderer.clearHighlight(LAYER_MOVE_PICK);
    this.renderer.clearHighlight(LAYER_TARGET);
    this.renderer.clearHighlight(LAYER_AFFECTED);
  }

  private unitAt(tile: TileCoord): BattleUnit | null {
    return (
      allUnits(this.gameState).find((unit) => !unit.downed && sameTile(unit.position, tile)) ?? null
    );
  }

  /** Machinery wins the tile when the ability is aimed at objects at all. */
  private targetRefAt(actor: BattleUnit, abilityId: string, tile: TileCoord): TargetRef | null {
    const ability = abilityInfo(this.gameState, actor.id, abilityId);
    if (ability === null || ability.slot !== "action") return null;
    const kinds = ability.targeting.validTargets;

    if (kinds.includes("object")) {
      const object = allObjects(this.gameState).find(
        (candidate) =>
          !candidate.destroyed && candidate.def.tiles.some((covered) => sameTile(covered, tile)),
      );
      if (object !== undefined) return { kind: "object", objectId: object.def.id };
    }
    const unit = this.unitAt(tile);
    if (unit !== null) return { kind: "unit", unitId: unit.id };
    return { kind: "tile", tile: { ...tile } };
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
