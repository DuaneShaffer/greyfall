/** @vitest-environment happy-dom */
/**
 * Camera input. Orbit used to be Q/E and nothing else, which made a keyboard
 * the requirement for reaching tiles the taller geometry hides from the pointer
 * (UI_DESIGN §8, acceptance finding C). Middle-drag rather than right-drag:
 * right-click already means withdraw.
 */

import { describe, expect, it, vi } from "vitest";
import { attachControls } from "../../src/render/controls.js";
import type { BattleRenderer } from "../../src/render/scene.js";

interface Stub {
  renderer: BattleRenderer;
  element: HTMLElement;
  orbits: number[];
  picks: number;
  detach: () => void;
}

function stub(): Stub {
  const orbits: number[] = [];
  const state = { picks: 0 };
  const renderer = {
    rig: { orbit: (direction: number) => orbits.push(direction), zoomStep: vi.fn(), pan: vi.fn() },
    setHoveredTile: () => {
      state.picks += 1;
    },
    pickTile: () => null,
    selectTile: vi.fn(),
    resize: vi.fn(),
    addFrameHook: () => () => {},
  } as unknown as BattleRenderer;
  const element = document.createElement("div");
  document.body.append(element);
  const detach = attachControls(renderer, element, { edgePan: false });
  return {
    renderer,
    element,
    orbits,
    get picks() {
      return state.picks;
    },
    detach,
  } as Stub;
}

const pointer = (type: string, init: PointerEventInit): PointerEvent =>
  new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...init });

describe("mouse orbit", () => {
  it("turns the rig a quarter per drag threshold, in the drag's direction", () => {
    const h = stub();
    h.element.dispatchEvent(pointer("pointerdown", { button: 1, clientX: 400, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointermove", { clientX: 520, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointermove", { clientX: 640, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointerup", { button: 1, clientX: 640, clientY: 300 }));

    expect(h.orbits).toEqual([1, 1]);
    h.detach();
  });

  it("turns the other way for the other direction", () => {
    const h = stub();
    h.element.dispatchEvent(pointer("pointerdown", { button: 1, clientX: 400, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointermove", { clientX: 260, clientY: 300 }));

    expect(h.orbits).toEqual([-1]);
    h.detach();
  });

  it("stops turning once the button is up, and leaves the tile cursor alone", () => {
    const h = stub();
    h.element.dispatchEvent(pointer("pointerdown", { button: 1, clientX: 400, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointerup", { button: 1, clientX: 400, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointermove", { clientX: 900, clientY: 300 }));

    expect(h.orbits).toEqual([]);
    h.detach();
  });

  it("does not select a tile with the orbit button", () => {
    const h = stub();
    const select = h.renderer.selectTile as unknown as ReturnType<typeof vi.fn>;
    h.element.dispatchEvent(pointer("pointerdown", { button: 1, clientX: 400, clientY: 300 }));
    expect(select).not.toHaveBeenCalled();

    h.element.dispatchEvent(pointer("pointerdown", { button: 0, clientX: 400, clientY: 300 }));
    expect(select).toHaveBeenCalledTimes(1);
    h.detach();
  });

  it("keeps Q and E", () => {
    const h = stub();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "q" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "e" }));

    expect(h.orbits).toEqual([-1, 1]);
    h.detach();
  });
});
