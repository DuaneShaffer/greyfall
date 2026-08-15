import {
  createBattle,
  type BattleResult,
  type Deployment,
  type GameState,
} from "../../src/core/index.js";
import type { DialogueLine, Facing, TileCoord, Unit } from "../../src/data/index.js";
import type { HighlightStyle, RendererPort, UiPort } from "../../src/app/controller.js";
import type { RenderEvent } from "../../src/render/presentation.js";
import type { BattleViewModel } from "../../src/render/viewmodel.js";
import type { BattleHudView } from "../../src/ui/index.js";
import { loadContent, rowen, YARD_ENCOUNTER_ID } from "../core/fixtures.js";

/** A Conduit who can overload the yard cell from a deployment tile. */
export const VALE: Unit = {
  schemaVersion: 1,
  id: "vale",
  name: "Vale Tarn",
  spriteId: "conduit",
  level: 1,
  jobId: "conduit",
  disposition: { resolve: 50, attunement: 70 },
  learnedAbilityIds: ["overload-cell"],
  equipment: {},
};

export const ROWEN_TILE: TileCoord = { x: 0, y: 4 };
export const VALE_TILE: TileCoord = { x: 1, y: 4 };

export function openBattle(party: Unit[] = [rowen()], deployment?: Deployment[]) {
  const placements: Deployment[] =
    deployment ??
    party.map((unit, index) => ({
      unitId: unit.id,
      position: index === 0 ? ROWEN_TILE : VALE_TILE,
      facing: "north" as Facing,
    }));
  return createBattle(loadContent(), YARD_ENCOUNTER_ID, party, placements);
}

export interface FakeRenderer {
  port: RendererPort;
  events: RenderEvent[];
  highlights: Map<string, TileCoord[]>;
  scenes: BattleViewModel[];
  /** Flip to false to hold the presentation queue open. */
  idle: boolean;
  skips: number;
}

export function fakeRenderer(): FakeRenderer {
  const fake: FakeRenderer = {
    port: undefined as unknown as RendererPort,
    events: [],
    highlights: new Map<string, TileCoord[]>(),
    scenes: [],
    idle: true,
    skips: 0,
  };
  fake.port = {
    buildScene: (view: BattleViewModel) => {
      fake.scenes.push(view);
    },
    applyRenderEvents: (events: readonly RenderEvent[]) => {
      fake.events.push(...events);
    },
    setHighlight: (
      layerId: string,
      tiles: readonly TileCoord[],
      _color: number,
      _options?: HighlightStyle,
    ) => {
      fake.highlights.set(layerId, tiles.map((tile) => ({ ...tile })));
    },
    clearHighlight: (layerId: string) => {
      fake.highlights.delete(layerId);
    },
    skipPresentation: () => {
      fake.skips += 1;
      fake.idle = true;
    },
    isPresentationIdle: () => fake.idle,
  };
  return fake;
}

export interface FakeUi {
  port: UiPort;
  renders: BattleHudView[];
  dialogues: DialogueLine[][];
  dialogueOpen: boolean;
  result: BattleResult | null;
  notices: string[];
  facingPrompt: { onPick: (facing: Facing) => void; onCancel: () => void } | null;
  menuResets: number;
  busy: boolean;
  latest(): BattleHudView | null;
}

export function fakeUi(): FakeUi {
  const fake: FakeUi = {
    port: undefined as unknown as UiPort,
    renders: [],
    dialogues: [],
    dialogueOpen: false,
    result: null,
    notices: [],
    facingPrompt: null,
    menuResets: 0,
    busy: false,
    latest: () => fake.renders[fake.renders.length - 1] ?? null,
  };
  fake.port = {
    render: (view) => {
      fake.renders.push(view);
    },
    showDialogue: (lines) => {
      fake.dialogues.push(lines);
      fake.dialogueOpen = true;
    },
    hideDialogue: () => {
      fake.dialogueOpen = false;
    },
    showResult: (result) => {
      fake.result = result;
    },
    promptFacing: (_current, onPick, onCancel) => {
      fake.facingPrompt = { onPick, onCancel };
    },
    closePrompt: () => {
      fake.facingPrompt = null;
    },
    resetMenus: () => {
      fake.menuResets += 1;
    },
    setBusy: (busy) => {
      fake.busy = busy;
    },
    notify: (message) => {
      fake.notices.push(message);
    },
  };
  return fake;
}

export function unitPosition(state: GameState, unitId: string): TileCoord | null {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  return unit === undefined ? null : { ...unit.position };
}
