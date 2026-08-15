import { describe, expect, it } from "vitest";
import {
  JOB_IDS,
  JOB_SILHOUETTES,
  buildPlaceholder,
  buildPlaceholderSet,
  drawShapes,
  drawToCanvas,
  placeholderColors,
  type Canvas2DLike,
  type JobId,
  type Shape,
} from "../../src/art/placeholders.js";
import {
  ANIMATIONS,
  ANIM_STATES,
  DRAWN_VIEWS,
  SPRITE_ANCHOR,
  SPRITE_HEIGHT,
  SPRITE_WIDTH,
} from "../../src/art/sprites.js";
import { PALETTE, TEAM_TINT, type Hex } from "../../src/art/palette.js";

const TEAMS = ["player", "enemy", "neutral"] as const;
const PALETTE_COLORS = new Set<string>(Object.values(PALETTE));

interface Call {
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function recordingContext(): { ctx: Canvas2DLike; calls: Call[] } {
  const calls: Call[] = [];
  const ctx: Canvas2DLike = {
    fillStyle: "",
    fillRect(x, y, w, h) {
      calls.push({ color: this.fillStyle, x, y, w, h });
    },
  };
  return { ctx, calls };
}

function signature(shapes: readonly Shape[]): string {
  return shapes.map((s) => `${s.role}:${s.x},${s.y},${s.w},${s.h},${s.color}`).join("|");
}

describe("job roster", () => {
  it("covers the seven slice jobs", () => {
    expect([...JOB_IDS]).toEqual([
      "enforcer",
      "machinist",
      "conduit",
      "saboteur",
      "chemist",
      "augmented",
      "railrunner",
    ]);
    for (const id of JOB_IDS) {
      expect(JOB_SILHOUETTES[id].jobId).toBe(id);
      expect(JOB_SILHOUETTES[id].read.length).toBeGreaterThan(0);
    }
  });

  it("gives each job a distinct build so silhouettes read apart", () => {
    const builds = JOB_IDS.map((id) => {
      const s = JOB_SILHOUETTES[id];
      return `${s.torsoWidth}:${s.headWidth}:${s.legWidth}:${s.pitch}:${s.props.length}`;
    });
    expect(new Set(builds).size).toBe(JOB_IDS.length);
  });

  it("keeps the Enforcer bulkiest and the Conduit/Railrunner slightest", () => {
    const widths = Object.fromEntries(
      JOB_IDS.map((id) => [id, JOB_SILHOUETTES[id].torsoWidth]),
    ) as Record<JobId, number>;
    expect(widths.enforcer).toBe(Math.max(...Object.values(widths)));
    expect(widths.conduit).toBeLessThan(widths.enforcer);
    expect(widths.railrunner).toBeLessThan(widths.enforcer);
    expect(JOB_SILHOUETTES.railrunner.pitch).toBeGreaterThan(JOB_SILHOUETTES.enforcer.pitch);
  });

  it("gives every job a weapon/tool block in both drawn views", () => {
    for (const id of JOB_IDS) {
      for (const view of DRAWN_VIEWS) {
        const props = JOB_SILHOUETTES[id].props.filter(
          (p) => p.views === "both" || p.views === view,
        );
        expect(props.some((p) => p.role === "weapon"), `${id}/${view}`).toBe(true);
      }
    }
  });
});

describe("placeholder generation", () => {
  it("produces every job x team x view x state", () => {
    for (const jobId of JOB_IDS) {
      for (const team of TEAMS) {
        for (const view of DRAWN_VIEWS) {
          for (const state of ANIM_STATES) {
            const clip = buildPlaceholder(jobId, team, state, view);
            expect(clip.jobId).toBe(jobId);
            expect(clip.team).toBe(team);
            expect(clip.state).toBe(state);
            expect(clip.view).toBe(view);
            expect(clip.width).toBe(SPRITE_WIDTH);
            expect(clip.height).toBe(SPRITE_HEIGHT);
            expect(clip.anchor).toEqual(SPRITE_ANCHOR);
            expect(clip.frames, `${jobId}/${state}`).toHaveLength(ANIMATIONS[state].frames);
            clip.frames.forEach((f, i) => expect(f.index).toBe(i));
          }
        }
      }
    }
  });

  it("buildPlaceholderSet returns one clip per animation state", () => {
    const set = buildPlaceholderSet("conduit", "player");
    expect(Object.keys(set).sort()).toEqual([...ANIM_STATES].sort());
    for (const state of ANIM_STATES) {
      expect(set[state].frames).toHaveLength(ANIMATIONS[state].frames);
    }
  });

  it("keeps every shape inside the canvas with positive integer geometry", () => {
    for (const jobId of JOB_IDS) {
      for (const team of TEAMS) {
        for (const view of DRAWN_VIEWS) {
          for (const state of ANIM_STATES) {
            for (const frame of buildPlaceholder(jobId, team, state, view).frames) {
              for (const s of frame.shapes) {
                const where = `${jobId}/${team}/${view}/${state}/${frame.index}`;
                expect(Number.isInteger(s.x) && Number.isInteger(s.y), where).toBe(true);
                expect(Number.isInteger(s.w) && Number.isInteger(s.h), where).toBe(true);
                expect(s.w, where).toBeGreaterThan(0);
                expect(s.h, where).toBeGreaterThan(0);
                expect(s.x, where).toBeGreaterThanOrEqual(0);
                expect(s.y, where).toBeGreaterThanOrEqual(0);
                expect(s.x + s.w, where).toBeLessThanOrEqual(SPRITE_WIDTH);
                expect(s.y + s.h, where).toBeLessThanOrEqual(SPRITE_HEIGHT);
              }
            }
          }
        }
      }
    }
  });

  it("only paints palette colors", () => {
    for (const jobId of JOB_IDS) {
      for (const team of TEAMS) {
        for (const view of DRAWN_VIEWS) {
          for (const color of placeholderColors(jobId, team, view)) {
            expect(PALETTE_COLORS.has(color), `${jobId}/${team}: ${color}`).toBe(true);
          }
        }
      }
    }
  });

  it("carries shadow, body, head and tint roles in every frame", () => {
    for (const jobId of JOB_IDS) {
      for (const state of ANIM_STATES) {
        for (const frame of buildPlaceholder(jobId, "player", state).frames) {
          const roles = new Set(frame.shapes.map((s) => s.role));
          for (const required of ["shadow", "body", "head", "tint"] as const) {
            expect(roles.has(required), `${jobId}/${state}/${frame.index}/${required}`).toBe(true);
          }
        }
      }
    }
  });

  it("stands the figure on the anchor line", () => {
    for (const jobId of JOB_IDS) {
      const [first] = buildPlaceholder(jobId, "player", "idle").frames;
      const legs = (first?.shapes ?? []).filter((s) => s.role === "body");
      expect(Math.max(...legs.map((s) => s.y + s.h))).toBe(SPRITE_ANCHOR.y);
      const shadow = (first?.shapes ?? []).filter((s) => s.role === "shadow");
      expect(shadow.every((s) => s.y >= SPRITE_ANCHOR.y)).toBe(true);
    }
  });

  it("distinguishes every job from every other in its idle frame", () => {
    const sigs = JOB_IDS.map((id) => signature(buildPlaceholder(id, "player", "idle").frames[0]!.shapes));
    expect(new Set(sigs).size).toBe(JOB_IDS.length);
  });

  it("distinguishes the two drawn views", () => {
    for (const jobId of JOB_IDS) {
      const se = signature(buildPlaceholder(jobId, "player", "idle", "se").frames[0]!.shapes);
      const ne = signature(buildPlaceholder(jobId, "player", "idle", "ne").frames[0]!.shapes);
      expect(se, jobId).not.toBe(ne);
    }
  });
});

describe("team tinting", () => {
  it("applies the team's tint colors and nothing else's", () => {
    for (const jobId of JOB_IDS) {
      for (const team of TEAMS) {
        const frame = buildPlaceholder(jobId, team, "idle").frames[0]!;
        const tintColors = new Set(
          frame.shapes.filter((s) => s.role === "tint").map((s) => s.color),
        );
        expect([...tintColors].sort(), `${jobId}/${team}`).toEqual(
          [TEAM_TINT[team].base, TEAM_TINT[team].shadow].sort(),
        );
        for (const other of TEAMS) {
          if (other === team) continue;
          const foreign = TEAM_TINT[other].base as Hex;
          if (foreign === TEAM_TINT[team].base || foreign === TEAM_TINT[team].shadow) continue;
          const nonTint = frame.shapes.filter((s) => s.role !== "tint");
          expect(nonTint.map((s) => s.color)).not.toContain(foreign);
        }
      }
    }
  });

  it("changes only tint pixels between teams", () => {
    for (const jobId of JOB_IDS) {
      const strip = (team: (typeof TEAMS)[number]) =>
        signature(
          buildPlaceholder(jobId, team, "idle").frames[0]!.shapes.filter((s) => s.role !== "tint"),
        );
      expect(strip("player"), jobId).toBe(strip("enemy"));
      expect(strip("player"), jobId).toBe(strip("neutral"));
    }
  });
});

describe("animation transforms", () => {
  it("moves the figure between walk frames", () => {
    for (const jobId of JOB_IDS) {
      const frames = buildPlaceholder(jobId, "player", "walk").frames;
      const sigs = frames.map((f) => signature(f.shapes));
      expect(new Set(sigs).size, jobId).toBeGreaterThan(1);
    }
  });

  it("flattens the figure across downed frames", () => {
    for (const jobId of JOB_IDS) {
      const frames = buildPlaceholder(jobId, "player", "downed").frames;
      const topOf = (i: number) =>
        Math.min(...frames[i]!.shapes.filter((s) => s.role !== "shadow").map((s) => s.y));
      expect(topOf(frames.length - 1), jobId).toBeGreaterThan(topOf(0));
    }
  });

  it("flashes the body on the first hurt frame only", () => {
    const frames = buildPlaceholder("enforcer", "player", "hurt").frames;
    const bodyColors = (i: number) =>
      new Set(frames[i]!.shapes.filter((s) => s.role === "body").map((s) => s.color));
    expect(bodyColors(0)).toEqual(new Set([PALETTE["blood-300"]]));
    expect(bodyColors(1)).not.toEqual(new Set([PALETTE["blood-300"]]));
  });

  it("grows emissive blocks while casting", () => {
    const area = (frameIndex: number) =>
      buildPlaceholder("conduit", "player", "cast")
        .frames[frameIndex]!.shapes.filter((s) => s.role === "emissive")
        .reduce((sum, s) => sum + s.w * s.h, 0);
    expect(area(4)).toBeGreaterThan(area(0));
  });

  it("extends the weapon at the attack strike frame", () => {
    const weaponRight = (frameIndex: number) =>
      Math.max(
        ...buildPlaceholder("enforcer", "player", "attack")
          .frames[frameIndex]!.shapes.filter((s) => s.role === "weapon")
          .map((s) => s.x + s.w),
      );
    expect(weaponRight(2)).toBeGreaterThan(weaponRight(0));
  });
});

describe("drawing", () => {
  it("issues one fillRect per shape in order", () => {
    const clip = buildPlaceholder("machinist", "enemy", "idle");
    const { ctx, calls } = recordingContext();
    drawToCanvas(ctx, clip, 0);
    const shapes = clip.frames[0]!.shapes;
    expect(calls).toHaveLength(shapes.length);
    calls.forEach((call, i) => {
      const s = shapes[i]!;
      expect(call).toEqual({ color: s.color, x: s.x, y: s.y, w: s.w, h: s.h });
    });
  });

  it("honors origin and scale", () => {
    const clip = buildPlaceholder("chemist", "player", "idle");
    const { ctx, calls } = recordingContext();
    drawToCanvas(ctx, clip, 0, { originX: 10, originY: 20, scale: 3 });
    const s = clip.frames[0]!.shapes[0]!;
    expect(calls[0]).toEqual({
      color: s.color,
      x: 10 + s.x * 3,
      y: 20 + s.y * 3,
      w: s.w * 3,
      h: s.h * 3,
    });
  });

  it("mirrors horizontally about the canvas center", () => {
    const clip = buildPlaceholder("railrunner", "player", "idle");
    const { ctx, calls } = recordingContext();
    drawShapes(ctx, clip.frames[0]!.shapes, { mirrored: true });
    clip.frames[0]!.shapes.forEach((s, i) => {
      expect(calls[i]!.x).toBe(SPRITE_WIDTH - (s.x + s.w));
      expect(calls[i]!.y).toBe(s.y);
    });
  });

  it("mirroring twice is the identity", () => {
    const clip = buildPlaceholder("saboteur", "neutral", "walk");
    const once = recordingContext();
    drawShapes(once.ctx, clip.frames[2]!.shapes, { mirrored: true });
    const twice = recordingContext();
    drawShapes(twice.ctx, clip.frames[2]!.shapes, { mirrored: false });
    once.calls.forEach((c, i) => {
      expect(SPRITE_WIDTH - (c.x + c.w)).toBe(twice.calls[i]!.x);
    });
  });

  it("throws on an out-of-range frame", () => {
    const clip = buildPlaceholder("augmented", "player", "hurt");
    const { ctx } = recordingContext();
    expect(() => drawToCanvas(ctx, clip, clip.frames.length)).toThrow(RangeError);
  });
});
