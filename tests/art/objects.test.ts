// Wave 1 map-object intake, the rules that hold across the whole set
// (ART_DIRECTION §6, D.6, `art-src/OBJECT_BRIEFS.md`).
//
// Four things, three of which `tiles.test.ts` locks down for the ground:
//
//  1. **One ruler.** Every face's shipped size is derived from a footprint and a
//     height at 32 texels per world unit, and the brief's own table of sizes is
//     stated here independently of the derivation that must produce it.
//  2. **The set's binding rules are structural.** The `copper-500` affordance, the
//     carrier that runs a face's full extent, the `copper-300` reservation: §6
//     makes them binding and a human cannot count them by eye, so they are held on
//     the spec table as well as on the pixels.
//  3. **The cut is reproducible and the committed grids are what the tool
//     produces.** Per sheet, in `objectsSuite.ts`, run from the three
//     `objects.<name>.test.ts` files.
//  4. **The state substitution is a substitution.** §6's unpowered row is the
//     powered painting with the light taken out and *nothing else moved*, which is
//     the whole reason the player learns that the seam is the power indicator. A
//     test can hold that exactly: every non-amber pixel must be untouched and
//     every amber pixel must have changed.

import { describe, expect, it } from "vitest";
import * as MASTERS from "../../src/art/masters/objects.js";
import { PALETTE, RAMPS } from "../../src/art/palette.js";
import { cloneGrid, gridGet, gridSet, paletteIndex, type PixelGrid } from "../../src/art/pixel.js";
import {
  BOX_FACE_IDS,
  MAX_OBJECT_COLORS,
  OBJECT_AMBER_SHARE,
  OBJECT_ART,
  OBJECT_ART_IDS,
  OBJECT_FACE_IDS,
  OBJECT_FACE_STATES,
  OBJECT_POWER_STATES,
  OBJECT_TEXELS_PER_UNIT,
  auditObjectFace,
  faceInState,
  objectArtFor,
  objectCellSpec,
  objectFaceIds,
  type ObjectFaceId,
  type ObjectFaceSpec,
} from "../../src/art/objects.js";
import { OBJECT_SHEETS } from "../../src/art/objectIntake.js";
import { objectCarrierGrid, objectFaceGrid, objectFaceLevels } from "../../src/art/objectset.js";
import { HEIGHT_STEP_PX, TILE_TEXTURE_SIZE } from "../../src/art/sprites.js";
import { specOf } from "./objectsSuite.js";

const spec = OBJECT_ART["flux-main"];

