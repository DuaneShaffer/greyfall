// PNG in and out with no dependencies and no Node builtins, so the same code
// runs in the browser preview, in vitest, and in a build script. Only what the
// sprite pipeline needs: 8-bit RGBA/RGB/grey/indexed decode, RGBA encode.
//
// Encoding uses stored (uncompressed) DEFLATE blocks. A 32x48 master is 6 KB
// either way, and a compressor is a lot of code to maintain for nothing.

export interface RGBAImage {
  readonly width: number;
  readonly height: number;
  /** RGBA, 4 bytes per pixel, row-major, top-left origin. */
  readonly data: Uint8ClampedArray;
}

const u8 = (a: Uint8Array, i: number): number => a[i] ?? 0;
const i32 = (a: Int32Array, i: number): number => a[i] ?? 0;

// ---------------------------------------------------------------------------
// DEFLATE (RFC 1951) — decode only, in the "puff" shape.
// ---------------------------------------------------------------------------

class BitReader {
  private at = 0;
  private bitBuffer = 0;
  private bitCount = 0;

  constructor(private readonly src: Uint8Array) {}

  bit(): number {
    if (this.bitCount === 0) {
      if (this.at >= this.src.length) throw new Error("deflate: out of input");
      this.bitBuffer = u8(this.src, this.at);
      this.at += 1;
      this.bitCount = 8;
    }
    const value = this.bitBuffer & 1;
    this.bitBuffer >>= 1;
    this.bitCount -= 1;
    return value;
  }

  bits(n: number): number {
    let value = 0;
    for (let i = 0; i < n; i += 1) value |= this.bit() << i;
    return value;
  }

  /** Drop to the next byte boundary and read `n` raw bytes. */
  bytes(n: number): Uint8Array {
    this.bitCount = 0;
    const out = this.src.subarray(this.at, this.at + n);
    this.at += n;
    return out;
  }

  alignedU16(): number {
    this.bitCount = 0;
    const value = u8(this.src, this.at) | (u8(this.src, this.at + 1) << 8);
    this.at += 2;
    return value;
  }
}

interface Huffman {
  readonly counts: Int32Array;
  readonly symbols: Int32Array;
}

function construct(lengths: ArrayLike<number>, n: number): Huffman {
  const counts = new Int32Array(16);
  for (let i = 0; i < n; i += 1) counts[lengths[i] ?? 0] = i32(counts, lengths[i] ?? 0) + 1;
  counts[0] = 0;
  const offsets = new Int32Array(16);
  for (let len = 1; len < 16; len += 1) {
    offsets[len] = i32(offsets, len - 1) + i32(counts, len - 1);
  }
  const symbols = new Int32Array(n);
  for (let i = 0; i < n; i += 1) {
    const len = lengths[i] ?? 0;
    if (len === 0) continue;
    symbols[i32(offsets, len)] = i;
    offsets[len] = i32(offsets, len) + 1;
  }
  return { counts, symbols };
}

function decodeSymbol(br: BitReader, h: Huffman): number {
  let code = 0;
  let first = 0;
  let index = 0;
  for (let len = 1; len < 16; len += 1) {
    code |= br.bit();
    const count = i32(h.counts, len);
    if (code - first < count) return i32(h.symbols, index + (code - first));
    index += count;
    first = (first + count) << 1;
    code <<= 1;
  }
  throw new Error("deflate: bad huffman code");
}

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

const FIXED_LITERALS = (() => {
  const lengths = new Uint8Array(288);
  lengths.fill(8, 0, 144);
  lengths.fill(9, 144, 256);
  lengths.fill(7, 256, 280);
  lengths.fill(8, 280, 288);
  return construct(lengths, 288);
})();
const FIXED_DISTANCES = construct(new Uint8Array(30).fill(5), 30);

