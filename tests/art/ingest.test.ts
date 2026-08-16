// End-to-end proof of the external-master intake path (ART_DIRECTION C.8).
//
// The stand-in "external" art is our own Enforcer and Saboteur idle masters,
// rendered to PNG bytes, nudged off-palette the way a foreign tool would leave
// them, then read back through the public intake API with no inside knowledge:
// decode -> quantize -> audit -> segment -> derive 28 frames per view -> sheet.
// The derived frames are then held to the same §3/§4 assertions the generated
// ones are.

import { describe, expect, it } from "vitest";
import { JOB_ART, jobFrame, tintIndices } from "../../src/art/jobs.js";
import {
  AMBER_BUDGET,
  MAX_FRAME_COLORS,
  auditGrid,
  formatReport,
  quantizeToPalette,
  retint,
} from "../../src/art/ingest.js";
import { importExternalMaster, propRegion, retintMaster } from "../../src/art/intake.js";
import { EMISSIVE_COLORS, PALETTE, RAMPS, TEAM_TINT } from "../../src/art/palette.js";
import {
  INDEXED_PALETTE,
  OUTLINE_INDEX,
  TRANSPARENT,
  distinctColors,
  gridBounds,
  gridGet,
  histogram,
  mirrorGrid,
  opaqueCount,
  paletteIndex,
  type PixelGrid,
} from "../../src/art/pixel.js";
import { decodePNG, encodePNG } from "../../src/art/png.js";
import { buildJobSheet } from "../../src/art/sheet.js";
import {
  buildExternalSheet,
  cutMaster,
  defaultRegionMap,
  deriveExternalFrame,
  everyExternalFrame,
  SEGMENT_NAMES,
} from "../../src/art/segments.js";
import {
  ANIMATIONS,
  DRAWN_FRAMES_PER_JOB,
  FIGURE_BOX_BOTTOM,
  SHEET_LAYOUT,
  SPRITE_ANCHOR,
  SPRITE_HEIGHT,
  SPRITE_WIDTH,
} from "../../src/art/sprites.js";

const AMBER_INDICES = new Set(RAMPS.amber.map((hex) => paletteIndex(hex)));
const HALO_INDICES = EMISSIVE_COLORS.map((hex) => paletteIndex(hex));

/** Palette-index grid -> RGBA, the shape an external PNG arrives in. */
function toRGBA(grid: PixelGrid, jitter = 0): { width: number; height: number; data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(grid.width * grid.height * 4);
  for (let i = 0; i < grid.width * grid.height; i += 1) {
    const hex = INDEXED_PALETTE[grid.data[i] ?? 0] ?? null;
    if (hex === null) continue;
    const drift = jitter === 0 ? 0 : ((i % 7) - 3) * jitter;
    data[i * 4] = Number.parseInt(hex.slice(1, 3), 16) + drift;
    data[i * 4 + 1] = Number.parseInt(hex.slice(3, 5), 16) + drift;
    data[i * 4 + 2] = Number.parseInt(hex.slice(5, 7), 16) - drift;
    data[i * 4 + 3] = 255;
  }
  return { width: grid.width, height: grid.height, data };
}

const pngOf = (grid: PixelGrid, jitter = 0): Uint8Array => encodePNG(toRGBA(grid, jitter));

