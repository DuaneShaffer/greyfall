// Shared rig for the map-object intake tests (ART_DIRECTION §6, D.6,
// `art-src/OBJECT_BRIEFS.md`).
//
// The declaration is here and the measurement is in the test files: every sheet
// pins its own size, its own opaque runs, its own swatch row and its own cell
// coverage, and then the same generic sweep is run over all of them. That is the
// `facing.test.ts` shape — declare what the delivery is, then hold the art to it —
// and it is what makes a sheet swap show up as a failed pin rather than as a
// silently different painting.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { quantizeGrid, resampleRGBA, type RGBASource } from "../../src/art/ingest.js";
import * as MASTERS from "../../src/art/masters/objects.js";
import type { Hex } from "../../src/art/palette.js";
import { decodePNG } from "../../src/art/png.js";
import type { PixelGrid } from "../../src/art/pixel.js";
import {
  MAX_OBJECT_COLORS,
  auditObjectFace,
  faceInState,
  objectCellSpec,
  type ObjectFaceAudit,
  type ObjectFaceId,
  type ObjectFaceState,
  type ObjectFaceSpec,
  type ObjectSpriteId,
} from "../../src/art/objects.js";
import {
  OBJECT_SHEETS,
  cutObjectSheet,
  findObjectSheetContent,
  type ObjectCellCheck,
  type ObjectSheet,
} from "../../src/art/objectIntake.js";
import { objectFaceGrid } from "../../src/art/objectset.js";

export interface CellPin {
  readonly face: ObjectFaceId;
  readonly state?: ObjectFaceState;
  /** Opaque pixels in the delivered 4x cell. Below the rect's area on an open frame. */
  readonly opaque: number;
}

export interface SheetPin {
  /** File name under `art-src/`. */
  readonly file: string;
  readonly columns: readonly { from: number; to: number }[];
  readonly rows: readonly { from: number; to: number }[];
  /** Opaque pixels in neither a cell nor the swatch row: the corner guides. */
  readonly guides: number;
  readonly swatches: readonly Hex[];
  /** Swatched colours no cell on the sheet spends. Reported, never repaired. */
  readonly swatchedUnused: readonly Hex[];
  readonly cells: readonly CellPin[];
}

export const sheetFor = (file: string): ObjectSheet => {
  const found = OBJECT_SHEETS.find((sheet) => sheet.source === `art-src/${file}`);
  if (found === undefined) throw new Error(`no declared sheet for art-src/${file}`);
  return found;
};

export const decode = (file: string): RGBASource =>
  decodePNG(readFileSync(resolve(import.meta.dirname, "../../art-src", file)));

export const cutOf = (file: string) => {
  const sheet = sheetFor(file);
  return cutObjectSheet(decode(file), sheet.cells, sheet.strip);
};

export const specOf = (
  sprite: ObjectSpriteId,
  face: ObjectFaceId,
  state: ObjectFaceState = "powered",
): ObjectFaceSpec => objectCellSpec(sprite, face, state) as ObjectFaceSpec;

/** The shipped path, start to finish, exactly as `tools/ingest-objects.ts` runs it. */
export const ingest = (image: RGBASource, spec: ObjectFaceSpec): PixelGrid =>
  quantizeGrid(resampleRGBA(image, spec.width, spec.height), {
    allowed: spec.allowed,
    alphaThreshold: 127,
  }).grid;

export const base64 = (grid: PixelGrid): string => Buffer.from(grid.data).toString("base64");

export const auditOf = (
  sprite: ObjectSpriteId,
  face: ObjectFaceId,
  state: ObjectFaceState = "powered",
): ObjectFaceAudit => auditObjectFace(objectFaceGrid(sprite, face, state), sprite, specOf(sprite, face, state));

/**
 * Everything true of every delivered sheet, measured against that sheet's own
 * declaration: the cut is reproducible, the committed grid is what the tool
 * produces, and the delivery is palette-exact with nothing ambiguous.
 */
