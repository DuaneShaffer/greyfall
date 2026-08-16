/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { ForecastPanel } from "../../src/ui/battle/forecast.js";
import { recordingIntents } from "../../src/ui/intents.js";
import { mockForecastView } from "../../src/ui/mock.js";

function textOf(root: HTMLElement, selector: string): string {
  return root.querySelector(selector)?.textContent ?? "";
}

describe("ForecastPanel", () => {
  it("renders the provided hit chance, damage range, and statuses", () => {
    const panel = new ForecastPanel();
    panel.update(mockForecastView());

    expect(textOf(panel.el, ".gf-forecast-ability")).toBe("Pin");
    expect(textOf(panel.el, ".gf-forecast-attacker")).toBe("Rowen Corvane · Enforcer");
    expect(textOf(panel.el, ".gf-forecast-cost")).toBe("Charge 0 · Immediate");
    expect(textOf(panel.el, ".gf-forecast-hit")).toContain("82%");
    expect(textOf(panel.el, ".gf-forecast-damage")).toContain("24–31");
    expect(textOf(panel.el, ".gf-forecast-damage")).toContain("kinetic");
    expect(textOf(panel.el, ".gf-forecast-status")).toBe("Stunned 35%");
    expect(textOf(panel.el, ".gf-forecast-modifiers")).toBe("Side · Height +1");
  });

  it("labels healing and casts, and says so when nothing lands a status", () => {
    const panel = new ForecastPanel();
    panel.update(
      mockForecastView({
        abilityId: "coagulant-jet",
        abilityName: "Coagulant Jet",
        chargeCost: 6,
        castSpeed: 30,
        targets: [
          {
            unitId: "dunn-brack",
            name: "Dunn Brack",
            hitChancePercent: 100,
            damage: { kind: "heal", min: 18, max: 18 },
            statuses: [],
            relativeFacing: null,
            heightAdvantage: 0,
          },
        ],
      }),
    );

    expect(textOf(panel.el, ".gf-forecast-cost")).toBe("Charge 6 · Cast 30");
    expect(textOf(panel.el, ".gf-forecast-damage")).toContain("Recovery");
    expect(textOf(panel.el, ".gf-forecast-damage")).toContain("18");
    expect(textOf(panel.el, ".gf-forecast-status")).toBe("No status effects");
  });

  it("shows an empty state and emits confirmTarget on commit", () => {
    const { intents, calls } = recordingIntents();
    const panel = new ForecastPanel({ intents });

    panel.update(null);
    expect(panel.el.classList.contains("is-empty")).toBe(true);
    expect(textOf(panel.el, ".gf-empty-note")).toBe("No action selected.");

    panel.update(mockForecastView());
    panel.el.querySelector<HTMLButtonElement>(".gf-button")?.click();
    expect(calls).toEqual([
      { name: "confirmTarget", args: ["rowen", "pin", { kind: "unit", unitId: "provocateur-a" }] },
    ]);
  });
});