describe("png codec", () => {
  it("round-trips an RGBA image without a dependency", () => {
    const source = toRGBA(jobFrame({ jobId: "conduit", team: "player", state: "cast", view: "se", frame: 4 }));
    const decoded = decodePNG(encodePNG(source));
    expect(decoded.width).toBe(SPRITE_WIDTH);
    expect(decoded.height).toBe(SPRITE_HEIGHT);
    expect(Array.from(decoded.data)).toEqual(Array.from(source.data));
  });

  it("compresses, and a standard inflater reads what we wrote", async () => {
    const { inflateSync } = await import("node:zlib");
    const sheet = toRGBA(buildJobSheet("conduit", "player"));
    const bytes = encodePNG(sheet);
    // Stored blocks would be larger than the raw pixels; this must not be.
    expect(bytes.length).toBeLessThan(sheet.data.length / 8);
    const idat: number[] = [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let at = 8; at < bytes.length; ) {
      const length = view.getUint32(at);
      const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
      if (type === "IDAT") idat.push(...bytes.subarray(at + 8, at + 8 + length));
      at += 12 + length;
    }
    const raw = new Uint8Array(inflateSync(Uint8Array.from(idat)));
    expect(raw.length).toBe((sheet.width * 4 + 1) * sheet.height);
    expect(Array.from(decodePNG(bytes).data)).toEqual(Array.from(sheet.data));
  });

  it("round-trips incompressible data losslessly", () => {
    const w = 61;
    const h = 37;
    const data = new Uint8ClampedArray(w * h * 4);
    let s = 7;
    for (let i = 0; i < data.length; i += 1) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (s >>> 13) & 0xff;
    }
    const decoded = decodePNG(encodePNG({ width: w, height: h, data }));
    expect(Array.from(decoded.data)).toEqual(Array.from(data));
  });

  it("reads a PNG produced elsewhere (dynamic-huffman deflate)", async () => {
    // node:zlib emits dynamic-huffman blocks; ours emits fixed. Decoding both
    // proves the inflate path, not just a mirror of our own encoder.
    const { deflateSync } = await import("node:zlib");
    const source = toRGBA(jobFrame({ jobId: "enforcer", team: "enemy", state: "idle", view: "ne", frame: 0 }));
    const stride = source.width * 4;
    const raw = new Uint8Array((stride + 1) * source.height);
    for (let y = 0; y < source.height; y += 1) {
      raw.set(source.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
    }
    const crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
    const chunk = (type: string, body: Uint8Array): Uint8Array => {
      const out = new Uint8Array(body.length + 12);
      const view = new DataView(out.buffer);
      view.setUint32(0, body.length);
      for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
      out.set(body, 8);
      let c = 0xffffffff;
      for (const b of out.subarray(4, body.length + 8)) c = (crcTable[(c ^ b) & 0xff] as number) ^ (c >>> 8);
      view.setUint32(body.length + 8, (c ^ 0xffffffff) >>> 0);
      return out;
    };
    const ihdr = new Uint8Array(13);
    const view = new DataView(ihdr.buffer);
    view.setUint32(0, source.width);
    view.setUint32(4, source.height);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const parts = [
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", new Uint8Array(deflateSync(raw, { level: 9 }))),
      chunk("IEND", new Uint8Array(0)),
    ];
    const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const part of parts) {
      bytes.set(part, at);
      at += part.length;
    }
    const decoded = decodePNG(bytes);
    expect(Array.from(decoded.data)).toEqual(Array.from(source.data));
  });
});

