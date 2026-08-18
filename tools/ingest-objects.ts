// Turn the delivered Wave 1 object sheets into the committed face grids the
// renderer loads, and print the object audit while doing it.
//
//   npx tsx tools/ingest-objects.ts            # rewrite src/art/masters/objects.ts
//   npx tsx tools/ingest-objects.ts --dry      # report only, write nothing
//   npx tsx tools/ingest-objects.ts --png .art-review/objects/masters
//
// The delivered art lives in `art-src/` and is read-only. The path is:
// `decodePNG` -> `cutObjectSheet` (the declared cells, fence-checked) ->
// `resampleRGBA` 4:1 to the shipped size -> `quantizeGrid` against the object's
// own ramp -> `auditObjectFace`.
//
// One resample, not the terrain flow's two: the delivered cells are already at
// exactly the brief's 4× size, so landing on a nominal master first would be a
// no-op. `fitMasterToCanvas` is deliberately **not** used — it measures a figure
// and stands it on an anchor row, and a machine face has neither.
//
// What is written out is every cell **except** the ones whose spec is marked
// `derivable`: a delivered state painting the engine's own substitution already
// produces to the pixel. Those are still cut, quantized and audited here — and
// the agreement is printed — but storing them would be the same pixels on disk
// twice, which is the drift `objectset.ts` keeps one painting per face to avoid.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { quantizeGrid, resampleRGBA, type QuantizeStats } from "../src/art/ingest.js";
import { decodePNG, encodePNG } from "../src/art/png.js";
import { gridToRGBA, type PixelGrid } from "../src/art/pixel.js";
import {
  OBJECT_ART_IDS,
  OBJECT_FACE_IDS,
  OBJECT_FACE_STATES,
  auditObjectFace,
  faceInState,
  formatObjectFaceAudit,
  objectCellSpec,
  type ObjectFaceAudit,
  type ObjectFaceId,
  type ObjectFaceSpec,
  type ObjectFaceState,
  type ObjectSpriteId,
} from "../src/art/objects.js";
import { OBJECT_SHEETS, cutObjectSheet, formatObjectSheetCut } from "../src/art/objectIntake.js";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const pngAt = args.indexOf("--png");
const pngDir = pngAt >= 0 ? args[pngAt + 1] : undefined;

interface Ingested {
  readonly sprite: ObjectSpriteId;
  readonly face: ObjectFaceId;
  readonly state: ObjectFaceState;
  readonly spec: ObjectFaceSpec;
  readonly delivered: { readonly w: number; readonly h: number };
  readonly grid: PixelGrid;
  readonly stats: QuantizeStats;
  readonly audit: ObjectFaceAudit;
}

const ingested: Ingested[] = [];
for (const sheet of OBJECT_SHEETS) {
  const source = decodePNG(readFileSync(resolve(root, sheet.source)));
  const cut = cutObjectSheet(source, sheet.cells, sheet.strip);
  console.log(`\n${"=".repeat(72)}\n${sheet.source}: ${source.width}x${source.height}`);
  console.log(formatObjectSheetCut(cut));
  const fromSheet: Ingested[] = [];
  for (const cell of cut.cells) {
    const spec = objectCellSpec(cell.sprite, cell.face, cell.state) as ObjectFaceSpec;
    const shipped = resampleRGBA(cell.image, spec.width, spec.height);
    const { grid, stats } = quantizeGrid(shipped, { allowed: spec.allowed, alphaThreshold: 127 });
    fromSheet.push({
      sprite: cell.sprite,
      face: cell.face,
      state: cell.state,
      spec,
      delivered: { w: cell.image.width, h: cell.image.height },
      grid,
      stats,
      audit: auditObjectFace(grid, cell.sprite, spec),
    });
  }
  ingested.push(...fromSheet);
  const used = new Set(fromSheet.flatMap((i) => i.audit.colors));
  const strip = new Set(cut.swatches);
  const missing = [...used].filter((hex) => !strip.has(hex));
  const spare = [...strip].filter((hex) => !used.has(hex));
  console.log(
    `swatch cross-check: ${used.size} colours used, ${strip.size} swatched` +
      `${missing.length > 0 ? `, NOT SWATCHED ${missing.join(" ")}` : ""}` +
      `${spare.length > 0 ? `, swatched but unused ${spare.join(" ")}` : ""}`,
  );
}

const label = (item: Ingested): string =>
  item.state === "powered" ? `${item.sprite}/${item.face}` : `${item.sprite}/${item.face}:${item.state}`;

