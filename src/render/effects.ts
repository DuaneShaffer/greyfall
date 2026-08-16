// The VFX language of ART_DIRECTION §7 as data plus geometry math: one damage
// type, one color logic, one tick table, no overlap. Pure — `vfxLayer.ts` turns
// what this returns into meshes.

import { DAMAGE_TYPE_VFX } from "../art/palette.js";
import { TICKS_PER_SECOND } from "../art/sprites.js";
import type { DamageType } from "../data/schemas/common.js";
import type { TerrainType } from "../data/schemas/map.js";

export interface ImpactTiming {
  readonly frames: number;
  readonly ticksPerFrame: number;
  readonly ticks: number;
  readonly seconds: number;
}

const timingOf = (type: DamageType): ImpactTiming => {
  const vfx = DAMAGE_TYPE_VFX[type];
  const ticks = vfx.frames * vfx.ticksPerFrame;
  return {
    frames: vfx.frames,
    ticksPerFrame: vfx.ticksPerFrame,
    ticks,
    seconds: ticks / TICKS_PER_SECOND,
  };
};

export const IMPACT_TIMING: Record<DamageType, ImpactTiming> = {
  kinetic: timingOf("kinetic"),
  arc: timingOf("arc"),
  thermal: timingOf("thermal"),
  chemical: timingOf("chemical"),
};

/** Which animation frame an effect is showing, clamped to its last. */
export const impactFrame = (type: DamageType, elapsedSeconds: number): number => {
  const timing = IMPACT_TIMING[type];
  const tick = Math.max(0, elapsedSeconds) * TICKS_PER_SECOND;
  return Math.min(timing.frames - 1, Math.floor(tick / timing.ticksPerFrame));
};

/** Chemical is the only effect that lives in tile space after it plays. */
export const persistsOnTile = (type: DamageType): boolean => type === "chemical";

/** How long a chemical cloud loops on its tile before it lifts. */
export const CHEMICAL_LINGER_SECONDS = 2.4;

/** Wet and metal ground takes an arc flash (ART_DIRECTION §7). */
export const conductiveTerrain = (terrain: TerrainType): boolean =>
  terrain === "water" || terrain === "rail";

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Deterministic in [0, 1) from a pair of world coordinates. */
const jitter = (seed: number): number => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * An arc chain: straight segments only, never curves. Interior joints step off
 * the direct line alternately so the run reads as a snapped jag.
 */
export function jagPoints(from: Vec3, to: Vec3, segments = 3): Vec3[] {
  const legs = Math.max(1, Math.floor(segments));
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz) || 1;
  const nx = -dz / length;
  const nz = dx / length;
  const spread = Math.min(0.42, 0.16 + length * 0.06);
  const points: Vec3[] = [from];
  for (let i = 1; i < legs; i += 1) {
    const t = i / legs;
    const sign = i % 2 === 0 ? -1 : 1;
    const magnitude = spread * (0.5 + 0.5 * jitter(from.x + to.z + i));
    points.push({
      x: from.x + dx * t + nx * magnitude * sign,
      y: from.y + (to.y - from.y) * t + (magnitude * sign) / 2,
      z: from.z + dz * t + nz * magnitude * sign,
    });
  }
  points.push(to);
  return points;
}

/** Outward debris directions, biased along the blow when one is known. */
export function debrisDirections(count: number, along: Vec3 | null): Vec3[] {
  const n = Math.max(1, Math.floor(count));
  const bias = along === null ? 0 : Math.atan2(along.z, along.x);
  const out: Vec3[] = [];
  for (let i = 0; i < n; i += 1) {
    const spread = along === null ? Math.PI * 2 : Math.PI * 0.9;
    const angle = bias + (i / n - 0.5) * spread + (jitter(i + 1) - 0.5) * 0.5;
    const lift = 0.6 + jitter(i + 7) * 0.9;
    out.push({ x: Math.cos(angle), y: lift, z: Math.sin(angle) });
  }
  return out;
}
