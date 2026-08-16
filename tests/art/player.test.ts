import { describe, expect, it } from "vitest";
import { AnimationPlayer, frameEndTick, frameStartTick } from "../../src/art/player.js";
import {
  ANIMATIONS,
  TICKS_PER_SECOND,
  clipDurationTicks,
  frameAtTick,
} from "../../src/art/sprites.js";

const framesOver = (player: AnimationPlayer, ticks: number): string[] => {
  const seen: string[] = [];
  for (let i = 0; i < ticks; i += 1) {
    seen.push(`${player.state}:${player.frame}`);
    player.advance(1);
  }
  return seen;
};

describe("tick arithmetic", () => {
  it("locates frame boundaries from the tick tables", () => {
    expect(frameStartTick("attack", 0)).toBe(0);
    expect(frameStartTick("attack", 2)).toBe(10);
    expect(frameEndTick("attack", 2)).toBe(13);
    expect(frameStartTick("cast", 2)).toBe(12);
    expect(frameEndTick("cast", 3)).toBe(32);
    expect(frameStartTick("idle", 4)).toBe(clipDurationTicks("idle"));
  });
});

describe("looping states", () => {
  it("plays idle forever, honoring the 14/14/12/14 table", () => {
    const player = new AnimationPlayer();
    expect(player.state).toBe("idle");
    const seen = framesOver(player, clipDurationTicks("idle"));
    expect(seen.filter((s) => s === "idle:0")).toHaveLength(14);
    expect(seen.filter((s) => s === "idle:2")).toHaveLength(12);
    expect(player.frame).toBe(0);
    expect(player.isFinished).toBe(false);
  });

  it("cycles walk through six frames of six ticks", () => {
    const player = new AnimationPlayer();
    player.play("walk");
    for (let frame = 0; frame < 6; frame += 1) {
      expect(player.frame).toBe(frame);
      player.advance(6);
    }
    expect(player.frame).toBe(0);
    expect(player.state).toBe("walk");
  });
});

describe("one-shot states", () => {
  it("returns to the rest state when attack ends", () => {
    const player = new AnimationPlayer();
    player.play("attack");
    player.advance(clipDurationTicks("attack") - 1);
    expect(player.state).toBe("attack");
    expect(player.frame).toBe(4);
    player.advance(1);
    expect(player.state).toBe("idle");
    expect(player.frame).toBe(0);
    expect(player.isFinished).toBe(true);
  });

  it("holds the last downed frame forever", () => {
    const player = new AnimationPlayer();
    player.play("downed");
    player.advance(clipDurationTicks("downed") * 10);
    expect(player.state).toBe("downed");
    expect(player.frame).toBe(ANIMATIONS.downed.frames - 1);
    expect(player.isFinished).toBe(true);
    expect(player.restState).toBe("downed");
  });

  it("plays hurt then rests", () => {
    const player = new AnimationPlayer();
    player.play("hurt");
    expect(player.frame).toBe(0);
    player.advance(4);
    expect(player.frame).toBe(1);
    player.advance(14);
    expect(player.state).toBe("idle");
  });

  it("keeps a downed unit down after a one-shot", () => {
    const player = new AnimationPlayer("downed");
    expect(player.restState).toBe("downed");
    player.play("hurt");
    player.advance(clipDurationTicks("hurt"));
    expect(player.state).toBe("downed");
  });
});

describe("cast hold loop", () => {
  it("repeats frames 2-3 while a charged action waits", () => {
    const player = new AnimationPlayer();
    player.play("cast", { hold: true });
    expect(player.isHolding).toBe(true);
    player.advance(frameStartTick("cast", 2));
    expect(player.frame).toBe(2);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i += 1) {
      player.advance(1);
      seen.add(player.frame);
    }
    expect([...seen].sort()).toEqual([2, 3]);
    expect(player.state).toBe("cast");
  });

  it("runs on to the release frames once released", () => {
    const player = new AnimationPlayer();
    player.play("cast", { hold: true });
    player.advance(120);
    player.release();
    expect(player.isHolding).toBe(false);
    player.advance(frameEndTick("cast", 3) - frameStartTick("cast", 2));
    expect(player.state === "cast" ? player.frame : -1).toBeGreaterThanOrEqual(4);
    player.advance(clipDurationTicks("cast"));
    expect(player.state).toBe("idle");
  });

  it("plays straight through when not holding", () => {
    const player = new AnimationPlayer();
    player.play("cast");
    player.advance(clipDurationTicks("cast"));
    expect(player.state).toBe("idle");
  });
});

describe("clock", () => {
  it("advances seconds at 60 ticks per second", () => {
    const player = new AnimationPlayer();
    player.play("walk");
    player.advanceSeconds(6 / TICKS_PER_SECOND);
    expect(player.frame).toBe(1);
    expect(player.elapsedTicks).toBe(6);
  });

  it("ignores non-positive deltas", () => {
    const player = new AnimationPlayer();
    player.play("walk");
    player.advance(0);
    player.advance(-5);
    expect(player.elapsedTicks).toBe(0);
  });

  it("agrees with frameAtTick", () => {
    const player = new AnimationPlayer();
    player.play("cast");
    for (let tick = 0; tick < clipDurationTicks("cast"); tick += 1) {
      expect(player.frame).toBe(frameAtTick("cast", tick));
      player.advance(1);
    }
  });
});
