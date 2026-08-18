// Turn a delivered external master into the committed 64x96 grids the game
// loads, and print the conformance report while doing it.
//
//   npx tsx tools/ingest-master.ts conduit
//   npx tsx tools/ingest-master.ts --all
//   npx tsx tools/ingest-master.ts enforcer --dry     # report only, write nothing
//
// The delivered art lives in `art-src/`; this writes `src/art/masters/<id>.ts`.
// Regenerate it deliberately — the file says so at the top — and read the report
// it prints before committing, because the pipeline reports and never repairs
// (ART_DIRECTION C.8.2).
//
// Two delivery shapes are known, and the difference is declared per file rather
// than sniffed:
//
//   "crop"  — a hand-measured rectangle of the delivery holds one figure. This
//             is Vale, whose sheet is one figure rendered twice at two sizes.
//   "sheet" — a finished character sheet: two figure cells plus title, preview
//             inset, silhouette, swatches and a painted backdrop. The cells are
//             located by `cutDeliverySheet` (C.8.7), not by hand, and both are
//             ingested: the front cell drives `se` and the back cell drives `ne`.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cutDeliverySheet, formatSheetCut, type CellCut } from "../src/art/delivery.js";
import {
  FIELD_PALETTE,
  fieldPaletteWith,
  fitMasterToCanvas,
  formatReport,
  masterFitScale,
  quantizeToPalette,
  type ConformanceReport,
  type RGBASource,
  type Rect,
} from "../src/art/ingest.js";
import { PALETTE, type Hex } from "../src/art/palette.js";
import { SPRITE_HEIGHT, SPRITE_WIDTH, type DrawnView } from "../src/art/sprites.js";
import { decodePNG } from "../src/art/png.js";
import { gridBounds, type PixelGrid } from "../src/art/pixel.js";
import type { JobId } from "../src/art/jobs.js";

interface Common {
  readonly jobId: JobId;
  readonly source: string;
  readonly note: string;
  /**
   * Coverage threshold for the reduction. The delivered cell is binary alpha, so
   * this is "what share of a destination box must the figure cover to survive":
   * 127 is half. Thin gear — a whip antenna, a hook shaft, a fuse wire — is
   * thinner than half a destination pixel at these reduction ratios, so the
   * sheets carrying it declare a lower bar rather than lose it.
   */
  readonly coverage?: number;
  /**
   * Quantization target. Defaults to `FIELD_PALETTE` — §2 without the reserved
   * signal colors — so a painted cheek cannot land on `brightblood` and a
   * copper flask cannot land on `hazard`. A delivery whose fiction carries one
   * of those declares it here.
   */
  readonly allowed?: readonly Hex[];
}

type Delivery =
  | (Common & { readonly kind: "crop"; readonly crop: Rect })
  | (Common & { readonly kind: "sheet" });

/** Exported so `tests/art/delivery.test.ts` can re-derive every committed master. */
export const DELIVERIES: Readonly<Record<string, Delivery>> = {
  conduit: {
    kind: "crop",
    jobId: "conduit",
    source: "art-src/vale/vale_sprite.png",
    // The delivery is one figure rendered twice, large on the right and small
    // on the left, rather than the front/back pair the brief asked for. The
    // large render is the one with detail to spend.
    crop: { x: 320, y: 0, w: 704, h: 1536 },
    note: "Vale, the Conduit. Front three-quarter only; the back view was not delivered.",
  },
  enforcer: {
    kind: "sheet",
    jobId: "enforcer",
    source: "art-src/rowen_corvane_enforcer.png",
    note: "Rowen Corvane, the Enforcer. Front and back three-quarter both delivered.",
    coverage: 110,
  },
  machinist: {
    kind: "sheet",
    jobId: "machinist",
    source: "art-src/ivo_brace_machinist.png",
    note: "Ivo Brace, the Machinist. Front and back three-quarter both delivered.",
    // The whip antenna is ~5 source px across and the reduction is ~8:1.
    coverage: 72,
  },
  saboteur: {
    kind: "sheet",
    jobId: "saboteur",
    source: "art-src/marek_sump_saboteur.png",
    note: "Marek Sump, the Saboteur. Front and back three-quarter both delivered.",
    coverage: 96,
  },
  chemist: {
    kind: "sheet",
    jobId: "chemist",
    source: "art-src/jory_slate_chemist.png",
    note: "Jory Slate, the Chemist. Front and back three-quarter both delivered.",
    coverage: 96,
  },
  augmented: {
    kind: "sheet",
    jobId: "augmented",
    source: "art-src/orin_vane_augmented.png",
    note: "Orin Vane, the Augmented. Front and back three-quarter both delivered.",
    coverage: 110,
    // The one job whose fiction has brightblood in it: the scarring where the
    // graft meets the neck.
    allowed: fieldPaletteWith(PALETTE.brightblood),
  },
  railrunner: {
    kind: "sheet",
    jobId: "railrunner",
    source: "art-src/della_tine_railrunner.png",
    note: "Della Tine, the Railrunner. Front and back three-quarter both delivered.",
    // The coupling-hook shaft and the coat-tail points are the thin gear here.
    coverage: 84,
  },
};

const root = resolve(import.meta.dirname, "..");

export interface ViewIngest {
  readonly view: DrawnView;
  readonly grid: PixelGrid;
  readonly report: ConformanceReport;
  readonly fitted: { readonly width: number; readonly height: number };
  readonly cell?: CellCut;
}

