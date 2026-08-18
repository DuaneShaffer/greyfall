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
    expect(textOf(panel.el, ".gf-forecast-cost")).toBe("Charge 0 · Immediate");
    expect(textOf(panel.el, ".gf-forecast-hit")).toContain("82%");
    expect(textOf(panel.el, ".gf-forecast-damage")).toContain("24–31");
    expect(textOf(panel.el, ".gf-forecast-damage")).toContain("kinetic");
    expect(textOf(panel.el, ".gf-forecast-status")).toBe("Stunned 35%");
    expect(textOf(panel.el, ".gf-forecast-modifiers")).toBe("Side · Height +1");
  });

  it("takes the foot of the frame at the confirm moment, and faces the parties", () => {
    const panel = new ForecastPanel();
    panel.update(mockForecastView());

    expect(panel.el.classList.contains("is-armed")).toBe(true);
    expect(textOf(panel.el, ".gf-forecast-party.is-actor .gf-forecast-party-name")).toBe(
      "Rowen Corvane",
    );
    expect(textOf(panel.el, ".gf-forecast-party.is-actor .gf-forecast-party-job")).toBe("Enforcer");
    expect(textOf(panel.el, ".gf-forecast-party.is-actor .gf-forecast-party-hp")).toContain("41 / 58");
    expect(textOf(panel.el, ".gf-forecast-party.is-target .gf-forecast-party-name")).toBe(
      "Provocateur",
    );
    expect(textOf(panel.el, ".gf-forecast-party.is-target .gf-forecast-party-hp")).toContain("33 / 44");
    // The exchange is between them, and it is where the numbers live.
    expect(panel.el.querySelector(".gf-forecast-exchange .gf-forecast-hit")).not.toBeNull();
    expect(panel.el.querySelector(".gf-plate-stamp")?.textContent).toBe("CONFIRM");
  });

  it("stays a compact side panel for a preview nobody staged", () => {
    const panel = new ForecastPanel();
    panel.update(
      mockForecastView({
        armed: false,
        abilityId: "operate",
        abilityName: "Operate — West Main",
        operate: { objectId: "west-main" },
        targets: [],
        effects: ["3 machines lose power"],
        aimedAt: { kind: "object", objectId: "west-main" },
      }),
    );

    expect(panel.el.classList.contains("is-armed")).toBe(false);
    expect(panel.el.querySelector(".gf-forecast-stage")).toBeNull();
    expect(textOf(panel.el, ".gf-forecast-attacker")).toBe("Rowen Corvane · Enforcer");
    expect(textOf(panel.el, ".gf-forecast-effects.is-ability")).toContain("3 machines lose power");
    expect(panel.el.querySelector<HTMLButtonElement>(".gf-button")?.disabled).toBe(false);
  });

  it("names what an armed order is aimed at when nobody is standing in it", () => {
    const panel = new ForecastPanel();
    panel.update(
      mockForecastView({
        abilityName: "Sentry Frame",
        targets: [],
        effects: ["Sentry frame placed · 24 integrity"],
        aimedAt: { kind: "tile", tile: { x: 3, y: 2 } },
      }),
    );

    expect(textOf(panel.el, ".gf-forecast-party.is-target .gf-forecast-party-name")).toBe("Tile 3, 2");
    expect(textOf(panel.el, ".gf-forecast-party.is-target")).toContain("the order stands");
  });

  it("runs an area order's other targets under the stage rather than hiding them", () => {
    const panel = new ForecastPanel();
    const base = mockForecastView();
    panel.update(
      mockForecastView({
        targets: [
          base.targets[0]!,
          { ...base.targets[0]!, unitId: "provocateur-b", name: "Provocateur B" },
        ],
      }),
    );

    expect(textOf(panel.el, ".gf-forecast-party.is-target .gf-forecast-party-name")).toBe(
      "Provocateur",
    );
    const rows = [...panel.el.querySelectorAll(".gf-forecast-target-name")].map((n) => n.textContent);
    expect(rows).toEqual(["Provocateur B"]);
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
            effects: [],
            attackAngle: null,
            heightAdvantage: 0,
          },
        ],
      }),
    );

    expect(textOf(panel.el, ".gf-forecast-cost")).toBe("Charge 6 · Cast 30");
    expect(textOf(panel.el, ".gf-forecast-damage")).toContain("Recovery");
    expect(textOf(panel.el, ".gf-forecast-damage")).toContain("18");
    expect(textOf(panel.el, ".gf-forecast-status")).toBe("No further effect");
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

  it("prices an item by what the satchel has left and commits it as an item", () => {
    const { intents, calls } = recordingIntents();
    const panel = new ForecastPanel({ intents });
    panel.update(
      mockForecastView({
        abilityId: "item:coagulant-vial",
        abilityName: "Coagulant Vial",
        chargeCost: 0,
        castSpeed: null,
        item: { itemId: "coagulant-vial", remaining: 2 },
      }),
    );

    expect(textOf(panel.el, ".gf-forecast-cost")).toBe("Field kit · 2 left after use");
    panel.el.querySelector<HTMLButtonElement>(".gf-button")?.click();
    expect(calls).toEqual([
      {
        name: "confirmItemTarget",
        args: ["rowen", "coagulant-vial", { kind: "unit", unitId: "provocateur-a" }],
      },
    ]);
  });

  it("describes an order that grants rather than damages", () => {
    const panel = new ForecastPanel();
    panel.update(
      mockForecastView({
        abilityId: "bracer-shot",
        abilityName: "Bracer Shot",
        chargeCost: 3,
        targets: [
          {
            unitId: "dunn-brack",
            name: "Dunn Brack",
            hitChancePercent: 100,
            damage: null,
            statuses: [],
            effects: ["Phys +5 · Mag +5 · Evade +5 for 3 turns"],
            attackAngle: null,
            heightAdvantage: 0,
          },
        ],
      }),
    );

    // No damage row at all: "Damage —" beside a buff reads as "does nothing".
    expect(panel.el.querySelector(".gf-forecast-damage")).toBeNull();
    expect(panel.el.querySelector(".gf-forecast-status.is-none")).toBeNull();
    expect(textOf(panel.el, ".gf-forecast-effect")).toBe("Phys +5 · Mag +5 · Evade +5 for 3 turns");
  });

  it("offers the stamp to an order whose whole payload lands on nobody", () => {
    const { intents, calls } = recordingIntents();
    const panel = new ForecastPanel({ intents });
    panel.update(
      mockForecastView({
        abilityId: "sentry-frame",
        abilityName: "Sentry Frame",
        targets: [],
        effects: ["Sentry frame placed · 24 integrity"],
        aimedAt: { kind: "tile", tile: { x: 3, y: 2 } },
      }),
    );

    const commit = panel.el.querySelector<HTMLButtonElement>(".gf-button");
    expect(commit?.disabled).toBe(false);
    expect(textOf(panel.el, ".gf-forecast-effects.is-ability")).toContain("Sentry frame placed");
    commit?.click();
    expect(calls).toEqual([
      { name: "confirmTarget", args: ["rowen", "sentry-frame", { kind: "tile", tile: { x: 3, y: 2 } }] },
    ]);
  });

  it("keeps a committed order's numbers through the redraw that follows it", () => {
    const panel = new ForecastPanel();
    panel.update(mockForecastView());
    panel.lock();

    // The stamp is spent, so the takeover has nothing left to ask: the record
    // stands down to the compact panel and gives the field back.
    expect(panel.el.classList.contains("is-armed")).toBe(false);
    expect(panel.el.querySelector(".gf-forecast-stage")).toBeNull();
    expect(textOf(panel.el, ".gf-forecast-hit")).toContain("82%");

    panel.update(null);
    expect(panel.el.classList.contains("is-empty")).toBe(false);
    expect(textOf(panel.el, ".gf-forecast-ability")).toBe("Pin");
    expect(panel.el.querySelector<HTMLButtonElement>(".gf-button")?.disabled).toBe(true);
    expect(panel.el.querySelector<HTMLButtonElement>(".gf-button")?.textContent).toBe("Committed");

    panel.clear();
    expect(panel.el.classList.contains("is-empty")).toBe(true);
    expect(textOf(panel.el, ".gf-empty-note")).toBe("No action selected.");
  });
});