describe("the object set's one ruler", () => {
  it("spends the same texels per world unit as the ground plane", () => {
    expect(OBJECT_TEXELS_PER_UNIT).toBe(TILE_TEXTURE_SIZE);
    // A height step is half a world unit, so its texel count doubles to the same.
    expect(HEIGHT_STEP_PX * 2).toBe(OBJECT_TEXELS_PER_UNIT);
  });

  it("lands every delivered object on its brief's own table of face sizes", () => {
    // OBJECT_BRIEFS §1: a main is 1 x 2 tiles standing 1.5 units, A 64 x 48,
    // B 32 x 48, C 32 x 64. §2: a trough is one tile of run standing 0.25, A run
    // top 32 x 32, B end-cap top 32 x 32, C lip 32 x 8. §3: a hoist is 1 x 2 tiles
    // standing 1.75, A 64 x 56, B 32 x 56, C 32 x 64. The specs derive these from
    // the massing; this is the independent statement of what they must derive.
    const table: Record<string, readonly [number, number, number, Record<string, readonly [number, number]>]> = {
      "flux-main": [2, 1, 1.5, { long: [64, 48], end: [32, 48], top: [32, 64] }],
      "cable-trough": [1, 1, 0.25, { long: [32, 8], end: [32, 8], top: [32, 32], cap: [32, 32] }],
      "charge-hoist": [2, 1, 1.75, { long: [64, 56], end: [32, 56], top: [32, 64] }],
    };
    for (const id of OBJECT_ART_IDS) {
      const art = OBJECT_ART[id];
      const [along, across, heightUnits, faces] = table[id] as (typeof table)[string];
      expect([art.along, art.across, art.heightUnits], id).toEqual([along, across, heightUnits]);
      expect(objectFaceIds(art), id).toEqual(Object.keys(faces).sort(
        (a, b) => OBJECT_FACE_IDS.indexOf(a as ObjectFaceId) - OBJECT_FACE_IDS.indexOf(b as ObjectFaceId),
      ));
      for (const [face, size] of Object.entries(faces)) {
        const faceSpec = specOf(id, face as ObjectFaceId);
        expect([faceSpec.width, faceSpec.height], `${id}/${face}`).toEqual(size);
      }
    }
  });

  it("sizes every face off its object's own footprint and height", () => {
    for (const id of OBJECT_ART_IDS) {
      const art = OBJECT_ART[id];
      const px = OBJECT_TEXELS_PER_UNIT;
      // `cap` is a second top and sizes like one; that is what makes it a top.
      const expected: Record<ObjectFaceId, readonly [number, number]> = {
        long: [art.along * px, art.heightUnits * px],
        end: [art.across * px, art.heightUnits * px],
        top: [art.across * px, art.along * px],
        cap: [art.across * px, art.along * px],
      };
      for (const face of objectFaceIds(art)) {
        const faceSpec = specOf(id, face);
        expect([faceSpec.width, faceSpec.height], `${id}/${face}`).toEqual(expected[face]);
      }
    }
  });

  it("wears every face the box has slots for, so no material slot goes undressed", () => {
    // `render/objectTextures.ts` dresses six slots from three faces and asks for
    // them by name. An object registered without one would throw at build time,
    // which is why this is a structural check and not a rendering one.
    for (const id of OBJECT_ART_IDS) {
      for (const face of BOX_FACE_IDS) {
        expect(OBJECT_ART[id].faces[face], `${id}/${face}`).toBeDefined();
      }
    }
  });

  it("points a face with no painting of its own at the one cell that answers it", () => {
    // One delivery, one master. A trough's ends are its lip because the tray wall
    // is banded and uniform along its length (§2); everything else is its own.
    for (const id of OBJECT_ART_IDS) {
      for (const face of objectFaceIds(OBJECT_ART[id])) {
        const faceSpec = specOf(id, face);
        const target = specOf(id, faceSpec.paintedAs);
        expect([target.width, target.height], `${id}/${face}`).toEqual([faceSpec.width, faceSpec.height]);
      }
    }
    expect(specOf("cable-trough", "end").paintedAs).toBe("long");
    for (const [id, face] of [
      ["flux-main", "long"],
      ["flux-main", "end"],
      ["flux-main", "top"],
      ["cable-trough", "long"],
      ["cable-trough", "top"],
      ["cable-trough", "cap"],
      ["charge-hoist", "long"],
      ["charge-hoist", "end"],
      ["charge-hoist", "top"],
    ] as const) {
      expect(specOf(id, face).paintedAs, `${id}/${face}`).toBe(face);
    }
  });

  it("shows the copper-500 affordance on every operable object and on nothing else", () => {
    // §6 binds the object, not the face: one lever standing at the corner of a
    // frame is visible from both faces that meet there, which is the hoist.
    for (const id of OBJECT_ART_IDS) {
      const art = OBJECT_ART[id];
      const controls = objectFaceIds(art).filter((face) => specOf(id, face).control);
      if (art.operable) expect(controls.length, `${id} control faces`).toBeGreaterThanOrEqual(1);
      else expect(controls, `${id} control faces`).toEqual([]);
    }
    expect(objectFaceIds(spec).filter((f) => specOf("flux-main", f).control)).toEqual(["long"]);
    expect(objectFaceIds(OBJECT_ART["charge-hoist"]).filter((f) => specOf("charge-hoist", f).control)).toEqual([
      "long",
      "end",
    ]);
    expect(OBJECT_ART["cable-trough"].operable).toBe(false);
  });

  it("gives the full-extent carrier to at most one face per object", () => {
    // A main's is vertical up its long side; a trough's is the filament along its
    // run top. No third object in the set may be given either (§1, §2).
    const carriers = OBJECT_ART_IDS.map((id) => [
      id,
      objectFaceIds(OBJECT_ART[id]).filter((face) => specOf(id, face).amberColumn),
    ]);
    expect(carriers).toEqual([
      ["flux-main", ["long"]],
      ["cable-trough", ["top"]],
      ["charge-hoist", []],
    ]);
  });

  it("names the job on the bus each sheet was drawn for", () => {
    // `spriteId` is the map author's word and the renderer reads it, so the art
    // has to say which job it was drawn to announce or the word stops meaning
    // anything (`tests/content.test.ts` holds the maps to this).
    expect(OBJECT_ART_IDS.map((id) => [id, OBJECT_ART[id].role, OBJECT_ART[id].tilesAlongRun])).toEqual([
      ["flux-main", "source", false],
      ["cable-trough", "line", true],
      ["charge-hoist", "sink", false],
    ]);
    // Only a run tiles, and a run is the only object whose registered `along` is a
    // tiling unit rather than the footprint the map gives it.
    for (const id of OBJECT_ART_IDS) {
      if (!OBJECT_ART[id].tilesAlongRun) continue;
      expect(OBJECT_ART[id].along, id).toBe(1);
    }
  });

  it("keeps the amber ceiling at the set's 4% except where a brief cuts it", () => {
    for (const id of OBJECT_ART_IDS) {
      for (const face of objectFaceIds(OBJECT_ART[id])) {
        const ceiling = specOf(id, face).amberShare;
        expect(ceiling, `${id}/${face}`).toBeLessThanOrEqual(OBJECT_AMBER_SHARE);
        // §3: a sink consumes and does not supply, so a hoist gets a quarter of it.
        expect(ceiling, `${id}/${face}`).toBe(id === "charge-hoist" ? 0.01 : OBJECT_AMBER_SHARE);
      }
    }
  });

  it("declares a state painting only where a substitution cannot reach it", () => {
    const declared = OBJECT_ART_IDS.flatMap((id) =>
      OBJECT_FACE_STATES.flatMap((state) =>
        Object.keys(OBJECT_ART[id].stateFaces[state] ?? {}).map(
          (face) => `${id}/${face}:${state}${(objectCellSpec(id, face as ObjectFaceId, state) as ObjectFaceSpec).derivable ? " (derivable)" : ""}`,
        ),
      ),
    );
    // §4 is a state of §2 and not a fourth object, and it arrived as two cells:
    // the break, which no colour swap can produce, and the dead run, which the
    // engine already produces exactly.
    expect(declared).toEqual([
      "cable-trough/top:unpowered (derivable)",
      "cable-trough/top:severed",
    ]);
  });

  it("keeps every state painting dark: a cut span and a dead run carry nothing", () => {
    for (const id of OBJECT_ART_IDS) {
      for (const state of OBJECT_FACE_STATES) {
        for (const face of Object.keys(OBJECT_ART[id].stateFaces[state] ?? {}) as ObjectFaceId[]) {
          const faceSpec = objectCellSpec(id, face, state) as ObjectFaceSpec;
          expect(faceSpec.amber, `${id}/${face}:${state}`).toBe(false);
          expect(faceSpec.amberColumn, `${id}/${face}:${state}`).toBe(false);
          expect(faceSpec.control, `${id}/${face}:${state}`).toBe(false);
        }
      }
    }
  });

  it("answers only spriteIds with delivered art", () => {
    for (const id of OBJECT_ART_IDS) expect(objectArtFor(id), id).toBe(OBJECT_ART[id]);
    // Wave 2, named and not yet commissioned; and the primitive `charge-hoist`
    // still shares with a press, which is `data/maps` and not this file's to fix.
    for (const unpainted of [
      "switch-board",
      "switch-lever",
      "gantry-grate",
      "hydraulic-press",
      "flux-cell",
      "freight-lift",
      "severed-span",
    ]) {
      expect(objectArtFor(unpainted), unpainted).toBeNull();
    }
  });

  it("has a stored constant for every stored cell and no others", () => {
    const stored = OBJECT_SHEETS.flatMap((sheet) =>
      sheet.cells
        .filter((cell) => !(objectCellSpec(cell.sprite, cell.face, cell.state) as ObjectFaceSpec).derivable)
        .map((cell) =>
          [cell.sprite.replace(/-/g, "_"), cell.face, cell.state ?? null, "base64"]
            .filter((part) => part !== null)
            .join("_")
            .toUpperCase(),
        ),
    );
    expect(Object.keys(MASTERS).sort()).toEqual([...stored].sort());
  });
});

