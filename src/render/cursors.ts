// The pointer's own vocabulary. The board answers to two gestures that must not
// look alike: the middle button slides it, which the browser already has a hand
// for, and the right button turns it, which has no stock cursor at all. So this
// draws one — a circular arrow, in the chrome's own materials (UI_DESIGN §12.1:
// soot plate, light from directly above), as a data URI with a centred hotspot.
//
// Procedural and placeholder-grade on purpose: no asset, no dependency, and a
// delivered pixel cursor replaces `rotateCursorValue` without the controls
// hearing about it.

import { SOOT_100, SOOT_900 } from "../art/palette.js";

/** Cursor bitmaps are sized in CSS pixels, so this is the drawn size at 1x. */
export const ROTATE_CURSOR_SIZE = 32;
/** No image: the turn still has to read as a held button. */
export const ROTATE_CURSOR_FALLBACK = "grabbing";

const ARC_START = Math.PI * 0.35;
const ARC_END = Math.PI * 1.65;

const arrowHead = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  angle: number,
  sweep: number,
  size: number,
): void => {
  const tip = angle + sweep * 0.18;
  const tangent = tip + (sweep > 0 ? Math.PI / 2 : -Math.PI / 2);
  const tx = cx + Math.cos(tip) * radius;
  const ty = cy + Math.sin(tip) * radius;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(
    cx + Math.cos(angle) * (radius + size) - Math.cos(tangent) * 0,
    cy + Math.sin(angle) * (radius + size),
  );
  ctx.lineTo(cx + Math.cos(angle) * (radius - size), cy + Math.sin(angle) * (radius - size));
  ctx.closePath();
  ctx.fill();
};

/** One open ring with a head at each end: the board turns either way. */
const drawRotateGlyph = (ctx: CanvasRenderingContext2D, size: number): void => {
  const centre = size / 2;
  const radius = size * 0.3;
  const stroke = Math.max(2, Math.round(size * 0.09));
  const head = Math.max(3, Math.round(size * 0.13));

  ctx.lineCap = "butt";
  // Outline first, one step heavier, so the glyph reads on any board colour —
  // the same soot-900 ring the sprite and number pipelines draw (§7).
  for (const pass of [
    { color: SOOT_900, width: stroke + Math.max(2, Math.round(size * 0.06)), grow: 1 },
    { color: SOOT_100, width: stroke, grow: 0 },
  ]) {
    ctx.strokeStyle = pass.color;
    ctx.fillStyle = pass.color;
    ctx.lineWidth = pass.width;
    ctx.beginPath();
    ctx.arc(centre, centre, radius, ARC_START, ARC_END);
    ctx.stroke();
    arrowHead(ctx, centre, centre, radius, ARC_START, -1, head + pass.grow);
    arrowHead(ctx, centre, centre, radius, ARC_END, 1, head + pass.grow);
  }
};

const rotateGlyphDataUri = (pixels: number): string | null => {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = pixels;
    canvas.height = pixels;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.scale(pixels / ROTATE_CURSOR_SIZE, pixels / ROTATE_CURSOR_SIZE);
    drawRotateGlyph(ctx, ROTATE_CURSOR_SIZE);
    const url = canvas.toDataURL("image/png");
    return url.startsWith("data:image") ? url : null;
  } catch {
    return null;
  }
};

const cursorSupported = (value: string): boolean => {
  try {
    return globalThis.CSS?.supports?.("cursor", value) === true;
  } catch {
    return false;
  }
};

/**
 * A `cursor` value for the turn gesture, hotspot at the glyph's centre because
 * the thing being turned is under the pointer rather than beside it.
 *
 * A retina bitmap is only offered through `image-set`, which is the one form
 * that says "these are the same 32px cursor at a higher density"; a bare 64px
 * url would simply draw a cursor twice the size. Everything degrades: no
 * `image-set`, one drawn at 1x; no canvas at all, the plain closed hand.
 */
export const rotateCursorValue = (): string => {
  const hotspot = ROTATE_CURSOR_SIZE / 2;
  const ratio = Math.min(2, Math.max(1, Math.round(globalThis.devicePixelRatio ?? 1)));
  if (ratio > 1) {
    const retina = rotateGlyphDataUri(ROTATE_CURSOR_SIZE * ratio);
    if (retina !== null) {
      const value = `image-set(url("${retina}") ${ratio}x) ${hotspot} ${hotspot}, ${ROTATE_CURSOR_FALLBACK}`;
      if (cursorSupported(value)) return value;
    }
  }
  const url = rotateGlyphDataUri(ROTATE_CURSOR_SIZE);
  if (url === null) return ROTATE_CURSOR_FALLBACK;
  return `url("${url}") ${hotspot} ${hotspot}, ${ROTATE_CURSOR_FALLBACK}`;
};
