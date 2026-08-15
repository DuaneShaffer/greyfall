// Dev entry for the battlefield renderer: loads slice content, builds a view
// model by hand (no `src/core` yet), and runs an idle scene with camera
// controls, a tile cursor, and a keypress that exercises the presentation
// queue.
//
// TODO(core-seam): replace the hand-built view model and the scripted demo
// events with `viewModelFromGameState(state)` + `toRenderEvents(coreEvents)`.

import encounterJson from "../../data/encounters/e1-marshaling-yard.json";
import mapJson from "../../data/maps/marshaling-yard.json";
import rowenJson from "../../data/units/rowen.json";
import { Encounter } from "../data/schemas/encounter.js";
import { GameMap } from "../data/schemas/map.js";
import { Unit } from "../data/schemas/unit.js";
import type { TileCoord } from "../data/schemas/common.js";
import { BattleRenderer, attachControls, palette } from "../render/index.js";
import type { RenderEvent } from "../render/presentation.js";
import { buildViewModel, blockedTiles, sameTile, type UnitPlacement } from "../render/viewmodel.js";

const map = GameMap.parse(mapJson);
const encounter = Encounter.parse(encounterJson);
const rowen = Unit.parse(rowenJson);

const canvas = document.getElementById("battle-canvas");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("#battle-canvas missing");
const status = document.getElementById("debug-status");

const deployTile = encounter.mapId === map.id ? (map.deploymentTiles[0] as TileCoord) : { x: 0, y: 0 };
const placements: UnitPlacement[] = [
  { unit: rowen, team: "player", position: deployTile, facing: "north" },
  ...encounter.enemies.map((enemy) => ({
    unit: enemy.unit,
    team: enemy.team,
    position: enemy.position,
    facing: enemy.facing,
  })),
];

const initialViewModel = buildViewModel(map, placements);

const setStatus = (text: string): void => {
  if (status) status.textContent = text;
};

const renderer = new BattleRenderer({
  canvas,
  onTileHover: (tile) => {
    setStatus(tile ? `tile ${tile.x},${tile.y}` : encounter.name);
  },
  onTileSelect: (tile) => {
    if (!tile) return;
    showPlaceholderRanges(tile);
    setStatus(`selected ${tile.x},${tile.y}`);
  },
});

renderer.buildScene(initialViewModel);
renderer.setHighlight("deployment", map.deploymentTiles, palette.highlightDeployment, {
  opacity: 0.2,
});
attachControls(renderer, canvas);
renderer.start();
setStatus(encounter.name);

// Placeholder ranges: real Move/Jump reachability and ability targeting come
// from `src/core`. Shape only — proves the highlight API and its palette slots.
const blocked = blockedTiles(map);
const withinRadius = (origin: TileCoord, radius: number, ring = false): TileCoord[] => {
  const tiles: TileCoord[] = [];
  for (let y = 0; y < map.depth; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const distance = Math.abs(x - origin.x) + Math.abs(y - origin.y);
      const included = ring ? distance === radius : distance > 0 && distance <= radius;
      if (!included) continue;
      if (map.tiles[y * map.width + x]?.terrain === "void") continue;
      if (blocked.some((tile) => sameTile(tile, { x, y }))) continue;
      tiles.push({ x, y });
    }
  }
  return tiles;
};

const showPlaceholderRanges = (origin: TileCoord): void => {
  renderer.setHighlight("move-range", withinRadius(origin, 3), palette.highlightMove);
  renderer.setHighlight("target-range", withinRadius(origin, 4, true), palette.highlightTarget, {
    opacity: 0.26,
  });
};

const demoEvents = (): RenderEvent[] => {
  const start = renderer.snapshot?.units.find((unit) => unit.id === rowen.id)?.position ?? deployTile;
  const path: TileCoord[] = [start];
  for (let step = 1; step <= 3; step += 1) {
    const x = Math.min(map.width - 1, start.x + step);
    path.push({ x, y: start.y });
  }
  const enemyId = encounter.enemies[0]?.unit.id;
  const events: RenderEvent[] = [
    { kind: "cameraFocused", tile: start },
    { kind: "unitMoved", unitId: rowen.id, path, facing: "north" },
  ];
  if (enemyId) {
    events.push({ kind: "unitHit", unitId: enemyId, amount: 18, hpFractionAfter: 0.45 });
  }
  events.push(
    { kind: "objectDestroyed", objectId: "crate-stack" },
    { kind: "objectPowerChanged", objectId: "freight-lift", powered: false },
    { kind: "objectPowerChanged", objectId: "freight-lift", powered: true },
  );
  return events;
};

const snapshotSummary = (): string => {
  const snapshot = renderer.snapshot;
  if (!snapshot) return "no scene";
  const units = snapshot.units
    .map((unit) => `${unit.id}@${unit.position.x},${unit.position.y} hp${unit.hpFraction.toFixed(2)}`)
    .join(" | ");
  const wrecked = snapshot.objects.filter((object) => object.destroyed).map((object) => object.id);
  const powered = snapshot.objects.filter((object) => object.powered === true).map((object) => object.id);
  return `${units} || destroyed: ${wrecked.join(",") || "none"} || powered: ${powered.join(",") || "none"}`;
};

// `?demo` plays the sequence on load so headless runs can exercise the queue.
if (new URLSearchParams(window.location.search).has("demo")) {
  renderer.applyRenderEvents(demoEvents());
  renderer.addFrameHook(() => {
    setStatus(
      renderer.queue.isIdle
        ? `idle — ${snapshotSummary()}`
        : `playing ${renderer.queue.currentEvent?.kind ?? ""} (${renderer.queue.pendingCount} queued)`,
    );
  });
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (key === "p") {
    renderer.applyRenderEvents(demoEvents());
    setStatus("presentation demo playing (X to skip)");
  }
  if (key === "x") {
    renderer.skipPresentation();
    setStatus("presentation skipped");
  }
  if (key === "r") {
    renderer.buildScene(initialViewModel);
    renderer.setHighlight("deployment", map.deploymentTiles, palette.highlightDeployment, {
      opacity: 0.2,
    });
    setStatus("scene rebuilt from snapshot");
  }
});

console.info(
  `[greyfall] ${map.name}: ${map.width}x${map.depth} tiles, ${map.objects.length} objects, ${placements.length} units`,
);
