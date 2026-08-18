/** @vitest-environment happy-dom */
/**
 * Camera input. The middle button is the hand: press and hold slides the board
 * under the pointer. It is not the orbit gesture — turning the rig with the
 * mouse alone is the mode bar's ⟲/⟳ pair (UI_DESIGN §8, acceptance finding C),
 * and middle rather than right because right-click already means withdraw.
 */

import { describe, expect, it, vi } from "vitest";
import { attachControls } from "../../src/render/controls.js";
import type { BattleRenderer } from "../../src/render/scene.js";

interface Stub {
  renderer: BattleRenderer;
  element: HTMLElement;
  orbits: number[];
  pans: number[][];
  detach: () => void;
}

function stub(): Stub {
  const orbits: number[] = [];
  const pans: number[][] = [];
  const renderer = {
    rig: {
      orbit: (direction: number) => orbits.push(direction),
      zoomStep: vi.fn(),
      pan: vi.fn(),
      panPixels: (dx: number, dy: number, height: number) => pans.push([dx, dy, height]),
    },
    setHoveredTile: vi.fn(),
    pickTile: () => null,
    selectTile: vi.fn(),
    resize: vi.fn(),
    addFrameHook: () => () => {},
  } as unknown as BattleRenderer;
  const element = document.createElement("div");
  document.body.append(element);
  const detach = attachControls(renderer, element, { edgePan: false });
  return { renderer, element, orbits, pans, detach };
}

const pointer = (type: string, init: PointerEventInit): PointerEvent =>
  new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...init });

describe("middle-drag grab pan", () => {
  it("pans by the drag delta, one step per move", () => {
    const h = stub();
    h.element.dispatchEvent(pointer("pointerdown", { button: 1, clientX: 400, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointermove", { clientX: 440, clientY: 320 }));
    h.element.dispatchEvent(pointer("pointermove", { clientX: 430, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointerup", { button: 1, clientX: 430, clientY: 300 }));

    expect(h.pans.map(([dx, dy]) => [dx, dy])).toEqual([
      [40, 20],
      [-10, -20],
    ]);
    h.detach();
  });

  it("leaves the tile cursor alone mid-drag, then re-picks where the hand let go", () => {
    const h = stub();
    const hovered = h.renderer.setHoveredTile as unknown as ReturnType<typeof vi.fn>;
    h.element.dispatchEvent(pointer("pointerdown", { button: 1, clientX: 400, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointermove", { clientX: 520, clientY: 300 }));
    expect(hovered).not.toHaveBeenCalled();

    h.element.dispatchEvent(pointer("pointerup", { button: 1, clientX: 520, clientY: 300 }));
    expect(hovered).toHaveBeenCalledTimes(1);
    h.detach();
  });

  it("stops panning once the button is up", () => {
    const h = stub();
    h.element.dispatchEvent(pointer("pointerdown", { button: 1, clientX: 400, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointerup", { button: 1, clientX: 400, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointermove", { clientX: 900, clientY: 300 }));

    expect(h.pans).toEqual([]);
    h.detach();
  });

  it("never turns the rig", () => {
    const h = stub();
    h.element.dispatchEvent(pointer("pointerdown", { button: 1, clientX: 400, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointermove", { clientX: 900, clientY: 300 }));

    expect(h.orbits).toEqual([]);
    h.detach();
  });

  it("does not select a tile with the pan button", () => {
    const h = stub();
    const select = h.renderer.selectTile as unknown as ReturnType<typeof vi.fn>;
    h.element.dispatchEvent(pointer("pointerdown", { button: 1, clientX: 400, clientY: 300 }));
    expect(select).not.toHaveBeenCalled();

    h.element.dispatchEvent(pointer("pointerdown", { button: 0, clientX: 400, clientY: 300 }));
    expect(select).toHaveBeenCalledTimes(1);
    h.detach();
  });
});

describe("the hand", () => {
  it("rests open, closes on the hold, opens on release, and is given back on detach", () => {
    const element = document.createElement("div");
    element.style.cursor = "crosshair";
    document.body.append(element);
    const renderer = {
      rig: { orbit: vi.fn(), zoomStep: vi.fn(), pan: vi.fn(), panPixels: vi.fn() },
      setHoveredTile: vi.fn(),
      pickTile: () => null,
      selectTile: vi.fn(),
      resize: vi.fn(),
      addFrameHook: () => () => {},
    } as unknown as BattleRenderer;
    const detach = attachControls(renderer, element, { edgePan: false });
    expect(element.style.cursor).toBe("grab");

    element.dispatchEvent(pointer("pointerdown", { button: 1, clientX: 400, clientY: 300 }));
    expect(element.style.cursor).toBe("grabbing");

    element.dispatchEvent(pointer("pointerup", { button: 1, clientX: 400, clientY: 300 }));
    expect(element.style.cursor).toBe("grab");

    detach();
    expect(element.style.cursor).toBe("crosshair");
  });

  it("opens again when the drag is cancelled out from under it", () => {
    const h = stub();
    h.element.dispatchEvent(pointer("pointerdown", { button: 1, clientX: 400, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointercancel", { clientX: 400, clientY: 300 }));

    expect(h.element.style.cursor).toBe("grab");
    h.detach();
  });
});

describe("orbit", () => {
  it("keeps Q and E", () => {
    const h = stub();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "q" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "e" }));

    expect(h.orbits).toEqual([-1, 1]);
    h.detach();
  });
});