describe("§6's states on a painted face", () => {
  const AMBER = new Set(RAMPS.amber.map((hex) => paletteIndex(hex)));

  it("leaves the powered painting exactly as delivered", () => {
    for (const face of objectFaceIds(spec)) {
      const grid = objectFaceGrid("flux-main", face);
      expect(faceInState(grid, "powered")).toBe(grid);
    }
  });

  it("moves the amber ramp and nothing else, in every state", () => {
    for (const state of OBJECT_POWER_STATES) {
      if (state === "powered") continue;
      const powered = objectFaceGrid("flux-main", "long");
      const other = objectFaceGrid("flux-main", "long", state);
      expect([other.width, other.height]).toEqual([powered.width, powered.height]);
      let changed = 0;
      for (let i = 0; i < powered.data.length; i += 1) {
        const from = powered.data[i] as number;
        const to = other.data[i] as number;
        if (AMBER.has(from)) {
          expect(to, `${state} at ${i}`).not.toBe(from);
          changed += 1;
        } else {
          expect(to, `${state} at ${i}`).toBe(from);
        }
      }
      expect(changed, state).toBe(96);
    }
  });

  it("reads a severed face as the unpowered one wherever no break was painted", () => {
    // §6 separates severed from destroyed by *geometry*, and the colour half of
    // the severed row is the unpowered row exactly. So an object with no delivered
    // break still answers in the state rather than throwing or blazing.
    for (const face of objectFaceIds(spec)) {
      expect(base64Of(objectFaceGrid("flux-main", face, "severed"))).toBe(
        base64Of(objectFaceGrid("flux-main", face, "unpowered")),
      );
      expect(objectCarrierGrid("flux-main", face, "severed")).toBeNull();
    }
  });

  it("takes every amber pixel out of an unpowered main — identical shapes, dead", () => {
    const audit = auditObjectFace(objectFaceGrid("flux-main", "long", "unpowered"), "flux-main", {
      ...specOf("flux-main", "long"),
      amber: false,
      amberColumn: false,
    });
    expect(audit.amberPixels).toBe(0);
    expect(audit.colors).toContain(PALETTE["soot-700"]);
    // The handle is not a power indicator and does not go out with the light.
    expect(audit.control.pixels).toBe(26);
  });

  it("carries a bloom-eligible halo only where §6 gives the state one", () => {
    const glow = paletteIndex(PALETTE["amber-glow"]);
    const overloadCore = paletteIndex(PALETTE["overload-100"]);
    const countOf = (state: (typeof OBJECT_FACE_STATES)[number], index: number): number => {
      const grid = objectFaceGrid("flux-main", "long", state);
      let n = 0;
      for (let i = 0; i < grid.data.length; i += 1) if (grid.data[i] === index) n += 1;
      return n;
    };
    expect(countOf("powered", glow)).toBe(3);
    expect(countOf("unpowered", glow)).toBe(0);
    expect(countOf("destroyed", glow)).toBe(0);
    expect(countOf("overloading", glow)).toBe(0);
    expect(countOf("severed", glow)).toBe(0);
    // Overload moves the readout to its own ramp rather than putting it out.
    expect(countOf("overloading", overloadCore)).toBe(12);
  });

  it("lights the seam, its core and its halo, and leaves the recess a shadow", () => {
    // The half of §6 a diffuse texture cannot say: on a painted face the carrier
    // has to be its own light source or it is an ochre stripe at 62% shade.
    const powered = objectFaceGrid("flux-main", "long");
    const mask = objectCarrierGrid("flux-main", "long", "powered") as PixelGrid;
    const recess = paletteIndex(PALETTE["amber-700"]);
    let lit = 0;
    for (let i = 0; i < mask.data.length; i += 1) {
      const on = (mask.data[i] as number) !== 0;
      if (!on) continue;
      lit += 1;
      // Every lit texel is one the artist drew as seam, core or halo.
      expect(AMBER.has(powered.data[i] as number)).toBe(true);
      expect(powered.data[i]).not.toBe(recess);
      expect(mask.data[i]).toBe(powered.data[i]);
    }
    // One column of 48: the `amber-500` body with its core ticks and glow taps.
    expect(lit).toBe(48);
  });

  it("gives the carrier no light in the states §6 gives no halo, and none to a dark face", () => {
    expect(objectCarrierGrid("flux-main", "long", "unpowered")).toBeNull();
    expect(objectCarrierGrid("flux-main", "long", "destroyed")).toBeNull();
    expect(objectCarrierGrid("flux-main", "end", "powered")).toBeNull();
    const straining = objectCarrierGrid("flux-main", "long", "overloading") as PixelGrid;
    const violet = new Set([paletteIndex(PALETTE["overload-500"]), paletteIndex(PALETTE["overload-100"])]);
    let lit = 0;
    for (const index of straining.data) {
      if (index === 0) continue;
      lit += 1;
      expect(violet.has(index)).toBe(true);
    }
    expect(lit).toBe(48);
  });

  it("caches a state's grid rather than rebuilding it", () => {
    expect(objectFaceGrid("flux-main", "top", "unpowered")).toBe(
      objectFaceGrid("flux-main", "top", "unpowered"),
    );
  });
});