export function registerObjectSheetSuite(pin: SheetPin): void {
  const sheet = sheetFor(pin.file);
  const source = decode(pin.file);
  const cut = cutOf(pin.file);
  const cellFor = (cellPin: CellPin): ObjectCellCheck => {
    const state = cellPin.state ?? "powered";
    const found = cut.cells.find((cell) => cell.face === cellPin.face && cell.state === state);
    if (found === undefined) throw new Error(`${pin.file}: no cut cell for ${cellPin.face}:${state}`);
    return found;
  };

  describe(`${pin.file} — cell location`, () => {
    it("reads the delivered sheet at its declared size", () => {
      expect([source.width, source.height]).toEqual([sheet.width, sheet.height]);
    });

    it("finds the sheet's content runs without being told where the cells are", () => {
      const content = findObjectSheetContent(source);
      expect(content.columns).toEqual(pin.columns);
      expect(content.rows).toEqual(pin.rows);
    });

    it("declares every cell at exactly the size the brief delivers", () => {
      // `cutObjectSheet` throws on any other size, so reaching here is the check;
      // this states the count the brief asks for so a dropped cell is visible.
      expect(cut.cells).toHaveLength(pin.cells.length);
      expect(cut.cells.map((cell) => `${cell.face}:${cell.state}`)).toEqual(
        pin.cells.map((cell) => `${cell.face}:${cell.state ?? "powered"}`),
      );
    });

    it("fences every cell with transparency and fills every cell's rect flush", () => {
      for (const cell of cut.cells) {
        const label = `${cell.face}:${cell.state}`;
        expect(cell.fence, label).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
        expect(cell.fenceOk, label).toBe(true);
        // The bounding box is the rect. Coverage inside it is the next check, and
        // it is a different question: an open frame's silhouette is a hole.
        expect(cell.fillsRect, label).toBe(true);
        // Alpha is binary on the whole delivery: no soft edge to resolve by guess.
        expect(cell.partialAlpha, label).toBe(0);
      }
    });

    it("pins how much of each rect the painting actually covers", () => {
      for (const cellPin of pin.cells) {
        const cell = cellFor(cellPin);
        expect(cell.opaquePixels, `${cellPin.face}:${cellPin.state ?? "powered"}`).toBe(cellPin.opaque);
        expect(cell.opaquePixels).toBeLessThanOrEqual(cell.rect.w * cell.rect.h);
      }
    });

    it("accounts for every opaque pixel: the cells, the swatch row, and the corner guides", () => {
      expect(cut.unaccountedOpaque).toBe(pin.guides);
    });

    it("reads the swatch row, and pins which of its colours the cells spend", () => {
      expect(cut.swatches).toEqual(pin.swatches);
      const used = new Set(
        cut.cells.flatMap((cell) => {
          const spec = specOf(cell.sprite, cell.face, cell.state);
          return auditObjectFace(ingest(cell.image, spec), cell.sprite, spec).colors;
        }),
      );
      // Nothing may be painted that the artist did not swatch; a swatch the art
      // never spends is reported, not repaired (C.8.2).
      expect([...used].filter((hex) => !pin.swatches.includes(hex))).toEqual([]);
      expect(pin.swatches.filter((hex) => !used.has(hex))).toEqual(pin.swatchedUnused);
    });

    it("declares the swatch row as reference, outside every cell", () => {
      const strip = sheet.strip.rect;
      for (const cell of sheet.cells) {
        const overlaps =
          strip.x < cell.rect.x + cell.rect.w &&
          cell.rect.x < strip.x + strip.w &&
          strip.y < cell.rect.y + cell.rect.h &&
          cell.rect.y < strip.y + strip.h;
        expect(overlaps, cell.face).toBe(false);
      }
    });

    it("cuts the same pixels twice", () => {
      const again = cutOf(pin.file);
      for (let i = 0; i < cut.cells.length; i += 1) {
        const one = cut.cells[i] as ObjectCellCheck;
        const two = again.cells[i] as ObjectCellCheck;
        expect([...one.image.data], `${one.face}:${one.state}`).toEqual([...two.image.data]);
      }
    });
  });

  describe(`${pin.file} — intake determinism`, () => {
    it("reduces 4:1 with nothing to quantize and nothing ambiguous", () => {
      // The bar C.8.2 sets and this whole set meets literally: the art is already
      // palette-exact at 4x, so the box filter is lossless and the `ambiguous`
      // list is empty rather than merely small.
      for (const cell of cut.cells) {
        const spec = specOf(cell.sprite, cell.face, cell.state);
        const shipped = resampleRGBA(cell.image, spec.width, spec.height);
        const { stats } = quantizeGrid(shipped, { allowed: spec.allowed, alphaThreshold: 127 });
        const label = `${cell.face}:${cell.state}`;
        expect(stats.movedCount, label).toBe(0);
        expect(stats.ambiguous, label).toEqual([]);
        // Coverage survives the reduction exactly: the delivery's alpha lands on
        // the 4px game grid, so no interior hole is half a pixel wide.
        expect(stats.opaqueCount * 16, label).toBe(cell.opaquePixels);
      }
    });

    it("reproduces every stored grid byte for byte from the delivered PNG", () => {
      for (const cell of cut.cells) {
        const spec = specOf(cell.sprite, cell.face, cell.state);
        if (spec.derivable) continue;
        const label = `${cell.sprite}/${cell.face}:${cell.state}`;
        expect(base64(ingest(cell.image, spec)), label).toBe(
          base64(objectFaceGrid(cell.sprite, cell.face, cell.state)),
        );
      }
    });

    it("hands a delivered state the engine already computes back as the substitution", () => {
      for (const cell of cut.cells) {
        const spec = specOf(cell.sprite, cell.face, cell.state);
        if (!spec.derivable) continue;
        const label = `${cell.sprite}/${cell.face}:${cell.state}`;
        // The delivery is a proof, not data: the artist drew the state and the
        // engine derives it, and the two must be the same pixels or one of them
        // has moved.
        expect(base64(ingest(cell.image, spec)), label).toBe(
          base64(faceInState(objectFaceGrid(cell.sprite, spec.paintedAs), cell.state)),
        );
        expect(Object.keys(MASTERS)).not.toContain(
          `${cell.sprite.replace(/-/g, "_")}_${cell.face}_${cell.state}_BASE64`.toUpperCase(),
        );
      }
    });

    it("conforms on every cell, inside the colour ceiling, with nothing off the ramp", () => {
      for (const cell of cut.cells) {
        const spec = specOf(cell.sprite, cell.face, cell.state);
        const audit = auditObjectFace(ingest(cell.image, spec), cell.sprite, spec);
        const label = `${cell.face}:${cell.state}`;
        expect(audit.ok, `${label}: ${audit.errors.join("; ")}`).toBe(true);
        expect(audit.colorCount, label).toBeLessThanOrEqual(MAX_OBJECT_COLORS);
        expect(audit.outsideRampPixels, label).toBe(0);
        expect(audit.reservedPixels, label).toBe(0);
        expect(audit.copper300Pixels, label).toBe(0);
        expect(audit.amberShare, label).toBeLessThanOrEqual(spec.amberShare);
      }
    });
  });
}
