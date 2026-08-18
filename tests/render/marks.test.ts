/** @vitest-environment happy-dom */
/**
 * What the field says about a unit without being asked. A blind playtest could
 * not tell which figure was about to act — its own or the enemy's — and a unit
 * carrying three statuses looked exactly like one carrying none. Both facts were
 * already in the seam (UI_DESIGN §14.3, §14.4); neither was on the board.
 */

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { NO_STATUSES, fieldMarksFrom, statusesOf } from "../../src/render/marks.js";
import { teamColor } from "../../src/render/palette.js";
import { UnitVisual } from "../../src/render/units.js";
import type { UnitView } from "../../src/render/viewmodel.js";

const unitView = (overrides: Partial<UnitView> = {}): UnitView => ({
  id: "rowen",
  name: "Rowen Corvane",
  jobId: "enforcer",
  team: "player",
  position: { x: 1, y: 1 },
  elevation: 0,
  facing: "south",
  hpFraction: 1,
  downed: false,
  ...overrides,
});

const named = (root: THREE.Object3D, name: string): THREE.Object3D => {
  const found = root.getObjectByName(name);
  expect(found, name).toBeDefined();
  return found as THREE.Object3D;
};

const materialOf = (object: THREE.Object3D): THREE.MeshBasicMaterial =>
  (object as THREE.Mesh).material as THREE.MeshBasicMaterial;

describe("reading the marks off the seam", () => {
  it("counts statuses by kind and files nothing for a unit carrying none", () => {
    const marks = fieldMarksFrom("kesh", [
      {
        unitId: "rowen",
        statuses: [
          { category: "buff" },
          { category: "debuff" },
          { category: "debuff" },
        ],
      },
      { unitId: "kesh", statuses: [] },
    ]);

    expect(marks.activeUnitId).toBe("kesh");
    expect(statusesOf(marks, "rowen")).toEqual({ buffs: 1, debuffs: 2 });
    expect(marks.statuses.has("kesh")).toBe(false);
    expect(statusesOf(marks, "kesh")).toBe(NO_STATUSES);
    expect(statusesOf(marks, "nobody")).toBe(NO_STATUSES);
  });

  it("names an enemy's turn as readily as the player's", () => {
    expect(fieldMarksFrom("enemy-2", []).activeUnitId).toBe("enemy-2");
    expect(fieldMarksFrom(null, []).activeUnitId).toBeNull();
  });
});

describe("the acting unit's marker", () => {
  it("is dark until the turn starts, then lights a ring and a caret", () => {
    const visual = new UnitVisual(unitView());
    const beacon = named(visual.group, "active-beacon");
    const caret = named(visual.group, "active-caret");

    expect(beacon.visible).toBe(false);
    expect(caret.visible).toBe(false);

    visual.setActing(true);
    expect(beacon.visible).toBe(true);
    expect(caret.visible).toBe(true);

    visual.setActing(false);
    expect(beacon.visible).toBe(false);
    expect(caret.visible).toBe(false);
    visual.dispose();
  });

  it("marks either side in its own colour", () => {
    for (const team of ["player", "enemy", "neutral"] as const) {
      const visual = new UnitVisual(unitView({ team }));
      visual.setActing(true);

      expect(materialOf(named(visual.group, "active-beacon")).color.getHex()).toBe(
        teamColor[team],
      );
      expect(materialOf(named(visual.group, "active-caret")).color.getHex()).toBe(teamColor[team]);
      visual.dispose();
    }
  });

  it("stays on the true tile while the caret travels with a move ghost", () => {
    const visual = new UnitVisual(unitView());
    visual.setActing(true);
    const beacon = named(visual.group, "active-beacon");
    const caret = named(visual.group, "active-caret");
    const billboard = named(visual.group, "unit-billboard");

    expect(caret.parent).toBe(billboard);
    expect(beacon.parent).toBe(visual.group);

    visual.setPreviewOffset({ x: 2, y: 0.5, z: -1 });
    expect(beacon.position.x).toBe(0);
    expect(billboard.position.x).toBe(2);
    visual.dispose();
  });

  it("breathes rather than blinks, and goes still when the turn passes", () => {
    const visual = new UnitVisual(unitView());
    visual.setActing(true);
    const material = materialOf(named(visual.group, "active-beacon"));
    const opacities = new Set<number>();
    for (let step = 0; step < 6; step += 1) {
      visual.update(0.1);
      opacities.add(Math.round(material.opacity * 1000));
    }

    expect(opacities.size).toBeGreaterThan(1);
    visual.setActing(false);
    const resting = material.opacity;
    visual.update(0.5);
    expect(material.opacity).toBe(resting);
    visual.dispose();
  });

  it("does not mark a unit that is down", () => {
    const visual = new UnitVisual(unitView({ downed: true }));
    visual.setActing(true);

    expect(named(visual.group, "active-beacon").visible).toBe(false);
    expect(named(visual.group, "active-caret").visible).toBe(false);
    visual.dispose();
  });
});

describe("status chips", () => {
  it("shows one chip per kind, and neither for a clean unit", () => {
    const visual = new UnitVisual(unitView());
    const buff = named(visual.group, "status-chip-buff");
    const debuff = named(visual.group, "status-chip-debuff");

    expect(buff.visible).toBe(false);
    expect(debuff.visible).toBe(false);

    visual.setStatusCounts({ buffs: 2, debuffs: 0 });
    expect(buff.visible).toBe(true);
    expect(debuff.visible).toBe(false);

    visual.setStatusCounts({ buffs: 1, debuffs: 3 });
    expect(buff.visible).toBe(true);
    expect(debuff.visible).toBe(true);

    visual.setStatusCounts(NO_STATUSES);
    expect(buff.visible).toBe(false);
    expect(debuff.visible).toBe(false);
    visual.dispose();
  });

  it("puts the kind in the position as well as the colour", () => {
    const visual = new UnitVisual(unitView());
    const buff = named(visual.group, "status-chip-buff");
    const debuff = named(visual.group, "status-chip-debuff");

    expect(buff.position.x).toBeLessThan(0);
    expect(debuff.position.x).toBeGreaterThan(0);
    expect(materialOf(buff).color.getHex()).not.toBe(materialOf(debuff).color.getHex());
    // Over the head, where they cannot be mistaken for the tile's own paint.
    expect(buff.position.y).toBeGreaterThan(1);
    visual.dispose();
  });

  it("travels with the figure, not with the tile it left", () => {
    const visual = new UnitVisual(unitView());
    const billboard = named(visual.group, "unit-billboard");

    expect(named(visual.group, "status-chip-buff").parent).toBe(billboard);
    expect(named(visual.group, "status-chip-debuff").parent).toBe(billboard);
    visual.dispose();
  });

  it("drops the chips when the unit goes down", () => {
    const visual = new UnitVisual(unitView());
    visual.setStatusCounts({ buffs: 1, debuffs: 1 });
    visual.setDowned(true);

    expect(named(visual.group, "status-chip-buff").visible).toBe(false);
    expect(named(visual.group, "status-chip-debuff").visible).toBe(false);
    visual.dispose();
  });
});
