import { describe, expect, it } from "vitest";
import { jobFrame } from "../../src/art/jobs.js";
import { contentBounds, fitMasterToCanvas, resampleRGBA } from "../../src/art/ingest.js";
import { decodePNG, encodePNG } from "../../src/art/png.js";
import { buildJobSheet } from "../../src/art/sheet.js";
import { SPRITE_ANCHOR, SPRITE_HEIGHT, SPRITE_WIDTH } from "../../src/art/sprites.js";
import { FALLBACK, coveredFallbackJobs, toRGBA } from "./ingestSuite.js";

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

describe("fitting a delivered master", () => {
  /** A 4x-scale delivery: a figure block with a foot, on a wide transparent field. */
  const delivery = (() => {
    const width = 400;
    const height = 600;
    const data = new Uint8ClampedArray(width * height * 4);
    const put = (x: number, y: number, r: number, g: number, b: number) => {
      const at = (y * width + x) * 4;
      data[at] = r;
      data[at + 1] = g;
      data[at + 2] = b;
      data[at + 3] = 255;
    };
    for (let y = 100; y < 500; y += 1) {
      for (let x = 150; x < 250; x += 1) put(x, y, 120, 90, 60);
    }
    // A four-pixel-tall sole at the very bottom, the thing a bad reduction eats.
    for (let y = 496; y < 500; y += 1) {
      for (let x = 140; x < 260; x += 1) put(x, y, 20, 20, 24);
    }
    return { width, height, data };
  })();

  it("measures the figure rather than trusting the canvas", () => {
    const bounds = contentBounds(delivery, { x: 0, y: 0, w: 400, h: 600 }, 127);
    expect(bounds).toEqual({ x: 140, y: 100, w: 120, h: 400 });
  });

  it("stands the figure on the anchor, centered on the seam", () => {
    const fitted = fitMasterToCanvas(delivery);
    expect(fitted.width).toBe(SPRITE_WIDTH);
    expect(fitted.height).toBe(SPRITE_HEIGHT);
    const alpha = (x: number, y: number) => fitted.data[(y * SPRITE_WIDTH + x) * 4 + 3] ?? 0;
    let bottom = -1;
    let left = SPRITE_WIDTH;
    let right = -1;
    for (let y = 0; y < SPRITE_HEIGHT; y += 1) {
      for (let x = 0; x < SPRITE_WIDTH; x += 1) {
        if (alpha(x, y) === 0) continue;
        bottom = Math.max(bottom, y);
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
    expect(bottom).toBe(SPRITE_ANCHOR.y - 1);
    expect(Math.abs((left + right) / 2 - (SPRITE_ANCHOR.x - 0.5))).toBeLessThanOrEqual(1);
    // Alpha is binary: §3 has no partial coverage.
    for (let i = 3; i < fitted.data.length; i += 4) {
      expect(fitted.data[i] === 0 || fitted.data[i] === 255).toBe(true);
    }
  });

  it("keeps thin detail through the reduction instead of averaging it away", () => {
    const fitted = fitMasterToCanvas(delivery);
    // The dark sole is 1% of the figure's height; it must still be there.
    let dark = 0;
    for (let i = 0; i < SPRITE_WIDTH * SPRITE_HEIGHT; i += 1) {
      if ((fitted.data[i * 4 + 3] ?? 0) === 0) continue;
      if ((fitted.data[i * 4] ?? 0) < 60) dark += 1;
    }
    expect(dark).toBeGreaterThan(0);
  });

  it("resamples with alpha weighting, so transparency cannot tint a neighbour", () => {
    const source = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 0]),
    };
    const out = resampleRGBA(source, 1, 1);
    expect(Array.from(out.data.slice(0, 3))).toEqual([255, 0, 0]);
    expect(out.data[3]).toBe(128);
  });
});

describe("external master shards", () => {
  it("covers every fallback job in a file of its own", () => {
    expect(coveredFallbackJobs()).toEqual(new Set(FALLBACK));
  });
});
