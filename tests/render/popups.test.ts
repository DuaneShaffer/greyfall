import { describe, expect, it } from "vitest";
import {
  POPUP_LANE_HEIGHT,
  POPUP_SECONDS,
  POPUP_STACK_RADIUS,
  PopupField,
  damagePopup,
  missPopup,
  popupHeight,
  popupOpacity,
  popupProgress,
  popupStyleFor,
} from "../../src/render/popups.js";

const at = (x: number, z: number) => ({ x, y: 1.6, z });

describe("popup styling", () => {
  it("follows the closed number palette of ART_DIRECTION §7", () => {
    expect(popupStyleFor(12, "kinetic")).toBe("normal");
    expect(popupStyleFor(12, "thermal")).toBe("normal");
    expect(popupStyleFor(12, "chemical")).toBe("normal");
    expect(popupStyleFor(12, "arc")).toBe("arc");
    expect(popupStyleFor(-9, null)).toBe("heal");
    expect(popupStyleFor(-9, "arc")).toBe("heal");
  });

  it("prints heals with a plus and damage bare, both rounded", () => {
    expect(damagePopup(17, "kinetic")).toEqual({ text: "17", style: "normal", outlined: true });
    expect(damagePopup(-6, null)).toEqual({ text: "+6", style: "heal", outlined: true });
    expect(damagePopup(4.6, "arc").text).toBe("5");
  });

  it("says MISS without an outline", () => {
    expect(missPopup()).toEqual({ text: "MISS", style: "miss", outlined: false });
  });
});

describe("popup lifecycle", () => {
  it("rises and fades over its 40 ticks, then retires itself", () => {
    const field = new PopupField();
    const popup = field.spawn(damagePopup(8, "kinetic"), at(0, 0));

    expect(popupProgress(popup)).toBe(0);
    expect(popupOpacity(popup)).toBe(1);
    const groundHeight = popupHeight(popup);

    field.advance(POPUP_SECONDS / 2);
    expect(popupHeight(popup)).toBeGreaterThan(groundHeight);
    expect(popupOpacity(popup)).toBe(1);

    field.advance(POPUP_SECONDS * 0.45);
    expect(popupOpacity(popup)).toBeLessThan(1);
    expect(field.count).toBe(1);

    field.advance(POPUP_SECONDS);
    expect(field.count).toBe(0);
  });

  it("never runs the clock backwards", () => {
    const field = new PopupField();
    const popup = field.spawn(damagePopup(3, "kinetic"), at(0, 0));
    field.advance(-5);
    expect(popup.age).toBe(0);
  });

  it("skip means gone, not fast-forwarded", () => {
    const field = new PopupField();
    field.spawn(damagePopup(3, "kinetic"), at(0, 0));
    field.spawn(missPopup(), at(4, 4));
    field.clear();
    expect(field.count).toBe(0);
    expect(field.active).toEqual([]);
  });
});

describe("popup stacking", () => {
  it("gives simultaneous popups over one unit separate lanes", () => {
    const field = new PopupField();
    const first = field.spawn(damagePopup(4, "kinetic"), at(1, 1));
    const second = field.spawn(damagePopup(5, "arc"), at(1, 1));
    const third = field.spawn(missPopup(), at(1, 1));

    expect([first.lane, second.lane, third.lane]).toEqual([0, 1, 2]);
    const [low, mid, high] = [first, second, third].map(popupHeight) as [number, number, number];
    expect(mid - low).toBeCloseTo(POPUP_LANE_HEIGHT, 6);
    expect(high - mid).toBeCloseTo(POPUP_LANE_HEIGHT, 6);
  });

  it("does not stack popups on different units", () => {
    const field = new PopupField();
    const near = field.spawn(damagePopup(4, "kinetic"), at(0, 0));
    const far = field.spawn(damagePopup(4, "kinetic"), at(0, POPUP_STACK_RADIUS + 0.5));
    expect(near.lane).toBe(0);
    expect(far.lane).toBe(0);
  });

  it("reuses a lane once its popup has expired", () => {
    const field = new PopupField();
    field.spawn(damagePopup(4, "kinetic"), at(2, 2));
    expect(field.laneFor(at(2, 2))).toBe(1);
    field.advance(POPUP_SECONDS);
    expect(field.count).toBe(0);
    expect(field.laneFor(at(2, 2))).toBe(0);
  });
});
