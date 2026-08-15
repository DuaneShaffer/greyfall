import { describe, expect, it } from "vitest";
import {
  DAMAGE_NUMBER_COLOR,
  DAMAGE_TYPE_VFX,
  EMISSIVE_COLORS,
  FACE_SHADE,
  HIGHLIGHT,
  OBJECT_STATE_PAINT,
  OPERABLE_AFFORDANCE_COLOR,
  PALETTE,
  PALETTE_SIZE,
  RAMPS,
  STATUS_CATEGORY_COLOR,
  STRATUM_LIGHT,
  TEAM_TINT,
  TERRAIN_COLOR,
  UI,
  hexToNumber,
  hexToRgb,
  isHex,
  relativeLuminance,
  shade,
  type Hex,
} from "../../src/art/palette.js";

const ALL = Object.values(PALETTE) as Hex[];
const ALL_SET = new Set<string>(ALL);

const DAMAGE_TYPES = ["kinetic", "arc", "thermal", "chemical"] as const;
const TERRAIN_TYPES = ["plain", "rail", "rough", "water", "impassable", "void"] as const;
const TEAMS = ["player", "enemy", "neutral"] as const;

function expectInPalette(color: string, where: string) {
  expect(ALL_SET.has(color), `${where}: ${color} is not a palette color`).toBe(true);
}

describe("palette integrity", () => {
  it("every entry is a valid lowercase 6-digit hex", () => {
    for (const [name, hex] of Object.entries(PALETTE)) {
      expect(isHex(hex), `${name} = ${hex}`).toBe(true);
      expect(hex).toBe(hex.toLowerCase());
    }
  });

  it("has no duplicate colors", () => {
    expect(ALL_SET.size).toBe(ALL.length);
  });

  it("stays at the frozen size", () => {
    expect(ALL.length).toBe(PALETTE_SIZE);
  });

  it("names follow the ramp-step or singleton convention", () => {
    for (const name of Object.keys(PALETTE)) {
      expect(name).toMatch(/^[a-z]+(-([0-9]{3}|glow))?$/);
    }
  });

  it("no two colors are perceptually identical", () => {
    for (let i = 0; i < ALL.length; i += 1) {
      for (let j = i + 1; j < ALL.length; j += 1) {
        const a = hexToRgb(ALL[i] as Hex);
        const b = hexToRgb(ALL[j] as Hex);
        const dist = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
        expect(dist, `${ALL[i]} vs ${ALL[j]}`).toBeGreaterThan(12);
      }
    }
  });
});

describe("ramps", () => {
  it("only contain palette colors", () => {
    for (const [name, steps] of Object.entries(RAMPS)) {
      for (const step of steps) expectInPalette(step, `ramp ${name}`);
    }
  });

  it("are ordered dark to light by relative luminance", () => {
    for (const [name, steps] of Object.entries(RAMPS)) {
      const lums = steps.map((s) => relativeLuminance(s));
      for (let i = 1; i < lums.length; i += 1) {
        expect(lums[i] as number, `${name} step ${i}`).toBeGreaterThan(lums[i - 1] as number);
      }
    }
  });

  it("have meaningful separation between adjacent steps", () => {
    for (const [name, steps] of Object.entries(RAMPS)) {
      for (let i = 1; i < steps.length; i += 1) {
        const delta = relativeLuminance(steps[i] as Hex) - relativeLuminance(steps[i - 1] as Hex);
        expect(delta, `${name} step ${i}`).toBeGreaterThan(0.003);
      }
    }
  });

  it("cover every palette color except the declared singletons", () => {
    const inRamps = new Set<string>(Object.values(RAMPS).flatMap((s) => [...s]));
    const singletons = ALL.filter((c) => !inRamps.has(c));
    expect(singletons.sort()).toEqual([PALETTE.brightblood, PALETTE.hazard].sort());
  });
});

