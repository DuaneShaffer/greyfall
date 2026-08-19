// The portrait intake battery, twice over.
//
// The battery itself is pinned against a figure this file paints: a rect bust —
// head block over neck over shoulders, on the Works ground — placed so the
// framing table's numbers come out right (crown y=100, chin y=385, eye-line
// y=243, head centre x=255.5, shoulders reaching the frame sides at y=500), so
// that a clean fixture passes every check and one deliberate defect at a time
// makes exactly the check that owns it fail.
//
// A fixture cannot keep the battery honest on its own — every check the first
// cut of this file got wrong passed against a rect. So the second half pins the
// numbers the tool reads off `art-src/portraits/rowen.png`, the first merged
// plate, against the hand audit that approved it. Those are the measurements a
// future edit to the tool must not drift.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PALETTE, hexToRgb, type Hex } from "../../src/art/palette.js";
import { decodePNG, type RGBAImage } from "../../src/art/png.js";
import {
  CHIP_RECT_MASTER,
  GROUND_REGISTERS,
  PORTRAIT_MASTER,
  auditPortrait,
  chipOverflow,
  countColor,
  countOverLuma,
  framingLandmarks,
  groundBands,
  luma,
  matteCoverage,
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
// The shoulders run off both frame sides, which is where the framing table
// reads them: "shoulders enter frame side".
const SHOULDERS: Rect = { x: -16, y: 500, w: 544, h: 140 };

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

/** The chin and the eye-line validation are read off the paint, not the matte. */
const landmarksOf = (options: FixtureOptions = {}): NonNullable<ReturnType<typeof framingLandmarks>> => {
  const marks = framingLandmarks(readMatte(matte(options)).mask, scanPortrait(plate(options)));
  if (marks === null) throw new Error("no figure in the fixture");
  return marks;
};

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
      "matte coverage",
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

  it("reads the framing landmarks off the matte and the paint", () => {
    expect(audit.landmarks).toEqual({
      crownRow: 100,
      chinRow: 385,
      neckRow: 385,
      neckWidth: 60,
      eyeLineRow: 243,
      eyeDarkRows: null,
      headCentreX: 255.5,
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

  it("fails matte coverage when the matte does not contain the painted figure", () => {
    const wrong = auditOf({ matte: matte({ dx: 0, dy: 60 }) });
    expect(named(wrong, "matte coverage").ok).toBe(false);
    expect(named(auditOf(), "matte coverage").ok).toBe(true);
  });

  it("reports leak rather than failing a matte over ground-valued paint", () => {
    const coated = plate();
    fill(coated, { x: 226, y: 500, w: 60, h: 60 }, GROUND_REGISTERS.works.lower);
    const cover = matteCoverage(coated, readMatte(matte()).mask, GROUND_REGISTERS.works);
    expect(cover.coverage).toBe(1);
    expect(cover.flat).toBe(3600);
    expect(named(auditOf({ plate: coated }), "matte coverage").ok).toBe(true);
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
    fill(blown, { x: 220, y: 200, w: 10, h: 10 }, "#e9dcc0");
    const audit = auditOf({ plate: blown });
    expect(named(audit, "luma ceiling").ok).toBe(false);
    expect(named(audit, "luma ceiling").detail).toContain("100 px over luma 201");
    expect(named(audit, "ramp conformance").ok).toBe(true);
    expect(named(auditOf(), "luma ceiling").ok).toBe(true);
  });

  it("puts the ceiling on Rec.709 weights, where bone-100 is the top step", () => {
    expect(luma(...hexToRgb(PALETTE["bone-100"]))).toBeLessThan(201);
    expect(luma(...hexToRgb(PALETTE["soot-100"]))).toBeCloseTo(186.7, 1);
    const capped = plate();
    fill(capped, { x: 220, y: 200, w: 10, h: 10 }, PALETTE["bone-100"]);
    expect(countOverLuma(scanPortrait(capped), 201)).toBe(0);
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

  it("counts head mass the chip rect cannot see, sideways and up but never down", () => {
    const marks = landmarksOf();
    const clean = chipOverflow(readMatte(matte()).mask, marks);
    expect([clean.left.pixels, clean.right.pixels, clean.above.pixels]).toEqual([0, 0, 0]);
    expect(clean.seen).toBe(1);
    expect(clean.fill).toBeGreaterThan(0.5);
    expect(clean).not.toHaveProperty("below");
    // The chin is below the crop by the framing table's own design, and the
    // head band the chip is graded on stops at the crop's bottom.
    expect(marks.chinRow).toBeGreaterThan(CHIP_RECT_MASTER.y + CHIP_RECT_MASTER.h);
    expect(clean.headBand).toBe(180 * (CHIP_RECT_MASTER.y + CHIP_RECT_MASTER.h - 100));

    const offCentre = readMatte(matte({ dx: -80 })).mask;
    const offMarks = landmarksOf({ dx: -80 });
    const spilled = chipOverflow(offCentre, offMarks);
    expect(spilled.left.pixels).toBeGreaterThan(0);
    expect(spilled.left.depth).toBe(42);
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
    expect(landmarksOf().chinRow).toBeGreaterThan(320);
  });

  it("derives the same silhouette from the ground as the matte declares", () => {
    const agreement = paintedSilhouette(plate(), GROUND_REGISTERS.works);
    expect(agreement.bits).toEqual(readMatte(matte()).mask.bits);
  });
});

// ---------------------------------------------------------------------------
// The first merged plate
// ---------------------------------------------------------------------------

const portraitsAt = join(import.meta.dirname, "..", "..", "art-src", "portraits");
const plateOf = (name: string): RGBAImage => decodePNG(readFileSync(join(portraitsAt, name)));

describe("portrait intake — rowen, the plate that calibrated the battery", () => {
  const rowenPlate = plateOf("rowen.png");
  const rowenMatte = plateOf("rowen-matte.png");
  const audit = auditPortrait({
    portraitId: "rowen",
    plate: rowenPlate,
    matte: rowenMatte,
    palette: plateOf("rowen-palette.png"),
  });
  const mask = readMatte(rowenMatte).mask;
  const scan = scanPortrait(rowenPlate);

  it("ships — every check in the battery passes", () => {
    expect(audit.checks.filter((c) => !c.ok).map((c) => c.name)).toEqual([]);
    expect(audit.ok).toBe(true);
  });

  it("lands the framing landmarks the hand audit measured", () => {
    // Audit: crown 90, eye-line 243.5 (§4's 38% = 243.2), chin ~386 on the jaw
    // contour, head centre 266.8, shoulders reaching the frame side at 504.
    const marks = audit.landmarks;
    expect(marks?.crownRow).toBe(90);
    expect(marks?.eyeLineRow).toBe(243);
    expect(marks?.chinRow).toBe(386);
    expect(marks?.headCentreX).toBeCloseTo(266.35, 1);
    expect(marks?.shoulderRow).toBe(504);
    // The chin is not the narrowest row and never was: that one is 4 px lower
    // and 178 px wide, which is the hair meeting the collar.
    expect(marks?.neckRow).toBe(390);
    expect(marks?.eyeDarkRows).toEqual([213, 249]);
  });

  it("grades the matte on coverage, not on a ground-derived silhouette", () => {
    const cover = matteCoverage(rowenPlate, mask, GROUND_REGISTERS.works);
    expect(cover.painted).toBe(68878);
    expect(cover.coverage).toBe(1);
    // 58% of the matte is coat painted at a ground value. Scoring the matte
    // against `paintedSilhouette` is what scored this delivery at 70.71%.
    expect(cover.flat).toBe(95991);
    expect(cover.leak).toBeCloseTo(0.5822, 4);
    expect(readMatte(rowenMatte).impure).toBe(0);
  });

  it("reads the ground as the two exact register values", () => {
    const ground = groundBands(rowenPlate, mask, GROUND_REGISTERS.works);
    expect(ground.upper.hex).toBe(GROUND_REGISTERS.works.upper);
    expect(ground.lower.hex).toBe(GROUND_REGISTERS.works.lower);
    expect(ground.upper.distance).toBe(0);
    expect(ground.lower.distance).toBe(0);
    expect(ground.strays).toBe(0);
  });

  it("puts one pixel over the luma ceiling and none on a lit edge", () => {
    expect(countOverLuma(scan, 201)).toBe(1);
    expect(luma(...hexToRgb("#e7c4a8"))).toBeCloseTo(201.42, 2);
    const rim = rimLight(rowenPlate, mask);
    expect(rim.edge).toBe(2184);
    expect(rim.bright).toBe(0);
  });

  it("spends none of the reserved colour it is not granted", () => {
    expect(countColor(scan, PALETTE["copper-500"])).toBe(0);
    expect(named(audit, "flux ramp").detail).toContain("0 px");
    expect(named(audit, "brightblood").detail).toContain("0 px");
  });

  it("fits the chip crop, counting only what the crop can lose", () => {
    const overflow = chipOverflow(mask, audit.landmarks as NonNullable<typeof audit.landmarks>);
    expect(overflow.fill).toBeCloseTo(0.7733, 4);
    expect(overflow.above.pixels).toBe(0);
    expect(overflow.right.rows).toBe(24);
    expect(overflow.seen).toBeGreaterThan(0.98);
  });
});