function inflateRaw(src: Uint8Array): Uint8Array {
  const br = new BitReader(src);
  const out: number[] = [];
  for (;;) {
    const final = br.bit();
    const type = br.bits(2);
    if (type === 0) {
      const len = br.alignedU16();
      br.alignedU16();
      for (const byte of br.bytes(len)) out.push(byte);
    } else {
      let literals = FIXED_LITERALS;
      let distances = FIXED_DISTANCES;
      if (type === 2) {
        const hlit = br.bits(5) + 257;
        const hdist = br.bits(5) + 1;
        const hclen = br.bits(4) + 4;
        const codeLengths = new Uint8Array(19);
        for (let i = 0; i < hclen; i += 1) {
          codeLengths[CODE_LENGTH_ORDER[i] ?? 0] = br.bits(3);
        }
        const codeTable = construct(codeLengths, 19);
        const lengths = new Uint8Array(hlit + hdist);
        let at = 0;
        while (at < hlit + hdist) {
          const symbol = decodeSymbol(br, codeTable);
          if (symbol < 16) {
            lengths[at] = symbol;
            at += 1;
          } else if (symbol === 16) {
            const previous = lengths[at - 1] ?? 0;
            let repeat = 3 + br.bits(2);
            while (repeat > 0) {
              lengths[at] = previous;
              at += 1;
              repeat -= 1;
            }
          } else {
            let repeat = symbol === 17 ? 3 + br.bits(3) : 11 + br.bits(7);
            while (repeat > 0) {
              lengths[at] = 0;
              at += 1;
              repeat -= 1;
            }
          }
        }
        literals = construct(lengths.subarray(0, hlit), hlit);
        distances = construct(lengths.subarray(hlit), hdist);
      } else if (type === 3) {
        throw new Error("deflate: reserved block type");
      }
      for (;;) {
        const symbol = decodeSymbol(br, literals);
        if (symbol === 256) break;
        if (symbol < 256) {
          out.push(symbol);
          continue;
        }
        const li = symbol - 257;
        const length = (LENGTH_BASE[li] ?? 0) + br.bits(LENGTH_EXTRA[li] ?? 0);
        const di = decodeSymbol(br, distances);
        const distance = (DIST_BASE[di] ?? 0) + br.bits(DIST_EXTRA[di] ?? 0);
        const from = out.length - distance;
        if (from < 0) throw new Error("deflate: distance before start");
        for (let i = 0; i < length; i += 1) out.push(out[from + i] ?? 0);
      }
    }
    if (final) break;
  }
  return Uint8Array.from(out);
}