describe("quantization", () => {
  const master = jobFrame({ jobId: "enforcer", team: "player", state: "idle", view: "se", frame: 0 });

  it("snaps off-palette colors back and says how far each moved", () => {
    const drifted = decodePNG(pngOf(master, 1));
    const { grid, report } = quantizeToPalette(drifted);
    expect(Array.from(grid.data)).toEqual(Array.from(master.data));
    expect(report.movedCount).toBeGreaterThan(0);
    expect(report.maxDistance).toBeGreaterThan(0);
    expect(report.maxDistance).toBeLessThan(30);
    expect(report.ok, formatReport(report, "drifted")).toBe(true);
  });

  it("leaves an already-conformant master untouched and reports zero movement", () => {
    const { grid, report } = quantizeToPalette(decodePNG(pngOf(master)));
    expect(Array.from(grid.data)).toEqual(Array.from(master.data));
    expect(report.movedCount).toBe(0);
    expect(report.farMoves).toEqual([]);
    expect(report.colorCount).toBeLessThanOrEqual(MAX_FRAME_COLORS);
  });

  it("has a warm-neutral step for flesh, so faces stop landing on metal or grey", () => {
    // The tones an outside master paints skin with, from the generator briefs.
    const flesh = ["#cbb097", "#b79a7c", "#8d7358", "#e0cbad"];
    for (const hex of flesh) {
      const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)) as [
        number,
        number,
        number,
      ];
      const source = { width: 1, height: 1, data: new Uint8ClampedArray([r, g, b, 255]) };
      const { grid } = quantizeToPalette(source);
      const landed = INDEXED_PALETTE[grid.data[0] ?? 0];
      expect(RAMPS.bone as readonly string[], `${hex} -> ${landed}`).toContain(landed);
    }
  });

  it("reports violations instead of repairing them", () => {
    // A master with a hole punched in the torso: the outline is now open.
    const holed: PixelGrid = { ...master, data: Uint8Array.from(master.data) };
    for (let y = 40; y < 48; y += 1) {
      for (let x = 28; x < 36; x += 1) holed.data[y * SPRITE_WIDTH + x] = TRANSPARENT;
    }
    const report = auditGrid(holed);
    expect(report.ok).toBe(false);
    expect(report.outlineGaps.length).toBeGreaterThan(0);
    // The grid is not modified: reporting is the whole contract.
    expect(holed.data[42 * SPRITE_WIDTH + 30]).toBe(TRANSPARENT);
    expect(formatReport(report, "holed")).toContain("REJECTED");
  });

  it("flags an over-budget amber master rather than dimming it", () => {
    const lit: PixelGrid = { ...master, data: Uint8Array.from(master.data) };
    const amber = paletteIndex(PALETTE["amber-500"]);
    let painted = 0;
    for (let i = 0; i < lit.data.length && painted <= AMBER_BUDGET + 20; i += 1) {
      if (lit.data[i] === TRANSPARENT || lit.data[i] === OUTLINE_INDEX) continue;
      lit.data[i] = amber;
      painted += 1;
    }
    const report = auditGrid(lit);
    expect(report.amberPixels).toBeGreaterThan(AMBER_BUDGET);
    expect(report.errors.join(" ")).toContain("amber");
  });

  it("warns when drift is wide enough to change a decision", () => {
    // soot-900 and umber-900 are ~12 units apart; a master whose blacks wander
    // further than half that has its *outline* reassigned, and every downstream
    // check then fails for the wrong reason. The quantizer says so.
    const { report } = quantizeToPalette(decodePNG(pngOf(master, 4)));
    expect(report.ambiguous.length).toBeGreaterThan(0);
    expect(report.warnings.join(" ")).toContain("margin smaller than the move");
    expect(report.ambiguous.some((p) => p.runnerUp === PALETTE["soot-900"] || p.to === PALETTE["soot-900"])).toBe(true);
    expect(formatReport(report, "drifted")).toContain("ambiguous");
  });

  it("honors an allowed palette subset, so a job's twelve colors stay put", () => {
    const subset = [PALETTE["soot-900"], PALETTE["soot-500"], PALETTE["soot-300"]];
    const { grid } = quantizeToPalette(decodePNG(pngOf(master, 4)), { allowed: subset });
    const used = [...distinctColors(grid)].map((index) => INDEXED_PALETTE[index]);
    expect(new Set(used)).toEqual(new Set(subset));
  });

  it("swaps only the tint indices when retinting", () => {
    const player = jobFrame({ jobId: "saboteur", team: "player", state: "idle", view: "se", frame: 0 });
    const enemy = jobFrame({ jobId: "saboteur", team: "enemy", state: "idle", view: "se", frame: 0 });
    const swapped = retint(
      player,
      [tintIndices("player").base, tintIndices("player").shadow],
      [tintIndices("enemy").base, tintIndices("enemy").shadow],
    );
    expect(Array.from(swapped.data)).toEqual(Array.from(enemy.data));
  });
});