describe("object face mip chains", () => {
  it("runs every face of every object down to 1x1, halving both axes", () => {
    for (const id of OBJECT_ART_IDS) {
      for (const face of objectFaceIds(OBJECT_ART[id])) {
        const levels = objectFaceLevels(id, face);
        const last = levels[levels.length - 1] as (typeof levels)[number];
        expect([last.width, last.height], `${id}/${face}`).toEqual([1, 1]);
        for (let i = 1; i < levels.length; i += 1) {
          const above = levels[i - 1] as (typeof levels)[number];
          const level = levels[i] as (typeof levels)[number];
          expect(level.width, `${id}/${face} level ${i}`).toBe(Math.max(1, above.width >> 1));
          expect(level.height, `${id}/${face} level ${i}`).toBe(Math.max(1, above.height >> 1));
        }
      }
    }
  });

  it("keeps level 0 exactly the shipped grid, alpha and all", () => {
    for (const id of OBJECT_ART_IDS) {
      for (const face of objectFaceIds(OBJECT_ART[id])) {
        const grid = objectFaceGrid(id, face);
        const base = objectFaceLevels(id, face)[0] as { width: number; height: number; data: Uint8ClampedArray };
        expect([base.width, base.height], `${id}/${face}`).toEqual([grid.width, grid.height]);
        // A hoist's open frame is transparent inside its bbox and the chain must
        // keep it that way — `alphaTest 0.5` is what cuts the hole.
        for (let i = 0; i < grid.data.length; i += 1) {
          expect(base.data[i * 4 + 3], `${id}/${face} px ${i}`).toBe(grid.data[i] === 0 ? 0 : 255);
        }
      }
    }
  });
});

