/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { recordingIntents } from "../../src/ui/intents.js";
import { mockDeploymentView } from "../../src/ui/mock.js";
import {
  DeploymentScreen,
  bearingWord,
  deploySlotLabel,
  type DeployOppositionView,
} from "../../src/ui/screens/deployment.js";

const OPPOSITION: DeployOppositionView[] = [
  { unitId: "provocateur-a", name: "Provocateur", faction: "Watch", hp: 33, maxHp: 44, tile: { x: 4, y: 0 } },
  { unitId: "provocateur-b", name: "Line Serjeant", faction: "Watch", hp: 40, maxHp: 40, tile: { x: 6, y: 1 } },
];

function screen(): { screen: DeploymentScreen; calls: ReturnType<typeof recordingIntents>["calls"] } {
  const { intents, calls } = recordingIntents();
  const made = new DeploymentScreen({ intents });
  made.update(mockDeploymentView());
  return { screen: made, calls };
}

function slot(made: DeploymentScreen, index: number): HTMLElement {
  const node = made.el.querySelector<HTMLElement>(`.gf-deploy-slot[data-tile="${index}"]`);
  expect(node, `no slot ${index}`).not.toBeNull();
  return node as HTMLElement;
}

describe("the formation's tiles have names", () => {
  it("letters them, and keeps the coordinate beside it", () => {
    expect([0, 1, 25, 26].map(deploySlotLabel)).toEqual(["A", "B", "Z", "T27"]);
    const { screen: made } = screen();
    expect(slot(made, 0).querySelector(".gf-deploy-chip")?.textContent).toBe("A");
    expect(slot(made, 2).querySelector(".gf-deploy-chip")?.textContent).toBe("C");
    expect(slot(made, 0).textContent).toContain("0,4");
  });

  it("places from the rail, because the tiles themselves are behind it", () => {
    const { screen: made, calls } = screen();
    // Pick a unit already on the field, then put them on an empty tile.
    slot(made, 0).click();
    expect(made.placingUnitId).toBe("rowen");
    slot(made, 3).click();
    expect(calls.at(-1)).toEqual({ name: "assignDeployment", args: ["rowen", 3] });
    expect(made.placingUnitId).toBeNull();
  });

  it("says so when a tile is picked with nobody in hand", () => {
    const { screen: made } = screen();
    slot(made, 2).click();
    expect(made.el.querySelector(".gf-detail-note.is-refused")?.textContent).toContain("Tile C");
  });

  it("names whoever holds a tile, for the hand as well as the eye", () => {
    const { screen: made } = screen();
    expect(slot(made, 0).title).toBe("Rowen Corvane");
    expect(slot(made, 2).title).toContain("empty");
  });
});

describe("the other side of the board", () => {
  it("prints name, condition and allegiance for each of them", () => {
    const { screen: made } = screen();
    made.setOpposition(OPPOSITION);
    const rows = [...made.el.querySelectorAll(".gf-deploy-enemy")].map((row) => row.textContent ?? "");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("Provocateur");
    expect(rows[0]).toContain("33 / 44");
    expect(rows[0]).toContain("Watch");
  });

  it("says which way they are, off their own tiles", () => {
    const { screen: made } = screen();
    made.setOpposition(OPPOSITION);
    // The formation sits at y 4–5; they are at y 0–1, which is north of it.
    expect(made.el.querySelector(".gf-deploy-bearing")?.textContent).toContain("north");
  });

  it("measures the bearing in the eight words a player can use", () => {
    expect(bearingWord({ x: 4, y: 4 }, { x: 4, y: 0 })).toBe("north");
    expect(bearingWord({ x: 4, y: 4 }, { x: 8, y: 4 })).toBe("east");
    expect(bearingWord({ x: 4, y: 4 }, { x: 4, y: 9 })).toBe("south");
    expect(bearingWord({ x: 4, y: 4 }, { x: 0, y: 4 })).toBe("west");
    expect(bearingWord({ x: 4, y: 4 }, { x: 8, y: 0 })).toBe("north-east");
    expect(bearingWord({ x: 4, y: 4 }, { x: 0, y: 8 })).toBe("south-west");
    expect(bearingWord({ x: 4, y: 4 }, { x: 4, y: 4 })).toBe("on top of the formation");
  });

  it("is not there at all for an encounter nobody handed over", () => {
    const { screen: made } = screen();
    expect(made.el.querySelector(".gf-deploy-opposition")).toBeNull();
    expect(made.el.querySelector(".gf-deploy-bearing")).toBeNull();
  });

  it("reads one out when the field says the pointer is on them", () => {
    const { screen: made } = screen();
    made.setOpposition(OPPOSITION);
    made.hoverUnit("provocateur-b");
    const intel = made.el.querySelector<HTMLElement>(".gf-deploy-intel");
    expect(intel?.classList.contains("is-hidden")).toBe(false);
    expect(intel?.textContent).toBe("Line Serjeant · Watch · 40 of 40");
    expect(
      made.el.querySelector('.gf-deploy-enemy[data-unit="provocateur-b"]')?.classList.contains("is-hovered"),
    ).toBe(true);

    made.hoverUnit(null);
    expect(intel?.classList.contains("is-hidden")).toBe(true);
  });

  /**
   * Re-playtest N4. The block sat at y=916 in an 883px viewport, at the foot of a
   * 1002px rail showing 643 — the whole answer to "no enemy intel at formation
   * time", off screen at the window size the finding came from. Its place in the
   * rail is the half of that a DOM test can hold; the two-column frame that makes
   * the room is asserted in tests/ui/styles.test.ts.
   */
  it("is read before the tiles, not under them", () => {
    const { screen: made } = screen();
    made.setOpposition(OPPOSITION);
    const rail = [...made.el.querySelectorAll(".gf-deploy-opposition, .gf-deploy-slots")];
    expect(rail.map((node) => node.className)).toEqual(["gf-deploy-opposition", "gf-deploy-slots"]);
    // And the bearing still heads it, above the rows it is about.
    const detail = made.el.querySelector(".gf-deploy-detail") as HTMLElement;
    const order = [...detail.querySelectorAll(".gf-deploy-bearing, .gf-deploy-opposition")];
    expect(order.map((node) => node.className.split(" ").at(-1))).toEqual([
      "gf-deploy-bearing",
      "gf-deploy-opposition",
    ]);
  });

  it("marks one of ours without rebuilding the rows under the hand", () => {
    const { screen: made } = screen();
    const before = [...made.el.querySelectorAll(".gf-deploy-slot")];
    made.hoverUnit("rowen");
    expect([...made.el.querySelectorAll(".gf-deploy-slot")]).toEqual(before);
    expect(slot(made, 0).classList.contains("is-hovered")).toBe(true);
  });
});

describe("the control that starts the engagement", () => {
  it("does not wear the same label as the one that opens this screen", () => {
    const { screen: made, calls } = screen();
    const confirm = made.el.querySelector<HTMLElement>('.gf-menu-entry[data-entry="__confirm"]');
    expect(confirm?.querySelector(".gf-menu-label")?.textContent).toBe("Take the field");
    expect(confirm?.textContent).not.toContain("Move out");
    confirm?.click();
    expect(calls.at(-1)?.name).toBe("confirmDeployment");
  });
});