/** zlib container (RFC 1950) around a deflate stream. */
function inflateZlib(src: Uint8Array): Uint8Array {
  if (src.length < 2) throw new Error("zlib: truncated");
  if ((u8(src, 0) & 0x0f) !== 8) throw new Error("zlib: not deflate");
  if ((u8(src, 0) * 256 + u8(src, 1)) % 31 !== 0) throw new Error("zlib: bad header check");
  if ((u8(src, 1) & 0x20) !== 0) throw new Error("zlib: preset dictionary unsupported");
  return inflateRaw(src.subarray(2));
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function deflateStored(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [];
  const max = 65535;
  let at = 0;
  do {
    const size = Math.min(max, data.length - at);
    const final = at + size >= data.length ? 1 : 0;
    const header = new Uint8Array(5);
    header[0] = final;
    header[1] = size & 0xff;
    header[2] = (size >> 8) & 0xff;
    header[3] = ~size & 0xff;
    header[4] = (~size >> 8) & 0xff;
    blocks.push(header, data.subarray(at, at + size));
    at += size;
  } while (at < data.length);
  const checksum = adler32(data);
  const total = blocks.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(2 + total + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let write = 2;
  for (const block of blocks) {
    out.set(block, write);
    write += block.length;
  }
  out[write] = (checksum >>> 24) & 0xff;
  out[write + 1] = (checksum >>> 16) & 0xff;
  out[write + 2] = (checksum >>> 8) & 0xff;
  out[write + 3] = checksum & 0xff;
  return out;
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of buf) c = (table32(CRC_TABLE, (c ^ byte) & 0xff) ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

const table32 = (a: Uint32Array, i: number): number => a[i] ?? 0;

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function decodePNG(bytes: Uint8Array): RGBAImage {
  for (let i = 0; i < SIGNATURE.length; i += 1) {
    if (u8(bytes, i) !== SIGNATURE[i]) throw new Error("png: bad signature");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let palette: Uint8Array | null = null;
  let alphaTable: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (at < bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(
      u8(bytes, at + 4),
      u8(bytes, at + 5),
      u8(bytes, at + 6),
      u8(bytes, at + 7),
    );
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      depth = u8(bytes, at + 16);
      colorType = u8(bytes, at + 17);
      if (u8(bytes, at + 20) !== 0) throw new Error("png: interlacing unsupported");
    } else if (type === "PLTE") {
      palette = Uint8Array.from(body);
    } else if (type === "tRNS") {
      alphaTable = Uint8Array.from(body);
    } else if (type === "IDAT") {
      idat.push(Uint8Array.from(body));
    } else if (type === "IEND") {
      break;
    }
    at += 12 + length;
  }
  if (depth !== 8) throw new Error(`png: only 8-bit depth supported, got ${depth}`);
  const channels = CHANNELS[colorType];
  if (channels === undefined) throw new Error(`png: color type ${colorType} unsupported`);

  const packed = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  let write = 0;
  for (const chunk of idat) {
    packed.set(chunk, write);
    write += chunk.length;
  }
  const raw = inflateZlib(packed);

  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);
  let read = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = u8(raw, read);
    read += 1;
    const rowAt = y * stride;
    const priorAt = rowAt - stride;
    for (let x = 0; x < stride; x += 1) {
      const value = u8(raw, read + x);
      const a = x >= channels ? u8(pixels, rowAt + x - channels) : 0;
      const b = y > 0 ? u8(pixels, priorAt + x) : 0;
      const c = y > 0 && x >= channels ? u8(pixels, priorAt + x - channels) : 0;
      let out = value;
      if (filter === 1) out = value + a;
      else if (filter === 2) out = value + b;
      else if (filter === 3) out = value + ((a + b) >> 1);
      else if (filter === 4) out = value + paeth(a, b, c);
      else if (filter !== 0) throw new Error(`png: bad filter ${filter}`);
      pixels[rowAt + x] = out & 0xff;
    }
    read += stride;
  }

  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const src = i * channels;
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 255;
    if (colorType === 0) {
      r = g = b = u8(pixels, src);
    } else if (colorType === 4) {
      r = g = b = u8(pixels, src);
      a = u8(pixels, src + 1);
    } else if (colorType === 2) {
      r = u8(pixels, src);
      g = u8(pixels, src + 1);
      b = u8(pixels, src + 2);
    } else if (colorType === 6) {
      r = u8(pixels, src);
      g = u8(pixels, src + 1);
      b = u8(pixels, src + 2);
      a = u8(pixels, src + 3);
    } else {
      const index = u8(pixels, src);
      if (!palette) throw new Error("png: indexed image without PLTE");
      r = u8(palette, index * 3);
      g = u8(palette, index * 3 + 1);
      b = u8(palette, index * 3 + 2);
      a = alphaTable ? (alphaTable[index] ?? 255) : 255;
    }
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { width, height, data };
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  view.setUint32(body.length + 8, crc32(out.subarray(4, body.length + 8)));
  return out;
}

export function encodePNG(image: RGBAImage): Uint8Array {
  const stride = image.width * 4;
  const raw = new Uint8Array((stride + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    raw[y * (stride + 1)] = 0;
    raw.set(image.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, image.width);
  view.setUint32(4, image.height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const parts = [
    Uint8Array.from(SIGNATURE),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateStored(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let write = 0;
  for (const part of parts) {
    out.set(part, write);
    write += part.length;
  }
  return out;
}
