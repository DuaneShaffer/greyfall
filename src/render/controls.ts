import type { BattleRenderer } from "./scene.js";

const PAN_SPEED = 6.5;
const EDGE_MARGIN = 28;
const EDGE_SPEED = 5;

export interface ControlsOptions {
  /** Disable edge panning when the pointer is over DOM UI. */
  edgePan?: boolean;
}

/**
 * Q/E orbit, WASD + arrows pan, wheel zoom, edge pan, pointer tile cursor.
 * Input that produces game commands belongs to `src/ui`; this is camera and
 * cursor only.
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
    renderer.setHoveredTile(renderer.pickTile(event.clientX, event.clientY));
  };

  const onPointerLeave = (): void => {
    pointerInside = false;
    renderer.setHoveredTile(null);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    renderer.selectTile(renderer.pickTile(event.clientX, event.clientY));
  };

  const onResize = (): void => renderer.resize();

  const frame = (delta: number): void => {
    let right = 0;
    let forward = 0;
    if (held.has("a") || held.has("arrowleft")) right -= 1;
    if (held.has("d") || held.has("arrowright")) right += 1;
    if (held.has("w") || held.has("arrowup")) forward += 1;
    if (held.has("s") || held.has("arrowdown")) forward -= 1;
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
  };
};