const rowSpans = (grid: PixelGrid): string[] => {
  const rows: string[] = [];
  for (let y = 0; y < SPRITE_HEIGHT; y += 1) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < SPRITE_WIDTH; x += 1) {
      if (grid.data[y * SPRITE_WIDTH + x]) {
        if (first < 0) first = x;
        last = x;
      }
    }
    rows.push(first < 0 ? `${y}: -` : `${y}: ${first}..${last} (${last - first + 1})`);
  }
  return rows;
};

export function ingest(id: string, delivery: Delivery): { views: ViewIngest[]; cutLog: string } {
  const image = decodePNG(readFileSync(resolve(root, delivery.source)));
  const coverage = delivery.coverage ?? 127;
  const allowed = delivery.allowed ?? FIELD_PALETTE;
  const quantize = { alphaThreshold: coverage, allowed };

  if (delivery.kind === "crop") {
    const cropped = fitMasterToCanvas(image, { crop: delivery.crop, alphaThreshold: coverage });
    const { grid, report } = quantizeToPalette(cropped, quantize);
    return {
      views: [{ view: "se", grid, report, fitted: { width: image.width, height: image.height } }],
      cutLog: `${id}: hand-measured crop ${JSON.stringify(delivery.crop)} of ${image.width}x${image.height}`,
    };
  }

  const cut = cutDeliverySheet(image);
  const cells: readonly (readonly [DrawnView, CellCut])[] = [
    ["se", cut.front],
    ["ne", cut.back],
  ];
  // One character, one scale: the pair is measured together so the unit does
  // not change height when it turns around.
  const scale = masterFitScale(
    cells.map(([, cell]) => cell.image),
    { alphaThreshold: coverage },
  );
  const views = cells.map(([view, cell]) => {
    const fitted = fitMasterToCanvas(cell.image, { alphaThreshold: coverage, scale });
    const { grid, report } = quantizeToPalette(fitted, quantize);
    return { view, grid, report, fitted: { width: cell.image.width, height: cell.image.height }, cell };
  });
  return {
    views,
    cutLog: `${formatSheetCut(cut, id)}\n  shared reduction ${scale.toFixed(4)} (1:${(1 / scale).toFixed(2)})`,
  };
}

const commentBlock = (report: ConformanceReport, view: DrawnView): string => {
  const lines = [`// Intake report for ${view} at generation time: ${report.ok ? "CONFORMS" : "REJECTED"} —`];
  if (report.errors.length === 0) lines.push("//   (no errors)");
  for (const error of report.errors) lines.push(`//   ERROR ${error}`);
  for (const warning of report.warnings) lines.push(`//   warn  ${warning}`);
  return lines.join("\n");
};

function write(id: string, delivery: Delivery, views: readonly ViewIngest[], cutLog: string): string {
  const body = views
    .map((v) => {
      const base64 = Buffer.from(v.grid.data).toString("base64");
      const name = v.view === "se" ? "SE_BASE64" : "NE_BASE64";
      const which = v.view === "se" ? "front three-quarter" : "back three-quarter";
      return `${commentBlock(v.report, v.view)}
/** Base64 of the ${which} ${SPRITE_WIDTH}x${SPRITE_HEIGHT} palette-index grid, row-major. */
export const ${name} =
  ${JSON.stringify(base64)};`;
    })
    .join("\n\n");

  const out = resolve(root, `src/art/masters/${id}.ts`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    `// Generated by \`npx tsx tools/ingest-master.ts ${id}\`. Do not edit by hand.
//
// ${delivery.note}
// Source: ${delivery.source}.
${cutLog
  .split("\n")
  .map((line) => `// ${line}`)
  .join("\n")}
//
// See docs/ART_DIRECTION.md C.8.6 for what the report below means and why the
// master ships anyway, and C.8.7 for how the cells were located. How it is
// animated — landmarks, prop regions — lives in external.ts, because those are
// decisions, not delivered data.

${body}
`,
  );
  return out;
}

function main(args: readonly string[]): void {
  const dry = args.includes("--dry");
  const spans = args.includes("--spans");
  const ids = args.includes("--all")
    ? Object.keys(DELIVERIES)
    : args.filter((a) => !a.startsWith("--"));
  if (ids.length === 0) {
    throw new Error(`name a delivery or pass --all; known: ${Object.keys(DELIVERIES).join(", ")}`);
  }

  for (const id of ids) {
    const delivery = DELIVERIES[id];
    if (!delivery) {
      throw new Error(`no delivery named "${id}"; known: ${Object.keys(DELIVERIES).join(", ")}`);
    }
    console.log(`\n${"=".repeat(72)}\n${id} — ${delivery.note}\n${"=".repeat(72)}`);
    const { views, cutLog } = ingest(id, delivery);
    console.log(cutLog);
    for (const v of views) {
      const extent = gridBounds(v.grid);
      console.log(
        extent === null
          ? `\nsource cell ${v.fitted.width}x${v.fitted.height} -> empty canvas`
          : `\nsource cell ${v.fitted.width}x${v.fitted.height} -> canvas rows ${extent.y0}..${extent.y1}` +
              ` (${extent.y1 - extent.y0 + 1} tall), columns ${extent.x0}..${extent.x1}` +
              ` (${extent.x1 - extent.x0 + 1} wide)`,
      );
      console.log(formatReport(v.report, `${id}/${v.view}`));
      if (spans) {
        console.log(`\nrow spans (${v.view}), for measuring the shoulder and hip lines:`);
        console.log(rowSpans(v.grid).join("\n"));
      }
    }
    if (dry) continue;
    const out = write(id, delivery, views, cutLog);
    console.log(`\nwrote ${out}`);
  }
}

// Importing this file is how the tests re-derive the committed masters, so the
// run only happens when it is the entry point.
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2));
}
