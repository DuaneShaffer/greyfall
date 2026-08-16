import { describe, expect, it } from "vitest";
import { DAMAGE_TYPE_VFX } from "../../src/art/palette.js";
import { TICKS_PER_SECOND } from "../../src/art/sprites.js";
import type { DamageType } from "../../src/data/schemas/common.js";
import {
  IMPACT_TIMING,
  conductiveTerrain,
  debrisDirections,
  impactFrame,
  jagPoints,
  persistsOnTile,
} from "../../src/render/effects.js";

const TYPES: readonly DamageType[] = ["kinetic", "arc", "thermal", "chemical"];

describe("impact timing", () => {
  it("matches the tick table of ART_DIRECTION §7 exactly", () => {
    for (const type of TYPES) {
      const spec = DAMAGE_TYPE_VFX[type];
      expect(IMPACT_TIMING[type].frames).toBe(spec.frames);
      expect(IMPACT_TIMING[type].ticksPerFrame).toBe(spec.ticksPerFrame);
      expect(IMPACT_TIMING[type].ticks).toBe(spec.frames * spec.ticksPerFrame);
      expect(IMPACT_TIMING[type].seconds).toBeCloseTo(
        (spec.frames * spec.ticksPerFrame) / TICKS_PER_SECOND,
        6,
      );
    }
  });

  it("keeps arc the fastest effect in the game", () => {
    for (const type of TYPES) {
      if (type === "arc") continue;
      expect(IMPACT_TIMING.arc.ticksPerFrame).toBeLessThan(IMPACT_TIMING[type].ticksPerFrame);
    }
  });

  it("steps frames on the tick table and clamps at the last one", () => {
    expect(impactFrame("arc", 0)).toBe(0);
    expect(impactFrame("arc", 3 / TICKS_PER_SECOND)).toBe(1);
    expect(impactFrame("arc", 9 / TICKS_PER_SECOND)).toBe(3);
    expect(impactFrame("arc", 10)).toBe(IMPACT_TIMING.arc.frames - 1);
    expect(impactFrame("thermal", -1)).toBe(0);
    expect(impactFrame("thermal", 12 / TICKS_PER_SECOND)).toBe(2);
  });

  it("makes chemical the only tile-persistent effect", () => {
    expect(TYPES.filter(persistsOnTile)).toEqual(["chemical"]);
  });

  it("flashes the ground only on wet or metal tiles", () => {
    expect(conductiveTerrain("water")).toBe(true);
    expect(conductiveTerrain("rail")).toBe(true);
    expect(conductiveTerrain("plain")).toBe(false);
    expect(conductiveTerrain("rough")).toBe(false);
    expect(conductiveTerrain("impassable")).toBe(false);
  });
});

describe("arc geometry", () => {
  const from = { x: 0, y: 1, z: 0 };
  const to = { x: 3, y: 1, z: 0 };

  it("is a chain of straight segments between the two endpoints", () => {
    const points = jagPoints(from, to, 3);
    expect(points).toHaveLength(4);
    expect(points[0]).toEqual(from);
    expect(points[points.length - 1]).toEqual(to);
  });

  it("steps off the direct line in alternating directions, never curving", () => {
    const points = jagPoints(from, to, 3);
    const offsets = points.slice(1, -1).map((point) => point.z);
    expect(offsets.every((offset) => offset !== 0)).toBe(true);
    expect(Math.sign(offsets[0] as number)).not.toBe(Math.sign(offsets[1] as number));
  });

  it("is deterministic for the same endpoints", () => {
    expect(jagPoints(from, to)).toEqual(jagPoints(from, to));
  });

  it("degrades to a single straight segment", () => {
    expect(jagPoints(from, to, 1)).toEqual([from, to]);
  });
});

describe("kinetic debris", () => {
  it("throws every piece upward and outward", () => {
    const directions = debrisDirections(9, null);
    expect(directions).toHaveLength(9);
    for (const direction of directions) {
      expect(direction.y).toBeGreaterThan(0);
      expect(Math.hypot(direction.x, direction.z)).toBeGreaterThan(0);
    }
  });

  it("biases the spread along the blow when the source is known", () => {
    const along = { x: 1, y: 0, z: 0 };
    const biased = debrisDirections(6, along);
    expect(biased.every((direction) => direction.x > 0)).toBe(true);
    expect(debrisDirections(6, along)).toEqual(biased);
  });
});
