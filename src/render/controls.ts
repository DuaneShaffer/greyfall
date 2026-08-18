import { rotateCursorValue } from "./cursors.js";
import type { BattleRenderer } from "./scene.js";

const PAN_SPEED = 6.5;
const EDGE_MARGIN = 28;
const EDGE_SPEED = 5;
/**
 * Past this much travel the right button is turning the board and is no longer a
 * click. A few pixels: a hand resting on a button jitters, and a withdraw that
 * fired anyway would be an order the player did not give.
 */
const DRAG_THRESHOLD_PX = 5;
/** Horizontal travel that buys one quarter turn — the same step Q/E take. */
const ORBIT_STEP_PX = 96;

export interface ControlsOptions {
  /** Disable edge panning when the pointer is over DOM UI. */
  edgePan?: boolean;
  /**
   * WASD/arrow panning is suppressed while this returns false — a menu owns
   * those keys when one is open. Orbit and zoom stay live either way.
   */
  panKeysEnabled?: () => boolean;
  /**
   * A right-click that did not turn the board: the mouse's half of UI_DESIGN
   * §8's parity rule, where right-click means withdraw. Fires on release, so a
   * press that became a drag never reaches it.
   */
  onCancel?: () => void;
}

type DragMode = "pan" | "turn";

/**
 * Q/E orbit, middle-drag grab-pan, right-drag orbit, right-click cancel, WASD +
 * arrows pan, wheel zoom, edge pan, pointer tile cursor. Input that produces
 * game commands belongs to `src/ui`; this is camera and cursor only.
 *
 * The board must be turnable with the mouse alone: at one fixed bearing the
 * taller geometry hides whole columns from the terrain raycast — the Meter
 * House's east main sits behind a height-3 wall — which is UI_DESIGN §8's
 * parity rule failing on 22 tiles. The mode bar's ⟲/⟳ pair is one route; the
 * right button held and dragged is the other, and both step in the same 90°
 * the keys do.
 *
 * The two dragging buttons must not read alike, because they do different
 * things to the same board: the middle button slides it under the plain closed
 * hand, the right button turns it under a circular arrow. Right-click with no
 * drag still means withdraw — the gesture the button already had.
 */
