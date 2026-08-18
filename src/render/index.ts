export { BattleRenderer, type BattleRendererOptions, type MovePreview } from "./scene.js";
export { TacticsCamera } from "./camera.js";
export { attachControls, type ControlsOptions } from "./controls.js";
export { TileHighlights, type HighlightOptions } from "./highlights.js";
export { BASE_LAYER, BLOOM_LAYER, DRAW_ORDER } from "./layers.js";
export {
  BLOOM_RADIUS,
  BLOOM_STRENGTH,
  PostChain,
  VIGNETTE,
  type PostChainOptions,
} from "./post.js";
export {
  PresentationQueue,
  easeInOut,
  instantAnimation,
  type ActorPose,
  type Animation,
  type AnimationFactory,
  type RenderEvent,
  type RenderEventKind,
} from "./presentation.js";
export {
  CHEMICAL_LINGER_SECONDS,
  IMPACT_TIMING,
  conductiveTerrain,
  debrisDirections,
  impactFrame,
  jagPoints,
  persistsOnTile,
  type ImpactTiming,
  type Vec3,
} from "./effects.js";
export {
  GLYPH_HEIGHT,
  GLYPH_WIDTH,
  popupGrid,
  textGrid,
  textWidth,
} from "./glyphs.js";
export {
  POPUP_SECONDS,
  PopupField,
  damagePopup,
  missPopup,
  popupHeight,
  popupOpacity,
  popupStyleFor,
  type Popup,
  type PopupSpec,
  type PopupStyle,
} from "./popups.js";
export { VfxLayer } from "./vfxLayer.js";
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
  findObjectView,
  findUnitView,
  objectViewFromMapObject,
  unitViewFromPlacement,
  type BattleViewModel,
  type MapObjectView,
  type UnitPlacement,
  type UnitView,
} from "./viewmodel.js";
export * from "./board.js";
export {
  objectColor,
  palette,
  teamColor,
  terrainFaceColor,
  terrainTopColor,
  type TerrainFace,
} from "./palette.js";
export { toRenderEvents, viewModelFromGameState } from "./adapter.js";
