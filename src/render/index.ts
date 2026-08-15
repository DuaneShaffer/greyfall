export { BattleRenderer, type BattleRendererOptions } from "./scene.js";
export { TacticsCamera } from "./camera.js";
export { attachControls, type ControlsOptions } from "./controls.js";
export { TileHighlights, type HighlightOptions } from "./highlights.js";
export {
  PresentationQueue,
  easeInOut,
  instantAnimation,
  type Animation,
  type AnimationFactory,
  type RenderEvent,
  type RenderEventKind,
} from "./presentation.js";
export {
  buildTerrainMeshData,
  buildTerrainQuads,
  quadsToMeshData,
  tileFromTriangle,
  type TerrainMeshData,
  type TerrainQuad,
} from "./terrain.js";
export {
  blockedTiles,
  buildViewModel,
  cloneViewModel,
  sameTile,
  findObjectView,
  findUnitView,
  objectViewFromMapObject,
  unitViewFromPlacement,
  type BattleViewModel,
  type MapObjectView,
  type UnitPlacement,
  type UnitView,
} from "./viewmodel.js";
export * from "./grid.js";
export { palette, teamColor, terrainTopColor } from "./palette.js";