describe("segmentation", () => {
  it("partitions the canvas without overlap and claims every body pixel", () => {
    const build = JOB_ART.enforcer.build;
    const map = defaultRegionMap(build, "se", { state: "idle", frame: 0 });
    const names = map.segments.map((s) => s.name);
    expect(new Set(names)).toEqual(new Set(SEGMENT_NAMES.filter((n) => n !== "prop")));

    const seen = new Uint8Array(SPRITE_WIDTH * SPRITE_HEIGHT);
    for (const segment of map.segments) {
      for (let y = segment.rect.y; y < segment.rect.y + segment.rect.h; y += 1) {
        for (let x = segment.rect.x; x < segment.rect.x + segment.rect.w; x += 1) {
          expect(seen[y * SPRITE_WIDTH + x], `${segment.name} overlaps at ${x},${y}`).toBe(0);
          seen[y * SPRITE_WIDTH + x] = 1;
        }
      }
    }
    for (let y = 0; y <= FIGURE_BOX_BOTTOM; y += 1) {
      for (let x = 0; x < SPRITE_WIDTH; x += 1) {
        expect(seen[y * SPRITE_WIDTH + x], `row ${y} col ${x} uncovered`).toBe(1);
      }
    }
  });

  it("drops the master's outline on the way in, so it can be re-derived", () => {
    const grid = jobFrame({ jobId: "enforcer", team: "player", state: "idle", view: "se", frame: 0 });
    const map = defaultRegionMap(JOB_ART.enforcer.build, "se", { state: "idle", frame: 0 });
    const pieces = cutMaster(grid, map);
    for (const piece of pieces) {
      for (const pixel of piece.pixels) expect(pixel.value).not.toBe(OUTLINE_INDEX);
    }
    const kept = pieces.reduce((n, piece) => n + piece.pixels.length, 0);
    const outline = histogram(grid).get(OUTLINE_INDEX) ?? 0;
    expect(kept).toBe(opaqueCount(grid) - outline);
  });
});

/** The two masters kept as fallback content, imported as if they were foreign. */
const FALLBACK = ["enforcer", "saboteur"] as const;

const importFallback = (jobId: (typeof FALLBACK)[number]) => {
  const art = JOB_ART[jobId];
  const se = jobFrame({ jobId, team: "player", state: "idle", view: "se", frame: 0 });
  const ne = jobFrame({ jobId, team: "player", state: "idle", view: "ne", frame: 0 });
  // Gear that crosses the torso/leg split has to be cut first or it tears.
  const prop =
    jobId === "enforcer"
      ? {
          // Shield across the hips, maul off the near hand.
          se: [propRegion(10, 38, 30, 32, "hip"), propRegion(44, 16, 20, 18, "handNear")],
          ne: [propRegion(10, 38, 30, 32, "hip"), propRegion(44, 16, 20, 18, "handNear")],
        }
      : { se: [propRegion(6, 48, 24, 24, "hip")], ne: [propRegion(34, 48, 24, 24, "hip")] };
  return importExternalMaster({
    id: jobId,
    build: art.build,
    views: { se: decodePNG(pngOf(se, 1)), ne: decodePNG(pngOf(ne, 1)) },
    prop,
    ...(art.posePass ? { posePass: art.posePass } : {}),
  });
};