describe("what the object audit would reject", () => {
  const poison = (face: ObjectFaceId, x: number, y: number, hex: string): PixelGrid => {
    const grid = cloneGrid(objectFaceGrid("flux-main", face));
    gridSet(grid, x, y, paletteIndex(hex as `#${string}`));
    return grid;
  };

  it("fails a copper-500 pixel on a face with no authored control", () => {
    const audit = auditObjectFace(
      poison("end", 4, 4, PALETTE["copper-500"]),
      "flux-main",
      specOf("flux-main", "end"),
    );
    expect(audit.ok).toBe(false);
    expect(audit.errors.join(" ")).toMatch(/copper-500 pixels on a face with no authored control/);
  });

  it("fails an operable object whose control face lost its handle", () => {
    const grid = cloneGrid(objectFaceGrid("flux-main", "long"));
    const handle = paletteIndex(PALETTE["copper-500"]);
    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        if (gridGet(grid, x, y) === handle) gridSet(grid, x, y, paletteIndex(PALETTE["copper-700"]));
      }
    }
    const audit = auditObjectFace(grid, "flux-main", specOf("flux-main", "long"));
    expect(audit.ok).toBe(false);
    expect(audit.errors.join(" ")).toMatch(/no copper-500 handle/);
  });

  it("fails a copper-300 specular anywhere on the set", () => {
    const audit = auditObjectFace(
      poison("top", 4, 4, PALETTE["copper-300"]),
      "flux-main",
      specOf("flux-main", "top"),
    );
    expect(audit.ok).toBe(false);
    expect(audit.errors.join(" ")).toMatch(/copper-300/);
  });

  it("fails a broken carrier", () => {
    const grid = cloneGrid(objectFaceGrid("flux-main", "long"));
    for (const x of [31, 32]) gridSet(grid, x, 20, paletteIndex(PALETTE["soot-700"]));
    const audit = auditObjectFace(grid, "flux-main", specOf("flux-main", "long"));
    expect(audit.ok).toBe(false);
    expect(audit.errors.join(" ")).toMatch(/the carrier reaches 47\/48 rows/);
  });

  it("fails an over-budget amber and an amber on a face allowed none", () => {
    const grid = cloneGrid(objectFaceGrid("flux-main", "long"));
    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < 8; x += 1) gridSet(grid, x, y, paletteIndex(PALETTE["amber-500"]));
    }
    expect(auditObjectFace(grid, "flux-main", specOf("flux-main", "long")).errors.join(" ")).toMatch(
      /budget is 122/,
    );

    const dark = { ...specOf("flux-main", "end"), amber: false };
    const lit = poison("end", 4, 4, PALETTE["amber-500"]);
    expect(auditObjectFace(lit, "flux-main", dark).errors.join(" ")).toMatch(/amber means live/);
  });

  it("fails a sink that spends a source's amber budget", () => {
    // The one rule the whole set turns on: a consumer given a generous amber dress
    // would undo the main's brief in one image (§3). The hoist's own ceiling is 1%,
    // so the set's 4% is not a licence it holds.
    const grid = cloneGrid(objectFaceGrid("charge-hoist", "top"));
    let painted = 0;
    for (let y = 0; y < grid.height && painted < 20; y += 1) {
      for (let x = 0; x < grid.width && painted < 20; x += 1) {
        if (gridGet(grid, x, y) === 0) continue;
        gridSet(grid, x, y, paletteIndex(PALETTE["amber-500"]));
        painted += 1;
      }
    }
    const audit = auditObjectFace(grid, "charge-hoist", specOf("charge-hoist", "top"));
    expect(audit.ok).toBe(false);
    expect(audit.errors.join(" ")).toMatch(/budget is 9 \(1% of the face\)/);
    // The same face would pass the set's ceiling, which is why §3 cuts it.
    expect(
      auditObjectFace(grid, "charge-hoist", { ...specOf("charge-hoist", "top"), amberShare: OBJECT_AMBER_SHARE })
        .ok,
    ).toBe(true);
  });

  it("fails a face that is over the colour ceiling", () => {
    const grid = cloneGrid(objectFaceGrid("flux-main", "end"));
    const extras = [
      PALETTE["soot-900"],
      PALETTE["soot-300"],
      PALETTE["soot-100"],
      PALETTE["umber-700"],
      PALETTE["umber-500"],
    ];
    extras.forEach((hex, i) => gridSet(grid, i, 0, paletteIndex(hex)));
    const audit = auditObjectFace(grid, "flux-main", specOf("flux-main", "end"));
    expect(audit.colorCount).toBe(9);
    expect(audit.ok).toBe(false);
    expect(audit.errors.join(" ")).toMatch(new RegExp(`9 colours, the brief's ceiling is ${MAX_OBJECT_COLORS}`));
  });
});

const base64Of = (grid: PixelGrid): string => Buffer.from(grid.data).toString("base64");
