import type { BattleRenderer } from "./scene.js";

const PAN_SPEED = 6.5;
const EDGE_MARGIN = 28;
const EDGE_SPEED = 5;

export interface ControlsOptions {
  /** Disable edge panning when the pointer is over DOM UI. */
  edgePan?: boolean;
  /**
   * WASD/arrow panning is suppressed while this returns false — a menu owns
   * those keys when one is open. Orbit and zoom stay live either way.
   */
  panKeysEnabled?: () => boolean;
}

/**
 * Q/E orbit, middle-drag grab-pan, WASD + arrows pan, wheel zoom, edge pan,
 * pointer tile cursor. Input that produces game commands belongs to `src/ui`;
 * this is camera and cursor only.
 *
 * The board must be turnable with the mouse alone: at one fixed bearing the
 * taller geometry hides whole columns from the terrain raycast — the Meter
 * House's east main sits behind a height-3 wall — which is UI_DESIGN §8's
 * parity rule failing on 22 tiles. That route is the mode bar's ⟲/⟳ pair, so
 * the middle button is free to be the hand: press and hold slides the board
 * under the pointer, which is the gesture players arrive already knowing.
 * Middle rather than right: right-click already means withdraw.
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
  let grabPointerId: number | null = null;
  let grabX = 0;
  let grabY = 0;

  const restingCursor = element.style.cursor;
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

  const onPointerMove = (event: PointerEvent): void => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    pointerInside = true;
    if (grabPointerId === event.pointerId) {
      const dx = event.clientX - grabX;
      const dy = event.clientY - grabY;
      grabX = event.clientX;
      grabY = event.clientY;
      renderer.rig.panPixels(dx, dy, element.getBoundingClientRect().height);
      return;
    }
    renderer.setHoveredTile(renderer.pickTile(event.clientX, event.clientY));
  };

  const onPointerLeave = (): void => {
    pointerInside = false;
    renderer.setHoveredTile(null);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button === 1) {
      // Without this the browser's own middle-click autoscroll takes the drag.
      event.preventDefault();
      grabPointerId = event.pointerId;
      grabX = event.clientX;
      grabY = event.clientY;
      element.style.cursor = "grabbing";
      element.setPointerCapture?.(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    renderer.selectTile(renderer.pickTile(event.clientX, event.clientY));
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (grabPointerId !== event.pointerId) return;
    grabPointerId = null;
    element.style.cursor = "grab";
    element.releasePointerCapture?.(event.pointerId);
    // The tile under the released hand is a different one than the tile the
    // drag started over, and nothing moved the pointer to say so.
    renderer.setHoveredTile(renderer.pickTile(event.clientX, event.clientY));
  };

  const onAuxClick = (event: MouseEvent): void => {
    if (event.button === 1) event.preventDefault();
  };

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
    if (options.edgePan !== false && pointerInside && grabPointerId === null) {
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
  };
};
