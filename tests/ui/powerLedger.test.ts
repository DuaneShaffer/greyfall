/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { PowerLedger } from "../../src/ui/battle/powerLedger.js";
import { mockPowerRegisterView } from "../../src/ui/mock.js";
import type { PowerLoadLevel, PowerNetworkView } from "../../src/ui/state.js";

const entries = [
  { objectId: "floor-nine-mains", name: "Floor Nine Mains", powered: true },
  { objectId: "press-line-north", name: "Blanking Press, Number One", powered: false },
  { objectId: "press-line-mid", name: "Blanking Press, Number Two", powered: false },
];

const network = (level: PowerLoadLevel): PowerNetworkView => ({
  gridId: "refinery-three-grid",
  name: "Refinery Three Grid",
  components: [
    {
      id: "east-main",
      sources: ["east main"],
      load: 14,
      capacity: 12,
      level,
      state: "live",
      nodes: [],
    },
  ],
  outOfCircuit: [],
});

describe("PowerLedger", () => {
  it("names each machine and whether it is live", () => {
    const ledger = new PowerLedger();
    ledger.update({ entries });

    const rows = [...ledger.el.querySelectorAll(".gf-power-entry")];
    expect(rows).toHaveLength(3);
    expect(rows[0]?.querySelector(".gf-power-name")?.textContent).toBe("Floor Nine Mains");
    expect(rows[0]?.querySelector(".gf-power-state")?.textContent).toBe("Live");
    expect(rows[0]?.classList.contains("is-live")).toBe(true);
    expect(rows[1]?.querySelector(".gf-power-state")?.textContent).toBe("Dead");
    expect(rows[1]?.classList.contains("is-dead")).toBe(true);
  });

  it("stamps the count of live machines on the plate", () => {
    const ledger = new PowerLedger();
    ledger.update({ entries });
    expect(ledger.el.querySelector(".gf-plate-stamp")?.textContent).toBe("1/3");
  });

  it("hides itself on a map that switches nothing", () => {
    const ledger = new PowerLedger();
    ledger.update(undefined);
    expect(ledger.el.classList.contains("is-empty")).toBe(true);
    expect(ledger.el.querySelectorAll(".gf-power-entry")).toHaveLength(0);

    ledger.update({ entries });
    expect(ledger.el.classList.contains("is-empty")).toBe(false);
  });
});

describe("the register's network sections", () => {
  it("draws §2.5a's mock: a section per grid, then the loose machinery", () => {
    const ledger = new PowerLedger();
    ledger.update(mockPowerRegisterView());

    const sections = [...ledger.el.querySelectorAll(".gf-power-network")];
    expect(sections.map((el) => el.querySelector(".gf-power-name")?.textContent)).toEqual([
      "Refinery Three Grid",
      "Gallery Grid",
      "Yard Grid",
    ]);
    const first = sections[0]!;
    const groups = [...first.querySelectorAll(".gf-power-component")];
    expect(
      groups.map((group) => [
        group.querySelector(".gf-power-name")?.textContent,
        group.querySelector(".gf-power-load")?.textContent ?? null,
        group.querySelector(".gf-power-flag")?.textContent ?? null,
      ]),
    ).toEqual([
      ["east main", "Load 14/12", "Tripped"],
      // A bus with nothing feeding it prints no arithmetic at all.
      ["Unfed", null, "Dead"],
      ["Out of circuit", null, null],
    ]);
    expect(
      [...first.querySelectorAll(".gf-power-entry")].map((row) => [
        row.querySelector(".gf-power-name")?.textContent,
        row.querySelector(".gf-power-state")?.textContent,
      ]),
    ).toEqual([
      ["east main", "Tripped"],
      ["charge hoist east", "Live"],
      ["charge hoist west", "Dead"],
      ["west main", "Open"],
      ["tie, gallery", "Tie Open"],
      ["north bus", "Cut"],
      ["feeder trough", "Destroyed"],
    ]);
    // The ungridded rows still draw, underneath the sections.
    const rows = [...ledger.el.querySelectorAll(".gf-power-list > .gf-power-entry")];
    expect(rows.map((row) => row.querySelector(".gf-power-name")?.textContent)).toEqual([
      "Service Lift",
    ]);
  });

  it("colours the load line at rest, at the rating, and past it", () => {
    const ledger = new PowerLedger();
    for (const [level, klass] of [
      ["rest", "is-rest"],
      ["rated", "is-rated"],
      ["over", "is-over"],
    ] as const) {
      ledger.update({ entries: [], networks: [network(level)] });
      expect(ledger.el.querySelector(".gf-power-load")?.classList.contains(klass)).toBe(true);
    }
  });

  it("prints no trip flag on a bus that has not blown", () => {
    const ledger = new PowerLedger();
    ledger.update({ entries: [], networks: [network("rest")] });
    expect(ledger.el.querySelector(".gf-power-flag")).toBeNull();
  });

  it("counts the network's live nodes on the plate", () => {
    const ledger = new PowerLedger();
    ledger.update(mockPowerRegisterView());
    // 2 live and a closed tie in the gallery, 2 live in the yard, 1 live hoist
    // and the Service Lift, out of thirteen rows.
    expect(ledger.el.querySelector(".gf-plate-stamp")?.textContent).toBe("7/13");
  });
});
