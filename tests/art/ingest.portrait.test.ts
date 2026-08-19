// The portrait intake battery, run against a figure this file paints itself.
//
// No portrait has been delivered yet (`art-src/portraits/` is empty until the
// first master merges), so there is nothing to pin the way `tiles.test.ts` pins
// the terrain sheet. What can be pinned now is the *battery*: a synthetic bust
// built to the brief's own landmarks passes every check, and one deliberate
// defect at a time makes exactly the check that owns it fail.
//
// The fixture is a painted rect figure — a head block over a neck over
// shoulders, on the Works ground — placed so the framing table's numbers come
// out right: crown y=100, chin y=385, eye-line y=243, head centre x=256,
// shoulders entering at y=500.

import { describe, expect, it } from "vitest";
import { PALETTE, hexToRgb, type Hex } from "../../src/art/palette.js";
import type { RGBAImage } from "../../src/art/png.js";
import {
  CHIP_RECT_MASTER,
  GROUND_REGISTERS,
  PORTRAIT_MASTER,
  auditPortrait,
  chipOverflow,
  countColor,
  framingLandmarks,
  groundBands,
  paintedSilhouette,
  readMatte,
  rimLight,
  scanPortrait,
  type PortraitAudit,
  type PortraitCheck,
} from "../../tools/ingest-portrait.js";

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const HEAD: Rect = { x: 166, y: 100, w: 180, h: 285 };
const NECK: Rect = { x: 226, y: 385, w: 60, h: 115 };
const SHOULDERS: Rect = { x: 16, y: 500, w: 480, h: 140 };

const SKIN = PALETTE["bone-500"];
const COAT = PALETTE["umber-500"];

const blank = (width: number, height: number): RGBAImage => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
});

function fill(image: RGBAImage, rect: Rect, hex: Hex): void {
  const [r, g, b] = hexToRgb(hex);
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const at = (y * image.width + x) * 4;
      image.data[at] = r;
      image.data[at + 1] = g;
      image.data[at + 2] = b;
      image.data[at + 3] = 255;
    }
  }
}

const shifted = (rect: Rect, dx: number, dy: number): Rect => ({ ...rect, x: rect.x + dx, y: rect.y + dy });

interface FixtureOptions {
  readonly width?: number;
  readonly height?: number;
  readonly dx?: number;
  readonly dy?: number;
  readonly upper?: Hex;
  readonly lower?: Hex;
}

/** A bust on two flat ground values, at the framing table's landmarks. */
function plate(options: FixtureOptions = {}): RGBAImage {
  const width = options.width ?? PORTRAIT_MASTER.width;
  const height = options.height ?? PORTRAIT_MASTER.height;
  const dx = options.dx ?? 0;
  const dy = options.dy ?? 0;
  const image = blank(width, height);
  fill(image, { x: 0, y: 0, w: width, h: Math.floor(height / 2) }, options.upper ?? GROUND_REGISTERS.works.upper);
  fill(
    image,
    { x: 0, y: Math.floor(height / 2), w: width, h: height - Math.floor(height / 2) },
    options.lower ?? GROUND_REGISTERS.works.lower,
  );
  fill(image, shifted(HEAD, dx, dy), SKIN);
  fill(image, shifted(NECK, dx, dy), SKIN);
  fill(image, shifted(SHOULDERS, dx, dy), COAT);
  return image;
}

/** The same figure, solid white on solid black, hard-edged. */
function matte(options: FixtureOptions = {}): RGBAImage {
  const width = options.width ?? PORTRAIT_MASTER.width;
  const height = options.height ?? PORTRAIT_MASTER.height;
  const dx = options.dx ?? 0;
  const dy = options.dy ?? 0;
  const image = blank(width, height);
  fill(image, { x: 0, y: 0, w: width, h: height }, "#000000");
  for (const rect of [HEAD, NECK, SHOULDERS]) fill(image, shifted(rect, dx, dy), "#ffffff");
  return image;
}

/** A swatch strip: solid N x N squares of the colours the figure actually uses. */
function strip(extra?: Hex): RGBAImage {
  const swatches: Hex[] = [SKIN, COAT, GROUND_REGISTERS.works.upper, GROUND_REGISTERS.works.lower];
  if (extra !== undefined) swatches.push(extra);
  const image = blank(swatches.length * 32, 32);
  swatches.forEach((hex, i) => fill(image, { x: i * 32, y: 0, w: 32, h: 32 }, hex));
  return image;
}

const named = (audit: PortraitAudit, name: string): PortraitCheck => {
  const found = audit.checks.find((c) => c.name === name);
  if (found === undefined) throw new Error(`no check named ${name}: ${audit.checks.map((c) => c.name).join(", ")}`);
  return found;
};

const auditOf = (overrides: Partial<Parameters<typeof auditPortrait>[0]> = {}): PortraitAudit =>
  auditPortrait({ portraitId: "rowen", plate: plate(), matte: matte(), palette: strip(), ...overrides });

