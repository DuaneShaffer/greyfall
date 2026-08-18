/** @vitest-environment happy-dom */
/**
 * The bottom rule: the mode, what it wants, and the controls that apply. The
 * orbit pair is on it because the bearing is a control and not a preference —
 * at the opening bearing the taller geometry hides whole columns of the board
 * from the pointer, and Q/E was the only way to turn it (UI_DESIGN §8).
 */

import { describe, expect, it } from "vitest";
import { ModeBar } from "../../src/ui/battle/modeBar.js";

const buttons = (bar: ModeBar): HTMLElement[] => [
  ...bar.el.querySelectorAll<HTMLElement>(".gf-mode-orbit-step"),
];

describe("ModeBar", () => {
  it("offers both bearings, labelled, and reports the direction each turns", () => {
    const turns: number[] = [];
    const bar = new ModeBar({ onOrbit: (direction) => turns.push(direction) });

    const [left, right] = buttons(bar);
    expect(left?.getAttribute("aria-label")).toBe("Orbit left");
    expect(right?.getAttribute("aria-label")).toBe("Orbit right");

    left?.click();
    right?.click();
    expect(turns).toEqual([-1, 1]);
  });

  it("keeps the orbit pair through every mode, camera keys and all", () => {
    const bar = new ModeBar();
    for (const mode of ["orders", "move", "target", "ai", "ended"] as const) {
      bar.update(mode);
      expect(buttons(bar)).toHaveLength(2);
    }
    expect(bar.el.textContent).toContain("⟲ / ⟳ to orbit");
    expect(bar.el.textContent).toContain("middle-drag to pan");
  });
});
