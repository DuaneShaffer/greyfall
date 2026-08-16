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
  allUnits,
  applyCommand,
  battleMap,
  battleResult,
  getObject,
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
  type TargetRef,
} from "../core/index.js";
import type { DialogueLine, Facing, TileCoord } from "../data/index.js";
import { toRenderEventList, viewModelFromGameState } from "../render/adapter.js";
import { palette } from "../render/palette.js";
import type { RenderEvent } from "../render/presentation.js";
import type { BattleViewModel } from "../render/viewmodel.js";
import type {
  BattleHudView,
  HudMode,
  NoticeTone,
  TargetRef as UiTargetRef,
  UiIntents,
} from "../ui/index.js";
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
  private aimReach: TileCoord[] = [];
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

  /**
   * Operating machinery is the one player action whose whole result is a state
   * change on a map object. The renderer flashes the seams; the HUD says which
   * machine answered and what it did, or the player is left guessing whether
   * the click landed.
   */
  private operate(unitId: string, objectId: string): void {
    const before = getObject(this.gameState, objectId);
    const name = before?.def.name ?? "Machinery";
    const poweredBefore = before?.powered ?? null;
    if (!this.dispatch({ kind: "activateObject", unitId, objectId })) return;
    const after = getObject(this.gameState, objectId);
    const poweredAfter = after?.powered ?? null;
    const changed =
      poweredAfter === null || poweredBefore === poweredAfter
        ? "operated"
        : poweredAfter
          ? "powered up"
          : "shut down";
    this.ui.notify?.(`${name} ${changed}.`, "machine");
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
      this.ui.notify?.(result.error.message, "refusal");
      this.refresh();
      return false;
    }
    this.lastCommandError = null;
    this.gameState = result.state;
    this.clearSelection();
    // The forecast stays up through the presentation as the record of what was
    // ordered, but it is describing an action already in flight: kill the stamp
    // now rather than when the queue finally drains.
    this.ui.lockForecast();
    this.ui.resetMenus();
    this.consume(result.events, result.state);
    // No refresh here: the HUD must not jump ahead of the animation it is
    // describing. `advance` redraws it once the queue is drained.
    this.advance();
    return true;
  }

  private consume(events: readonly BattleEvent[], stateAfter: GameState): void {
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
      forecast: this.pendingForecast(),
      dialogue: this.pendingDialogue,
      turnOrderCount: this.turnOrderCount,
    });
    if (view !== null) this.ui.render(view);
    this.announceMode();
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
    this.aimReach = [];
    this.renderer.clearHighlight(LAYER_MOVE);
    this.renderer.clearHighlight(LAYER_MOVE_PICK);
    this.renderer.clearHighlight(LAYER_TARGET);
    this.renderer.clearHighlight(LAYER_TARGET_REACH);
    this.renderer.clearHighlight(LAYER_AFFECTED);
  }

  private unitAt(tile: TileCoord): BattleUnit | null {
    return (
      allUnits(this.gameState).find((unit) => !unit.downed && sameTile(unit.position, tile)) ?? null
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
