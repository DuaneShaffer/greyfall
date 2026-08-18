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

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { quantizeGrid, resampleRGBA, type QuantizeStats } from "../src/art/ingest.js";
import { decodePNG, encodePNG } from "../src/art/png.js";
import { gridToRGBA, type PixelGrid } from "../src/art/pixel.js";
import {
  OBJECT_ART,
  OBJECT_ART_IDS,
  OBJECT_FACE_IDS,
  OBJECT_POWER_STATES,
  auditObjectFace,
  faceInState,
  formatObjectFaceAudit,
  type ObjectFaceAudit,
  type ObjectFaceId,
  type ObjectSpriteId,
} from "../src/art/objects.js";
import {
  FLUX_MAIN_SHEET_CELLS,
  cutObjectSheet,
  formatObjectSheetCut,
  type DeclaredObjectCell,
} from "../src/art/objectIntake.js";

/** One delivered file per object, with the cells it carries. */
const SHEETS: readonly { readonly sprite: ObjectSpriteId; readonly source: string; readonly cells: readonly DeclaredObjectCell[] }[] = [
  { sprite: "flux-main", source: "art-src/flux_main.png", cells: FLUX_MAIN_SHEET_CELLS },
];

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const pngAt = args.indexOf("--png");
const pngDir = pngAt >= 0 ? args[pngAt + 1] : undefined;

interface Ingested {
  readonly sprite: ObjectSpriteId;
  readonly face: ObjectFaceId;
  readonly delivered: { readonly w: number; readonly h: number };
  readonly grid: PixelGrid;
  readonly stats: QuantizeStats;
  readonly audit: ObjectFaceAudit;
}

const ingested: Ingested[] = [];
for (const sheet of SHEETS) {
  const source = decodePNG(readFileSync(resolve(root, sheet.source)));
  const cut = cutObjectSheet(source, sheet.cells);
  console.log(`\n${"=".repeat(72)}\n${sheet.source}: ${source.width}x${source.height}`);
  console.log(formatObjectSheetCut(cut));
  for (const cell of cut.cells) {
    const spec = OBJECT_ART[cell.sprite].faces[cell.face];
    const shipped = resampleRGBA(cell.image, spec.width, spec.height);
    const { grid, stats } = quantizeGrid(shipped, { allowed: spec.allowed, alphaThreshold: 127 });
    ingested.push({
      sprite: cell.sprite,
      face: cell.face,
      delivered: { w: cell.image.width, h: cell.image.height },
      grid,
      stats,
      audit: auditObjectFace(grid, cell.sprite, spec),
    });
  }
  const used = new Set(
    ingested.filter((i) => i.sprite === sheet.sprite).flatMap((i) => i.audit.colors),
  );
  const strip = new Set(cut.swatches);
  const missing = [...used].filter((hex) => !strip.has(hex));
  const spare = [...strip].filter((hex) => !used.has(hex));
  console.log(
    `swatch cross-check: ${used.size} colours used, ${strip.size} swatched` +
      `${missing.length > 0 ? `, NOT SWATCHED ${missing.join(" ")}` : ""}` +
      `${spare.length > 0 ? `, swatched but unused ${spare.join(" ")}` : ""}`,
  );
}

for (const item of ingested) {
  const spec = OBJECT_ART[item.sprite].faces[item.face];
  console.log(
    `\n${"-".repeat(72)}\n${item.sprite}/${item.face}: delivered ${item.delivered.w}x${item.delivered.h}` +
      ` -> shipped ${spec.width}x${spec.height}`,
  );
  console.log(
    `  quantized ${item.stats.movedCount}/${item.stats.opaqueCount} px, mean move ${item.stats.meanDistance.toFixed(1)}, worst ${item.stats.maxDistance.toFixed(1)}, ambiguous ${item.stats.ambiguous.length}`,
  );
  console.log(formatObjectFaceAudit(item.audit));
}

if (pngDir) {
  const dir = resolve(root, pngDir);
  mkdirSync(dir, { recursive: true });
  const scale = 8;
  for (const item of ingested) {
    for (const state of OBJECT_POWER_STATES) {
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
  console.log(`\nwrote previews to ${dir}`);
}

if (!dry) {
  const order = (sprite: ObjectSpriteId, face: ObjectFaceId) =>
    OBJECT_ART_IDS.indexOf(sprite) * 100 + OBJECT_FACE_IDS.indexOf(face);
  const sorted = [...ingested].sort(
    (a, b) => order(a.sprite, a.face) - order(b.sprite, b.face),
  );
  const constName = (sprite: ObjectSpriteId, face: ObjectFaceId) =>
    `${sprite.replace(/-/g, "_").toUpperCase()}_${face.toUpperCase()}_BASE64`;
  const body = sorted
    .map((item) => {
      const spec = OBJECT_ART[item.sprite].faces[item.face];
      const verdict = [
        `// ${item.sprite}/${item.face}: ${item.audit.ok ? "CONFORMS" : "REJECTED"} at generation time —`,
        ...(item.audit.errors.length === 0
          ? ["//   (no errors)"]
          : item.audit.errors.map((e) => `//   ERROR ${e}`)),
        ...item.audit.warnings.map((w) => `//   warn  ${w}`),
      ].join("\n");
      return `${verdict}
/** Base64 of the ${spec.width}x${spec.height} palette-index grid, row-major, top row first. */
export const ${constName(item.sprite, item.face)} =
  ${JSON.stringify(Buffer.from(item.grid.data).toString("base64"))};`;
    })
    .join("\n\n");

  const out = resolve(root, "src/art/masters/objects.ts");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    `// Generated by \`npx tsx tools/ingest-objects.ts\`. Do not edit by hand.
//
// The delivered map-object faces, cut from one sheet per object. Only the
// **powered** painting is stored; §6's other states are \`faceInState\`'s
// substitution over the amber ramp, computed in \`src/art/objectset.ts\`.
//
// Sources: ${SHEETS.map((s) => s.source).join(", ")}.
//
// What the verdicts below mean, and why every face ships anyway, is
// \`art-src/INTAKE_LOG.md\` Part C. The pipeline reports and never repairs
// (ART_DIRECTION C.8.2), so nothing here was retouched.

${body}
`,
  );
  console.log(`\nwrote ${out}`);
}
