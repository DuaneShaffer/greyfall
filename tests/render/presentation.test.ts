import { describe, expect, it } from "vitest";
import {
  PresentationQueue,
  instantAnimation,
  type Animation,
  type RenderEvent,
} from "../../src/render/presentation.js";

interface Recorder {
  log: string[];
  factory: (event: RenderEvent) => Animation | null;
}

const recorder = (durations: Partial<Record<RenderEvent["kind"], number>> = {}): Recorder => {
  const log: string[] = [];
  const factory = (event: RenderEvent): Animation | null => {
    const duration = durations[event.kind] ?? 1;
    log.push(`start:${event.kind}`);
    return {
      duration,
      update: () => {},
      finish: () => log.push(`finish:${event.kind}`),
    };
  };
  return { log, factory };
};

const moved: RenderEvent = {
  kind: "unitMoved",
  unitId: "rowen",
  path: [{ x: 0, y: 0 }],
  facing: "north",
};
const hit: RenderEvent = {
  kind: "unitHit",
  unitId: "enemy",
  amount: 3,
  hpFractionAfter: 0.5,
  damageType: "kinetic",
  sourceUnitId: "rowen",
};
const destroyed: RenderEvent = { kind: "objectDestroyed", objectId: "crate-stack" };
const powered: RenderEvent = {
  kind: "objectPowerChanged",
  objectId: "freight-lift",
  powered: false,
};

describe("presentation queue", () => {
  it("starts idle and reports pending work", () => {
    const { factory } = recorder();
    const queue = new PresentationQueue(factory);

    expect(queue.isIdle).toBe(true);
    queue.pushAll([moved, hit]);
    expect(queue.pendingCount).toBe(2);
    expect(queue.isIdle).toBe(false);
  });

  it("plays one animation at a time, in order", () => {
    const { log, factory } = recorder();
    const queue = new PresentationQueue(factory);
    queue.pushAll([moved, hit, destroyed]);

    queue.update(0.5);
    expect(log).toEqual(["start:unitMoved"]);
    expect(queue.currentEvent).toEqual(moved);

    queue.update(0.5);
    expect(log).toEqual(["start:unitMoved", "finish:unitMoved", "start:unitHit"]);

    queue.update(1);
    queue.update(1);
    expect(queue.isIdle).toBe(true);
    expect(queue.played.map((event) => event.kind)).toEqual([
      "unitMoved",
      "unitHit",
      "objectDestroyed",
    ]);
  });

  it("carries leftover delta into the next animation", () => {
    const { log, factory } = recorder({ unitMoved: 0.2, unitHit: 0.2 });
    const queue = new PresentationQueue(factory);
    queue.pushAll([moved, hit]);

    queue.update(0.5);

    expect(log).toEqual([
      "start:unitMoved",
      "finish:unitMoved",
      "start:unitHit",
      "finish:unitHit",
    ]);
    expect(queue.isIdle).toBe(true);
  });

  it("runs zero-duration animations the moment they start", () => {
    const log: string[] = [];
    const queue = new PresentationQueue(() => instantAnimation(() => log.push("applied")));
    queue.push(powered);

    queue.update(0);

    expect(log).toEqual(["applied"]);
    expect(queue.isIdle).toBe(true);
  });

  it("skip() finishes everything in order and leaves the queue idle", () => {
    const { log, factory } = recorder();
    const queue = new PresentationQueue(factory);
    queue.pushAll([moved, hit, destroyed, powered]);
    queue.update(0.3);

    queue.skip();

    expect(log).toEqual([
      "start:unitMoved",
      "finish:unitMoved",
      "start:unitHit",
      "finish:unitHit",
      "start:objectDestroyed",
      "finish:objectDestroyed",
      "start:objectPowerChanged",
      "finish:objectPowerChanged",
    ]);
    expect(queue.isIdle).toBe(true);
    expect(queue.pendingCount).toBe(0);
  });

  it("skipCurrent() only finishes the running animation", () => {
    const { log, factory } = recorder();
    const queue = new PresentationQueue(factory);
    queue.pushAll([moved, hit]);
    queue.update(0.1);

    queue.skipCurrent();

    expect(log).toEqual(["start:unitMoved", "finish:unitMoved"]);
    expect(queue.pendingCount).toBe(1);
    expect(queue.isIdle).toBe(false);
  });

  it("drops events whose factory declines to animate them", () => {
    const log: string[] = [];
    const queue = new PresentationQueue((event) =>
      event.kind === "unitHit" ? null : instantAnimation(() => log.push(event.kind)),
    );
    queue.pushAll([moved, hit, destroyed]);

    queue.update(0);

    expect(log).toEqual(["unitMoved", "objectDestroyed"]);
    expect(queue.played.map((event) => event.kind)).toEqual([
      "unitMoved",
      "unitHit",
      "objectDestroyed",
    ]);
    expect(queue.isIdle).toBe(true);
  });

  it("reset() abandons pending work without applying it", () => {
    const { log, factory } = recorder();
    const queue = new PresentationQueue(factory);
    queue.pushAll([moved, hit]);
    queue.update(0.2);

    queue.reset();

    expect(log).toEqual(["start:unitMoved"]);
    expect(queue.isIdle).toBe(true);
  });

  it("applies terminal state exactly once per event", () => {
    const finishes: string[] = [];
    const queue = new PresentationQueue((event) => ({
      duration: 0.5,
      update: () => {},
      finish: () => finishes.push(event.kind),
    }));
    queue.push(destroyed);
    queue.update(0.6);
    queue.skip();
    queue.update(1);

    expect(finishes).toEqual(["objectDestroyed"]);
  });
});
