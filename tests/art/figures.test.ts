// Spec conformance for every generated frame: 7 jobs x 2 views x 6 states.
// These assert ART_DIRECTION §3 and §4 directly — canvas, anchor, palette
// discipline, amber scarcity, team-tint rules, mirror safety. The per-frame
// sweeps live in figures.<job>.test.ts so vitest runs them in parallel; what
// stays here is whole-roster: the frame-count guard and the tint constants.

import { describe, expect, it } from "vitest";
import { JOB_ART, JOB_IDS } from "../../src/art/jobs.js";
import { PALETTE, TEAM_TINT } from "../../src/art/palette.js";
import { basePose, poseFor } from "../../src/art/rig.js";
import { ANIMATIONS, ANIM_STATES, DRAWN_VIEWS } from "../../src/art/sprites.js";
import { allFrames, shardedJobs } from "./figuresSuite.js";

const FRAMES = allFrames();

describe("roster", () => {
  it("covers the seven slice jobs, each with a documented read", () => {
    expect([...JOB_IDS]).toEqual([
      "enforcer",
      "machinist",
      "conduit",
      "saboteur",
      "chemist",
      "augmented",
      "railrunner",
    ]);
    for (const jobId of JOB_IDS) {
      expect(JOB_ART[jobId].id).toBe(jobId);
      expect(JOB_ART[jobId].read.length).toBeGreaterThan(10);
    }
  });

  it("draws exactly the frames the tick tables declare", () => {
    expect(FRAMES).toHaveLength(
      JOB_IDS.length * DRAWN_VIEWS.length * ANIM_STATES.reduce((n, s) => n + ANIMATIONS[s].frames, 0),
    );
    for (const state of ANIM_STATES) {
      expect(ANIMATIONS[state].ticks).toHaveLength(ANIMATIONS[state].frames);
      expect(() => poseFor(JOB_ART.enforcer, state, ANIMATIONS[state].frames)).toThrow(RangeError);
      expect(basePose(state, 0)).toBeDefined();
    }
  });

  it("sweeps every job through a per-frame shard file", () => {
    expect([...shardedJobs()].sort()).toEqual([...JOB_IDS].sort());
  });
});

describe("team tint", () => {
  it("uses steel for the player and world ramps for everyone else", () => {
    expect(TEAM_TINT.player.base).toBe(PALETTE["steel-400"]);
    expect(TEAM_TINT.enemy.base).toBe(PALETTE["blood-300"]);
    expect(TEAM_TINT.neutral.base).toBe(PALETTE["soot-100"]);
  });
});
