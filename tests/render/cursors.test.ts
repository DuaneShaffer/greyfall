/** @vitest-environment happy-dom */
/**
 * The turn gesture's cursor. It exists because the two dragging buttons must not
 * look alike — the middle one slides the board, the right one turns it — and no
 * stock cursor says "turn". Drawn rather than shipped, so it degrades in three
 * steps: retina through `image-set`, plain 1x url, closed hand.
 */

import { afterEach, describe, expect, it } from "vitest";
import { ROTATE_CURSOR_FALLBACK, ROTATE_CURSOR_SIZE, rotateCursorValue } from "../../src/render/cursors.js";

const HOTSPOT = ROTATE_CURSOR_SIZE / 2;

interface Restore {
  (): void;
}

const restores: Restore[] = [];

afterEach(() => {
  while (restores.length > 0) (restores.pop() as Restore)();
});

/** A 2d context that records nothing: the raster is not what is under test. */
function stubCanvas(dataUrl: string, sizes: number[]): void {
  const proto = globalThis.HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
  const priorContext = proto.getContext;
  const priorUrl = proto.toDataURL;
  proto.getContext = function getContext(this: HTMLCanvasElement, id: string): unknown {
    if (id !== "2d") return null;
    sizes.push(this.width);
    return {
      lineCap: "butt",
      lineWidth: 1,
      strokeStyle: "",
      fillStyle: "",
      scale: () => {},
      beginPath: () => {},
      arc: () => {},
      stroke: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      fill: () => {},
    };
  };
  proto.toDataURL = () => dataUrl;
  restores.push(() => {
    proto.getContext = priorContext;
    proto.toDataURL = priorUrl;
  });
}

function stubRatio(ratio: number, supports: boolean): void {
  const target = globalThis as unknown as Record<string, unknown>;
  const priorRatio = target.devicePixelRatio;
  const priorCss = target.CSS;
  target.devicePixelRatio = ratio;
  target.CSS = { supports: () => supports };
  restores.push(() => {
    target.devicePixelRatio = priorRatio;
    target.CSS = priorCss;
  });
}

describe("the rotate cursor", () => {
  it("falls back to the closed hand when nothing can draw it", () => {
    stubRatio(1, false);
    const proto = globalThis.HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
    const prior = proto.getContext;
    proto.getContext = () => null;
    restores.push(() => {
      proto.getContext = prior;
    });

    expect(rotateCursorValue()).toBe(ROTATE_CURSOR_FALLBACK);
  });

  it("centres the hotspot on the glyph and keeps the hand as the fallback", () => {
    stubRatio(1, false);
    const sizes: number[] = [];
    stubCanvas("data:image/png;base64,AAAA", sizes);

    const value = rotateCursorValue();

    expect(value).toBe(`url("data:image/png;base64,AAAA") ${HOTSPOT} ${HOTSPOT}, ${ROTATE_CURSOR_FALLBACK}`);
    expect(sizes).toEqual([ROTATE_CURSOR_SIZE]);
  });

  it("draws a denser bitmap on a retina screen without drawing a bigger cursor", () => {
    stubRatio(2, true);
    const sizes: number[] = [];
    stubCanvas("data:image/png;base64,BBBB", sizes);

    const value = rotateCursorValue();

    expect(sizes).toEqual([ROTATE_CURSOR_SIZE * 2]);
    expect(value).toContain("image-set(");
    expect(value).toContain("2x)");
    // The hotspot is quoted in CSS pixels whatever the bitmap's density.
    expect(value).toContain(`${HOTSPOT} ${HOTSPOT},`);
  });

  it("keeps the plain url when the browser has no image-set", () => {
    stubRatio(2, false);
    const sizes: number[] = [];
    stubCanvas("data:image/png;base64,CCCC", sizes);

    const value = rotateCursorValue();

    expect(value).not.toContain("image-set(");
    expect(sizes).toEqual([ROTATE_CURSOR_SIZE * 2, ROTATE_CURSOR_SIZE]);
  });
});