describe("portrait intake — the clean fixture", () => {
  const audit = auditOf();

  it("passes every check in the battery", () => {
    expect(audit.checks.filter((c) => !c.ok)).toEqual([]);
    expect(audit.ok).toBe(true);
  });

  it("prints the checks the log promises, in order", () => {
    expect(audit.checks.map((c) => c.name)).toEqual([
      "dimensions",
      "alpha",
      "matte purity",
      "matte agreement",
      "ramp conformance",
      "flux ramp",
      "brightblood",
      "copper-500",
      "rim light",
      "luma ceiling",
      "ground bands",
      "framing",
      "chip rect",
      "palette strip",
    ]);
  });

  it("reads the framing landmarks off the matte", () => {
    expect(audit.landmarks).toEqual({
      crownRow: 100,
      chinRow: 385,
      neckRow: 385,
      neckWidth: 60,
      eyeLineRow: 243,
      headCentreX: 256,
      headLeft: 166,
      headRight: 345,
      shoulderRow: 500,
    });
  });
});

describe("portrait intake — one defect at a time", () => {
  it("fails dimensions on anything but 512x640", () => {
    const small = auditPortrait({ portraitId: "rowen", plate: plate({ width: 256, height: 320 }) });
    expect(named(small, "dimensions").ok).toBe(false);
    expect(named(auditOf(), "dimensions").ok).toBe(true);
  });

  it("fails alpha on a single non-opaque pixel", () => {
    const holed = plate();
    holed.data[(300 * holed.width + 300) * 4 + 3] = 200;
    expect(named(auditOf({ plate: holed }), "alpha").ok).toBe(false);
    expect(named(auditOf({ plate: holed }), "alpha").detail).toContain("1 px below opaque");
  });

  it("fails matte purity on an anti-aliased matte pixel", () => {
    const soft = matte();
    fill(soft, { x: 200, y: 200, w: 1, h: 1 }, "#808080");
    expect(named(auditOf({ matte: soft }), "matte purity").ok).toBe(false);
    expect(named(auditOf({ matte: matte() }), "matte purity").ok).toBe(true);
  });

  it("fails matte agreement when the matte is not this figure", () => {
    const wrong = auditOf({ matte: matte({ dx: 0, dy: 60 }) });
    expect(named(wrong, "matte agreement").ok).toBe(false);
    expect(named(auditOf(), "matte agreement").ok).toBe(true);
  });

  it("fails ramp conformance on a hue with no ancestor in the palette", () => {
    const offModel = plate();
    fill(offModel, { x: 220, y: 200, w: 20, h: 20 }, "#ff00ff");
    const audit = auditOf({ plate: offModel });
    expect(named(audit, "ramp conformance").ok).toBe(false);
    expect(named(audit, "ramp conformance").detail).toContain(">48: 400");
  });

  it("bands the conformance histogram by distance from the nearest step", () => {
    const drifted = plate();
    fill(drifted, { x: 220, y: 200, w: 10, h: 10 }, "#8d7358");
    const histogram = named(auditOf({ plate: drifted }), "ramp conformance");
    expect(histogram.ok).toBe(true);
    expect(histogram.detail).toContain("<=8: 327680");
  });

  it("fails the flux ramp for a character the amber table grants none", () => {
    const warm = plate();
    fill(warm, { x: 220, y: 200, w: 10, h: 10 }, PALETTE["amber-500"]);
    expect(named(auditOf({ plate: warm }), "flux ramp").ok).toBe(false);
    expect(named(auditOf(), "flux ramp").detail).toContain("0 px");
    expect(named(auditPortrait({ portraitId: "vale", plate: warm, matte: matte() }), "flux ramp").ok).toBe(true);
  });

  it("fails brightblood both ways — spent unearned, and granted but missing", () => {
    const marked = plate();
    fill(marked, { x: 220, y: 200, w: 4, h: 4 }, PALETTE.brightblood);
    expect(named(auditOf({ plate: marked }), "brightblood").ok).toBe(false);
    expect(named(auditPortrait({ portraitId: "orin-vane", plate: plate() }), "brightblood").ok).toBe(false);
    expect(named(auditPortrait({ portraitId: "orin-vane", plate: marked }), "brightblood").ok).toBe(true);
  });

  it("counts the copper-500 the briefs name by hand", () => {
    const rimmed = plate();
    fill(rimmed, { x: 220, y: 200, w: 10, h: 10 }, PALETTE["copper-500"]);
    expect(countColor(scanPortrait(rimmed), PALETTE["copper-500"])).toBe(100);
    expect(countColor(scanPortrait(plate()), PALETTE["copper-500"])).toBe(0);
    expect(named(auditOf({ plate: rimmed }), "copper-500").detail).toContain("100 px");
  });

  it("fails rim light when the silhouette edge is lit", () => {
    const lit = plate();
    for (const rect of [HEAD, NECK, SHOULDERS]) {
      fill(lit, { x: rect.x, y: rect.y, w: rect.w, h: 1 }, PALETTE["soot-100"]);
      fill(lit, { x: rect.x, y: rect.y, w: 1, h: rect.h }, PALETTE["soot-100"]);
      fill(lit, { x: rect.x + rect.w - 1, y: rect.y, w: 1, h: rect.h }, PALETTE["soot-100"]);
    }
    const audit = auditOf({ plate: lit });
    expect(named(audit, "rim light").ok).toBe(false);
    expect(rimLight(lit, readMatte(matte()).mask).lit).toBeGreaterThan(170);
    expect(rimLight(plate(), readMatte(matte()).mask).lit).toBe(0);
  });

  it("fails the luma ceiling above bone-100", () => {
    const blown = plate();
    fill(blown, { x: 220, y: 200, w: 10, h: 10 }, PALETTE["bone-100"]);
    const audit = auditOf({ plate: blown });
    expect(named(audit, "luma ceiling").ok).toBe(false);
    expect(named(audit, "luma ceiling").detail).toContain("100 px over luma 201");
    expect(named(audit, "ramp conformance").ok).toBe(true);
    expect(named(auditOf(), "luma ceiling").ok).toBe(true);
  });

  it("measures the ground bands against the character's own register", () => {
    const image = plate();
    const mask = readMatte(matte()).mask;
    const works = groundBands(image, mask, GROUND_REGISTERS.works);
    expect(works.upper.hex).toBe(GROUND_REGISTERS.works.upper);
    expect(works.lower.hex).toBe(GROUND_REGISTERS.works.lower);
    expect(works.upper.distance).toBe(0);
    expect(works.lower.distance).toBe(0);

    const rise = groundBands(image, mask, GROUND_REGISTERS.rise);
    expect(rise.upper.distance).toBeGreaterThan(24);
    expect(named(auditOf(), "ground bands").ok).toBe(true);
    expect(named(auditPortrait({ portraitId: "aldric", plate: image, matte: matte() }), "ground bands").ok).toBe(false);
  });

  it("fails framing when the head sits low", () => {
    const low = auditPortrait({ portraitId: "rowen", plate: plate({ dy: 40 }), matte: matte({ dy: 40 }) });
    expect(named(low, "framing").ok).toBe(false);
    expect(low.landmarks?.crownRow).toBe(140);
    expect(named(auditOf(), "framing").ok).toBe(true);
  });

  it("counts head mass the chip rect cannot see", () => {
    const mask = readMatte(matte()).mask;
    const marks = framingLandmarks(mask);
    expect(marks).not.toBeNull();
    const clean = chipOverflow(mask, marks as NonNullable<typeof marks>);
    expect([clean.left, clean.right]).toEqual([0, 0]);
    expect(clean.below).toBeGreaterThan(0);
    expect(clean.fill).toBeGreaterThan(0.5);

    const offCentre = readMatte(matte({ dx: -80 })).mask;
    const offMarks = framingLandmarks(offCentre);
    const spilled = chipOverflow(offCentre, offMarks as NonNullable<typeof offMarks>);
    expect(spilled.left).toBeGreaterThan(0);
    expect(named(auditOf(), "chip rect").ok).toBe(true);
    expect(
      named(
        auditPortrait({ portraitId: "rowen", plate: plate({ dx: -80 }), matte: matte({ dx: -80 }) }),
        "chip rect",
      ).ok,
    ).toBe(false);
  });

  it("fails the palette strip on a swatch off the ramps", () => {
    expect(named(auditOf({ palette: strip("#ff00ff") }), "palette strip").ok).toBe(false);
    expect(named(auditOf(), "palette strip").ok).toBe(true);
  });

  it("skips the matte and strip checks when neither is delivered", () => {
    const alone = auditPortrait({ portraitId: "rowen", plate: plate() });
    expect(alone.checks.map((c) => c.name)).not.toContain("matte purity");
    expect(alone.checks.map((c) => c.name)).not.toContain("palette strip");
    expect(alone.ok).toBe(true);
  });
});

describe("portrait intake — the chip rect is §4's, not this file's", () => {
  it("is (128, 64, 256, 256) in master terms", () => {
    expect(CHIP_RECT_MASTER).toEqual({ x: 128, y: 64, w: 256, h: 256 });
  });

  it("bottoms a clear margin above the chin the framing table fixes", () => {
    expect(CHIP_RECT_MASTER.y + CHIP_RECT_MASTER.h).toBe(320);
    expect(framingLandmarks(readMatte(matte()).mask)?.chinRow).toBeGreaterThan(320);
  });

  it("derives the same silhouette from the ground as the matte declares", () => {
    const agreement = paintedSilhouette(plate(), GROUND_REGISTERS.works);
    expect(agreement.bits).toEqual(readMatte(matte()).mask.bits);
  });
});
