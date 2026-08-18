/** @vitest-environment happy-dom */
/**
 * Camera input. The middle button is the hand: press and hold slides the board
 * under the pointer. The right button is the turn: press and drag steps the
 * bearing the same 90° Q/E do, and released without travelling it is still the
 * withdraw right-click always was (UI_DESIGN §8, acceptance finding C).
 */

import { describe, expect, it, vi } from "vitest";
import { attachControls } from "../../src/render/controls.js";
import type { BattleRenderer } from "../../src/render/scene.js";

interface Stub {
  renderer: BattleRenderer;
  element: HTMLElement;
  orbits: number[];
  pans: number[][];
  cancels: number;
  detach: () => void;
}

function stub(): Stub {
  const orbits: number[] = [];
  const pans: number[][] = [];
  const counted = { cancels: 0 };
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
  const detach = attachControls(renderer, element, {
    edgePan: false,
    onCancel: () => {
      counted.cancels += 1;
    },
  });
  return {
    renderer,
    element,
    orbits,
    pans,
    detach,
    get cancels() {
      return counted.cancels;
    },
  };
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

describe("right-drag turns the board", () => {
  it("steps a quarter turn per stretch of drag, in the drag's direction", () => {
    const h = stub();
    h.element.dispatchEvent(pointer("pointerdown", { button: 2, clientX: 400, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointermove", { clientX: 500, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointermove", { clientX: 700, clientY: 306 }));

    expect(h.orbits).toEqual([1, 1, 1]);
    h.element.dispatchEvent(pointer("pointerup", { button: 2, clientX: 700, clientY: 306 }));
    h.detach();
  });

  it("turns back the other way when the drag reverses", () => {
    const h = stub();
    h.element.dispatchEvent(pointer("pointerdown", { button: 2, clientX: 400, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointermove", { clientX: 300, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointermove", { clientX: 400, clientY: 300 }));

    expect(h.orbits).toEqual([-1, 1]);
    h.detach();
  });

  it("does not slide the board and does not withdraw", () => {
    const h = stub();
    h.element.dispatchEvent(pointer("pointerdown", { button: 2, clientX: 400, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointermove", { clientX: 560, clientY: 340 }));
    h.element.dispatchEvent(pointer("pointerup", { button: 2, clientX: 560, clientY: 340 }));

    expect(h.pans).toEqual([]);
    expect(h.cancels).toBe(0);
    h.detach();
  });

  it("leaves the tile cursor alone mid-turn, then re-picks where it let go", () => {
    const h = stub();
    const hovered = h.renderer.setHoveredTile as unknown as ReturnType<typeof vi.fn>;
    h.element.dispatchEvent(pointer("pointerdown", { button: 2, clientX: 400, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointermove", { clientX: 520, clientY: 300 }));
    expect(hovered).not.toHaveBeenCalled();

    h.element.dispatchEvent(pointer("pointerup", { button: 2, clientX: 520, clientY: 300 }));
    expect(hovered).toHaveBeenCalledTimes(1);
    h.detach();
  });

  it("wears a cursor of its own, and gives the hand back on release", () => {
    const h = stub();
    h.element.dispatchEvent(pointer("pointerdown", { button: 2, clientX: 400, clientY: 300 }));
    expect(h.element.style.cursor).not.toBe("grab");

    h.element.dispatchEvent(pointer("pointerup", { button: 2, clientX: 400, clientY: 300 }));
    expect(h.element.style.cursor).toBe("grab");
    h.detach();
  });

  it("never selects a tile", () => {
    const h = stub();
    const select = h.renderer.selectTile as unknown as ReturnType<typeof vi.fn>;
    h.element.dispatchEvent(pointer("pointerdown", { button: 2, clientX: 400, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointerup", { button: 2, clientX: 400, clientY: 300 }));

    expect(select).not.toHaveBeenCalled();
    h.detach();
  });
});

describe("right-click withdraws", () => {
  it("fires the cancel on a press that did not travel", () => {
    const h = stub();
    h.element.dispatchEvent(pointer("pointerdown", { button: 2, clientX: 400, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointerup", { button: 2, clientX: 400, clientY: 300 }));

    expect(h.cancels).toBe(1);
    expect(h.orbits).toEqual([]);
    h.detach();
  });

  it("survives the jitter of a hand resting on the button", () => {
    const h = stub();
    h.element.dispatchEvent(pointer("pointerdown", { button: 2, clientX: 400, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointermove", { clientX: 402, clientY: 301 }));
    h.element.dispatchEvent(pointer("pointerup", { button: 2, clientX: 402, clientY: 301 }));

    expect(h.cancels).toBe(1);
    expect(h.orbits).toEqual([]);
    h.detach();
  });

  it("stands down once the press has become a drag", () => {
    const h = stub();
    h.element.dispatchEvent(pointer("pointerdown", { button: 2, clientX: 400, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointermove", { clientX: 420, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointerup", { button: 2, clientX: 420, clientY: 300 }));

    expect(h.cancels).toBe(0);
    h.detach();
  });

  it("is never the middle button's release", () => {
    const h = stub();
    h.element.dispatchEvent(pointer("pointerdown", { button: 1, clientX: 400, clientY: 300 }));
    h.element.dispatchEvent(pointer("pointerup", { button: 1, clientX: 400, clientY: 300 }));

    expect(h.cancels).toBe(0);
    h.detach();
  });
});

describe("the browser's own menu", () => {
  it("stays shut over the board", () => {
    const h = stub();
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    h.element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    h.detach();
  });
});
