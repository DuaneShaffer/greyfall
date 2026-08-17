import type { BattleRenderer } from "./scene.js";

const PAN_SPEED = 6.5;
const EDGE_MARGIN = 28;
const EDGE_SPEED = 5;
/**
 * Horizontal travel that buys one 90° step. The rig orbits in quarters, so a
 * drag counts pixels into steps rather than turning the yaw freely — the board
 * reads from four bearings and from no other, and a continuous drag would put
 * the billboards between them.
 */
const ORBIT_DRAG_PX = 110;

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
 * Q/E or middle-drag orbit, WASD + arrows pan, wheel zoom, edge pan, pointer
 * tile cursor. Input that produces game commands belongs to `src/ui`; this is
 * camera and cursor only.
 *
 * Orbit is on the mouse because at one fixed bearing the taller geometry hides
 * whole columns of the board from the terrain raycast — the Meter House's east
 * main sits behind a height-3 wall and could not be aimed at with the pointer
 * at all, which is UI_DESIGN §8's parity rule failing on 22 tiles. Middle-drag
 * rather than right-drag: right-click already means withdraw.
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
  let orbitPointerId: number | null = null;
  let orbitAnchorX = 0;

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
    if (orbitPointerId === event.pointerId) {
      const steps = Math.trunc((event.clientX - orbitAnchorX) / ORBIT_DRAG_PX);
      if (steps === 0) return;
      const direction = steps > 0 ? 1 : -1;
      orbitAnchorX += direction * ORBIT_DRAG_PX;
      renderer.rig.orbit(direction);
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
      orbitPointerId = event.pointerId;
      orbitAnchorX = event.clientX;
      element.setPointerCapture?.(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    renderer.selectTile(renderer.pickTile(event.clientX, event.clientY));
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (orbitPointerId !== event.pointerId) return;
    orbitPointerId = null;
    element.releasePointerCapture?.(event.pointerId);
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

    if (options.edgePan !== false && pointerInside) {
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