for (const item of ingested) {
  console.log(
    `\n${"-".repeat(72)}\n${label(item)}: delivered ${item.delivered.w}x${item.delivered.h}` +
      ` -> shipped ${item.spec.width}x${item.spec.height}`,
  );
  console.log(
    `  quantized ${item.stats.movedCount}/${item.stats.opaqueCount} px, mean move ${item.stats.meanDistance.toFixed(1)}, worst ${item.stats.maxDistance.toFixed(1)}, ambiguous ${item.stats.ambiguous.length}`,
  );
  console.log(formatObjectFaceAudit(item.audit));
}

// A `derivable` cell claims the engine already computes it. Say so out loud: the
// delivered painting against the substitution of the object's own powered face.
const base64 = (grid: PixelGrid): string => Buffer.from(grid.data).toString("base64");
for (const item of ingested.filter((i) => i.spec.derivable)) {
  const powered = ingested.find(
    (i) => i.sprite === item.sprite && i.face === item.spec.paintedAs && i.state === "powered",
  );
  const agrees = powered !== undefined && base64(faceInState(powered.grid, item.state)) === base64(item.grid);
  console.log(
    `\nderivable ${label(item)}: ${agrees ? "AGREES with" : "DIFFERS from"} faceInState(${item.sprite}/${item.spec.paintedAs}, ${item.state}) — not stored`,
  );
}

if (pngDir) {
  const dir = resolve(root, pngDir);
  mkdirSync(dir, { recursive: true });
  const scale = 8;
  for (const item of ingested) {
    if (item.state !== "powered") continue;
    for (const state of OBJECT_FACE_STATES) {
      const grid = faceInState(item.grid, state);
      writeFileSync(
        resolve(dir, `${item.sprite}-${item.face}-${state}-${scale}x.png`),
        encodePNG({
          width: grid.width * scale,
          height: grid.height * scale,
          data: gridToRGBA(grid, scale),
        }),
      );
    }
  }
  for (const item of ingested.filter((i) => i.state !== "powered" && !i.spec.derivable)) {
    writeFileSync(
      resolve(dir, `${item.sprite}-${item.face}-${item.state}-delivered-${scale}x.png`),
      encodePNG({
        width: item.grid.width * scale,
        height: item.grid.height * scale,
        data: gridToRGBA(item.grid, scale),
      }),
    );
  }
  console.log(`\nwrote previews to ${dir}`);
}

if (!dry) {
  const order = (item: Ingested) =>
    OBJECT_ART_IDS.indexOf(item.sprite) * 10000 +
    OBJECT_FACE_IDS.indexOf(item.face) * 100 +
    OBJECT_FACE_STATES.indexOf(item.state);
  const stored = ingested.filter((item) => !item.spec.derivable).sort((a, b) => order(a) - order(b));
  const constName = (item: Ingested) =>
    [item.sprite.replace(/-/g, "_"), item.face, item.state === "powered" ? null : item.state, "base64"]
      .filter((part) => part !== null)
      .join("_")
      .toUpperCase();
  const body = stored
    .map((item) => {
      const verdict = [
        `// ${label(item)}: ${item.audit.ok ? "CONFORMS" : "REJECTED"} at generation time —`,
        ...(item.audit.errors.length === 0
          ? ["//   (no errors)"]
          : item.audit.errors.map((e) => `//   ERROR ${e}`)),
        ...item.audit.warnings.map((w) => `//   warn  ${w}`),
      ].join("\n");
      return `${verdict}
/** Base64 of the ${item.spec.width}x${item.spec.height} palette-index grid, row-major, top row first. */
export const ${constName(item)} =
  ${JSON.stringify(base64(item.grid))};`;
    })
    .join("\n\n");

  const out = resolve(root, "src/art/masters/objects.ts");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    `// Generated by \`npx tsx tools/ingest-objects.ts\`. Do not edit by hand.
//
// The delivered map-object faces, cut from one sheet per brief. What is stored is
// the **powered** painting of every face, plus the one state a substitution
// cannot reach: §4's break top, because a cut reads as absence of material. §6's
// other states are \`faceInState\`'s substitution over the amber ramp, computed in
// \`src/art/objectset.ts\`, and so is §4's dead run — the artist drew it and the
// intake proves the engine matches it rather than storing it twice.
//
// Sources: ${OBJECT_SHEETS.map((s) => s.source).join(", ")}.
//
// What the verdicts below mean, and why every face ships anyway, is
// \`art-src/INTAKE_LOG.md\` Part C. The pipeline reports and never repairs
// (ART_DIRECTION C.8.2), so nothing here was retouched.

${body}
`,
  );
  console.log(`\nwrote ${out}`);
}