describe("semantic colors resolve to the palette", () => {
  it("team tints", () => {
    for (const team of TEAMS) {
      const tint = TEAM_TINT[team];
      expectInPalette(tint.base, `${team}.base`);
      expectInPalette(tint.shadow, `${team}.shadow`);
      expectInPalette(tint.rim, `${team}.rim`);
      expect(relativeLuminance(tint.base)).toBeGreaterThan(relativeLuminance(tint.shadow));
    }
  });

  it("team bases are mutually distinguishable", () => {
    const bases = TEAMS.map((t) => TEAM_TINT[t].base);
    expect(new Set(bases).size).toBe(TEAMS.length);
  });

  it("terrain colors cover every terrain type", () => {
    for (const terrain of TERRAIN_TYPES) {
      const paint = TERRAIN_COLOR[terrain];
      expect(paint, terrain).toBeDefined();
      expectInPalette(paint.top, `${terrain}.top`);
      expectInPalette(paint.side, `${terrain}.side`);
      expectInPalette(paint.accent, `${terrain}.accent`);
      if (paint.strataLine !== null) expectInPalette(paint.strataLine, `${terrain}.strataLine`);
    }
  });

  it("impassable and void have no strata line, everything drawn does", () => {
    expect(TERRAIN_COLOR.impassable.strataLine).toBeNull();
    expect(TERRAIN_COLOR.void.strataLine).toBeNull();
    expect(TERRAIN_COLOR.void.drawn).toBe(false);
    for (const terrain of ["plain", "rail", "rough", "water"] as const) {
      expect(TERRAIN_COLOR[terrain].strataLine, terrain).not.toBeNull();
    }
  });

  it("damage type vfx cover every damage type", () => {
    for (const type of DAMAGE_TYPES) {
      const vfx = DAMAGE_TYPE_VFX[type];
      expectInPalette(vfx.core, `${type}.core`);
      expectInPalette(vfx.body, `${type}.body`);
      expectInPalette(vfx.spread, `${type}.spread`);
      expect(vfx.frames).toBeGreaterThan(0);
      expect(vfx.ticksPerFrame).toBeGreaterThan(0);
      expect(relativeLuminance(vfx.core)).toBeGreaterThan(relativeLuminance(vfx.spread));
    }
  });

  it("arc is the fastest vfx, chemical the slowest", () => {
    const rates = DAMAGE_TYPES.map((t) => DAMAGE_TYPE_VFX[t].ticksPerFrame);
    expect(Math.min(...rates)).toBe(DAMAGE_TYPE_VFX.arc.ticksPerFrame);
    expect(Math.max(...rates)).toBe(DAMAGE_TYPE_VFX.chemical.ticksPerFrame);
  });

  it("ui, highlight, status, object-state and damage-number tokens", () => {
    for (const [k, v] of Object.entries(UI)) expectInPalette(v, `ui.${k}`);
    for (const [k, v] of Object.entries(HIGHLIGHT)) expectInPalette(v, `highlight.${k}`);
    for (const [k, v] of Object.entries(STATUS_CATEGORY_COLOR)) {
      expectInPalette(v, `status.${k}`);
    }
    for (const [k, v] of Object.entries(DAMAGE_NUMBER_COLOR)) {
      expectInPalette(v, `damageNumber.${k}`);
    }
    for (const [state, paint] of Object.entries(OBJECT_STATE_PAINT)) {
      expectInPalette(paint.seam, `${state}.seam`);
      expectInPalette(paint.core, `${state}.core`);
      if (paint.halo !== null) expectInPalette(paint.halo, `${state}.halo`);
    }
    for (const [k, v] of Object.entries(STRATUM_LIGHT)) {
      expectInPalette(v.ambient, `stratum.${k}.ambient`);
      expectInPalette(v.key, `stratum.${k}.key`);
    }
  });

  it("status categories are mutually distinct", () => {
    const values = Object.values(STATUS_CATEGORY_COLOR);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("binding art rules encoded in the palette", () => {
  it("only emissive colors are bloom-eligible and they are the lightest of their ramps", () => {
    expect(EMISSIVE_COLORS).toEqual([PALETTE["amber-glow"], PALETTE["overload-100"], PALETTE["veinglass-100"]]);
    expect(RAMPS.amber.at(-1)).toBe(PALETTE["amber-glow"]);
    expect(RAMPS.overload.at(-1)).toBe(PALETTE["overload-100"]);
    expect(RAMPS.veinglass.at(-1)).toBe(PALETTE["veinglass-100"]);
  });

  it("the operable affordance color is copper-500 and unused by terrain", () => {
    expect(OPERABLE_AFFORDANCE_COLOR).toBe(PALETTE["copper-500"]);
    for (const terrain of TERRAIN_TYPES) {
      const paint = TERRAIN_COLOR[terrain];
      expect([paint.top, paint.side, paint.accent]).not.toContain(OPERABLE_AFFORDANCE_COLOR);
    }
  });

  it("the player tint is the only team color absent from the world ramps", () => {
    const worldRamps = [
      ...RAMPS.soot,
      ...RAMPS.umber,
      ...RAMPS.copper,
      ...RAMPS.verdigris,
      ...RAMPS.amber,
      ...RAMPS.overload,
      ...RAMPS.veinglass,
      ...RAMPS.blood,
    ] as readonly string[];
    expect(worldRamps).not.toContain(TEAM_TINT.player.base);
    expect(worldRamps).toContain(TEAM_TINT.enemy.base);
    expect(worldRamps).toContain(TEAM_TINT.neutral.base);
  });

  it("face shading is ordered top > north/south > east/west", () => {
    expect(FACE_SHADE.top).toBeGreaterThan(FACE_SHADE.sideNorthSouth);
    expect(FACE_SHADE.sideNorthSouth).toBeGreaterThan(FACE_SHADE.sideEastWest);
    expect(FACE_SHADE.top).toBe(1);
  });
});

describe("color helpers", () => {
  it("round-trips hex through rgb", () => {
    for (const hex of ALL) {
      const [r, g, b] = hexToRgb(hex);
      expect(shade(hex, 1)).toBe(hex);
      expect(hexToNumber(hex)).toBe((r << 16) | (g << 8) | b);
    }
  });

  it("shade darkens without leaving the byte range", () => {
    const shaded = shade(PALETTE["soot-500"], FACE_SHADE.sideEastWest);
    expect(isHex(shaded)).toBe(true);
    expect(relativeLuminance(shaded)).toBeLessThan(relativeLuminance(PALETTE["soot-500"]));
    expect(shade(PALETTE["amber-glow"], 2)).toBe("#ffffff");
    expect(shade(PALETTE["amber-glow"], 0)).toBe("#000000");
  });

  it("rejects non-hex input", () => {
    expect(isHex("#FFF")).toBe(false);
    expect(isHex("#FFEE00")).toBe(false);
    expect(() => hexToRgb("nope" as Hex)).toThrow();
  });
});