describe("external masters become full animations", () => {
  for (const jobId of FALLBACK) {
    describe(jobId, () => {
      const imported = importFallback(jobId);
      const frames = everyExternalFrame(imported.master);

      it("conforms on intake", () => {
        expect(imported.ok, imported.summary).toBe(true);
        for (const view of ["se", "ne"] as const) {
          expect(imported.reports[view].movedCount).toBeGreaterThan(0);
          expect(imported.reports[view].figureBottom).toBe(SPRITE_ANCHOR.y - 1);
        }
      });

      it("derives every frame the tick tables declare", () => {
        expect(frames).toHaveLength(DRAWN_FRAMES_PER_JOB);
        for (const state of ["idle", "walk", "attack", "cast", "hurt", "downed"] as const) {
          expect(frames.filter((f) => f.state === state && f.view === "se")).toHaveLength(
            ANIMATIONS[state].frames,
          );
        }
      });

      it("keeps §3: canvas, anchor, sub-floor band, palette validity", () => {
        for (const { state, view, frame, grid } of frames) {
          const where = `${jobId}/${state}/${view}/${frame}`;
          expect(grid.width, where).toBe(SPRITE_WIDTH);
          expect(grid.height, where).toBe(SPRITE_HEIGHT);
          const bounds = gridBounds(grid);
          expect(bounds, where).not.toBeNull();
          for (const value of grid.data) {
            if (value === TRANSPARENT) continue;
            expect(INDEXED_PALETTE[value], `${where}:${value}`).toBeTruthy();
          }
          let figureBottom = -1;
          for (let y = 0; y <= FIGURE_BOX_BOTTOM; y += 1) {
            for (let x = 0; x < SPRITE_WIDTH; x += 1) {
              if (gridGet(grid, x, y) !== TRANSPARENT) figureBottom = y;
            }
          }
          expect(figureBottom, where).toBe(SPRITE_ANCHOR.y - 1);
          for (let y = SPRITE_ANCHOR.y; y < SPRITE_HEIGHT; y += 1) {
            for (let x = 0; x < SPRITE_WIDTH; x += 1) {
              const value = gridGet(grid, x, y);
              if (value !== TRANSPARENT) expect(value, `${where} band`).toBe(OUTLINE_INDEX);
            }
          }
        }
      });

      it("keeps §2 and §3: color budget, amber budget, closed outline", () => {
        const edge = new Set([OUTLINE_INDEX, ...HALO_INDICES]);
        for (const { state, view, frame, grid } of frames) {
          const where = `${jobId}/${state}/${view}/${frame}`;
          expect(distinctColors(grid).size, where).toBeLessThanOrEqual(MAX_FRAME_COLORS);
          const counts = histogram(grid);
          let amber = 0;
          for (const [index, count] of counts) if (AMBER_INDICES.has(index)) amber += count;
          expect(amber, where).toBeLessThanOrEqual(AMBER_BUDGET);
          expect(counts.get(OUTLINE_INDEX) ?? 0, where).toBeGreaterThan(20);

          const sample = (x: number, y: number): number =>
            y > FIGURE_BOX_BOTTOM ? OUTLINE_INDEX : gridGet(grid, x, y);
          for (let y = 0; y <= FIGURE_BOX_BOTTOM; y += 1) {
            for (let x = 0; x < SPRITE_WIDTH; x += 1) {
              const value = gridGet(grid, x, y);
              if (value === TRANSPARENT || edge.has(value)) continue;
              let open = x === 0 || y === 0 || x === SPRITE_WIDTH - 1;
              for (let ny = -1; ny <= 1 && !open; ny += 1) {
                for (let nx = -1; nx <= 1; nx += 1) {
                  if (sample(x + nx, y + ny) === TRANSPARENT) open = true;
                }
              }
              expect(open, `${where} leak @${x},${y}`).toBe(false);
            }
          }
        }
      });

      it("animates: adjacent frames of a state differ", () => {
        for (const state of ["walk", "attack", "cast", "downed"] as const) {
          for (let frame = 1; frame < ANIMATIONS[state].frames; frame += 1) {
            const previous = deriveExternalFrame(imported.master, { state, view: "se", frame: frame - 1 });
            const current = deriveExternalFrame(imported.master, { state, view: "se", frame });
            expect(current.data, `${jobId}/${state}/${frame}`).not.toEqual(previous.data);
          }
        }
      });

      it("mirrors losslessly and keeps job mass near the centerline", () => {
        for (const { state, view, frame, grid } of frames) {
          const where = `${jobId}/${state}/${view}/${frame}`;
          const flipped = mirrorGrid(grid);
          expect(opaqueCount(flipped), where).toBe(opaqueCount(grid));
          expect(mirrorGrid(flipped).data, where).toEqual(grid.data);
        }
        const idle = deriveExternalFrame(imported.master, { state: "idle", view: "se", frame: 0 });
        let sum = 0;
        let count = 0;
        for (let y = 0; y <= FIGURE_BOX_BOTTOM; y += 1) {
          for (let x = 0; x < SPRITE_WIDTH; x += 1) {
            if (gridGet(idle, x, y) === TRANSPARENT) continue;
            sum += x - SPRITE_ANCHOR.x;
            count += 1;
          }
        }
        expect(Math.abs(sum / Math.max(1, count)), jobId).toBeLessThan(4);
      });

      it("carries the team tint, and retints without repainting the unit", () => {
        const base = paletteIndex(TEAM_TINT.player.base);
        for (const { state, view, frame, grid } of frames) {
          if (state === "hurt" && frame === 0) continue; // A.4 flash frame
          expect(histogram(grid).get(base) ?? 0, `${jobId}/${state}/${view}/${frame}`).toBeGreaterThan(0);
        }
        const enemy = retintMaster(imported.master, "player", "enemy");
        const player = deriveExternalFrame(imported.master, { state: "idle", view: "se", frame: 0 });
        const enemyFrame = deriveExternalFrame(enemy, { state: "idle", view: "se", frame: 0 });
        const allowed = new Set([
          paletteIndex(TEAM_TINT.player.base),
          paletteIndex(TEAM_TINT.player.shadow),
          paletteIndex(TEAM_TINT.enemy.base),
          paletteIndex(TEAM_TINT.enemy.shadow),
        ]);
        let differing = 0;
        for (let i = 0; i < player.data.length; i += 1) {
          const a = player.data[i] ?? 0;
          const b = enemyFrame.data[i] ?? 0;
          if (a === b) continue;
          differing += 1;
          expect(allowed.has(a) && allowed.has(b), `${jobId} @${i}`).toBe(true);
        }
        const share = differing / opaqueCount(player);
        expect(share, jobId).toBeGreaterThan(0.01);
        expect(share, jobId).toBeLessThan(0.14);
      });

      it("assembles into the frozen sheet layout", () => {
        const sheet = buildExternalSheet(imported.master);
        expect(sheet.width).toBe(SHEET_LAYOUT.width);
        expect(sheet.height).toBe(SHEET_LAYOUT.height);
        expect(opaqueCount(sheet)).toBeGreaterThan(DRAWN_FRAMES_PER_JOB * 100);
        // Padding columns beyond a state's frame count stay empty.
        for (let y = 0; y < SPRITE_HEIGHT; y += 1) {
          for (let x = 4 * SPRITE_WIDTH; x < SHEET_LAYOUT.width; x += 1) {
            expect(gridGet(sheet, x, y), `idle padding ${x},${y}`).toBe(TRANSPARENT);
          }
        }
      });

      it("reproduces the master at rest, up to the re-derived outline", () => {
        const original = jobFrame({ jobId, team: "player", state: "idle", view: "se", frame: 0 });
        const derived = deriveExternalFrame(imported.master, { state: "idle", view: "se", frame: 0 });
        let same = 0;
        let total = 0;
        for (let i = 0; i < original.data.length; i += 1) {
          if ((original.data[i] ?? 0) === TRANSPARENT && (derived.data[i] ?? 0) === TRANSPARENT) continue;
          total += 1;
          if (original.data[i] === derived.data[i]) same += 1;
        }
        expect(same / total, `${jobId} rest fidelity`).toBeGreaterThan(0.98);
      });
    });
  }
});