export const attachControls = (
  renderer: BattleRenderer,
  element: HTMLElement,
  options: ControlsOptions = {},
): (() => void) => {
  const held = new Set<string>();
  let pointerX = -1;
  let pointerY = -1;
  let pointerInside = false;
  let dragPointerId: number | null = null;
  let dragMode: DragMode = "pan";
  let dragX = 0;
  let dragY = 0;
  /** Where the last quarter turn fired, so a long drag steps as it travels. */
  let orbitAnchorX = 0;
  let dragged = false;

  const restingCursor = element.style.cursor;
  const turnCursor = rotateCursorValue();
  element.style.cursor = "grab";

  const onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (key === "q") renderer.rig.orbit(-1);
    if (key === "e") renderer.rig.orbit(1);
    held.add(key);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    held.delete(event.key.toLowerCase());
  };
  const onBlur = (): void => held.clear();

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    renderer.rig.zoomStep(event.deltaY > 0 ? 1 : -1);
  };

  const beginDrag = (event: PointerEvent, mode: DragMode, cursor: string): void => {
    // Without this the browser's own middle-click autoscroll takes the drag.
    event.preventDefault();
    dragPointerId = event.pointerId;
    dragMode = mode;
    dragX = event.clientX;
    dragY = event.clientY;
    orbitAnchorX = event.clientX;
    dragged = false;
    element.style.cursor = cursor;
    element.setPointerCapture?.(event.pointerId);
  };

  /** Quarter turns as the drag travels, one per `ORBIT_STEP_PX` of it. */
  const turnBy = (clientX: number): void => {
    while (Math.abs(clientX - orbitAnchorX) >= ORBIT_STEP_PX) {
      const direction = clientX > orbitAnchorX ? 1 : -1;
      renderer.rig.orbit(direction);
      orbitAnchorX += direction * ORBIT_STEP_PX;
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    pointerInside = true;
    if (dragPointerId === event.pointerId) {
      const dx = event.clientX - dragX;
      const dy = event.clientY - dragY;
      if (dragMode === "turn") {
        // Measured from the press, not from the last move: a slow drag is still
        // a drag, and it must not read as a click at the end of it.
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) dragged = true;
        turnBy(event.clientX);
        return;
      }
      dragX = event.clientX;
      dragY = event.clientY;
      renderer.rig.panPixels(dx, dy, element.getBoundingClientRect().height);
      return;
    }
    renderer.hoverAt(event.clientX, event.clientY);
  };

  const onPointerLeave = (): void => {
    pointerInside = false;
    renderer.clearHover();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button === 1) {
      beginDrag(event, "pan", "grabbing");
      return;
    }
    if (event.button === 2) {
      beginDrag(event, "turn", turnCursor);
      return;
    }
    if (event.button !== 0) return;
    renderer.selectTile(renderer.pickTile(event.clientX, event.clientY));
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (dragPointerId !== event.pointerId) return;
    const cancelled = dragMode === "turn" && !dragged;
    dragPointerId = null;
    element.style.cursor = "grab";
    element.releasePointerCapture?.(event.pointerId);
    // The tile under the released hand is a different one than the tile the
    // drag started over, and nothing moved the pointer to say so.
    renderer.hoverAt(event.clientX, event.clientY);
    if (cancelled) options.onCancel?.();
  };

  const onAuxClick = (event: MouseEvent): void => {
    if (event.button === 1) event.preventDefault();
  };

  /** The board's own menu is the interface; the browser's would cover it. */
  const onContextMenu = (event: MouseEvent): void => event.preventDefault();

  const onResize = (): void => renderer.resize();

  const frame = (delta: number): void => {
    let right = 0;
    let forward = 0;
    if (options.panKeysEnabled?.() !== false) {
      if (held.has("a") || held.has("arrowleft")) right -= 1;
      if (held.has("d") || held.has("arrowright")) right += 1;
      if (held.has("w") || held.has("arrowup")) forward += 1;
      if (held.has("s") || held.has("arrowdown")) forward -= 1;
    }
    if (right !== 0 || forward !== 0) {
      renderer.rig.pan(right * PAN_SPEED * delta, forward * PAN_SPEED * delta);
    }

    // A hand that has dragged the board to the screen edge is holding it there,
    // not asking for edge pan on top of the drag.
    if (options.edgePan !== false && pointerInside && dragPointerId === null) {
      const rect = element.getBoundingClientRect();
      let edgeX = 0;
      let edgeZ = 0;
      if (pointerX - rect.left < EDGE_MARGIN) edgeX -= 1;
      if (rect.right - pointerX < EDGE_MARGIN) edgeX += 1;
      if (pointerY - rect.top < EDGE_MARGIN) edgeZ += 1;
      if (rect.bottom - pointerY < EDGE_MARGIN) edgeZ -= 1;
      if (edgeX !== 0 || edgeZ !== 0) {
        renderer.rig.pan(edgeX * EDGE_SPEED * delta, edgeZ * EDGE_SPEED * delta);
      }
    }
  };

  const removeFrameHook = renderer.addFrameHook(frame);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  window.addEventListener("resize", onResize);
  element.addEventListener("wheel", onWheel, { passive: false });
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerleave", onPointerLeave);
  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointerup", onPointerUp);
  element.addEventListener("pointercancel", onPointerUp);
  element.addEventListener("auxclick", onAuxClick);
  element.addEventListener("contextmenu", onContextMenu);

  return () => {
    removeFrameHook();
    element.style.cursor = restingCursor;
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("resize", onResize);
    element.removeEventListener("wheel", onWheel);
    element.removeEventListener("pointermove", onPointerMove);
    element.removeEventListener("pointerleave", onPointerLeave);
    element.removeEventListener("pointerdown", onPointerDown);
    element.removeEventListener("pointerup", onPointerUp);
    element.removeEventListener("pointercancel", onPointerUp);
    element.removeEventListener("auxclick", onAuxClick);
    element.removeEventListener("contextmenu", onContextMenu);
  };
};
