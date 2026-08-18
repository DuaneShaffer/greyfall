// Turn the delivered Wave 1 terrain sheet into the nine committed tile-face
// grids the renderer loads, and print the terrain audit while doing it.
//
//   npx tsx tools/ingest-tiles.ts            # rewrite src/art/masters/tiles.ts
//   npx tsx tools/ingest-tiles.ts --dry      # report only, write nothing
//   npx tsx tools/ingest-tiles.ts --png .art-review/terrain/masters
//
// The delivered art lives in `art-src/greyfall_terrain.png` and is read-only.
// The path is: `decodePNG` -> `cutTerrainSheet` (nine framed preview cells) ->
// `resampleRGBA` to the 4x master size -> `resampleRGBA` again to the shipped
// size -> `quantizeGrid` against the material's own ramp -> `auditTile`.
//
// Two resamples, not one, and on purpose: D.4 fixes the master at 4x and the
// shipped face at 1x, and the delivered previews are neither (they are 270-row
// and 185-row paintings at nine different widths). Landing on the nominal master
// first means the numbers in the intake log are the numbers the brief asks for,
// and the second step is exactly the 4:1 box filter the sprite flow uses.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { quantizeGrid, resampleRGBA, type QuantizeStats, type RGBASource } from "../src/art/ingest.js";
import { decodePNG, encodePNG } from "../src/art/png.js";
import { gridToRGBA, type PixelGrid } from "../src/art/pixel.js";
import {
  TILE_MASTER_SCALE,
  TILE_TEXTURE,
  TILE_TEXTURE_IDS,
  auditTile,
  formatTileAudit,
  type TileAudit,
  type TileTextureId,
} from "../src/art/tiles.js";
import { cutTerrainSheet, formatTerrainSheetCut } from "../src/art/tileSheet.js";

const SOURCE = "art-src/greyfall_terrain.png";
const root = resolve(import.meta.dirname, "..");

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const pngAt = args.indexOf("--png");
const pngDir = pngAt >= 0 ? args[pngAt + 1] : undefined;

const sheet = decodePNG(readFileSync(resolve(root, SOURCE)));
const cut = cutTerrainSheet(sheet);
console.log(`${SOURCE}: ${sheet.width}x${sheet.height}`);
console.log(formatTerrainSheetCut(cut));

interface Ingested {
  readonly id: TileTextureId;
  readonly delivered: { readonly w: number; readonly h: number };
  readonly master: RGBASource;
  readonly grid: PixelGrid;
  readonly stats: QuantizeStats;
  readonly audit: TileAudit;
}

const ingested: Ingested[] = [];
for (const cell of cut.cells) {
  const spec = TILE_TEXTURE[cell.id];
  const master = resampleRGBA(
    cell.image,
    spec.width * TILE_MASTER_SCALE,
    spec.height * TILE_MASTER_SCALE,
  );
  const shipped = resampleRGBA(master, spec.width, spec.height);
  const { grid, stats } = quantizeGrid(shipped, { allowed: spec.allowed, alphaThreshold: 127 });
  ingested.push({
    id: cell.id,
    delivered: { w: cell.image.width, h: cell.image.height },
    master,
    grid,
    stats,
    audit: auditTile(grid, spec),
  });
}

for (const item of ingested) {
  const spec = TILE_TEXTURE[item.id];
  const nominal = (spec.width * TILE_MASTER_SCALE) / (spec.height * TILE_MASTER_SCALE);
  console.log(
    `\n${"-".repeat(72)}\n${item.id}: delivered ${item.delivered.w}x${item.delivered.h}` +
      ` (aspect ${(item.delivered.w / item.delivered.h).toFixed(3)} vs nominal ${nominal.toFixed(3)})` +
      ` -> master ${spec.width * TILE_MASTER_SCALE}x${spec.height * TILE_MASTER_SCALE} -> shipped ${spec.width}x${spec.height}`,
  );
  console.log(
    `  quantized ${item.stats.movedCount}/${item.stats.opaqueCount} px, mean move ${item.stats.meanDistance.toFixed(1)}, worst ${item.stats.maxDistance.toFixed(1)}, ambiguous ${item.stats.ambiguous.length}`,
  );
  console.log(formatTileAudit(item.audit));
}

if (pngDir) {
  const dir = resolve(root, pngDir);
  mkdirSync(dir, { recursive: true });
  const scale = 8;
  for (const item of ingested) {
    writeFileSync(
      resolve(dir, `${item.id}-${scale}x.png`),
      encodePNG({
        width: item.grid.width * scale,
        height: item.grid.height * scale,
        data: gridToRGBA(item.grid, scale),
      }),
    );
    writeFileSync(
      resolve(dir, `${item.id}-master.png`),
      encodePNG({
        width: item.master.width,
        height: item.master.height,
        data: Uint8ClampedArray.from(item.master.data),
      }),
    );
  }
  console.log(`\nwrote previews to ${dir}`);
}

if (!dry) {
  const order = new Map(TILE_TEXTURE_IDS.map((id, i) => [id, i]));
  const sorted = [...ingested].sort(
    (a, b) => (order.get(a.id) as number) - (order.get(b.id) as number),
  );
  const constName = (id: TileTextureId) => `${id.replace(/-/g, "_").toUpperCase()}_BASE64`;
  const body = sorted
    .map((item) => {
      const spec = TILE_TEXTURE[item.id];
      const verdict = [
        `// ${item.id}: ${item.audit.ok ? "CONFORMS" : "REJECTED"} at generation time —`,
        ...(item.audit.errors.length === 0 ? ["//   (no errors)"] : item.audit.errors.map((e) => `//   ERROR ${e}`)),
        ...item.audit.warnings.map((w) => `//   warn  ${w}`),
      ].join("\n");
      return `${verdict}
/** Base64 of the ${spec.width}x${spec.height} palette-index grid, row-major, top row first. */
export const ${constName(item.id)} =
  ${JSON.stringify(Buffer.from(item.grid.data).toString("base64"))};`;
    })
    .join("\n\n");

  const out = resolve(root, "src/art/masters/tiles.ts");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    `// Generated by \`npx tsx tools/ingest-tiles.ts\`. Do not edit by hand.
//
// The nine Wave 1 tile faces, cut from the one delivered labelled sheet.
// Source: ${SOURCE} (${sheet.width}x${sheet.height}).
${formatTerrainSheetCut(cut)
  .split("\n")
  .map((line) => `// ${line}`)
  .join("\n")}
//
// What the verdicts below mean, and why every face ships anyway, is
// \`art-src/INTAKE_LOG.md\` §B.3. The pipeline reports and never repairs
// (ART_DIRECTION C.8.2), so nothing here was retouched.

${body}
`,
  );
  console.log(`\nwrote ${out}`);
}
